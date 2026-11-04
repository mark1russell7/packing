// The scaling report of roadmap item k13: the growth of the time and of the memory of each entry with the box count.
// It reads the records of finished CI runs. It has no timing loop, so it is safe on a local computer.
//
//   node bench/scaling.ts --records <records.jsonl> --run <id> --out <dir>      from the artifact `bench-pack-worst-v1`
//   node bench/scaling.ts --paired <paired-time.json> --run <id> --out <dir>    from a paired run of mode `fresh`
//
// The inputs are the rungs of `ladder.count`. Only the count moves there, from 10 to 2560 boxes. Other corpora move other axes too.
// The fit is the slope of log value on log n. The interval resamples whole rungs, because the rows of one rung share a place in the
// process and a curve of the data acts on all of them. Thus a curve makes the interval wider, and the reading says "cannot tell".

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ladderRung } from "@mark1russell7/packing";
import { bootstrapClusters, leastSquares, median, type Interval } from "@mark1russell7/rigor-statistics";
import type { PairedReport } from "./paired-time.ts";
import { optionOf } from "./sample-space.ts";

/** The schema of the report. */
export const SCALING_SCHEMA = "packing-scaling/1";

/** The fewest rungs of a fit. With fewer rungs, a bootstrap of whole rungs has too few distinct draws to give an interval. */
export const MIN_RUNGS = 5;

/**
 * The smallest difference between the exponents of the two halves that counts as a curve. On the ladder, `n log n` is 0.22 above `n`.
 * Thus a smaller difference changes no growth. The curve of `n log n` itself is 0.09, so it stays one growth.
 */
export const MIN_BEND = 0.25;

/** The draws of each interval. */
export const SCALING_RUNS = 2000;

/** The growths that a fit can name. Each one has its own exponent over the counts of the fit, so a narrow range cannot separate them. */
const GROWTHS: readonly (readonly [string, (n: number) => number])[] = [
  ["1", () => 1],
  ["log n", (n) => Math.log(n)],
  ["n", (n) => n],
  ["n log n", (n) => n * Math.log(n)],
  ["n^1.5", (n) => n ** 1.5],
  ["n^2", (n) => n ** 2],
  ["n^2 log n", (n) => n ** 2 * Math.log(n)],
  ["n^3", (n) => n ** 3],
];

/** One input of one arm: its box count and its measure. */
export interface ScalingRow {
  arm: string;
  n: number;
  value: number;
}

/**
 * The reading of a fit.
 *
 * - `one`: the interval holds exactly one growth.
 * - `several`: the interval holds two or more growths, so the data cannot tell them apart.
 * - `none`: the interval holds no growth of the list.
 * - `curved`: the slope changes over the range, so no single exponent holds. The growths come from the upper half of the rungs.
 * - `too-few-rungs`: the fit has fewer rungs than `MIN_RUNGS`, so it gives no exponent.
 */
export interface ScalingReading {
  verdict: "one" | "several" | "none" | "curved" | "too-few-rungs";
  growths: string[];
}

/** The fit of one arm. Without enough rungs, `exponent`, `curve`, `r2`, `low` and `high` are `null`. */
export interface ScalingFit {
  arm: string;
  rows: number;
  /** The rows with a value that is not above 0, which a log cannot take. */
  dropped: number;
  rungs: number;
  nMin: number;
  nMax: number;
  /** The slope of log value on log n, with its interval. */
  exponent: Interval | null;
  /** The coefficient of the square of log n in a fit with both terms. An interval without 0 tells a curve. */
  curve: Interval | null;
  r2: number | null;
  /** The exponent of the lower half of the rungs. */
  low: number | null;
  /** The exponent of the upper half of the rungs, with its interval. */
  high: Interval | null;
  /** The median value of the largest rung. */
  top: number;
  reading: ScalingReading;
}

/** The report of one measure of one run. */
export interface ScalingReport {
  schema: typeof SCALING_SCHEMA;
  run: string;
  measure: string;
  fits: ScalingFit[];
}

/** This function gives the box count of an input of `ladder.count`, and `undefined` for each other input. */
export function countOf(input: string): number | undefined {
  const rung = /\/ladder\.count\.r(\d+)\//.exec(input)?.[1];
  return rung === undefined ? undefined : ladderRung({ axis: "count", rung: Number(rung), count: 0 }).count;
}

