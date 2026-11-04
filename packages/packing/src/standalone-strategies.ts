// The strategies of roadmap item k141. Each strategy here wraps one standalone function, so `packWith`, the bench and the sites reach it.
// The functions keep their own API. These strategies are not in the registry, `pack`, `SELECT_TABLE` or `packSpace`. `strategy-list.ts` lists them.

import { packBinaryHeight, type BinaryHeightOptions } from "./binary-height.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { exactStrip, exactStripRefusal, type ExactStripOptions } from "./exact-strip.ts";
import { columnsLinearPartition, masonryLpt, masonryShortest, type MasonryOptions } from "./masonry.ts";
import { packNearRects, type NearRectsOptions } from "./near-rects.ts";
import { packRasterNofit, type RasterNofitOptions } from "./raster-nofit.ts";
import { packSideAnchors, type SideAnchor, type SideAnchorOptions } from "./side-anchors.ts";
import { sleatorRefusal, sleatorStrip } from "./sleator.ts";
import { assertSupported, UnsupportedCell, type PackContext, type Strategy, type Supports } from "./strategy.ts";
import { treemapPack, treemapPivotSplit, treemapSliceDice, treemapSquarified, treemapStrip, type TreemapLayout } from "./treemap.ts";

/** The largest count of items that `binary-height`, `near-rects` and `raster-nofit` take. Their search time grows fast with the count. */
export const STANDALONE_MAX_ITEMS = 256;

/** The node limit of the strategy `exact-strip`. The function `exactStrip` has a higher limit of its own. */
export const EXACT_STRATEGY_NODE_LIMIT = 100_000;

/** The trials of the strategy `binary-height`. The function `packBinaryHeight` has a higher default. */
const BINARY_HEIGHT_TRIALS = 32;

/** The cells of a rectangle strip of a fixed width, with no obstacle and no group. */
const STRIP_SUPPORTS: Supports = {
  containerSize: ["freeHeight"],
  containerShape: ["rect"],
  obstacleMove: [],
  itemShape: ["rect"],
  rotation: ["none", "quarter"],
  order: ["free", "soft"],
  groups: ["none"],
  mode: ["offline"],
};

/** This function gives the cells of a strip with some changes. A call has the pure mark, so a bundle of `pack` drops these strategies. */
function cells(changes: Partial<Supports>): Supports {
  return { ...STRIP_SUPPORTS, ...changes };
}

/** The cells of a free container. The columns or the frame set its size. */
const FREE_SUPPORTS: Supports = /* @__PURE__ */ cells({ containerSize: ["freeAspect", "freeArea"] });

/** This function gives an `UnsupportedCell` for a refusal of an input that no dimension of the taxonomy tells, for example a gap. */
function refusal(reason: string): UnsupportedCell {
  const error = new UnsupportedCell("containerSize", "refused");
  error.message = `The strategy refuses the input: ${reason}.`;
  return error;
}

/**
 * This function starts a standalone function on an input. A `RangeError` of the function becomes an `UnsupportedCell`.
 * Thus the bench records a skip for an input that the function refuses, and not a failure.
 */
function refusing<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError) throw refusal(error.message);
    throw error;
  }
}

/** This function refuses an input with more items than the search takes. */
function assertCount(input: PackInput): void {
  if (input.items.length > STANDALONE_MAX_ITEMS) throw refusal(`the input has more than ${STANDALONE_MAX_ITEMS} items`);
}

/** The strategy `sleator`: `sleatorStrip` of roadmap item k52. Its proved bound is 2.5 times the optimum. */
export const sleatorStrategy: Strategy<Record<string, never>> = {
  id: "sleator",
  family: "sleator",
  catalog: [],
  supports: STRIP_SUPPORTS,
  defaults: {},
  deterministic: true,
  pack(input: PackInput): PackOutput {
    assertSupported(sleatorStrategy.supports, input);
    const reason = sleatorRefusal(input);
    if (reason !== null) throw refusal(reason);
    return sleatorStrip(input).output;
  },
};

/** The strategy `exact-strip`: `exactStrip` of roadmap item k10, with a lower node limit. At the limit, it gives its best layout with no proof. */
export const exactStripStrategy: Strategy<ExactStripOptions> = {
  id: "exact-strip",
  family: "exact",
  catalog: [],
  supports: STRIP_SUPPORTS,
  defaults: { nodeLimit: EXACT_STRATEGY_NODE_LIMIT },
  deterministic: true,
  pack(input: PackInput, options: ExactStripOptions): PackOutput {
    assertSupported(exactStripStrategy.supports, input);
    const reason = exactStripRefusal(input);
    if (reason !== null) throw refusal(reason);
    return exactStrip(input, options).output;
  },
};

/** The strategy `binary-height`: `packBinaryHeight` of roadmap item k81, with fewer trials. The context gives the seed. */
export const binaryHeightStrategy: Strategy<BinaryHeightOptions> = {
  id: "binary-height",
  family: "binary-height",
  catalog: ["search-binary-height"],
  supports: STRIP_SUPPORTS,
  defaults: { trials: BINARY_HEIGHT_TRIALS },
  deterministic: true,
  pack(input: PackInput, options: BinaryHeightOptions, context: PackContext): PackOutput {
    assertSupported(binaryHeightStrategy.supports, input);
    assertCount(input);
    return refusing(() => packBinaryHeight(input, { seed: context.seed, ...options }).output);
  },
};

