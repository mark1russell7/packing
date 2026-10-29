// The compare page: one input, packed with each entry of `ENTRIES` of the benchmark, side by side. A circle input also
// packs with the strategies for circles. The entries pack one at a time, so the page stays responsive. The hash of the URL
// keeps the input and the sort.

import screenJson from "../data/strategies-pack-screen-v1.json?raw";
import freeJson from "../data/strategies-pack-free-v1.json?raw";
import test1Json from "../data/strategies-pack-select-v1.json?raw";
import test2Json from "../data/strategies-pack-select-v2.json?raw";
import type { BenchEntry } from "@mark1russell7/packing/bench/entries";
import { mountChrome } from "./chrome.ts";
import {
  bestIds,
  boardInput,
  COMPARE_ENTRIES,
  COMPARE_MEASURES,
  drawingSvg,
  entriesFor,
  presetInput,
  runEntry,
  sortResults,
  valueText,
  type CompareInput,
  type EntryResult,
  type SortKey,
} from "./compare-model.ts";
import {
  controlsHtml,
  controlValue,
  DEFAULT_FAMILY,
  dimensionControls,
  dimensionText,
  familyKey,
  familyOf,
  familyOptionsHtml,
  readDimensions,
  sliderValue,
  withDimension,
  writeDimensions,
  type DimensionValues,
} from "./corpus-input.ts";
import { CORPUS_LABELS, parseSnapshot } from "./data.ts";
import { esc, msText } from "./format.ts";
import { PRESETS, presetOf } from "./model.ts";
import { verdictHash, verdictSnapshot } from "./results-model.ts";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

mountChrome($("links"), "compare");

const snapshots = [test2Json, test1Json, screenJson, freeJson].map((t) => parseSnapshot(t, "strategies"));
const resultsBase = `${import.meta.env.BASE_URL}results/`;

type Source = "board" | "demo";

interface State {
  source: Source;
  generator: string;
  params: DimensionValues;
  seed: number;
  preset: string;
  count: number;
  width: number;
  packSeed: number;
  sort: SortKey;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const state: State = {
  source: "board",
  generator: DEFAULT_FAMILY,
  params: {},
  seed: 1,
  preset: "cards",
  count: 24,
  width: 640,
  packSeed: 0,
  sort: "pack.fill",
};

const SORT_KEYS: { key: SortKey; label: string }[] = [
  ...COMPARE_MEASURES.map((m) => ({ key: m.id as SortKey, label: m.label })),
  { key: "ms", label: "Time" },
  { key: "entry", label: "Entry order" },
];
const isSortKey = (k: string | null): k is SortKey => SORT_KEYS.some((s) => s.key === k);

// ---- The hash ----

function readHash(): void {
  const p = new URLSearchParams(location.hash.slice(1));
  const int = (key: string, fallback: number, min: number, max: number): number => {
    const v = Number.parseInt(p.get(key) ?? "", 10);
    return Number.isFinite(v) ? clamp(v, min, max) : fallback;
  };
  state.source = p.get("src") === "demo" ? "demo" : "board";
  state.generator = familyKey(familyOf(p.get("g") ?? state.generator));
  state.params = readDimensions(state.generator, (k) => p.get(k));
  state.seed = int("s", 1, 0, 999999);
  state.preset = presetOf(p.get("p") ?? "cards").id;
  state.count = int("n", 24, 1, 200);
  state.width = int("w", 640, 160, 1200);
  state.packSeed = int("ps", 0, 0, 999999);
  const sort = p.get("sort");
  state.sort = isSortKey(sort) ? sort : "pack.fill";
}

function writeHash(): void {
  const p = new URLSearchParams({ src: state.source });
  if (state.source === "board") {
    p.set("g", state.generator);
    writeDimensions(p, state.params);
    p.set("s", String(state.seed));
  } else {
    p.set("p", state.preset);
    p.set("n", String(state.count));
    p.set("w", String(state.width));
    p.set("s", String(state.seed));
  }
  if (state.packSeed !== 0) p.set("ps", String(state.packSeed));
  p.set("sort", state.sort);
  history.replaceState(null, "", `#${p.toString()}`);
}

// ---- The input controls ----

const paramsEl = $("params");

function drawParams(): void {
  for (const b of $("source").querySelectorAll<HTMLElement>("[data-source]")) b.setAttribute("aria-checked", String(b.dataset["source"] === state.source));
  if (state.source === "board") {
    const dims = controlsHtml(dimensionControls(state.generator, state.params), "cmp");
    paramsEl.innerHTML = `<label class="opt">Family<select id="generator">${familyOptionsHtml(state.generator)}</select></label><label class="opt">Seed<input type="number" id="seed" min="0" max="999999" step="1" value="${state.seed}" /></label>${dims}`;
    $<HTMLSelectElement>("generator").value = state.generator;
  } else {
    const presets = PRESETS.map((x) => `<option value="${esc(x.id)}"${x.id === state.preset ? " selected" : ""}>${esc(x.label)}</option>`).join("");
    paramsEl.innerHTML = `<label class="opt">Preset<select id="preset">${presets}</select></label>
      <label class="opt">Items<input type="number" id="count" min="1" max="200" step="1" value="${state.count}" /></label>
      <label class="opt">Width<input type="number" id="width" min="160" max="1200" step="10" value="${state.width}" /></label>
      <label class="opt">Seed<input type="number" id="seed" min="0" max="999999" step="1" value="${state.seed}" /></label>`;
  }
}

$("source").addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLElement>("[data-source]");
  const s = b?.dataset["source"];
  if (s !== "board" && s !== "demo") return;
  state.source = s;
  drawParams();
  start();
});

