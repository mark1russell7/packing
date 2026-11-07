import { createFamilyRegistry } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkInput, corpusFamilies, itemLaw, itemLawFamily, LAW_TYPES, lawGenerators, type GeneratedInput, type ItemLawParams } from "@mark1russell7/packing";

// Roadmap item k190: the generator item-law, with one area law, one aspect law and one assortment for each input. The data is made up.
// The file bench/laws.test.ts reads the laws of each spec of the corpus pack-laws-v1 back from its items.

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);

const PARAMS: readonly Partial<ItemLawParams>[] = [
  {},
  { areaLaw: "identical", aspectLaw: "fixed" },
  { areaLaw: "pareto", aspectLaw: "extreme-mixed" },
  { areaLaw: "multimodal", aspectLaw: "discrete", assortment: "few-types" },
  { assortment: "few-types" },
  { count: 1 },
  { count: 0 },
];

/** The pinned hash of seed 1 of each case. A change of a pinned hash needs a new version of the generator. */
const PINS: Record<string, string> = {
  "laws-v1/item-law.log-normal.wide.all-differ.n80/s1": "51b7d1b0364371ce",
  "laws-v1/item-law.identical.fixed.all-differ.n80/s1": "44bb578cf250889b",
  "laws-v1/item-law.pareto.extreme-mixed.all-differ.n80/s1": "df1982ceb267e21d",
  "laws-v1/item-law.multimodal.discrete.few-types.n80/s1": "051a0debb60b7e58",
  "laws-v1/item-law.log-normal.wide.few-types.n80/s1": "3e85c210a9c743a6",
  "laws-v1/item-law.log-normal.wide.all-differ.n1/s1": "ba160268a9666d1b",
  "laws-v1/item-law.log-normal.wide.all-differ.n0/s1": "1949a817c06a60f7",
};

const label = (p: Partial<ItemLawParams>): string => JSON.stringify(p);

describe("the generator item-law", () => {
  it.each(PARAMS.map((p) => [label(p), p] as const))("gives the pinned hash for seed 1, and the same bytes through the registry: %s", (_, params) => {
    const file = itemLaw.generate(1, params);
    expect(file.hash, file.id).toBe(PINS[file.id]);
    expect(JSON.stringify(registry.generate("item-law", 1, params, { version: 1 }))).toBe(JSON.stringify(file));
  });

  it("has a pin for each case, and no other pin", () => {
    expect(PARAMS.map((p) => itemLaw.generate(1, p).id).toSorted()).toEqual(Object.keys(PINS).toSorted());
  });

  it.each(PARAMS.map((p) => [label(p), p] as const))("gives a valid strip that is wider than each item, with whole sides: %s", (_, params) => {
    for (const seed of [1, 2, 3]) {
      const file = itemLaw.generate(seed, params);
      const full = itemLaw.withDefaults(params);
      expect(checkInput(file)).toEqual([]);
      expect(file.boxes).toHaveLength(full.count);
      expect(file.container.fixed).toBe("width");
      for (const b of file.boxes) {
        expect(Number.isInteger(b.w) && Number.isInteger(b.h) && b.w >= 1 && b.h >= 1).toBe(true);
        expect(b.w).toBeLessThanOrEqual(file.container.w!);
      }
      const total = file.boxes.reduce((sum, b) => sum + b.w * b.h, 0);
      if (total > 0) expect(total % file.container.w!, "the items do not fill whole rows").not.toBe(0);
    }
  });

  it("gives at most 16 types with the assortment few-types, each type with the same count of items", () => {
    for (const seed of [1, 2, 3]) {
      const file = itemLaw.generate(seed, { assortment: "few-types" });
      const counts = new Map<string, number>();
      for (const b of file.boxes) counts.set(`${b.w}x${b.h}`, (counts.get(`${b.w}x${b.h}`) ?? 0) + 1);
      expect(counts.size).toBeLessThanOrEqual(LAW_TYPES);
      expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    }
  });

  it("gives exact ratios of whole numbers for the aspect law discrete", () => {
    const file = itemLaw.generate(1, { aspectLaw: "discrete" });
    const ratios = new Set(file.boxes.map((b) => (b.w >= b.h ? b.w / b.h : -b.h / b.w)));
    expect([...ratios].every((r) => [1, 2, 3, -2, -3].includes(r))).toBe(true);
  });

  it("is the one generator of lawGenerators, and its family has the law dimensions, then count and the knobs", () => {
    expect(lawGenerators).toEqual([itemLaw]);
    expect(itemLawFamily.dimensions.map((d) => d.name)).toEqual(["areaLaw", "aspectLaw", "assortment", "count", "margin", "gap", "shape"]);
    expect(itemLawFamily.crossEngine).toBe("libm-dependent");
  });
});
