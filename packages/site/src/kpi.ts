// The numbers of the file `kpi.json` of the site (roadmap item k145). Each value comes from the registry or from a file of the site,
// so no reader copies a number from a page. The script `scripts/write-kpi.ts` writes the file after the build.

/** The format of the file. */
export const KPI_FORMAT = "kpi/1";

/** The name of the project in the file. */
export const KPI_PROJECT = "packing";

/** The most days from the last point of the coverage trend to the build, for a weekly trend. */
const TREND_MAX_DAYS = 7;

/** The least count of calendar weeks with a point, for a trend. */
const TREND_MIN_WEEKS = 2;

const DAY_MS = 86_400_000;

/** One measure of the file. */
export interface KpiMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
}

/** The file `kpi.json`. */
export interface KpiFile {
  readonly format: typeof KPI_FORMAT;
  readonly project: string;
  readonly at: string;
  readonly commit: string;
  readonly measures: readonly KpiMeasure[];
}

/** The facts that the measures read. */
export interface KpiFacts {
  /** The count of the strategies of the demo. */
  readonly picker: number;
  /** The count of the strategies of the registry. */
  readonly strategies: number;
  /** The count of the input families of the generators. */
  readonly families: number;
  /** The text of each page that states a count. */
  readonly pages: readonly string[];
  /** The date of each point of the coverage trend, as YYYY-MM-DD. */
  readonly trend: readonly string[];
  /** The value `true` when the site has the page of the response explorer. */
  readonly explorer: boolean;
}

/** This function counts the places in the text of the pages that state a count of strategies that differs from the registry. */
export function staleText(pages: readonly string[], strategies: number): number {
  return pages.flatMap((text) => [...text.matchAll(/(\d+) strategies/g)]).filter((m) => Number(m[1]) !== strategies).length;
}

/** This function gives the number of the calendar week of a day, with the week from Monday to Sunday. */
const weekOf = (day: number): number => Math.floor((day + 3 * DAY_MS) / (7 * DAY_MS));

/** This function tells if the trend is weekly: it has points in two calendar weeks or more, and its last point is 7 days old or less. */
export function weeklyTrend(dates: readonly string[], now: number): boolean {
  const days = dates.map((date) => Date.parse(`${date}T00:00:00Z`));
  if (days.length === 0) return false;
  return new Set(days.map(weekOf)).size >= TREND_MIN_WEEKS && now - Math.max(...days) <= TREND_MAX_DAYS * DAY_MS;
}

/** This function gives the file from the facts, the time of the build and the commit. */
export function kpiFile(facts: KpiFacts, now: number, commit: string): KpiFile {
  return {
    format: KPI_FORMAT,
    project: KPI_PROJECT,
    at: new Date(now).toISOString().replace(/\.\d+Z$/, "Z"),
    commit,
    measures: [
      { id: "picker-strategies", value: facts.picker, unit: "strategies" },
      { id: "stale-text", value: staleText(facts.pages, facts.strategies), unit: "places" },
      { id: "input-families", value: facts.families, unit: "families" },
      { id: "coverage-shown", value: weeklyTrend(facts.trend, now) ? 1 : 0 },
      { id: "explorer-live", value: facts.explorer ? 1 : 0 },
    ],
  };
}
