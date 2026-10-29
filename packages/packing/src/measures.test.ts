import { describe, expect, it } from "vitest";
import {
  MEASURE_SPECS,
  cards,
  dashboard,
  edgeCases,
  gallery,
  isDeterministic,
  measure,
  measureChange,
  medianRatio,
  packWith,
  packingMetrics,
  pairedRatio,
  quantile,
  Rect,
  rectGrid,
  roundMeasures,
  tailShare,
  toPackInput,
  type CorpusGenerator,
  type GeneratorParams,
  type MeasureId,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";

// The measures of docs/MEASURES.md on tiny layouts, with values computed by hand.

const out = (placements: PackOutput["placements"], more: Partial<PackOutput> = {}): PackOutput => ({
  placements,
  overflow: [],
  size: { w: 100, h: 50 },
  moved: [],
  trace: [],
  ...more,
});

// Three boxes in two rows: a and b fill the first row (100 wide), c is alone in the second row (50 wide)
const items = (ranks: [number, number, number] = [0, 1, 2]): PackInput["items"] => [
  { id: "a", w: 40, h: 20, rank: ranks[0] },
  { id: "b", w: 60, h: 20, rank: ranks[1] },
  { id: "c", w: 50, h: 30, rank: ranks[2] },
];
const twoRows: PackInput = { container: { w: 100, fixed: "width" }, items: items() };
const twoRowsOut = out([
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 40, y: 0 },
  { id: "c", x: 0, y: 20 },
]);

