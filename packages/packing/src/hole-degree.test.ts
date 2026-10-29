import { checkConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  checkHard,
  circleOverlaps,
  holeDegree,
  measure,
  mulberry32,
  outputHash,
  packConfig,
  packSpace,
  packWith,
  shapeStrategies,
  strategies,
  strategy,
  UnsupportedCell,
  UnsupportedShape,
  type Item,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// Roadmap item k90: circles by the maximum hole degree (Huang, Li, Akeb and Li 2005, rule A1.0). Made-up inputs only.

/** This function gives a circle item of radius `r` in a box of side `2r`. */
const disc = (id: string, r: number, extra: Partial<Item> = {}): Item => ({ id, w: 2 * r, h: 2 * r, shape: { kind: "circle", cx: r, cy: r, r }, ...extra });

const pack = (input: PackInput, steps = 8): PackOutput => packWith("hole-degree", input, { steps });

/** This function gives the positions of the placements, rounded to 6 digits, by id. */
const at = (out: PackOutput): Record<string, [number, number]> =>
  Object.fromEntries(out.placements.map((p) => [p.id, [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))]]));

/** This function gives a set of made-up random circles with radii from 1 to 6. */
function randomCircles(seed: number, count: number): Item[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => disc(`c${i}`, 1 + Math.round(rng() * 50) / 10));
}

/** This function tells that each circle is in the container less the inset, by the margin and the circle, with a float tolerance. */
function inside(input: PackInput, out: PackOutput): boolean {
  const inset = input.container.inset ?? 0;
  const byId = new Map(input.items.map((i) => [i.id, i]));
  return out.placements.every((p) => {
    const item = byId.get(p.id)!;
    const s = item.shape as { cx: number; cy: number; r: number };
    const m = typeof item.margin === "number" ? item.margin : 0;
    const x = p.x + s.cx;
    const y = p.y + s.cy;
    const R = s.r + m;
    const eps = 1e-6;
    return x - R >= inset - eps && x + R <= out.size.w - inset + eps && y - R >= inset - eps && y + R <= out.size.h - inset + eps;
  });
}

describe("hole-degree: the rule on small inputs", () => {
  it("puts 2 equal circles side by side in a box that holds them tight", () => {
    const out = pack({ container: { fixed: "size", w: 20, h: 10 }, items: [disc("a", 5), disc("b", 5)] });
    expect(at(out)).toEqual({ a: [0, 0], b: [10, 0] });
    expect(out.overflow).toEqual([]);
    expect(out.size).toEqual({ w: 20, h: 10 });
  });

  it("puts 3 equal circles of a strip of width 4r in the triangle of height 2r + r * sqrt(3)", () => {
    // The first circle goes to the top-left corner, the second to the top-right corner, the third into the hole below them
    const out = pack({ container: { fixed: "width", w: 4 }, items: [disc("a", 1), disc("b", 1), disc("c", 1)] });
    expect(at(out)).toEqual({ a: [0, 0], b: [2, 0], c: [1, Number(Math.sqrt(3).toFixed(6))] });
    expect(out.size.w).toBe(4);
    expect(out.size.h).toBeCloseTo(2 + Math.sqrt(3), 9);
  });

  it("packs 4 equal circles in the square of side 4r as a grid, and puts a fifth circle in the overflow", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => disc(id, 1));
    const out = pack({ container: { fixed: "size", w: 4, h: 4 }, items });
    expect(at(out)).toEqual({ a: [0, 0], b: [2, 0], c: [0, 2], d: [2, 2] });
    expect(out.overflow).toEqual(["e"]);
  });

  it("puts a small circle at the corner place with the least distance to the other items", () => {
    // The large circle fills the height: its corner place has the hole degree 1. The small circle has 4 corner places.
    // Next to the large circle, the distance to the right side is 30 - 2 - (10 + sqrt(80)) = 9.06.
    // In a right corner, the distance to the large circle is hypot(18, 8) - 12 = 7.70. The upper right corner wins the tie by y.
    const input: PackInput = { container: { fixed: "size", w: 30, h: 20 }, items: [disc("small", 2), disc("big", 10)] };
    const out = pack(input);
    expect(at(out)).toEqual({ small: [26, 0], big: [0, 0] });
    expect(out.placements.map((p) => p.id)).toEqual(["small", "big"]);
    expect(circleOverlaps(input, out, 1e-9)).toBe(0);
  });

  it("keeps the gap, the margin, the inset and a pair gap between the circles", () => {
    const items = [disc("a", 3, { margin: 1 }), disc("b", 3, { margin: 1 }), disc("c", 2)];
    const input: PackInput = { container: { fixed: "width", w: 30, inset: 2 }, items, gap: 2, pairGaps: [{ a: "a", b: "c", gap: 9 }] };
    const out = pack(input);
    expect(out.overflow).toEqual([]);
    expect(circleOverlaps(input, out, 1e-9)).toBe(0)
    expect(inside(input, out)).toBe(true);
    const p = at(out);
    const centers = (id: string, r: number): [number, number] => [p[id]![0] + r, p[id]![1] + r];
    const [ax, ay] = centers("a", 3);
    const [cx, cy] = centers("c", 2);
    expect(Math.hypot(ax - cx, ay - cy)).toBeGreaterThanOrEqual(3 + 2 + 9 - 1e-9);
  });
});

