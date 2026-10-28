// The cells of a candidate against a default (roadmap item k66, `docs/BENCH.md`, "The cells of a candidate"). It reads the
// records of one run and finds the cells where the candidate wins. It does not start a packer.
//
//   node bench/cells.ts <folder> --candidate <id> --default <id> --out <folder> [--times <folder>] [--held-out <seed>]
//     [--ns-per-item <n>]
//
// Each fill ratio of this script is `fill(candidate) / fill(default)`. A ratio above 1 tells that the candidate fills more.
// This direction is the opposite of the oriented ratios of `bench/promote.ts`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { medianRatio, pairedRatio } from "@mark1russell7/packing";
import { readRecords } from "./choose-sets.ts";
import { HELD_OUT_SEED, hardOf, seedOf, type HeldOut } from "./portfolio.ts";
import { cellsOf, hardTest, numText, pairsOf, PROMOTION_PARAMETERS, timeOf, timeTest, type InputCell, type PromotionRecord, type TimeResult } from "./promote.ts";

/** A win: the fill ratio of an input is this value or more, and the candidate adds no hard break. */
export const WIN_RATIO = 1.05;

/** A cell is clear when its win share is at least `1 - CLEAR_SHARE` or at most `CLEAR_SHARE`. */
export const CLEAR_SHARE = 0.2;

/**
 * The cost bound of the features of one item, in nanoseconds. The size spread needs one pass over the items with a log.
 * The value is a high estimate from the code, not a measured time.
 */
export const NS_PER_ITEM = 50;

/** The cheap features of an input. Each one comes from the cell of the input in `corpus.json`. */
export const FEATURES = Object.freeze(["count", "shape", "spread", "size", "order"] as const);

/** A cheap feature of an input. */
export type Feature = (typeof FEATURES)[number];

/** The values of the cheap features of an input. */
export type Features = Record<Feature, string>;

/** The cell of an input in `corpus.json`, with the fields that this script reads. */
export interface CorpusCell extends InputCell {
  sizes?: string;
  count?: string;
}

/** A record with the field `nodes`: the count of the boxes and the obstacles of the input. */
export interface CellRecord extends PromotionRecord {
  nodes?: number;
}

/** The facts of one input with a measured record of each strategy. */
export interface CellInput {
  input: string;
  /** The key of the cell: the input id without its seed */
  cell: string;
  seed: number | undefined;
  features: Features;
  candidateFill: number;
  defaultFill: number;
  /** The value `fill(candidate) / fill(default)`. Two fills of 0 give 1. Above 1, the candidate fills more. */
  candidateOverDefault: number;
  candidateHard: number;
  defaultHard: number;
  /** The value `true` when the candidate has no hard count above that of the default, by `hardTest` of `bench/promote.ts` */
  hardOk: boolean;
  win: boolean;
  /** The times of the time records, in milliseconds. They are absent without a time record. */
  candidateMs?: number;
  defaultMs?: number;
  /** The `nodes` of the time record of the default: a bound of the item count */
  nodes?: number;
}

/** The strategy that a selector picks. */
export type Choice = "candidate" | "default";

/** The facts of one cell. */
export interface CellFacts {
  cell: string;
  features: Features;
  inputs: number;
  wins: number;
  winShare: number;
  /** The median of `candidateOverDefault` over each input of the cell */
  medianRatio: number;
  /** The inputs of the training seeds */
  trainInputs: number;
  /** The median of `candidateOverDefault` over the training seeds. No training input gives `NaN`. */
  trainMedian: number;
  /** The pick of the selector: `candidate` when `trainMedian` is `WIN_RATIO` or more */
  pick: Choice;
  heldOutInputs: number;
}

/** The score of a selector on some inputs. */
export interface SelectorScore {
  inputs: number;
  /** The inputs where the selector picks the default */
  defaultPicks: number;
  defaultShare: number;
  /** The mean of `fill(pick) / fill(default) - 1` */
  gainMean: number;
  /** The mean gain of the oracle: on each input, the strategy with fewer hard breaks, then with more fill */
  oracleGainMean: number;
  /** The value `gainMean / oracleGainMean` */
  gainShare: number;
  /** The inputs where the pick agrees with the win of the input */
  accuracy: number;
  /** The inputs where the pick adds a hard break */
  hardBreaks: number;
  /** The inputs left out of the means: the default fills 0 and the pick does not */
  infinite: number;
}

