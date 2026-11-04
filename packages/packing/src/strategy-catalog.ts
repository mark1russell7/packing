// The strategy catalog of the engine `packing` (roadmap item k144). It gives each strategy and each option as data of the schema
// `strategy-catalog/1` of `@mark1russell7/layout-contract`, so a chooser renders them with no code for each strategy.
// The ids, the families, the kinds, the supports and the defaults come from the live strategies. This module holds only the text and the ranges.
// The subpath `./strategy-catalog` exports the constant, so the root bundle does not pay for the declarations.
// The range of a number option is the range of a control. A strategy can take a value outside it, as the option comments of each strategy tell.

import {
  catalogOptions,
  type AnyOption,
  type CatalogEntry,
  type CatalogLimit,
  type NoDefaultReason,
  type OptionSchema,
  type StrategyCatalogSource,
} from "@mark1russell7/layout-contract";
import { BEST_FIT_SIDES } from "./best-fit.ts";
import { BOTTOM_LEFT_RULES } from "./bottom-left.ts";
import type { BboxStrategyOptions } from "./bbox.ts";
import type { BeamOptions } from "./beam.ts";
import { BEAM_WIDTH } from "./beam.ts";
import type { BestFitStrategyOptions, BottomLeftStrategyOptions } from "./bottom-left-strategy.ts";
import type { BinaryHeightOptions } from "./binary-height.ts";
import { EXACT_STRIP_MAX_ITEMS, EXACT_STRIP_MAX_SIDE, type ExactStripOptions } from "./exact-strip.ts";
import type { ForceStrategyOptions } from "./force.ts";
import { GUILLOTINE_CHOICES, GUILLOTINE_SPLITS } from "./guillotine.ts";
import { HOLE_DEGREE_MAX_STEPS, type HoleDegreeStrategyOptions } from "./hole-degree.ts";
import type { GuillotineStrategyOptions, LayoutStrategyOptions, MaxRectsStrategyOptions, SkylineStrategyOptions } from "./layout-strategy.ts";
import { MAXRECTS_RULES } from "./maxrects.ts";
import type { NearRectsOptions } from "./near-rects.ts";
import { GRAPH_ORDERS, SORT_ORDERS } from "./order.ts";
import type { AnnealStrategyOptions, GeneticStrategyOptions, TabuStrategyOptions } from "./order-search.ts";
import type { OverlapMinStrategyOptions } from "./overlap-min.ts";
import type { PortfolioStrategyOptions } from "./portfolio-strategy.ts";
import type { PushStrategyOptions } from "./push-strategy.ts";
import type { RasterNofitOptions } from "./raster-nofit.ts";
import { allStrategies as registered, type AspectFitStrategyOptions, type StrategyListing } from "./registry.ts";
import type { RelaxStrategyOptions } from "./relax.ts";
import { RESTART_PERTURBS, type RestartsStrategyOptions } from "./restarts.ts";
import { RUIN_KINDS, type RuinRecreateStrategyOptions } from "./ruin-recreate.ts";
import { SELECT_MEMBERS, type SelectStrategyOptions } from "./select-core.ts";
import { SHELF_FITS } from "./shelf.ts";
import { SKYLINE_RULES } from "./skyline.ts";
import {
  MASONRY_METHOD_IDS,
  STANDALONE_MAX_ITEMS,
  TREEMAP_METHOD_IDS,
  type MasonryStrategyOptions,
  type SideAnchorStrategyOptions,
  type TreemapStrategyOptions,
} from "./standalone-strategies.ts";
import { allStrategies, strategy } from "./strategy-list.ts";

/** The name of the engine in the catalog: the npm name without its scope. */
export const STRATEGY_CATALOG_ENGINE = "packing";

/** The largest seed of the seeded strategies. */
const MAX_SEED = 0xffffffff;

/** This function gives the statement of an option without a default value. */
function none(reason: NoDefaultReason, describe: string): { readonly noDefault: { readonly reason: NoDefaultReason; readonly describe: string } } {
  return { noDefault: { reason, describe } };
}

