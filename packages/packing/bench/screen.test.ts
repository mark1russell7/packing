import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packWith, rectGrid, toPackInput } from "@mark1russell7/packing";
import { isMeasured, mergeRuns, parseCorpus, runBench, summaryMarkdown, type BenchEnv } from "./run.ts";
import { MOVE_OF, moveCounts, OUTSIDE_EXACT, screenMarkdown, screenOf, shapesOf, type ScreenRecord } from "./screen.ts";

// The screen guards of k59 on hand-made records, and on a run of the tiny corpus smoke-v1. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const smoke = parseCorpus(readFileSync(join(import.meta.dirname, "corpora", "smoke-v1.json"), "utf8"), "smoke-v1");
const full = runBench({ corpus: smoke, prediction: "p-test", repeats: 1, warmup: 0, env: ENV });

const rec = (strategy: string, input: string, hash: string, measures: Record<string, number> = {}): ScreenRecord => ({ strategy, input, outputHash: hash, measures });
const SHAPES = new Map([
  ["i1", "rect"],
  ["i2", "rect"],
  ["i3", "circle"],
]);

describe("the screen of a run", () => {
  it("ranks the fill only over the records with no overflow, and keeps the median of all the records", () => {
    const records = [
      rec("rows", "i1", "a", { "pack.fill": 0.9, "pack.overflow": 2 }),
      rec("rows", "i2", "b", { "pack.fill": 0.5, "pack.overflow": 0 }),
      rec("rows", "i3", "c", { "pack.fill": 0.7, "pack.overflow": 0 }),
    ];
    const { fill } = screenOf(["rows"], records, SHAPES);
    expect(fill["rows"]!.all).toEqual({ records: 3, median: 0.7 });
    expect(fill["rows"]!.clean).toEqual({ records: 2, median: 0.6 });
    expect(fill["rows"]!.shapes["rect"]).toEqual({ all: { records: 2, median: 0.7 }, clean: { records: 1, median: 0.5 } });
    expect(fill["rows"]!.shapes["circle"]!.clean).toEqual({ records: 1, median: 0.7 });
  });

  it("gives the overflow means, the share with overflow and the sum of pack.outsideExact", () => {
    const records = [
      rec("shelf", "i1", "a", { "pack.overflow": 2, "pack.overflow.forced": 1, "pack.overflow.excess": 1, [OUTSIDE_EXACT]: 1 }),
      rec("shelf", "i2", "b", { "pack.overflow": 0, "pack.overflow.forced": 0, "pack.overflow.excess": 0, [OUTSIDE_EXACT]: 0 }),
    ];
    const o = screenOf(["shelf"], records, SHAPES).overflow["shelf"]!;
    expect([o.records, o.overflowing, o.share, o.outsideExact]).toEqual([2, 1, 0.5, 1]);
    expect(o.means).toEqual({ "pack.overflow": 1, "pack.overflow.forced": 0.5, "pack.overflow.excess": 0.5 });
    expect(Object.keys(o.shapes)).toEqual(["rect"]);
  });

  it("groups the strategies that are equal on each input, and on each input of one container shape", () => {
    const records = [
      rec("rows", "i1", "a"),
      rec("rows", "i2", "b"),
      rec("rows", "i3", "c"),
      rec("shelf", "i1", "a"),
      rec("shelf", "i2", "b"),
      rec("shelf", "i3", "x"),
      rec("skyline", "i1", "a"),
      rec("skyline", "i2", "y"),
      rec("skyline", "i3", "c"),
    ];
    const screen = screenOf(["rows", "shelf", "skyline"], records, SHAPES);
    expect(screen.outputGroups).toEqual([]);
    expect(screen.cellGroups["rect"]!.groups).toEqual([{ strategies: ["rows", "shelf"], inputs: 2 }]);
    expect(screen.cellGroups["circle"]!.groups).toEqual([{ strategies: ["rows", "skyline"], inputs: 1 }]);
    expect(screen.cellGroups["rect"]!.pairs).toContainEqual({ a: "rows", b: "skyline", inputs: 2, equal: 1, share: 0.5 });
    const same = screenOf(["rows", "shelf"], records.filter((r) => r.input !== "i3"), SHAPES);
    expect(same.outputGroups).toEqual([{ strategies: ["rows", "shelf"], inputs: 2 }]);
  });

  it("does not compare a skipped record, and does not group two strategies with no common input", () => {
    const records = [rec("rows", "i1", "a"), { ...rec("push", "i1", "a"), skipped: "unsupported mode: offline" }];
    const screen = screenOf(["rows", "push"], records, SHAPES);
    expect(screen.outputGroups).toEqual([]);
    expect(screen.cellGroups["rect"]!.pairs).toEqual([]);
  });

  it("labels a strategy exercised when its move has a count above 0 on 1 input, and else gives a reason", () => {
    const records = [rec("rows", "i1", "a", { "move.gapFill": 0 }), rec("rows", "i3", "b", { "move.gapFill": 3 }), rec("shelf", "i1", "a", { "move.stack": 0 })];
    const { activation } = screenOf(["rows", "shelf", "push", "other"], records, SHAPES);
    expect(activation["rows"]).toMatchObject({ move: "move.gapFill", records: 2, fired: 1, count: 3, label: "exercised" });
    expect(activation["rows"]!.shapes["rect"]).toMatchObject({ label: "not-exercised", reason: "The count of move.gapFill is 0 on each of the 1 measured inputs." });
    expect(activation["shelf"]!.label).toBe("not-exercised");
    expect(activation["push"]).toMatchObject({ label: "not-exercised", reason: "No record is measured.", shapes: {} });
    expect(activation["other"]).toMatchObject({ move: "-", reason: "The strategy has no characteristic move." });
    const skip = { ...rec("push", "i3", "a"), skipped: "unsupported containerShape: circle" };
    const skipped = screenOf(["push"], [skip], SHAPES).activation["push"]!;
    expect(skipped.reason).toBe("No record is measured. The strategy skips each of the 1 inputs: unsupported containerShape: circle.");
    expect(Object.keys(skipped.shapes)).toEqual(["circle"]);
  });

  it("reads the container shapes of a manifest, and gives an empty map for a value that is not a manifest", () => {
    expect(shapesOf({ inputs: [{ id: "a", cell: { containerShape: "ring" } }, { id: 2 }] })).toEqual(new Map([["a", "ring"]]));
    expect(shapesOf(undefined).size).toBe(0);
    expect(screenOf(["rows"], [rec("rows", "zz", "a")], new Map()).overflow["rows"]!.shapes["unknown"]!.records).toBe(1);
  });

  it("writes one line for each section of a run.json before k59", () => {
    const md = screenMarkdown({}, ["rows"]).join("\n");
    for (const section of ["Fill without overflow", "Overflow", "Distinct outputs", "Activation"]) expect(md).toContain(`## ${section}`);
    expect(md.match(/A `run.json` before k59/g)).toHaveLength(4);
  });
});

