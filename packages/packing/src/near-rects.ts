// The function `packNearRects` of roadmap item k97 (`docs/PACKER.md`, "Groups as near rectangles", idea S8 of the survey): the first slice.
// It joins pairs of shapes on a raster into groups with small boxes, then packs the boxes with the member of `bbox`. Nothing default uses it.
// The source of the idea is Yang 2023, which learns the groups. This slice has no model: a greedy search on the cells joins the groups.

import { boundsOf, regionArea } from "@mark1russell7/layout-contract";
import { marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement, type Region } from "./contract.ts";
import { cellOf, outlineOf, rasterCover, wallsOf } from "./raster-nofit.ts";
import { packWith } from "./registry.ts";

/** The options of `packNearRects`. */
export interface NearRectsOptions {
  /** The side of a grid cell. The function rounds it down with `rasterCell`. The default is the default of `packRasterNofit`. */
  cell?: number;
  /** The count of the join rounds. Each round halves the groups at most, so a group has at most `2 ** rounds` shapes. The default is 2. */
  rounds?: number;
  /** The seed of the member. The default is 0. */
  seed?: number;
}

/** The id of the trace stage of `packNearRects`. */
export const NEAR_RECTS_STAGE = "near-rects";

/** The default count of the join rounds. */
const DEFAULT_ROUNDS = 2;

/** The filled spans of one row of cells: a start column and an end column after the span. */
type Spans = readonly (readonly [number, number])[];

/** One shape in a group. The cover of the shape starts at the cell `col`, `row` of the box of the group. */
interface Member {
  readonly index: number;
  readonly turned: boolean;
  /** The grid column and row of the first cell of the cover, relative to the origin of the shape. */
  readonly originCol: number;
  readonly originRow: number;
  readonly col: number;
  readonly row: number;
}

/** A group: its cells in a box of `cols` by `rows` cells, and its shapes. */
interface Group {
  /** The key of a group of the same cells. The pair search reads a key pair one time. */
  readonly key: string;
  readonly cols: number;
  readonly rows: number;
  readonly spans: readonly Spans[];
  readonly members: readonly Member[];
}

/** The offset of the second group of a pair, and the box of the join. */
interface Join {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
}