describe("measure", () => {
  it("gives each measure of two rows by hand", () => {
    const m = measure(twoRows, twoRowsOut);
    // The hull is 100 by 50. The boxes cover 800 + 1200 + 1500 = 3500.
    expect(m["pack.area"]).toBe(5000);
    expect(m["pack.fill"]).toBeCloseTo(0.7, 12);
    expect(m["pack.whitespace"]).toBeCloseTo(0.3, 12);
    expect(m["pack.aspect"]).toBe(2);
    expect(m["pack.aspectError"]).toBeCloseTo(Math.LN2, 12);
    // The reading order is a, b, c: the same as the rank order
    expect(m["pack.order.inversions"]).toBe(0);
    expect(m["pack.order.breaks"]).toBe(0);
    // The heights 20, 20, 30 give a row tolerance of 10. The rows end at 100 and at 50.
    expect(m["pack.raggedness"]).toBe(0.5);
    expect(m["pack.overflow"]).toBe(0);
    expect(m["pack.search.widths"]).toBe(0);
    expect(m["pack.search.ms"]).toBe(0);
  });

  // Roadmap item k91 with contract 0.2.16: the area of each shape with boxArea, and the bounding box for a free shape
  it("gives the shape fill: the exact area of a circle and a polygon, and the box of a free shape", () => {
    const m = measure(twoRows, twoRowsOut);
    expect(m["pack.shapeFill"]).toBe(m["pack.fill"]);
    const shaped: PackInput = {
      container: { w: 100, fixed: "width" },
      items: [
        { id: "a", w: 40, h: 20, shape: { kind: "polygon", points: [[0, 0], [40, 0], [0, 20]] } },
        { id: "b", w: 60, h: 20, shape: { kind: "rect", x: 0, y: 0, w: 30, h: 20 } },
        { id: "c", w: 50, h: 30, shape: { kind: "ellipse", cx: 25, cy: 15, rx: 25, ry: 15 } },
        { id: "d", w: 20, h: 20, shape: { kind: "circle", cx: 10, cy: 10, r: 10 } },
      ],
    };
    const placed = out([...twoRowsOut.placements, { id: "d", x: 60, y: 20 }]);
    const s = measure(shaped, placed);
    // The boxes are the bounding boxes of the shapes (k113): b is 30 by 20 at 40, 0. Thus the hull is 80 by 50.
    // The triangle is 400, the inner rect 600, the ellipse counts as its box 1500, the circle is 100 pi.
    expect(s["pack.area"]).toBe(4000);
    expect(s["pack.shapeFill"]).toBeCloseTo((400 + 600 + 1500 + 100 * Math.PI) / 4000, 12);
    // Contract 0.2.17: the ellipse is free, so the value is an upper bound. The true area of the ellipse is 375 pi.
    expect(MEASURE_SPECS["pack.shapeFill"].bound).toEqual({ shapes: ["free"], side: "upper" });
    expect(s["pack.shapeFill"]).toBeGreaterThan((400 + 600 + 375 * Math.PI + 100 * Math.PI) / 4000);
    expect(s["pack.fill"]).toBeCloseTo((800 + 600 + 1500 + 400) / 4000, 12);
    // An item that is not placed does not count, and an empty layout gives 0. Without d, the hull is 70 by 50.
    expect(measure(shaped, out(placed.placements.slice(0, 3), { overflow: ["d"] }))["pack.shapeFill"]).toBeCloseTo((400 + 600 + 1500) / 3500, 12);
    expect(measure(shaped, out([]))["pack.shapeFill"]).toBe(0);
  });

  // Roadmap item k113: the box of a shape item is the bounding box of its shape at its place, also after a turn
  it("reads the bounding box of a shape at its place, not the item box", () => {
    const padded: PackInput = {
      container: { w: 100, fixed: "width" },
      items: [
        { id: "a", w: 12, h: 12, shape: { kind: "rect", x: 1, y: 1, w: 10, h: 10 } },
        { id: "b", w: 12, h: 12, shape: { kind: "rect", x: 1, y: 1, w: 10, h: 10 } },
      ],
    };
    // The two item boxes overlap by 2 in their padding, but the two shapes touch. Thus the fill is 1, not above 1.
    const touch = measure(padded, out([{ id: "a", x: -1, y: -1 }, { id: "b", x: 9, y: -1 }]));
    expect(touch["pack.area"]).toBe(200);
    expect(touch["pack.fill"]).toBe(1);
    expect(touch["pack.whitespace"]).toBe(0);
    expect(touch["pack.shapeFill"]).toBe(1);
    // A turn of 90 degrees turns the shape in the item box of height 20: the rect at 5, 2 of size 10 by 4 goes to 14, 5 of size 4 by 10
    const turned: PackInput = { container: { w: 100, fixed: "width" }, items: [{ id: "t", w: 30, h: 20, shape: { kind: "rect", x: 5, y: 2, w: 10, h: 4 } }] };
    const t = measure(turned, out([{ id: "t", x: 0, y: 0, turn: 90 }]));
    expect(t["pack.area"]).toBe(40);
    expect(t["pack.aspect"]).toBe(2.5);
    expect(t["pack.fill"]).toBe(1);
  });

  it("measures the aspect error against the target aspect of the container", () => {
    const input: PackInput = { ...twoRows, container: { w: 100, fixed: "width", aspect: 2 } };
    expect(measure(input, twoRowsOut)["pack.aspectError"]).toBe(0);
    const wide: PackInput = { ...twoRows, container: { w: 100, fixed: "width", aspect: 4 } };
    expect(measure(wide, twoRowsOut)["pack.aspectError"]).toBeCloseTo(Math.LN2, 12);
  });

  it("counts the inversions and the breaks of a rank order that the layout does not follow", () => {
    // The ranks are c, a, b. The reading order is a, b, c. The pairs (c, a) and (c, b) are inversions.
    const m = measure({ ...twoRows, items: items([1, 2, 0]) }, twoRowsOut);
    expect(m["pack.order.inversions"]).toBeCloseTo(2 / 3, 12);
    // The step c to a goes back. The step a to b goes forward.
    expect(m["pack.order.breaks"]).toBe(1);
  });

  it("reads a 2 by 2 grid by rows", () => {
    // The ranks go down the columns: a (0, 0), b (0, 10), c (10, 0), d (10, 10). The reading order is a, c, b, d.
    const input: PackInput = {
      container: { w: 20, fixed: "width" },
      items: ["a", "b", "c", "d"].map((id) => ({ id, w: 10, h: 10 })),
    };
    const m = measure(
      input,
      out([
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 10 },
        { id: "c", x: 10, y: 0 },
        { id: "d", x: 10, y: 10 },
      ]),
    );
    expect(m["pack.order.inversions"]).toBeCloseTo(1 / 6, 12);
    expect(m["pack.order.breaks"]).toBe(1);
    expect(m["pack.fill"]).toBe(1);
    expect(m["pack.raggedness"]).toBe(0);
    expect(m["pack.aspect"]).toBe(1);
  });

  it("does not count the pairs with equal ranks", () => {
    const m = measure({ ...twoRows, items: items([0, 0, 0]) }, twoRowsOut);
    expect(m["pack.order.inversions"]).toBe(0);
    expect(m["pack.order.breaks"]).toBe(0);
  });

  it("uses the index in the list as the rank of an item without a rank", () => {
    const input: PackInput = {
      ...twoRows,
      items: [
        { id: "c", w: 50, h: 30 },
        { id: "a", w: 40, h: 20 },
        { id: "b", w: 60, h: 20 },
      ],
    };
    expect(measure(input, twoRowsOut)["pack.order.inversions"]).toBeCloseTo(2 / 3, 12);
  });

  it("uses the size after the turn, and counts each overflow id once", () => {
    const input: PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      items: [
        { id: "t", w: 10, h: 30, turnable: true },
        { id: "u", w: 500, h: 10 },
      ],
    };
    const m = measure(input, out([{ id: "t", x: 0, y: 0, turn: 90 }], { overflow: ["u", "u"] }));
    expect(m["pack.area"]).toBe(300);
    expect(m["pack.aspect"]).toBe(3);
    expect(m["pack.fill"]).toBe(1);
    expect(m["pack.overflow"]).toBe(1);
  });

  it("sums the search measures of the trace", () => {
    const trace = [
      { id: "log-sweep", ms: 3, measures: { "pack.search.widths": 7, "pack.search.ms": 3 } },
      { id: "rows", ms: 0.1, measures: { "pack.overflow": 0 } },
    ];
    const m = measure(twoRows, out(twoRowsOut.placements, { trace }));
    expect(m["pack.search.widths"]).toBe(7);
    expect(m["pack.search.ms"]).toBe(3);
  });

  it("gives the edge values of an empty layout", () => {
    const empty = { "pack.area": 0, "pack.fill": 0, "pack.whitespace": 1, "pack.aspect": 1, "pack.aspectError": 0 };
    const none = measure({ container: { w: 100, h: 100, fixed: "size" }, items: [] }, out([]));
    expect(none).toMatchObject({ ...empty, "pack.order.inversions": 0, "pack.order.breaks": 0, "pack.raggedness": 0, "pack.overflow": 0 });
    // A box with no area is not a box of the hull
    const flat = measure({ container: { w: 100, h: 100, fixed: "size" }, items: [{ id: "z", w: 0, h: 10 }] }, out([{ id: "z", x: 5, y: 5 }]));
    expect(flat).toMatchObject(empty);
  });

  it("gives the edge values of one box", () => {
    const m = measure({ container: { w: 100, h: 100, fixed: "size" }, items: [{ id: "a", w: 40, h: 20 }] }, out([{ id: "a", x: 5, y: 5 }]));
    expect(m).toMatchObject({ "pack.area": 800, "pack.fill": 1, "pack.whitespace": 0, "pack.aspect": 2, "pack.order.inversions": 0, "pack.order.breaks": 0, "pack.raggedness": 0 });
    expect(m["pack.aspectError"]).toBeCloseTo(Math.LN2, 12);
  });

  it("ignores a placement of an id that the input does not have, and a second placement of an id", () => {
    const m = measure(twoRows, out([...twoRowsOut.placements, { id: "zz", x: 500, y: 500 }, { id: "a", x: 900, y: 900 }]));
    expect(m["pack.area"]).toBe(5000);
  });
});

