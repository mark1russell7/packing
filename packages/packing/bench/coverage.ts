// The space coverage of roadmap item k105. The script reads the records of a bench run and the manifest of its corpus.
// For each measure, it fits a regression tree over the features of the strategy and of the input. Then it gives the
// held-out error, the first-order sensitivity indices and the share of the cells that the model predicts.
//
//   node bench/coverage.ts --records <file> --corpus <file> --out <file> [--run <id>] [--date YYYY-MM-DD] [--folds 5] [--seed 1] [--by input|spec]
//
// `docs/BENCH.md` ("The space coverage") tells how to read the result.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { packSpace } from "@mark1russell7/packing";
import { canonicalConfig, configId, type StrategyConfig } from "@mark1russell7/layout-contract";

/** The schema of the summary of `coverage`. */
export const COVERAGE_SCHEMA = "packing-coverage/1";

/** One measure of the coverage: its id, its tolerance and its scale. */
export interface CoverageMeasure {
  /** The id of a measure of the records, or `ms` for the time. */
  readonly id: string;
  /** The largest mean absolute error of a covered cell, on the scale of the measure. */
  readonly tolerance: number;
  /** The scale of the model. With `log`, the model uses the base-10 logarithm of the value. */
  readonly scale: "linear" | "log";
}

/** The measures of the coverage, with their tolerances. A time uses a log scale: 0.15 is a factor of 1.41. */
export const COVERAGE_MEASURES: readonly CoverageMeasure[] = Object.freeze([
  { id: "pack.fill", tolerance: 0.02, scale: "linear" },
  { id: "pack.gap", tolerance: 0.02, scale: "linear" },
  { id: "pack.overflow.excessArea", tolerance: 0.02, scale: "linear" },
  { id: "ms", tolerance: 0.15, scale: "log" },
]);

/** The smallest time of the log scale, in milliseconds. A smaller time gets this value. */
const LOG_FLOOR = 0.001;

/** The value of a feature that a row does not have. */
export const ABSENT = "-";

/** The parts of a record of a bench run that the coverage reads. */
export interface CoverageRecord {
  readonly strategy: string;
  readonly input: string;
  readonly measures?: Readonly<Record<string, unknown>>;
  readonly ms?: number;
  readonly skipped?: string;
}

/** The parts of the manifest `corpus.json` of a run that the coverage reads. */
export interface CoverageManifest {
  readonly corpus: string;
  readonly specs: readonly { readonly generator: string; readonly version?: number; readonly params?: Readonly<Record<string, unknown>>; readonly seeds: readonly number[] }[];
  readonly inputs?: readonly { readonly id: string; readonly cell?: Readonly<Record<string, unknown>> }[];
}

/** The dimensions of one input: its spec, its family and the value of each dimension. */
export interface InputDims {
  /** The id of the input without its seed. */
  readonly spec: string;
  /** The generator and its version, for example `rect-grid@2`. */
  readonly family: string;
  /** The value of each dimension, as text. The dimension `family` is in it. */
  readonly dims: Readonly<Record<string, string>>;
  /** The names of the params of the spec. They make the cells of the family. */
  readonly params: readonly string[];
}

/** This function gives a value as text. An object gives its JSON text. */
const textOf = (v: unknown): string => (typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

/**
 * This function gives the dimensions of each input of a manifest, by input id. The inputs of a manifest come in the
 * order of the specs and their seeds. The dimensions are the cell of the input, the family and the params of its spec.
 * The function throws an `Error` when the manifest has no inputs or when an input does not agree with its spec.
 */
export function inputDims(manifest: CoverageManifest): Map<string, InputDims> {
  const inputs = manifest.inputs ?? [];
  if (inputs.length === 0) throw new Error("The corpus file has no inputs. Use the file corpus.json of the run.");
  const out = new Map<string, InputDims>();
  let at = 0;
  for (const spec of manifest.specs) {
    const family = `${spec.generator}@${spec.version ?? 1}`;
    const params = Object.keys(spec.params ?? {});
    for (const seed of spec.seeds) {
      const input = inputs[at++];
      if (input === undefined || !input.id.endsWith(`/s${seed}`)) throw new Error(`The input ${at} of the corpus file is not the seed ${seed} of the spec ${family}.`);
      const dims: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.cell ?? {})) dims[k] = textOf(v);
      dims["family"] = family;
      for (const [k, v] of Object.entries(spec.params ?? {})) dims[k] = textOf(v);
      out.set(input.id, { spec: input.id.slice(0, input.id.lastIndexOf("/")), family, dims, params });
    }
  }
  if (at !== inputs.length) throw new Error(`The corpus file has ${inputs.length} inputs, but its specs have ${at} seeds.`);
  return out;
}

