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
  /** The latest release that the page of the news shows, from `data/releases.json`. */
  readonly shownRelease: string;
  /** The date of each point of the coverage trend, as YYYY-MM-DD. */
  readonly trend: readonly string[];
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

/** This function gives 1 when the page of the news shows another latest release than the version of the package, else 0. */
export function staleRelease(shown: string, release: string): number {
  return shown === release ? 0 : 1;
}

/** This function gives the number of the calendar week of a day, with the week from Monday to Sunday. */
const weekOf = (day: number): number => Math.floor((day + 3 * DAY_MS) / (7 * DAY_MS));

/** This function tells if the trend is weekly. A weekly trend has points in two calendar weeks or more, and its last point is 7 days old or less. */
export function weeklyTrend(dates: readonly string[], now: number): boolean {
  const days = dates.map((date) => Date.parse(`${date}T00:00:00Z`));
  if (days.length === 0) return false;
  return new Set(days.map(weekOf)).size >= TREND_MIN_WEEKS && now - Math.max(...days) <= TREND_MAX_DAYS * DAY_MS;
}

/**
 * This function gives the data of the file from the facts. Each time is the time of the data of its measure, and not the time of the
 * build. The measures of the registry and the pages have the time of the commit. Only the test of a weekly trend reads the time `now`.
 */
export function kpiInput(facts: KpiFacts, now: number): SiteKpi {
  const coverageAt = facts.trend.length === 0 ? facts.coverageAt : `${[...facts.trend].sort().at(-1)!}T00:00:00Z`;
  const measures: SiteMeasure[] = [
    { id: "picker-strategies", value: facts.picker, unit: "strategies", at: facts.commitAt },
    { id: "stale-text", value: staleText(facts.pages, facts.strategies) + staleRelease(facts.shownRelease, facts.release), unit: "places", at: facts.commitAt },
    { id: "input-families", value: facts.families, unit: "families", at: facts.commitAt },
    { id: "law-pairs-covered", value: facts.lawPairs, unit: "pairs", at: facts.lawPairsAt },
    { id: "coverage-shown", value: weeklyTrend(facts.trend, now) ? 1 : 0, at: coverageAt },
    { id: "explorer-live", value: facts.explorer ? 1 : 0, at: facts.commitAt },
  ];
  return { project: KPI_PROJECT, at: measures.map((m) => m.at).sort()[0]!, measures };
}
