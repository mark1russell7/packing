// The strategy `relax` of roadmap item k124 (`docs/PACKER.md`, "The relax pass", catalog row `overlap-vpsc`).
// It packs an input with one member, then spreads the slack of each fixed side evenly. The satisfy step of VPSC
// (Dwyer 2006) keeps the order of the boxes and removes each overlap. Nothing default uses it.

import { guillotine, maxrects, rows, shelf, skyline } from "./adapters.ts";
import { checkHard } from "./check.ts";
import { EPS, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { boundsOf, containerBounds, pairPads } from "./frame.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The id of the trace stage of `relax`. */
export const RELAX_STAGE = "relax";

/** The largest count of the separation constraints on one axis. On a larger input, `relax` gives the layout of the member. */
export const RELAX_MAX_CONSTRAINTS = 200_000;

/** The options of the strategy `relax` */
export interface RelaxStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The share of the move from the member layout to the target, from 0 to 1. The default is 1. With 0, the output is the member output. */
  strength?: number;
}

/** The default member of `relax`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** An overlap on one axis of this length or less is a touch, not an overlap. The value is `EPS` of the contract. */
const TOUCH = EPS;

/**
 * This function gives the supports of `relax`: the union of the supports of the members. The container is a rectangle.
 * The obstacles and the locked items stay fixed. The order is only `free` or `soft`.
 */
function relaxSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, maxrects, guillotine] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  out["containerSize"] = ["fixed", "freeHeight", "freeWidth"];
  out["containerShape"] = ["rect"];
  out["obstacleMove"] = ["fixed"];
  out["order"] = ["free", "soft"];
  return out as unknown as Supports;
}

/** This function checks the options of `relax`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function checked(options: RelaxStrategyOptions): PortfolioEntry {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  strategy(member.strategy);
  const { strength } = options;
  if (strength !== undefined && !(strength >= 0 && strength <= 1)) throw new RangeError(`The option strength of relax is a number from 0 to 1, not ${String(strength)}.`);
  return member;
}

/** One separation constraint on one axis: the position of `right` is the position of `left` plus `gap` or more. */
interface Constraint {
  readonly left: number;
  readonly right: number;
  readonly gap: number;
}

/** A block of VPSC: variables that active constraints join. Each variable has an offset from the position of the block. */
interface Block {
  vars: number[];
  /** The sum of the weights, and the sum of the weight times the target less the offset */
  weight: number;
  weighted: number;
  /** The position of the block when it holds a fixed variable, or `undefined` */
  fixed: number | undefined;
}

/**
 * This function solves one axis by the satisfy step of VPSC. The variables in `order` come in an order that the
 * constraints keep. A variable with `fixed` true stays at its target. The function gives the positions, or
 * `undefined` when two fixed variables meet in one block.
 */
function satisfy(targets: Float64Array, fixed: Uint8Array, constraints: readonly Constraint[], order: readonly number[]): Float64Array | undefined {
  const count = targets.length;
  const offset = new Float64Array(count);
  const blockOf: Block[] = [];
  const incoming: Constraint[][] = Array.from({ length: count }, () => []);
  for (const c of constraints) incoming[c.right]!.push(c);
  for (let i = 0; i < count; i++) blockOf[i] = { vars: [i], weight: 1, weighted: targets[i]!, fixed: fixed[i] === 1 ? targets[i]! : undefined };
  const posn = (b: Block): number => b.fixed ?? b.weighted / b.weight;
  const at = (v: number): number => posn(blockOf[v]!) + offset[v]!;
  for (const v of order) {
    let b = blockOf[v]!;
    for (;;) {
      let worst: Constraint | undefined;
      let most = 1e-9;
      for (const u of b.vars) {
        for (const c of incoming[u]!) {
          if (blockOf[c.left] === b) continue;
          const violation = at(c.left) + c.gap - at(c.right);
          if (violation > most) {
            most = violation;
            worst = c;
          }
        }
      }
      if (worst === undefined) break;
      const left = blockOf[worst.left]!;
      if (left.fixed !== undefined && b.fixed !== undefined) return undefined;
      // The variables of b move into the block on the left, so the constraint becomes tight.
      const shift = offset[worst.left]! + worst.gap - offset[worst.right]!;
      const fixedAt = left.fixed ?? (b.fixed === undefined ? undefined : b.fixed - shift);
      for (const u of b.vars) {
        offset[u] = offset[u]! + shift;
        left.vars.push(u);
        blockOf[u] = left;
      }
      left.weight = 0;
      left.weighted = 0;
      for (const u of left.vars) {
        left.weight += 1;
        left.weighted += targets[u]! - offset[u]!;
      }
      left.fixed = fixedAt;
      b = left;
    }
  }
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) out[i] = at(i);
  return out;
}

