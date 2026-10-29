import {
  cellOf,
  measure,
  packFree,
  packingMetrics,
  packWith,
  Rect,
  SORT_ORDERS,
  strategy as registryStrategy,
  UnsupportedCell,
  type FreeWidthTry,
  type Item as PackItem,
  type LayoutMeasures,
  type Obstacle,
  type PackInput,
  type PackingMetrics,
  type PackOutput,
  type Region,
  type SortOrder,
} from "@mark1russell7/packing";
import { DEMO_IDS, packOptions, type OptionValues } from "./options.ts";
import { regionBounds } from "./region.ts";

/** An item of the demo. `key` identifies it. Its place in the list is its input rank. A circle has the same width and height. */
export interface Item {
  key: number;
  w: number;
  h: number;
  /** The value `true` when the item is a circle in its box. */
  circle?: boolean;
}

/** The id of a strategy of the registry. */
export type Strategy = string;

/** This constant lists each strategy of the demo: each id of the registry, also the composite strategies. */
export const STRATEGIES: readonly Strategy[] = DEMO_IDS;

/** The strategies that a free width search of `packFree` wraps. Only these show the chart of the search. */
export const SEARCH_STRATEGIES: readonly string[] = ["rows", "skyline", "shelf", "maxrects", "guillotine"];

/** This constant lists each sort order of the package. */
export const ORDERS: readonly SortOrder[] = SORT_ORDERS;

/** The width mode of a layout. `fixed` uses the width of the container. `free` finds a width with `packFree`. */
export type WidthMode = "fixed" | "free";

/** This constant lists each width mode of the demo. */
export const WIDTH_MODES: readonly WidthMode[] = ["fixed", "free"];

/**
 * The settings of one packing: a strategy of the registry, the values of its option controls and a width mode. A missing
 * width mode is `fixed`. A missing value of an option uses the start value of its control.
 */
export interface Setting {
  strategy: Strategy;
  options?: OptionValues;
  mode?: WidthMode;
}

/** The target of a free width: the aspect (the width divided by the height) and the weight of the aspect error. */
export interface FreeTarget {
  aspect: number;
  weight: number;
}

/** This constant is the default target of a free width: a square, with the weight 1. */
export const DEFAULT_TARGET: FreeTarget = { aspect: 1, weight: 1 };

/** An aspect preset of the free width. */
export interface AspectPreset {
  label: string;
  aspect: number;
}

/** This constant lists the aspect presets of the free width. The page adds the aspect of the screen. */
export const ASPECT_PRESETS: readonly AspectPreset[] = [
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "16:9", aspect: 16 / 9 },
  { label: "3:4", aspect: 3 / 4 },
  { label: "9:16", aspect: 9 / 16 },
];

/** The result of the width search of `packFree`. */
export interface FreeRun {
  /** The target of the search. */
  target: FreeTarget;
  /** The aspect of the bounding box: the width divided by the height. */
  aspect: number;
  /** The area of the items divided by the area of the bounding box. */
  fill: number;
  /** The distance from the target aspect on a log scale. */
  aspectError: number;
  /** The objective of the chosen width. Lower is better. */
  objective: number;
  /** Each width that the search tried, in the order of the search. */
  tried: FreeWidthTry[];
  /** The index in `tried` of the chosen width. */
  chosen: number;
}

/** A placed item: its key, its input rank from 1 and its box. */
export interface Placed {
  key: number;
  rank: number;
  x: number;
  y: number;
  w: number;
  h: number;
  packed: boolean;
  /** The value `true` when the item is a circle in its box. */
  circle?: boolean;
}

