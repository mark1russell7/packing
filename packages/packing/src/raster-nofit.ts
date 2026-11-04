// The function `packRasterNofit` of roadmap item k92 (`docs/PACKER.md`, "A raster no-fit", idea S3 of the survey): the first slice of a raster no-fit.
// It covers each shape with grid cells, places each shape bottom-left on the free cells, and searches the order. Nothing default uses it.

import { boundsOf, EPS, randomInt, rectInRegion, regionArea, regionHitsRect, stepRandom, translate, type Rect } from "@mark1russell7/layout-contract";
import { marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement, type Region } from "./contract.ts";

/** The options of `packRasterNofit`. */
export interface RasterNofitOptions {
  /** The side of a grid cell. The function rounds it down with `rasterCell`. The default is a quarter of the shortest side of a box, and the width has at most 1024 cells. */
  cell?: number;
  /** The count of the orders that the search decodes. A whole number of 1 or more. The default is 64. */
  trials?: number;
  /** The seed of the moves of the search. The default is 0. */
  seed?: number;
}

/** The cells of one region on the grid: the lines of the grid are the whole multiples of `cell`. */
export interface RasterCover {
  /** The side of a cell after `rasterCell`. */
  readonly cell: number;
  /** The grid column of the first column of the cover. */
  readonly col: number;
  /** The grid row of the first row of the cover. */
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
  /** The filled spans of each row: a start column and an end column after the span, relative to `col`. */
  readonly spans: readonly (readonly (readonly [number, number])[])[];
  /** The count of the filled cells. */
  readonly count: number;
}

/** The id of the trace stage of `packRasterNofit`. */
export const RASTER_NOFIT_STAGE = "raster-nofit";

/** The largest count of grid cells that `packRasterNofit` accepts: columns times the rows that a pack can use. */
export const RASTER_NOFIT_MAX_CELLS: number = 2 ** 24;

/** The default count of the decoded orders. */
const DEFAULT_TRIALS = 64;

/** The count of the significant bits of a cell. Thus each grid line is an exact float. */
const CELL_BITS = 20;

/** The largest size of a coordinate in cells. Thus the float error of a clip stays well under the pad. */
const MAX_LINE = 2 ** 24;

/** The pad of a sloped edge and of a curve, as a share of a cell. */
const PAD_SHARE = 2 ** -20;

/** The default count of cells in the width. */
const DEFAULT_WIDTH_CELLS = 1024;

/** A cell with no part of the region. */
const OUT = 0;
/** A cell with a part of the border of the region. */
const EDGE = 1;
/** A cell inside the region, with no part of the border. */
const IN = 2;

/** The cells of a region and their states. */
interface Raster {
  col: number;
  row: number;
  cols: number;
  rows: number;
  state: Uint8Array;
}

/** The exact extent of a region, relative to its own origin. */
interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One orientation of one shape: its cover and its extent. Items with the same outline share one stamp. */
interface Stamp {
  index: number;
  cover: RasterCover;
  extent: Extent;
  area: number;
  turn: 0 | 90;
}

/** One free item and its orientations. */
interface Piece {
  index: number;
  id: string;
  area: number;
  stamps: Stamp[];
}

/** The fixed facts of one pack: the walls, the grid and the blocked cells. */
interface Board {
  cell: number;
  walls: Extent;
  gridCol: number;
  gridRow: number;
  gridCols: number;
  /** The sums of the blocked cells of each grid row. A row without a value is free. */
  base: (Int32Array | undefined)[];
  stampCount: number;
}

/** The result of one decoded order. */
interface Decoded {
  placed: ({ stamp: Stamp; col: number; row: number } | undefined)[];
  overflow: number;
  length: number;
  bottoms: number;
}

/**
 * This function gives the cell side for a wanted side. The result has 20 significant bits, and it is the largest such value at or under the wanted side.
 * Thus each whole multiple of the result is an exact float. It throws a `RangeError` for a value that is not above 0 and finite.
 */
