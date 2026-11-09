// The ordered squarified treemap and the spatial treemap of Wood and Dykes 2008 (roadmap item k27). Both are the
// squarified treemap of Bruls 2000, but the next node of a row is the node nearest to a moving position, not the next
// node of the list. The ordered treemap gives the nodes evenly spaced places in the order of the list. The spatial
// treemap gives each node its own point, scaled into the free space.

import { checkFrame, layoutTree, slice, sumOf, worstAspect, type TreemapCell, type TreemapFrame, type TreemapNode } from "./treemap.ts";

/**
 * A node of a spatial treemap. A leaf has a positive weight and a point. A branch has children, and its point is the
 * weighted mean of the points of its children, or the point that it gives. The y axis goes down, as in the frame.
 */
export type SpatialNode =
  | { readonly id: string; readonly weight: number; readonly x: number; readonly y: number; readonly children?: undefined }
  | { readonly id: string; readonly children: readonly SpatialNode[]; readonly weight?: undefined; readonly x?: number; readonly y?: number };

/** A point of the plane. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** A spatial node with the weight of its subtree and its point. */
interface Placed {
  readonly id: string;
  readonly weight: number;
  readonly point: Point;
  readonly kids?: readonly Placed[];
}

/** This function gives the places of the free nodes: the function gives one point for each node of `free`, in a frame. */
type Places = (free: readonly number[], frame: TreemapFrame) => Point[];

/**
 * This function gives the evenly spaced places of `AllocatePosition` of Wood 2008. The spacing `d` is the side of a square
 * of the mean area. The places fill rows along the short side. They go to the nodes in the order of the list, from the
 * place nearest to the corner `(x, y)` of the frame.
 */
function evenPlaces(free: readonly number[], frame: TreemapFrame): Point[] {
  const count = free.length;
  const d = Math.sqrt((frame.w * frame.h) / count);
  const across = frame.w < frame.h;
  const places: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const step = i * d;
    places.push(
      across
        ? { x: frame.x + (step % frame.w), y: frame.y + Math.floor(step / frame.w) * d }
        : { x: frame.x + Math.floor(step / frame.h) * d, y: frame.y + (step % frame.h) },
    );
  }
  const distance = (p: Point): number => Math.hypot(p.x - frame.x, p.y - frame.y);
  return places.map((place, index) => ({ place, index })).sort((a, b) => distance(a.place) - distance(b.place) || a.index - b.index).map((entry) => entry.place);
}

/**
 * This function gives the places of `AllocateGeoPosition` of Wood 2008: an affine map with no rotation takes the box of
 * the points onto the frame. An axis with no spread maps to the middle of the frame.
 */
function mappedPlaces(points: readonly Point[]): Places {
  return (free, frame) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const index of free) {
      const point = points[index]!;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return free.map((index) => {
      const point = points[index]!;
      return {
        x: maxX > minX ? frame.x + ((point.x - minX) / (maxX - minX)) * frame.w : frame.x + frame.w / 2,
        y: maxY > minY ? frame.y + ((point.y - minY) / (maxY - minY)) * frame.h : frame.y + frame.h / 2,
      };
    });
  };
}

/**
 * This function gives the cells of one level. A row grows along the short side of the free space, as in Bruls 2000. The
 * next node of the row is the free node with the place nearest to the position. The position starts at the corner of the
 * free space, and each node moves it by `d` along the row. After each row, the free nodes get new places in the free space.
 */
