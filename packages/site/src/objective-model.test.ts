import { describe, expect, it } from "vitest";
import type { MeasureId, PackInput, PackOutput } from "@mark1russell7/packing";
import { COMPARE_ENTRIES, frontPoints, frontSvg, measureAxis, spacingOf, type EntryResult } from "./compare-model.ts";
import { DEFAULT_SPACING, isObjectiveId, objectiveOf, OBJECTIVE_IDS, rankByObjective, type Objective } from "./objective-model.ts";

// Made-up results: the values are not the values of a real strategy.
const r = (id: string, index: number, measures: Partial<Record<MeasureId, number>>, spacing?: number): EntryResult => ({
  entry: { ...COMPARE_ENTRIES[index]!, id },
  index,
  ms: 0,
  output: { placements: [], overflow: [], size: { w: 1, h: 1 }, moved: [] },
  measures,
  ...(spacing === undefined ? {} : { spacing }),
});
const failed = (id: string, index: number): EntryResult => ({ entry: { ...COMPARE_ENTRIES[index]!, id }, index, ms: 0, error: "stop" });
const ids = (list: readonly { result: EntryResult }[]): string[] => list.map((x) => x.result.entry.id);

describe("the objectives of the compare page (k216)", () => {
  it("has a preset for each id, and each preset puts no overflow first", () => {
    for (const id of OBJECTIVE_IDS) {
      const o = objectiveOf(id);
      expect(o.id).toBe(id);
      expect(o.tiers[0]!.terms.map((t) => t.key)).toEqual(["pack.overflow"]);
      expect(isObjectiveId(id)).toBe(true);
    }
    expect(isObjectiveId("fastest")).toBe(false);
    expect(isObjectiveId(null)).toBe(false);
    expect(objectiveOf("spacing").label).toBe(`Spacing ${DEFAULT_SPACING} px`);
    expect(objectiveOf("spacing", 20).tiers[1]!.terms[0]!.target).toBe(20);
  });

  it("ranks by the first tier first: a layout with overflow comes after each layout without overflow", () => {
    const list = [r("dense", 0, { "pack.overflow": 1, "pack.fill": 0.99 }), r("ok", 1, { "pack.overflow": 0, "pack.fill": 0.6 })];
    const ranked = rankByObjective(list, objectiveOf("densest"));
    expect(ids(ranked)).toEqual(["ok", "dense"]);
    expect(ranked.map((x) => x.rank)).toEqual([1, 2]);
  });

  it("puts the partner before the fill: a layout that gives up the right strip comes after the others", () => {
    const list = [
      r("trick", 0, { "pack.overflow": 0, "pack.fill": 0.95, "pack.balance.side.right": 0.4 }),
      r("kept", 1, { "pack.overflow": 0, "pack.fill": 0.8, "pack.balance.side.right": 0.05 }),
    ];
    expect(ids(rankByObjective(list, objectiveOf("densest"), 0.05))).toEqual(["kept", "trick"]);
    expect(ids(rankByObjective(list, objectiveOf("densest")))).toEqual(["trick", "kept"]);
  });

  it("goes to the next tier on a tie, and keeps the order of the entries on a tie of each tier", () => {
    const list = [r("b", 1, { "pack.overflow": 0, "pack.fill": 0.8, "pack.raggedness": 3 }), r("a", 0, { "pack.overflow": 0, "pack.fill": 0.8, "pack.raggedness": 1 }), r("c", 2, { "pack.overflow": 0, "pack.fill": 0.8, "pack.raggedness": 1 })];
    expect(ids(rankByObjective(list, objectiveOf("densest")))).toEqual(["a", "c", "b"]);
  });

  it("ranks by the distance to the spacing target, and ties the distances in one band of the tolerance", () => {
    const list = [
      r("tight", 0, { "pack.overflow": 0, "pack.fill": 0.9 }, 1),
      r("near", 1, { "pack.overflow": 0, "pack.fill": 0.7 }, 9),
      r("nearer", 2, { "pack.overflow": 0, "pack.fill": 0.6 }, 8.5),
      r("wide", 3, { "pack.overflow": 0, "pack.fill": 0.5 }, 30),
    ];
    // The worst miss is 22 px, so a band is 1.1 px: 0.5 px and 1 px are in one band, and the fill decides.
    expect(ids(rankByObjective(list, objectiveOf("spacing", 8)))).toEqual(["near", "nearer", "tight", "wide"]);
    const exact: Objective = { ...objectiveOf("spacing", 8), tiers: objectiveOf("spacing", 8).tiers.map((t) => ({ ...t, tolerance: 0 })) };
    expect(ids(rankByObjective(list, exact))).toEqual(["nearer", "near", "tight", "wide"]);
  });

  it("gives a missing value the worst score, and puts a result without an output last with no rank", () => {
    const list = [failed("stop", 0), r("none", 1, { "pack.overflow": 0 }), r("fill", 2, { "pack.overflow": 0, "pack.fill": 0.5 })];
    const ranked = rankByObjective(list, objectiveOf("densest"));
    expect(ids(ranked)).toEqual(["fill", "none", "stop"]);
    expect(ranked[2]!.rank).toBeUndefined();
    expect(ranked[1]!.scores[2]).toBe(1);
  });

  it("mixes the terms of a tier by their weights", () => {
    const list = [
      r("fill", 0, { "pack.overflow": 0, "pack.fill": 0.9, "pack.balance.sideRange": 0.3, "pack.balance.gapCv": 0.5 }),
      r("even", 1, { "pack.overflow": 0, "pack.fill": 0.8, "pack.balance.sideRange": 0.1, "pack.balance.gapCv": 0.2 }),
    ];
    const ranked = rankByObjective(list, objectiveOf("balanced"));
    // fill: 2 × 0 + 1 + 1 = 2 of 4; even: 2 × 1 + 0 + 0 = 2 of 4. A tie keeps the order of the entries.
    expect(ranked.map((x) => x.scores[1])).toEqual([0.5, 0.5]);
    expect(ids(ranked)).toEqual(["fill", "even"]);
  });
});

