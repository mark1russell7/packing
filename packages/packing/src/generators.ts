// The seeded generators of the corpus (`docs/FORMAT.md`, "The generators"). Each generator is a pipeline of 3 steps: the
// container, then the obstacles, then the boxes. Each step has its own random numbers: `mulberry32` of
// `fnv1a32("<seed>:<step>")`. Thus a packing input and a routing input with the same seed get the same obstacles.

import type { Item, LayoutContainer, Obstacle, Region } from "./contract.ts";
import {
  countCell,
  fnv1a32,
  hashInput,
  round3,
  type CorpusCell,
  type GeneratorParams,
  type GeneratedInput,
  type ObstacleLayout,
  type SizeDistribution,
} from "./layout-input.ts";
import { mulberry32, type DimensionValue } from "./strategy.ts";

/** The largest count of boxes that a generator makes. */
const MAX_COUNT = 100_000;

/** A seeded generator of `layout-input/1` files. The same version, parameters and seed give the same file, byte for byte. */
export interface CorpusGenerator<P extends GeneratorParams = GeneratorParams> {
  /** The name. The file writes it in `generator.name`. */
  readonly name: string;
  /** The version. A change of the output of a generator needs a new version. */
  readonly version: number;
  /** The default set of an input, when the call gives no set. */
  readonly set: string;
  /** The default parameters. */
  readonly defaults: Readonly<P>;
  /** For each parameter with a list of values, the values that the generator accepts. */
  readonly values: { readonly [K in keyof P]?: readonly P[K][] };
  /** This method gives the full parameters: the defaults with the given parameters over them. It throws a `RangeError` for a bad parameter. */
  withDefaults(params?: Partial<P>): P;
  /** This method gives the cell of each input of the parameters. The cell does not depend on the seed. */
  cell(params?: Partial<P>): CorpusCell;
  /** This method gives the input file of a seed. The `id` is `<set>/<family>/s<seed>`. */
  generate(seed: number, params?: Partial<P>, set?: string): GeneratedInput;
}

/** The parts of a file that a generator makes. */
type Parts = Pick<GeneratedInput, "container" | "boxes"> & { obstacles: Obstacle[] };

/** The data of a generator, before `defineGenerator` adds the common steps. */
interface GeneratorSpec<P extends GeneratorParams> {
  name: string;
  version: number;
  set: string;
  defaults: P;
  values: { readonly [K in keyof P]?: readonly P[K][] };
  family(params: P): string;
  cell(params: P): CorpusCell;
  build(seed: number, params: P): Parts;
}

/** A rectangle area in which the obstacles and the sizes of the boxes are made. */
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** This function gives the random numbers of one step of a seed. */
const stepRandom = (seed: number, step: string): (() => number) => mulberry32(fnv1a32(`${seed}:${step}`));

/** A whole number from lo to hi, both included. */
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** A whole number from the floor of lo to the floor of hi, both included. The upper end is not less than the lower end at any time. */
const span = (r: () => number, lo: number, hi: number): number => {
  const a = Math.floor(lo);
  return int(r, a, Math.max(a, Math.floor(hi)));
};

/** A number from lo to hi. */
const between = (r: () => number, lo: number, hi: number): number => lo + r() * (hi - lo);

/** This function gives an index with a probability in proportion to its weight. */
const pick = (r: () => number, weights: readonly number[]): number => {
  let x = r() * weights.reduce((a, b) => a + b, 0);
  for (const [i, w] of weights.entries()) {
    x -= w;
    if (x < 0) return i;
  }
  return weights.length - 1;
};

/** This function gives a copy of a value with each number rounded by `round3`. A key with the value `undefined` goes. */
function roundNumbers<T>(value: T): T {
  if (typeof value === "number") return round3(value) as T;
  if (Array.isArray(value)) return value.map(roundNumbers) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = roundNumbers(v);
    return out as T;
  }
  return value;
}

