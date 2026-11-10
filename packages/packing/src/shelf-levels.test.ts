// The level packers of roadmap item k211: split-fit, floor-ceiling and the knapsack levels. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import {
  checkHard,
  mulberry32,
  packWith,
  SHELF_KNAPSACK_STATES,
  shelfFloorCeiling,
  shelfKnapsack,
  shelfLevelsRefusal,
  shelfSplitFit,
  type Item,
  type PackInput,
  type ShelfLevelsResult,
} from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up strip. With `whole`, each side is a whole number. Each width is at most the width of the strip. */
function drawn(seed: number, count: number, W: number, whole: boolean): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const w = whole ? 1 + Math.floor(random() * W) : 0.5 + random() * (W - 0.5);
    const h = whole ? 1 + Math.floor(random() * 20) : 0.5 + random() * 99.5;
    items.push(random() < 0.2 ? { id: `i${i}`, w, h, rank: Math.floor(random() * count) } : { id: `i${i}`, w, h });
  }
  return { container: { fixed: "width", w: W }, items };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: Parameters<typeof checkHard>[1]): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function gives the place `[x, y]` of each item, by id. */
const placesOf = (result: ShelfLevelsResult): Record<string, readonly [number, number]> =>
  Object.fromEntries(result.output.placements.map((p) => [p.id, [p.x, p.y] as const]));

/** This function gives the items in the order of their heights, the tallest first, with a tie in the order of the ranks. */
const tallestFirst = (input: PackInput): Item[] =>
  input.items
    .map((item, index) => ({ item, rank: item.rank ?? index }))
    .toSorted((a, b) => a.rank - b.rank)
    .map((e) => e.item)
    .toSorted((a, b) => b.h - a.h);

/** The test oracle of best fit decreasing height: each item goes on the level with the least free width after it. */
function bestFitHeight(input: PackInput): number {
  const W = input.container.w!;
  const levels: { h: number; used: number }[] = [];
  for (const item of tallestFirst(input)) {
    let best: { h: number; used: number } | undefined;
    for (const level of levels) if (level.used + item.w <= W && (best === undefined || level.used > best.used)) best = level;
    if (best === undefined) levels.push({ h: item.h, used: item.w });
    else best.used += item.w;
  }
  return levels.reduce((sum, level) => sum + level.h, 0);
}

/** The test oracle of the first fit of the levels: the count of the levels and their heights. */
function firstFitLevels(items: readonly Item[], W: number): number[] {
  const levels: { h: number; used: number }[] = [];
  for (const item of items) {
    const level = levels.find((l) => l.used + item.w <= W);
    if (level === undefined) levels.push({ h: item.h, used: item.w });
    else level.used += item.w;
  }
  return levels.map((level) => level.h);
}

const PACKERS = [
  ["shelfSplitFit", "shelf-split-fit", shelfSplitFit],
  ["shelfFloorCeiling", "shelf-floor-ceiling", shelfFloorCeiling],
  ["shelfKnapsack", "shelf-knapsack", shelfKnapsack],
] as const;

