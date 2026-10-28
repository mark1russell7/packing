// The screen guards of roadmap item k59 (`docs/BENCH.md`, "The screen guards"). These functions read the records of a run,
// also the records of all the jobs of a matrix. They give the fill without overflow, the overflow, the output groups and the activation.

import { quantile, round3, type PackOutput } from "@mark1russell7/packing";

/** The id of the characteristic move of each strategy. The trace of the strategy has the count of the move with this id. */
export const MOVE_OF: Readonly<Record<string, string>> = Object.freeze({
  rows: "move.gapFill",
  shelf: "move.stack",
  skyline: "move.lowerWindow",
  push: "move.cascade",
});

/** The id of the measure of the runner for the boxes out of the true outline: `in-container` of `checkHard` with `exactContainer`. */
export const OUTSIDE_EXACT = "pack.outsideExact";

/** The overflow measures of the summary. The table gives the mean of each one. */
export const OVERFLOW_MEASURES: readonly string[] = ["pack.overflow", "pack.overflow.rate", "pack.overflow.area", "pack.overflow.forced", "pack.overflow.excess"];

/** The shape of an input that is not in the manifest. */
export const UNKNOWN_SHAPE = "unknown";

/** The part of a record that the screen reads. */
export interface ScreenRecord {
  strategy: string;
  input: string;
  measures: Record<string, number>;
  outputHash?: string;
  skipped?: string;
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
  /** The label `exercised` when the move has a count above 0 on 1 input or more */
  label: "exercised" | "not-exercised";
  /** The reason of the label `not-exercised` */
  reason?: string;
}

/** The activation of one strategy, and of each container shape. */
export interface BenchActivation extends ActivationCell {
  shapes: Record<string, ActivationCell>;
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
  for (const id of OVERFLOW_MEASURES) {
    const values = records.map((r) => r.measures[id]).filter((v): v is number => v !== undefined);
    if (values.length > 0) means[id] = round3(values.reduce((a, b) => a + b, 0) / values.length);
  }
  const overflowing = records.filter((r) => (r.measures["pack.overflow"] ?? 0) > 0).length;
  const outsideExact = records.reduce((sum, r) => sum + (r.measures[OUTSIDE_EXACT] ?? 0), 0);
  return { records: records.length, overflowing, share: share(overflowing, records.length), means, outsideExact };
}

/**
 * This function gives the activation of the move of a strategy over some measured records. The list `skipped` holds the
 * skipped records of the same strategy and inputs. They give the reason when no record is measured.
 */
function activationOf(strategy: string, records: readonly ScreenRecord[], skipped: readonly ScreenRecord[] = []): ActivationCell {
  const move = MOVE_OF[strategy];
  if (move === undefined) return { move: "-", records: records.length, fired: 0, count: 0, label: "not-exercised", reason: "The strategy has no characteristic move." };
  const counted = records.filter((r) => r.measures[move] !== undefined);
  const fired = counted.filter((r) => r.measures[move]! > 0).length;
  const count = counted.reduce((sum, r) => sum + r.measures[move]!, 0);
  const cell = { move, records: records.length, fired, count };
  if (fired > 0) return { ...cell, label: "exercised" };
  let reason: string;
  if (records.length === 0 && skipped.length > 0) {
    const why = [...new Set(skipped.map((r) => r.skipped))].join(", ");
    reason = `No record is measured. The strategy skips each of the ${skipped.length} inputs: ${why}.`;
  } else if (records.length === 0) reason = "No record is measured.";
  else if (counted.length === 0) reason = `No record has a count of ${move}.`;
  else reason = `The count of ${move} is 0 on each of the ${counted.length} measured inputs.`;
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
 * This function writes the sections of the screen for `summary.md`: the fill without overflow, the overflow, the
 * distinct outputs and the activation. A run without the screen gets one line for each section.
 */
export function screenMarkdown(screen: Partial<BenchScreen>, strategies: readonly string[]): string[] {
  const ids = [...new Set(strategies)];
  const lines: string[] = ["## Fill without overflow", ""];
  const { fill, overflow, outputGroups, cellGroups, activation } = screen;
  if (fill === undefined) lines.push("The run has no fill ranks. A `run.json` before k59 does not have them.");
  else {
    lines.push(
      "A layout that leaves items out gets a high fill. Thus the rank uses only the records with `pack.overflow` 0.",
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
    const short = OVERFLOW_MEASURES.map((m) => m.replace(/^pack\./, ""));
    lines.push(
      "Each measure column is a mean. `forced` is a lower bound of the overflow, and `excess` is the overflow above it. `outsideExact` is a sum.",
      "",
      `| strategy | container shape | records | with overflow | share | ${short.join(" | ")} | outsideExact |`,
      `|---|---|---:|---:|---:|${short.map(() => "---:").join("|")}|---:|`,
    );
    for (const id of ids) {
      const o = overflow[id];
      if (o === undefined) continue;
      for (const [shape, c] of [["all", o] as const, ...Object.entries(o.shapes)]) {
        lines.push(`| ${id} | ${shape} | ${c.records} | ${c.overflowing} | ${c.share} | ${OVERFLOW_MEASURES.map((m) => num(c.means[m])).join(" | ")} | ${c.outsideExact} |`);
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
      "A strategy that is `not-exercised` stays in the screen, with its reason.",
      "",
      "| strategy | move | container shape | records | inputs with the move | count | label | reason |",
      "|---|---|---|---:|---:|---:|---|---|",
    );
    for (const id of ids) {
      const a = activation[id];
      if (a === undefined) continue;
      for (const [shape, c] of [["all", a] as const, ...Object.entries(a.shapes)]) {
        lines.push(`| ${id} | \`${c.move}\` | ${shape} | ${c.records} | ${c.fired} | ${c.count} | ${c.label} | ${c.reason ?? ""} |`);
      }
    }
  }
  return lines;
}

/**
 * This function gives the screen of the records of a run. The records of a matrix come from all its jobs, thus the
 * screen of a merge sees each strategy. `shapes` gives the container shape of each input id.
 */
export function screenOf(strategies: readonly string[], records: readonly ScreenRecord[], shapes: ReadonlyMap<string, string>): BenchScreen {
  const shapeOf = (input: string): string => shapes.get(input) ?? UNKNOWN_SHAPE;
  const ids = [...new Set(strategies)];
  const measured = records.filter(isMeasured);
  const allShapes = [...new Set([...shapes.values(), ...records.map((r) => shapeOf(r.input))])];
  const screen: BenchScreen = { fill: {}, overflow: {}, outputGroups: [], cellGroups: {}, activation: {} };
  for (const id of ids) {
    const own = measured.filter((r) => r.strategy === id);
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
      ...activationOf(id, own, skips),
      shapes: Object.fromEntries(activationShapes.map((k) => [k, activationOf(id, onShape(own, k), onShape(skips, k))])),
    };
  }
  const hashes = hashesOf(ids, measured);
  screen.outputGroups = cellOf(ids, hashes, () => true).groups;
  for (const k of allShapes) screen.cellGroups[k] = cellOf(ids, hashes, (input) => shapeOf(input) === k);
  return screen;
}
