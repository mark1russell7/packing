// The guillotine family of roadmap item k23 (docs/PACKER.md, "The guillotine family"). The packer keeps a list of free
// rectangles that do not overlap. Each box goes to the top-left corner of one free rectangle. A choice rule chooses the
// free rectangle. Then one straight cut of a split rule makes two new free rectangles from the rest of it.

import { wallsOf, type Box } from "./maxrects.ts";
import { countMove, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";
import type { FreeSpace, SpaceRect } from "./space.ts";

/**
 * The rules of `guillotine` to choose a free rectangle for a box (Jylänki 2010). A lower score is better.
 *
 * - `baf`: the best area fit. The score is the leftover area.
 * - `bssf`: the best short side fit. The score is the smaller leftover side.
 * - `blsf`: the best long side fit. The score is the larger leftover side.
 * - `waf`, `wssf`, `wlsf`: the worst fits. The score is the score of `baf`, `bssf` or `blsf` times -1.
 */
export const GUILLOTINE_CHOICES: readonly ["baf", "bssf", "blsf", "waf", "wssf", "wlsf"] = Object.freeze(["baf", "bssf", "blsf", "waf", "wssf", "wlsf"] as const);

/** A choice rule of `guillotine`. `GUILLOTINE_CHOICES` tells each rule. */
export type GuillotineChoice = (typeof GUILLOTINE_CHOICES)[number];

/**
 * The rules of `guillotine` to split a free rectangle after a box goes in its corner (Jylänki 2010). The free rectangle is
 * `W` by `H`, and the box is `w` by `h`. The leftovers are `W - w` and `H - h`.
 *
 * - A horizontal cut continues the bottom edge of the box across the free rectangle. A vertical cut continues its right edge.
 * - `sas`: the shorter leftover axis. The cut is horizontal when `W - w <= H - h`.
 * - `las`: the longer leftover axis. The cut is horizontal when `W - w > H - h`.
 * - `sa`: the shorter axis. The cut is horizontal when `W <= H`.
 * - `la`: the longer axis. The cut is horizontal when `W > H`.
 * - `minas`: the min area. The cut is horizontal when `w * (H - h) > (W - w) * h`. The part next to the box is then as small as possible.
 * - `maxas`: the max area. The cut is horizontal when `w * (H - h) <= (W - w) * h`. The two parts are then nearer in area.
 */
export const GUILLOTINE_SPLITS: readonly ["sas", "las", "sa", "la", "minas", "maxas"] = Object.freeze(["sas", "las", "sa", "la", "minas", "maxas"] as const);

/** A split rule of `guillotine`. `GUILLOTINE_SPLITS` tells each rule. */
export type GuillotineSplit = (typeof GUILLOTINE_SPLITS)[number];

/** The options of `packGuillotine` */
export interface GuillotineOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the free rectangles are
   * exact. Another space gives an inner approximation with the bands of `maxrects`.
   */
  space?: FreeSpace;
  /** The rule to choose a free rectangle. The default is `baf`. */
  choice?: GuillotineChoice;
  /** The rule to split a free rectangle. The default is `sas`. */
  split?: GuillotineSplit;
  /** The value `true` joins two free rectangles with a common full edge after each box. The default is `false`. */
  merge?: boolean;
  /** The rectangles that can turn by 90 degrees. Without it, no rectangle turns. A locked rectangle does not turn. */
  turnable?: ReadonlySet<unknown>;
  /** The rectangles that the packing turned. Each call turns back the rectangles of this set first, and then it clears the set. */
  turned?: Set<unknown>;
}

/** The result of `runGuillotine`: the outer rectangle and the free rectangles at the end. */
export interface GuillotineRun<T> {
  outer: Rect<T>;
  /** The free rectangles at the end, in the coordinates of the rectangles. No two of them overlap. */
  free: SpaceRect[];
}

/** This function gives the score of a choice rule for a box of `w` by `h` in the free rectangle `f`. A lower score is better. */
export function choiceScore(choice: GuillotineChoice, f: Box, w: number, h: number): number {
  const fw = f.x1 - f.x0;
  const fh = f.y1 - f.y0;
  const lw = fw - w;
  const lh = fh - h;
  switch (choice) {
    case "baf":
      return fw * fh - w * h;
    case "bssf":
      return Math.min(lw, lh);
    case "blsf":
      return Math.max(lw, lh);
    case "waf":
      return -(fw * fh - w * h);
    case "wssf":
      return -Math.min(lw, lh);
    case "wlsf":
      return -Math.max(lw, lh);
  }
}

