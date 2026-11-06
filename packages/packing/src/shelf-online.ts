// The online shelf of roadmap item k30 (docs/PACKER.md, "The online shelf"): the shelf algorithms of Baker 1983.
// Each item takes a shelf of its class of height when it comes, and it does not move later. The strategy `shelf-online`
// of `src/standalone-strategies.ts` wraps the function. No default uses it.

import type { PackInput, PackOutput, Placement } from "./contract.ts";
import { byRank } from "./frame.ts";
import { sleatorRefusal } from "./sleator.ts";

/** The rule that chooses the shelf of an item in its class of height. */
export type ShelfOnlineFit = "next" | "first";

/** The options of `shelfOnline`. */
export interface ShelfOnlineOptions {
  /** The ratio of the heights of two classes that follow each other, more than 0 and less than 1. The default is `0.5`. */
  readonly r?: number;
  /** `next` examines only the last shelf of the class. `first` examines each shelf of the class in the order of opening. The default is `first`. */
  readonly fit?: ShelfOnlineFit;
}

/** The result of `shelfOnline`. */
export interface ShelfOnlineResult {
  /** The layout. Each item has a place, with no turn. */
  readonly output: PackOutput;
  /** The height of `output`: the sum of the heights of the shelves. */
  readonly height: number;
  /** The count of the shelves. */
  readonly shelves: number;
}

/** A shelf of the packing. */
interface Shelf {
  /** The bottom edge of the shelf. */
  readonly y: number;
  /** The width of the items on the shelf. */
  used: number;
}

/**
 * This function gives the class `k` of a height `h`, with `r^(k+1) < h <= r^k`. The power `r^k` is the height of a shelf of the class.
 * The logarithm gives a first value, and the two loops correct a float error at a power of `r`.
 */
function classOf(h: number, r: number): number {
  let k = Math.floor(Math.log(h) / Math.log(r));
  while (r ** k < h) k -= 1;
  while (r ** (k + 1) >= h) k += 1;
  return k;
}

/**
 * This function gives the reason that `shelfOnline` refuses an input, or `null` when it accepts the input.
 * It accepts the same inputs as `sleatorStrip`. The container is a strip of a fixed width with no obstacle and no gap.
 * Each item has no lock and no margin, and fits the width with no turn.
 */
export function shelfOnlineRefusal(input: PackInput): string | null {
  return sleatorRefusal(input);
}

/**
 * This function packs a strip with the online shelf of Baker 1983. Each item takes a place in the reading order of `byRank`,
 * and only the items before it change its place. Thus a prefix of the input gives the same places to its items.
 * It throws a `RangeError` for an input that `shelfOnlineRefusal` refuses, or for a value of `r` out of range.
 *
 * 1. An item of height `h` has the class `k` with `r^(k+1) < h <= r^k`. A shelf of class `k` has the height `r^k`.
 * 2. With `fit: "next"`, the item goes on the last shelf of its class if the width fits. With `fit: "first"`, it goes on the first such shelf.
 * 3. If no shelf of its class fits, the item opens a new shelf of its class on top of all the shelves.
 * 4. On a shelf, each item starts at the right edge of the item before it.
 *
 * Two shelves of a class that follow each other hold items of more than the width together.
 * Each item is taller than `r` times its shelf.
 * Thus the height is less than `2 / r` times the area of the items over the width, plus `hmax / (r (1 - r))`.
 * The function has no search with a seed, so the same input gives the same layout on each machine.
 *
 * @example
 * ```ts
 * const { height, shelves, output } = shelfOnline({ container: { fixed: "width", w: 10 }, items }, { r: 0.5, fit: "first" });
 * ```
 */
export function shelfOnline(input: PackInput, options: ShelfOnlineOptions = {}): ShelfOnlineResult {
  const reason = shelfOnlineRefusal(input);
  if (reason !== null) throw new RangeError(`shelfOnline: ${reason}`);
  const r = options.r ?? 0.5;
  if (!(r > 0 && r < 1)) throw new RangeError(`shelfOnline: r must be more than 0 and less than 1, not ${r}`);
  const fit = options.fit ?? "first";
  const width = input.container.w!;

  const classes = new Map<number, Shelf[]>();
  const places = new Map<string, Placement>();
  let top = 0;
  let count = 0;
  for (const item of byRank(input.items)) {
    const k = classOf(item.h, r);
    const open = classes.get(k) ?? [];
    const candidates = fit === "next" ? open.slice(-1) : open;
    let shelf = candidates.find((s) => s.used + item.w <= width);
    if (shelf === undefined) {
      shelf = { y: top, used: 0 };
      open.push(shelf);
      classes.set(k, open);
      top += r ** k;
      count += 1;
    }
    places.set(item.id, { id: item.id, x: shelf.used, y: shelf.y });
    shelf.used += item.w;
  }

  const output: PackOutput = { placements: input.items.map((item) => places.get(item.id)!), overflow: [], size: { w: width, h: top }, moved: [] };
  return { output, height: top, shelves: count };
}
