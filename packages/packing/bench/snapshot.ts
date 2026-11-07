// The snapshots of the site (roadmap item k32). Each snapshot is a small JSON file in `packages/site/data/`, with the
// summary of the records of one or more CI runs. The site reads only these files. The raw records stay out of git.
//
//   node bench/snapshot.ts strategies <run folder> --run <id> [--baseline rows] [--release <version>] [--date YYYY-MM-DD] [--out <file>]
//   node bench/snapshot.ts paired <run folder> --run <id> --commit <sha> --release <version> --arm-a <ref> --arm-b <ref> [--out <file>]
//   node bench/snapshot.ts select --train <run folder>=<id> [...] --test <run folder>=<id> [...] [--out <file>]
//   node bench/snapshot.ts releases [--out <file>]
//   node bench/snapshot.ts gaps <run folder> --run <id> --measure pack.gap|pack.gapToOpt [--release <version>] [--date YYYY-MM-DD] [--strategies <a,b>] [--out <file>] (the margins of data/solved-rule.json decide the count at the margin)
//   node bench/snapshot.ts coverage <run folder> --run <id> --date YYYY-MM-DD [--release <version>] [--out <file>] [--sample <dir>] [--active <dir>] [--features family|input]
//
//   node bench/snapshot.ts written <folder before> <folder after> <output folder>
//
// A run folder holds the files of one artifact of `bench.yml` or `paired.yml`: `records.jsonl`, `run.json` and `corpus.json`.
// `docs/BENCH.md` ("The snapshots of the site") tells the commands of the snapshots of today.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOUND_KINDS,
  corpus,
  MEASURE_SPECS,
  quantile,
  SELECT_MEMBERS,
  SELECT_TABLE,
  selectFeatures,
  selectLeaf,
  toPackInput,
  type CorpusSpec,
  type MeasureId,
  type SelectNode,
} from "@mark1russell7/packing";
import { verdict, type VerdictLabel, type VerdictRecord } from "@mark1russell7/layout-contract";
import { firstSentence, sectionMarksBreak } from "@mark1russell7/site-pages";
import {
  coverage,
  coverageOptions,
  priorOf,
  readActive,
  readRecords,
  readSample,
  type ActiveCoverage,
  type CoverageManifest,
  type CoverageOptions,
  type CoverageRecord,
  type CoverageSummary,
  type EvalMeasure,
  type PriorCount,
  type SampledMeasure,
  type StrataMeasure,
} from "./coverage.ts";
import { leftOutWord, skipRead, type LeftOutWord, type SkipRead } from "./skip-words.ts";
import { NOT_RUN_JOB, NOT_RUN_SIZE, OVER_BUDGET } from "./budget.ts";
import { NOT_RUN_BASE } from "./run.ts";
import { ENTRIES } from "./entries.ts";
import { SLOW_SET, type PairedRecord, type PairedSummary } from "./paired.ts";
import type { PriorKind } from "./prior.ts";

/** The schema of each snapshot file */
export const SNAPSHOT_SCHEMA = "packing-site-snapshot/1";

/** The folder of the snapshots, in the package of the site */
export const SNAPSHOT_DIR = new URL("../../site/data/", import.meta.url);

/** The origin of the data of a snapshot: the release, the commit, the date, the CI run and the source files. */
export interface SnapshotOrigin {
  /** The first release that contains the commit, without the `v` of the tag */
  release: string;
  /** The short commit of the measured code */
  commit: string;
  /** The date of the commit, as `YYYY-MM-DD` */
  date: string;
  /** The id of the CI run, or `null` for data from the repository only */
  run: number | null;
  /** The source of the data: the workflow and its artifact, or the files of the repository */
  source: string;
}

/** The parts of a record that the snapshots read */
export interface SnapshotRecord extends VerdictRecord {
  readonly inputHash?: string;
  /** The count of the items of the input. */
  readonly nodes?: number;
  /** The value is `true` when a measure of the pair chose 1 timed run and no warm-up. */
  readonly oneRun?: boolean;
  readonly hard?: Readonly<Record<string, number>>;
  readonly ms?: number;
}

/** The measures of the strategy snapshot. `pack.fill` is the win measure, the others are guards. */
export const SNAPSHOT_MEASURES: readonly MeasureId[] = ["pack.fill", "pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea", "pack.balance.side.right"];

/** The significance level of each verdict. It is the parameter `signP` of `docs/PROMOTION.md`. */
export const SNAPSHOT_LEVEL = 0.05;

/** This function rounds a number to 4 significant digits, so a snapshot stays small. A value that is not finite stays. */
export function sig(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(4));
}

/** This function gives the family of an input id `<set>/<family>/s<seed>`: the board, with its seeds as replicates. */
export const familyOfInput = (input: string): string => input.split("/").slice(1, -1).join("/");

/** This function gives the group of a family for the site: its generator and its container size, for example `rect-grid.fixed`. */
export const groupOfFamily = (family: string): string => family.split(".").slice(0, 2).join(".");

/** This function reads JSON Lines records. An empty line is not a record. */
export function readJsonLines<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) if (line.trim() !== "") out.push(JSON.parse(line) as T);
  return out;
}

/** This function gives the median of a list that is not empty. */
function medianOf(values: readonly number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The verdict of one measure of one strategy against the baseline */
export interface MeasureVerdict {
  measure: MeasureId;
  direction: "higher" | "lower";
  /** The label of `verdict`, or `not measured` when no input has a pair */
  label: VerdictLabel | "not measured";
  /** The line of `verdict`: the label, the scope and the breadth */
  summary: string;
  /** The count of the paired inputs */
  n: number;
  /** The count of the families */
  families: number;
  /** The mean of the family means of the difference, in the direction of the measure, with its interval */
  stratified?: { mean: number; lo: number; hi: number };
  /** The mean of the inputs of the difference, with its interval */
  pooled?: { mean: number; lo: number; hi: number };
  /** The p of the stratified permutation test */
  p?: number;
  /** The family signs: wins, losses and ties of the candidate */
  signs?: { wins: number; losses: number; ties: number };
  /** The mean value of the baseline and of the candidate on the paired inputs */
  means?: { a: number; b: number };
}

/** The summary of one strategy in a strategy snapshot */
export interface StrategySummary {
  strategy: string;
  /** The count of the records of the strategy, and the count of the skipped records */
  records: number;
  skipped: number;
  /** The median time of one pack, in milliseconds. Each strategy has its own job, so the times are not paired. */
  msMedian: number | null;
  /** The sum of the hard breaks of all records. A correct packer has 0. */
  hardBreaks: number;
  verdicts: MeasureVerdict[];
  /** The family signs of the win measure in each group of families */
  groups: { group: string; wins: number; losses: number; ties: number }[];
  /** The inputs that the strategy finished. */
  finished: StrategyFinished;
  /** The reason of each skipped record, with its count, the largest count first. A reason that is no wall budget has its word. */
  reasons: ({ reason: string; count: number } & Partial<SkipRead>)[];
  /** The count of the records with 1 timed run. */
  oneRun: number;
}

/** The inputs that a strategy finished. Two strategies with the same `set` have the same inputs, so a page can compare them. */
export interface StrategyFinished {
  inputs: number;
  /** The count of the items of the largest finished input, or `null` when no input finished. */
  largest: number | null;
  /** The first 8 hex characters of the SHA-256 of the sorted input keys. */
  set: string;
}

/** The rules of the wall budget of a run, for the page. */
export interface SnapshotBudget {
  smallPairMs: number;
  smallItems: number;
  pairMs: number;
  slowPackMs: number;
  overruns: number;
  deadlineMinutes?: number;
  /** The entry and the count of packs of each key of the control of each job. */
  control: { entry: string; packs: number; source: "pack" };
  /**
   * The load factors of the jobs. `lo` and `hi` are the lowest and the highest factor. `widest` is the largest quotient of the quartiles of one job.
   * When `widest` is over `hi / lo`, the spread inside a job is over the spread that the factors correct.
   */
  factor?: { lo: number; hi: number; widest: number };
  /** The count of the jobs with too few control keys for a factor. */
  noFactor?: number;
}

/** The budget of a `run.json`, with the factor of each job from `controlFactor`. */
export type RunBudget = SnapshotBudget & { factors?: readonly { factor?: number | undefined; low?: number; high?: number }[] };

/** The strategy snapshot of one corpus */
export interface StrategySnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "strategies";
  corpus: string;
  origin: SnapshotOrigin[];
  baseline: string;
  level: number;
  inputs: number;
  families: number;
  measures: { id: MeasureId; direction: "higher" | "lower"; tie: number | { rel: number } }[];
  strategies: StrategySummary[];
  /** The rules of the wall budget. A run without a budget does not have this field. */
  budget?: SnapshotBudget;
}

/** The options of `strategySnapshot` */
export interface StrategySnapshotOptions {
  corpus: string;
  /** The rules of the wall budget of the run. */
  budget?: SnapshotBudget;
  origin: SnapshotOrigin[];
  baseline?: string;
  measures?: readonly MeasureId[];
  level?: number;
  /** The count of the samples of each bootstrap. The default is the default of `verdict`. */
  runs?: number;
  /** The count of the random sign sets of each permutation test. The default is the default of `verdict`. */
  draws?: number;
}

/** This function gives the tie of a measure: its `minEffect` of `MEASURE_SPECS`, or 0. */
const tieOf = (id: MeasureId): number | { rel: number } => {
  const m = MEASURE_SPECS[id].minEffect;
  return m === undefined ? 0 : typeof m === "number" ? m : { rel: m.rel };
};

/** This function sums the hard breaks of a record. */
const breaksOf = (r: SnapshotRecord): number => Object.values(r.hard ?? {}).reduce((s, n) => s + n, 0);

/** This function gives the key of the input of a record. */
const inputKeyOf = (r: SnapshotRecord): string => `${r.input}#${r.seed}`;

/** The reasons of a pair that a wall budget ended. The input of such a pair leaves a comparison of all strategies. */
const BUDGET_REASONS: ReadonlySet<string> = new Set([OVER_BUDGET, NOT_RUN_SIZE, NOT_RUN_JOB, NOT_RUN_BASE]);

/** This function gives the inputs that the measured records of a strategy finished. */
function finishedOf(live: readonly SnapshotRecord[]): StrategyFinished {
  const keys = [...new Set(live.map(inputKeyOf))].sort();
  const largest = live.reduce<number | null>((max, r) => (r.nodes === undefined ? max : Math.max(max ?? 0, r.nodes)), null);
  return { inputs: keys.length, largest, set: createHash("sha256").update(keys.join("\n")).digest("hex").slice(0, 8) };
}

/** This function gives the reason of each skipped record with its count. A reason keeps at most 80 characters, so a snapshot stays small. */
function reasonsOf(entry: string, records: readonly SnapshotRecord[]): StrategySummary["reasons"] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.skipped === undefined) continue;
    const reason = r.skipped.slice(0, 80);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count, ...(BUDGET_REASONS.has(reason) ? {} : skipRead(entry, reason)) }))
    .sort((x, y) => y.count - x.count || x.reason.localeCompare(y.reason));
}

