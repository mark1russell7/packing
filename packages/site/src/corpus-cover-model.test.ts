import { describe, expect, it } from "vitest";
import corpusCoverJson from "../data/corpus-cover.json?raw";
import { coverEmptyLine, coverGrid, lawLine, coverPairTable, coverSquares, coverTiles, parseCorpusCover, percent, type CorpusCoverDoc, type CoverView } from "./corpus-cover-model.ts";

describe("the line of the law pairs", () => {
  it("calls the count under review and gives the refused specs", () => {
    const line = lawLine({ covered: 31, pairs: 87, specs: 544, refused: 321, floor: 200 });
    expect(line).toContain("gives 31 of the 87 pairs");
    expect(line).toContain("under review: a misread spec can add a false pair");
    expect(line).toContain("321 of 865 specs have fewer than 200 items");
  });
});

const VIEW: CoverView = {
  id: "all",
  specs: 2,
  inputs: 5,
  cells: 2,
  cellShare: 2 / 12,
  pairs: 4,
  pairShare: 4 / 16,
  values: 5,
  empty: ["a=z", "c=<q>"],
  grid: [[2, 0, 0, 3, 0, 0], [5, 0, 0, 0, 0, 0], [2, 3, 0, 0]],
};

const DOC: CorpusCoverDoc = {
  schema: "packing-corpus-cover/1",
  dimensions: [
    { name: "a", values: ["x", "y", "z"] },
    { name: "b", values: ["p", "q"] },
    { name: "c", values: ["<m>", "n"] },
  ],
  fullCells: 12,
  fullPairs: 16,
  fullValues: 7,
  skipped: [],
  views: [VIEW],
};

describe("corpus coverage of the site", () => {
  it("refuses another schema and a file with no view", () => {
    expect(() => parseCorpusCover(JSON.stringify({ ...DOC, schema: "x" }))).toThrow(/schema/);
    expect(() => parseCorpusCover(JSON.stringify({ ...DOC, views: [] }))).toThrow(/no view/);
  });

  it("gives more places to a small share", () => {
    expect([percent(0), percent(0.000004), percent(0.000161), percent(0.368365)]).toEqual(["0%", "under 0.001%", "0.016%", "36.8%"]);
  });

  it("gives each pair of dimensions one square, in the order of the grid", () => {
    expect(coverSquares(DOC, VIEW).map((s) => [s.row, s.column, s.covered, s.total])).toEqual([
      [0, 1, 2, 6],
      [0, 2, 1, 6],
      [1, 2, 2, 4],
    ]);
  });

  it("marks only the selected square", () => {
    const html = coverGrid(DOC, VIEW, 2);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`data-pair="2" aria-pressed="true"`);
    expect(html).toContain("b by c: 2 of 4 pairs");
  });

  it("reads the row and the column of a pair from the flat list", () => {
    const html = coverPairTable(DOC, VIEW, 0);
    expect(html.match(/<tr><th scope="row"><code>y<\/code><\/th><td class="cempty">none<\/td><td>3<\/td>/)).not.toBeNull();
    expect(() => coverPairTable(DOC, VIEW, 3)).toThrow(RangeError);
  });

  it("escapes the names of the values", () => {
    expect(coverPairTable(DOC, VIEW, 1)).toContain("&lt;m&gt;");
    expect(coverEmptyLine(VIEW)).toContain("c=&lt;q&gt;");
  });

  it("tells when each value has an input", () => {
    expect(coverEmptyLine({ ...VIEW, empty: [] })).toBe("Each value has an input.");
  });

  it("shows the counts of the view in its tiles", () => {
    const html = coverTiles(DOC, VIEW);
    expect(html).toContain("4 of 16 pairs have an input");
    expect(html).toContain("5 of 7");
    expect(html).toContain("2 of 12 cells");
  });

  it("agrees with the committed file: the squares add up to the pair count of each view", () => {
    const doc = parseCorpusCover(corpusCoverJson);
    expect(doc.views[0]!.id).toBe("all");
    for (const view of doc.views) {
      const squares = coverSquares(doc, view);
      expect(squares).toHaveLength(view.grid.length);
      expect(squares.reduce((sum, s) => sum + s.covered, 0)).toBe(view.pairs);
      expect(squares.reduce((sum, s) => sum + s.total, 0)).toBe(doc.fullPairs);
    }
  });
});