export function rasterCell(cell: number): number {
  if (!(cell > 0) || !Number.isFinite(cell)) throw new RangeError(`The cell of raster-nofit is a number above 0, not ${String(cell)}.`);
  const unit = 2 ** (Math.floor(Math.log2(cell)) - CELL_BITS + 1);
  const snapped = Math.floor(cell / unit) * unit;
  return snapped > 0 ? snapped : cell;
}

/** This function gives the largest whole `k` with `k * cell` at or under `v`. The compares are exact. */
function floorLine(v: number, cell: number): number {
  let k = Math.floor(v / cell);
  while ((k + 1) * cell <= v) k++;
  while (k * cell > v) k--;
  return k;
}

/** This function gives the smallest whole `k` with `k * cell` at or over `v`. The compares are exact. */
function ceilLine(v: number, cell: number): number {
  return -floorLine(-v, cell);
}

/** This function tells if `a + b` is at or over `c`, with the exact sum: the error term of the float sum breaks a tie. */
function sumAtLeast(a: number, b: number, c: number): boolean {
  const sum = a + b;
  if (sum !== c) return sum > c;
  const part = sum - a;
  return a - (sum - part) + (b - part) >= 0;
}

/** This function gives the rings of a region with straight edges. A curve gives `undefined`. */
function ringsOf(region: Region): readonly (readonly (readonly [number, number])[])[] | undefined {
  if (region.kind === "polygon") return [region.points, ...(region.holes ?? [])];
  if (region.kind !== "rect") return undefined;
  const { x, y, w, h } = region;
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
}

/** This function gives the exact extent of a region. A float sum gives the extent of a curve, and thus a curve has an error of one float step. */
function extentOf(region: Region): Extent {
  const rings = ringsOf(region);
  if (rings === undefined) {
    const b = boundsOf(region);
    return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
  }
  const outer = rings[0]!;
  if (outer.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const box: Extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of outer) {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

/** This function gives the rectangle of a grid cell, grown by `pad` on each side. */
function cellRect(col: number, row: number, cell: number, pad: number): Rect {
  return { x: col * cell - pad, y: row * cell - pad, w: cell + 2 * pad, h: cell + 2 * pad };
}

/**
 * This function marks the cells of the raster that an edge crosses.
 * An edge on an axis marks a cell only when it is inside the open cell, by an exact compare. Thus an edge on a grid line fills no cell.
 * A sloped edge marks each cell that it enters after the cell grows by the pad. With `sharp` at `false`, each edge is a sloped edge.
 */
function markEdge(raster: Raster, a: readonly [number, number], b: readonly [number, number], cell: number, sharp: boolean): void {
  const { col, row, cols, rows, state } = raster;
  const pad = cell * PAD_SHARE;
  const more = sharp ? 0 : 1;
  const c0 = Math.max(floorLine(Math.min(a[0], b[0]), cell) - more, col);
  const c1 = Math.min(ceilLine(Math.max(a[0], b[0]), cell) + more, col + cols);
  const r0 = Math.max(floorLine(Math.min(a[1], b[1]), cell) - more, row);
  const r1 = Math.min(ceilLine(Math.max(a[1], b[1]), cell) + more, row + rows);
  if (sharp && a[0] === b[0]) {
    if (c0 * cell === a[0] || c0 >= col + cols) return;
    for (let r = r0; r < r1; r++) state[(r - row) * cols + c0 - col] = EDGE;
    return;
  }
  if (sharp && a[1] === b[1]) {
    if (r0 * cell === a[1] || r0 >= row + rows) return;
    for (let c = c0; c < c1; c++) state[(r0 - row) * cols + c - col] = EDGE;
    return;
  }
  const edge: Region = { kind: "polygon", points: [a, b] };
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) if (regionHitsRect(edge, cellRect(c, r, cell, pad))) state[(r - row) * cols + c - col] = EDGE;
  }
}

/**
 * This function gives the raster of a region: each cell of its extent is `OUT`, `EDGE` or `IN`.
 * Each cell with a part of the inside of the region is `EDGE` or `IN`. A cell that the border does not cross has the state of its center.
 */
