import { describe, expect, it } from "vitest";
import { buildFrame } from "./frame.ts";
import { checkHard } from "./check.ts";
import { DEFAULT_TOLERANCE, type PackInput, type PackOutput } from "./contract.ts";
import { toPackInput } from "./layout-input.ts";
import { rectGrid } from "./generators.ts";
import type { ObstacleLayout } from "./layout-input.ts";
import { strategy } from "./registry.ts";
import { spaceOf, spaceParts, type SpaceRect } from "./space.ts";
import { obstacleCuts, oneRegion, packParts, SPLITS, type Part } from "./split.ts";
import { cellOf, createContext, UnsupportedCell } from "./strategy.ts";

// The split of the free space as a stage (roadmap item k41).

const LAYOUTS: readonly ObstacleLayout[] = ["none", "center", "scattered", "wall", "corridors", "touching", "edge"];
const PLACES = ["skyline", "maxrects", "rows", "shelf"] as const;
const SEEDS = [1, 2, 3];

/** This function gives a generated input with rectangle obstacles, or `undefined` when an obstacle is not a rectangle. */
function inputOf(seed: number, obstacles: ObstacleLayout, containerSize: "fixed" | "freeHeight", count = 60): PackInput | undefined {
  const input = toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize, obstacles, sizes: "uniform", count }));
  return cellOf(input).containerShape === "rect" ? input : undefined;
}

/** The generated inputs of each layout, size and seed, with rectangle obstacles. */
function inputs(sizes: readonly ("fixed" | "freeHeight")[] = ["fixed", "freeHeight"]): { name: string; input: PackInput }[] {
  const out: { name: string; input: PackInput }[] = [];
  for (const size of sizes) for (const layout of LAYOUTS) for (const seed of SEEDS) {
    const input = inputOf(seed, layout, size);
    if (input !== undefined) out.push({ name: `${size}/${layout}/s${seed}`, input });
  }
  return out;
}

/** This function gives the area of the union of rectangles, clipped to a rectangle, by a grid of their edges. */
function unionArea(rects: readonly SpaceRect[], w: number, h: number): number {
  const xs = [...new Set([0, w, ...rects.flatMap((r) => [r.x, r.x + r.w])])].filter((x) => x >= 0 && x <= w).sort((a, b) => a - b);
  const ys = [...new Set([0, h, ...rects.flatMap((r) => [r.y, r.y + r.h])])].filter((y) => y >= 0 && y <= h).sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const cy = (ys[j]! + ys[j + 1]!) / 2;
    if (rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
  }
  return area;
}

/** This function gives a part grown by half the gap, in the coordinates of the frame of the input. */
function frameRect(input: PackInput, part: Part): SpaceRect {
  const frame = buildFrame(input);
  const half = (input.gap ?? 0) / 2;
  return { x: part.x - half - frame.ox, y: part.y - half - frame.oy, w: part.w + 2 * half, h: part.h + 2 * half };
}

/** This function gives the JSON text of an output without the time of each stage, which is a time of the clock. */
function textOf(output: PackOutput): string {
  return JSON.stringify({ ...output, trace: output.trace?.map(({ ms: _ms, ...rest }) => rest) });
}

describe("the split one-region", () => {
  it("gives the output of the placement, byte for byte less the stage times, for each obstacle layout", () => {
    let count = 0;
    for (const { name, input } of inputs()) {
      for (const id of PLACES) {
        const s = strategy(id);
        const alone = s.pack(input, s.defaults, createContext(7));
        const split = packParts(input, oneRegion, s, s.defaults, createContext(7));
        expect(textOf(split), `${id} on ${name}`).toBe(textOf(alone));
        count++;
      }
    }
    expect(count).toBeGreaterThan(100);
  });
});

