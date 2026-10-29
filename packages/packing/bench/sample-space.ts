// The sampler of the whole space of roadmap item k112. It draws pairs of a config of `packSpace` and an input of a corpus
// family. It packs each pair and measures it as the bench runner does. `bench/coverage.ts --sample` scores the pairs.
//
//   node bench/sample-space.ts --out <dir> [--n 400] [--seed 1] [--draw uniform|option|stratified|active] [--stratify] [--max-count 1000] [--no-knobs]
//                              [--knobs relative|absolute] [--repeats 1] [--warmup 0] [--max-minutes <m>] [--prediction <id>] [--commit sha]
//                              [--timing off|stratum|mixed] [--pairs 16,20]
//
// `docs/BENCH.md` ("The whole space, sampled") tells how the draw works. The times of a local run do not count.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { join, resolve } from "node:path";
import {
  checkHard,
  corpusFamilies,
  DEFAULT_TOLERANCE,
  generator,
  isDeterministic,
  measureSeed,
  outputHash,
  packConfig,
  packSpace,
  round3,
  roundMeasures,
  toPackInput,
  UnsupportedCell,
  UnsupportedShape,
  type GeneratedInput,
  type PackHard,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";
import {
  canonicalConfig,
  checkConfig,
  configId,
  createFamilyRegistry,
  dimensionAt,
  paramActive,
  paramValue,
  shapeKindsOf,
  stepRandom,
  type CorpusDimension,
  type CorpusFamily,
  type MemberRule,
  type ParamValue,
  type SpaceConstraint,
  type SpaceParam,
  type StageChoice,
  type StageOption,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import { finite, hasClockLimit, pairValues, timeRuns, type BenchEnv } from "./run.ts";

/** The schema of the summary `sample.json` of a sample. */
export const SAMPLE_SCHEMA = "packing-sample-space/1";

/** The name of the set of each sampled input. It is the start of the input id. */
export const SAMPLE_SET = "sample-space";

/** The default count of the pairs. */
export const DEFAULT_PAIRS = 400;

/** The default largest count of the items of a sampled input. A larger input goes back, and the sampler draws again. */
export const DEFAULT_MAX_COUNT = 1000;

/** The largest count of the draws of a config for one input. Then the sampler draws a new input. */
export const MAX_CONFIG_TRIES = 20;

/** The default largest count of the draws of an input for one pair. Then the pair is an error, or a miss of its stratum. */
export const MAX_INPUT_TRIES = 200;

/**
 * The count of the misses that close a stratum of a stratified draw (k115). A miss is a pair that finds no input and config.
 * The later pairs of a closed stratum draw nothing. Thus a stratum costs at most `maxInputTries` inputs (200) and 4000 configs without a pair.
 */
export const MAX_STRATUM_MISSES = 1;

// ---- The random numbers ----

/** A source of random numbers from 0 to 1, as `stepRandom` of the contract gives it. */
export type Random = () => number;

/** This function gives a uniform whole number from 0 to `n - 1`, as a `bigint`. It throws a `RangeError` for an `n` of 0 or less. */
export function uniformBig(r: Random, n: bigint): bigint {
  if (n <= 0n) throw new RangeError(`The count of a draw is 1 or more, not ${n}.`);
  if (n === 1n) return 0n;
  const bits = (n - 1n).toString(2).length;
  const words = Math.ceil(bits / 32);
  const mask = (1n << BigInt(bits)) - 1n;
  // A draw at or above n goes back. Thus each value has the same chance.
  for (;;) {
    let x = 0n;
    for (let w = 0; w < words; w++) x = (x << 32n) | BigInt(Math.floor(r() * 4294967296));
    x &= mask;
    if (x < n) return x;
  }
}

/** This function gives the index of a weight, with a chance in proportion to the weight. It throws a `RangeError` when the weights sum to 0. */
export function pickWeighted(r: Random, weights: readonly bigint[]): number {
  const total = weights.reduce((s, w) => s + w, 0n);
  let x = uniformBig(r, total);
  for (const [i, w] of weights.entries()) {
    if (x < w) return i;
    x -= w;
  }
  return weights.length - 1;
}

// ---- The count of the configs ----

/** This function gives the discrete values of a param, or `null` for a real param without a step. */
export function discreteValues(p: SpaceParam): readonly ParamValue[] | null {
  if (p.kind === "bool") return [false, true];
  if (p.kind === "enum") return p.values ?? [];
  const min = p.min!;
  const max = p.max!;
  const step = p.step ?? (p.kind === "int" ? 1 : undefined);
  if (step === undefined) return null;
  const out: number[] = [];
  for (let k = 0; min + k * step <= max + 1e-9; k++) out.push(paramValue(p, min + k * step) as number);
  return out;
}

/** This function tells if a later param of the list reads the param `i` in its `when`. */
const readLater = (params: readonly SpaceParam[], i: number): boolean => params.slice(i + 1).some((q) => q.when?.param === params[i]!.name);

/**
 * This function gives the count of the param assignments of an option, with only the active params.
 * Each discrete value counts as one assignment. A real param without a step counts as one: the draw takes it from a uniform range.
 */
export function paramCount(params: readonly SpaceParam[], i = 0, values: Record<string, ParamValue> = {}): bigint {
  if (i === params.length) return 1n;
  const p = params[i]!;
  if (!paramActive(p, values)) return paramCount(params, i + 1, values);
  const list = discreteValues(p);
  if (list === null) {
    if (readLater(params, i)) throw new Error(`The real param ${p.name} has a later param that reads it. The sampler does not support it.`);
    return paramCount(params, i + 1, values);
  }
  if (!readLater(params, i)) return BigInt(list.length) * paramCount(params, i + 1, values);
  let sum = 0n;
  for (const v of list) sum += paramCount(params, i + 1, { ...values, [p.name]: v });
  return sum;
}

/** This function gives a real value of a param at the fraction `u` of its range, on its scale, with 6 significant digits. */
function realAt(p: SpaceParam, u: number): number {
  const min = p.min!;
  const max = p.max!;
  const x = p.scale === "log" ? Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min))) : min + u * (max - min);
  return Math.min(max, Math.max(min, Number(x.toPrecision(6))));
}

/** This function draws the params of an option. Each assignment of `paramCount` has the same chance. A real param is uniform on its scale. */
export function drawParams(r: Random, params: readonly SpaceParam[]): Record<string, ParamValue> {
  const values: Record<string, ParamValue> = {};
  params.forEach((p, i) => {
    if (!paramActive(p, values)) return;
    const list = discreteValues(p);
    if (list === null) {
      values[p.name] = realAt(p, r());
      return;
    }
    if (!readLater(params, i)) {
      values[p.name] = list[Number(uniformBig(r, BigInt(list.length)))]!;
      return;
    }
    // A param that a later param reads: each value gets the weight of the assignments after it
    const weights = list.map((v) => paramCount(params, i + 1, { ...values, [p.name]: v }));
    values[p.name] = list[pickWeighted(r, weights)]!;
  });
  return values;
}

/** This function tells if a choice of options keeps a constraint of a space. */
function holds(c: SpaceConstraint, chosen: ReadonlyMap<string, string | null>): boolean {
  const matches = (ref: { readonly stage: string; readonly option: string | null }): boolean => (chosen.get(ref.stage) ?? null) === ref.option;
  if (!matches(c.if)) return true;
  return "not" in c.then ? !matches(c.then.not) : matches(c.then);
}

