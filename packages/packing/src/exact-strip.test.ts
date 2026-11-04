// The exact strip of roadmap item k10. Each test uses made-up inputs. The tiny exhaustive packer of `bench/grid-fits.ts`
// is the oracle: it fills whole cells, so it shares no idea with the staircase of the search.
import { describe, expect, it } from "vitest";
import {
  berkeyWang,
  checkHard,
  EXACT_STRIP_MAX_ITEMS,
  EXACT_STRIP_MAX_SIDE,
  exactStrip,
  exactStripRefusal,
  mulberry32,
  objectiveBound,
  packWith,
  perfectCutOf,
  toPackInput,
  type ExactStripResult,
  type Item,
  type PackInput,
} from "@mark1russell7/packing";
import { fits, type Shape } from "../bench/grid-fits.ts";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[], turnable = false): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => (turnable ? { id: `i${i}`, w, h, turnable: true } : { id: `i${i}`, w, h })),
});

/** This function gives the least height of the oracle. */
function gridOptimum(input: PackInput): number {
  const shapes = input.items.map((i): Shape => (i.turnable === true && i.w !== i.h ? [[i.w, i.h], [i.h, i.w]] : [[i.w, i.h]]));
  for (let H = 1; ; H++) if (fits(shapes, input.container.w!, H)) return H;
}

/** This function gives the sum of the breaks of the hard rules, with no overlap tolerance. */
const breaks = (input: PackInput, result: ExactStripResult): number => Object.values(checkHard(input, result.output, { overlap: 0 })).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function tells that a result is a valid layout with a sound claim. */
function expectValid(input: PackInput, result: ExactStripResult): void {
  expect(breaks(input, result)).toBe(0);
  expect(result.output.overflow).toEqual([]);
  expect(result.output.placements.map((p) => p.id)).toEqual(input.items.map((i) => i.id));
  expect(result.output.size).toEqual({ w: input.container.w, h: result.height });
  if (result.status === "optimal") expect(result.lowerBound).toBe(result.height);
  else {
    expect(result.proof).toBeNull();
    expect(result.lowerBound).toBeLessThan(result.height);
  }
}

describe("exactStrip", () => {
  it("gives the height 0 for no items", () => {
    const result = exactStrip(strip(5, []));
    expect(result).toMatchObject({ status: "optimal", proof: "bound", height: 0, lowerBound: 0, nodes: 0 });
  });

  it("proves one item by the bound, with no node", () => {
    const input = strip(5, [[3, 4]]);
    const result = exactStrip(input);
    expect(result).toMatchObject({ status: "optimal", proof: "bound", height: 4, nodes: 0 });
    expectValid(input, result);
  });

  it("solves a pinwheel that no row layout gets", () => {
    const input = strip(5, [[3, 2], [2, 3], [3, 2], [2, 3], [1, 1]]);
    const result = exactStrip(input);
    expect(result.height).toBe(5);
    expect(result.status).toBe("optimal");
    expectValid(input, result);
  });

  it("turns an item only when the item permits it", () => {
    const sizes = [[2, 6], [4, 2]] as const;
    const fixed = strip(6, sizes);
    const turning = strip(6, sizes, true);
    const turned = exactStrip(turning);
    expect(exactStrip(fixed).height).toBe(6);
    expect(turned.height).toBe(4);
    expect(turned.output.placements.some((p) => p.turn === 90)).toBe(true);
    expectValid(turning, turned);
  });

  it("merges equal items, also the two turns of one size", () => {
    const input = strip(5, [[2, 3], [3, 2], [2, 3], [3, 2]], true);
    const result = exactStrip(input);
    expect(result.height).toBe(gridOptimum(input));
    expectValid(input, result);
  });

  it("equals the oracle on 120 random inputs, with and without turns, and each proof kind occurs", { timeout: 60000 }, () => {
    const r = mulberry32(10);
    const side = (most: number): number => 1 + Math.floor(r() * most);
    const proofs = { bound: 0, exhausted: 0 };
    for (let round = 0; round < 120; round++) {
      const W = 3 + Math.floor(r() * 6);
      const n = 2 + Math.floor(r() * 5);
      const sizes = Array.from({ length: n }, (): [number, number] => [side(W), side(W)]);
      const input = strip(W, sizes, round % 2 === 1);
      const result = exactStrip(input);
      expect(result.status).toBe("optimal");
      expect(result.height).toBe(gridOptimum(input));
      expect(result.proof).toBe(result.height === objectiveBound(input, { tolerance: 0 })!.value ? "bound" : "exhausted");
      expectValid(input, result);
      proofs[result.proof!] += 1;
    }
    expect(proofs.bound).toBeGreaterThan(0);
    expect(proofs.exhausted).toBeGreaterThan(0);
  });

  it("finds the height of each perfect cut, also a cut with no guillotine layout", () => {
    for (const cut of ["guillotine", "free"] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const { w, h, pieces } = perfectCutOf(seed, { cut, count: 8, containerSize: "freeHeight" });
        const input = strip(w, pieces.map((p) => [p.w, p.h]));
        const result = exactStrip(input);
        expect(result).toMatchObject({ status: "optimal", proof: "bound", height: h });
        expectValid(input, result);
      }
    }
  });

  it("is not above a heuristic, and not below the bound", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const input = toPackInput(berkeyWang.generate(seed, { class: "I", containerSize: "freeHeight", count: 7 }, "k10"));
      const result = exactStrip(input);
      expect(result.status).toBe("optimal");
      expect(result.height).toBeLessThanOrEqual(packWith("skyline", input).size.h);
      expect(result.height).toBeGreaterThanOrEqual(objectiveBound(input, { tolerance: 0 })!.value);
      expect(result.output.size.w).toBe(input.container.w);
    }
  });
});