/** The name of each named config of `packSpace`, by its `configId`. The first name of an id wins. */
const NAME_OF: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [name, config] of Object.entries(packSpace.named ?? {})) {
    const id = configId(packSpace, config);
    if (!out.has(id)) out.set(id, name);
  }
  return out;
})();

/** The stages of a base config, in the order of the pipeline. */
const BASE_STAGES: readonly string[] = ["order", "size-search", "placement", "local-search"];

/** This function adds the option and the params of each base stage of a config to the features. */
function addStages(out: Record<string, string>, config: StrategyConfig): void {
  for (const stage of BASE_STAGES) {
    const c = config.stages[stage];
    if (c === null || c === undefined) continue;
    out[`stage.${stage}`] = c.option;
    for (const [p, v] of Object.entries(c.params ?? {})) out[`${stage}.${c.option}.${p}`] = textOf(v);
  }
}

/**
 * This function gives the features of a strategy entry, from its named config in `packSpace`.
 *
 * - The feature `stage.combine` is the meta option, or `none`. Each param of the meta option is a feature `combine.<option>.<param>`.
 * - The feature `stage.<stage>` is the option of a base stage. Each param of the option is a feature `<stage>.<option>.<param>`.
 * - A config with one member, or with no meta option, gives the option and the params of each base stage.
 * - A config with more members gives the feature `combine.members`: the names of the members.
 * - An entry that is not a named config gives only the feature `strategy`.
 */
export function strategyFeatures(strategy: string): Record<string, string> {
  const named = packSpace.named?.[strategy];
  if (named === undefined) return { strategy };
  const c = canonicalConfig(packSpace, named);
  const out: Record<string, string> = {};
  const combine = c.stages["combine"];
  out["stage.combine"] = combine?.option ?? "none";
  if (combine === null || combine === undefined) {
    addStages(out, c);
    return out;
  }
  for (const [p, v] of Object.entries(combine.params ?? {})) out[`combine.${combine.option}.${p}`] = textOf(v);
  const members = combine.members ?? [];
  if (members.length === 1) addStages(out, members[0]!);
  else out["combine.members"] = members.map((m) => NAME_OF.get(configId(packSpace, m)) ?? configId(packSpace, m)).join(",");
  return out;
}

// ---- The table of the features ----

/** One feature of the table: its name, its group, its levels and its kind. */
export interface Feature {
  readonly name: string;
  readonly group: "strategy" | "input";
  /** The levels, in their order. An ordinal feature has its numbers from low to high. */
  readonly levels: readonly string[];
  /** The value `true` for a feature with 3 numeric levels or more, and no absent value. A split of it is a threshold. */
  readonly ordinal: boolean;
  /** The bin of each level, for the indices and the cells. A feature with more than 8 numeric levels gets 4 bins. */
  readonly bins: readonly number[];
  /** The count of the bins. */
  readonly binCount: number;
}

/** The largest count of numeric levels with one bin for each level. */
const MAX_LEVEL_BINS = 8;

/** The count of the bins of a numeric feature with more levels. */
const QUANTILE_BINS = 4;

