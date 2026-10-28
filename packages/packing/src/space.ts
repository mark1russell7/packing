// The container layer of roadmap item k37 (docs/PACKER.md): the free space of one input, in the coordinates of the frame.
// A strategy asks the layer where a rectangle of the frame fits. The layer knows the outline of the container, its holes,
// the obstacles and the locked items. Thus each strategy packs into each container shape.

import { boundsOf, regionHitsRect, translate } from "@mark1russell7/layout-contract";
import { EPS, type PackInput, type Region } from "./contract.ts";
import { buildFrame, transposeRegion, type Frame } from "./frame.ts";

/** A free interval on one axis, from `start` to `end`. A box fits when it starts at `start` or later and ends at `end` or earlier. */
export interface FreeSpan {
  readonly start: number;
  readonly end: number;
}

/** A rectangle of the frame: its top-left corner and its size. */
export interface SpaceRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The free space of one input, in the coordinates of the frame of the adapters. A rectangle of the frame is an item with its
 * margin, grown by half the gap on each side. Each method takes such a rectangle.
 *
 * - The outline of a container with a fixed size is exact. A free side uses the bounding box of the shape, and the holes stay.
 * - The inset of the container counts as in `checkHard`: the item with its margin, grown by the inset, stays in the outline.
 * - A rectangle obstacle and a locked item are holes with the exact rectangles of the frame.
 * - Another obstacle blocks its range over the query, grown by half the gap on each axis.
 */
export interface FreeSpace {
  /** The width of the area of the frame. A free side has the width `Infinity`. */
  readonly w: number;
  /** The height of the area of the frame. A free side has the height `Infinity`. */
  readonly h: number;
  /**
   * The value `true` tells that the container is a plain rectangle and that each obstacle is a rectangle. Then `band` does
   * not test y, and `column` does not test x, because each strategy tests the fixed side itself. This is the fast path.
   */
  readonly plain: boolean;
  /** This method gives the free x-spans, from left to right, for a rectangle from `y0` to `y1`. */
  band(y0: number, y1: number): FreeSpan[];
  /**
   * This method gives the first free y-span for a rectangle from `x0` to `x1` that ends after `from`. The span starts
   * at `from` or later. The method gives `undefined` when no such span is free.
   */
  column(x0: number, x1: number, from?: number): FreeSpan | undefined;
  /** This method tells if a rectangle is in the free space. */
  fits(rect: SpaceRect): boolean;
  /** This method gives the first x from `x` where a rectangle of width `w` fits from `y0` to `y1`, or `Infinity`. */
  fitX(x: number, w: number, y0: number, y1: number): number;
  /**
   * This method gives the next top edge after `y0` where the free spans of a rectangle of the height `y1 - y0` change, or
   * `Infinity`. A row that has no place for a rectangle of width `w` steps down to this edge.
   */
  nextY(y0: number, y1: number, w: number): number;
}

/** A rectangle hole of a layer: its edges on the axis of the spans (`a`) and on the cross axis (`c`). */
interface Hole {
  a0: number;
  a1: number;
  c0: number;
  c1: number;
}

/** A region that blocks its range over a query, grown by `g` on each axis. */
interface Blocker {
  region: Region;
  g: number;
  /** The cross-axis edges of the bounding box of the region. */
  c0: number;
  c1: number;
}

/** A ring of a polygon. */
type Ring = readonly (readonly [number, number])[];

/**
 * One axis of the free space. The spans go along x, and the query goes along y. The layer of `column` is the layer of
 * `band` with the axes changed.
 */
interface Layer {
  /** `plain` and `box`: the area of the frame. `round`: a circle or an ellipse. `rings`: a polygon. */
  kind: "plain" | "box" | "round" | "rings";
  /** The size of the area along the spans and across. */
  w: number;
  h: number;
  /** The growth of a query for the outline: the inset less half the gap. */
  d: number;
  region?: Region;
  rings: Ring[];
  holes: Hole[];
  blockers: Blocker[];
}

/** This function removes the closed interval from `a` to `b` from a list of spans. A span of no length goes. */
function subtract(spans: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of spans) {
    if (b <= s || a >= e) {
      out.push([s, e]);
      continue;
    }
    if (a > s) out.push([s, a]);
    if (e > b) out.push([b, e]);
  }
  return out;
}

