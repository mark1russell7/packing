// Repack and match (roadmap item k31). `docs/PACKER.md`, "Repack and match", tells the rule. The function takes a fresh
// layout and gives its boxes of one size the places that are nearest to their old places.

import type { Item, PackInput, PackOutput, Placement } from "./contract.ts";

/** This function gives a key that is equal for two boxes that can change places in a layout. */
const classOf = (item: Item, place: Placement): string =>
  JSON.stringify([item.w, item.h, item.margin, item.shape, item.shapeKind, item.ports, item.turnable, item.group, item.rank, place.turn ?? 0]);

/**
 * This function gives each box of a class a place of that class. The nearest pair of an old place and a new place goes
 * first. A box with no old place takes a place that stays free.
 */
function assign(boxes: readonly Placement[], before: ReadonlyMap<string, Placement>, chosen: Map<Placement, Placement>): void {
  const pairs: { box: number; place: number; distance: number }[] = [];
  boxes.forEach((box, b) => {
    const old = before.get(box.id);
    if (old === undefined) return;
    boxes.forEach((place, p) => pairs.push({ box: b, place: p, distance: Math.hypot(place.x - old.x, place.y - old.y) }));
  });
  pairs.sort((a, z) => a.distance - z.distance || a.box - z.box || a.place - z.place);
  const taken = new Set<number>();
  const used = new Set<number>();
  for (const { box, place } of pairs) {
    if (taken.has(box) || used.has(place)) continue;
    taken.add(box);
    used.add(place);
    chosen.set(boxes[box]!, { ...boxes[box]!, x: boxes[place]!.x, y: boxes[place]!.y });
  }
  const left = boxes.filter((_, p) => !used.has(p));
  boxes.forEach((box, b) => {
    if (taken.has(b)) return;
    const place = left.shift()!;
    chosen.set(box, { ...box, x: place.x, y: place.y });
  });
}

/**
 * This function gives a copy of a fresh output with the same set of places. Boxes of one size change places, so that
 * each box stays near its place in the base output. The items match by id.
 *
 * - Two boxes change places only when they have the same size, margin, shape, ports, group, rank and turn.
 * - A locked item and an item with a parent keep their places.
 * - Thus the height, the width and the hard rules of the fresh output do not change.
 * - The match is greedy, so it is not always the least total distance.
 *
 * The time is `k^2 log k` for a class of `k` boxes. The input gives the sizes of the boxes.
 *
 * @throws RangeError for pair gaps, because a pair gap names two ids.
 */
export function matchPlaces(baseOutput: PackOutput, changeInput: PackInput, freshOutput: PackOutput): PackOutput {
  if ((changeInput.pairGaps?.length ?? 0) > 0) throw new RangeError("matchPlaces does not take pair gaps.");
  const items = new Map(changeInput.items.map((item) => [item.id, item] as const));
  const before = new Map<string, Placement>();
  for (const p of baseOutput.placements) if (!before.has(p.id)) before.set(p.id, p);
  const classes = new Map<string, Placement[]>();
  for (const place of freshOutput.placements) {
    const item = items.get(place.id);
    if (item === undefined || item.locked === true || item.parent !== undefined) continue;
    const key = classOf(item, place);
    const members = classes.get(key);
    if (members === undefined) classes.set(key, [place]);
    else members.push(place);
  }
  const chosen = new Map<Placement, Placement>();
  for (const boxes of classes.values()) if (boxes.length > 1) assign(boxes, before, chosen);
  return { ...freshOutput, placements: freshOutput.placements.map((place) => chosen.get(place) ?? place) };
}
