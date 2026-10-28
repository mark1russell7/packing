import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bestIds,
  boardInput,
  COMPARE_ENTRIES,
  COMPARE_GENERATORS,
  drawingSvg,
  generatorKey,
  generatorOf,
  MAX_COMPARE_COUNT,
  presetInput,
  runAll,
  runEntry,
  sortResults,
  valueText,
  type EntryResult,
} from "./compare-model.ts";
import { parseSnapshot } from "./data.ts";
import { parseVerdictHash, verdictHash, verdictSnapshot } from "./results-model.ts";

const snapshot = (name: string) => parseSnapshot(readFileSync(new URL(`../data/strategies-${name}.json`, import.meta.url), "utf8"), "strategies");

describe("the input of the compare page", () => {
  it("makes a board of each generator with its defaults", () => {
    for (const g of COMPARE_GENERATORS) {
      const b = boardInput(generatorKey(g), {}, 1);
      expect(b.id).toMatch(/\/s1$/);
      expect(b.input.items.length).toBeLessThanOrEqual(MAX_COMPARE_COUNT);
    }
  });

  it("stops the count of a board at the largest count", () => {
    const b = boardInput("rect-scattered@1", { count: 50_000 }, 2);
    expect(b.input.items.length).toBe(MAX_COMPARE_COUNT);
  });

  it("gives rect-grid version 2 for an unknown key", () => {
    expect(generatorKey(generatorOf("nothing@9"))).toBe("rect-grid@2");
  });

  it("makes the items of a demo preset in a fixed width", () => {
    const p = presetInput("cards", 12, 500, 3);
    expect(p.input.items).toHaveLength(12);
    expect(p.input.container).toEqual({ fixed: "width", w: 500 });
  });
});

describe("the runs of the compare page", () => {
  const input = presetInput("mixed", 20, 640, 4).input;

  it("packs the input with each entry, and gives the measures", () => {
    const results = runAll(input);
    expect(results.map((r) => r.entry.id)).toEqual(COMPARE_ENTRIES.map((e) => e.id));
    for (const r of results) {
      expect(r.error, r.entry.id).toBeUndefined();
      expect(r.measures?.["pack.fill"], r.entry.id).toBeGreaterThan(0);
      expect(drawingSvg(input, r.output!, "x")).toContain("<svg");
    }
  });

  it("gives an entry that does not support the input as unsupported, with no throw", () => {
    const free = { ...input, container: { fixed: "none" as const } };
    const push = runEntry(COMPARE_ENTRIES.find((e) => e.id === "push")!, free);
    expect(push.unsupported).toBe(true);
    expect(push.output).toBeUndefined();
  });

  it("sorts best first by the direction of the measure, with the unsupported entries last", () => {
    const r = (id: string, index: number, fill: number | undefined, inversions = 0): EntryResult => ({
      entry: { ...COMPARE_ENTRIES[index]!, id },
      index,
      ms: index,
      ...(fill === undefined
        ? { unsupported: true, error: "x" }
        : { output: { placements: [], overflow: [], size: { w: 1, h: 1 }, moved: [] }, measures: { "pack.fill": fill, "pack.order.inversions": inversions } }),
    });
    const list = [r("a", 0, 0.5, 0.3), r("b", 1, undefined), r("c", 2, 0.9, 0.1), r("d", 3, 0.9, 0.2)];
    expect(sortResults(list, "pack.fill").map((x) => x.entry.id)).toEqual(["c", "d", "a", "b"]);
    expect(sortResults(list, "pack.order.inversions").map((x) => x.entry.id)).toEqual(["c", "d", "a", "b"]);
    expect(sortResults(list, "entry").map((x) => x.entry.id)).toEqual(["a", "c", "d", "b"]);
    expect([...bestIds(list, "pack.fill")]).toEqual(["c", "d"]);
    expect([...bestIds(list, "pack.order.inversions")]).toEqual(["c"]);
  });

  it("gives the text of a share, of a count and of another value", () => {
    expect(valueText({ id: "pack.fill", share: true }, 0.8123)).toBe("81.2%");
    expect(valueText({ id: "pack.overflow", share: false }, 3)).toBe("3");
    expect(valueText({ id: "pack.aspectError", share: false }, 0.12345)).toBe("0.123");
  });
});

describe("the links to the verdicts of the results page", () => {
  const snapshots = ["pack-select-v2", "pack-select-v1", "pack-screen-v1", "pack-free-v1"].map(snapshot);

  it("reads the hash that it writes", () => {
    expect(parseVerdictHash(verdictHash("pack-screen-v1", "maxrects-bl"))).toEqual({ corpus: "pack-screen-v1", strategy: "maxrects-bl" });
    expect(parseVerdictHash("#strategies")).toBeUndefined();
  });

  it("picks the preferred corpus, then the first corpus with the entry, and no corpus for the baseline", () => {
    expect(verdictSnapshot(snapshots, "maxrects-bl", ["pack-screen-v1"])?.corpus).toBe("pack-screen-v1");
    expect(verdictSnapshot(snapshots, "select-rows-bl", ["pack-free-v1"])?.corpus).toBe("pack-select-v2");
    expect(verdictSnapshot(snapshots, "rows")).toBeUndefined();
  });

  it("has a verdict for each entry other than the baseline", () => {
    for (const e of COMPARE_ENTRIES) {
      if (e.id === "rows") continue;
      expect(verdictSnapshot(snapshots, e.id), e.id).toBeDefined();
    }
  });
});
