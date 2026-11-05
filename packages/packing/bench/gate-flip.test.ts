import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  chosenStrategy,
  flipMarkdown,
  gateWithoutEntry,
  growCode,
  noisyAa,
  rowHolds,
  slowArm,
  moveToModel,
  slowStrategy,
  SMOKE_FAULTS,
  withoutStrategy,
} from "./gate-flip.ts";
import type { PairedReport } from "./paired-time.ts";
import { failedTests, verdictCode } from "./promote.ts";
import type { BenchRecord, BenchRun, MeasuredRecord } from "./run.ts";
import { sizeCoverage, type SizeGate } from "./size-gate.ts";
import { smokeCheck } from "./smoke-check.ts";
import { checkTimeGate, type TimeGate } from "./time-gate.ts";

// The faults of the flip tests on made-up inputs. The test packs nothing and starts no child. CI reads the real commands of the gates.

const derivation = { runs: ["r1"], cpus: ["c"], values: [1.9], worst: 2, spread: 0.3 };
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
  reports: [],
  aa: { median: [1], noise: [0.02] },
  noise: { factor: 3, level: 0.8, quiet: 0.02, cap: 0.06 },
};

const QUIET = [1.02, 0.98, 1, 1.01, 0.99];
const rounds = (r: number): number[] => [10 * r, 10 * r, 10 * r];
const REPORT = {
  schema: "paired-time/3",
  mode: "process",
  env: { cpu: "Test CPU", cores: 1, os: "test", arch: "x64", node: "v0" },
  base: "a",
  arms: ["a", "b", "a~aa"],
  inputs: [1.95, 2, 2, 2.1, 1.9].map((r, i) => ({ id: `i${i}`, group: "all", ms: { a: rounds(1), b: rounds(r), "a~aa": rounds(QUIET[i]!) }, median: {}, ratio: { b: r, "a~aa": 1 } })),
  ratios: {},
  noiseFloor: { median: 1, p10: 0.95, p90: 1.05 },
} as unknown as PairedReport;

describe("the fault of the time gate", () => {
  it("leaves a clean report as a pass, so each fault below is the only change", () => {
    expect(checkTimeGate(GATE, REPORT, "set-v1").verdict).toBe("pass");
  });

  it("fails with an arm 3 times slower, and changes no other arm", () => {
    const slow = slowArm(REPORT, "b", 3);
    expect(checkTimeGate(GATE, slow, "set-v1").verdict).toBe("fail");
    expect(slow.inputs[0]!.ms["a"]).toEqual(REPORT.inputs[0]!.ms["a"]);
    expect(slow.inputs[0]!.ms["b"]).toEqual(REPORT.inputs[0]!.ms["b"]!.map((t) => t * 3));
  });

  it("cannot decide with a noisy A/A arm on a first run, and fails on a retry", () => {
    const noisy = noisyAa(REPORT, 3);
    expect(checkTimeGate(GATE, noisy, "set-v1").verdict).toBe("cannot-decide");
    expect(checkTimeGate(GATE, noisy, "set-v1", undefined, undefined, true).verdict).toBe("fail");
  });
});

describe("the fault of the size gate", () => {
  it("adds a statement that gzip cannot make small, and keeps the code", () => {
    const code = "export const a = 1;";
    const grown = growCode(code, 4096);
    expect(grown.startsWith(code)).toBe(true);
    expect(grown).toContain("globalThis.__flip");
    const bytes = gzipSync(grown, { level: 9 });
    expect(gunzipSync(bytes).toString()).toBe(grown);
    expect(bytes.length).toBeGreaterThan(4096);
  });

  it("gives a gate record that the coverage check refuses", () => {
    const entry = (specifier: string) => ({ specifier, file: `${specifier}.js`, import: "x", measured: 1, budget: 1 });
    const gate: SizeGate = { schema: "size-gate/1", rule: "r", bundler: "b", commit: "c", entries: [entry("p"), entry("q")] };
    const exports = { p: "p.js", q: "q.js" };
    expect(sizeCoverage(gate.entries, exports)).toEqual([]);
    expect(sizeCoverage(gateWithoutEntry(gate).entries, exports)).toEqual(["The export p has no entry in the size gate."]);
  });
});

