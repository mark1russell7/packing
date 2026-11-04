import { checkConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS,
  CIRCLE_QUASI_PHYSICAL_STAGE,
  circleOverlaps,
  circleQuasiPhysical,
  circlesOutside,
  createContext,
  mulberry32,
  outputHash,
  packConfig,
  packSpace,
  packWith,
  shapeStrategies,
  strategies,
  strategy,
  UnsupportedCell,
  UnsupportedShape,
  type Item,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// Roadmap item k94: circles in a circle by the overlap energy. Made-up inputs only. The closed forms come from plain geometry.

/** This function gives a circle item of radius `r` in a box of side `2r`. */
const disc = (id: string, r: number, extra: Partial<Item> = {}): Item => ({ id, w: 2 * r, h: 2 * r, shape: { kind: "circle", cx: r, cy: r, r }, ...extra });

/** This function gives `n` circles of radius 1. */
const equal = (n: number): Item[] => Array.from({ length: n }, (_, i) => disc(`c${i}`, 1));

/** This function gives an input with a circle container of free size. */
const free = (items: Item[], more: Partial<PackInput> = {}): PackInput => ({ container: { fixed: "none", shape: { kind: "circle", cx: 0, cy: 0, r: 1 } }, items, ...more });

/** This function gives an input with a circle container of fixed size. */
const fixed = (r: number, items: Item[], cx = r, cy = r): PackInput => ({ container: { fixed: "size", shape: { kind: "circle", cx, cy, r } }, items });

/** This function gives the radius of a layout in a free container. */
const radiusOf = (out: PackOutput): number => out.size.w / 2;

/** This function gives the smallest clear distance of the pairs of a layout, by the geometry of the input and not by the strategy. */
function leastClearance(input: PackInput, out: PackOutput): number {
  const circles = out.placements.map((p) => {
    const s = input.items.find((i) => i.id === p.id)!.shape as { cx: number; cy: number; r: number };
    return { x: p.x + s.cx, y: p.y + s.cy, r: s.r };
  });
  let least = Infinity;
  for (let a = 0; a < circles.length; a++)
    for (let b = a + 1; b < circles.length; b++) least = Math.min(least, Math.hypot(circles[a]!.x - circles[b]!.x, circles[a]!.y - circles[b]!.y) - circles[a]!.r - circles[b]!.r);
  return least;
}

/** This function gives a set of made-up random circles with radii from 1 to 4. */
function randomCircles(seed: number, count: number): Item[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => disc(`c${i}`, 1 + Math.round(rng() * 30) / 10));
}

