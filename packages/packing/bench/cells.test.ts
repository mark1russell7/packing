import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cellKeyOf, cellsMain, cellsMarkdown, cellsReportOf, decisionOf, fillRatio, oracleOf, subsetsOf, WIN_RATIO, type CellRecord, type CorpusCell } from "./cells.ts";
import { corpusHashOf } from "./split.ts";

// The cells report of k66 on made-up records only. The test reads no time of this computer.

const SEEDS = [1, 2, 3, 4, 5];

const record = (strategy: string, input: string, fill: number, extra: Partial<CellRecord> = {}): CellRecord => ({
  strategy,
  input,
  measures: { "pack.fill": fill },
  hard: { "no-overlap": 0, "in-container": 0 },
  deterministic: true,
  ms: 1,
  ...extra,
});

/** This function gives the records of each seed of one cell, with the fills of `bl` and `rows`. */
function cellRecords(cell: string, bl: number, rows: number, extra: Partial<CellRecord> = {}): CellRecord[] {
  return SEEDS.flatMap((s) => [record("bl", `t/${cell}/s${s}`, bl, extra), record("rows", `t/${cell}/s${s}`, rows)]);
}

/** The cells of the made-up inputs: `win` and `loss` differ in the count, `hard` and `zero` in the shape. */
const CELLS: Record<string, CorpusCell> = {
  win: { containerShape: "circle", containerSize: "fixed", sizes: "heavyTail", count: "100", order: "free" },
  loss: { containerShape: "circle", containerSize: "fixed", sizes: "heavyTail", count: "1k", order: "free" },
  hard: { containerShape: "rect", containerSize: "fixed", sizes: "uniform", count: "100", order: "free" },
  zero: { containerShape: "rect", containerSize: "fixed", sizes: "uniform", count: "1k", order: "free" },
};

const cellMap = new Map(Object.entries(CELLS).flatMap(([cell, c]) => SEEDS.map((s) => [`t/${cell}/s${s}`, c] as const)));

const records = [
  ...cellRecords("win", 0.9, 0.6),
  ...cellRecords("loss", 0.6, 0.9),
  ...cellRecords("hard", 0.9, 0.6, { hard: { "no-overlap": 1, "in-container": 0 } }),
  ...cellRecords("zero", 0, 0),
];

const report = cellsReportOf(records, { candidate: "bl", current: "rows", cells: cellMap });
const cellOf = (key: string) => report.cells.find((c) => c.cell === `t/${key}`)!;

describe("the fill ratio", () => {
  it("divides the candidate by the default, so above 1 tells that the candidate fills more", () => {
    expect(fillRatio(0.9, 0.6)).toBeCloseTo(1.5, 12);
    expect(fillRatio(0.6, 0.9)).toBeCloseTo(2 / 3, 12);
    expect([fillRatio(0, 0), fillRatio(0.5, 0)]).toEqual([1, Infinity]);
  });

  it("gives the cell key of an input id without its seed", () => {
    expect(cellKeyOf("pack-screen-v1/rect-grid.fixed.rect.none.uniform.n10/s3")).toBe("pack-screen-v1/rect-grid.fixed.rect.none.uniform.n10");
  });
});

