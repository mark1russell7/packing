// The bench of `matchPlaces`. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { firstStrip } from "./pin.ts";
import { measure, METHODS, sized } from "./match.ts";

describe("match bench", () => {
  it("rounds each size up to a step in the family cards", () => {
    const input = sized(firstStrip(1, 20), "cards");
    expect(input.items.every((item) => item.w % 20 === 0 && item.h % 25 === 0)).toBe(true);
    expect(sized(firstStrip(1, 20), "free")).toEqual(firstStrip(1, 20));
  });

  it("gives the match the height of a fresh pack and no break on a short chain", () => {
    const measured = measure("maxrects-bl", "cards", 3, 30, 0.1, 3);
    expect(measured.breaks).toBe(0);
    for (const method of METHODS) expect(measured.steps[method]).toHaveLength(3);
    expect(measured.steps.match.every((l) => l.cost === 1)).toBe(true);
  });
});
