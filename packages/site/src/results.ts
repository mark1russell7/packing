// The results page: each strategy against `rows`, the distance to the best (k51, k45), the solved regions and the coverage.
// The page `results/studies/` has the paired speed test of k67 and the select table (`results-studies.ts`).
// The page reads only the snapshot files of `packages/site/data/`.

import { atlasFilter, atlasTable, atlasTiles, branchRunLines, regionsOf, ruleLine, type RegionState, type SolvedRule } from "./atlas-model.ts";
import { oldGapNote } from "./gap-definition.ts";
import { marked } from "marked";
import { coverEmptyLine, coverGrid, coverPairTable, coverTiles, lawLine, parseCorpusCover, type LawCoverCount } from "./corpus-cover-model.ts";
import strategiesText from "../content/results-strategies.md?raw";
import gapsText from "../content/results-gaps.md?raw";
import gapsKnownJson from "../data/gaps-pack-known-v1.json?raw";
import gapsSelectJson from "../data/gaps-pack-select-v2.json?raw";
import atlasText from "../content/results-atlas.md?raw";
import solvedRuleJson from "../data/solved-rule.json?raw";
import coverageText from "../content/results-coverage.md?raw";
import corpusCoverText from "../content/results-corpus-cover.md?raw";
import corpusCoverJson from "../data/corpus-cover.json?raw";
import lawCoverJson from "../data/law-cover.json?raw";
import coverageJson from "../data/coverage.json?raw";
import measuredJson from "../data/measured-entries.json?raw";
import { mountChrome } from "./chrome.ts";
import { CORPUS_LABELS, COVERAGE_LABELS, fillClaimOf, GAP_LABELS, MEASURE_LABELS, parseSnapshot, type MeasureVerdict, type Origin, type StrategySnapshot, type StrategySummary } from "./data.ts";
import { strategySnapshots } from "./strategy-snapshots.ts";
import { diffText, esc, inline, LABEL_LOOK, msText, originHtml } from "./format.ts";
import {
  COVERAGE_SCOPES,
  COVERAGE_STRATA_SCOPE,
  COVERAGE_POOLED_SCOPE,
  COVERAGE_PRIOR_SCOPE,
  priorBasisText,
  coverageTile,
  determinismText,
  divergingAt,
  errorText,
  errorWidth,
  gapAt,
  gapRanking,
  gapScale,
  gapShade,
  gapTable,
  gapText,
  fillClaimCounts,
  fillClaimOfStrategy,
  parseVerdictHash,
  percentText,
  budgetText,
  rankSections,
  sectionReasons,
  skipLine,
  skipsHtml,
  sectionText,
  scaleOf,
  spaceOf,
  strataRows,
  strataText,
  activeRows,
  FORCED_LABEL,
  forcedText,
  trendChart,
  trendNote,
  entriesNote,
  measuredNote,
  verdictHash,
  verdictOf,
} from "./results-model.ts";
import "@mark1russell7/site-pages/scroll-cue.css";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const snapshots = strategySnapshots;
const gapSnaps = [gapsKnownJson, gapsSelectJson].map((t) => parseSnapshot(t, "gaps"));
const cover = parseSnapshot(coverageJson, "coverage");
const measuredEntries = parseSnapshot(measuredJson, "measured");
const corpusCover = parseCorpusCover(corpusCoverJson);

mountChrome($("links"), "results");

const WIN = "pack.fill";
let current = 0;

// ---- Each strategy against rows ----

/** The look of a better fill on a corpus with no partner: the fill is higher, and the page claims no win. */
const NO_CLAIM = { mark: "•", word: "Higher, no claim", cls: "none" };

/** This function gives the chip of one verdict. With `noClaim`, a better verdict shows as `NO_CLAIM`. */
function chip(v: MeasureVerdict | undefined, noClaim = false): string {
  if (v === undefined) return `<span class="chip unmeasured">○ Not measured</span>`;
  const look = noClaim && v.label === "better" ? NO_CLAIM : LABEL_LOOK[v.label];
  const share = MEASURE_LABELS[v.measure]?.share ?? false;
  const value = v.stratified === undefined ? "" : ` <b>${diffText(v.stratified.mean, share)}</b>`;
  return `<span class="chip ${look.cls}" title="${esc(v.summary)}"><span aria-hidden="true">${look.mark}</span> ${look.word}${value}</span>`;
}

