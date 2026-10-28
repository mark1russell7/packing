import { createFamilyRegistry, dimensionAt, dimensionSupports, dimensionUnit, levelsOf, SHAPE_KIND_IDS } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  berkeyWangFamily,
  blTrapFamily,
  corpusFamilies,
  halfWideFamily,
  ladderFamily,
  skylineGapFamily,
  tallRowFamily,
  martelloVigoFamily,
  edgeCasesFamily,
  hashInput,
  perfectCut,
  perfectCutFamily,
  rectGrid,
  rectGridFamily,
  rectGridV2Family,
  toPackInput,
  type GeneratedInput,
} from "@mark1russell7/packing";

// Roadmap item k73: the generators of packing as the corpus families of the shared registry (docs/CORPUS.md of layout-contract).

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
const names = (f: { dimensions: readonly { name: string }[] }): string[] => f.dimensions.map((d) => d.name);
const KNOBS = ["margin", "gap", "shape"];
// The families of roadmap item k107 have their own dimensions and counts. The file worst.test.ts tests them.
const WORST = ["tall-row", "skyline-gap", "bl-trap", "half-wide", "ladder"];

describe("the corpus families", () => {
  it("have the parameters of their generator, then the knobs", () => {
    expect(names(rectGridFamily)).toEqual(["containerSize", "containerShape", "obstacles", "sizes", "count", ...KNOBS]);
    expect(names(rectGridV2Family)).toEqual(["containerSize", "containerShape", "obstacles", "sizes", "order", "count", ...KNOBS]);
    for (const f of corpusFamilies.filter((x) => !["rect-grid", "edge-cases", "perfect-cut", "berkey-wang", "martello-vigo", ...WORST].includes(x.name))) expect(names(f), f.name).toEqual(["containerSize", "count", ...KNOBS]);
    expect(names(edgeCasesFamily)).toEqual(["case", "count", ...KNOBS]);
    expect(names(perfectCutFamily)).toEqual(["cut", "containerSize", "count", ...KNOBS]);
    for (const f of [berkeyWangFamily, martelloVigoFamily]) expect(names(f)).toEqual(["class", "containerSize", "count", ...KNOBS]);
    for (const f of [tallRowFamily, skylineGapFamily]) expect(names(f)).toEqual(["ratio", "containerSize", "count", ...KNOBS]);
    expect(names(blTrapFamily)).toEqual(["stages", "containerSize", "count", ...KNOBS]);
    expect(names(halfWideFamily)).toEqual(["excess", "containerSize", "count", ...KNOBS]);
    expect(names(ladderFamily)).toEqual(["axis", "rung", "count", ...KNOBS]);
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

  it("give count a log scale to 10000 with the sweep 1, 10, 100, 1000 and 10000", () => {
    for (const f of corpusFamilies.filter((x) => x !== berkeyWangFamily && x !== martelloVigoFamily && !WORST.includes(x.name))) {
      const count = f.dimensions.find((d) => d.name === "count")!;
      // The generators of known-best inputs need a box or more.
      const min = f.name === "perfect-cut" || f.name === "consecutive-squares" ? 1 : 0;
      expect([count.min, count.max, count.scale], f.name).toEqual([min, 10_000, "log"]);
      expect(levelsOf(count)).toEqual([1, 10, 100, 1000, 10_000]);
      expect(dimensionAt(count, 0)).toBe(min);
      expect(dimensionAt(count, 1)).toBe(10_000);
      expect(dimensionAt(count, dimensionUnit(count, 100))).toBe(100);
    }
  });

  it("give the shape each kind of the contract, with a sweep of rect only", () => {
    const shape = rectGridFamily.dimensions.find((d) => d.name === "shape")!;
    expect(shape.values).toEqual(SHAPE_KIND_IDS);
    expect(levelsOf(shape)).toEqual(["rect"]);
    expect(shape.supported).toEqual(["rect"]);
    expect(SHAPE_KIND_IDS.filter((k) => dimensionSupports(shape, k))).toEqual(["rect"]);
    expect(() => registry.generate("rect-grid", 1, { shape: "circle" })).toThrow(/not supported by/);
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

  it("remove the known best value, because a margin or a gap changes it", () => {
    expect(registry.generate("perfect-cut", 2, {}).known).toEqual(perfectCut.generate(2).known);
    expect(registry.generate("perfect-cut", 2, {}).known).toBeDefined();
    expect(registry.generate("perfect-cut", 2, {}).invalidated).toBeUndefined();
    for (const [name, dims] of [["perfect-cut", { gap: 1 }], ["perfect-cut", { margin: 1 }], ["consecutive-squares", { margin: 2, gap: 1 }]] as const) {
      const file = registry.generate(name, 2, dims);
      expect(file.known, name).toBeUndefined();
      expect(file.invalidated, name).toEqual(["known"]);
      expect(file.hash, name).toBe(hashInput(file));
    }
  });

  it("declare invalidates only on the families with a known best value", () => {
    for (const f of corpusFamilies) {
      const knobs = f.dimensions.filter((d) => d.name === "margin" || d.name === "gap");
      const want = ["perfect-cut", "consecutive-squares"].includes(f.name) ? ["known"] : undefined;
      for (const d of knobs) expect(d.invalidates, `${f.name} ${d.name}`).toEqual(want);
    }
    expect(registry.generate("gallery", 1, { margin: 1 }).invalidated).toBeUndefined();
  });

  it("refuse a value out of 0 to 32", () => {
    expect(() => registry.generate("gallery", 1, { margin: 33 })).toThrow(RangeError);
    expect(() => registry.generate("gallery", 1, { gap: -1 })).toThrow(RangeError);
  });
});