/** The result of one packing. */
export interface Run {
  /** The width mode of the packing. */
  mode: WidthMode;
  placed: Placed[];
  /** The width of the container. */
  width: number;
  /** The height that the packer gives to the container. */
  height: number;
  /** The largest right edge of an item. It is more than `width` when an item is wider than the container. */
  right: number;
  metrics: PackingMetrics;
  /** The measures of `measure`. A strategy that does not support the input gives none. */
  measures?: LayoutMeasures;
  /** The time of the call of `packWith`, in milliseconds. */
  ms: number;
  /** The width search. Only a free width of a strategy of `SEARCH_STRATEGIES` has it. */
  free?: FreeRun;
  /** The text of the error when the strategy does not support the input, or when it throws. */
  error?: string;
  /** The value `true` when the error is `UnsupportedCell`. */
  unsupported?: boolean;
  /** The shape of the container and the obstacles of a scene, at the places of the packing. Only a scene gives it. */
  frame?: { shape?: Region; obstacles: { region: Region; dx: number; dy: number }[] };
}

/** This function gives a random generator with a seed (mulberry32). The same seed gives the same numbers. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function gives a whole number from `min` to `max`, with a step. */
function between(rng: () => number, min: number, max: number, step = 1): number {
  const steps = Math.floor((max - min) / step);
  return min + step * Math.floor(rng() * (steps + 1));
}

/** A preset: a made-up set of items. */
export interface Preset {
  id: string;
  label: string;
  /** A short description of the items. */
  hint: string;
  /** This function makes the size of one item. */
  size: (rng: () => number) => { w: number; h: number };
  /** The shape of each item. A missing shape is a rectangle. */
  shape?: "circle";
}

/** The presets of the demo. All of the data is made up. */
export const PRESETS: readonly Preset[] = [
  {
    id: "cards",
    label: "Cards",
    hint: "Cards of almost the same width, with different heights.",
    size: (rng) => ({ w: between(rng, 140, 180, 10), h: between(rng, 70, 200, 10) }),
  },
  {
    id: "photos",
    label: "Photos",
    hint: "Photos with the usual aspects: 4:3, 3:2, 1:1, 2:3 and 16:9.",
    size: (rng) => {
      const aspects = [4 / 3, 3 / 2, 1, 2 / 3, 16 / 9] as const;
      const aspect = aspects[Math.floor(rng() * aspects.length)] ?? 1;
      const h = between(rng, 80, 150, 10);
      return { w: Math.round(h * aspect), h };
    },
  },
  {
    id: "mixed",
    label: "Mixed widths",
    hint: "Narrow and wide items. Some are five times wider than others.",
    size: (rng) => ({ w: between(rng, 40, 360, 20), h: between(rng, 40, 120, 20) }),
  },
  {
    id: "ranked",
    label: "Ranked list",
    hint: "Short items in a ranked order. Set the sort order to input, and the rows keep the ranks.",
    size: (rng) => ({ w: between(rng, 80, 260, 20), h: between(rng, 30, 60, 10) }),
  },
  {
    id: "circles",
    label: "Circles",
    hint: "Circles of different diameters. Only the strategies for circles pack them: hole degree and bbox.",
    size: (rng) => {
      const d = between(rng, 24, 120, 8);
      return { w: d, h: d };
    },
    shape: "circle",
  },
];

/** This function finds a preset by its id. An unknown id gives the first preset. */
export function presetOf(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}

/** This function makes `count` items of a preset from a seed. The same arguments give the same items. */
export function makeItems(presetId: string, count: number, seed: number): Item[] {
  const preset = presetOf(presetId);
  const rng = random(seed);
  return Array.from({ length: count }, (_, key) => ({ key, ...preset.size(rng), ...(preset.shape === "circle" ? { circle: true } : {}) }));
}

/** This function makes one more item of a preset. The seed and the key select its size. */
export function makeItem(presetId: string, seed: number, key: number): Item {
  const rng = random((seed * 7919 + key * 104729) >>> 0);
  const preset = presetOf(presetId);
  return { key, ...preset.size(rng), ...(preset.shape === "circle" ? { circle: true } : {}) };
}

