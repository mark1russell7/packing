// Roadmap item k85: the height of the beam search against `maxrects-bl` (`docs/BENCH.md`, "The beam search").
// A height is not a time, so any computer can start this script. It is not a command of `bench/main.ts`.
//
//   node bench/beam.ts --out <file.json> [--seeds 10] [--count 100] [--widths 1,4,16]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { beamStrip, berkeyWang, checkHard, martelloVigo, packWith, toPackInput, type PackInput, type PackOutput } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";

/** One family of the bench: a class of a generator. */
interface Family {
  readonly name: string;
  readonly make: (seed: number, count: number) => PackInput;
}

/** The ten classes. */
const FAMILIES: readonly Family[] = [
  ...(["I", "II", "III", "IV", "V", "VI"] as const).map((c): Family => ({
    name: `berkey-wang.${c}`,
    make: (seed, count) => toPackInput(berkeyWang.generate(seed, { class: c, containerSize: "freeHeight", count })),
  })),
  ...(["VII", "VIII", "IX", "X"] as const).map((c): Family => ({
    name: `martello-vigo.${c}`,
    make: (seed, count) => toPackInput(martelloVigo.generate(seed, { class: c, containerSize: "freeHeight", count })),
  })),
];

/** One input of the bench. */
interface BeamCase {
  readonly family: string;
  readonly seed: number;
  /** The height of `maxrects-bl`. */
  readonly maxrects: number;
  /** The height for each beam width. */
  readonly heights: readonly number[];
  /** The gap of `maxrects-bl`, then the gap for each beam width. */
  readonly gaps: readonly number[];
  readonly completions: number;
  readonly breaks: number;
}

/** This function counts the hard rule breaks of a layout. */
const breaksOf = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function measures one input. The gap is the form of Wen 2025. */
function measure(family: Family, seed: number, count: number, widths: readonly number[]): BeamCase {
  const input = family.make(seed, count);
  const entry = ENTRIES.find((e) => e.id === "maxrects-bl")!;
  const area = input.items.reduce((sum, item) => sum + item.w * item.h, 0);
  const gapOf = (height: number): number => (height / (area / input.container.w!) - 1) * 100;
  const other = packWith(entry.strategy, input, entry.options, seed);
  const results = widths.map((width) => beamStrip(input, { width }));
  const heights = results.map((r) => r.height);
  return {
    family: family.name,
    seed,
    maxrects: other.size.h,
    heights,
    gaps: [gapOf(other.size.h), ...heights.map(gapOf)],
    completions: results.reduce((sum, r) => sum + r.completions, 0),
    breaks: results.reduce((sum, r) => sum + breaksOf(input, r.output), breaksOf(input, other)),
  };
}

/** This function starts the bench. */
function main(): void {
  const { values } = parseArgs({
    options: { out: { type: "string" }, seeds: { type: "string", default: "10" }, count: { type: "string", default: "100" }, widths: { type: "string", default: "1,4,16" } },
  });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const widths = values.widths.split(",").map(Number);
  const cases: BeamCase[] = [];
  for (const family of FAMILIES) for (let seed = 1; seed <= Number(values.seeds); seed++) cases.push(measure(family, seed, Number(values.count), widths));
  const last = widths.length - 1;
  const lines = FAMILIES.map(({ name }) => {
    const here = cases.filter((c) => c.family === name);
    return { family: name, gaps: [0, ...widths.map((_, i) => i + 1)].map((i) => mean(here.map((c) => c.gaps[i]!))) };
  });
  const summary = {
    inputs: cases.length,
    gaps: [0, ...widths.map((_, i) => i + 1)].map((i) => mean(cases.map((c) => c.gaps[i]!))),
    noWorseThanMaxrects: cases.filter((c) => c.heights[last]! <= c.maxrects).length / cases.length,
    completions: mean(cases.map((c) => c.completions)),
    breaks: cases.reduce((sum, c) => sum + c.breaks, 0),
    widths,
    lines,
  };
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ inputs: summary.inputs, gaps: summary.gaps, noWorseThanMaxrects: summary.noWorseThanMaxrects, breaks: summary.breaks }));
}

if (process.argv[1]?.endsWith("beam.ts")) main();