/** This function gives the bar of the stratified mean of the win measure, with its interval, on a shared scale. */
function bar(v: MeasureVerdict | undefined, max: number, noClaim = false): string {
  const s = v?.stratified;
  if (s === undefined || v === undefined) return `<div class="dbar empty" aria-hidden="true"></div>`;
  const at = divergingAt(s.mean, max);
  const left = Math.min(50, at);
  const width = Math.abs(at - 50);
  const lo = divergingAt(s.lo, max);
  const hi = divergingAt(s.hi, max);
  const cls = noClaim && v.label === "better" ? NO_CLAIM.cls : LABEL_LOOK[v.label].cls;
  return `<div class="dbar" aria-hidden="true"><span class="zero"></span><span class="fillbar ${cls}" style="left:${left}%;width:${width}%"></span><span class="whisker" style="left:${lo}%;width:${Math.max(0.5, hi - lo)}%"></span></div>`;
}

/** This function gives the largest input that a strategy finished, and the reason of each input that it did not finish. */
function finishedHtml(s: StrategySummary, snap: StrategySnapshot): string {
  if (s.finished === undefined) return "";
  const size = s.finished.largest === null ? "No input finished." : `The largest input finished has ${s.finished.largest} items: ${s.finished.inputs} of ${snap.inputs} inputs.`;
  const one = (s.oneRun ?? 0) === 0 ? "" : ` ${s.oneRun} records have 1 timed run, so no time gate reads them.`;
  const reasons = (s.reasons ?? []).map((r) => `<li><b>${r.count}</b> ${skipLine(r)}</li>`).join("");
  return `<p class="hint">${esc(size + one)}</p>${reasons === "" ? "" : `<ul class="reasons">${reasons}</ul>`}`;
}

/** This function gives the details of one strategy: each measure, the family signs and the groups of the win measure. */
function details(s: StrategySummary, snap: StrategySnapshot): string {
  const rows = snap.measures
    .map((m) => {
      const v = verdictOf(s, m.id);
      const meta = MEASURE_LABELS[m.id];
      const share = meta?.share ?? false;
      if (v === undefined || v.stratified === undefined) return `<tr><th scope="row">${esc(meta?.label ?? m.id)}</th><td colspan="4">${chip(v)} ${v === undefined ? "" : esc(v.summary)}</td></tr>`;
      const fmt = (x: number): string => (share ? `${(x * 100).toFixed(1)}%` : x.toFixed(3));
      const signs = v.signs ?? { wins: 0, losses: 0, ties: 0 };
      return `<tr><th scope="row">${esc(meta?.label ?? m.id)}</th><td>${chip(v)}</td><td class="num">${v.means === undefined ? "" : `${fmt(v.means.a)} → ${fmt(v.means.b)}`}</td><td class="num">${diffText(v.stratified.lo, share)} to ${diffText(v.stratified.hi, share)}</td><td>${signsBar(signs)}</td></tr>`;
    })
    .join("");
  const groups = s.groups
    .map((g) => `<li><span class="gname">${esc(g.group)}</span>${signsBar(g)}</li>`)
    .join("");
  const ms = s.msMedian === null ? "no time" : `in-order median ${msText(s.msMedian)} for each pack, in its own CI job`;
  return `
    <p class="hint">${s.records} records, ${s.skipped} skipped, ${s.hardBreaks} hard breaks, ${ms}.</p>
    ${finishedHtml(s, snap)}
    <div class="scroll scroll-cue" tabindex="0" aria-label="The measures of this strategy"><table class="vtable">
      <thead><tr><th scope="col">Measure</th><th scope="col">Verdict</th><th scope="col"><code>${esc(snap.baseline)}</code> → this</th><th scope="col">Interval</th><th scope="col">Families: better, worse, tie</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${groups === "" ? "" : `<h4>Fill by group of boards</h4><ul class="groups">${groups}</ul>`}`;
}