/** One combination of the base options of a space: an option or `null` for each stage, and its count of param assignments. */
export interface BaseCombo {
  readonly options: ReadonlyMap<string, StageOption | null>;
  readonly weight: bigint;
}

/** One meta option of a space, with its stage and its count of configs. */
export interface MetaChoice {
  readonly stage: string;
  readonly option: StageOption;
  /** The count of the param assignments of the option. */
  readonly params: bigint;
  /** The count of the member lists. A `pool` gives its count of entries. */
  readonly lists: bigint;
  readonly weight: bigint;
}

/** The counts of the configs of a space. Each count is exact. */
export interface SpaceCounts {
  readonly combos: readonly BaseCombo[];
  /** The count of the base configs: the sum of the weights of the combinations. */
  readonly base: bigint;
  readonly meta: readonly MetaChoice[];
}

/** This function gives the count of the falling product `n (n - 1) ... (n - m + 1)`, divided by `m!` when the list is not ordered. */
function lists(n: bigint, m: number, ordered: boolean): bigint {
  let out = 1n;
  for (let k = 0; k < m; k++) {
    if (n - BigInt(k) <= 0n) return 0n;
    out = (out * (n - BigInt(k))) / (ordered ? 1n : BigInt(k + 1));
  }
  return out;
}

/** This function gives the count of the member lists of a rule from `base` base configs. Each list has distinct members. */
export function memberListCount(base: bigint, rule: MemberRule): bigint {
  if (rule.pool !== undefined) return BigInt(rule.pool.length);
  let sum = 0n;
  for (let m = rule.min; m <= rule.max; m++) sum += lists(base, m, rule.ordered);
  return sum;
}

/**
 * This function gives the exact counts of the configs of a space without parts. It counts as `spaceSize` of the contract does,
 * but each discrete param value counts, and a real param counts as one. It throws an `Error` for a space with parts.
 */
export function spaceCounts(space: StrategySpace): SpaceCounts {
  if (space.parts !== undefined && space.parts.length > 0) throw new Error("The sampler supports only a space without parts.");
  const combos: BaseCombo[] = [];
  const walk = (i: number, options: Map<string, StageOption | null>, weight: bigint): void => {
    if (i === space.stages.length) {
      const chosen = new Map([...options].map(([k, o]) => [k, o?.id ?? null]));
      if ((space.constraints ?? []).every((c) => holds(c, chosen))) combos.push({ options: new Map(options), weight });
      return;
    }
    const s = space.stages[i]!;
    const list: (StageOption | null)[] = s.options.filter((o) => o.members === undefined);
    if (s.optional === true) list.push(null);
    for (const o of list) {
      options.set(s.name, o);
      walk(i + 1, options, o === null ? weight : weight * paramCount(o.params));
    }
    options.delete(s.name);
  };
  walk(0, new Map(), 1n);
  const base = combos.reduce((s, c) => s + c.weight, 0n);
  const meta: MetaChoice[] = [];
  for (const s of space.stages)
    for (const o of s.options) {
      if (o.members === undefined) continue;
      const chosen = new Map(space.stages.map((x) => [x.name, x === s ? o.id : null]));
      if (!(space.constraints ?? []).every((c) => holds(c, chosen))) continue;
      const params = paramCount(o.params);
      const count = memberListCount(base, o.members);
      meta.push({ stage: s.name, option: o, params, lists: count, weight: params * count });
    }
  return { combos, base, meta };
}

// ---- The draw of a config ----

/** The ways to draw a config: `uniform` gives each config the same chance, `option` first picks the base or one meta option. */
export type DrawMode = "uniform" | "option";

/** The ways to draw the configs of a sample: a `DrawMode`, or `stratified` with the same count of pairs for each stratum (k115). */
export type SampleDraw = DrawMode | "stratified";

/** This function gives the stage choice of an option and its params, without an empty list of params. */
const choiceOf = (option: string, params: Record<string, ParamValue>): StageChoice => (Object.keys(params).length === 0 ? { option } : { option, params });

/** This function draws a base config from some combinations. Each base config of the combinations has the same chance. */
function drawCombo(r: Random, space: StrategySpace, combos: readonly BaseCombo[]): StrategyConfig {
  const combo = combos[pickWeighted(r, combos.map((c) => c.weight))]!;
  const stages: Record<string, StageChoice> = {};
  for (const [stage, o] of combo.options) if (o !== null) stages[stage] = choiceOf(o.id, drawParams(r, o.params));
  return { space: space.engine, stages };
}

/** This function draws a base config. Each base config has the same chance. */
export function drawBase(r: Random, space: StrategySpace, counts: SpaceCounts): StrategyConfig {
  return drawCombo(r, space, counts.combos);
}

/** This function draws the members of a meta option: a pool entry, or a list of distinct base configs. Each list has the same chance. */
function drawMembers(r: Random, space: StrategySpace, counts: SpaceCounts, rule: MemberRule): StrategyConfig[] {
  if (rule.pool !== undefined) return [...rule.pool[Number(uniformBig(r, BigInt(rule.pool.length)))]!];
  const sizes: number[] = [];
  for (let m = rule.min; m <= rule.max; m++) sizes.push(m);
  return drawDistinct(r, space, counts, sizes[pickWeighted(r, sizes.map((k) => lists(counts.base, k, rule.ordered)))]!);
}

/** This function draws an ordered list of `m` distinct base configs. Each list has the same chance. */
function drawDistinct(r: Random, space: StrategySpace, counts: SpaceCounts, m: number): StrategyConfig[] {
  const out: StrategyConfig[] = [];
  const ids = new Set<string>();
  // A member that is already in the list goes back. Thus each ordered list of distinct members has the same chance.
  while (out.length < m) {
    const member = drawBase(r, space, counts);
    const id = configId(space, member);
    if (ids.has(id)) continue;
    ids.add(id);
    out.push(member);
  }
  return out;
}

/**
 * This function draws one config of a space.
 *
 * - With `uniform`, the base configs and each meta option get a chance in proportion to their counts. Thus each config has the same chance.
 * - With `option`, the base configs and each meta option get the same chance. Inside each one, each config has the same chance.
 */
export function drawConfig(r: Random, space: StrategySpace, counts: SpaceCounts, mode: DrawMode = "uniform"): StrategyConfig {
  const weights = mode === "uniform" ? [counts.base, ...counts.meta.map((m) => m.weight)] : [1n, ...counts.meta.map(() => 1n)];
  const top = pickWeighted(r, weights);
  if (top === 0) return drawBase(r, space, counts);
  return metaConfig(r, space, counts, counts.meta[top - 1]!);
}

/** This function draws the params and the members of one meta option. */
function metaConfig(r: Random, space: StrategySpace, counts: SpaceCounts, meta: MetaChoice): StrategyConfig {
  const params = drawParams(r, meta.option.params);
  const members = drawMembers(r, space, counts, meta.option.members!);
  return { space: space.engine, stages: { [meta.stage]: { ...choiceOf(meta.option.id, params), members } } };
}

