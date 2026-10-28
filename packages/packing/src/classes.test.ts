import { createFamilyRegistry, familyKind, levelsOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  BERKEY_WANG_RULES,
  berkeyWang,
  berkeyWangFamily,
  binCountBound,
  CLASS_COUNTS,
  corpusFamilies,
  MARTELLO_VIGO_BIN,
  MARTELLO_VIGO_TYPES,
  martelloVigo,
  martelloVigoFamily,
  objectiveBound,
  toPackInput,
  type BerkeyWangClass,
  type GeneratedInput,
  type MartelloVigoClass,
} from "@mark1russell7/packing";

// Roadmap item k106: the classes I to X of Berkey and Wang 1987 and Martello and Vigo 1998, as generator families.

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
const BW: BerkeyWangClass[] = ["I", "II", "III", "IV", "V", "VI"];
const MV: MartelloVigoClass[] = ["VII", "VIII", "IX", "X"];

describe("the generator berkey-wang", () => {
  it("gives the same file for the same seed, and another file for another seed", () => {
    expect(JSON.stringify(berkeyWang.generate(4, { class: "III" }))).toBe(JSON.stringify(berkeyWang.generate(4, { class: "III" })));
    expect(berkeyWang.generate(4, { class: "III" }).hash).not.toBe(berkeyWang.generate(5, { class: "III" }).hash);
  });

  it("pins the hash of seed 1 of the defaults", () => {
    const file = berkeyWang.generate(1);
    expect(file.id).toBe("classes-v1/berkey-wang.I.freeHeight.n100/s1");
    expect(file.hash).toBe(BW_PIN);
  });

  it.each(BW)("keeps each side in the range of class %s, and each item fits the bin", (c) => {
    const rule = BERKEY_WANG_RULES[c];
    for (const containerSize of ["fixed", "freeHeight"] as const) {
      for (const count of CLASS_COUNTS) {
        const file = berkeyWang.generate(7, { class: c, containerSize, count });
        expect(file.boxes).toHaveLength(count);
        expect(file.container).toEqual(containerSize === "fixed" ? { w: rule.bin, h: rule.bin, fixed: "size" } : { w: rule.bin, fixed: "width" });
        for (const b of file.boxes) {
          for (const v of [b.w, b.h]) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(rule.min);
            expect(v).toBeLessThanOrEqual(rule.max);
          }
          expect(b.w <= rule.bin && b.h <= rule.bin).toBe(true);
        }
      }
    }
  });

  it("reaches both ends of the range over many items", () => {
    const sides = berkeyWang.generate(2, { class: "I", count: 1000 }).boxes.flatMap((b) => [b.w, b.h]);
    expect(Math.min(...sides)).toBe(1);
    expect(Math.max(...sides)).toBe(10);
  });
});

describe("the generator martello-vigo", () => {
  it("gives the same file for the same seed", () => {
    expect(JSON.stringify(martelloVigo.generate(9, { class: "X" }))).toBe(JSON.stringify(martelloVigo.generate(9, { class: "X" })));
  });

  it("pins the hash of seed 1 of the defaults", () => {
    const file = martelloVigo.generate(1);
    expect(file.id).toBe("classes-v1/martello-vigo.VII.freeHeight.n100/s1");
    expect(file.hash).toBe(MV_PIN);
  });

  /** The index of the first type whose ranges hold the item. The types 1 and 3 share a part of their ranges. */
  const typesOf = (w: number, h: number): number[] =>
    MARTELLO_VIGO_TYPES.flatMap((t, i) => (w >= t.w[0] && w <= t.w[1] && h >= t.h[0] && h <= t.h[1] ? [i] : []));

  it.each(MV.map((c, i) => [c, i] as const))("keeps each item in a type of class %s, with the main type for about 70 percent", (c, main) => {
    const file = martelloVigo.generate(3, { class: c, containerSize: "fixed", count: 2000 });
    expect(file.container).toEqual({ w: MARTELLO_VIGO_BIN, h: MARTELLO_VIGO_BIN, fixed: "size" });
    let inMain = 0;
    for (const b of file.boxes) {
      expect(Number.isInteger(b.w) && Number.isInteger(b.h)).toBe(true);
      expect(b.w <= MARTELLO_VIGO_BIN && b.h <= MARTELLO_VIGO_BIN).toBe(true);
      const types = typesOf(b.w, b.h);
      expect(types.length, `${b.w} x ${b.h}`).toBeGreaterThan(0);
      if (types.includes(main)) inMain += 1;
    }
    // The main type has the share 0.7. Another type can also be in its ranges, so the share is a little more.
    expect(inMain / file.boxes.length).toBeGreaterThan(0.66);
    expect(inMain / file.boxes.length).toBeLessThan(0.85);
  });
});

