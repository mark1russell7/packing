// The shape of each data file of the site, from its TypeScript type. A page and the Pages build read through these shapes.
// The file `data/response-coverage.json` has its own deep reader: `parseResponseRecord` of the package of statistics.

import type { SolvedRule } from "./atlas-model.ts";
import type { CoverDimension, CoverView, CorpusCoverDoc, LawCoverCount } from "./corpus-cover-model.ts";
import type {
  CoverageActive,
  CoverageActiveRound,
  CoverageEntries,
  CoverageEval,
  CoverageMeasure,
  CoverageOtherEntry,
  CoveragePart,
  CoveragePoint,
  CoveragePrior,
  CoveragePriorBasis,
  CoveragePriorBeside,
  CoveragePriorCount,
  CoverageSampled,
  CoverageSnapshot,
  CoverageStep,
  CoverageStrata,
  CoverageStratum,
  CoverageStratumPairs,
  CoverageUniform,
  GapCell,
  GapSnapshot,
  GapStrategy,
  Interval,
  MeasuredEntry,
  MeasuredRow,
  MeasuredSnapshot,
  MeasureVerdict,
  Origin,
  PairedGroup,
  PairedSnapshot,
  Release,
  ReleasesSnapshot,
  SelectLeaf,
  SelectSnapshot,
  SkipWord,
  Snapshot,
  SnapshotBudget,
  StrategyFinished,
  StrategySnapshot,
  StrategySummary,
} from "./data.ts";
import { bool, either, fields, list, nullable, num, oneOf, optional, recordOf, text, type Shape } from "./data-shape.ts";

const schema = oneOf("packing-site-snapshot/1");
const skipWord: Shape<SkipWord> = oneOf("not done", "other algorithm", "no meaning", "not read");
const direction = oneOf("higher", "lower");
const texts = list(text);
const numbers = recordOf(num);
const nullNum = nullable(num);
const nullText = nullable(text);

const origin = fields<Origin>({ release: text, commit: text, date: text, run: nullNum, source: text });
const interval = fields<Interval>({ mean: num, lo: num, hi: num });

const verdict = fields<MeasureVerdict>({
  measure: text,
  direction,
  label: oneOf("better", "worse", "depends on the mix", "no verdict", "not measured"),
  summary: text,
  n: num,
  families: num,
  stratified: optional(interval),
  pooled: optional(interval),
  p: optional(num),
  signs: optional(fields<{ wins: number; losses: number; ties: number }>({ wins: num, losses: num, ties: num })),
  means: optional(fields<{ a: number; b: number }>({ a: num, b: num })),
});

const finished = fields<StrategyFinished>({ inputs: num, largest: nullNum, set: text });

const summary = fields<StrategySummary>({
  strategy: text,
  records: num,
  skipped: num,
  msMedian: nullNum,
  hardBreaks: num,
  verdicts: list(verdict),
  groups: list(fields<StrategySummary["groups"][number]>({ group: text, wins: num, losses: num, ties: num })),
  finished: optional(finished),
  reasons: optional(
    list(fields<NonNullable<StrategySummary["reasons"]>[number]>({ reason: text, count: num, word: optional(skipWord), why: optional(text) })),
  ),
  oneRun: optional(num),
});

const budget = fields<SnapshotBudget>({
  smallPairMs: num,
  smallItems: num,
  pairMs: num,
  slowPackMs: num,
  overruns: num,
  deadlineMinutes: optional(num),
  control: fields<SnapshotBudget["control"]>({ entry: text, packs: num, source: oneOf("pack") }),
  factor: optional(fields<NonNullable<SnapshotBudget["factor"]>>({ lo: num, hi: num, widest: num })),
  noFactor: optional(num),
});

const strategies = fields<StrategySnapshot>({
  schema,
  kind: oneOf("strategies"),
  corpus: text,
  origin: list(origin),
  baseline: text,
  level: num,
  inputs: num,
  families: num,
  measures: list(
    fields<StrategySnapshot["measures"][number]>({ id: text, direction, tie: either(fields<{ rel: number }>({ rel: num }), num) }),
  ),
  strategies: list(summary),
  budget: optional(budget),
});

