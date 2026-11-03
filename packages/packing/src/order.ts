import type { PackLink } from "@mark1russell7/layout-contract";
import type { Rect } from "./rect.ts";

/**
 * An order of the rectangles before the packing. The order changes the layout much. `input` keeps the order of
 * the array of the caller: the row packing then fills no gaps, so its rows read in that order.
 */
export type SortOrder = "height-desc" | "height-asc" | "width-desc" | "area-desc" | "input";

/** This constant lists each sort order. The first one is the default. */
export const SORT_ORDERS: readonly SortOrder[] = ["height-desc", "height-asc", "width-desc", "area-desc", "input"];

/** This function gives the comparator of a sort order. The sort is stable, so `input` keeps the order. */
export function compareRects(order: SortOrder): <T>(a: Rect<T>, b: Rect<T>) => number {
  switch (order) {
    case "height-desc":
      return (a, b) => b.size.y - a.size.y;
    case "height-asc":
      return (a, b) => a.size.y - b.size.y;
    case "width-desc":
      return (a, b) => b.size.x - a.size.x;
    case "area-desc":
      return (a, b) => b.area() - a.area();
    case "input":
      return () => 0;
  }
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
  const n = rects.length;
  const degree = new Float64Array(n);
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const { a, b, weight = 1 } of links) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) {
      throw new RangeError(`A link joins the items ${a} and ${b}, but the indexes go from 0 to ${n - 1}.`);
    }
    if (!Number.isFinite(weight) || weight <= 0) throw new RangeError(`The weight of a link is a finite number above 0, not ${weight}.`);
    if (a === b) continue;
    degree[a] = degree[a]! + weight;
    degree[b] = degree[b]! + weight;
    next[a]!.push(b);
    next[b]!.push(a);
  }
  const area = rects.map((r) => r.area());
  const byArea = (i: number, j: number): number => area[j]! - area[i]! || i - j;
  const hubs = Array.from({ length: n }, (_, i) => i).sort((i, j) => degree[j]! - degree[i]! || byArea(i, j));
  const seen = new Uint8Array(n);
  const out: number[] = [];
  for (const hub of hubs) {
    if (seen[hub] === 1) continue;
    seen[hub] = 1;
    const queue = [hub];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      out.push(i);
      for (const j of next[i]!.toSorted(byArea)) {
        if (seen[j] === 1) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return out;
}

/**
 * This function gives a copy of the rectangles in an order. A sort order gives the stable sort of `compareRects`. A
 * graph order gives `graphOrder` of `rects` and `links`.
 */
export function orderRects<T>(rects: readonly Rect<T>[], order: ItemOrder, links?: readonly ItemLink[]): Rect<T>[] {
  if (!isGraphOrder(order)) return rects.toSorted(compareRects(order));
  return graphOrder(rects, links).map((i) => rects[i]!);
}
