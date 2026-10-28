import { describe, expect, it } from "vitest";
import { buildFrame, outerOf, rectsOf } from "./frame.ts";
import { checkHard, MAXRECTS_RULES, mulberry32, packMaxRects, packWith, Rect, rectGrid, toPackInput, type MaxRectsRule, type PackInput, type PackOutput } from "./index.ts";
import { runMaxRects } from "./maxrects.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";
import { spaceOf } from "./space.ts";

// The MaxRects family of roadmap item k24: the strategy `maxrects` and its rules. Made-up inputs of the generators only.

const SHAPES = ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const;
const LAYOUTS = ["none", "center", "scattered", "wall", "corridors", "touching", "edge"] as const;
const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

const packRule = (input: PackInput, rule: MaxRectsRule, seed: number): PackOutput => packWith("maxrects", input, { rule }, seed);

/** This function checks one packing of a rule: the hard rules on the bounding box and on the true outline, and the determinism. */
function checkRule(input: PackInput, rule: MaxRectsRule, seed: number, label: string): PackOutput {
  const output = packRule(input, rule, seed);
  expect(checkHard(input, output), label).toEqual(CLEAN);
  expect(checkHard(input, output, undefined, { exactContainer: true }), label).toEqual(CLEAN);
  const again = packRule(input, rule, seed);
  expect([again.placements, again.overflow, again.size], label).toEqual([output.placements, output.overflow, output.size]);
  return output;
}

/** This function checks that each free rectangle at the end of a packing with a fixed width is in the free space. */
function checkFree(input: PackInput, rule: MaxRectsRule, label: string): void {
  const frame = buildFrame(input);
  const space = spaceOf(input, frame);
  const rects = rectsOf(frame);
  const { free } = runMaxRects(rects, outerOf(frame), { rule, space });
  const placed = rects.filter((r) => r.wasPacked);
  for (const f of free) {
    // A small margin keeps the test free of the last bit of the floating point numbers
    const e = 1e-6;
    expect(space.fits({ x: f.x + e, y: f.y + e, w: f.w - 2 * e, h: f.h - 2 * e }), `${label} ${JSON.stringify(f)}`).toBe(true);
    for (const r of placed) {
      const common = Math.min(f.x + f.w, r.right()) - Math.max(f.x, r.position.x) > e && Math.min(f.y + f.h, r.bottom()) - Math.max(f.y, r.position.y) > e;
      expect(common, `${label} a free rectangle on a box`).toBe(false);
    }
  }
}

describe("maxrects: the hard rules in each container shape", () => {
  for (const containerShape of SHAPES) {
    it(`packs each rule into a ${containerShape} container with a fixed size and a free height, for each obstacle layout`, () => {
      let placed = 0;
      let items = 0;
      for (const rule of MAXRECTS_RULES) {
        for (const containerSize of ["fixed", "freeHeight"] as const) {
          for (const obstacles of LAYOUTS) {
            for (const [seed, count] of [[1, 10], [2, 100]] as const) {
              const sizes = seed === 1 ? "uniform" : "heavyTail";
              const input = toPackInput(rectGrid.generate(seed, { containerShape, containerSize, obstacles, sizes, count }));
              const label = `${rule} ${containerSize} ${obstacles} s${seed}`;
              const output = checkRule(input, rule, seed, label);
              if (containerSize === "freeHeight") expect(output.overflow, label).toEqual([]);
              checkFree(input, rule, label);
              placed += output.placements.length;
              items += input.items.length;
            }
          }
        }
      }
      expect(placed / items).toBeGreaterThan(0.5);
    });

    it(`packs each rule into a ${containerShape} container with a free width, aspect and area`, () => {
      for (const rule of MAXRECTS_RULES) {
        for (const containerSize of ["freeWidth", "freeAspect", "freeArea"] as const) {
          for (const obstacles of ["none", "scattered"] as const) {
            const input = toPackInput(rectGrid.generate(3, { containerShape, containerSize, obstacles, sizes: "bimodal", count: 30 }));
            const output = checkRule(input, rule, 3, `${rule} ${containerSize} ${obstacles}`);
            expect(output.overflow).toEqual([]);
          }
        }
      }
    });
  }

  it("puts more items than shelf into a round container", () => {
    let own = 0;
    let shelf = 0;
    for (const containerShape of ["circle", "ellipse"] as const) {
      for (const seed of [1, 2, 3]) {
        const input = toPackInput(rectGrid.generate(seed, { containerShape, containerSize: "fixed", obstacles: "none", sizes: "uniform", count: 100 }));
        own += packRule(input, "bssf", seed).placements.length;
        shelf += packWith("shelf", input, undefined, seed).placements.length;
      }
    }
    expect(own).toBeGreaterThanOrEqual(shelf);
  });
});

