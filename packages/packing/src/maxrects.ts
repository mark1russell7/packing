// The MaxRects family of roadmap item k24 (docs/PACKER.md, "The MaxRects family"). The packer keeps a list of the
// maximal free rectangles. Each box goes to the top-left corner of one free rectangle. A rule chooses the free rectangle.
// Then the box cuts each free rectangle that it hits into at most four parts, and the list loses each part that is in another.

import { countMove, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";
import { spaceParts, type FreeSpace, type FreeSpan, type SpaceRect } from "./space.ts";

/**
 * The rules of `maxrects` to choose a free rectangle for a box.
 *
 * - `bssf`: the best short side fit. The smaller leftover side is the smallest.
 * - `blsf`: the best long side fit. The larger leftover side is the smallest.
 * - `baf`: the best area fit. The leftover area is the smallest.
 * - `bl`: the bottom-left rule. The bottom edge of the box is the highest, then the left edge is the leftmost.
 * - `cp`: the contact point rule. The box touches the most length of the edges of the frame, the boxes and the obstacles.
 */
export const MAXRECTS_RULES: readonly ["bssf", "blsf", "baf", "bl", "cp"] = Object.freeze(["bssf", "blsf", "baf", "bl", "cp"] as const);

/** A rule of `maxrects`: `bssf`, `blsf`, `baf`, `bl` or `cp`. `MAXRECTS_RULES` tells each rule. */
export type MaxRectsRule = (typeof MAXRECTS_RULES)[number];

/** The number of bands that the default band height gives. The default band height is the height to cut divided by this number. */
export const MAXRECTS_BANDS = 128;

/** The options of `packMaxRects` */
export interface MaxRectsOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the free rectangles are
   * exact: the outer rectangle less the locked rectangles. Another space gives an inner approximation with bands.
   */
  space?: FreeSpace;
  /** The rule to choose a free rectangle. The default is `bssf`. */
  rule?: MaxRectsRule;
  /**
   * The largest height of a band of the approximation of a space that is not plain. The bands have equal heights. The
   * default is the height to cut divided by `MAXRECTS_BANDS`. A fixed height cuts the height. A free height cuts to the
   * lowest edge of the obstacles that are not rectangles.
   */
  bandHeight?: number;
  /** The rectangles that can turn by 90 degrees. Without it, no rectangle turns. A locked rectangle does not turn. */
  turnable?: ReadonlySet<unknown>;
  /**
   * The rectangles that the packing turned. Each call turns back the rectangles of this set first, and then it clears the
   * set. Thus a size search can pack the same rectangles many times.
   */
  turned?: Set<unknown>;
}

/** A rectangle with its four edges, in the coordinates of the outer rectangle. The waste map of `packSkyline` also uses it. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A place for a box: a free rectangle, the turn, and the two scores of the rule. Lower scores are better. */
interface Choice {
  index: number;
  turn: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  s1: number;
  s2: number;
}

/** The result of `runMaxRects`: the outer rectangle and the free rectangles at the end. */
export interface MaxRectsRun<T> {
  outer: Rect<T>;
  /** The free rectangles at the end, in the coordinates of the rectangles. Each one is as wide as the narrowest box and as high as the lowest box. */
  free: SpaceRect[];
}

/** This function tells if the box `a` is fully in the box `b`. */
function inside(a: Box, b: Box): boolean {
  return a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
}

/**
 * This function cuts each free rectangle that the box `b` hits into at most four parts. A part with a side less than
 * `minW` or `minH` goes, because no box fits in it. A part that is in another rectangle of the list goes.
 * The function gives the new list and the number of free rectangles that the box hit. The waste map of `packSkyline` also uses it.
 */
