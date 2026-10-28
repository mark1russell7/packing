// The win test of the promotion rule (roadmap item k58, `docs/BENCH.md`, "The win test"). It reads the records of a run
// with two strategies on the same inputs: a candidate and the current default. It does not start a packer.
// The rule is `docs/PROMOTION.md` of `highways`: the paired ratio, the floor rule, the classification, the win test and the noise guard.
//
// Start it with `node bench/promote.ts <folder> --candidate <id> --default <id> --win <measure> --out <folder> [--times <folder>]
// [--guards v1|v2] [--compare-guards]`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareMeasure, type Verdict } from "@mark1russell7/layout-contract";
import { MEASURE_SPECS, medianRatio, mulberry32, pairedRatio, quantile, tailShare, type MeasureId, type MeasureSpec } from "@mark1russell7/packing";
import { readRecords } from "./choose-sets.ts";
import { hardOf } from "./portfolio.ts";
import { OUTSIDE_EXACT, UNKNOWN_SHAPE, type ScreenRecord } from "./screen.ts";

/** The median test: the median ratio of a guard is at most `1 + MEDIAN_WORSE`. */
export const MEDIAN_WORSE = 0.02;

/** The tail test: a ratio above `1 + TAIL_WORSE` is in the tail. */
export const TAIL_WORSE = 0.1;

/** The tail test: at most this share of the inputs is in the tail. */
export const TAIL_SHARE = 0.1;

/** The gain test: the median ratio of a win measure is at most `1 - GAIN_MIN`. */
export const GAIN_MIN = 0.05;

/** The sign test: its p-value is below this limit. */
export const SIGN_P = 0.05;

/** The bootstrap: the count of the samples of the inputs. */
export const BOOTSTRAP_RUNS = 10000;

/** The bootstrap: the level of the interval of the median ratios. */
export const BOOTSTRAP_LEVEL = 0.95;

/** The fixed seed of the random numbers of the bootstrap. The same seed gives the same interval. */
export const BOOTSTRAP_SEED = 58;

/** The time test: the median time ratio is at most this value. */
export const TIME_RATIO = 1.5;

/** The time test: the quantile of the time ratios for the tail. */
export const TIME_TAIL_Q = 0.95;

/** The time test: the quantile `TIME_TAIL_Q` of the time ratios is at most this value. */
export const TIME_TAIL = 2.0;

/**
 * The time floor in milliseconds: `timeFloorMs` of the shared rule (`docs/PROMOTION.md` of `highways`, highways#116, and
 * `layout-contract` 0.2.7). The denominator of a time ratio is at least `TIME_FLOOR_MS / TIME_RATIO`. The option
 * `--time-floor-ms 0` gives the rule without a floor.
 */
export const TIME_FLOOR_MS = 5;

/** The selector: a cell needs this count of inputs or more for a rule. */
export const CELL_MIN = 10;

/** The confirmation run: the fresh set has this count of inputs or more. */
export const CONFIRM_INPUTS = 200;

/** The parameters of the win test. The names are the names of the table of the rule. */
export interface PromotionParameters {
  medianWorse: number;
  tailWorse: number;
  tailShare: number;
  gainMin: number;
  signP: number;
  bootstrapRuns: number;
  bootstrapLevel: number;
  bootstrapSeed: number;
  timeRatio: number;
  timeTailQ: number;
  timeTail: number;
  timeFloorMs: number;
  cellMin: number;
  confirmInputs: number;
}

/** The parameters of the rule, with the values of its table. */
export const PROMOTION_PARAMETERS: Readonly<PromotionParameters> = Object.freeze({
  medianWorse: MEDIAN_WORSE,
  tailWorse: TAIL_WORSE,
  tailShare: TAIL_SHARE,
  gainMin: GAIN_MIN,
  signP: SIGN_P,
  bootstrapRuns: BOOTSTRAP_RUNS,
  bootstrapLevel: BOOTSTRAP_LEVEL,
  bootstrapSeed: BOOTSTRAP_SEED,
  timeRatio: TIME_RATIO,
  timeTailQ: TIME_TAIL_Q,
  timeTail: TIME_TAIL,
  timeFloorMs: TIME_FLOOR_MS,
  cellMin: CELL_MIN,
  confirmInputs: CONFIRM_INPUTS,
});

/** The guard measures of the step `pack` on each input. */
export const GUARD_MEASURES: readonly MeasureId[] = Object.freeze(["pack.area", "pack.fill", "pack.aspectError", "pack.order.inversions"] as MeasureId[]);

/** The guard measure of the step `pack` in the cells with a fixed container. */
export const FIXED_GUARD: MeasureId = "pack.overflow";

/** The stability measures of the change pairs. Each one is a guard on the inputs that have it. */
export const STABILITY_MEASURES: readonly MeasureId[] = Object.freeze(["pack.stability.mean", "pack.stability.q95", "pack.stability.moved"] as MeasureId[]);

/** The value of the cell `containerSize` of an input with a fixed container. */
export const FIXED_SIZE = "fixed";

/**
 * The value of the cell `containerSize` of an input whose container declares an aspect. The generators set
 * `container.aspect` only for this value. The records and `corpus.json` do not hold the container, so the cell is the declaration.
 */
export const ASPECT_SIZE = "freeAspect";

/** The values of the cell `order` of an input that declares a reading order. The value `free` declares no order. */
export const ORDERED: readonly string[] = Object.freeze(["soft", "hard"]);

/** The ids of the guard sets. `v1` is the set before the declared guards. `v2` applies each guard only where the input declares its property. */
export type GuardSetId = "v1" | "v2";

/** The guard set of the win test when the caller names none. */
export const GUARD_SET: GuardSetId = "v2";

/** The input field that turns on a guard, and the predicate of that field. */
export interface Declaration {
  /** The input field that declares the property of the guard */
  field: string;
  /** The reason for an input that does not declare the property */
  reason: string;
  /** This predicate tells if an input declares the property. `cell` is the cell of the input in `corpus.json`. */
  declares: (cell: InputCell | undefined, pair: InputPair) => boolean;
}

/** A guard of the win test and its declaration. */
export interface GuardDeclaration {
  measure: MeasureId;
  /** The list of the verdict: `guards` for the guards of the step, `stability` for the stability guards */
  kind: "guards" | "stability";
  /**
   * The declaration of the property. A guard without it applies to each input, and it fails when no input has the measure.
   * A guard with it applies only to the inputs that declare the property. No such input leaves the guard out.
   */
  declaration?: Declaration;
}

