import { describe, expect, it } from "vitest";
import { defaultLayoutOf, mulberry32, pack, rectFeatures, Rect, selectLeaf, spreadOf, type PackLayoutOptions } from "@mark1russell7/packing";

// Step A of roadmap item k58: `pack()` without a strategy reads `SELECT_TABLE` for a fixed size, and keeps `rows` for each other container.

/** This function makes rectangles with seeded sizes. The value `same` gives each rectangle the same size. */
const rectsOf = (n: number, seed: number, same = false): Rect[] => {
  const random = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const r = new Rect();
    r.size.set(same ? 6 : 1 + Math.floor(random() * 20), same ? 4 : 1 + Math.floor(random() * 20));
    return r;
  });
};

/** This function gives an outer rectangle. */
const outerOf = (w: number, h: number, kind: "size" | "width" | "none"): Rect => {
  const outer = new Rect();
  outer.size.set(w, h);
  outer.fixedSize = kind === "size";
  outer.fixedWidth = kind === "width";
  return outer;
};

/** This function gives the places of a packing, and the size of the outer rectangle. */
const placesOf = (rects: Rect[], outer: Rect, options?: PackLayoutOptions): string => {
  pack(rects, outer, options);
  return JSON.stringify([outer.size.x, outer.size.y, ...rects.map((r) => [r.wasPacked, r.position.x, r.position.y])]);
};

describe("pack() without a strategy", () => {
  for (const kind of ["width", "none"] as const) {
    it(`gives the rows output for the container ${kind}`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        expect(placesOf(rectsOf(30, seed), outerOf(80, 0, kind)), String(seed)).toBe(placesOf(rectsOf(30, seed), outerOf(80, 0, kind), { strategy: "rows" }));
      }
    });
  }

  it("gives the maxrects-bl output for a fixed size with a size spread", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const outer = outerOf(90, 90, "size");
      expect(defaultLayoutOf(rectsOf(30, seed), outer)).toEqual({ strategy: "maxrects", rule: "bl" });
      expect(placesOf(rectsOf(30, seed), outer), String(seed)).toBe(placesOf(rectsOf(30, seed), outerOf(90, 90, "size"), { strategy: "maxrects", rule: "bl" }));
    }
  });

  it("gives the rows output for a fixed size with identical sizes", () => {
    expect(defaultLayoutOf(rectsOf(30, 1, true), outerOf(90, 90, "size"))).toEqual({ strategy: "rows" });
    expect(placesOf(rectsOf(30, 1, true), outerOf(90, 90, "size"))).toBe(placesOf(rectsOf(30, 1, true), outerOf(90, 90, "size"), { strategy: "rows" }));
  });

  it("keeps an explicit strategy", () => {
    expect(placesOf(rectsOf(30, 7), outerOf(90, 90, "size"), { strategy: "rows" })).not.toBe(placesOf(rectsOf(30, 7), outerOf(90, 90, "size")));
  });

  it("reads the features of select from the rectangles", () => {
    const rects = rectsOf(40, 9);
    const items = rects.map((r, i) => ({ id: String(i), w: r.size.x, h: r.size.y }));
    const features = rectFeatures(rects);
    expect(features.spread).toBeCloseTo(spreadOf({ container: { fixed: "size", w: 1, h: 1 }, items }), 12);
    expect(features).toMatchObject({ count: 40, fixed: true, rect: true });
    rects[0]!.locked = true;
    expect(rectFeatures(rects).count).toBe(39);
    expect(selectLeaf({ ...features, count: 400, spread: 0.1 }).pick).toBe(0);
  });
});
