import { packMaxRects, type MaxRectsRule } from "./maxrects.ts";
import { clearMoves, countMove, moveCount, MOVES } from "./moves.ts";
import { compareRects, type SortOrder } from "./order.ts";
import { Rect } from "./rect.ts";
import { packRowsInSpace, packShelf, type ShelfFit } from "./shelf.ts";
import { packSkyline } from "./skyline.ts";
import type { FreeSpace } from "./space.ts";
import { Vector } from "./vector.ts";

/** The options of `pack` and `packRows` */
export interface PackOptions {
  /** The order of the rectangles before the packing. The default is `height-desc`. */
  sortOrder?: SortOrder;
  /**
   * The free space of the container: `freeSpace` of the input. With a space that is not plain, each strategy packs into
   * the outline of the container and around its holes. The rows of `packRows` also go around the locked rectangles.
   */
  space?: FreeSpace;
}

/** The options of `pack` */
export interface PackLayoutOptions extends PackOptions {
  /**
   * The packing: `rows` (the default), `skyline`, `shelf` or `maxrects`. `skyline`, `shelf` and `maxrects` pack around
   * locked rectangles. Use `shelf` with the sort order `input` to keep the order of the array around locked rectangles.
   */
  strategy?: "rows" | "skyline" | "shelf" | "maxrects";
  /** The rule of `shelf` to choose a shelf. Only `shelf` reads it. `ShelfOptions` tells it. Without it, `shelf` packs as in 0.2.3. */
  fit?: ShelfFit;
  /** The rule of `maxrects` to choose a free rectangle. Only `maxrects` reads it. The default is `bssf`. */
  rule?: MaxRectsRule;
  /** The largest height of a band of `maxrects` in a space that is not plain. Only `maxrects` reads it. `MaxRectsOptions` tells it. */
  bandHeight?: number;
  /** The rectangles that `maxrects` can turn by 90 degrees. Only `maxrects` reads it. */
  turnable?: ReadonlySet<unknown>;
  /** The rectangles that `maxrects` turned. Only `maxrects` reads it. `MaxRectsOptions` tells it. */
  turned?: Set<unknown>;
}

/** The depth of the calls of `packInto`. Only the outer gap fill counts its rectangles as moves. */
let fillDepth = 0;

/**
 * The rectangles that the current top call placed, in the order of the placements. A gap fill reads its rectangles from
 * the end of this log.
 */
const placedLog: Rect<unknown>[] = [];

/**
 * The list of the current top call, and the smallest height and width from each index of the list to its end. A gap
 * fill uses the same list, thus the same indexes.
 */
let lowest: { list: unknown[]; height: Float64Array; width: Float64Array } | undefined = undefined;

/**
 * This function packs the rectangles that are not placed into a region with a fixed size. The region gets the list
 * itself, and it skips each placed rectangle. Thus it does the same steps as with a filter of the list.
 *
 * The rectangles that it places are the entries of `placedLog` after `start`. A translation of one rectangle does not
 * change another rectangle. Thus the order of the log gives the same positions as the order of the list.
 */
function packInto<T>(byOrder: Rect<T>[], region: Rect<T>, offset: Vector, order: SortOrder): void {
  const start = placedLog.length;
  fillDepth++;
  try {
    // The region has a fixed size, thus `pack` only calls the row packing
    packSortedRows(byOrder, region, order);
  } finally {
    fillDepth--;
  }
  const end = placedLog.length;
  if (fillDepth === 0) countMove(MOVES.rows, end - start);
  for (let i = start; i < end; i++) placedLog[i]!.translateBy(offset);
}

/**
 * This function packs one try of the rows. With `checks`, it adds the y of the row and the height of the rectangle
 * before each check of the height of `outer`.
 *
 * In a region with a fixed size, the loop stops when each rectangle from the index to the end is too wide or too tall.
 * The proof: the loop skips such a rectangle. A row break before it starts a gap fill. The region of that gap fill is
 * not wider than the current region and not taller than the current row. Thus the gap fill places none of these rectangles.
 * The rest of the loop places nothing.
 *
 * `lowest` holds the bounds only when no size is less than 0.
 */
