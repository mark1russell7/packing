// The strategy space of the engine `packing` (roadmap item k68). The stages, their options and the ranges of their params
// are data of the schema `strategy-space/1` of `@mark1russell7/layout-contract`. `packConfig` packs a config with the
// strategies of the registry. It adds no new algorithm.

import {
  canonicalConfig,
  checkConfig,
  checkShapes,
  configId,
  itemShapeOf,
  PACK_HARD_RULES,
  shapeKindsOf,
  STRATEGY_SPACE_SCHEMA,
  type OptionSupports,
  type ShapeCheck,
  type SpaceParam,
  type SpaceStage,
  type StageChoice,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import type { BestFitStrategyOptions, BottomLeftStrategyOptions, GuillotineStrategyOptions, LayoutStrategyOptions, MaxRectsStrategyOptions, PushStrategyOptions, SkylineStrategyOptions } from "./adapters.ts";
import { BBOX_SHAPES, type BboxStrategyOptions } from "./bbox.ts";
import { BEAM_WIDTH, type BeamOptions } from "./beam.ts";
import type { ShelfOnlineOptions } from "./shelf-online.ts";
import type { BinaryHeightOptions } from "./binary-height.ts";
import type { CircleQuasiPhysicalOptions } from "./circle-quasi-physical.ts";
import { BEST_FIT_SIDES } from "./best-fit.ts";
import { BOTTOM_LEFT_RULES } from "./bottom-left.ts";
import type { ExactStripOptions } from "./exact-strip.ts";
import { HOLE_DEGREE_MAX_STEPS, type HoleDegreeStrategyOptions } from "./hole-degree.ts";
import type { NearRectsOptions } from "./near-rects.ts";
import type { RasterNofitOptions } from "./raster-nofit.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { GUILLOTINE_CHOICES, GUILLOTINE_SPLITS } from "./guillotine.ts";
import type { AnnealStrategyOptions, GeneticStrategyOptions, TabuStrategyOptions } from "./order-search.ts";
import type { ForceStrategyOptions } from "./force.ts";
import type { RelaxStrategyOptions } from "./relax.ts";
import { MAXRECTS_RULES } from "./maxrects.ts";
import { SKYLINE_RULES } from "./skyline.ts";
import { MEASURE_SPECS } from "./measures.ts";
import { GRAPH_ORDERS, SORT_ORDERS } from "./order.ts";
import type { PackLayoutOptions } from "./pack.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { PORTFOLIO_FRAME_MS } from "./portfolio-cell.ts";
import { PORTFOLIO_SETS } from "./portfolio-sets.ts";
import type { PortfolioStrategyOptions } from "./portfolio-strategy.ts";
import { strategy, type AspectFitStrategyOptions } from "./registry.ts";
import { RESTART_PERTURBS, type RestartsStrategyOptions } from "./restarts.ts";
import type { OverlapMinStrategyOptions } from "./overlap-min.ts";
import { RUIN_KINDS, type RuinRecreateStrategyOptions } from "./ruin-recreate.ts";
import type { SelectStrategyOptions } from "./select.ts";
import { PACK_DEFAULT_TABLE, SELECT_TABLE, type SelectNode } from "./select-table.ts";
import { SHELF_FITS } from "./shelf.ts";
import { BINARY_HEIGHT_TRIALS, EXACT_STRATEGY_NODE_LIMIT, MASONRY_METHOD_IDS, refusal, TREEMAP_METHOD_IDS, type MasonryStrategyOptions, type SideAnchorStrategyOptions, type TreemapStrategyOptions } from "./standalone-strategies.ts";
import { packWith } from "./strategy-list.ts";
import { UnsupportedShape } from "./strategy.ts";

/** The engine name of `packSpace`. Each config of the space has it in `space`. */
const ENGINE = "packing";

/** The key `area` of the portfolio: the area first after the hard breaks, then the key of `PORTFOLIO_LEVELS`. */
const AREA_KEY: readonly string[] = Object.freeze(["pack.area", "pack.overflow.excessArea", "pack.fill"]);

/** The key `fill` of the portfolio (k127): `pack.fill` alone after the hard breaks. The key computes the fill alone. */
const FILL_KEY: readonly string[] = Object.freeze(["pack.fill"]);

/** The params of the aspect search: a fixed target aspect, else the aspect of the container. */
const TARGET_PARAMS: readonly SpaceParam[] = [
  { name: "fixedTarget", kind: "bool", default: false },
  { name: "targetAspect", kind: "real", min: 0.25, max: 4, scale: "log", default: 1, when: { param: "fixedTarget", in: [true] } },
];

/** The values of the param `budgetWork` of `packSpace`, in work units. The option `budgetWork` of a strategy takes each whole number. */
const BUDGET_WORK_VALUES: readonly number[] = [4000, 16000, 64000, 256000];

/**
 * The params of the work limit of roadmap item k117: the switch `limitWork`, then `budgetWork` in work units of `packWork`.
 * The param `budgetWork` has 4 values on a log scale, with the factor 4. With a small list, the sampler draws the work limit in 4 of 5 configs, not in 256 of 257.
 */
const WORK_PARAMS: readonly SpaceParam[] = [
  { name: "limitWork", kind: "bool", default: false },
  { name: "budgetWork", kind: "enum", values: [...BUDGET_WORK_VALUES], default: 16000, when: { param: "limitWork", in: [true] } },
];

/**
 * The params of a portfolio: the key of the pick, the limits of the run, and an optional aspect search around the portfolio.
 * The options `maxMembers`, `budgetMs` and `budgetWork` have no default. Thus each one has a switch param, with the default `false`.
 */
const PORTFOLIO_PARAMS: readonly SpaceParam[] = [
  { name: "key", kind: "enum", values: ["levels", "area", "fill"], default: "levels" },
  { name: "limitMembers", kind: "bool", default: false },
  { name: "maxMembers", kind: "int", min: 1, max: 5, default: 3, when: { param: "limitMembers", in: [true] } },
  { name: "limitTime", kind: "bool", default: false },
  { name: "budgetMs", kind: "real", min: 1, max: 2000, scale: "log", default: PORTFOLIO_FRAME_MS, when: { param: "limitTime", in: [true] } },
  ...WORK_PARAMS,
  { name: "aspectFit", kind: "bool", default: false },
  { ...TARGET_PARAMS[0]!, when: { param: "aspectFit", in: [true] } },
  TARGET_PARAMS[1]!,
];

/**
 * The params of the random restarts of roadmap item k78. They are the key of the pick, the count of the restarts, the change of
 * the order and its strength. Then the time limit and the work limit follow. The options `budgetMs` and `budgetWork` have the switch params
 * `limitTime` and `limitWork`, with the default `false`.
 */
const RESTARTS_PARAMS: readonly SpaceParam[] = [
  PORTFOLIO_PARAMS[0]!,
  { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 16 },
  { name: "perturb", kind: "enum", values: [...RESTART_PERTURBS], default: "swap" },
  { name: "strength", kind: "real", min: 0, max: 1, default: 0.1 },
  { name: "limitTime", kind: "bool", default: false },
  { name: "budgetMs", kind: "real", min: 1, max: 2000, scale: "log", default: PORTFOLIO_FRAME_MS, when: { param: "limitTime", in: [true] } },
  ...WORK_PARAMS,
];

/**
 * The params of the goal-driven ruin and recreate of roadmap item k79. They are the count of the iterations and the kind of the ruin.
 * They are also the largest share of the items that one ruin removes, and the shrink of a met goal.
 */
const RUIN_RECREATE_PARAMS: readonly SpaceParam[] = [
  { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 64 },
  { name: "ruin", kind: "enum", values: [...RUIN_KINDS], default: "mixed" },
  { name: "strength", kind: "real", min: 0, max: 1, default: 0.3 },
  { name: "shrink", kind: "real", min: 0.001, max: 0.5, scale: "log", default: 0.005 },
];

/** The params of the overlap minimization of roadmap item k80: the largest count of the moves, and the share of one cut. */
const OVERLAP_MIN_PARAMS: readonly SpaceParam[] = [
  { name: "iterations", kind: "int", min: 64, max: 65536, scale: "log", default: 8192 },
  { name: "step", kind: "real", min: 0.001, max: 0.5, scale: "log", default: 0.01 },
];

/** The param of `relax` of roadmap item k124: the share of the move from the member layout to the target. */
const RELAX_PARAMS: readonly SpaceParam[] = [{ name: "strength", kind: "real", min: 0, max: 1, default: 1 }];

/** The param of `relax-pull` of roadmap item k137: the share of the move to the balance point of the links. A param of `relax` changes the id of each `relax` config, so the pull is its own option. */
const RELAX_PULL_PARAMS: readonly SpaceParam[] = [{ name: "pull", kind: "real", min: 0, max: 1, default: 1 }];

/** The params of `force` of roadmap item k125: the count of the force steps and the most rounds of PRISM. */
const FORCE_PARAMS: readonly SpaceParam[] = [
  { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 60 },
  { name: "rounds", kind: "int", min: 0, max: 32, default: 10 },
];

/** The param `iterations` of the searches over orders of roadmap item k26: the count of the packs of the member. */
const SEARCH_ITERATIONS: SpaceParam = { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 64 };

/** The params of `anneal` of roadmap item k26: the count of the packs, the start temperature and the cooling. Then the work limit follows. */
const ANNEAL_PARAMS: readonly SpaceParam[] = [
  SEARCH_ITERATIONS,
  { name: "temperature", kind: "real", min: 0.0001, max: 1, scale: "log", default: 0.01 },
  { name: "cooling", kind: "real", min: 0.0001, max: 1, scale: "log", default: 0.01 },
  ...WORK_PARAMS,
];

/** The params of `genetic` of roadmap item k26: the count of the packs, the population and the mutation chance. Then the work limit follows. */
const GENETIC_PARAMS: readonly SpaceParam[] = [
  SEARCH_ITERATIONS,
  { name: "population", kind: "int", min: 2, max: 64, scale: "log", default: 8 },
  { name: "mutation", kind: "real", min: 0, max: 1, default: 0.5 },
  ...WORK_PARAMS,
];

/** The params of `tabu` of roadmap item k26: the count of the packs, the tenure and the count of the moves of a step. Then the work limit follows. */
const TABU_PARAMS: readonly SpaceParam[] = [
  SEARCH_ITERATIONS,
  { name: "tenure", kind: "int", min: 0, max: 64, default: 7 },
  { name: "neighbors", kind: "int", min: 1, max: 64, scale: "log", default: 8 },
  ...WORK_PARAMS,
];

/**
 * The placements of the standalone strategies of roadmap item k142. Each one goes with the order `input` and the size search `none`, because it does its own search.
 * A composite finds only a member of the registry, so `packConfig` refuses a composite with one of these members.
 */
const STANDALONE_PLACEMENTS: readonly string[] = ["sleator", "shelf-breaks", "shelf-online", "beam", "exact-strip", "binary-height", "near-rects", "raster-nofit", "masonry", "treemap"];

/** The values of the param `nodeLimit` of `exact-strip`. The largest value is the default of the strategy, so a draw costs no more than the named config. */
const EXACT_NODE_LIMITS: readonly number[] = [1000, 10000, EXACT_STRATEGY_NODE_LIMIT];

/** The param of `side-anchors` of roadmap item k142: the side and the place of one anchor for the first item. */
const SIDE_ANCHOR_PARAMS: readonly SpaceParam[] = [
  { name: "side", kind: "enum", values: ["left", "right", "top", "bottom"], default: "left" },
  { name: "at", kind: "real", min: 0, max: 1, default: 0.5 },
];

/** The inputs of each option of `packSpace`: only the shape kind `rect` (`docs/SHAPES.md` of the contract). */
const RECT_ONLY: OptionSupports = Object.freeze({ shape: Object.freeze(["rect"] as const) });

/** The inputs of the option `bbox` of roadmap item k91: each shape kind. Its members have `view: "bounds"`, so they get only `rect` items. */
const BBOX_ONLY: OptionSupports = Object.freeze({ shape: BBOX_SHAPES });

/**
 * The largest count of the moves of a `circle-quasi-physical` config. The strategy takes more, but each value is one base config.
 * Without this limit, the 65537 configs are 29 % of the base configs. A draw takes them as members, and a rect input refuses them.
 */
const CIRCLE_SPACE_MAX_ITERATIONS = 1024;

/** The inputs of the options `hole-degree` of roadmap item k90 and `circle-quasi-physical` of roadmap item k94: only the shape kind `circle`. */
const CIRCLE_ONLY: OptionSupports = Object.freeze({ shape: Object.freeze(["circle"] as const) });

/** The inputs of the options that a `hole-degree` config shares with the rect configs: `rect` and `circle`. */
const RECT_OR_CIRCLE: OptionSupports = Object.freeze({ shape: Object.freeze(["rect", "circle"] as const) });

/** This function gives the stage choice of a param list, without an empty list of params. */
const choice = (option: string, params: Record<string, string | number | boolean> = {}): StageChoice =>
  Object.keys(params).length === 0 ? { option } : { option, params };

/**
 * This function gives the base config of a single strategy of the registry with some options over its defaults.
 * It throws a `RangeError` for a composite strategy and for an option that the space does not have.
 */
export function baseConfig(id: string, options: Readonly<Record<string, unknown>> = {}): StrategyConfig {
  // The params of the space hold the defaults of a standalone strategy. The list of the registry does not hold it, and the named configs reach this function at import.
  if (STANDALONE_PLACEMENTS.includes(id)) {
    const params = STAGES.find((s) => s.name === "placement")!.options.find((option) => option.id === id)!.params;
    for (const key of Object.keys(options)) if (!params.some((p) => p.name === key)) throw new RangeError(`The space packing has no option ${key} of the strategy ${id}.`);
    const placement = choice(id, Object.fromEntries(params.map((p) => [p.name, (options[p.name] ?? p.default) as string | number | boolean])));
    return { space: ENGINE, stages: { order: choice("input"), "size-search": choice("none"), placement, "local-search": choice("none") } };
  }
  const o = { ...(strategy(id).defaults as Record<string, unknown>), ...options };
  if (id === "hole-degree") {
    for (const key of Object.keys(o)) if (key !== "steps") throw new RangeError(`The space packing has no option ${key} of the strategy ${id}.`);
    const placement = choice("hole-degree", { steps: o["steps"] as number });
    return { space: ENGINE, stages: { order: choice("input"), "size-search": choice("none"), placement, "local-search": choice("none") } };
  }
  if (id === "circle-quasi-physical") {
    for (const key of Object.keys(o)) if (key !== "iterations") throw new RangeError(`The space packing has no option ${key} of the strategy ${id}.`);
    const placement = choice("circle-quasi-physical", { iterations: o["iterations"] as number });
    return { space: ENGINE, stages: { order: choice("input"), "size-search": choice("none"), placement, "local-search": choice("none") } };
  }
  const known = id === "push" ? ["sortOrder", "maxShovesPerItem"] : ["sortOrder", "samples", "fit", "rule", "rotate", "bandHeight", "wasteMap", "choice", "split", "merge", "side"];
  for (const key of Object.keys(o)) if (!known.includes(key) || (key === "fit" && id !== "shelf")) throw new RangeError(`The space packing has no option ${key} of the strategy ${id}.`);
  const stages: Record<string, StageChoice | null> = { order: choice(String(o["sortOrder"])), "local-search": choice("none") };
  if (id === "push") {
    stages["size-search"] = choice("none");
    stages["placement"] = choice("push", { maxShovesPerItem: o["maxShovesPerItem"] as number });
    return { space: ENGINE, stages };
  }
  stages["size-search"] = choice("log-sweep", { samples: o["samples"] as number });
  if (id === "shelf") stages["placement"] = choice("shelf", { fit: (o["fit"] as string | undefined) ?? "none" });
  else if (id === "maxrects") {
    const bands = o["bandHeight"] === undefined ? { fixedBands: false } : { fixedBands: true, bandHeight: o["bandHeight"] as number };
    stages["placement"] = choice("maxrects", { rule: o["rule"] as string, rotate: o["rotate"] as boolean, ...bands });
  } else if (id === "skyline") stages["placement"] = choice("skyline", { rule: o["rule"] as string, wasteMap: o["wasteMap"] as boolean, rotate: o["rotate"] as boolean });
  else if (id === "guillotine") {
    stages["placement"] = choice("guillotine", { choice: o["choice"] as string, split: o["split"] as string, rotate: o["rotate"] as boolean, merge: o["merge"] as boolean });
  } else if (id === "bottom-left") stages["placement"] = choice(id, { rule: o["rule"] as string });
  else if (id === "best-fit") stages["placement"] = choice(id, { side: o["side"] as string });
  else if (id === "rows") stages["placement"] = choice(id);
  else throw new RangeError(`The strategy ${id} is not a single strategy of the space packing.`);
  return { space: ENGINE, stages };
}

/** This function gives the config of a meta option with its params and its members. */
const metaConfig = (option: string, members: readonly StrategyConfig[], params: Record<string, string | number | boolean> = {}): StrategyConfig => ({
  space: ENGINE,
  stages: { combine: { ...choice(option, params), members } },
});

/** The members of `cell-portfolio`: the entries of the table `PORTFOLIO_SETS`, by id. */
const POOL: Readonly<Record<string, StrategyConfig>> = Object.fromEntries(
  Object.entries(PORTFOLIO_SETS.entries).map(([id, e]) => [id, baseConfig(e.strategy, (e.options ?? {}) as Record<string, unknown>)]),
);

/** The configs of the entries of `PORTFOLIO_SETS`. They are the one entry of the `pool` of `cell-portfolio` (roadmap item L39 of the contract). */
const pool: readonly StrategyConfig[] = Object.values(POOL);

/** The stages of `packSpace`, in the order of the pipeline. Each option has `supports` with only the shape kind `rect`. */
const STAGES: readonly SpaceStage[] = [
  { name: "order", options: [...SORT_ORDERS, ...GRAPH_ORDERS].map((id) => ({ id, params: [], supports: id === "input" ? RECT_OR_CIRCLE : RECT_ONLY })) },
  {
    name: "size-search",
    options: [
      { id: "log-sweep", params: [{ name: "samples", kind: "int", min: 12, max: 192, scale: "log", default: 48 }], supports: RECT_ONLY },
      { id: "none", params: [], supports: RECT_OR_CIRCLE },
    ],
  },
  {
    name: "placement",
    options: [
      { id: "rows", params: [], supports: RECT_ONLY },
      {
        id: "skyline",
        params: [
          { name: "rule", kind: "enum", values: [...SKYLINE_RULES], default: "bl" },
          { name: "wasteMap", kind: "bool", default: false },
          { name: "rotate", kind: "bool", default: false },
        ],
        supports: RECT_ONLY,
      },
      { id: "shelf", params: [{ name: "fit", kind: "enum", values: ["none", ...SHELF_FITS], default: "none" }], supports: RECT_ONLY },
      {
        id: "maxrects",
        params: [
          { name: "rule", kind: "enum", values: [...MAXRECTS_RULES], default: "bssf" },
          { name: "rotate", kind: "bool", default: false },
          { name: "fixedBands", kind: "bool", default: false },
          { name: "bandHeight", kind: "real", min: 1, max: 64, scale: "log", default: 8, when: { param: "fixedBands", in: [true] } },
        ],
        supports: RECT_ONLY,
      },
      {
        id: "guillotine",
        params: [
          { name: "choice", kind: "enum", values: [...GUILLOTINE_CHOICES], default: "baf" },
          { name: "split", kind: "enum", values: [...GUILLOTINE_SPLITS], default: "sas" },
          { name: "rotate", kind: "bool", default: false },
          { name: "merge", kind: "bool", default: false },
        ],
        supports: RECT_ONLY,
      },
      { id: "push", params: [{ name: "maxShovesPerItem", kind: "int", min: 1, max: 64, scale: "log", default: 8 }], supports: RECT_ONLY },
      { id: "bottom-left", params: [{ name: "rule", kind: "enum", values: [...BOTTOM_LEFT_RULES], default: "baker" }], supports: RECT_ONLY },
      { id: "best-fit", params: [{ name: "side", kind: "enum", values: [...BEST_FIT_SIDES], default: "left" }], supports: RECT_ONLY },
      { id: "hole-degree", params: [{ name: "steps", kind: "int", min: 0, max: HOLE_DEGREE_MAX_STEPS, default: 8 }], supports: CIRCLE_ONLY },
      { id: "circle-quasi-physical", params: [{ name: "iterations", kind: "int", min: 0, max: CIRCLE_SPACE_MAX_ITERATIONS, default: 256 }], supports: CIRCLE_ONLY },
      { id: "sleator", params: [], supports: RECT_ONLY },
      { id: "shelf-breaks", params: [], supports: RECT_ONLY },
      {
        id: "shelf-online",
        params: [
          { name: "r", kind: "real", min: 0.1, max: 0.9, default: 0.5 },
          { name: "fit", kind: "enum", values: ["next", "first"], default: "first" },
        ],
        supports: RECT_ONLY,
      },
      { id: "beam", params: [{ name: "width", kind: "int", min: 1, max: 64, scale: "log", default: BEAM_WIDTH }], supports: RECT_ONLY },
      { id: "exact-strip", params: [{ name: "nodeLimit", kind: "enum", values: [...EXACT_NODE_LIMITS], default: EXACT_STRATEGY_NODE_LIMIT }], supports: RECT_ONLY },
      { id: "binary-height", params: [{ name: "trials", kind: "int", min: 1, max: 1024, scale: "log", default: BINARY_HEIGHT_TRIALS }], supports: RECT_ONLY },
      { id: "near-rects", params: [{ name: "rounds", kind: "int", min: 0, max: 4, default: 2 }], supports: RECT_ONLY },
      { id: "raster-nofit", params: [{ name: "trials", kind: "int", min: 1, max: 256, scale: "log", default: 64 }], supports: RECT_ONLY },
      {
        id: "masonry",
        params: [
          { name: "method", kind: "enum", values: [...MASONRY_METHOD_IDS], default: "shortest" },
          { name: "columns", kind: "int", min: 1, max: 16, default: 4 },
        ],
        supports: RECT_ONLY,
      },
      { id: "treemap", params: [{ name: "method", kind: "enum", values: [...TREEMAP_METHOD_IDS], default: "squarified" }], supports: RECT_ONLY },
    ],
  },
  { name: "local-search", options: [{ id: "none", params: [], supports: RECT_OR_CIRCLE }] },
  {
    name: "combine",
    optional: true,
    options: [
      { id: "portfolio", params: PORTFOLIO_PARAMS, members: { min: 2, max: 5, ordered: true }, supports: RECT_ONLY },
      {
        id: "cell-portfolio",
        params: [{ name: "k", kind: "enum", values: ["cell", 2, 3], default: "cell" }, ...PORTFOLIO_PARAMS],
        members: { min: pool.length, max: pool.length, ordered: false, pool: [pool] },
        supports: RECT_ONLY,
      },
      { id: "select", params: [{ name: "table", kind: "enum", values: ["k66", "pack"], default: "k66" }], members: { min: 2, max: 2, ordered: true }, supports: RECT_ONLY },
      { id: "aspect-fit", params: TARGET_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "restarts", params: RESTARTS_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "bbox", params: [{ name: "turn", kind: "bool", default: false }], members: { min: 1, max: 1, ordered: true, view: "bounds" }, supports: BBOX_ONLY },
      { id: "ruin-recreate", params: RUIN_RECREATE_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "overlap-min", params: OVERLAP_MIN_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "anneal", params: ANNEAL_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "genetic", params: GENETIC_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "tabu", params: TABU_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "relax", params: RELAX_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "relax-pull", params: RELAX_PULL_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "force", params: FORCE_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "side-anchors", params: SIDE_ANCHOR_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
    ],
  },
];

/** The placements that do their own size search, or none: only they go with the size search `none`. */
const NO_SIZE_SEARCH: readonly string[] = ["push", "hole-degree", "circle-quasi-physical", ...STANDALONE_PLACEMENTS];

/** The id of each option of the stage `placement`. */
const placementIds: readonly string[] = STAGES.find((s) => s.name === "placement")!.options.map((o) => o.id);

/** The named single configs: each single entry of the benchmark, then `maxrects` of the registry. */
const SINGLE: Readonly<Record<string, StrategyConfig>> = {
  rows: baseConfig("rows"),
  skyline: baseConfig("skyline"),
  shelf: baseConfig("shelf"),
  push: baseConfig("push"),
  "shelf-next": baseConfig("shelf", { fit: "next", sortOrder: "height-desc" }),
  "shelf-first": baseConfig("shelf", { fit: "first", sortOrder: "height-desc" }),
  "shelf-best": baseConfig("shelf", { fit: "best", sortOrder: "height-desc" }),
  "shelf-first-input": baseConfig("shelf", { fit: "first", sortOrder: "input" }),
  "skyline-mw": baseConfig("skyline", { rule: "mw" }),
  "skyline-bl-waste": baseConfig("skyline", { wasteMap: true }),
  "skyline-mw-waste": baseConfig("skyline", { rule: "mw", wasteMap: true }),
  ...Object.fromEntries(MAXRECTS_RULES.map((rule) => [`maxrects-${rule}`, baseConfig("maxrects", { rule })])),
  maxrects: baseConfig("maxrects"),
  "guillotine-baf-sas": baseConfig("guillotine"),
  "guillotine-bssf-sas-merge": baseConfig("guillotine", { choice: "bssf", merge: true }),
  guillotine: baseConfig("guillotine"),
  "hole-degree": baseConfig("hole-degree"),
  "bottom-left": baseConfig("bottom-left"),
  "bottom-left-liu-teng": baseConfig("bottom-left", { rule: "liu-teng" }),
  "best-fit": baseConfig("best-fit"),
  "best-fit-tall": baseConfig("best-fit", { side: "tall" }),
  "best-fit-short": baseConfig("best-fit", { side: "short" }),
  "circle-quasi-physical": baseConfig("circle-quasi-physical"),
  sleator: baseConfig("sleator"),
  "shelf-breaks": baseConfig("shelf-breaks"),
  "shelf-online": baseConfig("shelf-online"),
  beam: baseConfig("beam"),
  "exact-strip": baseConfig("exact-strip"),
  "binary-height": baseConfig("binary-height"),
  "near-rects": baseConfig("near-rects"),
  "raster-nofit": baseConfig("raster-nofit"),
  masonry: baseConfig("masonry"),
  "masonry-shortest": baseConfig("masonry", { method: "shortest" }),
  "masonry-lpt": baseConfig("masonry", { method: "lpt" }),
  "columns-linear-partition": baseConfig("masonry", { method: "linear-partition" }),
  treemap: baseConfig("treemap"),
  "treemap-squarified": baseConfig("treemap", { method: "squarified" }),
  "treemap-slice-dice": baseConfig("treemap", { method: "slice-dice" }),
  "treemap-strip": baseConfig("treemap", { method: "strip" }),
  "treemap-pivot-split": baseConfig("treemap", { method: "pivot-split" }),
  "treemap-spiral": baseConfig("treemap", { method: "spiral" }),
};

const single = (id: string): StrategyConfig => SINGLE[id]!;

/**
 * The strategy space of `packing`, schema `strategy-space/1`. It has 5 stages: `order`, `size-search`, `placement`,
 * `local-search` and `combine`. Each entry of the benchmark and each id of the registry is a named config.
 *
 * - The order `graph-bfs` reads `input.links`. Without links it gives `area-desc`. The placement `push` does not read links, so it does not go with this order.
 * - `size-search` acts only on a container of free size. The option `none` goes with `push`, `hole-degree` and `circle-quasi-physical` only.
 * - `hole-degree` of roadmap item k90 goes with the order `input` and the size search `none`. It does its own height search.
 * - `circle-quasi-physical` of roadmap item k94 goes with the order `input` and the size search `none`. It does its own radius search, in a circle container only.
 * - The placements of `STANDALONE_PLACEMENTS` of roadmap item k142 go with the order `input` and the size search `none`. Each one does its own search.
 * - A composite finds only a member of the registry. Thus `packConfig` refuses a composite with a member of `STANDALONE_PLACEMENTS`, and a draw goes back.
 * - `combine` has the meta options `portfolio`, `cell-portfolio`, `select`, `aspect-fit`, `restarts`, `bbox`, `ruin-recreate`, `overlap-min`, `anneal`, `genetic`, `tabu`, `relax`, `relax-pull`, `force` and `side-anchors`.
 * - `restarts`, `bbox`, `ruin-recreate`, `overlap-min`, `anneal`, `genetic`, `tabu`, `relax`, `relax-pull`, `force` and `side-anchors` have 1 member.
 * - `relax-pull` is the strategy `relax` with the strength 0 and the option `pull`.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. The table of the input picks the members that run.
 * - The `pool` of `cell-portfolio` has one entry, the configs of `PORTFOLIO_SETS`. Thus `spaceSize` counts one member list for it.
 * - The param `aspectFit` of a portfolio puts `aspect-fit` around it. Thus `aspect-fit-portfolio-k2` keeps the depth 1.
 * - The named config `aspect-fit` wraps `maxrects`, because the registry strategy needs an inner strategy.
 * - Each option supports the shape kind `rect`, but `hole-degree` and `circle-quasi-physical` support only `circle`. `bbox` supports each kind.
 * - The order `input` and the options `none` support `rect` and `circle`. Thus a config of these two placements supports `circle`.
 * - The members of `bbox` have `view: "bounds"`, so the checks give them the kind `rect`.
 * - Thus `spaceSize` with `polygon` or `free` counts only the configs with `bbox`. With `circle` it also counts the base configs of these two placements.
 * - Each option of each strategy is a param, a stage or the members of a meta option. `PACK_SPACE_OPTIONS` tells the place.
 */
export const packSpace: StrategySpace = Object.freeze({
  schema: STRATEGY_SPACE_SCHEMA,
  engine: ENGINE,
  version: "1",
  stages: STAGES,
  constraints: [
    { if: { stage: "placement", option: "push" }, then: { stage: "size-search", option: "none" } },
    { if: { stage: "placement", option: "hole-degree" }, then: { stage: "size-search", option: "none" } },
    { if: { stage: "placement", option: "hole-degree" }, then: { stage: "order", option: "input" } },
    { if: { stage: "placement", option: "circle-quasi-physical" }, then: { stage: "size-search", option: "none" } },
    { if: { stage: "placement", option: "circle-quasi-physical" }, then: { stage: "order", option: "input" } },
    ...STANDALONE_PLACEMENTS.flatMap((option) => [
      { if: { stage: "placement", option }, then: { stage: "size-search", option: "none" } },
      { if: { stage: "placement", option }, then: { stage: "order", option: "input" } },
    ]),
    // The placement `push` does not read `input.links`, so a graph order has no effect on it.
    ...GRAPH_ORDERS.map((option) => ({ if: { stage: "placement", option: "push" }, then: { not: { stage: "order", option } } })),
    // The size search `none` goes only with the placements of `NO_SIZE_SEARCH`. Each other placement (rows to guillotine) needs `log-sweep`.
    ...placementIds.filter((option) => !NO_SIZE_SEARCH.includes(option)).map((option) => ({ if: { stage: "size-search", option: "none" }, then: { not: { stage: "placement", option } } })),
  ],
  named: {
    ...SINGLE,
    "portfolio-k2": metaConfig("cell-portfolio", pool, { k: 2 }),
    "portfolio-k3": metaConfig("cell-portfolio", pool, { k: 3 }),
    "aspect-fit-maxrects-bl": metaConfig("aspect-fit", [single("maxrects-bl")]),
    "aspect-fit-maxrects-bssf": metaConfig("aspect-fit", [single("maxrects-bssf")]),
    "aspect-fit-portfolio-k2": metaConfig("cell-portfolio", pool, { k: 2, aspectFit: true }),
    "portfolio-area-rows-bl": metaConfig("portfolio", [single("rows"), single("maxrects-bl")], { key: "area" }),
    "select-rows-bl": metaConfig("select", [single("rows"), single("maxrects-bl")]),
    "portfolio-fill-rows-bl": metaConfig("portfolio", [single("rows"), single("maxrects-bl")], { key: "fill" }),
    portfolio: metaConfig("cell-portfolio", pool),
    "aspect-fit": metaConfig("aspect-fit", [single("maxrects")]),
    select: metaConfig("select", [single("rows"), single("maxrects-bl")]),
    pack: metaConfig("select", [single("rows"), single("maxrects-bl")], { table: "pack" }),
    "restarts-maxrects-bl-k16": metaConfig("restarts", [single("maxrects-bl")], { iterations: 16 }),
    "restarts-rows-k16": metaConfig("restarts", [single("rows")], { iterations: 16 }),
    "restarts-maxrects-bl-shuffle-k16": metaConfig("restarts", [single("maxrects-bl")], { iterations: 16, perturb: "shuffle" }),
    restarts: metaConfig("restarts", [single("maxrects-bl")]),
    "bbox-maxrects-bl": metaConfig("bbox", [single("maxrects-bl")]),
    "bbox-skyline": metaConfig("bbox", [single("skyline")]),
    bbox: metaConfig("bbox", [single("maxrects-bl")]),
    "ruin-recreate-maxrects-bl-k64": metaConfig("ruin-recreate", [single("maxrects-bl")], { iterations: 64 }),
    "ruin-recreate-skyline-k64": metaConfig("ruin-recreate", [single("skyline")], { iterations: 64 }),
    "ruin-recreate": metaConfig("ruin-recreate", [single("maxrects-bl")]),
    "overlap-min-maxrects-bl-k8192": metaConfig("overlap-min", [single("maxrects-bl")], { iterations: 8192 }),
    "overlap-min-skyline-k8192": metaConfig("overlap-min", [single("skyline")], { iterations: 8192 }),
    "overlap-min": metaConfig("overlap-min", [single("maxrects-bl")]),
    "anneal-maxrects-bl-k16": metaConfig("anneal", [single("maxrects-bl")], { iterations: 16 }),
    "anneal-skyline-k16": metaConfig("anneal", [single("skyline")], { iterations: 16 }),
    "genetic-maxrects-bl-k16": metaConfig("genetic", [single("maxrects-bl")], { iterations: 16, population: 4 }),
    "tabu-maxrects-bl-k16": metaConfig("tabu", [single("maxrects-bl")], { iterations: 16, neighbors: 4 }),
    anneal: metaConfig("anneal", [single("maxrects-bl")]),
    genetic: metaConfig("genetic", [single("maxrects-bl")]),
    tabu: metaConfig("tabu", [single("maxrects-bl")]),
    "relax-rows": metaConfig("relax", [single("rows")]),
    "relax-maxrects-bl": metaConfig("relax", [single("maxrects-bl")]),
    "relax-skyline-bl-waste": metaConfig("relax", [single("skyline-bl-waste")]),
    relax: metaConfig("relax", [single("maxrects-bl")]),
    "relax-pull-rows": metaConfig("relax-pull", [single("rows")]),
    "relax-pull-maxrects-bl": metaConfig("relax-pull", [single("maxrects-bl")]),
    "force-rows": metaConfig("force", [single("rows")]),
    "force-maxrects-bl": metaConfig("force", [single("maxrects-bl")]),
    "force-skyline-bl-waste": metaConfig("force", [single("skyline-bl-waste")]),
    force: metaConfig("force", [single("maxrects-bl")]),
    "side-anchors-first-left": metaConfig("side-anchors", [single("maxrects-bl")], { side: "left", at: 0.5 }),
  },
} satisfies StrategySpace);

/**
 * The place of one option of a strategy in `packSpace`. The value `null` tells that the option is in `PACK_SPACE_LEFT_OUT`.
 *
 * - A stage name, for example `order`: the option of the stage is the value.
 * - `<stage>.<option>.<param>`: a param of a stage option.
 * - `<stage>.<option>.members`: the members of a meta option.
 */
export type OptionPlace = string | null;

/** A place for each key of an option type. A new key of the type fails the build until it gets a place. */
type Places<T> = { readonly [K in keyof T]-?: OptionPlace };

/** The places of the options that `rows`, `skyline` and `shelf` share. Only `shelf` reads `fit`. */
const LAYOUT_PLACES = { sortOrder: "order", samples: "size-search.log-sweep.samples", fit: null } as const satisfies Places<LayoutStrategyOptions>;

/** The places of the options of a portfolio. */
const PORTFOLIO_PLACES = {
  k: "combine.cell-portfolio.k",
  maxMembers: "combine.portfolio.maxMembers",
  budgetMs: "combine.portfolio.budgetMs",
  budgetWork: "combine.portfolio.budgetWork",
  members: "combine.portfolio.members",
  key: "combine.portfolio.key",
} as const satisfies Places<PortfolioStrategyOptions>;

/**
 * The place in `packSpace` of each option of each strategy, by strategy id. The key `pack` holds the options of `pack`.
 * The records come from the option types. Thus a new option fails the build until it gets a place.
 */
export const PACK_SPACE_OPTIONS: Readonly<Record<string, Readonly<Record<string, OptionPlace>>>> = Object.freeze({
  rows: LAYOUT_PLACES,
  skyline: {
    ...LAYOUT_PLACES,
    rule: "placement.skyline.rule",
    wasteMap: "placement.skyline.wasteMap",
    rotate: "placement.skyline.rotate",
  } satisfies Places<SkylineStrategyOptions>,
  shelf: { ...LAYOUT_PLACES, fit: "placement.shelf.fit" } satisfies Places<LayoutStrategyOptions>,
  maxrects: {
    ...LAYOUT_PLACES,
    rule: "placement.maxrects.rule",
    rotate: "placement.maxrects.rotate",
    bandHeight: "placement.maxrects.bandHeight",
  } satisfies Places<MaxRectsStrategyOptions>,
  guillotine: {
    ...LAYOUT_PLACES,
    choice: "placement.guillotine.choice",
    split: "placement.guillotine.split",
    rotate: "placement.guillotine.rotate",
    merge: "placement.guillotine.merge",
  } satisfies Places<GuillotineStrategyOptions>,
  push: { sortOrder: "order", maxShovesPerItem: "placement.push.maxShovesPerItem" } satisfies Places<PushStrategyOptions>,
  "hole-degree": { steps: "placement.hole-degree.steps" } satisfies Places<HoleDegreeStrategyOptions>,
  "bottom-left": { sortOrder: "order", samples: "size-search.log-sweep.samples", rule: "placement.bottom-left.rule" } satisfies Places<BottomLeftStrategyOptions>,
  "best-fit": { sortOrder: "order", samples: "size-search.log-sweep.samples", side: "placement.best-fit.side" } satisfies Places<BestFitStrategyOptions>,
  "circle-quasi-physical": { iterations: "placement.circle-quasi-physical.iterations" } satisfies Places<CircleQuasiPhysicalOptions>,
  portfolio: PORTFOLIO_PLACES,
  "aspect-fit": {
    strategy: "combine.aspect-fit.members",
    options: "combine.aspect-fit.members",
    targetAspect: "combine.aspect-fit.targetAspect",
  } satisfies Places<AspectFitStrategyOptions>,
  select: { members: "combine.select.members", table: "combine.select.table" } satisfies Places<SelectStrategyOptions>,
  restarts: {
    member: "combine.restarts.members",
    iterations: "combine.restarts.iterations",
    perturb: "combine.restarts.perturb",
    strength: "combine.restarts.strength",
    key: "combine.restarts.key",
    limitTime: "combine.restarts.limitTime",
    budgetMs: "combine.restarts.budgetMs",
    budgetWork: "combine.restarts.budgetWork",
  } satisfies Places<RestartsStrategyOptions>,
  bbox: { member: "combine.bbox.members", turn: "combine.bbox.turn" } satisfies Places<BboxStrategyOptions>,
  "ruin-recreate": {
    member: "combine.ruin-recreate.members",
    iterations: "combine.ruin-recreate.iterations",
    ruin: "combine.ruin-recreate.ruin",
    strength: "combine.ruin-recreate.strength",
    shrink: "combine.ruin-recreate.shrink",
  } satisfies Places<RuinRecreateStrategyOptions>,
  "overlap-min": {
    member: "combine.overlap-min.members",
    iterations: "combine.overlap-min.iterations",
    step: "combine.overlap-min.step",
  } satisfies Places<OverlapMinStrategyOptions>,
  anneal: {
    member: "combine.anneal.members",
    iterations: "combine.anneal.iterations",
    budgetWork: "combine.anneal.budgetWork",
    temperature: "combine.anneal.temperature",
    cooling: "combine.anneal.cooling",
  } satisfies Places<AnnealStrategyOptions>,
  genetic: {
    member: "combine.genetic.members",
    iterations: "combine.genetic.iterations",
    budgetWork: "combine.genetic.budgetWork",
    population: "combine.genetic.population",
    mutation: "combine.genetic.mutation",
  } satisfies Places<GeneticStrategyOptions>,
  tabu: {
    member: "combine.tabu.members",
    iterations: "combine.tabu.iterations",
    budgetWork: "combine.tabu.budgetWork",
    tenure: "combine.tabu.tenure",
    neighbors: "combine.tabu.neighbors",
  } satisfies Places<TabuStrategyOptions>,
  relax: { member: "combine.relax.members", strength: "combine.relax.strength", pull: "combine.relax-pull.pull" } satisfies Places<RelaxStrategyOptions>,
  force: { member: "combine.force.members", iterations: "combine.force.iterations", rounds: "combine.force.rounds" } satisfies Places<ForceStrategyOptions>,
  pack: {
    sortOrder: "order",
    space: null,
    links: null,
    strategy: "placement",
    fit: "placement.shelf.fit",
    rule: "placement.maxrects.rule",
    bandHeight: "placement.maxrects.bandHeight",
    skylineRule: "placement.skyline.rule",
    wasteMap: "placement.skyline.wasteMap",
    choice: "placement.guillotine.choice",
    split: "placement.guillotine.split",
    merge: "placement.guillotine.merge",
    turnable: null,
    turned: null,
  } satisfies Places<PackLayoutOptions>,
  sleator: {},
  "shelf-breaks": {},
  "shelf-online": { r: "placement.shelf-online.r", fit: "placement.shelf-online.fit" } satisfies Places<ShelfOnlineOptions>,
  beam: { width: "placement.beam.width" } satisfies Places<BeamOptions>,
  "exact-strip": { nodeLimit: "placement.exact-strip.nodeLimit" } satisfies Places<ExactStripOptions>,
  "binary-height": { trials: "placement.binary-height.trials", seed: null, precision: null } satisfies Places<BinaryHeightOptions>,
  "near-rects": { rounds: "placement.near-rects.rounds", cell: null, seed: null } satisfies Places<NearRectsOptions>,
  "raster-nofit": { trials: "placement.raster-nofit.trials", cell: null, seed: null } satisfies Places<RasterNofitOptions>,
  masonry: { method: "placement.masonry.method", columns: "placement.masonry.columns", columnWidth: null } satisfies Places<MasonryStrategyOptions>,
  treemap: { method: "placement.treemap.method" } satisfies Places<TreemapStrategyOptions>,
  "side-anchors": {
    first: "combine.side-anchors.side",
    strategy: "combine.side-anchors.members",
    strategyOptions: "combine.side-anchors.members",
    anchors: null,
    precision: null,
  } satisfies Places<SideAnchorStrategyOptions>,
});

/** The reason of `seed` of a standalone strategy. */
const SEED_ARGUMENT = "The seed is an argument of `packConfig`, not a point of the space.";

/** The reason of `cell` of a strategy with a grid. */
const CELL_OF_INPUT = "The default comes from the sizes of the input. One fixed value does not fit each input.";

/** The reason of `fit` of a strategy that does not read it. */
const ONLY_SHELF = "Only the strategy `shelf` reads it. The param `placement.shelf.fit` sets it.";

/**
 * The options that `packSpace` does not hold, by `<strategy>.<option>`, with the reason of each. Each one has the place `null`
 * in `PACK_SPACE_OPTIONS`.
 */
export const PACK_SPACE_LEFT_OUT: Readonly<Record<string, string>> = Object.freeze({
  "rows.fit": ONLY_SHELF,
  "skyline.fit": ONLY_SHELF,
  "maxrects.fit": ONLY_SHELF,
  "guillotine.fit": ONLY_SHELF,
  "pack.space": "It is an object: the free space of the container. `pack` gets it from the input, not from a choice.",
  "pack.links": "It is a list of the links between the rectangles of the input. Only a graph order reads it. It is data, not a choice.",
  "pack.turnable": "It is a set of rectangles of the input. The `rotate` params of `maxrects`, `skyline` and `guillotine` make it.",
  "pack.turned": "It is a set that `pack` fills with the turned rectangles. It holds a result, not a choice.",
  "binary-height.seed": SEED_ARGUMENT,
  "binary-height.precision": "It is a length, so one range does not fit each input. The default stops the search.",
  "near-rects.seed": SEED_ARGUMENT,
  "near-rects.cell": CELL_OF_INPUT,
  "raster-nofit.seed": SEED_ARGUMENT,
  "raster-nofit.cell": CELL_OF_INPUT,
  "masonry.columnWidth": "The default is the widest box of the input. One fixed value does not fit each input.",
  "side-anchors.anchors": "It names items of one input. The option `first` gives the anchor that each input has.",
  "side-anchors.precision": "It stops the search of the length. A param adds configs with the same kind of layout.",
});

/** The point of a strategy with its options in `packSpace`, or the reason that it has no point. */
export type StrategyPoint = { readonly ok: true; readonly config: StrategyConfig } | { readonly ok: false; readonly reason: string };

/** The values of a strategy option that are not a string, a number or a boolean, by param and by the value of the param. */
export const NAMED_VALUES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  table: Object.freeze({ k66: SELECT_TABLE, pack: PACK_DEFAULT_TABLE } satisfies Record<string, SelectNode>),
  key: Object.freeze({ area: AREA_KEY, fill: FILL_KEY }),
});

