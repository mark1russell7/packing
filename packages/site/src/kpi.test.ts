import { describe, expect, it } from "vitest";
import { kpiFile, staleText, weeklyTrend, type KpiFacts } from "./kpi.ts";

const at = (date: string): number => Date.parse(`${date}T12:00:00Z`);

const FACTS: KpiFacts = { picker: 31, strategies: 31, families: 20, lawPairs: 40, pages: ["The 31 strategies."], trend: [], explorer: false };

describe("the stale text", () => {
  it("counts each place with another count of strategies", () => {
    expect(staleText(["The 31 strategies.", "All 31 strategies."], 31)).toBe(0);
    expect(staleText(["The 8 strategies.", "Of 22 strategies, and 31 strategies."], 31)).toBe(2);
  });
});

describe("the weekly trend", () => {
  it("needs points in two calendar weeks", () => {
    // These two days are a Sunday and a Monday, so they are in two weeks.
    expect(weeklyTrend(["2026-11-01", "2026-11-02"], at("2026-11-04"))).toBe(true);
    // These two days are a Wednesday and a Thursday of one week.
    expect(weeklyTrend(["2026-10-28", "2026-10-29"], at("2026-10-30"))).toBe(false);
    expect(weeklyTrend([], at("2026-11-04"))).toBe(false);
  });

  it("needs a last point of the last 7 days", () => {
    expect(weeklyTrend(["2026-10-01", "2026-10-29"], at("2026-11-04"))).toBe(true);
    expect(weeklyTrend(["2026-10-01", "2026-10-29"], at("2026-11-06"))).toBe(false);
  });
});

describe("the file", () => {
  it("has the format, the time, the commit and the six measures", () => {
    const file = kpiFile(FACTS, Date.parse("2026-11-04T17:00:00.500Z"), "abc");
    expect(file).toMatchObject({ format: "kpi/1", project: "packing", at: "2026-11-04T17:00:00Z", commit: "abc" });
    expect(Object.fromEntries(file.measures.map((m) => [m.id, m.value]))).toEqual({ "picker-strategies": 31, "stale-text": 0, "input-families": 20, "law-pairs-covered": 40, "coverage-shown": 0, "explorer-live": 0 });
  });

  it("tells the page of the explorer", () => {
    const file = kpiFile({ ...FACTS, explorer: true }, 0, "abc");
    expect(file.measures.find((m) => m.id === "explorer-live")?.value).toBe(1);
  });
});
