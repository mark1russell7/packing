import { describe, expect, it } from "vitest";
import { recordLines, type BenchCoverage, type BenchEnv, type BenchRecord, type BenchRun, type MeasuredRecord, type SkippedRecord } from "./run.ts";
import { FULL_COVERAGE, parseRecords, smokeCheck, smokeMarkdown } from "./smoke-check.ts";

// The smoke check on a hand-made run.json and hand-made records. The test packs nothing and reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const INPUTS = ["smoke-v1/rect-grid/s1", "smoke-v1/rect-grid/s2"] as const;

const head = (strategy: string, input: string) =>
  ({
    schema: "layout-record/1",
    stage: "pack",
    step: "pack",
    strategy,
    options: {},
    corpus: "smoke-v1",
    input,
    inputHash: "0000000000000000",
    set: "smoke-v1",
    seed: 1,
    nodes: 10,
    edges: 0,
    tolerance: { overlap: 0 },
    prediction: "p-test",
    env: ENV,
  }) as const;

const measuredRecord = (strategy: string, input: string, over: Partial<MeasuredRecord> = {}): MeasuredRecord => ({
  ...head(strategy, input),
  measures: { "pack.fill": 0.5 },
  hard: { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 },
  deterministic: true,
  ms: 1,
  msRuns: [1],
  outputHash: "0123456789abcdef",
  ...over,
});

const skippedRecord = (strategy: string, input: string): SkippedRecord => ({
  ...head(strategy, input),
  measures: {},
  hard: {},
  deterministic: true,
  ms: 0,
  skipped: "unsupported mode: offline",
});

const cover = (measured: number, inputs: number): BenchCoverage => ({
  measured,
  inputs,
  coverage: Math.round((measured / inputs) * 1000) / 1000,
  shapes: { rect: { measured, inputs, coverage: Math.round((measured / inputs) * 1000) / 1000 } },
});

/** A good run: rows, shelf and skyline pack each input, and push skips each input. */
const goodRecords = (): BenchRecord[] => [
  ...GATED.flatMap((s) => INPUTS.map((i) => measuredRecord(s, i))),
  ...INPUTS.map((i) => skippedRecord("push", i)),
];
/** The entries with the gate of the coverage 1: 3 strategies and the 4 variants of the shelf family */
const GATED = ["rows", "shelf", "skyline", "shelf-next", "shelf-first", "shelf-best", "shelf-first-input", "maxrects-bssf", "maxrects-blsf", "maxrects-baf", "maxrects-bl", "maxrects-cp"];

const goodRun = (): BenchRun => ({
  schema: "packing-bench-run/1",
  corpus: "smoke-v1",
  prediction: "p-test",
  repeats: 1,
  warmup: 0,
  strategies: [...GATED, "push"],
  env: ENV,
  skipped: INPUTS.map((input) => ({ strategy: "push", input, dimension: "mode", value: "offline" })),
  errors: [],
  coverage: { ...Object.fromEntries(GATED.map((id) => [id, cover(2, 2)])), push: cover(0, 2) },
});

