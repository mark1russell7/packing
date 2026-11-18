// The paired time test of two or more arms, to the shared interface paired-time/4 (k127, k130, R13, `docs/BENCH.md`, "A paired time test of strategies").
//
// This file imports no type of the packer. The rule is STRATEGY.md 49537337 and 211125cd of the fleet: a comparison runs its
// arms in one job, interleaved per input, and an A/A arm (the base against itself) gives the noise floor.
//
// - The harness is `@mark1russell7/rigor-bench` (R13). This file keeps only the report of the packer and its statistics.
// - Mode `process`: one process. Each input gets `timeArmRounds`: the arms in turn, in batches of calls, for each round.
// - Mode `fresh`: a fresh process for each arm, each input and each round, with `freshRun` and the order `arms`.
// - In both modes, the arms of an input turn by the index of the input, and then `armOrder` gives the order of each round.
//
// Schema `paired-time/2` is `paired-time/1` with the fields `passes`, `warm` and `wallMs`. Schema `paired-time/3` is schema 2 in the order of `armOrder`.
// Schema `paired-time/4` is schema 3 with the turn by the input, and each input keeps the order of each round in `orders`.
// A pair reader reads the first arm of a pair with `armPosition`. It refuses a report of schema 1 or 2, because their order is not known.
// A run with the event count adds the field `events` to each input.

import { armOrder, timeArmRounds, type PairedTime, type ProcessArm } from "@mark1russell7/rigor-bench";
import { benchEnv, freshRun, type BenchEnv, type ChildFields, type StartChild } from "@mark1russell7/rigor-bench/fresh";
import { mean, quantile, sd } from "@mark1russell7/rigor-statistics";

/** The mode of a paired time run. */
export type Mode = "process" | "fresh";

/** One arm of a paired time run. Mode `process` uses `run`, and mode `fresh` starts `command` with the child protocol. */
export interface Arm<I> {
  id: string;
  run?: (input: I) => unknown;
  command?: readonly string[];
}

/** One input of a paired time run. The `group` is a fold of the inputs, for example a seed. */
export interface Input<I> {
  id: string;
  group?: string;
  value?: I;
}

/** The events of a child in its timed passes (k130): the GC events and the deopts of each half of the passes. */
export interface ChildEvents {
  gc: [number, number];
  deopt: [number, number];
}

/** The computer of a paired time run: `BenchEnv` of rigor-bench. The `cpu` is the model of the first CPU. */
export type PairedEnv = BenchEnv;

/** The options of `measureIsolated`. */
export interface PairedOptions<I> {
  /** The arms. The arm 0 is the base: the denominator of each ratio. */
  arms: readonly Arm<I>[];
  inputs: readonly Input<I>[];
  /** The timed rounds of each arm on each input */
  repeats: number;
  /** The untimed passes of each child of mode `fresh`, or the untimed batches of each arm before its timed batch in mode `process`. The default is 1. */
  warmup?: number;
  /** The timed passes of each child of mode `fresh`. The time is their median. The default is 1. Mode `process` takes only 1. */
  passes?: number;
  mode: Mode;
  /** The value `true` adds a second copy of the base with the id `${base}~aa`. The default is `true`. */
  aa?: boolean;
  /** The clock in milliseconds for mode `process`. The default is `performance.now`. */
  clock?: () => number;
  /** The start of a child for mode `fresh`: `StartChild` of rigor-bench. The default starts a process. A test gives its own. */
  start?: StartChild;
  /** The computer. The default is `benchEnv()` of rigor-bench. */
  env?: PairedEnv;
  /** The context of the run: `ci` or `local` (or `BENCH_MODE`), with the Node.js flags. The default is the context of this process. */
  context?: string;
}

/** The ratios of one arm over the base. */
export interface PairedRatio {
  /** The inputs with a time of the arm and of the base */
  inputs: number;
  median: number;
  p10: number;
  p90: number;
  /** The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. It is `null` without the A/A arm. */
  moved: number | null;
  /** The median ratio of the inputs of each group. An input with no group is in the group `all`. */
  groups: Record<string, number>;
  /** The mean of the group medians */
  groupMean: number;
  /** The sample SD of the group medians. Fewer than 2 groups give 0. */
  groupSD: number;
}

