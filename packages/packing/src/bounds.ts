// The lower bounds of roadmap item k51 (docs/MEASURES.md, "Bounds"). Each bound tells the best result that a packer can
// get on an input. The bench compares each result with its bound: `pack.bound` and `pack.gap`.

import { boundsOf } from "@mark1russell7/layout-contract";
import { DEFAULT_TOLERANCE, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Sides } from "./contract.ts";
import { boxesOf, hullOf } from "./measures.ts";
import { overflowBound } from "./overflow.ts";

/**
 * The objective of a cell. `height` and `width` are the free side of a strip, and `area` is the area of the hull.
 * `placed` is the placed share of the item area in a fixed container.
 */
export type BoundObjective = "height" | "width" | "area" | "placed";

/**
 * The kinds of bounds, in the order of their codes. The measure `pack.bound.kind` is the index of a kind in this list.
 *
 * - `strip.*` bound the free side of a strip: the area, the tallest item, the bound `mmv` and the area with the margins.
 * - `hull.*` bound the area of the hull: the area of the items, the extent of the items and the area with the margins.
 * - `placed.free` bounds the placed share of a fixed container by its free area.
 */
export const BOUND_KINDS: readonly BoundKind[] = Object.freeze(["strip.area", "strip.tallest", "strip.mmv", "strip.margin", "hull.area", "hull.extent", "hull.margin", "placed.free"]);

/** A kind of bound. `BOUND_KINDS` gives each kind and its code. */
export type BoundKind = "strip.area" | "strip.tallest" | "strip.mmv" | "strip.margin" | "hull.area" | "hull.extent" | "hull.margin" | "placed.free";

/** The bound of the objective of one input. `objectiveBound` gives it. */
export interface ObjectiveBound {
  /** The objective of the cell of the input. */
  readonly objective: BoundObjective;
  /**
   * The value `lower` tells that no result is below `value`, and lower results are better. The value `upper` tells that
   * no result is above `value`, and higher results are better.
   */
  readonly sense: "lower" | "upper";
  /** The bound: the strongest of `parts`. */
  readonly value: number;
  /** The kind of the strongest bound. A tie goes to the first kind of `BOUND_KINDS`. */
  readonly kind: BoundKind;
  /** The value of each bound that the cell has, by kind. */
  readonly parts: Readonly<Partial<Record<BoundKind, number>>>;
  /** The ids of the items that the bound counts. A result compares with the bound only when it places each of them. */
  readonly items: readonly string[];
  /** The least count of the items that no packer can place. It is a lower bound of `pack.overflow`. */
  readonly overflow: number;
}

/** The options of `objectiveBound`. */
export interface BoundOptions {
  /**
   * The overlap tolerance of the hard rules. Two boxes can overlap by this value on one axis. Each bound subtracts the
   * room that this overlap gives. The default is `DEFAULT_TOLERANCE.overlap`.
   */
  readonly tolerance?: number;
}

/** The measures of a bound in a record. `boundMeasures` gives them. A cell with no bound gives none of them. */
export interface BoundMeasures {
  /** The bound of the objective of the cell. */
  "pack.bound"?: number;
  /** The code of the kind of the bound: its index in `BOUND_KINDS`. */
  "pack.bound.kind"?: number;
  /** The distance of the result to its bound. The value 0 tells that the result is the best possible. */
  "pack.gap"?: number;
}

/** One turn of an item: the sizes that the bounds read. */
interface Turn {
  /** The rectangle of the item. The hull holds it. */
  rw: number;
  rh: number;
  /** The rectangle of the hard rules: the bounding box of the shape, or the rectangle of the item. */
  bw: number;
  bh: number;
  /** The piece: the rectangle of the hard rules cut to the rectangle of the item. The pieces do not overlap. */
  pw: number;
  ph: number;
  margin: Sides;
}

/** An item with each turn that the item permits. */
interface Candidate {
  id: string;
  turns: Turn[];
}

/** A rectangle of a piece, made smaller by the tolerance. */
interface Piece {
  w: number;
  h: number;
}

/** This function tells if a number is a whole number. */
const whole = (v: number): boolean => Number.isInteger(v);