/** This function gives the x of a segment at `y`. The ends give their exact x. */
function xAt(ax: number, ay: number, bx: number, by: number, y: number): number {
  if (y === ay) return ax;
  if (y === by) return bx;
  return ax + ((y - ay) * (bx - ax)) / (by - ay);
}

/** This function gives the x-range of the part of a segment in the open strip from `y0` to `y1`, or `undefined`. */
function edgeRange(ax: number, ay: number, bx: number, by: number, y0: number, y1: number): [number, number] | undefined {
  const lo = Math.min(ay, by);
  const hi = Math.max(ay, by);
  if (hi <= y0 || lo >= y1) return undefined;
  if (ay === by) return [Math.min(ax, bx), Math.max(ax, bx)];
  const p = xAt(ax, ay, bx, by, Math.max(y0, lo));
  const q = xAt(ax, ay, bx, by, Math.min(y1, hi));
  return [Math.min(p, q), Math.max(p, q)];
}

/** This function gives the x-range of a region in the open strip from `y0` to `y1`, or `undefined` when they have no common point. */
function regionRange(region: Region, y0: number, y1: number): [number, number] | undefined {
  switch (region.kind) {
    case "rect":
      return region.y < y1 && y0 < region.y + region.h ? [region.x, region.x + region.w] : undefined;
    case "circle":
    case "ellipse": {
      const rx = region.kind === "circle" ? region.r : region.rx;
      const ry = region.kind === "circle" ? region.r : region.ry;
      if (y1 <= region.cy - ry || y0 >= region.cy + ry) return undefined;
      const dy = y0 <= region.cy && region.cy <= y1 ? 0 : Math.min(Math.abs(y0 - region.cy), Math.abs(y1 - region.cy));
      const c = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2));
      return [region.cx - c, region.cx + c];
    }
    case "polygon": {
      let lo = Infinity;
      let hi = -Infinity;
      const ring = region.points;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const r = edgeRange(a[0], a[1], b[0], b[1], y0, y1);
        if (r === undefined) continue;
        lo = Math.min(lo, r[0]);
        hi = Math.max(hi, r[1]);
      }
      return lo <= hi ? [lo, hi] : undefined;
    }
  }
}

/** This function gives the spans of the outline of a layer for the strip from `y0` to `y1`, before the holes and the blockers. */
function outline(layer: Layer, y0: number, y1: number): [number, number][] {
  const { d } = layer;
  switch (layer.kind) {
    case "plain":
      return [[0, layer.w]];
    case "box":
      return y0 < 0 || y1 > layer.h ? [] : [[0, layer.w]];
    case "round": {
      const r = layer.region!;
      if (r.kind !== "circle" && r.kind !== "ellipse") return [];
      const rx = r.kind === "circle" ? r.r : r.rx;
      const ry = r.kind === "circle" ? r.r : r.ry;
      const top = y0 - d;
      const bottom = y1 + d;
      if (top < r.cy - ry || bottom > r.cy + ry) return [];
      const dy = Math.max(Math.abs(top - r.cy), Math.abs(bottom - r.cy));
      // The shortest chord over the height of the query, made smaller by EPS
      const c = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) - EPS;
      const a = r.cx - c + d;
      const b = r.cx + c - d;
      return b > a ? [[a, b]] : [];
    }
    case "rings": {
      const top = y0 - d;
      const bottom = y1 + d;
      if (!(bottom > top)) return [];
      const blocked: [number, number][] = [];
      for (const ring of layer.rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const r = edgeRange(a[0], a[1], b[0], b[1], top, bottom);
          if (r !== undefined) blocked.push(r);
        }
      }
      if (blocked.length === 0) return [];
      blocked.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const merged: [number, number][] = [];
      for (const r of blocked) {
        const last = merged.at(-1);
        if (last !== undefined && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([r[0], r[1]]);
      }
      const spans: [number, number][] = [];
      for (let i = 0; i + 1 < merged.length; i++) {
        const a = merged[i]![1];
        const b = merged[i + 1]![0];
        if (!(b > a)) continue;
        // No edge crosses the box of the gap, thus the box is fully in the polygon or fully out of it
        if (!regionHitsRect(layer.region!, { x: a, y: top, w: b - a, h: bottom - top })) continue;
        if (b - d > a + d) spans.push([a + d, b - d]);
      }
      return spans;
    }
  }
}

