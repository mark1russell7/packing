import { describe, expect, it } from "vitest";
import { boundsOf } from "@mark1russell7/layout-contract";
import { crossingPairs, rasterFamily } from "../bench/raster-nofit.ts";
import { NEAR_RECTS_STAGE, packNearRects, packWith, rasterCover, turnItem, type Item, type PackInput, type PackOutput } from "./index.ts";
import { outlineOf } from "./raster-nofit.ts";

/** This function gives an L shape in a box of `side` by `side`, with a square notch of half the side at the top right. */
function ell(id: string, side: number): Item {
  const h = side / 2;
  return { id, w: side, h: side, shape: { kind: "polygon", points: [[0, 0], [h, 0], [h, h], [side, h], [side, side], [0, side]] } };
}

const stripOf = (items: Item[], w: number): PackInput => ({ container: { w, fixed: "width" }, items });

/** This function gives the world box of each placed shape, for a wall check. */
function worldBoxes(input: PackInput, output: PackOutput): { x0: number; x1: number; y0: number; y1: number }[] {
  const byId = new Map(input.items.map((i) => [i.id, i]));
  return output.placements.map((p) => {
    const item = byId.get(p.id)!;
    const b = boundsOf(outlineOf(p.turn === 90 ? turnItem(item) : item));
    return { x0: p.x + b.x, x1: p.x + b.x + b.w, y0: p.y + b.y, y1: p.y + b.y + b.h };
  });
}

describe("packNearRects", () => {
  it("joins two shapes that fit, into a box smaller than their two boxes", () => {
    const input = stripOf([ell("a", 8), ell("b", 4)], 100);
    const output = packNearRects(input, { cell: 1 });
    expect(output.placements).toHaveLength(2);
    expect(output.trace?.[0]?.id).toBe(NEAR_RECTS_STAGE);
    expect(output.trace?.[0]?.measures?.["near.groups"]).toBe(1);
    expect(crossingPairs(input, output)).toBe(0);
    expect(output.size.h).toBe(8);
  });

  it("does not join two rectangles, because a join saves no box cell", () => {
    const output = packNearRects(stripOf([{ id: "a", w: 4, h: 4 }, { id: "b", w: 4, h: 4 }], 100), { cell: 1 });
    expect(output.trace?.[0]?.measures?.["near.groups"]).toBe(2);
  });

  it("gives the plain boxes with no rounds", () => {
    const output = packNearRects(stripOf([ell("a", 8), ell("b", 4)], 100), { cell: 1, rounds: 0 });
    expect(output.trace?.[0]?.measures?.["near.groups"]).toBe(2);
  });

  it("gives the layout of bbox with no rounds, so the grid costs nothing for a shape that joins no group", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const input = rasterFamily(seed, 24);
      const near = packNearRects(input, { rounds: 0, seed });
      const box = packWith("bbox", input, {}, seed);
      const at = (output: PackOutput): unknown => [...output.placements].sort((a, b) => a.id.localeCompare(b.id)).map((p) => [p.id, p.x, p.y]);
      expect(at(near)).toEqual(at(box));
      expect(near.size).toEqual(box.size);
    }
  });

  it("keeps a group inside the width, and leaves two shapes apart when their join is too wide", () => {
    const input = stripOf([ell("a", 8), ell("b", 8)], 8);
    const output = packNearRects(input, { cell: 1 });
    expect(output.overflow).toEqual([]);
    expect(Math.max(...worldBoxes(input, output).map((b) => b.x1))).toBeLessThanOrEqual(8);
    expect(crossingPairs(input, output)).toBe(0);
  });

  it("has no overlap and stays in the walls on made-up inputs", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const input = rasterFamily(seed, 24);
      const output = packNearRects(input, { seed });
      expect(output.overflow).toEqual([]);
      expect(output.placements).toHaveLength(24);
      expect(crossingPairs(input, output)).toBe(0);
      for (const b of worldBoxes(input, output)) {
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(output.size.w);
        expect(b.y1).toBeLessThanOrEqual(output.size.h);
      }
    }
  });

  it("keeps the covers of the shapes of a group disjoint on the grid", () => {
    const input = rasterFamily(3, 18);
    const cell = 0.25;
    const output = packNearRects(input, { cell });
    const seen = new Set<string>();
    const byId = new Map(input.items.map((i) => [i.id, i]));
    for (const p of output.placements) {
      const item = byId.get(p.id)!;
      const cover = rasterCover(outlineOf(p.turn === 90 ? turnItem(item) : item), cell);
      cover.spans.forEach((spans, r) => {
        for (const [start, end] of spans) {
          for (let c = start; c < end; c++) {
            const key = `${cover.col + c + p.x / cell},${cover.row + r + p.y / cell}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        }
      });
    }
  });

  it("turns a turnable item that only fits on its turn, and gives the turn in the placement", () => {
    const item: Item = { id: "a", w: 8, h: 2, turnable: true };
    const output = packNearRects(stripOf([item, { id: "b", w: 2, h: 2 }], 4), { cell: 1 });
    expect(output.overflow).toEqual([]);
    expect(output.placements.find((p) => p.id === "a")?.turn).toBe(90);
  });

  it("gives the same bytes two times", () => {
    const input = rasterFamily(7, 30);
    expect(JSON.stringify(packNearRects(input))).toBe(JSON.stringify(packNearRects(input)));
  });

  it("gives equal outputs with a pair cache for equal shapes", () => {
    const items = Array.from({ length: 12 }, (_, i) => ell(`i${i}`, 8));
    const input = stripOf(items, 40);
    const output = packNearRects(input, { cell: 1 });
    expect(output.placements).toHaveLength(12);
    expect(crossingPairs(input, output)).toBe(0);
  });

  it("reports an item that does not fit in the width as overflow", () => {
    const output = packNearRects(stripOf([{ id: "a", w: 12, h: 2 }, { id: "b", w: 2, h: 2 }], 8), { cell: 1 });
    expect(output.overflow).toEqual(["a"]);
    expect(output.placements.map((p) => p.id)).toEqual(["b"]);
  });

  it("refuses each field that this slice does not read", () => {
    const item: Item = { id: "a", w: 2, h: 2 };
    expect(() => packNearRects(stripOf([item], 8), { rounds: -1 })).toThrow(RangeError);
    expect(() => packNearRects({ container: { fixed: "none" }, items: [item] })).toThrow(RangeError);
    expect(() => packNearRects({ ...stripOf([item], 8), gap: 1 })).toThrow(RangeError);
    expect(() => packNearRects({ container: { w: 8, fixed: "width", inset: 1 }, items: [item] })).toThrow(RangeError);
    expect(() => packNearRects(stripOf([{ ...item, locked: true, x: 0, y: 0 }], 8))).toThrow(RangeError);
    expect(() => packNearRects(stripOf([{ ...item, margin: 1 }], 8))).toThrow(RangeError);
  });
});
