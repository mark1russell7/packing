// The numbers of the file `kpi.json` of the site (roadmap item k145). Each value comes from the registry or from a file of the site,
// so no reader copies a number from a page. The build writes the file with `siteKpi` of `@mark1russell7/site-pages`.

import { releaseReading } from "@mark1russell7/site-pages";

/** The name of the project in the file. */
export const KPI_PROJECT = "packing";

/** What the measure `stale-text` leaves out. */
const STALE_TEXT_NOT_COUNTED = "The count reads index.html and content/about.md, and the versions of the news against the changelog and the package. It leaves out the other pages and the text that a script draws.";

/** The most days from the last point of the coverage trend to the build, for a weekly trend. */
const TREND_MAX_DAYS = 7;

/** The least count of calendar weeks with a point, for a trend. */
const TREND_MIN_WEEKS = 2;

const DAY_MS = 86_400_000;

/** One measure of the file. */
export interface SiteMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
  readonly at: string;
  /** The text that states what the count leaves out, for a count that reads only a part of the site. */
  readonly notCounted?: string;
}

/** The data of the file, for the writer of the file. The time `at` is the time of the oldest measure. */
export interface SiteKpi {
  readonly project: string;
  readonly at: string;
  measures: SiteMeasure[];
}

/** The reasons of a pair that a wall budget ended. They have no word, because the strategy did not refuse the input. */
const BUDGET_REASONS: ReadonlySet<string> = new Set(["over budget", "not run: over budget at this size", "not run: job budget"]);

/** This function tells if a skip reason comes from a wall budget. */
export const isBudgetReason = (reason: string): boolean => BUDGET_REASONS.has(reason);

/** The skipped records of a snapshot of a corpus, by the word of their reason. A wall budget stays out of this count. */
export interface SkipCounts {
  /** The records with the word `not done`. They are coverage still owed, apart from a measured row. */
  readonly owed: number;
  readonly otherAlgorithm: number;
  readonly noMeaning: number;
  /** The records with no read: the word `not read`, a reason with no word, and a snapshot with no reasons. */
  readonly notRead: number;
}

/** The parts of a summary of a strategy that `skipCounts` reads. */
export interface SkipSummary {
  readonly skipped: number;
  readonly reasons?: readonly { readonly reason: string; readonly count: number; readonly word?: string }[];
}

/** This function counts the skipped records of some strategies by word. Records with no word count as `notRead`, so no record gets a word by default. */
export function skipCounts(strategies: readonly SkipSummary[]): SkipCounts {
  const count = { owed: 0, otherAlgorithm: 0, noMeaning: 0, notRead: 0 };
  for (const s of strategies) {
    const reasons = s.reasons ?? [];
    const listed = reasons.reduce((sum, r) => sum + r.count, 0);
    count.notRead += Math.max(0, s.skipped - listed);
    for (const r of reasons) {
      if (isBudgetReason(r.reason)) continue;
      if (r.word === "not done") count.owed += r.count;
      else if (r.word === "other algorithm") count.otherAlgorithm += r.count;
      else if (r.word === "no meaning") count.noMeaning += r.count;
      else count.notRead += r.count;
    }
  }
  return count;
}

/** The facts that the measures read. */
export interface KpiFacts {
  /** The count of the strategies of the demo. */
  readonly picker: number;
  /** The count of the strategies of the registry. */
  readonly strategies: number;
  /** The count of the input families of the generators. */
  readonly families: number;
  /** The count of the pairs of two item laws that the corpus emits, from `data/law-cover.json`. */
  readonly lawPairs: number;
  /** The text of each page that states a count. */
  readonly pages: readonly string[];
  /** The version of the package at the build. */
  readonly release: string;
  /** The versions that have a tag. */
  readonly tags: readonly string[];
  /** The time of the commit that set the version of the package, in UTC. */
  readonly versionAt: string;
  /** The versions that the page of the news shows, from `data/releases.json`. */
  readonly shownReleases: readonly string[];
  /** The versions of `CHANGELOG.md`. */
  readonly changelogReleases: readonly string[];
  /** The dates of each segment of the coverage trend, as YYYY-MM-DD. */
  readonly trend: readonly TrendLine[];
  /** The entries of the bench with a measured record in any run of `data/measured-entries.json`, the corpora of these runs and the rows that stop early. */
  readonly entries?: { readonly measured: number; readonly planned: number; readonly corpora: readonly string[]; readonly stopEarly: number };
  /** The date of the last run of `data/measured-entries.json`, in UTC. */
  readonly entriesAt?: string;
  /** The skipped records of the stored snapshots of the corpora, by word. */
  readonly skips?: SkipCounts;
  /** The time of the last commit of a stored snapshot of a corpus, in UTC. */
  readonly skipsAt?: string;
  /** The value `true` when the site has the page of the response explorer. */
  readonly explorer: boolean;
  /** The time of the commit of the build, in UTC. */
  readonly commitAt: string;
  /** The time of the last commit of `data/law-cover.json`, in UTC. */
  readonly lawPairsAt: string;
  /** The time of the last commit of `data/coverage.json`, in UTC. */
  readonly coverageAt: string;
}

/** This function counts the places in the text of the pages that state a count of strategies that differs from the registry. */
export function staleText(pages: readonly string[], strategies: number): number {
  return pages.flatMap((text) => [...text.matchAll(/(\d+) strategies/g)]).filter((m) => Number(m[1]) !== strategies).length;
}

/** This function gives the number of the calendar week of a day, with the week from Monday to Sunday. */
const weekOf = (day: number): number => Math.floor((day + 3 * DAY_MS) / (7 * DAY_MS));

