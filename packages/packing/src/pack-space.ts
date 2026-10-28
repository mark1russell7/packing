// The strategy space of the engine `packing` (roadmap item k68). The stages, their options and the ranges of their params
// are data of the schema `strategy-space/1` of `@mark1russell7/layout-contract`. `packConfig` packs a config with the
// strategies of the registry. It adds no new algorithm.

import {
  canonicalConfig,
  checkConfig,
  configId,
  STRATEGY_SPACE_SCHEMA,
  type SpaceParam,
  type SpaceStage,
  type StageChoice,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { MAXRECTS_RULES } from "./maxrects.ts";
import { SORT_ORDERS } from "./order.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { PORTFOLIO_SETS } from "./portfolio-sets.ts";
import { packWith, strategy } from "./registry.ts";
import { SHELF_FITS } from "./shelf.ts";

/** The engine name of `packSpace`. Each config of the space has it in `space`. */
const ENGINE = "packing";

/** The key `area` of the portfolio: the area first after the hard breaks, then the key of `PORTFOLIO_LEVELS`. */
const AREA_KEY: readonly string[] = Object.freeze(["pack.area", "pack.overflow.excessArea", "pack.fill"]);

/** The params of the aspect search: a fixed target aspect, else the aspect of the container. */
const TARGET_PARAMS: readonly SpaceParam[] = [
  { name: "fixedTarget", kind: "bool", default: false },
  { name: "targetAspect", kind: "real", min: 0.25, max: 4, scale: "log", default: 1, when: { param: "fixedTarget", in: [true] } },
];

/** The params of a portfolio: the key of the pick, and an optional aspect search around the portfolio. */
const PORTFOLIO_PARAMS: readonly SpaceParam[] = [
  { name: "key", kind: "enum", values: ["levels", "area"], default: "levels" },
  { name: "aspectFit", kind: "bool", default: false },
  { ...TARGET_PARAMS[0]!, when: { param: "aspectFit", in: [true] } },
  TARGET_PARAMS[1]!,
];

/** The stages of `packSpace`, in the order of the pipeline. */
const STAGES: readonly SpaceStage[] = [
  { name: "order", options: SORT_ORDERS.map((id) => ({ id, params: [] })) },
  {
    name: "size-search",
    options: [
      { id: "log-sweep", params: [{ name: "samples", kind: "int", min: 12, max: 192, scale: "log", default: 48 }] },
      { id: "none", params: [] },
    ],
  },
  {
    name: "placement",
    // Roadmap item k75 adds `supports: { shape: ["rect"] }` to each option of this stage (layout-contract 0.2.13).
    options: [
      { id: "rows", params: [] },
      { id: "skyline", params: [] },
      { id: "shelf", params: [{ name: "fit", kind: "enum", values: ["none", ...SHELF_FITS], default: "none" }] },
      {
        id: "maxrects",
        params: [
          { name: "rule", kind: "enum", values: [...MAXRECTS_RULES], default: "bssf" },
          { name: "rotate", kind: "bool", default: false },
          { name: "fixedBands", kind: "bool", default: false },
          { name: "bandHeight", kind: "real", min: 1, max: 64, scale: "log", default: 8, when: { param: "fixedBands", in: [true] } },
        ],
      },
      { id: "push", params: [{ name: "maxShovesPerItem", kind: "int", min: 1, max: 64, scale: "log", default: 8 }] },
    ],
  },
  { name: "local-search", options: [{ id: "none", params: [] }] },
  {
    name: "combine",
    optional: true,
    options: [
      { id: "portfolio", params: PORTFOLIO_PARAMS, members: { min: 2, max: 5, ordered: true } },
      {
        id: "cell-portfolio",
        params: [{ name: "k", kind: "enum", values: ["cell", 2, 3], default: "cell" }, ...PORTFOLIO_PARAMS],
        members: { min: Object.keys(PORTFOLIO_SETS.entries).length, max: Object.keys(PORTFOLIO_SETS.entries).length, ordered: false },
      },
      { id: "select", params: [{ name: "table", kind: "enum", values: ["k66"], default: "k66" }], members: { min: 2, max: 2, ordered: true } },
      { id: "aspect-fit", params: TARGET_PARAMS, members: { min: 1, max: 1, ordered: true } },
    ],
  },
];

/** This function gives the stage choice of a param list, without an empty list of params. */
const choice = (option: string, params: Record<string, string | number | boolean> = {}): StageChoice =>
  Object.keys(params).length === 0 ? { option } : { option, params };

/**
 * This function gives the base config of a single strategy of the registry with some options over its defaults.
 * It throws a `RangeError` for a composite strategy and for an option that the space does not have.
 */
export function baseConfig(id: string, options: Readonly<Record<string, unknown>> = {}): StrategyConfig {
  const o = { ...(strategy(id).defaults as Record<string, unknown>), ...options };
  const known = id === "push" ? ["sortOrder", "maxShovesPerItem"] : ["sortOrder", "samples", "fit", "rule", "rotate", "bandHeight"];
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
  } else if (id === "rows" || id === "skyline") stages["placement"] = choice(id);
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
  ...Object.fromEntries(MAXRECTS_RULES.map((rule) => [`maxrects-${rule}`, baseConfig("maxrects", { rule })])),
  maxrects: baseConfig("maxrects"),
};

