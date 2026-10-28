// The screen guards of roadmap item k59 (`docs/BENCH.md`, "The screen guards"). These functions read the records of a run,
// also the records of all the jobs of a matrix. They give the fill without overflow, the overflow, the output groups and the activation.
// Roadmap item k60 adds the two-step ranking of each container shape: the overflow area above its bound, then the paired fill.

import { compareMeasure } from "@mark1russell7/layout-contract";
import { MEASURE_SPECS, quantile, round3, type MeasureId, type PackOutput } from "@mark1russell7/packing";
import { basesOf } from "./entries.ts";
import { portfolioMarkdown, portfolioOf, type BenchPortfolio, type PortfolioOptions } from "./portfolio.ts";

/** The id of the characteristic move of each entry. The trace of the entry has the count of the move with this id. */
export const MOVE_OF: Readonly<Record<string, string>> = Object.freeze({
  rows: "move.gapFill",
  shelf: "move.stack",
  skyline: "move.lowerWindow",
  push: "move.cascade",
  "shelf-next": "move.stack",
  "shelf-first": "move.firstFit",
  "shelf-best": "move.bestFit",
  "shelf-first-input": "move.firstFit",
  "maxrects-bssf": "move.bssf",
  "maxrects-blsf": "move.blsf",
  "maxrects-baf": "move.baf",
  "maxrects-bl": "move.split",
  "maxrects-cp": "move.cp",
  "skyline-mw": "move.minWaste",
  "skyline-bl-waste": "move.wasteFill",
  "skyline-mw-waste": "move.wasteFill",
  "portfolio-k2": "move.pick",
  "portfolio-k3": "move.pick",
  "aspect-fit-maxrects-bl": "move.aspectPick",
  "aspect-fit-maxrects-bssf": "move.aspectPick",
  "aspect-fit-portfolio-k2": "move.aspectPick",
  "portfolio-area-rows-bl": "move.pick",
  "select-rows-bl": "move.select",
  "restarts-maxrects-bl-k16": "move.restartPick",
  "restarts-rows-k16": "move.restartPick",
  "restarts-maxrects-bl-shuffle-k16": "move.restartPick",
});

/** The base of each variant: the same strategy without the options of the variant. The activation compares their outputs. */
export const BASE_OF: Readonly<Record<string, string>> = Object.freeze(basesOf());

/** The id of the measure of the runner for the boxes out of the true outline: `in-container` of `checkHard` with `exactContainer`. */
export const OUTSIDE_EXACT = "pack.outsideExact";

/** The overflow measures of the summary. The table gives the mean of each one, and `run.json` also gives the median. */
export const OVERFLOW_MEASURES: readonly string[] = [
  "pack.overflow",
  "pack.overflow.rate",
  "pack.overflow.area",
  "pack.overflow.forced",
  "pack.overflow.excess",
  "pack.overflow.forcedArea",
  "pack.overflow.excessArea",
];

/** The overflow measures with a median column in the summary: the measures by area of k60. */
export const AREA_MEASURES: readonly string[] = ["pack.overflow.forcedArea", "pack.overflow.excessArea"];

/** The measure of step 1 of the ranking. Lower is better. */
export const RANK_MEASURE: MeasureId = "pack.overflow.excessArea";

/** A fill ranking is `thin` when the common clean inputs are less than this share of the inputs of the cell. */
export const THIN_SHARE = 0.3;

/** The shape of an input that is not in the manifest. */
export const UNKNOWN_SHAPE = "unknown";

/** The part of a record that the screen reads. */
export interface ScreenRecord {
  strategy: string;
  input: string;
  measures: Record<string, number>;
  outputHash?: string;
  skipped?: string;
  /** The seed of the input. The portfolio report holds out one seed. */
  seed?: number;
  /** The median time of the timed runs, in milliseconds */
  ms?: number;
  /** The counts of the hard breaks of `checkHard` */
  hard?: Record<string, number>;
}

/** A median of the fill over some records. The median is absent when no record counts. */
export interface FillCount {
  records: number;
  median?: number;
}

