import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cellKey,
  corpus,
  PORTFOLIO_FRAME_MS,
  PORTFOLIO_SETS,
  portfolioCell,
  portfolioDefaultMembers,
  portfolioMembers,
  portfolioSetOf,
  spreadBand,
  SPREAD_THRESHOLDS,
  THIN_INPUTS,
  toPackInput,
  type PortfolioSets,
  type SpreadBand,
} from "@mark1russell7/packing";
import { setsOf, tableSource } from "./choose-sets.ts";
import { factsOf } from "./portfolio.ts";
import { parseCorpus } from "./run.ts";
import type { ScreenRecord } from "./screen.ts";

// The cell key and the set table of the per-cell portfolio of k20, part 2. The test reads no time.

const corpusFile = (name: string): string => readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8");

/** The band of the sizes of each generator: the band that `portfolioCell` gives each of its inputs */
function expectedBand(generator: { name: string; params: Record<string, unknown> }): SpreadBand {
  const p = generator.params;
  switch (generator.name) {
    case "rect-grid":
      return p["sizes"] === "heavyTail" ? "heavyTail" : "uniform";
    case "gallery":
      return "identical";
    case "cards":
      return "uniform";
    case "dashboard":
    case "word-cloud":
      return "heavyTail";
    case "edge-cases":
      return p["case"] === "oversize" ? "heavyTail" : p["case"] === "touchObstacles" ? "uniform" : "identical";
    default:
      throw new Error(`No band for the generator ${generator.name}`);
  }
}

describe("the cell key of the per-cell portfolio", () => {
  for (const name of ["pack-screen-v1", "pack-holdout-v1"]) {
    it(`gives each input of ${name} the band of its generator`, () => {
      const file = parseCorpus(corpusFile(name), name);
      const { manifest, inputs } = corpus(file.corpus, file.specs);
      const wrong: string[] = [];
      for (const [i, input] of inputs.entries()) {
        const cell = portfolioCell(toPackInput(input));
        if (cell.spread !== expectedBand(input.generator!)) wrong.push(`${input.id}: ${cell.spread}`);
        expect(cell.shape).toBe(manifest.inputs[i]!.cell.containerShape);
        expect(cell.count).toBe(manifest.inputs[i]!.cell.count);
      }
      expect(wrong).toEqual([]);
    });
  }

  it("bands the spread by the documented thresholds", () => {
    expect(SPREAD_THRESHOLDS).toEqual({ identical: 0.02, uniform: 0.27 });
    expect([0, 0.019, 0.02, 0.269, 0.27, 2].map(spreadBand)).toEqual(["identical", "identical", "uniform", "uniform", "heavyTail", "heavyTail"]);
    expect(cellKey({ shape: "rect", count: "100", spread: "uniform" })).toBe("rect/100/uniform");
  });
});

describe("the holdout corpus", () => {
  it("has the specs of pack-screen-v1 with the new seeds 6 and 7, and holds out each input", () => {
    const screen = parseCorpus(corpusFile("pack-screen-v1"), "pack-screen-v1");
    const holdout = parseCorpus(corpusFile("pack-holdout-v1"), "pack-holdout-v1");
    expect(holdout.heldOut).toBe("all");
    expect(screen.heldOut).toBeUndefined();
    expect(holdout.specs.map((s) => ({ ...s, seeds: [] }))).toEqual(screen.specs.map((s) => ({ ...s, seeds: [] })));
    expect(new Set(holdout.specs.flatMap((s) => s.seeds))).toEqual(new Set([6, 7]));
    expect(holdout.specs.reduce((n, s) => n + s.seeds.length, 0)).toBe(522);
  });
});

