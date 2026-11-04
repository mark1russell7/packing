// The bench of `keepPrefix` of roadmap item k30, on the chains of `bench/pin.ts`. A height and a movement are not a time,
// so any computer can start it. `docs/BENCH.md`, "The kept prefix", tells the inputs.
//
//   node bench/prefix.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { compactUp, keepPrefix, measureChange, packWith, pinUnchanged, type PackInput, type PackOutput } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";
import { breaksOf, changeStep, firstStrip } from "./pin.ts";

/** The entries that pack each input. */
const ARMS: readonly string[] = ["maxrects-bl", "skyline", "rows"];

/** The methods that follow a change. */
export const METHODS = ["fresh", "pin-compact", "prefix"] as const;

/** A method that follows a change. */
export type Method = (typeof METHODS)[number];

/** The measures of one step of one method. */
export interface StepLine {
  readonly moved: number;
  readonly distance: number;
  /** The height over the fresh height. */
  readonly cost: number;
}

/** One seed of one entry. */
export interface PrefixCase {
  readonly arm: string;
  readonly seed: number;
  readonly steps: Readonly<Record<Method, readonly StepLine[]>>;
  /** The share of the items that `keepPrefix` pins, for each step. */
  readonly pinned: readonly number[];
  /** The hard rule breaks and the unplaced items of each layout. */
  readonly breaks: number;
}

/** This function measures one chain of changes for one entry. */
export function measure(arm: string, seed: number, count: number, share: number, stepCount: number): PrefixCase {
  const entry = ENTRIES.find((e) => e.id === arm)!;
  const pack = (input: PackInput): PackOutput => packWith(entry.strategy, input, entry.options, seed);
  let input = firstStrip(seed, count);
  const first = pack(input);
  const last: Record<Method, PackOutput> = { fresh: first, "pin-compact": first, prefix: first };
  const lines: Record<Method, StepLine[]> = { fresh: [], "pin-compact": [], prefix: [] };
  const pinned: number[] = [];
  let breaks = breaksOf(input, first);
  for (let step = 1; step <= stepCount; step++) {
    const next = changeStep(input, step, seed, share);
    const keep = keepPrefix(input, last.prefix, next);
    pinned.push(keep.pinned.length / next.items.length);
    const outputs: Record<Method, PackOutput> = {
      fresh: pack(next),
      "pin-compact": compactUp(next, pack(pinUnchanged(input, last["pin-compact"], next).input)),
      prefix: pack(keep.input),
    };
    for (const method of METHODS) {
      const change = measureChange(input, last[method], next, outputs[method]);
      lines[method].push({ moved: change["pack.stability.moved"], distance: change["pack.stability.mean"], cost: outputs[method].size.h / outputs.fresh.size.h });
      breaks += breaksOf(next, outputs[method]);
      last[method] = outputs[method];
    }
    input = next;
  }
  return { arm, seed, steps: lines, pinned, breaks };
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
  const cases: PrefixCase[] = [];
  for (const arm of ARMS) for (let seed = 1; seed <= Number(values.seeds); seed++) cases.push(measure(arm, seed, Number(values.count), Number(values.share), steps));
  const lines = ARMS.flatMap((arm) => {
    const here = cases.filter((c) => c.arm === arm);
    return METHODS.map((method) => {
      const all = here.flatMap((c) => c.steps[method]);
      return {
        arm,
        method,
        moved: mean(all.map((l) => l.moved)),
        distance: mean(all.map((l) => l.distance)),
        costFirst: mean(here.map((c) => c.steps[method][0]!.cost)),
        costLast: mean(here.map((c) => c.steps[method][steps - 1]!.cost)),
        costWorst: Math.max(...all.map((l) => l.cost)),
        pinned: method === "prefix" ? mean(here.flatMap((c) => c.pinned)) : null,
        breaks: here.reduce((sum, c) => sum + c.breaks, 0),
      };
    });
  });
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ seeds: Number(values.seeds), count: Number(values.count), share: Number(values.share), steps, lines }, null, 2)}\n`);
  console.log(JSON.stringify(lines));
}

if (process.argv[1]?.endsWith("prefix.ts")) main();
