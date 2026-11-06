// The shelf with the best breaks of roadmap item k29 (docs/PACKER.md, "The shelf with the best breaks"): rows in the reading order,
// with the least height of all such rows. The strategy `shelf-breaks` of `src/standalone-strategies.ts` wraps the function. No default uses it.

import type { PackInput, PackOutput, Placement } from "./contract.ts";
import { byRank } from "./frame.ts";
import { sleatorRefusal } from "./sleator.ts";

/** The result of `shelfBreaks`. */
export interface ShelfBreaksResult {
  /** The layout. Each item has a place, with no turn. */
  readonly output: PackOutput;
  /** The height of `output`: the sum of the heights of the rows. */
  readonly height: number;
  /** The count of the rows. */
  readonly rows: number;
}

/**
 * This function gives the reason that `shelfBreaks` refuses an input, or `null` when it accepts the input.
 * It accepts the same inputs as `sleatorStrip`. The container is a strip of a fixed width with no obstacle and no gap.
 * Each item has no lock and no margin, and fits the width with no turn.
 */
export function shelfBreaksRefusal(input: PackInput): string | null {
  return sleatorRefusal(input);
}

/**
 * This function packs a strip into rows that keep the reading order. Of all the ways to break the order into rows,
 * it takes a way with the least height. It throws a `RangeError` for an input that `shelfBreaksRefusal` refuses.
 *
 * 1. The items take the reading order of `byRank`, the order of the frame of each strategy.
 * 2. A row is a run of the order that fits the width. Its height is the height of its tallest item.
 * 3. A dynamic program finds the least height of each start of the order. Its cost is the count of items times the length of the longest row.
 * 4. Each row starts at the left side, and each next row starts under the tallest item of the row above it.
 * 5. On a tie of height, the function takes fewer rows. On a tie of both, it takes the longest last row.
 *
 * The greedy shelf in the reading order fills each row until the next item does not fit. Its breaks are one of the ways,
 * and the function adds the widths of a row in the same order as the greedy shelf. Thus the height is at most the
 * height of the greedy shelf. The function has no search with a seed, so the same input gives the same layout on each machine.
 *
 * @example
 * ```ts
 * const { height, rows, output } = shelfBreaks({ container: { fixed: "width", w: 10 }, items });
 * ```
 */
export function shelfBreaks(input: PackInput): ShelfBreaksResult {
  const reason = shelfBreaksRefusal(input);
  if (reason !== null) throw new RangeError(`shelfBreaks: ${reason}`);
  const width = input.container.w!;
  const order = byRank(input.items);
  const n = order.length;

  // best[j] is the least height of the first j items, rows[j] its count of rows, and start[j] the first item of its last row.
  const best: number[] = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const rows: number[] = new Array<number>(n + 1).fill(0);
  const start: number[] = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    let used = 0;
    let tallest = 0;
    for (let j = i; j < n; j++) {
      const item = order[j]!;
      // The same sum as the cursor of the greedy shelf: the left edge of the next item is the right edge of this one
      if (j > i && used + item.w > width) break;
      used += item.w;
      tallest = Math.max(tallest, item.h);
      const height = best[i]! + tallest;
      const count = rows[i]! + 1;
      const end = j + 1;
      if (height < best[end]! || (height === best[end]! && (count < rows[end]! || (count === rows[end]! && i < start[end]!)))) {
        best[end] = height;
        rows[end] = count;
        start[end] = i;
      }
    }
  }

  const places = new Map<string, Placement>();
  for (let end = n; end > 0; end = start[end]!) {
    const first = start[end]!;
    const top = best[first]!;
    let x = 0;
    for (let k = first; k < end; k++) {
      const item = order[k]!;
      places.set(item.id, { id: item.id, x, y: top });
      x += item.w;
    }
  }
  const height = best[n]!;
  const output: PackOutput = { placements: input.items.map((item) => places.get(item.id)!), overflow: [], size: { w: width, h: height }, moved: [] };
  return { output, height, rows: rows[n]! };
}
