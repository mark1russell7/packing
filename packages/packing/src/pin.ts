// The pin of unchanged boxes (roadmap item k29, first slice). `docs/PACKER.md`, "The pin of unchanged boxes", tells the
// rule. The function changes an input and does not pack: a strategy packs the new input and goes around the locked boxes.

import { boundsOf } from "@mark1russell7/layout-contract";
import type { Item, PackInput, PackOutput, Placement } from "./contract.ts";

/** The result of `pinUnchanged`. */
export interface PinnedInput {
  /** The changed input, with each pinned item locked at its old place. */
  readonly input: PackInput;
  /** The ids of the pinned items, in the order of the input. */
  readonly pinned: readonly string[];
}

/** A rectangle that a pinned box does not overlap. */
interface Blocked {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** This function gives the rectangles of the obstacles and of the locked items of an input. */
function blockedOf(input: PackInput): readonly Blocked[] {
  const blocked: Blocked[] = (input.obstacles ?? []).map((o) => boundsOf(o.region));
  for (const item of input.items) {
    if (item.locked === true && item.x !== undefined && item.y !== undefined) blocked.push({ x: item.x, y: item.y, w: item.w, h: item.h });
  }
  return blocked;
}

/** This function tells if a box at a place stays inside the fixed sides of a container. */
function insideOf(input: PackInput, item: Item, place: Placement): boolean {
  const { fixed, w, h } = input.container;
  if ((fixed === "size" || fixed === "width") && w !== undefined && place.x + item.w > w) return false;
  return !((fixed === "size" || fixed === "height") && h !== undefined && place.y + item.h > h);
}

/** This function tells if a box at a place overlaps one of the blocked rectangles. */
function overlapsAny(blocked: readonly Blocked[], item: Item, place: Placement): boolean {
  return blocked.some((b) => place.x < b.x + b.w && b.x < place.x + item.w && place.y < b.y + b.h && b.y < place.y + item.h);
}

/**
 * This function gives a test for a pin. The test gives the old place of an item that can stay there, or `undefined` for
 * a box that stays free.
 */
function stayingPlace(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput): (item: Item) => Placement | undefined {
  const before = new Map(baseInput.items.map((item) => [item.id, item] as const));
  const places = new Map<string, Placement>();
  for (const p of baseOutput.placements) if (!places.has(p.id)) places.set(p.id, p);
  const blocked = blockedOf(changeInput);
  return (item) => {
    const old = before.get(item.id);
    const place = places.get(item.id);
    if (item.parent !== undefined || old === undefined || place === undefined) return undefined;
    if (old.w !== item.w || old.h !== item.h || (place.turn ?? 0) !== 0) return undefined;
    return !insideOf(changeInput, item, place) || overlapsAny(blocked, item, place) ? undefined : place;
  };
}

/**
 * This function gives a copy of a changed input with each unchanged box locked at its place in the base output. The
 * items match by id.
 *
 * - An item is unchanged when the base input has the same id with the same width and height, and the base output places it.
 * - A turned box stays free, because a locked box does not turn.
 * - An item with a parent stays free, because the place of a child follows its parent.
 * - A box stays free when its old place is outside the fixed sides of the container, or overlaps an obstacle or a locked item.
 * - An item that is locked already does not change.
 *
 * The hole of a removed box stays free for the strategy. The strategy decides if it fills that hole.
 */
export function pinUnchanged(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput): PinnedInput {
  const placeOf = stayingPlace(baseInput, baseOutput, changeInput);
  const pinned: string[] = [];
  const items = changeInput.items.map((item): Item => {
    const place = item.locked === true ? undefined : placeOf(item);
    if (place === undefined) return item;
    pinned.push(item.id);
    return { ...item, x: place.x, y: place.y, locked: true };
  });
  return { input: { ...changeInput, items }, pinned };
}

/**
 * This function gives a copy of a changed input with each box before the first change locked at its place in the base
 * output. A strategy then packs the suffix, from the first change to the end (roadmap item k30).
 *
 * - The first change is the first index where the two inputs have different ids, or where `pinUnchanged` leaves the box free.
 * - Thus no box before that index moves, and each box after it is free, also an unchanged box.
 * - A locked item before that index does not change.
 *
 * This function is the baseline of `pack.stability.moved` for a change in an ordered list.
 */
export function keepPrefix(baseInput: PackInput, baseOutput: PackOutput, changeInput: PackInput): PinnedInput {
  const placeOf = stayingPlace(baseInput, baseOutput, changeInput);
  const pinned: string[] = [];
  const items = changeInput.items.slice();
  for (const [at, item] of changeInput.items.entries()) {
    if (baseInput.items[at]?.id !== item.id) break;
    if (item.locked === true) continue;
    const place = placeOf(item);
    if (place === undefined) break;
    pinned.push(item.id);
    items[at] = { ...item, x: place.x, y: place.y, locked: true };
  }
  return { input: { ...changeInput, items }, pinned };
}
