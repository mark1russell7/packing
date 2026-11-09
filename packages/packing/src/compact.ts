// The compaction of a layout along one axis: up (roadmap item k30, first slice) and left (roadmap item k213).
// `docs/PACKER.md`, "The vertical compaction", tells the rule. The steps come from the classic compactor of
// react-grid-layout, for boxes with real sizes. Along `x`, the same sweep is the one-dimensional compaction of a constraint graph.

import { boundsOf } from "@mark1russell7/layout-contract";
import { RECORD_EPS, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds, extentOf } from "./frame.ts";
import { refusal } from "./strategy.ts";

/**
 * The directions of a compaction of roadmap item k213: `up` (`compactUp`), `left` (`compactLeft`), and `left-up`
 * (`compactLeft`, then `compactUp`). They are the options of the stage `compact` of `packSpace`.
 */
export const COMPACT_DIRECTIONS = ["up", "left", "left-up"] as const;

/** One direction of `COMPACT_DIRECTIONS`. */
export type CompactDirection = (typeof COMPACT_DIRECTIONS)[number];

/** A rectangle with the margins and half of the gap. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** This function gives the box of a placed item, and the offset from the top of the box to the place of the item. */
export function boxOf(item: Item, place: Placement, half: number): { readonly box: Box; readonly dy: number } {
  const turned = place.turn === 90 ? turnItem(item) : item;
  const m = marginOf(turned);
  const dy = m.top + half;
  return { box: { x: place.x - m.left - half, y: place.y - dy, w: turned.w + m.left + m.right + 2 * half, h: turned.h + m.top + m.bottom + 2 * half }, dy };
}

/** This function gives the walls: the locked items and the obstacles at their final places. */
function wallsOf(input: PackInput, output: PackOutput, places: ReadonlyMap<string, Placement>, half: number): Box[] {
  const walls: Box[] = [];
  for (const item of input.items) {
    const place = places.get(item.id);
    if (item.locked === true && place !== undefined) walls.push(boxOf(item, place, half).box);
  }
  const moved = new Map(output.moved.map((m) => [m.id, m] as const));
  for (const o of input.obstacles ?? []) {
    const b = boundsOf(o.region);
    const at = moved.get(o.id) ?? b;
    walls.push({ x: at.x - half, y: at.y - half, w: b.w + 2 * half, h: b.h + 2 * half });
  }
  return walls;
}

/** The axis of a compaction: `y` moves the boxes up, `x` moves them left. */
type Axis = "x" | "y";

/** The fields of a box along an axis and across it: the place and the side along it, the place and the side across it. */
const FIELDS = { y: ["y", "h", "x", "w"], x: ["x", "w", "y", "h"] } as const;

/** This function gives the near edge that a box reaches past the boxes before it on an axis. */
function nearOf(box: Box, before: readonly Box[], wall: number, axis: Axis): number {
  const [p, s, q, t] = FIELDS[axis];
  let near = wall;
  for (const c of before) {
    if (c[q] >= box[q] + box[t] - RECORD_EPS || box[q] >= c[q] + c[t] - RECORD_EPS) continue;
    const far = c[p] + c[s];
    if (far <= box[p] + RECORD_EPS && far > near) near = far;
  }
  return Math.min(near, box[p]);
}