/** This function gives the time rows of the lines of a `records.jsonl`. It leaves out the skipped records. */
export function recordRows(text: string): ScalingRow[] {
  const rows: ScalingRow[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const record = JSON.parse(line) as { strategy: string; input: string; ms?: number; skipped?: string };
    const n = countOf(record.input);
    if (n !== undefined && record.ms !== undefined && record.skipped === undefined) rows.push({ arm: record.strategy, n, value: record.ms });
  }
  return rows;
}

/** This function gives the time rows of a paired report. The value is the median time of the rounds of an input. */
export function pairedTimeRows(report: PairedReport): ScalingRow[] {
  return report.inputs.flatMap((input) => {
    const n = countOf(input.id);
    return n === undefined ? [] : Object.entries(input.median).map(([arm, value]) => ({ arm, n, value }));
  });
}

/**
 * This function gives the memory rows of a paired report of mode `fresh`.
 *
 * A peak of a child holds the memory of Node.js, more than 100 MB, and a small input adds little to it.
 * Thus the value is the excess over the median peak of the smallest rung of the arm. A rung stays only
 * when its median excess is above the spread of the smallest rung. A small excess is noise, not growth.
 */
export function pairedMemoryRows(report: PairedReport): ScalingRow[] {
  const peaks = report.inputs.flatMap((input) => {
    const n = countOf(input.id);
    return n === undefined ? [] : Object.entries(input.peakRss ?? {}).map(([arm, value]) => ({ arm, n, value }));
  });
  const rows: ScalingRow[] = [];
  for (const arm of new Set(peaks.map((p) => p.arm))) {
    const own = peaks.filter((p) => p.arm === arm);
    const smallest = Math.min(...own.map((p) => p.n));
    const floor = own.filter((p) => p.n === smallest).map((p) => p.value);
    const base = median(floor);
    const noise = Math.max(...floor) - Math.min(...floor);
    for (const n of new Set(own.map((p) => p.n))) {
      const excess = own.filter((p) => p.n === n).map((p) => p.value - base);
      if (n !== smallest && median(excess) > noise) rows.push(...excess.map((value) => ({ arm, n, value })));
    }
  }
  return rows;
}

/** This function gives the least-squares fit of log value on log n. */
const logFit = (rows: readonly Pick<ScalingRow, "n" | "value">[]) =>
  leastSquares(
    rows.map((r) => [Math.log(r.n)]),
    rows.map((r) => Math.log(r.value)),
  );

/** This function gives the slope of log value on log n. A draw with one rung has no slope, so it gives NaN. */
const slope = (rows: readonly Pick<ScalingRow, "n" | "value">[]): number => logFit(rows).coefficients[1]!;

/** This function gives the coefficient of the square of log n, on log n centered at 0. A draw with fewer than 3 rungs gives NaN. */
function bend(rows: readonly Pick<ScalingRow, "n" | "value">[]): number {
  const logs = rows.map((r) => Math.log(r.n));
  const middle = logs.reduce((a, b) => a + b, 0) / logs.length;
  const x = logs.map((v) => [v - middle, (v - middle) ** 2]);
  return leastSquares(x, rows.map((r) => Math.log(r.value))).coefficients[2]!;
}

/** This function gives the exponent of each growth over the counts `ns`: the slope of the growth on the same rows as the data. */
export function growthExponents(ns: readonly number[]): { growth: string; exponent: number }[] {
  return GROWTHS.map(([growth, f]) => ({ growth, exponent: slope(ns.map((n) => ({ n, value: f(n) }))) }));
}

/** This function gives the reading of an interval over the counts `ns`. */
export function readingOf(exponent: Pick<Interval, "low" | "high">, ns: readonly number[]): ScalingReading {
  const growths = growthExponents(ns)
    .filter((g) => g.exponent >= exponent.low && g.exponent <= exponent.high)
    .map((g) => g.growth);
  return { verdict: growths.length === 0 ? "none" : growths.length === 1 ? "one" : "several", growths };
}