const pairedGroup = fields<PairedGroup>({ inputs: num, medianRatio: num, medianMsA: num, medianMsB: num });

const paired = fields<PairedSnapshot>({
  schema,
  kind: oneOf("paired"),
  corpus: text,
  strategy: text,
  prediction: text,
  repeats: num,
  origin: list(origin),
  arms: fields<PairedSnapshot["arms"]>({ a: text, b: text }),
  inputs: num,
  errors: num,
  hashesEqual: num,
  slow: fields<PairedSnapshot["slow"]>({ inputs: num, medianRatio: num, medianMsA: num, medianMsB: num, maxMsA: num, maxMsB: num }),
  other: pairedGroup,
  classes: list(fields<PairedSnapshot["classes"][number]>({ inputs: num, medianRatio: num, medianMsA: num, medianMsB: num, name: text })),
});

const leaf = fields<SelectLeaf>({
  leaf: num,
  pick: num,
  member: text,
  path: list(fields<SelectLeaf["path"][number]>({ feature: text, test: text, yes: bool })),
  train: fields<SelectLeaf["train"]>({ wins: num, of: num }),
  test: list(fields<SelectLeaf["test"][number]>({ corpus: text, wins: num, of: num })),
});

const select = fields<SelectSnapshot>({ schema, kind: oneOf("select"), origin: list(origin), members: texts, winRatio: num, leaves: list(leaf) });

const release = fields<Release>({ release: text, date: text, title: text, breaking: bool, commit: text, pr: nullNum, link: text });

const releases = fields<ReleasesSnapshot>({ schema, kind: oneOf("releases"), origin: list(origin), releases: list(release) });

const gapCell = fields<GapCell>({
  n: num,
  q1: num,
  median: num,
  q3: num,
  below0: num,
  cell: text,
  missing: num,
  atMargin: optional(fields<NonNullable<GapCell["atMargin"]>>({ limit: num, n: num })),
  kinds: optional(numbers),
});

const gapStrategy = fields<GapStrategy>({
  strategy: text,
  records: num,
  all: fields<GapStrategy["all"]>({ n: num, q1: num, median: num, q3: num, below0: num, missing: num }),
  cells: list(gapCell),
});

const gaps = fields<GapSnapshot>({
  schema,
  kind: oneOf("gaps"),
  corpus: text,
  origin: list(origin),
  measure: oneOf("pack.gap", "pack.gapToOpt"),
  inputs: num,
  cells: list(fields<GapSnapshot["cells"][number]>({ cell: text, inputs: num })),
  strategies: list(gapStrategy),
  stopped: optional(num),
  budget: optional(budget),
});

const part = fields<CoveragePart>({ n: num, hits: num, share: nullNum });

const prior = fields<CoveragePrior>({
  share: nullNum,
  low: nullNum,
  high: nullNum,
  nEff: num,
  weighted: num,
  zero: num,
  covered: num,
  kind: optional(oneOf("union", "corpus", "family-flat", "tempered")),
});

const priorCount = fields<CoveragePriorCount>({ nEff: num, weighted: num, zero: num });

const sampled = fields<CoverageSampled>({
  priorBeside: optional(fields<CoveragePriorBeside>({ kind: optional(text), share: nullNum, nEff: num })),
  n: num,
  hits: num,
  share: num,
  low: num,
  high: num,
  mae: num,
  medianAe: num,
  baselineMae: num,
  baselineMedianAe: num,
  forced: optional(fields<NonNullable<CoverageSampled["forced"]>>({ heavy: part, rest: part })),
  prior: optional(prior),
});

const stratum = fields<CoverageStratum>({ stratum: text, n: num, hits: num, share: nullNum, low: nullNum, high: nullNum });

const strata = fields<CoverageStrata>({ share: num, low: num, high: num, strata: num, rows: list(stratum) });

