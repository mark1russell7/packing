// Roadmap item k31: the pin and repack in a container of fixed size, against a fresh pack (`docs/BENCH.md`, "The pin and
// repack"). A movement is not a time, so any computer can start this script. It is not a command of `bench/main.ts`.
// The prediction packing-k31-pin-repack names this read.
//
//   node bench/repack.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10] [--slack 1.1]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { measureChange, packWith, repackPinned, type PackInput, type PackOutput, type RepackMethod } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";
import { breaksOf, changeStep, firstStrip } from "./pin.ts";

/** The entries that the bench compares. */
const ARMS: readonly string[] = ["maxrects-bl", "skyline"];

/** One seed of one arm. */
export interface RepackCase {
  readonly arm: string;
  readonly seed: number;
  /** The share of the staying boxes that moved, for each step. */
  readonly freshMoved: readonly number[];
  readonly repackMoved: readonly number[];
  /** The mean distance of the staying boxes, for each step, in units of the width. */
  readonly freshDistance: readonly number[];
  readonly repackDistance: readonly number[];
  /** The pack that `repackPinned` keeps, for each step. */
  readonly methods: readonly RepackMethod[];
  /** The count of the steps where the fresh pack has an overflow. */
  readonly freshOverflows: number;
  /** The count of the steps where the fresh pack has no overflow and `repackPinned` has an overflow. The claim is 0. */
  readonly misses: number;
  /** The hard rule breaks of each layout, with no count of the overflow. */
  readonly breaks: number;
}

/** This function counts the hard rule breaks of a layout, with no count of the overflow. */
const hardOf = (input: PackInput, output: PackOutput): number => breaksOf(input, output) - output.overflow.length;

/**
 * This function measures one chain of changes for one arm. The container has the width of the strip and `slack` times the
 * height of the first fresh pack of the strip.
 */
export function measure(arm: string, seed: number, count: number, share: number, steps: number, slack: number): RepackCase {
  const entry = ENTRIES.find((e) => e.id === arm)!;
  const pack = (input: PackInput): PackOutput => packWith(entry.strategy, input, entry.options, seed);
  const strip = firstStrip(seed, count);
  let input: PackInput = { ...strip, container: { fixed: "size", w: strip.container.w!, h: Math.ceil(pack(strip).size.h * slack) } };
  let fresh = pack(input);
  let repacked = fresh;
  let breaks = hardOf(input, fresh);
  const freshMoved: number[] = [];
  const repackMoved: number[] = [];
  const freshDistance: number[] = [];
  const repackDistance: number[] = [];
  const methods: RepackMethod[] = [];
  let freshOverflows = 0;
  let misses = 0;
  for (let step = 1; step <= steps; step++) {
    const next = changeStep(input, step, seed, share);
    const nextFresh = pack(next);
    const result = repackPinned(input, repacked, next, pack);
    const freshChange = measureChange(input, fresh, next, nextFresh);
    const repackChange = measureChange(input, repacked, next, result.output);
    freshMoved.push(freshChange["pack.stability.moved"]);
    repackMoved.push(repackChange["pack.stability.moved"]);
    freshDistance.push(freshChange["pack.stability.mean"]);
    repackDistance.push(repackChange["pack.stability.mean"]);
    methods.push(result.method);
    if (nextFresh.overflow.length > 0) freshOverflows += 1;
    else if (result.output.overflow.length > 0) misses += 1;
    breaks += hardOf(next, nextFresh) + hardOf(result.input, result.output);
    input = next;
    fresh = nextFresh;
    repacked = result.output;
  }
  return { arm, seed, freshMoved, repackMoved, freshDistance, repackDistance, methods, freshOverflows, misses, breaks };
}

/** The summary of one arm. */
export interface RepackLine {
  readonly arm: string;
  readonly freshMoved: number;
  readonly repackMoved: number;
  /** The mean moved share of `repackPinned` over the mean of the fresh pack. The claim is at most 0.5. */
  readonly movedRatio: number;
  readonly freshDistance: number;
  readonly repackDistance: number;
  /** The share of the steps where `repackPinned` keeps each pack. */
  readonly methods: Readonly<Record<RepackMethod, number>>;
  readonly freshOverflows: number;
  readonly misses: number;
  readonly breaks: number;
}

/** This function gives the summary of the cases of one arm. */
export function lineOf(arm: string, cases: readonly RepackCase[]): RepackLine {
  const here = cases.filter((c) => c.arm === arm);
  const all = here.flatMap((c) => c.methods);
  const share = (method: RepackMethod): number => (all.length === 0 ? 0 : all.filter((m) => m === method).length / all.length);
  const freshMoved = mean(here.flatMap((c) => c.freshMoved));
  const repackMoved = mean(here.flatMap((c) => c.repackMoved));
  return {
    arm,
    freshMoved,
    repackMoved,
    movedRatio: repackMoved / freshMoved,
    freshDistance: mean(here.flatMap((c) => c.freshDistance)),
    repackDistance: mean(here.flatMap((c) => c.repackDistance)),
    methods: { pin: share("pin"), prefix: share("prefix"), fresh: share("fresh") },
    freshOverflows: here.reduce((sum, c) => sum + c.freshOverflows, 0),
    misses: here.reduce((sum, c) => sum + c.misses, 0),
    breaks: here.reduce((sum, c) => sum + c.breaks, 0),
  };
}

/** This function starts the bench. */
function main(): void {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      seeds: { type: "string", default: "30" },
      count: { type: "string", default: "100" },
      share: { type: "string", default: "0.05" },
      steps: { type: "string", default: "10" },
      slack: { type: "string", default: "1.1" },
    },
  });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const [seeds, count, share, steps, slack] = [values.seeds, values.count, values.share, values.steps, values.slack].map(Number) as [number, number, number, number, number];
  const cases: RepackCase[] = [];
  for (const arm of ARMS) for (let seed = 1; seed <= seeds; seed++) cases.push(measure(arm, seed, count, share, steps, slack));
  const lines = ARMS.map((arm) => lineOf(arm, cases));
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ seeds, count, share, steps, slack, lines }, null, 2)}\n`);
  console.log(JSON.stringify(lines));
}

if (process.argv[1]?.endsWith("repack.ts")) main();