/** The member of a composite with a default: `maxrects` with the rule `bl`. */
const MAXRECTS_BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** The declaration of one member. A composite finds only a strategy of the registry, so the declaration leaves out the opt-in strategies. */
const MEMBER_ITEM = { type: "strategy", kinds: ["single"], inlineOptions: true, optIn: false } as const;

/** The declaration of the option `member` of a composite. */
const MEMBER = { ...MEMBER_ITEM, describe: "The strategy that the composite packs with.", default: MAXRECTS_BL } as const;

/** The declaration of the option `sortOrder` with the orders of the items and the graph orders. */
const SORT_ORDER = { type: "enum", describe: "The order of the items before the packing.", values: [...SORT_ORDERS, ...GRAPH_ORDERS] } as const;

/** The declaration of the option `samples`. */
const SAMPLES = { type: "integer", describe: "The number of widths that the first pass of the size search tries.", min: 12, max: 192, scale: "log" } as const;

/** The declaration of the option `rotate`. */
const ROTATE = { type: "boolean", describe: "This option lets each turnable item that is not locked turn by 90 degrees." } as const;

/** The declaration of the option `iterations` of a search with a default of some tens. */
const ITERATIONS = { type: "integer", describe: "The count of the steps of the search.", min: 1, max: 256, scale: "log" } as const;

/** The declaration of the option `budgetWork`. A cut by this limit is the same on each computer. */
const BUDGET_WORK = {
  type: "integer",
  describe: "The limit of the work, in work units of packWork. A cut by this limit is the same on each computer.",
  min: 4000,
  max: 256000,
  scale: "log",
  marks: [4000, 16000, 64000, 256000],
  ...none("unset", "Without a limit, each step starts."),
} as const;

/** The declaration of the option `budgetMs`. A cut by this limit makes the result depend on the clock. */
const BUDGET_MS = {
  type: "number",
  describe: "The time limit in milliseconds. A cut by this limit makes the result depend on the clock.",
  min: 1,
  max: 2000,
  scale: "log",
  ...none("unset", "Without a limit, the clock has no effect."),
} as const;

/** The declaration of the option `key` of a search. */
const KEY = {
  type: "list",
  describe: "The measure ids of the key after the hard breaks.",
  ...none("derived", "Without a key, the strategy uses the levels of PORTFOLIO_LEVELS."),
} as const;

/** The declaration of the option `seed` of a seeded strategy. */
const SEED = {
  type: "integer",
  describe: "The seed of the random stream.",
  min: 0,
  max: MAX_SEED,
  ...none("derived", "Without a seed, the strategy uses the seed of the call."),
} as const;

/** The declaration of the option `cell`. */
const CELL = {
  type: "number",
  describe: "The side of a grid cell. The function rounds it down.",
  min: 1,
  max: 256,
  scale: "log",
  ...none("derived", "Without a side, the strategy calculates it from the boxes."),
} as const;

/** The schema of `rows`. `fit` is only an option of `shelf`. */
const ROWS = { sortOrder: SORT_ORDER, samples: SAMPLES } satisfies OptionSchema<Omit<LayoutStrategyOptions, "fit">>;

/** The schema of `aspect-fit`. */
const ASPECT_FIT = {
  strategy: {
    type: "strategy",
    describe: "The inner strategy.",
    kinds: ["single"],
    optionsKey: "options",
    optIn: false,
    ...none("required", "The strategy refuses a call without this option."),
  },
  options: { type: "object", describe: "The options of the inner strategy.", ...none("unset", "Without options, the inner strategy uses its defaults.") },
  targetAspect: {
    type: "number",
    describe: "The width over the height that the layout aims at.",
    min: 0.25,
    max: 4,
    scale: "log",
    ...none("derived", "Without a target, the strategy uses the aspect of the container, else 1."),
  },
} satisfies OptionSchema<AspectFitStrategyOptions>;

/** The schema of a search of orders: the options of `anneal`, `genetic` and `tabu` that are the same. */
const ORDER_SEARCH = { member: MEMBER, iterations: ITERATIONS, budgetWork: BUDGET_WORK } as const;