/** The time of a selector on the inputs with time records. */
export interface SelectorTime {
  /** The ratio `t / max(b, floorMs / timeRatio)` of `timeTest`, with the time `t` of the pick */
  pick: TimeResult;
  /** The same ratio with the feature bound `nodes * nsPerItem` added to `t` */
  withFeatures: TimeResult;
  nsPerItem: number;
  /** The largest feature bound of one input, in milliseconds */
  featureMsMax: number;
}

/** A row of a table of the inputs by some features. */
export interface GroupRow {
  values: Features;
  inputs: number;
  cells: number;
  /** The cells where the selector picks the candidate */
  candidateCells: number;
  winShare: number;
  medianRatio: number;
  /** The median time of each strategy, in milliseconds. They are absent without time records. */
  candidateMs?: number;
  defaultMs?: number;
}

/** A leaf of a decision table. */
export interface Leaf {
  values: Partial<Features>;
  inputs: number;
  trainInputs: number;
  winShare: number;
  trainMedian: number;
  pick: Choice;
}

/** A decision table on some features. Each leaf picks with the rule of the selector on its training inputs. */
export interface DecisionTable {
  features: Feature[];
  leaves: Leaf[];
  leafCount: number;
  trainAccuracy: number;
  heldOutAccuracy: number;
  heldOut: SelectorScore;
  /** The time of the table on the held-out inputs. It is absent without time records. */
  time?: SelectorTime;
}

/** The report of the cells. */
export interface CellsReport {
  candidate: string;
  current: string;
  /** The direction of each ratio of the report */
  direction: string;
  winRatio: number;
  heldOut: HeldOut;
  inputs: number;
  /** The inputs without a measured record of each strategy */
  leftOut: number;
  wins: number;
  winShare: number;
  /** The median of `candidateOverDefault` over each input */
  medianRatio: number;
  /** The share of the inputs in a cell with a win share of `1 - CLEAR_SHARE` or more, or `CLEAR_SHARE` or less */
  clearShare: number;
  trainInputs: number;
  /** The share of all the inputs in a cell where the selector picks the default */
  defaultShareAll: number;
  /** The score of the cell selector on the held-out inputs */
  selector: SelectorScore;
  /** The time of the cell selector on the held-out inputs. It is absent without time records. */
  time?: SelectorTime;
  cells: CellFacts[];
  /** The features of the group tables: each feature with two values or more */
  groupFeatures: Feature[];
  groups: GroupRow[];
  /** The best decision table of 1, 2 and 3 features by the training accuracy */
  decision: DecisionTable[];
  /** Each decision table of 1, 2 and 3 features, without the leaves, sorted by the training accuracy */
  decisionRanks: Omit<DecisionTable, "leaves" | "time">[];
}

/** This function gives the key of the cell of an input: its id without the end `/s<seed>`. */
export const cellKeyOf = (input: string): string => input.replace(/\/s\d+$/, "");

/** This function gives the cheap features of a cell. A missing field gives `-`. */
export function featuresOf(cell: CorpusCell | undefined): Features {
  return {
    count: cell?.count ?? "-",
    shape: cell?.containerShape ?? "-",
    spread: cell?.sizes ?? "-",
    size: cell?.containerSize ?? "-",
    order: cell?.order ?? "-",
  };
}

/** This function gives the fill ratio `a / b` with no orientation. Two fills of 0 give 1. A fill of 0 for `b` alone gives `Infinity`. */
export const fillRatio = (a: number, b: number): number => pairedRatio(a, b, "lower");

/** This function gives the median of some values, or `NaN` for no value. */
const medianOf = (values: readonly number[]): number => (values.length === 0 ? NaN : medianRatio(values));

/** This function gives the mean of some values, or `NaN` for no value. */
const meanOf = (values: readonly number[]): number => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);

/** This function tells if an input is held out. */
const isHeldOut = (seed: number | undefined, heldOut: HeldOut): boolean => heldOut === "all" || seed === heldOut;

/**
 * This function gives the facts of each input with a measured record of each strategy. The pairs come from `pairsOf`,
 * and the hard test of one input is `hardTest` of `bench/promote.ts`.
 */
