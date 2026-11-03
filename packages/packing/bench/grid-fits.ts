// The tiny exhaustive packer of the tests of the bounds (k51) and of the exact strip (k10). It fills a grid of whole cells, so it needs no idea of the code under test.

/** A rectangle of the exhaustive packer, with its turns. */
export type Shape = readonly (readonly [number, number])[];

/**
 * This function tells if the shapes fit in a grid of `W` by `H` cells. It fills the first empty cell with the corner of a
 * shape, or leaves it empty. Each packing on the grid places its shapes in that order, so the search is complete.
 */
export function fits(shapes: readonly Shape[], W: number, H: number): boolean {
  const grid = new Uint8Array(W * H);
  const used = new Array<boolean>(shapes.length).fill(false);
  const need = shapes.reduce((sum, s) => sum + s[0]![0] * s[0]![1], 0);
  if (need > W * H) return false;
  const free = (x: number, y: number, w: number, h: number): boolean => {
    if (x + w > W || y + h > H) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j * W + i] !== 0) return false;
    return true;
  };
  const mark = (x: number, y: number, w: number, h: number, v: number): void => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * W + i] = v;
  };
  // `cells` counts the cells from `from` to the end, and `rest` is the area of the shapes that are not placed
  const search = (from: number, left: number, cells: number, rest: number): boolean => {
    if (left === 0) return true;
    if (rest > cells) return false;
    let at = from;
    let open = 0;
    while (at < W * H && grid[at] !== 0) at++;
    for (let i = at; i < W * H; i++) if (grid[i] === 0) open++;
    if (at === W * H || rest > open) return false;
    const x = at % W;
    const y = Math.floor(at / W);
    for (let k = 0; k < shapes.length; k++) {
      if (used[k]) continue;
      for (const [w, h] of shapes[k]!) {
        if (!free(x, y, w, h)) continue;
        used[k] = true;
        mark(x, y, w, h, 1);
        if (search(at + 1, left - 1, open - w * h, rest - w * h)) return true;
        mark(x, y, w, h, 0);
        used[k] = false;
      }
    }
    // The cell stays empty
    grid[at] = 2;
    const ok = search(at + 1, left, open - 1, rest);
    grid[at] = 0;
    return ok;
  };
  return search(0, shapes.length, W * H, need);
}