/** This function gives the rules of a budget of `run.json` for the page, with the range of the load factors of its jobs. */
export function snapshotBudget(budget: RunBudget): SnapshotBudget {
  const all = budget.factors ?? [];
  const factors = all.flatMap((f) => (f.factor === undefined ? [] : [f.factor]));
  const widths = all.flatMap((f) => (f.low === undefined || f.high === undefined || f.low <= 0 ? [] : [f.high / f.low]));
  return {
    smallPairMs: budget.smallPairMs,
    smallItems: budget.smallItems,
    pairMs: budget.pairMs,
    slowPackMs: budget.slowPackMs,
    overruns: budget.overruns,
    control: budget.control,
    ...(budget.deadlineMinutes === undefined ? {} : { deadlineMinutes: budget.deadlineMinutes }),
    ...(factors.length === 0 ? {} : { factor: { lo: sig(Math.min(...factors)), hi: sig(Math.max(...factors)), widest: sig(Math.max(1, ...widths)) } }),
    ...(all.length === factors.length ? {} : { noFactor: all.length - factors.length }),
  };
}

/** This function gives the mean values of a measure of the two sides on the inputs where both sides have a value. */
function meansOf(a: readonly SnapshotRecord[], b: readonly SnapshotRecord[], id: string): { a: number; b: number } | undefined {
  const byKey = new Map<string, number>();
  for (const r of a) if (r.skipped === undefined && r.measures[id] !== undefined) byKey.set(`${r.input}#${r.seed}`, r.measures[id]!);
  let sa = 0;
  let sb = 0;
  let n = 0;
  for (const r of b) {
    const va = byKey.get(`${r.input}#${r.seed}`);
    const vb = r.skipped === undefined ? r.measures[id] : undefined;
    if (va === undefined || vb === undefined) continue;
    sa += va;
    sb += vb;
    n++;
  }
  return n === 0 ? undefined : { a: sig(sa / n), b: sig(sb / n) };
}

/**
 * This function gives the strategy snapshot of the records of one corpus. Each strategy other than the baseline gets the
 * verdict of `verdict` of `layout-contract` on each measure, with the family as the unit. A strategy without a pair gets `not measured`.
 */
export function strategySnapshot(records: readonly SnapshotRecord[], options: StrategySnapshotOptions): StrategySnapshot {
  const baseline = options.baseline ?? "rows";
  const measures = options.measures ?? SNAPSHOT_MEASURES;
  const level = options.level ?? SNAPSHOT_LEVEL;
  const byStrategy = new Map<string, SnapshotRecord[]>();
  for (const r of records) {
    const list = byStrategy.get(r.strategy);
    if (list === undefined) byStrategy.set(r.strategy, [r]);
    else list.push(r);
  }
  const base = byStrategy.get(baseline);
  if (base === undefined) throw new RangeError(`The records have no strategy ${baseline}, the baseline.`);
  const ids = [...byStrategy.keys()].sort();
  const strategies: StrategySummary[] = ids.map((id) => {
    const own = byStrategy.get(id)!;
    const live = own.filter((r) => r.skipped === undefined);
    const times = live.map((r) => r.ms).filter((ms): ms is number => typeof ms === "number");
    const verdicts: MeasureVerdict[] = [];
    let groups: StrategySummary["groups"] = [];
    if (id !== baseline) {
      const pair = [...base, ...own];
      for (const m of measures) {
        const direction = MEASURE_SPECS[m].direction as "higher" | "lower";
        const families = new Set(live.map((r) => familyOfInput(r.input))).size;
        let v;
        try {
          v = verdict(pair, {
            by: "family",
            family: (r) => familyOfInput(r.input),
            measure: { id: m, direction },
            a: baseline,
            b: id,
            tie: tieOf(m),
            level,
            ...(options.runs === undefined ? {} : { runs: options.runs }),
            ...(options.draws === undefined ? {} : { draws: options.draws }),
          });
        } catch (error) {
          if (!(error instanceof RangeError) || !error.message.includes("no pair")) throw error;
          verdicts.push({ measure: m, direction, label: "not measured", summary: "not measured: no input has records of both sides", n: 0, families });
          continue;
        }
        const means = meansOf(base, own, m);
        verdicts.push({
          measure: m,
          direction,
          label: v.label,
          summary: v.summary,
          n: v.n,
          families: v.families.length,
          stratified: { mean: sig(v.stratified.mean), lo: sig(v.stratified.lo), hi: sig(v.stratified.hi) },
          pooled: { mean: sig(v.pooled.mean), lo: sig(v.pooled.lo), hi: sig(v.pooled.hi) },
          p: sig(v.permutation.p),
          signs: { wins: v.signTest.wins, losses: v.signTest.losses, ties: v.signTest.ties },
          ...(means === undefined ? {} : { means }),
        });
        if (m === measures[0]) {
          const tally = new Map<string, { wins: number; losses: number; ties: number }>();
          for (const f of v.families) {
            const g = groupOfFamily(f.family);
            const t = tally.get(g) ?? { wins: 0, losses: 0, ties: 0 };
            if (f.sign > 0) t.wins++;
            else if (f.sign < 0) t.losses++;
            else t.ties++;
            tally.set(g, t);
          }
          groups = [...tally.keys()].sort().map((g) => ({ group: g, ...tally.get(g)! }));
        }
      }
    }
    return {
      strategy: id,
      records: own.length,
      skipped: own.length - live.length,
      msMedian: times.length === 0 ? null : sig(medianOf(times)),
      hardBreaks: live.reduce((s, r) => s + breaksOf(r), 0),
      verdicts,
      groups,
      finished: finishedOf(live),
      reasons: reasonsOf(id, own),
      oneRun: live.filter((r) => r.oneRun === true).length,
    };
  });
  const inputs = new Set(base.map((r) => `${r.input}#${r.seed}`)).size;
  return {
    schema: SNAPSHOT_SCHEMA,
    kind: "strategies",
    corpus: options.corpus,
    origin: options.origin,
    baseline,
    level,
    inputs,
    families: new Set(base.map((r) => familyOfInput(r.input))).size,
    measures: measures.map((id) => ({ id, direction: MEASURE_SPECS[id].direction as "higher" | "lower", tie: tieOf(id) })),
    strategies,
    ...(options.budget === undefined ? {} : { budget: options.budget }),
  };
}

/** The snapshot of a paired time test of two refs */
export interface PairedSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "paired";
  corpus: string;
  strategy: string;
  prediction: string;
  repeats: number;
  origin: SnapshotOrigin[];
  /** The refs of the arm A (the base) and the arm B (the change) */
  arms: { a: string; b: string };
  inputs: number;
  errors: number;
  hashesEqual: number;
  /** The slow set of roadmap item k67, with the largest time of each arm */
  slow: PairedSummary["slow"] & { maxMsA: number; maxMsB: number };
  other: PairedSummary["other"];
  classes: { name: string; inputs: number; medianRatio: number; medianMsA: number; medianMsB: number }[];
}

/** The artifact `summary.json` of `paired.yml` */
export interface PairedArtifact {
  corpus: string;
  strategy: string;
  prediction: string;
  repeats: number;
  summary: PairedSummary;
}

/** This function gives the paired snapshot of the artifact of one run of `paired.yml`. The records give the largest times of the slow set. */
export function pairedSnapshot(artifact: PairedArtifact, records: readonly PairedRecord[], slowSet: RegExp, arms: { a: string; b: string }, origin: SnapshotOrigin[]): PairedSnapshot {
  const s = artifact.summary;
  const slow = records.filter((r) => r.error === undefined && slowSet.test(r.input));
  if (slow.length !== s.slow.inputs) throw new RangeError(`The records have ${slow.length} inputs of the slow set, but summary.json has ${s.slow.inputs}.`);
  return {
    schema: SNAPSHOT_SCHEMA,
    kind: "paired",
    corpus: artifact.corpus,
    strategy: artifact.strategy,
    prediction: artifact.prediction,
    repeats: artifact.repeats,
    origin,
    arms,
    inputs: s.inputs,
    errors: s.errors,
    hashesEqual: s.hashesEqual,
    slow: { ...s.slow, maxMsA: Math.max(...slow.map((r) => r.msA)), maxMsB: Math.max(...slow.map((r) => r.msB)) },
    other: s.other,
    classes: Object.entries(s.classes).map(([name, g]) => ({ name, ...g })),
  };
}

/** One condition of the path of a leaf of a select table */
export interface LeafStep {
  feature: string;
  /** The text of the test, for example `count below 317` */
  test: string;
  /** The value `true` when the path takes the branch `yes` */
  yes: boolean;
}

/** One leaf of a select table, with its path from the root */
export interface TableLeaf {
  leaf: number;
  pick: number;
  path: LeafStep[];
}

/** This function gives the leaves of a select table in the order of a walk: `yes` before `no`. */
export function tableLeaves(table: SelectNode): TableLeaf[] {
  const out: TableLeaf[] = [];
  const walk = (node: SelectNode, path: LeafStep[]): void => {
    if ("leaf" in node) {
      out.push({ leaf: node.leaf, pick: node.pick, path });
      return;
    }
    const test = "below" in node ? `${node.feature} below ${node.below}` : node.feature;
    walk(node.yes, [...path, { feature: node.feature, test, yes: true }]);
    walk(node.no, [...path, { feature: node.feature, test, yes: false }]);
  };
  walk(table, []);
  return out;
}

/**
 * The wins of `maxrects-bl` against `rows` in each leaf of `SELECT_TABLE`. They come from the training records of k66,
 * of the CI ids 40675490363 (`pack-screen-v1`) and 40685309195 (`pack-free-v1`). A win is a fill ratio of 1.05 or more with no added hard break.
 * The comments of `SELECT_TABLE` and the table of `docs/PACKER.md` give the same counts. A test checks that the leaf ids are the ids of the table.
 */
export const SELECT_LEAF_WINS: readonly { readonly leaf: number; readonly wins: number; readonly of: number }[] = Object.freeze([
  { leaf: 0, wins: 0, of: 15 },
  { leaf: 1, wins: 635, of: 850 },
  { leaf: 2, wins: 10, of: 210 },
  { leaf: 3, wins: 184, of: 210 },
  { leaf: 4, wins: 49, of: 490 },
  { leaf: 5, wins: 7, of: 50 },
  { leaf: 6, wins: 172, of: 200 },
]);

/** The fill ratio of a win of `maxrects-bl` against `rows` in the fit of `SELECT_TABLE` */
export const SELECT_WIN_RATIO = 1.05;

/** The count of the inputs of each leaf and the wins of the member 1 against the member 0 in each leaf */
export type LeafWins = Map<number, { wins: number; of: number }>;

/**
 * This function counts the wins of the member `b` against the member `a` in each leaf. A win is a fill ratio `b / a` of
 * `SELECT_WIN_RATIO` or more with no added hard break. When both fills are 0, the ratio is 1. `leafOf` gives the leaf of an input id.
 */
