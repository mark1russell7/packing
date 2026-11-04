// The exact baseline of roadmap item k10 (docs/PACKER.md, "The exact strip"): a branch and bound for a strip with a small count of items.
// The search places one item at a time on the corners of a staircase: the placement of Scheithauer 1997, as in Martello 2003.
// The strategy `exact-strip` of `src/standalone-strategies.ts` wraps it, and no default uses it. The bench compares the named entries with its proved heights.

import { mmvBound, objectiveBound } from "./bounds.ts";
import { marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { pairedIds } from "./overflow.ts";

/** The largest count of items of `exactStrip`. Above 8 items, the node limit stops some inputs: `docs/PACKER.md`, "The exact strip". */
export const EXACT_STRIP_MAX_ITEMS = 16;

/** The largest side of an item and the largest strip width of `exactStrip`. A raster has one cell for each length. */
export const EXACT_STRIP_MAX_SIDE = 4096;

/** The default limit of the nodes of `exactStrip`. */
export const EXACT_STRIP_NODE_LIMIT = 5_000_000;

/** The largest count of failed states that one search keeps. A full memo slows the search, and the result stays exact. */
const MEMO_LIMIT = 2_000_000;

/** The largest count of raster cells that one search keeps. */
const RASTER_CELLS = 1 << 24;

/** The options of `exactStrip`. */
export interface ExactStripOptions {
  /** The largest count of search nodes, over all heights. It is a whole number of 1 or more. The default is `EXACT_STRIP_NODE_LIMIT`. */
  readonly nodeLimit?: number;
}

/** The result of `exactStrip`. */
export interface ExactStripResult {
  /** The value `optimal` tells that no layout is lower than `height`. The value `limit` tells that the node limit stopped the search. */
  readonly status: "optimal" | "limit";
  /** The reason for `optimal`: `height` meets the k51 bound, or the search exhausted each lower height. The value is `null` for `limit`. */
  readonly proof: "bound" | "exhausted" | null;
  /** The height of `output`: the best height that the search has. Only `optimal` makes it the optimum. */
  readonly height: number;
  /** A proved lower bound of the optimum. It equals `height` for `optimal`, and it is below `height` for `limit`. */
  readonly lowerBound: number;
  /** The layout of the height `height`, with each item placed. */
  readonly output: PackOutput;
  /** The count of the search nodes. The same input and limit give the same count on each machine. */
  readonly nodes: number;
}

/** A class of equal items. Equal items are not different branches. */
interface Kind {
  readonly w: number;
  readonly h: number;
  /** The value `true` tells that the kind also has the sizes `h` by `w`. */
  readonly turns: boolean;
  /** The indices of the items in the input. */
  readonly items: readonly number[];
}

/**
 * The envelope of the placed items: a staircase that goes down from left to right.
 * Step `i` covers the columns from `xs[i]` to `xs[i + 1]` at the height `ys[i]`. The last step ends at the width of the strip.
 */
interface Stairs {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

/** One placed item of a kind. */
interface Placed {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  /** The value `true` tells that the item has the sizes `h` by `w` of its kind. */
  readonly swapped: boolean;
}

/** This function tells if a number is a whole number of 1 or more. */
const positiveWhole = (v: number | undefined): boolean => v !== undefined && Number.isInteger(v) && v >= 1;

/** This function gives the reason that `exactStrip` refuses an item, or `null` when it accepts the item. */
function itemRefusal(item: Item, width: number): string | null {
  if (!positiveWhole(item.w) || !positiveWhole(item.h)) return `item ${item.id} needs whole sizes of 1 or more`;
  if (Math.max(item.w, item.h) > EXACT_STRIP_MAX_SIDE) return `item ${item.id} has a side above ${EXACT_STRIP_MAX_SIDE}`;
  if (item.shape !== undefined) return `item ${item.id} has a shape`;
  if (item.locked === true) return `item ${item.id} is locked`;
  const m = marginOf(item);
  if (m.top !== 0 || m.right !== 0 || m.bottom !== 0 || m.left !== 0) return `item ${item.id} has a margin`;
  const least = item.turnable === true ? Math.min(item.w, item.h) : item.w;
  return least > width ? `item ${item.id} is wider than the strip` : null;
}

/**
 * This function gives the reason that `exactStrip` refuses an input, or `null` when it accepts the input.
 *
 * - The input is a rectangle strip of a whole width: `fixed` is `width`, with no shape, no inset and no obstacle.
 * - The items are rectangles of whole sizes, with no lock and no margin. They fit the width. They have no gap and no pair gap.
 * - The count of the items is at most `EXACT_STRIP_MAX_ITEMS`, and each side is at most `EXACT_STRIP_MAX_SIDE`.
 */
export function exactStripRefusal(input: PackInput): string | null {
  const { container, items } = input;
  if (container.fixed !== "width") return "the container is not a strip of a fixed width";
  if (!positiveWhole(container.w) || container.w! > EXACT_STRIP_MAX_SIDE) return `the strip needs a whole width from 1 to ${EXACT_STRIP_MAX_SIDE}`;
  if (container.shape !== undefined) return "the strip has a shape";
  if ((container.inset ?? 0) !== 0) return "the strip has an inset";
  if ((input.obstacles?.length ?? 0) > 0) return "the input has obstacles";
  if ((input.gap ?? 0) !== 0 || pairedIds(input).size > 0) return "the input has a gap";
  if (items.length > EXACT_STRIP_MAX_ITEMS) return `the input has more than ${EXACT_STRIP_MAX_ITEMS} items`;
  for (const item of items) {
    const reason = itemRefusal(item, container.w!);
    if (reason !== null) return reason;
  }
  return null;
}

/** This function gives the kinds of the items, the largest area first. A tie goes to the wider kind, then to the input order. */
function kindsOf(items: readonly Item[]): Kind[] {
  const found = new Map<string, { w: number; h: number; turns: boolean; items: number[] }>();
  items.forEach((item, index) => {
    const turns = item.turnable === true && item.w !== item.h;
    const w = turns ? Math.max(item.w, item.h) : item.w;
    const h = turns ? Math.min(item.w, item.h) : item.h;
    const key = `${w},${h},${turns}`;
    const kind = found.get(key);
    if (kind === undefined) found.set(key, { w, h, turns, items: [index] });
    else kind.items.push(index);
  });
  return [...found.values()].sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
}

/** This function gives the staircase after an item of the sizes `w` by `h` goes on the corner of step `i`. */
function raised(stairs: Stairs, i: number, w: number, h: number, width: number): Stairs {
  const { xs, ys } = stairs;
  const right = xs[i]! + w;
  const top = ys[i]! + h;
  const nx: number[] = [];
  const ny: number[] = [];
  let j = 0;
  for (; ys[j]! > top; j++) {
    nx.push(xs[j]!);
    ny.push(ys[j]!);
  }
  nx.push(xs[j]!);
  ny.push(top);
  // Step `k` is the last step that the item covers, and it starts left of `right`
  let k = i;
  while (k + 1 < xs.length && xs[k + 1]! < right) k++;
  if (right < (xs[k + 1] ?? width)) {
    nx.push(right);
    ny.push(ys[k]!);
  }
  for (let l = k + 1; l < xs.length; l++) {
    nx.push(xs[l]!);
    ny.push(ys[l]!);
  }
  return { xs: nx, ys: ny };
}

/** This function closes each last step that is narrower than `least`. No item that is left goes on those steps, so the same state has the same key. */
function trimmed(stairs: Stairs, least: number, width: number): Stairs {
  let m = stairs.xs.length;
  while (m > 1 && width - stairs.xs[m - 1]! < least) m--;
  return m === stairs.xs.length ? stairs : { xs: stairs.xs.slice(0, m), ys: stairs.ys.slice(0, m) };
}

/** This function gives the lowest top of an item of the sizes `w` by `h`. The envelope goes down to the right, so the last corner that fits is the lowest. */
function lowestTop(stairs: Stairs, w: number, h: number, width: number): number {
  let i = stairs.xs.length - 1;
  while (i > 0 && stairs.xs[i]! + w > width) i--;
  return stairs.ys[i]! + h;
}

/**
 * This function gives the longest sum of some of the sizes, up to each length: the raster of Herz 1972.
 * Each size in `sides` is a pair, and an item uses one side of its pair or none. A line across the strip meets a set of items, so it holds such a sum.
 */
function rasterOf(sides: readonly (readonly number[])[], limit: number): Int32Array {
  const reach = new Uint8Array(limit + 1);
  reach[0] = 1;
  for (const pair of sides) {
    for (let at = limit; at >= 0; at--) {
      if (reach[at] === 1) continue;
      for (const side of pair) if (at >= side && reach[at - side] === 1) reach[at] = 1;
    }
  }
  const fit = new Int32Array(limit + 1);
  for (let at = 1; at <= limit; at++) fit[at] = reach[at] === 1 ? at : fit[at - 1]!;
  return fit;
}

/** The rasters of the items that are left. */
interface Rasters {
  /** The raster of the widths, for a row. */
  readonly row: Int32Array;
  /** The raster of the heights, for a column. */
  readonly column: Int32Array;
}

/** This function gives the rasters of the items that are left. */
function rastersOf(kinds: readonly Kind[], counts: readonly number[], width: number, ceiling: number): Rasters {
  const rows: number[][] = [];
  const columns: number[][] = [];
  kinds.forEach((kind, k) => {
    for (let c = 0; c < counts[k]!; c++) {
      rows.push(kind.turns ? [kind.w, kind.h] : [kind.w]);
      columns.push(kind.turns ? [kind.h, kind.w] : [kind.h]);
    }
  });
  return { row: rasterOf(rows, width), column: rasterOf(columns, ceiling) };
}

/**
 * This function tells if a state can reach a height up to `target`. The value `false` is a proof that it cannot:
 *
 * - The lowest top: an item that is left goes on or above the envelope, and the envelope only rises.
 * - `mmvBound`: the items that are left stay above the last step, because the envelope covers each column up to that step.
 *   An item that can turn is not in this term, as in `strip.mmv` of `objectiveBound`.
 * - The rows: the items that are left go in the free rows. A row of the free length `f` holds at most `rasters.row[f]` of them.
 * - The columns: the same fact for each column. These 2 terms are stronger than the area bound.
 */
function canReach(stairs: Stairs, kinds: readonly Kind[], width: number, rasters: Rasters, counts: readonly number[], rest: number, target: number): boolean {
  const { xs, ys } = stairs;
  let rows = 0;
  let columns = 0;
  let above = target;
  for (let i = 0; i < xs.length; i++) {
    rows += rasters.row[width - xs[i]!]! * (above - ys[i]!);
    columns += rasters.column[target - ys[i]!]! * ((xs[i + 1] ?? width) - xs[i]!);
    above = ys[i]!;
  }
  if (rows < rest || columns < rest) return false;
  const fixed: { w: number; h: number }[] = [];
  for (let k = 0; k < kinds.length; k++) {
    if (counts[k] === 0) continue;
    const { w, h, turns } = kinds[k]!;
    if ((turns ? Math.min(lowestTop(stairs, w, h, width), lowestTop(stairs, h, w, width)) : lowestTop(stairs, w, h, width)) > target) return false;
    if (!turns) for (let c = 0; c < counts[k]!; c++) fixed.push({ w, h });
  }
  return ys[ys.length - 1]! + mmvBound(fixed, width, true) <= target;
}

/** This function gives the width of the narrowest item that is left: its short side when it can turn. */
function leastWidth(kinds: readonly Kind[], counts: readonly number[]): number {
  let least = Infinity;
  for (let k = 0; k < kinds.length; k++) if (counts[k]! > 0) least = Math.min(least, kinds[k]!.turns ? Math.min(kinds[k]!.w, kinds[k]!.h) : kinds[k]!.w);
  return least;
}

/** This function places the kinds in one order, each item on the corner with the lowest top. It gives a first layout. */
function greedyLayout(kinds: readonly Kind[], order: readonly number[], width: number): Placed[] {
  const placed: Placed[] = [];
  let stairs: Stairs = { xs: [0], ys: [0] };
  for (const k of order) {
    const { w, h, turns, items } = kinds[k]!;
    for (let c = 0; c < items.length; c++) {
      let best: { i: number; swapped: boolean; top: number } | undefined;
      for (let i = 0; i < stairs.xs.length; i++) {
        for (const swapped of turns ? [false, true] : [false]) {
          if (stairs.xs[i]! + (swapped ? h : w) > width) continue;
          const top = stairs.ys[i]! + (swapped ? w : h);
          if (best === undefined || top < best.top) best = { i, swapped, top };
        }
      }
      placed.push({ kind: k, x: stairs.xs[best!.i]!, y: stairs.ys[best!.i]!, swapped: best!.swapped });
      stairs = raised(stairs, best!.i, best!.swapped ? h : w, best!.swapped ? w : h, width);
    }
  }
  return placed;
}

/** This function gives the top of the highest item of a layout. */
function topOf(placed: readonly Placed[], kinds: readonly Kind[]): number {
  return placed.reduce((top, p) => Math.max(top, p.y + (p.swapped ? kinds[p.kind]!.w : kinds[p.kind]!.h)), 0);
}

/** This function gives the best layout of 3 orders: by height, by width and by area. */
function firstLayout(kinds: readonly Kind[], width: number): Placed[] {
  const indices = kinds.map((_, k) => k);
  const orders = [(k: Kind): number => k.h, (k: Kind): number => k.w, (k: Kind): number => k.w * k.h].map((key) => [...indices].sort((a, b) => key(kinds[b]!) - key(kinds[a]!)));
  let best: Placed[] = [];
  orders.forEach((order, i) => {
    const layout = greedyLayout(kinds, order, width);
    if (i === 0 || topOf(layout, kinds) < topOf(best, kinds)) best = layout;
  });
  return best;
}

/** This function gives the output of a layout. The placements have the order of the items of the input. */
function outputOf(input: PackInput, kinds: readonly Kind[], placed: readonly Placed[], width: number): PackOutput {
  const next = kinds.map(() => 0);
  const places = new Map<number, Placement>();
  for (const p of placed) {
    const kind = kinds[p.kind]!;
    const index = kind.items[next[p.kind]!++]!;
    const item = input.items[index]!;
    const w = p.swapped ? kind.h : kind.w;
    places.set(index, w === item.w ? { id: item.id, x: p.x, y: p.y } : { id: item.id, x: p.x, y: p.y, turn: 90 });
  }
  return { placements: input.items.map((_, index) => places.get(index)!), overflow: [], size: { w: width, h: topOf(placed, kinds) }, moved: [] };
}

/**
 * This function gives the least height of a strip for an input. When the node limit stops it, it gives the best height and a lower bound.
 * It throws a `RangeError` for an input that `exactStripRefusal` refuses, or for a limit that is not a whole number of 1 or more.
 *
 * The search:
 *
 * - The range of the height goes from the k51 bound with no tolerance to the height of a first layout.
 * - Each pass looks for a layout of a height up to a target `T` in the range. A layout lowers the top of the range.
 *   A pass with no layout raises the bottom of the range to `T + 1`.
 * - A node chooses an item and a corner of the staircase. `canReach` cuts the branches that cannot reach `T`.
 * - A state that failed at `T` also fails at each lower target. A state is the staircase and the counts of the kinds that are left.
 *
 * Why the corners are enough. `D(a)` is the part of the strip left of the right side of an item `a` and below its top.
 *
 * - Take the items with no other lower-left corner below and left of their own. Sort this list from the top left to the bottom right.
 *   If a corner is in `D(a)`, then the corner of a neighbor of `a` in the list is in `D(a)` too.
 *   Two neighbors cannot each have the corner of the other in their `D`, because their boxes then overlap.
 *
 *   Thus `m` items have at most `m - 1` such relations, and one item has no corner in its `D`. That item goes first.
 *   Repeat this on the other items. Each item then stays out of `D` of each item before it.
 * - Move each item down and left, in that order, until it stops at the envelope. It stops at a corner.
 *   This makes each `D` smaller, so the later items stay outside. No item goes up, so the height does not grow.
 *
 * The status `optimal` needs a proof: the height meets the k51 bound, or the search exhausted each lower height.
 * The node limit is the only limit. There is no clock, so the same input gives the same result on each machine.
 *
 * @example
 * ```ts
 * const result = exactStrip({ container: { fixed: "width", w: 10 }, items });
 * if (result.status === "optimal") result.height; // no layout of these items is lower
 * ```
 */
export function exactStrip(input: PackInput, options: ExactStripOptions = {}): ExactStripResult {
  const refusal = exactStripRefusal(input);
  if (refusal !== null) throw new RangeError(`exactStrip refuses the input: ${refusal}.`);
  const nodeLimit = options.nodeLimit ?? EXACT_STRIP_NODE_LIMIT;
  if (!positiveWhole(nodeLimit)) throw new RangeError("The option nodeLimit needs a whole number of 1 or more.");
  const width = input.container.w!;
  if (input.items.length === 0) return { status: "optimal", proof: "bound", height: 0, lowerBound: 0, output: { placements: [], overflow: [], size: { w: width, h: 0 }, moved: [] }, nodes: 0 };

  const kinds = kindsOf(input.items);
  const counts = kinds.map((k) => k.items.length);
  let best = firstLayout(kinds, width);
  let high = topOf(best, kinds);
  const ceiling = high;
  const root = objectiveBound(input, { tolerance: 0 })!.value;
  let low = root;
  let target = low;
  let nodes = 0;
  let stopped = false;
  const failed = new Map<string, number>();
  const rasters = new Map<string, Rasters>();
  const rasterLimit = Math.floor(RASTER_CELLS / (width + ceiling + 2));
  const path: Placed[] = [];

  const search = (stairs: Stairs, rest: number): boolean => {
    if (rest === 0) return true;
    const left = counts.join();
    const key = `${left}|${stairs.xs.join()}|${stairs.ys.join()}`;
    if ((failed.get(key) ?? -1) >= target) return false;
    if (nodes >= nodeLimit) {
      stopped = true;
      return false;
    }
    nodes += 1;
    let raster = rasters.get(left);
    if (raster === undefined) {
      raster = rastersOf(kinds, counts, width, ceiling);
      if (rasters.size < rasterLimit) rasters.set(left, raster);
    }
    if (!canReach(stairs, kinds, width, raster, counts, rest, target)) return false;
    for (let i = 0; i < stairs.xs.length; i++) {
      for (let k = 0; k < kinds.length; k++) {
        if (counts[k] === 0) continue;
        const { w, h, turns } = kinds[k]!;
        for (const swapped of turns ? [false, true] : [false]) {
          const pw = swapped ? h : w;
          const ph = swapped ? w : h;
          if (stairs.xs[i]! + pw > width || stairs.ys[i]! + ph > target) continue;
          counts[k]! -= 1;
          path.push({ kind: k, x: stairs.xs[i]!, y: stairs.ys[i]!, swapped });
          const found = search(trimmed(raised(stairs, i, pw, ph, width), leastWidth(kinds, counts), width), rest - w * h);
          counts[k]! += 1;
          if (found) return true;
          path.pop();
          if (stopped) return false;
        }
      }
    }
    if (failed.size < MEMO_LIMIT || failed.has(key)) failed.set(key, target);
    return false;
  };

  const area = kinds.reduce((sum, k) => sum + k.w * k.h * k.items.length, 0);
  while (low < high) {
    // The first target is the bound itself: an input with no free space ends here. Then the targets halve the range.
    target = low === root ? low : low + Math.floor((high - 1 - low) / 2);
    if (search({ xs: [0], ys: [0] }, area)) {
      best = path.splice(0);
      high = topOf(best, kinds);
    } else if (stopped) {
      path.length = 0;
      return { status: "limit", proof: null, height: high, lowerBound: low, output: outputOf(input, kinds, best, width), nodes };
    } else low = target + 1;
  }
  return { status: "optimal", proof: high === root ? "bound" : "exhausted", height: high, lowerBound: high, output: outputOf(input, kinds, best, width), nodes };
}
