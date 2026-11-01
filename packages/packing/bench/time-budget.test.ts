import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { BUDGET_POLICY, budgetMarkdown, timeBudget, type BudgetInput } from "./time-budget.ts";

/** This function makes a made-up run: the arm `b` has the ratio of each value, and the A/A arm has the ratio of `aa` on each input. */
function run(name: string, ratios: number[], aa: number[] = ratios.map(() => 1), over: Partial<PairedReport> = {}): BudgetInput {
  const inputs = ratios.map((r, i) => ({ id: `i${i}`, group: "all", ms: {}, median: { a: i === 0 ? 0.05 : 4 }, ratio: { b: r, "a~aa": aa[i]! } }));
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
    expect(b.tail).toMatchObject({ worst: 1.48, spread: 0, pass: true });
    expect(b.resolution.median).toEqual({ worstAaP90: 1, least: 1.1, valid: true });
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

  it("cannot decide when the A/A p90 times 1.1 is not under the budget", () => {
    const b = timeBudget(five([1, 1, 1, 1, 1], [1, 1, 1, 1, 1.4]), "b");
    expect(b.verdict).toBe("cannot decide");
    expect(b.resolution.median).toEqual({ worstAaP90: 1.4, least: 1.54, valid: false });
  });

  it("does not promote for noise when the tails spread more than the margin", () => {
    const runs = five([1, 1, 1, 1, 1.5]);
    runs[0] = run("run1", [1, 1, 1, 1, 1.9]);
    const b = timeBudget(runs, "b");
    expect(b.verdict).toBe("not promoted");
    expect(b.reasons[0]).toContain("noise: the tails of the runs spread");
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
    expect(md).toContain("Resolution: the worst A/A p90 1 gives 1.1 (valid).");
    expect(md).toContain("| run1 | Test CPU | 5 | 1.3 | 1.48 | 1 | 1 | 1 | 0.2 | 0.2 |");
  });
});
