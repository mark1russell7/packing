import { describe, expect, it } from "vitest";
import { cellOf, createContext, mulberry32, packWith, strategies, strategy, supportsCell, UnsupportedCell, type PackInput } from "@mark1russell7/packing";

const items = [
  { id: "a", w: 10, h: 10 },
  { id: "b", w: 20, h: 5 },
];

describe("cellOf", () => {
  it("reads a plain input", () => {
    expect(cellOf({ container: { w: 100, h: 50, fixed: "size" }, items })).toEqual({
      containerSize: "fixed",
      containerShape: "rect",
      itemShape: "rect",
      rotation: "none",
      order: "free",
      groups: "none",
    });
  });

  it("reads the size of the container from fixed", () => {
    const size = (container: PackInput["container"]) => cellOf({ container, items }).containerSize;
    expect(size({ w: 100, fixed: "width" })).toBe("freeHeight");
    expect(size({ h: 100, fixed: "height" })).toBe("freeWidth");
    expect(size({ fixed: "none" })).toBe("freeAspect");
    expect(size({ fixed: "none", aspectWeight: 0 })).toBe("freeArea");
  });

  it("reads the shapes, the obstacles, the rotation, the order and the groups", () => {
    const cell = cellOf({
      container: { fixed: "none", shape: { kind: "polygon", points: [[0, 0], [100, 0], [50, 20], [100, 80], [0, 80]] } },
      items: [
        { id: "a", w: 10, h: 10, rank: 1, group: "g", turnable: true },
        { id: "b", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 }, locked: true, x: 0, y: 0 },
      ],
      obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }],
    });
    expect(cell).toEqual({
      containerSize: "freeAspect",
      containerShape: "polygon",
      obstacleMove: "free",
      itemShape: "mixed",
      rotation: "quarter",
      order: "soft",
      groups: "flat",
    });
  });

  it("gives the hardest movement of the obstacles, and holes for an obstacle of another region", () => {
    const cell = cellOf({
      container: { w: 100, h: 100, fixed: "size" },
      items,
      obstacles: [
        { id: "o1", region: { kind: "circle", cx: 50, cy: 50, r: 10 } },
        { id: "o2", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 2 } },
        { id: "o3", region: { kind: "rect", x: 9, y: 0, w: 5, h: 5 }, move: { cost: 0 } },
      ],
    });
    expect(cell.obstacleMove).toBe("costly");
    expect(cell.containerShape).toBe("holes");
  });

  it("reads a convex polygon, a polygon with holes and nested groups", () => {
    const square = { kind: "polygon", points: [[0, 0], [10, 0], [10, 10], [0, 10]] } as const;
    expect(cellOf({ container: { fixed: "none", shape: { kind: "polygon", points: [[0, 0], [10, 0], [10, 10], [0, 10]] } }, items }).containerShape).toBe("convex");
    expect(
      cellOf({ container: { fixed: "none", shape: { kind: "polygon", points: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 4]]] } }, items }).containerShape,
    ).toBe("holes");
    const nested = cellOf({ container: { fixed: "none" }, items: [{ id: "a", w: 1, h: 1, parent: "p", shape: { kind: "polygon", points: square.points.map(([x, y]) => [x, y]) } }] });
    expect(nested.groups).toBe("nested");
    expect(nested.itemShape).toBe("polygon");
  });
});

describe("supportsCell and UnsupportedCell", () => {
  it("holds a cell only when each value is in the supports", () => {
    const shelf = strategy("shelf");
    expect(supportsCell(shelf.supports, { containerSize: "fixed", obstacleMove: "fixed" })).toBe(true);
    expect(supportsCell(shelf.supports, { obstacleMove: "free" })).toBe(false);
    expect(supportsCell(strategy("rows").supports, { obstacleMove: "fixed" })).toBe(true);
    expect(supportsCell(strategy("rows").supports, { obstacleMove: "free" })).toBe(false);
    expect(supportsCell(strategy("rows").supports, {})).toBe(true);
  });

  it("is thrown by push for a circle container, with the dimension and the value", () => {
    const input: PackInput = { container: { fixed: "size", shape: { kind: "circle", cx: 50, cy: 50, r: 50 } }, items };
    for (const s of strategies.filter((s) => s.id === "push")) {
      let error: unknown;
      try {
        s.pack(input, s.defaults, createContext(1));
      } catch (e) {
        error = e;
      }
      expect(error, s.id).toBeInstanceOf(UnsupportedCell);
      expect((error as UnsupportedCell).dimension).toBe("containerShape");
      expect((error as UnsupportedCell).value).toBe("circle");
      expect((error as UnsupportedCell).name).toBe("UnsupportedCell");
    }
  });

  it("is thrown for an item shape, a turnable item, a group, a circle obstacle and an obstacle that moves", () => {
    const container = { w: 100, h: 100, fixed: "size" } as const;
    const cases: [string, PackInput, string, string][] = [
      ["skyline", { container, items: [{ id: "a", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } }] }, "itemShape", "circle"],
      ["shelf", { container, items: [{ id: "a", w: 10, h: 10, turnable: true }] }, "rotation", "quarter"],
      ["push", { container, items: [{ id: "a", w: 10, h: 10, group: "g" }] }, "groups", "flat"],
      ["push", { container, items, obstacles: [{ id: "o", region: { kind: "circle", cx: 5, cy: 5, r: 5 } }] }, "containerShape", "holes"],
      ["shelf", { container, items, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }] }, "obstacleMove", "free"],
      ["push", { container, items, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 1 } }] }, "obstacleMove", "costly"],
      ["rows", { container, items, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }] }, "obstacleMove", "free"],
      ["push", { container: { fixed: "none" }, items }, "containerSize", "freeAspect"],
    ];
    for (const [id, input, dimension, value] of cases) {
      expect(() => packWith(id, input), `${id} ${dimension}`).toThrow(UnsupportedCell);
      try {
        packWith(id, input);
      } catch (e) {
        expect([(e as UnsupportedCell).dimension, (e as UnsupportedCell).value]).toEqual([dimension, value]);
      }
    }
  });
});

describe("the registry and the context", () => {
  it("has each strategy once, and refuses an unknown id", () => {
    expect(strategies.map((s) => s.id)).toEqual(["rows", "skyline", "shelf", "push", "maxrects", "guillotine"]);
    expect(() => strategy("nothing")).toThrow(RangeError);
  });

  it("gives the numbers of mulberry32 for a seed", () => {
    const a = mulberry32(7);
    const b = createContext(7).rng;
    const values = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(values);
    for (const v of values) expect(v >= 0 && v < 1).toBe(true);
  });
});
