// The time budget of a promotion (k128): the paired time test of a candidate against the default, over 5 CI runs of `paired-time.yml`.
//
// The budget is a policy, not a measured limit. The A/A arm of each report gives the resolution of the test.

import { aaId, quantileOf, type PairedReport } from "./paired-time.ts";

/** The policy of the time budget. The defaults are `timeRatio`, `timeTail` and `timeTailQ` of `docs/PROMOTION.md`. */
export interface BudgetPolicy {
  /** The worst median ratio of the runs is at most this value */
  median: number;
  /** The worst tail ratio of the runs is at most this value */
  tail: number;
  /** The quantile of the tail */
  tailQ: number;
  /** The runs that a decision needs */
  runs: number;
  /** The relevance floor `timeFloorMs`: an input with a base median and an arm median under it leaves the tail set */
  floorMs: number;
}

/** The time budget of `docs/PROMOTION.md`: median 1.5, q95 2, 5 runs and the relevance floor 5 ms. */
export const BUDGET_POLICY: BudgetPolicy = Object.freeze({ median: 1.5, tail: 2, tailQ: 0.95, runs: 5, floorMs: 5 });

/** The base time of the old floor `timeFloorMs / timeRatio` (5 / 1.5 ms). It is only a report field. */
export const OLD_FLOOR_MS = 5 / 1.5;

/** One paired run of the budget test: its report, the corpus of its run and its filter `--only`. */
export interface BudgetInput {
  run: string;
  report: PairedReport;
  corpus: string;
  only?: string;
}

/** The numbers of one run. */
export interface BudgetRun {
  run: string;
  cpu: string;
  inputs: number;
  median: number;
  tail: number;
  aaMedian: number;
  aaP10: number;
  aaP90: number;
  /** The `tailQ` quantile of the A/A ratios on the tail set */
  aaTail: number;
  /** The inputs of the tail set: a base median or an arm median of `floorMs` or more */
  tailSet: number;
  /** The share of inputs with a base median under 5 / 1.5 ms, a report only */
  underOldFloor: number;
  /** The share of inputs with a base median under 0.1 ms, a report only */
  under01ms: number;
}

/** The verdict of the time budget. */
export type BudgetVerdict = "promoted" | "not promoted" | "cannot decide";
// A decision that is not valid for noise gives `cannot decide`, with the check and the A/A value in the reasons.