describe("circle-quasi-physical in a free container", () => {
  it.each([
    [2, 2],
    [3, 1 + 2 / Math.sqrt(3)],
    [4, 1 + Math.SQRT2],
    [7, 3],
  ])("finds the closed form of %i equal circles", (n, best) => {
    const input = free(equal(n));
    const out = packWith("circle-quasi-physical", input, { iterations: 64 }, 1);
    expect(radiusOf(out)).toBeCloseTo(best, 6);
    expect(radiusOf(out)).toBeGreaterThanOrEqual(best * (1 - 1e-12));
    expect(leastClearance(input, out)).toBeGreaterThanOrEqual(0);
    expect(circlesOutside(input, out, 1e-9)).toBe(0);
    expect(out.overflow).toEqual([]);
  });

  it("puts one circle at the center, and it refuses an input with no items as hole-degree does", () => {
    const one = free([disc("a", 3)]);
    const out = packWith("circle-quasi-physical", one);
    expect(out.size).toEqual({ w: 6, h: 6 });
    expect(out.placements).toEqual([{ id: "a", x: -1, y: -1 }]);
    expect(() => packWith("circle-quasi-physical", free([]))).toThrow(UnsupportedCell);
  });

  it("keeps the pairs apart on unequal circles, with the order of the input", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const items = randomCircles(seed, 12);
      const input = free(items);
      const out = packWith("circle-quasi-physical", input, { iterations: 16 }, seed);
      expect(out.placements.map((p) => p.id)).toEqual(items.map((i) => i.id));
      expect(leastClearance(input, out), String(seed)).toBeGreaterThanOrEqual(0);
      expect(circleOverlaps(input, out, 1e-9), String(seed)).toBe(0);
      expect(circlesOutside(input, out, 1e-9), String(seed)).toBe(0);
    }
  });

  it("does not make the radius larger with more moves on the same seed", () => {
    const input = free(randomCircles(5, 10));
    const r = [0, 8, 64].map((iterations) => radiusOf(packWith("circle-quasi-physical", input, { iterations }, 2)));
    expect(r[1]!).toBeLessThanOrEqual(r[0]! * (1 + 1e-9));
    expect(r[2]!).toBeLessThanOrEqual(r[1]! * (1 + 1e-9));
  });

  it("adds the inset, the margin and the gap to the radius", () => {
    const base = radiusOf(packWith("circle-quasi-physical", free(equal(2)), { iterations: 32 }, 1));
    expect(base).toBeCloseTo(2, 6);
    const inset = free(equal(2), { container: { fixed: "none", inset: 1.5, shape: { kind: "circle", cx: 0, cy: 0, r: 1 } } });
    const insetOut = packWith("circle-quasi-physical", inset, { iterations: 32 }, 1);
    expect(radiusOf(insetOut)).toBeCloseTo(3.5, 6);
    expect(circlesOutside(inset, insetOut, 1e-9)).toBe(0);
    // Two circles of radius 1 with a gap of 2: the centers are 4 apart, and the walls get no gap.
    const gap = free(equal(2), { gap: 2 });
    expect(radiusOf(packWith("circle-quasi-physical", gap, { iterations: 32 }, 1))).toBeCloseTo(3, 6);
    const margin = free([disc("a", 1, { margin: 1 }), disc("b", 1, { margin: 1 })]);
    expect(radiusOf(packWith("circle-quasi-physical", margin, { iterations: 32 }, 1))).toBeCloseTo(4, 6);
  });

  it("keeps a pair gap that is more than the global gap", () => {
    const input = free([disc("a", 1), disc("b", 1)], { pairGaps: [{ a: "a", b: "b", gap: 2 }] });
    const out = packWith("circle-quasi-physical", input, { iterations: 32 }, 1);
    expect(leastClearance(input, out)).toBeGreaterThanOrEqual(2 - 1e-12);
    expect(radiusOf(out)).toBeCloseTo(3, 6);
  });

  it("starts at the shape corner", () => {
    const at = (cx: number, cy: number): PackInput => free(equal(3), { container: { fixed: "none", shape: { kind: "circle", cx, cy, r: 1 } } });
    const near = packWith("circle-quasi-physical", at(0, 0), { iterations: 8 }, 1);
    const far = packWith("circle-quasi-physical", at(100, 50), { iterations: 8 }, 1);
    expect(far.size).toEqual(near.size);
    for (const [k, p] of far.placements.entries()) {
      expect(p.x).toBeCloseTo(near.placements[k]!.x + 100, 9);
      expect(p.y).toBeCloseTo(near.placements[k]!.y + 50, 9);
    }
    expect(circlesOutside(at(100, 50), far, 1e-9)).toBe(0);
  });
});

describe("circle-quasi-physical in a fixed container", () => {
  it("fits 7 equal circles into the radius of the closed form", () => {
    const r = 3 * (1 + 1e-6);
    const input = fixed(r, equal(7));
    const out = packWith("circle-quasi-physical", input, { iterations: 256 }, 3);
    expect(out.overflow).toEqual([]);
    expect(out.size).toEqual({ w: 2 * r, h: 2 * r });
    expect(circlesOutside(input, out, 1e-6)).toBe(0);
    expect(leastClearance(input, out)).toBeGreaterThanOrEqual(0);
  });

  it("reads the center of the shape", () => {
    const input = fixed(3, equal(3), 10, -4);
    const out = packWith("circle-quasi-physical", input, { iterations: 16 }, 1);
    expect(out.overflow).toEqual([]);
    expect(circlesOutside(input, out, 1e-6)).toBe(0);
  });

  it("puts a circle that does not fit in the overflow, in the order of the input", () => {
    const input = fixed(2, [disc("big", 3), disc("a", 1), disc("b", 1), disc("huge", 5)]);
    const out = packWith("circle-quasi-physical", input, { iterations: 16 }, 1);
    expect(out.overflow).toEqual(["big", "huge"]);
    expect(out.placements.map((p) => p.id)).toEqual(["a", "b"]);
    expect(circlesOutside(input, out, 1e-6)).toBe(0);
  });

  it("puts the circles with the most pain in the overflow when the room is too small", () => {
    const input = fixed(2, equal(5));
    const out = packWith("circle-quasi-physical", input, { iterations: 32 }, 1);
    expect(out.overflow.length).toBe(3);
    expect(out.placements.length).toBe(2);
    expect(out.trace![0]!.measures!["pack.overflow"]).toBe(3);
    expect(leastClearance(input, out)).toBeGreaterThanOrEqual(0);
    expect(circlesOutside(input, out, 1e-6)).toBe(0);
  });

  it("gives an output when all items are out", () => {
    const out = packWith("circle-quasi-physical", fixed(1, [disc("a", 2)]));
    expect(out.overflow).toEqual(["a"]);
    expect(out.placements).toEqual([]);
  });
});

