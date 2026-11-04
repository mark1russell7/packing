// The beam search of roadmap item k85. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { beamStrip, checkHard, exactStrip, mulberry32, perfectCutOf, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";

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

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

describe("beamStrip", () => {
  it("packs an empty input to a height of 0", () => {
    expect(beamStrip(strip(10, []))).toMatchObject({ height: 0, completions: 1 });
  });

  it("gives the height of one item", () => {
    expect(beamStrip(strip(10, [[3, 7]])).height).toBe(7);
  });

  it("reaches the proved optimum of a small strip", () => {
    const input = strip(10, [[6, 4], [4, 6], [5, 5], [5, 5]]);
    const greedy = beamStrip(input, { width: 1 }).height;
    const wide = beamStrip(input, { width: 4 }).height;
    expect(wide).toBeLessThanOrEqual(greedy);
    expect(wide).toBe(exactStrip(input).height);
  });

  it("gives one layout for equal items in the input order", () => {
    const { output, height } = beamStrip(strip(10, [[5, 2], [5, 2], [5, 2], [5, 2]]));
    expect(height).toBe(4);
    expect(new Set(output.placements.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    expect(output.placements.map((p) => p.id)).toEqual(["i0", "i1", "i2", "i3"]);
  });

  it("gives equal bytes for two searches of one input", () => {
    const input = drawn(7, 60, 200, 80);
    expect(JSON.stringify(beamStrip(input, { width: 4 }))).toBe(JSON.stringify(beamStrip(input, { width: 4 })));
  });

  it("is never above the first completion, and it has no hard rule break on 200 made-up inputs", () => {
    let bad = 0;
    let above = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 1 + (seed % 40), 200, 1 + (seed % 200));
      const result = beamStrip(input, { width: 3 });
      bad += hardBreaks(input, result.output);
      expect(result.output.placements.length).toBe(input.items.length);
      if (result.height > beamStrip(input, { width: 1 }).height) above++;
    }
    expect(bad).toBe(0);
    expect(above).toBe(0);
  });

  it("is never below the proved optimum", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { w, h, pieces } = perfectCutOf(seed, { cut: "free", count: 8, containerSize: "freeHeight" });
      expect(beamStrip(strip(w, pieces.map((p) => [p.w, p.h])), { width: 3 }).height).toBeGreaterThanOrEqual(h);
    }
  });

  it("counts the completions of a width of 1 as one for each item, plus the first", () => {
    expect(beamStrip(drawn(3, 30, 200, 60), { width: 1 }).completions).toBe(31);
  });

  it("refuses an input outside the method and a bad width", () => {
    expect(() => beamStrip(strip(10, [[11, 2]]))).toThrow(RangeError);
    expect(() => beamStrip(strip(10, [[1, 2]]), { width: 0 })).toThrow(RangeError);
    expect(() => beamStrip(strip(10, [[1, 2]]), { width: 1.5 })).toThrow(RangeError);
  });
});
