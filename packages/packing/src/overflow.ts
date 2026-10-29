// The forced overflow of roadmap item k59 (docs/MEASURES.md, "Overflow"): a lower bound of the count of items that no
// packer can place in a fixed container. `measure` uses it for `pack.overflow.forced` and `pack.overflow.forcedArea`.

import { boundsOf } from "@mark1russell7/layout-contract";
import { DEFAULT_TOLERANCE, marginOf, type Item, type PackInput, type Region, type Sides } from "./contract.ts";

/** A rectangle: its top-left corner and its size. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A ring of a polygon. */
type Ring = readonly (readonly [number, number])[];

/** A region that the items cannot use: a fixed obstacle or a locked item. */
interface Blocked {
  region: Region;
  box: Box;
}

/** The lower bound of the overflow of one input. `overflowBound` gives it. */
export interface OverflowBound {
  /** The count of items that no packer can place. It is a lower bound. */
  readonly forced: number;
  /** The area that no packer can place. It is a lower bound of the area of the unplaced items. */
  readonly area: number;
  /** The upper bound of the free area of a fixed container for the items with their margins, or `Infinity` when a side is free. */
  readonly free: number;
}

/** This function gives the area of a ring by the shoelace formula. The direction of the ring does not count. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/**
 * This function gives the area of a region that an item cannot use. A polygon loses the area of its holes. Thus a hole
 * that is out of the polygon makes the area too small, and the free area stays an upper bound.
 */
function blockedArea(region: Region): number {
  switch (region.kind) {
    case "rect":
      return Math.max(0, region.w) * Math.max(0, region.h);
    case "circle":
      return Math.PI * region.r ** 2;
    case "ellipse":
      return Math.PI * region.rx * region.ry;
    case "polygon": {
      let area = ringArea(region.points);
      for (const hole of region.holes ?? []) area -= ringArea(hole);
      return Math.max(0, area);
    }
  }
}

/** This function tells if the insides of two rectangles have a common point. Two rectangles with a common edge do not. */
function boxesOverlap(a: Box, b: Box): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
}

/** This function tells if rectangle `a` is in rectangle `b`. */
function boxIn(a: Box, b: Box): boolean {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

/** This function gives the rectangle made smaller by `d` on each side. */
function shrink(b: Box, d: number): Box {
  return { x: b.x + d, y: b.y + d, w: Math.max(0, b.w - 2 * d), h: Math.max(0, b.h - 2 * d) };
}

/** This function tells if a point is in a ring, by the even-odd rule. */
function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** This function tells if a segment has a part of a length above 0 in the open rectangle. The Liang-Barsky clip gives it. */
function segmentHitsBox(ax: number, ay: number, bx: number, by: number, r: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - r.x) && clip(dx, r.x + r.w - ax) && clip(-dy, ay - r.y) && clip(dy, r.y + r.h - ay) && t1 > t0;
}

/**
 * This function tells if a rectangle is in a polygon with holes. No edge of a ring crosses the inside of the rectangle.
 * No vertex is in it, and its center is in the polygon by the even-odd rule.
 */
function boxInPolygon(b: Box, rings: readonly Ring[]): boolean {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if (p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h) return false;
      if (segmentHitsBox(p[0], p[1], q[0], q[1], b)) return false;
    }
  }
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let inside = false;
  for (const ring of rings) if (pointInRing(cx, cy, ring)) inside = !inside;
  return inside;
}

/** This function tells if a rectangle is in a region of a container. A rectangle with no size is in no region. */
function boxInShape(b: Box, shape: Region): boolean {
  if (!(b.w > 0 && b.h > 0)) return false;
  // A small shrink keeps a rectangle on the outline in the shape
  const s = shrink(b, 1e-9 * Math.max(1, b.w, b.h));
  switch (shape.kind) {
    case "rect":
      return boxIn(b, { x: shape.x, y: shape.y, w: shape.w, h: shape.h });
    case "circle":
    case "ellipse": {
      const rx = shape.kind === "circle" ? shape.r : shape.rx;
      const ry = shape.kind === "circle" ? shape.r : shape.ry;
      const inside = (x: number, y: number): boolean => ((x - shape.cx) / rx) ** 2 + ((y - shape.cy) / ry) ** 2 <= 1;
      return inside(s.x, s.y) && inside(s.x + s.w, s.y) && inside(s.x, s.y + s.h) && inside(s.x + s.w, s.y + s.h);
    }
    case "polygon":
      return boxInPolygon(s, [shape.points, ...(shape.holes ?? [])]);
  }
}

