// The bench of roadmap item k81: the binary search on the height against proved heights and against named entries.
// It is a separate program. The workflow `binary-height.yml` starts it in CI. It has the input families of the exact bench.
//
//   node bench/binary-height.ts --out <file.json> [--seeds 20] [--trials 256] [--sizes 20,50,100] [--nodes 1000000] [--entries <ids>]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { mean, signTest } from "@mark1russell7/rigor-statistics";
import { exactStrip, objectiveBound, objectiveResult, packBinaryHeight, packWith, type PackInput } from "../src/index.ts";
import { entriesOf, EXACT_FAMILIES } from "./exact.ts";

/** The sizes of the comparison with proved heights. */
const EXACT_SIZES: readonly number[] = [6, 8, 10];

/** The entries of the comparison by default. */
const DEFAULT_ENTRIES = "maxrects-bl,restarts-maxrects-bl-k16,overlap-min-maxrects-bl-k8192";

/** The family name of a line over all families. */
export const ALL_FAMILIES = "all";

/** One line of the comparison with proved heights. */
export interface ExactLine {
  readonly family: string;
  readonly n: number;
  readonly proved: number;
  readonly limited: number;
  readonly hits: number;
  readonly under: number;
}

/** The ratios and the times of one method, one value for each input. */
export interface MethodRun {
  readonly method: string;
  readonly ratios: number[];
  readonly ms: number[];
}

/** One method at one size, with the height as a ratio to the area bound. */
export interface LargeLine {
  readonly family: string;
  readonly n: number;
  readonly method: string;
  readonly cases: number;
  readonly meanRatio: number;
  readonly meanMs: number;
  /** The count of the cases where the binary search is lower. */
  readonly wins: number;
  /** The count of the cases where this method is lower. */
  readonly losses: number;
  /** The two-sided sign test on `wins` and `losses`. It is 1 when these counts are both 0. */
  readonly p: number;
}

/** This function gives the area bound of a strip: the sum of the areas, divided by the width. */
export function areaBound(input: PackInput): number {
  return input.items.reduce((sum, item) => sum + item.w * item.h, 0) / input.container.w!;
}

/** This function gives the line of the comparison with proved heights. */
export function exactLine(family: string, make: (seed: number, n: number) => PackInput, n: number, seeds: number, trials: number, nodeLimit: number): ExactLine {
  let proved = 0;
  let limited = 0;
  let hits = 0;
  let under = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const input = make(seed, n);
    const exact = exactStrip(input, { nodeLimit });
    if (exact.status !== "optimal") {
      limited++;
      continue;
    }
    proved++;
    const { height } = packBinaryHeight(input, { seed, trials });
    if (height === exact.height) hits++;
    if (height < exact.height) under++;
  }
  return { family, n, proved, limited, hits, under };
}

/** This function gives the line of one method, against the ratios of the binary search on the same inputs. */
export function largeLine(family: string, n: number, run: MethodRun, binary: readonly number[]): LargeLine {
  const wins = run.ratios.filter((r, i) => binary[i]! < r).length;
  const losses = run.ratios.filter((r, i) => binary[i]! > r).length;
  return { family, n, method: run.method, cases: run.ratios.length, meanRatio: mean(run.ratios), meanMs: mean(run.ms), wins, losses, p: wins + losses === 0 ? 1 : signTest(wins, losses, 2) };
}

/** This function gives the runs of the methods at one size of one family. The first run is the binary search, and the second is its first layout. */
function runsOf(make: (seed: number, n: number) => PackInput, n: number, seeds: number, trials: number, entries: string): MethodRun[] {
  const binary: MethodRun = { method: "binary-height", ratios: [], ms: [] };
  const first: MethodRun = { method: "first-layout", ratios: [], ms: [] };
  const others = new Map<string, MethodRun>();
  for (let seed = 0; seed < seeds; seed++) {
    const input = make(seed, n);
    const bound = areaBound(input);
    const start = performance.now();
    const result = packBinaryHeight(input, { seed, trials });
    binary.ms.push(performance.now() - start);
    binary.ratios.push(result.height / bound);
    first.ms.push(0);
    first.ratios.push(result.firstHeight / bound);
    for (const entry of entriesOf(entries, input)) {
      const begin = performance.now();
      const output = packWith(entry.strategy, input, entry.options, seed);
      const elapsed = performance.now() - begin;
      const height = objectiveResult(input, output, objectiveBound(input, { tolerance: 0 })!);
      if (height === undefined) throw new RangeError(`The entry ${entry.id} gives no height at seed ${seed}.`);
      const run = others.get(entry.id) ?? { method: entry.id, ratios: [], ms: [] };
      run.ratios.push(height / bound);
      run.ms.push(elapsed);
      others.set(entry.id, run);
    }
  }
  return [binary, first, ...others.values()];
}

/** This function gives the lines of one size: a line for each family and method, and the lines over all families. */
function largeLines(n: number, seeds: number, trials: number, entries: string): LargeLine[] {
  const lines: LargeLine[] = [];
  const pooled = new Map<string, MethodRun>();
  for (const family of EXACT_FAMILIES) {
    const runs = runsOf(family.make, n, seeds, trials, entries);
    for (const run of runs) {
      lines.push(largeLine(family.name, n, run, runs[0]!.ratios));
      const all = pooled.get(run.method) ?? { method: run.method, ratios: [], ms: [] };
      all.ratios.push(...run.ratios);
      all.ms.push(...run.ms);
      pooled.set(run.method, all);
    }
  }
  const binary = pooled.get("binary-height")!.ratios;
  return [...lines, ...[...pooled.values()].map((run) => largeLine(ALL_FAMILIES, n, run, binary))];
}

/** This function starts the bench and writes its report. It gives the exit code. */
function main(): number {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      seeds: { type: "string", default: "20" },
      trials: { type: "string", default: "256" },
      sizes: { type: "string", default: "20,50,100" },
      nodes: { type: "string", default: "1000000" },
      entries: { type: "string", default: DEFAULT_ENTRIES },
    },
  });
  if (values.out === undefined) throw new RangeError("The bench needs --out.");
  const seeds = Number(values.seeds);
  const trials = Number(values.trials);
  const nodes = Number(values.nodes);
  const sizes = values.sizes.split(",").map(Number);
  const exact = EXACT_FAMILIES.flatMap((family) => EXACT_SIZES.map((n) => exactLine(family.name, family.make, n, seeds, trials, nodes)));
  const large = sizes.flatMap((n) => largeLines(n, seeds, trials, values.entries));
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify({ seeds, trials, nodes, exact, large }, null, 2)}\n`);
  for (const l of exact) console.log(`${l.family} n=${l.n}: ${l.hits} of ${l.proved} proved, ${l.limited} at the limit, ${l.under} under`);
  for (const l of large.filter((line) => line.family === ALL_FAMILIES)) {
    console.log(`n=${l.n} ${l.method}: ratio ${l.meanRatio.toFixed(4)}, ${l.meanMs.toFixed(1)} ms, ${l.wins} wins, ${l.losses} losses, p ${l.p.toFixed(4)}`);
  }
  return 0;
}

if (process.argv[1]?.endsWith("binary-height.ts")) process.exitCode = main();
