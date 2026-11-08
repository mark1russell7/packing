// The masonry layouts of roadmap item k28. Each test uses made-up seeded inputs. Two small enumerations are the oracles:
// one tries each assignment of cards to columns, the other tries each cut of the sequence. They share no code with the layouts.
import { describe, expect, it } from "vitest";
import {
  checkHard,
  columnBalance,
  columnReading,
  columnsCssBalance,
  columnsLinearPartition,
  masonryDifferencing,
  masonryLpt,
  masonryShortest,
  mulberry32,
  type Item,
  type MasonryLayout,
  type PackInput,
  type PackOutput,
} from "@mark1russell7/packing";

const METHODS: readonly (readonly [string, MasonryLayout])[] = [
  ["masonryShortest", masonryShortest],
  ["masonryLpt", masonryLpt],
  ["masonryDifferencing", masonryDifferencing],
  ["columnsLinearPartition", columnsLinearPartition],
  ["columnsCssBalance", columnsCssBalance],
];

/** This function gives a free input of boxes of width 1 with the heights. */
const wall = (heights: readonly number[]): PackInput => ({
  container: { fixed: "none" },
  items: heights.map((h, index) => ({ id: `i${index}`, w: 1, h })),
});

/** This function gives the height of the tallest column of a layout. */
const tallestOf = (input: PackInput, output: PackOutput, columns: number): number => Math.max(...columnBalance(input, output, { columns }).heights);

/** This function gives whole heights: from 1 to `top`, or near the items of the tight family of Graham when `near` is true. */
function heightsOf(seed: number, count: number, columns: number, near: boolean, top = 20): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => (near ? columns + Math.floor(random() * columns) : 1 + Math.floor(random() * top)));
}

/** This function gives the least tallest column over each assignment of the cards to the columns. The search stops at a worse branch. */
function optimum(heights: readonly number[], columns: number): number {
  const sorted = heights.toSorted((a, b) => b - a);
  const loads = new Array<number>(columns).fill(0);
  let best = sorted.reduce((sum, height) => sum + height, 0);
  const visit = (index: number): void => {
    if (index === sorted.length) {
      best = Math.min(best, Math.max(...loads));
      return;
    }
    const seen = new Set<number>();
    for (let column = 0; column < columns; column++) {
      const load = loads[column]!;
      if (seen.has(load) || load + sorted[index]! >= best) continue;
      seen.add(load);
      loads[column] = load + sorted[index]!;
      visit(index + 1);
      loads[column] = load;
    }
  };
  visit(0);
  return best;
}

/** This function gives the least tallest part over each cut of the sequence, and the least sum of squares of those cuts. */
function bruteCuts(heights: readonly number[], columns: number): { tallest: number; squares: number } {
  let tallest = Infinity;
  let squares = Infinity;
  const visit = (start: number, left: number, high: number, sum: number): void => {
    if (left === 1) {
      const part = heights.slice(start).reduce((total, height) => total + height, 0);
      const top = Math.max(high, part);
      const value = sum + part * part;
      if (top < tallest || (top === tallest && value < squares)) {
        tallest = top;
        squares = value;
      }
      return;
    }
    let part = 0;
    for (let end = start; end <= heights.length; end++) {
      visit(end, left - 1, Math.max(high, part), sum + part * part);
      if (end < heights.length) part += heights[end]!;
    }
  };
  visit(0, columns, 0, 0);
  return { tallest, squares };
}

/** This function gives 200 inputs with fractional sizes, margins, gaps and ranks. */
function mixedInputs(): { input: PackInput; columns: number }[] {
  return Array.from({ length: 200 }, (_, seed) => {
    const random = mulberry32(seed + 1);
    const columns = 1 + Math.floor(random() * 6);
    const count = Math.floor(random() * 30);
    const items = Array.from({ length: count }, (_, index): Item => {
      const item = { id: `i${index}`, w: 1 + random() * 9, h: 1 + random() * 40 };
      const margin = random() < 0.5 ? random() * 3 : { top: random(), right: random() * 2, bottom: random() * 3, left: random() };
      return random() < 0.3 ? { ...item, margin, rank: Math.floor(random() * 10) } : { ...item, margin };
    });
    return { input: { container: { fixed: "none" }, items, gap: random() < 0.5 ? 0 : random() * 4 }, columns };
  });
}