export function leafWins(records: readonly SnapshotRecord[], a: string, b: string, leafOf: (input: string) => number): LeafWins {
  const as = new Map<string, SnapshotRecord>();
  for (const r of records) if (r.strategy === a && r.skipped === undefined) as.set(`${r.input}#${r.seed}`, r);
  const out: LeafWins = new Map();
  for (const rb of records) {
    if (rb.strategy !== b || rb.skipped !== undefined) continue;
    const ra = as.get(`${rb.input}#${rb.seed}`);
    const fa = ra?.measures["pack.fill"];
    const fb = rb.measures["pack.fill"];
    if (ra === undefined || fa === undefined || fb === undefined) continue;
    const ratio = fa === 0 ? (fb === 0 ? 1 : Infinity) : fb / fa;
    const win = ratio >= SELECT_WIN_RATIO && breaksOf(rb) <= breaksOf(ra);
    const leaf = leafOf(rb.input);
    const t = out.get(leaf) ?? { wins: 0, of: 0 };
    t.of++;
    if (win) t.wins++;
    out.set(leaf, t);
  }
  return out;
}

/** One leaf of the select snapshot */
export interface SelectLeafSummary extends TableLeaf {
  member: string;
  /** The wins of `maxrects-bl` in the training records, from `SELECT_LEAF_WINS` */
  train: { wins: number; of: number };
  /** The wins of `maxrects-bl` in the records of each test corpus */
  test: { corpus: string; wins: number; of: number }[];
}

/** The snapshot of `SELECT_TABLE` */
export interface SelectSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "select";
  origin: SnapshotOrigin[];
  members: string[];
  winRatio: number;
  leaves: SelectLeafSummary[];
}

/**
 * This function gives the select snapshot. It throws a `RangeError` when the training counts are not `SELECT_LEAF_WINS`,
 * thus the snapshot shows only the counts that the records give.
 */
export function selectSnapshot(train: LeafWins, tests: readonly { corpus: string; wins: LeafWins }[], origin: SnapshotOrigin[], table: SelectNode = SELECT_TABLE): SelectSnapshot {
  const members = SELECT_MEMBERS.map((m) => m.id);
  const leaves = tableLeaves(table).map((l): SelectLeafSummary => {
    const pinned = SELECT_LEAF_WINS.find((w) => w.leaf === l.leaf);
    if (pinned === undefined) throw new RangeError(`SELECT_LEAF_WINS has no leaf ${l.leaf}.`);
    const got = train.get(l.leaf) ?? { wins: 0, of: 0 };
    if (got.wins !== pinned.wins || got.of !== pinned.of) {
      throw new RangeError(`The training records give ${got.wins} wins of ${got.of} in the leaf ${l.leaf}, but SELECT_LEAF_WINS has ${pinned.wins} of ${pinned.of}.`);
    }
    return {
      ...l,
      member: members[l.pick] ?? String(l.pick),
      train: { wins: pinned.wins, of: pinned.of },
      test: tests.map((t) => ({ corpus: t.corpus, ...(t.wins.get(l.leaf) ?? { wins: 0, of: 0 }) })),
    };
  });
  return { schema: SNAPSHOT_SCHEMA, kind: "select", origin, members, winRatio: SELECT_WIN_RATIO, leaves };
}

/** One entry of the list of the releases */
export interface ReleaseEntry {
  release: string;
  date: string;
  /** The first sentence of the release in `CHANGELOG.md` */
  title: string;
  /** The value `true` when the release has breaking changes */
  breaking: boolean;
  commit: string;
  /** The number of the pull request of the release commit, or `null` */
  pr: number | null;
  link: string;
}

/** The snapshot of the releases */
export interface ReleasesSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "releases";
  origin: SnapshotOrigin[];
  releases: ReleaseEntry[];
}

/** A release tag: its version, its commit, its date and the subject of its commit */
export interface ReleaseTag {
  version: string;
  commit: string;
  date: string;
  subject: string;
}

/** The address of the repository on GitHub */
export const REPO_URL = "https://github.com/mark1russell7/packing";

/**
 * This function gives the entries of the releases of `CHANGELOG.md` that have a tag. The title is the first sentence of the
 * first paragraph, or of the first list item without its `New:` or `Fix:` prefix. The entries come newest first.
 */
export function releaseEntries(changelog: string, tags: readonly ReleaseTag[]): ReleaseEntry[] {
  const out: ReleaseEntry[] = [];
  const sections = changelog.split(/^## /m).slice(1);
  for (const section of sections) {
    const [head = "", ...rest] = section.split("\n");
    const version = head.trim();
    const tag = tags.find((t) => t.version === version);
    if (tag === undefined) continue;
    const body = rest.join("\n");
    const para = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p !== "" && !p.startsWith("#"));
    const text = (para ?? "").startsWith("- ") ? (para ?? "").split("\n")[0]!.slice(2).replace(/^(New|Fix|Change):\s*/, "") : (para ?? "");
    const sentence = firstSentence(text);
    const title = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    const breaking = sectionMarksBreak(body);
    const pr = /\(#(\d+)\)\s*$/.exec(tag.subject)?.[1];
    out.push({
      release: version,
      date: tag.date,
      title,
      breaking,
      commit: tag.commit,
      pr: pr === undefined ? null : Number(pr),
      link: pr === undefined ? `${REPO_URL}/commit/${tag.commit}` : `${REPO_URL}/pull/${pr}`,
    });
  }
  return out;
}

/** The measures of the gap snapshot: the gap to a lower bound (k51) and the gap to the known best value (k45) */
export const GAP_MEASURES = Object.freeze(["pack.gap", "pack.gapToOpt"] as const);

/** A measure of the gap snapshot */
export type GapMeasure = (typeof GAP_MEASURES)[number];

/** The statistics of the values of a gap measure: the count, the quartiles and the count of the values below 0 */
export interface GapStats {
  n: number;
  q1: number;
  median: number;
  q3: number;
  /** The count of the values below 0. A value below 0 shows a bug of the bound or of the packer. */
  below0: number;
}

/** One cell of one strategy in a gap snapshot */
export interface GapCell extends GapStats {
  cell: string;
  /** The count of the records of the cell without a value of the measure */
  missing: number;
  /** The margin of the cell and the count of the values at or under it. */
  atMargin?: { limit: number; n: number };
  /** The count of the records of each kind of bound of `BOUND_KINDS`. Only `pack.gap` has kinds. */
  kinds?: Record<string, number>;
}

/** The summary of one strategy in a gap snapshot */
export interface GapStrategy {
  strategy: string;
  records: number;
  /** The statistics of all the records of the strategy with a value of the measure */
  all: GapStats & { missing: number };
  cells: GapCell[];
}

/** The gap snapshot of one corpus: the distance of each result from a bound or from the known best value */
export interface GapSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "gaps";
  corpus: string;
  origin: SnapshotOrigin[];
  measure: GapMeasure;
  /** The count of the inputs that left the table, because a wall budget ended a pair on them. Each strategy then has the same inputs. */
  stopped?: number;
  /** The rules of the wall budget of the run. A run without a budget does not have this field. */
  budget?: SnapshotBudget;
  inputs: number;
  /** The cells of the corpus, in the order of the manifest, with the count of their inputs */
  cells: { cell: string; inputs: number }[];
  strategies: GapStrategy[];
}

/** The options of `gapSnapshot` */
export interface GapSnapshotOptions {
  corpus: string;
  origin: SnapshotOrigin[];
  measure: GapMeasure;
  /** The cell of each input id. The default is `gapCellOf` of the family, without a container size. */
  cellOf?: (input: string) => string;
  /** The highest value at the margin in each cell. The default is `GAP_TOLERANCE`, a margin of 0. */
  limitOf?: (cell: string) => number;
  /** The rules of the wall budget of the run. */
  budget?: SnapshotBudget;
}

/** The numeric tolerance of a margin of 0. A gap of the corpus `pack-known-v1` is 0 or at least 0.03, so this value decides no record there. */
export const GAP_TOLERANCE = 1e-9;

/** The margin of one measure in `data/solved-rule.json`. */
interface RuleMargin {
  limit: number;
  cells: Record<string, { limit: number }>;
}

/**
 * This function gives the cell of a family for the gap snapshot: the parts of the family up to its container size, for
 * example `perfect-cut.guillotine.fixed`. A family without the container size gives its group of `groupOfFamily`.
 */
export function gapCellOf(family: string, containerSize?: string): string {
  const parts = family.split(".");
  const at = containerSize === undefined ? -1 : parts.indexOf(containerSize);
  return at >= 1 ? parts.slice(0, at + 1).join(".") : groupOfFamily(family);
}

/** This function gives the statistics of a list of gap values. An empty list gives a count of 0 and quartiles of 0. */
export function gapStats(values: readonly number[]): GapStats {
  if (values.length === 0) return { n: 0, q1: 0, median: 0, q3: 0, below0: 0 };
  return {
    n: values.length,
    q1: sig(quantile(values, 0.25)),
    median: sig(quantile(values, 0.5)),
    q3: sig(quantile(values, 0.75)),
    below0: values.filter((v) => v < 0).length,
  };
}

/**
 * This function gives the gap snapshot of the records of one corpus. Each strategy gets the statistics of the measure
 * over all its records and in each cell. A record without a finite value of the measure counts as missing.
 */
export function gapSnapshot(allRecords: readonly SnapshotRecord[], options: GapSnapshotOptions): GapSnapshot {
  const stopped = new Set(allRecords.filter((r) => r.skipped !== undefined && BUDGET_REASONS.has(r.skipped)).map(inputKeyOf));
  const records = allRecords.filter((r) => !stopped.has(inputKeyOf(r)));
  const cellOf = options.cellOf ?? ((input: string) => gapCellOf(familyOfInput(input)));
  const valueOf = (r: SnapshotRecord): number | undefined => {
    const v = r.skipped === undefined ? r.measures[options.measure] : undefined;
    return v !== undefined && Number.isFinite(v) ? v : undefined;
  };
  const cellOrder: string[] = [];
  const cellInputs = new Map<string, Set<string>>();
  const byStrategy = new Map<string, SnapshotRecord[]>();
  for (const r of records) {
    const cell = cellOf(r.input);
    let inputs = cellInputs.get(cell);
    if (inputs === undefined) {
      inputs = new Set();
      cellInputs.set(cell, inputs);
      cellOrder.push(cell);
    }
    inputs.add(`${r.input}#${r.seed}`);
    const list = byStrategy.get(r.strategy);
    if (list === undefined) byStrategy.set(r.strategy, [r]);
    else list.push(r);
  }
  const strategies = [...byStrategy.keys()].sort().map((strategy): GapStrategy => {
    const own = byStrategy.get(strategy)!;
    const values = own.map(valueOf).filter((v): v is number => v !== undefined);
    const cells = cellOrder.flatMap((cell): GapCell[] => {
      const rs = own.filter((r) => cellOf(r.input) === cell);
      if (rs.length === 0) return [];
      const vs = rs.map(valueOf).filter((v): v is number => v !== undefined);
      const limit = options.limitOf?.(cell) ?? GAP_TOLERANCE;
      const out: GapCell = { cell, ...gapStats(vs), missing: rs.length - vs.length, atMargin: { limit, n: vs.filter((v) => v <= limit).length } };
      if (options.measure === "pack.gap") {
        const kinds: Record<string, number> = {};
        for (const r of rs) {
          const code = r.measures["pack.bound.kind"];
          if (code === undefined || valueOf(r) === undefined) continue;
          const kind = BOUND_KINDS[code] ?? "unknown";
          kinds[kind] = (kinds[kind] ?? 0) + 1;
        }
        out.kinds = kinds;
      }
      return [out];
    });
    return { strategy, records: own.length, all: { ...gapStats(values), missing: own.length - values.length }, cells };
  });
  const inputs = new Set(records.map((r) => `${r.input}#${r.seed}`)).size;
  return {
    schema: SNAPSHOT_SCHEMA,
    kind: "gaps",
    corpus: options.corpus,
    origin: options.origin,
    measure: options.measure,
    inputs,
    cells: cellOrder.map((cell) => ({ cell, inputs: cellInputs.get(cell)!.size })),
    strategies,
    ...(stopped.size === 0 ? {} : { stopped: stopped.size }),
    ...(options.budget === undefined ? {} : { budget: options.budget }),
  };
}