describe("the split obstacle-cuts", () => {
  it("gives parts that do not overlap, in the free space, with the free area of the frame when the gap is 0", () => {
    let read = 0;
    for (const { name, input } of inputs(["fixed"]).flatMap((x) => [x, { name: `${x.name}/gap4`, input: { ...x.input, gap: 4 } }])) {
      const frame = buildFrame(input);
      const space = spaceOf(input, frame);
      const holes = spaceParts(space)!.holes;
      const parts = obstacleCuts.split(input).map((p) => frameRect(input, p));
      for (const r of parts) expect(space.fits(r), `${name}: a part out of the free space`).toBe(true);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]!;
        const b = parts[j]!;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(ox > 1e-9 && oy > 1e-9, `${name}: parts ${i} and ${j} overlap`).toBe(false);
      }
      const free = space.w * space.h - unionArea(holes, space.w, space.h);
      const sum = parts.reduce((s, r) => s + r.w * r.h, 0);
      // A span or a band that is no wider than the gap holds no item, so it is no part. Without a gap, the parts fill the free area.
      if ((input.gap ?? 0) === 0) expect(Math.abs(sum - free) / free, name).toBeLessThan(1e-9);
      else expect(sum, name).toBeLessThanOrEqual(free * (1 + 1e-9));
      read++;
    }
    expect(read).toBeGreaterThan(15);
  });

  it("breaks no hard rule with skyline, maxrects, rows and shelf, with no gap and with a gap", () => {
    for (const { name, input } of inputs().flatMap((x) => [x, { name: `${x.name}/gap4`, input: { ...x.input, gap: 4 } }])) {
      for (const id of PLACES) {
        const s = strategy(id);
        const output = packParts(input, obstacleCuts, s, s.defaults, createContext(7));
        const breaks = Object.entries(checkHard(input, output, DEFAULT_TOLERANCE)).filter(([, n]) => n > 0);
        expect(breaks, `${id} on ${name}`).toEqual([]);
        expect(output.placements.length + output.overflow.length, `${id} on ${name}`).toBe(input.items.length);
      }
    }
  });

  it("gives the parts of a band in reading order, and a free height to the last band", () => {
    const input: PackInput = {
      container: { w: 100, fixed: "width" },
      items: [{ id: "a", w: 10, h: 10 }],
      obstacles: [{ id: "o", region: { kind: "rect", x: 40, y: 20, w: 20, h: 30 } }],
    };
    const parts = obstacleCuts.split(input);
    expect(parts.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
      [0, 0, 100, 20],
      [0, 20, 40, 30],
      [60, 20, 40, 30],
      [0, 50, 100, Infinity],
    ]);
  });

  it("keeps a locked item, and packs no item over it", () => {
    const input: PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      gap: 2,
      items: [{ id: "lock", w: 30, h: 30, x: 35, y: 35, locked: true }, ...Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, w: 18, h: 18 }))],
    };
    const s = strategy("skyline");
    const output = packParts(input, obstacleCuts, s, s.defaults, createContext(0));
    expect(output.placements.find((p) => p.id === "lock")).toEqual({ id: "lock", x: 35, y: 35 });
    const hard = checkHard(input, output, DEFAULT_TOLERANCE);
    expect(Object.entries(hard).filter(([, n]) => n > 0)).toEqual([]);
    expect(output.trace?.[0]?.id).toBe("split:obstacle-cuts");
  });

  it("refuses a round container, a free width, a moving obstacle and pair gaps", () => {
    const items = [{ id: "a", w: 10, h: 10 }];
    expect(() => obstacleCuts.split({ container: { w: 100, h: 100, fixed: "size", shape: { kind: "circle", cx: 50, cy: 50, r: 50 } }, items })).toThrow(UnsupportedCell);
    expect(() => obstacleCuts.split({ container: { h: 100, fixed: "height" }, items })).toThrow(UnsupportedCell);
    const moving = { container: { w: 100, h: 100, fixed: "size" as const }, items, obstacles: [{ id: "o", region: { kind: "rect" as const, x: 0, y: 0, w: 5, h: 5 }, move: { cost: 1 } }] };
    expect(() => obstacleCuts.split(moving)).toThrow(UnsupportedCell);
    const s = strategy("skyline");
    const pairs: PackInput = { container: { w: 100, h: 100, fixed: "size" }, items: [...items, { id: "b", w: 10, h: 10 }], pairGaps: [{ a: "a", b: "b", gap: 5 }] };
    expect(() => packParts(pairs, obstacleCuts, s, s.defaults, createContext(0))).toThrow(RangeError);
  });

  it("lists each split by its id", () => {
    expect(Object.keys(SPLITS)).toEqual(["one-region", "obstacle-cuts"]);
    for (const [id, split] of Object.entries(SPLITS)) expect(split.id).toBe(id);
  });
});