/** One input of a report. */
export interface PairedInput {
  id: string;
  group?: string;
  /** The raw times of each arm, one value for each round, in milliseconds */
  ms: Record<string, number[]>;
  median: Record<string, number>;
  /** The median time of the arm over the median time of the base, on this input */
  ratio: Record<string, number>;
  /** The ids of the arms in the order of their start, one list for each round. Only schema 4 has it. */
  orders?: string[][];
  /** The highest memory peak of each arm over its rounds, in bytes. Only mode `fresh` has it. */
  peakRss?: Record<string, number>;
  /** The median `warm` of the children of each arm over its rounds. Only mode `fresh` with 2 passes or more has it. */
  warm?: Record<string, number>;
  /** The sums of the events of the children of each arm over its rounds. Only a run with the event count has it. */
  events?: Record<string, ChildEvents>;
}

/**
 * The warm check of one arm over the inputs (k130). A warm value near 1 tells that the time of a child did not go down in its timed passes.
 *
 * - `outside` is the share of the inputs whose warm value is outside [p10, p90] of the A/A ratios. Such an input is not a result.
 * - `outside` is `null` without the A/A arm.
 */
export interface PairedWarm {
  inputs: number;
  median: number;
  p10: number;
  p90: number;
  outside: number | null;
}

/** The schema of a new paired time report. Schema 4 keeps the order of the arms of each input and round. */
export const PAIRED_SCHEMA = "paired-time/4" as const;

/** The schemas that a pair reader reads. Schema 3 has the order of `armOrder` with no turn by the input. */
export type PairedSchema = "paired-time/3" | typeof PAIRED_SCHEMA;

/**
 * This function refuses a report of schema 1 or 2 with a `RangeError`.
 *
 * Such a report has another order of the arms, so this code cannot read which arm of a pair started first.
 */
export function assertPairedOrder(report: Pick<PairedReport, "schema">): void {
  if (report.schema !== PAIRED_SCHEMA && report.schema !== "paired-time/3") throw new RangeError(`The report has the schema ${String(report.schema)}, and the order of its arms is not the order of paired-time/3 or ${PAIRED_SCHEMA}. Run it again.`);
}

/**
 * This function gives the place of an arm in the start order of one input in one round. An arm that is not in the order gives -1.
 *
 * - A report of schema 4 keeps the order of each input and round in `orders`. An input without the order of the round is a `RangeError`.
 * - A report of schema 3 used `armOrder(report.arms, round)` for each input, with no turn by the input.
 */
export function armPosition(report: Pick<PairedReport, "schema" | "arms">, input: Pick<PairedInput, "id" | "orders">, round: number, arm: string): number {
  assertPairedOrder(report);
  if (report.schema === "paired-time/3") return armOrder(report.arms, round).indexOf(arm);
  const order = input.orders?.[round];
  if (order === undefined) throw new RangeError(`The input ${input.id} of the report has no order of the round ${round}.`);
  return order.indexOf(arm);
}

/**
 * This function gives the side of a pair that started first on one input in one round: `a` or `b`.
 * The side `a` is one arm or more. The first of them counts, as for the sum of the members of a gate.
 */
export function firstSide(report: Pick<PairedReport, "schema" | "arms">, input: Pick<PairedInput, "id" | "orders">, round: number, a: readonly string[], b: string): PairedTime["first"] {
  const at = (id: string): number => armPosition(report, input, round, id);
  return Math.min(...a.map(at)) < at(b) ? "a" : "b";
}

/** The report of a paired time run: schema `paired-time/4`, or a stored report of schema 3. A file of version 1 has no `passes`, `warm` and `wallMs`. */
export interface PairedReport {
  schema: PairedSchema;
  mode: Mode;
  /** The context of the run: `ci` or `local` (or `BENCH_MODE`), with the Node.js flags */
  context?: string;
  env: PairedEnv;
  base: string;
  /** The ids of the arms, with the A/A arm */
  arms: string[];
  inputs: PairedInput[];
  ratios: Record<string, PairedRatio>;
  /** The ratios of the A/A arm. It is `null` without the A/A arm. */
  noiseFloor: { median: number; p10: number; p90: number } | null;
  /** The timed passes of each child. Only mode `fresh` has it. */
  passes?: number;
  /** The warm check of each arm. Only mode `fresh` with 2 passes or more has it. */
  warm?: Record<string, PairedWarm>;
  /** The time of all the rounds, in milliseconds */
  wallMs?: number;
}

