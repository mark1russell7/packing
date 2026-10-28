import { describe, expect, it } from "vitest";
import { boundsOf, rectInRegion, regionHitsRect } from "@mark1russell7/layout-contract";
import {
  checkHard,
  freeSpace,
  lowestWindow,
  marginOf,
  mulberry32,
  packWith,
  rectGrid,
  toPackInput,
  type Item,
  type PackInput,
  type PackOutput,
  type Region,
} from "./index.ts";

// The container layer of roadmap item k37. By default, `checkHard` reads the container as its bounding box. Thus these
// tests check each box against the true outline of the container. `rectInRegion` of the contract is the ground truth.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TOL = 1e-6;
const SHAPES = ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const;
const LAYOUTS = ["none", "center", "scattered", "wall", "corridors", "touching", "edge"] as const;
const STRATEGIES = ["rows", "shelf", "skyline"] as const;

/** This function tells if a box made smaller by a tolerance is in the true outline of a region, out of its holes. */
function inside(region: Region, box: Box, tol = TOL): boolean {
  return rectInRegion(region, { x: box.x + tol, y: box.y + tol, w: box.w - 2 * tol, h: box.h - 2 * tol });
}

/** The box of each placed item with its margin, grown by the inset of the container. */
function boxesOf(input: PackInput, output: PackOutput): Box[] {
  const items = new Map(input.items.map((i) => [i.id, i]));
  const inset = input.container.inset ?? 0;
  return output.placements.map((p) => {
    const item = items.get(p.id)!;
    const m = marginOf(item);
    return { x: p.x - m.left - inset, y: p.y - m.top - inset, w: item.w + m.left + m.right + 2 * inset, h: item.h + m.top + m.bottom + 2 * inset };
  });
}

/** This function checks one packing: the hard rules, the true outline, the holes and the determinism. */
function checkPacking(id: string, input: PackInput, seed: number): PackOutput {
  const output = packWith(id, input, undefined, seed);
  const clean = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
  expect(checkHard(input, output)).toEqual(clean);
  expect(checkHard(input, output, undefined, { exactContainer: true })).toEqual(clean);
  const shape = input.container.shape;
  if (shape !== undefined && input.container.fixed === "size") {
    for (const box of boxesOf(input, output)) expect(inside(shape, box), JSON.stringify(box)).toBe(true);
  }
  if (shape?.kind === "polygon") {
    for (const hole of shape.holes ?? []) {
      for (const box of boxesOf(input, output)) expect(regionHitsRect({ kind: "polygon", points: hole }, { x: box.x + TOL, y: box.y + TOL, w: box.w - 2 * TOL, h: box.h - 2 * TOL })).toBe(false);
    }
  }
  const again = packWith(id, input, undefined, seed);
  expect([again.placements, again.overflow, again.size]).toEqual([output.placements, output.overflow, output.size]);
  return output;
}