export function cellInputsOf(records: readonly CellRecord[], cells: ReadonlyMap<string, CorpusCell>, candidate: string, current: string, times?: readonly CellRecord[]): { inputs: CellInput[]; leftOut: number } {
  const { pairs, seen } = pairsOf(records, candidate, current);
  const timePairs = new Map((times === undefined ? [] : pairsOf(times, candidate, current).pairs).map((p) => [p.input, p]));
  const inputs = pairs.map((p): CellInput => {
    const candidateFill = p.candidate.measures["pack.fill"] ?? 0;
    const defaultFill = p.current.measures["pack.fill"] ?? 0;
    const ratio = fillRatio(candidateFill, defaultFill);
    const hardOk = hardTest([p]).breaks === 0;
    const out: CellInput = {
      input: p.input,
      cell: cellKeyOf(p.input),
      seed: seedOf(p.candidate),
      features: featuresOf(cells.get(p.input)),
      candidateFill,
      defaultFill,
      candidateOverDefault: ratio,
      candidateHard: hardOf(p.candidate),
      defaultHard: hardOf(p.current),
      hardOk,
      win: hardOk && ratio >= WIN_RATIO,
    };
    const t = timePairs.get(p.input);
    const candidateMs = t === undefined ? undefined : timeOf(t.candidate);
    const defaultMs = t === undefined ? undefined : timeOf(t.current);
    if (candidateMs !== undefined) out.candidateMs = candidateMs;
    if (defaultMs !== undefined) out.defaultMs = defaultMs;
    const nodes = (t?.current as CellRecord | undefined)?.nodes;
    if (nodes !== undefined) out.nodes = nodes;
    return out;
  });
  return { inputs, leftOut: seen - pairs.length };
}

/** This function groups some inputs by a key, in the order of the first input of each key. */
function groupBy<T>(values: readonly T[], key: (v: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const v of values) {
    const k = key(v);
    const list = out.get(k);
    if (list === undefined) out.set(k, [v]);
    else list.push(v);
  }
  return out;
}

/** This function gives the pick of the selector rule from the training ratios: the candidate when their median is `WIN_RATIO` or more. */
export const pickOf = (trainRatios: readonly number[]): Choice => (trainRatios.length > 0 && medianOf(trainRatios) >= WIN_RATIO ? "candidate" : "default");

/** This function gives the facts of each cell, with the pick of the cell selector from the training seeds. */
export function cellFactsOf(inputs: readonly CellInput[], heldOut: HeldOut): CellFacts[] {
  return [...groupBy(inputs, (i) => i.cell)].map(([cell, own]) => {
    const train = own.filter((i) => !isHeldOut(i.seed, heldOut)).map((i) => i.candidateOverDefault);
    const wins = own.filter((i) => i.win).length;
    return {
      cell,
      features: own[0]!.features,
      inputs: own.length,
      wins,
      winShare: wins / own.length,
      medianRatio: medianOf(own.map((i) => i.candidateOverDefault)),
      trainInputs: train.length,
      trainMedian: medianOf(train),
      pick: pickOf(train),
      heldOutInputs: own.length - train.length,
    };
  });
}

/** This function gives the pick of the oracle on one input: fewer hard breaks first, then more fill. A tie gives the default. */
export function oracleOf(i: CellInput): Choice {
  if (i.candidateHard !== i.defaultHard) return i.candidateHard < i.defaultHard ? "candidate" : "default";
  return i.candidateFill > i.defaultFill ? "candidate" : "default";
}

/** This function gives the fill of a pick on one input. */
const fillOf = (i: CellInput, pick: Choice): number => (pick === "candidate" ? i.candidateFill : i.defaultFill);

/** This function gives the score of a selector on some inputs. `pickFor` gives the pick of each input. */
export function scoreOf(inputs: readonly CellInput[], pickFor: (i: CellInput) => Choice): SelectorScore {
  const gains: number[] = [];
  const oracle: number[] = [];
  let defaultPicks = 0;
  let agree = 0;
  let hardBreaks = 0;
  let infinite = 0;
  for (const i of inputs) {
    const pick = pickFor(i);
    if (pick === "default") defaultPicks += 1;
    if ((pick === "candidate") === i.win) agree += 1;
    if (pick === "candidate" && !i.hardOk) hardBreaks += 1;
    const gain = fillRatio(fillOf(i, pick), i.defaultFill) - 1;
    const best = fillRatio(fillOf(i, oracleOf(i)), i.defaultFill) - 1;
    if (!Number.isFinite(gain) || !Number.isFinite(best)) {
      infinite += 1;
      continue;
    }
    gains.push(gain);
    oracle.push(best);
  }
  const n = inputs.length;
  const gainMean = meanOf(gains);
  const oracleGainMean = meanOf(oracle);
  return {
    inputs: n,
    defaultPicks,
    defaultShare: n === 0 ? NaN : defaultPicks / n,
    gainMean,
    oracleGainMean,
    gainShare: oracleGainMean > 0 ? gainMean / oracleGainMean : NaN,
    accuracy: n === 0 ? NaN : agree / n,
    hardBreaks,
    infinite,
  };
}

