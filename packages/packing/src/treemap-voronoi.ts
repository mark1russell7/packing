// The Voronoi treemap of Nocaj and Brandes 2012, "Computing Voronoi Treemaps", Algorithms 1 and 2 (roadmap item k27).
// A Voronoi treemap cuts a convex polygon into convex cells. The area of each cell is near the share of the weight of
// its node. The functions of this file are standalone, as the treemaps of `treemap.ts` are.
//
// This file differs from the paper in one step. The paper gets each power diagram from a lower convex hull in 3D, in
// O(n log n) time for n sites. This file clips the region by the half-plane of each other site, in O(n^2) time. The cells
// are the same. Algorithm 4 of the paper, the heuristic for fewer iterations, is not in this file, because the paper
// does not give the size of its displacement.

import { clipRing, pointSegmentDistance, ringCentroid, type Point, type Ring } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { mulberry32 } from "./strategy.ts";
import { sizedOf, sumOf, treemapBoxes, type Sized, type TreemapBox, type TreemapNode } from "./treemap.ts";

/** The options of `treemapVoronoi` and `treemapVoronoiPack`. Each default is in `TREEMAP_VORONOI_DEFAULTS`. */
export interface TreemapVoronoiOptions {
  /** The seed of the random first sites of each level. */
  readonly seed?: number;
  /** The maximum count of iterations of Algorithm 1 for one level: `imax` of the paper. */
  readonly maxIterations?: number;
  /** The area error that stops the iterations of one level: `Ethreshold` of the paper. */
  readonly threshold?: number;
}

/** The default options of `treemapVoronoi`. */
export const TREEMAP_VORONOI_DEFAULTS: Readonly<Required<TreemapVoronoiOptions>> = Object.freeze({ seed: 1, maxIterations: 300, threshold: 0.01 });

/** The cell of a leaf in a Voronoi treemap: a convex ring with a positive signed area, and the id of the leaf. */
export interface VoronoiCell {
  readonly id: string;
  readonly ring: Ring;
}

/**
 * This function gives a Voronoi treemap of a convex region: one cell for each leaf, in the depth-first order of the leaves.
 * Each level of the tree gets the steps of Algorithm 1 of Nocaj and Brandes 2012 in the cell of its parent.
 *
 * - The area error of a level is the sum of the differences between the area and the target of each cell. The sum is
 *   divided by 2 times the area of the level. The steps of a level stop at the error `threshold` or after `maxIterations`.
 * - A region with less than 3 corners, a region with no area and a region that is not convex are a `RangeError`.
 * - A weight that is not positive and finite and a branch with no children are a `RangeError`.
 * - The same nodes, region and options give the same cells.
 */
export function treemapVoronoi(nodes: readonly TreemapNode[], region: Ring, options: TreemapVoronoiOptions = {}): VoronoiCell[] {
  const settings = settingsOf(options);
  const outer = convexRing(region);
  const kids = nodes.map(sizedOf);
  const random = mulberry32(settings.seed);
  const cells: VoronoiCell[] = [];
  const walk = (level: readonly Sized[], ring: Ring): void => {
    const rings = powerLevel(
      level.map((kid) => kid.weight),
      ring,
      random,
      settings,
    );
    for (const [index, kid] of level.entries()) {
      if (kid.kids === undefined) cells.push({ id: kid.id, ring: rings[index]! });
      else walk(kid.kids, rings[index]!);
    }
  };
  if (kids.length > 0) walk(kids, outer);
  return cells;
}

/**
 * This function packs boxes with a Voronoi treemap, as `treemapPack` packs with a treemap of rectangles. The weight of
 * each box is its area with its margin and the gap. Each box goes to the centroid of its cell and keeps its size. The
 * cells scale up until each box fits in its cell, so the boxes do not overlap.
 *
 * - The region is a rectangle with the area of the boxes and the aspect of the container.
 * - A cell is convex. Thus a box fits in its cell when each corner of the box is on the inner side of each side of the cell.
 * - The container must be free, because the scale sets the size. An obstacle is a `RangeError`.
 */
