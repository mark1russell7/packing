// The split of the free space as a stage of its own (roadmap item k41, docs/PACKER.md "The stages").
// A split gives the parts of an input. `packParts` packs the items into the parts, one part after another, with one
// placement strategy. Thus a strategy that packs one rectangle packs around the obstacles through any split.

import { turnItem, type Item, type LayoutContainer, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { buildFrame, extentOf } from "./frame.ts";
import { spaceOf, spaceParts } from "./space.ts";
import { cellOf, UnsupportedCell, type PackContext, type Strategy } from "./strategy.ts";

/**
 * A part of the free space: the rectangle of a container with no inset, in the coordinates of the container. An item with
 * its margin goes in the part, and the part keeps the gap to each other part.
 */
export interface Part {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** The width. `Infinity` is a free width. */
  readonly w: number;
  /** The height. `Infinity` is a free height. */
  readonly h: number;
  /** The value `true` tells that the part is the container of the input, with its shape, its inset and its obstacles. */
  readonly whole?: boolean;
}

/** A split of the free space around the obstacles and the locked items. */
export interface Split {
  readonly id: string;
  /** This method gives the parts of an input, in reading order. It throws `UnsupportedCell` for an input outside its cells. */
  split(input: PackInput): Part[];
}

/** The split `one-region` gives one part: the container itself. Through `packParts`, it gives the output of the placement. */
export const oneRegion: Split = {
  id: "one-region",
  split(input) {
    return [{ id: "whole", x: 0, y: 0, w: input.container.w ?? Infinity, h: input.container.h ?? Infinity, whole: true }];
  },
};

/**
 * The split `obstacle-cuts` cuts the free space into bands at each top edge and each bottom edge of each rectangle
 * obstacle and locked item. Each free x-span of a band is a part.
 *
 * - It takes a rectangle container with a fixed size or a free height, and obstacles that do not move.
 * - The parts do not overlap. A span or a band that is no wider than the gap holds no item, so it is no part.
 * - Without a gap, the area of the parts is the free area of the frame of `freeSpace`.
 * - The last band of a free height has the height `Infinity`.
 */
export const obstacleCuts: Split = {
  id: "obstacle-cuts",
  split(input) {
    const cell = cellOf(input);
    if (cell.containerShape !== "rect") throw new UnsupportedCell("containerShape", cell.containerShape);
    if (cell.containerSize !== "fixed" && cell.containerSize !== "freeHeight") throw new UnsupportedCell("containerSize", cell.containerSize);
    if (cell.obstacleMove !== undefined && cell.obstacleMove !== "fixed") throw new UnsupportedCell("obstacleMove", cell.obstacleMove);
    const frame = buildFrame(input);
    const space = spaceOf(input, frame);
    const holes = spaceParts(space)?.holes ?? [];
    const g = input.gap ?? 0;
    const half = g / 2;
    const end = space.h;
    const edges = new Set<number>([0]);
    for (const r of holes) for (const y of [r.y, r.y + r.h]) if (y > 0 && y < end) edges.add(y);
    const ys = [...edges].sort((a, b) => a - b);
    ys.push(end);
    const parts: Part[] = [];
    for (let i = 0; i + 1 < ys.length; i++) {
      const y0 = ys[i]!;
      const y1 = ys[i + 1]!;
      for (const span of space.band(y0, y1)) {
        const x0 = Math.max(0, span.start);
        const x1 = Math.min(space.w, span.end);
        const w = x1 - x0 - g;
        const h = y1 - y0 - g;
        if (!(w > 0) || !(h > 0)) continue;
        parts.push({ id: `band${i}.${parts.length}`, x: x0 + half + frame.ox, y: y0 + half + frame.oy, w, h });
      }
    }
    return parts;
  },
};

/** The splits of this module, by id. */
export const SPLITS: Readonly<Record<string, Split>> = Object.freeze({ [oneRegion.id]: oneRegion, [obstacleCuts.id]: obstacleCuts });

/** This function gives the container of a part. A part with the height `Infinity` gives a free height. */
function containerOf(part: Part): LayoutContainer {
  return Number.isFinite(part.h) ? { w: part.w, h: part.h, fixed: "size" } : { w: part.w, fixed: "width" };
}

/**
 * This function packs an input through a split. It gives the items to the parts in reading order. Each part, in the
 * order of the split, packs the items that are left with `place`. An item that no part takes goes to the overflow.
 *
 * - A split that gives one part with `whole` gives the output of `place` for the input, byte for byte.
 * - A locked item keeps its position. An obstacle stays out of each part, so a sub-input has no obstacle.
 * - The size of the output reads the placements, as each strategy does. The trace has one stage, `split:<id>`.
 * - It throws a `RangeError` for an input with `pairGaps`, because a part keeps only the gap of the input to the next part.
 */
export function packParts(input: PackInput, split: Split, place: Strategy, options: unknown, context: PackContext): PackOutput {
  const parts = split.split(input);
  if (parts.length === 1 && parts[0]!.whole === true) return place.pack(input, options, context);
  if (parts.some((p) => p.whole === true)) throw new RangeError(`The split "${split.id}" gives a whole part with other parts.`);
  if ((input.pairGaps ?? []).length > 0) throw new RangeError("packParts does not take an input with pairGaps.");

  const placements: Placement[] = [];
  let left: Item[] = [];
  for (const item of input.items) {
    if (item.locked === true && item.x !== undefined && item.y !== undefined) placements.push({ id: item.id, x: item.x, y: item.y });
    else left.push(item);
  }
  let used = 0;
  for (const part of parts) {
    if (left.length === 0) break;
    const sub: PackInput = { container: containerOf(part), items: left, ...(input.gap === undefined ? {} : { gap: input.gap }) };
    const out = place.pack(sub, options, context);
    if (out.placements.length === 0) continue;
    used++;
    const taken = new Set<string>();
    for (const p of out.placements) {
      placements.push({ ...p, x: p.x + part.x, y: p.y + part.y });
      taken.add(p.id);
    }
    left = left.filter((i) => !taken.has(i.id));
  }

  const frame = buildFrame(input);
  const { right, bottom } = extentOf(input, placements, [], frame.bounds, frame.inset, turnItem);
  return {
    placements,
    overflow: left.map((i) => i.id),
    size: { w: Number.isFinite(frame.bounds.w) ? frame.bounds.w : right, h: Number.isFinite(frame.bounds.h) ? frame.bounds.h : bottom },
    moved: [],
    trace: [{ id: `split:${split.id}`, measures: { "pack.split.parts": parts.length, "pack.split.used": used } }],
  };
}
