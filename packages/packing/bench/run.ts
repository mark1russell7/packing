// The benchmark runner of roadmap item k11. `docs/BENCH.md` tells how to start it in CI.
// It packs each input of a corpus with each strategy and gives one `layout-record/1` record for each run.

import {
  anchorStability,
  anchorStep,
  outputHash,
  boundMeasures,
  BOUND_KINDS,
  checkHard,
  corpus,
  DEFAULT_TOLERANCE,
  MEASURE_SPECS,
  gapToOpt,
  isDeterministic,
  measure,
  measureChange,
  measureSeed,
  quantile,
  round3,
  roundMeasures,
  toPackInput,
  UnsupportedCell,
  unsupportedOf,
  type AnchorStabilityOptions,
  type CorpusManifest,
  type CorpusSpec,
  type MeasureId,
  type PackHard,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";
import { declaredClaimOf, HARD_RULE_VERSION, type DeclaredClaim, type PortfolioKey, type ShapeKind } from "@mark1russell7/layout-contract";
import { controlFactor, type GroupFactor } from "@mark1russell7/rigor-bench";
import { portfolioWith } from "../src/portfolio.ts";
import { assertClaim, declaredCounts, DECLARED_IDS } from "./claims.ts";
import { benchEntry, benchPack, benchStrategy } from "./controls.ts";
import { COMPOSITE_IDS, ENTRIES, type BenchEntry } from "./entries.ts";
import { gapToBound, GAP_TO_BOUND } from "./gap-to-bound.ts";
import { compositeMembersOf, type CompositeMembers, type HeldOut, type PortfolioOptions } from "./portfolio.ts";
import { moveCounts, OUTSIDE_EXACT, screenMarkdown, screenOf, shapesOf, type BenchScreen } from "./screen.ts";

// Since 0.2.6, `outputHash` is in the package, so `packPortfolio` can use it. The runner gives it again for its tests.
export { outputHash };

/** The file of a corpus in `bench/corpora`: a `layout-corpus/1` manifest with its specs and no inputs. */
export interface BenchCorpus {
  schema: "layout-corpus/1";
  /** The name of the corpus. Each input gets it as its set. */
  corpus: string;
  specs: CorpusSpec[];
  /**
   * The held-out split of the portfolio report: a seed, or `all`. The default is the seed 3. A test corpus, for example
   * `pack-holdout-v1` has `all`: each input is held out, and the report scores the sets of `PORTFOLIO_SETS`.
   */
  heldOut?: HeldOut;
  /** The claim `claims.declared` of the file: the count of the inputs for each declared property. A run checks it. */
  declared?: DeclaredClaim;
}

/** The facts of the computer of a run. The times of two runs compare only on the same kind of computer. */
export interface BenchEnv {
  /** The version of Node.js, for example `v26.1.0`. */
  node: string;
  /** The operating system: `RUNNER_OS` in CI, the platform of Node.js on a local computer. */
  os: string;
  arch: string;
  /** The name of the runner: `RUNNER_NAME` in CI, `local` on a local computer. */
  runner: string;
  /** The model of the processor. */
  cpu: string;
  /** The count of the processors. */
  cpus: number;
}

/** The fields of each record of a run: a `layout-record/1` line of `docs/FORMAT.md`. */
interface BenchRecordHead {
  schema: "layout-record/1";
  stage: "pack";
  step: "pack";
  strategy: string;
  /** The full options of the entry: the defaults of its strategy, with the options of the entry over them. */
  options: Record<string, unknown>;
  corpus: string;
  input: string;
  inputHash: string;
  set: string;
  seed: number;
  /** The count of the boxes and the obstacles of the input, as the twin document of `highways` counts them. */
  nodes: number;
  edges: number;
  /**
   * The shape kinds of the boxes of the input (`docs/SHAPES.md` of the contract). The runner does not write it.
   * Each box of the corpora is a `rect`, and a record without `shapes` has only `rect` boxes.
   */
  shapes?: readonly ShapeKind[];
  tolerance: { overlap: number };
  prediction: string;
  /** The median time of the timed runs, in milliseconds. A skipped record has 0. */
  ms: number;
  /** The first 7 characters of the commit of the code. */
  commit?: string;
  env: BenchEnv;
}

/** The record of a pair that the runner packed. It has the measures, the hard counts and the times. */
export interface MeasuredRecord extends BenchRecordHead {
  /** The measures of `measure`, rounded with `roundMeasures`. A measure without a finite value is not in the record. */
  measures: Record<string, number>;
  /** The counts of `checkHard`, as an object type. An object type fits the index signature of the contract, and an interface does not. */
  hard: { [K in keyof PackHard]: PackHard[K] };
  /** The version of the rules that made the counts of `hard`. */
  hardRule?: number;
  /** The time of each timed run, in milliseconds, in the order of the runs. The median of this list is `ms`. */
  msRuns: number[];
  /**
   * The value `true` when a measure of the pair chose 1 timed run and no warm-up: its first pack took more than `slowPackMs`.
   * The time of the record is thus one time, and the time gate does not read it.
   */
  oneRun?: true;
  /** A measured record has no budget of a stopped pair. Only a skipped record has it. */
  budgetMs?: never;
  /** A measured record has no lower bound of a stopped pair. Only a skipped record has it. */
  msAtLeast?: never;
  /** A measured record has no case that stopped it. Only a skipped record has it. */
  because?: never;
  /** The first 16 hex characters of the SHA-256 of the canonical placements, sorted by id. */
  outputHash: string;
  /** The value is `true` when two runs with the same seed give the same output. */
  deterministic: boolean;
  skipped?: never;
}

/**
 * The record of a pair that the runner did not pack. The strategy does not support the cell of the input, or a budget stopped the pair.
 * It has no measures and no hard counts, and its `ms` is 0.
 */
export interface SkippedRecord extends BenchRecordHead {
  measures: Record<string, never>;
  hard: Record<string, never>;
  /** The runner did not pack the pair, so the record makes no claim about determinism. */
  deterministic: null;
  /** The reason: the value of the cell that the strategy does not support, or the reason of a budget of `budget.ts`. */
  skipped: string;
  /** The wall budget of the pair, in milliseconds. Only a record of a budget has it. */
  budgetMs?: number;
  /** The lower limit of the time of the pair, in milliseconds. The time is censored: the supervisor stopped the pair at this time. */
  msAtLeast?: number;
  /** The pairs that passed the budget, so that this pair did not start, or the base of a step with no output. Only a record of such a stop has it. */
  because?: string[];
}

/** One record of a run: a `layout-record/1` line of `docs/FORMAT.md`. A record with `skipped` has no measures. */
export type BenchRecord = MeasuredRecord | SkippedRecord;

/** This function tells if a record has measures, and thus is not a skipped record. */
export const isMeasured = (r: BenchRecord): r is MeasuredRecord => r.skipped === undefined;

/** This function gives the reason of a skipped record from the dimension and the value that the strategy does not support. */
export const skipReason = (dimension: string, value: string): string => `unsupported ${dimension}: ${value}`;

/** A pair of a strategy and an input that the runner did not pack, because the strategy does not support the cell. */
export interface BenchSkip {
  strategy: string;
  input: string;
  dimension: string;
  value: string;
}

/** A pair of a strategy and an input that threw an error other than `UnsupportedCell`. */
export interface BenchError {
  strategy: string;
  input: string;
  message: string;
}

/** One time of the control of a job. */
export interface BudgetControl {
  /** The key of `controlFactor`: the control entry and the input. */
  key: string;
  /** The time of the packs of the key, in milliseconds. */
  ms: number;
}

/** The facts of one job of a run with a budget. */
export interface BudgetJob {
  /** The name of the job: its strategies. */
  job: string;
  /** The time of the control before the first pair of the job. Each job does the same work, so the times tell the load of the computer. */
  control: BudgetControl[];
  /** The count of the child processes. */
  children: number;
}

/** The rules and the facts of a run with a budget. `docs/BENCH.md` ("The budget of a pair") tells the rules. */
export interface BenchBudget {
  /** The wall budget of a pair, in milliseconds, up to and with `smallItems` items. */
  smallPairMs: number;
  /** The count of the items of the smaller budget. */
  smallItems: number;
  /** The wall budget of a pair with more items, in milliseconds. */
  pairMs: number;
  /** A first pack over this time gives the pair 1 timed run and no warm-up. */
  slowPackMs: number;
  /** The count of overruns of an entry at one size, after which its other pairs at that size and above do not start. */
  overruns: number;
  /** The time limit of the pairs of one job, in minutes. Without a limit, this field is not in the run. */
  deadlineMinutes?: number;
  /** The entry and the count of packs of each key of the control. */
  control: { entry: string; packs: number; source: "pack" };
  jobs: BudgetJob[];
  /** The load factor of each job, from `controlFactor` with no base. The merge of 2 or more jobs writes it. */
  factors?: GroupFactor[];
}

/** The count of the inputs that a strategy packed, of all the inputs. */
export interface BenchCount {
  /** The inputs with a measured record */
  measured: number;
  /** The inputs of the corpus */
  inputs: number;
  /** The value `measured / inputs`, rounded to 3 decimals. An empty corpus gives 0. */
  coverage: number;
}

/** The coverage of one strategy: over all the inputs, and for each container shape of the manifest. */
export interface BenchCoverage extends BenchCount {
  shapes: Record<string, BenchCount>;
}

/** This function makes a count from the measured inputs and all the inputs. */
const countOf = (measured: number, inputs: number): BenchCount => ({ measured, inputs, coverage: inputs === 0 ? 0 : round3(measured / inputs) });

/**
 * The facts of one run of the runner, without the records. The file `run.json` holds them. The fields of `BenchScreen`
 * come from the records: the merge of a matrix writes them again from the records of all the jobs. A `run.json` before k59 does not have them.
 */
export interface BenchRun extends Partial<BenchScreen> {
  schema: "packing-bench-run/1";
  corpus: string;
  prediction: string;
  commit?: string;
  repeats: number;
  warmup: number;
  strategies: string[];
  env: BenchEnv;
  skipped: BenchSkip[];
  errors: BenchError[];
  /** The coverage of each strategy. A `run.json` of a runner before 0.2.1 does not have it. */
  coverage?: Record<string, BenchCoverage>;
  /** The held-out split of the corpus. A `run.json` before 0.2.7 does not have it: its split is the seed 3. */
  heldOut?: HeldOut;
  /** The value `true` when the timed passes of each input alternate between the entries. A run without `interleave` does not have it. */
  interleave?: true;
  /** The count of the inputs for each declared property of `DECLARED_IDS`. A `run.json` before roadmap item k62 does not have it. */
  declared?: Record<string, number>;
  /** The rules and the facts of the budget. Only a run with a budget has it. */
  budget?: BenchBudget;
}

/** A prediction of `bench/predictions.jsonl`. `docs/BENCH.md` gives the fields. */
export interface BenchPrediction {
  schema?: string;
  id: string;
  strategy?: string;
  set?: string;
  input?: string;
  measure?: string;
  expected?: number;
  op?: "<=" | ">=" | "<" | ">" | "==";
  /** The cell of the measure `pack.coverage`. Without it, the prediction uses the coverage over all the inputs. */
  cell?: { containerShape?: string };
  reason?: string;
}

/** The options of `runBench`. */
export interface BenchOptions {
  corpus: BenchCorpus;
  /** The id of the prediction of the run. Each record names it. */
  prediction: string;
  /** The ids of the entries. The default is each entry of `bench/entries.ts`: each strategy of the registry, then the variants. */
  strategies?: readonly string[];
  /** The timed passes of each pair. The default is 5. */
  repeats?: number;
  /** The runs before the timed runs. The default is 2. */
  warmup?: number;
  commit?: string;
  env: BenchEnv;
  /** The clock in milliseconds. The default is `performance.now`. */
  clock?: () => number;
  /**
   * The value `true` alternates the timed passes of each input between the entries: for each repeat, one timed pass of each entry.
   * Then the time ratio of two entries compares passes on the same computer at nearly the same moment. The default is `false`.
   */
  interleave?: boolean;
  /**
   * The stability when an anchor moves (roadmap item k111). With `true` or options, each input with a locked item gets the
   * measures `pack.anchor.*` of `anchorMeasures`. They need more packs. The default is `false`, so the records do not change.
   */
  anchor?: boolean | AnchorStabilityOptions;
  /**
   * The options over the options of an entry, by the id of the entry. The default is none. A test uses it to make a slow entry fast.
   * The records keep the id of the entry, so a run with this field is not a run of the benchmark.
   */
  entryOptions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * The time of the first pack of a pair, in milliseconds, over which the pair gets 1 timed run and no warm-up. Its record gets `oneRun`.
   * The default is no limit, so the records do not change.
   */
  slowPackMs?: number;
}

/** The result of `runBench`: the facts of the run, the records, the manifest of the corpus and the outputs. */
export interface BenchResult {
  run: BenchRun;
  records: BenchRecord[];
  manifest: CorpusManifest;
  /** The output of the first packing of each pair, by strategy and by input id. */
  outputs: Map<string, Map<string, PackOutput>>;
}

/** The default count of the timed passes of each pair. */
export const DEFAULT_REPEATS = 5;

/** The default count of the runs before the timed runs. */
export const DEFAULT_WARMUP = 2;

/** This function tells if a value is a plain object. */
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * This function reads the text of a corpus file. It throws an `Error` for a text that is not a `layout-corpus/1` manifest.
 * It also throws an `Error` for a manifest with no specs, or when `name` is not the name in the file.
 */
export function parseCorpus(text: string, name?: string): BenchCorpus {
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value["schema"] !== "layout-corpus/1") throw new Error("A corpus file has the schema layout-corpus/1.");
  const corpusName = value["corpus"];
  if (typeof corpusName !== "string" || corpusName === "") throw new Error("A corpus file has a name in the field corpus.");
  if (name !== undefined && corpusName !== name) throw new Error(`The corpus file of "${name}" has the name "${corpusName}".`);
  const specs = value["specs"];
  if (!Array.isArray(specs) || specs.length === 0) throw new Error("A corpus file has one spec or more in the field specs.");
  for (const spec of specs as unknown[]) {
    if (!isObject(spec) || typeof spec["generator"] !== "string" || !Array.isArray(spec["seeds"])) {
      throw new Error("Each spec of a corpus file has a generator and a list of seeds.");
    }
  }
  const heldOut = value["heldOut"];
  if (heldOut !== undefined && heldOut !== "all" && !(Number.isInteger(heldOut) && (heldOut as number) >= 0)) {
    throw new Error("The field heldOut of a corpus file is a seed or the text all.");
  }
  const out: BenchCorpus = { schema: "layout-corpus/1", corpus: corpusName, specs: specs as CorpusSpec[] };
  if (heldOut !== undefined) out.heldOut = heldOut as HeldOut;
  const declared = declaredClaimOf(value);
  if (declared !== undefined) out.declared = declared;
  return out;
}

