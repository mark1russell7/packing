import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strategies } from "@mark1russell7/packing";
import {
  checkPrediction,
  mergeRuns,
  parseCorpus,
  parsePredictions,
  recordLines,
  runBench,
  strategyIds,
  summaryMarkdown,
  type BenchEnv,
  type BenchRecord,
} from "./run.ts";

// The runner of the benchmark on the tiny corpus smoke-v1, with one timed run. The test reads no time: CI gives the times.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const corpusFile = (name: string): string => readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8");
const smoke = parseCorpus(corpusFile("smoke-v1"), "smoke-v1");
const run = () => runBench({ corpus: smoke, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, commit: "abcdef0" });
const first = run();
const second = run();

/** The fields of `layout-record/1` in `docs/FORMAT.md`. */
const FORMAT_FIELDS = ["schema", "stage", "step", "strategy", "options", "corpus", "input", "inputHash", "set", "seed", "nodes", "edges", "measures", "hard", "tolerance", "deterministic", "prediction", "ms", "commit"];

/** A record without its times. */
const timeless = (r: BenchRecord): unknown => {
  const { ms: _ms, msRuns: _runs, ...rest } = r;
  const measures = { ...r.measures };
  delete measures["pack.search.ms"];
  return { ...rest, measures };
};

describe("the benchmark runner", () => {
  it("writes one parsable layout-record/1 line for each record", () => {
    const lines = recordLines(first.records).split("\n");
    expect(lines.at(-1)).toBe("");
    const parsed = lines.slice(0, -1).map((line) => JSON.parse(line) as BenchRecord);
    expect(parsed).toHaveLength(first.records.length);
    expect(parsed.length).toBeGreaterThan(0);
    for (const r of parsed) {
      for (const field of FORMAT_FIELDS) expect(r, field).toHaveProperty(field);
      expect(r.schema).toBe("layout-record/1");
      expect(r.stage).toBe("pack");
      expect(r.corpus).toBe("smoke-v1");
      expect(r.set).toBe("smoke-v1");
      expect(r.prediction).toBe("p-test");
      expect(r.commit).toBe("abcdef0");
      expect(r.tolerance).toEqual({ overlap: 0.001 });
      expect(r.msRuns).toHaveLength(1);
      expect(r.placementsHash).toMatch(/^[0-9a-f]{16}$/);
      const entry = first.manifest.inputs.find((e) => e.id === r.input);
      expect(entry?.hash).toBe(r.inputHash);
      for (const value of Object.values(r.measures)) expect(Number.isFinite(value)).toBe(true);
      expect(Object.keys(r.measures)).toEqual(expect.arrayContaining(["pack.area", "pack.fill", "pack.overflow", "pack.aspectError", "pack.order.inversions"]));
    }
  });

  it("gives 0 hard breaks, determinism and no error for each supported pair", () => {
    expect(first.run.errors).toEqual([]);
    for (const r of first.records) {
      expect(r.hard, `${r.strategy} ${r.input}`).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      expect(r.deterministic, `${r.strategy} ${r.input}`).toBe(true);
    }
  });

  it("gives the same placements and measures in two runs", () => {
    expect(second.records.map(timeless)).toEqual(first.records.map(timeless));
    for (const [id, outputs] of first.outputs) {
      for (const [input, output] of outputs) expect(second.outputs.get(id)?.get(input)?.placements, `${id} ${input}`).toEqual(output.placements);
    }
  });

  it("skips each unsupported pair, and gives each other pair one record", () => {
    const inputs = first.manifest.inputs.map((e) => e.id);
    for (const s of strategies) {
      for (const input of inputs) {
        const records = first.records.filter((r) => r.strategy === s.id && r.input === input).length;
        const skips = first.run.skipped.filter((k) => k.strategy === s.id && k.input === input).length;
        expect(records + skips, `${s.id} ${input}`).toBe(1);
      }
    }
    // The corpus is offline, and push supports only the mode incremental
    expect(first.records.filter((r) => r.strategy === "push")).toEqual([]);
    expect(first.run.skipped.filter((k) => k.strategy === "push").every((k) => k.dimension === "mode" && k.value === "offline")).toBe(true);
    // No strategy supports a circle container yet
    const circle = inputs.find((id) => id.includes(".circle."))!;
    expect(first.records.filter((r) => r.input === circle)).toEqual([]);
    // rows does not go around obstacles
    expect(first.run.skipped.some((k) => k.strategy === "rows" && k.dimension === "obstacleMove")).toBe(true);
  });

  it("gives the search measures of a free size from the trace", () => {
    const free = first.records.find((r) => r.strategy === "shelf" && r.input.includes(".freeAspect."))!;
    expect(free.measures["pack.search.widths"]).toBeGreaterThan(0);
  });

  it("writes a summary with each strategy, the skipped cells and the prediction", () => {
    const md = summaryMarkdown(first.run, first.records, []);
    for (const s of strategies) expect(md).toContain(`| ${s.id} |`);
    expect(md).toContain("## Skipped cells");
    expect(md).toContain("`mode` = `offline`");
    expect(md).toContain("Each record has 0 hard breaks");
    expect(md).toContain("has no line with the id `p-test`");
    expect(md).toContain("No input of the corpus has a base");
  });

  it("checks a prediction against the records", () => {
    const predictions = parsePredictions(
      `${JSON.stringify({ id: "p-test", strategy: "shelf", set: "smoke-v1", measure: "pack.overflow", expected: 1, reason: "One box of the case oversize is too wide." })}\n\n`,
    );
    expect(predictions).toHaveLength(1);
    expect(checkPrediction(predictions[0]!, first.records)).toEqual({ measured: 0, met: true });
    expect(summaryMarkdown(first.run, first.records, predictions)).toContain("| shelf | smoke-v1 | median | pack.overflow | 1 | 0 | yes |");
    expect(() => parsePredictions('{"strategy":"shelf"}')).toThrow(/no id/);
  });

  it("merges the runs of the jobs of the matrix", () => {
    const one = runBench({ corpus: smoke, prediction: "p-test", strategies: ["shelf"], repeats: 1, warmup: 0, env: ENV });
    const two = runBench({ corpus: smoke, prediction: "p-test", strategies: ["rows", "push"], repeats: 1, warmup: 0, env: ENV });
    const merged = mergeRuns([one.run, two.run]);
    expect(merged.strategies).toEqual(["shelf", "rows", "push"]);
    expect(merged.skipped).toHaveLength(one.run.skipped.length + two.run.skipped.length);
    const other = runBench({ corpus: smoke, prediction: "p-other", strategies: ["rows"], repeats: 1, warmup: 0, env: ENV });
    expect(() => mergeRuns([one.run, other.run])).toThrow(/one prediction/);
  });

  it("refuses a bad corpus file, a bad strategy and a bad count of runs", () => {
    expect(() => parseCorpus('{"schema":"layout-input/1"}')).toThrow(/layout-corpus\/1/);
    expect(() => parseCorpus(corpusFile("smoke-v1"), "other")).toThrow(/has the name/);
    expect(strategyIds("all")).toEqual(strategies.map((s) => s.id));
    expect(strategyIds(" shelf, rows ,shelf")).toEqual(["shelf", "rows"]);
    expect(() => strategyIds("nope")).toThrow(RangeError);
    expect(() => runBench({ corpus: smoke, prediction: "p-test", repeats: 0, env: ENV })).toThrow(RangeError);
    expect(() => runBench({ corpus: smoke, prediction: " ", env: ENV })).toThrow(RangeError);
  });

  it("keeps the first screen of the packer at 1305 inputs, under a name that highways does not use", () => {
    const screen = parseCorpus(corpusFile("pack-screen-v1"), "pack-screen-v1");
    expect(screen.specs.reduce((n, s) => n + s.seeds.length, 0)).toBe(1305);
    expect(screen.corpus).not.toBe("screen-v1");
  });
});
