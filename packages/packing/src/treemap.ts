// The first treemaps of `docs/research/CATALOG.md` (roadmap item k27): slice and dice, squarified, strip and pivot by split size.
// A treemap cuts a rectangle into cells. The area of each cell is in proportion to the weight of its item. The functions
// of this file are standalone. They are not in `packSpace`, in the registry or in a default. `treemapPack` is the
// comparison of the catalog: each box goes to the center of its cell, and the cells scale up until each box fits.

import { marginOf, type PackInput, type PackOutput } from "./contract.ts";

/**
 * The rectangle of a treemap. It has the fields of `Rect` of the contract. A public signature with that name renames the class `Rect` of this package in the built types.
 */
export interface TreemapFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A node of a treemap. A leaf has a positive weight. A branch has children, and its weight is the sum of its leaves. */
export type TreemapNode =
  | { readonly id: string; readonly weight: number; readonly children?: undefined }
  | { readonly id: string; readonly children: readonly TreemapNode[]; readonly weight?: undefined };

/** The cell of a leaf: a rectangle of the frame, with the id of the leaf. */
export interface TreemapCell extends TreemapFrame {
  readonly id: string;
}

/** A treemap method. It gives one cell for each leaf, in the depth-first order of the leaves. */
export type TreemapLayout = (nodes: readonly TreemapNode[], frame: TreemapFrame) => TreemapCell[];

/** The options of `treemapStrip`. */
export interface TreemapStripOptions {
  /**
   * With `true`, the method tries to join each strip with the next strip, as in section 2.2.1 of Bederson 2002.
   * This step removes a long thin last strip. The default is `true`.
   */
  readonly lookahead?: boolean;
}

/** A node with its weight, as the methods read it. */
interface Sized {
  readonly id: string;
  readonly weight: number;
  readonly kids?: readonly Sized[];
}

/** The method of one level: it gives one rectangle for each weight, in the order of the weights. */
type LevelLayout = (weights: readonly number[], frame: TreemapFrame, depth: number) => TreemapFrame[];

/** This function gives a node with the weights of its subtree. A weight that is not positive and finite is a `RangeError`. */
function sizedOf(node: TreemapNode): Sized {
  if (node.children === undefined) {
    if (!(node.weight > 0) || !Number.isFinite(node.weight)) throw new RangeError(`The weight of "${node.id}" must be positive and finite.`);
    return { id: node.id, weight: node.weight };
  }
  const kids = node.children.map(sizedOf);
  if (kids.length === 0) throw new RangeError(`The branch "${node.id}" has no children.`);
  return { id: node.id, weight: sumOf(kids.map((kid) => kid.weight)), kids };
}

