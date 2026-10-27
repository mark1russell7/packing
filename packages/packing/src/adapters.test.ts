import { describe, expect, it } from "vitest";
import {
  checkHard,
  createContext,
  fromRects,
  marginOf,
  mulberry32,
  packWith,
  pack,
  Rect,
  strategy,
  toRects,
  type Container,
  type Item,
  type Obstacle,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";

type Fixed = Container["fixed"];

interface Shape {
  fixed: Fixed;
  obstacles: boolean;
  locked: boolean;
  movable?: boolean;
  starts?: boolean;
}

/** This helper gives a whole number from lo to hi. */
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** This helper tells if two boxes (x, y, w, h) overlap, with a common edge as no overlap. */
const hit = (a: number[], b: number[]): boolean => a[0]! < b[0]! + b[2]! && b[0]! < a[0]! + a[2]! && a[1]! < b[1]! + b[3]! && b[1]! < a[1]! + a[3]!;

/** This helper makes a random input of one shape from a seed. */
function randomInput(seed: number, shape: Shape): PackInput {
  const r = mulberry32(seed);
  const W = int(r, 220, 600);
  const H = int(r, 160, 450);
  const gap = [0, 2, 4.5, 8][int(r, 0, 3)]!;
  const inset = [0, 3, 10][int(r, 0, 2)]!;
  const origin = r() < 0.3 ? { x: int(r, -50, 50), y: int(r, -50, 50) } : { x: 0, y: 0 };

  const taken: number[][] = [];
  const obstacles: Obstacle[] = [];
  if (shape.obstacles) {
    const n = int(r, 1, 5);
    for (let i = 0; i < n; i++) {
      const w = int(r, 10, 80);
      const h = int(r, 10, 80);
      const box = [origin.x + int(r, 0, W - w), origin.y + int(r, 0, H - h), w, h];
      const obstacle: Obstacle = { id: `o${i}`, region: { kind: "rect", x: box[0]!, y: box[1]!, w, h } };
      if (shape.movable && r() < 0.5) obstacle.move = { cost: 0 };
      obstacles.push(obstacle);
      taken.push(box);
    }
  }

  const items: Item[] = [];
  const count = int(r, 1, 40);
  const ranks = Array.from({ length: count }, (_, i) => i).toSorted(() => 0);
  if (r() < 0.5) ranks.reverse();
  for (let i = 0; i < count; i++) {
    const item: Item = { id: `b${i}`, w: int(r, 4, 70), h: int(r, 4, 50) };
    const kind = int(r, 0, 2);
    if (kind === 1) item.margin = int(r, 0, 4);
    if (kind === 2) item.margin = { top: int(r, 0, 4), right: int(r, 0, 4), bottom: int(r, 0, 4), left: int(r, 0, 4) };
    if (r() < 0.3) item.rank = ranks[i]!;
    if (shape.starts && r() < 0.8) {
      item.x = origin.x + int(r, 0, W - item.w);
      item.y = origin.y + int(r, 0, H - item.h);
    }
    items.push(item);
  }

  if (shape.locked) {
    // Lock a few items at free places inside the container, with their margins
    for (const item of items.slice(0, int(r, 1, 3))) {
      const m = marginOf(item);
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = origin.x + m.left + int(r, 0, Math.max(0, W - item.w - m.left - m.right));
        const y = origin.y + m.top + int(r, 0, Math.max(0, H - item.h - m.top - m.bottom));
        const box = [x - m.left, y - m.top, item.w + m.left + m.right, item.h + m.top + m.bottom];
        if (taken.some((t) => hit(t, box))) continue;
        taken.push(box);
        item.locked = true;
        item.x = x;
        item.y = y;
        break;
      }
    }
  }

  const container: Container = { fixed: shape.fixed, inset };
  if (shape.fixed === "size" || shape.fixed === "width") container.w = W;
  if (shape.fixed === "size" || shape.fixed === "height") container.h = H;
  if (shape.fixed === "none") {
    container.aspect = [1, 16 / 9, 0.5][int(r, 0, 2)]!;
    if (r() < 0.3) container.aspectWeight = 0;
  }
  if (origin.x !== 0 || origin.y !== 0) container.shape = { kind: "rect", x: origin.x, y: origin.y, w: W, h: H };
  const input: PackInput = { container, items, gap };
  if (obstacles.length > 0) input.obstacles = obstacles;
  return input;
}