// ---- The space coverage (k105) ----

/** The count of the indices of each measure in the coverage snapshot */
export const COVERAGE_TOP = 6;

/** One measure of the coverage snapshot */
export interface CoverageSnapshotMeasure {
  id: string;
  scale: "linear" | "log";
  tolerance: number;
  n: number;
  /** The held-out mean absolute error of the model */
  mae: number;
  /** The held-out mean absolute error of the median of the training rows */
  baselineMae: number;
  /** The held-out median absolute error of the model */
  medianAe: number;
  /** The held-out median absolute error of the median of the training rows */
  baselineMedianAe: number;
  skill: number | null;
  share: number;
  shareOfMeasured: number;
  cells: { space: number; withRecords: number; covered: number };
  explained: { strategy: number; input: number; joint: number };
  noise: number;
  /** The highest first-order indices, `COVERAGE_TOP` or fewer */
  indices: { feature: string; group: "strategy" | "input"; index: number }[];
  /** The errors and the share of the folds by input, when the snapshot has them. This test is less strict. */
  byInput?: { mae: number; medianAe: number; share: number };
  /** The held-out test on the sampled pairs of the whole space (k112), when the snapshot has it */
  sampled?: CoverageSnapshotSampled;
  /** The same test by stratum, with the mean over the strata (k115), when the snapshot has it */
  strata?: CoverageSnapshotStrata;
  /** The rounds of the active sample (k116), when the snapshot has them */
  active?: CoverageSnapshotActive;
}

/** The evaluation sample with one model: the share, the mean absolute error and the mean over the strata with the same weight */
export interface CoverageSnapshotEval {
  share: number;
  mae: number;
  equal: number;
  /** The share with the family prior (k116), or `null` without a pair of a family of the prior. An older summary does not have it. */
  prior?: number | null;
  /** The effective count, the weighted pairs and the pairs with the weight 0 of the share with the prior (k119), when the summary has them */
  priorCount?: PriorCount;
}

/** The share of the sampled pairs with the family prior (k116). Each family has its share of the corpus inputs as its weight. */
export interface CoverageSnapshotPrior {
  /** The share with the weights, or `null` without a pair of a family of the corpus */
  share: number | null;
  /** The Wilson 95% interval with the effective count of the pairs, or `null` without a share */
  low: number | null;
  high: number | null;
  /** The effective count of the pairs of Kish */
  nEff: number;
  /** The pairs of a family of the corpus, and the pairs of other families with the weight 0 */
  weighted: number;
  zero: number;
  /** The weight of the families of the corpus with pairs, from 0 to 1 */
  covered: number;
  /** The kind of the prior (k119, k122): a kind of `PRIOR_KINDS`. An older summary does not have it. */
  kind?: PriorKind;
}

/** The basis of the family prior (k119): its kind, its corpora, the weight of each sampler family and the families without a weight */
export interface CoverageSnapshotBasis {
  kind: PriorKind;
  corpora: string[];
  /** The count of the distinct inputs of the corpora in a sampler family */
  inputs: number;
  families: { family: string; inputs: number; weight: number }[];
  /** The sampler families without an input in the corpora, with the weight 0 */
  absent: string[];
  /** The corpus families that the sampler does not draw */
  unmapped: { family: string; inputs: number }[];
  /** The families that are a stratum of their own, with no weight (k122). An older snapshot does not have them. */
  strata?: { family: string; inputs: number }[];
  /** The power of the prior `tempered` (k122) */
  power?: number;
}

/** The rounds of the active sample for one measure (k116) */
export interface CoverageSnapshotActive {
  /** The evaluation sample with the model of the grid only, or `null` without an evaluation sample */
  start: CoverageSnapshotEval | null;
  /** Each round: the hits of its new pairs with the model of the earlier rounds, and the evaluation sample after the round */
  rounds: { round: number; n: number; hits: number; share: number; low: number; high: number; mae: number; prior?: number | null; priorCount?: PriorCount; after: CoverageSnapshotEval | null }[];
}

/** The share of a part of the sampled pairs: its pairs, its hits and its share, or `null` without pairs */
export interface CoverageSnapshotPart {
  n: number;
  hits: number;
  share: number | null;
}

/** The held-out result of one measure by stratum: the mean over the strata with the same weight, and each stratum */
export interface CoverageSnapshotStrata {
  /** The mean of the shares of the strata with pairs */
  share: number;
  /** The 95% interval of the mean */
  low: number;
  high: number;
  /** The count of the strata with pairs */
  strata: number;
  /** Each stratum: its pairs, its hits, its share and the Wilson 95% interval. A stratum without pairs has `null`, not 0. */
  rows: { stratum: string; n: number; hits: number; share: number | null; low: number | null; high: number | null }[];
}

/** The held-out result of one measure on the sampled pairs of the whole space */
export interface CoverageSnapshotSampled {
  n: number;
  hits: number;
  share: number;
  /** The Wilson 95% interval of the share */
  low: number;
  high: number;
  mae: number;
  medianAe: number;
  baselineMae: number;
  baselineMedianAe: number;
  /** The share of the pairs with much forced overflow and of the other pairs (k116), when the summary has them */
  forced?: { heavy: CoverageSnapshotPart; rest: CoverageSnapshotPart };
  /** The share with the family prior of the corpus (k116), when the summary has it */
  prior?: CoverageSnapshotPrior;
  /** The share with the prior beside the headline, with its effective count (k122), when the summary has it */
  priorBeside?: { kind?: PriorKind; share: number | null; nEff: number };
}

/** The shares of the records of one run over an earlier list of strategies */
export interface CoverageOver {
  strategies: string[];
  shares: Record<string, number>;
  /** The measured records over this list */
  records?: number;
}

/** The start of the run of a coverage point: the weekly schedule, a dispatch by hand, or a push. */
export type CoverageTrigger = "schedule" | "dispatch" | "push";

/** This function gives the start of a run from the event of the run in GitHub Actions. An unknown event is an error. */
export function triggerOf(event: string): CoverageTrigger {
  if (event === "schedule" || event === "push") return event;
  if (event === "workflow_dispatch") return "dispatch";
  throw new Error(`The event of a coverage run must be schedule, workflow_dispatch or push, not '${event}'.`);
}

/** One point of the trend of the coverage: the share of each measure on one date */
export interface CoveragePoint {
  date: string;
  run: number | null;
  corpus: string;
  commit: string;
  /**
   * The strategies of the point, sorted. A point of a run before this field has no list.
   * A point joins the line of its own list, with one corpus and one method.
   */
  strategies?: string[];
  /** The method of the run, from `coverageMethod`. A point of a run before this field has no method, so it joins no other point. */
  method?: string;
  /** The start of the run. A point of a run before this field has no start. The start does not change the line of a point. */
  trigger?: CoverageTrigger;
  /** The shares of this point over each earlier list that it contains, with one method. Each one continues the line of that list. */
  over?: CoverageOver[];
  /** The measured records of the point. A slow pair that loses its row lowers this count, and the entry keeps its row. */
  records?: number;
  /** The read of the step from the earlier point of the line, over the pairs measured in both. */
  step?: CoverageStep;
  /** The entries of the earlier point of the corpus with no measured record here, each with its reason. Each one ends the line of a list that has it. */
  lost?: CoverageOtherEntry[];
  /** The share of each measure, with the folds of the summary */
  shares: Record<string, number>;
  /** The share of each measure with the folds by input, when the snapshot has them */
  sharesByInput?: Record<string, number>;
}

/**
 * This function gives the method of a run: its timed runs, its warm-up runs and its wall budget.
 * A run with a budget has 1 timed run for a slow pair and a censored record for a pair over its budget. Thus it does not join a run without a budget.
 */
export const coverageMethod = (run: { readonly repeats?: number; readonly warmup?: number; readonly budget?: unknown }): string | undefined =>
  run.repeats === undefined || run.warmup === undefined ? undefined : `repeats ${run.repeats}, warmup ${run.warmup}${run.budget === undefined ? "" : ", budget"}`;

/**
 * This function gives each earlier list of the trend that a new point continues. The list has one corpus, one method, and each strategy in the new list.
 * A list with a strategy that the new point does not have gives nothing. Dropping a hard entry can raise a share, so a lost entry ends the line, and `lostEntries` names it.
 */
export function earlierLists(trend: readonly CoveragePoint[], corpus: string, method: string | undefined, strategies: readonly string[]): string[][] {
  if (method === undefined) return [];
  const current = new Set(strategies);
  const lists = new Map<string, string[]>();
  for (const p of trend) {
    if (p.corpus !== corpus || p.method !== method || p.strategies === undefined) continue;
    if (p.strategies.length < current.size && p.strategies.every((s) => current.has(s))) lists.set(p.strategies.join(","), p.strategies);
  }
  return [...lists.values()];
}

/** The reason of a step with no figure. */
export const STEP_RECORDS_GONE = "the records of the earlier run are gone";

/**
 * The read of a step between two points of one line. `common` counts the pairs of a strategy and an input that are measured in both points.
 * `of` counts the pairs measured in either point, over the strategies of the earlier point, so a new entry does not change it.
 * `earlier` and `later` are the shares of each point over the common pairs. A step with `noRead` has no figure.
 */
export type CoverageStep =
  | { readonly from: number; readonly common: number; readonly of: number; readonly earlier: Record<string, number>; readonly later: Record<string, number> }
  | { readonly from: number; readonly noRead: string };

/**
 * This function gives the earlier point of a step. It is the last point of the corpus before the run `run`, when the new point continues its line.
 * The point must have a run, the same method and a list that the new list contains. A change of the method and a lost entry end a line, so they give no step.
 */