/**
 * This function gives the area of a container shape. A hole counts only when its bounding box is in the outer ring.
 * Also, that box has no common point with the box of a hole before it. Thus the area is not too small.
 */
function shapeArea(shape: Region): number {
  if (shape.kind !== "polygon") return blockedArea(shape);
  let area = ringArea(shape.points);
  const kept: Box[] = [];
  for (const hole of shape.holes ?? []) {
    const box = boundsOf({ kind: "polygon", points: hole });
    if (!boxInPolygon(shrink(box, 1e-9 * Math.max(1, box.w, box.h)), [shape.points])) continue;
    if (kept.some((k) => boxesOverlap(k, box))) continue;
    kept.push(box);
    area -= ringArea(hole);
  }
  return Math.max(0, area);
}

/**
 * This function gives the area of the union of rectangles, each cut to the rectangle `clip`. A sweep over the x edges
 * adds the merged y intervals of each slab.
 */
function unionArea(boxes: readonly Box[], clip: Box): number {
  const cut: Box[] = [];
  for (const b of boxes) {
    const x0 = Math.max(b.x, clip.x);
    const y0 = Math.max(b.y, clip.y);
    const x1 = Math.min(b.x + b.w, clip.x + clip.w);
    const y1 = Math.min(b.y + b.h, clip.y + clip.h);
    if (x1 > x0 && y1 > y0) cut.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const xs = [...new Set(cut.flatMap((b) => [b.x, b.x + b.w]))].toSorted((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const left = xs[i]!;
    const right = xs[i + 1]!;
    const spans = cut
      .filter((b) => b.x <= left && b.x + b.w >= right)
      .map((b) => [b.y, b.y + b.h] as const)
      .toSorted((p, q) => p[0] - q[0]);
    let covered = 0;
    let top = -Infinity;
    let bottom = -Infinity;
    for (const [s, e] of spans) {
      if (s > bottom) {
        covered += bottom - top > 0 ? bottom - top : 0;
        top = s;
        bottom = e;
      } else bottom = Math.max(bottom, e);
    }
    covered += bottom - top > 0 ? bottom - top : 0;
    area += covered * (right - left);
  }
  return area;
}

/** This function gives the rectangle of the container: the bounding box of its shape, or 0, 0, `w`, `h`. */
function containerBox(input: PackInput): Box {
  const { container } = input;
  if (container.shape !== undefined) return boundsOf(container.shape);
  return { x: 0, y: 0, w: container.w ?? Infinity, h: container.h ?? Infinity };
}

/** This function tells if an item is locked at a position. Such an item is not a candidate of the overflow. */
const lockedAt = (item: Item): boolean => item.locked === true && item.x !== undefined && item.y !== undefined;

/** This function gives the rectangle of an item at its position: the bounding box of its shape, or its size. */
function itemBox(item: Item): Box {
  const s = item.shape === undefined ? { x: 0, y: 0, w: item.w, h: item.h } : boundsOf(item.shape);
  return { x: (item.x ?? 0) + s.x, y: (item.y ?? 0) + s.y, w: s.w, h: s.h };
}

/** This function gives the smallest area of an item: its rectangle, or the area of its shape when that is smaller. */
function itemArea(item: Item): number {
  const rect = Math.max(0, item.w) * Math.max(0, item.h);
  return item.shape === undefined ? rect : Math.min(rect, blockedArea(item.shape));
}

/** This function gives the ids of the items of `pairGaps`. A pair gap replaces the margins of its pair, so these items do not grow. */
export function pairedIds(input: Pick<PackInput, "pairGaps">): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const p of input.pairGaps ?? []) {
    if (p.a === p.b) continue;
    ids.add(p.a);
    ids.add(p.b);
  }
  return ids;
}

/** This function gives the margin of an item on each side, with each side below 0 made 0. A smaller margin keeps a bound sound. */
function sidesOf(item: Item): Sides {
  const m = marginOf(item);
  return { top: Math.max(0, m.top), right: Math.max(0, m.right), bottom: Math.max(0, m.bottom), left: Math.max(0, m.left) };
}

/**
 * This function tells if the bounds can grow an item by its margin and by the gap. Only a rectangle item that is not in
 * `pairGaps` grows. A shape counts with its area, and a pair gap replaces the margins of its pair.
 */
const grows = (item: Item, paired: ReadonlySet<string>): boolean => item.shape === undefined && !paired.has(item.id);

