import { describe, expect, it } from "vitest";
import { BEST_FIT_SIDES, bestFit, checkHard, outputHash, packWith, Rect, strategies, UnsupportedCell, type PackInput } from "@mark1russell7/packing";
import { runBestFit, type BestFitOptions } from "./best-fit.ts";
import { rectGrid, wallLocks } from "./generators.ts";
import { toPackInput } from "./layout-input.ts";

// The strategy best-fit of roadmap item k25. Made-up inputs only.

/** This helper makes a rectangle with a size. */
function rect(w: number, h: number): Rect {
  const r = new Rect();
  r.size.set(w, h);
  return r;
}

/** This helper makes an outer rectangle. A height above 0 is a fixed height. */
function outer(w: number, h = 0): Rect {
  const r = new Rect();
  r.size.set(w, h);
  r.fixedWidth = true;
  r.fixedSize = h > 0;
  return r;
}

/** This helper gives the places of the rectangles after a pack, in the input order. */
function places(rects: Rect[], width: number, options: BestFitOptions = {}, height = 0): ([number, number] | null)[] {
  runBestFit(rects, outer(width, height), { sortOrder: "input", ...options });
  return rects.map((r) => (r.wasPacked ? [r.position.x, r.position.y] : null));
}

/** This helper gives the small seeded inputs of the tests: `count` made-up boxes for each seed. */
function grids(containerSize: string, count = 40, seeds = 12): PackInput[] {
  return Array.from({ length: seeds }, (_, s) => toPackInput(rectGrid.generate(s + 1, { count, containerSize: containerSize as "fixed" })));
}

describe("runBestFit", () => {
  it("chooses the widest box that fits the lowest gap, not the next box of the list", () => {
    expect(places([rect(6, 3), rect(5, 2), rect(4, 1)], 10)).toEqual([[0, 0], [0, 3], [6, 0]]);
  });

  it("raises a gap with no box that fits to its lower neighbor", () => {
    expect(places([rect(8, 3), rect(6, 1)], 10)).toEqual([[0, 0], [0, 3]]);
  });

  it("puts a box at the side of the rule", () => {
    const make = (): Rect[] => [rect(5, 5), rect(4, 1), rect(3, 3), rect(1, 1)];
    expect(places(make(), 12, { side: "left" })[3]).toEqual([5, 1]);
    expect(places(make(), 12, { side: "short" })[3]).toEqual([8, 1]);
    expect(places([rect(6, 3), rect(3, 1)], 10, { side: "tall" })[1]).toEqual([7, 0]);
  });

  it("does not pack a box that is over a fixed height in each gap", () => {
    expect(places([rect(10, 3), rect(10, 3), rect(5, 2)], 10, {}, 5)).toEqual([[0, 0], null, [0, 3]]);
  });

  it("gives the top of the boxes as the height of a free outer rectangle", () => {
    const box = outer(10);
    runBestFit([rect(10, 3), rect(10, 4)], box);
    expect(box.size.y).toBe(7);
  });

  it("packs nothing into an outer rectangle with no width", () => {
    expect(runBestFit([rect(1, 1)], outer(0))).toEqual({ rounds: 0, scans: 0 });
  });

  it("refuses an unknown side", () => {
    expect(() => runBestFit([], outer(1), { side: "other" as "left" })).toThrow(RangeError);
  });
});

describe("the operation counts of runBestFit", () => {
  it("meets O(n^2): at most 2n + 1 rounds and (2n + 1)^2 scans", () => {
    for (const side of BEST_FIT_SIDES) {
      for (const n of [10, 40, 160, 640]) {
        const input = toPackInput(rectGrid.generate(n, { count: n, containerSize: "freeHeight" }));
        const rects = input.items.map((item) => rect(item.w, item.h));
        const counts = runBestFit(rects, outer(input.container.w!), { side });
        expect(counts.rounds, `${side} ${n}`).toBeLessThanOrEqual(2 * n + 1);
        expect(counts.scans, `${side} ${n}`).toBeLessThanOrEqual((2 * n + 1) ** 2);
      }
    }
  });
});

describe("the strategy best-fit", () => {
  it("is not a copy of another single strategy, and each side has its own output", () => {
    const hashes = BEST_FIT_SIDES.map((side) => grids("freeHeight").map((input) => outputHash(packWith("best-fit", input, { side }))));
    for (const own of hashes) {
      for (const s of strategies.filter((x) => x.id !== "best-fit")) {
        const other = grids("freeHeight").map((input) => outputHash(packWith(s.id, input)));
        expect(own.filter((hash, i) => hash !== other[i]).length, s.id).toBeGreaterThan(0);
      }
    }
    expect(hashes[0]).not.toEqual(hashes[1]);
    expect(hashes[0]).not.toEqual(hashes[2]);
    expect(hashes[1]).not.toEqual(hashes[2]);
  });

  it("gives a good output for each container", () => {
    const inputs = ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"].flatMap((size) => grids(size, 30, 3));
    for (const side of BEST_FIT_SIDES) {
      for (const input of inputs) {
        const output = packWith("best-fit", input, { side });
        const hard = checkHard(input, output);
        expect(hard["no-overlap"], input.container.fixed).toBe(0);
        expect(hard["in-container"], input.container.fixed).toBe(0);
        expect(output.placements.length + output.overflow.length).toBe(input.items.length);
      }
    }
  });

  it("gives the same bytes for two packs, and the counts of its moves", () => {
    const input = grids("freeHeight")[0]!;
    expect(outputHash(packWith("best-fit", input, {}, 3))).toBe(outputHash(packWith("best-fit", input, {}, 3)));
    expect(bestFit.deterministic).toBe(true);
    const fixed = packWith("best-fit", toPackInput(rectGrid.generate(2, { count: 40, containerSize: "fixed" })));
    expect(Object.keys(fixed.trace?.at(-1)?.measures ?? {})).toEqual(["pack.overflow", "move.gapPick", "move.gapRaise"]);
  });

  it("throws UnsupportedCell for each input kind out of its contract", () => {
    const container = { fixed: "size", w: 50, h: 50 } as const;
    const bad: [PackInput, string][] = [
      [{ container: { ...container, shape: { kind: "circle", cx: 25, cy: 25, r: 25 } }, items: [{ id: "a", w: 1, h: 1 }] }, "containerShape"],
      [{ container, items: [{ id: "a", w: 1, h: 1, turnable: true }] }, "rotation"],
      [{ container, items: [{ id: "a", w: 1, h: 1, group: "g" }] }, "groups"],
      [{ container, items: [{ id: "a", w: 2, h: 2, shape: { kind: "circle", cx: 1, cy: 1, r: 1 } }] }, "itemShape"],
      [{ container, items: [{ id: "a", w: 1, h: 1, rank: 1 }] }, "order"],
      [{ container, items: [{ id: "a", w: 1, h: 1, x: 1, y: 1, locked: true }] }, "locked"],
      [toPackInput(wallLocks.generate(2, { locks: 3, count: 20 })), "wall locks"],
    ];
    for (const [input, name] of bad) expect(() => packWith("best-fit", input), name).toThrow(UnsupportedCell);
  });
});
