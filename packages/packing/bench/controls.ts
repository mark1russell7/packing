// The adversary controls of the bench. `docs/BENCH.md` ("The controls of a measure") tells why each control exists.
// A control is a packer made to win one measure with a trick. It exists only to test that measure, so it stays out of
// `ENTRIES`, out of the registry, out of the picker and out of the sites. The value `all` of a run does not include it.

import { createContext, marginOf, packWith, strategy, turnItem, type Dimension, type DimensionValue, type PackContext, type PackInput, type PackOutput, type Strategy, type Supports } from "../src/index.ts";
import { containerBounds, extentOf } from "../src/frame.ts";
import { supportsOf } from "../src/layout-strategy.ts";
import { fillOf } from "../src/measures.ts";
import { hardBreaks } from "../src/select-key.ts";
import { entry, type BenchEntry } from "./entries.ts";

/** The id of the control of `pack.fill`. */
export const FILL_TRICK = "fill-trick";

/** The count of the widths that `fill-trick` tries with each member. */
export const FILL_TRICK_WIDTHS = 12;

/** The members of `fill-trick`: each one is a real strategy of the registry, with its options. */
export const FILL_TRICK_MEMBERS: readonly { readonly id: string; readonly options: Readonly<Record<string, unknown>> }[] = Object.freeze([
  { id: "maxrects", options: { rule: "bl" } },
  { id: "skyline", options: {} },
]);

/** This function gives the values of a dimension that all members support. */
function shared<D extends Dimension>(dimension: D): DimensionValue<D>[] {
  const lists = FILL_TRICK_MEMBERS.map((m) => strategy(m.id).supports[dimension] as DimensionValue<D>[]);
  return lists[0]!.filter((value) => lists.every((list) => list.includes(value)));
}

/** This function gives the cells that each member of `fill-trick` supports. */
function sharedSupports(): Supports {
  const dimensions = Object.keys(strategy(FILL_TRICK_MEMBERS[0]!.id).supports) as Dimension[];
  return Object.fromEntries(dimensions.map((d) => [d, shared(d)])) as unknown as Supports;
}

/**
 * This function gives the widths that `fill-trick` tries. They rise by one factor, from the widest item to the upper limit.
 *
 * - The upper limit is the width of the container when the width is fixed, else the sum of the item widths.
 * - The list has no repeated width, so a narrow range gives fewer widths.
 */
export function fillTrickWidths(input: PackInput): number[] {
  const c = input.container;
  const inset = c.inset ?? 0;
  let widest = 0;
  let total = 0;
  for (const item of input.items) {
    const m = marginOf(item);
    const w = item.w + m.left + m.right + (input.gap ?? 0);
    widest = Math.max(widest, w);
    total += w;
  }
  const low = Math.ceil(widest + 2 * inset);
  const fixedWidth = c.fixed === "size" || c.fixed === "width" ? c.w : undefined;
  const high = fixedWidth ?? total + 2 * inset;
  if (!(low > 0) || !(high > low)) return [];
  const widths = new Set<number>();
  for (let i = 0; i < FILL_TRICK_WIDTHS; i++) widths.add(Math.round(low * (high / low) ** (i / (FILL_TRICK_WIDTHS - 1))));
  return [...widths];
}

/** This function gives an output at a tried width the size of the input. A fixed side stays, and a free width reads the far edge of the content. */
function sizedFor(input: PackInput, output: PackOutput): PackOutput {
  const c = input.container;
  const freeWidth = c.fixed === "none" || c.fixed === "height";
  const w = freeWidth ? extentOf(input, output.placements, output.moved, containerBounds(input), c.inset ?? 0, turnItem).right : (c.w ?? output.size.w);
  const h = c.fixed === "size" || c.fixed === "height" ? (c.h ?? output.size.h) : output.size.h;
  return { ...output, size: { w, h } };
}

/** The output that `fill-trick` keeps, with the member and the width that gave it. */
export interface FillTrickChoice {
  readonly output: PackOutput;
  /** The id of the member that gave the output. */
  readonly member: string;
  /** The width that the member packed at. `null` is the container of the input, with no tried width. */
  readonly width: number | null;
}

/**
 * This function gives the choice of `fill-trick` on an input.
 *
 * - It packs with each member on the input, then at each width of `fillTrickWidths`.
 * - It keeps the output with the highest `pack.fill`, from the outputs with no hard break and no more overflow than the first output.
 * - The overflow limit stops the trick from dropping items. A dropped item is a different trick, and another measure sees it.
 * - A container with a shape gets only the outputs of the members on the input.
 * - When each output has a hard break, it gives the first member on the input.
 */
