// The page of the strategy cards (roadmap item k74, part 1): one card for each strategy of the registry. The page builds
// each card at build time from the registry, the entries of the benchmark, the catalog and the committed snapshots.

import { composites, strategies } from "@mark1russell7/packing";
import { ENTRIES } from "@mark1russell7/packing/bench/entries";
import catalogText from "../../../docs/research/CATALOG.md?raw";
import screenJson from "../data/strategies-pack-screen-v1.json?raw";
import freeJson from "../data/strategies-pack-free-v1.json?raw";
import test1Json from "../data/strategies-pack-select-v1.json?raw";
import test2Json from "../data/strategies-pack-select-v2.json?raw";
import {
  bibText,
  buildCards,
  byFamily,
  cellHtml,
  escapeHtml as esc,
  parseCatalog,
  passes,
  sourcesOf,
  STAGE_LABELS,
  STAGES,
  STRIP_MEASURES,
  type CardEntry,
  type CatalogRow,
  type Stage,
  type StrategyCard,
  type StripLabel,
} from "./cards-model.ts";
import { mountChrome } from "./chrome.ts";
import { CORPUS_LABELS, MEASURE_LABELS, parseSnapshot } from "./data.ts";
import { LABEL_LOOK } from "./format.ts";
import "./style.css";
import "./pages.css";
import "./cards.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const CATALOG_URL = "https://github.com/mark1russell7/packing/blob/main/docs/research/CATALOG.md";
const catalog = parseCatalog(catalogText);
const snapshots = [test2Json, test1Json, screenJson, freeJson].map((t) => parseSnapshot(t, "strategies"));
const cards = buildCards({ strategies, composites, entries: ENTRIES, catalog, snapshots });

mountChrome($("links"), "strategies");

/** This function gives the HTML of a text of the catalog or of the code. `cellHtml` escapes all of its text. */
const md = (text: string): string => cellHtml(text, CATALOG_URL);

// ---- The parts of a card ----

/** The look of each state of a verdict strip */
const STRIP_LOOK: Record<StripLabel, { mark: string; word: string; cls: string }> = {
  ...LABEL_LOOK,
  baseline: { mark: "◎", word: "Baseline", cls: "base" },
};

/** This function gives the HTML of a source cell, with a link to the URL of each entry of the bibliography that it names. */
function sourceHtml(source: string): string {
  let html = "";
  let at = 0;
  for (const b of sourcesOf(source, catalog.bibliography)) {
    const start = source.indexOf(b.key, at);
    if (start < 0) continue;
    const title = esc(`${b.key}. ${bibText(b)}`);
    const label = esc(b.key);
    html += md(source.slice(at, start));
    html += b.url === undefined ? `<abbr title="${title}">${label}</abbr>` : `<a href="${esc(b.url)}" title="${title}">${label}</a>`;
    at = start + b.key.length;
  }
  return html + md(source.slice(at));
}

/** This function gives the HTML of a guarantee. A bound gets the class `bound`, and an unverified bound gets the class `unverified`. */
function guaranteeHtml(g: string): string {
  if (g === "—" || g === "") return `<span class="sc-none">none known</span>`;
  const cls = /unverified/.test(g) ? "sc-bound unverified" : "sc-bound";
  return `<span class="${cls}">${md(g)}</span>`;
}

/** This function gives the HTML of the facts of one method: the source, the cost, the guarantee and the goal. */
function factsHtml(facts: [string, string][]): string {
  return `<dl class="sc-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

/** This function gives the HTML of one catalog row of a card. The first row is open. */
function methodHtml(r: CatalogRow, open: boolean): string {
  const anchor = `${CATALOG_URL}#${r.section.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")}`;
  return `<details class="sc-method"${open ? " open" : ""}>
    <summary><span class="sc-mname">${md(r.name)}</span> <code>${esc(r.id)}</code></summary>
    <p>${md(r.rule)}</p>
    ${factsHtml([
      ["Source", sourceHtml(r.source)],
      ["Cost", md(r.cost)],
      ["Guarantee", guaranteeHtml(r.guarantee)],
      ["Goal", md(r.goal)],
    ])}
    <p class="sc-from">From the table <a href="${anchor}">${esc(r.section)}</a> of the catalog.</p>
  </details>`;
}

