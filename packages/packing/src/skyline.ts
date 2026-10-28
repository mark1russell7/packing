import { countMove, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";
import type { FreeSpace } from "./space.ts";

/**
 * This function finds the lowest window of width `rw` on a skyline. For each `x` in `[0, width - rw]`, the height
 * of the window is the largest value of `skyline[x, x + rw)`. The first `x` with the smallest height wins. A
 * monotonic deque makes the search O(width) for one rectangle.
 *
 * With `limit`, a window is valid only when its height plus `rh` is not more than the smallest value of
 * `limit[x, x + rw)`. A second deque keeps that smallest value. No valid window gives the height `Infinity`.
 */
export function lowestWindow(skyline: ArrayLike<number>, width: number, rw: number, limit?: ArrayLike<number>, rh = 0): { x: number; y: number } {
  const { x, y } = findWindow(skyline, width, rw, limit, rh);
  return { x, y };
}

/** The lowest window of `findWindow`, and `first`: the x of the leftmost valid window, or `-1` */
interface Window {
  x: number;
  y: number;
  first: number;
}

/** This function is `lowestWindow`, and it also gives the x of the leftmost valid window. */
function findWindow(skyline: ArrayLike<number>, width: number, rw: number, limit?: ArrayLike<number>, rh = 0): Window {
  if (limit !== undefined) return lowestLimitedWindow(skyline, limit, width, rw, rh);
  const deque = new Int32Array(width);
  let head = 0;
  let tail = 0;
  let bestX = 0;
  let bestY = Infinity;
  for (let i = 0; i < width; i++) {
    while (tail > head && skyline[deque[tail - 1]!]! <= skyline[i]!) tail--;
    deque[tail++] = i;
    if (deque[head]! <= i - rw) head++;
    if (i >= rw - 1) {
      const max = skyline[deque[head]!]!;
      if (max < bestY) {
        bestY = max;
        bestX = i - rw + 1;
      }
    }
  }
  return { x: bestX, y: bestY, first: width >= rw ? 0 : -1 };
}

/** This function counts the move of the skyline: a window that is lower than the leftmost valid window. */
function countWindow(w: Window): void {
  if (Number.isFinite(w.y) && w.first >= 0 && w.x !== w.first) countMove(MOVES.skyline);
}

/** This function is `lowestWindow` with a limit for each cell. */
function lowestLimitedWindow(skyline: ArrayLike<number>, limit: ArrayLike<number>, width: number, rw: number, rh: number): Window {
  const high = new Int32Array(width);
  const low = new Int32Array(width);
  let hh = 0;
  let ht = 0;
  let lh = 0;
  let lt = 0;
  let bestX = 0;
  let bestY = Infinity;
  let first = -1;
  for (let i = 0; i < width; i++) {
    while (ht > hh && skyline[high[ht - 1]!]! <= skyline[i]!) ht--;
    high[ht++] = i;
    if (high[hh]! <= i - rw) hh++;
    while (lt > lh && limit[low[lt - 1]!]! >= limit[i]!) lt--;
    low[lt++] = i;
    if (low[lh]! <= i - rw) lh++;
    if (i >= rw - 1) {
      const max = skyline[high[hh]!]!;
      const valid = max + rh <= limit[low[lh]!]!;
      if (valid && first < 0) first = i - rw + 1;
      if (max < bestY && valid) {
        bestY = max;
        bestX = i - rw + 1;
      }
    }
  }
  return { x: bestX, y: bestY, first };
}

/** The options of `packSkyline` */
export interface SkylineOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the skyline uses only the
   * outer rectangle and the locked rectangles.
   */
  space?: FreeSpace;
}

/**
 * This function packs rectangles into an outer rectangle with a skyline. It puts each rectangle in the lowest place
 * where it fits, and it does not change the width of the outer rectangle.
 *
 * - A `locked` rectangle keeps its position. The skyline starts at its bottom edge across its width, thus the other
 *   rectangles go under it. The space above it stays empty, because a skyline has no holes.
 * - The skyline has a cell for each whole unit of the width. A rectangle that needs more cells than the outer
 *   rectangle has goes under all other rectangles, at the left edge.
 * - Without `fixedSize`, the height of the outer rectangle grows to the content. With `fixedSize`, a rectangle that
 *   does not fit is not packed: its `wasPacked` stays `false`.
 * - The default sort order is `height-desc`. The order of the array of the caller stays.
 * - With a space that is not plain, each cell gets its start and its limit from `column` of the space. The space holds
 *   the obstacles and the locked items, thus the locked rectangles only keep their positions.
 */
export function packSkyline<T>(rects: Rect<T>[], outer: Rect<T>, options: SkylineOptions = {}): Rect<T> {
  if (options.space !== undefined && !options.space.plain) return packSkylineInSpace(rects, outer, options.sortOrder ?? "height-desc", options.space);
  // a cell for each whole unit of the width: a rectangle never goes past the right edge
  const width = Math.floor(outer.size.x);
  if (width <= 0) return outer;
  const skyline = new Float64Array(width);

  for (const rect of rects) {
    if (!rect.locked) continue;
    rect.wasPacked = true;
    const x0 = Math.max(0, Math.floor(rect.position.x - outer.position.x));
    const x1 = Math.min(width, Math.ceil(rect.position.x - outer.position.x + rect.size.x));
    const bottom = rect.position.y - outer.position.y + rect.size.y;
    for (let i = x0; i < x1; i++) skyline[i] = Math.max(skyline[i]!, bottom);
    if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, bottom);
  }

  for (const rect of rects.toSorted(compareRects(options.sortOrder ?? "height-desc"))) {
    if (rect.wasPacked) continue;
    const rw = Math.ceil(rect.size.x);
    const rh = rect.size.y;
    if (rw <= 0 || rh <= 0) continue;

    let x: number;
    let y: number;
    if (rw > width) {
      if (outer.fixedSize) continue;
      x = 0;
      y = 0;
      for (let i = 0; i < width; i++) if (skyline[i]! > y) y = skyline[i]!;
    } else {
      const found = findWindow(skyline, width, rw);
      ({ x, y } = found);
      if (outer.fixedSize && y + rh > outer.size.y) continue;
      countWindow(found);
    }

    rect.position.set(x + outer.position.x, y + outer.position.y);
    rect.wasPacked = true;
    const top = y + rh;
    for (let i = x; i < Math.min(width, x + rw); i++) skyline[i] = top;
    if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, top);
  }
  return outer;
}