/** The schemas of the strategies, by id. Each schema has a key for each option of the type of the strategy, so a new option fails the build. */
const SCHEMAS: Readonly<Record<string, Readonly<Record<string, AnyOption>>>> = {
  rows: ROWS,
  skyline: {
    ...ROWS,
    rule: { type: "enum", describe: "The rule to choose a place on the skyline.", values: SKYLINE_RULES },
    wasteMap: { type: "boolean", describe: "This option keeps the free areas below the skyline, and each item tries them first." },
    rotate: ROTATE,
  } satisfies OptionSchema<Omit<SkylineStrategyOptions, "fit">>,
  shelf: {
    ...ROWS,
    fit: { type: "enum", describe: "The rule to choose a shelf.", values: SHELF_FITS, ...none("unset", "Without a rule, each item goes on the last shelf or on a new shelf.") },
  } satisfies OptionSchema<LayoutStrategyOptions>,
  maxrects: {
    ...ROWS,
    rule: { type: "enum", describe: "The rule to choose a free rectangle.", values: MAXRECTS_RULES },
    rotate: ROTATE,
    bandHeight: {
      type: "number",
      describe: "The largest height of a band of a container that is not a plain rectangle.",
      min: 1,
      max: 64,
      scale: "log",
      ...none("derived", "Without a height, the strategy calculates it from the container."),
    },
  } satisfies OptionSchema<Omit<MaxRectsStrategyOptions, "fit">>,
  guillotine: {
    ...ROWS,
    choice: { type: "enum", describe: "The rule to choose a free rectangle.", values: GUILLOTINE_CHOICES },
    split: { type: "enum", describe: "The rule to split a free rectangle.", values: GUILLOTINE_SPLITS },
    rotate: ROTATE,
    merge: { type: "boolean", describe: "This option joins two free rectangles with a common full edge after each item." },
  } satisfies OptionSchema<Omit<GuillotineStrategyOptions, "fit">>,
  push: {
    sortOrder: { type: "enum", describe: "The order of the items that the cascade does not place.", values: SORT_ORDERS },
    maxShovesPerItem: { type: "integer", describe: "The most shoves for each item. The cascade stops at this limit.", min: 1, max: 64, scale: "log" },
  } satisfies OptionSchema<PushStrategyOptions>,
  "bottom-left": {
    ...ROWS,
    rule: { type: "enum", describe: "The rule to slide a box.", values: BOTTOM_LEFT_RULES },
  } satisfies OptionSchema<BottomLeftStrategyOptions>,
  "best-fit": {
    ...ROWS,
    side: { type: "enum", describe: "The side of a gap for a box.", values: BEST_FIT_SIDES },
  } satisfies OptionSchema<BestFitStrategyOptions>,
  "hole-degree": {
    steps: { type: "integer", describe: "The count of the halving steps of the height search. The value 0 keeps the open strip.", min: 0, max: HOLE_DEGREE_MAX_STEPS },
  } satisfies OptionSchema<HoleDegreeStrategyOptions>,
  "circle-quasi-physical": {
    iterations: { type: "integer", describe: "The count of the moves after the first layout. The value 0 keeps the first local minimum.", min: 0, max: 1024 },
  },
  portfolio: {
    k: {
      type: "integer",
      describe: "The size of the set of the cell. The strategy refuses this option with the option members.",
      min: 2,
      max: 3,
      values: [2, 3],
      ...none("unset", "Without a size, the strategy uses the set of 3."),
    },
    maxMembers: {
      type: "integer",
      describe: "The largest count of the members that run.",
      min: 1,
      max: 5,
      ...none("derived", "Without a count, the cell gives the count."),
    },
    budgetMs: BUDGET_MS,
    budgetWork: BUDGET_WORK,
    members: {
      type: "list",
      describe: "The members for each input, in place of the set of the cell.",
      of: MEMBER_ITEM,
      min: 1,
      ...none("derived", "Without members, the table of the sets gives the members of the cell of the input."),
    },
    key: KEY,
  } satisfies OptionSchema<PortfolioStrategyOptions>,
  "aspect-fit": ASPECT_FIT,
  select: {
    members: { type: "list", describe: "The members. A pick of the table is an index of this list.", of: MEMBER_ITEM, min: 1, default: SELECT_MEMBERS },
    table: { type: "object", describe: "The decision table.", ...none("unset", "Without a table, the strategy uses SELECT_TABLE.") },
  } satisfies OptionSchema<SelectStrategyOptions>,
  restarts: {
    member: MEMBER,
    iterations: { ...ITERATIONS, describe: "The count of the restarts, restart 0 included." },
    perturb: { type: "enum", describe: "The change of the order of each restart after restart 0.", values: RESTART_PERTURBS },
    strength: { type: "number", describe: "The share of the positions that move.", min: 0, max: 1 },
    key: KEY,
    limitTime: { type: "boolean", describe: "This option sets the time limit budgetMs." },
    budgetMs: { ...BUDGET_MS, when: { param: "limitTime", in: [true] } },
    budgetWork: BUDGET_WORK,
  } satisfies OptionSchema<RestartsStrategyOptions>,
  bbox: {
    member: MEMBER,
    turn: { type: "boolean", describe: "This option lets the strategy turn each turnable item that is not locked. Without it, the member decides the turns." },
  } satisfies OptionSchema<BboxStrategyOptions>,
  "ruin-recreate": {
    member: { ...MEMBER, needs: { obstacleMove: "fixed" } },
    iterations: { ...ITERATIONS, describe: "The count of the ruin and recreate steps after the member layout." },
    ruin: { type: "enum", describe: "The rule that chooses the items to remove.", values: RUIN_KINDS },
    strength: { type: "number", describe: "The largest share of the placed items that one ruin removes.", min: 0, max: 1 },
    shrink: { type: "number", describe: "The share by which a met goal shrinks the free side of the goal box.", min: 0.001, max: 0.5, scale: "log" },
  } satisfies OptionSchema<RuinRecreateStrategyOptions>,
  "overlap-min": {
    member: MEMBER,
    iterations: { type: "integer", describe: "The largest count of the item moves.", min: 64, max: 65536, scale: "log" },
    step: { type: "number", describe: "The share by which one cut makes the strip shorter.", min: 0.001, max: 0.5, scale: "log" },
  } satisfies OptionSchema<OverlapMinStrategyOptions>,
  anneal: {
    ...ORDER_SEARCH,
    temperature: { type: "number", describe: "The start temperature, as a share in the units of the key levels.", min: 0.0001, max: 1, scale: "log" },
    cooling: { type: "number", describe: "The temperature of the last step as a share of the start temperature.", min: 0.0001, max: 1, scale: "log" },
  } satisfies OptionSchema<AnnealStrategyOptions>,
  genetic: {
    ...ORDER_SEARCH,
    population: { type: "integer", describe: "The count of the orders in one generation.", min: 2, max: 64, scale: "log" },
    mutation: { type: "number", describe: "The chance that a child gets one random change.", min: 0, max: 1 },
  } satisfies OptionSchema<GeneticStrategyOptions>,
  tabu: {
    ...ORDER_SEARCH,
    tenure: { type: "integer", describe: "The count of the steps in which a swapped pair of items stays tabu.", min: 0, max: 64 },
    neighbors: { type: "integer", describe: "The count of the random moves that one step tries.", min: 1, max: 64, scale: "log" },
  } satisfies OptionSchema<TabuStrategyOptions>,
  relax: {
    member: MEMBER,
    strength: { type: "number", describe: "The share of the move from the member layout to the target. With 0, the output is the member output.", min: 0, max: 1 },
    pull: { type: "number", describe: "The share of the move of a box to the balance point of its links.", min: 0, max: 1, default: 0 },
  } satisfies OptionSchema<RelaxStrategyOptions>,
  force: {
    member: MEMBER,
    iterations: { ...ITERATIONS, describe: "The count of the force steps. With 0, the output is the member output." },
    rounds: { type: "integer", describe: "The most rounds of the overlap removal.", min: 0, max: 32 },
  } satisfies OptionSchema<ForceStrategyOptions>,
  sleator: {},
  beam: {
    width: { type: "integer", describe: "The count of the states that each level keeps, and the count of the children of a state.", min: 1, max: 64, scale: "log", default: BEAM_WIDTH },
  } satisfies OptionSchema<BeamOptions>,
  "exact-strip": {
    nodeLimit: { type: "integer", describe: "The largest count of search nodes, over all heights.", min: 1000, max: 100000, scale: "log", marks: [1000, 10000, 100000] },
  } satisfies OptionSchema<ExactStripOptions>,
  "binary-height": {
    trials: { type: "integer", describe: "The count of the decoded orders at one height.", min: 1, max: 1024, scale: "log" },
    seed: SEED,
    precision: { type: "number", describe: "The search stops when the range of the height is at most this value.", min: 0.01, max: 8, scale: "log", default: 0.5 },
  } satisfies OptionSchema<BinaryHeightOptions>,
  "near-rects": {
    cell: CELL,
    rounds: { type: "integer", describe: "The count of the join rounds. A group has at most 2 to the power of this count shapes.", min: 0, max: 4, default: 2 },
    seed: SEED,
  } satisfies OptionSchema<NearRectsOptions>,
  "raster-nofit": {
    cell: CELL,
    trials: { type: "integer", describe: "The count of the orders that the search decodes.", min: 1, max: 256, scale: "log", default: 64 },
    seed: SEED,
  } satisfies OptionSchema<RasterNofitOptions>,
  masonry: {
    method: { type: "enum", describe: "The rule that gives each box its column.", values: MASONRY_METHOD_IDS },
    columns: { type: "integer", describe: "The count of the columns.", min: 1, max: 16 },
    columnWidth: { type: "number", describe: "The width of each column.", min: 1, max: 4096, scale: "log", ...none("derived", "Without a width, the strategy uses the widest box with its margins.") },
  } satisfies OptionSchema<MasonryStrategyOptions>,
  treemap: {
    method: { type: "enum", describe: "The layout of the cells.", values: TREEMAP_METHOD_IDS },
  } satisfies OptionSchema<TreemapStrategyOptions>,
  "side-anchors": {
    first: { type: "object", describe: "One anchor for the first item of the input.", ...none("unset", "Without it, only the option anchors holds anchors.") },
    strategy: { type: "strategy", describe: "The member that packs the other items.", kinds: ["single"], optionsKey: "strategyOptions", optIn: false, default: "maxrects" },
    strategyOptions: { type: "object", describe: "The options of the member.", default: { rule: "bl" } },
    anchors: { type: "list", describe: "The anchors of named items.", of: { type: "object" }, default: [] },
    precision: { type: "number", describe: "The search stops when the range is at most this share of its top.", min: 0.0001, max: 0.1, scale: "log", default: 0.005 },
  } satisfies OptionSchema<SideAnchorStrategyOptions>,
};