/** This function gives the sum of a list. */
function sumOf(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

/** This function gives the aspect of a rectangle: the long side divided by the short side. A square has the aspect 1. */
function aspectOf(w: number, h: number): number {
  return w > h ? w / h : h / w;
}

/** This function gives the leaf cells of a tree. It applies `level` to the children of each node, from the root down. */
function layoutTree(nodes: readonly TreemapNode[], frame: TreemapFrame, level: LevelLayout): TreemapCell[] {
  if (!(frame.w > 0) || !(frame.h > 0) || !Number.isFinite(frame.w) || !Number.isFinite(frame.h)) throw new RangeError("A treemap frame needs a positive, finite width and height.");
  const cells: TreemapCell[] = [];
  const visit = (group: readonly Sized[], area: TreemapFrame, depth: number): void => {
    const rects = level(group.map((node) => node.weight), area, depth);
    for (const [index, node] of group.entries()) {
      const rect = rects[index]!;
      if (node.kids === undefined) cells.push({ id: node.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      else visit(node.kids, rect, depth + 1);
    }
  };
  if (nodes.length > 0) visit(nodes.map(sizedOf), frame, 0);
  return cells;
}

/** This function cuts a frame into parallel strips in the order of the weights. With `alongX` the strips stand side by side. */
function slice(weights: readonly number[], frame: TreemapFrame, alongX: boolean): TreemapFrame[] {
  const total = sumOf(weights);
  let before = 0;
  return weights.map((weight) => {
    const start = before / total;
    before += weight;
    const share = weight / total;
    return alongX
      ? { x: frame.x + frame.w * start, y: frame.y, w: frame.w * share, h: frame.h }
      : { x: frame.x, y: frame.y + frame.h * start, w: frame.w, h: frame.h * share };
  });
}

/**
 * This function gives the slice and dice treemap of Shneiderman 1992. The root cuts along x, and each level of the tree
 * turns the direction. The cells keep the input order. A flat list gives one row of thin cells. The cost is `O(n)`.
 */
export function treemapSliceDice(nodes: readonly TreemapNode[], frame: TreemapFrame): TreemapCell[] {
  return layoutTree(nodes, frame, (weights, area, depth) => slice(weights, area, depth % 2 === 0));
}

/**
 * This function gives the highest aspect of a row along a side, the function `worst` of Bruls 2000. The values are the
 * sum, the largest and the smallest area of the row.
 */
function worstAspect(sum: number, largest: number, smallest: number, side: number): number {
  const square = side * side;
  const total = sum * sum;
  return Math.max((square * largest) / total, total / (square * smallest));
}

/** This function gives the squarified cells of one level: a row grows along the short side of the free space. */
function squarify(weights: readonly number[], frame: TreemapFrame): TreemapFrame[] {
  const scale = (frame.w * frame.h) / sumOf(weights);
  const order = weights.map((_, index) => index).sort((a, b) => weights[b]! - weights[a]! || a - b);
  const rects: TreemapFrame[] = new Array<TreemapFrame>(weights.length);
  let free = frame;
  let start = 0;
  while (start < order.length) {
    const side = Math.min(free.w, free.h);
    const largest = weights[order[start]!]! * scale;
    let end = start;
    let sum = 0;
    let worst = Infinity;
    while (end < order.length) {
      const area = weights[order[end]!]! * scale;
      const next = worstAspect(sum + area, largest, area, side);
      if (next > worst) break;
      worst = next;
      sum += area;
      end += 1;
    }
    const depth = sum / side;
    const column = free.w >= free.h;
    const row = column ? { x: free.x, y: free.y, w: depth, h: free.h } : { x: free.x, y: free.y, w: free.w, h: depth };
    const members = order.slice(start, end);
    const parts = slice(members.map((index) => weights[index]!), row, !column);
    for (const [index, member] of members.entries()) rects[member] = parts[index]!;
    free = column ? { x: free.x + depth, y: free.y, w: free.w - depth, h: free.h } : { x: free.x, y: free.y + depth, w: free.w, h: free.h - depth };
    start = end;
  }
  return rects;
}

/**
 * This function gives the squarified treemap of Bruls 2000. Each level sorts by weight, from the largest. A row grows
 * along the short side of the free space while its worst aspect does not get higher. The cost is `O(n log n)`.
 */
export function treemapSquarified(nodes: readonly TreemapNode[], frame: TreemapFrame): TreemapCell[] {
  return layoutTree(nodes, frame, (weights, area) => squarify(weights, area));
}

/** This function gives the cumulative weights of a list. Item `i` of the result is the weight before item `i`. */
function prefixOf(weights: readonly number[]): number[] {
  const prefix = [0];
  for (const weight of weights) prefix.push(prefix[prefix.length - 1]! + weight);
  return prefix;
}

/** This function gives the strip cells of one level, always in horizontal strips. */
function strips(weights: readonly number[], frame: TreemapFrame, lookahead: boolean): TreemapFrame[] {
  const prefix = prefixOf(weights);
  const total = prefix[weights.length]!;
  const heightOf = (from: number, to: number): number => (frame.h * (prefix[to]! - prefix[from]!)) / total;
  /** The sum of the aspects of the items `from` up to `to` in one strip. */
  const aspects = (from: number, to: number): number => {
    const height = heightOf(from, to);
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += aspectOf((frame.w * weights[i]!) / (prefix[to]! - prefix[from]!), height);
    return sum;
  };
  /** The end of the strip that starts at `from`: an item joins while the mean aspect does not get higher. */
  const grow = (from: number): number => {
    let end = from + 1;
    let mean = aspects(from, end);
    while (end < weights.length) {
      const next = aspects(from, end + 1) / (end + 1 - from);
      if (next > mean) break;
      mean = next;
      end += 1;
    }
    return end;
  };
  const rects: TreemapFrame[] = [];
  let start = 0;
  while (start < weights.length) {
    let end = grow(start);
    if (lookahead && end < weights.length) {
      const next = grow(end);
      const apart = (aspects(start, end) + aspects(end, next)) / (next - start);
      if (aspects(start, next) / (next - start) < apart) end = next;
    }
    const row = { x: frame.x, y: frame.y + heightOf(0, start), w: frame.w, h: heightOf(start, end) };
    rects.push(...slice(weights.slice(start, end), row, true));
    start = end;
  }
  return rects;
}

/**
 * This function gives the strip treemap of Bederson 2002. The items keep the input order in horizontal strips. An item
 * joins a strip while the mean aspect of the strip does not get higher. The cost is `O(n sqrt n)` on average and
 * `O(n^2)` at most.
 */
export function treemapStrip(nodes: readonly TreemapNode[], frame: TreemapFrame, options: TreemapStripOptions = {}): TreemapCell[] {
  const lookahead = options.lookahead ?? true;
  return layoutTree(nodes, frame, (weights, area) => strips(weights, area, lookahead));
}

/** This function gives the mean aspect of a list of rectangles. */
function meanAspect(rects: readonly TreemapFrame[]): number {
  return sumOf(rects.map((rect) => aspectOf(rect.w, rect.h))) / rects.length;
}

/** This function gives the cells of one level of the pivot treemap. */
function pivots(weights: readonly number[], frame: TreemapFrame): TreemapFrame[] {
  const prefix = prefixOf(weights);
  const between = (from: number, to: number): number => prefix[to]! - prefix[from]!;

  /** The pivot by split size: the item with the most equal weights before it and after it. */
  const pivotOf = (from: number, to: number): number => {
    let pivot = from;
    let best = Infinity;
    for (let i = from; i < to; i += 1) {
      const gap = Math.abs(between(from, i) - between(i + 1, to));
      if (gap < best) {
        best = gap;
        pivot = i;
      }
    }
    return pivot;
  };

  /** One pivot step: `R1`, then the pivot above `R2`, then `R3`. In a tall frame, the arrangement turns along `y = x`. */
  const pivotStep = (from: number, to: number, area: TreemapFrame): TreemapFrame[] => {
    const wide = area.w >= area.h;
    const long = wide ? area.w : area.h;
    const cross = wide ? area.h : area.w;
    const pivot = pivotOf(from, to);
    const firstLength = (long * between(from, pivot)) / between(from, to);
    const restLength = long - firstLength;
    // Step 5 of Bederson 2002: the split of the items after the pivot gives the pivot cell the aspect nearest to 1.
    let split = pivot + 1;
    let best = Infinity;
    let middleLength = 0;
    let pivotCross = 0;
    for (let end = pivot + 1; end <= to; end += 1) {
      const length = (restLength * between(pivot, end)) / between(pivot, to);
      const height = (cross * weights[pivot]!) / between(pivot, end);
      const aspect = aspectOf(length, height);
      if (aspect < best) {
        best = aspect;
        split = end;
        middleLength = length;
        pivotCross = height;
      }
    }
    const at = (u: number, v: number, lengthU: number, lengthV: number): TreemapFrame =>
      wide ? { x: area.x + u, y: area.y + v, w: lengthU, h: lengthV } : { x: area.x + v, y: area.y + u, w: lengthV, h: lengthU };
    return [
      ...cellsOf(from, pivot, at(0, 0, firstLength, cross)),
      at(firstLength, 0, middleLength, pivotCross),
      ...cellsOf(pivot + 1, split, at(firstLength, pivotCross, middleLength, cross - pivotCross)),
      ...cellsOf(split, to, at(firstLength + middleLength, 0, long - firstLength - middleLength, cross)),
    ];
  };

  /** The quad of four items: two rows of two items, in the reading order. */
  const quad = (from: number, area: TreemapFrame): TreemapFrame[] => {
    const rows = slice([between(from, from + 2), between(from + 2, from + 4)], area, false);
    return [...slice(weights.slice(from, from + 2), rows[0]!, true), ...slice(weights.slice(from + 2, from + 4), rows[1]!, true)];
  };

  /** The cells of the items `from` up to `to`. Four items or fewer take the best of the pivot, the quad and the two snakes. */
  const cellsOf = (from: number, to: number, area: TreemapFrame): TreemapFrame[] => {
    const count = to - from;
    if (count === 0) return [];
    if (count === 1) return [area];
    const step = pivotStep(from, to, area);
    if (count > 4) return step;
    const part = weights.slice(from, to);
    const tries = [step, ...(count === 4 ? [quad(from, area)] : []), slice(part, area, true), slice(part, area, false)];
    let best = step;
    let bestAspect = Infinity;
    for (const rects of tries) {
      const aspect = meanAspect(rects);
      if (aspect < bestAspect) {
        best = rects;
        bestAspect = aspect;
      }
    }
    return best;
  };

  return cellsOf(0, weights.length, frame);
}

/**
 * This function gives the pivot treemap of Bederson 2002 with the pivot by split size. The pivot has the most equal
 * weights before it and after it. Four items or fewer take the best of the pivot, the quad and the snake layouts. The
 * order of the input is near in the layout, but not exact. The cost is `O(n log n)` on average and `O(n^2)` at most.
 */
export function treemapPivotSplit(nodes: readonly TreemapNode[], frame: TreemapFrame): TreemapCell[] {
  return layoutTree(nodes, frame, (weights, area) => pivots(weights, area));
}

/**
 * This function packs boxes with a treemap method, as the catalog compares a treemap with a packer. The weight of each
 * box is its area with its margin and the gap. Each box goes to the center of its cell and keeps its size. The cells
 * scale up until each box fits, so the boxes do not overlap.
 *
 * - The frame has the area of the boxes and the aspect of the container.
 * - The container must be free, because the scale sets the size. An obstacle is a `RangeError`.
 * - The result has no turns, no overflow and no moved obstacles. Read it with `measure`.
 */
export function treemapPack(input: PackInput, layout: TreemapLayout): PackOutput {
  if (input.container.fixed !== "none") throw new RangeError('treemapPack needs a container with fixed "none", because the scale sets the size.');
  if ((input.obstacles?.length ?? 0) > 0) throw new RangeError("treemapPack does not take obstacles.");
  const gap = input.gap ?? 0;
  const boxes = input.items.map((item) => {
    const margin = marginOf(item);
    return {
      id: item.id,
      w: item.w + margin.left + margin.right + gap,
      h: item.h + margin.top + margin.bottom + gap,
      left: margin.left + gap / 2,
      top: margin.top + gap / 2,
    };
  });
  if (boxes.length === 0) return { placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] };
  const area = sumOf(boxes.map((box) => box.w * box.h));
  const aspect = input.container.aspect ?? 1;
  const frame = { x: 0, y: 0, w: Math.sqrt(area * aspect), h: Math.sqrt(area / aspect) };
  const cells = layout(boxes.map((box) => ({ id: box.id, weight: box.w * box.h })), frame);
  let scale = 1;
  for (const [index, box] of boxes.entries()) {
    const cell = cells[index]!;
    scale = Math.max(scale, box.w / cell.w, box.h / cell.h);
  }
  const placements = boxes.map((box, index) => {
    const cell = cells[index]!;
    return { id: box.id, x: (cell.x + cell.w / 2) * scale - box.w / 2 + box.left, y: (cell.y + cell.h / 2) * scale - box.h / 2 + box.top };
  });
  return { placements, overflow: [], size: { w: frame.w * scale, h: frame.h * scale }, moved: [] };
}
