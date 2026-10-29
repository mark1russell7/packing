import { describe, expect, it } from "vitest";
import { corpusFamilies, generator, type GeneratedInput, GUILLOTINE_CHOICES, GUILLOTINE_SPLITS, HOLE_DEGREE_MAX_STEPS, MAXRECTS_RULES, packSpace, SHELF_FITS, SKYLINE_RULES, SORT_ORDERS, toPackInput } from "@mark1russell7/packing";
import {
  checkConfig,
  checkSpace,
  configId,
  createFamilyRegistry,
  dimensionSupports,
  shapeKindsOf,
  stepRandom,
  STRATEGY_SPACE_SCHEMA,
  type CorpusDimension,
  type SpaceParam,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import { hasClockLimit } from "./run.ts";
import {
  CLOCK_STRATUM,
  clockFree,
  clockOnly,
  determinismLines,
  drawConfig,
  drawInput,
  drawOf,
  drawParams,
  drawPlan,
  drawStratum,
  KNOB_RATIO,
  knobRatio,
  MAX_STRATUM_MISSES,
  medianSide,
  memberListCount,
  paramCount,
  pickWeighted,
  resolveDraw,
  sampleOptions,
  sampleSpace,
  spaceCounts,
  strataOf,
  stratumOf,
  uniformBig,
} from "./sample-space.ts";

// The sampler of the whole space of roadmap item k112. The tests use a fake clock, so they read no time of a run.

const ENV = { node: "v0", os: "test", arch: "x64", runner: "test", cpu: "test", cpus: 1 };

// The pins of k121 come from the code: the first 4 uniform configs of the seed 20 without clock limits, and the meta counts with and without a clock limit.
const DEFAULT_UNIFORM_IDS = ["ce6d8bf386fbb8a6", "58da5ef5c70859cc", "fb834701df83f8be", "da3d8a993a6a894c"];
const CLOCK_FREE_META = 19192758499731626817662756144n;
const CLOCK_CONFIGS = 19192758499731625913230514340n;

/** A small space: the stage `a` with `x` (a param `b`) or `y`, and an optional meta option `m` with 1 or 2 ordered members. It has 3 base configs and 9 meta configs. */
const SMALL: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "toy",
  version: "1",
  stages: [
    {
      name: "a",
      options: [
        { id: "x", params: [{ name: "b", kind: "bool", default: false }] },
        { id: "y", params: [] },
      ],
    },
    { name: "c", optional: true, options: [{ id: "m", params: [], members: { min: 1, max: 2, ordered: true } }] },
  ],
};

/** This function gives a fake clock: each call gives the next whole number. */
const fakeClock = (): (() => number) => {
  let t = 0;
  return () => t++;
};

describe("the random draws of the sampler", () => {
  it("gives each whole number below n with about the same chance", () => {
    const r = stepRandom(7, "uniform");
    const counts = new Array<number>(5).fill(0);
    for (let i = 0; i < 5000; i++) counts[Number(uniformBig(r, 5n))]!++;
    for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(150);
    const big = 10n ** 30n;
    for (let i = 0; i < 100; i++) expect(uniformBig(r, big) < big).toBe(true);
    expect(() => uniformBig(r, 0n)).toThrow(RangeError);
  });

  it("picks an index in proportion to its weight, and never an index of weight 0", () => {
    const r = stepRandom(3, "weights");
    const counts = [0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[pickWeighted(r, [1n, 0n, 3n])]!++;
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[0]! - 1000)).toBeLessThan(150);
  });
});

