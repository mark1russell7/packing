import { describe, expect, it } from "vitest";
import { SELECT_TABLE } from "@mark1russell7/packing";
import {
  COVERAGE_TOP,
  coverageSnapshot,
  familyOfInput,
  gapCellOf,
  gapSnapshot,
  gapStats,
  groupOfFamily,
  leafWins,
  pairedSnapshot,
  releaseEntries,
  SELECT_LEAF_WINS,
  selectSnapshot,
  sig,
  strategySnapshot,
  tableLeaves,
  type LeafWins,
  type SnapshotRecord,
} from "./snapshot.ts";
import { SLOW_SET, type PairedRecord } from "./paired.ts";
import type { CoverageSummary } from "./coverage.ts";

// The snapshots of the site (k32). Made-up records only.

const rec = (strategy: string, input: string, seed: number, fill: number, extra: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
  strategy,
  input,
  seed,
  measures: { "pack.fill": fill, "pack.order.inversions": 0 },
  hard: { "no-overlap": 0 },
  ms: 1,
  ...extra,
});

const origin = [{ release: "0.0.1", commit: "abc1234", date: "2026-01-01", run: 1, source: "made up" }];

describe("snapshot", () => {
  it("gives the family and the group of an input id", () => {
    expect(familyOfInput("c/rect-grid.fixed.rect.none.uniform.n10/s31")).toBe("rect-grid.fixed.rect.none.uniform.n10");
    expect(groupOfFamily("rect-grid.fixed.rect.none.uniform.n10")).toBe("rect-grid.fixed");
    expect(sig(0.123456)).toBe(0.1235);
    expect(sig(Infinity)).toBe(Infinity);
  });

  it("has a pinned win count for each leaf of SELECT_TABLE, and no other leaf", () => {
    const leaves = tableLeaves(SELECT_TABLE);
    expect(leaves.map((l) => l.leaf).sort()).toEqual(SELECT_LEAF_WINS.map((w) => w.leaf).sort());
    expect(new Set(leaves.map((l) => l.leaf)).size).toBe(leaves.length);
    // The training records hold 1305 inputs of pack-screen-v1 and 720 inputs of pack-free-v1.
    expect(SELECT_LEAF_WINS.reduce((s, w) => s + w.of, 0)).toBe(1305 + 720);
    expect(leaves[0]!.path.map((p) => p.test)).toEqual(["fixed", "count below 317", "spread below 0.02"]);
  });

  it("counts a win at a fill ratio of 1.05 with no added hard break", () => {
    const records = [
      rec("rows", "c/a/s1", 1, 0.5),
      rec("maxrects-bl", "c/a/s1", 1, 0.525),
      rec("rows", "c/a/s2", 2, 0.5),
      rec("maxrects-bl", "c/a/s2", 2, 0.6, { hard: { "no-overlap": 1 } }),
      rec("rows", "c/b/s1", 1, 0),
      rec("maxrects-bl", "c/b/s1", 1, 0),
    ];
    const wins = leafWins(records, "rows", "maxrects-bl", (input) => (input.includes("/a/") ? 1 : 2));
    expect(wins.get(1)).toEqual({ wins: 1, of: 2 });
    expect(wins.get(2)).toEqual({ wins: 0, of: 1 });
  });

  it("refuses training counts that are not the pinned counts", () => {
    const train: LeafWins = new Map(SELECT_LEAF_WINS.map((w) => [w.leaf, { wins: w.wins, of: w.of }]));
    const snap = selectSnapshot(train, [{ corpus: "t", wins: new Map([[1, { wins: 3, of: 4 }]]) }], origin);
    expect(snap.leaves).toHaveLength(SELECT_LEAF_WINS.length);
    expect(snap.leaves.find((l) => l.leaf === 1)).toMatchObject({ member: "maxrects-bl", train: { wins: 635, of: 850 }, test: [{ corpus: "t", wins: 3, of: 4 }] });
    train.set(0, { wins: 1, of: 15 });
    expect(() => selectSnapshot(train, [], origin)).toThrow(RangeError);
  });

  it("gives a verdict over families for each strategy, and the losers too", () => {
    const records: SnapshotRecord[] = [];
    for (const family of ["f1", "f2", "f3", "f4"]) {
      for (let seed = 1; seed <= 5; seed++) {
        const input = `c/rect-grid.fixed.${family}/s${seed}`;
        const base = 0.5 + seed / 100;
        records.push(rec("rows", input, seed, base));
        records.push(rec("good", input, seed, base + 0.1));
        records.push(rec("bad", input, seed, base - 0.1));
        records.push(rec("off", input, seed, 0, { skipped: "mode offline" }));
      }
    }
    const snap = strategySnapshot(records, { corpus: "c", origin, measures: ["pack.fill"], runs: 200, draws: 200 });
    expect(snap).toMatchObject({ kind: "strategies", baseline: "rows", inputs: 20, families: 4 });
    const of = (id: string) => snap.strategies.find((s) => s.strategy === id)!;
    expect(of("good").verdicts[0]).toMatchObject({ label: "better", n: 20, families: 4, signs: { wins: 4, losses: 0, ties: 0 } });
    expect(of("good").verdicts[0]!.means!.b).toBeGreaterThan(of("good").verdicts[0]!.means!.a);
    expect(of("bad").verdicts[0]).toMatchObject({ label: "worse", signs: { wins: 0, losses: 4 } });
    expect(of("bad").groups).toEqual([{ group: "rect-grid.fixed", wins: 0, losses: 4, ties: 0 }]);
    expect(of("off")).toMatchObject({ skipped: 20, msMedian: null, verdicts: [{ label: "not measured", n: 0 }] });
    expect(of("rows").verdicts).toEqual([]);
  });

  it("checks the slow set of a paired artifact against its records", () => {
    const slow = "c/rect-grid.freeArea.rect.none.uniform.free.n100/s31";
    const records: PairedRecord[] = [{ input: slow, set: "c", msA: 50, msB: 2, ratio: 0.04, hashA: "h", hashB: "h" }];
    const group = { inputs: 1, medianRatio: 0.04, medianMsA: 50, medianMsB: 2 };
    const artifact = { corpus: "c", strategy: "rows", prediction: "p", repeats: 5, summary: { inputs: 1, errors: 0, hashesEqual: 1, slow: group, other: group, classes: { "x n1": group } } };
    const snap = pairedSnapshot(artifact, records, SLOW_SET, { a: "v1", b: "v2" }, origin);
    expect(snap.slow).toMatchObject({ maxMsA: 50, maxMsB: 2 });
    expect(snap.classes).toEqual([{ name: "x n1", ...group }]);
    expect(() => pairedSnapshot(artifact, [], SLOW_SET, { a: "v1", b: "v2" }, origin)).toThrow(RangeError);
  });

  it("lists the tagged releases of a changelog, newest first", () => {
    const changelog = [
      "# Changelog",
      "",
      "## 0.2.0",
      "",
      "A new layout. This release has breaking changes.",
      "",
      "## 0.1.1",
      "",
      "- New: `packShelf` packs into shelves. It keeps the order.",
      "",
      "## 0.1.0",
      "",
      "- No tag.",
      "",
    ].join("\n");
    const tags = [
      { version: "0.2.0", commit: "bbbbbbb", date: "2026-01-02", subject: "release: 0.2.0 (#9)" },
      { version: "0.1.1", commit: "aaaaaaa", date: "2026-01-01", subject: "release: 0.1.1" },
    ];
    expect(releaseEntries(changelog, tags)).toEqual([
      { release: "0.2.0", date: "2026-01-02", title: "A new layout.", breaking: true, commit: "bbbbbbb", pr: 9, link: "https://github.com/mark1russell7/packing/pull/9" },
      { release: "0.1.1", date: "2026-01-01", title: "`packShelf` packs into shelves.", breaking: false, commit: "aaaaaaa", pr: null, link: "https://github.com/mark1russell7/packing/commit/aaaaaaa" },
    ]);
  });
});

