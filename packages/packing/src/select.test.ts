import { describe, expect, it } from "vitest";
import {
  checkSelectTable,
  composites,
  DEFAULT_STRATEGY,
  packDefault,
  packWith,
  SELECT_MAX_DEPTH,
  SELECT_MEMBERS,
  SELECT_STAGE,
  SELECT_TABLE,
  selectFeatures,
  selectLeaf,
  selectStrategy,
  spreadOf,
  strategy,
  type Item,
  type LayoutContainer,
  type PackInput,
  type PackOutput,
  type SelectNode,
} from "./index.ts";

// The strategy select of k66, part 2. Made-up inputs only: each test pins one leaf of SELECT_TABLE.

/** The sides of the items of each kind of spread: one size, a near size or two very different sizes */
const SIDES = {
  identical: (_i: number): number => 10,
  uniform: (i: number): number => 8 + (i % 5),
  heavy: (i: number): number => (i % 2 === 0 ? 5 : 60),
} as const;

/** This function makes an input with `count` square items of a kind of spread in a container. */
function input(count: number, kind: keyof typeof SIDES, container: LayoutContainer, obstacles?: PackInput["obstacles"]): PackInput {
  const items: Item[] = Array.from({ length: count }, (_, i) => ({ id: `b${i}`, w: SIDES[kind](i), h: SIDES[kind](i) }));
  return { container, items, ...(obstacles === undefined ? {} : { obstacles }) };
}

const FIXED: LayoutContainer = { fixed: "size", w: 2000, h: 2000 };
const FREE: LayoutContainer = { fixed: "none", aspect: 1 };
const CIRCLE: LayoutContainer = { fixed: "none", aspect: 1, shape: { kind: "circle", cx: 0, cy: 0, r: 100 } };

/** This function gives the stage `select` of an output. */
const stageOf = (out: PackOutput) => out.trace?.find((s) => s.id === SELECT_STAGE);

/** This function gives the placements of an output, which do not depend on the clock. */
const placed = (out: PackOutput) => ({ placements: out.placements, overflow: out.overflow, size: out.size });

describe("selectFeatures", () => {
  it("gives the count, the container flags and the spread of spreadOf", () => {
    const x = input(10, "heavy", FIXED);
    expect(selectFeatures(x)).toEqual({ count: 10, fixed: true, rect: true, spread: spreadOf(x) });
    expect(selectFeatures(input(10, "identical", FREE)).spread).toBeLessThan(1e-9);
    expect(selectFeatures(input(10, "uniform", CIRCLE))).toMatchObject({ fixed: false, rect: false });
  });

  it("reads a free width as a free size, and an obstacle that is not a rectangle as not rect", () => {
    expect(selectFeatures(input(3, "uniform", { fixed: "width", w: 200 })).fixed).toBe(false);
    const hole = [{ id: "o", region: { kind: "circle" as const, cx: 50, cy: 50, r: 10 } }];
    const wall = [{ id: "o", region: { kind: "rect" as const, x: 0, y: 0, w: 10, h: 10 } }];
    expect(selectFeatures(input(3, "uniform", FIXED, hole)).rect).toBe(false);
    expect(selectFeatures(input(3, "uniform", FIXED, wall)).rect).toBe(true);
  });
});