describe("the set table", () => {
  /** This function gives one input of `rect-grid` with identical sizes. */
  const input = (count: number, containerShape = "rect"): ReturnType<typeof toPackInput> => {
    const { inputs } = corpus("t", [{ generator: "rect-grid", version: 1, params: { containerShape, sizes: "identical", count }, seeds: [1] }]);
    return toPackInput(inputs[0]!);
  };

  it("names the run of its records, and gives each cell that is not thin its sets of 1, 2 and 3 with their training scores", () => {
    expect(PORTFOLIO_SETS.source).toMatchObject({ corpus: "pack-screen-v1", run: "40652567756", frameMs: PORTFOLIO_FRAME_MS });
    for (const group of [PORTFOLIO_SETS.all, ...Object.values(PORTFOLIO_SETS.shapes), ...Object.values(PORTFOLIO_SETS.cells)]) {
      expect(group.thin).toBe(group.inputs < THIN_INPUTS);
      if (group.thin) continue;
      for (const k of ["1", "2", "3"] as const) {
        expect(group.sets![k]).toHaveLength(Number(k));
        expect(group.train![k].inputs).toBe(group.inputs);
        for (const id of group.sets![k]) expect(PORTFOLIO_SETS.entries[id]).toBeDefined();
      }
      expect(group.sets!["2"]).toEqual(group.sets!["3"].slice(0, 2));
      expect(group.defaultMembers).toBeGreaterThanOrEqual(1);
      const medians = group.prefixMedianMs!;
      for (let p = 2; p <= group.defaultMembers!; p++) expect(medians[`${p}` as "2"]).toBeLessThanOrEqual(PORTFOLIO_FRAME_MS);
      if (group.defaultMembers! < 3) expect(medians[`${group.defaultMembers! + 1}` as "2"]).toBeGreaterThan(PORTFOLIO_FRAME_MS);
    }
  });

  it("looks up the cell, then the shape, then the fixed default", () => {
    const table: PortfolioSets = {
      ...PORTFOLIO_SETS,
      entries: { a: { id: "a", strategy: "shelf" }, b: { id: "b", strategy: "rows" }, c: { id: "c", strategy: "skyline" } },
      all: { inputs: 30, thin: false, sets: { "1": ["c"], "2": ["c", "a"], "3": ["c", "a", "b"] }, defaultMembers: 3 },
      shapes: { rect: { inputs: 30, thin: false, sets: { "1": ["b"], "2": ["b", "a"], "3": ["b", "a", "c"] }, defaultMembers: 1 } },
      cells: { "rect/10/identical": { inputs: 20, thin: false, sets: { "1": ["a"], "2": ["a", "b"], "3": ["a", "b", "c"] }, defaultMembers: 2 }, "rect/100/identical": { inputs: 5, thin: true } },
    };
    expect(portfolioSetOf(input(10), table).source).toBe("cell");
    expect(portfolioMembers(input(10), 2, table).map((m) => m.id)).toEqual(["a", "b"]);
    // A thin cell and an unknown cell use the set of the shape
    expect(portfolioSetOf(input(100), table)).toMatchObject({ key: "rect/100/identical", source: "shape" });
    expect(portfolioSetOf(input(1000), table).source).toBe("shape");
    expect(portfolioMembers(input(1000), 3, table).map((m) => m.id)).toEqual(["b", "a", "c"]);
    // A shape without sets uses the fixed default
    expect(portfolioSetOf(input(10, "circle"), table).source).toBe("default");
    expect(portfolioDefaultMembers(input(10), undefined, table)).toBe(2);
    expect(portfolioDefaultMembers(input(10, "circle"), 2, table)).toBe(2);
    expect(portfolioDefaultMembers(input(1000), undefined, table)).toBe(1);
    expect(() => portfolioMembers(input(10), 4, table)).toThrow(RangeError);
  });

  it("gives a group with fewer than 12 inputs no set, and the default count by the frame budget", () => {
    const records: ScreenRecord[] = [];
    for (let i = 0; i < 12; i++) {
      const fills: Record<string, number> = { A: 0.5, B: 0.9, C: 0.7 };
      for (const [id, ms] of [
        ["A", 10],
        ["B", 30],
        ["C", 100],
      ] as const)
        records.push({ strategy: id, input: `x${i}/s1`, measures: { "pack.overflow.excessArea": 0, "pack.fill": fills[id]! }, hard: {}, ms });
    }
    const facts = [...factsOf(["A", "B", "C"], records).values()];
    expect(setsOf(["A", "B", "C"], facts.slice(0, 11))).toEqual({ inputs: 11, thin: true });
    const g = setsOf(["A", "B", "C"], facts);
    // B is the oracle of each input. A ties C on the regrets and the win share, and A is faster.
    expect(g.sets!["3"]).toEqual(["B", "A", "C"]);
    expect(g.prefixMedianMs).toEqual({ "1": 30, "2": 40, "3": 140 });
    expect(g.defaultMembers).toBe(2);
    expect(g.train!["1"]).toMatchObject({ inputs: 12, winShare: 1, fillRegret: 0, msMean: 30 });
    expect(tableSource({ ...PORTFOLIO_SETS, cells: { "rect/10/uniform": g } })).toContain("export const PORTFOLIO_SETS: PortfolioSets = {");
  });
});
