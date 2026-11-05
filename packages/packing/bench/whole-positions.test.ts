import { allStrategies, UnsupportedCell, type PackOutput } from "@mark1russell7/packing";
import { OUTPUT_NEAR_WHOLE, parseStrategyCatalog, writeStrategyCatalog } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { strategyCatalog } from "../src/strategy-catalog.ts";
import { OUTPUT_READ_VERSION, OUTPUT_SOURCE, STRATEGY_OUTPUT, type OutputRead, type OutputTable } from "../src/strategy-output.ts";
import { ENTRIES } from "./entries.ts";
import {
  cellName,
  classCounts,
  compareReads,
  faultyPack,
  gridOf,
  optionSets,
  positionGrid,
  readSet,
  sizeGrid,
  tableOf,
  tableText,
  WHOLE_FAMILY,
  WHOLE_MODES,
  wholeCells,
  wholeInput,
  type OptionSet,
  type WholeCell,
  type WholeFamily,
} from "./whole-positions.ts";

const SMALL: WholeFamily = { counts: [5], gaps: [0, 3], margins: [0, 2], insets: [0, 4], seeds: [1] };

const CELL: WholeCell = { mode: "fixed", count: 20, gap: 3, margin: 2, inset: 4, seed: 1 };

const SET: OptionSet = { strategy: "t", optionSet: "default" };

const output = (x: number, y: number): PackOutput => ({ placements: [{ id: "a", x, y }], overflow: [], size: { w: 100, h: 100 }, moved: [] });

const row = (over: Partial<OutputRead> = {}): OutputRead => ({
  optionSet: "default",
  inputs: 240,
  position: { fractional: 0, nearWhole: 0 },
  size: { fractional: 0, nearWhole: 0 },
  ...over,
});

const readOf = (over: Partial<OutputRead> = {}, details = {}) => ({ strategy: "t", row: row(over), refused: 0, errors: 0, firstFractional: {}, ...details });

describe("the family", () => {
  it("has each mode with each value of each range", () => {
    const cells = wholeCells();
    const { counts, gaps, margins, insets, seeds } = WHOLE_FAMILY;
    expect(cells).toHaveLength(WHOLE_MODES.length * counts.length * gaps.length * margins.length * insets.length * seeds.length);
    expect(new Set(cells.map(cellName)).size).toBe(cells.length);
  });

  it("gives the same input for the same cell", () => {
    expect(wholeInput(CELL)).toEqual(wholeInput(CELL));
  });

  it("gives only whole numbers, and some odd sides", () => {
    const { items, gap, container } = wholeInput(CELL);
    const numbers = [...items.flatMap((item) => [item.w, item.h, item.margin as number]), gap!, container.w!, container.h!, container.inset!];
    expect(numbers.every((value) => Number.isInteger(value))).toBe(true);
    expect(items.some((item) => item.w % 2 === 1)).toBe(true);
  });

  it("gives each mode its value of the container", () => {
    const container = (mode: WholeCell["mode"]) => wholeInput({ ...CELL, mode }).container;
    expect(container("fixed").fixed).toBe("size");
    expect(container("freeHeight").fixed).toBe("width");
    expect(container("freeWidth").fixed).toBe("height");
    expect(container("freeAspect")).toEqual({ fixed: "none", inset: 4 });
    expect(container("freeArea")).toEqual({ fixed: "none", aspectWeight: 0, inset: 4 });
  });

  it("leaves out a space of 0", () => {
    const input = wholeInput({ ...CELL, gap: 0, margin: 0, inset: 0 });
    expect(input.gap).toBeUndefined();
    expect(input.container.inset).toBeUndefined();
    expect(input.items[0]!.margin).toBeUndefined();
  });
});

describe("the read of an output", () => {
  it("reads whole numbers as whole", () => {
    expect(gridOf([3, 4])).toBe("whole");
    expect(gridOf([])).toBe("whole");
  });

  it("reads noise as near, at the limit of the contract", () => {
    expect(gridOf([3 + OUTPUT_NEAR_WHOLE / 2, 4])).toBe("near");
  });

  it("reads a value past the limit as fractional, also after a near value", () => {
    expect(gridOf([3 + OUTPUT_NEAR_WHOLE * 2])).toBe("fractional");
    expect(gridOf([3 + OUTPUT_NEAR_WHOLE / 2, 4.5])).toBe("fractional");
  });

  it("reads the positions apart from the size", () => {
    const halfSize = { ...output(3, 4), size: { w: 10.25, h: 10 } };
    expect(positionGrid(halfSize)).toBe("whole");
    expect(sizeGrid(halfSize)).toBe("fractional");
    expect(positionGrid(output(3.5, 4))).toBe("fractional");
    expect(sizeGrid(output(3.5, 4))).toBe("whole");
  });
});