describe("the spacing of a layout (k216)", () => {
  const input = (n: number): PackInput => ({
    items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, w: 10, h: 10 })),
    container: { fixed: "none" },
  });
  const at = (...xs: number[]): PackOutput => ({ placements: xs.map((x, i) => ({ id: `i${i}`, x, y: 0 })), overflow: [], size: { w: 100, h: 10 }, moved: [] });

  it("is the mean gap of each box to its nearest box", () => {
    // Gaps: 4 between i0 and i1, 10 between i1 and i2. Nearest: 4, 4, 10.
    expect(spacingOf(input(3), at(0, 14, 34))).toBeCloseTo(6, 12);
  });

  it("has no value with fewer than 2 boxes", () => {
    expect(spacingOf(input(1), at(0))).toBeUndefined();
    expect(spacingOf(input(0), at())).toBeUndefined();
  });
});

describe("the front of two measures (k216)", () => {
  const list = [
    r("a", 0, { "pack.fill": 0.9, "pack.raggedness": 4, "pack.balance.sideRange": 0.2 }),
    r("b", 1, { "pack.fill": 0.7, "pack.raggedness": 1, "pack.balance.sideRange": 0.1 }),
    r("c", 2, { "pack.fill": 0.6, "pack.raggedness": 5, "pack.balance.sideRange": 0.3 }),
  ];

  it("keeps the default axes of k123: the side skew across and the fill up", () => {
    const points = frontPoints(list);
    expect(points.map((p) => [p.id, p.x, p.y, p.front])).toEqual([
      ["a", 0.2, 0.9, true],
      ["b", 0.1, 0.7, true],
      ["c", 0.3, 0.6, false],
    ]);
  });

  it("reads the direction of each axis: two lower-is-better axes", () => {
    const points = frontPoints(list, measureAxis("pack.raggedness"), measureAxis("pack.balance.sideRange"));
    expect(points.filter((p) => p.front).map((p) => p.id)).toEqual(["b"]);
  });

  it("names the axes in the chart, and refuses a measure that the page does not show", () => {
    const svg = frontSvg(frontPoints(list, measureAxis("pack.raggedness"), measureAxis("pack.fill")), measureAxis("pack.raggedness"), measureAxis("pack.fill"));
    expect(svg).toContain(`${measureAxis("pack.raggedness").label}, less is better`);
    expect(svg).toContain("fpoint on");
    expect(() => measureAxis("pack.order.kendallTau" as MeasureId)).toThrow(RangeError);
  });
});
