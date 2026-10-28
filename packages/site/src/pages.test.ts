import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { navLinks } from "./chrome.ts";
import { byDate, parseSnapshot, type Release, type Snapshot, type StrategySnapshot } from "./data.ts";
import { diffText, esc, inline } from "./format.ts";
import { divergingAt, pickHolds, rankStrategies, ratioAt, stepText } from "./results-model.ts";

const DATA = new URL("../data/", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, DATA), "utf8");
const KINDS: Record<string, Snapshot["kind"]> = {
  "paired-k67.json": "paired",
  "releases.json": "releases",
  "select-table.json": "select",
  "strategies-pack-free-v1.json": "strategies",
  "strategies-pack-screen-v1.json": "strategies",
  "strategies-pack-select-v1.json": "strategies",
  "strategies-pack-select-v2.json": "strategies",
};

describe("navLinks", () => {
  it("links each page from the base, and marks the current page", () => {
    const links = navLinks("/packing/", "results");
    expect(links.map((l) => [l.label, l.href])).toEqual([
      ["Demo", "/packing/"],
      ["Compare", "/packing/compare/"],
      ["Strategies", "/packing/strategies/"],
      ["Results", "/packing/results/"],
      ["What's new", "/packing/whats-new/"],
      ["Status", "/packing/status/"],
      ["Releases", "/packing/releases/"],
      ["Source on GitHub", "https://github.com/mark1russell7/packing"],
    ]);
    expect(links.filter((l) => l.current).map((l) => l.id)).toEqual(["results"]);
  });

  it("adds the slash at the end of a base without one", () => {
    expect(navLinks("/x", "demo").find((l) => l.id === "results")!.href).toBe("/x/results/");
    expect(navLinks("/", "demo")[0]!.href).toBe("/");
  });
});

describe("the snapshot files", () => {
  it("has exactly the files that the pages read", () => {
    expect(readdirSync(DATA).sort()).toEqual(Object.keys(KINDS).sort());
  });

  for (const [name, kind] of Object.entries(KINDS)) {
    it(`${name} is a small snapshot of the kind ${kind}, with an origin`, () => {
      expect(statSync(new URL(name, DATA)).size).toBeLessThan(200_000);
      const snap = parseSnapshot(read(name), kind);
      for (const o of snap.origin) expect(o.commit).toMatch(/^[0-9a-f]{7}$/);
    });
  }

  it("refuses a snapshot of another kind, and a snapshot without an origin", () => {
    expect(() => parseSnapshot(read("paired-k67.json"), "select")).toThrow(/kind/);
    const bad = JSON.parse(read("paired-k67.json")) as { origin: unknown[] };
    bad.origin = [{ release: "0.2.17" }];
    expect(() => parseSnapshot(JSON.stringify(bad), "paired")).toThrow(/origin/);
  });

  it("shows the paired result of k67", () => {
    const p = parseSnapshot(read("paired-k67.json"), "paired");
    expect(p.origin[0]!.run).toBe(40741632077);
    expect(p.hashesEqual).toBe(p.inputs);
    expect(p.slow.medianRatio).toBeLessThan(0.1);
  });

  it("has each release once, with the newest first", () => {
    const r = parseSnapshot(read("releases.json"), "releases").releases;
    expect(new Set(r.map((x) => x.release)).size).toBe(r.length);
    expect(r.at(-1)!.release).toBe("0.1.0");
    const dates = r.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("the calculations of the pages", () => {
  const snap = parseSnapshot(read("strategies-pack-free-v1.json"), "strategies");

  it("ranks the strategies by the fill, without the baseline, and puts a strategy without a verdict last", () => {
    const ranked = rankStrategies(snap, "pack.fill");
    expect(ranked.some((s) => s.strategy === snap.baseline)).toBe(false);
    expect(ranked.at(-1)!.strategy).toBe("push");
    const means = ranked.flatMap((s) => s.verdicts.filter((v) => v.measure === "pack.fill" && v.stratified !== undefined).map((v) => v.stratified!.mean));
    expect([...means].sort((a, b) => b - a)).toEqual(means);
  });

  it("ranks a made-up snapshot", () => {
    const made = { ...snap, baseline: "a", strategies: [{ ...snap.strategies[0]!, strategy: "a" }] } as StrategySnapshot;
    expect(rankStrategies(made, "pack.fill")).toEqual([]);
  });

  it("places values on the scales", () => {
    expect(divergingAt(0, 1)).toBe(50);
    expect(divergingAt(2, 1)).toBe(100);
    expect(divergingAt(-0.5, 1)).toBe(25);
    expect(ratioAt(1)).toBeCloseTo(76.14, 1);
    expect(ratioAt(0.03)).toBe(0);
    expect(ratioAt(3)).toBe(100);
    expect(ratioAt(0.001)).toBe(0);
  });

  it("gives the text of the steps and the picks of the select table", () => {
    expect(stepText({ feature: "fixed", test: "fixed", yes: false })).toBe("Free size");
    expect(stepText({ feature: "count", test: "count below 317", yes: false })).toBe("Boxes 317 or more");
    expect(stepText({ feature: "spread", test: "spread below 0.27", yes: true })).toBe("Size spread below 0.27");
    const leaf = { leaf: 0, pick: 0, member: "rows", path: [], train: { wins: 0, of: 0 }, test: [] };
    expect(pickHolds(leaf, { wins: 4, of: 10 })).toBe(true);
    expect(pickHolds({ ...leaf, member: "maxrects-bl" }, { wins: 4, of: 10 })).toBe(false);
  });

  it("formats the differences and escapes the text", () => {
    expect(diffText(0.043, true)).toBe("+4.3 pts");
    expect(diffText(-0.16, true)).toBe("−16 pts");
    expect(diffText(0.00001, true)).toBe("0 pts");
    expect(diffText(-0.012, false)).toBe("−0.01");
    expect(esc(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(inline("A `<b>` code")).toBe("A <code>&lt;b&gt;</code> code");
  });

  it("groups the releases by date, newest first", () => {
    const r = (release: string, date: string): Release => ({ release, date, title: "", breaking: false, commit: "0000000", pr: null, link: "" });
    expect(byDate([r("3", "2026-10-28"), r("1", "2026-10-20"), r("2", "2026-10-28")]).map(([d, l]) => [d, l.map((x) => x.release)])).toEqual([
      ["2026-10-28", ["3", "2"]],
      ["2026-10-20", ["1"]],
    ]);
  });
});
