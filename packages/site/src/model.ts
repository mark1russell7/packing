import { pack, packFree, packingMetrics, Rect, SORT_ORDERS, type FreeWidthTry, type PackingMetrics, type SortOrder } from "@mark1russell7/packing";

/** An item of the demo. `key` identifies it. Its place in the list is its input rank. */
export interface Item {
  key: number;
  w: number;
  h: number;
}

/** A strategy of `pack`. */
export type Strategy = "rows" | "skyline";

/** This constant lists each strategy of the demo. */
export const STRATEGIES: readonly Strategy[] = ["rows", "skyline"];

/** This constant lists each sort order of the package. */
export const ORDERS: readonly SortOrder[] = SORT_ORDERS;

/** The width mode of a layout. `fixed` uses the width of the container. `free` finds a width with `packFree`. */
export type WidthMode = "fixed" | "free";

/** This constant lists each width mode of the demo. */
export const WIDTH_MODES: readonly WidthMode[] = ["fixed", "free"];

/** The settings of one packing: a strategy, a sort order and a width mode. A missing width mode is `fixed`. */
export interface Setting {
  strategy: Strategy;
  order: SortOrder;
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
}

/** The result of one packing. */
export interface Run {
  placed: Placed[];
  /** The width of the container. */
  width: number;
  /** The height that the packer gives to the container. */
  height: number;
  /** The largest right edge of an item. It is more than `width` when an item is wider than the container. */
  right: number;
  metrics: PackingMetrics;
  /** The time of the call of `pack` or `packFree`, in milliseconds. */
  ms: number;
  /** The width search. Only a free width has it. */
  free?: FreeRun;
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
];

/** This function finds a preset by its id. An unknown id gives the first preset. */
export function presetOf(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
}

/** This function makes `count` items of a preset from a seed. The same arguments give the same items. */
export function makeItems(presetId: string, count: number, seed: number): Item[] {
  const preset = presetOf(presetId);
  const rng = random(seed);
  return Array.from({ length: count }, (_, key) => ({ key, ...preset.size(rng) }));
}

/** This function makes one more item of a preset. The seed and the key select its size. */
export function makeItem(presetId: string, seed: number, key: number): Item {
  const rng = random((seed * 7919 + key * 104729) >>> 0);
  return { key, ...presetOf(presetId).size(rng) };
}

/**
 * This function packs the items and measures the result. A `fixed` width uses `width`. A `free` width uses
 * `packFree` with the target, and the width of the result is the width of the content.
 */
export function runPacking(
  items: readonly Item[],
  width: number,
  setting: Setting,
  now: () => number = () => performance.now(),
  target: FreeTarget = DEFAULT_TARGET,
): Run {
  const rects = items.map((item) => {
    const r = new Rect<number>();
    r.id = item.key;
    r.size.set(item.w, item.h);
    return r;
  });
  const outer = new Rect<number>();
  const options = { strategy: setting.strategy, sortOrder: setting.order };
  let free: FreeRun | undefined;
  let ms: number;
  if (setting.mode === "free") {
    const start = now();
    const result = packFree(rects, outer, { ...options, aspect: target.aspect, aspectWeight: target.weight });
    ms = now() - start;
    free = {
      target: { ...target },
      aspect: result.aspect,
      fill: result.fill,
      aspectError: result.aspectError,
      objective: result.objective,
      tried: result.tried,
      chosen: chosenTry(result.tried),
    };
  } else {
    outer.size.set(width, 0);
    outer.fixedWidth = true;
    const start = now();
    pack(rects, outer, options);
    ms = now() - start;
  }

  const placed = rects.map((r, i) => ({
    key: r.id ?? i,
    rank: i + 1,
    x: r.position.x,
    y: r.position.y,
    w: r.size.x,
    h: r.size.y,
    packed: r.wasPacked,
  }));
  const run: Run = {
    placed,
    width: free ? outer.size.x : width,
    height: Math.max(outer.size.y, Rect.maxBottom(rects)),
    right: Rect.maxRight(rects),
    metrics: packingMetrics(Rect.packed(rects)),
    ms,
  };
  if (free) run.free = free;
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
