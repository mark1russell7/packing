import { describe, expect, it } from "vitest";
import {
  checkHard,
  edgeCases,
  packShelf,
  packWith,
  Rect,
  rectGrid,
  SHELF_FITS,
  toPackInput,
  type PackInput,
  type PackOutput,
  type ShelfFit,
  type SortOrder,
} from "./index.ts";

// The shelf family of roadmap item k21: the option `fit` of `shelf`. Made-up inputs of the generators only.

const SHAPES = ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const;
const LAYOUTS = ["none", "center", "scattered", "wall", "corridors", "touching", "edge"] as const;
const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** The variants of the benchmark: each fit with `height-desc`, and the fit `first` with the input order. */
const VARIANTS: readonly { fit: ShelfFit; sortOrder: SortOrder }[] = [
  { fit: "next", sortOrder: "height-desc" },
  { fit: "first", sortOrder: "height-desc" },
  { fit: "best", sortOrder: "height-desc" },
  { fit: "first", sortOrder: "input" },
];

const packFit = (input: PackInput, v: { fit: ShelfFit; sortOrder: SortOrder }, seed: number): PackOutput => packWith("shelf", input, { ...v, samples: 48 }, seed);

/** This function gives the placements of an output as text, sorted by id. */
const placementsOf = (output: PackOutput): string => JSON.stringify(output.placements.toSorted((a, b) => (a.id < b.id ? -1 : 1)));

/** This function gives the count of a move in the trace of an output. */
const movesOf = (output: PackOutput, id: string): number => (output.trace ?? []).reduce((sum, t) => sum + (t.measures?.[id] ?? 0), 0);

/** This function checks one packing of a variant: the hard rules on the bounding box and on the true outline, and the determinism. */
function checkVariant(input: PackInput, v: { fit: ShelfFit; sortOrder: SortOrder }, seed: number, label: string): PackOutput {
  const output = packFit(input, v, seed);
  expect(checkHard(input, output), label).toEqual(CLEAN);
  expect(checkHard(input, output, undefined, { exactContainer: true }), label).toEqual(CLEAN);
  const again = packFit(input, v, seed);
  expect([again.placements, again.overflow, again.size], label).toEqual([output.placements, output.overflow, output.size]);
  return output;
}

describe("the shelf fits: the hard rules in each container shape", () => {
  for (const containerShape of SHAPES) {
    it(`packs each variant into a ${containerShape} container with a fixed size and a free height, for each obstacle layout`, () => {
      let placed = 0;
      let items = 0;
      for (const v of VARIANTS) {
        for (const containerSize of ["fixed", "freeHeight"] as const) {
          for (const obstacles of LAYOUTS) {
            for (const [seed, count] of [[1, 10], [2, 100]] as const) {
              const sizes = seed === 1 ? "uniform" : "heavyTail";
              const input = toPackInput(rectGrid.generate(seed, { containerShape, containerSize, obstacles, sizes, count }));
              const output = checkVariant(input, v, seed, `${v.fit} ${v.sortOrder} ${containerSize} ${obstacles} s${seed}`);
              placed += output.placements.length;
              items += input.items.length;
            }
          }
        }
      }
      expect(placed / items).toBeGreaterThan(0.5);
    });

    it(`packs each variant into a ${containerShape} container with a free width, aspect and area`, () => {
      for (const v of VARIANTS) {
        for (const containerSize of ["freeWidth", "freeAspect", "freeArea"] as const) {
          for (const obstacles of ["none", "scattered"] as const) {
            const input = toPackInput(rectGrid.generate(3, { containerShape, containerSize, obstacles, sizes: "bimodal", count: 30 }));
            const output = checkVariant(input, v, 3, `${v.fit} ${v.sortOrder} ${containerSize} ${obstacles}`);
            expect(output.placements.length).toBeGreaterThan(0);
          }
        }
      }
    });
  }

  it("keeps the locked boxes and packs the edge cases with each variant", () => {
    for (const v of VARIANTS) {
      for (const c of ["empty", "one", "oversize", "exactTiling", "touchObstacles"] as const) {
        for (const seed of [1, 2]) {
          const file = edgeCases.generate(seed, { case: c, count: 12 });
          checkVariant(toPackInput(file), v, seed, `${v.fit} ${v.sortOrder} ${c} s${seed}`);
        }
      }
    }
  });
});