/** This function gives a feature from its name, its group and the text values of its rows. */
export function featureOf(name: string, group: Feature["group"], values: readonly string[]): Feature {
  const set = [...new Set(values)];
  const numeric = set.length >= 3 && set.every((v) => v !== ABSENT && v.trim() !== "" && Number.isFinite(Number(v)));
  const levels = numeric ? set.sort((a, b) => Number(a) - Number(b)) : set.sort();
  const many = numeric && levels.length > MAX_LEVEL_BINS;
  const bins = levels.map((_, i) => (many ? Math.floor((i * QUANTILE_BINS) / levels.length) : i));
  return { name, group, levels, ordinal: numeric, bins, binCount: many ? QUANTILE_BINS : levels.length };
}

/** The table of the rows of one measure: the features, the level index of each row and the value of each row. */
export interface FeatureTable {
  readonly features: readonly Feature[];
  /** The level index of each row, one column for each feature. */
  readonly columns: readonly Int32Array[];
  readonly y: Float64Array;
}

/** This function makes the table of rows from the text features and the values. A feature with one level is not in the table. */
export function featureTable(rows: readonly { readonly features: Readonly<Record<string, string>>; readonly group: Readonly<Record<string, Feature["group"]>> }[], y: readonly number[]): FeatureTable {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.features)))].sort();
  const features: Feature[] = [];
  const columns: Int32Array[] = [];
  for (const name of names) {
    const values = rows.map((r) => r.features[name] ?? ABSENT);
    const group = rows.find((r) => r.group[name] !== undefined)?.group[name] ?? "input";
    const f = featureOf(name, group, values);
    if (f.levels.length < 2) continue;
    const index = new Map(f.levels.map((l, i) => [l, i]));
    features.push(f);
    columns.push(Int32Array.from(values, (v) => index.get(v)!));
  }
  return { features, columns, y: Float64Array.from(y) };
}

// ---- The regression tree ----

/** A node of a regression tree: a leaf with its value, or a split with its two children. */
export type TreeNode =
  | { readonly value: number }
  | { readonly feature: number; readonly ordinal: boolean; readonly level: number; readonly yes: TreeNode; readonly no: TreeNode };

/** The limits of a regression tree. */
export interface TreeOptions {
  /** The largest depth. The default is 12. */
  readonly maxDepth?: number;
  /** The smallest count of rows in a leaf. The default is 3. */
  readonly minLeaf?: number;
}

/** The default limits of the tree. */
export const TREE_DEFAULTS: Required<TreeOptions> = Object.freeze({ maxDepth: 12, minLeaf: 3 });