/** The line of each strategy for a chooser, by id. */
const DESCRIBES: Readonly<Record<string, string>> = {
  rows: "This strategy packs the items in rows, and it searches the width of the rows.",
  skyline: "This strategy keeps the top line of the packed items, and it puts each item on that line.",
  shelf: "This strategy packs the items on shelves of the height of their tallest item.",
  push: "This strategy puts each item at its own place, and it shoves the items that overlap.",
  maxrects: "This strategy keeps each maximal free rectangle, and it puts each item in the best one.",
  guillotine: "This strategy cuts the free area with straight cuts, one for each item.",
  "bottom-left": "This strategy slides each item down and left until it stops.",
  "best-fit": "This strategy gives the lowest gap the item that fits it best.",
  "hole-degree": "This strategy packs circles, each one at the corner place that touches the most neighbors.",
  "circle-quasi-physical": "This strategy packs circles with a local search that lets them push each other.",
  portfolio: "This strategy packs with each member, and it keeps the best layout.",
  "aspect-fit": "This strategy searches the size that gives the inner strategy the target aspect.",
  select: "This strategy reads the input, and a decision table picks one member.",
  restarts: "This strategy packs with changed orders of the items, and it keeps the best layout.",
  bbox: "This strategy packs with the member, and it turns the items to make the box of each one smaller.",
  "ruin-recreate": "This strategy removes some items and packs them again, step by step.",
  "overlap-min": "This strategy shortens the strip, and it moves the items until no two overlap.",
  anneal: "This strategy searches the orders of the items with simulated annealing.",
  genetic: "This strategy searches the orders of the items with a genetic algorithm.",
  tabu: "This strategy searches the orders of the items with a tabu list.",
  relax: "This strategy moves the boxes of the member layout to equal gaps and to their linked boxes.",
  force: "This strategy moves the boxes of the member layout with forces, then it removes the overlaps.",
  sleator: "This strategy packs a strip with the algorithm of Sleator, with a proved bound of 2.5 times the optimum.",
  beam: "This strategy packs a strip with a beam search over the next item.",
  "exact-strip": "This strategy searches a small strip until it proves the smallest height.",
  "binary-height": "This strategy does a binary search of the height with a seeded search of orders.",
  "near-rects": "This strategy joins shapes into near rectangles, then it packs the groups.",
  "raster-nofit": "This strategy puts shapes on a grid, and it searches the orders of the items.",
  masonry: "This strategy puts each box in a column, for a layout of equal columns.",
  treemap: "This strategy gives each box a cell with an area in proportion to its own area.",
  "side-anchors": "This strategy keeps the anchored items at their sides, and a member packs the other items.",
};

