import { describe, expect, it } from "vitest";
import { checkHard, mulberry32, packMaxRects, packWith, Rect, rectGrid, toPackInput, type PackInput, type PackOutput } from "./index.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";

// The rule `wire` of `maxrects`: the place of a box comes from the links to the boxes that are already placed. Made-up inputs only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** This function makes a rectangle of a size. */
const box = (w: number, h: number, id = 0): Rect<number> => {
  const r = new Rect<number>();
  r.size.set(w, h);
  r.id = id;
  return r;
};

/** This function makes a locked rectangle at a position. */
const lockedAt = (x: number, y: number, w: number, h: number, id: number): Rect<number> => {
  const r = box(w, h, id);
  r.position.set(x, y);
  r.locked = true;
  return r;
};

/** This function makes an outer rectangle of 100 by 100 with a fixed size. */
const square = (): Rect<number> => {
  const outer = new Rect<number>();
  outer.size.set(100, 100);
  outer.fixedWidth = true;
  outer.fixedSize = true;
  return outer;
};

/** This function adds to an input a seeded tree of links: each item links to one item before it. */
function withLinks(input: PackInput, seed: number): PackInput {
  const rng = mulberry32(seed);
  return { ...input, links: input.items.slice(1).map((_, i) => ({ a: i + 1, b: Math.floor(rng() * (i + 1)) })) };
}

/** This function gives the sum over the links of an output of the weight times the Manhattan distance between the centers. */
function wireOf(input: PackInput, output: PackOutput): number {
  const at = new Map(output.placements.map((p) => [p.id, p]));
  let sum = 0;
  for (const { a, b, weight = 1 } of input.links ?? []) {
    const p = at.get(input.items[a]!.id);
    const q = at.get(input.items[b]!.id);
    if (p === undefined || q === undefined) continue;
    const [i, j] = [input.items[a]!, input.items[b]!];
    sum += weight * (Math.abs(p.x + i.w / 2 - q.x - j.w / 2) + Math.abs(p.y + i.h / 2 - q.y - j.h / 2));
  }
  return sum;
}

describe("maxrects: the rule wire with no links", () => {
  it("gives the layout of bl, for each size family and order", () => {
    for (const sizes of ["uniform", "heavyTail", "bimodal"] as const) {
      for (const seed of [1, 2, 3]) {
        const input = toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize: "freeHeight", obstacles: "scattered", sizes, count: 40 }));
        for (const sortOrder of ["height-desc", "input"] as const) {
          expect(packWith("maxrects", input, { rule: "wire", sortOrder }, seed).placements).toEqual(packWith("maxrects", input, { rule: "bl", sortOrder }, seed).placements);
        }
      }
    }
  });

  it("gives the layout of bl with turnable items", () => {
    const input = toPackInput(rectGrid.generate(4, { containerShape: "rect", containerSize: "fixed", obstacles: "none", sizes: "heavyTail", count: 30 }));
    const items = input.items.map((item) => ({ ...item, rotatable: true }));
    expect(packWith("maxrects", { ...input, items }, { rule: "wire", rotate: true }).placements).toEqual(packWith("maxrects", { ...input, items }, { rule: "bl", rotate: true }).placements);
  });
});

describe("maxrects: the rule wire on a hand case", () => {
  it("puts a box next to its link on the right side, with the top-right corner of a free rectangle", () => {
    const r = box(10, 10, 1);
    clearMoves();
    packMaxRects([lockedAt(60, 0, 40, 40, 0), r], square(), { rule: "wire", links: [{ a: 0, b: 1 }] });
    expect([r.position.x + r.size.x, r.position.y]).toEqual([60, 0]);
    expect(moveCount(MOVES.wire)).toBe(1);
  });

  it("puts a box under its link at the bottom corners of a free rectangle", () => {
    const r = box(10, 10, 1);
    packMaxRects([lockedAt(0, 80, 100, 20, 0), r], square(), { rule: "wire", links: [{ a: 0, b: 1 }] });
    expect(r.position.y + r.size.y).toBe(80);
  });

  it("follows the link with the larger weight", () => {
    const r = box(10, 10, 2);
    const left = lockedAt(0, 45, 10, 10, 0);
    const right = lockedAt(90, 45, 10, 10, 1);
    packMaxRects([left, right, r], square(), { rule: "wire", links: [{ a: 0, b: 2, weight: 1 }, { a: 1, b: 2, weight: 5 }] });
    expect(r.position.x).toBeGreaterThan(50);
  });

  it("ignores a link of a rectangle to itself and a link to no rectangle", () => {
    const r = box(10, 10, 0);
    packMaxRects([r], square(), { rule: "wire", links: [{ a: 0, b: 0 }, { a: 0, b: 9 }] });
    expect([r.position.x, r.position.y]).toEqual([0, 0]);
  });

  it("does not move a box when the order places the box before its link", () => {
    const first = box(10, 10, 0);
    const second = box(5, 5, 1);
    packMaxRects([first, second], square(), { rule: "wire", sortOrder: "area-desc", links: [{ a: 0, b: 1 }] });
    expect([first.position.x, first.position.y]).toEqual([0, 0]);
    expect(second.position.x + second.position.y).toBeGreaterThan(0);
  });
});

/** This function gives the lowest edge of the boxes of an output. */
function heightOf(input: PackInput, output: PackOutput): number {
  const at = new Map(input.items.map((item) => [item.id, item]));
  return Math.max(...output.placements.map((p) => p.y + at.get(p.id)!.h));
}

describe("maxrects: the rule wire on linked inputs", () => {
  /** This function gives 20 seeded linked inputs of one size family. The trial that chose `WIRE_DEPTH` used the seeds 1 to 20, so this test does not. */
  const inputs = (sizes: "uniform" | "heavyTail" | "bimodal"): PackInput[] =>
    Array.from({ length: 20 }, (_, i) => withLinks(toPackInput(rectGrid.generate(i + 101, { containerShape: "rect", containerSize: "freeHeight", obstacles: "none", sizes, count: 40 })), i + 101));

  for (const sizes of ["uniform", "heavyTail", "bimodal"] as const) {
    it(`gives a shorter wire length than bl with the order graph-bfs on most ${sizes} inputs, and keeps the hard rules and nearly the height`, () => {
      let wins = 0;
      let wireSum = 0;
      let blSum = 0;
      let wireHeight = 0;
      let blHeight = 0;
      for (const input of inputs(sizes)) {
        const wire = packWith("maxrects", input, { rule: "wire", sortOrder: "graph-bfs" });
        const bl = packWith("maxrects", input, { rule: "bl", sortOrder: "graph-bfs" });
        expect(checkHard(input, wire)).toEqual(CLEAN);
        const a = wireOf(input, wire);
        const b = wireOf(input, bl);
        if (a < b) wins++;
        wireSum += a;
        blSum += b;
        wireHeight += heightOf(input, wire);
        blHeight += heightOf(input, bl);
      }
      expect(wins).toBeGreaterThanOrEqual(16);
      expect(wireSum / blSum).toBeLessThan(0.75);
      expect(wireHeight / blHeight).toBeLessThan(1.15);
    }, 30_000);
  }
});
