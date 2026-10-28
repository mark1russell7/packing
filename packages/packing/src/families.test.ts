import { createFamilyRegistry, dimensionAt, dimensionUnit, levelsOf, SHAPE_KIND_IDS } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { corpusFamilies, edgeCasesFamily, hashInput, rectGrid, rectGridFamily, rectGridV2Family, toPackInput, type GeneratedInput } from "@mark1russell7/packing";

// Roadmap item k73: the generators of packing as the corpus families of the shared registry (docs/CORPUS.md of layout-contract).

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
const names = (f: { dimensions: readonly { name: string }[] }): string[] => f.dimensions.map((d) => d.name);
const KNOBS = ["margin", "gap", "shape"];

describe("the corpus families", () => {
  it("have the parameters of their generator, then the knobs", () => {
    expect(names(rectGridFamily)).toEqual(["containerSize", "containerShape", "obstacles", "sizes", "count", ...KNOBS]);
    expect(names(rectGridV2Family)).toEqual(["containerSize", "containerShape", "obstacles", "sizes", "order", "count", ...KNOBS]);
    for (const f of corpusFamilies.filter((x) => x.name !== "rect-grid" && x.name !== "edge-cases")) expect(names(f), f.name).toEqual(["containerSize", "count", ...KNOBS]);
    expect(names(edgeCasesFamily)).toEqual(["case", "count", ...KNOBS]);
  });

  it("are libm-dependent for rect-grid and exact for the others", () => {
    for (const f of corpusFamilies) expect(f.crossEngine, f.name).toBe(f.name === "rect-grid" ? "libm-dependent" : "exact");
    expect(corpusFamilies.every((f) => f.owner === "packing")).toBe(true);
  });

  it("have the defaults of their generator", () => {
    for (const f of corpusFamilies) {
      const g = registry.resolve(f.name, {}, f.version);
      expect(g["margin"]).toBe(0);
      expect(g["gap"]).toBe(0);
      expect(g["shape"]).toBe("rect");
    }
    expect(registry.resolve("dashboard")["count"]).toBe(10);
    expect(registry.resolve("edge-cases")).toMatchObject({ case: "oversize", count: 12 });
  });

  it("give count a log scale from 0 to 10000 with the sweep 1, 10, 100, 1000 and 10000", () => {
    for (const f of corpusFamilies) {
      const count = f.dimensions.find((d) => d.name === "count")!;
      expect([count.min, count.max, count.scale], f.name).toEqual([0, 10_000, "log"]);
      expect(levelsOf(count)).toEqual([1, 10, 100, 1000, 10_000]);
      expect(dimensionAt(count, 0)).toBe(0);
      expect(dimensionAt(count, 1)).toBe(10_000);
      expect(dimensionAt(count, dimensionUnit(count, 100))).toBe(100);
    }
  });

  it("give the shape each kind of the contract, with a sweep of rect only", () => {
    const shape = rectGridFamily.dimensions.find((d) => d.name === "shape")!;
    expect(shape.values).toEqual(SHAPE_KIND_IDS);
    expect(levelsOf(shape)).toEqual(["rect"]);
    expect(() => registry.generate("rect-grid", 1, { shape: "circle" })).toThrow(RangeError);
    expect(() => registry.generate("rect-grid", 1, { shape: "hexagon" })).toThrow(RangeError);
  });

  it("make the count of edge-cases active only for the cases with boxes", () => {
    expect(registry.cellOf("edge-cases", { case: "empty", count: 5 })).toEqual({ kind: "edge-cases@1", case: "empty", margin: 0, gap: 0, shape: "rect" });
    expect(registry.generate("edge-cases", 1, { case: "one", count: 5 })).toEqual(registry.generate("edge-cases", 1, { case: "one" }));
    expect(registry.generate("edge-cases", 1, { case: "oversize", count: 5 }).boxes).toHaveLength(5);
  });

  it("refuse an unknown dimension and a count above 10000", () => {
    expect(() => registry.generate("cards", 1, { nope: 1 })).toThrow(RangeError);
    expect(() => registry.generate("cards", 1, { count: 10_001 })).toThrow(RangeError);
  });
});

describe("the knobs margin and gap", () => {
  it("add no field at the default, so the hash does not change", () => {
    const plain = rectGrid.generate(3, { count: 20 });
    expect(registry.generate("rect-grid", 3, { count: 20, margin: 0, gap: 0, shape: "rect" })).toEqual(plain);
  });

  it("put the margin on each box and the gap on the input, with a new family, id and hash", () => {
    const plain = rectGrid.generate(3, { count: 20 });
    const file = registry.generate("rect-grid", 3, { count: 20, margin: 4, gap: 2.5 });
    expect(file.family).toBe(`${plain.family}.m4.g2.5`);
    expect(file.id).toBe(`corpus-v1/${plain.family}.m4.g2.5/s3`);
    expect(file.boxes.every((b) => b.margin === 4)).toBe(true);
    expect(file.gap).toBe(2.5);
    expect(file.hash).toBe(hashInput(file));
    expect(file.hash).not.toBe(plain.hash);
    expect(file.generator).toEqual(plain.generator);
    expect(toPackInput(file).gap).toBe(2.5);
    expect(registry.generate("rect-grid", 3, { count: 20, gap: 1 }).boxes.some((b) => b.margin !== undefined)).toBe(false);
  });

  it("refuse a value out of 0 to 32", () => {
    expect(() => registry.generate("gallery", 1, { margin: 33 })).toThrow(RangeError);
    expect(() => registry.generate("gallery", 1, { gap: -1 })).toThrow(RangeError);
  });
});
