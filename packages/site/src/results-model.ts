// The calculations of the results page. They read only the snapshot files.

import type { CoverageMeasure, CoveragePoint, GapCell, GapSnapshot, GapStrategy, Label, MeasureVerdict, SelectLeaf, StrategySnapshot, StrategySummary } from "./data.ts";

/** This function gives the verdict of a strategy on a measure, or `undefined`. */
export const verdictOf = (s: StrategySummary, measure: string): MeasureVerdict | undefined => s.verdicts.find((v) => v.measure === measure);

/**
 * This function gives the strategies other than the baseline, by the stratified mean of a measure, best first.
 * A strategy that is not measured comes last.
 */
export function rankStrategies(snap: StrategySnapshot, measure: string): StrategySummary[] {
  const key = (s: StrategySummary): number => verdictOf(s, measure)?.stratified?.mean ?? -Infinity;
  return snap.strategies.filter((s) => s.strategy !== snap.baseline).sort((x, y) => key(y) - key(x) || x.strategy.localeCompare(y.strategy));
}

/** This function gives the hash of the results page that opens the verdict of a strategy on a corpus. */
export const verdictHash = (corpus: string, strategy: string): string => `#verdict/${encodeURIComponent(corpus)}/${encodeURIComponent(strategy)}`;

/** This function reads a hash of `verdictHash`. Another hash gives `undefined`. */
export function parseVerdictHash(hash: string): { corpus: string; strategy: string } | undefined {
  const m = /^#verdict\/([^/]+)\/([^/]+)$/.exec(hash);
  if (m === null) return undefined;
  try {
    return { corpus: decodeURIComponent(m[1]!), strategy: decodeURIComponent(m[2]!) };
  } catch {
    return undefined;
  }
}

/**
 * This function gives a snapshot with a verdict for a strategy. The snapshot has the strategy, and its baseline is
 * another strategy. The corpora of `prefer` come first, in their order. No such snapshot gives `undefined`.
 */
export function verdictSnapshot(snapshots: readonly StrategySnapshot[], strategy: string, prefer: readonly string[] = []): StrategySnapshot | undefined {
  const rank = (s: StrategySnapshot): number => {
    const i = prefer.indexOf(s.corpus);
    return i < 0 ? prefer.length : i;
  };
  return snapshots
    .filter((s) => s.baseline !== strategy && s.strategies.some((x) => x.strategy === strategy))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)[0]?.s;
}

/** This function counts the strategies of each label on a measure. */
export function labelCounts(snap: StrategySnapshot, measure: string): Record<Label, number> {
  const out: Record<Label, number> = { better: 0, worse: 0, "depends on the mix": 0, "no verdict": 0, "not measured": 0 };
  for (const s of snap.strategies) {
    if (s.strategy === snap.baseline) continue;
    const v = verdictOf(s, measure);
    if (v !== undefined) out[v.label]++;
  }
  return out;
}

/** This function gives the largest absolute value of the interval ends of a measure, for a shared scale. It is at least `floor`. */
export function scaleOf(snap: StrategySnapshot, measure: string, floor = 1e-6): number {
  let max = floor;
  for (const s of snap.strategies) {
    const v = verdictOf(s, measure)?.stratified;
    if (v !== undefined) max = Math.max(max, Math.abs(v.lo), Math.abs(v.hi), Math.abs(v.mean));
  }
  return max;
}

/** This function gives the position of a value on a diverging scale from `-max` to `max`, as a percent from the left. */
export const divergingAt = (value: number, max: number): number => 50 + (Math.max(-max, Math.min(max, value)) / max) * 50;

/** The ends of the log scale of the time ratios */
export const RATIO_MIN = 0.03;
export const RATIO_MAX = 3;

/** This function gives the position of a time ratio on the log scale, as a percent from the left. The ratio 1 is at 76%. */
export function ratioAt(ratio: number): number {
  const lo = Math.log(RATIO_MIN);
  const hi = Math.log(RATIO_MAX);
  const r = Math.max(RATIO_MIN, Math.min(RATIO_MAX, ratio));
  return ((Math.log(r) - lo) / (hi - lo)) * 100;
}

/** This function gives the text of one step of the path of a leaf of the select table. */
export function stepText(step: SelectLeaf["path"][number]): string {
  if (step.feature === "fixed") return step.yes ? "Fixed size" : "Free size";
  if (step.feature === "rect") return step.yes ? "A rectangle" : "Another shape";
  const m = /^(\w+) below (.+)$/.exec(step.test);
  if (m === null) return `${step.test}: ${step.yes ? "yes" : "no"}`;
  const [, feature, value] = m;
  const name = feature === "count" ? "Boxes" : feature === "spread" ? "Size spread" : feature!;
  return step.yes ? `${name} below ${value}` : `${name} ${value} or more`;
}

/**
 * This function tells if the pick of a leaf holds on a set of counts. The pick `maxrects-bl` holds when it wins on more
 * than half of the inputs. The pick `rows` holds when `maxrects-bl` wins on half or fewer.
 */
export function pickHolds(leaf: SelectLeaf, counts: { wins: number; of: number }): boolean {
  if (counts.of === 0) return true;
  const share = counts.wins / counts.of;
  return leaf.member === "rows" ? share <= 0.5 : share > 0.5;
}

