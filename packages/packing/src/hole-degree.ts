// The strategy `hole-degree` of roadmap item k90 (`docs/PACKER.md`, "Circles by the maximum hole degree", idea S1 of the
// survey). It packs circle items into a rectangle by the greedy rule A1.0 of Huang, Li, Akeb and Li (2005). Nothing default uses it.

import { DEFAULT_TOLERANCE, marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds, extentOf, now } from "./frame.ts";
import { assertSupported, type Strategy, type Supports } from "./strategy.ts";

/** The options of the strategy `hole-degree` */
export interface HoleDegreeStrategyOptions {
  /**
   * The count of the halving steps of the height search for a container of free height. The value 0 keeps the open strip.
   * The default is 8. A container of fixed size does not read it.
   */
  steps: number;
}

/** The largest value of the option `steps` */
export const HOLE_DEGREE_MAX_STEPS = 32;

/** The id of the trace stage of `hole-degree` */
export const HOLE_DEGREE_STAGE = "hole-degree";

/** The float error that a corner place can have on a touch. A place nearer than the distance less this value overlaps. */
const TOUCH = 1e-7;

/** The difference of two hole degrees that is a tie */
const TIE = 1e-9;

/** The ids of the 4 sides of the container as items of a corner. A placed circle has its index, 0 or more. */
const LEFT = -1;
const RIGHT = -2;
const TOP = -3;
const BOTTOM = -4;

/** One circle item: its index in the input, its radius, its radius with the margin and half the gap, and the center in its box. */
interface Disc {
  index: number;
  id: string;
  r: number;
  /** The radius of the disc that no other disc enters: `r` plus the largest side of the margin plus half the gap. */
  R: number;
  ox: number;
  oy: number;
}

/** The inner walls of the container for the centers of the discs: the container less the inset, grown by half the gap. */
interface Walls {
  x0: number;
  x1: number;
  y0: number;
  /** The bottom wall. It is `Infinity` for the open strip. */
  y1: number;
}

/** One placed disc: its index in `discs` and its center. */
interface Placed {
  disc: number;
  x: number;
  y: number;
}

/** One corner place of a disc: its center, the two items that it touches, and its least distance to the other items. */
interface Corner {
  x: number;
  y: number;
  a: number;
  b: number;
  d: number;
}

/** The result of one greedy run: the placed discs in their order and the indexes of the discs with no corner place. */
interface Run {
  placed: Placed[];
  left: number[];
}

/** This function gives the circle discs of an input. It throws a `RangeError` for an item that is not a circle. */
function discsOf(input: PackInput): Disc[] {
  const half = (input.gap ?? 0) / 2;
  return input.items.map((item: Item, index): Disc => {
    const s = item.shape;
    if (s?.kind !== "circle") throw new RangeError(`The strategy hole-degree packs only circles, but the item ${item.id} is not a circle.`);
    const m = marginOf(item);
    return { index, id: item.id, r: s.r, R: s.r + Math.max(m.top, m.right, m.bottom, m.left) + half, ox: s.cx, oy: s.cy };
  });
}

/**
 * This function gives the least distance of the centers of each pair of discs. It is the sum of the two radii `R`.
 * A pair of `pairGaps` is apart by the two radii `r` plus its gap, when that is more.
 */
function separations(input: PackInput, discs: readonly Disc[]): (i: number, j: number) => number {
  const byId = new Map(discs.map((d, k) => [d.id, k]));
  const n = discs.length;
  const pair = new Map<number, number>();
  for (const p of input.pairGaps ?? []) {
    const i = byId.get(p.a);
    const j = byId.get(p.b);
    if (i === undefined || j === undefined || i === j) continue;
    const s = Math.max(discs[i]!.R + discs[j]!.R, discs[i]!.r + discs[j]!.r + p.gap);
    pair.set(i * n + j, s);
    pair.set(j * n + i, s);
  }
  if (pair.size === 0) return (i, j) => discs[i]!.R + discs[j]!.R;
  return (i, j) => pair.get(i * n + j) ?? discs[i]!.R + discs[j]!.R;
}

/**
 * This function does the greedy rule A1.0 in fixed walls. At each step, each corner place of each unplaced disc is a candidate.
 * The candidate with the largest hole degree wins. The run stops when each disc is placed or no disc has a corner place.
 */