/** The boxes of one input in the frame of the container: the moving boxes first, then the fixed boxes. */
class Boxes {
  /** The position and the size of each box on each axis: index 0 is x, index 1 is y. */
  readonly pos: [Float64Array, Float64Array];
  readonly size: [Float64Array, Float64Array];
  /** The corner of the frame and the size of the frame on each axis. A free side has the size `Infinity`. */
  readonly origin: [number, number];
  readonly span: [number, number];
  /** The count of the moving boxes, the placement of each one, and the offsets from the corner of each box to its item */
  readonly n: number;
  readonly placements: Placement[] = [];
  readonly offsets: [number[], number[]] = [[], []];

  constructor(input: PackInput, base: PackOutput) {
    const bounds = containerBounds(input);
    const inset = input.container.inset ?? 0;
    const half = (input.gap ?? 0) / 2;
    const pads = pairPads(input);
    this.origin = [bounds.x + inset - half, bounds.y + inset - half];
    this.span = [bounds.w - 2 * inset + 2 * half, bounds.h - 2 * inset + 2 * half];
    const items = new Map(input.items.map((i) => [i.id, i]));
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const fixedRects: typeof rects = [];
    const isFixed = (item: Item): boolean => item.locked === true && item.x !== undefined && item.y !== undefined;
    const box = (item: Item, x: number, y: number): { x: number; y: number; w: number; h: number; dx: number; dy: number } => {
      const m = marginOf(item);
      const pad = half + (pads?.get(item.id) ?? 0);
      const dx = m.left + pad;
      const dy = m.top + pad;
      return { x: x - dx - this.origin[0], y: y - dy - this.origin[1], w: item.w + m.left + m.right + 2 * pad, h: item.h + m.top + m.bottom + 2 * pad, dx, dy };
    };
    for (const item of input.items) if (isFixed(item)) fixedRects.push(box(item, item.x!, item.y!));
    for (const p of base.placements) {
      const given = items.get(p.id);
      if (given === undefined || isFixed(given)) continue;
      const b = box(p.turn === 90 ? turnItem(given) : given, p.x, p.y);
      rects.push(b);
      this.placements.push(p);
      this.offsets[0].push(b.dx);
      this.offsets[1].push(b.dy);
    }
    for (const o of input.obstacles ?? []) {
      const r = boundsOf(o.region);
      fixedRects.push({ x: r.x - half - this.origin[0], y: r.y - half - this.origin[1], w: r.w + 2 * half, h: r.h + 2 * half });
    }
    this.n = rects.length;
    const all = [...rects, ...fixedRects];
    this.pos = [Float64Array.from(all, (r) => r.x), Float64Array.from(all, (r) => r.y)];
    this.size = [Float64Array.from(all, (r) => r.w), Float64Array.from(all, (r) => r.h)];
  }

  /** This function gives the overlap of two boxes on one axis. A touch gives 0 or less. */
  overlap(axis: 0 | 1, i: number, j: number): number {
    const p = this.pos[axis];
    const s = this.size[axis];
    return Math.min(p[i]! + s[i]!, p[j]! + s[j]!) - Math.max(p[i]!, p[j]!);
  }

  /** This function tells if the moving boxes are in the frame and no two boxes overlap. */
  clean(): boolean {
    const count = this.pos[0].length;
    for (let i = 0; i < this.n; i++) {
      for (const axis of [0, 1] as const) {
        if (this.pos[axis][i]! < -TOUCH || this.pos[axis][i]! + this.size[axis][i]! > this.span[axis] + TOUCH) return false;
      }
      for (let j = i + 1; j < count; j++) if (this.overlap(0, i, j) > TOUCH && this.overlap(1, i, j) > TOUCH) return false;
    }
    return true;
  }

