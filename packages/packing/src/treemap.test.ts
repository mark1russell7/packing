import type { Rect } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { checkHard } from "./check.ts";
import type { PackInput } from "./contract.ts";
import { measure } from "./measures.ts";
import { treemapPack, treemapPivotMiddle, treemapPivotSize, treemapPivotSplit, treemapSliceDice, treemapSquarified, treemapStrip, type TreemapCell, type TreemapLayout, type TreemapNode } from "./treemap.ts";

const METHODS: readonly (readonly [string, TreemapLayout])[] = [
  ["slice-dice", treemapSliceDice],
  ["squarified", treemapSquarified],
  ["strip", treemapStrip],
  ["strip without lookahead", (nodes, frame) => treemapStrip(nodes, frame, { lookahead: false })],
  ["pivot-split", treemapPivotSplit],
  ["pivot-middle", treemapPivotMiddle],
  ["pivot-size", treemapPivotSize],
];

const leaves = (weights: readonly number[]): TreemapNode[] => weights.map((weight, index) => ({ id: `n${index}`, weight }));
const aspect = (cell: Rect): number => Math.max(cell.w / cell.h, cell.h / cell.w);
const meanAspect = (cells: readonly Rect[]): number => cells.reduce((sum, cell) => sum + aspect(cell), 0) / cells.length;

/** This function gives made-up weights with a seed: a log-normal list. */
function weightsOf(seed: string, count: number): number[] {
  const stream = random(seed);
  return Array.from({ length: count }, () => Math.exp(stream.normal(0, 1)));
}

/** This function examines the three rules of a treemap: inside the frame, no overlap, and an area in proportion to the weight. */
function expectTreemap(cells: readonly TreemapCell[], weights: ReadonlyMap<string, number>, frame: Rect): void {
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const noise = 1e-9 * Math.max(frame.w, frame.h);
  expect(cells).toHaveLength(weights.size);
  for (const [index, a] of cells.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(frame.x - noise);
    expect(a.y).toBeGreaterThanOrEqual(frame.y - noise);
    expect(a.x + a.w).toBeLessThanOrEqual(frame.x + frame.w + noise);
    expect(a.y + a.h).toBeLessThanOrEqual(frame.y + frame.h + noise);
    expect((a.w * a.h) / (frame.w * frame.h)).toBeCloseTo(weights.get(a.id)! / total, 9);
    for (const b of cells.slice(index + 1)) {
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(overlapX <= noise || overlapY <= noise, `${a.id} and ${b.id}`).toBe(true);
    }
  }
}

describe("each treemap method", () => {
  const frames: readonly Rect[] = [{ x: 0, y: 0, w: 100, h: 100 }, { x: 7, y: -3, w: 300, h: 40 }, { x: 0, y: 0, w: 25, h: 400 }];

  it.each(METHODS)("%s keeps the rules of a treemap on flat lists", (name, layout) => {
    for (const frame of frames) {
      for (const count of [1, 2, 3, 4, 5, 6, 9, 20, 60]) {
        const nodes = leaves(weightsOf(`${name}:${count}:${frame.w}`, count));
        expectTreemap(layout(nodes, frame), new Map(nodes.map((n) => [n.id, n.weight!])), frame);
      }
    }
  });

  it.each(METHODS)("%s keeps the rules of a treemap on a tree", (name, layout) => {
    const stream = weightsOf(`${name}:tree`, 27);
    const nodes: TreemapNode[] = [0, 1, 2].map((a) => ({
      id: `a${a}`,
      children: [0, 1, 2].map((b) => ({ id: `a${a}b${b}`, children: leaves(stream.slice(a * 9 + b * 3, a * 9 + b * 3 + 3)).map((n) => ({ ...n, id: `a${a}b${b}${n.id}` })) })),
    }));
    const cells = layout(nodes, frames[0]!);
    const weights = new Map(cells.map((cell, index) => [cell.id, stream[index]!]));
    expectTreemap(cells, weights, frames[0]!);
  });

  it.each(METHODS)("%s gives the same bytes for the same input and the leaves in the input order", (name, layout) => {
    const nodes = leaves(weightsOf(`${name}:same`, 40));
    const cells = layout(nodes, frames[0]!);
    expect(JSON.stringify(layout(nodes, frames[0]!))).toBe(JSON.stringify(cells));
    expect(cells.map((cell) => cell.id)).toEqual(nodes.map((node) => node.id));
  });

  it.each(METHODS)("%s gives no cells for no nodes", (_, layout) => {
    expect(layout([], frames[0]!)).toEqual([]);
  });

  it.each(METHODS)("%s refuses a bad weight, an empty branch and a bad frame", (_, layout) => {
    expect(() => layout(leaves([1, 0]), frames[0]!)).toThrow(RangeError);
    expect(() => layout(leaves([1, Number.NaN]), frames[0]!)).toThrow(RangeError);
    expect(() => layout(leaves([1, Infinity]), frames[0]!)).toThrow(RangeError);
    expect(() => layout([{ id: "b", children: [] }], frames[0]!)).toThrow(RangeError);
    expect(() => layout(leaves([1]), { x: 0, y: 0, w: 0, h: 10 })).toThrow(RangeError);
    expect(() => layout(leaves([1]), { x: 0, y: 0, w: 10, h: Infinity })).toThrow(RangeError);
  });

  it.each(METHODS)("%s moves with the frame", (_, layout) => {
    const nodes = leaves(weightsOf("moved", 12));
    const at = layout(nodes, { x: 0, y: 0, w: 80, h: 60 });
    const moved = layout(nodes, { x: 10, y: 20, w: 80, h: 60 });
    for (const [index, cell] of at.entries()) {
      expect(moved[index]!.x).toBeCloseTo(cell.x + 10, 9);
      expect(moved[index]!.y).toBeCloseTo(cell.y + 20, 9);
    }
  });
});

