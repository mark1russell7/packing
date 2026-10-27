import type { Container, PackInput, PackOutput, Region } from "./contract.ts";

/** For each dimension of the taxonomy, the values that a strategy supports. `docs/research/TAXONOMY.md` gives the values. */
export interface Supports {
  containerSize: ("fixed" | "freeHeight" | "freeWidth" | "freeAspect" | "freeArea")[];
  containerShape: ("rect" | "convex" | "polygon" | "circle" | "ellipse" | "holes")[];
  /** The movement of the obstacles. An empty list supports only an input with no obstacle and no locked item. */
  obstacleMove: ("fixed" | "costly" | "free")[];
  itemShape: ("rect" | "circle" | "convex" | "polygon" | "mixed")[];
  rotation: ("none" | "quarter" | "any")[];
  order: ("free" | "soft" | "hard")[];
  groups: ("none" | "flat" | "nested")[];
  mode: ("offline" | "online" | "incremental")[];
}

/** A dimension of `Supports`. */
export type Dimension = keyof Supports;

/** A value of a dimension of `Supports`. */
export type DimensionValue<D extends Dimension = Dimension> = Supports[D][number];

/**
 * The cell of an input: one value for each packer dimension that the input tells. The input does not tell the mode.
 * Without obstacles and locked items, the cell has no `obstacleMove`.
 */
export interface Cell {
  containerSize: DimensionValue<"containerSize">;
  containerShape: DimensionValue<"containerShape">;
  obstacleMove?: DimensionValue<"obstacleMove">;
  itemShape: DimensionValue<"itemShape">;
  rotation: DimensionValue<"rotation">;
  order: DimensionValue<"order">;
  groups: DimensionValue<"groups">;
}

/** The context of one packing. */
export interface PackContext {
  /** The seed. A strategy gets each random number from `rng`, not from `Math.random`. */
  seed: number;
  /** The random numbers in `[0, 1)`, from `mulberry32` with `seed`. */
  rng: () => number;
  /** A limit for the strategies that search. The strategy gives its best result at the limit. */
  budget?: { ms?: number; steps?: number };
  /** The previous output, for the mode `incremental`. */
  previous?: PackOutput;
}

/** A packing strategy behind the Packer interface. */
export interface Strategy<O = unknown> {
  /** A stable name, for example `shelf`. The records use it. */
  id: string;
  /** The family of the catalog, for example `shelf` or `skyline`. */
  family: string;
  /** The ids of the catalog rows that this strategy builds. */
  catalog: string[];
  /** The cells that the strategy supports. */
  supports: Supports;
  /** The default options. A record writes the options in full. */
  defaults: O;
  /** The value `true` tells that the result depends only on the input, the options and the seed. */
  deterministic: boolean;
  /** This method packs an input. It throws `UnsupportedCell` for an input outside the cells of `supports`. */
  pack(input: PackInput, options: O, context: PackContext): PackOutput;
}

/** A size search: it gives a strategy of a fixed width the cells `freeAspect` and `freeArea`. */
export interface SizeSearch {
  id: string;
  /** This method searches the size of the container for an input with `fixed` set to `none`. `options` go to `inner`. */
  search(input: PackInput, inner: Strategy, context: PackContext, options?: unknown): PackOutput;
}

/**
 * The error of a strategy for an input outside its cells. The benchmark records this result. It is not a failure of the
 * strategy.
 */
export class UnsupportedCell extends Error {
  /** The dimension of the taxonomy. */
  readonly dimension: Dimension;
  /** The value of the input that the strategy does not support. */
  readonly value: string;

  constructor(dimension: Dimension, value: string) {
    super(`The strategy does not support the value "${value}" of the dimension "${dimension}".`);
    this.name = "UnsupportedCell";
    this.dimension = dimension;
    this.value = value;
  }
}

/** This function gives a generator of random numbers in `[0, 1)`: `mulberry32` of `docs/FORMAT.md`. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function makes the context of one packing from a seed. */
export function createContext(seed = 0, more: Omit<PackContext, "seed" | "rng"> = {}): PackContext {
  return { ...more, seed, rng: mulberry32(seed) };
}