/**
 * This function gives an upper bound of the area that the candidates of a fixed container can use with their margins.
 *
 * - The container area is the inner rectangle (the container less the inset). A shape gives the smaller of that and its exact area.
 * - A rectangle container loses the exact union of the fixed rectangle obstacles and the locked items in the inner rectangle.
 * - A locked rectangle item that is not in `pairGaps` counts with its margin. The hard rule `no-overlap` keeps the margins of two items apart.
 * - A shape loses only the regions that are fully in it and in the inner rectangle, with no common point between their boxes.
 * - An obstacle with `move` can go out of the way. Thus the bound does not subtract it.
 *
 * The proof: the hard rules keep each item with its margin in the inner rectangle. They also keep it out of each fixed obstacle and each other margined item.
 * The gap does not count, because an item with the gap can go over an obstacle. `overflowBound` uses the gap with the inner rectangle only.
 */
export function freeAreaBound(input: PackInput): number {
  const bounds = containerBox(input);
  const inset = input.container.inset ?? 0;
  const inner = shrink(bounds, inset);
  if (!(inner.w > 0 && inner.h > 0)) return 0;
  const paired = pairedIds(input);
  const blocked: Blocked[] = [];
  for (const o of input.obstacles ?? []) if (o.move === undefined) blocked.push({ region: o.region, box: boundsOf(o.region) });
  for (const item of input.items) {
    if (!lockedAt(item)) continue;
    const bare = itemBox(item);
    const m = grows(item, paired) ? sidesOf(item) : { top: 0, right: 0, bottom: 0, left: 0 };
    const box = { x: bare.x - m.left, y: bare.y - m.top, w: bare.w + m.left + m.right, h: bare.h + m.top + m.bottom };
    blocked.push({ region: { kind: "rect", ...box }, box });
  }

  const shape = input.container.shape;
  const innerArea = inner.w * inner.h;
  const inInner = (b: Box): boolean => b.w > 0 && b.h > 0 && boxIn(b, inner);
  if (shape === undefined || shape.kind === "rect") {
    const rects = blocked.filter((b) => b.region.kind === "rect");
    let free = innerArea - unionArea(rects.map((b) => b.box), inner);
    const kept: Box[] = [];
    for (const b of blocked) {
      if (b.region.kind === "rect" || !inInner(b.box)) continue;
      if (rects.some((r) => boxesOverlap(r.box, b.box)) || kept.some((k) => boxesOverlap(k, b.box))) continue;
      kept.push(b.box);
      free -= blockedArea(b.region);
    }
    return Math.max(0, free);
  }

  let free = Math.min(innerArea, shapeArea(shape));
  const kept: Box[] = [];
  for (const b of blocked) {
    if (!inInner(b.box) || !boxInShape(b.box, shape) || kept.some((k) => boxesOverlap(k, b.box))) continue;
    kept.push(b.box);
    free -= blockedArea(b.region);
  }
  return Math.max(0, free);
}

/** One candidate of a fixed size: its area, and the areas that one area rule of `overflowBound` reads. */
interface Need {
  /** The area of the item: the area of `pack.overflow.area`, or of its shape when that is smaller. */
  area: number;
  /** The area of the item with its margin. An item that does not grow keeps its area. */
  margined: number;
  /** The area of the item with its margin and the gap. An item that does not grow keeps its area. */
  gapped: number;
}

/**
 * This function gives the drops of one area rule: the sum of `weight` over the placed candidates is at most `room`.
 *
 * - `count`: the largest weights go first, until the rest fits. No smaller count of drops makes the rest fit.
 * - `area`: the least area of a fractional drop of the excess weight. The least area per weight goes first.
 *   Each whole drop is also a fractional drop, so it drops at least this area.
 * - When each weight is the area, `area` is the excess itself.
 */
function dropsOf(needs: readonly Need[], weight: (n: Need) => number, room: number): { count: number; area: number } {
  let sum = needs.reduce((s, n) => s + weight(n), 0);
  const excess = sum - room;
  if (!(excess > 0)) return { count: 0, area: 0 };
  let count = 0;
  // The largest items go first, so the count of the dropped items is the smallest count that fits the area
  for (const w of needs.map(weight).toSorted((p, q) => q - p)) {
    if (sum <= room || !(w > 0)) break;
    sum -= w;
    count += 1;
  }
  if (needs.every((n) => weight(n) === n.area)) return { count, area: excess };
  const rate = (n: Need): number => n.area / weight(n);
  let area = 0;
  let left = excess;
  for (const n of needs.filter((x) => weight(x) > 0).toSorted((p, q) => rate(p) - rate(q))) {
    if (!(left > 0)) break;
    const share = Math.min(1, left / weight(n));
    area += share * n.area;
    left -= share * weight(n);
  }
  return { count, area };
}

