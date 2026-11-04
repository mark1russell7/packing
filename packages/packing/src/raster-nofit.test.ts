import { mulberry32, turnPoint } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import type { Item, PackInput, PackOutput, Placement, Region } from "./contract.ts";
import { packRasterNofit, RASTER_NOFIT_MAX_CELLS, RASTER_NOFIT_STAGE, rasterCell, rasterCover, type RasterCover } from "./raster-nofit.ts";

// The exact geometry of the tests. Each float is a whole number times a power of 2, so `big` loses nothing. The checks compare `bigint` values only.
// The robust predicates of the home package are not a dependency of this package, and these tests read made-up convex parts only.

/** An exact point. */
type Exact = readonly [bigint, bigint];
/** A float point. */
type Point = readonly [number, number];

/** A made-up shape: its region, and the convex parts and circles with the same union. */
interface Made {
  item: Item;
  parts: readonly (readonly Point[])[];
  circles?: readonly { cx: number; cy: number; r: number }[];
}

/** One placed shape in exact coordinates. */
interface Placed {
  id: string;
  parts: readonly (readonly Exact[])[];
  circles: readonly { c: Exact; r: bigint }[];
}

const SCALE = 2 ** 100;

/** This function gives the exact scaled value of a float. */
function big(v: number): bigint {
  const scaled = v * SCALE;
  if (!Number.isInteger(scaled)) throw new Error(`The value ${v} has bits under the scale.`);
  return BigInt(scaled);
}

/** This function gives the cross product of `b - a` and `c - a`. */
function cross(a: Exact, b: Exact, c: Exact): bigint {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** This function gives the points of a convex part in the order that puts the inside on the left of each edge. */
function leftTurning(points: readonly Exact[]): readonly Exact[] {
  let twice = 0n;
  for (let i = 1; i + 1 < points.length; i++) twice += cross(points[0]!, points[i]!, points[i + 1]!);
  return twice < 0n ? [...points].reverse() : points;
}

/** This function tells if an edge of `a` has all of `b` on its outer side, or on its line. */
function edgeSeparates(a: readonly Exact[], b: readonly Exact[]): boolean {
  return a.some((p, i) => {
    const q = a[(i + 1) % a.length]!;
    return b.every((v) => cross(p, q, v) <= 0n);
  });
}

/** This function tells if the insides of two convex parts have no common point, by the separating axis rule. */
function partsApart(a: readonly Exact[], b: readonly Exact[]): boolean {
  return edgeSeparates(a, b) || edgeSeparates(b, a);
}

/** This function tells if a circle and a convex part have no common inside point. */
function circleApart(c: Exact, r: bigint, part: readonly Exact[]): boolean {
  if (part.every((p, i) => cross(p, part[(i + 1) % part.length]!, c) > 0n)) return false;
  const rr = r * r;
  return part.every((p, i) => {
    const q = part[(i + 1) % part.length]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = dx * dx + dy * dy;
    const t = (c[0] - p[0]) * dx + (c[1] - p[1]) * dy;
    const from = (e: Exact): bigint => (c[0] - e[0]) ** 2n + (c[1] - e[1]) ** 2n;
    if (t <= 0n) return from(p) >= rr;
    if (t >= len) return from(q) >= rr;
    const side = cross(p, q, c);
    return side * side >= rr * len;
  });
}

/** This function tells if two placed shapes have no common inside point. */
function shapesApart(a: Placed, b: Placed): boolean {
  for (const p of a.parts) for (const q of b.parts) if (!partsApart(p, q)) return false;
  for (const c of a.circles) for (const q of b.parts) if (!circleApart(c.c, c.r, q)) return false;
  for (const c of b.circles) for (const q of a.parts) if (!circleApart(c.c, c.r, q)) return false;
  for (const c of a.circles) {
    for (const d of b.circles) {
      const dist = (c.c[0] - d.c[0]) ** 2n + (c.c[1] - d.c[1]) ** 2n;
      if (dist < (c.r + d.r) ** 2n) return false;
    }
  }
  return true;
}

/** This function gives the parts of a made-up shape at a placement, in exact coordinates. A turned shape uses the same float turn as the contract. */
function placedOf(made: Made, p: Placement): Placed {
  const x = big(p.x);
  const y = big(p.y);
  const turned = (v: Point): Point => (p.turn === 90 ? turnPoint(v[0], v[1], made.item.h) : v);
  return {
    id: p.id,
    parts: made.parts.map((part) => leftTurning(part.map(turned).map(([u, v]): Exact => [big(u) + x, big(v) + y]))),
    circles: (made.circles ?? []).map((c) => {
      const [u, v] = turned([c.cx, c.cy]);
      return { c: [big(u) + x, big(v) + y] as const, r: big(c.r) };
    }),
  };
}

/** This function checks one output with exact numbers: no pair overlaps, and each shape stays between the walls. */
function expectExact(input: PackInput, output: PackOutput, made: readonly Made[]): void {
  const byId = new Map(made.map((m) => [m.item.id, m]));
  const placed = output.placements.map((p) => placedOf(byId.get(p.id)!, p));
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) expect(shapesApart(placed[i]!, placed[j]!), `${placed[i]!.id} and ${placed[j]!.id}`).toBe(true);
  }
  const w = big(output.size.w);
  const h = big(output.size.h);
  for (const shape of placed) {
    for (const part of shape.parts) for (const [x, y] of part) expect(x >= 0n && y >= 0n && x <= w && y <= h, shape.id).toBe(true);
    for (const { c, r } of shape.circles) expect(c[0] - r >= 0n && c[1] - r >= 0n && c[0] + r <= w && c[1] + r <= h, shape.id).toBe(true);
  }
  expect(output.placements.length + output.overflow.length).toBe(input.items.length);
}