/** This function gives the free spans of a layer for the strip from `y0` to `y1`. */
function spansOf(layer: Layer, y0: number, y1: number): [number, number][] {
  let spans = outline(layer, y0, y1);
  for (const hole of layer.holes) {
    if (spans.length === 0) return spans;
    if (Math.min(y1, hole.c1) - Math.max(y0, hole.c0) > 0) spans = subtract(spans, hole.a0, hole.a1);
  }
  for (const b of layer.blockers) {
    if (spans.length === 0) return spans;
    if (b.c1 + b.g <= y0 || b.c0 - b.g >= y1) continue;
    const r = regionRange(b.region, y0 - b.g, y1 + b.g);
    // The range grows by EPS, as the chord of a round outline shrinks by EPS
    if (r !== undefined) spans = subtract(spans, r[0] - b.g - EPS, r[1] + b.g + EPS);
  }
  return spans;
}

/** This function gives the first x from `x` where a box of width `w` fits in one of the spans, or `Infinity`. */
export function firstFit(spans: readonly FreeSpan[], x: number, w: number): number {
  for (const s of spans) {
    const at = Math.max(x, s.start);
    if (at + w <= s.end) return at;
  }
  return Infinity;
}

/** This function gives the next top edge of a layer after `y0` for a strip of the height `y1 - y0`, as `FreeSpace.nextY` tells. */
function nextOf(layer: Layer, y0: number, y1: number, w: number): number {
  const height = y1 - y0;
  const { d } = layer;
  let next = Infinity;
  const take = (y: number): void => {
    if (y > y0 + EPS && y < next) next = y;
  };
  for (const hole of layer.holes) if (hole.c0 < y1 && y0 < hole.c1) take(hole.c1);
  for (const b of layer.blockers) if (b.c0 - b.g < y1 && y0 < b.c1 + b.g) take(b.c1 + b.g);
  switch (layer.kind) {
    case "plain":
      break;
    case "box":
      if (y1 > layer.h) return Infinity;
      break;
    case "rings":
      for (const ring of layer.rings) {
        for (const [, vy] of ring) {
          take(vy + d);
          take(vy - height - d);
        }
      }
      break;
    case "round": {
      const r = layer.region!;
      if (r.kind !== "circle" && r.kind !== "ellipse") break;
      const rx = r.kind === "circle" ? r.r : r.rx;
      const ry = r.kind === "circle" ? r.r : r.ry;
      // The half chord that a box of width w needs, and the largest distance from the center where the chord has it
      const need = w / 2 + d + EPS;
      if (need >= rx) return Infinity;
      const reach = ry * Math.sqrt(1 - (need / rx) ** 2);
      if (y1 + d > r.cy + reach) return Infinity;
      take(r.cy - reach + d);
      break;
    }
  }
  return next;
}

/** This function gives the layer with the axes changed: the spans go along y, and the query goes along x. */
function transposeLayer(layer: Layer): Layer {
  return {
    kind: layer.kind,
    w: layer.h,
    h: layer.w,
    d: layer.d,
    ...(layer.region === undefined ? {} : { region: transposeRegion(layer.region) }),
    rings: layer.rings.map((ring) => ring.map(([x, y]) => [y, x] as const)),
    holes: layer.holes.map((h) => ({ a0: h.c0, a1: h.c1, c0: h.a0, c1: h.a1 })),
    blockers: layer.blockers.map((b) => {
      const region = transposeRegion(b.region);
      const box = boundsOf(region);
      return { region, g: b.g, c0: box.y, c1: box.y + box.h };
    }),
  };
}

/** This function makes a blocker of a region in the frame. */
function blockerOf(region: Region, g: number): Blocker {
  const box = boundsOf(region);
  return { region, g, c0: box.y, c1: box.y + box.h };
}

/**
 * This function gives the free space of an input and its frame. The adapters use it with the frame that they pack.
 * `freeSpace` makes the frame itself.
 */
