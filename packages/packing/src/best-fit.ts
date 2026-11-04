// The best-fit packer of roadmap item k25 (Burke 2004): it chooses the box for the lowest gap of a skyline, not a gap for the
// next box of a list. This code has no turn of the boxes and no last step for towers. `docs/research/CATALOG.md` tells it.

import { EPS } from "./contract.ts";
import { countMove, MOVES } from "./moves.ts";
import { orderRects, type ItemLink, type ItemOrder } from "./order.ts";
import type { Rect } from "./rect.ts";

/**
 * The sides of a gap for a box of `bestFit`, from Burke 2004 as Aşık 2009 tells them.
 *
 * - `left`: the box goes to the left edge of the gap.
 * - `tall`: the box goes next to the taller neighbor of the gap.
 * - `short`: the box goes next to the shorter neighbor of the gap.
 */
export const BEST_FIT_SIDES: readonly ["left", "tall", "short"] = Object.freeze(["left", "tall", "short"] as const);

/** A side of a gap of `bestFit`. `BEST_FIT_SIDES` tells each side. */
export type BestFitSide = (typeof BEST_FIT_SIDES)[number];

/** The options of `runBestFit` */
export interface BestFitOptions {
  /** The order of the boxes of equal width: the first one wins. The default `height-desc` is the rule of Burke 2004. */
  sortOrder?: ItemOrder;
  /** The links between the rectangles, as indexes into the array of the rectangles. Only a graph order reads them. */
  links?: readonly ItemLink[];
  /** The side of the gap for a box. The default is `left`. `BEST_FIT_SIDES` tells each side. */
  side?: BestFitSide;
}

/** The operation counts of one run of `runBestFit`. The tests read them. */
export interface BestFitCounts {
  /** The rounds of the main loop: each one places a box or raises a gap. */
  rounds: number;
  /** The segments and the boxes that the rounds examined. */
  scans: number;
}

/** A part of the skyline: the width from `x` at the height `y`. */
interface Segment {
  x: number;
  w: number;
  y: number;
}

/** This function joins each neighbor of equal height at the index `at` of a skyline. */
function join(sky: Segment[], at: number): void {
  for (let i = Math.min(at, sky.length - 2); i >= Math.max(0, at - 1); i--) {
    const a = sky[i]!;
    const b = sky[i + 1]!;
    if (Math.abs(a.y - b.y) > EPS) continue;
    a.w = b.x + b.w - a.x;
    a.y = Math.max(a.y, b.y);
    sky.splice(i + 1, 1);
  }
}

/** This function gives the index of the lowest segment. The left segment wins a tie. */
function lowestGap(sky: readonly Segment[]): number {
  let at = 0;
  for (let i = 1; i < sky.length; i++) if (sky[i]!.y < sky[at]!.y) at = i;
  return at;
}

/** This function gives the index of the widest box that fits a gap, or -1. The first box of equal width wins. */
function widestFit<T>(left: readonly Rect<T>[], gap: Segment, end: number): number {
  let at = -1;
  for (let k = 0; k < left.length; k++) {
    const r = left[k]!;
    if (r.size.x <= gap.w + EPS && gap.y + r.size.y <= end + EPS && (at < 0 || r.size.x > left[at]!.size.x)) at = k;
  }
  return at;
}

/** This function tells if a box goes to the right edge of a gap. A tie of the neighbors gives the left edge. */
function atRight(sky: readonly Segment[], at: number, side: BestFitSide): boolean {
  if (side === "left") return false;
  const l = sky[at - 1]?.y ?? Infinity;
  const r = sky[at + 1]?.y ?? Infinity;
  return side === "tall" ? r > l : r < l;
}

/**
 * This function packs rectangles with the best-fit rule, and it gives the operation counts. The tests read the counts.
 *
 * - Each round finds the lowest gap, then the widest box that fits it. Without such a box, the gap rises to its lower neighbor.
 * - The cost is `O(n^2)`: at most `2n + 1` rounds, and each round examines at most `2n + 1` segments and boxes.
 * - A box that is over a fixed height in each gap is not packed. The strategy does not accept a `locked` rectangle.
 */
export function runBestFit<T>(rects: Rect<T>[], outer: Rect<T>, options: BestFitOptions = {}): BestFitCounts {
  const side = options.side ?? "left";
  if (!(BEST_FIT_SIDES as readonly string[]).includes(side)) throw new RangeError(`The side of best-fit is one of ${BEST_FIT_SIDES.join(", ")}, not "${String(side)}".`);
  const counts: BestFitCounts = { rounds: 0, scans: 0 };
  const W = outer.size.x;
  if (!(W > 0)) return counts;
  const end = outer.fixedSize ? outer.size.y : Infinity;
  const left = orderRects(rects, options.sortOrder ?? "height-desc", options.links).filter((r) => !r.wasPacked && r.size.x > 0 && r.size.y > 0);
  const sky: Segment[] = [{ x: 0, w: W, y: 0 }];
  let top = 0;
  while (left.length > 0) {
    counts.rounds++;
    counts.scans += sky.length + left.length;
    const at = lowestGap(sky);
    const gap = sky[at]!;
    const k = widestFit(left, gap, end);
    if (k < 0) {
      if (sky.length === 1) break;
      gap.y = Math.min(sky[at - 1]?.y ?? Infinity, sky[at + 1]?.y ?? Infinity);
      countMove(MOVES.gapRaise);
      join(sky, at);
      continue;
    }
    if (k > 0) countMove(MOVES.gapPick);
    const r = left.splice(k, 1)[0]!;
    const w = Math.min(r.size.x, gap.w);
    const right = atRight(sky, at, side);
    const x = right ? gap.x + gap.w - w : gap.x;
    const y = gap.y + r.size.y;
    r.position.set(x + outer.position.x, gap.y + outer.position.y);
    r.wasPacked = true;
    top = Math.max(top, y);
    const rest = gap.w - w;
    if (rest <= EPS) gap.y = y;
    else if (right) sky.splice(at, 1, { x: gap.x, w: rest, y: gap.y }, { x, w, y });
    else sky.splice(at, 1, { x, w, y }, { x: x + w, w: rest, y: gap.y });
    join(sky, right && rest > EPS ? at + 1 : at);
  }
  if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, top);
  return counts;
}
