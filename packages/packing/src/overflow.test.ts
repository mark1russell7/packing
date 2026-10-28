import { compareMeasure } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  MEASURE_SPECS,
  edgeCases,
  measure,
  packWith,
  rectGrid,
  toPackInput,
  type CorpusGenerator,
  type GeneratorParams,
  type MeasureId,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";
import { freeAreaBound, overflowBound } from "./overflow.ts";

// The overflow measures of k59 (docs/MEASURES.md, "Overflow"), and the minimum effects of MEASURE_SPECS.

const square = (n: number, side: number, prefix = "b"): PackInput["items"] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, w: side, h: side }));
const box100 = { w: 100, h: 100, fixed: "size" } as const;

describe("overflowBound", () => {
  it("forces each item that is too long for a fixed side, in each allowed turn", () => {
    const input: PackInput = {
      container: box100,
      items: [
        { id: "wide", w: 120, h: 10 },
        { id: "tall", w: 10, h: 120, turnable: true },
        { id: "turns", w: 120, h: 10, turnable: true },
        { id: "fits", w: 100, h: 100 },
      ],
    };
    // "turns" is 120 by 10. It is too wide, and its turn is too tall. The other 2 long items are too long in each turn.
    expect(overflowBound(input).forced).toBe(3);
    const inset: PackInput = { container: { ...box100, inset: 5 }, items: [{ id: "a", w: 95, h: 10 }] };
    expect(overflowBound(inset).forced).toBe(1);
    const width: PackInput = { container: { w: 100, fixed: "width" }, items: [{ id: "a", w: 101, h: 10 }, { id: "b", w: 10, h: 10_000 }] };
    expect(overflowBound(width)).toMatchObject({ forced: 1, free: Infinity });
  });

  it("drops the fewest largest items that make the rest fit the free area", () => {
    // 5 boxes of 2500 in an area of 10000: 1 box goes
    const five: PackInput = { container: box100, items: square(5, 50) };
    expect(overflowBound(five).forced).toBe(1);
    // 1 large box and 4 small boxes: the large box goes first, so 1 box is enough
    const mixed: PackInput = { container: box100, items: [{ id: "l", w: 90, h: 90 }, ...square(4, 30)] };
    expect(overflowBound(mixed).forced).toBe(1);
    const m = measure(five, { placements: [], overflow: five.items.map((i) => i.id), size: { w: 100, h: 100 }, moved: [] });
    // The slack of the tolerance makes the area a little smaller than 2500
    expect(m["pack.overflow.forcedArea"]).toBeCloseTo(2500 / 12500, 3);
  });

  it("gives 0 when the items fit by size and by area", () => {
    expect(overflowBound({ container: box100, items: square(4, 50) }).forced).toBe(0);
    expect(overflowBound({ container: box100, items: [] }).forced).toBe(0);
    expect(overflowBound({ container: { fixed: "none" }, items: square(4, 500) })).toEqual({ forced: 0, area: 0, free: Infinity });
  });

  it("subtracts the exact union of the rectangle obstacles", () => {
    const obstacles: NonNullable<PackInput["obstacles"]> = [
      { id: "o1", region: { kind: "rect", x: 0, y: 0, w: 50, h: 50 } },
      { id: "o2", region: { kind: "rect", x: 25, y: 0, w: 50, h: 50 } },
    ];
    const input: PackInput = { container: box100, items: square(10, 25), obstacles };
    // The union is 75 by 50. The sum of the 2 areas is 5000, but the free area is 10000 - 3750.
    expect(freeAreaBound(input)).toBe(6250);
    expect(overflowBound(input).forced).toBe(0);
    // An obstacle that can move goes out of the way
    const moving: PackInput = { ...input, obstacles: obstacles.map((o) => ({ ...o, move: { cost: 1 } })) };
    expect(freeAreaBound(moving)).toBe(10000);
  });

  it("subtracts the locked items, and does not count them as candidates", () => {
    const input: PackInput = { container: box100, items: [{ id: "lock", w: 100, h: 50, x: 0, y: 0, locked: true }, ...square(3, 50)] };
    expect(freeAreaBound(input)).toBe(5000);
    expect(overflowBound(input).forced).toBe(1);
  });

  it("uses the exact area of a circle, an ellipse and a polygon with a hole", () => {
    const circle: PackInput = { container: { fixed: "size", shape: { kind: "circle", cx: 50, cy: 50, r: 50 } }, items: square(4, 50) };
    expect(freeAreaBound(circle)).toBeCloseTo(Math.PI * 2500, 9);
    expect(overflowBound(circle).forced).toBe(1);
    const ellipse: PackInput = { container: { fixed: "size", shape: { kind: "ellipse", cx: 100, cy: 50, rx: 100, ry: 50 } }, items: [] };
    expect(freeAreaBound(ellipse)).toBeCloseTo(Math.PI * 5000, 9);
    const holes: PackInput = {
      container: {
        fixed: "size",
        shape: {
          kind: "polygon",
          points: [[0, 0], [100, 0], [100, 100], [0, 100]],
          holes: [[[25, 25], [75, 25], [75, 75], [25, 75]]],
        },
      },
      items: square(4, 50),
    };
    expect(freeAreaBound(holes)).toBe(7500);
    expect(overflowBound(holes).forced).toBe(1);
    // A rectangle obstacle in the circle counts, and an obstacle on the outline does not
    const inside: PackInput = { ...circle, obstacles: [{ id: "o", region: { kind: "rect", x: 40, y: 40, w: 20, h: 20 } }] };
    expect(freeAreaBound(inside)).toBeCloseTo(Math.PI * 2500 - 400, 9);
    const outline: PackInput = { ...circle, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 20, h: 20 } }] };
    expect(freeAreaBound(outline)).toBeCloseTo(Math.PI * 2500, 9);
  });
});

