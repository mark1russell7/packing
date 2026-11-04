// The bench of roadmap item k97: the density of groups that are near rectangles, against one box for each shape and against the raster no-fit.
// It is a separate program. The workflow `near-rects.yml` starts it in CI. The instance files stay out of this repository.
//
//   node bench/near-rects.ts --out <file.json> [--instances <dir>] [--seeds 30] [--count 40] [--trials 64] [--time-seeds 5]
//
// The cell side of each arm that reads a grid is the finest cell of the bench of k92: the mean box side over 32, and the strip width over 160.
// Density and overlaps are safe to read from any computer. The time of the pair search needs a CI run.

import fs from "node:fs";
import path from "node:path";
import { packNearRects, packRasterNofit, packWith, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { mean, median, signTest } from "@mark1russell7/rigor-statistics";
import { CELL_DIVISORS, crossingPairs, densityOf, INSTANCE_DIVISORS, instanceInput, rasterFamily } from "./raster-nofit.ts";

/** The cell side of the family, as a divisor of the mean box side: the finest of `CELL_DIVISORS` of the bench of k92. */
const FAMILY_DIVISOR = Math.max(...CELL_DIVISORS);

/** The cell side of an instance, as a divisor of the strip width: the finest of `INSTANCE_DIVISORS` of the bench of k92. */
const INSTANCE_DIVISOR = Math.max(...INSTANCE_DIVISORS);

/** The name of each arm. */
export const NEAR_ARMS = ["bbox", "near-rects", "raster-nofit"] as const;

/** The name of one arm. */
export type NearArm = (typeof NEAR_ARMS)[number];

/** One input of one arm. */
export interface NearRow {
  readonly set: string;
  readonly input: string;
  readonly arm: NearArm;
  readonly density: number;
  readonly crossings: number;
  readonly overflow: number;
  readonly ms: number;
}

/** A paired comparison of two arms: the mean of each, its difference, and a two-sided sign test. */
export interface NearPair {
  readonly set: string;
  readonly a: NearArm;
  readonly b: NearArm;
  readonly pairs: number;
  readonly meanA: number;
  readonly meanB: number;
  readonly points: number;
  readonly wins: number;
  readonly losses: number;
  readonly p: number;
}

/** This function gives the output of one arm on one input. */
export function runArm(arm: NearArm, input: PackInput, cell: number, trials: number, seed: number): PackOutput {
  if (arm === "bbox") return packWith("bbox", input, {}, seed);
  if (arm === "near-rects") return packNearRects(input, { cell, seed });
  return packRasterNofit(input, { cell, trials, seed });
}

/** This function gives the row of one arm on one input. */
export function measureRow(set: string, name: string, arm: NearArm, input: PackInput, cell: number, trials: number, seed: number): NearRow {
  const start = performance.now();
  const output = runArm(arm, input, cell, trials, seed);
  const ms = performance.now() - start;
  return { set, input: name, arm, density: densityOf(input, output), crossings: crossingPairs(input, output), overflow: output.overflow.length, ms };
}

/** This function compares two arms over the inputs that both have, on one set. */
export function comparePair(rows: readonly NearRow[], set: string, a: NearArm, b: NearArm): NearPair {
  const density = (arm: NearArm): Map<string, number> => new Map(rows.filter((r) => r.set === set && r.arm === arm).map((r) => [r.input, r.density]));
  const left = density(a);
  const right = density(b);
  const names = [...left.keys()].filter((name) => right.has(name));
  const diffs = names.map((name) => left.get(name)! - right.get(name)!);
  const meanA = mean(names.map((name) => left.get(name)!));
  const meanB = mean(names.map((name) => right.get(name)!));
  const wins = diffs.filter((d) => d > 0).length;
  const losses = diffs.filter((d) => d < 0).length;
  return { set, a, b, pairs: names.length, meanA, meanB, points: meanA - meanB, wins, losses, p: wins + losses > 0 ? signTest(wins, losses, 2) : 1 };
}

/** This function gives the mean box side of an input. */
function meanSide(input: PackInput): number {
  return mean(input.items.flatMap((i) => [i.w, i.h]));
}

/** This function gives the value of a flag. */
function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function main(args: readonly string[]): void {
  const out = flag(args, "--out");
  if (out === undefined) throw new Error("Give --out <file>.");
  const seeds = Number(flag(args, "--seeds") ?? 30);
  const count = Number(flag(args, "--count") ?? 40);
  const trials = Number(flag(args, "--trials") ?? 64);
  const timeSeeds = Number(flag(args, "--time-seeds") ?? 5);
  const rows: NearRow[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const input = rasterFamily(seed, count);
    for (const arm of NEAR_ARMS) rows.push(measureRow("family", `s${seed}`, arm, input, meanSide(input) / FAMILY_DIVISOR, trials, seed));
  }
  const dir = flag(args, "--instances");
  for (const file of dir === undefined ? [] : fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const { name, input } = instanceInput(path.basename(file, ".json"), fs.readFileSync(path.join(dir!, file), "utf8"));
    for (const arm of ["bbox", "near-rects"] as const) rows.push(measureRow("instances", name, arm, input, input.container.w! / INSTANCE_DIVISOR, trials, 1));
  }
  const times: number[] = [];
  for (let seed = 1; seed <= timeSeeds; seed++) {
    const input = rasterFamily(seed, 100);
    times.push(measureRow("time", `s${seed}`, "near-rects", input, meanSide(input) / FAMILY_DIVISOR, trials, seed).ms);
  }
  const pairs = [comparePair(rows, "family", "near-rects", "bbox"), comparePair(rows, "family", "near-rects", "raster-nofit")];
  if (rows.some((r) => r.set === "instances")) pairs.push(comparePair(rows, "instances", "near-rects", "bbox"));
  const crossings = rows.reduce((sum, r) => sum + r.crossings, 0);
  const report = { seeds, count, trials, crossings, medianMsAt100: median(times), pairs, rows };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ crossings, medianMsAt100: report.medianMsAt100, pairs }));
}

if (process.argv[1]?.endsWith("near-rects.ts")) main(process.argv.slice(2));
