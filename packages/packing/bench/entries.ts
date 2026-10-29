// The entries of the benchmark (`docs/BENCH.md`, "The entries"). An entry is a strategy of the registry with some options.
// Each strategy of the registry is an entry with its defaults. Roadmap item k21 adds the variants of the shelf family.
// Roadmap item k24 adds an entry for each rule of `maxrects`. The strategy `maxrects` has no entry of its own, because
// its defaults are the entry `maxrects-bssf`.

import { strategies, strategy } from "@mark1russell7/packing";

/** One entry of the benchmark: a strategy of the registry and the options that the runner gives it. */
export interface BenchEntry {
  /** The id of the entry. Each record of the entry has it in the field `strategy`. */
  id: string;
  /** The id of the strategy of the registry */
  strategy: string;
  /** The options of the entry over the defaults of the strategy. An entry of the registry has no options. */
  options: Readonly<Record<string, unknown>>;
  /** The entry without the options of this entry. The activation compares the outputs of the two entries. */
  base?: string;
}

/** The variants of the shelf family of roadmap item k21. Each variant has a `fit`, and its base is `shelf`. */
export const SHELF_VARIANTS: readonly BenchEntry[] = Object.freeze([
  { id: "shelf-next", strategy: "shelf", options: { fit: "next", sortOrder: "height-desc" }, base: "shelf" },
  { id: "shelf-first", strategy: "shelf", options: { fit: "first", sortOrder: "height-desc" }, base: "shelf" },
  { id: "shelf-best", strategy: "shelf", options: { fit: "best", sortOrder: "height-desc" }, base: "shelf" },
  { id: "shelf-first-input", strategy: "shelf", options: { fit: "first", sortOrder: "input" }, base: "shelf" },
]);

/**
 * The variants of the skyline family of roadmap item k22. Their base is `skyline`, the rule `bl` without a waste map.
 * The corpora have no turnable items, thus no entry turns.
 */
export const SKYLINE_VARIANTS: readonly BenchEntry[] = Object.freeze([
  { id: "skyline-mw", strategy: "skyline", options: { rule: "mw" }, base: "skyline" },
  { id: "skyline-bl-waste", strategy: "skyline", options: { wasteMap: true }, base: "skyline" },
  { id: "skyline-mw-waste", strategy: "skyline", options: { rule: "mw", wasteMap: true }, base: "skyline" },
]);

/**
 * The entries of the guillotine family of roadmap item k23. The entry `guillotine-baf-sas` has the defaults of `guillotine`.
 * The other entry has no base entry: `guillotine-bssf-sas` is not an entry. The corpora have no turnable items, thus no entry turns.
 */
export const GUILLOTINE_VARIANTS: readonly BenchEntry[] = Object.freeze([
  { id: "guillotine-baf-sas", strategy: "guillotine", options: { choice: "baf", split: "sas" } },
  { id: "guillotine-bssf-sas-merge", strategy: "guillotine", options: { choice: "bssf", split: "sas", merge: true } },
]);

/**
 * The entries of the MaxRects family of roadmap item k24: one entry for each rule. Their base is `maxrects-bl`, because the
 * move of each other rule is a place that is not the place of `bl`.
 */
export const MAXRECTS_VARIANTS: readonly BenchEntry[] = Object.freeze([
  { id: "maxrects-bssf", strategy: "maxrects", options: { rule: "bssf" }, base: "maxrects-bl" },
  { id: "maxrects-blsf", strategy: "maxrects", options: { rule: "blsf" }, base: "maxrects-bl" },
  { id: "maxrects-baf", strategy: "maxrects", options: { rule: "baf" }, base: "maxrects-bl" },
  { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } },
  { id: "maxrects-cp", strategy: "maxrects", options: { rule: "cp" }, base: "maxrects-bl" },
]);

/**
 * The composite entries of roadmap item k20, part 2: the strategy `portfolio` with a set of 2 or 3 members for each cell.
 * Their base is `maxrects-bl`, the best single entry of `pack-screen-v1`. Their activation move is `move.pick`.
 * They are not in the pool of the oracle, the greedy sets, the sole wins and the losers.
 */
export const PORTFOLIO_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "portfolio-k2", strategy: "portfolio", options: { k: 2 }, base: "maxrects-bl" },
  { id: "portfolio-k3", strategy: "portfolio", options: { k: 3 }, base: "maxrects-bl" },
]);

