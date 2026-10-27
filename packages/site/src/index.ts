import { marked } from "marked";
import type { SortOrder } from "@mark1russell7/packing";
import aboutText from "../content/about.md?raw";
import leadText from "../content/lead.md?raw";
import { makeItem, makeItems, ORDERS, PRESETS, presetOf, runPacking, STRATEGIES, type Item, type Run, type Setting, type Strategy } from "./model.ts";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

/** This function escapes text for HTML. */
const esc = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]!);

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const ORDER_LABELS: Record<SortOrder, string> = {
  "height-desc": "Tallest first",
  "height-asc": "Shortest first",
  "width-desc": "Widest first",
  "area-desc": "Largest first",
  input: "List order",
};
const STRATEGY_LABELS: Record<Strategy, string> = { rows: "Rows", skyline: "Skyline" };

interface State {
  preset: string;
  count: number;
  seed: number;
  width: number;
  compare: boolean;
  settings: [Setting, Setting];
  items: Item[];
  selected: number | undefined;
  nextKey: number;
}

const DEFAULTS = { preset: "cards", count: 24, seed: 7, width: 640 } as const;

// The state of the page. The hash of the URL keeps the settings, but not the edits of the items.
const state: State = {
  ...DEFAULTS,
  compare: false,
  settings: [{ strategy: "rows", order: "height-desc" }, { strategy: "skyline", order: "height-desc" }],
  items: [],
  selected: undefined,
  nextKey: 0,
};

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const isStrategy = (s: string | undefined): s is Strategy => STRATEGIES.includes(s as Strategy);
const isOrder = (s: string | undefined): s is SortOrder => ORDERS.includes(s as SortOrder);

function readHash(): void {
  const p = new URLSearchParams(location.hash.slice(1));
  const int = (key: string, fallback: number, min: number, max: number): number => {
    const v = Number.parseInt(p.get(key) ?? "", 10);
    return Number.isFinite(v) ? clamp(v, min, max) : fallback;
  };
  state.preset = presetOf(p.get("p") ?? DEFAULTS.preset).id;
  state.count = int("n", DEFAULTS.count, 1, 80);
  state.seed = int("s", DEFAULTS.seed, 0, 999999);
  state.width = int("w", DEFAULTS.width, 160, 1200);
  state.compare = p.get("c") === "1";
  for (const [i, key] of (["a", "b"] as const).entries()) {
    const [strategy, order] = (p.get(key) ?? "").split(".");
    if (isStrategy(strategy)) state.settings[i]!.strategy = strategy;
    if (isOrder(order)) state.settings[i]!.order = order;
  }
}

function writeHash(): void {
  const [a, b] = state.settings;
  const p = new URLSearchParams({
    p: state.preset,
    n: String(state.count),
    s: String(state.seed),
    w: String(state.width),
    a: `${a.strategy}.${a.order}`,
    b: `${b.strategy}.${b.order}`,
    c: state.compare ? "1" : "0",
  });
  history.replaceState(null, "", `#${p.toString()}`);
}

function regenerate(): void {
  state.items = makeItems(state.preset, state.count, state.seed);
  state.nextKey = state.items.length;
  state.selected = undefined;
}

// ---- The text of the page ----

$("lead").innerHTML = marked.parse(leadText, { async: false });
$("about").innerHTML = marked.parse(aboutText, { async: false });

// ---- The theme: auto, light or dark ----

const THEMES = ["auto", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const themeButton = $<HTMLButtonElement>("theme");
function setTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset["theme"];
  else document.documentElement.dataset["theme"] = theme;
  themeButton.textContent = `Theme: ${theme}`;
  try {
    localStorage.setItem("packing-theme", theme);
  } catch {
    // A private window can refuse the storage. The theme then lasts only for this visit.
  }
}
let theme: Theme = "auto";
try {
  const saved = localStorage.getItem("packing-theme");
  if (saved === "light" || saved === "dark") theme = saved;
} catch {
  // No storage: the theme follows the system.
}
setTheme(theme);
themeButton.addEventListener("click", () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  setTheme(theme);
});