describe("measure and packingMetrics", () => {
  const rect = (x: number, y: number, w: number, h: number): Rect => {
    const r = new Rect();
    r.position.set(x, y);
    r.size.set(w, h);
    return r;
  };
  const rects = [rect(0, 0, 40, 20), rect(40, 0, 60, 20), rect(0, 20, 50, 30)];

  it("agree on the hull, the fill and the raggedness", () => {
    for (const rowTolerance of [10, 40]) {
      const m = measure(twoRows, twoRowsOut, { rowTolerance });
      const p = packingMetrics(rects, { rowTolerance });
      expect(m["pack.area"]).toBe(p.hull.width * p.hull.height);
      expect(m["pack.fill"]).toBe(p.utilization);
      expect(m["pack.aspect"]).toBe(p.hullAspect);
      expect(m["pack.raggedness"] * p.hull.width).toBe(p.raggedness);
    }
    expect(packingMetrics(rects, { rowTolerance: 10 }).raggedness).toBe(50);
    expect(packingMetrics(rects, { rowTolerance: 40 }).raggedness).toBe(0);
  });
});

describe("measureChange", () => {
  const base: PackInput = { container: { w: 100, fixed: "width" }, items: items() };
  // The change removes b and adds d
  const change: PackInput = { container: { w: 100, fixed: "width" }, items: [items()[0]!, items()[2]!, { id: "d", w: 30, h: 10 }] };

  it("measures the items that stay: one moves by 50 of a width of 100", () => {
    const after = out(
      [
        { id: "a", x: 0, y: 0 },
        { id: "c", x: 30, y: 60 },
        { id: "d", x: 50, y: 0 },
      ],
      { size: { w: 80, h: 90 } },
    );
    const m = measureChange(base, twoRowsOut, change, after);
    expect(m["pack.stability.moved"]).toBe(0.5);
    expect(m["pack.stability.mean"]).toBe(0.25);
    // The distances 0 and 0.5: the position 0.95 lies at 0.95 of the way from 0 to 0.5
    expect(m["pack.stability.q95"]).toBeCloseTo(0.475, 12);
  });

  it("gives 0 for the same layout, and counts a turn as a move", () => {
    expect(measureChange(base, twoRowsOut, base, twoRowsOut)).toEqual({ "pack.stability.moved": 0, "pack.stability.mean": 0, "pack.stability.q95": 0, "pack.stability.procrustes": 0 });
    const turned = out([{ id: "a", x: 0, y: 0, turn: 90 }, ...twoRowsOut.placements.slice(1)]);
    expect(measureChange(base, twoRowsOut, base, turned)["pack.stability.moved"]).toBeCloseTo(1 / 3, 12);
  });

  it("does not count a move within RECORD_EPS as a move, but keeps its distance", () => {
    const nudged = out([{ id: "a", x: 0.0005, y: 0 }, ...twoRowsOut.placements.slice(1)]);
    const m = measureChange(base, twoRowsOut, base, nudged);
    expect(m["pack.stability.moved"]).toBe(0);
    expect(m["pack.stability.mean"]).toBeCloseTo(0.0005 / 100 / 3, 15);
  });

  it("gives 0 when no item stays, and uses the input unit for a width of 0", () => {
    const other: PackInput = { container: { w: 100, fixed: "width" }, items: [{ id: "x", w: 10, h: 10 }] };
    expect(measureChange(base, twoRowsOut, other, out([{ id: "x", x: 0, y: 0 }]))).toEqual({ "pack.stability.moved": 0, "pack.stability.mean": 0, "pack.stability.q95": 0, "pack.stability.procrustes": 0 });
    const zero = out([{ id: "a", x: 0, y: 0 }], { size: { w: 0, h: 0 } });
    const m = measureChange(base, zero, base, out([{ id: "a", x: 3, y: 4 }], { size: { w: 0, h: 0 } }));
    // One shared box: the alignment removes its move, so procrustesOf gives 0
    expect(m).toEqual({ "pack.stability.moved": 1, "pack.stability.mean": 5, "pack.stability.q95": 5, "pack.stability.procrustes": 0 });
  });
});