/** The key of the entry `portfolio-area-rows-bl`: the area first after the hard breaks, then the key of `PORTFOLIO_LEVELS`. */
export const AREA_KEY: readonly string[] = Object.freeze(["pack.area", "pack.overflow.excessArea", "pack.fill"]);

/**
 * The composite entries of roadmap item k62. They are not in the pool of the oracle.
 *
 * - `aspect-fit-<entry>`: the strategy `aspect-fit` around an entry. Its base is that entry. Its move is `move.aspectPick`.
 * - `portfolio-area-rows-bl`: the strategy `portfolio` with the members `rows` and `maxrects-bl`, and the key `AREA_KEY`.
 *   Its move is `move.pick`.
 */
export const ASPECT_FIT_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "aspect-fit-maxrects-bl", strategy: "aspect-fit", options: { strategy: "maxrects", options: { rule: "bl" } }, base: "maxrects-bl" },
  { id: "aspect-fit-maxrects-bssf", strategy: "aspect-fit", options: { strategy: "maxrects", options: { rule: "bssf" } }, base: "maxrects-bssf" },
  { id: "aspect-fit-portfolio-k2", strategy: "aspect-fit", options: { strategy: "portfolio", options: { k: 2 } }, base: "portfolio-k2" },
  {
    id: "portfolio-area-rows-bl",
    strategy: "portfolio",
    options: { members: ["rows", { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }], key: AREA_KEY },
    base: "maxrects-bl",
  },
]);

/**
 * The composite entries of roadmap item k66, part 2. They are not in the pool of the oracle.
 *
 * - `select-rows-bl`: the strategy `select` with its defaults. It packs each input with `rows` or `maxrects-bl` by `SELECT_TABLE`.
 *   Its base is `rows`, the default. Its move is `move.select`.
 */
export const SELECT_ENTRIES: readonly BenchEntry[] = Object.freeze([{ id: "select-rows-bl", strategy: "select", options: {}, base: "rows" }]);

/**
 * The composite entries of roadmap item k78. They are not in the pool of the oracle. Each one has 16 restarts, so it costs 16 packs of its member.
 *
 * - `restarts-<entry>-k16`: the strategy `restarts` around an entry, with the change `swap`. Its base is that entry. Its move is `move.restartPick`.
 * - `restarts-maxrects-bl-shuffle-k16`: the same around `maxrects-bl`, with the change `shuffle`.
 */
export const RESTARTS_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "restarts-maxrects-bl-k16", strategy: "restarts", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 16 }, base: "maxrects-bl" },
  { id: "restarts-rows-k16", strategy: "restarts", options: { member: "rows", iterations: 16 }, base: "rows" },
  {
    id: "restarts-maxrects-bl-shuffle-k16",
    strategy: "restarts",
    options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 16, perturb: "shuffle" },
    base: "maxrects-bl",
  },
]);

/**
 * The composite entries of roadmap item k91. They are not in the pool of the oracle. Each one packs the bounding box of each shape with its member.
 * On an input with only `rect` items, each one gives the output of its base.
 */
export const BBOX_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "bbox-maxrects-bl", strategy: "bbox", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } } }, base: "maxrects-bl" },
  { id: "bbox-skyline", strategy: "bbox", options: { member: "skyline" }, base: "skyline" },
]);

/**
 * The composite entries of roadmap item k79. They are not in the pool of the oracle. Each one has 64 iterations of ruin and recreate.
 * Each iteration packs only the removed items again, with its member. The base is that member. The move is `move.ruinRecreate`.
 */
export const RUIN_RECREATE_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "ruin-recreate-maxrects-bl-k64", strategy: "ruin-recreate", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 64 }, base: "maxrects-bl" },
  { id: "ruin-recreate-skyline-k64", strategy: "ruin-recreate", options: { member: "skyline", iterations: 64 }, base: "skyline" },
]);

/**
 * The composite entries of roadmap item k80. They are not in the pool of the oracle. Each one makes the strip of its member shorter.
 * It moves one box at a time to its place of least overlap, with at most 8192 moves. The base is that member. The move is `move.overlapMin`.
 */
