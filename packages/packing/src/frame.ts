// The internal frame of the adapters of 0.1: the conversion of a PackInput to the Rect objects of 0.1, and back.
// Each item grows by its margin and by half the gap on each side. Each obstacle grows by half the gap. Thus two items
// are `mA + gap + mB` apart. The area of the frame is the container less the inset, grown by half the gap on each side.

import { boundsOf } from "@mark1russell7/layout-contract";
import { EPS, marginOf, turnItem, type Item, type Obstacle, type PackInput, type PackOutput, type Placement, type Region, type StageTrace } from "./contract.ts";
import { Rect } from "./rect.ts";

const clock = (globalThis as { performance?: { now(): number } }).performance;

/** This function gives the time in milliseconds. */
export function now(): number {
  return clock ? clock.now() : Date.now();
}

/** The bounding box of a region comes from the contract. */
export { boundsOf } from "@mark1russell7/layout-contract";

/** The rectangle of a container: its origin and its size. A free side has the size `Infinity`. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** This function gives the rectangle of a container. A rectangle shape gives the origin and the sizes of the fixed sides. */
export function containerBounds(input: PackInput): Bounds {
  const { container } = input;
  const shape = container.shape === undefined ? undefined : boundsOf(container.shape);
  const fixedW = container.fixed === "size" || container.fixed === "width";
  const fixedH = container.fixed === "size" || container.fixed === "height";
  const w = shape?.w ?? container.w;
  const h = shape?.h ?? container.h;
  if (fixedW && w === undefined) throw new TypeError(`A container with fixed "${container.fixed}" needs a width.`);
  if (fixedH && h === undefined) throw new TypeError(`A container with fixed "${container.fixed}" needs a height.`);
  return { x: shape?.x ?? 0, y: shape?.y ?? 0, w: fixedW ? w! : Infinity, h: fixedH ? h! : Infinity };
}

/** One rectangle of the frame, and the item or the obstacle that it measures. */
export interface Entry {
  rect: Rect<number>;
  item?: Item;
  obstacle?: Obstacle;
  /** The offset from the corner of the rectangle to the corner of the item or the obstacle. */
  dx: number;
  dy: number;
}

/** The rectangles of 0.1 for one input. */
export interface Frame {
  /** The container coordinates of the origin of the frame. */
  ox: number;
  oy: number;
  /** The size of the area of the frame. A free side has the size `Infinity`. */
  w: number;
  h: number;
  bounds: Bounds;
  inset: number;
  /** The items in the order of their rank, then the obstacles. */
  entries: Entry[];
  /** The ids of the items that are too large for the area. The frame has no rectangle for them. */
  tooLarge: string[];
}

/** This function gives the items in the order of their rank. The index in the array is the rank of an item without one. */
export function byRank(items: readonly Item[]): Item[] {
  return items
    .map((item, index) => ({ item, rank: item.rank ?? index }))
    .toSorted((a, b) => a.rank - b.rank)
    .map((e) => e.item);
}

/**
 * This function makes the frame of an input. A locked item with a position and an obstacle without `move` are locked
 * rectangles. An obstacle with `move` is a free rectangle only when `movable` is `true`. With `turnable`, a turnable item
 * is too large only when it is too large in the two directions.
 */
export function buildFrame(input: PackInput, movable = false, turnable = false): Frame {
  const bounds = containerBounds(input);
  const inset = input.container.inset ?? 0;
  const half = (input.gap ?? 0) / 2;
  const ox = bounds.x + inset - half;
  const oy = bounds.y + inset - half;
  const w = bounds.w - 2 * inset + 2 * half;
  const h = bounds.h - 2 * inset + 2 * half;
  const entries: Entry[] = [];
  const tooLarge: string[] = [];

  for (const item of byRank(input.items)) {
    const m = marginOf(item);
    const rect = new Rect<number>();
    rect.size.set(item.w + m.left + m.right + 2 * half, item.h + m.top + m.bottom + 2 * half);
    const dx = m.left + half;
    const dy = m.top + half;
    if (item.locked === true && item.x !== undefined && item.y !== undefined) {
      rect.locked = true;
      rect.position.set(item.x - dx - ox, item.y - dy - oy);
    } else if (
      (rect.size.x > w + EPS || rect.size.y > h + EPS) &&
      !(turnable && item.turnable === true && rect.size.y <= w + EPS && rect.size.x <= h + EPS)
    ) {
      tooLarge.push(item.id);
      continue;
    }
    entries.push({ rect, item, dx, dy });
  }

  for (const obstacle of input.obstacles ?? []) {
    const b = boundsOf(obstacle.region);
    const rect = new Rect<number>();
    rect.size.set(b.w + 2 * half, b.h + 2 * half);
    rect.position.set(b.x - half - ox, b.y - half - oy);
    rect.locked = !(movable && obstacle.move !== undefined);
    entries.push({ rect, obstacle, dx: half, dy: half });
  }
  return { ox, oy, w, h, bounds, inset, entries, tooLarge };
}

