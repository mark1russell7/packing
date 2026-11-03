import { describe, expect, it } from "vitest";
import { graphOrder, isGraphOrder, orderRects, type ItemLink, type ItemOrder } from "./order.ts";
import { pack } from "./pack.ts";
import { Rect } from "./rect.ts";

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
