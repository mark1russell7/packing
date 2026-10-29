import { describe, expect, it } from "vitest";
import type { PackInput } from "@mark1russell7/packing";
import { containerArea, fixedSides, INPUT_FEATURES, inputFeatures, NO_VALUE, twoDigits } from "./input-features.ts";

// The input features of roadmap item k116. Each test input is small, so each value is easy to check by hand.

/** A fixed 100 by 50 container with 4 free items and one locked item. */
const FIXED: PackInput = {
  container: { w: 100, h: 50, fixed: "size" },
  items: [
    { id: "a", w: 10, h: 10 },
    { id: "b", w: 20, h: 10, turnable: true },
    { id: "c", w: 40, h: 10, margin: 2 },
    { id: "d", w: 10, h: 30, margin: { top: 1, right: 1, bottom: 1, left: 1 } },
    { id: "lock", w: 10, h: 10, x: 0, y: 0, locked: true },
  ],
  obstacles: [{ id: "o", region: { kind: "rect", x: 50, y: 0, w: 10, h: 10 } }],
  gap: 3,
};

describe("the input features", () => {
  it("gives each named feature, in the order of INPUT_FEATURES", () => {
    expect(Object.keys(inputFeatures(FIXED))).toEqual(INPUT_FEATURES);
  });

  it("gives the counts, the fill, the obstacles and the shape facts of a fixed container", () => {
    const f = inputFeatures(FIXED);
    expect(f["in.count"]).toBe("4");
    expect(f["in.locked"]).toBe("1");
    // The free items have the area 100 + 200 + 400 + 300 = 1000. The container has 5000.
    expect(f["in.fill"]).toBe("0.2");
    // The obstacle and the locked item have 100 + 100 over 5000.
    expect(f["in.obstacles"]).toBe("0.04");
    expect(f["in.fixed"]).toBe("size");
    expect(f["in.container"]).toBe("rect");
    expect(f["in.items"]).toBe("rect");
    expect(f["in.turnable"]).toBe("0.25");
  });

  it("gives the aspects and the spread of the areas", () => {
    const f = inputFeatures(FIXED);
    // The aspects are 1, 2, 4 and 3.
    expect(f["in.aspect.mean"]).toBe("2.5");
    expect(f["in.aspect.max"]).toBe("4");
    expect(f["in.aspect.spread"]).toBe(twoDigits(Math.sqrt(1.25)));
    expect(f["in.area.cv"]).toBe(twoDigits(Math.sqrt(12500) / 250));
  });

  it("gives the largest side over the fixed side, and a turnable item takes its better turn", () => {
    // Item c is 40 by 10: 0.4 of the width. Item d is 10 by 30: 0.6 of the height.
    expect(inputFeatures(FIXED)["in.side.max"]).toBe("0.6");
    const turn: PackInput = { container: { w: 100, h: 50, fixed: "size" }, items: [{ id: "t", w: 10, h: 80, turnable: true }] };
    // Turned, the item is 80 by 10: 0.8 of the width, not 1.6 of the height.
    expect(inputFeatures(turn)["in.side.max"]).toBe("0.8");
    const stiff: PackInput = { ...turn, items: [{ id: "t", w: 10, h: 80 }] };
    expect(inputFeatures(stiff)["in.side.max"]).toBe("1.6");
  });

  it("gives the margin and the gap over the mean item side", () => {
    // The mean item side is (10 + 15 + 25 + 20) / 4 = 17.5. The mean margin is (0 + 0 + 2 + 1) / 4 = 0.75.
    const f = inputFeatures(FIXED);
    expect(f["in.margin"]).toBe(twoDigits(0.75 / 17.5));
    expect(f["in.gap"]).toBe(twoDigits(3 / 17.5));
    // Without a gap, the largest pair gap is the gap.
    const pairs: PackInput = { ...FIXED, gap: 0, pairGaps: [{ a: "a", b: "b", gap: 7 }] };
    expect(inputFeatures(pairs)["in.gap"]).toBe("0.4");
  });

  it("gives -1 for the fill and the largest side of a free container", () => {
    const free: PackInput = { container: { fixed: "none" }, items: [{ id: "a", w: 10, h: 10 }] };
    const f = inputFeatures(free);
    expect(f["in.fill"]).toBe(NO_VALUE);
    expect(f["in.side.max"]).toBe(NO_VALUE);
    expect(f["in.obstacles"]).toBe("0");
    expect(fixedSides(free)).toEqual({ w: undefined, h: undefined });
    expect(containerArea(free)).toBeUndefined();
    // A fixed width gives the largest side over the width only.
    const width: PackInput = { container: { w: 40, fixed: "width" }, items: [{ id: "a", w: 10, h: 100 }] };
    expect(inputFeatures(width)["in.side.max"]).toBe("0.25");
  });

  it("tells the forced overflow: a full container with large knobs has a fill above 1 and large knobs", () => {
    const tight: PackInput = {
      container: { w: 20, h: 20, fixed: "size" },
      items: Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, w: 10, h: 10, margin: 4 })),
      gap: 6,
    };
    const f = inputFeatures(tight);
    expect(Number(f["in.fill"])).toBeGreaterThan(1);
    expect(f["in.margin"]).toBe("0.4");
    expect(f["in.gap"]).toBe("0.6");
  });

  it("gives the area of a shape, and the same features for the same input", () => {
    const shaped: PackInput = { container: { fixed: "size", shape: { kind: "rect", x: 0, y: 0, w: 30, h: 10 } }, items: [{ id: "a", w: 3, h: 10 }] };
    expect(containerArea(shaped)).toBe(300);
    expect(fixedSides(shaped)).toEqual({ w: 30, h: 10 });
    expect(inputFeatures(shaped)["in.fill"]).toBe("0.1");
    expect(inputFeatures(FIXED)).toEqual(inputFeatures(structuredClone(FIXED)));
  });

  it("gives 2 significant digits, and 0 for -0", () => {
    expect(twoDigits(0.123456)).toBe("0.12");
    expect(twoDigits(1234)).toBe("1200");
    expect(twoDigits(-0)).toBe("0");
  });
});
