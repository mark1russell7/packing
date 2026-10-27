// The algebra of measures (roadmap item k8). `docs/MEASURES.md` defines each measure. This file computes them.

import { RECORD_EPS, type PackInput, type PackOutput } from "./contract.ts";
import { aspectError } from "./free.ts";
import { round3 } from "./layout-input.ts";

/** The direction of a measure: `lower` when a lower value is better, `higher` when a higher value is better. */
export type Direction = "lower" | "higher";

/** The family of a measure. Each family has a section in `docs/MEASURES.md`. */
export type MeasureFamily = "density" | "aspect" | "order" | "raggedness" | "overflow" | "stability" | "determinism" | "speed";

/** The id of a measure of the packer. The ids are those of `docs/FORMAT.md`, and `highways` uses the same ids. */
export type MeasureId = "pack.area" | "pack.fill" | "pack.whitespace" | "pack.aspect" | "pack.aspectError" | "pack.order.inversions" | "pack.order.breaks" | "pack.raggedness" | "pack.overflow" | "pack.stability.moved" | "pack.stability.mean" | "pack.stability.q95" | "pack.deterministic" | "pack.search.widths" | "pack.search.ms";

/** The facts of one measure: its family, its unit, its direction and its range. */
export interface MeasureSpec {
  id: MeasureId;
  family: MeasureFamily;
  unit: string;
  direction: Direction;
  /** The lowest value. */
  min: number;
  /** The highest value. The value `Infinity` tells that the measure has no upper limit. */
  max: number;
  /**
   * The floor is the best value of a guard measure. The floor rule of `docs/PROMOTION.md` of `highways` reads it. Each
   * guard of the packer has the floor 0. A measure without a floor has no floor rule.
   */
  floor?: number;
  /**
   * The tolerance is the absolute tolerance at the floor. A candidate within the tolerance ties with a default at the floor.
   *
   * - `pack.order.inversions` and `pack.overflow` have the tolerance 0. Thus each new inversion and each new unplaced item is a loss.
   * - `pack.aspectError` has 0.01, approximately 1% of the aspect. An exact tiling gives the default an error of 0.
   * - `pack.stability.mean` has 0.005 container widths, and `pack.stability.q95` has 0.01. The default often moves no item.
   * - `pack.stability.moved` has 0.02: 2% of the items that stay. On a small change, the default often moves no item.
   */
  tol?: number;
}

/** The measures of one layout, by id. `measure` gives them. The values are not rounded. */
export interface LayoutMeasures {
  "pack.area": number;
  "pack.fill": number;
  "pack.whitespace": number;
  "pack.aspect": number;
  "pack.aspectError": number;
  "pack.order.inversions": number;
  "pack.order.breaks": number;
  "pack.raggedness": number;
  "pack.overflow": number;
  "pack.search.widths": number;
  "pack.search.ms": number;
}

/** The stability measures of a change pair, by id. `measureChange` gives them. The values are not rounded. */
export interface ChangeMeasures {
  "pack.stability.moved": number;
  "pack.stability.mean": number;
  "pack.stability.q95": number;
}

/** The options of `measure`. */
export interface MeasureOptions {
  /**
   * A box joins a row when its top is this close to the top of the first box of the row. The rows give
   * `pack.raggedness`. The default is half the median height of the boxes.
   */
  rowTolerance?: number;
}

const spec = (
  id: MeasureId,
  family: MeasureFamily,
  unit: string,
  direction: Direction,
  min: number,
  max: number,
  guard?: { floor: number; tol: number },
): MeasureSpec => ({ id, family, unit, direction, min, max, ...guard });

/**
 * The facts of each measure, by id. `docs/MEASURES.md` gives the full definitions. This record is the source of the floor
 * and the tolerance of each guard of the packer.
 */