describe("isDeterministic", () => {
  it("is true for the same placements in another order, with other times in the trace", () => {
    const first = out(twoRowsOut.placements, { trace: [{ id: "rows", ms: 1, measures: {} }] });
    const second = out(twoRowsOut.placements.toReversed(), { trace: [{ id: "rows", ms: 9, measures: {} }] });
    expect(isDeterministic(first, second)).toBe(true);
  });

  it("is false when a position, the overflow, the size or a moved obstacle differs", () => {
    const moved = [{ id: "o", x: 1, y: 2 }];
    const first = out(twoRowsOut.placements, { overflow: ["u"], moved });
    expect(isDeterministic(first, out([{ id: "a", x: 0, y: 1 }, ...twoRowsOut.placements.slice(1)], { overflow: ["u"], moved }))).toBe(false);
    expect(isDeterministic(first, out(twoRowsOut.placements, { overflow: [], moved }))).toBe(false);
    expect(isDeterministic(first, out(twoRowsOut.placements, { overflow: ["u"], moved, size: { w: 100, h: 51 } }))).toBe(false);
    expect(isDeterministic(first, out(twoRowsOut.placements, { overflow: ["u"], moved: [{ id: "o", x: 1, y: 3 }] }))).toBe(false);
    expect(isDeterministic(first, out(twoRowsOut.placements.slice(1), { overflow: ["u"], moved }))).toBe(false);
  });
});