/** This function gives a bar of the family signs: better, worse and tie, with the counts as text. */
function signsBar(c: { wins: number; losses: number; ties: number }): string {
  const n = c.wins + c.losses + c.ties;
  if (n === 0) return "";
  const pc = (k: number): string => `${(k / n) * 100}%`;
  return `<span class="signs"><span class="sbar" aria-hidden="true"><span class="better" style="width:${pc(c.wins)}"></span><span class="worse" style="width:${pc(c.losses)}"></span><span class="tie" style="width:${pc(c.ties)}"></span></span><span class="scount">${c.wins} ▲ · ${c.losses} ▼ · ${c.ties} •</span></span>`;
}

function drawStrategies(): void {
  const snap = snapshots[current]!;
  const meta = CORPUS_LABELS[snap.corpus];
  for (const b of $("corpora").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(Number(b.dataset["i"]) === current));
  $("corpus-note").innerHTML = `${inline(meta?.note ?? snap.corpus)} <code>${esc(snap.corpus)}</code>: ${snap.inputs} inputs in ${snap.families} families.`;
  $("strategies-origin").innerHTML = originHtml(snap.origin);
  const budget = $("corpus-budget");
  budget.hidden = snap.budget === undefined;
  budget.textContent = snap.budget === undefined ? "" : budgetText(snap.budget);
  const claim = fillClaimOf(snap.corpus);
  const partner = claim.partner === null ? undefined : (MEASURE_LABELS[claim.partner]?.label ?? claim.partner).toLowerCase();
  const counts = fillClaimCounts(snap, WIN, claim.partner);
  const base = `<code>${esc(snap.baseline)}</code>`;
  const winTiles =
    partner === undefined
      ? `<div class="tile none"><b>${counts.unpaired}</b><span>fill higher than ${base}, with no partner: no win claim</span></div>`
      : `<div class="tile better"><b>${counts.pair}</b><span>fill better than ${base}, ${esc(partner)} not worse</span></div>
    <div class="tile mixed"><b>${counts.givesUp}</b><span>fill better, but ${esc(partner)} worse</span></div>${
      counts.unpaired === 0 ? "" : `\n    <div class="tile none"><b>${counts.unpaired}</b><span>fill better, ${esc(partner)} not in this snapshot: no win claim</span></div>`
    }`;
  $("headline").innerHTML = `
    ${winTiles}
    <div class="tile worse"><b>${counts.worse}</b><span>fill worse</span></div>
    <div class="tile none"><b>${counts.other}</b><span>no verdict or mixed</span></div>
    <div class="tile unmeasured"><b>${counts.unmeasured}</b><span>not measured</span></div>`;
  $("fill-claim").innerHTML = esc(claim.note);
  const max = scaleOf(snap, WIN);
  const head = snap.measures.map((m) => `<span class="mhead" title="${esc(MEASURE_LABELS[m.id]?.note ?? m.id)}">${esc(MEASURE_LABELS[m.id]?.label ?? m.id)}</span>`).join("");
  const sections = rankSections(snap, WIN, claim.partner);
  const row = (s: StrategySummary): string => {
    const fill = verdictOf(s, WIN);
    const share = fillClaimOfStrategy(s, WIN, claim.partner);
    const noClaim = share === "unpaired";
    const gives = share === "givesUp" && partner !== undefined ? `<small class="gives">gives up ${esc(partner)}</small>` : "";
    const chips = snap.measures.map((m) => `<span class="cell" data-m="${esc(MEASURE_LABELS[m.id]?.label ?? m.id)}">${chip(verdictOf(s, m.id), noClaim && m.id === WIN)}</span>`).join("");
    return `<li class="srow" id="${esc(verdictHash(snap.corpus, s.strategy).slice(1))}" data-strategy="${esc(s.strategy)}">
      <details>
        <summary>
          <span class="sname"><code>${esc(s.strategy)}</code>${s.msMedian === null ? "" : `<small>${msText(s.msMedian)}</small>`}${gives}</span>
          ${bar(fill, max, noClaim)}
          <span class="cells">${chips}</span>
        </summary>
        <div class="sdetails">${details(s, snap)}</div>
      </details>
    </li>`;
  };
  const list = sections
    .map((section) => {
      const reasons = sectionReasons(section).map((r) => `<small>${esc(r)}</small>`).join("");
      const heading = sections.length < 2 || section.finished === undefined ? "" : `<li class="ssection"><span>${esc(sectionText(section.finished, snap.inputs))}</span>${reasons}</li>`;
      return heading + section.strategies.map(row).join("");
    })
    .join("");
  $("strategy-skips").innerHTML = skipsHtml(snap.strategies);
  $("strategy-list").innerHTML = `<li class="shead" aria-hidden="true"><span class="sname">Strategy</span><span class="dhead">Fill against <code>${esc(snap.baseline)}</code>: ± ${diffText(max, true).replace(/^[+−]/, "")}</span><span class="cells">${head}</span></li>${list}`;
}

