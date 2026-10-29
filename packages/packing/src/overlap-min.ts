// The strategy `overlap-min` of roadmap item k80 (`docs/PACKER.md`, "The overlap minimization", idea R6 of the survey).
// It packs an input with one member, then makes the free side of the strip shorter. After each cut, a local search
// moves one item at a time to its place of least overlap, with guided penalties. Nothing default uses it.

import { stepRandom } from "@mark1russell7/layout-contract";
import { guillotine, maxrects, rows, shelf, skyline } from "./adapters.ts";
import { checkHard } from "./check.ts";
import { EPS, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { boundsOf, containerBounds, extentOf, pairPads } from "./frame.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The id of the trace stage of `overlap-min`. */
export const OVERLAP_MIN_STAGE = "overlap-min";

/** The options of the strategy `overlap-min` */
export interface OverlapMinStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The largest count of the item moves. One move is a move along the fixed axis, then along the free axis. The default is 8192. */
  iterations?: number;
  /** The share by which one cut makes the strip shorter, from 0.001 to 0.5. The default is 0.01. */
  step?: number;
}

/** The default member of `overlap-min`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** An overlap on one axis of this length or less is a touch, not an overlap. The value is `EPS` of the contract. */
const TOUCH = EPS;

/**
 * This function gives the supports of `overlap-min`: the union of the supports of the strategies that pack around locked items.
 * The container has one free side. The obstacles and the locked items stay fixed. The order is only `free` or `soft`.
 */
function overlapSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, maxrects, guillotine] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  out["containerSize"] = ["freeHeight", "freeWidth"];
  out["obstacleMove"] = ["fixed"];
  out["order"] = ["free", "soft"];
  return out as unknown as Supports;
}

/** This function checks the options of `overlap-min`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function checked(options: OverlapMinStrategyOptions): PortfolioEntry {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  strategy(member.strategy);
  const { iterations, step } = options;
  if (iterations !== undefined && !(Number.isInteger(iterations) && iterations >= 0)) throw new RangeError(`The option iterations of overlap-min is a whole number of 0 or more, not ${String(iterations)}.`);
  if (step !== undefined && !(step >= 0.001 && step <= 0.5)) throw new RangeError(`The option step of overlap-min is a number from 0.001 to 0.5, not ${String(step)}.`);
  return member;
}

/** This function gives the overlap of two spans on one axis. A touch or an overlap of `TOUCH` or less gives 0. */
function spanOverlap(a: number, sa: number, b: number, sb: number): number {
  const d = Math.min(a + sa, b + sb) - Math.max(a, b);
  return d > TOUCH ? d : 0;
}

/** This function tells if a value is lower than a reference by more than the float noise. */
const lower = (value: number, reference: number): boolean => value < reference - 1e-9 * Math.max(1, Math.abs(reference));

/** The counts of one search, for the trace. */
interface Counts {
  moves: number;
  tries: number;
  cuts: number;
  raises: number;
}

/**
 * The strategy `overlap-min`: the strip packing by overlap minimization (catalog row `nest-gls-overlap`, Egeblad 2007,
 * Umetani 2009 and Imamichi 2009). `docs/PACKER.md` tells the method and the choices of this project.
 *
 * - The start is the layout of the member. The length of the strip is the far edge of the items on the free side.
 * - A cut makes the strip shorter by `step`. Each item out of the strip moves back in. Then the items can overlap.
 * - A move puts one overlapped item at its place of least weighted overlap along the fixed axis, then along the free axis.
 * - The overlap is linear in parts along one axis. The move reads its value at each break point of the parts.
 * - At a local minimum, the pair with the largest overlap divided by 1 plus its penalty gets 1 more penalty.
 * - With no overlap, the search keeps the strip and cuts again. After `iterations` moves, the output is the last strip with no overlap.
 * - The container has a free height or a free width. Another container size gives `UnsupportedCell`.
 * - The cut `k` gets the random numbers `stepRandom(seed, "overlap-min:<k>")` of the contract. The strategy reads no clock.
 * - The output gets the trace stage `overlap-min` with `move.overlapMin` and the counts of the search.
 */