/**
 * This function gives the count of the inputs of a corpus for each declared property. It throws an `Error` when the
 * corpus has a claim `declared` that the inputs do not make true. `inputs` are the generated inputs of the corpus.
 */
export function checkDeclared(c: BenchCorpus, inputs: Iterable<PackInput> = corpus(c.corpus, c.specs).inputs.map(toPackInput)): Record<string, number> {
  const list = [...inputs];
  if (c.declared !== undefined) assertClaim(c.corpus, c.declared, list);
  return declaredCounts(list);
}

/** This function gives the members of each composite entry of `ids` on each input of a manifest. A manifest without specs gives none. */
function membersOfManifest(ids: readonly string[], manifest: unknown): CompositeMembers | undefined {
  if (!ids.some((id) => COMPOSITE_IDS.has(id)) || !isObject(manifest) || typeof manifest["corpus"] !== "string" || !Array.isArray(manifest["specs"])) return undefined;
  const { inputs } = corpus(manifest["corpus"], manifest["specs"] as CorpusSpec[]);
  return compositeMembersOf(
    ids,
    inputs.map((file) => ({ id: file.id, input: toPackInput(file) })),
  );
}

/** This function gives the options of the portfolio report from a held-out split and the members of the composite entries. */
function portfolioOptions(heldOut: HeldOut | undefined, members: CompositeMembers | undefined): PortfolioOptions {
  return { ...(heldOut === undefined ? {} : { heldOut }), ...(members === undefined ? {} : { members }) };
}

