// The justified rows of `docs/research/CATALOG.md` (roadmap item k28): rows in the reading order, each row scaled to the width of the strip.
// A box keeps the ratio of its width to its height, and its size stays in the bounds of its `resize` (`sizeBoundsOf` of the contract).
// The three methods differ only in the row breaks: greedy, linear partition and line breaking. The function is standalone. It is not in a default.

import { sizeBoundsOf } from "@mark1russell7/layout-contract";
import { marginOf, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";

/**
 * The method of the row breaks of `justifiedRows`.
 * `greedy` is the method of the Flickr software, `linear-partition` is the method of Skiena 2008, and `line-break` is the method of Knuth 1981.
 */
export type JustifiedMethod = "greedy" | "linear-partition" | "line-break";

/** The values of `JustifiedMethod`, in the order of the catalog. */
export const JUSTIFIED_METHODS: readonly JustifiedMethod[] = ["greedy", "linear-partition", "line-break"];

/** The options of `justifiedRows`. */
export interface JustifiedRowsOptions {
  /** The method of the row breaks. The default is `greedy`. */
  readonly method?: JustifiedMethod;
  /** The height that each row aims at, without the margins. The default is the median height of the items. */
  readonly targetHeight?: number;
}

/** The result of `justifiedRows`. */
export interface JustifiedRowsResult {
  /** The layout. A placement has `w` and `h` when its item has a new size. */
  readonly output: PackOutput;
  /** The count of the rows. */
  readonly rows: number;
  /** The height of the boxes of each row from the top, without the margins. */
  readonly heights: readonly number[];
  /** The width that is left in each row from the top, after the scale. A row with a bound or the last row can keep width. */
  readonly free: readonly number[];
}

/** A box of a row: its index in the input, its ratio of width to height and its margins. `low` and `high` are the limits of its height. */
interface Cell {
  readonly index: number;
  readonly ratio: number;
  readonly left: number;
  readonly top: number;
  /** The sum of the margins at the left and the right. */
  readonly sides: number;
  /** The sum of the margins at the top and the bottom. */
  readonly ends: number;
  /** The least height that the bounds let the box take with its ratio. */
  readonly low: number;
  /** The largest height that the bounds let the box take with its ratio. */
  readonly high: number;
}

/** This function gives the least and the largest height of an item that keeps its ratio, in the bounds of its `resize`. */
function heightRange(item: Item): readonly [number, number] {
  const b = sizeBoundsOf(item);
  return [Math.max(b.minH, (b.minW * item.h) / item.w), Math.min(b.maxH, (b.maxW * item.h) / item.w)];
}

/**
 * This function gives the reason that `justifiedRows` refuses an input, or `null` when it accepts the input.
 * The container is a strip of a fixed width with no obstacle and no `pairGaps`. Each item has no lock and a positive finite size.
 * Each item fits the width with its margins at its least height, and its bounds give it at least one height.
 */
export function justifiedRowsRefusal(input: PackInput): string | null {
  const { container } = input;
  if (container.fixed !== "width") return 'Justified rows need a container with fixed "width".';
  const width = container.w;
  if (width === undefined || !(width > 0) || !Number.isFinite(width)) return "The width of the container must be positive and finite.";
  if ((input.obstacles?.length ?? 0) > 0) return "Justified rows do not take obstacles.";
  if ((input.pairGaps?.length ?? 0) > 0) return "Justified rows do not take pairGaps.";
  const gap = input.gap ?? 0;
  if (!(gap >= 0) || !Number.isFinite(gap)) return "The gap must be 0 or more, and finite.";
  for (const item of input.items) {
    if (item.locked === true) return `Justified rows do not take the locked item "${item.id}".`;
    if (!(item.w > 0 && item.h > 0) || !Number.isFinite(item.w) || !Number.isFinite(item.h)) return `The size of "${item.id}" must be positive and finite.`;
    if (item.shape !== undefined) return `Justified rows do not take the shape of "${item.id}".`;
    const [low, high] = heightRange(item);
    if (!(low <= high)) return `The resize bounds of "${item.id}" give no height with the ratio of the item.`;
    const margin = marginOf(item);
    if (!((low * item.w) / item.h + margin.left + margin.right <= width)) return `The item "${item.id}" with its margins is wider than the container at its least size.`;
  }
  return null;
}

/** The fit of one row: the height that fills the width, and the height that the bounds of its boxes let it take. */
interface RowFit {
  /** The height that makes the row as wide as the strip. */
  readonly fill: number;
  /** The least height of the row: the largest `low` of its boxes. */
  readonly low: number;
  /** The largest height of the row: the least `high` of its boxes. */
  readonly high: number;
}

/**
 * The fits of the rows of one order, each in a constant time. Prefix sums give the ratios and the side margins.
 * Sparse tables give the least and the largest heights of the boxes.
 */
class RowFits {
  private readonly ratio: number[] = [0];
  private readonly sides: number[] = [0];
  private readonly lows: number[][];
  private readonly highs: number[][];
  private readonly width: number;
  private readonly gap: number;

  constructor(order: readonly Cell[], width: number, gap: number) {
    this.width = width;
    this.gap = gap;
    for (const c of order) {
      this.ratio.push(this.ratio.at(-1)! + c.ratio);
      this.sides.push(this.sides.at(-1)! + c.sides);
    }
    this.lows = [order.map((c) => c.low)];
    this.highs = [order.map((c) => c.high)];
    for (let span = 1; 2 * span <= order.length; span *= 2) {
      const lo = this.lows.at(-1)!;
      const hi = this.highs.at(-1)!;
      this.lows.push(lo.slice(0, lo.length - span).map((v, i) => Math.max(v, lo[i + span]!)));
      this.highs.push(hi.slice(0, hi.length - span).map((v, i) => Math.min(v, hi[i + span]!)));
    }
  }

  /** This function gives the sum of the ratios of the boxes `from` to `to - 1`. */
  ratioOf(from: number, to: number): number {
    return this.ratio[to]! - this.ratio[from]!;
  }

  /** This function gives the sum of the side margins of the boxes `from` to `to - 1`. */
  sidesOf(from: number, to: number): number {
    return this.sides[to]! - this.sides[from]!;
  }

  /** This function gives the fit of the boxes `from` to `to - 1`. The range is not empty. */
  fit(from: number, to: number): RowFit {
    const level = 31 - Math.clz32(to - from);
    const span = 1 << level;
    const low = Math.max(this.lows[level]![from]!, this.lows[level]![to - span]!);
    const high = Math.min(this.highs[level]![from]!, this.highs[level]![to - span]!);
    const fill = (this.width - this.gap * (to - from - 1) - this.sidesOf(from, to)) / this.ratioOf(from, to);
    return { fill, low, high };
  }
}

/** This function tells if a row can fill the strip or keep width: its fill height is at least the least height of each box. */
const feasible = (fit: RowFit): boolean => fit.low <= fit.high && fit.fill >= fit.low;

/** This function gives the height of a row. A row takes its fill height in its bounds. The last row also takes at most the target height. */
const rowHeight = (fit: RowFit, last: boolean, target: number): number => Math.max(fit.low, Math.min(fit.fill, fit.high, last ? target : Infinity));

/** This function gives the median of a list of numbers. The list is not empty. */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The greedy breaks. A row takes the next box while its fill height is over the target. Then it keeps the last box only when the box brings the row nearer to the target. */
function greedyBreaks(fits: RowFits, n: number, target: number): number[] {
  const breaks: number[] = [];
  let from = 0;
  while (from < n) {
    let to = from + 1;
    while (to < n) {
      const without = fits.fit(from, to);
      const withNext = fits.fit(from, to + 1);
      if (!feasible(withNext)) break;
      if (without.fill > target) {
        to++;
        continue;
      }
      // The row is at the target height or under it, so the row stops. The last box stays when it gives a height nearer to the target.
      break;
    }
    if (to > from + 1) {
      const kept = fits.fit(from, to);
      const dropped = fits.fit(from, to - 1);
      if (kept.fill < target && Math.abs(dropped.fill - target) <= Math.abs(kept.fill - target) && feasible(dropped)) to--;
    }
    breaks.push(to);
    from = to;
  }
  return breaks;
}

/**
 * The breaks of the linear partition, with dynamic programming. The `k` rows make the largest sum of the ratios of a row as small as possible.
 * `k` is the count of rows that the target height gives. A row that cannot fill the strip is not a choice. When no partition into `k` rows
 * is possible, `k` goes up by one.
 */
function partitionBreaks(fits: RowFits, n: number, width: number, target: number): number[] {
  // At the target height, the boxes with their side margins are this many strips wide.
  const rowsAtTarget = Math.round((fits.ratioOf(0, n) * target + fits.sidesOf(0, n)) / width);
  for (let k = Math.min(n, Math.max(1, rowsAtTarget)); k <= n; k++) {
    // cost[j][i] is the least largest ratio sum of the first i boxes in j rows. cut[j][i] is the start of the last of those rows.
    const cost = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
    const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
    cost[0]![0] = 0;
    for (let j = 1; j <= k; j++) {
      for (let i = j; i <= n; i++) {
        for (let s = j - 1; s < i; s++) {
          const before = cost[j - 1]![s]!;
          if (before === Infinity || !feasible(fits.fit(s, i))) continue;
          const value = Math.max(before, fits.ratioOf(s, i));
          if (value < cost[j]![i]!) {
            cost[j]![i] = value;
            cut[j]![i] = s;
          }
        }
      }
    }
    if (cost[k]![n] === Infinity) continue;
    const breaks: number[] = [];
    for (let j = k, i = n; j > 0; i = cut[j]![i]!, j--) breaks.push(i);
    return breaks.reverse();
  }
  // Each box fits alone (`justifiedRowsRefusal`), so `k = n` always has a partition.
  throw new Error("partitionBreaks: no partition, after the refusal accepted the input.");
}

/**
 * The breaks of the line breaking: all breaks at once, with the least sum of the costs of the rows.
 * The cost of a row is the square of the change of its height from the target, as a share of the target.
 * The last row has no cost when it is at the target height or over it, as the last line of a paragraph.
 */
function lineBreaks(fits: RowFits, n: number, target: number): number[] {
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(-1);
  best[0] = 0;
  for (let s = 0; s < n; s++) {
    if (best[s] === Infinity) continue;
    for (let i = s + 1; i <= n; i++) {
      const fit = fits.fit(s, i);
      // A longer row has a lower fill height, so the rows after the first one that cannot fill the strip cannot fill it either.
      if (fit.fill < fit.low) break;
      if (!feasible(fit)) continue;
      const change = fit.fill / target - 1;
      const cost = i === n && change >= 0 ? 0 : change * change;
      if (best[s]! + cost < best[i]!) {
        best[i] = best[s]! + cost;
        from[i] = s;
      }
    }
  }
  const breaks: number[] = [];
  for (let i = n; i > 0; i = from[i]!) breaks.push(i);
  return breaks.reverse();
}

/**
 * This function packs a strip into justified rows. Each row is scaled to the width of the strip, and each box keeps its ratio.
 * It throws a `RangeError` for an input that `justifiedRowsRefusal` refuses.
 *
 * 1. The items take the reading order: by `rank`, and then by the position in the list.
 * 2. The method chooses the row breaks. Each row can fill the strip: at its fill height, each box is in its bounds or over them.
 * 3. A row takes the height that makes it as wide as the strip. When a bound of a box stops the row under that height, the row keeps width at its right.
 *    The last row also takes at most the target height, so a short last row does not grow.
 * 4. Each box takes the height of its row and the width of its ratio. Each next row starts one gap under the row above it.
 *
 * A box without `resize` has the bounds of its own size, so it keeps its size. Its row takes its height when the row can.
 * The function has no search and no seed, so the same input gives the same layout on each machine.
 *
 * @example
 * ```ts
 * const items = photos.map((p) => ({ id: p.id, w: p.w, h: p.h, resize: { minW: 1, maxW: 4 * p.w, minH: 1, maxH: 4 * p.h, aspect: "keep" } }));
 * const { output } = justifiedRows({ container: { fixed: "width", w: 1200 }, items, gap: 4 }, { method: "line-break", targetHeight: 240 });
 * ```
 */
export function justifiedRows(input: PackInput, options: JustifiedRowsOptions = {}): JustifiedRowsResult {
  const reason = justifiedRowsRefusal(input);
  if (reason !== null) throw new RangeError(`justifiedRows: ${reason}`);
  const method = options.method ?? "greedy";
  if (!JUSTIFIED_METHODS.includes(method)) throw new RangeError(`justifiedRows: the method "${String(method)}" is not one of ${JUSTIFIED_METHODS.join(", ")}.`);
  const target = options.targetHeight ?? (input.items.length > 0 ? median(input.items.map((item) => item.h)) : 1);
  if (!(target > 0) || !Number.isFinite(target)) throw new RangeError("justifiedRows: the target height must be positive and finite.");
  const width = input.container.w!;
  const gap = input.gap ?? 0;
  if (input.items.length === 0) return { output: { placements: [], overflow: [], size: { w: width, h: 0 }, moved: [] }, rows: 0, heights: [], free: [] };

  const cells: Cell[] = input.items.map((item, index) => {
    const margin = marginOf(item);
    const [low, high] = heightRange(item);
    return { index, ratio: item.w / item.h, left: margin.left, top: margin.top, sides: margin.left + margin.right, ends: margin.top + margin.bottom, low, high };
  });
  const ranks = input.items.map((item, index) => item.rank ?? index);
  const order = cells.toSorted((a, b) => ranks[a.index]! - ranks[b.index]! || a.index - b.index);
  const fits = new RowFits(order, width, gap);
  const n = order.length;
  const breaks = method === "greedy" ? greedyBreaks(fits, n, target) : method === "linear-partition" ? partitionBreaks(fits, n, width, target) : lineBreaks(fits, n, target);

  const placements = new Array<Placement>(cells.length);
  const heights: number[] = [];
  const free: number[] = [];
  let top = 0;
  let from = 0;
  for (const [row, to] of breaks.entries()) {
    const last = row === breaks.length - 1;
    const height = rowHeight(fits.fit(from, to), last, target);
    heights.push(height);
    let x = 0;
    let rowOuter = 0;
    for (let i = from; i < to; i++) {
      const cell = order[i]!;
      const item = input.items[cell.index]!;
      const w = cell.ratio * height;
      const sized = w === item.w && height === item.h ? {} : { w, h: height };
      placements[cell.index] = { id: item.id, x: x + cell.left, y: top + cell.top, ...sized };
      x += w + cell.sides + gap;
      rowOuter = Math.max(rowOuter, height + cell.ends);
    }
    free.push(Math.max(0, width - (x - gap)));
    top += rowOuter + (last ? 0 : gap);
    from = to;
  }
  return { output: { placements, overflow: [], size: { w: width, h: top }, moved: [] }, rows: breaks.length, heights, free };
}
