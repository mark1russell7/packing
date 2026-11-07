// The tests of the data stamps. The freshness gate of pages.yml reads the stamps that `siteDataStamps` gives.

import { readFileSync } from "node:fs";
import { parseDataStamps } from "@mark1russell7/site-pages";
import { describe, expect, it } from "vitest";
import type { Origin } from "./data.ts";
import { CURRENT_LIMIT, ENGINE, runOf, siteDataStamps, STAMPED_PAGES } from "./stamps.ts";

const FULL = "441bb21aa7c3e0d9f5b6c2e4a8d1f3b5c7e9a0b2";
const origin = (run: number | null, commit = "441bb21", date = "2026-11-05", release = "0.8.0"): Origin => ({ release, commit, date, run, source: "x" });
const known = (commit: string): string => (FULL.startsWith(commit) ? FULL : "unknown");
const file = (...origins: Origin[]): string => JSON.stringify({ origin: origins });

describe("runOf", () => {
  it("gives the run of an origin, with the full commit and the earliest time of its day", () => {
    expect(runOf("a.json", origin(41993720877), known)).toEqual({
      id: "41993720877",
      url: "https://github.com/mark1russell7/packing/actions/runs/41993720877",
      date: "2026-11-05T00:00:00Z",
      engines: { [ENGINE]: "0.8.0" },
      commit: FULL,
    });
  });

  it("gives no run for data from the repository only", () => {
    expect(runOf("a.json", origin(null), known)).toBeUndefined();
  });

  it("names no commit when the history of the build has no such commit", () => {
    const run = runOf("a.json", origin(40768140939, "f457280"), known);
    expect(run?.id).toBe("40768140939");
    expect(run).not.toHaveProperty("commit");
  });

  it("names no commit when the full commit does not start with the short commit", () => {
    expect(runOf("a.json", origin(1, "1234567"), () => FULL)).not.toHaveProperty("commit");
  });

  it("stops the build on a date that is not a day", () => {
    expect(() => runOf("a.json", origin(1, "441bb21", "2026-11-05T10:00:00Z"), known)).toThrow(/not YYYY-MM-DD/);
  });
});

describe("siteDataStamps", () => {
  const files: Record<string, string> = {
    "coverage.json": file(origin(3, "441bb21", "2026-11-06")),
    "gaps-pack-known-v1.json": file(origin(null)),
    "gaps-pack-select-v2.json": file(origin(1, "441bb21", "2026-10-28"), origin(2)),
  };
  const read = (name: string): string => files[name] ?? file(origin(2), origin(1, "441bb21", "2026-10-28"));

  it("gives each run of a page once, from the oldest to the newest, with the current limit", () => {
    const stamps = siteDataStamps(read, known);
    expect(stamps.pages.map((p) => p.page)).toEqual(Object.keys(STAMPED_PAGES));
    const results = stamps.pages.find((p) => p.page === "results/index.html");
    expect(results?.runs.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(results?.limit).toBe(CURRENT_LIMIT);
    expect(stamps.pages.find((p) => p.page === "strategies/index.html")?.runs.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("gives stamps that the gate reads with no fault", () => {
    expect(parseDataStamps(siteDataStamps(read, known))).toMatchObject({ ok: true });
  });

  it("stops the build on a file with no list of origins, and on a page with no run of CI", () => {
    expect(() => siteDataStamps(() => "{}", known)).toThrow(/has no list of origins/);
    expect(() => siteDataStamps(() => file(origin(null)), known)).toThrow(/shows no data of a CI run/);
  });

  it("reads the committed files of data/ with no fault", () => {
    const committed = (name: string): string => readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8");
    expect(parseDataStamps(siteDataStamps(committed, known))).toMatchObject({ ok: true });
  });
});

describe("the pages with a stamp", () => {
  it("each have one stamp mark, and the fixed studies have none", () => {
    const marks = (path: string): number => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").split("<!-- data-stamp -->").length - 1;
    for (const page of Object.keys(STAMPED_PAGES)) expect(marks(page), page).toBe(1);
    for (const page of ["results/studies/index.html", "explorer/index.html", "compare/index.html", "index.html"]) expect(marks(page), page).toBe(0);
  });

  it("are inputs of the build, and the studies page is an input too", () => {
    // The config of the build is outside the root of the type check, so the test reads its text.
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toContain(`results: page("./results/index.html")`);
    expect(config).toContain(`strategies: page("./strategies/index.html")`);
    expect(config).toContain(`"results-studies": page("./results/studies/index.html")`);
    expect(config).toContain("siteStamps(dataStamps)");
    expect(readFileSync(new URL("../results/studies/index.html", import.meta.url), "utf8")).toContain("/src/results-studies.ts");
  });
});