/** This function reads a JSON Lines file of predictions. An empty line is not a prediction. A line without an `id` throws an `Error`. */
export function parsePredictions(text: string): BenchPrediction[] {
  const out: BenchPrediction[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;
    const value: unknown = JSON.parse(line);
    if (!isObject(value) || typeof value["id"] !== "string") throw new Error(`The prediction on line ${index + 1} has no id.`);
    out.push(value as unknown as BenchPrediction);
  }
  return out;
}

/** This function gives the ids of the entries of a list with commas. The value `all` or an empty list gives each entry. */
export function strategyIds(list: string | undefined): string[] {
  const ids = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (ids.length === 0 || (ids.length === 1 && ids[0] === "all")) return ENTRIES.map((e) => e.id);
  for (const id of ids) benchEntry(id);
  return [...new Set(ids)];
}

/** This function gives the median of a list. An empty list gives 0. */
export function median(values: readonly number[]): number {
  return values.length === 0 ? 0 : quantile(values, 0.5);
}

/** One timed pass in the interleaved mode: the index of the entry and the index of the repeat. */
export interface TimedRun {
  entry: number;
  repeat: number;
}

/** This function gives the order of the timed passes of one input in the interleaved mode: for each repeat, one pass of each entry. */
export function interleavedOrder(entries: number, repeats: number): TimedRun[] {
  const out: TimedRun[] = [];
  for (let repeat = 0; repeat < repeats; repeat++) for (let entry = 0; entry < entries; entry++) out.push({ entry, repeat });
  return out;
}

/** The times of the timed passes of one pair, in their order. Each pass gives the time of the whole pack and the time of the search. */
export interface PairTimes {
  msRuns: number[];
  searchMs: number[];
}

/** The options over the options of an entry, by the id of the entry */
type EntryOptions = BenchOptions["entryOptions"];

/** This function gives the entry of an id, with the options of `entryOptions` over its own options. */
function entryWith(id: string, over: EntryOptions): BenchEntry {
  const e = benchEntry(id);
  const more = over?.[id];
  return more === undefined ? e : { ...e, options: { ...e.options, ...more } };
}

/** This function gives the options that the runner gives to `packWith` for an entry. An entry of the registry gives none. */
function givenOf(e: BenchEntry, defaults: unknown): Record<string, unknown> | undefined {
  return Object.keys(e.options).length === 0 ? undefined : { ...(defaults as Record<string, unknown>), ...e.options };
}

/** One input of a corpus for the paired time test (k127): its id, its spec index, its seed and its cell. */
export interface PairedCorpusInput {
  id: string;
  spec: number;
  seed: number;
  input: PackInput;
  cell: CorpusManifest["inputs"][number]["cell"];
}

/**
 * This function gives the inputs of a corpus for the paired time test (k127), in the order of the corpus.
 *
 * - With `only`, it generates only the input of that spec and that seed. A child of mode `fresh` uses it.
 */
export function pairedInputs(c: BenchCorpus, only?: { spec: number; seed: number }): PairedCorpusInput[] {
  const specs = c.specs.map((spec, at) => ({ spec, at }));
  const chosen = only === undefined ? specs : specs.filter((x) => x.at === only.spec).map((x) => ({ ...x, spec: { ...x.spec, seeds: [only.seed] } }));
  return chosen.flatMap(({ spec, at }) => {
    const { manifest, inputs } = corpus(c.corpus, [spec]);
    return inputs.map((file, index) => ({ id: file.id, spec: at, seed: file.seed, input: toPackInput(file), cell: manifest.inputs[index]!.cell }));
  });
}

/** The prefix of an arm of the paired time test that is the portfolio wrapper around one entry, with an empty key (k130). */
export const WRAP_PREFIX = "wrap-";

/** The key of a wrap arm: no hard breaks, no levels and no hash. Thus the arm times only the wrapper and its member. */
const EMPTY_KEY: PortfolioKey<PackInput, PackOutput> = { hard: () => 0, levels: [], hash: () => "" };

/**
 * This function gives the pack of an entry on an input, as the runner packs it. An entry that does not support the cell of the input gives `undefined`.
 *
 * - The id `wrap-<entry>` gives the wrapper of `packPortfolio` around that one entry, with an empty key (k130).
 * - Each pack of a wrap arm makes its portfolio, as the strategy `portfolio` does. It does not go through `packWith`.
 */
export function pairedPack(id: string, at: PairedCorpusInput, over?: EntryOptions): (() => PackOutput) | undefined {
  const wrapped = id.startsWith(WRAP_PREFIX) ? id.slice(WRAP_PREFIX.length) : undefined;
  const e = entryWith(wrapped ?? id, over);
  const s = benchStrategy(e.strategy);
  if (unsupportedOf(s.supports, at.cell) !== undefined) return undefined;
  const given = givenOf(e, s.defaults);
  if (wrapped !== undefined) return () => portfolioWith([{ id: e.id, strategy: e.strategy, options: given }], EMPTY_KEY, { seed: at.seed }).run(at.input);
  return () => benchPack(e.strategy, at.input, given, at.seed);
}

/** This function times `repeats` passes of one pair, one after the other. The sampler of the whole space (k112) uses it. */
export function timeRuns(pack: () => PackOutput, repeats: number, clock: () => number): PairTimes {
  const out: PairTimes = { msRuns: [], searchMs: [] };
  for (let r = 0; r < repeats; r++) {
    const start = clock();
    const output = pack();
    out.msRuns.push(clock() - start);
    out.searchMs.push(traceSum(output, "pack.search.ms"));
  }
  return out;
}

/**
 * This function gives the times of each pair in the interleaved mode, by entry id and by input id.
 *
 * - For each input, it does the warm-up passes of each entry, then the timed passes in the order of `interleavedOrder`.
 * - An entry that does not support the cell of the input, or that throws, gets no times for that input.
 * - The main loop of `runBench` then packs the pair again. It gives the skip or the error of the pair, as without the mode.
 */
function interleavedTimes(ids: readonly string[], inputs: ReturnType<typeof corpus>["inputs"], manifest: CorpusManifest, repeats: number, warmup: number, clock: () => number, over: EntryOptions): Map<string, Map<string, PairTimes>> {
  const out = new Map<string, Map<string, PairTimes>>(ids.map((id) => [id, new Map()]));
  for (const [index, file] of inputs.entries()) {
    const input = toPackInput(file);
    const ready: { id: string; pack: () => PackOutput; times: PairTimes }[] = [];
    for (const id of ids) {
      const e = entryWith(id, over);
      const s = benchStrategy(e.strategy);
      if (unsupportedOf(s.supports, manifest.inputs[index]!.cell) !== undefined) continue;
      const given = givenOf(e, s.defaults);
      const pack = (): PackOutput => benchPack(e.strategy, input, given, file.seed);
      try {
        for (let w = 0; w < warmup; w++) pack();
      } catch {
        continue;
      }
      ready.push({ id, pack, times: { msRuns: [], searchMs: [] } });
    }
    const failed = new Set<number>();
    for (const run of interleavedOrder(ready.length, repeats)) {
      if (failed.has(run.entry)) continue;
      const own = ready[run.entry]!;
      try {
        const step = timeRuns(own.pack, 1, clock);
        own.times.msRuns.push(...step.msRuns);
        own.times.searchMs.push(...step.searchMs);
      } catch {
        failed.add(run.entry);
      }
    }
    for (const [i, own] of ready.entries()) if (!failed.has(i)) out.get(own.id)!.set(file.id, own.times);
  }
  return out;
}