/** The suffix of the id of the A/A arm. rigor-bench uses the same suffix. */
export const AA_SUFFIX = "~aa";

/** This function gives the id of the A/A arm of a base. */
export const aaId = (base: string): string => `${base}${AA_SUFFIX}`;

/** This function gives the context of this process: `BENCH_MODE`, else `ci` in CI and `local` on other computers, then the Node.js flags. */
export function pairedContext(): string {
  const where = process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local");
  return [where, ...process.execArgv].join(" ");
}

/**
 * This function gives the quantile `q` of a list: `quantile` of `@mark1russell7/rigor-statistics`, with a linear interpolation.
 * An empty list gives NaN, because a report with no input keeps NaN. `quantile` refuses an empty list.
 */
export function quantileOf(values: readonly number[], q: number): number {
  return values.length === 0 ? Number.NaN : quantile(values, q);
}

/** This function gives the mean of a list: `mean` of `@mark1russell7/rigor-statistics`. An empty list gives NaN. */
const meanOf = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : mean(values));

/** This function gives the sample SD of a list: `sd` of `@mark1russell7/rigor-statistics`. Fewer than 2 values give 0. */
const sampleSD = (values: readonly number[]): number => (values.length < 2 ? 0 : sd(values));

/** This function checks the options, and gives the arms with the A/A arm. It throws a `RangeError` for a bad option. */
function armsOf<I>(o: PairedOptions<I>): Arm<I>[] {
  if (o.mode !== "process" && o.mode !== "fresh") throw new RangeError(`The mode is process or fresh, not "${String(o.mode)}".`);
  if (!Number.isInteger(o.repeats) || o.repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  const warmup = o.warmup ?? 1;
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  const passes = o.passes ?? 1;
  if (!Number.isInteger(passes) || passes < 1) throw new RangeError("The passes are a whole number of 1 or more.");
  if (o.mode === "process" && passes !== 1) throw new RangeError("Mode process takes 1 pass. The option passes is for mode fresh.");
  const base = o.arms[0];
  if (base === undefined) throw new RangeError("A paired time run needs a base arm.");
  const arms = o.aa === false ? [...o.arms] : [...o.arms, { ...base, id: aaId(base.id) }];
  if (arms.length < 2) throw new RangeError("A paired time run needs 2 arms or more, with the A/A arm.");
  if (new Set(arms.map((a) => a.id)).size !== arms.length) throw new RangeError("The ids of the arms are not unique.");
  for (const a of arms) {
    if (o.mode === "process" && a.run === undefined) throw new RangeError(`The arm ${a.id} has no run for mode process.`);
    if (o.mode === "fresh" && (a.command === undefined || a.command.length === 0)) throw new RangeError(`The arm ${a.id} has no command for mode fresh.`);
  }
  if (new Set(o.inputs.map((i) => i.id)).size !== o.inputs.length) throw new RangeError("The ids of the inputs are not unique.");
  if (o.inputs.length === 0) throw new RangeError("A paired time run needs 1 input or more.");
  return arms;
}

/** The raw times of a run, before the statistics: for each input, the times, the orders and the peaks of each arm. */
interface RawTimes {
  ms: Map<string, Map<string, number[]>>;
  orders: Map<string, string[][]>;
  peak: Map<string, Map<string, number>>;
  warm: Map<string, Map<string, number[]>>;
  events: Map<string, Map<string, ChildEvents>>;
}

/** This function makes empty raw times for the inputs and the arms. */
function rawOf(inputs: readonly { id: string }[], arms: readonly { id: string }[]): RawTimes {
  const ms = new Map(inputs.map((i) => [i.id, new Map(arms.map((a) => [a.id, [] as number[]]))]));
  const warm = new Map(inputs.map((i) => [i.id, new Map(arms.map((a) => [a.id, [] as number[]]))]));
  const orders = new Map(inputs.map((i) => [i.id, [] as string[][]]));
  return { ms, orders, peak: new Map(inputs.map((i) => [i.id, new Map<string, number>()])), warm, events: new Map(inputs.map((i) => [i.id, new Map<string, ChildEvents>()])) };
}

/** This function gives the statistics of the ratios of one arm. */
function ratioOf(rows: readonly { group?: string; ratio: number }[], band: { p10: number; p90: number } | undefined): PairedRatio {
  const values = rows.map((r) => r.ratio);
  const median = quantileOf(values, 0.5);
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.group ?? "all";
    byGroup.set(key, [...(byGroup.get(key) ?? []), r.ratio]);
  }
  const groups: Record<string, number> = {};
  for (const key of [...byGroup.keys()].sort()) groups[key] = quantileOf(byGroup.get(key)!, 0.5);
  const medians = Object.values(groups);
  const out: PairedRatio = {
    inputs: rows.length,
    median,
    p10: quantileOf(values, 0.1),
    p90: quantileOf(values, 0.9),
    groups,
    groupMean: meanOf(medians),
    groupSD: sampleSD(medians),
    moved: band === undefined ? null : rows.length === 0 ? 0 : values.filter((v) => v < band.p10 || v > band.p90).length / rows.length,
  };
  return out;
}

