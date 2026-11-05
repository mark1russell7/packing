import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { checkTimeGate, deriveTimeGate, gateMarkdown, gateValue, noiseCap, pairRecords, parseTimeGate, spreadLimit, type TimeGate } from "./time-gate.ts";
import { pairedArgs } from "./time-gate-run.ts";

const derivation = { runs: ["r1", "r2", "r3", "r4", "r5"], cpus: ["c", "c", "c", "c", "c"], values: [1.8, 2, 1.9, 1.7, 1.95], worst: 2, spread: 0.3 };
const GATE: TimeGate = {
  schema: "packing-time-gate/3",
  id: "test-time",
  item: "k0",
  rule: "test",
  corpus: "set-v1",
  mode: "process",
  base: "a",
  arm: "b",
  checks: [{ measure: "median", max: 2.3, derivation }],
  reports: [{ measure: "q95", values: [3, 4, 5, 3, 4], why: "test" }],
  aa: { median: [1, 1, 1, 1, 1], noise: [0.02, 0.02, 0.02, 0.02, 0.02] },
  noise: { factor: 3, level: 0.8, quiet: 0.02, cap: 0.06 },
};

/** The A/A ratios of a quiet run: an A/A noise near 0.02 */
const QUIET = [1.02, 0.98, 1, 1.01, 0.99];
/** The A/A ratios of a noisy run: an A/A noise near 0.3 */
const NOISY = [1.3, 0.7, 1, 1.2, 0.8];

/** This function makes the times of 3 rounds with the ratio `r` to the time 10 of the base. */
const rounds = (r: number): number[] => [10 * r, 10 * r, 10 * r];

/** This function makes a made-up report of 3 rounds: the arm `b` has the ratio of each value on its input, and the A/A arm the ratios of `aa`. */
function report(ratios: number[], over: Partial<PairedReport> = {}, aa: number[] = QUIET): PairedReport {
  const inputs = ratios.map((r, i) => ({ id: `i${i}`, group: "all", ms: { a: rounds(1), b: rounds(r), "a~aa": rounds(aa[i % aa.length]!) }, median: {}, ratio: { b: r, "a~aa": 1 } }));
  return {
    schema: "paired-time/3",
    mode: "process",
    env: { cpu: "Test CPU", cores: 1, os: "test", arch: "x64", node: "v0" },
    base: "a",
    arms: ["a", "b", "a~aa"],
    inputs,
    ratios: {},
    noiseFloor: { median: 1, p10: 0.95, p90: 1.05 },
    ...over,
  } as PairedReport;
}

describe("pairRecords", () => {
  it("gives one record of rigor-bench for each input and round, with the arm that ran first", () => {
    const records = pairRecords(report([2]), report([2]).inputs, "b");
    // The order of the home: [a, b, a~aa], its reverse, then [b, a~aa, a]
    expect(records).toEqual([
      { case: "i0", round: 0, first: "a", a: 10, b: 20 },
      { case: "i0", round: 1, first: "b", a: 10, b: 20 },
      { case: "i0", round: 2, first: "b", a: 10, b: 20 },
    ]);
  });
});