/** The fill of one strategy: over all the measured records, and over the records with no overflow. */
export interface FillRank {
  all: FillCount;
  /** The records with `pack.overflow` 0. A layout that leaves items out gets a high fill. This rank does not reward it. */
  clean: FillCount;
}

/** The fill of one strategy, and of each container shape. */
export interface BenchFill extends FillRank {
  shapes: Record<string, FillRank>;
}

/** The overflow of one strategy over some records. */
export interface OverflowCell {
  records: number;
  /** The records with `pack.overflow` above 0 */
  overflowing: number;
  /** The value `overflowing / records`, rounded to 3 decimals */
  share: number;
  /** The mean of each measure of `OVERFLOW_MEASURES`, rounded to 3 decimals */
  means: Record<string, number>;
  /** The median of each measure of `OVERFLOW_MEASURES`, rounded to 3 decimals */
  medians: Record<string, number>;
  /** The sum of `pack.outsideExact` over the records */
  outsideExact: number;
}

/** The overflow of one strategy, and of each container shape. */
export interface BenchOverflow extends OverflowCell {
  shapes: Record<string, OverflowCell>;
}

/** A set of strategies with the same `outputHash` on each input that each pair of them measured. */
export interface OutputGroup {
  strategies: string[];
  /** The inputs that all the strategies of the group measured */
  inputs: number;
}

/** The count of the equal outputs of two strategies on their common inputs. */
export interface PairShare {
  a: string;
  b: string;
  inputs: number;
  equal: number;
  /** The value `equal / inputs`, rounded to 3 decimals */
  share: number;
}

/** The groups and the pairs of one container shape. */
export interface CellGroups {
  groups: OutputGroup[];
  pairs: PairShare[];
}

/** The activation of the move of one strategy over some records. */
export interface ActivationCell {
  move: string;
  records: number;
  /** The records with a count of the move above 0 */
  fired: number;
  /** The sum of the counts of the move */
  count: number;
  /** The base of a variant: the same strategy without the options of the variant. Only a variant has a base. */
  base?: string;
  /** The inputs where the variant and its base both have an output, and the outputs are not equal. Only a variant has it. */
  differs?: number;
  /** The label `exercised` when the move has a count above 0 on 1 input or more. A variant that differs from its base also gets it. */
  label: "exercised" | "not-exercised";
  /** The reason of the label `not-exercised` */
  reason?: string;
}

/** The activation of one strategy, and of each container shape. */
export interface BenchActivation extends ActivationCell {
  shapes: Record<string, ActivationCell>;
}

/**
 * One entry of the ranking of a cell: a strategy, or a cell group with equal outputs. The first member of a group gives
 * the values of the group.
 */
export interface RankEntry {
  /** The name of the entry: the strategy, or the members of the group with ` = ` between them */
  name: string;
  strategies: string[];
  /** The rank in the cell, from 1 */
  rank: number;
  /** The measured records of the entry in the cell */
  records: number;
  /** Step 1: the median of `pack.overflow.excessArea` over the measured records of the entry. Lower is better. */
  excessArea?: number;
  /** The tie group of step 1, from 1. The entries within the minimum effect of the best entry of the group are in it. */
  tieGroup?: number;
  /** Step 2: the median of `pack.fill` over the common clean inputs of the cell. Higher is better. */
  fill?: number;
  /**
   * The fill tie group of step 2, from 1. Neighbour entries of a tie group of step 1 share it when their `fill` values
   * are within the minimum effect of `pack.fill`. An entry with no tie of its fill has no fill tie group.
   */
  fillTie?: number;
  /** A diagnostic: the median of `pack.fill` over the records of the entry with no overflow. It is not paired. */
  diagnosticCleanFill?: number;
}

/** The ranking of one container shape. */
export interface CellRanking {
  /** The inputs of the cell: each input of the shape with a record */
  inputs: number;
  /** The inputs where each measured strategy of the cell has a record with `pack.overflow` 0 */
  commonClean: { inputs: number; share: number };
  /** The value `true` when `commonClean.share` is below `THIN_SHARE` */
  thin: boolean;
  /** The entries in the order of the ranking */
  entries: RankEntry[];
}