// ---- The distance to the best ----

/** This function gives the strategies of a gap snapshot by the median over all inputs, best first. A tie goes to the lower `q3`, then to the name. */
export function gapRanking(snap: GapSnapshot): GapStrategy[] {
  return [...snap.strategies].sort((x, y) => x.all.median - y.all.median || x.all.q3 - y.all.q3 || x.strategy.localeCompare(y.strategy));
}

/** This function gives the end of a scale from 0 that holds a value: 1, 2, 2.5 or 5 times a power of 10. It is at least `floor`. */
export function niceCeil(value: number, floor = 0.01): number {
  const v = Math.max(value, floor);
  const p = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5]) if (v <= step * p * (1 + 1e-9)) return step * p;
  return 10 * p;
}

/** This function gives the end of the shared scale of the chart of a gap snapshot: the largest `q3` over all inputs, made round. */
export const gapScale = (snap: GapSnapshot): number => niceCeil(Math.max(0, ...snap.strategies.map((s) => s.all.q3)));

/** This function gives the position of a gap on a scale from 0 to `max`, as a percent from the left. */
export const gapAt = (value: number, max: number): number => (Math.max(0, Math.min(max, value)) / max) * 100;

/** This function gives the text of a gap with 3 decimals. The value 0 gives `0`. */
export const gapText = (value: number): string => (value === 0 ? "0" : value.toFixed(3));

/** One row of the table of the cells of a gap snapshot */
export interface GapTableRow {
  cell: string;
  inputs: number;
  /** The cell of each strategy, in the order of the columns. A strategy without a value in the cell gives `undefined`. */
  values: (GapCell | undefined)[];
  /** The columns with the lowest median of the row. When all columns have the same median, the list is empty. */
  best: number[];
  /** The kind of bound of most records of the row, or `undefined` */
  kind: string | undefined;
}

/** This function gives the table of the cells of a gap snapshot, with one column for each strategy of `columns`. */
export function gapTable(snap: GapSnapshot, columns: readonly GapStrategy[]): GapTableRow[] {
  return snap.cells.map(({ cell, inputs }) => {
    const values = columns.map((s) => {
      const c = s.cells.find((x) => x.cell === cell);
      return c === undefined || c.n === 0 ? undefined : c;
    });
    const medians = values.flatMap((v) => (v === undefined ? [] : [v.median]));
    const low = Math.min(...medians);
    const best = medians.every((m) => m === low) ? [] : values.flatMap((v, i) => (v !== undefined && v.median === low ? [i] : []));
    const kinds = new Map<string, number>();
    for (const v of values) for (const [k, n] of Object.entries(v?.kinds ?? {})) kinds.set(k, (kinds.get(k) ?? 0) + n);
    const kind = [...kinds].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    return { cell, inputs, values, best, kind };
  });
}

/** This function gives the share of the scale for the shade of a cell of the table, from 0 to 1. */
export const gapShade = (value: number, max: number): number => Math.max(0, Math.min(1, value / max));

// ---- The space coverage of k105 ----

/** This function gives a share as a percent with no decimals, for example `29%`. */
export const percentText = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * This function gives the text of an error of the coverage. A measure on a log scale gives a factor, for example `×1.21`.
 * Another measure gives the value with 3 decimals.
 */
export const errorText = (m: Pick<CoverageMeasure, "scale">, error: number): string => (m.scale === "log" ? `×${(10 ** error).toFixed(2)}` : error.toFixed(3));

/** This function gives the width of the bar of an error of the model, as a percent of the baseline error. It is from 0 to 100. */
export const errorWidth = (model: number, baseline: number): number => (baseline <= 0 ? 0 : Math.max(0, Math.min(100, (model / baseline) * 100)));

/** One point of a series of the trend chart, in the units of the box of the chart */
export interface TrendPoint {
  x: number;
  y: number;
  date: string;
  share: number;
}

/** The geometry of the trend chart: a series for each measure and the ticks of the dates */
export interface TrendChart {
  series: { id: string; points: TrendPoint[] }[];
  ticks: { x: number; date: string }[];
}

/** The day count of a date `YYYY-MM-DD` since 1970-01-01 */
const dayOf = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * This function gives the geometry of the trend chart in a box of `width` by `height`, with a margin `pad` on each side.
 * The x axis is the date, and the y axis is the share from 0 at the bottom to 1 at the top. One date goes to the middle.
 */
export function trendChart(trend: readonly CoveragePoint[], measures: readonly string[], width: number, height: number, pad: number): TrendChart {
  const days = trend.map((p) => dayOf(p.date));
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  const x = (date: string): number => (hi === lo ? width / 2 : pad + ((dayOf(date) - lo) / (hi - lo)) * (width - 2 * pad));
  const y = (share: number): number => height - pad - Math.max(0, Math.min(1, share)) * (height - 2 * pad);
  const series = measures.map((id) => ({
    id,
    points: trend.flatMap((p) => (p.shares[id] === undefined ? [] : [{ x: x(p.date), y: y(p.shares[id]), date: p.date, share: p.shares[id] }])),
  }));
  const dates = [...new Set(trend.map((p) => p.date))];
  return { series, ticks: dates.map((date) => ({ x: x(date), date })) };
}