// The strategy `force` of roadmap item k125 (`docs/PACKER.md`, "The force packer", catalog rows `overlap-spring`
// and `overlap-prism`). It packs an input with one member. Then the boxes push each other and the walls until each
// gap is near one target gap. A round of PRISM (Gansner 2010) and the satisfy step of VPSC remove the overlaps that
// are left. Nothing default uses it.

import { guillotine, maxrects, rows, shelf, skyline } from "./adapters.ts";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { Boxes, TOUCH } from "./separation.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The id of the trace stage of `force`. */
export const FORCE_STAGE = "force";

/** The largest count of the boxes of one input. On a larger input, `force` gives the layout of the member. */
export const FORCE_MAX_BOXES = 1000;

/** The options of the strategy `force` */
export interface ForceStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the force steps, an integer of 0 or more. The default is 60. With 0, the output is the member output. */
  iterations?: number;
  /** The most rounds of the overlap removal of PRISM, an integer of 0 or more. The default is 10. */
  rounds?: number;
}

/** The default member of `force`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** The largest factor of the length of an edge in one round of PRISM */
const MAX_STRETCH = 1.5;

/** The count of the sweeps of stress majorization in one round of PRISM */
const SWEEPS = 4;

/** The largest count of the constraints of the last pass on one axis */
const MAX_CONSTRAINTS = 200_000;

/**
 * This function gives the supports of `force`: the union of the supports of the members. The container is a rectangle
 * with at most one free side. The obstacles and the locked items stay fixed. The order is only `free` or `soft`.
 */
function forceSupports(): Supports {
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

/** This function tells if a value is an integer of 0 or more, or `undefined`. */
const isCount = (v: number | undefined): boolean => v === undefined || (Number.isInteger(v) && v >= 0);

/** This function checks the options of `force`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function checked(options: ForceStrategyOptions): PortfolioEntry {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  strategy(member.strategy);
  if (!isCount(options.iterations)) throw new RangeError(`The option iterations of force is an integer of 0 or more, not ${String(options.iterations)}.`);
  if (!isCount(options.rounds)) throw new RangeError(`The option rounds of force is an integer of 0 or more, not ${String(options.rounds)}.`);
  return member;
}

/** This function gives the clearance of two boxes: the larger of the x gap and the y gap. An overlap gives less than 0. */
const clearance = (b: Boxes, i: number, j: number): number => Math.max(-b.overlap(0, i, j), -b.overlap(1, i, j));

/** This function tells if two boxes overlap on both axes by more than a touch. */
const overlaps = (b: Boxes, i: number, j: number): boolean => b.overlap(0, i, j) > TOUCH && b.overlap(1, i, j) > TOUCH;

/** This function gives the count of the pairs of a moving box and another box that overlap. */
function overlapCount(b: Boxes): number {
  const count = b.pos[0].length;
  let out = 0;
  for (let i = 0; i < b.n; i++) for (let j = i + 1; j < count; j++) if (overlaps(b, i, j)) out++;
  return out;
}

/**
 * This function gives the target gap: the gap of a square grid of boxes of the mean area that fills the usable
 * area. The usable area is the frame less the fixed boxes.
 */
function targetGap(b: Boxes): number {
  const count = b.pos[0].length;
  let moving = 0;
  let fixed = 0;
  for (let i = 0; i < count; i++) {
    const area = b.size[0][i]! * b.size[1][i]!;
    if (i < b.n) moving += area;
    else fixed += area;
  }
  const usable = b.span[0] * b.span[1] - fixed;
  if (!(usable > 0)) return 0;
  return Math.max(0, Math.sqrt(usable / b.n) - Math.sqrt(moving / b.n));
}

/** This function puts each moving box back into the frame. */
function clamp(b: Boxes): void {
  for (const axis of [0, 1] as const) {
    const p = b.pos[axis];
    const s = b.size[axis];
    for (let i = 0; i < b.n; i++) p[i] = Math.min(Math.max(p[i]!, 0), b.span[axis] - s[i]!);
  }
}

/**
 * This function does one force step. Each pair with a clearance below `gap` pushes apart along the line of the
 * centers. A wall pushes a box with a clearance below half of `gap`. A fixed box does not move, so its partner gets
 * the full push. The step of each box is at most `gap`, times `cool`. With `block`, a box whose move makes an
 * overlap goes back to its place before the step.
 */
function forceStep(b: Boxes, gap: number, cool: number, block: boolean): void {
  const count = b.pos[0].length;
  const [px, py] = b.pos;
  const [sx, sy] = b.size;
  const dx = new Float64Array(b.n);
  const dy = new Float64Array(b.n);
  for (let i = 0; i < b.n; i++) {
    for (let j = i + 1; j < count; j++) {
      const c = clearance(b, i, j);
      if (c >= gap) continue;
      let ux = px[j]! + sx[j]! / 2 - px[i]! - sx[i]! / 2;
      let uy = py[j]! + sy[j]! / 2 - py[i]! - sy[i]! / 2;
      let len = Math.hypot(ux, uy);
      if (len <= TOUCH) {
        ux = 1;
        uy = 0;
        len = 1;
      }
      const push = j < b.n ? (gap - c) / 2 : gap - c;
      dx[i] = dx[i]! - (push * ux) / len;
      dy[i] = dy[i]! - (push * uy) / len;
      if (j < b.n) {
        dx[j] = dx[j]! + (push * ux) / len;
        dy[j] = dy[j]! + (push * uy) / len;
      }
    }
    for (const [axis, d] of [[0, dx], [1, dy]] as const) {
      const near = b.pos[axis][i]!;
      const far = b.span[axis] - near - b.size[axis][i]!;
      if (near < gap / 2) d[i] = d[i]! + gap / 2 - near;
      if (far < gap / 2) d[i] = d[i]! - (gap / 2 - far);
    }
  }
  const ox = px.slice(0, b.n);
  const oy = py.slice(0, b.n);
  for (let i = 0; i < b.n; i++) {
    const len = Math.hypot(dx[i]!, dy[i]!);
    const scale = (len > gap && len > 0 ? gap / len : 1) * cool;
    px[i] = px[i]! + dx[i]! * scale;
    py[i] = py[i]! + dy[i]! * scale;
  }
  clamp(b);
  if (!block) return;
  // A box whose move makes an overlap goes back. Each box goes back at most one time, so the loop ends.
  const moved = new Uint8Array(b.n).fill(1);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < b.n; i++) {
      if (moved[i] === 0) continue;
      for (let j = 0; j < count; j++) {
        if (j === i || !overlaps(b, i, j)) continue;
        px[i] = ox[i]!;
        py[i] = oy[i]!;
        moved[i] = 0;
        changed = true;
        break;
      }
    }
  }
}

