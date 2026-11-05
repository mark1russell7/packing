import { describe, expect, it } from "vitest";
import { changelogVersions, kpiInput, releaseReading, staleText, weeklyTrend, type KpiFacts } from "./kpi.ts";

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

    it("reads 0 and no version in flight when the version has a tag and the news shows each version", () => {
      expect(releaseReading(released, NOW)).toEqual({ stale: 0 });
    });

    it("names a version with no tag and a version commit under 1 day old, and does not count it", () => {
      expect(releaseReading({ ...bumped, versionAt: "2026-11-05T11:00:00Z" }, NOW)).toEqual({ stale: 0, inFlight: "0.9.0" });
    });

    it("counts a version with no tag and a version commit of 1 day or more, once", () => {
      expect(releaseReading({ ...bumped, versionAt: "2026-11-04T12:00:00Z" }, NOW)).toEqual({ stale: 1 });
      expect(releaseReading({ ...bumped, versionAt: OLD }, NOW)).toEqual({ stale: 1 });
    });

    it("counts a version with a tag that the news does not show, at any age", () => {
      expect(releaseReading({ ...released, shownReleases: ["0.7.0", "0.6.0"], versionAt: "2026-11-05T11:00:00Z" }, NOW)).toEqual({ stale: 1 });
    });

    it("counts a missing middle release, also beside a version in flight", () => {
      expect(releaseReading({ ...released, shownReleases: ["0.8.0", "0.6.0"] }, NOW)).toEqual({ stale: 1 });
      expect(releaseReading({ ...bumped, shownReleases: ["0.8.0", "0.6.0"], versionAt: "2026-11-05T11:00:00Z" }, NOW)).toEqual({ stale: 1, inFlight: "0.9.0" });
    });

    it("reads 0 for a release on the list that the changelog does not name", () => {
      expect(releaseReading({ ...released, shownReleases: [...released.shownReleases, "0.1.0"] }, NOW)).toEqual({ stale: 0 });
    });
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

describe("the file", () => {
  it("has the project and the seven measures", () => {
    const file = kpiInput(FACTS, Date.parse("2026-11-04T17:00:00.500Z"));
    expect(file.project).toBe("packing");
    expect(Object.fromEntries(file.measures.map((m) => [m.id, m.value]))).toEqual({ "picker-strategies": 31, "stale-text": 0, "release-in-flight": 0, "input-families": 20, "law-pairs-covered": 40, "coverage-shown": 0, "explorer-live": 0 });
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