/** This function gives the HTML of the methods of a card, or the rule and the cost of a strategy with no catalog row. */
function methodsHtml(c: StrategyCard): string {
  if (c.rows.length > 0) return c.rows.map((r, i) => methodHtml(r, i === 0)).join("");
  return `<div class="sc-method sc-own">
    <p>${md(c.rule ?? "")}</p>
    ${factsHtml([
      ["Source", "this repository"],
      ["Cost", md(c.cost ?? "")],
      ["Guarantee", guaranteeHtml("—")],
    ])}
  </div>`;
}

/** This function gives the HTML of the options of a card. */
function optionsHtml(c: StrategyCard): string {
  if (c.options.length === 0) return `<p class="hint">No options.</p>`;
  const one = (o: StrategyCard["options"][number]): string =>
    `<li><code class="sc-oname">${esc(o.name)}</code> <span class="sc-type">${esc(o.type)}</span> ${o.value === null ? `<span class="sc-nodef">no default</span>` : `<span class="sc-def">default <code>${esc(o.value)}</code></span>`}<br /><span class="sc-note">${md(o.note)}</span></li>`;
  return `<ul class="sc-opts">${c.options.map(one).join("")}</ul>`;
}

/** This function gives the HTML of the supported cells of a card: each dimension with each value, on or off. */
function cellsHtml(c: StrategyCard): string {
  const one = (d: StrategyCard["cells"][number]): string =>
    `<div><dt>${esc(d.label)}</dt><dd>${d.values.map((v) => `<span class="sc-cell${v.on ? " on" : ""}">${v.on ? "" : `<span class="sr">not </span>`}${esc(v.value)}</span>`).join("")}</dd></div>`;
  return `<dl class="sc-cells">${c.cells.map(one).join("")}</dl>`;
}

