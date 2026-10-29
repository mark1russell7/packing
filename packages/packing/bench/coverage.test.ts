import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { corpus, packSpace, toPackInput } from "@mark1russell7/packing";
import { inputFeatures } from "./input-features.ts";
import { sampleSpace, strataOf } from "./sample-space.ts";
import {
  ACTIVE_SCORE,
  activeCoverage,
  activeFacts,
  activeLines,
  coverage,
  coverageMain,
  coverageOptions,
  equalWeight,
  featureOf,
  featureTable,
  firstOrderIndex,
  fitTree,
  foldScorer,
  familyPrior,
  iqrOf,
  priorShare,
  ACTIVE_SCORES,
  SCORE_CAP,
  foldsOf,
  FORCED_HEAVY,
  FORCED_MEASURE,
  forcedHeavy,
  gridInputFeatures,
  gridOf,
  inputDims,
  levelPosition,
  medianOf,
  pairFeatures,
  pairInput,
  pairInputFeatures,
  predictFeatures,
  predictTree,
  readRecords,
  sampledCoverage,
  sampledDims,
  sampleFacts,
  sampleStrata,
  scoreMeasures,
  strataCoverage,
  strategyFeatures,
  wilson,
  type CoverageManifest,
  type CoverageSummary,
  type CoverageRecord,
  type SampledRecord,
} from "./coverage.ts";

// The space coverage of roadmap item k105, on made-up records. The test reads no time of a run.

/** A made-up corpus: one family with the params size (a, b) and count (10, 100, 1000), and 4 seeds of each spec. */
function madeUp(): { manifest: CoverageManifest; records: CoverageRecord[] } {
  const specs: CoverageManifest["specs"][number][] = [];
  const inputs: { id: string; cell: Record<string, string> }[] = [];
  for (const size of ["a", "b"]) {
    for (const count of [10, 100, 1000]) {
      const seeds = [1, 2, 3, 4];
      specs.push({ generator: "toy", version: 1, params: { size, count }, seeds });
      for (const s of seeds) inputs.push({ id: `toy-v1/toy.${size}.n${count}/s${s}`, cell: { mode: "offline", size } });
    }
  }
  const records: CoverageRecord[] = [];
  for (const strategy of ["rows", "maxrects-bl"]) {
    for (const i of inputs) {
      const size = i.cell["size"]!;
      const count = Number(/\.n(\d+)\//.exec(i.id)![1]);
      const seed = Number(i.id.slice(i.id.lastIndexOf("s") + 1));
      // The fill depends on the strategy and the size. The seed adds a small change.
      const fill = (strategy === "rows" ? 0.6 : 0.8) + (size === "a" ? 0.1 : 0) + seed * 0.001;
      records.push({ strategy, input: i.id, measures: { "pack.fill": fill }, ms: count * (strategy === "rows" ? 0.01 : 0.1) });
    }
  }
  records.push({ strategy: "push", input: inputs[0]!.id, measures: {}, ms: 0, skipped: "unsupported mode: offline" });
  return { manifest: { corpus: "toy-v1", specs, inputs }, records };
}

describe("the dimensions of the inputs", () => {
  it("gives the cell, the family and the params of the spec of each input", () => {
    const { manifest } = madeUp();
    const dims = inputDims(manifest);
    expect(dims.size).toBe(24);
    const one = dims.get("toy-v1/toy.b.n100/s3")!;
    expect(one).toEqual({ spec: "toy-v1/toy.b.n100", family: "toy@1", dims: { mode: "offline", size: "b", family: "toy@1", count: "100" }, params: ["size", "count"] });
  });

  it("refuses a manifest without inputs, and an input that is not the next seed of its spec", () => {
    const { manifest } = madeUp();
    expect(() => inputDims({ ...manifest, inputs: [] })).toThrow(/no inputs/);
    expect(() => inputDims({ ...manifest, inputs: [...manifest.inputs!].reverse() })).toThrow(/not the seed/);
    expect(() => inputDims({ ...manifest, inputs: [...manifest.inputs!, { id: "x/s9" }] })).toThrow(/24 seeds/);
  });
});

describe("the features of a strategy", () => {
  it("gives the stages and the params of a single strategy", () => {
    expect(strategyFeatures("maxrects-bl")).toEqual({
      "stage.combine": "none",
      "stage.order": "height-desc",
      "stage.size-search": "log-sweep",
      "size-search.log-sweep.samples": "48",
      "stage.placement": "maxrects",
      "placement.maxrects.rule": "bl",
      "placement.maxrects.rotate": "false",
      "placement.maxrects.fixedBands": "false",
      "stage.local-search": "none",
    });
  });

  it("gives the meta option, its params and the stages of its one member", () => {
    const f = strategyFeatures("restarts-maxrects-bl-k16");
    expect(f["stage.combine"]).toBe("restarts");
    expect(f["combine.restarts.iterations"]).toBe("16");
    expect(f["placement.maxrects.rule"]).toBe("bl");
  });

  it("gives the names of the members of a meta option with more members", () => {
    expect(strategyFeatures("select-rows-bl")["combine.members"]).toBe("rows,maxrects-bl");
  });

  it("gives only the name of an entry that is not a named config", () => {
    expect(strategyFeatures("my-entry")).toEqual({ strategy: "my-entry" });
  });
});

describe("the table, the tree and the indices", () => {
  it("orders the numeric levels and bins a feature with many levels", () => {
    const f = featureOf("count", "input", ["100", "10", "1000", "10"]);
    expect(f.levels).toEqual(["10", "100", "1000"]);
    expect(f.ordinal).toBe(true);
    expect(f.bins).toEqual([0, 1, 2]);
    const many = featureOf("n", "input", Array.from({ length: 12 }, (_, i) => String(i)));
    expect(many.binCount).toBe(4);
    expect(new Set(many.bins)).toEqual(new Set([0, 1, 2, 3]));
    expect(featureOf("x", "input", ["1", "2", "-"]).ordinal).toBe(false);
  });

  it("drops a feature with one level, and fits a tree that finds the step of a feature", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ features: { a: i < 20 ? "x" : "y", b: "same", c: String(i % 4) }, group: {} }));
    const y = rows.map((_, i) => (i < 20 ? 1 : 5) + (i % 4) * 0.01);
    const table = featureTable(rows, y);
    expect(table.features.map((f) => f.name)).toEqual(["a", "c"]);
    const all = rows.map((_, i) => i);
    const tree = fitTree(table, all, { maxDepth: 1 });
    expect(predictTree(tree, table, 0)).toBeCloseTo(1.015, 6);
    expect(predictTree(tree, table, 39)).toBeCloseTo(5.015, 6);
    expect(fitTree(table, all)).toEqual(fitTree(table, all));
  });

  it("gives the first-order index: 1 for a grouping that explains each value, 0 for a grouping that explains none", () => {
    const y = [1, 1, 3, 3];
    expect(firstOrderIndex(y, (i) => (i < 2 ? "a" : "b"))).toBe(1);
    expect(firstOrderIndex(y, (i) => i % 2)).toBe(0);
    expect(firstOrderIndex([2, 2], () => 0)).toBe(0);
    expect(medianOf([3, 1, 2, 10])).toBe(2.5);
  });

  it("gives the same folds for the same seed, and each unit one fold", () => {
    const units = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const a = foldsOf(units, 3, 7);
    expect(a).toEqual(foldsOf([...units].reverse(), 3, 7));
    expect([...a.values()].sort()).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(a).not.toEqual(foldsOf(units, 3, 8));
  });
});