/** The single strategies of the registry. `baseConfig` gives their configs. */
const SINGLE_STRATEGIES: readonly string[] = ["rows", "skyline", "shelf", "maxrects", "guillotine", "push", "hole-degree", "bottom-left", "best-fit", "circle-quasi-physical", ...STANDALONE_PLACEMENTS];

/** This function tells if a value is an object and not a list. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function gives the param value of an option value: the value itself, or the name in `NAMED_VALUES` of an equal value. */
function paramValue(param: string, value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  const named = NAMED_VALUES[param] ?? {};
  const text = JSON.stringify(value);
  return Object.keys(named).find((name) => JSON.stringify(named[name]) === text);
}

/** This function gives the strategy and the options of a member value: a strategy id, or an entry with `strategy` and `options`. */
function memberOf(value: unknown): { strategy: string; options: Readonly<Record<string, unknown>> } | undefined {
  if (typeof value === "string") return { strategy: value, options: {} };
  if (!isRecord(value) || typeof value["strategy"] !== "string") return undefined;
  const options = value["options"] ?? {};
  return isRecord(options) ? { strategy: value["strategy"], options } : undefined;
}

/** The reason that a standalone strategy is not a member. */
const notMember = (member: string): string => `The strategy ${member} is not in the registry, and a composite finds only a member of the registry.`;