/** The screen of a run. Each field is a field of `run.json`. */
export interface BenchScreen {
  fill: Record<string, BenchFill>;
  overflow: Record<string, BenchOverflow>;
  /** The groups of the strategies that are equal on each common input. A group has 2 strategies or more. */
  outputGroups: OutputGroup[];
  /** The groups and the pairs of each container shape */
  cellGroups: Record<string, CellGroups>;
  activation: Record<string, BenchActivation>;
  /** The two-step ranking of each container shape: the overflow area above the bound, then the fill on the common clean inputs */
  ranking: Record<string, CellRanking>;
  /** The portfolio report of k20: the oracle, the best single entry, the greedy sets and the sole wins of each cell */
  portfolio: BenchPortfolio;
}

/** This function sums the counts of the moves of the trace of an output, by move id. */
export function moveCounts(output: PackOutput): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stage of output.trace ?? []) {
    for (const [id, n] of Object.entries(stage.measures ?? {})) if (id.startsWith("move.")) out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/** This function gives the container shape of each input id of a manifest. A value that is not a manifest gives an empty map. */
export function shapesOf(manifest: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const inputs = (manifest as { inputs?: unknown } | undefined)?.inputs;
  if (!Array.isArray(inputs)) return out;
  for (const entry of inputs as { id?: unknown; cell?: { containerShape?: unknown } }[]) {
    if (typeof entry.id === "string" && typeof entry.cell?.containerShape === "string") out.set(entry.id, entry.cell.containerShape);
  }
  return out;
}

const isMeasured = (r: ScreenRecord): boolean => r.skipped === undefined;
const share = (part: number, whole: number): number => (whole === 0 ? 0 : round3(part / whole));

/** This function gives the median fill of some records. */
function fillOf(records: readonly ScreenRecord[]): FillCount {
  const values = records.map((r) => r.measures["pack.fill"]).filter((v): v is number => v !== undefined);
  return values.length === 0 ? { records: 0 } : { records: values.length, median: round3(quantile(values, 0.5)) };
}

/** This function gives the fill of some records: over all of them, and over the records with no overflow. */
function rankOf(records: readonly ScreenRecord[]): FillRank {
  return { all: fillOf(records), clean: fillOf(records.filter((r) => r.measures["pack.overflow"] === 0)) };
}

/** This function gives the overflow of some records. */
function overflowOf(records: readonly ScreenRecord[]): OverflowCell {
  const means: Record<string, number> = {};
  const medians: Record<string, number> = {};
  for (const id of OVERFLOW_MEASURES) {
    const values = valuesOf(records, id);
    if (values.length === 0) continue;
    means[id] = round3(values.reduce((a, b) => a + b, 0) / values.length);
    medians[id] = round3(quantile(values, 0.5));
  }
  const overflowing = records.filter((r) => (r.measures["pack.overflow"] ?? 0) > 0).length;
  const outsideExact = records.reduce((sum, r) => sum + (r.measures[OUTSIDE_EXACT] ?? 0), 0);
  return { records: records.length, overflowing, share: share(overflowing, records.length), means, medians, outsideExact };
}

/** This function gives the values of one measure of some records. A record without the measure gives no value. */
function valuesOf(records: readonly ScreenRecord[], id: string): number[] {
  return records.map((r) => r.measures[id]).filter((v): v is number => v !== undefined);
}

/** This function gives the median of a list, rounded to 3 decimals. An empty list gives `undefined`. */
const medianOf = (values: readonly number[]): number | undefined => (values.length === 0 ? undefined : round3(quantile(values, 0.5)));

/**
 * This function gives the ranking of one container shape. `records` holds each record of the shape, also the skipped
 * records. `groups` holds the cell groups of the shape.
 *
 * - A strategy with no measured record in the cell is not ranked. The members of a cell group are one entry.
 * - Step 1 orders the entries by the median `pack.overflow.excessArea`. Lower is better.
 * - The entries within the minimum effect of the best entry make tie group 1. The rest make the next groups in the same way.
 * - Step 2 orders each tie group by the median `pack.fill` over the common clean inputs. Higher is better.
 * - Neighbour entries of step 2 with a fill within the minimum effect of `pack.fill` share a fill tie group.
 * - A common clean input has a record with `pack.overflow` 0 for each measured strategy of the cell.
 */
export function rankingOf(strategies: readonly string[], records: readonly ScreenRecord[], groups: readonly OutputGroup[] = []): CellRanking {
  const inputs = new Set(records.map((r) => r.input));
  const measured = records.filter(isMeasured);
  const byStrategy = new Map<string, Map<string, ScreenRecord>>();
  for (const r of measured) {
    const own = byStrategy.get(r.strategy) ?? new Map<string, ScreenRecord>();
    if (!own.has(r.input)) own.set(r.input, r);
    byStrategy.set(r.strategy, own);
  }
  const compared = [...new Set(strategies)].filter((s) => byStrategy.has(s));

  // The common clean inputs: each compared strategy has a measured record with no overflow on the input
  const clean = [...inputs].filter((input) => compared.length > 0 && compared.every((s) => byStrategy.get(s)!.get(input)?.measures["pack.overflow"] === 0));
  const commonShare = share(clean.length, inputs.size);

  // The entries: each cell group with a compared strategy, then each compared strategy of no group
  const members: string[][] = [];
  for (const g of groups) {
    const kept = g.strategies.filter((s) => compared.includes(s) && !members.some((m) => m.includes(s)));
    if (kept.length > 0) members.push(kept);
  }
  for (const s of compared) if (!members.some((m) => m.includes(s))) members.push([s]);

  const spec = MEASURE_SPECS[RANK_MEASURE];
  const entries = members.map((list): RankEntry => {
    const own = [...byStrategy.get(list[0]!)!.values()];
    const entry: RankEntry = { name: list.join(" = "), strategies: list, rank: 0, records: own.length };
    const excessArea = medianOf(valuesOf(own, RANK_MEASURE));
    const fill = medianOf(clean.map((input) => byStrategy.get(list[0]!)!.get(input)!.measures["pack.fill"]).filter((v): v is number => v !== undefined));
    const diagnostic = medianOf(valuesOf(own.filter((r) => r.measures["pack.overflow"] === 0), "pack.fill"));
    if (excessArea !== undefined) entry.excessArea = excessArea;
    if (fill !== undefined) entry.fill = fill;
    if (diagnostic !== undefined) entry.diagnosticCleanFill = diagnostic;
    return entry;
  });

  // Step 1: the tie groups, from the best value. An entry with no value is in no tie group.
  const open = entries.filter((e) => e.excessArea !== undefined).toSorted((a, b) => a.excessArea! - b.excessArea!);
  let group = 0;
  while (open.length > 0) {
    group++;
    const best = open[0]!.excessArea!;
    for (const e of open.filter((x) => compareMeasure(x.excessArea!, best, spec) === "tie")) {
      e.tieGroup = group;
      open.splice(open.indexOf(e), 1);
    }
  }
  // Step 2: in each tie group, the higher fill first. An entry with no fill goes last in its group.
  const ordered = entries.toSorted(
    (a, b) =>
      (a.tieGroup ?? Infinity) - (b.tieGroup ?? Infinity) ||
      (b.fill ?? -Infinity) - (a.fill ?? -Infinity) ||
      (a.excessArea ?? Infinity) - (b.excessArea ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
  for (const [i, e] of ordered.entries()) e.rank = i + 1;
  // The fill ties: a chain of neighbours of one tie group, each within the minimum effect of the fill of the next entry
  const fillSpec = MEASURE_SPECS["pack.fill"];
  let fillTie = 0;
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    if (a.tieGroup === undefined || a.tieGroup !== b.tieGroup || a.fill === undefined || b.fill === undefined) continue;
    if (compareMeasure(b.fill, a.fill, fillSpec) !== "tie") continue;
    if (a.fillTie === undefined) a.fillTie = ++fillTie;
    b.fillTie = a.fillTie;
  }
  // The flag uses the share before the rounding
  const thin = inputs.size === 0 || clean.length / inputs.size < THIN_SHARE;
  return { inputs: inputs.size, commonClean: { inputs: clean.length, share: commonShare }, thin, entries: ordered };
}

/**
 * This function gives the activation of the move of a strategy over some measured records. The list `skipped` holds the
 * skipped records of the same strategy and inputs. They give the reason when no record is measured.
 */
function activationOf(strategy: string, records: readonly ScreenRecord[], skipped: readonly ScreenRecord[] = [], base?: ReadonlyMap<string, string>): ActivationCell {
  const move = MOVE_OF[strategy];
  if (move === undefined) return { move: "-", records: records.length, fired: 0, count: 0, label: "not-exercised", reason: "The strategy has no characteristic move." };
  const counted = records.filter((r) => r.measures[move] !== undefined);
  const fired = counted.filter((r) => r.measures[move]! > 0).length;
  const count = counted.reduce((sum, r) => sum + r.measures[move]!, 0);
  const cell: Omit<ActivationCell, "label"> = { move, records: records.length, fired, count };
  // A variant with records of its base in the run also counts the inputs where its output is not the output of the base
  const baseId = BASE_OF[strategy];
  if (baseId !== undefined && base !== undefined) {
    cell.base = baseId;
    cell.differs = records.filter((r) => r.outputHash !== undefined && base.has(r.input) && base.get(r.input) !== r.outputHash).length;
  }
  if (fired > 0 || (cell.differs ?? 0) > 0) return { ...cell, label: "exercised" };
  let reason: string;
  if (records.length === 0 && skipped.length > 0) {
    const why = [...new Set(skipped.map((r) => r.skipped))].join(", ");
    reason = `No record is measured. The strategy skips each of the ${skipped.length} inputs: ${why}.`;
  } else if (records.length === 0) reason = "No record is measured.";
  else if (counted.length === 0) reason = `No record has a count of ${move}.`;
  else reason = `The count of ${move} is 0 on each of the ${counted.length} measured inputs.`;
  if (cell.base !== undefined && records.length > 0) reason += ` The output is the output of ${cell.base} on each common input.`;
  return { ...cell, label: "not-exercised", reason };
}

/** This function gives the hash of each measured input of each strategy. */
function hashesOf(strategies: readonly string[], records: readonly ScreenRecord[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>(strategies.map((s) => [s, new Map()]));
  for (const r of records) if (isMeasured(r) && r.outputHash !== undefined) out.get(r.strategy)?.set(r.input, r.outputHash);
  return out;
}

/** This function compares two strategies on their common inputs, of the inputs that `keep` accepts. */
function pairOf(a: string, b: string, hashes: Map<string, Map<string, string>>, keep: (input: string) => boolean): PairShare {
  const ha = hashes.get(a)!;
  const hb = hashes.get(b)!;
  let inputs = 0;
  let equal = 0;
  for (const [input, hash] of ha) {
    if (!keep(input)) continue;
    const other = hb.get(input);
    if (other === undefined) continue;
    inputs++;
    if (other === hash) equal++;
  }
  return { a, b, inputs, equal, share: share(equal, inputs) };
}

/**
 * This function puts the strategies into groups. Each strategy goes into the first group where each member is equal to it.
 * Two strategies are equal when they have 1 common input or more, and the same hash on each common input.
 * Only the groups with 2 strategies or more stay.
 */
function groupsOf(strategies: readonly string[], pairs: readonly PairShare[], hashes: Map<string, Map<string, string>>, keep: (input: string) => boolean): OutputGroup[] {
  const same = (a: string, b: string): boolean => pairs.some((p) => ((p.a === a && p.b === b) || (p.a === b && p.b === a)) && p.inputs > 0 && p.equal === p.inputs);
  const groups: string[][] = [];
  for (const s of strategies) {
    const group = groups.find((g) => g.every((m) => same(m, s)));
    if (group === undefined) groups.push([s]);
    else group.push(s);
  }
  return groups
    .filter((g) => g.length > 1)
    .map((g) => {
      const sets = g.map((s) => [...hashes.get(s)!.keys()].filter(keep));
      const inputs = sets[0]!.filter((input) => g.every((s) => hashes.get(s)!.has(input))).length;
      return { strategies: g, inputs };
    });
}

/** This function gives the pairs and the groups of the strategies over the inputs that `keep` accepts. */
function cellOf(strategies: readonly string[], hashes: Map<string, Map<string, string>>, keep: (input: string) => boolean): CellGroups {
  const pairs: PairShare[] = [];
  for (const [i, a] of strategies.entries()) {
    for (const b of strategies.slice(i + 1)) {
      const p = pairOf(a, b, hashes, keep);
      if (p.inputs > 0) pairs.push(p);
    }
  }
  return { groups: groupsOf(strategies, pairs, hashes, keep), pairs };
}

/** This function writes a number for a table, or `-`. */
const num = (v: number | undefined): string => (v === undefined ? "-" : String(round3(v)));

/** This function writes a fill median with its count of records. */
const fillText = (c: FillCount): string => `${num(c.median)} (${c.records})`;

/** This function sorts the rows by the fill with no overflow, the highest first. A row with no such record goes last. */
const byCleanFill = <T extends { rank: FillRank }>(rows: T[]): T[] => rows.toSorted((a, b) => (b.rank.clean.median ?? -1) - (a.rank.clean.median ?? -1));

/** This function writes the groups of a list as text: each group in code font, or `none`. */
const groupText = (groups: readonly OutputGroup[]): string =>
  groups.length === 0 ? "none" : groups.map((g) => `${g.strategies.map((s) => `\`${s}\``).join(" = ")} (${g.inputs} inputs)`).join(", ");

/**
 * This function writes the sections of the screen for `summary.md`: the ranking, the fill without overflow, the overflow,
 * the distinct outputs and the activation. A run without the screen gets one line for each section.
 */
export function screenMarkdown(screen: Partial<BenchScreen>, strategies: readonly string[]): string[] {
  const ids = [...new Set(strategies)];
  const { fill, overflow, outputGroups, cellGroups, activation, ranking } = screen;
  const lines: string[] = ["## Ranking", ""];
  if (ranking === undefined) lines.push("The run has no ranking. A `run.json` before k60 does not have it.");
  else {
    const spec = MEASURE_SPECS[RANK_MEASURE];
    lines.push(
      `Step 1 ranks each container shape by the median \`${RANK_MEASURE}\`. Lower is better. The entries within ${String(spec.minEffect)} of the best make one tie group.`,
      "Step 2 ranks each tie group by the median `pack.fill` on the common clean inputs. On these inputs, each measured strategy has `pack.overflow` 0.",
      `A cell is \`thin\` when the common clean inputs are less than ${THIN_SHARE} of its inputs. Its fill rank is then weak.`,
      "A cell group with equal outputs is one entry. The last fill column is a diagnostic: each strategy uses its own clean records, so it is not paired.",
      `The column \`fill tie\` gives the fill tie group: neighbour entries within ${String(MEASURE_SPECS["pack.fill"].minEffect)} of fill. Their order is a tie.`,
      "",
      "| container shape | common clean inputs | share | thin | rank | entry | excessArea (median) | tie group | fill, common clean (median) | fill tie | records | fill, own clean (diagnostic) |",
      "|---|---:|---:|---|---:|---|---:|---:|---:|---:|---:|---:|",
    );
    for (const [shape, c] of Object.entries(ranking) as [string, CellRanking][]) {
      for (const e of c.entries) {
        lines.push(
          `| ${shape} | ${c.commonClean.inputs}/${c.inputs} | ${c.commonClean.share} | ${c.thin ? "thin" : "no"} | ${e.rank} | ${e.name} | ${num(e.excessArea)} | ${e.tieGroup ?? "-"} | ${num(e.fill)} | ${e.fillTie === undefined ? "-" : `tie ${e.fillTie}`} | ${e.records} | ${num(e.diagnosticCleanFill)} |`,
        );
      }
    }
  }

  lines.push("", "## Fill without overflow", "");
  if (fill === undefined) lines.push("The run has no fill ranks. A `run.json` before k59 does not have them.");
  else {
    lines.push(
      "A layout that leaves items out gets a high fill. Thus the rank uses only the records with `pack.overflow` 0.",
      "This rank is a diagnostic. Each strategy has its own clean records, thus the rank is not paired. The section `Ranking` gives the paired rank.",
      "Each cell is the median of `pack.fill` and, in brackets, the count of the records.",
      "",
      "| rank | strategy | fill, no overflow | fill, all records |",
      "|---:|---|---:|---:|",
    );
    const rows = byCleanFill(ids.filter((id) => fill[id] !== undefined).map((id) => ({ id, rank: fill[id]! as FillRank })));
    for (const [i, r] of rows.entries()) lines.push(`| ${i + 1} | ${r.id} | ${fillText(r.rank.clean)} | ${fillText(r.rank.all)} |`);
    lines.push("", "| container shape | rank | strategy | fill, no overflow | fill, all records |", "|---|---:|---|---:|---:|");
    const shapes = [...new Set(ids.flatMap((id) => Object.keys(fill[id]?.shapes ?? {})))];
    for (const shape of shapes) {
      const cells = byCleanFill(ids.filter((id) => fill[id]?.shapes[shape] !== undefined).map((id) => ({ id, rank: fill[id]!.shapes[shape]! })));
      for (const [i, r] of cells.entries()) lines.push(`| ${shape} | ${i + 1} | ${r.id} | ${fillText(r.rank.clean)} | ${fillText(r.rank.all)} |`);
    }
  }

  lines.push("", "## Overflow", "");
  if (overflow === undefined) lines.push("The run has no overflow table. A `run.json` before k59 does not have it.");
  else {
    const short = (m: string): string => m.replace(/^pack\./, "");
    lines.push(
      "Each measure column is a mean, and each column `(median)` is a median. `outsideExact` is a sum.",
      "`forced` is a lower bound of the overflow count, and `excess` is the overflow above it. The count bound is weak on mixed sizes.",
      "`forcedArea` is a lower bound of the overflow area, and `excessArea` is the overflow area above it. Judge a strategy by `excessArea`.",
      "",
      `| strategy | container shape | records | with overflow | share | ${OVERFLOW_MEASURES.map(short).join(" | ")} | ${AREA_MEASURES.map((m) => `${short(m)} (median)`).join(" | ")} | outsideExact |`,
      `|---|---|---:|---:|---:|${OVERFLOW_MEASURES.map(() => "---:").join("|")}|${AREA_MEASURES.map(() => "---:").join("|")}|---:|`,
    );
    for (const id of ids) {
      const o = overflow[id];
      if (o === undefined) continue;
      for (const [shape, c] of [["all", o] as const, ...Object.entries(o.shapes)]) {
        const means = OVERFLOW_MEASURES.map((m) => num(c.means[m])).join(" | ");
        // A run.json before k60 has no medians
        const medians = AREA_MEASURES.map((m) => num(c.medians?.[m])).join(" | ");
        lines.push(`| ${id} | ${shape} | ${c.records} | ${c.overflowing} | ${c.share} | ${means} | ${medians} | ${c.outsideExact} |`);
      }
    }
  }

  lines.push("", "## Distinct outputs", "");
  if (outputGroups === undefined || cellGroups === undefined) lines.push("The run has no output groups. A `run.json` before k59 does not have them.");
  else {
    lines.push(
      "Two strategies are equal when their `outputHash` is the same on each input that both measured. The hash uses the placements rounded to 3 decimals.",
      "",
      `- Output groups, equal on each input: ${groupText(outputGroups)}.`,
      "",
      "| container shape | cell groups | pair | common inputs | equal | share |",
      "|---|---|---|---:|---:|---:|",
    );
    for (const [shape, c] of Object.entries(cellGroups) as [string, CellGroups][]) {
      if (c.pairs.length === 0) lines.push(`| ${shape} | ${groupText(c.groups)} | - | 0 | 0 | 0 |`);
      for (const p of c.pairs) lines.push(`| ${shape} | ${groupText(c.groups)} | ${p.a} / ${p.b} | ${p.inputs} | ${p.equal} | ${p.share} |`);
    }
  }

  lines.push("", "## Activation", "");
  if (activation === undefined) lines.push("The run has no activation. A `run.json` before k59 does not have it.");
  else {
    lines.push(
      "Each strategy counts its characteristic move in its trace. A strategy is `exercised` when the count is above 0 on 1 input or more.",
      "A variant is also `exercised` when its output is not the output of its base on 1 input or more.",
      "A strategy that is `not-exercised` stays in the screen, with its reason.",
      "",
      "| strategy | move | container shape | records | inputs with the move | count | inputs not equal to the base | label | reason |",
      "|---|---|---|---:|---:|---:|---:|---|---|",
    );
    for (const id of ids) {
      const a = activation[id];
      if (a === undefined) continue;
      for (const [shape, c] of [["all", a] as const, ...Object.entries(a.shapes)]) {
        const differs = c.base === undefined ? "-" : `${c.differs ?? 0} (${c.base})`;
        lines.push(`| ${id} | \`${c.move}\` | ${shape} | ${c.records} | ${c.fired} | ${c.count} | ${differs} | ${c.label} | ${c.reason ?? ""} |`);
      }
    }
  }
  lines.push("", ...portfolioMarkdown(screen.portfolio));
  return lines;
}

