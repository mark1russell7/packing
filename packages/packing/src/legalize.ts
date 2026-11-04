// The legalization of a layout of rows after a change (roadmap item k82, first slice). `docs/PACKER.md`, "The legalization
// of rows", tells the rule. The steps come from the slides of Abacus (Spindler 2008), for boxes with many heights.

import { RECORD_EPS, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds } from "./frame.ts";

/** This type gives the size of a box of the base layout. */
type Sized = (id: string) => Item;

/** The options of `legalizeRows`. */
export interface LegalizeOptions {
  /** With `false`, a placed box does not move in its row: the arm Tetris of Hill 2002. The default is `true`. */
  readonly placeRow?: boolean;
}

/** One cluster of `placeRow`: boxes that touch, from the box `first`. */
interface Cluster {
  readonly first: number;
  /** The count of the boxes. */
  e: number;
  /** The sum of the targets, each less its offset in the cluster. */
  q: number;
  /** The width. */
  w: number;
  /** The left edge. */
  x: number;
}

/** One box of a cell, at its offset from the left and the top of the cell. */
interface Member {
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
}

/** A rigid group of boxes: a box of a row, with the boxes that the gap fill of `rows` puts under it. */
interface Cell {
  readonly members: readonly Member[];
  /** The target of the left edge, from the left of the row. */
  readonly x: number;
  /** The target of the top. */
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The index of the first box of the cell in the input. */
  readonly at: number;
}

/** One row of a layout. */
interface Row {
  /** The top of the row in the base layout. A new row has `Infinity`. */
  readonly top: number;
  readonly cells: Cell[];
  readonly targets: number[];
  readonly widths: number[];
  /** The left edge of each cell, from the last trial that the row kept. */
  x: number[];
}

/**
 * This function gives the left edges of the boxes of one row, with the least sum of squared moves. The boxes keep their
 * order, and they stay from 0 to `limit`. Each box adds at most one cluster, so the count of the merges is linear.
 *
 * @throws RangeError for boxes that do not fit in `limit`.
 */
export function placeRow(targets: readonly number[], widths: readonly number[], limit: number): number[] {
  if (widths.reduce((sum, w) => sum + w, 0) > limit + RECORD_EPS) throw new RangeError(`placeRow: the boxes do not fit in ${limit}.`);
  const clusters: Cluster[] = [];
  const collapse = (): void => {
    for (;;) {
      const c = clusters[clusters.length - 1]!;
      c.x = Math.max(0, Math.min(c.q / c.e, limit - c.w));
      const before = clusters[clusters.length - 2];
      if (before === undefined || before.x + before.w <= c.x) return;
      before.e += c.e;
      before.q += c.q - c.e * before.w;
      before.w += c.w;
      clusters.pop();
    }
  };
  targets.forEach((target, i) => {
    const last = clusters[clusters.length - 1];
    if (last === undefined || last.x + last.w <= target) {
      clusters.push({ first: i, e: 1, q: target, w: widths[i]!, x: target });
    } else {
      last.e += 1;
      last.q += target - last.w;
      last.w += widths[i]!;
    }
    collapse();
  });
  const out: number[] = [];
  clusters.forEach((c, at) => {
    const end = clusters[at + 1]?.first ?? targets.length;
    let x = c.x;
    for (let i = c.first; i < end; i++) {
      out.push(x);
      x += widths[i]!;
    }
  });
  return out;
}

/** This function gives the left edge of a new box of a row in the arm Tetris, or `undefined` when the box does not fit. */
function tetrisEdge(row: Row, target: number, width: number, limit: number): number | undefined {
  const last = row.x.length - 1;
  const end = last < 0 ? 0 : row.x[last]! + row.widths[last]!;
  const x = Math.max(end, Math.min(target, limit - width));
  return x + width <= limit + RECORD_EPS ? x : undefined;
}