/** This function tells if a cell has a fixed container. An input without cells has no fixed container. */
const isFixed = (cell: InputCell | undefined): boolean => cell?.containerSize === FIXED_SIZE;

/** This function tells if both records of a pair have a value of a measure. */
const bothHave = (p: InputPair, measure: MeasureId): boolean => p.candidate.measures[measure] !== undefined && p.current.measures[measure] !== undefined;

/** The declaration of `FIXED_GUARD`: the cell `containerSize` is `fixed`. */
const FIXED_DECLARATION: Declaration = Object.freeze({
  field: "cell.containerSize = fixed",
  reason: "the container is not fixed",
  declares: (cell: InputCell | undefined) => isFixed(cell),
});

/** This function gives the declaration of a stability measure: both records have it, so the input is a change pair. */
const changePair = (measure: MeasureId): Declaration =>
  Object.freeze({ field: `the measure ${measure} in both records`, reason: "the input is not a change pair", declares: (_: InputCell | undefined, p: InputPair) => bothHave(p, measure) });

/** The stability guards of both guard sets */
const STABILITY_GUARDS: readonly GuardDeclaration[] = STABILITY_MEASURES.map((measure) => Object.freeze({ measure, kind: "stability" as const, declaration: changePair(measure) }));

/** The guard set `v1`: the guards before the declared guards. `GUARD_MEASURES` apply to each input. */
export const GUARD_SET_V1: readonly GuardDeclaration[] = Object.freeze([
  ...GUARD_MEASURES.map((measure) => Object.freeze({ measure, kind: "guards" as const })),
  Object.freeze({ measure: FIXED_GUARD, kind: "guards" as const, declaration: FIXED_DECLARATION }),
  ...STABILITY_GUARDS,
]);

/**
 * The guard set `v2`: the table of the declarations. Each guard of a property applies only to the inputs that declare the property.
 *
 * - `pack.area` is the area of the hull. In a fixed container, the hull grows with the placed count, and `pack.overflow` guards that count.
 *   So in a fixed cell, `pack.area` compares only the inputs where the two records place the same count.
 * - `pack.aspectError` compares the hull with `container.aspect`. Only the cell `freeAspect` sets that aspect.
 * - `pack.order.inversions` counts the pairs out of the rank order. Only the cell `order` `soft` or `hard` declares an order.
 * - `pack.fill` has no declaration. It applies to each input.
 */
export const GUARD_DECLARATIONS: readonly GuardDeclaration[] = Object.freeze([
  Object.freeze({
    measure: "pack.area" as MeasureId,
    kind: "guards" as const,
    declaration: Object.freeze({
      field: "cell.containerSize other than fixed, or the same pack.overflow in both records",
      reason: "the container is fixed and the placed counts are different",
      declares: (cell: InputCell | undefined, p: InputPair) => {
        if (!isFixed(cell)) return true;
        const placed = p.candidate.measures[FIXED_GUARD];
        return placed !== undefined && placed === p.current.measures[FIXED_GUARD];
      },
    }),
  }),
  Object.freeze({ measure: "pack.fill" as MeasureId, kind: "guards" as const }),
  Object.freeze({
    measure: "pack.aspectError" as MeasureId,
    kind: "guards" as const,
    declaration: Object.freeze({
      field: `cell.containerSize = ${ASPECT_SIZE}`,
      reason: "the container declares no aspect",
      declares: (cell: InputCell | undefined) => cell?.containerSize === ASPECT_SIZE,
    }),
  }),
  Object.freeze({
    measure: "pack.order.inversions" as MeasureId,
    kind: "guards" as const,
    declaration: Object.freeze({
      field: "cell.order = soft or hard",
      reason: "the cell declares no order",
      declares: (cell: InputCell | undefined) => cell?.order !== undefined && ORDERED.includes(cell.order),
    }),
  }),
  Object.freeze({ measure: FIXED_GUARD, kind: "guards" as const, declaration: FIXED_DECLARATION }),
  ...STABILITY_GUARDS,
]);

/** The guard sets by id */
export const GUARD_SETS: Readonly<Record<GuardSetId, readonly GuardDeclaration[]>> = Object.freeze({ v1: GUARD_SET_V1, v2: GUARD_DECLARATIONS });

/** The reason for an input where a record has no value of the measure of a guard */
export const NO_VALUE = "a record has no value of the measure";

/** The part of a record that the win test reads. */
export interface PromotionRecord extends ScreenRecord {
  /** The value `false` when two runs of the record gave different outputs */
  deterministic?: boolean;
  /** The times of the timed runs, in milliseconds. `ms` is their median. */
  msRuns?: number[];
  /** The corpus of the record */
  corpus?: string;
  /** The facts of the computer of the record. The time test reads its CPU model. */
  env?: { cpu?: string };
}

/** The cells of an input that the win test reads. The manifest `corpus.json` gives them. */
export interface InputCell {
  containerShape?: string;
  containerSize?: string;
  /** The reading order of the items: `free`, `soft` or `hard` */
  order?: string;
}

/** The paired ratio of one measure on one input, after the floor rule. */
export interface FloorRatio {
  /** The ratio. A value above 1 is worse, in the direction of the measure. */
  ratio: number;
  /** The result of the floor rule: `tie` within the tolerance, `loss` beyond it. It is absent when the default is not at the floor. */
  floor?: "tie" | "loss";
}

/**
 * This function gives the paired ratio of a measure on one input, with the floor rule.
 *
 * - The default is at the floor when its value is the floor or better. Then the input uses the tolerance `spec.tol`.
 * - A candidate within the tolerance of the floor gives a tie with the ratio 1. Otherwise the ratio is `Infinity`.
 * - A measure without a floor, or a default that is not at the floor, gives `pairedRatio`.
 */
export function floorRatio(candidate: number, current: number, spec: Pick<MeasureSpec, "direction" | "floor" | "tol">): FloorRatio {
  const floor = spec.floor;
  if (floor !== undefined) {
    const lower = spec.direction === "lower";
    const atFloor = lower ? current <= floor : current >= floor;
    if (atFloor) {
      const gap = lower ? candidate - floor : floor - candidate;
      return gap <= (spec.tol ?? 0) ? { ratio: 1, floor: "tie" } : { ratio: Infinity, floor: "loss" };
    }
  }
  return { ratio: pairedRatio(candidate, current, spec.direction) };
}

/**
 * This function gives the class of one input: `better`, `worse` or `tie`. `compareMeasure` of the contract gives it from the
 * raw values. A tie of the floor rule is a tie, and a loss of the floor rule is worse.
 */