const pool = Object.values(POOL);
const single = (id: string): StrategyConfig => SINGLE[id]!;

/**
 * The strategy space of `packing`, schema `strategy-space/1`. It has 5 stages: `order`, `size-search`, `placement`,
 * `local-search` and `combine`. Each entry of the benchmark and each id of the registry is a named config.
 *
 * - `size-search` acts only on a container of free size. The option `none` goes with `push` only.
 * - `combine` has the meta options `portfolio`, `cell-portfolio`, `select` and `aspect-fit`.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. The table of the input picks the members that run.
 * - The param `aspectFit` of a portfolio puts `aspect-fit` around it. Thus `aspect-fit-portfolio-k2` keeps the depth 1.
 * - The named config `aspect-fit` wraps `maxrects`, because the registry strategy needs an inner strategy.
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
  },
} satisfies StrategySpace);

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
  if (place.option === "maxrects") {
    options["rule"] = p["rule"];
    options["rotate"] = p["rotate"];
    if (p["fixedBands"] === true) options["bandHeight"] = p["bandHeight"];
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

/**
 * This function packs an input with a config of `packSpace` and a seed. The default seed is 0.
 *
 * - The function checks the config with `checkConfig`. A config with a break causes a `RangeError` with the details of each break.
 * - A base config packs with its single strategy of the registry. A meta config packs with `portfolio`, `select` or `aspect-fit`.
 * - The members of `cell-portfolio` are the entries of `PORTFOLIO_SETS`. Other members cause a `RangeError`.
 * - The output of each named config is equal to the output of the strategy or the benchmark entry of that name.
 */
export function packConfig(input: PackInput, config: StrategyConfig, seed = 0): PackOutput {
  const breaks = checkConfig(packSpace, config);
  if (breaks.length > 0) throw new RangeError(`The config is not a config of the space packing: ${breaks.map((b) => b.detail).join("; ")}.`);
  const c = canonicalConfig(packSpace, config);
  const combine = c.stages["combine"];
  if (combine === null || combine === undefined) {
    const run = runOf(c);
    return packWith(run.strategy, input, run.options, seed);
  }
  const params = combine.params ?? {};
  const members = combine.members ?? [];
  const key = params["key"] === "area" ? { key: AREA_KEY } : {};
  switch (combine.option) {
    case "portfolio":
      return wrapped("portfolio", { members: members.map(entryOf), ...key }, params, input, seed);
    case "cell-portfolio": {
      if (members.map((m) => configId(packSpace, m)).sort().join(",") !== POOL_IDS)
        throw new RangeError("The members of cell-portfolio are the entries of PORTFOLIO_SETS.");
      return wrapped("portfolio", { ...(params["k"] === "cell" ? {} : { k: params["k"] }), ...key }, params, input, seed);
    }
    case "select":
      return packWith("select", input, { members: members.map(entryOf) }, seed);
    default: {
      const run = runOf(members[0]!);
      return wrapped(run.strategy, run.options, { ...params, aspectFit: true }, input, seed);
    }
  }
}
