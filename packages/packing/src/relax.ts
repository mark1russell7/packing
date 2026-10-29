// The strategy `relax` of roadmap item k124 (`docs/PACKER.md`, "The relax pass", catalog row `overlap-vpsc`).
// It packs an input with one member, then spreads the slack of each fixed side evenly. The satisfy step of VPSC
// (Dwyer 2006) keeps the order of the boxes and removes each overlap. Nothing default uses it.

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

/** The options of the strategy `relax` */
export interface RelaxStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The share of the move from the member layout to the target, from 0 to 1. The default is 1. With 0, the output is the member output. */
  strength?: number;
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
    const targets = ([0, 1] as const).map((axis) => (Number.isFinite(boxes.span[axis]) ? targetsOf(boxes, axis, strength) : undefined));
    for (const axis of [0, 1] as const) {
      const t = targets[axis];
      if (t === undefined) continue;
      const constraints = boxes.separate(axis, t, RELAX_MAX_CONSTRAINTS);
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
