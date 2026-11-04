// The orthogonal order after a change (roadmap item k29, second slice). `docs/PACKER.md`, "The orthogonal order", tells
// the rule. The idea comes from Misue 1995. The function changes an input and does not pack, as `pinUnchanged` does.

import { boxOf, type Box } from "./compact.ts";
import { RECORD_EPS, marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds } from "./frame.ts";
import { blockedOf, overlapsAny, type PinnedInput } from "./pin.ts";

/** An item with a place in the base output and in the changed input. The sizes have the margins and the gap. */
interface Staying {
  readonly item: Item;
  /** The box in the base output. */
  readonly old: Box;
  /** The new size of the box. */
  readonly w: number;
  readonly h: number;
  /** The offset from the box to the place of the item. */
  readonly dx: number;
  readonly dy: number;
}

/** This function tells if two spans have a common part. */
const spansMeet = (a: number, aSize: number, b: number, bSize: number): boolean => a < b + bSize - RECORD_EPS && b < a + aSize - RECORD_EPS;

/**
 * This function gives the new left edge of each box. A box stays at its `x` until a box on its left pushes it. A pair
 * with a common part of the old `y` span keeps its order with no overlap. Each other pair keeps a weak order.
 */
function settleX(boxes: readonly Staying[]): Map<Staying, number> {
  const at = new Map<Staying, number>();
  for (const box of [...boxes].sort((a, b) => a.old.x - b.old.x)) {
    let x = box.old.x;
    for (const [other, left] of at) {
      if (other.old.x >= box.old.x) continue;
      x = Math.max(x, left);
      if (spansMeet(other.old.y, other.old.h, box.old.y, box.old.h)) x = Math.max(x, left + other.w);
    }
    at.set(box, x);
  }
  return at;
}

/**
 * This function gives the new top edge of each box. A box rises to the highest place that keeps the order. A pair with a
 * common part of the new `x` span keeps its order with no overlap. Each other pair keeps a weak order.
 */
function settleY(boxes: readonly Staying[], xs: ReadonlyMap<Staying, number>, ceiling: number): Map<Staying, number> {
  const at = new Map<Staying, number>();
  for (const box of [...boxes].sort((a, b) => a.old.y - b.old.y)) {
    let y = ceiling;
    for (const [other, top] of at) {
      if (other.old.y >= box.old.y) continue;
      y = Math.max(y, top);
      if (spansMeet(xs.get(other)!, other.w, xs.get(box)!, box.w)) y = Math.max(y, top + other.h);
    }
    at.set(box, y);
  }
  return at;
}

/**
 * This function gives a changed input with each staying box locked at a place that keeps the orthogonal order of the
 * base output. The items match by id. A strategy then packs the new input and goes around the locked boxes.
 *
 * - For each pair of pinned boxes, a box left of the other or above the other stays so. Two boxes can share an edge value.
 * - A box keeps its `x` until a wider box pushes it. Each box rises as far as the order lets it.
 * - A resized box stays in the order. A new box, a turned box and an item with a parent stay free.
 * - A locked item does not change. The order does not apply to a locked item or to an obstacle.
 * - A box stays free when its new place is outside the fixed sides of the container, or overlaps an obstacle or a locked item.
 *
 * The time is the square of the count of the boxes.
 *
 * @throws RangeError for a container with a shape, and for pair gaps.
 */
export function keepOrthogonal(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput): PinnedInput {
  if (changeInput.container.shape !== undefined) throw new RangeError("keepOrthogonal does not take a container with a shape.");
  if ((changeInput.pairGaps?.length ?? 0) > 0) throw new RangeError("keepOrthogonal does not take pair gaps.");

  const before = new Map(baseInput.items.map((item) => [item.id, item] as const));
  const places = new Map<string, Placement>();
  for (const p of baseOutput.placements) if (!places.has(p.id)) places.set(p.id, p);
  const oldHalf = (baseInput.gap ?? 0) / 2;
  const half = (changeInput.gap ?? 0) / 2;

  const staying: Staying[] = [];
  for (const item of changeInput.items) {
    const old = before.get(item.id);
    const place = places.get(item.id);
    if (item.locked === true || item.parent !== undefined || old === undefined || place === undefined || (place.turn ?? 0) !== 0) continue;
    const m = marginOf(item);
    staying.push({
      item,
      old: boxOf(old, place, oldHalf).box,
      w: item.w + m.left + m.right + 2 * half,
      h: item.h + m.top + m.bottom + 2 * half,
      dx: m.left + half,
      dy: m.top + half,
    });
  }

  const origin = containerBounds(changeInput);
  const inset = changeInput.container.inset ?? 0;
  const xs = settleX(staying);
  const ys = settleY(staying, xs, origin.y + inset - half);
  const right = origin.x + origin.w - inset + half;
  const bottom = origin.y + origin.h - inset + half;
  const blocked = blockedOf(changeInput);
  const chosen = new Map<string, Placement>();
  for (const box of staying) {
    const x = xs.get(box)!;
    const y = ys.get(box)!;
    const place: Placement = { id: box.item.id, x: x + box.dx, y: y + box.dy };
    if (x + box.w > right + RECORD_EPS || y + box.h > bottom + RECORD_EPS || overlapsAny(blocked, box.item, place)) continue;
    chosen.set(box.item.id, place);
  }

  const pinned: string[] = [];
  const items = changeInput.items.map((item): Item => {
    const place = chosen.get(item.id);
    if (place === undefined) return item;
    pinned.push(item.id);
    return { ...item, x: place.x, y: place.y, locked: true };
  });
  return { input: { ...changeInput, items }, pinned };
}
