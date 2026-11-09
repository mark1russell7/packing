import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { treemapQuantum, type QuantumItem, type QuantumLayout } from "./index.ts";
import type { TreemapFrame } from "./treemap.ts";

/** This function gives made-up groups with a seed: `n` counts from 1 up to `max`. */
function groupsOf(seed: string, n: number, max: number): QuantumItem[] {
  const stream = random(seed);
  return Array.from({ length: n }, (_, i) => ({ id: `g${i}`, count: 1 + Math.floor(stream.next() * max) }));
}

/** This function examines the rules of a quantum treemap: whole elements, one grid, enough elements, no overlap, inside the frame. */
function expectQuantum(layout: QuantumLayout, items: readonly QuantumItem[], frame: TreemapFrame, elementAspect: number): void {
  const { cells, element, grid } = layout;
  const noise = 1e-9 * Math.max(frame.w, frame.h);
  expect(cells.map((c) => c.id)).toEqual(items.map((i) => i.id));
  expect(element.w / element.h).toBeCloseTo(elementAspect, 9);
  // The layout fills the frame along one side, and it fits along the other side.
  expect(grid.cols * element.w).toBeLessThanOrEqual(frame.w + noise);
  expect(grid.rows * element.h).toBeLessThanOrEqual(frame.h + noise);
  expect(Math.max(grid.cols * element.w - frame.w, grid.rows * element.h - frame.h)).toBeGreaterThan(-noise);
  let area = 0;
  for (const [k, c] of cells.entries()) {
    expect(Number.isInteger(c.cols) && c.cols >= 1 && Number.isInteger(c.rows) && c.rows >= 1).toBe(true);
    expect(c.cols * c.rows).toBeGreaterThanOrEqual(items[k]!.count);
    expect(c.w).toBeCloseTo(c.cols * element.w, 9);
    expect(c.h).toBeCloseTo(c.rows * element.h, 9);
    // Each corner is on the grid of the elements.
    const gx = (c.x - frame.x) / element.w;
    const gy = (c.y - frame.y) / element.h;
    expect(Math.abs(gx - Math.round(gx))).toBeLessThan(1e-6);
    expect(Math.abs(gy - Math.round(gy))).toBeLessThan(1e-6);
    expect(Math.round(gx) + c.cols).toBeLessThanOrEqual(grid.cols);
    expect(Math.round(gy) + c.rows).toBeLessThanOrEqual(grid.rows);
    area += c.cols * c.rows;
  }
  // The cells do not overlap and they fill the grid: the sum of their areas is the area of the grid.
  expect(area).toBe(grid.cols * grid.rows);
  for (let a = 0; a < cells.length; a += 1) {
    for (let b = a + 1; b < cells.length; b += 1) {
      const p = cells[a]!;
      const q = cells[b]!;
      const apart = p.x + p.w <= q.x + noise || q.x + q.w <= p.x + noise || p.y + p.h <= q.y + noise || q.y + q.h <= p.y + noise;
      expect(apart).toBe(true);
    }
  }
}

