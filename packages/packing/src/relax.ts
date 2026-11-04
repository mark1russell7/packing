// The strategy `relax` of roadmap item k124 (`docs/PACKER.md`, "The relax pass", catalog row `overlap-vpsc`).
// It packs an input with one member, then spreads the slack of each fixed side evenly. The satisfy step of VPSC
// (Dwyer 2006) keeps the order of the boxes and removes each overlap. Nothing default uses it.
// The option `pull` of roadmap item k137 (`docs/PACKER.md`, "The link pull") then moves the boxes toward their linked boxes.

import { guillotine, maxrects, rows, shelf, skyline } from "./adapters.ts";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { Boxes, TOUCH } from "./separation.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The id of the trace stage of `relax`. */
export const RELAX_STAGE = "relax";

/** The largest count of the separation constraints on one axis. On a larger input, `relax` gives the layout of the member. */
export const RELAX_MAX_CONSTRAINTS = 200_000;

/** The largest count of the boxes, moving or fixed, of the link pull. On a larger input, `relax` does not pull. */
export const RELAX_PULL_MAX_BOXES = 1000;

/** The largest count of the rounds of the link pull. */
const PULL_ROUNDS = 16;

/** The options of the strategy `relax` */
export interface RelaxStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The share of the move from the member layout to the target, from 0 to 1. The default is 1. With 0, the output is the member output. */
  strength?: number;
  /** The share of the move of a box to the balance point of its links, from 0 to 1. The default is 0: no pull. */
  pull?: number;
}

/** One pull on a moving box: the box of the other end of the link, and the weight of the link. */
interface Pull {
  readonly to: number;
  readonly weight: number;
}

/** The default member of `relax`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

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
  const { pull } = options;
  if (pull !== undefined && !(pull >= 0 && pull <= 1)) throw new RangeError(`The option pull of relax is a number from 0 to 1, not ${String(pull)}.`);
  return member;
}

/**
 * This function gives the target of each moving box of `boxes` on one axis. A linear map takes the extent of the moving boxes onto
 * the frame. A box keeps its share of the free play. The box at the near edge goes to 0, and the box at the far edge goes to the far wall.
 */
function targetsOf(boxes: Boxes, axis: 0 | 1, strength: number): Float64Array {
  const p = boxes.pos[axis];
  const s = boxes.size[axis];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < boxes.n; i++) {
    lo = Math.min(lo, p[i]!);
    hi = Math.max(hi, p[i]! + s[i]!);
  }
  const out = new Float64Array(boxes.n);
  for (let i = 0; i < boxes.n; i++) {
    const play = hi - lo - s[i]!;
    const share = play > TOUCH ? (p[i]! - lo) / play : 0.5;
    const target = share * (boxes.span[axis] - s[i]!);
    out[i] = p[i]! + strength * (target - p[i]!);
  }
  return out;
}

/**
 * This function gives the pulls on each moving box. A link to an item with no box, a link of an item to itself and a
 * link with no positive weight have no effect.
 */
function pullsOf(input: PackInput, boxes: Boxes): Pull[][] {
  const out: Pull[][] = Array.from({ length: boxes.n }, () => []);
  for (const { a, b, weight = 1 } of input.links ?? []) {
    const first = boxes.index.get(input.items[a]?.id ?? "");
    const second = boxes.index.get(input.items[b]?.id ?? "");
    if (first === undefined || second === undefined || first === second || !(weight > 0)) continue;
    if (first < boxes.n) out[first]!.push({ to: second, weight });
    if (second < boxes.n) out[second]!.push({ to: first, weight });
  }
  return out;
}

/** This function gives the center of a box on one axis. */
const centerOf = (boxes: Boxes, axis: 0 | 1, i: number): number => boxes.pos[axis][i]! + boxes.size[axis][i]! / 2;

/** This function gives the sum over the pulls of the weight times the axis distance from `center` to the other box. */
function wireAt(boxes: Boxes, list: readonly Pull[], axis: 0 | 1, center: number): number {
  let sum = 0;
  for (const { to, weight } of list) sum += weight * Math.abs(center - centerOf(boxes, axis, to));
  return sum;
}

/** This function gives the wire length of the boxes: the sum over the links of the weight times the Manhattan distance between the centers. */
function wireOf(boxes: Boxes, pulls: readonly (readonly Pull[])[]): number {
  let sum = 0;
  for (let i = 0; i < boxes.n; i++) {
    for (const p of pulls[i]!) {
      // A link of two moving boxes comes two times, one time from each end.
      if (p.to < boxes.n && p.to < i) continue;
      sum += wireAt(boxes, [p], 0, centerOf(boxes, 0, i)) + wireAt(boxes, [p], 1, centerOf(boxes, 1, i));
    }
  }
  return sum;
}

/** This function gives the position on one axis that puts the center of a box at the weighted mean of the centers of its links. There, the springs of the links are in balance. */
function balanceOf(boxes: Boxes, list: readonly Pull[], axis: 0 | 1, i: number): number {
  let sum = 0;
  let weight = 0;
  for (const p of list) {
    sum += p.weight * centerOf(boxes, axis, p.to);
    weight += p.weight;
  }
  return sum / weight - boxes.size[axis][i]! / 2;
}

/**
 * This function does one block step. Each linked box gets a target toward its balance point, and the satisfy step moves
 * the boxes on each axis. Thus a box can push a row of boxes. It gives `false` when a solve fails.
 */
