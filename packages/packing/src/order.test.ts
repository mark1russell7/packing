import { describe, expect, it } from "vitest";
import { compareRects, graphOrder, isGraphOrder, orderRects, SORT_ORDERS, sortKey, type ItemLink, type ItemOrder, type SortOrder } from "./order.ts";
import { mulberry32 } from "./index.ts";
import { pack } from "./pack.ts";
import { Rect } from "./rect.ts";
import { memberOrder } from "./restarts.ts";

/** This function makes rectangles of the sizes `[w, h]`, with the index as the id. */
function rects(sizes: readonly (readonly [number, number])[]): Rect<number>[] {
  return sizes.map(([w, h], i) => {
    const r = new Rect<number>();
    r.size.set(w, h);
    r.id = i;
    return r;
  });
}

const SIZES = [
  [4, 4],
  [10, 10],
  [2, 2],
  [6, 6],
  [8, 8],
  [3, 3],
] as const;

describe("graphOrder", () => {
  it("gives area-desc without links", () => {
    const r = rects(SIZES);
    expect(graphOrder(r)).toEqual(orderRects(r, "area-desc").map((x) => x.id));
  });

  it("starts at the hub and goes breadth-first, with the neighbours by area", () => {
    // The hub 2 has 3 links. Its neighbours 0, 3 and 5 come by area: 3 (36), 0 (16), 5 (9). Then 4 from 3, then 1 alone.
    const links: ItemLink[] = [
      { a: 2, b: 0 },
      { a: 2, b: 3 },
      { a: 5, b: 2 },
      { a: 3, b: 4 },
    ];
    expect(graphOrder(rects(SIZES), links)).toEqual([2, 3, 0, 5, 4, 1]);
  });

  it("ranks the hub by the sum of the weights, and starts each component at its own hub", () => {
    // Component {0, 1}: the weights give 0 and 1 the sum 5. Component {2, 3, 4}: 3 has the sum 2, the others 1.
    const links: ItemLink[] = [
      { a: 0, b: 1, weight: 5 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
    ];
    // 1 is larger than 0, so 1 is the hub. Then the hub 3 of the second component, and its neighbours 4 (64) and 2 (4). Then 5 alone.
    expect(graphOrder(rects(SIZES), links)).toEqual([1, 0, 3, 4, 2, 5]);
  });

  it("ignores a link of an item to itself, and a second copy of a link", () => {
    const links: ItemLink[] = [
      { a: 0, b: 0, weight: 9 },
      { a: 0, b: 2 },
      { a: 2, b: 0 },
    ];
    expect(graphOrder(rects(SIZES), links)).toEqual([0, 2, 1, 4, 3, 5]);
  });

  it("refuses a link outside the items, and a weight that is not above 0", () => {
    const r = rects(SIZES);
    expect(() => graphOrder(r, [{ a: 0, b: 6 }])).toThrow(RangeError);
    expect(() => graphOrder(r, [{ a: -1, b: 2 }])).toThrow(RangeError);
    expect(() => graphOrder(r, [{ a: 0.5, b: 2 }])).toThrow(RangeError);
    expect(() => graphOrder(r, [{ a: 0, b: 2, weight: 0 }])).toThrow(RangeError);
    expect(() => graphOrder(r, [{ a: 0, b: 2, weight: Number.NaN }])).toThrow(RangeError);
  });
});

describe("orderRects", () => {
  it("gives the sort of compareRects for each sort order, and ignores the links", () => {
    const links: ItemLink[] = [{ a: 2, b: 0 }];
    for (const order of ["height-desc", "height-asc", "width-desc", "area-desc", "input"] as const) {
      const r = rects(SIZES);
      expect(orderRects(r, order, links).map((x) => x.id)).toEqual(orderRects(r, order).map((x) => x.id));
    }
    expect(isGraphOrder("graph-bfs")).toBe(true);
    expect(isGraphOrder("area-desc")).toBe(false);
  });
});

describe("pack with a graph order", () => {
  const links: ItemLink[] = [
    { a: 2, b: 0 },
    { a: 2, b: 3 },
    { a: 5, b: 2 },
    { a: 3, b: 4 },
  ];
  for (const strategy of ["rows", "skyline", "shelf", "maxrects", "guillotine"] as const) {
    it(`places each rectangle with ${strategy}, and gives the layout of area-desc without links`, () => {
      const run = (order: ItemOrder, l?: readonly ItemLink[]): string => {
        const r = rects(SIZES);
        const outer = new Rect<number>();
        outer.size.set(20, 0);
        outer.fixedWidth = true;
        pack(r, outer, { strategy, sortOrder: order, ...(l !== undefined ? { links: l } : {}) });
        expect(r.every((x) => x.wasPacked || strategy === "rows")).toBe(true);
        return JSON.stringify(r.map((x) => [x.position.x, x.position.y]));
      };
      expect(run("graph-bfs")).toBe(run("area-desc"));
      expect(() => run("graph-bfs", links)).not.toThrow();
    });
  }
});

/** The sizes `[w, h]` of the direct tests of the sort keys. */
const SHAPES = [
  [2, 9],
  [6, 6],
  [10, 1],
  [3, 4],
  [8, 2],
] as const;

/** This function gives the ids of the shapes `SHAPES` in a sort order. */
const idsOf = (order: SortOrder): readonly number[] => orderRects(rects(SHAPES), order).map((r) => r.id!);

/** This function gives made-up sizes from a seed, with many equal sides. */
function drawnSizes(seed: number, count: number): [number, number][] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => [1 + Math.floor(random() * 12), 1 + Math.floor(random() * 12)] as [number, number]);
}

