import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_CELL, cellPortfolioOf, hardOf, HELD_OUT_SEED, portfolioMarkdown, portfolioOf, seedOf } from "./portfolio.ts";
import { mergeRuns, parseCorpus, runBench, summaryMarkdown, type BenchEnv } from "./run.ts";
import type { ScreenRecord } from "./screen.ts";

// The portfolio report of k20 on tiny made-up records, and on a run of the tiny corpus smoke-v1. The test reads no time.

/** This function makes a measured record with the two values of the levels, a seed and a time. */
const rec = (strategy: string, input: string, excess: number, fill: number, more: Partial<ScreenRecord> = {}): ScreenRecord => ({
  strategy,
  input,
  measures: { "pack.overflow.excessArea": excess, "pack.fill": fill },
  hard: { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 },
  ms: 1,
  ...more,
});

describe("the portfolio report: the oracle", () => {
  it("keeps the ties of each level against the best value, not a chain of pairwise ties", () => {
    // The values 0, 0.004 and 0.008 with the minimum effect 0.005: A and B tie the best value 0, and C does not
    const records = [rec("A", "x/s1", 0, 0.5), rec("B", "x/s1", 0.004, 0.6), rec("C", "x/s1", 0.008, 0.7)];
    const c = cellPortfolioOf(["A", "B", "C"], records);
    expect(c.soleWins).toEqual({ A: 0, B: 1, C: 0 });
    expect(c.losers).toEqual(["A", "C"]);
    expect(c.oracle.train.fill).toBe(0.6);
  });

  it("gives a tie of each level to the first entry, and a tie is no sole win", () => {
    const records = [rec("A", "x/s1", 0, 0.5), rec("B", "x/s1", 0.004, 0.5), rec("C", "x/s1", 0.008, 0.9)];
    const c = cellPortfolioOf(["A", "B", "C"], records);
    expect(c.soleWins).toEqual({ A: 0, B: 0, C: 0 });
    expect(c.losers).toEqual(["A", "B", "C"]);
    // The best single entry wins the input: A is first in the kept list
    expect(c.best!.members).toEqual(["A"]);
    expect(c.best!.train).toMatchObject({ inputs: 1, wins: 1, winShare: 1, fillRegret: 0 });
  });

  it("puts the hard level first: a hard break loses to a better fill", () => {
    const broken = rec("A", "x/s1", 0, 0.9, { hard: { "no-overlap": 1 } });
    const c = cellPortfolioOf(["A", "B"], [broken, rec("B", "x/s1", 0.1, 0.2)]);
    expect(c.soleWins).toEqual({ A: 0, B: 1 });
  });

  it("counts in-container of the true outline, from pack.outsideExact", () => {
    const r = rec("A", "x/s1", 0, 0.9, { hard: { "no-overlap": 0, "in-container": 0 } });
    r.measures["pack.outsideExact"] = 2;
    expect(hardOf(r)).toBe(2);
    expect(hardOf({ hard: { "no-overlap": 1, "in-container": 3 }, measures: {} })).toBe(4);
  });

  it("reads the seed of a record, or the end of its input id", () => {
    expect(seedOf({ input: "c/rect-grid.n10/s3" })).toBe(3);
    expect(seedOf({ input: "c/x/s1", seed: 5 })).toBe(5);
    expect(seedOf({ input: "i1" })).toBeUndefined();
  });

  it("leaves out a record without the values of the levels, and a skipped record", () => {
    const c = cellPortfolioOf(["A", "B"], [rec("A", "x/s1", 0, 0.5), { strategy: "B", input: "x/s1", measures: {} }, { ...rec("B", "y/s1", 0, 1), skipped: "unsupported" }]);
    expect(c.pool).toEqual(["A"]);
    expect(c.inputs).toBe(1);
  });
});