describe("the gap snapshot", () => {
  const gap = (strategy: string, input: string, measures: Record<string, number>, extra: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
    strategy,
    input,
    seed: Number(input.slice(input.lastIndexOf("/s") + 2)),
    measures,
    ...extra,
  });

  it("gives the cell of a family up to its container size", () => {
    expect(gapCellOf("perfect-cut.guillotine.fixed.n10", "fixed")).toBe("perfect-cut.guillotine.fixed");
    expect(gapCellOf("rect-grid.freeArea.holes.none.uniform.n100", "freeArea")).toBe("rect-grid.freeArea");
    expect(gapCellOf("edge-cases.empty", "fixed")).toBe("edge-cases.empty");
    expect(gapCellOf("consecutive-squares.freeHeight.n30")).toBe("consecutive-squares.freeHeight");
  });

  it("gives the count, the quartiles and the values below 0", () => {
    expect(gapStats([0.4, 0.1, 0.2, 0.3, -0.1])).toEqual({ n: 5, q1: 0.1, median: 0.2, q3: 0.3, below0: 1 });
    expect(gapStats([])).toEqual({ n: 0, q1: 0, median: 0, q3: 0, below0: 0 });
  });

  it("summarizes pack.gap by strategy and cell, with the kinds of the bounds and the missing values", () => {
    const records = [
      gap("rows", "c/g.fixed.n10/s1", { "pack.gap": 0.2, "pack.bound.kind": 7 }),
      gap("rows", "c/g.fixed.n10/s2", { "pack.gap": 0.4, "pack.bound.kind": 7 }),
      gap("rows", "c/g.freeArea.n10/s1", { "pack.gap": 0.1, "pack.bound.kind": 4 }),
      gap("rows", "c/g.freeArea.n10/s2", { "pack.bound": 5, "pack.bound.kind": 4 }),
      gap("skyline", "c/g.fixed.n10/s1", { "pack.gap": 0, "pack.bound.kind": 7 }),
      gap("skyline", "c/g.freeArea.n10/s1", { "pack.gap": 0.3, "pack.bound.kind": 0 }, { skipped: "made up" }),
    ];
    const snap = gapSnapshot(records, { corpus: "c", origin, measure: "pack.gap" });
    expect(snap.kind).toBe("gaps");
    expect(snap.inputs).toBe(4);
    expect(snap.cells).toEqual([
      { cell: "g.fixed", inputs: 2 },
      { cell: "g.freeArea", inputs: 2 },
    ]);
    const rows = snap.strategies.find((s) => s.strategy === "rows")!;
    expect(rows.all).toEqual({ n: 3, q1: 0.15, median: 0.2, q3: 0.3, below0: 0, missing: 1 });
    expect(rows.cells).toEqual([
      { cell: "g.fixed", n: 2, q1: 0.25, median: 0.3, q3: 0.35, below0: 0, missing: 0, kinds: { "placed.free": 2 } },
      { cell: "g.freeArea", n: 1, q1: 0.1, median: 0.1, q3: 0.1, below0: 0, missing: 1, kinds: { "hull.area": 1 } },
    ]);
    const sky = snap.strategies.find((s) => s.strategy === "skyline")!;
    expect(sky.cells.map((c) => [c.cell, c.n, c.missing])).toEqual([
      ["g.fixed", 1, 0],
      ["g.freeArea", 0, 1],
    ]);
  });

  it("summarizes pack.gapToOpt without kinds, and drops a value that is not finite", () => {
    const records = [gap("rows", "c/k.fixed.n10/s1", { "pack.gapToOpt": 0.1 }), gap("rows", "c/k.fixed.n10/s2", { "pack.gapToOpt": Infinity })];
    const snap = gapSnapshot(records, { corpus: "c", origin, measure: "pack.gapToOpt", cellOf: () => "one" });
    expect(snap.strategies[0]!.cells).toEqual([{ cell: "one", n: 1, q1: 0.1, median: 0.1, q3: 0.1, below0: 0, missing: 1 }]);
  });
});

