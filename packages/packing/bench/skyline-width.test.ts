import { describe, expect, it } from "vitest";
import { logSlope, scaleInput, widthLines, widthShare, type WidthRow } from "./skyline-width.ts";

/** This function makes one row of an arm with a time that grows by a power of the scale. */
function row(scale: number, seed: number, power: number): WidthRow {
  return { form: "freeArea", sizes: "uniform", count: 100, scale, seed, arm: "a", ms: 2 * seed * scale ** power, runs: 5 };
}

describe("the read of the time against the width", () => {
  it("scales the sizes of the items and of the container, and not the aspect", () => {
    const scaled = scaleInput({ container: { fixed: "width", w: 10, aspect: 2 }, items: [{ id: "a", w: 3, h: 4 }] }, 4);
    expect(scaled.container).toEqual({ fixed: "width", w: 40, aspect: 2 });
    expect(scaled.items).toEqual([{ id: "a", w: 12, h: 16 }]);
  });

  it("refuses an input with a part that it does not scale", () => {
    expect(() => scaleInput({ container: { fixed: "none" }, items: [], gap: 1 }, 2)).toThrow(RangeError);
    const margin = { id: "a", w: 1, h: 1, margin: 1 } as Parameters<typeof scaleInput>[0]["items"][number];
    expect(() => scaleInput({ container: { fixed: "none" }, items: [margin] }, 2)).toThrow(RangeError);
  });

  it("reads the slope of a known power, and 0 for a flat arm", () => {
    expect(logSlope(5, 5 * 64, 1, 64)).toBeCloseTo(1);
    expect(logSlope(5, 5, 1, 64)).toBeCloseTo(0);
  });

  it("gives all of the time to the width on a line through 0, and none on a flat line", () => {
    expect(widthShare(2, 128, 1, 64)).toBeCloseTo(1);
    expect(widthShare(5, 5, 1, 64)).toBe(0);
    expect(widthShare(5, 4, 1, 64)).toBe(0);
  });

  it("reads only the scales with a row for each seed", () => {
    const seeds = [1, 2, 3];
    const rows = [...seeds.flatMap((seed) => [row(1, seed, 1), row(4, seed, 1)]), row(16, 1, 1)];
    const [line] = widthLines(rows, seeds);
    expect(line!.largest).toBe(4);
    expect(line!.slope.median).toBeCloseTo(1);
    expect(line!.ms["16"]).toBe(32);
  });

  it("gives no line with fewer than 2 full scales", () => {
    expect(widthLines([row(1, 1, 1)], [1, 2])).toEqual([]);
  });
});