/** This function gives the outer rectangle of 0.1 for a frame. A free height starts at 0 and grows. */
export function outerOf(frame: Frame): Rect<number> {
  const outer = new Rect<number>();
  const fixedSize = Number.isFinite(frame.h);
  outer.size.set(frame.w, fixedSize ? frame.h : 0);
  outer.fixedWidth = true;
  outer.fixedSize = fixedSize;
  return outer;
}

/** This function gives the rectangles of a frame, in the order of the entries. */
export function rectsOf(frame: Frame): Rect<number>[] {
  return frame.entries.map((e) => e.rect);
}

/** The turns of a packing: the rectangles that turned, and the turn of an item in the axes of the frame. */
export interface FrameTurns {
  /** The rectangles of the frame that the packer turned. */
  rects: ReadonlySet<unknown>;
  /** This function gives an item after a turn of 90 degrees clockwise in the axes of the input, in the axes of the frame. */
  turn: (item: Item) => Item;
}

/**
 * This function gives the turn of an item for a frame. A frame of `viaAxes` has the axes changed. The turn of the input
 * goes through that change, thus the item turns the other way in the frame.
 */
export function frameTurn(transposed: boolean): (item: Item) => Item {
  return transposed ? (item) => transposeItem(turnItem(transposeItem(item))) : turnItem;
}

/**
 * This function reads the output from the rectangles of a frame after a packing of 0.1. A locked item keeps its
 * position exactly. Each other item that the packer did not place goes to the overflow. With `turns`, each rectangle
 * that turned gives a placement with `turn: 90`.
 */
export function readFrame(input: PackInput, frame: Frame, trace: readonly StageTrace[], moved: PackOutput["moved"] = [], turns?: FrameTurns): PackOutput {
  const placements: Placement[] = [];
  const overflow: string[] = [...frame.tooLarge];
  for (const e of frame.entries) {
    const item = e.item;
    if (item === undefined) continue;
    if (item.locked === true && item.x !== undefined && item.y !== undefined) placements.push({ id: item.id, x: item.x, y: item.y });
    else if (e.rect.wasPacked && turns?.rects.has(e.rect) === true) {
      // The half gap is the offset less the margin. The margin of the turned item gives the new offset.
      const half = e.dx - marginOf(item).left;
      const m = marginOf(turns.turn(item));
      placements.push({ id: item.id, x: e.rect.position.x + m.left + half + frame.ox, y: e.rect.position.y + m.top + half + frame.oy, turn: 90 });
    } else if (e.rect.wasPacked) placements.push({ id: item.id, x: e.rect.position.x + e.dx + frame.ox, y: e.rect.position.y + e.dy + frame.oy });
    else overflow.push(item.id);
  }
  return { placements, overflow, size: sizeOf(input, frame, placements, moved, turns), moved, trace };
}

/**
 * This function gives the far edges of a packing from the corner of the container. It reads the items with their margins,
 * the inset and the obstacles. With `turn`, a placement with `turn: 90` reads the turned item.
 */
export function extentOf(
  input: PackInput,
  placements: readonly Placement[],
  moved: PackOutput["moved"],
  origin: { x: number; y: number } = containerBounds(input),
  inset: number = input.container.inset ?? 0,
  turn?: (item: Item) => Item,
): { right: number; bottom: number } {
  const items = new Map(input.items.map((i) => [i.id, i]));
  let right = 0;
  let bottom = 0;
  for (const p of placements) {
    const given = items.get(p.id)!;
    const item = p.turn === 90 && turn !== undefined ? turn(given) : given;
    const m = marginOf(item);
    right = Math.max(right, p.x + item.w + m.right + inset - origin.x);
    bottom = Math.max(bottom, p.y + item.h + m.bottom + inset - origin.y);
  }
  const movedById = new Map(moved.map((m) => [m.id, m]));
  for (const o of input.obstacles ?? []) {
    const b = boundsOf(o.region);
    const at = movedById.get(o.id) ?? b;
    right = Math.max(right, at.x + b.w - origin.x);
    bottom = Math.max(bottom, at.y + b.h - origin.y);
  }
  return { right, bottom };
}

