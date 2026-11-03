import { placeLayout } from "./pack.ts";
import { Rect } from "./rect.ts";
import { packFreeWith, type FreeWidthOptions, type FreeWidthResult } from "./free-width.ts";

export { aspectError, packFreeWith, type FreeWidthOptions, type FreeWidthResult, type FreeWidthTry } from "./free-width.ts";

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
  return packFreeWith(rects, outer, options, placeLayout);
}
