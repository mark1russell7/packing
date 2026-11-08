// The masonry and column layouts of `docs/research/CATALOG.md` (roadmap item k28): shortest column, longest first, differencing, ordered columns, the balance of CSS columns and wide cards.
// A card wall has columns of one width. Each box goes to one column, and a wide box of `masonryMultiSpan` goes to the columns next to each other that it covers. The functions of this file are standalone.
// The strategy `masonry` of `src/standalone-strategies.ts` wraps them. They are not in a default. `columnBalance` and `columnReading` read their outputs.

import { priorityQueue } from "@mark1russell7/collections";
import { marginOf, type PackInput, type PackOutput, type Placement } from "./contract.ts";

/** The options of a masonry layout. */
export interface MasonryOptions {
  /** The count of the columns: a whole number of 1 or more. */
  readonly columns: number;
  /** The width of each column. The default is the widest box with its margins. A box that is wider is a `RangeError`. */
  readonly columnWidth?: number;
}

/** A masonry method. It gives one placement for each item, in the order of the items. */
export type MasonryLayout = (input: PackInput, options: MasonryOptions) => PackOutput;

/** The heights of the columns of a layout. */
export interface ColumnBalance {
  /** The height of each column from the left. A column with no box has the height 0. */
  readonly heights: readonly number[];
  /** The tallest height minus the shortest height, divided by the tallest height. This is `pack.columnBalance` of the catalog. 0 is level. */
  readonly balance: number;
}

/** The distance from the input order to the visual order of a layout. */
export interface ColumnReading {
  /** The count of the pairs of boxes that the visual order reverses. */
  readonly inversions: number;
  /** `inversions` divided by the count of the pairs. 0 is the input order, and 1 is the reverse order. */
  readonly inversionShare: number;
  /** The sum, over the boxes, of the distance between the input position and the visual position. */
  readonly footrule: number;
  /** `footrule` divided by its largest value. 0 is the input order, and 1 is the reverse order. */
  readonly footruleShare: number;
  /** The largest distance of one box between its input position and its visual position. */
  readonly largestMove: number;
}

/** An item as a card of a column. `height` has the margins and the gap, so the heights of a column add up. */
interface Card {
  readonly id: string;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  /** The count of the columns that the card covers: 1, or more for a wide card of `masonryMultiSpan`. */
  readonly span: number;
}

/** The cards of an input, with the measures of its columns. */
interface Wall {
  readonly cards: readonly Card[];
  /** The indexes of the cards in the input order: by `rank`, and then by the position in the list. */
  readonly order: readonly number[];
  readonly columns: number;
  readonly width: number;
  readonly gap: number;
}

/** A method of one wall: it gives the indexes of the cards of each column, from the top. */
type Stacker = (heights: readonly number[], order: readonly number[], columns: number) => number[][];

/**
 * This function gives the cards of an input. It refuses an input that a column layout cannot keep with a `RangeError`.
 * With `wide`, a box can be wider than a column. It covers the least count of columns that holds it, and it must fit in the wall.
 */
function wallOf(input: PackInput, options: MasonryOptions, wide = false): Wall {
  const { columns, columnWidth } = options;
  if (!Number.isInteger(columns) || columns < 1) throw new RangeError("The count of the columns must be a whole number of 1 or more.");
  if (input.container.fixed !== "none") throw new RangeError('A masonry layout needs a container with fixed "none", because the columns set the size.');
  if ((input.obstacles?.length ?? 0) > 0) throw new RangeError("A masonry layout does not take obstacles.");
  if ((input.pairGaps?.length ?? 0) > 0) throw new RangeError("A masonry layout does not take pairGaps.");
  const gap = input.gap ?? 0;
  let widest = 0;
  const outers: number[] = [];
  const cards = input.items.map((item): Omit<Card, "span"> => {
    if (item.locked === true) throw new RangeError(`A masonry layout does not take the locked item "${item.id}".`);
    if (!(item.w > 0 && item.h > 0) || !Number.isFinite(item.w) || !Number.isFinite(item.h)) throw new RangeError(`The size of "${item.id}" must be positive and finite.`);
    const margin = marginOf(item);
    const outer = item.w + margin.left + margin.right;
    outers.push(outer);
    widest = Math.max(widest, outer);
    return { id: item.id, height: item.h + margin.top + margin.bottom + gap, left: margin.left, top: margin.top };
  });
  const width = columnWidth ?? widest;
  if (!wide && (!Number.isFinite(width) || !(width >= widest))) throw new RangeError("The column width must be finite, and each box with its margins must fit in it.");
  if (wide && (!Number.isFinite(width) || (columnWidth !== undefined && !(width > 0)) || !(widest <= columns * width + (columns - 1) * gap))) {
    throw new RangeError("The column width must be positive and finite, and each box with its margins must fit in the width of the wall.");
  }
  const ranks = input.items.map((item, index) => item.rank ?? index);
  const order = cards.map((_, index) => index).sort((a, b) => ranks[a]! - ranks[b]! || a - b);
  return { cards: cards.map((card, index) => ({ ...card, span: spanOf(outers[index]!, width, gap) })), order, columns, width, gap };
}

