// The row legalizer of roadmap item k82. Each test uses made-up rows and made-up chains.
import { describe, expect, it } from "vitest";
import { CHANGE_WALK_KINDS, CHANGE_WALK_STEPS, changeWalk, checkHard, legalizeRows, mulberry32, packWith, placeRow, toPackInput, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives the sum of the squared moves of a row. */
const squares = (x: readonly number[], targets: readonly number[]): number => x.reduce((sum, v, i) => sum + (v - targets[i]!) ** 2, 0);

/** This function gives the least sum of squared moves on a whole-number grid, with the boxes in order and no overlap. */
function bruteForce(targets: readonly number[], widths: readonly number[], limit: number): number {
  let best = Infinity;
  const walk = (i: number, from: number, sum: number): void => {
    if (i === targets.length) {
      best = Math.min(best, sum);
      return;
    }
    for (let x = from; x + widths[i]! <= limit; x++) walk(i + 1, x + widths[i]!, sum + (x - targets[i]!) ** 2);
  };
  walk(0, 0, 0);
  return best;
}

/** This function counts the hard rule breaks of a layout, with the unplaced items. */
const breaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0) + output.overflow.length;

/** This function gives the layout of each step of a chain, each from the layout before it. */
function chain(seed: number, kind: (typeof CHANGE_WALK_KINDS)[number], count: number): { input: PackInput; output: PackOutput }[] {
  const first = toPackInput(changeWalk.generate(seed, { kind, step: 0, count }));
  const out = [{ input: first, output: packWith("rows", first, {}, seed) }];
  for (let step = 1; step <= CHANGE_WALK_STEPS; step++) {
    const input = toPackInput(changeWalk.generate(seed, { kind, step, count }));
    const before = out[out.length - 1]!;
    out.push({ input, output: legalizeRows(before.input, before.output, input) });
  }
  return out;
}

describe("placeRow", () => {
  it("keeps boxes with no overlap at their targets", () => {
    expect(placeRow([0, 10, 30], [5, 5, 5], 40)).toEqual([0, 10, 30]);
  });

  it("gives two boxes of one target the mean of their moves", () => {
    expect(placeRow([10, 10], [4, 4], 40)).toEqual([8, 12]);
  });

  it("stops a cluster at each end of the row", () => {
    expect(placeRow([0, 0], [4, 4], 40)).toEqual([0, 4]);
    expect(placeRow([38, 38], [4, 4], 40)).toEqual([32, 36]);
  });

  it("merges a cluster with the cluster on its left", () => {
    const x = placeRow([0, 5, 6], [5, 5, 5], 40);
    expect(x[1]! - x[0]!).toBe(5);
    expect(x[2]! - x[1]!).toBe(5);
  });

  it("is at or under a brute force on 300 made-up rows, with no overlap", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = mulberry32(seed);
      const count = 1 + Math.floor(r() * 4);
      const limit = 24;
      const targets = Array.from({ length: count }, () => Math.floor(r() * 24)).sort((a, b) => a - b);
      const widths = Array.from({ length: count }, () => 1 + Math.floor(r() * 5));
      const x = placeRow(targets, widths, limit);
      expect(squares(x, targets), `seed ${seed}`).toBeLessThanOrEqual(bruteForce(targets, widths, limit) + 1e-9);
      x.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(i === 0 ? 0 : x[i - 1]! + widths[i - 1]! - 1e-9);
        expect(v + widths[i]!).toBeLessThanOrEqual(limit + 1e-9);
      });
    }
  });

  it("refuses boxes that do not fit", () => {
    expect(() => placeRow([0, 0], [8, 8], 10)).toThrow(RangeError);
  });
});

describe("legalizeRows", () => {
  it("has 0 hard breaks on all 400 steps of the corpus", () => {
    let total = 0;
    let steps = 0;
    for (const kind of CHANGE_WALK_KINDS) {
      for (const count of [20, 60]) {
        for (let seed = 1; seed <= 10; seed++) {
          for (const { input, output } of chain(seed, kind, count).slice(1)) {
            total += breaks(input, output);
            steps++;
          }
        }
      }
    }
    expect([steps, total]).toEqual([400, 0]);
  });

  it("keeps each box of an unchanged input at its place", () => {
    const input = toPackInput(changeWalk.generate(1, { count: 20 }));
    const output = packWith("rows", input, {}, 1);
    const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
    expect([...legalizeRows(input, output, input).placements].sort(byId)).toEqual([...output.placements].sort(byId));
  });

  it("gives equal bytes for two calls, and it does not change its arguments", () => {
    const base = toPackInput(changeWalk.generate(2, { kind: "add", step: 0, count: 20 }));
    const next = toPackInput(changeWalk.generate(2, { kind: "add", step: 1, count: 20 }));
    const output = packWith("rows", base, {}, 2);
    const before = JSON.stringify([base, output, next]);
    const one = legalizeRows(base, output, next);
    expect(JSON.stringify(legalizeRows(base, output, next).placements)).toBe(JSON.stringify(one.placements));
    expect(JSON.stringify([base, output, next])).toBe(before);
  });

  it("does not move a placed box of its row in the arm Tetris", () => {
    const base = toPackInput(changeWalk.generate(3, { kind: "remove", step: 0, count: 20 }));
    const next = toPackInput(changeWalk.generate(3, { kind: "remove", step: 1, count: 20 }));
    const output = packWith("rows", base, {}, 3);
    const after = new Map(legalizeRows(base, output, next, { placeRow: false }).placements.map((p) => [p.id, p]));
    for (const p of output.placements) {
      if (after.has(p.id)) expect(after.get(p.id)).toMatchObject({ x: p.x, y: p.y });
    }
  });

  it("opens a new row for a box that fits no row", () => {
    const base: PackInput = { container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 10, h: 4 }] };
    const output = packWith("rows", base, {}, 1);
    const next: PackInput = { ...base, items: [...base.items, { id: "b", w: 6, h: 3 }] };
    const after = legalizeRows(base, output, next);
    expect(after.placements.map((p) => p.y)).toEqual([0, 4]);
    expect(after.size).toEqual({ w: 10, h: 7 });
  });

  it("pushes down the rows under a taller box", () => {
    const base: PackInput = { container: { fixed: "width", w: 10 }, items: [{ id: "a", w: 10, h: 4 }, { id: "b", w: 10, h: 4 }] };
    const output = packWith("rows", base, {}, 1);
    const next: PackInput = { ...base, items: [{ id: "a", w: 10, h: 6 }, { id: "b", w: 10, h: 4 }] };
    expect(legalizeRows(base, output, next).placements.map((p) => p.y)).toEqual([0, 6]);
  });

  it("refuses an input that is not a plain strip", () => {
    const base: PackInput = { container: { fixed: "size", w: 10, h: 10 }, items: [{ id: "a", w: 4, h: 4 }] };
    expect(() => legalizeRows(base, packWith("rows", base, {}, 1), base)).toThrow(RangeError);
    const gap: PackInput = { container: { fixed: "width", w: 10 }, gap: 1, items: [{ id: "a", w: 4, h: 4 }] };
    expect(() => legalizeRows(gap, packWith("rows", gap, {}, 1), gap)).toThrow(RangeError);
  });
});
