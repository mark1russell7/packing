import { describe, expect, it } from "vitest";
import type { TreemapNode } from "../src/treemap.ts";
import { treemapQuantum } from "../src/treemap-quantum.ts";
import { ARMS, BANDS, layoutChange, literatureRows, meanAspectOf, PUBLISHED, QUANTUM_RANGES, quantumAspects, quantumRows, readabilityOf, reportOf, SPIRAL_LIMITS, spiralRows, treeOf, WALKS, type Compared } from "./treemap-literature.ts";

describe("the measures of Bederson 2002", () => {
  it("gives the unweighted mean of the aspects", () => {
    expect(meanAspectOf([{ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 4 }, { x: 0, y: 0, w: 2, h: 1 }])).toBeCloseTo((1 + 4 + 2) / 3, 12);
  });

  it("gives the mean distance over x, y, w and h", () => {
    const before = [{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }];
    const after = [{ x: 3, y: 4, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }];
    expect(layoutChange(before, after)).toBeCloseTo(2.5, 12);
    expect(layoutChange(before, before)).toBe(0);
  });

  it("counts the turns of the scan path over the count of the cells", () => {
    const line = [0, 1, 2, 3].map((x) => ({ x, y: 0, w: 1, h: 1 }));
    expect(readabilityOf(line)).toBe(1);
    const stairs = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }].map((at) => ({ ...at, w: 1, h: 1 }));
    expect(readabilityOf(stairs)).toBe(0.5);
  });

  it("does not count a turn of 0.1 radians or less", () => {
    const small = Math.tan(0.05);
    const bent = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: small }].map((at) => ({ ...at, w: 1, h: 1 }));
    expect(readabilityOf(bent)).toBe(1);
  });
});

describe("the tree of a table", () => {
  it("gives 512 leaves for the fan-outs 8, 8 and 8", () => {
    const nodes = treeOf(new Array<number>(512).fill(1), [8, 8, 8]);
    const count = (list: readonly TreemapNode[]): number => list.reduce((sum, node) => sum + (node.children === undefined ? 1 : count(node.children)), 0);
    expect(nodes).toHaveLength(8);
    expect(count(nodes)).toBe(512);
  });
});

describe("the report", () => {
  it("has the four methods in each of the three tables", () => {
    expect(PUBLISHED).toHaveLength(3);
    for (const table of PUBLISHED) expect(Object.keys(table.rows).sort()).toEqual(["pivot-split", "slice-dice", "squarified", "strip"]);
  });

  it("gives the same bytes for the same arguments, with a row for each arm", () => {
    const rows = literatureRows(2, 3);
    expect(rows).toHaveLength(WALKS.length * PUBLISHED.length * ARMS.length);
    expect(JSON.stringify(literatureRows(2, 3))).toBe(JSON.stringify(rows));
    expect(reportOf(rows, 2, 3)).toContain("| sd-0.05 | I (20x1) | strip-no-lookahead |");
  });

  it("keeps the rank of the methods on a tiny run", () => {
    const rows = literatureRows(3, 2);
    const aspect = (table: string, arm: string): number => rows.find((row) => row.walk === "sd-0.05" && row.table === table && row.arm === arm)!.aspect.measured;
    for (const { table } of PUBLISHED) {
      expect(aspect(table, "squarified"), table).toBeLessThan(aspect(table, "pivot-split"));
      expect(aspect(table, "pivot-split"), table).toBeLessThan(aspect(table, "slice-dice"));
    }
    for (const row of rows.filter((r) => r.arm === "slice-dice")) expect(row.readability.measured).toBe(1);
  });

  it("gives a larger change on the walk with the larger step", () => {
    const rows = literatureRows(3, 3).filter((row) => row.arm === "slice-dice");
    for (const { table } of PUBLISHED) {
      const [large, small] = WALKS.map((walk) => rows.find((row) => row.table === table && row.walk === walk.id)!.change.measured);
      expect(large!, table).toBeGreaterThan(small!);
    }
  });

  it("marks a value out of its band", () => {
    const value = { published: 2, measured: 3, low: 3, high: 3, inBand: false };
    const report = reportOf([{ walk: "w", table: "t", arm: "a", aspect: value, change: value, readability: { ...value, inBand: true } }], 2, 2);
    expect(report).toContain("| w | t | a | 3.00 [3.00, 3.00] / 2.00 OUT | 3.00 [3.00, 3.00] / 2.00 OUT | 3.00 [3.00, 3.00] / 2.00 in |");
    expect(BANDS.aspect).toBe(0.15);
  });
});