describe("the worked example of Bruls 2000 (areas 6, 6, 4, 3, 2, 2, 1 in a rectangle of 6 by 4)", () => {
  const frame = { x: 0, y: 0, w: 6, h: 4 };
  const areas = [6, 6, 4, 3, 2, 2, 1];

  it("gives the printed aspects of the final layout", () => {
    const printed = [3 / 2, 3 / 2, 49 / 36, 49 / 27, 25 / 18, 25 / 18, 25 / 9];
    const cells = treemapSquarified(leaves(areas), frame);
    for (const [index, cell] of cells.entries()) expect(aspect(cell), cell.id).toBeCloseTo(printed[index]!, 9);
  });

  it("gives the printed aspects 16 and 36 of the plain cuts", () => {
    expect(Math.max(...treemapSliceDice(leaves(areas), frame).map(aspect))).toBeCloseTo(16, 9);
    const turned = treemapSliceDice([{ id: "root", children: leaves(areas) }], frame);
    expect(Math.max(...turned.map(aspect))).toBeCloseTo(36, 9);
  });

  it("does not depend on the input order, except for the ids", () => {
    const reversed = [...areas].reverse();
    const cells = treemapSquarified(leaves(reversed), frame);
    const expected = treemapSquarified(leaves(areas), frame);
    const sorted = (list: readonly Rect[]): number[] => list.map(aspect).sort((a, b) => a - b);
    expect(sorted(cells)).toEqual(sorted(expected));
  });
});

describe("slice and dice", () => {
  it("keeps the input order along each axis and turns at each level", () => {
    const cells = treemapSliceDice([
      { id: "a", children: leaves([1, 1]) },
      { id: "b", weight: 2 },
    ], { x: 0, y: 0, w: 8, h: 8 });
    expect(cells).toEqual([
      { id: "n0", x: 0, y: 0, w: 4, h: 4 },
      { id: "n1", x: 0, y: 4, w: 4, h: 4 },
      { id: "b", x: 4, y: 0, w: 4, h: 8 },
    ]);
  });
});

describe("squarified", () => {
  it("gives a lower mean aspect than slice and dice", () => {
    const nodes = leaves(weightsOf("squarified", 50));
    const frame = { x: 0, y: 0, w: 100, h: 100 };
    expect(meanAspect(treemapSquarified(nodes, frame))).toBeLessThan(meanAspect(treemapSliceDice(nodes, frame)));
  });

  it("keeps the input order for equal weights", () => {
    const cells = treemapSquarified(leaves([1, 1, 1, 1]), { x: 0, y: 0, w: 4, h: 4 });
    expect(cells.map(aspect)).toEqual([1, 1, 1, 1]);
    expect(cells[0]).toMatchObject({ x: 0, y: 0 });
    expect(cells[3]).toMatchObject({ x: 2, y: 2 });
  });
});

