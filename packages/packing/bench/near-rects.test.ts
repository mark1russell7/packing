import { describe, expect, it } from "vitest";
import { comparePair, measureRow, NEAR_ARMS, runArm, type NearRow } from "./near-rects.ts";
import { rasterFamily } from "./raster-nofit.ts";

const row = (input: string, arm: NearRow["arm"], density: number): NearRow => ({ set: "family", input, arm, density, crossings: 0, overflow: 0, ms: 1 });

describe("near-rects bench", () => {
  it("gives a placement for each item in each arm", () => {
    const input = rasterFamily(2, 12);
    for (const arm of NEAR_ARMS) {
      const output = runArm(arm, input, 0.5, 8, 2);
      expect(output.placements).toHaveLength(12);
      expect(output.overflow).toEqual([]);
    }
  });

  it("gives a row with a density and no crossing", () => {
    const measured = measureRow("family", "s2", "near-rects", rasterFamily(2, 12), 0.5, 8, 2);
    expect(measured.density).toBeGreaterThan(0);
    expect(measured.density).toBeLessThanOrEqual(100);
    expect(measured.crossings).toBe(0);
  });

  it("pairs the rows of two arms by their input", () => {
    const rows = [row("a", "near-rects", 60), row("a", "bbox", 50), row("b", "near-rects", 70), row("b", "bbox", 60), row("c", "bbox", 1)];
    const pair = comparePair(rows, "family", "near-rects", "bbox");
    expect(pair.pairs).toBe(2);
    expect(pair.points).toBe(10);
    expect(pair.wins).toBe(2);
    expect(pair.losses).toBe(0);
  });
});