function mountStrategies(): void {
  $("strategies-text").innerHTML = marked.parse(strategiesText, { async: false });
  $("corpora").innerHTML = snapshots
    .map((s, i) => `<button type="button" role="radio" data-i="${i}" aria-checked="${i === current}">${esc(CORPUS_LABELS[s.corpus]?.label ?? s.corpus)}</button>`)
    .join("");
  $("corpora").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (b === null) return;
    current = Number(b.dataset["i"]);
    drawStrategies();
  });
  $("measure-notes").innerHTML = snapshots[0]!.measures
    .map((m) => `<li><b>${esc(MEASURE_LABELS[m.id]?.label ?? m.id)}</b> <code>${esc(m.id)}</code>: ${esc(MEASURE_LABELS[m.id]?.note ?? "")}</li>`)
    .join("");
  drawStrategies();
  openVerdict();
  addEventListener("hashchange", openVerdict);
}

/**
 * This function opens the verdict of the hash `#verdict/<corpus>/<strategy>`. The compare page links to it. The
 * function picks the corpus, opens the row of the strategy and scrolls to it.
 */
function openVerdict(): void {
  const want = parseVerdictHash(location.hash);
  if (want === undefined) return;
  const i = snapshots.findIndex((s) => s.corpus === want.corpus);
  if (i < 0) return;
  current = i;
  drawStrategies();
  const row = document.getElementById(verdictHash(want.corpus, want.strategy).slice(1));
  if (row === null) return;
  row.querySelector("details")?.setAttribute("open", "");
  row.classList.add("target");
  row.scrollIntoView({ block: "start" });
}

// ---- The distance to the best ----

let gapCurrent = 0;

/** This function gives the text of the release, the commit and the date of the data of a snapshot. */
const dataLine = (origin: readonly Origin[]): string =>
  origin.map((o) => `release <code>${esc(o.release)}</code>, commit <code>${esc(o.commit)}</code>, ${esc(o.date)}`).join(" and ");

