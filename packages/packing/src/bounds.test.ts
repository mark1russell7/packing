// The lower bounds of roadmap item k51. Each test uses made-up inputs. A tiny exhaustive packer gives the optimum of the
// small inputs, on a grid of whole numbers. With whole sizes, a packing on the grid reaches the optimum.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOUND_KINDS,
  boundGap,
  boundMeasures,
  boundShare,
  cellOf,
  corpus,
  measure,
  mmvBound,
  mulberry32,
  objectiveBound,
  packWith,
  strategies,
  supportsCell,
  toPackInput,
  UnsupportedCell,
  type CorpusSpec,
  type Item,
  type PackInput,
} from "@mark1russell7/packing";

/** A rectangle of the exhaustive packer, with its turns. */
type Shape = readonly (readonly [number, number])[];

/**
 * This function tells if the shapes fit in a grid of `W` by `H` cells. It fills the first empty cell with the corner of a
 * shape, or leaves it empty. Each packing on the grid places its shapes in that order, so the search is complete.
 */
function fits(shapes: readonly Shape[], W: number, H: number): boolean {
  const grid = new Uint8Array(W * H);
  const used = new Array<boolean>(shapes.length).fill(false);
  const need = shapes.reduce((sum, s) => sum + s[0]![0] * s[0]![1], 0);
  if (need > W * H) return false;
  const free = (x: number, y: number, w: number, h: number): boolean => {
    if (x + w > W || y + h > H) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j * W + i] !== 0) return false;
    return true;
  };
  const mark = (x: number, y: number, w: number, h: number, v: number): void => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * W + i] = v;
  };
  // `cells` counts the cells from `from` to the end, and `rest` is the area of the shapes that are not placed
  const search = (from: number, left: number, cells: number, rest: number): boolean => {
    if (left === 0) return true;
    if (rest > cells) return false;
    let at = from;
    let open = 0;
    while (at < W * H && grid[at] !== 0) at++;
    for (let i = at; i < W * H; i++) if (grid[i] === 0) open++;
    if (at === W * H || rest > open) return false;
    const x = at % W;
    const y = Math.floor(at / W);
    for (let k = 0; k < shapes.length; k++) {
      if (used[k]) continue;
      for (const [w, h] of shapes[k]!) {
        if (!free(x, y, w, h)) continue;
        used[k] = true;
        mark(x, y, w, h, 1);
        if (search(at + 1, left - 1, open - w * h, rest - w * h)) return true;
        mark(x, y, w, h, 0);
        used[k] = false;
      }
    }
    // The cell stays empty
    grid[at] = 2;
    const ok = search(at + 1, left, open - 1, rest);
    grid[at] = 0;
    return ok;
  };
  return search(0, shapes.length, W * H, need);
}

/**
 * This function gives the turns of an item, grown by a margin on each side and by half the gap on each side.
 * Two items are `mA + gap + mB` apart (decision 3), so these shapes do not overlap, and each optimum of the shapes is a layout.
 */
const shapeOf = (item: Item, margin = 0, gap = 0): Shape => {
  const w = item.w + 2 * margin + gap;
  const h = item.h + 2 * margin + gap;
  return item.turnable === true && w !== h ? [[w, h], [h, w]] : [[w, h]];
};

/** This function gives the least height of a strip of the width `W`. The shapes with the gap use a strip that is wider by the gap. */
function stripOptimum(items: readonly Item[], W: number, margin = 0, gap = 0): number {
  const shapes = items.map((i) => shapeOf(i, margin, gap));
  for (let H = 1; ; H++) if (fits(shapes, W + gap, H)) return H - 2 * margin - gap;
}

/** This function gives the least area of a hull, with no fixed side. */
function areaOptimum(items: readonly Item[], margin = 0, gap = 0): number {
  const shapes = items.map((i) => shapeOf(i, margin, gap));
  const grow = 2 * margin + gap;
  const most = items.reduce((sum, i) => sum + Math.max(i.w, i.h) + grow, 0);
  const sizes: [number, number][] = [];
  for (let w = 1; w <= most; w++) for (let h = 1; h <= most; h++) sizes.push([w, h]);
  const inner = ([w, h]: [number, number]): number => (w - grow) * (h - grow);
  sizes.sort((p, q) => inner(p) - inner(q));
  for (const s of sizes) if (s[0] > grow && s[1] > grow && fits(shapes, s[0], s[1])) return inner(s);
  throw new Error("No size fits.");
}

