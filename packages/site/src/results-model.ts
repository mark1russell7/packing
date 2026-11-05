// The calculations of the results page. They read only the snapshot files.

import type { SnapshotBudget, StrategyFinished, CoverageEntries, CoverageEval, CoverageMeasure, CoveragePart, CoveragePoint, CoveragePriorBasis, CoveragePriorCount, CoverageSampled, CoverageSnapshot, CoverageStratum, CoverageStratumPairs, GapCell, GapSnapshot, GapStrategy, Label, MeasureVerdict, SelectLeaf, StrategySnapshot, StrategySummary } from "./data.ts";
import { esc } from "./format.ts";
import { oldGapNote } from "./gap-definition.ts";
import { segmentOf, trendSegments } from "./kpi.ts";

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

/** The count of the items above which a standalone strategy refuses an input. `sync.test.ts` pins it to `STANDALONE_MAX_ITEMS`. */
export const REFUSE_ITEMS = 256;

/** The strategies that finished the same inputs, so that a page can compare them. */
export interface RankSection {
  /** The inputs of the section. A snapshot from before the wall budget does not have them. */
  finished?: StrategyFinished;
  strategies: StrategySummary[];
}

/**
 * This function gives the sections of the ranking: one for each set of finished inputs, the most inputs first.
 * Each section is in the order of `rankStrategies`. A page compares strategies only inside one section.
 */
export function rankSections(snap: StrategySnapshot, measure: string): RankSection[] {
  const sections = new Map<string, RankSection>();
  for (const s of rankStrategies(snap, measure)) {
    const key = s.finished?.set ?? "";
    const section = sections.get(key);
    if (section !== undefined) section.strategies.push(s);
    else sections.set(key, { ...(s.finished === undefined ? {} : { finished: s.finished }), strategies: [s] });
  }
  return [...sections.values()].sort((x, y) => (y.finished?.inputs ?? 0) - (x.finished?.inputs ?? 0) || (x.finished?.set ?? "").localeCompare(y.finished?.set ?? ""));
}

/** This function gives the heading of a section of the ranking. */
export function sectionText(finished: StrategyFinished, inputs: number): string {
  if (finished.inputs === 0) return "No input finished, so these strategies have no comparison.";
  const size = finished.largest === null ? "" : `, up to ${finished.largest} items`;
  return `Compared on the same ${finished.inputs} of ${inputs} inputs${size}. Do not compare these strategies with another group.`;
}

/** This function gives the meaning of a reason of a skipped record, or `undefined` for a reason without a fixed meaning. */
export function reasonMeaning(reason: string): string | undefined {
  if (reason === "over budget") return "Stopped at the budget. The time is a lower limit, so no mean reads it.";
  if (reason === "not run: over budget at this size") return "Not started: 2 pairs of this strategy went over budget at this size or below.";
  if (reason === "not run: job budget") return "Not started: the job reached its time limit.";
  if (reason === "unsupported containerSize: refused") return `Refused: the strategy takes at most ${REFUSE_ITEMS} items. This is a real limit of the strategy and not a budget.`;
  return undefined;
}

/** This function gives the different meanings of the budget and refusal reasons of a section of the ranking. */
export function sectionReasons(section: RankSection): string[] {
  return [...new Set(section.strategies.flatMap((s) => (s.reasons ?? []).flatMap((r) => reasonMeaning(r.reason) ?? [])))];
}