/** This function gives an item a new size from 4 to 2000. A circle keeps the same width and height: the changed side sets both. */
export function resizeItem(item: Item, w: number, h: number): void {
  const nw = Math.min(2000, Math.max(4, Math.round(w)));
  const nh = Math.min(2000, Math.max(4, Math.round(h)));
  if (item.circle === true) {
    const d = nw === item.w ? nh : nw;
    item.w = d;
    item.h = d;
    return;
  }
  item.w = nw;
  item.h = nh;
}

/** This function gives the id of each strategy of the demo that supports the shape kind of the items. */
export function offeredStrategies(items: readonly Item[], scene?: Scene): string[] {
  if (items.length === 0) return [...STRATEGIES];
  const kind = cellOf(inputOf(items, 640, "fixed", DEFAULT_TARGET, scene)).itemShape;
  return STRATEGIES.filter((id) => registryStrategy(id).supports.itemShape.includes(kind));
}

/** The strategies that each layout takes first when its strategy does not support the items: layout A, then layout B. */
const FIRST_CHOICES: readonly (readonly string[])[] = [
  ["rows", "hole-degree"],
  ["skyline", "bbox"],
];

/**
 * This function gives the strategy of a layout for the offered strategies. A strategy that supports the items stays. Else the
 * layout takes its first choice, or the first offered strategy that the other layout does not use.
 */
export function strategyFor(current: string, offered: readonly string[], index: number, other: string): string {
  if (offered.includes(current)) return current;
  const first = (FIRST_CHOICES[index] ?? []).find((id) => offered.includes(id));
  return first ?? offered.find((id) => id !== other) ?? offered[0] ?? current;
}

/**
 * The scene of a generated input: its container, its obstacles, its gap and the other fields of each box, by the key of
 * the item. The demo packs the items of the page in this scene.
 */
export interface Scene {
  container: PackInput["container"];
  obstacles?: readonly Obstacle[];
  gap?: number;
  /** The fields of each box other than its id and its size, by the key of the item. */
  extra: ReadonlyMap<number, Omit<PackItem, "id" | "w" | "h">>;
}

/** This function gives the items of a generated input and its scene. The key of each item is its place in the input. */
export function sceneOf(input: PackInput): { items: Item[]; scene: Scene } {
  const items = input.items.map((b, key) => ({ key, w: b.w, h: b.h }));
  const extra = new Map(input.items.map((b, key) => {
    const { id: _id, w: _w, h: _h, ...rest } = b;
    return [key, rest] as const;
  }));
  const scene: Scene = { container: input.container, extra };
  if (input.obstacles !== undefined) scene.obstacles = input.obstacles;
  if (input.gap !== undefined) scene.gap = input.gap;
  return { items, scene };
}

/**
 * This function gives the packing input of the items: a fixed width, or a free size with the target. The id of an item
 * is its key. A scene gives a `fixed` width its container, and each width mode its obstacles, its gap and its box fields.
 */
export function inputOf(items: readonly Item[], width: number, mode: WidthMode | undefined, target: FreeTarget = DEFAULT_TARGET, scene?: Scene): PackInput {
  const free = { fixed: "none", aspect: target.aspect, aspectWeight: target.weight } as const;
  const base: PackInput = {
    container: mode === "free" ? free : (scene?.container ?? { fixed: "width", w: width }),
    items: items.map((item) => ({ ...scene?.extra.get(item.key), ...circleOf(item), id: String(item.key), w: item.w, h: item.h })),
  };
  if (scene === undefined) return base;
  return { ...base, ...(scene.obstacles === undefined ? {} : { obstacles: scene.obstacles }), ...(scene.gap === undefined ? {} : { gap: scene.gap }) };
}

/** This function gives the circle shape of a circle item, in its box. An item that is not a circle gives no field. */
function circleOf(item: Item): Pick<PackItem, "shape"> {
  if (item.circle !== true) return {};
  const r = Math.min(item.w, item.h) / 2;
  return { shape: { kind: "circle", cx: item.w / 2, cy: item.h / 2, r } };
}