/** This function gives the corners of a rectangle. */
function corners(x: number, y: number, w: number, h: number): Point[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** This function gives a star shape with a sloped outline. The triangles of its fan are its convex parts. The box does not start at the shape. */
function star(id: string, r: () => number): Made {
  const n = 5 + Math.floor(r() * 5);
  const size = 2 + r() * 3;
  const center: Point = [1 + size, 1 + size];
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const angle = ((i + 0.2 + r() * 0.6) * 2 * Math.PI) / n;
    const radius = size * (i % 2 === 0 ? 1 : 0.45 + 0.3 * r());
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  const parts = points.map((p, i) => [center, p, points[(i + 1) % n]!]);
  return { item: { id, w: 2 * size + 2, h: 2 * size + 2, shape: { kind: "polygon", points } }, parts };
}

/** This function gives an L shape on the grid of 1/4, as two rectangles. */
function ell(id: string, r: () => number): Made {
  const w = 2 + Math.floor(r() * 12) / 4;
  const h = 2 + Math.floor(r() * 12) / 4;
  const t = 0.75 + Math.floor(r() * 3) / 4;
  const points: Point[] = [[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]];
  return { item: { id, w, h, shape: { kind: "polygon", points } }, parts: [corners(0, 0, t, h - t), corners(0, h - t, w, t)] };
}

/** This function gives a box without a shape, with a size that has no short binary form. */
function box(id: string, r: () => number): Made {
  const w = 1 + r() * 4;
  const h = 1 + r() * 4;
  return { item: { id, w, h }, parts: [corners(0, 0, w, h)] };
}

/** This function gives a circle with a size on the grid of 1/8. */
function circle(id: string, r: () => number): Made {
  const radius = 1 + Math.floor(r() * 16) / 8;
  return { item: { id, w: 2 * radius, h: 2 * radius, shape: { kind: "circle", cx: radius, cy: radius, r: radius } }, parts: [], circles: [{ cx: radius, cy: radius, r: radius }] };
}

/** This function gives a square ring with a hole, as 4 rectangles. */
function ring(id: string, side: number, hole: number): Made {
  const t = (side - hole) / 2;
  const shape: Region = { kind: "polygon", points: corners(0, 0, side, side), holes: [corners(t, t, hole, hole)] };
  const parts = [corners(0, 0, side, t), corners(0, side - t, side, t), corners(0, t, t, hole), corners(side - t, t, t, hole)];
  return { item: { id, w: side, h: side, shape }, parts };
}

/** This function gives the made-up shapes of one seed. */
function family(seed: number, count: number, turnable = false): Made[] {
  const r = mulberry32(seed);
  const makers = [star, ell, box, circle];
  return Array.from({ length: count }, (_, i): Made => {
    const made = makers[i % makers.length]!(`s${i}`, r);
    return turnable ? { ...made, item: { ...made.item, turnable: true } } : made;
  });
}

/** This function gives a strip with a fixed width for made-up shapes. */
function strip(made: readonly Made[], w: number): PackInput {
  return { container: { w, fixed: "width" }, items: made.map((m) => m.item) };
}

/** This function tells if a cell of a cover is filled. */
function filled(cover: RasterCover, col: number, row: number): boolean {
  return (cover.spans[row - cover.row] ?? []).some(([a, b]) => col - cover.col >= a && col - cover.col < b);
}

/** This function expects that each cell out of the cover has no common inside point with the shape, by the exact geometry. */
function expectCovered(made: Made, cell: number): RasterCover {
  const cover = rasterCover(made.item.shape ?? { kind: "rect", x: 0, y: 0, w: made.item.w, h: made.item.h }, cell);
  const side = cover.cell;
  const shape = placedOf(made, { id: made.item.id, x: 0, y: 0 });
  const from = Math.floor(-1 / side) - 1;
  const span = Math.ceil(16 / side);
  for (let row = from; row < span; row += 1) {
    for (let col = from; col < span; col += 1) {
      if (filled(cover, col, row)) continue;
      const square = leftTurning(corners(col * side, row * side, side, side).map(([x, y]): Exact => [big(x), big(y)]));
      const parts: Placed = { id: "cell", parts: [square], circles: [] };
      expect(shapesApart(shape, parts), `${made.item.id} cell ${col} ${row}`).toBe(true);
    }
  }
  return cover;
}

describe("rasterCell", () => {
  it("gives a side at or under the wanted side, with each multiple exact", () => {
    for (const wanted of [0.1, 1 / 3, 0.7, 7.3, 1e-3, 1234.5]) {
      const side = rasterCell(wanted);
      expect(side).toBeLessThanOrEqual(wanted);
      expect(side).toBeGreaterThan(wanted * (1 - 2 ** -18));
      const unit = 2 ** (Math.floor(Math.log2(side)) - 19);
      expect(Number.isInteger(side / unit)).toBe(true);
      expect((side * 1000003) / unit).toBe(Math.round((side / unit) * 1000003));
    }
  });

  it("keeps a power of 2", () => {
    expect(rasterCell(0.25)).toBe(0.25);
    expect(rasterCell(1)).toBe(1);
  });

  it("refuses a side that is not above 0 and finite", () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(() => rasterCell(bad)).toThrow(RangeError);
  });
});

