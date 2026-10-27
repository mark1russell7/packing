import { describe, it, expect } from "vitest";
import { pack, packShelf, Rect } from "@mark1russell7/packing";

/** This helper makes a Rect with a given size. */
const rect = (w: number, h: number): Rect => {
  const r = new Rect();
  r.size.set(w, h);
  return r;
};

/** This helper makes a locked Rect at a given position. */
const obstacle = (x: number, y: number, w: number, h: number): Rect => {
  const r = rect(w, h);
  r.position.set(x, y);
  r.locked = true;
  return r;
};

/** This helper makes an outer Rect with a fixed width. */
const outerOf = (w: number, h = 0): Rect => {
  const r = new Rect();
  r.size.set(w, h);
  r.fixedWidth = true;
  return r;
};

/** This helper tells if two rects overlap. Two rects with a common edge do not overlap. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.position.x < b.right() && b.position.x < a.right() && a.position.y < b.bottom() && b.position.y < a.bottom();

/** This helper tells if the rects read in the order of the array: left to right in a row, then row by row. */
const readsInOrder = (rects: Rect[]): boolean =>
  rects.every((r, i) => {
    const prev = rects[i - 1];
    if (prev === undefined) return true;
    if (r.position.y === prev.position.y) return r.position.x >= prev.right();
    return r.position.y >= Rect.maxBottom(rects.slice(0, i));
  });

/** This helper tells if no two rects of the list overlap. */
const noOverlap = (rects: Rect[]): boolean =>
  rects.every((a, i) => rects.slice(i + 1).every((b) => !overlaps(a, b)));

/** A small seeded random generator (mulberry32), so each case is the same at each run. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("packShelf", () => {
  it("keeps the input order of ranked rects without obstacles", () => {
    const ranked = Array.from({ length: 40 }, (_, i) => rect(10 + ((i * 13) % 37), 5 + ((i * 17) % 41)));
    const outer = packShelf(ranked, outerOf(120), { sortOrder: "input" });
    expect(ranked.every((r) => r.wasPacked)).toBe(true);
    expect(readsInOrder(ranked)).toBe(true);
    expect(noOverlap(ranked)).toBe(true);
    for (const r of ranked) expect(r.right()).toBeLessThanOrEqual(120);
    expect(outer.size.y).toBe(Rect.maxBottom(ranked));
  });

  it("goes around obstacles, keeps them in place and keeps the input order", () => {
    const pins = [obstacle(40, 0, 30, 30), obstacle(0, 50, 20, 40), obstacle(80, 70, 40, 15)];
    const ranked = Array.from({ length: 25 }, (_, i) => rect(12 + ((i * 7) % 25), 8 + ((i * 11) % 20)));
    packShelf([...pins, ...ranked], outerOf(120), { sortOrder: "input" });
    expect([pins[0]!.position.x, pins[0]!.position.y]).toEqual([40, 0]);
    expect(ranked.every((r) => r.wasPacked)).toBe(true);
    expect(readsInOrder(ranked)).toBe(true);
    expect(noOverlap([...pins, ...ranked])).toBe(true);
    for (const r of ranked) expect(r.right()).toBeLessThanOrEqual(120);
  });

  it("keeps the order, the width and no overlap for 300 random boards with obstacles", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const width = 60 + Math.floor(next() * 200);
      const pins = Array.from({ length: Math.floor(next() * 5) }, () =>
        obstacle(Math.floor(next() * width * 0.8), Math.floor(next() * 150), 5 + Math.floor(next() * width * 0.5), 5 + Math.floor(next() * 40)),
      );
      // Obstacles of the caller can overlap each other: the packer only goes around them
      const ranked = Array.from({ length: 1 + Math.floor(next() * 30) }, () =>
        rect(1 + Math.floor(next() * width), 1 + Math.floor(next() * 40)),
      );
      packShelf([...ranked, ...pins], outerOf(width), { sortOrder: "input" });
      expect(ranked.every((r) => r.wasPacked), `seed ${seed}`).toBe(true);
      expect(readsInOrder(ranked), `seed ${seed}`).toBe(true);
      expect(noOverlap(ranked), `seed ${seed}`).toBe(true);
      for (const r of ranked) {
        expect(r.right(), `seed ${seed}`).toBeLessThanOrEqual(width);
        for (const p of pins) expect(overlaps(r, p), `seed ${seed}`).toBe(false);
      }
    }
  });

  it("puts the rects under an obstacle that fills the width", () => {
    const wall = obstacle(0, 0, 100, 20);
    const a = rect(30, 10);
    packShelf([wall, a], outerOf(100), { sortOrder: "input" });
    expect([a.position.x, a.position.y]).toEqual([0, 20]);
  });

  it("puts a rect wider than the outer rect on its own row, at the left edge, clear of obstacles", () => {
    const pin = obstacle(0, 10, 20, 20);
    const small = rect(20, 10);
    const wide = rect(150, 10);
    const after = rect(20, 10);
    packShelf([pin, small, wide, after], outerOf(100), { sortOrder: "input" });
    expect([small.position.x, small.position.y]).toEqual([0, 0]);
    expect([wide.position.x, wide.position.y]).toEqual([0, 30]);
    expect([after.position.x, after.position.y]).toEqual([0, 40]);
  });

  it("with fixedSize, leaves a rect that does not fit unpacked", () => {
    const outer = outerOf(50, 20);
    outer.fixedSize = true;
    const rects = [rect(50, 15), rect(50, 15), rect(60, 5)];
    packShelf(rects, outer, { sortOrder: "input" });
    expect(rects.map((r) => r.wasPacked)).toEqual([true, false, false]);
    expect(outer.size.y).toBe(20);
  });

  it("is Next-Fit Decreasing Height with the default sort order", () => {
    const rects = [rect(40, 10), rect(40, 30), rect(40, 20)];
    packShelf(rects, outerOf(100));
    expect(rects.map((r) => [r.position.x, r.position.y])).toEqual([
      [0, 30],
      [0, 0],
      [40, 0],
    ]);
  });

  it("places relative to the position of the outer rect, and skips an empty rect", () => {
    const outer = outerOf(100);
    outer.position.set(10, 20);
    const pin = obstacle(10, 20, 30, 30);
    const a = rect(20, 10);
    const empty = rect(0, 10);
    packShelf([pin, a, empty], outer, { sortOrder: "input" });
    expect([a.position.x, a.position.y]).toEqual([40, 20]);
    expect(empty.wasPacked).toBe(false);
  });

  it("is the strategy shelf of pack", () => {
    const pin = obstacle(0, 0, 30, 30);
    const ranked = [rect(30, 10), rect(30, 40), rect(30, 20)];
    const outer = pack([pin, ...ranked], outerOf(100), { strategy: "shelf", sortOrder: "input" });
    expect(readsInOrder(ranked)).toBe(true);
    expect(noOverlap([pin, ...ranked])).toBe(true);
    expect(outer.size.y).toBe(Rect.maxBottom([pin, ...ranked]));
  });
});
