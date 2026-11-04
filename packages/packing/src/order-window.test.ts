// The window order of roadmap item k31. Each test uses made-up lists.
import { describe, expect, it } from "vitest";
import { mulberry32, windowOrder } from "@mark1russell7/packing";

/** This function gives a made-up list of heights with their input places. */
function drawn(seed: number, count: number): { readonly at: number; readonly h: number }[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, at) => ({ at, h: 1 + Math.floor(random() * 100) }));
}

/** This function gives the heights of a list. */
const heights = (list: readonly { readonly h: number }[]): readonly number[] => list.map((x) => x.h);

describe("windowOrder", () => {
  it("keeps the input order with a window of 1", () => {
    const list = drawn(1, 40);
    expect(windowOrder(list, 1)).toEqual(list);
  });

  it("gives the stable height sort with a window of the count", () => {
    const list = drawn(2, 40);
    const sorted = list.slice().sort((a, b) => b.h - a.h);
    expect(windowOrder(list, 40)).toEqual(sorted);
    expect(windowOrder(list, 1000)).toEqual(sorted);
  });

  it("takes the tallest of the next items", () => {
    expect(heights(windowOrder([{ h: 1 }, { h: 3 }, { h: 2 }, { h: 9 }], 2))).toEqual([3, 2, 9, 1]);
  });

  it("takes the first of two equal items", () => {
    const list = [{ h: 2, at: 0 }, { h: 2, at: 1 }];
    expect(windowOrder(list, 2).map((x) => x.at)).toEqual([0, 1]);
  });

  it("gives an empty list back, and it does not change its argument", () => {
    expect(windowOrder([], 3)).toEqual([]);
    const list = drawn(3, 10);
    const copy = JSON.stringify(list);
    windowOrder(list, 4);
    expect(JSON.stringify(list)).toBe(copy);
  });

  it("gives equal bytes for two orders of one list", () => {
    const list = drawn(4, 60);
    expect(JSON.stringify(windowOrder(list, 5))).toBe(JSON.stringify(windowOrder(list, 5)));
  });

  it("keeps each item at most window - 1 places before its input place on 1000 made-up lists", () => {
    let early = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const window = 1 + (seed % 12);
      const out = windowOrder(drawn(seed, 5 + (seed % 60)), window);
      out.forEach((x, place) => {
        if (place < x.at - (window - 1)) early++;
      });
      expect(new Set(out.map((x) => x.at)).size).toBe(out.length);
    }
    expect(early).toBe(0);
  });

  it("refuses a bad window", () => {
    expect(() => windowOrder([], 0)).toThrow(RangeError);
    expect(() => windowOrder([], 1.5)).toThrow(RangeError);
  });
});
