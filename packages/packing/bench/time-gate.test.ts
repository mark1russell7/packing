import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { checkTimeGate, gateMarkdown, gateValue, noiseCap, parseTimeGate, spreadLimit, type TimeGate } from "./time-gate.ts";
import { pairedArgs } from "./time-gate-run.ts";

const derivation = { runs: ["r1", "r2", "r3", "r4", "r5"], cpus: ["c", "c", "c", "c", "c"], values: [1.8, 2, 1.9, 1.7, 1.95], worst: 2, spread: 0.3 };
const GATE: TimeGate = {
  schema: "packing-time-gate/2",
  id: "test-time",
  item: "k0",
  rule: "test",
  corpus: "set-v1",
  mode: "process",
  base: "a",
  arm: "b",
  checks: [{ measure: "median", max: 2.3, derivation }],
  reports: [{ measure: "q95", values: [3, 4, 5, 3, 4], why: "test" }],
  aa: { median: [1, 1, 1, 1, 1], p10: [0.9, 0.9, 0.9, 0.9, 0.9], p90: [1.1, 1.1, 1.1, 1.1, 1.1] },
  noise: { factor: 3, spreads: [0.2, 0.2, 0.2, 0.2, 0.2], quiet: 0.2, cap: 0.6 },
};

/** This function makes a made-up report: the arm `b` has the ratio of each value on its input. */
function report(ratios: number[], over: Partial<PairedReport> = {}): PairedReport {
  const inputs = ratios.map((r, i) => ({ id: `i${i}`, group: "all", ms: {}, median: {}, ratio: { b: r, "a~aa": 1 } }));
  const median = [...ratios].sort((x, y) => x - y)[Math.floor(ratios.length / 2)]!;
  return {
    schema: "paired-time/1",
    mode: "process",
    env: { cpu: "Test CPU", cores: 1, os: "test", arch: "x64", node: "v0" },
    base: "a",
    arms: ["a", "b", "a~aa"],
    inputs,
    ratios: { b: { inputs: ratios.length, median, p10: 0, p90: 0, moved: 1, groups: {}, groupMean: median, groupSD: 0 } },
    noiseFloor: { median: 1, p10: 0.95, p90: 1.05 },
    ...over,
  } as PairedReport;
}

describe("checkTimeGate", () => {
  it("passes a report with the median at most the limit, and reports the q95", () => {
    const result = checkTimeGate(GATE, report([1, 2, 2.1]), "set-v1");
    expect(result.pass).toBe(true);
    expect(result.lines.map((l) => [l.measure, l.max])).toEqual([["aa.median", null], ["aa.spread", 0.6], ["median", 2.3], ["q95", null]]);
    expect(result.verdict).toBe("pass");
    expect(gateMarkdown(result)).toContain("| median | 2.0000 | 2.3000 | pass |");
  });

  it("fails a report with the median above the limit", () => {
    const result = checkTimeGate(GATE, report([2.3, 2.4, 2.5]), "set-v1");
    expect(result.pass).toBe(false);
    expect(result.refused).toEqual([]);
    expect(gateMarkdown(result)).toContain("| median | 2.4000 | 2.3000 | fail |");
  });

  it("refuses a report of another test, without the A/A arm or with an A/A band off 1", () => {
    expect(checkTimeGate(GATE, report([1]), "set-v2").refused).toEqual(["the corpus is set-v2, not set-v1"]);
    expect(checkTimeGate(GATE, report([1], { mode: "fresh" }), "set-v1").refused).toEqual(["the mode is fresh, not process"]);
    expect(checkTimeGate(GATE, report([1], { noiseFloor: null }), "set-v1").refused).toEqual(["the report has no A/A arm"]);
    expect(checkTimeGate(GATE, report([1]), "set-v1", ".fixed.").refused).toEqual(["the run uses only the inputs with .fixed. in their id"]);
    const wide = checkTimeGate(GATE, report([1], { noiseFloor: { median: 1.06, p10: 1.01, p90: 1.1 } }), "set-v1");
    expect(wide.pass).toBe(false);
    expect(wide.refused).toEqual(["the A/A band 1.01 to 1.1 does not contain 1"]);
  });

  it("cannot decide on a run above the noise cap, and fails a second noisy run", () => {
    const noisy = { noiseFloor: { median: 1, p10: 0.6, p90: 1.3 } };
    const first = checkTimeGate(GATE, report([1, 2, 2.1], noisy), "set-v1");
    expect(first.verdict).toBe("cannot-decide");
    expect(first.pass).toBe(false);
    expect(first.lines.find((l) => l.measure === "aa.spread")).toEqual({ measure: "aa.spread", value: 0.7, max: 0.6, pass: false });
    expect(gateMarkdown(first)).toContain("one more run on a fresh runner");
    expect(checkTimeGate(GATE, report([1, 2, 2.1], noisy), "set-v1", undefined, undefined, true).verdict).toBe("fail");
    expect(checkTimeGate(GATE, report([2.3, 2.4, 2.5]), "set-v1").verdict).toBe("fail");
    expect(checkTimeGate(GATE, report([1], { ...noisy, mode: "fresh" }), "set-v1").verdict).toBe("fail");
  });

  it("gives the noise cap as 3 times the median A/A spread, rounded up", () => {
    expect(noiseCap({ median: [], p10: [0.9, 0.97, 0.96, 0.95, 0.8], p90: [1.05, 1.02, 1.04, 1.03, 1.07] })).toEqual({ factor: 3, spreads: [0.15, 0.05, 0.08, 0.08, 0.27], quiet: 0.08, cap: 0.24 });
  });

  it("gives the q95 of the ratios of the arm", () => {
    expect(gateValue(report([1, 2, 3, 4, 5]), "b", "q95")).toBeCloseTo(4.8);
    expect(gateValue(report([1]), "c", "median")).toBeNaN();
  });
});

