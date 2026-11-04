// The bench of `keepPrefix`. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { measure, METHODS } from "./prefix.ts";

describe("prefix bench", () => {
  it("has one line for each step and no break on a short chain", () => {
    const measured = measure("maxrects-bl", 3, 30, 0.1, 3);
    expect(measured.breaks).toBe(0);
    for (const method of METHODS) expect(measured.steps[method]).toHaveLength(3);
    expect(measured.steps.fresh.every((l) => l.cost === 1)).toBe(true);
    expect(measured.pinned.every((p) => p >= 0 && p <= 1)).toBe(true);
  });
});