describe("the coverage", () => {
  const { manifest, records } = madeUp();
  const summary = coverage(records, manifest, { date: "2026-10-28", run: 1, measures: [{ id: "pack.fill", tolerance: 0.02, scale: "linear" }, { id: "ms", tolerance: 0.15, scale: "log" }] });

  it("predicts the made-up measures much better than the median, and covers each cell", () => {
    expect(summary).toMatchObject({ schema: "packing-coverage/1", date: "2026-10-28", run: 1, corpus: "toy-v1", records: 48, inputs: 24, strategies: ["maxrects-bl", "rows"] });
    expect(summary.model).toEqual({ kind: "regression-tree", maxDepth: 12, minLeaf: 3, folds: 5, seed: 1, by: "input", features: "family" });
    const fill = summary.measures[0]!;
    expect(fill.n).toBe(48);
    expect(fill.model.mae).toBeLessThan(0.005);
    expect(fill.baseline.mae).toBeGreaterThan(0.05);
    expect(fill.skill).toBeGreaterThan(0.9);
    // 2 strategies, 2 sizes and 3 counts
    expect(fill.cells).toEqual({ space: 12, withRecords: 12, covered: 12 });
    expect(fill.share).toBe(1);
  });

  it("gives the indices of the features that change the measure", () => {
    const fill = summary.measures[0]!;
    expect(fill.explained.joint).toBeGreaterThan(0.99);
    expect(fill.noise).toBeLessThan(0.01);
    // The strategy changes the fill by 0.2 and the size by 0.1. Thus their indices are near 0.8 and 0.2.
    const of = (name: string) => fill.indices.find((x) => x.feature === name)!;
    expect(of("stage.placement")).toMatchObject({ group: "strategy" });
    expect(of("stage.placement").index).toBeCloseTo(0.8, 2);
    expect(of("size")).toMatchObject({ group: "input" });
    expect(of("size").index).toBeCloseTo(0.2, 2);
    expect(of("count").index).toBe(0);
    expect(fill.explained.strategy).toBeCloseTo(0.8, 2);
    const ms = summary.measures[1]!;
    expect(ms.scale).toBe("log");
    expect(ms.indices[0]!.feature).toBe("count");
  });

  it("counts a cell of the space without records, and gives a lower share", () => {
    const fewer = records.filter((r) => !(r.strategy === "rows" && r.input.includes(".a.n10/")));
    const m = coverage(fewer, manifest, { measures: [{ id: "pack.fill", tolerance: 0.02, scale: "linear" }] }).measures[0]!;
    expect(m.cells).toEqual({ space: 12, withRecords: 11, covered: 11 });
    expect(m.share).toBe(0.9167);
    expect(m.shareOfMeasured).toBe(1);
  });

  it("gives the same summary for the same records and seed, also with folds by spec", () => {
    expect(coverage(records, manifest, { date: "2026-10-28", run: 1, measures: [{ id: "pack.fill", tolerance: 0.02, scale: "linear" }, { id: "ms", tolerance: 0.15, scale: "log" }] })).toEqual(summary);
    const bySpec = coverage(records, manifest, { by: "spec", date: "2026-10-28" });
    expect(bySpec.model.by).toBe("spec");
    expect(bySpec.measures.map((m) => m.id)).toEqual(["pack.gapToBound", "pack.fill", "pack.gap", "pack.overflow.excessArea", "ms"]);
    expect(bySpec.measures[0]!.n).toBe(0);
    expect(bySpec.measures[2]!.n).toBe(0);
  });
});