/** A gate of the k130 shape: the arm `c` over the sum of `a` and `b`, on all the inputs, with the steady inputs as a report. */
const SUM: TimeGate = {
  ...GATE,
  id: "sum-time",
  mode: "fresh",
  arm: "c",
  only: ".fixed.",
  warmup: 5000,
  passes: 200,
  members: ["a", "b"],
  steady: ["a", "b", "c"],
  checks: [{ measure: "sum-median", max: 1.5, derivation: { runs: derivation.runs, cpus: derivation.cpus, values: [1.3, 1.25, 1.35, 1.32, 1.28], worst: 1.35, spread: 0.1 } }],
  reports: [{ measure: "sum-median", steady: true, values: [1.2, 1.2, 1.2, 1.2, 1.2], why: "test" }],
};

/** This function makes a made-up report of mode fresh: each input has the times of `a`, `b` and `c`, and a warm value of `c`. */
function fresh(rows: { a: number; b: number; c: number; warm: number }[], over: Partial<PairedReport> = {}): PairedReport {
  const inputs = rows.map((r, i) => ({
    id: `i${i}`,
    group: "all",
    ms: {},
    median: { a: r.a, b: r.b, c: r.c },
    ratio: { b: r.b / r.a, c: r.c / r.a, "a~aa": 1 },
    warm: { a: 1, b: 1, c: r.warm, "a~aa": 1 },
  }));
  return report([], { mode: "fresh", passes: 200, arms: ["a", "b", "c", "a~aa"], inputs, warm: {}, ...over } as Partial<PairedReport>);
}

describe("the sum measure on the steady inputs (k130)", () => {
  // The input i2 has the warm value 1.5 of c, outside the A/A band 0.95 to 1.05. Thus the steady measures do not use it.
  const rows = [
    { a: 1, b: 2, c: 3.6, warm: 1 },
    { a: 1, b: 1, c: 2.8, warm: 1.02 },
    { a: 1, b: 1, c: 9, warm: 1.5 },
  ];

  it("gives the median of c / (a + b) and of c / a over the steady inputs", () => {
    expect(gateValue(fresh(rows), "c", "sum-median", SUM)).toBeCloseTo(1.3);
    expect(gateValue(fresh(rows), "c", "sum-median", { members: ["a", "b"] })).toBeCloseTo(1.4);
    expect(gateValue(fresh(rows), "c", "median", SUM)).toBeCloseTo(3.2);
    expect(gateValue(fresh(rows), "c", "sum-median", { members: ["a", "nope"] })).toBeNaN();
    expect(gateValue(fresh(rows), "c", "sum-median")).toBeNaN();
  });

  it("gates on all the inputs, and reports the steady measure and the count of steady inputs", () => {
    const result = checkTimeGate(SUM, fresh(rows), "set-v1", ".fixed.", 5000);
    expect([result.pass, result.refused]).toEqual([true, []]);
    expect(result.lines.map((l) => [l.measure, l.max])).toEqual([["aa.median", null], ["aa.spread", 0.6], ["steady.inputs", null], ["sum-median", 1.5], ["sum-median", null]]);
    expect(gateMarkdown(result)).toContain("| steady.inputs | 2 | report | - |");
    expect(gateMarkdown(result)).toContain("| sum-median | 1.4000 | 1.5000 | pass |");
    expect(gateMarkdown(result)).toContain("| sum-median (steady) | 1.3000 | report | - |");
  });

  it("refuses a run with another filter, warm-up or count of passes, without the warm check or with an A/A band off 1", () => {
    expect(checkTimeGate(SUM, fresh(rows), "set-v1", undefined, 5000).refused).toEqual(["the run uses all the inputs, not only the inputs with .fixed. in their id"]);
    expect(checkTimeGate(SUM, fresh(rows), "set-v1", ".fixed.", 1000).refused).toEqual(["the warm-up is 1000, not 5000"]);
    expect(checkTimeGate(SUM, fresh(rows, { passes: 1 }), "set-v1", ".fixed.", 5000).refused).toEqual(["the timed passes are 1, not 200"]);
    const cold = fresh(rows);
    delete cold.warm;
    expect(checkTimeGate(SUM, cold, "set-v1", ".fixed.", 5000).refused).toEqual(["the report has no warm check"]);
    const off = fresh(rows, { noiseFloor: { median: 1.02, p10: 1.01, p90: 1.05 } });
    expect(checkTimeGate(SUM, off, "set-v1", ".fixed.", 5000).refused).toEqual(["the A/A band 1.01 to 1.05 does not contain 1"]);
  });
});

