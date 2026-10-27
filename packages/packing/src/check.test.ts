import { describe, expect, it } from "vitest";
import { checkHard, type PackInput, type PackOutput } from "@mark1russell7/packing";

const out = (placements: PackOutput["placements"], overflow: string[] = [], moved: PackOutput["moved"] = []): PackOutput => ({
  placements,
  overflow,
  size: { w: 100, h: 100 },
  moved,
  trace: [],
});

describe("checkHard", () => {
  const input: PackInput = {
    container: { w: 100, h: 100, fixed: "size" },
    items: [
      { id: "a", w: 10, h: 10, margin: 2 },
      { id: "b", w: 10, h: 10 },
      { id: "pin", w: 10, h: 10, locked: true, x: 50, y: 50 },
      { id: "c", w: 10, h: 10 },
    ],
    obstacles: [{ id: "o", region: { kind: "rect", x: 80, y: 0, w: 20, h: 20 } }],
  };

  it("gives 0 for each rule of a good output, and has no tolerance in its result", () => {
    const result = checkHard(input, out([{ id: "a", x: 2, y: 2 }, { id: "b", x: 14, y: 0 }, { id: "pin", x: 50, y: 50 }], ["c"]));
    expect(result).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
  });

  it("counts an overlap through a margin, an item in an obstacle, and keeps a common edge", () => {
    const result = checkHard(input, out([{ id: "a", x: 2, y: 2 }, { id: "b", x: 13, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "c", x: 75, y: 5 }]));
    expect(result["no-overlap"]).toBe(2);
  });

  it("allows an overlap up to the tolerance", () => {
    const placements = [{ id: "a", x: 2, y: 2 }, { id: "b", x: 13.9995, y: 0 }, { id: "pin", x: 50, y: 50 }];
    expect(checkHard(input, out(placements, ["c"]))["no-overlap"]).toBe(0);
    expect(checkHard(input, out(placements, ["c"]), { overlap: 0 })["no-overlap"]).toBe(1);
  });

  it("counts an item out of a fixed container, with its margin", () => {
    const result = checkHard(input, out([{ id: "a", x: 1, y: 2 }, { id: "b", x: 95, y: 0 }, { id: "pin", x: 50, y: 50 }], ["c"]));
    expect(result["in-container"]).toBe(2);
    const free: PackInput = { ...input, container: { w: 100, fixed: "width" } };
    expect(checkHard(free, out([{ id: "a", x: 2, y: 200 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 50, y: 50 }], ["c"]))["in-container"]).toBe(0);
  });

  it("makes each fixed side of the container smaller by the inset", () => {
    const inset: PackInput = { container: { w: 100, h: 100, fixed: "size", inset: 5 }, items: [{ id: "a", w: 10, h: 10, margin: 2 }] };
    // The item is in the container, but its margin is in the inset.
    expect(checkHard(inset, out([{ id: "a", x: 6, y: 50 }]))["in-container"]).toBe(1);
    expect(checkHard(inset, out([{ id: "a", x: 50, y: 84 }]))["in-container"]).toBe(1);
    // The margin is exactly at the edge of the inset, or in it by no more than the tolerance.
    expect(checkHard(inset, out([{ id: "a", x: 7, y: 7 }]))["in-container"]).toBe(0);
    expect(checkHard(inset, out([{ id: "a", x: 83, y: 83 }]))["in-container"]).toBe(0);
    expect(checkHard(inset, out([{ id: "a", x: 6.9995, y: 83.0005 }]))["in-container"]).toBe(0);
    expect(checkHard(inset, out([{ id: "a", x: 6.9995, y: 50 }]), { overlap: 0 })["in-container"]).toBe(1);
    // A free side has no edge, thus the inset on that side does not count.
    const free: PackInput = { ...inset, container: { w: 100, fixed: "width", inset: 5 } };
    expect(checkHard(free, out([{ id: "a", x: 50, y: 0 }]))["in-container"]).toBe(0);
    expect(checkHard(free, out([{ id: "a", x: 0, y: 50 }]))["in-container"]).toBe(1);
  });

  it("reads the inset in a shaped container from the origin of its bounding box", () => {
    const shaped: PackInput = {
      container: { fixed: "size", shape: { kind: "rect", x: 20, y: 10, w: 50, h: 50 }, inset: 4 },
      items: [{ id: "a", w: 10, h: 10 }],
    };
    expect(checkHard(shaped, out([{ id: "a", x: 24, y: 14 }]))["in-container"]).toBe(0);
    expect(checkHard(shaped, out([{ id: "a", x: 56, y: 46 }]))["in-container"]).toBe(0);
    expect(checkHard(shaped, out([{ id: "a", x: 23, y: 14 }]))["in-container"]).toBe(1);
    expect(checkHard(shaped, out([{ id: "a", x: 56, y: 47 }]))["in-container"]).toBe(1);
  });

  it("reads a shaped item as the bounding box of its shape, at the position of the item", () => {
    const shaped: PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      items: [
        { id: "c", w: 20, h: 20, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } },
        { id: "e", w: 20, h: 20, shape: { kind: "ellipse", cx: 10, cy: 10, rx: 10, ry: 4 }, margin: 1 },
        { id: "p", w: 20, h: 20, shape: { kind: "polygon", points: [[5, 0], [15, 10], [5, 20]] } },
        { id: "b", w: 10, h: 10 },
      ],
    };
    const ZERO = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
    // As w by h, the shaped items break a rule 3 times. As bounding boxes, they break no rule.
    const apart = [{ id: "c", x: 0, y: 0 }, { id: "b", x: 12, y: 12 }, { id: "e", x: 30, y: -5 }, { id: "p", x: 85, y: 50 }];
    expect(checkHard(shaped, out(apart))).toEqual(ZERO);
    // The circle at 0, 0 is 10 by 10. The item b at 9, 9 overlaps it by 1 on each axis.
    expect(checkHard(shaped, out([{ id: "c", x: 0, y: 0 }, { id: "b", x: 9, y: 9 }, { id: "e", x: 30, y: 30 }, { id: "p", x: 60, y: 60 }]))["no-overlap"]).toBe(1);
    // The ellipse with its margin goes from y + 5 to y + 15. At y = -6, it goes 1 above the container.
    expect(checkHard(shaped, out([{ id: "c", x: 0, y: 0 }, { id: "b", x: 12, y: 12 }, { id: "e", x: 30, y: -6 }, { id: "p", x: 60, y: 60 }]))["in-container"]).toBe(1);
    // The polygon goes from x + 5 to x + 15. At x = 86, it goes 1 out of the right side.
    expect(checkHard(shaped, out([{ id: "c", x: 0, y: 0 }, { id: "b", x: 12, y: 12 }, { id: "e", x: 30, y: 30 }, { id: "p", x: 86, y: 50 }]))["in-container"]).toBe(1);
  });

  it("turns the shape of a turned item before it reads the bounding box", () => {
    const turnable: PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      items: [
        { id: "e", w: 40, h: 10, turnable: true, shape: { kind: "ellipse", cx: 20, cy: 5, rx: 20, ry: 2 } },
        { id: "b", w: 10, h: 10 },
      ],
    };
    // Turned, the ellipse is 4 wide and 40 high, from x + 3 to x + 7.
    expect(checkHard(turnable, out([{ id: "e", x: 0, y: 0, turn: 90 }, { id: "b", x: 7, y: 0 }]))["no-overlap"]).toBe(0);
    expect(checkHard(turnable, out([{ id: "e", x: 0, y: 0, turn: 90 }, { id: "b", x: 6, y: 0 }]))["no-overlap"]).toBe(1);
    // Not turned, the ellipse is 40 wide and 4 high, from y + 3 to y + 7.
    expect(checkHard(turnable, out([{ id: "e", x: 0, y: 0 }, { id: "b", x: 0, y: 7 }]))["no-overlap"]).toBe(0);
    expect(checkHard(turnable, out([{ id: "e", x: 0, y: 0 }, { id: "b", x: 0, y: 6 }]))["no-overlap"]).toBe(1);
  });

  it("counts a locked item that moved or has no position, and an item with no position that is not in the overflow", () => {
    expect(checkHard(input, out([{ id: "a", x: 2, y: 2 }, { id: "pin", x: 51, y: 50 }]))).toMatchObject({ "locked-kept": 1, complete: 2 });
    expect(checkHard(input, out([{ id: "a", x: 2, y: 2 }], ["b", "c", "pin"]))).toMatchObject({ "locked-kept": 1, complete: 0 });
  });

  it("reads a turned item and a moved obstacle", () => {
    const turnable: PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      items: [{ id: "a", w: 30, h: 10, turnable: true }],
      obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 20, h: 20 }, move: { cost: 0 } }],
    };
    expect(checkHard(turnable, out([{ id: "a", x: 0, y: 25, turn: 90 }], [], [{ id: "o", x: 40, y: 0 }]))["no-overlap"]).toBe(0);
    expect(checkHard(turnable, out([{ id: "a", x: 0, y: 25, turn: 90 }]))["no-overlap"]).toBe(0);
    expect(checkHard(turnable, out([{ id: "a", x: 0, y: 15, turn: 90 }]))["no-overlap"]).toBe(1);
    expect(checkHard(turnable, out([{ id: "a", x: 95, y: 0, turn: 90 }]))["in-container"]).toBe(1);
  });
});
