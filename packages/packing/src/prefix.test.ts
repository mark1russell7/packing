// The kept prefix of roadmap item k30. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, keepPrefix, mulberry32, packWith, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives a made-up strip. */
function drawn(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { container: { fixed: "width", w: 200 }, items };
}

/** This function gives an output with places. */
const placed = (places: readonly (readonly [string, number, number])[]): PackOutput => ({
  placements: places.map(([id, x, y]) => ({ id, x, y })),
  size: { w: 10, h: 10 },
  overflow: [],
  moved: [],
});

const base: PackInput = {
  container: { fixed: "width", w: 10 },
  items: [
    { id: "a", w: 2, h: 2 },
    { id: "b", w: 2, h: 2 },
    { id: "c", w: 2, h: 2 },
  ],
};
const output = placed([["a", 0, 0], ["b", 2, 0], ["c", 4, 0]]);

describe("keepPrefix", () => {
  it("locks each box of an input with no change", () => {
    const { input, pinned } = keepPrefix(base, output, base);
    expect(pinned).toEqual(["a", "b", "c"]);
    expect(input.items[2]).toMatchObject({ x: 4, y: 0, locked: true });
  });

  it("stops at a resized box, and leaves each box after it free", () => {
    const change: PackInput = { ...base, items: [base.items[0]!, { id: "b", w: 3, h: 2 }, base.items[2]!] };
    const { input, pinned } = keepPrefix(base, output, change);
    expect(pinned).toEqual(["a"]);
    expect(input.items[2]!.locked).toBeUndefined();
  });

  it("stops at a removed box, an added box and a new order", () => {
    const stop = (items: readonly Item[]): readonly string[] => keepPrefix(base, output, { ...base, items }).pinned;
    expect(stop([base.items[0]!, base.items[2]!])).toEqual(["a"]);
    expect(stop([{ id: "n", w: 1, h: 1 }, ...base.items])).toEqual([]);
    expect(stop([...base.items, { id: "n", w: 1, h: 1 }])).toEqual(["a", "b", "c"]);
    expect(stop([base.items[1]!, base.items[0]!])).toEqual([]);
  });

  it("stops at a box that cannot stay at its place", () => {
    const turned: PackOutput = { ...output, placements: output.placements.map((p) => (p.id === "b" ? { ...p, turn: 90 } : p)) };
    expect(keepPrefix(base, turned, base).pinned).toEqual(["a"]);
    const blocked: PackInput = { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 2, y: 0, w: 2, h: 2 } }] };
    expect(keepPrefix(base, output, blocked).pinned).toEqual(["a"]);
    const parent: PackInput = { ...base, items: [base.items[0]!, { ...base.items[1]!, parent: "a" }, base.items[2]!] };
    expect(keepPrefix(base, output, parent).pinned).toEqual(["a"]);
    const unplaced = placed([["a", 0, 0], ["c", 4, 0]]);
    expect(keepPrefix(base, unplaced, base).pinned).toEqual(["a"]);
  });

  it("passes a locked item and keeps it as it is", () => {
    const start: PackInput = { ...base, items: [{ ...base.items[0]!, x: 0, y: 0, locked: true }, base.items[1]!] };
    const { input, pinned } = keepPrefix(start, output, start);
    expect(pinned).toEqual(["b"]);
    expect(input.items[0]).toBe(start.items[0]);
  });

  it("moves no box of the prefix and breaks no hard rule on 200 made-up inputs", () => {
    for (let seed = 0; seed < 200; seed++) {
      const input = drawn(seed, 30);
      const before = packWith("maxrects", input, { rule: "bl" });
      const random = mulberry32(seed + 5000);
      const items = input.items.slice();
      const at = Math.floor(random() * items.length);
      items.splice(at, 1);
      items.push({ id: "n", w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
      const next = { ...input, items };
      const { input: kept, pinned } = keepPrefix(input, before, next);
      expect(pinned).toHaveLength(at);
      const after = packWith("maxrects", kept, { rule: "bl" });
      const old = new Map(before.placements.map((p) => [p.id, p] as const));
      for (const id of pinned) expect(after.placements.find((p) => p.id === id)).toMatchObject({ x: old.get(id)!.x, y: old.get(id)!.y });
      const hard = Object.values(checkHard(kept, after)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
      expect(hard).toBe(0);
      expect(after.overflow).toEqual([]);
    }
  });
});
