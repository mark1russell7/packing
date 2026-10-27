import { hullOf, rowsOf } from "./measures.ts";
import type { Rect } from "./rect.ts";

/** The measurements of a packing. */
export interface PackingMetrics {
  /** The number of rectangles. */
  count: number;
  /** The size of the hull: the smallest box around the rectangles. */
  hull: { width: number; height: number };
  /** The width of the hull divided by its height. A hull without height gives 0. */
  hullAspect: number;
  /** The number of rectangles in each row, from the top. */
  rows: number[];
  /** The largest right edge of a row less the smallest right edge of a row. A straight right side gives 0. */
  raggedness: number;
  /** The part of the hull that the rectangles cover: their area divided by the area of the hull. */
  utilization: number;
  /** The width of the widest rectangle divided by the median width. */
  widestOverMedian: number;
}

/** The options of `packingMetrics`. */
export interface MetricsOptions {
  /** A rectangle joins a row when its top is this close to the top of the first rectangle of the row. The default is 40. */
  rowTolerance?: number;
}

/**
 * This function measures a packing. It gives the hull and its aspect, the rows and the raggedness of the right side.
 * It also gives the part of the hull that the rectangles cover, and the widest rectangle against the median width.
 *
 * @example
 * ```ts
 * const { utilization, raggedness } = packingMetrics(Rect.packed(cards));
 * ```
 */
export function packingMetrics(rects: readonly Rect[], options: MetricsOptions = {}): PackingMetrics {
  const tolerance = options.rowTolerance ?? 40;
  const boxes = rects.filter((r) => r.size.x > 0 && r.size.y > 0).map((r) => ({ x: r.position.x, y: r.position.y, w: r.size.x, h: r.size.y }));
  if (boxes.length === 0) return { count: 0, hull: { width: 0, height: 0 }, hullAspect: 0, rows: [], raggedness: 0, utilization: 0, widestOverMedian: 0 };

  // The hull and the rows come from the helpers of `measure`, so the two functions agree
  const box = hullOf(boxes);
  const hull = { width: box.w, height: box.h };
  const rows = rowsOf(boxes, tolerance);
  const rights = rows.map((row) => row.right);
  const widths = boxes.map((r) => r.w).toSorted((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)] ?? 0;
  const widest = widths.at(-1) ?? 0;
  const area = boxes.reduce((sum, r) => sum + r.w * r.h, 0);
  return {
    count: boxes.length,
    hull,
    hullAspect: hull.height > 0 ? hull.width / hull.height : 0,
    rows: rows.map((row) => row.count),
    raggedness: Math.max(...rights) - Math.min(...rights),
    utilization: hull.width * hull.height > 0 ? area / (hull.width * hull.height) : 0,
    widestOverMedian: median > 0 ? widest / median : 0,
  };
}
