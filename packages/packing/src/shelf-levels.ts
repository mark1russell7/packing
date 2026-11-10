// The offline level packers of roadmap item k211 (docs/PACKER.md, "The level packers"): split-fit of Coffman 1980, and
// floor-ceiling and the knapsack levels of Lodi 1999. The strategies `shelf-split-fit`, `shelf-floor-ceiling` and
// `shelf-knapsack` of `src/standalone-strategies.ts` wrap the functions. No default uses them.

import type { Item, PackInput, PackOutput, Placement } from "./contract.ts";
import { byRank } from "./frame.ts";
import { sleatorRefusal } from "./sleator.ts";

/** The result of a level packer of this module. */
export interface ShelfLevelsResult {
  /** The layout. Each item has a place, with no turn. */
  readonly output: PackOutput;
  /** The height of `output`: the bottom edge of the lowest level. */
  readonly height: number;
  /** The count of the levels. The levels at the side of other levels count too. */
  readonly levels: number;
}

/** The most states that the knapsack of `shelfKnapsack` keeps for one level. */
export const SHELF_KNAPSACK_STATES = 1024;

/**
 * This function gives the reason that the level packers of this module refuse an input, or `null` when they accept the input.
 * They accept the same inputs as `sleatorStrip`. The container is a strip of a fixed width with no obstacle and no gap.
 * Each item has no lock and no margin, and fits the width with no turn.
 */
export function shelfLevelsRefusal(input: PackInput): string | null {
  return sleatorRefusal(input);
}

/** This function throws a `RangeError` with the name of a packer for an input that `shelfLevelsRefusal` refuses, and gives the width. */
function widthOf(input: PackInput, name: string): number {
  const reason = shelfLevelsRefusal(input);
  if (reason !== null) throw new RangeError(`${name}: ${reason}`);
  return input.container.w!;
}

/** This function gives the items in the order of their heights, the tallest first. A tie keeps the order of `byRank`. */
function tallestFirst(items: readonly Item[]): Item[] {
  return byRank(items).toSorted((a, b) => b.h - a.h);
}

/** This function gives the result for the places of the items. */
function resultOf(input: PackInput, width: number, places: ReadonlyMap<string, Placement>, height: number, levels: number): ShelfLevelsResult {
  const output: PackOutput = { placements: input.items.map((item) => places.get(item.id)!), overflow: [], size: { w: width, h: height }, moved: [] };
  return { output, height, levels };
}

/** A level of the first fit. The items of the level start at its top edge. */
interface Row {
  /** The top edge of the level. */
  y: number;
  /** The height of the level: the height of its first item. */
  readonly h: number;
  /** The right edge of the last item of the level. */
  used: number;
  /** The items of the level, with their left edges. */
  readonly members: { readonly item: Item; readonly x: number }[];
}

/**
 * This function packs items by the first fit of the levels, from `start` to `right` along `x` and from `top` to `limit` along `y`.
 * Each item goes on the first level where it fits. Else it opens a level under the last level.
 * An item that does not fit a new level goes to `rest`.
 */
function firstFitRows(items: readonly Item[], start: number, right: number, top: number, limit: number): { rows: Row[]; rest: Item[]; bottom: number } {
  const rows: Row[] = [];
  const rest: Item[] = [];
  let bottom = top;
  for (const item of items) {
    let row = rows.find((r) => r.used + item.w <= right);
    if (row === undefined) {
      if (start + item.w > right || bottom + item.h > limit) {
        rest.push(item);
        continue;
      }
      row = { y: bottom, h: item.h, used: start, members: [] };
      rows.push(row);
      bottom += item.h;
    }
    row.members.push({ item, x: row.used });
    row.used += item.w;
  }
  return { rows, rest, bottom };
}

/** This function writes the place of each item of the levels. */
function placeRows(rows: readonly Row[], places: Map<string, Placement>): void {
  for (const row of rows) for (const { item, x } of row.members) places.set(item.id, { id: item.id, x, y: row.y });
}

/**
 * This function packs a strip with split-fit of Coffman, Garey, Johnson and Tarjan 1980.
 * It throws a `RangeError` for an input that `shelfLevelsRefusal` refuses.
 *
 * 1. `m` is the largest whole number with each width at most `W / m`, for the width `W` of the strip.
 * 2. The wide items, with a width of more than `W / (m + 1)`, go on levels by first fit, the tallest first.
 * 3. The wide levels with more than `(m + 1) W / (m + 2)` of width in use go first. The other wide levels go under them.
 * 4. The other wide levels leave a free region at the right side, with a width of `W / (m + 2)`.
 * 5. The narrow items go into that region by first fit, the tallest first, while they fit its height.
 * 6. The narrow items that do not fit the region go on levels of the full width under all the levels, by first fit.
 *
 * With each height at most 1, the height is at most `1.5` times the optimum plus `2` (Coffman 1980).
 * The function has no search with a seed, so the same input gives the same layout on each machine.
 */
