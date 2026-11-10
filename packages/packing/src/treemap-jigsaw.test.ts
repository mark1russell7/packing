// The jigsaw map of Wattenberg 2005 (roadmap item k27). Each test uses made-up weights.
import { describe, expect, it } from "vitest";
import { JIGSAW_DEFAULT_MAX_SIDE, mulberry32, treemapJigsaw, type JigsawRegion, type TreemapJigsaw, type TreemapNode } from "./index.ts";

/** This function gives a made-up flat list of `count` leaves with weights from 1 to 20. */
function leaves(seed: number, count: number): TreemapNode[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({ id: `l${i}`, weight: 1 + Math.floor(random() * 20) }));
}

/** This function gives a made-up tree of depth 3. */
function tree(seed: number): TreemapNode[] {
  const random = mulberry32(seed);
  const leaf = (id: string): TreemapNode => ({ id, weight: 1 + Math.floor(random() * 30) });
  return Array.from({ length: 3 }, (_, a) => ({
    id: `b${a}`,
    children: Array.from({ length: 2 + a }, (_, b) => (b % 2 === 0 ? { id: `b${a}.${b}`, children: [leaf(`b${a}.${b}.0`), leaf(`b${a}.${b}.1`)] } : leaf(`b${a}.${b}`))),
  }));
}

/** This function gives the cells of a region. */
function cellsOf(map: TreemapJigsaw, region: JigsawRegion): (readonly [number, number])[] {
  return map.cells.slice(region.from, region.to);
}

/** This function tells that a set of cells is connected by common sides. */
function connected(cells: readonly (readonly [number, number])[]): boolean {
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>();
  const stack = [cells[0]!];
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (seen.has(key) || !keys.has(key)) continue;
    seen.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen.size === keys.size;
}

/** This function gives the largest distance between the centers of two cells of a list. */
function diameter(cells: readonly (readonly [number, number])[]): number {
  let most = 0;
  for (const [ax, ay] of cells) for (const [bx, by] of cells) most = Math.max(most, Math.hypot(ax - bx, ay - by));
  return most;
}