/** This function gives the cell of an input with rectangle items, no rotation, no order and no groups. */
function cellWith(
  containerSize: DimensionValue<"containerSize">,
  containerShape: DimensionValue<"containerShape">,
  obstacles: ObstacleLayout,
  sizes: SizeDistribution,
  count: number,
  locked = false,
): CorpusCell {
  const cell: CorpusCell = {
    containerSize,
    containerShape,
    itemShape: "rect",
    rotation: "none",
    order: "free",
    groups: "none",
    obstacles,
    sizes,
    count: countCell(count),
    mode: "offline",
  };
  if (obstacles !== "none" || locked) cell.obstacleMove = "fixed";
  return cell;
}

/** This function makes a generator from its data. It adds the defaults, the checks, the stamp, the rounding and the hash. */
function defineGenerator<P extends GeneratorParams>(spec: GeneratorSpec<P>): CorpusGenerator<P> {
  const withDefaults = (params: Partial<P> = {}): P => {
    const full: GeneratorParams = { ...spec.defaults };
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (!(key in spec.defaults)) throw new RangeError(`The generator "${spec.name}" has no parameter "${key}".`);
      full[key] = value;
    }
    for (const [key, allowed] of Object.entries(spec.values) as [string, readonly (string | number)[] | undefined][]) {
      if (allowed !== undefined && !allowed.includes(full[key]!)) {
        throw new RangeError(`The parameter "${key}" of the generator "${spec.name}" has no value "${String(full[key])}".`);
      }
    }
    const count = full["count"];
    if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_COUNT)) {
      throw new RangeError(`The parameter "count" of the generator "${spec.name}" is a whole number from 0 to ${MAX_COUNT}.`);
    }
    return full as P;
  };

  return Object.freeze({
    name: spec.name,
    version: spec.version,
    set: spec.set,
    defaults: Object.freeze({ ...spec.defaults }),
    values: spec.values,
    withDefaults,
    cell: (params?: Partial<P>): CorpusCell => spec.cell(withDefaults(params)),
    generate(seed: number, params?: Partial<P>, set: string = spec.set): GeneratedInput {
      if (!Number.isInteger(seed) || seed < 0) throw new RangeError(`The seed is a whole number from 0. It is ${seed}.`);
      const full = withDefaults(params);
      const family = spec.family(full);
      const { container, obstacles, boxes } = spec.build(seed, full);
      const file: Omit<GeneratedInput, "hash"> = roundNumbers({
        schema: "layout-input/1" as const,
        id: `${set}/${family}/s${seed}`,
        set,
        family,
        seed,
        source: "made-up",
        generator: { name: spec.name, version: spec.version, params: full, seed },
        container,
        obstacles,
        boxes,
        edges: [],
      });
      return { ...file, hash: hashInput(file) };
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The shared generator `rect-scattered` (version 1). `docs/FORMAT.md` gives it step by step. Do not change its output.

/** The parameters of `rect-scattered`. */
export type RectScatteredParams = { count: number };

/** The shared generator `rect-scattered` of `docs/FORMAT.md`, version 1: rectangle obstacles at random places in a fixed rectangle. */
export const rectScattered: CorpusGenerator<RectScatteredParams> = defineGenerator<RectScatteredParams>({
  name: "rect-scattered",
  version: 1,
  set: "xcheck-v1",
  defaults: { count: 40 },
  values: {},
  family: () => "rect-scattered",
  cell: (p) => cellWith("fixed", "rect", "scattered", "uniform", p.count),
  build(seed, { count }) {
    let r = stepRandom(seed, "container");
    const w = int(r, 600, 1000);
    const h = int(r, 400, 800);
    const container: LayoutContainer = { w, h, fixed: "size" };

    r = stepRandom(seed, "obstacles");
    const n = int(r, 3, 8);
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < n; i++) {
      const ow = int(r, 40, 160);
      const oh = int(r, 40, 160);
      const x = int(r, 0, w - ow);
      const y = int(r, 0, h - oh);
      obstacles.push({ id: `o${i}`, region: { kind: "rect", x, y, w: ow, h: oh } });
    }

    r = stepRandom(seed, "boxes");
    const boxes: Item[] = [];
    for (let i = 0; i < count; i++) {
      const bw = int(r, 20, 120);
      const bh = int(r, 20, 80);
      boxes.push({ id: `b${i}`, w: bw, h: bh });
    }
    return { container, obstacles, boxes };
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// The steps of `rect-grid` and of the families of a user interface.

/** The values of `containerSize` that the generators make. */
const CONTAINER_SIZES = ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"] as const;
/** The values of `containerShape`. */
const CONTAINER_SHAPES = ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const;
/** The values of `obstacles`. */
const OBSTACLE_LAYOUTS = ["none", "center", "scattered", "wall", "corridors", "touching", "edge"] as const;
/** The values of `sizes`. */
const SIZE_DISTRIBUTIONS = ["identical", "nearIdentical", "uniform", "heavyTail", "bimodal", "extremeAspect"] as const;

/** This function gives the container of a size value for the nominal rectangle `w` by `h`, with an optional shape. */
function containerOf(size: DimensionValue<"containerSize">, w: number, h: number, shape?: Region): LayoutContainer {
  const containers: Record<DimensionValue<"containerSize">, LayoutContainer> = {
    fixed: { w, h, fixed: "size" },
    freeHeight: { w, fixed: "width" },
    freeWidth: { h, fixed: "height" },
    freeAspect: { fixed: "none", aspect: round3(w / h) },
    freeArea: { fixed: "none", aspectWeight: 0 },
  };
  const container = containers[size];
  return shape === undefined ? container : { ...container, shape };
}

/** This function gives the 4 corners of a rectangle, clockwise from the top left. */
const corners = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * This function gives the shape of a container in the rectangle `w` by `h`, and its frame. The frame is a rectangle in
 * the shape. The obstacles and the sizes of the boxes come from the frame.
 */
function shapeOf(r: () => number, shape: DimensionValue<"containerShape">, w: number, h: number): { region?: Region; frame: Frame } {
  const m = Math.min(w, h);
  switch (shape) {
    case "rect":
      return { frame: { x: 0, y: 0, w, h } };
    case "convex": {
      // A rectangle with its 4 corners cut at 45 degrees
      const [a, b, c, d] = [0, 1, 2, 3].map(() => span(r, m * 0.1, m * 0.25)) as [number, number, number, number];
      const points: [number, number][] = [[a, 0], [w - b, 0], [w, b], [w, h - c], [w - c, h], [d, h], [0, h - d], [0, a]];
      const top = Math.max(a, b);
      const bottom = Math.max(c, d);
      return { region: { kind: "polygon", points }, frame: { x: 0, y: top, w, h: h - top - bottom } };
    }
    case "polygon": {
      // A rectangle with a notch at the bottom right: an L shape
      const nw = span(r, w * 0.25, w * 0.45);
      const nh = span(r, h * 0.25, h * 0.45);
      const points: [number, number][] = [[0, 0], [w, 0], [w, h - nh], [w - nw, h - nh], [w - nw, h], [0, h]];
      return { region: { kind: "polygon", points }, frame: { x: 0, y: 0, w: w - nw, h } };
    }
    case "circle": {
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const radius = Math.min(cx, cy);
      const side = 2 * Math.floor((radius * Math.SQRT2 - 1) / 2);
      return { region: { kind: "circle", cx, cy, r: radius }, frame: { x: cx - side / 2, y: cy - side / 2, w: side, h: side } };
    }
    case "ellipse": {
      const rx = Math.floor(w / 2);
      const ry = Math.floor(h / 2);
      const a = Math.floor(rx / Math.SQRT2);
      const b = Math.floor(ry / Math.SQRT2);
      return { region: { kind: "ellipse", cx: rx, cy: ry, rx, ry }, frame: { x: rx - a, y: ry - b, w: 2 * a, h: 2 * b } };
    }
    case "holes": {
      // 1 or 2 rectangle holes, the first in the left half and the second in the right half
      const count = int(r, 1, 2);
      const holes: [number, number][][] = [];
      for (let i = 0; i < count; i++) {
        const hw = span(r, w * 0.08, w * 0.15);
        const hh = span(r, h * 0.1, h * 0.25);
        const x = i === 0 ? span(r, 20, w / 2 - hw - 10) : span(r, w / 2 + 10, w - hw - 20);
        const y = span(r, 20, h - hh - 20);
        holes.push(corners(x, y, hw, hh));
      }
      return { region: { kind: "polygon", points: corners(0, 0, w, h), holes }, frame: { x: 0, y: 0, w, h } };
    }
  }
}

/** This function gives the obstacles of a layout in a frame. Each obstacle is a rectangle with whole-number sides. */
function obstaclesOf(r: () => number, layout: ObstacleLayout, f: Frame): Obstacle[] {
  const m = Math.min(f.w, f.h);
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  switch (layout) {
    case "none":
      break;
    case "center": {
      const w = span(r, f.w * 0.15, f.w * 0.3);
      const h = span(r, f.h * 0.15, f.h * 0.3);
      const jx = Math.floor(f.w * 0.05);
      const jy = Math.floor(f.h * 0.05);
      rects.push({ x: f.x + Math.floor((f.w - w) / 2) + int(r, -jx, jx), y: f.y + Math.floor((f.h - h) / 2) + int(r, -jy, jy), w, h });
      break;
    }
    case "scattered": {
      const n = int(r, 3, 8);
      for (let i = 0; i < n; i++) {
        const w = span(r, m * 0.05, m * 0.2);
        const h = span(r, m * 0.05, m * 0.2);
        rects.push({ x: int(r, f.x, f.x + f.w - w), y: int(r, f.y, f.y + f.h - h), w, h });
      }
      break;
    }
    case "wall": {
      // One long, thin obstacle from one side. It leaves a gap at its other end.
      const vertical = r() < 0.5;
      const across = vertical ? f.w : f.h;
      const along = vertical ? f.h : f.w;
      const thick = span(r, Math.max(1, across * 0.03), Math.max(1, across * 0.06));
      const length = span(r, along * 0.7, along * 0.85);
      const at = span(r, across * 0.3, across * 0.7 - thick);
      const from = r() < 0.5 ? 0 : along - length;
      rects.push(vertical ? { x: f.x + at, y: f.y + from, w: thick, h: length } : { x: f.x + from, y: f.y + at, w: length, h: thick });
      break;
    }
    case "corridors": {
      // A grid of blocks, with a narrow path between two blocks and between a block and the border
      const cols = int(r, 2, 4);
      const rows = int(r, 2, 3);
      const path = span(r, m * 0.08, m * 0.15);
      const bw = Math.floor((f.w - (cols + 1) * path) / cols);
      const bh = Math.floor((f.h - (rows + 1) * path) / rows);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) rects.push({ x: f.x + path + i * (bw + path), y: f.y + path + j * (bh + path), w: bw, h: bh });
      }
      break;
    }
    case "touching": {
      // A chain: each obstacle shares a part of a side with the obstacle before it
      const n = int(r, 2, 4);
      let w = span(r, m * 0.08, m * 0.15);
      let h = span(r, m * 0.08, m * 0.15);
      let x = span(r, f.x + f.w * 0.15, f.x + f.w * 0.35);
      let y = span(r, f.y + f.h * 0.15, f.y + f.h * 0.35);
      rects.push({ x, y, w, h });
      for (let i = 1; i < n; i++) {
        const right = r() < 0.5;
        const nw = span(r, m * 0.08, m * 0.15);
        const nh = span(r, m * 0.08, m * 0.15);
        if (right) {
          y = int(r, y, y + Math.floor(h / 2));
          x += w;
        } else {
          x = int(r, x, x + Math.floor(w / 2));
          y += h;
        }
        w = nw;
        h = nh;
        rects.push({ x, y, w, h });
      }
      break;
    }
    case "edge": {
      // Each obstacle touches one side of the frame
      const n = int(r, 2, 5);
      for (let i = 0; i < n; i++) {
        const side = int(r, 0, 3);
        const w = span(r, m * 0.06, m * 0.15);
        const h = span(r, m * 0.06, m * 0.15);
        const x = side === 1 ? f.x + f.w - w : side === 3 ? f.x : int(r, f.x, f.x + f.w - w);
        const y = side === 0 ? f.y : side === 2 ? f.y + f.h - h : int(r, f.y, f.y + f.h - h);
        rects.push({ x, y, w, h });
      }
      break;
    }
  }
  return rects.map((rect, i) => ({ id: `o${i}`, region: { kind: "rect", ...rect } }));
}

/**
 * This function gives the boxes of a size distribution for a frame. The mean box has an area of 40 percent of the
 * frame divided by the count. No box is wider or higher than the frame.
 */
function boxesOf(r: () => number, sizes: SizeDistribution, count: number, f: Frame): Item[] {
  const unit = Math.sqrt((f.w * f.h * 0.4) / Math.max(count, 1));
  const fit = (x: number, max: number): number => Math.min(Math.max(round3(x), 0.01), max);
  const boxes: Item[] = new Array<Item>(count);
  const put = (i: number, w: number, h: number): void => {
    boxes[i] = { id: `b${i}`, w: fit(w, f.w), h: fit(h, f.h) };
  };
  switch (sizes) {
    case "identical":
    case "nearIdentical": {
      const aspect = Math.sqrt(between(r, 0.6, 1.6));
      const bw = unit * aspect;
      const bh = unit / aspect;
      for (let i = 0; i < count; i++) {
        if (sizes === "identical") put(i, bw, bh);
        else put(i, bw * (1 + between(r, -0.03, 0.03)), bh * (1 + between(r, -0.03, 0.03)));
      }
      break;
    }
    case "uniform":
      for (let i = 0; i < count; i++) put(i, unit * between(r, 0.5, 1.5), unit * between(r, 0.5, 1.5));
      break;
    case "heavyTail": {
      // A Pareto distribution with the index 1.6, cut at 60 percent of the frame
      const cap = 0.6 * Math.min(f.w, f.h);
      for (let i = 0; i < count; i++) {
        const s = Math.min(0.6 * unit * (1 - r()) ** (-1 / 1.6), cap);
        put(i, s * between(r, 0.75, 1.33), s * between(r, 0.75, 1.33));
      }
      break;
    }
    case "bimodal":
      for (let i = 0; i < count; i++) {
        const s = r() < 0.25 ? 1.8 * unit : 0.6 * unit;
        put(i, s * between(r, 0.85, 1.15), s * between(r, 0.85, 1.15));
      }
      break;
    case "extremeAspect":
      for (let i = 0; i < count; i++) {
        const long = unit * between(r, 2.5, 4);
        const short = unit * between(r, 0.15, 0.35);
        if (r() < 0.5) put(i, long, short);
        else put(i, short, long);
      }
      break;
  }
  return boxes;
}

// ---------------------------------------------------------------------------------------------------------------------
// `rect-grid`: one input for each point of the grid of the packer dimensions.

/** The parameters of `rect-grid`: one value for each dimension of the taxonomy that it covers. */
export type RectGridParams = {
  containerSize: DimensionValue<"containerSize">;
  containerShape: DimensionValue<"containerShape">;
  obstacles: ObstacleLayout;
  sizes: SizeDistribution;
  count: number;
};

/**
 * The generator `rect-grid`, version 1: rectangle boxes for each value of `containerSize`, `containerShape`, `obstacles`
 * and `sizes`, with each count. The container is a nominal rectangle of 600 to 1000 by 400 to 800.
 */
export const rectGrid: CorpusGenerator<RectGridParams> = defineGenerator<RectGridParams>({
  name: "rect-grid",
  version: 1,
  set: "corpus-v1",
  defaults: { containerSize: "fixed", containerShape: "rect", obstacles: "none", sizes: "uniform", count: 100 },
  values: { containerSize: CONTAINER_SIZES, containerShape: CONTAINER_SHAPES, obstacles: OBSTACLE_LAYOUTS, sizes: SIZE_DISTRIBUTIONS },
  family: (p) => `rect-grid.${p.containerSize}.${p.containerShape}.${p.obstacles}.${p.sizes}.n${p.count}`,
  cell: (p) => cellWith(p.containerSize, p.containerShape, p.obstacles, p.sizes, p.count),
  build: gridOf,
});

/** This function builds an input of `rect-grid`: the container, then the obstacles, then the boxes. */
function gridOf(seed: number, p: RectGridParams): Parts {
  let r = stepRandom(seed, "container");
  const w = int(r, 600, 1000);
  const h = int(r, 400, 800);
  const { region, frame } = shapeOf(r, p.containerShape, w, h);
  const container = containerOf(p.containerSize, w, h, region);

  r = stepRandom(seed, "obstacles");
  const obstacles = obstaclesOf(r, p.obstacles, frame);

  r = stepRandom(seed, "boxes");
  return { container, obstacles, boxes: boxesOf(r, p.sizes, p.count, frame) };
}

/** The values of the parameter `order` of `rect-grid` version 2. The input format declares no hard order. */
const GRID_ORDERS = ["free", "soft"] as const;

/** The parameters of `rect-grid` version 2: the parameters of version 1 and the reading order of the boxes. */
export type RectGridV2Params = RectGridParams & {
  order: (typeof GRID_ORDERS)[number];
};

/**
 * The generator `rect-grid`, version 2: the inputs of version 1 with the parameter `order`. With `soft`, each box gets a
 * rank, a random permutation of the box indexes. With `free`, the boxes have no rank.
 */
export const rectGridV2: CorpusGenerator<RectGridV2Params> = defineGenerator<RectGridV2Params>({
  name: "rect-grid",
  version: 2,
  set: "corpus-v1",
  defaults: { containerSize: "fixed", containerShape: "rect", obstacles: "none", sizes: "uniform", order: "free", count: 100 },
  values: { containerSize: CONTAINER_SIZES, containerShape: CONTAINER_SHAPES, obstacles: OBSTACLE_LAYOUTS, sizes: SIZE_DISTRIBUTIONS, order: GRID_ORDERS },
  family: (p) => `rect-grid.${p.containerSize}.${p.containerShape}.${p.obstacles}.${p.sizes}.${p.order}.n${p.count}`,
  cell: (p) => ({ ...cellWith(p.containerSize, p.containerShape, p.obstacles, p.sizes, p.count), order: p.order }),
  build(seed, p) {
    const built = gridOf(seed, p);
    if (p.order === "free") return built;
    // A shuffle of Fisher and Yates gives the ranks
    const r = stepRandom(seed, "order");
    const ranks = built.boxes.map((_, i) => i);
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j]!, ranks[i]!];
    }
    return { ...built, boxes: built.boxes.map((b, i) => ({ ...b, rank: ranks[i]! })) };
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// The families of a user interface: gallery, dashboard, cards and word cloud.

/** The parameters of a family of a user interface. */
export type UiParams = {
  containerSize: DimensionValue<"containerSize">;
  count: number;
};

/** This function makes the generator of a family of a user interface. The container is 800 to 1400 by 600 to 1000, with no obstacle. */
function uiGenerator(name: string, sizes: SizeDistribution, count: number, boxes: (r: () => number, count: number) => Item[]): CorpusGenerator<UiParams> {
  return defineGenerator<UiParams>({
    name,
    version: 1,
    set: "corpus-v1",
    defaults: { containerSize: "freeHeight", count },
    values: { containerSize: CONTAINER_SIZES },
    family: (p) => `${name}.${p.containerSize}.n${p.count}`,
    cell: (p) => cellWith(p.containerSize, "rect", "none", sizes, p.count),
    build(seed, p) {
      const r = stepRandom(seed, "container");
      const w = int(r, 800, 1400);
      const h = int(r, 600, 1000);
      return { container: containerOf(p.containerSize, w, h), obstacles: [], boxes: boxes(stepRandom(seed, "boxes"), p.count) };
    },
  });
}

/** The aspects of the thumbnails of a gallery. */
const THUMBNAIL_ASPECTS = [1, 4 / 3, 3 / 2, 16 / 9];

/** The generator `gallery`, version 1: thumbnails with one size and one aspect (1, 4:3, 3:2 or 16:9). The default container has a fixed width. */
export const gallery: CorpusGenerator<UiParams> = uiGenerator("gallery", "identical", 100, (r, count) => {
  const aspect = THUMBNAIL_ASPECTS[int(r, 0, THUMBNAIL_ASPECTS.length - 1)]!;
  const w = int(r, 120, 240);
  return Array.from({ length: count }, (_, i) => ({ id: `b${i}`, w, h: round3(w / aspect) }));
});

/** The spans of the dashboard tiles in grid units, and their weights. */
const TILE_SPANS: readonly [number, number][] = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [4, 2]];
const TILE_WEIGHTS = [4, 3, 2, 3, 1, 1];

/** The generator `dashboard`, version 1: tiles in 6 standard sizes, from 1 by 1 to 4 by 2 grid units of 60 to 100. */
export const dashboard: CorpusGenerator<UiParams> = uiGenerator("dashboard", "bimodal", 10, (r, count) => {
  const unit = int(r, 60, 100);
  return Array.from({ length: count }, (_, i) => {
    const [cw, ch] = TILE_SPANS[pick(r, TILE_WEIGHTS)]!;
    return { id: `b${i}`, w: cw * unit, h: ch * unit };
  });
});

/** The generator `cards`, version 1: cards with one width from 200 to 320, and a height from 120 to 420 each. */
export const cards: CorpusGenerator<UiParams> = uiGenerator("cards", "uniform", 100, (r, count) => {
  const w = int(r, 200, 320);
  return Array.from({ length: count }, (_, i) => ({ id: `b${i}`, w, h: int(r, 120, 420) }));
});

/** The font sizes of a word cloud, and their weights: many small words and few large words. */
const FONT_SIZES = [12, 14, 16, 20, 28, 40];
const FONT_WEIGHTS = [30, 25, 20, 12, 8, 5];

/** The generator `word-cloud`, version 1: boxes of text. The height comes from 6 font sizes, the width from 3 to 12 letters. */
export const wordCloud: CorpusGenerator<UiParams> = uiGenerator("word-cloud", "heavyTail", 100, (r, count) =>
  Array.from({ length: count }, (_, i) => {
    const font = FONT_SIZES[pick(r, FONT_WEIGHTS)]!;
    const letters = int(r, 3, 12);
    return { id: `b${i}`, w: round3(letters * font * 0.6), h: round3(font * 1.25) };
  }),
);

// ---------------------------------------------------------------------------------------------------------------------
// `edge-cases`: the inputs at the limits.

/** The cases of `edge-cases`. */
export type EdgeCase = "empty" | "one" | "oversize" | "exactTiling" | "touchObstacles";

/** The parameters of `edge-cases`. The cases `empty` and `one` ignore `count`. */
export type EdgeCaseParams = { case: EdgeCase; count: number };

/** The values of `case`. */
const EDGE_CASES = ["empty", "one", "oversize", "exactTiling", "touchObstacles"] as const;

/** This function gives the largest divisor of `n` that is not more than the square root of `n`. */
const rowsOf = (n: number): number => {
  for (let d = Math.floor(Math.sqrt(n)); d > 1; d--) if (n % d === 0) return d;
  return 1;
};

/**
 * The generator `edge-cases`, version 1. Each case has a fixed rectangle container.
 *
 * - `empty`: no box.
 * - `one`: one box.
 * - `oversize`: `count` boxes. One box is wider than the container.
 * - `exactTiling`: `count` identical boxes that fill the container with no free space.
 * - `touchObstacles`: a locked box on the top of an obstacle, and boxes as wide as the path between 2 obstacles.
 */
export const edgeCases: CorpusGenerator<EdgeCaseParams> = defineGenerator<EdgeCaseParams>({
  name: "edge-cases",
  version: 1,
  set: "corpus-v1",
  defaults: { case: "oversize", count: 12 },
  values: { case: EDGE_CASES },
  family: (p) => (p.case === "empty" || p.case === "one" ? `edge-cases.${p.case}` : `edge-cases.${p.case}.n${p.count}`),
  cell: (p) => {
    switch (p.case) {
      case "empty":
        return cellWith("fixed", "rect", "none", "identical", 0);
      case "one":
        return cellWith("fixed", "rect", "none", "identical", 1);
      case "oversize":
        return cellWith("fixed", "rect", "none", "heavyTail", p.count);
      case "exactTiling":
        return cellWith("fixed", "rect", "none", "identical", p.count);
      case "touchObstacles":
        return cellWith("fixed", "rect", "corridors", "uniform", p.count, true);
    }
  },
  build(seed, p) {
    const needsBoxes = p.case === "oversize" || p.case === "exactTiling" || p.case === "touchObstacles";
    if (needsBoxes && p.count < 1) throw new RangeError(`The case "${p.case}" of "edge-cases" needs a count of 1 or more.`);

    let r = stepRandom(seed, "container");
    let w: number;
    let h: number;
    let tile = { w: 0, h: 0, cols: 0, rows: 0 };
    if (p.case === "exactTiling") {
      // The container step also picks the size of the tile, because the tiles give the size of the container
      const rows = rowsOf(p.count);
      tile = { w: int(r, 40, 120), h: int(r, 30, 90), cols: p.count / rows, rows };
      w = tile.cols * tile.w;
      h = tile.rows * tile.h;
    } else {
      w = int(r, 600, 1000);
      h = int(r, 400, 800);
    }
    const container: LayoutContainer = { w, h, fixed: "size" };

    r = stepRandom(seed, "obstacles");
    const obstacles: Obstacle[] = [];
    let path = 0;
    let first = { x: 0, y: 0 };
    if (p.case === "touchObstacles") {
      path = int(r, 40, 100);
      const ow = int(r, 60, 150);
      const oh = int(r, 100, 200);
      first = { x: span(r, w * 0.1, w * 0.25), y: span(r, h * 0.2, h * 0.4) };
      obstacles.push({ id: "o0", region: { kind: "rect", x: first.x, y: first.y, w: ow, h: oh } });
      obstacles.push({ id: "o1", region: { kind: "rect", x: first.x + ow + path, y: first.y, w: int(r, 60, 150), h: oh } });
    }

    r = stepRandom(seed, "boxes");
    const boxes: Item[] = [];
    switch (p.case) {
      case "empty":
        break;
      case "one":
        boxes.push({ id: "b0", w: int(r, 40, 200), h: int(r, 30, 150) });
        break;
      case "oversize": {
        const big = int(r, 0, p.count - 1);
        for (let i = 0; i < p.count; i++) {
          if (i === big) boxes.push({ id: `b${i}`, w: w + int(r, 10, 200), h: int(r, 40, 100) });
          else boxes.push({ id: `b${i}`, w: int(r, 20, 120), h: int(r, 20, 80) });
        }
        break;
      }
      case "exactTiling":
        for (let i = 0; i < p.count; i++) boxes.push({ id: `b${i}`, w: tile.w, h: tile.h });
        break;
      case "touchObstacles": {
        const lw = int(r, 30, 80);
        const lh = int(r, 20, 60);
        boxes.push({ id: "b0", w: lw, h: lh, x: first.x, y: first.y - lh, locked: true });
        for (let i = 1; i < p.count; i++) boxes.push({ id: `b${i}`, w: path, h: int(r, 20, 80) });
        break;
      }
    }
    return { container, obstacles, boxes };
  },
});

// ---------------------------------------------------------------------------------------------------------------------

/** Each generator of the package. */
export const generators: readonly CorpusGenerator[] = Object.freeze([rectScattered, rectGrid, rectGridV2, gallery, dashboard, cards, wordCloud, edgeCases] as CorpusGenerator[]);

/**
 * This function gives the generator with a name and a version. Without a version, it gives the first generator of the name
 * in `generators`: version 1 of `rect-grid`. It throws a `RangeError` for a name or a version that the package does not have.
 */
export function generator(name: string, version?: number): CorpusGenerator {
  const named = generators.filter((g) => g.name === name);
  if (named.length === 0) throw new RangeError(`The package has no generator "${name}".`);
  if (version === undefined) return named[0]!;
  const found = named.find((g) => g.version === version);
  if (found === undefined) throw new RangeError(`The generator "${name}" has the versions ${named.map((g) => g.version).join(", ")}, not ${version}.`);
  return found;
}
