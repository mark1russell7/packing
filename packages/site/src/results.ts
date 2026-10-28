// The results page: each strategy against `rows`, the paired speed test of k67 and the select table.
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
import { mountChrome } from "./chrome.ts";
import { CORPUS_LABELS, MEASURE_LABELS, parseSnapshot, type MeasureVerdict, type StrategySnapshot, type StrategySummary } from "./data.ts";
import { diffText, esc, inline, LABEL_LOOK, msText, originHtml } from "./format.ts";
import { divergingAt, labelCounts, parseVerdictHash, pickHolds, rankStrategies, ratioAt, scaleOf, stepText, verdictHash, verdictOf } from "./results-model.ts";
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

mountStrategies();
mountSpeed();
mountSelect();