/** This function gives the time of a selector on the inputs with a time of each strategy, with `timeTest` of `bench/promote.ts`. */
export function selectorTimeOf(inputs: readonly CellInput[], pickFor: (i: CellInput) => Choice, nsPerItem = NS_PER_ITEM): SelectorTime {
  const timed = inputs.filter((i) => i.candidateMs !== undefined && i.defaultMs !== undefined);
  const featureMs = (i: CellInput): number => ((i.nodes ?? 0) * nsPerItem) / 1e6;
  const pickMs = (i: CellInput): number => (pickFor(i) === "candidate" ? i.candidateMs! : i.defaultMs!);
  const missing = inputs.length - timed.length;
  return {
    pick: timeTest(timed.map((i) => ({ candidate: pickMs(i), current: i.defaultMs! })), PROMOTION_PARAMETERS, missing),
    withFeatures: timeTest(timed.map((i) => ({ candidate: pickMs(i) + featureMs(i), current: i.defaultMs! })), PROMOTION_PARAMETERS, missing),
    nsPerItem,
    featureMsMax: Math.max(0, ...timed.map(featureMs)),
  };
}

/** This function gives the key of the values of some features. */
const valuesKey = (f: Features, features: readonly Feature[]): string => features.map((k) => f[k]).join(" / ");

/** This function gives the values of some features. */
const valuesOf = (f: Features, features: readonly Feature[]): Partial<Features> => Object.fromEntries(features.map((k) => [k, f[k]]));

/** This function gives the features with two values or more over some inputs, in the order of `FEATURES`. */
export const usedFeatures = (inputs: readonly CellInput[]): Feature[] => FEATURES.filter((k) => new Set(inputs.map((i) => i.features[k])).size > 1);

/** This function gives the rows of the inputs by some features, sorted by the keys of the values. */
export function groupsOf(inputs: readonly CellInput[], cells: readonly CellFacts[], features: readonly Feature[]): GroupRow[] {
  const pickOfCell = new Map(cells.map((c) => [c.cell, c.pick]));
  const rows = [...groupBy(inputs, (i) => valuesKey(i.features, features))].map(([, own]): GroupRow => {
    const ownCells = [...new Set(own.map((i) => i.cell))];
    const candidateMs = own.flatMap((i) => (i.candidateMs === undefined ? [] : [i.candidateMs]));
    const defaultMs = own.flatMap((i) => (i.defaultMs === undefined ? [] : [i.defaultMs]));
    return {
      values: own[0]!.features,
      inputs: own.length,
      cells: ownCells.length,
      candidateCells: ownCells.filter((c) => pickOfCell.get(c) === "candidate").length,
      winShare: own.filter((i) => i.win).length / own.length,
      medianRatio: medianOf(own.map((i) => i.candidateOverDefault)),
      ...(candidateMs.length === 0 ? {} : { candidateMs: medianOf(candidateMs) }),
      ...(defaultMs.length === 0 ? {} : { defaultMs: medianOf(defaultMs) }),
    };
  });
  return rows.toSorted((a, b) => valuesKey(a.values, features).localeCompare(valuesKey(b.values, features)));
}

