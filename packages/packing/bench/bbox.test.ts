import { applyPack, packHard, placedRect, toPackInput, type LayoutInput, type PackOutput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { bboxStrategy, outputHash, packConfig, packSpace, packWith, rectGrid, UnsupportedShape } from "@mark1russell7/packing";
import { BBOX_ENTRIES, entry } from "./entries.ts";
import { shapeArea, shapeInput, type ShapeFamily } from "./shape-inputs.ts";

// The strategy bbox of k91 on the made-up shape inputs of `shape-inputs.ts`. The test reads no time.

const named = packSpace.named!;
const FAMILIES: readonly ShapeFamily[] = ["circle", "polygon", "mixed"];
const SEEDS = [1, 2, 3];

/** This function packs an input with a bench entry. */
function packEntry(id: string, input: LayoutInput, seed = 0): PackOutput {
  const e = entry(id);
  return packWith(e.strategy, toPackInput(input), e.options, seed);
}

/** The fill of the bounding boxes and the share of the box area that the shapes cover, on the output. */
function fills(input: LayoutInput, out: PackOutput): { boxFill: number; shapeCover: number } {
  const placed = applyPack(input, out).boxes.filter((b) => b.x !== undefined);
  const boxArea = placed.reduce((sum, b) => sum + placedRect(b)!.w * placedRect(b)!.h, 0);
  const shape = placed.reduce((sum, b) => sum + shapeArea(b), 0);
  return { boxFill: boxArea / (out.size.w * out.size.h), shapeCover: shape / boxArea };
}

describe("the strategy bbox on circles and convex polygons", () => {
  it("places each shape with no overlap and in the container, by packHard of the contract", () => {
    for (const family of FAMILIES)
      for (const seed of SEEDS)
        for (const fixedSize of [false, true]) {
          const input = shapeInput(family, seed, { fixedSize });
          for (const { id } of BBOX_ENTRIES) {
            const out = packEntry(id, input, seed);
            const hard = packHard(input, out);
            expect(hard, `${id} ${input.id} ${fixedSize}`).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
            if (!fixedSize) expect(out.overflow, id).toEqual([]);
          }
        }
  });

  it("puts each shape at the place of its box: the bounding box of the shape is the box of the member", () => {
    const input = shapeInput("polygon", 4);
    const out = packEntry("bbox-maxrects-bl", input);
    const boxes = toPackInput(input).items.map((i) => ({ id: i.id, w: placedRect({ ...i, x: 0, y: 0 })!.w, h: placedRect({ ...i, x: 0, y: 0 })!.h }));
    const member = packWith("maxrects", { container: toPackInput(input).container, items: boxes }, { rule: "bl" });
    const at = new Map(member.placements.map((p) => [p.id, p]));
    for (const b of applyPack(input, out).boxes) {
      const r = placedRect(b)!;
      expect(r.x, b.id).toBeCloseTo(at.get(b.id)!.x, 9);
      expect(r.y, b.id).toBeCloseTo(at.get(b.id)!.y, 9);
    }
  });

  it("keeps a locked shape at its place", () => {
    const base = shapeInput("circle", 5, { fixedSize: true, count: 12 });
    const input: LayoutInput = { ...base, boxes: base.boxes.map((b, i) => (i === 0 ? { ...b, x: 3, y: 4, locked: true } : b)) };
    const out = packEntry("bbox-maxrects-bl", input);
    expect(out.placements.find((p) => p.id === input.boxes[0]!.id)).toMatchObject({ x: 3, y: 4 });
    expect(packHard(input, out)).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
  });

  it("gives the same output for the same seed", () => {
    for (const family of FAMILIES) {
      const input = shapeInput(family, 7);
      for (const { id } of BBOX_ENTRIES) expect(outputHash(packEntry(id, input, 3))).toBe(outputHash(packEntry(id, input, 3)));
    }
  });

  it("turns a turnable shape to the lower box with the option turn, and the result stays good", () => {
    const input = shapeInput("polygon", 6, { turnable: true });
    const out = packWith("bbox", toPackInput(input), { member: "skyline", turn: true });
    expect(packHard(input, out)).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
    const turned = new Set(out.placements.filter((p) => p.turn === 90).map((p) => p.id));
    expect(turned.size).toBeGreaterThan(0);
    for (const b of applyPack(input, out).boxes) {
      const r = placedRect(b)!;
      expect(r.h, b.id).toBeLessThanOrEqual(r.w + 1e-9);
    }
    // Without turn, the member skyline does not turn, so a turnable item throws its UnsupportedCell
    expect(() => packWith("bbox", toPackInput(input), { member: "skyline" })).toThrow(/rotation/);
  });

  it("gives the bounding-box fill and the share of the shapes in the boxes", () => {
    const lines: string[] = [];
    for (const family of FAMILIES)
      for (const { id } of BBOX_ENTRIES) {
        const got = SEEDS.map((s) => fills(shapeInput(family, s), packEntry(id, shapeInput(family, s), s)));
        const boxFill = got.reduce((a, g) => a + g.boxFill, 0) / got.length;
        const shapeCover = got.reduce((a, g) => a + g.shapeCover, 0) / got.length;
        lines.push(`${family} ${id}: box fill ${boxFill.toFixed(3)}, shape cover ${shapeCover.toFixed(3)}`);
        expect(boxFill).toBeGreaterThan(0.4);
        expect(boxFill).toBeLessThanOrEqual(1);
        if (family === "circle") expect(shapeCover).toBeCloseTo(Math.PI / 4, 6);
        else expect(shapeCover).toBeLessThan(1);
      }
    expect(lines).toHaveLength(FAMILIES.length * BBOX_ENTRIES.length);
  });
});

describe("the strategy bbox on rectangles", () => {
  const inputs = [
    rectGrid.generate(4, { containerSize: "freeAspect", containerShape: "rect", sizes: "uniform", count: 40 }),
    rectGrid.generate(9, { containerSize: "fixed", containerShape: "circle", obstacles: "corridors", sizes: "heavyTail", count: 24 }),
  ];

  it("gives the output of its member on an input with only rect items", () => {
    for (const input of inputs) {
      const x = toPackInput(input);
      for (const e of BBOX_ENTRIES) {
        const base = entry(e.base!);
        expect(outputHash(packWith(e.strategy, x, e.options, 2)), e.id).toBe(outputHash(packWith(base.strategy, x, base.options, 2)));
        expect(outputHash(packConfig(x, named[e.id]!, 2)), e.id).toBe(outputHash(packWith(e.strategy, x, e.options, 2)));
      }
      expect(outputHash(packWith("bbox", x, {}, 2))).toBe(outputHash(packWith("maxrects", x, { rule: "bl" }, 2)));
    }
  });

  it("is a composite of the registry with each shape kind", () => {
    expect(bboxStrategy.supports.itemShape).toEqual(["rect", "polygon", "circle", "free", "mixed"]);
    expect(bboxStrategy.defaults).toEqual({ turn: false });
  });
});

describe("packConfig with bbox", () => {
  it("packs shapes with a bbox config, and refuses them with a config without bbox", () => {
    const input = shapeInput("mixed", 8);
    const x = toPackInput(input);
    for (const { id } of BBOX_ENTRIES) {
      const out = packConfig(x, named[id]!, 1);
      expect(outputHash(out)).toBe(outputHash(packEntry(id, input, 1)));
      expect(packHard(input, out)["no-overlap"]).toBe(0);
    }
    expect(() => packConfig(x, named["maxrects-bl"]!)).toThrow(UnsupportedShape);
    const turn = { space: "packing", stages: { combine: { option: "bbox", params: { turn: true }, members: [named["skyline"]!] } } };
    const t = shapeInput("polygon", 6, { turnable: true });
    expect(outputHash(packConfig(toPackInput(t), turn))).toBe(outputHash(packWith("bbox", toPackInput(t), { member: "skyline", turn: true })));
  });
});