/**
 * This function gives the report of the raw times of a run.
 *
 * - The ratio of an input is the median of the arm over the median of the base. An input with a base median of 0 or no time gets no ratio.
 * - With the A/A arm, the noise floor is its ratios, and `moved` of each arm uses the band [p10, p90] of the A/A ratios.
 */
export function pairedReport<I>(
  mode: Mode,
  env: PairedEnv,
  context: string | undefined,
  arms: readonly Arm<I>[],
  inputs: readonly Input<I>[],
  raw: RawTimes,
  run: { passes?: number; wallMs?: number } = {},
): PairedReport {
  const base = arms[0]!.id;
  const aa = arms.find((a) => a.id === aaId(base))?.id;
  const rows: PairedInput[] = inputs.map((input) => {
    const own = raw.ms.get(input.id)!;
    const ms: Record<string, number[]> = {};
    const median: Record<string, number> = {};
    for (const a of arms) {
      const times = own.get(a.id) ?? [];
      ms[a.id] = times;
      if (times.length > 0) median[a.id] = quantileOf(times, 0.5);
    }
    const ratio: Record<string, number> = {};
    const b = median[base];
    if (b !== undefined && b > 0) for (const a of arms.slice(1)) if (median[a.id] !== undefined) ratio[a.id] = median[a.id]! / b;
    const row: PairedInput = { id: input.id, ms, median, ratio };
    if (input.group !== undefined) row.group = input.group;
    const orders = raw.orders.get(input.id)!;
    if (orders.length > 0) row.orders = orders;
    const peak = raw.peak.get(input.id)!;
    if (mode === "fresh" && peak.size > 0) row.peakRss = Object.fromEntries(peak);
    const warms = raw.warm.get(input.id)!;
    const warm = Object.fromEntries(arms.flatMap((a) => ((warms.get(a.id) ?? []).length > 0 ? [[a.id, quantileOf(warms.get(a.id)!, 0.5)]] : [])));
    if (mode === "fresh" && Object.keys(warm).length > 0) row.warm = warm;
    const events = raw.events.get(input.id)!;
    if (mode === "fresh" && events.size > 0) row.events = Object.fromEntries(events);
    return row;
  });
  const rowsOf = (id: string) => rows.filter((r) => r.ratio[id] !== undefined).map((r) => ({ ...(r.group === undefined ? {} : { group: r.group }), ratio: r.ratio[id]! }));
  const floor = aa === undefined ? undefined : ratioOf(rowsOf(aa), undefined);
  const band = floor === undefined ? undefined : { p10: floor.p10, p90: floor.p90 };
  const ratios: Record<string, PairedRatio> = {};
  for (const a of arms.slice(1)) ratios[a.id] = ratioOf(rowsOf(a.id), band);
  const report: PairedReport = { schema: PAIRED_SCHEMA, mode, ...(context === undefined ? {} : { context }), env, base, arms: arms.map((a) => a.id), inputs: rows, ratios, noiseFloor: floor === undefined ? null : { median: floor.median, p10: floor.p10, p90: floor.p90 } };
  if (mode === "fresh" && run.passes !== undefined) report.passes = run.passes;
  if (rows.some((r) => r.warm !== undefined)) report.warm = Object.fromEntries(arms.map((a) => [a.id, warmOf(rows.flatMap((r) => (r.warm?.[a.id] === undefined ? [] : [r.warm[a.id]!])), band)]));
  if (run.wallMs !== undefined) report.wallMs = run.wallMs;
  return report;
}