/** The parts of a point of the coverage trend that give its segment. */
export interface SegmentedPoint {
  readonly date: string;
  readonly run: number | null;
  readonly corpus: string;
  readonly strategies?: readonly string[];
  readonly method?: string;
  /** The shares of this point over each earlier list that it contains, with one method. */
  readonly over?: readonly { readonly strategies: readonly string[]; readonly shares: Readonly<Record<string, number>>; readonly records?: number }[];
}

/**
 * This function gives the segment of a point: one corpus, one method and one list of strategies.
 * A point with no list is a segment alone, because its list is not known.
 */
export const segmentOf = (p: SegmentedPoint): string =>
  p.strategies === undefined ? `${p.corpus}|${p.date}|${String(p.run)}` : `${p.corpus}|${p.method ?? ""}|${[...p.strategies].sort().join(",")}`;

/**
 * This function gives the points of each segment of a trend, in the order of the trend.
 * A newly measured entry does not restart a line. The later point has its shares over the earlier list.
 * A copy of the point with these shares continues the line of that list, with `commonOf` as the count of the strategies of the point.
 * The new entry starts its own line.
 * A change of the method breaks a line.
 */
export function trendSegments<P extends SegmentedPoint>(trend: readonly P[]): P[][] {
  const out = new Map<string, P[]>();
  for (const p of trend) {
    out.set(segmentOf(p), [...(out.get(segmentOf(p)) ?? []), p]);
    for (const o of p.over ?? []) {
      const copy = { ...p, strategies: o.strategies, shares: o.shares, ...(o.records === undefined ? {} : { records: o.records }), commonOf: p.strategies?.length } as P;
      const points = out.get(segmentOf(copy));
      if (points !== undefined) out.set(segmentOf(copy), [...points, copy]);
    }
  }
  return [...out.values()];
}

/** One line of the coverage trend for the measures: its dates and its count of strategies, when the points have a list. */
export interface TrendLine {
  readonly dates: readonly string[];
  readonly strategies?: number;
}

/** This function gives the lines of a trend for the measures. */
export const trendLines = (trend: readonly SegmentedPoint[]): TrendLine[] =>
  trendSegments(trend).map((segment) => ({
    dates: segment.map((p) => p.date),
    ...(segment[0]!.strategies === undefined ? {} : { strategies: segment[0]!.strategies.length }),
  }));

/** This function tells if the trend is weekly. A weekly trend has points in two calendar weeks or more, and its last point is 7 days old or less. */
export function weeklyTrend(dates: readonly string[], now: number): boolean {
  const days = dates.map((date) => Date.parse(`${date}T00:00:00Z`));
  if (days.length === 0) return false;
  return new Set(days.map(weekOf)).size >= TREND_MIN_WEEKS && now - Math.max(...days) <= TREND_MAX_DAYS * DAY_MS;
}

/**
 * This function gives the data of the file from the facts. Each time is the time of the data of its measure, and not the time of the
 * build. The measures of the registry and the pages have the time of the commit. Only the test of a weekly trend and the age of a version in flight read the time `now`.
 */
export function kpiInput(facts: KpiFacts, now: number): SiteKpi {
  const dates = facts.trend.flatMap((line) => line.dates);
  const weekly = facts.trend.filter((line) => weeklyTrend(line.dates, now)).sort((a, b) => (b.strategies ?? 0) - (a.strategies ?? 0))[0];
  const coverageAt = dates.length === 0 ? facts.coverageAt : `${[...dates].sort().at(-1)!}T00:00:00Z`;
  const releases = releaseReading(facts.shownReleases, { changelog: facts.changelogReleases, current: facts.release, tags: facts.tags, versionAt: facts.versionAt }, now);
  const measures: SiteMeasure[] = [
    { id: "picker-strategies", value: facts.picker, unit: "strategies", at: facts.commitAt },
    { id: "stale-text", value: staleText(facts.pages, facts.strategies) + releases.gaps.length, unit: "places", at: facts.commitAt, notCounted: STALE_TEXT_NOT_COUNTED },
    { id: "release-in-flight", value: releases.inFlight === undefined ? 0 : 1, unit: releases.inFlight === undefined ? "versions" : `version ${releases.inFlight}`, at: facts.commitAt },
    { id: "input-families", value: facts.families, unit: "families", at: facts.commitAt },
    { id: "law-pairs-covered", value: facts.lawPairs, unit: "pairs", at: facts.lawPairsAt },
    // A trend counts only inside one line. The text tells which line gives the 1, because the count of points on one list is the claim.
    {
      id: "coverage-shown",
      value: weekly === undefined ? 0 : 1,
      ...(weekly?.strategies === undefined ? {} : { unit: `${weekly.dates.length} points on the same ${weekly.strategies}` }),
      at: coverageAt,
    },
    ...(facts.entries === undefined
      ? []
      : [{ id: "measured-entries", value: facts.entries.measured, unit: `of ${facts.entries.planned} entries, over ${facts.entries.corpora.join(", ")}; rows that stop early: ${facts.entries.stopEarly}`, at: facts.entriesAt ?? coverageAt }]),
    // A skip that the code can lift is coverage still owed. It counts apart, so it does not raise `measured-entries`.
    ...(facts.skips === undefined
      ? []
      : [
          { id: "skips-owed", value: facts.skips.owed, unit: "skipped records that the code can lift", at: facts.skipsAt ?? facts.commitAt },
          { id: "skips-not-read", value: facts.skips.notRead, unit: "skipped records with no read", at: facts.skipsAt ?? facts.commitAt },
        ]),
    { id: "explorer-live", value: facts.explorer ? 1 : 0, at: facts.commitAt },
  ];
  return { project: KPI_PROJECT, at: measures.map((m) => m.at).sort()[0]!, measures };
}
