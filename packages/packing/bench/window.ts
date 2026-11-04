// Roadmap item k31: the curve of the idea `new-rank-window` (`docs/BENCH.md`, "The rank window"). A height and an order
// are not a time, so any computer can start this script. It is not a command of `bench/main.ts`.
//
//   node bench/window.ts --out <file.json> [--seeds 30] [--count 100] [--windows 1,2,3,4,6,8,12,16,32,100]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { checkHard, measure, mulberry32, packWith, windowOrder, type Item, type PackInput, type PackOutput } from "../src/index.ts";

/** The width of each strip. */
const WIDTH = 200;

/** The widest item of each strip. */
const WIDEST = 60;

/** The tallest item of each strip. */
const TALLEST = 100;

/** The options of the pack: the entry `maxrects-bl` with the order of the input. */
const OPTIONS = { rule: "bl", sortOrder: "input" } as const;

/** One point of the curve. */
export interface WindowPoint {
  readonly window: number;
  readonly height: number;
  readonly inversions: number;
  /** The share of the gain from window 1 to the last window. */
  readonly gain: number;
}

/** This function gives a made-up strip. The rank of each item is its input place. */
export function rankedStrip(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * WIDEST), h: 1 + Math.floor(random() * TALLEST), rank: i });
  return { container: { fixed: "width", w: WIDTH }, items };
}

/** This function counts the hard rule breaks and the unplaced items of a layout. */
const breaksOf = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function packs a strip in a window order. The pack reads no rank, and the measures read the ranks. */
function packed(input: PackInput, window: number, seed: number): PackOutput {
  const items = windowOrder(input.items, window).map(({ rank: _rank, ...item }) => item);
  return packWith("maxrects", { ...input, items }, OPTIONS, seed);
}

/** This function gives the points of the curve, and the smallest listed window with a gain of at least 0.5. */
export function curve(seeds: number, count: number, windows: readonly number[]): { readonly points: readonly WindowPoint[]; readonly knee: number; readonly breaks: number } {
  let breaks = 0;
  const rows = windows.map((window) => {
    const heights: number[] = [];
    const inversions: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const input = rankedStrip(seed, count);
      const output = packed(input, window, seed);
      breaks += breaksOf(input, output);
      heights.push(output.size.h);
      inversions.push(measure(input, output)["pack.order.inversions"]);
    }
    return { window, height: mean(heights), inversions: mean(inversions) };
  });
  const first = rows[0]!.height;
  const last = rows[rows.length - 1]!.height;
  const points = rows.map((r) => ({ ...r, gain: (first - r.height) / (first - last) }));
  return { points, knee: points.find((p) => p.gain >= 0.5)!.window, breaks };
}

/** This function starts the bench. */
function main(): void {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      seeds: { type: "string", default: "30" },
      count: { type: "string", default: "100" },
      windows: { type: "string", default: "1,2,3,4,6,8,12,16,32,100" },
    },
  });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const result = curve(Number(values.seeds), Number(values.count), values.windows.split(",").map(Number));
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith("window.ts")) main();