export const MEASURE_SPECS: Readonly<Record<MeasureId, MeasureSpec>> = Object.freeze({
  "pack.area": spec("pack.area", "density", "square units", "lower", 0, Infinity),
  "pack.fill": spec("pack.fill", "density", "share", "higher", 0, 1),
  "pack.whitespace": spec("pack.whitespace", "density", "share", "lower", 0, 1),
  "pack.aspect": spec("pack.aspect", "aspect", "ratio", "lower", 1, Infinity),
  "pack.aspectError": spec("pack.aspectError", "aspect", "natural log", "lower", 0, Infinity, { floor: 0, tol: 0.01 }),
  "pack.order.inversions": spec("pack.order.inversions", "order", "share", "lower", 0, 1, { floor: 0, tol: 0 }),
  "pack.order.breaks": spec("pack.order.breaks", "order", "count", "lower", 0, Infinity),
  "pack.raggedness": spec("pack.raggedness", "raggedness", "share", "lower", 0, 1),
  "pack.overflow": spec("pack.overflow", "overflow", "count", "lower", 0, Infinity, { floor: 0, tol: 0 }),
  "pack.stability.moved": spec("pack.stability.moved", "stability", "share", "lower", 0, 1, { floor: 0, tol: 0.02 }),
  "pack.stability.mean": spec("pack.stability.mean", "stability", "container widths", "lower", 0, Infinity, { floor: 0, tol: 0.005 }),
  "pack.stability.q95": spec("pack.stability.q95", "stability", "container widths", "lower", 0, Infinity, { floor: 0, tol: 0.01 }),
  "pack.deterministic": spec("pack.deterministic", "determinism", "boolean", "higher", 0, 1),
  "pack.search.widths": spec("pack.search.widths", "speed", "count", "lower", 0, Infinity),
  "pack.search.ms": spec("pack.search.ms", "speed", "milliseconds", "lower", 0, Infinity),
});

/** A placed box: the rectangle of an item at its position, with its rank. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
}

/** This function gives the smallest rectangle around the boxes. No box gives a rectangle of size 0 at 0, 0. */
export function hullOf(boxes: readonly Pick<Box, "x" | "y" | "w" | "h">[]): { x: number; y: number; w: number; h: number } {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * This function puts the boxes in rows. It sorts the boxes by their top, and keeps the order of the list for equal tops.
 * A box joins the last row when its top is within `tolerance` of the top of the first box of that row.
 */
export function rowsOf(boxes: readonly Pick<Box, "x" | "y" | "w">[], tolerance: number): { top: number; right: number; count: number }[] {
  const rows: { top: number; right: number; count: number }[] = [];
  for (const b of boxes.toSorted((p, q) => p.y - q.y)) {
    const row = rows.at(-1);
    if (row && Math.abs(b.y - row.top) <= tolerance) {
      row.right = Math.max(row.right, b.x + b.w);
      row.count += 1;
    } else {
      rows.push({ top: b.y, right: b.x + b.w, count: 1 });
    }
  }
  return rows;
}

/**
 * This function gives the placed boxes of an output, in the order of the items of the input. A box has the size of its
 * item after the turn. The list has no item without a placement, and no item with a width or a height of 0.
 */
export function boxesOf(input: PackInput, output: PackOutput): Box[] {
  const placements = new Map<string, PackOutput["placements"][number]>();
  for (const p of output.placements) if (!placements.has(p.id)) placements.set(p.id, p);
  const boxes: Box[] = [];
  for (const [index, item] of input.items.entries()) {
    const p = placements.get(item.id);
    if (p === undefined || !(item.w > 0 && item.h > 0)) continue;
    const turned = p.turn === 90;
    boxes.push({ x: p.x, y: p.y, w: turned ? item.h : item.w, h: turned ? item.w : item.h, rank: item.rank ?? index });
  }
  return boxes;
}

/**
 * This function tells if box `a` comes before box `b` in the reading order. Two boxes whose heights overlap by more than
 * `RECORD_EPS` are on one line, and the left box comes first. Otherwise the upper box comes first.
 */
export function readsBefore(a: Pick<Box, "x" | "y" | "h">, b: Pick<Box, "x" | "y" | "h">): boolean {
  const shared = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (shared > RECORD_EPS) return a.x + RECORD_EPS < b.x;
  return a.y < b.y;
}

/** This function sums one measure over the stages of a trace. A trace without the measure gives 0. */
function traceSum(output: PackOutput, id: string): number {
  let sum = 0;
  for (const stage of output.trace) sum += stage.measures[id] ?? 0;
  return sum;
}

/**
 * This function gives the measures of one layout, by the ids of `docs/MEASURES.md`. The values are not rounded. A
 * record rounds them with `roundMeasures`.
 *
 * - The boxes are the placed items with a width and a height above 0. The hull is the smallest rectangle around them.
 * - An empty layout gives the area 0, the aspect 1 and the aspect error 0. Its fill is 0 and its whitespace is 1.
 * - The time `pack.search.ms` comes from the trace. It is not part of the determinism rule.
 *
 * @example
 * ```ts
 * const m = measure(input, packWith("shelf", input));
 * m["pack.fill"]; // the area of the boxes divided by the area of the hull
 * ```
 */
export function measure(input: PackInput, output: PackOutput, options: MeasureOptions = {}): LayoutMeasures {
  const boxes = boxesOf(input, output);
  const hull = hullOf(boxes);
  const hullArea = hull.w * hull.h;
  const boxArea = boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  const fill = hullArea > 0 ? boxArea / hullArea : 0;
  const empty = boxes.length === 0;
  const target = input.container.aspect ?? 1;

  // The reading order: each pair of boxes with different ranks, and each step of the rank order
  let pairs = 0;
  let inversions = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.rank === b.rank) continue;
      pairs += 1;
      const first = a.rank < b.rank ? a : b;
      const second = first === a ? b : a;
      if (readsBefore(second, first)) inversions += 1;
    }
  }
  const byRank = boxes.toSorted((a, b) => a.rank - b.rank);
  let breaks = 0;
  for (let k = 1; k < byRank.length; k++) {
    const prev = byRank[k - 1]!;
    const next = byRank[k]!;
    if (prev.rank !== next.rank && readsBefore(next, prev)) breaks += 1;
  }

  const tolerance = options.rowTolerance ?? quantileOrZero(boxes.map((b) => b.h), 0.5) / 2;
  const rights = rowsOf(boxes, tolerance).map((r) => r.right);
  const spread = rights.length > 0 ? Math.max(...rights) - Math.min(...rights) : 0;

  return {
    "pack.area": hullArea,
    "pack.fill": fill,
    "pack.whitespace": 1 - fill,
    "pack.aspect": empty ? 1 : Math.max(hull.w / hull.h, hull.h / hull.w),
    "pack.aspectError": empty ? 0 : aspectError(hull.w, hull.h, target),
    "pack.order.inversions": pairs > 0 ? inversions / pairs : 0,
    "pack.order.breaks": breaks,
    "pack.raggedness": hull.w > 0 ? spread / hull.w : 0,
    "pack.overflow": new Set(output.overflow).size,
    "pack.search.widths": traceSum(output, "pack.search.widths"),
    "pack.search.ms": traceSum(output, "pack.search.ms"),
  };
}

