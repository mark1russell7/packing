import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { strategies } from "@mark1russell7/packing";
import { ENTRIES, entry, SHELF_VARIANTS } from "./entries.ts";
import {
  checkPrediction,
  isMeasured,
  mergeRuns,
  outputHash,
  parseCorpus,
  parsePredictions,
  recordLines,
  runBench,
  skipReason,
  strategyIds,
  summaryMarkdown,
  type BenchEnv,
  type BenchRecord,
  type SkippedRecord,
} from "./run.ts";

// The runner of the benchmark on the tiny corpus smoke-v1, with one timed run. The test reads no time: CI gives the times.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const corpusFile = (name: string): string => readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8");
const smoke = parseCorpus(corpusFile("smoke-v1"), "smoke-v1");
const run = () => runBench({ corpus: smoke, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, commit: "abcdef0" });
const first = run();
const second = run();
const measured = first.records.filter(isMeasured);
const skips = first.records.filter((r): r is SkippedRecord => !isMeasured(r));

/** The fields of `layout-record/1` in `docs/FORMAT.md` that each record has. */
const FORMAT_FIELDS = ["schema", "stage", "step", "strategy", "options", "corpus", "input", "inputHash", "set", "seed", "nodes", "edges", "measures", "hard", "tolerance", "deterministic", "prediction", "ms", "commit", "env"];

/** A record without its times. */
const timeless = (r: BenchRecord): unknown => {
  const copy: Record<string, unknown> = { ...r, measures: { ...r.measures } };
  delete copy["ms"];
  delete copy["msRuns"];
  delete (copy["measures"] as Record<string, number>)["pack.search.ms"];
  return copy;
};

