import { countMove, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";
import { firstFit, type FreeSpace, type FreeSpan } from "./space.ts";

/** The options of `packShelf` */
export interface ShelfOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the packer uses only the
   * outer rectangle and the locked rectangles.
   */
  space?: FreeSpace;
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
 * - With a space that is not plain, `packRowsInSpace` packs the rows into the outline of the space and around its holes.
 */
export function packShelf<T>(rects: Rect<T>[], outer: Rect<T>, options: ShelfOptions = {}): Rect<T> {
  if (options.space !== undefined && !options.space.plain) return packRowsInSpace(rects, outer, options.sortOrder ?? "height-desc", options.space);
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

    // The move of a shelf: the rectangle joins an open shelf that a taller rectangle made
    if (!rowEmpty && rowTop + h < rowBottom) countMove(MOVES.shelf);
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

/**
 * This function gives the first x from `start` where a rectangle of width `w` fits. There, it crosses no locked rectangle,
 * and it is in a free span of its band. It takes `firstFreeX` and `firstFit` in turn until they agree. It gives `Infinity` when no x fits.
 */
function placeInBand(obstacles: readonly Box[], spans: readonly FreeSpan[], start: number, w: number, top: number, bottom: number): number {
  let x = start;
  for (;;) {
    const free = firstFreeX(obstacles, x, w, top, bottom);
    const fit = firstFit(spans, free, w);
    if (fit === free || !Number.isFinite(fit)) return fit;
    x = fit;
  }
}

/**
 * This function packs rectangles into rows inside a free space. `packShelf` and `packRows` use it when the space is not
 * plain. It sets the position of each rectangle and gives the outer rectangle.
 *
 * - A rectangle goes to the first x from the row cursor where it fits in the space and crosses no locked rectangle.
 * - When it does not fit, a new row starts under the current row. An empty row steps down to `nextY` of the space.
 * - When the steps of an empty row find no place, the row goes back to its last top edge. Later rectangles can use it.
 * - A rectangle wider than the outer rectangle overflows. Without `fixedSize`, it goes on its own row at the left edge.
 */
export function packRowsInSpace<T>(rects: Rect<T>[], outer: Rect<T>, order: SortOrder, space: FreeSpace): Rect<T> {
  const width = outer.size.x;
  const ox = outer.position.x;
  const oy = outer.position.y;
  const limit = outer.fixedSize ? outer.size.y : Infinity;
  const obstacles: Box[] = [];
  let contentBottom = 0;
  for (const rect of rects) {
    if (!rect.locked) continue;
    rect.wasPacked = true;
    const left = rect.position.x - ox;
    const top = rect.position.y - oy;
    obstacles.push({ left, top, right: left + rect.size.x, bottom: top + rect.size.y });
    contentBottom = Math.max(contentBottom, top + rect.size.y);
  }
  // The x in the row, in the coordinates of the outer rectangle, or Infinity
  const place = (start: number, w: number, top: number, h: number): number => {
    const spans = space.band(top + oy, top + h + oy).map((s) => ({ start: s.start - ox, end: s.end - ox }));
    return placeInBand(obstacles, spans, start, w, top, top + h);
  };

  let rowTop = 0;
  let rowBottom = 0;
  let cursor = 0;
  let rowEmpty = true;
  for (const rect of rects.toSorted(compareRects(order))) {
    if (rect.wasPacked) continue;
    const w = rect.size.x;
    const h = rect.size.y;
    if (!(w > 0 && h > 0)) continue;
    if (w > width) {
      if (outer.fixedSize) continue;
      const top = rowEmpty ? rowTop : rowBottom;
      rect.position.set(ox, top + oy);
      rect.wasPacked = true;
      rowTop = top + h;
      rowBottom = rowTop;
      cursor = 0;
      rowEmpty = true;
      contentBottom = Math.max(contentBottom, top + h);
      continue;
    }

    let x = place(cursor, w, rowTop, h);
    if (!(x + w <= width) && !rowEmpty) {
      rowTop = rowBottom;
      cursor = 0;
      rowEmpty = true;
      x = place(0, w, rowTop, h);
    }
    // The steps of an empty row. They stay only when the rectangle finds a place.
    let top = rowTop;
    while (!(x + w <= width) && top + h <= limit) {
      const next = Math.min(space.nextY(top + oy, top + h + oy, w) - oy, nextTop(obstacles, top, top + h));
      if (!Number.isFinite(next)) break;
      top = next;
      x = place(0, w, top, h);
    }
    if (!(x + w <= width) || top + h > limit) continue;
    if (top !== rowTop) {
      rowTop = top;
      rowBottom = top;
    }

    rect.position.set(x + ox, rowTop + oy);
    rect.wasPacked = true;
    rowEmpty = false;
    cursor = x + w;
    rowBottom = Math.max(rowBottom, rowTop + h);
    contentBottom = Math.max(contentBottom, rowTop + h);
  }

  if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, contentBottom);
  return outer;
}
