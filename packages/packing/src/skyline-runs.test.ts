import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { clearMoves, moveCount, MOVES } from "./moves.ts";
import { Rect } from "./rect.ts";
import { sha256Hex } from "./sha256.ts";
import { lowestWindow, packSkyline, type SkylineOptions, type SkylineRule } from "./skyline.ts";
import { SkylineRuns } from "./skyline-runs.ts";

/** The cells of a skyline, for a check of its runs. */
function cellsOf(skyline: SkylineRuns): number[] {
  const cells = new Float64Array(skyline.width);
  skyline.fill(cells);
  return [...cells];
}

/** This hash is the SHA-256 of the outputs and the move counts of `packs(6000, 170)`, read on the cell path of the commit before the runs. */
const CELL_PATH_HASH = "ca8c6ccdf3b44bc212fb72cdeb5118365ce110fedd45c057dcf94d1e83513fc7";

const FAMILIES: readonly ((r: () => number) => [number, number])[] = [
  (r) => [1 + Math.floor(r() * 40), 1 + Math.floor(r() * 40)],
  (r) => [r() * 40 + 0.01, r() * 40 + 0.01],
  (r) => [(1 + Math.floor(r() * 3)) * 10, (1 + Math.floor(r() * 3)) * 10],
  (r) => [(1 + Math.floor(r() * 40)) * 64, (1 + Math.floor(r() * 40)) * 64],
  (r) => [r() * 0.9 + 0.05, r() * 3 + 0.1],
];

/** This function packs `count` generated inputs with each path of `packSkyline`, and it gives the hash of the results. */
function packs(count: number, seed: number): string {
  const r = mulberry32(seed);
  const parts: string[] = [];
  for (let c = 0; c < count; c++) {
    const size = FAMILIES[c % FAMILIES.length]!;
    const width = r() < 0.15 ? r() * 300 + 0.5 : 1 + Math.floor(r() * 200);
    const rects = Array.from({ length: 1 + Math.floor(r() * 40) }, () => {
      const rect = new Rect<number>();
      const [w, h] = size(r);
      rect.size.set(w, h);
      if (r() < 0.08) {
        rect.locked = true;
        rect.position.set(r() * width - 5, r() * 80);
      }
      return rect;
    });
    const outer = new Rect<number>();
    outer.size.set(width, r() * 400 + 1);
    if (r() < 0.2) outer.position.set(r() * 50, r() * 50);
    outer.fixedSize = r() < 0.3;
    const turned = new Set<unknown>();
    const rule: SkylineRule = r() < 0.5 ? "bl" : "mw";
    const options: SkylineOptions = { rule, wasteMap: r() < 0.5 };
    if (r() < 0.5) {
      options.turnable = new Set(rects.filter((_, i) => i % 2 === 0));
      options.turned = turned;
    }
    clearMoves();
    packSkyline(rects, outer, options);
    parts.push(JSON.stringify([rects.map((a) => [a.position.x, a.position.y, a.size.x, a.size.y, a.wasPacked, turned.has(a)]), outer.size.y, Object.values(MOVES).map((id) => moveCount(id))]));
  }
  clearMoves();
  return sha256Hex(parts.join("\n"));
}

describe("SkylineRuns", () => {
  it("keeps no two neighbors of equal height", () => {
    const skyline = new SkylineRuns(10);
    skyline.raise(0, 4, 5);
    skyline.raise(4, 7, 5);
    expect(skyline.xs).toEqual([0, 7]);
    expect(skyline.ys).toEqual([5, 0]);
    skyline.raise(7, 10, 5);
    expect(skyline.xs).toEqual([0]);
    expect(cellsOf(skyline)).toEqual(new Array(10).fill(5));
  });

  it("cuts a run on each side of a raise", () => {
    const skyline = new SkylineRuns(10);
    skyline.raise(3, 6, 2);
    expect(skyline.xs).toEqual([0, 3, 6]);
    expect(skyline.ys).toEqual([0, 2, 0]);
    expect(cellsOf(skyline)).toEqual([0, 0, 0, 2, 2, 2, 0, 0, 0, 0]);
  });

  it("lifts only the cells below the height", () => {
    const skyline = new SkylineRuns(6);
    skyline.raise(2, 4, 9);
    skyline.lift(0, 6, 3);
    expect(cellsOf(skyline)).toEqual([3, 3, 9, 9, 3, 3]);
    skyline.lift(4, 4, 8);
    expect(cellsOf(skyline)).toEqual([3, 3, 9, 9, 3, 3]);
  });

  it("gives the first of equal windows, the leftmost valid window and the height Infinity when none fits", () => {
    const skyline = new SkylineRuns(10);
    skyline.raise(0, 3, 5);
    skyline.raise(3, 6, 1);
    skyline.raise(6, 8, 7);
    skyline.raise(8, 10, 1);
    expect(skyline.window(2)).toEqual({ x: 3, y: 1, first: 0 });
    expect(skyline.window(2, 6, 6.5)).toEqual({ x: 3, y: 1, first: 3 });
    expect(skyline.window(2, 100, 50).y).toBe(Infinity);
    expect(skyline.window(2, 100, 50).first).toBe(-1);
    expect(skyline.highest()).toBe(7);
  });

  it("does not grow with the width", () => {
    const skyline = new SkylineRuns(1e12);
    skyline.raise(0, 1e6, 3);
    expect(skyline.window(1e6)).toEqual({ x: 1e6, y: 0, first: 0 });
    expect(skyline.xs.length).toBe(2);
    expect(lowestWindow([3, 3, 0, 0], 4, 2)).toEqual({ x: 2, y: 0 });
  });
});

describe("packSkyline on the runs", () => {
  it("gives each output and each move count of the cell path", () => {
    expect(packs(6000, 170)).toBe(CELL_PATH_HASH);
  });

  it("packs a width that the cell path cannot hold", () => {
    const rects = Array.from({ length: 100 }, (_, i) => {
      const rect = new Rect<number>();
      rect.size.set(1000 + i, 500 + i);
      return rect;
    });
    const outer = new Rect<number>();
    outer.size.set(1e12, 0);
    packSkyline(rects, outer);
    expect(rects.every((r) => r.wasPacked)).toBe(true);
    expect(outer.size.y).toBe(599);
  });
});
