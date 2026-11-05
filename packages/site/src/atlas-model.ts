// The atlas of the solved regions of roadmap item k109 on the results page: the state of each region, the tiles and the table.
// The file `data/solved-rule.json` holds the rule as data. `docs/BENCH.md` ("The solved regions") tells it. This module holds no state.

import { wilson } from "@mark1russell7/rigor-statistics";
import type { GapCell, GapSnapshot } from "./data.ts";
import { esc } from "./format.ts";
import { onOldMeasure } from "./gap-definition.ts";

/** The schema of the rule file */
export const SOLVED_RULE_SCHEMA = "packing-solved-rule/1";

/** The margin of one measure. A key of `cells` is the corpus and the cell, with a slash between them. */
export interface MeasureMargin {
  /** The highest value at the margin of 0, with the numeric tolerance. */
  readonly limit: number;
  readonly because: string;
  /** The measured slack of each cell, with its run. */
  readonly cells: Readonly<Record<string, { readonly limit: number; readonly run: number }>>;
}

/** One read of the search for hard inputs on one region. An empty `found` shows that the search found nothing past the margin. */
export interface SearchRead {
  readonly corpus: string;
  readonly cell: string;
  /** The strategy that the search attacked. A read of another strategy does not count. */
  readonly strategy: string;
  readonly run: number;
  readonly date: string;
  readonly found: readonly { readonly input: string; readonly value: number }[];
}

/** The rule of the solved regions: the file `data/solved-rule.json`. */
export interface SolvedRule {
  readonly schema: typeof SOLVED_RULE_SCHEMA;
  /** The lowest 95 % Wilson lower bound that passes. */
  readonly floor: number;
  readonly margins: Readonly<Record<string, MeasureMargin>>;
  /** The words of a passing region. The mark `{n}` takes the count of inputs. */
  readonly words: { readonly exact: string; readonly slack: string };
  /** The strategy that chooses without a read of the result on the input. A user gets its figure. */
  readonly selector: string;
  readonly searches: readonly SearchRead[];
  readonly weekly: { readonly corpus: string; readonly weeksLed: number; readonly need: number; readonly firstPossible: string };
}

/** The state of a region. */
export type RegionState = "solved" | "holds" | "open" | "too-few" | "not-read";

/** The states in the order of the page. */
export const REGION_STATES: readonly RegionState[] = ["solved", "holds", "open", "too-few", "not-read"];

/** The words of each state. The page and `docs/BENCH.md` use these words. */
export const STATE_WORDS: Readonly<Record<RegionState, string>> = {
  solved: "solved",
  holds: "holds, no search read",
  open: "open",
  "too-few": "too few inputs",
  "not-read": "not read on the current measure",
};

const STATE_LOOK: Readonly<Record<RegionState, string>> = { solved: "better", holds: "mixed", open: "worse", "too-few": "unmeasured", "not-read": "unmeasured" };

/** The figures of one strategy on one region. */
export interface RegionFigure {
  readonly strategy: string;
  /** The count of inputs at or under the margin. */
  readonly at: number;
  readonly share: number;
  /** The 95 % Wilson lower bound of the share. */
  readonly low: number;
  readonly median: number;
}

/** One region: one cell of one corpus, with one measure. */
export interface Region {
  readonly corpus: string;
  readonly cell: string;
  readonly measure: string;
  readonly inputs: number;
  readonly state: RegionState;
  /** The date of the data, or more than one date with a comma. */
  readonly date: string;
  /** The words of the budget of the run. */
  readonly budget: string;
  /** The strategy with the most inputs at the margin. This pick is after the fact. A region that was not read has none. */
  readonly best?: RegionFigure;
  /** The figure of the selector, when it has a row on the region. */
  readonly selector?: RegionFigure;
  /** The words of a passing region. */
  readonly claim?: string;
  /** The first input of a search that went past the margin. */
  readonly found?: { readonly input: string; readonly value: number };
}

/** This function gives the highest value at the margin of a cell. A measured slack replaces the margin of 0. */
export function limitOf(rule: SolvedRule, measure: string, corpus: string, cell: string): number | undefined {
  const margin = rule.margins[measure];
  return margin?.cells[`${corpus}/${cell}`]?.limit ?? margin?.limit;
}