describe("the bounds of Graham", () => {
  const cases = Array.from({ length: 300 }, (_, seed) => {
    const columns = 2 + (seed % 3);
    const count = columns + 1 + (seed % (9 - columns));
    return { columns, heights: heightsOf(seed + 1, count, columns, seed % 2 === 0) };
  });

  it("masonryShortest stays at or under 2 - 1/c of an enumerated optimum", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      if (tallestOf(input, masonryShortest(input, { columns }), columns) > (2 - 1 / columns) * optimum(heights, columns) + 1e-9) breaks += 1;
    }
    expect(breaks).toBe(0);
  });

  it("masonryLpt stays at or under 4/3 - 1/(3c) of an enumerated optimum", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      if (tallestOf(input, masonryLpt(input, { columns }), columns) > (4 / 3 - 1 / (3 * columns)) * optimum(heights, columns) + 1e-9) breaks += 1;
    }
    expect(breaks).toBe(0);
  });

  it("the tight family of list scheduling reaches 2 - 1/c exactly", () => {
    for (let columns = 2; columns <= 6; columns++) {
      const heights = [...new Array<number>(columns * (columns - 1)).fill(1), columns];
      const input = wall(heights);
      // The tallest box and the mean column are both c, and masonryLpt reaches c. Thus the optimum is c.
      expect(tallestOf(input, masonryLpt(input, { columns }), columns)).toBe(columns);
      expect(tallestOf(input, masonryShortest(input, { columns }), columns)).toBe(2 * columns - 1);
    }
  });

  it("the tight family of longest first reaches 4/3 - 1/(3c) exactly", () => {
    for (let columns = 2; columns <= 4; columns++) {
      const heights = [columns];
      for (let height = columns; height < 2 * columns; height++) heights.push(height, height);
      const input = wall(heights);
      expect(optimum(heights, columns)).toBe(3 * columns);
      expect(tallestOf(input, masonryLpt(input, { columns }), columns)).toBe(4 * columns - 1);
    }
  });
});

describe("columnsLinearPartition", () => {
  const cases = Array.from({ length: 300 }, (_, seed) => ({ columns: 1 + (seed % 5), heights: heightsOf(seed + 1000, 1 + (seed % 12), 1, false, 30) }));

  it("gives the tallest column of a brute force over the cuts", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      if (tallestOf(input, columnsLinearPartition(input, { columns }), columns) !== bruteCuts(heights, columns).tallest) breaks += 1;
    }
    expect(breaks).toBe(0);
  });

  it("gives the same tallest column within 1e-9 on fractional heights", () => {
    let worst = 0;
    for (let seed = 0; seed < 300; seed++) {
      const random = mulberry32(seed + 2000);
      const columns = 1 + (seed % 5);
      const heights = Array.from({ length: 1 + (seed % 12) }, () => 0.1 + random() * 30);
      const input = wall(heights);
      worst = Math.max(worst, Math.abs(tallestOf(input, columnsLinearPartition(input, { columns }), columns) - bruteCuts(heights, columns).tallest));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it("takes the least sum of squares of the cuts with the least tallest column", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      const sum = columnBalance(input, columnsLinearPartition(input, { columns }), { columns }).heights.reduce((total, height) => total + height * height, 0);
      if (sum !== bruteCuts(heights, columns).squares) breaks += 1;
    }
    expect(breaks).toBe(0);
  });

  it("does not leave a column empty next to a tall card", () => {
    const heights = [10, ...new Array<number>(10).fill(1)];
    const input = wall(heights);
    expect(columnBalance(input, columnsLinearPartition(input, { columns: 3 }), { columns: 3 }).heights).toEqual([10, 5, 5]);
  });

  it("keeps the input order: each column follows the column to its left", () => {
    const random = mulberry32(5);
    const input = wall(Array.from({ length: 40 }, () => 1 + Math.floor(random() * 20)));
    const placements = columnsLinearPartition(input, { columns: 5 }).placements;
    for (let index = 1; index < placements.length; index++) {
      const before = placements[index - 1]!;
      const after = placements[index]!;
      expect(after.x > before.x || (after.x === before.x && after.y > before.y)).toBe(true);
    }
  });
});