export function treemapVoronoiPack(input: PackInput, options: TreemapVoronoiOptions = {}): PackOutput {
  const boxes = treemapBoxes(input, "treemapVoronoiPack");
  if (boxes.length === 0) return { placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] };
  const area = sumOf(boxes.map((box) => box.w * box.h));
  const aspect = input.container.aspect ?? 1;
  const w = Math.sqrt(area * aspect);
  const h = Math.sqrt(area / aspect);
  const nodes = boxes.map((box) => ({ id: box.id, weight: box.w * box.h }));
  const region: Ring = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const cells = treemapVoronoi(nodes, region, options);
  const centers = cells.map((cell) => ringCentroid(cell.ring));
  let scale = 1;
  for (const [index, box] of boxes.entries()) scale = Math.max(scale, fitScale(cells[index]!.ring, centers[index]!, box));
  const placements = boxes.map((box, index) => {
    const center = centers[index]!;
    return { id: box.id, x: center.x * scale - box.w / 2 + box.left, y: center.y * scale - box.h / 2 + box.top };
  });
  return { placements, overflow: [], size: { w: w * scale, h: h * scale }, moved: [] };
}

/** The options with their defaults. A seed that is not finite, a count that is not a positive integer and a bad threshold are a `RangeError`. */
function settingsOf(options: TreemapVoronoiOptions): Required<TreemapVoronoiOptions> {
  const settings = { ...TREEMAP_VORONOI_DEFAULTS, ...options };
  if (!Number.isFinite(settings.seed)) throw new RangeError("The seed of treemapVoronoi must be finite.");
  if (!Number.isInteger(settings.maxIterations) || settings.maxIterations < 1) throw new RangeError("The maxIterations of treemapVoronoi must be a positive integer.");
  if (!(settings.threshold >= 0) || !Number.isFinite(settings.threshold)) throw new RangeError("The threshold of treemapVoronoi must be finite and not negative.");
  return settings;
}

/** This function gives the signed area of a ring by the shoelace formula, with the corners relative to the first corner. */
function signedArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  const [ox, oy] = ring[0]!;
  let twice = 0;
  for (let i = 1; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[i + 1]!;
    twice += (ax - ox) * (by - oy) - (bx - ox) * (ay - oy);
  }
  return twice / 2;
}

/** This function gives the region with a positive signed area. A region that is not a convex ring with an area is a `RangeError`. */
function convexRing(region: Ring): Ring {
  if (region.length < 3) throw new RangeError("treemapVoronoi needs a region with at least 3 corners.");
  for (const [x, y] of region) if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("Each corner of the region of treemapVoronoi must be finite.");
  const area = signedArea(region);
  if (area === 0) throw new RangeError("treemapVoronoi needs a region with an area.");
  const ring = area > 0 ? region : [...region].reverse();
  // A convex ring turns left at each corner, and its turns add up to one full turn.
  let turned = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const [cx, cy] = ring[(i + 2) % ring.length]!;
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    const dot = (bx - ax) * (cx - bx) + (by - ay) * (cy - by);
    if (cross < 0) throw new RangeError("treemapVoronoi needs a convex region.");
    turned += Math.atan2(cross, dot);
  }
  if (turned > 3 * Math.PI) throw new RangeError("treemapVoronoi needs a convex region.");
  return ring;
}

/**
 * This function gives the cells of one level: Algorithm 1 of the paper in the convex `region`, with the steps of
 * Algorithm 2. The sites start at random places in the region, each with the weight `floor`.
 */
function powerLevel(weights: readonly number[], region: Ring, random: () => number, settings: Required<TreemapVoronoiOptions>): Ring[] {
  const n = weights.length;
  if (n === 1) return [region];
  const area = signedArea(region);
  const total = sumOf(weights);
  const targets = weights.map((weight) => (area * weight) / total);
  const sites = startSites(n, region, random);
  // The paper starts each weight at a small constant below the distance between 2 sites (Lemma 1).
  const floor = Math.min(1e-8 * (area / n), (Math.min(...nearestDistances(sites)) / 2) ** 2);
  const power = new Array<number>(n).fill(floor);
  let cells = powerCells(region, sites, power);
  for (let iteration = 0; iteration < settings.maxIterations; iteration++) {
    // AdaptPositionsWeights: each site goes to the centroid of its cell, and its circle stays in its cell.
    for (let s = 0; s < n; s++) {
      const center = ringCentroid(cells[s]!);
      sites[s] = center;
      power[s] = Math.min(Math.sqrt(power[s]!), borderDistance(center, cells[s]!)) ** 2;
    }
    cells = powerCells(region, sites, power);
    // AdaptWeights: each radius grows by the ratio of the target and the area, up to the distance to the nearest site.
    const nearest = nearestDistances(sites);
    for (let s = 0; s < n; s++) {
      const current = signedArea(cells[s]!);
      const grown = current > 0 ? Math.sqrt(power[s]!) * (targets[s]! / current) : Number.POSITIVE_INFINITY;
      const next = Math.min(grown, nearest[s]!) ** 2;
      // The floor of line 15 applies only below the nearest site, so that invariant (2) of the paper holds.
      power[s] = next < floor && floor < nearest[s]! ** 2 ? floor : next;
    }
    cells = powerCells(region, sites, power);
    if (areaError(cells, targets, area) < settings.threshold) break;
  }
  return cells;
}