/**
 * This function gives the stability measures of a change pair: the run on the base input and the run on the changed
 * input. The items match by id. The values are not rounded.
 *
 * - An item stays when both inputs have it and both outputs place it. The added and the removed items do not count.
 * - A staying item moved when its `x` or its `y` changed by more than `RECORD_EPS`, or when its turn changed.
 * - The distance of an item is the length of the move of its top-left corner. The unit is the width `W`.
 * - `W` is the larger width of the 2 output sizes. A `W` of 0 becomes 1, so the unit is then the unit of the input.
 * - No staying item gives 0 for each measure.
 */
export function measureChange(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput, changeOutput: PackOutput): ChangeMeasures {
  const placed = (input: PackInput, output: PackOutput): Map<string, PackOutput["placements"][number]> => {
    const ids = new Set(input.items.map((i) => i.id));
    const map = new Map<string, PackOutput["placements"][number]>();
    for (const p of output.placements) if (ids.has(p.id) && !map.has(p.id)) map.set(p.id, p);
    return map;
  };
  const before = placed(baseInput, baseOutput);
  const after = placed(changeInput, changeOutput);
  const width = Math.max(baseOutput.size.w, changeOutput.size.w);
  const unit = width > 0 ? width : 1;

  const distances: number[] = [];
  let moved = 0;
  for (const [id, p] of before) {
    const q = after.get(id);
    if (q === undefined) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (Math.abs(dx) > RECORD_EPS || Math.abs(dy) > RECORD_EPS || (p.turn ?? 0) !== (q.turn ?? 0)) moved += 1;
    distances.push(Math.hypot(dx, dy) / unit);
  }
  if (distances.length === 0) return { "pack.stability.moved": 0, "pack.stability.mean": 0, "pack.stability.q95": 0 };
  return {
    "pack.stability.moved": moved / distances.length,
    "pack.stability.mean": distances.reduce((sum, d) => sum + d, 0) / distances.length,
    "pack.stability.q95": quantile(distances, 0.95),
  };
}

