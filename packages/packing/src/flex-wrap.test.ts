// The flexbox wrap of roadmap item k28. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import {
  checkHard,
  FLEX_ALIGN,
  FLEX_JUSTIFY,
  flexWrap,
  flexWrapRefusal,
  mulberry32,
  type FlexAlign,
  type FlexJustify,
  type Item,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[], gap?: number): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
  ...(gap === undefined ? {} : { gap }),
});

/** This function gives the place `[x, y]` of each item, by id. */
const placesOf = (output: PackOutput): Record<string, readonly [number, number]> =>
  Object.fromEntries(output.placements.map((p) => [p.id, [p.x, p.y] as const]));

/** This function gives a made-up strip with a gap, margins on some items and ranks on some items. Each box fits the width. */
function drawn(seed: number, count: number, W: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const margin = random() < 0.3 ? Math.floor(random() * 3) : 0;
    const w = 0.5 + random() * (W - 2 * margin - 0.5);
    const h = 0.5 + random() * 40;
    const item: Item = { id: `i${i}`, w, h, ...(margin > 0 ? { margin } : {}) };
    items.push(random() < 0.2 ? { ...item, rank: Math.floor(random() * count) } : item);
  }
  return { container: { fixed: "width", w: W }, items, gap: Math.floor(random() * 3) };
}

/** This function counts the hard rules that a layout breaks. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(checkHard(input, output)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function gives the rows of the next-fit shelf in the reading order, as lists of ids. It is the oracle of the breaks. */
function nextFitRows(input: PackInput): string[][] {
  const W = input.container.w!;
  const gap = input.gap ?? 0;
  const order = input.items.map((item, index) => ({ item, index })).toSorted((a, b) => (a.item.rank ?? a.index) - (b.item.rank ?? b.index) || a.index - b.index);
  const rows: string[][] = [];
  let used = 0;
  for (const { item } of order) {
    const m = typeof item.margin === "number" ? item.margin : 0;
    const outer = item.w + 2 * m;
    if (rows.length > 0 && used + gap + outer <= W) {
      rows.at(-1)!.push(item.id);
      used += gap + outer;
    } else {
      rows.push([item.id]);
      used = outer;
    }
  }
  return rows;
}

