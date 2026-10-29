import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packWith, rectGrid, toPackInput } from "@mark1russell7/packing";
import { isMeasured, mergeRuns, parseCorpus, runBench, summaryMarkdown, type BenchEnv } from "./run.ts";
import { ASPECT_FIT_ENTRIES, BBOX_ENTRIES, entry, isComposite, MAXRECTS_VARIANTS, PORTFOLIO_ENTRIES, RESTARTS_ENTRIES, RUIN_RECREATE_ENTRIES, SELECT_ENTRIES, SHELF_VARIANTS, SKYLINE_VARIANTS } from "./entries.ts";
import { BASE_OF, MOVE_OF, moveCounts, OUTSIDE_EXACT, rankingOf, screenMarkdown, screenOf, shapesOf, type ScreenRecord } from "./screen.ts";

// The screen guards of k59 on hand-made records, and on a run of the tiny corpus smoke-v1. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const smoke = parseCorpus(readFileSync(join(import.meta.dirname, "corpora", "smoke-v1.json"), "utf8"), "smoke-v1");
const full = runBench({ corpus: smoke, prediction: "p-test", repeats: 1, warmup: 0, env: ENV });

const rec = (strategy: string, input: string, hash: string, measures: Record<string, number> = {}): ScreenRecord => ({ strategy, input, outputHash: hash, measures });
const SHAPES = new Map([
  ["i1", "rect"],
  ["i2", "rect"],
  ["i3", "circle"],
]);