export function classify(candidate: number, current: number, spec: Pick<MeasureSpec, "direction" | "minEffect">, floor?: FloorRatio["floor"]): Verdict {
  if (floor === "tie") return "tie";
  if (floor === "loss") return "worse";
  return compareMeasure(candidate, current, spec);
}

/** A test of one value against its limit. */
export interface Check {
  value: number;
  limit: number;
  pass: boolean;
}

/** This function gives the median test of some ratios: the median is at most `1 + medianWorse`. No ratio fails. */
export function medianTest(ratios: readonly number[], medianWorse = MEDIAN_WORSE): Check {
  const limit = 1 + medianWorse;
  if (ratios.length === 0) return { value: NaN, limit, pass: false };
  const value = medianRatio(ratios);
  return { value, limit, pass: value <= limit };
}

/** This function gives the tail test of some ratios: the share above `1 + tailWorse` is at most `share`. No ratio fails. */
export function tailTest(ratios: readonly number[], tailWorse = TAIL_WORSE, share = TAIL_SHARE): Check {
  if (ratios.length === 0) return { value: NaN, limit: share, pass: false };
  const value = tailShare(ratios, 1 + tailWorse);
  return { value, limit: share, pass: value <= share };
}

/**
 * This function gives the p-value of the one-sided exact sign test: the chance of `better` or more successes in
 * `better + worse` fair trials. The ties are not in the counts. No trial gives 1.
 */
export function signTestP(better: number, worse: number): number {
  const n = better + worse;
  if (n === 0 || better === 0) return 1;
  // The logs of the binomial terms C(n, i) / 2^n for i from `better` to n, summed from their largest term
  const logs: number[] = [];
  let logChoose = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logChoose += Math.log((n - i + 1) / i);
    if (i >= better) logs.push(logChoose - n * Math.LN2);
  }
  const top = Math.max(...logs);
  const sum = logs.reduce((s, l) => s + Math.exp(l - top), 0);
  return Math.min(1, Math.exp(top) * sum);
}

/** The interval of the paired bootstrap of the median ratio. */
export interface BootstrapInterval {
  low: number;
  high: number;
  level: number;
  runs: number;
  seed: number;
}

/**
 * This function gives the paired bootstrap of the median ratio: `runs` samples of the inputs with replacement, from the
 * seed `seed`. The interval is the central `level` share of the sample medians. The ratio `Infinity` is a valid value.
 * No ratio gives no interval.
 */
export function bootstrapMedian(ratios: readonly number[], runs = BOOTSTRAP_RUNS, level = BOOTSTRAP_LEVEL, seed = BOOTSTRAP_SEED): BootstrapInterval | undefined {
  const n = ratios.length;
  if (n === 0) return undefined;
  const sorted = ratios.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const random = mulberry32(seed);
  const counts = new Uint32Array(n);
  // The median of a sample of n values: the value of rank (n - 1) / 2, or the mean of the two middle ranks
  const lowRank = Math.floor((n - 1) / 2);
  const highRank = Math.ceil((n - 1) / 2);
  const medians: number[] = [];
  for (let run = 0; run < runs; run++) {
    counts.fill(0);
    for (let i = 0; i < n; i++) counts[Math.floor(random() * n)]! += 1;
    let seen = 0;
    let low = NaN;
    let high = NaN;
    for (let k = 0; k < n; k++) {
      seen += counts[k]!;
      if (Number.isNaN(low) && seen > lowRank) low = sorted[k]!;
      if (seen > highRank) {
        high = sorted[k]!;
        break;
      }
    }
    medians.push(low === high ? low : (low + high) / 2);
  }
  const side = (1 - level) / 2;
  return { low: quantile(medians, side), high: quantile(medians, 1 - side), level, runs, seed };
}

/** The time of one input of the candidate and of the default, in milliseconds. */
export interface TimePair {
  candidate: number;
  current: number;
}

/** The times of one input of the time source. A time is absent when its record has no time. */
export interface TimeInput {
  input: string;
  candidate: number | undefined;
  current: number | undefined;
}

/** The time test of some inputs. */
export interface TimeResult {
  /** The inputs with a time for the candidate and for the default */
  inputs: number;
  /** The inputs without a time for one of the two */
  missing: number;
  /** The time floor in milliseconds */
  floorMs: number;
  /** The inputs where the floor raised the denominator above the time of the default */
  raised: number;
  median: Check;
  tail: Check & { q: number };
  pass: boolean;
}

/**
 * This function gives the time test of some inputs. The time ratio of an input is `t / max(b, floorMs / timeRatio)`, with
 * the candidate time `t` and the default time `b`. The median is at most `timeRatio`. The quantile `timeTailQ` is at most `timeTail`.
 */
export function timeTest(pairs: readonly TimePair[], params: Pick<PromotionParameters, "timeRatio" | "timeTailQ" | "timeTail" | "timeFloorMs"> = PROMOTION_PARAMETERS, missing = 0): TimeResult {
  const least = params.timeFloorMs / params.timeRatio;
  let raised = 0;
  const ratios = pairs.map((p) => {
    if (least > p.current) raised += 1;
    return pairedRatio(p.candidate, Math.max(p.current, least), "lower");
  });
  const empty = ratios.length === 0;
  const median = empty ? NaN : medianRatio(ratios);
  const tail = empty ? NaN : quantile(ratios, params.timeTailQ);
  const medianCheck = { value: median, limit: params.timeRatio, pass: median <= params.timeRatio };
  const tailCheck = { value: tail, limit: params.timeTail, q: params.timeTailQ, pass: tail <= params.timeTail };
  return { inputs: ratios.length, missing, floorMs: params.timeFloorMs, raised, median: medianCheck, tail: tailCheck, pass: medianCheck.pass && tailCheck.pass };
}

/** The use of the floor rule for one measure. */
export interface FloorUse {
  /** The inputs where the default is at the floor */
  applied: number;
  /** The inputs of `applied` where the candidate is within the tolerance */
  ties: number;
  /** The inputs of `applied` where the candidate is beyond the tolerance. Their ratio is `Infinity`. */
  losses: number;
  /** The ids of the inputs of `applied`. Only the overall tests list them. */
  ids?: string[];
}

/** The ratios and the classes of one measure over some inputs. */
export interface MeasureRatios {
  measure: string;
  /** The inputs where both records have the measure */
  inputs: number;
  ratios: number[];
  better: number;
  worse: number;
  ties: number;
  floor: FloorUse;
}

