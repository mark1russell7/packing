import { describe, expect, it } from "vitest";
import { kpiInput, skipCounts, type KpiFacts } from "./kpi.ts";
import { entriesNote, skipLine, skipsHtml, skipWordOf } from "./results-model.ts";

const FACTS: KpiFacts = {
  picker: 31,
  strategies: 31,
  families: 20,
  lawPairs: 40,
  pages: [],
  release: "1.0.0",
  tags: ["1.0.0"],
  versionAt: "2026-01-01T00:00:00Z",
  shownReleases: ["1.0.0"],
  changelogReleases: ["1.0.0"],
  trend: [],
  entries: { measured: 2, planned: 4 },
  explorer: true,
  commitAt: "2026-01-03T00:00:00Z",
  lawPairsAt: "2026-01-03T00:00:00Z",
  coverageAt: "2026-01-03T00:00:00Z",
};

describe("the word of a skip on the page", () => {
  it("reads a reason with no word as not read, and a wall budget has no word", () => {
    expect(skipWordOf("unsupported order: soft", undefined)).toBe("not read");
    expect(skipWordOf("unsupported order: soft", "not done")).toBe("not done");
    expect(skipWordOf("over budget", undefined)).toBeUndefined();
    expect(skipWordOf("not run: job budget", "not done")).toBeUndefined();
  });

  it("gives a line with the word and its reason", () => {
    expect(skipLine({ reason: "unsupported order: soft", word: "not done", why: "a < b" })).toBe("<code>not done</code> unsupported order: soft: a &lt; b");
    expect(skipLine({ reason: "unsupported order: soft" })).toBe("<code>not read</code> unsupported order: soft");
    expect(skipLine({ reason: "over budget" })).not.toContain("<code>");
  });

  it("counts by word, with a budget out and each record with no word as not read", () => {
    const counts = skipCounts([
      {
        skipped: 18,
        reasons: [
          { reason: "unsupported containerSize: freeArea", count: 7, word: "not done" },
          { reason: "unsupported containerShape: circle", count: 5, word: "other algorithm" },
          { reason: "unsupported mode: offline", count: 3, word: "no meaning" },
          { reason: "unsupported order: soft", count: 2 },
          { reason: "over budget", count: 1 },
        ],
      },
      { skipped: 4 },
      { skipped: 0, reasons: [] },
    ]);
    expect(counts).toEqual({ owed: 7, otherAlgorithm: 5, noMeaning: 3, notRead: 6 });
  });

  it("shows the counts and each group of a corpus", () => {
    const html = skipsHtml([
      { strategy: "a<", skipped: 4, reasons: [{ reason: "unsupported containerSize: freeArea", count: 4, word: "not done", why: "A composition lifts it." }] },
      { strategy: "b", skipped: 2, reasons: [{ reason: "unsupported containerSize: freeArea", count: 2, word: "not done", why: "A composition lifts it." }] },
      { strategy: "c", skipped: 1, reasons: [{ reason: "unsupported order: soft", count: 1 }] },
      { strategy: "d", skipped: 1, reasons: [{ reason: "over budget", count: 1 }] },
    ]);
    expect(html).toContain("<b>7 skipped records</b>");
    expect(html).toContain("6 <code>not done</code>");
    expect(html).toContain("1 <code>not read</code>");
    expect(html).toContain("<li><code>not done</code> <b>6</b> records: A composition lifts it. <code>a&lt;</code>, <code>b</code></li>");
    expect(html).toContain("<li><code>not read</code> <b>1</b> records: unsupported order: soft <code>c</code></li>");
    expect(html).not.toContain("<code>d</code>");
  });

  it("shows nothing for a corpus with no refusal", () => {
    expect(skipsHtml([{ strategy: "a", skipped: 0, reasons: [] }])).toBe("");
    expect(skipsHtml([{ strategy: "a", skipped: 1, reasons: [{ reason: "over budget", count: 1 }] }])).toBe("");
  });

  it("keeps the count when a snapshot has no reasons", () => {
    expect(skipsHtml([{ strategy: "a", skipped: 3 }])).toContain("3 <code>not read</code>");
  });

  it("puts the word beside a reason of an entry with no row", () => {
    const note = entriesNote({ planned: 1, measured: 0, others: [{ entry: "s", reasons: [{ because: "unsupported order: soft", records: 2, word: "not done" }] }] });
    expect(note).toContain("not done: unsupported order: soft (2 records)");
  });
});

describe("the skips of the KPI file", () => {
  const of = (facts: KpiFacts, id: string) => kpiInput(facts, 0).measures.find((m) => m.id === id);

  it("counts a skip that the code can lift apart from a measured entry", () => {
    const facts: KpiFacts = { ...FACTS, skips: { owed: 7, otherAlgorithm: 5, noMeaning: 3, notRead: 6 }, skipsAt: "2026-01-02T00:00:00Z" };
    expect(of(facts, "skips-owed")).toMatchObject({ value: 7, at: "2026-01-02T00:00:00Z" });
    expect(of(facts, "skips-not-read")).toMatchObject({ value: 6, at: "2026-01-02T00:00:00Z" });
    expect(of(facts, "measured-entries")?.value).toBe(of(FACTS, "measured-entries")?.value);
  });

  it("gives no such measures with no snapshots", () => {
    expect(of(FACTS, "skips-owed")).toBeUndefined();
    expect(of(FACTS, "skips-not-read")).toBeUndefined();
  });
});
