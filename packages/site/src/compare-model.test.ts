import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { circleOverlaps } from "@mark1russell7/packing";
import { STANDALONE_IDS } from "@mark1russell7/packing/bench/entries";
import {
  bestIds,
  boardInput,
  COMPARE_ENTRIES,
  COMPARE_FAMILIES,
  COMPARE_MEASURES,
  drawingSvg,
  entriesFor,
  frontPoints,
  frontSvg,
  placeFrontLabels,
  keepsPartner,
  MAX_COMPARE_COUNT,
  PARTNER_BASELINE,
  partnerReference,
  presetInput,
  runAll,
  runEntry,
  SHAPE_ENTRIES,
  sortResults,
  valueText,
  type EntryResult,
} from "./compare-model.ts";
import { familyKey, familyOf } from "./corpus-input.ts";
import { parseSnapshot } from "./data.ts";
import { parseVerdictHash, verdictHash, verdictSnapshot } from "./results-model.ts";

const snapshot = (name: string) => parseSnapshot(readFileSync(new URL(`../data/strategies-${name}.json`, import.meta.url), "utf8"), "strategies");

describe("the partner of the fill on the compare page (k154)", () => {
  // Made-up results with the means of the fill control on pack-change-v1. The control packs narrower than the given width,
  // so its fill is high and its right strip is empty.
  const r = (id: string, index: number, fill: number, right: number): EntryResult => ({
    entry: { ...COMPARE_ENTRIES[index]!, id },
    index,
    ms: 0,
    output: { placements: [], overflow: [], size: { w: 1, h: 1 }, moved: [] },
    measures: { "pack.fill": fill, "pack.balance.side.right": right },
  });
  const list = [r(PARTNER_BASELINE, 0, 0.7, 0.25), r("trick", 1, 0.876, 0.849), r("maxrects-bl", 2, 0.8, 0.199)];
  const given = presetInput("cards", 24, 640, 1).input;
  const free = { ...given, container: { fixed: "none" as const } };

  it("does not put a fill that gives up the right strip first, and does not call it the best fill", () => {
    const reference = partnerReference(given, list);
    expect(reference).toBe(0.25);
    expect(sortResults(list, "pack.fill", reference).map((x) => x.entry.id)).toEqual(["maxrects-bl", PARTNER_BASELINE, "trick"]);
    expect([...bestIds(list, "pack.fill", (x) => keepsPartner(x, reference))]).toEqual(["maxrects-bl"]);
  });

  it("ranks by the fill alone with no partner: then the trick leads", () => {
    expect(partnerReference(free, list)).toBeUndefined();
    expect(sortResults(list, "pack.fill").map((x) => x.entry.id)).toEqual(["trick", "maxrects-bl", PARTNER_BASELINE]);
    expect([...bestIds(list, "pack.fill")]).toEqual(["trick"]);
    expect(keepsPartner(list[1]!, undefined)).toBe(true);
  });

  it("keeps the partner within the noise of a float, and gives no reference when the baseline has no value", () => {
    expect(keepsPartner(r("near", 3, 0.9, 0.25 + 1e-12), 0.25)).toBe(true);
    expect(keepsPartner(r("over", 3, 0.9, 0.2501), 0.25)).toBe(false);
    expect(partnerReference(given, list.slice(1))).toBeUndefined();
  });

  it("compares with the baseline of the results page", () => {
    for (const name of ["pack-screen-v1", "pack-free-v1"]) expect(snapshot(name).baseline).toBe(PARTNER_BASELINE);
  });

  it("packs no control of the bench: a control is built to win one measure", () => {
    const ids = [...COMPARE_ENTRIES, ...SHAPE_ENTRIES].map((e) => e.id);
    expect(ids).toContain(PARTNER_BASELINE);
    for (const control of ["fill-trick", "keep-shelf"]) expect(ids).not.toContain(control);
  });
});

