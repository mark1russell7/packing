import { describe, expect, it } from "vitest";
import { treemapOrdered, treemapSpatial, type SpatialNode } from "./index.ts";

const box = (cell: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): number[] => [cell.x, cell.y, cell.w, cell.h].map((v) => Math.round(v * 1e9) / 1e9);

describe("treemapOrdered", () => {
  it("gives 16 equal nodes in a square of side 4 the cells of the steps of the paper", () => {
    // The places have the spacing 1. In the order of the distance from (0, 0), nodes 0, 1, 4 and 9 get (0, 0), (0, 1),
    // (0, 2) and (0, 3). The first row is a column, so the position moves down, and those four nodes fill the column at x = 0.
    // With node 11, the worst aspect of the column gets higher, so the column closes. The other nodes get new places.
    const nodes = Array.from({ length: 16 }, (_, index) => ({ id: `n${index}`, weight: 1 }));
    const cells = treemapOrdered(nodes, { x: 0, y: 0, w: 4, h: 4 });
    expect(cells.map((cell) => [cell.id, cell.x, cell.y])).toEqual([
      ["n0", 0, 0],
      ["n1", 0, 1],
      ["n2", 1, 0],
      ["n3", 2, 0],
      ["n4", 0, 2],
      ["n5", 1, 1],
      ["n6", 1, 2],
      ["n7", 3, 0],
      ["n8", 2, 1],
      ["n9", 0, 3],
      ["n10", 3, 1],
      ["n11", 1, 3],
      ["n12", 2, 2],
      ["n13", 2, 3],
      ["n14", 3, 2],
      ["n15", 3, 3],
    ]);
    for (const cell of cells) expect([cell.w, cell.h]).toEqual([1, 1]);
  });

  it("puts the first node of the list at the corner of the frame", () => {
    const nodes = [5, 1, 3, 2, 8, 1, 1, 4].map((weight, index) => ({ id: `n${index}`, weight }));
    const cell = treemapOrdered(nodes, { x: 10, y: 20, w: 90, h: 50 })[0]!;
    expect([cell.x, cell.y]).toEqual([10, 20]);
  });

  it("gives a distance from the corner that grows with the place in the list", () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({ id: `n${index}`, weight: 1 }));
    const cells = treemapOrdered(nodes, { x: 0, y: 0, w: 100, h: 100 });
    const distance = cells.map((cell) => Math.hypot(cell.x + cell.w / 2, cell.y + cell.h / 2));
    const first = distance.slice(0, 25).reduce((sum, d) => sum + d, 0) / 25;
    const last = distance.slice(75).reduce((sum, d) => sum + d, 0) / 25;
    expect(last).toBeGreaterThan(2 * first);
  });
});

describe("treemapSpatial", () => {
  it("gives four equal nodes at the corners of a square the four quarters", () => {
    const nodes: SpatialNode[] = [
      { id: "nw", weight: 1, x: 0, y: 0 },
      { id: "ne", weight: 1, x: 10, y: 0 },
      { id: "sw", weight: 1, x: 0, y: 10 },
      { id: "se", weight: 1, x: 10, y: 10 },
    ];
    expect(treemapSpatial(nodes, { x: 0, y: 0, w: 2, h: 2 }).map((cell) => [cell.id, ...box(cell)])).toEqual([
      ["nw", 0, 0, 1, 1],
      ["ne", 1, 0, 1, 1],
      ["sw", 0, 1, 1, 1],
      ["se", 1, 1, 1, 1],
    ]);
  });

  it("keeps the order of the points along the long side of a wide frame", () => {
    const nodes: SpatialNode[] = [3, 0, 4, 1, 2].map((x, index) => ({ id: `n${index}`, weight: 1, x, y: 0 }));
    const cells = treemapSpatial(nodes, { x: 0, y: 0, w: 50, h: 10 });
    const byX = [...cells].sort((a, b) => a.x - b.x).map((cell) => cell.id);
    expect(byX).toEqual(["n1", "n3", "n4", "n0", "n2"]);
  });

  it("gives the same cells for points with another scale and offset", () => {
    const base: SpatialNode[] = [
      { id: "a", weight: 3, x: 1, y: 2 },
      { id: "b", weight: 1, x: 4, y: 1 },
      { id: "c", weight: 2, x: 2, y: 5 },
      { id: "d", weight: 5, x: 5, y: 4 },
      { id: "e", weight: 1, x: 3, y: 3 },
    ];
    const moved = base.map((node) => ({ ...node, x: node.x! * 1000 - 7, y: node.y! * 0.01 + 40 }));
    const frame = { x: 0, y: 0, w: 120, h: 80 };
    expect(treemapSpatial(moved, frame).map(box)).toEqual(treemapSpatial(base, frame).map(box));
  });

  it("gives a branch the weighted mean point of its children, or its own point", () => {
    // The branch "w" has its children at x = 0 and x = 1 with weights 3 and 1: its point is x = 0.25, left of "e".
    const tree: SpatialNode[] = [
      { id: "e", weight: 4, x: 1, y: 0 },
      { id: "w", children: [{ id: "w1", weight: 3, x: 0, y: 0 }, { id: "w2", weight: 1, x: 1, y: 0 }] },
    ];
    const cells = treemapSpatial(tree, { x: 0, y: 0, w: 20, h: 10 });
    const e = cells.find((cell) => cell.id === "e")!;
    expect(e.x).toBe(10);
    for (const id of ["w1", "w2"]) expect(cells.find((cell) => cell.id === id)!.x).toBeLessThan(10);
    // A point of the branch at x = 2 puts it right of "e".
    const given: SpatialNode[] = [tree[0]!, { ...tree[1]!, x: 2, y: 0 } as SpatialNode];
    expect(treemapSpatial(given, { x: 0, y: 0, w: 20, h: 10 }).find((cell) => cell.id === "e")!.x).toBe(0);
  });

  it("gives finite cells when all the points are equal", () => {
    const nodes: SpatialNode[] = [1, 2, 3].map((weight, index) => ({ id: `n${index}`, weight, x: 5, y: 5 }));
    for (const cell of treemapSpatial(nodes, { x: 0, y: 0, w: 30, h: 20 })) expect(box(cell).every(Number.isFinite)).toBe(true);
  });

  it("refuses a point that is not finite, and a branch with only x", () => {
    expect(() => treemapSpatial([{ id: "a", weight: 1, x: Number.NaN, y: 0 }], { x: 0, y: 0, w: 1, h: 1 })).toThrow(RangeError);
    expect(() => treemapSpatial([{ id: "a", weight: 1, x: 0, y: Infinity }], { x: 0, y: 0, w: 1, h: 1 })).toThrow(RangeError);
    expect(() => treemapSpatial([{ id: "b", x: 1, children: [{ id: "a", weight: 1, x: 0, y: 0 }] }], { x: 0, y: 0, w: 1, h: 1 })).toThrow(RangeError);
    expect(() => treemapSpatial([{ id: "b", x: 1, y: Number.NaN, children: [{ id: "a", weight: 1, x: 0, y: 0 }] }], { x: 0, y: 0, w: 1, h: 1 })).toThrow(RangeError);
  });
});
