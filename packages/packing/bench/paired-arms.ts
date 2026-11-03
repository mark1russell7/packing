// The paired test of the active arm against the control arm (roadmap item k120, slice b).
//
// Each arm of `bench/active.ts` gives a model: the grid and all the pairs of the arm. Both models predict the same
// evaluation sample. For each pair of the sample, d = hit of the active model - hit of the control model.
//
// - The test of a measure is the exact McNemar test: the two-sided sign test of the discordant pairs.
// - The Holm correction keeps the chance of one false claim or more over the measures at most `level`.
// - The bootstrap interval of mean(d) gives the size of the change.
//
// `foldVerdict` reads the paired tests of 5 fold seeds or more (slice e). A change is a result only when the mean of
// mean(d) over the seeds is more than 2 SD of those values from 0 (`noiseFloor`).
//
//   node bench/paired-arms.ts --out <file> <coverage.json> <coverage.json> ...

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bootstrap, holm, mean, noiseFloor, signTest } from "@mark1russell7/rigor-statistics";
import type { ArmHits } from "./coverage.ts";
import { optionOf } from "./sample-space.ts";

/** The level of the family of tests over the measures, and of the bootstrap interval. */
export const PAIRED_LEVEL = 0.05;

/** The count of the bootstrap samples of mean(d). */
export const PAIRED_RUNS = 10_000;

/** The seed of the bootstrap draws. */
export const PAIRED_SEED = "k120-paired";

/** The paired result of one measure: the counts of the four outcomes, mean(d) with its interval, and the test. */
export interface PairedMeasure {
  readonly id: string;
  /** The evaluation pairs with a finite value. */
  readonly n: number;
  /** The pairs that the two models hit. */
  readonly both: number;
  /** The pairs that only the active model hits. */
  readonly active: number;
  /** The pairs that only the control model hits. */
  readonly control: number;
  /** The pairs that the two models miss. */
  readonly neither: number;
  /** The mean of d over the pairs: the share of the active model minus the share of the control model. */
  readonly meanDiff: number;
  readonly interval: { readonly low: number; readonly high: number; readonly level: number };
  /** The p of the exact McNemar test, two-sided. */
  readonly p: number;
  /** The p after the Holm correction over the measures. */
  readonly adjusted: number;
  /** The adjusted p is less than the level. */
  readonly reject: boolean;
}

/** The paired test of the two arms over all the measures. */
export interface PairedArms {
  readonly level: number;
  readonly runs: number;
  readonly seed: string;
  readonly measures: readonly PairedMeasure[];
}

/** The options of `pairedArms`. */
export interface PairedOptions {
  readonly level?: number;
  readonly runs?: number;
  readonly seed?: string;
}

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4 + 0;

/**
 * This function gives the paired test of the active arm against the control arm.
 * It throws an `Error` when the two arms do not have the same measures and the same evaluation pairs.
 */
export function pairedArms(active: readonly ArmHits[], control: readonly ArmHits[], options: PairedOptions = {}): PairedArms {
  const level = options.level ?? PAIRED_LEVEL;
  const runs = options.runs ?? PAIRED_RUNS;
  const seed = options.seed ?? PAIRED_SEED;
  if (active.map((m) => m.id).join() !== control.map((m) => m.id).join()) throw new Error("The two arms do not have the same measures.");
  const rows = active.map((a, i) => {
    const c = control[i]!;
    if (a.at.join() !== c.at.join()) throw new Error(`The two arms do not have the same evaluation pairs for ${a.id}.`);
    const d = a.hits.map((h, j) => Number(h) - Number(c.hits[j]));
    const count = (x: boolean, y: boolean): number => a.hits.filter((h, j) => h === x && c.hits[j] === y).length;
    const counts = { both: count(true, true), active: count(true, false), control: count(false, true), neither: count(false, false) };
    const ci = d.length === 0 ? { low: 0, high: 0 } : bootstrap(d, mean, { runs, level: 1 - level, seed: `${seed}-${a.id}` });
    return { id: a.id, n: d.length, ...counts, meanDiff: d.length === 0 ? 0 : r4(mean(d)), interval: { low: r4(ci.low), high: r4(ci.high), level: 1 - level }, p: signTest(counts.active, counts.control, 2) };
  });
  const corrected = holm(rows.map((r) => r.p), level);
  return {
    level,
    runs,
    seed,
    measures: rows.map((r, i) => ({ ...r, p: r4(r.p), adjusted: r4(corrected[i]!.adjusted), reject: corrected[i]!.reject })),
  };
}