function rasterOf(region: Region, cell: number, sharp: boolean): Raster {
  const e = extentOf(region);
  const pad = cell * PAD_SHARE;
  const out = sharp ? 0 : pad;
  const col = floorLine(e.x0 - out, cell);
  const row = floorLine(e.y0 - out, cell);
  const cols = Math.max(ceilLine(e.x1 + out, cell) - col, 0);
  const rows = Math.max(ceilLine(e.y1 + out, cell) - row, 0);
  const raster: Raster = { col, row, cols, rows, state: new Uint8Array(cols * rows) };
  const rings = ringsOf(region);
  if (rings !== undefined) {
    for (const ring of rings) ring.forEach((a, i) => markEdge(raster, a, ring[(i + 1) % ring.length]!, cell, sharp));
  }
  // The tests of the contract accept EPS on a curve, as a share of the radius. This pad is larger, so an `IN` cell is inside the curve.
  const far = EPS * (1 + Math.max(e.x1 - e.x0, e.y1 - e.y0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const at = r * cols + c;
      if (raster.state[at] !== OUT) continue;
      if (rings !== undefined) {
        if (regionHitsRect(region, cellRect(col + c, row + r, cell, 0))) raster.state[at] = IN;
      } else if (rectInRegion(region, cellRect(col + c, row + r, cell, far))) raster.state[at] = IN;
      else if (regionHitsRect(region, cellRect(col + c, row + r, cell, pad))) raster.state[at] = EDGE;
    }
  }
  return raster;
}

/** This function gives the filled spans of a raster, as a cover. */
function coverOf(raster: Raster, cell: number): RasterCover {
  const { col, row, cols, rows, state } = raster;
  const spans: (readonly [number, number])[][] = [];
  let count = 0;
  for (let r = 0; r < rows; r++) {
    const list: (readonly [number, number])[] = [];
    for (let c = 0; c < cols; c++) {
      if (state[r * cols + c] === OUT) continue;
      const start = c;
      while (c + 1 < cols && state[r * cols + c + 1] !== OUT) c++;
      list.push([start, c + 1]);
      count += c + 1 - start;
    }
    spans.push(list);
  }
  return { cell, col, row, cols, rows, spans, count };
}

/**
 * This function gives the cover of a region on the grid of the cell side: the outer rounding rule of `packRasterNofit`.
 *
 * - Each point inside the region is in a filled cell, on its border at most. Thus two regions with disjoint covers have no common inside point.
 * - An edge on a grid line fills no cell past the line, by an exact compare. Thus a shape on the grid costs no extra cell.
 * - A sloped edge or a curve fills each cell that it enters after the cell grows by a pad of `2 ** -20` cells.
 */
export function rasterCover(region: Region, cell: number): RasterCover {
  const side = rasterCell(cell);
  return coverOf(rasterOf(region, side, true), side);
}

/** This function gives the outline of an item: its shape, or its box. */
export function outlineOf(item: Item): Region {
  return item.shape ?? { kind: "rect", x: 0, y: 0, w: item.w, h: item.h };
}

/** This function throws a `RangeError` for a field that this slice does not read. */
function checkRasterInput(input: PackInput, trials: number): void {
  const { container } = input;
  if (!Number.isInteger(trials) || trials < 1) throw new RangeError(`The trials of raster-nofit are a whole number of 1 or more, not ${String(trials)}.`);
  if (container.fixed !== "size" && container.fixed !== "width") throw new RangeError(`raster-nofit needs a container with fixed "size" or "width", not "${container.fixed}".`);
  if (container.fixed === "width" && container.shape !== undefined && container.shape.kind !== "rect") throw new RangeError("raster-nofit needs a fixed size for a container with a shape.");
  if (container.shape !== undefined && container.shape.kind !== "rect" && (container.inset ?? 0) !== 0) throw new RangeError("raster-nofit reads no inset for a container with a shape.");
  if ((input.gap ?? 0) !== 0 || (input.pairGaps?.length ?? 0) > 0) throw new RangeError("raster-nofit reads no gap and no pairGaps.");
  for (const item of input.items) {
    const m = marginOf(item);
    if (m.left !== 0 || m.right !== 0 || m.top !== 0 || m.bottom !== 0) throw new RangeError(`raster-nofit reads no margin, and the item ${item.id} has one.`);
  }
}