/** One edge of the proximity graph of PRISM: the other box and the length of the edge */
interface Edge {
  readonly to: number;
  readonly length: number;
}

/**
 * This function does one round of the overlap removal of PRISM. The graph has an edge for each pair with a clearance
 * below `gap` or an overlap. An edge of two boxes that overlap gets a longer length. Sweeps of stress majorization move
 * the boxes toward the lengths. It gives the count of the edges with an overlap before the round.
 */
function prismRound(b: Boxes, gap: number): number {
  const count = b.pos[0].length;
  const [px, py] = b.pos;
  const [sx, sy] = b.size;
  const cx = (i: number): number => px[i]! + sx[i]! / 2;
  const cy = (i: number): number => py[i]! + sy[i]! / 2;
  const edges: Edge[][] = Array.from({ length: b.n }, () => []);
  let overlapping = 0;
  for (let i = 0; i < b.n; i++) {
    for (let j = i + 1; j < count; j++) {
      const over = overlaps(b, i, j);
      if (!over && clearance(b, i, j) >= gap) continue;
      const ex = Math.abs(cx(j) - cx(i));
      const ey = Math.abs(cy(j) - cy(i));
      const distance = Math.hypot(ex, ey);
      let length = distance;
      if (over) {
        overlapping++;
        const tx = ex > TOUCH ? (sx[i]! + sx[j]!) / 2 / ex : MAX_STRETCH;
        const ty = ey > TOUCH ? (sy[i]! + sy[j]!) / 2 / ey : MAX_STRETCH;
        const stretch = Math.min(Math.max(Math.min(tx, ty), 1), MAX_STRETCH);
        length = distance > TOUCH ? stretch * distance : (sx[i]! + sx[j]!) / 2;
      }
      if (!(length > TOUCH)) continue;
      edges[i]!.push({ to: j, length });
      if (j < b.n) edges[j]!.push({ to: i, length });
    }
  }
  if (overlapping === 0) return 0;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 0; i < b.n; i++) {
      const list = edges[i]!;
      if (list.length === 0) continue;
      let x = 0;
      let y = 0;
      let weight = 0;
      for (const e of list) {
        let vx = cx(i) - cx(e.to);
        let vy = cy(i) - cy(e.to);
        let len = Math.hypot(vx, vy);
        if (len <= TOUCH) {
          vx = 1;
          vy = 0;
          len = 1;
        }
        const w = 1 / (e.length * e.length);
        x += w * (cx(e.to) + (e.length * vx) / len);
        y += w * (cy(e.to) + (e.length * vy) / len);
        weight += w;
      }
      px[i] = x / weight - sx[i]! / 2;
      py[i] = y / weight - sy[i]! / 2;
    }
  }
  clamp(b);
  return overlapping;
}

