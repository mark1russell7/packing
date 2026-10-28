import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MEASURE_SPECS } from "@mark1russell7/packing";
import {
  bootstrapMedian,
  cellsOf,
  classify,
  CONFIRM_INPUTS,
  floorRatio,
  medianTest,
  promotionJson,
  promotionMarkdown,
  promoteMain,
  signTestP,
  tailTest,
  timeTest,
  TIME_FLOOR_MS,
  winTest,
  type InputCell,
  type PromotionRecord,
} from "./promote.ts";

// The win test of k58 on made-up records only. The test reads no time of this computer.

/** The measures of a plain default record */
const BASE = { "pack.area": 1000, "pack.fill": 0.7, "pack.aspectError": 0.1, "pack.order.inversions": 0, "pack.overflow": 0 };

const record = (strategy: string, input: string, measures: Record<string, number>, ms = 1, extra: Partial<PromotionRecord> = {}): PromotionRecord => ({
  strategy,
  input,
  measures,
  ms,
  hard: { "no-overlap": 0, "in-container": 0 },
  deterministic: true,
  ...extra,
});

/** This function gives `n` inputs of two shapes, with a fixed container, and their cells. */
function corpusOf(n: number): { inputs: string[]; cells: Map<string, InputCell> } {
  const inputs = Array.from({ length: n }, (_, i) => `c/${i % 2 === 0 ? "rect" : "circle"}.n${i}/s1`);
  const cells = new Map(inputs.map((id, i) => [id, { containerShape: i % 2 === 0 ? "rect" : "circle", containerSize: "fixed" }]));
  return { inputs, cells };
}

/** This function gives the records of a candidate and a default on each input. */
function recordsOf(inputs: readonly string[], candidate: (i: number) => Record<string, number>, candidateMs = 1): PromotionRecord[] {
  return inputs.flatMap((id, i) => [record("cand", id, { ...BASE, ...candidate(i) }, candidateMs), record("rows", id, BASE)]);
}

/** A candidate that is better on fill and area, and equal on the other guards */
const GOOD = (): Record<string, number> => ({ "pack.fill": 0.8, "pack.area": 900 });

const FAST = { bootstrapRuns: 2000 };