describe("checkTimeGate", () => {
  it("refuses a report of an older schema, and names the schema", () => {
    const old = report([1.95, 2, 2, 2.1, 1.9], { schema: "paired-time/2" } as unknown as Partial<PairedReport>);
    const result = checkTimeGate(GATE, old, "set-v1");
    expect(result.verdict).toBe("fail");
    expect(result.refused.join(" ")).toContain("the schema paired-time/2");
  });

  it("passes a report with the median at most the limit, and reports the q95 and the time verdict", () => {
    const result = checkTimeGate(GATE, report([1.95, 2, 2, 2.1, 1.9]), "set-v1");
    expect([result.pass, result.verdict, result.time]).toEqual([true, "pass", "slower"]);
    expect(result.lines.map((l) => [l.measure, l.max])).toEqual([["aa.median", null], ["aa.noise", 0.06], ["median", 2.3], ["q95", null]]);
    expect(gateMarkdown(result)).toContain("| median | 2.0000 | 2.3000 | pass |");
    expect(gateMarkdown(result)).toContain("time verdict of rigor-bench for the arm against the base: slower");
  });

  it("fails a report with the median above the limit", () => {
    const result = checkTimeGate(GATE, report([2.3, 2.4, 2.5, 2.4, 2.6]), "set-v1");
    expect([result.pass, result.verdict, result.refused]).toEqual([false, "fail", []]);
    expect(gateMarkdown(result)).toContain("| median | 2.4000 | 2.3000 | fail |");
  });

  it("cannot decide on a run above the noise cap, and fails a second noisy run", () => {
    const first = checkTimeGate(GATE, report([1, 2, 2, 2.1, 1.9], {}, NOISY), "set-v1");
    expect([first.pass, first.verdict]).toEqual([false, "cannot-decide"]);
    expect(first.lines.find((l) => l.measure === "aa.noise")?.pass).toBe(false);
    expect(gateMarkdown(first)).toContain("one more run on a fresh runner");
    // A noisy run decides nothing, also when a measure is above its limit
    expect(checkTimeGate(GATE, report([2.4, 2.4, 2.4, 2.4, 2.4], {}, NOISY), "set-v1").verdict).toBe("cannot-decide");
    expect(checkTimeGate(GATE, report([1, 2, 2, 2.1, 1.9], {}, NOISY), "set-v1", undefined, undefined, true).verdict).toBe("fail");
    // A shifted A/A arm is noisy too: the cap replaces the rule that the A/A band contains 1
    expect(checkTimeGate(GATE, report([1, 2, 2, 2.1, 1.9], {}, [1.2, 1.25, 1.3, 1.22, 1.28]), "set-v1").verdict).toBe("cannot-decide");
    expect(checkTimeGate(GATE, report([1], { mode: "fresh" }, NOISY), "set-v1").verdict).toBe("fail");
  });

  it("refuses a report of another test or without the A/A arm", () => {
    expect(checkTimeGate(GATE, report([1, 1, 1, 1, 1]), "set-v2").refused).toEqual(["the corpus is set-v2, not set-v1"]);
    expect(checkTimeGate(GATE, report([1, 1, 1, 1, 1], { mode: "fresh" }), "set-v1").refused).toEqual(["the mode is fresh, not process"]);
    expect(checkTimeGate(GATE, report([1, 1, 1, 1, 1], { arms: ["a", "b"] }), "set-v1").refused).toEqual(["the report has no A/A arm"]);
    expect(checkTimeGate(GATE, report([1, 1, 1, 1, 1]), "set-v1", ".fixed.").refused).toEqual(["the run uses only the inputs with .fixed. in their id"]);
  });

  it("refuses a report with too few A/A inputs for the band of rigor-bench", () => {
    const result = checkTimeGate(GATE, report([1, 2]), "set-v1");
    expect(result.verdict).toBe("fail");
    expect(result.refused[0]).toMatch(/^the A\/A records break a rule of rigor-bench: /);
  });

  it("gives the q95 of the ratios of the arm, and NaN for an arm without times", () => {
    expect(gateValue(report([1, 2, 3, 4, 5]), "b", "q95")).toBeCloseTo(4.8);
    expect(gateValue(report([1, 1, 1, 1, 1]), "c", "median")).toBeNaN();
  });

  it("gives the noise cap as 3 times the median A/A noise, rounded up", () => {
    expect(noiseCap([0.047, 0.027, 0.027, 0.031, 0.062])).toEqual({ factor: 3, level: 0.8, quiet: 0.031, cap: 0.093 });
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

/** This function makes a made-up report of mode fresh: each input has the times of `a`, `b` and `c` in 3 rounds, and a warm value of `c`. */
function fresh(rows: { a: number; b: number; c: number; warm: number }[], over: Partial<PairedReport> = {}): PairedReport {
  const inputs = rows.map((r, i) => ({
    id: `i${i}`,
    group: "all",
    ms: { a: rounds(r.a / 10), b: rounds(r.b / 10), c: rounds(r.c / 10), "a~aa": rounds(QUIET[i % QUIET.length]! * (r.a / 10)) },
    median: { a: r.a, b: r.b, c: r.c },
    ratio: {},
    warm: { a: 1, b: 1, c: r.warm, "a~aa": 1 },
  }));
  return report([], { mode: "fresh", passes: 200, arms: ["a", "b", "c", "a~aa"], inputs, warm: {}, ...over } as Partial<PairedReport>);
}

describe("the sum measure on the steady inputs (k130)", () => {
  // The inputs i2 and i4 have warm values of c outside the A/A band 0.95 to 1.05. Thus the steady measures do not use them.
  const rows = [
    { a: 1, b: 2, c: 3.6, warm: 1 },
    { a: 1, b: 1, c: 2.8, warm: 1.02 },
    { a: 1, b: 1, c: 9, warm: 1.5 },
    { a: 1, b: 1, c: 2.6, warm: 1 },
    { a: 1, b: 1, c: 8, warm: 0.5 },
  ];

  it("gives the median of c / (a + b) and of c / a", () => {
    expect(gateValue(fresh(rows), "c", "sum-median", SUM)).toBeCloseTo(1.3);
    expect(gateValue(fresh(rows), "c", "sum-median", { members: ["a", "b"] })).toBeCloseTo(1.4);
    expect(gateValue(fresh(rows), "c", "median", SUM)).toBeCloseTo(2.8);
    expect(gateValue(fresh(rows), "c", "sum-median")).toBeNaN();
  });

  it("gates on all the inputs, and reports the steady measure and the count of steady inputs", () => {
    const result = checkTimeGate(SUM, fresh(rows), "set-v1", ".fixed.", 5000);
    expect([result.pass, result.refused]).toEqual([true, []]);
    expect(result.lines.map((l) => [l.measure, l.max])).toEqual([["aa.median", null], ["aa.noise", 0.06], ["steady.inputs", null], ["sum-median", 1.5], ["sum-median", null]]);
    expect(gateMarkdown(result)).toContain("| steady.inputs | 3 | report | - |");
    expect(gateMarkdown(result)).toContain("| sum-median | 1.4000 | 1.5000 | pass |");
    expect(gateMarkdown(result)).toContain("| sum-median (steady) | 1.3000 | report | - |");
  });

  it("refuses a run with another filter, warm-up or count of passes, or without the warm check", () => {
    expect(checkTimeGate(SUM, fresh(rows), "set-v1", undefined, 5000).refused).toEqual(["the run uses all the inputs, not only the inputs with .fixed. in their id"]);
    expect(checkTimeGate(SUM, fresh(rows), "set-v1", ".fixed.", 1000).refused).toEqual(["the warm-up is 1000, not 5000"]);
    expect(checkTimeGate(SUM, fresh(rows, { passes: 1 }), "set-v1", ".fixed.", 5000).refused).toEqual(["the timed passes are 1, not 200"]);
    const cold = fresh(rows);
    delete cold.warm;
    expect(checkTimeGate(SUM, cold, "set-v1", ".fixed.", 5000).refused).toEqual(["the report has no warm check"]);
  });

  it("derives the values of a record from the reports of its runs", () => {
    const reports = [1, 1.1, 1.05, 0.95, 1].map((s) => fresh(rows.map((r) => ({ ...r, c: r.c * s }))));
    const gate = deriveTimeGate(SUM, reports, ["u1", "u2", "u3", "u4", "u5"]);
    const values = gate.checks[0]!.derivation.values;
    expect(values.map((v) => +v.toFixed(2))).toEqual([1.4, 1.54, 1.47, 1.33, 1.4]);
    expect(gate.checks[0]!.max).toBe(spreadLimit(values));
    expect(gate.checks[0]!.derivation.runs).toEqual(["u1", "u2", "u3", "u4", "u5"]);
    expect(() => parseTimeGate(JSON.stringify(gate))).not.toThrow();
    expect(() => deriveTimeGate(SUM, reports, ["u1"])).toThrow("5 reports and 1 run ids");
  });
});

describe("parseTimeGate", () => {
  it("refuses a limit that is not its worst value plus its spread, an older schema and a wrong noise cap", () => {
    expect(() => parseTimeGate(JSON.stringify(GATE))).not.toThrow();
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.5, derivation }] }))).toThrow("worst value plus its spread");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.3, derivation: { ...derivation, values: [2] } }] }))).toThrow("5 runs");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.3, derivation: { ...derivation, runs: ["r1"] } }] }))).toThrow("a run id and a CPU");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, schema: "packing-time-gate/2" }))).toThrow("packing-time-gate/3");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, noise: undefined }))).toThrow("noise cap");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, noise: { ...GATE.noise, cap: 0.05 } }))).toThrow("median A/A noise");
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
    expect(gate.checks.map((c) => c.measure)).toEqual(["median"]);
    expect(gate.reports.map((r) => r.measure)).toEqual(["q95"]);
  });

  it("reads the gate record of k130, with each derivation run under the noise cap", () => {
    const gate = parseTimeGate(readFileSync(join(import.meta.dirname, "gates", "k130-time.json"), "utf8"));
    expect(gate.checks.map((c) => [c.measure, c.max])).toEqual([["sum-median", 1.4546]]);
    expect(gate.aa.noise.every((n) => n <= gate.noise.cap)).toBe(true);
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
