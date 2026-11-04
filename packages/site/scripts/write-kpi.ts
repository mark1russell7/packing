// This script writes `dist/kpi.json` after the build of the site (roadmap item k145). The file holds the numbers of the site in the format `kpi/1`.
// The build starts it: pnpm --filter @packing/site build

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { allStrategies, corpusFamilies } from "@mark1russell7/packing";
import { kpiFile } from "../src/kpi.ts";
import { DEMO_IDS } from "../src/options.ts";

/** This function gives a path in the site package. */
const path = (name: string): URL => new URL(`../${name}`, import.meta.url);

/** This function reads a text file of the site package. */
const text = (name: string): string => readFileSync(path(name), "utf8");

/** This function writes the file. */
function main(): void {
  const coverage = JSON.parse(text("data/coverage.json")) as { trend: readonly { date: string }[] };
  const facts = {
    picker: DEMO_IDS.length,
    strategies: allStrategies.length,
    families: corpusFamilies.length,
    lawPairs: (JSON.parse(text("data/law-cover.json")) as { covered: number }).covered,
    pages: [text("index.html"), text("content/about.md")],
    trend: coverage.trend.map((point) => point.date),
    explorer: existsSync(path("explorer/index.html")),
  };
  const file = kpiFile(facts, Date.now(), process.env["GITHUB_SHA"] ?? "local");
  writeFileSync(path("dist/kpi.json"), `${JSON.stringify(file, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("write-kpi.ts")) main();