/** The corners of a box. */
interface ShapeExtent {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The origin of a shape in the frame of its group, and the box of the shape in that frame. */
interface ShapeBox extends ShapeExtent {
  readonly x: number;
  readonly y: number;
}

/** This function throws a `RangeError` for a field that this slice does not read. */
function checkInput(input: PackInput, rounds: number): void {
  const { container } = input;
  if (!Number.isInteger(rounds) || rounds < 0) throw new RangeError(`The rounds of near-rects are a whole number of 0 or more, not ${String(rounds)}.`);
  if (container.fixed !== "size" && container.fixed !== "width") throw new RangeError(`near-rects needs a container with fixed "size" or "width", not "${String(container.fixed)}".`);
  if (container.shape !== undefined || (container.inset ?? 0) !== 0) throw new RangeError("near-rects reads no container shape and no inset.");
  if ((input.gap ?? 0) !== 0 || (input.pairGaps?.length ?? 0) > 0) throw new RangeError("near-rects reads no gap and no pairGaps.");
  for (const item of input.items) {
    const m = marginOf(item);
    if (m.left !== 0 || m.right !== 0 || m.top !== 0 || m.bottom !== 0) throw new RangeError(`near-rects reads no margin, and the item ${item.id} has one.`);
    if (item.locked === true) throw new RangeError(`near-rects reads no locked item, and the item ${item.id} is locked.`);
  }
}

/** This function gives the group of one shape. Equal shapes on the same turn get one key. */
function singleGroup(index: number, region: Region, turned: boolean, cell: number): Group {
  const cover = rasterCover(region, cell);
  const member: Member = { index, turned, originCol: cover.col, originRow: cover.row, col: 0, row: 0 };
  return { key: `${turned ? "t" : "s"}${JSON.stringify(region)}`, cols: cover.cols, rows: cover.rows, spans: cover.spans, members: [member] };
}

/**
 * This function gives the join of two groups with the smallest box, or `undefined` if no box has at most `maxCols` columns.
 * For each row offset, it sums the column offsets that the spans of the two groups forbid. Each other offset leaves the covers disjoint.
 * A tie keeps the first offset, so the same groups give the same join.
 */
function bestJoin(a: Group, b: Group, maxCols: number): Join | undefined {
  const low = -b.cols;
  const high = a.cols;
  const forbidden = new Int32Array(high - low + 2);
  let best: Join | undefined;
  let bestArea = Infinity;
  for (let row = -b.rows; row <= a.rows; row++) {
    forbidden.fill(0);
    const from = Math.max(0, row);
    const to = Math.min(a.rows, row + b.rows);
    for (let r = from; r < to; r++) {
      for (const [a0, a1] of a.spans[r]!) {
        for (const [b0, b1] of b.spans[r - row]!) {
          const first = Math.max(a0 - b1 + 1, low);
          const last = Math.min(a1 - b0 - 1, high);
          if (first > last) continue;
          forbidden[first - low]!++;
          forbidden[last - low + 1]!--;
        }
      }
    }
    const rows = Math.max(a.rows, row + b.rows) - Math.min(0, row);
    let covered = 0;
    for (let col = low; col <= high; col++) {
      covered += forbidden[col - low]!;
      if (covered > 0) continue;
      const cols = Math.max(a.cols, col + b.cols) - Math.min(0, col);
      if (cols > maxCols || cols * rows >= bestArea) continue;
      bestArea = cols * rows;
      best = { col, row, cols, rows };
    }
  }
  return best;
}

/** This function gives the sorted union of two lists of disjoint spans. */
function mergeSpans(a: Spans, b: Spans): Spans {
  return [...a, ...b].sort((x, y) => x[0] - y[0]);
}

/** This function gives the group of a join, with the cell 0, 0 at the corner of the box of the join. */
function joined(a: Group, b: Group, join: Join): Group {
  const aCol = Math.max(0, -join.col);
  const aRow = Math.max(0, -join.row);
  const bCol = Math.max(0, join.col);
  const bRow = Math.max(0, join.row);
  const moved = (spans: Spans, by: number): Spans => spans.map(([s, e]) => [s + by, e + by] as const);
  const spans = Array.from({ length: join.rows }, (_, r): Spans => mergeSpans(moved(a.spans[r - aRow] ?? [], aCol), moved(b.spans[r - bRow] ?? [], bCol)));
  const members = [...a.members.map((m) => ({ ...m, col: m.col + aCol, row: m.row + aRow })), ...b.members.map((m) => ({ ...m, col: m.col + bCol, row: m.row + bRow }))];
  return { key: `(${a.key}|${b.key}|${join.col}|${join.row})`, cols: join.cols, rows: join.rows, spans, members };
}

/** This function gives the groups after one round. Pairs join by their saving of box cells, the largest first. Each group joins once. */
function joinRound(groups: readonly Group[], maxCols: number, joins: Map<string, Join | null>): Group[] {
  const pairs: { i: number; j: number; join: Join; saving: number }[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i]!;
      const b = groups[j]!;
      const key = `${a.key}&${b.key}`;
      let join = joins.get(key);
      if (join === undefined) {
        join = bestJoin(a, b, maxCols) ?? null;
        joins.set(key, join);
      }
      if (join === null) continue;
      const saving = a.cols * a.rows + b.cols * b.rows - join.cols * join.rows;
      if (saving > 0) pairs.push({ i, j, join, saving });
    }
  }
  pairs.sort((x, y) => y.saving - x.saving || x.i - y.i || x.j - y.j);
  const used = new Set<number>();
  const next: Group[] = [];
  for (const { i, j, join } of pairs) {
    if (used.has(i) || used.has(j)) continue;
    used.add(i);
    used.add(j);
    next.push(joined(groups[i]!, groups[j]!, join));
  }
  groups.forEach((group, i) => {
    if (!used.has(i)) next.push(group);
  });
  return next;
}

/** This function gives the origin of a shape and its bounding box in the frame of its group. The grid sets the origin. */
function memberShape(item: Item, member: Member, cell: number): ShapeBox {
  const bounds = boundsOf(outlineOf(member.turned ? turnItem(item) : item));
  const x = (member.col - member.originCol) * cell;
  const y = (member.row - member.originRow) * cell;
  return { x, y, x0: x + bounds.x, y0: y + bounds.y, x1: x + bounds.x + bounds.w, y1: y + bounds.y + bounds.h };
}