describe("flexWrap", () => {
  it("breaks the rows as the next-fit shelf in the input order", () => {
    const { output, rows, free } = flexWrap(strip(10, [[4, 2], [4, 3], [4, 1], [3, 2]]));
    expect(rows).toBe(2);
    expect(free).toEqual([2, 3]);
    expect(placesOf(output)).toEqual({ i0: [0, 0], i1: [4, 0], i2: [0, 3], i3: [4, 3] });
    expect(output.size).toEqual({ w: 10, h: 5 });
  });

  it("puts the space that is left in a row by each justify rule", () => {
    // Two boxes of widths 2 and 3 with a gap of 1 leave 4 of the width 10.
    const input = strip(10, [[2, 1], [3, 1]], 1);
    const xs = (justify: FlexJustify): number[] => flexWrap(input, { justify }).output.placements.map((p) => p.x);
    expect(xs("start")).toEqual([0, 3]);
    expect(xs("center")).toEqual([2, 5]);
    expect(xs("end")).toEqual([4, 7]);
    expect(xs("between")).toEqual([0, 7]);
    expect(xs("around")).toEqual([1, 6]);
    const evenly = xs("evenly");
    expect(evenly[0]).toBeCloseTo(4 / 3, 12);
    expect(evenly[1]).toBeCloseTo(17 / 3, 12);
  });

  it("keeps one box of a row at the start with between, and centers it with around and evenly", () => {
    const input = strip(10, [[4, 1]]);
    expect(flexWrap(input, { justify: "between" }).output.placements[0]!.x).toBe(0);
    expect(flexWrap(input, { justify: "around" }).output.placements[0]!.x).toBe(3);
    expect(flexWrap(input, { justify: "evenly" }).output.placements[0]!.x).toBe(3);
  });

  it("puts each box in the height of its row by each align rule", () => {
    const input = strip(10, [[2, 2], [2, 6]]);
    const ys = (align: FlexAlign): number[] => flexWrap(input, { align }).output.placements.map((p) => p.y);
    expect(ys("start")).toEqual([0, 0]);
    expect(ys("center")).toEqual([2, 0]);
    expect(ys("end")).toEqual([4, 0]);
  });

  it("counts the margins in the outer box and puts one gap between the rows", () => {
    const input: PackInput = {
      container: { fixed: "width", w: 10 },
      items: [
        { id: "a", w: 2, h: 2, margin: 1 },
        { id: "b", w: 4, h: 1 },
        { id: "c", w: 3, h: 3 },
      ],
      gap: 1,
    };
    // a is 4 wide with its margins, so a, the gap and b fill 9 of 10. c goes to the next row, one gap under the height 4 of a.
    const { output, rows } = flexWrap(input);
    expect(rows).toBe(2);
    expect(placesOf(output)).toEqual({ a: [1, 1], b: [5, 0], c: [0, 5] });
    expect(output.size).toEqual({ w: 10, h: 8 });
    expect(hardBreaks(input, output)).toBe(0);
    // The count of the hard rules sees a box that moves into the margin of the box before it. It does not read `gap`.
    const moved = { ...output, placements: output.placements.map((p) => (p.id === "b" ? { ...p, x: 3.5 } : p)) };
    expect(hardBreaks(input, moved)).toBeGreaterThan(0);
  });

  it("takes the reading order of the ranks", () => {
    const input: PackInput = {
      container: { fixed: "width", w: 5 },
      items: [
        { id: "a", w: 3, h: 1, rank: 2 },
        { id: "b", w: 3, h: 1, rank: 0 },
        { id: "c", w: 2, h: 1, rank: 1 },
      ],
    };
    expect(placesOf(flexWrap(input).output)).toEqual({ b: [0, 0], c: [3, 0], a: [0, 1] });
  });

  it("gives an empty layout for no items", () => {
    const { output, rows, free } = flexWrap({ container: { fixed: "width", w: 7 }, items: [] });
    expect(output).toEqual({ placements: [], overflow: [], size: { w: 7, h: 0 }, moved: [] });
    expect(rows).toBe(0);
    expect(free).toEqual([]);
  });

  it("refuses an input that it cannot keep, and an unknown rule", () => {
    const item = { id: "a", w: 2, h: 1 };
    expect(flexWrapRefusal({ container: { fixed: "none" }, items: [item] })).toMatch(/fixed "width"/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 0 }, items: [item] })).toMatch(/positive and finite/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 5 }, items: [item], obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] })).toMatch(/obstacles/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 5 }, items: [{ ...item, locked: true, x: 0, y: 0 }] })).toMatch(/locked/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 5 }, items: [{ ...item, margin: 2 }] })).toMatch(/wider than the container/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 5 }, items: [item], gap: -1 })).toMatch(/gap/);
    expect(flexWrapRefusal({ container: { fixed: "width", w: 5 }, items: [item] })).toBeNull();
    expect(() => flexWrap({ container: { fixed: "none" }, items: [item] })).toThrow(RangeError);
    expect(() => flexWrap({ container: { fixed: "width", w: 5 }, items: [item] }, { justify: "stretch" as FlexJustify })).toThrow(/justify rule/);
    expect(() => flexWrap({ container: { fixed: "width", w: 5 }, items: [item] }, { align: "baseline" as FlexAlign })).toThrow(/align rule/);
  });

  it("keeps the hard rules and the breaks of the oracle on made-up strips, for each rule", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = drawn(seed, 1 + (seed % 17), 20 + (seed % 7));
      const breaks = nextFitRows(input);
      const base = flexWrap(input);
      for (const justify of FLEX_JUSTIFY) {
        for (const align of FLEX_ALIGN) {
          const { output, rows, free } = flexWrap(input, { justify, align });
          expect(hardBreaks(input, output), `seed ${seed} ${justify} ${align}`).toBe(0);
          expect(rows).toBe(breaks.length);
          expect(free).toEqual(base.free);
          expect(output.size).toEqual(base.output.size);
          expect(output.overflow).toEqual([]);
          // Each row keeps the reading order from the left, with at least one gap between the outer boxes, in the width.
          // checkHard does not read `gap`, so this loop checks it.
          const gap = input.gap ?? 0;
          for (const row of breaks) {
            const outer = row.map((id) => {
              const item = input.items.find((it) => it.id === id)!;
              const m = typeof item.margin === "number" ? item.margin : 0;
              const x = output.placements.find((p) => p.id === id)!.x - m;
              return [x, x + item.w + 2 * m] as const;
            });
            expect(outer[0]![0]).toBeGreaterThanOrEqual(-1e-9);
            expect(outer.at(-1)![1]).toBeLessThanOrEqual(input.container.w! + 1e-9);
            for (let k = 1; k < outer.length; k++) expect(outer[k]![0] - outer[k - 1]![1]).toBeGreaterThanOrEqual(gap - 1e-9);
          }
        }
      }
      expect(flexWrap(input, { justify: "evenly", align: "center" })).toEqual(flexWrap(input, { justify: "evenly", align: "center" }));
    }
  });
});
