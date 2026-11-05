// The numbers of the file `kpi.json` of the site (roadmap item k145). Each value comes from the registry or from a file of the site,
// so no reader copies a number from a page. The build writes the file with `siteKpi` of `@mark1russell7/site-pages`.

/** The name of the project in the file. */
export const KPI_PROJECT = "packing";

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
}

/** The data of the file, for the writer of the file. The time `at` is the time of the oldest measure. */
export interface SiteKpi {
  readonly project: string;
  readonly at: string;
  measures: SiteMeasure[];
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
  readonly trend: readonly (readonly string[])[];
  /** The entries of the bench with a measured record in the last coverage run, and all the entries. An older coverage file does not give them. */
  readonly entries?: { readonly measured: number; readonly planned: number };
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

/** This function gives the versions of the headings of a changelog. A heading with another text, for example the name of an older package, is not a version. */
export function changelogVersions(changelog: string): string[] {
  return [...changelog.matchAll(/^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/gm)].map((m) => m[1]!);
}

/** The reading of the releases on the page of the news. */
export interface ReleaseReading {
  /** The count of the versions of the changelog and the package that the page does not show, less a version in flight. */
  readonly stale: number;
  /** The version of the package when it has no tag and its version commit is under 1 day old. */
  readonly inFlight?: string;
}

/**
 * This function reads the versions that the page of the news does not show. An old list and a list with a missing release both count.
 * A tag comes after its version commit, so a version in flight does not count. Over 1 day it counts, so a failed release shows.
 */
export function releaseReading(facts: Pick<KpiFacts, "release" | "tags" | "versionAt" | "shownReleases" | "changelogReleases">, now: number): ReleaseReading {
  const inFlight = !facts.tags.includes(facts.release) && now - Date.parse(facts.versionAt) < DAY_MS ? facts.release : undefined;
  const listed = new Set(facts.shownReleases);
  const stale = [...new Set([facts.release, ...facts.changelogReleases])].filter((version) => !listed.has(version) && version !== inFlight).length;
  return inFlight === undefined ? { stale } : { stale, inFlight };
}

/** This function gives the number of the calendar week of a day, with the week from Monday to Sunday. */
const weekOf = (day: number): number => Math.floor((day + 3 * DAY_MS) / (7 * DAY_MS));

/** The parts of a point of the coverage trend that give its segment. */
export interface SegmentedPoint {
  readonly date: string;
  readonly run: number | null;
  readonly corpus: string;
  readonly strategies?: readonly string[];
}

/** This function gives the segment of a point: one corpus with one list of strategies. A point with no list is a segment alone, because its list is not known. */
export const segmentOf = (p: SegmentedPoint): string => (p.strategies === undefined ? `${p.corpus}|${p.date}|${String(p.run)}` : `${p.corpus}|${[...p.strategies].sort().join(",")}`);

/** This function gives the points of each segment of a trend, in the order of the trend. */
export function trendSegments<P extends SegmentedPoint>(trend: readonly P[]): P[][] {
  const out = new Map<string, P[]>();
  for (const p of trend) out.set(segmentOf(p), [...(out.get(segmentOf(p)) ?? []), p]);
  return [...out.values()];
}

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
  const dates = facts.trend.flat();
  const coverageAt = dates.length === 0 ? facts.coverageAt : `${[...dates].sort().at(-1)!}T00:00:00Z`;
  const releases = releaseReading(facts, now);
  const measures: SiteMeasure[] = [
    { id: "picker-strategies", value: facts.picker, unit: "strategies", at: facts.commitAt },
    { id: "stale-text", value: staleText(facts.pages, facts.strategies) + releases.stale, unit: "places", at: facts.commitAt },
    { id: "release-in-flight", value: releases.inFlight === undefined ? 0 : 1, unit: releases.inFlight === undefined ? "versions" : `version ${releases.inFlight}`, at: facts.commitAt },
    { id: "input-families", value: facts.families, unit: "families", at: facts.commitAt },
    { id: "law-pairs-covered", value: facts.lawPairs, unit: "pairs", at: facts.lawPairsAt },
    // A trend counts only inside one segment: a change of the corpus or of the strategies starts a new line.
    { id: "coverage-shown", value: facts.trend.some((segment) => weeklyTrend(segment, now)) ? 1 : 0, at: coverageAt },
    ...(facts.entries === undefined ? [] : [{ id: "measured-entries", value: facts.entries.measured, unit: `of ${facts.entries.planned} entries`, at: coverageAt }]),
    { id: "explorer-live", value: facts.explorer ? 1 : 0, at: facts.commitAt },
  ];
  return { project: KPI_PROJECT, at: measures.map((m) => m.at).sort()[0]!, measures };
}