describe("the paired ratio and the floor rule", () => {
  it("gives 1 when both values are 0, and the plain ratio away from the floor", () => {
    expect(floorRatio(0, 0, MEASURE_SPECS["pack.area"])).toEqual({ ratio: 1 });
    expect(floorRatio(0.2, 0.1, MEASURE_SPECS["pack.aspectError"]).ratio).toBeCloseTo(2);
    // A measure where more is better uses the inverse ratio
    expect(floorRatio(0.8, 0.4, MEASURE_SPECS["pack.fill"]).ratio).toBeCloseTo(0.5);
  });

  it("gives a tie within the tolerance of a default at the floor, and Infinity beyond it", () => {
    const spec = MEASURE_SPECS["pack.aspectError"];
    expect(spec.floor).toBe(0);
    expect(floorRatio(0.005, 0, spec)).toEqual({ ratio: 1, floor: "tie" });
    expect(floorRatio(0.01, 0, spec)).toEqual({ ratio: 1, floor: "tie" });
    expect(floorRatio(0.02, 0, spec)).toEqual({ ratio: Infinity, floor: "loss" });
    // A count has the tolerance 0
    expect(floorRatio(1, 0, MEASURE_SPECS["pack.overflow"])).toEqual({ ratio: Infinity, floor: "loss" });
    expect(floorRatio(0, 0, MEASURE_SPECS["pack.overflow"])).toEqual({ ratio: 1, floor: "tie" });
  });

  it("counts the floor rule of each measure in the verdict", () => {
    const { inputs, cells } = corpusOf(20);
    const v = winTest(recordsOf(inputs, GOOD), { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    const inversions = v.tests.guards.find((g) => g.measure === "pack.order.inversions")!;
    expect(inversions.floor).toMatchObject({ applied: 20, ties: 20, losses: 0 });
    expect(inversions.floor.ids).toHaveLength(20);
    expect(v.tests.guards.find((g) => g.measure === "pack.overflow")!.floor.applied).toBe(20);
  });
});

describe("the classification", () => {
  it("gives a tie for a change of the minimum effect or less", () => {
    const fill = MEASURE_SPECS["pack.fill"];
    expect(classify(0.703, 0.7, fill)).toBe("tie");
    expect(classify(0.71, 0.7, fill)).toBe("better");
    expect(classify(0.69, 0.7, fill)).toBe("worse");
    const area = MEASURE_SPECS["pack.area"];
    expect(classify(100.5, 100, area)).toBe("tie");
    expect(classify(98, 100, area)).toBe("better");
  });

  it("follows the floor rule before the compare", () => {
    const spec = MEASURE_SPECS["pack.aspectError"];
    expect(classify(0.005, 0, spec, "tie")).toBe("tie");
    expect(classify(0.02, 0, spec, "loss")).toBe("worse");
  });
});

describe("the median and the tail tests", () => {
  it("compare the median and the tail share with their limits", () => {
    expect(medianTest([1, 1.01, 1.03])).toMatchObject({ value: 1.01, pass: true });
    expect(medianTest([1.03, 1.03, 1])).toMatchObject({ value: 1.03, pass: false });
    expect(tailTest([1, 1, 1, 1, 1, 1, 1, 1, 1, Infinity]).pass).toBe(true);
    expect(tailTest([1, 1, 1, 1, 1, 1, 1, 1, Infinity, 1.2]).pass).toBe(false);
    expect(medianTest([]).pass).toBe(false);
  });
});

describe("the sign test", () => {
  it("gives the one-sided exact binomial p-values", () => {
    expect(signTestP(8, 2)).toBeCloseTo(56 / 1024, 12);
    expect(signTestP(9, 1)).toBeCloseTo(11 / 1024, 12);
    expect(signTestP(15, 5)).toBeCloseTo(21700 / 1048576, 12);
    expect(signTestP(10, 0)).toBeCloseTo(1 / 1024, 12);
    expect(signTestP(0, 5)).toBe(1);
    expect(signTestP(0, 0)).toBe(1);
    expect(signTestP(300, 200)).toBeLessThan(1e-5);
  });
});

describe("the paired bootstrap", () => {
  const ratios = Array.from({ length: 101 }, (_, i) => 0.8 + (i % 17) / 40);

  it("gives the same interval for the same seed", () => {
    const a = bootstrapMedian(ratios, 2000, 0.95, 7)!;
    const b = bootstrapMedian(ratios, 2000, 0.95, 7)!;
    expect(a).toEqual(b);
    expect(a.low).toBeLessThanOrEqual(a.high);
    expect(bootstrapMedian([], 10)).toBeUndefined();
  });

  it("takes Infinity as a value", () => {
    const i = bootstrapMedian([0.9, 0.9, 0.9, Infinity], 500)!;
    expect(i.low).toBe(0.9);
    expect(i.high).toBe(Infinity);
  });
});

describe("the time test", () => {
  it("uses the floor in the denominator", () => {
    const pairs = Array.from({ length: 10 }, () => ({ candidate: 1, current: 0.1 }));
    expect(TIME_FLOOR_MS).toBe(5);
    const plain = timeTest(pairs, { timeRatio: 1.5, timeTailQ: 0.95, timeTail: 2, timeFloorMs: 0 });
    expect(plain).toMatchObject({ pass: false, raised: 0 });
    expect(plain.median.value).toBeCloseTo(10);
    const floored = timeTest(pairs, { timeRatio: 1.5, timeTailQ: 0.95, timeTail: 2, timeFloorMs: 5 });
    expect(floored).toMatchObject({ pass: true, raised: 10, floorMs: 5 });
    expect(floored.median.value).toBeCloseTo(0.3);
  });
});

describe("the win test", () => {
  it("passes a candidate that passes each test", () => {
    const { inputs, cells } = corpusOf(40);
    const v = winTest(recordsOf(inputs, GOOD), { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    expect(v.pass).toBe(true);
    expect(v.inputs).toBe(40);
    expect(v.tests.gain.measures[0]!.median.value).toBeCloseTo(0.875);
    expect(v.tests.gain.measures[0]!.sign).toMatchObject({ better: 40, worse: 0, pass: true });
    expect(v.tests.stability).toEqual([]);
    expect(v.confirm).toEqual({ inputs: 40, needed: CONFIRM_INPUTS, enough: false });
    expect(Object.keys(v.shapes)).toEqual(["circle", "rect"]);
    expect(v.shapes["rect"]).toMatchObject({ inputs: 20, cellMin: true, pass: true });
  });

  it("fails a candidate only on the time test with the floor 0, and passes it with the default floor of 5 ms", () => {
    const { inputs, cells } = corpusOf(40);
    const records = recordsOf(inputs, GOOD, 3);
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: { ...FAST, timeFloorMs: 0 } });
    expect(v.pass).toBe(false);
    expect(v.tests.time.pass).toBe(false);
    expect(v.tests.time.median.value).toBeCloseTo(3);
    expect(v.tests.hard.pass && v.tests.gain.pass && v.tests.guards.every((g) => g.pass)).toBe(true);
    const floored = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    expect(floored.parameters.timeFloorMs).toBe(5);
    expect(floored.pass).toBe(true);
    expect(floored.tests.time.raised).toBe(40);
  });

  it("fails a candidate only on the median of one guard", () => {
    const { inputs, cells } = corpusOf(40);
    const v = winTest(
      recordsOf(inputs, () => ({ ...GOOD(), "pack.aspectError": 0.105 })),
      { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST },
    );
    expect(v.pass).toBe(false);
    const failed = v.tests.guards.filter((g) => !g.pass);
    expect(failed.map((g) => g.measure)).toEqual(["pack.aspectError"]);
    expect(failed[0]!.median.pass).toBe(false);
    expect(failed[0]!.tail.pass).toBe(true);
    expect(v.tests.hard.pass && v.tests.gain.pass && v.tests.time.pass).toBe(true);
  });

  it("fails a candidate with a new hard break or a record that is not deterministic", () => {
    const { inputs, cells } = corpusOf(20);
    const records = recordsOf(inputs, GOOD);
    records[0] = { ...records[0]!, hard: { "no-overlap": 1 } };
    records[2] = { ...records[2]!, deterministic: false };
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    expect(v.tests.hard).toMatchObject({ breaks: 1, notDeterministic: 1, pass: false });
    expect(v.pass).toBe(false);
  });

  it("leaves out the inputs without a measured record of each strategy, and counts them", () => {
    const { inputs, cells } = corpusOf(12);
    const records = recordsOf(inputs, GOOD);
    records[0] = { ...records[0]!, skipped: "unsupported mode: offline", measures: {} };
    records.push(record("cand", "c/extra/s1", GOOD()));
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    expect(v.inputs).toBe(11);
    expect(v.leftOut).toEqual({ inputs: 2, candidate: 1, current: 1 });
  });

  it("uses the stability guards when the records have change pairs", () => {
    const { inputs, cells } = corpusOf(20);
    const records = recordsOf(inputs, () => ({ ...GOOD(), "pack.stability.mean": 0.5 })).map((r) => (r.strategy === "rows" ? { ...r, measures: { ...r.measures, "pack.stability.mean": 0.1 } } : r));
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    expect(v.tests.stability.map((g) => g.measure)).toEqual(["pack.stability.mean"]);
    expect(v.tests.stability[0]!.pass).toBe(false);
    expect(v.pass).toBe(false);
  });

  it("writes the verdict as JSON and as a table", () => {
    const { inputs, cells } = corpusOf(20);
    const v = winTest(recordsOf(inputs, GOOD), { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: FAST });
    const json = JSON.parse(promotionJson(v)) as { pass: boolean; parameters: { timeFloorMs: number } };
    expect(json.pass).toBe(true);
    expect(json.parameters.timeFloorMs).toBe(5);
    const md = promotionMarkdown(v);
    expect(md).toContain("The verdict is **pass**");
    expect(md).toContain("The time floor: 5 ms");
    expect(md).toContain("the records of the verdict");
    expect(md).toContain("| rect | 10 | yes |");
  });

  it("reads the cells of a manifest", () => {
    const cells = cellsOf({ inputs: [{ id: "a", cell: { containerShape: "rect", containerSize: "fixed" } }, { id: 3 }] });
    expect([...cells.keys()]).toEqual(["a"]);
    expect(cellsOf(undefined).size).toBe(0);
  });
});

describe("the time source", () => {
  const params = { ...FAST, timeFloorMs: 0 };
  /** This function gives records with a CPU model and a corpus. */
  const onCpu = (records: readonly PromotionRecord[], cpu: (r: PromotionRecord) => string, corpus = "c"): PromotionRecord[] => records.map((r) => ({ ...r, corpus, env: { cpu: cpu(r) } }));

  it("names the CPU models of the records and warns when the two strategies have different ones", () => {
    const { inputs, cells } = corpusOf(20);
    const records = onCpu(recordsOf(inputs, GOOD), (r) => (r.strategy === "cand" ? "EPYC 9V45" : "EPYC 7763"));
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: params });
    expect(v.timeSource).toEqual({ kind: "records", corpora: ["c"], cpu: { candidate: ["EPYC 9V45"], current: ["EPYC 7763"] }, sameCpu: false });
    const md = promotionMarkdown(v);
    expect(md).toContain("`EPYC 9V45` for the candidate, `EPYC 7763` for the default");
    expect(md).toContain("**Warning:**");
  });

  it("reads the times only from the time records, by input id and strategy id", () => {
    const { inputs, cells } = corpusOf(20);
    // The main records have a slow candidate. The time records of one computer have a fast candidate.
    const records = onCpu(recordsOf(inputs, GOOD, 3), (r) => (r.strategy === "cand" ? "A" : "B"));
    const times = onCpu(recordsOf(inputs, GOOD, 1), () => "A", "t");
    const slow = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: params });
    expect(slow.tests.time.pass).toBe(false);
    const v = winTest(records, { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: params, times, timesFolder: "time" });
    expect(v.tests.time).toMatchObject({ inputs: 20, missing: 0, pass: true });
    expect(v.tests.time.median.value).toBeCloseTo(1);
    expect(v.pass).toBe(true);
    expect(v.timeSource).toEqual({ kind: "times", folder: "time", corpora: ["t"], cpu: { candidate: ["A"], current: ["A"] }, sameCpu: true });
    expect(v.shapes["rect"]!.time.inputs).toBe(10);
    const md = promotionMarkdown(v);
    expect(md).toContain("the time records of `--times` in `time`");
    expect(md).not.toContain("**Warning:**");
  });

  it("uses the inputs of the time records when they are other inputs than those of the verdict", () => {
    const { inputs, cells } = corpusOf(20);
    const other = inputs.slice(0, 6).map((id) => `t/${id}`);
    const times = recordsOf(other, GOOD, 1);
    times[0] = { ...times[0]!, skipped: "unsupported mode: offline", measures: {} };
    const v = winTest(recordsOf(inputs, GOOD), { candidate: "cand", current: "rows", win: ["pack.fill"], cells, parameters: params, times });
    expect(v.inputs).toBe(20);
    expect(v.tests.time.inputs).toBe(5);
    // The cells of the time records are absent, so their inputs have the shape unknown
    expect(v.shapes["rect"]!.time.inputs).toBe(0);
  });
});

