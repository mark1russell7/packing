import { describe, expect, it } from "vitest";
import { BINARY_HEIGHT_STAGE, packBinaryHeight } from "./binary-height.ts";
import type { Item, PackInput, PackOutput } from "./contract.ts";
import { exactStrip } from "./exact-strip.ts";

/** A small made-up stream of whole numbers. */
function stream(seed: number): (low: number, high: number) => number {
  let s = (seed * 2654435761 + 1) >>> 0;
  return (low, high) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return low + Math.floor((s / 2 ** 32) * (high - low + 1));
  };
}

/** A made-up strip with random boxes. */
function strip(seed: number, n: number, width: number, side: number, turnable = false): PackInput {
  const draw = stream(seed);
  const items: Item[] = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: draw(1, side), h: draw(1, side), ...(turnable ? { turnable: true } : {}) }));
  return { items, container: { fixed: "width", w: width } };
}

/** A made-up strip from cuts of a full rectangle, so the optimum is the height of that rectangle. */
function perfect(seed: number, n: number, width: number, height: number): PackInput {
  const draw = stream(seed);
  const parts = [{ w: width, h: height }];
  while (parts.length < n) {
    const at = parts.reduce((b, p, i) => (p.w * p.h > parts[b]!.w * parts[b]!.h ? i : b), 0);
    const p = parts[at]!;
    if (p.w >= p.h && p.w > 1) {
      const cut = draw(1, p.w - 1);
      parts.splice(at, 1, { w: cut, h: p.h }, { w: p.w - cut, h: p.h });
    } else if (p.h > 1) {
      const cut = draw(1, p.h - 1);
      parts.splice(at, 1, { w: p.w, h: cut }, { w: p.w, h: p.h - cut });
    } else {
      break;
    }
  }
  return { items: parts.map((p, i) => ({ id: `b${i}`, ...p })), container: { fixed: "width", w: width } };
}

/** The count of the placement errors of a layout: an overlap, a box out of the strip, or a wrong size. */
function faults(input: PackInput, output: PackOutput): number {
  const boxes = output.placements.map((p, i) => {
    const item = input.items[i]!;
    return p.turn === 90 ? { x: p.x, y: p.y, w: item.h, h: item.w } : { x: p.x, y: p.y, w: item.w, h: item.h };
  });
  let count = 0;
  boxes.forEach((a, i) => {
    if (a.x < 0 || a.y < 0 || a.x + a.w > input.container.w! || a.y + a.h > output.size.h) count++;
    for (const b of boxes.slice(i + 1)) if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) count++;
  });
  return count;
}

describe("packBinaryHeight", () => {
  it("names its random stream", () => {
    expect(BINARY_HEIGHT_STAGE).toBe("binary-height");
  });

  it("gives a layout with no fault and each item placed", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const input of [strip(seed, 30, 40, 15), strip(seed, 30, 40, 15, true), perfect(seed, 30, 40, 40)]) {
        const result = packBinaryHeight(input, { seed, trials: 32 });
        expect(result.output.placements).toHaveLength(input.items.length);
        expect(faults(input, result.output)).toBe(0);
        expect(result.output.overflow).toEqual([]);
        expect(result.height).toBe(result.output.size.h);
        expect(result.height).toBeLessThanOrEqual(result.firstHeight);
      }
    }
  });

  it("does not go under a proved optimum, and each proved case is a real bound", () => {
    let proved = 0;
    for (let seed = 0; seed < 60; seed++) {
      const input = strip(seed, 4 + (seed % 5), 12, 7);
      const exact = exactStrip(input);
      if (exact.status !== "optimal") continue;
      proved++;
      expect(packBinaryHeight(input, { seed, trials: 64 }).height).toBeGreaterThanOrEqual(exact.height);
    }
    expect(proved).toBeGreaterThanOrEqual(50);
  });

  it("does not go under the height of a perfect strip", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(packBinaryHeight(perfect(seed, 24, 50, 50), { seed, trials: 64 }).height).toBeGreaterThanOrEqual(50);
    }
  });

  it("gives the same bytes for the same seed", () => {
    const input = strip(3, 40, 50, 20, true);
    expect(JSON.stringify(packBinaryHeight(input, { seed: 9 }))).toBe(JSON.stringify(packBinaryHeight(input, { seed: 9 })));
  });

  it("lowers the height of the first layout on a perfect strip", () => {
    const lowered = Array.from({ length: 20 }, (_, seed) => {
      const result = packBinaryHeight(perfect(seed, 40, 60, 60), { seed });
      return result.height < result.firstHeight ? 1 : 0;
    }).reduce<number>((sum, x) => sum + x, 0);
    expect(lowered).toBeGreaterThanOrEqual(10);
  });

  it("counts its steps and its decoded orders", () => {
    const result = packBinaryHeight(perfect(1, 30, 40, 40), { seed: 1, trials: 16 });
    expect(result.decoded).toBeGreaterThanOrEqual(3);
    expect(result.decoded).toBeLessThanOrEqual(3 + result.steps * 16);
  });

  it("stops at once at the area bound", () => {
    const input: PackInput = { items: [{ id: "a", w: 10, h: 5 }, { id: "b", w: 10, h: 5 }], container: { fixed: "width", w: 10 } };
    expect(packBinaryHeight(input)).toMatchObject({ height: 10, firstHeight: 10, steps: 0, decoded: 3 });
  });

  it("gives an empty layout for no items", () => {
    expect(packBinaryHeight({ items: [], container: { fixed: "width", w: 10 } })).toMatchObject({ height: 0, steps: 0, decoded: 0 });
  });

  it("turns an item that fits only on its side", () => {
    const input: PackInput = { items: [{ id: "a", w: 2, h: 20, turnable: true }], container: { fixed: "width", w: 30 } };
    const result = packBinaryHeight(input);
    expect(result.height).toBe(2);
    expect(result.output.placements[0]).toMatchObject({ turn: 90 });
  });

  it("refuses the inputs that it does not read", () => {
    const box = { id: "a", w: 2, h: 2 };
    const width = { fixed: "width", w: 10 } as const;
    expect(() => packBinaryHeight({ items: [box], container: { fixed: "size", w: 10, h: 10 } })).toThrow(RangeError);
    expect(() => packBinaryHeight({ items: [box], container: width, gap: 1 })).toThrow(RangeError);
    expect(() => packBinaryHeight({ items: [{ ...box, w: 11 }], container: width })).toThrow(RangeError);
    expect(() => packBinaryHeight({ items: [{ ...box, locked: true }], container: width })).toThrow(RangeError);
    expect(() => packBinaryHeight({ items: [box], container: width }, { trials: 0 })).toThrow(RangeError);
    expect(() => packBinaryHeight({ items: [box], container: width }, { precision: 0 })).toThrow(RangeError);
  });
});