/** The two measured records of one input. */
export interface InputPair {
  input: string;
  candidate: PromotionRecord;
  current: PromotionRecord;
}

/** The pairs of some records, and the counts of the inputs without a measured record of one strategy. */
export interface Pairing {
  pairs: InputPair[];
  /** The inputs with a record of one of the two strategies */
  seen: number;
  noCandidate: number;
  noCurrent: number;
}

/**
 * This function pairs the first measured record of the candidate and of the default on each input. A skipped record is not
 * measured. An input without a measured record of each strategy has no pair.
 */
export function pairsOf(records: readonly PromotionRecord[], candidate: string, current: string): Pairing {
  const seen = new Set<string>();
  const candidates = new Map<string, PromotionRecord>();
  const currents = new Map<string, PromotionRecord>();
  for (const r of records) {
    const own = r.strategy === candidate ? candidates : r.strategy === current ? currents : undefined;
    if (own === undefined) continue;
    seen.add(r.input);
    if (r.skipped === undefined && !own.has(r.input)) own.set(r.input, r);
  }
  const pairs: InputPair[] = [];
  let noCandidate = 0;
  let noCurrent = 0;
  for (const input of seen) {
    const a = candidates.get(input);
    const b = currents.get(input);
    if (a === undefined) noCandidate += 1;
    if (b === undefined) noCurrent += 1;
    if (a !== undefined && b !== undefined) pairs.push({ input, candidate: a, current: b });
  }
  return { pairs, seen: seen.size, noCandidate, noCurrent };
}

/** This function gives the times of each pair. */
export const timeInputsOf = (pairs: readonly InputPair[]): TimeInput[] => pairs.map((p) => ({ input: p.input, candidate: timeOf(p.candidate), current: timeOf(p.current) }));

/** This function gives the ratios and the classes of one measure over some inputs. An input without the measure in a record does not count. */
export function ratiosOf(measure: MeasureId, pairs: readonly InputPair[], listIds = false): MeasureRatios {
  const spec = MEASURE_SPECS[measure];
  const out: MeasureRatios = { measure, inputs: 0, ratios: [], better: 0, worse: 0, ties: 0, floor: { applied: 0, ties: 0, losses: 0, ...(listIds ? { ids: [] } : {}) } };
  for (const p of pairs) {
    const a = p.candidate.measures[measure];
    const b = p.current.measures[measure];
    if (a === undefined || b === undefined) continue;
    const r = floorRatio(a, b, spec);
    out.inputs += 1;
    out.ratios.push(r.ratio);
    if (r.floor !== undefined) {
      out.floor.applied += 1;
      if (r.floor === "tie") out.floor.ties += 1;
      else out.floor.losses += 1;
      out.floor.ids?.push(p.input);
    }
    const c = classify(a, b, spec, r.floor);
    if (c === "better") out.better += 1;
    else if (c === "worse") out.worse += 1;
    else out.ties += 1;
  }
  return out;
}

/** The median test and the tail test of one guard measure. */
export interface GuardResult {
  measure: string;
  inputs: number;
  median: Check;
  tail: Check;
  better: number;
  worse: number;
  ties: number;
  floor: FloorUse;
  pass: boolean;
}

/** The gain test of one win measure: the median, the sign test and the bootstrap. */
export interface GainResult {
  measure: string;
  inputs: number;
  median: Check;
  sign: { better: number; worse: number; ties: number; p: number; limit: number; pass: boolean };
  /** The bootstrap passes when the upper end of its interval is below 1. Then the interval does not include 1, on the side of a gain. */
  bootstrap: (BootstrapInterval & { pass: boolean }) | { pass: false };
  floor: FloorUse;
  pass: boolean;
}

/** The hard-rule test of some inputs. */
export interface HardResult {
  inputs: number;
  /** The inputs where a hard count of the candidate is above that of the default */
  breaks: number;
  /** The inputs where the record of the candidate is not deterministic */
  notDeterministic: number;
  /** The first inputs of `breaks` and `notDeterministic`, at most 10 */
  examples: string[];
  pass: boolean;
}

/** The tests of the win test on some inputs. */
export interface WinTests {
  inputs: number;
  hard: HardResult;
  guards: GuardResult[];
  /** The stability guards. The list is empty when no input has a change pair. */
  stability: GuardResult[];
  gain: { measures: GainResult[]; pass: boolean };
  time: TimeResult;
  pass: boolean;
}

/** The source of the times of the time test. */
export interface TimeSource {
  /** The value `records` when the time test reads the records of the verdict, `times` when it reads other records (`--times`). */
  kind: "records" | "times";
  /** The folder of the time records. It is absent when the caller does not give it. */
  folder?: string;
  /** The corpora of the time records */
  corpora: string[];
  /** The CPU models of the time records of each strategy, sorted. A record without a CPU model gives `unknown`. */
  cpu: { candidate: string[]; current: string[] };
  /** The value `true` when each time record of the two strategies has the same CPU model */
  sameCpu: boolean;
}

/** The verdict of the win test. */
export interface PromotionVerdict {
  candidate: string;
  current: string;
  win: string[];
  parameters: PromotionParameters;
  /** The inputs with a measured record of each of the two strategies */
  inputs: number;
  /** The inputs that the test leaves out: a strategy has no measured record there */
  leftOut: { inputs: number; candidate: number; current: number };
  /** The input count against `confirmInputs`. A confirmation run needs `enough`. It does not change `pass`. */
  confirm: { inputs: number; needed: number; enough: boolean };
  /** The time field of the records */
  timeField: "ms";
  /** The records that give the times */
  timeSource: TimeSource;
  /** The guard set of the tests */
  guardSet: GuardSetId;
  /** The inputs that each guard of `guardSet` covers and leaves out, over all the inputs */
  coverage: GuardCoverage[];
  tests: WinTests;
  /** The value `true` when each test passes on all the inputs */
  pass: boolean;
  /** The same tests for each container shape, as information for a rule of the selector. They do not change `pass`. */
  shapes: Record<string, WinTests & { cellMin: boolean }>;
  /** The verdict of each guard set on the same records. Only the option `compareGuards` gives it. It does not change `pass`. */
  compare?: Record<GuardSetId, GuardSetVerdict>;
}

/** The verdict of one guard set, for the compare of the guard sets. */
export interface GuardSetVerdict {
  pass: boolean;
  coverage: GuardCoverage[];
  tests: WinTests;
}