describe("the fault of the portfolio sets", () => {
  it("names a strategy from a set of one member", () => {
    expect(chosenStrategy('"sets": {\n  "1": [\n    "maxrects-cp"\n  ],\n  "2": [\n    "x",\n    "y"\n  ]\n}')).toBe("maxrects-cp");
    expect(() => chosenStrategy("{}")).toThrow(/no set of one member/);
  });

  it("removes each record of the strategy and keeps the others", () => {
    const text = '{"strategy":"a","n":1}\n{"strategy":"b","n":2}\n\n{"strategy":"a","n":3}\n';
    expect(withoutStrategy(text, "a")).toBe('{"strategy":"b","n":2}');
  });
});

describe("the faults of the smoke check", () => {
  const INPUTS = ["i1", "i2"];
  const record = (strategy: string, input: string): MeasuredRecord =>
    ({
      strategy,
      input,
      measures: { "pack.fill": 0.5 },
      hard: { "no-overlap": 0 },
      deterministic: true,
    }) as unknown as MeasuredRecord;
  const records: BenchRecord[] = ["rows", "shelf"].flatMap((s) => INPUTS.map((i) => record(s, i)));
  const coverage = { rows: { measured: 2, inputs: 2, coverage: 1 }, shelf: { measured: 2, inputs: 2, coverage: 1 } };
  const run = { strategies: ["rows", "shelf"], errors: [], coverage } as unknown as BenchRun;

  it("passes the clean copy", () => {
    expect(smokeCheck(run, records, ["rows"]).failures).toEqual([]);
  });

  it.each(SMOKE_FAULTS.map((f) => [f.name, f] as const))("fails on %s, and the failure names that kind", (_name, fault) => {
    const faulty = fault.apply(run, records);
    const failures = smokeCheck(faulty.run, faulty.records, ["rows"]).failures;
    expect(failures.some((f) => f.includes(fault.names))).toBe(true);
  });

  it("has a fault for each kind, with a different text for each", () => {
    expect(new Set(SMOKE_FAULTS.map((f) => f.names)).size).toBe(SMOKE_FAULTS.length);
  });
});

describe("the fault of the time test of the win test", () => {
  const line = (strategy: string, more: object): string => JSON.stringify({ strategy, input: "i", ...more });

  it("multiplies each time of the strategy, and keeps each other field and record", () => {
    const text = `${line("a", { ms: 2, msRuns: [1, 2, 3], fill: 0.5 })}\n\n${line("b", { ms: 2 })}\n`;
    const [slow, other] = slowStrategy(text, "a", 10).split("\n");
    expect(JSON.parse(slow!)).toEqual({ strategy: "a", input: "i", ms: 20, msRuns: [10, 20, 30], fill: 0.5 });
    expect(other).toBe(line("b", { ms: 2 }));
  });

  it("adds no time to a record with no time", () => {
    const text = line("a", { skipped: "refused" });
    expect(slowStrategy(text, "a", 10)).toBe(JSON.stringify(JSON.parse(text)));
  });
});

describe("moveToModel", () => {
  it("replaces the CPU model of one strategy, and keeps each other field and record", () => {
    const text = `${JSON.stringify({ strategy: "a", ms: 2, env: { cpu: "A", cores: 4 } })}\n${JSON.stringify({ strategy: "b", ms: 3, env: { cpu: "A" } })}\n`;
    const [moved, other] = moveToModel(text, "a", "B").split("\n");
    expect(JSON.parse(moved!)).toEqual({ strategy: "a", ms: 2, env: { cpu: "B", cores: 4 } });
    expect(JSON.parse(other!)).toEqual({ strategy: "b", ms: 3, env: { cpu: "A" } });
  });
});

