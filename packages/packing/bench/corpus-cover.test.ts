import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generators } from "@mark1russell7/packing";
import { CORPORA_DIR, COVER_DIMENSIONS, COVER_FILE, cellOfSpec, corpusCover, coverJson, coverRow, coverView, dimensionPairs, readManifests, type CoverDimension, type CoverRow } from "./corpus-cover.ts";

const DIMS: readonly CoverDimension[] = [
  { name: "rotation", values: ["none", "quarter", "any"] },
  { name: "order", values: ["free", "soft"] },
  { name: "mode", values: ["offline", "online"] },
];

const ROWS: readonly CoverRow[] = [
  { values: [0, 0, 0], inputs: 2 },
  { values: [0, 1, 0], inputs: 3 },
  { values: [2, 1, 0], inputs: 1 },
  { values: [2, 1, 0], inputs: 4 },
];

describe("corpus coverage", () => {
  it("gives each pair of dimensions once", () => {
    expect(dimensionPairs(4)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
  });

  it("counts the pairs as a brute count does", () => {
    const seen = new Set<string>();
    for (const { values } of ROWS) {
      for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) seen.add(`${a}:${values[a]}|${b}:${values[b]}`);
    }
    const view = coverView("x", 4, ROWS, DIMS);
    expect(view.pairs).toBe(seen.size);
    // 3 x 2 + 3 x 2 + 2 x 2 pairs of values.
    expect(view.pairShare).toBeCloseTo(seen.size / 16, 5);
  });

  it("counts the distinct cells, the inputs and the empty values", () => {
    const view = coverView("x", 4, ROWS, DIMS);
    expect(view).toMatchObject({ cells: 3, inputs: 10, values: 5, empty: ["rotation=quarter", "mode=online"] });
    expect(view.cellShare).toBeCloseTo(3 / 12, 5);
  });

  it("writes the inputs of a pair in row order", () => {
    const view = coverView("x", 4, ROWS, DIMS);
    // rotation by order: none/free 2, none/soft 3, any/soft 1 + 4.
    expect(view.grid[0]).toEqual([2, 3, 0, 0, 0, 5]);
  });

  it("stops on a value outside the dimensions", () => {
    expect(() => coverRow({ rotation: "half", order: "free", mode: "offline" }, 1, DIMS)).toThrow(RangeError);
  });

  it("lists a corpus with no specs, and puts the union first", () => {
    const cover = corpusCover(
      [
        { corpus: "b", specs: [{ generator: "g", version: 1, seeds: [1, 2] }] },
        { corpus: "c" },
        { corpus: "a", specs: [{ generator: "g", version: 1, seeds: [3] }] },
      ],
      () => ({ rotation: "none", order: "free", mode: "offline" }),
      DIMS,
    );
    expect(cover.skipped).toEqual(["c"]);
    expect(cover.views.map((v) => v.id)).toEqual(["all", "a", "b"]);
    expect(cover.views[0]).toMatchObject({ specs: 2, inputs: 3, cells: 1 });
    expect([cover.fullCells, cover.fullPairs, cover.fullValues]).toEqual([12, 16, 7]);
  });

  it("reads each generator of the package with these dimensions", () => {
    for (const made of generators) expect(() => coverRow({ ...made.cell(made.defaults) }, 1)).not.toThrow();
  });

  it("gives the same bytes each time, and the site has them", () => {
    const cover = (): string => coverJson(corpusCover(readManifests(CORPORA_DIR), cellOfSpec));
    const text = cover();
    expect(cover()).toBe(text);
    expect(readFileSync(COVER_FILE, "utf8")).toBe(text);
    expect(JSON.parse(text).dimensions).toEqual(COVER_DIMENSIONS);
  });
});