describe("rasterCover", () => {
  it("fills no cell past an edge on a grid line", () => {
    const cover = rasterCover({ kind: "rect", x: 0, y: 0, w: 5, h: 4 }, 1);
    expect(cover).toMatchObject({ col: 0, row: 0, cols: 5, rows: 4, count: 20 });
    const notch = rasterCover({ kind: "polygon", points: [[0, 0], [1, 0], [1, 2], [3, 2], [3, 3], [0, 3]] }, 1);
    expect(notch.count).toBe(5);
    expect(notch.spans).toEqual([[[0, 1]], [[0, 1]], [[0, 3]]]);
  });

  it("fills the cell of an edge inside a column", () => {
    const cover = rasterCover({ kind: "rect", x: 0.5, y: 0, w: 1, h: 1 }, 1);
    expect(cover).toMatchObject({ col: 0, cols: 2, count: 2 });
  });

  it("fills a sliver that is one float step wide", () => {
    const step = 2 ** -40;
    const cover = rasterCover({ kind: "rect", x: 1 - step, y: 0, w: 2 * step, h: 1 }, 1);
    expect(cover.count).toBe(2);
  });

  it("keeps the cells of a hole free", () => {
    const cover = rasterCover(ring("r", 4, 2).item.shape!, 1);
    expect(cover.count).toBe(12);
    expect(filled(cover, 1, 1)).toBe(false);
  });

  it("gives an empty cover for a shape with no area", () => {
    expect(rasterCover({ kind: "rect", x: 0, y: 0, w: 0, h: 0 }, 1).count).toBe(0);
    expect(rasterCover({ kind: "polygon", points: [] }, 1).count).toBe(0);
  });

  it("covers each made-up shape, by the exact geometry", () => {
    for (let seed = 1; seed <= 3; seed++) {
      for (const made of family(seed, 4)) for (const cell of [1, 0.5, 0.37]) expectCovered(made, cell);
    }
    expectCovered(ring("r", 6, 3), 0.5);
  });

  it("covers an ellipse: each sampled point of it is in a filled cell", () => {
    const ellipse: Region = { kind: "ellipse", cx: 4, cy: 2.5, rx: 3.5, ry: 2 };
    const cover = rasterCover(ellipse, 0.5);
    const r = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const a = r() * 2 * Math.PI;
      const d = Math.sqrt(r());
      const x = 4 + 3.5 * d * Math.cos(a);
      const y = 2.5 + 2 * d * Math.sin(a);
      expect(filled(cover, Math.floor(x / cover.cell), Math.floor(y / cover.cell))).toBe(true);
    }
  });

  it("costs less of the area with a smaller cell", () => {
    const made = star("s", mulberry32(3));
    const area = (cell: number): number => {
      const cover = rasterCover(made.item.shape!, cell);
      return cover.count * cover.cell * cover.cell;
    };
    expect(area(0.25)).toBeLessThan(area(0.5));
    expect(area(0.5)).toBeLessThan(area(1));
  });
});

