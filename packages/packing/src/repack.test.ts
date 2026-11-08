// The pin and repack of roadmap item k31. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, mulberry32, packWith, pinUnchanged, repackPinned, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

/** This function gives a made-up item. */
const itemOf = (id: string, random: () => number): Item => ({ id, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });

/** This function removes one item, resizes one item and adds one item. */
function changed(input: PackInput, seed: number): PackInput {
  const random = mulberry32(seed + 1000);
  const items = input.items.slice();
  items.splice(Math.floor(random() * items.length), 1);
  const at = Math.floor(random() * items.length);
  items[at] = itemOf(items[at]!.id, random);
  items.push(itemOf(`new${seed}`, random));
  return { ...input, items };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function packs with the entry `maxrects-bl` of the bench. */
const maxrects = (input: PackInput): PackOutput => packWith("maxrects", input, { rule: "bl" });

describe("repackPinned", () => {
  // The base places i0, i1 and i2. The change replaces i1 with n, so `pinUnchanged` locks i0 and i2, and `keepPrefix` locks i0.
  const base = strip(10, [[5, 2], [5, 2], [4, 3]]);
  const output: PackOutput = {
    placements: [
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 5, y: 0 },
      { id: "i2", x: 0, y: 2 },
    ],
    overflow: [],
    size: { w: 10, h: 5 },
    moved: [],
  };
  const change: PackInput = { ...base, items: [base.items[0]!, { id: "n", w: 5, h: 2 }, base.items[2]!] };

  /** This function gives a made-up packer that overflows when the input has more than `limit` locked items. */
  function lockLimit(limit: number, seen: number[]): (input: PackInput) => PackOutput {
    return (input) => {
      const locked = input.items.filter((item) => item.locked === true).length;
      seen.push(locked);
      return {
        placements: input.items.map((item) => ({ id: item.id, x: item.x ?? 0, y: item.y ?? 0 })),
        overflow: locked > limit ? [input.items[0]!.id] : [],
        size: { w: 10, h: 5 },
        moved: [],
      };
    };
  }

  it("keeps the pin of each unchanged box when that pack has no overflow", () => {
    const seen: number[] = [];
    const result = repackPinned(base, output, change, lockLimit(2, seen));
    expect([result.method, result.pinned, seen]).toEqual(["pin", ["i0", "i2"], [2]]);
  });

  it("falls back to the kept prefix, then to a fresh pack", () => {
    const seen: number[] = [];
    const prefix = repackPinned(base, output, change, lockLimit(1, seen));
    expect([prefix.method, prefix.pinned, seen]).toEqual(["prefix", ["i0"], [2, 1]]);
    seen.length = 0;
    const fresh = repackPinned(base, output, change, lockLimit(0, seen));
    expect([fresh.method, fresh.pinned, seen, fresh.input]).toEqual(["fresh", [], [2, 1, 0], change]);
  });

  it("gives the pinned pack on a strip, because a strip has no overflow", () => {
    const random = mulberry32(3);
    const first: PackInput = { container: { fixed: "width", w: 200 }, items: Array.from({ length: 40 }, (_, i) => itemOf(`i${i}`, random)) };
    const before = maxrects(first);
    const next = changed(first, 3);
    const result = repackPinned(first, before, next, maxrects);
    expect(result.method).toBe("pin");
    const pinned = maxrects(pinUnchanged(first, before, next).input);
    expect([result.output.placements, result.output.overflow, result.output.size]).toEqual([pinned.placements, pinned.overflow, pinned.size]);
  });

  it("places each item when a fresh pack does, and breaks no hard rule, on 100 made-up chains in a container of fixed size", () => {
    const methods = { pin: 0, prefix: 0, fresh: 0 };
    for (let seed = 1; seed <= 100; seed++) {
      const random = mulberry32(seed);
      const items = Array.from({ length: 30 }, (_, i) => itemOf(`i${i}`, random));
      const height = maxrects({ container: { fixed: "width", w: 200 }, items }).size.h;
      let input: PackInput = { container: { fixed: "size", w: 200, h: Math.ceil(height * 1.05) }, items };
      let layout = maxrects(input);
      for (let step = 1; step <= 5; step++) {
        const next = changed(input, seed * 10 + step);
        const result = repackPinned(input, layout, next, maxrects);
        methods[result.method] += 1;
        if (maxrects(next).overflow.length === 0) expect(result.output.overflow, `seed ${seed} step ${step}`).toEqual([]);
        expect(hardBreaks(result.input, result.output), `seed ${seed} step ${step}`).toBe(0);
        input = next;
        layout = result.output;
      }
    }
    // Each of the three packs is the result of some step, so the test examines each branch on real packs.
    expect(Object.values(methods).every((count) => count > 0), JSON.stringify(methods)).toBe(true);
  });
});
