// Roadmap item k94: the comparison of `circle-quasi-physical` with the literature (`docs/BENCH.md`, "Circles in a circle against the literature").
// The script packs the two families of the Packomania tables, and it compares each radius with the best-known radius of the table.
// The tables are not in the repository: the workflow `circles.yml` fetches them and gives their paths. The script is not a command of `bench/main.ts`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { circleOverlaps, circleQuasiPhysical, circlesOutside, createContext, packWith, type Item, type PackInput, type PackOutput } from "../src/index.ts";

/** The two families: `equal` has `r_i = 1`, and `unit` has `r_i = i`. */
export type CircleFamily = "equal" | "unit";

/** The tolerance of the exact checks of a layout. */
export const EXACT_TOLERANCE = 1e-9;

/** The count of the halvings of the smallest square of the baseline. */
const SQUARE_STEPS = 14;

/** One packing of the strategy against the table. */
export interface CircleRecord {
  family: CircleFamily;
  n: number;
  seed: number;
  iterations: number;
  /** The radius of the container of the output. */
  radius: number;
  /** The best-known radius of the table, or `null` when the table has no row for `n`. */
  reference: number | null;
  /** The gap to the best-known radius in percent, or `null` when the table has no row for `n`. */
  gapPercent: number | null;
  /** The area of the circles as a share of the area of the container. */
  density: number;
  /** The time of one pack in milliseconds. */
  ms: number;
  /** The time of one move in milliseconds. */
  msPerMove: number;
  /** The count of the kept moves. */
  kept: number;
  /** The count of the energy evaluations. */
  evals: number;
  /** The smallest clear distance of the pairs, by the geometry of the input. */
  clearance: number;
  /** The count of `circleOverlaps` at `EXACT_TOLERANCE`. */
  overlaps: number;
  /** The count of `circlesOutside` at `EXACT_TOLERANCE`. */
  outside: number;
  /** The value `true` tells that a second pack gave the same bytes. */
  sameBytes: boolean;
}

/** The baseline of a case: `hole-degree` in its smallest square. */
export interface BaselineRecord {
  family: CircleFamily;
  n: number;
  /** The side of the smallest square with no overflow. */
  side: number;
  /** The area of the circles as a share of the area of the square. */
  density: number;
  /** The time of the search in milliseconds. */
  ms: number;
}

/** One line of the summary: a family and a count of circles. */
export interface CircleLine {
  family: CircleFamily;
  n: number;
  reference: number | null;
  bestGap: number | null;
  medianGap: number | null;
  worstGap: number | null;
  bestDensity: number;
  baselineDensity: number | null;
  /** The largest time of one move in milliseconds. */
  msPerMove: number;
}

/** This function gives the circles of a family, as boxes of side `2r`. */
export function circlesOf(family: CircleFamily, n: number): Item[] {
  return Array.from({ length: n }, (_, i) => {
    const r = family === "equal" ? 1 : i + 1;
    return { id: `c${i + 1}`, w: 2 * r, h: 2 * r, shape: { kind: "circle", cx: r, cy: r, r } };
  });
}

/** This function gives the input of a family in a circle container of free size. */
export const circleInput = (family: CircleFamily, n: number): PackInput => ({ container: { fixed: "none", shape: { kind: "circle", cx: 0, cy: 0, r: 1 } }, items: circlesOf(family, n) });

/**
 * This function reads a table of Packomania: each line has `N` and the radius of the container, with spaces or a tab between them.
 * Other lines do not count, so a `#` comment and an empty line are safe.
 */
export function parseTable(text: string): Map<number, number> {
  const table = new Map<number, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+(?:\.\d+)?)\s*$/.exec(line);
    if (m !== null) table.set(Number(m[1]), Number(m[2]));
  }
  return table;
}

/** This function gives the sum of the areas of some circles, without the factor pi. */
const squares = (items: readonly Item[]): number => items.reduce((sum, item) => sum + (item.w / 2) ** 2, 0);