/** This function gives the sizes of one turn of an item. */
function turnOf(item: Item): Turn {
  const rule = item.shape === undefined ? { x: 0, y: 0, w: item.w, h: item.h } : boundsOf(item.shape);
  const pw = Math.max(0, Math.min(rule.x + rule.w, item.w) - Math.max(rule.x, 0));
  const ph = Math.max(0, Math.min(rule.y + rule.h, item.h) - Math.max(rule.y, 0));
  return { rw: item.w, rh: item.h, bw: rule.w, bh: rule.h, pw, ph, margin: marginOf(item) };
}

/** This function gives a turn of a strip with a fixed height as a turn of a strip with a fixed width. The axes change places. */
function transpose(t: Turn): Turn {
  const m = t.margin;
  return { rw: t.rh, rh: t.rw, bw: t.bh, bh: t.bw, pw: t.ph, ph: t.pw, margin: { top: m.left, left: m.top, bottom: m.right, right: m.bottom } };
}

/** This function gives the items with a width and a height above 0, each with its turns. */
function candidatesOf(input: PackInput): Candidate[] {
  const out: Candidate[] = [];
  for (const item of input.items) {
    if (!(item.w > 0 && item.h > 0)) continue;
    const turns = [turnOf(item)];
    if (item.turnable === true) turns.push(turnOf(turnItem(item)));
    out.push({ id: item.id, turns });
  }
  return out;
}

/** This function tells if a margin of an item is below 0. Then a box with its margin is smaller than the box. */
const negativeMargin = (c: Candidate): boolean => c.turns.some((t) => Math.min(t.margin.top, t.margin.right, t.margin.bottom, t.margin.left) < 0);

/** This function gives the strongest part and its kind. A tie within a small relative noise goes to the first kind of the list. */
function strongest(parts: Partial<Record<BoundKind, number>>, sense: "lower" | "upper"): { value: number; kind: BoundKind } {
  let best: { value: number; kind: BoundKind } | undefined;
  for (const kind of BOUND_KINDS) {
    const v = parts[kind];
    if (v === undefined) continue;
    const noise = 1e-9 * Math.max(1, Math.abs(best?.value ?? 0));
    if (best === undefined || (sense === "lower" ? v > best.value + noise : v < best.value - noise)) best = { value: v, kind };
  }
  return best!;
}

/**
 * This function gives the bound `mmv` of a strip of the width `width`: the bound L2 of Martello, Monaci and Vigo. The cost is `O(n log n)`.
 *
 * The proof: two pieces wider than `width / 2` are not side by side. Thus the wide pieces stack, and the sum of their heights is a bound.
 * For a value `a` up to `width / 2`, a piece wider than `width - a` has no piece of a width from `a` to `width / 2` beside it.
 * Beside a wide piece `j` of the width `w`, those pieces fill at most `width - w`.
 *
 * Thus `H >= sum(h of the wide pieces) + (A3 - sum((width - w) * h over the wide pieces up to width - a)) / width`.
 * `A3` is the area of the pieces of a width from `a` to `width / 2`. The best `a` is the width of a narrow piece.
 * With `integral`, the heights are whole numbers, so the optimum is a whole number, and the second term rounds up.
 */
export function mmvBound(pieces: readonly { readonly w: number; readonly h: number }[], width: number, integral = false): number {
  if (!(width > 0)) return 0;
  const half = width / 2;
  let wide = 0;
  const narrow: Piece[] = [];
  const wides: Piece[] = [];
  for (const p of pieces) {
    if (!(p.w > 0 && p.h > 0)) continue;
    if (p.w > half) {
      wide += p.h;
      wides.push(p);
    } else narrow.push(p);
  }
  if (narrow.length === 0) return wide;
  // The narrow pieces by width, with the sums of their areas from each index to the end
  narrow.sort((p, q) => p.w - q.w);
  const areaFrom = new Array<number>(narrow.length + 1).fill(0);
  for (let i = narrow.length - 1; i >= 0; i--) areaFrom[i] = areaFrom[i + 1]! + narrow[i]!.w * narrow[i]!.h;
  // The wide pieces by width, with the sums of the free area beside them up to each index
  wides.sort((p, q) => p.w - q.w);
  const slackTo = new Array<number>(wides.length + 1).fill(0);
  for (let i = 0; i < wides.length; i++) slackTo[i + 1] = slackTo[i]! + (width - wides[i]!.w) * wides[i]!.h;
  // The count of the wide pieces of a width up to `limit`
  const upTo = (limit: number): number => {
    let lo = 0;
    let hi = wides.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wides[mid]!.w <= limit) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let extra = 0;
  for (let i = 0; i < narrow.length; i++) {
    if (i > 0 && narrow[i]!.w === narrow[i - 1]!.w) continue;
    const a = narrow[i]!.w;
    extra = Math.max(extra, (areaFrom[i]! - slackTo[upTo(width - a)]!) / width);
  }
  return wide + (integral ? Math.ceil(extra - 1e-9) : extra);
}