function greedy(discs: readonly Disc[], sep: (i: number, j: number) => number, w: Walls): Run {
  const placed: Placed[] = [];
  const open = new Set(discs.map((_, k) => k));
  const corners = new Map<number, Corner[]>();
  const walls = Number.isFinite(w.y1) ? [LEFT, RIGHT, TOP, BOTTOM] : [LEFT, RIGHT, TOP];

  /** The distance of a center to an item, less the least distance: 0 is a touch, below 0 is an overlap. */
  const clearance = (k: number, x: number, y: number, o: number): number => {
    const R = discs[k]!.R;
    if (o === LEFT) return x - w.x0 - R;
    if (o === RIGHT) return w.x1 - R - x;
    if (o === TOP) return y - w.y0 - R;
    if (o === BOTTOM) return w.y1 - R - y;
    const p = placed[o]!;
    return Math.hypot(x - p.x, y - p.y) - sep(k, p.disc);
  };
  /** A center fits when it does not overlap a wall or a placed disc. */
  const fits = (k: number, x: number, y: number): boolean => {
    for (const o of walls) if (clearance(k, x, y, o) < -TOUCH) return false;
    for (let j = 0; j < placed.length; j++) if (clearance(k, x, y, j) < -TOUCH) return false;
    return true;
  };
  /** The least distance of a center to the walls and the placed discs, without the two items of its corner. */
  const least = (k: number, x: number, y: number, a: number, b: number): number => {
    let d = Infinity;
    for (const o of walls) if (o !== a && o !== b) d = Math.min(d, clearance(k, x, y, o));
    for (let j = 0; j < placed.length; j++) if (j !== a && j !== b) d = Math.min(d, clearance(k, x, y, j));
    return Math.max(0, d);
  };
  /** This function adds each corner place of a disc that touches the items `a` and `b`. */
  const add = (k: number, a: number, b: number): void => {
    const list = corners.get(k)!;
    for (const [x, y] of touches(k, a, b)) if (fits(k, x, y)) list.push({ x, y, a, b, d: least(k, x, y, a, b) });
  };
  /** The centers of a disc that touch the two items `a` and `b`. */
  const touches = (k: number, a: number, b: number): [number, number][] => {
    const R = discs[k]!.R;
    const xs = { [LEFT]: w.x0 + R, [RIGHT]: w.x1 - R } as Record<number, number>;
    const ys = { [TOP]: w.y0 + R, [BOTTOM]: w.y1 - R } as Record<number, number>;
    if (a < 0 && b < 0) {
      const x = xs[a] ?? xs[b];
      const y = ys[a] ?? ys[b];
      return x === undefined || y === undefined ? [] : [[x, y]];
    }
    if (a < 0 || b < 0) {
      const wall = Math.min(a, b);
      const p = placed[Math.max(a, b)]!;
      const s = sep(k, p.disc);
      if (wall === LEFT || wall === RIGHT) {
        const x = xs[wall]!;
        const h = s * s - (x - p.x) ** 2;
        return h < 0 ? [] : h === 0 ? [[x, p.y]] : [[x, p.y - Math.sqrt(h)], [x, p.y + Math.sqrt(h)]];
      }
      const y = ys[wall]!;
      const h = s * s - (y - p.y) ** 2;
      return h < 0 ? [] : h === 0 ? [[p.x, y]] : [[p.x - Math.sqrt(h), y], [p.x + Math.sqrt(h), y]];
    }
    const p = placed[a]!;
    const q = placed[b]!;
    const s1 = sep(k, p.disc);
    const s2 = sep(k, q.disc);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > s1 + s2 || d < Math.abs(s1 - s2)) return [];
    const along = (s1 * s1 - s2 * s2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, s1 * s1 - along * along));
    const mx = p.x + (along * dx) / d;
    const my = p.y + (along * dy) / d;
    return [
      [mx - (h * dy) / d, my + (h * dx) / d],
      [mx + (h * dy) / d, my - (h * dx) / d],
    ];
  };

  for (const k of open) {
    corners.set(k, []);
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) add(k, walls[i]!, walls[j]!);
  }
  for (;;) {
    let best: { k: number; c: Corner; degree: number } | undefined;
    for (const k of open) {
      const R = discs[k]!.R;
      for (const c of corners.get(k)!) {
        const degree = 1 - c.d / R;
        if (best === undefined || wins(degree, R, c, k, best.degree, discs[best.k]!.R, best.c, best.k)) best = { k, c, degree };
      }
    }
    if (best === undefined) break;
    const slot = placed.length;
    placed.push({ disc: best.k, x: best.c.x, y: best.c.y });
    open.delete(best.k);
    corners.delete(best.k);
    for (const k of open) {
      const kept: Corner[] = [];
      for (const c of corners.get(k)!) {
        const gap = clearance(k, c.x, c.y, slot);
        if (gap < -TOUCH) continue;
        c.d = Math.min(c.d, Math.max(0, gap));
        kept.push(c);
      }
      corners.set(k, kept);
      for (const o of walls) add(k, o, slot);
      for (let j = 0; j < slot; j++) add(k, j, slot);
    }
  }
  return { placed, left: [...open] };
}

