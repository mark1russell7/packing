// The flexbox wrap of `docs/research/CATALOG.md` (roadmap item k28): rows in the reading order, as `flex-wrap: wrap` with no grow and no shrink.
// Each row is a line of a flex container in the direction `row`. `justify` puts the space that is left in a row, and `align` puts each box in the height of its row.
// The function is standalone. It is not in a default. A row with grow changes the size of a box, and the contract has no size in a placement.

import { marginOf, type PackInput, type PackOutput, type Placement } from "./contract.ts";

/**
 * The rule for the space that is left in a row, as `justify-content`.
 * `between`, `around` and `evenly` are `space-between`, `space-around` and `space-evenly`.
 */
export type FlexJustify = "start" | "center" | "end" | "between" | "around" | "evenly";

/** The values of `FlexJustify`, in the order of the catalog. */
export const FLEX_JUSTIFY: readonly FlexJustify[] = ["start", "center", "end", "between", "around", "evenly"];

/** The place of a box in the height of its row, as `align-items`. */
export type FlexAlign = "start" | "center" | "end";

/** The values of `FlexAlign`, in the order of the catalog. */
export const FLEX_ALIGN: readonly FlexAlign[] = ["start", "center", "end"];

/** The options of `flexWrap`. */
export interface FlexWrapOptions {
  /** The rule for the space that is left in each row. The default is `start`. */
  readonly justify?: FlexJustify;
  /** The place of each box in the height of its row. The default is `start`. */
  readonly align?: FlexAlign;
}

/** The result of `flexWrap`. */
export interface FlexWrapResult {
  /** The layout. Each item has a place, with no turn. */
  readonly output: PackOutput;
  /** The count of the rows. */
  readonly rows: number;
  /** The space that is left in each row from the top, before `justify` puts it. */
  readonly free: readonly number[];
}

/**
 * This function gives the reason that `flexWrap` refuses an input, or `null` when it accepts the input.
 * The container is a strip of a fixed width with no obstacle and no `pairGaps`. Each item has no lock, a positive finite size,
 * and fits the width with its margins.
 */
export function flexWrapRefusal(input: PackInput): string | null {
  const { container } = input;
  if (container.fixed !== "width") return 'A flexbox wrap needs a container with fixed "width".';
  const width = container.w;
  if (width === undefined || !(width > 0) || !Number.isFinite(width)) return "The width of the container must be positive and finite.";
  if ((input.obstacles?.length ?? 0) > 0) return "A flexbox wrap does not take obstacles.";
  if ((input.pairGaps?.length ?? 0) > 0) return "A flexbox wrap does not take pairGaps.";
  const gap = input.gap ?? 0;
  if (!(gap >= 0) || !Number.isFinite(gap)) return "The gap must be 0 or more, and finite.";
  for (const item of input.items) {
    if (item.locked === true) return `A flexbox wrap does not take the locked item "${item.id}".`;
    if (!(item.w > 0 && item.h > 0) || !Number.isFinite(item.w) || !Number.isFinite(item.h)) return `The size of "${item.id}" must be positive and finite.`;
    const margin = marginOf(item);
    if (!(item.w + margin.left + margin.right <= width)) return `The item "${item.id}" with its margins is wider than the container.`;
  }
  return null;
}

/** A box of a row: its index in the input, its outer size with the margins, and its margins at the left and the top. */
interface Cell {
  readonly index: number;
  readonly w: number;
  readonly h: number;
  readonly left: number;
  readonly top: number;
}

