// The strategy `circle-quasi-physical` of roadmap item k94 (`docs/PACKER.md`, "Circles in a circle by the overlap energy", idea S5 of the
// survey). It packs circle items into a circle: a local solve lowers the elastic energy of the overlaps, and quasi-human moves leave
// each local minimum (Wang 2002, Huang 2011b, Huang 1999). Nothing default uses it.

import { DEFAULT_TOLERANCE, marginOf, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { containerBounds } from "./frame.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The options of the strategy `circle-quasi-physical` */
export interface CircleQuasiPhysicalOptions {
  /** The count of the moves after the first layout. The value 0 keeps the first local minimum. The default is 256. */
  iterations: number;
}

/** The largest value of the option `iterations` */
export const CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS = 65536;

/** The id of the trace stage of `circle-quasi-physical` */
export const CIRCLE_QUASI_PHYSICAL_STAGE = "circle-quasi-physical";

/** The count of the steps that the limited-memory method keeps */
const MEMORY = 6;

/** The energy that counts as no overlap, in units of the largest radius squared */
const CLEAR = 1e-20;

/** The size of the gradient at which a solve stops */
const FLAT = 1e-10;

/** The most energy evaluations of the solve after one move */
const MOVE_EVALS = 400;

/** The most energy evaluations of one penalty level of a radius solve */
const LEVEL_EVALS = 1200;

/** The penalties on the radius of a quick radius solve, from high to low */
const QUICK_LEVELS: readonly number[] = [1e-3, 1e-4, 1e-5, 1e-6];

/** The penalties that the last radius solve adds */
const DEEP_LEVELS: readonly number[] = [1e-7, 1e-8, 1e-9, 1e-10];

/** The share by which the target radius of the moves is below the best radius, for equal circles. */
const SQUEEZE_EQUAL = 0.002;

/** The share by which the target radius of the moves is below the best radius, for unequal circles. Their energy needs a larger signal. */
const SQUEEZE_UNEQUAL = 0.01;

/** The relative gain of the radius that counts as a new best radius */
const GAIN = 1e-10;

/** The permitted relative radius error of a container of fixed size, after the last scale */
const FIT = 1e-9;

/** The density of the first free layout */
const START_DENSITY = 0.7;

/** The count of the random places that a relocation tries */
const PLACES = 24;

/** The share of the circles that a kick moves */
const KICK = 0.1;

/** The count of the recent moved circles that a relocation does not take */
const TENURE = 6;

/** The share of the moves on unequal circles that swap two circles */
const SWAP_SHARE = 0.6;

/** The point below which a move relocates a circle, and above which a move shakes some circles. */
const RELOCATE_BELOW = 0.8;

/** The share of the moves on unequal circles that take a random circle, not the circle with the most pain */
const RANDOM_PICK = 0.5;

/** The count of the moves without a gain, for each circle, that starts a kick */
const PATIENCE = 6;

/** The reach of a swap: the circles within `n / REACH` places in the order of the radii. */
const REACH = 12;

/** One packing problem in units of the largest radius: `dim` is `2 n + 1`, because the radius is the last coordinate of a free solve. */
interface Model {
  n: number;
  dim: number;
  /** The radius of each circle: `r` plus the largest side of the margin plus half the gap. */
  r: Float64Array;
  /** The least distance of the centers of each pair, by `i * n + j`. */
  sep: Float64Array;
  /** The value `true` tells that each circle has the same radius. */
  equal: boolean;
  /** The count of the energy evaluations. */
  evals: number;
}

/** A solve at a fixed radius (`mu` is 0), or with the radius as a variable and the penalty `mu` on it. */
interface Solve {
  radius: number;
  mu: number;
  maxEvals: number;
}

/** The work arrays of the local solve. */
interface Work {
  g: Float64Array;
  next: Float64Array;
  gNext: Float64Array;
  dir: Float64Array;
  s: Float64Array[];
  y: Float64Array[];
  rho: Float64Array;
  alpha: Float64Array;
}

/** A layout with no overlap: the centers and the radius of the container. */
interface Tight {
  v: Float64Array;
  radius: number;
}

/**
 * This function gives the energy of a layout, and it writes the gradient to `g`. Each overlap adds its square, with a wall as one more item.
 * With `mu` above 0, the radius is the coordinate `2 n` and the energy adds `mu` times the radius.
 */
function energy(m: Model, v: Float64Array, solve: Solve, g: Float64Array): number {
  m.evals++;
  const { n, r, sep } = m;
  const free = solve.mu > 0;
  const radius = free ? v[2 * n]! : solve.radius;
  g.fill(0);
  let e = free ? solve.mu * radius : 0;
  let wall = 0;
  for (let i = 0; i < n; i++) {
    const xi = v[2 * i]!;
    const yi = v[2 * i + 1]!;
    const row = i * n;
    for (let j = i + 1; j < n; j++) {
      const s = sep[row + j]!;
      const dx = xi - v[2 * j]!;
      if (dx >= s || dx <= -s) continue;
      const dy = yi - v[2 * j + 1]!;
      if (dy >= s || dy <= -s) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= s * s) continue;
      const d = Math.sqrt(d2);
      const o = s - d;
      e += o * o;
      // Two centers at one point push apart along x. The order of the items gives the direction.
      const fx = d > 0 ? (2 * o * dx) / d : 2 * o;
      const fy = d > 0 ? (2 * o * dy) / d : 0;
      g[2 * i]! -= fx;
      g[2 * i + 1]! -= fy;
      g[2 * j]! += fx;
      g[2 * j + 1]! += fy;
    }
    const rho = Math.sqrt(xi * xi + yi * yi);
    const o = rho + r[i]! - radius;
    if (o > 0) {
      e += o * o;
      wall += 2 * o;
      if (rho > 0) {
        g[2 * i]! += (2 * o * xi) / rho;
        g[2 * i + 1]! += (2 * o * yi) / rho;
      }
    }
  }
  if (free) g[2 * n] = solve.mu - wall;
  return e;
}