/** This function gives the warm check of one arm: the quantiles of its warm values, and the share outside the A/A band. */
function warmOf(values: readonly number[], band: { p10: number; p90: number } | undefined): PairedWarm {
  return {
    inputs: values.length,
    median: quantileOf(values, 0.5),
    p10: quantileOf(values, 0.1),
    p90: quantileOf(values, 0.9),
    outside: band === undefined ? null : values.length === 0 ? 0 : values.filter((v) => v < band.p10 || v > band.p90).length / values.length,
  };
}

/**
 * This function times the arms in one process with `timeArmRounds` of rigor-bench, one input after the other.
 *
 * - The arms of the input at the index `i` turn by `i`. Then `armOrder` gives the order of each round.
 * - The base sets the count of calls of a batch, so that a batch takes 10 ms or more. Each arm does `warmup` untimed batches before its timed batch.
 * - A time of the report is the time of a batch over its count of calls.
 */
function measureProcess<I>(o: PairedOptions<I>, arms: readonly Arm<I>[]): PairedReport {
  const clock = o.clock ?? (() => performance.now());
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  const began = performance.now();
  const base = arms[0]!;
  for (const [index, input] of o.inputs.entries()) {
    const arm = (a: Arm<I>): ProcessArm => ({
      id: a.id,
      run: () => {
        const out = a.run!(input.value as I);
        // Mode process has one process, so a memory peak of an arm has no meaning
        if (typeof out === "object" && out !== null && "peakRss" in out) throw new RangeError(`The arm ${a.id} gave a peakRss in mode process.`);
        return out === undefined || out === null ? 0 : 1;
      },
    });
    const result = timeArmRounds({ case: input.id, base: arm(base), candidates: o.arms.slice(1).map(arm), rounds: o.repeats, offset: index, aa: o.aa !== false, warmMs: 0, warmBatches: warmup, now: clock });
    const own = raw.ms.get(input.id)!;
    for (const [id, records] of Object.entries(result.pairs)) {
      for (const r of records) {
        own.get(base.id)![r.round] = r.a / result.count;
        own.get(id)![r.round] = r.b / result.count;
      }
    }
    raw.orders.set(input.id, result.orders.map((order) => [...order]));
  }
  return pairedReport("process", o.env ?? benchEnv(), o.context ?? pairedContext(), arms, o.inputs, raw, { wallMs: performance.now() - began });
}

/** This function adds the fields of one child to the raw times of an arm on an input. The fields are the warm value, the events and the memory peak. */
function addFields(raw: RawTimes, input: string, arm: string, fields: ChildFields | undefined): void {
  if (fields === undefined) return;
  if (fields.warm !== undefined) raw.warm.get(input)!.get(arm)!.push(fields.warm);
  const e = fields.events;
  // A child without the deopt counts gives no events, as before
  if (e !== undefined && e.deopt !== undefined) {
    const own = raw.events.get(input)!;
    const sum = own.get(arm) ?? { gc: [0, 0], deopt: [0, 0] };
    own.set(arm, { gc: [sum.gc[0] + e.gc[0], sum.gc[1] + e.gc[1]], deopt: [sum.deopt[0] + e.deopt[0], sum.deopt[1] + e.deopt[1]] });
  }
  if (fields.peakRss !== undefined) {
    const peak = raw.peak.get(input)!;
    peak.set(arm, Math.max(peak.get(arm) ?? 0, fields.peakRss));
  }
}

/**
 * This function times the arms with a fresh process for each arm, each input and each round: `freshRun` of rigor-bench with the order `arms`.
 *
 * - The arms of the input at the index `i` turn by `i`. Then `armOrder` gives the order of each round. The report keeps each order.
 * - A child gets the arguments `--input <id> --warmup <n>`, and `--passes <n>` when the passes are not 1.
 * - A child that skips an input is an error: the child of the packer does not skip.
 */