describe("the counts of the configs", () => {
  it("counts the discrete values and the active params, and a real param as one", () => {
    const params: SpaceParam[] = [
      { name: "fixed", kind: "bool", default: false },
      { name: "aspect", kind: "real", min: 0.25, max: 4, scale: "log", default: 1, when: { param: "fixed", in: [true] } },
      { name: "k", kind: "int", min: 1, max: 5, default: 3 },
    ];
    // fixed=false gives 5 values of k. fixed=true gives the real aspect (1) and 5 values of k.
    expect(paramCount(params)).toBe(10n);
    const r = stepRandom(1, "params");
    for (let i = 0; i < 50; i++) {
      const v = drawParams(r, params);
      expect("aspect" in v).toBe(v["fixed"] === true);
      expect(v["k"]).toBeGreaterThanOrEqual(1);
      expect(v["k"]).toBeLessThanOrEqual(5);
      if (v["fixed"] === true) expect((v["aspect"] as number) >= 0.25 && (v["aspect"] as number) <= 4).toBe(true);
    }
  });

  it("gives the exact counts of a small space and of packSpace", () => {
    const small = spaceCounts(SMALL);
    expect(small.base).toBe(3n);
    expect(small.meta.map((m) => [m.option.id, m.weight])).toEqual([["m", 9n]]);
    expect(memberListCount(4n, { min: 2, max: 2, ordered: false })).toBe(6n);
    const counts = spaceCounts(packSpace);
    // The orders, then the samples 12 to 192 of log-sweep with rows, skyline, shelf, maxrects or guillotine, or push with 64 values of maxShovesPerItem.
    // Roadmap item k90 adds hole-degree with the order input only and the steps 0 to 32.
    const placements = 1 + SKYLINE_RULES.length * 4 + (1 + SHELF_FITS.length) + MAXRECTS_RULES.length * 4 + GUILLOTINE_CHOICES.length * GUILLOTINE_SPLITS.length * 4;
    expect(counts.base).toBe(BigInt(SORT_ORDERS.length * (181 * placements + 64) + HOLE_DEGREE_MAX_STEPS + 1));
    expect(counts.meta.map((m) => m.option.id)).toEqual(["portfolio", "cell-portfolio", "select", "aspect-fit", "restarts", "bbox", "ruin-recreate", "overlap-min", "anneal", "genetic", "tabu"]);
    expect(counts.meta.find((m) => m.option.id === "cell-portfolio")!.lists).toBe(1n);
  });
});

