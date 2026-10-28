import { createFamilyRegistry, familyKind, levelsOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  BL_TRAP_WIDTH,
  BL_TRAP_WIDTHS,
  blTrap,
  corpusFamilies,
  HALF_WIDE_WIDTH,
  halfWide,
  LADDER_SIDE,
  LADDER_WIDTH,
  ladder,
  ladderRung,
  objectiveBound,
  skylineGap,
  tallRow,
  toPackInput,
  WORST_WIDTH,
  worstGenerators,
  type CorpusGenerator,
  type GeneratedInput,
  type GeneratorParams,
} from "@mark1russell7/packing";

// Roadmap item k107: the adversarial families and the scaling ladder.

const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
const area = (file: GeneratedInput): number => file.boxes.reduce((s, b) => s + b.w * b.h, 0);

/** For each generator, some parameters to test, over its defaults. */
const PARAMS: readonly (readonly [CorpusGenerator, readonly GeneratorParams[]])[] = [
  [tallRow, [{}, { ratio: 1 }, { ratio: 32, containerSize: "fixed" }, { ratio: 3, count: 7 }]],
  [skylineGap, [{}, { ratio: 1 }, { ratio: 32, containerSize: "fixed", count: 401 }]],
  [blTrap, [{}, { stages: 2 }, { stages: 3, containerSize: "fixed", count: 61 }]],
  [halfWide, [{}, { excess: 1 }, { excess: 4, containerSize: "fixed", count: 45 }]],
  [ladder, [{}, { rung: 0 }, { rung: 8 }, { axis: "ratio", rung: 0 }, { axis: "ratio", rung: 8, count: 300 }]],
];
const CASES = PARAMS.flatMap(([gen, list]) => list.map((params) => [`${gen.name} ${JSON.stringify(params)}`, gen, params] as const));

describe("the generators for the worst case", () => {
  it.each(CASES)("give the same file for the same seed, and another file for another seed: %s", (_, gen, params) => {
    expect(JSON.stringify(gen.generate(4, params))).toBe(JSON.stringify(gen.generate(4, params)));
    expect(gen.generate(4, params).hash).not.toBe(gen.generate(5, params).hash);
  });

  it.each(CASES)("give the exact count, whole sides and items that fit the container: %s", (_, gen, params) => {
    const file = gen.generate(3, params);
    const full = gen.withDefaults(params);
    const count = gen === ladder ? ladderRung(full as Parameters<typeof ladderRung>[0]).count : full["count"];
    expect(file.boxes).toHaveLength(count as number);
    expect(new Set(file.boxes.map((b) => b.id)).size).toBe(file.boxes.length);
    const w = file.container.w!;
    for (const b of file.boxes) {
      expect(Number.isInteger(b.w) && Number.isInteger(b.h) && b.w > 0 && b.h > 0, b.id).toBe(true);
      expect(b.w, b.id).toBeLessThanOrEqual(w);
      if (file.container.fixed === "size") expect(b.h, b.id).toBeLessThanOrEqual(file.container.h!);
    }
    // The witness holds each item, so the item area is at most the area of the fixed strip
    if (file.container.fixed === "size") expect(area(file)).toBeLessThanOrEqual(w * file.container.h!);
    expect(file.source).toBe("made-up");
  });

  it("pin the hash of seed 1 of the defaults", () => {
    expect(Object.fromEntries(worstGenerators.map((g) => [g.generate(1).id, g.generate(1).hash]))).toEqual(PINS);
  });

  it("refuse a parameter out of its range", () => {
    expect(() => tallRow.generate(1, { ratio: 0 })).toThrow(RangeError);
    expect(() => tallRow.generate(1, { ratio: 33 })).toThrow(RangeError);
    expect(() => skylineGap.generate(1, { ratio: 2.5 })).toThrow(RangeError);
    expect(() => blTrap.generate(1, { stages: 4 })).toThrow(RangeError);
    expect(() => halfWide.generate(1, { excess: 5 })).toThrow(RangeError);
    expect(() => ladder.generate(1, { rung: 9 })).toThrow(RangeError);
    expect(() => ladder.generate(1, { axis: "aspect" as "count" })).toThrow(RangeError);
    expect(() => tallRow.generate(1, { containerSize: "freeArea" as "fixed" })).toThrow(RangeError);
  });
});

