// The stability when an anchor moves (roadmap item k111). `docs/MEASURES.md`, "Stability when an anchor moves", defines
// the measures. The function moves one locked item or one fixed rectangle obstacle a small step, packs again with the
// same seed, and measures how far the other items move. A loop of the same step tells if the result settles.

import { RECORD_EPS, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { measureChange } from "./measures.ts";
import { packWith } from "./registry.ts";

/** A step of an anchor: the change of `x` and of `y`, in units of the container. */
export interface AnchorStep {
  readonly dx: number;
  readonly dy: number;
}

/** The strategy of `anchorStability`: the id of a strategy of the registry and its options over the defaults. */
export interface AnchorStrategy {
  readonly strategy: string;
  readonly options?: unknown;
}

/** The options of `anchorStability`. */
export interface AnchorStabilityOptions {
  /** The seed of each pack. The default is 0. */
  seed?: number;
  /** The count of the steps of the loop, `k`. The default is `ANCHOR_STEPS`. */
  steps?: number;
  /** The largest gain of a step of a loop that settles. The default is `ANCHOR_GAIN_LIMIT`. */
  gainLimit?: number;
}

/** The measures of `anchorStability`, by id. The values are not rounded. The value 1 of `pack.anchor.settled` is true. */
export interface AnchorMeasures {
  "pack.anchor.mean": number;
  "pack.anchor.max": number;
  "pack.anchor.moved": number;
  "pack.anchor.gain": number;
  "pack.anchor.settled": number;
}

/** The result of `anchorStability`: the measures, and the gain of each step of the loop in its order. */
export interface AnchorStability {
  measures: AnchorMeasures;
  gains: number[];
}

/** The default count of the steps of the loop. */
export const ANCHOR_STEPS = 4;

/** The default largest gain of a step: the other items move no farther than the anchor. */
export const ANCHOR_GAIN_LIMIT = 1;

/** The ids of the measures of `anchorStability`, in the order of a record. */
export const ANCHOR_MEASURE_IDS: readonly (keyof AnchorMeasures)[] = Object.freeze(["pack.anchor.mean", "pack.anchor.max", "pack.anchor.moved", "pack.anchor.gain", "pack.anchor.settled"]);

/** This function tells if an id names a locked item with a position, or a fixed rectangle obstacle of an input. */
export function isAnchor(input: PackInput, id: string): boolean {
  const item = input.items.find((i) => i.id === id);
  if (item !== undefined) return item.locked === true && Number.isFinite(item.x) && Number.isFinite(item.y);
  const obstacle = (input.obstacles ?? []).find((o) => o.id === id);
  return obstacle !== undefined && obstacle.region.kind === "rect" && obstacle.move === undefined;
}

/**
 * This function gives a copy of an input with the anchor `id` moved by `dx` and `dy`. The anchor is a locked item or a
 * fixed rectangle obstacle. It throws a `RangeError` for an id that `isAnchor` refuses.
 */
export function moveAnchor(input: PackInput, id: string, dx: number, dy: number): PackInput {
  if (!isAnchor(input, id)) throw new RangeError(`"${id}" is not a locked item with a position or a fixed rectangle obstacle of the input.`);
  if (input.items.some((i) => i.id === id)) {
    return { ...input, items: input.items.map((i) => (i.id === id ? { ...i, x: i.x! + dx, y: i.y! + dy } : i)) };
  }
  return {
    ...input,
    obstacles: (input.obstacles ?? []).map((o) => (o.id === id && o.region.kind === "rect" ? { ...o, region: { ...o.region, x: o.region.x + dx, y: o.region.y + dy } } : o)),
  };
}

/** This function gives the placement of each item of an input that the output places, other than the anchor, by id. */
function othersOf(input: PackInput, output: PackOutput, anchor: string): Map<string, Placement> {
  const ids = new Set(input.items.map((i) => i.id));
  const map = new Map<string, Placement>();
  for (const p of output.placements) if (p.id !== anchor && ids.has(p.id) && !map.has(p.id)) map.set(p.id, p);
  return map;
}

/** This function gives the distance of each other item that both outputs place, in units of the container. */
function distancesOf(input: PackInput, before: PackOutput, after: PackOutput, anchor: string): number[] {
  const a = othersOf(input, before, anchor);
  const b = othersOf(input, after, anchor);
  const out: number[] = [];
  for (const [id, p] of a) {
    const q = b.get(id);
    if (q !== undefined) out.push(Math.hypot(q.x - p.x, q.y - p.y));
  }
  return out;
}

/**
 * This function measures the stability of a layout when one anchor moves (roadmap item k111).
 *
 * - The anchor is a locked item with a position, or a fixed rectangle obstacle. The other items are each other item.
 * - The function packs the input, then the input with the anchor moved by 1 to `steps` times the step. Each pack has the same seed.
 * - `pack.anchor.mean`, `pack.anchor.max` and `pack.anchor.moved` compare the first two packs.
 * - The distances are in diagonals of the container: the diagonal of the larger width and the larger height of the two outputs.
 * - The gain of a step is the largest distance of an other item in that step, divided by the length of the step.
 * - `pack.anchor.settled` is 1 when the gain of each step is `gainLimit` or less, and 0 otherwise.
 *
 * It throws a `RangeError` for an id that is not an anchor, a step of length 0, or a bad option.
 */
export function anchorStability(input: PackInput, config: AnchorStrategy, id: string, step: AnchorStep, options: AnchorStabilityOptions = {}): AnchorStability {
  const steps = options.steps ?? ANCHOR_STEPS;
  const limit = options.gainLimit ?? ANCHOR_GAIN_LIMIT;
  const seed = options.seed ?? 0;
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError(`The option steps is a whole number of 1 or more, not ${String(steps)}.`);
  if (!(Number.isFinite(limit) && limit >= 0)) throw new RangeError(`The option gainLimit is a finite number of 0 or more, not ${String(limit)}.`);
  const length = Math.hypot(step.dx, step.dy);
  if (!(Number.isFinite(length) && length > 0)) throw new RangeError("The step of the anchor has a finite length above 0.");
  if (!isAnchor(input, id)) throw new RangeError(`"${id}" is not a locked item with a position or a fixed rectangle obstacle of the input.`);

  const outputs: PackOutput[] = [];
  for (let k = 0; k <= steps; k++) outputs.push(packWith(config.strategy, k === 0 ? input : moveAnchor(input, id, k * step.dx, k * step.dy), config.options, seed));
  const [first, second] = [outputs[0]!, outputs[1]!];

  const w = Math.max(first.size.w, second.size.w);
  const h = Math.max(first.size.h, second.size.h);
  const diagonal = Math.hypot(w, h) > 0 ? Math.hypot(w, h) : 1;
  const d = distancesOf(input, first, second, id);
  // measureChange gives the share that moved. The anchor is not an other item, so its input loses the anchor.
  const others: PackInput = { ...input, items: input.items.filter((i) => i.id !== id) };
  const moved = measureChange(others, first, others, second)["pack.stability.moved"];

  const gains: number[] = [];
  for (let k = 1; k <= steps; k++) gains.push(Math.max(0, ...distancesOf(input, outputs[k - 1]!, outputs[k]!, id)) / length);
  const gain = Math.max(...gains);
  return {
    measures: {
      "pack.anchor.mean": d.length === 0 ? 0 : d.reduce((s, x) => s + x, 0) / d.length / diagonal,
      "pack.anchor.max": Math.max(0, ...d) / diagonal,
      "pack.anchor.moved": moved,
      "pack.anchor.gain": gain,
      "pack.anchor.settled": gain <= limit + RECORD_EPS / length ? 1 : 0,
    },
    gains,
  };
}

/**
 * This function gives the step of the bench for an anchor: a move along the wall that the anchor touches.
 *
 * - An anchor on the top or the bottom wall, or on no wall, moves in `x`. An anchor on only a side wall moves in `y`.
 * - The length is 1% of the width of the container, rounded, and 1 or more. A container without a width uses the output width.
 * - The step goes to the right or down. It goes to the left or up when `steps` steps go out of a fixed side.
 *
 * It throws a `RangeError` for an id that `isAnchor` refuses.
 */
export function anchorStep(input: PackInput, output: PackOutput, id: string, steps: number = ANCHOR_STEPS): AnchorStep {
  if (!isAnchor(input, id)) throw new RangeError(`"${id}" is not a locked item with a position or a fixed rectangle obstacle of the input.`);
  const item = input.items.find((i) => i.id === id);
  const region = (input.obstacles ?? []).find((o) => o.id === id)?.region;
  const box = item !== undefined ? { x: item.x!, y: item.y!, w: item.w, h: item.h } : region !== undefined && region.kind === "rect" ? region : { x: 0, y: 0, w: 0, h: 0 };
  const c = input.container;
  const width = c.w ?? output.size.w;
  const length = Math.max(1, Math.round(width / 100));
  const fixedW = c.fixed === "size" || c.fixed === "width" ? c.w : undefined;
  const fixedH = c.fixed === "size" || c.fixed === "height" ? c.h : undefined;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= RECORD_EPS;
  const onTopOrBottom = near(box.y, 0) || (fixedH !== undefined && near(box.y + box.h, fixedH));
  const onSide = near(box.x, 0) || (fixedW !== undefined && near(box.x + box.w, fixedW));
  if (onSide && !onTopOrBottom) {
    const down = fixedH === undefined || box.y + box.h + steps * length <= fixedH;
    return { dx: 0, dy: down ? length : -length };
  }
  const right = fixedW === undefined || box.x + box.w + steps * length <= fixedW;
  return { dx: right ? length : -length, dy: 0 };
}
