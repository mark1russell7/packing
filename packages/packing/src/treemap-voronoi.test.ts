// The Voronoi treemap of roadmap item k27 (Nocaj and Brandes 2012). Each test uses made-up inputs.
import { pointInRing, regionArea, type Ring } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkHard, mulberry32, outputHash, treemapVoronoi, treemapVoronoiPack, TREEMAP_VORONOI_DEFAULTS, type PackInput, type TreemapNode } from "./index.ts";

/** The count of each hard rule that a valid layout breaks. */
const ZERO = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

const RECT: Ring = [
  [0, 0],
  [2, 0],
  [2, 1],
  [0, 1],
];

const areaOf = (ring: Ring): number => regionArea({ kind: "polygon", points: ring });

/** This function gives the signed area of a ring. A cell of the treemap has a positive signed area. */
function signedArea(ring: Ring): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    twice += ax * by - bx * ay;
  }
  return twice / 2;
}

/** This function tells if each corner of a ring turns left or goes straight on. */
function convex(ring: Ring): boolean {
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const [cx, cy] = ring[(i + 2) % ring.length]!;
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) < -1e-9) return false;
  }
  return true;
}

/** This function gives `count` made-up leaves with weights from a power law (Pareto with the exponent `alpha`). */
function leaves(seed: number, count: number, alpha = 1.5): TreemapNode[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({ id: `n${i}`, weight: (1 - random()) ** (-1 / alpha) }));
}

/** This function gives the area error of the paper for the cells of one level. */
function areaError(cells: readonly { readonly ring: Ring }[], nodes: readonly TreemapNode[], region: Ring): number {
  const total = nodes.reduce((sum, node) => sum + node.weight!, 0);
  const area = areaOf(region);
  let sum = 0;
  for (const [i, cell] of cells.entries()) sum += Math.abs(areaOf(cell.ring) - (area * nodes[i]!.weight!) / total);
  return sum / (2 * area);
}

