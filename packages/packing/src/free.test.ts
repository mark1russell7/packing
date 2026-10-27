import { describe, it, expect } from "vitest";
import { aspectError, pack, packFree, Rect } from "@mark1russell7/packing";

/** This helper makes a Rect with a given size. */
const rect = (w: number, h: number): Rect => {
  const r = new Rect();
  r.size.set(w, h);
  return r;
};

/** This helper tells if two rects overlap. Two rects with a common edge do not overlap. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.position.x < b.right() && b.position.x < a.right() && a.position.y < b.bottom() && b.position.y < a.bottom();

const noOverlap = (rects: Rect[]): boolean => rects.every((a, i) => rects.slice(i + 1).every((b) => !overlaps(a, b)));

/** A small seeded random generator (mulberry32), so each case is the same at each run. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("aspectError", () => {
  it("is 0 at the target and the same for a double and a half", () => {
    expect(aspectError(10, 10)).toBe(0);
    expect(aspectError(20, 10, 2)).toBe(0);
    expect(aspectError(20, 10)).toBeCloseTo(aspectError(10, 20));
    expect(aspectError(0, 10)).toBe(Infinity);
  });
});

describe("packFree", () => {
  it("packs 16 unit squares into a 4 by 4 square", () => {
    const rects = Array.from({ length: 16 }, () => rect(10, 10));
    const result = packFree(rects, new Rect(), { strategy: "shelf" });
    expect([result.outer.size.x, result.outer.size.y]).toEqual([40, 40]);
    expect(result.fill).toBe(1);
    expect(result.aspectError).toBe(0);
    expect(noOverlap(rects)).toBe(true);
  });

  it("follows the target aspect", () => {
    const rects = Array.from({ length: 16 }, () => rect(10, 10));
    const wide = packFree(rects, new Rect(), { strategy: "shelf", aspect: 4 });
    expect([wide.outer.size.x, wide.outer.size.y]).toEqual([80, 20]);
    const tall = packFree(rects, new Rect(), { strategy: "shelf", aspect: 0.25 });
    expect([tall.outer.size.x, tall.outer.size.y]).toEqual([20, 80]);
  });

  it("is not worse than the fixed rule of pack, for each strategy, on 100 random inputs", () => {
    for (const strategy of ["rows", "skyline", "shelf"] as const) {
      for (let seed = 1; seed <= 100; seed++) {
        const next = random(seed);
        const sizes = Array.from({ length: 2 + Math.floor(next() * 30) }, () => [
          1 + Math.floor(next() * 60),
          1 + Math.floor(next() * 60),
        ]);
        const free = sizes.map(([w, h]) => rect(w!, h!));
        const result = packFree(free, new Rect(), { strategy });
        const fixed = sizes.map(([w, h]) => rect(w!, h!));
        const outer = pack(fixed, new Rect(), { strategy });
        const fixedW = Rect.maxRight(fixed);
        const fixedH = Rect.maxBottom(fixed);
        const fixedObjective = fixedW * fixedH * (1 + aspectError(fixedW, fixedH));
        expect(result.objective, `${strategy} seed ${seed}`).toBeLessThanOrEqual(fixedObjective + 1e-9);
        expect(free.every((r) => r.wasPacked), `${strategy} seed ${seed}`).toBe(true);
        expect(noOverlap(free), `${strategy} seed ${seed}`).toBe(true);
        expect(result.outer.size.x).toBe(Rect.maxRight(free));
        expect(outer.size.x).toBeGreaterThan(0);
      }
    }
  });

  it("gives each width it tried, and the same result at each run", () => {
    const make = () => Array.from({ length: 30 }, (_, i) => rect(5 + ((i * 13) % 31), 5 + ((i * 7) % 23)));
    const a = packFree(make(), new Rect(), { strategy: "skyline", aspect: 1.6 });
    const b = packFree(make(), new Rect(), { strategy: "skyline", aspect: 1.6 });
    expect(a.tried.length).toBeGreaterThan(10);
    expect(a.tried).toEqual(b.tried);
    expect(a.objective).toBe(Math.min(...a.tried.map((t) => t.objective)));
  });

  it("with an aspect weight of 0, takes the smallest area", () => {
    const rects = [rect(30, 10), rect(30, 10), rect(30, 10)];
    const result = packFree(rects, new Rect(), { strategy: "shelf", aspectWeight: 0 });
    expect(result.area).toBe(900);
    expect(result.fill).toBe(1);
  });

  it("keeps a locked rect in place, and keeps the input order with the shelf strategy", () => {
    const pin = rect(20, 20);
    pin.position.set(0, 0);
    pin.locked = true;
    const ranked = Array.from({ length: 12 }, (_, i) => rect(10 + (i % 3) * 5, 10));
    packFree([pin, ...ranked], new Rect(), { strategy: "shelf", sortOrder: "input" });
    expect([pin.position.x, pin.position.y]).toEqual([0, 0]);
    expect(noOverlap([pin, ...ranked])).toBe(true);
    for (let i = 1; i < ranked.length; i++) {
      const [a, b] = [ranked[i - 1]!, ranked[i]!];
      expect(b.position.y > a.position.y || (b.position.y === a.position.y && b.position.x >= a.right())).toBe(true);
    }
  });

  it("gives an empty result for no rects", () => {
    const result = packFree([], new Rect());
    expect([result.outer.size.x, result.outer.size.y, result.area, result.tried.length]).toEqual([0, 0, 0, 0]);
  });
});