describe("the screen of a run", () => {
  it("ranks the fill only over the records with no overflow, and keeps the median of all the records", () => {
    const records = [
      rec("rows", "i1", "a", { "pack.fill": 0.9, "pack.overflow": 2 }),
      rec("rows", "i2", "b", { "pack.fill": 0.5, "pack.overflow": 0 }),
      rec("rows", "i3", "c", { "pack.fill": 0.7, "pack.overflow": 0 }),
    ];
    const { fill } = screenOf(["rows"], records, SHAPES);
    expect(fill["rows"]!.all).toEqual({ records: 3, median: 0.7 });
    expect(fill["rows"]!.clean).toEqual({ records: 2, median: 0.6 });
    expect(fill["rows"]!.shapes["rect"]).toEqual({ all: { records: 2, median: 0.7 }, clean: { records: 1, median: 0.5 } });
    expect(fill["rows"]!.shapes["circle"]!.clean).toEqual({ records: 1, median: 0.7 });
  });

  it("gives the overflow means, the share with overflow and the sum of pack.outsideExact", () => {
    const records = [
      rec("shelf", "i1", "a", { "pack.overflow": 2, "pack.overflow.forced": 1, "pack.overflow.excess": 1, [OUTSIDE_EXACT]: 1 }),
      rec("shelf", "i2", "b", { "pack.overflow": 0, "pack.overflow.forced": 0, "pack.overflow.excess": 0, [OUTSIDE_EXACT]: 0 }),
    ];
    const o = screenOf(["shelf"], records, SHAPES).overflow["shelf"]!;
    expect([o.records, o.overflowing, o.share, o.outsideExact]).toEqual([2, 1, 0.5, 1]);
    expect(o.means).toEqual({ "pack.overflow": 1, "pack.overflow.forced": 0.5, "pack.overflow.excess": 0.5 });
    expect(Object.keys(o.shapes)).toEqual(["rect"]);
  });

  it("gives the mean and the median of the overflow measures by area", () => {
    const area = (excessArea: number, forcedArea: number): Record<string, number> => ({ "pack.overflow.excessArea": excessArea, "pack.overflow.forcedArea": forcedArea });
    const records = [rec("rows", "i1", "a", area(0, 0.1)), rec("rows", "i2", "b", area(0.1, 0.2)), rec("rows", "i3", "c", area(0.5, 0.6))];
    const o = screenOf(["rows"], records, SHAPES).overflow["rows"]!;
    expect(o.means).toEqual({ "pack.overflow.excessArea": 0.2, "pack.overflow.forcedArea": 0.3 });
    expect(o.medians).toEqual({ "pack.overflow.excessArea": 0.1, "pack.overflow.forcedArea": 0.2 });
    expect(o.shapes["rect"]!.medians).toEqual({ "pack.overflow.excessArea": 0.05, "pack.overflow.forcedArea": 0.15 });
  });

  it("groups the strategies that are equal on each input, and on each input of one container shape", () => {
    const records = [
      rec("rows", "i1", "a"),
      rec("rows", "i2", "b"),
      rec("rows", "i3", "c"),
      rec("shelf", "i1", "a"),
      rec("shelf", "i2", "b"),
      rec("shelf", "i3", "x"),
      rec("skyline", "i1", "a"),
      rec("skyline", "i2", "y"),
      rec("skyline", "i3", "c"),
    ];
    const screen = screenOf(["rows", "shelf", "skyline"], records, SHAPES);
    expect(screen.outputGroups).toEqual([]);
    expect(screen.cellGroups["rect"]!.groups).toEqual([{ strategies: ["rows", "shelf"], inputs: 2 }]);
    expect(screen.cellGroups["circle"]!.groups).toEqual([{ strategies: ["rows", "skyline"], inputs: 1 }]);
    expect(screen.cellGroups["rect"]!.pairs).toContainEqual({ a: "rows", b: "skyline", inputs: 2, equal: 1, share: 0.5 });
    const same = screenOf(["rows", "shelf"], records.filter((r) => r.input !== "i3"), SHAPES);
    expect(same.outputGroups).toEqual([{ strategies: ["rows", "shelf"], inputs: 2 }]);
  });

  it("does not compare a skipped record, and does not group two strategies with no common input", () => {
    const records = [rec("rows", "i1", "a"), { ...rec("push", "i1", "a"), skipped: "unsupported mode: offline" }];
    const screen = screenOf(["rows", "push"], records, SHAPES);
    expect(screen.outputGroups).toEqual([]);
    expect(screen.cellGroups["rect"]!.pairs).toEqual([]);
  });

  it("labels a strategy exercised when its move has a count above 0 on 1 input, and else gives a reason", () => {
    const records = [rec("rows", "i1", "a", { "move.gapFill": 0 }), rec("rows", "i3", "b", { "move.gapFill": 3 }), rec("shelf", "i1", "a", { "move.stack": 0 })];
    const { activation } = screenOf(["rows", "shelf", "push", "other"], records, SHAPES);
    expect(activation["rows"]).toMatchObject({ move: "move.gapFill", records: 2, fired: 1, count: 3, label: "exercised" });
    expect(activation["rows"]!.shapes["rect"]).toMatchObject({ label: "not-exercised", reason: "The count of move.gapFill is 0 on each of the 1 measured inputs." });
    expect(activation["shelf"]!.label).toBe("not-exercised");
    expect(activation["push"]).toMatchObject({ label: "not-exercised", reason: "No record is measured.", shapes: {} });
    expect(activation["other"]).toMatchObject({ move: "-", reason: "The strategy has no characteristic move." });
    const skip = { ...rec("push", "i3", "a"), skipped: "unsupported containerShape: circle" };
    const skipped = screenOf(["push"], [skip], SHAPES).activation["push"]!;
    expect(skipped.reason).toBe("No record is measured. The strategy skips each of the 1 inputs: unsupported containerShape: circle.");
    expect(Object.keys(skipped.shapes)).toEqual(["circle"]);
  });

  it("labels a variant exercised when its output differs from the output of its base, also with no move", () => {
    const records = [
      rec("shelf", "i1", "a"),
      rec("shelf", "i3", "b"),
      rec("shelf-first", "i1", "a", { "move.firstFit": 0 }),
      rec("shelf-first", "i3", "c", { "move.firstFit": 0 }),
      rec("shelf-best", "i1", "a", { "move.bestFit": 0 }),
    ];
    const { activation } = screenOf(["shelf", "shelf-first", "shelf-best"], records, SHAPES);
    expect(activation["shelf-first"]).toMatchObject({ move: "move.firstFit", fired: 0, base: "shelf", differs: 1, label: "exercised" });
    expect(activation["shelf-first"]!.shapes["rect"]).toMatchObject({ differs: 0, label: "not-exercised" });
    expect(activation["shelf-first"]!.shapes["rect"]!.reason).toBe("The count of move.firstFit is 0 on each of the 1 measured inputs. The output is the output of shelf on each common input.");
    expect(activation["shelf-best"]).toMatchObject({ base: "shelf", differs: 0, label: "not-exercised" });
    expect(activation["shelf"]).not.toHaveProperty("base");
    // A job of a matrix without the base gives no comparison
    const alone = screenOf(["shelf-first"], records.filter((r) => r.strategy === "shelf-first"), SHAPES).activation["shelf-first"]!;
    expect(alone).not.toHaveProperty("differs");
    expect(alone.label).toBe("not-exercised");
    const md = screenMarkdown(screenOf(["shelf", "shelf-first"], records, SHAPES), ["shelf", "shelf-first"]).join("\n");
    expect(md).toContain("| shelf-first | `move.firstFit` | all | 2 | 0 | 0 | 1 (shelf) | exercised |");
    expect(md).toContain("| shelf | `move.stack` | all | 2 | 0 | 0 | - | not-exercised |");
  });

  it("reads the container shapes of a manifest, and gives an empty map for a value that is not a manifest", () => {
    expect(shapesOf({ inputs: [{ id: "a", cell: { containerShape: "ring" } }, { id: 2 }] })).toEqual(new Map([["a", "ring"]]));
    expect(shapesOf(undefined).size).toBe(0);
    expect(screenOf(["rows"], [rec("rows", "zz", "a")], new Map()).overflow["rows"]!.shapes["unknown"]!.records).toBe(1);
  });

  it("writes one line for each section of a run.json before k59", () => {
    const md = screenMarkdown({}, ["rows"]).join("\n");
    for (const section of ["Ranking", "Fill without overflow", "Overflow", "Distinct outputs", "Activation"]) expect(md).toContain(`## ${section}`);
    expect(md.match(/A `run.json` before k59/g)).toHaveLength(4);
    expect(md.match(/A `run.json` before k60/g)).toHaveLength(1);
  });
});

