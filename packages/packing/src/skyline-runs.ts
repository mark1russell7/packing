// The plain top of the strategy `skyline` as runs of equal height (roadmap item k170), so its cost does not grow with the width in units.

/** The result of `SkylineRuns.window`: the lowest window, and the x of the leftmost valid window or `-1`. */
export interface RunWindow {
  x: number;
  y: number;
  first: number;
}

/**
 * This class holds the top of a skyline as runs of equal height over whole cells. It keeps no neighbors of equal height, and its
 * memory grows with the runs, not with the width. Each run starts at a whole number, because a box covers whole cells.
 */
export class SkylineRuns {
  /** This array holds the start of each run, in ascending order. The first start is 0. */
  readonly xs: number[] = [0];
  /** This array holds the height of each run. */
  readonly ys: number[] = [0];
  /** This array is the deque of `window`, kept over the calls. */
  private deque = new Int32Array(16);

  /** This number is the count of whole cells of the width. */
  readonly width: number;

  /** This constructor makes one run of height 0 over `width` cells. */
  constructor(width: number) {
    this.width = width;
  }

  /** This function gives the end of the run `k`. */
  endOf(k: number): number {
    return k + 1 < this.xs.length ? this.xs[k + 1]! : this.width;
  }

  /** This function gives the index of the run that holds the cell `x`. */
  private runAt(x: number): number {
    let low = 0;
    let high = this.xs.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.xs[mid]! <= x) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /**
   * This function finds the lowest window of `rw` cells, with the leftmost of equal height. A window is valid when its height
   * plus `rh` is not more than `cap`. Only the start of a run can give the result. From any other cell, one step to the left adds
   * a cell of the same height. So the window stays valid and does not rise. A deque makes the search O(runs) for one box.
   */
  window(rw: number, rh = 0, cap = Infinity): RunWindow {
    const { xs, ys, width } = this;
    const runs = xs.length;
    if (this.deque.length < runs) this.deque = new Int32Array(runs * 2);
    const deque = this.deque;
    let head = 0;
    let tail = 0;
    let next = 0;
    const out: RunWindow = { x: 0, y: Infinity, first: -1 };
    for (let k = 0; k < runs; k++) {
      const x = xs[k]!;
      const end = x + rw;
      if (end > width) break;
      while (next < runs && xs[next]! < end) {
        while (tail > head && ys[deque[tail - 1]!]! <= ys[next]!) tail--;
        deque[tail++] = next++;
      }
      while (deque[head]! < k) head++;
      const max = ys[deque[head]!]!;
      if (max + rh > cap) continue;
      if (out.first < 0) out.first = x;
      if (max < out.y) {
        out.y = max;
        out.x = x;
      }
    }
    return out;
  }

  /** This function sets the cells `[x0, x1)` to the height `top`. */
  raise(x0: number, x1: number, top: number): void {
    if (x0 >= x1) return;
    const { xs, ys } = this;
    const first = this.runAt(x0);
    const last = this.runAt(x1 - 1);
    const end = this.endOf(last);
    const newX: number[] = [];
    const newY: number[] = [];
    if (xs[first]! < x0) {
      newX.push(xs[first]!);
      newY.push(ys[first]!);
    }
    newX.push(x0);
    newY.push(top);
    if (x1 < end) {
      newX.push(x1);
      newY.push(ys[last]!);
    }
    xs.splice(first, last - first + 1, ...newX);
    ys.splice(first, last - first + 1, ...newY);
    // A new run can have the height of a neighbor
    for (let k = Math.min(first + newX.length, xs.length - 1); k >= Math.max(first, 1); k--) {
      if (ys[k] === ys[k - 1]) {
        xs.splice(k, 1);
        ys.splice(k, 1);
      }
    }
  }

  /** This function raises each cell of `[x0, x1)` to at least the height `bottom`. */
  lift(x0: number, x1: number, bottom: number): void {
    if (x0 >= x1) return;
    const parts: [number, number][] = [];
    for (let k = this.runAt(x0); k < this.xs.length && this.xs[k]! < x1; k++) {
      if (this.ys[k]! < bottom) parts.push([Math.max(x0, this.xs[k]!), Math.min(x1, this.endOf(k))]);
    }
    for (const [a, b] of parts) this.raise(a, b, bottom);
  }

  /** This function gives the largest height, and 0 when no height is above 0. */
  highest(): number {
    let y = 0;
    for (const h of this.ys) if (h > y) y = h;
    return y;
  }

  /** This function writes the height of each cell into `cells`. */
  fill(cells: Float64Array): void {
    for (let k = 0; k < this.xs.length; k++) cells.fill(this.ys[k]!, this.xs[k]!, this.endOf(k));
  }

  /**
   * This function gives each free rectangle of the gap between the skyline and the height `y` over the cells `[x0, x1)`. For each
   * level of the gap, it gives the widest run of cells at or below it. A rectangle less wide than `minW` or less high than `minH` is left out.
   */
  gaps(x0: number, x1: number, y: number, minW: number, minH: number, visit: (l: number, r: number, level: number) => void): void {
    const { xs, ys } = this;
    const seen = new Set<string>();
    const first = this.runAt(x0);
    for (let k = first; k < xs.length && xs[k]! < x1; k++) {
      const level = ys[k]!;
      if (!(level < y)) continue;
      let a = k;
      let b = k;
      while (a > first && ys[a - 1]! <= level) a--;
      while (b + 1 < xs.length && xs[b + 1]! < x1 && ys[b + 1]! <= level) b++;
      const l = Math.max(x0, xs[a]!);
      const r = Math.min(x1, this.endOf(b));
      const key = `${l},${r},${level}`;
      if (seen.has(key) || r - l < minW || y - level < minH) continue;
      seen.add(key);
      visit(l, r, level);
    }
  }

  /**
   * This function gives each free rectangle under the skyline, with each height kept at `end`. For each level, it gives the widest
   * run of cells at or above it. A rectangle less wide than `minW` or less high than `minH` is left out.
   */
  under(end: number, minW: number, minH: number, visit: (l: number, r: number, level: number) => void): void {
    const { xs, ys } = this;
    const top = ys.map((h) => Math.min(h, end));
    const seen = new Set<string>();
    for (let k = 0; k < top.length; k++) {
      const level = top[k]!;
      if (!(level > 0) || (k > 0 && top[k - 1] === level)) continue;
      let a = k;
      let b = k;
      while (a > 0 && top[a - 1]! >= level) a--;
      while (b + 1 < top.length && top[b + 1]! >= level) b++;
      const l = xs[a]!;
      const r = this.endOf(b);
      const key = `${l},${r},${level}`;
      if (seen.has(key) || r - l < minW || level < minH) continue;
      seen.add(key);
      visit(l, r, level);
    }
  }
}