describe("the failed parts of a win test", () => {
  const passed = { pass: true };
  const tests = { hard: passed, guards: [passed], stability: [passed], gain: passed, time: passed, models: { a: ["A"], b: ["A"], one: true } } as unknown as Parameters<typeof failedTests>[0];

  it("gives no name when each part passes", () => {
    expect(failedTests(tests)).toEqual([]);
  });

  it("names each failed part, so a fault names only its own part", () => {
    const failed = { pass: false };
    expect(failedTests({ ...tests, time: failed } as typeof tests)).toEqual(["time"]);
    expect(failedTests({ ...tests, gain: failed, guards: [passed, failed] } as unknown as typeof tests)).toEqual(["guards", "gain"]);
    expect(failedTests({ ...tests, hard: failed, stability: [failed] } as unknown as typeof tests)).toEqual(["hard", "stability"]);
  });

  it("does not name the time test without one known CPU model, and names the other parts", () => {
    const failed = { pass: false };
    const models = { a: ["A"], b: ["B"], one: false };
    expect(failedTests({ ...tests, time: failed, models } as typeof tests)).toEqual([]);
    expect(failedTests({ ...tests, time: failed, gain: failed, models } as typeof tests)).toEqual(["gain"]);
  });
});

describe("the stated verdict of a fixed pair", () => {
  it("gives 0 with no stated verdict, on a pass and on a fail", () => {
    expect(verdictCode({ status: "pass" }, undefined)).toBe(0);
    expect(verdictCode({ status: "fail" }, undefined)).toBe(0);
    expect(verdictCode({ status: "no read" }, undefined)).toBe(0);
  });

  it("gives 1 when the verdict differs from the stated one, in both directions", () => {
    expect(verdictCode({ status: "pass" }, "pass")).toBe(0);
    expect(verdictCode({ status: "fail" }, "fail")).toBe(0);
    expect(verdictCode({ status: "fail" }, "pass")).toBe(1);
    expect(verdictCode({ status: "pass" }, "fail")).toBe(1);
  });

  it("reads no-read as its own state: it is not a pass and not a fail", () => {
    expect(verdictCode({ status: "no read" }, "no-read")).toBe(0);
    expect(verdictCode({ status: "no read" }, "pass")).toBe(1);
    expect(verdictCode({ status: "no read" }, "fail")).toBe(1);
    expect(verdictCode({ status: "pass" }, "no-read")).toBe(1);
    expect(verdictCode({ status: "fail" }, "no-read")).toBe(1);
  });

  it("refuses another value", () => {
    expect(() => verdictCode({ status: "pass" }, "win")).toThrow(/pass, fail or no-read/);
  });
});

describe("the table of a flip test", () => {
  it("holds only on the stated code and the stated text", () => {
    expect(rowHolds({ name: "n", expected: 1, got: 1 })).toBe(true);
    expect(rowHolds({ name: "n", expected: 1, got: 0 })).toBe(false);
    expect(rowHolds({ name: "n", expected: 1, got: null })).toBe(false);
    expect(rowHolds({ name: "n", expected: 1, got: 1, names: "x", named: false })).toBe(false);
  });

  it("names each case and its result", () => {
    const text = flipMarkdown("size", [
      { name: "clean", expected: 0, got: 0 },
      { name: "fault", expected: 1, got: 0 },
      { name: "named", expected: 1, got: 1, names: "x", named: false },
      { name: "stopped", expected: 1, got: null },
    ]);
    expect(text).toContain("| clean | 0 | 0 | holds |");
    expect(text).toContain("| fault | 1 | 0 | does not hold |");
    expect(text).toContain('| named | 1 | 1 | the output does not name "x" |');
    expect(text).toContain("| stopped | 1 | signal | does not hold |");
  });
});