/** This function moves each free box along an axis, in the order of the near edge, the far edge across and the input. */
function compactAlong(input: PackInput, output: PackOutput, axis: Axis, name: string): PackOutput {
  if (input.container.shape !== undefined) throw new RangeError(`${name} does not take a container with a shape.`);
  if ((input.pairGaps?.length ?? 0) > 0) throw new RangeError(`${name} does not take pair gaps.`);
  if (input.items.some((item) => item.parent !== undefined)) throw new RangeError(`${name} does not take an item with a parent.`);

  const [p, , q] = FIELDS[axis];
  const items = new Map(input.items.map((item) => [item.id, item] as const));
  const places = new Map(output.placements.map((place) => [place.id, place] as const));
  const half = (input.gap ?? 0) / 2;
  const origin = containerBounds(input);
  const wall = origin[p] + (input.container.inset ?? 0) - half;
  const before = wallsOf(input, output, places, half);

  const free = output.placements
    .map((place, order) => {
      const item = items.get(place.id)!;
      const { box, dy } = boxOf(item, place, half);
      const offset = axis === "y" ? dy : marginOf(place.turn === 90 ? turnItem(item) : item).left + half;
      return { place, order, box, offset, locked: item.locked === true };
    })
    .filter(({ locked }) => !locked)
    .sort((a, b) => a.box[p] - b.box[p] || a.box[q] - b.box[q] || a.order - b.order);

  const after = new Map<string, Placement>();
  for (const { place, box, offset } of free) {
    const near = nearOf(box, before, wall, axis);
    before.push({ ...box, [p]: near });
    after.set(place.id, { ...place, [p]: near + offset });
  }
  const placements = output.placements.map((place) => after.get(place.id) ?? place);
  const { right, bottom } = extentOf(input, placements, output.moved, origin, input.container.inset ?? 0, turnItem);
  const size = axis === "y" ? { w: output.size.w, h: Number.isFinite(origin.h) ? output.size.h : bottom } : { w: Number.isFinite(origin.w) ? output.size.w : right, h: output.size.h };
  return { ...output, placements, size };
}

/**
 * This function moves each free box of a layout up until it touches a box, a wall or the top of the container. The
 * order is the top of each box, then its left edge, then the order of the input.
 *
 * - A locked item and an obstacle stay at their places, and the boxes stop at them.
 * - A box keeps its `x`, and it does not go down. A box does not jump past another box.
 * - A side of a free size goes to the new far edge. The function does not change an argument.
 *
 * @throws RangeError for a container with a shape, for pair gaps, and for an item with a parent.
 */
export function compactUp(input: PackInput, output: PackOutput): PackOutput {
  return compactAlong(input, output, "y", "compactUp");
}

/**
 * This function moves each free box of a layout left until it touches a box, a wall or the left side of the container.
 * The function is a part of roadmap item k213. The order is the left edge of each box, then its top, then the order of the input.
 *
 * - The pass is the longest path of the constraint graph along `x`. A box stops at the right edge of each box before it
 *   that overlaps it across `y`. Thus the cost is `O(n^2)` for `n` boxes.
 * - A locked item and an obstacle stay at their places, and the boxes stop at them.
 * - A box keeps its `y`, and it does not go right. A box does not jump past another box.
 * - A side of a free size goes to the new far edge. The function does not change an argument.
 *
 * @throws RangeError for a container with a shape, for pair gaps, and for an item with a parent.
 */
export function compactLeft(input: PackInput, output: PackOutput): PackOutput {
  return compactAlong(input, output, "x", "compactLeft");
}

/**
 * This function compacts a layout in one direction of `COMPACT_DIRECTIONS` (roadmap item k213). The stage `compact` of
 * `packSpace` and the strategy `compact` of the registry use it. The output gets the trace stage `compact` with the
 * measure `move.compact`: the count of the boxes that moved.
 *
 * @throws UnsupportedCell for an input that `compactUp` or `compactLeft` refuses, with the reason of the refusal.
 * @throws RangeError for a direction outside `COMPACT_DIRECTIONS`.
 */
/** The id of the trace stage of `compactWith`. Its measure `move.compact` is the count of the boxes that moved. */
export const COMPACT_STAGE = "compact";

export function compactWith(input: PackInput, output: PackOutput, direction: CompactDirection): PackOutput {
  if (!COMPACT_DIRECTIONS.includes(direction)) throw new RangeError(`The direction of a compaction is up, left or left-up, not ${String(direction)}.`);
  let compacted: PackOutput;
  try {
    compacted = direction === "up" ? compactUp(input, output) : direction === "left" ? compactLeft(input, output) : compactUp(input, compactLeft(input, output));
  } catch (error) {
    if (error instanceof RangeError) throw refusal(error.message);
    throw error;
  }
  const before = new Map(output.placements.map((p) => [p.id, p]));
  const moved = compacted.placements.filter((p) => {
    const old = before.get(p.id);
    return old === undefined || old.x !== p.x || old.y !== p.y;
  }).length;
  const stage = { id: COMPACT_STAGE, measures: { "move.compact": moved } };
  return { ...compacted, trace: [...(compacted.trace ?? []), stage] };
}