/**
 * This function gives the point of `side-anchors`. The option `first` gives the params, and `strategy` with `strategyOptions` gives the member.
 * With no `first`, the strategy gives the layout of its member. Thus the point is the config of the member.
 */
function sideAnchorsPoint(options: Readonly<Record<string, unknown>>): StrategyPoint {
  const inner = options["strategy"] === undefined ? "maxrects" : String(options["strategy"]);
  if (STANDALONE_PLACEMENTS.includes(inner)) return { ok: false, reason: notMember(inner) };
  const innerOptions = options["strategy"] === undefined ? { rule: "bl" } : isRecord(options["strategyOptions"]) ? options["strategyOptions"] : {};
  const member = rawConfig(inner, innerOptions);
  if (!member.ok) return { ok: false, reason: `The member ${inner} of the option side-anchors.strategy has no point. ${member.reason}` };
  const first = options["first"];
  if (first === undefined) return member;
  if (!isRecord(first) || typeof first["side"] !== "string" || typeof first["at"] !== "number") return { ok: false, reason: "packSpace holds the option side-anchors.first only with side and at." };
  return { ok: true, config: metaConfig("side-anchors", [member.config], { side: first["side"], at: first["at"] }) };
}

/** This function gives the config of a strategy with its options before the checks of `checkConfig`. */
function rawConfig(id: string, given: Readonly<Record<string, unknown>>): StrategyPoint {
  let options = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));
  const places = PACK_SPACE_OPTIONS[id];
  if (places === undefined) return { ok: false, reason: `packSpace has no strategy ${id}.` };
  if (id === "pack") {
    if (Object.keys(options).length > 0) return { ok: false, reason: "The point of pack is the choice of pack without options. Give the strategy of options.strategy and its options." };
    return { ok: true, config: packSpace.named!["pack"]! };
  }
  if (id === "aspect-fit" && options["strategy"] !== undefined) {
    // The options strategy and options of aspect-fit give one member together.
    const { strategy: inner, options: innerOptions, ...rest } = options;
    options = { ...rest, member: { strategy: inner, options: innerOptions ?? {} } };
  }
  if (id === "relax" && options["pull"] !== undefined) {
    // The pull with no spread is the option relax-pull of the stage combine. The pull 0 is relax.
    const { pull, ...rest } = options;
    if (pull === 0) options = rest;
    else if (options["strength"] !== 0) return { ok: false, reason: "packSpace holds the option relax.pull only with the strength 0: the option relax-pull of the stage combine." };
    else options = { pull, member: options["member"] ?? { strategy: "maxrects", options: { rule: "bl" } } };
  }
  for (const name of Object.keys(options)) {
    const key = `${id}.${name}`;
    if (name !== "member" || id !== "aspect-fit") {
      if (places[name] === undefined) return { ok: false, reason: `PACK_SPACE_OPTIONS has no place for the option ${key}.` };
      if (places[name] === null) return { ok: false, reason: `packSpace does not hold the option ${key}: ${PACK_SPACE_LEFT_OUT[key] ?? "PACK_SPACE_LEFT_OUT gives no reason."}` };
    }
  }
  if (id === "side-anchors") return sideAnchorsPoint(options);
  if (SINGLE_STRATEGIES.includes(id)) {
    try {
      return { ok: true, config: baseConfig(id, options) };
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
  }
  const base = packSpace.named![id]!;
  const placeOf = (name: string): string => {
    if (name === "member" && id === "aspect-fit") return "combine.aspect-fit.members";
    return name === "member" && id === "relax" && options["pull"] !== undefined ? "combine.relax-pull.members" : places[name]!;
  };
  // The options name one option of the stage combine. Another option than the option of the named config starts with no params and no members.
  const targets = [...new Set(Object.keys(options).map((name) => placeOf(name).split(".")[1]!))];
  if (targets.length > 1) return { ok: false, reason: `The options of ${id} set the options ${targets.join(" and ")} of the stage combine. A config has one.` };
  const named = base.stages["combine"]!;
  let combine: StageChoice = targets[0] === undefined || targets[0] === named.option ? named : { option: targets[0] };
  for (const [name, value] of Object.entries(options)) {
    const place = placeOf(name);
    const [, , param] = place.split(".");
    if (param === "members") {
      const members: StrategyConfig[] = [];
      for (const item of Array.isArray(value) ? value : [value]) {
        const member = memberOf(item);
        if (member === undefined) return { ok: false, reason: `The option ${id}.${name} has a member that is not a strategy id or an entry with strategy and options.` };
        if (STANDALONE_PLACEMENTS.includes(member.strategy)) return { ok: false, reason: notMember(member.strategy) };
        const point = rawConfig(member.strategy, member.options);
        if (!point.ok) return { ok: false, reason: `The member ${member.strategy} of the option ${id}.${name} has no point. ${point.reason}` };
        members.push(point.config);
      }
      combine = { ...combine, members };
      continue;
    }
    const v = paramValue(param!, value);
    if (v === undefined) return { ok: false, reason: `The value of the option ${id}.${name} is not a string, a number, a boolean or a value of NAMED_VALUES.` };
    combine = { ...combine, params: { ...combine.params, [param!]: v } };
  }
  if (id === "aspect-fit") {
    // A target aspect is a point only with the flag fixedTarget. A portfolio inside aspect-fit is the portfolio with the param aspectFit.
    const target = combine.params?.["targetAspect"] === undefined ? {} : { fixedTarget: true, targetAspect: combine.params["targetAspect"] };
    const inner = combine.members?.[0]?.stages["combine"];
    if (inner?.option === "portfolio" || inner?.option === "cell-portfolio") {
      return { ok: true, config: { space: ENGINE, stages: { ...combine.members![0]!.stages, combine: { ...inner, params: { ...inner.params, aspectFit: true, ...target } } } } };
    }
    combine = { ...combine, params: { ...combine.params, ...target } };
  }
  return { ok: true, config: { space: ENGINE, stages: { ...base.stages, combine } } };
}