describe("the overflow measures", () => {
  const input: PackInput = { container: box100, items: [{ id: "big", w: 200, h: 10 }, ...square(3, 10)] };
  const output: PackOutput = {
    placements: [{ id: "b0", x: 0, y: 0 }, { id: "b1", x: 10, y: 0 }],
    overflow: ["big", "b2", "b2"],
    size: { w: 100, h: 100 },
    moved: [],
  };

  it("gives the rate, the area, the forced and the excess overflow", () => {
    const m = measure(input, output);
    expect(m["pack.overflow"]).toBe(2);
    expect(m["pack.overflow.rate"]).toBe(0.5);
    // The area of "big" and "b2" is 2000 + 100 of 2300
    expect(m["pack.overflow.area"]).toBeCloseTo(2100 / 2300, 12);
    expect(m["pack.overflow.forced"]).toBe(1);
    expect(m["pack.overflow.forcedArea"]).toBeCloseTo(2000 / 2300, 12);
    expect(m["pack.overflow.excess"]).toBe(1);
  });

  it("gives 0 for each overflow measure of an empty input and of a free container", () => {
    const empty = measure({ container: box100, items: [] }, { placements: [], overflow: [], size: { w: 100, h: 100 }, moved: [] });
    const free = measure({ ...input, container: { fixed: "none" } }, output);
    for (const id of ["pack.overflow.rate", "pack.overflow.area", "pack.overflow.forced", "pack.overflow.forcedArea", "pack.overflow.excess"] as const) {
      expect(empty[id], id).toBe(0);
    }
    expect(free["pack.overflow.forced"]).toBe(0);
    expect(free["pack.overflow.excess"]).toBe(free["pack.overflow"]);
  });
});