/** This function gives the area bound of a strip: the sum of the areas divided by the width. With `integral`, it rounds up. */
function areaBound(pieces: readonly Piece[], width: number, integral: boolean): number {
  if (!(width > 0)) return 0;
  const v = pieces.reduce((sum, p) => sum + p.w * p.h, 0) / width;
  return integral ? Math.ceil(v - 1e-9) : v;
}

/**
 * This function gives the bounds of the free side of a strip. The turns are those of a strip with a fixed width.
 *
 * - `strip.area`: the pieces do not overlap, and they stay in the strip. Thus `H >= sum(w * h) / W`.
 * - `strip.tallest`: the hull holds each item, so `H` is at least the height of the tallest item in its lowest turn.
 * - `strip.mmv`: `mmvBound` of the pieces. An item with 2 turns that fit is not in it. Fewer items do not need more height.
 * - `strip.margin`: the area and `mmv` of the pieces with their margins. Those pieces stay out of each other too.
 *   They go above and below the hull by at most the largest top margin and the largest bottom margin.
 * - The tolerance: each piece becomes smaller by `t / 2` on each side. Then the pieces have no common point, and the hull loses `t`.
 * - The bounds round up only with no tolerance and whole sizes. The heights of an optimum are then whole numbers.
 */
function stripBound(candidates: readonly Candidate[], width: number, inset: number, t: number, objective: "height" | "width", overflow: number): ObjectiveBound | null {
  if (!(width > 0)) return null;
  const limit = width - 2 * inset + 2 * t;
  const room = width - 2 * inset + t;
  const kept: { id: string; turns: Turn[] }[] = [];
  let forced = overflow;
  for (const c of candidates) {
    const turns = c.turns.map((x) => (objective === "width" ? transpose(x) : x)).filter((x) => x.bw + x.margin.left + x.margin.right <= limit);
    if (turns.length === 0) forced += 1;
    else kept.push({ id: c.id, turns });
  }
  if (kept.length === 0 || !(room > 0)) return null;

  const shrunk = (w: number, h: number): Piece => ({ w: Math.max(0, w - t), h: Math.max(0, h - t) });
  const integral = t === 0 && kept.every((c) => c.turns.every((x) => whole(x.pw) && whole(x.ph)));
  const bare = kept.map((c) => shrunk(c.turns[0]!.pw, c.turns[0]!.ph));
  const fixedTurn = kept.filter((c) => c.turns.length === 1).map((c) => shrunk(c.turns[0]!.pw, c.turns[0]!.ph));
  const parts: Partial<Record<BoundKind, number>> = {
    "strip.area": areaBound(bare, room, integral) + t,
    "strip.tallest": Math.max(...kept.map((c) => Math.min(...c.turns.map((x) => x.rh)))),
    "strip.mmv": mmvBound(fixedTurn, room, integral) + t,
  };

  const margined = kept.some((c) => c.turns.some((x) => x.margin.top + x.margin.right + x.margin.bottom + x.margin.left > 0));
  if (margined) {
    const grown = (x: Turn): Piece => shrunk(x.pw + x.margin.left + x.margin.right, x.ph + x.margin.top + x.margin.bottom);
    const above = Math.max(...kept.flatMap((c) => c.turns.map((x) => x.margin.top)));
    const below = Math.max(...kept.flatMap((c) => c.turns.map((x) => x.margin.bottom)));
    const grownWhole = integral && kept.every((c) => c.turns.every((x) => [x.margin.top, x.margin.right, x.margin.bottom, x.margin.left].every(whole)));
    const all = kept.map((c) => grown(c.turns[0]!));
    const fixed = kept.filter((c) => c.turns.length === 1).map((c) => grown(c.turns[0]!));
    parts["strip.margin"] = Math.max(areaBound(all, room, grownWhole), mmvBound(fixed, room, grownWhole)) + t - above - below;
  }
  const { value, kind } = strongest(parts, "lower");
  return { objective, sense: "lower", value, kind, parts, items: kept.map((c) => c.id), overflow: forced };
}