/**
 * This function gives the point in `packSpace` of a strategy of the registry with its options: the canonical config with the same output.
 *
 * - The id `pack` with no options gives the named config `pack`, the choice of `pack` without a strategy.
 * - `baseConfig` gives the config of a single strategy. A meta strategy starts at its named config, and `PACK_SPACE_OPTIONS` gives the place of each option.
 * - A member is a strategy id or an entry with `strategy` and `options`. Each member gets its own point in the same way.
 * - The param `table` of `select` takes `SELECT_TABLE` or `PACK_DEFAULT_TABLE`. The param `key` takes the measure list of `area` or `fill`.
 * - The result has a reason in place of a config when an option has no place, or when `checkConfig` finds a break.
 */
export function configOfStrategy(id: string, options: Readonly<Record<string, unknown>> = {}): StrategyPoint {
  const raw = rawConfig(id, options);
  if (!raw.ok) return raw;
  const breaks = checkConfig(packSpace, raw.config);
  if (breaks.length > 0) return { ok: false, reason: `The config is not a point of packSpace: ${breaks.map((b) => `${b.claim}: ${b.detail}`).join("; ")}.` };
  return { ok: true, config: canonicalConfig(packSpace, raw.config) };
}

/**
 * The level of the shape check of a `bbox` config. A `bbox` output places each bounding box with no overlap and in the container.
 * Thus the safe counts of `no-overlap` and `in-container` on a shape are 0. A safe count of 0 tells that the rule has no break.
 */
