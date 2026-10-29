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
import type { GuillotineStrategyOptions, LayoutStrategyOptions, MaxRectsStrategyOptions, PushStrategyOptions, SkylineStrategyOptions } from "./adapters.ts";
import { BBOX_SHAPES, type BboxStrategyOptions } from "./bbox.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { GUILLOTINE_CHOICES, GUILLOTINE_SPLITS } from "./guillotine.ts";
import { MAXRECTS_RULES } from "./maxrects.ts";
import { SKYLINE_RULES } from "./skyline.ts";
import { MEASURE_SPECS } from "./measures.ts";
import { SORT_ORDERS } from "./order.ts";
import type { PackLayoutOptions } from "./pack.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { PORTFOLIO_FRAME_MS } from "./portfolio-cell.ts";
import { PORTFOLIO_SETS } from "./portfolio-sets.ts";
import type { PortfolioStrategyOptions } from "./portfolio-strategy.ts";
import { packWith, strategy, type AspectFitStrategyOptions } from "./registry.ts";
import { RESTART_PERTURBS, type RestartsStrategyOptions } from "./restarts.ts";
import { RUIN_KINDS, type RuinRecreateStrategyOptions } from "./ruin-recreate.ts";
import type { SelectStrategyOptions } from "./select.ts";
import { SHELF_FITS } from "./shelf.ts";
import { UnsupportedShape } from "./strategy.ts";

/** The engine name of `packSpace`. Each config of the space has it in `space`. */
const ENGINE = "packing";

/** The key `area` of the portfolio: the area first after the hard breaks, then the key of `PORTFOLIO_LEVELS`. */
const AREA_KEY: readonly string[] = Object.freeze(["pack.area", "pack.overflow.excessArea", "pack.fill"]);

/** The params of the aspect search: a fixed target aspect, else the aspect of the container. */
const TARGET_PARAMS: readonly SpaceParam[] = [
  { name: "fixedTarget", kind: "bool", default: false },
  { name: "targetAspect", kind: "real", min: 0.25, max: 4, scale: "log", default: 1, when: { param: "fixedTarget", in: [true] } },
];

/**
 * The params of a portfolio: the key of the pick, the limits of the run, and an optional aspect search around the portfolio.
 * The options `maxMembers` and `budgetMs` have no default. Thus each one has a switch param, with the default `false`.
 */
const PORTFOLIO_PARAMS: readonly SpaceParam[] = [
  { name: "key", kind: "enum", values: ["levels", "area"], default: "levels" },
  { name: "limitMembers", kind: "bool", default: false },
  { name: "maxMembers", kind: "int", min: 1, max: 5, default: 3, when: { param: "limitMembers", in: [true] } },
  { name: "limitTime", kind: "bool", default: false },
  { name: "budgetMs", kind: "real", min: 1, max: 2000, scale: "log", default: PORTFOLIO_FRAME_MS, when: { param: "limitTime", in: [true] } },
  { name: "aspectFit", kind: "bool", default: false },
  { ...TARGET_PARAMS[0]!, when: { param: "aspectFit", in: [true] } },
  TARGET_PARAMS[1]!,
];

/**
 * The params of the random restarts of roadmap item k78. They are the key of the pick, the count of the restarts, the change of
 * the order, its strength and the time limit. The option `budgetMs` has a switch param `limitTime`, with the default `false`.
 */
const RESTARTS_PARAMS: readonly SpaceParam[] = [
  PORTFOLIO_PARAMS[0]!,
  { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 16 },
  { name: "perturb", kind: "enum", values: [...RESTART_PERTURBS], default: "swap" },
  { name: "strength", kind: "real", min: 0, max: 1, default: 0.1 },
  { name: "limitTime", kind: "bool", default: false },
  { name: "budgetMs", kind: "real", min: 1, max: 2000, scale: "log", default: PORTFOLIO_FRAME_MS, when: { param: "limitTime", in: [true] } },
];

/**
 * The params of the goal-driven ruin and recreate of roadmap item k79. They are the count of the iterations, the kind of the
 * ruin, the largest share of the items that one ruin removes, and the shrink of a met goal.
 */
const RUIN_RECREATE_PARAMS: readonly SpaceParam[] = [
  { name: "iterations", kind: "int", min: 1, max: 256, scale: "log", default: 64 },
  { name: "ruin", kind: "enum", values: [...RUIN_KINDS], default: "mixed" },
  { name: "strength", kind: "real", min: 0, max: 1, default: 0.3 },
  { name: "shrink", kind: "real", min: 0.001, max: 0.5, scale: "log", default: 0.005 },
];