function drawGaps(): void {
  const snap = gapSnaps[gapCurrent]!;
  const meta = GAP_LABELS[snap.measure];
  const corpus = CORPUS_LABELS[snap.corpus];
  for (const b of $("gap-corpora").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(Number(b.dataset["i"]) === gapCurrent));
  $("gap-note").innerHTML = `<b>${esc(meta.label)}</b> <code>${esc(snap.measure)}</code>: ${esc(meta.note)} The data: ${dataLine(snap.origin)}. ${inline(corpus?.note ?? "")} <code>${esc(snap.corpus)}</code>: ${snap.inputs} inputs in ${snap.cells.length} cells.${snap.measure === "pack.gap" ? ` ${oldGapNote(snap.origin.map((o) => o.run))}` : ""}`;
  $("gap-origin").innerHTML = originHtml(snap.origin);
  const stopped = $("gap-stopped");
  stopped.hidden = snap.stopped === undefined;
  stopped.textContent = snap.stopped === undefined ? "" : `${snap.stopped} inputs left this table, because a wall budget ended a pair on them. Each strategy has the same inputs.`;
  const ranked = gapRanking(snap);
  const max = gapScale(snap);
  const below = snap.strategies.reduce((s, x) => s + x.all.below0, 0);
  const best = ranked[0]!;
  $("gap-tiles").innerHTML = `
    <div class="tile hero"><span>The lowest median, all inputs</span><b>${esc(gapText(best.all.median))}</b><small><code>${esc(best.strategy)}</code>, ${best.all.n} records</small></div>
    <div class="tile"><span>Strategies</span><b>${ranked.length}</b><small>in the same CI run</small></div>
    <div class="tile ${below === 0 ? "better" : "worse"}"><span>Values below 0</span><b>${below}</b><small>${below === 0 ? "no bound is above a result" : "a bug of a bound or of a packer"}</small></div>`;
  $("gap-chart").innerHTML =
    ranked
      .map((s) => {
        const a = s.all;
        const lo = gapAt(a.q1, max);
        const hi = gapAt(a.q3, max);
        const title = `${s.strategy}: median ${gapText(a.median)}, quartiles ${gapText(a.q1)} to ${gapText(a.q3)}, ${a.n} records, ${a.missing} without a value`;
        return `<li class="grow" title="${esc(title)}">
          <span class="gstrat"><code>${esc(s.strategy)}</code></span>
          <span class="gbar" aria-hidden="true"><span class="iqr" style="left:${lo}%;width:${Math.max(0.6, hi - lo)}%"></span><span class="med" style="left:${gapAt(a.median, max)}%"></span></span>
          <span class="gval">${esc(gapText(a.median))}</span>
        </li>`;
      })
      .join("") +
    `<li class="gaxis" aria-hidden="true"><span></span><span class="ticks">${[0, max / 2, max].map((t) => `<i style="left:${gapAt(t, max)}%">${esc(gapText(t))}</i>`).join("")}</span><span></span></li>`;
  const rows = gapTable(snap, ranked);
  const bound = snap.measure === "pack.gap";
  const head = ranked.map((s) => `<th scope="col" class="num">${esc(s.strategy)}</th>`).join("");
  const body = rows
    .map((r) => {
      const cells = r.values
        .map((v, i) => {
          if (v === undefined) return `<td class="num gcell none">no value</td>`;
          const title = `${ranked[i]!.strategy} on ${r.cell}: median ${gapText(v.median)}, quartiles ${gapText(v.q1)} to ${gapText(v.q3)}, ${v.n} records, ${v.missing} without a value`;
          const isBest = r.best.includes(i);
          return `<td class="num gcell${isBest ? " best" : ""}" style="--shade:${Math.round(gapShade(v.median, max) * 100)}%" title="${esc(title)}">${isBest ? `<span aria-hidden="true">▲ </span>` : ""}${esc(gapText(v.median))}</td>`;
        })
        .join("");
      const kind = bound ? `<td><code>${esc(r.kind ?? "none")}</code></td>` : "";
      return `<tr><th scope="row"><code>${esc(r.cell)}</code> <small>${r.inputs}</small></th>${kind}${cells}</tr>`;
    })
    .join("");
  $("gap-table").innerHTML = `<thead><tr><th scope="col">Cell, inputs</th>${bound ? `<th scope="col">Bound</th>` : ""}${head}</tr></thead><tbody>${body}</tbody>`;
}

function mountGaps(): void {
  $("gaps-text").innerHTML = marked.parse(gapsText, { async: false });
  $("gap-corpora").innerHTML = gapSnaps
    .map((s, i) => `<button type="button" role="radio" data-i="${i}" aria-checked="${i === gapCurrent}">${esc(CORPUS_LABELS[s.corpus]?.label ?? s.corpus)}</button>`)
    .join("");
  $("gap-corpora").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (b === null) return;
    gapCurrent = Number(b.dataset["i"]);
    drawGaps();
  });
  drawGaps();
}

// ---- The solved regions of k109 ----

function mountAtlas(): void {
  const rule = JSON.parse(solvedRuleJson) as SolvedRule;
  const regions = gapSnaps.flatMap((snap) => regionsOf(snap, rule));
  let current: RegionState | "all" = "all";
  const draw = (): void => {
    $("atlas-filter").innerHTML = atlasFilter(regions, current);
    $("atlas-table").innerHTML = atlasTable(regions, rule, current);
  };
  $("atlas-text").innerHTML = marked.parse(atlasText, { async: false });
  $("atlas-rule").innerHTML = ruleLine(rule);
  const records = branchRunLines(gapSnaps);
  $("atlas-records").innerHTML = records.join(" ");
  $("atlas-records").hidden = records.length === 0;
  $("atlas-tiles").innerHTML = atlasTiles(regions, rule);
  $("atlas-origin").innerHTML = originHtml(gapSnaps.flatMap((snap) => snap.origin));
  $("atlas-filter").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-state]");
    if (b === null) return;
    current = b.dataset["state"] as RegionState | "all";
    draw();
  });
  draw();
}

// ---- The space coverage of k105 ----

let coverCurrent = 0;

/** This function gives the name of a measure of the coverage. */
const coverLabel = (id: string): string => COVERAGE_LABELS[id]?.label ?? id;

