// The Sleator strip packer of roadmap item k52 (docs/PACKER.md, "The Sleator strip"): a baseline with a proved bound.
// The function is not a strategy, and no default uses it. Thus the space of the bench does not change.

import { marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { pairedIds } from "./overflow.ts";

/** The result of `sleatorStrip`. */
export interface SleatorResult {
  /** The layout. Each item has a place, and each item keeps its turn. */
  readonly output: PackOutput;
  /** The height of `output`. */
  readonly height: number;
}

/** This function gives the reason that `sleatorStrip` refuses an item, or `null` when it accepts the item. */
function itemRefusal(item: Item, width: number): string | null {
  if (!(item.w > 0) || !(item.h > 0) || !Number.isFinite(item.w) || !Number.isFinite(item.h)) return `item ${item.id} needs positive finite sizes`;
  if (item.shape !== undefined) return `item ${item.id} has a shape`;
  if (item.locked === true) return `item ${item.id} is locked`;
  const m = marginOf(item);
  if (m.top !== 0 || m.right !== 0 || m.bottom !== 0 || m.left !== 0) return `item ${item.id} has a margin`;
  return item.w > width ? `item ${item.id} is wider than the strip` : null;
}

/**
 * This function gives the reason that `sleatorStrip` refuses an input, or `null` when it accepts the input.
 *
 * The input is a rectangle strip of a fixed width, with no shape, no inset, no obstacle and no gap.
 * The items are rectangles with no lock and no margin, and each one fits the width with no turn.
 */
export function sleatorRefusal(input: PackInput): string | null {
  const { container, items } = input;
  if (container.fixed !== "width") return "the container is not a strip of a fixed width";
  const width = container.w;
  if (width === undefined || !(width > 0) || !Number.isFinite(width)) return "the strip needs a positive finite width";
  if (container.shape !== undefined) return "the strip has a shape";
  if ((container.inset ?? 0) !== 0) return "the strip has an inset";
  if ((input.obstacles?.length ?? 0) > 0) return "the input has obstacles";
  if ((input.gap ?? 0) !== 0 || pairedIds(input).size > 0) return "the input has a gap";
  for (const item of items) {
    const reason = itemRefusal(item, width);
    if (reason !== null) return reason;
  }
  return null;
}

/** A half of the strip above the first level. */
interface Half {
  readonly left: number;
  top: number;
}

/**
 * This function packs a strip with the algorithm of Sleator 1980. It throws a `RangeError` for an input that `sleatorRefusal` refuses.
 *
 * 1. The items wider than half the strip go in one stack at the left side.
 * 2. The other items take the order of height, tallest first. A tie keeps the input order.
 * 3. One level above the stack takes items from left to right, until the next item does not fit the width.
 * 4. A line at half the width divides the strip above that level. Each half has a top: the tallest item of the level over that half.
 * 5. The half with the lower top takes the next level, until the next item does not fit that half. A tie goes to the left half.
 *
 * The proved bound is `2 * optimum + tallest / 2`, so at most `2.5` times the optimum. Each level ends at the first item that does not fit.
 * The function has no turns and no search. The same input gives the same layout on each machine.
 *
 * @example
 * ```ts
 * const { height, output } = sleatorStrip({ container: { fixed: "width", w: 10 }, items });
 * ```
 */
export function sleatorStrip(input: PackInput): SleatorResult {
  const reason = sleatorRefusal(input);
  if (reason !== null) throw new RangeError(`sleatorStrip: ${reason}`);
  const width = input.container.w!;
  const middle = width / 2;
  const places = new Map<string, Placement>();
  const place = (item: Item, x: number, y: number): void => void places.set(item.id, { id: item.id, x, y });

  let stack = 0;
  for (const item of input.items) {
    if (item.w <= middle) continue;
    place(item, 0, stack);
    stack += item.h;
  }

  const narrow = input.items.filter((item) => item.w <= middle).sort((a, b) => b.h - a.h);
  let next = 0;
  let x = 0;
  const halves: [Half, Half] = [{ left: 0, top: stack }, { left: middle, top: stack }];
  while (next < narrow.length && x + narrow[next]!.w <= width) {
    const item = narrow[next++]!;
    place(item, x, stack);
    // The order of height makes the first item over a half its tallest item.
    if (x < middle && halves[0].top === stack) halves[0].top = stack + item.h;
    if (x + item.w > middle && halves[1].top === stack) halves[1].top = stack + item.h;
    x += item.w;
  }

  while (next < narrow.length) {
    const half = halves[1].top < halves[0].top ? halves[1] : halves[0];
    const end = half.left + middle;
    const y = half.top;
    half.top += narrow[next]!.h;
    x = half.left;
    while (next < narrow.length && x + narrow[next]!.w <= end) {
      const item = narrow[next++]!;
      place(item, x, y);
      x += item.w;
    }
  }

  const height = Math.max(stack, halves[0].top, halves[1].top);
  const output: PackOutput = { placements: input.items.map((item) => places.get(item.id)!), overflow: [], size: { w: width, h: height }, moved: [] };
  return { output, height };
}
