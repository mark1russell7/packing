import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changelogFaults, changelogVersions } from "@mark1russell7/site-pages";
import { kpiInput, segmentOf, staleText, trendLines, trendSegments, weeklyTrend, type KpiFacts, type SegmentedPoint } from "./kpi.ts";

const at = (date: string): number => Date.parse(`${date}T12:00:00Z`);

const FACTS: KpiFacts = { picker: 31, strategies: 31, families: 20, lawPairs: 40, pages: ["The 31 strategies."], release: "0.8.0", tags: ["0.8.0", "0.7.0"], versionAt: "2026-11-01T00:00:00Z", shownReleases: ["0.8.0", "0.7.0"], changelogReleases: ["0.8.0", "0.7.0"], trend: [], explorer: false, commitAt: "2026-11-04T16:00:00Z", lawPairsAt: "2026-11-04T15:00:00Z", coverageAt: "2026-10-29T02:50:10Z" };

describe("the stale text", () => {
  it("counts each place with another count of strategies", () => {
    expect(staleText(["The 31 strategies.", "All 31 strategies."], 31)).toBe(0);
    expect(staleText(["The 8 strategies.", "Of 22 strategies, and 31 strategies."], 31)).toBe(2);
  });

  it("reads the versions of a changelog and leaves out a heading of another package", () => {
    const changelog = "# Changelog\n\n## 0.8.0\n\ntext\n\n## 0.8.0-rc.1\n\n## 0.7.0\r\n\n## old-package 0.1.1\n\n### 0.6.0\n";
    expect(changelogVersions(changelog)).toEqual(["0.8.0", "0.8.0-rc.1", "0.7.0"]);
  });

  describe("the releases on the news", () => {
    const NOW = Date.parse("2026-11-05T12:00:00Z");
    const OLD = "2026-11-01T00:00:00Z";
    const released = { release: "0.8.0", tags: ["0.8.0", "0.7.0", "0.6.0"], versionAt: OLD, shownReleases: ["0.8.0", "0.7.0", "0.6.0"], changelogReleases: ["0.8.0", "0.7.0", "0.6.0"] };
    const bumped = { ...released, release: "0.9.0", changelogReleases: ["0.9.0", ...released.changelogReleases] };
    const releaseRead = (facts: Partial<KpiFacts>): { stale: number; inFlight?: string } => {
      const measures = kpiInput({ ...FACTS, ...facts }, NOW).measures;
      const stale = measures.find((m) => m.id === "stale-text")!.value;
      const flight = measures.find((m) => m.id === "release-in-flight")!;
      return flight.value === 0 ? { stale } : { stale, inFlight: flight.unit!.replace("version ", "") };
    };

    it("reads 0 and no version in flight when the version has a tag and the news shows each version", () => {
      expect(releaseRead(released)).toEqual({ stale: 0 });
    });

    it("names a version with no tag and a version commit under 1 day old, and does not count it", () => {
      expect(releaseRead({ ...bumped, versionAt: "2026-11-05T11:00:00Z" })).toEqual({ stale: 0, inFlight: "0.9.0" });
    });

    it("counts a version with no tag and a version commit of 1 day or more, once", () => {
      expect(releaseRead({ ...bumped, versionAt: "2026-11-04T12:00:00Z" })).toEqual({ stale: 1 });
      expect(releaseRead({ ...bumped, versionAt: OLD })).toEqual({ stale: 1 });
    });

    it("counts a version with a tag that the news does not show, at any age", () => {
      expect(releaseRead({ ...released, shownReleases: ["0.7.0", "0.6.0"], versionAt: "2026-11-05T11:00:00Z" })).toEqual({ stale: 1 });
    });

    it("counts a missing middle release, also beside a version in flight", () => {
      expect(releaseRead({ ...released, shownReleases: ["0.8.0", "0.6.0"] })).toEqual({ stale: 1 });
      expect(releaseRead({ ...bumped, shownReleases: ["0.8.0", "0.6.0"], versionAt: "2026-11-05T11:00:00Z" })).toEqual({ stale: 1, inFlight: "0.9.0" });
    });

    it("reads 0 for a release on the list that the changelog does not name", () => {
      expect(releaseRead({ ...released, shownReleases: [...released.shownReleases, "0.1.0"] })).toEqual({ stale: 0 });
    });
  });

  it("states what the measure leaves out", () => {
    expect(kpiInput(FACTS, 0).measures.find((m) => m.id === "stale-text")?.notCounted).toContain("a script draws");
  });

  it("reads the changelog of the package with no fault", () => {
    expect(changelogFaults(readFileSync(new URL("../../packing/CHANGELOG.md", import.meta.url), "utf8"))).toEqual([]);
  });

  it("adds both to the measure of the file", () => {
    const value = (facts: KpiFacts): number | undefined => kpiInput(facts, 0).measures.find((m) => m.id === "stale-text")?.value;
    expect(value(FACTS)).toBe(0);
    expect(value({ ...FACTS, shownReleases: ["0.7.0"] })).toBe(1);
    expect(value({ ...FACTS, shownReleases: ["0.7.0"], pages: ["The 8 strategies."] })).toBe(2);
  });

  it("names a version in flight in its own measure, and reads 0 for the rest", () => {
    const flight = (facts: KpiFacts) => kpiInput(facts, Date.parse("2026-11-05T12:00:00Z")).measures.find((m) => m.id === "release-in-flight");
    expect(flight(FACTS)).toMatchObject({ value: 0, unit: "versions" });
    expect(flight({ ...FACTS, release: "0.9.0", versionAt: "2026-11-05T11:00:00Z" })).toMatchObject({ value: 1, unit: "version 0.9.0" });
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

describe("the segments of the trend", () => {
  const point = (date: string, run: number, strategies?: string[], corpus = "c") => ({ date, run, corpus, ...(strategies === undefined ? {} : { strategies }) });
  const measure = (trend: readonly SegmentedPoint[], now: string) => kpiInput({ ...FACTS, trend: trendLines(trend) }, at(now)).measures.find((m) => m.id === "coverage-shown");
  const shown = (trend: readonly SegmentedPoint[], now: string): number | undefined => measure(trend, now)?.value;
  const m = "repeats 5, warmup 2";
  const shares = { f: 0.5 };

  it("continues a line over the entries common to two points, with the count", () => {
    const first = { ...point("2026-11-02", 1, ["a"]), method: m };
    const second = { ...point("2026-11-09", 2, ["a", "b"]), method: m, over: [{ strategies: ["a"], shares }] };
    const lines = trendSegments([first, second]);
    expect(lines.map((line) => line.map((p) => p.date))).toEqual([["2026-11-02", "2026-11-09"], ["2026-11-09"]]);
    expect(lines[0]![1]).toMatchObject({ strategies: ["a"], shares, commonOf: 2 });
    expect(shown([first, second], "2026-11-10")).toBe(1);
    expect(measure([first, second], "2026-11-10")?.unit).toBe("2 points on the same 1");
  });

  it("does not join two points that differ by one entry when the later point has no shares over the earlier list", () => {
    expect(shown([{ ...point("2026-11-02", 1, ["a"]), method: m }, { ...point("2026-11-09", 2, ["a", "b"]), method: m }], "2026-11-10")).toBe(0);
  });

  it("does not join two methods, also with one list", () => {
    expect(segmentOf({ ...point("2026-11-02", 1, ["a"]), method: m })).not.toBe(segmentOf({ ...point("2026-11-09", 2, ["a"]), method: `${m}, budget` }));
    expect(shown([{ ...point("2026-11-02", 1, ["a"]), method: m }, { ...point("2026-11-09", 2, ["a"]), method: `${m}, budget` }], "2026-11-10")).toBe(0);
  });

  it("starts no line from a later point alone: an earlier list with no point gives nothing", () => {
    expect(trendSegments([{ ...point("2026-11-09", 2, ["a", "b"]), method: m, over: [{ strategies: ["a"], shares }] }])).toHaveLength(1);
  });

  it("says how many points give the 1 on one list", () => {
    expect(measure([{ ...point("2026-11-02", 1, ["a", "b"]), method: m }, { ...point("2026-11-09", 2, ["a", "b"]), method: m }], "2026-11-10")?.unit).toBe("2 points on the same 2");
    expect(measure([point("2026-11-09", 2, ["a"])], "2026-11-10")).not.toHaveProperty("unit");
  });

  it("keeps a point of a dispatch and a point of the schedule in one line (k185)", () => {
    const m = "repeats 5, warmup 2, budget";
    const trend = [{ ...point("2026-11-05", 1, ["a"]), method: m, trigger: "dispatch" }, { ...point("2026-11-09", 2, ["a"]), method: m, trigger: "schedule" }];
    expect(segmentOf(trend[0]!)).toBe(segmentOf(trend[1]!));
    expect(measure(trend, "2026-11-10")).toMatchObject({ value: 1, unit: "2 points on the same 1" });
  });

  it("keeps one corpus with one list in one segment, in any order of the list", () => {
    expect(segmentOf(point("2026-10-29", 1, ["a", "b"]))).toBe(segmentOf(point("2026-11-05", 2, ["b", "a"])));
    expect(segmentOf(point("2026-10-29", 1, ["a"]))).not.toBe(segmentOf(point("2026-11-05", 2, ["a", "b"])));
    expect(segmentOf(point("2026-10-29", 1, ["a"]))).not.toBe(segmentOf(point("2026-11-05", 2, ["a"], "other")));
  });

  it("keeps a point with no list alone, because its list is not known", () => {
    expect(trendSegments([point("2026-10-28", 1), point("2026-10-29", 2)])).toHaveLength(2);
  });

  it("does not count a trend over a change of the strategies", () => {
    // One new point in a later week, on a new list: this is the case that the old test of the dates read as 1.
    expect(shown([point("2026-10-29", 1, ["a"]), point("2026-11-05", 2, ["a", "b"])], "2026-11-06")).toBe(0);
    expect(shown([point("2026-10-29", 1, ["a"], "x"), point("2026-11-05", 2, ["a"], "y")], "2026-11-06")).toBe(0);
    expect(shown([point("2026-10-29", 1), point("2026-11-05", 2)], "2026-11-06")).toBe(0);
  });

  it("counts a trend with one list in two calendar weeks, beside a new list", () => {
    expect(shown([point("2026-10-29", 1, ["a"]), point("2026-11-05", 2, ["a"]), point("2026-11-05", 2, ["a", "b"])], "2026-11-06")).toBe(1);
  });

  it("reads 0 when no list has a point in the last 7 days and in a second week", () => {
    expect(shown([point("2026-10-29", 1, ["a"]), point("2026-11-05", 2, ["a"]), point("2026-11-05", 2, ["a", "b"])], "2026-11-13")).toBe(0);
  });

  it("gives the count of the entries over the corpora, with the corpora, the early rows and the date of the last run", () => {
    const entries = { measured: 54, planned: 64, corpora: ["pack-a-v1", "pack-b-v1"], stopEarly: 3 };
    const file = kpiInput({ ...FACTS, trend: [{ dates: ["2026-11-05"] }], entries, entriesAt: "2026-11-03T00:00:00Z" }, at("2026-11-06"));
    expect(file.measures.find((m) => m.id === "measured-entries")).toEqual({ id: "measured-entries", value: 54, unit: "of 64 entries, over pack-a-v1, pack-b-v1; rows that stop early: 3", at: "2026-11-03T00:00:00Z" });
    expect(kpiInput(FACTS, at("2026-11-06")).measures.some((m) => m.id === "measured-entries")).toBe(false);
  });
});

describe("the file", () => {
  it("has the project and the seven measures", () => {
    const file = kpiInput(FACTS, Date.parse("2026-11-04T17:00:00.500Z"));
    expect(file.project).toBe("packing");
    expect(Object.fromEntries(file.measures.map((m) => [m.id, m.value]))).toEqual({ "picker-strategies": 31, "stale-text": 0, "release-in-flight": 0, "input-families": 20, "law-pairs-covered": 40, "coverage-shown": 0, "explorer-live": 0 });
  });

  it("gives each measure the time of its data and not the time of the build", () => {
    const file = kpiInput({ ...FACTS, trend: [{ dates: ["2026-10-28", "2026-10-21"] }] }, Date.parse("2026-11-04T17:00:00Z"));
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
    const facts = { ...FACTS, trend: [{ dates: ["2026-11-02", "2026-10-28"] }] };
    expect(kpiInput(facts, at("2026-11-04"))).toEqual(kpiInput(facts, at("2026-11-05")));
  });

  it("tells the page of the explorer", () => {
    const file = kpiInput({ ...FACTS, explorer: true }, 0);
    expect(file.measures.find((m) => m.id === "explorer-live")?.value).toBe(1);
  });
});