describe("spiral against strip", () => {
  const value = (measured: number): Compared => ({ published: null, measured, low: measured, high: measured, inBand: null });
  const row = (arm: string, aspect: number, change: number, readability: number) => ({ walk: "w", table: "t", arm, aspect: value(aspect), change: value(change), readability: value(readability) });

  it("gives the spiral arm no published row and no verdict of a band", () => {
    const rows = literatureRows(2, 2).filter((r) => r.arm === "spiral");
    expect(rows).toHaveLength(WALKS.length * PUBLISHED.length);
    for (const r of rows) for (const measure of [r.aspect, r.change, r.readability]) expect([measure.published, measure.inBand]).toEqual([null, null]);
    expect(reportOf(literatureRows(2, 2), 2, 2)).toContain("| sd-0.05 | I (20x1) | spiral | ");
  });

  it("gives each limit at its edge as ok, and a value past it as over", () => {
    const edge = spiralRows([row("strip", 2, 4, 0.5), row("spiral", 2 * SPIRAL_LIMITS.aspect, 4, 0.5)]);
    expect(edge).toEqual([{ walk: "w", table: "t", aspectRatio: SPIRAL_LIMITS.aspect, changeRatio: 1, readabilityGain: 0, aspectOk: true, changeOk: true, readabilityOk: true }]);
    const past = spiralRows([row("strip", 2, 4, 0.5), row("spiral", 2.6, 4.4, 0.4)])[0]!;
    expect([past.aspectOk, past.changeOk, past.readabilityOk]).toEqual([false, false, false]);
    const report = reportOf([row("strip", 2, 4, 0.5), row("spiral", 2.6, 4.4, 0.4)], 2, 2);
    expect(report).toContain("| w | t | 1.300 OVER | 1.100 OVER | -0.100 OVER |");
    expect(report).toContain("| w | t | spiral | 2.60 [2.60, 2.60] / no row |");
  });

  it("gives no spiral row without a strip row of the same walk and table", () => {
    expect(spiralRows([row("spiral", 1, 1, 1)])).toEqual([]);
  });
});

describe("the quantum trials of figures 13 and 14", () => {
  it("counts a group alone in a strip of one row, and leaves it out of the other aspect", () => {
    // The groups 100, 4 and 100 give three strips. The 4 is alone in the middle strip, with 13 columns and 1 row.
    const layout = treemapQuantum([{ id: "a", count: 100 }, { id: "b", count: 4 }, { id: "c", count: 100 }], { x: 0, y: 0, w: 170, h: 170 });
    const read = quantumAspects(layout);
    expect(read.lone).toBe(1);
    expect(read.otherAspect).toBeCloseTo(13 / 8, 12);
    expect(read.aspect).toBeCloseTo((13 / 8 + 13 + 13 / 8) / 3, 12);
  });

  it("gives a row for each range, and the report gives the section", () => {
    const rows = quantumRows(2);
    expect(rows.map((row) => row.range)).toEqual([...QUANTUM_RANGES]);
    for (const row of rows) {
      expect(row.quantumAspect.measured).toBeGreaterThanOrEqual(1);
      expect(row.stripAspect.measured).toBeGreaterThanOrEqual(1);
      expect(row.wasted.measured).toBeGreaterThanOrEqual(0);
      expect(row.wasted.measured).toBeLessThan(1);
      expect([row.quantumAspect.published, row.quantumAspect.inBand]).toEqual([null, null]);
    }
    const report = reportOf([], 2, 2, rows);
    expect(report).toContain("## Quantum strip against strip (figures 13 and 14)");
    expect(report).toContain("| 1 to 10 | ");
    expect(reportOf([], 2, 2)).not.toContain("Quantum strip");
  });
});