const evalRead = fields<CoverageEval>({ share: num, mae: num, equal: num, prior: optional(nullNum), priorCount: optional(priorCount) });

const round = fields<CoverageActiveRound>({
  round: num,
  n: num,
  hits: num,
  share: num,
  low: num,
  high: num,
  mae: num,
  prior: optional(nullNum),
  priorCount: optional(priorCount),
  after: nullable(evalRead),
});

const active = fields<CoverageActive>({ start: nullable(evalRead), rounds: list(round) });

const measure = fields<CoverageMeasure>({
  id: text,
  scale: oneOf("linear", "log"),
  tolerance: num,
  n: num,
  mae: num,
  baselineMae: num,
  medianAe: num,
  baselineMedianAe: num,
  skill: nullNum,
  share: num,
  shareOfMeasured: num,
  byInput: optional(fields<NonNullable<CoverageMeasure["byInput"]>>({ mae: num, medianAe: num, share: num })),
  sampled: optional(sampled),
  strata: optional(strata),
  active: optional(active),
  cells: fields<CoverageMeasure["cells"]>({ space: num, withRecords: num, covered: num }),
  explained: fields<CoverageMeasure["explained"]>({ strategy: num, input: num, joint: num }),
  noise: num,
  indices: list(fields<CoverageMeasure["indices"][number]>({ feature: text, group: oneOf("strategy", "input"), index: num })),
});

const step: Shape<CoverageStep> = either(
  fields<Extract<CoverageStep, { common: number }>>({ from: num, common: num, of: num, earlier: numbers, later: numbers }),
  fields<Extract<CoverageStep, { noRead: string }>>({ from: num, noRead: text }),
);

const lostReason = fields<NonNullable<CoveragePoint["lost"]>[number]["reasons"][number]>({ because: text, records: num, msAtLeast: optional(num) });

const point = fields<CoveragePoint>({
  date: text,
  run: nullNum,
  corpus: text,
  commit: text,
  trigger: optional(oneOf("schedule", "dispatch", "push")),
  strategies: optional(texts),
  method: optional(text),
  over: optional(list(fields<NonNullable<CoveragePoint["over"]>[number]>({ strategies: texts, shares: numbers, records: optional(num) }))),
  records: optional(num),
  step: optional(step),
  lost: optional(list(fields<NonNullable<CoveragePoint["lost"]>[number]>({ entry: text, reasons: list(lostReason) }))),
  commonOf: optional(num),
  shares: numbers,
  sharesByInput: optional(numbers),
});

const otherEntry = fields<CoverageOtherEntry>({
  entry: text,
  reasons: list(
    fields<CoverageOtherEntry["reasons"][number]>({ because: text, records: num, msAtLeast: optional(num), word: optional(skipWord), why: optional(text) }),
  ),
});

const entries = fields<CoverageEntries>({ planned: num, measured: num, others: list(otherEntry) });

const uniform = fields<CoverageUniform>({
  date: text,
  run: nullNum,
  commit: text,
  pairs: num,
  seed: nullNum,
  configRejectionRate: nullNum,
  hardPairs: nullNum,
  measures: recordOf(sampled),
});

const basis = fields<CoveragePriorBasis>({
  kind: oneOf("union", "corpus", "family-flat", "tempered"),
  corpora: texts,
  inputs: num,
  families: list(fields<CoveragePriorBasis["families"][number]>({ family: text, inputs: num, weight: num })),
  absent: texts,
  unmapped: list(fields<CoveragePriorBasis["unmapped"][number]>({ family: text, inputs: num })),
  strata: optional(list(fields<NonNullable<CoveragePriorBasis["strata"]>[number]>({ family: text, inputs: num }))),
  power: optional(num),
});

type Latest = CoverageSnapshot["latest"];

