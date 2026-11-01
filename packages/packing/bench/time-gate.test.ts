import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { checkTimeGate, gateMarkdown, gateValue, parseTimeGate, type TimeGate } from "./time-gate.ts";

const derivation = { runs: ["r1", "r2", "r3", "r4", "r5"], cpus: ["c", "c", "c", "c", "c"], values: [1.8, 2, 1.9, 1.7, 1.95], worst: 2, margin: 0.1 };
const GATE: TimeGate = {
  schema: "packing-time-gate/1",
  id: "test-time",
  item: "k0",
  rule: "test",
  corpus: "set-v1",
  mode: "process",
  base: "a",
  arm: "b",
  aaMedian: 0.05,
  checks: [{ measure: "median", max: 2.2, derivation }],
  reports: [{ measure: "q95", values: [3, 4, 5, 3, 4], why: "test" }],
  aa: { median: [1, 1, 1, 1, 1], p10: [0.9, 0.9, 0.9, 0.9, 0.9], p90: [1.1, 1.1, 1.1, 1.1, 1.1] },
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
    expect(result.lines.map((l) => [l.measure, l.max])).toEqual([["aa.median", 1.05], ["median", 2.2], ["q95", null]]);
    expect(gateMarkdown(result)).toContain("| median | 2.0000 | 2.2000 | pass |");
  });

  it("fails a report with the median above the limit", () => {
    const result = checkTimeGate(GATE, report([2.3, 2.4, 2.5]), "set-v1");
    expect(result.pass).toBe(false);
    expect(result.refused).toEqual([]);
    expect(gateMarkdown(result)).toContain("| median | 2.4000 | 2.2000 | fail |");
  });

  it("refuses a report of another test, without the A/A arm or with a wide A/A median", () => {
    expect(checkTimeGate(GATE, report([1]), "set-v2").refused).toEqual(["the corpus is set-v2, not set-v1"]);
    expect(checkTimeGate(GATE, report([1], { mode: "fresh" }), "set-v1").refused).toEqual(["the mode is fresh, not process"]);
    expect(checkTimeGate(GATE, report([1], { noiseFloor: null }), "set-v1").refused).toEqual(["the report has no A/A arm"]);
    expect(checkTimeGate(GATE, report([1]), "set-v1", ".fixed.").refused).toEqual(["the run uses only the inputs with .fixed. in their id"]);
    const wide = checkTimeGate(GATE, report([1], { noiseFloor: { median: 1.06, p10: 1, p90: 1.1 } }), "set-v1");
    expect(wide.pass).toBe(false);
    expect(wide.refused).toEqual(["the A/A median 1.06 is outside 1 ± 0.05"]);
  });

  it("gives the q95 of the ratios of the arm", () => {
    expect(gateValue(report([1, 2, 3, 4, 5]), "b", "q95")).toBeCloseTo(4.8);
    expect(gateValue(report([1]), "c", "median")).toBeNaN();
  });
});

describe("parseTimeGate", () => {
  it("refuses a limit that is not its worst value times 1 plus the margin", () => {
    expect(() => parseTimeGate(JSON.stringify(GATE))).not.toThrow();
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.5, derivation }] }))).toThrow("worst value times");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, checks: [{ measure: "median", max: 2.2, derivation: { ...derivation, values: [2] } }] }))).toThrow("5 runs");
    expect(() => parseTimeGate(JSON.stringify({ ...GATE, schema: "x" }))).toThrow(TypeError);
  });

  it("reads the gate record of k66", () => {
    const gate = parseTimeGate(readFileSync(join(import.meta.dirname, "gates", "k66-time.json"), "utf8"));
    expect(gate.checks.map((c) => [c.measure, c.max])).toEqual([["median", 2.6419]]);
    expect(gate.reports.map((r) => r.measure)).toEqual(["q95"]);
  });
});
