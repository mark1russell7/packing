import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANCHOR_MEASURE_IDS, corpus, packWith, toPackInput } from "@mark1russell7/packing";
import { ANCHOR_CORPUS, ANCHOR_FILE, ANCHOR_STRATEGIES, anchorCorpusText, anchorMarkdown, anchorRows, anchorSpecs } from "./anchor.ts";
import { anchorMeasures, checkDeclared, isMeasured, parseCorpus, recordLines, runBench, type BenchCorpus, type BenchEnv } from "./run.ts";

// The corpus pack-anchor-v1 and the bench option anchor of roadmap item k111. The tests read no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

/** A small corpus: 2 inputs with locks and 1 input without a lock. */
const SMALL: BenchCorpus = {
  schema: "layout-corpus/1",
  corpus: "anchor-test",
  specs: [
    { generator: "wall-locks", version: 1, params: { locks: 2, containerSize: "fixed", count: 15 }, seeds: [1] },
    { generator: "wall-locks", version: 1, params: { locks: 3, containerSize: "freeHeight", count: 15 }, seeds: [2] },
    { generator: "gallery", version: 1, params: { count: 10 }, seeds: [1] },
  ],
};

const run = (anchor?: boolean) => {
  let t = 0;
  return runBench({ corpus: SMALL, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["rows", "maxrects-bl"], clock: () => t++, ...(anchor === undefined ? {} : { anchor }) });
};

describe("the corpus pack-anchor-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(ANCHOR_FILE, "utf8")).toBe(anchorCorpusText());
  });

  it("has 51 inputs: 48 of wall-locks and 3 of the case touchObstacles, each with a locked item", () => {
    const file = parseCorpus(readFileSync(ANCHOR_FILE, "utf8"), ANCHOR_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(anchorSpecs())));
    expect(file.heldOut).toBe("all");
    const { manifest, inputs } = corpus(file.corpus, file.specs);
    expect(inputs).toHaveLength(51);
    expect(inputs.filter((i) => i.generator!.name === "wall-locks")).toHaveLength(48);
    expect(inputs.filter((i) => i.generator!.name === "edge-cases")).toHaveLength(3);
    expect(inputs.every((i) => i.source === "made-up")).toBe(true);
    expect(inputs.every((i) => i.boxes.some((b) => b.locked === true))).toBe(true);
    const locks = inputs.reduce((s, i) => s + i.boxes.filter((b) => b.locked === true).length, 0);
    expect(locks).toBe(3 * 4 * (1 + 2 + 3 + 4) + 3);
    expect(new Set(manifest.inputs.map((i) => i.cell.containerSize))).toEqual(new Set(["fixed", "freeHeight"]));
    expect(checkDeclared(file)).toEqual({ order: 0, aspect: 0, "free-size": 24, shaped: 0 });
  });
});

describe("the bench option anchor", () => {
  it("changes no byte of the records when it is off", () => {
    const plain = run();
    expect(recordLines(run(false).records)).toBe(recordLines(plain.records));
    for (const r of plain.records) for (const id of ANCHOR_MEASURE_IDS) expect(r.measures[id]).toBeUndefined();
  });

  it("adds the measures pack.anchor.* only to the inputs with a locked item, and keeps each other value", () => {
    const plain = run().records;
    const anchored = run(true).records;
    expect(anchored.map((r) => r.input)).toEqual(plain.map((r) => r.input));
    for (const [i, r] of anchored.entries()) {
      const base = plain[i]!;
      expect(isMeasured(r)).toBe(true);
      const { measures, ...rest } = r;
      const { measures: baseMeasures, ...baseRest } = base;
      expect(rest).toEqual(baseRest);
      const extra = Object.keys(measures).filter((k) => !(k in baseMeasures));
      if (r.input.includes("gallery")) expect(extra).toEqual([]);
      else expect(extra.toSorted()).toEqual([...ANCHOR_MEASURE_IDS].toSorted());
      for (const k of Object.keys(baseMeasures)) expect(measures[k]).toBe(baseMeasures[k]);
    }
  });

  it("joins the locks of an input: the mean of mean and moved, the largest max and gain, the smallest settled", () => {
    const file = corpus("c", [SMALL.specs[1]!]).inputs[0]!;
    const input = toPackInput(file);
    const first = packWith("rows", input, undefined, file.seed);
    const m = anchorMeasures(input, first, "rows", undefined, file.seed);
    expect(Object.keys(m).toSorted()).toEqual([...ANCHOR_MEASURE_IDS].toSorted());
    expect(m["pack.anchor.settled"] === 0 || m["pack.anchor.settled"] === 1).toBe(true);
    expect(m["pack.anchor.mean"]).toBeLessThanOrEqual(m["pack.anchor.max"]!);
    expect(anchorMeasures(toPackInput(corpus("c", [SMALL.specs[2]!]).inputs[0]!), first, "rows", undefined, 1)).toEqual({});
  });

  it("gives a report with one row for each strategy", () => {
    const records = run(true).records;
    const rows = anchorRows(records, ["rows", "maxrects-bl"]);
    expect(rows.map((r) => [r.strategy, r.inputs])).toEqual([["rows", 2], ["maxrects-bl", 2]]);
    for (const r of rows) expect(r.settled >= 0 && r.settled <= 1).toBe(true);
    const text = anchorMarkdown(rows);
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("| `rows` | 2 |");
    expect(ANCHOR_STRATEGIES).toHaveLength(6);
  });
});