/** The result of the time budget (schema `packing-time-budget/1`). */
export interface BudgetResult {
  schema: "packing-time-budget/1";
  corpus: string;
  mode: string;
  base: string;
  arm: string;
  only?: string;
  policy: BudgetPolicy;
  runs: BudgetRun[];
  /** The resolution checks: the policy value is more than the worst A/A value of the runs plus their spread (largest minus smallest) */
  resolution: {
    median: { worstAaP90: number; spread: number; least: number; valid: boolean };
    tail: { worstAaTail: number; spread: number; least: number; valid: boolean };
  };
  median: { worst: number; limit: number; pass: boolean };
  /** The tail check. With an empty tail set in each run, `measured` is false and the check does not stop a promotion */
  tail: { worst: number; limit: number; measured: boolean; pass: boolean };
  verdict: BudgetVerdict;
  reasons: string[];
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** This function gives the numbers of one report for the arm against its base. */
export function budgetRun(input: BudgetInput, arm: string, tailQ: number, floorMs: number): BudgetRun {
  const r = input.report;
  const ratios = r.inputs.map((i) => i.ratio[arm]).filter((x): x is number => x !== undefined);
  const relevant = r.inputs.filter((i) => i.ratio[arm] !== undefined && !((i.median[r.base] ?? 0) < floorMs && (i.median[arm] ?? 0) < floorMs));
  const tails = relevant.map((i) => i.ratio[arm]!);
  const aa = relevant.map((i) => i.ratio[aaId(r.base)]).filter((x): x is number => x !== undefined);
  const base = r.inputs.map((i) => i.median[r.base]).filter((x): x is number => x !== undefined);
  const share = (ms: number) => (base.length === 0 ? Number.NaN : base.filter((b) => b < ms).length / base.length);
  return {
    run: input.run,
    cpu: r.env.cpu,
    inputs: ratios.length,
    median: r4(quantileOf(ratios, 0.5)),
    tail: r4(quantileOf(tails, tailQ)),
    aaMedian: r4(r.noiseFloor?.median ?? Number.NaN),
    aaP10: r4(r.noiseFloor?.p10 ?? Number.NaN),
    aaP90: r4(r.noiseFloor?.p90 ?? Number.NaN),
    aaTail: r4(quantileOf(aa, tailQ)),
    tailSet: tails.length,
    underOldFloor: r4(share(OLD_FLOOR_MS)),
    under01ms: r4(share(0.1)),
  };
}

/**
 * This function gives the verdict of the time budget of an arm over some paired runs.
 *
 * - The runs are of one corpus, one filter, mode `fresh` and one base, each with the A/A arm. Else the verdict is `cannot decide`.
 * - A run counts only when its A/A band from p10 to p90 contains 1. Else the verdict is `cannot decide`, and a new run replaces it.
 * - The spread of the runs is the largest value minus the smallest value. The resolution has no margin factor.
 * - The median decision is valid when `median > worst A/A p90 + spread`. Else the verdict is `cannot decide`.
 * - The arm passes when the worst median of the runs is at most `median`, and the tail check passes. Thus each run must pass.
 * - The tail set holds the inputs with a base or an arm median of `floorMs` or more. An empty tail set gives `tail: not measured`, which does not stop a promotion.
 * - The tail check needs `tail > worst A/A tail + spread` on the tail set, and a tail set in each run. Else the verdict is `cannot decide`.
 */
export function timeBudget(inputs: readonly BudgetInput[], arm: string, policy: BudgetPolicy = BUDGET_POLICY): BudgetResult {
  const reasons: string[] = [];
  const first = inputs[0];
  const one = <T>(of: (i: BudgetInput) => T, what: string): T | undefined => {
    const values = [...new Set(inputs.map(of))];
    if (values.length > 1) reasons.push(`the runs have more than one ${what}: ${values.join(", ")}`);
    return values[0];
  };
  const corpus = one((i) => i.corpus, "corpus") ?? "";
  const mode = one((i) => i.report.mode, "mode") ?? "";
  const base = one((i) => i.report.base, "base") ?? "";
  const only = one((i) => i.only, "filter");
  if (inputs.length < policy.runs) reasons.push(`a decision needs ${policy.runs} runs, not ${inputs.length}`);
  if (first !== undefined && mode !== "fresh") reasons.push(`the mode is ${mode}, not fresh`);
  for (const i of inputs) {
    if (!i.report.arms.includes(arm)) reasons.push(`the run ${i.run} has no arm ${arm}`);
    const band = i.report.noiseFloor;
    if (band === null) reasons.push(`the run ${i.run} has no A/A arm`);
    else if (!(band.p10 <= 1 && band.p90 >= 1)) reasons.push(`the run ${i.run} has the A/A band ${r4(band.p10)} to ${r4(band.p90)}, without 1: it measured the runner, and a new run replaces it`);
  }
  const runs = inputs.map((i) => budgetRun(i, arm, policy.tailQ, policy.floorMs));
  const noTail = runs.length > 0 && runs.every((r) => r.tailSet === 0);
  const worst = (of: (r: BudgetRun) => number) => (runs.length === 0 ? Number.NaN : Math.max(...runs.map(of)));
  const worstTail = (of: (r: BudgetRun) => number) => {
    const values = runs.filter((r) => r.tailSet > 0).map(of);
    return values.length === 0 ? Number.NaN : Math.max(...values);
  };
  const spreadOf = (values: number[]) => (values.length === 0 ? Number.NaN : r4(Math.max(...values) - Math.min(...values)));
  const tailRuns = runs.filter((r) => r.tailSet > 0);
  const worstAaP90 = worst((r) => r.aaP90);
  const worstAaTail = worstTail((r) => r.aaTail);
  const medianSpread = spreadOf(runs.map((r) => r.aaP90));
  const tailSpread = spreadOf(tailRuns.map((r) => r.aaTail));
  const medianLeast = r4(worstAaP90 + medianSpread);
  const tailLeast = r4(worstAaTail + tailSpread);
  const someTails = !noTail && tailRuns.length < runs.length;
  const resolution = {
    median: { worstAaP90, spread: medianSpread, least: medianLeast, valid: policy.median > medianLeast },
    tail: { worstAaTail, spread: tailSpread, least: tailLeast, valid: noTail || (!someTails && policy.tail > tailLeast) },
  };
  const median = { worst: worst((r) => r.median), limit: policy.median, pass: worst((r) => r.median) <= policy.median };
  const tail = { worst: noTail ? Number.NaN : worstTail((r) => r.tail), limit: policy.tail, measured: !noTail, pass: noTail || worstTail((r) => r.tail) <= policy.tail };
  let verdict: BudgetVerdict;
  if (reasons.length > 0) verdict = "cannot decide";
  else if (!resolution.median.valid) {
    verdict = "cannot decide";
    reasons.push(`noise: the worst A/A p90 ${worstAaP90} plus the spread ${medianSpread} is ${medianLeast}, not under the budget ${policy.median}`);
  } else if (!median.pass) {
    verdict = "not promoted";
    reasons.push(`the worst median ${median.worst} is above the budget ${policy.median}`);
  } else if (!resolution.tail.valid) {
    verdict = "cannot decide";
    if (someTails) reasons.push("noise: some runs have an empty tail set");
    else reasons.push(`noise: the worst A/A q${policy.tailQ * 100} ${worstAaTail} plus the spread ${tailSpread} is ${tailLeast}, not under the tail budget ${policy.tail}`);
  } else if (!tail.pass) {
    verdict = "not promoted";
    reasons.push(`the worst tail ${tail.worst} is above the budget ${policy.tail}`);
  } else {
    verdict = "promoted";
    if (noTail) reasons.push(`tail: not measured, no input above ${policy.floorMs} ms`);
  }
  return { schema: "packing-time-budget/1", corpus, mode, base, arm, ...(only !== undefined ? { only } : {}), policy, runs, resolution, median, tail, verdict, reasons };
}

/** This function writes the result of the time budget as Markdown. */
export function budgetMarkdown(b: BudgetResult): string {
  const rows = b.runs.map((r) => `| ${r.run} | ${r.cpu} | ${r.inputs} | ${r.median} | ${r.tail} | ${r.aaMedian} | ${r.aaP10} | ${r.aaP90} | ${r.aaTail} | ${r.tailSet} | ${r.underOldFloor} | ${r.under01ms} |`);
  const q = `q${b.policy.tailQ * 100}`;
  return [
    `## The time budget of ${b.arm} against ${b.base} on ${b.corpus}: ${b.verdict}`,
    "",
    `Policy: the worst median of ${b.policy.runs} runs is at most ${b.policy.median}, and the worst ${q} is at most ${b.policy.tail}.`,
    `Resolution: the worst A/A p90 ${b.resolution.median.worstAaP90} plus the spread ${b.resolution.median.spread} gives ${b.resolution.median.least} (${b.resolution.median.valid ? "valid" : "not valid"}). The worst A/A ${q} ${b.resolution.tail.worstAaTail} plus the spread ${b.resolution.tail.spread} gives ${b.resolution.tail.least} (${b.resolution.tail.valid ? "valid" : "not valid"}).`,
    `Median: worst ${b.median.worst}, budget ${b.median.limit}. ${b.tail.measured ? `Tail (inputs of ${b.policy.floorMs} ms or more): worst ${b.tail.worst}, budget ${b.tail.limit}.` : `Tail: not measured, no input above ${b.policy.floorMs} ms.`}`,
    ...(b.reasons.length > 0 ? ["", `Reasons: ${b.reasons.join(". ")}.`] : []),
    "",
    `| Run | CPU | Inputs | Median | ${q} | A/A median | A/A p10 | A/A p90 | A/A ${q} | Tail set | Base under 3.33 ms | Base under 0.1 ms |`,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
