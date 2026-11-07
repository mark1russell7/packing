// The data stamps of the measured pages (schema data-stamp/1 of site-pages). The plugin siteStamps of vite.config.ts puts the
// stamp line in each page, and adds data-stamps.json to the site. The freshness gate of pages.yml reads that file.
// Each run comes from the field origin of a snapshot file, after the files of the branch site-data replace the files of main.

import { DATA_STAMP_SCHEMA, type DataLimit, type DataRun, type DataStamps, type PageStamp } from "@mark1russell7/site-pages";
import { SOURCE_URL } from "./chrome.ts";
import type { Origin } from "./data.ts";

/** The npm name of the engine of each run. */
export const ENGINE = "@mark1russell7/packing";

/** The strategy snapshots. Each page that reads `strategy-snapshots.ts` shows them. */
export const STRATEGY_FILES: readonly string[] = [
  "strategies-pack-screen-v1.json",
  "strategies-pack-free-v1.json",
  "strategies-pack-select-v1.json",
  "strategies-pack-select-v2.json",
  "strategies-pack-classes-free-v1.json",
];

/**
 * The snapshot files of each page with current data, by the path of the page in the site.
 * The pages `results/studies/` and `explorer/` show fixed studies. They get a stamp when a scheduled workflow writes their data again.
 * The page `compare/` packs in the browser. It links to the verdicts of `results/` and shows no number of a snapshot, so it has no stamp.
 */
export const STAMPED_PAGES: Readonly<Record<string, readonly string[]>> = {
  "results/index.html": [...STRATEGY_FILES, "gaps-pack-known-v1.json", "gaps-pack-select-v2.json", "coverage.json", "measured-entries.json"],
  "strategies/index.html": STRATEGY_FILES,
};

/**
 * The age limit of each page with current data. The age rule starts on 2026-11-14, after the first weekly rerun of 2026-11-11.
 * The site removes `startsAt` at the first green read of that rerun.
 */
export const CURRENT_LIMIT: DataLimit = {
  days: 8,
  reason: "Site rerun packs each corpus again each Wednesday, Coverage nightly measures the coverage each Monday, and Site data writes the new files.",
  workflow: ".github/workflows/site-rerun.yml",
  startsAt: "2026-11-14T00:00:00Z",
};

/** The form of the date of an origin. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The form of a full commit. */
const FULL_COMMIT = /^[0-9a-f]{40}$/;

/** This function gives the origin entries of a snapshot file. A file with no list of origins stops the build. */
export function originsOf(file: string, text: string): readonly Origin[] {
  const origin = (JSON.parse(text) as { origin?: unknown }).origin;
  if (!Array.isArray(origin) || origin.length === 0) throw new Error(`The file ${file} has no list of origins.`);
  return origin as Origin[];
}

/**
 * This function gives the run of an origin entry, or undefined for data from the repository only.
 * The date of an origin is the day of the start of its run, so the run starts at the earliest time of that day.
 * A run is thus at most one day older in the gate than in fact.
 * The run names its full commit when the history of the build has the short commit. A run on a branch that a squash merged has no such commit.
 * The gate needs the commit only for a study, and the link of the run names the commit.
 */
export function runOf(file: string, origin: Origin, fullCommit: (commit: string) => string): DataRun | undefined {
  if (origin.run === null) return undefined;
  if (!DAY.test(origin.date)) throw new Error(`The origin of the run ${origin.run} in ${file} has the date "${origin.date}", not YYYY-MM-DD.`);
  const commit = fullCommit(origin.commit);
  const run: DataRun = {
    id: String(origin.run),
    url: `${SOURCE_URL}/actions/runs/${origin.run}`,
    date: `${origin.date}T00:00:00Z`,
    engines: { [ENGINE]: origin.release },
  };
  return FULL_COMMIT.test(commit) && commit.startsWith(origin.commit) ? { ...run, commit } : run;
}

/**
 * This function gives the data stamps of the site.
 *
 * @param read - The function that gives the text of a file of `packages/site/data/`.
 * @param fullCommit - The function that gives the full commit of a short commit, or an other text when the history has no such commit.
 */
export function siteDataStamps(read: (file: string) => string, fullCommit: (commit: string) => string): DataStamps {
  const pages: PageStamp[] = Object.entries(STAMPED_PAGES).map(([page, files]) => {
    const runs = new Map<string, DataRun>();
    for (const file of files) {
      for (const origin of originsOf(file, read(file))) {
        const run = runOf(file, origin, fullCommit);
        if (run !== undefined && !runs.has(run.id)) runs.set(run.id, run);
      }
    }
    if (runs.size === 0) throw new Error(`The page ${page} shows no data of a CI run.`);
    const sorted = [...runs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { page, runs: sorted, limit: CURRENT_LIMIT };
  });
  return { schema: DATA_STAMP_SCHEMA, pages };
}