/**
 * This function gives the least `W * H` with `W >= a`, `H >= b` and `(W + mx) * (H + my) >= s`, for `mx` and `my` of 0 or more.
 * On the curve `(W + mx) * (H + my) = s`, the area is a concave function of `W`. Thus the least area is at an end of the curve.
 */
function areaFloor(a: number, b: number, s: number, mx: number, my: number): number {
  if ((a + mx) * (b + my) >= s) return a * b;
  return Math.min(a * (s / (a + mx) - my), b * (s / (b + my) - mx));
}

/**
 * This function gives the bounds of the area of the hull of a free container.
 *
 * - `hull.area`: the pieces do not overlap in the hull. Thus the area is at least the sum of their areas.
 * - `hull.extent`: the hull holds the widest and the tallest item. A turnable item gives its short side to each axis.
 *   Its long side goes on one of the 2 axes.
 * - `hull.margin`: the pieces with their margins do not overlap. They stay in the hull grown by the largest margins.
 *   `areaFloor` gives the least hull for that.
 * - The tolerance: each piece becomes smaller by `t / 2` on each side, as in a strip.
 */
function hullBound(candidates: readonly Candidate[], t: number): ObjectiveBound | null {
  if (candidates.length === 0) return null;
  let a = 0;
  let b = 0;
  let long = 0;
  let area = 0;
  for (const c of candidates) {
    const first = c.turns[0]!;
    if (c.turns.length === 1) {
      a = Math.max(a, first.rw);
      b = Math.max(b, first.rh);
    } else {
      const short = Math.min(first.rw, first.rh);
      a = Math.max(a, short);
      b = Math.max(b, short);
      long = Math.max(long, first.rw, first.rh);
    }
    area += Math.max(0, first.pw - t) * Math.max(0, first.ph - t);
  }
  const parts: Partial<Record<BoundKind, number>> = {
    "hull.area": area,
    "hull.extent": long > 0 ? Math.min(Math.max(a, long) * b, a * Math.max(b, long)) : a * b,
  };
  const all = candidates.flatMap((c) => c.turns);
  if (all.some((x) => x.margin.top + x.margin.right + x.margin.bottom + x.margin.left > 0)) {
    const most = (side: keyof Sides): number => Math.max(...all.map((x) => x.margin[side]));
    let grown = 0;
    for (const c of candidates) {
      const x = c.turns[0]!;
      grown += Math.max(0, x.pw + x.margin.left + x.margin.right - t) * Math.max(0, x.ph + x.margin.top + x.margin.bottom - t);
    }
    parts["hull.margin"] = areaFloor(a, b, grown, Math.max(0, most("left") + most("right") - t), Math.max(0, most("top") + most("bottom") - t));
  }
  const { value, kind } = strongest(parts, "lower");
  return { objective: "area", sense: "lower", value, kind, parts, items: candidates.map((c) => c.id), overflow: 0 };
}

/** This function gives the item area of `measure`: the sum of `w * h` over the items. */
const itemAreaOf = (input: PackInput): number => input.items.reduce((sum, i) => sum + Math.max(0, i.w) * Math.max(0, i.h), 0);