/** This function gives the largest placed share of the item area in a fixed container. The shapes with the gap use a container that is larger by the gap. */
function placedOptimum(items: readonly Item[], W: number, H: number, margin = 0, gap = 0): number {
  const total = items.reduce((sum, i) => sum + i.w * i.h, 0);
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    const chosen = items.filter((_, k) => (mask & (1 << k)) !== 0);
    const area = chosen.reduce((sum, i) => sum + i.w * i.h, 0);
    if (area > best && fits(chosen.map((i) => shapeOf(i, margin, gap)), W + gap, H + gap)) best = area;
  }
  return best / total;
}

/** This function gives the least count of the items that do not fit a fixed container. */
function leastOverflow(items: readonly Item[], W: number, H: number, margin = 0, gap = 0): number {
  let least = items.length;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    const chosen = items.filter((_, k) => (mask & (1 << k)) !== 0);
    if (fits(chosen.map((i) => shapeOf(i, margin, gap)), W + gap, H + gap)) least = Math.min(least, items.length - chosen.length);
  }
  return least;
}

/** The margins and the gaps of the property tests of k118: a margin, a gap, and both. */
const KNOBS: readonly { margin: number; gap: number }[] = [
  { margin: 1, gap: 0 },
  { margin: 0, gap: 1 },
  { margin: 0, gap: 2 },
  { margin: 1, gap: 1 },
];

/** This function makes `n` items with whole sizes from 1 to `max`. */
function itemsOf(r: () => number, n: number, maxW: number, maxH: number, turns: boolean): Item[] {
  return Array.from({ length: n }, (_, k) => ({
    id: `i${k}`,
    w: 1 + Math.floor(r() * maxW),
    h: 1 + Math.floor(r() * maxH),
    ...(turns && r() < 0.5 ? { turnable: true } : {}),
  }));
}

const strip = (items: Item[], w: number, extra: Partial<PackInput> = {}): PackInput => ({ container: { w, fixed: "width" }, items, ...extra });