describe("the held-out test on the whole space of k112", () => {
  const { manifest, records } = madeUp();
  const fill = { id: "pack.fill", tolerance: 0.02, scale: "linear" } as const;

  /** This function gives a made-up sampled pair of a named strategy and an input of the toy family. */
  const pair = (strategy: string, size: string, count: number, fillValue: number): SampledRecord => ({
    strategy: `space:${strategy}`,
    input: `sample-space/toy/${size}.${count}`,
    measures: { "pack.fill": fillValue },
    ms: 1,
    config: packSpace.named![strategy]!,
    generator: { name: "toy", version: 1, params: { size, count } },
    cell: { mode: "offline", size },
  });

  it("gives the Wilson interval of known shares", () => {
    expect(wilson(5, 10)).toEqual({ low: 0.2366, high: 0.7634 });
    expect(wilson(0, 10)).toEqual({ low: 0, high: 0.2775 });
    expect(wilson(10, 10)).toEqual({ low: 0.7225, high: 1 });
    expect(wilson(4, 60)).toEqual({ low: 0.0262, high: 0.1593 });
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it("gives the position of a new value, and the value of predictTree for a row of the table", () => {
    const f = featureOf("count", "input", ["10", "100", "1000"]);
    expect(levelPosition(f, "100")).toBe(1);
    expect(levelPosition(f, "500")).toBe(1.5);
    expect(levelPosition(f, "5")).toBe(-0.5);
    expect(levelPosition(f, "x")).toBeUndefined();
    expect(levelPosition(featureOf("size", "input", ["a", "b"]), "c")).toBeUndefined();
    const rows = Array.from({ length: 40 }, (_, i) => ({ features: { a: i < 20 ? "x" : "y", c: String(i % 4) }, group: {} }));
    const table = featureTable(rows, rows.map((_, i) => (i < 20 ? 1 : 5) + (i % 4)));
    const tree = fitTree(table, rows.map((_, i) => i));
    rows.forEach((r, i) => expect(predictFeatures(tree, table, r.features)).toBe(predictTree(tree, table, i)));
  });

  it("predicts made-up pairs from the grid, also with a count that the grid does not have", () => {
    const sampled = [pair("rows", "a", 10, 0.702), pair("maxrects-bl", "b", 100, 0.803), pair("rows", "b", 500, 0.6), pair("maxrects-bl", "a", 1000, 0.5), { ...pair("rows", "a", 10, 0.7), skipped: "unsupported" }];
    const out = sampledCoverage(records, manifest, sampled, { measures: [fill] });
    expect(out.pairs).toBe(4);
    expect(out.sample).toBeUndefined();
    const m = out.measures[0]!;
    // The tree predicts the first 3 pairs within the tolerance. The fourth pair has a made-up fill far from its prediction of 0.9.
    expect(m).toMatchObject({ id: "pack.fill", n: 4, hits: 3, share: 0.75, wilson: wilson(3, 4) });
    expect(m.mae).toBeGreaterThan(0.09);
    expect(m.baseline.mae).toBeGreaterThan(m.mae);
    expect(sampledCoverage(records, manifest, sampled, { measures: [fill] })).toEqual(out);
  });
});

describe("the strata of the whole space of k115", () => {
  const { manifest, records } = madeUp();
  const fill = { id: "pack.fill", tolerance: 0.02, scale: "linear" } as const;
  const pair = (strategy: string, size: string, count: number, fillValue: number): SampledRecord => ({
    strategy: `space:${strategy}`,
    input: `sample-space/toy/${size}.${count}`,
    measures: { "pack.fill": fillValue },
    ms: 1,
    config: packSpace.named![strategy]!,
    generator: { name: "toy", version: 1, params: { size, count } },
    cell: { mode: "offline", size },
  });

  it("gives the mean of the strata with the same weight, and its interval, on hand cases", () => {
    // One stratum gives the Agresti-Coull interval. For a share of 0.5, it is the Wilson interval.
    expect(equalWeight([{ hits: 5, n: 10 }])).toEqual({ strata: 1, share: 0.5, se: 0.1344, interval: wilson(5, 10) });
    // 0 of 10 and 10 of 10: the adjusted shares are 1.92 / 13.84 and 11.92 / 13.84. Each variance is p (1 - p) / 13.84.
    const z2 = 1.959964 ** 2;
    const p = z2 / 2 / (10 + z2);
    const se = Math.sqrt((2 * p * (1 - p)) / (10 + z2)) / 2;
    const two = equalWeight([
      { hits: 0, n: 10 },
      { hits: 10, n: 10 },
    ]);
    expect(two.share).toBe(0.5);
    expect(two.se).toBeCloseTo(se, 4);
    expect(two.interval).toEqual({ low: 0.3712, high: 0.6288 });
    expect(two.interval.low).toBeCloseTo(0.5 - 1.959964 * se, 4);
    // A stratum without pairs is not in the mean. Equal shares give that share.
    expect(equalWeight([{ hits: 1, n: 4 }, { hits: 0, n: 0 }, { hits: 25, n: 100 }]).share).toBe(0.25);
    expect(equalWeight([{ hits: 1, n: 4 }, { hits: 0, n: 0 }]).strata).toBe(1);
    expect(equalWeight([])).toEqual({ strata: 0, share: 0, se: 0, interval: { low: 0, high: 1 } });
    // A small stratum has a large weight: 1 of 1 and 0 of 99 give 0.5, not 0.01.
    expect(equalWeight([{ hits: 1, n: 1 }, { hits: 0, n: 99 }]).share).toBe(0.5);
  });

  it("centers the interval of the mean on the mean, also for small shares", () => {
    // 0 of 20, 0 of 20 and 1 of 20: the mean is 1/60. The adjusted shares are 1.92 / 23.84, 1.92 / 23.84 and 2.92 / 23.84.
    // Their variances sum to 0.010723, so se = sqrt(0.010723) / 3 = 0.0345. The interval is 0.0167 +- 0.0677, from 0.
    // The mean of the adjusted shares is 0.0945. An interval around it starts at 0.0269, above the mean: the bug of the CI run.
    const small = equalWeight([
      { hits: 0, n: 20 },
      { hits: 0, n: 20 },
      { hits: 1, n: 20 },
    ]);
    expect(small).toEqual({ strata: 3, share: 0.0167, se: 0.0345, interval: { low: 0, high: 0.0843 } });
    // The hits of the 4 measures of the stratified CI run 40805165103, with the old intervals that did not hold their shares.
    const run: Record<string, [number, number][]> = {
      "pack.fill": [[2, 23], [0, 23], [2, 23], [1, 23], [1, 22], [1, 22], [3, 22], [0, 22], [0, 22], [0, 22], [1, 22], [3, 22], [0, 22], [0, 22], [1, 22], [0, 22], [0, 22]],
      "pack.gap": [[1, 21], [0, 20], [0, 23], [0, 21], [0, 20], [1, 20], [0, 17], [0, 17], [1, 17], [0, 20], [0, 20], [0, 20], [2, 17], [0, 21], [1, 19], [0, 22], [0, 20]],
      "pack.overflow.excessArea": [[11, 23], [13, 23], [13, 23], [10, 23], [9, 22], [9, 22], [9, 22], [11, 22], [14, 22], [14, 22], [11, 22], [14, 22], [14, 22], [13, 22], [12, 22], [15, 22], [13, 22]],
      ms: [[4, 23], [0, 23], [6, 23], [4, 23], [6, 22], [9, 22], [2, 22], [1, 22], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22], [1, 22], [4, 22], [0, 22], [3, 22]],
    };
    for (const [id, rows] of Object.entries(run)) {
      const e = equalWeight(rows.map(([hits, n]) => ({ hits, n })));
      expect([id, e.interval.low <= e.share && e.share <= e.interval.high]).toEqual([id, true]);
      expect(e.share).toBeCloseTo(rows.reduce((s, [h, n]) => s + h / n, 0) / rows.length, 4);
      expect(e.interval.high).toBeCloseTo(Math.min(1, e.share + 1.959964 * e.se), 3);
    }
    // Many random strata: the interval always holds the share.
    for (let i = 0; i < 200; i++) {
      const rows = Array.from({ length: 1 + (i % 7) }, (_, j) => {
        const n = 1 + ((i * 7 + j * 13) % 40);
        return { hits: (i * 3 + j * 5) % (n + 1), n };
      });
      const e = equalWeight(rows);
      expect(e.interval.low).toBeLessThanOrEqual(e.share);
      expect(e.share).toBeLessThanOrEqual(e.interval.high);
    }
  });

  it("gives the share of each stratum of the pairs with the errors of the section sampled", () => {
    const sampled = [pair("rows", "a", 10, 0.702), pair("maxrects-bl", "b", 100, 0.803), pair("rows", "b", 500, 0.6), pair("maxrects-bl", "a", 1000, 0.5), { ...pair("rows", "a", 10, 0.7), skipped: "unsupported" }];
    const out = strataCoverage(records, manifest, sampled, { measures: [fill] });
    expect(out.pairs).toBe(4);
    expect(out.draw).toBeNull();
    expect(out.strata.map((s) => s.id).slice(0, 7)).toEqual(["rows:1", "skyline:1", "shelf:1", "maxrects:1", "guillotine:1", "push:1", "hole-degree:1"]);
    // Without the strata of sample.json, the section has the 23 strata of packSpace. Roadmap item k80 adds overlap-min:1, and k26 adds anneal:1, genetic:1 and tabu:1.
    expect(out.strata).toHaveLength(23);
    expect(out.strata.at(-1)!.id).toBe("tabu:1");
    expect(out.strata.filter((s) => s.pairs > 0)).toEqual([
      { id: "rows:1", pairs: 2 },
      { id: "maxrects:1", pairs: 2 },
    ]);
    const m = out.measures[0]!;
    expect(m.strata.find((s) => s.stratum === "rows:1")).toEqual({ stratum: "rows:1", n: 2, hits: 2, share: 1, wilson: wilson(2, 2) });
    expect(m.strata.find((s) => s.stratum === "maxrects:1")).toEqual({ stratum: "maxrects:1", n: 2, hits: 1, share: 0.5, wilson: wilson(1, 2) });
    // A stratum without pairs has no share and no interval: null, not 0.
    expect(m.strata.find((s) => s.stratum === "push:1")).toEqual({ stratum: "push:1", n: 0, hits: 0, share: null, wilson: null });
    expect(m.equal).toEqual(equalWeight([{ hits: 2, n: 2 }, { hits: 1, n: 2 }]));
    expect(m.equal.share).toBe(0.75);
    for (const x of out.measures) expect(x.equal.interval.low <= x.equal.share && x.equal.share <= x.equal.interval.high).toBe(true);
    // The hits of the strata sum to the hits of the section sampled.
    expect(m.strata.reduce((s, x) => s + x.hits, 0)).toBe(sampledCoverage(records, manifest, sampled, { measures: [fill] }).measures[0]!.hits);
  });

  it("reports a stratum that no sampled input accepts as no pairs with its count, and keeps it out of the mean", () => {
    // The stratified sample closed hole-degree:1 after one miss. Its 3 pairs are all missed.
    const sampled = [pair("rows", "a", 10, 0.702), pair("maxrects-bl", "b", 100, 0.803)];
    const facts = { "rows:1": { configs: "905", pairs: 1, missed: 0 }, "maxrects:1": { configs: "18100", pairs: 1, missed: 0 }, "hole-degree:1": { configs: "33", pairs: 0, missed: 3 } };
    const out = strataCoverage(records, manifest, sampled, { measures: [fill] }, undefined, facts);
    expect(out.strata.find((s) => s.id === "hole-degree:1")).toEqual({ id: "hole-degree:1", pairs: 0, configs: "33", missed: 3 });
    expect(out.strata.find((s) => s.id === "rows:1")).toEqual({ id: "rows:1", pairs: 1, configs: "905", missed: 0 });
    // The section has only the strata of sample.json. A stratum of the code that the run did not know has no row: ruin-recreate:1 of k79.
    expect(out.strata.map((s) => s.id)).toEqual(["rows:1", "maxrects:1", "hole-degree:1"]);
    expect(out.measures[0]!.strata.map((s) => s.stratum)).toEqual(["rows:1", "maxrects:1", "hole-degree:1"]);
    expect(strataOf(packSpace).some((s) => s.id === "ruin-recreate:1")).toBe(true);
    // A pair of a stratum that sample.json does not name gets a row after them, without counts.
    const extra = strataCoverage(records, manifest, sampled, { measures: [fill] }, undefined, { "rows:1": facts["rows:1"], "hole-degree:1": facts["hole-degree:1"] });
    expect(extra.strata).toEqual([
      { id: "rows:1", pairs: 1, configs: "905", missed: 0 },
      { id: "hole-degree:1", pairs: 0, configs: "33", missed: 3 },
      { id: "maxrects:1", pairs: 1 },
    ]);
    const m = out.measures[0]!;
    expect(m.strata.find((s) => s.stratum === "hole-degree:1")).toEqual({ stratum: "hole-degree:1", n: 0, hits: 0, share: null, wilson: null });
    expect(m.equal.strata).toBe(2);
    expect(m.equal).toEqual(equalWeight(m.strata.filter((s) => s.n > 0)));
    expect(sampleStrata(JSON.stringify({ strata: facts }))).toEqual(facts);
    expect(sampleStrata(JSON.stringify({ draw: "uniform" }))).toBeUndefined();
  });
});

describe("the input features and the active rounds of k116", () => {
  const fill = { id: "pack.fill", tolerance: 0.02, scale: "linear" } as const;
  const specs = [10, 30].map((count) => ({ generator: "rect-grid", version: 1, params: { count, obstacles: "none" }, seeds: [1, 2, 3, 4] }));
  /** A small real corpus: rect-grid with 10 and 30 items. The fill of a record is 0.5 plus the fill of its input over 4. */
  const real = (): { manifest: CoverageManifest; records: CoverageRecord[] } => {
    const c = corpus("k116-v1", specs);
    const records: CoverageRecord[] = [];
    for (const strategy of ["rows", "maxrects-bl"]) {
      for (const file of c.inputs) {
        const f = Number(inputFeatures(toPackInput(file))["in.fill"]);
        records.push({ strategy, input: file.id, measures: { "pack.fill": 0.5 + f / 4 + (strategy === "rows" ? 0 : 0.1), "pack.overflow.forcedArea": 0 }, ms: 1 });
      }
    }
    return { manifest: c.manifest as unknown as CoverageManifest, records };
  };
  /** This function gives the sampled pairs of a small sample, with a fill and a forced overflow of a known value. */
  const pairs = (knobs: boolean): SampledRecord[] =>
    sampleSpace({ n: 4, seed: 20, env: { node: "v0", os: "test", arch: "x64", runner: "test", cpu: "test", cpus: 1 }, maxCount: 60, knobs, maxOverlapMoves: 256, clock: (() => { let t = 0; return () => t++; })() }).records.map((r, i) => ({
      ...r,
      measures: { ...r.measures, "pack.fill": 0.6, [FORCED_MEASURE]: i % 2 === 0 ? 0.9 : 0 },
    }));

  it("generates the input of a sampled pair again, with and without the knobs, and refuses another hash", () => {
    for (const knobs of [false, true]) {
      for (const r of pairs(knobs)) {
        const input = pairInput(r);
        expect(pairInputFeatures(r, "input")).toEqual(inputFeatures(input));
        expect(pairInputFeatures(r, "family")).toEqual(sampledDims(r));
      }
    }
    const r = pairs(false)[0]!;
    expect(() => pairInput({ ...r, inputHash: "0000000000000000" })).toThrow(/does not come out the same/);
    const { seed: _seed, ...noSeed } = r;
    expect(() => pairInput(noSeed)).toThrow(/no seed/);
  });

  it("models the grid on the input features, and keeps the feature set in the summary", () => {
    const { manifest, records } = real();
    const byFamily = coverage(records, manifest, { measures: [fill] });
    const byInput = coverage(records, manifest, { measures: [fill], features: "input" });
    expect(byFamily.model.features).toBe("family");
    expect(byInput.model.features).toBe("input");
    expect(byInput.features.input).toContain("in.fill");
    expect(byInput.features.input).not.toContain("family");
    // The grid has one family, so the feature family has one level and the table drops it. The params stay.
    expect(byFamily.features.input).toContain("count");
    // The cells of the space do not change with the feature set.
    expect(byInput.measures[0]!.cells.space).toBe(byFamily.measures[0]!.cells.space);
    const grid = gridInputFeatures(manifest, "input");
    expect(grid.size).toBe(8);
    expect(gridInputFeatures(manifest, "family").get(manifest.inputs![0]!.id)).toMatchObject({ family: "rect-grid@1" });
  });

  it("splits the share of the sampled pairs by forced overflow", () => {
    const { manifest, records } = real();
    const sampled = pairs(false);
    const m = sampledCoverage(records, manifest, sampled, { measures: [fill] }).measures[0]!;
    const heavy = sampled.filter((r) => forcedHeavy(r)).length;
    expect(heavy).toBe(2);
    expect(m.forced!.heavy.n + m.forced!.rest.n).toBe(m.n);
    expect(m.forced!.heavy.hits + m.forced!.rest.hits).toBe(m.hits);
    expect(m.forced!.heavy.n).toBe(heavy);
    expect(forcedHeavy({ measures: { [FORCED_MEASURE]: FORCED_HEAVY } })).toBe(true);
    expect(forcedHeavy({ measures: { [FORCED_MEASURE]: 0.49 } })).toBe(false);
    expect(forcedHeavy({ measures: {} })).toBe(false);
  });

  it("scores the candidates by the spread of the fold trees, the same for the same rows", () => {
    const { manifest, records } = real();
    const grid = gridOf(records, manifest, { features: "input" });
    const a = foldScorer(grid, [], { features: "input", by: "spec" });
    const b = foldScorer(grid, [], { features: "input", by: "spec" });
    const sampled = pairs(false);
    const scores = sampled.map((r) => a.score(pairFeatures(r, { features: "input" }).features));
    expect(sampled.map((r) => b.score(pairFeatures(r, { features: "input" }).features))).toEqual(scores);
    for (const s of scores) expect(s).toBeGreaterThanOrEqual(0);
    expect(a.rows).toBe(16);
    // The measured pairs join the rows of the folds.
    expect(foldScorer(grid, sampled, { features: "input", by: "spec" }).rows).toBe(16 + sampled.length);
    expect(scoreMeasures().map((m) => m.id)).not.toContain("ms");
    // The score spread-iqr caps each term at SCORE_CAP. The old score fold-spread has no cap.
    for (const s of scores) expect(s).toBeLessThanOrEqual(SCORE_CAP);
    const old = foldScorer(grid, [], { features: "input", by: "spec" }, "fold-spread");
    expect(sampled.map((r) => old.score(pairFeatures(r, { features: "input" }).features)).every((s) => s >= 0)).toBe(true);
    expect(ACTIVE_SCORES).toEqual(["spread-iqr", "fold-spread"]);
    expect(iqrOf([1, 2, 3, 4, 5])).toBe(2);
    expect(iqrOf([Infinity, 7])).toBe(0);
    expect(iqrOf([])).toBe(0);
  });

  it("weights the families with the prior of the corpus, and reports the families with the weight 0", () => {
    const prior = familyPrior({ corpus: "c", specs: [{ generator: "a", seeds: [1, 2, 3] }, { generator: "b", seeds: [1] }] });
    expect([...prior]).toEqual([
      ["a", 0.75],
      ["b", 0.25],
    ]);
    // a: 1 hit of 2, b: 1 hit of 1, c: not in the corpus. The share is 0.75 · 0.5 + 0.25 · 1.
    const p = priorShare([true, false, true, true], ["a", "a", "b", "c"], prior);
    expect(p).toMatchObject({ share: 0.625, weighted: 3, zero: 1, covered: 1 });
    // The weights are 0.375, 0.375 and 0.25, so the effective count is 1 / 0.34375.
    expect(p.nEff).toBe(2.9);
    // A missing family of the corpus does not count: the share divides by the weight of the families with pairs.
    expect(priorShare([true], ["b"], prior)).toMatchObject({ share: 1, covered: 0.25, weighted: 1, zero: 0 });
    expect(priorShare([true], ["c"], prior)).toEqual({ share: null, wilson: null, nEff: 0, weighted: 0, zero: 1, covered: 0 });
  });

  it("gives the share of each round with the earlier rounds, and the evaluation sample after each round", () => {
    const { manifest, records } = real();
    const sampled = pairs(false);
    const active = sampled.map((r, i) => ({ ...r, round: i < 2 ? 1 : 2 }));
    const out = activeCoverage(records, manifest, active, { measures: [fill], features: "input" }, sampled, { rounds: 2, pool: 80, score: ACTIVE_SCORE, features: "input" });
    expect(out).toMatchObject({ pairs: 4, features: "input", evalPairs: 4, facts: { rounds: 2, pool: 80 } });
    expect(out.rounds.map((r) => [r.round, r.pairs])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    const r1 = out.rounds[0]!.measures[0]!;
    expect(r1.n).toBe(2);
    expect(r1.share).toBe(r4(r1.hits / 2));
    // After round 2, the model has learned on the pairs of the evaluation sample, so it predicts them at least as well as at the start.
    const after = out.rounds[1]!.measures[0]!.after!;
    expect(after.n).toBe(4);
    expect(after.mae).toBeLessThanOrEqual(out.start![0]!.mae + 1e-9);
    expect(activeCoverage(records, manifest, active, { measures: [fill], features: "input" }, sampled)).toEqual({ ...out, facts: undefined } as never);
    const lines = activeLines(out);
    expect(lines[0]).toMatch(/^pack\.fill, active \(input features\): evaluation share .* before\. round 1: /);
    expect(activeFacts(JSON.stringify({ draw: "active", active: { rounds: 4, pool: 8, score: "fold-spread", features: "family", perRound: [] } }))).toEqual({ rounds: 4, pool: 8, score: "fold-spread", features: "family" });
    expect(activeFacts(JSON.stringify({ draw: "uniform" }))).toBeUndefined();
  });
});

/** This function rounds a value to 4 decimals. */
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

describe("the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "coverage-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the options and refuses a bad value", () => {
    expect(coverageOptions(["--run", "12", "--date", "2026-10-28", "--by", "spec"])).toEqual({ folds: 5, seed: 1, by: "spec", features: "family", run: 12, date: "2026-10-28" });
    expect(() => coverageOptions(["--by", "seed"])).toThrow(/input or spec/);
    expect(() => coverageOptions(["--folds", "1"])).toThrow(/2 or more/);
    expect(() => coverageOptions(["--date", "28.10.2026"])).toThrow(/YYYY-MM-DD/);
  });

  it("writes the summary of the files of a run", () => {
    const { manifest, records } = madeUp();
    writeFileSync(join(dir, "records.jsonl"), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
    writeFileSync(join(dir, "corpus.json"), JSON.stringify(manifest));
    const out = join(dir, "out", "coverage.json");
    const summary = coverageMain(["--records", join(dir, "records.jsonl"), "--corpus", join(dir, "corpus.json"), "--out", out, "--date", "2026-10-28"]);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(JSON.parse(JSON.stringify(summary)));
    expect(readRecords("\n{\"strategy\":\"a\",\"input\":\"b\"}\n\n")).toHaveLength(1);
    expect(() => coverageMain(["--records", "x"])).toThrow(/--corpus/);
  });

  it("adds the section sampled with --sample, and keeps the summary without it", () => {
    const { manifest, records } = madeUp();
    writeFileSync(join(dir, "records.jsonl"), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
    writeFileSync(join(dir, "corpus.json"), JSON.stringify(manifest));
    const sample = join(dir, "sample");
    mkdirSync(sample, { recursive: true });
    const one: SampledRecord = { strategy: "space:rows", input: "x", measures: { "pack.fill": 0.7 }, ms: 1, config: packSpace.named!["rows"]!, generator: { name: "toy", version: 1, params: { size: "a", count: 10 } }, cell: { mode: "offline", size: "a" } };
    writeFileSync(join(sample, "records.jsonl"), `${JSON.stringify(one)}\n`);
    const facts = { seed: 1, draw: "uniform", requested: 1, configs: { rate: 0 }, inputs: { rejected: 0 }, hard: { pairs: 0 }, nondeterministic: 0, composition: { none: 1 } };
    writeFileSync(join(sample, "sample.json"), JSON.stringify(facts));
    const base = ["--records", join(dir, "records.jsonl"), "--corpus", join(dir, "corpus.json"), "--out", join(dir, "s.json"), "--date", "2026-10-28"];
    const plain = coverageMain(base);
    const withSample = coverageMain([...base, "--sample", sample]);
    expect("sampled" in plain).toBe(false);
    expect("strata" in plain).toBe(false);
    expect(withSample).toMatchObject({ ...JSON.parse(JSON.stringify(plain)), sampled: { pairs: 1, sample: { seed: 1, draw: "uniform", configRejectionRate: 0, hardPairs: 0 } } });
    // The section sampled is the same as before k115. The section strata goes next to it.
    const s = withSample as CoverageSummary;
    expect(JSON.stringify(s.sampled)).toBe(JSON.stringify(sampledCoverage(records, manifest, [one], {}, sampleFacts(JSON.stringify(facts)))));
    expect(Object.keys(s.sampled!)).toEqual(["pairs", "sample", "measures"]);
    expect(s.strata).toMatchObject({ pairs: 1, draw: "uniform" });
    expect(s.strata!.strata.find((x) => x.id === "rows:1")).toEqual({ id: "rows:1", pairs: 1 });
    // The pair has only a fill and a time. A measure without a value has no stratum with pairs.
    expect(s.strata!.measures.map((m) => m.equal.strata)).toEqual([0, 1, 0, 0, 1]);
    expect(() => coverageMain([...base, "--sample", join(dir, "none")])).toThrow(/no records.jsonl/);
  });

  it("writes a note and no error for a run with fewer records than --min-records", () => {
    const { manifest, records } = madeUp();
    writeFileSync(join(dir, "few.jsonl"), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
    writeFileSync(join(dir, "corpus.json"), JSON.stringify(manifest));
    const out = join(dir, "note.json");
    const note = coverageMain(["--records", join(dir, "few.jsonl"), "--corpus", join(dir, "corpus.json"), "--out", out, "--min-records", "50"]);
    expect(note).toEqual({ schema: "packing-coverage/1", corpus: "toy-v1", records: 48, note: "The run has 48 measured records, fewer than 50. The coverage needs more records." });
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(note);
    expect("measures" in coverageMain(["--records", join(dir, "few.jsonl"), "--corpus", join(dir, "corpus.json"), "--out", out, "--min-records", "48"])).toBe(true);
    expect(() => coverageMain(["--records", join(dir, "few.jsonl"), "--corpus", join(dir, "corpus.json"), "--out", out, "--min-records", "-1"])).toThrow(/0 or more/);
  });
});
