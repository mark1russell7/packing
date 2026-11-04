// The vertical compaction of roadmap item k30. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, compactUp, mulberry32, packWith, pinUnchanged, type Item, type PackInput, type PackOutput, type Placement } from "@mark1russell7/packing";

/** This function gives a layout with the boxes `[x, y, w, h]` on a strip of width 10. */
function layout(boxes: readonly (readonly [number, number, number, number])[], more: Partial<PackInput> = {}): { input: PackInput; output: PackOutput } {
  const items: Item[] = boxes.map(([, , w, h], i) => ({ id: `i${i}`, w, h }));
  const placements: Placement[] = boxes.map(([x, y], i) => ({ id: `i${i}`, x, y }));
  const h = Math.max(0, ...boxes.map(([, y, , height]) => y + height));
  return { input: { container: { fixed: "width", w: 10 }, items, ...more }, output: { placements, size: { w: 10, h }, overflow: [], moved: [] } as unknown as PackOutput };
}

/** This function gives the `y` of each placement. */
const ysOf = (output: PackOutput): readonly number[] => output.placements.map((p) => p.y);

/** This function gives a made-up strip. */
function drawn(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { container: { fixed: "width", w: 200 }, items };
}

describe("compactUp", () => {
  it("moves a box up to the top of the container", () => {
    const { input, output } = layout([[0, 5, 2, 2]]);
    const result = compactUp(input, output);
    expect(ysOf(result)).toEqual([0]);
    expect(result.size).toEqual({ w: 10, h: 2 });
  });

  it("stops a box at the box above it, in the order of the tops", () => {
    const { input, output } = layout([[0, 9, 2, 1], [0, 3, 2, 2], [5, 4, 2, 2]]);
    expect(ysOf(compactUp(input, output))).toEqual([2, 0, 0]);
  });

  it("keeps each x, and it does not change its arguments", () => {
    const { input, output } = layout([[3, 4, 2, 2]]);
    const copy = JSON.stringify(output);
    expect(compactUp(input, output).placements[0]!.x).toBe(3);
    expect(JSON.stringify(output)).toBe(copy);
  });

  it("gives an empty layout back", () => {
    const { input, output } = layout([]);
    expect(compactUp(input, output)).toMatchObject({ placements: [], size: { w: 10, h: 0 } });
  });

  it("keeps a locked item, and a box stops at it", () => {
    const { input, output } = layout([[0, 3, 4, 1], [1, 6, 2, 2]]);
    const locked: PackInput = { ...input, items: [{ ...input.items[0]!, x: 0, y: 3, locked: true }, input.items[1]!] };
    expect(ysOf(compactUp(locked, output))).toEqual([3, 4]);
  });

  it("stops a box at an obstacle, and keeps a fixed height", () => {
    const { input, output } = layout([[0, 6, 2, 2]], {
      container: { fixed: "size", w: 10, h: 20 },
      obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 1, w: 3, h: 2 } }],
    } as Partial<PackInput>);
    const result = compactUp(input, { ...output, size: { w: 10, h: 20 } });
    expect(ysOf(result)).toEqual([3]);
    expect(result.size.h).toBe(20);
  });

  it("keeps the gap, the margin and the inset", () => {
    const gap = layout([[0, 0, 2, 2], [0, 9, 2, 2]], { gap: 1 });
    expect(ysOf(compactUp(gap.input, gap.output))).toEqual([0, 3]);
    const { input, output } = layout([[0, 9, 2, 2]], { container: { fixed: "width", w: 10, inset: 2 } });
    expect(ysOf(compactUp({ ...input, items: [{ ...input.items[0]!, margin: 1 }] }, output))).toEqual([3]);
  });

  it("reads a turned box with its turned size", () => {
    const { input, output } = layout([[0, 0, 4, 2], [0, 9, 1, 1]]);
    const turned = { ...output, placements: [{ ...output.placements[0]!, turn: 90 }, output.placements[1]!] } as PackOutput;
    expect(ysOf(compactUp(input, turned))).toEqual([0, 4]);
  });

  it("refuses a shape, pair gaps and a parent", () => {
    const { input, output } = layout([[0, 0, 2, 2]]);
    const shape: PackInput = { ...input, container: { ...input.container, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } } };
    expect(() => compactUp(shape, output)).toThrow(RangeError);
    expect(() => compactUp({ ...input, pairGaps: [{ a: "i0", b: "i0", gap: 1 }] } as PackInput, output)).toThrow(RangeError);
    expect(() => compactUp({ ...input, items: [{ ...input.items[0]!, parent: "p" }] }, output)).toThrow(RangeError);
  });

  it("gives equal bytes for two compactions of one layout", () => {
    const input = drawn(9, 60);
    const output = packWith("maxrects", input, { rule: "bl" }, 9);
    expect(JSON.stringify(compactUp(input, output))).toBe(JSON.stringify(compactUp(input, output)));
  });

  it.each(["maxrects", "skyline"])("has no hard rule break after a pin with %s on 1000 made-up pairs, and no box goes down", (strategy) => {
    const options = strategy === "maxrects" ? { rule: "bl" } : {};
    let bad = 0;
    let down = 0;
    let taller = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const first = drawn(seed, 5 + (seed % 40));
      const before = packWith(strategy, first, options, seed);
      const change: PackInput = { ...first, items: first.items.slice(1) };
      const pinned = packWith(strategy, pinUnchanged(first, before, change).input, options, seed);
      const result = compactUp(change, pinned);
      bad += Object.values(checkHard(change, result)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
      result.placements.forEach((p, i) => {
        if (p.y > pinned.placements[i]!.y) down++;
      });
      if (result.size.h > pinned.size.h) taller++;
    }
    expect(bad).toBe(0);
    expect(down).toBe(0);
    expect(taller).toBe(0);
  });
});