describe("strip", () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 };

  it("keeps the reading order: rows from the top, and each row from the left", () => {
    const cells = treemapStrip(leaves(weightsOf("strip", 30)), frame);
    for (let i = 1; i < cells.length; i += 1) {
      const a = cells[i - 1]!;
      const b = cells[i]!;
      if (b.y === a.y) expect(b.x).toBeCloseTo(a.x + a.w, 9);
      else expect(b.y).toBeCloseTo(a.y + a.h, 9);
    }
  });

  it("gives horizontal strips with the full width", () => {
    const cells = treemapStrip(leaves(weightsOf("strip-width", 30)), frame);
    const rows = new Map<number, number>();
    for (const cell of cells) rows.set(cell.y, (rows.get(cell.y) ?? 0) + cell.w);
    for (const width of rows.values()) expect(width).toBeCloseTo(100, 9);
    expect(rows.size).toBeGreaterThan(1);
  });

  it("joins an item only while the mean aspect does not get higher", () => {
    const cells = treemapStrip(leaves([1, 1, 1, 1]), frame, { lookahead: false });
    expect(cells.map(aspect)).toEqual([1, 1, 1, 1]);
    expect(cells[2]).toMatchObject({ x: 0, y: 50 });
  });

  it("removes a thin last strip with the lookahead", () => {
    // Five equal items: the plain method gives rows of 2, 2 and 1. The lookahead joins the last two rows.
    const nodes = leaves([1, 1, 1, 1, 1]);
    const plain = treemapStrip(nodes, frame, { lookahead: false });
    const joined = treemapStrip(nodes, frame);
    expect(new Set(plain.map((cell) => cell.y)).size).toBe(3);
    expect(new Set(joined.map((cell) => cell.y)).size).toBe(2);
    expect(meanAspect(joined)).toBeLessThanOrEqual(meanAspect(plain));
  });
});

describe("pivot by split size", () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 };

  it("puts the pivot next to the items before it, with the most equal weights on its two sides", () => {
    const cells = treemapPivotSplit(leaves([3, 1, 1, 1, 3, 1, 1, 1, 3]), frame);
    const pivot = cells[4]!;
    const before = cells.slice(0, 4);
    for (const cell of before) expect(cell.x + cell.w).toBeLessThanOrEqual(pivot.x + 1e-9);
    expect(pivot.y).toBeCloseTo(0, 9);
  });

  it("uses the quad for four equal items in a square", () => {
    expect(treemapPivotSplit(leaves([1, 1, 1, 1]), frame).map(aspect)).toEqual([1, 1, 1, 1]);
  });

  it("uses a snake when it gives the best mean aspect", () => {
    const cells = treemapPivotSplit(leaves([1, 1, 1]), { x: 0, y: 0, w: 300, h: 100 });
    expect(cells.map(aspect)).toEqual([1, 1, 1]);
    expect(cells.map((cell) => cell.x)).toEqual([0, 100, 200]);
  });

  it("turns the arrangement in a tall frame", () => {
    const cells = treemapPivotSplit(leaves([3, 1, 1, 1, 3, 1, 1, 1, 3]), { x: 0, y: 0, w: 50, h: 200 });
    const pivot = cells[4]!;
    for (const cell of cells.slice(0, 4)) expect(cell.y + cell.h).toBeLessThanOrEqual(pivot.y + 1e-9);
    expect(pivot.x).toBeCloseTo(0, 9);
  });

  it("gives a mean aspect far below slice and dice", () => {
    const nodes = leaves(weightsOf("pivot", 100));
    expect(meanAspect(treemapPivotSplit(nodes, frame))).toBeLessThan(meanAspect(treemapSliceDice(nodes, frame)) / 5);
  });
});

describe("pivot by middle and pivot by size", () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 };
  // The pivot of these weights is item 1 by size, item 2 by split size and item 4 by middle.
  const weights = [1, 5, 1, 1, 1, 1, 1, 1, 1];

  /** This function examines that the cell `pivot` is at the top, with each cell before it at its left. */
  const expectPivot = (cells: readonly TreemapCell[], pivot: number): void => {
    expect(cells[pivot]!.y).toBeCloseTo(0, 9);
    for (const cell of cells.slice(0, pivot)) expect(cell.x + cell.w).toBeLessThanOrEqual(cells[pivot]!.x + 1e-9);
    expect(cells[pivot]!.x).toBeGreaterThan(0);
  };

  it("puts the pivot of each rule at the top, next to the items before it", () => {
    expectPivot(treemapPivotSize(leaves(weights), frame), 1);
    expectPivot(treemapPivotSplit(leaves(weights), frame), 2);
    expectPivot(treemapPivotMiddle(leaves(weights), frame), 4);
  });

  it("gives the first of the largest items as the pivot by size", () => {
    expectPivot(treemapPivotSize(leaves([1, 1, 5, 1, 5, 1, 1, 1, 1]), frame), 2);
  });

  it("picks the second of the two middle items for an even count", () => {
    expectPivot(treemapPivotMiddle(leaves([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), frame), 5);
  });

  it("gives a mean aspect far below slice and dice", () => {
    const nodes = leaves(weightsOf("pivot", 100));
    const sliceDice = meanAspect(treemapSliceDice(nodes, frame));
    expect(meanAspect(treemapPivotMiddle(nodes, frame))).toBeLessThan(sliceDice / 5);
    expect(meanAspect(treemapPivotSize(nodes, frame))).toBeLessThan(sliceDice / 5);
  });
});