/** This function gives the dot product of two vectors. */
function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/**
 * This function lowers the energy of a layout in place with the limited-memory method of Liu and Nocedal, and it gives the energy.
 * A backtracking line search keeps each step. The solve stops at `CLEAR`, on a flat gradient, or at `maxEvals` energy evaluations.
 */
function descend(m: Model, v: Float64Array, solve: Solve, w: Work): number {
  const free = solve.mu > 0;
  const stopAt = m.evals + solve.maxEvals;
  let f = energy(m, v, solve, w.g);
  let stored = 0;
  let head = 0;
  while (m.evals < stopAt) {
    if (!free && f <= CLEAR) break;
    const size = dot(w.g, w.g);
    if (size <= FLAT * FLAT) break;
    // The two loops of the method: they turn the gradient into a direction.
    w.dir.set(w.g);
    for (let k = 0; k < stored; k++) {
      const at = (head - 1 - k + MEMORY * 2) % MEMORY;
      const a = w.rho[at]! * dot(w.s[at]!, w.dir);
      w.alpha[at] = a;
      const y = w.y[at]!;
      for (let i = 0; i < w.dir.length; i++) w.dir[i]! -= a * y[i]!;
    }
    if (stored > 0) {
      const last = (head - 1 + MEMORY) % MEMORY;
      const scale = 1 / (w.rho[last]! * dot(w.y[last]!, w.y[last]!));
      for (let i = 0; i < w.dir.length; i++) w.dir[i]! *= scale;
    }
    for (let k = stored - 1; k >= 0; k--) {
      const at = (head - 1 - k + MEMORY * 2) % MEMORY;
      const b = w.rho[at]! * dot(w.y[at]!, w.dir);
      const s = w.s[at]!;
      const c = w.alpha[at]! - b;
      for (let i = 0; i < w.dir.length; i++) w.dir[i]! += c * s[i]!;
    }
    for (let i = 0; i < w.dir.length; i++) w.dir[i] = -w.dir[i]!;
    let slope = dot(w.dir, w.g);
    if (slope >= 0) {
      for (let i = 0; i < w.dir.length; i++) w.dir[i] = -w.g[i]!;
      slope = -size;
      stored = 0;
    }
    let step = stored === 0 ? Math.min(1, 1 / Math.sqrt(size)) : 1;
    let done = false;
    for (let tries = 0; tries < 24 && m.evals < stopAt; tries++) {
      for (let i = 0; i < v.length; i++) w.next[i] = v[i]! + step * w.dir[i]!;
      const fNext = energy(m, w.next, solve, w.gNext);
      if (fNext <= f + 1e-4 * step * slope) {
        const s = w.s[head]!;
        const y = w.y[head]!;
        let sy = 0;
        for (let i = 0; i < v.length; i++) {
          s[i] = w.next[i]! - v[i]!;
          y[i] = w.gNext[i]! - w.g[i]!;
          sy += s[i]! * y[i]!;
        }
        if (sy > 1e-16) {
          w.rho[head] = 1 / sy;
          head = (head + 1) % MEMORY;
          stored = Math.min(stored + 1, MEMORY);
        }
        v.set(w.next);
        w.g.set(w.gNext);
        f = fNext;
        done = true;
        break;
      }
      step /= 2;
    }
    if (!done) {
      if (stored === 0) break;
      stored = 0;
    }
  }
  return f;
}

