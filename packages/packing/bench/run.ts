// The benchmark runner of roadmap item k11. `docs/BENCH.md` tells how to start it in CI.
// It packs each input of a corpus with each strategy and gives one `layout-record/1` record for each run.

import {
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
  packWith,
  quantile,
  round3,
  roundMeasures,
  strategy,
  toPackInput,
  UnsupportedCell,
  unsupportedOf,
  type CorpusManifest,
  type CorpusSpec,
  type MeasureId,
  type PackHard,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";
import { declaredClaimOf, type DeclaredClaim, type ShapeKind } from "@mark1russell7/layout-contract";
import { assertClaim, declaredCounts, DECLARED_IDS } from "./claims.ts";
import { COMPOSITE_IDS, ENTRIES, entry, type BenchEntry } from "./entries.ts";
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
  deterministic: boolean;
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
  /** The time of each timed run, in milliseconds, in the order of the runs. The median of this list is `ms`. */
  msRuns: number[];
  /** The first 16 hex characters of the SHA-256 of the canonical placements, sorted by id. */
  outputHash: string;
  skipped?: never;
}

/**
 * The record of a pair that the runner did not pack, because the strategy does not support the cell of the input.
 * It has no measures and no hard counts, and its `ms` is 0.
 */
export interface SkippedRecord extends BenchRecordHead {
  measures: Record<string, never>;
  hard: Record<string, never>;
  /** The reason: the value of the cell that the strategy does not support. */
  skipped: string;
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
  for (const id of ids) entry(id);
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
interface PairTimes {
  msRuns: number[];
  searchMs: number[];
}

/** This function gives the options that the runner gives to `packWith` for an entry. An entry of the registry gives none. */
function givenOf(e: BenchEntry, defaults: unknown): Record<string, unknown> | undefined {
  return Object.keys(e.options).length === 0 ? undefined : { ...(defaults as Record<string, unknown>), ...e.options };
}

/** This function times `repeats` passes of one pair, one after the other. */
function timeRuns(pack: () => PackOutput, repeats: number, clock: () => number): PairTimes {
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
function interleavedTimes(ids: readonly string[], inputs: ReturnType<typeof corpus>["inputs"], manifest: CorpusManifest, repeats: number, warmup: number, clock: () => number): Map<string, Map<string, PairTimes>> {
  const out = new Map<string, Map<string, PairTimes>>(ids.map((id) => [id, new Map()]));
  for (const [index, file] of inputs.entries()) {
    const input = toPackInput(file);
    const ready: { id: string; pack: () => PackOutput; times: PairTimes }[] = [];
    for (const id of ids) {
      const e = entry(id);
      const s = strategy(e.strategy);
      if (unsupportedOf(s.supports, manifest.inputs[index]!.cell) !== undefined) continue;
      const given = givenOf(e, s.defaults);
      const pack = (): PackOutput => packWith(e.strategy, input, given, file.seed);
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

/** This function sums one measure over the stages of a trace. */
function traceSum(output: PackOutput, id: string): number {
  let sum = 0;
  for (const stage of output.trace ?? []) sum += stage.measures?.[id] ?? 0;
  return sum;
}

/** This function keeps only the finite values of a record of measures. */
function finite(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(values)) if (Number.isFinite(v)) out[id] = v;
  return out;
}

/**
 * This function benchmarks a corpus. It packs each input with each strategy that supports the cell of the input.
 *
 * - A strategy that does not support the cell of the manifest gets a skipped record and a skip in the run.
 * - The records keep the order of the strategies, and then the order of the inputs.
 * - The runner packs each pair 2 times for `deterministic`, then `warmup` times, then `repeats` times with a clock.
 * - With `interleave`, the timed passes of each input alternate between the entries. The records and their order do not change.
 * - An input with a `base` in the corpus gets the stability measures of `measureChange` against the run on its base.
 * - An error other than `UnsupportedCell` goes into `errors`, and the runner goes on.
 */
export function runBench(options: BenchOptions): BenchResult {
  const repeats = options.repeats ?? DEFAULT_REPEATS;
  const warmup = options.warmup ?? DEFAULT_WARMUP;
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  if (options.prediction.trim() === "") throw new RangeError("Each run names its prediction.");
  const clock = options.clock ?? (() => performance.now());
  const ids = options.strategies === undefined ? ENTRIES.map((e) => e.id) : [...options.strategies];
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  // A false claim stops the run before the first packing
  const declared = checkDeclared(options.corpus, inputs.map(toPackInput));
  const interleaved = options.interleave === true ? interleavedTimes(ids, inputs, manifest, repeats, warmup, clock) : undefined;

  const records: BenchRecord[] = [];
  const skipped: BenchSkip[] = [];
  const errors: BenchError[] = [];
  const outputs = new Map<string, Map<string, PackOutput>>();
  const coverage: Record<string, BenchCoverage> = {};

  for (const id of ids) {
    const e = entry(id);
    const s = strategy(e.strategy);
    // An entry of the registry gives no options to packWith, as the runner before k21 did
    const given = givenOf(e, s.defaults);
    const done = new Map<string, { input: PackInput; output: PackOutput }>();
    const kept = new Map<string, PackOutput>();
    outputs.set(id, kept);
    const defaults = { ...(s.defaults as Record<string, unknown>), ...e.options };
    for (const [index, file] of inputs.entries()) {
      const head = {
        schema: "layout-record/1",
        stage: "pack",
        step: "pack",
        strategy: id,
        options: defaults,
        corpus: manifest.corpus,
        input: file.id,
        inputHash: file.hash,
        set: file.set,
        seed: file.seed,
        nodes: file.boxes.length + (file.obstacles?.length ?? 0),
        edges: file.edges.length,
      } as const;
      const skip = (dimension: string, value: string): void => {
        skipped.push({ strategy: id, input: file.id, dimension, value });
        const record: SkippedRecord = {
          ...head,
          measures: {},
          hard: {},
          tolerance: { overlap: DEFAULT_TOLERANCE.overlap },
          deterministic: true,
          prediction: options.prediction,
          ms: 0,
          skipped: skipReason(dimension, value),
          env: options.env,
        };
        if (options.commit !== undefined) record.commit = options.commit;
        records.push(record);
      };
      const miss = unsupportedOf(s.supports, manifest.inputs[index]!.cell);
      if (miss !== undefined) {
        skip(miss.dimension, miss.value);
        continue;
      }
      const input = toPackInput(file);
      try {
        const first = packWith(e.strategy, input, given, file.seed);
        const second = packWith(e.strategy, input, given, file.seed);
        const pack = (): PackOutput => packWith(e.strategy, input, given, file.seed);
        // The interleaved mode did the warm-up passes and the timed passes before this loop
        let times = interleaved?.get(id)?.get(file.id);
        if (times === undefined) {
          for (let w = 0; w < warmup; w++) pack();
          times = timeRuns(pack, repeats, clock);
        }
        const { msRuns, searchMs } = times;

        const values: Record<string, number> = { ...measure(input, first) };
        values["pack.search.ms"] = median(searchMs);
        // The counts of the characteristic moves, and the boxes out of the true outline of the container
        Object.assign(values, moveCounts(first));
        values[OUTSIDE_EXACT] = checkHard(input, first, DEFAULT_TOLERANCE, { exactContainer: true })["in-container"];
        // The bound of the cell and the distance of the result to it (roadmap item k51)
        Object.assign(values, boundMeasures(input, first));
        // Only an input with a known best value (roadmap item k45) gets the distance from that value
        if (file.known !== undefined) values["pack.gapToOpt"] = gapToOpt(input, first, file.known);
        const base = file.base === undefined ? undefined : done.get(file.base);
        if (base !== undefined) Object.assign(values, measureChange(base.input, base.output, input, first));
        done.set(file.id, { input, output: first });
        kept.set(file.id, first);

        const record: MeasuredRecord = {
          ...head,
          measures: roundMeasures(finite(values)),
          hard: checkHard(input, first, DEFAULT_TOLERANCE),
          tolerance: { overlap: DEFAULT_TOLERANCE.overlap },
          deterministic: isDeterministic(first, second),
          prediction: options.prediction,
          ms: round3(median(msRuns)),
          msRuns: msRuns.map(round3),
          outputHash: outputHash(first),
          env: options.env,
        };
        if (options.commit !== undefined) record.commit = options.commit;
        records.push(record);
      } catch (error) {
        if (error instanceof UnsupportedCell) skip(error.dimension, error.value);
        else errors.push({ strategy: id, input: file.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    // The coverage: the measured records of this strategy, of all the inputs and of each container shape
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

  const run: BenchRun = {
    schema: "packing-bench-run/1",
    corpus: manifest.corpus,
    prediction: options.prediction,
    repeats,
    warmup,
    strategies: ids,
    env: options.env,
    skipped,
    errors,
    coverage,
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
  return { run, records, manifest, outputs };
}

/** This function writes records as JSON Lines: one line for each record, and a line end after each line. */
export function recordLines(records: readonly BenchRecord[]): string {
  return records.map((r) => `${JSON.stringify(r)}\n`).join("");
}

/** The fields of `BenchScreen` in a run */
const SCREEN_FIELDS = ["fill", "overflow", "outputGroups", "cellGroups", "activation", "ranking", "portfolio"] as const;

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
  lines.push("", "## Hard breaks and determinism", "");
  if (broken.length === 0) lines.push("Each measured record has 0 hard breaks, and each measured pair is deterministic.");
  else {
    lines.push("| strategy | input | hard | deterministic |", "|---|---|---|---|");
    for (const r of broken.slice(0, 50)) lines.push(`| ${r.strategy} | ${r.input} | \`${JSON.stringify(r.hard)}\` | ${r.deterministic} |`);
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