/** This function draws a config of a meta option. Each meta config of the space has the same chance. It throws a `RangeError` for a space without meta options. */
export function drawMeta(r: Random, space: StrategySpace, counts: SpaceCounts): StrategyConfig {
  if (counts.meta.length === 0) throw new RangeError("The space has no meta options.");
  return metaConfig(r, space, counts, counts.meta[pickWeighted(r, counts.meta.map((m) => m.weight))]!);
}

// ---- The strata (k115) ----

/** The stage that gives the family of a base config. A space without this stage uses its first stage. */
export const FAMILY_STAGE = "placement";

/** The param of a meta option with a `pool` that gives its size, for example `k` of `cell-portfolio`. */
export const POOL_SIZE_PARAM = "k";

/**
 * One stratum of a space: a strategy family with one size. The id is `<family>:<size>`, for example `portfolio:3`.
 *
 * - A base config has the family of its option of the stage `placement`, and the size 1.
 * - A meta option is its own family. Its size is its count of members, for example 2 to 5 for `portfolio`.
 * - A meta option with a `pool` gets one stratum for each value of its param `k`, for example `cell-portfolio:cell`.
 */
export interface Stratum {
  readonly id: string;
  readonly family: string;
  readonly size: string;
  /** The exact count of the configs of the stratum. */
  readonly configs: bigint;
  /** The base combinations of a base stratum, or the meta option of a meta stratum. */
  readonly combos?: readonly BaseCombo[];
  readonly meta?: MetaChoice;
  /** The params of the meta option, with the param `k` at one value for a `pool`. */
  readonly params?: readonly SpaceParam[];
  /** The count of the members of a meta stratum without a `pool`. */
  readonly members?: number;
  /** The space and the counts of the timing stratum `clock:1` (k121). The stratum draws only configs with a clock limit. */
  readonly timing?: { readonly space: StrategySpace; readonly counts: SpaceCounts };
}

/** This function gives the name of the stage that gives the family of a base config. */
const familyStageOf = (space: StrategySpace): string => (space.stages.some((s) => s.name === FAMILY_STAGE) ? FAMILY_STAGE : space.stages[0]!.name);

/** This function gives a param value as text. */
const valueText = (v: ParamValue | undefined): string => String(v);

/** This function gives the params of an option with one param at one value. The param becomes an `enum` with one value. */
const pinParam = (params: readonly SpaceParam[], name: string, value: ParamValue): SpaceParam[] =>
  params.map((p): SpaceParam => (p.name === name ? { name: p.name, kind: "enum", values: [value as string | number], default: value, ...(p.when === undefined ? {} : { when: p.when }) } : p));

/**
 * This function gives the strata of a space, in the order of the stages and of their options. A stratum without configs is not in the list.
 * For `packSpace`, it gives 25 strata: 7 base families, then `portfolio:2` to `portfolio:5`, the 3 values of `k` of `cell-portfolio`, and the other meta options.
 */
export function strataOf(space: StrategySpace, counts: SpaceCounts = spaceCounts(space)): Stratum[] {
  const out: Stratum[] = [];
  const stage = familyStageOf(space);
  for (const o of space.stages.find((s) => s.name === stage)!.options) {
    if (o.members !== undefined) continue;
    const combos = counts.combos.filter((c) => c.options.get(stage)?.id === o.id);
    const configs = combos.reduce((s, c) => s + c.weight, 0n);
    if (configs > 0n) out.push({ id: `${o.id}:1`, family: o.id, size: "1", configs, combos });
  }
  for (const meta of counts.meta) {
    const rule = meta.option.members!;
    const family = meta.option.id;
    if (rule.pool !== undefined) {
      const k = meta.option.params.find((p) => p.name === POOL_SIZE_PARAM);
      const values = k === undefined ? null : discreteValues(k);
      if (values === null) {
        out.push({ id: `${family}:${rule.pool[0]?.length ?? 0}`, family, size: String(rule.pool[0]?.length ?? 0), configs: meta.weight, meta, params: meta.option.params });
        continue;
      }
      for (const v of values) {
        const params = pinParam(meta.option.params, POOL_SIZE_PARAM, v);
        const configs = paramCount(params) * meta.lists;
        if (configs > 0n) out.push({ id: `${family}:${valueText(v)}`, family, size: valueText(v), configs, meta, params });
      }
      continue;
    }
    for (let m = rule.min; m <= rule.max; m++) {
      const configs = meta.params * lists(counts.base, m, rule.ordered);
      if (configs > 0n) out.push({ id: `${family}:${m}`, family, size: String(m), configs, meta, params: meta.option.params, members: m });
    }
  }
  return out;
}

/**
 * This function gives the stratum id of a config of a space, as `strataOf` makes it. It reads a canonical config or a config with omitted defaults.
 * A config with an unknown meta option gives the option and its count of members.
 */
export function stratumOf(space: StrategySpace, config: StrategyConfig): string {
  for (const s of space.stages) {
    const choice = config.stages[s.name];
    if (choice === null || choice === undefined) continue;
    const option = s.options.find((o) => o.id === choice.option);
    if (option?.members === undefined) continue;
    const members = choice.members?.length ?? 0;
    if (option.members.pool === undefined) return `${option.id}:${members}`;
    const k = option.params.find((p) => p.name === POOL_SIZE_PARAM);
    return `${option.id}:${k === undefined ? members : valueText(choice.params?.[POOL_SIZE_PARAM] ?? k.default)}`;
  }
  return `${config.stages[familyStageOf(space)]?.option ?? "none"}:1`;
}

/** This function draws one config of a stratum. Each config of the stratum has the same chance. */
export function drawStratum(r: Random, space: StrategySpace, counts: SpaceCounts, stratum: Stratum): StrategyConfig {
  if (stratum.timing !== undefined) return drawMeta(r, stratum.timing.space, stratum.timing.counts);
  if (stratum.meta === undefined) return drawCombo(r, space, stratum.combos!);
  const meta = stratum.meta;
  const params = drawParams(r, stratum.params ?? meta.option.params);
  const rule = meta.option.members!;
  const members = rule.pool !== undefined ? drawMembers(r, space, counts, rule) : drawDistinct(r, space, counts, stratum.members!);
  return { space: space.engine, stages: { [meta.stage]: { ...choiceOf(meta.option.id, params), members } } };
}

// ---- The clock limits (k121) ----

/** The param that switches on the wall-clock limit `budgetMs` of an option, for example of `portfolio` and `restarts`. */
export const CLOCK_PARAM = "limitTime";

/** The id of the timing stratum: the configs with a clock limit. Only the timing `stratum` draws it. */
export const CLOCK_STRATUM = "clock:1";

/**
 * The clock limits of a sample (k121). A result with a clock limit measures the computer, not the algorithm. Thus no model can cover it.
 *
 * - `off`: the draws give no config with a clock limit. This is the default.
 * - `stratum`: a stratified draw adds the timing stratum `clock:1`. It goes only with the draw `stratified`.
 * - `mixed`: the draws of k112 to k118 over the whole space. Pair `i` is the pair of a sample before k121.
 */
export type Timing = "off" | "stratum" | "mixed";

/** The clock limits of a sample. The first one is the default. */
export const TIMINGS: readonly Timing[] = Object.freeze(["off", "stratum", "mixed"]);

