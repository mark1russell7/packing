import { describe, expect, it } from "vitest";
import { corpus, packSpace, toPackInput } from "@mark1russell7/packing";
import { checkConfig, configId, shapeKindsOf } from "@mark1russell7/layout-contract";
import { activeOptions, activeSample, candidatePool } from "./active.ts";
import { activeCoverage, pairInput, type CoverageManifest, type CoverageRecord } from "./coverage.ts";
import { inputFeatures } from "./input-features.ts";
import { strataOf } from "./sample-space.ts";

// The active draw of roadmap item k116. The tests use a fake clock and a small grid, so they read no time of a run.

const ENV = { node: "v0", os: "test", arch: "x64", runner: "test", cpu: "test", cpus: 1 };

/** This function gives a fake clock: each call gives the next whole number. */
const fakeClock = (): (() => number) => {
  let t = 0;
  return () => t++;
};

/** A small real grid: rect-grid with 10 and 30 items, 2 strategies, and a fill that follows the fill of the input. */
function grid(): { manifest: CoverageManifest; records: CoverageRecord[] } {
  const c = corpus("k116-v1", [10, 30].map((count) => ({ generator: "rect-grid", version: 1, params: { count }, seeds: [1, 2, 3] })));
  const records: CoverageRecord[] = [];
  for (const strategy of ["rows", "maxrects-bl"]) {
    for (const file of c.inputs) {
      const f = Number(inputFeatures(toPackInput(file))["in.fill"]);
      records.push({ strategy, input: file.id, measures: { "pack.fill": 0.5 + f / 4, "pack.gap": 0.1, "pack.overflow.excessArea": 0 }, ms: 1 });
    }
  }
  return { manifest: c.manifest as unknown as CoverageManifest, records };
}

describe("the active draw", () => {
  const base = { n: 4, seed: 20, env: ENV, maxCount: 60, knobs: false, rounds: 2, poolFactor: 3 } as const;

  it("draws a stratified pool of inputs and configs that checkConfig accepts, the same for the same seed", () => {
    const counts = () => ({ configsDrawn: 0, configsRejected: 0, inputsDrawn: 0, inputsRejected: 0, missed: 0, configReasons: {}, inputReasons: {}, strataMissed: {} });
    const opts = { seed: 20, space: packSpace, maxCount: 60, knobs: false, coverage: { features: "input" as const } };
    const a = candidatePool(36, opts, counts());
    const b = candidatePool(36, opts, counts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const strata = strataOf(packSpace).map((s) => s.id);
    for (const c of a) {
      expect(c.stratum).toBe(strata[c.index % strata.length]);
      expect(c.id).toBe(configId(packSpace, c.config));
      expect(c.features["in.count"]).toBeDefined();
    }
    expect(a.length).toBeGreaterThan(18);
  });

  it("measures the pairs in rounds, the same for the same seed and grid, and puts each round and score on its records", () => {
    const g = grid();
    const run = (): ReturnType<typeof activeSample> => activeSample({ ...base, ...g, clock: fakeClock(), coverage: { features: "input" } });
    const a = run();
    const b = run();
    expect(a.records.map((r) => r.outputHash)).toEqual(b.records.map((r) => r.outputHash));
    expect(a.records.map((r) => r.ms)).toEqual(b.records.map((r) => r.ms));
    expect(a.summary.pairs + a.summary.errors.length).toBe(4);
    expect(a.records.map((r) => r.round)).toEqual([1, 1, 2, 2]);
    expect(a.records.map((r) => r.pair)).toEqual([0, 1, 2, 3]);
    expect(new Set(a.records.map((r) => r.candidate)).size).toBe(4);
    expect(a.summary).toMatchObject({ draw: "active", requested: 4, active: { rounds: 2, poolFactor: 3, score: "fold-spread", features: "input", by: "spec" } });
    expect(a.summary.active.perRound.map((r) => [r.round, r.quota, r.pairs])).toEqual([
      [1, 2, 2],
      [2, 2, 2],
    ]);
    for (const rec of a.records) {
      // Each record comes out the same from its generator, and its config goes with its input.
      const input = pairInput(rec);
      expect(checkConfig(packSpace, rec.config, { shapes: shapeKindsOf({ boxes: input.items }) })).toEqual([]);
      expect(rec.strategy).toBe(`space:${configId(packSpace, rec.config)}`);
    }
    // In a round, the scores go down: the round takes the highest scores first.
    const first = a.records.filter((r) => r.round === 1).map((r) => r.score);
    expect([...first].sort((x, y) => y - x)).toEqual(first);
    // The coverage reads the rounds of the records.
    const cov = activeCoverage(g.records, g.manifest, a.records, { features: "input" });
    expect(cov.rounds.map((r) => r.pairs)).toEqual([2, 2]);
  });

  it("reads the options of the command line", () => {
    expect(activeOptions(["--draw", "active", "--n", "60", "--rounds", "3", "--pool", "5", "--features", "input"], ENV)).toMatchObject({ n: 60, rounds: 3, poolFactor: 5, coverage: { features: "input", by: "spec" } });
    expect(activeOptions([], ENV)).toMatchObject({ n: 400, rounds: 4, poolFactor: 20, coverage: { features: "family", by: "spec" } });
    expect("draw" in activeOptions([], ENV)).toBe(false);
    expect(() => activeOptions(["--stratify"], ENV)).toThrow(/always stratified/);
    expect(() => activeOptions(["--features", "cell"], ENV)).toThrow(/family or input/);
    expect(() => activeOptions(["--by", "seed"], ENV)).toThrow(/input or spec/);
  });
});
