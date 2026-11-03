import { describe, expect, it } from "vitest";
import { signTest } from "@mark1russell7/rigor-statistics";
import type { ArmHits } from "./coverage.ts";
import { pairedArms, pairedLines } from "./paired-arms.ts";

// The paired test of the active arm against the control arm (k120 slice b), on hits made by hand.

/** This function gives the hits of one measure from a text of 1 (hit) and 0 (miss). */
const arm = (id: string, text: string): ArmHits => ({ id, at: [...text].map((_, i) => i), hits: [...text].map((c) => c === "1") });

describe("the paired test of two arms", () => {
  it("counts the four outcomes, and tests the discordant pairs with the exact McNemar test", () => {
    const active = [arm("a", "1111111111110000"), arm("b", "1010101010101010")];
    const control = [arm("a", "1100000000000000"), arm("b", "1010101010101010")];
    const p = pairedArms(active, control, { runs: 2000 });
    const a = p.measures[0]!;
    expect([a.n, a.both, a.active, a.control, a.neither]).toEqual([16, 2, 10, 0, 4]);
    expect(a.meanDiff).toBe(0.625);
    expect(a.p).toBe(Math.round(signTest(10, 0, 2) * 1e4) / 1e4);
    expect(a.interval.low).toBeGreaterThan(0);
    expect(a.interval.high).toBeLessThanOrEqual(1);
    expect(a.reject).toBe(true);
    // Equal hits give no discordant pair: p 1, no change.
    const b = p.measures[1]!;
    expect([b.meanDiff, b.p, b.adjusted, b.reject]).toEqual([0, 1, 1, false]);
    expect(pairedLines(p)[0]).toContain("Only active 10, only control 0");
  });

  it("gives the same result for the same seed, and corrects the p of the measures with Holm", () => {
    const active = [arm("a", "11111100"), arm("b", "11111100")];
    const control = [arm("a", "00000000"), arm("b", "11111100")];
    const one = pairedArms(active, control, { runs: 500 });
    expect(JSON.stringify(pairedArms(active, control, { runs: 500 }))).toBe(JSON.stringify(one));
    // Holm multiplies the smallest p by the count of the measures.
    expect(one.measures[0]!.adjusted).toBe(Math.round(Math.min(1, 2 * signTest(6, 0, 2)) * 1e4) / 1e4);
  });

  it("refuses two arms with other measures or other evaluation pairs", () => {
    expect(() => pairedArms([arm("a", "10")], [arm("b", "10")])).toThrow(/same measures/);
    expect(() => pairedArms([arm("a", "10")], [{ id: "a", at: [0, 2], hits: [true, false] }])).toThrow(/same evaluation pairs for a/);
  });
});
