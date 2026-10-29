import { describe, expect, it } from "vitest";
import { circleOverlaps, packFree, Rect, strategy as registryStrategy } from "@mark1russell7/packing";
import {
  chosenTry,
  inputOf,
  makeItem,
  makeItems,
  offeredStrategies,
  ORDERS,
  PRESETS,
  random,
  resizeItem,
  runPacking,
  SEARCH_STRATEGIES,
  searchChart,
  STRATEGIES,
  strategyFor,
  type Placed,
} from "./model.ts";

// The items of the rect presets are rectangles. A strategy of one other shape kind (`hole-degree` of k90) refuses them.
const RECT_STRATEGIES = STRATEGIES.filter((id) => registryStrategy(id).supports.itemShape.includes("rect"));

const overlaps = (a: Placed, b: Placed): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("random", () => {
  it("gives the same numbers for the same seed", () => {
    const a = random(42);
    const b = random(42);
    const c = random(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe("makeItems", () => {
  it("is the same for the same preset, count and seed", () => {
    for (const p of PRESETS) {
      expect(makeItems(p.id, 20, 7)).toEqual(makeItems(p.id, 20, 7));
      const items = makeItems(p.id, 20, 7);
      expect(items).toHaveLength(20);
      for (const item of items) expect(item.w > 0 && item.h > 0).toBe(true);
      expect(new Set(items.map((i) => i.key)).size).toBe(20);
    }
  });

  it("gives an item of the preset for a new key", () => {
    expect(makeItem("cards", 1, 30)).toEqual(makeItem("cards", 1, 30));
    expect(makeItem("cards", 1, 30).key).toBe(30);
  });
});

describe("runPacking", () => {
  it("packs each item in the width, with no overlap, for each strategy and sort order", () => {
    const items = makeItems("mixed", 30, 3);
    for (const strategy of RECT_STRATEGIES) {
      for (const order of ORDERS) {
        const run = runPacking(items, 640, { strategy, options: { sortOrder: order } });
        expect(run.placed).toHaveLength(30);
        expect(run.placed.map((p) => p.rank)).toEqual(items.map((_, i) => i + 1));
        expect(run.placed.map((p) => p.key)).toEqual(items.map((i) => i.key));
        for (const p of run.placed) {
          expect(p.packed).toBe(true);
          expect(p.x + p.w).toBeLessThanOrEqual(640);
          expect(p.y + p.h).toBeLessThanOrEqual(run.height);
        }
        for (let i = 0; i < run.placed.length; i++)
          for (let j = i + 1; j < run.placed.length; j++)
            expect(overlaps(run.placed[i]!, run.placed[j]!), `${strategy} ${order}: ${i} and ${j}`).toBe(false);
        expect(run.metrics.count).toBe(30);
        expect(run.metrics.utilization).toBeGreaterThan(0);
        expect(run.metrics.utilization).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps the input order in the rows with the order input", () => {
    const items = makeItems("ranked", 25, 11);
    const run = runPacking(items, 500, { strategy: "rows", options: { sortOrder: "input" } });
    const reading = run.placed.toSorted((a, b) => a.y - b.y || a.x - b.x);
    // The items of a row share its top, so the reading order is the rank order
    expect(reading.map((p) => p.rank)).toEqual(run.placed.map((p) => p.rank));
  });

  it("measures the time with the clock that it gets", () => {
    let t = 0;
    const run = runPacking(makeItems("cards", 5, 1), 400, { strategy: "rows", options: { sortOrder: "height-desc" } }, () => (t += 2));
    expect(run.ms).toBe(2);
  });

  it("does not place an item wider than the container", () => {
    const run = runPacking([{ key: 0, w: 500, h: 50 }, { key: 1, w: 100, h: 50 }], 300, { strategy: "rows" });
    expect(run.placed.map((p) => p.packed)).toEqual([false, true]);
    expect(run.right).toBeLessThanOrEqual(300);
    expect(run.measures?.["pack.overflow"]).toBe(1);
  });

  it("gives a run with the error for an input that the strategy does not support", () => {
    const run = runPacking(makeItems("cards", 6, 1), 400, { strategy: "push", mode: "free" });
    expect(run.unsupported).toBe(true);
    expect(run.error).toMatch(/^Not supported for this input/);
    expect(run.placed.every((p) => !p.packed)).toBe(true);
    expect(run.measures).toBeUndefined();
  });

  it("packs with the options of the controls of a composite strategy", () => {
    const items = makeItems("mixed", 20, 5);
    const k2 = runPacking(items, 640, { strategy: "portfolio", options: { k: "2" } });
    const members = runPacking(items, 640, { strategy: "portfolio", options: { members: ["rows", "maxrects-bl"] } });
    const fit = runPacking(items, 640, { strategy: "aspect-fit", options: { strategy: "rows" } });
    for (const run of [k2, members, fit]) {
      expect(run.error).toBeUndefined();
      expect(run.placed.every((p) => p.packed)).toBe(true);
    }
  });
});

describe("runPacking with a free width", () => {
  const items = makeItems("cards", 24, 7);
  const target = { aspect: 4 / 3, weight: 1 };

  const freeOf = (strategy: string) => {
    const rects = items.map((item) => {
      const r = new Rect<number>();
      r.id = item.key;
      r.size.set(item.w, item.h);
      return r;
    });
    return packFree(rects, new Rect<number>(), { strategy: strategy as "rows", sortOrder: "height-desc", aspect: target.aspect, aspectWeight: target.weight });
  };

  it("gives the size and the measures of packFree", () => {
    const run = runPacking(items, 640, { strategy: "rows", options: { sortOrder: "height-desc" }, mode: "free" }, undefined, target);
    const expected = freeOf("rows");
    expect(run.width).toBe(expected.outer.size.x);
    expect(run.height).toBe(expected.outer.size.y);
    expect(run.free).toBeDefined();
    expect(run.free!.aspect).toBe(expected.aspect);
    expect(run.free!.fill).toBe(expected.fill);
    expect(run.free!.aspectError).toBe(expected.aspectError);
    expect(run.free!.objective).toBe(expected.objective);
    expect(run.free!.tried).toEqual(expected.tried);
    expect(run.free!.target).toEqual(target);
    // The width of the fixed mode has no effect
    expect(runPacking(items, 300, { strategy: "rows", options: { sortOrder: "height-desc" }, mode: "free" }, undefined, target).width).toBe(run.width);
    for (const p of run.placed) {
      expect(p.packed).toBe(true);
      expect(p.x + p.w).toBeLessThanOrEqual(run.width);
      expect(p.y + p.h).toBeLessThanOrEqual(run.height);
    }
  });

  it("chooses the first try with the lowest objective", () => {
    const run = runPacking(items, 640, { strategy: "skyline", options: { sortOrder: "area-desc" }, mode: "free" }, undefined, target);
    const free = run.free!;
    const best = Math.min(...free.tried.map((t) => t.objective));
    expect(free.tried[free.chosen]!.objective).toBe(best);
    expect(free.objective).toBe(best);
    expect(free.tried[free.chosen]!.contentWidth).toBe(run.width);
    expect(chosenTry([])).toBe(-1);
    expect(chosenTry([{ width: 1, contentWidth: 1, contentHeight: 1, objective: 5 }, { width: 2, contentWidth: 2, contentHeight: 1, objective: 5 }])).toBe(0);
  });

  it("keeps the fixed mode without a mode", () => {
    const a = runPacking(items, 640, { strategy: "rows", options: { sortOrder: "height-desc" } });
    const b = runPacking(items, 640, { strategy: "rows", options: { sortOrder: "height-desc" }, mode: "fixed" });
    expect(a.free).toBeUndefined();
    expect(a.width).toBe(640);
    expect(b.placed).toEqual(a.placed);
  });

  it("uses the same target for each compared strategy, and gives the measures of each", () => {
    for (const strategy of ["rows", "skyline"]) {
      const run = runPacking(items, 640, { strategy, options: { sortOrder: "height-desc" }, mode: "free" }, undefined, target);
      const expected = freeOf(strategy);
      expect(run.free!.target).toEqual(target);
      expect(run.width).toBe(expected.outer.size.x);
      expect(run.free!.objective).toBe(expected.objective);
      expect(run.free!.tried.length).toBeGreaterThan(0);
    }
  });

  it("tells that a strategy of circles does not support the rectangles of the demo", () => {
    expect(STRATEGIES.filter((id) => !RECT_STRATEGIES.includes(id))).toEqual(["hole-degree"]);
    const run = runPacking(makeItems("mixed", 10, 3), 640, { strategy: "hole-degree" });
    expect(run.unsupported).toBe(true);
    expect(run.error).toContain("itemShape");
  });

  it("gives the chart of the search for each strategy of packFree, with the width of the packing", () => {
    for (const strategy of STRATEGIES) {
      const run = runPacking(items, 640, { strategy, mode: "free" }, undefined, target);
      if (!SEARCH_STRATEGIES.includes(strategy)) {
        expect(run.free, strategy).toBeUndefined();
        continue;
      }
      expect(run.free!.tried[run.free!.chosen]!.contentWidth, strategy).toBe(run.width);
    }
  });

  it("gives a chart with one point for each try", () => {
    const run = runPacking(items, 640, { strategy: "rows", options: { sortOrder: "height-desc" }, mode: "free" }, undefined, target);
    const free = run.free!;
    const chart = searchChart(free, { width: 560, height: 200 });
    const byWidth = (a: { width: number }, b: { width: number }) => a.width - b.width;
    expect(chart.points.map((p) => ({ width: p.width, objective: p.objective })).toSorted(byWidth)).toEqual(
      free.tried.map((t) => ({ width: t.width, objective: t.objective })).toSorted(byWidth),
    );
    const chosen = chart.points.filter((p) => p.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.width).toBe(free.tried[free.chosen]!.width);
    // The x axis has a log scale: the points go from left to right in the order of the width
    for (let i = 1; i < chart.points.length; i++) expect(chart.points[i]!.x).toBeGreaterThanOrEqual(chart.points[i - 1]!.x);
    for (const p of chart.points) {
      expect(p.x).toBeGreaterThanOrEqual(chart.plot.left - 1e-9);
      expect(p.x).toBeLessThanOrEqual(chart.plot.right + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(chart.plot.top - 1e-9);
      expect(p.y).toBeLessThanOrEqual(chart.plot.bottom + 1e-9);
    }
    // The lowest objective is the lowest point: the largest y
    expect(chosen[0]!.y).toBe(Math.max(...chart.points.map((p) => p.y)));
    expect(chart.xTicks.length).toBeGreaterThanOrEqual(2);
    expect(chart.yTicks.length).toBeGreaterThanOrEqual(2);
  });

  it("gives an empty chart for no try", () => {
    const chart = searchChart({ target, aspect: 0, fill: 0, aspectError: 0, objective: 0, tried: [], chosen: -1 });
    expect(chart.points).toEqual([]);
  });
});

describe("the circle preset", () => {
  const items = makeItems("circles", 24, 7);

  it("makes circle items with the same width and height", () => {
    expect(PRESETS.map((p) => p.id)).toContain("circles");
    for (const item of items) {
      expect(item.circle).toBe(true);
      expect(item.w).toBe(item.h);
    }
    expect(makeItem("circles", 7, 30).circle).toBe(true);
    const input = inputOf(items, 640, "fixed");
    expect(input.items[0]!.shape).toEqual({ kind: "circle", cx: items[0]!.w / 2, cy: items[0]!.w / 2, r: items[0]!.w / 2 });
  });

  it("offers hole degree and bbox on circles, and hole degree only on circles", () => {
    const offered = offeredStrategies(items);
    expect(offered).toContain("hole-degree");
    expect(offered).toContain("bbox");
    expect(offered).not.toContain("rows");
    for (const id of offered) expect(registryStrategy(id).supports.itemShape).toContain("circle");
    const rects = offeredStrategies(makeItems("cards", 10, 1));
    expect(rects).not.toContain("hole-degree");
    expect(rects).toEqual(RECT_STRATEGIES);
  });

  it("gives each layout a strategy for circles", () => {
    const offered = offeredStrategies(items);
    expect(strategyFor("rows", offered, 0, "skyline")).toBe("hole-degree");
    expect(strategyFor("skyline", offered, 1, "hole-degree")).toBe("bbox");
    expect(strategyFor("bbox", offered, 0, "hole-degree")).toBe("bbox");
    const rects = offeredStrategies(makeItems("cards", 10, 1));
    expect(strategyFor("hole-degree", rects, 0, "bbox")).toBe("rows");
    expect(strategyFor("maxrects", rects, 1, "rows")).toBe("maxrects");
  });

  it("packs the circles with hole degree and bbox, with no overlap of two circles", () => {
    const input = inputOf(items, 640, "fixed");
    const settings = [
      { strategy: "hole-degree" },
      { strategy: "bbox", options: { member: "maxrects-bl" } },
      { strategy: "bbox", options: { member: "skyline" } },
    ];
    for (const setting of settings) {
      const run = runPacking(items, 640, setting);
      const label = JSON.stringify(setting);
      expect(run.error, label).toBeUndefined();
      expect(run.placed.every((p) => p.packed && p.circle === true), label).toBe(true);
      for (const p of run.placed) expect(p.x + p.w, label).toBeLessThanOrEqual(640 + 1e-6);
      const placements = run.placed.map((p) => ({ id: String(p.key), x: p.x, y: p.y }));
      expect(circleOverlaps(input, { placements }), label).toBe(0);
    }
  });

  it("keeps a circle round when it changes size", () => {
    const item = { key: 0, w: 40, h: 40, circle: true };
    resizeItem(item, 60, 40);
    expect([item.w, item.h]).toEqual([60, 60]);
    resizeItem(item, 60, 30);
    expect([item.w, item.h]).toEqual([30, 30]);
    resizeItem(item, 1, 1);
    expect([item.w, item.h]).toEqual([4, 4]);
    const box = { key: 1, w: 40, h: 40 };
    resizeItem(box, 60, 30);
    expect([box.w, box.h]).toEqual([60, 30]);
  });
});
