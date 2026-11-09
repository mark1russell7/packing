// The output rows of roadmap item k150: do whole-number sizes, gaps, margins and insets give whole-number positions and sizes?
// This script reads each option set of each strategy on one seeded family of rect inputs. With --write, it writes the table
// src/strategy-output.ts, which the catalog states. With --check, it reads again and fails when a row of the table differs.
// The script does not read the clock, so the same commit gives the same rows.

import fs from "node:fs";
import path from "node:path";
import { outputGridClass, OUTPUT_NEAR_WHOLE, type OutputGridClass } from "@mark1russell7/layout-contract";
import { allStrategies, packWith, UnsupportedCell, type Item, type LayoutContainer, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { random } from "@mark1russell7/rigor-generators";
import { OUTPUT_READ_VERSION, OUTPUT_SOURCE, STRATEGY_OUTPUT, type GridCount, type OutputRead, type OutputTable } from "../src/strategy-output.ts";
import { ENTRIES, type BenchEntry } from "./entries.ts";

/** The modes of the container, by the value of the dimension `containerSize` that each one gives. */
export const WHOLE_MODES = ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"] as const;

/** A mode of the container. */
export type WholeMode = (typeof WHOLE_MODES)[number];

/** The largest side of an item. Odd sides occur, so a division by 2 shows in a position. */
const MAX_SIDE = 41;

/** The share of the total area that a fixed container adds, so most items fit. */
const ROOM = 1.4;

/** The strategies with no defaults that pack. Each entry of the bench for such a strategy gives its rows. */
const NEEDS_OPTIONS: ReadonlySet<string> = new Set(["aspect-fit", "compact"]);

/** One input of the family. */
export interface WholeCell {
  readonly mode: WholeMode;
  readonly count: number;
  readonly gap: number;
  readonly margin: number;
  readonly inset: number;
  readonly seed: number;
}

/** The ranges of the family. */
export interface WholeFamily {
  readonly counts: readonly number[];
  readonly gaps: readonly number[];
  readonly margins: readonly number[];
  readonly insets: readonly number[];
  readonly seeds: readonly number[];
}

/** The family of the read. The odd gap and the even margin and inset test each kind of space. A change to it changes `OUTPUT_SOURCE`. */
export const WHOLE_FAMILY: WholeFamily = { counts: [5, 20, 50], gaps: [0, 3], margins: [0, 2], insets: [0, 4], seeds: [1, 2] };

/** This function gives each input of a family, in a fixed order. */
export function wholeCells(family: WholeFamily = WHOLE_FAMILY): WholeCell[] {
  return WHOLE_MODES.flatMap((mode) =>
    family.counts.flatMap((count) =>
      family.gaps.flatMap((gap) =>
        family.margins.flatMap((margin) =>
          family.insets.flatMap((inset) => family.seeds.map((seed) => ({ mode, count, gap, margin, inset, seed }))),
        ),
      ),
    ),
  );
}

/** This function gives the name of an input, for a finding of the check. */
export const cellName = (cell: WholeCell): string =>
  `${cell.mode}.n${cell.count}.gap${cell.gap}.margin${cell.margin}.inset${cell.inset}/s${cell.seed}`;

/** This function gives the input of a cell. The same cell gives the same input, and each number of the input is a whole number. */
export function wholeInput(cell: WholeCell): PackInput {
  const stream = random(`whole-positions:${cell.count}:${cell.seed}`);
  const items: Item[] = Array.from({ length: cell.count }, (_, index) => ({
    id: `i${index}`,
    w: stream.int(1, MAX_SIDE),
    h: stream.int(1, MAX_SIDE),
    ...(cell.margin === 0 ? {} : { margin: cell.margin }),
  }));
  const pad = cell.gap + 2 * cell.margin;
  const area = items.reduce((sum, item) => sum + (item.w + pad) * (item.h + pad), 0);
  const side = Math.ceil(Math.sqrt(area * ROOM)) + MAX_SIDE + 2 * cell.inset;
  const inset = cell.inset === 0 ? {} : { inset: cell.inset };
  const containers: Record<WholeMode, LayoutContainer> = {
    fixed: { fixed: "size", w: side, h: side, ...inset },
    freeHeight: { fixed: "width", w: side, ...inset },
    freeWidth: { fixed: "height", h: side, ...inset },
    freeAspect: { fixed: "none", ...inset },
    freeArea: { fixed: "none", aspectWeight: 0, ...inset },
  };
  return { container: containers[cell.mode], items, ...(cell.gap === 0 ? {} : { gap: cell.gap }) };
}

/** The read of some numbers: all exactly whole, some near a whole number, or some further away. */
export type GridValue = "whole" | "near" | "fractional";

/** This function reads some numbers against `OUTPUT_NEAR_WHOLE`. A number further away decides the read. */
export function gridOf(values: readonly number[]): GridValue {
  let read: GridValue = "whole";
  for (const value of values) {
    const off = Math.abs(value - Math.round(value));
    if (off > OUTPUT_NEAR_WHOLE) return "fractional";
    if (off !== 0) read = "near";
  }
  return read;
}

/** This function reads the positions of an output. */
export const positionGrid = (output: PackOutput): GridValue => gridOf(output.placements.flatMap(({ x, y }) => [x, y]));

/** This function reads the size of an output. */
export const sizeGrid = (output: PackOutput): GridValue => gridOf([output.size.w, output.size.h]);

/** One option set to read: the defaults of a strategy, or the options of an entry of the bench. */
export interface OptionSet {
  readonly strategy: string;
  readonly optionSet: string;
  readonly options?: unknown;
}

/** This function gives the option sets of the rows. An entry with no options is the set `default` of its strategy. */
export function optionSets(strategies: readonly string[], entries: readonly BenchEntry[]): OptionSet[] {
  const sets: OptionSet[] = strategies.filter((id) => !NEEDS_OPTIONS.has(id)).map((strategy) => ({ strategy, optionSet: "default" }));
  for (const { id, strategy, options } of entries) {
    if (Object.keys(options).length > 0) sets.push({ strategy, optionSet: id, options });
  }
  return sets;
}

/** The function that packs one input. The flip test of the check gives a function with a fault. */
export type WholePack = (set: OptionSet, input: PackInput, seed: number) => PackOutput;

const packSet: WholePack = (set, input, seed) => packWith(set.strategy, input, set.options, seed);

/** The read of one option set, with the details that a finding names. The table keeps only `row`. */
export interface SetRead {
  readonly strategy: string;
  readonly row: OutputRead;
  /** The inputs that the strategy refused with `UnsupportedCell`. */
  readonly refused: number;
  /** The inputs that gave another error. */
  readonly errors: number;
  readonly firstError?: string;
  readonly firstFractional: { readonly position?: string; readonly size?: string };
}

/** This function reads one option set over some cells. An error other than `UnsupportedCell` counts, and the read goes on. */
export function readSet(set: OptionSet, cells: readonly WholeCell[], pack: WholePack = packSet): SetRead {
  const position = { fractional: 0, nearWhole: 0 };
  const size = { fractional: 0, nearWhole: 0 };
  const firstFractional: { position?: string; size?: string } = {};
  const add = (count: { fractional: number; nearWhole: number }, value: GridValue): void => {
    if (value === "fractional") count.fractional += 1;
    if (value === "near") count.nearWhole += 1;
  };
  let inputs = 0;
  let refused = 0;
  let errors = 0;
  let firstError: string | undefined;
  for (const cell of cells) {
    let output: PackOutput;
    try {
      output = pack(set, wholeInput(cell), cell.seed);
    } catch (error) {
      if (error instanceof UnsupportedCell) {
        refused += 1;
      } else {
        errors += 1;
        firstError ??= `${cellName(cell)}: ${error instanceof Error ? error.message : String(error)}`;
      }
      continue;
    }
    inputs += 1;
    const [positions, sizes] = [positionGrid(output), sizeGrid(output)];
    add(position, positions);
    add(size, sizes);
    if (positions === "fractional") firstFractional.position ??= cellName(cell);
    if (sizes === "fractional") firstFractional.size ??= cellName(cell);
  }
  return {
    strategy: set.strategy,
    row: { optionSet: set.optionSet, inputs, position, size },
    refused,
    errors,
    ...(firstError === undefined ? {} : { firstError }),
    firstFractional,
  };
}

/** This function gives the table of some reads. The strategies and the rows of each strategy are in the order of their names. */
export function tableOf(reads: readonly SetRead[]): OutputTable {
  const table: Record<string, OutputRead[]> = {};
  for (const { strategy, row } of reads) (table[strategy] ??= []).push(row);
  const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(
    Object.keys(table)
      .sort(byName)
      .map((id) => [id, table[id]!.toSorted((a, b) => byName(a.optionSet, b.optionSet))]),
  );
}

/** This function gives the text of the generated table. */
export function tableText(table: OutputTable, version: string): string {
  const entries = Object.entries(table).map(([id, rows]) => {
    const lines = rows.map((row) => `    ${JSON.stringify(row)},`);
    return `  ${JSON.stringify(id)}: [\n${lines.join("\n")}\n  ],`;
  });
  return `// This file is generated. Do not edit it. \`bench/whole-positions.ts --write\` writes it, and the check of the same script compares it.
// Each row is a read of one option set on the family ${OUTPUT_SOURCE} of whole-number rect inputs. The row states no promise beyond this read.

/** The inputs of one read with a fractional value of a property, and with a near-whole value and no fractional value. */
export interface GridCount {
  readonly fractional: number;
  readonly nearWhole: number;
}

/** The read of one option set of one strategy. */
export interface OutputRead {
  readonly optionSet: string;
  /** The inputs that the strategy packed. */
  readonly inputs: number;
  readonly position: GridCount;
  readonly size: GridCount;
}

/** The reads of each strategy. */
export type OutputTable = Readonly<Record<string, readonly OutputRead[]>>;

/** The name of the input family of the read. */
export const OUTPUT_SOURCE = ${JSON.stringify(OUTPUT_SOURCE)};

/** The version of the package at the read that wrote this file. A version change alone does not change a row. */
export const OUTPUT_READ_VERSION = ${JSON.stringify(version)};

/** The rows of \`strategyCatalog\`, by strategy. */
export const STRATEGY_OUTPUT: OutputTable = {
${entries.join("\n")}
};
`;
}

/** This function gives the class of one property of a read. */
const classOf = (inputs: number, count: GridCount): OutputGridClass =>
  outputGridClass({ inputs, fractionalInputs: count.fractional, nearWholeInputs: count.nearWhole });

/** This function gives the words for one property of a row. */
const stateOf = (inputs: number, count: GridCount): string =>
  `${classOf(inputs, count)} (${inputs} inputs, ${count.fractional} fractional, ${count.nearWhole} near-whole)`;

/** This function gives a finding for each difference between the table and some reads. With no difference, the list is empty. */
export function compareReads(stated: OutputTable, reads: readonly SetRead[], whole = true): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const { strategy, row, firstFractional, errors, firstError } of reads) {
    const name = `${strategy} ${row.optionSet}`;
    seen.add(name);
    if (errors > 0) findings.push(`${name}: ${errors} inputs gave an error. The first: ${firstError ?? "no text"}.`);
    const had = stated[strategy]?.find((other) => other.optionSet === row.optionSet);
    if (had === undefined) {
      findings.push(`${name}: the table has no row.`);
      continue;
    }
    for (const [property, key, first] of [
      ["position-grid", "position", firstFractional.position],
      ["size-grid", "size", firstFractional.size],
    ] as const) {
      if (had.inputs === row.inputs && had[key].fractional === row[key].fractional && had[key].nearWhole === row[key].nearWhole) continue;
      const input = first === undefined ? "" : ` The first fractional input: ${first}.`;
      findings.push(`${name} ${property}: the table says ${stateOf(had.inputs, had[key])}, the read gives ${stateOf(row.inputs, row[key])}.${input}`);
    }
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

/** The faults of the flip test, each on the function that packs. */
export const WHOLE_FAULTS: Readonly<Record<string, (output: PackOutput) => PackOutput>> = {
  "half-position": (output) => ({ ...output, placements: output.placements.map((p, i) => (i === 0 ? { ...p, x: p.x + 0.5 } : p)) }),
  "half-size": (output) => ({ ...output, size: { ...output.size, w: output.size.w + 0.5 } }),
};

/** This function gives the function that packs with one fault. */
export function faultyPack(fault: string): WholePack {
  const change = WHOLE_FAULTS[fault];
  if (change === undefined) throw new RangeError(`There is no fault "${fault}".`);
  return (set, input, seed) => change(packSet(set, input, seed));
}

/** This function gives the count of the rows of each class, for the log. */
export function classCounts(table: OutputTable): string {
  const counts = new Map<string, number>();
  for (const rows of Object.values(table)) {
    for (const row of rows) {
      for (const key of ["position", "size"] as const) {
        const name = `${key} ${classOf(row.inputs, row[key])}`;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return [...counts].sort().map(([name, count]) => `${name}: ${count}`).join(", ");
}

/** This function runs the script and gives its exit code. */
function main(args: readonly string[]): number {
  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const only = option("--strategies")?.split(",");
  const fault = option("--fault");
  const pack = fault === undefined ? packSet : faultyPack(fault);
  const cells = wholeCells();
  const reads = optionSets(allStrategies.map((s) => s.id), ENTRIES)
    .filter((set) => only === undefined || only.includes(set.strategy))
    .map((set) => readSet(set, cells, pack));
  const table = tableOf(reads);
  process.stdout.write(`${classCounts(table)}\n`);
  const text = tableText(table, args.includes("--write") ? (JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version : OUTPUT_READ_VERSION);
  const out = option("--out");
  if (out !== undefined) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "strategy-output.ts"), text);
  }
  if (args.includes("--write")) {
    if (only !== undefined) throw new RangeError("The option --write needs all strategies.");
    fs.writeFileSync(new URL("../src/strategy-output.ts", import.meta.url), text);
    return 0;
  }
  const findings = compareReads(STRATEGY_OUTPUT, reads, only === undefined);
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  process.stdout.write(`${findings.length} findings over ${reads.length} option sets of the family ${OUTPUT_SOURCE}.\n`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("whole-positions.ts") === true) process.exitCode = main(process.argv.slice(2));