/** The options of the win test. */
export interface WinTestOptions {
  candidate: string;
  current: string;
  /** The win measures. One of them must pass the gain test. */
  win: readonly MeasureId[];
  /** The cells of each input, by input id. An input without cells has the shape `unknown` and no fixed container. */
  cells?: ReadonlyMap<string, InputCell>;
  parameters?: Partial<PromotionParameters>;
  /**
   * The records of the time test, for example the records of one runner with interleaved timed passes. The time test then
   * reads only their `ms`, by input id and strategy id. The default is `records`.
   */
  times?: readonly PromotionRecord[];
  /** The folder of `times`, for the verdict */
  timesFolder?: string;
  /** The cells of the inputs of `times`. The default is `cells`. */
  timeCells?: ReadonlyMap<string, InputCell>;
  /** The guard set. The default is `GUARD_SET`. */
  guards?: GuardSetId;
  /** The value `true` adds the verdict of each guard set in `compare` */
  compareGuards?: boolean;
}

/** This function gives the hard counts of a record. The count `pack.outsideExact` replaces `in-container`, as `hardOf` tells. */
function hardCounts(r: PromotionRecord): Record<string, number> {
  const out: Record<string, number> = { ...r.hard };
  const exact = r.measures[OUTSIDE_EXACT];
  if (exact !== undefined) out["in-container"] = exact;
  return out;
}

/** This function tells if a record is not deterministic: its field `deterministic` is `false`, or its measure `pack.deterministic` is 0. */
const notDeterministic = (r: PromotionRecord): boolean => r.deterministic === false || r.measures["pack.deterministic"] === 0;

/** This function gives the hard-rule test of some inputs: each hard count of the candidate is at most that of the default. */
export function hardTest(pairs: readonly InputPair[]): HardResult {
  let breaks = 0;
  let unstable = 0;
  const examples: string[] = [];
  for (const p of pairs) {
    const a = hardCounts(p.candidate);
    const b = hardCounts(p.current);
    const broke = Object.entries(a).some(([k, n]) => n > (b[k] ?? 0)) || hardOf(p.candidate) > hardOf(p.current);
    const changed = notDeterministic(p.candidate);
    if (broke) breaks += 1;
    if (changed) unstable += 1;
    if ((broke || changed) && examples.length < 10) examples.push(p.input);
  }
  return { inputs: pairs.length, breaks, notDeterministic: unstable, examples, pass: breaks === 0 && unstable === 0 };
}

/** This function gives the time of a record in milliseconds: the field `ms`, or the median of `msRuns`. */
export function timeOf(r: PromotionRecord): number | undefined {
  if (typeof r.ms === "number") return r.ms;
  return r.msRuns !== undefined && r.msRuns.length > 0 ? quantile(r.msRuns, 0.5) : undefined;
}

/** This function gives the median test and the tail test of one guard measure. */
function guardOf(m: MeasureRatios, params: PromotionParameters): GuardResult {
  const median = medianTest(m.ratios, params.medianWorse);
  const tail = tailTest(m.ratios, params.tailWorse, params.tailShare);
  return { measure: m.measure, inputs: m.inputs, median, tail, better: m.better, worse: m.worse, ties: m.ties, floor: m.floor, pass: median.pass && tail.pass };
}

/** This function gives the pairs where the input declares the property of a guard. A guard without a declaration takes each pair. */
export function declaredPairs(guard: GuardDeclaration, pairs: readonly InputPair[], cells: ReadonlyMap<string, InputCell>): InputPair[] {
  const d = guard.declaration;
  return d === undefined ? [...pairs] : pairs.filter((p) => d.declares(cells.get(p.input), p));
}

/** The inputs that one guard covers and leaves out. */
export interface GuardCoverage {
  measure: string;
  kind: GuardDeclaration["kind"];
  /** The input field that declares the property, or `none` for a guard on each input */
  field: string;
  /** The inputs where the guard compares the two records */
  covered: number;
  /** The inputs that the guard leaves out */
  leftOut: number;
  /** The count of the left-out inputs for each reason */
  reasons: Record<string, number>;
}

/** This function gives the coverage of each guard of a set: the compared inputs, and the left-out inputs with the reason. */
export function coverageOf(guards: readonly GuardDeclaration[], pairs: readonly InputPair[], cells: ReadonlyMap<string, InputCell>): GuardCoverage[] {
  return guards.map((g) => {
    const reasons: Record<string, number> = {};
    const add = (reason: string): void => {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    };
    let covered = 0;
    for (const p of pairs) {
      if (g.declaration !== undefined && !g.declaration.declares(cells.get(p.input), p)) add(g.declaration.reason);
      else if (!bothHave(p, g.measure)) add(NO_VALUE);
      else covered += 1;
    }
    return { measure: g.measure, kind: g.kind, field: g.declaration?.field ?? "none", covered, leftOut: pairs.length - covered, reasons };
  });
}

/** This function gives the gain test of one win measure. */
function gainOf(m: MeasureRatios, params: PromotionParameters): GainResult {
  const limit = 1 - params.gainMin;
  const value = m.ratios.length === 0 ? NaN : medianRatio(m.ratios);
  const median = { value, limit, pass: value <= limit };
  const p = signTestP(m.better, m.worse);
  const sign = { better: m.better, worse: m.worse, ties: m.ties, p, limit: params.signP, pass: p < params.signP };
  const interval = bootstrapMedian(m.ratios, params.bootstrapRuns, params.bootstrapLevel, params.bootstrapSeed);
  const bootstrap = interval === undefined ? ({ pass: false } as const) : { ...interval, pass: interval.high < 1 };
  return { measure: m.measure, inputs: m.inputs, median, sign, bootstrap, floor: m.floor, pass: median.pass && sign.pass && bootstrap.pass };
}

/**
 * This function gives the tests of the win test on some inputs.
 *
 * - Each guard of `guardSet` applies to the inputs that declare its property. A guard without a declaration applies to each input.
 * - A guard without a declaration fails with no input. A guard with a declaration is left out when no input declares it.
 * - The gain test passes when one win measure passes its median, its sign test and its bootstrap.
 * - The time test uses `timeInputs`. The default is the times of `pairs`.
 * - The hard rules, the gain test and the time test apply to each input.
 */