export function shelfSplitFit(input: PackInput): ShelfLevelsResult {
  const width = widthOf(input, "shelfSplitFit");
  const items = tallestFirst(input.items);
  const places = new Map<string, Placement>();
  if (items.length === 0) return resultOf(input, width, places, 0, 0);

  const widest = Math.max(...items.map((item) => item.w));
  let m = Math.max(1, Math.floor(width / widest));
  while ((m + 1) * widest <= width) m += 1;
  while (m > 1 && m * widest > width) m -= 1;
  const wide = items.filter((item) => (m + 1) * item.w > width);
  const narrow = items.filter((item) => (m + 1) * item.w <= width);

  const { rows } = firstFitRows(wide, 0, width, 0, Infinity);
  const full = rows.filter((row) => (m + 2) * row.used > (m + 1) * width);
  const other = rows.filter((row) => (m + 2) * row.used <= (m + 1) * width);
  let y = 0;
  for (const row of full) {
    row.y = y;
    y += row.h;
  }
  const regionTop = y;
  for (const row of other) {
    row.y = y;
    y += row.h;
  }
  // The left edge of the region. The largest width in use keeps a rounding error of the division off the wide items.
  const regionLeft = Math.max(((m + 1) * width) / (m + 2), ...other.map((row) => row.used));
  const region = firstFitRows(narrow, regionLeft, width, regionTop, y);
  const below = firstFitRows(region.rest, 0, width, y, Infinity);
  for (const set of [rows, region.rows, below.rows]) placeRows(set, places);
  return resultOf(input, width, places, below.bottom, rows.length + region.rows.length + below.rows.length);
}

/** A box on a level of `shelfFloorCeiling`: its left edge, its width and its height. */
interface Span {
  readonly x: number;
  readonly w: number;
  readonly h: number;
}

/** A level of `shelfFloorCeiling`. */
interface FloorCeiling {
  /** The top edge of the level. The floor items start at it. */
  readonly y: number;
  /** The height of the level: the height of its first item. The ceiling items end at `y + h`. */
  readonly h: number;
  /** The right edge of the last floor item. */
  floor: number;
  /** The left edge of the last ceiling item. */
  ceiling: number;
  readonly floorItems: Span[];
  readonly ceilingItems: Span[];
}

/** This function tells if a box at `x` of width `w` and height `h` overlaps a box of `spans` on a level of height `level`. */
function crosses(spans: readonly Span[], x: number, w: number, h: number, level: number): boolean {
  return spans.some((s) => s.x < x + w && x < s.x + s.w && s.h + h > level);
}

/** This function gives the left edge of an item on the floor of a level, or `undefined` when it does not fit there. */
function floorX(level: FloorCeiling, item: Item, width: number): number | undefined {
  const x = level.floor;
  return x + item.w <= width && !crosses(level.ceilingItems, x, item.w, item.h, level.h) ? x : undefined;
}

/** This function gives the left edge of an item on the ceiling of a level, or `undefined` when it does not fit there. */
function ceilingX(level: FloorCeiling, item: Item, width: number): number | undefined {
  // The first item on a ceiling is an item that does not fit the floor of the level.
  if (level.ceilingItems.length === 0 && floorX(level, item, width) !== undefined) return undefined;
  const x = level.ceiling - item.w;
  return x >= 0 && !crosses(level.floorItems, x, item.w, item.h, level.h) ? x : undefined;
}

/**
 * This function packs a strip with floor-ceiling of Lodi, Martello and Vigo 1999.
 * It throws a `RangeError` for an input that `shelfLevelsRefusal` refuses.
 *
 * 1. The items go in the order of their heights, the tallest first. The first item of a level sets its height.
 * 2. The floor items of a level start at its top edge, from the left. The ceiling items end at its bottom edge, from the right.
 * 3. An item goes on the ceiling with the least free width at its left. The first item on a ceiling is an item that does not fit the floor.
 * 4. Else the item goes on the floor with the least free width at its right. Else it opens a level under the last level.
 * 5. A tie goes to the first level. No item overlaps another item.
 *
 * The function has no search with a seed, so the same input gives the same layout on each machine.
 */