/**
 * This function gives the measures of one packed pair, before the rounding. The runner and the sampler of the whole space (k112) use it.
 *
 * - The measures are the values of `measure`, the search time, the counts of the moves and the boxes out of the true outline.
 * - The bound measures follow. With `known`, the distance from the best value follows.
 */
export function pairValues(input: PackInput, first: PackOutput, searchMs: readonly number[], known: Parameters<typeof gapToOpt>[2] | undefined): Record<string, number> {
  const values: Record<string, number> = { ...measure(input, first) };
  values["pack.search.ms"] = median(searchMs);
  // The counts of the characteristic moves, and the boxes out of the true outline of the container
  Object.assign(values, moveCounts(first));
  values[OUTSIDE_EXACT] = checkHard(input, first, DEFAULT_TOLERANCE, { exactContainer: true })["in-container"];
  // The bound of the cell and the distance of the result to it (roadmap item k51)
  Object.assign(values, boundMeasures(input, first));
  // The fill against the best fill of the placed items (k116), from 0 to 1. No placed item gives no value.
  const toBound = gapToBound(input, first, values["pack.fill"] ?? 0, values["pack.area"] ?? 0);
  if (toBound !== undefined) values[GAP_TO_BOUND] = toBound;
  // Only an input with a known best value (roadmap item k45) gets the distance from that value
  if (known !== undefined) values["pack.gapToOpt"] = gapToOpt(input, first, known);
  return values;
}

/**
 * This function gives the measures `pack.anchor.*` of one input, or none when the input has no locked item with a position.
 * It moves each locked item with `anchorStep`, one at a time. The record keeps the mean of `mean` and `moved` over
 * the locked items, the largest `max` and `gain`, and the smallest `settled`.
 */
export function anchorMeasures(input: PackInput, first: PackOutput, strategyId: string, options: unknown, seed: number, given: AnchorStabilityOptions = {}): Record<string, number> {
  const locks = input.items.filter((i) => i.locked === true && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (locks.length === 0) return {};
  const all = locks.map((lock) => anchorStability(input, { strategy: strategyId, options }, lock.id, anchorStep(input, first, lock.id, given.steps), { ...given, seed }).measures);
  const mean = (id: keyof (typeof all)[number]): number => all.reduce((sum, m) => sum + m[id], 0) / all.length;
  return {
    "pack.anchor.mean": mean("pack.anchor.mean"),
    "pack.anchor.max": Math.max(...all.map((m) => m["pack.anchor.max"])),
    "pack.anchor.moved": mean("pack.anchor.moved"),
    "pack.anchor.gain": Math.max(...all.map((m) => m["pack.anchor.gain"])),
    "pack.anchor.settled": Math.min(...all.map((m) => m["pack.anchor.settled"])),
  };
}

/** This function sums one measure over the stages of a trace. */
function traceSum(output: PackOutput, id: string): number {
  let sum = 0;
  for (const stage of output.trace ?? []) sum += stage.measures?.[id] ?? 0;
  return sum;
}

/**
 * This function tells if a config or the options of a strategy have a wall-clock limit (roadmap item k121).
 * It examines the whole tree, the members included.
 *
 * - A limit is a key `limitTime` with the value `true`, or a key `budgetMs` with a value.
 * - A result with a wall-clock limit depends on the speed of the computer, so it is not deterministic by design.
 * - Each other config packs the same output for the same input and seed. A work limit of `budgetWork` is not a clock.
 */
export function hasClockLimit(config: unknown): boolean {
  if (Array.isArray(config)) return config.some(hasClockLimit);
  if (config === null || typeof config !== "object") return false;
  const o = config as Record<string, unknown>;
  if (o["limitTime"] === true || (o["budgetMs"] !== undefined && o["budgetMs"] !== null)) return true;
  return Object.values(o).some(hasClockLimit);
}

/** A record for the determinism gate of k121: a bench record or a sampled record. A record without `deterministic` counts as deterministic. */
export interface GateRecord {
  readonly strategy: string;
  readonly input: string;
  readonly deterministic?: boolean | null;
  readonly skipped?: string;
  /** The value of `hasClockLimit` of a sampled record. A record without it gets the value from `config` or `options`. */
  readonly clock?: boolean;
  readonly config?: unknown;
  readonly options?: unknown;
  readonly pair?: number;
}

/** A record that is not deterministic and has no wall-clock limit: a failure of the determinism gate. */
export interface GateFailure {
  readonly strategy: string;
  readonly input: string;
  readonly pair?: number;
}

/**
 * The counts of the determinism gate of k121.
 *
 * - `nondeterministic` counts each measured record that is not deterministic, as before k121.
 * - `nondeterministicClock` counts the records of `nondeterministic` with a wall-clock limit. They do not fail a run.
 * - `failures` lists the other records of `nondeterministic`. Each one fails the run.
 */
export interface DeterminismCounts {
  readonly nondeterministic: number;
  readonly nondeterministicClock: number;
  readonly failures: readonly GateFailure[];
}

/** This function tells if a gate record has a wall-clock limit: its field `clock`, else `hasClockLimit` of its config or its options. */
export const isClockRecord = (r: Pick<GateRecord, "clock" | "config" | "options">): boolean => r.clock ?? hasClockLimit(r.config ?? r.options);

/** This function gives the counts of the determinism gate of some records. A skipped record does not count. */
export function determinismOf(records: readonly GateRecord[]): DeterminismCounts {
  let nondeterministic = 0;
  let nondeterministicClock = 0;
  const failures: GateFailure[] = [];
  for (const r of records) {
    if (r.skipped !== undefined || r.deterministic !== false) continue;
    nondeterministic++;
    if (isClockRecord(r)) nondeterministicClock++;
    else failures.push({ strategy: r.strategy, input: r.input, ...(r.pair === undefined ? {} : { pair: r.pair }) });
  }
  return { nondeterministic, nondeterministicClock, failures };
}

/** This function gives the Markdown lines of the counts of the determinism gate: the two counts, then the result of the gate. */
export function determinismMarkdown(counts: DeterminismCounts): string[] {
  const fail = counts.failures.length;
  return [
    `- Not deterministic without a clock limit (\`nondeterministic\` less \`nondeterministicClock\`): ${fail}. Each one fails the run.`,
    `- Not deterministic with a clock limit (\`nondeterministicClock\`): ${counts.nondeterministicClock}. A clock limit depends on the computer, so they do not fail the run.`,
    `- The determinism gate (k121): ${fail === 0 ? "passed" : "failed"}.`,
  ];
}

/** This function gives the lines of a gate failure for the command line, or no lines when the gate passes. */
export function gateLines(counts: DeterminismCounts, what: string): string[] {
  if (counts.failures.length === 0) return [];
  const list = counts.failures.slice(0, 20).map((f) => `${f.pair === undefined ? "" : `pair ${f.pair}: `}${f.strategy} on ${f.input}`);
  return [`The determinism gate (k121) failed: ${counts.failures.length} ${what} without a clock limit are not deterministic.`, ...list];
}

/** This function keeps only the finite values of a record of measures. The sampler of the whole space (k112) uses it. */
export function finite(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(values)) if (Number.isFinite(v)) out[id] = v;
  return out;
}

/** The input files of a corpus, with their ids and their seeds. */
type CorpusFile = ReturnType<typeof corpus>["inputs"][number];

/** This function gives the fields of each record of a pair. */
function headOf(id: string, defaults: Record<string, unknown>, corpusName: string, file: CorpusFile) {
  return {
    schema: "layout-record/1",
    stage: "pack",
    step: "pack",
    strategy: id,
    options: defaults,
    corpus: corpusName,
    input: file.id,
    inputHash: file.hash,
    set: file.set,
    seed: file.seed,
    nodes: file.boxes.length + (file.obstacles?.length ?? 0),
    edges: file.edges.length,
  } as const;
}

