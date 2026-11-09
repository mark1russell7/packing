// The Nmap treemap of Duarte 2014 (roadmap item k27, catalog row `treemap-nmap`). Each item has a weight and a given
// point. The cuts split the items by their points, so items with near points get near cells. The function is
// standalone. It is not in the registry or in a default.

import type { TreemapCell, TreemapFrame } from "./treemap.ts";

/** An item of `treemapNmap`: a positive weight and a given point. The points can have any scale. */
export interface NmapItem {
  readonly id: string;
  readonly weight: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The rule of the cuts of `treemapNmap`.
 * - `equal-weight`: each cut goes across the longer side, and it splits the items into two parts with the most equal weights.
 * - `alternate-cut`: the first cut goes across the longer side, and the direction changes at each level. Each cut splits the items into two halves by count.
 */
export type NmapMethod = "equal-weight" | "alternate-cut";

/** This constant lists each rule of the cuts of `treemapNmap`. */
export const NMAP_METHODS: readonly NmapMethod[] = ["equal-weight", "alternate-cut"];

/** The options of `treemapNmap`. */
export interface NmapOptions {
  /** The rule of the cuts. The default is `equal-weight`. */
  readonly method?: NmapMethod;
}

/** One step of the cuts: the items of a rectangle, and the axis of the cut for `alternate-cut`. */
interface Task {
  readonly ids: number[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alongX: boolean;
}

/**
 * This function scales the points of the range `from` up to `to` so that they fill the range `from` up to `cut`. The
 * point `from` stays. A range with no length keeps each point at `from`.
 */
function scaleFrom(p: Float64Array, ids: readonly number[], from: number, to: number, cut: number): void {
  const factor = to > from ? (cut - from) / (to - from) : 0;
  for (const i of ids) p[i] = Math.min(cut, Math.max(from, from + (p[i]! - from) * factor));
}

/**
 * This function gives the cells of the Nmap treemap of Duarte 2014: one cell for each item, in the order of the items.
 * The area of each cell is in proportion to the weight of its item.
 *
 * - First, the points go into the frame by a scale of each axis. Points on one line along an axis go to the middle of the frame.
 * - Each step sorts the items of a rectangle by the axis of the cut, with a tie to the earlier item. The split puts the
 *   first items in part A and the others in part B.
 * - The cut of the rectangle gives part A the share of its weight. The line between the last point of A and the first
 *   point of B goes to the cut. A scale of each part moves its points into its rectangle.
 * - A cut across the width splits the items by `x`, and a cut across the height splits them by `y`.
 *
 * Each step sorts its items, and a stack replaces the recursion. The cost is `O(n log^2 n)` with balanced splits, and
 * `O(n^2 log n)` at most. A weight or a point that is not finite, or a weight that is not positive, is a `RangeError`.
 */
export function treemapNmap(items: readonly NmapItem[], frame: TreemapFrame, options: NmapOptions = {}): TreemapCell[] {
  const method = options.method ?? "equal-weight";
  if (!NMAP_METHODS.includes(method)) throw new RangeError(`The Nmap method "${String(method)}" is not one of ${NMAP_METHODS.join(", ")}.`);
  if (!(frame.w > 0) || !(frame.h > 0) || !Number.isFinite(frame.w) || !Number.isFinite(frame.h)) throw new RangeError("A treemap frame needs a positive, finite width and height.");
  for (const item of items) {
    if (!(item.weight > 0) || !Number.isFinite(item.weight)) throw new RangeError(`The weight of "${item.id}" must be positive and finite.`);
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) throw new RangeError(`The point of "${item.id}" must be finite.`);
  }
  if (items.length === 0) return [];
  const px = Float64Array.from(items, (item) => item.x);
  const py = Float64Array.from(items, (item) => item.y);
  const fit = (p: Float64Array, start: number, size: number): void => {
    let low = Infinity;
    let high = -Infinity;
    for (const v of p) {
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    for (let i = 0; i < p.length; i += 1) p[i] = high > low ? start + ((p[i]! - low) / (high - low)) * size : start + size / 2;
  };
  fit(px, frame.x, frame.w);
  fit(py, frame.y, frame.h);

  const cells: TreemapCell[] = new Array<TreemapCell>(items.length);
  const stack: Task[] = [{ ids: items.map((_, i) => i), x: frame.x, y: frame.y, w: frame.w, h: frame.h, alongX: frame.w > frame.h }];
  while (stack.length > 0) {
    const task = stack.pop()!;
    const { ids } = task;
    if (ids.length === 1) {
      const i = ids[0]!;
      cells[i] = { id: items[i]!.id, x: task.x, y: task.y, w: task.w, h: task.h };
      continue;
    }
    const alongX = method === "equal-weight" ? task.w > task.h : task.alongX;
    const p = alongX ? px : py;
    ids.sort((a, b) => p[a]! - p[b]! || a - b);
    let total = 0;
    for (const i of ids) total += items[i]!.weight;
    let split = Math.floor(ids.length / 2);
    if (method === "equal-weight") {
      let prefix = 0;
      let gap = Infinity;
      for (let k = 1; k < ids.length; k += 1) {
        prefix += items[ids[k - 1]!]!.weight;
        const next = Math.abs(total - 2 * prefix);
        if (next < gap) {
          gap = next;
          split = k;
        }
      }
    }
    let weightA = 0;
    for (let k = 0; k < split; k += 1) weightA += items[ids[k]!]!.weight;
    const a = ids.slice(0, split);
    const b = ids.slice(split);
    const line = (p[a.at(-1)!]! + p[b[0]!]!) / 2;
    const start = alongX ? task.x : task.y;
    const size = alongX ? task.w : task.h;
    const sizeA = (size * weightA) / total;
    const cut = start + sizeA;
    scaleFrom(p, a, start, line, cut);
    // Part B scales from the far edge, so the line goes to the cut and the far edge stays.
    const end = start + size;
    const factor = end > line ? (end - cut) / (end - line) : 0;
    for (const i of b) p[i] = Math.max(cut, Math.min(end, end - (end - p[i]!) * factor));
    if (alongX) {
      stack.push({ ids: b, x: cut, y: task.y, w: size - sizeA, h: task.h, alongX: !task.alongX });
      stack.push({ ids: a, x: task.x, y: task.y, w: sizeA, h: task.h, alongX: !task.alongX });
    } else {
      stack.push({ ids: b, x: task.x, y: cut, w: task.w, h: size - sizeA, alongX: !task.alongX });
      stack.push({ ids: a, x: task.x, y: task.y, w: task.w, h: sizeA, alongX: !task.alongX });
    }
  }
  return cells;
}