/**
 * This function tells if a candidate wins over the best candidate. The larger hole degree wins. A tie goes to the larger disc,
 * then to the lower `y`, then to the lower `x`, then to the earlier item of the input.
 */
function wins(degree: number, R: number, c: Corner, k: number, bestDegree: number, bestR: number, b: Corner, bestK: number): boolean {
  if (Math.abs(degree - bestDegree) > TIE) return degree > bestDegree;
  if (R !== bestR) return R > bestR;
  if (c.y !== b.y) return c.y < b.y;
  if (c.x !== b.x) return c.x < b.x;
  return k < bestK;
}

/** This function gives the placements of a run: the top-left corner of the box of each disc, in the order of the input. */
function placementsOf(discs: readonly Disc[], run: Run): Placement[] {
  return run.placed
    .map((p) => ({ index: discs[p.disc]!.index, at: { id: discs[p.disc]!.id, x: p.x - discs[p.disc]!.ox, y: p.y - discs[p.disc]!.oy } }))
    .sort((a, b) => a.index - b.index)
    .map((p) => p.at);
}

/** This function gives the bottom of a run: the largest bottom of a placed disc with its radius `R`. */
const bottomOf = (discs: readonly Disc[], run: Run): number => run.placed.reduce((m, p) => Math.max(m, p.y + discs[p.disc]!.R), -Infinity);

/** This function checks the options of `hole-degree`. It throws a `RangeError` for a bad value. */
function checkOptions(o: HoleDegreeStrategyOptions): void {
  if (!Number.isInteger(o.steps) || o.steps < 0 || o.steps > HOLE_DEGREE_MAX_STEPS)
    throw new RangeError(`The option steps of hole-degree is a whole number from 0 to ${HOLE_DEGREE_MAX_STEPS}, not ${String(o.steps)}.`);
}

/**
 * The strategy `hole-degree`: circles by the maximum hole degree (idea S1 of the survey, catalog row `circle-hole-degree`).
 * It is the rule A1.0 of Huang, Li, Akeb and Li (2005). `docs/PACKER.md` tells the rule, its source and its limits.
 *
 * - It packs only circle items into a rectangle of fixed size or of fixed width. Obstacles and locked items throw `UnsupportedCell`.
 * - A corner place of a circle touches two items: two placed circles, a circle and a side, or two sides. It overlaps no item.
 * - The hole degree of a corner place is `1 - d / R`. `d` is the least distance to the other items, and `R` is the radius with the margin and half the gap.
 * - At each step, the corner place with the largest hole degree wins, over each corner place of each unplaced circle.
 * - For a free height, the strategy packs the open strip, then halves the height range `steps` times. It keeps the lowest run that places each circle.
 * - The strategy reads no random number and no clock. Thus the same input gives the same output.
 */
