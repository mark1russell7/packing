import { describe, expect, it } from "vitest";
import { DEFAULT_TOLERANCE, EPS, RECORD_EPS, marginOf, turnItem, turnPoint, turnPort, turnRegion, type Item } from "@mark1russell7/packing";

describe("the constants", () => {
  it("are those of docs/PACKER.md", () => {
    expect(EPS).toBe(1e-6);
    expect(RECORD_EPS).toBe(1e-3);
    expect(DEFAULT_TOLERANCE).toEqual({ overlap: 0.001, through: 0.5 });
  });
});

describe("the turn helper", () => {
  // An item 40 wide and 10 high. After a turn of 90 degrees clockwise (y down), it is 10 wide and 40 high.
  const h = 10;

  it("moves each corner of the item to the matching corner of the turned item", () => {
    expect(turnPoint(0, 0, h)).toEqual([10, 0]); // top-left -> top-right
    expect(turnPoint(40, 0, h)).toEqual([10, 40]); // top-right -> bottom-right
    expect(turnPoint(40, 10, h)).toEqual([0, 40]); // bottom-right -> bottom-left
    expect(turnPoint(0, 10, h)).toEqual([0, 0]); // bottom-left -> top-left
  });

  it("turns a port on each side", () => {
    expect(turnPort({ id: "t", side: "top", x: 15, y: 0 }, h)).toEqual({ id: "t", side: "right", x: 10, y: 15 });
    expect(turnPort({ id: "r", side: "right", x: 40, y: 4 }, h)).toEqual({ id: "r", side: "bottom", x: 6, y: 40 });
    expect(turnPort({ id: "b", side: "bottom", x: 25, y: 10 }, h)).toEqual({ id: "b", side: "left", x: 0, y: 25 });
    expect(turnPort({ id: "l", side: "left", x: 0, y: 7 }, h)).toEqual({ id: "l", side: "top", x: 3, y: 0 });
  });

  it("turns a port without a point to the next side only", () => {
    expect(turnPort({ id: "p", side: "left" }, h)).toEqual({ id: "p", side: "top" });
  });

  it("keeps each turned port on the border of the turned item", () => {
    const item: Item = {
      id: "a",
      w: 40,
      h: 10,
      ports: [
        { id: "t", side: "top", x: 15, y: 0 },
        { id: "r", side: "right", x: 40, y: 4 },
        { id: "b", side: "bottom", x: 25, y: 10 },
        { id: "l", side: "left", x: 0, y: 7 },
      ],
    };
    const turned = turnItem(item);
    expect([turned.w, turned.h]).toEqual([10, 40]);
    for (const p of turned.ports!) {
      const onSide = { top: p.y === 0, right: p.x === turned.w, bottom: p.y === turned.h, left: p.x === 0 }[p.side!];
      expect(onSide, p.id).toBe(true);
    }
  });

  it("turns the margin, the shape and keeps the corner, and does not change its argument", () => {
    const item: Item = { id: "a", w: 40, h: 10, x: 5, y: 6, margin: { top: 1, right: 2, bottom: 3, left: 4 }, shape: { kind: "rect", x: 0, y: 0, w: 40, h: 10 } };
    const copy = structuredClone(item);
    const turned = turnItem(item);
    expect(item).toEqual(copy);
    expect([turned.x, turned.y]).toEqual([5, 6]);
    expect(marginOf(turned)).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
    expect(turned.shape).toEqual({ kind: "rect", x: 0, y: 0, w: 10, h: 40 });
  });

  it("turns four times to the start", () => {
    const item: Item = { id: "a", w: 40, h: 10, margin: { top: 1, right: 2, bottom: 3, left: 4 }, ports: [{ id: "p", side: "top", x: 15, y: 0 }] };
    expect(turnItem(turnItem(turnItem(turnItem(item))))).toEqual(item);
  });

  it("turns the regions of each kind", () => {
    expect(turnRegion({ kind: "circle", cx: 5, cy: 2, r: 2 }, h)).toEqual({ kind: "circle", cx: 8, cy: 5, r: 2 });
    expect(turnRegion({ kind: "ellipse", cx: 20, cy: 5, rx: 20, ry: 5 }, h)).toEqual({ kind: "ellipse", cx: 5, cy: 20, rx: 5, ry: 20 });
    expect(turnRegion({ kind: "polygon", points: [[0, 0], [40, 0], [0, 10]] }, h)).toEqual({ kind: "polygon", points: [[10, 0], [10, 40], [0, 0]] });
  });
});
