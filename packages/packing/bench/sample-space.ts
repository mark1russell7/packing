// The sampler of the whole space of roadmap item k112. It draws pairs of a config of `packSpace` and an input of a corpus
// family. It packs each pair and measures it as the bench runner does. `bench/coverage.ts --sample` scores the pairs.
//
//   node bench/sample-space.ts --out <dir> [--n 400] [--seed 1] [--draw uniform|option] [--max-count 1000] [--no-knobs]
//                              [--repeats 1] [--warmup 0] [--max-minutes <m>] [--prediction <id>] [--commit sha]
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
import { finite, pairValues, timeRuns, type BenchEnv } from "./run.ts";

/** The schema of the summary `sample.json` of a sample. */
export const SAMPLE_SCHEMA = "packing-sample-space/1";

/** The name of the set of each sampled input. It is the start of the input id. */
export const SAMPLE_SET = "sample-space";

/** The default count of the pairs. */
export const DEFAULT_PAIRS = 400;

/** The default largest count of the items of a sampled input. A larger input goes back, and the sampler draws again. */
export const DEFAULT_MAX_COUNT = 1000;

/** The largest count of the draws of a config for one input. Then the sampler draws a new input. */
const MAX_CONFIG_TRIES = 20;

/** The largest count of the draws of an input for one pair. Then the pair is an error. */
const MAX_INPUT_TRIES = 200;

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

/** This function gives the stage choice of an option and its params, without an empty list of params. */
const choiceOf = (option: string, params: Record<string, ParamValue>): StageChoice => (Object.keys(params).length === 0 ? { option } : { option, params });

/** This function draws a base config. Each base config has the same chance. */
export function drawBase(r: Random, space: StrategySpace, counts: SpaceCounts): StrategyConfig {
  const combo = counts.combos[pickWeighted(r, counts.combos.map((c) => c.weight))]!;
  const stages: Record<string, StageChoice> = {};
  for (const [stage, o] of combo.options) if (o !== null) stages[stage] = choiceOf(o.id, drawParams(r, o.params));
  return { space: space.engine, stages };
}

/** This function draws the members of a meta option: a pool entry, or a list of distinct base configs. Each list has the same chance. */
function drawMembers(r: Random, space: StrategySpace, counts: SpaceCounts, rule: MemberRule): StrategyConfig[] {
  if (rule.pool !== undefined) return [...rule.pool[Number(uniformBig(r, BigInt(rule.pool.length)))]!];
  const sizes: number[] = [];
  for (let m = rule.min; m <= rule.max; m++) sizes.push(m);
  const m = sizes[pickWeighted(r, sizes.map((k) => lists(counts.base, k, rule.ordered)))]!;
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
  const meta = counts.meta[top - 1]!;
  const params = drawParams(r, meta.option.params);
  const members = drawMembers(r, space, counts, meta.option.members!);
  return { space: space.engine, stages: { [meta.stage]: { ...choiceOf(meta.option.id, params), members } } };
}

// ---- The draw of an input ----

/** The draw of an input: the family, its version, the value of each dimension and the seed. */
export interface InputDraw {
  readonly family: string;
  readonly version: number;
  readonly dims: Readonly<Record<string, ParamValue>>;
  readonly seed: number;
}

/** The options of the draw of an input. */
export interface InputDrawOptions {
  /** With `false`, the knobs `margin` and `gap` keep their defaults. The default is `true`. */
  readonly knobs?: boolean;
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
  return dimensionAt({ ...d, min, max }, r());
}

/** This function draws an input: a family with the same chance for each family, then each active dimension of the family. */
export function drawInput(r: Random, families: readonly CorpusFamily<GeneratedInput>[], options: InputDrawOptions = {}): InputDraw {
  const f = families[Number(uniformBig(r, BigInt(families.length)))]!;
  const dims: Record<string, ParamValue> = {};
  for (const d of f.dimensions) {
    if (!paramActive(d, dims)) continue;
    if (options.knobs === false && KNOBS.includes(d.name)) continue;
    dims[d.name] = drawDimension(r, d);
  }
  return { family: f.name, version: f.version, dims, seed: Math.floor(r() * 2147483648) };
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
  readonly deterministic: boolean;
  readonly prediction: string;
  readonly ms: number;
  readonly msRuns: number[];
  readonly outputHash: string;
  readonly env: BenchEnv;
  commit?: string;
  /** The index of the pair in the sample. */
  readonly pair: number;
  /** The canonical config of `packSpace`. */
  readonly config: StrategyConfig;
  /** The generator of the input, with its full params. */
  readonly generator: { readonly name: string; readonly version: number; readonly params: Readonly<Record<string, unknown>> };
  /** The cell of the generator for the params. */
  readonly cell: Readonly<Record<string, unknown>>;
  /** The knobs of the family: `margin` and `gap`. */
  readonly knobs: { readonly margin: number; readonly gap: number };
}

