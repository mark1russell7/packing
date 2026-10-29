// The separation of boxes on one axis by the satisfy step of VPSC (Dwyer 2006). The strategies `relax` (k124)
// and `force` (k125) use it. The code came from `src/relax.ts` with no change of the output.

import { EPS, marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { boundsOf, containerBounds, pairPads } from "./frame.ts";

/** An overlap on one axis of this length or less is a touch, not an overlap. The value is `EPS` of the contract. */
export const TOUCH: number = EPS;

/** One separation constraint on one axis: the position of `right` is the position of `left` plus `gap` or more. */
export interface Constraint {
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
export function satisfy(targets: Float64Array, fixed: Uint8Array, constraints: readonly Constraint[], order: readonly number[]): Float64Array | undefined {
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
export class Boxes {
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
   * This function moves the boxes on one axis to the positions nearest to the targets that keep the order. A pair of
   * boxes that overlap on the other axis keeps its order on this axis. The walls of the frame are fixed variables.
   * It gives the count of the constraints, or `undefined` when the solve fails or the count is above `maxConstraints`.
   */
  separate(axis: 0 | 1, targets: Float64Array, maxConstraints: number): number | undefined {
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
      if (constraints.length > maxConstraints) return undefined;
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
