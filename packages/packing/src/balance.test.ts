import { describe, expect, it } from "vitest";
import { balanceContainerOf, measure, measureChange, measureSeed, packWith, stabilityUnitOf, type PackInput, type PackOutput } from "@mark1russell7/packing";

// The balance and stability measures of roadmap item k123. The contract computes them. These tests check the inputs that packing gives.

/** This function gives an output with the placements and the size. */
const out = (placements: { id: string; x: number; y: number }[], size = { w: 100, h: 100 }): PackOutput => ({ placements, overflow: [], moved: [], size });

/** Four boxes of 10 by 10 in a fixed container of 100 by 100. */
const input: PackInput = { container: { fixed: "size", w: 100, h: 100 }, items: ["a", "b", "c", "d"].map((id) => ({ id, w: 10, h: 10 })) };

describe("the balance measures", () => {
  it("give a high side range for a pack in one corner, and a low one for a spread pack", () => {
    const corner = measure(input, out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 0, y: 10 }, { id: "d", x: 10, y: 10 }]));
    const spread = measure(input, out([{ id: "a", x: 10, y: 10 }, { id: "b", x: 80, y: 10 }, { id: "c", x: 10, y: 80 }, { id: "d", x: 80, y: 80 }]));
    expect(corner["pack.balance.sideRange"]).toBeGreaterThan(0.1);
    expect(corner["pack.balance.centroidOffset"]).toBeGreaterThan(spread["pack.balance.centroidOffset"]);
    expect(spread["pack.balance.sideRange"]).toBeCloseTo(0, 12);
    expect(spread["pack.balance.gapCv"]).toBeCloseTo(0, 12);
    for (const m of [corner, spread]) for (const side of ["top", "right", "bottom", "left"] as const) expect(m[`pack.balance.side.${side}`]).toBeGreaterThanOrEqual(0);
  });

  it("use the fixed sides of the container and the output size for the free sides", () => {
    const o = out([], { w: 40, h: 70 });
    expect(balanceContainerOf(input, o)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(balanceContainerOf({ ...input, container: { fixed: "width", w: 100 } }, o)).toEqual({ x: 0, y: 0, w: 100, h: 70 });
    expect(balanceContainerOf({ ...input, container: { fixed: "height", h: 50 } }, o)).toEqual({ x: 0, y: 0, w: 40, h: 50 });
    expect(balanceContainerOf({ ...input, container: { fixed: "none" } }, o)).toEqual({ x: 0, y: 0, w: 40, h: 70 });
  });
});

describe("the stability measures", () => {
  const base = out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 0, y: 10 }, { id: "d", x: 10, y: 10 }]);

  it("give 0 for a move of the whole layout, and divide by the change share", () => {
    const moved = out(base.placements.map((p) => ({ ...p, x: p.x + 30, y: p.y + 5 })));
    expect(measureChange(input, base, input, moved)["pack.stability.procrustes"]).toBeCloseTo(0, 12);
    const one = out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 0, y: 10 }, { id: "d", x: 40, y: 10 }]);
    const same = measureChange(input, base, input, one)["pack.stability.procrustes"];
    // No change counts as 1 box of 4. Two new items give the share 2/4, so the value is half.
    const added: PackInput = { ...input, items: [...input.items, { id: "e", w: 5, h: 5 }, { id: "f", w: 5, h: 5 }] };
    expect(measureChange(input, base, added, one)["pack.stability.procrustes"]).toBeCloseTo(same / 2, 12);
    expect(same).toBeGreaterThan(0);
  });

  it("use the container width for a fixed width, and the width of the boxes with their margins for a free size", () => {
    expect(stabilityUnitOf(input, base)).toBe(100);
    const free: PackInput = { container: { fixed: "none" }, items: input.items.map((i) => ({ ...i, margin: 1 })) };
    expect(stabilityUnitOf(free, base)).toBe(22);
  });

  it("give 0 between two seeds of a strategy that does not read the seed", () => {
    const a = packWith("rows", input, undefined, 0);
    const b = packWith("rows", input, undefined, 1);
    expect(measureSeed(input, a, b)["pack.stability.seed"]).toBe(0);
  });
});