export function stepFrom(
  trend: readonly CoveragePoint[],
  corpus: string,
  method: string | undefined,
  strategies: readonly string[],
  run: number | undefined,
): (CoveragePoint & { run: number }) | undefined {
  const all = trend.filter((p) => p.corpus === corpus);
  const at = all.findIndex((p) => p.run === run);
  const last = (at === -1 ? all : all.slice(0, at)).at(-1);
  if (last === undefined || last.run === null || method === undefined || last.method !== method || last.strategies === undefined) return undefined;
  const current = new Set(strategies);
  return last.strategies.every((s) => current.has(s)) ? (last as CoveragePoint & { run: number }) : undefined;
}

/** The key of a pair of a record. */
const pairOf = (r: { readonly strategy: string; readonly input: string }): string => JSON.stringify([r.strategy, r.input]);

/**
 * This function gives the records of two points over the pairs measured in both, and the two counts of the step.
 * A skipped record is not measured, so a dropped pair leaves both sides. A dropped hard pair can raise a plain share, but it cannot raise a share over these pairs.
 */
export function commonPairs<R extends { readonly strategy: string; readonly input: string; readonly skipped?: unknown }>(
  earlier: readonly R[],
  later: readonly R[],
): { earlier: R[]; later: R[]; common: number; of: number } {
  const measured = (records: readonly R[]): R[] => records.filter((r) => r.skipped === undefined);
  const first = measured(earlier);
  const listed = new Set(first.map((r) => r.strategy));
  const second = measured(later).filter((r) => listed.has(r.strategy));
  const inFirst = new Set(first.map(pairOf));
  const inSecond = new Set(second.map(pairOf));
  const common = new Set([...inFirst].filter((k) => inSecond.has(k)));
  return {
    earlier: first.filter((r) => common.has(pairOf(r))),
    later: second.filter((r) => common.has(pairOf(r))),
    common: common.size,
    of: new Set([...inFirst, ...inSecond]).size,
  };
}

/** One entry of the bench with no measured record in a run, with each reason and its count of records. A reason with no row counts 0 records. */
export interface CoverageOtherEntry {
  entry: string;
  /** The value `msAtLeast` is the smallest lower bound on the time of the censored records of a reason. A reason that is no wall budget has its word on the page. */
  reasons: ({ because: string; records: number; msAtLeast?: number } & Partial<SkipRead>)[];
}

/** The entries of the bench against the entries with a measured record in the run. */
export interface CoverageEntries {
  planned: number;
  measured: number;
  others: CoverageOtherEntry[];
}

/** The snapshot of the space coverage: the last summary and the trend of the shares */
export interface CoverageSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "coverage";
  origin: SnapshotOrigin[];
  latest: {
    date: string;
    run: number | null;
    corpus: string;
    records: number;
    inputs: number;
    strategies: string[];
    /** The entries of the bench with and without a measured record, when the snapshot has them */
    entries?: CoverageEntries;
    model: CoverageSummary["model"];
    measures: CoverageSnapshotMeasure[];
    /**
     * The facts of the sample of the whole space (k112), when the snapshot has it.
     * Since k121, it also has the pairs that are not deterministic, and those of them with a clock limit.
     */
    sampled?: { pairs: number; seed: number | null; draw: string | null; configRejectionRate: number | null; hardPairs: number | null; nondeterministic?: number | null; nondeterministicClock?: number | null };
    /**
     * The facts of the strata of the sample (k115), when the snapshot has them: the draw and the pairs of each stratum.
     * A stratified sample also gives the count of the configs and of the missed pairs of each stratum.
     */
    strata?: { pairs: number; draw: string | null; strata: { id: string; pairs: number; configs?: string; missed?: number }[] };
    /**
     * The last sample with a uniform draw, with its run and its date, when a snapshot had one.
     * A stratified sample does not change it. Thus `sampled` of a stratified run is only the share pooled over the strata.
     */
    uniform?: CoverageSnapshotUniform;
    /** The facts of the active sample (k116), when the snapshot has it: its pairs, its feature set, its score, its pool and its rounds */
    active?: { pairs: number; features: string; score: string | null; pool: number | null; rounds: number; evalPairs: number | null };
    /** The basis of the family prior (k119), when the summary has it */
    prior?: CoverageSnapshotBasis;
  };
  /** The points of the trend, oldest first. A run has one point. */
  trend: CoveragePoint[];
}

/** The last sample of the whole space with a uniform draw: its run, its facts and the held-out result of each measure */
export interface CoverageSnapshotUniform {
  date: string;
  run: number | null;
  commit: string;
  pairs: number;
  seed: number | null;
  configRejectionRate: number | null;
  hardPairs: number | null;
  /** The held-out result of each measure on the pairs, by the id of the measure */
  measures: Record<string, CoverageSnapshotSampled>;
}

/** This function tells if the draw of a sample is uniform. A sample without a draw is from before k115, and it is uniform. */
const isUniform = (draw: string | null | undefined): boolean => draw === undefined || draw === null || draw === "uniform";

/**
 * This function gives the last uniform sample of an earlier snapshot. A snapshot from before `uniform` gives its own `sampled` section, if the draw is uniform.
 */
function uniformOf(earlier: CoverageSnapshot | undefined): CoverageSnapshotUniform | undefined {
  if (earlier === undefined) return undefined;
  if (earlier.latest.uniform !== undefined) return earlier.latest.uniform;
  const s = earlier.latest.sampled;
  if (s === undefined || !isUniform(s.draw)) return undefined;
  const measures = Object.fromEntries(earlier.latest.measures.flatMap((m) => (m.sampled === undefined ? [] : [[m.id, { ...m.sampled }]])));
  const commit = earlier.trend.find((p) => p.run === earlier.latest.run && p.date === earlier.latest.date)?.commit ?? earlier.origin[0]?.commit ?? "";
  return { date: earlier.latest.date, run: earlier.latest.run, commit, pairs: s.pairs, seed: s.seed, configRejectionRate: s.configRejectionRate, hardPairs: s.hardPairs, measures };
}

/** This function gives the snapshot form of the held-out result of one measure on the sampled pairs. */
const sampledOf = (m: SampledMeasure): CoverageSnapshotSampled => ({
  n: m.n,
  hits: m.hits,
  share: m.share,
  low: m.wilson.low,
  high: m.wilson.high,
  mae: m.mae,
  medianAe: m.medianAe,
  baselineMae: m.baseline.mae,
  baselineMedianAe: m.baseline.medianAe,
  ...(m.forced === undefined
    ? {}
    : {
        forced: {
          heavy: { n: m.forced.heavy.n, hits: m.forced.heavy.hits, share: m.forced.heavy.share },
          rest: { n: m.forced.rest.n, hits: m.forced.rest.hits, share: m.forced.rest.share },
        },
      }),
  ...(m.prior === undefined
    ? {}
    : {
        prior: {
          share: m.prior.share,
          low: m.prior.wilson?.low ?? null,
          high: m.prior.wilson?.high ?? null,
          nEff: m.prior.nEff,
          weighted: m.prior.weighted,
          zero: m.prior.zero,
          covered: m.prior.covered,
          ...(m.prior.kind === undefined ? {} : { kind: m.prior.kind }),
        },
      }),
  ...(m.priorBeside === undefined ? {} : { priorBeside: { ...(m.priorBeside.kind === undefined ? {} : { kind: m.priorBeside.kind }), share: m.priorBeside.share, nEff: m.priorBeside.nEff } }),
});

/** This function gives the share with the prior and its counts, as the summary has them. */
const priorPart = (m: { prior?: number | null; priorCount?: PriorCount }): { prior?: number | null; priorCount?: PriorCount } => ({
  ...(m.prior === undefined ? {} : { prior: m.prior }),
  ...(m.priorCount === undefined ? {} : { priorCount: { ...m.priorCount } }),
});

/** This function gives the snapshot form of the evaluation sample with one model. */
const evalOf = (e: EvalMeasure | undefined): CoverageSnapshotEval | null => (e === undefined ? null : { share: e.share, mae: e.mae, equal: e.equal, ...priorPart(e) });

/** This function gives the snapshot form of the rounds of the active sample for one measure, or `undefined` when no round has the measure. */
function activeOf(a: ActiveCoverage, id: string): CoverageSnapshotActive | undefined {
  const rounds = a.rounds.flatMap((r) => {
    const m = r.measures.find((x) => x.id === id);
    return m === undefined ? [] : [{ round: r.round, n: m.n, hits: m.hits, share: m.share, low: m.wilson.low, high: m.wilson.high, mae: m.mae, ...priorPart(m), after: evalOf(m.after) }];
  });
  return rounds.length === 0 ? undefined : { start: evalOf(a.start?.find((s) => s.id === id)), rounds };
}

/** This function gives the snapshot form of the held-out result of one measure by stratum. */
const strataOf = (m: StrataMeasure): CoverageSnapshotStrata => ({
  share: m.equal.share,
  low: m.equal.interval.low,
  high: m.equal.interval.high,
  strata: m.equal.strata,
  rows: m.strata.map((x) => ({ stratum: x.stratum, n: x.n, hits: x.hits, share: x.share, low: x.wilson?.low ?? null, high: x.wilson?.high ?? null })),
});

/**
 * This function gives the coverage snapshot of a summary of `coverage`. The trend keeps each point of the earlier
 * snapshot, and the new point takes the place of a point of the same run. A point without a run replaces a point with the same date and corpus.
 * The optional `byInput` is a second summary of the same records with the folds by input. Its numbers go next to the first numbers.
 *
 * A uniform sample of the summary gives `uniform`. Another summary keeps the `uniform` of the earlier snapshot.
 */