describe("the input of the compare page", () => {
  it("makes a board of each family with its defaults", () => {
    for (const f of COMPARE_FAMILIES) {
      const b = boardInput(familyKey(f), {}, 1);
      expect(b.id).toMatch(/\/s1$/);
      expect(b.input.items.length).toBeLessThanOrEqual(MAX_COMPARE_COUNT);
    }
  });

  it("stops the count of a board at the largest count", () => {
    const b = boardInput("rect-scattered@1", { count: 50_000 }, 2);
    expect(b.input.items.length).toBe(MAX_COMPARE_COUNT);
  });

  it("gives rect-grid version 2 for an unknown key", () => {
    expect(familyKey(familyOf("nothing@9"))).toBe("rect-grid@2");
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
      // A standalone strategy of k141 supports fewer cells, so the page shows why it has no layout.
      if (r.error !== undefined && STANDALONE_IDS.has(r.entry.id)) continue;
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

  it("has a verdict for each entry other than the baseline and the entries with no run yet", () => {
    // The entries of k78, k91, k22, k23, k79, k80, k26, k124 and k127 have no run of the benchmark yet. When a snapshot has them, remove them from this list.
    const noRunYet = ["restarts-maxrects-bl-k16", "restarts-rows-k16", "restarts-maxrects-bl-shuffle-k16", "bbox-maxrects-bl", "bbox-skyline", "ruin-recreate-maxrects-bl-k64", "ruin-recreate-skyline-k64", "overlap-min-maxrects-bl-k8192", "overlap-min-skyline-k8192", "anneal-maxrects-bl-k16", "anneal-skyline-k16", "genetic-maxrects-bl-k16", "tabu-maxrects-bl-k16", "relax-rows", "relax-maxrects-bl", "relax-skyline-bl-waste", "force-rows", "force-maxrects-bl", "force-skyline-bl-waste", "portfolio-fill-rows-bl", "skyline-mw", "skyline-bl-waste", "skyline-mw-waste", "guillotine-baf-sas", "guillotine-bssf-sas-merge", "bottom-left", "bottom-left-liu-teng", "best-fit", "best-fit-tall", "best-fit-short"];
    for (const e of COMPARE_ENTRIES) {
      if (e.id === "rows") continue;
      if (noRunYet.includes(e.id) || STANDALONE_IDS.has(e.id)) expect(verdictSnapshot(snapshots, e.id), e.id).toBeUndefined();
      else expect(verdictSnapshot(snapshots, e.id), e.id).toBeDefined();
    }
  });
});

describe("the circle preset on the compare page", () => {
  const input = presetInput("circles", 20, 640, 4).input;

  it("adds hole degree after the entries of ENTRIES, only for circles", () => {
    expect(SHAPE_ENTRIES.map((e) => e.id)).toEqual(["hole-degree"]);
    expect(COMPARE_ENTRIES.map((e) => e.id)).not.toContain("hole-degree");
    expect(entriesFor(input).map((e) => e.id)).toEqual([...COMPARE_ENTRIES.map((e) => e.id), "hole-degree"]);
    expect(entriesFor(presetInput("mixed", 20, 640, 4).input)).toBe(COMPARE_ENTRIES);
  });

  it("packs the circles with hole degree and bbox, with no overlap of two circles, and draws circles", () => {
    const results = runAll(input);
    expect(results.map((r) => r.index)).toEqual(results.map((_, i) => i));
    for (const id of ["hole-degree", "bbox-maxrects-bl", "bbox-skyline"]) {
      const r = results.find((x) => x.entry.id === id)!;
      expect(r.error, id).toBeUndefined();
      expect(r.output!.placements, id).toHaveLength(20);
      expect(circleOverlaps(input, r.output!), id).toBe(0);
      expect(drawingSvg(input, r.output!, id)).toContain("<circle");
    }
    expect(results.find((x) => x.entry.id === "rows")?.unsupported).toBe(true);
  });
});

describe("the front of compact against spread (k123)", () => {
  const result = (id: string, fill: number, skew: number): EntryResult => ({ entry: { id, strategy: id, options: {} }, index: 0, ms: 0, measures: { "pack.fill": fill, "pack.balance.sideRange": skew } });

  it("keeps on the front only the points that no other point beats on both values", () => {
    const points = frontPoints([result("a", 0.9, 0.4), result("b", 0.8, 0.1), result("c", 0.7, 0.3), result("d", 0.9, 0.4)]);
    expect(points.map((p) => [p.id, p.front])).toEqual([["a", true], ["b", true], ["c", false], ["d", true]]);
  });

  it("leaves out a result without a value, and draws a line through the front", () => {
    const failed: EntryResult = { entry: { id: "x", strategy: "x", options: {} }, index: 0, ms: 0, error: "no" };
    const points = frontPoints([result("a", 0.9, 0.4), result("b", 0.8, 0.1), failed]);
    expect(points).toHaveLength(2);
    const svg = frontSvg(points);
    expect(svg).toContain('class="fline"');
    expect(svg.match(/class="fpoint on"/g)).toHaveLength(2);
  });

  it("puts each name inside the area, with no name on another name or on a dot", () => {
    const dots = Array.from({ length: 40 }, (_, i) => ({ cx: 60 + ((i * 37) % 250), cy: 20 + ((i * 53) % 140), r: 4.5, name: `strategy-${i}` }));
    const area = { l: 42, t: 0, r: 320, b: 167 };
    const labels = placeFrontLabels(dots, area);
    const boxes = labels.flatMap((l) => (l === null ? [] : [l.box]));
    expect(boxes.length).toBeGreaterThan(0);
    for (const [i, a] of boxes.entries()) {
      expect(a[0] >= area.l && a[1] >= area.t && a[2] <= area.r && a[3] <= area.b).toBe(true);
      for (const b of boxes.slice(i + 1)) expect(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]).toBe(false);
      for (const d of dots) {
        const nx = Math.max(a[0], Math.min(d.cx, a[2]));
        const ny = Math.max(a[1], Math.min(d.cy, a[3]));
        expect((nx - d.cx) ** 2 + (ny - d.cy) ** 2).toBeGreaterThanOrEqual(d.r * d.r);
      }
    }
  });

  it("puts the name of a dot at the right edge at its left, and gives no name to a dot of a full cluster", () => {
    const area = { l: 42, t: 0, r: 320, b: 167 };
    const [edge] = placeFrontLabels([{ cx: 308, cy: 80, r: 4.5, name: "anneal-maxrects-bl-k16" }], area);
    expect(edge).toMatchObject({ anchor: "end" });
    // Eight dots on one spot: the first dots take the four places, and the other dots get no name.
    const cluster = placeFrontLabels(
      Array.from({ length: 8 }, (_, i) => ({ cx: 180, cy: 80, r: 4.5, name: `s${i}` })),
      area,
    );
    expect(cluster[0]).not.toBeNull();
    expect(cluster.filter((l) => l === null).length).toBeGreaterThan(0);
  });

  it("draws one name for each dot of the front that has room, and keeps the other dots without a name", () => {
    const close = Array.from({ length: 12 }, (_, i) => result(`near-${i}`, 0.95 - i * 0.0001, 0.9 - i * 0.0001));
    const svg = frontSvg(frontPoints([...close, result("left", 0.5, 0.01)]));
    const names = svg.match(/class="fname"/g) ?? [];
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(13);
    expect(svg).toContain(">left</text>");
  });

  it("measures the side skew on each compare run", () => {
    expect(COMPARE_MEASURES.map((m) => m.id)).toContain("pack.balance.sideRange");
  });
});