/** The limit on the items of the searches of `STANDALONE_MAX_ITEMS`. */
const STANDALONE_LIMIT: Readonly<Record<string, CatalogLimit>> = {
  items: { max: STANDALONE_MAX_ITEMS, describe: "The strategy refuses an input with more items, because its search time grows fast." },
};

/** The limits in the code of the engine, by id. A strategy that is not here has no limit. */
const LIMITS: Readonly<Record<string, Readonly<Record<string, CatalogLimit>>>> = {
  "exact-strip": {
    items: { max: EXACT_STRIP_MAX_ITEMS, describe: "The strategy refuses an input with more items." },
    side: { max: EXACT_STRIP_MAX_SIDE, describe: "The strategy refuses an item with a longer side." },
  },
  "binary-height": STANDALONE_LIMIT,
  "near-rects": STANDALONE_LIMIT,
  "raster-nofit": STANDALONE_LIMIT,
};

/** The notes of the determinism claim, by id. */
const DETERMINISM_NOTES: Readonly<Record<string, string>> = {
  portfolio: "The option budgetMs makes the result depend on the clock.",
  restarts: "The option budgetMs makes the result depend on the clock.",
};

/** This function gives the entry of one strategy, from the live fields and the declarations of this module. */
function entryOf(listing: StrategyListing): CatalogEntry {
  const { id, family, kind, supports, deterministic } = listing;
  const schema = SCHEMAS[id];
  const describe = DESCRIBES[id];
  if (schema === undefined || describe === undefined) throw new RangeError(`The catalog has no declaration of the strategy "${id}".`);
  const note = DETERMINISM_NOTES[id];
  return {
    key: id,
    id,
    family,
    kind,
    describe,
    supports,
    limits: LIMITS[id] ?? {},
    deterministic,
    ...(note === undefined ? {} : { determinismNote: note }),
    optIn: !registered.some((s) => s.id === id),
    options: catalogOptions(strategy(id).defaults as Readonly<Record<string, unknown>>, schema),
  };
}

/** This function builds the catalog. The call has the pure mark, so an import that does not read the constant drops it. */
function catalog(): StrategyCatalogSource {
  return { engine: STRATEGY_CATALOG_ENGINE, strategies: allStrategies.map(entryOf).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) };
}

/** Each strategy and each option of the engine, as the source of `strategy-catalog/1`. The file `strategy-catalog.json` holds the same data with the version. */
export const strategyCatalog: StrategyCatalogSource = /* @__PURE__ */ catalog();