// ---- The controls of the items ----

const presetsEl = $("presets");
presetsEl.innerHTML = PRESETS.map((p) => `<button type="button" role="radio" data-preset="${p.id}">${esc(p.label)}</button>`).join("");
presetsEl.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLElement>("[data-preset]");
  if (!b) return;
  state.preset = b.dataset["preset"]!;
  regenerate();
  update();
});

const countEl = $<HTMLInputElement>("count");
countEl.addEventListener("input", () => {
  state.count = clamp(Number(countEl.value), 1, 80);
  regenerate();
  update();
});

const widthEl = $<HTMLInputElement>("width");
widthEl.addEventListener("input", () => {
  state.width = clamp(Number(widthEl.value), 160, 1200);
  update();
});

const seedEl = $<HTMLInputElement>("seed");
seedEl.addEventListener("change", () => {
  const v = Number.parseInt(seedEl.value, 10);
  if (!Number.isFinite(v)) return;
  state.seed = clamp(v, 0, 999999);
  regenerate();
  update();
});
$("reseed").addEventListener("click", () => {
  state.seed = Math.floor(Math.random() * 1000000);
  regenerate();
  update();
});

const compareEl = $<HTMLInputElement>("compare");
compareEl.addEventListener("change", () => {
  state.compare = compareEl.checked;
  update();
});

// ---- The layouts ----

interface Panel {
  root: HTMLElement;
  canvas: HTMLElement;
  svg: SVGSVGElement;
  strategy: HTMLElement;
  order: HTMLSelectElement;
  status: HTMLElement;
  metrics: HTMLElement;
  /** The size of one unit of the layout on the screen, in CSS pixels. */
  scale: number;
  run: Run | undefined;
}

const stagesEl = $("stages");
const panels: Panel[] = [0, 1].map((i) => {
  const root = document.createElement("article");
  root.className = "stage";
  root.innerHTML = `
    <header class="stage-head">
      <span class="tag" aria-hidden="true">${i === 0 ? "A" : "B"}</span>
      <div class="seg" role="radiogroup" aria-label="Strategy ${i === 0 ? "A" : "B"}">
        ${STRATEGIES.map((s) => `<button type="button" role="radio" data-strategy="${s}">${STRATEGY_LABELS[s]}</button>`).join("")}
      </div>
      <label class="order">Sort
        <select aria-label="Sort order ${i === 0 ? "A" : "B"}">
          ${ORDERS.map((o) => `<option value="${o}">${ORDER_LABELS[o]} (${o})</option>`).join("")}
        </select>
      </label>
    </header>
    <div class="canvas"><svg xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Layout ${i === 0 ? "A" : "B"}"></svg></div>
    <p class="status" role="status"></p>
    <dl class="metrics"></dl>`;
  stagesEl.append(root);
  const panel: Panel = {
    root,
    canvas: root.querySelector(".canvas")!,
    svg: root.querySelector("svg")!,
    strategy: root.querySelector(".seg")!,
    order: root.querySelector("select")!,
    status: root.querySelector(".status")!,
    metrics: root.querySelector(".metrics")!,
    scale: 1,
    run: undefined,
  };
  panel.strategy.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-strategy]");
    const s = b?.dataset["strategy"];
    if (!isStrategy(s)) return;
    state.settings[i]!.strategy = s;
    update();
  });
  panel.order.addEventListener("change", () => {
    if (isOrder(panel.order.value)) state.settings[i]!.order = panel.order.value;
    update();
  });
  wireCanvas(panel, i);
  return panel;
});

const coarse = matchMedia("(pointer: coarse)");

/** This function gives the fill of an item: a mix from the first color to the last color, by its rank. */
const fillOf = (rank: number, count: number): string => {
  const t = count > 1 ? Math.round(((rank - 1) / (count - 1)) * 100) : 0;
  return `color-mix(in oklab, var(--early), var(--late) ${t}%)`;
};

