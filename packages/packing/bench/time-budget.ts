// The time test of a promotion (k128, k133): the candidate against the default, over the CI jobs of `paired-time.yml`.
//
// The rule is the time test of the linked win test (docs/WIN-TEST.md of rigor). This file keeps no verdict logic:
// the pooled verdict, the balance of the orders and the tail verdict come from `@mark1russell7/rigor-bench`.
// This file only turns the `paired-time/3` reports into the records of rigor-bench, and writes the record.

import { armOrder, modelTest, balanceOrders, limitVerdict, pooledVerdict, type Arm, type JobRecords, type LimitOutcome, type PairedTime, type TimeOutcome } from "@mark1russell7/rigor-bench";
import { aaId, assertPairedOrder, quantileOf, type PairedReport } from "./paired-time.ts";

/**
 * The settings of the time test, as the settings table of the linked win test names them. A change of a value is a measured decision.
 *
 * The defaults are placeholders until a measured decision sets them. `timeMargin` 0.05 and `jobs` 5 come from the joint bench of layout-contract.
 */
export interface BudgetPolicy {
  /** The half width of the margin on a log scale. An interval in `[exp(-timeMargin), exp(timeMargin)]` is `same`. */
  timeMargin: number;
  /** The largest A/A spread on a log scale. A larger spread gives `cannot decide`. It also limits the A/A median ratio. */
  noiseCap: number;
  /** The count of the CI jobs that a decision needs */
  jobs: number;
  /** The fewest cases of each job */
  cases: number;
  /** The fewest rounds of each case in each job */
  rounds: number;
  /** The smallest median time in milliseconds of a case of the tail set */
  timeFloorMs: number;
  /** The largest ratio of a case of the tail set */
  timeTail: number;
  /** The share of the tail set that is `within` the limit `timeTail` */
  timeTailQ: number;
  /** The level of the interval of each case of the tail set */
  timeTailLevel: number;
}

/**
 * The placeholder settings of the time test. Each value waits for a measured decision.
 *
 * - `timeMargin` 0.05, `jobs` 5, `cases` 20 and `rounds` 5 come from the joint bench of layout-contract.
 * - `timeFloorMs` 5, `timeTail` 2 and `timeTailQ` 0.95 come from the earlier time row of packing.
 * - `timeTailLevel` 0.95 is the default of the linked win test.
 * - `noiseCap` 0.156 is a proposal (k133), not a decision. The A/A spreads of 3 k66 jobs alone are 0.1347, 0.1379 and 0.1196.
 *   The proposal is the worst job plus the spread of the jobs: 0.1379 + 0.0183. The merged records of the 3 jobs give 0.0752.
 */
export const BUDGET_POLICY: BudgetPolicy = Object.freeze({
  timeMargin: 0.05,
  noiseCap: 0.156,
  jobs: 5,
  cases: 20,
  rounds: 5,
  timeFloorMs: 5,
  timeTail: 2,
  timeTailQ: 0.95,
  timeTailLevel: 0.95,
});

/** One CI job of the time test: its report, the corpus of its run and its filter `--only`. */
export interface BudgetInput {
  run: string;
  report: PairedReport;
  corpus: string;
  only?: string;
}

/** The verdict of one job alone. */
export interface BudgetJob {
  /** The label of the job in the pooled verdict: its index */
  job: string;
  run: string;
  cpu: string;
  cases: number;
  /** The fewest rounds of a case of the job */
  rounds: number;
  /** The first round of the job in the merged records */
  roundOffset: number;
  outcome: TimeOutcome;
  /** The interval of the candidate median over the A/A median, or `null` without an interval */
  interval: [number, number] | null;
  aaMedian: number | null;
  aaSpread: number | null;
  reason: string;
}

/** The pooled verdict of the merged records of all jobs. */
export interface BudgetPooled {
  outcome: TimeOutcome;
  /** The interval of the candidate median over the A/A median, or `null` without an interval */
  interval: [number, number] | null;
  aaMedian: number | null;
  aaSpread: number | null;
  noiseCap: number;
  margin: number;
  cases: number;
  /** The count of the records that `balanceOrders` removed from the merged candidate and A/A records */
  trimmed: number;
  /** The jobs that give the opposite direction of the pooled outcome */
  opposed: string[];
  reason: string;
}