function orderedRows(weights: readonly number[], frame: TreemapFrame, places: Places): TreemapFrame[] {
  const scale = (frame.w * frame.h) / sumOf(weights);
  const rects: TreemapFrame[] = new Array<TreemapFrame>(weights.length);
  let free = frame;
  let left = weights.map((_, index) => index);
  while (left.length > 0) {
    const at = places(left, free);
    const d = Math.sqrt((free.w * free.h) / left.length);
    const side = Math.min(free.w, free.h);
    const column = free.w >= free.h;
    const taken = new Array<boolean>(left.length).fill(false);
    const members: number[] = [];
    let x = free.x;
    let y = free.y;
    let sum = 0;
    let largest = 0;
    let smallest = Infinity;
    let worst = Infinity;
    while (members.length < left.length) {
      let best = -1;
      let near = Infinity;
      for (let k = 0; k < left.length; k += 1) {
        if (taken[k] === true) continue;
        const distance = Math.hypot(at[k]!.x - x, at[k]!.y - y);
        if (distance < near) {
          near = distance;
          best = k;
        }
      }
      const area = weights[left[best]!]! * scale;
      const next = worstAspect(sum + area, Math.max(largest, area), Math.min(smallest, area), side);
      if (next > worst) break;
      worst = next;
      sum += area;
      largest = Math.max(largest, area);
      smallest = Math.min(smallest, area);
      taken[best] = true;
      members.push(left[best]!);
      if (column) y += d;
      else x += d;
    }
    const depth = sum / side;
    const row = column ? { x: free.x, y: free.y, w: depth, h: free.h } : { x: free.x, y: free.y, w: free.w, h: depth };
    const parts = slice(members.map((index) => weights[index]!), row, !column);
    for (const [index, member] of members.entries()) rects[member] = parts[index]!;
    free = column ? { x: free.x + depth, y: free.y, w: free.w - depth, h: free.h } : { x: free.x, y: free.y + depth, w: free.w, h: free.h - depth };
    left = left.filter((_, k) => taken[k] !== true);
  }
  return rects;
}

/**
 * This function gives the ordered squarified treemap of Wood and Dykes 2008. The nodes of each level get evenly spaced
 * places in the order of the list, from the corner `(x, y)` of the frame. Thus the distance of a cell from that corner
 * grows with its place in the list. The cost of a level of `n` nodes is `O(n^2 log n)` at most.
 */
export function treemapOrdered(nodes: readonly TreemapNode[], frame: TreemapFrame): TreemapCell[] {
  return layoutTree(nodes, frame, (weights, area) => orderedRows(weights, area, evenPlaces));
}

/** This function gives a node with the weight and the point of its subtree. A bad weight or point is a `RangeError`. */
function placedOf(node: SpatialNode): Placed {
  if (node.children === undefined) {
    if (!(node.weight > 0) || !Number.isFinite(node.weight)) throw new RangeError(`The weight of "${node.id}" must be positive and finite.`);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new RangeError(`The point of "${node.id}" must be finite.`);
    return { id: node.id, weight: node.weight, point: { x: node.x, y: node.y } };
  }
  const kids = node.children.map(placedOf);
  if (kids.length === 0) throw new RangeError(`The branch "${node.id}" has no children.`);
  const weight = sumOf(kids.map((kid) => kid.weight));
  if ((node.x === undefined) !== (node.y === undefined)) throw new RangeError(`The branch "${node.id}" needs both x and y, or neither.`);
  if (node.x !== undefined && node.y !== undefined) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new RangeError(`The point of "${node.id}" must be finite.`);
    return { id: node.id, weight, point: { x: node.x, y: node.y }, kids };
  }
  const x = sumOf(kids.map((kid) => kid.point.x * kid.weight)) / weight;
  const y = sumOf(kids.map((kid) => kid.point.y * kid.weight)) / weight;
  return { id: node.id, weight, point: { x, y }, kids };
}

/**
 * This function gives the spatial treemap of Wood and Dykes 2008. At each level, an affine map with no rotation takes the
 * box of the points of the children onto the free space. Then the rows of `treemapOrdered` take the nearest nodes. A
 * cell is near the point of its node, but the map does not keep the points exactly. The cost of a level of `n` nodes is
 * `O(n^2)` at most.
 */
export function treemapSpatial(nodes: readonly SpatialNode[], frame: TreemapFrame): TreemapCell[] {
  checkFrame(frame);
  const cells: TreemapCell[] = [];
  const visit = (group: readonly Placed[], area: TreemapFrame): void => {
    const rects = orderedRows(group.map((node) => node.weight), area, mappedPlaces(group.map((node) => node.point)));
    for (const [index, node] of group.entries()) {
      const rect = rects[index]!;
      if (node.kids === undefined) cells.push({ id: node.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      else visit(node.kids, rect);
    }
  };
  if (nodes.length > 0) visit(nodes.map(placedOf), frame);
  return cells;
}