/** This function gives the median of some values. No value gives 0. */
export function medianOf(values: ArrayLike<number>): number {
  const v = Array.from(values).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** This function tells if a row goes to the side `yes` of a split. */
const goesYes = (ordinal: boolean, split: number, level: number): boolean => (ordinal ? level <= split : level === split);

/**
 * This function fits a regression tree on some rows of a table. Each split takes the largest drop of the sum of squared
 * errors. A categorical split tests one level, and an ordinal split tests a threshold. A leaf gives the median of its
 * rows. An equal drop goes to the first feature and the first level, so the tree is the same for the same rows.
 */
export function fitTree(table: FeatureTable, rows: readonly number[], options: TreeOptions = {}): TreeNode {
  const { maxDepth, minLeaf } = { ...TREE_DEFAULTS, ...options };
  const { y, columns, features } = table;
  const grow = (idx: readonly number[], depth: number): TreeNode => {
    const leaf = { value: medianOf(idx.map((i) => y[i]!)) };
    if (depth >= maxDepth || idx.length < 2 * minLeaf) return leaf;
    let sum = 0;
    let sq = 0;
    for (const i of idx) {
      sum += y[i]!;
      sq += y[i]! * y[i]!;
    }
    const n = idx.length;
    const total = sq - (sum * sum) / n;
    if (!(total > 1e-12)) return leaf;
    let best = { gain: total * 1e-9, feature: -1, level: -1 };
    for (let f = 0; f < features.length; f++) {
      const L = features[f]!.levels.length;
      const col = columns[f]!;
      const cn = new Float64Array(L);
      const cs = new Float64Array(L);
      const cq = new Float64Array(L);
      for (const i of idx) {
        const l = col[i]!;
        cn[l]!++;
        cs[l]! += y[i]!;
        cq[l]! += y[i]! * y[i]!;
      }
      const sse = (k: number, s: number, q: number): number => (k === 0 ? 0 : q - (s * s) / k);
      let an = 0;
      let as = 0;
      let aq = 0;
      for (let l = 0; l < L - (features[f]!.ordinal ? 1 : 0); l++) {
        if (features[f]!.ordinal) {
          an += cn[l]!;
          as += cs[l]!;
          aq += cq[l]!;
        } else {
          an = cn[l]!;
          as = cs[l]!;
          aq = cq[l]!;
        }
        if (an < minLeaf || n - an < minLeaf) continue;
        const gain = total - sse(an, as, aq) - sse(n - an, sum - as, sq - aq);
        if (gain > best.gain) best = { gain, feature: f, level: l };
      }
    }
    if (best.feature < 0) return leaf;
    const col = columns[best.feature]!;
    const ordinal = features[best.feature]!.ordinal;
    const yes = idx.filter((i) => goesYes(ordinal, best.level, col[i]!));
    const no = idx.filter((i) => !goesYes(ordinal, best.level, col[i]!));
    return { feature: best.feature, ordinal, level: best.level, yes: grow(yes, depth + 1), no: grow(no, depth + 1) };
  };
  return grow(rows, 0);
}

/** This function gives the value of a tree for one row of a table. */
export function predictTree(tree: TreeNode, table: FeatureTable, row: number): number {
  let node = tree;
  while (!("value" in node)) node = goesYes(node.ordinal, node.level, table.columns[node.feature]![row]!) ? node.yes : node.no;
  return node.value;
}

// ---- The folds and the indices ----

/** This function gives a random number generator of 32 bits from a seed, with values from 0 to 1. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function gives the fold of each unit: the units, sorted and then shuffled with the seed, go to the folds in turn. */
export function foldsOf(units: Iterable<string>, folds: number, seed: number): Map<string, number> {
  const list = [...new Set(units)].sort();
  const rand = mulberry32(seed);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return new Map(list.map((u, i) => [u, i % folds]));
}

/**
 * This function gives the first-order index of a grouping of the values: the variance of the means of the groups over the
 * total variance. The value is from 0 to 1. Values with no variance give 0.
 */
export function firstOrderIndex(y: ArrayLike<number>, groupOf: (row: number) => string | number): number {
  const n = y.length;
  if (n === 0) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i]!;
  mean /= n;
  let total = 0;
  const groups = new Map<string | number, { n: number; s: number }>();
  for (let i = 0; i < n; i++) {
    total += (y[i]! - mean) ** 2;
    const k = groupOf(i);
    const g = groups.get(k) ?? { n: 0, s: 0 };
    g.n++;
    g.s += y[i]!;
    groups.set(k, g);
  }
  if (!(total > 1e-12)) return 0;
  let between = 0;
  for (const g of groups.values()) between += g.n * (g.s / g.n - mean) ** 2;
  return Math.min(1, between / total);
}

// ---- The coverage ----

/** The statistics of the absolute errors of a set of predictions. */
export interface ErrorStats {
  /** The mean absolute error. */
  readonly mae: number;
  /** The median absolute error. */
  readonly medianAe: number;
  /** The share of the rows with an absolute error at the tolerance or below. */
  readonly withinTolerance: number;
}

/** The first-order index of one feature. */
export interface FeatureIndex {
  readonly feature: string;
  readonly group: Feature["group"];
  readonly index: number;
}