/**
 * This function gives the screen of the records of a run. The records of a matrix come from all its jobs, thus the
 * screen of a merge sees each strategy. `shapes` gives the container shape of each input id. `portfolio` goes to the portfolio report.
 */
export function screenOf(strategies: readonly string[], records: readonly ScreenRecord[], shapes: ReadonlyMap<string, string>, portfolio: PortfolioOptions = {}): BenchScreen {
  const shapeOf = (input: string): string => shapes.get(input) ?? UNKNOWN_SHAPE;
  const ids = [...new Set(strategies)];
  const measured = records.filter(isMeasured);
  const allShapes = [...new Set([...shapes.values(), ...records.map((r) => shapeOf(r.input))])];
  const screen: BenchScreen = { fill: {}, overflow: {}, outputGroups: [], cellGroups: {}, activation: {}, ranking: {}, portfolio: {} };
  const hashes = hashesOf(ids, measured);
  for (const id of ids) {
    const own = measured.filter((r) => r.strategy === id);
    // The hashes of the base of a variant, when the run has the base. A job of a matrix has only its own entry.
    const baseId = BASE_OF[id];
    const base = baseId === undefined ? undefined : hashesOf([baseId], measured).get(baseId);
    const baseOf = base !== undefined && base.size > 0 ? base : undefined;
    // Each shape where the strategy has a measured record
    const cells = allShapes.map((k) => [k, own.filter((r) => shapeOf(r.input) === k)] as const).filter(([, rs]) => rs.length > 0);
    const byShape = <T>(f: (rs: readonly ScreenRecord[]) => T): Record<string, T> => Object.fromEntries(cells.map(([k, rs]) => [k, f(rs)]));
    screen.fill[id] = { ...rankOf(own), shapes: byShape(rankOf) };
    screen.overflow[id] = { ...overflowOf(own), shapes: byShape(overflowOf) };
    // The activation has a cell for each shape where the strategy has a record, also a skipped record
    const skips = records.filter((r) => r.strategy === id && !isMeasured(r));
    const activationShapes = allShapes.filter((k) => [...own, ...skips].some((r) => shapeOf(r.input) === k));
    const onShape = (rs: readonly ScreenRecord[], k: string): ScreenRecord[] => rs.filter((r) => shapeOf(r.input) === k);
    screen.activation[id] = {
      ...activationOf(id, own, skips, baseOf),
      shapes: Object.fromEntries(activationShapes.map((k) => [k, activationOf(id, onShape(own, k), onShape(skips, k), baseOf)])),
    };
  }
  screen.outputGroups = cellOf(ids, hashes, () => true).groups;
  for (const k of allShapes) screen.cellGroups[k] = cellOf(ids, hashes, (input) => shapeOf(input) === k);
  // The ranking of a shape uses its cell groups, so the members of a group are one entry
  const own = records.filter((r) => ids.includes(r.strategy));
  for (const k of allShapes) {
    const ranking = rankingOf(ids, own.filter((r) => shapeOf(r.input) === k), screen.cellGroups[k]!.groups);
    if (ranking.entries.length > 0) screen.ranking[k] = ranking;
  }
  // The portfolio report of k20 reads the same records, by cell: all the shapes, then each shape
  screen.portfolio = portfolioOf(ids, own, shapeOf, allShapes, portfolio);
  return screen;
}