describe("hole-degree: the hard rules", () => {
  it("places random circle sets with no overlap and in the container, on fixed and free containers", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const items = randomCircles(seed, 25);
      const area = items.reduce((a, i) => a + i.w * i.h, 0);
      const side = Math.ceil(Math.sqrt(area));
      const options = { gap: seed % 3, margin: seed % 2 };
      const withMargin = items.map((i) => ({ ...i, margin: options.margin }));
      for (const container of [
        { fixed: "width" as const, w: side },
        { fixed: "size" as const, w: side, h: side },
        { fixed: "width" as const, w: side + 6, inset: 3 },
      ]) {
        const input: PackInput = { container, items: withMargin, gap: options.gap };
        const out = pack(input);
        const name = `${seed} ${container.fixed} ${container.w}`;
        expect(circleOverlaps(input, out, 1e-6), name).toBe(0);
        expect(inside(input, out), name).toBe(true);
        const hard = checkHard(input, out);
        expect([hard["in-container"], hard["complete"], hard["locked-kept"]], name).toEqual([0, 0, 0]);
        expect(out.placements.length + out.overflow.length, name).toBe(items.length);
        if (container.fixed === "width") expect(out.overflow, name).toEqual([]);
      }
    }
  });

  it("counts the overlaps of circles by the distance of the centers, not by the bounding boxes", () => {
    const input: PackInput = { container: { fixed: "none" }, items: [disc("a", 5), disc("b", 5), disc("c", 5)] };
    // a and b touch on a diagonal: their boxes overlap, but the circles do not. c overlaps a.
    const d = 10 / Math.SQRT2;
    const out = { placements: [{ id: "a", x: 0, y: 0 }, { id: "b", x: d, y: d }, { id: "c", x: 3, y: 0 }] };
    expect(circleOverlaps(input, out)).toBe(2);
    expect(circleOverlaps(input, { placements: out.placements.slice(0, 2) })).toBe(0);
    expect(circleOverlaps({ ...input, gap: 1 }, { placements: out.placements.slice(0, 2) })).toBe(1);
  });

  it("finds a lower height with more halving steps, and keeps the open strip with 0 steps", () => {
    const input: PackInput = { container: { fixed: "width", w: 40 }, items: randomCircles(9, 30) };
    const open = pack(input, 0);
    const searched = pack(input, 8);
    expect(searched.size.h).toBeLessThanOrEqual(open.size.h);
    expect(open.trace?.[0]?.measures?.["holeDegree.runs"]).toBe(1);
    expect(searched.trace?.[0]?.measures?.["holeDegree.runs"]).toBe(9);
    expect(measure(input, searched)["pack.shapeFill"]).toBeGreaterThan(0.7);
  });
});

describe("hole-degree: determinism", () => {
  it("gives the same output for each seed and each run", () => {
    const input: PackInput = { container: { fixed: "width", w: 50 }, items: randomCircles(4, 30), gap: 1 };
    const first = packWith("hole-degree", input, undefined, 1);
    for (const seed of [1, 2, 99]) expect(outputHash(packWith("hole-degree", input, undefined, seed))).toBe(outputHash(first));
    const { trace: _a, ...a } = first;
    const { trace: _b, ...b } = pack(input);
    expect(a).toEqual(b);
    expect(holeDegree.deterministic).toBe(true);
  });
});

