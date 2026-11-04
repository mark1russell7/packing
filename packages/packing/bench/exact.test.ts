// The comparison of roadmap item k10. The tests use made-up strips, with small counts and a few entries.
import { describe, expect, it } from "vitest";
import { breaksOf, compare, countLines, entriesOf, entryLines, EXACT_FAMILIES, packEntry, proofLines, sizesOf, solveCase, summaryOf, type ExactCaseRecord, type ExactEntryRecord } from "./exact.ts";
import { ENTRIES } from "./entries.ts";

const family = EXACT_FAMILIES.find((f) => f.name === "berkey-wang.I")!;
const LIST = "skyline,shelf-first,maxrects-bl";

/** This function gives a record of a search. */
const caseOf = (over: Partial<ExactCaseRecord> = {}): ExactCaseRecord => ({
  kind: "exact",
  family: "f",
  n: 4,
  seed: 1,
  status: "optimal",
  proof: "exhausted",
  height: 10,
  lowerBound: 10,
  bound: 9,
  nodes: 5,
  ms: 1,
  sameBytes: true,
  breaks: 0,
  ...over,
});

/** This function gives a record of an entry. */
const entryOf = (over: Partial<ExactEntryRecord> = {}): ExactEntryRecord => ({ kind: "entry", family: "f", n: 4, seed: 1, entry: "e", height: 11, breaks: 0, strictBreaks: 0, gap: 0.1, ...over });

describe("the families of bench/exact.ts", () => {
  it("gives whole strips that exactStrip accepts", () => {
    expect(EXACT_FAMILIES.length).toBe(9);
    for (const f of EXACT_FAMILIES) {
      const input = f.make(1, 6);
      const record = solveCase(f.name, 6, 1, input, 2000, () => 0);
      expect(record.lowerBound).toBeGreaterThanOrEqual(record.bound);
      expect(record.height).toBeGreaterThanOrEqual(record.lowerBound);
      expect(record.breaks).toBe(0);
      expect(record.sameBytes).toBe(true);
    }
  });
});

describe("compare", () => {
  const { cases, records } = compare([family], [5], 2, 200000, LIST, () => 0);

  it("gives a record for each case and each entry, and no break", () => {
    expect(cases.length).toBe(2);
    expect(records.length).toBe(6);
    expect(breaksOf(cases, records)).toEqual([]);
    expect(records.every((r) => r.gap !== null && r.gap >= 0)).toBe(true);
  });

  it("writes a summary with each table", () => {
    const text = summaryOf(cases, records, [], { nodes: 10, ms: 2, peakRss: 2 ** 21 });
    expect(text).toContain("| 5 | 2 | 2 |");
    expect(text).toContain("5000 nodes each second, peak memory 2 MiB");
    expect(text).toContain("| skyline |");
    expect(text).toContain("Breaks: 0. Entries below a proved optimum: 0.");
    expect(text).toContain("| berkey-wang.I | 5 | 2 | 2 |");
  });

  it("gives no gap when the search has no proof", () => {
    const stopped = caseOf({ status: "limit", proof: null, height: 40, lowerBound: 30, family: family.name });
    const record = packEntry(ENTRIES.find((e) => e.id === "skyline")!, stopped, family.make(1, 6));
    expect(record.gap).toBeNull();
    expect(record.height).not.toBeNull();
  });
});

describe("breaksOf", () => {
  it.each<[string, ExactCaseRecord, RegExp]>([
    ["different bytes", caseOf({ sameBytes: false }), /different bytes/],
    ["a bad layout", caseOf({ breaks: 2 }), /2 hard breaks/],
    ["a lower bound under the k51 bound", caseOf({ status: "limit", lowerBound: 8, bound: 9 }), /fell below/],
    ["a bound above the optimum", caseOf({ bound: 11, lowerBound: 11 }), /above a proved optimum/],
  ])("finds %s", (_, record, what) => {
    expect(breaksOf([record], [])[0]!.what).toMatch(what);
  });

  it("finds an entry under the optimum, only for a layout with no overlap", () => {
    expect(breaksOf([], [entryOf({ gap: -0.1 })])[0]!.what).toMatch(/below the proved optimum/);
    expect(breaksOf([], [entryOf({ gap: -0.1, strictBreaks: 1 })])).toEqual([]);
    expect(breaksOf([], [entryOf({ breaks: 1, strictBreaks: 1 })])).toEqual([]);
    expect(breaksOf([], [entryOf()])).toEqual([]);
  });
});

describe("the tables", () => {
  it("ranks the entries by the mean gap, and it leaves out what has no gap", () => {
    const lines = entryLines([entryOf({ entry: "b", gap: 0 }), entryOf({ entry: "a", gap: 0.2 }), entryOf({ entry: "a", gap: 0 }), entryOf({ entry: "c", gap: null }), entryOf({ entry: "d", gap: 0, breaks: 1 }), entryOf({ entry: "aa", gap: 0 })]);
    expect(lines.map((l) => l.entry)).toEqual(["aa", "b", "a"]);
    expect(lines[2]).toMatchObject({ cases: 2, atOptimum: 1, worstGap: 0.2 });
    expect(lines[2]!.meanGap).toBeCloseTo(0.1);
    expect(lines[2]!.low).toBeGreaterThan(0);
    expect(lines[2]!.high).toBeLessThan(1);
  });

  it("counts the proofs of each count of items", () => {
    const lines = countLines([caseOf({ n: 8 }), caseOf({ n: 4 }), caseOf({ n: 4, status: "limit" })], [entryOf({ n: 4 })]);
    expect(lines).toEqual([
      { n: 4, cases: 2, proved: 1, bestEntry: "e", bestGap: 0.1 },
      { n: 8, cases: 1, proved: 1, bestEntry: null, bestGap: null },
    ]);
    expect(summaryOf([caseOf()], [], [{ family: "f", n: 4, seed: 1, what: "x" }], { nodes: 0, ms: 0, peakRss: 0 })).toContain("- f n 4 seed 1: x");
  });
});

describe("proofLines", () => {
  it("counts each family and count of items", () => {
    expect(proofLines([caseOf(), caseOf({ status: "limit" }), caseOf({ n: 8 })])).toEqual([
      { family: "f", n: 4, cases: 2, proved: 1 },
      { family: "f", n: 8, cases: 1, proved: 1 },
    ]);
  });
});

describe("the arguments", () => {
  it("reads the sizes", () => {
    expect(sizesOf("6,8")).toEqual([6, 8]);
    expect(() => sizesOf("6,x")).toThrow(RangeError);
  });

  it("reads the entries, and it keeps those of the strip cell", () => {
    const input = family.make(1, 6);
    expect(entriesOf(LIST, input).map((e) => e.id)).toEqual(LIST.split(","));
    expect(entriesOf("all", input).length).toBeGreaterThan(20);
    expect(() => entriesOf("nothing", input)).toThrow(RangeError);
  });
});
