import { cut, type Box } from "./maxrects.ts";
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

/**
 * The rules of `skyline` to choose a place on the skyline (Jylänki 2010).
 *
 * - `bl`: the bottom-left rule. The top edge of the box is the lowest, then the left edge is the leftmost.
 * - `mw`: the minimum waste rule. The area below the box and above the skyline is the smallest, then the top edge is the lowest.
 */
export const SKYLINE_RULES: readonly ["bl", "mw"] = Object.freeze(["bl", "mw"] as const);

/** A rule of `skyline`: `bl` or `mw`. `SKYLINE_RULES` tells each rule. */
export type SkylineRule = (typeof SKYLINE_RULES)[number];

/** The options of `packSkyline` */
export interface SkylineOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the skyline uses only the
   * outer rectangle and the locked rectangles.
   */
  space?: FreeSpace;
  /** The rule to choose a place on the skyline. The default is `bl`. `SKYLINE_RULES` tells each rule. */
  rule?: SkylineRule;
  /**
   * The value `true` keeps the free areas below the skyline as a list of free rectangles. Each box tries this list first,
   * with the best short side fit. The default is `false`.
   */
  wasteMap?: boolean;
  /** The rectangles that can turn by 90 degrees. Without it, no rectangle turns. A locked rectangle does not turn. */
  turnable?: ReadonlySet<unknown>;
  /** The rectangles that the packing turned. Each call turns back the rectangles of this set first, and then it clears the set. */
  turned?: Set<unknown>;
}

/** The two best windows of `scanWindows` for one box: the window of the rule `bl` and the window of the rule `mw`. */
interface Scan {
  x: number;
  y: number;
  first: number;
  wx: number;
  wy: number;
  waste: number;
}

/**
 * This function finds the best window of each rule for a box of `rw` cells and the height `rh`. A window is valid when
 * its height plus `rh` is not more than `cap` and not more than the smallest value of `limit` in the window.
 */
function scanWindows(skyline: ArrayLike<number>, width: number, rw: number, rh: number, cap: number, limit?: ArrayLike<number>): Scan {
  const high = new Int32Array(width);
  const low = new Int32Array(width);
  const sum = new Float64Array(width + 1);
  for (let i = 0; i < width; i++) sum[i + 1] = sum[i]! + (Number.isFinite(skyline[i]!) ? skyline[i]! : 0);
  let hh = 0;
  let ht = 0;
  let lh = 0;
  let lt = 0;
  const out: Scan = { x: 0, y: Infinity, first: -1, wx: 0, wy: Infinity, waste: Infinity };
  for (let i = 0; i < width; i++) {
    while (ht > hh && skyline[high[ht - 1]!]! <= skyline[i]!) ht--;
    high[ht++] = i;
    if (high[hh]! <= i - rw) hh++;
    if (limit !== undefined) {
      while (lt > lh && limit[low[lt - 1]!]! >= limit[i]!) lt--;
      low[lt++] = i;
      if (low[lh]! <= i - rw) lh++;
    }
    if (i < rw - 1) continue;
    const s = i - rw + 1;
    const max = skyline[high[hh]!]!;
    const room = limit === undefined ? cap : Math.min(cap, limit[low[lh]!]!);
    if (!Number.isFinite(max) || max + rh > room) continue;
    if (out.first < 0) out.first = s;
    if (max < out.y) {
      out.y = max;
      out.x = s;
    }
    const waste = rw * max - (sum[i + 1]! - sum[s]!);
    const tol = 1e-9 * Math.max(1, Math.abs(waste));
    if (waste < out.waste - tol || (Math.abs(waste - out.waste) <= tol && max < out.wy)) {
      out.waste = Math.min(waste, out.waste);
      out.wy = max;
      out.wx = s;
    }
  }
  return out;
}