export function cut(free: Box[], b: Box, minW: number, minH: number): { free: Box[]; hits: number } {
  const kept: Box[] = [];
  // A part spans the box on one axis and touches the box on the other axis. Thus a part of one side is not in a part of
  // another side. A kept rectangle with the part in it has an edge on the same side of the box.
  const near: Box[][] = [[], [], [], []];
  // For each side of the box (0 left, 1 right, 2 top, 3 bottom), the parts that stay so far. Each part has five numbers
  // in the list: its four edges and its index in the order of creation.
  const stay: number[][] = [[], [], [], []];
  let made = 0;
  let hits = 0;
  // A part stays when no other part holds more than it, and no equal part comes before it. This rule does not use an order.
  // Thus a new part goes when a part that stays holds it. Else it removes each part that it holds.
  const add = (side: number, x0: number, y0: number, x1: number, y1: number): void => {
    if (x1 - x0 < minW || y1 - y0 < minH) return;
    const own = stay[side]!;
    for (let k = 0; k < own.length; ) {
      const qx0 = own[k]!;
      const qy0 = own[k + 1]!;
      const qx1 = own[k + 2]!;
      const qy1 = own[k + 3]!;
      if (x0 >= qx0 && y0 >= qy0 && x1 <= qx1 && y1 <= qy1) return;
      if (qx0 >= x0 && qy0 >= y0 && qx1 <= x1 && qy1 <= y1) {
        // The last part of the list takes the place of the removed part
        const last = own.length - 5;
        if (k !== last) for (let n = 0; n < 5; n++) own[k + n] = own[last + n]!;
        own.length = last;
      } else k += 5;
    }
    own.push(x0, y0, x1, y1, made++);
  };
  for (const f of free) {
    if (b.x0 >= f.x1 || b.x1 <= f.x0 || b.y0 >= f.y1 || b.y1 <= f.y0) {
      kept.push(f);
      if (f.x1 === b.x0) near[0]!.push(f);
      if (f.x0 === b.x1) near[1]!.push(f);
      if (f.y1 === b.y0) near[2]!.push(f);
      if (f.y0 === b.y1) near[3]!.push(f);
      continue;
    }
    hits++;
    if (b.x0 > f.x0) add(0, f.x0, f.y0, b.x0, f.y1);
    if (b.x1 < f.x1) add(1, b.x1, f.y0, f.x1, f.y1);
    if (b.y0 > f.y0) add(2, f.x0, f.y0, f.x1, b.y0);
    if (b.y1 < f.y1) add(3, f.x0, b.y1, f.x1, f.y1);
  }
  if (made === 0) return { free: kept, hits };
  // Each part is in the free rectangle that it comes from. Thus no kept rectangle is in a part.
  // The parts that stay go to the list in the order of creation.
  const out: (Box | undefined)[] = new Array<Box | undefined>(made).fill(undefined);
  for (let side = 0; side < 4; side++) {
    const own = stay[side]!;
    for (let k = 0; k < own.length; k += 5) {
      const p: Box = { x0: own[k]!, y0: own[k + 1]!, x1: own[k + 2]!, y1: own[k + 3]! };
      let drop = false;
      for (const q of near[side]!) {
        if (inside(p, q)) {
          drop = true;
          break;
        }
      }
      if (!drop) out[own[k + 4]!] = p;
    }
  }
  for (const p of out) if (p !== undefined) kept.push(p);
  return { free: kept, hits };
}

/** The edges of the boxes on one axis: for each coordinate, the flat list of the ranges on the other axis. */
type Edges = Map<number, number[]>;

/** This function adds a range to the edges at a coordinate. */
function addEdge(edges: Edges, at: number, a: number, b: number): void {
  const list = edges.get(at);
  if (list === undefined) edges.set(at, [a, b]);
  else list.push(a, b);
}

/** This function gives the length of the common part of the range from `a` to `b` and the edges at a coordinate. */
function touch(edges: Edges, at: number, a: number, b: number): number {
  const list = edges.get(at);
  if (list === undefined) return 0;
  let sum = 0;
  for (let i = 0; i < list.length; i += 2) sum += Math.max(0, Math.min(b, list[i + 1]!) - Math.max(a, list[i]!));
  return sum;
}

/**
 * This function gives the walls of a space that is not plain: the parts of the bands that are not free. The bands cut the
 * height from 0 to `top`. Two walls of neighbour bands with the same span become one wall.
 */
