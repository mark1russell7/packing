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
 * - `in-container`: each item with its margin that goes out of a fixed side by more than `tolerance.overlap`. The inset of
 *   the container makes each fixed side smaller (decision 3 of `docs/PACKER.md`).
 * - `locked-kept`: each locked item that moved by more than `RECORD_EPS`, or that has no placement.
 * - `complete`: each item with no placement that is not in the overflow. A locked item breaks `locked-kept` in its place.
 *
 * A locked item with no placement stays at its input position for `no-overlap` and `in-container`. A locked item with no
 * `x` or no `y` in the input is not locked for these rules.
 *
 * The rules read a shape of the container, of an obstacle or of an item as its bounding box (decision 5). The bounding box
 * of an item shape is relative to the position of the item. The result has no tolerance in it.
 */
export function checkHard(input: PackInput, output: PackOutput, tolerance: Pick<Tolerance, "overlap"> = DEFAULT_TOLERANCE): HardBreaks {
  const tol = tolerance.overlap;
  const placements = new Map<string, PackOutput["placements"][number]>();
  for (const p of output.placements) if (!placements.has(p.id)) placements.set(p.id, p);
  const overflow = new Set(output.overflow);
  const breaks: HardBreaks = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

  const boxes: Box[] = [];
  for (const item of input.items) {
    const lockedAt = item.locked === true && item.x !== undefined && item.y !== undefined ? { x: item.x, y: item.y } : undefined;
    let p: Pick<PackOutput["placements"][number], "x" | "y" | "turn"> | undefined = placements.get(item.id);
    if (p === undefined) {
      if (lockedAt === undefined) {
        if (!overflow.has(item.id)) breaks.complete += 1;
        continue;
      }
      // A locked item with no placement breaks locked-kept, and it stays at its input position for the other rules
      breaks["locked-kept"] += 1;
      p = lockedAt;
    } else if (lockedAt !== undefined) {
      if (Math.abs(p.x - lockedAt.x) > RECORD_EPS || Math.abs(p.y - lockedAt.y) > RECORD_EPS) breaks["locked-kept"] += 1;
    }
    const placed: Item = p.turn === 90 ? turnItem(item) : item;
    const m = marginOf(placed);
    const area = placed.shape === undefined ? { x: 0, y: 0, w: placed.w, h: placed.h } : boundsOf(placed.shape);
    const l = p.x + area.x;
    const t = p.y + area.y;
    boxes.push({ l: l - m.left, t: t - m.top, r: l + area.w + m.right, b: t + area.h + m.bottom });
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
  const inset = container.inset ?? 0;
  const fixedW = container.fixed === "size" || container.fixed === "width";
  const fixedH = container.fixed === "size" || container.fixed === "height";
  for (const box of boxes) {
    const outX = fixedW && (box.l < x + inset - tol || box.r > x + w - inset + tol);
    const outY = fixedH && (box.t < y + inset - tol || box.b > y + h - inset + tol);
    if (outX || outY) breaks["in-container"] += 1;
  }
  return breaks;
}
