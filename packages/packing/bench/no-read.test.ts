import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { budgetNoRead, commandText, gateNoRead, noReadLines, promotionNoRead, warningLine } from "./no-read.ts";

const models = (list: { model: string; jobs: number }[], line: string | null = null) => ({ models: list, line, floor: null, level: null });
const report = { env: { cpu: "Made-up CPU 1" }, inputs: [1, 2, 3] };

describe("promotionNoRead", () => {
  it("gives a line with the count and the reason on no read, and no line on pass or fail", () => {
    const v = { candidate: "a", current: "b", inputs: 40, reason: "no read: 2 CPU models (X, Y)" };
    expect(promotionNoRead({ ...v, status: "no read" })).toEqual(["The win test of a against b gives no read over 40 inputs (no read: 2 CPU models (X, Y)). It is not a pass."]);
    expect(promotionNoRead({ ...v, status: "pass" })).toEqual([]);
    expect(promotionNoRead({ ...v, status: "fail" })).toEqual([]);
  });
});

describe("gateNoRead", () => {
  const lines = [{ measure: "aa.noise" as const, value: 0.07, max: 0.05, pass: false }];
  it("gives the noise, the cap, the cases and the CPU on cannot-decide", () => {
    expect(gateNoRead({ gate: "g", verdict: "cannot-decide", time: null, lines }, report)).toEqual([
      "The time gate g gives no read: the A/A noise 0.0700 is above the cap 0.0500, over 3 cases on the CPU Made-up CPU 1. The job retry decides. It is not a pass.",
    ]);
  });
  it("gives a line for a report-only time verdict that cannot decide, also on a pass", () => {
    expect(gateNoRead({ gate: "g", verdict: "pass", time: "cannot decide", lines: [] }, null)).toEqual([
      "The time verdict of the gate g gives no read over an unknown count of cases on an unknown CPU. It is a report, and it is not a pass.",
    ]);
  });
  it("gives no line on a pass or a fail with a read", () => {
    expect(gateNoRead({ gate: "g", verdict: "pass", time: "same", lines }, report)).toEqual([]);
    expect(gateNoRead({ gate: "g", verdict: "fail", time: "slower", lines }, report)).toEqual([]);
  });
});

describe("budgetNoRead", () => {
  const base = { arm: "x", reasons: [] as string[] };
  it("gives the jobs, the reasons and the models on cannot decide", () => {
    const b = { ...base, verdict: "cannot decide" as const, reasons: ["a decision needs 3 jobs, not 2"], models: models([{ model: "M1", jobs: 2 }]) };
    expect(budgetNoRead(b)).toEqual(["The time budget of x gives no read over 2 jobs. The reasons: a decision needs 3 jobs, not 2. The CPU models: M1 (2 jobs). It is not a pass."]);
  });
  it("gives a line for jobs on two CPU models, also on a decided verdict", () => {
    const b = { ...base, verdict: "promoted" as const, models: models([{ model: "M1", jobs: 2 }, { model: "M2", jobs: 1 }], "models not tested at 3 jobs") };
    expect(budgetNoRead(b)).toEqual(["The time budget of x has jobs on 2 CPU models: M1 (2 jobs), M2 (1 job). models not tested at 3 jobs."]);
    expect(budgetNoRead({ ...b, models: models([{ model: "M1", jobs: 3 }]) })).toEqual([]);
  });
});

describe("the annotation", () => {
  it("encodes the percent sign and the line ends, and the colon and the comma of a property", () => {
    expect(commandText("50% a\nb\r")).toBe("50%25 a%0Ab%0D");
    expect(commandText("a: b, c", true)).toBe("a%3A b%2C c");
    expect(warningLine("no read (gate)", "x: 1")).toBe("::warning title=no read (gate)::x: 1");
  });

  it("reads the gate file and the paired report beside it", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-read-"));
    try {
      writeFileSync(join(dir, "gate.json"), JSON.stringify({ gate: "g", verdict: "pass", time: "cannot decide", lines: [] }));
      writeFileSync(join(dir, "paired-time.json"), JSON.stringify(report));
      expect(noReadLines("gate", join(dir, "gate.json"))).toEqual(["The time verdict of the gate g gives no read over 3 cases on the CPU Made-up CPU 1. It is a report, and it is not a pass."]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the workflows", () => {
  const workflow = (name: string): string => readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");
  it("start the no-read lines after each gate that can give no read", () => {
    expect(workflow("promotion.yml")).toContain("bench/no-read.ts promotion");
    expect(workflow("time-gate.yml").match(/bench\/no-read\.ts gate/g)?.length).toBe(2);
    expect(workflow("paired-time.yml")).toContain("bench/no-read.ts gate");
    expect(workflow("paired-time.yml")).toContain("bench/no-read.ts budget");
  });
});