describe("the screen on smoke-v1", () => {
  it("gives each strategy its move in its trace", () => {
    const input = toPackInput(rectGrid.generate(2, { count: 30 }));
    for (const [strategy, move] of Object.entries(MOVE_OF)) {
      const counts = moveCounts(packWith(strategy, input));
      expect(Object.keys(counts), strategy).toEqual([move]);
    }
  });

  it("gives each measured record its move count and 0 boxes out of the true outline", () => {
    for (const r of full.records.filter(isMeasured)) {
      expect(r.measures[MOVE_OF[r.strategy]!], `${r.strategy} ${r.input}`).toBeTypeOf("number");
      expect(r.measures[OUTSIDE_EXACT], `${r.strategy} ${r.input}`).toBe(0);
      expect(r.measures["pack.overflow.forced"]!).toBeLessThanOrEqual(r.measures["pack.overflow"]!);
    }
  });

  it("gives the same screen for one run and for the merge of the runs of the jobs of a matrix", () => {
    // The jobs keep the order of the strategies of the full run, and the merge keeps the order of its jobs
    const order = full.run.strategies;
    const jobs = [order.slice(0, 2), order.slice(2, 3), order.slice(3)].map((s) => runBench({ corpus: smoke, prediction: "p-test", strategies: s, repeats: 1, warmup: 0, env: ENV }));
    const records = jobs.flatMap((j) => j.records);
    const merged = mergeRuns(
      jobs.map((j) => j.run),
      records,
      full.manifest,
    );
    for (const field of ["fill", "overflow", "outputGroups", "cellGroups", "activation"] as const) expect(merged[field], field).toEqual(full.run[field]);
    // A merge without the records has no screen, because each job sees only its strategies
    expect(mergeRuns(jobs.map((j) => j.run)).outputGroups).toBeUndefined();
    const md = summaryMarkdown(merged, records);
    for (const section of ["Fill without overflow", "Overflow", "Distinct outputs", "Activation"]) expect(md).toContain(`## ${section}`);
  });

  it("labels rows, shelf and skyline exercised on smoke-v1, and push not-exercised, because push skips each input", () => {
    for (const id of ["rows", "shelf", "skyline"]) expect(full.run.activation![id]!.label, id).toBe("exercised");
    const push = full.run.activation!["push"]!;
    expect(push.label).toBe("not-exercised");
    expect(push.reason).toMatch(/^No record is measured\. The strategy skips each of the 13 inputs: /);
    // Rows and shelf share the packer of a container that is not a rectangle, thus their moves do not occur there
    expect(full.run.activation!["rows"]!.shapes["circle"]!.label).toBe("not-exercised");
    expect(full.run.activation!["shelf"]!.shapes["circle"]!.label).toBe("not-exercised");
    expect(full.run.cellGroups!["circle"]!.groups).toEqual([{ strategies: ["rows", "shelf"], inputs: 1 }]);
  });
});