describe("the ranking of a cell", () => {
  const m = (overflow: number, fill: number, excessArea = 0): Record<string, number> => ({ "pack.overflow": overflow, "pack.fill": fill, "pack.overflow.excessArea": excessArea });

  it("ranks the fill only on the inputs where each measured strategy has no overflow", () => {
    const records = [
      rec("a", "i1", "a1", m(0, 0.8)),
      rec("a", "i2", "a2", m(0, 0.6)),
      rec("a", "i3", "a3", m(1, 0.9)),
      rec("a", "i4", "a4", m(0, 0.7)),
      rec("b", "i1", "b1", m(0, 0.7)),
      rec("b", "i2", "b2", m(2, 0.9)),
      rec("b", "i3", "b3", m(0, 0.5)),
      rec("b", "i4", "b4", m(0, 0.6)),
      // A strategy that skips each input is not ranked, and it does not make the common clean subset smaller
      ...["i1", "i2", "i3", "i4"].map((i) => ({ ...rec("c", i, "-"), skipped: "unsupported mode: offline" })),
    ];
    const r = rankingOf(["a", "b", "c"], records);
    expect(r.inputs).toBe(4);
    expect(r.commonClean).toEqual({ inputs: 2, share: 0.5 });
    expect(r.thin).toBe(false);
    expect(r.entries.map((e) => e.name)).toEqual(["a", "b"]);
    // The common clean inputs are i1 and i4. The diagnostic uses the own clean records of each strategy.
    expect(r.entries[0]).toMatchObject({ rank: 1, records: 4, excessArea: 0, tieGroup: 1, fill: 0.75, diagnosticCleanFill: 0.7 });
    expect(r.entries[1]).toMatchObject({ rank: 2, records: 4, excessArea: 0, tieGroup: 1, fill: 0.65, diagnosticCleanFill: 0.6 });
  });

  it("marks a cell thin when the common clean inputs are less than 0.3 of its inputs", () => {
    const records = [
      rec("a", "i1", "a1", m(0, 0.8)),
      rec("a", "i2", "a2", m(1, 0.6)),
      rec("a", "i3", "a3", m(1, 0.9)),
      rec("a", "i4", "a4", m(0, 0.7)),
      rec("b", "i1", "b1", m(0, 0.7)),
      rec("b", "i2", "b2", m(0, 0.9)),
      rec("b", "i3", "b3", m(0, 0.5)),
      rec("b", "i4", "b4", m(1, 0.6)),
    ];
    const r = rankingOf(["a", "b"], records);
    expect(r.commonClean).toEqual({ inputs: 1, share: 0.25 });
    expect(r.thin).toBe(true);
    expect(rankingOf(["a", "b"], records.filter((x) => x.input !== "i4")).thin).toBe(false);
    expect(rankingOf(["a"], []).thin).toBe(true);
  });

  it("ties the entries within the minimum effect of the best excess area, and ranks the fill only in a tie group", () => {
    const records = [
      rec("a", "i1", "a1", m(0, 0.6, 0.01)),
      rec("b", "i1", "b1", m(0, 0.7, 0.014)),
      rec("c", "i1", "c1", m(0, 0.9, 0.016)),
      rec("d", "i1", "d1", m(0, 0.95, 0.5)),
    ];
    const r = rankingOf(["a", "b", "c", "d"], records);
    // b is within 0.005 of a, thus its higher fill ranks it first. c is 0.006 above a, thus c starts tie group 2.
    expect(r.entries.map((e) => [e.name, e.tieGroup, e.rank])).toEqual([
      ["b", 1, 1],
      ["a", 1, 2],
      ["c", 2, 3],
      ["d", 3, 4],
    ]);
    expect(r.entries.map((e) => e.fillTie)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("gives a fill tie group to the neighbours of a tie group within the minimum effect of the fill", () => {
    const records = [
      rec("a", "i1", "a1", m(0, 0.8)),
      rec("b", "i1", "b1", m(0, 0.797)),
      rec("c", "i1", "c1", m(0, 0.793)),
      rec("d", "i1", "d1", m(0, 0.7)),
      rec("e", "i1", "e1", m(0, 0.698, 0.1)),
    ];
    const r = rankingOf(["a", "b", "c", "d", "e"], records);
    // a, b and c make a chain: each is within 0.005 of the next. d is 0.093 below c. e is in another tie group of step 1.
    expect(r.entries.map((e) => [e.name, e.tieGroup, e.fillTie])).toEqual([
      ["a", 1, 1],
      ["b", 1, 1],
      ["c", 1, 1],
      ["d", 1, undefined],
      ["e", 2, undefined],
    ]);
    const md = screenMarkdown({ ranking: { rect: r } }, ["a", "b", "c", "d", "e"]).join("\n");
    expect(md).toContain("| rect | 1/1 | 1 | no | 2 | b | 0 | 1 | 0.797 | tie 1 | 1 | 0.797 |");
    expect(md).toContain("| rect | 1/1 | 1 | no | 4 | d | 0 | 1 | 0.7 | - | 1 | 0.7 |");
  });

  it("makes one entry of the members of a cell group, named by the group", () => {
    const records = [
      rec("rows", "i1", "a", m(0, 0.8)),
      rec("rows", "i2", "b", m(0, 0.7)),
      rec("shelf", "i1", "a", m(0, 0.8)),
      rec("shelf", "i2", "b", m(0, 0.7)),
      rec("skyline", "i1", "x", m(0, 0.9, 0.1)),
      rec("skyline", "i2", "y", m(0, 0.6, 0.1)),
      rec("skyline", "i3", "z", m(0, 0.6, 0.1)),
    ];
    const screen = screenOf(["rows", "shelf", "skyline"], records, SHAPES);
    const rect = screen.ranking["rect"]!;
    expect(rect.entries.map((e) => ({ name: e.name, strategies: e.strategies, tieGroup: e.tieGroup }))).toEqual([
      { name: "rows = shelf", strategies: ["rows", "shelf"], tieGroup: 1 },
      { name: "skyline", strategies: ["skyline"], tieGroup: 2 },
    ]);
    // The circle has only skyline: one entry
    expect(screen.ranking["circle"]!.entries.map((e) => e.name)).toEqual(["skyline"]);
    const md = screenMarkdown(screen, ["rows", "shelf", "skyline"]).join("\n");
    expect(md).toContain("| rect | 2/2 | 1 | no | 1 | rows = shelf | 0 | 1 | 0.75 | - | 2 | 0.75 |");
  });
});

describe("the screen on smoke-v1", () => {
  it("gives each entry its move in its trace, and each variant also the moves of the fits", () => {
    const input = toPackInput(rectGrid.generate(2, { count: 30 }));
    // The strategy aspect-fit gives its stage only for a container of free size
    const free = toPackInput(rectGrid.generate(2, { count: 30, containerSize: "freeAspect" }));
    for (const [id, move] of Object.entries(MOVE_OF)) {
      const e = entry(id);
      const on = e.strategy === "aspect-fit" ? free : input;
      const counts = moveCounts(packWith(e.strategy, on, Object.keys(e.options).length === 0 ? undefined : e.options));
      expect(Object.keys(counts), id).toContain(move);
      // A composite entry also gives the moves of the member that wins, so only its own move is fixed.
      if (isComposite(id)) continue;
      const skyline = e.options["rule"] === "mw" ? ["move.minWaste"] : ["move.lowerWindow"];
      const guillotine = e.options["merge"] === true ? ["move.freeChoice", "move.merge"] : ["move.freeChoice"];
      const own = e.strategy === "guillotine" ? guillotine : e.strategy === "maxrects" ? (move === "move.split" ? [move] : [move, "move.split"]) : e.strategy === "skyline" && e.base !== undefined ? [...skyline, "move.wasteFill"].filter((m) => m !== "move.wasteFill" || e.options["wasteMap"] === true) : e.base === undefined ? [move] : ["move.stack", "move.firstFit", "move.bestFit"];
      expect(Object.keys(counts), id).toEqual(own);
    }
    expect(BASE_OF).toEqual({ ...Object.fromEntries(SHELF_VARIANTS.map((v) => [v.id, "shelf"])), ...Object.fromEntries(MAXRECTS_VARIANTS.filter((v) => v.id !== "maxrects-bl").map((v) => [v.id, "maxrects-bl"])), ...Object.fromEntries(PORTFOLIO_ENTRIES.map((e) => [e.id, "maxrects-bl"])),
      ...Object.fromEntries(ASPECT_FIT_ENTRIES.map((e) => [e.id, e.base])),
      ...Object.fromEntries(SELECT_ENTRIES.map((e) => [e.id, e.base])),
      ...Object.fromEntries(RESTARTS_ENTRIES.map((e) => [e.id, e.base])),
      ...Object.fromEntries(BBOX_ENTRIES.map((e) => [e.id, e.base])),
      ...Object.fromEntries(RUIN_RECREATE_ENTRIES.map((e) => [e.id, e.base])),
      ...Object.fromEntries(SKYLINE_VARIANTS.map((e) => [e.id, e.base])),
    });
  });

  it("gives each measured record its move count and 0 boxes out of the true outline", () => {
    for (const r of full.records.filter(isMeasured)) {
      // On a container of fixed size, aspect-fit gives the output of the wrapped strategy, with no stage of its own
      // On a rect input, bbox gives the output of its member. It has no move of its own, so MOVE_OF has no bbox entry.
      if (entry(r.strategy).strategy === "bbox") expect(MOVE_OF[r.strategy]).toBeUndefined();
      const passed = (entry(r.strategy).strategy === "aspect-fit" && r.measures[MOVE_OF[r.strategy]!] === undefined) || entry(r.strategy).strategy === "bbox";
      if (!passed) expect(r.measures[MOVE_OF[r.strategy]!], `${r.strategy} ${r.input}`).toBeTypeOf("number");
      expect(r.measures[OUTSIDE_EXACT], `${r.strategy} ${r.input}`).toBe(0);
      expect(r.measures["pack.overflow.forced"]!).toBeLessThanOrEqual(r.measures["pack.overflow"]!);
    }
  });

  it("gives the same screen for one run and for the merge of the runs of the jobs of a matrix", () => {
    // The jobs keep the order of the strategies of the full run, and the merge keeps the order of its jobs
    const order = full.run.strategies;
    const jobs = [order.slice(0, 2), order.slice(2, 3), order.slice(3)].map((s) => runBench({ corpus: smoke, prediction: "p-test", strategies: s, repeats: 1, warmup: 0, env: ENV }));
    const records = jobs.flatMap((j) => j.records);
    const merged = mergeRuns(
      jobs.map((j) => j.run),
      records,
      full.manifest,
    );
    for (const field of ["fill", "overflow", "outputGroups", "cellGroups", "activation", "ranking"] as const) expect(merged[field], field).toEqual(full.run[field]);
    // A merge without the records has no screen, because each job sees only its strategies
    expect(mergeRuns(jobs.map((j) => j.run)).outputGroups).toBeUndefined();
    const md = summaryMarkdown(merged, records);
    for (const section of ["Ranking", "Fill without overflow", "Overflow", "Distinct outputs", "Activation"]) expect(md).toContain(`## ${section}`);
  });

  it("ranks each container shape of smoke-v1, with no unmeasured strategy, and keeps forcedArea at or below the overflow area", () => {
    const ranking = full.run.ranking!;
    expect(Object.keys(ranking).length).toBeGreaterThan(0);
    for (const [shape, c] of Object.entries(ranking)) {
      const names = c.entries.flatMap((e) => e.strategies);
      expect(names, shape).not.toContain("push");
      expect(new Set(names).size, shape).toBe(names.length);
      expect(c.entries.map((e) => e.rank), shape).toEqual(c.entries.map((_, i) => i + 1));
      expect(c.commonClean.inputs, shape).toBeLessThanOrEqual(c.inputs);
      expect(c.thin, shape).toBe(c.commonClean.inputs / c.inputs < 0.3);
    }
    for (const r of full.records.filter(isMeasured)) {
      expect(r.measures["pack.overflow.forcedArea"]!, `${r.strategy} ${r.input}`).toBeLessThanOrEqual(r.measures["pack.overflow.area"]! + 1e-9);
      expect(r.measures["pack.overflow.excessArea"]!, `${r.strategy} ${r.input}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("labels rows, shelf and skyline exercised on smoke-v1, and push not-exercised, because push skips each input", () => {
    for (const id of ["rows", "shelf", "skyline"]) expect(full.run.activation![id]!.label, id).toBe("exercised");
    const push = full.run.activation!["push"]!;
    expect(push.label).toBe("not-exercised");
    expect(push.reason).toMatch(/^No record is measured\. The strategy skips each of the 13 inputs: /);
    // Rows and shelf share the packer of a container that is not a rectangle, thus their moves do not occur there
    expect(full.run.activation!["rows"]!.shapes["circle"]!.label).toBe("not-exercised");
    expect(full.run.activation!["shelf"]!.shapes["circle"]!.label).toBe("not-exercised");
    // A variant equal to rows and shelf on the one circle input of smoke-v1 joins their group. Such a group is valid.
    expect(full.run.cellGroups!["circle"]!.groups[0]!.strategies.slice(0, 2)).toEqual(["rows", "shelf"]);
  });

  it("measures each variant of the shelf family on each input of smoke-v1, and labels it with its move or its base", () => {
    for (const v of SHELF_VARIANTS) {
      const a = full.run.activation![v.id]!;
      expect(a.base, v.id).toBe("shelf");
      expect(a.records, v.id).toBe(full.manifest.inputs.length);
      expect(a.label, v.id).toBe("exercised");
    }
  });
});