/** This function gives the decision table of some features. Each leaf picks with `pickOf` on its training inputs. */
export function decisionOf(inputs: readonly CellInput[], features: readonly Feature[], heldOut: HeldOut, nsPerItem?: number): DecisionTable {
  const leaves = [...groupBy(inputs, (i) => valuesKey(i.features, features))].map(([, own]): Leaf => {
    const train = own.filter((i) => !isHeldOut(i.seed, heldOut)).map((i) => i.candidateOverDefault);
    return {
      values: valuesOf(own[0]!.features, features),
      inputs: own.length,
      trainInputs: train.length,
      winShare: own.filter((i) => i.win).length / own.length,
      trainMedian: medianOf(train),
      pick: pickOf(train),
    };
  });
  const pickByKey = new Map(leaves.map((l) => [features.map((k) => l.values[k]).join(" / "), l.pick]));
  const pickFor = (i: CellInput): Choice => pickByKey.get(valuesKey(i.features, features)) ?? "default";
  const train = inputs.filter((i) => !isHeldOut(i.seed, heldOut));
  const held = inputs.filter((i) => isHeldOut(i.seed, heldOut));
  const table: DecisionTable = {
    features: [...features],
    leaves: leaves.toSorted((a, b) => b.inputs - a.inputs),
    leafCount: leaves.length,
    trainAccuracy: scoreOf(train, pickFor).accuracy,
    heldOutAccuracy: scoreOf(held, pickFor).accuracy,
    heldOut: scoreOf(held, pickFor),
  };
  if (inputs.some((i) => i.candidateMs !== undefined)) table.time = selectorTimeOf(held, pickFor, nsPerItem);
  return table;
}

/** This function gives each subset of 1 to `largest` features, in the order of the features. */
export function subsetsOf(features: readonly Feature[], largest = 3): Feature[][] {
  const out: Feature[][] = [];
  const walk = (start: number, chosen: Feature[]): void => {
    if (chosen.length > 0) out.push(chosen);
    if (chosen.length === largest) return;
    for (let k = start; k < features.length; k++) walk(k + 1, [...chosen, features[k]!]);
  }
  walk(0, []);
  return out;
}

/** This function sorts decision tables: the higher training accuracy first, then fewer leaves. */
const byAccuracy = (a: DecisionTable, b: DecisionTable): number => b.trainAccuracy - a.trainAccuracy || a.leaves.length - b.leaves.length;

/** The options of the report of the cells. */
export interface CellsOptions {
  candidate: string;
  current: string;
  /** The cells of each input, by input id */
  cells: ReadonlyMap<string, CorpusCell>;
  /** The held-out split. The default is `HELD_OUT_SEED`. */
  heldOut?: HeldOut;
  /** The time records. Without them, the report has no time. */
  times?: readonly CellRecord[];
  nsPerItem?: number;
}

/** This function gives the report of the cells of a candidate against a default. */
export function cellsReportOf(records: readonly CellRecord[], options: CellsOptions): CellsReport {
  const heldOut = options.heldOut ?? HELD_OUT_SEED;
  const { inputs, leftOut } = cellInputsOf(records, options.cells, options.candidate, options.current, options.times);
  const cells = cellFactsOf(inputs, heldOut);
  const pickOfCell = new Map(cells.map((c) => [c.cell, c.pick]));
  const pickFor = (i: CellInput): Choice => pickOfCell.get(i.cell) ?? "default";
  const held = inputs.filter((i) => isHeldOut(i.seed, heldOut));
  const clear = cells.filter((c) => c.winShare >= 1 - CLEAR_SHARE || c.winShare <= CLEAR_SHARE).reduce((n, c) => n + c.inputs, 0);
  const wins = inputs.filter((i) => i.win).length;
  const groupFeatures = usedFeatures(inputs);
  const tables = subsetsOf(groupFeatures).map((f) => decisionOf(inputs, f, heldOut, options.nsPerItem));
  const best = [1, 2, 3].flatMap((n) => tables.filter((t) => t.features.length === n).toSorted(byAccuracy).slice(0, 1));
  const report: CellsReport = {
    candidate: options.candidate,
    current: options.current,
    direction: `each ratio is fill(${options.candidate}) / fill(${options.current}). Above 1, ${options.candidate} fills more.`,
    winRatio: WIN_RATIO,
    heldOut,
    inputs: inputs.length,
    leftOut,
    wins,
    winShare: inputs.length === 0 ? NaN : wins / inputs.length,
    medianRatio: medianOf(inputs.map((i) => i.candidateOverDefault)),
    clearShare: inputs.length === 0 ? NaN : clear / inputs.length,
    trainInputs: inputs.length - held.length,
    defaultShareAll: inputs.length === 0 ? NaN : inputs.filter((i) => pickFor(i) === "default").length / inputs.length,
    selector: scoreOf(held, pickFor),
    cells,
    groupFeatures,
    groups: groupsOf(inputs, cells, groupFeatures),
    decision: best,
    decisionRanks: tables.toSorted(byAccuracy).map(({ leaves: _, time: __, ...rest }) => rest),
  };
  if (options.times !== undefined) report.time = selectorTimeOf(held, pickFor, options.nsPerItem);
  return report;
}