describe("the benchmark runner", () => {
  it("writes one parsable layout-record/1 line for each record", () => {
    const lines = recordLines(first.records).split("\n");
    expect(lines.at(-1)).toBe("");
    const parsed = lines.slice(0, -1).map((line) => JSON.parse(line) as BenchRecord);
    expect(parsed).toEqual(first.records);
    expect(measured.length).toBeGreaterThan(0);
    for (const r of parsed) {
      for (const field of FORMAT_FIELDS) expect(r, field).toHaveProperty(field);
      expect(r.schema).toBe("layout-record/1");
      expect(r.stage).toBe("pack");
      expect(r.corpus).toBe("smoke-v1");
      expect(r.set).toBe("smoke-v1");
      expect(r.prediction).toBe("p-test");
      expect(r.commit).toBe("abcdef0");
      expect(r.tolerance).toEqual({ overlap: 0.001 });
      expect(r.env).toEqual(ENV);
      const entry = first.manifest.inputs.find((e) => e.id === r.input);
      expect(entry?.hash).toBe(r.inputHash);
    }
  });

  it("gives each measured record its times, its outputHash and its measures", () => {
    for (const r of measured) {
      expect(r).not.toHaveProperty("skipped");
      expect(r).not.toHaveProperty("placementsHash");
      expect(r.msRuns).toHaveLength(1);
      expect(r.outputHash).toMatch(/^[0-9a-f]{16}$/);
      expect(r.outputHash).toBe(outputHash(first.outputs.get(r.strategy)!.get(r.input)!));
      for (const value of Object.values(r.measures)) expect(Number.isFinite(value)).toBe(true);
      expect(Object.keys(r.measures)).toEqual(expect.arrayContaining(["pack.area", "pack.fill", "pack.overflow", "pack.aspectError", "pack.order.inversions"]));
    }
  });

  it("gives the same outputHash for the same placements in a different order", () => {
    const output = [...first.outputs.get("shelf")!.values()].find((o) => o.placements.length > 1)!;
    expect(outputHash({ ...output, placements: output.placements.toReversed() })).toBe(outputHash(output));
  });

  it("gives a skipped record with the reason, no measures, no hard counts and no times", () => {
    expect(skips.length).toBeGreaterThan(0);
    for (const r of skips) {
      expect(r.skipped).toMatch(/^unsupported \S+: \S+$/);
      expect(r.measures).toEqual({});
      expect(r.hard).toEqual({});
      expect(r.ms).toBe(0);
      expect(r.deterministic).toBe(true);
      expect(r).not.toHaveProperty("msRuns");
      expect(r).not.toHaveProperty("outputHash");
      expect(first.outputs.get(r.strategy)?.has(r.input)).toBe(false);
    }
    expect(skips.map((r) => ({ strategy: r.strategy, input: r.input }))).toEqual(first.run.skipped.map((k) => ({ strategy: k.strategy, input: k.input })));
    expect(skips.map((r) => r.skipped)).toEqual(first.run.skipped.map((k) => skipReason(k.dimension, k.value)));
  });

  it("gives records that fit the record of the contract", () => {
    const shared: readonly LayoutRecord[] = first.records;
    expect(shared).toHaveLength(first.records.length);
  });

  it("gives 0 hard breaks, determinism and no error for each measured pair", () => {
    expect(first.run.errors).toEqual([]);
    for (const r of measured) {
      expect(r.hard, `${r.strategy} ${r.input}`).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      expect(r.deterministic, `${r.strategy} ${r.input}`).toBe(true);
    }
  });

  it("gives the same records, placements and measures in two runs", () => {
    expect(second.records.map(timeless)).toEqual(first.records.map(timeless));
    for (const [id, outputs] of first.outputs) {
      for (const [input, output] of outputs) expect(second.outputs.get(id)?.get(input)?.placements, `${id} ${input}`).toEqual(output.placements);
    }
  });

  it("gives each pair one record, in the order of the strategies and then of the inputs", () => {
    const inputs = first.manifest.inputs.map((e) => e.id);
    expect(first.records.map((r) => `${r.strategy} ${r.input}`)).toEqual(ENTRIES.flatMap((e) => inputs.map((input) => `${e.id} ${input}`)));
    // The corpus is offline, and push supports only the mode incremental
    expect(measured.filter((r) => r.strategy === "push")).toEqual([]);
    expect(skips.filter((r) => r.strategy === "push")).toHaveLength(inputs.length);
    expect(skips.some((r) => r.strategy === "push" && r.skipped === "unsupported mode: offline")).toBe(true);
    // rows, skyline and shelf pack a circle container and the obstacles
    const circle = inputs.find((id) => id.includes(".circle."))!;
    expect(measured.filter((r) => r.input === circle).map((r) => r.strategy)).toEqual(["rows", "skyline", "shelf", ...SHELF_VARIANTS.map((v) => v.id)]);
    expect(skips.filter((r) => r.strategy !== "push")).toEqual([]);
  });

  it("gives each variant of the shelf family its options in each record, over the defaults of shelf", () => {
    expect(SHELF_VARIANTS.map((v) => [v.id, v.options])).toEqual([
      ["shelf-next", { fit: "next", sortOrder: "height-desc" }],
      ["shelf-first", { fit: "first", sortOrder: "height-desc" }],
      ["shelf-best", { fit: "best", sortOrder: "height-desc" }],
      ["shelf-first-input", { fit: "first", sortOrder: "input" }],
    ]);
    for (const r of first.records) {
      const e = entry(r.strategy);
      const defaults = strategies.find((s) => s.id === e.strategy)!.defaults as Record<string, unknown>;
      expect(r.options, r.strategy).toEqual({ ...defaults, ...e.options });
    }
    for (const v of SHELF_VARIANTS) {
      const own = measured.filter((r) => r.strategy === v.id);
      expect(own.length, v.id).toBe(first.manifest.inputs.length);
      for (const r of own) expect(r.measures, v.id).toHaveProperty("move.firstFit");
    }
    expect(() => entry("nope")).toThrow(RangeError);
  });

  it("gives the search measures of a free size from the trace", () => {
    const free = measured.find((r) => r.strategy === "shelf" && r.input.includes(".freeAspect."))!;
    expect(free.measures["pack.search.widths"]).toBeGreaterThan(0);
  });

  it("writes a summary with each strategy, the counts of the skipped records and the prediction", () => {
    const md = summaryMarkdown(first.run, first.records, []);
    for (const s of ENTRIES) {
      const own = first.records.filter((r) => r.strategy === s.id);
      expect(md).toContain(`| ${s.id} | ${own.filter(isMeasured).length} | ${own.filter((r) => !isMeasured(r)).length} | 0 |`);
    }
    expect(md).toContain(`Records: ${first.records.length}. Measured records: ${measured.length}. Skipped records: ${skips.length}.`);
    expect(md).toContain("## Skipped cells");
    const offline = skips.filter((r) => r.strategy === "push" && r.skipped === "unsupported mode: offline").length;
    expect(offline).toBeGreaterThan(0);
    expect(md).toContain(`| push | \`unsupported mode: offline\` | ${offline} |`);
    expect(md).toContain("Each measured record has 0 hard breaks");
    expect(md).toContain("has no line with the id `p-test`");
    expect(md).toContain("No input of the corpus has a base");
    expect(md).not.toContain("## `push` by family");
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

  it("gives the same prediction median with and without the skipped records", () => {
    for (const measure of ["ms", "pack.fill", "pack.overflow", "pack.aspectError"]) {
      const p = { id: "p-test", set: "smoke-v1", measure, expected: 0 };
      const all = checkPrediction(p, first.records);
      expect(all.measured, measure).toBeDefined();
      expect(all, measure).toEqual(checkPrediction(p, measured));
      // More skipped records, each with the ms 0, do not move the median
      expect(checkPrediction(p, [...first.records, ...skips, ...skips, ...skips]), measure).toEqual(all);
    }
    expect(checkPrediction({ id: "p-test", strategy: "push", measure: "ms", expected: 0 }, first.records)).toEqual({});
  });

  it("merges the runs of the jobs of the matrix", () => {
    const one = runBench({ corpus: smoke, prediction: "p-test", strategies: ["shelf"], repeats: 1, warmup: 0, env: ENV });
    const two = runBench({ corpus: smoke, prediction: "p-test", strategies: ["rows", "push"], repeats: 1, warmup: 0, env: ENV });
    const merged = mergeRuns([one.run, two.run]);
    expect(merged.strategies).toEqual(["shelf", "rows", "push"]);
    expect(merged.skipped).toHaveLength(one.run.skipped.length + two.run.skipped.length);
    const records = [...one.records, ...two.records];
    expect(merged.skipped).toHaveLength(records.filter((r) => !isMeasured(r)).length);
    expect(summaryMarkdown(merged, records)).toContain(`Skipped records: ${merged.skipped.length}.`);
    const other = runBench({ corpus: smoke, prediction: "p-other", strategies: ["rows"], repeats: 1, warmup: 0, env: ENV });
    expect(() => mergeRuns([one.run, other.run])).toThrow(/one prediction/);
    expect(merged.coverage).toEqual({ ...one.run.coverage, ...two.run.coverage });
    // Two jobs of one strategy add their counts
    const twice = mergeRuns([one.run, one.run]).coverage!["shelf"]!;
    expect([twice.measured, twice.inputs, twice.coverage]).toEqual([2 * one.run.coverage!["shelf"]!.measured, 2 * one.run.coverage!["shelf"]!.inputs, one.run.coverage!["shelf"]!.coverage]);
    const { coverage: _, ...old } = one.run;
    expect(mergeRuns([old]).coverage).toBeUndefined();
  });

  it("gives the coverage of each strategy, and of each container shape of the manifest", () => {
    const cov = first.run.coverage!;
    expect(Object.keys(cov)).toEqual(first.run.strategies);
    const inputs = first.manifest.inputs.length;
    for (const id of first.run.strategies) {
      const own = measured.filter((r) => r.strategy === id).length;
      expect(cov[id]).toMatchObject({ measured: own, inputs, coverage: Math.round((own / inputs) * 1000) / 1000 });
      const shapes = Object.values(cov[id]!.shapes);
      expect(shapes.reduce((sum, c) => sum + c.inputs, 0)).toBe(inputs);
      expect(shapes.reduce((sum, c) => sum + c.measured, 0)).toBe(own);
    }
    // rows, shelf and skyline pack each input of the smoke corpus, and push packs only the rectangle containers
    for (const id of ["rows", "shelf", "skyline"]) expect(cov[id]!.coverage, id).toBe(1);
    expect(cov["push"]!.shapes["circle"]!.measured).toBe(0);
    expect(summaryMarkdown(first.run, first.records)).toContain("## Coverage");
    expect(summaryMarkdown(first.run, first.records)).toMatch(new RegExp(`\\| rows \\| ${inputs}/${inputs} \\(1\\) \\|`));
  });

  it("checks a prediction of the measure pack.coverage against the coverage of the run", () => {
    const p = { id: "p-test", strategy: "skyline", measure: "pack.coverage", expected: 1 };
    expect(checkPrediction(p, first.records, first.run)).toEqual({ measured: 1, met: true });
    // Without the run, the prediction has no value
    expect(checkPrediction(p, first.records)).toEqual({});
    const push = first.run.coverage!["push"]!.shapes["circle"]!;
    expect(checkPrediction({ ...p, strategy: "push", cell: { containerShape: "circle" } }, first.records, first.run)).toEqual({ measured: push.coverage, met: false });
    expect(checkPrediction({ ...p, strategy: "push", cell: { containerShape: "circle" }, op: "==", expected: 0 }, first.records, first.run)).toEqual({ measured: 0, met: true });
    expect(checkPrediction({ id: "p-test", measure: "pack.coverage", expected: 1, cell: { containerShape: "nonexistent" } }, first.records, first.run)).toEqual({});
  });

  it("refuses a bad corpus file, a bad strategy and a bad count of runs", () => {
    expect(() => parseCorpus('{"schema":"layout-input/1"}')).toThrow(/layout-corpus\/1/);
    expect(() => parseCorpus(corpusFile("smoke-v1"), "other")).toThrow(/has the name/);
    expect(strategyIds("all")).toEqual(ENTRIES.map((e) => e.id));
    expect(strategyIds("all").slice(0, strategies.length)).toEqual(strategies.map((s) => s.id));
    expect(strategyIds("shelf-best,shelf")).toEqual(["shelf-best", "shelf"]);
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
