// The shelf with the best breaks of roadmap item k29. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, measure, mulberry32, packWith, shelfBreaks, shelfBreaksRefusal, type Item, type PackInput } from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up strip. Each width is at most the width of the strip, and some items have a rank. */
function drawn(seed: number, count: number, W: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const item: Item = { id: `i${i}`, w: 1 + Math.floor(random() * W), h: 1 + Math.floor(random() * 100) };
    items.push(random() < 0.3 ? { ...item, rank: Math.floor(random() * count) } : item);
  }
  return { container: { fixed: "width", w: W }, items };
}

/** This function gives the least height of all the breaks of the order, by a search of each set of breaks. */
function searchedHeight(input: PackInput): number {
  const W = input.container.w!;
  const order = input.items.map((item, index) => ({ item, index, rank: item.rank ?? index })).sort((a, b) => a.rank - b.rank || a.index - b.index).map((e) => e.item);
  let least = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 2 ** Math.max(0, order.length - 1); mask++) {
    let height = 0;
    let used = 0;
    let tallest = 0;
    let fits = true;
    order.forEach((item, k) => {
      if (k > 0 && (mask >> (k - 1)) & 1) {
        height += tallest;
        used = 0;
        tallest = 0;
      }
      if (used > 0 && used + item.w > W) fits = false;
      used += item.w;
      tallest = Math.max(tallest, item.h);
    });
    if (fits) least = Math.min(least, height + tallest);
  }
  return order.length === 0 ? 0 : least;
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: Parameters<typeof checkHard>[1]): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

describe("shelfBreaks", () => {
  it("puts a short item alone, so that the two tall items share a row", () => {
    // The greedy shelf puts i0 and i1 in one row of height 5, and i2 in a second row of height 5.
    const input = strip(10, [[6, 1], [4, 5], [6, 5]]);
    const { output, height, rows } = shelfBreaks(input);
    expect(output.placements).toEqual([
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 0, y: 1 },
      { id: "i2", x: 4, y: 1 },
    ]);
    expect([height, rows]).toEqual([6, 2]);
    expect(packWith("shelf", input, { sortOrder: "input" }).size.h).toBe(10);
  });

  it("takes the longest last row on a tie of height and rows", () => {
    // The rows [i0 i1] [i2] and [i0] [i1 i2] both have the height 8. The function takes the second set of rows.
    const { output, height, rows } = shelfBreaks(strip(10, [[5, 4], [5, 4], [5, 4]]));
    expect([height, rows]).toEqual([8, 2]);
    expect(output.placements).toEqual([
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 0, y: 4 },
      { id: "i2", x: 5, y: 4 },
    ]);
  });

  it("keeps the order of the ranks", () => {
    const input: PackInput = { container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 3, h: 2, rank: 2 }, { id: "b", w: 3, h: 2, rank: 0 }, { id: "c", w: 3, h: 2, rank: 1 }] };
    const { output } = shelfBreaks(input);
    expect(output.placements).toEqual([
      { id: "a", x: 6, y: 0 },
      { id: "b", x: 0, y: 0 },
      { id: "c", x: 3, y: 0 },
    ]);
  });

  it("packs an empty input to a height of 0", () => {
    expect(shelfBreaks(strip(10, [])).height).toBe(0);
  });

  it("gives the least height of all the breaks on 300 small made-up strips", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const input = drawn(seed, 1 + (seed % 10), 20);
      expect(shelfBreaks(input).height, `seed ${seed}`).toBe(searchedHeight(input));
    }
  });

  it("is never higher than the greedy shelf in the input order, keeps the order and breaks no hard rule, on 200 made-up strips", () => {
    let lower = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 10 + (seed % 90), 100);
      const result = shelfBreaks(input);
      const greedy = packWith("shelf", input, { sortOrder: "input" }).size.h;
      expect(result.height, `seed ${seed}`).toBeLessThanOrEqual(greedy);
      if (result.height < greedy) lower += 1;
      expect(measure(input, result.output)["pack.order.inversions"], `seed ${seed}`).toBe(0);
      expect(hardBreaks(input, result.output), `seed ${seed}`).toBe(0);
    }
    // The made-up strips have mixed heights, so the breaks of the program differ from the greedy breaks on most of them.
    expect(lower).toBeGreaterThan(100);
  });

  it("gives equal placements for two packs of one input", () => {
    const input = drawn(7, 60, 100);
    expect(shelfBreaks(input).output).toEqual(shelfBreaks(input).output);
  });

  it("refuses the inputs that the Sleator strip refuses", () => {
    expect(shelfBreaksRefusal(strip(10, [[11, 1]]))).toBe("item i0 is wider than the strip");
    expect(shelfBreaksRefusal({ container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 2, h: 2, locked: true, x: 0, y: 0 }] })).toBe("item a is locked");
    expect(() => shelfBreaks(strip(10, [[11, 1]]))).toThrow(RangeError);
    expect(shelfBreaksRefusal(strip(10, [[4, 1]]))).toBeNull();
  });

  it("is the strategy shelf-breaks, which refuses an input with a refusal and not a failure", () => {
    const input = strip(10, [[6, 1], [4, 5], [6, 5]]);
    expect(packWith("shelf-breaks", input).size.h).toBe(6);
    expect(() => packWith("shelf-breaks", strip(10, [[11, 1]]))).toThrow(/refuses the input: item i0 is wider than the strip/);
  });
});
