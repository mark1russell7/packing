import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allStrategies, corpusFamilies } from "@mark1russell7/packing";
import { changelogVersions } from "@mark1russell7/site-pages";
import { siteKpi } from "@mark1russell7/site-pages/vite";
import { defineConfig } from "vite";
import { kpiInput, skipCounts, trendLines, type SegmentedPoint, type SkipSummary } from "./src/kpi.ts";
import { DEMO_IDS } from "./src/options.ts";

// The Pages workflow sets SITE_BASE to "/packing". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** This function gives a line of git, or "unknown" outside a repository. */
const git = (...args: string[]): string => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

/** The version of the package. It is a release only when it has a tag. */
const packageVersion = (JSON.parse(readFileSync(page("../packing/package.json"), "utf8")) as { version: string }).version;

/** The versions that the news shows, the newest first. Each one has a tag. */
const shownReleases = (JSON.parse(readFileSync(page("./data/releases.json"), "utf8")) as { releases: readonly { release: string }[] }).releases.map((row) => row.release);

// The last release with a tag, the commit and the date of the build. The footer of each page shows them.
const build = {
  release: shownReleases[0]!,
  commit: git("rev-parse", "--short=7", "HEAD"),
  date: git("log", "-1", "--format=%cs"),
};

/** This function gives a commit time in UTC. A file with no commit stops the build, because the time of its data is then not known. */
const commitTime = (...path: string[]): string => {
  const time = Date.parse(git("log", "-1", "--format=%cI", "HEAD", "--", ...path));
  if (Number.isNaN(time)) throw new Error(`No commit time for ${path.join(" ") || "HEAD"}.`);
  return new Date(time).toISOString().replace(/\.\d+Z$/, "Z");
};

/** This function gives the time of the commit that set the version of the package, in UTC. */
const versionTime = (): string => {
  const time = Date.parse(git("log", "-1", "--format=%cI", "-G^\\s*\"version\":", "HEAD", "--", page("../packing/package.json")));
  if (Number.isNaN(time)) throw new Error("No commit sets the version of the package.");
  return new Date(time).toISOString().replace(/\.\d+Z$/, "Z");
};

/** This function gives the data of `kpi.json`. The time of the build is only the clock of the test of a weekly trend. */
const kpiData = () => {
  const text = (name: string): string => readFileSync(page(name), "utf8");
  const coverage = JSON.parse(text("./data/coverage.json")) as { trend: readonly SegmentedPoint[]; latest: { entries?: { measured: number; planned: number } } };
  const snapshots = readdirSync(page("./data")).filter((name) => /^strategies-.*\.json$/.test(name));
  const summaries = snapshots.flatMap((name) => (JSON.parse(text(`./data/${name}`)) as { strategies: readonly SkipSummary[] }).strategies);
  const facts = {
    picker: DEMO_IDS.length,
    strategies: allStrategies.length,
    families: corpusFamilies.length,
    lawPairs: (JSON.parse(text("./data/law-cover.json")) as { covered: number }).covered,
    pages: [text("./index.html"), text("./content/about.md")],
    release: packageVersion,
    tags: git("tag", "--list", "v*").split("\n").map((tag) => tag.slice(1)),
    versionAt: versionTime(),
    shownReleases,
    changelogReleases: changelogVersions(text("../packing/CHANGELOG.md")),
    trend: trendLines(coverage.trend),
    ...(coverage.latest.entries === undefined ? {} : { entries: { measured: coverage.latest.entries.measured, planned: coverage.latest.entries.planned } }),
    skips: skipCounts(summaries),
    skipsAt: commitTime(...snapshots.map((name) => page(`./data/${name}`))),
    explorer: existsSync(page("./explorer/index.html")),
    commitAt: commitTime(),
    lawPairsAt: commitTime(page("./data/law-cover.json")),
    coverageAt: commitTime(page("./data/coverage.json")),
  };
  return kpiInput(facts, Date.now());
};

// The site has six pages: the live demo, the compare page, the strategy cards, the measured results, the response explorer and the news. The deploy adds `status/` and `releases/`.
export default defineConfig({
  base,
  define: { __SITE_BUILD__: JSON.stringify(build) },
  plugins: [siteKpi(kpiData, env)],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        demo: page("./index.html"),
        compare: page("./compare/index.html"),
        strategies: page("./strategies/index.html"),
        results: page("./results/index.html"),
        explorer: page("./explorer/index.html"),
        "whats-new": page("./whats-new/index.html"),
      },
    },
  },
});