describe("shelfSplitFit", () => {
  it("puts the narrow items in the region at the right side of the wide levels", () => {
    // m = 1. The wide items are wider than 6. No wide level uses more than 8, so the region starts at x = 8.
    const result = shelfSplitFit(strip(12, [[7, 4], [7, 3], [3, 2], [2, 1], [2, 1]]));
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [0, 4], i2: [8, 0], i3: [8, 2], i4: [10, 2] });
    expect([result.height, result.levels]).toEqual([7, 4]);
  });

  it("puts a wide level with more than (m + 1) W / (m + 2) in use first, and the region at the side of the other levels", () => {
    const result = shelfSplitFit(strip(12, [[9, 5], [7, 3], [3, 2]]));
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [0, 5], i2: [8, 5] });
    expect(result.height).toBe(8);
  });

  it("puts a narrow item that does not fit the region under all the levels", () => {
    // The region is 4 wide and 4 high. The item of width 5 does not fit it, and the second item of height 3 does not fit under the first one.
    const result = shelfSplitFit(strip(12, [[7, 4], [5, 3], [4, 3], [4, 3]]));
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [0, 4], i2: [8, 0], i3: [5, 4] });
    expect([result.height, result.levels]).toEqual([7, 3]);
  });

  it("gives m from the widest item, with m = 2 for widths of at most W / 2", () => {
    // m = 2: the wide items are wider than 4, and the region starts at 3 W / 4 = 9. With m = 1, it starts at 8.
    const result = shelfSplitFit(strip(12, [[5, 4], [3, 2], [2, 1]]));
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [9, 0], i2: [9, 2] });
    expect([result.height, result.levels]).toEqual([4, 3]);
    // Two items of 5 use 10 of 12, more than 3 W / 4. That level goes first, and the region has no height.
    expect(placesOf(shelfSplitFit(strip(12, [[5, 4], [5, 4], [3, 2]])))).toEqual({ i0: [0, 0], i1: [5, 0], i2: [0, 4] });
  });

  it("packs the wide items on the levels of the first fit, and breaks no hard rule, on 300 made-up strips", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const input = drawn(seed, 5 + (seed % 60), seed % 2 === 0 ? 100 : 37, seed % 3 === 0);
      const W = input.container.w!;
      const widest = Math.max(...input.items.map((item) => item.w));
      const m = Math.floor(W / widest);
      const wide = tallestFirst(input).filter((item) => (m + 1) * item.w > W);
      const levels = firstFitLevels(wide, W);
      const wideHeight = levels.reduce((sum, h) => sum + h, 0);
      const result = shelfSplitFit(input);
      expect(hardBreaks(input, result.output), `seed ${seed}`).toBe(0);
      expect(result.height, `seed ${seed}`).toBeGreaterThanOrEqual(wideHeight);
      const wideIds = new Set(wide.map((item) => item.id));
      const lowest = Math.max(0, ...result.output.placements.filter((p) => wideIds.has(p.id)).map((p) => p.y + input.items.find((item) => item.id === p.id)!.h));
      expect(lowest, `seed ${seed}`).toBeCloseTo(wideHeight, 9);
    }
  });
});

describe("shelfFloorCeiling", () => {
  it("puts an item on the ceiling only when it does not fit the floor, and an item on the ceiling stops at the floor items", () => {
    const result = shelfFloorCeiling(strip(10, [[4, 5], [4, 2], [4, 2], [4, 2]]));
    // i2 does not fit the floor, and it fits the ceiling above i1. i3 crosses i0 on the ceiling, so it opens a level.
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [4, 0], i2: [6, 3], i3: [0, 5] });
    expect([result.height, result.levels]).toEqual([7, 2]);
  });

  it("takes the floor with the least free width after the item", () => {
    const result = shelfFloorCeiling(strip(10, [[6, 5], [7, 4], [3, 3]]));
    // i2 fits the floors of both levels. The first level has 1 left after it, the second level 0. First fit takes the first level.
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [0, 5], i2: [7, 5] });
  });

  it("is best fit decreasing height when each item has the same height, on 200 made-up strips", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const base = drawn(seed, 5 + (seed % 50), 50, seed % 2 === 0);
      const input: PackInput = { ...base, items: base.items.map((item) => ({ ...item, h: 3 })) };
      expect(shelfFloorCeiling(input).height, `seed ${seed}`).toBe(bestFitHeight(input));
    }
  });

  it("breaks no hard rule, and puts items on the ceilings, on 300 made-up strips", () => {
    let ceilings = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = drawn(seed, 5 + (seed % 60), seed % 2 === 0 ? 100 : 37, seed % 3 === 0);
      const result = shelfFloorCeiling(input);
      expect(hardBreaks(input, result.output), `seed ${seed}`).toBe(0);
      // The first item of a level is at x = 0. An item on a ceiling is not at the top edge of a level.
      const tops = new Set(result.output.placements.filter((p) => p.x === 0).map((p) => p.y));
      ceilings += result.output.placements.filter((p) => !tops.has(p.y)).length;
    }
    expect(ceilings).toBeGreaterThan(0);
  });
});

