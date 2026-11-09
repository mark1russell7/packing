import { describe, expect, it } from "vitest";
import { angularDisplacement, distanceCorrelation, distanceDisplacement, FRAME, ORDER_ARMS, ORDER_TABLES, orderRows, placeRows, spatialReportOf } from "./treemap-spatial.ts";

const cell = (id: string, x: number, y: number) => ({ id, x, y, w: 2, h: 2 });

describe("the measures of Wood and Dykes 2008", () => {
  it("gives a distance correlation of 1 for cells on a line from the corner", () => {
    const cells = [0, 1, 2, 3].map((i) => cell(`n${i}`, 2 * i, 2 * i));
    expect(distanceCorrelation(cells, { x: -1, y: -1, w: 10, h: 10 })).toBeCloseTo(1, 12);
  });

  it("gives no displacement when each center is at its scaled point", () => {
    // The points span 0 to 4 on each axis, and the frame spans 0 to 8, so each point scales by 2.
    const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }];
    const cells = points.map((p, i) => cell(`n${i}`, 2 * p.x - 1, 2 * p.y - 1));
    expect(distanceDisplacement(points, cells, { x: 0, y: 0, w: 8, h: 8 })).toBeCloseTo(0, 12);
    // The arc cosine of a value near 1 has an error near the square root of the rounding error.
    expect(angularDisplacement(points, cells)).toBeCloseTo(0, 5);
  });

  it("gives an angle of 180 degrees for each pair of two swapped cells, over n squared", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const cells = [cell("a", 5, 0), cell("b", 0, 0)];
    expect(angularDisplacement(points, cells)).toBeCloseTo((2 * 180) / 4, 9);
    // Each center is 5 from its scaled point, in a frame of area 100 (square root 10).
    expect(distanceDisplacement(points, [cell("a", 4, 4), cell("b", 4, 4)], { x: 0, y: 0, w: 10, h: 10 })).toBeCloseTo(5 / 10, 12);
  });
});

describe("the report of Tables 1 to 3", () => {
  it("gives Table 1 in the square with the published aspect, readability and correlation of squarified and strip", () => {
    const rows = orderRows(2).filter((row) => row.table === ORDER_TABLES[0]!.table);
    expect(rows.map((row) => row.arm)).toEqual(ORDER_ARMS.map((arm) => arm.id));
    const read = (arm: string) => rows.find((row) => row.arm === arm)!;
    expect(read("slice-dice").aspect.measured).toBeCloseTo(100, 9);
    expect(read("squarified").readability.measured).toBeCloseTo(0.66, 2);
    expect(read("strip").readability.measured).toBeCloseTo(0.82, 2);
    expect(read("ordered").correlation.inBand).toBe(true);
    for (const row of rows) expect([row.aspect.low, row.aspect.high]).toEqual([row.aspect.measured, row.aspect.measured]);
  });

  it("gives a row for each arm of Table 3, with a published row only for the spatial arm", () => {
    const rows = placeRows(2);
    expect(rows.map((row) => row.arm)).toEqual(["spatial", "squarified"]);
    expect(rows[0]!.aspect.published).toBe(2.66);
    expect([rows[1]!.aspect.published, rows[1]!.aspect.inBand]).toEqual([null, null]);
    const report = spatialReportOf(orderRows(2), rows, 2);
    expect(report).toContain("## Ordered and spatial treemaps against Wood and Dykes 2008 (2 trials)");
    expect(report).toContain("| 2 (log-normal) | ordered | ");
    expect(report).toContain("| spatial | ");
    expect(FRAME).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