/** This function gives the text of an error of a strategy. */
export function errorText(e: unknown): { error: string; unsupported: boolean } {
  if (e instanceof UnsupportedCell) return { error: `Not supported for this input: the ${e.dimension} ${e.value}.`, unsupported: true };
  return { error: e instanceof Error ? e.message : String(e), unsupported: false };
}

/** This function gives the width search of `packFree` with the options of a setting, for the chart of the search. */
function searchOf(items: readonly Item[], options: Record<string, unknown>, strategyId: string, target: FreeTarget): FreeRun {
  const rects = items.map((item) => {
    const r = new Rect<number>();
    r.size.set(item.w, item.h);
    return r;
  });
  const result = packFree(rects, new Rect<number>(), {
    strategy: strategyId as "rows",
    sortOrder: (options["sortOrder"] as SortOrder | undefined) ?? "height-desc",
    ...(typeof options["samples"] === "number" ? { samples: options["samples"] } : {}),
    ...(options["fit"] === undefined ? {} : { fit: options["fit"] as "next" }),
    ...(options["rule"] === undefined ? {} : { rule: options["rule"] as "bl" }),
    ...(options["choice"] === undefined ? {} : { choice: options["choice"] as "baf" }),
    ...(options["split"] === undefined ? {} : { split: options["split"] as "sas" }),
    ...(options["merge"] === true ? { merge: true } : {}),
    aspect: target.aspect,
    aspectWeight: target.weight,
  });
  return {
    target: { ...target },
    aspect: result.aspect,
    fill: result.fill,
    aspectError: result.aspectError,
    objective: result.objective,
    tried: result.tried,
    chosen: chosenTry(result.tried),
  };
}

/**
 * This function packs the items with `packWith` and measures the result. A `fixed` width uses `width`. A `free` width
 * gives the strategy a free size with the target, and the width of the result is the width of the content.
 * A strategy that does not support the input gives a run with no placed item and the text of the error.
 */
export function runPacking(
  items: readonly Item[],
  width: number,
  setting: Setting,
  now: () => number = () => performance.now(),
  target: FreeTarget = DEFAULT_TARGET,
  seed = 0,
  scene?: Scene,
): Run {
  const input = inputOf(items, width, setting.mode, target, scene);
  const options = packOptions(setting.strategy, setting.options ?? {});
  let output: PackOutput | undefined;
  let failure: { error: string; unsupported: boolean } | undefined;
  const start = now();
  try {
    output = packWith(setting.strategy, input, options, seed);
  } catch (e) {
    failure = errorText(e);
  }
  const ms = now() - start;

  const at = new Map(output?.placements.map((p) => [p.id, p]));
  const placed = items.map((item, i) => {
    const p = at.get(String(item.key));
    const turned = p?.turn === 90;
    const box = { key: item.key, rank: i + 1, x: p?.x ?? 0, y: p?.y ?? 0, w: turned ? item.h : item.w, h: turned ? item.w : item.h, packed: p !== undefined };
    return item.circle === true ? { ...box, circle: true } : box;
  });
  const rects = placed.filter((p) => p.packed).map((p) => {
    const r = new Rect<number>();
    r.position.set(p.x, p.y);
    r.size.set(p.w, p.h);
    return r;
  });
  const free = setting.mode === "free";
  const fixedWidth = scene === undefined ? width : (input.container.w ?? output?.size.w ?? width);
  const run: Run = {
    mode: free ? "free" : "fixed",
    placed,
    width: free ? (output?.size.w ?? 0) : fixedWidth,
    height: Math.max(output?.size.h ?? 0, input.container.h ?? 0, Rect.maxBottom(rects)),
    right: Rect.maxRight(rects),
    metrics: packingMetrics(rects),
    ms,
  };
  if (scene !== undefined) {
    const moved = new Map(output?.moved.map((m) => [m.id, m]));
    run.frame = {
      ...(input.container.shape === undefined ? {} : { shape: input.container.shape }),
      obstacles: (input.obstacles ?? []).map((o) => {
        const at = moved.get(o.id);
        const b = regionBounds(o.region);
        return { region: o.region, dx: at === undefined ? 0 : at.x - b.x, dy: at === undefined ? 0 : at.y - b.y };
      }),
    };
  }
  if (output) run.measures = measure(input, output);
  if (failure) Object.assign(run, failure);
  if (free && output && SEARCH_STRATEGIES.includes(setting.strategy)) run.free = searchOf(items, options, setting.strategy, target);
  return run;
}