/**
 * This function packs a strip into rows, as a flex container with `flex-wrap: wrap` and no grow and no shrink.
 * It throws a `RangeError` for an input that `flexWrapRefusal` refuses.
 *
 * 1. The items take the reading order: by `rank`, and then by the position in the list.
 * 2. A row takes the next box when the box fits after the boxes of the row and one gap. Otherwise the box starts a new row.
 * 3. The height of a row is the outer height of its tallest box. Each next row starts one gap under the row above it.
 * 4. `justify` puts the space that is left in each row. `start`, `center` and `end` move the row. `between` puts the space
 *    between the boxes. `around` puts half a share at each side of each box. `evenly` puts equal shares at the sides and between the boxes.
 *    A row with one box and `between` keeps it at the start, as CSS does.
 * 5. `align` puts each box at the top, the middle or the bottom of its row.
 *
 * The breaks of the rows do not change with `justify` and `align`: they are the breaks of the next-fit shelf in the reading order.
 * The function has no search and no seed, so the same input gives the same layout on each machine.
 *
 * @example
 * ```ts
 * const { output, rows } = flexWrap({ container: { fixed: "width", w: 10 }, items, gap: 1 }, { justify: "between" });
 * ```
 */
export function flexWrap(input: PackInput, options: FlexWrapOptions = {}): FlexWrapResult {
  const reason = flexWrapRefusal(input);
  if (reason !== null) throw new RangeError(`flexWrap: ${reason}`);
  const justify = options.justify ?? "start";
  const align = options.align ?? "start";
  if (!FLEX_JUSTIFY.includes(justify)) throw new RangeError(`flexWrap: the justify rule "${String(justify)}" is not one of ${FLEX_JUSTIFY.join(", ")}.`);
  if (!FLEX_ALIGN.includes(align)) throw new RangeError(`flexWrap: the align rule "${String(align)}" is not one of ${FLEX_ALIGN.join(", ")}.`);
  const width = input.container.w!;
  const gap = input.gap ?? 0;

  const cells: Cell[] = input.items.map((item, index) => {
    const margin = marginOf(item);
    return { index, w: item.w + margin.left + margin.right, h: item.h + margin.top + margin.bottom, left: margin.left, top: margin.top };
  });
  const ranks = input.items.map((item, index) => item.rank ?? index);
  const order = cells.toSorted((a, b) => ranks[a.index]! - ranks[b.index]! || a.index - b.index);

  // The rows of the next-fit shelf: `used` is the width of the boxes of the row and the gaps between them.
  const lines: Cell[][] = [];
  let used = 0;
  for (const cell of order) {
    const line = lines.at(-1);
    if (line !== undefined && used + gap + cell.w <= width) {
      line.push(cell);
      used += gap + cell.w;
    } else {
      lines.push([cell]);
      used = cell.w;
    }
  }

  const placements = new Array<Placement>(cells.length);
  const free: number[] = [];
  let top = 0;
  for (const [row, line] of lines.entries()) {
    const height = Math.max(...line.map((cell) => cell.h));
    const spare = Math.max(0, width - line.reduce((sum, cell) => sum + cell.w, 0) - gap * (line.length - 1));
    free.push(spare);
    const [offset, space] = spread(justify, spare, line.length);
    let x = offset;
    for (const cell of line) {
      const drop = align === "start" ? 0 : align === "end" ? height - cell.h : (height - cell.h) / 2;
      placements[cell.index] = { id: input.items[cell.index]!.id, x: x + cell.left, y: top + drop + cell.top };
      x += cell.w + gap + space;
    }
    top += height + (row < lines.length - 1 ? gap : 0);
  }
  return { output: { placements, overflow: [], size: { w: width, h: top }, moved: [] }, rows: lines.length, free };
}

/** This function gives the offset of the first box of a row and the space that each gap gets. `spare` is the space that is left in the row. */
function spread(justify: FlexJustify, spare: number, count: number): readonly [number, number] {
  switch (justify) {
    case "start":
      return [0, 0];
    case "center":
      return [spare / 2, 0];
    case "end":
      return [spare, 0];
    case "between":
      return count === 1 ? [0, 0] : [0, spare / (count - 1)];
    case "around":
      return [spare / (2 * count), spare / count];
    case "evenly":
      return [spare / (count + 1), spare / (count + 1)];
  }
}