describe("the cells report", () => {
  it("counts a win for bl 0.9 against rows 0.6, and the selector picks bl in that cell", () => {
    const c = cellOf("win");
    expect([c.inputs, c.wins, c.winShare, c.trainInputs, c.heldOutInputs]).toEqual([5, 5, 1, 4, 1]);
    expect(c.trainMedian).toBeCloseTo(1.5, 12);
    expect(c.pick).toBe("candidate");
  });

  it("counts no win for bl 0.6 against rows 0.9, and the selector picks rows", () => {
    const c = cellOf("loss");
    expect([c.wins, c.pick]).toEqual([0, "default"]);
  });

  it("counts no win when the candidate adds a hard break, and no win for two fills of 0", () => {
    expect(cellOf("hard").wins).toBe(0);
    expect(cellOf("zero")).toMatchObject({ wins: 0, medianRatio: 1, pick: "default" });
  });

  it("gives the overall shares, and scores the selector on the held-out seed 3", () => {
    expect([report.inputs, report.wins, report.winShare, report.clearShare, report.heldOut]).toEqual([20, 5, 0.25, 1, 3]);
    expect(report.medianRatio).toBeCloseTo(1.25, 12);
    // The held-out inputs: win, loss, hard and zero of seed 3. The selector picks bl in `win` and `hard`.
    const s = report.selector;
    expect([s.inputs, s.defaultPicks, s.defaultShare, s.hardBreaks]).toEqual([4, 2, 0.5, 1]);
    // The gains: 0.5 in `win` and `hard`, 0 in `loss` and `zero`. The oracle avoids the hard break of `hard`.
    expect(s.gainMean).toBeCloseTo(0.25, 12);
    expect(s.oracleGainMean).toBeCloseTo(0.125, 12);
    expect(s.accuracy).toBe(0.75);
  });

  it("gives the oracle with fewer hard breaks first, then more fill", () => {
    const base = { input: "x", cell: "x", seed: 3, features: report.cells[0]!.features, candidateOverDefault: 1, hardOk: true, win: false };
    expect(oracleOf({ ...base, candidateFill: 0.9, defaultFill: 0.6, candidateHard: 1, defaultHard: 0 })).toBe("default");
    expect(oracleOf({ ...base, candidateFill: 0.9, defaultFill: 0.6, candidateHard: 0, defaultHard: 0 })).toBe("candidate");
    expect(oracleOf({ ...base, candidateFill: 0.6, defaultFill: 0.6, candidateHard: 0, defaultHard: 0 })).toBe("default");
  });

  it("gives the time ratio of the pick against the default, with the floor of 5 / 1.5 ms", () => {
    const times = [...cellRecords("win", 0.9, 0.6, { ms: 10 }), ...cellRecords("loss", 0.6, 0.9, { ms: 10 })].map((r) => (r.strategy === "rows" ? { ...r, ms: 2, nodes: 1000 } : r));
    const timed = cellsReportOf(records, { candidate: "bl", current: "rows", cells: cellMap, times, nsPerItem: 1000 });
    // The pick in `win` is bl: 10 / max(2, 3.333) = 3. The pick in `loss` is rows: 2 / 3.333 = 0.6.
    const t = timed.time!;
    expect([t.pick.inputs, t.pick.missing, t.pick.raised]).toEqual([2, 2, 2]);
    expect(t.pick.median.value).toBeCloseTo(1.8, 12);
    // The feature bound adds 1000 nodes * 1000 ns = 1 ms to each pick.
    expect(t.featureMsMax).toBe(1);
    expect(t.withFeatures.median.value).toBeCloseTo((3.3 + 0.9) / 2, 12);
  });
});

describe("the decision tables", () => {
  it("gives each subset of 1 to 3 features", () => {
    expect(subsetsOf(["count", "shape", "spread"]).map((s) => s.join(","))).toEqual(["count", "count,shape", "count,shape,spread", "count,spread", "shape", "shape,spread", "spread"]);
  });

  it("picks bl in the leaves of the count 100, with the rule of the selector on the training seeds", () => {
    const table = report.decision.find((t) => t.features.join() === "count,shape")!;
    const picks = Object.fromEntries(table.leaves.map((l) => [`${l.values.count}/${l.values.shape}`, l.pick]));
    expect(picks).toEqual({ "100/circle": "candidate", "1k/circle": "default", "100/rect": "candidate", "1k/rect": "default" });
    expect(table.trainAccuracy).toBe(0.75);
    expect(decisionOf([], ["count"], 3).leafCount).toBe(0);
    expect(WIN_RATIO).toBe(1.05);
  });
});

