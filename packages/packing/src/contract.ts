// The data types of the Packer contract (docs/PACKER.md). They are plain data, with no class and no method.
// The shared package `@mark1russell7/layout-contract` gets these types later. Until then, this file is a local copy.

/** A region. The forms and the rules are those of `docs/FORMAT.md`. The y axis points down. */
export type Region =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: [number, number][]; holes?: [number, number][][] }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

/** The container of a packing. */
export interface Container {
  /** The width. Without it, the packer searches the width. */
  w?: number;
  /** The height. Without it, the packer searches the height. */
  h?: number;
  /** The sides that stay: `size` keeps `w` and `h`, `width` keeps `w`, `height` keeps `h`, and `none` searches both. */
  fixed: "size" | "width" | "height" | "none";
  /** The target aspect (the width divided by the height) for the value `none` of `fixed`. The default is 1. */
  aspect?: number;
  /** The weight of the aspect error in the objective. The value 0 gives the least area. The default is 1. */
  aspectWeight?: number;
  /** The shape. Without it, the container is the rectangle from 0, 0 to `w`, `h`. */
  shape?: Region;
  /** The space between the border and the items with their margins. The default is 0. */
  inset?: number;
}

/** An obstacle: an area that no item enters. */
export interface Obstacle {
  id: string;
  region: Region;
  /** Without it, the obstacle stays. With it, the packer can move the obstacle for `cost` times the distance. */
  move?: { cost: number };
}

/** The margin of an item on each side. */
export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A port on the border of an item. */
export interface Port {
  id: string;
  side: "top" | "right" | "bottom" | "left";
  /** The point on the border of the item, relative to its top-left corner. Without it, the router chooses the point. */
  x?: number;
  y?: number;
}

/** An item to pack. The file format names it a box. */
export interface Item {
  id: string;
  w: number;
  h: number;
  /** The reading order. Without it, the index in the array is the rank. */
  rank?: number;
  group?: string;
  parent?: string;
  /** A shape relative to the origin of the item. Without it, the item is the rectangle `w` by `h`. */
  shape?: Region;
  /** A locked item keeps `x` and `y`. The packer reads it as an obstacle. */
  locked?: boolean;
  x?: number;
  y?: number;
  /** The value `true` lets the packer turn the item by 90 degrees. The default is `false`. */
  turnable?: boolean;
  /** A ring around the item that no other item and no route enters. The default is 0. */
  margin?: number | Margin;
  /** The ports. The packer keeps them, and turns them with the item. */
  ports?: Port[];
}

/** The input of a packing: a `layout-input/1` file without `edges`, with `items` for `boxes`. */
export interface PackInput {
  container: Container;
  items: Item[];
  obstacles?: Obstacle[];
  /** The free space between two items with their margins. Routes use this space. The default is 0. */
  gap?: number;
}

/** The position of one item after the packing. */
export interface Placement {
  id: string;
  x: number;
  y: number;
  /** The turn: 0 or 90, only for an item with `turnable` set to `true`. */
  turn?: 0 | 90;
}

/** The facts of one stage of a packing. */
export interface StageTrace {
  /** The id of the stage, for example `skyline` or `log-sweep`. */
  id: string;
  /** The time of the stage in milliseconds. */
  ms: number;
  /** The measures of the stage, by the names of `docs/FORMAT.md`. */
  measures: Record<string, number>;
}

/** The output of a packing. The output does not change the input. */
export interface PackOutput {
  placements: Placement[];
  /** The ids of the items that the packer did not place. */
  overflow: string[];
  /** The size of the container after the packing. For a free size, the size that the search found. */
  size: { w: number; h: number };
  /** The new positions of the obstacles that moved. */
  moved: { id: string; x: number; y: number }[];
  /** The facts of each stage, for the site and the records. */
  trace: StageTrace[];
}

/** The tolerances of the hard rules. */
export interface Tolerance {
  /** The rule `no-overlap`: two boxes overlap only by more than this value. */
  overlap: number;
  /** The router rule that a route does not go through a box. */
  through: number;
}

/** The tolerance for the comparison of two numbers in an engine. */
export const EPS = 1e-6;

/** The tolerance for the comparison of two numbers of a file. The files round to 3 decimals. */
export const RECORD_EPS = 1e-3;

/** The default tolerances of the hard rules. Each record writes its tolerances in its top-level field `tolerance`. */
export const DEFAULT_TOLERANCE: Readonly<Tolerance> = Object.freeze({ overlap: 0.001, through: 0.5 });

/** This function gives the margin of an item on each side. A number is the same margin on each side. */
export function marginOf(item: Pick<Item, "margin">): Margin {
  const m = item.margin ?? 0;
  if (typeof m === "number") return { top: m, right: m, bottom: m, left: m };
  return { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
}

/** The side of a port after a turn of 90 degrees clockwise. */
const TURNED_SIDE = { top: "right", right: "bottom", bottom: "left", left: "top" } as const;

/** This function gives the point `px`, `py` of an item of height `h` after a turn of 90 degrees clockwise. */
export function turnPoint(px: number, py: number, h: number): [number, number] {
  return [h - py, px];
}

/** This function turns a port of an item of height `h` by 90 degrees clockwise. The side turns from top to right. */
export function turnPort(port: Port, h: number): Port {
  const turned: Port = { id: port.id, side: TURNED_SIDE[port.side] };
  if (port.x !== undefined && port.y !== undefined) {
    const [x, y] = turnPoint(port.x, port.y, h);
    turned.x = x;
    turned.y = y;
  } else if (port.x !== undefined) {
    // Only x is set: x becomes the new y, and the router chooses the new x
    turned.y = port.x;
  } else if (port.y !== undefined) {
    // Only y is set: h - y becomes the new x, and the router chooses the new y
    turned.x = h - port.y;
  }
  return turned;
}

/** This function turns a region relative to an item of height `h` by 90 degrees clockwise. */
export function turnRegion(region: Region, h: number): Region {
  switch (region.kind) {
    case "rect":
      return { kind: "rect", x: h - region.y - region.h, y: region.x, w: region.h, h: region.w };
    case "circle": {
      const [cx, cy] = turnPoint(region.cx, region.cy, h);
      return { kind: "circle", cx, cy, r: region.r };
    }
    case "ellipse": {
      const [cx, cy] = turnPoint(region.cx, region.cy, h);
      return { kind: "ellipse", cx, cy, rx: region.ry, ry: region.rx };
    }
    case "polygon": {
      const turnRing = (ring: [number, number][]): [number, number][] => ring.map(([x, y]) => turnPoint(x, y, h));
      const turned: Region = { kind: "polygon", points: turnRing(region.points) };
      if (region.holes) turned.holes = region.holes.map(turnRing);
      return turned;
    }
  }
}

/**
 * This function gives an item after a turn of 90 degrees clockwise, with the y axis down (decision 1 of
 * `docs/PACKER.md`). The width and the height change places. The top-left corner, the id and the other fields stay.
 * The ports, the shape and the margin turn with the item. The function does not change its argument.
 */
export function turnItem(item: Item): Item {
  const turned: Item = { ...item, w: item.h, h: item.w };
  if (item.ports) turned.ports = item.ports.map((p) => turnPort(p, item.h));
  if (item.shape) turned.shape = turnRegion(item.shape, item.h);
  if (item.margin !== undefined && typeof item.margin !== "number") {
    const m = item.margin;
    turned.margin = { top: m.left, right: m.top, bottom: m.right, left: m.bottom };
  }
  return turned;
}
