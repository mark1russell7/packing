import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { BUDGET_POLICY, budgetMarkdown, firstOfPair, jobRecords, pairRecords, timeBudget, type BudgetInput } from "./time-budget.ts";

// Each report of this file is made-up data. The noise is a fixed pattern of offsets on a log scale, not a random draw.
const OFFSETS = [-1, 0.5, 0, -0.5, 1];
const ARMS = ["a", "b", "a~aa"];

/** The shape of a made-up job: the ratio of the arm `b` on each case, the noise of each arm and the base time. */
interface Shape {
  cases?: number;
  rounds?: number;
  /** The true ratio of the arm `b` on a case */
  ratio?: (c: number) => number;
  /** The noise of the arms `a` and `b`, on a log scale */
  sigma?: number;
  /** The offset of the A/A arm on each case, on a log scale: it makes the A/A ratios of the cases differ */
  aaSigma?: number;
  /** The base time of a case in milliseconds */
  baseMs?: (c: number) => number;
}

/** This function makes a made-up job of mode `fresh` with the arms `a`, `b` and `a~aa`. */
function job(name: string, s: Shape = {}, over: Partial<PairedReport> = {}): BudgetInput {
  const { cases = 24, rounds = 5, ratio = () => 1, sigma = 0.02, aaSigma = 0, baseMs = () => 8 } = s;
  const noise = (c: number, r: number, arm: number, size: number) => Math.exp(size * OFFSETS[(c * 7 + r * 3 + arm) % OFFSETS.length]!);
  const inputs = Array.from({ length: cases }, (_, c) => {
    const ms = {
      a: Array.from({ length: rounds }, (_, r) => baseMs(c) * noise(c, r, 0, sigma)),
      b: Array.from({ length: rounds }, (_, r) => baseMs(c) * ratio(c) * noise(c, r, 1, sigma)),
      "a~aa": Array.from({ length: rounds }, (_, r) => baseMs(c) * Math.exp(aaSigma * OFFSETS[c % OFFSETS.length]!) * noise(c, r, 2, sigma)),
    };
    return { id: `case${c}`, group: "all", ms, median: { a: baseMs(c), b: baseMs(c) * ratio(c), "a~aa": baseMs(c) }, ratio: { b: ratio(c), "a~aa": 1 } };
  });
  const report = {
    schema: "paired-time/2",
    mode: "fresh",
    env: { cpu: "Test CPU", cores: 1, os: "test", arch: "x64", node: "v0" },
    base: "a",
    arms: ARMS,
    inputs,
    ratios: {},
    noiseFloor: { median: 1, p10: 0.98, p90: 1.02 },
    ...over,
  } as PairedReport;
  return { run: name, report, corpus: "set-v1" };
}

const five = (s: Shape = {}) => [0, 1, 2, 3, 4].map((n) => job(`run${n + 1}`, s));

describe("the records of rigor-bench", () => {
  it("gives the first arm of each pair from the rotation of the 3 arms", () => {
    // The order of the arms in the rounds 0, 1 and 2 is [a, b, a~aa], [b, a~aa, a] and [a~aa, a, b].
    expect([0, 1, 2, 3].map((r) => firstOfPair(3, 0, 1, r))).toEqual(["a", "b", "a", "a"]);
    expect([0, 1, 2, 3].map((r) => firstOfPair(3, 0, 2, r))).toEqual(["a", "b", "b", "a"]);
    // With 2 arms, the order turns each round.
    expect([0, 1, 2].map((r) => firstOfPair(2, 0, 1, r))).toEqual(["a", "b", "a"]);
  });

  it("maps the times, the rounds and the first arm of a report to records", () => {
    const input = job("run1", { cases: 1, rounds: 3, ratio: () => 2, sigma: 0 });
    input.report.inputs[0]!.ms = { a: [10, 11, 12], b: [20, 21, 22], "a~aa": [30, 31, 32] };
    expect(pairRecords(input.report, "a", "b", 6)).toEqual([
      { case: "case0", round: 6, first: "a", a: 10, b: 20 },
      { case: "case0", round: 7, first: "b", a: 11, b: 21 },
      { case: "case0", round: 8, first: "a", a: 12, b: 22 },
    ]);
    const records = jobRecords(input, "b", 2, 6);
    expect(records.job).toBe("2");
    expect(records.aa.map((r) => [r.round, r.first, r.a, r.b])).toEqual([
      [6, "a", 10, 30],
      [7, "b", 11, 31],
      [8, "b", 12, 32],
    ]);
    expect(pairRecords(input.report, "a", "c", 0)).toEqual([]);
  });
});

