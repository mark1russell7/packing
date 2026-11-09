// The quantum strip treemap of Bederson 2002 (roadmap item k27, catalog row `treemap-quantum`). Each item is a group of
// elements of one size, for example pictures. The width and the height of each cell are whole multiples of the element
// size, so the elements of all the cells are on one grid. The function is standalone. It is not in the registry or in a default.

import type { TreemapCell, TreemapFrame } from "./treemap.ts";

/** An item of `treemapQuantum`: a group with a count of elements. The count is a positive whole number. */
export interface QuantumItem {
  readonly id: string;
  readonly count: number;
}

/** The options of `treemapQuantum`. */
export interface QuantumOptions {
  /** The width of one element divided by its height. The default is 1, a square element. */
  readonly elementAspect?: number;
}

/** The cell of a group: a rectangle of the frame with a grid of `cols` by `rows` elements. The grid holds the count of the group, or more. */
export interface QuantumCell extends TreemapCell {
  readonly cols: number;
  readonly rows: number;
}

/** The output of `treemapQuantum`. */
export interface QuantumLayout {
  /** One cell for each group, in the order of the groups. */
  readonly cells: QuantumCell[];
  /** The size of one element in the frame. Its width divided by its height is the element aspect. */
  readonly element: { readonly w: number; readonly h: number };
  /** The size of the layout in elements. The layout starts at the corner of the frame, and it fits in the frame. */
  readonly grid: { readonly cols: number; readonly rows: number };
}

/** A strip of the layout in elements: the groups in it, its height, and the width of each group. */
interface Strip {
  readonly ids: number[];
  rows: number;
  cols: number[];
}

/** This function gives the aspect of a rectangle: the longer side divided by the shorter side. */
function aspectOf(w: number, h: number): number {
  return w > h ? w / h : h / w;
}

/**
 * This function gives a strip of the groups `ids`, as step 3 of the algorithm. The height is the sum of the counts divided
 * by the width of the box, rounded up. The width of each group is its count divided by the height, rounded up.
 */
function stripOf(ids: number[], counts: readonly number[], width: number): Strip {
  let sum = 0;
  for (const i of ids) sum += counts[i]!;
  const rows = Math.max(1, Math.ceil(sum / width - 1e-9));
  return { ids, rows, cols: ids.map((i) => Math.ceil(counts[i]! / rows)) };
}

/** This function gives the mean aspect of the groups of a strip, in elements. */
function meanAspect(strip: Strip): number {
  let sum = 0;
  for (const c of strip.cols) sum += aspectOf(c, strip.rows);
  return sum / strip.cols.length;
}

/**
 * This function gives the quantum strip treemap (QST) of section 3.1 of Bederson, Shneiderman and Wattenberg 2002. The
 * width and the height of each cell are whole multiples of the element size, and each cell holds a grid of its count.
 *
 * 1. The box gets the area of the sum of the counts, in elements. It keeps the aspect of the frame divided by the element
 *    aspect (section 3.2.1).
 * 2. The groups go into horizontal strips in their order. The height of a strip is the sum of its counts divided by the
 *    width of the box, rounded up. The width of each group is its count divided by that height, rounded up.
 * 3. A group joins the current strip. If the mean aspect of the strip gets higher, the group starts the next strip.
 * 4. The ragged right edge becomes straight: each strip gets the width of the widest strip. The empty columns go to the
 *    groups of the strip in turns, from the first group. The paper does not tell the share, so the split is even.
 *
 * The layout in elements can be larger than the box, because a cell holds its count or more. One scale puts the layout in
 * the frame: the element is as large as possible, and the layout starts at the corner of the frame. The cost is `O(n^2)`
 * at most. A count that is not a positive whole number, or an element aspect that is not positive and finite, is a `RangeError`.
 */
export function treemapQuantum(items: readonly QuantumItem[], frame: TreemapFrame, options: QuantumOptions = {}): QuantumLayout {
  const elementAspect = options.elementAspect ?? 1;
  if (!(elementAspect > 0) || !Number.isFinite(elementAspect)) throw new RangeError("The element aspect must be positive and finite.");
  if (!(frame.w > 0) || !(frame.h > 0) || !Number.isFinite(frame.w) || !Number.isFinite(frame.h)) throw new RangeError("A treemap frame needs a positive, finite width and height.");
  for (const item of items) {
    if (!Number.isSafeInteger(item.count) || item.count < 1) throw new RangeError(`The count of "${item.id}" must be a positive whole number.`);
  }
  if (items.length === 0) return { cells: [], element: { w: 0, h: 0 }, grid: { cols: 0, rows: 0 } };
  const counts = items.map((item) => item.count);
  const total = counts.reduce((a, b) => a + b, 0);
  // Step 1: in elements, the box has the area `total` and the aspect of the frame divided by the element aspect.
  const width = Math.sqrt((total * frame.w) / frame.h / elementAspect);
  // Steps 2 up to 5: the strips.
  const strips: Strip[] = [];
  let current: Strip | undefined;
  for (let i = 0; i < counts.length; i += 1) {
    if (current === undefined) {
      current = stripOf([i], counts, width);
      continue;
    }
    const grown = stripOf([...current.ids, i], counts, width);
    if (meanAspect(grown) > meanAspect(current)) {
      strips.push(current);
      current = stripOf([i], counts, width);
    } else current = grown;
  }
  strips.push(current!);
  // Step 6: each strip gets the width of the widest strip.
  const cols = Math.max(...strips.map((s) => s.cols.reduce((a, b) => a + b, 0)));
  for (const strip of strips) {
    const empty = cols - strip.cols.reduce((a, b) => a + b, 0);
    const share = Math.floor(empty / strip.cols.length);
    const rest = empty - share * strip.cols.length;
    strip.cols = strip.cols.map((c, k) => c + share + (k < rest ? 1 : 0));
  }
  const rows = strips.reduce((a, s) => a + s.rows, 0);
  // One scale puts the layout in the frame.
  const h = Math.min(frame.w / (cols * elementAspect), frame.h / rows);
  const w = h * elementAspect;
  const cells: QuantumCell[] = new Array<QuantumCell>(items.length);
  let row = 0;
  for (const strip of strips) {
    let col = 0;
    for (const [k, i] of strip.ids.entries()) {
      const c = strip.cols[k]!;
      cells[i] = { id: items[i]!.id, x: frame.x + col * w, y: frame.y + row * h, w: c * w, h: strip.rows * h, cols: c, rows: strip.rows };
      col += c;
    }
    row += strip.rows;
  }
  return { cells, element: { w, h }, grid: { cols, rows } };
}