async function measureFresh<I>(o: PairedOptions<I>, arms: readonly Arm<I>[]): Promise<PairedReport> {
  const warmup = o.warmup ?? 1;
  const passes = o.passes ?? 1;
  const raw = rawOf(o.inputs, arms);
  const began = performance.now();
  const base = arms[0]!;
  const run = await freshRun({
    base: { id: base.id, command: base.command! },
    candidates: o.arms.slice(1).map((a) => ({ id: a.id, command: a.command! })),
    cases: o.inputs.map((i) => i.id),
    rounds: o.repeats,
    aa: o.aa !== false,
    order: "arms",
    args: (id) => ["--input", id, "--warmup", String(warmup), ...(passes === 1 ? [] : ["--passes", String(passes)])],
    env: o.env ?? benchEnv(),
    ...(o.start === undefined ? {} : { start: o.start }),
  });
  if (run.skipped.length > 0) throw new Error(`A child skipped an input: ${run.skipped.map((s) => `${s.arm} on ${s.case} (${s.reason})`).join(", ")}.`);
  const ids = Object.keys(run.pairs);
  for (const [at, id] of ids.entries()) {
    for (const r of run.pairs[id]!) {
      const own = raw.ms.get(r.case)!;
      own.get(id)![r.round] = r.b;
      addFields(raw, r.case, id, r.fields?.b);
      // Each pair has the same child of the base, so only the first pair adds it
      if (at > 0) continue;
      own.get(base.id)![r.round] = r.a;
      addFields(raw, r.case, base.id, r.fields?.a);
    }
  }
  for (const order of run.orders ?? []) raw.orders.get(order.case)![order.round] = [...order.arms];
  return pairedReport("fresh", run.env, o.context ?? pairedContext(), arms, o.inputs, raw, { passes, wallMs: performance.now() - began });
}

/**
 * This function times the arms of a comparison, and gives the report of schema `paired-time/4`.
 *
 * - Mode `process` gives the report. Mode `fresh` gives a promise of the report.
 * - With `aa` (the default), the report has an A/A arm and the noise floor.
 * - A bad option throws a `RangeError`.
 */
export function measureIsolated<I>(options: PairedOptions<I> & { mode: "process" }): PairedReport;
export function measureIsolated<I>(options: PairedOptions<I> & { mode: "fresh" }): Promise<PairedReport>;
export function measureIsolated<I>(options: PairedOptions<I>): PairedReport | Promise<PairedReport>;
export function measureIsolated<I>(options: PairedOptions<I>): PairedReport | Promise<PairedReport> {
  const arms = armsOf(options);
  return options.mode === "process" ? measureProcess(options, arms) : measureFresh(options, arms);
}

/** The verdict of the warm rule on one report (k130). */
export interface WarmVerdict {
  /** `true` when each arm of the rule is warm */
  ok: boolean;
  /** The share of the inputs of the A/A arm with a warm value outside the A/A band */
  aaOutside: number;
  arms: Record<string, { median: number; outside: number; ok: boolean }>;
  /** The count of inputs with the warm value of each arm of the rule in the A/A band */
  inputsWarm: number;
}

/**
 * This function applies the warm rule to a report of mode `fresh` with 2 passes or more and the A/A arm (k130).
 *
 * - An arm is warm when its `outside` is at most the `outside` of the A/A arm plus `slack`, and its warm median is in `median`.
 * - The rule compares each arm with the noise floor. A fixed limit on `outside` fails: the A/A arm itself has 0.18 to 0.32.
 * - The default arms are each arm except the A/A arm. The default `slack` is 0.1, and the default `median` is [0.97, 1.03].
 * - The function throws an `Error` for a report without the warm check or the A/A arm.
 */