/** This function gives the smallest clear distance of the pairs of an output, by the geometry of the input. */
export function leastClearance(input: PackInput, output: PackOutput): number {
  const circles = output.placements.map((p) => {
    const r = input.items.find((i) => i.id === p.id)!.w / 2;
    return { x: p.x + r, y: p.y + r, r };
  });
  let least = Infinity;
  for (let a = 0; a < circles.length; a++)
    for (let b = a + 1; b < circles.length; b++) least = Math.min(least, Math.hypot(circles[a]!.x - circles[b]!.x, circles[a]!.y - circles[b]!.y) - circles[a]!.r - circles[b]!.r);
  return least;
}

/** This function packs one case two times, and it gives its record. */
export function packCase(family: CircleFamily, n: number, seed: number, iterations: number, table: ReadonlyMap<number, number>, now: () => number): CircleRecord {
  const input = circleInput(family, n);
  const start = now();
  const output = circleQuasiPhysical.pack(input, { iterations }, createContext(seed));
  const ms = now() - start;
  const again = circleQuasiPhysical.pack(input, { iterations }, createContext(seed));
  const measures = output.trace?.[0]?.measures ?? {};
  const radius = output.size.w / 2;
  const reference = table.get(n) ?? null;
  return {
    family,
    n,
    seed,
    iterations,
    radius,
    reference,
    gapPercent: reference === null ? null : (radius / reference - 1) * 100,
    density: squares(input.items) / (radius * radius),
    ms,
    msPerMove: iterations === 0 ? 0 : ms / iterations,
    kept: measures["circles.kept"] ?? 0,
    evals: measures["circles.evals"] ?? 0,
    clearance: leastClearance(input, output),
    overlaps: circleOverlaps(input, output, EXACT_TOLERANCE),
    outside: circlesOutside(input, output, EXACT_TOLERANCE),
    sameBytes: JSON.stringify(output) === JSON.stringify(again),
  };
}

/** This function tells if `hole-degree` puts each circle into a square of a side. */
function fitsSquare(items: Item[], side: number): boolean {
  return packWith("hole-degree", { container: { fixed: "size", w: side, h: side }, items }).overflow.length === 0;
}

/** This function searches the smallest square of `hole-degree` by halving. It keeps the smallest side with no overflow. */
export function smallestSquare(family: CircleFamily, n: number, now: () => number): BaselineRecord {
  const items = circlesOf(family, n);
  const start = now();
  let low = Math.sqrt(Math.PI * squares(items));
  let high = low;
  while (!fitsSquare(items, high)) high *= 1.25;
  for (let k = 0; k < SQUARE_STEPS; k++) {
    const side = (low + high) / 2;
    if (fitsSquare(items, side)) high = side;
    else low = side;
  }
  return { family, n, side: high, density: (Math.PI * squares(items)) / (high * high), ms: now() - start };
}

/** This function gives the lines of the summary, with the density of the baseline as a share of the area of its container. */
export function summarize(records: readonly CircleRecord[], baselines: readonly BaselineRecord[]): CircleLine[] {
  const lines: CircleLine[] = [];
  const keys = [...new Set(records.map((r) => `${r.family}:${r.n}`))];
  for (const key of keys) {
    const own = records.filter((r) => `${r.family}:${r.n}` === key);
    const { family, n, reference } = own[0]!;
    const gaps = own.flatMap((r) => (r.gapPercent === null ? [] : [r.gapPercent]));
    lines.push({
      family,
      n,
      reference,
      bestGap: gaps.length === 0 ? null : Math.min(...gaps),
      medianGap: gaps.length === 0 ? null : median(gaps),
      worstGap: gaps.length === 0 ? null : Math.max(...gaps),
      bestDensity: Math.max(...own.map((r) => r.density)),
      baselineDensity: baselines.find((b) => b.family === family && b.n === n)?.density ?? null,
      msPerMove: Math.max(...own.map((r) => r.msPerMove)),
    });
  }
  return lines;
}

