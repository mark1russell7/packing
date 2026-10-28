// The calculations of the results page. They read only the snapshot files.

import type { Label, MeasureVerdict, SelectLeaf, StrategySnapshot, StrategySummary } from "./data.ts";

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