export function warmRule(
  r: PairedReport,
  o: { arms?: readonly string[]; slack?: number; median?: readonly [number, number] } = {},
): WarmVerdict {
  const aa = aaId(r.base);
  const floor = r.noiseFloor;
  if (r.warm === undefined || floor === null || r.warm[aa] === undefined) throw new Error("The warm rule needs a report of mode fresh with 2 passes or more and the A/A arm.");
  const slack = o.slack ?? 0.1;
  const [low, high] = o.median ?? [0.97, 1.03];
  const aaOutside = r.warm[aa]!.outside ?? 0;
  const ids = o.arms ?? r.arms.filter((a) => a !== aa);
  const arms = Object.fromEntries(
    ids.map((id) => {
      const w = r.warm![id];
      if (w === undefined) throw new Error(`The report has no warm check of the arm ${id}.`);
      const outside = w.outside ?? 0;
      return [id, { median: w.median, outside, ok: outside <= aaOutside + slack && w.median >= low && w.median <= high }];
    }),
  );
  return { ok: Object.values(arms).every((a) => a.ok), aaOutside, arms, inputsWarm: warmInputs(r, ids).length };
}

/** This function gives the inputs of a report with the warm value of each arm of `ids` in the A/A band (k130). */
export function warmInputs(r: PairedReport, ids: readonly string[]): PairedInput[] {
  const floor = r.noiseFloor;
  if (floor === null) return [];
  const inside = (v: number | undefined): boolean => v !== undefined && v >= floor.p10 && v <= floor.p90;
  return r.inputs.filter((i) => ids.every((id) => inside(i.warm?.[id])));
}

/** This function gives a number with 3 decimals for a table. */
const fmt = (value: number | null | undefined): string => (value === undefined || value === null || Number.isNaN(value) ? "" : value.toFixed(3));

/** This function gives the Markdown table of a report. */
export function pairedMarkdown(r: PairedReport, title = "A paired time test"): string {
  const groups = [...new Set(Object.values(r.ratios).flatMap((x) => Object.keys(x.groups)))].sort();
  const floor = r.noiseFloor === null ? "none (no A/A arm)" : `median ${fmt(r.noiseFloor.median)}, p10 ${fmt(r.noiseFloor.p10)}, p90 ${fmt(r.noiseFloor.p90)}`;
  return [
    `# ${title}`,
    "",
    `- Schema \`${r.schema}\`, mode \`${r.mode}\`${r.context === undefined ? "" : `, context \`${r.context}\``}, on ${r.env.cores} x ${r.env.cpu} (${r.env.os} ${r.env.arch}, Node.js ${r.env.node}${r.env.runner === undefined ? "" : `, ${r.env.runner}`}).`,
    `- Base \`${r.base}\`. The ratio of an input is the median time of the arm over the median time of the base.`,
    `- Noise floor (the A/A arm): ${floor}.`,
    ...(r.passes === undefined ? [] : [`- Each child times ${r.passes} passes after its warm-up. The time is their median.`]),
    ...(r.wallMs === undefined ? [] : [`- The rounds took ${(r.wallMs / 60000).toFixed(1)} min.`]),
    "",
    `| Arm | Inputs | Median | p10 | p90 | Moved | ${groups.map((g) => `Group ${g}`).join(" | ")}${groups.length > 0 ? " | " : ""}Group mean | Group SD |`,
    `|---|---|---|---|---|---|${groups.map(() => "---|").join("")}---|---|`,
    ...Object.entries(r.ratios).map(
      ([id, x]) => `| \`${id}\` | ${x.inputs} | ${fmt(x.median)} | ${fmt(x.p10)} | ${fmt(x.p90)} | ${fmt(x.moved)} | ${groups.map((g) => fmt(x.groups[g])).join(" | ")}${groups.length > 0 ? " | " : ""}${fmt(x.groupMean)} | ${fmt(x.groupSD)} |`,
    ),
    "",
    ...(r.warm === undefined
      ? []
      : [
          "The warm check: the median of the last half of the timed passes of a child over the median of the first half. Outside: the share outside the A/A band.",
          "",
          "| Arm | Inputs | Median | p10 | p90 | Outside |",
          "|---|---|---|---|---|---|",
          ...Object.entries(r.warm).map(([id, w]) => `| \`${id}\` | ${w.inputs} | ${fmt(w.median)} | ${fmt(w.p10)} | ${fmt(w.p90)} | ${fmt(w.outside)} |`),
          "",
        ]),
  ].join("\n");
}