function packRow<T>(byOrder: Rect<T>[], outer: Rect<T>, order: SortOrder, checks?: number[]): boolean {
  const row: Rect<T>[] = [];
  // A gap fill puts a later rect before an earlier one, thus the order `input` fills no gaps
  const fillGaps = order !== "input";
  const low = outer.fixedSize && lowest?.list === byOrder ? lowest : undefined;

  const rowRect = new Rect<T>();
  rowRect.size.set(outer.size.x, 0);

  for (let i = 0; i < byOrder.length; i++) {
    if (low !== undefined && (rowRect.position.y + low.height[i]! > outer.size.y || low.width[i]! > outer.size.x)) break;
    const rect = byOrder[i]!;
    if (rect.wasPacked) continue;

    if (rect.size.x > rowRect.size.x) {
      if (outer.fixedSize && rect.size.x > outer.size.x) continue;

      const outerLeft = new Rect<T>();
      outerLeft.position.setTo(rowRect.position);
      outerLeft.size.set(outer.size.x - rowRect.position.x, rowRect.size.y);
      outerLeft.fixedSize = true;
      if (fillGaps) packInto(byOrder, outerLeft, outer.position, order);

      rowRect.position.set(0, rowRect.bottom());
      rowRect.size.set(outer.size.x, 0);
      row.length = 0;
    }

    checks?.push(rowRect.position.y, rect.size.y);
    if (rowRect.position.y + rect.size.y > outer.size.y) {
      if (outer.fixedSize) continue;
      outer.size.y += rect.size.y;
      if (!outer.fixedWidth && !outer.size.x) outer.size.x = rect.size.x;
      Rect.resetPacked(byOrder);
      return false;
    }

    row.push(rect);
    rect.position.setTo(rowRect.position.add(outer.position));
    rowRect.shrinkLeft(rect.size.x);
    rect.wasPacked = true;
    placedLog.push(rect);

    if (rect.size.y > rowRect.size.y) rowRect.size.y = rect.size.y;

    if (fillGaps && row.length > 1) {
      const rectInRow = row[row.length - 1]!;
      const outerLeft = new Rect<T>();
      // The position of the region is relative to the outer rectangle, as packInto adds the position of the outer rectangle
      outerLeft.position.set(rectInRow.position.x - outer.position.x, rectInRow.bottom() - outer.position.y);
      outerLeft.size.set(rectInRow.size.x, rowRect.size.y - rectInRow.size.y);
      outerLeft.fixedWidth = true;
      outerLeft.fixedSize = true;
      packInto(byOrder, outerLeft, outer.position, order);
    }
  }
  return true;
}

/** This function gives the smallest height and width from each index of a list to its end, or `undefined` for a size less than 0. */
function lowestOf<T>(byOrder: Rect<T>[]): typeof lowest {
  const height = new Float64Array(byOrder.length);
  const width = new Float64Array(byOrder.length);
  let h = Infinity;
  let w = Infinity;
  for (let i = byOrder.length - 1; i >= 0; i--) {
    const r = byOrder[i]!;
    // A size that is not a number also gives `undefined`, because its comparison gives false
    if (!(r.size.x >= 0 && r.size.y >= 0)) return undefined;
    h = Math.min(h, r.size.y);
    w = Math.min(w, r.size.x);
    height[i] = h;
    width[i] = w;
  }
  return { list: byOrder, height, width };
}

/**
 * This function packs rows of rectangles that are in the order `order` already. A stable sort orders by the key and then
 * by the position in the input. A gap fill reads the same list, thus it gives the layout of a sort again.
 *
 * - A gap fill has a region with a fixed size, thus one try places each rectangle that fits. Each locked rectangle is placed already.
 * - A try of the top call with a free height stops at the first rectangle that goes past the height. The height grows by
 *   the height of that rectangle, and the next try starts again.
 * - The top call replaces these tries with one try with no height limit, when the result is the same. `rowsHeight` tells the proof.
 */
function packSortedRows<T>(byOrder: Rect<T>[], outer: Rect<T>, order: SortOrder): void {
  if (fillDepth > 0) {
    packRow(byOrder, outer, order);
    return;
  }
  for (const r of byOrder) if (r.locked) r.wasPacked = true;
  placedLog.length = 0;
  lowest = lowestOf(byOrder);
  try {
    // A free width of 0 changes at a new try. A placed rectangle that is not locked stays placed only in the first try.
    const once = !outer.fixedSize && (outer.fixedWidth || !(outer.size.x === 0 || Number.isNaN(outer.size.x))) && byOrder.every((r) => r.wasPacked === r.locked);
    if (once) packRowsOnce(byOrder, outer, order);
    else {
      // A row that does not fit grows the height and starts again, thus the gap fills of the try before do not count
      while (!packRow(byOrder, outer, order)) {
        clearMoves(MOVES.rows);
        placedLog.length = 0;
      }
    }
  } finally {
    lowest = undefined;
    placedLog.length = 0;
  }
}

/**
 * This function packs the top call with one try and no height limit. Then it gives `outer` the height of the last try
 * of the old loop, and the move count of that try.
 */