/** The coverage of one measure. */
export interface MeasureCoverage {
  readonly id: string;
  readonly scale: CoverageMeasure["scale"];
  readonly tolerance: number;
  /** The count of the measured records with a finite value. */
  readonly n: number;
  /** The held-out error of the model. */
  readonly model: ErrorStats;
  /** The held-out error of the baseline: the median of the training rows. */
  readonly baseline: ErrorStats;
  /** One less the ratio of the two mean errors. The value 1 is a perfect model, 0 is no better than the baseline. `null` when the baseline error is 0. */
  readonly skill: number | null;
  /** The first-order indices of the strategy entry, of the spec of the input and of the two together. */
  readonly explained: { readonly strategy: number; readonly input: number; readonly joint: number };
  /** One less the joint index: the share of the variance between the seeds of one spec and one strategy. No feature explains it. */
  readonly noise: number;
  /** The first-order index of each feature, highest first. */
  readonly indices: readonly FeatureIndex[];
  /** The counts of the cells: the cells of the space, the cells with records and the covered cells. */
  readonly cells: { readonly space: number; readonly withRecords: number; readonly covered: number };
  /** The covered cells over the cells of the space. */
  readonly share: number;
  /** The covered cells over the cells with records. */
  readonly shareOfMeasured: number;
}

/** The unit of a fold: an input, or a spec with all its seeds. */
export type FoldUnit = "input" | "spec";

/** The options of `coverage`. */
export interface CoverageOptions extends TreeOptions {
  readonly measures?: readonly CoverageMeasure[];
  /** The count of the folds. The default is 5. */
  readonly folds?: number;
  /** The seed of the folds. The default is 1. */
  readonly seed?: number;
  /** The unit of a fold. The default is `input`. */
  readonly by?: FoldUnit;
  /** The date of the summary, as `YYYY-MM-DD`. */
  readonly date?: string;
  /** The id of the CI run, or `null`. */
  readonly run?: number | null;
}

/** The summary of `coverage`, schema `packing-coverage/1`. */
export interface CoverageSummary {
  readonly schema: typeof COVERAGE_SCHEMA;
  readonly date: string;
  readonly run: number | null;
  readonly corpus: string;
  /** The count of the measured records. */
  readonly records: number;
  readonly inputs: number;
  readonly strategies: readonly string[];
  /** The names of the features that change, by group. */
  readonly features: { readonly strategy: readonly string[]; readonly input: readonly string[] };
  readonly model: { readonly kind: "regression-tree"; readonly maxDepth: number; readonly minLeaf: number; readonly folds: number; readonly seed: number; readonly by: FoldUnit };
  readonly measures: readonly MeasureCoverage[];
}

/** This function rounds a value to 4 decimals. The value -0 becomes 0. */
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4 + 0;

/** This function gives the statistics of some absolute errors. */
function errorStats(errors: readonly number[], tolerance: number): ErrorStats {
  const n = errors.length;
  if (n === 0) return { mae: 0, medianAe: 0, withinTolerance: 0 };
  const within = errors.filter((e) => e <= tolerance + 1e-12).length;
  return { mae: r4(errors.reduce((s, e) => s + e, 0) / n), medianAe: r4(medianOf(errors)), withinTolerance: r4(within / n) };
}

/** This function gives the value of a record for a measure on its scale, or `undefined` when the record has no finite value. */
function valueOf(r: CoverageRecord, m: CoverageMeasure): number | undefined {
  const raw = m.id === "ms" ? r.ms : r.measures?.[m.id];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return m.scale === "log" ? Math.log10(Math.max(raw, LOG_FLOOR)) : raw;
}

/**
 * This function gives the coverage of the records of a run over the inputs of its manifest. For each measure:
 *
 * 1. It fits a regression tree on the features of the strategy and of the input, in k folds by input or by spec.
 * 2. It compares the held-out error of the tree with the held-out error of the median of the training rows.
 * 3. It gives the first-order index of each feature, over all the rows.
 * 4. A cell is a strategy, a family and a bin of each param of the family. The model covers a cell when the held-out mean error of the cell is at the tolerance or below.
 *
 * A skipped record and a record of an input that is not in the manifest are not rows.
 */