/** This function gives a space with the param `limitTime` of each option at one value. The param becomes an `enum` with one value. */
function pinClock(space: StrategySpace, value: boolean, keep: (o: StageOption) => boolean): StrategySpace {
  const stages = space.stages.map((s) => ({
    ...s,
    options: s.options.filter(keep).map((o) => (o.params.some((p) => p.name === CLOCK_PARAM) ? { ...o, params: pinParam(o.params, CLOCK_PARAM, value) } : o)),
  }));
  return { ...space, stages };
}

/** This function gives the space without the configs with a clock limit: the param `limitTime` of each option is always `false`. */
export function clockFree(space: StrategySpace): StrategySpace {
  return pinClock(space, false, () => true);
}

/**
 * This function gives the space of the timing stratum. Its meta options are the meta options with the param `limitTime`, always at `true`.
 * The base options stay, because they give the members.
 */
export function clockOnly(space: StrategySpace): StrategySpace {
  return pinClock(space, true, (o) => o.members === undefined || o.params.some((p) => p.name === CLOCK_PARAM));
}

/** The draw of the configs of a sample: the space of the draws, its counts, the strata of a stratified draw, and the clock limits. */
export interface DrawPlan {
  /** The space of the draws. With the timing `off` or `stratum`, it is `clockFree` of the space. */
  readonly space: StrategySpace;
  readonly counts: SpaceCounts;
  /** The strata of a stratified draw, else none. The timing `stratum` adds `clock:1` at the end. */
  readonly strata: readonly Stratum[];
  readonly draw: SampleDraw;
  readonly timing: Timing;
}

/** This function gives the draw of the configs of a sample. It throws a `RangeError` for the timing `stratum` without the draw `stratified`. */
export function drawPlan(space: StrategySpace, draw: SampleDraw, timing: Timing = "off"): DrawPlan {
  if (!TIMINGS.includes(timing)) throw new RangeError(`The timing is ${TIMINGS.join(", ")}, not ${String(timing)}.`);
  if (timing === "stratum" && draw !== "stratified") throw new RangeError("The timing stratum goes only with the draw stratified.");
  const drawSpace = timing === "mixed" ? space : clockFree(space);
  const counts = spaceCounts(drawSpace);
  const strata: Stratum[] = draw === "stratified" ? strataOf(drawSpace, counts) : [];
  if (timing === "stratum") {
    const only = clockOnly(space);
    const c = spaceCounts(only);
    const configs = c.meta.reduce((s, m) => s + m.weight, 0n);
    if (configs > 0n) strata.push({ id: CLOCK_STRATUM, family: "clock", size: "1", configs, timing: { space: only, counts: c } });
  }
  return { space: drawSpace, counts, strata, draw, timing };
}

/** This function draws one config of a plan: from the stratum of a stratified draw, else with the draw mode of the plan. */
export function drawOf(r: Random, plan: DrawPlan, stratum: Stratum | undefined): StrategyConfig {
  if (plan.draw === "stratified") return drawStratum(r, plan.space, plan.counts, stratum!);
  return drawConfig(r, plan.space, plan.counts, plan.draw);
}

// ---- The draw of an input ----

/** The draw of an input: the family, its version, the value of each dimension and the seed. */
export interface InputDraw {
  readonly family: string;
  readonly version: number;
  readonly dims: Readonly<Record<string, ParamValue>>;
  readonly seed: number;
  /** The ratios of the relative knobs to the median side of the items. `resolveDraw` turns them into the values of `dims`. */
  readonly ratios?: Readonly<Record<string, number>>;
}

/**
 * The scale of the knobs `margin` and `gap` (roadmap item k118).
 *
 * - `absolute`: the value of the dimension, from 0 to 32, whatever the size of the items. This is the draw of k112.
 * - `relative`: a ratio to the median side of the items. `resolveDraw` gives the value of the dimension.
 */
export type KnobScale = "absolute" | "relative";

/** The scales of the knobs. */
export const KNOB_SCALES: readonly KnobScale[] = Object.freeze(["absolute", "relative"]);

/**
 * The ratios of a relative knob: the chance of the value 0, and the range of a ratio above 0 on a log scale.
 * A ratio of 0.5 of the median side is a wide margin. A ratio of 0.01 is a thin line.
 */
export const KNOB_RATIO = Object.freeze({ zero: 1 / 3, min: 0.01, max: 0.5 });

/** The options of the draw of an input. */
export interface InputDrawOptions {
  /** With `false`, the knobs `margin` and `gap` keep their defaults. The default is `true`. */
  readonly knobs?: boolean;
  /** The scale of the knobs. The default is `absolute`. A relative draw puts the ratios in `ratios` and 0 in `dims`. */
  readonly knobScale?: KnobScale;
}

/** The knobs of a family that `--no-knobs` keeps at their defaults. */
const KNOBS: readonly string[] = ["margin", "gap"];

/** This function gives the supported values of an `enum` or `bool` dimension. */
function supportedList(d: CorpusDimension): readonly ParamValue[] {
  const all = d.kind === "bool" ? [false, true] : (d.values ?? []);
  const s = d.supported;
  return s === undefined || !Array.isArray(s) ? all : all.filter((v) => (s as readonly ParamValue[]).includes(v));
}

/**
 * This function draws one value of a dimension. An `enum` and a `bool` are uniform over their supported values.
 * An `int` with a linear scale is uniform over its whole numbers. Another numeric dimension is uniform on its scale.
 * A numeric draw stays in the supported range.
 */
export function drawDimension(r: Random, d: CorpusDimension): ParamValue {
  if (d.kind === "enum" || d.kind === "bool") {
    const list = supportedList(d);
    return list[Number(uniformBig(r, BigInt(list.length)))]!;
  }
  const s = d.supported;
  const range = s === undefined || Array.isArray(s) ? {} : (s as { min?: number; max?: number });
  const min = range.min ?? d.min ?? 0;
  const max = range.max ?? d.max ?? min;
  if (d.kind === "int" && d.scale !== "log") return min + Number(uniformBig(r, BigInt(max - min + 1)));
  const v = dimensionAt({ ...d, min, max }, r());
  // A dimension with `precision` gets the value that the family uses: the knobs `margin` and `gap` keep 3 decimals.
  if (d.precision === undefined || typeof v !== "number") return v;
  const f = 10 ** d.precision;
  return Math.min(max, Math.max(min, Math.round(v * f) / f));
}

/** This function draws an input: a family with the same chance for each family, then each active dimension of the family. */
export function drawInput(r: Random, families: readonly CorpusFamily<GeneratedInput>[], options: InputDrawOptions = {}): InputDraw {
  const f = families[Number(uniformBig(r, BigInt(families.length)))]!;
  const dims: Record<string, ParamValue> = {};
  const ratios: Record<string, number> = {};
  for (const d of f.dimensions) {
    if (!paramActive(d, dims)) continue;
    if (options.knobs === false && KNOBS.includes(d.name)) continue;
    if (options.knobScale === "relative" && KNOBS.includes(d.name)) {
      // A relative knob takes one random number, as an absolute knob does. Thus the seed and the configs of a pair stay the same.
      ratios[d.name] = knobRatio(r());
      dims[d.name] = 0;
      continue;
    }
    dims[d.name] = drawDimension(r, d);
  }
  const seed = Math.floor(r() * 2147483648);
  return { family: f.name, version: f.version, dims, seed, ...(Object.keys(ratios).length === 0 ? {} : { ratios }) };
}