/** This function gives the walls of the container, less the inset. A free height has an infinite bottom wall. */
export function wallsOf(input: PackInput): Extent {
  const { container } = input;
  const inset = container.inset ?? 0;
  const shape = container.shape === undefined ? undefined : boundsOf(container.shape);
  const x0 = shape?.x ?? 0;
  const y0 = shape?.y ?? 0;
  const w = shape?.w ?? container.w;
  const h = shape?.h ?? container.h;
  if (w === undefined || (container.fixed === "size" && h === undefined)) throw new RangeError("raster-nofit needs the size that the container fixes.");
  return { x0: x0 + inset, y0: y0 + inset, x1: x0 + w - inset, y1: container.fixed === "size" ? y0 + h! - inset : Infinity };
}

/** This function gives the cell side: the option, or a quarter of the shortest box side with at most 1024 cells in the width. */
export function cellOf(input: PackInput, walls: Extent, option: number | undefined): number {
  if (option !== undefined) return rasterCell(option);
  const sides = input.items.flatMap((i) => [i.w, i.h]).filter((v) => v > 0);
  const least = (walls.x1 - walls.x0) / DEFAULT_WIDTH_CELLS;
  const wanted = sides.length === 0 ? least : Math.max(Math.min(...sides) / 4, least);
  return rasterCell(wanted > 0 ? wanted : 1);
}

/** This function adds one filled span to a row of sums. The span is free, so no cell counts two times. */
function addSpan(sums: Int32Array, lo: number, hi: number): void {
  for (let k = lo + 1; k < sums.length; k++) sums[k]! += Math.min(k, hi) - lo;
}

/** This function gives the blocked cells as sums for each row: the outside of a shaped container, each obstacle and each locked item. */
function blockedRows(input: PackInput, cell: number, gridCol: number, gridRow: number, gridCols: number, walls: Extent, locked: readonly Item[]): (Int32Array | undefined)[] {
  const blocked = new Map<number, Uint8Array>();
  const mark = (r: number, c: number): void => {
    if (r < 0 || c < 0 || c >= gridCols) return;
    let line = blocked.get(r);
    if (line === undefined) blocked.set(r, (line = new Uint8Array(gridCols)));
    line[c] = 1;
  };
  const stamp = (region: Region, sharp: boolean, dCol = 0, dRow = 0): void => {
    const cover = coverOf(rasterOf(region, cell, sharp), cell);
    cover.spans.forEach((list, j) => {
      for (const [a, b] of list) for (let k = a; k < b; k++) mark(cover.row + dRow + j - gridRow, cover.col + dCol + k - gridCol);
    });
  };
  const shape = input.container.shape;
  if (shape !== undefined && shape.kind !== "rect") {
    const raster = rasterOf(shape, cell, true);
    const rows = ceilLine(walls.y1, cell) - gridRow;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const i = r + gridRow - raster.row;
        const j = c + gridCol - raster.col;
        const inside = i >= 0 && j >= 0 && i < raster.rows && j < raster.cols && raster.state[i * raster.cols + j] === IN;
        if (!inside) mark(r, c);
      }
    }
  }
  for (const obstacle of input.obstacles ?? []) stamp(obstacle.region, true);
  for (const item of locked) {
    const dCol = Math.round(item.x! / cell);
    const dRow = Math.round(item.y! / cell);
    if (dCol * cell === item.x && dRow * cell === item.y) stamp(outlineOf(item), true, dCol, dRow);
    else stamp(translate(outlineOf(item), item.x!, item.y!), false);
  }
  const base: (Int32Array | undefined)[] = [];
  for (const [r, line] of blocked) {
    const sums = new Int32Array(gridCols + 1);
    for (let c = 0; c < gridCols; c++) sums[c + 1] = sums[c]! + line[c]!;
    base[r] = sums;
  }
  return base;
}

