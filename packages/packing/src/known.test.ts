import { describe, expect, it } from "vitest";
import {
  checkHard,
  consecutiveSquares,
  DEFAULT_TOLERANCE,
  gapToOpt,
  measure,
  perfectCut,
  perfectCutOf,
  toPackInput,
  type CutPiece,
  type PackOutput,
  type PerfectCutParams,
} from "@mark1russell7/packing";

// The inputs with a known best value of roadmap item k45: perfect-cut, consecutive-squares and pack.gapToOpt.

const CUTS = ["guillotine", "free"] as const;
const SIZES = ["fixed", "freeHeight", "freeArea"] as const;
const COUNTS = [10, 30, 100];

/** The output that places each piece at its place in the cut. */
const perfectOutput = (pieces: readonly CutPiece[], w: number, h: number): PackOutput => ({
  placements: pieces.map(({ id, x, y }) => ({ id, x, y })),
  overflow: [],
  size: { w, h },
  moved: [],
});

const overlaps = (a: CutPiece, b: CutPiece): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

/** This function tells if a straight line at `at` goes across the rectangle with no cut through a piece. */
function cutsAt(pieces: readonly CutPiece[], vertical: boolean, at: number): boolean {
  return pieces.every((p) => (vertical ? p.x + p.w <= at || p.x >= at : p.y + p.h <= at || p.y >= at));
}

/** This function gives the positions of the straight lines across a rectangle of pieces with no cut through a piece. */
function fullCuts(pieces: readonly CutPiece[], vertical: boolean): number[] {
  const start = Math.min(...pieces.map((p) => (vertical ? p.x : p.y)));
  const end = Math.max(...pieces.map((p) => (vertical ? p.x + p.w : p.y + p.h)));
  const edges = new Set(pieces.map((p) => (vertical ? p.x : p.y)).filter((e) => e > start && e < end));
  return [...edges].filter((e) => cutsAt(pieces, vertical, e));
}

/** This function tells if a rectangle of pieces comes from guillotine cuts only. */
function isGuillotine(pieces: readonly CutPiece[]): boolean {
  if (pieces.length <= 1) return true;
  for (const vertical of [true, false]) {
    const at = fullCuts(pieces, vertical)[0];
    if (at === undefined) continue;
    const side = (p: CutPiece): boolean => (vertical ? p.x < at : p.y < at);
    return isGuillotine(pieces.filter(side)) && isGuillotine(pieces.filter((p) => !side(p)));
  }
  return false;
}

describe("perfect-cut", () => {
  for (const cut of CUTS) {
    for (const count of COUNTS) {
      it(`tiles its container exactly with the cut ${cut} and ${count} pieces`, () => {
        for (const seed of [1, 2, 3, 4, 5]) {
          const { w, h, pieces } = perfectCutOf(seed, { cut, count });
          expect(pieces).toHaveLength(count);
          expect(pieces.reduce((sum, p) => sum + p.w * p.h, 0)).toBe(w * h);
          for (const p of pieces) {
            expect([p.x, p.y, p.w, p.h].every(Number.isInteger), p.id).toBe(true);
            expect(p.w >= 1 && p.h >= 1 && p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h, p.id).toBe(true);
          }
          for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) expect(overlaps(pieces[i]!, pieces[j]!), `${pieces[i]!.id} ${pieces[j]!.id}`).toBe(false);
          // The area is exact and nothing overlaps, so the pieces cover the container
          expect(isGuillotine(pieces)).toBe(cut === "guillotine");
        }
      });
    }
  }

  it("makes the first cut of the cut free a pinwheel: no straight line goes across the container", () => {
    for (const seed of [1, 2, 3]) {
      const { pieces } = perfectCutOf(seed, { cut: "free", count: 30 });
      expect([...fullCuts(pieces, true), ...fullCuts(pieces, false)]).toEqual([]);
    }
  });

  it("gives the boxes of the pieces in the order of the shuffle, the same for the same seed", () => {
    for (const containerSize of SIZES) {
      const params: Partial<PerfectCutParams> = { cut: "free", containerSize, count: 30 };
      const file = perfectCut.generate(4, params);
      expect(JSON.stringify(perfectCut.generate(4, params))).toBe(JSON.stringify(file));
      const { pieces } = perfectCutOf(4, params);
      expect(file.boxes).toEqual(pieces.map(({ id, w, h }) => ({ id, w, h })));
      expect(file.boxes.map((b) => b.id)).toEqual(pieces.map((_, i) => `b${i}`));
    }
    // The shuffle has its own random numbers: the cut of a seed has a different order than the cut order
    const { pieces } = perfectCutOf(1, { count: 100 });
    const cutOrder = pieces.toSorted((a, b) => a.y - b.y || a.x - b.x);
    expect(pieces.map((p) => p.id)).not.toEqual(cutOrder.map((p) => p.id));
  });

  it("writes the optimum of each size into the input", () => {
    const fixed = perfectCut.generate(2, { containerSize: "fixed" });
    const { w, h } = perfectCutOf(2);
    expect(fixed.source).toBe("known-best:perfect-cut");
    expect(fixed.container).toEqual({ w, h, fixed: "size" });
    expect(fixed.known).toEqual({ kind: "optimum", area: w * h, source: "perfect-cut.guillotine" });
    const strip = perfectCut.generate(2, { containerSize: "freeHeight", cut: "free" });
    expect(strip.container).toEqual({ w, fixed: "width" });
    expect(strip.known).toEqual({ kind: "optimum", area: w * h, height: h, source: "perfect-cut.free" });
    const free = perfectCut.generate(2, { containerSize: "freeArea" });
    expect(free.container).toEqual({ fixed: "none", aspectWeight: 0 });
    expect(free.known).toEqual({ kind: "optimum", area: w * h, source: "perfect-cut.guillotine" });
  });

  it("refuses the cut free with fewer than 5 pieces, and a count of 0", () => {
    expect(() => perfectCut.generate(1, { cut: "free", count: 4 })).toThrow(RangeError);
    expect(() => perfectCut.generate(1, { count: 0 })).toThrow(RangeError);
    expect(perfectCut.generate(1, { count: 1 }).boxes).toHaveLength(1);
    expect(perfectCut.generate(1, { cut: "free", count: 5 }).boxes).toHaveLength(5);
  });
});

