// The adaptive grid layout of roadmap item k28 (Jacobs 2003). Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { checkHard, GRID_TEMPLATES, gridTemplateLayout, gridTemplateRefusal, mulberry32, outputHash, type GridTemplate, type PackInput } from "./index.ts";

/** The count of each hard rule that a valid layout breaks. */
const ZERO = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

const WIDTH = 600;
const PAGE = 800;

/** This function gives a made-up strip of `count` items. Each item fits a page. */
function strip(seed: number, count: number, gap = 8): PackInput {
  const random = mulberry32(seed);
  return {
    container: { fixed: "width", w: WIDTH },
    gap,
    items: Array.from({ length: count }, (_, i) => ({ id: `i${i}`, w: 20 + Math.floor(random() * 560), h: 20 + Math.floor(random() * 760) })),
  };
}

/** This function gives the cell rectangles of a template, with the same formula as the module. */
function boxesOf(template: GridTemplate, gap: number): { w: number; h: number }[] {
  const stepX = (WIDTH + gap) / template.columns;
  const stepY = (PAGE + gap) / template.rows;
  return template.cells.map((c) => ({ w: c.columns * stepX - gap, h: c.rows * stepY - gap }));
}

/** This function gives the least cost of all the sequences of templates, by a search over each sequence. */
function bruteCost(input: PackInput, templates: readonly GridTemplate[]): number {
  const gap = input.gap ?? 0;
  const items = input.items;
  const search = (i: number): number => {
    if (i === items.length) return 0;
    let least = Number.POSITIVE_INFINITY;
    for (const template of templates) {
      const boxes = boxesOf(template, gap);
      if (i + boxes.length > items.length) continue;
      const fits = boxes.every((box, k) => items[i + k]!.w <= box.w + 1e-9 * WIDTH && items[i + k]!.h <= box.h + 1e-9 * PAGE);
      if (!fits) continue;
      const empty = boxes.reduce((sum, box, k) => sum + Math.max(0, box.w * box.h - items[i + k]!.w * items[i + k]!.h), 0);
      least = Math.min(least, 1 + (template.cost ?? 0) + empty / (WIDTH * PAGE) + search(i + boxes.length));
    }
    return least;
  };
  return search(0);
}

