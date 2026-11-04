import { describe, expect, it } from "vitest";
import { anchorCase, anchorRow } from "../bench/side-anchors.ts";
import { checkHard, checkSideAnchors, packSideAnchors, type Item, type PackInput, type SideAnchor } from "./index.ts";

const box = (id: string, w: number, h: number): Item => ({ id, w, h });
const strip = (items: readonly Item[], w = 100): PackInput => ({ container: { w, fixed: "width" }, items });
const breaksOf = (input: PackInput, output: ReturnType<typeof packSideAnchors>["output"]): number => Object.values(checkHard(input, output)).reduce((sum, value) => sum + value, 0);

describe("packSideAnchors", () => {
  it("puts a bottom anchor on the final bottom of the strip", () => {
    const input = strip([box("a", 40, 40), box("b", 60, 30), box("c", 100, 20), box("end", 20, 10)]);
    const anchors: SideAnchor[] = [{ id: "end", side: "bottom", at: 1 }];
    const { output, good } = packSideAnchors(input, anchors);
    const end = output.placements.find((p) => p.id === "end")!;
    expect(good).toBe(true);
    expect(end.x).toBe(80);
    expect(end.y + 10).toBeCloseTo(output.size.h, 9);
    expect(checkSideAnchors(input, output, anchors)).toBe(0);
  });

  it("keeps an offset on a left anchor and a fraction on a right anchor", () => {
    const input = strip([box("l", 10, 10), box("r", 10, 20), box("a", 50, 50), box("b", 50, 50)]);
    const anchors: SideAnchor[] = [{ id: "l", side: "left", offset: 5 }, { id: "r", side: "right", at: 0.5 }];
    const { output } = packSideAnchors(input, anchors);
    const at = (id: string) => output.placements.find((p) => p.id === id)!;
    expect(at("l")).toMatchObject({ x: 0, y: 5 });
    expect(at("r").x).toBe(90);
    expect(at("r").y).toBeCloseTo((output.size.h - 20) / 2, 9);
    expect(breaksOf(input, output)).toBe(0);
  });

  it("reads the inset on each side", () => {
    const input: PackInput = { container: { w: 100, h: 100, fixed: "size", inset: 5 }, items: [box("t", 10, 10), box("b", 10, 10)] };
    const anchors: SideAnchor[] = [{ id: "t", side: "top", at: 0 }, { id: "b", side: "bottom", at: 1 }];
    const { output, packs } = packSideAnchors(input, anchors);
    expect(packs).toBe(1);
    expect(output.placements.find((p) => p.id === "t")).toMatchObject({ x: 5, y: 5 });
    expect(output.placements.find((p) => p.id === "b")).toMatchObject({ x: 85, y: 85 });
  });

  it("searches on a free width too", () => {
    const input: PackInput = { container: { h: 100, fixed: "height" }, items: [box("a", 50, 50), box("b", 50, 50), box("c", 50, 50), box("end", 10, 40)] };
    const anchors: SideAnchor[] = [{ id: "end", side: "right", at: 1 }];
    const { output, good } = packSideAnchors(input, anchors);
    expect(good).toBe(true);
    expect(output.placements.find((p) => p.id === "end")).toMatchObject({ x: output.size.w - 10, y: 60 });
    expect(checkSideAnchors(input, output, anchors)).toBe(0);
  });

  it("grows the strip until two anchors on one side stop overlapping", () => {
    const input = strip([box("a", 10, 30), box("b", 10, 30)]);
    const anchors: SideAnchor[] = [{ id: "a", side: "left", at: 0 }, { id: "b", side: "left", at: 1 }];
    const { output, good } = packSideAnchors(input, anchors);
    expect(good).toBe(true);
    expect(output.size.h).toBeGreaterThanOrEqual(60);
    expect(output.size.h).toBeLessThan(64);
  });

  it("gives the layout with the fewest problems when an item cannot fit", () => {
    const input = strip([box("wide", 120, 10), box("end", 10, 10)]);
    const { output, good } = packSideAnchors(input, [{ id: "end", side: "bottom", at: 0 }]);
    expect(good).toBe(false);
    expect(output.overflow).toEqual(["wide"]);
  });

  it("gives equal bytes for one input and one seed", () => {
    const { input, anchors } = anchorCase(3, 24, 4);
    const bytes = (): string => {
      const { output, packs, good } = packSideAnchors(input, anchors, { seed: 5 });
      const { trace, ...layout } = output;
      return JSON.stringify({ layout, packs, good, stages: trace?.map((t) => ({ ...t, ms: 0 })) });
    };
    expect(bytes()).toBe(bytes());
  });

  it("refuses what this slice does not read", () => {
    const input = strip([box("a", 10, 10), { ...box("m", 10, 10), margin: 2 }, { ...box("l", 10, 10), locked: true, x: 0, y: 0 }]);
    const bad: [PackInput, SideAnchor[], string][] = [
      [input, [{ id: "z", side: "top", at: 0 }], "No item"],
      [input, [{ id: "m", side: "top", at: 0 }], "margin"],
      [input, [{ id: "l", side: "top", at: 0 }], "locked"],
      [input, [{ id: "a", side: "top" }], "at or offset"],
      [input, [{ id: "a", side: "top", at: 0, offset: 1 }], "at or offset"],
      [input, [{ id: "a", side: "top", at: 2 }], "from 0 to 1"],
      [input, [{ id: "a", side: "top", offset: -1 }], "0 or more"],
      [input, [{ id: "a", side: "top", at: 0 }, { id: "a", side: "left", at: 0 }], "two anchors"],
      [{ ...input, container: { fixed: "none" } }, [], "one fixed side"],
      [{ ...input, container: { w: 10, h: 10, fixed: "size", shape: { kind: "circle", cx: 5, cy: 5, r: 5 } } }, [], "rectangle"],
    ];
    for (const [i, a, message] of bad) expect(() => packSideAnchors(i, a)).toThrow(message);
    expect(() => packSideAnchors(input, [], { precision: 0 })).toThrow(RangeError);
  });
});

