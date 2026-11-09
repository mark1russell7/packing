import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { budgetNoRead, gateNoRead, main, MODELS_CASE, noReadLines, promotionNoRead } from "./no-read.ts";

const models = (list: { model: string; jobs: number }[], line: string | null = null) => ({ models: list, line, floor: null, level: null });
const report = { env: { cpu: "Made-up CPU 1" }, inputs: [1, 2, 3] };

describe("promotionNoRead", () => {
  it("gives a warning line with the count of the inputs and the reason on no read, and no line on pass or fail", () => {
    const v = { candidate: "a", current: "b", inputs: 40, reason: "no read: 2 CPU models (X, Y)" };
    const line = promotionNoRead({ ...v, status: "no read" });
    expect(line).toMatchObject({ outcome: "no read", level: "warning", title: "The win test over 40 inputs", reason: v.reason, noReads: { count: 1, cases: ["a against b"] } });
    expect(promotionNoRead({ ...v, status: "pass" })).toBeUndefined();
    expect(promotionNoRead({ ...v, status: "fail" })).toBeUndefined();
  });
});

describe("gateNoRead", () => {
  const lines = [{ measure: "aa.noise" as const, value: 0.07, max: 0.05, pass: false }];
  it("gives the noise, the cap, the cases and the CPU on cannot-decide", () => {
    const [line, ...rest] = gateNoRead({ gate: "g", verdict: "cannot-decide", time: null, lines }, report);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ outcome: "no read", level: "warning", reason: "The A/A noise 0.0700 is above the cap 0.0500, over 3 cases. The job retry decides", mixed: false });
    expect(line?.cpu).toContain("Made-up CPU 1");
  });
  it("gives a line for a report-only time verdict that cannot decide, also on a pass", () => {
    const out = gateNoRead({ gate: "g", verdict: "pass", time: "cannot decide", lines: [] }, null);
    expect(out.map((l) => [l.title, l.reason, l.cpu])).toEqual([["The time verdict of the gate g", "A report over an unknown count of cases", undefined]]);
  });
  it("gives no line on a pass or a fail with a read, and none for a report-only time verdict of slower", () => {
    expect(gateNoRead({ gate: "g", verdict: "pass", time: "same", lines }, report)).toEqual([]);
    expect(gateNoRead({ gate: "g", verdict: "fail", time: "slower", lines }, report)).toEqual([]);
  });
});

describe("budgetNoRead", () => {
  const base = { arm: "x", reasons: [] as string[] };
  it("gives the reasons and the jobs on each model on cannot decide", () => {
    const line = budgetNoRead({ ...base, verdict: "cannot decide", reasons: ["a decision needs 3 jobs, not 2"], models: models([{ model: "M1", jobs: 2 }]) });
    expect(line).toMatchObject({ outcome: "no read", reason: "a decision needs 3 jobs, not 2", noReads: { cases: ["x"] }, mixed: false });
    expect(line?.cpu).toContain("M1 (2 jobs)");
  });
  it("gives a no-read of the models for jobs on two CPU models, also on a decided verdict", () => {
    const b = { ...base, verdict: "promoted" as const, models: models([{ model: "M1", jobs: 2 }, { model: "M2", jobs: 1 }], "models not tested at 3 jobs") };
    expect(budgetNoRead(b)).toMatchObject({ total: 2, noReads: { count: 1, cases: [MODELS_CASE] }, reason: "models not tested at 3 jobs", mixed: true });
    expect(budgetNoRead({ ...b, models: models([{ model: "M1", jobs: 3 }]) })).toBeUndefined();
    expect(budgetNoRead({ ...b, verdict: "not promoted", models: models([{ model: "M1", jobs: 3 }]) })).toBeUndefined();
  });
});

describe("the files", () => {
  it("reads the gate file and the paired report beside it", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-read-"));
    try {
      writeFileSync(join(dir, "gate.json"), JSON.stringify({ gate: "g", verdict: "pass", time: "cannot decide", lines: [] }));
      writeFileSync(join(dir, "paired-time.json"), JSON.stringify(report));
      expect(noReadLines("gate", join(dir, "gate.json")).map((l) => l.reason)).toEqual(["A report over 3 cases"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes a warning and a summary line for a missing verdict file, and a plain log line with no no-read", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-read-"));
    try {
      const log: string[] = [];
      const summary = join(dir, "summary.md");
      writeFileSync(summary, "");
      expect(main(["budget", join(dir, "budget.json")], { log: (l) => log.push(l), summary })).toBe(0);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatch(/^::warning title=The budget verdict%3A no read/u);
      expect(readFileSync(summary, "utf8")).toContain("budget.json is missing");
      writeFileSync(join(dir, "budget.json"), JSON.stringify({ arm: "x", verdict: "promoted", reasons: [], models: models([{ model: "M1", jobs: 3 }]) }));
      log.length = 0;
      main(["budget", join(dir, "budget.json")], { log: (l) => log.push(l), summary });
      expect(log).toEqual(["The budget verdict has no no-read line."]);
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
