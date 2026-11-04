// Roadmap item k29: the movement and the height of a pinned pack against a fresh pack (`docs/BENCH.md`, "The pin of
// unchanged boxes"). A height and a movement are not a time, so any computer can start this script. It is not a command
// of `bench/main.ts`.
//
//   node bench/pin.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { checkHard, measureChange, mulberry32, packWith, pinUnchanged, type Item, type PackInput, type PackOutput } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";

/** The width of each strip. */
const WIDTH = 200;

/** The widest item of each strip. */
const WIDEST = 60;

/** The tallest item of each strip. */
const TALLEST = 100;

/** The entries that the bench compares. */
const ARMS: readonly string[] = ["maxrects-bl", "skyline"];

/** The three kinds of a change, in the order of their turns. */
const KINDS: readonly ("remove" | "add" | "resize")[] = ["remove", "add", "resize"];

/** One seed of one arm. */
export interface PinCase {
  readonly arm: string;
  readonly seed: number;
  /** The share of the staying boxes that moved, for each step. */
  readonly freshMoved: readonly number[];
  readonly pinnedMoved: readonly number[];
  /** The pinned height over the fresh height, for each step. */
  readonly cost: readonly number[];
  /** The hard rule breaks and the unplaced items of each layout. */
  readonly breaks: number;
}

/** This function gives a made-up item. */
function itemOf(id: string, random: () => number): Item {
  return { id, w: 1 + Math.floor(random() * WIDEST), h: 1 + Math.floor(random() * TALLEST) };
}

/** This function gives the first strip of a seed. */
export function firstStrip(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push(itemOf(`i${i}`, random));
  return { container: { fixed: "width", w: WIDTH }, items };
}

/**
 * This function gives one change step. The step has `Math.round(count * share)` edits, at least 1. The edits take turns:
 * remove, add, resize. A remove takes a random item. A resize draws a new size for a random item.
 */
export function changeStep(input: PackInput, step: number, seed: number, share: number): PackInput {
  const random = mulberry32(seed * 1009 + step);
  const items = input.items.slice();
  const edits = Math.max(1, Math.round(input.items.length * share));
  for (let e = 0; e < edits; e++) {
    const kind = KINDS[e % KINDS.length]!;
    if (kind === "add") {
      items.push(itemOf(`s${step}e${e}`, random));
    } else {
      const at = Math.floor(random() * items.length);
      if (kind === "remove") items.splice(at, 1);
      else items[at] = { ...itemOf(items[at]!.id, random) };
    }
  }
  return { ...input, items };
}

/** This function counts the hard rule breaks and the unplaced items of a layout. */
const breaksOf = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function measures one chain of changes for one arm. */
export function measure(arm: string, seed: number, count: number, share: number, steps: number): PinCase {
  const entry = ENTRIES.find((e) => e.id === arm)!;
  const pack = (input: PackInput): PackOutput => packWith(entry.strategy, input, entry.options, seed);
  let input = firstStrip(seed, count);
  let fresh = pack(input);
  let pinned = fresh;
  let breaks = breaksOf(input, fresh);
  const freshMoved: number[] = [];
  const pinnedMoved: number[] = [];
  const cost: number[] = [];
  for (let step = 1; step <= steps; step++) {
    const next = changeStep(input, step, seed, share);
    const nextFresh = pack(next);
    const pin = pinUnchanged(input, pinned, next);
    const nextPinned = pack(pin.input);
    freshMoved.push(measureChange(input, fresh, next, nextFresh)["pack.stability.moved"]);
    pinnedMoved.push(measureChange(input, pinned, next, nextPinned)["pack.stability.moved"]);
    cost.push(nextPinned.size.h / nextFresh.size.h);
    breaks += breaksOf(next, nextFresh) + breaksOf(pin.input, nextPinned);
    input = next;
    fresh = nextFresh;
    pinned = nextPinned;
  }
  return { arm, seed, freshMoved, pinnedMoved, cost, breaks };
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
    },
  });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const steps = Number(values.steps);
  const cases: PinCase[] = [];
  for (const arm of ARMS) for (let seed = 1; seed <= Number(values.seeds); seed++) cases.push(measure(arm, seed, Number(values.count), Number(values.share), steps));
  const lines = ARMS.map((arm) => {
    const here = cases.filter((c) => c.arm === arm);
    return {
      arm,
      freshMoved: mean(here.flatMap((c) => c.freshMoved)),
      pinnedMoved: mean(here.flatMap((c) => c.pinnedMoved)),
      costFirst: mean(here.map((c) => c.cost[0]!)),
      costLast: mean(here.map((c) => c.cost[steps - 1]!)),
      costWorst: Math.max(...here.flatMap((c) => c.cost)),
      breaks: here.reduce((sum, c) => sum + c.breaks, 0),
    };
  });
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ seeds: Number(values.seeds), count: Number(values.count), share: Number(values.share), steps, lines }, null, 2)}\n`);
  console.log(JSON.stringify(lines));
}

if (process.argv[1]?.endsWith("pin.ts")) main();