describe("timeBudget", () => {
  it("promotes an arm with a pooled outcome same and a tail within the limit", () => {
    const b = timeBudget(five(), "b");
    expect(b.verdict).toBe("promoted");
    expect(b.pooled).toMatchObject({ outcome: "same", cases: 24, noiseCap: BUDGET_POLICY.noiseCap, margin: 0.05, opposed: [] });
    // Each job has 3 rounds with arm a first in the candidate pair and 2 in the A/A pair, of 5. Thus the balance removes 4 records of each case in each pair.
    expect(b.pooled!.trimmed).toBe(24 * 4 * 2);
    expect(b.jobs.map((j) => [j.job, j.roundOffset, j.cpu, j.outcome])).toEqual([0, 1, 2, 3, 4].map((j) => [String(j), j * 5, "Test CPU", "same"]));
    expect(b.tail).toMatchObject({ measured: true, outcome: "within", set: 24, within: 24, beyond: 0, undecided: 0 });
    expect(b.reasons).toEqual([]);
  });

  it("does not promote an arm with a pooled outcome slower", () => {
    const b = timeBudget(five({ ratio: () => 1.3 }), "b");
    expect(b.pooled!.outcome).toBe("slower");
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons[0]).toMatch(/^time: the pooled outcome is slower\./);
  });

  it("does not promote an arm with tail cases beyond the limit", () => {
    const b = timeBudget(five({ ratio: (c) => (c < 3 ? 3 : 1) }), "b");
    expect(b.pooled!.outcome).toBe("same");
    expect(b.tail).toMatchObject({ outcome: "beyond", beyond: 3, within: 21 });
    expect(b.tail!.cases.filter((c) => c.outcome === "beyond").map((c) => c.case)).toEqual(["case0", "case1", "case2"]);
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons[0]).toMatch(/^tail: 3 of 24 cases are beyond the limit 2\./);
  });

  it("cannot decide with a noisy A/A arm", () => {
    const b = timeBudget(five({ aaSigma: 0.5, baseMs: () => 1 }), "b");
    expect(b.pooled!.aaSpread!).toBeGreaterThan(BUDGET_POLICY.noiseCap);
    expect(b.pooled!.outcome).toBe("cannot decide");
    expect(b.tail).toMatchObject({ measured: false, outcome: null, set: 0 });
    expect(b.verdict).toBe("cannot decide");
    expect(b.reasons[0]).toMatch(/above the noise cap 0\.156/);
  });

  it("cannot decide when one job gives the opposite direction of the pooled outcome", () => {
    const jobs = five({ ratio: () => 0.8 });
    jobs[4] = job("run5", { ratio: () => 1.5 });
    const b = timeBudget(jobs, "b");
    expect(b.jobs.map((j) => j.outcome)).toEqual(["faster", "faster", "faster", "faster", "slower"]);
    expect(b.pooled).toMatchObject({ outcome: "cannot decide", opposed: ["4"] });
    expect(b.verdict).toBe("cannot decide");
  });

  it("records the tail as not measured with no case above timeFloorMs", () => {
    const b = timeBudget(five(), "b", { ...BUDGET_POLICY, timeFloorMs: 100 });
    expect(b.verdict).toBe("promoted");
    expect(b.tail).toMatchObject({ measured: false, set: 0 });
    expect(b.reasons).toEqual(["tail: not measured, no input above 100 ms"]);
    expect(budgetMarkdown(b)).toContain("Tail: not measured, no input above 100 ms.");
  });

  it("cannot decide with fewer jobs, another mode, a mixed corpus, no A/A arm, or too few cases or rounds", () => {
    expect(timeBudget(five().slice(0, 4), "b").reasons).toEqual(["a decision needs 5 jobs, not 4"]);
    const mixed = five();
    mixed[1] = { ...mixed[1]!, corpus: "set-v2" };
    expect(timeBudget(mixed, "b").reasons).toEqual(["the jobs have more than one corpus: set-v1, set-v2"]);
    const inProcess = five().map((r) => ({ ...r, report: { ...r.report, mode: "process" as const } }));
    expect(timeBudget(inProcess, "b").reasons).toEqual(["the mode is process, not fresh"]);
    const plain = five();
    plain[2] = job("run3", {}, { arms: ["a", "b"] });
    expect(timeBudget(plain, "b")).toMatchObject({ verdict: "cannot decide", reasons: ["the job run3 has no A/A arm"], pooled: null });
    expect(timeBudget(five({ cases: 10 }), "b").reasons).toHaveLength(5);
    expect(timeBudget(five({ rounds: 4 }), "b").reasons[0]).toBe("the job run1 has 4 rounds of a case, and a decision needs 5");
  });

  it("writes the settings, the pooled verdict, the tail and the jobs as Markdown", () => {
    const md = budgetMarkdown(timeBudget(five({ ratio: (c) => (c < 3 ? 3 : 1) }), "b", BUDGET_POLICY, "https://example.com/runs/1"));
    expect(md).toContain("## The time test of b against a on set-v1: not promoted");
    expect(md).toContain("Settings: timeMargin 0.05, noiseCap 0.156, jobs 5, cases 20, rounds 5, timeFloorMs 5, timeTail 2, timeTailQ 0.95, timeTailLevel 0.95.");
    expect(md).toContain("CI run: https://example.com/runs/1");
    expect(md).toContain("The balance removed 192 records.");
    expect(md).toContain("Tail (cases of 5 ms or more): beyond, 21 within, 3 beyond, 0 cannot decide of 24, limit 2.");
    expect(md).toMatch(/\| 0 \| run1 \| Test CPU \| 24 \| 5 \| same \|/);
    expect(md).toMatch(/\| case[0-2] \| [\d.]+ \| \[[\d.]+, [\d.]+\] \| [\d.]+ \| beyond \|/);
  });
});