/** This function gives the HTML of the verdict strip of an entry: one row for each corpus, one cell for each measure. */
function stripHtml(e: CardEntry): string {
  const head = STRIP_MEASURES.map((m) => `<th scope="col">${esc(MEASURE_LABELS[m]?.label ?? m)}</th>`).join("");
  const rows = e.strip
    .map((r) => {
      const cells = r.cells
        .map((x) => {
          const look = STRIP_LOOK[x.label];
          const name = MEASURE_LABELS[x.measure]?.label ?? x.measure;
          return `<td class="sc-v ${look.cls}" title="${esc(`${name}: ${look.word}. ${x.summary}`)}"><span aria-hidden="true">${look.mark}</span><span class="sr">${esc(name)}: ${esc(look.word)}</span></td>`;
        })
        .join("");
      return `<tr><th scope="row" title="${esc(CORPUS_LABELS[r.corpus]?.note ?? r.corpus)}">${esc(r.label)}</th>${cells}</tr>`;
    })
    .join("");
  return `<table class="sc-strip"><caption class="sr">The verdicts of ${esc(e.id)} against rows on each corpus</caption><thead><tr><th scope="col"><span class="sr">Corpus</span></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** This function gives the HTML of the named entries of a card. An entry with the id of a card has no anchor of its own. */
function entriesHtml(c: StrategyCard, taken: ReadonlySet<string>): string {
  if (c.entries.length === 0) return `<p class="hint">No entry of the benchmark uses this strategy.</p>`;
  const one = (e: CardEntry): string => {
    const id = taken.has(e.id) ? "" : ` id="${esc(e.id)}"`;
    const opts = e.options === "{}" ? "the defaults" : `<code>${esc(e.options)}</code>`;
    const base = e.base === undefined ? "" : ` · activation base <a href="#${esc(e.base)}"><code>${esc(e.base)}</code></a>`;
    const row = e.row === undefined ? "" : ` · catalog <span class="sc-mname">${md(e.row.name)}</span>`;
    return `<li class="sc-entry"${id}>
      <div class="sc-ehead"><a href="#${esc(e.id)}"><code>${esc(e.id)}</code></a></div>
      <p class="sc-emeta">Options: ${opts}${base}${row}</p>
      ${stripHtml(e)}
    </li>`;
  };
  return `<ul class="sc-entries">${c.entries.map(one).join("")}</ul>`;
}

/** This function gives the HTML of one card. */
function cardHtml(c: StrategyCard, taken: ReadonlySet<string>): string {
  const stage = c.stage === undefined ? "no stage" : STAGE_LABELS[c.stage].label;
  return `<article class="sc-card" id="${esc(c.id)}" data-family="${esc(c.family)}" data-stage="${esc(c.stage ?? "")}" aria-labelledby="${esc(c.id)}-h">
    <header class="sc-head">
      <h3 id="${esc(c.id)}-h"><a href="#${esc(c.id)}" class="sc-anchor"><code>${esc(c.id)}</code></a></h3>
      <p class="sc-name">${md(c.name)}</p>
      <div class="sc-tags">
        <span class="sc-tag stage">${esc(stage)}</span>
        <span class="sc-tag">family ${esc(c.family)}</span>
        ${c.composite ? `<span class="sc-tag">composite</span>` : ""}
        ${c.deterministic ? `<span class="sc-tag">deterministic</span>` : ""}
      </div>
    </header>
    <section class="sc-part"><h4>In the literature</h4>${methodsHtml(c)}</section>
    <section class="sc-part"><h4>Options</h4>${optionsHtml(c)}</section>
    <section class="sc-part"><h4>Supported cells</h4>${cellsHtml(c)}</section>
    <section class="sc-part"><h4>Named entries and verdicts against <code>rows</code></h4>${entriesHtml(c, taken)}</section>
  </article>`;
}

// ---- The page ----

const taken = new Set(cards.map((c) => c.id));
const groups = byFamily(cards);
$("cards").innerHTML = groups
  .map(([family, list]) => `<section class="sc-family" data-family="${esc(family)}" aria-labelledby="family-${esc(family)}"><h2 id="family-${esc(family)}">Family <code>${esc(family)}</code></h2><div class="sc-grid">${list.map((c) => cardHtml(c, taken)).join("")}</div></section>`)
  .join("");

$("legend").innerHTML = [
  ...(["better", "worse", "depends on the mix", "no verdict", "not measured", "baseline"] as StripLabel[]).map((l) => {
    const look = STRIP_LOOK[l];
    const note =
      l === "baseline" ? "The entry is the baseline of the corpus." : l === "not measured" ? "The corpus has no verdict of the entry." : `The verdict of the snapshot is "${l}".`;
    return `<li><span class="sc-v ${look.cls} sc-key" aria-hidden="true">${look.mark}</span> <b>${esc(look.word)}</b>: ${esc(note)}</li>`;
  }),
  `<li>A guarantee is a bound of a source against the best result <code>OPT</code>. A bound in the color of a warning is unverified.</li>`,
  `<li>The <a href="../results/">results</a> page gives the numbers of each verdict.</li>`,
].join("");

let family = "all";
let stage: Stage | "all" = "all";

/** This function shows the cards that pass the filters, and updates the buttons. */
function apply(): void {
  let shown = 0;
  for (const c of cards) {
    const ok = passes(c, family, stage);
    $(c.id).hidden = !ok;
    if (ok) shown++;
  }
  for (const g of document.querySelectorAll<HTMLElement>(".sc-family")) g.hidden = g.querySelector(".sc-card:not([hidden])") === null;
  $("empty").hidden = shown > 0;
  for (const b of $("families").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(b.dataset["family"] === family));
  for (const b of $("stages").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["stage"] === stage));
  $("stage-note").innerHTML = stage === "all" ? "Each stage shows the count of its strategies." : md(STAGE_LABELS[stage].note);
}

const count = (s: Stage | "all"): number => cards.filter((c) => passes(c, "all", s)).length;
$("stages").innerHTML = [
  `<li><button type="button" class="pipe all" data-stage="all"><b>All</b><span>${cards.length}</span></button></li>`,
  ...STAGES.map((s) => `<li><button type="button" class="pipe" data-stage="${s}"${count(s) === 0 ? ` title="${esc(STAGE_LABELS[s].note)}"` : ""}><b>${esc(STAGE_LABELS[s].label)}</b><span>${count(s)}</span></button></li>`),
].join("");
$("families").innerHTML = [
  `<button type="button" role="radio" data-family="all">All</button>`,
  ...groups.map(([f, list]) => `<button type="button" role="radio" data-family="${esc(f)}">${esc(f)} <small>${list.length}</small></button>`),
].join("");

$("stages").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (b === null) return;
  stage = (b.dataset["stage"] ?? "all") as Stage | "all";
  apply();
});
$("families").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (b === null) return;
  family = b.dataset["family"] ?? "all";
  apply();
});

/** This function shows the card or the entry of the hash of the address. A filter that hides it goes back to `all`. */
function follow(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id === "") return;
  const el = document.getElementById(id);
  if (el === null || el.closest("#cards") === null) return;
  if (el.closest("[hidden]") !== null) {
    family = "all";
    stage = "all";
    apply();
  }
  el.scrollIntoView({ block: "start" });
}

apply();
window.addEventListener("hashchange", follow);
follow();
