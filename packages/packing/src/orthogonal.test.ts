// The orthogonal order of roadmap item k29. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, keepOrthogonal, mulberry32, packWith, type Item, type PackInput, type PackOutput, type Placement } from "@mark1russell7/packing";

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
  items[at] = { ...old, w: old.w + Math.floor(random() * 6), h: old.h + Math.floor(random() * 20) };
  items.push({ id: `new${seed}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { ...input, items };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function counts the pairs of the given ids that change their strict order on an axis. */
function flips(ids: readonly string[], before: readonly Placement[], after: readonly Placement[], axis: "x" | "y"): number {
  const old = new Map(before.map((p) => [p.id, p[axis]] as const));
  const now = new Map(after.map((p) => [p.id, p[axis]] as const));
  let count = 0;
  for (const a of ids) {
    for (const b of ids) if (old.get(a)! < old.get(b)! && now.get(a)! > now.get(b)!) count++;
  }
  return count;
}

describe("keepOrthogonal", () => {
  const base: PackInput = { container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 5, h: 2 }, { id: "b", w: 5, h: 2 }, { id: "c", w: 4, h: 3 }] };
  const output: PackOutput = {
    placements: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 5, y: 0 },
      { id: "c", x: 0, y: 2 },
    ],
    size: { w: 10, h: 5 },
    overflow: [],
    moved: [],
  };

  it("lifts a box into the place of a removed box, and keeps the others", () => {
    const change: PackInput = { ...base, items: base.items.slice(1) };
    const { input, pinned } = keepOrthogonal(base, output, change);
    expect(pinned).toEqual(["b", "c"]);
    expect(input.items.map((i) => [i.id, i.x, i.y])).toEqual([["b", 5, 0], ["c", 0, 0]]);
  });

  it("pushes the box below a taller box, and the box beside a wider box", () => {
    const taller: PackInput = { ...base, items: [{ id: "a", w: 5, h: 4 }, base.items[1]!, base.items[2]!] };
    expect(keepOrthogonal(base, output, taller).input.items[2]).toMatchObject({ x: 0, y: 4, locked: true });
    const short: PackInput = { container: { fixed: "width", w: 12 }, items: [{ id: "a", w: 7, h: 2 }, base.items[1]!, base.items[2]!] };
    expect(keepOrthogonal(base, output, short).input.items[1]).toMatchObject({ x: 7, y: 0, locked: true });
  });

  it("leaves a box free when its new place is outside a fixed side", () => {
    const wide: PackInput = { ...base, items: [{ id: "a", w: 7, h: 2 }, base.items[1]!, base.items[2]!] };
    const { input, pinned } = keepOrthogonal(base, output, wide);
    expect(pinned).toEqual(["a", "c"]);
    expect(input.items[1]!.locked).toBeUndefined();
  });

  it("leaves a new box, a turned box, a child and a box on an obstacle free", () => {
    const turned: PackOutput = { ...output, placements: output.placements.map((p) => (p.id === "b" ? { ...p, turn: 90 as const } : p)) };
    const change: PackInput = {
      ...base,
      items: [base.items[0]!, base.items[1]!, { ...base.items[2]!, parent: "a" }, { id: "n", w: 1, h: 1 }],
      obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }],
    } as PackInput;
    expect(keepOrthogonal(base, turned, change).pinned).toEqual([]);
  });

  it("keeps a locked item as it is", () => {
    const change: PackInput = { ...base, items: [{ ...base.items[0]!, x: 0, y: 0, locked: true }, base.items[1]!, base.items[2]!] };
    const { input, pinned } = keepOrthogonal(base, output, change);
    expect(pinned).toEqual(["b"]);
    expect(input.items[0]).toEqual(change.items[0]);
  });

  it("refuses a container with a shape and pair gaps", () => {
    const shaped = { ...base, container: { ...base.container, shape: { kind: "circle" } } } as unknown as PackInput;
    expect(() => keepOrthogonal(base, output, shaped)).toThrow(RangeError);
    const gaps = { ...base, pairGaps: [{ a: "a", b: "b", gap: 1 }] } as unknown as PackInput;
    expect(() => keepOrthogonal(base, output, gaps)).toThrow(RangeError);
  });

  it("does not change an argument, and gives equal bytes for two calls", () => {
    const change = changed(base, 1);
    const copy = JSON.stringify(change);
    expect(JSON.stringify(keepOrthogonal(base, output, change))).toBe(JSON.stringify(keepOrthogonal(base, output, change)));
    expect(JSON.stringify(change)).toBe(copy);
  });

  it("keeps the order of the pinned boxes with no hard rule break on 200 made-up inputs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = drawn(seed, 10 + (seed % 40));
      const before = packWith("maxrects", input, { rule: "bl" });
      const next = changed(input, seed);
      const { input: pinnedInput, pinned } = keepOrthogonal(input, before, next);
      const after = packWith("maxrects", pinnedInput, { rule: "bl" });
      expect(hardBreaks(next, after), `seed ${seed}`).toBe(0);
      expect(after.placements).toHaveLength(next.items.length);
      expect(flips(pinned, before.placements, after.placements, "x"), `seed ${seed}`).toBe(0);
      expect(flips(pinned, before.placements, after.placements, "y"), `seed ${seed}`).toBe(0);
    }
  });

  it("keeps the margins and the gap", () => {
    const input: PackInput = { container: { fixed: "width", w: 40 }, gap: 2, items: [{ id: "a", w: 10, h: 10, margin: 1 }, { id: "b", w: 10, h: 10 }, { id: "c", w: 10, h: 10 }] };
    const before = packWith("rows", input);
    const next: PackInput = { ...input, items: [input.items[0]!, { ...input.items[1]!, w: 12 }, input.items[2]!] };
    const after = packWith("maxrects", keepOrthogonal(input, before, next).input, { rule: "bl" });
    expect(hardBreaks(next, after)).toBe(0);
  });
});
