import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { navLinks } from "./chrome.ts";
import { byDate, COVERAGE_LABELS, NEWS, newsByDate, parseSnapshot, type GapCell, type GapSnapshot, type GapStrategy, type CoverageSnapshot, type Release, type Snapshot, type StrategySnapshot } from "./data.ts";
import { diffText, esc, inline } from "./format.ts";
import {
  COVERAGE_SCOPES,
  coverageTile,
  divergingAt,
  errorText,
  errorWidth,
  gapAt,
  gapRanking,
  gapScale,
  gapShade,
  gapTable,
  gapText,
  niceCeil,
  percentText,
  pickHolds,
  rankStrategies,
  ratioAt,
  sampledText,
  stepText,
  countText,
  strataRows,
  strataText,
  activeRows,
  FORCED_LABEL,
  forcedText,
  priorBasisText,
  determinismText,
  priorText,
  stratumLabel,
  COVERAGE_STRATA_SCOPE,
  COVERAGE_POOLED_SCOPE,
  spaceOf,
  trendChart,
} from "./results-model.ts";

const DATA = new URL("../data/", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, DATA), "utf8");
const KINDS: Record<string, Snapshot["kind"]> = {
  "coverage.json": "coverage",
  "gaps-pack-known-v1.json": "gaps",
  "gaps-pack-select-v2.json": "gaps",
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

  it("puts the news and the releases of a day together, newest day first", () => {
    const r = (release: string, date: string): Release => ({ release, date, title: "", breaking: false, commit: "0000000", pr: null, link: "" });
    const n = { date: "2026-10-29", item: "k1", title: "A measure.", pr: 1, link: "" };
    const days = newsByDate([r("2", "2026-10-28"), r("1", "2026-10-20")], [n, { ...n, date: "2026-10-28", item: "k2" }]);
    expect(days.map(([d, g]) => [d, g.news.map((x) => x.item), g.releases.map((x) => x.release)])).toEqual([
      ["2026-10-29", ["k1"], []],
      ["2026-10-28", ["k2"], ["2"]],
      ["2026-10-20", [], ["1"]],
    ]);
    expect(NEWS.filter((x) => x.date === "2026-10-28").map((x) => x.item).sort()).toEqual(["k105", "k106", "k107", "k22", "k45", "k51", "k78", "k91", "k91"]);
    expect(NEWS.filter((x) => x.date === "2026-10-29").map((x) => x.item)).toEqual(["k123", "k58", "k121", "k119", "k118", "k26", "k116", "k80", "k115", "k79", "k117", "k23", "k47", "k111", "k108", "k112", "k114", "k90", "k91", "k46", "k113"]);
  });
});

