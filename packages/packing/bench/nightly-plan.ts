// The plan and the cells of the control run of the active draw (k120, `coverage-nightly.yml`).
//
// - `plan` checks the inputs, and writes the lines `seeds=` and `shards=` for `GITHUB_OUTPUT`.
// - `cells` reads the folder of each arm. A cell is one fold seed with its two arms. A cell is void when an arm has no
//   summary, or when the timeout stopped the arm before its work budget. The command writes the record `cells.json` and
//   gives the seeds of the cells that are not void.
//
//   node bench/nightly-plan.ts plan --seeds <json list> --shards <n>
//   node bench/nightly-plan.ts cells --arms <dir> --seeds <json list> --out <file> [--commit <sha>] [--event <name>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { optionOf } from "./sample-space.ts";

/** The fewest fold seeds of a run. `foldVerdict` needs 5 or more. */
export const MIN_SEEDS = 5;

/** The most shards of the held-out sample. */
export const MAX_SHARDS = 16;

/** This function reads the fold seeds: a JSON list of 5 or more different whole numbers. It throws a `RangeError` for another value. */
export function seedsOf(text: string): number[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RangeError(`The seeds are a JSON list, not '${text}'.`);
  }
  if (!Array.isArray(value) || value.length < MIN_SEEDS || !value.every(Number.isInteger) || new Set(value).size !== value.length) {
    throw new RangeError(`The seeds are a list of ${MIN_SEEDS} or more different whole numbers, not '${text}'.`);
  }
  return value as number[];
}

/** This function gives the shard indexes `0` to `n - 1`, for `n` from 1 to `MAX_SHARDS`. It throws a `RangeError` for another value. */
export function shardsOf(text: string): number[] {
  if (!/^[1-9][0-9]*$/.test(text) || Number(text) > MAX_SHARDS) throw new RangeError(`The shards are 1 to ${MAX_SHARDS}, not '${text}'.`);
  return [...Array(Number(text)).keys()];
}

/** The part of the summary `sample.json` of an arm that a cell reads. */
interface ArmSummary {
  readonly stopped?: string;
}

/** One fold seed with its two arms. */
export interface Cell {
  readonly seed: number;
  /** The value `true` when the cell does not go into the fold verdict. */
  readonly void: boolean;
  /** The reason of a void cell. */
  readonly reason?: string;
}

/** This function gives the cell of a fold seed from the summaries of its arms. A missing summary is `undefined`. */
export function cellOf(seed: number, active: ArmSummary | undefined, control: ArmSummary | undefined): Cell {
  for (const [arm, summary] of [["active", active], ["control", control]] as const) {
    if (summary === undefined) return { seed, void: true, reason: `the arm ${arm} has no summary` };
    if (summary.stopped !== undefined) return { seed, void: true, reason: `the timeout stopped the arm ${arm} before its work budget` };
  }
  return { seed, void: false };
}

/** This function reads the summary of an arm folder, or gives `undefined` when the folder has no summary. */
function armSummary(dir: string): ArmSummary | undefined {
  const file = join(dir, "sample.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ArmSummary) : undefined;
}

/** The record `cells.json` of a run. */
export interface CellsRecord {
  readonly commit?: string;
  readonly event?: string;
  readonly seeds: readonly number[];
  readonly cells: readonly Cell[];
  /** The seeds of the cells that are not void. */
  readonly live: readonly number[];
}

/**
 * This function starts the command `cells`. It writes the record, and gives the seeds of the cells that are not void.
 * It throws an `Error` after the record when fewer than `MIN_SEEDS` cells are not void.
 */
export function cellsMain(argv: readonly string[]): CellsRecord {
  const arms = optionOf(argv, "--arms");
  const out = optionOf(argv, "--out");
  const seedsText = optionOf(argv, "--seeds");
  if (arms === undefined || out === undefined || seedsText === undefined) throw new Error("Start the command with: node bench/nightly-plan.ts cells --arms <dir> --seeds <json list> --out <file>");
  const seeds = seedsOf(seedsText);
  const cells = seeds.map((s) => cellOf(s, armSummary(join(arms, `nightly-arm-active-${s}`)), armSummary(join(arms, `nightly-arm-control-${s}`))));
  const commit = optionOf(argv, "--commit");
  const event = optionOf(argv, "--event");
  const record: CellsRecord = {
    ...(commit === undefined ? {} : { commit }),
    ...(event === undefined ? {} : { event }),
    seeds,
    cells,
    live: cells.filter((c) => !c.void).map((c) => c.seed),
  };
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 1)}\n`);
  for (const c of cells) if (c.void) console.error(`The cell of the seed ${c.seed} is void: ${c.reason}.`);
  if (record.live.length < MIN_SEEDS) throw new Error(`Only ${record.live.length} of ${seeds.length} cells are not void. The fold verdict needs ${MIN_SEEDS} or more.`);
  return record;
}

/** This function starts the command `plan`. It gives the lines for `GITHUB_OUTPUT`. */
export function planMain(argv: readonly string[]): string[] {
  const seeds = optionOf(argv, "--seeds");
  const shards = optionOf(argv, "--shards");
  if (seeds === undefined || shards === undefined) throw new Error("Start the command with: node bench/nightly-plan.ts plan --seeds <json list> --shards <n>");
  return [`seeds=${JSON.stringify(seedsOf(seeds))}`, `shards=${JSON.stringify(shardsOf(shards))}`];
}

if (process.argv[1]?.endsWith("nightly-plan.ts") === true) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "plan") for (const line of planMain(rest)) console.log(line);
  else if (command === "cells") console.log(cellsMain(rest).live.join(" "));
  else throw new Error("Start the script with the command plan or cells.");
}
