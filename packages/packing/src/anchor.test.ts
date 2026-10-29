import { describe, expect, it } from "vitest";
import {
  ANCHOR_GAIN_LIMIT,
  ANCHOR_STEPS,
  anchorStability,
  anchorStep,
  isAnchor,
  moveAnchor,
  packWith,
  toPackInput,
  wallLocks,
  type AnchorStrategy,
  type Item,
  type PackInput,
} from "@mark1russell7/packing";

// Roadmap item k111: the stability when an anchor moves. The inputs are made up.

const box = (id: string, w: number, h: number): Item => ({ id, w, h });
const lock = (id: string, x: number, y: number, w: number, h: number): Item => ({ id, w, h, x, y, locked: true });

/** A lock in the corner far from the items: no other item moves. */
const FAR: PackInput = {
  container: { w: 200, h: 100, fixed: "size" },
  items: [box("a", 20, 10), box("b", 20, 10), box("c", 20, 10), lock("L", 180, 80, 10, 10)],
};

/** A lock at the start of the one row of a wide strip: each other item moves with it. */
const FIRST: PackInput = {
  container: { w: 1000, fixed: "width" },
  items: [lock("L", 0, 0, 20, 10), box("a", 20, 10), box("b", 20, 10), box("c", 20, 10), box("d", 20, 10)],
};

/** A lock in the row of a narrow strip: a step to the left pushes the last item to a new row. */
const JUMP: PackInput = {
  container: { w: 100, fixed: "width" },
  items: [lock("L", 40, 0, 20, 10), box("a", 20, 10), box("b", 20, 10), box("c", 20, 10), box("d", 20, 10)],
};

const ROWS = { strategy: "rows" };