/** This function gives the text of the rules of a wall budget. */
export function budgetText(b: SnapshotBudget): string {
  const seconds = (ms: number): string => `${ms / 1000} s`;
  const parts = [
    `Each pair of a strategy and an input has a budget of ${seconds(b.smallPairMs)} up to ${b.smallItems} items, and ${seconds(b.pairMs)} above.`,
    `After ${b.overruns} pairs over budget at one size, the strategy does not start at that size or above.`,
    `A first pack over ${seconds(b.slowPackMs)} gives the pair 1 timed run.`,
  ];
  parts.push(`Each CI job also packs a control, the strategy ${b.control.entry}, ${b.control.packs} times on each of its largest inputs.`);
  if (b.factor !== undefined) {
    const between = b.factor.hi / b.factor.lo;
    parts.push(`The load factors of the jobs are ${b.factor.lo} to ${b.factor.hi}. No verdict reads them.`);
    if (b.factor.widest > between) parts.push(`The control times inside one job spread by ${b.factor.widest.toFixed(2)} times, over the ${between.toFixed(2)} times between jobs. So a factor does not correct this load, and a time near a budget is not exact.`);
  }
  if (b.noFactor !== undefined) parts.push(`${b.noFactor} jobs have too few control times for a factor.`);
  return parts.join(" ");
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
export function priorText(s: Pick<CoverageSampled, "prior" | "priorBeside"> | undefined): string | null {
  const p = s?.prior;
  if (p === undefined) return null;
  const zero = p.zero === 0 ? "" : `, ${p.zero} ${p.zero === 1 ? "pair" : "pairs"} of other families with the weight 0`;
  if (p.share === null) return `${COVERAGE_PRIOR_SCOPE}: no pair of a family of the corpus${zero}`;
  const range = p.low === null || p.high === null ? "" : ` (95% interval ${percentText(p.low)} to ${percentText(p.high)})`;
  // k119: a snapshot with the kind of the prior also shows the effective count of the pairs.
  const nEff = p.kind === undefined ? "" : `, ${p.nEff} effective pairs`;
  // k122: a snapshot with the prior beside the headline shows it with its effective count.
  const b = s?.priorBeside;
  const beside = b === undefined || b.share === null ? "" : `. ${b.kind}: ${percentText(b.share)}, ${b.nEff} effective pairs`;
  return `${COVERAGE_PRIOR_SCOPE} ${percentText(p.share)}${range}${nEff}, ${p.weighted} weighted pairs${zero}${beside}`;
}

/**
 * This function gives the text of the basis of the family prior (k119), or `null` without it.
 * The text tells the corpora, the weight of each family, and the families without a weight.
 */
export function priorBasisText(b: CoveragePriorBasis | undefined): string | null {
  if (b === undefined) return null;
  const committed = `the ${b.inputs} distinct inputs of the ${b.corpora.length} committed corpora`;
  const froms: Record<CoveragePriorBasis["kind"], string> = {
    union: committed,
    corpus: `the ${b.inputs} inputs of the corpus ${b.corpora.join(", ")}`,
    tempered: `${committed}, each count to the power ${b.power}`,
    "family-flat": `the same weight for each sampler family, not the ${b.inputs} inputs of the corpora`,
  };
  const from = froms[b.kind];
  const weights = b.families.map((f) => `${f.family} ${percentText(f.weight)}`).join(", ");
  const absent = b.absent.length === 0 ? "" : ` The sampler families ${b.absent.join(", ")} have no inputs, so their weight is 0.`;
  const unmapped = b.unmapped.length === 0 ? "" : ` The sampler does not draw ${b.unmapped.map((f) => `${f.family} (${f.inputs} inputs)`).join(", ")}, so these inputs give no weight.`;
  const strata = (b.strata ?? []).length === 0 ? "" : ` ${b.strata!.map((f) => f.family).join(", ")} is a stratum of its own.`;
  return `The weights come from ${from}: ${weights}.${absent}${unmapped}${strata}`;
}

/**
 * This function gives the sentence of the determinism of a sample (k121): the pairs that are not deterministic, without and with a clock limit.
 * A snapshot from before k121 does not have the counts, so the sentence is empty.
 */
export function determinismText(sample: CoverageSnapshot["latest"]["sampled"]): string {
  const all = sample?.nondeterministic;
  if (sample === undefined || all === undefined || all === null) return "";
  const clock = sample.nondeterministicClock;
  if (clock === undefined || clock === null) return ` In the sample, ${all} pairs are not deterministic.`;
  return (
    ` Not deterministic in the sample: ${all - clock} pairs without a clock limit, and ${clock} pairs with a clock limit.` +
    " A pair with a clock limit depends on the speed of the computer. Thus only the pairs without a clock limit fail the determinism gate."
  );
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

/** The geometry of the trend chart: a series for each measure and the ticks of the dates. A line joins only the points of one segment. */
export interface TrendChart {
  series: { id: string; points: (TrendPoint & { current: boolean })[]; lines: { points: TrendPoint[]; current: boolean }[] }[];
  ticks: { x: number; date: string }[];
}

/** The day count of a date `YYYY-MM-DD` since 1970-01-01 */
const dayOf = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** This function gives the count of a point that continues the line of an earlier list, for example ` (54 common of 55)`. */
const commonText = (p: CoveragePoint): string => (p.commonOf === undefined ? "" : ` (${p.strategies?.length ?? 0} common of ${p.commonOf})`);

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
  const last = trend.at(-1);
  const current = (p: CoveragePoint): boolean => last !== undefined && segmentOf(p) === segmentOf(last);
  const at = (p: CoveragePoint, id: string): TrendPoint[] => (p.shares[id] === undefined ? [] : [{ x: x(p.date), y: y(p.shares[id]), date: p.date + commonText(p), share: p.shares[id] }]);
  const series = measures.map((id) => ({
    id,
    points: [...trend, ...trendSegments(trend).flat().filter((p) => p.commonOf !== undefined)].flatMap((p) => at(p, id).map((point) => ({ ...point, current: current(p) }))),
    lines: trendSegments(trend).map((segment) => ({ points: segment.flatMap((p) => at(p, id)), current: current(segment[0]!) })),
  }));
  const dates = [...new Set(trend.map((p) => p.date))];
  return { series, ticks: dates.map((date) => ({ x: x(date), date })) };
}

/** This function gives the words of a segment of the trend: its corpus, its count of strategies, its method and its dates. */
const segmentText = (segment: readonly CoveragePoint[]): string => {
  const first = segment[0]!;
  const count = first.strategies === undefined ? "a list that the point does not record" : `${first.strategies.length} strategies`;
  const method = first.method === undefined ? "" : ` (${esc(first.method)})`;
  const counts = [...new Set(segment.flatMap((p) => (p.records === undefined ? [] : [p.records])))];
  const pairs = counts.length < 2 ? "" : ` The measured records differ: ${counts.join(", ")}. A slow pair that loses its row can move a share, so read the step with its common pairs.`;
  return `<li><code>${esc(first.corpus)}</code> on ${count}${method}: ${segment.map((p) => esc(p.date + commonText(p))).join(", ")}.${pairs}</li>`;
};

/** This function gives the words of the reasons of an entry with no measured record. A censored reason gives its lower bound on the time. */
const reasonsText = (reasons: readonly { because: string; records: number; msAtLeast?: number }[]): string =>
  reasons
    .map((r) => {
      if (r.records === 0) return r.because;
      return r.msAtLeast === undefined ? `${r.because} (${r.records} records)` : `${r.because} (${r.records} records, each at least ${r.msAtLeast / 1000} s)`;
    })
    .join(", ");

/** This function gives the HTML of the entries that lost their row. Dropping a hard entry can raise a share, so a lost entry ends a line and does not join it. */
const lostNote = (trend: readonly CoveragePoint[]): string => {
  const rows = trend.flatMap((p) => (p.lost ?? []).map((l) => `<li>${esc(p.date)}, <code>${esc(p.corpus)}</code>: <code>${esc(l.entry)}</code>: ${esc(reasonsText(l.reasons))}</li>`));
  return rows.length === 0 ? "" : `<p class="hint"><b>An entry lost its row, so the line of its list ends.</b> A lost entry does not join a line, because dropping a hard entry can raise a share.</p><ul class="hint">${rows.join("")}</ul>`;
};

/** This function gives the words of two shares in the order of the step. */
const shareText = ([a, b]: readonly [number, number]): string => `${a.toFixed(3)} to ${b.toFixed(3)}`;

/** The read of one measure over one step of the trend. */
export interface StepRead {
  readonly measure: string;
  readonly plain: readonly [number, number];
  readonly common: readonly [number, number];
  /** This value is true only when the plain share and the share over the common pairs both gain. */
  readonly gain: boolean;
}

/**
 * This function gives the read of each measure of a step, with no row for a measure that has a missing share.
 * The later plain share is the share over the list of the earlier point, when the later point has it, so a new entry does not change the read.
 */
export function stepReads(earlier: CoveragePoint, later: CoveragePoint): StepRead[] {
  const step = later.step;
  if (step === undefined || "noRead" in step) return [];
  const list = earlier.strategies?.join(",");
  const plain = later.over?.find((o) => o.strategies.join(",") === list)?.shares ?? later.shares;
  return Object.keys(step.later).flatMap((measure) => {
    const a = earlier.shares[measure];
    const b = plain[measure];
    const c = step.earlier[measure];
    const d = step.later[measure];
    if (a === undefined || b === undefined || c === undefined || d === undefined) return [];
    return [{ measure, plain: [a, b] as const, common: [c, d] as const, gain: b > a && d > c }];
  });
}

/** This function gives the HTML of the steps of the trend. Each step shows its count and both figures of each measure. */
const stepNote = (trend: readonly CoveragePoint[]): string => {
  const rows = trend.flatMap((later) => {
    const step = later.step;
    if (step === undefined) return [];
    const head = `${esc(later.date)}, <code>${esc(later.corpus)}</code>`;
    if ("noRead" in step) return [`<li>${head}: no read: ${esc(step.noRead)}</li>`];
    const earlier = trend.find((p) => p.run === step.from);
    const reads = earlier === undefined ? [] : stepReads(earlier, later);
    const text = reads.map((r) => `<code>${esc(r.measure)}</code>: plain ${shareText(r.plain)}, common pairs ${shareText(r.common)}${r.gain ? ": a gain" : ""}`).join(". ");
    return [`<li>${head}: ${step.common} common of ${step.of} pairs. ${text}.</li>`];
  });
  return rows.length === 0
    ? ""
    : `<p class="hint"><b>Each step reads the pairs measured in both points.</b> A dropped hard pair can raise a plain share, but it cannot raise the share over the common pairs. A step is a gain only when both figures gain.</p><ul class="hint">${rows.join("")}</ul>`;
};

/** This function gives the HTML of the note of the trend. The note tells why the lines are separate, which entry lost its row, and if a point has an older `pack.gap`. */
export function trendNote(trend: readonly CoveragePoint[]): string {
  const older = oldGapNote(trend.map((p) => p.run));
  return `<p class="hint">A line joins only points with one corpus and one method. A later point with a new strategy continues the line over the strategies common to both points, and the new strategy starts its own line. The trend has these lines:</p><ul class="hint">${trendSegments(trend).map(segmentText).join("")}</ul>${stepNote(trend)}${lostNote(trend)}${older === "" ? "" : `<p class="hint">${older}</p>`}`;
}

/** This function gives the HTML of the count of the entries with a measured record, with the reason of each other entry. */
export function entriesNote(entries: CoverageEntries | undefined): string {
  if (entries === undefined) return "";
  const groups = new Map<string, string[]>();
  for (const other of entries.others) {
    const text = reasonsText(other.reasons);
    groups.set(text, [...(groups.get(text) ?? []), other.entry]);
  }
  const rows = [...groups].map(([text, ids]) => `<li>${ids.map((id) => `<code>${esc(id)}</code>`).join(", ")}: ${esc(text)}</li>`).join("");
  return `<p class="hint"><b>${entries.measured} of ${entries.planned} entries</b> of the bench have measured records in this run. The shares read only these entries.</p>${rows === "" ? "" : `<ul class="hint">${rows}</ul>`}`;
}
