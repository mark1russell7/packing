import { describe, expect, it } from "vitest";
import { checkHard, outputHash, packWith, rectGrid, toPackInput, type PackInput } from "./index.ts";

// Roadmap item k22: the skyline rules bl and mw, the waste map and the turns. Made-up inputs of the generators only.

const VARIANTS: readonly Record<string, unknown>[] = [
  { rule: "mw" },
  { wasteMap: true },
  { rule: "mw", wasteMap: true },
  { rotate: true },
  { rule: "mw", wasteMap: true, rotate: true },
];

const SIZES = ["freeHeight", "fixed", "freeAspect"] as const;
const SHAPES = ["rect", "holes", "circle"] as const;
const OBSTACLES = ["none", "scattered", "corridors"] as const;

/** This function gives a generated input. Each third item is turnable, and a free container gets 2 locked items. */
function inputOf(seed: number, size: (typeof SIZES)[number], shape: (typeof SHAPES)[number], obstacles: (typeof OBSTACLES)[number]): PackInput {
  const input = toPackInput(rectGrid.generate(seed, { containerSize: size, containerShape: shape, obstacles, sizes: "uniform", count: 24 }));
  const items = input.items.map((item, i) => (i % 3 === 0 ? { ...item, turnable: true } : item));
  if (shape === "rect" && obstacles === "none" && size === "freeHeight") {
    items.push({ id: "lock-a", w: 30, h: 12, x: 5, y: 40, locked: true }, { id: "lock-b", w: 18, h: 25, x: 60, y: 8, locked: true });
  }
  return { ...input, items };
}

/** The hard rules of the contract that each variant keeps: no overlap, in the container, and the locked items in place. */
const hardOf = (input: PackInput, options: Record<string, unknown>): Record<string, number> => {
  const hard = checkHard(input, packWith("skyline", input, options));
  return { "no-overlap": hard["no-overlap"], "in-container": hard["in-container"], "locked-kept": hard["locked-kept"] };
};

describe("the skyline variants of k22", () => {
  it("pack with no overlap, in the container, and around the locked items and the holes", () => {
    const zero = { "no-overlap": 0, "in-container": 0, "locked-kept": 0 };
    for (const size of SIZES) {
      for (const shape of SHAPES) {
        for (const obstacles of OBSTACLES) {
          for (let seed = 1; seed <= 2; seed++) {
            const input = inputOf(seed, size, shape, obstacles);
            for (const options of VARIANTS) expect(hardOf(input, options), `${size} ${shape} ${obstacles} ${seed} ${JSON.stringify(options)}`).toEqual(zero);
          }
        }
      }
    }
  }, 60_000);

  it("give the same output for the same input", () => {
    const input = inputOf(5, "freeAspect", "holes", "scattered");
    for (const options of VARIANTS) expect(outputHash(packWith("skyline", input, options))).toBe(outputHash(packWith("skyline", input, options)));
  });

  it("give the output of the defaults with the default values of the options", () => {
    for (const shape of SHAPES) {
      const input = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", containerShape: shape, obstacles: "scattered", sizes: "uniform", count: 24 }));
      const want = outputHash(packWith("skyline", input));
      expect(outputHash(packWith("skyline", input, { rule: "bl", wasteMap: false, rotate: false })), shape).toBe(want);
    }
  });

  it("count the move of each option in the trace", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", containerShape: "rect", obstacles: "none", sizes: "bimodal", count: 40 }));
    const measures = (options: Record<string, unknown>): Readonly<Record<string, number>> => packWith("skyline", input, options).trace!.at(-1)!.measures!;
    expect(Object.keys(measures({}))).toEqual(["pack.overflow", "move.lowerWindow"]);
    expect(Object.keys(measures({ rule: "mw" }))).toEqual(["pack.overflow", "move.minWaste"]);
    expect(Object.keys(measures({ rule: "mw", wasteMap: true }))).toEqual(["pack.overflow", "move.minWaste", "move.wasteFill"]);
  });

  it("puts an item in the gap under a wide item with the waste map", () => {
    const items = [
      { id: "a", w: 10, h: 10 },
      { id: "b", w: 10, h: 4 },
      { id: "c", w: 20, h: 6 },
      { id: "d", w: 8, h: 5 },
    ];
    const input: PackInput = { container: { w: 20, fixed: "width" }, items };
    const plain = packWith("skyline", input, { sortOrder: "input" });
    const waste = packWith("skyline", input, { sortOrder: "input", wasteMap: true });
    expect(waste.trace!.at(-1)!.measures!["move.wasteFill"]).toBe(1);
    expect(waste.placements.find((p) => p.id === "d")).toMatchObject({ x: 10, y: 4 });
    expect(waste.size.h).toBe(16);
    expect(plain.size.h).toBe(21);
    expect(checkHard(input, waste)["no-overlap"]).toBe(0);
  });

  it("puts a box on the window with the least waste with the rule mw, also when the window is higher", () => {
    // After a, b and c, the skyline is [5, 5, 5, 5, 5, 5, 5, 3, 3, 0]. For d (3 by 4), the window at x 0 has the
    // waste 0 and the top 5. The window at x 7 has the waste 3 and the top 3. Thus mw takes x 0 and bl takes x 7.
    const items = [
      { id: "a", w: 4, h: 5 },
      { id: "b", w: 5, h: 3 },
      { id: "c", w: 3, h: 2 },
      { id: "d", w: 3, h: 4 },
    ];
    const input: PackInput = { container: { w: 10, fixed: "width" }, items };
    const bl = packWith("skyline", input, { sortOrder: "input" });
    const mw = packWith("skyline", input, { sortOrder: "input", rule: "mw" });
    const at = (o: typeof bl, id: string): { x: number; y: number } => {
      const p = o.placements.find((q) => q.id === id)!;
      return { x: p.x, y: p.y };
    };
    expect(["a", "b", "c", "d"].map((id) => at(bl, id))).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 7, y: 3 }]);
    expect(["a", "b", "c", "d"].map((id) => at(mw, id))).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 5 }]);
    expect(bl.size.h).toBe(7);
    expect(mw.size.h).toBe(9);
    expect(mw.trace!.at(-1)!.measures!["move.minWaste"]).toBe(1);
  });

  it("turns a turnable item that fits only when it turns", () => {
    const input: PackInput = { container: { w: 20, fixed: "width" }, items: [{ id: "tall", w: 30, h: 10, turnable: true }, { id: "b", w: 10, h: 10 }] };
    const output = packWith("skyline", input, { rotate: true });
    expect(output.overflow).toEqual([]);
    expect(checkHard(input, output)["in-container"]).toBe(0);
  });

  it("throws a RangeError for a rule that is not a skyline rule", () => {
    const input: PackInput = { container: { w: 20, fixed: "width" }, items: [{ id: "a", w: 5, h: 5 }] };
    expect(() => packWith("skyline", input, { rule: "bssf" })).toThrow(RangeError);
  });
});