/** The outcome of one case of the tail set. */
export interface BudgetTailCase {
  case: string;
  ratio: number;
  low: number;
  high: number;
  /** The high end of the interval of the case, times the high end of the A/A band */
  bound: number;
  /** The low end of the interval of the case, times the low end of the A/A band */
  floor: number;
  outcome: LimitOutcome;
}

/** The time tail of the merged records. */
export interface BudgetTail {
  /** The value `false` tells that no case has a median time of `timeFloorMs` or more */
  measured: boolean;
  /** The outcome of `limitVerdict` over the tail set, or `null` when the tail is not measured */
  outcome: LimitOutcome | null;
  limit: number;
  level: number;
  set: number;
  /** The share of the tail set that the tail needs `within`: the setting `timeTailQ` */
  share: number;
  /** The number of cases of the tail set that can be other than `within`, from `limitVerdict` */
  allowed: number;
  reason: string;
  cases: BudgetTailCase[];
}

/** The verdict of the time test. */
export type BudgetVerdict = "promoted" | "not promoted" | "cannot decide";

/** The CPU models of the jobs. A time budget does not test them: its verdict reads the ratios inside each job. */
export interface BudgetModels {
  /** Each model with its count of jobs, sorted by model */
  models: { model: string; jobs: number }[];
  /** The words "models not tested at N jobs" with the floor as the reason. With 1 model or none, it is `null`. */
  line: string | null;
  /** The smallest p that the model test can give at this split, from `modelTest`. With no row to read, it is `null`. */
  floor: number | null;
  /** The first level of Holm at this split, from `modelTest`. With no row to read, it is `null`. */
  level: number | null;
}

/**
 * This function gives the CPU models of the jobs, and the reason that a time budget does not test them.
 * The floor depends only on the counts, so each read has the value 0. A job gives one read: its rounds share one computer, and they are not independent reads of a model.
 */
export function budgetModels(cpus: readonly string[]): BudgetModels {
  const counts = new Map<string, number>();
  for (const cpu of cpus) counts.set(cpu, (counts.get(cpu) ?? 0) + 1);
  const models = [...counts].map(([model, jobs]) => ({ model, jobs })).toSorted((x, y) => (x.model < y.model ? -1 : 1));
  if (models.length < 2) return { models, line: null, floor: null, level: null };
  const rows = modelTest(cpus.map((model) => ({ case: "jobs", model, value: 0 })), { minReads: 2, searchVisible: false }).rows.filter((r) => r.floor !== undefined);
  const head = `models not tested at ${cpus.length} jobs`;
  if (rows.length === 0) return { models, line: `${head}: no model has 2 jobs and other jobs to compare`, floor: null, level: null };
  const floor = Math.min(...rows.map((r) => r.floor ?? 1));
  const level = rows[0]?.level ?? 0;
  return { models, line: `${head}: the smallest p of this split is ${floor.toFixed(4)}, and the first level of Holm is ${level.toFixed(4)}`, floor, level };
}