export function coverageSnapshot(
  summary: CoverageSummary,
  origin: SnapshotOrigin,
  earlier?: CoverageSnapshot,
  byInput?: CoverageSummary,
  entries?: CoverageEntries,
  line?: {
    readonly method?: string;
    readonly trigger?: CoverageTrigger;
    readonly over?: readonly CoverageOver[];
    readonly lost?: readonly CoverageOtherEntry[];
    readonly step?: CoverageStep;
  },
): CoverageSnapshot {
  const second = new Map((byInput?.measures ?? []).map((m) => [m.id, m]));
  const sampled = new Map((summary.sampled?.measures ?? []).map((m) => [m.id, m]));
  const strata = new Map((summary.strata?.measures ?? []).map((m) => [m.id, m]));
  const point: CoveragePoint = {
    date: summary.date,
    run: summary.run,
    corpus: summary.corpus,
    commit: origin.commit,
    strategies: [...summary.strategies].sort(),
    ...(line?.method === undefined ? {} : { method: line.method }),
    ...(line?.trigger === undefined ? {} : { trigger: line.trigger }),
    ...(line?.over === undefined || line.over.length === 0 ? {} : { over: [...line.over] }),
    records: summary.records,
    ...(line?.step === undefined ? {} : { step: line.step }),
    ...(line?.lost === undefined || line.lost.length === 0 ? {} : { lost: [...line.lost] }),
    shares: Object.fromEntries(summary.measures.map((m) => [m.id, m.share])),
    ...(byInput === undefined ? {} : { sharesByInput: Object.fromEntries(byInput.measures.map((m) => [m.id, m.share])) }),
  };
  const same = (p: CoveragePoint): boolean => (point.run === null ? p.date === point.date && p.corpus === point.corpus : p.run === point.run);
  const trend = [...(earlier?.trend ?? []).filter((p) => !same(p)), point].sort(
    (a, b) => a.date.localeCompare(b.date) || a.corpus.localeCompare(b.corpus) || (a.run ?? 0) - (b.run ?? 0),
  );
  const s = summary.sampled;
  const uniform: CoverageSnapshotUniform | undefined =
    s !== undefined && isUniform(s.sample?.draw)
      ? {
          date: summary.date,
          run: summary.run,
          commit: origin.commit,
          pairs: s.pairs,
          seed: s.sample?.seed ?? null,
          configRejectionRate: s.sample?.configRejectionRate ?? null,
          hardPairs: s.sample?.hardPairs ?? null,
          measures: Object.fromEntries(s.measures.map((m) => [m.id, sampledOf(m)])),
        }
      : uniformOf(earlier);
  return {
    schema: SNAPSHOT_SCHEMA,
    kind: "coverage",
    origin: [origin],
    latest: {
      date: summary.date,
      run: summary.run,
      corpus: summary.corpus,
      records: summary.records,
      inputs: summary.inputs,
      strategies: [...summary.strategies],
      ...(entries === undefined ? {} : { entries }),
      model: summary.model,
      measures: summary.measures.map((m) => ({
        id: m.id,
        scale: m.scale,
        tolerance: m.tolerance,
        n: m.n,
        mae: m.model.mae,
        baselineMae: m.baseline.mae,
        medianAe: m.model.medianAe,
        baselineMedianAe: m.baseline.medianAe,
        skill: m.skill,
        share: m.share,
        shareOfMeasured: m.shareOfMeasured,
        cells: { ...m.cells },
        explained: { ...m.explained },
        noise: m.noise,
        indices: m.indices.slice(0, COVERAGE_TOP).map((x) => ({ ...x })),
        ...(second.has(m.id) ? { byInput: { mae: second.get(m.id)!.model.mae, medianAe: second.get(m.id)!.model.medianAe, share: second.get(m.id)!.share } } : {}),
        ...(sampled.has(m.id) ? { sampled: sampledOf(sampled.get(m.id)!) } : {}),
        ...(strata.has(m.id) ? { strata: strataOf(strata.get(m.id)!) } : {}),
        ...((): { active?: CoverageSnapshotActive } => {
          const a = summary.active === undefined ? undefined : activeOf(summary.active, m.id);
          return a === undefined ? {} : { active: a };
        })(),
      })),
      ...(summary.sampled === undefined
        ? {}
        : {
            sampled: {
              pairs: summary.sampled.pairs,
              seed: summary.sampled.sample?.seed ?? null,
              draw: summary.sampled.sample?.draw ?? null,
              configRejectionRate: summary.sampled.sample?.configRejectionRate ?? null,
              hardPairs: summary.sampled.sample?.hardPairs ?? null,
              nondeterministic: summary.sampled.sample?.nondeterministic ?? null,
              nondeterministicClock: summary.sampled.sample?.nondeterministicClock ?? null,
            },
          }),
      ...(summary.strata === undefined ? {} : { strata: { pairs: summary.strata.pairs, draw: summary.strata.draw, strata: summary.strata.strata.map((x) => ({ ...x })) } }),
      ...(uniform === undefined ? {} : { uniform }),
      ...(summary.active === undefined
        ? {}
        : {
            active: {
              pairs: summary.active.pairs,
              features: summary.active.features,
              score: summary.active.facts?.score ?? null,
              pool: summary.active.facts?.pool ?? null,
              rounds: summary.active.rounds.length,
              evalPairs: summary.active.evalPairs,
            },
          }),
      ...(summary.prior === undefined
        ? {}
        : {
            prior: {
              kind: summary.prior.kind,
              corpora: [...summary.prior.corpora],
              inputs: summary.prior.inputs,
              families: summary.prior.families.map((f) => ({ ...f })),
              absent: [...summary.prior.absent],
              unmapped: summary.prior.unmapped.map((f) => ({ ...f })),
              ...(summary.prior.strata === undefined ? {} : { strata: summary.prior.strata.map((f) => ({ ...f })) }),
              ...(summary.prior.power === undefined ? {} : { power: summary.prior.power }),
            },
          }),
    },
    trend,
  };
}

// ---- The command line ----

/** This function gives the value of an option of the command line, or `undefined`. */
/**
 * This function reads the step of a new point: the fit of each point over the common pairs, with one set of options.
 * With no earlier point on the line, it gives nothing. With no records of the earlier run in `folder`, the step has no figure.
 */
function readStep(
  trend: readonly CoveragePoint[],
  now: {
    readonly corpus: string;
    readonly method: string | undefined;
    readonly strategies: readonly string[];
    readonly run: number | undefined;
    readonly records: readonly CoverageRecord[];
    readonly manifest: CoverageManifest;
    readonly options: CoverageOptions;
    readonly folder?: string;
  },
): CoverageStep | undefined {
  const from = stepFrom(trend, now.corpus, now.method, now.strategies, now.run);
  if (from === undefined) return undefined;
  if (now.folder === undefined || !existsSync(join(now.folder, "records.jsonl"))) return { from: from.run, noRead: STEP_RECORDS_GONE };
  const before = readRecords(readFileSync(join(now.folder, "records.jsonl"), "utf8"));
  const beforeManifest = JSON.parse(readFileSync(join(now.folder, "corpus.json"), "utf8")) as CoverageManifest;
  const pairs = commonPairs(before, now.records);
  const shares = (records: readonly CoverageRecord[], manifest: CoverageManifest): Record<string, number> =>
    Object.fromEntries(coverage(records, manifest, { ...now.options, by: "spec" }).measures.map((m) => [m.id, m.share]));
  return { from: from.run, common: pairs.common, of: pairs.of, earlier: shares(pairs.earlier, beforeManifest), later: shares(pairs.later, now.manifest) };
}

const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

/** This function gives each value of an option that the command line gives more than one time. */
const optionsOf = (argv: readonly string[], name: string): string[] => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]!] : []));

/** This function starts `git` with arguments and gives its output without the last line end. */
const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" }).trimEnd();

/** This function gives the first release tag that contains a commit, without its `v`, or `undefined`. */
function releaseOf(commit: string): string | undefined {
  const tags = git("tag", "--contains", commit, "--sort=v:refname").split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  return tags[0]?.slice(1);
}

/** This function gives the origin of the code of the latest release: the release tag at or before `HEAD`, its commit and its date. */
function releaseOrigin(source: string): SnapshotOrigin {
  const tag = git("describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD");
  const commit = `${tag}^{commit}`;
  return { release: tag.slice(1), commit: git("rev-parse", "--short=7", commit), date: git("show", "-s", "--format=%cs", commit), run: null, source };
}

/**
 * This function gives the origin of the data of a commit and a run. A commit outside the tags needs the release from the command line.
 * The date is the date of the commit, or `date` for a run that started later than its commit. The age of the data counts from that date.
 */
function originOf(commit: string, run: number | null, source: string, release?: string, date?: string): SnapshotOrigin {
  const found = release ?? releaseOf(commit);
  if (found === undefined) throw new Error(`No release tag contains the commit ${commit}. Give the release with --release.`);
  return { release: found, commit: git("rev-parse", "--short=7", commit), date: date ?? git("show", "-s", "--format=%cs", commit), run, source };
}

/** This function reads the option `--no-row`: pairs of an entry and its reason, as `entry=reason`, with `;` between the pairs. */
export function noRowOf(text: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (text ?? "").split(";").map((p) => p.trim()).filter((p) => p !== "")) {
    const at = pair.indexOf("=");
    if (at <= 0 || at === pair.length - 1) throw new Error(`Each part of --no-row must be entry=reason, not '${pair}'.`);
    out.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return out;
}

/** The reason of an entry with no row, when the command line does not state one */
export const NO_ROW_UNSTATED = "the run has no record of this entry";

/** The reason of a lost entry that is no longer a planned entry of the bench */
export const NOT_AN_ENTRY = "no longer an entry of the bench";

/** The longest text of an error in a reason */
const ERROR_TEXT_MAX = 160;

/**
 * This function counts the planned entries with a measured record, and gives the reasons of the other entries.
 * It throws an `Error` when `noRow` names an entry with a record or an entry that is not planned. Thus a stale reason does not reach the page.
 */
export function coverageEntries(
  records: readonly CoverageRecord[],
  planned: readonly string[],
  noRow: ReadonlyMap<string, string> = new Map(),
  errors: readonly { readonly strategy: string; readonly message: string }[] = [],
): CoverageEntries {
  const measured = new Set(records.filter((r) => r.skipped === undefined).map((r) => r.strategy));
  const skipped = new Map<string, Map<string, { records: number; msAtLeast?: number }>>();
  for (const r of records) {
    if (r.skipped === undefined) continue;
    const reasons = skipped.get(r.strategy) ?? new Map<string, { records: number; msAtLeast?: number }>();
    const was = reasons.get(r.skipped);
    const bounds = [was?.msAtLeast, r.msAtLeast].filter((b) => b !== undefined);
    reasons.set(r.skipped, { records: (was?.records ?? 0) + 1, ...(bounds.length === 0 ? {} : { msAtLeast: Math.min(...bounds) }) });
    skipped.set(r.strategy, reasons);
  }
  const failed = new Map<string, { first: string; records: number }>();
  for (const e of errors) failed.set(e.strategy, { first: failed.get(e.strategy)?.first ?? e.message.slice(0, ERROR_TEXT_MAX), records: (failed.get(e.strategy)?.records ?? 0) + 1 });
  for (const entry of noRow.keys()) {
    if (!planned.includes(entry)) throw new Error(`--no-row names ${entry}, which is not an entry of the bench.`);
    if (measured.has(entry) || skipped.has(entry) || failed.has(entry)) throw new Error(`--no-row names ${entry}, which has records in this run.`);
  }
  const others = [...planned]
    .filter((entry) => !measured.has(entry))
    .sort()
    .map((entry): CoverageOtherEntry => {
      const reasons = [...(skipped.get(entry) ?? [])].sort((a, b) => a[0].localeCompare(b[0])).map(([because, facts]) => ({ because, ...facts }));
      const error = failed.get(entry);
      const all = error === undefined ? reasons : [...reasons, { because: `error: ${error.first}`, records: error.records }];
      return { entry, reasons: all.length > 0 ? all : [{ because: `no row: ${noRow.get(entry) ?? NO_ROW_UNSTATED}`, records: 0 }] };
    });
  return { planned: planned.length, measured: planned.length - others.length, others };
}

/** This function gives each reason of the other entries its word. A wall budget has no word, because the strategy did not refuse the input. */
export function othersWithWords(entries: CoverageEntries): CoverageEntries {
  return {
    ...entries,
    others: entries.others.map((other) => ({
      ...other,
      reasons: other.reasons.map((r) => (BUDGET_REASONS.has(r.because) ? r : { ...r, ...skipRead(other.entry, r.because) })),
    })),
  };
}

