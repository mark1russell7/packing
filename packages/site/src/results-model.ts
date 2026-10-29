// The calculations of the results page. They read only the snapshot files.

import type { CoverageEval, CoverageMeasure, CoveragePart, CoveragePoint, CoveragePriorBasis, CoveragePriorCount, CoverageSampled, CoverageSnapshot, CoverageStratum, CoverageStratumPairs, GapCell, GapSnapshot, GapStrategy, Label, MeasureVerdict, SelectLeaf, StrategySnapshot, StrategySummary } from "./data.ts";
import { esc } from "./format.ts";

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

/** The labels of the two numbers of each measure of the coverage */
export const COVERAGE_SCOPES = { grid: "bench grid", space: "whole space (sampled)" } as const;

/** The label of the mean over the strata of k115 */
export const COVERAGE_STRATA_SCOPE = "equal weight over strata";

/** The label of the share of all the pairs of a stratified sample. It is not a uniform share. */
export const COVERAGE_POOLED_SCOPE = "pooled over strata";

/** The numbers of the whole space of one measure: the last uniform sample, and the pooled share of a stratified sample */
export interface CoverageSpace {
  /** The result of the last sample with a uniform draw, or `undefined` without one */
  uniform?: CoverageSampled;
  /** The result of all the pairs of the latest sample when its draw is stratified, or `undefined` */
  pooled?: CoverageSampled;
}

/**
 * This function gives the numbers of the whole space of a measure. The `uniform` section of the snapshot gives the uniform result.
 * A snapshot without it gives `sampled` of the measure, but only for a uniform draw. A stratified draw gives the pooled share.
 */
export function spaceOf(latest: Pick<CoverageSnapshot["latest"], "sampled" | "uniform">, m: Pick<CoverageMeasure, "id" | "sampled">): CoverageSpace {
  const stratified = latest.sampled?.draw === "stratified";
  const uniform = latest.uniform === undefined ? (stratified ? undefined : m.sampled) : latest.uniform.measures[m.id];
  return { ...(uniform === undefined ? {} : { uniform }), ...(stratified && m.sampled !== undefined ? { pooled: m.sampled } : {}) };
}

/**
 * This function gives the name of a stratum `<family>:<size>`. The size 1 gives only the family.
 * The size `cell` gives "members from the cell", and another size gives its count of members.
 */
export function stratumLabel(id: string): string {
  const at = id.lastIndexOf(":");
  if (at < 0) return id;
  const family = id.slice(0, at);
  const size = id.slice(at + 1);
  if (size === "1") return family;
  if (size === "cell") return `${family}, members from the cell`;
  return `${family}, ${size} members`;
}

/** The text of the mean over the strata of one measure: the share, its interval and the count of the strata */
export interface StrataText {
  share: string;
  interval: string;
  strata: string;
}

/** This function gives the text of the mean over the strata of a measure, or `null` when the measure has no strata. */
export function strataText(m: Pick<CoverageMeasure, "strata">): StrataText | null {
  const s = m.strata;
  if (s === undefined) return null;
  return { share: percentText(s.share), interval: `${percentText(s.low)} to ${percentText(s.high)}`, strata: `${s.strata} ${s.strata === 1 ? "stratum" : "strata"}` };
}

/** This function gives a whole number in decimal text with a comma for each 3 digits, for example `1,234`. */
export const countText = (n: string): string => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * This function gives the HTML of the rows of the strata chart of one measure. Each row shows the share of a stratum and its 95% interval.
 * The line in each bar is the mean over the strata. A stratum without pairs shows "no pairs" and no share.
 * With the strata of a stratified sample, a stratum without pairs also shows its count of configs.
 */
export function strataRows(m: Pick<CoverageMeasure, "strata">, facts: readonly CoverageStratumPairs[] = []): string {
  const s = m.strata;
  if (s === undefined) return "";
  const pct = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10;
  return s.rows
    .map((x: CoverageStratum) => {
      const name = stratumLabel(x.stratum);
      const fact = facts.find((f) => f.id === x.stratum);
      const configs = fact?.configs === undefined ? "" : `${countText(fact.configs)} ${fact.configs === "1" ? "config" : "configs"}`;
      const unrun = fact !== undefined && fact.pairs === 0 && (fact.missed ?? 0) > 0;
      const share = x.share ?? 0;
      const low = x.low ?? 0;
      const high = x.high ?? 0;
      const value = x.n === 0 ? `no pairs${configs === "" ? "" : ` <small>(${configs})</small>`}` : `${percentText(share)} <small>(${x.hits} of ${x.n})</small>`;
      const title =
        x.n === 0
          ? `${name}: no pairs${configs === "" ? "" : `, ${configs}`}.${unrun ? " No sampled input accepts this stratum." : ""} It is not in the mean.`
          : `${name}: ${x.hits} of ${x.n} pairs, 95% interval ${percentText(low)} to ${percentText(high)}`;
      const bar =
        x.n === 0
          ? `<span class="smean" style="left:${pct(s.share)}%"></span>`
          : `<span class="srange" style="left:${pct(low)}%;width:${pct(high - low)}%"></span><span class="smean" style="left:${pct(s.share)}%"></span><span class="sdot" style="left:${pct(share)}%"></span>`;
      return `<li class="irow srow${x.n === 0 ? " empty" : ""}" title="${esc(title)}">
        <span class="iname"><code>${esc(name)}</code></span>
        <span class="ibar sbar" aria-hidden="true">${bar}</span>
        <span class="ival">${value}</span>
      </li>`;
    })
    .join("");
}