describe("circle-quasi-physical gives the same bytes", () => {
  it("for the same input, options and seed, with the trace in the bytes", () => {
    for (const input of [free(randomCircles(1, 14)), free(equal(13)), fixed(8, randomCircles(2, 14))]) {
      const a = packWith("circle-quasi-physical", input, { iterations: 32 }, 7);
      const b = packWith("circle-quasi-physical", input, { iterations: 32 }, 7);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("reads no clock: the time of its stage is 0", () => {
    const out = packWith("circle-quasi-physical", free(equal(5)), { iterations: 4 }, 1);
    expect(out.trace).toHaveLength(1);
    expect(out.trace![0]!.id).toBe(CIRCLE_QUASI_PHYSICAL_STAGE);
    expect(out.trace![0]!.ms).toBe(0);
  });

  it("caps the moves at the limit of the steps", () => {
    const input = free(equal(6));
    const capped = circleQuasiPhysical.pack(input, { iterations: 64 }, createContext(1, { budget: { steps: 4 } }));
    expect(JSON.stringify(capped)).toBe(JSON.stringify(packWith("circle-quasi-physical", input, { iterations: 4 }, 1)));
  });
});

describe("circle-quasi-physical refuses", () => {
  it("a rectangle container, a rectangle item, an obstacle and a group", () => {
    expect(() => packWith("circle-quasi-physical", { container: { fixed: "size", w: 20, h: 20 }, items: equal(2) })).toThrow(UnsupportedCell);
    expect(() => packWith("circle-quasi-physical", free([{ id: "r", w: 2, h: 2 }]))).toThrow(UnsupportedCell);
    expect(() => packWith("circle-quasi-physical", free(equal(2), { obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] }))).toThrow(UnsupportedCell);
    expect(() => packWith("circle-quasi-physical", free([disc("a", 1, { group: "g" })]))).toThrow(UnsupportedCell);
  });

  it.each([-1, 1.5, CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS + 1])("the value %d of the option iterations", (iterations) => {
    expect(() => packWith("circle-quasi-physical", free(equal(2)), { iterations })).toThrow(RangeError);
  });
});

describe("circlesOutside", () => {
  const input = fixed(5, [disc("a", 2)]);

  it("counts a circle that goes over the wall, also when its bounding box is inside", () => {
    expect(circlesOutside(input, { placements: [{ id: "a", x: 3, y: 3 }], size: { w: 10, h: 10 } })).toBe(0);
    // The box of the circle ends at (10, 10), but the corner of a box is out of the circle.
    expect(circlesOutside(input, { placements: [{ id: "a", x: 6, y: 6 }], size: { w: 10, h: 10 } })).toBe(1);
  });

  it("uses the tolerance, and it skips an unknown id", () => {
    expect(circlesOutside(input, { placements: [{ id: "a", x: 6.5, y: 3 }], size: { w: 10, h: 10 } }, 0.6)).toBe(0);
    expect(circlesOutside(input, { placements: [{ id: "a", x: 6.5, y: 3 }], size: { w: 10, h: 10 } }, 0.4)).toBe(1);
    expect(circlesOutside(input, { placements: [{ id: "z", x: 100, y: 100 }], size: { w: 10, h: 10 } })).toBe(0);
  });

  it("throws for a container that is not a circle", () => {
    expect(() => circlesOutside({ container: { fixed: "size", w: 9, h: 9 }, items: [] }, { placements: [], size: { w: 9, h: 9 } })).toThrow(RangeError);
  });
});

describe("circle-quasi-physical in the registry and in packSpace", () => {
  it("is a strategy of shapeStrategies, not of strategies", () => {
    expect(shapeStrategies.map((s) => s.id)).toEqual(["hole-degree", "circle-quasi-physical"]);
    expect(strategies.map((s) => s.id)).not.toContain("circle-quasi-physical");
    expect(strategy("circle-quasi-physical")).toBe(circleQuasiPhysical);
  });

  it("gives the output of packWith for its named config", () => {
    const named = packSpace.named!["circle-quasi-physical"]!;
    const input = free(randomCircles(1, 9));
    expect(outputHash(packConfig(input, named, 3))).toBe(outputHash(packWith("circle-quasi-physical", input, undefined, 3)));
    const short = { ...named, stages: { ...named.stages, placement: { option: "circle-quasi-physical", params: { iterations: 4 } } } };
    expect(outputHash(packConfig(input, short, 3))).toBe(outputHash(packWith("circle-quasi-physical", input, { iterations: 4 }, 3)));
  });

  it("refuses each shape kind but circle", () => {
    const named = packSpace.named!["circle-quasi-physical"]!;
    expect(checkConfig(packSpace, named, { shapes: ["circle"] })).toEqual([]);
    for (const kind of ["rect", "polygon", "free"] as const) expect(checkConfig(packSpace, named, { shapes: [kind] }).length, kind).toBeGreaterThan(0);
    expect(() => packConfig(free([{ id: "r", w: 4, h: 4 }]), named)).toThrow(UnsupportedShape);
  });
});
