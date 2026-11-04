// The Sleator strip of roadmap item k52. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, exactStrip, mulberry32, perfectCutOf, sleatorRefusal, sleatorStrip, type Item, type PackInput } from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up strip. Each width is at most `widest`. */
function drawn(seed: number, count: number, W: number, widest: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * widest), h: 1 + Math.floor(random() * 100) });
  return { container: { fixed: "width", w: W }, items };
}

/** This function gives the proved bound for an optimum. */
const boundOf = (input: PackInput, optimum: number): number => 2 * optimum + Math.max(...input.items.map((i) => i.h)) / 2;

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: Parameters<typeof checkHard>[1]): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

describe("sleatorStrip", () => {
  it("stacks the wide items, then fills one level above them", () => {
    const { output, height } = sleatorStrip(strip(10, [[6, 2], [7, 3], [3, 4], [3, 2]]));
    expect(output.placements).toEqual([
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 0, y: 2 },
      { id: "i2", x: 0, y: 5 },
      { id: "i3", x: 3, y: 5 },
    ]);
    expect(height).toBe(9);
  });

  it("gives the next level to the half with the lower top", () => {
    // The first level is i0, i1 and i2. The left top is 8, and the right top is 4, so i3 goes to the right half.
    const { output, height } = sleatorStrip(strip(10, [[4, 8], [4, 4], [2, 3], [5, 3]]));
    expect(output.placements[3]).toEqual({ id: "i3", x: 5, y: 4 });
    expect(height).toBe(8);
  });

  it("gives a tie of the two tops to the left half", () => {
    const { output } = sleatorStrip(strip(10, [[5, 4], [5, 4], [5, 2]]));
    expect(output.placements[2]).toEqual({ id: "i2", x: 0, y: 4 });
  });

  it("packs an empty input to a height of 0", () => {
    const result = sleatorStrip(strip(10, []));
    expect(result.height).toBe(0);
  });

  it("gives the height of one item", () => {
    expect(sleatorStrip(strip(10, [[10, 7]])).height).toBe(7);
    expect(sleatorStrip(strip(10, [[1, 7]])).height).toBe(7);
  });

  it("gives equal placements for two packs of one input", () => {
    const input = drawn(7, 200, 200, 80);
    expect(sleatorStrip(input)).toEqual(sleatorStrip(input));
  });

  it("keeps the input order for items of equal height", () => {
    const { output } = sleatorStrip(strip(10, [[2, 5], [3, 5], [1, 5]]));
    expect(output.placements.map((p) => p.x)).toEqual([0, 2, 5]);
  });

  it("keeps the proved bound on 1000 perfect cuts, where the optimum is the height of the cut", () => {
    let breaks = 0;
    let bad = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const { w, h, pieces } = perfectCutOf(seed, { cut: seed % 2 === 0 ? "free" : "guillotine", count: 5 + (seed % 200), containerSize: "freeHeight" });
      const input = strip(w, pieces.map((p) => [p.w, p.h]));
      const { output, height } = sleatorStrip(input);
      if (height > boundOf(input, h)) breaks++;
      bad += hardBreaks(input, output);
    }
    expect(breaks).toBe(0);
    expect(bad).toBe(0);
  });

  it("keeps the proved bound on made-up strips with a proved optimum", () => {
    let proved = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const input = drawn(seed, 6, 200, 1 + (seed % 200));
      const exact = exactStrip(input);
      if (exact.status !== "optimal") continue;
      proved++;
      expect(sleatorStrip(input).height).toBeLessThanOrEqual(boundOf(input, exact.height));
    }
    expect(proved).toBe(100);
  });

  it("has a height of the tallest item for a thin tall item, above an area form of the bound", () => {
    // This input is the reason that the bound names the optimum: twice the area over the width is only 1 here.
    const input = strip(200, [[1, 100]]);
    expect(sleatorStrip(input).height).toBe(100);
    expect(boundOf(input, 100)).toBe(250);
  });

  it("refuses an input outside the method", () => {
    const base = strip(10, [[2, 2]]);
    expect(sleatorRefusal(base)).toBeNull();
    expect(sleatorRefusal({ ...base, container: { fixed: "size", w: 10, h: 10 } })).toContain("strip");
    expect(sleatorRefusal({ ...base, gap: 1 })).toContain("gap");
    expect(sleatorRefusal(strip(10, [[11, 2]]))).toContain("wider");
    expect(sleatorRefusal({ ...base, items: [{ id: "a", w: 2, h: 2, locked: true, x: 0, y: 0 }] })).toContain("locked");
    expect(() => sleatorStrip(strip(10, [[11, 2]]))).toThrow(RangeError);
  });
});