function blockStep(boxes: Boxes, pulls: readonly (readonly Pull[])[], share: number): boolean {
  for (const axis of [0, 1] as const) {
    const targets = boxes.pos[axis].slice(0, boxes.n);
    for (let i = 0; i < boxes.n; i++) {
      const list = pulls[i]!;
      if (list.length > 0) targets[i] = targets[i]! + share * (balanceOf(boxes, list, axis, i) - targets[i]!);
    }
    if (boxes.separate(axis, targets, RELAX_MAX_CONSTRAINTS) === undefined) return false;
  }
  return true;
}

/**
 * This function does one slide step. Each linked box in turn moves on each axis along its free interval, toward its
 * balance point. The other boxes stay. A move goes ahead only when it makes the wires of the box shorter.
 */
function slideStep(boxes: Boxes, pulls: readonly (readonly Pull[])[], share: number): void {
  const count = boxes.pos[0].length;
  for (let i = 0; i < boxes.n; i++) {
    const list = pulls[i]!;
    if (list.length === 0) continue;
    for (const axis of [0, 1] as const) {
      const other = axis === 0 ? 1 : 0;
      const p = boxes.pos[axis];
      const s = boxes.size[axis];
      let lo = 0;
      let hi = boxes.span[axis] - s[i]!;
      for (let j = 0; j < count; j++) {
        if (j === i || boxes.overlap(other, i, j) <= TOUCH) continue;
        if (centerOf(boxes, axis, j) <= centerOf(boxes, axis, i)) lo = Math.max(lo, p[j]! + s[j]!);
        else hi = Math.min(hi, p[j]! - s[i]!);
      }
      const target = p[i]! + share * (balanceOf(boxes, list, axis, i) - p[i]!);
      const to = Math.min(Math.max(target, lo), hi);
      if (Math.abs(to - p[i]!) <= TOUCH) continue;
      if (wireAt(boxes, list, axis, to + s[i]! / 2) < wireAt(boxes, list, axis, centerOf(boxes, axis, i))) p[i] = to;
    }
  }
}

/**
 * This function does the rounds of the link pull. One round is a block step, then a slide step. A block step that does
 * not make the wire length shorter goes back. The rounds stop when the wire length stops falling. Thus the wire length
 * does not grow. It writes the counts to `measures`.
 */
function pullLinks(boxes: Boxes, pulls: readonly (readonly Pull[])[], pull: number, measures: Record<string, number>): void {
  let wire = wireOf(boxes, pulls);
  measures["relax.pull.before"] = wire;
  for (let round = 0; round < PULL_ROUNDS; round++) {
    const start = wire;
    const saved = [boxes.pos[0].slice(), boxes.pos[1].slice()] as const;
    if (!blockStep(boxes, pulls, pull) || wireOf(boxes, pulls) >= wire - TOUCH) {
      boxes.pos[0].set(saved[0]);
      boxes.pos[1].set(saved[1]);
    }
    slideStep(boxes, pulls, pull);
    wire = wireOf(boxes, pulls);
    if (wire >= start - TOUCH) break;
    measures["relax.pull.rounds"]!++;
  }
  measures["relax.pull.after"] = wire;
}

/** This function gives the sum of the hard breaks of an output. */
function hardSum(input: PackInput, output: PackOutput): number {
  return Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);
}

/**
 * The composite strategy `relax` of roadmap item k124. The member packs the input. Then the pass moves the boxes on
 * each fixed side, so that the slack is even. The placed set and the size do not change. A free side does not move.
 *
 * With the option `pull`, the boxes then move along their free space toward their linked boxes. The pull also moves
 * the boxes on a free side, in the output size of the member. The output keeps that size, and the wire length does not grow.
 *
 * When the pass gives more hard breaks than the member, the output is the output of the member.
 * The trace stage `relax` has `move.relax` (the count of the moved boxes), `relax.constraints` and `relax.fallback`.
 * With `pull`, it also has `relax.pull.rounds`, `relax.pull.before` and `relax.pull.after` (the wire lengths).
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
    const pull = options.pull ?? 0;
    const measures: Record<string, number> = { "move.relax": 0, "relax.constraints": 0, "relax.moved": 0, "relax.fallback": 0 };
    if (pull > 0) Object.assign(measures, { "relax.pull.rounds": 0, "relax.pull.before": 0, "relax.pull.after": 0 });
    const keep = (fallback: number): PackOutput => ({ ...base, trace: [...(base.trace ?? []), { id: RELAX_STAGE, measures: { ...measures, "relax.fallback": fallback } }] });
    if ((strength === 0 && pull === 0) || base.placements.length === 0) return keep(0);
    const boxes = new Boxes(input, base);
    if (boxes.n === 0 || !boxes.clean()) return keep(1);
    const targets = ([0, 1] as const).map((axis) => (Number.isFinite(boxes.span[axis]) ? targetsOf(boxes, axis, strength) : undefined));
    for (const axis of [0, 1] as const) {
      const t = targets[axis];
      if (t === undefined || strength === 0) continue;
      const constraints = boxes.separate(axis, t, RELAX_MAX_CONSTRAINTS);
      if (constraints === undefined) return keep(1);
      measures["relax.constraints"]! += constraints;
    }
    if (pull > 0 && boxes.pos[0].length <= RELAX_PULL_MAX_BOXES) {
      boxes.closeFreeSides(input, base);
      if (!boxes.clean()) return keep(1);
      const pulls = pullsOf(input, boxes);
      if (pulls.some((list) => list.length > 0)) pullLinks(boxes, pulls, pull, measures);
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