export const OVERLAP_MIN_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "overlap-min-maxrects-bl-k8192", strategy: "overlap-min", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 8192 }, base: "maxrects-bl" },
  { id: "overlap-min-skyline-k8192", strategy: "overlap-min", options: { member: "skyline", iterations: 8192 }, base: "skyline" },
]);

/**
 * The composite entries of roadmap item k26: the searches over orders. They are not in the pool of the oracle. Each one has 16 packs of its member.
 * The base is that member. The moves are `move.anneal`, `move.genetic` and `move.tabu`.
 */
export const ORDER_SEARCH_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "anneal-maxrects-bl-k16", strategy: "anneal", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 16 }, base: "maxrects-bl" },
  { id: "anneal-skyline-k16", strategy: "anneal", options: { member: "skyline", iterations: 16 }, base: "skyline" },
  { id: "genetic-maxrects-bl-k16", strategy: "genetic", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 16, population: 4 }, base: "maxrects-bl" },
  { id: "tabu-maxrects-bl-k16", strategy: "tabu", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }, iterations: 16, neighbors: 4 }, base: "maxrects-bl" },
]);

/**
 * The composite entries of roadmap item k124. They are not in the pool of the oracle. Each one spreads the slack of its member
 * evenly over each fixed side, with no overlap. The base is that member. The move is `move.relax`.
 */
export const RELAX_ENTRIES: readonly BenchEntry[] = Object.freeze([
  { id: "relax-rows", strategy: "relax", options: { member: "rows" }, base: "rows" },
  { id: "relax-maxrects-bl", strategy: "relax", options: { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } } }, base: "maxrects-bl" },
  { id: "relax-skyline-bl-waste", strategy: "relax", options: { member: { id: "skyline-bl-waste", strategy: "skyline", options: { wasteMap: true } } }, base: "skyline-bl-waste" },
]);

/** The ids of the composite entries. Each one packs an input with other entries. */
export const COMPOSITE_IDS: ReadonlySet<string> = new Set([...PORTFOLIO_ENTRIES, ...ASPECT_FIT_ENTRIES, ...SELECT_ENTRIES, ...RESTARTS_ENTRIES, ...BBOX_ENTRIES, ...RUIN_RECREATE_ENTRIES, ...OVERLAP_MIN_ENTRIES, ...ORDER_SEARCH_ENTRIES, ...RELAX_ENTRIES].map((e) => e.id));

/** This function tells if an entry id is a composite entry. */
export function isComposite(id: string): boolean {
  return COMPOSITE_IDS.has(id);
}

/** The strategies of the registry with no entry of their own. The variants of each rule replace them. */
const VARIANTS_ONLY: ReadonlySet<string> = new Set(["maxrects", "guillotine"]);

/** The entries of the benchmark: each strategy of the registry, then the variants, then the composite entries. */
export const ENTRIES: readonly BenchEntry[] = Object.freeze([
  ...strategies.filter((s) => !VARIANTS_ONLY.has(s.id)).map((s) => ({ id: s.id, strategy: s.id, options: {} })),
  ...SHELF_VARIANTS,
  ...MAXRECTS_VARIANTS,
  ...SKYLINE_VARIANTS,
  ...GUILLOTINE_VARIANTS,
  ...PORTFOLIO_ENTRIES,
  ...ASPECT_FIT_ENTRIES,
  ...SELECT_ENTRIES,
  ...RESTARTS_ENTRIES,
  ...BBOX_ENTRIES,
  ...RUIN_RECREATE_ENTRIES,
  ...OVERLAP_MIN_ENTRIES,
  ...ORDER_SEARCH_ENTRIES,
  ...RELAX_ENTRIES,
]);

/** This function gives the entry of an id. It throws a `RangeError` for an id that is not an entry. */
export function entry(id: string): BenchEntry {
  const found = ENTRIES.find((e) => e.id === id);
  if (found === undefined) throw new RangeError(`"${id}" is not an entry of the benchmark: ${ENTRIES.map((e) => e.id).join(", ")}.`);
  strategy(found.strategy);
  return found;
}

/** This function gives the base of each entry with a base, by entry id. */
export function basesOf(): Record<string, string> {
  return Object.fromEntries(ENTRIES.flatMap((e) => (e.base === undefined ? [] : [[e.id, e.base]])));
}