describe("the distance to the best", () => {
  const cell = (name: string, median: number, extra: Partial<GapCell> = {}): GapCell => ({ cell: name, n: 4, q1: median / 2, median, q3: median * 2, below0: 0, missing: 0, ...extra });
  const strategy = (id: string, median: number, q3: number, cells: GapCell[]): GapStrategy => ({ strategy: id, records: 8, all: { n: 8, q1: 0, median, q3, below0: 0, missing: 0 }, cells });
  const made: GapSnapshot = {
    schema: "packing-site-snapshot/1",
    kind: "gaps",
    corpus: "c",
    origin: [{ release: "0.0.1", commit: "abc1234", date: "2026-01-01", run: 1, source: "made up" }],
    measure: "pack.gap",
    inputs: 8,
    cells: [
      { cell: "a.fixed", inputs: 4 },
      { cell: "a.freeArea", inputs: 4 },
    ],
    strategies: [
      strategy("rows", 0.2, 0.31, [cell("a.fixed", 0.3, { kinds: { "placed.free": 4 } }), cell("a.freeArea", 0.1, { kinds: { "hull.area": 4 } })]),
      strategy("skyline", 0.1, 0.2, [cell("a.fixed", 0.1, { kinds: { "placed.free": 4 } }), cell("a.freeArea", 0.1, { n: 0, missing: 4 })]),
      strategy("maxrects-bl", 0.1, 0.15, [cell("a.fixed", 0.1, { kinds: { "placed.free": 4 } }), cell("a.freeArea", 0.1, { kinds: { "hull.area": 4 } })]),
    ],
  };

  it("ranks the strategies by the median over all inputs, then by q3", () => {
    expect(gapRanking(made).map((s) => s.strategy)).toEqual(["maxrects-bl", "skyline", "rows"]);
  });

  it("gives a round scale and the positions on it", () => {
    expect(niceCeil(0.31)).toBe(0.5);
    expect(niceCeil(0.238)).toBe(0.25);
    expect(niceCeil(0.2)).toBe(0.2);
    expect(niceCeil(0)).toBe(0.01);
    expect(niceCeil(3)).toBe(5);
    expect(gapScale(made)).toBe(0.5);
    expect(gapAt(0.25, 0.5)).toBe(50);
    expect(gapAt(-1, 0.5)).toBe(0);
    expect(gapAt(2, 0.5)).toBe(100);
    expect(gapShade(0.1, 0.5)).toBeCloseTo(0.2);
    expect(gapText(0)).toBe("0");
    expect(gapText(0.11449)).toBe("0.114");
  });

  it("gives a row for each cell, with the best columns, the empty cells and the main kind of bound", () => {
    const columns = gapRanking(made);
    const rows = gapTable(made, columns);
    expect(rows.map((r) => r.cell)).toEqual(["a.fixed", "a.freeArea"]);
    expect(rows[0]!.best).toEqual([0, 1]);
    expect(rows[0]!.kind).toBe("placed.free");
    expect(rows[1]!.values[1]).toBeUndefined();
    expect(rows[1]!.best).toEqual([]);
    expect(rows[1]!.kind).toBe("hull.area");
  });

  it("reads the snapshots of k45 and k51", () => {
    const known = parseSnapshot(read("gaps-pack-known-v1.json"), "gaps");
    expect(known.measure).toBe("pack.gapToOpt");
    expect(known.inputs).toBe(288);
    expect(known.origin[0]!.run).toBe(40768140939);
    expect(known.strategies.every((s) => s.all.below0 === 0 && s.all.n === 288)).toBe(true);
    expect(gapRanking(known)[0]!.strategy).toBe("portfolio-k2");
    const bound = parseSnapshot(read("gaps-pack-select-v2.json"), "gaps");
    expect(bound.measure).toBe("pack.gap");
    expect(bound.origin[0]!.run).toBe(40766464710);
    expect(bound.strategies.every((s) => s.all.below0 === 0)).toBe(true);
  });
});