/** This function gives the least count `k` of columns with `k` widths and `k - 1` gaps that hold a box of the width `outer`. */
function spanOf(outer: number, width: number, gap: number): number {
  let span = 1;
  while (span * width + (span - 1) * gap < outer) span += 1;
  return span;
}

/** This function places the cards of a wall with a stacker. Each card goes under the card before it, at the left of its column. */
function layWall(input: PackInput, options: MasonryOptions, stacker: Stacker): PackOutput {
  const { cards, order, columns, width, gap } = wallOf(input, options);
  const stacks = stacker(cards.map((card) => card.height), order, columns);
  const placements = new Array<Placement>(cards.length);
  let tallest = 0;
  for (const [column, stack] of stacks.entries()) {
    let top = 0;
    for (const index of stack) {
      const card = cards[index]!;
      placements[index] = { id: card.id, x: column * (width + gap) + card.left, y: top + card.top };
      top += card.height;
    }
    tallest = Math.max(tallest, top);
  }
  const size = { w: columns * width + (columns - 1) * gap, h: Math.max(0, tallest - gap) };
  return { placements, overflow: [], size, moved: [] };
}

/** This function gives one empty stack for each column. */
function emptyStacks(columns: number): number[][] {
  return Array.from({ length: columns }, (): number[] => []);
}

/** This function puts each card of `order` in the shortest column. Of equal columns, the left column wins. */
function shortestStacks(heights: readonly number[], order: readonly number[], columns: number): number[][] {
  const stacks = emptyStacks(columns);
  const tops = new Array<number>(columns).fill(0);
  for (const index of order) {
    let shortest = 0;
    for (let column = 1; column < columns; column++) if (tops[column]! < tops[shortest]!) shortest = column;
    stacks[shortest]!.push(index);
    tops[shortest]! += heights[index]!;
  }
  return stacks;
}

/**
 * This function gives the least possible tallest column for a cut of the sequence into `parts` columns: the linear
 * partition of Skiena 2008. A step goes back from the end of a column, and it stops when the column is too tall to be
 * better. Each result is one difference of `sums`, so the caller can compare with it and needs no tolerance.
 */
function leastTallest(sums: Float64Array, parts: number): number {
  const count = sums.length - 1;
  let tallest = sums.slice();
  for (let part = 2; part <= parts; part++) {
    const next = new Float64Array(count + 1);
    for (let end = 0; end <= count; end++) {
      let best = Infinity;
      for (let cut = end; cut >= 0; cut--) {
        const column = sums[end]! - sums[cut]!;
        if (column >= best) break;
        best = Math.min(best, Math.max(tallest[cut]!, column));
      }
      next[end] = best;
    }
    tallest = next;
  }
  return tallest[count]!;
}

/** A partial wall of the differencing method: one sum and one set of cards for each column, with the tallest sum first. */
interface Partial {
  readonly sums: readonly number[];
  readonly sets: readonly (readonly number[])[];
  /** The tallest sum minus the shortest sum. */
  readonly spread: number;
  /** The count of the partial walls made before this one. Of equal spreads, the older wall comes first. */
  readonly made: number;
}

/**
 * This function gives the columns of the differencing method of Karmarkar 1982, for `columns` columns. Each card starts as
 * a partial wall with the card in one column. Two walls with the largest spreads join: the tallest column of one wall goes
 * with the shortest column of the other wall. At the end, one wall is left.
 *
 * - The columns go from the left in the order of their first card. Each column reads from the top in the input order.
 * - Equal sums keep the column with the first card in the input order first. Thus the result does not change between calls.
 */