describe("the node limit of exactStrip", () => {
  const hard = toPackInput(berkeyWang.generate(1, { class: "III", containerSize: "freeHeight", count: 8 }, "k10"));
  const full = exactStrip(hard);

  it("tells the limit, and it claims no optimum", () => {
    expect(full.status).toBe("optimal");
    expect(full.nodes).toBeGreaterThan(1000);
    const stopped = exactStrip(hard, { nodeLimit: 1000 });
    expect(stopped.status).toBe("limit");
    expect(stopped.nodes).toBe(1000);
    expectValid(hard, stopped);
    expect(stopped.lowerBound).toBeLessThanOrEqual(full.height);
    expect(stopped.height).toBeGreaterThanOrEqual(full.height);
  });

  it("keeps a sound range at each limit, and a larger limit does not make it worse", () => {
    let low = 0;
    let high = Infinity;
    for (const nodeLimit of [1, 10, 100, 1000, 10000, 100000, 1000000]) {
      const result = exactStrip(hard, { nodeLimit });
      expect(result.lowerBound).toBeGreaterThanOrEqual(low);
      expect(result.height).toBeLessThanOrEqual(high);
      expect(result.lowerBound).toBeLessThanOrEqual(full.height);
      expect(result.height).toBeGreaterThanOrEqual(full.height);
      low = result.lowerBound;
      high = result.height;
    }
    expect(low).toBe(full.height);
    expect(high).toBe(full.height);
  });

  it("gives the same bytes and the same nodes on a second search", () => {
    expect(JSON.stringify(exactStrip(hard))).toBe(JSON.stringify(full));
    expect(JSON.stringify(exactStrip(hard, { nodeLimit: 500 }))).toBe(JSON.stringify(exactStrip(hard, { nodeLimit: 500 })));
  });

  it("refuses a limit that is not a whole number of 1 or more", () => {
    for (const nodeLimit of [0, -1, 1.5, NaN]) expect(() => exactStrip(hard, { nodeLimit })).toThrow(RangeError);
  });
});

describe("exactStripRefusal", () => {
  const item: Item = { id: "a", w: 2, h: 2 };
  const base: PackInput = { container: { fixed: "width", w: 5 }, items: [item] };

  it("accepts a plain strip, and an item that fits only with its turn", () => {
    expect(exactStripRefusal(base)).toBeNull();
    expect(exactStripRefusal({ ...base, items: [{ id: "a", w: 9, h: 2, turnable: true }] })).toBeNull();
  });

  it.each<[string, PackInput, RegExp]>([
    ["a free height", { ...base, container: { fixed: "none" } }, /not a strip/],
    ["a fixed height", { ...base, container: { fixed: "height", h: 5 } }, /not a strip/],
    ["a width that is not whole", { ...base, container: { fixed: "width", w: 5.5 } }, /whole width/],
    ["a wide strip", { ...base, container: { fixed: "width", w: EXACT_STRIP_MAX_SIDE + 1 } }, /whole width/],
    ["a shaped strip", { ...base, container: { fixed: "width", w: 5, shape: { kind: "circle", cx: 0, cy: 0, r: 5 } } }, /shape/],
    ["an inset", { ...base, container: { fixed: "width", w: 5, inset: 1 } }, /inset/],
    ["obstacles", { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] }, /obstacles/],
    ["a gap", { ...base, gap: 1 }, /gap/],
    ["a pair gap", { ...base, items: [item, { id: "b", w: 1, h: 1 }], pairGaps: [{ a: "a", b: "b", gap: 1 }] }, /gap/],
    ["too many items", { ...base, items: Array.from({ length: EXACT_STRIP_MAX_ITEMS + 1 }, (_, i) => ({ id: `i${i}`, w: 1, h: 1 })) }, /more than/],
    ["a size that is not whole", { ...base, items: [{ id: "a", w: 1.5, h: 1 }] }, /whole sizes/],
    ["an empty item", { ...base, items: [{ id: "a", w: 0, h: 1 }] }, /whole sizes/],
    ["a long side", { ...base, items: [{ id: "a", w: 1, h: EXACT_STRIP_MAX_SIDE + 1 }] }, /side above/],
    ["a shaped item", { ...base, items: [{ ...item, shape: { kind: "circle", cx: 1, cy: 1, r: 1 } }] }, /shape/],
    ["a locked item", { ...base, items: [{ ...item, locked: true, x: 0, y: 0 }] }, /locked/],
    ["a margin", { ...base, items: [{ ...item, margin: 1 }] }, /margin/],
    ["an item wider than the strip", { ...base, items: [{ id: "a", w: 9, h: 1 }] }, /wider/],
  ])("refuses %s", (_, input, reason) => {
    expect(exactStripRefusal(input)).toMatch(reason);
    expect(() => exactStrip(input)).toThrow(RangeError);
  });
});