/**
 * This function moves the boxes by `iterations` force steps with the target gap `gap`, then removes the overlaps by
 * PRISM and VPSC. It writes the counts to `measures`, and it tells if the result is clean.
 */
function settle(b: Boxes, gap: number, block: boolean, iterations: number, rounds: number, measures: Record<string, number>): boolean {
  for (let k = 0; k < iterations; k++) forceStep(b, gap, 1 - k / iterations, block);
  measures["force.overlaps"] = overlapCount(b);
  measures["force.rounds"] = 0;
  measures["force.vpsc"] = 0;
  for (let r = 0; r < rounds && prismRound(b, gap) > 0; r++) measures["force.rounds"]!++;
  if (overlapCount(b) > 0) {
    measures["force.vpsc"] = 1;
    for (const axis of [0, 1] as const) if (b.separate(axis, b.pos[axis].slice(0, b.n), MAX_CONSTRAINTS) === undefined) return false;
  }
  return b.clean();
}

/**
 * This function gives the boxes of an input and its member output. A free side of the container gets the size of the
 * member output, so the output size does not change.
 */
function framed(input: PackInput, base: PackOutput): Boxes {
  const b = new Boxes(input, base);
  const inset = input.container.inset ?? 0;
  const half = (input.gap ?? 0) / 2;
  if (!Number.isFinite(b.span[0])) b.span[0] = base.size.w - 2 * inset + 2 * half;
  if (!Number.isFinite(b.span[1])) b.span[1] = base.size.h - 2 * inset + 2 * half;
  return b;
}

/** This function gives the sum of the hard breaks of an output. */
function hardSum(input: PackInput, output: PackOutput): number {
  return Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);
}

/**
 * The composite strategy `force` of roadmap item k125. The member packs the input. Then the boxes push each other and
 * the walls, and the overlap removal of PRISM and the satisfy step of VPSC make the layout legal. The placed set and
 * the size do not change.
 *
 * When the pass fails or gives more hard breaks than the member, the output is the output of the member. The trace
 * stage `force` has `move.force`, `force.gap`, `force.tries`, `force.overlaps`, `force.rounds`, `force.vpsc` and `force.fallback`.
 */
export const forceStrategy: Strategy<ForceStrategyOptions> = {
  id: "force",
  family: "force",
  catalog: ["overlap-spring", "overlap-prism"],
  supports: forceSupports(),
  defaults: { iterations: 60, rounds: 10 },
  deterministic: true,
  pack(input: PackInput, options: ForceStrategyOptions, context: PackContext): PackOutput {
    assertSupported(forceStrategy.supports, input);
    const member = checked(options);
    const iterations = options.iterations ?? 60;
    const rounds = options.rounds ?? 10;
    const base = packWith(member.strategy, input, member.options, context.seed);
    const measures: Record<string, number> = { "move.force": 0, "force.gap": 0, "force.tries": 0, "force.overlaps": 0, "force.rounds": 0, "force.vpsc": 0, "force.fallback": 0 };
    const keep = (fallback: number): PackOutput => ({ ...base, trace: [...(base.trace ?? []), { id: FORCE_STAGE, measures: { ...measures, "force.fallback": fallback } }] });
    if (iterations === 0 || base.placements.length === 0) return keep(0);
    const start = framed(input, base);
    if (start.n === 0 || start.pos[0].length > FORCE_MAX_BOXES || !start.clean()) return keep(1);
    const gap = targetGap(start);
    measures["force.gap"] = gap;
    // The tries: the full gap, then half of the gap, then the blocked steps. A blocked step makes no overlap.
    const tries: readonly [number, boolean][] = [[gap, false], [gap / 2, false], [gap, true]];
    let boxes: Boxes | undefined;
    for (const [t, [g, block]] of tries.entries()) {
      const b = framed(input, base);
      if (settle(b, g, block, iterations, rounds, measures)) {
        boxes = b;
        measures["force.tries"] = t + 1;
        break;
      }
    }
    if (boxes === undefined) return keep(1);
    const moved = boxes.output();
    const byId = new Map(moved.map((p) => [p.id, p]));
    const placements = base.placements.map((p) => byId.get(p.id) ?? p);
    measures["move.force"] = moved.filter((p, i) => Math.abs(p.x - boxes.placements[i]!.x) > TOUCH || Math.abs(p.y - boxes.placements[i]!.y) > TOUCH).length;
    const output: PackOutput = { ...base, placements, trace: [...(base.trace ?? []), { id: FORCE_STAGE, measures }] };
    if (hardSum(input, output) > hardSum(input, base)) return keep(1);
    return output;
  },
};