function differencingStacks(heights: readonly number[], order: readonly number[], columns: number): number[][] {
  if (order.length === 0) return emptyStacks(columns);
  const position = new Map(order.map((index, place) => [index, place]));
  const firstOf = (set: readonly number[]): number => (set.length === 0 ? Infinity : position.get(set[0]!)!);
  let made = 0;
  const partial = (sums: readonly number[], sets: readonly (readonly number[])[]): Partial => {
    const slots = sums.map((sum, slot) => ({ sum, set: sets[slot]! })).sort((a, b) => b.sum - a.sum || firstOf(a.set) - firstOf(b.set));
    const sorted = slots.map((slot) => slot.sum);
    return { sums: sorted, sets: slots.map((slot) => slot.set), spread: sorted[0]! - sorted[columns - 1]!, made: made++ };
  };
  const queue = priorityQueue<Partial>((a, b) => b.spread - a.spread || a.made - b.made);
  for (const index of order) {
    const sums = new Array<number>(columns).fill(0);
    sums[0] = heights[index]!;
    queue.offer(partial(sums, Array.from({ length: columns }, (_, slot) => (slot === 0 ? [index] : []))));
  }
  while (queue.size > 1) {
    const a = queue.poll();
    const b = queue.poll();
    const sums = a.sums.map((sum, slot) => sum + b.sums[columns - 1 - slot]!);
    const sets = a.sets.map((set, slot) => [...set, ...b.sets[columns - 1 - slot]!].sort((x, y) => position.get(x)! - position.get(y)!));
    queue.offer(partial(sums, sets));
  }
  const last = queue.poll();
  return last.sets.map((set) => [...set]).sort((a, b) => firstOf(a) - firstOf(b));
}

/**
 * This function fills the columns in the input order, as `column-fill: balance` of CSS does. The height of the columns is
 * the least height with which the fill puts each card in a column. Each column takes the cards of the order while they fit.
 * Thus the first columns are full, and the last columns can be short or empty.
 */
function cssBalanceStacks(heights: readonly number[], order: readonly number[], columns: number): number[][] {
  const stacks = emptyStacks(columns);
  const count = order.length;
  if (count === 0) return stacks;
  const sums = new Float64Array(count + 1);
  for (let index = 0; index < count; index++) sums[index + 1] = sums[index]! + heights[order[index]!]!;
  const limit = leastTallest(sums, Math.min(columns, count));
  let start = 0;
  for (let column = 0; column < columns && start < count; column++) {
    let end = start + 1;
    while (end < count && sums[end + 1]! - sums[start]! <= limit) end += 1;
    stacks[column] = order.slice(start, end);
    start = end;
  }
  return stacks;
}

/**
 * This function cuts the sequence into columns that keep the order. The tallest column is the least possible. Of the cuts
 * with that tallest column, it takes the least sum of the squared heights. That rule fills each column, because many
 * cuts have the least tallest column when one card is much taller than the others.
 */
function orderedStacks(heights: readonly number[], order: readonly number[], columns: number): number[][] {
  const stacks = emptyStacks(columns);
  const count = order.length;
  if (count === 0) return stacks;
  const parts = Math.min(columns, count);
  const sums = new Float64Array(count + 1);
  for (let index = 0; index < count; index++) sums[index + 1] = sums[index]! + heights[order[index]!]!;
  const limit = leastTallest(sums, parts);

  const row = count + 1;
  const cuts = new Int32Array(parts * row);
  let cost = sums.map((sum) => (sum > limit ? Infinity : sum * sum));
  for (let part = 1; part < parts; part++) {
    const next = new Float64Array(row);
    for (let end = 0; end <= count; end++) {
      let best = Infinity;
      let bestCut = end;
      for (let cut = end; cut >= 0; cut--) {
        const column = sums[end]! - sums[cut]!;
        if (column > limit) break;
        const value = cost[cut]! + column * column;
        if (value < best) {
          best = value;
          bestCut = cut;
        }
      }
      next[end] = best;
      cuts[part * row + end] = bestCut;
    }
    cost = next;
  }

  let end = count;
  for (let part = parts - 1; part >= 0; part--) {
    const cut = part === 0 ? 0 : cuts[part * row + end]!;
    stacks[part] = order.slice(cut, end);
    end = cut;
  }
  return stacks;
}

