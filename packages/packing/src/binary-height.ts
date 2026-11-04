// The strip search of roadmap item k81 (idea R10 of the survey, Zhang 2013): a binary search on the height of the strip.
// Each height gets a seeded swap search for a layout that places each item. A skyline decoder gives the layout of an order.
// The strategy `binary-height` of `src/standalone-strategies.ts` wraps it, and no default uses it. The bench compares it with proved heights and with the named entries.

import { EPS, stepRandom } from "@mark1russell7/layout-contract";
import { marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { moved } from "./raster-nofit.ts";

/** The id of the random stream of `packBinaryHeight`. */
export const BINARY_HEIGHT_STAGE: string = "binary-height";

/** The default count of the decoded orders at one height. */
const DEFAULT_TRIALS = 256;

/** The default gap at which the search stops. With whole lengths, 0.5 lets the search try each whole height. */
const DEFAULT_PRECISION = 0.5;

/** The options of `packBinaryHeight`. */
export interface BinaryHeightOptions {
  /** The count of the decoded orders at one height. It is a whole number of 1 or more. The default is 256. */
  readonly trials?: number;
  /** The seed of the random stream. The default is 0. */
  readonly seed?: number;
  /** The search stops when the height minus the bottom of the range is at most this value. It is above 0. The default is 0.5. */
  readonly precision?: number;
}

/** The result of `packBinaryHeight`. */
export interface BinaryHeightResult {
  /** The layout of the height `height`, with each item placed. */
  readonly output: PackOutput;
  /** The height of `output`. No proof comes with it: a failed search at a height does not show that no layout exists. */
  readonly height: number;
  /** The height of the best first layout, before the search. */
  readonly firstHeight: number;
  /** The count of the heights that the search tried. */
  readonly steps: number;
  /** The count of the decoded orders, over all heights. */
  readonly decoded: number;
}

/** A box of the input, with its index in the input. */
interface Box {
  readonly index: number;
  readonly w: number;
  readonly h: number;
  readonly turns: boolean;
}

/** A piece of the skyline: the top of the layout from `x` over the width `w`. */
interface Segment {
  readonly x: number;
  readonly w: number;
  readonly y: number;
}

/** The place of one box. */
interface Spot {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly turned: boolean;
}

/** The layout of an order under a height limit. `missing` is the area of the boxes with no place. */
interface Layout {
  readonly order: readonly Box[];
  readonly spots: readonly Spot[];
  readonly missing: number;
  readonly top: number;
}

/** This function checks the input and gives the width of the strip. It throws a `RangeError` for an input that the search does not read. */
function widthOf(input: PackInput, options: BinaryHeightOptions): number {
  const { container } = input;
  const trials = options.trials ?? DEFAULT_TRIALS;
  const precision = options.precision ?? DEFAULT_PRECISION;
  if (!Number.isInteger(trials) || trials < 1) throw new RangeError(`The trials of packBinaryHeight are a whole number of 1 or more, not ${trials}.`);
  if (!(precision > 0)) throw new RangeError(`The precision of packBinaryHeight is above 0, not ${precision}.`);
  if (container.fixed !== "width" || container.w === undefined || !(container.w > 0)) throw new RangeError("packBinaryHeight needs a strip of a fixed width.");
  if (container.shape !== undefined || (container.inset ?? 0) !== 0) throw new RangeError("packBinaryHeight reads no shape and no inset.");
  if ((input.obstacles?.length ?? 0) > 0) throw new RangeError("packBinaryHeight reads no obstacles.");
  if ((input.gap ?? 0) !== 0 || (input.pairGaps?.length ?? 0) > 0) throw new RangeError("packBinaryHeight reads no gap.");
  for (const item of input.items) {
    const m = marginOf(item);
    if (m.left !== 0 || m.right !== 0 || m.top !== 0 || m.bottom !== 0) throw new RangeError(`packBinaryHeight reads no margin: item ${item.id}.`);
    if (item.locked === true) throw new RangeError(`packBinaryHeight reads no locked item: item ${item.id}.`);
    if (shortestFit(item, container.w) === undefined) throw new RangeError(`The item ${item.id} does not fit the strip.`);
  }
  return container.w;
}

/** This function gives the least height of an item in a strip, over its turns, or `undefined` when no turn fits. */
function shortestFit(item: Item, width: number): number | undefined {
  const fits = [item.w <= width ? item.h : undefined, item.turnable === true && item.h <= width ? item.w : undefined].filter((h) => h !== undefined);
  return fits.length === 0 ? undefined : Math.min(...fits);
}

/** This function gives the top of the skyline over a window, or `undefined` when the window is outside the strip. */
function restOn(skyline: readonly Segment[], x: number, w: number, width: number): { y: number; waste: number } | undefined {
  if (x < -EPS || x + w > width + EPS) return undefined;
  let y = 0;
  const under: { w: number; y: number }[] = [];
  for (const s of skyline) {
    const left = Math.max(x, s.x);
    const right = Math.min(x + w, s.x + s.w);
    if (right <= left) continue;
    y = Math.max(y, s.y);
    under.push({ w: right - left, y: s.y });
  }
  return { y, waste: under.reduce((sum, u) => sum + u.w * (y - u.y), 0) };
}

/** This function gives the skyline after a box of width `w` with its top at `top` covers the window from `x`. */
function raised(skyline: readonly Segment[], x: number, w: number, top: number): Segment[] {
  const next: Segment[] = [];
  const add = (s: Segment): void => {
    const last = next[next.length - 1];
    if (s.w <= EPS) return;
    if (last !== undefined && last.y === s.y) next[next.length - 1] = { x: last.x, w: last.w + s.w, y: s.y };
    else next.push(s);
  };
  let added = false;
  for (const s of skyline) {
    if (s.x + s.w <= x + EPS) {
      add(s);
      continue;
    }
    if (s.x < x - EPS) add({ x: s.x, w: x - s.x, y: s.y });
    if (!added) {
      add({ x, w, y: top });
      added = true;
    }
    if (s.x + s.w > x + w + EPS) {
      const left = Math.max(s.x, x + w);
      add({ x: left, w: s.x + s.w - left, y: s.y });
    }
  }
  return next;
}

/**
 * This function gives the layout of an order. Each box goes to the lowest place under the limit, against the left or the right end of a skyline piece.
 * A tie goes to the least waste under the box, then to the left. A box with no place stays out, and its area counts in `missing`.
 */
function decode(order: readonly Box[], width: number, limit: number): Layout {
  let skyline: Segment[] = [{ x: 0, w: width, y: 0 }];
  const spots: Spot[] = [];
  let missing = 0;
  let top = 0;
  for (const box of order) {
    let best: { x: number; y: number; waste: number; w: number; h: number; turned: boolean } | undefined;
    const sides = box.turns ? [[box.w, box.h, 0], [box.h, box.w, 1]] as const : [[box.w, box.h, 0]] as const;
    for (const [w, h, turned] of sides) {
      for (const s of skyline) {
        for (const x of [s.x, s.x + s.w - w]) {
          const rest = restOn(skyline, x, w, width);
          if (rest === undefined || rest.y + h > limit + EPS) continue;
          const lower = best === undefined || rest.y < best.y - EPS || (rest.y <= best.y + EPS && (rest.waste < best.waste - EPS || (rest.waste <= best.waste + EPS && x < best.x)));
          if (lower) best = { x, y: rest.y, waste: rest.waste, w, h, turned: turned === 1 };
        }
      }
    }
    if (best === undefined) {
      missing += box.w * box.h;
      continue;
    }
    spots.push({ index: box.index, x: best.x, y: best.y, turned: best.turned });
    skyline = raised(skyline, best.x, best.w, best.y + best.h);
    top = Math.max(top, best.y + best.h);
  }
  return { order, spots, missing, top };
}

/** This function gives the three first orders of the search: the largest area first, the highest first, the widest first. A tie goes to the input order. */
function firstOrders(boxes: readonly Box[]): Box[][] {
  const by = (key: (b: Box) => number): Box[] => [...boxes].sort((a, b) => key(b) - key(a) || a.index - b.index);
  return [by((b) => b.w * b.h), by((b) => b.h), by((b) => b.w)];
}

/** This function gives the output of a layout. */
function outputOf(input: PackInput, layout: Layout, width: number): PackOutput {
  const places = new Map<number, Placement>();
  for (const s of layout.spots) {
    const item = input.items[s.index]!;
    places.set(s.index, s.turned ? { id: item.id, x: s.x, y: s.y, turn: 90 } : { id: item.id, x: s.x, y: s.y });
  }
  return { placements: input.items.map((_, index) => places.get(index)!), overflow: [], size: { w: width, h: layout.top }, moved: [] };
}

/**
 * This function gives a low layout of a strip with a binary search on the height. It throws a `RangeError` for an input that it does not read.
 *
 * - The range goes from the area bound to the height of the best first layout.
 * - Each step takes the middle of the range as a limit. A swap search looks for an order that places each item under the limit.
 * - A layout lowers the top of the range to its own height. A failed search raises the bottom of the range to the limit.
 *
 * The same input and options give the same bytes. The result carries no proof: `exactStrip` gives proved heights for small inputs.
 */
export function packBinaryHeight(input: PackInput, options: BinaryHeightOptions = {}): BinaryHeightResult {
  const width = widthOf(input, options);
  const trials = options.trials ?? DEFAULT_TRIALS;
  const precision = options.precision ?? DEFAULT_PRECISION;
  if (input.items.length === 0) return { output: { placements: [], overflow: [], size: { w: width, h: 0 }, moved: [] }, height: 0, firstHeight: 0, steps: 0, decoded: 0 };
  const boxes: Box[] = input.items.map((item, index) => ({ index, w: item.w, h: item.h, turns: item.turnable === true && item.w !== item.h }));
  const firsts = firstOrders(boxes).map((order) => decode(order, width, Infinity));
  let best = firsts.reduce((a, b) => (b.top < a.top ? b : a));
  const firstHeight = best.top;
  const area = boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  let low = Math.max(area / width, ...input.items.map((item) => shortestFit(item, width)!));
  let steps = 0;
  let decoded = firsts.length;
  const r = stepRandom(options.seed ?? 0, BINARY_HEIGHT_STAGE);
  while (best.top - low > precision) {
    const limit = low + (best.top - low) / 2;
    steps++;
    let current = decode(best.order, width, limit);
    decoded++;
    for (let t = 1; t < trials && current.missing > 0 && boxes.length > 1; t++) {
      const tried = decode(moved(current.order, r), width, limit);
      decoded++;
      if (tried.missing <= current.missing) current = tried;
    }
    if (current.missing === 0) best = current;
    else low = limit;
  }
  return { output: outputOf(input, best, width), height: best.top, firstHeight, steps, decoded };
}