/** This function makes the stamps of the free items. Items with the same outline share a stamp. */
function piecesOf(items: readonly Item[], cell: number): { pieces: Piece[]; count: number } {
  const stamps = new Map<string, Stamp>();
  const stampOf = (item: Item, turn: 0 | 90): Stamp => {
    const region = outlineOf(item);
    const key = `${turn}:${JSON.stringify(region)}`;
    let stamp = stamps.get(key);
    if (stamp === undefined) {
      stamp = { index: stamps.size, cover: coverOf(rasterOf(region, cell, true), cell), extent: extentOf(region), area: regionArea(region), turn };
      stamps.set(key, stamp);
    }
    return stamp;
  };
  const pieces = items.map((item, index): Piece => {
    const list = [stampOf(item, 0)];
    if (item.turnable === true) list.push(stampOf(turnItem(item), 90));
    return { index, id: item.id, area: list[0]!.area, stamps: list };
  });
  return { pieces, count: stamps.size };
}

/** This function gives the first and the last column that keep the extent of a stamp between the walls. */
function columnRange(stamp: Stamp, board: Board): [number, number] {
  const { cell, walls } = board;
  const { x0, x1 } = stamp.extent;
  let lo = ceilLine(walls.x0 - x0, cell) - 1;
  while (!sumAtLeast(lo * cell, x0, walls.x0)) lo++;
  let hi = floorLine(walls.x1 - x1, cell) + 1;
  while (!sumAtLeast(-hi * cell, -x1, -walls.x1)) hi--;
  return [lo, hi];
}

/** This function gives the first and the last row that keep the extent of a stamp between the walls. A free height has no last row. */
function rowRange(stamp: Stamp, board: Board): [number, number] {
  const { cell, walls } = board;
  const { y0, y1 } = stamp.extent;
  let lo = ceilLine(walls.y0 - y0, cell) - 1;
  while (!sumAtLeast(lo * cell, y0, walls.y0)) lo++;
  if (walls.y1 === Infinity) return [lo, Infinity];
  let hi = floorLine(walls.y1 - y1, cell) + 1;
  while (!sumAtLeast(-hi * cell, -y1, -walls.y1)) hi--;
  return [lo, hi];
}

/** This function tells if each filled cell of a stamp is free at the place `col`, `row`. */
function fits(stamp: Stamp, col: number, row: number, rows: readonly (Int32Array | undefined)[], board: Board): boolean {
  const { cover } = stamp;
  const left = col + cover.col - board.gridCol;
  const top = row + cover.row - board.gridRow;
  for (let j = 0; j < cover.rows; j++) {
    const sums = rows[top + j];
    if (sums === undefined) continue;
    for (const [a, b] of cover.spans[j]!) if (sums[left + b] !== sums[left + a]) return false;
  }
  return true;
}

/** This function gives the first free place of a stamp, by row, then by column. It starts at the place of the last item with the same stamp. */
function firstPlace(stamp: Stamp, rows: readonly (Int32Array | undefined)[], board: Board, from: readonly [number, number] | undefined): [number, number] | undefined {
  const [colLo, colHi] = columnRange(stamp, board);
  const [rowLo, rowHi] = rowRange(stamp, board);
  if (colLo > colHi) return undefined;
  const startRow = from === undefined ? rowLo : Math.max(rowLo, from[0]);
  for (let row = startRow; row <= rowHi; row++) {
    const startCol = from !== undefined && row === from[0] ? Math.max(colLo, from[1]) : colLo;
    for (let col = startCol; col <= colHi; col++) if (fits(stamp, col, row, rows, board)) return [row, col];
  }
  return undefined;
}