export const overlapMinStrategy: Strategy<OverlapMinStrategyOptions> = {
  id: "overlap-min",
  family: "overlap-min",
  catalog: ["nest-gls-overlap"],
  supports: overlapSupports(),
  defaults: { iterations: 8192, step: 0.01 },
  deterministic: true,
  pack(input: PackInput, options: OverlapMinStrategyOptions, context: PackContext): PackOutput {
    assertSupported(overlapMinStrategy.supports, input);
    const member = checked(options);
    const iterations = options.iterations ?? 8192;
    const step = options.step ?? 0.01;
    const base = packWith(member.strategy, input, member.options, context.seed);
    const strip = new Strip(input, base);
    const counts: Counts = { moves: 0, tries: 0, cuts: 0, raises: 0 };
    const output = strip.search(iterations, step, context.seed, counts);
    const measures = {
      "move.overlapMin": counts.cuts,
      "overlap-min.iterations": counts.moves,
      "overlap-min.tries": counts.tries,
      "overlap-min.cuts": counts.cuts,
      "overlap-min.raises": counts.raises,
      "overlap-min.length": strip.ratio(),
    };
    const stage = { id: OVERLAP_MIN_STAGE, measures };
    if (output === undefined) return { ...base, trace: [...(base.trace ?? []), stage] };
    return { ...output, trace: [stage] };
  },
};

/**
 * The state of one search of `overlap-min` on one input. The boxes are the rectangles of the frame: each item grows by its
 * margin and by half the gap, and by its pad of `pairPads`. The axis `a` is the fixed axis, and the axis `b` is the free axis.
 */
class Strip {
  private readonly input: PackInput;
  private readonly base: PackOutput;
  /** The value `true` when the free side is the width. Then `a` is y and `b` is x. */
  private readonly swap: boolean;
  /** The size of the frame on the fixed axis */
  private readonly span: number;
  /** The corner of the frame in the coordinates of the container */
  private readonly ox: number;
  private readonly oy: number;
  /** The count of the boxes that move. They come first. The fixed boxes follow them. */
  private readonly n: number;
  private readonly count: number;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly sa: Float64Array;
  private readonly sb: Float64Array;
  /** The placement of the member and the offsets from the corner of the box to the item, for each box that moves */
  private readonly start: Placement[] = [];
  private readonly dx: number[] = [];
  private readonly dy: number[] = [];
  /** The least length of the strip: the longest box that moves, and the far edges of the fixed boxes */
  private readonly floor: number;
  /** The penalty of each pair of boxes, by `pairIndex` */
  private readonly penalty = new Map<number, number>();
  /** The length of the member layout and the length of the last layout with no overlap */
  private readonly first: number;
  private best: number;
  /** The value `false` when the member layout has an overlap in the frame. Then the search does not start. */
  private readonly clean: boolean;

  constructor(input: PackInput, base: PackOutput) {
    this.input = input;
    this.base = base;
    this.swap = input.container.fixed === "height";
    const bounds = containerBounds(input);
    const inset = input.container.inset ?? 0;
    const half = (input.gap ?? 0) / 2;
    const pads = pairPads(input);
    this.ox = bounds.x + inset - half;
    this.oy = bounds.y + inset - half;
    this.span = (this.swap ? bounds.h : bounds.w) - 2 * inset + 2 * half;
    const items = new Map(input.items.map((i) => [i.id, i]));
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const fixed: typeof boxes = [];
    const box = (item: Item, x: number, y: number): { x: number; y: number; w: number; h: number; ddx: number; ddy: number } => {
      const m = marginOf(item);
      const pad = half + (pads?.get(item.id) ?? 0);
      const ddx = m.left + pad;
      const ddy = m.top + pad;
      return { x: x - ddx - this.ox, y: y - ddy - this.oy, w: item.w + m.left + m.right + 2 * pad, h: item.h + m.top + m.bottom + 2 * pad, ddx, ddy };
    };
    const isFixed = (item: Item): boolean => item.locked === true && item.x !== undefined && item.y !== undefined;
    for (const item of input.items) if (isFixed(item)) fixed.push(box(item, item.x!, item.y!));
    for (const p of base.placements) {
      const given = items.get(p.id);
      if (given === undefined || isFixed(given)) continue;
      const b = box(p.turn === 90 ? turnItem(given) : given, p.x, p.y);
      boxes.push(b);
      this.start.push(p);
      this.dx.push(b.ddx);
      this.dy.push(b.ddy);
    }
    const regions = [...(input.obstacles ?? []).map((o) => o.region)];
    const shape = input.container.shape;
    if (shape?.kind === "polygon") for (const ring of shape.holes ?? []) regions.push({ kind: "polygon", points: ring });
    for (const region of regions) {
      const r = boundsOf(region);
      fixed.push({ x: r.x - half - this.ox, y: r.y - half - this.oy, w: r.w + 2 * half, h: r.h + 2 * half });
    }
    this.n = boxes.length;
    this.count = boxes.length + fixed.length;
    this.a = new Float64Array(this.count);
    this.b = new Float64Array(this.count);
    this.sa = new Float64Array(this.count);
    this.sb = new Float64Array(this.count);
    for (const [i, r] of [...boxes, ...fixed].entries()) {
      this.a[i] = this.swap ? r.y : r.x;
      this.b[i] = this.swap ? r.x : r.y;
      this.sa[i] = this.swap ? r.h : r.w;
      this.sb[i] = this.swap ? r.w : r.h;
    }
    let floor = 0;
    for (let i = 0; i < this.count; i++) floor = Math.max(floor, i < this.n ? this.sb[i]! : this.b[i]! + this.sb[i]!);
    this.floor = floor;
    this.first = this.length();
    this.best = this.first;
    let clean = true;
    for (let i = 0; i < this.n && clean; i++) {
      if (this.a[i]! < -TOUCH || this.a[i]! + this.sa[i]! > this.span + TOUCH || this.b[i]! < -TOUCH) clean = false;
      else if (this.overlapOf(i) > 0) clean = false;
    }
    this.clean = clean;
  }

