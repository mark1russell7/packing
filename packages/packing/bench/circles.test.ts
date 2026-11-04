import { describe, expect, it } from "vitest";
import { breaksOf, circleInput, circlesOf, leastClearance, packCase, parseTable, smallestSquare, summarize, summaryText, type BaselineRecord, type CircleRecord } from "./circles.ts";
import { packWith } from "../src/index.ts";

// Roadmap item k94: the comparison with the literature. The tests use made-up tables and a fake clock. The workflow circles.yml reads the true tables.

/** This function gives a clock that steps 1 millisecond at each read. */
function fakeClock(): () => number {
  let t = 0;
  return () => t++;
}

const TABLE = new Map([[7, 3]]);

describe("the tables", () => {
  it("reads the rows with spaces or a tab, and it skips the other lines", () => {
    const table = parseTable("# N radius\n\n7 3.0\n19\t4.8637033051562\r\n bad line\n20 x\n");
    expect([...table.entries()]).toEqual([
      [7, 3],
      [19, 4.8637033051562],
    ]);
  });
});

describe("the families", () => {
  it("gives equal circles and the circles with r_i = i", () => {
    expect(circlesOf("equal", 3).map((i) => i.w)).toEqual([2, 2, 2]);
    expect(circlesOf("unit", 3).map((i) => i.w)).toEqual([2, 4, 6]);
    expect(circleInput("unit", 2).container.fixed).toBe("none");
  });
});

describe("one case", () => {
  it("gives the gap, the density and the exact checks", () => {
    const r = packCase("equal", 7, 1, 64, TABLE, fakeClock());
    expect(r.reference).toBe(3);
    expect(r.gapPercent!).toBeCloseTo(0, 4);
    expect(r.density).toBeCloseTo(7 / 9, 4);
    expect(r.ms).toBe(1);
    expect(r.msPerMove).toBe(1 / 64);
    expect([r.overlaps, r.outside, r.sameBytes]).toEqual([0, 0, true]);
    expect(r.clearance).toBeGreaterThanOrEqual(0);
    expect(breaksOf([r])).toEqual([]);
  });

  it("gives no gap without a row of the table", () => {
    const r = packCase("unit", 3, 1, 0, new Map(), fakeClock());
    expect([r.reference, r.gapPercent, r.msPerMove]).toEqual([null, null, 0]);
  });

  it("measures the clearance from the geometry of the input", () => {
    const input = circleInput("equal", 2);
    const output = packWith("circle-quasi-physical", input, { iterations: 0 }, 1);
    const moved = { ...output, placements: output.placements.map((p) => ({ ...p, x: 0, y: 0 })) };
    expect(leastClearance(input, moved)).toBe(-2);
  });
});

describe("the baseline", () => {
  it("finds a square for the 4 circles in a row, with no overflow at its side", () => {
    const b = smallestSquare("equal", 4, fakeClock());
    expect(b.side).toBeGreaterThanOrEqual(4 - 1e-9);
    expect(b.side).toBeLessThanOrEqual(4.01);
    expect(packWith("hole-degree", { container: { fixed: "size", w: b.side, h: b.side }, items: circlesOf("equal", 4) }).overflow).toEqual([]);
    expect(b.density).toBeCloseTo((4 * Math.PI) / (b.side * b.side), 9);
  });
});

describe("the summary", () => {
  const record = (seed: number, gapPercent: number | null, more: Partial<CircleRecord> = {}): CircleRecord => ({
    family: "equal",
    n: 7,
    seed,
    iterations: 8,
    radius: 3,
    reference: gapPercent === null ? null : 3,
    gapPercent,
    density: 0.7 + seed / 100,
    ms: 8,
    msPerMove: seed,
    kept: 0,
    evals: 0,
    clearance: 0,
    overlaps: 0,
    outside: 0,
    sameBytes: true,
    ...more,
  });

  it("gives the best, the median and the worst gap of a case, with the baseline", () => {
    const baseline: BaselineRecord = { family: "equal", n: 7, side: 6, density: 0.6, ms: 1 };
    const [line] = summarize([record(1, 0.3), record(2, 0.1), record(3, 0.2)], [baseline]);
    expect(line).toEqual({ family: "equal", n: 7, reference: 3, bestGap: 0.1, medianGap: 0.2, worstGap: 0.3, bestDensity: 0.73, baselineDensity: 0.6, msPerMove: 3 });
    expect(summaryText([line!], 8, 3)).toContain("| equal | 7 | 3.0000000 | 0.1000 | 0.2000 | 0.3000 | 0.7300 | 0.6000 | true | 3.00 |");
  });

  it("gives a dash for a value that the run does not have", () => {
    const [line] = summarize([record(1, null)], []);
    expect([line!.bestGap, line!.baselineDensity]).toEqual([null, null]);
    expect(summaryText([line!], 8, 1)).toContain("| equal | 7 | - | - | - | - | 0.7100 | - | - | 1.00 |");
  });

  it("lists each overlap, each circle outside and each change of the bytes", () => {
    expect(breaksOf([record(1, 0, { overlaps: 2 }), record(2, 0, { outside: 1 }), record(3, 0, { sameBytes: false })])).toHaveLength(3);
    expect(breaksOf([record(1, 0, { clearance: -1 })])).toHaveLength(1);
  });
});