export function coverage(records: readonly CoverageRecord[], manifest: CoverageManifest, options: CoverageOptions = {}): CoverageSummary {
  const measures = options.measures ?? COVERAGE_MEASURES;
  const folds = options.folds ?? 5;
  const seed = options.seed ?? 1;
  const by = options.by ?? "input";
  const tree = { ...TREE_DEFAULTS, ...options };
  const dims = inputDims(manifest);
  const measured = records.filter((r) => r.skipped === undefined && dims.has(r.input));
  const strategies = [...new Set(measured.map((r) => r.strategy))].sort();
  const sFeatures = new Map(strategies.map((s) => [s, strategyFeatures(s)]));
  const foldOf = foldsOf([...dims.entries()].map(([id, d]) => (by === "spec" ? d.spec : id)), folds, seed);

  // The space of the cells: each strategy with each family, and the product of the bins of the params of the family.
  const familyParams = new Map<string, Map<string, Set<string>>>();
  for (const d of dims.values()) {
    const params = familyParams.get(d.family) ?? new Map<string, Set<string>>();
    for (const p of d.params) params.set(p, (params.get(p) ?? new Set()).add(d.dims[p]!));
    familyParams.set(d.family, params);
  }

  const out: MeasureCoverage[] = [];
  const seen = { strategy: new Set<string>(), input: new Set<string>() };
  for (const m of measures) {
    const rows: { r: CoverageRecord; d: InputDims; v: number }[] = [];
    for (const r of measured) {
      const v = valueOf(r, m);
      if (v !== undefined) rows.push({ r, d: dims.get(r.input)!, v });
    }
    const table = featureTable(
      rows.map(({ r, d }) => {
        const sf = sFeatures.get(r.strategy)!;
        const group: Record<string, Feature["group"]> = {};
        for (const k of Object.keys(d.dims)) group[k] = "input";
        for (const k of Object.keys(sf)) {
          if (group[k] !== undefined) throw new Error(`The feature ${k} of the strategy ${r.strategy} is also a dimension of the input.`);
          group[k] = "strategy";
        }
        return { features: { ...d.dims, ...sf }, group };
      }),
      rows.map((x) => x.v),
    );
    for (const f of table.features) seen[f.group].add(f.name);

    // The held-out predictions of the tree and of the baseline
    const unit = rows.map(({ r, d }) => foldOf.get(by === "spec" ? d.spec : r.input)!);
    const pred = new Float64Array(rows.length);
    const base = new Float64Array(rows.length);
    for (let k = 0; k < folds; k++) {
      const train: number[] = [];
      const test: number[] = [];
      for (let i = 0; i < rows.length; i++) (unit[i] === k ? test : train).push(i);
      if (test.length === 0) continue;
      const fitted = fitTree(table, train, tree);
      const median = medianOf(train.map((i) => table.y[i]!));
      for (const i of test) {
        pred[i] = train.length === 0 ? 0 : predictTree(fitted, table, i);
        base[i] = median;
      }
    }
    const errors = rows.map((x, i) => Math.abs(pred[i]! - x.v));
    const model = errorStats(errors, m.tolerance);
    const baseline = errorStats(
      rows.map((x, i) => Math.abs(base[i]! - x.v)),
      m.tolerance,
    );

    // The first-order indices
    const indices: FeatureIndex[] = table.features
      .map((f, j) => ({ feature: f.name, group: f.group, index: r4(firstOrderIndex(table.y, (i) => f.bins[table.columns[j]![i]!]!)) }))
      .sort((a, b) => b.index - a.index || a.feature.localeCompare(b.feature));
    const joint = firstOrderIndex(table.y, (i) => `${rows[i]!.r.strategy}|${rows[i]!.d.spec}`);
    const explained = {
      strategy: r4(firstOrderIndex(table.y, (i) => rows[i]!.r.strategy)),
      input: r4(firstOrderIndex(table.y, (i) => rows[i]!.d.spec)),
      joint: r4(joint),
    };

    // The cells
    const binOf = new Map(table.features.map((f) => [f.name, new Map(f.levels.map((l, i) => [l, f.bins[i]!]))]));
    const binText = (name: string, value: string): string => String(binOf.get(name)?.get(value) ?? 0);
    const cellKey = (strategy: string, d: InputDims): string => [strategy, d.family, ...d.params.map((p) => `${p}=${binText(p, d.dims[p]!)}`)].join("|");
    const cellErrors = new Map<string, number[]>();
    rows.forEach((x, i) => {
      const key = cellKey(x.r.strategy, x.d);
      const list = cellErrors.get(key) ?? [];
      list.push(errors[i]!);
      cellErrors.set(key, list);
    });
    let space = 0;
    for (const params of familyParams.values()) {
      let product = 1;
      for (const [p, values] of params) product *= new Set([...values].map((v) => binText(p, v))).size;
      space += product * strategies.length;
    }
    let covered = 0;
    for (const list of cellErrors.values()) if (list.reduce((s, e) => s + e, 0) / list.length <= m.tolerance + 1e-12) covered++;
    const withRecords = cellErrors.size;
    out.push({
      id: m.id,
      scale: m.scale,
      tolerance: m.tolerance,
      n: rows.length,
      model,
      baseline,
      skill: baseline.mae === 0 ? null : r4(1 - model.mae / baseline.mae),
      explained,
      noise: r4(1 - joint),
      indices,
      cells: { space, withRecords, covered },
      share: space === 0 ? 0 : r4(covered / space),
      shareOfMeasured: withRecords === 0 ? 0 : r4(covered / withRecords),
    });
  }
  return {
    schema: COVERAGE_SCHEMA,
    date: options.date ?? new Date().toISOString().slice(0, 10),
    run: options.run ?? null,
    corpus: manifest.corpus,
    records: measured.length,
    inputs: dims.size,
    strategies,
    features: { strategy: [...seen.strategy].sort(), input: [...seen.input].sort() },
    model: { kind: "regression-tree", maxDepth: tree.maxDepth, minLeaf: tree.minLeaf, folds, seed, by },
    measures: out,
  };
}