describe("the smoke check", () => {
  it("passes a good run, and shows the coverage of push without a gate", () => {
    const result = smokeCheck(goodRun(), goodRecords());
    expect(result.failures).toEqual([]);
    expect(result.rows).toEqual([
      ...GATED.map((strategy) => ({ strategy, measured: 2, inputs: 2, coverage: 1, full: true })),
      { strategy: "push", measured: 0, inputs: 2, coverage: 0, full: false },
    ]);
    expect(FULL_COVERAGE).toEqual(GATED);
    const md = smokeMarkdown(result);
    expect(md).toContain("| push | 0 | 2 | 0 | none |");
    expect(md).toContain("| rows | 2 | 2 | 1 | 1 |");
    expect(md).toContain("The check passed.");
  });

  it("reads the records of records.jsonl", () => {
    const records = goodRecords();
    expect(parseRecords(recordLines(records))).toEqual(records);
    expect(parseRecords("\n\n")).toEqual([]);
  });

  it("fails a run with no records", () => {
    const run = { ...goodRun(), coverage: {} };
    const { failures } = smokeCheck(run, []);
    expect(failures).toContain("The file records.jsonl has no records.");
    expect(failures).toContain("The file run.json has no coverage for rows.");
  });

  it("fails a run with an error of a strategy", () => {
    const run = goodRun();
    run.errors = [{ strategy: "shelf", input: INPUTS[1], message: "made-up error" }];
    run.coverage!["shelf"] = cover(1, 2);
    const records = goodRecords().filter((r) => !(r.strategy === "shelf" && r.input === INPUTS[1]));
    const { failures } = smokeCheck(run, records);
    expect(failures).toContain(`The strategy shelf has an error on ${INPUTS[1]}: made-up error`);
    expect(failures).toContain("The coverage of shelf is 0.5, not 1.");
    expect(failures).toHaveLength(2);
  });

  it("fails a record with a hard break, and a record that is not deterministic", () => {
    const records = goodRecords();
    records[0] = measuredRecord("rows", INPUTS[0], { hard: { "no-overlap": 2, "in-container": 0, "locked-kept": 0, complete: 0 } });
    records[1] = measuredRecord("rows", INPUTS[1], { deterministic: false });
    const { failures } = smokeCheck(goodRun(), records);
    expect(failures).toEqual([`The record of rows on ${INPUTS[0]} has hard breaks: {"no-overlap":2}.`, `The record of rows on ${INPUTS[1]} is not deterministic.`]);
    expect(smokeMarkdown(smokeCheck(goodRun(), records))).toContain("The check found 2 failures:");
  });

  it("fails a forced overflow above the overflow, and a box out of the true outline", () => {
    const records = goodRecords();
    records[0] = measuredRecord("rows", INPUTS[0], { measures: { "pack.overflow": 1, "pack.overflow.forced": 2, "pack.outsideExact": 0 } });
    records[1] = measuredRecord("rows", INPUTS[1], { measures: { "pack.overflow": 2, "pack.overflow.forced": 2, "pack.outsideExact": 3 } });
    records[2] = measuredRecord("shelf", INPUTS[0], { measures: { "pack.overflow": 2, "pack.overflow.forced": 1, "pack.outsideExact": 0 } });
    expect(smokeCheck(goodRun(), records).failures).toEqual([
      `The record of rows on ${INPUTS[0]} has a forced overflow of 2, above its overflow of 1.`,
      `The record of rows on ${INPUTS[1]} has 3 boxes out of the true outline of the container.`,
    ]);
  });

  it("fails a forced overflow area above the overflow area, but not a difference of float noise", () => {
    const records = goodRecords();
    records[0] = measuredRecord("rows", INPUTS[0], { measures: { "pack.overflow.area": 0.2, "pack.overflow.forcedArea": 0.25 } });
    records[1] = measuredRecord("rows", INPUTS[1], { measures: { "pack.overflow.area": 0.2, "pack.overflow.forcedArea": 0.2 + 1e-10 } });
    records[2] = measuredRecord("shelf", INPUTS[0], { measures: { "pack.overflow.area": 0.3, "pack.overflow.forcedArea": 0.1 } });
    expect(smokeCheck(goodRun(), records).failures).toEqual([`The record of rows on ${INPUTS[0]} has a forced overflow area of 0.25, above its overflow area of 0.2.`]);
  });

  it("fails a gap below 0, but not a gap of 0", () => {
    const records = goodRecords();
    records[0] = measuredRecord("rows", INPUTS[0], { measures: { "pack.bound": 10, "pack.bound.kind": 0, "pack.gap": -0.05 } });
    records[1] = measuredRecord("rows", INPUTS[1], { measures: { "pack.bound": 10, "pack.bound.kind": 0, "pack.gap": 0 } });
    expect(smokeCheck(goodRun(), records).failures).toEqual([`The record of rows on ${INPUTS[0]} has a gap of -0.05 below 0: its result is better than its bound.`]);
  });

  it("fails a coverage below 1 of rows, shelf or skyline, but not of push", () => {
    const run = goodRun();
    run.coverage!["skyline"] = cover(1, 2);
    const records = goodRecords().map((r) => (r.strategy === "skyline" && r.input === INPUTS[0] ? skippedRecord("skyline", INPUTS[0]) : r));
    expect(smokeCheck(run, records).failures).toEqual(["The coverage of skyline is 0.5, not 1."]);
  });

  it("fails a coverage of run.json that does not agree with the records", () => {
    const run = goodRun();
    run.coverage!["push"] = cover(1, 2);
    expect(smokeCheck(run, goodRecords()).failures).toEqual(["The coverage of push in run.json is 1/2 (0.5), but the records give 0/2 (0)."]);
  });

  it("fails a run without a strategy of the full coverage", () => {
    const run = { ...goodRun(), strategies: [...GATED.filter((id) => id !== "shelf"), "push"] };
    const records = goodRecords().filter((r) => r.strategy !== "shelf");
    expect(smokeCheck(run, records).failures).toEqual(["The run does not have the strategy shelf."]);
  });
});
