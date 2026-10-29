// The snapshot files of the site, in `packages/site/data/`. The script `packages/packing/bench/snapshot.ts` writes them
// from the records of CI runs. The pages read only these files, at build time.

/** The schema of each snapshot file */
export const SNAPSHOT_SCHEMA = "packing-site-snapshot/1";

/** The origin of the data of a snapshot */
export interface Origin {
  release: string;
  commit: string;
  date: string;
  /** The id of the CI run, or `null` for data from the repository only */
  run: number | null;
  source: string;
}

/** A mean with its interval */
export interface Interval {
  mean: number;
  lo: number;
  hi: number;
}

/** The labels of a verdict over families, and the label of a strategy without a pair */
export type Label = "better" | "worse" | "depends on the mix" | "no verdict" | "not measured";

/** The verdict of one measure of one strategy against the baseline */
export interface MeasureVerdict {
  measure: string;
  direction: "higher" | "lower";
  label: Label;
  summary: string;
  n: number;
  families: number;
  stratified?: Interval;
  pooled?: Interval;
  p?: number;
  signs?: { wins: number; losses: number; ties: number };
  means?: { a: number; b: number };
}

/** One strategy of a strategy snapshot */
export interface StrategySummary {
  strategy: string;
  records: number;
  skipped: number;
  msMedian: number | null;
  hardBreaks: number;
  verdicts: MeasureVerdict[];
  groups: { group: string; wins: number; losses: number; ties: number }[];
}

/** The strategy snapshot of one corpus */
export interface StrategySnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "strategies";
  corpus: string;
  origin: Origin[];
  baseline: string;
  level: number;
  inputs: number;
  families: number;
  measures: { id: string; direction: "higher" | "lower"; tie: number | { rel: number } }[];
  strategies: StrategySummary[];
}

/** A group of a paired time test */
export interface PairedGroup {
  inputs: number;
  medianRatio: number;
  medianMsA: number;
  medianMsB: number;
}

/** The snapshot of a paired time test */
export interface PairedSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "paired";
  corpus: string;
  strategy: string;
  prediction: string;
  repeats: number;
  origin: Origin[];
  arms: { a: string; b: string };
  inputs: number;
  errors: number;
  hashesEqual: number;
  slow: PairedGroup & { maxMsA: number; maxMsB: number };
  other: PairedGroup;
  classes: (PairedGroup & { name: string })[];
}

/** One leaf of the select snapshot */
export interface SelectLeaf {
  leaf: number;
  pick: number;
  member: string;
  path: { feature: string; test: string; yes: boolean }[];
  train: { wins: number; of: number };
  test: { corpus: string; wins: number; of: number }[];
}

/** The snapshot of the select table */
export interface SelectSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "select";
  origin: Origin[];
  members: string[];
  winRatio: number;
  leaves: SelectLeaf[];
}

/** One release of the list of the releases */
export interface Release {
  release: string;
  date: string;
  title: string;
  breaking: boolean;
  commit: string;
  pr: number | null;
  link: string;
}

/** The snapshot of the releases */
export interface ReleasesSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "releases";
  origin: Origin[];
  releases: Release[];
}

/** The statistics of a gap measure: the count, the quartiles and the count of the values below 0 */
export interface GapStats {
  n: number;
  q1: number;
  median: number;
  q3: number;
  below0: number;
}

/** One cell of one strategy in a gap snapshot */
export interface GapCell extends GapStats {
  cell: string;
  missing: number;
  /** The count of the records of each kind of bound. Only `pack.gap` has kinds. */
  kinds?: Record<string, number>;
}

/** One strategy of a gap snapshot */
export interface GapStrategy {
  strategy: string;
  records: number;
  all: GapStats & { missing: number };
  cells: GapCell[];
}

/** The gap snapshot of one corpus: the distance of each result from a bound or from the known best value */
export interface GapSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "gaps";
  corpus: string;
  origin: Origin[];
  measure: "pack.gap" | "pack.gapToOpt";
  inputs: number;
  cells: { cell: string; inputs: number }[];
  strategies: GapStrategy[];
}