describe("treemapQuantum, the quantum strip treemap of Bederson 2002 (k27)", () => {
  it("follows the steps of section 3.1 on the groups of figure 12: 3, 20, 20 and 1 in a square", () => {
    // The box has the area 44, so its width is sqrt(44) = 6.63 elements.
    // Strip 1: [3] has 1 row. [3, 20] has ceil(23 / 6.63) = 4 rows, widths 1 and 5, mean aspect 2.625 < 3, so 20 joins.
    // [3, 20, 20] has 7 rows, widths 1, 3, 3, mean aspect 3.89 > 2.625, so the second 20 starts strip 2.
    // Strip 2: [20] has 4 rows and width 5. [20, 1] has mean aspect 2.625 > 1.25, so 1 starts strip 3.
    // Strip 3: [1] has 1 row. The widest strip has 6 columns. The second 20 gets 1 more column, and 1 gets 5 more.
    const items = [
      { id: "a", count: 3 },
      { id: "b", count: 20 },
      { id: "c", count: 20 },
      { id: "d", count: 1 },
    ];
    const frame = { x: 0, y: 0, w: 90, h: 90 };
    const layout = treemapQuantum(items, frame);
    expect(layout.cells.map((c) => [c.id, c.cols, c.rows])).toEqual([
      ["a", 1, 4],
      ["b", 5, 4],
      ["c", 6, 4],
      ["d", 6, 1],
    ]);
    expect(layout.grid).toEqual({ cols: 6, rows: 9 });
    expect(layout.element).toEqual({ w: 10, h: 10 });
    expect(layout.cells.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [10, 0],
      [0, 40],
      [0, 80],
    ]);
    expectQuantum(layout, items, frame, 1);
  });

  it("gives a small group between two large strips a strip of one row with the width of the widest strip", () => {
    // The box is sqrt(204) = 14.28 elements wide. [100] has 8 rows and 13 columns, mean aspect 1.625.
    // [100, 4] has the aspects 1.625 and 8, so 4 starts strip 2. [4] has 1 row and the aspect 4.
    // [4, 100] has 8 rows and the aspects 8 and 1.625, so the second 100 starts strip 3. Step 6 gives 4 all 13 columns.
    const layout = treemapQuantum([{ id: "a", count: 100 }, { id: "b", count: 4 }, { id: "c", count: 100 }], { x: 0, y: 0, w: 170, h: 170 });
    expect(layout.cells.map((c) => [c.id, c.cols, c.rows, c.y])).toEqual([
      ["a", 13, 8, 0],
      ["b", 13, 1, 80],
      ["c", 13, 8, 90],
    ]);
    expect(layout.grid).toEqual({ cols: 13, rows: 17 });
  });

  it("gives a prime count the smallest grid near the aspect of the box", () => {
    // In a square, 7 elements get ceil(7 / sqrt(7)) = 3 rows and ceil(7 / 3) = 3 columns: 2 cells stay empty.
    const layout = treemapQuantum([{ id: "p", count: 7 }], { x: 5, y: 5, w: 30, h: 30 });
    expect(layout.cells[0]).toMatchObject({ cols: 3, rows: 3, x: 5, y: 5, w: 30, h: 30 });
  });

  it("keeps the rules on 300 made-up inputs with 1 up to 60 groups and 3 element aspects", () => {
    const stream = random("quantum-rules");
    for (let t = 0; t < 300; t += 1) {
      const n = 1 + Math.floor(stream.next() * 60);
      const max = [3, 30, 300][t % 3]!;
      const items = groupsOf(`quantum-${t}`, n, max);
      const frame = { x: stream.next() * 50, y: stream.next() * 50, w: 40 + stream.next() * 900, h: 40 + stream.next() * 900 };
      const elementAspect = [0.75, 1, 1.5][Math.floor(t / 3) % 3]!;
      expectQuantum(treemapQuantum(items, frame, { elementAspect }), items, frame, elementAspect);
    }
  });

  it("lays out wide elements in a wide box as square elements in a square box (section 3.2.1)", () => {
    for (let t = 0; t < 50; t += 1) {
      const items = groupsOf(`quantum-aspect-${t}`, 1 + (t % 40), 50);
      const square = treemapQuantum(items, { x: 0, y: 0, w: 300, h: 200 });
      const wide = treemapQuantum(items, { x: 0, y: 0, w: 600, h: 200 }, { elementAspect: 2 });
      expect(wide.cells.map((c) => [c.cols, c.rows])).toEqual(square.cells.map((c) => [c.cols, c.rows]));
      expect(wide.grid).toEqual(square.grid);
    }
  });

  it("puts the groups in their order: left to right in a strip, and the strips from the top", () => {
    const items = groupsOf("quantum-order", 40, 25);
    const { cells } = treemapQuantum(items, { x: 0, y: 0, w: 500, h: 400 });
    for (let k = 1; k < cells.length; k += 1) {
      const a = cells[k - 1]!;
      const b = cells[k]!;
      const sameStrip = Math.abs(a.y - b.y) < 1e-9;
      if (sameStrip) expect(b.x).toBeCloseTo(a.x + a.w, 9);
      else {
        expect(b.y).toBeGreaterThan(a.y);
        expect(b.x).toBe(0);
      }
    }
  });

  it("lays out 5,000 groups", () => {
    const items = groupsOf("quantum-large", 5000, 100);
    const layout = treemapQuantum(items, { x: 0, y: 0, w: 1600, h: 900 });
    expect(layout.cells).toHaveLength(5000);
    const area = layout.cells.reduce((a, c) => a + c.cols * c.rows, 0);
    expect(area).toBe(layout.grid.cols * layout.grid.rows);
  });

  it("gives no cells for no groups, and refuses a bad count, element aspect or frame", () => {
    expect(treemapQuantum([], { x: 0, y: 0, w: 10, h: 10 })).toEqual({ cells: [], element: { w: 0, h: 0 }, grid: { cols: 0, rows: 0 } });
    const frame = { x: 0, y: 0, w: 10, h: 10 };
    expect(() => treemapQuantum([{ id: "z", count: 0 }], frame)).toThrow(RangeError);
    expect(() => treemapQuantum([{ id: "f", count: 1.5 }], frame)).toThrow(RangeError);
    expect(() => treemapQuantum([{ id: "a", count: 1 }], frame, { elementAspect: 0 })).toThrow(RangeError);
    expect(() => treemapQuantum([{ id: "a", count: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toThrow(RangeError);
  });
});
