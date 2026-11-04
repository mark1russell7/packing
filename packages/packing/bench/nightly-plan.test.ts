import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cellOf, cellsMain, planMain, seedsOf, shardsOf } from "./nightly-plan.ts";

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
    expect(cellOf(1, {}, {})).toEqual({ seed: 1, void: false });
    expect(cellOf(2, { stopped: "time" }, {})).toMatchObject({ void: true, reason: expect.stringMatching(/timeout stopped the arm active/) });
    expect(cellOf(3, {}, undefined)).toMatchObject({ void: true, reason: "the arm control has no summary" });
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