/**
 * This function gives the smallest radius of a layout with no overlap.
 * It grows the centers until no pair overlaps, then it reads the outermost circle. Thus each radius that a run keeps is exact, and no energy tolerance is in it.
 */
function tighten(m: Model, v: Float64Array): Tight {
  const { n, r, sep } = m;
  let grow = 1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = v[2 * i]! - v[2 * j]!;
      const dy = v[2 * i + 1]! - v[2 * j + 1]!;
      const d2 = dx * dx + dy * dy;
      const s = sep[i * n + j]!;
      if (d2 > 0 && s * s > d2 * grow * grow) grow = s / Math.sqrt(d2);
    }
  // The factor is above 1 by a few units of the rounding, so a pair at the limit does not overlap.
  grow *= 1 + 8e-16;
  const out = new Float64Array(m.dim);
  let radius = 0;
  for (let i = 0; i < n; i++) {
    const x = v[2 * i]! * grow;
    const y = v[2 * i + 1]! * grow;
    out[2 * i] = x;
    out[2 * i + 1] = y;
    radius = Math.max(radius, Math.sqrt(x * x + y * y) + r[i]!);
  }
  out[2 * n] = radius;
  return { v: out, radius };
}

/** This function solves a copy of a layout with the radius as a variable, over a list of penalties. It gives the exact radius. */
function shrink(m: Model, v: Float64Array, radius: number, levels: readonly number[], w: Work): Tight {
  const solved = v.slice();
  solved[2 * m.n] = radius;
  for (const mu of levels) descend(m, solved, { radius, mu, maxEvals: LEVEL_EVALS }, w);
  return tighten(m, solved);
}

/** This function gives a random point in a disc of a radius, with no trigonometry, so each platform gives the same bytes. */
function pointIn(rng: () => number, radius: number): [number, number] {
  for (;;) {
    const x = 2 * rng() - 1;
    const y = 2 * rng() - 1;
    if (x * x + y * y <= 1) return [x * radius, y * radius];
  }
}

/** This function gives the pain of each circle at a radius. The pain is the sum of the squares of its overlaps, as a share of its squared radius. */
function painOf(m: Model, v: Float64Array, radius: number): Float64Array {
  const { n, r, sep } = m;
  const pain = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = v[2 * i]!;
    const y = v[2 * i + 1]!;
    for (let j = i + 1; j < n; j++) {
      const s = sep[i * n + j]!;
      const dx = x - v[2 * j]!;
      const dy = y - v[2 * j + 1]!;
      const d2 = dx * dx + dy * dy;
      if (d2 >= s * s) continue;
      const o = s - Math.sqrt(d2);
      pain[i]! += o * o;
      pain[j]! += o * o;
    }
    const o = Math.sqrt(x * x + y * y) + r[i]! - radius;
    if (o > 0) pain[i]! += o * o;
  }
  for (let i = 0; i < n; i++) if (r[i]! > 0) pain[i]! /= r[i]! * r[i]!;
  return pain;
}

/** This function gives the energy of one circle at a place, with the other circles and the wall. */
function placeEnergy(m: Model, v: Float64Array, radius: number, c: number, x: number, y: number): number {
  const { n, r, sep } = m;
  let e = 0;
  for (let j = 0; j < n; j++) {
    if (j === c) continue;
    const s = sep[c * n + j]!;
    const dx = x - v[2 * j]!;
    const dy = y - v[2 * j + 1]!;
    const d2 = dx * dx + dy * dy;
    if (d2 < s * s) {
      const o = s - Math.sqrt(d2);
      e += o * o;
    }
  }
  const o = Math.sqrt(x * x + y * y) + r[c]! - radius;
  return o > 0 ? e + o * o : e;
}