describe("the portfolio report: the sets", () => {
  // Three entries on 4 training inputs (seeds 1 and 2) and 2 held-out inputs (seed 3)
  // - A is best on t1, t2 and h1. B is best on t3 and h2. C is best on t4, with no held-out win.
  const records: ScreenRecord[] = [];
  const add = (input: string, fills: [number, number, number], ms: [number, number, number] = [1, 2, 4]): void => {
    for (const [i, id] of ["A", "B", "C"].entries()) records.push(rec(id, input, 0, fills[i]!, { ms: ms[i]! }));
  };
  add("c/t1/s1", [0.9, 0.5, 0.5]);
  add("c/t2/s1", [0.9, 0.5, 0.5]);
  add("c/t3/s2", [0.5, 0.9, 0.5]);
  add("c/t4/s2", [0.5, 0.5, 0.8]);
  add("c/h1/s3", [0.9, 0.7, 0.5]);
  add("c/h2/s3", [0.6, 0.9, 0.5]);
  const c = cellPortfolioOf(["C", "B", "A"], records);

  it("holds out the seed 3", () => {
    expect(HELD_OUT_SEED).toBe(3);
    expect([c.inputs, c.trainInputs, c.heldOutInputs]).toEqual([6, 4, 2]);
  });

  it("chooses the best single entry on the training seeds, and scores it on the held-out seed", () => {
    expect(c.best!.members).toEqual(["A"]);
    expect(c.best!.train).toEqual({ inputs: 4, wins: 2, winShare: 0.5, fillRegret: 0.175, ms: 4 });
    expect(c.best!.heldOut).toEqual({ inputs: 2, wins: 1, winShare: 0.5, fillRegret: 0.15, ms: 2 });
  });

  it("adds one entry at a time: the most wins, then the lowest fill regret", () => {
    expect(c.sets.map((s) => s.members)).toEqual([
      ["A", "B"],
      ["A", "B", "C"],
    ]);
    expect(c.sets[0]!.heldOut).toEqual({ inputs: 2, wins: 2, winShare: 1, fillRegret: 0, ms: 6 });
    expect(c.sets[1]!.train).toMatchObject({ wins: 4, winShare: 1, fillRegret: 0 });
    expect(c.sets[1]!.heldOut.ms).toBe(14);
    expect(c.oracle.heldOut).toEqual({ inputs: 2, fill: 0.9, ms: 14 });
  });

  it("gives the sole wins over all the seeds, and keeps the losers in the pool", () => {
    expect(c.soleWins).toEqual({ C: 1, B: 2, A: 3 });
    expect(c.losers).toEqual([]);
    expect(c.pool).toEqual(["C", "B", "A"]);
  });

  it("gives no set without a training input, and no k = 3 set with 2 entries", () => {
    const held = cellPortfolioOf(["A", "B"], [rec("A", "x/s3", 0, 0.5), rec("B", "x/s3", 0, 0.6)]);
    expect(held.best).toBeUndefined();
    expect(held.sets).toEqual([]);
    const two = cellPortfolioOf(["A", "B"], [rec("A", "x/s1", 0, 0.5), rec("B", "x/s1", 0, 0.6)]);
    expect(two.sets.map((s) => s.members)).toEqual([["B", "A"]]);
  });

  it("gives the cell all and each container shape, and writes the tables", () => {
    const shapes = new Map([
      ["c/t1/s1", "rect"],
      ["c/h1/s3", "circle"],
    ]);
    const report = portfolioOf(["A", "B", "C"], records, (input) => shapes.get(input) ?? "rect", ["rect", "circle"]);
    expect(Object.keys(report)).toEqual([ALL_CELL, "rect", "circle"]);
    expect(report["circle"]!.inputs).toBe(1);
    const text = portfolioMarkdown(report).join("\n");
    expect(text).toContain("| all | oracle | all 3 | 2 | 2 | 1 | 0 | 14 |");
    expect(text).toContain("| all | k = 2 | `A`, `B` | 2 | 2 | 1 | 0 | 6 |");
    expect(text).toContain("| circle | best single | - | 1 |");
    expect(portfolioMarkdown(undefined)).toEqual(["## Portfolio", "", "The run has no portfolio report. A `run.json` before k20 does not have it."]);
  });
});

describe("the portfolio report of a run", () => {
  const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
  const smoke = parseCorpus(readFileSync(join(import.meta.dirname, "corpora", "smoke-v1.json"), "utf8"), "smoke-v1");
  const result = runBench({ corpus: smoke, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["shelf", "skyline", "maxrects-bl"] });

  it("is in run.json and in summary.md, and a merge gives it from the records", () => {
    const report = result.run.portfolio!;
    expect(Object.keys(report)).toEqual([ALL_CELL, "rect", "circle"]);
    expect(report[ALL_CELL]!.pool).toEqual(["shelf", "skyline", "maxrects-bl"]);
    // smoke-v1 has no seed 3, so each set has a training score only
    expect(report[ALL_CELL]!.heldOutInputs).toBe(0);
    expect(report[ALL_CELL]!.best!.heldOut.inputs).toBe(0);
    expect(summaryMarkdown(result.run, result.records)).toContain("## Portfolio");
    const merged = mergeRuns([result.run], result.records, result.manifest);
    expect(merged.portfolio).toEqual(report);
    expect(mergeRuns([result.run]).portfolio).toBeUndefined();
  });
});