/** The inputs of each option of `packSpace`: only the shape kind `rect` (`docs/SHAPES.md` of the contract). */
const RECT_ONLY: OptionSupports = Object.freeze({ shape: Object.freeze(["rect"] as const) });

/** The inputs of the option `bbox` of roadmap item k91: each shape kind. Its members have `view: "bounds"`, so they get only `rect` items. */
const BBOX_ONLY: OptionSupports = Object.freeze({ shape: BBOX_SHAPES });

/** This function gives the stage choice of a param list, without an empty list of params. */
const choice = (option: string, params: Record<string, string | number | boolean> = {}): StageChoice =>
  Object.keys(params).length === 0 ? { option } : { option, params };

/**
 * This function gives the base config of a single strategy of the registry with some options over its defaults.
 * It throws a `RangeError` for a composite strategy and for an option that the space does not have.
 */
export function baseConfig(id: string, options: Readonly<Record<string, unknown>> = {}): StrategyConfig {
  const o = { ...(strategy(id).defaults as Record<string, unknown>), ...options };
  const known = id === "push" ? ["sortOrder", "maxShovesPerItem"] : ["sortOrder", "samples", "fit", "rule", "rotate", "bandHeight", "wasteMap", "choice", "split", "merge"];
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
  } else if (id === "rows") stages["placement"] = choice(id);
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
  { name: "order", options: SORT_ORDERS.map((id) => ({ id, params: [], supports: RECT_ONLY })) },
  {
    name: "size-search",
    options: [
      { id: "log-sweep", params: [{ name: "samples", kind: "int", min: 12, max: 192, scale: "log", default: 48 }], supports: RECT_ONLY },
      { id: "none", params: [], supports: RECT_ONLY },
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
    ],
  },
  { name: "local-search", options: [{ id: "none", params: [], supports: RECT_ONLY }] },
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
      { id: "select", params: [{ name: "table", kind: "enum", values: ["k66"], default: "k66" }], members: { min: 2, max: 2, ordered: true }, supports: RECT_ONLY },
      { id: "aspect-fit", params: TARGET_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "restarts", params: RESTARTS_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
      { id: "bbox", params: [{ name: "turn", kind: "bool", default: false }], members: { min: 1, max: 1, ordered: true, view: "bounds" }, supports: BBOX_ONLY },
      { id: "ruin-recreate", params: RUIN_RECREATE_PARAMS, members: { min: 1, max: 1, ordered: true }, supports: RECT_ONLY },
    ],
  },
];

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
};

const single = (id: string): StrategyConfig => SINGLE[id]!;

/**
 * The strategy space of `packing`, schema `strategy-space/1`. It has 5 stages: `order`, `size-search`, `placement`,
 * `local-search` and `combine`. Each entry of the benchmark and each id of the registry is a named config.
 *
 * - `size-search` acts only on a container of free size. The option `none` goes with `push` only.
 * - `combine` has the meta options `portfolio`, `cell-portfolio`, `select`, `aspect-fit`, `restarts`, `bbox` and `ruin-recreate`.
 * - `restarts`, `bbox` and `ruin-recreate` have 1 member.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. The table of the input picks the members that run.
 * - The `pool` of `cell-portfolio` has one entry, the configs of `PORTFOLIO_SETS`. Thus `spaceSize` counts one member list for it.
 * - The param `aspectFit` of a portfolio puts `aspect-fit` around it. Thus `aspect-fit-portfolio-k2` keeps the depth 1.
 * - The named config `aspect-fit` wraps `maxrects`, because the registry strategy needs an inner strategy.
 * - Each option supports only the shape kind `rect`, but `bbox` supports each kind. Its members have `view: "bounds"`, so the checks give them the kind `rect`.
 * - Thus `spaceSize` with other `shapes` counts only the configs with `bbox`. It gives 0 base configs.
 * - Each option of each strategy is a param, a stage or the members of a meta option. `PACK_SPACE_OPTIONS` tells the place.
 */
export const packSpace: StrategySpace = Object.freeze({
  schema: STRATEGY_SPACE_SCHEMA,
  engine: ENGINE,
  version: "1",
  stages: STAGES,
  constraints: [
    { if: { stage: "placement", option: "push" }, then: { stage: "size-search", option: "none" } },
    { if: { stage: "size-search", option: "none" }, then: { stage: "placement", option: "push" } },
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
    portfolio: metaConfig("cell-portfolio", pool),
    "aspect-fit": metaConfig("aspect-fit", [single("maxrects")]),
    select: metaConfig("select", [single("rows"), single("maxrects-bl")]),
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
  } satisfies Places<RestartsStrategyOptions>,
  bbox: { member: "combine.bbox.members", turn: "combine.bbox.turn" } satisfies Places<BboxStrategyOptions>,
  "ruin-recreate": {
    member: "combine.ruin-recreate.members",
    iterations: "combine.ruin-recreate.iterations",
    ruin: "combine.ruin-recreate.ruin",
    strength: "combine.ruin-recreate.strength",
    shrink: "combine.ruin-recreate.shrink",
  } satisfies Places<RuinRecreateStrategyOptions>,
  pack: {
    sortOrder: "order",
    space: null,
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
});

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
  "pack.turnable": "It is a set of rectangles of the input. The `rotate` params of `maxrects`, `skyline` and `guillotine` make it.",
  "pack.turned": "It is a set that `pack` fills with the turned rectangles. It holds a result, not a choice.",
});

