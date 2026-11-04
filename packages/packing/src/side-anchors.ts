// The side anchors of roadmap item k110. An anchor fixes an item to one side of the container, at a fraction of that side or
// at an offset from its start. On a free height, the place of an anchor on the bottom depends on the final height, and that
// height depends on the place of the anchor. Thus `packSideAnchors` searches on the free length and packs at a fixed size:
//
// - Each try locks each anchored item at the place that this size gives, then packs the other items with a member strategy.
// - A try is good when each item has a place and the 4 hard rules have no break.
// - The search grows the length to the first good try, then halves the range. It keeps the shortest good try.
// - No default uses this function. `checkSideAnchors` is the rule `anchor-kept`: the rule reads the final size of the output.
//
// This first slice has its own types and check. The field of an item and the entry of `PACK_HARD_RULES` belong to the contract.

import { checkHard } from "./check.ts";
import { marginOf, RECORD_EPS, type Item, type PackInput, type PackOutput } from "./contract.ts";
import { packWith } from "./registry.ts";

/** The side of the container that an anchor touches. */
export type AnchorSide = "top" | "bottom" | "left" | "right";

/** One side anchor. Give `at` or `offset`, not both. */
export interface SideAnchor {
  /** The id of an item that is not locked. */
  readonly id: string;
  /** The side that the item touches. */
  readonly side: AnchorSide;
  /** The place along the side, as a share of the free length: 0 is the start, 1 is the end. */
  readonly at?: number;
  /** The place along the side, as a distance from its start. It is 0 or more. */
  readonly offset?: number;
}

/** The options of `packSideAnchors`. */
export interface SideAnchorOptions {
  /** The member that packs the other items. The default is `maxrects` with the rule `bl`. */
  readonly strategy?: string;
  /** The options of the member. */
  readonly strategyOptions?: unknown;
  /** The seed of the member. The default is 0. */
  readonly seed?: number;
  /** The search stops when the range is at most this share of its top. It is above 0. The default is 0.005. */
  readonly precision?: number;
}

/** The result of `packSideAnchors`. */
export interface SideAnchorResult {
  /** The shortest good layout, or the layout with the fewest problems if no try was good. */
  readonly output: PackOutput;
  /** The count of the packs of the member. */
  readonly packs: number;
  /** The value `true` tells that each item has a place and the 4 hard rules have no break. */
  readonly good: boolean;
}

/** The largest count of tries that grow the free length. Each try adds twice the growth of the try before it. */
const MAX_GROWS = 16;

/** The first growth of the free length, as a share of the first length. */
const FIRST_GROWTH = 0.05;

/** A good try and its problems. */
interface Attempt {
  readonly output: PackOutput;
  readonly length: number;
  readonly problems: number;
}

/** This function gives the place of an anchored item for a container size. */
function anchorPlace(item: Item, anchor: SideAnchor, w: number, h: number, inset: number): { x: number; y: number } {
  const across = anchor.side === "top" || anchor.side === "bottom";
  const free = across ? w - 2 * inset - item.w : h - 2 * inset - item.h;
  const along = inset + (anchor.at !== undefined ? anchor.at * free : anchor.offset!);
  if (anchor.side === "top") return { x: along, y: inset };
  if (anchor.side === "bottom") return { x: along, y: h - inset - item.h };
  if (anchor.side === "left") return { x: inset, y: along };
  return { x: w - inset - item.w, y: along };
}

/** This function throws a `RangeError` for an input or an anchor that this slice does not read. */
function checkAnchors(input: PackInput, anchors: readonly SideAnchor[], precision: number): void {
  if (!(precision > 0)) throw new RangeError(`precision is ${precision}, but it must be above 0.`);
  const { container } = input;
  if (container.fixed === "none") throw new RangeError("A side anchor needs one fixed side of the container.");
  if (container.shape !== undefined) throw new RangeError("A side anchor needs a rectangle container.");
  if (container.fixed !== "height" && container.w === undefined) throw new RangeError("The container has no width.");
  if (container.fixed !== "width" && container.h === undefined) throw new RangeError("The container has no height.");
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (seen.has(anchor.id)) throw new RangeError(`The item "${anchor.id}" has two anchors.`);
    seen.add(anchor.id);
    const item = input.items.find((i) => i.id === anchor.id);
    if (item === undefined) throw new RangeError(`No item has the id "${anchor.id}".`);
    if (item.locked === true) throw new RangeError(`The item "${item.id}" is locked, so it cannot have an anchor.`);
    if (item.shape !== undefined) throw new RangeError(`The item "${item.id}" has a shape, so it cannot have an anchor.`);
    const m = marginOf(item);
    if (m.left !== 0 || m.right !== 0 || m.top !== 0 || m.bottom !== 0) throw new RangeError(`The item "${item.id}" has a margin, so it cannot have an anchor.`);
    if ((anchor.at === undefined) === (anchor.offset === undefined)) throw new RangeError(`The anchor of "${item.id}" needs at or offset, and not both.`);
    if (anchor.at !== undefined && !(anchor.at >= 0 && anchor.at <= 1)) throw new RangeError(`The anchor of "${item.id}" has at ${anchor.at}, but it must be from 0 to 1.`);
    if (anchor.offset !== undefined && !(anchor.offset >= 0 && Number.isFinite(anchor.offset))) throw new RangeError(`The anchor of "${item.id}" has offset ${anchor.offset}, but it must be 0 or more.`);
  }
}

