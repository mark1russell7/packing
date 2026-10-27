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