/** This function gives the ratio of a relative knob for a random number `u` from 0 to 1. The ratio keeps 4 decimals. */
export function knobRatio(u: number): number {
  if (u < KNOB_RATIO.zero) return 0;
  const at = (u - KNOB_RATIO.zero) / (1 - KNOB_RATIO.zero);
  return Math.round(KNOB_RATIO.min * (KNOB_RATIO.max / KNOB_RATIO.min) ** at * 1e4) / 1e4;
}

/** This function gives the median of the sides of the items: each width and each height counts one time. */
export function medianSide(boxes: readonly { readonly w: number; readonly h: number }[]): number {
  const sides = boxes.flatMap((b) => [b.w, b.h]).sort((a, b) => a - b);
  if (sides.length === 0) return 0;
  const mid = sides.length >> 1;
  return sides.length % 2 === 1 ? sides[mid]! : (sides[mid - 1]! + sides[mid]!) / 2;
}

/**
 * This function turns the ratios of a relative draw into the values of its knobs: the ratio times the median side of the items.
 * The value keeps the 3 decimals of the knob, and stays in the supported range of the dimension.
 * The knobs do not change the boxes of a generator, so the function generates the input with the knobs at 0 to get the sides.
 * A draw without ratios, or a draw that the generator refuses, comes back the same.
 */
export function resolveDraw(draw: InputDraw, registry: FamilyRegistry, families: readonly CorpusFamily<GeneratedInput>[] = corpusFamilies): InputDraw {
  if (draw.ratios === undefined) return draw;
  let side: number;
  try {
    side = medianSide(registry.generate(draw.family, draw.seed, draw.dims, { version: draw.version, set: SAMPLE_SET }).boxes);
  } catch (error) {
    if (error instanceof RangeError) return draw;
    throw error;
  }
  const f = families.find((x) => x.name === draw.family && x.version === draw.version);
  const dims: Record<string, ParamValue> = { ...draw.dims };
  for (const [name, ratio] of Object.entries(draw.ratios)) {
    const d = f?.dimensions.find((x) => x.name === name);
    const s = d?.supported;
    const range = s === undefined || Array.isArray(s) ? {} : (s as { min?: number; max?: number });
    const max = range.max ?? d?.max ?? Infinity;
    const min = range.min ?? d?.min ?? 0;
    dims[name] = Math.min(max, Math.max(min, round3(ratio * side)));
  }
  return { ...draw, dims };
}

// ---- The pairs ----

/** One sampled record: a `layout-record/1` record of the bench, with the config and the facts of the input. */
export interface SampleRecord {
  readonly schema: "layout-record/1";
  readonly stage: "pack";
  readonly step: "pack";
  /** The text `space:` and the `configId` of the config. */
  readonly strategy: string;
  readonly options: Readonly<Record<string, never>>;
  readonly corpus: string;
  readonly input: string;
  readonly inputHash: string;
  readonly set: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  readonly measures: Record<string, number>;
  readonly hard: PackHard;
  readonly tolerance: { readonly overlap: number };
  /** The value `true` when each later pass of the pair gives the output of the first pass. The later passes are the second, warm-up and timed passes. */
  readonly deterministic: boolean;
  readonly prediction: string;
  readonly ms: number;
  readonly msRuns: number[];
  readonly outputHash: string;
  readonly env: BenchEnv;
  commit?: string;
  /** The index of the pair in the sample. */
  readonly pair: number;
  /** The value of `hasClockLimit` of the config (k121). A pair with a clock limit is outside the coverage and the determinism gate. */
  readonly clock: boolean;
  /** The canonical config of `packSpace`. */
  readonly config: StrategyConfig;
  /** The generator of the input, with its full params. */
  readonly generator: { readonly name: string; readonly version: number; readonly params: Readonly<Record<string, unknown>> };
  /** The cell of the generator for the params. */
  readonly cell: Readonly<Record<string, unknown>>;
  /** The knobs of the family: `margin` and `gap`. */
  readonly knobs: { readonly margin: number; readonly gap: number };
  /** The ratios of the relative knobs to the median side of the items, when the scale is `relative`. */
  readonly knobRatios?: { readonly margin: number; readonly gap: number };
}

/** The options of `sampleSpace`. */
export interface SampleOptions {
  /** The count of the pairs. The default is 400. */
  readonly n?: number;
  /** The seed of the sample. The default is 1. */
  readonly seed?: number;
  /** The draw of the configs. The default is `uniform`. With `stratified`, pair `i` takes the stratum `i` modulo the count of the strata. */
  readonly draw?: SampleDraw;
  /** The largest count of the items of an input. The default is 1000. */
  readonly maxCount?: number;
  readonly knobs?: boolean;
  /** The scale of the knobs `margin` and `gap`. The default is `relative` since roadmap item k118. */
  readonly knobScale?: KnobScale;
  /** The timed passes of each pair. The default is 1. */
  readonly repeats?: number;
  /** The passes of each pair before the timed passes. The default is 0. */
  readonly warmup?: number;
  /** The time after which the sampler starts no new pair, in minutes. The pairs before it stay the same. */
  readonly maxMinutes?: number;
  readonly prediction?: string;
  readonly env: BenchEnv;
  readonly commit?: string;
  readonly clock?: () => number;
  /** The space of the configs. The default is `packSpace`. A test gives a small space. */
  readonly space?: StrategySpace;
  /** The largest count of the draws of an input for one pair. The default is `MAX_INPUT_TRIES`, 200. A test gives a smaller count. */
  readonly maxInputTries?: number;
  /**
   * The largest param `iterations` of a config of `overlap-min` (roadmap item k80). The default is none. A test gives a small count.
   * The sampler lowers a larger value to this count before the pack, so the record has the config that it packed.
   */
  readonly maxOverlapMoves?: number;
  /** The clock limits of the draws (k121). The default is `off`: no config has a clock limit. */
  readonly timing?: Timing;
  /**
   * The indexes of the pairs to measure, in place of the pairs 0 to `n - 1` (k121). Each pair has its own random stream, so pair `i` is the pair `i` of the full sample.
   * A stratum that an earlier pair closed draws again. The default is each pair.
   */
  readonly pairs?: readonly number[];
}