describe("masonryDifferencing", () => {
  const cases = Array.from({ length: 300 }, (_, seed) => {
    const columns = 2 + (seed % 3);
    const count = columns + 1 + (seed % (9 - columns));
    return { columns, heights: heightsOf(seed + 3000, count, columns, seed % 2 === 0) };
  });

  it("balances 8, 7, 6, 5 and 4 in 2 columns better than masonryLpt", () => {
    const heights = [8, 7, 6, 5, 4];
    const input = wall(heights);
    // The joins: 8 with 7, 6 with 5, then 4 with (8, 7) gives (11, 8), and (11, 8) with (6, 5) gives (16, 14).
    expect(optimum(heights, 2)).toBe(15);
    expect(tallestOf(input, masonryDifferencing(input, { columns: 2 }), 2)).toBe(16);
    expect(tallestOf(input, masonryLpt(input, { columns: 2 }), 2)).toBe(17);
  });

  it("stays at or under 4/3 - 1/(3c) of an enumerated optimum", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      if (tallestOf(input, masonryDifferencing(input, { columns }), columns) > (4 / 3 - 1 / (3 * columns)) * optimum(heights, columns) + 1e-9) breaks += 1;
    }
    expect(breaks).toBe(0);
  });

  it("puts the columns in the order of their first card, and each column reads from the top in the input order", () => {
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      const placements = masonryDifferencing(input, { columns }).placements;
      expect(placements[0]!.x).toBe(0);
      const firstAt = new Map<number, number>();
      const lastY = new Map<number, number>();
      for (const [index, placement] of placements.entries()) {
        if (!firstAt.has(placement.x)) firstAt.set(placement.x, index);
        expect(placement.y).toBeGreaterThanOrEqual(lastY.get(placement.x) ?? 0);
        lastY.set(placement.x, placement.y + heights[index]!);
      }
      const lefts = [...firstAt.keys()];
      expect(lefts).toEqual(lefts.toSorted((a, b) => a - b));
    }
  });
});