/** This function moves one circle to the best of `PLACES` random places. This is the quasi-human relocation of Huang 1999. */
function relocate(m: Model, v: Float64Array, radius: number, c: number, rng: () => number): void {
  const inner = Math.max(radius - m.r[c]!, 0);
  let bestE = Infinity;
  let bestX = v[2 * c]!;
  let bestY = v[2 * c + 1]!;
  for (let k = 0; k < PLACES; k++) {
    const [x, y] = pointIn(rng, inner);
    const e = placeEnergy(m, v, radius, c, x, y);
    if (e < bestE) {
      bestE = e;
      bestX = x;
      bestY = y;
    }
  }
  v[2 * c] = bestX;
  v[2 * c + 1] = bestY;
}

/** This function gives the circle with the largest pain that is not in `tabu`. A tie goes to the earlier circle. */
function worst(pain: Float64Array, tabu: readonly number[]): number {
  let at = 0;
  let most = -1;
  for (let i = 0; i < pain.length; i++) {
    if (pain[i]! > most && !tabu.includes(i)) {
      most = pain[i]!;
      at = i;
    }
  }
  return at;
}

/** This function gives a random circle that is near a circle `c` in the order of the radii, with a different radius. It gives `c` when there is none. */
function swapPartner(m: Model, order: Int32Array, rank: Int32Array, c: number, rng: () => number): number {
  const reach = Math.max(2, Math.ceil(m.n / REACH));
  for (let tries = 0; tries < 8; tries++) {
    const to = rank[c]! + Math.floor(rng() * (2 * reach + 1)) - reach;
    if (to < 0 || to >= m.n) continue;
    const o = order[to]!;
    if (m.r[o] !== m.r[c]) return o;
  }
  return c;
}

/** The state of the moves of one run. */
interface Moves {
  m: Model;
  rng: () => number;
  order: Int32Array;
  rank: Int32Array;
  tabu: number[];
}

/**
 * This function changes a layout with one move. It relocates the circle with the most pain, swaps two circles of near radii, or
 * shakes the circles near a random circle. Equal circles have no swap.
 */
function move(s: Moves, v: Float64Array, radius: number): void {
  const { m, rng } = s;
  const pick = rng();
  const c = !m.equal && rng() < RANDOM_PICK ? Math.floor(rng() * m.n) : worst(painOf(m, v, radius), s.tabu);
  s.tabu.push(c);
  if (s.tabu.length > Math.min(TENURE, m.n - 1)) s.tabu.shift();
  if (!m.equal && pick < SWAP_SHARE) {
    const o = swapPartner(m, s.order, s.rank, c, rng);
    const x = v[2 * c]!;
    const y = v[2 * c + 1]!;
    v[2 * c] = v[2 * o]!;
    v[2 * c + 1] = v[2 * o + 1]!;
    v[2 * o] = x;
    v[2 * o + 1] = y;
    return;
  }
  if (pick < RELOCATE_BELOW) {
    relocate(m, v, radius, c, rng);
    return;
  }
  const centre = Math.floor(rng() * m.n);
  const cx = v[2 * centre]!;
  const cy = v[2 * centre + 1]!;
  const reach = 2 * m.r[centre]! + 2 * meanRadius(m);
  for (let i = 0; i < m.n; i++) {
    const dx = v[2 * i]! - cx;
    const dy = v[2 * i + 1]! - cy;
    if (dx * dx + dy * dy > reach * reach) continue;
    v[2 * i]! += (rng() - 0.5) * m.r[i]!;
    v[2 * i + 1]! += (rng() - 0.5) * m.r[i]!;
  }
}

/** This function gives the mean radius of the circles. */
function meanRadius(m: Model): number {
  let sum = 0;
  for (let i = 0; i < m.n; i++) sum += m.r[i]!;
  return sum / m.n;
}