// ---- The command line ----

/** This function gives the records of the text of a `records.jsonl` file. An empty line is not a record. */
export function readRecords(text: string): CoverageRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as CoverageRecord);
}

/** This function gives the value of an option of the command line, or `undefined`. */
const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

/** This function gives the options of `coverage` from the command line. It throws an `Error` for a bad value. */
export function coverageOptions(argv: readonly string[]): CoverageOptions {
  const run = optionOf(argv, "--run");
  const date = optionOf(argv, "--date");
  const folds = Number(optionOf(argv, "--folds") ?? 5);
  const seed = Number(optionOf(argv, "--seed") ?? 1);
  const by = optionOf(argv, "--by") ?? "input";
  if (run !== undefined && !Number.isInteger(Number(run))) throw new Error(`The option --run is a whole number, not ${run}.`);
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`The option --date is YYYY-MM-DD, not ${date}.`);
  if (!Number.isInteger(folds) || folds < 2) throw new Error("The option --folds is a whole number of 2 or more.");
  if (!Number.isInteger(seed)) throw new Error("The option --seed is a whole number.");
  if (by !== "input" && by !== "spec") throw new Error(`The option --by is input or spec, not ${by}.`);
  return { folds, seed, by, ...(run === undefined ? {} : { run: Number(run) }), ...(date === undefined ? {} : { date }) };
}

/** This function starts the coverage from the arguments of the command line. It writes the summary and shows one line for each measure. */
export function coverageMain(argv: readonly string[]): CoverageSummary {
  const records = optionOf(argv, "--records");
  const corpusFile = optionOf(argv, "--corpus");
  const out = optionOf(argv, "--out");
  if (records === undefined || corpusFile === undefined || out === undefined) throw new Error("Start the coverage with: node bench/coverage.ts --records <file> --corpus <file> --out <file>");
  const manifest = JSON.parse(readFileSync(corpusFile, "utf8")) as CoverageManifest;
  const summary = coverage(readRecords(readFileSync(records, "utf8")), manifest, coverageOptions(argv));
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 1)}\n`);
  for (const m of summary.measures) {
    const top = m.indices.slice(0, 3).map((x) => `${x.feature} ${x.index}`).join(", ");
    console.log(`${m.id}: error ${m.model.mae} against ${m.baseline.mae}, share ${m.share} (${m.cells.covered} of ${m.cells.space} cells), top ${top}`);
  }
  return summary;
}

if (process.argv[1]?.endsWith("coverage.ts") === true) coverageMain(process.argv.slice(2));