/** This function gives one line of the command line for each measure of a paired test. */
export function pairedLines(p: PairedArms): string[] {
  return p.measures.map(
    (m) =>
      `${m.id}, active against control on ${m.n} evaluation pairs: mean difference ${m.meanDiff} (${m.interval.level * 100}% from ${m.interval.low} to ${m.interval.high}). Only active ${m.active}, only control ${m.control}. McNemar p ${m.p}, Holm ${m.adjusted}${m.reject ? ", a change" : ", no change"}.`,
  );
}

/** The outcome of a measure over the fold seeds: a gain or a loss of the active arm, or noise. */
export type FoldOutcome = "gain" | "loss" | "noise";

/** The result of one measure over the fold seeds (k120 slice e). */
export interface FoldMeasure {
  readonly id: string;
  /** The mean(d) of each fold seed, in the order of the input. */
  readonly diffs: readonly number[];
  /** The mean of `diffs`. */
  readonly mean: number;
  /** 2 sample SD of `diffs`, from `noiseFloor` of `@mark1russell7/rigor-statistics`. */
  readonly floor: number;
  /** The count of the fold seeds where the Holm correction of the paired test finds a change. */
  readonly rejects: number;
  /** A gain or a loss only when the absolute mean is more than the floor. */
  readonly outcome: FoldOutcome;
}

/** The result of the paired tests of all the fold seeds. */
export interface FoldVerdict {
  /** The count of the fold seeds. */
  readonly seeds: number;
  readonly measures: readonly FoldMeasure[];
}

/**
 * This function gives the result of each measure over the paired tests of 5 fold seeds or more (k120 slice e).
 * It throws an `Error` when the tests do not have the same measures, and a `RangeError` for fewer than 5 tests.
 */
export function foldVerdict(results: readonly PairedArms[]): FoldVerdict {
  const ids = results[0]?.measures.map((m) => m.id) ?? [];
  for (const r of results) if (r.measures.map((m) => m.id).join() !== ids.join()) throw new Error("The paired tests do not have the same measures.");
  const measures = ids.map((id, i): FoldMeasure => {
    const diffs = results.map((r) => r.measures[i]!.meanDiff);
    const floor = noiseFloor(diffs);
    const m = mean(diffs);
    return {
      id,
      diffs,
      mean: r4(m),
      floor: r4(floor),
      rejects: results.filter((r) => r.measures[i]!.reject).length,
      outcome: Math.abs(m) <= floor ? "noise" : m > 0 ? "gain" : "loss",
    };
  });
  return { seeds: results.length, measures };
}

/** This function gives one line of the command line for each measure of a fold verdict. */
export function foldLines(v: FoldVerdict): string[] {
  return v.measures.map((m) => `${m.id} over ${v.seeds} fold seeds: mean difference ${m.mean}, floor ${m.floor} (2 SD), ${m.rejects} of ${v.seeds} paired tests with a change: ${m.outcome}.`);
}

/** This function starts the fold verdict from the command line: it reads the section `paired` of each coverage summary and writes the verdict. */
export function foldMain(argv: readonly string[]): FoldVerdict {
  const out = optionOf(argv, "--out");
  const at = argv.indexOf("--out");
  const files = argv.filter((_, i) => i !== at && i !== at + 1);
  if (out === undefined || files.length === 0) throw new Error("Start the fold verdict with: node bench/paired-arms.ts --out <file> <coverage.json> ...");
  const results = files.map((f) => {
    const paired = (JSON.parse(readFileSync(f, "utf8")) as { paired?: PairedArms }).paired;
    if (paired === undefined) throw new Error(`The coverage summary ${f} has no section paired. Start bench/coverage.ts with --control.`);
    return paired;
  });
  const verdict = foldVerdict(results);
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(verdict, null, 1)}\n`);
  for (const line of foldLines(verdict)) console.log(line);
  return verdict;
}

if (process.argv[1]?.endsWith("paired-arms.ts") === true) foldMain(process.argv.slice(2));
