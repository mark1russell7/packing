import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allStrategies, corpusFamilies } from "@mark1russell7/packing";
import { siteKpi } from "@mark1russell7/site-pages/vite";
import { defineConfig } from "vite";
import { kpiInput } from "./src/kpi.ts";
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

// The release, the commit and the date of the build. The footer of each page shows them.
const build = {
  release: (JSON.parse(readFileSync(page("../packing/package.json"), "utf8")) as { version: string }).version,
  commit: git("rev-parse", "--short=7", "HEAD"),
  date: git("log", "-1", "--format=%cs"),
};

/** This function gives a commit time in UTC. A file with no commit stops the build, because the time of its data is then not known. */
const commitTime = (...path: string[]): string => {
  const time = Date.parse(git("log", "-1", "--format=%cI", "HEAD", "--", ...path));
  if (Number.isNaN(time)) throw new Error(`No commit time for ${path.join(" ") || "HEAD"}.`);
  return new Date(time).toISOString().replace(/\.\d+Z$/, "Z");
};

/** This function gives the data of `kpi.json`. The time of the build is only the clock of the test of a weekly trend. */
const kpiData = () => {
  const text = (name: string): string => readFileSync(page(name), "utf8");
  const coverage = JSON.parse(text("./data/coverage.json")) as { trend: readonly { date: string }[] };
  const facts = {
    picker: DEMO_IDS.length,
    strategies: allStrategies.length,
    families: corpusFamilies.length,
    lawPairs: (JSON.parse(text("./data/law-cover.json")) as { covered: number }).covered,
    pages: [text("./index.html"), text("./content/about.md")],
    trend: coverage.trend.map((point) => point.date),
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