/** The summary of a sample, schema `packing-sample-space/1`. */
export interface SampleSummary {
  readonly schema: typeof SAMPLE_SCHEMA;
  readonly seed: number;
  /** The count of the pairs that the options asked for. */
  readonly requested: number;
  /** The count of the measured pairs. */
  readonly pairs: number;
  readonly draw: SampleDraw;
  readonly maxCount: number;
  readonly knobs: boolean;
  readonly knobScale: KnobScale;
  readonly repeats: number;
  readonly warmup: number;
  /** The exact counts of the configs of the space, as decimal text. */
  readonly space: { readonly base: string; readonly meta: Readonly<Record<string, string>> };
  /** The configs that the sampler drew, and the configs that went back. */
  readonly configs: { readonly drawn: number; readonly rejected: number; readonly rate: number; readonly reasons: Readonly<Record<string, number>> };
  /** The inputs that the sampler drew, and the inputs that went back. */
  readonly inputs: { readonly drawn: number; readonly rejected: number; readonly reasons: Readonly<Record<string, number>> };
  /** The count of the measured pairs for each option of `combine`, `none` for a base config. */
  readonly composition: Readonly<Record<string, number>>;
  /** The count of the measured pairs for each family. */
  readonly families: Readonly<Record<string, number>>;
  /** The pairs with a hard break, and the count of the pairs with a break of each rule. */
  readonly hard: { readonly pairs: number; readonly rules: Readonly<Record<string, number>> };
  /** The count of the pairs with two different outputs of the same seed. */
  readonly nondeterministic: number;
  /** The pairs of `nondeterministic` with a clock limit (k121). They do not fail the sample. */
  readonly nondeterministicClock: number;
  /** The pairs of `nondeterministic` without a clock limit (k121). Each one fails the sample. */
  readonly nondeterministicPairs: readonly { readonly pair: number; readonly input: string; readonly config: string }[];
  /** The clock limits of the draws (k121). */
  readonly timing: Timing;
  /** The count of the measured pairs with a clock limit (k121). The coverage does not read them. */
  readonly clockPairs: number;
  /** The indexes of the pairs that the options asked for, when they are not 0 to `n - 1` (k121). */
  readonly pairList?: readonly number[];
  readonly errors: readonly { readonly pair: number; readonly input: string; readonly config: string; readonly message: string }[];
  /** `time` when `maxMinutes` stopped the sample before its last pair. */
  readonly stopped?: "time";
  /**
   * The strata of a stratified draw. `configs` is the exact count of the configs, as decimal text. `pairs` is the count of the measured pairs.
   * `missed` is the count of the pairs without an input and config. The pairs of a closed stratum count as `missed`.
   */
  readonly strata?: Readonly<Record<string, { readonly configs: string; readonly pairs: number; readonly missed: number }>>;
}

/** This function gives a config with the param `iterations` of `overlap-min` at most `cap`. Another config stays the same. */
export function capMoves(config: StrategyConfig, cap: number | undefined): StrategyConfig {
  const combine = config.stages["combine"];
  const moves = combine?.params?.["iterations"];
  if (cap === undefined || combine?.option !== "overlap-min" || typeof moves !== "number" || moves <= cap) return config;
  return { ...config, stages: { ...config.stages, combine: { ...combine, params: { ...combine.params, iterations: cap } } } };
}

/** This function adds one to a count of a record. */
const bump = (out: Record<string, number>, key: string): void => {
  out[key] = (out[key] ?? 0) + 1;
};

/** This function gives the option of the stage `combine` of a config, or `none`. */
const combineOf = (config: StrategyConfig): string => config.stages["combine"]?.option ?? "none";

/** The registry of the corpus families. */
export type FamilyRegistry = ReturnType<typeof createFamilyRegistry<GeneratedInput>>;

/** This function gives an input file for a draw, or the reason that it goes back: `generate` or `max-count`. */
export function generateInput(draw: InputDraw, registry: FamilyRegistry, maxCount: number): GeneratedInput | string {
  let file: GeneratedInput;
  try {
    file = registry.generate(draw.family, draw.seed, draw.dims, { version: draw.version, set: SAMPLE_SET });
  } catch (error) {
    if (error instanceof RangeError) return "generate";
    throw error;
  }
  return file.boxes.length > maxCount ? "max-count" : file;
}

/**
 * This function packs a pair one time. A config that throws `UnsupportedCell` or `UnsupportedShape` gives the reason that it goes back.
 * Another error goes to the caller.
 */
export function firstPack(input: PackInput, config: StrategyConfig, seed: number): PackOutput | string {
  try {
    return packConfig(input, config, seed);
  } catch (error) {
    if (error instanceof UnsupportedCell) return `unsupported:${error.dimension}=${error.value}`;
    if (error instanceof UnsupportedShape) return "unsupported:shape";
    throw error;
  }
}

/** A pair for `measurePair`: the input, its file and draw, the canonical config, its id, the first pack and the index of the pair. */
export interface PairToMeasure {
  readonly input: PackInput;
  readonly file: GeneratedInput;
  readonly draw: InputDraw;
  readonly config: StrategyConfig;
  readonly id: string;
  readonly first: PackOutput;
  readonly pair: number;
}

/** The options of `measurePair`. */
export interface MeasureOptions {
  readonly env: BenchEnv;
  readonly prediction: string;
  readonly repeats: number;
  readonly warmup: number;
  readonly clock: () => number;
  readonly commit?: string;
}

/**
 * This function packs a pair a second time for `deterministic`, then `warmup` times, then `repeats` times with a clock. It gives the record of the pair.
 * Each pass after the first counts for `deterministic` (k121). Thus a sample with 10 repeats compares 11 outputs with the first output.
 */
export function measurePair(p: PairToMeasure, o: MeasureOptions): SampleRecord {
  const { input, file, draw: d, config, id, first } = p;
  const later: PackOutput[] = [packConfig(input, config, file.seed)];
  const pack = (): PackOutput => {
    const output = packConfig(input, config, file.seed);
    later.push(output);
    return output;
  };
  for (let w = 0; w < o.warmup; w++) pack();
  const { msRuns, searchMs } = timeRuns(pack, o.repeats, o.clock);
  const values = pairValues(input, first, searchMs, file.known);
  // k123: the move between the outputs of two seeds of the config
  Object.assign(values, measureSeed(input, first, packConfig(input, config, file.seed + 1)));
  const hard = checkHard(input, first, DEFAULT_TOLERANCE);
  const params = file.generator?.params ?? {};
  const record: SampleRecord = {
    schema: "layout-record/1",
    stage: "pack",
    step: "pack",
    strategy: `space:${id}`,
    options: {},
    corpus: SAMPLE_SET,
    input: file.id,
    inputHash: file.hash,
    set: file.set,
    seed: file.seed,
    nodes: file.boxes.length + (file.obstacles?.length ?? 0),
    edges: file.edges.length,
    measures: roundMeasures(finite(values)),
    hard,
    tolerance: { overlap: DEFAULT_TOLERANCE.overlap },
    deterministic: later.every((output) => isDeterministic(first, output)),
    prediction: o.prediction,
    ms: round3(medianOf(msRuns)),
    msRuns: msRuns.map(round3),
    outputHash: outputHash(first),
    env: o.env,
    pair: p.pair,
    clock: hasClockLimit(config),
    config,
    generator: { name: d.family, version: d.version, params },
    cell: generator(d.family, d.version).cell(params as never) as unknown as Record<string, unknown>,
    knobs: { margin: Number(d.dims["margin"] ?? 0), gap: Number(d.dims["gap"] ?? 0) },
    ...(d.ratios === undefined ? {} : { knobRatios: { margin: d.ratios["margin"] ?? 0, gap: d.ratios["gap"] ?? 0 } }),
  };
  if (o.commit !== undefined) record.commit = o.commit;
  return record;
}

/**
 * This function draws and measures the pairs of a sample. Each pair has its own random stream `stepRandom(seed, pair-<i>)`.
 *
 * 1. It draws an input. An input that the generator refuses, or with more than `maxCount` items, goes back.
 * 2. It draws a config. A config that `checkConfig` refuses for the shapes of the input goes back, and so does a config that throws `UnsupportedCell` or `UnsupportedShape`.
 * 3. After 20 configs that go back, it draws a new input. Thus the draw is uniform over the configs that the input accepts.
 * 4. It packs the pair 2 times for `deterministic`, then `warmup` times, then `repeats` times with a clock, as `runBench` does.
 *
 * Another error goes into `errors`, and the sampler goes on. A stratified pair without an input and config is a miss of its stratum, not an error.
 * After `MAX_STRATUM_MISSES` misses, the stratum closes: its later pairs draw nothing and count as missed.
 * The configs come from `drawPlan` with the option `timing`. With the default `off`, no config has a clock limit (k121).
 */