describe("treemapJigsaw (k27)", () => {
  it("gives each leaf a connected region with the rounded count of cells", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const nodes = leaves(seed, 5 + seed * 7);
      const map = treemapJigsaw(nodes);
      const count = map.side * map.side;
      const total = nodes.reduce((sum, node) => sum + node.weight!, 0);
      expect(map.cells.length).toBe(count);
      expect(map.regions.map((region) => region.id)).toEqual(nodes.map((node) => node.id));
      let before = 0;
      for (const [i, region] of map.regions.entries()) {
        expect(region.from).toBe(before);
        before = region.to;
        // The count error is at most one cell, and the end of each run is the rounded share of the weight before it.
        expect(Math.abs(region.to - region.from - (count * nodes[i]!.weight!) / total)).toBeLessThanOrEqual(1);
        expect(Math.abs(region.to - (count * nodes.slice(0, i + 1).reduce((sum, node) => sum + node.weight!, 0)) / total)).toBeLessThanOrEqual(0.5);
        expect(connected(cellsOf(map, region)), region.id).toBe(true);
      }
      expect(before).toBe(count);
    }
  });

  it("gives two leaves in a row regions with a common side (order adjacency)", () => {
    const map = treemapJigsaw(leaves(7, 40));
    for (let i = 1; i < map.regions.length; i += 1) {
      const [ax, ay] = map.cells[map.regions[i - 1]!.to - 1]!;
      const [bx, by] = map.cells[map.regions[i]!.from]!;
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });

  it("changes each region by two cells at most when one cell moves from a leaf to another leaf (stability)", () => {
    // The weights are counts of cells with the sum 16 x 16, as in the paper. Thus no count rounds.
    const counts = [40, 7, 61, 1, 30, 52, 9, 56];
    const nodes = counts.map((weight, i) => ({ id: `c${i}`, weight }));
    const map = treemapJigsaw(nodes, { side: 16 });
    expect(map.regions.map((region) => region.to - region.from)).toEqual(counts);
    for (const [i, j] of [[0, 7], [2, 3], [6, 1]] as const) {
      const moved = nodes.map((node, k) => ({ ...node, weight: node.weight + (k === i ? -1 : k === j ? 1 : 0) }));
      const after = treemapJigsaw(moved, { side: 16 });
      for (const [k, region] of map.regions.entries()) {
        const old = new Set(cellsOf(map, region).map((cell) => cell.join()));
        const fresh = new Set(cellsOf(after, after.regions[k]!).map((cell) => cell.join()));
        const changed = [...old].filter((key) => !fresh.has(key)).length + [...fresh].filter((key) => !old.has(key)).length;
        expect(changed, `${i} to ${j}, region ${k}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("keeps the cells of each other leaf when a leaf splits in two (split neutrality)", () => {
    const nodes = leaves(8, 20).map((node) => ({ ...node, weight: node.weight! * 2 }));
    const side = 64;
    const map = treemapJigsaw(nodes, { side });
    const split = [...nodes.slice(0, 9), { id: "l9a", weight: nodes[9]!.weight! / 2 }, { id: "l9b", weight: nodes[9]!.weight! / 2 }, ...nodes.slice(10)];
    const after = treemapJigsaw(split, { side });
    const byId = new Map(after.regions.map((region) => [region.id, region]));
    for (const region of map.regions) {
      if (region.id === "l9") {
        expect([byId.get("l9a")!.from, byId.get("l9b")!.to]).toEqual([region.from, region.to]);
      } else {
        expect([byId.get(region.id)!.from, byId.get(region.id)!.to], region.id).toEqual([region.from, region.to]);
      }
    }
  });

  it("keeps each region in a disk of a diameter of 6 times the root of its count (c-locality)", () => {
    for (const seed of [11, 12, 13]) {
      const map = treemapJigsaw(leaves(seed, 30), { side: 64 });
      for (const region of map.regions) {
        expect(diameter(cellsOf(map, region)), region.id).toBeLessThanOrEqual(6 * Math.sqrt(region.to - region.from));
      }
    }
  });

  it("gives each branch the cells of its leaves, in the depth-first order", () => {
    for (const seed of [21, 22]) {
      const map = treemapJigsaw(tree(seed));
      const ids = map.regions.map((region) => region.id);
      expect(ids.slice(0, 4)).toEqual(["b0", "b0.0", "b0.0.0", "b0.0.1"]);
      for (const region of map.regions) {
        expect(region.depth).toBe(region.id.split(".").length - 1);
        expect(region.to).toBeGreaterThan(region.from);
        expect(connected(cellsOf(map, region)), region.id).toBe(true);
        // A branch starts at its first child and ends at its last child.
        const kids = map.regions.filter((other) => other.id.startsWith(`${region.id}.`) && other.depth === region.depth + 1);
        if (kids.length > 0) expect([kids[0]!.from, kids.at(-1)!.to]).toEqual([region.from, region.to]);
      }
    }
  });

  it("gives each leaf one cell or more, also a light leaf on a small grid", () => {
    const nodes: TreemapNode[] = [{ id: "a", weight: 1000 }, { id: "b", weight: 0.001 }, { id: "c", weight: 0.001 }, { id: "d", weight: 1000 }];
    const map = treemapJigsaw(nodes, { side: 2 });
    expect(map.regions.map((region) => region.to - region.from)).toEqual([1, 1, 1, 1]);
    const wide = treemapJigsaw(nodes);
    expect(wide.side).toBe(JIGSAW_DEFAULT_MAX_SIDE);
    expect(wide.regions.every((region) => region.to - region.from >= 1)).toBe(true);
  });

  it("chooses the smallest side that gives each leaf a cell by its weight", () => {
    expect(treemapJigsaw([{ id: "a", weight: 1 }]).side).toBe(1);
    expect(treemapJigsaw(Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, weight: 3 }))).side).toBe(2);
    expect(treemapJigsaw(Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, weight: 3 }))).side).toBe(4);
    // The light leaf has 1 part in 61 of the weight: 8 x 8 = 64 cells give it one cell.
    expect(treemapJigsaw([{ id: "a", weight: 60 }, { id: "b", weight: 1 }]).side).toBe(8);
  });

  it("gives the same map on each call, and an empty map for no nodes", () => {
    const nodes = tree(31);
    expect(treemapJigsaw(nodes)).toEqual(treemapJigsaw(nodes));
    expect(treemapJigsaw([])).toEqual({ side: 1, cells: [], regions: [] });
  });

  it("refuses a bad weight, an empty branch and a bad side", () => {
    const nodes = leaves(41, 5);
    expect(() => treemapJigsaw([{ id: "z", weight: 0 }])).toThrow(RangeError);
    expect(() => treemapJigsaw([{ id: "z", weight: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
    expect(() => treemapJigsaw([{ id: "z", children: [] }])).toThrow(RangeError);
    for (const side of [0, 3, 1.5, -4, 2048, Number.NaN]) expect(() => treemapJigsaw(nodes, { side }), String(side)).toThrow(RangeError);
    expect(() => treemapJigsaw(nodes, { side: 2 })).toThrow(/fewer than the 5 leaves/);
  });
});