describe("shelfKnapsack", () => {
  it("fills a level with the items of the largest area that fit its width", () => {
    // The first level has 5 left after i0. The item 5 x 3 has more area than the item 3 x 4.
    const result = shelfKnapsack(strip(10, [[5, 5], [3, 4], [5, 3]]));
    expect(placesOf(result)).toEqual({ i0: [0, 0], i1: [0, 5], i2: [5, 0] });
    expect([result.height, result.levels]).toEqual([9, 2]);
  });

  it("gives the first level the largest area of a search over each set of items, on 300 made-up strips with whole widths", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const input = drawn(seed, 2 + (seed % 10), 30, true);
      const [first, ...rest] = tallestFirst(input) as [Item, ...Item[]];
      let most = 0;
      for (let mask = 0; mask < 1 << rest.length; mask++) {
        let w = first.w;
        let area = 0;
        rest.forEach((item, i) => {
          if ((mask >> i) & 1) {
            w += item.w;
            area += item.w * item.h;
          }
        });
        if (w <= 30) most = Math.max(most, area);
      }
      const result = shelfKnapsack(input);
      const firstLevel = result.output.placements.filter((p) => p.y === 0 && p.id !== first.id);
      const area = firstLevel.reduce((sum, p) => {
        const item = input.items.find((i) => i.id === p.id)!;
        return sum + item.w * item.h;
      }, 0);
      expect(area, `seed ${seed}`).toBe(most);
    }
  });

  it("breaks no hard rule past SHELF_KNAPSACK_STATES states, on 20 made-up strips of 200 items with real widths", () => {
    expect(SHELF_KNAPSACK_STATES).toBe(1024);
    for (let seed = 1; seed <= 20; seed++) {
      const input = drawn(seed, 200, 100, false);
      const narrow: PackInput = { ...input, items: input.items.map((item) => ({ ...item, w: 0.5 + (item.w % 9) })) };
      const result = shelfKnapsack(narrow);
      expect(hardBreaks(narrow, result.output), `seed ${seed}`).toBe(0);
      expect(result.height, `seed ${seed}`).toBeGreaterThanOrEqual(narrow.items.reduce((sum, item) => sum + item.w * item.h, 0) / 100);
    }
  });
});

describe("the level packers of k211", () => {
  it.each(PACKERS)("%s (%s) gives an empty layout for no items, and refuses the inputs of sleatorStrip", (name, _, pack) => {
    expect(pack(strip(10, []))).toMatchObject({ height: 0, levels: 0, output: { placements: [], size: { w: 10, h: 0 } } });
    expect(shelfLevelsRefusal(strip(10, [[11, 1]]))).toBe("item i0 is wider than the strip");
    expect(() => pack(strip(10, [[11, 1]]))).toThrow(new RegExp(`^${name}: item i0 is wider than the strip$`));
    expect(() => pack({ ...strip(10, [[4, 1]]), gap: 1 })).toThrow(RangeError);
    expect(shelfLevelsRefusal(strip(10, [[4, 1]]))).toBeNull();
  });

  it.each(PACKERS)("%s (%s) gives each item a place at or over the area bound, with equal bytes for two packs, on 200 made-up strips", (_, __, pack) => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 5 + (seed % 70), 80, seed % 2 === 0);
      const result = pack(input);
      expect(result.output.placements.map((p) => p.id)).toEqual(input.items.map((item) => item.id));
      expect(result.height, `seed ${seed}`).toBeGreaterThanOrEqual(input.items.reduce((sum, item) => sum + item.w * item.h, 0) / 80 - 1e-9);
      expect(result.height, `seed ${seed}`).toBeGreaterThanOrEqual(Math.max(...input.items.map((item) => item.h)));
      expect(hardBreaks(input, result.output), `seed ${seed}`).toBe(0);
      expect(JSON.stringify(pack(input))).toBe(JSON.stringify(result));
    }
  });

  it.each(PACKERS)("%s is the strategy %s, which refuses an input with a refusal and not a failure", (_, id, pack) => {
    const input = strip(10, [[4, 5], [4, 2], [4, 2], [4, 2]]);
    expect(packWith(id, input).placements).toEqual(pack(input).output.placements);
    expect(() => packWith(id, strip(10, [[11, 1]]))).toThrow(/refuses the input: item i0 is wider than the strip/);
  });
});