const BBOX_CHECK: ShapeCheck = Object.freeze({ level: "safe" });

/**
 * The level of the shape check of a `hole-degree` config. The hard rules of the contract test the bounding boxes. Two circles that
 * touch have bounding boxes that overlap. Thus the check uses the level `safe`, and `circleOverlaps` gives the exact count.
 */
const CIRCLE_CHECK: ShapeCheck = Object.freeze({ level: "safe" });

/** The placements that take the level `CIRCLE_CHECK`. */
const CIRCLE_PLACEMENTS: readonly string[] = ["hole-degree", "circle-quasi-physical"];

/** The id of the input in the breaks of `checkShapes`. A `PackInput` has no id. */
const SHAPE_INPUT_ID = "pack-input";

/** The name of each single named config, by its `configId`. The first name of an id wins. */
const NAMES: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [name, config] of Object.entries(SINGLE)) {
    const id = configId(packSpace, config);
    if (!out.has(id)) out.set(id, name);
  }
  return out;
})();

/** The ids of the members of `cell-portfolio`, sorted */
const POOL_IDS: string = pool.map((c) => configId(packSpace, c)).sort().join(",");

/** One single strategy of the registry with its options. */
interface Run {
  strategy: string;
  options: Record<string, unknown>;
}

/** This function gives the single strategy and the options of a canonical base config. */
function runOf(config: StrategyConfig): Run {
  const s = config.stages;
  const sortOrder = s["order"]!.option;
  const place = s["placement"]!;
  const p = place.params ?? {};
  if (place.option === "push") return { strategy: "push", options: { sortOrder, maxShovesPerItem: p["maxShovesPerItem"] } };
  if (place.option === "hole-degree") return { strategy: "hole-degree", options: { steps: p["steps"] } };
  if (place.option === "circle-quasi-physical") return { strategy: "circle-quasi-physical", options: { iterations: p["iterations"] } };
  if (STANDALONE_PLACEMENTS.includes(place.option)) return { strategy: place.option, options: { ...p } };
  const options: Record<string, unknown> = { sortOrder, samples: s["size-search"]!.params?.["samples"] };
  if (place.option === "shelf" && p["fit"] !== "none") options["fit"] = p["fit"];
  if (place.option === "skyline") {
    options["rule"] = p["rule"];
    options["wasteMap"] = p["wasteMap"];
    options["rotate"] = p["rotate"];
  }
  if (place.option === "maxrects") {
    options["rule"] = p["rule"];
    options["rotate"] = p["rotate"];
    if (p["fixedBands"] === true) options["bandHeight"] = p["bandHeight"];
  }
  if (place.option === "bottom-left") options["rule"] = p["rule"];
  if (place.option === "best-fit") options["side"] = p["side"];
  if (place.option === "guillotine") {
    options["choice"] = p["choice"];
    options["split"] = p["split"];
    options["rotate"] = p["rotate"];
    options["merge"] = p["merge"];
  }
  return { strategy: place.option, options };
}

