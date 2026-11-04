// Roadmap item k82: the movement and the height of the row legalizer on the chains of `change-walk` (`docs/BENCH.md`, "The
// row legalizer"). A height and a movement are not a time, so any computer can start this script. It is not a command of
// `bench/main.ts`.
//
//   node bench/legalize.ts --out <file.json> [--seeds 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { CHANGE_WALK_KINDS, CHANGE_WALK_STEPS, changeWalk, checkHard, legalizeRows, measureChange, packWith, toPackInput, type PackInput, type PackOutput } from "../src/index.ts";

/** The counts of the boxes of a chain. */
const COUNTS: readonly number[] = [20, 60];

/** The arms of the bench. */
const ARMS: readonly ("fresh" | "tetris" | "abacus")[] = ["fresh", "tetris", "abacus"];

/** One arm of the bench, for one kind of edit. */
export interface LegalizeRow {
  readonly arm: string;
  readonly kind: string;
  /** The mean share of the staying boxes that moved. */
  readonly moved: number;
  /** The mean distance of the staying boxes, in widths of the container. */
  readonly distance: number;
  /** The mean height at step 5. */
  readonly height: number;
}

/** This function counts the hard rule breaks and the unplaced items of a layout. */
const breaksOf = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function gives the layout of the next step of an arm. */
function next(arm: string, seed: number, before: { input: PackInput; output: PackOutput }, input: PackInput): PackOutput {
  if (arm === "fresh") return packWith("rows", input, {}, seed);
  return legalizeRows(before.input, before.output, input, { placeRow: arm === "abacus" });
}

/** This function gives the rows of each arm and each kind, and the count of the breaks of the legalized layouts. */
export function rowsOf(seeds: number): { readonly rows: readonly LegalizeRow[]; readonly breaks: number } {
  const rows: LegalizeRow[] = [];
  let breaks = 0;
  for (const arm of ARMS) {
    for (const kind of CHANGE_WALK_KINDS) {
      const moved: number[] = [];
      const distance: number[] = [];
      const heights: number[] = [];
      for (const count of COUNTS) {
        for (let seed = 1; seed <= seeds; seed++) {
          const first = toPackInput(changeWalk.generate(seed, { kind, step: 0, count }));
          let before = { input: first, output: packWith("rows", first, {}, seed) };
          for (let step = 1; step <= CHANGE_WALK_STEPS; step++) {
            const input = toPackInput(changeWalk.generate(seed, { kind, step, count }));
            const output = next(arm, seed, before, input);
            const change = measureChange(before.input, before.output, input, output);
            moved.push(change["pack.stability.moved"]);
            distance.push(change["pack.stability.mean"]);
            if (arm !== "fresh") breaks += breaksOf(input, output);
            before = { input, output };
          }
          heights.push(before.output.size.h);
        }
      }
      rows.push({ arm, kind, moved: mean(moved), distance: mean(distance), height: mean(heights) });
    }
  }
  return { rows, breaks };
}

/** This function starts the bench. */
function main(): void {
  const { values } = parseArgs({ options: { out: { type: "string" }, seeds: { type: "string", default: "10" } } });
  if (values.out === undefined) throw new Error("The bench needs --out <file.json>.");
  const result = rowsOf(Number(values.seeds));
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith("legalize.ts")) main();
