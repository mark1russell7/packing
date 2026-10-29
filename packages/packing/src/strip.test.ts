import { createFamilyRegistry, familyKind, levelsOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  BEASLEY_GCUT_COUNTS,
  BEASLEY_GCUT_SIDES,
  BURKE_KENDALL_WHITWELL_RULES,
  HOPPER_TURTON_RULES,
  beasleyGcut,
  beasleyGcutFamily,
  beasleyGcutRange,
  burkeKendallWhitwell,
  burkeKendallWhitwellFamily,
  burkeKendallWhitwellOf,
  corpusFamilies,
  hopperTurton,
  hopperTurtonFamily,
  hopperTurtonOf,
  objectiveBound,
  stripGenerators,
  toPackInput,
  type BurkeKendallWhitwellProblem,
  type CutPiece,
  type GeneratedInput,
  type HopperTurtonCategory,
  type StripCut,
} from "@mark1russell7/packing";

// Roadmap item k46: the published sets of strip packing, made by their rules. Hopper and Turton 2001, Burke, Kendall and
// Whitwell 2004, and Beasley 1985b. No test reads a published instance file.

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
const HT = Object.keys(HOPPER_TURTON_RULES) as HopperTurtonCategory[];
const BKW = Object.keys(BURKE_KENDALL_WHITWELL_RULES) as BurkeKendallWhitwellProblem[];
const CUTS: StripCut[] = ["guillotine", "free"];