/** This function gives the breaks of a sample: each record with an overlap, a circle outside or two different outputs. */
export function breaksOf(records: readonly CircleRecord[]): string[] {
  const breaks: string[] = [];
  for (const r of records) {
    const id = `${r.family} n=${r.n} seed=${r.seed}`;
    if (r.overlaps > 0 || r.clearance < -EXACT_TOLERANCE) breaks.push(`${id}: an overlap of ${r.overlaps} pairs, clearance ${r.clearance}`);
    if (r.outside > 0) breaks.push(`${id}: ${r.outside} circles outside`);
    if (!r.sameBytes) breaks.push(`${id}: two outputs with different bytes`);
  }
  return breaks;
}

/** This function gives one value of the table of the summary, or a dash for no value. */
const cell = (value: number | null, digits: number): string => (value === null ? "-" : value.toFixed(digits));

/** This function gives the summary as a Markdown table. */
export function summaryText(lines: readonly CircleLine[], moves: number, seeds: number): string {
  const head = `Best of ${seeds} seeds, ${moves} moves. Gap: the radius over the best-known radius of the table. Density: the area of the circles over the area of the container. The baseline is \`hole-degree\` in its smallest square.`;
  const rows = lines.map((l) => {
    const gain = l.baselineDensity === null ? "-" : String(l.bestDensity > l.baselineDensity);
    return `| ${l.family} | ${l.n} | ${cell(l.reference, 7)} | ${cell(l.bestGap, 4)} | ${cell(l.medianGap, 4)} | ${cell(l.worstGap, 4)} | ${l.bestDensity.toFixed(4)} | ${cell(l.baselineDensity, 4)} | ${gain} | ${l.msPerMove.toFixed(2)} |`;
  });
  return [head, "", "| family | n | best known | best gap % | median gap % | worst gap % | density | baseline density | above baseline | ms per move |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
}

/** The options of `main`. */
interface CirclesOptions {
  equal: string;
  unit: string;
  sizes: number[];
  seeds: number;
  iterations: number;
  baseline: number[];
  out: string;
}

/** This function reads the arguments of the script. */
function optionsOf(argv: string[]): CirclesOptions {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      equal: { type: "string" },
      unit: { type: "string" },
      sizes: { type: "string", default: "10,20,30,50,100" },
      seeds: { type: "string", default: "5" },
      iterations: { type: "string", default: "2000" },
      baseline: { type: "string", default: "20,30,50,100" },
      out: { type: "string", default: "bench-out/circles" },
    },
  });
  if (v.equal === undefined || v.unit === undefined) throw new Error("The script needs --equal and --unit: the paths of the two tables.");
  const list = (text: string): number[] => text.split(",").filter((x) => x !== "").map(Number);
  return { equal: v.equal, unit: v.unit, sizes: list(v.sizes), seeds: Number(v.seeds), iterations: Number(v.iterations), baseline: list(v.baseline), out: v.out };
}

/** This function packs each case, writes the records and the summary, and gives the count of the breaks. */
function main(o: CirclesOptions): number {
  const tables: Record<CircleFamily, Map<number, number>> = { equal: parseTable(readFileSync(o.equal, "utf8")), unit: parseTable(readFileSync(o.unit, "utf8")) };
  const records: CircleRecord[] = [];
  const baselines: BaselineRecord[] = [];
  const now = (): number => performance.now();
  for (const family of ["equal", "unit"] as const)
    for (const n of o.sizes) {
      for (let seed = 1; seed <= o.seeds; seed++) records.push(packCase(family, n, seed, o.iterations, tables[family], now));
      if (o.baseline.includes(n)) baselines.push(smallestSquare(family, n, now));
      console.log(`${family} n=${n} done`);
    }
  mkdirSync(o.out, { recursive: true });
  const lines = summarize(records, baselines);
  const breaks = breaksOf(records);
  writeFileSync(join(o.out, "records.json"), `${JSON.stringify({ iterations: o.iterations, seeds: o.seeds, records, baselines, lines, breaks }, null, 2)}\n`);
  writeFileSync(join(o.out, "summary.md"), summaryText(lines, o.iterations, o.seeds));
  for (const b of breaks) console.error(b);
  return breaks.length;
}

if (process.argv[1]?.endsWith("circles.ts")) process.exitCode = main(optionsOf(process.argv.slice(2))) === 0 ? 0 : 1;
