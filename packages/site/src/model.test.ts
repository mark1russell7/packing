import { describe, expect, it } from "vitest";
import { makeItem, makeItems, ORDERS, PRESETS, random, runPacking, STRATEGIES, type Placed } from "./model.ts";

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
    for (const strategy of STRATEGIES) {
      for (const order of ORDERS) {
        const run = runPacking(items, 640, { strategy, order });
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
    const run = runPacking(items, 500, { strategy: "rows", order: "input" });
    const reading = run.placed.toSorted((a, b) => a.y - b.y || a.x - b.x);
    // The items of a row share its top, so the reading order is the rank order
    expect(reading.map((p) => p.rank)).toEqual(run.placed.map((p) => p.rank));
  });

  it("measures the time with the clock that it gets", () => {
    let t = 0;
    const run = runPacking(makeItems("cards", 5, 1), 400, { strategy: "rows", order: "height-desc" }, () => (t += 2));
    expect(run.ms).toBe(2);
  });

  it("lets an item wider than the container go past the right edge", () => {
    const run = runPacking([{ key: 0, w: 500, h: 50 }, { key: 1, w: 100, h: 50 }], 300, { strategy: "rows", order: "height-desc" });
    expect(run.right).toBe(500);
  });
});
