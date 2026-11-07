import { describe, expect, it } from "vitest";
import { BREAK_RULE, breaksOf, ENGINE_ENTRIES, equalMain, equalMarkdown, FAULTS, readBreakRule, readMinWaste, readRuns, windowAtBreaks } from "./skyline-equal.ts";

describe("the equality of the runs and the cell scan", () => {
  it("reads no difference on each family", () => {
    const reads = [...readRuns(200, 170), ...readBreakRule(200, 170)];
    expect(reads.length).toBe(15);
    expect(reads.filter((r) => r.differ > 0)).toEqual([]);
  });

  it("gives a difference with each fault", () => {
    const search = FAULTS["last of equal windows"]!.search!;
    expect(readRuns(200, 170, search).reduce((sum, r) => sum + r.differ, 0)).toBeGreaterThan(0);
    for (const name of ["no limit breaks", "no falling breaks"]) {
      expect(readBreakRule(200, 170, FAULTS[name]!.rule!).reduce((sum, r) => sum + r.differ, 0)).toBeGreaterThan(0);
    }
  });

  it("gives a read for the near ties of the rule mw, and none on whole heights", () => {
    const [near, whole] = readMinWaste(200, 170);
    expect(near!.family).toBe("near ties");
    expect(near!.differ).toBeGreaterThan(0);
    expect(whole!.differ).toBe(0);
  });

  it("gives an exit code of 1 only on a fault", async () => {
    const out = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      expect(await equalMain(["--cases", "500"])).toBe(0);
      expect(await equalMain(["--cases", "500", "--fault", "no limit breaks"])).toBe(1);
      await expect(equalMain(["--fault", "absent"])).rejects.toThrow(RangeError);
    } finally {
      process.stdout.write = out;
    }
  });
});

describe("the break rule", () => {
  it("names the cell 0, the breaks of the skyline and the breaks of the limit, once each", () => {
    expect(breaksOf([1, 1, 2, 2, 1])).toEqual([0, 2, 4]);
    expect(BREAK_RULE([1, 1, 2, 2], [5, 4, 4, 4])).toEqual([0, 1, 2]);
    expect(BREAK_RULE([1, 1, 2, 2], undefined)).toEqual([0, 2]);
  });

  it("finds a window at a break of the limit that a break of the skyline does not give", () => {
    const skyline = [0, 0, 0, 0];
    const limit = [1, 9, 9, 9];
    const found = windowAtBreaks(skyline, limit, BREAK_RULE(skyline, limit), 2, 5, Infinity);
    expect(found).toEqual({ x: 1, y: 0, first: 1 });
    expect(windowAtBreaks(skyline, limit, breaksOf(skyline), 2, 5, Infinity).first).toBe(-1);
  });
});

describe("the list of the entries", () => {
  it("has the 14 entries that reach the engine", () => {
    expect(ENGINE_ENTRIES.length).toBe(14);
    expect(new Set(ENGINE_ENTRIES).size).toBe(14);
  });
});

describe("the table of the reads", () => {
  it("has a row for each read", () => {
    expect(equalMarkdown([{ name: "window", family: "whole", cases: 3, differ: 1 }])).toContain("| window | whole | 3 | 1 |");
  });
});
