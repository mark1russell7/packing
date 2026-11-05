// The tie moves of roadmap item k149: how far does a box move when one size of one item changes by 0.01?
// This script reads each option set of each strategy on one seeded family of inputs with ties. With --write, it writes the table
// bench/gates/tie-move.json. With --check, it reads again and fails when a row of the table differs.
// The script does not read the clock, so the same commit gives the same rows.
//
// The margin arm packs through a tie margin of 1: each size goes up to the top of its bucket, so a change inside a bucket gives
// the same input. The arm is a wrapper of this bench. It does not read a margin inside the comparisons of a strategy.
// The cells `edge` have their sizes at the edge of a bucket, so the margin gets no gain there. The row also states the fill that the margin costs.

import fs from "node:fs";
import path from "node:path";
import { allStrategies, packWith, UnsupportedCell, type Item, type LayoutContainer, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { random } from "@mark1russell7/rigor-generators";
import { ENTRIES } from "./entries.ts";
import { optionSets, type OptionSet } from "./whole-positions.ts";

/** The name of the input family of the read. A change to the family changes this name. */
export const TIE_SOURCE = "tie-move/1";

/** The schema of the table. */
export const TIE_SCHEMA = "packing-tie-move/1";

/** The file of the table. */
export const TIE_TABLE_FILE: URL = new URL("gates/tie-move.json", import.meta.url);

/** The kinds of input: 3 kinds with ties, a control with no ties, and an adversary at the edge of a bucket of the margin. */
export const TIE_KINDS = ["equal-heights", "equal-widths", "identical", "no-ties", "edge"] as const;

/** A kind of input. */
export type TieKind = (typeof TIE_KINDS)[number];

/** The modes of the container of the family. */
export const TIE_MODES = ["fixed", "freeHeight", "freeArea"] as const;

/** A mode of the container. */
export type TieMode = (typeof TIE_MODES)[number];

/** The ranges of the family. */
export const TIE_FAMILY: { readonly counts: readonly number[]; readonly seeds: readonly number[] } = { counts: [8, 20, 50], seeds: [1, 2] };

/** The change of one size. */
export const TIE_CHANGE = 0.01;

/** The width of a bucket of the margin. */
export const TIE_MARGIN = 1;

/** A move above this limit counts in the field `moved` of an arm. */
export const MOVE_LIMIT = 1;

/** The largest side of an item. */
const MAX_SIDE = 41;

/** The side of the items that tie. */
const TIE_SIDE = 20;

/** The fractional part of a size in the cells `edge`. A change of 0.01 takes the size over the edge of its bucket. */
const EDGE_PART = 0.495;

/** The step of the fractional parts of the cells `no-ties`. No 2 sizes differ by exactly the change, so the change makes no tie. */
const NO_TIE_STEP = 1 / 37;

/** The share of the total area that a container adds. */
const ROOM = 1.4;

/** One input of the family. */
export interface TieCell {
  readonly kind: TieKind;
  readonly mode: TieMode;
  readonly count: number;
  readonly seed: number;
}

/** This function gives each input of the family, in a fixed order. */
export function tieCells(): TieCell[] {
  return TIE_KINDS.flatMap((kind) => TIE_MODES.flatMap((mode) => TIE_FAMILY.counts.flatMap((count) => TIE_FAMILY.seeds.map((seed) => ({ kind, mode, count, seed })))));
}

/** This function gives the name of an input, for a row and a finding. */
export const tieName = (cell: TieCell): string => `${cell.kind}.${cell.mode}.n${cell.count}/s${cell.seed}`;

/** This function gives the input of a cell. The same cell gives the same input. */
export function tieInput(cell: TieCell): PackInput {
  const stream = random(`tie-move:${cell.kind}:${cell.count}:${cell.seed}`);
  const side = (): number => stream.int(1, MAX_SIDE);
  const sizes: Record<TieKind, (index: number) => { w: number; h: number }> = {
    "equal-heights": () => ({ w: side(), h: TIE_SIDE }),
    "equal-widths": () => ({ w: TIE_SIDE, h: side() }),
    identical: () => ({ w: TIE_SIDE, h: TIE_SIDE }),
    "no-ties": (index) => ({ w: side() + (index + 1) * NO_TIE_STEP, h: side() + (index + 1) * NO_TIE_STEP }),
    edge: () => ({ w: side() + EDGE_PART, h: TIE_SIDE + EDGE_PART }),
  };
  const items: Item[] = Array.from({ length: cell.count }, (_, index) => ({ id: `i${index}`, ...sizes[cell.kind](index) }));
  const area = items.reduce((sum, item) => sum + (item.w + TIE_MARGIN) * (item.h + TIE_MARGIN), 0);
  const width = Math.ceil(Math.sqrt(area * ROOM)) + MAX_SIDE;
  const containers: Record<TieMode, LayoutContainer> = { fixed: { fixed: "size", w: width, h: width }, freeHeight: { fixed: "width", w: width }, freeArea: { fixed: "none", aspectWeight: 0 } };
  return { container: containers[cell.mode], items };
}

/** This function gives the 2 changed copies of an input: the width and the height of the middle item go up by `TIE_CHANGE`. */
export function changesOf(input: PackInput): PackInput[] {
  const middle = Math.floor(input.items.length / 2);
  return (["w", "h"] as const).map((side) => ({
    ...input,
    items: input.items.map((item, index) => (index === middle ? { ...item, [side]: item[side] + TIE_CHANGE } : item)),
  }));
}

/** This function gives the top of the bucket of a size. A bucket has a whole number at its middle, so whole sizes are far from an edge. */
export const bucketTop = (size: number, margin: number = TIE_MARGIN): number => Math.ceil(size / margin + 0.5) * margin - margin / 2;

/** This function gives the input of the margin arm: each size at the top of its bucket. A box of the true size fits in the place of its bucket. */
export const marginInput = (input: PackInput): PackInput => ({
  ...input,
  items: input.items.map((item) => ({ ...item, w: bucketTop(item.w), h: bucketTop(item.h) })),
});

/** The read of the difference between 2 outputs. */
export interface MoveRead {
  /** The largest distance between the 2 positions of an item that both outputs place. */
  readonly move: number;
  /** The items that only one of the outputs places. */
  readonly dropped: number;
}

/** This function reads the difference between 2 outputs. */
export function moveOf(before: PackOutput, after: PackOutput): MoveRead {
  const places = new Map(before.placements.map((p) => [p.id, p]));
  let move = 0;
  let both = 0;
  for (const p of after.placements) {
    const q = places.get(p.id);
    if (q === undefined) continue;
    both += 1;
    move = Math.max(move, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return { move, dropped: before.placements.length + after.placements.length - 2 * both };
}

/** This function gives the share of the output that the true items fill. */
export function fillOf(input: PackInput, output: PackOutput): number {
  const sizes = new Map(input.items.map((item) => [item.id, item.w * item.h]));
  const used = output.placements.reduce((sum, p) => sum + (sizes.get(p.id) ?? 0), 0);
  const area = output.size.w * output.size.h;
  return area > 0 ? used / area : 0;
}

/** The read of one arm over its changes. */
export interface TieArm {
  /** The changes that the strategy packed. */
  readonly changes: number;
  /** The changes with a move above `MOVE_LIMIT`. */
  readonly moved: number;
  /** The changes that place another set of items. */
  readonly dropped: number;
  /** The largest move, in the units of the input, to 3 decimals. */
  readonly maxMove: number;
  /** The input of the largest move. */
  readonly at?: string;
}

/** The read of one option set. */
export interface TieRow {
  readonly optionSet: string;
  /** The inputs that the strategy packed. */
  readonly inputs: number;
  /** The packs that the strategy refused with `UnsupportedCell`. */
  readonly refused: number;
  /** The kinds `equal-heights`, `equal-widths` and `identical`. */
  readonly ties: TieArm;
  /** The control `no-ties`. */
  readonly none: TieArm;
  /** The adversary `edge`. */
  readonly edge: TieArm;
  /** The kinds of `ties` through the margin. */
  readonly marginTies: TieArm;
  /** The adversary `edge` through the margin. */
  readonly marginEdge: TieArm;
  /** The mean fill that the margin loses on the inputs of `ties`, to 4 decimals. */
  readonly fillLost: number;
}

/** The function that packs one input. The flip test gives a function with a fault. */
export type TiePack = (set: OptionSet, input: PackInput, seed: number) => PackOutput;

const packSet: TiePack = (set, input, seed) => packWith(set.strategy, input, set.options, seed);

/** The read of one option set, with the details that a finding names. The table keeps only `row`. */
export interface TieRead {
  readonly strategy: string;
  readonly row: TieRow;
  readonly errors: number;
  readonly firstError?: string;
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

/** One arm during a read. */
interface OpenArm {
  changes: number;
  moved: number;
  dropped: number;
  maxMove: number;
  at?: string;
}

const openArm = (): OpenArm => ({ changes: 0, moved: 0, dropped: 0, maxMove: 0 });

const closeArm = ({ at, ...arm }: OpenArm): TieArm => ({ ...arm, maxMove: round(arm.maxMove, 3), ...(arm.maxMove > 0 && at !== undefined ? { at } : {}) });

/** This function adds one change to an arm. */
function addChange(arm: OpenArm, read: MoveRead, name: string): void {
  arm.changes += 1;
  if (read.move > MOVE_LIMIT) arm.moved += 1;
  if (read.dropped > 0) arm.dropped += 1;
  if (read.move > arm.maxMove) {
    arm.maxMove = read.move;
    arm.at = name;
  }
}

/** This function reads one option set over some cells. An error other than `UnsupportedCell` counts, and the read goes on. */
export function readTieSet(set: OptionSet, cells: readonly TieCell[], pack: TiePack = packSet): TieRead {
  const arms = { ties: openArm(), none: openArm(), edge: openArm(), marginTies: openArm(), marginEdge: openArm() };
  let inputs = 0;
  let refused = 0;
  let errors = 0;
  let firstError: string | undefined;
  let fillSum = 0;
  let fillInputs = 0;
  const attempt = (input: PackInput, cell: TieCell): PackOutput | undefined => {
    try {
      return pack(set, input, cell.seed);
    } catch (error) {
      if (error instanceof UnsupportedCell) {
        refused += 1;
      } else {
        errors += 1;
        firstError ??= `${tieName(cell)}: ${error instanceof Error ? error.message : String(error)}`;
      }
      return undefined;
    }
  };
  for (const cell of cells) {
    const input = tieInput(cell);
    const changes = changesOf(input);
    const base = attempt(input, cell);
    if (base !== undefined) {
      inputs += 1;
      const arm = cell.kind === "no-ties" ? arms.none : cell.kind === "edge" ? arms.edge : arms.ties;
      for (const changed of changes) {
        const after = attempt(changed, cell);
        if (after !== undefined) addChange(arm, moveOf(base, after), tieName(cell));
      }
    }
    if (cell.kind === "no-ties") continue;
    const marginBase = attempt(marginInput(input), cell);
    if (marginBase === undefined) continue;
    const arm = cell.kind === "edge" ? arms.marginEdge : arms.marginTies;
    for (const changed of changes) {
      const after = attempt(marginInput(changed), cell);
      if (after !== undefined) addChange(arm, moveOf(marginBase, after), tieName(cell));
    }
    if (cell.kind !== "edge" && base !== undefined) {
      fillSum += fillOf(input, base) - fillOf(input, marginBase);
      fillInputs += 1;
    }
  }
  return {
    strategy: set.strategy,
    row: {
      optionSet: set.optionSet,
      inputs,
      refused,
      ties: closeArm(arms.ties),
      none: closeArm(arms.none),
      edge: closeArm(arms.edge),
      marginTies: closeArm(arms.marginTies),
      marginEdge: closeArm(arms.marginEdge),
      fillLost: fillInputs === 0 ? 0 : round(fillSum / fillInputs, 4),
    },
    errors,
    ...(firstError === undefined ? {} : { firstError }),
  };
}

/** The table of the reads, by strategy. */
export type TieTable = Readonly<Record<string, readonly TieRow[]>>;

/** This function gives the table of some reads. The strategies and the rows of each strategy are in the order of their names. */
export function tieTableOf(reads: readonly TieRead[]): TieTable {
  const table: Record<string, TieRow[]> = {};
  for (const { strategy, row } of reads) (table[strategy] ??= []).push(row);
  const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(
    Object.keys(table)
      .sort(byName)
      .map((id) => [id, table[id]!.toSorted((a, b) => byName(a.optionSet, b.optionSet))]),
  );
}

/** This function gives the text of the table file, with one row on each line. */
export function tieTableText(table: TieTable): string {
  const entries = Object.entries(table).map(([id, rows]) => `    ${JSON.stringify(id)}: [\n${rows.map((row) => `      ${JSON.stringify(row)}`).join(",\n")}\n    ]`);
  return `{\n  "schema": ${JSON.stringify(TIE_SCHEMA)},\n  "source": ${JSON.stringify(TIE_SOURCE)},\n  "strategies": {\n${entries.join(",\n")}\n  }\n}\n`;
}

/** The fields of a row that the check compares, with the words of a finding. */
const ARMS = ["ties", "none", "edge", "marginTies", "marginEdge"] as const;

/** This function gives a finding for each difference between the table and some reads. With no difference, the list is empty. */
export function compareTieReads(stated: TieTable, reads: readonly TieRead[], whole = true): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const { strategy, row, errors, firstError } of reads) {
    const name = `${strategy} ${row.optionSet}`;
    seen.add(name);
    if (errors > 0) findings.push(`${name}: ${errors} packs gave an error. The first: ${firstError ?? "no text"}.`);
    const had = stated[strategy]?.find((other) => other.optionSet === row.optionSet);
    if (had === undefined) {
      findings.push(`${name}: the table has no row.`);
      continue;
    }
    if (had.inputs !== row.inputs || had.refused !== row.refused) findings.push(`${name}: the table says ${had.inputs} inputs and ${had.refused} refused packs, the read gives ${row.inputs} and ${row.refused}.`);
    for (const arm of ARMS) {
      if (JSON.stringify(had[arm]) !== JSON.stringify(row[arm])) findings.push(`${name} ${arm}: the table says ${JSON.stringify(had[arm])}, the read gives ${JSON.stringify(row[arm])}.`);
    }
    if (had.fillLost !== row.fillLost) findings.push(`${name} fillLost: the table says ${had.fillLost}, the read gives ${row.fillLost}.`);
  }
  if (whole) {
    for (const [strategy, rows] of Object.entries(stated)) {
      for (const { optionSet } of rows) {
        if (!seen.has(`${strategy} ${optionSet}`)) findings.push(`${strategy} ${optionSet}: the table has a row, and this read has no such option set.`);
      }
    }
  }
  return findings;
}

/** This function packs with a fault for the flip test: a size with a fractional part moves the first box by 100. */
export const faultyTiePack: TiePack = (set, input, seed) => {
  const output = packSet(set, input, seed);
  const moves = input.items.some((item) => !Number.isInteger(item.w) || !Number.isInteger(item.h));
  return moves ? { ...output, placements: output.placements.map((p, index) => (index === 0 ? { ...p, x: p.x + 100 } : p)) } : output;
};

/** This function gives the totals of a table, for the log and for the prediction. */
export function tieTotals(table: TieTable): string {
  const rows = Object.values(table).flat().filter((row) => row.inputs > 0);
  const sum = (read: (row: TieRow) => number): number => rows.reduce((total, row) => total + read(row), 0);
  const over = rows.filter((row) => row.ties.maxMove > row.none.maxMove).length;
  return [
    `${rows.length} option sets pack`,
    `${over} with a larger move on ties than on the control`,
    `moved ties ${sum((r) => r.ties.moved)}, control ${sum((r) => r.none.moved)}, edge ${sum((r) => r.edge.moved)}`,
    `through the margin: ties ${sum((r) => r.marginTies.moved)}, edge ${sum((r) => r.marginEdge.moved)}`,
  ].join(". ");
}

/** This function runs the script and gives its exit code. */
function main(args: readonly string[]): number {
  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const only = option("--strategies")?.split(",");
  const pack = args.includes("--fault") ? faultyTiePack : packSet;
  const cells = tieCells();
  const reads = optionSets(allStrategies.map((s) => s.id), ENTRIES)
    .filter((set) => only === undefined || only.includes(set.strategy))
    .map((set) => readTieSet(set, cells, pack));
  const table = tieTableOf(reads);
  const text = tieTableText(table);
  process.stdout.write(`${tieTotals(table)}.\n`);
  const out = option("--out");
  if (out !== undefined) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "tie-move.json"), text);
  }
  if (args.includes("--write")) {
    if (only !== undefined) throw new RangeError("The option --write needs all strategies.");
    fs.writeFileSync(TIE_TABLE_FILE, text);
    return 0;
  }
  const stated = (JSON.parse(fs.readFileSync(TIE_TABLE_FILE, "utf8")) as { strategies: TieTable }).strategies;
  const findings = compareTieReads(stated, reads, only === undefined);
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  process.stdout.write(`${findings.length} findings over ${reads.length} option sets of the family ${TIE_SOURCE}.\n`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("tie-move.ts") === true) process.exitCode = main(process.argv.slice(2));