describe("columnsCssBalance", () => {
  const cases = Array.from({ length: 300 }, (_, seed) => ({ columns: 1 + (seed % 5), heights: heightsOf(seed + 4000, 1 + (seed % 12), 1, false, 30) }));

  /** This function gives the indexes of the cards of each column of a layout, from the left and from the top. */
  const stacksOf = (output: PackOutput): number[][] => {
    const byX = new Map<number, number[]>();
    for (const [index, placement] of output.placements.entries()) byX.set(placement.x, [...(byX.get(placement.x) ?? []), index]);
    return [...byX.entries()].sort((a, b) => a[0] - b[0]).map(([, stack]) => stack);
  };

  it("gives the tallest column of a brute force over the cuts, on whole and fractional heights", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      if (tallestOf(input, columnsCssBalance(input, { columns }), columns) !== bruteCuts(heights, columns).tallest) breaks += 1;
    }
    expect(breaks).toBe(0);
    let worst = 0;
    for (let seed = 0; seed < 300; seed++) {
      const random = mulberry32(seed + 5000);
      const columns = 1 + (seed % 5);
      const heights = Array.from({ length: 1 + (seed % 12) }, () => 0.1 + random() * 30);
      const input = wall(heights);
      worst = Math.max(worst, Math.abs(tallestOf(input, columnsCssBalance(input, { columns }), columns) - bruteCuts(heights, columns).tallest));
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it("fills each column while the cards fit: the first card of a column does not fit in the column to its left", () => {
    let breaks = 0;
    for (const { columns, heights } of cases) {
      const input = wall(heights);
      const output = columnsCssBalance(input, { columns });
      const tallest = tallestOf(input, output, columns);
      const stacks = stacksOf(output);
      for (let column = 0; column + 1 < stacks.length; column++) {
        const height = stacks[column]!.reduce((sum, index) => sum + heights[index]!, 0);
        if (height + heights[stacks[column + 1]![0]!]! <= tallest) breaks += 1;
      }
    }
    expect(breaks).toBe(0);
  });

  it("fills the first columns, where columnsLinearPartition balances the last columns", () => {
    const heights = [10, ...new Array<number>(10).fill(1)];
    const input = wall(heights);
    expect(columnBalance(input, columnsCssBalance(input, { columns: 3 }), { columns: 3 }).heights).toEqual([10, 10, 0]);
    expect(columnBalance(input, columnsLinearPartition(input, { columns: 3 }), { columns: 3 }).heights).toEqual([10, 5, 5]);
  });

  it("keeps the input order: each column follows the column to its left", () => {
    const random = mulberry32(6);
    const input = wall(Array.from({ length: 40 }, () => 1 + Math.floor(random() * 20)));
    const placements = columnsCssBalance(input, { columns: 5 }).placements;
    for (let index = 1; index < placements.length; index++) {
      const before = placements[index - 1]!;
      const after = placements[index]!;
      expect(after.x > before.x || (after.x === before.x && after.y > before.y)).toBe(true);
    }
  });
});

describe("the rules of a layout", () => {
  const inputs = mixedInputs();

  it.each(METHODS)("%s places each item once, in a column, with no overlap", (_, method) => {
    for (const { input, columns } of inputs) {
      const output = method(input, { columns });
      expect(output.placements.map((p) => p.id)).toEqual(input.items.map((item) => item.id));
      expect(output.overflow).toEqual([]);
      expect(checkHard(input, output)).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      const widest = Math.max(0, ...input.items.map((item) => item.w + marginWidth(item)));
      const pitch = widest + (input.gap ?? 0);
      for (const [index, placement] of output.placements.entries()) {
        const item = input.items[index]!;
        const column = Math.round((placement.x - marginLeft(item)) / pitch);
        expect(column).toBeGreaterThanOrEqual(0);
        expect(column).toBeLessThan(columns);
        expect(Math.abs(placement.x - marginLeft(item) - column * pitch)).toBeLessThan(1e-9);
      }
    }
  });

  it.each(METHODS)("%s gives equal bytes on a second call and does not change its input", (_, method) => {
    for (const { input, columns } of inputs) {
      const before = JSON.stringify(input);
      expect(JSON.stringify(method(input, { columns }))).toBe(JSON.stringify(method(input, { columns })));
      expect(JSON.stringify(input)).toBe(before);
    }
  });

  it.each(METHODS)("%s sizes the wall from the columns and the gap", (_, method) => {
    const input: PackInput = { container: { fixed: "none" }, gap: 2, items: [{ id: "a", w: 3, h: 4 }] };
    expect(method(input, { columns: 3, columnWidth: 5 })).toEqual({
      placements: [{ id: "a", x: 0, y: 0 }],
      overflow: [],
      size: { w: 19, h: 4 },
      moved: [],
    });
  });

  it.each(METHODS)("%s gives an empty layout for no items", (_, method) => {
    expect(method(wall([]), { columns: 3 })).toEqual({ placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] });
  });

  it.each(METHODS)("%s puts a stack of cards a gap apart", (_, method) => {
    const input: PackInput = { container: { fixed: "none" }, gap: 3, items: [{ id: "a", w: 1, h: 2 }, { id: "b", w: 1, h: 5, margin: 1 }] };
    const output = method(input, { columns: 1 });
    expect(output.size.h).toBe(12);
    expect(checkHard(input, output)["no-overlap"]).toBe(0);
  });

  it.each(METHODS)("%s refuses what a column layout cannot keep", (_, method) => {
    const good = wall([1, 2]);
    expect(() => method(good, { columns: 0 })).toThrow(RangeError);
    expect(() => method(good, { columns: 1.5 })).toThrow(RangeError);
    expect(() => method(good, { columns: 2, columnWidth: 0.5 })).toThrow(RangeError);
    expect(() => method(good, { columns: 2, columnWidth: Infinity })).toThrow(RangeError);
    expect(() => method({ ...good, container: { fixed: "width", w: 9 } }, { columns: 2 })).toThrow(RangeError);
    expect(() => method({ ...good, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] }, { columns: 2 })).toThrow(RangeError);
    expect(() => method({ ...good, pairGaps: [{ a: "i0", b: "i1", gap: 1 }] }, { columns: 2 })).toThrow(RangeError);
    expect(() => method(wall([0]), { columns: 2 })).toThrow(RangeError);
    expect(() => method(wall([Number.NaN]), { columns: 2 })).toThrow(RangeError);
    expect(() => method({ ...good, items: [{ id: "l", w: 1, h: 1, x: 0, y: 0, locked: true }] }, { columns: 2 })).toThrow(RangeError);
  });

  it("masonryShortest takes the left column of equal columns, and it reads the ranks", () => {
    expect(masonryShortest(wall([1, 1, 1, 1]), { columns: 2 }).placements).toEqual([
      { id: "i0", x: 0, y: 0 },
      { id: "i1", x: 1, y: 0 },
      { id: "i2", x: 0, y: 1 },
      { id: "i3", x: 1, y: 1 },
    ]);
    const ranked: PackInput = { container: { fixed: "none" }, items: [{ id: "late", w: 1, h: 1, rank: 2 }, { id: "early", w: 1, h: 1, rank: 1 }] };
    expect(masonryShortest(ranked, { columns: 2 }).placements).toEqual([
      { id: "late", x: 1, y: 0 },
      { id: "early", x: 0, y: 0 },
    ]);
  });

  it("masonryLpt puts the tallest box first, and equal boxes keep the input order", () => {
    expect(masonryLpt(wall([2, 7, 2]), { columns: 2 }).placements).toEqual([
      { id: "i0", x: 1, y: 0 },
      { id: "i1", x: 0, y: 0 },
      { id: "i2", x: 1, y: 2 },
    ]);
  });

  it("each method copes with more columns than items, and with a wall of 5000 items", () => {
    const random = mulberry32(9);
    const large = wall(Array.from({ length: 5000 }, () => 1 + Math.floor(random() * 100)));
    for (const [, method] of METHODS) {
      expect(columnBalance(wall([3, 4]), method(wall([3, 4]), { columns: 5 }), { columns: 5 }).heights.toSorted((a, b) => b - a)).toEqual([4, 3, 0, 0, 0]);
      expect(checkHard(large, method(large, { columns: 8 }))["no-overlap"]).toBe(0);
    }
  });
});