/** This function relocates a share of the circles at random. The run does this after many moves without a gain. */
function kick(s: Moves, v: Float64Array, radius: number): void {
  const count = Math.max(1, Math.ceil(s.m.n * KICK));
  for (let k = 0; k < count; k++) relocate(s.m, v, radius, Math.floor(s.rng() * s.m.n), s.rng);
}

/** This function gives the new work arrays of a solve. */
function workOf(dim: number): Work {
  const list = (): Float64Array[] => Array.from({ length: MEMORY }, () => new Float64Array(dim));
  const one = (): Float64Array => new Float64Array(dim);
  return { g: one(), next: one(), gNext: one(), dir: one(), s: list(), y: list(), rho: new Float64Array(MEMORY), alpha: new Float64Array(MEMORY) };
}

/** This function makes the state of the moves of a model. */
function movesOf(m: Model, rng: () => number): Moves {
  const order = Int32Array.from({ length: m.n }, (_, i) => i);
  order.sort((a, b) => m.r[a]! - m.r[b]! || a - b);
  const rank = new Int32Array(m.n);
  for (let k = 0; k < m.n; k++) rank[order[k]!] = k;
  return { m, rng, order, rank, tabu: [] };
}

/** The result of a search: the best layout, with the count of the kept moves. */
interface Found {
  tight: Tight;
  kept: number;
  moves: number;
}

/**
 * This function searches the smallest radius of a container of free size. Each move works at a target radius below the best radius.
 * A move that lowers the energy stays, and a radius solve then measures the exact radius of the layout. The search keeps the best one.
 */
function searchFree(m: Model, iterations: number, rng: () => number, w: Work): Found {
  const start = new Float64Array(m.dim);
  if (m.n === 1) {
    start[2] = m.r[0]!;
    return { tight: { v: start, radius: m.r[0]! }, kept: 0, moves: 0 };
  }
  let area = 0;
  for (let i = 0; i < m.n; i++) area += m.r[i]! * m.r[i]!;
  const first = Math.sqrt(area / START_DENSITY);
  for (let i = 0; i < m.n; i++) {
    const [x, y] = pointIn(rng, Math.max(first - m.r[i]!, 0));
    start[2 * i] = x;
    start[2 * i + 1] = y;
  }
  let best = shrink(m, start, first, QUICK_LEVELS, w);
  const s = movesOf(m, rng);
  const patience = Math.max(32, PATIENCE * m.n);
  let kept = 0;
  let stale = 0;
  const squeeze = m.equal ? SQUEEZE_EQUAL : SQUEEZE_UNEQUAL;
  let target = 0;
  let current = best.v;
  let eCurrent = 0;
  /** This function solves the best layout at a target below its radius. A target with no overlap gives a new best radius, and one more turn. */
  const aim = (): void => {
    for (;;) {
      target = best.radius * (1 - squeeze);
      current = best.v.slice();
      eCurrent = descend(m, current, { radius: target, mu: 0, maxEvals: MOVE_EVALS }, w);
      if (eCurrent > CLEAR) return;
      const tight = shrink(m, current, target, QUICK_LEVELS, w);
      if (tight.radius >= best.radius) return;
      best = tight;
    }
  };
  aim();
  for (let k = 0; k < iterations; k++) {
    const tried = current.slice();
    move(s, tried, target);
    const e = descend(m, tried, { radius: target, mu: 0, maxEvals: MOVE_EVALS }, w);
    if (e < eCurrent) {
      kept++;
      current = tried;
      eCurrent = e;
      const tight = shrink(m, tried, target, QUICK_LEVELS, w);
      if (tight.radius < best.radius * (1 - GAIN)) {
        best = tight;
        stale = 0;
        aim();
        continue;
      }
    }
    if (++stale >= patience) {
      stale = 0;
      kick(s, current, target);
      eCurrent = descend(m, current, { radius: target, mu: 0, maxEvals: MOVE_EVALS }, w);
    }
  }
  const last = shrink(m, best.v, best.radius, DEEP_LEVELS, w);
  if (last.radius < best.radius) best = last;
  return { tight: best, kept, moves: iterations };
}

/** The result of a search in a container of fixed size: the layout and its energy, with the count of the kept moves. */
interface Fixed {
  v: Float64Array;
  energy: number;
  kept: number;
  moves: number;
}