/** This function tells if a split rule cuts the free rectangle `f` horizontally after a box of `w` by `h` goes in its corner. */
export function cutsAcross(split: GuillotineSplit, f: Box, w: number, h: number): boolean {
  const fw = f.x1 - f.x0;
  const fh = f.y1 - f.y0;
  const lw = fw - w;
  const lh = fh - h;
  switch (split) {
    case "sas":
      return lw <= lh;
    case "las":
      return lw > lh;
    case "sa":
      return fw <= fh;
    case "la":
      return fw > fh;
    case "minas":
      return w * lh > lw * h;
    case "maxas":
      return w * lh <= lw * h;
  }
}

/**
 * This function removes the box `b` from each free rectangle that it hits. A hit rectangle becomes at most four parts that
 * do not overlap. The first two parts are the full-height parts on the left and on the right. The other two are above
 * and below the box. A part stays only when `keep` accepts it. The order of the list stays.
 */
function carve(free: readonly Box[], b: Box, keep: (p: Box) => boolean): Box[] {
  const out: Box[] = [];
  for (const f of free) {
    if (b.x0 >= f.x1 || b.x1 <= f.x0 || b.y0 >= f.y1 || b.y1 <= f.y0) {
      out.push(f);
      continue;
    }
    const x0 = Math.max(f.x0, b.x0);
    const x1 = Math.min(f.x1, b.x1);
    const parts: Box[] = [
      { x0: f.x0, y0: f.y0, x1: b.x0, y1: f.y1 },
      { x0: b.x1, y0: f.y0, x1: f.x1, y1: f.y1 },
      { x0, y0: f.y0, x1, y1: b.y0 },
      { x0, y0: b.y1, x1, y1: f.y1 },
    ];
    for (const p of parts) if (p.x1 > p.x0 && p.y1 > p.y0 && keep(p)) out.push(p);
  }
  return out;
}

/**
 * This function joins two free rectangles when they have a common full edge, as the rectangle merge of Jylänki (2010). It
 * changes the list, and it gives the count of the joins. The rectangle `i` grows, and the rectangle `j` after it goes.
 */
export function mergeFree(free: Box[]): number {
  let joins = 0;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i]!;
      const b = free[j]!;
      if (a.x0 === b.x0 && a.x1 === b.x1) {
        if (a.y0 === b.y1) a.y0 = b.y0;
        else if (a.y1 === b.y0) a.y1 = b.y1;
        else continue;
      } else if (a.y0 === b.y0 && a.y1 === b.y1) {
        if (a.x0 === b.x1) a.x0 = b.x0;
        else if (a.x1 === b.x0) a.x1 = b.x1;
        else continue;
      } else continue;
      free.splice(j, 1);
      j--;
      joins++;
    }
  }
  return joins;
}

/** A place for a box: the index of its free rectangle, the turn, the size and the score. */
interface Choice {
  index: number;
  turn: boolean;
  w: number;
  h: number;
  score: number;
}

/**
 * This function packs rectangles with guillotine cuts, as `packGuillotine` tells. It also gives the free rectangles at the
 * end. The tests read them. The package root does not export this function.
 */