/** This function makes a rectangle of a size. */
const box = (w: number, h: number, id = 0): Rect<number> => {
  const r = new Rect<number>();
  r.size.set(w, h);
  r.id = id;
  return r;
};

/** This function makes a locked rectangle at the top-left corner. */
const lockedAt = (w: number, h: number): Rect<number> => {
  const r = box(w, h, -1);
  r.locked = true;
  return r;
};

/** This function makes an outer rectangle of 100 by 100 with a fixed size. */
const square = (): Rect<number> => {
  const outer = new Rect<number>();
  outer.size.set(100, 100);
  outer.fixedWidth = true;
  outer.fixedSize = true;
  return outer;
};

/** This function packs one box next to a locked corner rectangle, and gives its place and the move counts. */
function one(rule: MaxRectsRule, lock: [number, number], size: [number, number], extra: Rect<number>[] = []): { x: number; y: number; moves: Record<string, number> } {
  const r = box(...size, 1);
  clearMoves();
  packMaxRects([lockedAt(...lock), r, ...extra], square(), { rule });
  const moves = Object.fromEntries([MOVES.bssf, MOVES.blsf, MOVES.baf, MOVES.cp, MOVES.split].map((m) => [m, moveCount(m)]));
  expect(r.wasPacked).toBe(true);
  return { x: r.position.x, y: r.position.y, moves };
}

describe("maxrects: each rule on a hand case", () => {
  // A locked corner leaves two free rectangles: one on the right from the top, and one under the corner. The rule `bl`
  // takes the right one, because the bottom edge of the box is higher there.

  it("bssf takes the free rectangle with the smallest short leftover, and counts move.bssf", () => {
    expect(one("bl", [50, 50], [30, 45])).toMatchObject({ x: 50, y: 0 });
    const got = one("bssf", [50, 50], [30, 45]);
    expect(got).toMatchObject({ x: 0, y: 50 });
    expect(got.moves[MOVES.bssf]).toBe(1);
  });

  it("blsf takes the free rectangle with the smallest long leftover, and counts move.blsf", () => {
    expect(one("bl", [50, 50], [30, 20])).toMatchObject({ x: 50, y: 0 });
    expect(one("bssf", [50, 50], [30, 20])).toMatchObject({ x: 50, y: 0 });
    const got = one("blsf", [50, 50], [30, 20]);
    expect(got).toMatchObject({ x: 0, y: 50 });
    expect(got.moves[MOVES.blsf]).toBe(1);
  });

  it("baf takes the free rectangle with the smallest area, and counts move.baf", () => {
    expect(one("bl", [50, 70], [20, 20])).toMatchObject({ x: 50, y: 0 });
    const got = one("baf", [50, 70], [20, 20]);
    expect(got).toMatchObject({ x: 0, y: 70 });
    expect(got.moves[MOVES.baf]).toBe(1);
  });

  it("cp takes the place with the most contact, and counts move.cp", () => {
    expect(one("bl", [50, 70], [20, 30])).toMatchObject({ x: 50, y: 0 });
    const got = one("cp", [50, 70], [20, 30]);
    expect(got).toMatchObject({ x: 0, y: 70 });
    expect(got.moves[MOVES.cp]).toBe(1);
  });

  it("bl counts move.split for a box that cuts two free rectangles", () => {
    const got = one("bl", [50, 50], [60, 20], [box(5, 5, 2)]);
    expect(got).toMatchObject({ x: 0, y: 50 });
    expect(got.moves[MOVES.split]).toBe(1);
    expect(one("bl", [50, 50], [30, 20], [box(5, 5, 2)]).moves[MOVES.split]).toBe(0);
  });

  it("keeps the free rectangles maximal: a box in an empty square leaves two free rectangles", () => {
    const { free } = runMaxRects([box(40, 30)], square(), { rule: "bl" });
    expect(free.toSorted((a, b) => a.x - b.x)).toEqual([
      { x: 0, y: 30, w: 100, h: 70 },
      { x: 40, y: 0, w: 60, h: 100 },
    ]);
  });

  it("throws a RangeError for an unknown rule or a band height of 0", () => {
    expect(() => packMaxRects([box(1, 1)], square(), { rule: "worst" as MaxRectsRule })).toThrow(RangeError);
    const input = toPackInput(rectGrid.generate(1, { containerShape: "circle", containerSize: "fixed", obstacles: "none", sizes: "uniform", count: 10 }));
    expect(() => packWith("maxrects", input, { bandHeight: 0 })).toThrow(RangeError);
  });
});

