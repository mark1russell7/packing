// The input features of roadmap item k116. The coverage model reads them in place of the family id and the params of a generator.
// Each feature comes from the input itself: the items, the container, the obstacles and the knobs.
//
// `docs/BENCH.md` ("The input features") tells each feature.

import { boundsOf, itemShapeOf, regionArea, type Margin } from "@mark1russell7/layout-contract";
import type { PackInput } from "@mark1russell7/packing";

/** The value of a numeric input feature that the input does not define, for example the fill of a container with a free side. */
export const NO_VALUE = "-1";

/** The names of the input features, in the order of `inputFeatures`. */
export const INPUT_FEATURES: readonly string[] = Object.freeze([
  "in.count",
  "in.locked",
  "in.fill",
  "in.aspect.mean",
  "in.aspect.spread",
  "in.aspect.max",
  "in.area.cv",
  "in.fixed",
  "in.container",
  "in.obstacles",
  "in.side.max",
  "in.items",
  "in.turnable",
  "in.margin",
  "in.gap",
]);

/** This function gives a number as text with 2 significant digits. The value -0 becomes 0. */
export const twoDigits = (v: number): string => String(Number(v.toPrecision(2)) + 0);

/** This function gives the mean of the 4 sides of a margin. No margin gives 0. */
const marginOf = (m: Margin | undefined): number => (m === undefined ? 0 : typeof m === "number" ? m : (m.top + m.right + m.bottom + m.left) / 4);

/** This function gives the fixed sides of the container: the width and the height, or `undefined` for a free side. A shape gives its bounding box. */
export function fixedSides(input: Pick<PackInput, "container">): { w: number | undefined; h: number | undefined } {
  const c = input.container;
  const box = c.shape === undefined ? { w: c.w, h: c.h } : boundsOf(c.shape);
  return { w: c.fixed === "size" || c.fixed === "width" ? box.w : undefined, h: c.fixed === "size" || c.fixed === "height" ? box.h : undefined };
}

/** This function gives the mean and the standard deviation of some values. No value gives 0 and 0. */
function meanSd(values: readonly number[]): { mean: number; sd: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, sd: Math.sqrt(variance) };
}

/** This function gives the area of the container, or `undefined` when a side is free. A shape gives its exact area. */
export function containerArea(input: Pick<PackInput, "container">): number | undefined {
  const c = input.container;
  if (c.shape !== undefined) return regionArea(c.shape);
  return c.fixed === "size" && c.w !== undefined && c.h !== undefined ? c.w * c.h : undefined;
}

/**
 * This function gives the input features of a packing input, as text. The same input gives the same features.
 *
 * - `in.count` is the count of the free items, and `in.locked` is the count of the locked items.
 * - `in.fill` is the area of the free items over the area of the container. A container with a free side gives `-1`.
 * - `in.aspect.mean`, `in.aspect.spread` and `in.aspect.max` are the mean, the standard deviation and the largest long side over short side of the free items.
 * - `in.area.cv` is the coefficient of variation of the areas of the free items: the standard deviation over the mean.
 * - `in.fixed` is the field `fixed` of the container. `in.container` is the kind of its shape, or `rect`.
 * - `in.obstacles` is the area of the obstacles and of the locked items over the area of the container. A free side gives `-1`.
 * - `in.side.max` is the largest side of a free item over the fixed side of the container. A turnable item takes its better turn. No fixed side gives `-1`.
 * - `in.items` is the shape kind of the items, or `mixed`. `in.turnable` is the share of the free items that can turn.
 * - `in.margin` is the mean margin of the items over the mean item side. `in.gap` is the gap over the mean item side.
 *
 * The mean item side is the mean of `(w + h) / 2` over the free items. Without a gap, the largest pair gap is the gap.
 * The fill, the largest side, the margin and the gap tell the forced overflow: the items that no packer can place.
 * Each real number has 2 significant digits. Thus near inputs get the same level.
 */
export function inputFeatures(input: PackInput): Record<string, string> {
  const free = input.items.filter((i) => i.locked !== true);
  const locked = input.items.length - free.length;
  const areas = free.map((i) => Math.max(0, i.w) * Math.max(0, i.h));
  const aspects = free.map((i) => {
    const lo = Math.min(i.w, i.h);
    return lo > 0 ? Math.max(i.w, i.h) / lo : 1;
  });
  const area = containerArea(input);
  const itemArea = areas.reduce((s, a) => s + a, 0);
  const blocked =
    (input.obstacles ?? []).reduce((s, o) => s + regionArea(o.region), 0) +
    input.items.filter((i) => i.locked === true).reduce((s, i) => s + Math.max(0, i.w) * Math.max(0, i.h), 0);
  const a = meanSd(aspects);
  const s = meanSd(areas);
  const shape = input.container.shape;
  const holes = shape?.kind === "polygon" && (shape.holes ?? []).length > 0;
  const gap = (input.gap ?? 0) > 0 ? input.gap! : (input.pairGaps ?? []).reduce((m, p) => Math.max(m, p.gap), 0);
  const side = free.length === 0 ? 0 : free.reduce((s, i) => s + (i.w + i.h) / 2, 0) / free.length;
  const margin = free.length === 0 ? 0 : free.reduce((s, i) => s + marginOf(i.margin), 0) / free.length;
  const { w: W, h: H } = fixedSides(input);
  const over = (w: number, h: number): number => Math.max(W === undefined || !(W > 0) ? 0 : w / W, H === undefined || !(H > 0) ? 0 : h / H);
  const sideMax = free.reduce((m, i) => Math.max(m, i.turnable === true ? Math.min(over(i.w, i.h), over(i.h, i.w)) : over(i.w, i.h)), 0);
  return {
    "in.count": String(free.length),
    "in.locked": String(locked),
    "in.fill": area === undefined || !(area > 0) ? NO_VALUE : twoDigits(itemArea / area),
    "in.aspect.mean": twoDigits(a.mean),
    "in.aspect.spread": twoDigits(a.sd),
    "in.aspect.max": twoDigits(aspects.reduce((m, v) => Math.max(m, v), 0)),
    "in.area.cv": s.mean > 0 ? twoDigits(s.sd / s.mean) : "0",
    "in.fixed": input.container.fixed,
    "in.container": shape === undefined ? "rect" : holes ? "holes" : shape.kind,
    "in.obstacles": area === undefined || !(area > 0) ? (blocked > 0 ? NO_VALUE : "0") : twoDigits(blocked / area),
    "in.side.max": W === undefined && H === undefined ? NO_VALUE : twoDigits(sideMax),
    "in.items": itemShapeOf({ boxes: input.items }),
    "in.turnable": free.length === 0 ? "0" : twoDigits(free.filter((i) => i.turnable === true).length / free.length),
    "in.margin": side > 0 ? twoDigits(margin / side) : "0",
    "in.gap": side > 0 ? twoDigits(gap / side) : "0",
  };
}
