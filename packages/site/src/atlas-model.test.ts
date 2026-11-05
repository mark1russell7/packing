import { readFileSync } from "node:fs";
import { wilson } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { atlasFilter, atlasTable, atlasTiles, canPass, limitOf, regionsOf, ruleLine, SOLVED_RULE_SCHEMA, stateCounts, STATE_WORDS, type SearchRead, type SolvedRule } from "./atlas-model.ts";
import { parseSnapshot, type GapCell, type GapSnapshot } from "./data.ts";
import { LAST_RUN_OLD_GAP } from "./gap-definition.ts";

const TOLERANCE = 1e-9;

const rule = (searches: readonly SearchRead[] = [], cells: SolvedRule["margins"][string]["cells"] = {}): SolvedRule => ({
  schema: SOLVED_RULE_SCHEMA,
  floor: 0.9,
  margins: { "pack.gapToOpt": { limit: TOLERANCE, because: "made up", cells: {} }, "pack.gap": { limit: TOLERANCE, because: "made up", cells } },
  words: { exact: "optimal on {n} inputs", slack: "within the bound's slack on {n} inputs" },
  selector: "picker",
  searches,
  weekly: { corpus: "w", weeksLed: 0, need: 4, firstPossible: "2026-11-30" },
});

const cell = (name: string, n: number, at: number, median = 0.1, limit = TOLERANCE): GapCell => ({ cell: name, n, q1: 0, median, q3: 0.2, below0: 0, missing: 0, atMargin: { limit, n: at } });

const snap = (inputs: number, strategies: Record<string, GapCell[]>, over: Partial<GapSnapshot> = {}): GapSnapshot => ({
  schema: "packing-snapshot/1" as GapSnapshot["schema"],
  kind: "gaps",
  corpus: "c",
  origin: [{ release: "0.1.0", commit: "abc", date: "2026-10-28", run: LAST_RUN_OLD_GAP + 1, source: "made up" }],
  measure: "pack.gapToOpt",
  inputs,
  cells: [{ cell: "one", inputs }],
  strategies: Object.entries(strategies).map(([strategy, cells]) => ({ strategy, records: inputs, all: { n: inputs, q1: 0, median: 0, q3: 0, below0: 0, missing: 0 }, cells })),
  ...over,
});

const search = (strategy: string, found: SearchRead["found"] = []): SearchRead => ({ corpus: "c", cell: "one", strategy, run: 1, date: "2026-11-05", found });