describe("the command line of the win test", () => {
  const root = mkdtempSync(join(tmpdir(), "promote-test-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const { inputs, cells } = corpusOf(20);
  const manifest = { inputs: inputs.map((id) => ({ id, cell: cells.get(id) })) };
  /** This function writes a folder of records and its manifest. */
  const folderOf = (name: string, records: readonly PromotionRecord[]): string => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "records.jsonl"), records.map((r) => `${JSON.stringify(r)}\n`).join(""));
    writeFileSync(join(dir, "corpus.json"), JSON.stringify(manifest));
    return dir;
  };
  const main = folderOf("main", recordsOf(inputs, GOOD, 3));
  const time = folderOf(
    "time",
    recordsOf(inputs, GOOD, 1).map((r) => ({ ...r, env: { cpu: "A" } })),
  );
  const args = (out: string, ...more: string[]): string[] => [main, "--candidate", "cand", "--default", "rows", "--out", join(root, out), ...more];

  it("keeps the floor 0 with --time-floor-ms 0", () => {
    const v = promoteMain(args("zero", "--time-floor-ms", "0"));
    expect(v.parameters.timeFloorMs).toBe(0);
    expect(v.tests.time.pass).toBe(false);
    expect(v.tests.time.raised).toBe(0);
    const json = JSON.parse(readFileSync(join(root, "zero", "promotion.json"), "utf8")) as { pass: boolean; parameters: { timeFloorMs: number } };
    expect(json.parameters.timeFloorMs).toBe(0);
    expect(json.pass).toBe(false);
    expect(promoteMain(args("five")).parameters.timeFloorMs).toBe(5);
  });

  it("reads the times of --times", () => {
    const v = promoteMain(args("times", "--time-floor-ms", "0", "--times", time));
    expect(v.timeSource).toMatchObject({ kind: "times", folder: time, cpu: { candidate: ["A"], current: ["A"] }, sameCpu: true });
    expect(v.tests.time.pass).toBe(true);
    expect(v.shapes["circle"]!.time.inputs).toBe(10);
    const md = readFileSync(join(root, "times", "promotion.md"), "utf8");
    expect(md).toContain("`--times`");
    const json = JSON.parse(readFileSync(join(root, "times", "promotion.json"), "utf8")) as { timeSource: { kind: string } };
    expect(json.timeSource.kind).toBe("times");
  });
});