describe("the option sets", () => {
  const sets = optionSets(allStrategies.map((s) => s.id), ENTRIES);

  it("has one set for each pair of a strategy and a name", () => {
    expect(new Set(sets.map((s) => `${s.strategy} ${s.optionSet}`)).size).toBe(sets.length);
  });

  it("gives each strategy at least one set", () => {
    const named = new Set(sets.map((s) => s.strategy));
    expect(allStrategies.filter((s) => !named.has(s.id))).toEqual([]);
  });

  it("reads an entry with options under its own name", () => {
    expect(sets).toContainEqual({ strategy: "side-anchors", optionSet: "side-anchors-first-left", options: { first: { side: "left", at: 0.5 } } });
    expect(sets).toContainEqual({ strategy: "side-anchors", optionSet: "default" });
  });

  it("makes no second set for an entry with no options", () => {
    expect(optionSets(["a"], [{ id: "b", strategy: "a", options: {} }])).toEqual([{ strategy: "a", optionSet: "default" }]);
  });

  it("gives no default set to a strategy that needs options", () => {
    expect(sets.some((s) => s.strategy === "aspect-fit" && s.optionSet === "default")).toBe(false);
    expect(sets.some((s) => s.strategy === "aspect-fit")).toBe(true);
  });
});

describe("the read of an option set", () => {
  const cells = wholeCells(SMALL);

  it("counts a refusal and an error apart, and the read goes on", () => {
    let call = 0;
    const read = readSet(SET, cells.slice(0, 3), () => {
      call += 1;
      if (call === 1) throw new UnsupportedCell("containerSize", "fixed");
      if (call === 2) throw new Error("broken");
      return output(1, 2);
    });
    expect(read).toMatchObject({ refused: 1, errors: 1, row: { inputs: 1 } });
    expect(read.firstError).toContain("broken");
  });

  it("counts each property, and names the first fractional input", () => {
    const read = readSet(SET, cells, (_, input) => ({ ...output(input.container.fixed === "size" ? 1 : 1.5, 2), size: { w: 10, h: input.gap === undefined ? 10 : 10 + OUTPUT_NEAR_WHOLE / 2 } }));
    const fixed = cells.filter((c) => c.mode === "fixed").length;
    expect(read.row.position.fractional).toBe(cells.length - fixed);
    expect(read.row.size).toEqual({ fractional: 0, nearWhole: cells.filter((c) => c.gap !== 0).length });
    expect(read.firstFractional.position).toContain("freeHeight.");
    expect(read.firstFractional.size).toBeUndefined();
  });

  it("reads a real strategy on the small family", () => {
    const read = readSet({ strategy: "rows", optionSet: "default" }, cells);
    expect(read.row.inputs + read.refused + read.errors).toBe(cells.length);
    expect(read.errors).toBe(0);
    expect(read.row.inputs).toBeGreaterThan(0);
  });

  it("reads a circle strategy as no packed input on rect inputs", () => {
    const read = readSet({ strategy: "circle-quasi-physical", optionSet: "default" }, cells.slice(0, 2));
    expect(read.row.inputs).toBe(0);
    expect(read.refused).toBe(2);
  });
});

