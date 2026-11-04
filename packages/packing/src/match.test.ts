// Repack and match of roadmap item k31. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, matchPlaces, measureChange, mulberry32, packWith, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives an output with places. */
const placed = (places: readonly (readonly [string, number, number])[]): PackOutput => ({
  placements: places.map(([id, x, y]) => ({ id, x, y })),
  size: { w: 10, h: 10 },
  overflow: [],
  moved: [],
});

/** This function gives a strip of boxes with the sizes of a small list. */
function cards(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 20 + 20 * Math.floor(random() * 3), h: 25 + 25 * Math.floor(random() * 3) });
  return { container: { fixed: "width", w: 200 }, items };
}

const input: PackInput = {
  container: { fixed: "width", w: 10 },
  items: [
    { id: "a", w: 2, h: 2 },
    { id: "b", w: 2, h: 2 },
    { id: "c", w: 3, h: 2 },
  ],
};

describe("matchPlaces", () => {
  it("gives each box of one size the place that is nearest to its old place", () => {
    const base = placed([["a", 0, 0], ["b", 2, 0], ["c", 4, 0]]);
    const fresh = placed([["a", 2, 0], ["b", 0, 0], ["c", 4, 0]]);
    expect(matchPlaces(base, input, fresh).placements).toEqual(base.placements);
  });

  it("does not change places of boxes with different sizes", () => {
    const base = placed([["a", 4, 0], ["c", 0, 0]]);
    const fresh = placed([["a", 0, 0], ["c", 4, 0]]);
    expect(matchPlaces(base, input, fresh).placements).toEqual(fresh.placements);
  });

  it("gives a new box a place that stays free", () => {
    const base = placed([["a", 2, 0], ["c", 4, 0]]);
    const fresh = placed([["a", 0, 0], ["b", 2, 0], ["c", 4, 0]]);
    expect(matchPlaces(base, input, fresh).placements).toEqual(placed([["a", 2, 0], ["b", 0, 0], ["c", 4, 0]]).placements);
  });

  it("keeps a locked item, an item with a parent, another group and another rank at their places", () => {
    const base = placed([["a", 2, 0], ["b", 0, 0]]);
    const fresh = placed([["a", 0, 0], ["b", 2, 0]]);
    const other = (b: Partial<Item>): PackInput => ({ ...input, items: [input.items[0]!, { ...input.items[1]!, ...b }] });
    for (const change of [{ locked: true }, { parent: "c" }, { group: "g" }, { rank: 2 }]) {
      expect(matchPlaces(base, other(change), fresh).placements).toEqual(fresh.placements);
    }
  });

  it("refuses pair gaps", () => {
    const gaps: PackInput = { ...input, pairGaps: [{ a: "a", b: "b", gap: 1 }] };
    expect(() => matchPlaces(placed([]), gaps, placed([]))).toThrow(RangeError);
  });

  it("keeps the set of places, the height and the hard rules on 200 made-up inputs, and moves fewer boxes", () => {
    let freshMoved = 0;
    let matchedMoved = 0;
    for (let seed = 0; seed < 200; seed++) {
      const first = cards(seed, 40);
      const before = packWith("maxrects", first, { rule: "bl" });
      const next: PackInput = { ...first, items: first.items.slice(1) };
      const fresh = packWith("maxrects", next, { rule: "bl" });
      const matched = matchPlaces(before, next, fresh);
      const key = (p: { x: number; y: number }): string => `${p.x},${p.y}`;
      expect(matched.placements.map(key).sort()).toEqual(fresh.placements.map(key).sort());
      expect(matched.size).toEqual(fresh.size);
      const hard = Object.values(checkHard(next, matched)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
      expect(hard).toBe(0);
      freshMoved += measureChange(first, before, next, fresh)["pack.stability.mean"];
      matchedMoved += measureChange(first, before, next, matched)["pack.stability.mean"];
    }
    expect(matchedMoved).toBeLessThan(freshMoved);
  });
});
