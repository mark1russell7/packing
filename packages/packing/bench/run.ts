// The benchmark runner of roadmap item k11. `docs/BENCH.md` tells how to start it in CI.
// It packs each input of a corpus with each strategy and gives one `layout-record/1` record for each run.

import { createHash } from "node:crypto";
import {
  canonicalJson,
  checkHard,
  corpus,
  DEFAULT_TOLERANCE,
  MEASURE_SPECS,
  isDeterministic,
  measure,
  measureChange,
  packWith,
  quantile,
  round3,
  roundMeasures,
  strategies,
  strategy,
  toPackInput,
  UnsupportedCell,
  unsupportedOf,
  type CorpusManifest,
  type CorpusSpec,
  type HardBreaks,
  type MeasureId,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";

/** The file of a corpus in `bench/corpora`: a `layout-corpus/1` manifest with its specs and no inputs. */
export interface BenchCorpus {
  schema: "layout-corpus/1";
  /** The name of the corpus. Each input gets it as its set. */
  corpus: string;
  specs: CorpusSpec[];
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
  /** The full options of the strategy: its defaults, because the runner gives no options. */
  options: Record<string, unknown>;
  corpus: string;
  input: string;
  inputHash: string;
  set: string;
  seed: number;
  /** The count of the boxes and the obstacles of the input, as the twin document of `highways` counts them. */
  nodes: number;
  edges: number;
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
  hard: { [K in keyof HardBreaks]: HardBreaks[K] };
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

/** The facts of one run of the runner, without the records. The file `run.json` holds them. */
export interface BenchRun {
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
  reason?: string;
}

/** The options of `runBench`. */
export interface BenchOptions {
  corpus: BenchCorpus;
  /** The id of the prediction of the run. Each record names it. */
  prediction: string;
  /** The ids of the strategies. The default is each strategy of the registry. */
  strategies?: readonly string[];
  /** The timed passes of each pair. The default is 5. */
  repeats?: number;
  /** The runs before the timed runs. The default is 2. */
  warmup?: number;
  commit?: string;
  env: BenchEnv;
  /** The clock in milliseconds. The default is `performance.now`. */
  clock?: () => number;
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
  return { schema: "layout-corpus/1", corpus: corpusName, specs: specs as CorpusSpec[] };
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

/** This function gives the ids of the strategies of a list with commas. The value `all` or an empty list gives each strategy. */
export function strategyIds(list: string | undefined): string[] {
  const ids = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (ids.length === 0 || (ids.length === 1 && ids[0] === "all")) return strategies.map((s) => s.id);
  for (const id of ids) strategy(id);
  return [...new Set(ids)];
}

/** This function gives the median of a list. An empty list gives 0. */
export function median(values: readonly number[]): number {
  return values.length === 0 ? 0 : quantile(values, 0.5);
}

/** This function sums one measure over the stages of a trace. */
function traceSum(output: PackOutput, id: string): number {
  let sum = 0;
  for (const stage of output.trace) sum += stage.measures[id] ?? 0;
  return sum;
}

/** This function gives the `outputHash` of an output: the hash of its placements. The order of the list does not count. */
export function outputHash(output: PackOutput): string {
  const sorted = output.placements.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return createHash("sha256").update(canonicalJson(sorted)).digest("hex").slice(0, 16);
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
  const ids = options.strategies === undefined ? strategies.map((s) => s.id) : [...options.strategies];
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);

  const records: BenchRecord[] = [];
  const skipped: BenchSkip[] = [];
  const errors: BenchError[] = [];
  const outputs = new Map<string, Map<string, PackOutput>>();

  for (const id of ids) {
    const s = strategy(id);
    const done = new Map<string, { input: PackInput; output: PackOutput }>();
    const kept = new Map<string, PackOutput>();
    outputs.set(id, kept);
    const defaults = { ...(s.defaults as Record<string, unknown>) };
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
        const first = packWith(id, input, undefined, file.seed);
        const second = packWith(id, input, undefined, file.seed);
        for (let w = 0; w < warmup; w++) packWith(id, input, undefined, file.seed);
        const msRuns: number[] = [];
        const searchMs: number[] = [];
        for (let r = 0; r < repeats; r++) {
          const start = clock();
          const out = packWith(id, input, undefined, file.seed);
          msRuns.push(clock() - start);
          searchMs.push(traceSum(out, "pack.search.ms"));
        }

        const values: Record<string, number> = { ...measure(input, first) };
        values["pack.search.ms"] = median(searchMs);
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
  };
  if (options.commit !== undefined) run.commit = options.commit;
  return { run, records, manifest, outputs };
}

/** This function writes records as JSON Lines: one line for each record, and a line end after each line. */
export function recordLines(records: readonly BenchRecord[]): string {
  return records.map((r) => `${JSON.stringify(r)}\n`).join("");
}

/** This function joins the runs of the jobs of one corpus and one prediction into one run. It throws an `Error` for different runs. */
export function mergeRuns(runs: readonly BenchRun[]): BenchRun {
  const first = runs[0];
  if (first === undefined) throw new Error("A merge needs one run or more.");
  for (const r of runs) {
    if (r.corpus !== first.corpus || r.prediction !== first.prediction || r.commit !== first.commit) {
      throw new Error("The runs of a merge have one corpus, one prediction and one commit.");
    }
  }
  const merged: BenchRun = {
    ...first,
    strategies: runs.flatMap((r) => r.strategies),
    skipped: runs.flatMap((r) => r.skipped),
    errors: runs.flatMap((r) => r.errors),
  };
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

/** This function checks a prediction against the measured records. The value `met` is absent when no measured record has the measure. */
export function checkPrediction(p: BenchPrediction, records: readonly BenchRecord[]): { measured?: number; met?: boolean } {
  if (p.measure === undefined || p.expected === undefined) return {};
  const match = records.filter((r) => isMeasured(r) && (p.strategy === undefined || r.strategy === p.strategy) && (p.set === undefined || r.set === p.set) && (p.input === undefined || r.input === p.input));
  const measured = medianOf(match, p.measure);
  if (measured === undefined) return {};
  const spec = MEASURE_SPECS[p.measure as MeasureId] as (typeof MEASURE_SPECS)[MeasureId] | undefined;
  const op = p.op ?? (spec?.direction === "higher" ? ">=" : "<=");
  const met = { "<=": measured <= p.expected, ">=": measured >= p.expected, "<": measured < p.expected, ">": measured > p.expected, "==": measured === p.expected }[op];
  return { measured, met };
}

/**
 * This function writes the summary of a run as Markdown. The first table has one row for each strategy. A section for
 * each strategy has one row for each family. Then come the skipped cells, the breaks, the errors and the predictions.
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

  lines.push("", "## Predictions", "");
  const own = predictions.filter((p) => p.id === run.prediction);
  if (own.length === 0) lines.push(`The file \`bench/predictions.jsonl\` has no line with the id \`${run.prediction}\`.`);
  else {
    lines.push("| strategy | set | input | measure | expected | measured | met | reason |", "|---|---|---|---|---:|---:|---|---|");
    for (const p of own) {
      const c = checkPrediction(p, records);
      lines.push(
        `| ${p.strategy ?? "each"} | ${p.set ?? "each"} | ${p.input ?? "median"} | ${p.measure ?? "-"} | ${p.op ?? ""}${num(p.expected)} | ${num(c.measured)} | ${c.met === undefined ? "-" : c.met ? "yes" : "no"} | ${(p.reason ?? "").replaceAll("|", "\\|")} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