const latest = fields<Latest>({
  date: text,
  run: nullNum,
  corpus: text,
  records: num,
  inputs: num,
  strategies: texts,
  entries: optional(entries),
  model: fields<Latest["model"]>({
    kind: text,
    maxDepth: num,
    minLeaf: num,
    folds: num,
    seed: num,
    by: oneOf("input", "spec"),
    features: optional(oneOf("family", "input")),
  }),
  measures: list(measure),
  sampled: optional(
    fields<NonNullable<Latest["sampled"]>>({
      pairs: num,
      seed: nullNum,
      draw: nullText,
      configRejectionRate: nullNum,
      hardPairs: nullNum,
      nondeterministic: optional(nullNum),
      nondeterministicClock: optional(nullNum),
    }),
  ),
  strata: optional(
    fields<NonNullable<Latest["strata"]>>({
      pairs: num,
      draw: nullText,
      strata: list(fields<CoverageStratumPairs>({ id: text, pairs: num, configs: optional(text), missed: optional(num) })),
    }),
  ),
  uniform: optional(uniform),
  active: optional(
    fields<NonNullable<Latest["active"]>>({ pairs: num, features: text, score: nullText, pool: nullNum, rounds: num, evalPairs: nullNum }),
  ),
  prior: optional(basis),
});

const coverage = fields<CoverageSnapshot>({ schema, kind: oneOf("coverage"), origin: list(origin), latest, trend: list(point) });

const measuredEntry = fields<MeasuredEntry>({ entry: text, measured: num, records: num, stopped: num, largestItems: nullNum });

const measuredRow = fields<MeasuredRow>({ corpus: text, run: num, date: text, largestItems: nullNum, entries: list(measuredEntry), notPlanned: texts });

const measured = fields<MeasuredSnapshot>({
  schema,
  kind: oneOf("measured"),
  origin: list(origin),
  planned: num,
  measured: num,
  notMeasured: texts,
  rows: list(measuredRow),
});

/** The shape of a snapshot of each kind */
export const SNAPSHOT_SHAPES: { readonly [K in Snapshot["kind"]]: Shape<Extract<Snapshot, { kind: K }>> } = {
  strategies,
  paired,
  select,
  releases,
  gaps,
  coverage,
  measured,
};

const dimension = fields<CoverDimension>({ name: text, values: texts });

const view = fields<CoverView>({
  id: text,
  specs: num,
  inputs: num,
  cells: num,
  cellShare: num,
  pairs: num,
  pairShare: num,
  values: num,
  empty: texts,
  grid: list(list(num)),
});

/** The shape of `data/corpus-cover.json` */
export const CORPUS_COVER_SHAPE: Shape<CorpusCoverDoc> = fields<CorpusCoverDoc>({
  schema: text,
  dimensions: list(dimension),
  fullCells: num,
  fullPairs: num,
  fullValues: num,
  skipped: texts,
  views: list(view),
});

/** The shape of `data/law-cover.json`, with the fields that the page reads */
export const LAW_COVER_SHAPE: Shape<LawCoverCount> = fields<LawCoverCount>({ covered: num, pairs: num, specs: num, refused: num, floor: num });

/** The shape of `data/solved-rule.json` */
export const SOLVED_RULE_SHAPE: Shape<SolvedRule> = fields<SolvedRule>({
  schema: oneOf("packing-solved-rule/1"),
  floor: num,
  margins: recordOf(
    fields<SolvedRule["margins"][string]>({
      limit: num,
      because: text,
      cells: recordOf(fields<SolvedRule["margins"][string]["cells"][string]>({ limit: num, run: num })),
    }),
  ),
  words: fields<SolvedRule["words"]>({ exact: text, slack: text }),
  selector: text,
  searches: list(
    fields<SolvedRule["searches"][number]>({
      corpus: text,
      cell: text,
      strategy: text,
      run: num,
      date: text,
      found: list(fields<SolvedRule["searches"][number]["found"][number]>({ input: text, value: num })),
    }),
  ),
  weekly: fields<SolvedRule["weekly"]>({ corpus: text, weeksLed: num, need: num, firstPossible: text }),
});