describe("the shelf fits against rows", () => {
  for (const v of VARIANTS) {
    it(`gives an output that is not the output of rows on a container that is not a rectangle: ${v.fit} ${v.sortOrder}`, () => {
      let differs = 0;
      for (const containerShape of SHAPES.filter((s) => s !== "rect")) {
        for (const seed of [1, 2]) {
          const input = toPackInput(rectGrid.generate(seed, { containerShape, obstacles: "scattered", sizes: "heavyTail", count: 40 }));
          if (placementsOf(packFit(input, v, seed)) !== placementsOf(packWith("rows", input, undefined, seed))) differs++;
        }
      }
      expect(differs).toBeGreaterThan(0);
    });
  }
});

describe("the moves of the shelf fits", () => {
  // Shelf 1 opens with a (60 by 30). Shelf 2 opens with b (50 by 20). The boxes c and g fit on both shelves.
  const input: PackInput = {
    container: { w: 100, fixed: "width" },
    items: [
      { id: "a", w: 60, h: 30 },
      { id: "e", w: 30, h: 10 },
      { id: "f", w: 30, h: 15 },
      { id: "b", w: 50, h: 20 },
      { id: "c", w: 10, h: 5 },
      { id: "g", w: 10, h: 18 },
    ],
  };
  const run = (fit: ShelfFit): { at: Record<string, [number, number]>; moves: [number, number, number] } => {
    const output = packWith("shelf", input, { sortOrder: "input", fit });
    expect(checkHard(input, output)).toEqual(CLEAN);
    return {
      at: Object.fromEntries(output.placements.map((p) => [p.id, [p.x, p.y]])),
      moves: [movesOf(output, "move.stack"), movesOf(output, "move.firstFit"), movesOf(output, "move.bestFit")],
    };
  };

  it("stacks f in the strip above e, and uses only the open shelf with the fit next", () => {
    const r = run("next");
    expect(r.at).toEqual({ a: [0, 0], e: [60, 0], f: [60, 10], b: [0, 30], c: [50, 30], g: [60, 30] });
    expect(r.moves).toEqual([1, 0, 0]);
  });

  it("puts c and g on the first shelf with the fit first", () => {
    const r = run("first");
    expect(r.at).toEqual({ a: [0, 0], e: [60, 0], f: [60, 10], b: [0, 30], c: [60, 25], g: [90, 0] });
    expect(r.moves).toEqual([2, 2, 0]);
  });

  it("puts g on the shelf with the least height left over with the fit best", () => {
    const r = run("best");
    expect(r.at).toEqual({ a: [0, 0], e: [60, 0], f: [60, 10], b: [0, 30], c: [60, 25], g: [50, 30] });
    expect(r.moves).toEqual([2, 1, 1]);
  });

  it("writes no move of a fit in the trace of the default shelf", () => {
    const output = packWith("shelf", input, { sortOrder: "input" });
    const ids = Object.keys(output.trace![0]!.measures!);
    expect(ids).toContain("move.stack");
    expect(ids).not.toContain("move.firstFit");
    expect(ids).not.toContain("move.bestFit");
  });
});

describe("packShelf with a fit", () => {
  const rect = (w: number, h: number): Rect => {
    const r = new Rect();
    r.size.set(w, h);
    return r;
  };
  const outerOf = (w: number): Rect => {
    const r = new Rect();
    r.size.set(w, 0);
    r.fixedWidth = true;
    return r;
  };

  it("lists the fits, and throws a RangeError for a fit that is not one of them", () => {
    expect(SHELF_FITS).toEqual(["next", "first", "best"]);
    expect(() => packShelf([rect(1, 1)], outerOf(10), { fit: "worst" as ShelfFit })).toThrow(RangeError);
  });

  it("goes around a locked rectangle and puts a rectangle wider than a fixed width on its own shelf", () => {
    const lock = rect(20, 20);
    lock.position.set(0, 0);
    lock.locked = true;
    const wide = rect(150, 10);
    const small = rect(30, 10);
    const outer = packShelf([lock, small, wide], outerOf(100), { fit: "first", sortOrder: "input" });
    expect([small.position.x, small.position.y]).toEqual([20, 0]);
    expect([wide.position.x, wide.position.y]).toEqual([0, 20]);
    expect(outer.size.y).toBe(30);
  });
});