/** This function gives the record of a pair that the runner did not pack. */
function skippedRecordOf(options: BenchOptions, head: ReturnType<typeof headOf>, reason: string, facts: Pick<SkippedRecord, "budgetMs" | "msAtLeast" | "because"> = {}): SkippedRecord {
  const record: SkippedRecord = {
    ...head,
    measures: {},
    hard: {},
    tolerance: { overlap: DEFAULT_TOLERANCE.overlap },
    deterministic: null,
    prediction: options.prediction,
    ms: 0,
    skipped: reason,
    env: options.env,
    ...facts,
  };
  if (options.commit !== undefined) record.commit = options.commit;
  return record;
}

/**
 * The reason of a step of a chain whose base has no output. A strategy that reads the previous output does not pack such a step from nothing,
 * because that changes what the step measures.
 */
export const NOT_RUN_BASE = "not run: base has no output";

/** The results of some pairs: the records, the skips and the errors. */
export interface PairResults {
  records: BenchRecord[];
  skipped: BenchSkip[];
  errors: BenchError[];
}

/** The times of a run: the counts of the passes, the clock, and the times of an interleaved run. */
interface PairTiming {
  repeats: number;
  warmup: number;
  clock: () => number;
  interleaved?: ReturnType<typeof interleavedTimes> | undefined;
}

/** This function reads the options of the passes of a run, and throws a `RangeError` on a wrong value. */
function timingOf(options: BenchOptions): PairTiming {
  const repeats = options.repeats ?? DEFAULT_REPEATS;
  const warmup = options.warmup ?? DEFAULT_WARMUP;
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  if (options.prediction.trim() === "") throw new RangeError("Each run names its prediction.");
  return { repeats, warmup, clock: options.clock ?? (() => performance.now()) };
}

/**
 * This function gives the function that packs one pair and adds its results to `into`.
 * Without `outputs`, the function keeps no output, so a corpus with `base` inputs does not go with it.
 *
 * A strategy with the mode `incremental` takes each input of a chain, and it gets its own output at the base as `previous`.
 * Another strategy packs each step with no `previous`, and a lost base takes away only the stability values of that step.
 */
function pairPacker(options: BenchOptions, ids: readonly string[], manifest: CorpusManifest, inputs: readonly CorpusFile[], into: PairResults, timing: PairTiming, outputs?: Map<string, Map<string, PackOutput>>): (id: string, index: number) => void {
  // The inputs of a chain: each step, and each input that a step names as its base
  const chained = new Set(inputs.flatMap((file) => (file.base === undefined ? [] : [file.id, file.base])));
  const entries = new Map(
    ids.map((id) => {
      const e = entryWith(id, options.entryOptions);
      const s = benchStrategy(e.strategy);
      const kept = outputs === undefined ? undefined : new Map<string, PackOutput>();
      if (kept !== undefined) outputs?.set(id, kept);
      return [
        id,
        {
          e,
          s,
          // An entry of the registry gives no options to packWith, as the runner before k21 did
          given: givenOf(e, s.defaults),
          done: new Map<string, { input: PackInput; output: PackOutput }>(),
          kept,
          defaults: { ...(s.defaults as Record<string, unknown>), ...e.options },
        },
      ] as const;
    }),
  );
  return (id, index) => {
    const { e, s, given, done, kept, defaults } = entries.get(id)!;
    const file = inputs[index]!;
    const head = headOf(id, defaults, manifest.corpus, file);
    const skip = (dimension: string, value: string, reason: string = skipReason(dimension, value), facts: Pick<SkippedRecord, "because"> = {}): void => {
      into.skipped.push({ strategy: id, input: file.id, dimension, value });
      into.records.push(skippedRecordOf(options, head, reason, facts));
    };
    const cell = manifest.inputs[index]!.cell;
    const takesPrevious = chained.has(file.id) && s.supports.mode.includes("incremental");
    const miss = unsupportedOf(s.supports, takesPrevious ? { ...cell, mode: "incremental" } : cell);
    if (miss !== undefined) {
      skip(miss.dimension, miss.value);
      return;
    }
    const base = file.base === undefined ? undefined : done.get(file.base);
    if (takesPrevious && file.base !== undefined && base === undefined) {
      skip("budget", NOT_RUN_BASE, NOT_RUN_BASE, { because: [file.base] });
      return;
    }
    const previous = takesPrevious ? base?.output : undefined;
    const input = toPackInput(file);
    try {
      const firstStart = options.slowPackMs === undefined ? 0 : timing.clock();
      const first = benchPack(e.strategy, input, given, file.seed, previous);
      // Rule 5 of the budget: a measure of this pair chooses one timed run, and the record tells it
      const oneRun = options.slowPackMs !== undefined && timing.clock() - firstStart > options.slowPackMs;
      const second = benchPack(e.strategy, input, given, file.seed, previous);
      // k121: each later pass counts for `deterministic` too, so a run with 10 repeats compares 11 outputs with the first
      const later: PackOutput[] = [second];
      const pack = (): PackOutput => {
        const output = benchPack(e.strategy, input, given, file.seed, previous);
        later.push(output);
        return output;
      };
      // The interleaved mode did the warm-up passes and the timed passes before this loop
      let times = timing.interleaved?.get(id)?.get(file.id);
      if (times === undefined) {
        for (let w = 0; w < (oneRun ? 0 : timing.warmup); w++) pack();
        times = timeRuns(pack, oneRun ? 1 : timing.repeats, timing.clock);
      }
      const { msRuns, searchMs } = times;

      const values = pairValues(input, first, searchMs, file.known);
      // k123: the move between the outputs of two seeds, after the best alignment. A strategy that does not read the seed gives 0.
      Object.assign(values, measureSeed(input, first, benchPack(e.strategy, input, given, file.seed + 1, previous)));
      if (base !== undefined) Object.assign(values, measureChange(base.input, base.output, input, first));
      // Only a run that asks for it gets the stability when an anchor moves (roadmap item k111)
      if (options.anchor !== undefined && options.anchor !== false) {
        Object.assign(values, anchorMeasures(input, first, e.strategy, given, file.seed, options.anchor === true ? {} : options.anchor));
      }
      if (kept !== undefined) {
        done.set(file.id, { input, output: first });
        kept.set(file.id, first);
      }

      const record: MeasuredRecord = {
        ...head,
        measures: roundMeasures(finite(values)),
        hard: checkHard(input, first, DEFAULT_TOLERANCE),
        hardRule: HARD_RULE_VERSION,
        tolerance: { overlap: DEFAULT_TOLERANCE.overlap },
        deterministic: later.every((output) => isDeterministic(first, output)),
        prediction: options.prediction,
        ms: round3(median(msRuns)),
        msRuns: msRuns.map(round3),
        ...(oneRun ? { oneRun } : {}),
        outputHash: outputHash(first),
        env: options.env,
      };
      if (options.commit !== undefined) record.commit = options.commit;
      into.records.push(record);
    } catch (error) {
      if (error instanceof UnsupportedCell) skip(error.dimension, error.value);
      else into.errors.push({ strategy: id, input: file.id, message: error instanceof Error ? error.message : String(error) });
    }
  };
}

/** This function gives the coverage of each strategy: the measured records of all the inputs and of each container shape. */
function runCoverage(ids: readonly string[], manifest: CorpusManifest, inputs: readonly CorpusFile[], records: readonly BenchRecord[]): Record<string, BenchCoverage> {
  const coverage: Record<string, BenchCoverage> = {};
  for (const id of ids) {
    const packed = new Set(records.filter((r) => r.strategy === id && isMeasured(r)).map((r) => r.input));
    const shapes: Record<string, { measured: number; inputs: number }> = {};
    for (const [index, file] of inputs.entries()) {
      const shape = manifest.inputs[index]!.cell.containerShape;
      const c = (shapes[shape] ??= { measured: 0, inputs: 0 });
      c.inputs++;
      if (packed.has(file.id)) c.measured++;
    }
    coverage[id] = { ...countOf(packed.size, inputs.length), shapes: Object.fromEntries(Object.entries(shapes).map(([k, c]) => [k, countOf(c.measured, c.inputs)])) };
  }
  return coverage;
}

