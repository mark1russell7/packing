import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UnsupportedCell, type PackInput, type PackOutput } from "@mark1russell7/packing";
import {
  bucketTop,
  changesOf,
  compareTieReads,
  faultyTiePack,
  fillOf,
  marginInput,
  moveOf,
  readTieSet,
  TIE_CHANGE,
  TIE_FAMILY,
  TIE_KINDS,
  TIE_MODES,
  TIE_SCHEMA,
  TIE_SOURCE,
  TIE_TABLE_FILE,
  tieCells,
  tieInput,
  tieName,
  tieTableOf,
  tieTableText,
  tieTotals,
  type TieCell,
  type TiePack,
  type TieTable,
} from "./tie-move.ts";

const cell = (kind: TieCell["kind"], count = 8): TieCell => ({ kind, mode: "fixed", count, seed: 1 });

const ROWS = { strategy: "rows", optionSet: "default" };

/** A small subset of the family: one input of each kind. */
const SMALL = TIE_KINDS.map((kind) => cell(kind));

const output = (places: readonly (readonly [string, number, number])[], w = 100, h = 100): PackOutput => ({
  placements: places.map(([id, x, y]) => ({ id, x, y })),
  overflow: [],
  size: { w, h },
  moved: [],
});

describe("the family of the tie moves", () => {
  it("has each kind, mode, count and seed once, and each input has its own name", () => {
    const cells = tieCells();
    expect(cells).toHaveLength(TIE_KINDS.length * TIE_MODES.length * TIE_FAMILY.counts.length * TIE_FAMILY.seeds.length);
    expect(new Set(cells.map(tieName)).size).toBe(cells.length);
  });

  it("gives the same input for the same cell", () => {
    expect(tieInput(cell("equal-heights"))).toEqual(tieInput(cell("equal-heights")));
  });

  it("has the ties of each kind, and the control has none", () => {
    const sides = (kind: TieCell["kind"], side: "w" | "h"): number => new Set(tieInput(cell(kind, 50)).items.map((item) => item[side])).size;
    expect(sides("equal-heights", "h")).toBe(1);
    expect(sides("equal-widths", "w")).toBe(1);
    expect([sides("identical", "w"), sides("identical", "h")]).toEqual([1, 1]);
    expect(sides("edge", "h")).toBe(1);
    expect([sides("no-ties", "w"), sides("no-ties", "h")]).toEqual([50, 50]);
  });

  it("changes one size of the middle item, one change for each side", () => {
    const input = tieInput(cell("identical"));
    const [wide, high] = changesOf(input);
    expect(wide!.items[4]!.w).toBe(input.items[4]!.w + TIE_CHANGE);
    expect(wide!.items[4]!.h).toBe(input.items[4]!.h);
    expect(high!.items[4]!.h).toBe(input.items[4]!.h + TIE_CHANGE);
    expect(wide!.items.filter((item, index) => item !== input.items[index])).toHaveLength(1);
  });
});

describe("the margin of the bench", () => {
  it("gives the top of the bucket, with a whole number at the middle of a bucket", () => {
    expect([bucketTop(41), bucketTop(41.01), bucketTop(41.5), bucketTop(41.51)]).toEqual([41.5, 41.5, 41.5, 42.5]);
    expect(bucketTop(10, 4)).toBe(10);
    expect(bucketTop(10.5, 4)).toBe(14);
  });

  it("does not change an input for a change inside a bucket, so the arm reads no move there", () => {
    const input = tieInput(cell("identical"));
    for (const changed of changesOf(input)) expect(marginInput(changed)).toEqual(marginInput(input));
  });

  it("changes an input at the edge of a bucket", () => {
    const input = tieInput(cell("edge"));
    for (const changed of changesOf(input)) expect(marginInput(changed)).not.toEqual(marginInput(input));
  });

  it("gives each item at least its true size", () => {
    const input = tieInput(cell("no-ties", 20));
    marginInput(input).items.forEach((item, index) => {
      expect(item.w).toBeGreaterThanOrEqual(input.items[index]!.w);
      expect(item.h).toBeGreaterThanOrEqual(input.items[index]!.h);
    });
  });
});

describe("the read of 2 outputs", () => {
  it("reads the largest distance over the items of both outputs", () => {
    expect(moveOf(output([["a", 0, 0], ["b", 10, 10]]), output([["a", 3, 4], ["b", 10, 11]]))).toEqual({ move: 5, dropped: 0 });
  });

  it("counts an item that only one output places, and reads no distance for it", () => {
    expect(moveOf(output([["a", 0, 0], ["b", 10, 10]]), output([["a", 0, 0], ["c", 90, 90]]))).toEqual({ move: 0, dropped: 2 });
  });

  it("reads the fill of the true items over the size of the output", () => {
    const input: PackInput = { container: { fixed: "none" }, items: [{ id: "a", w: 10, h: 10 }, { id: "b", w: 10, h: 10 }] };
    expect(fillOf(input, output([["a", 0, 0], ["b", 10, 0]], 20, 20))).toBe(0.5);
    expect(fillOf(input, output([], 0, 0))).toBe(0);
  });
});

