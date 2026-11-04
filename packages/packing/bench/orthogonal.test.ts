// The bench of `keepOrthogonal`. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import type { PackOutput } from "../src/index.ts";
import { flipShare, measure, METHODS } from "./orthogonal.ts";

/** This function gives an output with places. */
const output = (places: readonly (readonly [string, number, number])[]): PackOutput => ({
  placements: places.map(([id, x, y]) => ({ id, x, y })),
  size: { w: 10, h: 10 },
  overflow: [],
  moved: [],
});

describe("orthogonal bench", () => {
  it("counts a pair that changes its order", () => {
    const before = output([["a", 0, 0], ["b", 5, 0]]);
    expect(flipShare(before, before)).toBe(0);
    expect(flipShare(before, output([["a", 5, 0], ["b", 0, 0]]))).toBe(1);
    expect(flipShare(before, output([["a", 5, 0]]))).toBe(0);
  });

  it("has no flip and no break for the orthogonal method of a short chain", () => {
    const measured = measure("maxrects-bl", 3, 30, 0.1, 3);
    expect(measured.breaks).toBe(0);
    for (const method of METHODS) expect(measured.steps[method]).toHaveLength(3);
    expect(measured.steps.fresh.every((l) => l.cost === 1)).toBe(true);
    const free = measured.pinned.every((p) => p === 1);
    if (free) expect(measured.steps.orthogonal.filter((l) => l.flips > 0)).toEqual([]);
  });
});