describe("anchorStability", () => {
  it("gives 0 for each measure when no other item moves, and the loop settles", () => {
    const r = anchorStability(FAR, ROWS, "L", { dx: -2, dy: 0 });
    expect(r.measures).toEqual({ "pack.anchor.mean": 0, "pack.anchor.max": 0, "pack.anchor.moved": 0, "pack.anchor.gain": 0, "pack.anchor.settled": 1 });
    expect(r.gains).toEqual(Array.from({ length: ANCHOR_STEPS }, () => 0));
  });

  it("gives a share of 1 and a gain of 1 when each other item moves with the anchor", () => {
    const before = packWith("rows", FIRST);
    const after = packWith("rows", moveAnchor(FIRST, "L", 1, 0));
    const r = anchorStability(FIRST, ROWS, "L", { dx: 1, dy: 0 }, { steps: 3 });
    const diagonal = Math.hypot(Math.max(before.size.w, after.size.w), Math.max(before.size.h, after.size.h));
    expect(r.measures["pack.anchor.moved"]).toBe(1);
    expect(r.measures["pack.anchor.mean"]).toBeCloseTo(1 / diagonal, 12);
    expect(r.measures["pack.anchor.max"]).toBeCloseTo(1 / diagonal, 12);
    expect(r.gains).toHaveLength(3);
    for (const g of r.gains) expect(g).toBeCloseTo(1, 12);
    expect(r.measures["pack.anchor.settled"]).toBe(1);
    // A limit below 1 does not let the same loop settle
    expect(anchorStability(FIRST, ROWS, "L", { dx: 1, dy: 0 }, { steps: 3, gainLimit: 0.5 }).measures["pack.anchor.settled"]).toBe(0);
  });

  it("finds a jump: a gain above the limit, so the loop does not settle", () => {
    const r = anchorStability(JUMP, ROWS, "L", { dx: -1, dy: 0 }, { steps: 2 });
    expect(r.measures["pack.anchor.gain"]).toBeGreaterThan(ANCHOR_GAIN_LIMIT);
    expect(r.measures["pack.anchor.settled"]).toBe(0);
    expect(r.measures["pack.anchor.gain"]).toBe(Math.max(...r.gains));
    expect(anchorStability(JUMP, ROWS, "L", { dx: -1, dy: 0 }, { steps: 2, gainLimit: r.measures["pack.anchor.gain"] }).measures["pack.anchor.settled"]).toBe(1);
  });

  it("gives the same result for the same input, strategy and seed", () => {
    const input = toPackInput(wallLocks.generate(2, { locks: 3, count: 20 }));
    for (const config of [ROWS as AnchorStrategy, { strategy: "maxrects", options: { rule: "bl" } }, { strategy: "restarts", options: { member: "rows", iterations: 4 } }]) {
      for (const id of ["l0", "l1", "l2"]) {
        const step = anchorStep(input, packWith(config.strategy, input, config.options, 3), id);
        expect(anchorStability(input, config, id, step, { seed: 3 })).toEqual(anchorStability(input, config, id, step, { seed: 3 }));
      }
    }
  });

  it("does not count the anchor, the measures stay in their ranges, and the step 1 of the loop is the first gain", () => {
    const input = toPackInput(wallLocks.generate(1, { locks: 4, count: 40 }));
    for (const id of ["l0", "l1", "l2", "l3"]) {
      const step = anchorStep(input, packWith("skyline", input), id);
      const r = anchorStability(input, { strategy: "skyline" }, id, step);
      const m = r.measures;
      expect(m["pack.anchor.moved"]).toBeGreaterThanOrEqual(0);
      expect(m["pack.anchor.moved"]).toBeLessThanOrEqual(1);
      expect(m["pack.anchor.mean"]).toBeLessThanOrEqual(m["pack.anchor.max"]);
      expect(m["pack.anchor.max"]).toBeLessThanOrEqual(1);
      expect(r.gains).toHaveLength(ANCHOR_STEPS);
      const diagonal = Math.hypot(input.container.w!, input.container.h!);
      expect(r.gains[0]! * Math.hypot(step.dx, step.dy)).toBeCloseTo(m["pack.anchor.max"] * diagonal, 9);
    }
  });

  it("refuses an id that is not an anchor, a step of length 0 and bad options", () => {
    expect(() => anchorStability(FAR, ROWS, "a", { dx: 1, dy: 0 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "nope", { dx: 1, dy: 0 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "L", { dx: 0, dy: 0 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "L", { dx: Number.NaN, dy: 0 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "L", { dx: 1, dy: 0 }, { steps: 0 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "L", { dx: 1, dy: 0 }, { steps: 1.5 })).toThrow(RangeError);
    expect(() => anchorStability(FAR, ROWS, "L", { dx: 1, dy: 0 }, { gainLimit: -1 })).toThrow(RangeError);
  });
});

describe("moveAnchor and isAnchor", () => {
  it("move a locked item or a fixed rectangle obstacle, and nothing else", () => {
    const input: PackInput = {
      ...FAR,
      obstacles: [
        { id: "o", region: { kind: "rect", x: 100, y: 10, w: 10, h: 10 } },
        { id: "m", region: { kind: "rect", x: 120, y: 10, w: 10, h: 10 }, move: { cost: 1 } },
      ],
    };
    expect(["L", "o"].map((id) => isAnchor(input, id))).toEqual([true, true]);
    expect(["a", "m", "nope"].map((id) => isAnchor(input, id))).toEqual([false, false, false]);
    expect(moveAnchor(input, "L", -3, 2).items.find((i) => i.id === "L")).toMatchObject({ x: 177, y: 82 });
    expect(moveAnchor(input, "o", 5, -1).obstacles![0]!.region).toEqual({ kind: "rect", x: 105, y: 9, w: 10, h: 10 });
    expect(moveAnchor(input, "o", 5, -1).items).toEqual(input.items);
    expect(() => moveAnchor(input, "m", 1, 0)).toThrow(RangeError);
    // An obstacle anchor also works in the measure
    expect(anchorStability({ ...input, obstacles: [input.obstacles![0]!] }, ROWS, "o", { dx: 1, dy: 0 }).measures["pack.anchor.settled"]).toBe(1);
  });
});

describe("anchorStep", () => {
  it("moves along the wall of the anchor, by 1% of the width, and turns back before a fixed side", () => {
    const input = toPackInput(wallLocks.generate(1, { locks: 4, count: 40 }));
    const out = packWith("rows", input);
    const len = Math.max(1, Math.round(input.container.w! / 100));
    expect(anchorStep(input, out, "l0")).toEqual({ dx: len, dy: 0 });
    expect(anchorStep(input, out, "l1")).toEqual({ dx: 0, dy: len });
    expect(anchorStep(input, out, "l2")).toEqual({ dx: 0, dy: len });
    expect(anchorStep(input, out, "l3")).toEqual({ dx: len, dy: 0 });
    // A lock in the bottom right corner has no room to the right, so it goes to the left
    const corner: PackInput = { container: { w: 200, h: 100, fixed: "size" }, items: [lock("c", 190, 90, 10, 10), box("a", 10, 10)] };
    expect(anchorStep(corner, packWith("rows", corner), "c")).toEqual({ dx: -2, dy: 0 });
    // A lock on only a side wall, near the bottom, goes up
    const side: PackInput = { container: { w: 200, h: 100, fixed: "size" }, items: [lock("s", 0, 85, 10, 10), box("a", 10, 10)] };
    expect(anchorStep(side, packWith("rows", side), "s")).toEqual({ dx: 0, dy: -2 });
    expect(() => anchorStep(side, packWith("rows", side), "a")).toThrow(RangeError);
  });
});