describe("roundMeasures", () => {
  it("rounds to 3 decimals with a half up, writes -0 as 0 and keeps the other values", () => {
    const rounded = roundMeasures({ "pack.fill": 0.12345, "pack.aspect": 1.0625, "pack.raggedness": -0.0005, ok: true });
    expect(rounded).toEqual({ "pack.fill": 0.123, "pack.aspect": 1.063, "pack.raggedness": 0, ok: true });
    expect(Object.is(rounded["pack.raggedness"], 0)).toBe(true);
  });
});

describe("the ratio helpers", () => {
  it("orient a paired ratio by the direction, with the rules for 0", () => {
    expect(pairedRatio(1.02, 1, "lower")).toBeCloseTo(1.02, 12);
    expect(pairedRatio(0.5, 0.6, "higher")).toBeCloseTo(1.2, 12);
    expect(pairedRatio(0, 0, "lower")).toBe(1);
    expect(pairedRatio(0, 0, "higher")).toBe(1);
    expect(pairedRatio(1, 0, "lower")).toBe(Infinity);
    expect(pairedRatio(0, 0.5, "higher")).toBe(Infinity);
    expect(pairedRatio(0.5, 0, "higher")).toBe(0);
    expect(() => pairedRatio(-1, 1, "lower")).toThrow(RangeError);
    expect(() => pairedRatio(Number.NaN, 1, "lower")).toThrow(RangeError);
  });

  it("give the quantile by linear interpolation, and handle Infinity", () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 12);
    expect(quantile([7], 0.95)).toBe(7);
    expect(medianRatio([1, Infinity, 3])).toBe(3);
    expect(quantile([1, Infinity], 1)).toBe(Infinity);
    expect(quantile([Infinity, Infinity], 0.5)).toBe(Infinity);
    expect(() => quantile([], 0.5)).toThrow(RangeError);
    expect(() => quantile([1], 1.5)).toThrow(RangeError);
  });

  it("give the median of the ratios, which is not the ratio of the medians", () => {
    const current = [10, 100, 1000];
    const candidate = [12, 90, 1100];
    const ratios = candidate.map((c, i) => pairedRatio(c, current[i]!, "lower"));
    // The candidate is worse on 2 of 3 inputs, and the median ratio tells it
    expect(medianRatio(ratios)).toBeCloseTo(1.1, 12);
    // The ratio of the medians compares 2 different inputs, and tells the opposite
    expect(quantile(candidate, 0.5) / quantile(current, 0.5)).toBeCloseTo(0.9, 12);
  });

  it("give the share of the ratios above a limit", () => {
    expect(tailShare([1, 1.05, 1.2, Infinity], 1.1)).toBe(0.5);
    expect(() => tailShare([], 1.1)).toThrow(RangeError);
  });
});

describe("MEASURE_SPECS", () => {
  it("has one spec for each id, with its own id", () => {
    for (const [id, s] of Object.entries(MEASURE_SPECS)) {
      expect(s.id).toBe(id);
      expect(s.min).toBeLessThan(s.max);
    }
    expect(Object.keys(MEASURE_SPECS)).toHaveLength(34);
  });

  it("has the floor and the tolerance of each guard of the floor rule, and no floor for the other measures", () => {
    const guards: Partial<Record<MeasureId, { floor: number; tol: number }>> = {
      "pack.order.inversions": { floor: 0, tol: 0 },
      "pack.overflow": { floor: 0, tol: 0 },
      "pack.aspectError": { floor: 0, tol: 0.01 },
      "pack.stability.mean": { floor: 0, tol: 0.005 },
      "pack.stability.q95": { floor: 0, tol: 0.01 },
      "pack.stability.moved": { floor: 0, tol: 0.02 },
      // The stability specs of the contract (k123)
      "pack.stability.procrustes": { floor: 0, tol: 0.005 },
      "pack.stability.seed": { floor: 0, tol: 0.005 },
    };
    for (const [id, s] of Object.entries(MEASURE_SPECS)) {
      const guard = guards[id as MeasureId];
      expect({ floor: s.floor, tol: s.tol }, id).toEqual(guard ?? { floor: undefined, tol: undefined });
      if (s.floor !== undefined) {
        expect(s.tol, id).toBeTypeOf("number");
        expect(s.floor, id).toBeGreaterThanOrEqual(s.min);
        expect(s.floor, id).toBeLessThanOrEqual(s.max);
      }
      expect("floor" in s, id).toBe(guard !== undefined);
      expect("tol" in s, id).toBe(guard !== undefined);
    }
    expect(Object.values(MEASURE_SPECS).filter((s) => s.floor !== undefined)).toHaveLength(8);
  });

  it("gives the deprecated alias forcedAreaMin the spec of forcedArea, except the id", () => {
    const { id: a, ...alias } = MEASURE_SPECS["pack.overflow.forcedAreaMin"];
    const { id: b, ...spec } = MEASURE_SPECS["pack.overflow.forcedArea"];
    expect([a, b]).toEqual(["pack.overflow.forcedAreaMin", "pack.overflow.forcedArea"]);
    expect(alias).toEqual(spec);
  });
});