describe("parseTimeGate", () => {
  it("refuses a limit that is not its worst value plus its spread, and the schema 1", () => {
    expect(() => parseTimeGate(JSON.stringify(GATE))).not.toThrow();
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.5, derivation }] }))).toThrow("worst value plus its spread");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.3, derivation: { ...derivation, values: [2] } }] }))).toThrow("5 runs");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, schema: "packing-time-gate/1" }))).toThrow("packing-time-gate/2");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, noise: undefined }))).toThrow("noise cap");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, noise: { ...GATE.noise, cap: 0.5 } }))).toThrow("median A/A spread");
  });

  it("gives the worst value plus the spread, rounded up", () => {
    expect(spreadLimit([1.3, 1.25, 1.35, 1.32, 1.28])).toBe(1.45);
    expect(spreadLimit([1.298368, 1.379478, 1.370108, 1.380365, 1.306407])).toBe(1.4624);
    expect(spreadLimit([1.00001, 1])).toBe(1.0001);
    expect(spreadLimit([1.23456, 1], 2)).toBe(1.47);
  });

  it("refuses a limit that is not its worst value plus its spread", () => {
    const check = SUM.checks[0]!;
    const sum = (max: number, d: object = {}) => JSON.stringify({ ...SUM, checks: [{ ...check, max, derivation: { ...check.derivation, ...d } }] });
    // The worst value 1.35 plus the spread 0.1 is 1.45
    expect(() => parseTimeGate(sum(1.45))).not.toThrow();
    expect(() => parseTimeGate(sum(1.5))).toThrow("worst value plus its spread");
    expect(() => parseTimeGate(sum(1.45, { spread: 0.2 }))).toThrow("The spread of sum-median is");
    expect(() => parseTimeGate(sum(1.45, { spread: undefined }))).toThrow("has no spread");
    expect(() => parseTimeGate(JSON.stringify({ ...JSON.parse(sum(1.45)), members: [] }))).toThrow("needs the members");
    const { steady: _arms, ...noArms } = JSON.parse(sum(1.45)) as TimeGate;
    expect(() => parseTimeGate(JSON.stringify(noArms))).toThrow("needs the arms of the warm rule");
  });

  it("reads the gate record of k66", () => {
    const gate = parseTimeGate(readFileSync(join(import.meta.dirname, "gates", "k66-time.json"), "utf8"));
    expect(gate.checks.map((c) => [c.measure, c.max])).toEqual([["median", 2.6419]]);
    expect(gate.reports.map((r) => r.measure)).toEqual(["q95"]);
  });

  it("reads the gate record of k130", () => {
    const gate = parseTimeGate(readFileSync(join(import.meta.dirname, "gates", "k130-time.json"), "utf8"));
    expect(gate.checks.map((c) => [c.measure, c.max, c.derivation.worst, c.derivation.spread])).toEqual([["sum-median", 1.4624, 1.380365, 0.081997]]);
    expect(gate.reports.map((r) => [r.measure, r.steady === true])).toEqual([["sum-median", true], ["median", false]]);
    expect([gate.mode, gate.only, gate.warmup, gate.passes, gate.members, gate.steady]).toEqual(["fresh", ".fixed.", 5000, 200, ["rows", "maxrects-bl"], ["rows", "maxrects-bl", "portfolio-fill-rows-bl"]]);
  });
});

describe("pairedArgs", () => {
  it("gives the paired run of a gate record, with its filter and passes", () => {
    const text = JSON.stringify({ ...GATE, only: ".fixed.", passes: 200, warmup: 5000, members: ["a", "c"] });
    expect(pairedArgs(text, "3", "out", "abc1234")).toEqual([
      "paired",
      ...["--corpus", "set-v1", "--arms", "a,c,b", "--prediction", "gate-test-time", "--mode", "process"],
      ...["--repeats", "3", "--warmup", "5000", "--only", ".fixed.", "--passes", "200", "--commit", "abc1234", "--out", "out"],
    ]);
    expect(pairedArgs(JSON.stringify(GATE), "5", "o", "s")).not.toContain("--only");
  });
});