  /** This function gives the length of the strip: the far edge of the boxes that move on the free axis. */
  private length(): number {
    let l = 0;
    for (let i = 0; i < this.n; i++) l = Math.max(l, this.b[i]! + this.sb[i]!);
    return l;
  }

  /** This function gives the length of the last layout with no overlap divided by the length of the member layout. */
  ratio(): number {
    return this.first > 0 ? this.best / this.first : 1;
  }

  /** This function gives the index of a pair of boxes, with the same index for each order. */
  private pairIndex(i: number, j: number): number {
    return i < j ? i * this.count + j : j * this.count + i;
  }

  /** This function gives the overlap area of two boxes. */
  private area(i: number, j: number): number {
    const da = spanOverlap(this.a[i]!, this.sa[i]!, this.a[j]!, this.sa[j]!);
    return da === 0 ? 0 : da * spanOverlap(this.b[i]!, this.sb[i]!, this.b[j]!, this.sb[j]!);
  }

  /** This function gives the sum of the overlap areas of one box that moves with each other box. */
  private overlapOf(i: number): number {
    let sum = 0;
    for (let j = 0; j < this.count; j++) if (j !== i) sum += this.area(i, j);
    return sum;
  }

  /**
   * This function moves box `i` along one axis to the place of least weighted overlap, in the range from 0 to `limit`.
   * The weight of a pair is 1 plus its penalty. The weighted overlap is linear between the break points.
   * Thus the least value is at a break point or at an end of the range. A tie keeps the box, then takes the lowest place.
   * The function gives `true` when the box moved.
   */
  private move(i: number, alongA: boolean, limit: number): boolean {
    const pos = alongA ? this.a : this.b;
    const size = alongA ? this.sa : this.sb;
    const other = alongA ? this.b : this.a;
    const otherSize = alongA ? this.sb : this.sa;
    const s = size[i]!;
    const hi = limit - s;
    if (hi < 0) return false;
    const js: number[] = [];
    const ws: number[] = [];
    for (let j = 0; j < this.count; j++) {
      if (j === i) continue;
      const d = spanOverlap(other[i]!, otherSize[i]!, other[j]!, otherSize[j]!);
      if (d === 0) continue;
      js.push(j);
      ws.push(d * (1 + (this.penalty.get(this.pairIndex(i, j)) ?? 0)));
    }
    if (js.length === 0) return false;
    const value = (x: number): number => {
      let sum = 0;
      for (let k = 0; k < js.length; k++) {
        const j = js[k]!;
        const d = spanOverlap(x, s, pos[j]!, size[j]!);
        if (d > 0) sum += ws[k]! * d;
      }
      return sum;
    };
    const current = value(pos[i]!);
    if (current === 0) return false;
    // The sweep: each other box changes the slope of the overlap at its 4 break points
    const events: [number, number][] = [];
    for (let k = 0; k < js.length; k++) {
      const p = pos[js[k]!]!;
      const q = size[js[k]!]!;
      const w = ws[k]!;
      const m = Math.min(s, q);
      events.push([p - s, w], [p - s + m, -w], [p + q - m, -w], [p + q, w]);
    }
    events.sort((x, y) => x[0] - y[0]);
    let slope = 0;
    let e = 0;
    for (; e < events.length && events[e]![0] <= 0; e++) slope += events[e]![1];
    let prev = 0;
    let run = value(0);
    let least = run;
    let at = 0;
    for (; e < events.length && events[e]![0] < hi; e++) {
      const [x, d] = events[e]!;
      run += slope * (x - prev);
      prev = x;
      slope += d;
      if (run < least) {
        least = run;
        at = x;
      }
    }
    if (hi > 0 && run + slope * (hi - prev) < least) at = hi;
    // The exact value at the chosen place decides the move
    if (at === pos[i] || !lower(value(at), current)) return false;
    pos[i] = at;
    return true;
  }

