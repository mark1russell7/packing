// The pin of unchanged boxes of roadmap item k29. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, measureChange, mulberry32, packWith, pinUnchanged, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up strip. */
function drawn(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { container: { fixed: "width", w: 200 }, items };
}

/** This function removes one item, resizes one item and adds one item. */
function changed(input: PackInput, seed: number): PackInput {
  const random = mulberry32(seed + 1000);
  const items = input.items.slice();
  items.splice(Math.floor(random() * items.length), 1);
  const at = Math.floor(random() * items.length);
  const old = items[at]!;
  items[at] = { ...old, h: old.h + 1 };
  items.push({ id: `new${seed}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { ...input, items };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

describe("pinUnchanged", () => {
  const base = strip(10, [[5, 2], [5, 2], [4, 3]]);
  const output: PackOutput = {
    placements: [
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 5, y: 0 },
      { id: "i2", x: 0, y: 2 },
    ],
    size: { w: 10, h: 5 },
    overflow: [],
    wasPacked: true,
  } as unknown as PackOutput;

  it("locks each unchanged box at its old place", () => {
    const { input, pinned } = pinUnchanged(base, output, base);
    expect(pinned).toEqual(["i0", "i1", "i2"]);
    expect(input.items[1]).toMatchObject({ id: "i1", x: 5, y: 0, locked: true });
  });

  it("does not change the inputs", () => {
    const copy = JSON.stringify(base);
    pinUnchanged(base, output, base);
    expect(JSON.stringify(base)).toBe(copy);
  });

  it("keeps a new box and a resized box free", () => {
    const change: PackInput = { ...base, items: [{ id: "i0", w: 5, h: 3 }, base.items[1]!, { id: "n", w: 1, h: 1 }] };
    const { input, pinned } = pinUnchanged(base, output, change);
    expect(pinned).toEqual(["i1"]);
    expect(input.items[0]!.locked).toBeUndefined();
    expect(input.items[2]!.locked).toBeUndefined();
  });

  it("keeps a turned box free", () => {
    const turned = { ...output, placements: [{ id: "i0", x: 0, y: 0, turn: 90 }] } as unknown as PackOutput;
    expect(pinUnchanged(base, turned, base).pinned).toEqual([]);
  });

  it("keeps a child free", () => {
    const change: PackInput = { ...base, items: [{ ...base.items[0]!, parent: "i2" }] };
    expect(pinUnchanged(base, output, change).pinned).toEqual([]);
  });

  it("keeps a box free when a narrower container cuts its old place", () => {
    expect(pinUnchanged(base, output, { ...base, container: { fixed: "width", w: 8 } }).pinned).toEqual(["i0", "i2"]);
  });

  it("keeps a box free when an obstacle or a locked item takes its old place", () => {
    const obstacle: PackInput = { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 6, y: 0, w: 1, h: 1 } }] } as PackInput;
    expect(pinUnchanged(base, output, obstacle).pinned).toEqual(["i0", "i2"]);
    const locked: PackInput = { ...base, items: [...base.items, { id: "l", w: 1, h: 1, x: 0, y: 2, locked: true }] };
    expect(pinUnchanged(base, output, locked).pinned).toEqual(["i0", "i1"]);
  });

  it("does not change an item that is locked already", () => {
    const item: Item = { id: "i0", w: 5, h: 2, x: 3, y: 3, locked: true };
    const { input, pinned } = pinUnchanged(base, output, { ...base, items: [item] });
    expect(pinned).toEqual([]);
    expect(input.items[0]).toBe(item);
  });

  it("gives equal bytes for two pinned packs of one pair", () => {
    const first = drawn(5, 60);
    const before = packWith("maxrects", first, { rule: "bl" }, 5);
    const second = changed(first, 5);
    const pack = (): string => JSON.stringify(packWith("maxrects", pinUnchanged(first, before, second).input, { rule: "bl" }, 5).placements);
    expect(pack()).toBe(pack());
  });

  it.each(["maxrects", "skyline"])("moves no pinned box of %s, with no hard rule break, on 1000 made-up pairs", (strategy) => {
    const options = strategy === "maxrects" ? { rule: "bl" } : {};
    let bad = 0;
    let lost = 0;
    let moved = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const first = drawn(seed, 5 + (seed % 40));
      const before = packWith(strategy, first, options, seed);
      const { input, pinned } = pinUnchanged(first, before, changed(first, seed));
      expect(pinned.length).toBeGreaterThan(0);
      const after = packWith(strategy, input, options, seed);
      bad += hardBreaks(input, after);
      lost += input.items.length - after.placements.length;
      const kept = new Set(pinned);
      const stay = (i: PackInput): PackInput => ({ ...i, items: i.items.filter((item) => kept.has(item.id)) });
      moved += measureChange(stay(first), before, stay(input), after)["pack.stability.moved"];
    }
    expect(bad).toBe(0);
    expect(lost).toBe(0);
    expect(moved).toBe(0);
  });
});