describe("hole-degree: the inputs that it refuses", () => {
  const circles = [disc("a", 2), disc("b", 3)];

  it("refuses rect items, items with no shape, polygons, obstacles, locked items and a circle container with UnsupportedCell", () => {
    const bad: PackInput[] = [
      { container: { fixed: "width", w: 20 }, items: [{ id: "r", w: 4, h: 4 }] },
      { container: { fixed: "width", w: 20 }, items: [...circles, { id: "r", w: 4, h: 4 }] },
      { container: { fixed: "width", w: 20 }, items: [{ id: "p", w: 4, h: 4, shape: { kind: "polygon", points: [[0, 0], [4, 0], [2, 4]] } }] },
      { container: { fixed: "width", w: 20 }, items: circles, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 4, h: 4 } }] },
      { container: { fixed: "width", w: 20 }, items: [disc("a", 2, { locked: true, x: 0, y: 0 }), disc("b", 3)] },
      { container: { fixed: "width", w: 20, shape: { kind: "circle", cx: 10, cy: 10, r: 10 } }, items: circles },
      { container: { fixed: "none" }, items: circles },
      { container: { fixed: "height", h: 20 }, items: circles },
    ];
    for (const [i, input] of bad.entries()) expect(() => pack(input), String(i)).toThrow(UnsupportedCell);
  });

  it("throws a RangeError for a bad value of steps", () => {
    const input: PackInput = { container: { fixed: "width", w: 20 }, items: circles };
    for (const steps of [-1, 1.5, 33]) expect(() => pack(input, steps)).toThrow(RangeError);
  });

  it("declares the shape kind circle, and checkConfig refuses its named config on other kinds", () => {
    expect(holeDegree.supports.itemShape).toEqual(["circle"]);
    const named = packSpace.named!["hole-degree"]!;
    expect(checkConfig(packSpace, named, { shapes: ["circle"] })).toEqual([]);
    for (const kind of ["rect", "polygon", "free"] as const) {
      const breaks = checkConfig(packSpace, named, { shapes: [kind] });
      expect(breaks.length, kind).toBeGreaterThan(0);
      expect(breaks.every((b) => b.claim === "shape"), kind).toBe(true);
    }
    expect(() => packConfig({ container: { fixed: "width", w: 20 }, items: [{ id: "r", w: 4, h: 4 }] }, named)).toThrow(UnsupportedShape);
  });
});

describe("hole-degree in the registry and in packSpace", () => {
  it("is a strategy of shapeStrategies, not of strategies", () => {
    expect(shapeStrategies.map((s) => s.id)).toEqual(["hole-degree"]);
    expect(strategies.map((s) => s.id)).not.toContain("hole-degree");
    expect(strategy("hole-degree")).toBe(holeDegree);
  });

  it("gives the output of packWith for its named config on circle inputs", () => {
    const named = packSpace.named!["hole-degree"]!;
    for (let seed = 1; seed <= 3; seed++) {
      const input: PackInput = { container: { fixed: "width", w: 40 }, items: randomCircles(seed, 20) };
      expect(outputHash(packConfig(input, named, seed)), String(seed)).toBe(outputHash(packWith("hole-degree", input, undefined, seed)));
      const steps = { ...named, stages: { ...named.stages, placement: { option: "hole-degree", params: { steps: 2 } } } };
      expect(outputHash(packConfig(input, steps, seed)), String(seed)).toBe(outputHash(pack(input, 2)));
    }
  });

  it("goes only with the order input and the size search none", () => {
    const named = packSpace.named!["hole-degree"]!;
    const sorted = { ...named, stages: { ...named.stages, order: { option: "area-desc" } } };
    const swept = { ...named, stages: { ...named.stages, "size-search": { option: "log-sweep" } } };
    for (const config of [sorted, swept]) expect(checkConfig(packSpace, config).some((b) => b.claim === "constraint")).toBe(true);
    // The size search none stays only with push and hole-degree. Each other placement, guillotine of k23 too, needs a sweep.
    for (const id of ["rows", "skyline", "shelf", "maxrects", "guillotine"]) {
      const config = packSpace.named![id]!;
      const noSearch = { ...config, stages: { ...config.stages, "size-search": { option: "none" } } };
      expect(checkConfig(packSpace, noSearch).some((b) => b.claim === "constraint"), id).toBe(true);
    }
    expect(checkConfig(packSpace, packSpace.named!["push"]!)).toEqual([]);
  });
});