/** This function gives the portfolio entry of a member: the name of a named config, else its `configId`, as the id. */
function entryOf(member: StrategyConfig): PortfolioEntry {
  const id = configId(packSpace, member);
  const run = runOf(member);
  return { id: NAMES.get(id) ?? id, strategy: run.strategy, options: run.options };
}

/** This function packs with a strategy of the registry, with `aspect-fit` around it when the params tell it. */
function wrapped(id: string, options: Record<string, unknown>, params: Readonly<Record<string, unknown>>, input: PackInput, seed: number): PackOutput {
  if (params["aspectFit"] !== true) return packWith(id, input, options, seed);
  const target = params["fixedTarget"] === true ? { targetAspect: params["targetAspect"] } : {};
  return packWith("aspect-fit", input, { strategy: id, options, ...target }, seed);
}

/** This function gives the option of the stage `combine` of a config, or `undefined`. It reads a config that is not checked. */
function combineOf(config: StrategyConfig): string | undefined {
  const c = (config as { stages?: Record<string, { option?: unknown } | null> }).stages?.["combine"];
  return typeof c?.option === "string" ? c.option : undefined;
}

/** This function gives the option of the stage `placement` of a config, or `undefined`. It reads a config that is not checked. */
function placementOf(config: StrategyConfig): string | undefined {
  const c = (config as { stages?: Record<string, { option?: unknown } | null> }).stages?.["placement"];
  return typeof c?.option === "string" ? c.option : undefined;
}