/** This function makes the facts of a run from the results of its pairs. */
function finishRun(options: BenchOptions, ids: readonly string[], manifest: CorpusManifest, inputs: readonly CorpusFile[], declared: Record<string, number>, results: PairResults, timing: PairTiming): BenchRun {
  const { records, skipped, errors } = results;
  const run: BenchRun = {
    schema: "packing-bench-run/1",
    corpus: manifest.corpus,
    prediction: options.prediction,
    repeats: timing.repeats,
    warmup: timing.warmup,
    strategies: [...ids],
    env: options.env,
    skipped,
    errors,
    coverage: runCoverage(ids, manifest, inputs, records),
    declared,
  };
  if (options.commit !== undefined) run.commit = options.commit;
  if (options.corpus.heldOut !== undefined) run.heldOut = options.corpus.heldOut;
  if (options.interleave === true) run.interleave = true;
  const members = ids.some((id) => COMPOSITE_IDS.has(id))
    ? compositeMembersOf(
        ids,
        inputs.map((file) => ({ id: file.id, input: toPackInput(file) })),
      )
    : undefined;
  Object.assign(run, screenOf(ids, records, shapesOf(manifest), portfolioOptions(run.heldOut, members)));
  return run;
}

/**
 * This function benchmarks a corpus. It packs each input with each strategy that supports the cell of the input.
 *
 * - A strategy that does not support the cell of the manifest gets a skipped record and a skip in the run.
 * - The records keep the order of the strategies, and then the order of the inputs.
 * - The runner packs each pair 2 times for `deterministic`, then `warmup` times, then `repeats` times with a clock.
 * - With `interleave`, the timed passes of each input alternate between the entries. The records and their order do not change.
 * - An input with a `base` in the corpus gets the stability measures of `measureChange` against the run on its base.
 * - With `anchor`, an input with a locked item gets the measures `pack.anchor.*` of `anchorMeasures`.
 * - An error other than `UnsupportedCell` goes into `errors`, and the runner goes on.
 */
export function runBench(options: BenchOptions): BenchResult {
  const timing = timingOf(options);
  const ids = options.strategies === undefined ? ENTRIES.map((e) => e.id) : [...options.strategies];
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  // A false claim stops the run before the first packing
  const declared = checkDeclared(options.corpus, inputs.map(toPackInput));
  if (options.interleave === true) timing.interleaved = interleavedTimes(ids, inputs, manifest, timing.repeats, timing.warmup, timing.clock, options.entryOptions);

  const results: PairResults = { records: [], skipped: [], errors: [] };
  const outputs = new Map<string, Map<string, PackOutput>>();
  const packPair = pairPacker(options, ids, manifest, inputs, results, timing, outputs);
  for (const id of ids) {
    for (const index of inputs.keys()) packPair(id, index);
  }
  return { run: finishRun(options, ids, manifest, inputs, declared, results, timing), records: results.records, manifest, outputs };
}

/** One pair of a run with a budget. */
export interface BenchPair {
  strategy: string;
  input: string;
}

/**
 * This function packs some pairs in the order of the list, as `runBench` packs them, and keeps no results.
 * `onStart` comes before each pair. `onEnd` gets the results of the pair.
 * A corpus with `base` inputs keeps the outputs of this process. So a step reads its base only when the same process packed that base.
 */
export function runPairs(options: BenchOptions, pairs: readonly BenchPair[], onStart: (pair: BenchPair) => void, onEnd: (pair: BenchPair, results: PairResults) => void): void {
  const timing = timingOf(options);
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  const indexes = new Map(inputs.map((file, index) => [file.id, index]));
  const into: PairResults = { records: [], skipped: [], errors: [] };
  const outputs = inputs.some((file) => file.base !== undefined) ? new Map<string, Map<string, PackOutput>>() : undefined;
  const packPair = pairPacker(options, [...new Set(pairs.map((p) => p.strategy))], manifest, inputs, into, timing, outputs);
  for (const pair of pairs) {
    const index = indexes.get(pair.input);
    if (index === undefined) throw new RangeError(`The corpus has no input "${pair.input}".`);
    onStart(pair);
    packPair(pair.strategy, index);
    onEnd(pair, { records: into.records.splice(0), skipped: into.skipped.splice(0), errors: into.errors.splice(0) });
  }
}

/** This function gives the function that makes the skip and the record of a pair that a budget stopped. */
export function budgetSkips(options: BenchOptions): (pair: BenchPair, reason: string, facts: Pick<SkippedRecord, "budgetMs" | "msAtLeast" | "because">) => { skip: BenchSkip; record: SkippedRecord } {
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  const files = new Map(inputs.map((file) => [file.id, file]));
  return (pair, reason, facts) => {
    const file = files.get(pair.input);
    if (file === undefined) throw new RangeError(`The corpus has no input "${pair.input}".`);
    const e = entryWith(pair.strategy, options.entryOptions);
    const defaults = { ...(benchStrategy(e.strategy).defaults as Record<string, unknown>), ...e.options };
    return { skip: { strategy: pair.strategy, input: pair.input, dimension: "budget", value: reason }, record: skippedRecordOf(options, headOf(pair.strategy, defaults, manifest.corpus, file), reason, facts) };
  };
}

/** This function makes the result of a run from the results of its pairs, and packs no pair. The result has no outputs. */
export function runOfPairs(options: BenchOptions, results: PairResults): BenchResult {
  const timing = timingOf(options);
  const ids = options.strategies === undefined ? ENTRIES.map((e) => e.id) : [...options.strategies];
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  const declared = checkDeclared(options.corpus, inputs.map(toPackInput));
  return { run: finishRun(options, ids, manifest, inputs, declared, results, timing), records: results.records, manifest, outputs: new Map() };
}

/** This function writes records as JSON Lines: one line for each record, and a line end after each line. */
export function recordLines(records: readonly BenchRecord[]): string {
  return records.map((r) => `${JSON.stringify(r)}\n`).join("");
}

/** The fields of `BenchScreen` in a run */
const SCREEN_FIELDS = ["fill", "overflow", "outputGroups", "cellGroups", "activation", "ranking", "portfolio"] as const;

/** The least count of keys in a load factor: the default of `controlFactor`. */
const FACTOR_KEYS = 5;

/** This function joins the budgets of the jobs: the rules are one, the jobs add up, and 2 or more jobs give the load factors. */
function mergedBudget(runs: readonly BenchRun[]): BenchBudget {
  const rulesOf = ({ jobs: _jobs, factors: _factors, ...rules }: BenchBudget): string => JSON.stringify(rules);
  const budgets = runs.map((r) => r.budget);
  const first = budgets[0];
  if (first === undefined || budgets.some((b) => b === undefined || rulesOf(b) !== rulesOf(first))) throw new Error("The runs of a merge have one budget.");
  const jobs = budgets.flatMap((b) => b?.jobs ?? []);
  const merged: BenchBudget = { ...first, jobs };
  delete merged.factors;
  if (jobs.filter((j) => j.control.length >= FACTOR_KEYS).length >= 2) {
    merged.factors = [...controlFactor(jobs.flatMap((j) => j.control.map((c) => ({ group: j.job, key: c.key, value: c.ms })))).factors];
  }
  return merged;
}

/**
 * This function joins the runs of the jobs of one corpus and one prediction into one run. It throws an `Error` for different runs.
 * With `records`, the merge gives the fields of `BenchScreen` from the records of all the jobs. `manifest` gives the container shapes.
 * Without `records`, the merged run has no fields of `BenchScreen`, because the screen of each job sees only its strategies.
 */
