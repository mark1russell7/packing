import { boundsOf, circlesOutside as ringOutside, rectInRegion, regionHitsRect, shapesOverlap, translate, type ContainerTest, type LayoutBox, type LayoutContainer, type PackHard, type Rect, type Region } from "@mark1russell7/layout-contract";
import { DEFAULT_TOLERANCE, marginOf, RECORD_EPS, turnItem, type Item, type PackInput, type PackOutput, type Placement, type Tolerance } from "./contract.ts";
import { predicates } from "./probe.ts";

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

/** This function gives a box that is larger by `d` on each side. */
const grown = (box: Box, d: number): Box => ({ l: box.l - d, t: box.t - d, r: box.r + d, b: box.b + d });

/** This function gives the key of a pair of item ids, with the same key for each order. */
const pairKey = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);

/** This function gives the gap of each pair of `pairGaps` by `pairKey`, or `undefined` without `pairGaps`. The first entry of a pair wins, as in the contract. */
function pairGapsOf(input: PackInput): Map<string, number> | undefined {
  if (input.pairGaps === undefined || input.pairGaps.length === 0) return undefined;
  const out = new Map<string, number>();
  for (const p of input.pairGaps) {
    const key = pairKey(p.a, p.b);
    if (p.a !== p.b && !out.has(key)) out.set(key, p.gap);
  }
  return out;
}

/** This function gives the placed box of a circle item for the rules of the contract, or `undefined` for each other item. */
function discOf(item: Item, at: Pick<Placement, "x" | "y">): LayoutBox | undefined {
  return item.shape?.kind === "circle" ? { ...item, x: at.x, y: at.y } : undefined;
}

/**
 * This function gives the placed boxes of the circle items of an output, for the circle rules of the contract.
 * An item without a circle shape and a placement of an unknown id give no box.
 */
export function circleBoxes(input: PackInput, placements: readonly Placement[]): LayoutBox[] {
  const items = new Map(input.items.map((i) => [i.id, i]));
  const out: LayoutBox[] = [];
  for (const p of placements) {
    const item = items.get(p.id);
    const box = item === undefined ? undefined : discOf(p.turn === 90 ? turnItem(item) : item, p);
    if (box !== undefined) out.push(box);
  }
  return out;
}

/**
 * This function counts the breaks of the 4 hard rules of the packer for an output.
 *
 * - `no-overlap`: each pair of items with their margins, and each pair of an item and an obstacle, that overlap by more than `tolerance.overlap`.
 *   A pair of `pairGaps` uses its gap in place of the two margins, as in `packHard`: one item grows by the gap.
 *   Two circle items count by the distance of their centers, by `shapesOverlap` of the contract.
 * - `in-container`: each item with its margin that goes out of a fixed side by more than `tolerance.overlap`. The inset of
 *   the container makes each fixed side smaller (decision 3 of `docs/PACKER.md`).
 * - `locked-kept`: each locked item that moved by more than `RECORD_EPS`, or that has no placement.
 * - `complete`: each item with no placement that is not in the overflow. A locked item breaks `locked-kept` in its place.
 *
 * A locked item with no placement stays at its input position for `no-overlap` and `in-container`. A locked item with no
 * `x` or no `y` in the input is a bad input. The rules skip it, as `packHard` of the contract does. `checkInput` finds it.
 *
 * The test of an obstacle is exact: a circle, an ellipse and a polygon with holes count only their insides, as in `packHard`.
 * Each other pair reads a shape of an item as its bounding box (decision 5). The bounding box of an item
 * shape is relative to the position of the item. The result has no tolerance in it.
 *
 * A shaped container with the size `fixed` also uses its true outline for `in-container`.
 * A box then counts when `rectInRegion` of the contract tells that it is not in the shape, as in `packHard`.
 * For that test, the box grows by the inset and becomes smaller by `tolerance.overlap` on each side.
 * A circle item in a circle container counts by distance, also with a free size, by `circlesOutside` of the contract.
 * With `options.exactContainer` set to `false`, only the bounding box of the container counts.
 *
 * These counts are the rules of `HARD_RULE_VERSION` 2 of the contract.
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
  const ids: string[] = [];
  const raws: Box[] = [];
  const discs: (LayoutBox | undefined)[] = [];
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
    ids.push(item.id);
    raws.push({ l, t, r: l + area.w, b: t + area.h });
    discs.push(discOf(placed, p));
  }
  const pairs = pairGapsOf(input);

  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const obstacles: Region[] = (input.obstacles ?? []).map((o) => {
    const at = moved.get(o.id);
    if (at === undefined) return o.region;
    const b = boundsOf(o.region);
    return translate(o.region, at.x - b.x, at.y - b.y);
  });

  // A13: the probe of the bench command `predicates` sees each pair and each box. Without a probe, these lines make no object
  const probe = predicates.probe;
  let overlaps = 0;
  for (const [i, a] of boxes.entries()) {
    const disc = discs[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const g = pairs?.get(pairKey(ids[i]!, ids[j]!));
      const p = g === undefined ? a : grown(raws[i]!, g);
      const q = g === undefined ? boxes[j]! : raws[j]!;
      const other = disc === undefined ? undefined : discs[j];
      if (disc !== undefined && other !== undefined) {
        // The probe reads the test of two boxes. Two circles use a test of distance, so the probe does not see them
        if (shapesOverlap(disc, other, tol, g)) overlaps += 1;
        continue;
      }
      const hit = overlap(p, q, tol);
      if (probe !== undefined) probe("overlap", g === undefined ? { a: p, b: q, tolerance: tol } : { a: p, b: q, tolerance: tol, gap: g }, hit);
      if (hit) overlaps += 1;
    }
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
  const trueOutline = options.exactContainer !== false;
  const exact = trueOutline && container.fixed === "size" ? container.shape : undefined;
  const ring: LayoutContainer | undefined = trueOutline && container.shape?.kind === "circle" ? { ...container, w: output.size.w, h: output.size.h } : undefined;
  let outside = 0;
  for (const [i, box] of boxes.entries()) {
    const outX = fixedW && (box.l < x + inset - tol || box.r > x + w - inset + tol);
    const outY = fixedH && (box.t < y + inset - tol || box.b > y + h - inset + tol);
    if (probe !== undefined) probe("container", { box, x, y, w, h, inset, tolerance: tol, fixedW, fixedH }, outX || outY);
    const disc = ring === undefined ? undefined : discs[i];
    if (outX || outY) outside += 1;
    else if (ring !== undefined && disc !== undefined) outside += ringOutside({ schema: "layout-input/1", id: "check", container: ring, boxes: [disc] }, tol);
    else if (exact !== undefined && !rectInRegion(exact, inner({ l: box.l - inset, t: box.t - inset, r: box.r + inset, b: box.b + inset }, tol))) outside += 1;
  }
  return { "no-overlap": overlaps, "in-container": outside, "locked-kept": lockedKept, complete };
}
