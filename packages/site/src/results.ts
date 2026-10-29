// The results page: each strategy against `rows`, the distance to the best (k51, k45), the paired speed test of k67 and the select table.
// The page reads only the snapshot files of `packages/site/data/`.

import { marked } from "marked";
import strategiesText from "../content/results-strategies.md?raw";
import speedText from "../content/results-speed.md?raw";
import selectText from "../content/results-select.md?raw";
import screenJson from "../data/strategies-pack-screen-v1.json?raw";
import freeJson from "../data/strategies-pack-free-v1.json?raw";
import test1Json from "../data/strategies-pack-select-v1.json?raw";
import test2Json from "../data/strategies-pack-select-v2.json?raw";
import pairedJson from "../data/paired-k67.json?raw";
import selectJson from "../data/select-table.json?raw";
import gapsText from "../content/results-gaps.md?raw";
import gapsKnownJson from "../data/gaps-pack-known-v1.json?raw";
import gapsSelectJson from "../data/gaps-pack-select-v2.json?raw";
import coverageText from "../content/results-coverage.md?raw";
import coverageJson from "../data/coverage.json?raw";
import { mountChrome } from "./chrome.ts";
import { CORPUS_LABELS, COVERAGE_LABELS, GAP_LABELS, MEASURE_LABELS, parseSnapshot, type MeasureVerdict, type Origin, type StrategySnapshot, type StrategySummary } from "./data.ts";
import { diffText, esc, inline, LABEL_LOOK, msText, originHtml } from "./format.ts";
import {
  COVERAGE_SCOPES,
  COVERAGE_STRATA_SCOPE,
  COVERAGE_POOLED_SCOPE,
  COVERAGE_PRIOR_SCOPE,
  priorBasisText,
  coverageTile,
  divergingAt,
  errorText,
  errorWidth,
  gapAt,
  gapRanking,
  gapScale,
  gapShade,
  gapTable,
  gapText,
  labelCounts,
  parseVerdictHash,
  percentText,
  pickHolds,
  rankStrategies,
  ratioAt,
  scaleOf,
  stepText,
  spaceOf,
  strataRows,
  strataText,
  activeRows,
  FORCED_LABEL,
  forcedText,
  trendChart,
  verdictHash,
  verdictOf,
} from "./results-model.ts";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const snapshots: StrategySnapshot[] = [test2Json, test1Json, screenJson, freeJson].map((t) => parseSnapshot(t, "strategies"));
const paired = parseSnapshot(pairedJson, "paired");
const select = parseSnapshot(selectJson, "select");
const gapSnaps = [gapsKnownJson, gapsSelectJson].map((t) => parseSnapshot(t, "gaps"));
const cover = parseSnapshot(coverageJson, "coverage");

mountChrome($("links"), "results");

const WIN = "pack.fill";
let current = 0;

// ---- Each strategy against rows ----

/** This function gives the chip of one verdict. */
function chip(v: MeasureVerdict | undefined): string {
  if (v === undefined) return `<span class="chip unmeasured">○ Not measured</span>`;
  const look = LABEL_LOOK[v.label];
  const share = MEASURE_LABELS[v.measure]?.share ?? false;
  const value = v.stratified === undefined ? "" : ` <b>${diffText(v.stratified.mean, share)}</b>`;
  return `<span class="chip ${look.cls}" title="${esc(v.summary)}"><span aria-hidden="true">${look.mark}</span> ${look.word}${value}</span>`;
}