/** The text of the number of the whole space of one measure: the share, its interval and the pairs, or a note */
export interface SampledText {
  share: string;
  /** The Wilson 95% interval, for example `3% to 16%`, or `null` without a test */
  interval: string | null;
  /** The hits over the pairs, for example `4 of 60 pairs`, or `null` without a test */
  pairs: string | null;
}

/** This function gives the text of the number of the whole space of a measure. A measure without the held-out test gives `not measured yet`. */
export function sampledText(m: Pick<CoverageMeasure, "sampled">): SampledText {
  const s = m.sampled;
  if (s === undefined) return { share: "not measured yet", interval: null, pairs: null };
  return { share: percentText(s.share), interval: `${percentText(s.low)} to ${percentText(s.high)}`, pairs: `${s.hits} of ${s.n} pairs` };
}

/**
 * This function gives the HTML of the tile of one measure of the coverage. The tile shows the share of the bench grid.
 * Under it, the tile shows the uniform share of the whole space with its interval, or `not measured yet`.
 * The optional `space` gives the uniform share and the pooled share. Without it, the tile uses `sampled` of the measure.
 */
export function coverageTile(m: CoverageMeasure, label: string, space: CoverageSpace = m.sampled === undefined ? {} : { uniform: m.sampled }): string {
  const s = sampledText(space.uniform === undefined ? {} : { sampled: space.uniform });
  const low = space.uniform?.low ?? 0;
  const high = space.uniform?.high ?? 0;
  const spaceHtml =
    s.interval === null
      ? `<b class="none">${esc(s.share)}</b>`
      : `<b>${esc(s.share)} <small class="alt">95% interval ${esc(s.interval)}, ${esc(s.pairs ?? "")}</small></b>
        <span class="cmeter space" aria-hidden="true"><i style="width:${low * 100}%"></i><i class="range" style="width:${(high - low) * 100}%"></i></span>`;
  const t = strataText(m);
  const strata =
    t === null
      ? ""
      : `
        <small class="cscope">${COVERAGE_STRATA_SCOPE}</small>
        <b>${esc(t.share)} <small class="alt">95% interval ${esc(t.interval)}, ${esc(t.strata)}</small></b>
        <span class="cmeter space" aria-hidden="true"><i style="width:${m.strata!.low * 100}%"></i><i class="range" style="width:${(m.strata!.high - m.strata!.low) * 100}%"></i></span>`;
  const prior = [space.uniform, space.pooled].flatMap((x) => {
    const text = priorText(x);
    return text === null ? [] : [`
        <small class="alt prior">${esc(text)}</small>`];
  });
  const p = space.pooled;
  const pooled = p === undefined ? "" : `
        <small class="alt">${COVERAGE_POOLED_SCOPE} ${percentText(p.share)}, ${p.hits} of ${p.n} pairs</small>`;
  return `<div class="tile cover">
        <span>${esc(label)}</span>
        <small class="cscope">${COVERAGE_SCOPES.grid}</small>
        <b>${percentText(m.share)}${m.byInput === undefined ? "" : ` <small class="alt">by input ${percentText(m.byInput.share)}</small>`}</b>
        <span class="cmeter" aria-hidden="true"><i style="width:${m.share * 100}%"></i></span>
        <small>${m.cells.covered} of ${m.cells.space} cells within ${esc(errorText(m, m.tolerance))}</small>
        <small class="cscope">${COVERAGE_SCOPES.space}</small>
        ${spaceHtml}${strata}${pooled}${prior.join("")}
      </div>`;
}

// ---- The active sample of k116 ----

/** The label of the share with the family prior of the corpus (k116) */
export const COVERAGE_PRIOR_SCOPE = "family prior";

