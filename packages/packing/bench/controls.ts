// The adversary controls of the bench. `docs/BENCH.md` ("The controls of a measure") tells why each control exists.
// A control is a packer made to win one measure with a trick. It exists only to test that measure, so it stays out of
// `ENTRIES`, out of the registry, out of the picker and out of the sites. The value `all` of a run does not include it.

import { createContext, marginOf, packWith, strategy, turnItem, type Dimension, type DimensionValue, type PackContext, type PackInput, type PackOutput, type Strategy, type Supports } from "../src/index.ts";
import { containerBounds, extentOf } from "../src/frame.ts";
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

/**
 * The control of `pack.fill`. It ignores the order of the items and the target aspect.
 *
 * - It packs with each member on the input, then at each width of `fillTrickWidths`.
 * - It keeps the output with the highest `pack.fill`, from the outputs with no hard break and no more overflow than the first output.
 * - The overflow limit stops the trick from dropping items. A dropped item is a different trick, and another measure sees it.
 * - A container with a shape gets only the outputs of the members on the input.
 */
export const fillTrick: Strategy<Record<string, never>> = {
  id: FILL_TRICK,
  family: "control",
  catalog: [],
  supports: sharedSupports(),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, _options: Record<string, never>, context: PackContext): PackOutput {
    const firsts = FILL_TRICK_MEMBERS.map((m) => packWith(m.id, input, m.options, context.seed));
    const first = firsts[0]!;
    const overflow = Math.min(...firsts.map((o) => o.overflow.length));
    const clean = (o: PackOutput): boolean => hardBreaks(input, o) === 0 && o.overflow.length <= overflow;
    const tried = input.container.shape !== undefined
      ? []
      : fillTrickWidths(input).flatMap((w) => {
          const at: PackInput = { ...input, container: { ...input.container, fixed: "width", w } };
          return FILL_TRICK_MEMBERS.map((m) => sizedFor(input, packWith(m.id, at, m.options, context.seed)));
        });
    let best: PackOutput | undefined;
    let bestFill = -Infinity;
    for (const output of [...firsts, ...tried]) {
      if (!clean(output)) continue;
      const fill = fillOf(input, output);
      if (fill > bestFill) {
        best = output;
        bestFill = fill;
      }
    }
    return best ?? first;
  },
};

/** The controls of the bench, by id. */
const CONTROLS: ReadonlyMap<string, Strategy> = new Map<string, Strategy>([[FILL_TRICK, fillTrick as Strategy]]);

/** The entries of the controls. They are not in `ENTRIES`. */
export const CONTROL_ENTRIES: readonly BenchEntry[] = Object.freeze([{ id: FILL_TRICK, strategy: FILL_TRICK, options: {} }]);

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

/** This function packs as `packWith` does, and it also packs a control. */
export function benchPack(id: string, input: PackInput, options?: unknown, seed = 0): PackOutput {
  const control = CONTROLS.get(id);
  if (control === undefined) return packWith(id, input, options, seed);
  return control.pack(input, { ...(control.defaults as object), ...(options as object | undefined) }, createContext(seed));
}