/** This function gives the area error of the paper: the sum of the differences to the targets, divided by 2 times the area. */
function areaError(cells: readonly Ring[], targets: readonly number[], area: number): number {
  let sum = 0;
  for (const [index, cell] of cells.entries()) sum += Math.abs(signedArea(cell) - targets[index]!);
  return sum / (2 * area);
}

/**
 * This function gives the power cell of each site in the region. The cell of the site `s` is the part of the region
 * where `|x - s|^2 - w(s) <= |x - t|^2 - w(t)` for each other site `t`. The steps use the corners relative to `s`.
 */
function powerCells(region: Ring, sites: readonly Point[], power: readonly number[]): Ring[] {
  return sites.map((site, i) => {
    let ring: Ring = region.map(([x, y]) => [x - site.x, y - site.y] as const);
    for (let j = 0; j < sites.length && ring.length > 0; j++) {
      if (j === i) continue;
      const tx = sites[j]!.x - site.x;
      const ty = sites[j]!.y - site.y;
      ring = clipRing(ring, 2 * tx, 2 * ty, tx * tx + ty * ty - power[j]! + power[i]!);
    }
    return ring.map(([x, y]) => [x + site.x, y + site.y] as const);
  });
}

/** This function gives the distance from each site to its nearest other site. */
function nearestDistances(sites: readonly Point[]): number[] {
  return sites.map((site, i) => {
    let best = Number.POSITIVE_INFINITY;
    for (const [j, other] of sites.entries()) if (j !== i) best = Math.min(best, Math.hypot(other.x - site.x, other.y - site.y));
    return best;
  });
}

/** This function gives the distance from a point to the nearest side of a ring. */
function borderDistance(point: Point, ring: Ring): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    best = Math.min(best, pointSegmentDistance(point, { x: ax, y: ay }, { x: bx, y: by }));
  }
  return best;
}

/**
 * This function gives `n` different random sites inside a convex region. Each site is in a triangle of a fan from the
 * first corner, with the chance of the area of the triangle. A site on the border or on an old site gets a new draw.
 */
function startSites(n: number, region: Ring, random: () => number): Point[] {
  const [ox, oy] = region[0]!;
  const fan: { readonly area: number; readonly b: readonly [number, number]; readonly c: readonly [number, number] }[] = [];
  for (let i = 1; i + 1 < region.length; i++) {
    const b = region[i]!;
    const c = region[i + 1]!;
    fan.push({ area: ((b[0] - ox) * (c[1] - oy) - (c[0] - ox) * (b[1] - oy)) / 2, b, c });
  }
  const total = sumOf(fan.map((part) => part.area));
  const sites: Point[] = [];
  while (sites.length < n) {
    let pick = random() * total;
    let part = fan[fan.length - 1]!;
    for (const candidate of fan) {
      if (pick < candidate.area) {
        part = candidate;
        break;
      }
      pick -= candidate.area;
    }
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const site = { x: ox + u * (part.b[0] - ox) + v * (part.c[0] - ox), y: oy + u * (part.b[1] - oy) + v * (part.c[1] - oy) };
    if (borderDistance(site, region) > 0 && !sites.some((old) => old.x === site.x && old.y === site.y)) sites.push(site);
  }
  return sites;
}

/**
 * This function gives the smallest scale of a convex cell that holds the box at the centroid `center`. For each side
 * with the outer normal `n`, the scale `k` needs `k * (n . (p - center)) >= |n.x| * w / 2 + |n.y| * h / 2`.
 */
function fitScale(ring: Ring, center: Point, box: TreemapBox): number {
  let scale = 0;
  for (let i = 0; i < ring.length; i++) {
    const [px, py] = ring[i]!;
    const [qx, qy] = ring[(i + 1) % ring.length]!;
    const nx = qy - py;
    const ny = px - qx;
    if (nx === 0 && ny === 0) continue;
    const slack = nx * (px - center.x) + ny * (py - center.y);
    const need = (Math.abs(nx) * box.w) / 2 + (Math.abs(ny) * box.h) / 2;
    scale = Math.max(scale, slack > 0 ? need / slack : Number.POSITIVE_INFINITY);
  }
  return scale;
}
