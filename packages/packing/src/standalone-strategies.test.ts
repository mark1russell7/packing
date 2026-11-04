import { allStrategies, checkHard, outputHash, packWith, standaloneStrategies, sideAnchorsStrategy, STANDALONE_MAX_ITEMS, UnsupportedCell, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { STANDALONE_ENTRIES } from "../bench/entries.ts";

// The standalone strategies of roadmap item k141. Made-up inputs only.

const SIDES = [4, 3, 2, 5, 1, 3, 2, 4];
const items = SIDES.map((w, i) => ({ id: `i${i}`, w, h: SIDES[(i + 3) % SIDES.length]! }));

const strip: PackInput = { container: { fixed: "width", w: 10 }, items };
const free: PackInput = { container: { fixed: "none" }, items };
const fixed: PackInput = { container: { fixed: "size", w: 16, h: 16 }, items };

/** The ids of the strategies that take each input of a cell, and the input. */
const INPUTS: readonly (readonly [string, PackInput])[] = [
  ["sleator", strip],
  ["exact-strip", strip],
  ["binary-height", strip],
  ["near-rects", strip],
  ["near-rects", fixed],
  ["raster-nofit", strip],
  ["raster-nofit", fixed],
  ["masonry", free],
  ["treemap", free],
  ["side-anchors", strip],
  ["side-anchors", fixed],
];

/** This function gives the sum of the breaks of the hard rules of an output. */
const breaks = (input: PackInput, output: PackOutput): number => Object.values(checkHard(input, output)).reduce((sum, value) => sum + value, 0);

describe("the standalone strategies", () => {
  it("are single strategies of allStrategies, and side-anchors is a composite", () => {
    const kinds = new Map(allStrategies.map((s) => [s.id, s.kind]));
    expect(standaloneStrategies.map((s) => kinds.get(s.id))).toEqual(standaloneStrategies.map(() => "single"));
    expect(kinds.get(sideAnchorsStrategy.id)).toBe("composite");
  });

  it.each(INPUTS)("%s places each item with no hard break", (id, input) => {
    const output = packWith(id, input);
    expect(output.overflow).toEqual([]);
    expect(output.placements).toHaveLength(input.items.length);
    expect(breaks(input, output)).toBe(0);
  });

  it.each(INPUTS)("%s gives the same bytes for the same seed", (id, input) => {
    expect(outputHash(packWith(id, input, undefined, 7))).toBe(outputHash(packWith(id, input, undefined, 7)));
  });

  it.each(STANDALONE_ENTRIES.map((e) => [e.id, e] as const))("the entry %s packs an input of its cell", (_, entry) => {
    const input = entry.strategy === "masonry" || entry.strategy === "treemap" ? free : strip;
    const output = packWith(entry.strategy, input, entry.options);
    expect(output.placements).toHaveLength(input.items.length);
    expect(breaks(input, output)).toBe(0);
  });

  it("anchors the first item at the side", () => {
    const output = packWith("side-anchors", strip, { first: { side: "left", at: 0.5 } });
    expect(output.placements.find((p) => p.id === "i0")!.x).toBe(0);
    expect(breaks(strip, output)).toBe(0);
  });

  it("gives the layout of the member with no anchor", () => {
    expect(outputHash(packWith("side-anchors", fixed))).toBe(outputHash(packWith("maxrects", fixed, { rule: "bl" })));
  });

  it("gives an UnsupportedCell for an input outside the cells", () => {
    for (const id of ["sleator", "exact-strip", "binary-height"]) expect(() => packWith(id, free), id).toThrow(UnsupportedCell);
    for (const id of ["masonry", "treemap"]) expect(() => packWith(id, strip), id).toThrow(UnsupportedCell);
  });

  it("gives an UnsupportedCell for an input that a function refuses", () => {
    const gapped: PackInput = { ...strip, gap: 1 };
    for (const id of ["sleator", "exact-strip", "binary-height", "near-rects", "raster-nofit"]) expect(() => packWith(id, gapped), id).toThrow(UnsupportedCell);
  });

  it("refuses a count of items above the limit of a search", () => {
    const many: PackInput = { ...strip, items: Array.from({ length: STANDALONE_MAX_ITEMS + 1 }, (_, i) => ({ id: `m${i}`, w: 1, h: 1 })) };
    for (const id of ["binary-height", "near-rects", "raster-nofit"]) expect(() => packWith(id, many), id).toThrow(UnsupportedCell);
  });

  it("packs shapes with near-rects and raster-nofit", () => {
    const shapes: PackInput = { container: { fixed: "width", w: 12 }, items: [{ id: "c", w: 4, h: 4, shape: { kind: "circle", cx: 2, cy: 2, r: 2 } }, ...items.slice(0, 2)] };
    for (const id of ["near-rects", "raster-nofit"]) expect(packWith(id, shapes).placements, id).toHaveLength(3);
  });
});
