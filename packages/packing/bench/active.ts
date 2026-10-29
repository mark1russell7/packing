// The active draw of roadmap item k116. It picks the pairs of the whole space where the expected held-out error of the coverage model is largest.
// The pairs that it measures join the training rows before the next round. Thus the model learns the region of the space where it is weak.
//
//   node bench/active.ts --out <dir> --records <records.jsonl> --corpus <corpus.json> [--n 400] [--seed 1] [--rounds 4] [--pool 20]
//                        [--features family|input] [--by input|spec] [--score spread-iqr|fold-spread] [--max-count 1000] [--no-knobs] [--knobs relative|absolute]
//                        [--repeats 1] [--warmup 0] [--max-minutes <m>]
//
// `node bench/sample-space.ts --draw active` starts this file. `docs/BENCH.md` ("The active draw") tells how the draw works.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { corpusFamilies, generator, packSpace, toPackInput, type GeneratedInput, type PackInput } from "@mark1russell7/packing";
import { canonicalConfig, checkConfig, configId, createFamilyRegistry, shapeKindsOf, stepRandom, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import {
  ACTIVE_SCORE,
  ACTIVE_SCORES,
  DEFAULT_FEATURES,
  FEATURE_SETS,
  foldScorer,
  gridOf,
  pairFeatures,
  readRecords,
  type CoverageManifest,
  type CoverageOptions,
  type ActiveScore,
  type CoverageRecord,
  type FeatureSet,
  type SampledRecord,
} from "./coverage.ts";
import {
  commitOf,
  drawInput,
  drawPlan,
  drawStratum,
  determinismLines,
  envOf,
  capMoves,
  firstPack,
  generateInput,
  MAX_CONFIG_TRIES,
  MAX_INPUT_TRIES,
  MAX_STRATUM_MISSES,
  measurePair,
  optionOf,
  resolveDraw,
  sampleOptions,
  wholeOf,
  DEFAULT_MAX_COUNT,
  DEFAULT_PAIRS,
  SAMPLE_SCHEMA,
  type InputDraw,
  type KnobScale,
  type SampleOptions,
  type SampleRecord,
  type SampleSummary,
} from "./sample-space.ts";

/** The default count of the rounds of the active draw. */
export const DEFAULT_ROUNDS = 4;

/** The default count of the candidate pairs for each pair of the sample. */
export const DEFAULT_POOL_FACTOR = 20;

/** One candidate pair of the pool: its index, its stratum, the draw of its input, its canonical config and its row features. */
export interface Candidate {
  readonly index: number;
  readonly stratum: string;
  readonly draw: InputDraw;
  readonly config: StrategyConfig;
  /** The `configId` of the config. */
  readonly id: string;
  readonly features: Readonly<Record<string, string>>;
}

/** One record of an active sample: a sampled record, with its round, its score and the index of its candidate. */
export interface ActiveRecord extends SampleRecord {
  /** The round of the pair, from 1. */
  readonly round: number;
  /** The score of the pair when the round picked it, with 4 decimals. */
  readonly score: number;
  readonly candidate: number;
}

/** The options of `activeSample`. The active draw is always without clock limits (k121), so it has no `timing` and no `pairs`. */
export interface ActiveOptions extends Omit<SampleOptions, "draw" | "timing" | "pairs"> {
  /** The records of the grid run, as `bench/coverage.ts` reads them. */
  readonly records: readonly CoverageRecord[];
  /** The manifest `corpus.json` of the grid run. */
  readonly manifest: CoverageManifest;
  /** The count of the rounds. The default is 4. */
  readonly rounds?: number;
  /** The count of the candidates for each pair. The default is 20. */
  readonly poolFactor?: number;
  /** The options of the coverage model: the feature set, the folds and the unit of a fold. */
  readonly coverage?: CoverageOptions;
  /** The score of the candidates. The default is `ACTIVE_SCORE`, `spread-iqr`. */
  readonly score?: ActiveScore;
}

/** The facts of one round of an active draw. */
export interface ActiveRoundFacts {
  readonly round: number;
  /** The count of the pairs that the round asked for. */
  readonly quota: number;
  /** The count of the measured pairs. */
  readonly pairs: number;
  /** The count of the candidates that went back at their first pack. */
  readonly rejected: number;
  /** The mean and the largest score of the measured pairs. */
  readonly scoreMean: number;
  readonly scoreMax: number;
  /** The mean score of all the candidates that were not yet taken at the start of the round. */
  readonly poolMean: number;
}

/** The summary of an active sample: the summary of `sampleSpace` with the draw `active` and the facts of the rounds. */
export interface ActiveSummary extends Omit<SampleSummary, "draw"> {
  readonly draw: "active";
  readonly active: {
    readonly rounds: number;
    /** The count of the candidates in the pool. */
    readonly pool: number;
    readonly poolFactor: number;
    /** The candidates that the pool did not find: their strata closed, or no input and config came. */
    readonly poolMissed: number;
    readonly score: ActiveScore;
    readonly features: FeatureSet;
    readonly by: "input" | "spec";
    readonly perRound: readonly ActiveRoundFacts[];
  };
}

/** This function adds one to a count of a record. */
const bump = (out: Record<string, number>, key: string): void => {
  out[key] = (out[key] ?? 0) + 1;
};

/** This function rounds a value to 4 decimals. */
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** This function gives the parts of a sampled record that the features of a pair read, for a candidate. */
function candidateRecord(file: GeneratedInput, d: InputDraw, config: StrategyConfig, id: string): SampledRecord {
  const params = file.generator?.params ?? {};
  return {
    strategy: `space:${id}`,
    input: file.id,
    config,
    generator: { name: d.family, version: d.version, params },
    cell: generator(d.family, d.version).cell(params as never) as unknown as Record<string, unknown>,
    knobs: { margin: Number(d.dims["margin"] ?? 0), gap: Number(d.dims["gap"] ?? 0) },
    seed: file.seed,
    inputHash: file.hash,
  };
}

/** The counts of the draws of the pool. */
interface PoolCounts {
  configsDrawn: number;
  configsRejected: number;
  inputsDrawn: number;
  inputsRejected: number;
  missed: number;
  readonly configReasons: Record<string, number>;
  readonly inputReasons: Record<string, number>;
  readonly strataMissed: Record<string, number>;
}

/**
 * This function draws the candidate pool of an active sample. Candidate `c` has its own random stream `stepRandom(seed, candidate-<c>)`.
 * Candidate `c` takes the stratum `c` modulo the count of the strata, as the stratified draw of k115 does.
 * A candidate is an input and a config that `checkConfig` accepts. The pool does not pack the candidates.
 * The configs come from `drawPlan` with the timing `off`, so no candidate has a clock limit (k121).
 */
export function candidatePool(
  size: number,
  options: { readonly seed: number; readonly space: StrategySpace; readonly maxCount: number; readonly knobs: boolean; readonly knobScale?: KnobScale; readonly coverage: CoverageOptions; readonly deadline?: number; readonly maxInputTries?: number; readonly maxOverlapMoves?: number },
  counts: PoolCounts,
): Candidate[] {
  const { seed, space, maxCount, knobs } = options;
  const knobScale = options.knobScale ?? "relative";
  const maxInputTries = options.maxInputTries ?? MAX_INPUT_TRIES;
  const plan = drawPlan(space, "stratified", "off");
  const sc = plan.counts;
  const strata = plan.strata;
  if (strata.length === 0) throw new RangeError("The space has no strata.");
  const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
  const pool: Candidate[] = [];
  for (let c = 0; c < size; c++) {
    if (options.deadline !== undefined && Date.now() > options.deadline) break;
    const r = stepRandom(seed, `candidate-${c}`);
    const stratum = strata[c % strata.length]!;
    if ((counts.strataMissed[stratum.id] ?? 0) >= MAX_STRATUM_MISSES) {
      bump(counts.strataMissed, stratum.id);
      counts.missed++;
      continue;
    }
    let found: Candidate | undefined;
    for (let inputTry = 0; inputTry < maxInputTries && found === undefined; inputTry++) {
      const d = resolveDraw(drawInput(r, corpusFamilies, { knobs, knobScale }), registry);
      counts.inputsDrawn++;
      const file = generateInput(d, registry, maxCount);
      if (typeof file === "string") {
        counts.inputsRejected++;
        bump(counts.inputReasons, file);
        continue;
      }
      const input = toPackInput(file);
      const shapes = shapeKindsOf({ boxes: input.items });
      for (let configTry = 0; configTry < MAX_CONFIG_TRIES; configTry++) {
        const config = drawStratum(r, plan.space, sc, stratum);
        counts.configsDrawn++;
        const breaks = checkConfig(space, config, { shapes });
        if (breaks.length > 0) {
          counts.configsRejected++;
          bump(counts.configReasons, `check:${breaks[0]!.claim}`);
          continue;
        }
        const canonical = capMoves(canonicalConfig(space, config), options.maxOverlapMoves);
        const id = configId(space, canonical);
        const rec = candidateRecord(file, d, canonical, id);
        const { features } = pairFeatures(rec, { ...options.coverage, inputs: new Map([[file.id, input]]) });
        found = { index: c, stratum: stratum.id, draw: d, config: canonical, id, features };
        break;
      }
    }
    if (found === undefined) {
      bump(counts.strataMissed, stratum.id);
      counts.missed++;
    } else pool.push(found);
  }
  return pool;
}

/** The picks of one round so far: the measured pairs of each stratum, and each pair of a stratum and an input generator. */
export interface RoundPicks {
  readonly strata: Map<string, number>;
  readonly pairs: Set<string>;
}

/** This function gives the key of a candidate for the diversity rule: its stratum and its input generator. */
export const pickKey = (c: Pick<Candidate, "stratum" | "draw">): string => `${c.stratum}|${c.draw.family}`;

/**
 * This function gives the next candidate of a round, or `undefined` when no candidate is left. `order` is from the highest score down.
 *
 * 1. The first pass takes the first candidate whose stratum has fewer than `cap` picks, and whose stratum and generator have no pick.
 * 2. When no candidate passes, the second pass keeps only the cap of the stratum.
 * 3. When no candidate passes again, the third pass takes the first candidate that is left.
 *
 * Thus the rules change the order of a round only while other candidates are left. The order and the picks decide the result.
 */
export function nextPick<T extends { readonly c: Candidate }>(order: readonly T[], taken: ReadonlySet<number>, picks: RoundPicks, cap: number): T | undefined {
  const left = order.filter((x) => !taken.has(x.c.index));
  const roomy = (x: T): boolean => (picks.strata.get(x.c.stratum) ?? 0) < cap;
  return left.find((x) => roomy(x) && !picks.pairs.has(pickKey(x.c))) ?? left.find(roomy) ?? left[0];
}

/**
 * This function draws and measures an active sample (k116).
 *
 * 1. It draws a pool of `poolFactor` times `n` candidates, stratified as in k115. The pool does not pack a candidate.
 * 2. Round `k` of `rounds` asks for `floor(n k / rounds) - floor(n (k - 1) / rounds)` pairs.
 * 3. At the start of a round, `foldScorer` learns on the grid and on the pairs of the earlier rounds. It scores each candidate that is left.
 * 4. The round measures the candidates from the highest score down, until it has its pairs. A candidate that the packer refuses goes back.
 * 5. A round takes at most `ceil(quota / strata)` pairs of a stratum, and one pair of each stratum and generator. `nextPick` tells the rules.
 *
 * The score reads no time, so the same seed and the same grid give the same pairs. Only `maxMinutes` can cut a sample short.
 */
export function activeSample(options: ActiveOptions): { records: ActiveRecord[]; summary: ActiveSummary } {
  const n = options.n ?? DEFAULT_PAIRS;
  const seed = options.seed ?? 1;
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  const poolFactor = options.poolFactor ?? DEFAULT_POOL_FACTOR;
  const maxCount = options.maxCount ?? DEFAULT_MAX_COUNT;
  const knobs = options.knobs ?? true;
  const knobScale = options.knobScale ?? "relative";
  const repeats = options.repeats ?? 1;
  const warmup = options.warmup ?? 0;
  const space = options.space ?? packSpace;
  const clock = options.clock ?? (() => performance.now());
  const prediction = options.prediction ?? "k116-active";
  const coverage: CoverageOptions = { by: "spec", ...options.coverage };
  const score = options.score ?? ACTIVE_SCORE;
  if (!(ACTIVE_SCORES as readonly string[]).includes(score)) throw new RangeError(`The score is ${ACTIVE_SCORES.join(" or ")}, not ${score}.`);
  const plan = drawPlan(space, "stratified", "off");
  const strataCount = plan.strata.length;
  const maxOverlapMoves = options.maxOverlapMoves;
  if (maxOverlapMoves !== undefined && (!Number.isInteger(maxOverlapMoves) || maxOverlapMoves < 1)) throw new RangeError("The overlap moves are a whole number of 1 or more.");
  if (!Number.isInteger(n) || n < 0) throw new RangeError("The count of the pairs is a whole number of 0 or more.");
  if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError("The count of the rounds is a whole number of 1 or more.");
  if (!Number.isInteger(poolFactor) || poolFactor < 1) throw new RangeError("The pool factor is a whole number of 1 or more.");
  const start = Date.now();
  const deadline = options.maxMinutes === undefined ? undefined : start + options.maxMinutes * 60000;
  const counts: PoolCounts = { configsDrawn: 0, configsRejected: 0, inputsDrawn: 0, inputsRejected: 0, missed: 0, configReasons: {}, inputReasons: {}, strataMissed: {} };
  const pool = candidatePool(n * poolFactor, { seed, space, maxCount, knobs, knobScale, coverage, ...(deadline === undefined ? {} : { deadline }), ...(options.maxInputTries === undefined ? {} : { maxInputTries: options.maxInputTries }), ...(maxOverlapMoves === undefined ? {} : { maxOverlapMoves }) }, counts);
  const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
  const grid = gridOf(options.records, options.manifest, coverage);
  const inputs = new Map<string, PackInput>(coverage.inputs ?? []);
  const records: ActiveRecord[] = [];
  const errors: SampleSummary["errors"][number][] = [];
  const composition: Record<string, number> = {};
  const families: Record<string, number> = {};
  const hardRules: Record<string, number> = {};
  const strataPairs: Record<string, number> = Object.fromEntries(plan.strata.map((s) => [s.id, 0]));
  const taken = new Set<number>();
  const perRound: ActiveRoundFacts[] = [];
  let hardPairs = 0;
  let nondeterministic = 0;
  let nondeterministicClock = 0;
  let clockPairs = 0;
  const nondeterministicPairs: SampleSummary["nondeterministicPairs"][number][] = [];
  let stopped: "time" | undefined;
  const late = (): boolean => deadline !== undefined && Date.now() > deadline;

  for (let k = 1; k <= rounds && stopped === undefined; k++) {
    const quota = Math.floor((n * k) / rounds) - Math.floor((n * (k - 1)) / rounds);
    const scorer = foldScorer(grid, records, { ...coverage, inputs }, score);
    const order = pool
      .filter((c) => !taken.has(c.index))
      .map((c) => ({ c, s: scorer.score(c.features) }))
      .sort((a, b) => b.s - a.s || a.c.index - b.c.index);
    const poolMean = order.length === 0 ? 0 : r4(order.reduce((sum, x) => sum + x.s, 0) / order.length);
    let got = 0;
    let rejected = 0;
    const scores: number[] = [];
    const cap = Math.max(1, Math.ceil(quota / Math.max(1, strataCount)));
    const picks: RoundPicks = { strata: new Map(), pairs: new Set() };
    while (got < quota) {
      const next = nextPick(order, taken, picks, cap);
      if (next === undefined) break;
      const { c, s } = next;
      if (late()) {
        stopped = "time";
        break;
      }
      taken.add(c.index);
      const file = generateInput(c.draw, registry, maxCount) as GeneratedInput;
      const input = toPackInput(file);
      const pair = records.length;
      let first;
      try {
        first = firstPack(input, c.config, file.seed);
      } catch (error) {
        errors.push({ pair, input: file.id, config: c.id, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (typeof first === "string") {
        rejected++;
        counts.configsRejected++;
        bump(counts.configReasons, first);
        continue;
      }
      try {
        const record = measurePair({ input, file, draw: c.draw, config: c.config, id: c.id, first, pair }, { env: options.env, prediction, repeats, warmup, clock, ...(options.commit === undefined ? {} : { commit: options.commit }) });
        const broken = Object.entries(record.hard).filter(([, v]) => v > 0);
        if (broken.length > 0) hardPairs++;
        for (const [rule] of broken) bump(hardRules, rule);
        if (record.clock) clockPairs++;
        if (!record.deterministic) {
          nondeterministic++;
          if (record.clock) nondeterministicClock++;
          else nondeterministicPairs.push({ pair, input: file.id, config: c.id });
        }
        records.push({ ...record, round: k, score: r4(s), candidate: c.index });
        inputs.set(file.id, input);
        bump(composition, record.config.stages["combine"]?.option ?? "none");
        bump(strataPairs, c.stratum);
        bump(families, `${c.draw.family}@${c.draw.version}`);
        scores.push(s);
        picks.strata.set(c.stratum, (picks.strata.get(c.stratum) ?? 0) + 1);
        picks.pairs.add(pickKey(c));
        got++;
      } catch (error) {
        errors.push({ pair, input: file.id, config: c.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    perRound.push({
      round: k,
      quota,
      pairs: got,
      rejected,
      scoreMean: scores.length === 0 ? 0 : r4(scores.reduce((sum, v) => sum + v, 0) / scores.length),
      scoreMax: scores.length === 0 ? 0 : r4(Math.max(...scores)),
      poolMean,
    });
  }

  const sc = plan.counts;
  const summary: ActiveSummary = {
    schema: SAMPLE_SCHEMA,
    seed,
    requested: n,
    pairs: records.length,
    draw: "active",
    maxCount,
    knobs,
    knobScale,
    repeats,
    warmup,
    space: { base: sc.base.toString(), meta: Object.fromEntries(sc.meta.map((m) => [m.option.id, m.weight.toString()])) },
    configs: { drawn: counts.configsDrawn, rejected: counts.configsRejected, rate: counts.configsDrawn === 0 ? 0 : r4(counts.configsRejected / counts.configsDrawn), reasons: counts.configReasons },
    inputs: { drawn: counts.inputsDrawn, rejected: counts.inputsRejected, reasons: counts.inputReasons },
    composition,
    families,
    hard: { pairs: hardPairs, rules: hardRules },
    nondeterministic,
    nondeterministicClock,
    nondeterministicPairs,
    timing: "off",
    clockPairs,
    errors,
    ...(stopped === undefined ? {} : { stopped }),
    strata: Object.fromEntries(plan.strata.map((s) => [s.id, { configs: s.configs.toString(), pairs: strataPairs[s.id] ?? 0, missed: counts.strataMissed[s.id] ?? 0 }])),
    active: {
      rounds,
      pool: pool.length,
      poolFactor,
      poolMissed: counts.missed,
      score,
      features: coverage.features ?? DEFAULT_FEATURES,
      by: coverage.by ?? "spec",
      perRound,
    },
  };
  return { records, summary };
}

/** This function gives the options of `activeSample` from the command line, without the grid. It throws an `Error` for a bad value. */
export function activeOptions(argv: readonly string[], env: ReturnType<typeof envOf>): Omit<ActiveOptions, "records" | "manifest"> {
  if (argv.includes("--stratify")) throw new Error("The option --stratify does not go with --draw active. The active pool is always stratified.");
  const at = argv.indexOf("--draw");
  const rest = at < 0 ? [...argv] : [...argv.slice(0, at), ...argv.slice(at + 2)];
  if (argv.includes("--pairs")) throw new Error("The option --pairs does not go with --draw active.");
  if ((optionOf(argv, "--timing") ?? "off") !== "off") throw new Error("The active draw has no clock limits. It takes only --timing off.");
  const base = sampleOptions(rest, env);
  const features = optionOf(argv, "--features") ?? DEFAULT_FEATURES;
  if (!(FEATURE_SETS as readonly string[]).includes(features)) throw new Error(`The option --features is ${FEATURE_SETS.join(" or ")}, not ${features}.`);
  const by = optionOf(argv, "--by") ?? "spec";
  if (by !== "input" && by !== "spec") throw new Error(`The option --by is input or spec, not ${by}.`);
  const score = optionOf(argv, "--score") ?? ACTIVE_SCORE;
  if (!(ACTIVE_SCORES as readonly string[]).includes(score)) throw new Error(`The option --score is ${ACTIVE_SCORES.join(" or ")}, not ${score}.`);
  const { draw: _draw, timing: _timing, pairs: _pairs, ...kept } = base;
  return {
    ...kept,
    rounds: wholeOf(argv, "--rounds", DEFAULT_ROUNDS),
    poolFactor: wholeOf(argv, "--pool", DEFAULT_POOL_FACTOR),
    coverage: { features: features as FeatureSet, by },
    score: score as ActiveScore,
  };
}

/** This function starts the active draw from the arguments of the command line. It writes `records.jsonl` and `sample.json` into `--out`. */
export function activeMain(argv: readonly string[]): number {
  const out = optionOf(argv, "--out");
  const recordsFile = optionOf(argv, "--records");
  const corpusFile = optionOf(argv, "--corpus");
  if (out === undefined || recordsFile === undefined || corpusFile === undefined) {
    throw new Error("Start the active draw with: node bench/active.ts --out <dir> --records <records.jsonl> --corpus <corpus.json> [--n 400]");
  }
  const sha = commitOf(argv);
  const options = activeOptions(argv, envOf());
  const records = readRecords(readFileSync(recordsFile, "utf8"));
  const manifest = JSON.parse(readFileSync(corpusFile, "utf8")) as CoverageManifest;
  const { records: pairs, summary } = activeSample({ ...options, records, manifest, ...(sha === undefined ? {} : { commit: sha }) });
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "records.jsonl"), pairs.map((r) => `${JSON.stringify(r)}\n`).join(""));
  writeFileSync(join(dir, "sample.json"), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(
    `${summary.pairs} of ${summary.requested} active pairs in ${dir}, ${summary.active.features} features. Pool: ${summary.active.pool} candidates, ${summary.active.poolMissed} missed. ` +
      `Errors: ${summary.errors.length}.${summary.stopped === "time" ? " The time limit stopped the sample." : ""}`,
  );
  for (const r of summary.active.perRound) {
    console.log(`Round ${r.round}: ${r.pairs} of ${r.quota} pairs, ${r.rejected} went back. Score of the pairs ${r.scoreMean} (largest ${r.scoreMax}), of the pool ${r.poolMean}.`);
  }
  for (const line of determinismLines(summary)) console.log(line);
  return summary.errors.length > 0 || summary.nondeterministicPairs.length > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("active.ts") === true) {
  try {
    process.exitCode = activeMain(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