/**
 * This function gives the text of the share of a sample with the family prior, or `null` without it.
 * The text tells the pairs with the weight 0, because their families are not in the corpus.
 */
export function priorText(s: Pick<CoverageSampled, "prior"> | undefined): string | null {
  const p = s?.prior;
  if (p === undefined) return null;
  const zero = p.zero === 0 ? "" : `, ${p.zero} ${p.zero === 1 ? "pair" : "pairs"} of other families with the weight 0`;
  if (p.share === null) return `${COVERAGE_PRIOR_SCOPE}: no pair of a family of the corpus${zero}`;
  const range = p.low === null || p.high === null ? "" : ` (95% interval ${percentText(p.low)} to ${percentText(p.high)})`;
  // k119: a snapshot with the kind of the prior also shows the effective count of the pairs.
  const nEff = p.kind === undefined ? "" : `, ${p.nEff} effective pairs`;
  return `${COVERAGE_PRIOR_SCOPE} ${percentText(p.share)}${range}${nEff}, ${p.weighted} weighted pairs${zero}`;
}

/**
 * This function gives the text of the basis of the family prior (k119), or `null` without it.
 * The text tells the corpora, the weight of each family, and the families without a weight.
 */
export function priorBasisText(b: CoveragePriorBasis | undefined): string | null {
  if (b === undefined) return null;
  const from = b.kind === "union" ? `the ${b.inputs} distinct inputs of the ${b.corpora.length} committed corpora` : `the ${b.inputs} inputs of the corpus ${b.corpora.join(", ")}`;
  const weights = b.families.map((f) => `${f.family} ${percentText(f.weight)}`).join(", ");
  const absent = b.absent.length === 0 ? "" : ` The sampler families ${b.absent.join(", ")} have no inputs, so their weight is 0.`;
  const unmapped = b.unmapped.length === 0 ? "" : ` The sampler does not draw ${b.unmapped.map((f) => `${f.family} (${f.inputs} inputs)`).join(", ")}, so these inputs give no weight.`;
  return `The weights come from ${from}: ${weights}.${absent}${unmapped}`;
}

/** The label of the forced-overflow split of k116: the pairs where half of the item area or more cannot go in the container */
export const FORCED_LABEL = "forced overflow of half the item area or more";

/** This function gives the text of the forced-overflow split of a measure, or `null` when the measure does not have it. */
export function forcedText(m: Pick<CoverageMeasure, "sampled">): { heavy: string; rest: string } | null {
  const f = m.sampled?.forced;
  if (f === undefined) return null;
  const part = (p: CoveragePart): string => (p.share === null ? "no pairs" : `${percentText(p.share)} (${p.hits} of ${p.n})`);
  return { heavy: part(f.heavy), rest: part(f.rest) };
}

/**
 * This function gives the HTML of the table of the rounds of the active sample of one measure, or an empty text without rounds.
 * Each row shows the hits of the new pairs of a round, and the share of the evaluation sample after the round.
 * The first row shows the evaluation sample with the grid only. The table has 3 narrow columns, so it fits a phone.
 */
export function activeRows(m: Pick<CoverageMeasure, "active">): string {
  const a = m.active;
  if (a === undefined) return "";
  const bar = (share: number): string => `<span class="abar" aria-hidden="true"><i style="width:${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%"></i></span>`;
  const priorOf = (v: number | null | undefined, c?: CoveragePriorCount): string =>
    v === undefined ? "" : ` <small>${COVERAGE_PRIOR_SCOPE} ${v === null ? "-" : percentText(v)}${c === undefined ? "" : ` (${c.nEff} effective pairs)`}</small>`;
  const evalCell = (e: CoverageEval | null): string => (e === null ? `<td class="num">-</td>` : `<td class="num">${percentText(e.share)}${priorOf(e.prior, e.priorCount)}${bar(e.share)}</td>`);
  const start = `<tr><th scope="row">Grid only</th><td class="num">-</td>${evalCell(a.start)}</tr>`;
  const rows = a.rounds
    .map(
      (r) =>
        `<tr title="${esc(`Round ${r.round}: ${r.hits} of ${r.n} new pairs within the tolerance, 95% interval ${percentText(r.low)} to ${percentText(r.high)}`)}"><th scope="row">Round ${r.round}</th><td class="num">${percentText(r.share)} <small>(${r.hits} of ${r.n})</small></td>${evalCell(r.after)}</tr>`,
    )
    .join("");
  return `<thead><tr><th scope="col">Training</th><th scope="col" class="num">New pairs hit</th><th scope="col" class="num">Sample after</th></tr></thead><tbody>${start}${rows}</tbody>`;
}

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