describe("packRasterNofit", () => {
  it("gives a valid layout on the real shapes, by the exact geometry", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const made = family(seed, 12);
      const input = strip(made, 24);
      for (const cell of [1, 0.5, 0.37, 0.125]) {
        const output = packRasterNofit(input, { cell, trials: 6, seed });
        expect(output.overflow).toEqual([]);
        expectExact(input, output, made);
      }
    }
  });

  it("gives a valid layout with turns, by the exact geometry", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const made = family(seed, 10, true);
      const input = strip(made, 20);
      expectExact(input, packRasterNofit(input, { cell: 0.5, trials: 6, seed }), made);
    }
  });

  it("gives a valid layout in a fixed size, with items left out", () => {
    const made = family(5, 16);
    const input: PackInput = { container: { w: 12, h: 12, fixed: "size" }, items: made.map((m) => m.item) };
    const output = packRasterNofit(input, { cell: 0.5, trials: 8 });
    expect(output.overflow.length).toBeGreaterThan(0);
    expect(output.size).toEqual({ w: 12, h: 12 });
    expectExact(input, output, made);
  });

  it("packs a perfect fit on the grid", () => {
    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, w: 2, h: 5 }));
    const output = packRasterNofit({ container: { w: 10, fixed: "width" }, items }, { cell: 1, trials: 1 });
    expect(output.size).toEqual({ w: 10, h: 10 });
    const full = packRasterNofit({ container: { w: 10, h: 10, fixed: "size" }, items }, { cell: 1, trials: 1 });
    expect(full.overflow).toEqual([]);
  });

  it("interlocks two notched shapes on the grid", () => {
    const notched: Region = { kind: "polygon", points: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]] };
    const items: Item[] = [
      { id: "a", w: 3, h: 3, shape: notched },
      { id: "b", w: 2, h: 2 },
    ];
    const output = packRasterNofit({ container: { w: 3, h: 3, fixed: "size" }, items }, { cell: 1, trials: 4 });
    expect(output.overflow).toEqual([]);
    expect(output.placements).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 1 }]);
  });

  it("places a small item inside a hole", () => {
    const outer = ring("r", 6, 4);
    const input: PackInput = { container: { w: 6, fixed: "width" }, items: [outer.item, { id: "in", w: 2, h: 2 }] };
    const output = packRasterNofit(input, { cell: 1, trials: 1 });
    expect(output.size.h).toBe(6);
    expectExact(input, output, [outer, { item: { id: "in", w: 2, h: 2 }, parts: [corners(0, 0, 2, 2)] }]);
  });

  it("moves a shape so that its extent touches the wall of the first cell", () => {
    const shape: Region = { kind: "rect", x: 3, y: 2, w: 4, h: 4 };
    const output = packRasterNofit({ container: { w: 4, h: 4, fixed: "size" }, items: [{ id: "a", w: 8, h: 8, shape }] }, { cell: 1 });
    expect(output.placements).toEqual([{ id: "a", x: -3, y: -2 }]);
  });

  it("uses the extent, not the cells, at the far wall", () => {
    const item: Item = { id: "a", w: 2.5, h: 2.5 };
    const output = packRasterNofit({ container: { w: 2.5, h: 2.5, fixed: "size" }, items: [item] }, { cell: 1 });
    expect(output.overflow).toEqual([]);
    const tight = packRasterNofit({ container: { w: 2.25, h: 3, fixed: "size" }, items: [item] }, { cell: 1 });
    expect(tight.overflow).toEqual(["a"]);
  });

  it("keeps an obstacle and a locked item free of other items", () => {
    const input: PackInput = {
      container: { w: 6, h: 6, fixed: "size" },
      items: [{ id: "lock", w: 2, h: 2, x: 0, y: 0, locked: true }, { id: "a", w: 2, h: 2 }, { id: "b", w: 2, h: 4 }],
      obstacles: [{ id: "o", region: { kind: "rect", x: 2, y: 0, w: 2, h: 2 } }],
    };
    const output = packRasterNofit(input, { cell: 1, trials: 1 });
    expect(output.placements).toEqual([{ id: "lock", x: 0, y: 0 }, { id: "a", x: 0, y: 2 }, { id: "b", x: 4, y: 0 }]);
  });

  it("keeps a locked item off the grid free of other items, by the exact geometry", () => {
    const lock: Made = { item: { id: "lock", w: 2, h: 2, x: 0.3, y: 0.7, locked: true }, parts: [corners(0, 0, 2, 2)] };
    const others = family(3, 8);
    const input = strip([lock, ...others], 16);
    const output = packRasterNofit(input, { cell: 0.25, trials: 4 });
    expect(output.placements.find((p) => p.id === "lock")).toEqual({ id: "lock", x: 0.3, y: 0.7 });
    expectExact(input, output, [lock, ...others]);
  });

  it("uses a polygon container, a hole of it and a circle container", () => {
    const shape: Region = { kind: "polygon", points: [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]], holes: [corners(4, 0.5, 1, 1)] };
    const input: PackInput = { container: { fixed: "size", shape }, items: [{ id: "a", w: 2, h: 2 }, { id: "b", w: 2, h: 2 }, { id: "c", w: 3, h: 3 }] };
    const output = packRasterNofit(input, { cell: 1, trials: 1 });
    expect(output.overflow).toEqual(["c"]);
    expect(output.placements).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 2, y: 0 }]);
    const round: PackInput = { container: { fixed: "size", shape: { kind: "circle", cx: 5, cy: 5, r: 5 } }, items: [{ id: "a", w: 6, h: 6 }] };
    const placed = packRasterNofit(round, { cell: 1 }).placements[0]!;
    for (const [x, y] of corners(placed.x, placed.y, 6, 6)) expect((x - 5) ** 2 + (y - 5) ** 2).toBeLessThanOrEqual(25);
  });

  it("gives a turn when it lowers the bottom", () => {
    const output = packRasterNofit({ container: { w: 6, fixed: "width" }, items: [{ id: "a", w: 1, h: 6, turnable: true }] }, { cell: 1, trials: 1 });
    expect(output.placements).toEqual([{ id: "a", x: 0, y: 0, turn: 90 }]);
    expect(output.size).toEqual({ w: 6, h: 1 });
  });

  it("does not get worse with more trials, and it finds a better order", () => {
    const made = family(9, 14);
    const input = strip(made, 16);
    const first = packRasterNofit(input, { cell: 0.5, trials: 1 });
    const more = packRasterNofit(input, { cell: 0.5, trials: 48, seed: 2 });
    expect(more.size.h).toBeLessThan(first.size.h);
    expectExact(input, more, made);
  });

  it("gives the same bytes for the same input and seed, and a bounded count of trials", () => {
    const input = strip(family(4, 12), 18);
    const a = packRasterNofit(input, { cell: 0.5, trials: 20, seed: 11 });
    expect(JSON.stringify(packRasterNofit(input, { cell: 0.5, trials: 20, seed: 11 }))).toBe(JSON.stringify(a));
    const stage = a.trace?.find((t) => t.id === RASTER_NOFIT_STAGE);
    expect(stage?.measures?.["raster.trials"]).toBe(20);
    expect(stage?.ms).toBeUndefined();
    expect(stage?.measures?.["raster.coverShare"]).toBeGreaterThan(0);
    expect(stage?.measures?.["raster.coverShare"]).toBeLessThanOrEqual(1);
  });

  it("uses a default cell and handles no items and one item", () => {
    expect(packRasterNofit({ container: { w: 4, fixed: "width" }, items: [] }).size).toEqual({ w: 4, h: 0 });
    const one = packRasterNofit({ container: { w: 4, fixed: "width" }, items: [{ id: "a", w: 1, h: 2 }] });
    expect(one.trace?.[0]?.measures?.["raster.cell"]).toBe(0.25);
    expect(one.trace?.[0]?.measures?.["raster.trials"]).toBe(4);
    expect(one.placements).toEqual([{ id: "a", x: 0, y: 0 }]);
  });

  it("leaves out an item that is wider than the container", () => {
    const output = packRasterNofit({ container: { w: 2, fixed: "width" }, items: [{ id: "a", w: 3, h: 1 }] });
    expect(output.overflow).toEqual(["a"]);
    expect(output.size.h).toBe(0);
  });

  it("does not change its input", () => {
    const input = strip(family(2, 6, true), 16);
    const before = JSON.stringify(input);
    packRasterNofit(input, { cell: 0.5, trials: 4 });
    expect(JSON.stringify(input)).toBe(before);
  });

  it("refuses what the slice does not read", () => {
    const items: Item[] = [{ id: "a", w: 1, h: 1 }];
    const width = { w: 4, fixed: "width" } as const;
    const refused: PackInput[] = [
      { container: { fixed: "none" }, items },
      { container: { h: 4, fixed: "height" }, items },
      { container: width, items, gap: 1 },
      { container: width, items, pairGaps: [{ a: "a", b: "a", gap: 1 }] },
      { container: width, items: [{ id: "a", w: 1, h: 1, margin: 1 }] },
      { container: { fixed: "width", shape: { kind: "circle", cx: 2, cy: 2, r: 2 } }, items },
      { container: { fixed: "size", inset: 1, shape: { kind: "circle", cx: 2, cy: 2, r: 2 } }, items },
      { container: { fixed: "width" }, items },
    ];
    for (const input of refused) expect(() => packRasterNofit(input), JSON.stringify(input.container)).toThrow(RangeError);
    expect(() => packRasterNofit({ container: width, items }, { trials: 0 })).toThrow(RangeError);
    expect(() => packRasterNofit({ container: width, items }, { trials: 1.5 })).toThrow(RangeError);
    expect(() => packRasterNofit({ container: width, items }, { cell: 0 })).toThrow(RangeError);
  });

  it("refuses a cell that gives too many cells", () => {
    const input: PackInput = { container: { w: 1000, h: 1000, fixed: "size" }, items: [{ id: "a", w: 1, h: 1 }] };
    expect(RASTER_NOFIT_MAX_CELLS).toBe(2 ** 24);
    expect(() => packRasterNofit(input, { cell: 0.01 })).toThrow(/too many cells/);
  });
});