/** This helper gives an output without the times of its stages. */
const withoutTimes = (output: PackOutput) => ({
  ...output,
  trace: output.trace.map((t) => ({ id: t.id, measures: Object.entries(t.measures).filter(([name]) => !name.endsWith(".ms")) })),
});

/**
 * This helper checks the gap between the items and the inset of the container. It gives the count of the breaks. A
 * locked item has the place of the caller, thus the helper skips the pairs with a locked item.
 */
function spacingBreaks(input: PackInput, output: PackOutput): number {
  const gap = input.gap ?? 0;
  const inset = input.container.inset ?? 0;
  const items = new Map(input.items.map((i) => [i.id, i]));
  const shape = input.container.shape;
  const ox = shape?.kind === "rect" ? shape.x : 0;
  const oy = shape?.kind === "rect" ? shape.y : 0;
  const boxes = output.placements.map((p) => {
    const item = items.get(p.id)!;
    const m = marginOf(item);
    return { locked: item.locked === true, l: p.x - m.left, t: p.y - m.top, r: p.x + item.w + m.right, b: p.y + item.h + m.bottom };
  });
  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const obstacles = (input.obstacles ?? []).map((o) => {
    const reg = o.region as { x: number; y: number; w: number; h: number };
    const at = moved.get(o.id) ?? reg;
    return { l: at.x, t: at.y, r: at.x + reg.w, b: at.y + reg.h };
  });
  const apart = (a: typeof obstacles[number], b: typeof obstacles[number]): boolean =>
    a.r + gap <= b.l + 1e-6 || b.r + gap <= a.l + 1e-6 || a.b + gap <= b.t + 1e-6 || b.b + gap <= a.t + 1e-6;
  let breaks = 0;
  for (const [i, a] of boxes.entries()) {
    if (a.locked) continue;
    if (a.l < ox + inset - 1e-6 || a.t < oy + inset - 1e-6) breaks++;
    if (input.container.fixed === "size" || input.container.fixed === "width") if (a.r > ox + input.container.w! - inset + 1e-6) breaks++;
    if (input.container.fixed === "size" || input.container.fixed === "height") if (a.b > oy + input.container.h! - inset + 1e-6) breaks++;
    for (const b of boxes.slice(i + 1)) if (!b.locked && !apart(a, b)) breaks++;
    for (const o of obstacles) if (!apart(a, o)) breaks++;
  }
  return breaks;
}

const ZERO = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** The shapes of the random inputs of each strategy. */
const SHAPES: Record<string, Shape[]> = {
  rows: (["size", "width", "height", "none"] as const).map((fixed) => ({ fixed, obstacles: false, locked: false })),
  skyline: (["size", "width", "height", "none"] as const).map((fixed) => ({ fixed, obstacles: true, locked: true })),
  shelf: (["size", "width", "height", "none"] as const).map((fixed) => ({ fixed, obstacles: true, locked: true })),
  push: (["size", "width", "height"] as const).map((fixed) => ({ fixed, obstacles: true, locked: true, movable: true, starts: true })),
};

const SEEDS = 120;