describe("the alias pack.overflow.forcedAreaMin", () => {
  const shapes = ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const;
  const sizes = ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"] as const;
  for (const containerShape of shapes) {
    it(`is equal to pack.overflow.forcedArea on each input of a ${containerShape} container, fixed and free, and excessArea uses it`, () => {
      let overflowing = 0;
      for (const containerSize of sizes) {
        for (const [seed, count] of [[1, 100], [2, 30]] as const) {
          const input = toPackInput(rectGrid.generate(seed, { containerShape, containerSize, obstacles: seed === 1 ? "scattered" : "center", sizes: "heavyTail", count }));
          for (const id of ["rows", "shelf"]) {
            const m = measure(input, packWith(id, input, undefined, seed));
            const label = `${id} ${containerSize} s${seed}`;
            expect(m["pack.overflow.forcedAreaMin"], label).toBe(m["pack.overflow.forcedArea"]);
            const excess = m["pack.overflow.area"] - m["pack.overflow.forcedArea"];
            expect(m["pack.overflow.excessArea"], label).toBeCloseTo(Math.max(0, excess), 12);
            if (m["pack.overflow.area"] > 0) overflowing++;
          }
        }
      }
      // A fixed container of 100 boxes with a heavy tail leaves some boxes out, so the test sees an overflow area
      expect(overflowing).toBeGreaterThan(0);
    });
  }
});

describe("the measures of generated inputs", () => {
  const cases: { gen: CorpusGenerator; params: GeneratorParams }[] = [
    { gen: cards as CorpusGenerator, params: { count: 30 } },
    { gen: gallery as CorpusGenerator, params: { count: 20 } },
    { gen: dashboard as CorpusGenerator, params: {} },
    { gen: rectGrid as CorpusGenerator, params: { count: 40 } },
    { gen: rectGrid as CorpusGenerator, params: { containerSize: "freeAspect", count: 30 } },
    { gen: edgeCases as CorpusGenerator, params: { case: "empty" } },
    { gen: edgeCases as CorpusGenerator, params: { case: "one" } },
    { gen: edgeCases as CorpusGenerator, params: { case: "oversize" } },
  ];

  for (const { gen, params } of cases) {
    for (const id of ["rows", "skyline"]) {
      it(`keeps each measure in its range: ${gen.name} ${JSON.stringify(params)} with ${id}`, () => {
        const input = toPackInput(gen.generate(1, params));
        const output = packWith(id, input);
        const m = measure(input, output);
        for (const [key, value] of Object.entries(m)) {
          const s = MEASURE_SPECS[key as MeasureId];
          expect(Number.isFinite(value), key).toBe(true);
          expect(value, key).toBeGreaterThanOrEqual(s.min - 1e-9);
          expect(value, key).toBeLessThanOrEqual(s.max + 1e-9);
        }
        expect(m["pack.whitespace"]).toBeCloseTo(1 - m["pack.fill"], 12);
        expect(m["pack.order.breaks"]).toBeLessThanOrEqual(Math.max(0, output.placements.length - 1));
        expect(m["pack.overflow"]).toBeLessThanOrEqual(input.items.length);
        if (input.container.fixed === "none" && input.items.length > 0) expect(m["pack.search.widths"]).toBeGreaterThan(0);
        expect(isDeterministic(output, packWith(id, input))).toBe(true);

        // A change pair: the same input without its first item
        const change: PackInput = { ...input, items: input.items.slice(1) };
        const c = measureChange(input, output, change, packWith(id, change));
        expect(c["pack.stability.moved"]).toBeGreaterThanOrEqual(0);
        expect(c["pack.stability.moved"]).toBeLessThanOrEqual(1);
        expect(c["pack.stability.q95"]).toBeGreaterThanOrEqual(0);
        expect(c["pack.stability.mean"]).toBeGreaterThanOrEqual(0);
      });
    }
  }
});