function drawPanel(panel: Panel, run: Run): void {
  const vbW = Math.max(run.width, run.right, 1);
  const vbH = Math.max(run.height, 40);
  const px = panel.canvas.clientWidth;
  panel.scale = px > 0 ? px / vbW : 1;
  const s = panel.scale;
  const count = run.placed.length;
  const parts: string[] = [];
  parts.push(`<rect class="well" x="0" y="0" width="${run.width}" height="${vbH}" />`);
  if (run.right > run.width) parts.push(`<line class="edge" x1="${run.width}" y1="0" x2="${run.width}" y2="${vbH}" vector-effect="non-scaling-stroke" />`);
  let selected = "";
  for (const p of run.placed) {
    if (!p.packed) continue;
    const isSel = p.key === state.selected;
    const font = 13 / s;
    const showLabel = Math.min(p.w, p.h) * s >= 18;
    const g = `<g class="item${isSel ? " sel" : ""}" data-key="${p.key}" tabindex="0" role="button" aria-pressed="${isSel}" aria-label="Item ${p.rank}, ${num.format(p.w)} by ${num.format(p.h)}">
      <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${3 / s}" style="fill:${fillOf(p.rank, count)}" vector-effect="non-scaling-stroke" />
      ${showLabel ? `<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="${font}" dominant-baseline="central" text-anchor="middle">${p.rank}</text>` : ""}
    </g>`;
    // The selected item goes last, so its outline and its handle are on top
    if (isSel) {
      const hs = (coarse.matches ? 26 : 16) / s;
      selected = `${g}<rect class="handle" data-handle="${p.key}" x="${p.x + p.w - hs / 2}" y="${p.y + p.h - hs / 2}" width="${hs}" height="${hs}" rx="${3 / s}" vector-effect="non-scaling-stroke"><title>Drag to resize</title></rect>`;
    } else parts.push(g);
  }
  parts.push(selected);
  panel.svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  panel.svg.innerHTML = parts.join("");
}

interface Measure {
  label: string;
  value: (r: Run) => number;
  text: (v: number) => string;
  note: string;
  /** 1: more is better, -1: less is better, 0: no direction. */
  better: 1 | -1 | 0;
}

const MEASURES: Measure[] = [
  { label: "Space covered", value: (r) => r.metrics.utilization, text: (v) => `${dec.format(v * 100)}%`, note: "The part of the outline that the items fill. More is denser.", better: 1 },
  { label: "Height", value: (r) => r.height, text: (v) => num.format(v), note: "The height that the container needs. Less is better.", better: -1 },
  { label: "Ragged right edge", value: (r) => r.metrics.raggedness, text: (v) => num.format(v), note: "The longest row less the shortest row. 0 is a straight edge.", better: -1 },
  { label: "Rows", value: (r) => r.metrics.rows.length, text: (v) => num.format(v), note: "The lines of items, from the top.", better: 0 },
  { label: "Outline shape", value: (r) => r.metrics.hullAspect, text: (v) => dec.format(v), note: "The width of the outline divided by its height.", better: 0 },
  { label: "Widest item", value: (r) => r.metrics.widestOverMedian, text: (v) => `${dec.format(v)}×`, note: "The widest item against the median width.", better: 0 },
];