/** This function lowers the energy at a fixed radius with moves. It stops at the first layout with no overlap. */
function searchFixed(m: Model, radius: number, iterations: number, rng: () => number, w: Work): Fixed {
  const v = new Float64Array(m.dim);
  for (let i = 0; i < m.n; i++) {
    const [x, y] = pointIn(rng, Math.max(radius - m.r[i]!, 0));
    v[2 * i] = x;
    v[2 * i + 1] = y;
  }
  const solve: Solve = { radius, mu: 0, maxEvals: MOVE_EVALS };
  let current = v;
  let eCurrent = descend(m, current, solve, w);
  let best = current.slice();
  let eBest = eCurrent;
  const s = movesOf(m, rng);
  const patience = Math.max(32, PATIENCE * m.n);
  let kept = 0;
  let stale = 0;
  let k = 0;
  for (; k < iterations && eBest > CLEAR; k++) {
    const tried = current.slice();
    move(s, tried, radius);
    const e = descend(m, tried, solve, w);
    if (e < eCurrent) {
      kept++;
      current = tried;
      eCurrent = e;
      stale = 0;
      if (e < eBest) {
        best = tried.slice();
        eBest = e;
      }
    } else if (++stale >= patience) {
      stale = 0;
      kick(s, current, radius);
      eCurrent = descend(m, current, solve, w);
    }
  }
  return { v: best, energy: eBest, kept, moves: k };
}

/** This function gives the model of some circles, with a new table of the least distances. */
function modelOf(r: readonly number[], sep: (i: number, j: number) => number): Model {
  const n = r.length;
  const table = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = sep(i, j);
      table[i * n + j] = s;
      table[j * n + i] = s;
    }
  return { n, dim: 2 * n + 1, r: Float64Array.from(r), sep: table, equal: r.every((x) => x === r[0]), evals: 0 };
}

/** One circle item: its index in the input, its id, its radius with the margin and half the gap, and the center in its box. */
interface Disc {
  index: number;
  id: string;
  r: number;
  R: number;
  ox: number;
  oy: number;
}

/** This function gives the circle discs of an input. */
function discsOf(input: PackInput): Disc[] {
  const half = (input.gap ?? 0) / 2;
  return input.items.map((item, index): Disc => {
    const s = item.shape;
    if (s?.kind !== "circle") throw new RangeError(`The strategy circle-quasi-physical packs only circles, but the item ${item.id} is not a circle.`);
    const m = marginOf(item);
    return { index, id: item.id, r: s.r, R: s.r + Math.max(m.top, m.right, m.bottom, m.left) + half, ox: s.cx, oy: s.cy };
  });
}

/** This function gives the least distance of each pair of discs by a new model. A pair of `pairGaps` keeps its gap, when that is more. */
function pairTable(input: PackInput, discs: readonly Disc[]): (a: number, b: number) => number {
  const at = new Map(discs.map((d, k) => [d.id, k]));
  const n = discs.length;
  const pair = new Map<number, number>();
  for (const p of input.pairGaps ?? []) {
    const i = at.get(p.a);
    const j = at.get(p.b);
    if (i === undefined || j === undefined || i === j) continue;
    const s = discs[i]!.r + discs[j]!.r + p.gap;
    pair.set(i * n + j, s);
    pair.set(j * n + i, s);
  }
  return (a, b) => Math.max(discs[a]!.R + discs[b]!.R, pair.get(a * n + b) ?? 0);
}

/** This function checks the options of `circle-quasi-physical`. It throws a `RangeError` for a bad value. */
function checkOptions(o: CircleQuasiPhysicalOptions): void {
  if (!Number.isInteger(o.iterations) || o.iterations < 0 || o.iterations > CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS)
    throw new RangeError(`The option iterations of circle-quasi-physical is a whole number from 0 to ${CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS}, not ${String(o.iterations)}.`);
}

/** The measures of the trace of a run. */
interface RunFacts {
  overflow: number;
  radius: number;
  moves: number;
  kept: number;
  evals: number;
}