describe("the forced overflow of generated inputs", () => {
  const cases: { gen: CorpusGenerator; params: GeneratorParams }[] = [];
  for (const containerShape of ["rect", "convex", "polygon", "circle", "ellipse", "holes"]) {
    for (const obstacles of ["none", "center", "scattered", "touching"]) {
      for (const sizes of ["uniform", "heavyTail"]) cases.push({ gen: rectGrid as CorpusGenerator, params: { containerShape, obstacles, sizes, count: 100 } });
    }
  }
  for (const c of ["empty", "one", "oversize", "exactTiling", "touchObstacles"]) cases.push({ gen: edgeCases as CorpusGenerator, params: { case: c } });

  for (const { gen, params } of cases) {
    it(`keeps the forced overflow at or below the overflow of each strategy: ${gen.name} ${JSON.stringify(params)}`, () => {
      const input = toPackInput(gen.generate(1, params));
      for (const id of ["rows", "shelf", "skyline"]) {
        const m = measure(input, packWith(id, input));
        expect(m["pack.overflow.forced"], id).toBeLessThanOrEqual(m["pack.overflow"]);
        expect(m["pack.overflow.forcedArea"], id).toBeLessThanOrEqual(m["pack.overflow.area"] + 1e-9);
        expect(m["pack.overflow.excess"], id).toBe(m["pack.overflow"] - m["pack.overflow.forced"]);
      }
    });
  }

  it("forces the box of the case oversize, and nothing on an exact tiling", () => {
    const edge = edgeCases as CorpusGenerator;
    expect(overflowBound(toPackInput(edge.generate(1, { case: "oversize" }))).forced).toBeGreaterThanOrEqual(1);
    expect(overflowBound(toPackInput(edge.generate(1, { case: "exactTiling" }))).forced).toBe(0);
  });
});

describe("the minimum effects", () => {
  const expected: Record<MeasureId, number | { rel: number } | undefined> = {
    "pack.area": { rel: 0.01 },
    "pack.fill": 0.005,
    "pack.whitespace": 0.005,
    "pack.aspect": { rel: 0.01 },
    "pack.aspectError": 0.01,
    "pack.order.inversions": 0,
    "pack.order.breaks": 0,
    "pack.raggedness": 0.005,
    "pack.overflow": 0,
    "pack.overflow.rate": 0,
    "pack.overflow.area": 0.005,
    "pack.overflow.forced": 0,
    "pack.overflow.forcedArea": 0.005,
    "pack.overflow.excess": 0,
    "pack.stability.moved": 0.02,
    "pack.stability.mean": 0.005,
    "pack.stability.q95": 0.01,
    "pack.deterministic": 0,
    "pack.search.widths": 0,
    "pack.search.ms": undefined,
  };

  it("has the minimum effect of the table in docs/MEASURES.md, and the tolerance for each guard", () => {
    for (const [id, s] of Object.entries(MEASURE_SPECS)) {
      expect(s.minEffect, id).toEqual(expected[id as MeasureId]);
      if (s.tol !== undefined) expect(s.minEffect, id).toBe(s.tol);
      expect(s.family === "overflow" || !id.startsWith("pack.overflow"), id).toBe(true);
    }
    expect(Object.keys(MEASURE_SPECS).toSorted()).toEqual(Object.keys(expected).toSorted());
  });

  it("gives a tie under the minimum effect and a loss above it in compareMeasure of the contract", () => {
    const fill = MEASURE_SPECS["pack.fill"];
    expect(compareMeasure(0.703, 0.7, fill)).toBe("tie");
    expect(compareMeasure(0.697, 0.7, fill)).toBe("tie");
    expect(compareMeasure(0.69, 0.7, fill)).toBe("worse");
    expect(compareMeasure(0.71, 0.7, fill)).toBe("better");
    const area = MEASURE_SPECS["pack.area"];
    expect(compareMeasure(1005, 1000, area)).toBe("tie");
    expect(compareMeasure(1020, 1000, area)).toBe("worse");
    const overflow = MEASURE_SPECS["pack.overflow"];
    expect(compareMeasure(0, 0, overflow)).toBe("tie");
    expect(compareMeasure(1, 0, overflow)).toBe("worse");
    const moved = MEASURE_SPECS["pack.stability.moved"];
    expect(compareMeasure(0.02, 0, moved)).toBe("tie");
    expect(compareMeasure(0.03, 0, moved)).toBe("worse");
    // The time has no minimum effect: each change above RECORD_EPS counts
    expect(compareMeasure(1.1, 1, MEASURE_SPECS["pack.search.ms"])).toBe("worse");
  });
});