/** This function decodes one order: each item goes to its first free place. A turnable item takes the orientation with the lower bottom, then the lower column. */
function decode(order: readonly Piece[], pieceCount: number, board: Board): Decoded {
  const { cell, gridCol, gridRow, gridCols } = board;
  const rows = board.base.slice();
  const owned = new Set<number>();
  const from: ([number, number] | undefined)[] = new Array(board.stampCount).fill(undefined);
  const placed: Decoded["placed"] = new Array(pieceCount).fill(undefined);
  let overflow = 0;
  let length = -Infinity;
  let bottoms = 0;
  for (const piece of order) {
    let best: { stamp: Stamp; col: number; row: number; bottom: number } | undefined;
    for (const stamp of piece.stamps) {
      const at = firstPlace(stamp, rows, board, from[stamp.index]);
      if (at === undefined) continue;
      from[stamp.index] = at;
      const bottom = at[0] * cell + stamp.extent.y1;
      if (best === undefined || bottom < best.bottom || (bottom === best.bottom && at[1] < best.col)) best = { stamp, col: at[1], row: at[0], bottom };
    }
    if (best === undefined) {
      overflow++;
      continue;
    }
    placed[piece.index] = best;
    length = Math.max(length, best.bottom);
    bottoms += best.bottom;
    const { cover } = best.stamp;
    const left = best.col + cover.col - gridCol;
    const top = best.row + cover.row - gridRow;
    cover.spans.forEach((list, j) => {
      const r = top + j;
      if (list.length === 0) return;
      if (!owned.has(r)) {
        rows[r] = rows[r]?.slice() ?? new Int32Array(gridCols + 1);
        owned.add(r);
      }
      for (const [a, b] of list) addSpan(rows[r]!, left + a, left + b);
    });
  }
  return { placed, overflow, length, bottoms };
}

/** This function tells if `a` is better than `b`: fewer items left out, then a shorter length, then a lower sum of the bottoms. */
function better(a: Decoded, b: Decoded): boolean {
  if (a.overflow !== b.overflow) return a.overflow < b.overflow;
  if (a.length !== b.length) return a.length < b.length;
  return a.bottoms < b.bottoms;
}

/** This function gives the start orders of the search: by area, by height of the box, by width of the box and the input order. Each sort is stable. */
function startOrders(pieces: readonly Piece[]): Piece[][] {
  const box = (p: Piece): Extent => p.stamps[0]!.extent;
  return [
    pieces.toSorted((a, b) => b.area - a.area),
    pieces.toSorted((a, b) => box(b).y1 - box(b).y0 - (box(a).y1 - box(a).y0)),
    pieces.toSorted((a, b) => box(b).x1 - box(b).x0 - (box(a).x1 - box(a).x0)),
    [...pieces],
  ];
}

/** This function gives a copy of an order with one random move: a swap of two items, or one item at a new place. */
export function moved<T>(order: readonly T[], r: () => number): T[] {
  const next = [...order];
  const i = randomInt(r, 0, next.length - 1);
  const j = randomInt(r, 0, next.length - 1);
  if (r() < 0.5) {
    [next[i], next[j]] = [next[j]!, next[i]!];
  } else {
    const [one] = next.splice(i, 1);
    next.splice(j, 0, one!);
  }
  return next;
}

/**
 * This function packs shapes on a grid of cells (idea S3 of the survey, catalog row `nest-raster-brkga`). It is a standalone function, and nothing default uses it.
 *
 * - Each item covers the cells of `rasterCover`, and an item without a shape covers its box. The place of an item is a whole multiple of the cell side.
 * - A place is valid when each filled cell is free. The extent of the shape stays between the walls, by an exact compare. Thus a valid place on the grid is valid for the real shape.
 * - A cell inside a hole of a shape stays free, so a small item can go in the hole.
 * - Each item goes to the lowest free row, then to the lowest free column. A turnable item tries the two orientations.
 * - The search decodes `trials` orders. It starts from 4 sorted orders, then it moves one item of the best order. It reads no clock.
 * - The container has a fixed size or a fixed width. A free height gives the shortest length that the search found.
 * - The function refuses a `gap`, `pairGaps` and a margin with a `RangeError`. An obstacle stays, and a locked item keeps its place.
 * - A locked item off the grid is a float sum, so each of its edges fills the cells near it by the pad.
 *
 * The same input and options give the same output, byte for byte.
 */