/** This function writes a share as a number with 3 decimals. */
const share = (v: number): string => (Number.isNaN(v) ? "-" : v.toFixed(3));

/** This function writes the rows of a decision table. */
function leafRows(t: DecisionTable, candidate: string, current: string): string[] {
  const rows = [`| ${t.features.join(" | ")} | inputs | win share | training median ratio | pick |`, `|${t.features.map(() => "---|").join("")}---:|---:|---:|---|`];
  const sorted = t.leaves.toSorted((a, b) => valuesKey(a.values as Features, t.features).localeCompare(valuesKey(b.values as Features, t.features)));
  for (const l of sorted) rows.push(`| ${t.features.map((k) => l.values[k]).join(" | ")} | ${l.inputs} | ${share(l.winShare)} | ${numText(l.trainMedian)} | ${l.pick === "candidate" ? candidate : current} |`);
  return rows;
}

/** This function writes `cells.md`. */
export function cellsMarkdown(r: CellsReport): string {
  const s = r.selector;
  const name = (p: Choice): string => (p === "candidate" ? r.candidate : r.current);
  const lines = [
    `# The cells of \`${r.candidate}\` against \`${r.current}\``,
    "",
    `- The direction: ${r.direction} The field is \`candidateOverDefault\`.`,
    `- A win: the ratio is ${r.winRatio} or more, and \`${r.candidate}\` has no hard count above that of \`${r.current}\`.`,
    `- A cell is the input id without its seed. The held-out split is \`${r.heldOut}\`. The training inputs are the other seeds.`,
    `- The selector picks \`${r.candidate}\` in a cell when the median ratio of its training inputs is ${r.winRatio} or more.`,
    "",
    "| value | result |",
    "|---|---:|",
    `| inputs (left out) | ${r.inputs} (${r.leftOut}) |`,
    `| win share | ${share(r.winShare)} |`,
    `| median ratio | ${numText(r.medianRatio)} |`,
    `| share of the inputs in a clear cell (win share ${1 - CLEAR_SHARE} or more, or ${CLEAR_SHARE} or less) | ${share(r.clearShare)} |`,
    `| training inputs, held-out inputs | ${r.trainInputs}, ${s.inputs} |`,
    `| all inputs: share in a cell where the selector picks \`${r.current}\` | ${share(r.defaultShareAll)} |`,
    `| held out: share where the selector picks \`${r.current}\` | ${share(s.defaultShare)} |`,
    `| held out: mean fill gain of the selector, of the oracle | ${numText(s.gainMean)}, ${numText(s.oracleGainMean)} |`,
    `| held out: gain of the selector / gain of the oracle | ${numText(s.gainShare)} |`,
    `| held out: accuracy of the pick against the win | ${share(s.accuracy)} |`,
    `| held out: inputs where the pick adds a hard break | ${s.hardBreaks} |`,
  ];
  if (r.time !== undefined) {
    const t = r.time;
    lines.push(
      `| held out: time ratio of the selector, median and q${t.pick.tail.q} (${t.pick.inputs} inputs, ${t.pick.raised} at the floor of ${t.pick.floorMs} ms) | ${numText(t.pick.median.value)}, ${numText(t.pick.tail.value)} |`,
      `| held out: the same with the feature bound of ${t.nsPerItem} ns per node (largest ${numText(t.featureMsMax)} ms) | ${numText(t.withFeatures.median.value)}, ${numText(t.withFeatures.tail.value)} |`,
    );
  }
  const f = r.groupFeatures;
  const timed = r.time !== undefined;
  lines.push(
    "",
    "## The inputs by feature",
    "",
    `The column "picks" gives the cells where the selector picks \`${r.candidate}\`, of all the cells of the row.`,
    "",
    `| ${f.join(" | ")} | inputs | win share | median ratio | picks |${timed ? ` median ms \`${r.candidate}\` | median ms \`${r.current}\` |` : ""}`,
    `|${f.map(() => "---|").join("")}---:|---:|---:|---:|${timed ? "---:|---:|" : ""}`,
  );
  for (const g of r.groups) {
    const times = timed ? ` ${g.candidateMs === undefined ? "-" : numText(g.candidateMs)} | ${g.defaultMs === undefined ? "-" : numText(g.defaultMs)} |` : "";
    lines.push(`| ${f.map((k) => g.values[k]).join(" | ")} | ${g.inputs} | ${share(g.winShare)} | ${numText(g.medianRatio)} | ${g.candidateCells}/${g.cells} |${times}`);
  }
  lines.push("", "## The decision tables", "", "Each leaf picks with the rule of the selector on its training inputs. The accuracy compares the pick with the win of each input.", "");
  lines.push("| features | leaves | training accuracy | held-out accuracy | held-out gain share | held-out share of the default |", "|---|---:|---:|---:|---:|---:|");
  for (const t of r.decisionRanks.slice(0, 12)) {
    lines.push(`| ${t.features.join(", ")} | ${t.leafCount} | ${share(t.trainAccuracy)} | ${share(t.heldOutAccuracy)} | ${numText(t.heldOut.gainShare)} | ${share(t.heldOut.defaultShare)} |`);
  }
  for (const t of r.decision) {
    const head = `### ${t.features.length === 1 ? "1 feature" : `${t.features.length} features`}: ${t.features.join(", ")}`;
    const time = t.time === undefined ? "" : ` The held-out time ratio has the median ${numText(t.time.pick.median.value)} and the q${t.time.pick.tail.q} ${numText(t.time.pick.tail.value)}.`;
    lines.push("", head, "", `${t.leafCount} leaves. The training accuracy is ${share(t.trainAccuracy)}, and the held-out accuracy is ${share(t.heldOutAccuracy)}.${time}`, "");
    lines.push(...leafRows(t, r.candidate, r.current));
  }
  lines.push("", "## The cells", "", "| cell | inputs | win share | median ratio | training median ratio | pick |", "|---|---:|---:|---:|---:|---|");
  for (const c of r.cells.toSorted((a, b) => a.cell.localeCompare(b.cell))) lines.push(`| \`${c.cell}\` | ${c.inputs} | ${share(c.winShare)} | ${numText(c.medianRatio)} | ${numText(c.trainMedian)} | ${name(c.pick)} |`);
  lines.push("");
  return lines.join("\n");
}

