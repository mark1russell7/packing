import { pack, type PackLayoutOptions } from "./pack.ts";
import { Rect } from "./rect.ts";

/** The options of `packFree` */
export interface FreeWidthOptions extends PackLayoutOptions {
  /** The target aspect: the width divided by the height. The default is 1, a square. */
  aspect?: number;
  /**
   * The weight of the aspect error in the objective. The objective is the area times `1 + aspectWeight * aspectError`.
   * The default is 1. With 0, only the area counts.
   */
  aspectWeight?: number;
  /** The number of widths that the first pass tries. The default is 48. */
  samples?: number;
}

/** One width that `packFree` tried, and its result */
export interface FreeWidthTry {
  /** The width of the container for this try */
  width: number;
  /** The width of the content: the right edge of the rectangles */
  contentWidth: number;
  /** The height of the content */
  contentHeight: number;
  /** The objective of this try. Lower is better. */
  objective: number;
}

/** The result of `packFree` */
export interface FreeWidthResult<T> {
  /** The outer rectangle, with the size of the content */
  outer: Rect<T>;
  /** The area of the bounding box of the content */
  area: number;
  /** The area of the rectangles divided by the area of the bounding box */
  fill: number;
  /** The aspect of the bounding box: the width divided by the height */
  aspect: number;
  /** The distance from the target aspect: the absolute value of `log(aspect) - log(target)` */
  aspectError: number;
  /** The objective of the chosen width. Lower is better. */
  objective: number;
  /** Each width that the search tried, in the order of the search */
  tried: FreeWidthTry[];
}

/** This function gives the distance between an aspect and a target aspect on a log scale. */
export function aspectError(width: number, height: number, target = 1): number {
  if (!(width > 0 && height > 0 && target > 0)) return Infinity;
  return Math.abs(Math.log(width / height) - Math.log(target));
}

/**
 * This function packs rectangles with a free width. It tries many widths with the strategy of `options`, and keeps
 * the width with the lowest objective: the area of the bounding box times `1 + aspectWeight * aspectError`.
 *
 * - The first pass tries `samples` widths on a log scale, from the widest rectangle to the width of one row.
 * - The second pass tries the widths between the two neighbours of the best width of the first pass.
 * - The search is deterministic: the same input gives the same widths and the same result.
 * - A `locked` rectangle keeps its position. The width is not less than its right edge.
 * - Each strategy of `pack` works with this function, because it only changes the width.
 */
export function packFree<T>(rects: Rect<T>[], outer: Rect<T> = new Rect(), options: FreeWidthOptions = {}): FreeWidthResult<T> {
  const target = options.aspect ?? 1;
  const weight = options.aspectWeight ?? 1;
  const samples = Math.max(2, Math.floor(options.samples ?? 48));
  const ox = outer.position.x;
  const oy = outer.position.y;

  let itemArea = 0;
  let minWidth = 0;
  let rowWidth = 0;
  for (const r of rects) {
    if (r.locked) {
      minWidth = Math.max(minWidth, r.right() - ox);
      continue;
    }
    if (!(r.size.x > 0 && r.size.y > 0)) continue;
    itemArea += r.area();
    minWidth = Math.max(minWidth, r.size.x);
    rowWidth += r.size.x;
  }
  for (const r of rects) if (r.locked) itemArea += r.area();
  const maxWidth = Math.max(minWidth, rowWidth);

  const tried: FreeWidthTry[] = [];
  const run = (width: number): FreeWidthTry => {
    Rect.resetPacked(rects);
    const box = new Rect<T>();
    box.position.setTo(outer.position);
    box.size.set(width, 0);
    box.fixedWidth = true;
    pack(rects, box, options);
    const placed = Rect.packed(rects);
    const contentWidth = Math.max(0, Rect.maxRight(placed) - ox);
    const contentHeight = Math.max(0, Rect.maxBottom(placed) - oy);
    const area = contentWidth * contentHeight;
    const objective = area > 0 ? area * (1 + weight * aspectError(contentWidth, contentHeight, target)) : 0;
    const t = { width, contentWidth, contentHeight, objective };
    tried.push(t);
    return t;
  };

  // The first pass: widths on a log scale. Each width is a whole number when the sizes are whole numbers.
  const widths: number[] = [];
  if (maxWidth > 0) {
    const ratio = maxWidth / minWidth;
    for (let i = 0; i < samples; i++) {
      const w = minWidth * ratio ** (i / (samples - 1));
      const rounded = i === samples - 1 ? maxWidth : Math.max(minWidth, Math.round(w));
      if (widths.at(-1) !== rounded) widths.push(rounded);
    }
  }
  let best: FreeWidthTry | undefined = undefined;
  let bestIndex = 0;
  for (const [i, w] of widths.entries()) {
    const t = run(w);
    if (best === undefined || t.objective < best.objective) {
      best = t;
      bestIndex = i;
    }
  }

  // The second pass: the widths between the two neighbours of the best width
  if (widths.length > 2) {
    const low = widths[Math.max(0, bestIndex - 1)]!;
    const high = widths[Math.min(widths.length - 1, bestIndex + 1)]!;
    const steps = Math.min(Math.floor(samples / 2), Math.max(0, Math.round(high - low) - 1));
    for (let i = 1; i <= steps; i++) {
      const w = Math.round(low + ((high - low) * i) / (steps + 1));
      if (widths.includes(w)) continue;
      const t = run(w);
      if (best === undefined || t.objective < best.objective) best = t;
    }
  }

  // The last run packs with the best width, so the positions of the rectangles are those of the best width
  const chosen = best === undefined ? undefined : run(best.width);
  tried.pop();
  const w = chosen?.contentWidth ?? 0;
  const h = chosen?.contentHeight ?? 0;
  if (!outer.fixedSize) outer.size.set(w, h);
  const area = w * h;
  return {
    outer,
    area,
    fill: area > 0 ? itemArea / area : 0,
    aspect: h > 0 ? w / h : 0,
    aspectError: aspectError(w, h, target),
    objective: chosen?.objective ?? 0,
    tried,
  };
}