paramsEl.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const int = (min: number, max: number, fallback: number): number => {
    const v = Number.parseInt(el.value, 10);
    return Number.isFinite(v) ? clamp(v, min, max) : fallback;
  };
  if (el.id === "generator") {
    state.generator = el.value;
    state.params = {};
    drawParams();
  } else if (el.id === "seed") state.seed = int(0, 999999, state.seed);
  else if (el.id === "preset") state.preset = el.value;
  else if (el.id === "count") state.count = int(1, 200, state.count);
  else if (el.id === "width") state.width = int(160, 1200, state.width);
  else if (el.dataset["dim"] !== undefined) {
    const v = controlValue(state.generator, el);
    if (v !== undefined) state.params = withDimension(state.generator, state.params, v.name, v.value);
    // A dimension can turn another dimension on or off, so the controls draw again.
    drawParams();
  }
  start();
});

// A slider shows its value while it moves. The page packs again when the slider stops.
paramsEl.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const name = el.dataset["dim"];
  if (el.type !== "range" || name === undefined) return;
  const d = familyOf(state.generator).dimensions.find((x) => x.name === name);
  const out = paramsEl.querySelector<HTMLOutputElement>(`output[data-out="${CSS.escape(name)}"]`);
  if (d !== undefined && out !== null) out.textContent = dimensionText(sliderValue(d, Number(el.value)));
});

const packSeedEl = $<HTMLInputElement>("pack-seed");
packSeedEl.addEventListener("change", () => {
  const v = Number.parseInt(packSeedEl.value, 10);
  state.packSeed = Number.isFinite(v) ? clamp(v, 0, 999999) : 0;
  start();
});

const sortEl = $<HTMLSelectElement>("sort");
sortEl.innerHTML = SORT_KEYS.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("");
sortEl.addEventListener("change", () => {
  if (isSortKey(sortEl.value)) state.sort = sortEl.value;
  writeHash();
  drawCards();
});

$("measure-notes").innerHTML = [
  ...COMPARE_MEASURES.map((m) => `<li><b>${esc(m.label)}</b> <code>${esc(m.id)}</code>: ${esc(m.note)}</li>`),
  `<li><b>Time</b>: the time of one call of <code>packWith</code> in this browser. Less is better.</li>`,
].join("");

// ---- The runs ----

let input: CompareInput | undefined;
let inputError: string | undefined;
let results: EntryResult[] = [];
/** The entries of the input: `COMPARE_ENTRIES`, and the shape entries that support it. */
let entries: readonly BenchEntry[] = COMPARE_ENTRIES;
let token = 0;

/** This function makes the input of the state. A bad parameter gives the text of the error. */
function makeInput(): void {
  try {
    input = state.source === "board" ? boardInput(state.generator, state.params, state.seed) : presetInput(state.preset, state.count, state.width, state.seed);
    inputError = undefined;
  } catch (e) {
    input = undefined;
    inputError = e instanceof Error ? e.message : String(e);
  }
}