/** This function writes a report as JSON. `Infinity` and `NaN` become strings. */
export const cellsJson = (r: CellsReport): string => `${JSON.stringify(r, (_, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v), 2)}\n`;

/** This function gives the value of an option of the command line, or `undefined`. */
const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

/** This function reads `records.jsonl` and `corpus.json` of a folder. */
function readFolder(folder: string): { records: CellRecord[]; manifest: { heldOut?: HeldOut } } {
  const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8")) as CellRecord[];
  const manifest = JSON.parse(readFileSync(join(folder, "corpus.json"), "utf8")) as { heldOut?: HeldOut };
  return { records, manifest };
}

/** This function starts the report from the arguments of the command line, writes `cells.md` and `cells.json`, and gives the report. */
export function cellsMain(argv: readonly string[]): CellsReport {
  const folder = argv[0];
  const candidate = optionOf(argv, "--candidate");
  const current = optionOf(argv, "--default");
  const out = optionOf(argv, "--out");
  if (folder === undefined || candidate === undefined || current === undefined || out === undefined) {
    throw new Error("Start the report with: node bench/cells.ts <folder> --candidate <id> --default <id> --out <folder> [--times <folder>] [--held-out <seed>] [--ns-per-item <n>]");
  }
  const { records, manifest } = readFolder(folder);
  const heldOutText = optionOf(argv, "--held-out");
  const heldOut: HeldOut = heldOutText === undefined ? (manifest.heldOut ?? HELD_OUT_SEED) : heldOutText === "all" ? "all" : Number(heldOutText);
  const timesFolder = optionOf(argv, "--times");
  const nsText = optionOf(argv, "--ns-per-item");
  const report = cellsReportOf(records, {
    candidate,
    current,
    cells: cellsOf(manifest) as Map<string, CorpusCell>,
    heldOut,
    ...(timesFolder === undefined ? {} : { times: readFolder(timesFolder).records }),
    ...(nsText === undefined ? {} : { nsPerItem: Number(nsText) }),
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "cells.json"), cellsJson(report));
  writeFileSync(join(out, "cells.md"), cellsMarkdown(report));
  console.log(`The cells of ${candidate} against ${current}: ${report.inputs} inputs, win share ${share(report.winShare)}, ${report.cells.length} cells, ${report.selector.inputs} held out.`);
  return report;
}

if (process.argv[1]?.endsWith("cells.ts") === true) cellsMain(process.argv.slice(2));
