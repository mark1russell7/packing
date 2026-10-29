import { createFamilyRegistry, familyKind, levelsOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  anchorGenerators,
  checkInput,
  corpusFamilies,
  hashInput,
  isAnchor,
  toPackInput,
  WALL_LOCK_WALLS,
  wallLocks,
  type GeneratedInput,
  type WallLocksParams,
} from "@mark1russell7/packing";

// Roadmap item k111: the family wall-locks, with 1 to 4 locked items on the walls of a box. The data is made up.

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);

const PARAMS: readonly Partial<WallLocksParams>[] = [{}, { locks: 1 }, { locks: 4 }, { locks: 4, containerSize: "freeHeight" }, { locks: 3, count: 1 }, { locks: 2, count: 80 }];

/** The pinned hash of seed 1 of each case. A change of a pinned hash needs a new version of the generator. */
const PINS: Record<string, string> = {
  "anchor-v1/wall-locks.l2.fixed.n40/s1": "ae2d0d087eeafe4a",
  "anchor-v1/wall-locks.l4.fixed.n40/s1": "10704fcc16da3fa2",
  "anchor-v1/wall-locks.l4.freeHeight.n40/s1": "d74e3592034715c6",
};

describe("the generator wall-locks", () => {
  it.each(PARAMS.map((p) => [JSON.stringify(p), p] as const))("gives the same file for the same seed, and another file for another seed: %s", (_, params) => {
    expect(JSON.stringify(wallLocks.generate(4, params))).toBe(JSON.stringify(wallLocks.generate(4, params)));
    expect(wallLocks.generate(4, params).hash).not.toBe(wallLocks.generate(5, params).hash);
  });

  it.each(PARAMS.map((p) => [JSON.stringify(p), p] as const))("puts each lock on its wall, inside the box, with no overlap and room for 4 steps: %s", (_, params) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const file = wallLocks.generate(seed, params);
      const full = wallLocks.withDefaults(params);
      const input = toPackInput(file);
      expect(file.source).toBe("made-up");
      expect(file.hash).toBe(hashInput(file));
      expect(checkInput(file)).toEqual([]);
      const locks = input.items.filter((i) => i.locked === true);
      expect(locks.map((l) => l.id)).toEqual(Array.from({ length: full.locks }, (_, i) => `l${i}`));
      expect(input.items).toHaveLength(full.locks + full.count);
      const w = input.container.w!;
      const h = Math.max(...locks.map((l) => l.y! + l.h), input.container.h ?? 0);
      for (const [i, l] of locks.entries()) {
        expect(isAnchor(input, l.id)).toBe(true);
        const wall = WALL_LOCK_WALLS[full.containerSize][i]!;
        const on = { top: l.y === 0, right: l.x! + l.w === w, left: l.x === 0, bottom: l.y! + l.h === input.container.h }[wall];
        expect(on, `${file.id} ${l.id} ${wall}`).toBe(true);
        expect(l.x! >= 0 && l.x! + l.w <= w && l.y! >= 0 && l.y! + l.h <= h).toBe(true);
        // 4 steps of 1% of the width, rounded, stay inside the wall
        const room = 4 * Math.max(1, Math.round(w / 100));
        if (wall === "top" || wall === "bottom") expect(l.x! + l.w + room).toBeLessThanOrEqual(w);
        else if (input.container.h !== undefined) expect(l.y! + l.h + room).toBeLessThanOrEqual(input.container.h);
        for (const m of locks.slice(i + 1)) {
          const apart = l.x! + l.w <= m.x! || m.x! + m.w <= l.x! || l.y! + l.h <= m.y! || m.y! + m.h <= l.y!;
          expect(apart, `${file.id} ${l.id} ${m.id}`).toBe(true);
        }
      }
      for (const b of input.items.filter((i) => i.locked !== true)) expect(Number.isInteger(b.w) && Number.isInteger(b.h) && b.w >= 20 && b.w <= 60 && b.h >= 15 && b.h <= 50).toBe(true);
      if (full.containerSize === "fixed") expect(input.container).toMatchObject({ fixed: "size" });
      else expect(input.container).toEqual({ w, fixed: "width" });
    }
  });

  it("pins the hash of seed 1", () => {
    const ids = [{}, { locks: 4 }, { locks: 4, containerSize: "freeHeight" as const }].map((p) => wallLocks.generate(1, p));
    expect(Object.fromEntries(ids.map((f) => [f.id, f.hash]))).toEqual(PINS);
    expect(anchorGenerators).toEqual([wallLocks]);
  });

  it("refuses a parameter out of its range", () => {
    expect(() => wallLocks.generate(1, { locks: 0 })).toThrow(RangeError);
    expect(() => wallLocks.generate(1, { locks: 5 })).toThrow(RangeError);
    expect(() => wallLocks.generate(1, { locks: 1.5 })).toThrow(RangeError);
    expect(() => wallLocks.generate(1, { count: 0 })).toThrow(RangeError);
    expect(() => wallLocks.generate(1, { containerSize: "freeArea" as "fixed" })).toThrow(RangeError);
  });
});

describe("the family wall-locks", () => {
  it("has the dimensions locks, containerSize and count, then the knobs", () => {
    const f = registry.family("wall-locks");
    expect(f.dimensions.map((d) => d.name)).toEqual(["locks", "containerSize", "count", "margin", "gap", "shape"]);
    expect(f.hash).toBe(hashInput);
    expect(f.crossEngine).toBe("exact");
    const dims = Object.fromEntries(f.dimensions.map((d) => [d.name, d]));
    expect([dims["locks"]!.min, dims["locks"]!.max, dims["locks"]!.default]).toEqual([1, 4, 2]);
    expect(levelsOf(dims["locks"]!)).toEqual([1, 2, 3, 4]);
    expect(levelsOf(dims["count"]!)).toEqual([10, 20, 40, 80]);
    expect(registry.cellOf("wall-locks", {}).kind).toBe(familyKind("wall-locks", 1));
    expect(registry.cellCount("wall-locks", { sweep: ["locks", "containerSize", "count"] })).toBe(32);
  });

  it("gives the bytes of the generator, and refuses a value out of range", () => {
    const dims = { locks: 3, containerSize: "freeHeight", count: 20 };
    expect(JSON.stringify(registry.generate("wall-locks", 5, dims))).toBe(JSON.stringify(wallLocks.generate(5, dims as Partial<WallLocksParams>)));
    expect(() => registry.generate("wall-locks", 5, { locks: 5 })).toThrow(RangeError);
  });
});