/** This function tells if a polygon ring is convex. A ring with fewer than 3 points is convex. */
function isConvex(points: readonly [number, number][]): boolean {
  let sign = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % n]!;
    const [cx, cy] = points[(i + 2) % n]!;
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** This function gives the value of `containerShape` of one region. */
function shapeOf(region: Region): DimensionValue<"containerShape"> {
  switch (region.kind) {
    case "rect":
    case "circle":
    case "ellipse":
      return region.kind;
    case "polygon":
      if (region.holes && region.holes.length > 0) return "holes";
      return isConvex(region.points) ? "convex" : "polygon";
  }
}

/** This function gives the value of `itemShape` of one item shape. An ellipse is convex. */
function itemShapeOf(region: Region | undefined): DimensionValue<"itemShape"> {
  if (region === undefined) return "rect";
  switch (region.kind) {
    case "rect":
    case "circle":
      return region.kind;
    case "ellipse":
      return "convex";
    case "polygon":
      return !region.holes?.length && isConvex(region.points) ? "convex" : "polygon";
  }
}

/**
 * This function gives the cell of an input: the values of the packer dimensions that the input tells.
 *
 * - `containerSize` comes from `fixed`. The value `none` gives `freeArea` when `aspectWeight` is 0, and `freeAspect` if not.
 * - `containerShape` comes from the shape. A rectangle container with an obstacle of another region gives `holes`.
 * - `obstacleMove` is the hardest value of the obstacles and the locked items: `costly`, then `free`, then `fixed`.
 * - `order` is `soft` when an item has a rank, and `free` if not. The input does not tell a hard order.
 * - `groups` is `nested` when an item has a parent, `flat` when an item has a group, and `none` if not.
 */
export function cellOf(input: PackInput): Cell {
  const { container, items } = input;
  const obstacles = input.obstacles ?? [];

  const sizes: Record<Container["fixed"], DimensionValue<"containerSize">> = {
    size: "fixed",
    width: "freeHeight",
    height: "freeWidth",
    none: container.aspectWeight === 0 ? "freeArea" : "freeAspect",
  };
  const containerSize = sizes[container.fixed];

  let containerShape = container.shape ? shapeOf(container.shape) : "rect";
  if (containerShape === "rect" && obstacles.some((o) => o.region.kind !== "rect")) containerShape = "holes";

  let obstacleMove: DimensionValue<"obstacleMove"> | undefined = items.some((i) => i.locked === true) ? "fixed" : undefined;
  for (const o of obstacles) {
    const move = o.move === undefined ? "fixed" : o.move.cost > 0 ? "costly" : "free";
    if (move === "costly" || obstacleMove === undefined || (move === "free" && obstacleMove === "fixed")) obstacleMove = move;
  }

  const shapes = new Set(items.map((i) => itemShapeOf(i.shape)));
  const itemShape = shapes.size > 1 ? "mixed" : ([...shapes][0] ?? "rect");

  const cell: Cell = {
    containerSize,
    containerShape,
    itemShape,
    rotation: items.some((i) => i.turnable === true) ? "quarter" : "none",
    order: items.some((i) => i.rank !== undefined) ? "soft" : "free",
    groups: items.some((i) => i.parent !== undefined) ? "nested" : items.some((i) => i.group !== undefined) ? "flat" : "none",
  };
  if (obstacleMove !== undefined) cell.obstacleMove = obstacleMove;
  return cell;
}

/** This function gives the first dimension of a cell that `supports` does not hold, or `undefined` when it holds each one. */
export function unsupportedOf(supports: Supports, cell: Partial<Record<Dimension, string>>): { dimension: Dimension; value: string } | undefined {
  for (const dimension of Object.keys(supports) as Dimension[]) {
    const value = cell[dimension];
    if (value === undefined) continue;
    if (!(supports[dimension] as readonly string[]).includes(value)) return { dimension, value };
  }
  return undefined;
}

/** This function tells if `supports` holds each value of a cell. A dimension that the cell does not have is held. */
export function supportsCell(supports: Supports, cell: Partial<Record<Dimension, string>>): boolean {
  return unsupportedOf(supports, cell) === undefined;
}

/** This function throws `UnsupportedCell` for the first value of the cell of an input that `supports` does not hold. */
export function assertSupported(supports: Supports, input: PackInput): void {
  const miss = unsupportedOf(supports, cellOf(input));
  if (miss) throw new UnsupportedCell(miss.dimension, miss.value);
}
