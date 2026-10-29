import { describe, expect, it } from "vitest";
import { corpus, packSpace, toPackInput } from "@mark1russell7/packing";
import { checkConfig, configId, shapeKindsOf } from "@mark1russell7/layout-contract";
import { activeOptions, activeSample, candidatePool, nextPick, pickKey, type Candidate } from "./active.ts";
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
  // The cap on the moves of overlap-min (k80) keeps each pack fast.
  const base = { n: 4, seed: 20, env: ENV, maxCount: 60, knobs: false, rounds: 2, poolFactor: 3, maxInputTries: 10, maxOverlapMoves: 256 } as const;

  it("draws a stratified pool of inputs and configs that checkConfig accepts, the same for the same seed", () => {
    const counts = () => ({ configsDrawn: 0, configsRejected: 0, inputsDrawn: 0, inputsRejected: 0, missed: 0, configReasons: {}, inputReasons: {}, strataMissed: {} });
    const opts = { seed: 20, space: packSpace, maxCount: 60, knobs: false, coverage: { features: "input" as const }, maxInputTries: 10, maxOverlapMoves: 256 };
    const a = candidatePool(36, opts, counts());
    const b = candidatePool(36, opts, counts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const strata = strataOf(packSpace).map((s) => s.id);
    for (const c of a) {
      expect(c.stratum).toBe(strata[c.index % strata.length]);
      expect(c.id).toBe(configId(packSpace, c.config));
      expect(c.features["in.count"]).toBeDefined();
      // The pool keeps the cap on the moves of overlap-min (k80).
      const combine = c.config.stages["combine"];
      if (combine?.option === "overlap-min") expect(combine.params?.["iterations"]).toBeLessThanOrEqual(256);
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
    expect(a.summary).toMatchObject({ draw: "active", requested: 4, active: { rounds: 2, poolFactor: 3, score: "spread-iqr", features: "input", by: "spec" } });
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
    // A quota of 2 over the strata of packSpace gives a cap of 1 pair for each stratum in a round.
    const strata = strataOf(packSpace).map((s) => s.id);
    for (const k of [1, 2]) {
      const round = a.records.filter((r) => r.round === k).map((r) => strata[r.candidate % strata.length]);
      expect(new Set(round).size).toBe(round.length);
    }
    // The old score stays selectable.
    expect(activeSample({ ...base, ...g, clock: fakeClock(), coverage: { features: "input" }, score: "fold-spread" }).summary.active.score).toBe("fold-spread");
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
    expect(activeOptions([], ENV).score).toBe("spread-iqr");
    expect(activeOptions(["--score", "fold-spread"], ENV).score).toBe("fold-spread");
    expect(() => activeOptions(["--score", "max"], ENV)).toThrow(/spread-iqr or fold-spread/);
  });

  it("picks from the highest score down, with a cap for each stratum and one pick for each stratum and generator while others are left", () => {
    const cand = (index: number, stratum: string, family: string): Candidate => ({ index, stratum, draw: { family } as Candidate["draw"], config: {} as Candidate["config"], id: String(index), features: {} });
    const order = [cand(0, "a", "g1"), cand(1, "a", "g1"), cand(2, "a", "g2"), cand(3, "b", "g1")].map((c) => ({ c, s: 4 - c.index }));
    const picks = { strata: new Map<string, number>(), pairs: new Set<string>() };
    const pick = (cap: number, taken: Set<number>): number | undefined => nextPick(order, taken, picks, cap)?.c.index;
    expect(pick(2, new Set())).toBe(0);
    picks.strata.set("a", 1);
    picks.pairs.add(pickKey(order[0]!.c));
    // Candidate 1 repeats the stratum and the generator of candidate 0, so candidate 2 goes first.
    expect(pick(2, new Set([0]))).toBe(2);
    // With a cap of 1, the stratum a is full, so candidate 3 goes first.
    expect(pick(1, new Set([0]))).toBe(3);
    // When only the repeats are left, the rules give way.
    expect(pick(1, new Set([0, 2, 3]))).toBe(1);
    expect(pick(1, new Set([0, 1, 2, 3]))).toBeUndefined();
  });
});
