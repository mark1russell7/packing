// The justified rows of roadmap item k28. Each test uses made-up inputs.
import { packHard, sizeFits } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { JUSTIFIED_METHODS, justifiedRows, justifiedRowsRefusal, mulberry32, type Item, type JustifiedMethod, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** This function gives an item that can scale from a quarter of its size to four times its size, with its ratio. */
const photo = (id: string, w: number, h: number, extra: Partial<Item> = {}): Item => ({
  id,
  w,
  h,
  resize: { minW: w / 4, maxW: 4 * w, minH: h / 4, maxH: 4 * h, aspect: "keep" },
  ...extra,
});

/** This function gives a strip of the width `W` with the items. */
const strip = (W: number, items: readonly Item[], gap?: number): PackInput => ({ container: { fixed: "width", w: W }, items, ...(gap === undefined ? {} : { gap }) });

/** This function counts the hard rules that a layout breaks, with `size-kept` of the contract. The contract reads the items as the boxes of a layout input. */
const hardBreaks = (input: PackInput, output: PackOutput): number =>
  Object.values(
    packHard({ schema: "layout-input/1", id: "test", container: input.container, boxes: input.items, ...(input.gap === undefined ? {} : { gap: input.gap }) }, output),
  ).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function gives the ids of each row, from the top, by the `y` of the placements. */
function rowsOf(input: PackInput, output: PackOutput): string[][] {
  const rows = new Map<number, string[]>();
  for (const p of output.placements) {
    const m = input.items.find((i) => i.id === p.id)!.margin;
    const top = p.y - (typeof m === "number" ? m : 0);
    const key = [...rows.keys()].find((k) => Math.abs(k - top) < 1e-9) ?? top;
    rows.set(key, [...(rows.get(key) ?? []), p.id]);
  }
  return [...rows.entries()].toSorted((a, b) => a[0] - b[0]).map(([, ids]) => ids);
}

/** This function gives the height that makes a row of the items `ids` as wide as the strip. */
function fillOf(input: PackInput, ids: readonly string[]): number {
  const items = ids.map((id) => input.items.find((i) => i.id === id)!);
  const sides = items.reduce((sum, i) => sum + 2 * (typeof i.margin === "number" ? i.margin : 0), 0);
  const ratio = items.reduce((sum, i) => sum + i.w / i.h, 0);
  return (input.container.w! - (input.gap ?? 0) * (items.length - 1) - sides) / ratio;
}

/** This function gives a made-up strip of photos with a gap, margins on some items and ranks on some items. */
function drawn(seed: number, count: number, W: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const margin = random() < 0.3 ? Math.floor(random() * 3) : 0;
    const h = 20 + random() * 40;
    const w = h * (0.5 + random() * 1.5);
    const item = photo(`i${i}`, w, h, margin > 0 ? { margin } : {});
    items.push(random() < 0.2 ? { ...item, rank: Math.floor(random() * count) } : item);
  }
  return strip(W, items, Math.floor(random() * 3));
}

