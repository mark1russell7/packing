import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { BUDGET_POLICY, budgetMarkdown, timeBudget, type BudgetInput } from "./time-budget.ts";

/** This function makes a made-up run: the arm `b` has the ratio of each value, and the A/A arm has the ratio of `aa` on each input. The first input is under the relevance floor. */
function run(name: string, ratios: number[], aa: number[] = ratios.map(() => 1), over: Partial<PairedReport> = {}): BudgetInput {
  const inputs = ratios.map((r, i) => ({ id: `i${i}`, group: "all", ms: {}, median: { a: i === 0 ? 0.05 : 8, b: (i === 0 ? 0.05 : 8) * r }, ratio: { b: r, "a~aa": aa[i]! } }));
  const sorted = [...aa].sort((x, y) => x - y);
  const report = {
    schema: "paired-time/1",
    mode: "process",
    env: { cpu: "Test CPU", cores: 1, os: "test", arch: "x64", node: "v0" },
    base: "a",
    arms: ["a", "b", "a~aa"],
    inputs,
    ratios: {},
    noiseFloor: { median: sorted[Math.floor(sorted.length / 2)]!, p10: sorted[0]!, p90: sorted.at(-1)! },
    ...over,
  } as PairedReport;
  return { run: name, report, corpus: "set-v1" };
}

const five = (ratios: number[], aa?: number[]) => [1, 2, 3, 4, 5].map((n) => run(`run${n}`, ratios, aa));

describe("timeBudget", () => {
  it("promotes an arm with the worst median and the worst tail in the budget", () => {
    const b = timeBudget(five([1.1, 1.2, 1.3, 1.4, 1.5]), "b");
    expect(b.verdict).toBe("promoted");
    expect(b.median).toEqual({ worst: 1.3, limit: 1.5, pass: true });
    expect(b.tail).toMatchObject({ worst: 1.485, measured: true, pass: true });
    expect(b.runs[0]!.tailSet).toBe(4);
    expect(b.resolution.median).toEqual({ worstAaP90: 1, spread: 0, least: 1, valid: true });
    expect(b.runs[0]).toMatchObject({ underOldFloor: 0.2, under01ms: 0.2 });
    expect(b.reasons).toEqual([]);
  });

  it("does not promote an arm with one run above the median budget", () => {
    const runs = five([1.1, 1.2, 1.3, 1.4, 1.5]);
    runs[3] = run("run4", [1.4, 1.5, 1.6, 1.7, 1.8]);
    const b = timeBudget(runs, "b");
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons).toEqual(["the worst median 1.6 is above the budget 1.5"]);
  });

  it("cannot decide when the worst A/A p90 plus the spread of the runs is not under the budget", () => {
    // Alone, the worst A/A p90 1.4 is under 1.5. The spread 1.4 - 1.3 makes the least 1.5.
    expect(timeBudget(five([1, 1, 1, 1, 1], [1, 1, 1, 1, 1.4]), "b").resolution.median).toEqual({ worstAaP90: 1.4, spread: 0, least: 1.4, valid: true });
    const runs = five([1, 1, 1, 1, 1], [1, 1, 1, 1, 1.3]);
    runs[2] = run("run3", [1, 1, 1, 1, 1], [1, 1, 1, 1, 1.4]);
    const b = timeBudget(runs, "b");
    expect(b.verdict).toBe("cannot decide");
    expect(b.resolution.median).toEqual({ worstAaP90: 1.4, spread: 0.1, least: 1.5, valid: false });
    expect(b.reasons).toEqual(["noise: the worst A/A p90 1.4 plus the spread 0.1 is 1.5, not under the budget 1.5"]);
  });

  it("cannot decide with a run whose A/A band from p10 to p90 does not contain 1", () => {
    const runs = five([1.1, 1.2, 1.3, 1.4, 1.5]);
    runs[1] = run("run2", [1.1, 1.2, 1.3, 1.4, 1.5], [0.71, 0.8, 0.9, 0.95, 0.99]);
    const b = timeBudget(runs, "b");
    expect(b.verdict).toBe("cannot decide");
    expect(b.reasons).toEqual(["the run run2 has the A/A band 0.71 to 0.99, without 1: it measured the runner, and a new run replaces it"]);
  });

  it("does not promote an arm that fails in one run of 5", () => {
    const runs = five([1, 1, 1, 1, 1]);
    runs[4] = run("run5", [1, 1, 1, 1, 2.5]);
    const b = timeBudget(runs, "b");
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons).toEqual(["the worst tail 2.275 is above the budget 2"]);
  });

  it("records the tail as not measured with an empty tail set", () => {
    const b = timeBudget(five([1.1, 1.2, 1.3, 1.4, 1.5]), "b", { ...BUDGET_POLICY, floorMs: 100 });
    expect(b.verdict).toBe("promoted");
    expect(b.runs[0]!.tailSet).toBe(0);
    expect(b.tail.measured).toBe(false);
    expect(b.reasons).toEqual(["tail: not measured, no input above 100 ms"]);
    expect(budgetMarkdown(b)).toContain("Tail: not measured, no input above 100 ms.");
  });

  it("does not promote an arm with a tail above the budget on the tail set", () => {
    const b = timeBudget(five([30, 1, 1, 1, 2.5]), "b");
    expect(b.runs[0]!.tail).toBeCloseTo(2.275);
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons).toEqual(["the worst tail 2.275 is above the budget 2"]);
  });

  it("cannot decide with fewer runs, another mode, a mixed corpus or no A/A arm", () => {
    expect(timeBudget(five([1]).slice(0, 4), "b").reasons).toEqual(["a decision needs 5 runs, not 4"]);
    const mixed = five([1]);
    mixed[1] = { ...mixed[1]!, corpus: "set-v2" };
    expect(timeBudget(mixed, "b").reasons).toEqual(["the runs have more than one corpus: set-v1, set-v2"]);
    const fresh = five([1]).map((r) => ({ ...r, report: { ...r.report, mode: "fresh" as const } }));
    expect(timeBudget(fresh, "b").reasons).toEqual(["the mode is fresh, not process"]);
    const plain = five([1]);
    plain[2] = run("run3", [1], [1], { noiseFloor: null });
    expect(timeBudget(plain, "b")).toMatchObject({ verdict: "cannot decide", reasons: ["the run run3 has no A/A arm"] });
  });

  it("writes the policy, the resolution and the runs as Markdown", () => {
    const md = budgetMarkdown(timeBudget(five([1.1, 1.2, 1.3, 1.4, 1.5]), "b", BUDGET_POLICY));
    expect(md).toContain("## The time budget of b against a on set-v1: promoted");
    expect(md).toContain("Resolution: the worst A/A p90 1 plus the spread 0 gives 1 (valid).");
    expect(md).toContain("| run1 | Test CPU | 5 | 1.3 | 1.485 | 1 | 1 | 1 | 1 | 4 | 0.2 | 0.2 |");
  });
});