/** This function gives the left edges of a row with one more box, or `undefined` when the box does not fit. */
function trial(row: Row, target: number, width: number, limit: number, move: boolean): number[] | undefined {
  if (!move) {
    const x = tetrisEdge(row, target, width, limit);
    return x === undefined ? undefined : [...row.x, x];
  }
  if (row.widths.reduce((sum, w) => sum + w, width) > limit + RECORD_EPS) return undefined;
  return placeRow([...row.targets, target], [...row.widths, width], limit);
}

/** This function gives the groups of a list in order of `start`: a group ends at the first start at or after its largest end. */
function sweep(places: readonly Placement[], start: (p: Placement) => number, end: (p: Placement) => number): Placement[][] {
  const groups: Placement[][] = [];
  let reach = -Infinity;
  for (const p of [...places].sort((a, b) => start(a) - start(b))) {
    if (start(p) >= reach - RECORD_EPS) {
      groups.push([]);
      reach = -Infinity;
    }
    groups[groups.length - 1]!.push(p);
    reach = Math.max(reach, end(p));
  }
  return groups;
}

/**
 * This function gives the cells of one row of the base layout. A cell keeps its offsets only while no box of it changes
 * size. Otherwise each box of the cell becomes one cell, and it goes to the top of the row that it takes.
 */
function cellsOf(group: readonly Placement[], top: number, sized: Sized, change: ReadonlyMap<string, Item>, index: ReadonlyMap<string, number>, x0: number): Cell[] {
  const cells: Cell[] = [];
  const add = (boxes: readonly Placement[], y: number): void => {
    const x = Math.min(...boxes.map((p) => p.x));
    const members = boxes.map((p) => ({ id: p.id, dx: p.x - x, dy: p.y - y }));
    cells.push({
      members,
      x: x - x0,
      y,
      w: Math.max(...members.map((m) => m.dx + change.get(m.id)!.w)),
      h: Math.max(...members.map((m) => m.dy + change.get(m.id)!.h)),
      at: Math.min(...members.map((m) => index.get(m.id)!)),
    });
  };
  for (const column of sweep(group, (p) => p.x, (p) => p.x + sized(p.id).w)) {
    const boxes = column.filter((p) => change.has(p.id));
    if (boxes.length === 0) continue;
    const same = boxes.every((p) => change.get(p.id)!.w === sized(p.id).w && change.get(p.id)!.h === sized(p.id).h);
    if (same || boxes.length === 1) add(boxes, top);
    else boxes.forEach((p) => add([p], p.y));
  }
  return cells;
}

/** This function gives the new boxes as cells. A new box follows the box before it in the input. */
function newCells(change: PackInput, places: ReadonlyMap<string, Placement>, x0: number, y0: number): Cell[] {
  const cells: Cell[] = [];
  let before = { x: x0, y: y0, w: 0 };
  change.items.forEach((item, at) => {
    const place = places.get(item.id);
    const target = place ?? { x: before.x + before.w, y: before.y };
    before = { x: target.x, y: target.y, w: item.w };
    if (place === undefined) cells.push({ members: [{ id: item.id, dx: 0, dy: 0 }], x: target.x - x0, y: target.y, w: item.w, h: item.h, at });
  });
  return cells;
}

/** This function refuses each input that is not a plain strip of boxes. */
function refuse(input: PackInput, output: PackOutput): void {
  const { container } = input;
  if (container.fixed !== "width" || container.shape !== undefined) throw new RangeError("legalizeRows takes a strip of a fixed width, with no shape.");
  if ((input.obstacles?.length ?? 0) > 0 || (input.pairGaps?.length ?? 0) > 0 || (input.gap ?? 0) !== 0) throw new RangeError("legalizeRows does not take obstacles, gaps or pair gaps.");
  if (input.items.some((item) => item.parent !== undefined || item.locked === true || item.margin !== undefined)) throw new RangeError("legalizeRows does not take an item with a parent, a lock or a margin.");
  if (output.placements.some((p) => (p.turn ?? 0) !== 0)) throw new RangeError("legalizeRows does not take a turned box.");
  if (output.overflow.length > 0) throw new RangeError("legalizeRows does not take a base layout with overflow.");
}