/**
 * This function packs rectangles with a skyline in a free space. Each cell has a free range: the skyline is its start,
 * and `limit` is its end. A cell with less room than the lowest rectangle left goes to its next free range.
 *
 * A rectangle that needs more cells than the outer rectangle has goes at the left edge. Its y is the first y where each
 * cell is free over its height. Then each cell starts after the rectangle, as in the plain skyline.
 */
function packSkylineInSpace<T>(rects: Rect<T>[], outer: Rect<T>, order: SortOrder, space: FreeSpace): Rect<T> {
  const width = Math.floor(outer.size.x);
  if (width <= 0) return outer;
  const ox = outer.position.x;
  const oy = outer.position.y;
  const end = outer.fixedSize ? outer.size.y : Infinity;
  for (const rect of rects) if (rect.locked) rect.wasPacked = true;

  // The free range of a cell from a y, in the coordinates of the outer rectangle
  const rangeOf = (i: number, from: number): [number, number] => {
    const r = space.column(ox + i, ox + i + 1, from + oy);
    if (r === undefined) return [Infinity, -Infinity];
    return [r.start - oy, Math.min(r.end - oy, end)];
  };
  const skyline = new Float64Array(width);
  const limit = new Float64Array(width);
  for (let i = 0; i < width; i++) [skyline[i], limit[i]] = rangeOf(i, 0);

  const sorted = rects.toSorted(compareRects(order)).filter((r) => !r.wasPacked && Math.ceil(r.size.x) > 0 && r.size.y > 0);
  // The lowest height of the rectangles from each index of the sorted list to its end
  const lowest = new Float64Array(sorted.length + 1).fill(Infinity);
  for (let k = sorted.length - 1; k >= 0; k--) lowest[k] = Math.min(lowest[k + 1]!, sorted[k]!.size.y);
  const advance = (k: number): void => {
    const need = lowest[k]!;
    if (!Number.isFinite(need)) return;
    for (let i = 0; i < width; i++) {
      while (Number.isFinite(limit[i]!) && limit[i]! - skyline[i]! < need && limit[i]! < end) [skyline[i], limit[i]] = rangeOf(i, limit[i]!);
    }
  };

  for (const [k, rect] of sorted.entries()) {
    advance(k);
    const rw = Math.ceil(rect.size.x);
    const rh = rect.size.y;
    let x: number;
    let y: number;
    if (rw > width) {
      if (outer.fixedSize) continue;
      x = 0;
      y = 0;
      for (let i = 0; i < width; i++) if (Number.isFinite(skyline[i]!) && skyline[i]! > y) y = skyline[i]!;
      // The rectangle covers each cell, thus it goes to the first y where each cell is free over its height
      for (let moved = true; moved; ) {
        moved = false;
        for (let i = 0; i < width; i++) {
          if (!Number.isFinite(skyline[i]!)) continue;
          const [s, e] = rangeOf(i, y);
          const next = s > y ? s : e < y + rh ? rangeOf(i, e)[0] : y;
          if (next > y && Number.isFinite(next)) {
            y = next;
            moved = true;
          }
        }
      }
      rect.position.set(x + ox, y + oy);
      rect.wasPacked = true;
      const top = y + rh;
      // Each cell starts after the rectangle. A cell with a range that ends before the top of the rectangle goes to its next range.
      for (let i = 0; i < width; i++) {
        if (!Number.isFinite(skyline[i]!)) continue;
        if (top <= limit[i]!) skyline[i] = top;
        else [skyline[i], limit[i]] = rangeOf(i, top);
      }
      outer.size.y = Math.max(outer.size.y, top);
      continue;
    }
    let found = findWindow(skyline, width, rw, limit, rh);
    ({ x, y } = found);
    let sky: Float64Array = skyline;
    let lim: Float64Array = limit;
    if (!Number.isFinite(y)) {
      // The second try: each cell goes to its first free range with room for this rectangle
      sky = skyline.slice();
      lim = limit.slice();
      for (let i = 0; i < width; i++) {
        while (Number.isFinite(lim[i]!) && lim[i]! - sky[i]! < rh && lim[i]! < end) [sky[i], lim[i]] = rangeOf(i, lim[i]!);
      }
      found = findWindow(sky, width, rw, lim, rh);
      ({ x, y } = found);
      if (!Number.isFinite(y)) continue;
    }

    countWindow(found);
    rect.position.set(x + ox, y + oy);
    rect.wasPacked = true;
    const top = y + rh;
    for (let i = x; i < x + rw; i++) {
      skyline[i] = top;
      limit[i] = lim[i]!;
    }
    if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, top);
  }
  return outer;
}