  /**
   * This function gives the target of each moving box on one axis. A linear map takes the extent of the moving boxes onto
   * the frame. A box keeps its share of the free play. The box at the near edge goes to 0, and the box at the far edge goes to the far wall.
   */
  targets(axis: 0 | 1, strength: number): Float64Array {
    const p = this.pos[axis];
    const s = this.size[axis];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < this.n; i++) {
      lo = Math.min(lo, p[i]!);
      hi = Math.max(hi, p[i]! + s[i]!);
    }
    const out = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const play = hi - lo - s[i]!;
      const share = play > TOUCH ? (p[i]! - lo) / play : 0.5;
      const target = share * (this.span[axis] - s[i]!);
      out[i] = p[i]! + strength * (target - p[i]!);
    }
    return out;
  }

  /**
   * This function moves the boxes on one axis to the positions nearest to the targets that keep the order. A pair of
   * boxes that overlap on the other axis keeps its order on this axis. The walls of the frame are fixed variables.
   * It gives the count of the constraints, or `undefined` when the solve fails.
   */
  relax(axis: 0 | 1, targets: Float64Array): number | undefined {
    const other = axis === 0 ? 1 : 0;
    const count = this.pos[axis].length;
    const p = this.pos[axis];
    const s = this.size[axis];
    const wallNear = count;
    const wallFar = count + 1;
    const goal = new Float64Array(count + 2);
    const fixed = new Uint8Array(count + 2);
    for (let i = 0; i < count; i++) {
      goal[i] = i < this.n ? targets[i]! : p[i]!;
      fixed[i] = i < this.n ? 0 : 1;
    }
    goal[wallNear] = 0;
    goal[wallFar] = this.span[axis];
    fixed[wallNear] = 1;
    fixed[wallFar] = 1;
    const constraints: Constraint[] = [];
    for (let i = 0; i < this.n; i++) {
      constraints.push({ left: wallNear, right: i, gap: 0 }, { left: i, right: wallFar, gap: s[i]! });
      for (let j = i + 1; j < count; j++) {
        if (this.overlap(other, i, j) <= TOUCH) continue;
        const first = p[i]! + s[i]! / 2 <= p[j]! + s[j]! / 2;
        constraints.push(first ? { left: i, right: j, gap: s[i]! } : { left: j, right: i, gap: s[j]! });
      }
      if (constraints.length > RELAX_MAX_CONSTRAINTS) return undefined;
    }
    const order = [...Array(count + 2).keys()].sort((a, b) => (a === wallNear ? -1 : b === wallNear ? 1 : a === wallFar ? 1 : b === wallFar ? -1 : p[a]! - p[b]! || a - b));
    const solved = satisfy(goal, fixed, constraints, order);
    if (solved === undefined) return undefined;
    for (let i = 0; i < this.n; i++) p[i] = solved[i]!;
    return constraints.length;
  }

  /** This function gives the placements of the moving boxes in the coordinates of the container. */
  output(): Placement[] {
    return this.placements.map((pl, i) => ({
      ...pl,
      x: this.pos[0][i]! + this.origin[0] + this.offsets[0][i]!,
      y: this.pos[1][i]! + this.origin[1] + this.offsets[1][i]!,
    }));
  }
}

/** This function gives the sum of the hard breaks of an output. */
function hardSum(input: PackInput, output: PackOutput): number {
  return Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);
}

/**
 * The composite strategy `relax` of roadmap item k124. The member packs the input. Then the pass moves the boxes on
 * each fixed side, so that the slack is even. The placed set and the size do not change. A free side does not move.
 *
 * When the pass gives more hard breaks than the member, the output is the output of the member.
 * The trace stage `relax` has `move.relax` (the count of the moved boxes), `relax.constraints` and `relax.fallback`.
 */
export const relaxStrategy: Strategy<RelaxStrategyOptions> = {
  id: "relax",
  family: "relax",
  catalog: ["overlap-vpsc"],
  supports: relaxSupports(),
  defaults: { strength: 1 },
  deterministic: true,
  pack(input: PackInput, options: RelaxStrategyOptions, context: PackContext): PackOutput {
    assertSupported(relaxStrategy.supports, input);
    const member = checked(options);
    const strength = options.strength ?? 1;
    const base = packWith(member.strategy, input, member.options, context.seed);
    const measures = { "move.relax": 0, "relax.constraints": 0, "relax.moved": 0, "relax.fallback": 0 };
    const keep = (fallback: number): PackOutput => ({ ...base, trace: [...(base.trace ?? []), { id: RELAX_STAGE, measures: { ...measures, "relax.fallback": fallback } }] });
    if (strength === 0 || base.placements.length === 0) return keep(0);
    const boxes = new Boxes(input, base);
    if (boxes.n === 0 || !boxes.clean()) return keep(1);
    const targets = ([0, 1] as const).map((axis) => (Number.isFinite(boxes.span[axis]) ? boxes.targets(axis, strength) : undefined));
    for (const axis of [0, 1] as const) {
      const t = targets[axis];
      if (t === undefined) continue;
      const constraints = boxes.relax(axis, t);
      if (constraints === undefined) return keep(1);
      measures["relax.constraints"] += constraints;
    }
    const moved = boxes.output();
    const byId = new Map(moved.map((p) => [p.id, p]));
    const placements = base.placements.map((p) => byId.get(p.id) ?? p);
    measures["relax.moved"] = moved.filter((p, i) => Math.abs(p.x - boxes.placements[i]!.x) > TOUCH || Math.abs(p.y - boxes.placements[i]!.y) > TOUCH).length;
    measures["move.relax"] = measures["relax.moved"];
    const output: PackOutput = { ...base, placements, trace: [...(base.trace ?? []), { id: RELAX_STAGE, measures }] };
    if (hardSum(input, output) > hardSum(input, base)) return keep(1);
    return output;
  },
};