describe("the container layer: each strategy in each container shape", () => {
  for (const containerShape of SHAPES) {
    for (const id of STRATEGIES) {
      it(`packs ${id} into a ${containerShape} container, inside its outline, for each obstacle layout`, () => {
        let placed = 0;
        let items = 0;
        for (const obstacles of LAYOUTS) {
          for (const count of [10, 100]) {
            for (const seed of [1, 2, 3]) {
              const input = toPackInput(rectGrid.generate(seed, { containerShape, obstacles, count }));
              const output = checkPacking(id, input, seed);
              placed += output.placements.length;
              items += input.items.length;
            }
          }
        }
        // The boxes have 40 percent of the area of a rectangle in the shape, thus most of them fit
        expect(placed / items).toBeGreaterThan(0.5);
      });
    }
  }

  it("keeps the gap, the margins and the inset in a circle, an ellipse and a polygon", () => {
    for (const containerShape of ["circle", "ellipse", "convex", "polygon", "holes"] as const) {
      for (const seed of [1, 2]) {
        const file = toPackInput(rectGrid.generate(seed, { containerShape, obstacles: "scattered", count: 30 }));
        const items: Item[] = file.items.map((item, i) => ({ ...item, margin: i % 3 === 0 ? 2 : { top: 1, right: 3, bottom: 0, left: 2 } }));
        const input: PackInput = { ...file, items, gap: 6, container: { ...file.container, inset: 5 } };
        for (const id of STRATEGIES) {
          const output = checkPacking(id, input, seed);
          expect(output.placements.length, `${id} ${containerShape}`).toBeGreaterThan(0);
          // The gap between two items and between an item and an obstacle
          const boxes = boxesOf({ ...input, container: { ...input.container, inset: 0 } }, output);
          for (const [i, a] of boxes.entries()) {
            for (const b of boxes.slice(i + 1)) {
              const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
              const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
              expect(ox > -6 + TOL && oy > -6 + TOL, `${id} ${containerShape}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it("packs a shaped container with a free height, and a rectangle container with a circle obstacle", () => {
    const circles: PackInput = {
      container: { w: 300, h: 200, fixed: "size" },
      items: Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, w: 20 + (i % 5) * 7, h: 15 + (i % 4) * 6 })),
      obstacles: [
        { id: "c", region: { kind: "circle", cx: 150, cy: 100, r: 45 } },
        { id: "e", region: { kind: "ellipse", cx: 60, cy: 150, rx: 40, ry: 20 } },
        { id: "p", region: { kind: "polygon", points: [[230, 20], [290, 60], [240, 90]] } },
      ],
    };
    for (const id of STRATEGIES) expect(checkPacking(id, circles, 1).placements.length, id).toBeGreaterThan(20);
    for (const containerShape of ["circle", "holes", "polygon"] as const) {
      const input = toPackInput(rectGrid.generate(1, { containerShape, containerSize: "freeHeight", count: 50 }));
      for (const id of STRATEGIES) {
        const output = checkPacking(id, input, 1);
        expect(output.overflow, `${id} ${containerShape}`).toEqual([]);
      }
    }
  });
});

describe("freeSpace", () => {
  it("gives a plain space for a rectangle container with rectangle obstacles", () => {
    const input = toPackInput(rectGrid.generate(1, { obstacles: "scattered", count: 10 }));
    const space = freeSpace(input);
    expect(space.plain).toBe(true);
    expect([space.w, space.h]).toEqual([input.container.w, input.container.h]);
    // The plain band does not test y
    expect(space.band(-50, -10)).toEqual([{ start: 0, end: space.w }]);
    expect(freeSpace({ ...input, obstacles: [{ id: "c", region: { kind: "circle", cx: 50, cy: 50, r: 10 } }] }).plain).toBe(false);
    expect(freeSpace(toPackInput(rectGrid.generate(1, { containerShape: "circle", count: 10 }))).plain).toBe(false);
  });

  it("gives the exact chord of a circle, made smaller by EPS", () => {
    const input: PackInput = { container: { fixed: "size", shape: { kind: "circle", cx: 100, cy: 100, r: 100 } }, items: [] };
    const space = freeSpace(input);
    // The frame starts at the corner of the bounding box. The band from 40 to 60 has its shortest chord at y = 40.
    const c = Math.sqrt(100 ** 2 - 60 ** 2);
    const [span] = space.band(40, 60);
    expect(span!.start).toBeCloseTo(100 - c + 1e-6, 9);
    expect(span!.end).toBeCloseTo(100 + c - 1e-6, 9);
    expect(space.band(-1, 10)).toEqual([]);
    const col = space.column(90, 110)!;
    expect(col.start).toBeCloseTo(100 - Math.sqrt(100 ** 2 - 10 ** 2) + 1e-6, 9);
    expect(space.fitX(0, 2 * c - 1, 40, 60)).toBeCloseTo(100 - c + 1e-6, 9);
    expect(space.fitX(0, 2 * c + 1, 40, 60)).toBe(Infinity);
    // A row of width 100 at the top steps down to the first band where the chord has 100
    const next = space.nextY(0, 20, 100);
    expect(next).toBeCloseTo(100 - Math.sqrt(100 ** 2 - (50 + 1e-6) ** 2), 6);
    expect(space.fitX(0, 100, next + 1e-6, next + 20)).toBeLessThan(Infinity);
  });

  it("agrees with the true outline and with regionHitsRect for random boxes", () => {
    const rng = mulberry32(7);
    for (const containerShape of SHAPES) {
      for (const obstacles of ["none", "scattered", "corridors"] as const) {
        const file = toPackInput(rectGrid.generate(3, { containerShape, obstacles, count: 10 }));
        const extra: PackInput["obstacles"] = [{ id: "round", region: { kind: "circle", cx: 300, cy: 260, r: 40 } }];
        for (const input of [file, { ...file, obstacles: [...(file.obstacles ?? []), ...extra] }]) {
          const space = freeSpace(input);
          const outline: Region = input.container.shape ?? { kind: "rect", x: 0, y: 0, w: input.container.w!, h: input.container.h! };
          const at = boundsOf(outline);
          const truth = (b: Box): boolean => {
            const c = { x: b.x + at.x, y: b.y + at.y, w: b.w, h: b.h };
            return inside(outline, c, 0) && !(input.obstacles ?? []).some((o) => regionHitsRect(o.region, c));
          };
          let fits = 0;
          for (let n = 0; n < 400; n++) {
            const w = 5 + rng() * 120;
            const h = 5 + rng() * 120;
            const box = { x: rng() * (at.w - w), y: rng() * (at.h - h), w, h };
            const fit = space.fits(box);
            if (fit) {
              fits++;
              expect(truth(box), `${containerShape} ${obstacles} ${JSON.stringify(box)}`).toBe(true);
            }
            // A box that is free with a margin of 1e-4 fits: the layer is exact up to EPS
            const grown = { x: box.x - 1e-4, y: box.y - 1e-4, w: box.w + 2e-4, h: box.h + 2e-4 };
            if (truth(grown)) expect(fit, `${containerShape} ${obstacles} ${JSON.stringify(box)}`).toBe(true);
            // Each span of a band holds a box that fits
            for (const s of space.band(box.y, box.y + box.h)) {
              if (s.end - s.start < 1e-3) continue;
              expect(truth({ x: s.start, y: box.y, w: s.end - s.start, h: box.h }), `span ${containerShape} ${obstacles} ${input.obstacles?.length} ${JSON.stringify([s, box])}`).toBe(true);
            }
          }
          expect(fits, `${containerShape} ${obstacles}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps a box out of each hole of a polygon", () => {
    const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60]];
    const input: PackInput = { container: { fixed: "size", shape: { kind: "polygon", points: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [hole] } }, items: [] };
    const space = freeSpace(input);
    expect(space.band(45, 55)).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
    expect(space.band(0, 40)).toEqual([{ start: 0, end: 100 }]);
    expect(space.column(45, 50)).toEqual({ start: 0, end: 40 });
    expect(space.column(45, 50, 40)).toEqual({ start: 60, end: 100 });
    expect(space.fits({ x: 40, y: 40, w: 1, h: 1 })).toBe(false);
    // The next top edges come from the corners of the hole
    expect(space.nextY(30, 50, 100)).toBe(40);
    expect(space.nextY(40, 60, 100)).toBe(60);
  });
});

describe("lowestWindow with a limit", () => {
  it("gives the lowest window that fits under the limit, and the window of 0.1 without a limit", () => {
    const sky = [0, 0, 5, 1, 1, 1];
    expect(lowestWindow(sky, 6, 2)).toEqual({ x: 0, y: 0 });
    expect(lowestWindow(sky, 6, 2, [3, 3, 50, 50, 50, 50], 4)).toEqual({ x: 3, y: 1 });
    expect(lowestWindow(sky, 6, 2, [3, 3, 3, 3, 3, 3], 4).y).toBe(Infinity);
  });
});