function bandWalls(query: (y0: number, y1: number) => FreeSpan[], w: number, top: number, bandHeight: number, grow: number, end: number): Box[] {
  const walls: Box[] = [];
  const count = Math.max(1, Math.ceil(top / bandHeight));
  let open = new Map<string, Box>();
  for (let k = 0; k < count; k++) {
    const y0 = (top * k) / count;
    const y1 = k === count - 1 ? top : (top * (k + 1)) / count;
    // With a growth of the query less than 0, the band asks for a larger strip. Thus the bands cover each y of the outline.
    const spans = query(Math.max(0, y0 - grow), Math.min(end, y1 + grow));
    const next = new Map<string, Box>();
    let x = 0;
    const block = (a: number, b: number): void => {
      if (!(b > a)) return;
      const key = `${a}|${b}`;
      const wall = open.get(key);
      if (wall !== undefined) {
        wall.y1 = y1;
        open.delete(key);
        next.set(key, wall);
      } else next.set(key, { x0: a, y0, x1: b, y1 });
    };
    for (const s of spans) {
      const start = Math.max(0, Math.min(w, s.start));
      const stop = Math.max(0, Math.min(w, s.end));
      if (!(stop > start)) continue;
      block(x, start);
      x = Math.max(x, stop);
    }
    block(x, w);
    walls.push(...open.values());
    open = next;
  }
  walls.push(...open.values());
  return walls;
}

/**
 * This function gives the height of the frame of a free-rectangle packer and its walls. The walls are the rectangle holes
 * and the bands of a space that is not plain. `heights` is the sum of the box heights. The guillotine packer also uses it.
 */
export function wallsOf<T>(rects: readonly Rect<T>[], outer: Rect<T>, space: FreeSpace | undefined, heights: number, bandHeight?: number): { H: number; walls: Box[] } {
  const W = outer.size.x;
  const ox = outer.position.x;
  const oy = outer.position.y;
  const fixed = outer.fixedSize;
  const parts = space === undefined ? undefined : spaceParts(space);
  // The rectangle holes: the holes of the space, or the locked rectangles. The bands of another space hold its holes.
  const holes: Box[] = [];
  if (parts !== undefined) for (const h of parts.holes) holes.push({ x0: h.x - ox, y0: h.y - oy, x1: h.x + h.w - ox, y1: h.y + h.h - oy });
  else if (space === undefined || space.plain) {
    for (const r of rects) if (r.locked) holes.push({ x0: r.position.x - ox, y0: r.position.y - oy, x1: r.right() - ox, y1: r.bottom() - oy });
  }

  // A free height gets room below each obstacle for each box. The content gives the height at the end.
  let floor = parts?.bottom ?? 0;
  for (const h of holes) floor = Math.max(floor, h.y1);
  const H = fixed ? outer.size.y : floor + heights;
  const walls: Box[] = [];
  for (const h of holes) {
    const wall = { x0: Math.max(0, h.x0), y0: Math.max(0, h.y0), x1: Math.min(W, h.x1), y1: Math.min(H, h.y1) };
    if (wall.x1 > wall.x0 && wall.y1 > wall.y0) walls.push(wall);
  }
  if (space !== undefined && !space.plain) {
    const top = parts === undefined ? H : fixed ? H : Math.min(H, parts.bottom);
    if (top > 0) {
      const height = bandHeight ?? top / MAXRECTS_BANDS;
      if (!(height > 0)) throw new RangeError(`The band height of maxrects is more than 0, not ${String(height)}.`);
      const query = parts === undefined ? (y0: number, y1: number) => space.band(y0 + oy, y1 + oy) : (y0: number, y1: number) => parts.bare(y0 + oy, y1 + oy);
      const shifted = (y0: number, y1: number): FreeSpan[] => query(y0, y1).map((s) => ({ start: s.start - ox, end: s.end - ox }));
      walls.push(...bandWalls(shifted, W, top, height, parts === undefined ? 0 : Math.max(0, -parts.d), fixed ? H : Infinity));
    }
  }
  return { H, walls };
}