describe("the rules of the adversarial families", () => {
  it("tall-row: tall items over half the width first, then short items from the narrowest", () => {
    for (const ratio of [2, 8, 32]) {
      const file = tallRow.generate(2, { ratio, count: 200 });
      const s = Math.min(...file.boxes.map((b) => b.h));
      expect(s >= 2 && s <= 4).toBe(true);
      const talls = file.boxes.filter((b) => b.h === ratio * s);
      const shorts = file.boxes.filter((b) => b.h === s);
      expect(talls.length + shorts.length).toBe(200);
      expect(file.boxes.slice(0, talls.length)).toEqual(talls);
      for (const t of talls) expect(t.w >= 51 && t.w <= 75).toBe(true);
      expect(shorts.map((b) => b.w)).toEqual(shorts.map((b) => b.w).toSorted((x, y) => x - y));
    }
  });

  it("tall-row: the bands tile the fixed strip when the count ends a band", () => {
    // With the ratio 1, each band has the tall item and 1 or 2 short items of the same height
    const whole = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => tallRow.generate(seed, { ratio: 1, containerSize: "fixed", count: 300 })).filter((f) => area(f) === WORST_WIDTH * f.container.h!);
    expect(whole.length).toBeGreaterThan(0);
  });

  it("skyline-gap: each pillar is 1 unit too wide to go next to a plate, and 1 unit taller than its plate", () => {
    for (const ratio of [1, 4, 32]) {
      const file = skylineGap.generate(6, { ratio, count: 100 });
      const pillar = Math.floor(WORST_WIDTH / (ratio + 1));
      const plates = file.boxes.filter((b) => b.w === WORST_WIDTH - pillar + 1);
      const pillars = file.boxes.filter((b) => b.w === pillar);
      expect([plates.length, pillars.length]).toEqual([50, 50]);
      const heights = new Set(plates.map((b) => b.h));
      expect(heights.size).toBe(50);
      for (const p of pillars) expect(heights.has(p.h - 1)).toBe(true);
    }
  });

  it("bl-trap: one height, the narrow items first, and full levels in the witness", () => {
    for (const stages of [2, 3] as const) {
      const file = blTrap.generate(5, { stages, containerSize: "fixed", count: 60 });
      expect(new Set(file.boxes.map((b) => b.h)).size).toBe(1);
      expect(file.boxes.map((b) => b.w)).toEqual(file.boxes.map((b) => b.w).toSorted((x, y) => x - y));
      expect(new Set(file.boxes.map((b) => b.w))).toEqual(new Set(BL_TRAP_WIDTHS[stages]));
      expect(BL_TRAP_WIDTHS[stages].reduce((s, w) => s + w, 0)).toBe(BL_TRAP_WIDTH);
      expect(area(file)).toBe(BL_TRAP_WIDTH * file.container.h!);
    }
  });

  it("half-wide: the 4 widths in the order of the area, 6, 6, 6 and 12 in each group, and 9 full levels", () => {
    for (const excess of [1, 2, 3, 4]) {
      const file = halfWide.generate(7, { excess, containerSize: "fixed", count: 60 });
      const widths = file.boxes.map((b) => b.w);
      const count = (w: number): number => widths.filter((x) => x === w).length;
      expect([count(100 + excess), count(50 + 2 * excess), count(50 + excess), count(50 - 2 * excess)]).toEqual([12, 12, 12, 24]);
      expect(widths).toEqual(widths.toSorted((x, y) => y - x));
      const h = file.boxes[0]!.h;
      expect(file.container.h).toBe(18 * h);
      expect(area(file)).toBe(HALF_WIDE_WIDTH * file.container.h!);
    }
  });

  it("give the strip area bound, which is the height of the witness for full levels", () => {
    const file = halfWide.generate(1, { count: 120 });
    const bound = objectiveBound(toPackInput(file), { tolerance: 0 })!;
    expect(bound.objective).toBe("height");
    expect(bound.value).toBe(area(file) / HALF_WIDE_WIDTH);
    expect(bound.value).toBe(halfWide.generate(1, { count: 120, containerSize: "fixed" }).container.h);
  });
});