describe("the strip bounds", () => {
  it("are at most the optimum of small inputs, with and without the tolerance", () => {
    const r = mulberry32(51);
    for (let trial = 0; trial < 60; trial++) {
      const W = 3 + Math.floor(r() * 4);
      const items = itemsOf(r, 2 + Math.floor(r() * 5), W, 4, trial % 2 === 1).filter((i) => i.w <= W);
      if (items.length === 0) continue;
      const best = stripOptimum(items, W);
      for (const tolerance of [0, 0.001]) {
        const bound = objectiveBound(strip(items, W), { tolerance })!;
        expect(bound.objective).toBe("height");
        for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind}`).toBeLessThanOrEqual(best + 1e-9);
      }
    }
  });

  it("are at most the optimum with a margin on each item", () => {
    const r = mulberry32(7);
    for (let trial = 0; trial < 30; trial++) {
      const W = 5 + Math.floor(r() * 3);
      const items = itemsOf(r, 2 + Math.floor(r() * 3), 3, 3, false).map((i) => ({ ...i, margin: 1 }));
      const best = stripOptimum(items, W, 1);
      const bound = objectiveBound(strip(items, W), { tolerance: 0 })!;
      expect(bound.parts["strip.margin"]).toBeDefined();
      for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind}`).toBeLessThanOrEqual(best + 1e-9);
    }
  });

  it("are at most the optimum with the margins and the gap of k118, with and without the tolerance", () => {
    const r = mulberry32(118);
    for (let trial = 0; trial < 24; trial++) {
      const { margin, gap } = KNOBS[trial % KNOBS.length]!;
      const W = 6 + Math.floor(r() * 3);
      const items = itemsOf(r, 2 + Math.floor(r() * 3), 3, 3, trial % 3 === 0).map((i) => (margin > 0 ? { ...i, margin } : i));
      const best = stripOptimum(items, W, margin, gap);
      for (const tolerance of [0, 0.001]) {
        const bound = objectiveBound(strip(items, W, gap > 0 ? { gap } : {}), { tolerance })!;
        expect(bound.parts["strip.margin"]).toBeDefined();
        for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind} m${margin} g${gap}`).toBeLessThanOrEqual(best + 1e-9);
      }
    }
  });

  it("is tight on a perfect tiling: the area bound is the optimum", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 5, h: 5 }));
    const bound = objectiveBound(strip(items, 10), { tolerance: 0 })!;
    expect(bound.value).toBe(10);
    expect(bound.kind).toBe("strip.area");
    expect(stripOptimum(items, 10)).toBe(10);
  });

  it("gives mmv above the area when wide items stack", () => {
    const items = [
      { id: "a", w: 7, h: 2 },
      { id: "b", w: 4, h: 2 },
      { id: "c", w: 4, h: 2 },
      { id: "d", w: 4, h: 2 },
    ];
    const bound = objectiveBound(strip(items, 10), { tolerance: 0 })!;
    expect(bound.parts["strip.area"]).toBe(4);
    expect(bound.parts["strip.mmv"]).toBe(5);
    expect(bound.kind).toBe("strip.mmv");
    expect(bound.value).toBeLessThanOrEqual(stripOptimum(items, 10));
    expect(mmvBound([{ w: 6, h: 1 }, { w: 6, h: 1 }], 10)).toBe(2);
  });

  it("gives the tallest item, and leaves out an item wider than the strip", () => {
    const bound = objectiveBound(strip([{ id: "t", w: 1, h: 9 }, { id: "x", w: 20, h: 1 }, { id: "y", w: 2, h: 1 }], 4), { tolerance: 0 })!;
    expect(bound.value).toBe(9);
    expect(bound.kind).toBe("strip.tallest");
    expect(bound.items).toEqual(["t", "y"]);
    expect(bound.overflow).toBe(1);
  });

  it("bounds the width of a strip with a fixed height by the same rules", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 3, h: 5 }));
    const bound = objectiveBound({ container: { h: 10, fixed: "height" }, items }, { tolerance: 0 })!;
    expect(bound.objective).toBe("width");
    expect(bound.value).toBe(6);
  });
});

describe("the hull bounds", () => {
  it("are at most the optimum of small inputs", () => {
    const r = mulberry32(3);
    for (let trial = 0; trial < 40; trial++) {
      const items = itemsOf(r, 2 + Math.floor(r() * 3), 3, 3, trial % 2 === 0);
      const best = areaOptimum(items);
      for (const tolerance of [0, 0.001]) {
        const bound = objectiveBound({ container: { fixed: "none" }, items }, { tolerance })!;
        expect(bound.objective).toBe("area");
        for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind}`).toBeLessThanOrEqual(best + 1e-9);
      }
    }
  });

  it("are at most the optimum with a margin on each item", () => {
    const r = mulberry32(11);
    for (let trial = 0; trial < 15; trial++) {
      const items = itemsOf(r, 2 + Math.floor(r() * 2), 3, 3, false).map((i) => ({ ...i, margin: 1 }));
      const best = areaOptimum(items, 1);
      const bound = objectiveBound({ container: { fixed: "none", aspectWeight: 0 }, items }, { tolerance: 0 })!;
      expect(bound.parts["hull.margin"]).toBeDefined();
      for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind}`).toBeLessThanOrEqual(best + 1e-9);
    }
  });

  it("are at most the optimum with the margins and the gap of k118", () => {
    const r = mulberry32(1180);
    for (let trial = 0; trial < 12; trial++) {
      const { margin, gap } = KNOBS[trial % KNOBS.length]!;
      const items = itemsOf(r, 2, 3, 3, false).map((i) => (margin > 0 ? { ...i, margin } : i));
      const best = areaOptimum(items, margin, gap);
      const bound = objectiveBound({ container: { fixed: "none", aspectWeight: 0 }, items, ...(gap > 0 ? { gap } : {}) }, { tolerance: 0 })!;
      expect(bound.parts["hull.margin"]).toBeDefined();
      for (const [kind, v] of Object.entries(bound.parts)) expect(v, `${trial} ${kind} m${margin} g${gap}`).toBeLessThanOrEqual(best + 1e-9);
    }
  });

  it("is tight on a perfect tiling, and gives the extent of a long item", () => {
    const tiles = Array.from({ length: 9 }, (_, k) => ({ id: `t${k}`, w: 1, h: 1 }));
    expect(objectiveBound({ container: { fixed: "none" }, items: tiles }, { tolerance: 0 })!.value).toBe(9);
    expect(areaOptimum(tiles)).toBe(9);
    const long = objectiveBound({ container: { fixed: "none" }, items: [{ id: "a", w: 8, h: 1 }, { id: "b", w: 1, h: 8 }] }, { tolerance: 0 })!;
    expect(long.kind).toBe("hull.extent");
    expect(long.value).toBe(64);
  });
});

describe("the bound of a fixed container", () => {
  it("is at least the best placed share, and its overflow is at most the least overflow", () => {
    const r = mulberry32(5);
    for (let trial = 0; trial < 30; trial++) {
      const W = 3 + Math.floor(r() * 3);
      const H = 3 + Math.floor(r() * 3);
      const items = itemsOf(r, 2 + Math.floor(r() * 4), 4, 4, false);
      const bound = objectiveBound({ container: { w: W, h: H, fixed: "size" }, items })!;
      expect(bound.sense).toBe("upper");
      expect(bound.value).toBeGreaterThanOrEqual(placedOptimum(items, W, H) - 1e-9);
      expect(bound.overflow).toBeLessThanOrEqual(leastOverflow(items, W, H));
    }
  });

  it("stays sound with the margins and the gap of k118: at least the best share, and an overflow of at most the least", () => {
    const r = mulberry32(11800);
    for (let trial = 0; trial < 24; trial++) {
      const { margin, gap } = KNOBS[trial % KNOBS.length]!;
      const W = 4 + Math.floor(r() * 3);
      const H = 4 + Math.floor(r() * 3);
      const items = itemsOf(r, 2 + Math.floor(r() * 3), 3, 3, false).map((i) => (margin > 0 ? { ...i, margin } : i));
      const bound = objectiveBound({ container: { w: W, h: H, fixed: "size" }, items, ...(gap > 0 ? { gap } : {}) })!;
      expect(bound.value, `${trial} m${margin} g${gap}`).toBeGreaterThanOrEqual(placedOptimum(items, W, H, margin, gap) - 1e-9);
      expect(bound.overflow, `${trial} m${margin} g${gap}`).toBeLessThanOrEqual(leastOverflow(items, W, H, margin, gap));
    }
  });

  it("counts the margins and the gap: 4 squares of 4 with the margin 1 fill a box of 12, and the gap 2 sends 1 out", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 4, h: 4, margin: 1 }));
    // Each square with its margin is 6 by 6, so 4 fit a box of 12 by 12: the bound is 1.
    expect(objectiveBound({ container: { w: 12, h: 12, fixed: "size" }, items }, { tolerance: 0 })!.value).toBe(1);
    // With the gap 2, a square needs 8 by 8 of a box of 14 by 14. The area 196 holds 3 of 64, so 1 square goes.
    const gapped = objectiveBound({ container: { w: 12, h: 12, fixed: "size" }, items, gap: 2 })!;
    expect(gapped.overflow).toBe(1);
    // The area needs 60 more, and 60 of the grown area is 15 of the item area, out of 64: a part of a square counts.
    expect(gapped.value).toBeCloseTo(1 - 15 / 64, 2);
    // The area bound is weak here: only 1 square fits, and the bound stays above that optimum.
    expect(placedOptimum(items, 12, 12, 1, 2)).toBe(0.25);
  });

  it("subtracts a fixed obstacle from the free area", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 5, h: 5 }));
    const bound = objectiveBound({ container: { w: 10, h: 10, fixed: "size" }, items, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 } }] })!;
    expect(bound.value).toBeCloseTo(0.75, 2);
    expect(bound.overflow).toBe(1);
  });
});

describe("objectiveBound", () => {
  it("gives null with no item, with no fixed length, or with a margin below 0", () => {
    expect(objectiveBound({ container: { w: 10, fixed: "width" }, items: [] })).toBeNull();
    expect(objectiveBound({ container: { fixed: "width" }, items: [{ id: "a", w: 1, h: 1 }] })).toBeNull();
    expect(objectiveBound({ container: { fixed: "none" }, items: [{ id: "a", w: 4, h: 4, margin: -1 }] })).toBeNull();
  });

  it("counts the gap: 4 squares of 5 with the gap 4 stack in a strip of 10, and the bound is that height", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 5, h: 5 }));
    // 5 + 4 + 5 is more than 10, so the squares stack: 4 * 5 + 3 * 4 = 32. Each piece of 9 is wider than half the strip of 14.
    const bound = objectiveBound(strip(items, 10, { gap: 4 }), { tolerance: 0 })!;
    expect(bound.value).toBe(32);
    expect(bound.kind).toBe("strip.margin");
    // A square in pairGaps does not grow, so the bound with 4 paired squares is the bound without the gap.
    const pairs = [{ a: "s0", b: "s1", gap: 0 }, { a: "s2", b: "s3", gap: 0 }];
    expect(objectiveBound(strip(items, 10, { gap: 4, pairGaps: pairs }), { tolerance: 0 })!.value).toBe(10);
  });

  it("ignores the obstacles of a free side and a circle container: the bound gets weaker, not wrong", () => {
    const items = Array.from({ length: 4 }, (_, k) => ({ id: `s${k}`, w: 5, h: 5 }));
    const plain = objectiveBound(strip(items, 10), { tolerance: 0 })!.value;
    const obstacles = [{ id: "o", region: { kind: "circle" as const, cx: 5, cy: 5, r: 2 } }];
    expect(objectiveBound(strip(items, 10, { obstacles }), { tolerance: 0 })!.value).toBe(plain);
    const circle = { container: { fixed: "width" as const, shape: { kind: "circle" as const, cx: 5, cy: 5, r: 5 } }, items };
    expect(objectiveBound(circle, { tolerance: 0 })!.value).toBe(plain);
  });
});

describe("boundGap", () => {
  it("is 0 at the bound, and above 0 for a worse result in each sense", () => {
    expect(boundGap(10, 10, "lower")).toBe(0);
    expect(boundGap(12, 10, "lower")).toBeCloseTo(0.2, 9);
    expect(boundGap(0.5, 1, "upper")).toBe(1);
    expect(boundGap(0, 0, "lower")).toBe(0);
    expect(boundGap(3, 0, "lower")).toBe(Infinity);
  });
});

describe("boundShare", () => {
  it("is 0 at the bound, at most 1 for each result, and g / (1 + g) of the ratio g", () => {
    expect(boundShare(10, 10, "lower")).toBe(0);
    expect(boundShare(12, 10, "lower")).toBeCloseTo(1 / 6, 9);
    expect(boundShare(0.5, 1, "upper")).toBe(0.5);
    // A tiny placed share: the ratio is 999, the share stays below 1
    expect(boundGap(0.001, 1, "upper")).toBeCloseTo(999, 6);
    expect(boundShare(0.001, 1, "upper")).toBeCloseTo(0.999, 9);
    expect(boundShare(0, 1, "upper")).toBe(1);
    expect(boundShare(0, 0, "lower")).toBe(0);
    expect(boundShare(0, 0, "upper")).toBe(0);
    // A result better than its bound gives a share below 0: the bound is wrong
    expect(boundShare(8, 10, "lower")).toBeLessThan(0);
    expect(boundShare(0.5, 0, "upper")).toBe(-1);
    const r = mulberry32(6);
    for (let k = 0; k < 200; k++) {
      const bound = r() * 10;
      const result = bound * (1 + r() * 50);
      const g = boundGap(result, bound, "lower");
      const s = boundShare(result, bound, "lower");
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(s).toBeCloseTo(g / (1 + g), 9);
    }
  });
});

describe("the bounds on the corpus", () => {
  const specsOf = (name: string): CorpusSpec[] => (JSON.parse(readFileSync(new URL(`../bench/corpora/${name}.json`, import.meta.url), "utf8")) as { specs: CorpusSpec[] }).specs;

  it("are at most the result of each strategy, and the measure adds no field to measure", () => {
    const kinds = new Set<string>();
    for (const name of ["smoke-v1", "pack-free-v1"]) {
      const inputs = corpus(name, specsOf(name)).inputs.filter((_, k) => name === "smoke-v1" || k % 24 === 0);
      for (const file of inputs) {
        const input = toPackInput(file);
        for (const s of strategies) {
          if (!supportsCell(s.supports, cellOf(input))) continue;
          let output;
          try {
            output = packWith(s.id, input, undefined, file.seed);
          } catch (error) {
            if (error instanceof UnsupportedCell) continue;
            throw error;
          }
          const m = boundMeasures(input, output);
          expect(Object.keys(measure(input, output))).not.toContain("pack.gap");
          if (m["pack.gap"] === undefined) continue;
          kinds.add(BOUND_KINDS[m["pack.bound.kind"]!]!);
          expect(m["pack.gap"], `${s.id} ${file.id}`).toBeGreaterThanOrEqual(-1e-9);
          expect(m["pack.gap"], `${s.id} ${file.id}`).toBeLessThanOrEqual(1);
        }
      }
    }
    expect([...kinds].some((k) => k.startsWith("strip."))).toBe(true);
    expect([...kinds].some((k) => k.startsWith("hull."))).toBe(true);
    expect(kinds.has("placed.free")).toBe(true);
  }, 120_000);
});
