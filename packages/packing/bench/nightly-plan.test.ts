import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cellOf, cellsMain, planMain, seedsOf, shardsOf, slowLines, slowShare } from "./nightly-plan.ts";

// The plan and the cells of the control run of the active draw (k120).

describe("the plan of the control run", () => {
  it("takes 5 or more different whole numbers as the seeds", () => {
    expect(seedsOf("[1, 2, 3, 4, 5]")).toEqual([1, 2, 3, 4, 5]);
    expect(seedsOf("[9, 3, 7, 1, 5, 11]")).toEqual([9, 3, 7, 1, 5, 11]);
    for (const bad of ["[1, 2, 3, 4]", "[1, 2, 3, 4, 4]", "[1, 2, 3, 4, 5.5]", '[1, 2, 3, 4, "5"]', '{"a": 1}', "1,2,3,4,5", ""]) {
      expect(() => seedsOf(bad), bad).toThrow(RangeError);
    }
  });

  it("takes 1 to 16 shards", () => {
    expect(shardsOf("1")).toEqual([0]);
    expect(shardsOf("4")).toEqual([0, 1, 2, 3]);
    expect(shardsOf("16")).toHaveLength(16);
    for (const bad of ["0", "17", "04", "-1", "2.5", "a", ""]) expect(() => shardsOf(bad), bad).toThrow(RangeError);
  });

  it("gives the lines for GITHUB_OUTPUT", () => {
    expect(planMain(["--seeds", "[1, 2, 3, 4, 5]", "--shards", "2"])).toEqual(["seeds=[1,2,3,4,5]", "shards=[0,1]"]);
    expect(() => planMain(["--seeds", "[1, 2, 3, 4, 5]"])).toThrow(/Start the command/);
  });
});

describe("the cells of the control run", () => {
  it("voids a cell when an arm has no summary or the timeout stopped it", () => {
    const none = { slow: 0, pairs: 0 };
    expect(cellOf(1, {}, {})).toEqual({ seed: 1, void: false, slow: { active: none, control: none } });
    expect(cellOf(2, { stopped: "time" }, {})).toMatchObject({ void: true, reason: expect.stringMatching(/timeout stopped the arm active/) });
    expect(cellOf(3, {}, undefined)).toMatchObject({ void: true, reason: "the arm control has no summary" });
  });

  it("keeps the slow candidates of each arm in the cell, also in a void cell, and tells when the shares differ", () => {
    const arm = (slow: number, pairs: number, stopped?: string) => ({ pairs, configs: { reasons: { slow, "check:shape": 7 } }, ...(stopped === undefined ? {} : { stopped }) });
    const even = cellOf(1, arm(2, 398), arm(2, 398));
    expect(even.slow).toEqual({ active: { slow: 2, pairs: 398 }, control: { slow: 2, pairs: 398 } });
    expect(slowShare(even.slow!.active)).toBe(0.005);
    const uneven = cellOf(2, arm(5, 400), arm(0, 400));
    const stopped = cellOf(3, arm(1, 400), arm(0, 390, "time"));
    expect(stopped).toMatchObject({ void: true, slow: { active: { slow: 1 }, control: { slow: 0, pairs: 390 } } });
    expect(cellOf(4, {}, { pairs: 400 }).slow).toEqual({ active: { slow: 0, pairs: 0 }, control: { slow: 0, pairs: 400 } });
    const lines = slowLines([even, uneven, stopped, cellOf(5, arm(0, 400), arm(0, 400)), cellOf(6, undefined, arm(3, 400))]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("The cell of the seed 1 has slow candidates: active 2 (0.5 %), control 2 (0.5 %).");
    expect(lines[1]).toMatch(/^The cell of the seed 2 has slow candidates: active 5 \(1\.2 %\), control 0 \(0\.0 %\)\. The slow shares of the arms differ/);
    expect(lines[2]).toMatch(/seed 3 .* differ/);
    expect(slowLines([cellOf(1, arm(0, 400), arm(0, 400))])).toEqual(["No arm has a slow candidate."]);
  });

  it("writes the record and gives the seeds of the cells that are not void", () => {
    const dir = mkdtempSync(join(tmpdir(), "cells-"));
    const write = (name: string, summary: object): void => {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, "sample.json"), JSON.stringify(summary));
    };
    for (const s of [1, 2, 3, 4, 5, 6]) {
      write(`nightly-arm-active-${s}`, s === 6 ? { stopped: "time" } : {});
      write(`nightly-arm-control-${s}`, {});
    }
    const out = join(dir, "cells.json");
    const record = cellsMain(["--arms", dir, "--seeds", "[1, 2, 3, 4, 5, 6]", "--out", out, "--commit", "abc", "--event", "push"]);
    expect(record).toMatchObject({ commit: "abc", event: "push", live: [1, 2, 3, 4, 5] });
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(record);
    // With 5 seeds and one void cell, 4 cells are left: the record is written, then the command fails.
    expect(() => cellsMain(["--arms", dir, "--seeds", "[2, 3, 4, 5, 6]", "--out", out])).toThrow(/Only 4 of 5 cells/);
    expect(JSON.parse(readFileSync(out, "utf8")).live).toEqual([2, 3, 4, 5]);
  });
});