/**
 * This function gives the shortest column layout of the catalog (`masonry-shortest`). Each box, in the input order, goes
 * to the bottom of the shortest column. This is the list scheduling of Graham 1966, so the tallest column is at most
 * `2 - 1/c` times the optimum. The input order is the `rank` of an item and then its position in the list.
 *
 * - The cost is `O(n c)`, because a scan finds the shortest column.
 * - The container must be free. An obstacle, a locked item and `pairGaps` are a `RangeError`.
 * - Each box is at the left of its column. A box does not turn.
 */
export function masonryShortest(input: PackInput, options: MasonryOptions): PackOutput {
  return layWall(input, options, shortestStacks);
}

/**
 * This function gives the longest first layout of the catalog (`masonry-lpt`). It sorts the boxes by height, decreasing,
 * and then does `masonryShortest`. The tallest column is at most `4/3 - 1/(3c)` times the optimum (Graham 1969). Equal
 * heights keep the input order. The cost is `O(n log n + n c)`. The refusals are those of `masonryShortest`.
 */
export function masonryLpt(input: PackInput, options: MasonryOptions): PackOutput {
  return layWall(input, options, (heights, order, columns) => {
    const sorted = order.toSorted((a, b) => heights[b]! - heights[a]!);
    return shortestStacks(heights, sorted, columns);
  });
}

/**
 * This function gives the balanced columns of the catalog (`masonry-differencing`): the differencing method of Karmarkar
 * 1982 for `c` columns. It joins partial walls with the largest spreads first, so the large cards balance each other.
 *
 * - The cost is `O(n log n + n c log c)` for the queue and the sorts of the columns, and `O(n^2)` at most for the joins of the sets of cards.
 * - The columns go from the left in the order of their first card, and each column reads from the top in the input order.
 * - The refusals are those of `masonryShortest`.
 */
export function masonryDifferencing(input: PackInput, options: MasonryOptions): PackOutput {
  return layWall(input, options, differencingStacks);
}

/**
 * This function gives the ordered columns of the catalog (`columns-linear-partition`). It cuts the input order into one
 * part for each column, from the left, with dynamic programming. No other cut has a shorter tallest column (Skiena 2008).
 *
 * - The cuts with the same tallest column are ranked by the sum of their squared heights.
 * - A column has the next part of the input order, so each column reads from the top in the input order.
 * - The cost is `O(n^2 c)` at most, and the memory is `O(n c)`. The refusals are those of `masonryShortest`.
 */
export function columnsLinearPartition(input: PackInput, options: MasonryOptions): PackOutput {
  return layWall(input, options, orderedStacks);
}

/**
 * This function gives the balance of CSS columns of the catalog (`columns-css-balance`), as `column-fill: balance` does.
 * The tallest column is the least possible for a cut of the input order, as in `columnsLinearPartition`. The cut is not the
 * same: each column takes the cards of the order while they fit under that height.
 *
 * - Each column reads from the top in the input order, and each column follows the column to its left.
 * - The cost is `O(n^2 c)` at most, and the memory is `O(n)`. The refusals are those of `masonryShortest`.
 */
export function columnsCssBalance(input: PackInput, options: MasonryOptions): PackOutput {
  return layWall(input, options, cssBalanceStacks);
}

/**
 * This function gives the masonry with wide cards of the catalog (`masonry-multi-span`). A box covers the least count `k`
 * of columns that holds it. In the input order, each box goes to the `k` columns next to each other where the tallest of
 * them is the lowest. Of equal places, the left place wins. Then the `k` columns get the bottom of the box.
 *
 * - Without `columnWidth`, each box covers one column, and the layout is that of `masonryShortest`.
 * - A box that is wider than the wall is a `RangeError`. The other refusals are those of `masonryShortest`.
 * - The cost is `O(n c s)` for the largest count `s` of the columns of one box.
 */
