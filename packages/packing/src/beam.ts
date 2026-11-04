// The beam search of roadmap item k85 (docs/PACKER.md, "The beam search"): the expansion and the greedy ranking of Wen 2025, on a skyline.
// The strategy `beam` wraps the function, and no default uses it. Thus the space of the bench does not change.

import type { Item, PackInput, PackOutput, Placement } from "./contract.ts";
import { sleatorRefusal } from "./sleator.ts";

/** The default beam width of `beamStrip`. */
export const BEAM_WIDTH = 16;

/** The options of `beamStrip`. */
export interface BeamOptions {
  /** The count of the states that each level keeps, and the count of the children of a state. It is a whole number of 1 or more. The default is `BEAM_WIDTH`. */
  readonly width?: number;
}

/** The result of `beamStrip`. */
export interface BeamResult {
  /** The best layout of the search. Each item has a place, and each item keeps its turn. */
  readonly output: PackOutput;
  /** The height of `output`. */
  readonly height: number;
  /** The count of the greedy completions. The same input and width give the same count on each machine. */
  readonly completions: number;
}

/** A class of equal items. */
interface Kind {
  readonly w: number;
  readonly h: number;
  readonly items: readonly number[];
}

/** The envelope of a layout: the segment `i` starts at `xs[i]` at the height `ys[i]`, and it ends at the next segment. */
interface Sky {
  readonly xs: number[];
  readonly ys: number[];
}

