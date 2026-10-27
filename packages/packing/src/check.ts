import { DEFAULT_TOLERANCE, marginOf, RECORD_EPS, turnItem, type Item, type PackInput, type PackOutput, type Tolerance } from "./contract.ts";
import { boundsOf } from "./frame.ts";

/** The count of the breaks of each hard rule of the packer (`docs/FORMAT.md`). A good run has 0 for each rule. */
export interface HardBreaks {
  "no-overlap": number;
  "in-container": number;
  "locked-kept": number;
  complete: number;
}

/** A box with its margin: the left, top, right and bottom edges. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** This function tells if the insides of two boxes overlap by more than a tolerance on each axis. */
function overlap(a: Box, b: Box, tolerance: number): boolean {
  return Math.min(a.r, b.r) - Math.max(a.l, b.l) > tolerance && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tolerance;
}

/**
 * This function counts the breaks of the 4 hard rules of the packer for an output.
 *
 * - `no-overlap`: each pair of items with their margins, and each pair of an item and an obstacle, that overlap by more than `tolerance.overlap`.
 * - `in-container`: each item with its margin that goes out of a fixed side by more than `tolerance.overlap`.
 * - `locked-kept`: each locked item that moved by more than `RECORD_EPS`, or that has no position.
 * - `complete`: each item with no position that is not in the overflow.
 *
 * The rules read a shape of the container or of an obstacle as its bounding box. The result has no tolerance in it.
 */
export function checkHard(input: PackInput, output: PackOutput, tolerance: Pick<Tolerance, "overlap"> = DEFAULT_TOLERANCE): HardBreaks {
  const tol = tolerance.overlap;
  const placements = new Map<string, PackOutput["placements"][number]>();
  for (const p of output.placements) if (!placements.has(p.id)) placements.set(p.id, p);
  const overflow = new Set(output.overflow);
  const breaks: HardBreaks = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

  const boxes: Box[] = [];
  for (const item of input.items) {
    const p = placements.get(item.id);
    if (p === undefined) {
      if (item.locked === true && item.x !== undefined && item.y !== undefined) breaks["locked-kept"] += 1;
      if (!overflow.has(item.id)) breaks.complete += 1;
      continue;
    }
    if (item.locked === true && item.x !== undefined && item.y !== undefined) {
      if (Math.abs(p.x - item.x) > RECORD_EPS || Math.abs(p.y - item.y) > RECORD_EPS) breaks["locked-kept"] += 1;
    }
    const placed: Item = p.turn === 90 ? turnItem(item) : item;
    const m = marginOf(placed);
    boxes.push({ l: p.x - m.left, t: p.y - m.top, r: p.x + placed.w + m.right, b: p.y + placed.h + m.bottom });
  }

  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const obstacles: Box[] = (input.obstacles ?? []).map((o) => {
    const b = boundsOf(o.region);
    const at = moved.get(o.id) ?? b;
    return { l: at.x, t: at.y, r: at.x + b.w, b: at.y + b.h };
  });

  for (const [i, a] of boxes.entries()) {
    for (let j = i + 1; j < boxes.length; j++) if (overlap(a, boxes[j]!, tol)) breaks["no-overlap"] += 1;
    for (const o of obstacles) if (overlap(a, o, tol)) breaks["no-overlap"] += 1;
  }

  const { container } = input;
  const shape = container.shape === undefined ? undefined : boundsOf(container.shape);
  const x = shape?.x ?? 0;
  const y = shape?.y ?? 0;
  const w = shape?.w ?? container.w ?? Infinity;
  const h = shape?.h ?? container.h ?? Infinity;
  const fixedW = container.fixed === "size" || container.fixed === "width";
  const fixedH = container.fixed === "size" || container.fixed === "height";
  for (const box of boxes) {
    const outX = fixedW && (box.l < x - tol || box.r > x + w + tol);
    const outY = fixedH && (box.t < y - tol || box.b > y + h + tol);
    if (outX || outY) breaks["in-container"] += 1;
  }
  return breaks;
}