export function sampleSpace(options: SampleOptions): { records: SampleRecord[]; summary: SampleSummary } {
  const n = options.n ?? DEFAULT_PAIRS;
  const seed = options.seed ?? 1;
  const draw = options.draw ?? "uniform";
  const maxCount = options.maxCount ?? DEFAULT_MAX_COUNT;
  const knobs = options.knobs ?? true;
  const knobScale = options.knobScale ?? "relative";
  const repeats = options.repeats ?? 1;
  const warmup = options.warmup ?? 0;
  const space = options.space ?? packSpace;
  const maxInputTries = options.maxInputTries ?? MAX_INPUT_TRIES;
  const clock = options.clock ?? (() => performance.now());
  const prediction = options.prediction ?? "k112-whole-space";
  if (!Number.isInteger(n) || n < 0) throw new RangeError("The count of the pairs is a whole number of 0 or more.");
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  if (!Number.isInteger(maxInputTries) || maxInputTries < 1) throw new RangeError("The input tries are a whole number of 1 or more.");
  const maxOverlapMoves = options.maxOverlapMoves;
  if (maxOverlapMoves !== undefined && (!Number.isInteger(maxOverlapMoves) || maxOverlapMoves < 1)) throw new RangeError("The overlap moves are a whole number of 1 or more.");
  const pairList = options.pairs;
  if (pairList !== undefined && !pairList.every((p) => Number.isInteger(p) && p >= 0)) throw new RangeError("The pairs are whole numbers of 0 or more.");
  const timing = options.timing ?? "off";
  // k121: the draws use the space of the plan. The checks, the canonical configs and the ids use the whole space.
  const plan = drawPlan(space, draw, timing);
  const counts = plan.counts;
  const strata = plan.strata;
  if (draw === "stratified" && strata.length === 0) throw new RangeError("The space has no strata.");
  const strataPairs: Record<string, number> = Object.fromEntries(strata.map((s) => [s.id, 0]));
  const strataMissed: Record<string, number> = Object.fromEntries(strata.map((s) => [s.id, 0]));
  const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
  const start = Date.now();
  const records: SampleRecord[] = [];
  const errors: SampleSummary["errors"][number][] = [];
  const configReasons: Record<string, number> = {};
  const inputReasons: Record<string, number> = {};
  const composition: Record<string, number> = {};
  const families: Record<string, number> = {};
  const hardRules: Record<string, number> = {};
  let configsDrawn = 0;
  let configsRejected = 0;
  let inputsDrawn = 0;
  let inputsRejected = 0;
  let hardPairs = 0;
  let nondeterministic = 0;
  let nondeterministicClock = 0;
  let clockPairs = 0;
  const nondeterministicPairs: SampleSummary["nondeterministicPairs"][number][] = [];
  let stopped: "time" | undefined;

  for (const pair of pairList ?? Array.from({ length: n }, (_, i) => i)) {
    if (options.maxMinutes !== undefined && Date.now() - start > options.maxMinutes * 60000) {
      stopped = "time";
      break;
    }
    const r = stepRandom(seed, `pair-${pair}`);
    const stratum = strata[pair % Math.max(1, strata.length)];
    // A closed stratum draws nothing: each of its pairs is a miss.
    if (stratum !== undefined && strataMissed[stratum.id]! >= MAX_STRATUM_MISSES) {
      bump(strataMissed, stratum.id);
      continue;
    }
    let done = false;
    for (let inputTry = 0; inputTry < maxInputTries && !done; inputTry++) {
      const d = resolveDraw(drawInput(r, corpusFamilies, { knobs, knobScale }), registry);
      inputsDrawn++;
      const file = generateInput(d, registry, maxCount);
      if (typeof file === "string") {
        inputsRejected++;
        bump(inputReasons, file);
        continue;
      }
      const input = toPackInput(file);
      const shapes = shapeKindsOf({ boxes: input.items });
      for (let configTry = 0; configTry < MAX_CONFIG_TRIES && !done; configTry++) {
        const config = drawOf(r, plan, stratum);
        configsDrawn++;
        const breaks = checkConfig(space, config, { shapes });
        if (breaks.length > 0) {
          configsRejected++;
          bump(configReasons, `check:${breaks[0]!.claim}`);
          continue;
        }
        const canonical = capMoves(canonicalConfig(space, config), maxOverlapMoves);
        const id = configId(space, canonical);
        let first: PackOutput | string;
        try {
          first = firstPack(input, canonical, file.seed);
        } catch (error) {
          errors.push({ pair, input: file.id, config: id, message: error instanceof Error ? error.message : String(error) });
          done = true;
          break;
        }
        if (typeof first === "string") {
          configsRejected++;
          bump(configReasons, first);
          continue;
        }
        done = true;
        try {
          const record = measurePair({ input, file, draw: d, config: canonical, id, first, pair }, { env: options.env, prediction, repeats, warmup, clock, ...(options.commit === undefined ? {} : { commit: options.commit }) });
          const broken = Object.entries(record.hard).filter(([, v]) => v > 0);
          if (broken.length > 0) hardPairs++;
          for (const [rule] of broken) bump(hardRules, rule);
          if (record.clock) clockPairs++;
          if (!record.deterministic) {
            nondeterministic++;
            if (record.clock) nondeterministicClock++;
            else nondeterministicPairs.push({ pair, input: file.id, config: id });
          }
          records.push(record);
          bump(composition, combineOf(canonical));
          if (draw === "stratified") bump(strataPairs, stratum!.timing === undefined ? stratumOf(space, canonical) : stratum!.id);
          bump(families, `${d.family}@${d.version}`);
        } catch (error) {
          errors.push({ pair, input: file.id, config: id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (!done && stratum !== undefined) bump(strataMissed, stratum.id);
    else if (!done) errors.push({ pair, input: "-", config: "-", message: `The pair found no input and config after ${maxInputTries} inputs.` });
  }

  const summary: SampleSummary = {
    schema: SAMPLE_SCHEMA,
    seed,
    requested: pairList?.length ?? n,
    pairs: records.length,
    draw,
    maxCount,
    knobs,
    knobScale,
    repeats,
    warmup,
    space: { base: counts.base.toString(), meta: Object.fromEntries(counts.meta.map((m) => [m.option.id, m.weight.toString()])) },
    configs: { drawn: configsDrawn, rejected: configsRejected, rate: configsDrawn === 0 ? 0 : round4(configsRejected / configsDrawn), reasons: configReasons },
    inputs: { drawn: inputsDrawn, rejected: inputsRejected, reasons: inputReasons },
    composition,
    families,
    hard: { pairs: hardPairs, rules: hardRules },
    nondeterministic,
    nondeterministicClock,
    nondeterministicPairs,
    timing,
    clockPairs,
    ...(pairList === undefined ? {} : { pairList: [...pairList] }),
    errors,
    ...(stopped === undefined ? {} : { stopped }),
    ...(draw === "stratified" ? { strata: Object.fromEntries(strata.map((s) => [s.id, { configs: s.configs.toString(), pairs: strataPairs[s.id] ?? 0, missed: strataMissed[s.id] ?? 0 }])) } : {}),
  };
  return { records, summary };
}

/** This function gives the median of some values. No value gives 0. */
function medianOf(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** This function rounds a value to 4 decimals. */
const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

// ---- The command line ----

/** This function gives the value of an option of the command line, or `undefined`. It throws an `Error` for an option without a value. */
export function optionOf(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  if (at < 0) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`The option ${name} needs a value.`);
  return value;
}

/** This function gives a whole-number option, or the fallback. It throws an `Error` for a value that is not a whole number. */
export function wholeOf(argv: readonly string[], name: string, fallback: number): number {
  const text = optionOf(argv, name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`The option ${name} is a whole number, not "${text}".`);
  return Number(text);
}

/** This function gives the facts of this computer, as the bench runner gives them. */
export function envOf(): BenchEnv {
  const list = cpus();
  return {
    node: process.version,
    os: process.env["RUNNER_OS"] ?? platform(),
    arch: arch(),
    runner: process.env["RUNNER_NAME"] ?? "local",
    cpu: list[0]?.model.trim() ?? "unknown",
    cpus: list.length,
  };
}

/** This function gives the first 7 characters of the commit: `--commit`, then `GITHUB_SHA`, then `git rev-parse`. */
export function commitOf(argv: readonly string[]): string | undefined {
  const given = optionOf(argv, "--commit") ?? process.env["GITHUB_SHA"];
  if (given) return given.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

/** This function gives the options of `sampleSpace` from the command line. It throws an `Error` for a bad value. */
export function sampleOptions(argv: readonly string[], env: BenchEnv): SampleOptions {
  const stratify = argv.includes("--stratify");
  const draw = optionOf(argv, "--draw") ?? (stratify ? "stratified" : "uniform");
  if (draw === "active") throw new Error("The draw active is in bench/active.ts. Start node bench/active.ts, or node bench/sample-space.ts --draw active.");
  if (draw !== "uniform" && draw !== "option" && draw !== "stratified") throw new Error(`The option --draw is uniform, option or stratified, not ${draw}.`);
  if (stratify && draw !== "stratified") throw new Error(`The option --stratify does not go with --draw ${draw}.`);
  const minutes = optionOf(argv, "--max-minutes");
  if (minutes !== undefined && !(Number(minutes) > 0)) throw new Error(`The option --max-minutes is a number above 0, not ${minutes}.`);
  const prediction = optionOf(argv, "--prediction");
  const knobScale = optionOf(argv, "--knobs") ?? "relative";
  if (!(KNOB_SCALES as readonly string[]).includes(knobScale)) throw new Error(`The option --knobs is relative or absolute, not ${knobScale}.`);
  const timing = optionOf(argv, "--timing") ?? "off";
  if (!(TIMINGS as readonly string[]).includes(timing)) throw new Error(`The option --timing is ${TIMINGS.join(", ")}, not ${timing}.`);
  if (timing === "stratum" && draw !== "stratified") throw new Error("The option --timing stratum goes only with --draw stratified.");
  const pairsText = optionOf(argv, "--pairs");
  if (pairsText !== undefined && !/^\d+(,\d+)*$/.test(pairsText)) throw new Error(`The option --pairs is whole numbers with commas, for example 16,20, not ${pairsText}.`);
  return {
    n: wholeOf(argv, "--n", DEFAULT_PAIRS),
    seed: wholeOf(argv, "--seed", 1),
    draw,
    maxCount: wholeOf(argv, "--max-count", DEFAULT_MAX_COUNT),
    knobs: !argv.includes("--no-knobs"),
    knobScale: knobScale as KnobScale,
    repeats: wholeOf(argv, "--repeats", 1),
    warmup: wholeOf(argv, "--warmup", 0),
    env,
    timing: timing as Timing,
    ...(pairsText === undefined ? {} : { pairs: pairsText.split(",").map(Number) }),
    ...(minutes === undefined ? {} : { maxMinutes: Number(minutes) }),
    ...(prediction === undefined ? {} : { prediction }),
  };
}

/** This function starts the sampler from the arguments of the command line. It writes `records.jsonl` and `sample.json` into `--out`. */
export function sampleMain(argv: readonly string[]): number {
  const out = optionOf(argv, "--out");
  if (out === undefined) throw new Error("Start the sampler with: node bench/sample-space.ts --out <dir> [--n 400]");
  const sha = commitOf(argv);
  const options = sampleOptions(argv, envOf());
  const { records, summary } = sampleSpace({ ...options, ...(sha === undefined ? {} : { commit: sha }) });
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "records.jsonl"), records.map((r) => `${JSON.stringify(r)}\n`).join(""));
  writeFileSync(join(dir, "sample.json"), `${JSON.stringify(summary, null, 1)}\n`);
  const parts = Object.entries(summary.composition)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  console.log(
    `${summary.pairs} of ${summary.requested} pairs in ${dir}. Configs: ${summary.configs.rejected} of ${summary.configs.drawn} went back (rate ${summary.configs.rate}). ` +
      `Inputs: ${summary.inputs.rejected} of ${summary.inputs.drawn} went back. Hard breaks: ${summary.hard.pairs} pairs. Not deterministic: ${summary.nondeterministic}. ` +
      `Errors: ${summary.errors.length}. Combine: ${parts}.${summary.stopped === "time" ? " The time limit stopped the sample." : ""}`,
  );
  if (summary.strata !== undefined) console.log(`Strata: ${Object.entries(summary.strata).map(([id, s]) => `${id} ${s.pairs}${s.missed > 0 ? ` (${s.missed} missed)` : ""}`).join(", ")}.`);
  const failed = determinismLines(summary);
  for (const line of failed) console.log(line);
  return summary.errors.length > 0 || summary.nondeterministicPairs.length > 0 ? 1 : 0;
}

/** This function gives the lines of the determinism gate of a sample (k121): the two counts, then each pair that fails the gate. */
export function determinismLines(summary: Pick<SampleSummary, "timing" | "clockPairs" | "nondeterministicClock" | "nondeterministicPairs">): string[] {
  const fail = summary.nondeterministicPairs;
  const lines = [
    `Timing ${summary.timing}: ${summary.clockPairs} pairs with a clock limit. Not deterministic with a clock limit: ${summary.nondeterministicClock}. Without a clock limit: ${fail.length}.`,
  ];
  if (fail.length > 0) lines.push(`The determinism gate (k121) failed: ${fail.map((p) => `pair ${p.pair} (${p.config} on ${p.input})`).join(", ")}.`);
  return lines;
}

if (process.argv[1]?.endsWith("sample-space.ts") === true) {
  const argv = process.argv.slice(2);
  const fail = (error: unknown): void => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  };
  // The draw active (k116) is in bench/active.ts. It reads the grid run, so the sampler loads it only for that draw.
  if (argv.includes("--draw") && argv[argv.indexOf("--draw") + 1] === "active") {
    import("./active.ts").then((m) => {
      try {
        process.exitCode = m.activeMain(argv);
      } catch (error) {
        fail(error);
      }
    }, fail);
  } else {
    try {
      process.exitCode = sampleMain(argv);
    } catch (error) {
      fail(error);
    }
  }
}