describe("maxrects: no box left out that fits", () => {
  it("leaves no box out of a plain rectangle when a free rectangle at the end has room for it", () => {
    for (const rule of MAXRECTS_RULES) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const rng = mulberry32(seed);
        const rects = Array.from({ length: 60 }, (_, i) => box(5 + Math.floor(rng() * 30), 5 + Math.floor(rng() * 30), i));
        const { free } = runMaxRects(rects, square(), { rule });
        const left = rects.filter((r) => !r.wasPacked);
        expect(left.length, `${rule} s${seed}`).toBeGreaterThan(0);
        for (const r of left) for (const f of free) expect(r.size.x <= f.w && r.size.y <= f.h, `${rule} s${seed}`).toBe(false);
        // Each free rectangle is empty
        for (const f of free) {
          for (const p of rects.filter((q) => q.wasPacked)) {
            const common = Math.min(f.x + f.w, p.right()) - Math.max(f.x, p.position.x) > 0 && Math.min(f.y + f.h, p.bottom()) - Math.max(f.y, p.position.y) > 0;
            expect(common).toBe(false);
          }
        }
      }
    }
  });

  it("packs each box of a generator input with a plain rectangle that fits at the end", () => {
    for (const rule of MAXRECTS_RULES) {
      for (const seed of [1, 2]) {
        const input = toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize: "fixed", obstacles: "scattered", sizes: "heavyTail", count: 100 }));
        const frame = buildFrame(input);
        const rects = rectsOf(frame);
        const { free } = runMaxRects(rects, outerOf(frame), { rule, space: spaceOf(input, frame) });
        for (const r of rects.filter((q) => !q.wasPacked)) for (const f of free) expect(r.size.x <= f.w && r.size.y <= f.h).toBe(false);
      }
    }
  });
});

describe("maxrects: the turn of an item", () => {
  /** This function makes an input with tall turnable items in a wide container. */
  const wide = (fixed: "size" | "height"): PackInput => ({
    container: { w: 100, h: 30, fixed },
    gap: 2,
    items: Array.from({ length: 2 }, (_, i) => ({ id: `t${i}`, w: 10, h: 40, turnable: true, margin: { top: 1, right: 2, bottom: 3, left: 4 } })),
  });

  for (const fixed of ["size", "height"] as const) {
    it(`turns tall items that do not fit upright, with a fixed ${fixed}`, () => {
      const input = wide(fixed);
      expect(packWith("maxrects", input).overflow).toHaveLength(2);
      const output = packWith("maxrects", input, { rotate: true });
      expect(output.overflow).toEqual([]);
      expect(output.placements.every((p) => p.turn === 90)).toBe(true);
      expect(checkHard(input, output, undefined, { exactContainer: true })).toEqual(CLEAN);
    });
  }

  it("turns items in a size search, and keeps the hard rules", () => {
    const input: PackInput = { container: { fixed: "none" }, items: [...wide("size").items, { id: "flat", w: 60, h: 8, turnable: true }] };
    const output = packWith("maxrects", input, { rotate: true });
    expect(output.overflow).toEqual([]);
    expect(checkHard(input, output)).toEqual(CLEAN);
  });
});