/**
 * This function gives the entries of the earlier point of a corpus that have no measured record in this run, each with its reason.
 * It reads the last earlier point with a list, with any method. A later point of the same run does not count as earlier.
 */
export function lostEntries(trend: readonly CoveragePoint[], corpus: string, run: number | null, strategies: readonly string[], others: readonly CoverageOtherEntry[]): CoverageOtherEntry[] {
  const before = trend.filter((p) => p.corpus === corpus && p.run !== run && p.strategies !== undefined).at(-1);
  const reasons = new Map(others.map((o) => [o.entry, o.reasons]));
  return (before?.strategies ?? [])
    .filter((s) => !strategies.includes(s))
    .map((entry) => ({ entry, reasons: reasons.get(entry) ?? [{ because: NOT_AN_ENTRY, records: 0 }] }));
}

/** The file of the count of the entries with a measured record, over the corpora */
export const MEASURED_ENTRIES_FILE = "measured-entries.json";

/** How far the records of one entry reach in one run. */
export interface MeasuredEntry {
  entry: string;
  /** The records of the entry in the run with a measure. */
  measured: number;
  /** All the records of the entry in the run. */
  records: number;
  /** The records that a budget stopped. A refusal does not count here. */
  stopped: number;
  /** The largest item count of a measured record. The value is null when no input id of the entry gives a count. */
  largestItems: number | null;
  /**
   * The refused records with a word of `LEFT_OUT_WORDS`, by word (roadmap item k197). A word with no record has no key.
   * The measured share of the entry is `measured` over `records` less these records.
   */
  leftOut: Partial<Record<LeftOutWord, number>>;
}

/** One run of one corpus in the count of the entries. */
export interface MeasuredRow {
  corpus: string;
  run: number;
  date: string;
  /** The largest item count of any record of the run. The value is null when no input id gives a count. */
  largestItems: number | null;
  /** The planned entries with a record in the run, sorted. An entry with 0 measured records stays, because its records count in its share (roadmap item k197). */
  entries: MeasuredEntry[];
  /** The other names with a measured record in the run, sorted. A control is one of these. They do not count. */
  notPlanned: string[];
}

/** The snapshot of the planned entries with a measured record in any run of its rows. */
export interface MeasuredSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  kind: "measured";
  /** One origin for each row, in the same order. */
  origin: SnapshotOrigin[];
  planned: number;
  measured: number;
  /** The planned entries with no measured record in any row, sorted. */
  notMeasured: string[];
  rows: MeasuredRow[];
}

/** This function gives the item count in an input id, for example `pack-classes-v1/berkey-wang.I.fixed.n20/s1`, or null for an id with no count. */
export function itemsOfInput(input: string): number | null {
  const found = /\.n(\d+)(?:[./]|$)/.exec(input);
  return found === null ? null : Number(found[1]);
}

/** This function gives the larger of two item counts. A null count is no count. */
const largerItems = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));

/**
 * This function reads the records of one run into its row. A planned entry with only skipped records keeps its row entry with 0 measured records,
 * because its records count in its share. `measuredSnapshot` does not count it as measured. A name that is not planned counts only with a measured record.
 */
export function measuredRow(records: readonly CoverageRecord[], at: { readonly corpus: string; readonly run: number; readonly date: string }, planned: readonly string[]): MeasuredRow {
  const all = new Map<string, MeasuredEntry>();
  let largestItems: number | null = null;
  for (const r of records) {
    const was = all.get(r.strategy) ?? { entry: r.strategy, measured: 0, records: 0, stopped: 0, largestItems: null, leftOut: {} };
    const items = itemsOfInput(r.input);
    largestItems = largerItems(largestItems, items);
    const word = r.skipped === undefined || BUDGET_REASONS.has(r.skipped) ? undefined : leftOutWord(r.strategy, r.skipped);
    all.set(r.strategy, {
      ...was,
      leftOut: word === undefined ? was.leftOut : { ...was.leftOut, [word]: (was.leftOut[word] ?? 0) + 1 },
      records: was.records + 1,
      measured: was.measured + (r.skipped === undefined ? 1 : 0),
      stopped: was.stopped + (r.skipped !== undefined && BUDGET_REASONS.has(r.skipped) ? 1 : 0),
      largestItems: r.skipped === undefined ? largerItems(was.largestItems, items) : was.largestItems,
    });
  }
  const sorted = [...all.values()].sort((a, b) => a.entry.localeCompare(b.entry));
  return {
    ...at,
    largestItems,
    entries: sorted.filter((e) => planned.includes(e.entry)),
    notPlanned: sorted.filter((e) => e.measured > 0 && !planned.includes(e.entry)).map((e) => e.entry),
  };
}

/**
 * This function counts the planned entries with a measured record in any row, over the union of the rows. Each row has its origin at the same place of `origin`.
 * It reads the entries of a row again, so an entry that a later list does not plan stops counting.
 */
export function measuredSnapshot(rows: readonly { readonly row: MeasuredRow; readonly origin: SnapshotOrigin }[], planned: readonly string[]): MeasuredSnapshot {
  const sorted = [...rows].sort((a, b) => a.row.corpus.localeCompare(b.row.corpus));
  const found = new Set(sorted.flatMap(({ row }) => row.entries.filter((e) => e.measured > 0).map((e) => e.entry)));
  const measured = planned.filter((entry) => found.has(entry));
  return {
    schema: SNAPSHOT_SCHEMA,
    kind: "measured",
    origin: sorted.map(({ origin }) => origin),
    planned: planned.length,
    measured: measured.length,
    notMeasured: planned.filter((entry) => !found.has(entry)).sort(),
    rows: sorted.map(({ row }) => row),
  };
}

/** This function puts a row in the snapshot in place of the earlier row of its corpus. The rows of the other corpora stay. */
export function withMeasuredRow(earlier: MeasuredSnapshot | undefined, row: MeasuredRow, origin: SnapshotOrigin, planned: readonly string[]): MeasuredSnapshot {
  const kept = (earlier?.rows ?? []).flatMap((r, at) => (r.corpus === row.corpus ? [] : [{ row: r, origin: earlier!.origin[at]! }]));
  return measuredSnapshot([...kept, { row, origin }], planned);
}

/** This function keeps the records of the named strategies. It throws for a name without a record, so a misspelled name does not empty a table. */
export function recordsOfStrategies<R extends { strategy: string }>(records: readonly R[], names: readonly string[] | undefined): readonly R[] {
  if (names === undefined) return records;
  for (const name of names) {
    if (!records.some((r) => r.strategy === name)) throw new Error(`The run has no record of the strategy ${name}.`);
  }
  return records.filter((r) => names.includes(r.strategy));
}

/**
 * This function writes a snapshot as compact JSON with one line end at the end.
 * The site bundles each file as raw text, so each space is page weight (k186).
 */