  /** This function raises the penalty of the overlapped pair with the largest overlap divided by 1 plus its penalty. */
  private raise(): void {
    let top = 0;
    let key = -1;
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.count; j++) {
        const area = this.area(i, j);
        if (area === 0) continue;
        const k = this.pairIndex(i, j);
        const utility = area / (1 + (this.penalty.get(k) ?? 0));
        if (utility > top) {
          top = utility;
          key = k;
        }
      }
    }
    if (key >= 0) this.penalty.set(key, (this.penalty.get(key) ?? 0) + 1);
  }

  /**
   * This function does one try at the length `limit`. It moves each box out of the strip back in. Then it moves the overlapped
   * boxes in random order until no overlap is left, or until the moves run out. It gives `true` when no overlap is left.
   */
  private attempt(limit: number, r: () => number, budget: number, counts: Counts): boolean {
    for (let i = 0; i < this.n; i++) if (this.b[i]! + this.sb[i]! > limit) this.b[i] = Math.max(0, limit - this.sb[i]!);
    this.penalty.clear();
    // The count of the overlapped partners of each box. A move changes only the pairs of the box that moved.
    const partners = new Int32Array(this.count);
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.count; j++) {
        if (this.area(i, j) === 0) continue;
        partners[i]!++;
        partners[j]!++;
      }
    }
    for (;;) {
      const open: number[] = [];
      for (let i = 0; i < this.n; i++) if (partners[i]! > 0) open.push(i);
      if (open.length === 0) return true;
      for (let i = open.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [open[i], open[j]] = [open[j]!, open[i]!];
      }
      let moved = false;
      for (const i of open) {
        if (counts.moves >= budget) return false;
        if (partners[i] === 0) continue;
        counts.moves++;
        const before: number[] = [];
        for (let j = 0; j < this.count; j++) if (j !== i && this.area(i, j) > 0) before.push(j);
        const movedA = this.move(i, true, this.span);
        const movedB = this.move(i, false, limit);
        if (!movedA && !movedB) continue;
        moved = true;
        for (const j of before) partners[j]!--;
        partners[i] = 0;
        for (let j = 0; j < this.count; j++) {
          if (j === i || this.area(i, j) === 0) continue;
          partners[i]!++;
          partners[j]!++;
        }
      }
      if (!moved) {
        this.raise();
        counts.raises++;
      }
    }
  }

  /** This function gives the output of the current boxes. A box at its start place keeps the placement of the member. */
  private output(begin: { a: Float64Array; b: Float64Array }): PackOutput {
    const at = new Map<string, Placement>();
    for (let i = 0; i < this.n; i++) {
      const p = this.start[i]!;
      if (this.a[i] === begin.a[i] && this.b[i] === begin.b[i]) continue;
      const fx = this.swap ? this.b[i]! : this.a[i]!;
      const fy = this.swap ? this.a[i]! : this.b[i]!;
      at.set(p.id, { ...p, x: fx + this.dx[i]! + this.ox, y: fy + this.dy[i]! + this.oy });
    }
    const placements = this.base.placements.map((p) => at.get(p.id) ?? p);
    const bounds = containerBounds(this.input);
    const { right, bottom } = extentOf(this.input, placements, [], bounds, this.input.container.inset ?? 0, turnItem);
    const size = { w: Number.isFinite(bounds.w) ? bounds.w : right, h: Number.isFinite(bounds.h) ? bounds.h : bottom };
    return { placements, overflow: [...this.base.overflow], size, moved: [] };
  }

  /** This function tells if an output has no break of the 4 hard rules. */
  private sound(output: PackOutput): boolean {
    return Object.values(checkHard(this.input, output)).every((v) => v === 0);
  }

  /**
   * This function does the search. Each try cuts the strip by `step`. A try with no overlap left becomes the new strip.
   * The search stops when the moves run out or when a try fails. It also stops when the next strip is too small for the box area.
   * It gives the output of the last strip with no overlap, or `undefined` when no cut succeeded.
   */
  search(iterations: number, step: number, seed: number, counts: Counts): PackOutput | undefined {
    if (!this.clean || this.n === 0) return undefined;
    const begin = { a: this.a.slice(), b: this.b.slice() };
    let area = 0;
    for (let i = 0; i < this.n; i++) area += this.sa[i]! * this.sb[i]!;
    let output: PackOutput | undefined;
    let length = this.first;
    while (counts.moves < iterations) {
      const limit = Math.max(length * (1 - step), this.floor);
      if (!(limit < length - TOUCH) || area > this.span * limit * (1 + 1e-9)) break;
      counts.tries++;
      const r = stepRandom(seed, `overlap-min:${counts.tries}`);
      if (!this.attempt(limit, r, iterations, counts)) break;
      const candidate = this.output(begin);
      if (!this.sound(candidate)) break;
      counts.cuts++;
      output = candidate;
      length = this.length();
      this.best = length;
    }
    return output;
  }
}