describe("columnBalance", () => {
  it("gives 0 for level columns, 1 with an empty column, and the share between", () => {
    const level = wall([2, 2]);
    expect(columnBalance(level, masonryShortest(level, { columns: 2 }), { columns: 2 })).toEqual({ heights: [2, 2], balance: 0 });
    expect(columnBalance(level, masonryShortest(level, { columns: 3 }), { columns: 3 }).balance).toBe(1);
    const steps = wall([4, 3]);
    expect(columnBalance(steps, masonryShortest(steps, { columns: 2 }), { columns: 2 })).toEqual({ heights: [4, 3], balance: 0.25 });
    expect(columnBalance(wall([]), masonryShortest(wall([]), { columns: 2 }), { columns: 2 })).toEqual({ heights: [0, 0], balance: 0 });
  });

  it("does not count the gap under the last box, and it counts the bottom margin", () => {
    const input: PackInput = { container: { fixed: "none" }, gap: 5, items: [{ id: "a", w: 1, h: 2, margin: 1 }, { id: "b", w: 1, h: 2, margin: 1 }] };
    expect(columnBalance(input, masonryShortest(input, { columns: 1 }), { columns: 1 }).heights).toEqual([13]);
  });

  it("refuses an item that is not on a column", () => {
    const input = wall([1]);
    const away: PackOutput = { placements: [{ id: "i0", x: 50, y: 0 }], overflow: [], size: { w: 2, h: 1 }, moved: [] };
    expect(() => columnBalance(input, away, { columns: 2 })).toThrow(RangeError);
  });
});

