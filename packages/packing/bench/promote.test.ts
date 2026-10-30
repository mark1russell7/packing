import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MEASURE_SPECS, type MeasureId } from "@mark1russell7/packing";
import {
  bootstrapMedian,
  cellsOf,
  classify,
  CONFIRM_INPUTS,
  coverageOf,
  floorRatio,
  GUARD_DECLARATIONS,
  GUARD_SET_V1,
  GUARD_SETS,
  NO_VALUE,
  ORDER_FREE_GUARDS,
  ORDER_FREE_VIEW,
  PROMOTION_PARAMETERS,
  testsOf,
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
  type InputPair,
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

/** This function gives `n` inputs of two shapes, with a fixed container and a soft order, and their cells. `cell` changes the cells. */
function corpusOf(n: number, cell: InputCell = {}): { inputs: string[]; cells: Map<string, InputCell> } {
  const inputs = Array.from({ length: n }, (_, i) => `c/${i % 2 === 0 ? "rect" : "circle"}.n${i}/s1`);
  const cells = new Map(inputs.map((id, i) => [id, { containerShape: i % 2 === 0 ? "rect" : "circle", containerSize: "fixed", order: "soft", ...cell }]));
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
    const { inputs, cells } = corpusOf(40, { containerSize: "freeAspect" });
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

  it("stops with an error on a folder with no records", () => {
    const none = folderOf("none", []);
    expect(() => promoteMain([none, "--candidate", "cand", "--default", "rows", "--out", join(root, "none-out")])).toThrow(/has no records/);
  });

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

  it("names the guard set, compares the guard sets with --compare-guards, and refuses an unknown set", () => {
    const v1 = promoteMain(args("v1", "--guards", "v1"));
    expect(v1.guardSet).toBe("v1");
    expect(v1.compare).toBeUndefined();
    const v = promoteMain(args("compare", "--compare-guards"));
    expect(v.guardSet).toBe("v2");
    const json = JSON.parse(readFileSync(join(root, "compare", "promotion.json"), "utf8")) as { guardSet: string; coverage: unknown[]; compare: { v1: { pass: boolean }; v2: { pass: boolean } } };
    expect(json.guardSet).toBe("v2");
    expect(json.coverage.length).toBe(GUARD_DECLARATIONS.length);
    expect(json.compare.v1.pass).toBe(v.compare!.v1.pass);
    expect((json as unknown as { views: Record<string, { decides: boolean }> }).views[ORDER_FREE_VIEW]!.decides).toBe(false);
    expect(readFileSync(join(root, "compare", "promotion.md"), "utf8")).toContain("## The view: order not required");
    expect(readFileSync(join(root, "compare", "promotion.md"), "utf8")).toContain("The guard set: `v2`.");
    expect(() => promoteMain(args("bad", "--guards", "v3"))).toThrow("--guards needs v1 or v2");
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

describe("the declared guards", () => {
  /** The measures of a pair for the declaration test. Each guard measure has a value above 0, so a ratio is not at the floor. */
  const DECL_BASE: Record<string, number> = {
    ...BASE,
    "pack.order.inversions": 0.1,
    "pack.overflow": 1,
    "pack.stability.mean": 0.1,
    "pack.stability.q95": 0.1,
    "pack.stability.moved": 0.1,
  };
  /** An input of the declaration test: its cell, and the measures that change in each record. The value `undefined` removes a measure. */
  interface Case {
    cell: InputCell | undefined;
    candidate?: Record<string, number | undefined>;
    current?: Record<string, number | undefined>;
  }
  /** For each guard with a declaration: the inputs that declare the property, and the inputs that do not */
  const CASES: Record<string, { declares: Case[]; not: Case[] }> = {
    "pack.area": {
      declares: [{ cell: { containerSize: "fixed" } }, { cell: { containerSize: "freeArea" } }, { cell: undefined }],
      not: [{ cell: { containerSize: "fixed" }, candidate: { "pack.overflow": 0 }, current: { "pack.overflow": 2 } }],
    },
    "pack.aspectError": {
      declares: [{ cell: { containerSize: "freeAspect" } }],
      not: [{ cell: { containerSize: "fixed" } }, { cell: { containerSize: "freeArea" } }, { cell: { containerSize: "freeHeight" } }, { cell: undefined }],
    },
    "pack.order.inversions": {
      declares: [{ cell: { order: "soft" } }, { cell: { order: "hard" } }],
      not: [{ cell: { order: "free" } }, { cell: { containerSize: "fixed" } }, { cell: undefined }],
    },
    "pack.overflow": {
      declares: [{ cell: { containerSize: "fixed" } }],
      not: [{ cell: { containerSize: "freeAspect" } }, { cell: undefined }],
    },
    ...Object.fromEntries(
      ["pack.stability.mean", "pack.stability.q95", "pack.stability.moved"].map((m) => [m, { declares: [{ cell: undefined }], not: [{ cell: undefined, candidate: { [m]: undefined }, current: { [m]: undefined } }] }]),
    ),
  };

  /** This function gives the measures of a record, with the changes of a case. */
  const measuresOf = (changes: Record<string, number | undefined> = {}): Record<string, number> => {
    const out: Record<string, number> = { ...DECL_BASE };
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return out;
  };

  /** This function gives the pair of a case. With `worse`, the candidate has twice the value of the default on `measure`. */
  const pairOf = (id: string, c: Case, measure: string, worse: boolean): InputPair => {
    const current = measuresOf(c.current);
    const candidate = measuresOf(c.candidate);
    if (worse) candidate[measure] = 2 * current[measure]!;
    return { input: id, candidate: record("cand", id, candidate), current: record("rows", id, current) };
  };

  it("has a declaring and a not-declaring input for each guard with a declaration", () => {
    const declared = GUARD_DECLARATIONS.filter((g) => g.declaration !== undefined).map((g) => g.measure);
    expect(declared.toSorted()).toEqual(Object.keys(CASES).toSorted());
  });

  for (const g of GUARD_DECLARATIONS.filter((x) => x.declaration !== undefined)) {
    it(`counts ${g.measure} only on the inputs that declare ${g.declaration!.field}`, () => {
      const cases = CASES[g.measure]!;
      for (const yes of cases.declares) {
        for (const no of cases.not) {
          const pairs = [pairOf("yes", yes, g.measure, true), pairOf("no", no, g.measure, false)];
          const cells = new Map<string, InputCell>();
          if (yes.cell !== undefined) cells.set("yes", yes.cell);
          if (no.cell !== undefined) cells.set("no", no.cell);
          expect(g.declaration!.declares(yes.cell, pairs[0]!)).toBe(true);
          expect(g.declaration!.declares(no.cell, pairs[1]!)).toBe(false);
          const t = testsOf(pairs, ["pack.fill"], cells, PROMOTION_PARAMETERS, false, undefined, GUARD_DECLARATIONS);
          const result = [...t.guards, ...t.stability].find((x) => x.measure === g.measure)!;
          // Only the declaring input counts: its ratio is 2, and the ratio of the other input is 1
          expect(result.inputs).toBe(1);
          expect(result.median.value).toBeCloseTo(2);
          const [coverage] = coverageOf([g], pairs, cells);
          expect(coverage).toMatchObject({ covered: 1, leftOut: 1, reasons: { [g.declaration!.reason]: 1 } });
          // An input set that does not declare the property leaves the guard out
          const none = testsOf([pairs[1]!], ["pack.fill"], cells, PROMOTION_PARAMETERS, false, undefined, GUARD_DECLARATIONS);
          expect([...none.guards, ...none.stability].map((x) => x.measure)).not.toContain(g.measure);
        }
      }
    });
  }

  it("applies a guard with no declaration, the hard rules, the gain and the time to each input", () => {
    const undeclared = GUARD_DECLARATIONS.filter((g) => g.declaration === undefined).map((g) => g.measure);
    expect(undeclared).toEqual(["pack.fill"]);
    const cases: Case[] = [{ cell: { containerSize: "fixed", order: "free" } }, { cell: { containerSize: "freeArea" } }, { cell: { containerSize: "freeAspect", order: "soft" } }, { cell: undefined }];
    const pairs = cases.map((c, i) => pairOf(`i${i}`, c, "pack.fill", false));
    const cells = new Map(cases.flatMap((c, i) => (c.cell === undefined ? [] : [[`i${i}`, c.cell] as const])));
    const t = testsOf(pairs, ["pack.fill"], cells, PROMOTION_PARAMETERS, false, undefined, GUARD_DECLARATIONS);
    expect(t.guards.find((x) => x.measure === "pack.fill")!.inputs).toBe(4);
    expect(t.hard.inputs).toBe(4);
    expect(t.gain.measures[0]!.inputs).toBe(4);
    expect(t.time.inputs).toBe(4);
    const coverage = coverageOf(GUARD_DECLARATIONS, pairs, cells).find((c) => c.measure === "pack.fill")!;
    expect(coverage).toEqual({ measure: "pack.fill", kind: "guards", field: "none", covered: 4, leftOut: 0, reasons: {} });
    // A guard with no declaration and no value fails, and the coverage names the reason
    const empty = pairs.map((p) => ({ ...p, candidate: { ...p.candidate, measures: {} } }));
    const failed = testsOf(empty, ["pack.fill"], cells, PROMOTION_PARAMETERS, false, undefined, GUARD_DECLARATIONS);
    expect(failed.guards.find((x) => x.measure === "pack.fill")).toMatchObject({ inputs: 0, pass: false });
    expect(coverageOf(GUARD_DECLARATIONS, empty, cells).find((c) => c.measure === "pack.fill")!.reasons).toEqual({ [NO_VALUE]: 4 });
  });

  it("keeps the guards of v1: the four guards on each input, the overflow on the fixed cells", () => {
    expect(GUARD_SETS.v1).toBe(GUARD_SET_V1);
    expect(GUARD_SETS.v2).toBe(GUARD_DECLARATIONS);
    expect(GUARD_SET_V1.filter((g) => g.declaration === undefined).map((g) => g.measure)).toEqual(["pack.area", "pack.fill", "pack.aspectError", "pack.order.inversions"]);
    expect(GUARD_SET_V1.filter((g) => g.declaration !== undefined).map((g) => g.measure)).toEqual(["pack.overflow", "pack.stability.mean", "pack.stability.q95", "pack.stability.moved"]);
  });
});

describe("the guard sets on a fixture", () => {
  interface GuardFixture {
    candidate: string;
    current: string;
    win: MeasureId[];
    parameters: { bootstrapRuns: number };
    cells: Record<string, InputCell>;
    records: PromotionRecord[];
    v1: { pass: boolean; tests: unknown; shapes: unknown };
  }
  const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "promote-guards-v1.json"), "utf8")) as GuardFixture;
  const options = { candidate: fixture.candidate, current: fixture.current, win: fixture.win, cells: new Map(Object.entries(fixture.cells)), parameters: fixture.parameters };

  it("gives the old verdict with the guard set v1", () => {
    const v = winTest(fixture.records, { ...options, guards: "v1" });
    expect(v.guardSet).toBe("v1");
    const json = JSON.parse(promotionJson(v)) as GuardFixture["v1"];
    expect({ pass: json.pass, tests: json.tests, shapes: json.shapes }).toEqual(fixture.v1);
    expect(v.pass).toBe(false);
  });

  it("applies the guards of v2 only to the declaring inputs, and counts the coverage", () => {
    const v = winTest(fixture.records, options);
    expect(v.guardSet).toBe("v2");
    expect(v.pass).toBe(true);
    const covered = Object.fromEntries(v.coverage.map((c) => [c.measure, [c.covered, c.leftOut]]));
    expect(covered).toMatchObject({ "pack.area": [24, 6], "pack.fill": [30, 0], "pack.aspectError": [6, 24], "pack.order.inversions": [4, 26], "pack.overflow": [14, 16] });
    expect(v.coverage.find((c) => c.measure === "pack.area")!.reasons).toEqual({ "the container is fixed and the placed counts are different": 6 });
    expect(v.tests.guards.map((g) => [g.measure, g.inputs])).toEqual([
      ["pack.area", 24],
      ["pack.fill", 30],
      ["pack.aspectError", 6],
      ["pack.order.inversions", 4],
      ["pack.overflow", 14],
    ]);
  });

  it("gives the verdicts of v1 and v2 side by side with compareGuards", () => {
    const v = winTest(fixture.records, { ...options, compareGuards: true });
    expect(v.compare!.v1.pass).toBe(false);
    expect(v.compare!.v2.pass).toBe(true);
    expect(v.compare!.v2.tests).toBe(v.tests);
    const md = promotionMarkdown(v);
    expect(md).toContain("## The guard sets v1 and v2");
    expect(md).toContain("| `pack.order.inversions` | 30 | Infinity | 0.8667 | fail | 4 | 1 | 0 | pass |");
    expect(md).toContain("| **verdict** | 30 | - | - | **fail** | 30 | - | - | **pass** |");
    expect(md).toContain("The coverage of the guard set `v1`:");
    expect(md).toContain("| `pack.aspectError` | `cell.containerSize = freeAspect` | 6 | 24 | 24: the container declares no aspect |");
    expect(promotionMarkdown(winTest(fixture.records, options))).not.toContain("## The guard sets v1 and v2");
  });

  it("gives the view orderNotRequired with compareGuards: v2 without pack.order.inversions, labeled as a view that decides nothing", () => {
    expect(ORDER_FREE_GUARDS.map((g) => g.measure)).toEqual(GUARD_DECLARATIONS.map((g) => g.measure).filter((m) => m !== "pack.order.inversions"));
    expect(winTest(fixture.records, options).views).toBeUndefined();
    // The candidate puts 100 more pairs out of order on each input that declares an order
    const ordered = new Set(Object.entries(fixture.cells).flatMap(([id, c]) => (c.order === "soft" || c.order === "hard" ? [id] : [])));
    const records = fixture.records.map((r) => (r.strategy === fixture.candidate && ordered.has(r.input) ? { ...r, measures: { ...r.measures, "pack.order.inversions": 100 + (r.measures["pack.order.inversions"] ?? 0) } } : r));
    const v = winTest(records, { ...options, compareGuards: true });
    const view = v.views![ORDER_FREE_VIEW];
    expect([v.pass, v.compare!.v2.pass, view.pass]).toEqual([false, false, true]);
    expect(view).toMatchObject({ from: "v2", without: ["pack.order.inversions"], decides: false });
    expect(view.tests.guards.map((g) => g.measure)).not.toContain("pack.order.inversions");
    expect(view.coverage.map((c) => c.measure)).toEqual(ORDER_FREE_GUARDS.map((g) => g.measure));
    // The other guards, the gain and the time are those of v2
    expect(view.tests.gain.measures.map((g) => [g.measure, g.median.value, g.pass])).toEqual(v.tests.gain.measures.map((g) => [g.measure, g.median.value, g.pass]));
    expect(view.tests.time.pass).toBe(v.tests.time.pass);
    const brief = (gs: readonly { measure: string; inputs: number; pass: boolean }[]): unknown[] => gs.map((g) => [g.measure, g.inputs, g.pass]);
    expect(brief(view.tests.guards)).toEqual(brief(v.tests.guards.filter((g) => g.measure !== "pack.order.inversions")));
    const md = promotionMarkdown(v);
    expect(md).toContain("## The view: order not required");
    expect(md).toContain("This view is exploratory, and it decides nothing.");
    expect(md).toContain("| **verdict** | 30 | - | - | **fail** | 30 | - | - | **pass** |");
    expect(JSON.parse(promotionJson(v)).views.orderNotRequired.decides).toBe(false);
  });
});