export function mergeRuns(runs: readonly BenchRun[], records?: readonly BenchRecord[], manifest?: unknown): BenchRun {
  const first = runs[0];
  if (first === undefined) throw new Error("A merge needs one run or more.");
  for (const r of runs) {
    if (r.corpus !== first.corpus || r.prediction !== first.prediction || r.commit !== first.commit) {
      throw new Error("The runs of a merge have one corpus, one prediction and one commit.");
    }
    if (r.heldOut !== first.heldOut) throw new Error("The runs of a merge have one held-out split.");
  }
  const merged: BenchRun = {
    ...first,
    strategies: runs.flatMap((r) => r.strategies),
    skipped: runs.flatMap((r) => r.skipped),
    errors: runs.flatMap((r) => r.errors),
  };
  // The counts of one strategy in two jobs add up
  const sums: Record<string, { all: [number, number]; shapes: Record<string, [number, number]> }> = {};
  for (const r of runs) {
    for (const [id, c] of Object.entries(r.coverage ?? {})) {
      const sum = (sums[id] ??= { all: [0, 0], shapes: {} });
      sum.all = [sum.all[0] + c.measured, sum.all[1] + c.inputs];
      for (const [shape, n] of Object.entries(c.shapes)) {
        const old = sum.shapes[shape] ?? [0, 0];
        sum.shapes[shape] = [old[0] + n.measured, old[1] + n.inputs];
      }
    }
  }
  if (runs.some((r) => r.coverage !== undefined)) {
    merged.coverage = Object.fromEntries(
      Object.entries(sums).map(([id, sum]) => [id, { ...countOf(...sum.all), shapes: Object.fromEntries(Object.entries(sum.shapes).map(([k, n]) => [k, countOf(...n)])) }]),
    );
  } else delete merged.coverage;
  if (runs.some((r) => r.budget !== undefined)) merged.budget = mergedBudget(runs);
  for (const field of SCREEN_FIELDS) delete merged[field];
  if (records !== undefined) {
    const portfolio = portfolioOptions(merged.heldOut, membersOfManifest(merged.strategies, manifest));
    Object.assign(merged, screenOf(merged.strategies, records, shapesOf(manifest), portfolio));
  }
  return merged;
}

/** The guard measures of the packer: the measures of `MEASURE_SPECS` with a floor. */
const GUARDS = (Object.keys(MEASURE_SPECS) as MeasureId[]).filter((id) => MEASURE_SPECS[id].floor !== undefined);

/** The measures of the summary: the guards, then the density measures. */
const SUMMARY_MEASURES: string[] = [...GUARDS, "pack.fill", "pack.whitespace"];

/** This function gives the family of an input id `<set>/<family>/s<seed>`. */
const familyOf = (input: string): string => input.split("/").slice(1, -1).join("/");

/** This function sums the hard breaks of a record. */
const breaksOf = (r: MeasuredRecord): number => Object.values(r.hard).reduce((sum, n) => sum + n, 0);

/** This function writes a number for a table: at most 3 decimals. */
const num = (v: number | undefined): string => (v === undefined ? "-" : String(round3(v)));

/** This function gives the median of a measure over records. Skipped records and records without the measure do not count. */
function medianOf(records: readonly BenchRecord[], id: string): number | undefined {
  const values = records
    .filter(isMeasured)
    .map((r) => (id === "ms" ? r.ms : r.measures[id]))
    .filter((v): v is number => v !== undefined);
  return values.length === 0 ? undefined : median(values);
}

/** This function gives the coverage of a prediction from the coverage of a run, or `undefined` when the run has no count for it. */
function coverageOf(p: BenchPrediction, run: BenchRun | undefined): number | undefined {
  const all = Object.entries(run?.coverage ?? {}).filter(([id]) => p.strategy === undefined || id === p.strategy);
  const shape = p.cell?.containerShape;
  const counts = all.map(([, c]) => (shape === undefined ? c : c.shapes[shape])).filter((c): c is BenchCount => c !== undefined);
  const inputs = counts.reduce((sum, c) => sum + c.inputs, 0);
  return inputs === 0 ? undefined : round3(counts.reduce((sum, c) => sum + c.measured, 0) / inputs);
}

/**
 * This function checks a prediction against the measured records. The value `met` is absent when no measured record has
 * the measure. The measure `pack.coverage` comes from the coverage of `run`, and its default operator is `>=`.
 */
export function checkPrediction(p: BenchPrediction, records: readonly BenchRecord[], run?: BenchRun): { measured?: number; met?: boolean } {
  if (p.measure === undefined || p.expected === undefined) return {};
  if (p.measure === "pack.coverage") {
    const measured = coverageOf(p, run);
    if (measured === undefined) return {};
    return { measured, met: compare(measured, p.op ?? ">=", p.expected) };
  }
  const match = records.filter((r) => isMeasured(r) && (p.strategy === undefined || r.strategy === p.strategy) && (p.set === undefined || r.set === p.set) && (p.input === undefined || r.input === p.input));
  const measured = medianOf(match, p.measure);
  if (measured === undefined) return {};
  const spec = MEASURE_SPECS[p.measure as MeasureId] as (typeof MEASURE_SPECS)[MeasureId] | undefined;
  const op = p.op ?? (spec?.direction === "higher" ? ">=" : "<=");
  return { measured, met: compare(measured, op, p.expected) };
}

/** This function compares a measured value with an expected value. */
function compare(measured: number, op: NonNullable<BenchPrediction["op"]>, expected: number): boolean {
  return { "<=": measured <= expected, ">=": measured >= expected, "<": measured < expected, ">": measured > expected, "==": measured === expected }[op];
}

/** The group of a kind of bound: the part of its name before the dot. `strip`, `hull` and `placed` are the 3 objectives. */
const boundGroupOf = (code: number): string => (BOUND_KINDS[code] ?? "unknown").split(".")[0]!;

/**
 * This function writes the table of the bounds (roadmap item k51). Each row is a strategy and a group of bound kinds.
 * The row gives the records with `pack.gap`, the median and the quantile 0.95 of the gap, and the count of each winning kind.
 */
