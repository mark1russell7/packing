import { boundsOf, rectInRegion, regionHitsRect, translate, type ContainerTest, type PackHard, type Rect, type Region } from "@mark1russell7/layout-contract";
import { DEFAULT_TOLERANCE, marginOf, RECORD_EPS, turnItem, type Item, type PackInput, type PackOutput, type Placement, type Tolerance } from "./contract.ts";

export type { ContainerTest, PackHard } from "@mark1russell7/layout-contract";

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

/** This function gives the box made smaller by a tolerance on each side, as a rectangle. */
function inner(box: Box, tolerance: number): Rect {
  return { x: box.l + tolerance, y: box.t + tolerance, w: box.r - box.l - 2 * tolerance, h: box.b - box.t - 2 * tolerance };
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
 * `x` or no `y` in the input is a bad input. The rules skip it, as `packHard` of the contract does. `checkInput` finds it.
 *
 * The test of an obstacle is exact: a circle, an ellipse and a polygon with holes count only their insides, as in `packHard`.
 * The rules read a shape of the container or of an item as its bounding box (decision 5). The bounding box of an item
 * shape is relative to the position of the item. The result has no tolerance in it.
 *
 * With `options.exactContainer`, a shaped container with the size `fixed` also uses its true outline for `in-container`.
 * A box then counts when `rectInRegion` of the contract tells that it is not in the shape, as in `packHard`.
 * For that test, the box grows by the inset and becomes smaller by `tolerance.overlap` on each side. The default is `false`.
 */
export function checkHard(
  input: PackInput,
  output: PackOutput,
  tolerance: Pick<Tolerance, "overlap"> = DEFAULT_TOLERANCE,
  options: ContainerTest = {},
): PackHard {
  const tol = tolerance.overlap;
  const placements = new Map<string, Placement>();
  for (const p of output.placements) if (!placements.has(p.id)) placements.set(p.id, p);
  const overflow = new Set(output.overflow);
  let lockedKept = 0;
  let complete = 0;

  const boxes: Box[] = [];
  for (const item of input.items) {
    if (item.locked === true && (item.x === undefined || item.y === undefined)) continue;
    const lockedAt = item.locked === true ? { x: item.x!, y: item.y! } : undefined;
    let p: Pick<Placement, "x" | "y" | "turn"> | undefined = placements.get(item.id);
    if (p === undefined) {
      if (lockedAt === undefined) {
        if (!overflow.has(item.id)) complete += 1;
        continue;
      }
      // A locked item with no placement breaks locked-kept, and it stays at its input position for the other rules
      lockedKept += 1;
      p = lockedAt;
    } else if (lockedAt !== undefined) {
      if (Math.abs(p.x - lockedAt.x) > RECORD_EPS || Math.abs(p.y - lockedAt.y) > RECORD_EPS) lockedKept += 1;
    }
    const placed: Item = p.turn === 90 ? turnItem(item) : item;
    const m = marginOf(placed);
    const area = placed.shape === undefined ? { x: 0, y: 0, w: placed.w, h: placed.h } : boundsOf(placed.shape);
    const l = p.x + area.x;
    const t = p.y + area.y;
    boxes.push({ l: l - m.left, t: t - m.top, r: l + area.w + m.right, b: t + area.h + m.bottom });
  }

  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const obstacles: Region[] = (input.obstacles ?? []).map((o) => {
    const at = moved.get(o.id);
    if (at === undefined) return o.region;
    const b = boundsOf(o.region);
    return translate(o.region, at.x - b.x, at.y - b.y);
  });

  let overlaps = 0;
  for (const [i, a] of boxes.entries()) {
    for (let j = i + 1; j < boxes.length; j++) if (overlap(a, boxes[j]!, tol)) overlaps += 1;
    if (obstacles.length === 0) continue;
    const rect = inner(a, tol);
    for (const region of obstacles) if (regionHitsRect(region, rect)) overlaps += 1;
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
  const exact = options.exactContainer === true && container.fixed === "size" ? container.shape : undefined;
  let outside = 0;
  for (const box of boxes) {
    const outX = fixedW && (box.l < x + inset - tol || box.r > x + w - inset + tol);
    const outY = fixedH && (box.t < y + inset - tol || box.b > y + h - inset + tol);
    if (outX || outY) outside += 1;
    else if (exact !== undefined && !rectInRegion(exact, inner({ l: box.l - inset, t: box.t - inset, r: box.r + inset, b: box.b + inset }, tol))) outside += 1;
  }
  return { "no-overlap": overlaps, "in-container": outside, "locked-kept": lockedKept, complete };
}