/** This function gives the bar of the stratified mean of the win measure, with its interval, on a shared scale. */
function bar(v: MeasureVerdict | undefined, max: number): string {
  const s = v?.stratified;
  if (s === undefined || v === undefined) return `<div class="dbar empty" aria-hidden="true"></div>`;
  const at = divergingAt(s.mean, max);
  const left = Math.min(50, at);
  const width = Math.abs(at - 50);
  const lo = divergingAt(s.lo, max);
  const hi = divergingAt(s.hi, max);
  const cls = LABEL_LOOK[v.label].cls;
  return `<div class="dbar" aria-hidden="true"><span class="zero"></span><span class="fillbar ${cls}" style="left:${left}%;width:${width}%"></span><span class="whisker" style="left:${lo}%;width:${Math.max(0.5, hi - lo)}%"></span></div>`;
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
  const ms = s.msMedian === null ? "no time" : `median ${msText(s.msMedian)} for each pack, in its own CI job`;
  return `
    <p class="hint">${s.records} records, ${s.skipped} skipped, ${s.hardBreaks} hard breaks, ${ms}.</p>
    <div class="scroll"><table class="vtable">
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
  const counts = labelCounts(snap, WIN);
  $("headline").innerHTML = `
    <div class="tile better"><b>${counts.better}</b><span>fill better than <code>${esc(snap.baseline)}</code></span></div>
    <div class="tile worse"><b>${counts.worse}</b><span>fill worse</span></div>
    <div class="tile none"><b>${counts["no verdict"] + counts["depends on the mix"]}</b><span>no verdict or mixed</span></div>
    <div class="tile unmeasured"><b>${counts["not measured"]}</b><span>not measured</span></div>`;
  const max = scaleOf(snap, WIN);
  const head = snap.measures.map((m) => `<span class="mhead" title="${esc(MEASURE_LABELS[m.id]?.note ?? m.id)}">${esc(MEASURE_LABELS[m.id]?.label ?? m.id)}</span>`).join("");
  const list = rankStrategies(snap, WIN)
    .map((s) => {
      const fill = verdictOf(s, WIN);
      const chips = snap.measures.map((m) => `<span class="cell" data-m="${esc(MEASURE_LABELS[m.id]?.label ?? m.id)}">${chip(verdictOf(s, m.id))}</span>`).join("");
      return `<li class="srow" id="${esc(verdictHash(snap.corpus, s.strategy).slice(1))}" data-strategy="${esc(s.strategy)}">
        <details>
          <summary>
            <span class="sname"><code>${esc(s.strategy)}</code>${s.msMedian === null ? "" : `<small>${msText(s.msMedian)}</small>`}</span>
            ${bar(fill, max)}
            <span class="cells">${chips}</span>
          </summary>
          <div class="sdetails">${details(s, snap)}</div>
        </details>
      </li>`;
    })
    .join("");
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

// ---- The paired speed test of k67 ----

function mountSpeed(): void {
  $("speed-text").innerHTML = marked.parse(speedText, { async: false });
  $("speed-origin").innerHTML = originHtml(paired.origin);
  const s = paired.slow;
  $("speed-tiles").innerHTML = `
    <div class="tile hero"><span>The slow set, ${s.inputs} inputs</span><b>${msText(s.medianMsA)} → ${msText(s.medianMsB)}</b><small>median time for each input, ratio ${s.medianRatio}</small></div>
    <div class="tile"><span>The slowest input</span><b>${msText(s.maxMsA)} → ${msText(s.maxMsB)}</b><small>largest time of each arm</small></div>
    <div class="tile"><span>The other ${paired.other.inputs} inputs</span><b>${paired.other.medianRatio}</b><small>median ratio B / A</small></div>
    <div class="tile ${paired.hashesEqual === paired.inputs ? "better" : "worse"}"><span>Same outputs</span><b>${paired.hashesEqual} of ${paired.inputs}</b><small>equal placement hashes</small></div>`;
  const rows = [{ name: "The slow set", ...s, slow: true }, ...paired.classes.map((c) => ({ ...c, slow: false }))].sort((x, y) => x.medianRatio - y.medianRatio);
  const one = ratioAt(1);
  $("speed-chart").innerHTML =
    rows
      .map((r) => {
        const at = ratioAt(r.medianRatio);
        const left = Math.min(one, at);
        const cls = r.medianRatio < 0.97 ? "faster" : r.medianRatio > 1.03 ? "slower" : "same";
        return `<li class="rrow${r.slow ? " slow" : ""}" title="${esc(r.name)}: ${r.inputs} inputs, ${msText(r.medianMsA)} to ${msText(r.medianMsB)}">
          <span class="rname">${esc(r.name)} <small>${r.inputs}</small></span>
          <span class="rbar" aria-hidden="true"><span class="one" style="left:${one}%"></span><span class="rfill ${cls}" style="left:${left}%;width:${Math.max(0.6, Math.abs(at - one))}%"></span></span>
          <span class="rval">${r.medianRatio}×</span>
        </li>`;
      })
      .join("") +
    `<li class="raxis" aria-hidden="true"><span></span><span class="ticks">${[0.05, 0.1, 0.3, 1, 2].map((t) => `<i style="left:${ratioAt(t)}%">${t}</i>`).join("")}</span><span></span></li>`;
  $("speed-arms").innerHTML = `Arm A is <code>${esc(paired.arms.a)}</code>, arm B is <code>${esc(paired.arms.b)}</code>. The strategy is <code>${esc(paired.strategy)}</code> on <code>${esc(paired.corpus)}</code>, ${paired.repeats} timed passes for each arm.`;
}

// ---- The select table ----

function mountSelect(): void {
  $("select-text").innerHTML = marked.parse(selectText, { async: false });
  $("select-origin").innerHTML = originHtml(select.origin);
  const label = (corpus: string): string => CORPUS_LABELS[corpus]?.label ?? corpus;
  $("leaves").innerHTML = select.leaves
    .map((leaf) => {
      const sets = [{ name: "Training", ...leaf.train }, ...leaf.test.map((t) => ({ name: label(t.corpus), wins: t.wins, of: t.of }))];
      const holds = sets.every((c) => pickHolds(leaf, c));
      const bars = sets
        .map((c) => {
          const share = c.of === 0 ? 0 : c.wins / c.of;
          return `<li><span class="lname">${esc(c.name)}</span><span class="lbar" aria-hidden="true"><span class="half"></span><span class="lfill" style="width:${share * 100}%"></span></span><span class="lval">${c.wins} of ${c.of}</span></li>`;
        })
        .join("");
      return `<li class="leaf ${leaf.member === "rows" ? "pick-rows" : "pick-max"}">
        <div class="lhead"><span class="lid">Leaf ${leaf.leaf}</span><span class="pick">picks <code>${esc(leaf.member)}</code></span><span class="chip ${holds ? "better" : "worse"}"><span aria-hidden="true">${holds ? "✓" : "✗"}</span> ${holds ? "Holds on the tests" : "Does not hold"}</span></div>
        <p class="path">${leaf.path.map((p) => `<span>${esc(stepText(p))}</span>`).join('<span class="arrow" aria-hidden="true">›</span>')}</p>
        <ul class="lbars" aria-label="Wins of maxrects-bl against rows">${bars}</ul>
      </li>`;
    })
    .join("");
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
  $("gap-note").innerHTML = `<b>${esc(meta.label)}</b> <code>${esc(snap.measure)}</code>: ${esc(meta.note)} The data: ${dataLine(snap.origin)}. ${inline(corpus?.note ?? "")} <code>${esc(snap.corpus)}</code>: ${snap.inputs} inputs in ${snap.cells.length} cells.`;
  $("gap-origin").innerHTML = originHtml(snap.origin);
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
      const path = s.points.length > 1 ? `<polyline class="line ${cls}" points="${s.points.map((p) => `${p.x},${p.y}`).join(" ")}"/>` : "";
      const dots = s.points.map((p) => `<circle class="dot ${cls}" cx="${p.x}" cy="${p.y}" r="5"><title>${esc(`${coverLabel(s.id)}, ${p.date}: ${percentText(p.share)} of the cells`)}</title></circle>`).join("");
      return path + dots;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The share of the covered cells of each measure, by week">${grid}${ticks}${lines}</svg>`;
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
        : ` The number "${COVERAGE_PRIOR_SCOPE}" gives each generator family its share of the inputs as its weight. ${esc(priorBasisText(l.prior) ?? "")} The effective pairs are the count of uniform pairs with the same precision.`
      : "");
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
    .map((p) => `<tr><th scope="row">${esc(p.date)}</th><td><code>${esc(p.corpus)}</code></td><td><code>${esc(p.commit)}</code></td>${l.measures.map((m) => `<td class="num">${p.shares[m.id] === undefined ? "" : percentText(p.shares[m.id]!)}${p.sharesByInput?.[m.id] === undefined ? "" : ` <small>(${percentText(p.sharesByInput[m.id]!)})</small>`}</td>`).join("")}</tr>`)
    .join("");
  $("coverage-table").innerHTML = `<thead><tr><th scope="col">Date</th><th scope="col">Corpus</th><th scope="col">Commit</th>${head}</tr></thead><tbody>${body}</tbody>`;
}

mountStrategies();
mountGaps();
mountSpeed();
mountSelect();
mountCoverage();
