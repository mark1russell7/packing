import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { caseProgress, type SupervisedChild } from "@mark1russell7/rigor-bench/supervise";
import { budgetCases, controlTimes, CONTROL_INPUTS, CONTROL_PACKS, endFacts, NOT_RUN_JOB, NOT_RUN_SIZE, OVER_BUDGET, PAIR_MS, pairBudgetMs, runBudgeted, runCases, SMALL_PAIR_MS, type BudgetedOptions } from "./budget.ts";
import { timeOf } from "./promote.ts";
import { isMeasured, mergeRuns, parseCorpus, runBench, summaryMarkdown, type BenchEnv, type BenchPair, type BenchRecord, type BenchRun, type SkippedRecord } from "./run.ts";

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const dir = mkdtempSync(join(tmpdir(), "packing-budget-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A corpus with three sizes: 3 inputs with 10 items, 3 with 20 items and 2 with 40 items
const corpusFile = join(dir, "budget-v1.json");
const specOf = (count: number, seeds: number[]): unknown => ({ generator: "rect-grid", version: 1, params: { count }, seeds });
writeFileSync(corpusFile, JSON.stringify({ schema: "layout-corpus/1", corpus: "budget-v1", specs: [specOf(40, [1, 2]), specOf(10, [1, 2, 3]), specOf(20, [1, 2, 3])] }));
const parsed = (): ReturnType<typeof parseCorpus> => parseCorpus(readFileSync(corpusFile, "utf8"), "budget-v1");

const sizes = new Map(corpus(parsed().corpus, parsed().specs).inputs.map((file) => [file.id, file.boxes.length]));
const sizeOf = (input: string): number => sizes.get(input) ?? 0;

const base: BudgetedOptions = { corpusFile, corpusName: "budget-v1", prediction: "p-test", strategies: ["rows"], repeats: 1, warmup: 0, env: ENV, commit: "abcdef0", pollMs: 1 };

const pairsOf = (file: string): BenchPair[] => JSON.parse(readFileSync(file, "utf8")) as BenchPair[];
const progressOf = (jobFile: string): string => (JSON.parse(readFileSync(jobFile, "utf8")) as { progress: string }).progress;

/** This function gives a child that stops at a pair: it does the pairs before it in this process, tells the start of the pair and waits for a stop. */
function stallsAt(stalls: (pair: BenchPair) => boolean, now: () => number = Date.now) {
  return (jobFile: string, pairsFile: string): SupervisedChild => {
    const pairs = pairsOf(pairsFile);
    const at = pairs.findIndex(stalls);
    const before = at < 0 ? pairs : pairs.slice(0, at);
    const beforeFile = `${pairsFile}.before`;
    writeFileSync(beforeFile, JSON.stringify(before));
    runCases(jobFile, beforeFile);
    if (at < 0) return { stop: () => undefined, exited: Promise.resolve(0) };
    caseProgress(progressOf(jobFile), now).start(`${pairs[at]!.strategy}|${pairs[at]!.input}`, "");
    let stop = (): void => undefined;
    const exited = new Promise<number | null>((resolve) => {
      stop = () => resolve(null);
    });
    return { stop: () => stop(), exited };
  };
}

const reasonsOf = (records: readonly BenchRecord[]): Map<number, string[]> => {
  const out = new Map<number, string[]>();
  for (const r of records) out.set(r.nodes, [...(out.get(r.nodes) ?? []), r.skipped ?? "measured"]);
  return out;
};

describe("the cases of a budget", () => {
  it("gives the smaller budget up to 30 items", () => {
    expect([pairBudgetMs(10), pairBudgetMs(30), pairBudgetMs(31), pairBudgetMs(1000)]).toEqual([SMALL_PAIR_MS, SMALL_PAIR_MS, PAIR_MS, PAIR_MS]);
  });

  it("puts the inputs of each entry in rising order, with the entry as its group and the size as its rank", () => {
    const inputs = [{ id: "c", nodes: 100 }, { id: "a", nodes: 10 }, { id: "d", nodes: 10 }, { id: "b", nodes: 30 }];
    const cases = budgetCases(["x", "y"], inputs);
    expect(cases.map((c) => c.id)).toEqual(["x|a", "x|d", "x|b", "x|c", "y|a", "y|d", "y|b", "y|c"]);
    expect(cases[0]?.groups).toEqual({ "": "x" });
    expect(cases[4]?.groups).toEqual({ "": "y" });
    expect(cases.map((c) => c.rank)).toEqual([10, 10, 30, 100, 10, 10, 30, 100]);
    expect(cases[3]?.budgetMs).toBe(PAIR_MS);
    expect(cases[0]?.budgetMs).toBe(SMALL_PAIR_MS);
  });

  it("gives an overrun a lower limit on its time, and a pair that did not start the overruns that stopped it", () => {
    expect(endFacts({ kind: "over-budget", id: "x|a", budgetMs: 15_000, stage: "" })).toEqual({ reason: OVER_BUDGET, facts: { budgetMs: 15_000, msAtLeast: 15_000 } });
    expect(endFacts({ kind: "not-run", id: "x|b", budgetMs: 30_000, group: "x", because: ["x|a", "x|d"] })).toEqual({ reason: NOT_RUN_SIZE, facts: { budgetMs: 30_000, because: ["x|a", "x|d"] } });
  });
});

describe("the rule of one timed run", () => {
  const ticks = (step: number): (() => number) => {
    let t = 0;
    return () => (t += step);
  };
  const run = (step: number, slowPackMs?: number) => runBench({ corpus: parsed(), prediction: "p-test", strategies: ["rows"], repeats: 3, warmup: 1, env: ENV, clock: ticks(step), ...(slowPackMs === undefined ? {} : { slowPackMs }) });

  it("gives a pair with a slow first pack 1 timed run and a mark, and the output does not change", () => {
    const plain = run(1).records.filter(isMeasured);
    const slow = run(2000, 1000).records.filter(isMeasured);
    expect(slow.every((r) => r.oneRun === true && r.msRuns.length === 1)).toBe(true);
    expect(plain.every((r) => r.oneRun === undefined && r.msRuns.length === 3)).toBe(true);
    expect(slow.map((r) => r.outputHash)).toEqual(plain.map((r) => r.outputHash));
    expect(slow.every((r) => r.deterministic)).toBe(true);
  });

  it("keeps the repeats of a pair with a fast first pack", () => {
    const records = run(1, 1000).records.filter(isMeasured);
    expect(records.every((r) => r.oneRun === undefined && r.msRuns.length === 3)).toBe(true);
  });

  it("gives no time to the time gate for a record with the mark", () => {
    expect(timeOf({ ms: 5, measures: {}, strategy: "x", input: "i", oneRun: true } as never)).toBeUndefined();
    expect(timeOf({ ms: 5, measures: {}, strategy: "x", input: "i" } as never)).toBe(5);
  });
});

describe("a run with a budget", () => {
  it("stops an entry after 2 overruns at one size, for that size and above", async () => {
    const stalled: string[] = [];
    let t = 0;
    const now = (): number => (t += 20_000);
    const result = await runBudgeted({
      ...base,
      now,
      start: stallsAt((pair) => {
        // Each input with 20 items passes the budget
        const slow = sizeOf(pair.input) === 20;
        if (slow) stalled.push(pair.input);
        return slow;
      }, now),
    });
    const reasons = reasonsOf(result.records);
    expect(reasons.get(10)).toEqual(["measured", "measured", "measured"]);
    expect([...(reasons.get(20) ?? [])].sort()).toEqual([NOT_RUN_SIZE, OVER_BUDGET, OVER_BUDGET].sort());
    expect(reasons.get(40)).toEqual([NOT_RUN_SIZE, NOT_RUN_SIZE]);
    expect(new Set(stalled).size).toBe(2);
    const over = result.records.filter((r): r is SkippedRecord => r.skipped === OVER_BUDGET);
    expect(over.every((r) => r.msAtLeast === SMALL_PAIR_MS && r.budgetMs === SMALL_PAIR_MS && r.ms === 0)).toBe(true);
    const later = result.records.filter((r): r is SkippedRecord => r.skipped === NOT_RUN_SIZE);
    expect(later.every((r) => r.msAtLeast === undefined && r.because?.length === 2)).toBe(true);
    expect(result.run.skipped.filter((s) => s.dimension === "budget")).toHaveLength(5);
    expect(result.run.coverage?.["rows"]?.measured).toBe(3);
    // The first child, and one child after each overrun
    expect(result.run.budget?.jobs[0]?.children).toBe(2);
  });

  it("keeps a run that passes one budget and finishes the rest of the size", async () => {
    let t = 0;
    const now = (): number => (t += 20_000);
    let first = true;
    const result = await runBudgeted({
      ...base,
      now,
      start: stallsAt((pair) => {
        if (first && sizeOf(pair.input) === 10) {
          first = false;
          return true;
        }
        return false;
      }, now),
    });
    expect(reasonsOf(result.records).get(10)).toEqual(expect.arrayContaining([OVER_BUDGET, "measured", "measured"]));
    expect(reasonsOf(result.records).get(40)).toEqual(["measured", "measured"]);
    expect(result.run.errors).toEqual([]);
  });

  it("gives the reason of the job budget to the pairs at the time limit", async () => {
    const result = await runBudgeted({ ...base, deadlineMinutes: 0.001, start: stallsAt((pair) => sizeOf(pair.input) === 20) });
    const reasons = reasonsOf(result.records);
    expect(reasons.get(10)).toEqual(["measured", "measured", "measured"]);
    expect(reasons.get(20)).toEqual([NOT_RUN_JOB, NOT_RUN_JOB, NOT_RUN_JOB]);
    expect(reasons.get(40)).toEqual([NOT_RUN_JOB, NOT_RUN_JOB]);
    expect(result.run.budget?.deadlineMinutes).toBe(0.001);
  });

  it("gives an error to the pair of a child that ends early, and goes on with a new child", async () => {
    let crashed = false;
    const inner = stallsAt(() => false);
    const result = await runBudgeted({
      ...base,
      start: (jobFile, pairsFile) => {
        if (crashed) return inner(jobFile, pairsFile);
        crashed = true;
        const [pair] = pairsOf(pairsFile);
        caseProgress(progressOf(jobFile)).start(`${pair!.strategy}|${pair!.input}`, "");
        return { stop: () => undefined, exited: Promise.resolve(134) };
      },
    });
    expect(result.run.errors).toHaveLength(1);
    expect(result.run.errors[0]?.message).toContain("134");
    expect(result.records.filter(isMeasured)).toHaveLength(7);
  });

  it("throws when a child ends before its first pair", async () => {
    await expect(runBudgeted({ ...base, start: () => ({ stop: () => undefined, exited: Promise.resolve(1) }) })).rejects.toThrow("before its first pair");
  });

  it("refuses a corpus with a base", async () => {
    const file = join(import.meta.dirname, "corpora", "pack-change-v1.json");
    await expect(runBudgeted({ ...base, corpusFile: file, corpusName: "pack-change-v1", start: () => ({ stop: () => undefined, exited: Promise.resolve(0) }) })).rejects.toThrow("base");
  });

  it("gives the records of a run with no budget with a real child, apart from the times", async () => {
    const result = await runBudgeted({ ...base, deadlineMinutes: 5 });
    const plain = runBench({ corpus: parsed(), prediction: "p-test", strategies: ["rows"], repeats: 1, warmup: 0, env: ENV, commit: "abcdef0" });
    const key = (r: BenchRecord): unknown => (isMeasured(r) ? [r.strategy, r.input, r.nodes, r.outputHash, r.deterministic, r.hard] : [r.strategy, r.input, r.skipped]);
    expect(result.records.map(key)).toEqual(plain.records.map(key));
    expect(result.run.budget?.jobs[0]?.children).toBe(1);
    expect(result.run.coverage).toEqual(plain.run.coverage);
    expect(result.run.declared).toEqual(plain.run.declared);
    expect(result.run.budget?.jobs[0]?.control.length).toBeGreaterThan(0);
  }, 60_000);
});

describe("the control", () => {
  it("times the largest inputs, one key for each", () => {
    let t = 0;
    const times = controlTimes({ corpus: parsed(), prediction: "p", env: ENV }, () => (t += 4));
    expect(times).toHaveLength(Math.min(CONTROL_INPUTS, 8));
    expect(times.every((c) => c.ms === 4)).toBe(true);
    expect(new Set(times.map((c) => c.key)).size).toBe(times.length);
    expect(times[0]?.key.startsWith("skyline|")).toBe(true);
    expect(CONTROL_PACKS).toBeGreaterThan(1);
  });
});

describe("the merge of runs with a budget", () => {
  const stamp = { smallPairMs: 1, smallItems: 30, pairMs: 2, slowPackMs: 3, overruns: 2, control: { entry: "skyline", packs: 20, source: "pack" as const } };
  const keys = ["a", "b", "c", "d", "e"];
  const runOf = (id: string, load: number): BenchRun => ({
    schema: "packing-bench-run/1",
    corpus: "c",
    prediction: "p",
    repeats: 1,
    warmup: 0,
    strategies: [id],
    env: ENV,
    skipped: [],
    errors: [],
    budget: { ...stamp, jobs: [{ job: id, control: keys.map((key) => ({ key, ms: 10 * load })), children: 1 }] },
  });

  it("keeps the control of each job and gives a load factor for each job", () => {
    const merged = mergeRuns([runOf("x", 1), runOf("y", 2), runOf("z", 1)]);
    expect(merged.budget?.jobs.map((j) => j.job)).toEqual(["x", "y", "z"]);
    expect(merged.budget?.factors?.find((f) => f.group === "y")?.factor).toBe(2);
    expect(merged.budget?.factors?.find((f) => f.group === "x")?.factor).toBe(1);
  });

  it("refuses runs with different budgets, and a mix with no budget", () => {
    const other = runOf("y", 1);
    other.budget = { ...other.budget!, pairMs: 9 };
    expect(() => mergeRuns([runOf("x", 1), other])).toThrow("one budget");
    const none = runOf("y", 1);
    delete none.budget;
    expect(() => mergeRuns([runOf("x", 1), none])).toThrow("one budget");
    expect(mergeRuns([none]).budget).toBeUndefined();
  });

  it("gives one job no load factor", () => {
    expect(mergeRuns([runOf("x", 1)]).budget?.factors).toBeUndefined();
  });

  it("shows the budget and the largest input that finished in the summary", () => {
    const head = { schema: "layout-record/1", stage: "pack", step: "pack", strategy: "x", options: {}, corpus: "c", set: "s", seed: 1, edges: 0, tolerance: { overlap: 0 }, prediction: "p", env: ENV, measures: {}, hard: {} } as const;
    const records = [
      { ...head, input: "s/f/s1", inputHash: "h", nodes: 10, ms: 1, msRuns: [1], outputHash: "o", deterministic: true, oneRun: true },
      { ...head, input: "s/f/s2", inputHash: "h", nodes: 100, ms: 0, deterministic: null, skipped: OVER_BUDGET, budgetMs: 30_000, msAtLeast: 30_000 },
      { ...head, input: "s/f/s3", inputHash: "h", nodes: 100, ms: 0, deterministic: null, skipped: NOT_RUN_SIZE, budgetMs: 30_000, because: ["a", "b"] },
    ] as unknown as BenchRecord[];
    const text = summaryMarkdown(runOf("x", 1), records);
    expect(text).toContain("## Budget");
    expect(text).toContain("| x | 10 | 1 | 1 | 1 | - |");
    expect(summaryMarkdown({ ...runOf("x", 1), budget: undefined as never }, records)).not.toContain("## Budget");
  });
});
