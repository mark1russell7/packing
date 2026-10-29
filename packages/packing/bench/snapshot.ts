// The snapshots of the site (roadmap item k32). Each snapshot is a small JSON file in `packages/site/data/`, with the
// summary of the records of one or more CI runs. The site reads only these files. The raw records stay out of git.
//
//   node bench/snapshot.ts strategies <run folder> --run <id> [--baseline rows] [--out <file>]
//   node bench/snapshot.ts paired <run folder> --run <id> --commit <sha> --release <version> --arm-a <ref> --arm-b <ref> [--out <file>]
//   node bench/snapshot.ts select --train <run folder>=<id> [...] --test <run folder>=<id> [...] [--out <file>]
//   node bench/snapshot.ts releases [--out <file>]
//   node bench/snapshot.ts gaps <run folder> --run <id> --measure pack.gap|pack.gapToOpt [--release <version>] [--out <file>]
//   node bench/snapshot.ts coverage <run folder> --run <id> --date YYYY-MM-DD [--release <version>] [--out <file>] [--sample <dir>]
//
// A run folder holds the files of one artifact of `bench.yml` or `paired.yml`: `records.jsonl`, `run.json` and `corpus.json`.
// `docs/BENCH.md` ("The snapshots of the site") tells the commands of the snapshots of today.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { coverage, coverageOptions, readRecords, readSample, type CoverageManifest, type CoverageSummary, type SampledMeasure, type StrataMeasure } from "./coverage.ts";
import { SLOW_SET, type PairedRecord, type PairedSummary } from "./paired.ts";

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
  readonly hard?: Readonly<Record<string, number>>;
  readonly ms?: number;
}

/** The measures of the strategy snapshot. `pack.fill` is the win measure, the others are guards. */
export const SNAPSHOT_MEASURES: readonly MeasureId[] = ["pack.fill", "pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea"];

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
}

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
}

/** The options of `strategySnapshot` */
export interface StrategySnapshotOptions {
  corpus: string;
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

/** This function gives the first sentence of a text. A sentence ends at a full stop before a space or the end. */
function firstSentence(text: string): string {
  const m = /^(.*?\.)(\s|$)/s.exec(text.trim());
  return (m?.[1] ?? text.trim()).replace(/\s+/g, " ");
}

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
    const breaking = /has breaking changes/.test(body) || /^### Breaking/m.test(body);
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
export function gapSnapshot(records: readonly SnapshotRecord[], options: GapSnapshotOptions): GapSnapshot {
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
      const out: GapCell = { cell, ...gapStats(vs), missing: rs.length - vs.length };
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
  /** Each stratum: its pairs, its hits, its share and the Wilson 95% interval */
  rows: { stratum: string; n: number; hits: number; share: number; low: number; high: number }[];
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
}

/** One point of the trend of the coverage: the share of each measure on one date */
export interface CoveragePoint {
  date: string;
  run: number | null;
  corpus: string;
  commit: string;
  /** The share of each measure, with the folds of the summary */
  shares: Record<string, number>;
  /** The share of each measure with the folds by input, when the snapshot has them */
  sharesByInput?: Record<string, number>;
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
    model: CoverageSummary["model"];
    measures: CoverageSnapshotMeasure[];
    /** The facts of the sample of the whole space (k112), when the snapshot has it */
    sampled?: { pairs: number; seed: number | null; draw: string | null; configRejectionRate: number | null; hardPairs: number | null };
    /** The facts of the strata of the sample (k115), when the snapshot has them: the draw and the pairs of each stratum */
    strata?: { pairs: number; draw: string | null; strata: { id: string; pairs: number }[] };
  };
  /** The points of the trend, oldest first. A date has one point for each corpus. */
  trend: CoveragePoint[];
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
});

/** This function gives the snapshot form of the held-out result of one measure by stratum. */
const strataOf = (m: StrataMeasure): CoverageSnapshotStrata => ({
  share: m.equal.share,
  low: m.equal.interval.low,
  high: m.equal.interval.high,
  strata: m.equal.strata,
  rows: m.strata.map((x) => ({ stratum: x.stratum, n: x.n, hits: x.hits, share: x.share, low: x.wilson.low, high: x.wilson.high })),
});

/**
 * This function gives the coverage snapshot of a summary of `coverage`. The trend keeps each point of the earlier
 * snapshot, and the new point takes the place of a point with the same date and corpus.
 * The optional `byInput` is a second summary of the same records with the folds by input. Its numbers go next to the first numbers.
 */
export function coverageSnapshot(summary: CoverageSummary, origin: SnapshotOrigin, earlier?: CoverageSnapshot, byInput?: CoverageSummary): CoverageSnapshot {
  const second = new Map((byInput?.measures ?? []).map((m) => [m.id, m]));
  const sampled = new Map((summary.sampled?.measures ?? []).map((m) => [m.id, m]));
  const strata = new Map((summary.strata?.measures ?? []).map((m) => [m.id, m]));
  const point: CoveragePoint = {
    date: summary.date,
    run: summary.run,
    corpus: summary.corpus,
    commit: origin.commit,
    shares: Object.fromEntries(summary.measures.map((m) => [m.id, m.share])),
    ...(byInput === undefined ? {} : { sharesByInput: Object.fromEntries(byInput.measures.map((m) => [m.id, m.share])) }),
  };
  const trend = [...(earlier?.trend ?? []).filter((p) => p.date !== point.date || p.corpus !== point.corpus), point].sort((a, b) => a.date.localeCompare(b.date) || a.corpus.localeCompare(b.corpus));
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
            },
          }),
      ...(summary.strata === undefined ? {} : { strata: { pairs: summary.strata.pairs, draw: summary.strata.draw, strata: summary.strata.strata.map((x) => ({ ...x })) } }),
    },
    trend,
  };
}