export function writeSnapshot(file: string | URL, value: unknown): void {
  const path = file instanceof URL ? fileURLToPath(file) : resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value)}\n`;
  writeFileSync(path, text);
  console.log(`${path}: ${text.length} bytes`);
}

/** This function reads the folder of one artifact of `bench.yml`. */
function readRun(folder: string): {
  records: SnapshotRecord[];
  run: { corpus: string; commit: string; skipped?: unknown[]; budget?: RunBudget };
  specs: CorpusSpec[];
  inputs: { id: string; cell?: { containerSize?: string } }[];
} {
  const records = readJsonLines<SnapshotRecord>(readFileSync(join(folder, "records.jsonl"), "utf8"));
  const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { corpus: string; commit: string; budget?: RunBudget };
  const manifest = JSON.parse(readFileSync(join(folder, "corpus.json"), "utf8")) as { specs: CorpusSpec[]; inputs?: { id: string; cell?: { containerSize?: string } }[] };
  return { records, run, specs: manifest.specs, inputs: manifest.inputs ?? [] };
}

/** This function gives the leaf of `SELECT_TABLE` for each input of a corpus. It throws when a record has another input hash. */
function leavesOfRun(name: string, specs: readonly CorpusSpec[], records: readonly SnapshotRecord[]): (input: string) => number {
  const leaves = new Map<string, number>();
  const hashes = new Map<string, string>();
  for (const file of corpus(name, specs).inputs) {
    leaves.set(file.id, selectLeaf(selectFeatures(toPackInput(file))).leaf);
    hashes.set(file.id, file.hash);
  }
  for (const r of records) {
    if (r.inputHash !== undefined && hashes.get(r.input) !== r.inputHash) throw new Error(`The input ${r.input} of the records has another hash than the generated input.`);
  }
  return (input) => {
    const leaf = leaves.get(input);
    if (leaf === undefined) throw new Error(`The corpus ${name} has no input ${input}.`);
    return leaf;
  };
}

/**
 * The form of the name of a measured file of the branch `site-data`. Each file that a command of `site-data.yml` writes has this form.
 * A test reads the commands of the workflow, so a new command with a new file fails it until the file has a name here.
 */
const MEASURED_FILE = /^(?:strategies-.+|gaps-.+|coverage|select-table|measured-entries)\.json$/;

/** This function gives the names of the measured files of `after` that are new or differ from `before`, in name order. */
export function writtenFiles(before: string, after: string): string[] {
  const differs = (name: string): boolean => {
    const earlier = join(before, name);
    return !existsSync(earlier) || !readFileSync(earlier).equals(readFileSync(join(after, name)));
  };
  return readdirSync(after)
    .filter((name) => MEASURED_FILE.test(name) && differs(name))
    .sort();
}

/** This function starts a snapshot from the arguments of the command line. */
export function snapshotMain(argv: readonly string[]): void {
  const [kind, folder] = argv;
  const out = optionOf(argv, "--out");
  // The files that a run of `site-data.yml` writes. A file of another corpus stays out, so the branch keeps it as its own run wrote it.
  if (kind === "written") {
    const [, before, after, target] = argv;
    if (before === undefined || after === undefined || target === undefined) throw new Error("The command written needs <folder before> <folder after> <output folder>.");
    mkdirSync(target, { recursive: true });
    for (const name of writtenFiles(before, after)) {
      copyFileSync(join(after, name), join(target, name));
      console.log(name);
    }
    return;
  }
  if (kind === "strategies" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    if (!Number.isInteger(run)) throw new Error("The snapshot strategies needs --run <id>.");
    const data = readRun(folder);
    const origin = originOf(data.run.commit, run, `bench.yml, the artifact bench-${data.run.corpus}`, optionOf(argv, "--release"), optionOf(argv, "--date"));
    const budget = data.run.budget === undefined ? {} : { budget: snapshotBudget(data.run.budget) };
    const snap = strategySnapshot(data.records, { corpus: data.run.corpus, origin: [origin], baseline: optionOf(argv, "--baseline") ?? "rows", ...budget });
    writeSnapshot(out ?? new URL(`strategies-${data.run.corpus}.json`, SNAPSHOT_DIR), snap);
    return;
  }
  if (kind === "gaps" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    const measure = optionOf(argv, "--measure");
    if (!Number.isInteger(run) || !GAP_MEASURES.includes(measure as GapMeasure)) throw new Error(`The snapshot gaps needs --run <id> and --measure ${GAP_MEASURES.join("|")}.`);
    const data = readRun(folder);
    const sizes = new Map(data.inputs.map((i) => [i.id, i.cell?.containerSize]));
    const origin = originOf(data.run.commit, run, `bench.yml, the artifact bench-${data.run.corpus}`, optionOf(argv, "--release"), optionOf(argv, "--date"));
    const rule = (JSON.parse(readFileSync(new URL("solved-rule.json", SNAPSHOT_DIR), "utf8")) as { margins: Record<string, RuleMargin> }).margins[measure as GapMeasure]!;
    const snap = gapSnapshot(recordsOfStrategies(data.records, optionOf(argv, "--strategies")?.split(",")), {
      corpus: data.run.corpus,
      origin: [origin],
      measure: measure as GapMeasure,
      cellOf: (input) => gapCellOf(familyOfInput(input), sizes.get(input)),
      limitOf: (cell) => rule.cells[`${data.run.corpus}/${cell}`]?.limit ?? rule.limit,
      ...(data.run.budget === undefined ? {} : { budget: snapshotBudget(data.run.budget) }),
    });
    writeSnapshot(out ?? new URL(`gaps-${data.run.corpus}.json`, SNAPSHOT_DIR), snap);
    return;
  }
  // The row of a run in the count of the entries. The rows of the other corpora stay in the file.
  if (kind === "measured" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    const date = optionOf(argv, "--date");
    if (!Number.isInteger(run) || date === undefined) throw new Error("The snapshot measured needs --run <id> and --date YYYY-MM-DD.");
    const facts = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { corpus: string; commit: string };
    const planned = ENTRIES.map((e) => e.id);
    const row = measuredRow(readRecords(readFileSync(join(folder, "records.jsonl"), "utf8")), { corpus: facts.corpus, run, date }, planned);
    const origin = originOf(facts.commit, run, `bench.yml, the artifact bench-${facts.corpus}`, optionOf(argv, "--release"), date);
    const file = out ?? new URL(MEASURED_ENTRIES_FILE, SNAPSHOT_DIR);
    const earlier = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as MeasuredSnapshot) : undefined;
    const snap = withMeasuredRow(earlier, row, origin, planned);
    console.log(`The entries of ${facts.corpus}: ${row.entries.filter((e) => e.measured > 0).length} measured of ${row.entries.length}. The count over the corpora: ${snap.measured} of ${snap.planned}.`);
    writeSnapshot(file, snap);
    return;
  }
  // The run of the earlier point of a step, so that the workflow can get its records. With no step, the output is empty.
  if (kind === "coverage-earlier" && folder !== undefined) {
    const file = out ?? new URL("coverage.json", SNAPSHOT_DIR);
    if (!existsSync(file)) return;
    const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { corpus: string; repeats?: number; warmup?: number; budget?: unknown };
    const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8"));
    const strategies = [...new Set(records.filter((r) => r.skipped === undefined).map((r) => r.strategy))];
    const trend = (JSON.parse(readFileSync(file, "utf8")) as CoverageSnapshot).trend;
    const from = stepFrom(trend, run.corpus, coverageMethod(run), strategies, Number(optionOf(argv, "--run")));
    if (from !== undefined) console.log(String(from.run));
    return;
  }
  if (kind === "coverage" && folder !== undefined) {
    const options = coverageOptions(argv);
    if (options.run === undefined || options.date === undefined) throw new Error("The snapshot coverage needs --run <id> and --date YYYY-MM-DD.");
    const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8"));
    const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as {
      corpus: string;
      commit: string;
      repeats?: number;
      warmup?: number;
      budget?: unknown;
      errors?: readonly { strategy: string; message: string }[];
    };
    const manifest = JSON.parse(readFileSync(join(folder, "corpus.json"), "utf8")) as CoverageManifest;
    const origin = originOf(run.commit, options.run, `bench.yml, the artifact bench-${run.corpus}, and bench/coverage.ts`, optionOf(argv, "--release"), options.date);
    const file = out ?? new URL("coverage.json", SNAPSHOT_DIR);
    const earlier = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CoverageSnapshot) : undefined;
    // The site shows the folds by spec, the stricter test. The folds by input give the second number.
    const grid = coverage(records, manifest, { ...options, by: "spec" });
    const byInput = coverage(records, manifest, { ...options, by: "input" });
    // The sample of the whole space (k112): the folder `sample` of the run, or --sample <dir>
    const sampleDir = optionOf(argv, "--sample") ?? join(folder, "sample");
    const hasSample = existsSync(join(sampleDir, "records.jsonl"));
    // The active sample (k116): the folder `active` of the run, or --active <dir>. The sample above is its evaluation sample.
    const activeDir = optionOf(argv, "--active") ?? join(folder, "active");
    const hasActive = existsSync(join(activeDir, "records.jsonl"));
    const bySpec = {
      ...grid,
      ...(hasSample ? readSample(records, manifest, sampleDir, options) : {}),
      ...(hasActive ? { active: readActive(records, manifest, activeDir, { ...options, by: "spec" }, hasSample ? sampleDir : undefined) } : {}),
      // k119, k122: the basis of the family prior, the same weight for each family by default
      ...(hasSample || hasActive ? { prior: priorOf(manifest, options) } : {}),
    };
    const entries = othersWithWords(coverageEntries(records, ENTRIES.map((e) => e.id), noRowOf(optionOf(argv, "--no-row")), run.errors ?? []));
    // A new entry does not restart a line: the same fit over an earlier list gives the next point of that line.
    const method = coverageMethod(run);
    const event = optionOf(argv, "--event");
    const trigger = event === undefined ? undefined : triggerOf(event);
    const over = earlierLists(earlier?.trend ?? [], run.corpus, method, grid.strategies).map((list) => {
      const kept = new Set(list);
      const fit = coverage(records.filter((r) => kept.has(r.strategy)), manifest, { ...options, by: "spec" });
      return { strategies: list, shares: Object.fromEntries(fit.measures.map((m) => [m.id, m.share])), records: fit.records };
    });
    // A lost entry ends a line. The annotation makes it a finding of the run, in addition to the note of the page.
    const lost = lostEntries(earlier?.trend ?? [], run.corpus, options.run, grid.strategies, entries.others);
    for (const l of lost) console.log(`::warning::${l.entry} lost its row on ${run.corpus}: ${l.reasons.map((r) => r.because).join(", ")}`);
    const earlierFolder = optionOf(argv, "--earlier");
    const step = readStep(earlier?.trend ?? [], { corpus: run.corpus, method, strategies: grid.strategies, run: options.run ?? undefined, records, manifest, options, ...(earlierFolder === undefined ? {} : { folder: earlierFolder }) });
    if (step !== undefined) console.log(`The step from run ${step.from}: ${"noRead" in step ? `no read: ${step.noRead}` : `${step.common} common of ${step.of} pairs`}`);
    writeSnapshot(file, coverageSnapshot(bySpec, origin, earlier, byInput, entries, { ...(method === undefined ? {} : { method }), ...(trigger === undefined ? {} : { trigger }), over, lost, ...(step === undefined ? {} : { step }) }));
    return;
  }
  if (kind === "paired" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    const commit = optionOf(argv, "--commit");
    const release = optionOf(argv, "--release");
    const a = optionOf(argv, "--arm-a");
    const b = optionOf(argv, "--arm-b");
    if (!Number.isInteger(run) || commit === undefined || release === undefined || a === undefined || b === undefined) {
      throw new Error("The snapshot paired needs --run <id>, --commit <sha>, --release <version>, --arm-a <ref> and --arm-b <ref>.");
    }
    const artifact = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8")) as PairedArtifact;
    const records = readJsonLines<PairedRecord>(readFileSync(join(folder, "records.jsonl"), "utf8"));
    const origin = originOf(commit, run, `paired.yml, the artifact paired-${artifact.corpus}-${artifact.strategy}`, release);
    writeSnapshot(out ?? new URL("paired-k67.json", SNAPSHOT_DIR), pairedSnapshot(artifact, records, SLOW_SET, { a, b }, [origin]));
    return;
  }
  if (kind === "select") {
    const parse = (spec: string): { folder: string; run: number } => {
      const at = spec.lastIndexOf("=");
      return { folder: spec.slice(0, at), run: Number(spec.slice(at + 1)) };
    };
    const origin: SnapshotOrigin[] = [releaseOrigin("packages/packing/src/select.ts, SELECT_TABLE")];
    const train: LeafWins = new Map();
    for (const spec of optionsOf(argv, "--train").map(parse)) {
      const data = readRun(spec.folder);
      const wins = leafWins(data.records, "rows", "maxrects-bl", leavesOfRun(data.run.corpus, data.specs, data.records));
      for (const [leaf, w] of wins) {
        const t = train.get(leaf) ?? { wins: 0, of: 0 };
        train.set(leaf, { wins: t.wins + w.wins, of: t.of + w.of });
      }
      origin.push(originOf(data.run.commit, spec.run, `bench.yml, the artifact bench-${data.run.corpus} (training)`));
    }
    const tests: { corpus: string; wins: LeafWins }[] = [];
    for (const spec of optionsOf(argv, "--test").map(parse)) {
      const data = readRun(spec.folder);
      tests.push({ corpus: data.run.corpus, wins: leafWins(data.records, "rows", "maxrects-bl", leavesOfRun(data.run.corpus, data.specs, data.records)) });
      origin.push(originOf(data.run.commit, spec.run, `bench.yml, the artifact bench-${data.run.corpus} (test)`));
    }
    writeSnapshot(out ?? new URL("select-table.json", SNAPSHOT_DIR), selectSnapshot(train, tests, origin));
    return;
  }
  if (kind === "releases") {
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
    const lines = git("for-each-ref", "refs/tags", "--format=%(refname:short)|%(objectname:short=7)|%(creatordate:short)|%(subject)").split("\n");
    const tags: ReleaseTag[] = lines
      .map((l) => l.split("|"))
      .filter(([name]) => /^v\d+\.\d+\.\d+$/.test(name ?? ""))
      .map(([name, commit, date, ...subject]) => ({ version: name!.slice(1), commit: commit!, date: date!, subject: subject.join("|") }));
    const releases = releaseEntries(changelog, tags);
    const origin = releaseOrigin("packages/packing/CHANGELOG.md and the release tags");
    writeSnapshot(out ?? new URL("releases.json", SNAPSHOT_DIR), { schema: SNAPSHOT_SCHEMA, kind: "releases", origin: [origin], releases } satisfies ReleasesSnapshot);
    return;
  }
  throw new Error("Start a snapshot with: node bench/snapshot.ts strategies|paired|select|releases|gaps|coverage ... (see the head of bench/snapshot.ts)");
}

if (process.argv[1]?.endsWith("snapshot.ts") === true) snapshotMain(process.argv.slice(2));