function packRowsOnce<T>(byOrder: Rect<T>[], outer: Rect<T>, order: SortOrder): void {
  const limit = outer.size.y;
  const before = moveCount(MOVES.rows);
  const checks: number[] = [];
  outer.size.y = Infinity;
  try {
    // No sum is more than Infinity, thus no check stops this try
    packRow(byOrder, outer, order, checks);
  } finally {
    outer.size.y = limit;
  }
  const { height, tries } = rowsHeight(checks, limit);
  outer.size.y = height;
  if (tries > 1) {
    // The old loop cleared the count at each new try, thus only the count of the last try stays
    const last = moveCount(MOVES.rows) - before;
    clearMoves(MOVES.rows);
    countMove(MOVES.rows, last);
  }
}

/**
 * This function reads the checks of one try with no height limit. It gives the height of the last try of the old loop,
 * and the number of tries.
 *
 * The proof: the height limit changes only the result of the checks. Thus a try with the limit `L` does the same steps
 * as the try with no limit, up to its first check `y + h > L`. That try stops there, and the next limit is `L + h`.
 *
 * A check that passed with `L` passes again with a larger limit. Thus the first check that stops a try moves only forward
 * in the list. The last try has the positions of the try with no limit, because no check stops it. The old loop
 * reset each rectangle that is not locked before a new try. Thus the first try has the same start only when no such
 * rectangle is placed at the start.
 */
function rowsHeight(checks: readonly number[], limit: number): { height: number; tries: number } {
  let height = limit;
  let tries = 1;
  for (let k = 0; k < checks.length; ) {
    if (checks[k]! + checks[k + 1]! > height) {
      height += checks[k + 1]!;
      tries++;
    } else k += 2;
  }
  return { height, tries };
}

/**
 * This function packs rectangles into an outer rectangle of a given width with a guillotine row packing. It does
 * not change the width. Without `fixedSize`, the height grows until all rectangles fit. A `locked` rectangle keeps
 * its position, but the rows do not go around it. `pack` sets the width first and then uses this function.
 *
 * With `options.space`, the rows go around the locked rectangles and the holes of the space, inside its outline. A space
 * that is plain, with no locked rectangle, gives the rows of 0.1.
 */
export function packRows<T>(rects: Rect<T>[], outer: Rect<T>, options: PackOptions = {}): Rect<T> {
  const order = options.sortOrder ?? "height-desc";
  const space = options.space;
  if (space !== undefined && (!space.plain || rects.some((r) => r.locked))) return packRowsInSpace(rects, outer, order, space);
  // toSorted gives a sorted copy, thus the order of the array of the caller stays. The sort happens once for each call.
  packSortedRows(rects.toSorted(compareRects(order)), outer, order);
  return outer;
}

/**
 * This function packs rectangles into an outer rectangle with a guillotine row packing. It sets the position
 * of each rectangle and the size of the outer rectangle, and it gives the outer rectangle.
 *
 * - Without fixed sizes, the outer rectangle starts with a width of 1.5 times the square root of the total area.
 *   This width is not less than the width of the widest rectangle. The height grows until all rectangles fit.
 * - With `fixedWidth`, the width stays. A rectangle wider than that width goes on its own row and overflows.
 * - With `fixedSize`, a rectangle that does not fit is not packed: its `wasPacked` stays `false`.
 * - `options.strategy` selects `packRows` (the default), `packSkyline`, `packShelf` or `packMaxRects` after the width is set.
 */
export function pack<T>(rects: Rect<T>[], outer: Rect<T> = new Rect(), options: PackLayoutOptions = {}): Rect<T> {
  let totalArea = 0;
  let widest = 0;
  let minX = rects.length > 0 ? Infinity : 0;
  let minY = rects.length > 0 ? Infinity : 0;
  for (const r of rects) {
    totalArea += r.area();
    widest = Math.max(widest, r.size.x);
    minX = Math.min(minX, r.size.x);
    minY = Math.min(minY, r.size.y);
  }

  const idealWidth = outer.fixedWidth
    ? outer.size.x
    : Math.max(widest, Math.min(1.5 * Math.sqrt(totalArea), outer.size.x || Infinity));

  const ideal = Vector.of(idealWidth).clamp(new Vector(minX, minY), Vector.Infinity);

  // A fixed width stays, also when a rectangle is wider: that rectangle overflows
  if (!outer.fixedSize) outer.size.setTo(outer.fixedWidth ? new Vector(outer.size.x, ideal.y) : ideal);
  if (options.strategy === "skyline") packSkyline(rects, outer, options);
  else if (options.strategy === "shelf") packShelf(rects, outer, options);
  else if (options.strategy === "maxrects") packMaxRects(rects, outer, options);
  else packRows(rects, outer, options);

  if (!outer.fixedSize) {
    const contentRight = Rect.maxRight(rects);
    if (!outer.size.x) outer.size.x = contentRight;
    else if (!outer.fixedWidth) outer.size.x = Math.min(contentRight, outer.size.x);
    outer.size.y = Rect.maxBottom(rects);
  }

  return outer;
}