// ---- The command line ----

/** This function gives the value of an option of the command line, or `undefined`. */
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

/** This function gives the origin of the data of a commit and a run. A commit outside the tags needs the release from the command line. */
function originOf(commit: string, run: number | null, source: string, release?: string): SnapshotOrigin {
  const found = release ?? releaseOf(commit);
  if (found === undefined) throw new Error(`No release tag contains the commit ${commit}. Give the release with --release.`);
  return { release: found, commit: git("rev-parse", "--short=7", commit), date: git("show", "-s", "--format=%cs", commit), run, source };
}

/** This function writes a snapshot as JSON with one line end at the end. */
function writeSnapshot(file: string | URL, value: unknown): void {
  const path = file instanceof URL ? fileURLToPath(file) : resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value, null, 1)}\n`;
  writeFileSync(path, text);
  console.log(`${path}: ${text.length} bytes`);
}

/** This function reads the folder of one artifact of `bench.yml`. */
function readRun(folder: string): {
  records: SnapshotRecord[];
  run: { corpus: string; commit: string; skipped?: unknown[] };
  specs: CorpusSpec[];
  inputs: { id: string; cell?: { containerSize?: string } }[];
} {
  const records = readJsonLines<SnapshotRecord>(readFileSync(join(folder, "records.jsonl"), "utf8"));
  const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { corpus: string; commit: string };
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

/** This function starts a snapshot from the arguments of the command line. */
export function snapshotMain(argv: readonly string[]): void {
  const [kind, folder] = argv;
  const out = optionOf(argv, "--out");
  if (kind === "strategies" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    if (!Number.isInteger(run)) throw new Error("The snapshot strategies needs --run <id>.");
    const data = readRun(folder);
    const origin = originOf(data.run.commit, run, `bench.yml, the artifact bench-${data.run.corpus}`);
    const snap = strategySnapshot(data.records, { corpus: data.run.corpus, origin: [origin], baseline: optionOf(argv, "--baseline") ?? "rows" });
    writeSnapshot(out ?? new URL(`strategies-${data.run.corpus}.json`, SNAPSHOT_DIR), snap);
    return;
  }
  if (kind === "gaps" && folder !== undefined) {
    const run = Number(optionOf(argv, "--run"));
    const measure = optionOf(argv, "--measure");
    if (!Number.isInteger(run) || !GAP_MEASURES.includes(measure as GapMeasure)) throw new Error(`The snapshot gaps needs --run <id> and --measure ${GAP_MEASURES.join("|")}.`);
    const data = readRun(folder);
    const sizes = new Map(data.inputs.map((i) => [i.id, i.cell?.containerSize]));
    const origin = originOf(data.run.commit, run, `bench.yml, the artifact bench-${data.run.corpus}`, optionOf(argv, "--release"));
    const snap = gapSnapshot(data.records, {
      corpus: data.run.corpus,
      origin: [origin],
      measure: measure as GapMeasure,
      cellOf: (input) => gapCellOf(familyOfInput(input), sizes.get(input)),
    });
    writeSnapshot(out ?? new URL(`gaps-${data.run.corpus}.json`, SNAPSHOT_DIR), snap);
    return;
  }
  if (kind === "coverage" && folder !== undefined) {
    const options = coverageOptions(argv);
    if (options.run === undefined || options.date === undefined) throw new Error("The snapshot coverage needs --run <id> and --date YYYY-MM-DD.");
    const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8"));
    const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { corpus: string; commit: string };
    const manifest = JSON.parse(readFileSync(join(folder, "corpus.json"), "utf8")) as CoverageManifest;
    const origin = originOf(run.commit, options.run, `bench.yml, the artifact bench-${run.corpus}, and bench/coverage.ts`, optionOf(argv, "--release"));
    const file = out ?? new URL("coverage.json", SNAPSHOT_DIR);
    const earlier = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CoverageSnapshot) : undefined;
    // The site shows the folds by spec, the stricter test. The folds by input give the second number.
    const grid = coverage(records, manifest, { ...options, by: "spec" });
    const byInput = coverage(records, manifest, { ...options, by: "input" });
    // The sample of the whole space (k112): the folder `sample` of the run, or --sample <dir>
    const sampleDir = optionOf(argv, "--sample") ?? join(folder, "sample");
    const bySpec = existsSync(join(sampleDir, "records.jsonl")) ? { ...grid, ...readSample(records, manifest, sampleDir, options) } : grid;
    writeSnapshot(file, coverageSnapshot(bySpec, origin, earlier, byInput));
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