/** One placement of a kind. */
interface Step {
  readonly parent: Step | null;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

/** A partial layout. */
interface State {
  readonly sky: Sky;
  readonly left: Int32Array;
  readonly steps: Step | null;
  readonly top: number;
  readonly count: number;
}

/** This function gives the kinds of the items, the largest area first. A tie goes to the wider kind, then to the input order. */
function kindsOf(items: readonly Item[]): Kind[] {
  const found = new Map<string, { w: number; h: number; items: number[] }>();
  items.forEach((item, index) => {
    const key = `${item.w},${item.h}`;
    const kind = found.get(key);
    if (kind === undefined) found.set(key, { w: item.w, h: item.h, items: [index] });
    else kind.items.push(index);
  });
  return [...found.values()].sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
}

/** This function gives the lower valley closest to the origin. A valley is lower than each neighbor. A tie goes to the lower valley. */
function nicheOf(sky: Sky): number {
  let best = -1;
  for (let i = 0; i < sky.xs.length; i++) {
    if ((sky.ys[i - 1] ?? Infinity) <= sky.ys[i]! || (sky.ys[i + 1] ?? Infinity) <= sky.ys[i]!) continue;
    const near = best < 0 ? -1 : sky.xs[i]! + sky.ys[i]! - sky.xs[best]! - sky.ys[best]!;
    if (near < 0 || (near === 0 && sky.ys[i]! < sky.ys[best]!)) best = i;
  }
  return best;
}

/** This function joins the segments `i` and `i + 1` when they have one height. */
function joinAt(sky: Sky, i: number): void {
  if (i < 0 || i + 1 >= sky.xs.length || sky.ys[i] !== sky.ys[i + 1]) return;
  sky.xs.splice(i + 1, 1);
  sky.ys.splice(i + 1, 1);
}

/** This function lifts the segment `i` to its lower neighbor. No item fits it, so the space below that height is waste. */
function raise(sky: Sky, i: number): void {
  sky.ys[i] = Math.min(sky.ys[i - 1] ?? Infinity, sky.ys[i + 1] ?? Infinity);
  joinAt(sky, i);
  joinAt(sky, i - 1);
}

/** This function puts a box of the size `w` by `h` at the left end of the segment `i`. */
function put(sky: Sky, i: number, end: number, w: number, h: number): void {
  const x = sky.xs[i]!;
  const y = sky.ys[i]!;
  sky.ys[i] = y + h;
  if (x + w < end) {
    sky.xs.splice(i + 1, 0, x + w);
    sky.ys.splice(i + 1, 0, y);
  } else {
    joinAt(sky, i);
  }
  joinAt(sky, i - 1);
}

/** This function gives the end of the segment `i`. */
const endOf = (sky: Sky, i: number, width: number): number => sky.xs[i + 1] ?? width;

/** This function gives the first kind after `from` with items left that fits the width `room`, or `-1`. */
function nextKind(kinds: readonly Kind[], left: Int32Array, room: number, from: number): number {
  for (let k = from; k < kinds.length; k++) if (left[k]! > 0 && kinds[k]!.w <= room) return k;
  return -1;
}

/** This function adds one item of the kind `k` to a mutable state. */
function apply(state: { sky: Sky; left: Int32Array; steps: Step | null; top: number }, kinds: readonly Kind[], k: number, i: number, width: number): void {
  const kind = kinds[k]!;
  const x = state.sky.xs[i]!;
  const y = state.sky.ys[i]!;
  put(state.sky, i, endOf(state.sky, i, width), kind.w, kind.h);
  state.left[k]!--;
  state.steps = { parent: state.steps, kind: k, x, y };
  state.top = Math.max(state.top, y + kind.h);
}

/** This function gives a copy of a state that a caller can change. */
const copyOf = (state: State): { sky: Sky; left: Int32Array; steps: Step | null; top: number; count: number } => ({
  sky: { xs: [...state.sky.xs], ys: [...state.sky.ys] },
  left: state.left.slice(),
  steps: state.steps,
  top: state.top,
  count: state.count,
});

/** This function gives the segment of the next item of a mutable state, after it lifts each segment that no item fits. */
function settle(sky: Sky, kinds: readonly Kind[], left: Int32Array, width: number): number {
  for (;;) {
    const i = nicheOf(sky);
    if (nextKind(kinds, left, endOf(sky, i, width) - sky.xs[i]!, 0) >= 0) return i;
    raise(sky, i);
  }
}

/** This function finishes a state with the largest item that fits each niche. */
function complete(start: State, kinds: readonly Kind[], width: number): { top: number; steps: Step | null } {
  const state = copyOf(start);
  for (let count = state.count; count > 0; count--) {
    const i = settle(state.sky, kinds, state.left, width);
    apply(state, kinds, nextKind(kinds, state.left, endOf(state.sky, i, width) - state.sky.xs[i]!, 0), i, width);
  }
  return { top: state.top, steps: state.steps };
}

/** This function gives the output of a chain of steps. The placements have the order of the items of the input. */
function outputOf(input: PackInput, kinds: readonly Kind[], last: Step | null, width: number, height: number): PackOutput {
  const next = kinds.map(() => 0);
  const places = new Map<number, Placement>();
  const steps: Step[] = [];
  for (let step = last; step !== null; step = step.parent) steps.push(step);
  for (const step of steps.reverse()) {
    const index = kinds[step.kind]!.items[next[step.kind]!++]!;
    places.set(index, { id: input.items[index]!.id, x: step.x, y: step.y });
  }
  return { placements: input.items.map((_, index) => places.get(index)!), overflow: [], size: { w: width, h: height }, moved: [] };
}

/**
 * This function packs a strip with a beam search. It throws a `RangeError` for an input that `sleatorRefusal` refuses, or for a width that is not a whole number of 1 or more.
 *
 * - A state is a partial layout with a skyline. Each level adds one item to each state.
 * - The valley of the skyline closest to the origin takes the next item. A valley that no item fits rises to its lower neighbor.
 * - A state has `width` children: the largest items that fit the segment. Wen 2025 has this order as the first term of its score.
 * - A greedy completion gives the height of each child. The level keeps the `width` lowest children, and a tie keeps the earlier child.
 * - The result is the lowest completion of the search. The completion of the first state is an upper limit of its height.
 *
 * The function has no turns, no blocks of paired boxes and no clock. The same input and width give the same layout on each machine.
 *
 * @example
 * ```ts
 * const { height, output } = beamStrip({ container: { fixed: "width", w: 10 }, items }, { width: 4 });
 * ```
 */
export function beamStrip(input: PackInput, options: BeamOptions = {}): BeamResult {
  const reason = sleatorRefusal(input);
  if (reason !== null) throw new RangeError(`beamStrip: ${reason}`);
  const beam = options.width ?? BEAM_WIDTH;
  if (!Number.isInteger(beam) || beam < 1) throw new RangeError("beamStrip: the width needs a whole number of 1 or more");
  const width = input.container.w!;
  const kinds = kindsOf(input.items);
  const root: State = { sky: { xs: [0], ys: [0] }, left: Int32Array.from(kinds, (k) => k.items.length), steps: null, top: 0, count: input.items.length };
  let best = complete(root, kinds, width);
  let completions = 1;

  let level: State[] = [root];
  for (let depth = input.items.length; depth > 0; depth--) {
    const children: { state: State; top: number }[] = [];
    for (const parent of level) {
      const base = copyOf(parent);
      const i = settle(base.sky, kinds, base.left, width);
      const room = endOf(base.sky, i, width) - base.sky.xs[i]!;
      let k = -1;
      for (let made = 0; made < beam; made++) {
        k = nextKind(kinds, base.left, room, k + 1);
        if (k < 0) break;
        const child = copyOf({ ...base });
        apply(child, kinds, k, i, width);
        child.count--;
        const done = complete(child, kinds, width);
        completions++;
        if (done.top < best.top) best = done;
        children.push({ state: child, top: done.top });
      }
    }
    children.sort((a, b) => a.top - b.top);
    level = children.slice(0, beam).map((c) => c.state);
  }
  return { output: outputOf(input, kinds, best.steps, width, best.top), height: best.top, completions };
}