/**
 * The level of the shape check of a `bbox` config. A `bbox` output places each bounding box with no overlap and in the container.
 * Thus the safe counts of `no-overlap` and `in-container` on a shape are 0. A safe count of 0 tells that the rule has no break.
 */
const BBOX_CHECK: ShapeCheck = Object.freeze({ level: "safe" });

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

/**
 * This function packs an input with a config of `packSpace` and a seed. The default seed is 0.
 *
 * - The function checks the config with `checkConfig`. A config with a break causes a `RangeError` with the details of each break.
 * - The function checks the shape kinds of the items with `checkShapes` and `checkConfig`. A break causes `UnsupportedShape`.
 * - A `bbox` config supports each shape kind. The function checks only the hard rules on it, with `checkShapes` at the level `safe`.
 * - The caller checks the measures of a `bbox` output with `checkShapes`.
 * - The params `limitMembers` and `limitTime` of a portfolio give the options `maxMembers` and `budgetMs`.
 * - The param `limitTime` of `restarts` gives the options `limitTime` and `budgetMs` of the strategy `restarts`.
 * - A base config packs with its single strategy of the registry.
 * - A meta config packs with `portfolio`, `select`, `aspect-fit`, `restarts`, `bbox` or `ruin-recreate`.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. Other members break the `pool` and cause a `RangeError`.
 * - The output of each named config is equal to the output of the strategy or the benchmark entry of that name.
 */
export function packConfig(input: PackInput, config: StrategyConfig, seed = 0): PackOutput {
  const boxes = { id: SHAPE_INPUT_ID, boxes: input.items };
  const found = checkConfig(packSpace, config, { shapes: shapeKindsOf(boxes) });
  const breaks = found.filter((b) => b.claim !== "shape");
  if (breaks.length > 0) throw new RangeError(`The config is not a config of the space packing: ${breaks.map((b) => b.detail).join("; ")}.`);
  const shapes = combineOf(config) === "bbox" ? checkShapes(boxes, PACK_HARD_RULES, BBOX_CHECK) : checkShapes(boxes, [...Object.values(MEASURE_SPECS), ...PACK_HARD_RULES]);
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
  const key = params["key"] === "area" ? { key: AREA_KEY } : {};
  const limits = {
    ...(params["limitMembers"] === true ? { maxMembers: params["maxMembers"] } : {}),
    ...(params["limitTime"] === true ? { budgetMs: params["budgetMs"] } : {}),
  };
  switch (combine.option) {
    case "portfolio":
      return wrapped("portfolio", { members: members.map(entryOf), ...key, ...limits }, params, input, seed);
    case "cell-portfolio": {
      if (members.map((m) => configId(packSpace, m)).sort().join(",") !== POOL_IDS)
        throw new RangeError("The members of cell-portfolio are the entries of PORTFOLIO_SETS.");
      return wrapped("portfolio", { ...(params["k"] === "cell" ? {} : { k: params["k"] }), ...key, ...limits }, params, input, seed);
    }
    case "select":
      return packWith("select", input, { members: members.map(entryOf) }, seed);
    case "restarts": {
      const time = params["limitTime"] === true ? { limitTime: true, budgetMs: params["budgetMs"] } : {};
      const options = { member: entryOf(members[0]!), iterations: params["iterations"], perturb: params["perturb"], strength: params["strength"] };
      return packWith("restarts", input, { ...options, ...key, ...time }, seed);
    }
    case "bbox":
      return packWith("bbox", input, { member: entryOf(members[0]!), turn: params["turn"] === true }, seed);
    case "ruin-recreate": {
      const options = { member: entryOf(members[0]!), iterations: params["iterations"], ruin: params["ruin"], strength: params["strength"], shrink: params["shrink"] };
      return packWith("ruin-recreate", input, options, seed);
    }
    default: {
      const run = runOf(members[0]!);
      return wrapped(run.strategy, run.options, { ...params, aspectFit: true }, input, seed);
    }
  }
}