/** The options of `sampleSpace`. */
export interface SampleOptions {
  /** The count of the pairs. The default is 400. */
  readonly n?: number;
  /** The seed of the sample. The default is 1. */
  readonly seed?: number;
  readonly draw?: DrawMode;
  /** The largest count of the items of an input. The default is 1000. */
  readonly maxCount?: number;
  readonly knobs?: boolean;
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
}

/** The summary of a sample, schema `packing-sample-space/1`. */
export interface SampleSummary {
  readonly schema: typeof SAMPLE_SCHEMA;
  readonly seed: number;
  /** The count of the pairs that the options asked for. */
  readonly requested: number;
  /** The count of the measured pairs. */
  readonly pairs: number;
  readonly draw: DrawMode;
  readonly maxCount: number;
  readonly knobs: boolean;
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
  readonly errors: readonly { readonly pair: number; readonly input: string; readonly config: string; readonly message: string }[];
  /** `time` when `maxMinutes` stopped the sample before its last pair. */
  readonly stopped?: "time";
}

/** This function adds one to a count of a record. */
const bump = (out: Record<string, number>, key: string): void => {
  out[key] = (out[key] ?? 0) + 1;
};

/** This function gives the option of the stage `combine` of a config, or `none`. */
const combineOf = (config: StrategyConfig): string => config.stages["combine"]?.option ?? "none";