describe("the draw of a config", () => {
  it("gives each config of a small space the same chance with uniform, and each top option the same chance with option", () => {
    expect(checkSpace(SMALL)).toEqual([]);
    const counts = spaceCounts(SMALL);
    const r = stepRandom(11, "configs");
    const seen = new Map<string, number>();
    for (let i = 0; i < 12000; i++) {
      const c = drawConfig(r, SMALL, counts, "uniform");
      expect(checkConfig(SMALL, c)).toEqual([]);
      const id = configId(SMALL, c);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect(seen.size).toBe(12);
    for (const n of seen.values()) expect(Math.abs(n - 1000)).toBeLessThan(150);
    let meta = 0;
    for (let i = 0; i < 2000; i++) if (drawConfig(r, SMALL, counts, "option").stages["c"] !== undefined) meta++;
    expect(Math.abs(meta - 1000)).toBeLessThan(120);
  });

  it("gives configs of packSpace that checkConfig accepts", () => {
    const counts = spaceCounts(packSpace);
    const r = stepRandom(5, "pack");
    for (let i = 0; i < 40; i++) expect(checkConfig(packSpace, drawConfig(r, packSpace, counts, i % 2 === 0 ? "uniform" : "option"))).toEqual([]);
  });
});

describe("the draw of an input", () => {
  it("keeps each dimension in its range and its supported values, and the generator accepts the params", () => {
    const r = stepRandom(2, "inputs");
    const byName = new Map(corpusFamilies.map((f) => [`${f.name}@${f.version}`, f]));
    for (let i = 0; i < 600; i++) {
      const d = drawInput(r, corpusFamilies);
      const f = byName.get(`${d.family}@${d.version}`)!;
      for (const [name, v] of Object.entries(d.dims)) {
        const dim = f.dimensions.find((x) => x.name === name) as CorpusDimension;
        expect(dimensionSupports(dim, v), `${d.family} ${name}=${String(v)}`).toBe(true);
      }
      if (d.family === "bl-trap") expect([2, 3]).toContain(d.dims["stages"]);
      if (d.family === "ladder") expect(d.dims["rung"]).toBeLessThanOrEqual(8);
      if (d.family === "tall-row") expect(d.dims["ratio"] as number).toBeLessThanOrEqual(32);
      // The knobs keep the 3 decimals of their precision.
      for (const k of ["margin", "gap"]) if (k in d.dims) expect(Math.round((d.dims[k] as number) * 1000) / 1000).toBe(d.dims[k]);
      expect(Number.isInteger(d.seed) && d.seed >= 0).toBe(true);
    }
  });

  it("draws a relative knob with one random number, so the family, the params and the seed stay those of an absolute draw", () => {
    const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
    for (let i = 0; i < 80; i++) {
      const abs = drawInput(stepRandom(9, `k118-${i}`), corpusFamilies);
      const rel = drawInput(stepRandom(9, `k118-${i}`), corpusFamilies, { knobScale: "relative" });
      expect([rel.family, rel.seed]).toEqual([abs.family, abs.seed]);
      for (const [name, v] of Object.entries(abs.dims)) if (name !== "margin" && name !== "gap") expect(rel.dims[name]).toEqual(v);
      if (!("margin" in abs.dims)) continue;
      expect(Object.keys(rel.ratios ?? {}).sort()).toEqual(["gap", "margin"]);
      const done = resolveDraw(rel, registry);
      let file: GeneratedInput;
      try {
        file = registry.generate(rel.family, rel.seed, { ...rel.dims, margin: 0, gap: 0 }, { version: rel.version, set: "sample-space" });
      } catch {
        continue;
      }
      const side = medianSide(file.boxes);
      for (const k of ["margin", "gap"]) {
        const ratio = rel.ratios![k]!;
        expect(ratio === 0 || (ratio >= KNOB_RATIO.min && ratio <= KNOB_RATIO.max)).toBe(true);
        expect(done.dims[k]).toBe(Math.min(32, Math.round(ratio * side * 1000) / 1000));
      }
    }
  });

  it("gives the ratio 0 for a third of the numbers, and a log scale from 0.01 to 0.5 for the rest", () => {
    expect(knobRatio(0)).toBe(0);
    expect(knobRatio(0.3333)).toBe(0);
    expect(knobRatio(1 / 3)).toBe(0.01);
    expect(knobRatio(2 / 3)).toBeCloseTo(Math.sqrt(0.01 * 0.5), 4);
    expect(knobRatio(0.999999)).toBeCloseTo(0.5, 3);
    expect(medianSide([{ w: 2, h: 10 }, { w: 4, h: 6 }])).toBe(5);
    expect(medianSide([{ w: 3, h: 7 }, { w: 1, h: 1 }, { w: 9, h: 9 }])).toBe(5);
    expect(medianSide([])).toBe(0);
  });

  it("keeps the knobs at their defaults with knobs false", () => {
    const r = stepRandom(4, "knobs");
    for (let i = 0; i < 50; i++) {
      const d = drawInput(r, corpusFamilies, { knobs: false });
      expect("margin" in d.dims || "gap" in d.dims).toBe(false);
    }
  });
});

describe("the sample of pairs", () => {
  // The seed 20 draws no config with the time limit. The real clock of a time limit can cut a different member on each pack.
  const options = { n: 4, seed: 20, env: ENV, maxCount: 60, knobs: false } as const;

  it("gives the same records for the same seed, and only configs that the input accepts", () => {
    const a = sampleSpace({ ...options, clock: fakeClock() });
    const b = sampleSpace({ ...options, clock: fakeClock() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.summary.pairs + a.summary.errors.length).toBe(4);
    for (const rec of a.records) {
      expect(rec.strategy).toBe(`space:${configId(packSpace, rec.config)}`);
      expect(rec.nodes).toBeLessThanOrEqual(60 + 100);
      const file = generator(rec.generator.name, rec.generator.version).generate(rec.seed, rec.generator.params as never, "sample-space");
      expect(file.hash).toBe(rec.inputHash);
      const shapes = shapeKindsOf({ boxes: toPackInput(file).items });
      expect(checkConfig(packSpace, rec.config, { shapes })).toEqual([]);
    }
    expect(a.summary.configs.drawn).toBe(a.summary.configs.rejected + a.summary.pairs + a.summary.errors.length);
  });

  it("keeps the first pairs of a larger sample", () => {
    const small = sampleSpace({ ...options, n: 2, clock: fakeClock() });
    const large = sampleSpace({ ...options, n: 3, clock: fakeClock() });
    expect(large.records.slice(0, 2).map((r) => r.outputHash)).toEqual(small.records.map((r) => r.outputHash));
  });

  it("reads the options of the command line", () => {
    expect(sampleOptions(["--n", "60", "--draw", "option", "--no-knobs", "--max-minutes", "5"], ENV)).toMatchObject({ n: 60, draw: "option", knobs: false, maxMinutes: 5, seed: 1 });
    expect(sampleOptions([], ENV).draw).toBe("uniform");
    expect(sampleOptions([], ENV).knobScale).toBe("relative");
    expect(sampleOptions(["--knobs", "absolute"], ENV).knobScale).toBe("absolute");
    expect(() => sampleOptions(["--knobs", "big"], ENV)).toThrow(/relative or absolute/);
    expect(sampleOptions(["--stratify"], ENV).draw).toBe("stratified");
    expect(sampleOptions(["--draw", "stratified"], ENV).draw).toBe("stratified");
    expect(() => sampleOptions(["--stratify", "--draw", "option"], ENV)).toThrow(/does not go with/);
    expect(() => sampleOptions(["--draw", "grid"], ENV)).toThrow(/uniform, option or stratified/);
    expect(() => sampleOptions(["--n", "-1"], ENV)).toThrow(/whole number/);
  });

  it("keeps the uniform draw of the timing mixed: the same configs as before k115, and no strata in the summary", () => {
    // The config ids of the first 4 pairs of the seed 20 come from the sampler of main before k115, with k23, k90, k117 and k79.
    const a = sampleSpace({ ...options, timing: "mixed", clock: fakeClock() });
    expect(a.records.map((r) => configId(packSpace, r.config))).toEqual(["ce6d8bf386fbb8a6", "58da5ef5c70859cc", "c2b0e4f380f82b0d", "d49ccb0bd735314d"]);
    expect(a.summary.draw).toBe("uniform");
    expect(a.summary.timing).toBe("mixed");
    expect("strata" in a.summary).toBe(false);
  });

  it("gives the uniform draw without clock limits by default (k121)", () => {
    const a = sampleSpace({ ...options, clock: fakeClock() });
    expect(a.records.map((r) => configId(packSpace, r.config))).toEqual(DEFAULT_UNIFORM_IDS);
    expect(a.summary.timing).toBe("off");
    expect(a.summary.clockPairs).toBe(0);
    for (const r of a.records) {
      expect(r.clock).toBe(false);
      expect(hasClockLimit(r.config)).toBe(false);
    }
  });

  it("measures only the asked pairs with the option pairs, and each one is the pair of the full sample (k121)", () => {
    const full = sampleSpace({ ...options, clock: fakeClock() });
    const some = sampleSpace({ ...options, pairs: [3, 1], clock: fakeClock() });
    expect(some.records.map((r) => r.pair)).toEqual([3, 1]);
    expect(some.records.map((r) => r.outputHash)).toEqual([full.records[3]!.outputHash, full.records[1]!.outputHash]);
    expect(some.summary.requested).toBe(2);
    expect(some.summary.pairList).toEqual([3, 1]);
    expect("pairList" in full.summary).toBe(false);
    expect(() => sampleSpace({ ...options, pairs: [-1], clock: fakeClock() })).toThrow(/whole numbers/);
  });

  it("reads the options timing and pairs of the command line (k121)", () => {
    expect(sampleOptions([], ENV).timing).toBe("off");
    expect(sampleOptions(["--timing", "mixed"], ENV).timing).toBe("mixed");
    expect(sampleOptions(["--draw", "stratified", "--timing", "stratum"], ENV).timing).toBe("stratum");
    expect(() => sampleOptions(["--timing", "stratum"], ENV)).toThrow(/only with --draw stratified/);
    expect(() => sampleOptions(["--timing", "fast"], ENV)).toThrow(/off, stratum, mixed/);
    expect(sampleOptions(["--pairs", "16,20"], ENV).pairs).toEqual([16, 20]);
    expect(() => sampleOptions(["--pairs", "16;20"], ENV)).toThrow(/whole numbers with commas/);
  });
});

describe("the range of pack.gap on sampled pairs (k118)", () => {
  // The share form of pack.gap is at most 1 by its definition, and 0 or more when the bound is sound.
  for (const knobScale of ["relative", "absolute"] as const) {
    it(`gives 0 <= pack.gap <= 1 on each pair with ${knobScale} knobs`, () => {
      const { records } = sampleSpace({ n: 6, seed: 1, env: ENV, maxCount: 40, draw: "stratified", knobScale, clock: fakeClock(), maxInputTries: 20, maxOverlapMoves: 256 });
      const gaps = records.map((r) => r.measures["pack.gap"]).filter((g): g is number => g !== undefined);
      expect(gaps.length).toBeGreaterThan(0);
      for (const g of gaps) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
      }
      if (knobScale === "relative") for (const r of records) expect(r.knobRatios).toBeDefined();
    });
  }
});

describe("the strata of k115", () => {
  it("gives 23 strata of packSpace, and their counts sum to the count of the space", () => {
    const counts = spaceCounts(packSpace);
    const strata = strataOf(packSpace, counts);
    expect(strata.map((s) => s.id)).toEqual([
      "rows:1",
      "skyline:1",
      "shelf:1",
      "maxrects:1",
      "guillotine:1",
      "push:1",
      "hole-degree:1",
      "portfolio:2",
      "portfolio:3",
      "portfolio:4",
      "portfolio:5",
      "cell-portfolio:cell",
      "cell-portfolio:2",
      "cell-portfolio:3",
      "select:2",
      "aspect-fit:1",
      "restarts:1",
      "bbox:1",
      "ruin-recreate:1",
      "overlap-min:1",
      "anneal:1",
      "genetic:1",
      "tabu:1",
    ]);
    const total = counts.base + counts.meta.reduce((s, m) => s + m.weight, 0n);
    expect(strata.reduce((s, x) => s + x.configs, 0n)).toBe(total);
    expect(strata.filter((s) => s.meta === undefined).reduce((s, x) => s + x.configs, 0n)).toBe(counts.base);
  });

  it("gives the stratum of each named config", () => {
    const of = (name: string): string => stratumOf(packSpace, packSpace.named![name]!);
    expect(of("rows")).toBe("rows:1");
    expect(of("push")).toBe("push:1");
    expect(of("shelf-best")).toBe("shelf:1");
    expect(of("maxrects-bl")).toBe("maxrects:1");
    expect(of("guillotine-bssf-sas-merge")).toBe("guillotine:1");
    expect(of("hole-degree")).toBe("hole-degree:1");
    expect(of("skyline-mw-waste")).toBe("skyline:1");
    expect(of("portfolio")).toBe("cell-portfolio:cell");
    expect(of("portfolio-k2")).toBe("cell-portfolio:2");
    expect(of("aspect-fit-portfolio-k2")).toBe("cell-portfolio:2");
    expect(of("portfolio-area-rows-bl")).toBe("portfolio:2");
    expect(of("select-rows-bl")).toBe("select:2");
    expect(of("aspect-fit")).toBe("aspect-fit:1");
    expect(of("restarts-rows-k16")).toBe("restarts:1");
    expect(of("bbox-skyline")).toBe("bbox:1");
    expect(of("ruin-recreate-skyline-k64")).toBe("ruin-recreate:1");
    expect(of("overlap-min-skyline-k8192")).toBe("overlap-min:1");
  });

  it("draws configs of each stratum of packSpace that checkConfig accepts", () => {
    const counts = spaceCounts(packSpace);
    const r = stepRandom(9, "strata");
    for (const s of strataOf(packSpace, counts))
      for (let i = 0; i < 6; i++) {
        const c = drawStratum(r, packSpace, counts, s);
        expect(checkConfig(packSpace, c)).toEqual([]);
        expect(stratumOf(packSpace, c)).toBe(s.id);
      }
  });

  it("draws each config of a stratum of a small space with the same chance", () => {
    // The small space has no stage placement, so the stage a gives the family.
    const counts = spaceCounts(SMALL);
    const strata = strataOf(SMALL, counts);
    expect(strata.map((s) => [s.id, s.configs])).toEqual([
      ["x:1", 2n],
      ["y:1", 1n],
      ["m:1", 3n],
      ["m:2", 6n],
    ]);
    const r = stepRandom(13, "small strata");
    for (const s of strata) {
      const seen = new Map<string, number>();
      const draws = 600 * Number(s.configs);
      for (let i = 0; i < draws; i++) {
        const c = drawStratum(r, SMALL, counts, s);
        expect(stratumOf(SMALL, c)).toBe(s.id);
        const id = configId(SMALL, c);
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      expect(seen.size).toBe(Number(s.configs));
      for (const n of seen.values()) expect(Math.abs(n - 600)).toBeLessThan(90);
    }
  });

  it("gives the same count of pairs to each stratum, and the same pairs for the same seed", () => {
    const strata = strataOf(packSpace).map((s) => s.id);
    // The pair of overlap-min:1 (k80) gets at most 256 moves, so the test stays fast. Its stratum and its config stay the same.
    const run = (): ReturnType<typeof sampleSpace> => sampleSpace({ n: strata.length, seed: 2, env: ENV, maxCount: 60, knobs: false, draw: "stratified", clock: fakeClock(), maxInputTries: 10, maxOverlapMoves: 256 });
    const a = run();
    expect(a.summary.errors).toEqual([]);
    expect(a.summary.draw).toBe("stratified");
    expect(Object.keys(a.summary.strata!)).toEqual(strata);
    // No sampled input has circles, so the stratum hole-degree:1 gets no pairs. Each other stratum gets 1 pair.
    // The sample is small, and a miss tries only 10 inputs: the full test is slow on the CI runner.
    for (const [id, s] of Object.entries(a.summary.strata!)) expect([id, s.pairs, s.missed]).toEqual(id === "hole-degree:1" ? [id, 0, 1] : [id, 1, 0]);
    expect(a.summary.strata!["rows:1"]!.configs).toBe("905");
    expect(a.records).toHaveLength(strata.length - 1);
    // The sampler drew more than 256 moves for overlap-min:1, and the record has the config with 256 moves that it packed.
    const moves = a.records.filter((rec) => stratumOf(packSpace, rec.config) === "overlap-min:1").map((rec) => rec.config.stages["combine"]?.params?.["iterations"]);
    expect(moves).toEqual([256]);
    // Pair i takes the stratum i modulo 23.
    a.records.forEach((rec) => expect(stratumOf(packSpace, rec.config)).toBe(strata[rec.pair % strata.length]));
    const b = run();
    expect(b.records.map((r) => [r.pair, configId(packSpace, r.config), r.inputHash])).toEqual(a.records.map((r) => [r.pair, configId(packSpace, r.config), r.inputHash]));
  });

  it("closes a stratum that no sampled input accepts after one miss, and counts its later pairs as missed", () => {
    expect(MAX_STRATUM_MISSES).toBe(1);
    const strata = strataOf(packSpace).map((s) => s.id);
    // The pairs at, at + k and at + 2k take hole-degree:1. Only the first of them draws inputs.
    // The other pairs are base configs of the space, so the test packs no composite. A pair tries at most 60 inputs.
    const at = strata.indexOf("hole-degree:1");
    const tries = 60;
    const space = { ...packSpace, stages: packSpace.stages.filter((s) => s.name !== "combine") };
    const run = (n: number): ReturnType<typeof sampleSpace> =>
      sampleSpace({ n, seed: 4, env: ENV, maxCount: 60, knobs: false, draw: "stratified", clock: fakeClock(), space, maxInputTries: tries });
    const one = run(at + 1);
    const k = strataOf(space).length;
    expect(strataOf(space).map((s) => s.id).indexOf("hole-degree:1")).toBe(at);
    const three = run(at + 2 * k + 1);
    const configs = String(HOLE_DEGREE_MAX_STEPS + 1);
    expect(one.summary.strata!["hole-degree:1"]).toEqual({ configs, pairs: 0, missed: 1 });
    expect(three.summary.strata!["hole-degree:1"]).toEqual({ configs, pairs: 0, missed: 3 });
    expect(three.summary.errors).toEqual([]);
    // The first miss draws 60 inputs. Without the cap, the 2 later misses draw 120 more inputs.
    // The 2k - 2 other later pairs draw fewer: each pair has its own random stream, so their inputs do not depend on the cap.
    expect(one.summary.inputs.drawn).toBeGreaterThanOrEqual(tries);
    expect(three.summary.inputs.drawn - one.summary.inputs.drawn).toBeLessThan(2 * tries);
    expect(three.records.some((r) => stratumOf(space, r.config) === "hole-degree:1")).toBe(false);
  });
});

describe("the clock limits of k121", () => {
  it("draws no config with a clock limit in a default stratified sample of 40 configs", () => {
    const plan = drawPlan(packSpace, "stratified");
    expect(plan.timing).toBe("off");
    for (let i = 0; i < 40; i++) {
      const config = drawOf(stepRandom(1, `pair-${i}`), plan, plan.strata[i % plan.strata.length]);
      expect(hasClockLimit(config)).toBe(false);
      expect(checkConfig(packSpace, config)).toEqual([]);
    }
  });

  it("draws no config with a clock limit in a default uniform or option draw", () => {
    for (const draw of ["uniform", "option"] as const) {
      const plan = drawPlan(packSpace, draw);
      for (let i = 0; i < 40; i++) expect(hasClockLimit(drawOf(stepRandom(1, `pair-${i}`), plan, undefined))).toBe(false);
    }
  });

  it("keeps the strata of packSpace without the configs with a clock limit, and adds clock:1 only with the timing stratum", () => {
    const off = drawPlan(packSpace, "stratified");
    const stratum = drawPlan(packSpace, "stratified", "stratum");
    expect(off.strata.map((s) => s.id)).toEqual(strataOf(packSpace).map((s) => s.id));
    expect(stratum.strata.map((s) => s.id)).toEqual([...off.strata.map((s) => s.id), CLOCK_STRATUM]);
    expect(stratum.strata.at(-1)!.configs).toBe(CLOCK_CONFIGS);
    // The configs without a clock limit and the configs with a clock limit sum to the meta configs of packSpace.
    const all = spaceCounts(packSpace).meta.reduce((s, m) => s + m.weight, 0n);
    const free = spaceCounts(clockFree(packSpace)).meta.reduce((s, m) => s + m.weight, 0n);
    expect(free).toBe(CLOCK_FREE_META);
    expect(free + CLOCK_CONFIGS).toBe(all);
    expect(spaceCounts(clockFree(packSpace)).base).toBe(spaceCounts(packSpace).base);
    expect(spaceCounts(clockOnly(packSpace)).meta.map((m) => m.option.id)).toEqual(["portfolio", "cell-portfolio", "restarts"]);
    expect(() => drawPlan(packSpace, "uniform", "stratum")).toThrow(/only with the draw stratified/);
  });

  it("draws only configs with a clock limit from the stratum clock:1, and checkConfig accepts them", () => {
    const plan = drawPlan(packSpace, "stratified", "stratum");
    const clock = plan.strata.at(-1)!;
    for (let i = 0; i < 20; i++) {
      const config = drawOf(stepRandom(1, `pair-${i}`), plan, clock);
      expect(hasClockLimit(config)).toBe(true);
      expect(checkConfig(packSpace, config)).toEqual([]);
    }
  });

  it("gives the same configs as before k121 with the timing mixed", () => {
    const plan = drawPlan(packSpace, "stratified", "mixed");
    const counts = spaceCounts(packSpace);
    const strata = strataOf(packSpace, counts);
    for (let i = 0; i < 23; i++) {
      expect(drawOf(stepRandom(1, `pair-${i}`), plan, plan.strata[i % plan.strata.length])).toEqual(drawStratum(stepRandom(1, `pair-${i}`), packSpace, counts, strata[i % strata.length]!));
    }
  });

  it("tells the two counts, and names each pair that fails the gate", () => {
    const pass = determinismLines({ timing: "off", clockPairs: 0, nondeterministicClock: 0, nondeterministicPairs: [] });
    expect(pass).toEqual(["Timing off: 0 pairs with a clock limit. Not deterministic with a clock limit: 0. Without a clock limit: 0."]);
    const fail = determinismLines({ timing: "mixed", clockPairs: 3, nondeterministicClock: 1, nondeterministicPairs: [{ pair: 16, input: "ladder-a", config: "abc" }] });
    expect(fail).toHaveLength(2);
    expect(fail[1]).toBe("The determinism gate (k121) failed: pair 16 (abc on ladder-a).");
  });
});