/** This function gives the fit of the rows of one arm. The seed of the interval comes from the arm, so the report is deterministic. */
export function fitScaling(arm: string, rows: readonly ScalingRow[], runs = SCALING_RUNS): ScalingFit {
  const usable = rows.filter((r) => r.value > 0 && Number.isFinite(r.value));
  const counts = [...new Set(usable.map((r) => r.n))].toSorted((a, b) => a - b);
  const nMax = counts.at(-1) ?? Number.NaN;
  const fit: ScalingFit = {
    arm,
    rows: usable.length,
    dropped: rows.length - usable.length,
    rungs: counts.length,
    nMin: counts[0] ?? Number.NaN,
    nMax,
    exponent: null,
    curve: null,
    r2: null,
    low: null,
    high: null,
    top: median(usable.filter((r) => r.n === nMax).map((r) => r.value)),
    reading: { verdict: "too-few-rungs", growths: [] },
  };
  if (counts.length < MIN_RUNGS) return fit;
  const half = Math.ceil(counts.length / 2);
  const lower = new Set(counts.slice(0, half));
  const upper = new Set(counts.slice(-half));
  const interval = (data: readonly ScalingRow[], statistic: (rows: readonly ScalingRow[]) => number): Interval => bootstrapClusters(data, (r) => String(r.n), statistic, { runs, seed: arm });
  const exponent = interval(usable, slope);
  const curve = interval(usable, bend);
  const top = usable.filter((r) => upper.has(r.n));
  const high = interval(top, slope);
  const low = slope(usable.filter((r) => lower.has(r.n)));
  const curved = (curve.low > 0 || curve.high < 0) && Math.abs(high.estimate - low) > MIN_BEND;
  const reading = curved ? { verdict: "curved" as const, growths: readingOf(high, top.map((r) => r.n)).growths } : readingOf(exponent, usable.map((r) => r.n));
  return { ...fit, exponent, curve, r2: logFit(usable).r2, low, high, reading };
}

/** This function gives the report of the rows, with one fit for each arm, in the order of the arms. */
export function scalingReport(run: string, measure: string, rows: readonly ScalingRow[], runs = SCALING_RUNS): ScalingReport {
  const arms = [...new Set(rows.map((r) => r.arm))].toSorted();
  return { schema: SCALING_SCHEMA, run, measure, fits: arms.map((arm) => fitScaling(arm, rows.filter((r) => r.arm === arm), runs)) };
}

/** This function gives the words of a reading. */
function readingText(reading: ScalingReading): string {
  if (reading.verdict === "curved") return `curved, upper half: ${reading.growths.length === 0 ? "between the growths" : reading.growths.map((g) => `\`${g}\``).join(", ")}`;
  if (reading.verdict === "one") return `\`${reading.growths[0]!}\``;
  if (reading.verdict === "several") return `cannot tell: ${reading.growths.map((g) => `\`${g}\``).join(", ")}`;
  return reading.verdict === "none" ? "between the growths" : "too few rungs";
}

/** This function gives the Markdown table of a report. */
export function scalingMarkdown(report: ScalingReport): string {
  const round = (v: number | null): string => (v === null ? "-" : v.toFixed(2));
  const span = (v: Interval | null): string => (v === null ? "-" : `${round(v.low)} to ${round(v.high)}`);
  const lines = [
    `### ${report.measure}, run ${report.run}`,
    "",
    "| Arm | Rows | Rungs | n | Exponent | 95 % interval | Lower half | Upper half | Largest rung | Reading |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const f of report.fits) {
    lines.push(`| \`${f.arm}\` | ${f.rows} | ${f.rungs} | ${f.nMin} to ${f.nMax} | ${round(f.exponent?.estimate ?? null)} | ${span(f.exponent)} | ${round(f.low)} | ${span(f.high)} | ${round(f.top)} | ${readingText(f.reading)} |`);
  }
  return `${lines.join("\n")}\n`;
}

/** This function gives the reports of the source that the arguments name. */
export function reportsOf(argv: readonly string[]): ScalingReport[] {
  const run = optionOf(argv, "--run");
  if (run === undefined) throw new Error("The report needs --run <id>: each number names its CI run.");
  const records = optionOf(argv, "--records");
  if (records !== undefined) return [scalingReport(run, "Time in ms, in order", recordRows(readFileSync(records, "utf8")))];
  const paired = optionOf(argv, "--paired");
  if (paired === undefined) throw new Error("The report needs --records <file> or --paired <file>.");
  const report = JSON.parse(readFileSync(paired, "utf8")) as PairedReport;
  return [scalingReport(run, "Time in ms, paired", pairedTimeRows(report)), scalingReport(run, "Peak memory over the smallest rung, in bytes", pairedMemoryRows(report))];
}

if (process.argv[1]?.endsWith("scaling.ts") === true) {
  const argv = process.argv.slice(2);
  const out = optionOf(argv, "--out") ?? ".";
  const reports = reportsOf(argv);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "scaling.json"), `${JSON.stringify(reports, null, 2)}\n`);
  writeFileSync(join(out, "scaling.md"), reports.map(scalingMarkdown).join("\n"));
  console.log(`${join(out, "scaling.md")}: ${reports.map((r) => `${r.fits.length} arms`).join(", ")}`);
}