export function packRasterNofit(input: PackInput, options: RasterNofitOptions = {}): PackOutput {
  const trials = options.trials ?? DEFAULT_TRIALS;
  checkRasterInput(input, trials);
  const walls = wallsOf(input);
  const cell = cellOf(input, walls, options.cell);
  const free = input.items.filter((i) => !(i.locked === true && i.x !== undefined && i.y !== undefined));
  const locked = input.items.filter((i) => i.locked === true && i.x !== undefined && i.y !== undefined);
  const { pieces, count } = piecesOf(free, cell);
  const gridCol = floorLine(walls.x0, cell);
  const gridRow = floorLine(walls.y0, cell);
  const gridCols = ceilLine(walls.x1, cell) - gridCol;
  const reach = pieces.reduce((sum, p) => sum + Math.max(...p.stamps.map((s) => s.cover.rows)), 0);
  const gridRows = walls.y1 === Infinity ? reach : ceilLine(walls.y1, cell) - gridRow;
  const largest = Math.max(Math.abs(walls.x0), Math.abs(walls.x1), ...pieces.flatMap((p) => p.stamps.flatMap((s) => [Math.abs(s.extent.x0), Math.abs(s.extent.x1), Math.abs(s.extent.y0), Math.abs(s.extent.y1)])));
  if (gridCols * gridRows > RASTER_NOFIT_MAX_CELLS || largest / cell > MAX_LINE) throw new RangeError(`The cell ${cell} of raster-nofit gives too many cells. Use a larger cell.`);
  const board: Board = { cell, walls, gridCol, gridRow, gridCols, base: blockedRows(input, cell, gridCol, gridRow, gridCols, walls, locked), stampCount: count };
  const r = stepRandom(options.seed ?? 0, RASTER_NOFIT_STAGE);
  const starts = startOrders(pieces);
  let bestOrder = starts[0]!;
  let best = decode(bestOrder, pieces.length, board);
  let done = 1;
  for (const order of starts.slice(1)) {
    if (done >= trials) break;
    const tried = decode(order, pieces.length, board);
    done++;
    if (better(tried, best)) [best, bestOrder] = [tried, order];
  }
  while (done < trials && pieces.length > 1) {
    const order = moved(bestOrder, r);
    const tried = decode(order, pieces.length, board);
    done++;
    if (!better(best, tried)) [best, bestOrder] = [tried, order];
  }
  return outputOf(input, pieces, locked, best, board, done);
}

/** This function gives the output of the best order, in the order of the input items. */
function outputOf(input: PackInput, pieces: readonly Piece[], locked: readonly Item[], best: Decoded, board: Board, done: number): PackOutput {
  const { cell, walls } = board;
  const at = new Map<string, Placement>();
  const overflow: string[] = [];
  let shapeArea = 0;
  let coverArea = 0;
  pieces.forEach((piece, i) => {
    const place = best.placed[i];
    if (place === undefined) {
      overflow.push(piece.id);
      return;
    }
    shapeArea += place.stamp.area;
    coverArea += place.stamp.cover.count * cell * cell;
    const placement: Placement = { id: piece.id, x: place.col * cell, y: place.row * cell };
    at.set(piece.id, place.stamp.turn === 90 ? { ...placement, turn: 90 } : placement);
  });
  for (const item of locked) at.set(item.id, { id: item.id, x: item.x!, y: item.y! });
  const placements = input.items.flatMap((item) => at.get(item.id) ?? []);
  const lockedBottom = locked.reduce((most, item) => Math.max(most, item.y! + extentOf(outlineOf(item)).y1), -Infinity);
  const bottom = Math.max(best.length, lockedBottom);
  const { fixed, inset, shape } = input.container;
  const origin = shape === undefined ? 0 : boundsOf(shape).y;
  const height = walls.y1 === Infinity ? (Number.isFinite(bottom) ? bottom - origin + (inset ?? 0) : 0) : walls.y1 - origin + (inset ?? 0);
  const width = walls.x1 - walls.x0 + 2 * (inset ?? 0);
  const measures = { "pack.overflow": overflow.length, "raster.cell": cell, "raster.trials": done, "raster.coverShare": coverArea > 0 ? shapeArea / coverArea : 1 };
  return { placements, overflow, size: { w: width, h: fixed === "size" ? input.container.h ?? height : height }, moved: [], trace: [{ id: RASTER_NOFIT_STAGE, measures }] };
}