/**
 * This function packs an input with a config of `packSpace` and a seed. The default seed is 0.
 *
 * - The function checks the config with `checkConfig`. A config with a break causes a `RangeError` with the details of each break.
 * - The function checks the shape kinds of the items with `checkShapes` and `checkConfig`. A break causes `UnsupportedShape`.
 * - A `bbox` config supports each shape kind. The function checks only the hard rules on it, with `checkShapes` at the level `safe`.
 * - The caller checks the measures of a `bbox` output with `checkShapes`.
 * - A `hole-degree` or `circle-quasi-physical` config supports only circles. The function checks only the hard rules on it, at the level `safe`.
 * - The params `limitMembers` and `limitTime` of a portfolio give the options `maxMembers` and `budgetMs`.
 * - The param `limitTime` of `restarts` gives the options `limitTime` and `budgetMs` of the strategy `restarts`.
 * - The param `limitWork` of a portfolio and of `restarts` gives the option `budgetWork` (roadmap item k117).
 * - The param `limitWork` of `anneal`, `genetic` and `tabu` gives the option `budgetWork` too (roadmap item k26).
 * - A base config packs with its single strategy.
 * - A composite with a member of `STANDALONE_PLACEMENTS` causes `UnsupportedCell`, because a composite finds only a member of the registry.
 * - A meta config packs with `portfolio`, `select`, `aspect-fit`, `restarts`, `bbox`, `ruin-recreate`, `overlap-min`, `anneal`, `genetic` or `tabu`.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. Other members break the `pool` and cause a `RangeError`.
 * - The output of each named config is equal to the output of the strategy or the benchmark entry of that name.
 */
