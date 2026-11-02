import { checkHard, outputHash, packWith, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { predicates } from "../src/probe.ts";
import { collectCase, containerNear, edgeRangeNear, overlapNear, samePlacementsNear, xAtNear } from "./predicates.ts";

const box = (l: number, t: number, r: number, b: number) => ({ l, t, r, b });

/** A fixed container with a triangle obstacle: a strategy with a free space reads the edges of the triangle. */
const TRIANGLE: PackInput = {
  container: { w: 100, h: 100, fixed: "size" },
  items: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, w: 20, h: 15 })),
  obstacles: [{ id: "o", region: { kind: "polygon", points: [[40, 30], [80, 30], [60, 70]] } }],
};

describe("overlapNear", () => {
  it("gives a touch for a margin of exactly 0, and no line reason", () => {
    expect(overlapNear({ a: box(0, 0, 10, 10), b: box(10, 0, 20, 10), tolerance: 0.001 })).toEqual(["x:zero:touch"]);
  });

  it("gives x:zero for a margin near 0 that is not 0", () => {
    expect(overlapNear({ a: box(0, 0, 0.1 + 0.2, 10), b: box(0.3, 0, 20, 10), tolerance: 0.001 })).toEqual(["x:zero"]);
  });

  it("gives y:tolerance for a margin near the tolerance, and nothing for a far pair", () => {
    expect(overlapNear({ a: box(0, 0, 10, 5.001), b: box(0, 5, 10, 10), tolerance: 0.001 })).toEqual(["y:tolerance"]);
    expect(overlapNear({ a: box(0, 0, 10, 10), b: box(30, 30, 40, 40), tolerance: 0.001 })).toEqual([]);
  });
});

describe("containerNear", () => {
  const args = { x: 0, y: 0, w: 100, h: 50, inset: 0, tolerance: 0.001, fixedW: true, fixedH: false };

  it("examines only the fixed sides", () => {
    expect(containerNear({ ...args, box: box(0, 0, 100, 50) })).toEqual(["left:zero:touch", "right:zero:touch"]);
  });

  it("gives right:tolerance for an edge near the side moved out by the tolerance", () => {
    expect(containerNear({ ...args, box: box(10, 0, 100.001, 20) })).toEqual(["right:tolerance"]);
  });
});

describe("edgeRangeNear and xAtNear", () => {
  it("gives low for a segment that ends near the strip, and a touch for one that ends on it", () => {
    expect(edgeRangeNear({ ax: 0, ay: 0, bx: 10, by: 0.1 + 0.2, y0: 0.3, y1: 5 })).toEqual(["low"]);
    expect(edgeRangeNear({ ax: 0, ay: 0, bx: 10, by: 3, y0: 3, y1: 5 })).toEqual(["low:touch"]);
  });

  it("gives flat for a segment with near but different ends", () => {
    expect(edgeRangeNear({ ax: 0, ay: 0.3, bx: 10, by: 0.1 + 0.2, y0: -5, y1: 5 })).toEqual(["flat"]);
  });

  it("gives end for a y near an end, and nothing at the end", () => {
    expect(xAtNear({ ax: 0, ay: 0.3, bx: 10, by: 10, y: 0.1 + 0.2 })).toEqual(["end"]);
    expect(xAtNear({ ax: 0, ay: 0.3, bx: 10, by: 10, y: 0.3 })).toEqual([]);
  });
});

describe("samePlacementsNear", () => {
  const p = { id: "a", x: 0.3, y: 1 };

  it("gives the first pair that is different but near", () => {
    const q = { id: "a", x: 0.1 + 0.2, y: 1 };
    expect(samePlacementsNear({ a: [p], b: [q] }, false)).toEqual({ a: p, b: q });
  });

  it("gives undefined for equal lists, a far pair and other ids", () => {
    expect(samePlacementsNear({ a: [p], b: [p] }, true)).toBeUndefined();
    expect(samePlacementsNear({ a: [p], b: [{ ...p, x: 5 }] }, false)).toBeUndefined();
    expect(samePlacementsNear({ a: [p], b: [{ ...p, id: "b" }] }, false)).toBeUndefined();
  });
});

describe("collectCase", () => {
  const input: PackInput = {
    container: { w: 30, h: 10, fixed: "size" },
    items: [
      { id: "a", w: 10, h: 10 },
      { id: "b", w: 10, h: 10 },
    ],
  };
  const output: PackOutput = {
    placements: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0.1 + 0.2 - 0.3 },
    ],
    overflow: [],
    moved: [],
  } as unknown as PackOutput;

  it("counts each pair and box, and writes a line only for an input that is near but not exact", () => {
    const { lines, summary } = collectCase("c", () => {
      checkHard(input, output);
    });
    expect(summary.totalPairs).toBe(1);
    expect(summary.totals.container).toBe(2);
    expect(summary.touch.overlap).toBe(1);
    expect(lines.filter((l) => l["fn"] === "container")).toHaveLength(1);
    expect(lines[0]).toMatchObject({ case: "c", fn: "container", near: ["top:zero", "bottom:zero:touch"], floatAnswer: false, times: 1 });
  });

  it("sets the probe back after an error, and the default probe is undefined", () => {
    expect(predicates.probe).toBeUndefined();
    expect(() =>
      collectCase("c", () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(predicates.probe).toBeUndefined();
  });

  it("sees the edges of a polygon obstacle, and the pack stays byte-equal with the probe", () => {
    const plain = outputHash(packWith("maxrects", TRIANGLE, undefined, 1));
    let probed = "";
    const { summary } = collectCase("t", () => {
      probed = outputHash(packWith("maxrects", TRIANGLE, undefined, 1));
    });
    expect(probed).toBe(plain);
    expect(summary.totals.edgeRange).toBeGreaterThan(0);
    expect(summary.totals.xAt).toBeGreaterThan(0);
  });
});