function drawIndices(): void {
  const measures = cover.latest.measures;
  const m = measures[coverCurrent]!;
  for (const b of $("coverage-measures").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(Number(b.dataset["i"]) === coverCurrent));
  const e = m.explained;
  $("coverage-explained").innerHTML = `<b>${esc(coverLabel(m.id))}</b>: ${esc(COVERAGE_LABELS[m.id]?.note ?? "")} The strategy alone explains ${e.strategy.toFixed(2)} of the variance, the input spec alone ${e.input.toFixed(2)}, and the two together ${e.joint.toFixed(2)}. The seeds explain the rest, ${m.noise.toFixed(2)}.`;
  $("coverage-indices").innerHTML = m.indices
    .map(
      (x) => `<li class="irow" title="${esc(`${x.feature}: index ${x.index}, a feature of the ${x.group}`)}">
        <span class="iname"><code>${esc(x.feature)}</code> <small class="ctag ${x.group}">${x.group}</small></span>
        <span class="ibar" aria-hidden="true"><span class="ifill ${x.group}" style="width:${Math.max(0.6, x.index * 100)}%"></span></span>
        <span class="ival">${x.index.toFixed(2)}</span>
      </li>`,
    )
    .join("");
  drawStrata();
}

/** This function draws the strata chart of the current measure, or a note without strata. */
function drawStrata(): void {
  const m = cover.latest.measures[coverCurrent]!;
  const t = strataText(m);
  $("coverage-strata-note").innerHTML =
    t === null
      ? `The share of each stratum is not measured yet. A sample with strata gives it.`
      : `<b>${esc(coverLabel(m.id))}</b>: the dot is the share of the pairs of a stratum, and the band is its 95% interval. The line is the ${COVERAGE_STRATA_SCOPE}, ${esc(t.share)}.`;
  $("coverage-strata").innerHTML = strataRows(m, cover.latest.strata?.strata);
  const f = forcedText(m);
  $("coverage-forced").innerHTML =
    f === null ? "" : `<b>${esc(coverLabel(m.id))}</b>, the whole space by input: pairs with ${FORCED_LABEL} ${esc(f.heavy)}, the other pairs ${esc(f.rest)}.`;
  drawActive();
}

/** This function draws the table of the active rounds of the current measure (k116), or a note without rounds. */
function drawActive(): void {
  const m = cover.latest.measures[coverCurrent]!;
  const a = cover.latest.active;
  const rows = activeRows(m);
  $("coverage-active").hidden = rows === "";
  $("coverage-active").innerHTML = rows;
  $("coverage-active-note").innerHTML =
    a === undefined || rows === ""
      ? "The active rounds are not measured yet. A bench run with the draw <code>active</code> gives them."
      : `<b>${esc(coverLabel(m.id))}</b>: each round measures the ${a.pool === null ? "" : `${a.pool} `}candidate pairs where the trees of the folds disagree most. The pairs then join the training rows. ` +
        `"New pairs hit" is the share of the new pairs within the tolerance, before they join. "Sample after" is the share of the ${a.evalPairs ?? ""} pairs of the sample above. The model reads the <code>${esc(a.features)}</code> features.`;
}