export function testsOf(
  pairs: readonly InputPair[],
  win: readonly MeasureId[],
  cells: ReadonlyMap<string, InputCell>,
  params: PromotionParameters,
  listIds = false,
  timeInputs: readonly TimeInput[] = timeInputsOf(pairs),
  guardSet: readonly GuardDeclaration[] = GUARD_DECLARATIONS,
): WinTests {
  const guards: GuardResult[] = [];
  const stability: GuardResult[] = [];
  for (const g of guardSet) {
    const m = ratiosOf(g.measure, declaredPairs(g, pairs, cells), listIds);
    if (g.declaration !== undefined && m.inputs === 0) continue;
    (g.kind === "stability" ? stability : guards).push(guardOf(m, params));
  }
  const gains = win.map((m) => gainOf(ratiosOf(m, pairs, listIds), params));
  const times: TimePair[] = [];
  for (const { candidate, current } of timeInputs) if (candidate !== undefined && current !== undefined) times.push({ candidate, current });
  const hard = hardTest(pairs);
  const time = timeTest(times, params, timeInputs.length - times.length);
  const gain = { measures: gains, pass: gains.some((g) => g.pass) };
  const pass = pairs.length > 0 && hard.pass && guards.every((g) => g.pass) && stability.every((g) => g.pass) && gain.pass && time.pass;
  return { inputs: pairs.length, hard, guards, stability, gain, time, pass };
}

/**
 * This function gives the verdict of the win test of a candidate against the current default.
 *
 * - The test pairs the first measured record of each strategy on each input. A skipped record is not measured.
 * - An input without a measured record of each strategy is left out, and the verdict counts it.
 * - The overall `pass` uses all the inputs. Each container shape gets the same tests as information.
 * - With `times`, the time test pairs the records of `times` in the same way, and it reads only their times.
 * - The guard set `options.guards` gives the guards. With `compareGuards`, the verdict also holds the verdict of each guard set.
 */
export function winTest(records: readonly PromotionRecord[], options: WinTestOptions): PromotionVerdict {
  const params: PromotionParameters = { ...PROMOTION_PARAMETERS, ...options.parameters };
  const guardSet = options.guards ?? GUARD_SET;
  const guards = GUARD_SETS[guardSet];
  const cells = options.cells ?? new Map<string, InputCell>();
  const { pairs, seen, noCandidate, noCurrent } = pairsOf(records, options.candidate, options.current);
  const timePairs = options.times === undefined ? pairs : pairsOf(options.times, options.candidate, options.current).pairs;
  const timeInputs = timeInputsOf(timePairs);
  const timeCells = options.times === undefined ? cells : (options.timeCells ?? cells);
  const tests = testsOf(pairs, options.win, cells, params, true, timeInputs, guards);
  const coverage = coverageOf(guards, pairs, cells);
  const shapeOf = (input: string): string => cells.get(input)?.containerShape ?? UNKNOWN_SHAPE;
  const timeShapeOf = (input: string): string => timeCells.get(input)?.containerShape ?? UNKNOWN_SHAPE;
  const shapes: PromotionVerdict["shapes"] = {};
  for (const shape of [...new Set(pairs.map((p) => shapeOf(p.input)))].toSorted()) {
    const own = pairs.filter((p) => shapeOf(p.input) === shape);
    const ownTimes = timeInputs.filter((t) => timeShapeOf(t.input) === shape);
    shapes[shape] = { ...testsOf(own, options.win, cells, params, false, ownTimes, guards), cellMin: own.length >= params.cellMin };
  }
  let compare: PromotionVerdict["compare"];
  if (options.compareGuards === true) {
    const verdictOf = (id: GuardSetId): GuardSetVerdict => {
      if (id === guardSet) return { pass: tests.pass, coverage, tests };
      const other = testsOf(pairs, options.win, cells, params, false, timeInputs, GUARD_SETS[id]);
      return { pass: other.pass, coverage: coverageOf(GUARD_SETS[id], pairs, cells), tests: other };
    };
    compare = { v1: verdictOf("v1"), v2: verdictOf("v2") };
  }
  return {
    candidate: options.candidate,
    current: options.current,
    win: [...options.win],
    parameters: params,
    inputs: pairs.length,
    leftOut: { inputs: seen - pairs.length, candidate: noCandidate, current: noCurrent },
    confirm: { inputs: pairs.length, needed: params.confirmInputs, enough: pairs.length >= params.confirmInputs },
    timeField: "ms",
    timeSource: timeSourceOf(timePairs, options.times === undefined ? "records" : "times", options.timesFolder),
    guardSet,
    coverage,
    tests,
    pass: tests.pass,
    shapes,
    ...(compare === undefined ? {} : { compare }),
  };
}

/** This function gives the sorted distinct values of a list. */
const distinct = (values: readonly string[]): string[] => [...new Set(values)].toSorted();

/** This function gives the source of the times from the pairs of the time test. */
export function timeSourceOf(pairs: readonly InputPair[], kind: TimeSource["kind"], folder?: string): TimeSource {
  const cpuOf = (r: PromotionRecord): string => r.env?.cpu ?? "unknown";
  const candidate = distinct(pairs.map((p) => cpuOf(p.candidate)));
  const current = distinct(pairs.map((p) => cpuOf(p.current)));
  const corpora = distinct(pairs.flatMap((p) => [p.candidate.corpus, p.current.corpus]).filter((c): c is string => c !== undefined));
  const sameCpu = distinct([...candidate, ...current]).length <= 1;
  return { kind, ...(folder === undefined ? {} : { folder }), corpora, cpu: { candidate, current }, sameCpu };
}

/** This function writes the lines of the time source for `promotion.md`. */
function timeSourceLines(v: PromotionVerdict): string[] {
  const s = v.timeSource;
  const code = (values: readonly string[]): string => (values.length === 0 ? "none" : values.map((x) => `\`${x}\``).join(", "));
  const where = s.kind === "times" ? `the time records of \`--times\`${s.folder === undefined ? "" : ` in \`${s.folder}\``}` : "the records of the verdict";
  const lines = [
    `- The time source: the field \`${v.timeField}\` of ${where}. The corpus of the time records: ${code(s.corpora)}.`,
    `- The CPU models of the time records: ${code(s.cpu.candidate)} for the candidate, ${code(s.cpu.current)} for the default.`,
  ];
  if (!s.sameCpu) lines.push("- **Warning:** The time records of the candidate and the default come from different CPU models. The time ratios then compare two computers.");
  return lines;
}

/** This function writes a number for a table: 4 significant digits, `Infinity`, or `-` for no value. */
export const numText = (v: number): string => (Number.isNaN(v) ? "-" : Number.isFinite(v) ? String(Number(v.toPrecision(4))) : v > 0 ? "Infinity" : "-Infinity");

/** This function writes a result for a table. */
const passText = (pass: boolean): string => (pass ? "pass" : "fail");