/** One measure of the coverage snapshot: the held-out error of the model, the share of the cells and the top indices */
export interface CoverageMeasure {
  id: string;
  scale: "linear" | "log";
  tolerance: number;
  n: number;
  mae: number;
  baselineMae: number;
  medianAe: number;
  baselineMedianAe: number;
  skill: number | null;
  share: number;
  shareOfMeasured: number;
  /** The errors and the share of the folds by input, a less strict test */
  byInput?: { mae: number; medianAe: number; share: number };
  /** The held-out test on the sampled pairs of the whole space (k112): the share, its Wilson 95% interval and the errors */
  sampled?: CoverageSampled;
  /** The same test by stratum (k115): the mean over the strata with the same weight, and each stratum */
  strata?: CoverageStrata;
  /** The rounds of the active sample (k116), when the snapshot has them */
  active?: CoverageActive;
  cells: { space: number; withRecords: number; covered: number };
  explained: { strategy: number; input: number; joint: number };
  noise: number;
  indices: { feature: string; group: "strategy" | "input"; index: number }[];
}

/** The held-out result of one measure on the sampled pairs of the whole space */
export interface CoverageSampled {
  n: number;
  hits: number;
  share: number;
  /** The low end of the Wilson 95% interval of the share */
  low: number;
  /** The high end of the Wilson 95% interval of the share */
  high: number;
  mae: number;
  medianAe: number;
  baselineMae: number;
  baselineMedianAe: number;
  /** The share of the pairs with much forced overflow, and of the other pairs (k116) */
  forced?: { heavy: CoveragePart; rest: CoveragePart };
  /** The share with the family prior of the corpus (k116). A snapshot from before k116 does not have it. */
  prior?: CoveragePrior;
}

/** The share of the sampled pairs with the family prior: each generator family has its share of the inputs of the corpus as its weight */
export interface CoveragePrior {
  /** The share with the weights, or `null` without a pair of a family of the corpus */
  share: number | null;
  low: number | null;
  high: number | null;
  /** The effective count of the pairs */
  nEff: number;
  /** The pairs of a family of the corpus, and the pairs of other families with the weight 0 */
  weighted: number;
  zero: number;
  /** The weight of the families of the corpus with pairs */
  covered: number;
}

/** The share of a part of the sampled pairs. A part without pairs has the share `null`. */
export interface CoveragePart {
  n: number;
  hits: number;
  share: number | null;
}

/** The evaluation sample with one model: the share, the mean absolute error and the mean over the strata with the same weight */
export interface CoverageEval {
  share: number;
  mae: number;
  equal: number;
  /** The share with the family prior, when the snapshot has it */
  prior?: number | null;
}

/** One round of the active sample for one measure: the hits of its new pairs, and the evaluation sample after the round */
export interface CoverageActiveRound {
  round: number;
  n: number;
  hits: number;
  share: number;
  low: number;
  high: number;
  mae: number;
  /** The share of the new pairs with the family prior, when the snapshot has it */
  prior?: number | null;
  after: CoverageEval | null;
}

/** The rounds of the active sample for one measure (k116) */
export interface CoverageActive {
  /** The evaluation sample with the model of the grid only */
  start: CoverageEval | null;
  rounds: CoverageActiveRound[];
}

/** One stratum of the sample for one measure: its pairs, its hits, its share and the Wilson 95% interval */
export interface CoverageStratum {
  /** The id `<family>:<size>`, for example `portfolio:3` */
  stratum: string;
  n: number;
  hits: number;
  /** The share and its interval. A stratum without pairs has `null`, not 0. An older snapshot has 0. */
  share: number | null;
  low: number | null;
  high: number | null;
}

/** One stratum of the sample: its measured pairs and, for a stratified sample, its count of configs and of missed pairs */
export interface CoverageStratumPairs {
  id: string;
  pairs: number;
  /** The exact count of the configs of the stratum, as decimal text */
  configs?: string;
  /** The pairs of the stratum that found no input and config */
  missed?: number;
}

