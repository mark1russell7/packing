// The paired test of the active arm against the control arm (roadmap item k120, slice b).
//
// Each arm of `bench/active.ts` gives a model: the grid and all the pairs of the arm. Both models predict the same
// evaluation sample. For each pair of the sample, d = hit of the active model - hit of the control model.
//
// - The test of a measure is the exact McNemar test: the two-sided sign test of the discordant pairs.
// - The Holm correction keeps the chance of one false claim or more over the measures at most `level`.
// - The bootstrap interval of mean(d) gives the size of the change.

import { bootstrap, holm, mean, signTest } from "@mark1russell7/rigor-statistics";
import type { ArmHits } from "./coverage.ts";

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