/**
 * This function gives the size of the container after a packing. A fixed side keeps its size. A free side goes to the
 * far edge of the items with their margins and the inset, or of the obstacles.
 */
function sizeOf(input: PackInput, frame: Frame, placements: Placement[], moved: PackOutput["moved"], turns?: FrameTurns): { w: number; h: number } {
  const { right, bottom } = extentOf(input, placements, moved, frame.bounds, frame.inset, turns?.turn);
  return {
    w: Number.isFinite(frame.bounds.w) ? frame.bounds.w : right,
    h: Number.isFinite(frame.bounds.h) ? frame.bounds.h : bottom,
  };
}

/** This function gives a region with the axes changed: x for y, and w for h. */
export function transposeRegion(region: Region): Region {
  switch (region.kind) {
    case "rect":
      return { kind: "rect", x: region.y, y: region.x, w: region.h, h: region.w };
    case "circle":
      return { kind: "circle", cx: region.cy, cy: region.cx, r: region.r };
    case "ellipse":
      return { kind: "ellipse", cx: region.cy, cy: region.cx, rx: region.ry, ry: region.rx };
    case "polygon": {
      const swap = (ring: readonly (readonly [number, number])[]): [number, number][] => ring.map(([x, y]) => [y, x]);
      return region.holes === undefined
        ? { kind: "polygon", points: swap(region.points) }
        : { kind: "polygon", points: swap(region.points), holes: region.holes.map(swap) };
    }
  }
}

/** This function gives an item with the axes changed. The ports go, because the adapters of 0.1 do not read them. */
function transposeItem(item: Item): Item {
  const { ports: _ports, x, y, shape, margin, ...rest } = item;
  return {
    ...rest,
    w: item.h,
    h: item.w,
    ...(y === undefined ? {} : { x: y }),
    ...(x === undefined ? {} : { y: x }),
    ...(shape === undefined ? {} : { shape: transposeRegion(shape) }),
    ...(margin === undefined
      ? {}
      : { margin: typeof margin === "number" ? margin : { top: margin.left, right: margin.bottom, bottom: margin.right, left: margin.top } }),
  };
}

/** This function gives an input with the axes changed. A fixed height becomes a fixed width. */
export function transposeInput(input: PackInput): PackInput {
  const c = input.container;
  const container: PackInput["container"] = {
    fixed: c.fixed === "height" ? "width" : c.fixed === "width" ? "height" : c.fixed,
    ...(c.h === undefined ? {} : { w: c.h }),
    ...(c.w === undefined ? {} : { h: c.w }),
    ...(c.aspect === undefined ? {} : { aspect: 1 / c.aspect }),
    ...(c.aspectWeight === undefined ? {} : { aspectWeight: c.aspectWeight }),
    ...(c.shape === undefined ? {} : { shape: transposeRegion(c.shape) }),
    ...(c.inset === undefined ? {} : { inset: c.inset }),
  };
  return {
    container,
    items: input.items.map(transposeItem),
    ...(input.obstacles === undefined ? {} : { obstacles: input.obstacles.map((o) => ({ ...o, region: transposeRegion(o.region) })) }),
    ...(input.gap === undefined ? {} : { gap: input.gap }),
  };
}

/** This function gives an output with the axes changed. */
export function transposeOutput(output: PackOutput): PackOutput {
  return {
    placements: output.placements.map((p) => ({ ...p, x: p.y, y: p.x })),
    overflow: [...output.overflow],
    size: { w: output.size.h, h: output.size.w },
    moved: output.moved.map((m) => ({ id: m.id, x: m.y, y: m.x })),
    ...(output.trace === undefined ? {} : { trace: output.trace }),
  };
}

/**
 * This function packs an input with a fixed height through the turn of the axes. It changes x for y in the input.
 * Then it packs with a fixed width, and changes the axes of the output back.
 */
export function viaAxes(input: PackInput, previous: PackOutput | undefined, run: (turned: PackInput, previous: PackOutput | undefined) => PackOutput): PackOutput {
  const start = now();
  const turned = transposeInput(input);
  const inner = run(turned, previous === undefined ? undefined : transposeOutput(previous));
  return { ...transposeOutput(inner), trace: [{ id: "axes", ms: now() - start, measures: {} }, ...(inner.trace ?? [])] };
}
