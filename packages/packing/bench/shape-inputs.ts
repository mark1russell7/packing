// The made-up inputs of circles and convex polygons of roadmap item k91. They are code only: no corpus file has them.
// The bench tests of `bbox` use them, because each corpus of the bench has only `rect` items.

import type { LayoutBox, LayoutInput, Region } from "@mark1russell7/layout-contract";
import { mulberry32 } from "@mark1russell7/packing";

/** The shape kinds of the made-up family. `mixed` has circles and polygons. */
export type ShapeFamily = "circle" | "polygon" | "mixed";

/** The options of `shapeInput`. */
export interface ShapeInputOptions {
  /** The count of the items. The default is 30. */
  count?: number;
  /** The value `true` makes each item turnable. The default is `false`. */
  turnable?: boolean;
  /** The value `true` gives a container of fixed size with room for the items. The default is a fixed width. */
  fixedSize?: boolean;
}

/** This function gives a circle box: the box is the bounding square, and the circle touches each side. */
function circleBox(id: string, r: number): LayoutBox {
  return { id, w: 2 * r, h: 2 * r, shape: { kind: "circle", cx: r, cy: r, r } };
}

/**
 * This function gives a convex polygon box: 3 to 8 points on an ellipse, at sorted random angles.
 * The points move by an offset of 1 on each axis, so the bounding box does not start at the origin of the box.
 */
function polygonBox(id: string, rx: number, ry: number, r: () => number): LayoutBox {
  const n = 3 + Math.floor(r() * 6);
  const angles = Array.from({ length: n }, () => r() * 2 * Math.PI).sort((a, b) => a - b);
  const points = angles.map((a): [number, number] => [1 + rx + rx * Math.cos(a), 1 + ry + ry * Math.sin(a)]);
  const shape: Region = { kind: "polygon", points };
  return { id, w: 2 * rx + 2, h: 2 * ry + 2, shape };
}

/** This function gives the area of a shape: a circle, an ellipse, a rectangle, or a polygon without holes by the shoelace sum. */
export function shapeArea(box: LayoutBox): number {
  const s = box.shape;
  if (s === undefined) return box.w * box.h;
  switch (s.kind) {
    case "rect":
      return s.w * s.h;
    case "circle":
      return Math.PI * s.r * s.r;
    case "ellipse":
      return Math.PI * s.rx * s.ry;
    case "polygon": {
      let sum = 0;
      for (let i = 0; i < s.points.length; i++) {
        const [ax, ay] = s.points[i]!;
        const [bx, by] = s.points[(i + 1) % s.points.length]!;
        sum += ax * by - bx * ay;
      }
      return Math.abs(sum) / 2;
    }
  }
}

/**
 * This function gives one made-up input of the family `shapes-k91`. The same family, seed and options give the same input.
 * The radii are 2 to 10. A polygon has 2 radii, so its box is often not a square.
 */
export function shapeInput(family: ShapeFamily, seed: number, options: ShapeInputOptions = {}): LayoutInput {
  const r = mulberry32(seed);
  const count = options.count ?? 30;
  const boxes: LayoutBox[] = [];
  for (let i = 0; i < count; i++) {
    const kind = family === "mixed" ? (i % 2 === 0 ? "circle" : "polygon") : family;
    const id = `${kind[0]}${i}`;
    const box = kind === "circle" ? circleBox(id, 2 + r() * 8) : polygonBox(id, 2 + r() * 8, 2 + r() * 8, r);
    boxes.push(options.turnable === true ? { ...box, turnable: true } : box);
  }
  const area = boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  const w = Math.ceil(Math.sqrt(area) * 1.2);
  const container = options.fixedSize === true ? { w, h: w, fixed: "size" as const } : { w, fixed: "width" as const };
  return { schema: "layout-input/1", id: `shapes-k91/${family}/s${seed}`, source: "made-up", container, boxes };
}