/** This function tells if a count of inputs can pass: all inputs at the margin give a lower bound at the floor or above. */
export function canPass(inputs: number, floor: number): boolean {
  return wilson(inputs, inputs).low >= floor;
}

function figureOf(strategy: string, c: GapCell, inputs: number): RegionFigure {
  const at = c.atMargin?.n ?? 0;
  return { strategy, at, share: inputs === 0 ? 0 : at / inputs, low: wilson(at, inputs).low, median: c.median };
}

/**
 * This function gives the regions of one snapshot. The count of inputs of the cell divides each share, so a strategy gets
 * no gain from an input that it refused or lost. A file with another margin than the rule does not read.
 */
export function regionsOf(snap: GapSnapshot, rule: SolvedRule): Region[] {
  const date = [...new Set(snap.origin.map((o) => o.date))].join(", ");
  const budget = snap.budget === undefined ? "no wall budget" : `a wall budget of ${snap.budget.smallPairMs / 1000} s to ${snap.budget.pairMs / 1000} s a pair`;
  const stale = onOldMeasure(snap);
  return snap.cells.map(({ cell, inputs }): Region => {
    const base = { corpus: snap.corpus, cell, measure: snap.measure, inputs, date, budget };
    const limit = limitOf(rule, snap.measure, snap.corpus, cell);
    const rows = snap.strategies.flatMap((s) => s.cells.filter((c) => c.cell === cell && c.n > 0).map((c) => ({ strategy: s.strategy, c })));
    if (stale || limit === undefined || rows.some(({ c }) => c.atMargin?.limit !== limit)) return { ...base, state: "not-read" };
    const figures = rows.map(({ strategy, c }) => figureOf(strategy, c, inputs)).sort((a, b) => b.at - a.at || a.median - b.median || a.strategy.localeCompare(b.strategy));
    const best = figures[0];
    const selector = figures.find((f) => f.strategy === rule.selector);
    const shown = { ...base, ...(best === undefined ? {} : { best }), ...(selector === undefined ? {} : { selector }) };
    if (best === undefined) return { ...shown, state: "open" };
    const reads = rule.searches.filter((r) => r.corpus === snap.corpus && r.cell === cell && r.strategy === best.strategy);
    const found = reads.flatMap((r) => r.found)[0];
    if (found !== undefined) return { ...shown, state: "open", found };
    if (!canPass(inputs, rule.floor)) return { ...shown, state: "too-few" };
    if (best.low < rule.floor) return { ...shown, state: "open" };
    const words = rule.margins[snap.measure]!.cells[`${snap.corpus}/${cell}`] === undefined ? rule.words.exact : rule.words.slack;
    return { ...shown, state: reads.length === 0 ? "holds" : "solved", claim: words.replace("{n}", String(inputs)) };
  });
}

/** This function gives the count of regions in each state. */
export function stateCounts(regions: readonly Region[]): Record<RegionState, number> {
  const counts: Record<RegionState, number> = { solved: 0, holds: 0, open: 0, "too-few": 0, "not-read": 0 };
  for (const r of regions) counts[r.state] += 1;
  return counts;
}

const pct = (share: number): string => `${(share * 100).toFixed(1)} %`;

/** This function gives the tiles of the atlas. */
export function atlasTiles(regions: readonly Region[], rule: SolvedRule): string {
  const counts = stateCounts(regions);
  const tile = (state: RegionState, note: string, look: string): string => `<div class="tile ${look}"><span>${esc(STATE_WORDS[state])}</span><b>${counts[state]}</b><small>${esc(note)}</small></div>`;
  return `
    <div class="tile hero"><span>Solved regions</span><b>${counts.solved} of ${regions.length}</b><small>on these corpora, at these budgets</small></div>
    ${tile("holds", "passes the test, the search has not run", counts.holds === 0 ? "unmeasured" : "mixed")}
    ${tile("open", "under the floor, or a search hit", counts.open === 0 ? "unmeasured" : "worse")}
    ${tile("too-few", "too few to pass the test", "unmeasured")}
    ${tile("not-read", "from a run before the change of pack.gap", "unmeasured")}
    <div class="tile unmeasured"><span>Weeks led</span><b>${rule.weekly.weeksLed} of ${rule.weekly.need}</b><small>${esc(rule.weekly.corpus)}, first possible ${esc(rule.weekly.firstPossible)}</small></div>`;
}