describe("gridTemplateLayout (k28)", () => {
  it("breaks no hard rule, and keeps each item in its cell and on its page", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const gap of [0, 8]) {
        const input = strip(seed, 4 + seed * 5, gap);
        const { output, pages } = gridTemplateLayout(input, { pageHeight: PAGE });
        expect(checkHard(input, output), `seed ${seed}`).toEqual(ZERO);
        expect(pages.flatMap((page) => page.items).length).toBe(input.items.length);
        expect(output.size).toEqual({ w: WIDTH, h: pages.length * PAGE + (pages.length - 1) * gap });
        // Each item stays on its page: the top of page p is p (PAGE + gap).
        const byId = new Map(output.placements.map((place) => [place.id, place]));
        for (const [p, page] of pages.entries()) {
          for (const id of page.items) {
            const place = byId.get(id)!;
            const item = input.items.find((it) => it.id === id)!;
            expect(place.y >= p * (PAGE + gap) && place.y + item.h <= p * (PAGE + gap) + PAGE, id).toBe(true);
          }
        }
      }
    }
  });

  it("gives the least cost of all the sequences of templates", () => {
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      // Small items, so that many templates take them.
      const random = mulberry32(seed);
      const input: PackInput = {
        container: { fixed: "width", w: WIDTH },
        gap: 6,
        items: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, w: 30 + Math.floor(random() * 300), h: 30 + Math.floor(random() * 400) })),
      };
      const { cost } = gridTemplateLayout(input, { pageHeight: PAGE });
      expect(cost).toBeCloseTo(bruteCost(input, GRID_TEMPLATES), 12);
    }
  });

  it("costs at most as much as the first template that takes each page", () => {
    // The first fit of the paper: each page takes the first template of the style that accepts the next items.
    // Here the order of the style puts the templates with more cells first.
    const style = [...GRID_TEMPLATES].sort((a, b) => b.cells.length - a.cells.length);
    for (const seed of [21, 22, 23]) {
      const input = strip(seed, 30);
      const { cost } = gridTemplateLayout(input, { pageHeight: PAGE, templates: style });
      let firstFit = 0;
      for (let i = 0; i < input.items.length; ) {
        const template = style.find((t) => {
          const boxes = boxesOf(t, 8);
          return i + boxes.length <= input.items.length && boxes.every((box, k) => input.items[i + k]!.w <= box.w && input.items[i + k]!.h <= box.h);
        })!;
        const boxes = boxesOf(template, 8);
        firstFit += 1 + boxes.reduce((sum, box, k) => sum + box.w * box.h - input.items[i + k]!.w * input.items[i + k]!.h, 0) / (WIDTH * PAGE);
        i += boxes.length;
      }
      expect(cost).toBeLessThanOrEqual(firstFit + 1e-12);
    }
  });

  it("puts nine small items on one page", () => {
    const input: PackInput = { container: { fixed: "width", w: 300 }, items: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, w: 100, h: 100 })) };
    const { pages, output } = gridTemplateLayout(input, { pageHeight: 300 });
    expect(pages).toEqual([{ template: "nine", items: input.items.map((item) => item.id) }]);
    expect(output.placements.map((place) => [place.x, place.y])).toEqual([0, 100, 200].flatMap((y) => [0, 100, 200].map((x) => [x, y])));
  });

  it("takes the cost of a template and the page cost into the choice", () => {
    const input: PackInput = { container: { fixed: "width", w: 300 }, items: [{ id: "a", w: 100, h: 100 }, { id: "b", w: 100, h: 100 }] };
    const both = gridTemplateLayout(input, { pageHeight: 300 });
    expect(both.pages.length).toBe(1);
    // A cost of 3 on each template with 2 cells makes two pages of one item cheaper.
    const style = GRID_TEMPLATES.map((t) => (t.cells.length === 2 ? { ...t, cost: 3 } : t));
    expect(gridTemplateLayout(input, { pageHeight: 300, templates: style }).pages.map((page) => page.template)).toEqual(["one", "one"]);
    // With no page cost, the empty area alone decides.
    expect(gridTemplateLayout(input, { pageHeight: 300, pageCost: 0 }).cost).toBeLessThan(both.cost);
  });

  it("gives the same layout on each call, and an empty layout for no items", () => {
    const input = strip(31, 25);
    expect(outputHash(gridTemplateLayout(input, { pageHeight: PAGE }).output)).toBe(outputHash(gridTemplateLayout(input, { pageHeight: PAGE }).output));
    expect(gridTemplateLayout({ container: { fixed: "width", w: 10 }, items: [] }, { pageHeight: 5 })).toEqual({
      output: { placements: [], overflow: [], size: { w: 10, h: 0 }, moved: [] },
      pages: [],
      cost: 0,
    });
  });

  it("refuses a bad input, bad options and a style with no sequence", () => {
    const input = strip(1, 3);
    const options = { pageHeight: PAGE };
    const refused: [PackInput, object][] = [
      [{ ...input, container: { fixed: "none" } }, options],
      [{ ...input, container: { fixed: "width", w: 0 } }, options],
      [{ ...input, gap: -1 }, options],
      [{ ...input, pairGaps: [{ a: "i0", b: "i1", gap: 4 }] }, options],
      [{ ...input, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 1, h: 1 } }] }, options],
      [{ ...input, items: [{ id: "big", w: 10, h: PAGE + 1 }] }, options],
      [{ ...input, items: [{ id: "m", w: 10, h: 10, margin: 1 }] }, options],
      [{ ...input, items: [{ id: "l", w: 10, h: 10, locked: true }] }, options],
      [input, { pageHeight: 0 }],
      [input, { pageHeight: PAGE, pageCost: -1 }],
      [input, { pageHeight: PAGE, templates: [] }],
      [input, { pageHeight: PAGE, templates: [GRID_TEMPLATES[0], GRID_TEMPLATES[0]] }],
      [input, { pageHeight: PAGE, templates: [{ id: "x", columns: 2, rows: 1, cells: [{ column: 1, row: 0, columns: 2, rows: 1 }] }] }],
      [input, { pageHeight: PAGE, templates: [{ id: "x", columns: 2, rows: 1, cells: [{ column: 0, row: 0, columns: 2, rows: 1 }, { column: 1, row: 0, columns: 1, rows: 1 }] }] }],
      [input, { pageHeight: PAGE, templates: [{ id: "x", columns: 1.5, rows: 1, cells: [{ column: 0, row: 0, columns: 1, rows: 1 }] }] }],
      [input, { pageHeight: PAGE, templates: [{ id: "x", columns: 1, rows: 1, cells: [] }] }],
      [input, { pageHeight: PAGE, templates: [{ ...GRID_TEMPLATES[0]!, cost: -1 }] }],
    ];
    for (const [bad, opts] of refused) {
      expect(gridTemplateRefusal(bad, opts as never), JSON.stringify(opts)).not.toBeNull();
      expect(() => gridTemplateLayout(bad, opts as never)).toThrow(RangeError);
    }
    // A style with only templates of two cells takes no odd count of items.
    const pairs = GRID_TEMPLATES.filter((t) => t.cells.length === 2);
    expect(gridTemplateRefusal(input, { pageHeight: PAGE, templates: pairs })).toBeNull();
    expect(() => gridTemplateLayout({ ...input, items: input.items.map((item) => ({ ...item, w: 10, h: 10 })) }, { pageHeight: PAGE, templates: pairs })).toThrow(/no sequence of templates/);
  });
});