/** The held-out result of one measure by stratum: the mean over the strata with the same weight, its 95% interval and each stratum */
export interface CoverageStrata {
  share: number;
  low: number;
  high: number;
  /** The count of the strata with pairs */
  strata: number;
  rows: CoverageStratum[];
}

/** One point of the trend of the coverage */
export interface CoveragePoint {
  date: string;
  run: number | null;
  corpus: string;
  commit: string;
  shares: Record<string, number>;
  sharesByInput?: Record<string, number>;
}

/** The snapshot of the space coverage of k105: the last summary and the trend of the shares, oldest first */
export interface CoverageSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "coverage";
  origin: Origin[];
  latest: {
    date: string;
    run: number | null;
    corpus: string;
    records: number;
    inputs: number;
    strategies: string[];
    /** The model. `features` (k116) is the feature set of the inputs. An older snapshot has no `features`, which is `family`. */
    model: { kind: string; maxDepth: number; minLeaf: number; folds: number; seed: number; by: "input" | "spec"; features?: "family" | "input" };
    measures: CoverageMeasure[];
    /** The facts of the sample of the whole space (k112), when the snapshot has it */
    sampled?: { pairs: number; seed: number | null; draw: string | null; configRejectionRate: number | null; hardPairs: number | null };
    /** The facts of the strata of the sample (k115), when the snapshot has them */
    strata?: { pairs: number; draw: string | null; strata: CoverageStratumPairs[] };
    /** The last sample with a uniform draw (k115), with its run and its date. A stratified run keeps it. */
    uniform?: CoverageUniform;
    /** The facts of the active sample (k116), when the snapshot has them */
    active?: { pairs: number; features: string; score: string | null; pool: number | null; rounds: number; evalPairs: number | null };
  };
  trend: CoveragePoint[];
}

/** The last sample of the whole space with a uniform draw: its run, its facts and the result of each measure */
export interface CoverageUniform {
  date: string;
  run: number | null;
  commit: string;
  pairs: number;
  seed: number | null;
  configRejectionRate: number | null;
  hardPairs: number | null;
  measures: Record<string, CoverageSampled>;
}

/** Each kind of snapshot */
export type Snapshot = StrategySnapshot | PairedSnapshot | SelectSnapshot | ReleasesSnapshot | GapSnapshot | CoverageSnapshot;

/** This function tells if a value is a plain object. */
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** This function tells if a value is a valid origin. */
function isOrigin(v: unknown): v is Origin {
  return (
    isObject(v) &&
    typeof v["release"] === "string" &&
    /^\d+\.\d+\.\d+$/.test(v["release"]) &&
    typeof v["commit"] === "string" &&
    /^[0-9a-f]{7}$/.test(v["commit"]) &&
    typeof v["date"] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v["date"]) &&
    (v["run"] === null || Number.isInteger(v["run"])) &&
    typeof v["source"] === "string"
  );
}

/**
 * This function parses the text of a snapshot file of one kind. It throws an `Error` for a text of another kind.
 * It also throws when an origin has no release, commit, date, run or source.
 */
export function parseSnapshot<K extends Snapshot["kind"]>(text: string, kind: K): Extract<Snapshot, { kind: K }> {
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value["schema"] !== SNAPSHOT_SCHEMA) throw new Error(`A snapshot has the schema ${SNAPSHOT_SCHEMA}.`);
  if (value["kind"] !== kind) throw new Error(`The snapshot has the kind ${String(value["kind"])}, not ${kind}.`);
  const origin = value["origin"];
  if (!Array.isArray(origin) || origin.length === 0 || !origin.every(isOrigin)) throw new Error("Each origin of a snapshot has a release, a commit, a date, a run and a source.");
  const lists: Record<Snapshot["kind"], unknown> = { strategies: value["strategies"], gaps: value["strategies"], paired: value["classes"], select: value["leaves"], releases: value["releases"], coverage: value["trend"] };
  const list = lists[kind];
  if (!Array.isArray(list) || list.length === 0) throw new Error(`The snapshot of the kind ${kind} has no entries.`);
  return value as unknown as Extract<Snapshot, { kind: K }>;
}