export function spaceOf(input: PackInput, frame: Frame): FreeSpace {
  const { container } = input;
  const half = (input.gap ?? 0) / 2;
  const d = frame.inset - half;
  const shape = container.shape === undefined ? undefined : translate(container.shape, -frame.ox, -frame.oy);
  const fixedSize = Number.isFinite(frame.w) && Number.isFinite(frame.h);

  const holes: Hole[] = [];
  const blockers: Blocker[] = [];
  let rectObstacles = true;
  for (const e of frame.entries) {
    if (!e.rect.locked) continue;
    if (e.obstacle !== undefined && e.obstacle.region.kind !== "rect") {
      rectObstacles = false;
      blockers.push(blockerOf(translate(e.obstacle.region, -frame.ox, -frame.oy), half));
      continue;
    }
    const r = e.rect;
    holes.push({ a0: r.position.x, a1: r.right(), c0: r.position.y, c1: r.bottom() });
  }

  const plainShape = shape === undefined || shape.kind === "rect";
  const plain = plainShape && rectObstacles;
  let layer: Layer = { kind: plain ? "plain" : "box", w: frame.w, h: frame.h, d, rings: [], holes, blockers };
  if (shape !== undefined && shape.kind !== "rect") {
    if (fixedSize && shape.kind === "polygon") layer = { ...layer, kind: "rings", region: shape, rings: [shape.points, ...(shape.holes ?? [])] };
    else if (fixedSize) layer = { ...layer, kind: "round", region: shape };
    else if (shape.kind === "polygon") {
      // A free side: the bounding box, and the holes of the shape block the rectangles grown by the inset
      for (const ring of shape.holes ?? []) blockers.push(blockerOf({ kind: "polygon", points: ring }, d));
    }
  }
  const across = transposeLayer(layer);

  const band = (y0: number, y1: number): FreeSpan[] => spansOf(layer, y0, y1).map(([start, end]) => ({ start, end }));
  const space: FreeSpace = {
    w: frame.w,
    h: frame.h,
    plain,
    band,
    column(x0, x1, from = 0) {
      for (const [start, end] of spansOf(across, x0, x1)) {
        const top = Math.max(start, from);
        if (end > top) return { start: top, end };
      }
      return undefined;
    },
    fits(rect) {
      return firstFit(band(rect.y, rect.y + rect.h), rect.x, rect.w) === rect.x;
    },
    fitX(x, w, y0, y1) {
      return firstFit(band(y0, y1), x, w);
    },
    nextY(y0, y1, w) {
      return nextOf(layer, y0, y1, w);
    },
  };
  const bare: Layer = { ...layer, holes: [] };
  let bottom = 0;
  for (const b of blockers) bottom = Math.max(bottom, b.c1 + Math.max(0, b.g));
  PARTS.set(space, {
    kind: layer.kind,
    d,
    holes: holes.map((r) => ({ x: r.a0, y: r.c0, w: r.a1 - r.a0, h: r.c1 - r.c0 })),
    bottom: Number.isFinite(frame.h) ? frame.h : bottom,
    bare: (y0, y1) => spansOf(bare, y0, y1).map(([start, end]) => ({ start, end })),
  });
  return space;
}

/**
 * The parts of a free space of `spaceOf`. The packer `maxrects` reads them to make its first free rectangles. The
 * package root does not export them.
 */
export interface SpaceParts {
  /** The kind of the outline: `plain`, `box`, `round` or `rings`. */
  readonly kind: "plain" | "box" | "round" | "rings";
  /** The growth of a query for the outline: the inset less half the gap. */
  readonly d: number;
  /** The rectangle holes: the locked items and the rectangle obstacles, in the coordinates of the frame. */
  readonly holes: readonly SpaceRect[];
  /** The height to cut into bands. A fixed height gives the height. A free height gives the lowest edge of the blockers. */
  readonly bottom: number;
  /** This method gives the free x-spans of the outline and the blockers from `y0` to `y1`, without the rectangle holes. */
  bare(y0: number, y1: number): FreeSpan[];
}

const PARTS = new WeakMap<FreeSpace, SpaceParts>();

/** This function gives the parts of a free space of `spaceOf`, or `undefined` for another free space. */
export function spaceParts(space: FreeSpace): SpaceParts | undefined {
  return PARTS.get(space);
}

/**
 * This function gives the free space of an input, in the coordinates of the frame of the adapters. The origin of the
 * frame is the corner of the container, moved in by the inset and out by half the gap. `FreeSpace` tells the methods.
 */
export function freeSpace(input: PackInput): FreeSpace {
  return spaceOf(input, buildFrame(input));
}