/**
 * This function counts the breaks of the rule `anchor-kept` for an output.
 *
 * - An anchored item with no placement, or with a turn, counts as one break.
 * - An anchored item counts as one break if it is further than `RECORD_EPS` from the place that `output.size` gives.
 */
export function checkSideAnchors(input: PackInput, output: PackOutput, anchors: readonly SideAnchor[]): number {
  const inset = input.container.inset ?? 0;
  const items = new Map(input.items.map((item) => [item.id, item]));
  const placements = new Map(output.placements.map((p) => [p.id, p]));
  let breaks = 0;
  for (const anchor of anchors) {
    const item = items.get(anchor.id);
    const p = placements.get(anchor.id);
    if (item === undefined || p === undefined || p.turn === 90) {
      breaks += 1;
      continue;
    }
    const want = anchorPlace(item, anchor, output.size.w, output.size.h, inset);
    if (Math.abs(p.x - want.x) > RECORD_EPS || Math.abs(p.y - want.y) > RECORD_EPS) breaks += 1;
  }
  return breaks;
}

/**
 * This function packs an input with each anchored item at its side.
 *
 * - A container with a fixed size needs one pack. The other containers need a search on the free length.
 * - An anchor keeps its rule at each size. Thus a larger layout keeps it too.
 * - The function refuses a shaped container and a container with no fixed side.
 * - The function refuses an anchor on a locked item, a shaped item or an item with a margin.
 *
 * @throws RangeError if an anchor or an option has a bad value.
 */
export function packSideAnchors(input: PackInput, anchors: readonly SideAnchor[], options: SideAnchorOptions = {}): SideAnchorResult {
  const precision = options.precision ?? 0.005;
  checkAnchors(input, anchors, precision);
  const strategy = options.strategy ?? "maxrects";
  const memberOptions = options.strategyOptions ?? (options.strategy === undefined ? { rule: "bl" } : {});
  const seed = options.seed ?? 0;
  const { container } = input;
  const inset = container.inset ?? 0;
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const freeSide = container.fixed === "width" ? "h" : container.fixed === "height" ? "w" : undefined;
  let packs = 0;

  const attempt = (length: number): Attempt => {
    const w = freeSide === "w" ? length : container.w!;
    const h = freeSide === "h" ? length : container.h!;
    const fixed: PackInput = {
      ...input,
      container: { ...container, w, h, fixed: "size" },
      items: input.items.map((item) => {
        const anchor = byId.get(item.id);
        return anchor === undefined ? item : { ...item, ...anchorPlace(item, anchor, w, h, inset), locked: true };
      }),
    };
    packs += 1;
    const output = packWith(strategy, fixed, memberOptions, seed);
    const hard = checkHard(fixed, output);
    const breaks = Object.values(hard).reduce((sum, value) => sum + value, 0);
    return { output, length, problems: output.overflow.length + breaks };
  };
  const finish = (best: Attempt): SideAnchorResult => ({ output: best.output, packs, good: best.problems === 0 });

  if (freeSide === undefined) return finish(attempt(0));

  // The first length: the free pack of the other items, or the longest anchor.
  const rest: PackInput = { ...input, items: input.items.filter((item) => !byId.has(item.id)) };
  packs += 1;
  const size = packWith(strategy, rest, memberOptions, seed).size;
  const reach = Math.max(0, ...input.items.filter((item) => byId.has(item.id)).map((item) => (freeSide === "h" ? item.h : item.w) + 2 * inset));
  const first = Math.max(freeSide === "h" ? size.h : size.w, reach, 1);

  let best = attempt(first);
  let bad = 0;
  let growth = first * FIRST_GROWTH;
  let length = first;
  for (let grow = 0; grow < MAX_GROWS && best.problems > 0; grow++) {
    bad = length;
    length += growth;
    growth *= 2;
    const next = attempt(length);
    if (next.problems < best.problems) best = next;
  }
  if (best.problems > 0) return finish(best);

  // A pack is not monotone in the length, so the search keeps the shortest good try and does not prove a least length.
  let good = best.length;
  while (good - bad > precision * good) {
    const middle = (good + bad) / 2;
    const next = attempt(middle);
    if (next.problems === 0) {
      best = next;
      good = middle;
    } else bad = middle;
  }
  return finish(best);
}