/**
 * This function gives a lower bound of the overflow of an input: the items that no packer can place, and their area.
 *
 * - The candidates are the items that are not locked at a position.
 * - A fixed side forces each candidate that is longer than the side less the inset, with its margin. A `turnable` item needs both turns too long.
 * - A fixed size also forces the drops of 2 area rules. The bound takes the larger count and the larger area of the 2 rules.
 * - Rule A: the candidates with their margins fit the free area of `freeAreaBound`.
 * - Rule B, for a gap `g` above 0: the candidates with their margins and the gap fit the inner rectangle grown by `g / 2`.
 * - An item grows only when it is a rectangle and not in `pairGaps`. Another item counts with its area.
 * - The area of the bound is the area of the long items, plus the area of the drops. A container with no fixed side gives 0.
 *
 * The proof of rule A: the hard rules keep the margined boxes in the inner rectangle, out of the obstacles and out of each other.
 *
 * The proof of rule B: two items are `mA + gap + mB` apart (decision 3 of `docs/PACKER.md`). Thus the boxes grown by `g / 2` more do not overlap.
 * Each such box is in the inner rectangle grown by `g / 2`. A box with the gap can go over an obstacle, so rule B does not subtract the obstacles.
 * Rule B holds for each layout that keeps the gap. Each strategy of the package keeps it through its frame.
 *
 * The tolerance: two boxes can overlap by `t` on one axis, and a box can go out by `t`. A slack of `2 * t` along the edges keeps each rule valid.
 */
export function overflowBound(input: PackInput): OverflowBound {
  const { container } = input;
  const fixedW = container.fixed === "size" || container.fixed === "width";
  const fixedH = container.fixed === "size" || container.fixed === "height";
  if (!fixedW && !fixedH) return { forced: 0, area: 0, free: Infinity };
  const tol = DEFAULT_TOLERANCE.overlap;
  const bounds = containerBox(input);
  const inset = container.inset ?? 0;
  const maxW = fixedW ? bounds.w - 2 * inset + 2 * tol : Infinity;
  const maxH = fixedH ? bounds.h - 2 * inset + 2 * tol : Infinity;
  const paired = pairedIds(input);
  const gap = Math.max(0, input.gap ?? 0);

  let forced = 0;
  let area = 0;
  let slackA = 0;
  let slackB = 0;
  const needs: Need[] = [];
  for (const item of input.items) {
    if (lockedAt(item)) continue;
    const box = itemBox(item);
    const w = Math.min(item.w, box.w);
    const h = Math.min(item.h, box.h);
    const m = sidesOf(item);
    const mw = m.left + m.right;
    const mh = m.top + m.bottom;
    // The turn moves each side of the margin one side clockwise, so the turned width is h + mh
    const fits = (w + mw <= maxW && h + mh <= maxH) || (item.turnable === true && h + mh <= maxW && w + mw <= maxH);
    const a = itemArea(item);
    if (!fits) {
      forced += 1;
      area += a;
      continue;
    }
    const grow = grows(item, paired);
    const gw = Math.max(0, w) + (grow ? mw : 0);
    const gh = Math.max(0, h) + (grow ? mh : 0);
    needs.push({ area: a, margined: grow ? gw * gh : a, gapped: grow ? (gw + gap) * (gh + gap) : a });
    slackA += 2 * tol * (gw + gh);
    slackB += 2 * tol * (gw + gh + (grow ? 2 * gap : 0));
  }
  if (!(fixedW && fixedH)) return { forced, area, free: Infinity };

  const free = freeAreaBound(input);
  const edge = (extra: number): number => 2 * tol * (Math.max(0, bounds.w) + Math.max(0, bounds.h) + 2 * extra);
  // An item can go out of the container by the tolerance, thus the edge of the container adds a slack too
  const a = dropsOf(needs, (n) => n.margined, free + slackA + edge(0));
  let b = { count: 0, area: 0 };
  if (gap > 0 && needs.some((n) => n.gapped !== n.area)) {
    const inner = shrink(bounds, inset);
    b = dropsOf(needs, (n) => n.gapped, (inner.w + gap) * (inner.h + gap) + slackB + edge(gap));
  }
  return { forced: forced + Math.max(a.count, b.count), area: area + Math.max(a.area, b.area), free };
}