/**
 * This function gives the measure `pack.deterministic` of two runs with the same input, options and seed. It gives
 * `true` when the runs have the same placements, overflow, size and moved obstacles.
 *
 * - The placements match by id, so their order in the list does not count. The numbers must be equal.
 * - The trace is not part of the rule, because its times change each time.
 */
export function isDeterministic(first: PackOutput, second: PackOutput): boolean {
  const key = <T extends { id: string }>(list: readonly T[]): Map<string, T> => new Map(list.map((e) => [e.id, e]));
  const samePlacements = (a: PackOutput["placements"], b: PackOutput["placements"]): boolean => {
    if (a.length !== b.length) return false;
    const other = key(b);
    return a.every((p) => {
      const q = other.get(p.id);
      return q !== undefined && q.x === p.x && q.y === p.y && (q.turn ?? 0) === (p.turn ?? 0);
    });
  };
  const sameMoved = (a: PackOutput["moved"], b: PackOutput["moved"]): boolean => {
    if (a.length !== b.length) return false;
    const other = key(b);
    return a.every((m) => {
      const n = other.get(m.id);
      return n !== undefined && n.x === m.x && n.y === m.y;
    });
  };
  const overflowA = new Set(first.overflow);
  const overflowB = new Set(second.overflow);
  return (
    first.size.w === second.size.w &&
    first.size.h === second.size.h &&
    overflowA.size === overflowB.size &&
    [...overflowA].every((id) => overflowB.has(id)) &&
    samePlacements(first.placements, second.placements) &&
    sameMoved(first.moved, second.moved)
  );
}

/**
 * This function rounds each number of a record of measures with `round3`, as `docs/FORMAT.md` tells. A half goes up,
 * and `-0` becomes 0. The function keeps the other values, and it does not change its argument.
 */
export function roundMeasures<T extends object>(measures: T): T {
  const out: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(measures)) out[id] = typeof value === "number" ? round3(value) : value;
  return out as T;
}

/**
 * This function gives the paired ratio of a measure on one input: the value of the candidate against the value of the
 * current default. A ratio above 1 is worse, in the direction of the measure.
 *
 * - For `lower`, the ratio is `candidate / current`. For `higher`, it is `current / candidate`.
 * - When both values are 0, the ratio is 1. When only the divisor is 0, the ratio is `Infinity`.
 * - The values are 0 or more. A negative value or `NaN` throws a `RangeError`.
 */
export function pairedRatio(candidate: number, current: number, direction: Direction): number {
  if (!(candidate >= 0 && current >= 0)) throw new RangeError("A paired ratio needs two values of 0 or more.");
  const top = direction === "lower" ? candidate : current;
  const bottom = direction === "lower" ? current : candidate;
  if (bottom === 0) return top === 0 ? 1 : Infinity;
  return top / bottom;
}

/**
 * This function gives the quantile `q` of a list of numbers, with linear interpolation between the sorted values. The
 * position in the sorted list is `(n - 1) * q`. An empty list or a `q` outside 0 to 1 throws a `RangeError`.
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new RangeError("A quantile needs one value or more.");
  if (!(q >= 0 && q <= 1)) throw new RangeError("A quantile needs a q from 0 to 1.");
  const sorted = values.toSorted((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const part = at - low;
  const a = sorted[low]!;
  if (part === 0) return a;
  const b = sorted[low + 1]!;
  if (a === b) return a;
  return a + part * (b - a);
}

/** This function gives the quantile `q` of a list, and 0 for an empty list. */
function quantileOrZero(values: readonly number[], q: number): number {
  return values.length === 0 ? 0 : quantile(values, q);
}

/** This function gives the median of the paired ratios of a corpus: the quantile 0.5. It is not a ratio of two medians. */
export function medianRatio(ratios: readonly number[]): number {
  return quantile(ratios, 0.5);
}

/** This function gives the share of the paired ratios above a limit. An empty list throws a `RangeError`. */
export function tailShare(ratios: readonly number[], limit: number): number {
  if (ratios.length === 0) throw new RangeError("A tail share needs one ratio or more.");
  return ratios.filter((r) => r > limit).length / ratios.length;
}
