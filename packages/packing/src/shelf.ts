import { countMove, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import type { Rect } from "./rect.ts";
import { firstFit, type FreeSpace, type FreeSpan } from "./space.ts";

/**
 * The rule of a shelf packing to choose the shelf of a rectangle. `packShelf` tells each rule.
 *
 * - `next`: only the open shelf, the last shelf that the packing opened.
 * - `first`: the first shelf from the top where the rectangle fits.
 * - `best`: the shelf with the least height left over above the rectangle.
 */
export type ShelfFit = "next" | "first" | "best";

/** This constant lists each shelf fit. */
export const SHELF_FITS: readonly ShelfFit[] = ["next", "first", "best"];

/** The options of `packShelf` */
export interface ShelfOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. Without it, or when it is plain, the packer uses only the
   * outer rectangle and the locked rectangles.
   */
  space?: FreeSpace;
  /**
   * The rule to choose a shelf. Without it, `packShelf` packs as in 0.2.3. With it, `packShelf` uses its own shelves in
   * each container shape, and it stacks rectangles in the strips above the shorter rectangles.
   */
  fit?: ShelfFit;
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
 * - With `fit`, `packShelvesInSpace` packs the rectangles, in each container shape. A `fit` that is not in `SHELF_FITS` throws a `RangeError`.
 */
export function packShelf<T>(rects: Rect<T>[], outer: Rect<T>, options: ShelfOptions = {}): Rect<T> {
  if (options.fit !== undefined) return packShelvesInSpace(rects, outer, options.sortOrder ?? "height-desc", options.fit, options.space);
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

/** A shelf of `packShelvesInSpace`, in the coordinates of the outer rectangle. */
interface Shelf {
  /** The top edge of the shelf. */
  top: number;
  /** The height of the shelf: the height of its first rectangle. Only the last shelf grows. */
  height: number;
  /** The x after the last rectangle on the floor of the shelf. The value `Infinity` closes the shelf. */
  cursor: number;
  /** The strips above the rectangles on the floor. A later rectangle stacks in a strip. */
  strips: Strip[];
}

/** The free strip above a rectangle of a shelf: from `x` to `x + w`, and from `bottom` to the top edge of the next shelf. */
interface Strip {
  x: number;
  w: number;
  bottom: number;
}

/** A place for a rectangle on a shelf. `left` is the height of the shelf that stays free above the rectangle. */
interface Spot {
  shelf: Shelf;
  x: number;
  y: number;
  left: number;
  /** The strip of a stacked rectangle. A rectangle on the floor has no strip. */
  strip?: Strip;
  /** The value `true` when the rectangle is taller than the last shelf, and the shelf grows. */
  grow?: boolean;
}

/**
 * This function packs rectangles into shelves with a fit: `next`, `first` or `best`. `packShelf` uses it when its
 * options have a `fit`. It sets the position of each rectangle and gives the outer rectangle.
 *
 * - A shelf opens at the bottom edge of the last shelf, at the first x where the rectangle fits in the free space.
 *   When no x fits, the shelf steps down to `nextY` of the space, as an empty row of `packRowsInSpace` does.
 * - The first rectangle of a shelf sets its height. A rectangle goes on the floor of a shelf at its cursor, or into
 *   the strip above a shorter rectangle of the shelf. The strip is the move `move.stack`.
 * - The fit `next` uses only the open shelf: the last shelf that the packing opened. The fit `first` uses the first
 *   shelf from the top where the rectangle fits. The fit `best` uses the place with the least height left over.
 * - In a shelf, the rectangle takes the place with the least height left over. A tie goes to a strip, from left to right.
 * - When no shelf has a place, the last shelf grows for a taller rectangle, if it fits. Else a new shelf opens.
 * - A rectangle wider than the outer rectangle overflows. Without `fixedSize`, it goes on a closed shelf of its own at the left edge.
 * - Each place is in the free space and crosses no locked rectangle. Without a space, the outer rectangle and the
 *   locked rectangles give the free space.
 */
function packShelvesInSpace<T>(rects: Rect<T>[], outer: Rect<T>, order: SortOrder, fit: ShelfFit, space: FreeSpace | undefined): Rect<T> {
  if (!SHELF_FITS.includes(fit)) throw new RangeError(`The shelf fit "${String(fit)}" is not one of ${SHELF_FITS.join(", ")}.`);
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
  const whole: readonly FreeSpan[] = [{ start: 0, end: Infinity }];
  // The x in the band, in the coordinates of the outer rectangle, or Infinity
  const place = (start: number, w: number, top: number, h: number): number => {
    const spans = space === undefined ? whole : space.band(top + oy, top + h + oy).map((s) => ({ start: s.start - ox, end: s.end - ox }));
    return placeInBand(obstacles, spans, start, w, top, top + h);
  };
  // The next top edge where the free spans change, or Infinity
  const stepDown = (top: number, w: number, h: number): number =>
    Math.min(space === undefined ? Infinity : space.nextY(top + oy, top + h + oy, w) - oy, nextTop(obstacles, top, top + h));

  // The places of a shelf that the sizes allow, by the height left over. A strip comes before the floor on a tie.
  const spotsOn = (shelf: Shelf, w: number, h: number, grow: boolean): Spot[] => {
    const ceiling = shelf.top + shelf.height;
    const spots: Spot[] = [];
    if (!grow) {
      for (const strip of shelf.strips) {
        if (w <= strip.w && strip.bottom + h <= ceiling) spots.push({ shelf, x: strip.x, y: strip.bottom, left: ceiling - strip.bottom - h, strip });
      }
    }
    const tall = grow ? h > shelf.height && shelf.top + h <= limit : h <= shelf.height;
    if (Number.isFinite(shelf.cursor) && tall) spots.push({ shelf, x: shelf.cursor, y: shelf.top, left: grow ? 0 : shelf.height - h, ...(grow ? { grow } : {}) });
    return spots.toSorted((a, b) => a.left - b.left);
  };
  // The place of a spot in the free space, or undefined. A rectangle on the floor can move right of the cursor.
  const verify = (spot: Spot, w: number, h: number): Spot | undefined => {
    const x = place(spot.x, w, spot.y, h);
    if (spot.strip !== undefined) return x === spot.x ? spot : undefined;
    return x + w <= width ? { ...spot, x } : undefined;
  };
  const firstOn = (shelf: Shelf, w: number, h: number): Spot | undefined => {
    for (const spot of spotsOn(shelf, w, h, false)) {
      const found = verify(spot, w, h);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const shelves: Shelf[] = [];
  for (const rect of rects.toSorted(compareRects(order))) {
    if (rect.wasPacked) continue;
    const w = rect.size.x;
    const h = rect.size.y;
    if (!(w > 0 && h > 0)) continue;
    const open = shelves.at(-1);
    const floor = open === undefined ? 0 : open.top + open.height;

    if (w > width) {
      if (outer.fixedSize) continue;
      // An overflowing rectangle goes on a closed shelf of its own, under the locked rectangles at the left edge
      let top = floor;
      while (firstFreeX(obstacles, 0, w, top, top + h) !== 0) {
        const next = nextTop(obstacles, top, top + h);
        if (!Number.isFinite(next)) break;
        top = next;
      }
      rect.position.set(ox, top + oy);
      rect.wasPacked = true;
      shelves.push({ top, height: h, cursor: Infinity, strips: [] });
      contentBottom = Math.max(contentBottom, top + h);
      continue;
    }

    // Step 1: a shelf where the rectangle fits without growth
    let spot: Spot | undefined;
    let firstShelf: Shelf | undefined;
    if (fit === "best") {
      for (const s of shelves.flatMap((shelf) => spotsOn(shelf, w, h, false)).toSorted((a, b) => a.left - b.left)) {
        spot = verify(s, w, h);
        if (spot !== undefined) break;
      }
      if (spot !== undefined) firstShelf = shelves.find((shelf) => shelf === spot!.shelf || firstOn(shelf, w, h) !== undefined);
    } else {
      for (const shelf of fit === "next" ? shelves.slice(-1) : shelves) {
        spot = firstOn(shelf, w, h);
        if (spot !== undefined) break;
      }
    }
    // Step 2: the last shelf grows. Step 3: a new shelf opens under the last shelf.
    if (spot === undefined && open !== undefined) {
      const grown = spotsOn(open, w, h, true)[0];
      if (grown !== undefined) spot = verify(grown, w, h);
    }
    if (spot === undefined) {
      let top = floor;
      let x = place(0, w, top, h);
      while (!(x + w <= width) && top + h <= limit) {
        const next = stepDown(top, w, h);
        if (!Number.isFinite(next)) break;
        top = next;
        x = place(0, w, top, h);
      }
      if (!(x + w <= width) || top + h > limit) continue;
      const shelf: Shelf = { top, height: h, cursor: x, strips: [] };
      shelves.push(shelf);
      spot = { shelf, x, y: top, left: 0 };
    } else {
      if (spot.shelf !== open) countMove(MOVES.firstFit);
      if (firstShelf !== undefined && spot.shelf !== firstShelf) countMove(MOVES.bestFit);
    }

    const { shelf } = spot;
    rect.position.set(spot.x + ox, spot.y + oy);
    rect.wasPacked = true;
    if (spot.strip !== undefined) {
      countMove(MOVES.shelf);
      spot.strip.bottom = spot.y + h;
    } else {
      shelf.cursor = spot.x + w;
      shelf.strips.push({ x: spot.x, w, bottom: spot.y + h });
      if (spot.grow === true) shelf.height = h;
    }
    contentBottom = Math.max(contentBottom, spot.y + h);
  }

  if (!outer.fixedSize) outer.size.y = Math.max(outer.size.y, contentBottom);
  return outer;
}