describe.each(Object.keys(SHAPES))("the strategy %s", (id) => {
  for (const shape of SHAPES[id]!) {
    it(`gives 0 hard breaks, keeps the gap and the inset, and is the same for the same seed (fixed ${shape.fixed})`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const input = randomInput(seed * 7919 + shape.fixed.length, shape);
        const copy = structuredClone(input);
        const output = packWith(id, input, undefined, seed);
        const label = `${id} ${shape.fixed} seed ${seed}`;
        expect(input, label).toEqual(copy);
        expect(checkHard(input, output), label).toEqual(ZERO);
        expect(spacingBreaks(input, output), label).toBe(0);
        expect(withoutTimes(packWith(id, input, undefined, seed)), label).toEqual(withoutTimes(output));
        const placed = new Set(output.placements.map((p) => p.id));
        expect(placed.size + output.overflow.length, label).toBe(input.items.length);
        if (shape.fixed !== "size") expect(output.overflow, label).toEqual([]);
        if (shape.fixed === "width") expect(output.size.w, label).toBe(input.container.w);
        if (shape.fixed === "height") expect(output.size.h, label).toBe(input.container.h);
        for (const t of output.trace) expect(t.ms, label).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("packs with each sort order", () => {
    for (const sortOrder of ["height-desc", "height-asc", "width-desc", "area-desc", "input"]) {
      const input = randomInput(42, SHAPES[id]![0]!);
      expect(checkHard(input, packWith(id, input, { sortOrder })), sortOrder).toEqual(ZERO);
    }
  });
});

describe("the adapters", () => {
  it("pack an item with its margin and keep two items mA + gap + mB apart", () => {
    const input: PackInput = {
      container: { w: 100, fixed: "width", inset: 5 },
      gap: 4,
      items: [
        { id: "a", w: 20, h: 10, margin: 2 },
        { id: "b", w: 20, h: 10, margin: { top: 0, right: 0, bottom: 0, left: 3 } },
      ],
    };
    const output = packWith("shelf", input, { sortOrder: "input" });
    expect(output.placements).toEqual([
      { id: "a", x: 7, y: 7 },
      { id: "b", x: 7 + 20 + 2 + 4 + 3, y: 5 },
    ]);
    expect(output.size).toEqual({ w: 100, h: 7 + 10 + 2 + 5 });
    expect(output.trace.map((t) => t.id)).toEqual(["shelf"]);
  });

  it("put the items in rank order for the sort order input", () => {
    const input: PackInput = {
      container: { w: 1000, fixed: "width" },
      items: [
        { id: "a", w: 10, h: 10, rank: 2 },
        { id: "b", w: 10, h: 10, rank: 0 },
        { id: "c", w: 10, h: 10, rank: 1 },
      ],
    };
    const xs = Object.fromEntries(packWith("rows", input, { sortOrder: "input" }).placements.map((p) => [p.id, p.x]));
    expect(xs).toEqual({ b: 0, c: 10, a: 20 });
  });

  it("turn the axes for a fixed height", () => {
    const input: PackInput = { container: { h: 30, fixed: "height" }, items: [10, 10, 10, 10].map((s, i) => ({ id: `i${i}`, w: s * 2, h: s })) };
    const output = packWith("shelf", input, { sortOrder: "input" });
    expect(output.size).toEqual({ w: 40, h: 30 });
    expect(output.trace.map((t) => t.id)).toEqual(["axes", "shelf"]);
    expect(checkHard(input, output)).toEqual(ZERO);
  });

  it("search the size for fixed none with the size search log-sweep", () => {
    const input: PackInput = { container: { fixed: "none", aspect: 2 }, items: Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, w: 10 + (i % 7), h: 8 + (i % 5) })) };
    const output = packWith("skyline", input);
    expect(output.trace.map((t) => t.id)).toEqual(["log-sweep", "skyline"]);
    expect(output.trace[0]!.measures["pack.search.widths"]).toBeGreaterThan(1);
    expect(output.size.w / output.size.h).toBeGreaterThan(1.2);
    expect(checkHard(input, output)).toEqual(ZERO);
  });

  it("put an item that cannot fit a fixed width in the overflow", () => {
    const output = packWith("skyline", { container: { w: 50, fixed: "width" }, items: [{ id: "wide", w: 60, h: 5 }, { id: "ok", w: 5, h: 5 }] });
    expect(output.overflow).toEqual(["wide"]);
    expect(output.placements.map((p) => p.id)).toEqual(["ok"]);
  });

  it("give the same result as pack of 0.1 through fromRects and toRects", () => {
    const make = () =>
      Array.from({ length: 25 }, (_, i) => {
        const rect = new Rect<number>();
        rect.size.set(5 + ((i * 13) % 31), 4 + ((i * 7) % 19));
        rect.id = i;
        return rect;
      });
    const outerA = new Rect<number>();
    outerA.size.set(120, 0);
    outerA.fixedWidth = true;
    const a = make();
    pack(a, outerA, { strategy: "skyline" });

    const outerB = new Rect<number>();
    outerB.size.set(120, 0);
    outerB.fixedWidth = true;
    const b = make();
    const input = fromRects(b, outerB);
    expect(input.container).toEqual({ fixed: "width", w: 120 });
    toRects(packWith("skyline", input), b, outerB);
    expect(b.map((r) => [r.position.x, r.position.y, r.wasPacked])).toEqual(a.map((r) => [r.position.x, r.position.y, r.wasPacked]));
    expect(outerB.size.y).toBe(outerA.size.y);
  });

  it("keep a locked rect and an outer position through fromRects", () => {
    const outer = new Rect();
    outer.position.set(10, 20);
    outer.size.set(100, 50);
    outer.fixedSize = true;
    const pin = new Rect();
    pin.size.set(20, 20);
    pin.position.set(10, 20);
    pin.locked = true;
    const free = new Rect();
    free.size.set(30, 10);
    const input = fromRects([pin, free], outer);
    expect(input.container).toEqual({ fixed: "size", w: 100, h: 50, shape: { kind: "rect", x: 10, y: 20, w: 100, h: 50 } });
    expect(input.items[0]).toEqual({ id: "0", w: 20, h: 20, locked: true, x: 10, y: 20 });
    toRects(packWith("skyline", input), [pin, free], outer);
    expect([free.position.x, free.position.y, free.wasPacked]).toEqual([30, 20, true]);
    expect(outer.size.x).toBe(100);
  });
});