/** The record of the time test (schema `packing-time-budget/4`). */
export interface BudgetResult {
  schema: "packing-time-budget/4";
  corpus: string;
  mode: string;
  base: string;
  arm: string;
  only?: string;
  /** The URL of the CI run of the jobs */
  ci?: string;
  policy: BudgetPolicy;
  jobs: BudgetJob[];
  pooled: BudgetPooled | null;
  tail: BudgetTail | null;
  verdict: BudgetVerdict;
  reasons: string[];
  /** The CPU models of the jobs. The verdict does not say that the models agree. */
  models: BudgetModels;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const pairOf = (i: { low: number; high: number } | undefined): [number, number] | null => (i === undefined ? null : [r4(i.low), r4(i.high)]);
const orNull = (x: number | undefined): number | null => (x === undefined ? null : r4(x));

/**
 * This function gives the arm of a pair that started first in one round of mode `fresh`.
 *
 * - The arms of a `paired-time/3` report run in the order of `armOrder` of `@mark1russell7/rigor-bench`.
 * - The pair is the arm `a` at the index `aAt` of `report.arms`, and the arm `b` at the index `bAt`.
 */
export function firstOfPair(arms: number, aAt: number, bAt: number, round: number): Arm {
  const order = armOrder(Array.from({ length: arms }, (_, at) => at), round);
  return order.indexOf(aAt) < order.indexOf(bAt) ? "a" : "b";
}

/**
 * This function gives the records of one pair of a report, for the pooled verdict of rigor-bench.
 *
 * - Each input gives one record for each round, with the times of the arms `a` and `b` of that round.
 * - The round of a record is `offset` plus the round of the report. The first arm comes from the round of the report.
 * - An input without the times of the two arms gives no records.
 */
export function pairRecords(report: PairedReport, a: string, b: string, offset: number): PairedTime[] {
  assertPairedOrder(report);
  const aAt = report.arms.indexOf(a);
  const bAt = report.arms.indexOf(b);
  if (aAt < 0 || bAt < 0) return [];
  return report.inputs.flatMap((input) => {
    const as = input.ms[a];
    const bs = input.ms[b];
    if (as === undefined || bs === undefined) return [];
    const rounds = Math.min(as.length, bs.length);
    return Array.from({ length: rounds }, (_, round) => ({ case: input.id, round: offset + round, first: firstOfPair(report.arms.length, aAt, bAt, round), a: as[round]!, b: bs[round]! }));
  });
}

/** This function gives the records of one job: the candidate pair (base, arm) and the A/A pair (base, `<base>~aa`). */
export function jobRecords(input: BudgetInput, arm: string, job: number, offset: number): JobRecords {
  const r = input.report;
  return { job: String(job), candidate: pairRecords(r, r.base, arm, offset), aa: pairRecords(r, r.base, aaId(r.base), offset) };
}

/** This function gives the fewest rounds of a case of a report for the arm, or 0 with no case. */
function roundsOf(r: PairedReport, arm: string): number {
  const counts = r.inputs.flatMap((i) => (i.ms[r.base] === undefined || i.ms[arm] === undefined ? [] : [Math.min(i.ms[r.base]!.length, i.ms[arm]!.length)]));
  return counts.length === 0 ? 0 : Math.min(...counts);
}

/** This function gives the cases of the tail set. Each case has a median time of `floorMs` or more in arm `a` or arm `b`. */
function tailSet(records: readonly PairedTime[], floorMs: number): Set<string> {
  const byCase = new Map<string, { a: number[]; b: number[] }>();
  for (const r of records) {
    const times = byCase.get(r.case) ?? { a: [], b: [] };
    times.a.push(r.a);
    times.b.push(r.b);
    byCase.set(r.case, times);
  }
  return new Set([...byCase].filter(([, t]) => quantileOf(t.a, 0.5) >= floorMs || quantileOf(t.b, 0.5) >= floorMs).map(([c]) => c));
}

/**
 * This function gives the time tail of the merged records with `limitVerdict` of rigor-bench.
 *
 * The option `share` of `limitVerdict` is the setting `timeTailQ`. The tail is `within` when `allowed` cases or fewer are other than `within`.
 * The tail is `beyond` when more than `allowed` cases are `beyond`.
 */
function timeTail(candidate: readonly PairedTime[], aa: readonly PairedTime[], policy: BudgetPolicy): BudgetTail {
  const set = tailSet(candidate, policy.timeFloorMs);
  const base = { limit: policy.timeTail, level: policy.timeTailLevel, set: set.size, share: policy.timeTailQ };
  if (set.size === 0) {
    return { ...base, measured: false, outcome: null, allowed: 0, reason: `tail: not measured, no input above ${policy.timeFloorMs} ms`, cases: [] };
  }
  const v = limitVerdict(
    candidate.filter((r) => set.has(r.case)),
    aa,
    { limit: policy.timeTail, caseLevel: policy.timeTailLevel, share: policy.timeTailQ },
  );
  const cases = v.cases.map((c) => ({ case: c.case, ratio: r4(c.ratio), low: r4(c.low), high: r4(c.high), bound: r4(c.bound), floor: r4(c.floor), outcome: c.outcome }));
  return { ...base, share: v.share, measured: true, outcome: v.outcome, allowed: v.allowed, reason: v.reason, cases };
}

/**
 * This function gives the verdict of the time test of an arm over the CI jobs, with the time test of rigor-bench.
 *
 * - The jobs are of one corpus, one filter, mode `fresh` and one base, each with the arm and the A/A arm. Else the verdict is `cannot decide`.
 * - A decision needs `jobs` jobs, each with `cases` cases and `rounds` rounds or more. Else the verdict is `cannot decide`.
 * - Each job uses its own range of rounds: the job `j` starts at the round `j` times the most rounds of a job.
 * - `pooledVerdict` gives the pooled outcome, with the options `margin` (`timeMargin`) and `noiseCap`.
 * - `limitVerdict` gives the time tail on the merged records that `balanceOrders` keeps.
 * - The outcome `slower` or a tail `beyond` gives `not promoted`. Each other `cannot decide` gives `cannot decide`.
 * - The outcome `same` or `faster` with a tail `within` gives `promoted`. An empty tail set does not stop a promotion.
 */
export function timeBudget(inputs: readonly BudgetInput[], arm: string, policy: BudgetPolicy = BUDGET_POLICY, ci?: string): BudgetResult {
  const reasons: string[] = [];
  const one = <T>(of: (i: BudgetInput) => T, what: string): T | undefined => {
    const values = [...new Set(inputs.map(of))];
    if (values.length > 1) reasons.push(`the jobs have more than one ${what}: ${values.join(", ")}`);
    return values[0];
  };
  const corpus = one((i) => i.corpus, "corpus") ?? "";
  const mode = one((i) => i.report.mode, "mode") ?? "";
  const base = one((i) => i.report.base, "base") ?? "";
  const only = one((i) => i.only, "filter");
  if (inputs.length < policy.jobs) reasons.push(`a decision needs ${policy.jobs} jobs, not ${inputs.length}`);
  if (inputs.length > 0 && mode !== "fresh") reasons.push(`the mode is ${mode}, not fresh`);
  for (const i of inputs) {
    if (!i.report.arms.includes(arm)) reasons.push(`the job ${i.run} has no arm ${arm}`);
    if (!i.report.arms.includes(aaId(i.report.base))) reasons.push(`the job ${i.run} has no A/A arm`);
  }
  const models = budgetModels(inputs.map((i) => i.report.env.cpu));
  const head = { schema: "packing-time-budget/4" as const, corpus, mode, base, arm, ...(only !== undefined ? { only } : {}), ...(ci !== undefined ? { ci } : {}), policy, models };
  if (reasons.length > 0) return { ...head, jobs: [], pooled: null, tail: null, verdict: "cannot decide", reasons };

  const span = Math.max(...inputs.map((i) => Math.max(0, ...i.report.inputs.flatMap((x) => Object.values(x.ms).map((m) => m.length)))));
  const records = inputs.map((input, j) => jobRecords(input, arm, j, j * span));
  for (const [j, input] of inputs.entries()) {
    const cases = new Set(records[j]!.candidate.map((r) => r.case)).size;
    const rounds = roundsOf(input.report, arm);
    if (cases < policy.cases) reasons.push(`the job ${input.run} has ${cases} cases, and a decision needs ${policy.cases}`);
    if (rounds < policy.rounds) reasons.push(`the job ${input.run} has ${rounds} rounds of a case, and a decision needs ${policy.rounds}`);
  }
  if (reasons.length > 0) return { ...head, jobs: [], pooled: null, tail: null, verdict: "cannot decide", reasons };

  const v = pooledVerdict(records, { margin: policy.timeMargin, noiseCap: policy.noiseCap });
  const jobs = v.jobs.map(({ job, verdict }, j): BudgetJob => {
    const input = inputs[j]!;
    return {
      job,
      run: input.run,
      cpu: input.report.env.cpu,
      cases: verdict.cases.length,
      rounds: roundsOf(input.report, arm),
      roundOffset: j * span,
      outcome: verdict.outcome,
      interval: pairOf(verdict.interval),
      aaMedian: orNull(verdict.noise?.aaMedian),
      aaSpread: orNull(verdict.noise?.spread),
      reason: verdict.reason,
    };
  });
  const pooled: BudgetPooled = {
    outcome: v.outcome,
    interval: pairOf(v.pooled.interval),
    aaMedian: orNull(v.pooled.noise?.aaMedian),
    aaSpread: orNull(v.pooled.noise?.spread),
    noiseCap: policy.noiseCap,
    margin: policy.timeMargin,
    cases: v.pooled.cases.length,
    trimmed: v.trimmed,
    opposed: v.opposed,
    reason: v.reason,
  };
  const candidate = balanceOrders(records.flatMap((r) => r.candidate)).records;
  const aa = balanceOrders(records.flatMap((r) => r.aa)).records;
  const tail = timeTail(candidate, aa, policy);

  let verdict: BudgetVerdict;
  if (pooled.outcome === "slower") {
    verdict = "not promoted";
    reasons.push(`time: the pooled outcome is slower. ${pooled.reason}`);
  } else if (tail.outcome === "beyond") {
    verdict = "not promoted";
    reasons.push(`tail: ${tail.reason}`);
  } else if (pooled.outcome === "cannot decide" || tail.outcome === "cannot decide") {
    verdict = "cannot decide";
    if (pooled.outcome === "cannot decide") reasons.push(`time: ${pooled.reason}`);
    if (tail.outcome === "cannot decide") reasons.push(`tail: ${tail.reason}`);
  } else {
    verdict = "promoted";
    if (!tail.measured) reasons.push(tail.reason);
  }
  return { ...head, jobs, pooled, tail, verdict, reasons };
}

/** The most tail cases in the Markdown of the record. The JSON record keeps each case. */
const TAIL_ROWS = 50;

/** This function writes each model with its count of jobs. With 2 or more models, it also states that the verdict does not say that the models agree. */
export function budgetModelLines(m: BudgetModels): string[] {
  if (m.models.length === 0) return [];
  const names = m.models.map((x) => `${x.model} (${x.jobs} ${x.jobs === 1 ? "job" : "jobs"})`).join(", ");
  return [m.line === null ? `CPU model: ${names}.` : `CPU models: ${names}. ${m.line}. The verdict reads the ratios inside each job, and it does not say that the models agree.`];
}

/** This function writes the record of the time test as Markdown. */
export function budgetMarkdown(b: BudgetResult): string {
  const p = b.policy;
  const range = (i: [number, number] | null) => (i === null ? "none" : `[${i[0]}, ${i[1]}]`);
  const rows = b.jobs.map((j) => `| ${j.job} | ${j.run} | ${j.cpu} | ${j.cases} | ${j.rounds} | ${j.outcome} | ${range(j.interval)} | ${j.aaMedian ?? "none"} | ${j.aaSpread ?? "none"} |`);
  const pooled = b.pooled;
  const tail = b.tail;
  const failed = (tail?.cases ?? []).filter((c) => c.outcome !== "within").toSorted((x, y) => y.bound - x.bound);
  const shown = failed.slice(0, TAIL_ROWS);
  return [
    `## The time test of ${b.arm} against ${b.base} on ${b.corpus}: ${b.verdict}`,
    "",
    `Settings: timeMargin ${p.timeMargin}, noiseCap ${p.noiseCap}, jobs ${p.jobs}, cases ${p.cases}, rounds ${p.rounds}, timeFloorMs ${p.timeFloorMs}, timeTail ${p.timeTail}, timeTailQ ${p.timeTailQ}, timeTailLevel ${p.timeTailLevel}.`,
    ...(b.ci !== undefined ? [`CI run: ${b.ci}`] : []),
    ...budgetModelLines(b.models),
    ...(pooled === null
      ? []
      : [
          `Pooled: ${pooled.outcome}, interval ${range(pooled.interval)} on ${pooled.cases} cases, A/A median ${pooled.aaMedian ?? "none"}, A/A spread ${pooled.aaSpread ?? "none"} (noise cap ${pooled.noiseCap}, margin ${pooled.margin}). The balance removed ${pooled.trimmed} records.${pooled.opposed.length > 0 ? ` Opposed jobs: ${pooled.opposed.join(", ")}.` : ""}`,
        ]),
    ...(tail === null
      ? []
      : [tail.measured ? `Tail (cases of ${p.timeFloorMs} ms or more): ${tail.outcome} over ${tail.set} cases, limit ${tail.limit}, share ${tail.share}, ${tail.allowed} allowed. ${tail.reason}` : `Tail: not measured, no input above ${p.timeFloorMs} ms.`]),
    ...(b.reasons.length > 0 ? ["", `Reasons: ${b.reasons.join(" ")}`] : []),
    ...(rows.length === 0
      ? []
      : ["", "| Job | Run | CPU | Cases | Rounds | Outcome | Interval | A/A median | A/A spread |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows]),
    ...(failed.length === 0
      ? []
      : [
          "",
          `The tail cases that are not within the limit, with the highest bound first${failed.length > shown.length ? ` (${shown.length} of ${failed.length}, \`budget.json\` has all)` : ""}:`,
          "",
          "| Tail case | Ratio | Interval | Bound | Outcome |",
          "| --- | --- | --- | --- | --- |",
          ...shown.map((c) => `| ${c.case} | ${c.ratio} | [${c.low}, ${c.high}] | ${c.bound} | ${c.outcome} |`),
        ]),
    "",
  ].join("\n");
}