describe("the sort keys of roadmap item k210", () => {
  it("gives the order of each new key on hand-made shapes", () => {
    // Perimeters (w + h): 11, 12, 11, 7, 10. Longer sides: 9, 6, 10, 4, 8. Shorter sides: 2, 6, 1, 3, 2.
    expect(idsOf("perimeter-desc")).toEqual([1, 0, 2, 4, 3]);
    expect(idsOf("long-side-desc")).toEqual([2, 0, 4, 1, 3]);
    expect(idsOf("short-side-desc")).toEqual([1, 3, 0, 4, 2]);
    // Side differences: 7, 0, 9, 1, 6. Ratios: 4.5, 1, 10, 1.33, 4. Squared diagonals: 85, 72, 101, 25, 68.
    expect(idsOf("side-diff-desc")).toEqual([2, 0, 4, 3, 1]);
    expect(idsOf("ratio-desc")).toEqual([2, 0, 4, 3, 1]);
    expect(idsOf("diagonal-desc")).toEqual([2, 0, 1, 4, 3]);
  });

  it("keeps the input order on equal keys, and puts a box with a side of 0 first in ratio-desc", () => {
    expect(orderRects(rects([[3, 4], [4, 3], [2, 5]]), "perimeter-desc").map((r) => r.id)).toEqual([0, 1, 2]);
    expect(orderRects(rects([[3, 4], [4, 3], [2, 5]]), "diagonal-desc").map((r) => r.id)).toEqual([2, 0, 1]);
    expect(orderRects(rects([[4, 2], [5, 0], [9, 1]]), "ratio-desc").map((r) => r.id)).toEqual([1, 2, 0]);
    expect(sortKey("ratio-desc", 0, 3)).toBe(Number.MAX_VALUE);
    expect(sortKey("input", 7, 9)).toBe(0);
  });

  it("gives each key of the old orders the old comparator", () => {
    const old: Record<string, (a: Rect<number>, b: Rect<number>) => number> = {
      "height-desc": (a, b) => b.size.y - a.size.y,
      "height-asc": (a, b) => a.size.y - b.size.y,
      "width-desc": (a, b) => b.size.x - a.size.x,
      "area-desc": (a, b) => b.area() - a.area(),
      input: () => 0,
    };
    for (let seed = 1; seed <= 200; seed++) {
      const r = rects(drawnSizes(seed, 30));
      for (const [order, compare] of Object.entries(old)) expect(r.toSorted(compareRects(order as SortOrder)).map((x) => x.id), `${order} ${seed}`).toEqual(r.toSorted(compare).map((x) => x.id));
    }
  });

  it("gives one order for a box and its turned copy under each key with no axis, on 200 made-up sets", () => {
    const symmetric: readonly SortOrder[] = ["area-desc", "perimeter-desc", "long-side-desc", "short-side-desc", "side-diff-desc", "ratio-desc", "diagonal-desc"];
    let unequal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sizes = drawnSizes(seed, 30);
      for (const order of symmetric) {
        const plain = orderRects(rects(sizes), order).map((r) => r.id);
        const turned = orderRects(rects(sizes.map(([w, h]) => [h, w] as const)), order).map((r) => r.id);
        if (JSON.stringify(plain) !== JSON.stringify(turned)) unequal++;
      }
    }
    expect(unequal).toBe(0);
  });

  it("gives the order of orderRects to memberOrder of restarts, for each sort order on 200 made-up inputs", () => {
    let unequal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sizes = drawnSizes(seed, 25);
      const items = sizes.map(([w, h], i) => ({ id: `i${i}`, w, h }));
      for (const order of SORT_ORDERS) {
        const want = orderRects(rects(sizes), order).map((r) => `i${r.id}`);
        const got = memberOrder({ container: { fixed: "width", w: 100 }, items }, order).map((k) => k.item.id);
        if (JSON.stringify(want) !== JSON.stringify(got)) unequal++;
      }
    }
    expect(unequal).toBe(0);
  });

  it("places each rectangle with each sort order", () => {
    for (const order of SORT_ORDERS) {
      const r = rects(drawnSizes(3, 40));
      const outer = new Rect<number>();
      outer.size.set(40, 0);
      outer.fixedWidth = true;
      pack(r, outer, { strategy: "skyline", sortOrder: order });
      expect(r.every((x) => x.wasPacked), order).toBe(true);
    }
  });
});