export function boundsMarkdown(strategies: readonly string[], records: readonly MeasuredRecord[]): string[] {
  const rows: string[] = [];
  for (const id of strategies) {
    const own = records.filter((r) => r.strategy === id && r.measures["pack.gap"] !== undefined && r.measures["pack.bound.kind"] !== undefined);
    const groups = [...new Set(own.map((r) => boundGroupOf(r.measures["pack.bound.kind"]!)))];
    for (const group of groups) {
      const rs = own.filter((r) => boundGroupOf(r.measures["pack.bound.kind"]!) === group);
      const gaps = rs.map((r) => r.measures["pack.gap"]!);
      const kinds = new Map<string, number>();
      for (const r of rs) {
        const kind = BOUND_KINDS[r.measures["pack.bound.kind"]!] ?? "unknown";
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      const kindText = [...kinds].map(([k, n]) => `\`${k}\` ${n}`).join(", ");
      rows.push(`| ${id} | ${group} | ${rs.length} | ${num(median(gaps))} | ${num(quantile(gaps, 0.95))} | ${kindText} |`);
    }
  }
  if (rows.length === 0) return ["No measured record has the measure `pack.gap`."];
  return ["| strategy | objective | records | gap median | gap q0.95 | winning bounds |", "|---|---|---:|---:|---:|---|", ...rows];
}

/** This function gives the section of the summary about the budget. A run without a budget has no section. */
function budgetLines(run: BenchRun, records: readonly BenchRecord[]): string[] {
  const b = run.budget;
  if (b === undefined) return [];
  const lines = [
    "",
    "## Budget",
    "",
    `- A pair has a wall budget of ${b.smallPairMs} ms up to ${b.smallItems} items, and ${b.pairMs} ms above. A first pack over ${b.slowPackMs} ms gives the pair 1 timed run and no warm-up.`,
    `- After ${b.overruns} pairs over budget, the other pairs of the entry at that size and above do not start.`,
    ...(b.deadlineMinutes === undefined ? [] : [`- The pairs of one job stop after ${b.deadlineMinutes} minutes.`]),
    "",
    "| strategy | largest input finished | over budget | not started | 1 timed run | load factor |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const id of run.strategies) {
    const own = records.filter((r) => r.strategy === id);
    const finished = own.filter(isMeasured);
    const over = own.filter((r) => !isMeasured(r) && r.msAtLeast !== undefined).length;
    const notRun = own.filter((r) => !isMeasured(r) && r.budgetMs !== undefined && r.msAtLeast === undefined).length;
    const factor = b.factors?.find((f) => f.group === id)?.factor;
    lines.push(`| ${id} | ${finished.length === 0 ? "-" : Math.max(...finished.map((r) => r.nodes))} | ${over} | ${notRun} | ${finished.filter((r) => r.oneRun === true).length} | ${num(factor)} |`);
  }
  return lines;
}

/**
 * This function writes the summary of a run as Markdown. The first table has one row for each strategy. A section for
 * each strategy has one row for each family. Then come the coverage, the sections of the screen, the skipped cells, the
 * breaks, the errors and the predictions.
 */
export function summaryMarkdown(run: BenchRun, records: readonly BenchRecord[], predictions: readonly BenchPrediction[] = []): string {
  const short = (id: string): string => id.replace(/^pack\./, "");
  const measured = records.filter(isMeasured);
  const skips = records.filter((r): r is SkippedRecord => !isMeasured(r));
  const lines: string[] = [`# Bench \`${run.corpus}\``, ""];
  lines.push(
    `- Prediction: \`${run.prediction}\``,
    `- Commit: \`${run.commit ?? "unknown"}\``,
    `- Computer: ${run.env.runner}, ${run.env.os} ${run.env.arch}, ${run.env.cpus} x ${run.env.cpu}, Node.js ${run.env.node}`,
    `- Runs of each pair: 2 for determinism, ${run.warmup} warm-up, ${run.repeats} timed. \`ms\` is the median of the timed runs.`,
    ...(run.interleave === true ? ["- The timed passes of each input alternate between the strategies: for each repeat, one timed pass of each strategy."] : []),
    `- Records: ${records.length}. Measured records: ${measured.length}. Skipped records: ${skips.length}. Errors: ${run.errors.length}.`,
    "",
    "## Strategies",
    "",
    `| strategy | measured | skipped | errors | hard breaks | not deterministic | ${SUMMARY_MEASURES.map((m) => `${short(m)} (median)`).join(" | ")} | ms median | ms max | ms sum |`,
    `|---|---:|---:|---:|---:|---:|${SUMMARY_MEASURES.map(() => "---:").join("|")}|---:|---:|---:|`,
  );
  for (const id of run.strategies) {
    const own = measured.filter((r) => r.strategy === id);
    const ms = own.map((r) => r.ms);
    lines.push(
      `| ${id} | ${own.length} | ${skips.filter((r) => r.strategy === id).length} | ${run.errors.filter((e) => e.strategy === id).length} | ${own.reduce((sum, r) => sum + breaksOf(r), 0)} | ${own.filter((r) => !r.deterministic).length} | ${SUMMARY_MEASURES.map((m) => num(medianOf(own, m))).join(" | ")} | ${num(medianOf(own, "ms"))} | ${num(ms.length > 0 ? Math.max(...ms) : undefined)} | ${num(ms.reduce((a, b) => a + b, 0))} |`,
    );
  }

  for (const id of run.strategies) {
    const own = measured.filter((r) => r.strategy === id);
    if (own.length === 0) continue;
    lines.push("", `## \`${id}\` by family`, "", `| family | inputs | hard breaks | ${SUMMARY_MEASURES.map(short).join(" | ")} | ms median | ms max |`, `|---|---:|---:|${SUMMARY_MEASURES.map(() => "---:").join("|")}|---:|---:|`);
    const families = [...new Set(own.map((r) => familyOf(r.input)))];
    for (const family of families) {
      const rows = own.filter((r) => familyOf(r.input) === family);
      lines.push(
        `| ${family} | ${rows.length} | ${rows.reduce((sum, r) => sum + breaksOf(r), 0)} | ${SUMMARY_MEASURES.map((m) => num(medianOf(rows, m))).join(" | ")} | ${num(medianOf(rows, "ms"))} | ${num(Math.max(...rows.map((r) => r.ms)))} |`,
      );
    }
  }

  lines.push("", "## Coverage", "");
  const cov = run.coverage;
  if (cov === undefined) lines.push("The run has no coverage.");
  else {
    // Each cell is the measured inputs, of all the inputs, and the coverage
    const shapes = [...new Set(Object.values(cov).flatMap((c) => Object.keys(c.shapes)))];
    const cellText = (c: BenchCount | undefined): string => (c === undefined ? "-" : `${c.measured}/${c.inputs} (${c.coverage})`);
    lines.push(`| strategy | all | ${shapes.join(" | ")} |`, `|---|---:|${shapes.map(() => "---:").join("|")}|`);
    for (const id of run.strategies) {
      const c = cov[id];
      if (c !== undefined) lines.push(`| ${id} | ${cellText(c)} | ${shapes.map((k) => cellText(c.shapes[k])).join(" | ")} |`);
    }
  }

  if (run.declared !== undefined) {
    // The counts of the declarations of the inputs. They are facts of the corpus, not measures.
    lines.push("", "## Declared properties", "", "| property | inputs |", "|---|---:|");
    for (const id of DECLARED_IDS) lines.push(`| ${id} | ${run.declared[id] ?? 0} |`);
  }

  lines.push("", ...screenMarkdown(run, run.strategies));

  lines.push(...budgetLines(run, records));

  lines.push("", "## Skipped cells", "");
  if (skips.length === 0) lines.push("No pair was skipped.");
  else {
    lines.push("| strategy | reason | skipped records |", "|---|---|---:|");
    const counts = new Map<string, number>();
    for (const r of skips) {
      const key = `${r.strategy} | \`${r.skipped}\``;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) lines.push(`| ${key} | ${count} |`);
  }

  const broken = measured.filter((r) => breaksOf(r) > 0 || !r.deterministic);
  lines.push("", "## Hard breaks and determinism", "", ...determinismMarkdown(determinismOf(measured)), "");
  if (broken.length === 0) lines.push("Each measured record has 0 hard breaks, and each measured pair is deterministic.");
  else {
    lines.push("| strategy | input | hard | deterministic | clock limit |", "|---|---|---|---|---|");
    for (const r of broken.slice(0, 50)) lines.push(`| ${r.strategy} | ${r.input} | \`${JSON.stringify(r.hard)}\` | ${r.deterministic} | ${isClockRecord(r) ? "yes" : "no"} |`);
    if (broken.length > 50) lines.push("", `The table shows 50 of ${broken.length} records. \`records.jsonl\` has each one.`);
  }

  if (run.errors.length > 0) {
    lines.push("", "## Errors", "", "| strategy | input | message |", "|---|---|---|");
    for (const e of run.errors) lines.push(`| ${e.strategy} | ${e.input} | ${e.message.replaceAll("|", "\\|")} |`);
  }

  lines.push("", "## Stability", "");
  const changed = measured.filter((r) => r.measures["pack.stability.moved"] !== undefined);
  if (changed.length === 0) lines.push("No input of the corpus has a base, so no record has the stability measures.");
  else lines.push(`${changed.length} records have the stability measures. The tables above show their medians.`);

  lines.push("", "## Bounds", "", ...boundsMarkdown(run.strategies, measured));

  lines.push("", "## Predictions", "");
  const own = predictions.filter((p) => p.id === run.prediction);
  if (own.length === 0) lines.push(`The file \`bench/predictions.jsonl\` has no line with the id \`${run.prediction}\`.`);
  else {
    lines.push("| strategy | set | input | measure | expected | measured | met | reason |", "|---|---|---|---|---:|---:|---|---|");
    for (const p of own) {
      const c = checkPrediction(p, records, run);
      lines.push(
        `| ${p.strategy ?? "each"} | ${p.set ?? "each"} | ${p.input ?? "median"} | ${p.measure ?? "-"} | ${p.op ?? ""}${num(p.expected)} | ${num(c.measured)} | ${c.met === undefined ? "-" : c.met ? "yes" : "no"} | ${(p.reason ?? "").replaceAll("|", "\\|")} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