/** This function gives the output of a run: the top-left corner of the box of each disc, in the order of the input. */
function outputOf(discs: readonly Disc[], ids: readonly number[], at: Float64Array, unit: number, cx: number, cy: number, overflow: string[], size: PackOutput["size"], facts: RunFacts): PackOutput {
  const placements: Placement[] = ids
    .map((d, k) => ({ d, k }))
    .sort((a, b) => a.d - b.d)
    .map(({ d, k }) => ({ id: discs[d]!.id, x: cx + at[2 * k]! * unit - discs[d]!.ox, y: cy + at[2 * k + 1]! * unit - discs[d]!.oy }));
  const measures = { "pack.overflow": facts.overflow, "circles.radius": facts.radius, "circles.moves": facts.moves, "circles.kept": facts.kept, "circles.evals": facts.evals };
  // The strategy reads no clock, so the same input gives the same bytes, the trace too. Thus the time of its stage is 0.
  return { placements, overflow, size, moved: [], trace: [{ id: CIRCLE_QUASI_PHYSICAL_STAGE, ms: 0, measures }] };
}

/** This function packs the discs into a container of free size. */
function packFree(discs: readonly Disc[], sep: (a: number, b: number) => number, input: PackInput, iterations: number, context: PackContext): PackOutput {
  const bounds = containerBounds(input);
  const half = (input.gap ?? 0) / 2;
  const inset = input.container.inset ?? 0;
  const unit = Math.max(...discs.map((d) => d.R)) || 1;
  const m = modelOf(discs.map((d) => d.R / unit), (i, j) => sep(i, j) / unit);
  const found = searchFree(m, iterations, context.rng, workOf(m.dim));
  const radius = found.tight.radius * unit - half + inset;
  const facts = { overflow: 0, radius, moves: found.moves, kept: found.kept, evals: m.evals };
  return outputOf(discs, discs.map((_, k) => k), found.tight.v, unit, bounds.x + radius, bounds.y + radius, [], { w: 2 * radius, h: 2 * radius }, facts);
}

/**
 * This function packs the discs into a container of fixed size. When the moves end with an overlap, the circle with the most pain goes
 * to the overflow, until the rest has no overlap. The last scale keeps each pair apart, and the radius grows by at most `FIT`.
 */
function packFixed(discs: readonly Disc[], sep: (a: number, b: number) => number, input: PackInput, shapeR: number, iterations: number, context: PackContext): PackOutput {
  const bounds = containerBounds(input);
  const half = (input.gap ?? 0) / 2;
  const inset = input.container.inset ?? 0;
  const inner = shapeR - inset + half;
  const size = { w: bounds.w, h: bounds.h };
  const unit = Math.max(...discs.map((d) => d.R)) || 1;
  const radius = inner / unit;
  const overflow: number[] = [];
  let live = discs.map((_, k) => k).filter((k) => {
    const fits = discs[k]!.R <= inner * (1 + FIT);
    if (!fits) overflow.push(k);
    return fits;
  });
  let moves = 0;
  let kept = 0;
  let evals = 0;
  let layout: Float64Array = new Float64Array(1);
  const w = (m: Model): Work => workOf(m.dim);
  const modelLive = (): Model => modelOf(live.map((k) => discs[k]!.R / unit), (i, j) => sep(live[i]!, live[j]!) / unit);
  let m = modelLive();
  if (live.length > 0) {
    const found = searchFixed(m, radius, iterations, context.rng, w(m));
    moves = found.moves;
    kept = found.kept;
    let v = found.v;
    for (;;) {
      const tight = tighten(m, v);
      if (tight.radius <= radius * (1 + FIT)) {
        layout = tight.v;
        break;
      }
      const pain = painOf(m, v, radius);
      const out = worst(pain, []);
      overflow.push(live[out]!);
      const rest = live.filter((_, i) => i !== out);
      const next = new Float64Array(2 * rest.length + 1);
      for (let i = 0, j = 0; i < live.length; i++) {
        if (i === out) continue;
        next[2 * j] = v[2 * i]!;
        next[2 * j + 1] = v[2 * i + 1]!;
        j++;
      }
      evals += m.evals;
      live = rest;
      m = modelLive();
      v = next;
      if (live.length === 0) break;
      descend(m, v, { radius, mu: 0, maxEvals: MOVE_EVALS * 4 }, w(m));
    }
    evals += m.evals;
  }
  const ids = overflow.sort((a, b) => a - b).map((k) => discs[k]!.id);
  const cx = bounds.x + shapeR;
  const cy = bounds.y + shapeR;
  return outputOf(discs, live, layout, unit, cx, cy, ids, size, { overflow: ids.length, radius: shapeR, moves, kept, evals });
}