/** This function groups the releases by date, with the newest date first. The order in a date stays. */
export function byDate(releases: readonly Release[]): [string, Release[]][] {
  const groups = new Map<string, Release[]>();
  for (const r of releases) {
    const list = groups.get(r.date);
    if (list === undefined) groups.set(r.date, [r]);
    else list.push(r);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a));
}

/** One entry of the news that is not a release: a roadmap item that adds a measure or a part of the site */
export interface NewsEntry {
  date: string;
  /** The id of the roadmap item, for example `k51` */
  item: string;
  title: string;
  pr: number;
  link: string;
}

/** The news that is not a release, newest first. A release of the package comes from `releases.json`. */
export const NEWS: readonly NewsEntry[] = [
  {
    date: "2026-10-29",
    item: "k26",
    title: "The new strategies `anneal`, `genetic` and `tabu` search the order of the boxes. A member packs each order, and the result is never worse than the member.",
    pr: 159,
    link: "https://github.com/mark1russell7/packing/pull/159",
  },
  {
    date: "2026-10-29",
    item: "k116",
    title: "The space coverage has an active draw: each round measures the pairs where the model disagrees most. The model can also read features of the input itself.",
    pr: 154,
    link: "https://github.com/mark1russell7/packing/pull/154",
  },
  {
    date: "2026-10-29",
    item: "k80",
    title: "The new strategy `overlap-min` makes the strip of a member shorter. It moves the boxes that overlap to their places of least overlap, until no box overlaps.",
    pr: 157,
    link: "https://github.com/mark1russell7/packing/pull/157",
  },
  {
    date: "2026-10-29",
    item: "k115",
    title: "The space coverage gives the share of each stratum: a strategy family with one count of members. The mean over the strata goes next to the uniform number.",
    pr: 146,
    link: "https://github.com/mark1russell7/packing/pull/146",
  },
  {
    date: "2026-10-29",
    item: "k79",
    title: "The new strategy `ruin-recreate` removes some boxes of a layout and packs them again. A goal box that becomes smaller keeps the search moving.",
    pr: 152,
    link: "https://github.com/mark1russell7/packing/pull/152",
  },
  {
    date: "2026-10-29",
    item: "k117",
    title: "The composites `portfolio` and `restarts` take a work limit `budgetWork`: one unit is one box in one pack. A cut by it is the same on each computer.",
    pr: 148,
    link: "https://github.com/mark1russell7/packing/pull/148",
  },
  {
    date: "2026-10-29",
    item: "k23",
    title: "The new strategy `guillotine` keeps free rectangles that do not overlap. It has 6 rules to choose a free rectangle, 6 rules to cut it, and a merge.",
    pr: 145,
    link: "https://github.com/mark1russell7/packing/pull/145",
  },
  {
    date: "2026-10-29",
    item: "k47",
    title: "A seeded search finds the inputs where one strategy loses most to another. The corpus `pack-adversary-v1` has the worst input of 6 pairs.",
    pr: 143,
    link: "https://github.com/mark1russell7/packing/pull/143",
  },
  {
    date: "2026-10-29",
    item: "k111",
    title: "The measures `pack.anchor.*` move one locked item a small step and measure how far the other items move. The corpus `pack-anchor-v1` has 51 inputs.",
    pr: 140,
    link: "https://github.com/mark1russell7/packing/pull/140",
  },
  {
    date: "2026-10-29",
    item: "k108",
    title: "The survey is data: 60 ideas in `survey.json`, with 25 new ideas for online packing, bins, the knapsack and circles. The strategies page shows them.",
    pr: 138,
    link: "https://github.com/mark1russell7/packing/pull/138",
  },
  {
    date: "2026-10-29",
    item: "k112",
    title: "The space coverage also tests the model on random pairs of the whole space. Each measure shows the share of the bench grid and of the whole space.",
    pr: 133,
    link: "https://github.com/mark1russell7/packing/pull/133",
  },
  {
    date: "2026-10-29",
    item: "k114",
    title: "The knob `margin` does not go on a locked box when the margin goes into an obstacle. Thus each strategy packs `touchObstacles` with no `no-overlap` break.",
    pr: 136,
    link: "https://github.com/mark1russell7/packing/pull/136",
  },
  {
    date: "2026-10-29",
    item: "k90",
    title: "The strategy `hole-degree` packs circles by the maximum hole degree of Huang 2005. On 30 circles, its `pack.shapeFill` is 0.816, and `bbox-maxrects-bl` gives 0.692.",
    pr: 142,
    link: "https://github.com/mark1russell7/packing/pull/142",
  },
  {
    date: "2026-10-29",
    item: "k91",
    title: "With contract 0.2.17, `pack.shapeFill` declares an upper bound on a free shape. `checkShapes` accepts it there only at the level `bound`.",
    pr: 135,
    link: "https://github.com/mark1russell7/packing/pull/135",
  },
  {
    date: "2026-10-29",
    item: "k46",
    title: "The families `hopper-turton`, `burke-kendall-whitwell` and `beasley-gcut` make the published strip sets by their rules. The corpus `pack-strip-v1` has 528 inputs.",
    pr: 130,
    link: "https://github.com/mark1russell7/packing/pull/130",
  },
  {
    date: "2026-10-29",
    item: "k113",
    title: "The measures of a `bbox` output read the bounding box of each shape at its place. Thus `pack.fill` and `pack.shapeFill` stay from 0 to 1.",
    pr: 129,
    link: "https://github.com/mark1russell7/packing/pull/129",
  },
  {
    date: "2026-10-28",
    item: "k91",
    title: "With contract 0.2.16, the strategy space counts the `bbox` configs for shapes. The new measure `pack.shapeFill` gives the share of the hull that the shapes cover.",
    pr: 127,
    link: "https://github.com/mark1russell7/packing/pull/127",
  },
  {
    date: "2026-10-28",
    item: "k105",
    title: "The results page shows the space coverage: the share of the cells of strategies and inputs that a model predicts within a tolerance, for each measure.",
    pr: 124,
    link: "https://github.com/mark1russell7/packing/pull/124",
  },
  {
    date: "2026-10-28",
    item: "k107",
    title: "Four adversarial families break one rule each of `rows`, `skyline`, `maxrects-bl` and the sort by area. The corpus `pack-worst-v1` has 342 inputs.",
    pr: 125,
    link: "https://github.com/mark1russell7/packing/pull/125",
  },
  {
    date: "2026-10-28",
    item: "k22",
    title: "The strategy `skyline` gets the rule `mw` (minimum waste), a waste map and `rotate`. The default rule `bl` gives the same outputs as before.",
    pr: 119,
    link: "https://github.com/mark1russell7/packing/pull/119",
  },
  {
    date: "2026-10-28",
    item: "k91",
    title: "The strategy `bbox` packs circles and polygons by their bounding boxes with one member. It is the first strategy for each shape kind.",
    pr: 118,
    link: "https://github.com/mark1russell7/packing/pull/118",
  },
  {
    date: "2026-10-28",
    item: "k106",
    title: "The families `berkey-wang` and `martello-vigo` make the classes `I` to `X` of the literature by their rules. The corpus `pack-classes-v1` has 500 inputs.",
    pr: 117,
    link: "https://github.com/mark1russell7/packing/pull/117",
  },
  {
    date: "2026-10-28",
    item: "k78",
    title: "The strategy `restarts` packs 16 orders of one member and keeps the best. Around `maxrects-bl`, the median `pack.gapToOpt` falls from 0.117 to 0.097.",
    pr: 110,
    link: "https://github.com/mark1russell7/packing/pull/110",
  },
  {
    date: "2026-10-28",
    item: "k45",
    title: "The corpus `pack-known-v1` has 288 inputs with a known best value. The results page shows `pack.gapToOpt` of 6 strategies on it.",
    pr: 101,
    link: "https://github.com/mark1russell7/packing/pull/101",
  },
  {
    date: "2026-10-28",
    item: "k51",
    title: "A bound for each cell. The results page shows `pack.gap`, the distance of each result from its bound, on `pack-select-v2`.",
    pr: 99,
    link: "https://github.com/mark1russell7/packing/pull/99",
  },
];