export function shelfFloorCeiling(input: PackInput): ShelfLevelsResult {
  const width = widthOf(input, "shelfFloorCeiling");
  const places = new Map<string, Placement>();
  const levels: FloorCeiling[] = [];
  let bottom = 0;
  for (const item of tallestFirst(input.items)) {
    let best: { level: FloorCeiling; x: number; free: number } | undefined;
    for (const level of levels) {
      const x = ceilingX(level, item, width);
      if (x !== undefined && (best === undefined || x < best.free)) best = { level, x, free: x };
    }
    if (best !== undefined) {
      const { level, x } = best;
      level.ceiling = x;
      level.ceilingItems.push({ x, w: item.w, h: item.h });
      places.set(item.id, { id: item.id, x, y: level.y + level.h - item.h });
      continue;
    }
    for (const level of levels) {
      const x = floorX(level, item, width);
      if (x !== undefined && (best === undefined || width - x - item.w < best.free)) best = { level, x, free: width - x - item.w };
    }
    let level = best?.level;
    if (level === undefined) {
      level = { y: bottom, h: item.h, floor: 0, ceiling: width, floorItems: [], ceilingItems: [] };
      levels.push(level);
      bottom += item.h;
    }
    const x = level.floor;
    level.floor = x + item.w;
    level.floorItems.push({ x, w: item.w, h: item.h });
    places.set(item.id, { id: item.id, x, y: level.y });
  }
  return resultOf(input, width, places, bottom, levels.length);
}

/** A state of the knapsack: the right edge of the chosen items, their area, and the last item with the state before it. */
interface State {
  readonly w: number;
  readonly v: number;
  readonly prev: State | null;
  readonly index: number;
}

/** This function merges two lists of states in the order of `w`, and keeps each state with more area than each state before it. */
function frontier(a: readonly State[], b: readonly State[]): State[] {
  const out: State[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const s = j >= b.length || (i < a.length && (a[i]!.w < b[j]!.w || (a[i]!.w === b[j]!.w && a[i]!.v >= b[j]!.v))) ? a[i++]! : b[j++]!;
    if (out.length === 0 || s.v > out.at(-1)!.v) out.push(s);
  }
  return out;
}

/**
 * This function chooses the items for a level after its first item, by a 0-1 knapsack on the area with the width as the weight.
 * It gives the indexes of the chosen items, in increasing order. Each state is the right edge of a set of items from `start`.
 * Thus the sum of the widths is the same float as the right edge of the last item on the level.
 * Past `SHELF_KNAPSACK_STATES` states, the states go into buckets of equal width, and the state with the most area in a bucket stays.
 */
function knapsack(items: readonly Item[], start: number, width: number): number[] {
  let states: State[] = [{ w: start, v: 0, prev: null, index: -1 }];
  const step = (width - start) / SHELF_KNAPSACK_STATES;
  const bucket = (s: State): number => Math.min(SHELF_KNAPSACK_STATES - 1, Math.floor((s.w - start) / step));
  items.forEach((item, index) => {
    const added: State[] = [];
    for (const s of states) if (s.w + item.w <= width) added.push({ w: s.w + item.w, v: s.v + item.w * item.h, prev: s, index });
    if (added.length === 0) return;
    states = frontier(states, added);
    if (states.length > SHELF_KNAPSACK_STATES) {
      // The last state of a bucket has the most area in the bucket, because the area grows with `w` on the frontier.
      states = states.filter((s, k) => k === states.length - 1 || bucket(states[k + 1]!) !== bucket(s));
    }
  });
  const chosen: number[] = [];
  for (let s: State | null = states.at(-1)!; s !== null && s.index >= 0; s = s.prev) chosen.push(s.index);
  return chosen.reverse();
}

/**
 * This function packs a strip with the knapsack levels of Lodi, Martello and Vigo 1999.
 * It throws a `RangeError` for an input that `shelfLevelsRefusal` refuses.
 *
 * 1. The items go in the order of their heights, the tallest first. The tallest item left opens a level at the left side.
 * 2. A 0-1 knapsack fills the rest of the width of the level. The weight of an item is its width, and its value is its area.
 * 3. The chosen items go on the level from the left, in the order of their heights. The next level opens under the level.
 *
 * The knapsack is exact while it has at most `SHELF_KNAPSACK_STATES` states. With whole widths, the count of states is at most the free width plus 1.
 * The function has no search with a seed, so the same input gives the same layout on each machine.
 */
export function shelfKnapsack(input: PackInput): ShelfLevelsResult {
  const width = widthOf(input, "shelfKnapsack");
  const places = new Map<string, Placement>();
  let left = tallestFirst(input.items);
  let y = 0;
  let levels = 0;
  while (left.length > 0) {
    const [first, ...rest] = left as [Item, ...Item[]];
    const chosen = knapsack(rest, first.w, width);
    places.set(first.id, { id: first.id, x: 0, y });
    let x = first.w;
    for (const index of chosen) {
      const item = rest[index]!;
      places.set(item.id, { id: item.id, x, y });
      x += item.w;
    }
    const taken = new Set(chosen);
    left = rest.filter((_, index) => !taken.has(index));
    y += first.h;
    levels += 1;
  }
  return resultOf(input, width, places, y, levels);
}