describe("columnReading", () => {
  it("gives 0 for the input order and 1 for the reverse order", () => {
    const input = wall([1, 1, 1, 1]);
    const rows = masonryShortest(input, { columns: 1 });
    expect(columnReading(input, rows)).toEqual({ inversions: 0, inversionShare: 0, footrule: 0, footruleShare: 0, largestMove: 0 });
    const reverse = { ...rows, placements: rows.placements.map((p, index) => ({ ...p, y: 3 - index })) };
    expect(columnReading(input, reverse)).toEqual({ inversions: 6, inversionShare: 1, footrule: 8, footruleShare: 1, largestMove: 3 });
  });

  it("gives the known values of two columns of two", () => {
    const input = wall([1, 1, 1, 1]);
    expect(columnReading(input, masonryShortest(input, { columns: 2 })).footrule).toBe(0);
    const reading = columnReading(input, columnsLinearPartition(input, { columns: 2 }));
    expect(reading).toEqual({ inversions: 1, inversionShare: 1 / 6, footrule: 2, footruleShare: 0.25, largestMove: 1 });
  });

  it("uses the ranks, and it skips an item with no placement", () => {
    const input: PackInput = { container: { fixed: "none" }, items: [{ id: "b", w: 1, h: 1, rank: 1 }, { id: "a", w: 1, h: 1, rank: 0 }, { id: "c", w: 1, h: 1, rank: 2 }] };
    const output: PackOutput = { placements: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 1 }], overflow: ["c"], size: { w: 1, h: 2 }, moved: [] };
    expect(columnReading(input, output).footrule).toBe(0);
    expect(columnReading(wall([]), { placements: [], overflow: [], size: { w: 0, h: 0 }, moved: [] }).footruleShare).toBe(0);
  });

  it("gives 0 for masonryShortest with equal top margins, because the tops follow the input order", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const columns = 1 + (seed % 6);
      const input: PackInput = { ...wall(heightsOf(seed + 4000, 40, 1, false, 50)), gap: seed % 3 };
      expect(columnReading(input, masonryShortest(input, { columns })).footrule).toBe(0);
    }
  });

  it("keeps the footrule between one and two times the inversions (Diaconis 1977)", () => {
    for (const { input, columns } of mixedInputs()) {
      for (const [, method] of METHODS) {
        const { inversions, footrule } = columnReading(input, method(input, { columns }));
        expect(footrule).toBeGreaterThanOrEqual(inversions);
        expect(footrule).toBeLessThanOrEqual(2 * inversions);
      }
    }
  });
});

describe("the trade of order and balance on one family", () => {
  /** This function gives the mean measures of a method over 200 inputs of 60 items in 4 columns, with whole heights from 1 to 100. */
  function meansOf(method: MasonryLayout): { footrule: number; balance: number } {
    let footrule = 0;
    let balance = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const input = wall(heightsOf(seed + 3000, 60, 1, false, 100));
      const output = method(input, { columns: 4 });
      footrule += columnReading(input, output).footruleShare;
      balance += columnBalance(input, output, { columns: 4 }).balance;
    }
    return { footrule: footrule / 200, balance: balance / 200 };
  }

  it("each method reads as its model tells, and longest first is the most level", () => {
    const shortest = meansOf(masonryShortest);
    const longest = meansOf(masonryLpt);
    const ordered = meansOf(columnsLinearPartition);
    expect(longest.footrule).toBeGreaterThanOrEqual(0.6);
    expect(longest.footrule).toBeLessThanOrEqual(0.72);
    expect(ordered.footrule).toBeGreaterThanOrEqual(0.53);
    expect(ordered.footrule).toBeLessThanOrEqual(0.63);
    expect(shortest.footrule).toBeLessThan(0.15);
    expect(longest.balance).toBeLessThan(ordered.balance);
    expect(ordered.balance).toBeLessThan(shortest.balance);
  });
});

/** This function gives the left margin of an item of `mixedInputs`. */
function marginLeft(item: Item): number {
  return typeof item.margin === "number" ? item.margin : (item.margin?.left ?? 0);
}

/** This function gives the width of the margins of an item of `mixedInputs`. */
function marginWidth(item: Item): number {
  return typeof item.margin === "number" ? 2 * item.margin : (item.margin?.left ?? 0) + (item.margin?.right ?? 0);
}
