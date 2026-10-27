import { pack, packingMetrics, Rect, SORT_ORDERS, type PackingMetrics, type SortOrder } from "@mark1russell7/packing";

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

/** The settings of one packing: a strategy and a sort order. */
export interface Setting {
  strategy: Strategy;
  order: SortOrder;
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
  /** The time of the call of `pack`, in milliseconds. */
  ms: number;
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

/** This function packs the items into a container of a fixed width, and measures the result. */
export function runPacking(items: readonly Item[], width: number, setting: Setting, now: () => number = () => performance.now()): Run {
  const rects = items.map((item) => {
    const r = new Rect<number>();
    r.id = item.key;
    r.size.set(item.w, item.h);
    return r;
  });
  const outer = new Rect<number>();
  outer.size.set(width, 0);
  outer.fixedWidth = true;

  const start = now();
  pack(rects, outer, { strategy: setting.strategy, sortOrder: setting.order });
  const ms = now() - start;

  const placed = rects.map((r, i) => ({
    key: r.id ?? i,
    rank: i + 1,
    x: r.position.x,
    y: r.position.y,
    w: r.size.x,
    h: r.size.y,
    packed: r.wasPacked,
  }));
  return {
    placed,
    width,
    height: Math.max(outer.size.y, Rect.maxBottom(rects)),
    right: Rect.maxRight(rects),
    metrics: packingMetrics(Rect.packed(rects)),
    ms,
  };
}
