import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { corpus, measure, packWith, toPackInput, type CorpusSpec, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { fillUpperBound, gapToBound } from "./gap-to-bound.ts";

// The measure pack.gapToBound of k116: 1 - fill / fillUpperBound, from 0 to 1.

const specsOf = (name: string): CorpusSpec[] => (JSON.parse(readFileSync(new URL(`./corpora/${name}.json`, import.meta.url), "utf8")) as { specs: CorpusSpec[] }).specs;

const out = (placements: PackOutput["placements"], overflow: readonly string[] = []): PackOutput => ({ placements, overflow, size: { w: 100, h: 100 }, moved: [], trace: [] });

/** This function gives the measure from the fill and the area of `measure`. */
const of = (input: PackInput, output: PackOutput): number | undefined => {
  const m = measure(input, output);
  return gapToBound(input, output, m["pack.fill"], m["pack.area"]);
};

describe("pack.gapToBound", () => {
  const two: PackInput = { container: { fixed: "none" }, items: [{ id: "a", w: 10, h: 10 }, { id: "b", w: 10, h: 10 }] };

  it("is 0 when the fill reaches the bound, and the share of the hull above the bound otherwise", () => {
    expect(of(two, out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }]))).toBe(0);
    // A hole of 10 by 10 between the items: the hull is 300, and the bound is the item area 200.
    expect(of(two, out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 0 }]))).toBeCloseTo(1 / 3, 9);
  });

  it("counts the margins of the placed items in the bound, so a layout with margins can reach 0", () => {
    const input: PackInput = { container: { fixed: "none" }, items: [{ id: "a", w: 10, h: 10, margin: 5 }, { id: "b", w: 10, h: 10, margin: 5 }] };
    const output = out([{ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 0 }]);
    const m = measure(input, output);
    expect(fillUpperBound(input, output, m["pack.fill"] * m["pack.area"])).toBeLessThan(1);
    expect(of(input, output)).toBeLessThan(1 / 3);
  });

  it("reads only the placed items in a fixed container, and gives no value without a placed item", () => {
    const input: PackInput = { container: { w: 15, h: 15, fixed: "size" }, items: [{ id: "a", w: 10, h: 10 }, { id: "b", w: 10, h: 10 }] };
    expect(of(input, out([{ id: "a", x: 0, y: 0 }], ["b"]))).toBe(0);
    expect(of(input, out([], ["a", "b"]))).toBeUndefined();
    expect(fillUpperBound(input, out([{ id: "a", x: 0, y: 0 }], ["b"]), 0)).toBeUndefined();
  });

  it("stays from 0 to 1 for each strategy on the smoke corpus", () => {
    const inputs = corpus("smoke-v1", specsOf("smoke-v1")).inputs;
    let n = 0;
    for (const file of inputs.slice(0, 12)) {
      const input = toPackInput(file);
      for (const id of ["rows", "maxrects-bl"]) {
        let output;
        try {
          output = packWith(id, input, undefined, file.seed);
        } catch {
          continue;
        }
        const v = of(input, output);
        if (v === undefined) continue;
        n++;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});