export function fillTrickChoice(input: PackInput, seed: number): FillTrickChoice {
  const firsts: FillTrickChoice[] = FILL_TRICK_MEMBERS.map((m) => ({ output: packWith(m.id, input, m.options, seed), member: m.id, width: null }));
  const overflow = Math.min(...firsts.map((c) => c.output.overflow.length));
  const clean = (o: PackOutput): boolean => hardBreaks(input, o) === 0 && o.overflow.length <= overflow;
  const tried: FillTrickChoice[] = input.container.shape !== undefined
    ? []
    : fillTrickWidths(input).flatMap((w) => {
        const at: PackInput = { ...input, container: { ...input.container, fixed: "width", w } };
        return FILL_TRICK_MEMBERS.map((m) => ({ output: sizedFor(input, packWith(m.id, at, m.options, seed)), member: m.id, width: w }));
      });
  let best: FillTrickChoice | undefined;
  let bestFill = -Infinity;
  for (const choice of [...firsts, ...tried]) {
    if (!clean(choice.output)) continue;
    const fill = fillOf(input, choice.output);
    if (fill > bestFill) {
      best = choice;
      bestFill = fill;
    }
  }
  return best ?? firsts[0]!;
}

/** The control of `pack.fill`. It ignores the order of the items and the target aspect. `fillTrickChoice` tells how it chooses. */
export const fillTrick: Strategy<Record<string, never>> = {
  id: FILL_TRICK,
  family: "control",
  catalog: [],
  supports: sharedSupports(),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, _options: Record<string, never>, context: PackContext): PackOutput {
    return fillTrickChoice(input, context.seed).output;
  },
};

/** The id of the control of `pack.stability.moved`. */
export const KEEP_SHELF = "keep-shelf";

/** This function tells if two boxes overlap. Boxes that only touch do not overlap. */
const clash = (a: Placed, b: Placed): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A box of `keep-shelf`, with its place and its sides. */
interface Placed {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The control `keep-shelf` buys stability: it moves a box only when the box cannot stay.
 *
 * - Each box with a place in `previous` stays there when it fits in the width and overlaps no box that stayed.
 * - Each other box goes on rows below all the boxes. So the holes of removed boxes stay empty, and `pack.fill` is the measure that this control loses.
 * - The control reads no gap, no margin and no obstacle, because the chains have none. It supports only a free height.
 */
export const keepShelf: Strategy<Record<string, never>> = {
  id: KEEP_SHELF,
  family: "control",
  catalog: [],
  supports: supportsOf({
    containerSize: ["freeHeight"],
    containerShape: ["rect"],
    obstacleMove: ["fixed", "free"],
    itemShape: ["rect"],
    rotation: ["none"],
    order: ["free", "soft"],
    groups: ["none"],
    mode: ["incremental"],
  }),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, _options: Record<string, never>, context: PackContext): PackOutput {
    const width = input.container.w!;
    const before = new Map((context.previous?.placements ?? []).map((p) => [p.id, p]));
    const placed: Placed[] = [];
    const rest: PackInput["items"][number][] = [];
    for (const item of input.items) {
      const old = before.get(item.id);
      const spot = old === undefined ? undefined : { id: item.id, x: old.x, y: old.y, w: item.w, h: item.h };
      if (spot !== undefined && spot.x + spot.w <= width && !placed.some((other) => clash(spot, other))) placed.push(spot);
      else rest.push(item);
    }
    let y = placed.reduce((bottom, p) => Math.max(bottom, p.y + p.h), 0);
    let x = 0;
    let row = 0;
    for (const item of rest) {
      if (x > 0 && x + item.w > width) {
        y += row;
        x = 0;
        row = 0;
      }
      placed.push({ id: item.id, x, y, w: item.w, h: item.h });
      x += item.w;
      row = Math.max(row, item.h);
    }
    return {
      placements: placed.map(({ id, x: px, y: py }) => ({ id, x: px, y: py })),
      overflow: [],
      size: { w: width, h: y + row },
      moved: [],
    };
  },
};

/** The controls of the bench, by id. */
const CONTROLS: ReadonlyMap<string, Strategy> = new Map<string, Strategy>([
  [FILL_TRICK, fillTrick as Strategy],
  [KEEP_SHELF, keepShelf as Strategy],
]);

/** The entries of the controls. They are not in `ENTRIES`. */
export const CONTROL_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: FILL_TRICK, strategy: FILL_TRICK, options: {} },
  { id: KEEP_SHELF, strategy: KEEP_SHELF, options: {} },
]);

/** This function tells if an id is the id of a control. */
export function isControl(id: string): boolean {
  return CONTROLS.has(id);
}

/** This function gives the entry of an id: a control, else an entry of `ENTRIES`. It throws a `RangeError` for any other id. */
export function benchEntry(id: string): BenchEntry {
  return CONTROL_ENTRIES.find((e) => e.id === id) ?? entry(id);
}

/** This function gives the strategy of an id: a control, else a strategy of the registry. It throws a `RangeError` for any other id. */
export function benchStrategy(id: string): Strategy {
  return CONTROLS.get(id) ?? strategy(id);
}

/** This function packs as `packWith` does, and it also packs a control. The output `previous` goes to the context of the strategy. */
export function benchPack(id: string, input: PackInput, options?: unknown, seed = 0, previous?: PackOutput): PackOutput {
  const control = CONTROLS.get(id);
  if (control === undefined && previous === undefined) return packWith(id, input, options, seed);
  const s = control ?? strategy(id);
  return s.pack(input, { ...(s.defaults as object), ...(options as object | undefined) }, createContext(seed, previous === undefined ? {} : { previous }));
}
