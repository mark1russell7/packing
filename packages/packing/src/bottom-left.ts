// The slide packers of roadmap item k25: each box starts above the strip at the right, and it slides down and left until it
// stops. A slide does not jump. Thus a hole with a closed top stays empty. `docs/research/CATALOG.md` tells the sources.

import { EPS } from "./contract.ts";
import { countMove, MOVES } from "./moves.ts";
import { orderRects, type ItemLink, type ItemOrder } from "./order.ts";
import type { Rect } from "./rect.ts";

/**
 * The rules of `bottomLeft` to slide a box.
 *
 * - `baker`: the box moves down as far as it goes, then left as far as it goes. It does this again until it stops (Baker 1980).
 * - `liu-teng`: the box moves down as far as it goes. It moves left only until it can move down again (Liu 1999).
 */
export const BOTTOM_LEFT_RULES: readonly ["baker", "liu-teng"] = Object.freeze(["baker", "liu-teng"] as const);

/** A rule of `bottomLeft`: `baker` or `liu-teng`. `BOTTOM_LEFT_RULES` tells each rule. */
export type BottomLeftRule = (typeof BOTTOM_LEFT_RULES)[number];

/** The options of `runBottomLeft` */
export interface BottomLeftOptions {
  /** The order of the rectangles before the packing. The default is `width-desc`, the order of the bound of Baker 1980. */
  sortOrder?: ItemOrder;
  /** The links between the rectangles, as indexes into the array of the rectangles. Only a graph order reads them. */
  links?: readonly ItemLink[];
  /** The rule to slide a box. The default is `baker`. `BOTTOM_LEFT_RULES` tells each rule. */
  rule?: BottomLeftRule;
}

/** The operation counts of one run of `runBottomLeft`. The tests read them. */
export interface BottomLeftCounts {
  /** The legs of all slides: a move down or a move left. */
  legs: number;
  /** The walls that the slides examined. Each leg examines each wall one or more times. */
  scans: number;
}

/** A placed box or a locked rectangle, in the coordinates of the outer rectangle. */
interface Wall {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** This function gives the y of a box after a move down: the top of the highest wall below it, else 0. */
function dropTo(walls: readonly Wall[], x: number, w: number, y: number): number {
  let to = 0;
  for (const o of walls) if (o.x0 < x + w - EPS && x < o.x1 - EPS && o.y1 <= y + EPS && o.y1 > to) to = o.y1;
  return Math.min(to, y);
}

/** This function gives the x of a box after a move left: the right edge of the nearest wall at its left, else 0. */
function leftTo(walls: readonly Wall[], x: number, y: number, h: number): number {
  let to = 0;
  for (const o of walls) if (o.y0 < y + h - EPS && y < o.y1 - EPS && o.x1 <= x + EPS && o.x1 > to) to = o.x1;
  return Math.min(to, x);
}

/**
 * This function gives the x of a box after a left move of the rule `liu-teng`. The box stops at the first x with no wall
 * under it, or at `limit`. A box on the floor of the strip goes to `limit`. `counts` gets the walls that the search examines.
 */
function nextOpening(walls: readonly Wall[], x: number, w: number, y: number, limit: number, counts: BottomLeftCounts): number {
  if (y <= EPS) return limit;
  let at = x;
  for (;;) {
    counts.scans += walls.length;
    let low = Infinity;
    for (const o of walls) if (Math.abs(o.y1 - y) <= EPS && o.x0 < at + w - EPS && at < o.x1 - EPS) low = Math.min(low, o.x0);
    if (low === Infinity) return at;
    const next = low - w;
    if (next <= limit) return limit;
    at = next;
  }
}

/** This function moves a box until it stops, and it gives the place. The move count has each box that turns down after a left move. */
function slide(walls: readonly Wall[], w: number, h: number, start: { x: number; y: number }, rule: BottomLeftRule, counts: BottomLeftCounts): { x: number; y: number } {
  let { x, y } = start;
  let turns = 0;
  for (;;) {
    counts.scans += walls.length;
    const low = dropTo(walls, x, w, y);
    if (low < y) {
      counts.legs++;
      if (x !== start.x) turns++;
      y = low;
    }
    counts.scans += walls.length;
    const limit = leftTo(walls, x, y, h);
    const next = rule === "baker" ? limit : nextOpening(walls, x, w, y, limit, counts);
    if (next >= x) break;
    counts.legs++;
    x = next;
  }
  if (turns > 0) countMove(MOVES.slide);
  return { x, y };
}

/**
 * This function packs rectangles with a slide rule, and it gives the operation counts. The tests read the counts.
 *
 * - The cost is `O(n L)`, with `L` the legs of all slides. The worst case is `O(n^3)`, thus this code does not meet `O(n^2)`.
 * - Each box starts above each wall at the right edge. A box with a final top over a fixed height is not packed.
 * - A `locked` rectangle keeps its position, and it stops a slide as a placed box does.
 */
export function runBottomLeft<T>(rects: Rect<T>[], outer: Rect<T>, options: BottomLeftOptions = {}): BottomLeftCounts {
  const rule = options.rule ?? "baker";
  if (!(BOTTOM_LEFT_RULES as readonly string[]).includes(rule)) throw new RangeError(`The rule of bottom-left is one of ${BOTTOM_LEFT_RULES.join(", ")}, not "${String(rule)}".`);
  const counts: BottomLeftCounts = { legs: 0, scans: 0 };
  for (const r of rects) if (r.locked) r.wasPacked = true;
  const W = outer.size.x;
  if (!(W > 0)) return counts;
  const ox = outer.position.x;
  const oy = outer.position.y;
  const end = outer.fixedSize ? outer.size.y : Infinity;
  const walls: Wall[] = [];
  let top = 0;
  for (const r of rects) {
    if (!r.locked) continue;
    const wall = { x0: r.position.x - ox, y0: r.position.y - oy, x1: r.right() - ox, y1: r.bottom() - oy };
    walls.push(wall);
    top = Math.max(top, wall.y1);
  }
  for (const r of orderRects(rects, options.sortOrder ?? "width-desc", options.links)) {
    const w = r.size.x;
    const h = r.size.y;
    if (r.wasPacked || !(w > 0 && h > 0)) continue;
    const { x, y } = slide(walls, w, h, { x: Math.max(0, W - w), y: top }, rule, counts);
    if (y + h > end + EPS) continue;
    r.position.set(x + ox, y + oy);
    r.wasPacked = true;
    walls.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    top = Math.max(top, y + h);
  }
  if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, top);
  return counts;
}