describe("treemapVoronoi (k27)", () => {
  it("cuts the region into one convex cell for each leaf, with no gap and no overlap", () => {
    for (const count of [2, 3, 7, 20, 50]) {
      for (const seed of [1, 2, 3]) {
        const nodes = leaves(seed * 100 + count, count);
        const cells = treemapVoronoi(nodes, RECT, { seed });
        expect(cells.map((cell) => cell.id)).toEqual(nodes.map((node) => node.id));
        for (const cell of cells) {
          expect(signedArea(cell.ring), cell.id).toBeGreaterThan(0);
          expect(convex(cell.ring), cell.id).toBe(true);
          for (const [x, y] of cell.ring) expect(x >= -1e-9 && x <= 2 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9, cell.id).toBe(true);
        }
        expect(cells.reduce((sum, cell) => sum + areaOf(cell.ring), 0)).toBeCloseTo(2, 9);
        // Each made-up point is in exactly one cell.
        const random = mulberry32(seed);
        for (let k = 0; k < 50; k++) {
          const x = 2 * random();
          const y = random();
          expect(cells.filter((cell) => pointInRing(x, y, cell.ring)).length).toBe(1);
        }
      }
    }
  });

  it("gives each cell the share of its weight, up to the error of the paper", () => {
    // With weights near each other, the error goes below the threshold of 0.01.
    for (const seed of [1, 2, 3, 4, 5]) {
      const nodes = leaves(seed, 30, 20);
      expect(areaError(treemapVoronoi(nodes, RECT, { seed }), nodes, RECT), `seed ${seed}`).toBeLessThan(TREEMAP_VORONOI_DEFAULTS.threshold);
    }
  });

  it("keeps the area error of the setting of Figure 7 of the paper", () => {
    // 50 weights from a power law in a 2x1 rectangle. In bench/treemap-literature.ts, 100 instances after 300 iterations
    // gave a median error of 0.0150 and a maximum of 0.0658. The radius of a site stops at its nearest site (Figure 3b of
    // the paper), so a large weight next to small weights keeps an error. This test pins the errors of 5 instances.
    const errors = [1, 2, 3, 4, 5].map((k) => {
      const nodes = leaves(1000 + k, 50);
      return areaError(treemapVoronoi(nodes, RECT, { seed: k, threshold: 0 }), nodes, RECT);
    });
    for (const error of errors) expect(error).toBeLessThan(0.08);
    expect(errors.filter((error) => error < 0.02).length).toBeGreaterThanOrEqual(3);
  });

  it("puts the leaves of a branch in the cell of the branch", () => {
    const tree: TreemapNode[] = [
      { id: "a", children: leaves(7, 6, 20).map((node) => ({ ...node, id: `a-${node.id}` })) },
      { id: "b", children: leaves(8, 4, 20).map((node) => ({ ...node, id: `b-${node.id}` })) },
      { id: "c", weight: 3 },
    ];
    const cells = treemapVoronoi(tree, RECT, { seed: 4 });
    expect(cells.map((cell) => cell.id.split("-")[0])).toEqual([..."aaaaaabbbbc"]);
    expect(cells.reduce((sum, cell) => sum + areaOf(cell.ring), 0)).toBeCloseTo(2, 9);
    // The leaves of a branch fill a convex cell: the cells of the other branches have no corner inside it.
    const a = cells.filter((cell) => cell.id.startsWith("a-"));
    const rest = cells.filter((cell) => !cell.id.startsWith("a-"));
    for (const cell of rest) {
      const [x, y] = cell.ring.reduce(([sx, sy], [px, py]) => [sx + px / cell.ring.length, sy + py / cell.ring.length], [0, 0]);
      expect(a.some((leaf) => pointInRing(x, y, leaf.ring)), cell.id).toBe(false);
    }
  });

  it("gives the region to a single leaf, and no cell to no node", () => {
    expect(treemapVoronoi([{ id: "x", weight: 2 }], RECT)).toEqual([{ id: "x", ring: RECT }]);
    expect(treemapVoronoi([], RECT)).toEqual([]);
  });

  it("takes a region in each direction of turn, and a triangle", () => {
    const clockwise = [...RECT].reverse();
    const nodes = leaves(3, 8, 20);
    expect(treemapVoronoi(nodes, clockwise)).toEqual(treemapVoronoi(nodes, RECT));
    const triangle: Ring = [
      [0, 0],
      [4, 0],
      [1, 3],
    ];
    const cells = treemapVoronoi(nodes, triangle);
    expect(cells.reduce((sum, cell) => sum + areaOf(cell.ring), 0)).toBeCloseTo(6, 9);
  });

  it("gives the same cells for the same seed, and other cells for another seed", () => {
    const nodes = leaves(9, 12);
    expect(treemapVoronoi(nodes, RECT, { seed: 5 })).toEqual(treemapVoronoi(nodes, RECT, { seed: 5 }));
    expect(treemapVoronoi(nodes, RECT, { seed: 5 })).not.toEqual(treemapVoronoi(nodes, RECT, { seed: 6 }));
  });

  it("refuses a bad region, a bad weight and bad options", () => {
    const nodes = leaves(1, 3);
    const concave: Ring = [
      [0, 0],
      [2, 0],
      [1, 0.5],
      [2, 1],
      [0, 1],
    ];
    const star: Ring = [0, 1, 2, 3, 4].map((k) => [Math.cos((4 * Math.PI * k) / 5), Math.sin((4 * Math.PI * k) / 5)] as const);
    for (const region of [concave, star, RECT.slice(0, 2), [[0, 0], [1, 1], [2, 2]] as Ring, [[0, 0], [Number.NaN, 0], [1, 1]] as Ring]) {
      expect(() => treemapVoronoi(nodes, region)).toThrow(RangeError);
    }
    expect(() => treemapVoronoi([{ id: "x", weight: 0 }], RECT)).toThrow(RangeError);
    expect(() => treemapVoronoi([{ id: "x", children: [] }], RECT)).toThrow(RangeError);
    for (const options of [{ seed: Number.NaN }, { maxIterations: 0 }, { maxIterations: 1.5 }, { threshold: -1 }, { threshold: Number.POSITIVE_INFINITY }]) {
      expect(() => treemapVoronoi(nodes, RECT, options)).toThrow(RangeError);
    }
  });
});

/** This function gives a made-up input of `count` boxes with a free container, margins and a gap. */
function boxes(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  return {
    container: { fixed: "none", aspect: 0.5 + 1.5 * random() },
    gap: Math.floor(random() * 4),
    items: Array.from({ length: count }, (_, i) => ({ id: `b${i}`, w: 4 + Math.floor(random() * 80), h: 4 + Math.floor(random() * 60), margin: i % 3 === 0 ? 2 : 0 })),
  };
}

describe("treemapVoronoiPack (k27)", () => {
  it("packs each box in its cell, with no overlap", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const input = boxes(seed, 5 + seed * 6);
      const out = treemapVoronoiPack(input, { seed });
      expect(checkHard(input, out), `seed ${seed}`).toEqual(ZERO);
      expect(outputHash(treemapVoronoiPack(input, { seed }))).toBe(outputHash(out));
    }
  });

  it("gives an empty output for no boxes", () => {
    expect(treemapVoronoiPack({ container: { fixed: "none" }, items: [] })).toEqual({ placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] });
  });

  it("refuses a container that is not free, and an obstacle", () => {
    const input = boxes(1, 5);
    expect(() => treemapVoronoiPack({ ...input, container: { fixed: "width", w: 100 } })).toThrow(/treemapVoronoiPack needs a container/);
    expect(() => treemapVoronoiPack({ ...input, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] })).toThrow(/treemapVoronoiPack does not take obstacles/);
  });
});