describe("consecutive-squares", () => {
  it("makes the squares of the sides 1 to count times the scale, in the order of a seeded shuffle", () => {
    for (const seed of [1, 2, 3]) {
      for (const count of COUNTS) {
        const file = consecutiveSquares.generate(seed, { count });
        expect(JSON.stringify(consecutiveSquares.generate(seed, { count }))).toBe(JSON.stringify(file));
        const sides = file.boxes.map((b) => b.w);
        expect(file.boxes.every((b) => b.w === b.h)).toBe(true);
        const scale = Math.min(...sides);
        expect(sides.toSorted((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, k) => (k + 1) * scale));
        expect(sides).not.toEqual(sides.toSorted((a, b) => a - b));
        expect(file.source).toBe("known-best:consecutive-squares");
      }
    }
  });

  it("writes a lower bound of the area and of the height, not an optimum", () => {
    for (const seed of [1, 2, 3, 4]) {
      const file = consecutiveSquares.generate(seed, { containerSize: "freeHeight", count: 30 });
      const area = file.boxes.reduce((sum, b) => sum + b.w * b.h, 0);
      const largest = Math.max(...file.boxes.map((b) => b.w));
      const w = file.container.w!;
      expect(file.container.fixed).toBe("width");
      expect(w).toBeGreaterThanOrEqual(largest);
      expect(file.known!.kind).toBe("bound");
      expect(file.known!.area).toBe(area);
      expect(file.known!.height).toBeLessThanOrEqual(Math.max(area / w, largest));
      expect(file.known!.height).toBeGreaterThan(Math.max(area / w, largest) - 0.001);
      expect(file.known!.source).toBe("Martello 2003");
      const free = consecutiveSquares.generate(seed, { containerSize: "freeArea", count: 30 });
      expect(free.container).toEqual({ fixed: "none", aspectWeight: 0 });
      expect(free.known).toEqual({ kind: "bound", area, source: "Martello 2003" });
    }
  });
});

describe("pack.gapToOpt", () => {
  for (const containerSize of SIZES) {
    it(`is 0 on the perfect placement of each cut, with ${containerSize}`, () => {
      for (const cut of CUTS) {
        for (const seed of [1, 2, 3]) {
          const file = perfectCut.generate(seed, { cut, containerSize, count: 30 });
          const { w, h, pieces } = perfectCutOf(seed, { cut, containerSize, count: 30 });
          const input = toPackInput(file);
          const output = perfectOutput(pieces, w, h);
          expect(Object.values(checkHard(input, output, DEFAULT_TOLERANCE)).every((n) => n === 0)).toBe(true);
          expect(gapToOpt(input, output, file.known!)).toBe(0);
          expect(measure(input, output)["pack.fill"]).toBe(1);
        }
      }
    });
  }

  it("gives the unplaced area share for a fixed size, and the height or the area above the best value for a free size", () => {
    const params = { cut: "guillotine", count: 10 } as const;
    const { w, h, pieces } = perfectCutOf(3, params);
    const fixed = perfectCut.generate(3, { ...params, containerSize: "fixed" });
    const out = perfectOutput(pieces.slice(1), w, h);
    const missing = { ...out, overflow: [pieces[0]!.id] };
    expect(gapToOpt(toPackInput(fixed), missing, fixed.known!)).toBeCloseTo((pieces[0]!.w * pieces[0]!.h) / (w * h), 12);

    // A stack of the pieces in one column gives the sum of the heights
    const strip = perfectCut.generate(3, { ...params, containerSize: "freeHeight" });
    let y = 0;
    const stack = pieces.map((p) => {
      const at = { id: p.id, x: 0, y };
      y += p.h;
      return at;
    });
    const stacked: PackOutput = { placements: stack, overflow: [], size: { w, h: y }, moved: [] };
    expect(gapToOpt(toPackInput(strip), stacked, strip.known!)).toBeCloseTo(y / h - 1, 12);
    // A free size with an unplaced item has no value
    expect(gapToOpt(toPackInput(strip), missing, strip.known!)).toBe(Infinity);

    const free = perfectCut.generate(3, { ...params, containerSize: "freeArea" });
    const width = Math.max(...pieces.map((p) => p.w));
    expect(gapToOpt(toPackInput(free), stacked, free.known!)).toBeCloseTo((width * y) / (w * h) - 1, 12);
  });

  it("refuses a known value without an area", () => {
    const file = perfectCut.generate(1);
    const { w, h, pieces } = perfectCutOf(1);
    expect(() => gapToOpt(toPackInput(file), perfectOutput(pieces, w, h), { kind: "optimum", area: 0, source: "x" })).toThrow(RangeError);
  });
});