export const holeDegree: Strategy<HoleDegreeStrategyOptions> = {
  id: "hole-degree",
  family: "circles",
  catalog: ["circle-hole-degree"],
  supports: {
    containerSize: ["fixed", "freeHeight"],
    containerShape: ["rect"],
    obstacleMove: [],
    itemShape: ["circle"],
    rotation: ["none", "quarter"],
    order: ["free", "soft"],
    groups: ["none"],
    mode: ["offline"],
  } satisfies Supports,
  defaults: { steps: 8 },
  deterministic: true,
  pack(input: PackInput, options: HoleDegreeStrategyOptions): PackOutput {
    assertSupported(holeDegree.supports, input);
    const o = { ...holeDegree.defaults, ...options };
    checkOptions(o);
    const start = now();
    const discs = discsOf(input);
    const sep = separations(input, discs);
    const bounds = containerBounds(input);
    const inset = input.container.inset ?? 0;
    const half = (input.gap ?? 0) / 2;
    const walls: Walls = { x0: bounds.x + inset - half, x1: bounds.x + bounds.w - inset + half, y0: bounds.y + inset - half, y1: bounds.y + bounds.h - inset + half };
    let run = greedy(discs, sep, walls);
    let runs = 1;
    if (!Number.isFinite(bounds.h) && run.left.length === 0 && discs.length > 0) {
      // The height search: the open strip gives a high bound. The largest disc and the disc area give a low bound.
      const width = walls.x1 - walls.x0;
      let high = bottomOf(discs, run) - walls.y0;
      let low = Math.max(...discs.map((d) => 2 * d.R), discs.reduce((a, d) => a + Math.PI * d.R * d.R, 0) / width);
      for (let i = 0; i < o.steps && high - low > TOUCH; i++) {
        const mid = (low + high) / 2;
        const tried = greedy(discs, sep, { ...walls, y1: walls.y0 + mid });
        runs++;
        if (tried.left.length === 0) {
          run = tried;
          high = Math.min(mid, bottomOf(discs, tried) - walls.y0);
        } else low = mid;
      }
    }
    const placements = placementsOf(discs, run);
    const overflow = run.left.sort((a, b) => a - b).map((k) => discs[k]!.id);
    const size = { w: bounds.w, h: bounds.h };
    if (!Number.isFinite(size.h)) size.h = Math.max(extentOf(input, placements, [], bounds, inset).bottom, run.placed.length === 0 ? 0 : bottomOf(discs, run) - half + inset - bounds.y);
    return { placements, overflow, size, moved: [], trace: [{ id: HOLE_DEGREE_STAGE, ms: now() - start, measures: { "pack.overflow": overflow.length, "holeDegree.runs": runs } }] };
  },
};

/**
 * This function counts the pairs of placed circle items that overlap, by the distance of their centers (roadmap item k90).
 * It is exact for circles. `packHard` of the contract counts the bounding boxes, so its count on circles is only safe.
 *
 * - Two circles break the rule when their centers are nearer than the two radii, the two margins and the gap, less `tolerance`.
 * - The margin of a circle is the largest side of its margin. A pair of `pairGaps` is apart by the two radii and its gap.
 * - An item without a circle shape, an unplaced item and a placement of an unknown id do not count.
 */
export function circleOverlaps(input: PackInput, output: Pick<PackOutput, "placements">, tolerance: number = DEFAULT_TOLERANCE.overlap): number {
  const gap = input.gap ?? 0;
  const items = new Map(input.items.map((i) => [i.id, i]));
  const pairs = new Map<string, number>();
  for (const p of input.pairGaps ?? []) pairs.set(JSON.stringify(p.a < p.b ? [p.a, p.b] : [p.b, p.a]), p.gap);
  const placed: { id: string; x: number; y: number; r: number; m: number }[] = [];
  for (const p of output.placements) {
    const item = items.get(p.id);
    const s = item?.shape;
    if (item === undefined || s?.kind !== "circle") continue;
    const m = marginOf(item);
    placed.push({ id: p.id, x: p.x + s.cx, y: p.y + s.cy, r: s.r, m: Math.max(m.top, m.right, m.bottom, m.left) });
  }
  let count = 0;
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const pg = pairs.get(JSON.stringify(a.id < b.id ? [a.id, b.id] : [b.id, a.id]));
      const need = pg === undefined ? a.r + a.m + gap + b.m + b.r : a.r + b.r + pg;
      if (Math.hypot(a.x - b.x, a.y - b.y) < need - tolerance) count++;
    }
  return count;
}
