// The bench of `matchPlaces` of roadmap item k31, on the chains of `bench/pin.ts`. A height and a movement are not a time,
// so any computer can start it. `docs/BENCH.md`, "Repack and match", tells the inputs.
//
//   node bench/match.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { compactUp, matchPlaces, measureChange, packWith, pinUnchanged, type PackInput, type PackOutput } from "../src/index.ts";
import { ENTRIES } from "./entries.ts";
import { breaksOf, changeStep, firstStrip } from "./pin.ts";

/** The entries that pack each input. */
const ARMS: readonly string[] = ["maxrects-bl", "skyline", "rows"];

/** The size families. The family `cards` rounds each size up to a step, so it has 12 sizes. The family `free` has no step. */
export const FAMILIES = ["cards", "free"] as const;

/** A size family. */
export type Family = (typeof FAMILIES)[number];

/** The step of the width in the family `cards`. */
const WIDTH_STEP = 20;

/** The step of the height in the family `cards`. */
const HEIGHT_STEP = 25;

/** The methods that follow a change. */
export const METHODS = ["fresh", "match", "pin-compact"] as const;

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
export interface MatchCase {
  readonly arm: string;
  readonly family: Family;
  readonly seed: number;
  readonly steps: Readonly<Record<Method, readonly StepLine[]>>;
  /** The hard rule breaks and the unplaced items of each layout. */
  readonly breaks: number;
}

/** This function rounds each size of an input up to the steps of a family. */
export function sized(input: PackInput, family: Family): PackInput {
  if (family === "free") return input;
  return { ...input, items: input.items.map((item) => ({ ...item, w: Math.ceil(item.w / WIDTH_STEP) * WIDTH_STEP, h: Math.ceil(item.h / HEIGHT_STEP) * HEIGHT_STEP })) };
}

/** This function measures one chain of changes for one entry. */
export function measure(arm: string, family: Family, seed: number, count: number, share: number, stepCount: number): MatchCase {
  const entry = ENTRIES.find((e) => e.id === arm)!;
  const pack = (input: PackInput): PackOutput => packWith(entry.strategy, input, entry.options, seed);
  let input = sized(firstStrip(seed, count), family);
  const first = pack(input);
  const last: Record<Method, PackOutput> = { fresh: first, match: first, "pin-compact": first };
  const lines: Record<Method, StepLine[]> = { fresh: [], match: [], "pin-compact": [] };
  let breaks = breaksOf(input, first);
  for (let step = 1; step <= stepCount; step++) {
    const next = sized(changeStep(input, step, seed, share), family);
    const fresh = pack(next);
    const outputs: Record<Method, PackOutput> = {
      fresh,
      match: matchPlaces(last.match, next, fresh),
      "pin-compact": compactUp(next, pack(pinUnchanged(input, last["pin-compact"], next).input)),
    };
    for (const method of METHODS) {
      const change = measureChange(input, last[method], next, outputs[method]);
      lines[method].push({ moved: change["pack.stability.moved"], distance: change["pack.stability.mean"], cost: outputs[method].size.h / fresh.size.h });
      breaks += breaksOf(next, outputs[method]);
      last[method] = outputs[method];
    }
    input = next;
  }
  return { arm, family, seed, steps: lines, breaks };
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
  const cases: MatchCase[] = [];
  for (const family of FAMILIES) {
    for (const arm of ARMS) {
      for (let seed = 1; seed <= Number(values.seeds); seed++) cases.push(measure(arm, family, seed, Number(values.count), Number(values.share), steps));
    }
  }
  const lines = FAMILIES.flatMap((family) =>
    ARMS.flatMap((arm) => {
      const here = cases.filter((c) => c.arm === arm && c.family === family);
      return METHODS.map((method) => {
        const all = here.flatMap((c) => c.steps[method]);
        return {
          family,
          arm,
          method,
          moved: mean(all.map((l) => l.moved)),
          distance: mean(all.map((l) => l.distance)),
          costLast: mean(here.map((c) => c.steps[method][steps - 1]!.cost)),
          costWorst: Math.max(...all.map((l) => l.cost)),
          breaks: here.reduce((sum, c) => sum + c.breaks, 0),
        };
      });
    }),
  );
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ seeds: Number(values.seeds), count: Number(values.count), share: Number(values.share), steps, lines }, null, 2)}\n`);
  console.log(JSON.stringify(lines));
}

if (process.argv[1]?.endsWith("match.ts")) main();
