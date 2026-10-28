import { readFileSync } from "node:fs";
import { composites, strategies } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { ENTRIES } from "@mark1russell7/packing/bench/entries";
import {
  bibText,
  buildCards,
  byFamily,
  cellHtml,
  OPTIONAL_OPTIONS,
  optionsOf,
  parseCatalog,
  passes,
  sourcesOf,
  STAGES,
  STRATEGY_STAGES,
  stripOf,
  type EntryLike,
} from "./cards-model.ts";
import { parseSnapshot, type StrategySnapshot } from "./data.ts";

const catalogText = readFileSync(new URL("../../../docs/research/CATALOG.md", import.meta.url), "utf8");
const catalog = parseCatalog(catalogText);
const snapshot = (name: string): StrategySnapshot => parseSnapshot(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"), "strategies");
const snapshots = ["strategies-pack-select-v2", "strategies-pack-select-v1", "strategies-pack-screen-v1", "strategies-pack-free-v1"].map(snapshot);
// This line checks that the type of `ENTRIES` fits the cards.
const entries: readonly EntryLike[] = ENTRIES;
const registry = [...strategies, ...composites];
const cards = buildCards({ strategies, composites, entries, catalog, snapshots });

describe("the sync of the cards with the code and the catalog", () => {
  it("has a stage for each strategy of the registry, and no stage for an id outside it", () => {
    expect(Object.keys(STRATEGY_STAGES).sort()).toEqual(registry.map((s) => s.id).sort());
    for (const info of Object.values(STRATEGY_STAGES)) expect(STAGES).toContain(info.stage);
  });

  it("gives a rule and a cost to each strategy with no catalog row", () => {
    for (const s of registry.filter((x) => x.catalog.length === 0)) {
      expect(STRATEGY_STAGES[s.id]?.rule, s.id).toBeTruthy();
      expect(STRATEGY_STAGES[s.id]?.cost, s.id).toBeTruthy();
    }
  });

  it("has one card for each registry id", () => {
    expect(cards.map((c) => c.id)).toEqual(registry.map((s) => s.id));
    for (const c of cards) expect(c.stage, c.id).toBeDefined();
  });

  it("shows each entry of ENTRIES once, on the card of its strategy", () => {
    const shown = cards.flatMap((c) => c.entries.map((e) => e.id));
    expect(shown.sort()).toEqual(ENTRIES.map((e) => e.id).sort());
    for (const c of cards) for (const e of c.entries) expect(ENTRIES.find((x) => x.id === e.id)?.strategy).toBe(c.id);
  });

  it("finds each catalog id of each strategy in CATALOG.md", () => {
    for (const s of registry) for (const id of s.catalog) expect(catalog.rows.has(id), `${s.id}: ${id}`).toBe(true);
    for (const c of cards) expect(c.missing, c.id).toEqual([]);
  });

  it("finds the bibliography entry of each source of a card, and of each source of a guarantee", () => {
    const keys = new Set(catalog.bibliography.map((b) => b.key));
    for (const c of cards) {
      for (const r of c.rows) if (r.source !== "this repository") expect(sourcesOf(r.source, catalog.bibliography).length, r.id).toBeGreaterThan(0);
    }
    for (const r of catalog.rows.values()) {
      const named = /\(([^()]*?\d{4})(, unverified)?\)$/.exec(r.guarantee)?.[1];
      if (named !== undefined) expect(keys.has(named), `${r.id}: ${named}`).toBe(true);
    }
  });

  it("refuses an entry of a strategy that the registry does not have", () => {
    expect(() => buildCards({ strategies, composites, entries: [{ id: "x", strategy: "nope", options: {} }], catalog, snapshots })).toThrow(RangeError);
  });

  it("names only registry ids in OPTIONAL_OPTIONS", () => {
    for (const id of Object.keys(OPTIONAL_OPTIONS)) expect(registry.map((s) => s.id)).toContain(id);
  });
});

describe("the catalog parser", () => {
  it("reads each row of each method table, with a guarantee in each row", () => {
    expect(catalog.rows.size).toBeGreaterThanOrEqual(170);
    for (const r of catalog.rows.values()) {
      expect(r.guarantee, r.id).not.toBe("");
      expect(r.section, r.id).not.toBe("");
    }
    expect(catalog.rows.get("shelf-nfdh")?.guarantee).toBe("`2·OPT + h_max` (Coffman 1980)");
    expect(catalog.rows.get("maxrects-bl")?.guarantee).toBe("—");
  });

  it("reads the bibliography with the URL of each entry", () => {
    const coffman = catalog.bibliography.find((b) => b.key === "Coffman 1980");
    expect(coffman?.url).toBe("https://doi.org/10.1137/0209062");
    expect(sourcesOf("Hopper 2001, Kirkpatrick 1983", catalog.bibliography).map((b) => b.key)).toEqual(["Hopper 2001", "Kirkpatrick 1983"]);
  });

  it("escapes each cell, and makes only code spans and links of the catalog", () => {
    const url = "https://example.org/docs/research/CATALOG.md";
    expect(cellHtml(`<script>alert("x")</script> & 'y'`, url)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    expect(cellHtml("<scr<script>ipt>", url)).not.toMatch(/<(?!\/?code>)/);
    expect(cellHtml("see `a<b` and [Skyline](#skyline)", url)).toBe(`see <code>a&lt;b</code> and <a href="${url}#skyline">Skyline</a>`);
    expect(cellHtml("[x](javascript:alert(1))", url)).not.toContain("href");
    expect(cellHtml("[spec](../FORMAT.md)", url)).toBe(`<a href="https://example.org/docs/FORMAT.md">spec</a>`);
    for (const b of catalog.bibliography) expect(bibText(b), b.key).not.toContain("<http");
  });

  it("throws for a method row with a missing cell", () => {
    const bad = "## X\n\n| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |\n|---|---|---|---|---|---|---|---|---|\n| `a` | A | r | s | g | c | — | planned |\n";
    expect(() => parseCatalog(bad)).toThrow(/cells/);
  });
});

describe("the parts of a card", () => {
  it("marks the baseline, the verdicts and the corpora with no records", () => {
    const rows = stripOf("rows", snapshots);
    expect(rows.every((r) => r.cells.every((c) => c.label === "baseline"))).toBe(true);
    const select = stripOf("select-rows-bl", snapshots);
    expect(select.map((r) => r.cells[0]!.label)).toEqual(["better", "better", "not measured", "not measured"]);
    expect(stripOf("push", snapshots).every((r) => r.cells.every((c) => c.label === "not measured"))).toBe(true);
  });

  it("gives the options with defaults and types, then the options with no default", () => {
    const maxrects = cards.find((c) => c.id === "maxrects")!;
    expect(maxrects.options.map((o) => [o.name, o.value])).toEqual([
      ["sortOrder", "\"height-desc\""],
      ["samples", "48"],
      ["rule", "\"bssf\""],
      ["rotate", "false"],
      ["bandHeight", null],
    ]);
    expect(optionsOf(strategies.find((s) => s.id === "rows")!).every((o) => o.type !== "")).toBe(true);
  });

  it("marks the supported cells of a strategy", () => {
    const push = cards.find((c) => c.id === "push")!;
    const mode = push.cells.find((c) => c.dimension === "mode")!;
    expect(mode.values.filter((v) => v.on).map((v) => v.value)).toEqual(["incremental"]);
  });

  it("groups the cards by family and filters them by family and stage", () => {
    expect(byFamily(cards).map(([f]) => f)).toEqual([...new Set(cards.map((c) => c.family))]);
    const shelf = cards.find((c) => c.id === "shelf")!;
    expect(passes(shelf, "all", "all")).toBe(true);
    expect(passes(shelf, "shelf", "placement")).toBe(true);
    expect(passes(shelf, "skyline", "all")).toBe(false);
    expect(passes(shelf, "all", "combine")).toBe(false);
  });
});
