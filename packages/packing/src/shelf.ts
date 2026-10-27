import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";

/** The options of `packShelf` */
export interface ShelfOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
}

/** An obstacle in the coordinates of the outer rectangle */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * This function gives the first x from `start` where a rectangle of width `w` crosses no obstacle in the band from
 * `top` to `bottom`.
 */
function firstFreeX(obstacles: readonly Box[], start: number, w: number, top: number, bottom: number): number {
  let x = start;
  let moved = true;
  while (moved) {
    moved = false;
    for (const o of obstacles) {
      if (o.top < bottom && top < o.bottom && o.left < x + w && x < o.right) {
        x = o.right;
        moved = true;
      }
    }
  }
  return x;
}

/** This function gives the lowest bottom edge of the obstacles in the band from `top` to `bottom`, under `top`. */
function nextTop(obstacles: readonly Box[], top: number, bottom: number): number {
  let next = Infinity;
  for (const o of obstacles) if (o.top < bottom && top < o.bottom && o.bottom > top) next = Math.min(next, o.bottom);
  return next;
}

/**
 * This function packs rectangles into shelves: rows that it fills left to right in the sort order, and does not fill
 * again. It goes around each `locked` rectangle. It sets the position of each rectangle and gives the outer rectangle.
 *
 * - With the sort order `input`, the rows read in the order of the array: left to right, and top to bottom.
 * - With `height-desc` (the default), it is the classic Next-Fit Decreasing Height packing.
 * - A rectangle goes to the first x in the row where it crosses no locked rectangle. If no such x is in the width,
 *   a new row starts under the current row.
 * - A rectangle wider than the outer rectangle goes on its own row, at the left edge, and overflows.
 * - It does not change the width. Without `fixedSize`, the height grows to the content. With `fixedSize`, a
 *   rectangle that does not fit is not packed: its `wasPacked` stays `false`.
 */
export function packShelf<T>(rects: Rect<T>[], outer: Rect<T>, options: ShelfOptions = {}): Rect<T> {
  const width = outer.size.x;
  const obstacles: Box[] = [];
  let contentBottom = 0;
  for (const rect of rects) {
    if (!rect.locked) continue;
    rect.wasPacked = true;
    const left = rect.position.x - outer.position.x;
    const top = rect.position.y - outer.position.y;
    obstacles.push({ left, top, right: left + rect.size.x, bottom: top + rect.size.y });
    contentBottom = Math.max(contentBottom, top + rect.size.y);
  }

  let rowTop = 0;
  let rowBottom = 0;
  let cursor = 0;
  let rowEmpty = true;

  for (const rect of rects.toSorted(compareRects(options.sortOrder ?? "height-desc"))) {
    if (rect.wasPacked) continue;
    const w = rect.size.x;
    const h = rect.size.y;
    if (!(w > 0 && h > 0)) continue;
    const overflows = w > width;
    if (overflows && outer.fixedSize) continue;

    // An overflowing rectangle starts a row of its own
    if (overflows && !rowEmpty) {
      rowTop = rowBottom;
      cursor = 0;
      rowEmpty = true;
    }

    let x = firstFreeX(obstacles, cursor, w, rowTop, rowTop + h);
    while (!overflows && x + w > width) {
      // Start a new row under the current one, or under the obstacles that block an empty row
      rowTop = rowEmpty ? nextTop(obstacles, rowTop, rowTop + h) : rowBottom;
      rowBottom = rowTop;
      cursor = 0;
      rowEmpty = true;
      x = firstFreeX(obstacles, cursor, w, rowTop, rowTop + h);
    }
    while (overflows && x !== 0) {
      rowTop = nextTop(obstacles, rowTop, rowTop + h);
      rowBottom = rowTop;
      x = firstFreeX(obstacles, 0, w, rowTop, rowTop + h);
    }

    if (outer.fixedSize && rowTop + h > outer.size.y) continue;

    rect.position.set(x + outer.position.x, rowTop + outer.position.y);
    rect.wasPacked = true;
    rowEmpty = false;
    cursor = x + w;
    rowBottom = Math.max(rowBottom, rowTop + h);
    contentBottom = Math.max(contentBottom, rowTop + h);
    if (overflows) {
      rowTop = rowBottom;
      cursor = 0;
      rowEmpty = true;
    }
  }

  if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, contentBottom);
  return outer;
}