describe("the folds of a split", () => {
  const loso = SEEDS.map((s) => ({ train: SEEDS.filter((t) => t !== s), heldOut: [s] }));

  it("gives the same scores as --held-out 3 for one fold that holds out seed 3", () => {
    const split = cellsReportOf(records, { candidate: "bl", current: "rows", cells: cellMap, folds: [{ train: [1, 2, 4, 5], heldOut: [3] }], split: "default" });
    expect(split.selector).toEqual(report.selector);
    expect(split.decision).toEqual(report.decision);
    expect([split.heldOut, split.trainInputs, split.folds]).toEqual(["default", 16, [{ train: [1, 2, 4, 5], heldOut: [3] }]]);
  });

  it("pools the held-out inputs of each fold, so leave-one-seed-out scores each input once", () => {
    const r = cellsReportOf(records, { candidate: "bl", current: "rows", cells: cellMap, folds: loso, split: "loso" });
    const s = r.selector;
    expect([s.inputs, s.defaultPicks, s.hardBreaks, s.accuracy]).toEqual([20, 10, 5, 0.75]);
    expect(r.decision.find((t) => t.features.join() === "count")!.heldOut.inputs).toBe(20);
    expect(cellsMarkdown(r)).toContain("The split is `loso`, with 5 folds: train 2 3 4 5 and held out 1");
  });

  it("leaves out an input whose seed is in no list of the fold", () => {
    const r = cellsReportOf(records, { candidate: "bl", current: "rows", cells: cellMap, folds: [{ train: [1, 2], heldOut: [3] }] });
    expect([r.trainInputs, r.selector.inputs, r.cells[0]!.trainInputs, r.cells[0]!.heldOutInputs]).toEqual([8, 4, 2, 1]);
  });

  it("gives a different pick to each fold when the training seeds differ", () => {
    // In the cell `win` of these records, only seed 1 wins.
    const mixed = SEEDS.flatMap((s) => [record("bl", `t/win/s${s}`, s === 1 ? 0.9 : 0.6), record("rows", `t/win/s${s}`, 0.6)]);
    const folds = [{ train: [1], heldOut: [2] }, { train: [2], heldOut: [1] }];
    const r = cellsReportOf(mixed, { candidate: "bl", current: "rows", cells: cellMap, folds });
    // Fold 0 trains on seed 1 (a win) and picks bl on seed 2. Fold 1 trains on seed 2 and picks rows on seed 1.
    expect([r.selector.inputs, r.selector.defaultPicks, r.selector.accuracy]).toEqual([2, 1, 0]);
  });
});

describe("the command line", () => {
  const dir = mkdtempSync(join(tmpdir(), "cells-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes cells.md and cells.json, with the direction in the head", () => {
    const bench = join(dir, "bench");
    mkdirSync(bench);
    writeFileSync(join(bench, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n"));
    writeFileSync(join(bench, "corpus.json"), JSON.stringify({ inputs: [...cellMap].map(([id, cell]) => ({ id, cell })) }));
    const out = join(dir, "out");
    const r = cellsMain([bench, "--candidate", "bl", "--default", "rows", "--out", out]);
    expect(r.wins).toBe(5);
    const md = readFileSync(join(out, "cells.md"), "utf8");
    expect(md).toContain("each ratio is fill(bl) / fill(rows). Above 1, bl fills more.");
    expect(md).toBe(cellsMarkdown(r));
    expect(JSON.parse(readFileSync(join(out, "cells.json"), "utf8")).cells).toHaveLength(4);
    expect(() => cellsMain([bench])).toThrow(/Start the report/);
  });

  it("reads the split of --split from the file of the corpus hash, and refuses a missing file", () => {
    const bench = join(dir, "split-bench");
    mkdirSync(bench);
    const manifest = { corpus: "t", specs: [{ seeds: SEEDS }], inputs: [...cellMap].map(([id, cell]) => ({ id, hash: `h-${id}`, cell })) };
    writeFileSync(join(bench, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n"));
    writeFileSync(join(bench, "corpus.json"), JSON.stringify(manifest));
    const splits = join(dir, "splits");
    mkdirSync(splits);
    const folds = SEEDS.map((s) => ({ train: SEEDS.filter((t) => t !== s), heldOut: [s] }));
    const file = { schema: "corpus-split/1", corpus: "t", corpusHash: corpusHashOf(manifest), splits: { loso: { folds } } };
    writeFileSync(join(splits, `t.${corpusHashOf(manifest)}.json`), JSON.stringify(file));
    const out = join(dir, "split-out");
    const r = cellsMain([bench, "--candidate", "bl", "--default", "rows", "--out", out, "--split", "loso", "--splits", splits]);
    expect([r.heldOut, r.selector.inputs]).toEqual(["loso", 20]);
    expect(() => cellsMain([bench, "--candidate", "bl", "--default", "rows", "--out", out, "--split", "nope", "--splits", splits])).toThrow(/has no split nope/);
    expect(() => cellsMain([bench, "--candidate", "bl", "--default", "rows", "--out", out, "--split", "loso", "--held-out", "3", "--splits", splits])).toThrow(/not the two/);
    writeFileSync(join(bench, "corpus.json"), JSON.stringify({ ...manifest, inputs: manifest.inputs.slice(1) }));
    expect(() => cellsMain([bench, "--candidate", "bl", "--default", "rows", "--out", out, "--split", "loso", "--splits", splits])).toThrow(/does not exist/);
  });
});