describe("the coverage snapshot (k105)", () => {
  const measure = (id: string, share: number): CoverageSummary["measures"][number] => ({
    id,
    scale: "linear",
    tolerance: 0.02,
    n: 10,
    model: { mae: 0.01, medianAe: 0.005, withinTolerance: 0.9 },
    baseline: { mae: 0.1, medianAe: 0.08, withinTolerance: 0.1 },
    skill: 0.9,
    explained: { strategy: 0.2, input: 0.5, joint: 0.9 },
    noise: 0.1,
    indices: Array.from({ length: 9 }, (_, i) => ({ feature: `f${i}`, group: "input" as const, index: 0.9 - i * 0.1 })),
    cells: { space: 10, withRecords: 8, covered: 6 },
    share,
    shareOfMeasured: 0.75,
  });
  const summary = (date: string, share: number, run: number | null = 7): CoverageSummary => ({
    schema: "packing-coverage/1",
    date,
    run,
    corpus: "c",
    records: 10,
    inputs: 5,
    strategies: ["a", "b"],
    features: { strategy: ["stage.placement"], input: ["size"] },
    model: { kind: "regression-tree", maxDepth: 12, minLeaf: 3, folds: 5, seed: 1, by: "input", features: "family" },
    measures: [measure("pack.fill", share)],
  });
  const origin = { release: "0.0.1", commit: "abc1234", date: "2026-10-28", run: 7, source: "made up" };

  it("keeps the errors, the shares and the top indices of each measure", () => {
    const snap = coverageSnapshot(summary("2026-10-28", 0.6), origin);
    expect(snap.kind).toBe("coverage");
    const m = snap.latest.measures[0]!;
    expect(m).toMatchObject({ id: "pack.fill", mae: 0.01, baselineMae: 0.1, share: 0.6, cells: { space: 10, withRecords: 8, covered: 6 } });
    expect(m.indices).toHaveLength(COVERAGE_TOP);
    expect(snap.trend).toEqual([{ date: "2026-10-28", run: 7, corpus: "c", commit: "abc1234", shares: { "pack.fill": 0.6 } }]);
  });

  it("adds a point to the trend, and replaces the point of the same run", () => {
    const first = coverageSnapshot(summary("2026-10-28", 0.6, 7), origin);
    const second = coverageSnapshot(summary("2026-11-04", 0.7, 8), origin, first);
    expect(second.trend.map((p) => [p.date, p.run, p.shares["pack.fill"]])).toEqual([
      ["2026-10-28", 7, 0.6],
      ["2026-11-04", 8, 0.7],
    ]);
    const again = coverageSnapshot(summary("2026-10-28", 0.65, 7), origin, second);
    expect(again.trend.map((p) => [p.date, p.run, p.shares["pack.fill"]])).toEqual([
      ["2026-10-28", 7, 0.65],
      ["2026-11-04", 8, 0.7],
    ]);
    expect(again.latest.date).toBe("2026-10-28");
    // A second run on the same date and corpus keeps the first point.
    const twice = coverageSnapshot(summary("2026-10-28", 0.5, 9), origin, again);
    expect(twice.trend.map((p) => [p.date, p.run])).toEqual([
      ["2026-10-28", 7],
      ["2026-10-28", 9],
      ["2026-11-04", 8],
    ]);
    // A point without a run replaces the point of the same date and corpus.
    const local = coverageSnapshot(summary("2026-11-04", 0.4, null), origin, twice);
    expect(local.trend.map((p) => [p.date, p.run])).toEqual([
      ["2026-10-28", 7],
      ["2026-10-28", 9],
      ["2026-11-04", null],
    ]);
  });

  it("keeps the median errors, and puts the numbers of the folds by input next to the first numbers", () => {
    const strict = summary("2026-10-28", 0.5);
    const loose = summary("2026-10-28", 0.6);
    const snap = coverageSnapshot(strict, origin, undefined, loose);
    expect(snap.latest.measures[0]).toMatchObject({ medianAe: 0.005, baselineMedianAe: 0.08, share: 0.5, byInput: { mae: 0.01, medianAe: 0.005, share: 0.6 } });
    expect(snap.trend[0]).toMatchObject({ shares: { "pack.fill": 0.5 }, sharesByInput: { "pack.fill": 0.6 } });
    expect(coverageSnapshot(strict, origin).latest.measures[0]!.byInput).toBeUndefined();
  });

  it("keeps the held-out numbers of the whole space (k112) when the summary has them", () => {
    const plain = coverageSnapshot(summary("2026-10-28", 0.5), origin);
    expect(plain.latest.measures[0]!.sampled).toBeUndefined();
    expect("sampled" in plain.latest).toBe(false);
    const sampled = {
      pairs: 60,
      sample: { seed: 1, draw: "uniform", requested: 60, configRejectionRate: 0.02, inputsRejected: 3, hardPairs: 1, nondeterministic: 0, composition: { portfolio: 60 } },
      measures: [{ id: "pack.fill", scale: "linear" as const, tolerance: 0.02, n: 60, hits: 4, share: 0.0667, wilson: { low: 0.0262, high: 0.1593 }, mae: 0.4, medianAe: 0.3, baseline: { mae: 0.5, medianAe: 0.4, withinTolerance: 0 } }],
    };
    const snap = coverageSnapshot({ ...summary("2026-10-28", 0.5), sampled }, origin);
    expect(snap.latest.measures[0]!.sampled).toEqual({ n: 60, hits: 4, share: 0.0667, low: 0.0262, high: 0.1593, mae: 0.4, medianAe: 0.3, baselineMae: 0.5, baselineMedianAe: 0.4 });
    expect(snap.latest.sampled).toEqual({ pairs: 60, seed: 1, draw: "uniform", configRejectionRate: 0.02, hardPairs: 1 });
    expect(snap.trend).toEqual(plain.trend);
    expect(snap.latest.uniform).toEqual({
      date: "2026-10-28",
      run: 7,
      commit: "abc1234",
      pairs: 60,
      seed: 1,
      configRejectionRate: 0.02,
      hardPairs: 1,
      measures: { "pack.fill": snap.latest.measures[0]!.sampled },
    });
  });

  it("keeps the last uniform sample (k115) after a stratified sample, and a later uniform sample replaces it", () => {
    const sample = (draw: string, n: number, hits: number) => ({
      pairs: n,
      sample: { seed: 1, draw, requested: n, configRejectionRate: 0.5, inputsRejected: 0, hardPairs: 0, nondeterministic: 0, composition: {} },
      measures: [{ id: "pack.fill", scale: "linear" as const, tolerance: 0.02, n, hits, share: hits / n, wilson: { low: 0, high: 1 }, mae: 0.4, medianAe: 0.3, baseline: { mae: 0.5, medianAe: 0.4, withinTolerance: 0 } }],
    });
    const first = coverageSnapshot({ ...summary("2026-10-28", 0.5, 7), sampled: sample("uniform", 400, 17) }, origin);
    const strat = coverageSnapshot({ ...summary("2026-10-29", 0.5, 8), sampled: sample("stratified", 378, 15) }, { ...origin, commit: "def5678" }, first);
    // The measure keeps the share pooled over the strata. The uniform sample keeps its run and its date.
    expect(strat.latest.measures[0]!.sampled).toMatchObject({ n: 378, hits: 15 });
    expect(strat.latest.sampled!.draw).toBe("stratified");
    expect(strat.latest.uniform).toEqual(first.latest.uniform);
    expect(strat.latest.uniform).toMatchObject({ run: 7, date: "2026-10-28", commit: "abc1234", pairs: 400, measures: { "pack.fill": { n: 400, hits: 17 } } });
    // A summary without a sample also keeps it.
    expect(coverageSnapshot(summary("2026-10-30", 0.5, 9), origin, strat).latest.uniform).toEqual(first.latest.uniform);
    const later = coverageSnapshot({ ...summary("2026-11-04", 0.5, 10), sampled: sample("uniform", 200, 9) }, origin, strat);
    expect(later.latest.uniform).toMatchObject({ run: 10, date: "2026-11-04", pairs: 200, measures: { "pack.fill": { n: 200, hits: 9 } } });

    // A snapshot from before k115 has no uniform section. Its own uniform sample gives the section.
    const { uniform: _u, ...old } = first.latest;
    const fromOld = coverageSnapshot({ ...summary("2026-10-29", 0.5, 8), sampled: sample("stratified", 378, 15) }, origin, { ...first, latest: old });
    expect(fromOld.latest.uniform).toEqual(first.latest.uniform);
    // A stratified sample is never the uniform section.
    expect(coverageSnapshot({ ...summary("2026-10-29", 0.5, 8), sampled: sample("stratified", 378, 15) }, origin).latest.uniform).toBeUndefined();
  });

  it("keeps the strata (k115) when the summary has them, and has no strata without them", () => {
    const plain = coverageSnapshot(summary("2026-10-28", 0.5), origin);
    expect(plain.latest.measures[0]!.strata).toBeUndefined();
    expect("strata" in plain.latest).toBe(false);
    const strata = {
      pairs: 32,
      draw: "stratified",
      strata: [
        { id: "rows:1", pairs: 16, configs: "905", missed: 0 },
        { id: "portfolio:5", pairs: 16, configs: "38385277888016468128534214400", missed: 0 },
        { id: "hole-degree:1", pairs: 0, configs: "33", missed: 2 },
      ],
      measures: [
        {
          id: "pack.fill",
          tolerance: 0.02,
          strata: [
            { stratum: "rows:1", n: 16, hits: 12, share: 0.75, wilson: { low: 0.5049, high: 0.8983 } },
            { stratum: "portfolio:5", n: 16, hits: 2, share: 0.125, wilson: { low: 0.0349, high: 0.36 } },
            { stratum: "hole-degree:1", n: 0, hits: 0, share: null, wilson: null },
          ],
          equal: { strata: 2, share: 0.4375, se: 0.0681, interval: { low: 0.3041, high: 0.5709 } },
        },
      ],
    };
    const snap = coverageSnapshot({ ...summary("2026-10-28", 0.5), strata }, origin);
    expect(snap.latest.strata).toEqual({ pairs: 32, draw: "stratified", strata: strata.strata });
    expect(snap.latest.measures[0]!.strata).toEqual({
      share: 0.4375,
      low: 0.3041,
      high: 0.5709,
      strata: 2,
      rows: [
        { stratum: "rows:1", n: 16, hits: 12, share: 0.75, low: 0.5049, high: 0.8983 },
        { stratum: "portfolio:5", n: 16, hits: 2, share: 0.125, low: 0.0349, high: 0.36 },
        // A stratum without pairs keeps null, not a share of 0.
        { stratum: "hole-degree:1", n: 0, hits: 0, share: null, low: null, high: null },
      ],
    });
    expect(snap.trend).toEqual(plain.trend);
  });

  it("keeps the rounds of the active sample and the forced-overflow split (k116), and has neither without them", () => {
    const plain = coverageSnapshot(summary("2026-10-28", 0.5), origin);
    expect("active" in plain.latest).toBe(false);
    expect(plain.latest.measures[0]!.active).toBeUndefined();
    const evalAt = (share: number) => ({ id: "pack.fill", n: 40, hits: share * 40, share, mae: 0.2, equal: share });
    const active = {
      pairs: 8,
      features: "input" as const,
      facts: { rounds: 2, pool: 160, score: "fold-spread", features: "input" },
      evalPairs: 40,
      start: [evalAt(0.05)],
      rounds: [1, 2].map((round) => ({
        round,
        pairs: 4,
        measures: [{ id: "pack.fill", tolerance: 0.02, n: 4, hits: round - 1, share: (round - 1) / 4, wilson: { low: 0, high: 0.6 }, mae: 0.3, after: evalAt(round === 1 ? 0.1 : 0.15) }],
      })),
    };
    const forced = { heavy: { n: 30, hits: 0, share: 0, wilson: { low: 0, high: 0.1135 } }, rest: { n: 30, hits: 4, share: 0.1333, wilson: { low: 0.0531, high: 0.2968 } } };
    const prior = { share: 0.08, wilson: { low: 0.03, high: 0.2 }, nEff: 41.5, weighted: 50, zero: 10, covered: 1 };
    const sampled = {
      pairs: 60,
      measures: [{ id: "pack.fill", scale: "linear" as const, tolerance: 0.02, n: 60, hits: 4, share: 0.0667, wilson: { low: 0.0262, high: 0.1593 }, mae: 0.4, medianAe: 0.3, baseline: { mae: 0.5, medianAe: 0.4, withinTolerance: 0 }, forced, prior }],
    };
    const snap = coverageSnapshot({ ...summary("2026-10-28", 0.5), sampled, active }, origin);
    expect(snap.latest.active).toEqual({ pairs: 8, features: "input", score: "fold-spread", pool: 160, rounds: 2, evalPairs: 40 });
    expect(snap.latest.measures[0]!.active).toEqual({
      start: { share: 0.05, mae: 0.2, equal: 0.05 },
      rounds: [
        { round: 1, n: 4, hits: 0, share: 0, low: 0, high: 0.6, mae: 0.3, after: { share: 0.1, mae: 0.2, equal: 0.1 } },
        { round: 2, n: 4, hits: 1, share: 0.25, low: 0, high: 0.6, mae: 0.3, after: { share: 0.15, mae: 0.2, equal: 0.15 } },
      ],
    });
    expect(snap.latest.measures[0]!.sampled!.forced).toEqual({ heavy: { n: 30, hits: 0, share: 0 }, rest: { n: 30, hits: 4, share: 0.1333 } });
    expect(snap.latest.measures[0]!.sampled!.prior).toEqual({ share: 0.08, low: 0.03, high: 0.2, nEff: 41.5, weighted: 50, zero: 10, covered: 1 });
    expect(snap.trend).toEqual(plain.trend);
  });
});