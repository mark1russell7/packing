import { describe, expect, it } from "vitest";
import { packWith, type PackInput } from "../src/index.ts";
import { fillOf } from "../src/measures.ts";
import { baseLines, coarsePack, coarseUnit, entryArms, logSlope, scaleInput, widthLines, widthShare, type WidthRow } from "./skyline-width.ts";

/** This function makes one row of an arm with a time that grows by a power of the scale. */
function row(scale: number, seed: number, power: number): WidthRow {
  return { form: "freeArea", sizes: "uniform", count: 100, scale, seed, arm: "a", ms: 2 * seed * scale ** power, runs: 5, fill: 0.9, widths: 0 };
}

describe("the read of the time against the width", () => {
  it("scales the sizes of the items and of the container, and not the aspect", () => {
    const scaled = scaleInput({ container: { fixed: "width", w: 10, aspect: 2 }, items: [{ id: "a", w: 3, h: 4 }] }, 4);
    expect(scaled.container).toEqual({ fixed: "width", w: 40, aspect: 2 });
    expect(scaled.items).toEqual([{ id: "a", w: 12, h: 16 }]);
  });

  it("refuses an input with a part that it does not scale", () => {
    expect(() => scaleInput({ container: { fixed: "none" }, items: [], gap: 1 }, 2)).toThrow(RangeError);
    const margin = { id: "a", w: 1, h: 1, margin: 1 } as Parameters<typeof scaleInput>[0]["items"][number];
    expect(() => scaleInput({ container: { fixed: "none" }, items: [margin] }, 2)).toThrow(RangeError);
  });

  it("reads the slope of a known power, and 0 for a flat arm", () => {
    expect(logSlope(5, 5 * 64, 1, 64)).toBeCloseTo(1);
    expect(logSlope(5, 5, 1, 64)).toBeCloseTo(0);
  });

  it("gives all of the time to the width on a line through 0, and none on a flat line", () => {
    expect(widthShare(2, 128, 1, 64)).toBeCloseTo(1);
    expect(widthShare(5, 5, 1, 64)).toBe(0);
    expect(widthShare(5, 4, 1, 64)).toBe(0);
  });

  it("reads only the scales with a row for each seed", () => {
    const seeds = [1, 2, 3];
    const rows = [...seeds.flatMap((seed) => [row(1, seed, 1), row(4, seed, 1)]), row(16, 1, 1)];
    const [line] = widthLines(rows, seeds);
    expect(line!.largest).toBe(4);
    expect(line!.slope.median).toBeCloseTo(1);
    expect(line!.ms["16"]).toBe(32);
  });

  it("gives no line with fewer than 2 full scales", () => {
    expect(widthLines([row(1, 1, 1)], [1, 2])).toEqual([]);
  });

  it("gives the median of the fill and of the tried widths at each scale", () => {
    const seeds = [1, 2, 3];
    const rows = seeds.flatMap((seed) => [{ ...row(1, seed, 1), fill: 0.5 + seed / 10, widths: 40 + seed }, { ...row(4, seed, 1), widths: 70 }]);
    const [line] = widthLines(rows, seeds);
    expect(line!.fill["1"]).toBeCloseTo(0.7);
    expect(line!.widths).toEqual({ "1": 42, "4": 70 });
  });

  it("reads the time over the base per seed, at scale 1 only", () => {
    const rows = [1, 2, 3].flatMap((seed) => [
      { ...row(1, seed, 1), arm: "base", ms: 10 },
      { ...row(1, seed, 1), arm: "new", ms: 10 + seed },
      { ...row(4, seed, 1), arm: "new", ms: 1000 },
    ]);
    expect(baseLines(rows, "new", "base")).toEqual([{ form: "freeArea", sizes: "uniform", count: 100, ratio: 1.2 }]);
    expect(baseLines(rows, "new", "absent")).toEqual([]);
  });
});

describe("entryArms", () => {
  it("gives an arm for each entry, with the pack of the runner", () => {
    expect(entryArms(["anneal-skyline-k16", "bbox-skyline"])).toEqual([
      { name: "anneal-skyline-k16", entry: "anneal-skyline-k16" },
      { name: "bbox-skyline", entry: "bbox-skyline" },
    ]);
  });
});

describe("the control of the read", () => {
  const input: PackInput = {
    container: { fixed: "width", w: 2000 },
    items: Array.from({ length: 60 }, (_, i) => ({ id: String(i), w: 37 + (i * 41) % 200, h: 23 + (i * 29) % 150 })),
  };

  it("keeps the count of cells when the input scales", () => {
    const small = coarseUnit(input);
    expect(coarseUnit(scaleInput(input, 64)) / small).toBeCloseTo(64);
  });

  it("gives each item a place and a worse fill than the entry that it copies", () => {
    const output = coarsePack(input, 1);
    expect(output.placements.length).toBe(input.items.length);
    expect(fillOf(input, output)).toBeLessThan(fillOf(input, packWith("skyline", input, undefined, 1)));
  });
});