/**
 * This function gives the bound of the objective of an input, or `null` when the cell has no sound bound.
 *
 * - A fixed width or a fixed height: a lower bound of the free side of the hull, by `strip.*`.
 * - No fixed side: a lower bound of the area of the hull, by `hull.*`. The aspect term of `freeAspect` is 0 or more, so the bound holds for it too.
 * - A fixed size: an upper bound of the placed share of the item area. `overflowBound` gives the free area, the shapes and the obstacles.
 * - The bounds ignore the obstacles of a free side and the gap. No hard rule needs the gap, and fewer limits do not make the optimum worse.
 * - A shaped container counts as its bounding box, as in the hard rules. A margin below 0 gives `null`.
 *
 * @example
 * ```ts
 * const bound = objectiveBound(input);
 * bound?.value; // no packer gets a hull height below this value at the width of the container
 * ```
 */
export function objectiveBound(input: PackInput, options: BoundOptions = {}): ObjectiveBound | null {
  const t = Math.max(0, options.tolerance ?? DEFAULT_TOLERANCE.overlap);
  const { container } = input;
  const candidates = candidatesOf(input);
  if (candidates.length === 0 || candidates.some(negativeMargin)) return null;
  const box = container.shape === undefined ? { x: 0, y: 0, w: container.w ?? NaN, h: container.h ?? NaN } : boundsOf(container.shape);
  const inset = container.inset ?? 0;
  switch (container.fixed) {
    case "width":
      return stripBound(candidates, box.w, inset, t, "height", 0);
    case "height":
      return stripBound(candidates, box.h, inset, t, "width", 0);
    case "none":
      return hullBound(candidates, t);
    case "size": {
      const total = itemAreaOf(input);
      if (!(total > 0)) return null;
      const forced = overflowBound(input);
      const value = 1 - Math.min(1, forced.area / total);
      return { objective: "placed", sense: "upper", value, kind: "placed.free", parts: { "placed.free": value }, items: [], overflow: forced.forced };
    }
  }
}

/**
 * This function gives the result of an output for the objective of a bound, or `undefined` when the result does not compare.
 * A result does not compare when the output leaves out an item of `bound.items`.
 */
export function objectiveResult(input: PackInput, output: PackOutput, bound: ObjectiveBound): number | undefined {
  if (bound.objective === "placed") {
    const total = itemAreaOf(input);
    const out = new Set(output.overflow);
    const lost = input.items.reduce((sum, i) => sum + (out.has(i.id) ? Math.max(0, i.w) * Math.max(0, i.h) : 0), 0);
    return total > 0 ? 1 - lost / total : undefined;
  }
  const placed = new Set(output.placements.map((p) => p.id));
  if (bound.items.some((id) => !placed.has(id))) return undefined;
  const hull = hullOf(boxesOf(input, output));
  return bound.objective === "height" ? hull.h : bound.objective === "width" ? hull.w : hull.w * hull.h;
}

/**
 * This function gives the distance of a result to its bound. The value 0 tells that the result is the best possible.
 *
 * - For `lower`, the gap is `result / bound - 1`. For `upper`, it is `bound / result - 1`.
 * - When both values are 0, the gap is 0. When only the divisor is 0, the gap is `Infinity`.
 */
export function boundGap(result: number, bound: number, sense: "lower" | "upper"): number {
  const top = sense === "lower" ? result : bound;
  const bottom = sense === "lower" ? bound : result;
  if (bottom === 0) return top === 0 ? 0 : Infinity;
  return top / bottom - 1;
}

/**
 * This function gives the bound measures of one layout. The values are not rounded. The function `measure` does not give
 * them, so its records stay the same. The bench adds them.
 *
 * - `pack.bound` and `pack.bound.kind` come from `objectiveBound`. A cell with no bound gives no measure.
 * - `pack.gap` comes from `boundGap`. It is absent when the result does not compare.
 */
export function boundMeasures(input: PackInput, output: PackOutput, options: BoundOptions = {}): BoundMeasures {
  const bound = objectiveBound(input, options);
  if (bound === null) return {};
  const out: BoundMeasures = { "pack.bound": bound.value, "pack.bound.kind": BOUND_KINDS.indexOf(bound.kind) };
  const result = objectiveResult(input, output, bound);
  if (result !== undefined) out["pack.gap"] = boundGap(result, bound.value, bound.sense);
  return out;
}