describe("the rule anchor-kept", () => {
  it("counts a moved anchor, a turned anchor and a missing anchor", () => {
    const input = strip([box("a", 10, 10)]);
    const anchors: SideAnchor[] = [{ id: "a", side: "top", at: 0 }];
    const size = { w: 100, h: 50 };
    const output = { overflow: [], moved: [], size };
    expect(checkSideAnchors(input, { ...output, placements: [{ id: "a", x: 0, y: 0 }] }, anchors)).toBe(0);
    expect(checkSideAnchors(input, { ...output, placements: [{ id: "a", x: 1, y: 0 }] }, anchors)).toBe(1);
    expect(checkSideAnchors(input, { ...output, placements: [{ id: "a", x: 0, y: 0, turn: 90 }] }, anchors)).toBe(1);
    expect(checkSideAnchors(input, { ...output, placements: [] }, anchors)).toBe(1);
  });

  it.each(["rows", "skyline", "maxrects"])("has no break of any rule on 200 made-up inputs with %s", (strategy) => {
    for (let seed = 1; seed <= 200; seed++) {
      const { input, anchors } = anchorCase(seed, 16, 4);
      const { output, good } = packSideAnchors(input, anchors, { strategy, seed });
      expect([seed, good]).toEqual([seed, true]);
      expect([seed, breaksOf(input, output), checkSideAnchors(input, output, anchors)]).toEqual([seed, 0, 0]);
    }
  });

  it("keeps each anchor when more items make the free height grow", () => {
    let grew = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { input, anchors } = anchorCase(seed, 16, 4);
      const small = packSideAnchors(input, anchors, { seed });
      const more: PackInput = { ...input, items: [...input.items, ...anchorCase(seed + 1000, 16, 0).input.items.map((i) => ({ ...i, id: `more-${i.id}` }))] };
      const large = packSideAnchors(more, anchors, { seed });
      if (large.output.size.h > small.output.size.h) grew += 1;
      expect([seed, large.good, checkSideAnchors(more, large.output, anchors)]).toEqual([seed, true, 0]);
    }
    expect(grew).toBeGreaterThanOrEqual(150);
  });
});

describe("the bench of side anchors", () => {
  it("gives a row with no break", () => {
    const row = anchorRow(1, 12, 2);
    expect(row.breaks).toBe(0);
    expect(row.anchored).toBeGreaterThanOrEqual(row.plain * 0.5);
  });
});