/** This function gives the index of the chosen try: the first try with the lowest objective. It gives -1 for no try. */
export function chosenTry(tried: readonly FreeWidthTry[]): number {
  let best = -1;
  for (const [i, t] of tried.entries()) if (best < 0 || t.objective < tried[best]!.objective) best = i;
  return best;
}

/** A point of the chart of the width search. `x` and `y` are in the units of the chart. */
export interface ChartPoint {
  width: number;
  objective: number;
  x: number;
  y: number;
  chosen: boolean;
}

/** A tick of an axis of the chart: its value and its position in the units of the chart. */
export interface ChartTick {
  value: number;
  at: number;
}

/** The geometry of the chart of the width search. */
export interface SearchChart {
  /** The points, from the narrowest width to the widest width. */
  points: ChartPoint[];
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  /** The plot area in the units of the chart. */
  plot: { left: number; top: number; right: number; bottom: number };
}

/** This function gives some round numbers from `min` to `max`: 1, 2 or 5 times a power of 10. */
function roundTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((v) => v >= raw) ?? 10 * power;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(v);
  return out;
}

/**
 * This function gives the geometry of the chart of the width search. The x axis shows the width on a log scale. The
 * y axis shows the objective on a linear scale. The chart has one point for each try.
 */
export function searchChart(free: FreeRun, size = { width: 560, height: 200 }): SearchChart {
  const plot = { left: 56, top: 14, right: size.width - 16, bottom: size.height - 30 };
  const tries = free.tried.map((t, i) => ({ t, i })).toSorted((a, b) => a.t.width - b.t.width || a.i - b.i);
  if (tries.length === 0) return { points: [], xTicks: [], yTicks: [], plot };
  const widths = tries.map(({ t }) => t.width);
  const objectives = tries.map(({ t }) => t.objective);
  const wMin = Math.min(...widths);
  const wMax = Math.max(...widths);
  const oMin = Math.min(...objectives);
  const oMax = Math.max(...objectives);
  const lo = Math.log(wMin);
  const hi = Math.log(wMax);
  const xOf = (w: number): number =>
    hi > lo ? plot.left + ((Math.log(w) - lo) / (hi - lo)) * (plot.right - plot.left) : (plot.left + plot.right) / 2;
  const pad = (oMax - oMin) * 0.06 || Math.abs(oMax) * 0.06 || 1;
  const yLo = Math.max(0, oMin - pad);
  const yHi = oMax + pad;
  const yOf = (o: number): number => plot.bottom - ((o - yLo) / (yHi - yLo)) * (plot.bottom - plot.top);
  const points = tries.map(({ t, i }) => ({
    width: t.width,
    objective: t.objective,
    x: xOf(t.width),
    y: yOf(t.objective),
    chosen: i === free.chosen,
  }));

  // The x ticks are the two ends, and 1, 2 and 5 times each power of 10 between them, with space for each label
  const xValues: number[] = [];
  for (let p = 10 ** Math.floor(Math.log10(wMin)); p <= wMax; p *= 10)
    for (const m of [1, 2, 5]) if (p * m > wMin && p * m < wMax) xValues.push(p * m);
  const gap = 44;
  const middle = xValues.filter((v) => xOf(v) - xOf(wMin) >= gap && xOf(wMax) - xOf(v) >= gap);
  const xTicks = [...new Set([wMin, ...middle, wMax])].map((value) => ({ value, at: xOf(value) }));
  const yTicks = roundTicks(yLo, yHi, 4).map((value) => ({ value, at: yOf(value) }));
  return { points, xTicks, yTicks, plot };
}