/**
 * The strategy `circle-quasi-physical`: circles in a circle by the overlap energy (catalog rows `circle-quasi-physical`, `circle-quasi-human`
 * and `circle-mbh`, roadmap item k94). `docs/PACKER.md` tells the method, its sources and its limits.
 *
 * - It packs only circle items into a circle container of fixed or free size. Obstacles and locked items throw `UnsupportedCell`.
 * - The energy is the sum of the squares of the overlaps of each pair and of each circle with the wall.
 * - A limited-memory solve lowers the energy. A move leaves a local minimum: it relocates the circle with the most pain, swaps two circles or shakes some circles.
 * - A free container gets the smallest radius of the run. Its center is at the shape corner plus that radius, and `size` is the diameter.
 * - In a fixed container, a run that keeps an overlap puts the circles with the most pain in the overflow.
 * - The strategy reads the random numbers of the context, and no clock. Thus the same input and seed give the same bytes.
 * - The limit `budget.steps` of the context caps the moves. The strategy does not read the limit `budget.ms`.
 */
export const circleQuasiPhysical: Strategy<CircleQuasiPhysicalOptions> = {
  id: "circle-quasi-physical",
  family: "circles",
  catalog: ["circle-quasi-physical", "circle-quasi-human", "circle-mbh"],
  supports: {
    containerSize: ["fixed", "freeAspect", "freeArea"],
    containerShape: ["circle"],
    obstacleMove: [],
    itemShape: ["circle"],
    rotation: ["none", "quarter"],
    order: ["free", "soft"],
    groups: ["none"],
    mode: ["offline"],
  } satisfies Supports,
  defaults: { iterations: 256 },
  deterministic: true,
  pack(input: PackInput, options: CircleQuasiPhysicalOptions, context: PackContext): PackOutput {
    assertSupported(circleQuasiPhysical.supports, input);
    const o = { ...circleQuasiPhysical.defaults, ...options };
    checkOptions(o);
    const iterations = Math.min(o.iterations, context.budget?.steps ?? Infinity);
    const discs = discsOf(input);
    const shape = input.container.shape;
    const shapeR = shape?.kind === "circle" ? shape.r : 0;
    const sep = pairTable(input, discs);
    if (input.container.fixed === "size") return packFixed(discs, sep, input, shapeR, iterations, context);
    return packFree(discs, sep, input, iterations, context);
  },
};

/**
 * This function counts the placed circle items that go out of a circle container, by the distance of the centers (roadmap item k94). It is exact for circles.
 * The count `in-container` of `packHard` reads the bounding box of a circle, so it is only safe in a circle container.
 *
 * - A circle breaks the rule when the reach is more than the container radius plus `tolerance`.
 * - The reach is the sum of the center distance, the radius, the largest side of the margin and the inset.
 * - A free container reads its radius from `size`, and its center is the corner of the shape plus that radius.
 * - An item without a circle shape and a placement of an unknown id do not count.
 * - The function throws a `RangeError` for a container that is not a circle.
 */
export function circlesOutside(input: PackInput, output: Pick<PackOutput, "placements" | "size">, tolerance: number = DEFAULT_TOLERANCE.overlap): number {
  const shape = input.container.shape;
  if (shape?.kind !== "circle") throw new RangeError("The function circlesOutside needs a circle container.");
  const fixed = input.container.fixed === "size";
  const radius = fixed ? shape.r : output.size.w / 2;
  const cx = fixed ? shape.cx : shape.cx - shape.r + radius;
  const cy = fixed ? shape.cy : shape.cy - shape.r + radius;
  const inset = input.container.inset ?? 0;
  const items = new Map(input.items.map((i) => [i.id, i]));
  let count = 0;
  for (const p of output.placements) {
    const item = items.get(p.id);
    const s = item?.shape;
    if (item === undefined || s?.kind !== "circle") continue;
    const m = marginOf(item);
    const reach = Math.hypot(p.x + s.cx - cx, p.y + s.cy - cy) + s.r + Math.max(m.top, m.right, m.bottom, m.left) + inset;
    if (reach > radius + tolerance) count++;
  }
  return count;
}
