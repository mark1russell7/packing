import { describe, expect, it } from "vitest";
import { PAIRED_TIME_MODE, pairedTimeMarkdown, pairedTimeOf } from "./paired-time.ts";
import type { BenchEnv, BenchRecord, BenchRun, MeasuredRecord } from "./run.ts";

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "x64", runner: "test runner", cpu: "Test CPU 9000", cpus: 4 };

/** This function makes a made-up run with the strategies of `ids`. */
const runOf = (ids: string[], pairedTime = true): BenchRun => ({
  schema: "packing-bench-run/1",
  corpus: "tiny-v1",
  prediction: "p-test",
  commit: "abc1234",
  repeats: 5,
  warmup: 2,
  strategies: ids,
  env: ENV,
  skipped: [],
  errors: [],
  ...(pairedTime ? { interleave: true as const, pairedTime: true as const } : {}),
});

/** This function makes a made-up measured record. Only the fields that the report reads matter. */
const record = (strategy: string, input: string, seed: number, ms: number): BenchRecord => ({ strategy, input, seed, ms, msRuns: [ms], measures: {}, hard: {}, env: ENV }) as unknown as MeasuredRecord;

describe("pairedTimeOf", () => {
  // 2 inputs of the seed 1 and 2 inputs of the seed 2. The strategy b takes 2 or 3 times the base, and c takes half
  const records: BenchRecord[] = [
    record("base", "i1", 1, 1),
    record("b", "i1", 1, 2),
    record("c", "i1", 1, 0.5),
    record("base", "i2", 1, 2),
    record("b", "i2", 1, 4),
    record("c", "i2", 1, 1),
    record("base", "i3", 2, 1),
    record("b", "i3", 2, 3),
    record("c", "i3", 2, 0.5),
    record("base", "i4", 2, 1),
    record("b", "i4", 2, 3),
  ];
  const report = pairedTimeOf(runOf(["base", "b", "c"]), records);

  it("gives the ratio of each strategy over the first strategy on each input", () => {
    expect(report.base).toBe("base");
    expect(report.inputs.find((i) => i.input === "i2")).toEqual({ input: "i2", seed: 1, ms: { base: 2, b: 4, c: 1 }, ratio: { b: 2, c: 0.5 } });
    expect(report.inputs.find((i) => i.input === "i4")?.ratio).toEqual({ b: 3 });
  });

  it("gives the median, the fold medians by seed, their mean and their sample SD", () => {
    expect(report.ratios["b"]).toEqual({ inputs: 4, median: 2.5, folds: { "1": 2, "2": 3 }, foldMean: 2.5, foldSD: 0.707 });
    expect(report.ratios["c"]).toEqual({ inputs: 3, median: 0.5, folds: { "1": 0.5, "2": 0.5 }, foldMean: 0.5, foldSD: 0 });
  });

  it("names the mode and the CPU of the one process", () => {
    expect(report.mode).toBe(PAIRED_TIME_MODE);
    expect(report.cpu).toBe("Test CPU 9000");
    expect(report.commit).toBe("abc1234");
    const md = pairedTimeMarkdown(report);
    expect(md).toContain("one process on Test CPU 9000");
    expect(md).toContain("| `b` | 4 | 2.5 | 2 | 3 | 2.5 | 0.707 |");
  });

  it("skips a skipped record and a base time of 0", () => {
    const skipped = { ...record("b", "i5", 1, 9), skipped: "unsupported" } as unknown as BenchRecord;
    const more = pairedTimeOf(runOf(["base", "b"]), [...records, record("base", "i5", 1, 1), skipped, record("base", "i6", 1, 0), record("b", "i6", 1, 1)]);
    expect(more.inputs.find((i) => i.input === "i5")?.ratio).toEqual({});
    expect(more.inputs.some((i) => i.input === "i6")).toBe(false);
    expect(more.ratios["b"]?.inputs).toBe(4);
  });

  it("throws a RangeError for a run that is not a paired time run, or with 1 strategy", () => {
    expect(() => pairedTimeOf(runOf(["base", "b"], false), records)).toThrow(RangeError);
    expect(() => pairedTimeOf(runOf(["base"]), records)).toThrow(RangeError);
  });
});