describe("SELECT_TABLE", () => {
  // Each case: the input, the leaf and the member of the leaf
  const cases: [string, PackInput, number, string][] = [
    ["fixed, few items, identical sizes", input(10, "identical", FIXED), 0, "rows"],
    ["fixed, few items, uniform sizes", input(10, "uniform", FIXED), 1, "maxrects-bl"],
    ["fixed, few items, a heavy tail", input(10, "heavy", FIXED), 1, "maxrects-bl"],
    ["fixed, many items, uniform sizes", input(400, "uniform", FIXED), 2, "rows"],
    ["fixed, many items, a heavy tail", input(400, "heavy", FIXED), 3, "maxrects-bl"],
    ["free, uniform sizes", input(10, "uniform", FREE), 4, "rows"],
    ["free, identical sizes in a shape", input(10, "identical", CIRCLE), 4, "rows"],
    ["free, a heavy tail in a rectangle", input(10, "heavy", FREE), 5, "rows"],
    ["free, a heavy tail in a circle", input(10, "heavy", CIRCLE), 6, "maxrects-bl"],
  ];

  for (const [name, x, leaf, member] of cases) {
    it(`picks ${member} at the leaf ${leaf}: ${name}`, () => {
      const pick = SELECT_MEMBERS.findIndex((m) => m.id === member);
      expect(selectLeaf(selectFeatures(x))).toEqual({ leaf, pick });
      const out = packWith("select", x);
      const e = SELECT_MEMBERS[pick]!;
      expect(placed(out)).toEqual(placed(packWith(e.strategy, x, e.options)));
      expect(stageOf(out)?.measures).toMatchObject({ "move.select": pick, "select.member": pick, [`select.pick.${member}`]: 1, "select.leaf": leaf, "select.count": x.items.length });
    });
  }

  it("has 7 leaves, each one with a path of 3 tests or fewer, and the members rows and maxrects-bl", () => {
    expect(() => checkSelectTable(SELECT_TABLE, 2)).not.toThrow();
    const leaves: number[] = [];
    const walk = (n: SelectNode): void => {
      if ("leaf" in n) leaves.push(n.leaf);
      else [n.yes, n.no].forEach(walk);
    };
    walk(SELECT_TABLE);
    expect(leaves.toSorted()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(SELECT_MEMBERS.map((m) => m.id)).toEqual(["rows", "maxrects-bl"]);
  });
});

describe("the strategy select", () => {
  it("is a composite strategy of the registry, and it gives the same output for the same input and seed", () => {
    expect(composites).toContain(selectStrategy);
    expect(strategy("select")).toBe(selectStrategy);
    const x = input(30, "heavy", FIXED);
    expect(placed(packWith("select", x, undefined, 4))).toEqual(placed(packWith("select", x, undefined, 4)));
  });

  it("puts its stage after the stages of the member, with the features", () => {
    const x = input(10, "heavy", CIRCLE);
    const out = packWith("select", x);
    expect(out.trace?.at(-1)?.id).toBe(SELECT_STAGE);
    expect(stageOf(out)?.measures).toMatchObject({ "select.fixed": 0, "select.rect": 0, "select.spread": Math.round(spreadOf(x) * 1000) / 1000 });
  });

  it("takes other members and another table", () => {
    const table: SelectNode = { feature: "count", below: 5, yes: { leaf: 0, pick: 1 }, no: { leaf: 1, pick: 0 } };
    const members = ["skyline", { id: "shelf-best", strategy: "shelf", options: { fit: "best" } }];
    const small = packWith("select", input(3, "uniform", FIXED), { members, table });
    expect(stageOf(small)?.measures).toMatchObject({ "move.select": 1, "select.pick.shelf-best": 1, "select.leaf": 0 });
    const large = packWith("select", input(9, "uniform", FIXED), { members, table });
    expect(stageOf(large)?.measures).toMatchObject({ "move.select": 0, "select.pick.skyline": 1, "select.leaf": 1 });
  });

  it("refuses a table with a bad pick, a path that is too deep, a bad threshold and an unknown member", () => {
    const leaf = (pick: number): SelectNode => ({ leaf: 0, pick });
    expect(() => checkSelectTable(leaf(2), 2)).toThrow(RangeError);
    let deep: SelectNode = leaf(0);
    for (let d = 0; d <= SELECT_MAX_DEPTH; d++) deep = { feature: "fixed", yes: deep, no: leaf(0) };
    expect(() => checkSelectTable(deep, 2)).toThrow(/more than 3 tests/);
    expect(() => checkSelectTable({ feature: "spread", below: Number.NaN, yes: leaf(0), no: leaf(0) }, 1)).toThrow(/number below/);
    expect(() => packWith("select", input(3, "uniform", FIXED), { members: ["nope", "rows"] })).toThrow(RangeError);
  });
});

describe("the default strategy of an input", () => {
  it("is select: packDefault gives the output of packWith with DEFAULT_STRATEGY", () => {
    expect(DEFAULT_STRATEGY).toBe("select");
    for (const x of [input(30, "heavy", FIXED), input(10, "uniform", CIRCLE)]) {
      expect(placed(packDefault(x))).toEqual(placed(packWith("select", x)));
      expect(placed(packDefault(x, 4))).toEqual(placed(packWith("select", x, undefined, 4)));
    }
  });
});
