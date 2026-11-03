import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signTest } from "@mark1russell7/rigor-statistics";
import type { ArmHits } from "./coverage.ts";
import { foldLines, foldMain, foldVerdict, pairedArms, pairedLines, type PairedArms } from "./paired-arms.ts";

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

  it("gives a result over the fold seeds only when the mean difference is more than 2 SD from 0 (slice e)", () => {
    // Each fold seed gives one paired test. A measure with the mean difference d has that d at each seed.
    const test = (a: number, b: number): PairedArms => ({
      level: 0.05,
      runs: 1,
      seed: "s",
      measures: [a, b].map((d, i) => ({ id: `m${i}`, n: 10, both: 0, active: 0, control: 0, neither: 0, meanDiff: d, interval: { low: d, high: d, level: 0.95 }, p: 1, adjusted: 1, reject: d > 0.1 })),
    });
    const v = foldVerdict([test(0.2, 0.1), test(0.22, -0.1), test(0.18, 0.05), test(0.2, -0.05), test(0.2, 0)]);
    expect(v.seeds).toBe(5);
    const [gain, noise] = v.measures;
    expect(gain).toMatchObject({ id: "m0", mean: 0.2, rejects: 5, outcome: "gain" });
    expect(gain!.floor).toBeCloseTo(2 * Math.sqrt(0.0002), 4);
    expect(noise).toMatchObject({ id: "m1", mean: 0, outcome: "noise" });
    expect(foldVerdict([test(-0.2, 0), test(-0.2, 0), test(-0.21, 0), test(-0.19, 0), test(-0.2, 0)]).measures[0]!.outcome).toBe("loss");
    expect(foldLines(v)[0]).toBe("m0 over 5 fold seeds: mean difference 0.2, floor 0.0283 (2 SD), 5 of 5 paired tests with a change: gain.");
    expect(() => foldVerdict([test(0.2, 0), test(0.2, 0)])).toThrow(/needs 5 or more/);
    expect(() => foldVerdict([test(0.2, 0), { ...test(0.2, 0), measures: [] }])).toThrow(/same measures/);
  });

  it("reads the section paired of the coverage summaries on the command line", () => {
    const dir = mkdtempSync(join(tmpdir(), "paired-"));
    const files = [0.1, 0.12, 0.11, 0.09, 0.1].map((d, i) => {
      const f = join(dir, `c${i}.json`);
      writeFileSync(f, JSON.stringify({ paired: pairedArms([arm("a", "11")], [arm("a", d > 0.1 ? "10" : "01")], { runs: 10 }) }));
      return f;
    });
    const out = join(dir, "v.json");
    const v = foldMain(["--out", out, ...files]);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(v);
    expect(v.seeds).toBe(5);
    writeFileSync(join(dir, "none.json"), "{}");
    expect(() => foldMain(["--out", out, join(dir, "none.json")])).toThrow(/no section paired/);
    expect(() => foldMain(["--out", out])).toThrow(/Start the fold verdict/);
  });

  it("refuses two arms with other measures or other evaluation pairs", () => {
    expect(() => pairedArms([arm("a", "10")], [arm("b", "10")])).toThrow(/same measures/);
    expect(() => pairedArms([arm("a", "10")], [{ id: "a", at: [0, 2], hits: [true, false] }])).toThrow(/same evaluation pairs for a/);
  });
});