describe("the rule of the solved regions", () => {
  it("reads the floor from the formula: 35 of 35 can pass, and 34 of 34 cannot", () => {
    expect(wilson(34, 34).low).toBeLessThan(0.9);
    expect(wilson(35, 35).low).toBeGreaterThanOrEqual(0.9);
    expect(canPass(34, 0.9)).toBe(false);
    expect(canPass(35, 0.9)).toBe(true);
    expect(ruleLine(rule())).toContain("The smallest count that can pass is 35.");
  });

  it("needs 1,155 of 1,260 at the margin", () => {
    expect(regionsOf(snap(1260, { a: [cell("one", 1260, 1154)] }), rule())[0]!.state).toBe("open");
    expect(regionsOf(snap(1260, { a: [cell("one", 1260, 1155)] }), rule())[0]!.state).toBe("holds");
  });

  it("reads too few inputs under the floor, with the count, and shows the figures", () => {
    const [r] = regionsOf(snap(34, { a: [cell("one", 34, 34)] }), rule());
    expect(r!.state).toBe("too-few");
    expect(r!.inputs).toBe(34);
    expect(r!.best?.at).toBe(34);
    expect(atlasTable([r!], rule(), "all")).toContain("34 inputs");
  });

  it("does not call a passing region solved until a search read of its best strategy", () => {
    const passing = snap(36, { a: [cell("one", 36, 36)] });
    expect(regionsOf(passing, rule())[0]!.state).toBe("holds");
    expect(regionsOf(passing, rule([search("other")]))[0]!.state).toBe("holds");
    expect(regionsOf(passing, rule([search("a")]))[0]!.state).toBe("solved");
  });

  it("reopens a region on a search hit, shows the input, and lets a hit beat a small count", () => {
    const hit = [{ input: "bad", value: 0.2 }];
    const [r] = regionsOf(snap(36, { a: [cell("one", 36, 36)] }), rule([search("a", hit)]));
    expect(r!.state).toBe("open");
    expect(r!.found).toEqual(hit[0]);
    expect(atlasTable([r!], rule(), "all")).toContain("<code>bad</code>");
    expect(regionsOf(snap(5, { a: [cell("one", 5, 5)] }), rule([search("a", hit)]))[0]!.state).toBe("open");
  });

  it("prints a different claim for a margin of 0 and for a measured slack", () => {
    const exact = regionsOf(snap(36, { a: [cell("one", 36, 36)] }), rule())[0]!;
    expect(exact.claim).toBe("optimal on 36 inputs");
    const slack = regionsOf(snap(36, { a: [cell("one", 36, 36, 0.1, 0.02)] }, { measure: "pack.gap" }), rule([], { "c/one": { limit: 0.02, run: 7 } }))[0]!;
    expect(slack.claim).toBe("within the bound's slack on 36 inputs");
    expect(limitOf(rule([], { "c/one": { limit: 0.02, run: 7 } }), "pack.gap", "c", "one")).toBe(0.02);
    expect(limitOf(rule(), "pack.gap", "c", "one")).toBe(TOLERANCE);
    expect(limitOf(rule(), "other", "c", "one")).toBeUndefined();
  });

  it("reads a pack.gap row of the old measure as not read, with no distance, and keeps pack.gapToOpt of the same run", () => {
    const old = [{ release: "0.1.0", commit: "abc", date: "2026-10-28", run: LAST_RUN_OLD_GAP, source: "made up" }];
    const [r] = regionsOf(snap(36, { a: [cell("one", 36, 36)] }, { measure: "pack.gap", origin: old }), rule());
    expect(r!.state).toBe("not-read");
    expect(r!.best).toBeUndefined();
    expect(atlasTable([r!], rule(), "all")).toContain("shows no distance");
    expect(regionsOf(snap(36, { a: [cell("one", 36, 36)] }, { origin: old }), rule())[0]!.state).toBe("holds");
    expect(regionsOf(snap(36, { a: [cell("one", 36, 36)] }, { measure: "pack.gap" }), rule())[0]!.state).toBe("holds");
  });

  it("does not read a file with no count, or with another margin than the rule", () => {
    const { atMargin: _gone, ...bare } = cell("one", 36, 36);
    const noMargin = regionsOf(snap(36, { a: [bare] }), rule());
    expect(noMargin[0]!.state).toBe("not-read");
    expect(atlasTiles(noMargin, rule())).toContain("an old run of pack.gap, or no read at the margin");
    expect(regionsOf(snap(36, { a: [cell("one", 36, 36, 0.1, 0.5)] }), rule())[0]!.state).toBe("not-read");
    expect(regionsOf(snap(36, { a: [cell("one", 36, 36)] }, { measure: "pack.other" as GapSnapshot["measure"] }), rule())[0]!.state).toBe("not-read");
  });

  it("gives a strategy no gain from an input that it refused", () => {
    const refused: GapCell = { ...cell("one", 4, 4), missing: 32 };
    const [r] = regionsOf(snap(36, { a: [refused] }), rule());
    expect(r!.best?.share).toBeCloseTo(4 / 36);
    expect(r!.state).toBe("open");
  });

  it("picks the most inputs at the margin, then the lowest median, and shows the selector beside it", () => {
    const [r] = regionsOf(snap(36, { z: [cell("one", 36, 3, 0.1)], y: [cell("one", 36, 3, 0.05)], picker: [cell("one", 36, 1, 0.3)] }), rule());
    expect(r!.best?.strategy).toBe("y");
    expect(r!.selector?.at).toBe(1);
    const html = atlasTable([r!], rule(), "all");
    expect(html).toContain("picked after the fact");
    expect(html).toContain("1 of 36");
  });

  it("reads open with no figure when no strategy has a value", () => {
    const [r] = regionsOf(snap(36, { a: [cell("one", 0, 0)] }), rule());
    expect(r!.state).toBe("open");
    expect(atlasTable([r!], rule(), "all")).toContain("No strategy has a value.");
  });

  it("states the corpus, the count and the budget on each row", () => {
    const budget = { smallPairMs: 15000, smallItems: 30, pairMs: 30000, slowPackMs: 1000, overruns: 2, control: { entry: "skyline", packs: 20, source: "pack" as const } };
    const none = atlasTable(regionsOf(snap(36, { a: [cell("one", 36, 1)] }), rule()), rule(), "all");
    expect(none).toContain("on <code>c</code>, 36 inputs, no wall budget");
    const some = atlasTable(regionsOf(snap(36, { a: [cell("one", 36, 1)] }, { budget }), rule()), rule(), "all");
    expect(some).toContain("a wall budget of 15 s to 30 s a pair");
  });

  it("filters by state, with the count on each button", () => {
    const regions = regionsOf(snap(36, { a: [cell("one", 36, 1)] }), rule());
    expect(stateCounts(regions)).toEqual({ solved: 0, holds: 0, open: 1, "too-few": 0, "not-read": 0 });
    expect(atlasFilter(regions, "open")).toContain(`data-state="open" aria-checked="true">open 1`);
    expect(atlasTable(regions, rule(), "solved")).toContain("No region is in this state.");
    expect(atlasTiles(regions, rule())).toContain("0 of 1");
    expect(atlasTiles(regions, rule())).toContain("0 of 4");
  });
});

describe("the committed files of the atlas", () => {
  const read = (name: string): string => readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8");
  const committed = JSON.parse(read("solved-rule.json")) as SolvedRule;
  const known = parseSnapshot(read("gaps-pack-known-v1.json"), "gaps");
  const select = parseSnapshot(read("gaps-pack-select-v2.json"), "gaps");

  it("has the schema, the floor and the words of the rule", () => {
    expect(committed.schema).toBe(SOLVED_RULE_SCHEMA);
    expect(committed.floor).toBe(0.9);
    expect(committed.words).toEqual(rule().words);
  });

  it("reads 8 open regions and 12 not read on the data of 2026-10-28", () => {
    const regions = [...regionsOf(known, committed), ...regionsOf(select, committed)];
    expect(regions.map((r) => r.date).every((date) => date === "2026-10-28")).toBe(true);
    expect(stateCounts(regions)).toEqual({ solved: 0, holds: 0, open: 8, "too-few": 0, "not-read": 12 });
  });

  it("names the selector in the corpus with a known best value", () => {
    expect(regionsOf(known, committed).every((r) => r.selector?.strategy === committed.selector)).toBe(true);
  });

  it("tells the rule in one wording on the page and in docs/BENCH.md", () => {
    const page = readFileSync(new URL("../content/results-atlas.md", import.meta.url), "utf8");
    const docs = readFileSync(new URL("../../../docs/BENCH.md", import.meta.url), "utf8");
    const lines = page.split("\n").filter((line) => line.startsWith("- "));
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(docs).toContain(line);
    for (const word of Object.values(STATE_WORDS)) expect(page).toContain(`\`${word}\``);
  });
});