/** This function gives the buttons of the filter, with the count of each state. */
export function atlasFilter(regions: readonly Region[], current: RegionState | "all"): string {
  const counts = stateCounts(regions);
  const button = (value: RegionState | "all", label: string, n: number): string => `<button type="button" role="radio" data-state="${value}" aria-checked="${value === current}">${esc(label)} ${n}</button>`;
  return button("all", "All", regions.length) + REGION_STATES.map((s) => button(s, STATE_WORDS[s], counts[s])).join("");
}

function shareCell(f: RegionFigure, inputs: number, floor: number): string {
  const title = `${f.at} of ${inputs} at the margin, ${pct(f.share)}, 95 % lower bound ${f.low.toFixed(3)}, floor ${floor}`;
  return `<span class="region-share" title="${esc(title)}"><span class="region-bar" aria-hidden="true"><i style="width:${(f.share * 100).toFixed(1)}%"></i><b style="left:${floor * 100}%"></b></span><small>${f.at} of ${inputs}, ${pct(f.share)}, lower bound ${f.low.toFixed(3)}</small></span>`;
}

/** This function gives the table of the regions of one state, or of all regions. */
export function atlasTable(regions: readonly Region[], rule: SolvedRule, current: RegionState | "all"): string {
  const shown = regions.filter((r) => current === "all" || r.state === current);
  if (shown.length === 0) return `<tbody><tr><td class="none">No region is in this state.</td></tr></tbody>`;
  const head = `<thead><tr><th scope="col">Region</th><th scope="col">State</th><th scope="col">Best, picked after the fact</th><th scope="col">At the margin</th><th scope="col" class="num">Median distance</th><th scope="col">Selector, at the margin</th><th scope="col">Data</th></tr></thead>`;
  const body = shown
    .map((r) => {
      const region = `<th scope="row"><code>${esc(r.cell)}</code><small class="region-scope">on <code>${esc(r.corpus)}</code>, ${r.inputs} inputs, ${esc(r.budget)}, <code>${esc(r.measure)}</code></small></th>`;
      const notes = [r.claim === undefined ? "" : `<small class="region-scope">${esc(r.claim)}</small>`, r.found === undefined ? "" : `<small class="region-scope">A search found <code>${esc(r.found.input)}</code> at ${r.found.value}.</small>`].join("");
      const state = `<td><span class="chip ${STATE_LOOK[r.state]}">${esc(STATE_WORDS[r.state])}</span>${notes}</td>`;
      const data = `<td>${esc(r.date)}</td>`;
      if (r.best === undefined) return `<tr>${region}${state}<td class="none" colspan="4">${r.state === "not-read" ? "Not read, so it shows no distance." : "No strategy has a value."}</td>${data}</tr>`;
      const selector = r.selector === undefined ? `<td class="none">no row</td>` : `<td>${shareCell(r.selector, r.inputs, rule.floor)}</td>`;
      return `<tr>${region}${state}<td><code>${esc(r.best.strategy)}</code></td><td>${shareCell(r.best, r.inputs, rule.floor)}</td><td class="num">${r.best.median}</td>${selector}${data}</tr>`;
    })
    .join("");
  return `${head}<tbody>${body}</tbody>`;
}

/** This function gives the line of the rule from its data: the floor, the smallest count that can pass and each margin. */
export function ruleLine(rule: SolvedRule): string {
  let smallest = 1;
  while (!canPass(smallest, rule.floor)) smallest += 1;
  const margins = Object.entries(rule.margins)
    .map(([measure, m]) => `<code>${esc(measure)}</code> ${m.limit} (${Object.keys(m.cells).length} cells with a measured slack)`)
    .join(", ");
  return `The floor is ${rule.floor}. The smallest count that can pass is ${smallest}. The highest value at the margin: ${margins}. The search has read ${rule.searches.length} regions.`;
}