export function masonryMultiSpan(input: PackInput, options: MasonryOptions): PackOutput {
  const { cards, order, columns, width, gap } = wallOf(input, options, true);
  const tops = new Array<number>(columns).fill(0);
  const placements = new Array<Placement>(cards.length);
  for (const index of order) {
    const card = cards[index]!;
    let start = 0;
    let lowest = Infinity;
    for (let first = 0; first + card.span <= columns; first++) {
      let top = 0;
      for (let column = first; column < first + card.span; column++) top = Math.max(top, tops[column]!);
      if (top < lowest) {
        lowest = top;
        start = first;
      }
    }
    placements[index] = { id: card.id, x: start * (width + gap) + card.left, y: lowest + card.top };
    for (let column = start; column < start + card.span; column++) tops[column] = lowest + card.height;
  }
  const size = { w: columns * width + (columns - 1) * gap, h: Math.max(0, Math.max(0, ...tops) - gap) };
  return { placements, overflow: [], size, moved: [] };
}

/**
 * This function gives the heights of the columns of a masonry layout and the measure `pack.columnBalance` of the catalog. Give
 * it the options of the layout. The height of a column is the lowest bottom of its boxes with their margins. The measure
 * reads the columns from the left edges of the boxes. A wide box of `masonryMultiSpan` counts on each column that it covers.
 * An item that is not on a column is a `RangeError`.
 */
export function columnBalance(input: PackInput, output: PackOutput, options: MasonryOptions): ColumnBalance {
  const { cards, columns, width, gap } = wallOf(input, options, true);
  const spans = new Map(cards.map((card) => [card.id, card.span]));
  const items = new Map(input.items.map((item) => [item.id, item]));
  const heights = new Array<number>(columns).fill(0);
  for (const placement of output.placements) {
    const item = items.get(placement.id);
    if (item === undefined) continue;
    const margin = marginOf(item);
    const column = Math.round((placement.x - margin.left) / (width + gap));
    const span = spans.get(item.id) ?? 1;
    if (!(column >= 0 && column + span <= columns)) throw new RangeError(`The item "${item.id}" is not on a column.`);
    for (let covered = column; covered < column + span; covered++) heights[covered] = Math.max(heights[covered]!, placement.y + item.h + margin.bottom);
  }
  const tallest = Math.max(...heights);
  return { heights, balance: tallest > 0 ? (tallest - Math.min(...heights)) / tallest : 0 };
}

/**
 * This function tells how far the visual order of a layout is from the input order. The visual order sorts the boxes by
 * their top, and then by their left. The input order is the `rank` of an item and then its position in the list.
 *
 * - The measure `pack.order.inversions` puts two boxes with overlapped heights on one line. In a card wall, most boxes
 *   overlap in height. Thus this measure reads only the tops, so the order is a true sequence.
 * - `footrule` is the footrule of Spearman, and `inversions` is the distance of Kendall.
 *   Diaconis 1977 gives `inversions <= footrule <= 2 * inversions`.
 * - `masonryShortest` with equal top margins gives 0 here: the top of the shortest column does not go down, so the tops follow the input order.
 * - An item with no placement does not count. The cost is `O(n^2)`.
 */
export function columnReading(input: PackInput, output: PackOutput): ColumnReading {
  const placements = new Map<string, Placement>();
  for (const placement of output.placements) if (!placements.has(placement.id)) placements.set(placement.id, placement);
  const placed = input.items.flatMap((item, index) => {
    const placement = placements.get(item.id);
    return placement === undefined ? [] : [{ rank: item.rank ?? index, index, x: placement.x, y: placement.y }];
  });
  placed.sort((a, b) => a.rank - b.rank || a.index - b.index);
  const inputOrder = placed.map((box, position) => ({ ...box, position }));
  const visual = inputOrder.toSorted((a, b) => a.y - b.y || a.x - b.x || a.position - b.position).map((box) => box.position);

  const count = visual.length;
  let inversions = 0;
  let footrule = 0;
  let largestMove = 0;
  for (let i = 0; i < count; i++) {
    const position = visual[i]!;
    const move = Math.abs(position - i);
    footrule += move;
    largestMove = Math.max(largestMove, move);
    for (let j = i + 1; j < count; j++) if (visual[j]! < position) inversions += 1;
  }
  const pairs = (count * (count - 1)) / 2;
  const widest = Math.floor((count * count) / 2);
  return {
    inversions,
    inversionShare: pairs > 0 ? inversions / pairs : 0,
    footrule,
    footruleShare: widest > 0 ? footrule / widest : 0,
    largestMove,
  };
}
