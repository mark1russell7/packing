// The seeded generators of the corpus (`docs/FORMAT.md`, "The generators"). Each generator is a pipeline of 3 steps: the
// container, then the obstacles, then the boxes. Each step has its own random numbers: `mulberry32` of
// `fnv1a32("<seed>:<step>")`. Thus a packing input and a routing input with the same seed get the same obstacles.

import {
  createFamilyRegistry,
  RECT_SCATTERED,
  sharedDimension,
  type CorpusDimension,
  type CorpusFamily,
  type CrossEngine,
  type DimensionValues,
  type GenerateContext,
  type LayoutInput,
} from "@mark1russell7/layout-contract";
import type { Item, LayoutContainer, Obstacle, Region } from "./contract.ts";
import {
  countCell,
  fnv1a32,
  hashInput,
  round3,
  type CorpusCell,
  type GeneratorParams,
  type GeneratedInput,
  type KnownBest,
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

/** The parts of a file that a generator makes. A generator of known-best inputs also gives the known best value. */
type Parts = Pick<GeneratedInput, "container" | "boxes"> & { obstacles: Obstacle[]; known?: KnownBest };

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
      const { container, obstacles, boxes, known } = spec.build(seed, full);
      // An input without a known best value has no field known. Thus it keeps its bytes and its hash.
      const file: Omit<GeneratedInput, "hash"> = roundNumbers({
        schema: "layout-input/1" as const,
        id: `${set}/${family}/s${seed}`,
        set,
        family,
        seed,
        source: known === undefined ? "made-up" : `known-best:${spec.name}`,
        generator: { name: spec.name, version: spec.version, params: full, seed },
        container,
        obstacles,
        boxes,
        edges: [],
        ...(known === undefined ? {} : { known }),
      });
      return { ...file, hash: hashInput(file) };
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The shared generator `rect-scattered` (version 1). `docs/FORMAT.md` gives it step by step. Do not change its output.
// `RECT_SCATTERED` of `layout-contract` is its one copy (roadmap item k73). This generator takes its parts from it.

/** The parameters of `rect-scattered`. */
export type RectScatteredParams = { count: number };

/** The registry with only `RECT_SCATTERED` of the contract. The generator `rectScattered` uses it. */
const SHARED = createFamilyRegistry<LayoutInput>([RECT_SCATTERED]);

/** The shared generator `rect-scattered` of `docs/FORMAT.md`, version 1: rectangle obstacles at random places in a fixed rectangle. */
export const rectScattered: CorpusGenerator<RectScatteredParams> = defineGenerator<RectScatteredParams>({
  name: RECT_SCATTERED.name,
  version: RECT_SCATTERED.version,
  set: "xcheck-v1",
  defaults: { count: 40 },
  values: {},
  family: () => "rect-scattered",
  cell: (p) => cellWith("fixed", "rect", "scattered", "uniform", p.count),
  build(seed, { count }) {
    const file = SHARED.generate(RECT_SCATTERED.name, seed, { count }, { version: RECT_SCATTERED.version });
    return { container: file.container!, obstacles: [...(file.obstacles ?? [])], boxes: file.boxes };
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
// The inputs with a known best value (roadmap item k45): `perfect-cut` and `consecutive-squares`.

/** The parameters of `perfect-cut`. */
export type PerfectCutParams = {
  cut: "guillotine" | "free";
  containerSize: "fixed" | "freeHeight" | "freeArea";
  count: number;
};

/** The values of `containerSize` of `perfect-cut`. */
const CUT_SIZES: readonly PerfectCutParams["containerSize"][] = ["fixed", "freeHeight", "freeArea"];
/** The values of `cut` of `perfect-cut`. */
const CUTS: readonly PerfectCutParams["cut"][] = ["guillotine", "free"];

/** A piece of a cut: a rectangle at its place in the container. */
export interface CutPiece {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest side of a piece that a pinwheel cut divides. */
const PINWHEEL_MIN = 10;

/** This function gives the index of the piece with the largest area. The first piece wins a tie. */
function largestOf(pieces: readonly Frame[]): number {
  let best = 0;
  for (let i = 1; i < pieces.length; i++) if (pieces[i]!.w * pieces[i]!.h > pieces[best]!.w * pieces[best]!.h) best = i;
  return best;
}

/** This function cuts a piece in 2 with one straight line at a whole-number position. It throws a `RangeError` when the piece has no side of 2 or more. */
function guillotineCut(r: () => number, p: Frame): Frame[] {
  if (p.w < 2 && p.h < 2) throw new RangeError("The pieces of perfect-cut are too small for the count.");
  // Most cuts go across the longer side. Some go across the shorter side, so the pieces get many aspects.
  const longer = p.w >= p.h;
  let vertical = r() < 0.8 ? longer : !longer;
  if (vertical && p.w < 2) vertical = false;
  if (!vertical && p.h < 2) vertical = true;
  const side = vertical ? p.w : p.h;
  const at = Math.min(Math.max(span(r, side * 0.25, side * 0.75), 1), side - 1);
  return vertical
    ? [{ x: p.x, y: p.y, w: at, h: p.h }, { x: p.x + at, y: p.y, w: p.w - at, h: p.h }]
    : [{ x: p.x, y: p.y, w: p.w, h: at }, { x: p.x, y: p.y + at, w: p.w, h: p.h - at }];
}

/**
 * This function cuts a piece in 5 with a pinwheel: 4 pieces around a center piece. No straight line goes across the
 * piece without a cut through a part. Thus the pinwheel is not a guillotine cut.
 */
function pinwheelCut(r: () => number, p: Frame): Frame[] {
  const inner = (side: number): [number, number] => {
    const a = Math.max(1, span(r, side * 0.2, side * 0.45));
    const b = Math.min(side - 1, Math.max(a + 1, span(r, side * 0.55, side * 0.8)));
    return [a, b];
  };
  const [x1, x2] = inner(p.w);
  const [y1, y2] = inner(p.h);
  const { x, y, w, h } = p;
  return [
    { x, y, w: x2, h: y1 },
    { x: x + x2, y, w: w - x2, h: y2 },
    { x: x + x1, y: y + y2, w: w - x1, h: h - y2 },
    { x, y: y + y1, w: x1, h: h - y1 },
    { x: x + x1, y: y + y1, w: x2 - x1, h: y2 - y1 },
  ];
}

/**
 * This function cuts the rectangle `w` by `h` into `count` pieces. It cuts the piece with the largest area at each step.
 *
 * - With `guillotine`, each cut is a straight line across one piece.
 * - With `free`, the first cut is a pinwheel. A later cut is a pinwheel with the probability 0.3, when 4 or more pieces are still necessary.
 */
function cutsOf(r: () => number, cut: PerfectCutParams["cut"], count: number, w: number, h: number): Frame[] {
  const pieces: Frame[] = [{ x: 0, y: 0, w, h }];
  while (pieces.length < count) {
    const at = largestOf(pieces);
    const piece = pieces[at]!;
    const pinwheel = cut === "free" && count - pieces.length >= 4 && Math.min(piece.w, piece.h) >= PINWHEEL_MIN && (pieces.length === 1 || r() < 0.3);
    pieces.splice(at, 1, ...(pinwheel ? pinwheelCut(r, piece) : guillotineCut(r, piece)));
  }
  return pieces;
}

/** This function gives a copy of a list in the order of a shuffle of Fisher and Yates. */
function shuffled<T>(r: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * This function gives the container and the pieces of an input of `perfect-cut`, at their places in the cut. The pieces
 * are in the order of the boxes of the input, with the ids of the boxes. The pieces tile the container with no free space.
 */
export function perfectCutOf(seed: number, params: Partial<PerfectCutParams> = {}): { w: number; h: number; pieces: CutPiece[] } {
  const p = perfectCut.withDefaults(params);
  if (p.count < (p.cut === "free" ? 5 : 1)) {
    throw new RangeError(`The cut "${p.cut}" of "perfect-cut" needs a count of ${p.cut === "free" ? 5 : 1} or more.`);
  }
  const r = stepRandom(seed, "container");
  const w = int(r, 600, 1000);
  const h = int(r, 400, 800);
  const cuts = cutsOf(stepRandom(seed, "boxes"), p.cut, p.count, w, h);
  const pieces = shuffled(stepRandom(seed, "order"), cuts).map((c, i) => ({ id: `b${i}`, ...c }));
  return { w, h, pieces };
}

/**
 * The generator `perfect-cut`, version 1: a cut of a rectangle of 600 to 1000 by 400 to 800 into `count` pieces, in a
 * random order. The pieces fill the rectangle with no free space, so the best value is known.
 *
 * - With `fixed`, the container is the rectangle. The best layout places each box.
 * - With `freeHeight`, the container has the width of the rectangle. The best height is the height of the rectangle.
 * - With `freeArea`, the best area is the area of the rectangle.
 * - With the cut `free`, the first cut is a pinwheel. Thus a guillotine packer cannot reach the best value with that cut.
 */
export const perfectCut: CorpusGenerator<PerfectCutParams> = defineGenerator<PerfectCutParams>({
  name: "perfect-cut",
  version: 1,
  set: "known-v1",
  defaults: { cut: "guillotine", containerSize: "fixed", count: 30 },
  values: { cut: CUTS, containerSize: CUT_SIZES },
  family: (p) => `perfect-cut.${p.cut}.${p.containerSize}.n${p.count}`,
  cell: (p) => cellWith(p.containerSize, "rect", "none", "uniform", p.count),
  build(seed, p) {
    const { w, h, pieces } = perfectCutOf(seed, p);
    const known: KnownBest = { kind: "optimum", area: w * h, ...(p.containerSize === "freeHeight" ? { height: h } : {}), source: `perfect-cut.${p.cut}` };
    return { container: containerOf(p.containerSize, w, h), obstacles: [], boxes: pieces.map(({ id, w: bw, h: bh }) => ({ id, w: bw, h: bh })), known };
  },
});

/** The parameters of `consecutive-squares`. */
export type ConsecutiveSquaresParams = {
  containerSize: "freeHeight" | "freeArea";
  count: number;
};

/** The values of `containerSize` of `consecutive-squares`. */
const SQUARE_SIZES: readonly ConsecutiveSquaresParams["containerSize"][] = ["freeHeight", "freeArea"];

/**
 * The generator `consecutive-squares`, version 1: the squares of the sides `1` to `count`, times a scale from 2 to 8, in a
 * random order. Korf 2010 uses these squares as a benchmark of the smallest enclosing rectangle.
 *
 * The known value is a lower bound, not an optimum:
 *
 * - The bound of the area is the total area of the squares: `lb-area` of Martello 2003.
 * - With `freeHeight`, the width is 1 to 1.5 times the square root of the total area, and not less than the largest side.
 *   The bound of the height is the larger of the total area divided by the width and the largest side: `lb-area` and `lb-tallest`.
 */
export const consecutiveSquares: CorpusGenerator<ConsecutiveSquaresParams> = defineGenerator<ConsecutiveSquaresParams>({
  name: "consecutive-squares",
  version: 1,
  set: "known-v1",
  defaults: { containerSize: "freeHeight", count: 30 },
  values: { containerSize: SQUARE_SIZES },
  family: (p) => `consecutive-squares.${p.containerSize}.n${p.count}`,
  cell: (p) => cellWith(p.containerSize, "rect", "none", "uniform", p.count),
  build(seed, p) {
    if (p.count < 1) throw new RangeError(`The generator "consecutive-squares" needs a count of 1 or more.`);
    const r = stepRandom(seed, "container");
    const scale = int(r, 2, 8);
    const n = p.count;
    const area = (scale * scale * n * (n + 1) * (2 * n + 1)) / 6;
    const largest = n * scale;
    const w = Math.max(largest, Math.ceil(Math.sqrt(area) * between(r, 1, 1.5)));
    const sides = shuffled(stepRandom(seed, "order"), Array.from({ length: n }, (_, k) => (k + 1) * scale));
    const boxes: Item[] = sides.map((side, i) => ({ id: `b${i}`, w: side, h: side }));
    const free = p.containerSize === "freeHeight";
    const container: LayoutContainer = free ? { w, fixed: "width" } : containerOf("freeArea", w, w);
    // The bound goes down to 3 decimals, so the rounding of the file does not make it larger
    const height = Math.max(Math.floor((area / w) * 1000) / 1000, largest);
    const known: KnownBest = { kind: "bound", area, ...(free ? { height } : {}), source: "Martello 2003" };
    return { container, obstacles: [], boxes, known };
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// The classes of the literature (roadmap item k106): Berkey and Wang 1987, classes I to VI, and Martello and Vigo 1998,
// classes VII to X, as Lodi, Martello and Vigo 2002 give them. The generators use the rules of the classes, not a
// published file. Each size is a whole number.

/** The container sizes of a class: one bin of `W` by `H`, or a strip of the width `W` with a free height. */
export type ClassContainer = "fixed" | "freeHeight";

/** The values of `containerSize` of the class generators. */
const CLASS_SIZES: readonly ClassContainer[] = ["fixed", "freeHeight"];

/** The counts of the items of the classes in the literature: 20, 40, 60, 80 and 100. */
export const CLASS_COUNTS: readonly number[] = Object.freeze([20, 40, 60, 80, 100]);

/** The classes of Berkey and Wang 1987. */
export type BerkeyWangClass = "I" | "II" | "III" | "IV" | "V" | "VI";

/** The classes of Martello and Vigo 1998, with the numbers of Lodi, Martello and Vigo. */
export type MartelloVigoClass = "VII" | "VIII" | "IX" | "X";

/** The rule of a class of Berkey and Wang: the side of the square bin, and the range of the width and of the height of each item. */
export interface BerkeyWangRule {
  readonly bin: number;
  readonly min: number;
  readonly max: number;
}

/**
 * The rules of the classes of Berkey and Wang 1987. Each width and each height is uniform in `min` to `max`, both included.
 * The bin is a square of the side `bin`.
 */
export const BERKEY_WANG_RULES: Readonly<Record<BerkeyWangClass, BerkeyWangRule>> = Object.freeze({
  I: { bin: 10, min: 1, max: 10 },
  II: { bin: 30, min: 1, max: 10 },
  III: { bin: 40, min: 1, max: 35 },
  IV: { bin: 100, min: 1, max: 35 },
  V: { bin: 100, min: 1, max: 100 },
  VI: { bin: 300, min: 1, max: 100 },
});

/** The side of the square bin of the classes of Martello and Vigo. */
export const MARTELLO_VIGO_BIN = 100;

/**
 * The 4 item types of Martello and Vigo for a bin of the side 100. Each range is `[min, max]`, both included.
 *
 * - Type 1, wide: the width is 67 to 100 (2W/3 to W), and the height is 1 to 50 (1 to H/2).
 * - Type 2, high: the width is 1 to 50, and the height is 67 to 100.
 * - Type 3, large: the width and the height are 50 to 100 (W/2 to W).
 * - Type 4, small: the width and the height are 1 to 50.
 */
export const MARTELLO_VIGO_TYPES: readonly { readonly w: readonly [number, number]; readonly h: readonly [number, number] }[] = Object.freeze([
  { w: [67, 100], h: [1, 50] },
  { w: [1, 50], h: [67, 100] },
  { w: [50, 100], h: [50, 100] },
  { w: [1, 50], h: [1, 50] },
]);

/** For each class of Martello and Vigo, the index of its main type. The main type has the probability 0.7, and each other type 0.1. */
const MAIN_TYPE: Readonly<Record<MartelloVigoClass, number>> = Object.freeze({ VII: 0, VIII: 1, IX: 2, X: 3 });

/** The parameters of `berkey-wang`. */
export type BerkeyWangParams = { class: BerkeyWangClass; containerSize: ClassContainer; count: number };

/** The parameters of `martello-vigo`. */
export type MartelloVigoParams = { class: MartelloVigoClass; containerSize: ClassContainer; count: number };

/** The values of `class` of `berkey-wang`. */
const BW_CLASSES: readonly BerkeyWangClass[] = ["I", "II", "III", "IV", "V", "VI"];
/** The values of `class` of `martello-vigo`. */
const MV_CLASSES: readonly MartelloVigoClass[] = ["VII", "VIII", "IX", "X"];

/** This function gives the container of a class: the bin, or a strip of the width of the bin. */
const classContainer = (size: ClassContainer, bin: number): LayoutContainer => containerOf(size, bin, bin);

/**
 * The generator `berkey-wang`, version 1: the classes I to VI of Berkey and Wang 1987. Each width and each height is
 * uniform in the range of the class. The container is one square bin of the class, or a strip of its width.
 */
export const berkeyWang: CorpusGenerator<BerkeyWangParams> = defineGenerator<BerkeyWangParams>({
  name: "berkey-wang",
  version: 1,
  set: "classes-v1",
  defaults: { class: "I", containerSize: "freeHeight", count: 100 },
  values: { class: BW_CLASSES, containerSize: CLASS_SIZES },
  family: (p) => `berkey-wang.${p.class}.${p.containerSize}.n${p.count}`,
  cell: (p) => cellWith(p.containerSize, "rect", "none", "uniform", p.count),
  build(seed, p) {
    const rule = BERKEY_WANG_RULES[p.class];
    const r = stepRandom(seed, "boxes");
    const boxes: Item[] = [];
    for (let i = 0; i < p.count; i++) {
      const w = int(r, rule.min, rule.max);
      boxes.push({ id: `b${i}`, w, h: int(r, rule.min, rule.max) });
    }
    return { container: classContainer(p.containerSize, rule.bin), obstacles: [], boxes };
  },
});

/**
 * The generator `martello-vigo`, version 1: the classes VII to X of Martello and Vigo 1998. The bin is 100 by 100. Each
 * item gets its main type with the probability 0.7, and each other type with 0.1. Then its sides are uniform in the ranges of the type.
 */
export const martelloVigo: CorpusGenerator<MartelloVigoParams> = defineGenerator<MartelloVigoParams>({
  name: "martello-vigo",
  version: 1,
  set: "classes-v1",
  defaults: { class: "VII", containerSize: "freeHeight", count: 100 },
  values: { class: MV_CLASSES, containerSize: CLASS_SIZES },
  family: (p) => `martello-vigo.${p.class}.${p.containerSize}.n${p.count}`,
  // The wide items of VII and the high items of VIII have an aspect up to 100
  cell: (p) => cellWith(p.containerSize, "rect", "none", p.class === "VII" || p.class === "VIII" ? "extremeAspect" : "uniform", p.count),
  build(seed, p) {
    const main = MAIN_TYPE[p.class];
    const weights = MARTELLO_VIGO_TYPES.map((_, t) => (t === main ? 7 : 1));
    const r = stepRandom(seed, "boxes");
    const boxes: Item[] = [];
    for (let i = 0; i < p.count; i++) {
      const type = MARTELLO_VIGO_TYPES[pick(r, weights)]!;
      const w = int(r, type.w[0], type.w[1]);
      boxes.push({ id: `b${i}`, w, h: int(r, type.h[0], type.h[1]) });
    }
    return { container: classContainer(p.containerSize, MARTELLO_VIGO_BIN), obstacles: [], boxes };
  },
});

/**
 * This function gives the bin count bound L1 of an input, in its continuous form: the item area divided by the bin area,
 * rounded up. No packing puts the items in fewer bins. A container without a fixed size gives `null`.
 *
 * In one fixed bin, the bound `placed.free` of `objectiveBound` is the same fact: the placed share is at most `W * H` over the item area.
 */
export function binCountBound(input: { readonly container: LayoutContainer; readonly boxes?: readonly Item[]; readonly items?: readonly Item[] }): number | null {
  const { container } = input;
  if (container.fixed !== "size" || !(container.w !== undefined && container.w > 0 && container.h !== undefined && container.h > 0)) return null;
  const items = input.boxes ?? input.items ?? [];
  const area = items.reduce((sum, b) => sum + Math.max(0, b.w) * Math.max(0, b.h), 0);
  return Math.ceil(area / (container.w * container.h) - 1e-9);
}

// ---------------------------------------------------------------------------------------------------------------------

/** Each generator of the package. */
export const generators: readonly CorpusGenerator[] = Object.freeze([rectScattered, rectGrid, rectGridV2, gallery, dashboard, cards, wordCloud, edgeCases, perfectCut, consecutiveSquares, berkeyWang, martelloVigo] as CorpusGenerator[]);

/** The generators of the classes of the literature (roadmap item k106). */
export const classGenerators: readonly CorpusGenerator[] = Object.freeze([berkeyWang, martelloVigo] as CorpusGenerator[]);

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

// ---------------------------------------------------------------------------------------------------------------------
// The corpus families: each generator as a `CorpusFamily` of the shared registry of `layout-contract` (`docs/CORPUS.md`).

/** The largest count of the dimension `count` of a family. */
const MAX_FAMILY_COUNT = 10_000;

/**
 * The knobs of each family: `margin`, `gap` and `shape`. A knob at its default adds no field to the input, so the hash
 * does not change. The generators make rectangle items only, so a sweep of `shape` gives `rect` only.
 */
const KNOBS: readonly CorpusDimension[] = Object.freeze([
  sharedDimension("margin"),
  sharedDimension("gap"),
  sharedDimension("shape", { levels: ["rect"], meaning: "The shape kind of each item. The generators of packing make rectangle items only." }),
]);

/** The seeding of the 3 steps of a generator. */
const SEEDING = "stepRandom(seed, container) gives the container and its shape. stepRandom(seed, obstacles) gives the obstacles. stepRandom(seed, boxes) gives the boxes.";

/** This function gives the dimension `count` of a generator, with the default of the generator, from 0 to 10000 on a log scale. */
const countDimension = (value: number, patch: Partial<CorpusDimension> = {}): CorpusDimension =>
  sharedDimension("count", { max: MAX_FAMILY_COUNT, default: value, ...patch });

/** This function gives an `enum` dimension of the shared table with the values of a generator and its default. */
const enumDimension = (name: string, values: readonly string[], value: string): CorpusDimension =>
  sharedDimension(name, { values: Object.freeze([...values]), default: value });

/** This function gives the number of a dimension. It throws a `RangeError` for a value that is not a finite number. */
const numberOf = (dims: DimensionValues, name: string): number => {
  const v = dims[name];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`The dimension "${name}" is a number, not ${String(v)}.`);
  return v;
};

/**
 * This function gives an input with the knobs over it. A margin above 0 goes on each box, and a gap above 0 goes on the
 * input. Each value above 0 adds a part to the family: `.m<margin>` and `.g<gap>`. Then the id and the hash change.
 * The function throws a `RangeError` for a shape other than `rect`.
 */
function withKnobs(file: GeneratedInput, dims: DimensionValues): GeneratedInput {
  if (dims["shape"] !== "rect") throw new RangeError(`The generators of packing make rectangle items only, not the shape "${String(dims["shape"])}".`);
  const margin = round3(numberOf(dims, "margin"));
  const gap = round3(numberOf(dims, "gap"));
  if (margin === 0 && gap === 0) return file;
  // A margin or a gap changes the best value, so the known best value of the generator goes.
  const { hash: _hash, known: _known, ...rest } = file;
  const family = `${rest.family}${margin === 0 ? "" : `.m${margin}`}${gap === 0 ? "" : `.g${gap}`}`;
  const body: Omit<GeneratedInput, "hash"> = {
    ...rest,
    id: `${rest.set}/${family}/s${rest.seed}`,
    family,
    boxes: margin === 0 ? rest.boxes : rest.boxes.map((b) => ({ ...b, margin })),
    ...(gap === 0 ? {} : { gap }),
  };
  return { ...body, hash: hashInput(body) };
}

/** The data of a family, after its generator. */
interface FamilySpec {
  meaning: string;
  /** The dimensions of the parameters of the generator, in the order of its defaults. */
  dimensions: readonly CorpusDimension[];
  crossEngine: CrossEngine;
  seeding?: string;
}

/**
 * This function makes the family of a generator. Its dimensions are the parameters of the generator, then the knobs.
 * `generate` gives the input of the generator with the set of the context, then the knobs over it.
 */
function familyOf<P extends GeneratorParams>(gen: CorpusGenerator<P>, spec: FamilySpec): CorpusFamily<GeneratedInput> {
  const keys = Object.keys(gen.defaults);
  const names = spec.dimensions.map((d) => d.name);
  if (keys.join() !== names.join()) throw new RangeError(`The family "${gen.name}" has the dimensions ${names.join(", ")}, not the parameters ${keys.join(", ")}.`);
  return Object.freeze({
    name: gen.name,
    version: gen.version,
    owner: "packing",
    meaning: spec.meaning,
    dimensions: Object.freeze([...spec.dimensions, ...KNOBS]),
    seeding: spec.seeding ?? SEEDING,
    crossEngine: spec.crossEngine,
    generate(seed: number, dims: DimensionValues, context: GenerateContext): GeneratedInput {
      const params = Object.fromEntries(keys.map((k) => [k, dims[k]])) as Partial<P>;
      return withKnobs(gen.generate(seed, params, context.set), dims);
    },
  });
}

/** The dimensions of `rect-grid` version 1. */
const GRID_DIMENSIONS: readonly CorpusDimension[] = [
  enumDimension("containerSize", CONTAINER_SIZES, "fixed"),
  enumDimension("containerShape", CONTAINER_SHAPES, "rect"),
  enumDimension("obstacles", OBSTACLE_LAYOUTS, "none"),
  enumDimension("sizes", SIZE_DISTRIBUTIONS, "uniform"),
  countDimension(100),
];

/** The family `rect-grid`, version 1. It is `libm-dependent`, because the sizes `heavyTail` use `**`. */
export const rectGridFamily: CorpusFamily<GeneratedInput> = familyOf(rectGrid, {
  meaning: "Rectangle boxes for each container size, container shape, obstacle layout, size distribution and count.",
  dimensions: GRID_DIMENSIONS,
  crossEngine: "libm-dependent",
});

/** The family `rect-grid`, version 2: version 1 with the dimension `order`. Only version 2 has `order`. */
export const rectGridV2Family: CorpusFamily<GeneratedInput> = familyOf(rectGridV2, {
  meaning: "The inputs of rect-grid version 1, with no order or with a rank on each box.",
  dimensions: [...GRID_DIMENSIONS.slice(0, 4), enumDimension("order", GRID_ORDERS, "free"), GRID_DIMENSIONS[4]!],
  crossEngine: "libm-dependent",
  seeding: `${SEEDING} stepRandom(seed, order) gives the ranks of the order soft.`,
});

/** This function gives the dimensions of a family of a user interface: `containerSize` and `count`. */
const uiDimensions = (count: number): CorpusDimension[] => [enumDimension("containerSize", CONTAINER_SIZES, "freeHeight"), countDimension(count)];

/** The family `gallery`, version 1. */
export const galleryFamily: CorpusFamily<GeneratedInput> = familyOf(gallery, {
  meaning: "Thumbnails with one size and one aspect, as in a photo gallery.",
  dimensions: uiDimensions(100),
  crossEngine: "exact",
});

/** The family `dashboard`, version 1. */
export const dashboardFamily: CorpusFamily<GeneratedInput> = familyOf(dashboard, {
  meaning: "Dashboard tiles in 6 standard sizes of grid units.",
  dimensions: uiDimensions(10),
  crossEngine: "exact",
});

/** The family `cards`, version 1. */
export const cardsFamily: CorpusFamily<GeneratedInput> = familyOf(cards, {
  meaning: "Cards with one width and a different height each.",
  dimensions: uiDimensions(100),
  crossEngine: "exact",
});

/** The family `word-cloud`, version 1. */
export const wordCloudFamily: CorpusFamily<GeneratedInput> = familyOf(wordCloud, {
  meaning: "Boxes of text in 6 font sizes: many small words and few large words.",
  dimensions: uiDimensions(100),
  crossEngine: "exact",
});

/** The family `edge-cases`, version 1. The cases `empty` and `one` ignore `count`, so `count` has a `when`. */
export const edgeCasesFamily: CorpusFamily<GeneratedInput> = familyOf(edgeCases, {
  meaning: "The inputs at the limits: no box, one box, an oversize box, an exact tiling and boxes that touch obstacles.",
  dimensions: [
    { name: "case", kind: "enum", values: EDGE_CASES, default: "oversize", meaning: "The case at the limits.", engines: ["packing"] },
    countDimension(12, { when: { param: "case", in: ["oversize", "exactTiling", "touchObstacles"] } }),
  ],
  crossEngine: "exact",
});

/** The family of `perfectCut`: the pieces of a cut of the container, with the known best value of the cut. */
export const perfectCutFamily: CorpusFamily<GeneratedInput> = familyOf(perfectCut, {
  meaning: "The pieces of a cut of a rectangle. The input has a known best value. A margin or a gap removes it.",
  dimensions: [
    { name: "cut", kind: "enum", values: CUTS, default: "guillotine", meaning: "The kind of cut: guillotine cuts, or a free cut. A free cut needs a count of 5 or more.", engines: ["packing"] },
    enumDimension("containerSize", CUT_SIZES, "fixed"),
    countDimension(30, { min: 1 }),
  ],
  crossEngine: "exact",
});

/** The family of `consecutiveSquares`: the squares of side 1 to `count`, with the known best value of the area. */
export const consecutiveSquaresFamily: CorpusFamily<GeneratedInput> = familyOf(consecutiveSquares, {
  meaning: "The squares of side 1 to the count. The input has a known best value. A margin or a gap removes it.",
  dimensions: [enumDimension("containerSize", SQUARE_SIZES, "freeHeight"), countDimension(30, { min: 1 })],
  crossEngine: "exact",
});

/** The seeding of the class families: the class gives the container, so only the boxes take random numbers. */
const CLASS_SEEDING = "stepRandom(seed, boxes) gives the type and the sides of each item. The class gives the container, so the container takes no random numbers.";

/** This function gives the dimensions of a class family: `class`, `containerSize` and `count`, with the counts of the literature as the levels. */
const classDimensions = (classes: readonly string[], value: string, meaning: string): CorpusDimension[] => [
  { name: "class", kind: "enum", values: Object.freeze([...classes]), default: value, meaning, engines: ["packing"] },
  {
    ...enumDimension("containerSize", CLASS_SIZES, "freeHeight"),
    meaning: "The container: one bin of the class (fixed), or a strip of the width of the bin with a free height (freeHeight).",
  },
  countDimension(100, { min: 1, levels: Object.freeze([...CLASS_COUNTS]) }),
];

/** The family of `berkeyWang`: the classes I to VI of Berkey and Wang 1987. */
export const berkeyWangFamily: CorpusFamily<GeneratedInput> = familyOf(berkeyWang, {
  meaning: "The classes I to VI of Berkey and Wang 1987: uniform sides in a square bin of the class, or a strip of its width.",
  dimensions: classDimensions(BW_CLASSES, "I", "The class of Berkey and Wang: the side of the bin and the range of the item sides."),
  crossEngine: "exact",
  seeding: CLASS_SEEDING,
});

/** The family of `martelloVigo`: the classes VII to X of Martello and Vigo 1998. */
export const martelloVigoFamily: CorpusFamily<GeneratedInput> = familyOf(martelloVigo, {
  meaning: "The classes VII to X of Martello and Vigo 1998: 4 item types in a bin of 100 by 100, or a strip of the width 100.",
  dimensions: classDimensions(MV_CLASSES, "VII", "The class of Martello and Vigo: the item type with the probability 0.7."),
  crossEngine: "exact",
  seeding: CLASS_SEEDING,
});

/**
 * Each corpus family of the package, for `createFamilyRegistry` of `layout-contract`. An import registers nothing.
 * The family `rect-scattered` is not in the list: `RECT_SCATTERED` of `layout-contract` is its shared copy.
 */
export const corpusFamilies: readonly CorpusFamily<GeneratedInput>[] = Object.freeze([
  rectGridFamily,
  rectGridV2Family,
  galleryFamily,
  dashboardFamily,
  cardsFamily,
  wordCloudFamily,
  edgeCasesFamily,
  perfectCutFamily,
  consecutiveSquaresFamily,
  berkeyWangFamily,
  martelloVigoFamily,
]);
