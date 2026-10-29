import { describe, expect, it } from "vitest";
import { corpusFamilies, generator, MAXRECTS_RULES, packSpace, SHELF_FITS, SKYLINE_RULES, SORT_ORDERS, toPackInput } from "@mark1russell7/packing";
import {
  checkConfig,
  checkSpace,
  configId,
  dimensionSupports,
  shapeKindsOf,
  stepRandom,
  STRATEGY_SPACE_SCHEMA,
  type CorpusDimension,
  type SpaceParam,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import { drawConfig, drawInput, drawParams, memberListCount, paramCount, pickWeighted, sampleOptions, sampleSpace, spaceCounts, uniformBig } from "./sample-space.ts";

// The sampler of the whole space of roadmap item k112. The tests use a fake clock, so they read no time of a run.

const ENV = { node: "v0", os: "test", arch: "x64", runner: "test", cpu: "test", cpus: 1 };

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
    // The orders, then the samples 12 to 192 of log-sweep with rows, skyline, shelf or maxrects, or push with 64 values of maxShovesPerItem
    const placements = 1 + SKYLINE_RULES.length * 4 + (1 + SHELF_FITS.length) + MAXRECTS_RULES.length * 4;
    expect(counts.base).toBe(BigInt(SORT_ORDERS.length * (181 * placements + 64)));
    expect(counts.meta.map((m) => m.option.id)).toEqual(["portfolio", "cell-portfolio", "select", "aspect-fit", "restarts", "bbox"]);
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

  it("keeps the knobs at their defaults with knobs false", () => {
    const r = stepRandom(4, "knobs");
    for (let i = 0; i < 50; i++) {
      const d = drawInput(r, corpusFamilies, { knobs: false });
      expect("margin" in d.dims || "gap" in d.dims).toBe(false);
    }
  });
});

describe("the sample of pairs", () => {
  const options = { n: 4, seed: 3, env: ENV, maxCount: 60, knobs: false } as const;

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
    expect(() => sampleOptions(["--draw", "grid"], ENV)).toThrow(/uniform or option/);
    expect(() => sampleOptions(["--n", "-1"], ENV)).toThrow(/whole number/);
  });
});
