// The wrapper `aspectFit` of roadmap item k62 (`docs/PACKER.md`, "The aspect fit"). For a free-size container, it packs
// with the wrapped strategy at some widths near the target aspect, and it keeps the best output by a key with the aspect
// error in it. Nothing default uses it.

import { pickMoves, portfolio, type Member, type SelectLevel } from "@mark1russell7/layout-contract";
import { marginOf, turnItem, type PackInput, type PackOutput, type Region } from "./contract.ts";
import { boundsOf, containerBounds, extentOf, viaAxes } from "./frame.ts";
import { MEASURE_SPECS, measure } from "./measures.ts";
import { measureKey } from "./select-key.ts";
import { createContext, type PackContext, type Strategy } from "./strategy.ts";

/** The options of `aspectFit` */
export interface AspectFitOptions {
  /** The target aspect: the width divided by the height. The default is `aspect` of the container, else 1. */
  targetAspect?: number;
}

/** The id of the trace stage of `aspectFit`. Its measure `move.aspectPick` is 1 when the pick is not the output of the wrapped strategy. */
export const ASPECT_FIT_STAGE = "aspect-fit";

/**
 * The factors of the widths of `aspectFit`. Each width is a factor times the square root of the area of the first output
 * times the target aspect. The steps are approximately 5% of the width, thus approximately 0.1 of the aspect error.
 */
export const ASPECT_FIT_FACTORS: readonly number[] = Object.freeze([0.86, 0.9, 0.95, 1, 1.05, 1.1, 1.16]);

/**
 * The levels of the pick of `aspectFit`, in order. Level 0 is `hard`.
 *
 * - `hard`: the count of hard breaks of `checkHard` with `exactContainer`. Lower is better, with the minimum effect 0.
 * - `pack.overflow.excessArea`: the overflow area above its bound. Lower is better.
 * - `pack.aspectError`: the distance from the target aspect. Lower is better, with the minimum effect 0.01.
 * - `pack.area`: the area of the hull. Lower is better, with the minimum effect of 1% of the area.
 */
export const ASPECT_FIT_LEVELS: readonly SelectLevel[] = Object.freeze([
  { id: "hard", spec: { direction: "lower", minEffect: 0 } },
  { id: "pack.overflow.excessArea", spec: MEASURE_SPECS["pack.overflow.excessArea"] },
  { id: "pack.aspectError", spec: MEASURE_SPECS["pack.aspectError"] },
  { id: "pack.area", spec: MEASURE_SPECS["pack.area"] },
] as SelectLevel[]);

/** This function gives a shape with the origin of `shape` and the width `w`. A shape that is not a rectangle keeps the holes of its polygon. */
function stripOf(shape: Region, w: number): Region {
  const b = boundsOf(shape);
  if (shape.kind === "rect") return { kind: "rect", x: b.x, y: b.y, w, h: b.h };
  const points: [number, number][] = [
    [b.x, b.y],
    [b.x + w, b.y],
    [b.x + w, b.y + b.h],
    [b.x, b.y + b.h],
  ];
  return shape.kind === "polygon" && shape.holes !== undefined ? { kind: "polygon", points, holes: shape.holes } : { kind: "polygon", points };
}

/** This function gives an input with the fixed width `w` and a free height. A shape becomes a strip of the width `w`. */
function atWidth(input: PackInput, w: number): PackInput {
  const c = input.container;
  return { ...input, container: { ...c, fixed: "width", w, ...(c.shape === undefined ? {} : { shape: stripOf(c.shape, w) }) } };
}