/** The strategy `near-rects`: `packNearRects` of roadmap item k97. It reads shapes on a grid. */
export const nearRectsStrategy: Strategy<NearRectsOptions> = {
  id: "near-rects",
  family: "near-rects",
  catalog: ["learn-super-patch"],
  supports: /* @__PURE__ */ cells({ containerSize: ["fixed", "freeHeight"], itemShape: ["rect", "polygon", "circle", "mixed"] }),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: NearRectsOptions, context: PackContext): PackOutput {
    assertSupported(nearRectsStrategy.supports, input);
    assertCount(input);
    return refusing(() => packNearRects(input, { seed: context.seed, ...options }));
  },
};

/** The strategy `raster-nofit`: `packRasterNofit` of roadmap item k92. A fixed obstacle stays, and a locked item keeps its place. */
export const rasterNofitStrategy: Strategy<RasterNofitOptions> = {
  id: "raster-nofit",
  family: "raster-nofit",
  catalog: ["nest-raster-brkga"],
  supports: /* @__PURE__ */ cells({ containerSize: ["fixed", "freeHeight"], obstacleMove: ["fixed"], itemShape: ["rect", "polygon", "circle", "mixed"] }),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: RasterNofitOptions, context: PackContext): PackOutput {
    assertSupported(rasterNofitStrategy.supports, input);
    assertCount(input);
    return refusing(() => packRasterNofit(input, { seed: context.seed, ...options }));
  },
};

/** The methods of the strategy `masonry`. */
export type MasonryMethod = "shortest" | "lpt" | "linear-partition";

/** The options of the strategy `masonry`. */
export interface MasonryStrategyOptions extends MasonryOptions {
  /** The method of the catalog. */
  readonly method: MasonryMethod;
}

const MASONRY_METHODS: Readonly<Record<MasonryMethod, (input: PackInput, options: MasonryOptions) => PackOutput>> = {
  shortest: masonryShortest,
  lpt: masonryLpt,
  "linear-partition": columnsLinearPartition,
};

/** The strategy `masonry`: the three column layouts of roadmap item k28, one for each `method`. The default is 4 columns. */
export const masonryStrategy: Strategy<MasonryStrategyOptions> = {
  id: "masonry",
  family: "masonry",
  catalog: ["masonry-shortest", "masonry-lpt", "columns-linear-partition"],
  supports: FREE_SUPPORTS,
  defaults: { method: "shortest", columns: 4 },
  deterministic: true,
  pack(input: PackInput, options: MasonryStrategyOptions): PackOutput {
    assertSupported(masonryStrategy.supports, input);
    return refusing(() => MASONRY_METHODS[options.method](input, options));
  },
};

/** The methods of the strategy `treemap`. */
export type TreemapMethod = "squarified" | "slice-dice" | "strip" | "pivot-split";

/** The options of the strategy `treemap`. */
export interface TreemapStrategyOptions {
  /** The layout of the cells. */
  readonly method: TreemapMethod;
}

const TREEMAP_METHODS: Readonly<Record<TreemapMethod, TreemapLayout>> = {
  squarified: treemapSquarified,
  "slice-dice": treemapSliceDice,
  strip: treemapStrip,
  "pivot-split": treemapPivotSplit,
};

/** The strategy `treemap`: `treemapPack` of roadmap item k27 with the layout of `method`. Each box keeps its size. */
export const treemapStrategy: Strategy<TreemapStrategyOptions> = {
  id: "treemap",
  family: "treemap",
  catalog: ["treemap-squarified", "treemap-slice-dice", "treemap-strip", "treemap-pivot-split"],
  supports: FREE_SUPPORTS,
  defaults: { method: "squarified" },
  deterministic: true,
  pack(input: PackInput, options: TreemapStrategyOptions): PackOutput {
    assertSupported(treemapStrategy.supports, input);
    return refusing(() => treemapPack(input, TREEMAP_METHODS[options.method]));
  },
};

/** The options of the strategy `side-anchors`. */
export interface SideAnchorStrategyOptions extends Omit<SideAnchorOptions, "seed"> {
  /** The anchors of named items. */
  readonly anchors?: readonly SideAnchor[];
  /** One anchor for the first item of the input. An entry of the bench uses it, because an entry cannot name the items of each input. */
  readonly first?: Omit<SideAnchor, "id">;
}

/** The strategy `side-anchors`: `packSideAnchors` of roadmap item k110 around a member. With no anchor, it gives the layout of the member. */
export const sideAnchorsStrategy: Strategy<SideAnchorStrategyOptions> = {
  id: "side-anchors",
  family: "side-anchors",
  catalog: [],
  supports: /* @__PURE__ */ cells({ containerSize: ["fixed", "freeHeight", "freeWidth"] }),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: SideAnchorStrategyOptions, context: PackContext): PackOutput {
    assertSupported(sideAnchorsStrategy.supports, input);
    const { anchors = [], first, ...rest } = options;
    const head = input.items[0];
    const all = first === undefined || head === undefined ? anchors : [...anchors, { ...first, id: head.id }];
    return refusing(() => packSideAnchors(input, all, { seed: context.seed, ...rest }).output);
  },
};

/**
 * The single strategies that a bench entry reaches by id. Each corpus run skips the cells that a strategy does not support.
 */
export const standaloneStrategies: readonly Strategy[] = /* @__PURE__ */ Object.freeze([sleatorStrategy, exactStripStrategy, binaryHeightStrategy, nearRectsStrategy, rasterNofitStrategy, masonryStrategy, treemapStrategy] as Strategy[]);