/** A place on the skyline for one box: the window, the turn, the cells and the skyline that the window is on. */
interface Place {
  x: number;
  y: number;
  cells: number;
  w: number;
  h: number;
  turn: boolean;
  waste: number;
  first: number;
  sky: Float64Array;
  lim: Float64Array | undefined;
}

/** This function tells if the place `a` is better than the place `b` by the rule. A tie keeps `b`. */
function better(rule: SkylineRule, a: Place, b: Place | undefined): boolean {
  if (b === undefined) return true;
  if (rule === "mw") {
    const tol = 1e-9 * Math.max(1, Math.abs(b.waste));
    if (a.waste < b.waste - tol) return true;
    if (a.waste > b.waste + tol) return false;
  }
  if (a.y + a.h !== b.y + b.h) return a.y + a.h < b.y + b.h;
  return a.x < b.x;
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
  const rule = options.rule ?? "bl";
  if (!(SKYLINE_RULES as readonly string[]).includes(rule)) throw new RangeError(`The rule of skyline is one of ${SKYLINE_RULES.join(", ")}, not "${String(rule)}".`);
  const turned = options.turned;
  if (turned !== undefined) {
    for (const r of rects) if (turned.has(r)) r.size.set(r.size.y, r.size.x);
    turned.clear();
  }
  if (rule !== "bl" || options.wasteMap === true || (options.turnable !== undefined && options.turnable.size > 0)) return packSkylineVariant(rects, outer, rule, options);
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

/**
 * This function packs rectangles with a rule, a waste map or turns, as `packSkyline` tells. Without a space that is not plain,
 * the skyline starts at the bottom edge of the locked rectangles. With the waste map, the free areas under that start are
 * free rectangles too.
 */
function packSkylineVariant<T>(rects: Rect<T>[], outer: Rect<T>, rule: SkylineRule, options: SkylineOptions): Rect<T> {
  const width = Math.floor(outer.size.x);
  if (width <= 0) return outer;
  const space = options.space !== undefined && !options.space.plain ? options.space : undefined;
  const ox = outer.position.x;
  const oy = outer.position.y;
  const fixed = outer.fixedSize;
  const end = fixed ? outer.size.y : Infinity;
  const turnable = options.turnable;
  const waste = options.wasteMap === true;
  for (const rect of rects) if (rect.locked) rect.wasPacked = true;
  const sorted = rects.toSorted(compareRects(options.sortOrder ?? "height-desc")).filter((r) => !r.wasPacked && Math.ceil(r.size.x) > 0 && r.size.y > 0);
  const turns = (r: Rect<T>): boolean => turnable?.has(r) === true && r.size.x !== r.size.y;

  // The smallest sides of the boxes: a free rectangle with less room has no use
  let minW = Infinity;
  let minH = Infinity;
  for (const r of sorted) {
    const short = Math.min(r.size.x, r.size.y);
    minW = Math.min(minW, turns(r) ? short : r.size.x);
    minH = Math.min(minH, turns(r) ? short : r.size.y);
  }

  const rangeOf = (i: number, from: number): [number, number] => {
    const r = space!.column(ox + i, ox + i + 1, from + oy);
    if (r === undefined) return [Infinity, -Infinity];
    return [r.start - oy, Math.min(r.end - oy, end)];
  };
  const skyline = new Float64Array(width);
  const limit = new Float64Array(width).fill(Infinity);
  let free: Box[] = [];

  // The free rectangles of the gap between `base` and `y` over the cells `[x0, x1)`: for each level of the gap, the widest run of cells at or below it
  const addGaps = (base: ArrayLike<number>, x0: number, x1: number, y: number): void => {
    if (!waste) return;
    const seen = new Set<string>();
    for (let i = x0; i < x1; i++) {
      const level = base[i]!;
      if (!(level < y) || (i > x0 && base[i - 1]! === level)) continue;
      let l = i;
      let r = i + 1;
      while (l > x0 && base[l - 1]! <= level) l--;
      while (r < x1 && base[r]! <= level) r++;
      const key = `${l},${r},${level}`;
      if (seen.has(key) || r - l < minW || y - level < minH) continue;
      seen.add(key);
      free.push({ x0: l, y0: level, x1: r, y1: y });
    }
  };

  if (space === undefined) {
    const boxes: Box[] = [];
    for (const rect of rects) {
      if (!rect.locked) continue;
      const x0 = Math.max(0, Math.floor(rect.position.x - ox));
      const x1 = Math.min(width, Math.ceil(rect.position.x - ox + rect.size.x));
      const bottom = rect.position.y - oy + rect.size.y;
      for (let i = x0; i < x1; i++) skyline[i] = Math.max(skyline[i]!, bottom);
      if (!fixed) outer.size.y = Math.max(outer.size.y, bottom);
      boxes.push({ x0: rect.position.x - ox, y0: rect.position.y - oy, x1: rect.position.x - ox + rect.size.x, y1: bottom });
    }
    if (waste && boxes.length > 0) {
      // The area under the start of the skyline, less the locked rectangles: for each level, the widest run of cells at or above it
      const top = skyline.map((s) => Math.min(s, end));
      const seen = new Set<string>();
      for (let i = 0; i < width; i++) {
        const level = top[i]!;
        if (!(level > 0) || (i > 0 && top[i - 1]! === level)) continue;
        let l = i;
        let r = i + 1;
        while (l > 0 && top[l - 1]! >= level) l--;
        while (r < width && top[r]! >= level) r++;
        const key = `${l},${r},${level}`;
        if (seen.has(key) || r - l < minW || level < minH) continue;
        seen.add(key);
        free.push({ x0: l, y0: 0, x1: r, y1: level });
      }
      for (const b of boxes) free = cut(free, b, minW, minH).free;
    }
  } else for (let i = 0; i < width; i++) [skyline[i], limit[i]] = rangeOf(i, 0);

  const lowest = new Float64Array(sorted.length + 1).fill(Infinity);
  for (let k = sorted.length - 1; k >= 0; k--) {
    const r = sorted[k]!;
    lowest[k] = Math.min(lowest[k + 1]!, turns(r) ? Math.min(r.size.x, r.size.y) : r.size.y);
  }

  const put = (rect: Rect<T>, x: number, y: number, w: number, h: number, turn: boolean): void => {
    if (turn) {
      rect.size.set(w, h);
      options.turned?.add(rect);
    }
    rect.position.set(x + ox, y + oy);
    rect.wasPacked = true;
    if (!fixed) outer.size.y = Math.max(outer.size.y, y + h);
  };

  for (const [k, rect] of sorted.entries()) {
    if (space !== undefined) {
      const need = lowest[k]!;
      for (let i = 0; i < width && Number.isFinite(need); i++) {
        while (Number.isFinite(limit[i]!) && limit[i]! - skyline[i]! < need && limit[i]! < end) [skyline[i], limit[i]] = rangeOf(i, limit[i]!);
      }
    }
    const w = rect.size.x;
    const h = rect.size.y;
    const ways = turns(rect) ? [false, true] : [false];

    if (waste && free.length > 0) {
      // The waste map: the free rectangle with the best short side fit, then the higher place, then the place on the left
      let pick: { f: Box; turn: boolean; s1: number; s2: number } | undefined;
      for (const f of free) {
        for (const turn of ways) {
          const bw = turn ? h : w;
          const bh = turn ? w : h;
          if (f.x0 + bw > f.x1 || f.y0 + bh > f.y1) continue;
          const lw = f.x1 - f.x0 - bw;
          const lh = f.y1 - f.y0 - bh;
          const s1 = Math.min(lw, lh);
          const s2 = Math.max(lw, lh);
          if (pick === undefined || s1 < pick.s1 || (s1 === pick.s1 && (s2 < pick.s2 || (s2 === pick.s2 && (f.y0 < pick.f.y0 || (f.y0 === pick.f.y0 && f.x0 < pick.f.x0)))))) {
            pick = { f, turn, s1, s2 };
          }
        }
      }
      if (pick !== undefined) {
        const bw = pick.turn ? h : w;
        const bh = pick.turn ? w : h;
        const { x0, y0 } = pick.f;
        put(rect, x0, y0, bw, bh, pick.turn);
        free = cut(free, { x0, y0, x1: x0 + bw, y1: y0 + bh }, minW, minH).free;
        countMove(MOVES.wasteFill);
        continue;
      }
    }

    // The skyline: the best place of the rule, and the place of `bl` for the move count of `mw`
    let best: Place | undefined;
    let low: Place | undefined;
    let fits = false;
    const tryOn = (sky: Float64Array, lim: Float64Array | undefined, turn: boolean): void => {
      const bw = turn ? h : w;
      const bh = turn ? w : h;
      const cells = Math.ceil(bw);
      if (cells > width) return;
      fits = true;
      const s = scanWindows(sky, width, cells, bh, space === undefined ? end : Infinity, lim);
      if (!Number.isFinite(s.y)) return;
      const bl: Place = { x: s.x, y: s.y, cells, w: bw, h: bh, turn, waste: 0, first: s.first, sky, lim };
      if (better("bl", bl, low)) low = bl;
      const own = rule === "bl" ? bl : { ...bl, x: s.wx, y: s.wy, waste: s.waste };
      if (better(rule, own, best)) best = own;
    };
    for (const turn of ways) tryOn(skyline, space === undefined ? undefined : limit, turn);
    if (best === undefined && space !== undefined && fits) {
      // The second try: each cell goes to its first free range with room for the box
      for (const turn of ways) {
        const bh = turn ? w : h;
        const sky = skyline.slice();
        const lim = limit.slice();
        for (let i = 0; i < width; i++) {
          while (Number.isFinite(lim[i]!) && lim[i]! - sky[i]! < bh && lim[i]! < end) [sky[i], lim[i]] = rangeOf(i, lim[i]!);
        }
        tryOn(sky, lim, turn);
      }
    }

    if (best === undefined) {
      if (fits || fixed) continue;
      // The box is wider than all the cells: it goes at the left edge, under each other box
      let y = 0;
      for (let i = 0; i < width; i++) if (Number.isFinite(skyline[i]!) && skyline[i]! > y) y = skyline[i]!;
      if (space !== undefined) {
        for (let moved = true; moved; ) {
          moved = false;
          for (let i = 0; i < width; i++) {
            if (!Number.isFinite(skyline[i]!)) continue;
            const [s, e] = rangeOf(i, y);
            const next = s > y ? s : e < y + h ? rangeOf(i, e)[0] : y;
            if (next > y && Number.isFinite(next)) {
              y = next;
              moved = true;
            }
          }
        }
      } else addGaps(skyline, 0, width, y);
      put(rect, 0, y, w, h, false);
      const top = y + h;
      for (let i = 0; i < width; i++) {
        if (space === undefined) skyline[i] = top;
        else if (!Number.isFinite(skyline[i]!)) continue;
        else if (top <= limit[i]!) skyline[i] = top;
        else [skyline[i], limit[i]] = rangeOf(i, top);
      }
      continue;
    }

    const place: Place = best;
    if (rule === "bl") {
      if (place.first >= 0 && place.x !== place.first) countMove(MOVES.skyline);
    } else if (low !== undefined && (low.x !== place.x || low.y !== place.y || low.turn !== place.turn)) countMove(MOVES.minWaste);
    addGaps(place.sky, place.x, place.x + place.cells, place.y);
    put(rect, place.x, place.y, place.w, place.h, place.turn);
    const top = place.y + place.h;
    for (let i = place.x; i < place.x + place.cells; i++) {
      skyline[i] = top;
      if (place.lim !== undefined) limit[i] = place.lim[i]!;
    }
  }
  return outer;
}