/** This function gives the SVG of the trend chart of the shares. */
function trendSvg(): string {
  const W = 640;
  const H = 220;
  const P = 34;
  const ids = cover.latest.measures.map((m) => m.id);
  const chart = trendChart(cover.trend, ids, W, H, P);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((s) => {
      const y = H - P - s * (H - 2 * P);
      return `<line class="grid" x1="${P}" x2="${W - P / 2}" y1="${y}" y2="${y}"/><text class="axis" x="${P - 6}" y="${y + 4}" text-anchor="end">${percentText(s)}</text>`;
    })
    .join("");
  const ticks = chart.ticks.map((t) => `<text class="axis" x="${t.x}" y="${H - P + 18}" text-anchor="middle">${esc(t.date)}</text>`).join("");
  const lines = chart.series
    .map((s, i) => {
      const cls = `s${i + 1}`;
      const path = s.lines
        .filter((line) => line.points.length > 1)
        .map((line) => `<polyline class="line ${cls}${line.current ? "" : " past"}" points="${line.points.map((p) => `${p.x},${p.y}`).join(" ")}"/>`)
        .join("");
      const dots = s.points.map((p) => `<circle class="dot ${cls}${p.current ? "" : " past"}" cx="${p.x}" cy="${p.y}" r="5"><title>${esc(`${coverLabel(s.id)}, ${p.date}: ${percentText(p.share)} of the cells`)}</title></circle>`).join("");
      return path + dots;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The share of the covered cells of each measure, by week">${grid}${ticks}${lines}</svg>`;
}

// ---- The corpus coverage of k50 ----

let coverViewAt = 0;
let coverPair = 0;

function drawCorpusCover(): void {
  const view = corpusCover.views[coverViewAt]!;
  const skipped = corpusCover.skipped.map((id) => `<code>${esc(id)}</code>`).join(", ");
  $("corpus-cover-note").innerHTML = `${view.specs} specs, ${view.inputs} inputs. The count does not read ${skipped}, because it has no specs.`;
  $("corpus-cover-tiles").innerHTML = coverTiles(corpusCover, view);
  $("corpus-cover-grid").innerHTML = coverGrid(corpusCover, view, coverPair);
  $("corpus-cover-pair").innerHTML = coverPairTable(corpusCover, view, coverPair);
  $("corpus-cover-empty").innerHTML = coverEmptyLine(view);
  $("law-cover-line").textContent = lawLine(JSON.parse(lawCoverJson) as LawCoverCount);
}

function mountCorpusCover(): void {
  $("corpus-cover-text").innerHTML = marked.parse(corpusCoverText, { async: false });
  const select = $<HTMLSelectElement>("corpus-cover-view");
  select.innerHTML = corpusCover.views.map((v, i) => `<option value="${i}">${v.id === "all" ? "All the corpora" : esc(v.id)}</option>`).join("");
  select.addEventListener("change", () => {
    coverViewAt = Number(select.value);
    drawCorpusCover();
  });
  $("corpus-cover-grid").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-pair]");
    if (button === null) return;
    coverPair = Number(button.dataset["pair"]);
    drawCorpusCover();
    $("corpus-cover-grid").querySelector<HTMLButtonElement>(`button[data-pair="${coverPair}"]`)?.focus();
  });
  drawCorpusCover();
}

