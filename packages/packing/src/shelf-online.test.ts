// The online shelf of roadmap item k30. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, mulberry32, packWith, shelfOnline, shelfOnlineRefusal, type Item, type PackInput } from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up strip with real heights. Each width is at most the width of the strip. */
function drawn(seed: number, count: number, W: number, ranks: boolean): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const item: Item = { id: `i${i}`, w: 1 + Math.floor(random() * W), h: 0.5 + random() * 99.5 };
    items.push(ranks && random() < 0.3 ? { ...item, rank: Math.floor(random() * count) } : item);
  }
  return { container: { fixed: "width", w: W }, items };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: Parameters<typeof checkHard>[1]): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

describe("shelfOnline", () => {
  it("opens a shelf of the height of a power of r for each class", () => {
    // With r = 0.5, the heights 3 and 4 have the shelf 4, and the height 2 has the shelf 2.
    const { output, height, shelves } = shelfOnline(strip(10, [[6, 3], [6, 4], [4, 3], [5, 2]]), { r: 0.5, fit: "next" });
    expect(output.placements).toEqual([
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 0, y: 4 },
      { id: "i2", x: 6, y: 4 },
      { id: "i3", x: 0, y: 8 },
    ]);
    expect([height, shelves]).toEqual([10, 3]);
  });

  it("examines each shelf of the class with first fit, and only the last shelf with next fit", () => {
    const input = strip(10, [[6, 3], [6, 3], [4, 3], [4, 3]]);
    expect(shelfOnline(input, { fit: "next" }).height).toBe(12);
    const first = shelfOnline(input, { fit: "first" });
    expect(first.height).toBe(8);
    expect(first.output.placements.slice(2)).toEqual([
      { id: "i2", x: 6, y: 0 },
      { id: "i3", x: 6, y: 4 },
    ]);
    expect(shelfOnline(input).height).toBe(8);
  });

  it("gives a height that is a power of r to the shelf of the same height, with no float error", () => {
    expect(shelfOnline(strip(10, [[2, 4]]), { r: 0.5 }).height).toBe(4);
    expect(shelfOnline(strip(10, [[2, 0.25]]), { r: 0.5 }).height).toBe(0.25);
    const small = shelfOnline(strip(10, [[2, 0.001]]), { r: 0.1 }).height;
    expect(small).toBeGreaterThanOrEqual(0.001);
    expect(small).toBeLessThan(0.0011);
  });

  it("packs an empty input to a height of 0", () => {
    expect(shelfOnline(strip(10, [])).height).toBe(0);
  });

  it("stays under the bound of Baker and breaks no hard rule, on 200 made-up strips with each fit and three values of r", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 10 + (seed % 90), 100, true);
      const W = input.container.w!;
      const area = input.items.reduce((sum, item) => sum + item.w * item.h, 0);
      const tallest = Math.max(...input.items.map((item) => item.h));
      for (const fit of ["next", "first"] as const) {
        for (const r of [0.3, 0.5, 0.7]) {
          const result = shelfOnline(input, { r, fit });
          const bound = ((2 / r) * area) / W + tallest / (r * (1 - r));
          expect(result.height, `seed ${seed} ${fit} ${r}`).toBeLessThan(bound);
          expect(result.height, `seed ${seed} ${fit} ${r}`).toBeGreaterThanOrEqual(area / W);
          expect(hardBreaks(input, result.output), `seed ${seed} ${fit} ${r}`).toBe(0);
        }
      }
    }
  });

  it("gives the same places to the items of each prefix of the input, on 200 made-up strips", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 5 + (seed % 25), 60, false);
      for (const fit of ["next", "first"] as const) {
        const whole = shelfOnline(input, { fit }).output.placements;
        for (let k = 1; k < input.items.length; k++) {
          const prefix = shelfOnline({ ...input, items: input.items.slice(0, k) }, { fit }).output.placements;
          expect(prefix, `seed ${seed} ${fit} prefix ${k}`).toEqual(whole.slice(0, k));
        }
      }
    }
  });

  it("takes the items in the order of the ranks", () => {
    const input: PackInput = { container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 6, h: 3, rank: 1 }, { id: "b", w: 6, h: 3, rank: 0 }] };
    expect(shelfOnline(input).output.placements).toEqual([
      { id: "a", x: 0, y: 4 },
      { id: "b", x: 0, y: 0 },
    ]);
  });

  it("gives equal placements for two packs of one input", () => {
    const input = drawn(7, 60, 100, true);
    expect(shelfOnline(input).output).toEqual(shelfOnline(input).output);
  });

  it("refuses the inputs that the Sleator strip refuses, and a value of r out of range", () => {
    expect(shelfOnlineRefusal(strip(10, [[11, 1]]))).toBe("item i0 is wider than the strip");
    expect(() => shelfOnline(strip(10, [[11, 1]]))).toThrow(RangeError);
    expect(shelfOnlineRefusal(strip(10, [[4, 1]]))).toBeNull();
    for (const r of [0, 1, -0.5, Number.NaN]) expect(() => shelfOnline(strip(10, [[4, 1]]), { r }), String(r)).toThrow(/r must be more than 0 and less than 1/);
  });

  it("is the strategy shelf-online, which refuses an input with a refusal and not a failure", () => {
    const input = strip(10, [[6, 3], [6, 3], [4, 3], [4, 3]]);
    expect(packWith("shelf-online", input).size.h).toBe(8);
    expect(packWith("shelf-online", input, { fit: "next" }).size.h).toBe(12);
    expect(() => packWith("shelf-online", strip(10, [[11, 1]]))).toThrow(/refuses the input: item i0 is wider than the strip/);
  });
});
