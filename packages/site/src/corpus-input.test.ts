import { corpusFamilies, gallery, rectGrid, rectGridV2, rectScattered } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import {
  controlsHtml,
  dimensionControls,
  familyKey,
  familyOf,
  generateInput,
  MAX_SITE_COUNT,
  parseDimension,
  readDimensions,
  siteDimension,
  SITE_FAMILIES,
  SLIDER_STEPS,
  sliderPosition,
  sliderValue,
  withDimension,
  writeDimensions,
} from "./corpus-input.ts";
import { inputOf, runPacking, sceneOf } from "./model.ts";

// Roadmap item k73: the pages take their generated inputs and their sliders from the shared family registry.

const dimOf = (key: string, name: string) => familyOf(key).dimensions.find((d) => d.name === name)!;

describe("the registry of the site", () => {
  it("has rect-scattered of the contract, then each corpus family of packing", () => {
    expect(SITE_FAMILIES.map(familyKey)).toEqual(["rect-scattered@1", ...corpusFamilies.map(familyKey)]);
  });

  it("gives the pinned bytes of the generators", () => {
    expect(generateInput("rect-scattered@1", {}, 1).file.hash).toBe("f5f5c51d1560e41c");
    expect(generateInput("rect-grid@1", {}, 1).file).toEqual(rectGrid.generate(1));
    expect(generateInput("rect-grid@2", { order: "soft", count: 30 }, 4).file).toEqual(rectGridV2.generate(4, { order: "soft", count: 30 }));
    expect(generateInput("gallery@1", {}, 2).file).toEqual(gallery.generate(2));
    expect(generateInput("rect-scattered@1", { count: 12 }, 3).file).toEqual(rectScattered.generate(3, { count: 12 }));
  });

  it("stops the count at the largest count of the site", () => {
    expect(generateInput("rect-scattered@1", { count: 50_000 }, 2).input.items).toHaveLength(MAX_SITE_COUNT);
    const count = siteDimension(dimOf("cards@1", "count"));
    expect([count.max, count.levels]).toEqual([MAX_SITE_COUNT, [1, 10, 100, 1000]]);
  });

  it("gives an unknown key the family rect-grid version 2", () => {
    expect(familyKey(familyOf("nothing@9"))).toBe("rect-grid@2");
  });
});

describe("the controls of the dimensions", () => {
  it("give a slider on the scale of each number, and a choice for each list", () => {
    const controls = dimensionControls("rect-grid@2");
    expect(controls.map((c) => [c.name, c.kind])).toEqual([
      ["containerSize", "select"],
      ["containerShape", "select"],
      ["obstacles", "select"],
      ["sizes", "select"],
      ["order", "select"],
      ["count", "range"],
      ["margin", "range"],
      ["gap", "range"],
      ["shape", "select"],
    ]);
    const count = controls.find((c) => c.name === "count");
    expect(count).toMatchObject({ kind: "range", value: 100, active: true });
    expect(count?.kind === "range" && count.ticks.length).toBe(4);
  });

  it("disable the item shapes other than rect, with a note", () => {
    const shape = dimensionControls("cards@1").find((c) => c.name === "shape");
    expect(shape?.kind === "select" && shape.options).toEqual([
      { value: "rect", supported: true },
      { value: "polygon", supported: false },
      { value: "circle", supported: false },
      { value: "free", supported: false },
    ]);
    const html = controlsHtml(dimensionControls("cards@1"), "t");
    expect(html).toContain(`<option value="circle" disabled>circle (not supported yet)</option>`);
    expect(html).toContain("The other kinds are not supported yet.");
    expect(parseDimension(dimOf("cards@1", "shape"), "circle")).toBeUndefined();
  });

  it("turn off the count of edge-cases for a case without boxes", () => {
    expect(dimensionControls("edge-cases@1", { case: "empty" }).find((c) => c.name === "count")?.active).toBe(false);
    expect(dimensionControls("edge-cases@1").find((c) => c.name === "count")?.active).toBe(true);
    expect(controlsHtml(dimensionControls("edge-cases@1", { case: "empty" }), "t")).toContain("This input does not use it.");
  });

  it("move a slider on the log scale of count and on the line of margin", () => {
    const count = dimOf("rect-grid@2", "count");
    expect(sliderValue(count, 0)).toBe(0);
    expect(sliderValue(count, SLIDER_STEPS)).toBe(MAX_SITE_COUNT);
    for (const v of [1, 10, 100, 1000]) expect(sliderValue(count, sliderPosition(count, v))).toBe(v);
    const margin = dimOf("rect-grid@2", "margin");
    expect(sliderValue(margin, SLIDER_STEPS / 2)).toBe(16);
    expect(sliderValue(margin, sliderPosition(margin, 2.5))).toBe(2.5);
  });

  it("read a value from text in the range of the site", () => {
    expect(parseDimension(dimOf("gallery@1", "margin"), "40")).toBe(32);
    expect(parseDimension(dimOf("gallery@1", "count"), "5000")).toBe(MAX_SITE_COUNT);
    expect(parseDimension(dimOf("gallery@1", "count"), "abc")).toBeUndefined();
    expect(parseDimension(dimOf("gallery@1", "containerSize"), "nope")).toBeUndefined();
  });
});

describe("the hash of a generated input", () => {
  it("keeps only the values that differ from the defaults", () => {
    let dims = withDimension("rect-grid@2", {}, "count", 50);
    dims = withDimension("rect-grid@2", dims, "gap", 0);
    dims = withDimension("rect-grid@2", dims, "obstacles", "wall");
    expect(dims).toEqual({ count: 50, obstacles: "wall" });
    const p = new URLSearchParams();
    writeDimensions(p, dims);
    expect(p.toString()).toBe("p.count=50&p.obstacles=wall");
    expect(readDimensions("rect-grid@2", (k) => p.get(k))).toEqual(dims);
    expect(readDimensions("rect-grid@2", (k) => new URLSearchParams("p.count=100&p.nope=1&p.shape=circle").get(k))).toEqual({});
  });
});

describe("the scene of the demo", () => {
  it("packs the items of the page in the container, the obstacles and the gap of the generated input", () => {
    const { input } = generateInput("rect-grid@2", { obstacles: "wall", count: 30, margin: 4, gap: 2 }, 5);
    const { items, scene } = sceneOf(input);
    expect(items).toHaveLength(30);
    // The id of an item of the demo is its key: the place of the box in the generated input.
    expect(inputOf(items, 640, "fixed", undefined, scene)).toEqual({ ...input, items: input.items.map((b, i) => ({ ...b, id: String(i) })) });
    const free = inputOf(items, 640, "free", undefined, scene);
    expect(free.container.fixed).toBe("none");
    expect([free.gap, free.obstacles]).toEqual([2, input.obstacles]);
    const run = runPacking(items, 640, { strategy: "maxrects", mode: "fixed" }, () => 0, undefined, 0, scene);
    expect(run.frame?.obstacles).toHaveLength(input.obstacles?.length ?? 0);
    expect(run.width).toBe(input.container.w);
  });

  it("keeps the input of the demo presets without a scene", () => {
    const items = [{ key: 0, w: 10, h: 20 }];
    expect(inputOf(items, 300, "fixed")).toEqual({ container: { fixed: "width", w: 300 }, items: [{ id: "0", w: 10, h: 20 }] });
    expect(runPacking(items, 300, { strategy: "rows" }, () => 0).frame).toBeUndefined();
  });
});