/** This function gives an input file for a draw, or the reason that it goes back. */
function inputOf(draw: InputDraw, registry: ReturnType<typeof createFamilyRegistry<GeneratedInput>>, maxCount: number): GeneratedInput | string {
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
 * This function draws and measures the pairs of a sample. Each pair has its own random stream `stepRandom(seed, pair-<i>)`.
 *
 * 1. It draws an input. An input that the generator refuses, or with more than `maxCount` items, goes back.
 * 2. It draws a config. A config that `checkConfig` refuses for the shapes of the input goes back, and so does a config that throws `UnsupportedCell` or `UnsupportedShape`.
 * 3. After 20 configs that go back, it draws a new input. Thus the draw is uniform over the configs that the input accepts.
 * 4. It packs the pair 2 times for `deterministic`, then `warmup` times, then `repeats` times with a clock, as `runBench` does.
 *
 * Another error goes into `errors`, and the sampler goes on.
 */
export function sampleSpace(options: SampleOptions): { records: SampleRecord[]; summary: SampleSummary } {
  const n = options.n ?? DEFAULT_PAIRS;
  const seed = options.seed ?? 1;
  const draw = options.draw ?? "uniform";
  const maxCount = options.maxCount ?? DEFAULT_MAX_COUNT;
  const knobs = options.knobs ?? true;
  const repeats = options.repeats ?? 1;
  const warmup = options.warmup ?? 0;
  const space = options.space ?? packSpace;
  const clock = options.clock ?? (() => performance.now());
  const prediction = options.prediction ?? "k112-whole-space";
  if (!Number.isInteger(n) || n < 0) throw new RangeError("The count of the pairs is a whole number of 0 or more.");
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  const counts = spaceCounts(space);
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
  let stopped: "time" | undefined;

  for (let pair = 0; pair < n; pair++) {
    if (options.maxMinutes !== undefined && Date.now() - start > options.maxMinutes * 60000) {
      stopped = "time";
      break;
    }
    const r = stepRandom(seed, `pair-${pair}`);
    let done = false;
    for (let inputTry = 0; inputTry < MAX_INPUT_TRIES && !done; inputTry++) {
      const d = drawInput(r, corpusFamilies, { knobs });
      inputsDrawn++;
      const file = inputOf(d, registry, maxCount);
      if (typeof file === "string") {
        inputsRejected++;
        bump(inputReasons, file);
        continue;
      }
      const input = toPackInput(file);
      const shapes = shapeKindsOf({ boxes: input.items });
      for (let configTry = 0; configTry < MAX_CONFIG_TRIES && !done; configTry++) {
        const config = drawConfig(r, space, counts, draw);
        configsDrawn++;
        const breaks = checkConfig(space, config, combineOf(config) === "bbox" ? {} : { shapes });
        if (breaks.length > 0) {
          configsRejected++;
          bump(configReasons, `check:${breaks[0]!.claim}`);
          continue;
        }
        const canonical = canonicalConfig(space, config);
        const id = configId(space, canonical);
        let first: PackOutput;
        try {
          first = packConfig(input, canonical, file.seed);
        } catch (error) {
          if (error instanceof UnsupportedCell) {
            configsRejected++;
            bump(configReasons, `unsupported:${error.dimension}=${error.value}`);
            continue;
          }
          if (error instanceof UnsupportedShape) {
            configsRejected++;
            bump(configReasons, "unsupported:shape");
            continue;
          }
          errors.push({ pair, input: file.id, config: id, message: error instanceof Error ? error.message : String(error) });
          done = true;
          break;
        }
        done = true;
        try {
          const second = packConfig(input, canonical, file.seed);
          const pack = (): PackOutput => packConfig(input, canonical, file.seed);
          for (let w = 0; w < warmup; w++) pack();
          const { msRuns, searchMs } = timeRuns(pack, repeats, clock);
          const values = pairValues(input, first, searchMs, file.known);
          const hard = checkHard(input, first, DEFAULT_TOLERANCE);
          const broken = Object.entries(hard).filter(([, v]) => v > 0);
          if (broken.length > 0) hardPairs++;
          for (const [rule] of broken) bump(hardRules, rule);
          const deterministic = isDeterministic(first, second);
          if (!deterministic) nondeterministic++;
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
            deterministic,
            prediction,
            ms: round3(medianOf(msRuns)),
            msRuns: msRuns.map(round3),
            outputHash: outputHash(first),
            env: options.env,
            pair,
            config: canonical,
            generator: { name: d.family, version: d.version, params },
            cell: generator(d.family, d.version).cell(params as never) as unknown as Record<string, unknown>,
            knobs: { margin: Number(d.dims["margin"] ?? 0), gap: Number(d.dims["gap"] ?? 0) },
          };
          if (options.commit !== undefined) record.commit = options.commit;
          records.push(record);
          bump(composition, combineOf(canonical));
          bump(families, `${d.family}@${d.version}`);
        } catch (error) {
          errors.push({ pair, input: file.id, config: id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (!done) errors.push({ pair, input: "-", config: "-", message: `The pair found no input and config after ${MAX_INPUT_TRIES} inputs.` });
  }

  const summary: SampleSummary = {
    schema: SAMPLE_SCHEMA,
    seed,
    requested: n,
    pairs: records.length,
    draw,
    maxCount,
    knobs,
    repeats,
    warmup,
    space: { base: counts.base.toString(), meta: Object.fromEntries(counts.meta.map((m) => [m.option.id, m.weight.toString()])) },
    configs: { drawn: configsDrawn, rejected: configsRejected, rate: configsDrawn === 0 ? 0 : round4(configsRejected / configsDrawn), reasons: configReasons },
    inputs: { drawn: inputsDrawn, rejected: inputsRejected, reasons: inputReasons },
    composition,
    families,
    hard: { pairs: hardPairs, rules: hardRules },
    nondeterministic,
    errors,
    ...(stopped === undefined ? {} : { stopped }),
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
function optionOf(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  if (at < 0) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`The option ${name} needs a value.`);
  return value;
}

/** This function gives a whole-number option, or the fallback. It throws an `Error` for a value that is not a whole number. */
function wholeOf(argv: readonly string[], name: string, fallback: number): number {
  const text = optionOf(argv, name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`The option ${name} is a whole number, not "${text}".`);
  return Number(text);
}

/** This function gives the facts of this computer, as the bench runner gives them. */
function envOf(): BenchEnv {
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
function commitOf(argv: readonly string[]): string | undefined {
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
  const draw = optionOf(argv, "--draw") ?? "uniform";
  if (draw !== "uniform" && draw !== "option") throw new Error(`The option --draw is uniform or option, not ${draw}.`);
  const minutes = optionOf(argv, "--max-minutes");
  if (minutes !== undefined && !(Number(minutes) > 0)) throw new Error(`The option --max-minutes is a number above 0, not ${minutes}.`);
  const prediction = optionOf(argv, "--prediction");
  return {
    n: wholeOf(argv, "--n", DEFAULT_PAIRS),
    seed: wholeOf(argv, "--seed", 1),
    draw,
    maxCount: wholeOf(argv, "--max-count", DEFAULT_MAX_COUNT),
    knobs: !argv.includes("--no-knobs"),
    repeats: wholeOf(argv, "--repeats", 1),
    warmup: wholeOf(argv, "--warmup", 0),
    env,
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
  return summary.errors.length > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("sample-space.ts") === true) {
  try {
    process.exitCode = sampleMain(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
