import { describe, expect, it } from "vitest";
import { kpiInput, staleText, weeklyTrend, type KpiFacts } from "./kpi.ts";

const at = (date: string): number => Date.parse(`${date}T12:00:00Z`);

const FACTS: KpiFacts = { picker: 31, strategies: 31, families: 20, lawPairs: 40, pages: ["The 31 strategies."], trend: [], explorer: false, commitAt: "2026-11-04T16:00:00Z", lawPairsAt: "2026-11-04T15:00:00Z", coverageAt: "2026-10-29T02:50:10Z" };

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
  it("has the project and the six measures", () => {
    const file = kpiInput(FACTS, Date.parse("2026-11-04T17:00:00.500Z"));
    expect(file.project).toBe("packing");
    expect(Object.fromEntries(file.measures.map((m) => [m.id, m.value]))).toEqual({ "picker-strategies": 31, "stale-text": 0, "input-families": 20, "law-pairs-covered": 40, "coverage-shown": 0, "explorer-live": 0 });
  });

  it("gives each measure the time of its data and not the time of the build", () => {
    const file = kpiInput({ ...FACTS, trend: ["2026-10-28", "2026-10-21"] }, Date.parse("2026-11-04T17:00:00Z"));
    const times = Object.fromEntries(file.measures.map((m) => [m.id, m.at]));
    expect(times["picker-strategies"]).toBe(FACTS.commitAt);
    expect(times["stale-text"]).toBe(FACTS.commitAt);
    expect(times["law-pairs-covered"]).toBe(FACTS.lawPairsAt);
    expect(times["coverage-shown"]).toBe("2026-10-28T00:00:00Z");
    expect(file.at).toBe("2026-10-28T00:00:00Z");
  });

  it("takes the time of the coverage file when the trend is empty", () => {
    const file = kpiInput(FACTS, 0);
    expect(file.measures.find((m) => m.id === "coverage-shown")?.at).toBe(FACTS.coverageAt);
    expect(file.at).toBe(FACTS.coverageAt);
  });

  it("gives the same file at another build time", () => {
    const facts = { ...FACTS, trend: ["2026-11-02", "2026-10-28"] };
    expect(kpiInput(facts, at("2026-11-04"))).toEqual(kpiInput(facts, at("2026-11-05")));
  });

  it("tells the page of the explorer", () => {
    const file = kpiInput({ ...FACTS, explorer: true }, 0);
    expect(file.measures.find((m) => m.id === "explorer-live")?.value).toBe(1);
  });
});