describe("the ladder", () => {
  it("doubles the count on the axis count, with the sides 64 to 256", () => {
    for (let rung = 0; rung <= 8; rung++) {
      const file = ladder.generate(1, { axis: "count", rung });
      expect(file.boxes).toHaveLength(10 * 2 ** rung);
      expect(file.container).toEqual({ w: LADDER_WIDTH, fixed: "width" });
      for (const b of file.boxes) for (const v of [b.w, b.h]) expect(v >= 64 && v <= LADDER_SIDE).toBe(true);
    }
  });

  it("doubles the side ratio on the axis ratio, at a fixed count", () => {
    for (let rung = 0; rung <= 8; rung++) {
      const file = ladder.generate(2, { axis: "ratio", rung, count: 2000 });
      const sides = file.boxes.flatMap((b) => [b.w, b.h]);
      expect(file.boxes).toHaveLength(2000);
      expect(Math.max(...sides)).toBe(LADDER_SIDE);
      expect(Math.min(...sides)).toBe(LADDER_SIDE / 2 ** rung);
    }
  });

  it("ignores count on the axis count", () => {
    expect(registry.generate("ladder", 1, { axis: "count", rung: 2, count: 7 })).toEqual(registry.generate("ladder", 1, { axis: "count", rung: 2 }));
    expect(registry.cellOf("ladder", { axis: "count", rung: 2 })).toEqual({ kind: "ladder@1", axis: "count", rung: 2, margin: 0, gap: 0, shape: "rect" });
  });
});

describe("the families for the worst case", () => {
  it("are in the registry with version 1, the owner packing and the note exact", () => {
    for (const name of ["tall-row", "skyline-gap", "bl-trap", "half-wide", "ladder"]) {
      const f = registry.family(name);
      expect([f.version, f.owner, f.crossEngine]).toEqual([1, "packing", "exact"]);
      expect(registry.cellOf(name, {}).kind).toBe(familyKind(name, 1));
    }
    expect(registry.cellOf("tall-row", { ratio: 4, containerSize: "fixed", count: 50 })).toEqual({ kind: "tall-row@1", ratio: 4, containerSize: "fixed", count: 50, margin: 0, gap: 0, shape: "rect" });
  });

  it("give each dimension a range, a default and levels", () => {
    const dims = (name: string) => Object.fromEntries(registry.family(name).dimensions.map((d) => [d.name, d]));
    for (const name of ["tall-row", "skyline-gap"]) {
      const d = dims(name);
      expect([d["ratio"]!.min, d["ratio"]!.max, d["ratio"]!.default, d["ratio"]!.scale]).toEqual([1, 32, 8, "log"]);
      expect(levelsOf(d["ratio"]!)).toEqual([1, 2, 4, 8, 16, 32]);
      expect(levelsOf(d["count"]!)).toEqual([50, 100, 200, 400]);
    }
    expect([dims("bl-trap")["stages"]!.min, dims("bl-trap")["stages"]!.max]).toEqual([2, 3]);
    expect([dims("half-wide")["excess"]!.min, dims("half-wide")["excess"]!.max]).toEqual([1, 4]);
    expect([dims("ladder")["rung"]!.min, dims("ladder")["rung"]!.max, dims("ladder")["rung"]!.default]).toEqual([0, 8, 3]);
    expect(registry.resolve("ladder")).toMatchObject({ axis: "count", rung: 3, count: 100 });
  });

  it("give the cell counts of a sweep", () => {
    expect(registry.cellCount("tall-row", { sweep: ["ratio", "containerSize", "count"] })).toBe(48);
    expect(registry.cellCount("skyline-gap", { sweep: ["ratio", "containerSize", "count"] })).toBe(48);
    expect(registry.cellCount("bl-trap", { sweep: ["stages", "containerSize", "count"] })).toBe(20);
    expect(registry.cellCount("half-wide", { sweep: ["excess", "containerSize", "count"] })).toBe(40);
    expect(registry.cellCount("ladder", { sweep: ["axis", "rung"] })).toBe(18);
  });

  it("give the bytes of the generator through the registry, and refuse a value out of range", () => {
    const dims = { ratio: 16, containerSize: "fixed", count: 200 } as const;
    expect(JSON.stringify(registry.generate("skyline-gap", 5, dims))).toBe(JSON.stringify(skylineGap.generate(5, dims)));
    expect(() => registry.generate("tall-row", 5, { ratio: 64 })).toThrow(RangeError);
    expect(() => registry.generate("ladder", 5, { rung: -1 })).toThrow(RangeError);
  });
});

const PINS: Record<string, string> = {
  "worst-v1/tall-row.r8.freeHeight.n100/s1": "28f979f58ac162a7",
  "worst-v1/skyline-gap.r8.freeHeight.n100/s1": "e28c10c153603d8a",
  "worst-v1/bl-trap.s3.freeHeight.n120/s1": "f9a031c86099b50f",
  "worst-v1/half-wide.e2.freeHeight.n120/s1": "1d53dea6b4136ffc",
  "worst-v1/ladder.count.r3/s1": "13c5e796e3ca19ba",
};