/** This function tells that the pieces tile the object `w` by `h`: each piece is in the object, no 2 pieces overlap, and the areas add up. */
function expectTiling(w: number, h: number, pieces: readonly CutPiece[]): void {
  let area = 0;
  for (const p of pieces) {
    expect(Number.isInteger(p.w) && Number.isInteger(p.h) && p.w >= 1 && p.h >= 1).toBe(true);
    expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h, `${p.id} in ${w} x ${h}`).toBe(true);
    area += p.w * p.h;
  }
  expect(area).toBe(w * h);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} and ${b.id}`).toBe(true);
    }
  }
}

describe("the generator hopper-turton", () => {
  it("gives the same file for the same seed, and another file for another seed", () => {
    const p = { category: "C3", problem: 2 } as const;
    expect(JSON.stringify(hopperTurton.generate(4, p))).toBe(JSON.stringify(hopperTurton.generate(4, p)));
    expect(hopperTurton.generate(4, p).hash).not.toBe(hopperTurton.generate(5, p).hash);
  });

  it("pins the hash of seed 1 of the defaults", () => {
    const file = hopperTurton.generate(1);
    expect(file.id).toBe("strip-v1/hopper-turton.C1.p1.guillotine.freeHeight/s1");
    expect(file.source).toBe("known-best:hopper-turton");
    expect(file.hash).toBe(HT_PIN);
  });

  it.each(HT)("cuts the object of the category %s into the count of each problem, with the height of the object as the optimum", (c) => {
    const rule = HOPPER_TURTON_RULES[c];
    for (const cut of CUTS) {
      for (const problem of [1, 2, 3]) {
        const { w, h, pieces } = hopperTurtonOf(7, { category: c, problem, cut });
        expect([w, h]).toEqual([rule.w, rule.h]);
        expect(pieces).toHaveLength(rule.counts[problem - 1]!);
        expectTiling(w, h, pieces);
        const strip = hopperTurton.generate(7, { category: c, problem, cut });
        expect(strip.container).toEqual({ w: rule.w, fixed: "width" });
        expect(strip.known).toEqual({ kind: "optimum", area: rule.w * rule.h, height: rule.h, source: `hopper-turton.${c}.${cut}` });
        expect(strip.boxes).toEqual(pieces.map(({ id, w: bw, h: bh }) => ({ id, w: bw, h: bh })));
        const bin = hopperTurton.generate(7, { category: c, problem, cut, containerSize: "fixed" });
        expect(bin.container).toEqual({ w: rule.w, h: rule.h, fixed: "size" });
        expect(bin.known).toEqual({ kind: "optimum", area: rule.w * rule.h, source: `hopper-turton.${c}.${cut}` });
      }
    }
  });

  it("has the published objects and counts of the categories", () => {
    expect(HT.map((c) => [HOPPER_TURTON_RULES[c].w, HOPPER_TURTON_RULES[c].h])).toEqual([[20, 20], [40, 15], [60, 30], [60, 60], [60, 90], [80, 120], [160, 240]]);
    expect(HT.map((c) => HOPPER_TURTON_RULES[c].counts)).toEqual([[16, 17, 16], [25, 25, 25], [28, 29, 28], [49, 49, 49], [73, 73, 73], [97, 97, 97], [196, 197, 196]]);
  });

  it("refuses a problem out of 1 to 3, and a category that is not in the set", () => {
    for (const problem of [0, 4, 1.5]) expect(() => hopperTurton.generate(1, { problem })).toThrow(RangeError);
    expect(() => hopperTurton.generate(1, { category: "C8" as HopperTurtonCategory })).toThrow(RangeError);
  });
});

describe("the generator burke-kendall-whitwell", () => {
  it("gives the same file for the same seed", () => {
    expect(JSON.stringify(burkeKendallWhitwell.generate(9, { instance: "N7" }))).toBe(JSON.stringify(burkeKendallWhitwell.generate(9, { instance: "N7" })));
  });

  it("pins the hash of seed 1 of the defaults", () => {
    const file = burkeKendallWhitwell.generate(1);
    expect(file.id).toBe("strip-v1/burke-kendall-whitwell.N1.guillotine.freeHeight/s1");
    expect(file.hash).toBe(BKW_PIN);
  });

  it.each(BKW.filter((n) => n !== "N13"))("cuts the object of the problem %s into its count, with the height of the object as the optimum", (n) => {
    const rule = BURKE_KENDALL_WHITWELL_RULES[n];
    for (const cut of CUTS) {
      const { w, h, pieces } = burkeKendallWhitwellOf(3, { instance: n, cut });
      expect([w, h, pieces.length]).toEqual([rule.w, rule.h, rule.count]);
      expectTiling(w, h, pieces);
      expect(burkeKendallWhitwell.generate(3, { instance: n, cut }).known).toEqual({ kind: "optimum", area: rule.w * rule.h, height: rule.h, source: `burke-kendall-whitwell.${n}.${cut}` });
    }
  });

  it("gives N13 3152 pieces with the area of the object 640 by 960", () => {
    const { w, h, pieces } = burkeKendallWhitwellOf(1, { instance: "N13" });
    expect([w, h, pieces.length]).toEqual([640, 960, 3152]);
    expect(pieces.reduce((s, p) => s + p.w * p.h, 0)).toBe(640 * 960);
    expect(pieces.every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= w && p.y + p.h <= h)).toBe(true);
  });

  it("refuses a problem that is not in the set", () => {
    expect(() => burkeKendallWhitwell.generate(1, { instance: "N14" as BurkeKendallWhitwellProblem })).toThrow(RangeError);
  });
});

describe("the generator beasley-gcut", () => {
  it("gives the same file for the same seed", () => {
    expect(JSON.stringify(beasleyGcut.generate(2, { side: 500, count: 30 }))).toBe(JSON.stringify(beasleyGcut.generate(2, { side: 500, count: 30 })));
  });

  it("pins the hash of seed 1 of the defaults", () => {
    const file = beasleyGcut.generate(1);
    expect(file.id).toBe("strip-v1/beasley-gcut.s250.freeHeight.n10/s1");
    expect(file.source).toBe("made-up");
    expect(file.known).toBeUndefined();
    expect(file.hash).toBe(GCUT_PIN);
  });

  it.each(BEASLEY_GCUT_SIDES)("keeps each side in a quarter to three quarters of the stock side %i", (side) => {
    const [lo, hi] = beasleyGcutRange(side);
    expect([lo, hi]).toEqual([side / 4, (3 * side) / 4].map((v, i) => (i === 0 ? Math.ceil(v) : Math.floor(v))));
    for (const containerSize of ["fixed", "freeHeight"] as const) {
      for (const count of BEASLEY_GCUT_COUNTS) {
        const file = beasleyGcut.generate(5, { side, containerSize, count });
        expect(file.boxes).toHaveLength(count);
        expect(file.container).toEqual(containerSize === "fixed" ? { w: side, h: side, fixed: "size" } : { w: side, fixed: "width" });
        for (const b of file.boxes) for (const v of [b.w, b.h]) expect(Number.isInteger(v) && v >= lo && v <= hi).toBe(true);
      }
    }
    const sides = beasleyGcut.generate(2, { side, count: 2000 }).boxes.flatMap((b) => [b.w, b.h]);
    expect([Math.min(...sides), Math.max(...sides)]).toEqual([lo, hi]);
  });

  it("refuses a side out of 4 to 10000", () => {
    for (const side of [3, 10_001, 250.5]) expect(() => beasleyGcut.generate(1, { side })).toThrow(RangeError);
  });

  it("gives the strip bound of pack.bound, with no known value", () => {
    const file = beasleyGcut.generate(1, { count: 50 });
    const area = file.boxes.reduce((s, b) => s + b.w * b.h, 0);
    const bound = objectiveBound(toPackInput(file), { tolerance: 0 })!;
    expect(bound.objective).toBe("height");
    expect(bound.parts["strip.area"]).toBe(Math.ceil(area / 250));
  });
});

describe("the strip families", () => {
  it("are in the registry with their kinds, and stripGenerators lists their generators", () => {
    expect(stripGenerators).toEqual([hopperTurton, burkeKendallWhitwell, beasleyGcut]);
    expect(registry.family("hopper-turton")).toBe(hopperTurtonFamily);
    expect(registry.family("burke-kendall-whitwell")).toBe(burkeKendallWhitwellFamily);
    expect(registry.family("beasley-gcut")).toBe(beasleyGcutFamily);
    expect(registry.cellOf("hopper-turton", { category: "C4", problem: 2 })).toEqual({ kind: familyKind("hopper-turton", 1), category: "C4", problem: 2, cut: "guillotine", containerSize: "freeHeight", margin: 0, gap: 0, shape: "rect" });
    expect(registry.cellOf("beasley-gcut", {}).kind).toBe("beasley-gcut@1");
  });

  it("have the dimensions of their generator, with the published values as levels", () => {
    const names = (f: { dimensions: readonly { name: string }[] }): string[] => f.dimensions.map((d) => d.name);
    expect(names(hopperTurtonFamily)).toEqual(["category", "problem", "cut", "containerSize", "margin", "gap", "shape"]);
    expect(names(burkeKendallWhitwellFamily)).toEqual(["instance", "cut", "containerSize", "margin", "gap", "shape"]);
    expect(names(beasleyGcutFamily)).toEqual(["side", "containerSize", "count", "margin", "gap", "shape"]);
    expect(hopperTurtonFamily.dimensions[0]!.values).toEqual(HT);
    expect(levelsOf(hopperTurtonFamily.dimensions[1]!)).toEqual([1, 2, 3]);
    expect(burkeKendallWhitwellFamily.dimensions[0]!.values).toEqual(BKW);
    const [side, , count] = beasleyGcutFamily.dimensions;
    expect([side!.min, side!.max, levelsOf(side!)]).toEqual([4, 10_000, [250, 500, 1000]]);
    expect([count!.min, count!.max, levelsOf(count!)]).toEqual([1, 10_000, [10, 20, 30, 50]]);
    for (const f of [hopperTurtonFamily, burkeKendallWhitwellFamily, beasleyGcutFamily]) {
      expect(f.crossEngine).toBe("exact");
      expect(f.owner).toBe("packing");
    }
    expect(registry.cellCount("hopper-turton", { sweep: ["category", "problem", "cut", "containerSize"] })).toBe(84);
    expect(registry.cellCount("burke-kendall-whitwell", { sweep: ["instance", "cut", "containerSize"] })).toBe(52);
    expect(registry.cellCount("beasley-gcut", { sweep: ["side", "containerSize", "count"] })).toBe(24);
  });

  it("give the bytes of the generator through the registry, and remove the known optimum with a gap", () => {
    const dims = { category: "C2", problem: 3, cut: "free", containerSize: "fixed" } as const;
    expect(JSON.stringify(registry.generate("hopper-turton", 5, dims))).toBe(JSON.stringify(hopperTurton.generate(5, dims)));
    expect(JSON.stringify(registry.generate("beasley-gcut", 5, { side: 1000, count: 20 }))).toBe(JSON.stringify(beasleyGcut.generate(5, { side: 1000, count: 20 })));
    for (const name of ["hopper-turton", "burke-kendall-whitwell"]) {
      const file = registry.generate(name, 2, { gap: 1 });
      expect(file.known, name).toBeUndefined();
      expect(file.invalidated, name).toEqual(["known"]);
    }
    expect(() => registry.generate("hopper-turton", 5, { problem: 4 })).toThrow(RangeError);
    expect(() => registry.generate("beasley-gcut", 5, { side: 2 })).toThrow(RangeError);
  });
});

const HT_PIN = "27cb8ea6f5c644d4";
const BKW_PIN = "64306918e92ad819";
const GCUT_PIN = "e8604dda4b6baee7";