describe("the read of an option set", () => {
  it("gives each arm its changes, and only the margin arms and the fill pack the margin", () => {
    const { row, errors } = readTieSet(ROWS, SMALL);
    expect(errors).toBe(0);
    expect(row.inputs).toBe(SMALL.length);
    expect([row.ties.changes, row.none.changes, row.edge.changes, row.marginTies.changes, row.marginEdge.changes]).toEqual([6, 2, 2, 6, 2]);
    expect(row.marginTies).toEqual({ changes: 6, moved: 0, dropped: 0, maxMove: 0 });
    expect(row.fillLost).toBeGreaterThanOrEqual(0);
  });

  it("gives the same row each time", () => {
    expect(readTieSet(ROWS, SMALL)).toEqual(readTieSet(ROWS, SMALL));
  });

  it("names the input of the largest move", () => {
    const { row } = readTieSet(ROWS, SMALL, faultyTiePack);
    const each = SMALL.map((one) => readTieSet(ROWS, [one], faultyTiePack).row.ties);
    const largest = each.reduce((best, ties) => (ties.maxMove > best.maxMove ? ties : best));
    expect(row.ties.maxMove).toBeGreaterThanOrEqual(100);
    expect(row.ties.maxMove).toBe(largest.maxMove);
    expect(row.ties.at).toBe(largest.at);
  });

  it("counts a refusal apart from an error, and goes on after each", () => {
    const refuses: TiePack = () => {
      throw new UnsupportedCell("containerSize", "fixed");
    };
    const breaks: TiePack = () => {
      throw new RangeError("a fault of the test");
    };
    const refused = readTieSet(ROWS, [cell("identical"), cell("edge")], refuses);
    expect([refused.row.inputs, refused.row.refused, refused.errors]).toEqual([0, 4, 0]);
    expect(refused.row.fillLost).toBe(0);
    const broken = readTieSet(ROWS, [cell("identical")], breaks);
    expect([broken.errors, broken.firstError]).toEqual([2, "identical.fixed.n8/s1: a fault of the test"]);
  });
});

describe("the check of the table", () => {
  const reads = [readTieSet(ROWS, SMALL)];
  const table = tieTableOf(reads);

  it("finds nothing on the same read", () => {
    expect(compareTieReads(table, reads)).toEqual([]);
  });

  it("fails on a fault, and the finding names the strategy, the option set and the arm", () => {
    const findings = compareTieReads(table, [readTieSet(ROWS, SMALL, faultyTiePack)]);
    expect(findings.some((finding) => finding.startsWith("rows default ties: the table says"))).toBe(true);
  });

  it("fails when a move falls, so a gain also needs a new table", () => {
    const row = table["rows"]![0]!;
    const higher: TieTable = { rows: [{ ...row, none: { ...row.none, maxMove: row.none.maxMove + 1 } }] };
    expect(compareTieReads(higher, reads)[0]).toContain("rows default none: the table says");
  });

  it("names an error, a set with no row, and a row with no set", () => {
    const [read] = reads;
    expect(compareTieReads(table, [{ ...read!, errors: 1, firstError: "x" }])[0]).toBe("rows default: 1 packs gave an error. The first: x.");
    expect(compareTieReads({}, reads)).toEqual(["rows default: the table has no row."]);
    expect(compareTieReads(table, [])).toEqual(["rows default: the table has a row, and this read has no such option set."]);
    expect(compareTieReads(table, [], false)).toEqual([]);
  });

  it("fails on a count of inputs and on the fill", () => {
    const row = table["rows"]![0]!;
    expect(compareTieReads({ rows: [{ ...row, inputs: 1 }] }, reads)[0]).toContain("the table says 1 inputs");
    expect(compareTieReads({ rows: [{ ...row, fillLost: 9 }] }, reads)[0]).toContain("fillLost: the table says 9");
  });
});

describe("the table of the tie moves", () => {
  const file = JSON.parse(readFileSync(TIE_TABLE_FILE, "utf8")) as { schema: string; source: string; strategies: TieTable };

  it("has its schema, its family, and the text that the script writes", () => {
    expect([file.schema, file.source]).toEqual([TIE_SCHEMA, TIE_SOURCE]);
    expect(readFileSync(TIE_TABLE_FILE, "utf8")).toBe(tieTableText(file.strategies));
  });

  it("has a row of the default of each strategy of the report, with its move on ties", () => {
    for (const strategy of ["skyline", "maxrects", "shelf", "guillotine", "force"]) {
      const row = file.strategies[strategy]!.find((other) => other.optionSet === "default")!;
      expect(row.ties.maxMove, strategy).toBeGreaterThanOrEqual(100);
      expect(row.none.maxMove, strategy).toBeLessThan(row.ties.maxMove);
    }
  });

  it("states the totals for the log", () => {
    expect(tieTotals(file.strategies)).toContain("option sets pack");
  });
});