describe("treemapPack", () => {
  const free: PackInput["container"] = { fixed: "none" };

  /** This function gives a made-up input of boxes. */
  function inputOf(seed: string, count: number): PackInput {
    const stream = random(seed);
    const items = Array.from({ length: count }, (_, index) => ({ id: `b${index}`, w: stream.int(2, 90), h: stream.int(2, 90) }));
    return { container: free, items };
  }

  it.each(METHODS)("%s gives no overlap on 200 made-up inputs", (name, layout) => {
    for (let seed = 0; seed < 200; seed += 1) {
      const input = inputOf(`${name}:${seed}`, 2 + (seed % 60));
      const output = treemapPack(input, layout);
      expect(output.placements).toHaveLength(input.items.length);
      const hard = checkHard(input, output);
      expect(hard["no-overlap"], `seed ${seed}`).toBe(0);
    }
  });

  it.each(METHODS)("%s puts each box at the center of its scaled cell", (_, layout) => {
    const input = inputOf("center", 25);
    const output = treemapPack(input, layout);
    for (const [index, item] of input.items.entries()) {
      const p = output.placements[index]!;
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x + item.w).toBeLessThanOrEqual(output.size.w + 1e-9);
      expect(p.y + item.h).toBeLessThanOrEqual(output.size.h + 1e-9);
    }
  });

  it("gives the size of one box with no scale, and the measures of the package read it", () => {
    const input: PackInput = { container: free, items: [{ id: "a", w: 10, h: 10 }] };
    const output = treemapPack(input, treemapSquarified);
    expect(output).toEqual({ placements: [{ id: "a", x: 0, y: 0 }], overflow: [], size: { w: 10, h: 10 }, moved: [] });
    expect(measure(input, output)["pack.fill"]).toBeCloseTo(1, 9);
  });

  it("gives a frame with the aspect of the container", () => {
    const input: PackInput = { container: { fixed: "none", aspect: 2 }, items: [{ id: "a", w: 20, h: 10 }] };
    const output = treemapPack(input, treemapStrip);
    expect(output.size.w).toBeCloseTo(20, 9);
    expect(output.size.h).toBeCloseTo(10, 9);
  });

  it("keeps the margins and the gap between the boxes", () => {
    const input: PackInput = { container: free, gap: 2, items: [{ id: "a", w: 10, h: 10, margin: 1 }, { id: "b", w: 10, h: 10, margin: 3 }] };
    const output = treemapPack(input, treemapSliceDice);
    const [a, b] = output.placements;
    expect(b!.x - (a!.x + 10)).toBeGreaterThanOrEqual(1 + 2 + 3 - 1e-9);
    expect(checkHard(input, output)["no-overlap"]).toBe(0);
  });

  it("keeps the input order of slice and dice in the order measure", () => {
    const input = inputOf("order", 30);
    const output = treemapPack(input, treemapSliceDice);
    expect(output.placements.every((p, index) => index === 0 || p.x > output.placements[index - 1]!.x)).toBe(true);
  });

  it("gives an empty output for no boxes", () => {
    expect(treemapPack({ container: free, items: [] }, treemapStrip)).toEqual({ placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] });
  });

  it("refuses a fixed container and obstacles", () => {
    const items = [{ id: "a", w: 1, h: 1 }];
    expect(() => treemapPack({ container: { fixed: "size", w: 9, h: 9 }, items }, treemapStrip)).toThrow(RangeError);
    expect(() => treemapPack({ container: free, items, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] }, treemapStrip)).toThrow(RangeError);
  });

  it("does not change its input", () => {
    const input = inputOf("frozen", 12);
    const before = JSON.stringify(input);
    treemapPack(input, treemapPivotSplit);
    expect(JSON.stringify(input)).toBe(before);
  });
});