export function packConfig(input: PackInput, config: StrategyConfig, seed = 0): PackOutput {
  const boxes = { id: SHAPE_INPUT_ID, boxes: input.items };
  const found = checkConfig(packSpace, config, { shapes: shapeKindsOf(boxes) });
  const breaks = found.filter((b) => b.claim !== "shape");
  if (breaks.length > 0) throw new RangeError(`The config is not a config of the space packing: ${breaks.map((b) => b.detail).join("; ")}.`);
  const level = combineOf(config) === "bbox" ? BBOX_CHECK : CIRCLE_PLACEMENTS.includes(String(placementOf(config))) ? CIRCLE_CHECK : undefined;
  const shapes = level === undefined ? checkShapes(boxes, [...Object.values(MEASURE_SPECS), ...PACK_HARD_RULES]) : checkShapes(boxes, PACK_HARD_RULES, level);
  const shapeBreaks = [...shapes, ...found];
  if (shapeBreaks.length > 0) throw new UnsupportedShape(itemShapeOf(boxes), shapeBreaks);
  const c = canonicalConfig(packSpace, config);
  const combine = c.stages["combine"];
  if (combine === null || combine === undefined) {
    const run = runOf(c);
    return packWith(run.strategy, input, run.options, seed);
  }
  const params = combine.params ?? {};
  const members = combine.members ?? [];
  const outside = members.map(placementOf).find((placement) => STANDALONE_PLACEMENTS.includes(String(placement)));
  if (outside !== undefined) throw refusal(notMember(outside));
  const key = params["key"] === "area" ? { key: AREA_KEY } : params["key"] === "fill" ? { key: FILL_KEY } : {};
  const limits = {
    ...(params["limitMembers"] === true ? { maxMembers: params["maxMembers"] } : {}),
    ...(params["limitTime"] === true ? { budgetMs: params["budgetMs"] } : {}),
  };
  const work = params["limitWork"] === true ? { budgetWork: params["budgetWork"] } : {};
  switch (combine.option) {
    case "portfolio":
      return wrapped("portfolio", { members: members.map(entryOf), ...key, ...limits, ...work }, params, input, seed);
    case "cell-portfolio": {
      if (members.map((m) => configId(packSpace, m)).sort().join(",") !== POOL_IDS)
        throw new RangeError("The members of cell-portfolio are the entries of PORTFOLIO_SETS.");
      return wrapped("portfolio", { ...(params["k"] === "cell" ? {} : { k: params["k"] }), ...key, ...limits, ...work }, params, input, seed);
    }
    case "select":
      return packWith("select", input, { members: members.map(entryOf), ...(params["table"] === "pack" ? { table: PACK_DEFAULT_TABLE } : {}) }, seed);
    case "restarts": {
      const time = params["limitTime"] === true ? { limitTime: true, budgetMs: params["budgetMs"] } : {};
      const options = { member: entryOf(members[0]!), iterations: params["iterations"], perturb: params["perturb"], strength: params["strength"] };
      return packWith("restarts", input, { ...options, ...key, ...time, ...work }, seed);
    }
    case "bbox":
      return packWith("bbox", input, { member: entryOf(members[0]!), turn: params["turn"] === true }, seed);
    case "ruin-recreate": {
      const options = { member: entryOf(members[0]!), iterations: params["iterations"], ruin: params["ruin"], strength: params["strength"], shrink: params["shrink"] };
      return packWith("ruin-recreate", input, options, seed);
    }
    case "overlap-min":
      return packWith("overlap-min", input, { member: entryOf(members[0]!), iterations: params["iterations"], step: params["step"] }, seed);
    case "anneal":
      return packWith("anneal", input, { member: entryOf(members[0]!), iterations: params["iterations"], temperature: params["temperature"], cooling: params["cooling"], ...work }, seed);
    case "genetic":
      return packWith("genetic", input, { member: entryOf(members[0]!), iterations: params["iterations"], population: params["population"], mutation: params["mutation"], ...work }, seed);
    case "tabu":
      return packWith("tabu", input, { member: entryOf(members[0]!), iterations: params["iterations"], tenure: params["tenure"], neighbors: params["neighbors"], ...work }, seed);
    case "relax":
      return packWith("relax", input, { member: entryOf(members[0]!), strength: params["strength"] }, seed);
    case "relax-pull":
      return packWith("relax", input, { member: entryOf(members[0]!), strength: 0, pull: params["pull"] }, seed);
    case "force":
      return packWith("force", input, { member: entryOf(members[0]!), iterations: params["iterations"], rounds: params["rounds"] }, seed);
    case "side-anchors": {
      const run = runOf(members[0]!);
      return packWith("side-anchors", input, { strategy: run.strategy, strategyOptions: run.options, first: { side: params["side"], at: params["at"] } }, seed);
    }
    default: {
      const run = runOf(members[0]!);
      return wrapped(run.strategy, run.options, { ...params, aspectFit: true }, input, seed);
    }
  }
}
