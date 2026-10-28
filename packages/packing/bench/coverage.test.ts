import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  coverage,
  coverageMain,
  coverageOptions,
  featureOf,
  featureTable,
  firstOrderIndex,
  fitTree,
  foldsOf,
  inputDims,
  medianOf,
  predictTree,
  readRecords,
  strategyFeatures,
  type CoverageManifest,
  type CoverageRecord,
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
    expect(summary.model).toEqual({ kind: "regression-tree", maxDepth: 12, minLeaf: 3, folds: 5, seed: 1, by: "input" });
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
    expect(bySpec.measures.map((m) => m.id)).toEqual(["pack.fill", "pack.gap", "pack.overflow.excessArea", "ms"]);
    expect(bySpec.measures[1]!.n).toBe(0);
  });
});

describe("the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "coverage-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the options and refuses a bad value", () => {
    expect(coverageOptions(["--run", "12", "--date", "2026-10-28", "--by", "spec"])).toEqual({ folds: 5, seed: 1, by: "spec", run: 12, date: "2026-10-28" });
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
});