function mountCoverage(): void {
  const l = cover.latest;
  $("coverage-text").innerHTML = marked.parse(coverageText, { async: false });
  $("coverage-note").innerHTML = `The data: ${dataLine(cover.origin)}. The corpus <code>${esc(l.corpus)}</code>: ${l.records} records of ${l.strategies.length} strategies on ${l.inputs} inputs. The model: a regression tree, ${l.model.folds} parts by ${esc(l.model.by)}, the seed ${l.model.seed}, the <code>${esc(l.model.features ?? "family")}</code> features of the inputs. The small number "by input" is the less strict test.`;
  $("coverage-origin").innerHTML = originHtml(cover.origin);
  $("coverage-tiles").innerHTML = l.measures.map((m) => coverageTile(m, coverLabel(m.id), spaceOf(l, m))).join("");
  const sample = l.sampled;
  const stratified = sample?.draw === "stratified";
  const uniform = l.uniform ?? (sample === undefined || stratified ? undefined : { pairs: sample.pairs, run: l.run, date: l.date });
  const runText = (run: number | null, date: string): string => (run === null ? `on ${esc(date)}` : `of the run ${run} on ${esc(date)}`);
  $("coverage-sampled").innerHTML =
    (uniform === undefined
      ? `The number of the ${COVERAGE_SCOPES.space} tests the model on uniform random pairs of a config and an input, outside the bench grid. It is not measured yet.`
      : `The number of the ${COVERAGE_SCOPES.space} tests the model on ${uniform.pairs} uniform random pairs of a config and an input, outside the bench grid. The pairs are ${runText(uniform.run, uniform.date)}. The range is its 95% interval.`) +
    (l.strata === undefined
      ? ""
      : ` The number "${COVERAGE_STRATA_SCOPE}" is the mean of the shares of the strata. Each stratum has the same weight. The draw of the sample is ${esc(l.strata.draw ?? "not known")}.`) +
    (stratified && sample !== undefined
      ? ` The number "${COVERAGE_POOLED_SCOPE}" is the share of all the ${sample.pairs} pairs of the stratified sample ${runText(l.run, l.date)}. It is not a uniform share.`
      : "") +
    (l.measures.some((m) => m.sampled?.prior !== undefined || l.uniform?.measures[m.id]?.prior !== undefined)
      ? l.prior === undefined
        ? ` The number "${COVERAGE_PRIOR_SCOPE}" gives each generator family its share of the inputs of the corpus as its weight. A family outside the corpus gets the weight 0.`
        : ` The number "${COVERAGE_PRIOR_SCOPE}" gives each generator family a weight. ${esc(priorBasisText(l.prior) ?? "")} The effective pairs are the count of uniform pairs with the same precision.`
      : "") +
    determinismText(sample);
  $("coverage-errors").innerHTML = l.measures
    .map((m) => {
      const skill = m.skill === null ? "" : `, ${percentText(m.skill)} less error`;
      const alt = m.byInput === undefined ? "" : `<small class="alt">by input ${esc(errorText(m, m.byInput.mae))}, median ${esc(errorText(m, m.byInput.medianAe))}</small>`;
      return `<li class="crow" title="${esc(`${coverLabel(m.id)}: ${m.n} records`)}">
        <span class="cname">${esc(coverLabel(m.id))} <small>tolerance ${esc(errorText(m, m.tolerance))}</small></span>
        <span class="cbars">
          <span class="cbar" aria-hidden="true"><span class="base"></span><span class="model" style="width:${errorWidth(m.mae, m.baselineMae)}%"></span></span>
          <span class="cbar median" aria-hidden="true"><span class="base"></span><span class="model" style="width:${errorWidth(m.medianAe, m.baselineMedianAe)}%"></span></span>
        </span>
        <span class="cval">mean ${esc(errorText(m, m.mae))} against ${esc(errorText(m, m.baselineMae))}${skill}<br>median ${esc(errorText(m, m.medianAe))} against ${esc(errorText(m, m.baselineMedianAe))}${alt}</span>
      </li>`;
    })
    .join("");
  $("coverage-measures").innerHTML = l.measures
    .map((m, i) => `<button type="button" role="radio" data-i="${i}" aria-checked="${i === coverCurrent}">${esc(coverLabel(m.id))}</button>`)
    .join("");
  $("coverage-measures").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (b === null) return;
    coverCurrent = Number(b.dataset["i"]);
    drawIndices();
  });
  drawIndices();
  $("coverage-trend").innerHTML = trendSvg();
  $("coverage-segments").innerHTML = trendNote(cover.trend);
  $("coverage-entries").innerHTML = entriesNote(l.entries) + measuredNote(measuredEntries);
  const last = cover.trend.at(-1)!;
  $("coverage-legend").innerHTML = l.measures
    .map((m, i) => {
      const alt = last.sharesByInput?.[m.id];
      return `<span class="ckey"><i class="csw s${i + 1}" aria-hidden="true"></i>${esc(coverLabel(m.id))} <b>${percentText(last.shares[m.id] ?? 0)}</b>${alt === undefined ? "" : ` <small>by input ${percentText(alt)}</small>`}</span>`;
    })
    .join("");
  const head = l.measures.map((m) => `<th scope="col" class="num">${esc(coverLabel(m.id))} <small>by spec (by input)</small></th>`).join("");
  const body = [...cover.trend]
    .reverse()
    .map((p) => `<tr><th scope="row">${esc(p.date)}</th><td><code>${esc(p.corpus)}</code></td><td><code>${esc(p.commit)}</code></td><td class="num">${p.strategies === undefined ? "not recorded" : String(p.strategies.length)}</td>${l.measures.map((m) => `<td class="num">${p.shares[m.id] === undefined ? "" : percentText(p.shares[m.id]!)}${p.sharesByInput?.[m.id] === undefined ? "" : ` <small>(${percentText(p.sharesByInput[m.id]!)})</small>`}</td>`).join("")}</tr>`)
    .join("");
  $("coverage-table").innerHTML = `<thead><tr><th scope="col">Date</th><th scope="col">Corpus</th><th scope="col">Commit</th><th scope="col" class="num">Strategies</th>${head}</tr></thead><tbody>${body}</tbody>`;
}

mountStrategies();
mountGaps();
mountAtlas();
mountCoverage();
mountCorpusCover();