/** This function groups the releases and the news by date, with the newest date first. The order in a date stays. */
export function newsByDate(releases: readonly Release[], news: readonly NewsEntry[]): [string, { news: NewsEntry[]; releases: Release[] }][] {
  const groups = new Map<string, { news: NewsEntry[]; releases: Release[] }>();
  const day = (date: string): { news: NewsEntry[]; releases: Release[] } => {
    let g = groups.get(date);
    if (g === undefined) {
      g = { news: [], releases: [] };
      groups.set(date, g);
    }
    return g;
  };
  for (const n of news) day(n.date).news.push(n);
  for (const r of releases) day(r.date).releases.push(r);
  return [...groups].sort(([a], [b]) => b.localeCompare(a));
}

/** The names of the corpora of the strategy snapshots, for the site */
export const CORPUS_LABELS: Record<string, { label: string; note: string }> = {
  "pack-screen-v1": { label: "Screen", note: "Fixed containers of 6 shapes, 4 boards of a user interface and the edge cases. Each board has 5 seeds." },
  "pack-free-v1": { label: "Free size", note: "Free-size containers of 6 shapes, with a target aspect or a free area. Each board has 5 seeds." },
  "pack-select-v1": { label: "Test 1", note: "The boards of the two other corpora, with the fresh seeds 21 to 25. No fit used these seeds." },
  "pack-select-v2": { label: "Test 2", note: "The boards of the two other corpora, with the fresh seeds 31 to 35. No fit used these seeds." },
  "pack-known-v1": { label: "Known best", note: "Perfect cuts, guillotine and free, and consecutive squares. Each input has a known best value. Each board has 12 seeds." },
};

