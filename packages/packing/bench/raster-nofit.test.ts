import { describe, expect, it } from "vitest";
import { cellCosts, crossingPairs, densityOf, instanceInput, measureRow, PUBLISHED, rasterFamily, type RasterRow } from "./raster-nofit.ts";

// A made-up file in the form of an instance file. It has no data of a published set.
const FILE = JSON.stringify({
  strip_height: 4,
  items: [
    { demand: 2, orientation: { rotation: { angles: [0] } }, shape: { data: [[0, 0], [3, 0], [3, 1], [0, 1], [0, 0]] } },
    { demand: 1, orientation: { rotation: { angles: [0, 90, 180, 270] } }, shape: { data: [[0, 0], [1, 0], [1, 2], [0, 0]] } },
  ],
});

/** This function gives a made-up row for the summary. */
function row(name: string, divisor: number, density: number): RasterRow {
  return { name, divisor, cell: 1, trials: 1, density, coverShare: 0.5, crossings: 0, ms: 2, overflow: 0 };
}

describe("instanceInput", () => {
  it("swaps the axes, drops the closing point and repeats each item by its demand", () => {
    const { name, input, turns } = instanceInput("made", FILE);
    expect(name).toBe("made");
    expect(input.container).toEqual({ w: 4, fixed: "width" });
    expect(input.items.map((i) => i.id)).toEqual(["t0.0", "t0.1", "t1.0"]);
    expect(input.items[0]).toMatchObject({ w: 1, h: 3, shape: { kind: "polygon", points: [[0, 0], [0, 3], [1, 3], [1, 0]] } });
    expect(input.items[0]?.turnable).toBeUndefined();
    expect(input.items[2]?.turnable).toBe(true);
    expect(turns).toBe("fewer");
  });

  it("moves each shape to the origin of its box", () => {
    const moved = JSON.stringify({ strip_height: 9, items: [{ demand: 1, orientation: { rotation: { angles: [0] } }, shape: { data: [[-1, 2], [1, 2], [1, 5], [-1, 2]] } }] });
    expect(instanceInput("moved", moved).input.items[0]).toMatchObject({ w: 3, h: 2, shape: { points: [[0, 0], [0, 2], [3, 2]] } });
  });

  it("tells that a file with one turn keeps each turn", () => {
    const one = JSON.stringify({ strip_height: 2, items: [{ demand: 1, orientation: { rotation: { angles: [0] } }, shape: { data: [[0, 0], [1, 0], [1, 1], [0, 0]] } }] });
    expect(instanceInput("one", one).turns).toBe("same");
  });

  it("does not turn an item of a file with the turns 0 and 180 only", () => {
    const half = JSON.stringify({ strip_height: 2, items: [{ demand: 1, orientation: { rotation: { angles: [0, 180] } }, shape: { data: [[0, 0], [1, 0], [1, 1], [0, 0]] } }] });
    const { input, turns } = instanceInput("half", half);
    expect(input.items[0]?.turnable).toBeUndefined();
    expect(turns).toBe("fewer");
  });
});

describe("the measures", () => {
  it("gives the same family for the same seed, and a valid pack", () => {
    const input = rasterFamily(3, 9);
    expect(rasterFamily(3, 9)).toEqual(input);
    const measured = measureRow("s3", input, 1, 8, 3, 3);
    expect(measured.overflow).toBe(0);
    expect(measured.crossings).toBe(0);
    expect(measured.density).toBeGreaterThan(0);
    expect(measured.density).toBeLessThanOrEqual(100);
  });

  it("counts the density of the placed items over the strip", () => {
    const input = instanceInput("made", FILE).input;
    const output = { placements: input.items.map((i) => ({ id: i.id, x: 0, y: 0 })), overflow: [], size: { w: 4, h: 2 }, moved: [] };
    expect(densityOf(input, output)).toBeCloseTo((100 * 7) / 8, 9);
  });

  it("counts a pair with crossing edges", () => {
    const input = instanceInput("made", FILE).input;
    const crossed = { placements: [{ id: "t0.0", x: 0, y: 0 }, { id: "t1.0", x: 0.5, y: -0.5 }], overflow: [], size: { w: 4, h: 4 }, moved: [] };
    expect(crossingPairs(input, crossed)).toBe(1);
  });

  it("does not count a box in the notch of a concave shape, and counts a box inside a shape", () => {
    const notched = { id: "u", w: 3, h: 3, shape: { kind: "polygon" as const, points: [[0, 0], [1, 0], [1, 2], [2, 2], [2, 0], [3, 0], [3, 3], [0, 3]] as [number, number][] } };
    const box = (id: string, w: number, h: number) => ({ id, w, h, shape: { kind: "polygon" as const, points: [[0, 0], [w, 0], [w, h], [0, h]] as [number, number][] } });
    const input = { container: { w: 9, fixed: "width" as const }, items: [notched, box("in", 1, 2), box("big", 8, 8), box("small", 1, 1)] };
    const placed = [{ id: "u", x: 0, y: 0 }, { id: "in", x: 1, y: 0 }];
    const output = { placements: placed, overflow: [], size: { w: 9, h: 3 }, moved: [] };
    expect(crossingPairs(input, output)).toBe(0);
    const nested = [{ id: "big", x: 0, y: 0 }, { id: "small", x: 2, y: 2 }];
    expect(crossingPairs(input, { ...output, placements: nested })).toBe(1);
  });

  it("gives the paired gain of the finest cell", () => {
    const rows = [row("a", 8, 50), row("a", 32, 55), row("b", 8, 60), row("b", 32, 60)];
    const [coarse, fine] = cellCosts(rows);
    expect(coarse?.medianGainOfFinest).toBeCloseTo(0.05, 9);
    expect(fine?.medianGainOfFinest).toBe(0);
    expect(coarse?.meanMs).toBe(2);
  });

  it("keeps each published row with its 3 methods", () => {
    expect(Object.keys(PUBLISHED)).toHaveLength(12);
    expect(PUBLISHED["shapes0"]).toEqual({ sparrow: 68.6, roma: 68.73, ps: 66.5 });
  });
});