describe("the class families", () => {
  it("are in the registry with the kinds berkey-wang@1 and martello-vigo@1", () => {
    expect(registry.family("berkey-wang")).toBe(berkeyWangFamily);
    expect(registry.family("martello-vigo")).toBe(martelloVigoFamily);
    expect(registry.cellOf("berkey-wang", { class: "IV", containerSize: "fixed", count: 40 })).toEqual({ kind: familyKind("berkey-wang", 1), class: "IV", containerSize: "fixed", count: 40, margin: 0, gap: 0, shape: "rect" });
    expect(registry.cellOf("martello-vigo", {}).kind).toBe("martello-vigo@1");
  });

  it("have the dimensions class, containerSize and count, with the counts of the literature as levels", () => {
    for (const [f, classes] of [[berkeyWangFamily, BW], [martelloVigoFamily, MV]] as const) {
      const [cls, size, count] = f.dimensions;
      expect(cls!.values).toEqual(classes);
      expect(size!.values).toEqual(["fixed", "freeHeight"]);
      expect(levelsOf(count!)).toEqual([20, 40, 60, 80, 100]);
      expect([count!.min, count!.max]).toEqual([1, 10_000]);
      expect(f.crossEngine).toBe("exact");
      expect(f.owner).toBe("packing");
    }
    expect(registry.cellCount("berkey-wang", { sweep: ["class", "containerSize", "count"] })).toBe(60);
    expect(registry.cellCount("martello-vigo", { sweep: ["class", "containerSize", "count"] })).toBe(40);
  });

  it("give the bytes of the generator through the registry", () => {
    const dims = { class: "V", containerSize: "fixed", count: 60 } as const;
    expect(JSON.stringify(registry.generate("berkey-wang", 5, dims))).toBe(JSON.stringify(berkeyWang.generate(5, dims)));
    expect(() => registry.generate("berkey-wang", 5, { class: "VII" })).toThrow(RangeError);
    expect(() => registry.generate("martello-vigo", 5, { containerSize: "freeArea" })).toThrow(RangeError);
  });
});

describe("the bounds of the classes", () => {
  it("give the strip area bound in pack.bound for a strip", () => {
    const file = berkeyWang.generate(1, { class: "II", count: 40 });
    const area = file.boxes.reduce((s, b) => s + b.w * b.h, 0);
    const bound = objectiveBound(toPackInput(file), { tolerance: 0 })!;
    expect(bound.objective).toBe("height");
    expect(bound.parts["strip.area"]).toBe(Math.ceil(area / 30));
    expect(bound.value).toBeGreaterThanOrEqual(Math.ceil(area / 30));
  });

  it("give the bin count bound L1, and placed.free is at most 1 over the continuous L1", () => {
    const file = martelloVigo.generate(1, { class: "X", containerSize: "fixed", count: 40 });
    const area = file.boxes.reduce((s, b) => s + b.w * b.h, 0);
    expect(binCountBound(file)).toBe(Math.ceil(area / 10_000));
    expect(binCountBound(toPackInput(file))).toBe(Math.ceil(area / 10_000));
    const bound = objectiveBound(toPackInput(file), { tolerance: 0 })!;
    expect(bound.kind).toBe("placed.free");
    expect(bound.value).toBeLessThanOrEqual(Math.min(1, 10_000 / area) + 1e-3);
    expect(binCountBound(berkeyWang.generate(1))).toBeNull();
  });
});

const BW_PIN = "40290d0b29d30a70";
const MV_PIN = "a055e9d48b1027f6";
