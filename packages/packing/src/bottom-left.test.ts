import { describe, expect, it } from "vitest";
import { bestFit, bottomLeft, BOTTOM_LEFT_RULES, checkHard, orderRects, outputHash, packDefault, packWith, Rect, strategies, UnsupportedCell, type ItemOrder, type PackInput } from "@mark1russell7/packing";
import { runBottomLeft, type BottomLeftOptions } from "./bottom-left.ts";
import { perfectCut, rectGrid, rectScattered, wallLocks } from "./generators.ts";
import { toPackInput } from "./layout-input.ts";

// The slide strategies of roadmap item k25. Made-up inputs only.

/** This helper makes a rectangle with a size, and optional a locked position. */
function rect(w: number, h: number, at?: [number, number]): Rect {
  const r = new Rect();
  r.size.set(w, h);
  if (at) {
    r.position.set(at[0], at[1]);
    r.locked = true;
  }
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
function places(rects: Rect[], width: number, options: BottomLeftOptions, height = 0): ([number, number] | null)[] {
  runBottomLeft(rects, outer(width, height), { sortOrder: "input", ...options });
  return rects.map((r) => (r.wasPacked ? [r.position.x, r.position.y] : null));
}

/** This helper gives true when two rectangles overlap. Rectangles with a common edge do not overlap. */
function overlap(a: Rect, b: Rect): boolean {
  return a.position.x < b.right() && b.position.x < a.right() && a.position.y < b.bottom() && b.position.y < a.bottom();
}

/** This helper gives the small seeded inputs of the tests: `count` made-up boxes for each seed. */
function grids(containerSize: string, count = 40, seeds = 12): PackInput[] {
  return Array.from({ length: seeds }, (_, s) => toPackInput(rectGrid.generate(s + 1, { count, containerSize: containerSize as "fixed" })));
}

/**
 * This helper packs rectangles by the rule "lowest, then leftmost, holes included" with a brute-force scan of the corners.
 * The test compares the rule with `maxrects` and the rule `bl`, so the strategy `bottom-left` does not need the rule.
 */
function bruteLowestLeft(input: PackInput, order: ItemOrder): Map<string, [number, number]> {
  const width = input.container.w!;
  const height = input.container.fixed === "size" ? input.container.h! : Infinity;
  const rects = input.items.map((item) => {
    const r = rect(item.w, item.h);
    r.id = item.id;
    return r;
  });
  const placed: Rect[] = [];
  const found = new Map<string, [number, number]>();
  for (const r of orderRects(rects, order)) {
    const xs = [0, ...placed.map((p) => p.right())].toSorted((a, b) => a - b);
    const ys = [0, ...placed.map((p) => p.bottom())].toSorted((a, b) => a - b);
    let best: [number, number] | undefined;
    for (const y of ys) {
      for (const x of xs) {
        if (x + r.size.x > width || y + r.size.y > height) continue;
        r.position.set(x, y);
        if (placed.some((p) => overlap(r, p))) continue;
        best = [x, y];
        break;
      }
      if (best) break;
    }
    if (!best) continue;
    r.position.set(best[0], best[1]);
    placed.push(r);
    found.set(r.id as string, best);
  }
  return found;
}

/**
 * This helper makes a stair of `steps` locked ledges and pegs for boxes of size 1 by 1. A box goes down to a ledge, left to a
 * peg, and then down to the next ledge. Thus one box makes 2 legs for each step.
 */
function stair(steps: number): { rects: Rect[]; width: number } {
  const width = steps + 3;
  const rects: Rect[] = [];
  for (let i = 0; i < steps; i++) {
    const x = width - 1 - i;
    const y = 2 * (steps - i);
    rects.push(rect(1, 1, [x, y - 1]), rect(1, 1, [x - 2, y]));
  }
  for (let i = 0; i < steps; i++) rects.push(rect(1, 1));
  return { rects, width };
}

describe("runBottomLeft", () => {
  it("keeps a closed hole empty, as a slide does not jump", () => {
    const rects = [rect(4, 4), rect(4, 1), rect(10, 2), rect(2, 1)];
    expect(places(rects, 10, {})).toEqual([[0, 0], [4, 0], [0, 4], [0, 6]]);
  });

  it("moves left past an opening with the rule baker, and into the opening with the rule liu-teng", () => {
    const make = (): Rect[] => [rect(3, 2, [0, 0]), rect(4, 2, [6, 0]), rect(3, 1)];
    expect(places(make(), 10, { rule: "baker" })[2]).toEqual([0, 2]);
    expect(places(make(), 10, { rule: "liu-teng" })[2]).toEqual([3, 0]);
  });

  it("keeps a locked rectangle at its place, and packs around it", () => {
    const rects = [rect(2, 2, [4, 0]), rect(3, 3), rect(3, 3)];
    expect(places(rects, 10, {})).toEqual([[4, 0], [6, 0], [0, 0]]);
  });

  it("does not pack a box with a final top over a fixed height", () => {
    expect(places([rect(10, 3), rect(10, 3), rect(5, 2)], 10, {}, 5)).toEqual([[0, 0], null, [0, 3]]);
  });

  it("gives the top of the boxes as the height of a free outer rectangle", () => {
    const box = outer(10);
    runBottomLeft([rect(10, 3), rect(10, 4)], box);
    expect(box.size.y).toBe(7);
  });

  it("packs nothing into an outer rectangle with no width", () => {
    expect(runBottomLeft([rect(1, 1)], outer(0))).toEqual({ legs: 0, scans: 0 });
  });

  it("refuses an unknown rule", () => {
    expect(() => runBottomLeft([], outer(1), { rule: "other" as "baker" })).toThrow(RangeError);
  });

  it("stops each box at a place where it cannot move down or left", () => {
    for (const rule of BOTTOM_LEFT_RULES) {
      for (const input of grids("freeHeight")) {
        const output = packWith("bottom-left", input, { rule });
        const size = new Map(input.items.map((item) => [item.id, item]));
        const boxes = output.placements.map((p) => ({ id: p.id, x: p.x, y: p.y, w: size.get(p.id)!.w, h: size.get(p.id)!.h }));
        for (const p of boxes) {
          expect(p.y === 0 || boxes.some((o) => o.y + o.h === p.y && o.x < p.x + p.w && p.x < o.x + o.w), `${rule} down ${p.id}`).toBe(true);
          expect(p.x === 0 || boxes.some((o) => o.x + o.w === p.x && o.y < p.y + p.h && p.y < o.y + o.h), `${rule} left ${p.id}`).toBe(true);
        }
      }
    }
  });
});

describe("the operation counts of runBottomLeft", () => {
  it("meets the bound of the doc comment: each leg examines each wall at most 3 times", () => {
    for (const rule of BOTTOM_LEFT_RULES) {
      for (const n of [10, 40, 160]) {
        const input = toPackInput(rectGrid.generate(n, { count: n, containerSize: "freeHeight" }));
        const rects = input.items.map((item) => rect(item.w, item.h));
        const counts = runBottomLeft(rects, outer(input.container.w!), { rule });
        expect(counts.scans, `${rule} ${n}`).toBeLessThanOrEqual(3 * n * (counts.legs + n));
      }
    }
  });

  it("does not meet O(n^2): on the stair family, a double n gives more than 6 times the scans", () => {
    for (const rule of BOTTOM_LEFT_RULES) {
      const scans = [16, 32, 64].map((n) => {
        const { rects, width } = stair(n);
        return runBottomLeft(rects, outer(width), { rule, sortOrder: "input" }).scans;
      });
      expect(scans[1]! / scans[0]!, rule).toBeGreaterThan(6);
      expect(scans[2]! / scans[1]!, rule).toBeGreaterThan(6);
    }
  });
});

describe("the methods with the same output as maxrects-bl", () => {
  it("gives the places of the brute-force rule lowest, then leftmost, holes included", () => {
    for (const size of ["fixed", "freeHeight"]) {
      for (const order of ["width-desc", "height-desc", "input"] as const) {
        for (const input of grids(size)) {
          const output = packWith("maxrects", input, { rule: "bl", sortOrder: order });
          const brute = bruteLowestLeft(input, order);
          expect(new Map(output.placements.map((p) => [p.id, [p.x, p.y]])), `${size} ${order}`).toEqual(brute);
        }
      }
    }
  });
});

describe("the strategy bottom-left", () => {
  it("is not a copy of another single strategy", () => {
    for (const rule of BOTTOM_LEFT_RULES) {
      const own = grids("freeHeight").map((input) => outputHash(packWith("bottom-left", input, { rule, sortOrder: "height-desc" })));
      for (const s of strategies.filter((x) => x.id !== "bottom-left" && x.id !== "best-fit")) {
        const other = grids("freeHeight").map((input) => outputHash(packWith(s.id, input, { sortOrder: "height-desc" })));
        expect(own.filter((hash, i) => hash !== other[i]).length, `${rule} ${s.id}`).toBeGreaterThan(0);
      }
    }
    const maxrectsBl = grids("freeHeight").map((input) => outputHash(packWith("maxrects", input, { rule: "bl", sortOrder: "width-desc" })));
    const own = grids("freeHeight").map((input) => outputHash(packWith("bottom-left", input)));
    expect(own.filter((hash, i) => hash !== maxrectsBl[i]).length).toBeGreaterThan(0);
  });

  it("gives a height of at most 3 times the best height with the order width-desc", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const file = perfectCut.generate(seed, { containerSize: "freeHeight" });
      const input = toPackInput(file);
      expect(packWith("bottom-left", input).size.h, String(seed)).toBeLessThanOrEqual(3 * file.known!.height!);
    }
  });

  it("gives a good output for each container and for locked items and obstacles", () => {
    const inputs = [...["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"].flatMap((size) => grids(size, 30, 3)), toPackInput(wallLocks.generate(2, { locks: 3, count: 20 })), toPackInput(rectScattered.generate(3, { count: 20 }))];
    for (const rule of BOTTOM_LEFT_RULES) {
      for (const input of inputs) {
        const output = packWith("bottom-left", input, { rule });
        const hard = checkHard(input, output);
        expect(hard["no-overlap"], input.container.fixed).toBe(0);
        expect(hard["in-container"], input.container.fixed).toBe(0);
        expect(output.placements.length + output.overflow.length).toBe(input.items.length);
      }
    }
  });

  it("gives the same bytes for two packs, and a count of the move move.slide", () => {
    const input = grids("freeHeight")[0]!;
    expect(outputHash(packWith("bottom-left", input, {}, 3))).toBe(outputHash(packWith("bottom-left", input, {}, 3)));
    expect(bottomLeft.deterministic).toBe(true);
    const fixed = packWith("bottom-left", toPackInput(rectGrid.generate(2, { count: 40, containerSize: "fixed" })));
    expect(Object.keys(fixed.trace?.at(-1)?.measures ?? {})).toEqual(["pack.overflow", "move.slide"]);
  });

  it("is not the default of pack", () => {
    const input = grids("freeHeight")[0]!;
    const steps = packDefault(input).trace?.map((t) => t.id) ?? [];
    expect(steps).not.toContain(bottomLeft.id);
    expect(steps).not.toContain(bestFit.id);
  });

  it("throws UnsupportedCell for each input kind out of its contract", () => {
    const container = { fixed: "size", w: 50, h: 50 } as const;
    const bad: [PackInput, string][] = [
      [{ container: { ...container, shape: { kind: "circle", cx: 25, cy: 25, r: 25 } }, items: [{ id: "a", w: 1, h: 1 }] }, "containerShape"],
      [{ container, items: [{ id: "a", w: 1, h: 1, turnable: true }] }, "rotation"],
      [{ container, items: [{ id: "a", w: 1, h: 1, group: "g" }] }, "groups"],
      [{ container, items: [{ id: "a", w: 2, h: 2, shape: { kind: "circle", cx: 1, cy: 1, r: 1 } }] }, "itemShape"],
    ];
    for (const [input, dimension] of bad) expect(() => packWith("bottom-left", input), dimension).toThrow(UnsupportedCell);
  });
});