export function runGuillotine<T>(rects: Rect<T>[], outer: Rect<T>, options: GuillotineOptions = {}): GuillotineRun<T> {
  const choice = options.choice ?? "baf";
  const split = options.split ?? "sas";
  if (!(GUILLOTINE_CHOICES as readonly string[]).includes(choice)) throw new RangeError(`The choice of guillotine is one of ${GUILLOTINE_CHOICES.join(", ")}, not "${String(choice)}".`);
  if (!(GUILLOTINE_SPLITS as readonly string[]).includes(split)) throw new RangeError(`The split of guillotine is one of ${GUILLOTINE_SPLITS.join(", ")}, not "${String(split)}".`);
  const merge = options.merge === true;
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

  // The smallest width and height of the boxes. A turnable box counts its short side for the two.
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
  // Without merge, a free rectangle never grows. Thus a free rectangle with less room than the smallest box has no use.
  // With merge, two small rectangles can join into a larger one, thus each part stays.
  const keep = (p: Box): boolean => merge || (p.x1 - p.x0 >= minW && p.y1 - p.y0 >= minH);

  const { H, walls } = wallsOf(rects, outer, space, heights);
  let free: Box[] = [{ x0: 0, y0: 0, x1: W, y1: H }];
  for (const wall of walls) free = carve(free, wall, keep);
  if (merge) mergeFree(free);

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
    let first = -1;
    for (;;) {
      best = undefined;
      first = -1;
      for (let i = 0; i < free.length; i++) {
        const f = free[i]!;
        for (let t = 0; t < (turns ? 2 : 1); t++) {
          if (banned.has(2 * i + t)) continue;
          const bw = t === 1 ? h : w;
          const bh = t === 1 ? w : h;
          if (f.x0 + bw > f.x1 || f.y0 + bh > f.y1) continue;
          if (first < 0) first = i;
          // A free rectangle of the exact size of the box wins at once
          const score = f.x1 - f.x0 === bw && f.y1 - f.y0 === bh ? -Infinity : choiceScore(choice, f, bw, bh);
          if (best === undefined || score < best.score) best = { index: i, turn: t === 1, w: bw, h: bh, score };
        }
        if (best?.score === -Infinity) break;
      }
      if (best === undefined || !check) break;
      const f = free[best.index]!;
      if (space.fits({ x: f.x0 + ox, y: f.y0 + oy, w: best.w, h: best.h })) break;
      banned.add(2 * best.index + (best.turn ? 1 : 0));
    }

    let place: Box;
    if (best !== undefined) {
      const f = free[best.index]!;
      place = { x0: f.x0, y0: f.y0, x1: f.x0 + best.w, y1: f.y0 + best.h };
      if (best.index !== first) countMove(MOVES.guillotine);
      if (best.turn) {
        rect.size.set(best.w, best.h);
        turned?.add(rect);
      }
      // The cut: a horizontal cut gives the part below the full width, a vertical cut gives the part on the right the full height
      const across = cutsAcross(split, f, best.w, best.h);
      const below: Box = { x0: f.x0, y0: place.y1, x1: across ? f.x1 : place.x1, y1: f.y1 };
      const right: Box = { x0: place.x1, y0: f.y0, x1: f.x1, y1: across ? place.y1 : f.y1 };
      free.splice(best.index, 1);
      for (const p of [below, right]) if (p.x1 > p.x0 && p.y1 > p.y0 && keep(p)) free.push(p);
    } else {
      // No free rectangle has room. A fixed size leaves the box out. A free height puts it under all others, at the left edge.
      if (fixed) continue;
      place = { x0: 0, y0: bottom, x1: w, y1: bottom + h };
      free = carve(free, { x0: 0, y0: place.y0, x1: Math.min(W, place.x1), y1: place.y1 }, keep);
    }
    if (merge) countMove(MOVES.merge, mergeFree(free));
    rect.position.set(place.x0 + ox, place.y0 + oy);
    rect.wasPacked = true;
    bottom = Math.max(bottom, place.y1);
    if (!fixed) outer.size.y = Math.max(outer.size.y, place.y1);
  }
  return { outer, free: free.map((f) => ({ x: f.x0 + ox, y: f.y0 + oy, w: f.x1 - f.x0, h: f.y1 - f.y0 })) };
}

/**
 * This function packs rectangles into an outer rectangle with guillotine cuts (Jylänki 2010). It keeps a list of free
 * rectangles that do not overlap, and it does not change the width of the outer rectangle.
 *
 * - Each box goes to the top-left corner of the free rectangle that `options.choice` chooses. `GUILLOTINE_CHOICES` tells the rules.
 * - A free rectangle of the exact size of the box wins at once. A tie goes to the first free rectangle of the list.
 * - Then the cut of `options.split` makes two new free rectangles at the end of the list. `GUILLOTINE_SPLITS` tells the rules.
 * - With `merge`, two free rectangles with a common full edge become one after each box.
 * - A `locked` rectangle keeps its position. The free rectangles start from the frame less the walls of `maxrects`.
 * - Without `fixedSize`, the height of the outer rectangle grows to the content. With `fixedSize`, a box that does not fit
 *   is not packed: its `wasPacked` stays `false`.
 * - The default sort order is `height-desc`. The order of the array of the caller stays.
 */
export function packGuillotine<T>(rects: Rect<T>[], outer: Rect<T>, options: GuillotineOptions = {}): Rect<T> {
  return runGuillotine(rects, outer, options).outer;
}
