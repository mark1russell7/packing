import { unsupportedOf, type Dimension, type Supports } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { ENTRIES } from "./entries.ts";
import { benchStrategy } from "./controls.ts";
import { skipReason } from "./run.ts";
import { LEFT_OUT_WORDS, SKIP_ROWS, cellOfReason, leftOutWord, skipRead, staleRows, type SkipRow } from "./skip-words.ts";

/** This function gives the cells that an entry supports. */
const supportsOf = (id: string): Supports => {
  const entry = ENTRIES.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`The table names ${id}, which is not an entry.`);
  return benchStrategy(entry.strategy).supports;
};

/** The cells of `pack-free-v1`: the two free forms, each container shape, and an order with and with no rank. */
const FREE_CELLS: readonly Partial<Record<Dimension, string>>[] = ["freeArea", "freeAspect"].flatMap((containerSize) =>
  ["rect", "convex", "polygon", "circle", "ellipse", "holes"].flatMap((containerShape) =>
    ["free", "soft"].map((order) => ({ containerSize, containerShape, order, mode: "offline", itemShape: "rect", rotation: "none", groups: "none" })),
  ),
);

/** This function gives the pairs of entry and reason that the cells of `pack-free-v1` skip, each once. */
const freePairs = (): { entry: string; reason: string }[] => {
  const pairs = new Map<string, { entry: string; reason: string }>();
  for (const { id } of ENTRIES) {
    for (const cell of FREE_CELLS) {
      const miss = unsupportedOf(supportsOf(id), cell);
      if (miss === undefined) continue;
      const reason = skipReason(miss.dimension, miss.value);
      pairs.set(`${id}|${reason}`, { entry: id, reason });
    }
  }
  return [...pairs.values()];
};

describe("the word of a skip", () => {
  it("gives a pair outside the table no default word", () => {
    expect(skipRead("no such entry", "unsupported containerSize: freeArea")).toEqual({ word: "not read" });
    expect(skipRead("beam", "unsupported containerShape: circle")).toEqual({ word: "not read" });
    expect(skipRead("beam", "refused: over item limit 16")).toEqual({ word: "not read" });
  });

  it("gives each word with its reason", () => {
    expect(skipRead("beam", "unsupported containerSize: freeArea").word).toBe("composition");
    expect(skipRead("push", "unsupported containerSize: freeAspect").word).toBe("no meaning");
    expect(skipRead("treemap-strip", "unsupported containerShape: circle").word).toBe("other algorithm");
    for (const row of SKIP_ROWS) expect(skipRead(row.entries[0]!, row.reasons[0]!).why).toBe(row.why);
  });

  it("has no pair in two rows, because the first row would hide the second", () => {
    const pairs = SKIP_ROWS.flatMap((row) => row.entries.flatMap((entry) => row.reasons.map((reason) => `${entry}|${reason}`)));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("names only the entries that refuse the cell of their row", () => {
    expect(staleRows(SKIP_ROWS, supportsOf)).toEqual([]);
  });

  it("finds a row whose strategy takes its cell", () => {
    const stale: SkipRow = { entries: ["rows"], reasons: ["unsupported containerSize: freeArea"], word: "not done", why: "made up" };
    expect(staleRows([stale], supportsOf)).toEqual(["rows: the strategy takes containerSize freeArea"]);
    const noCell: SkipRow = { entries: ["beam"], reasons: ["over budget"], word: "not done", why: "made up" };
    expect(staleRows([noCell], supportsOf)).toEqual(['beam: the reason "over budget" names no cell']);
  });

  // Roadmap item k197: a record with one of these words leaves the measured share of its entry. The list of the pairs is pinned.
  // A new pair needs a test that the entry has no defined result on an input of that form, and the page shows its word with its count.
  it("leaves out only the pinned pairs, and each one is a cell that the entry refuses", () => {
    const pairs = SKIP_ROWS.filter((row) => (LEFT_OUT_WORDS as readonly string[]).includes(row.word)).flatMap((row) =>
      row.entries.flatMap((entry) => row.reasons.map((reason) => `${row.word}|${entry}|${reason}`)),
    );
    const shapes = ["circle", "convex", "ellipse", "holes", "polygon"].map((shape) => `unsupported containerShape: ${shape}`);
    // Roadmap item k29 adds treemap-spiral, a treemap that has no defined result in a container that is not a rectangle.
    const pinned = [
      ...["unsupported containerSize: freeArea", "unsupported containerSize: freeAspect"].map((reason) => `no meaning|push|${reason}`),
      ...["treemap-pivot-split", "treemap-slice-dice", "treemap-spiral", "treemap-squarified", "treemap-strip", "columns-linear-partition"].flatMap((entry) =>
        shapes.map((reason) => `other algorithm|${entry}|${reason}`),
      ),
    ];
    expect([...pairs].sort()).toEqual([...pinned].sort());
    for (const pair of pairs) {
      const [word, entry, reason] = pair.split("|") as [string, string, string];
      expect(leftOutWord(entry, reason), pair).toBe(word);
      const cell = cellOfReason(reason)!;
      expect(unsupportedOf(supportsOf(entry), { [cell.dimension]: cell.value }), pair).toBeDefined();
    }
    expect(leftOutWord("beam", "unsupported containerSize: freeArea")).toBeUndefined();
    expect(leftOutWord("beam", "unsupported containerShape: circle")).toBeUndefined();
  });

  it("reads the cell of a reason", () => {
    expect(cellOfReason("unsupported order: soft")).toEqual({ dimension: "order", value: "soft" });
    expect(cellOfReason("over budget")).toBeUndefined();
  });

  it("reads each skip of the cells of the free corpus", () => {
    const pairs = freePairs();
    expect(pairs.filter((p) => skipRead(p.entry, p.reason).word === "not read")).toEqual([]);
    const count = (word: string): number => pairs.filter((p) => skipRead(p.entry, p.reason).word === word).length;
    const counts = { pairs: pairs.length, done: count("not done"), composition: count("composition"), other: count("other algorithm"), meaning: count("no meaning") };
    // Roadmap item k29 adds the entry treemap-spiral. It has 5 skips, each with the word "other algorithm", so 99 pairs become 104.
    // Roadmap item k213 adds the entry compact-maxrects-bl. It has 5 skips of the shapes, each with the word "not done", so 104 pairs become 109.
    expect(counts).toEqual({ pairs: 109, done: 43, composition: 34, other: 30, meaning: 2 });
  });
});