/** This function gives the widths of `aspectFit` for an input and the first output. Each width is narrower than a fixed width. */
function widthsOf(input: PackInput, first: PackOutput, target: number): number[] {
  const area = measure(input, first)["pack.area"];
  if (!(area > 0)) return [];
  const inset = input.container.inset ?? 0;
  const fixed = input.container.fixed === "width" ? containerBounds(input).w : Infinity;
  let widest = 0;
  for (const item of input.items) {
    const m = marginOf(item);
    widest = Math.max(widest, item.w + m.left + m.right);
  }
  const ideal = Math.sqrt(area * target);
  const out: number[] = [];
  for (const f of ASPECT_FIT_FACTORS) {
    const w = Math.max(Math.round(f * ideal + 2 * inset), Math.ceil(widest + 2 * inset));
    if (w < fixed && !out.includes(w)) out.push(w);
  }
  return out;
}

/** This function packs an input with a free height or a free size near the target aspect. */
function fit<O>(input: PackInput, target: number, inner: Strategy<O>, options: O, context: PackContext): PackOutput {
  const fresh = (): PackContext => createContext(context.seed, { ...(context.budget === undefined ? {} : { budget: context.budget }), ...(context.previous === undefined ? {} : { previous: context.previous }) });
  const first = inner.pack(input, options, fresh());
  const widths = widthsOf(input, first, target);
  if (widths.length === 0) return first;
  const origin = containerBounds(input);
  const inset = input.container.inset ?? 0;
  const free = input.container.fixed === "none";
  // A free width goes to the far edge of the content. A fixed width keeps its size.
  const sized = (out: PackOutput): PackOutput => {
    const w = free ? extentOf(input, out.placements, out.moved, origin, inset, turnItem).right : origin.w;
    return { ...out, size: { w, h: out.size.h } };
  };
  const members: Member<PackInput, PackOutput>[] = [
    { id: inner.id, run: () => first },
    ...widths.map((w) => ({ id: `${inner.id}@${w}`, run: (x: PackInput): PackOutput => sized(inner.pack(atWidth(x, w), options, fresh())) })),
  ];
  const view = (x: PackInput): PackInput => (x.container.aspect === target ? x : { ...x, container: { ...x.container, aspect: target } });
  const got = portfolio(ASPECT_FIT_STAGE, members, measureKey(ASPECT_FIT_LEVELS.slice(1), view)).pick(input);
  const stage = { id: ASPECT_FIT_STAGE, measures: { "move.aspectPick": pickMoves(got.trace).pick } };
  return { ...got.output, trace: [...(got.output.trace ?? []), stage] };
}

/**
 * This function wraps a strategy. For a free-size container, it packs at some widths near the target aspect and keeps the best output.
 *
 * - The target is `targetAspect`, else `aspect` of the container, else 1.
 * - A container with the size `fixed` goes to the wrapped strategy without a change.
 * - The first member is the output of the wrapped strategy. Each other member packs at one fixed width of `ASPECT_FIT_FACTORS`.
 * - The key is `ASPECT_FIT_LEVELS`, then `outputHash`. The aspect error reads the target. `selectBest` of the contract picks the winner.
 * - A fixed height goes through the turn of the axes, with the target `1 / target`.
 * - The function throws a `RangeError` for a target that is not a number above 0.
 */
export function aspectFit<O>(inner: Strategy<O>, options: AspectFitOptions = {}): Strategy<O> {
  const given = options.targetAspect;
  if (given !== undefined && !(Number.isFinite(given) && given > 0)) throw new RangeError(`The target aspect of aspectFit is a number above 0, not ${String(given)}.`);
  return {
    id: `aspect-fit(${inner.id})`,
    family: inner.family,
    catalog: [],
    supports: inner.supports,
    defaults: inner.defaults,
    deterministic: inner.deterministic,
    pack(input: PackInput, o: O, context: PackContext): PackOutput {
      const c = input.container;
      if (c.fixed === "size") return inner.pack(input, o, context);
      const target = given ?? c.aspect ?? 1;
      if (c.fixed === "height") return viaAxes(input, context.previous, (turned, previous) => fit(turned, 1 / target, inner, o, { ...context, ...(previous === undefined ? {} : { previous }) }));
      return fit(input, target, inner, o, context);
    },
  };
}