describe("the space coverage of k105", () => {
  const snap = parseSnapshot(read("coverage.json"), "coverage") as CoverageSnapshot;

  it("has the k22 run, the first CI coverage run, the k112 run and the stratified run of k115 as points, and a share from 0 to 1 for each measure", () => {
    // The trend has one point for each run. Thus the k112 run and the stratified run of the same date both stay.
    expect(snap.trend.map((p) => p.run).sort()).toEqual([40783923164, 40789799391, 40795429100, 40805165103]);
    expect(snap.latest.measures.map((m) => m.id)).toEqual(["pack.fill", "pack.gap", "pack.overflow.excessArea", "ms"]);
    for (const m of snap.latest.measures) {
      expect(m.share).toBeGreaterThanOrEqual(0);
      expect(m.share).toBeLessThanOrEqual(1);
      expect(m.cells.covered).toBeLessThanOrEqual(m.cells.withRecords);
      expect(m.cells.withRecords).toBeLessThanOrEqual(m.cells.space);
      expect(m.mae).toBeLessThan(m.baselineMae);
      expect(m.medianAe).toBeLessThanOrEqual(m.baselineMedianAe);
      expect(m.byInput!.share).toBeGreaterThanOrEqual(0);
      expect(m.byInput!.mae).toBeLessThanOrEqual(m.mae);
    }
    expect(snap.latest.model.by).toBe("spec");
    expect(Object.keys(snap.trend[0]!.sharesByInput!)).toEqual(Object.keys(snap.trend[0]!.shares));
    expect(snap.origin[0]).toMatchObject({ release: "0.2.17", commit: "e939842", run: 40805165103 });
  });

  it("gives the texts and the widths of the errors", () => {
    expect(percentText(0.2864)).toBe("29%");
    expect(errorText({ scale: "linear" }, 0.0481)).toBe("0.048");
    expect(errorText({ scale: "log" }, 0.083)).toBe("×1.21");
    expect(errorWidth(0.05, 0.2)).toBe(25);
    expect(errorWidth(0.3, 0.2)).toBe(100);
    expect(errorWidth(0.1, 0)).toBe(0);
  });

  it("shows the bench grid and the whole space (sampled) of k112, and not measured yet without the sampled section", () => {
    expect(snap.latest.sampled).toMatchObject({ pairs: 378, seed: 1, draw: "stratified", hardPairs: 1 });
    const m = snap.latest.measures[0]!;
    // The measure keeps the pooled share of the stratified run. The uniform section keeps the k112 run.
    expect(m.sampled).toMatchObject({ n: 378, hits: 15, share: 0.0397 });
    expect(snap.latest.uniform).toMatchObject({ run: 40795429100, date: "2026-10-29", commit: "18a4576", pairs: 400, seed: 1, hardPairs: 3 });
    expect(snap.latest.uniform!.measures["pack.fill"]).toMatchObject({ n: 400, hits: 17, share: 0.0425, low: 0.0267, high: 0.067 });
    const space = spaceOf(snap.latest, m);
    expect(space).toEqual({ uniform: snap.latest.uniform!.measures["pack.fill"], pooled: m.sampled });
    expect(sampledText({ sampled: space.uniform! })).toEqual({ share: "4%", interval: "3% to 7%", pairs: "17 of 400 pairs" });
    const tile = coverageTile(m, "Fill", space);
    expect(tile).toContain("95% interval 3% to 7%, 17 of 400 pairs");
    expect(tile).toContain(`${COVERAGE_POOLED_SCOPE} 4%, 15 of 378 pairs`);
    expect(tile).not.toContain("15 of 378 pairs</small></b>");
    expect(tile.indexOf(COVERAGE_STRATA_SCOPE)).toBeLessThan(tile.indexOf(COVERAGE_POOLED_SCOPE));
    // A stratified snapshot without the uniform section has no uniform share. A uniform snapshot without it gives its own sample.
    expect(spaceOf({ sampled: snap.latest.sampled! }, m)).toEqual({ pooled: m.sampled });
    expect(coverageTile(m, "Fill", spaceOf({ sampled: snap.latest.sampled! }, m))).toContain("not measured yet");
    expect(spaceOf({ sampled: { ...snap.latest.sampled!, draw: "uniform" } }, m)).toEqual({ uniform: m.sampled });
    expect(spaceOf({}, m)).toEqual({ uniform: m.sampled });
    const { sampled: _s, strata: _t, ...rest } = m;
    const bare: CoverageSnapshot["latest"]["measures"][number] = rest;
    expect(sampledText(bare)).toEqual({ share: "not measured yet", interval: null, pairs: null });
    const without = coverageTile(bare, "Fill");
    expect(without).toContain(`>${COVERAGE_SCOPES.grid}<`);
    expect(without).toContain(`>${COVERAGE_SCOPES.space}<`);
    expect(COVERAGE_SCOPES).toEqual({ grid: "bench grid", space: "whole space (sampled)" });
    expect(without).toContain("not measured yet");
    expect(without).not.toContain("95% interval");
    const sampled = { n: 60, hits: 4, share: 0.0667, low: 0.0262, high: 0.1593, mae: 0.4, medianAe: 0.3, baselineMae: 0.5, baselineMedianAe: 0.4 };
    expect(sampledText({ sampled })).toEqual({ share: "7%", interval: "3% to 16%", pairs: "4 of 60 pairs" });
    const withSample = coverageTile({ ...bare, sampled }, "Fill");
    expect(withSample).toContain("95% interval 3% to 16%, 4 of 60 pairs");
    expect(withSample).not.toContain("not measured yet");
    expect(withSample).toContain(percentText(m.share));
  });

  it("shows the strata of k115 when a measure has them, and keeps an old snapshot without them", () => {
    // The data of the site has the strata of the stratified run 40805165103.
    const l = snap.latest.strata!;
    expect(l).toMatchObject({ pairs: 378, draw: "stratified" });
    // The run came before ruin-recreate:1 of k79. The snapshot keeps its 18 strata, and the site shows only them.
    expect(l.strata).toHaveLength(18);
    expect(l.strata.some((s) => s.id === "ruin-recreate:1")).toBe(false);
    expect(snap.latest.measures[0]!.strata!.rows.some((r) => r.stratum === "ruin-recreate:1")).toBe(false);
    expect(strataRows(snap.latest.measures[0]!, l.strata)).not.toContain("ruin-recreate");
    expect(l.strata.find((s) => s.id === "hole-degree:1")).toEqual({ id: "hole-degree:1", pairs: 0, configs: "33", missed: 22 });
    for (const x of snap.latest.measures) {
      expect(x.strata!.strata).toBe(17);
      expect(x.strata!.low).toBeLessThanOrEqual(x.strata!.share);
      expect(x.strata!.share).toBeLessThanOrEqual(x.strata!.high);
    }
    const fill = snap.latest.measures[0]!;
    expect(strataText(fill)).toEqual({ share: "4%", interval: "1% to 7%", strata: "17 strata" });
    expect(strataRows(fill, l.strata)).toContain("no pairs <small>(33 configs)</small>");
    expect(strataRows(fill, l.strata).match(/<li /g)).toHaveLength(18);

    // An old snapshot has no strata. The test then uses made-up strata.
    const { strata: _old, ...old } = fill;
    const m: CoverageSnapshot["latest"]["measures"][number] = old;
    expect(m.strata).toBeUndefined();
    expect(strataText(m)).toBeNull();
    expect(strataRows(m)).toBe("");
    expect(coverageTile(m, "Fill")).not.toContain(COVERAGE_STRATA_SCOPE);

    const strata = {
      share: 0.4375,
      low: 0.3041,
      high: 0.5709,
      strata: 2,
      rows: [
        { stratum: "rows:1", n: 16, hits: 12, share: 0.75, low: 0.5049, high: 0.8983 },
        { stratum: "portfolio:5", n: 16, hits: 2, share: 0.125, low: 0.0349, high: 0.36 },
        { stratum: "cell-portfolio:cell", n: 0, hits: 0, share: null, low: null, high: null },
        { stratum: "hole-degree:1", n: 0, hits: 0, share: null, low: null, high: null },
      ],
    };
    const withStrata = { ...m, strata };
    expect(strataText(withStrata)).toEqual({ share: "44%", interval: "30% to 57%", strata: "2 strata" });
    expect(strataText({ strata: { ...strata, strata: 1 } })!.strata).toBe("1 stratum");
    const tile = coverageTile(withStrata, "Fill");
    expect(tile).toContain(`>${COVERAGE_STRATA_SCOPE}<`);
    expect(tile).toContain("95% interval 30% to 57%, 2 strata");
    // The uniform number stays in the tile, before the mean over the strata.
    expect(tile.indexOf(COVERAGE_SCOPES.space)).toBeLessThan(tile.indexOf(COVERAGE_STRATA_SCOPE));
    expect(tile).toContain("95% interval 2% to 6%, 15 of 378 pairs");

    const rows = strataRows(withStrata);
    expect(rows.match(/<li /g)).toHaveLength(4);
    expect(rows).toContain("<code>rows</code>");
    expect(rows).toContain("<code>portfolio, 5 members</code>");
    expect(rows).toContain("75% <small>(12 of 16)</small>");
    expect(rows).toContain('class="srange" style="left:50.5%;width:39.3%"');
    expect(rows).toContain('class="sdot" style="left:75%"');
    expect(rows).toContain('class="smean" style="left:43.8%"');
    expect(rows).toContain('class="irow srow empty"');
    expect(rows).toContain("no pairs");
    expect(rows).not.toContain("0% <small>");
    expect(rows).not.toContain("configs");

    // A stratified sample gives the count of the configs. A stratum that no sampled input accepts shows no pairs and its count.
    const facts = [
      { id: "rows:1", pairs: 16, configs: "905", missed: 0 },
      { id: "hole-degree:1", pairs: 0, configs: "33", missed: 2 },
      { id: "portfolio:5", pairs: 16, configs: "38385277888016468128534214400", missed: 0 },
    ];
    const counted = strataRows(withStrata, facts);
    expect(counted).toContain("no pairs <small>(33 configs)</small>");
    expect(counted).toContain('title="hole-degree: no pairs, 33 configs. No sampled input accepts this stratum. It is not in the mean."');
    expect(counted).toContain("75% <small>(12 of 16)</small>");
    expect(countText("38385277888016468128534214400")).toBe("38,385,277,888,016,468,128,534,214,400");
    expect(countText("905")).toBe("905");

    expect(stratumLabel("rows:1")).toBe("rows");
    expect(stratumLabel("portfolio:3")).toBe("portfolio, 3 members");
    expect(stratumLabel("cell-portfolio:cell")).toBe("cell-portfolio, members from the cell");
    expect(stratumLabel("aspect-fit:1")).toBe("aspect-fit");
    expect(stratumLabel("odd")).toBe("odd");
  });

  it("shows the active rounds and the forced-overflow split of k116, and keeps an old snapshot without them", () => {
    // The data of the site has no rounds yet. The test uses made-up rounds.
    const m = snap.latest.measures[0]!;
    expect(snap.latest.active).toBeUndefined();
    expect(m.active).toBeUndefined();
    expect(activeRows(m)).toBe("");
    expect(forcedText(m)).toBeNull();
    const active = {
      start: { share: 0.04, mae: 0.3, equal: 0.05 },
      rounds: [
        { round: 1, n: 15, hits: 1, share: 0.0667, low: 0.0119, high: 0.2983, mae: 0.4, after: { share: 0.1, mae: 0.25, equal: 0.12 } },
        { round: 2, n: 15, hits: 3, share: 0.2, low: 0.0705, high: 0.4519, mae: 0.3, after: null },
      ],
    };
    const rows = activeRows({ active });
    expect(rows.match(/<tr/g)).toHaveLength(4);
    expect(rows).toContain("<th scope=\"row\">Grid only</th><td class=\"num\">-</td><td class=\"num\">4%");
    expect(rows).toContain("7% <small>(1 of 15)</small>");
    expect(rows).toContain('<i style="width:10%"></i>');
    // A round without the evaluation sample shows a dash, not 0.
    expect(rows).toMatch(/20% <small>\(3 of 15\)<\/small><\/td><td class="num">-<\/td>/);
    // The table has 3 columns, so it fits a phone without a scroll.
    expect(rows.match(/<th scope="col"/g)).toHaveLength(3);
    const sampled = { ...m.sampled!, forced: { heavy: { n: 30, hits: 0, share: 0 }, rest: { n: 0, hits: 0, share: null } } };
    expect(forcedText({ sampled })).toEqual({ heavy: "0% (0 of 30)", rest: "no pairs" });
    expect(FORCED_LABEL).toContain("half");
    // k121: the two counts of the determinism gate. A snapshot from before k121 shows no sentence.
    const facts = { pairs: 400, seed: 1, draw: "stratified", configRejectionRate: 0, hardPairs: 0 };
    expect(determinismText(undefined)).toBe("");
    expect(determinismText(facts)).toBe("");
    expect(determinismText({ ...facts, nondeterministic: 2, nondeterministicClock: null })).toBe(" In the sample, 2 pairs are not deterministic.");
    expect(determinismText({ ...facts, nondeterministic: 3, nondeterministicClock: 2 })).toContain("1 pairs without a clock limit, and 2 pairs with a clock limit.");
    // The uniform number stays in the tile next to the rounds.
    expect(coverageTile({ ...m, active }, "Fill")).toBe(coverageTile(m, "Fill"));
    // The family prior shows next to the uniform share, and an old snapshot shows no prior.
    expect(priorText(m.sampled)).toBeNull();
    expect(coverageTile(m, "Fill")).not.toContain("family prior");
    const prior = { share: 0.08, low: 0.03, high: 0.2, nEff: 41.5, weighted: 50, zero: 10, covered: 1 };
    expect(priorText({ prior })).toBe("family prior 8% (95% interval 3% to 20%), 50 weighted pairs, 10 pairs of other families with the weight 0");
    expect(priorText({ prior: { ...prior, share: null, low: null, high: null, weighted: 0, zero: 1 } })).toBe("family prior: no pair of a family of the corpus, 1 pair of other families with the weight 0");
    expect(coverageTile({ ...m, sampled: { ...m.sampled!, prior } }, "Fill")).toContain('<small class="alt prior">family prior 8%');
    const withPrior = activeRows({ active: { ...active, start: { ...active.start, prior: 0.06 }, rounds: [{ ...active.rounds[0]!, after: { ...active.rounds[0]!.after!, prior: null } }] } });
    expect(withPrior).toContain("4% <small>family prior 6%</small>");
    expect(withPrior).toContain("10% <small>family prior -</small>");
    // k119: the union prior shows its effective pairs, and the note gives the basis of the weights.
    expect(priorText({ prior: { ...prior, kind: "union" } })).toBe("family prior 8% (95% interval 3% to 20%), 41.5 effective pairs, 50 weighted pairs, 10 pairs of other families with the weight 0");
    const counted = activeRows({ active: { ...active, start: { ...active.start, prior: 0.06, priorCount: { nEff: 30.6, weighted: 37, zero: 0 } } } });
    expect(counted).toContain("4% <small>family prior 6% (30.6 effective pairs)</small>");
    expect(priorBasisText(undefined)).toBeNull();
    const basis = { kind: "union" as const, corpora: ["a", "b"], inputs: 5, families: [{ family: "x@1", inputs: 4, weight: 0.8 }, { family: "y@1", inputs: 1, weight: 0.2 }], absent: ["z@1"], unmapped: [{ family: "q@1", inputs: 2 }] };
    expect(priorBasisText(basis)).toBe(
      "The weights come from the 5 distinct inputs of the 2 committed corpora: x@1 80%, y@1 20%. The sampler families z@1 have no inputs, so their weight is 0. The sampler does not draw q@1 (2 inputs), so these inputs give no weight.",
    );
    expect(priorBasisText({ ...basis, kind: "corpus", corpora: ["a"], absent: [], unmapped: [] })).toBe("The weights come from the 5 inputs of the corpus a: x@1 80%, y@1 20%.");
    expect(COVERAGE_LABELS["pack.gapToBound"]!.label).toBe("Fill below its bound");
  });

  it("places the points of the trend by date and share", () => {
    const trend = [
      { date: "2026-10-28", run: 1, corpus: "c", commit: "a", shares: { f: 0.5, g: 1 } },
      { date: "2026-11-04", run: 2, corpus: "c", commit: "b", shares: { f: 0 } },
    ];
    const chart = trendChart(trend, ["f", "g"], 100, 50, 10);
    expect(chart.series[0]!.points.map((p) => [p.x, p.y])).toEqual([
      [10, 25],
      [90, 40],
    ]);
    expect(chart.series[1]!.points).toHaveLength(1);
    expect(chart.ticks.map((t) => t.x)).toEqual([10, 90]);
    expect(trendChart(trend.slice(0, 1), ["f"], 100, 50, 10).series[0]!.points[0]!.x).toBe(50);
  });
});