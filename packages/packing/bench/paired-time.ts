// The paired time test of two or more strategies (k127, `docs/BENCH.md`, "A paired time test of strategies").
//
//   node bench/main.ts run --corpus <name> --prediction <id> --paired-time base,a,b [--repeats 5] [--warmup 2] [--out dir]
//
// The runner packs all the strategies in one process, in turns for each input. Each odd repeat has the strategies in the
// reverse order, and the warm-up passes do not count. This file gives the time ratio of each strategy over the first strategy.

import { round3 } from "@mark1russell7/packing";
import { isMeasured, median, type BenchRecord, type BenchRun, type MeasuredRecord } from "./run.ts";

/** The mode of the timing of a paired time run. Each record of `PairedTimeReport` names it. */
export const PAIRED_TIME_MODE = "paired-time";

/** The ratios of one input: the median time of each strategy over the median time of the base. */
export interface PairedTimeInput {
  input: string;
  seed: number;
  /** The median time of each strategy, in milliseconds */
  ms: Record<string, number>;
  /** The value `ms[id] / ms[base]` for each strategy other than the base */
  ratio: Record<string, number>;
}

/** The summary of the ratios of one strategy over the base. */
export interface PairedTimeRatio {
  /** The inputs with a time of the strategy and of the base */
  inputs: number;
  /** The median of the ratios of all the inputs */
  median: number;
  /** The median of the ratios of the inputs of each seed fold, by seed */
  folds: Record<string, number>;
  /** The mean of the fold medians */
  foldMean: number;
  /** The sample SD of the fold medians. A count of folds less than 2 gives 0. */
  foldSD: number;
}

/** The report of a paired time run: the file `paired-time.json`. */
export interface PairedTimeReport {
  schema: "packing-paired-time/1";
  mode: typeof PAIRED_TIME_MODE;
  corpus: string;
  prediction: string;
  commit?: string;
  /** The CPU model of the runner. All the times come from this one process. */
  cpu: string;
  runner: string;
  repeats: number;
  warmup: number;
  /** The first strategy: the denominator of each ratio */
  base: string;
  strategies: string[];
  ratios: Record<string, PairedTimeRatio>;
  inputs: PairedTimeInput[];
}

/** This function gives the mean of a list. An empty list gives 0. */
const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

/** This function gives the sample SD of a list. A list of fewer than 2 values gives 0. */
const sampleSD = (values: readonly number[]): number => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
};

/**
 * This function gives the report of a paired time run from its facts and its records.
 *
 * - The base is the first strategy of the run. An input gets a ratio of a strategy only when both have a measured record with a time above 0.
 * - The folds are the seeds of the inputs. The fold SD is the spread of the fold medians.
 * - A run that is not a paired time run, or that has fewer than 2 strategies, throws a `RangeError`.
 */
export function pairedTimeOf(run: BenchRun, records: readonly BenchRecord[]): PairedTimeReport {
  if (run.pairedTime !== true) throw new RangeError("The run is not a paired time run.");
  if (run.strategies.length < 2) throw new RangeError("A paired time run needs 2 strategies or more.");
  const [base, ...others] = run.strategies as [string, ...string[]];
  const byInput = new Map<string, Map<string, MeasuredRecord>>();
  for (const r of records) {
    if (!isMeasured(r)) continue;
    const own = byInput.get(r.input) ?? new Map<string, MeasuredRecord>();
    own.set(r.strategy, r);
    byInput.set(r.input, own);
  }
  const inputs: PairedTimeInput[] = [];
  for (const [input, own] of byInput) {
    const b = own.get(base);
    if (b === undefined || !(b.ms > 0)) continue;
    const ms: Record<string, number> = { [base]: b.ms };
    const ratio: Record<string, number> = {};
    for (const id of others) {
      const r = own.get(id);
      if (r === undefined) continue;
      ms[id] = r.ms;
      ratio[id] = r.ms / b.ms;
    }
    inputs.push({ input, seed: b.seed, ms, ratio });
  }
  const ratios: Record<string, PairedTimeRatio> = {};
  for (const id of others) {
    const own = inputs.filter((i) => i.ratio[id] !== undefined);
    const seeds = [...new Set(own.map((i) => i.seed))].sort((a, b) => a - b);
    const folds: Record<string, number> = {};
    for (const seed of seeds) folds[String(seed)] = round3(median(own.filter((i) => i.seed === seed).map((i) => i.ratio[id]!)));
    const values = Object.values(folds);
    ratios[id] = { inputs: own.length, median: round3(median(own.map((i) => i.ratio[id]!))), folds, foldMean: round3(mean(values)), foldSD: round3(sampleSD(values)) };
  }
  const report: PairedTimeReport = {
    schema: "packing-paired-time/1",
    mode: PAIRED_TIME_MODE,
    corpus: run.corpus,
    prediction: run.prediction,
    cpu: run.env.cpu,
    runner: run.env.runner,
    repeats: run.repeats,
    warmup: run.warmup,
    base,
    strategies: [...run.strategies],
    ratios,
    inputs,
  };
  if (run.commit !== undefined) report.commit = run.commit;
  return report;
}

/** This function gives the Markdown table of a paired time report. */
export function pairedTimeMarkdown(r: PairedTimeReport): string {
  const seeds = [...new Set(Object.values(r.ratios).flatMap((x) => Object.keys(x.folds)))].sort((a, b) => Number(a) - Number(b));
  return [
    "# A paired time test of strategies",
    "",
    `- Prediction: \`${r.prediction}\``,
    `- Commit: \`${r.commit ?? "unknown"}\``,
    `- Mode: \`${r.mode}\`, one process on ${r.cpu} (${r.runner}). Each odd repeat has the strategies in the reverse order.`,
    `- Runs of each pair: ${r.warmup} warm-up, ${r.repeats} timed. The ratio of an input is the median time of the strategy over the median time of \`${r.base}\`.`,
    "",
    `| Strategy | Inputs | Median ratio | ${seeds.map((s) => `Fold ${s}`).join(" | ")} | Fold mean | Fold SD |`,
    `|---|---|---|${seeds.map(() => "---|").join("")}---|---|`,
    ...Object.entries(r.ratios).map(([id, x]) => `| \`${id}\` | ${x.inputs} | ${x.median} | ${seeds.map((s) => x.folds[s] ?? "").join(" | ")} | ${x.foldMean} | ${x.foldSD} |`),
    "",
  ].join("\n");
}