/**
 * This function packs rectangles with MaxRects, as `packMaxRects` tells. It also gives the free rectangles at the end.
 * The tests read them. The package root does not export this function.
 */
export function runMaxRects<T>(rects: Rect<T>[], outer: Rect<T>, options: MaxRectsOptions = {}): MaxRectsRun<T> {
  const rule = options.rule ?? "bssf";
  if (!(MAXRECTS_RULES as readonly string[]).includes(rule)) throw new RangeError(`The rule of maxrects is one of ${MAXRECTS_RULES.join(", ")}, not "${String(rule)}".`);
  const turned = options.turned;
  if (turned !== undefined) {
    for (const r of rects) if (turned.has(r)) r.size.set(r.size.y, r.size.x);
    turned.clear();
  }
  for (const r of rects) if (r.locked) r.wasPacked = true;

  const W = outer.size.x;
  if (!(W > 0)) return { outer, free: [] };
  const ox = outer.position.x;
  const oy = outer.position.y;
  const fixed = outer.fixedSize;
  const space = options.space;
  const turnable = options.turnable;
  const sorted = rects.toSorted(compareRects(options.sortOrder ?? "height-desc")).filter((r) => !r.wasPacked && r.size.x > 0 && r.size.y > 0);

  // The smallest width and height of the boxes. A turnable box counts its short side for the two. A free rectangle with
  // less room has no use, thus the list does not keep it.
  let minW = Infinity;
  let minH = Infinity;
  let heights = 0;
  for (const r of sorted) {
    const turns = turnable?.has(r) === true;
    const short = Math.min(r.size.x, r.size.y);
    minW = Math.min(minW, turns ? short : r.size.x);
    minH = Math.min(minH, turns ? short : r.size.y);
    heights += turns ? Math.max(r.size.x, r.size.y) : r.size.y;
  }

  const { H, walls } = wallsOf(rects, outer, space, heights, options.bandHeight);
  let free: Box[] = [{ x0: 0, y0: 0, x1: W, y1: H }];
  for (const wall of walls) free = cut(free, wall, minW, minH).free;

  const cp = rule === "cp";
  const vertical: Edges = new Map();
  const horizontal: Edges = new Map();
  const mark = (b: Box): void => {
    if (!cp) return;
    addEdge(vertical, b.x0, b.y0, b.y1);
    addEdge(vertical, b.x1, b.y0, b.y1);
    addEdge(horizontal, b.y0, b.x0, b.x1);
    addEdge(horizontal, b.y1, b.x0, b.x1);
  };
  for (const wall of walls) mark(wall);
  const contact = (x: number, y: number, w: number, h: number): number => {
    let sum = 0;
    if (x === 0) sum += h;
    if (x + w === W) sum += h;
    if (y === 0) sum += w;
    if (fixed && y + h === H) sum += w;
    return sum + touch(vertical, x, y, y + h) + touch(vertical, x + w, y, y + h) + touch(horizontal, y, x, x + w) + touch(horizontal, y + h, x, x + w);
  };
  // A space that is not plain checks each place, because the bands only approximate the outline
  const check = space !== undefined && !space.plain;
  let bottom = 0;
  for (const wall of walls) bottom = Math.max(bottom, wall.y1);

  for (const rect of sorted) {
    const w = rect.size.x;
    const h = rect.size.y;
    const turns = turnable?.has(rect) === true && w !== h;
    const banned = new Set<number>();
    let best: Choice | undefined;
    let low: Choice | undefined;
    for (;;) {
      best = undefined;
      low = undefined;
      for (let i = 0; i < free.length; i++) {
        const f = free[i]!;
        for (let t = 0; t < (turns ? 2 : 1); t++) {
          if (banned.has(2 * i + t)) continue;
          const bw = t === 1 ? h : w;
          const bh = t === 1 ? w : h;
          if (f.x0 + bw > f.x1 || f.y0 + bh > f.y1) continue;
          const lw = f.x1 - f.x0 - bw;
          const lh = f.y1 - f.y0 - bh;
          let s1: number;
          let s2: number;
          switch (rule) {
            case "bssf":
              s1 = Math.min(lw, lh);
              s2 = Math.max(lw, lh);
              break;
            case "blsf":
              s1 = Math.max(lw, lh);
              s2 = Math.min(lw, lh);
              break;
            case "baf":
              s1 = (f.x1 - f.x0) * (f.y1 - f.y0) - bw * bh;
              s2 = Math.min(lw, lh);
              break;
            case "bl":
              s1 = f.y0 + bh;
              s2 = f.x0;
              break;
            case "cp":
              s1 = -contact(f.x0, f.y0, bw, bh);
              s2 = f.y0 + bh;
              break;
          }
          const x = f.x0;
          const y = f.y0;
          // A choice object comes only for a better place
          if (best === undefined || s1 < best.s1 || (s1 === best.s1 && (s2 < best.s2 || (s2 === best.s2 && (y < best.y || (y === best.y && x < best.x)))))) {
            best = { index: i, turn: t === 1, x, y, w: bw, h: bh, s1, s2 };
          }
          // Only the move count of a rule other than `bl` reads the place of `bl`
          if (rule === "bl") continue;
          const ly = y + bh;
          if (low === undefined || ly < low.s1 || (ly === low.s1 && x < low.s2)) low = { index: i, turn: t === 1, x, y, w: bw, h: bh, s1: ly, s2: x };
        }
      }
      if (best === undefined || !check || space.fits({ x: best.x + ox, y: best.y + oy, w: best.w, h: best.h })) break;
      banned.add(2 * best.index + (best.turn ? 1 : 0));
    }

    let place: Box;
    if (best !== undefined) {
      place = { x0: best.x, y0: best.y, x1: best.x + best.w, y1: best.y + best.h };
      if (rule !== "bl" && low !== undefined && (low.x !== best.x || low.y !== best.y || low.turn !== best.turn)) countMove(MOVES[rule]);
      if (best.turn) {
        rect.size.set(best.w, best.h);
        turned?.add(rect);
      }
    } else {
      // No free rectangle has room. A fixed size leaves the box out. A free height puts it under all others, at the left edge.
      if (fixed) continue;
      place = { x0: 0, y0: bottom, x1: w, y1: bottom + h };
    }
    rect.position.set(place.x0 + ox, place.y0 + oy);
    rect.wasPacked = true;
    bottom = Math.max(bottom, place.y1);
    const result = cut(free, { x0: place.x0, y0: place.y0, x1: Math.min(W, place.x1), y1: place.y1 }, minW, minH);
    free = result.free;
    if (result.hits >= 2) countMove(MOVES.split);
    mark(place);
    if (!fixed) outer.size.y = Math.max(outer.size.y, place.y1);
  }
  return { outer, free: free.map((f) => ({ x: f.x0 + ox, y: f.y0 + oy, w: f.x1 - f.x0, h: f.y1 - f.y0 })) };
}

/**
 * This function packs rectangles into an outer rectangle with MaxRects of Jylänki (2010). It keeps the list of the maximal
 * free rectangles, and it does not change the width of the outer rectangle.
 *
 * - Each box goes to the top-left corner of the free rectangle that `options.rule` chooses. `MAXRECTS_RULES` tells the rules.
 * - A tie goes to the higher place, then to the place on the left, then to the first free rectangle of the list.
 * - A `locked` rectangle keeps its position, and the free rectangles go around it.
 * - With a space that is not plain, the free rectangles start from bands of the outline. `MaxRectsOptions` tells the bands.
 * - Without `fixedSize`, the height of the outer rectangle grows to the content. With `fixedSize`, a box that does not fit
 *   is not packed: its `wasPacked` stays `false`.
 * - The default sort order is `height-desc`. The order of the array of the caller stays.
 */
export function packMaxRects<T>(rects: Rect<T>[], outer: Rect<T>, options: MaxRectsOptions = {}): Rect<T> {
  return runMaxRects(rects, outer, options).outer;
}