/** This function writes the rows of a check. */
const checkRow = (test: string, measure: string, c: Check): string => `| ${test} | ${measure} | ${numText(c.value)} | ${numText(c.limit)} | ${passText(c.pass)} |`;

/** This function writes the rows of the tests of the win test. */
function testRows(t: WinTests, tailWorse: number): string[] {
  const rows = [
    `| hard rules | the inputs with a new hard break | ${t.hard.breaks} | 0 | ${passText(t.hard.breaks === 0)} |`,
    `| hard rules | the inputs that are not deterministic | ${t.hard.notDeterministic} | 0 | ${passText(t.hard.notDeterministic === 0)} |`,
  ];
  for (const g of [...t.guards, ...t.stability]) {
    rows.push(checkRow("median", `\`${g.measure}\``, g.median), checkRow("tail share", `\`${g.measure}\` above ${numText(1 + tailWorse)}`, g.tail));
  }
  for (const g of t.gain.measures) {
    rows.push(checkRow("gain median", `\`${g.measure}\``, g.median));
    rows.push(`| gain sign test p | \`${g.measure}\` (${g.sign.better} better, ${g.sign.worse} worse, ${g.sign.ties} ties) | ${g.sign.p.toPrecision(3)} | < ${g.sign.limit} | ${passText(g.sign.pass)} |`);
    const b = g.bootstrap;
    rows.push("high" in b ? `| gain bootstrap high | \`${g.measure}\` (${b.level} interval ${numText(b.low)} to ${numText(b.high)}) | ${numText(b.high)} | < 1 | ${passText(b.pass)} |` : `| gain bootstrap high | \`${g.measure}\` | - | < 1 | fail |`);
  }
  rows.push(`| gain | one win measure passes | ${t.gain.measures.filter((g) => g.pass).length} | 1 or more | ${passText(t.gain.pass)} |`);
  rows.push(checkRow("time median", `time ratio (${t.time.inputs} inputs)`, t.time.median));
  rows.push(checkRow(`time quantile ${t.time.tail.q}`, `time ratio (${t.time.inputs} inputs)`, t.time.tail));
  return rows;
}

/** This function writes the rows of the coverage of a guard set: the declaration, the covered inputs and the left-out inputs with their reasons. */
function coverageRows(coverage: readonly GuardCoverage[]): string[] {
  const rows = ["| guard | declared by | covered | left out | reasons |", "|---|---|---:|---:|---|"];
  for (const c of coverage) {
    const reasons = Object.entries(c.reasons).map(([reason, n]) => `${n}: ${reason}`);
    rows.push(`| \`${c.measure}\` | ${c.field === "none" ? "none, each input" : `\`${c.field}\``} | ${c.covered} | ${c.leftOut} | ${reasons.length === 0 ? "-" : reasons.join(", ")} |`);
  }
  return rows;
}

/** This function writes one guard of a guard set for the compare table: its inputs, its median and tail share, and its result. */
function guardCells(t: WinTests, measure: string): string {
  const g = [...t.guards, ...t.stability].find((x) => x.measure === measure);
  return g === undefined ? "0 | - | - | left out" : `${g.inputs} | ${numText(g.median.value)} | ${numText(g.tail.value)} | ${passText(g.pass)}`;
}

/** This function writes the compare of the guard sets: one row for each test, with the result of `v1` and of `v2` side by side. */
function compareLines(compare: NonNullable<PromotionVerdict["compare"]>): string[] {
  const sets = ["v1", "v2"] as const;
  const row = (test: string, cell: (t: GuardSetVerdict) => string): string => `| ${test} | ${sets.map((s) => cell(compare[s])).join(" | ")} |`;
  const measures = [...new Set(sets.flatMap((s) => GUARD_SETS[s].map((g) => g.measure)))];
  const lines = [
    "## The guard sets v1 and v2",
    "",
    "This table gives the verdict of each guard set on the same records. A guard of `v2` applies only to the inputs that declare its property.",
    "",
    "| test | v1 inputs | v1 median | v1 tail share | v1 result | v2 inputs | v2 median | v2 tail share | v2 result |",
    "|---|---:|---:|---:|---|---:|---:|---:|---|",
    row("hard rules", (v) => `${v.tests.hard.inputs} | - | - | ${passText(v.tests.hard.pass)}`),
    ...measures.map((m) => row(`\`${m}\``, (v) => guardCells(v.tests, m))),
  ];
  const gains = compare.v2.tests.gain.measures.map((g) => g.measure);
  for (const m of gains) {
    lines.push(
      row(`gain \`${m}\``, (v) => {
        const g = v.tests.gain.measures.find((x) => x.measure === m)!;
        return `${g.inputs} | ${numText(g.median.value)} | - | ${passText(g.pass)}`;
      }),
    );
  }
  lines.push(row("time", (v) => `${v.tests.time.inputs} | ${numText(v.tests.time.median.value)} | - | ${passText(v.tests.time.pass)}`));
  lines.push(row("**verdict**", (v) => `${v.tests.inputs} | - | - | **${passText(v.pass)}**`));
  for (const s of sets) lines.push("", `The coverage of the guard set \`${s}\`:`, "", ...coverageRows(compare[s].coverage));
  lines.push("");
  return lines;
}