/** This function packs the input with each entry, one entry for each frame of the page. A new start stops an old one. */
function start(): void {
  writeHash();
  packSeedEl.value = String(state.packSeed);
  sortEl.value = state.sort;
  makeInput();
  drawInputNote();
  entries = input === undefined ? COMPARE_ENTRIES : entriesFor(input.input);
  results = [];
  const mine = ++token;
  drawCards();
  if (input === undefined) return;
  const current = input;
  let next = 0;
  const step = (): void => {
    if (mine !== token) return;
    const entry = entries[next++];
    if (entry === undefined) return;
    results.push(runEntry(entry, current.input, state.packSeed));
    drawCards();
    if (next < entries.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

function drawInputNote(): void {
  const note = $("input-note");
  if (input === undefined) {
    note.innerHTML = `This input is not valid: ${esc(inputError ?? "")}`;
    return;
  }
  const c = input.input.container;
  const size = c.fixed === "none" ? "a free size" : c.fixed === "size" ? `a fixed size ${c.w} × ${c.h}` : c.fixed === "width" ? `a fixed width ${c.w}` : `a fixed height ${c.h}`;
  const shape = c.shape === undefined ? "" : `, the shape ${c.shape.kind}`;
  const obstacles = input.input.obstacles?.length ?? 0;
  const gap = input.input.gap === undefined ? "" : `, a gap of ${input.input.gap}`;
  note.innerHTML = `<code>${esc(input.id)}</code>, the family <code>${esc(input.family)}</code>: ${input.input.items.length} boxes, ${size}${shape}, ${obstacles} ${obstacles === 1 ? "obstacle" : "obstacles"}${gap}.`;
}

/** This function gives the link to the verdict of an entry on the results page, or a note when no snapshot has one. */
function verdictLink(id: string): string {
  const prefer = input?.input.container.fixed === "none" ? ["pack-free-v1"] : ["pack-screen-v1"];
  const snap = verdictSnapshot(snapshots, id, prefer);
  if (snap === undefined) {
    const baseline = snapshots.some((s) => s.baseline === id);
    return `<span class="hint">${baseline ? "The baseline of the results page" : "No verdict on the results page"}</span>`;
  }
  const corpus = CORPUS_LABELS[snap.corpus]?.label ?? snap.corpus;
  return `<a href="${resultsBase}${verdictHash(snap.corpus, id)}">The verdict on ${esc(corpus)}</a>`;
}

function drawCards(): void {
  const done = results.length;
  const total = entries.length;
  $("progress").textContent = input === undefined ? "" : done < total ? `Packing ${done + 1} of ${total} strategies.` : `${total} strategies packed.`;
  const unsupported = results.filter((r) => r.unsupported).length;
  const failed = results.filter((r) => r.error !== undefined && !r.unsupported).length;
  const fillBest = bestIds(results, "pack.fill");
  const best = results.find((r) => fillBest.has(r.entry.id));
  const fillM = COMPARE_MEASURES.find((m) => m.id === "pack.fill")!;
  $("summary").innerHTML = `
    <div class="tile"><b>${done} of ${total}</b><span>strategies packed</span></div>
    <div class="tile unmeasured"><b>${unsupported}</b><span>not supported for this input</span></div>
    ${failed > 0 ? `<div class="tile worse"><b>${failed}</b><span>stop with an error</span></div>` : ""}
    <div class="tile better"><b>${best?.measures?.["pack.fill"] === undefined ? "–" : valueText(fillM, best.measures["pack.fill"])}</b><span>best fill${fillBest.size > 0 ? `: ${[...fillBest].map((x) => `<code>${esc(x)}</code>`).join(", ")}` : ""}</span></div>`;

  const bests = new Map<string, Set<string>>([...COMPARE_MEASURES.map((m) => [m.id, bestIds(results, m.id)] as const), ["ms", bestIds(results, "ms")]]);
  const pending = entries.slice(done).map((e) => `<li class="ccard pending"><header><code>${esc(e.id)}</code></header><p class="hint">Waiting to pack.</p></li>`);
  const cards = sortResults(results, state.sort).map((r) => card(r, bests));
  $("cards").innerHTML = [...cards, ...pending].join("");
}

function card(r: EntryResult, bests: Map<string, Set<string>>): string {
  const id = r.entry.id;
  const head = `<header><code class="cname">${esc(id)}</code><small>${esc(r.entry.strategy)}</small></header>`;
  if (r.output === undefined) {
    const text = r.unsupported ? "Not supported for this input." : "The strategy stops with an error.";
    return `<li class="ccard ${r.unsupported ? "unsupported" : "failed"}">${head}<p class="cstate">${text}</p><p class="hint">${esc(r.error ?? "")}</p>${verdictLink(id)}</li>`;
  }
  const wins = [...bests].filter(([, set]) => set.has(id)).map(([key]) => (key === "ms" ? "Time" : (COMPARE_MEASURES.find((m) => m.id === key)?.label ?? key)));
  const badges = wins.map((w) => `<span class="cbest">Best ${esc(w.toLowerCase())}</span>`).join("");
  const fillM = COMPARE_MEASURES.find((m) => m.id === "pack.fill")!;
  const fill = r.measures?.["pack.fill"];
  const rows = COMPARE_MEASURES.map((m) => {
    const v = r.measures?.[m.id];
    const isBest = bests.get(m.id)?.has(id) === true;
    return `<div class="${isBest ? "best" : ""}"><dt title="${esc(m.note)}">${esc(m.label)}</dt><dd>${v === undefined || !Number.isFinite(v) ? "–" : valueText(m, v)}${isBest ? ` <span aria-label="best">★</span>` : ""}</dd></div>`;
  }).join("");
  const label = `The layout of ${id}`;
  return `<li class="ccard">${head}
    <div class="cdraw">${input === undefined ? "" : drawingSvg(input.input, r.output, esc(label))}</div>
    <p class="cfill"><b>${fill === undefined ? "–" : valueText(fillM, fill)}</b> fill <span class="${bests.get("ms")?.has(id) ? "best" : ""}">${msText(r.ms)}</span></p>
    ${badges === "" ? "" : `<p class="cbadges">${badges}</p>`}
    <dl class="cmeasures">${rows}</dl>
    ${verdictLink(id)}
  </li>`;
}

readHash();
drawParams();
start();
addEventListener("hashchange", () => {
  readHash();
  drawParams();
  start();
});