/** The names and the notes of the gap measures */
export const GAP_LABELS: Record<GapSnapshot["measure"], { label: string; note: string }> = {
  "pack.gap": {
    label: "Gap to a bound",
    note: "The distance of each result from a bound of its cell. 0 is the best possible. Since k118 it is a share from 0 to 1. Older data is a ratio.",
  },
  "pack.gapToOpt": {
    label: "Gap to the known best",
    note: "The distance of each result from the known best value of its input. 0 is the best value. Less is better.",
  },
};

/** The names and the notes of the measures of the strategy snapshots */
export const MEASURE_LABELS: Record<string, { label: string; note: string; share: boolean }> = {
  "pack.fill": { label: "Fill", note: "The share of the hull that the boxes cover. More is better.", share: true },
  "pack.order.inversions": { label: "Order", note: "The share of box pairs out of their rank order. Less is better.", share: true },
  "pack.aspectError": { label: "Aspect", note: "The distance of the hull aspect from the target aspect, on a log scale. Less is better.", share: false },
  "pack.overflow.excessArea": { label: "Overflow", note: "The share of box area outside the container that a better packer can place. Less is better.", share: true },
  "pack.raggedness": { label: "Ragged edge", note: "The longest row less the shortest row, as a share of the hull width. Less is better.", share: true },
  "pack.overflow": { label: "Not placed", note: "The count of boxes that the packer did not place. Less is better.", share: false },
};

/** The names and the notes of the measures of the coverage snapshot */
export const COVERAGE_LABELS: Record<string, { label: string; note: string }> = {
  "pack.gapToBound": { label: "Fill below its bound", note: "The part of the best fill of the placed items that the layout misses, from 0 to 1." },
  "pack.fill": { label: "Fill", note: "The share of the hull that the boxes cover." },
  "pack.gap": { label: "Gap to a bound", note: "The distance of each result from a bound of its cell. Since k118 it is a share from 0 to 1." },
  "pack.overflow.excessArea": { label: "Overflow", note: "The share of box area outside the container above its bound." },
  ms: { label: "Time", note: "The median time of one pack, on a log scale." },
};