/** This function writes `promotion.md`: the tests of all the inputs, then a table of each container shape. */
export function promotionMarkdown(v: PromotionVerdict): string {
  const t = v.tests;
  const p = v.parameters;
  const lines = [
    `# The win test of \`${v.candidate}\` against \`${v.current}\``,
    "",
    `The verdict is **${v.pass ? "pass" : "fail"}**. The candidate ${v.pass ? "can" : "cannot"} replace the default by the win test.`,
    "",
    `- The inputs: ${v.inputs}. The test leaves out ${v.leftOut.inputs} inputs: ${v.leftOut.candidate} without a measured record of the candidate, ${v.leftOut.current} without one of the default.`,
    `- The confirmation count: ${v.confirm.inputs} inputs of ${v.confirm.needed} (\`confirmInputs\`), ${v.confirm.enough ? "enough" : "not enough"} for a confirmation run.`,
    `- The win measures: ${v.win.map((m) => `\`${m}\``).join(", ")}.`,
    ...timeSourceLines(v),
    `- The time floor: ${p.timeFloorMs} ms. The floor raised the denominator of ${t.time.raised} inputs. ${t.time.missing} inputs have no time.`,
    `- A ratio above 1 is worse. A tail ratio is above ${numText(1 + p.tailWorse)}. The bootstrap uses ${p.bootstrapRuns} samples and the seed ${p.bootstrapSeed}.`,
    `- The guard set: \`${v.guardSet}\`. The table "The guard coverage" gives the inputs of each guard.`,
    "",
    "| test | measure | value | limit | result |",
    "|---|---|---:|---:|---|",
    ...testRows(t, p.tailWorse),
    "",
    "## The guard coverage",
    "",
    `The guard set \`${v.guardSet}\`. A guard with a declaration applies only to the inputs that declare its property. A guard with no covered input and a declaration is left out.`,
    "",
    ...coverageRows(v.coverage),
    "",
    ...(v.compare === undefined ? [] : compareLines(v.compare)),
    "## The floor rule",
    "",
    "| measure | inputs | at the floor | ties | losses |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const g of [...t.guards, ...t.stability, ...t.gain.measures]) if (g.floor.applied > 0) lines.push(`| \`${g.measure}\` | ${g.inputs} | ${g.floor.applied} | ${g.floor.ties} | ${g.floor.losses} |`);
  lines.push(
    "",
    "## The container shapes",
    "",
    `These rows are information for a rule of the selector. They do not change the verdict. A cell needs ${p.cellMin} inputs (\`cellMin\`).`,
    "",
    "| shape | inputs | cellMin | hard rules | guards | gain median | sign p | bootstrap high | time median | time quantile | result |",
    "|---|---:|---|---|---|---:|---:|---:|---:|---:|---|",
  );
  for (const [shape, s] of Object.entries(v.shapes)) {
    const g = s.gain.measures[0];
    const failed = [...s.guards, ...s.stability].filter((x) => !x.pass).map((x) => `\`${x.measure}\``);
    const high = g !== undefined && "high" in g.bootstrap ? numText(g.bootstrap.high) : "-";
    lines.push(
      `| ${shape} | ${s.inputs} | ${s.cellMin ? "yes" : "no"} | ${passText(s.hard.pass)} | ${failed.length === 0 ? "pass" : `fail: ${failed.join(", ")}`} | ${g === undefined ? "-" : numText(g.median.value)} | ${g === undefined ? "-" : g.sign.p.toPrecision(3)} | ${high} | ${numText(s.time.median.value)} | ${numText(s.time.tail.value)} | ${passText(s.pass)} |`,
    );
  }
  lines.push("", "The gain columns of the shapes show the first win measure.", "");
  return lines.join("\n");
}

/** This function writes a verdict as JSON. `Infinity` and `NaN` become the strings `Infinity` and `NaN`. */
export function promotionJson(v: PromotionVerdict): string {
  return `${JSON.stringify(v, (_, value: unknown) => (typeof value === "number" && !Number.isFinite(value) ? String(value) : value), 2)}\n`;
}

/** This function gives the cells of each input id of a manifest. A value that is not a manifest gives an empty map. */
export function cellsOf(manifest: unknown): Map<string, InputCell> {
  const out = new Map<string, InputCell>();
  const inputs = (manifest as { inputs?: unknown } | undefined)?.inputs;
  if (!Array.isArray(inputs)) return out;
  for (const entry of inputs as { id?: unknown; cell?: InputCell }[]) if (typeof entry.id === "string" && entry.cell !== undefined) out.set(entry.id, entry.cell);
  return out;
}

/** This function gives the value of an option of the command line, or `undefined`. */
const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

/** This function reads `records.jsonl` and the cells of `corpus.json` of a folder. A folder without `corpus.json` gives no cells. */
function readFolder(folder: string): { records: PromotionRecord[]; cells: Map<string, InputCell> } {
  const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8")) as PromotionRecord[];
  const manifestFile = join(folder, "corpus.json");
  const cells = existsSync(manifestFile) ? cellsOf(JSON.parse(readFileSync(manifestFile, "utf8"))) : new Map<string, InputCell>();
  return { records, cells };
}

/**
 * This function starts the win test from the arguments of the command line, writes the verdict files and gives the verdict.
 * A verdict `fail` does not stop the process with an error.
 */
export function promoteMain(argv: readonly string[]): PromotionVerdict {
  const folder = argv[0];
  const candidate = optionOf(argv, "--candidate");
  const current = optionOf(argv, "--default");
  const out = optionOf(argv, "--out");
  if (folder === undefined || candidate === undefined || current === undefined || out === undefined) {
    throw new Error(
      "Start the test with: node bench/promote.ts <folder> --candidate <id> --default <id> --out <folder> [--win <measure>[,<measure>]] [--time-floor-ms <n>] [--times <folder>] [--guards v1|v2] [--compare-guards]",
    );
  }
  const guards = optionOf(argv, "--guards") ?? GUARD_SET;
  if (!Object.hasOwn(GUARD_SETS, guards)) throw new Error(`The option --guards needs v1 or v2, not ${guards}.`);
  const win = (optionOf(argv, "--win") ?? "pack.fill").split(",").map((m) => m.trim());
  for (const m of win) if (!(m in MEASURE_SPECS)) throw new Error(`The win measure ${m} is not in MEASURE_SPECS.`);
  const floorText = optionOf(argv, "--time-floor-ms");
  const timeFloorMs = floorText === undefined ? TIME_FLOOR_MS : Number(floorText);
  if (!(timeFloorMs >= 0)) throw new Error("The option --time-floor-ms needs a number of 0 or more.");
  const { records, cells } = readFolder(folder);
  const timesFolder = optionOf(argv, "--times");
  const times = timesFolder === undefined ? undefined : readFolder(timesFolder);
  const verdict = winTest(records, {
    candidate,
    current,
    win: win as MeasureId[],
    cells,
    parameters: { timeFloorMs },
    guards: guards as GuardSetId,
    compareGuards: argv.includes("--compare-guards"),
    ...(times === undefined || timesFolder === undefined ? {} : { times: times.records, timesFolder, timeCells: times.cells }),
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "promotion.json"), promotionJson(verdict));
  writeFileSync(join(out, "promotion.md"), promotionMarkdown(verdict));
  const others = verdict.compare === undefined ? "" : ` The guard set v1 gives ${passText(verdict.compare.v1.pass)}, and v2 gives ${passText(verdict.compare.v2.pass)}.`;
  console.log(`The win test of ${candidate} against ${current} on ${verdict.inputs} inputs with the guard set ${verdict.guardSet}: ${passText(verdict.pass)}.${others}`);
  return verdict;
}

if (process.argv[1]?.endsWith("promote.ts") === true) promoteMain(process.argv.slice(2));