describe("the check", () => {
  const stated = (over: Partial<OutputRead> = {}): OutputTable => ({ t: [row(over)] });

  it("has no finding when the read equals the table", () => {
    expect(compareReads(stated(), [readOf()])).toEqual([]);
  });

  it("names the strategy, the set, the property, both classes and the input", () => {
    const [finding, ...rest] = compareReads(stated(), [readOf({ position: { fractional: 1, nearWhole: 0 } }, { firstFractional: { position: "fixed.n5/s1" } })]);
    expect(rest).toEqual([]);
    expect(finding).toContain("t default position-grid");
    expect(finding).toContain("the table says whole");
    expect(finding).toContain("the read gives fractional");
    expect(finding).toContain("fixed.n5/s1");
  });

  it("also fails a change of a count with the same class", () => {
    const read = compareReads(stated({ size: { fractional: 2, nearWhole: 0 } }), [readOf({ size: { fractional: 3, nearWhole: 0 } })]);
    expect(read).toHaveLength(1);
    expect(read[0]).toContain("size-grid");
  });

  it("fails a change of the packed count on each property", () => {
    expect(compareReads(stated(), [readOf({ inputs: 239 })])).toHaveLength(2);
  });

  it("fails a read with no row, and a row with no read", () => {
    expect(compareReads({}, [readOf()])).toEqual(["t default: the table has no row."]);
    expect(compareReads(stated(), [])).toEqual(["t default: the table has a row, and this read has no such option set."]);
  });

  it("does not ask for the other rows when the read has only some strategies", () => {
    expect(compareReads(stated(), [], false)).toEqual([]);
  });

  it("fails a read with an error", () => {
    expect(compareReads(stated(), [readOf({}, { errors: 1, firstError: "broken" })])[0]).toContain("broken");
  });

  it("turns red on each fault, on a strategy with whole rows, and stays green on a clean copy", () => {
    const cells = wholeCells();
    const set: OptionSet = { strategy: "rows", optionSet: "default" };
    expect(compareReads(STRATEGY_OUTPUT, [readSet(set, cells)], false)).toEqual([]);
    const position = compareReads(STRATEGY_OUTPUT, [readSet(set, cells, faultyPack("half-position"))], false);
    expect(position).toHaveLength(1);
    expect(position[0]).toContain("the table says whole");
    expect(position[0]).toContain("The first fractional input: fixed.");
    const size = compareReads(STRATEGY_OUTPUT, [readSet(set, cells, faultyPack("half-size"))], false);
    expect(size).toHaveLength(1);
    expect(size[0]).toContain("size-grid");
  });

  it("refuses a name of no fault", () => {
    expect(() => faultyPack("none")).toThrow(RangeError);
  });
});

describe("the table", () => {
  it("keeps the order of the names, with the strategies and the rows sorted", () => {
    const reads = [
      { ...readOf({ optionSet: "z" }), strategy: "b" },
      { ...readOf({ optionSet: "a" }), strategy: "b" },
      { ...readOf(), strategy: "a" },
    ];
    const table = tableOf(reads);
    expect(Object.keys(table)).toEqual(["a", "b"]);
    expect(table["b"]!.map((r) => r.optionSet)).toEqual(["a", "z"]);
  });

  it("writes the text with the source, the version and each row", () => {
    const text = tableText({ t: [row()] }, "1.2.3");
    expect(text).toContain("This file is generated.");
    expect(text).toContain(`OUTPUT_READ_VERSION = "1.2.3"`);
    expect(text).toContain(`OUTPUT_SOURCE = "${OUTPUT_SOURCE}"`);
    expect(text).toContain(`"optionSet":"default"`);
  });

  it("counts the rows of each class", () => {
    expect(classCounts({ t: [row(), row({ position: { fractional: 1, nearWhole: 0 } })] })).toBe("position fractional: 1, position whole: 1, size whole: 2");
  });
});

describe("the committed table in the catalog", () => {
  const sets = optionSets(allStrategies.map((s) => s.id), ENTRIES);

  it("has a row for each option set and no other row", () => {
    const rows = Object.entries(STRATEGY_OUTPUT).flatMap(([id, list]) => list.map((r) => `${id} ${r.optionSet}`));
    expect(rows.toSorted()).toEqual(sets.map((s) => `${s.strategy} ${s.optionSet}`).toSorted());
  });

  it("gives each entry of the catalog two rows for each option set, with the source and the read version", () => {
    for (const entry of strategyCatalog.strategies) {
      const reads = STRATEGY_OUTPUT[entry.id]!;
      expect(entry.output).toHaveLength(2 * reads.length);
      for (const r of entry.output!) {
        expect(r.evidence.source).toBe(OUTPUT_SOURCE);
        expect(r.evidence.catalogVersion).toBe(OUTPUT_READ_VERSION);
      }
    }
  });

  it("passes the parser of the contract, which refuses a class that its counts do not give", () => {
    const parsed = parseStrategyCatalog(JSON.parse(writeStrategyCatalog(strategyCatalog, "9.9.9")));
    expect(parsed).toMatchObject({ ok: true });
  });
});