describe("justifiedRows", () => {
  it("scales a row of two photos to the width of the strip, with the ratio of each photo", () => {
    // The ratios are 2 and 1, so a row of 30 at a gap of 0 has the height 10: the boxes are 20 by 10 and 10 by 10.
    const input = strip(30, [photo("a", 40, 20), photo("b", 20, 20)]);
    const { output, rows, heights, free } = justifiedRows(input, { targetHeight: 12 });
    expect(rows).toBe(1);
    expect(heights).toEqual([10]);
    expect(free).toEqual([0]);
    expect(output.placements).toEqual([
      { id: "a", x: 0, y: 0, w: 20, h: 10 },
      { id: "b", x: 20, y: 0, w: 10, h: 10 },
    ]);
    expect(output.size).toEqual({ w: 30, h: 10 });
    expect(hardBreaks(input, output)).toBe(0);
  });

  it("gives each full row the width of the strip, and keeps each layout inside the hard rules and the size bounds", () => {
    for (const method of JUSTIFIED_METHODS) {
      for (let seed = 1; seed <= 25; seed++) {
        const input = drawn(seed, 5 + (seed % 30), 300);
        const result = justifiedRows(input, { method, targetHeight: 40 });
        expect(hardBreaks(input, result.output), `${method} seed ${seed}`).toBe(0);
        expect(result.output.overflow).toEqual([]);
        for (const p of result.output.placements) {
          const item = input.items.find((i) => i.id === p.id)!;
          expect(sizeFits(item, p.w ?? item.w, p.h ?? item.h), `${method} seed ${seed} ${p.id}`).toBe(true);
        }
        // Each row but the last fills the strip: the bounds of 4 times the size do not stop a row near the target height of 40.
        for (const spare of result.free.slice(0, -1)) expect(spare).toBeCloseTo(0, 9);
        expect(result.heights).toHaveLength(result.rows);
      }
    }
  });

  it("keeps the reading order: by rank, then by the position, row after row", () => {
    for (const method of JUSTIFIED_METHODS) {
      const input = drawn(7, 30, 300);
      const { output } = justifiedRows(input, { method, targetHeight: 40 });
      const order = input.items.map((item, index) => ({ id: item.id, key: item.rank ?? index, index })).toSorted((a, b) => a.key - b.key || a.index - b.index);
      const byRow = rowsOf(input, output).map((ids) => ids.toSorted((a, b) => output.placements.find((p) => p.id === a)!.x - output.placements.find((p) => p.id === b)!.x));
      expect(byRow.flat()).toEqual(order.map((o) => o.id));
    }
  });

  it("keeps a short last row at the target height, and does not stretch it", () => {
    const input = strip(100, [photo("a", 50, 25), photo("b", 50, 25), photo("c", 20, 20)]);
    const { output, heights, free } = justifiedRows(input, { targetHeight: 25 });
    expect(heights).toEqual([25, 25]);
    expect(output.placements.find((p) => p.id === "c")).toEqual({ id: "c", x: 0, y: 25, w: 25, h: 25 });
    expect(free).toEqual([0, 75]);
  });

  it("gives a box without resize its own size, and its row keeps width when the box stops it", () => {
    // The fixed box of height 10 stops the row at 10, under the fill height 40 / 3, so the row keeps 10 of width.
    const input = strip(40, [{ id: "a", w: 10, h: 10 }, photo("b", 20, 10)]);
    const { output, heights, free } = justifiedRows(input, { targetHeight: 10 });
    expect(heights).toEqual([10]);
    expect(free).toEqual([10]);
    expect(output.placements[0]).toEqual({ id: "a", x: 0, y: 0 });
    expect(hardBreaks(input, output)).toBe(0);
  });

  it("chooses breaks with a cost of the line breaking at most the cost of the greedy breaks", () => {
    const cost = (input: PackInput, rows: readonly string[][], target: number): number =>
      rows.reduce((sum, ids, i) => {
        const change = fillOf(input, ids) / target - 1;
        return sum + (i === rows.length - 1 && change >= 0 ? 0 : change * change);
      }, 0);
    for (let seed = 1; seed <= 25; seed++) {
      const input = drawn(seed, 20, 300);
      const greedy = justifiedRows(input, { method: "greedy", targetHeight: 40 });
      const line = justifiedRows(input, { method: "line-break", targetHeight: 40 });
      expect(cost(input, rowsOf(input, line.output), 40)).toBeLessThanOrEqual(cost(input, rowsOf(input, greedy.output), 40) + 1e-9);
    }
  });

  it("gives the linear partition the least largest ratio sum of all partitions into the same count of rows", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const input = { ...drawn(seed, 9, 300), items: drawn(seed, 9, 300).items.map(({ rank: _rank, ...item }) => item) };
      const part = justifiedRows(input, { method: "linear-partition", targetHeight: 40 });
      const ratios = input.items.map((item) => item.w / item.h);
      const largest = (rows: readonly (readonly number[])[]): number => Math.max(...rows.map((row) => row.reduce((sum, i) => sum + ratios[i]!, 0)));
      const ids = rowsOf(input, part.output).map((row) => row.map((id) => Number(id.slice(1))));
      // Each set of 8 cuts gives a partition. Only the partitions with the same count of rows, each row able to fill the strip, count.
      let best = Infinity;
      for (let mask = 0; mask < 1 << 8; mask++) {
        const rows: number[][] = [[0]];
        for (let i = 1; i < 9; i++) (mask & (1 << (i - 1)) ? rows.push([i]) : rows.at(-1)!.push(i));
        if (rows.length !== part.rows) continue;
        const ok = rows.every((row) => fillOf(input, row.map((i) => `i${i}`)) >= Math.max(...row.map((i) => input.items[i]!.h / 4)));
        if (ok) best = Math.min(best, largest(rows));
      }
      expect(largest(ids), `seed ${seed}`).toBeCloseTo(best, 9);
    }
  });

  it("gives the same layout on each call, for each method", () => {
    for (const method of JUSTIFIED_METHODS) {
      const input = drawn(3, 40, 250);
      expect(justifiedRows(input, { method })).toEqual(justifiedRows(input, { method }));
    }
  });

  it("gives an empty layout for no items", () => {
    const { output, rows } = justifiedRows(strip(10, []));
    expect(rows).toBe(0);
    expect(output.size).toEqual({ w: 10, h: 0 });
  });

  it("refuses an input that it cannot pack, and a bad option", () => {
    expect(justifiedRowsRefusal(strip(100, [photo("a", 10, 10)]))).toBeNull();
    expect(justifiedRowsRefusal({ container: { fixed: "height", h: 10 }, items: [] })).toMatch(/fixed "width"/);
    expect(justifiedRowsRefusal(strip(10, [{ id: "a", w: 20, h: 5 }]))).toMatch(/wider than the container/);
    expect(justifiedRowsRefusal(strip(10, [photo("a", 4, 4, { locked: true, x: 0, y: 0 })]))).toMatch(/locked/);
    expect(justifiedRowsRefusal(strip(10, [{ id: "a", w: 4, h: 2, resize: { minH: 3, maxW: 4 } }]))).toMatch(/no height/);
    expect(() => justifiedRows(strip(10, [photo("a", 4, 4)]), { method: "best" as JustifiedMethod })).toThrow(RangeError);
    expect(() => justifiedRows(strip(10, [photo("a", 4, 4)]), { targetHeight: 0 })).toThrow(RangeError);
  });
});
