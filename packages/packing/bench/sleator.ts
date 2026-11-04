// Roadmap item k52: the height of the Sleator strip against `maxrects-bl` (`docs/BENCH.md`, "The Sleator strip").
// A height is not a time, so any computer can start this script. It is not a command of `bench/main.ts`.
//
//   node bench/sleator.ts --out <file.json> [--seeds 30] [--counts 20,100,500]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { checkHard, mulberry32, packWith, sleatorStrip, type Item, type PackInput, type PackOutput } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";

/** The width of each strip. */
const WIDTH = 200;

/** The tallest item of each strip. */
const TALLEST = 100;

/** The width classes: the least and the largest width of an item. */
const CLASSES: readonly { readonly name: string; readonly least: number; readonly most: number }[] = [
  { name: "narrow", least: 1, most: 50 },
  { name: "mixed", least: 1, most: 200 },
  { name: "wide", least: 67, most: 200 },
];

/** One input of the bench. */
export interface SleatorCase {
  readonly width: string;
  readonly count: number;
  readonly seed: number;
  /** The Sleator height over the larger of the area bound and the tallest item. */
  readonly ratio: number;
  /** The Sleator height over the `maxrects-bl` height. */
  readonly overMaxrects: number;
  /** The hard rule breaks of the two layouts. */
  readonly breaks: number;
}

/** This function gives a made-up strip of one width class. */
export function sleatorCase(name: string, count: number, seed: number): PackInput {
  const shape = CLASSES.find((c) => c.name === name)!;
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    items.push({ id: `i${i}`, w: shape.least + Math.floor(random() * (shape.most - shape.least + 1)), h: 1 + Math.floor(random() * TALLEST) });
  }
  return { container: { fixed: "width", w: WIDTH }, items };
}

/** This function counts the hard rule breaks of a layout. */
const breaksOf = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function measures one input. */
export function measure(width: string, count: number, seed: number): SleatorCase {
  const input = sleatorCase(width, count, seed);
  const entry = ENTRIES.find((e) => e.id === "maxrects-bl")!;
  const { height, output } = sleatorStrip(input);
  const other = packWith(entry.strategy, input, entry.options, seed);
  const area = input.items.reduce((sum, item) => sum + item.w * item.h, 0);
  const bound = Math.max(area / WIDTH, ...input.items.map((item) => item.h));
  return { width, count, seed, ratio: height / bound, overMaxrects: height / other.size.h, breaks: breaksOf(input, output) + breaksOf(input, other) };
}

/** This function starts the bench. */
function main(): void {
  const { values } = parseArgs({ options: { out: { type: "string" }, seeds: { type: "string", default: "30" }, counts: { type: "string", default: "20,100,500" } } });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const counts = values.counts.split(",").map(Number);
  const seeds = Number(values.seeds);
  const cases: SleatorCase[] = [];
  for (const { name } of CLASSES) for (const count of counts) for (let seed = 1; seed <= seeds; seed++) cases.push(measure(name, count, seed));
  const lines = CLASSES.flatMap(({ name }) =>
    counts.map((count) => {
      const here = cases.filter((c) => c.width === name && c.count === count);
      return {
        width: name,
        count,
        ratio: mean(here.map((c) => c.ratio)),
        overMaxrects: mean(here.map((c) => c.overMaxrects)),
        maxrectsNoWorse: here.filter((c) => c.overMaxrects >= 1).length / here.length,
      };
    }),
  );
  const summary = {
    inputs: cases.length,
    meanRatio: mean(cases.map((c) => c.ratio)),
    maxrectsNoWorse: cases.filter((c) => c.overMaxrects >= 1).length / cases.length,
    breaks: cases.reduce((sum, c) => sum + c.breaks, 0),
    lines,
  };
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ inputs: summary.inputs, meanRatio: summary.meanRatio, maxrectsNoWorse: summary.maxrectsNoWorse, breaks: summary.breaks }));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