describe("the strategy push", () => {
  it("pushes a movable obstacle and tells where it went", () => {
    const input: PackInput = {
      container: { w: 200, h: 100, fixed: "size" },
      items: [{ id: "a", w: 40, h: 40, x: 0, y: 0 }],
      obstacles: [
        { id: "free", region: { kind: "rect", x: 30, y: 10, w: 20, h: 20 }, move: { cost: 0 } },
        { id: "wall", region: { kind: "rect", x: 150, y: 0, w: 10, h: 100 } },
      ],
    };
    const output = packWith("push", input);
    expect(output.placements).toEqual([{ id: "a", x: 0, y: 0 }]);
    expect(output.moved).toEqual([{ id: "free", x: 40, y: 10 }]);
    expect(checkHard(input, output)).toEqual(ZERO);
  });

  it("starts from the previous output and moves only what overlaps", () => {
    const items: Item[] = [
      { id: "a", w: 20, h: 20 },
      { id: "b", w: 20, h: 20 },
      { id: "c", w: 20, h: 20 },
    ];
    const previous = packWith("shelf", { container: { w: 100, fixed: "width" }, items }, { sortOrder: "input" });
    const s = strategy("push");
    const grown: PackInput = { container: { w: 100, fixed: "width" }, items: [{ ...items[0]!, w: 30 }, items[1]!, items[2]!] };
    const output = s.pack(grown, s.defaults, createContext(1, { previous }));
    expect(output.placements).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 30, y: 0 },
      { id: "c", x: 50, y: 0 },
    ]);
    expect(checkHard(grown, output)).toEqual(ZERO);
  });
});

describe("the example of the README", () => {
  it("packs with 0 hard breaks", () => {
    const input: PackInput = {
      container: { w: 400, fixed: "width", inset: 8 },
      gap: 4,
      items: [
        { id: "a", w: 120, h: 40, margin: 2 },
        { id: "pin", w: 60, h: 60, x: 200, y: 8, locked: true },
        { id: "b", w: 80, h: 30 },
      ],
      obstacles: [{ id: "logo", region: { kind: "rect", x: 300, y: 0, w: 100, h: 50 } }],
    };
    const output = packWith("shelf", input, { sortOrder: "input" });
    expect(checkHard(input, output)).toEqual(ZERO);
    expect(output.placements.map((p) => p.id).toSorted()).toEqual(["a", "b", "pin"]);
    expect(output.size.w).toBe(400);
  });
});
