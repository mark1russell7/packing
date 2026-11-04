// The vertical compaction after a change (roadmap item k30, first slice). `docs/PACKER.md`, "The vertical compaction",
// tells the rule. The steps come from the classic compactor of react-grid-layout, for boxes with real sizes.

import { boundsOf } from "@mark1russell7/layout-contract";
import { RECORD_EPS, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds, extentOf } from "./frame.ts";

/** A rectangle with the margins and half of the gap. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** This function gives the box of a placed item, and the offset from the top of the box to the place of the item. */
function boxOf(item: Item, place: Placement, half: number): { readonly box: Box; readonly dy: number } {
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

/** This function gives the top that a box reaches below the boxes above it. */
function topOf(box: Box, above: readonly Box[], ceiling: number): number {
  let top = ceiling;
  for (const c of above) {
    if (c.x >= box.x + box.w - RECORD_EPS || box.x >= c.x + c.w - RECORD_EPS) continue;
    const bottom = c.y + c.h;
    if (bottom <= box.y + RECORD_EPS && bottom > top) top = bottom;
  }
  return Math.min(top, box.y);
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
  if (input.container.shape !== undefined) throw new RangeError("compactUp does not take a container with a shape.");
  if ((input.pairGaps?.length ?? 0) > 0) throw new RangeError("compactUp does not take pair gaps.");
  if (input.items.some((item) => item.parent !== undefined)) throw new RangeError("compactUp does not take an item with a parent.");

  const items = new Map(input.items.map((item) => [item.id, item] as const));
  const places = new Map(output.placements.map((p) => [p.id, p] as const));
  const half = (input.gap ?? 0) / 2;
  const origin = containerBounds(input);
  const ceiling = origin.y + (input.container.inset ?? 0) - half;
  const above = wallsOf(input, output, places, half);

  const free = output.placements
    .map((place, order) => ({ place, order, ...boxOf(items.get(place.id)!, place, half) }))
    .filter(({ place }) => items.get(place.id)!.locked !== true)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.order - b.order);

  const after = new Map<string, Placement>();
  for (const { place, box, dy } of free) {
    const top = topOf(box, above, ceiling);
    above.push({ ...box, y: top });
    after.set(place.id, { ...place, y: top + dy });
  }
  const placements = output.placements.map((p) => after.get(p.id) ?? p);
  const { bottom } = extentOf(input, placements, output.moved, origin, input.container.inset ?? 0, turnItem);
  return { ...output, placements, size: { w: output.size.w, h: Number.isFinite(origin.h) ? output.size.h : bottom } };
}