/** This function gives the box of the true extents of the shapes of a group. */
function extentOfShapes(shapes: readonly ShapeBox[]): ShapeExtent {
  return {
    x0: Math.min(...shapes.map((s) => s.x0)),
    y0: Math.min(...shapes.map((s) => s.y0)),
    x1: Math.max(...shapes.map((s) => s.x1)),
    y1: Math.max(...shapes.map((s) => s.y1)),
  };
}

/** This function gives the group of a turnable item: the turn that fits the width, then the smaller box. A tie keeps the item unturned. */
function firstGroup(item: Item, index: number, cell: number, maxCols: number): Group {
  const plain = singleGroup(index, outlineOf(item), false, cell);
  if (item.turnable !== true) return plain;
  const turned = singleGroup(index, outlineOf(turnItem(item)), true, cell);
  if ((plain.cols > maxCols) !== (turned.cols > maxCols)) return plain.cols > maxCols ? turned : plain;
  return turned.cols * turned.rows < plain.cols * plain.rows ? turned : plain;
}

/**
 * This function packs shapes as groups that are near rectangles (idea S8 of the survey, catalog row `learn-super-patch`), with no learned model.
 *
 * - Each shape gets its cover on one grid. A turnable item takes the turn with the smaller box, once, before the joins.
 * - Each round finds, for each pair of groups, the offset with the smallest box and disjoint covers. Pairs that save box cells join.
 * - The member of `bbox`, `maxrects` with the rule `bl`, packs one box for each group: the true extent of its shapes, not its cells.
 * - Thus the grid costs nothing for a shape that joins no group, and an input with no join gives the layout of `bbox`.
 * - Disjoint covers keep the shapes of a group apart, and a box holds its shapes. Thus the output has no overlap.
 *
 * The cost of a round is about `n ** 2` pair searches. A pair of groups with the same cells gets one search.
 * The input has no locked item, margin, gap, inset or container shape. The function throws a `RangeError` for each of them.
 * The same input and options give the same output, byte for byte.
 */
export function packNearRects(input: PackInput, options: NearRectsOptions = {}): PackOutput {
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  checkInput(input, rounds);
  const walls = wallsOf(input);
  const cell = cellOf(input, walls, options.cell);
  const maxCols = Math.floor((walls.x1 - walls.x0) / cell);
  const joins = new Map<string, Join | null>();
  let groups = input.items.map((item, index) => firstGroup(item, index, cell, maxCols));
  for (let round = 0; round < rounds; round++) {
    const next = joinRound(groups, maxCols, joins);
    if (next.length === groups.length) break;
    groups = next;
  }
  const shapes = groups.map((group) => group.members.map((member) => memberShape(input.items[member.index]!, member, cell)));
  const extents = shapes.map(extentOfShapes);
  const boxes = extents.map((e, i): Item => ({ id: `g${i}`, w: e.x1 - e.x0, h: e.y1 - e.y0 }));
  const packed = packWith("maxrects", { container: input.container, items: boxes }, { rule: "bl" }, options.seed ?? 0);
  const placed = new Map(packed.placements.map((p) => [p.id, p]));
  const at = new Map<number, Placement>();
  const overflow: string[] = [];
  let bottom = 0;
  groups.forEach((group, i) => {
    const box = placed.get(`g${i}`);
    const extent = extents[i]!;
    group.members.forEach((member, m) => {
      const item = input.items[member.index]!;
      if (box === undefined || packed.overflow.includes(`g${i}`)) {
        overflow.push(item.id);
        return;
      }
      const shape = shapes[i]![m]!;
      const x = box.x - extent.x0 + shape.x;
      const y = box.y - extent.y0 + shape.y;
      bottom = Math.max(bottom, box.y + extent.y1 - extent.y0);
      at.set(member.index, member.turned ? { id: item.id, x, y, turn: 90 } : { id: item.id, x, y });
    });
  });
  const placements = input.items.flatMap((_, index) => at.get(index) ?? []);
  const shapeArea = input.items.reduce((sum, item, index) => sum + (at.has(index) ? regionArea(outlineOf(item)) : 0), 0);
  const boxArea = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  const measures = { "pack.overflow": overflow.length, "near.cell": cell, "near.groups": groups.length, "near.boxFill": boxArea > 0 ? shapeArea / boxArea : 1 };
  const size = { w: walls.x1 - walls.x0, h: input.container.fixed === "size" ? input.container.h! : bottom };
  return { placements, overflow: overflow.sort(), size, moved: [], trace: [{ id: NEAR_RECTS_STAGE, measures }] };
}
