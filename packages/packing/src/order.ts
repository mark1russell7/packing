import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";
import type { PackLink } from "@mark1russell7/layout-contract";
import type { Rect } from "./rect.ts";

/**
 * An order of the rectangles before the packing. The order changes the layout much. `input` keeps the order of
 * the array of the caller: the row packing then fills no gaps, so its rows read in that order.
 *
 * - The keys `perimeter-desc`, `long-side-desc`, `short-side-desc`, `side-diff-desc` and `ratio-desc` come from
 *   Jylänki 2010 (roadmap item k210). `diagonal-desc` sorts by the length of the diagonal.
 * - Each key of a sort order gives the item with the larger key first. Equal keys keep the input order.
 */
export type SortOrder =
  | "height-desc"
  | "height-asc"
  | "width-desc"
  | "area-desc"
  | "perimeter-desc"
  | "long-side-desc"
  | "short-side-desc"
  | "side-diff-desc"
  | "ratio-desc"
  | "diagonal-desc"
  | "input";

/** This constant lists each sort order. The first one is the default. */
export const SORT_ORDERS: readonly SortOrder[] = [
  "height-desc",
  "height-asc",
  "width-desc",
  "area-desc",
  "perimeter-desc",
  "long-side-desc",
  "short-side-desc",
  "side-diff-desc",
  "ratio-desc",
  "diagonal-desc",
  "input",
];

/** The key of each sort order from the width `w` and the height `h`. The item with the larger key comes first. */
const KEYS: Readonly<Record<SortOrder, (w: number, h: number) => number>> = {
  "height-desc": (_w, h) => h,
  "height-asc": (_w, h) => -h,
  "width-desc": (w) => w,
  "area-desc": (w, h) => w * h,
  "perimeter-desc": (w, h) => w + h,
  "long-side-desc": (w, h) => Math.max(w, h),
  "short-side-desc": (w, h) => Math.min(w, h),
  "side-diff-desc": (w, h) => Math.abs(w - h),
  "ratio-desc": (w, h) => (Math.min(w, h) > 0 ? Math.max(w, h) / Math.min(w, h) : Number.MAX_VALUE),
  "diagonal-desc": (w, h) => w * w + h * h,
  input: () => 0,
};

/**
 * This function gives the key of a sort order for a box of the width `w` and the height `h`. The item with the larger key
 * comes first. The key of `input` is 0 for each box. The key of `ratio-desc` is the longer side over the shorter side, and
 * `Number.MAX_VALUE` for a side of 0. The keys of `perimeter-desc` and `diagonal-desc` keep the order of the perimeter
 * and of the diagonal: they are `w + h` and `w * w + h * h`.
 */
export function sortKey(order: SortOrder, w: number, h: number): number {
  return KEYS[order](w, h);
}

/** This function gives the comparator of a sort order. The sort is stable, so `input` and equal keys keep the order. */
export function compareRects(order: SortOrder): <T>(a: Rect<T>, b: Rect<T>) => number {
  const key = KEYS[order];
  return (a, b) => key(b.size.x, b.size.y) - key(a.size.x, a.size.y);
}

/**
 * This function gives items in a window order (the idea `new-rank-window`, roadmap item k31). Each step takes the tallest
 * of the next `window` items that remain, and the first of them on a tie. A `window` of 1 keeps the input order, and a
 * `window` of the item count gives the sort `height-desc`. No item comes more than `window - 1` places before its input
 * place. The function does not change its argument.
 *
 * @throws RangeError for a `window` that is not a whole number above 0.
 */
export function windowOrder<T extends { readonly h: number }>(items: readonly T[], window: number): T[] {
  if (!Number.isInteger(window) || window < 1) throw new RangeError("A window is a whole number above 0.");
  const left = items.slice();
  const out: T[] = [];
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < Math.min(window, left.length); i++) if (left[i]!.h > left[best]!.h) best = i;
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/**
 * A link between two items: the `PackLink` of `@mark1russell7/layout-contract`. `a` and `b` are indexes into the
 * array of the items. The weight is a finite number above 0. The default weight is 1.
 */
export type ItemLink = PackLink;

/**
 * An order that reads the links of the items. `graph-bfs` starts at the item with the largest sum of link weights and
 * goes breadth-first. Each next component starts at its own hub.
 */
export type GraphOrder = "graph-bfs";

/** This constant lists each graph order. */
export const GRAPH_ORDERS: readonly GraphOrder[] = ["graph-bfs"];

/** An order of the items: a sort order, or a graph order. */
export type ItemOrder = SortOrder | GraphOrder;

/** This function tells if an order is a graph order. */
export function isGraphOrder(order: ItemOrder): order is GraphOrder {
  return (GRAPH_ORDERS as readonly string[]).includes(order);
}

/**
 * This function gives the order `graph-bfs` of the rectangles, as indexes into `rects`.
 *
 * - The hub of a component is the rectangle with the largest sum of link weights. Ties go to the larger area, then to the lower index.
 * - From the hub, the order goes breadth-first. The neighbours of a rectangle are in the order of their area, the largest first.
 * - Without links, each rectangle is a component, so the order is `area-desc`.
 * - A link with an index outside `rects`, or with a weight that is not a finite number above 0, throws a `RangeError`.
 */
export function graphOrder<T>(rects: readonly Rect<T>[], links: readonly ItemLink[] = []): number[] {
  return graphOrderOf(rects.map((r) => r.area()), links);
}

/** This function gives the order `graph-bfs` of items with these areas, as indexes. `graphOrder` tells the rules. */
export function graphOrderOf(area: readonly number[], links: readonly ItemLink[] = []): number[] {
  return hubBreadthFirstOrder(area.length, links, (i, j) => area[j]! - area[i]!);
}

/**
 * This function gives a copy of the rectangles in an order. A sort order gives the stable sort of `compareRects`. A
 * graph order gives `graphOrder` of `rects` and `links`.
 */
export function orderRects<T>(rects: readonly Rect<T>[], order: ItemOrder, links?: readonly ItemLink[]): Rect<T>[] {
  if (!isGraphOrder(order)) return rects.toSorted(compareRects(order));
  return graphOrder(rects, links).map((i) => rects[i]!);
}