/**
 * This function gives a layout of rows for a changed input, with the boxes near their places in the base layout.
 *
 * - A row of the base layout is a band of boxes that overlap in `y`. A box with the boxes of its gap fill is one cell.
 * - The cells come in order of target `x`. Each cell tries each row, and it takes the row with the least distance.
 * - With `placeRow`, the cells of the row move to the least sum of squared moves. Without it, they stay.
 * - A cell that fits no row opens a new row at the bottom. An empty row keeps its space.
 * - A taller cell pushes down each row under it. A row keeps its top when the row above it leaves the space.
 *
 * @throws RangeError for a container that is not a plain strip, and for obstacles, gaps, margins, locks, parents or turns.
 * It also refuses a box wider than the strip and a base layout with overflow.
 */
export function legalizeRows(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput, options: LegalizeOptions = {}): PackOutput {
  refuse(changeInput, baseOutput);
  const move = options.placeRow !== false;
  const origin = containerBounds(changeInput);
  const inset = changeInput.container.inset ?? 0;
  const x0 = origin.x + inset;
  const y0 = origin.y + inset;
  const limit = origin.w - 2 * inset;
  if (changeInput.items.some((item) => item.w > limit + RECORD_EPS)) throw new RangeError("legalizeRows does not take a box wider than the strip.");
  const places = new Map(baseOutput.placements.map((p) => [p.id, p] as const));
  const base = new Map(baseInput.items.map((item) => [item.id, item] as const));
  const change = new Map(changeInput.items.map((item) => [item.id, item] as const));
  const index = new Map(changeInput.items.map((item, at) => [item.id, at] as const));
  const sized: Sized = (id) => base.get(id)!;
  const rows: Row[] = [];
  const cells = newCells(changeInput, places, x0, y0);
  for (const group of sweep(baseOutput.placements, (p) => p.y, (p) => p.y + sized(p.id).h)) {
    const top = Math.min(...group.map((p) => p.y));
    rows.push({ top, cells: [], targets: [], widths: [], x: [] });
    cells.push(...cellsOf(group, top, sized, change, index, x0));
  }
  cells.sort((a, b) => a.x - b.x || a.at - b.at);

  for (const cell of cells) {
    let best: { row: Row; x: number[]; cost: number } | undefined;
    for (const row of rows) {
      const x = trial(row, cell.x, cell.w, limit, move);
      if (x === undefined) continue;
      const cost = Math.hypot(x[x.length - 1]! - cell.x, row.top - cell.y);
      if (best === undefined || cost < best.cost) best = { row, x, cost };
    }
    if (best === undefined) {
      const row: Row = { top: Infinity, cells: [], targets: [], widths: [], x: [] };
      rows.push(row);
      best = { row, x: trial(row, cell.x, cell.w, limit, move)!, cost: 0 };
    }
    best.row.cells.push(cell);
    best.row.targets.push(cell.x);
    best.row.widths.push(cell.w);
    best.row.x = best.x;
  }

  const placed = new Map<string, Placement>();
  let bottom = y0;
  for (const row of rows) {
    if (row.cells.length === 0) continue;
    const top = Math.max(row.top === Infinity ? bottom : row.top, bottom);
    row.cells.forEach((cell, i) => {
      for (const m of cell.members) placed.set(m.id, { ...places.get(m.id), id: m.id, x: x0 + row.x[i]! + m.dx, y: top + m.dy });
    });
    bottom = top + Math.max(...row.cells.map((cell) => cell.h));
  }
  return { ...baseOutput, placements: changeInput.items.map((item) => placed.get(item.id)!), size: { w: origin.w, h: bottom - origin.y + inset } };
}