const timeText = (ms: number): string => (ms <= 0 ? "under 0.1 ms" : ms < 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`);

function drawMetrics(panel: Panel, run: Run, base: Run | undefined): void {
  const rows = MEASURES.map((m) => {
    const v = m.value(run);
    let delta = "";
    if (base) {
      const d = v - m.value(base);
      if (Math.abs(d) > 1e-9) {
        const tone = m.better === 0 ? "" : d * m.better > 0 ? " good" : " bad";
        const sign = d > 0 ? "+" : "−";
        delta = `<span class="delta${tone}" title="Against layout A">${sign}${m.text(Math.abs(d))}</span>`;
      } else delta = `<span class="delta" title="Against layout A">same</span>`;
    }
    const meter = m.label === "Space covered" ? `<span class="meter" aria-hidden="true"><span style="width:${clamp(v * 100, 0, 100)}%"></span></span>` : "";
    return `<div class="m"><dt>${m.label}</dt><dd><b>${m.text(v)}</b>${delta}${meter}<small>${m.note}</small></dd></div>`;
  });
  rows.push(`<div class="m time"><dt>Packing time</dt><dd><b>${timeText(run.ms)}</b><small>This browser, this run. One call of <code>pack</code>.</small></dd></div>`);
  panel.metrics.innerHTML = rows.join("");
}

// ---- Selection, resize by drag, and keys ----

let drag: { panel: number; key: number; x0: number; y0: number; w0: number; h0: number; pointer: number } | undefined;
let frame = 0;
// A drag ends with a click on the layout. That click must not clear the selection.
let quietUntil = 0;
const schedule = (): void => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
};

const itemOf = (key: number | undefined): Item | undefined => state.items.find((i) => i.key === key);

function select(key: number | undefined): void {
  state.selected = key;
  render();
}

function wireCanvas(panel: Panel, index: number): void {
  const svg = panel.svg;
  svg.addEventListener("pointerdown", (e) => {
    const handle = (e.target as Element).closest<SVGElement>("[data-handle]");
    const item = itemOf(state.selected);
    if (!handle || !item) return;
    e.preventDefault();
    drag = { panel: index, key: item.key, x0: e.clientX, y0: e.clientY, w0: item.w, h0: item.h, pointer: e.pointerId };
    svg.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag || drag.pointer !== e.pointerId || drag.panel !== index) return;
    const item = itemOf(drag.key);
    if (!item) return;
    const s = panels[index]!.scale;
    item.w = clamp(Math.round(drag.w0 + (e.clientX - drag.x0) / s), 4, 2000);
    item.h = clamp(Math.round(drag.h0 + (e.clientY - drag.y0) / s), 4, 2000);
    schedule();
  });
  const end = (e: PointerEvent): void => {
    if (!drag || drag.pointer !== e.pointerId) return;
    drag = undefined;
    quietUntil = performance.now() + 400;
    document.body.classList.remove("dragging");
    render();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-handle]") || performance.now() < quietUntil) return;
    const g = (e.target as Element).closest<SVGElement>("[data-key]");
    select(g ? Number(g.dataset["key"]) : undefined);
  });
  svg.addEventListener("keydown", (e) => {
    const g = (e.target as Element).closest<SVGElement>("[data-key]");
    if (!g) return;
    const key = Number(g.dataset["key"]);
    const item = itemOf(key);
    if (!item) return;
    const step = e.shiftKey ? 1 : 10;
    let handled = true;
    if (e.key === "Enter" || e.key === " ") select(state.selected === key ? undefined : key);
    else if (e.key === "Delete" || e.key === "Backspace") removeItem(key);
    else if (e.key === "ArrowRight") resize(item, step, 0);
    else if (e.key === "ArrowLeft") resize(item, -step, 0);
    else if (e.key === "ArrowDown") resize(item, 0, step);
    else if (e.key === "ArrowUp") resize(item, 0, -step);
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    // The page draws the layout again, so the focus goes back to the same item
    panel.svg.querySelector<SVGElement>(`[data-key="${key}"]`)?.focus();
  });
}

function resize(item: Item, dw: number, dh: number): void {
  state.selected = item.key;
  item.w = clamp(item.w + dw, 4, 2000);
  item.h = clamp(item.h + dh, 4, 2000);
  render();
}

function removeItem(key: number): void {
  const i = state.items.findIndex((it) => it.key === key);
  if (i < 0) return;
  state.items.splice(i, 1);
  const next = state.items[Math.min(i, state.items.length - 1)];
  state.selected = next?.key;
  render();
}

function move(key: number, by: -1 | 1): void {
  const i = state.items.findIndex((it) => it.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= state.items.length) return;
  const [item] = state.items.splice(i, 1);
  state.items.splice(j, 0, item!);
  render();
}

// ---- The editor of the selected item ----

const selTitle = $("sel-title");
const selTools = $("sel-tools");
const selW = $<HTMLInputElement>("sel-w");
const selH = $<HTMLInputElement>("sel-h");
const earlierEl = $<HTMLButtonElement>("earlier");
const laterEl = $<HTMLButtonElement>("later");

$("add").addEventListener("click", () => {
  const item = makeItem(state.preset, state.seed, state.nextKey++);
  state.items.push(item);
  state.selected = item.key;
  render();
});
$("remove").addEventListener("click", () => {
  if (state.selected !== undefined) removeItem(state.selected);
});
earlierEl.addEventListener("click", () => {
  if (state.selected !== undefined) move(state.selected, -1);
});
laterEl.addEventListener("click", () => {
  if (state.selected !== undefined) move(state.selected, 1);
});
for (const [el, dim] of [[selW, "w"], [selH, "h"]] as const) {
  el.addEventListener("input", () => {
    const item = itemOf(state.selected);
    const v = Number.parseInt(el.value, 10);
    if (!item || !Number.isFinite(v) || v < 4) return;
    item[dim] = clamp(v, 4, 2000);
    render();
  });
}

function drawEditor(): void {
  $("count-out").textContent = String(state.items.length);
  const i = state.items.findIndex((it) => it.key === state.selected);
  const item = state.items[i];
  if (!item) {
    state.selected = undefined;
    selTitle.textContent = `${state.items.length} items. No item selected.`;
    selTools.hidden = true;
    return;
  }
  selTitle.textContent = `Item ${i + 1} of ${state.items.length}`;
  selTools.hidden = false;
  // Do not change a number while the user types in it
  if (document.activeElement !== selW) selW.value = String(item.w);
  if (document.activeElement !== selH) selH.value = String(item.h);
  earlierEl.disabled = i === 0;
  laterEl.disabled = i === state.items.length - 1;
}

// ---- Draw ----

function render(): void {
  const active = state.compare ? panels : panels.slice(0, 1);
  stagesEl.classList.toggle("two", state.compare);
  panels[1]!.root.hidden = !state.compare;
  let base: Run | undefined;
  for (const [i, panel] of active.entries()) {
    const setting = state.settings[i]!;
    const run = runPacking(state.items, state.width, setting);
    panel.run = run;
    panel.root.querySelector(".tag")!.classList.toggle("on", state.compare);
    for (const b of panel.strategy.querySelectorAll<HTMLElement>("[data-strategy]")) b.setAttribute("aria-checked", String(b.dataset["strategy"] === setting.strategy));
    panel.order.value = setting.order;
    drawPanel(panel, run);
    const over = run.placed.filter((p) => p.x + p.w > run.width).length;
    panel.status.textContent = over > 0 ? `${over} ${over === 1 ? "item is" : "items are"} wider than the container. ${over === 1 ? "It goes" : "They go"} past the dashed edge.` : "";
    drawMetrics(panel, run, i === 1 ? base : undefined);
    base ??= run;
  }
  drawEditor();
}

function update(): void {
  for (const b of presetsEl.querySelectorAll<HTMLElement>("[data-preset]")) b.setAttribute("aria-checked", String(b.dataset["preset"] === state.preset));
  $("preset-hint").textContent = presetOf(state.preset).hint;
  countEl.value = String(state.count);
  widthEl.value = String(state.width);
  $("width-out").textContent = num.format(state.width);
  seedEl.value = String(state.seed);
  compareEl.checked = state.compare;
  writeHash();
  render();
}

readHash();
regenerate();
update();

// The scale of the labels and of the handle follows the width of the layout on the screen
let lastWidth = 0;
new ResizeObserver(() => {
  const w = panels[0]!.canvas.clientWidth;
  if (w !== lastWidth) {
    lastWidth = w;
    schedule();
  }
}).observe(stagesEl);
addEventListener("hashchange", () => {
  readHash();
  regenerate();
  update();
});
