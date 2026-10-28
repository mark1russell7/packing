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

/** The ids of the composite entries. Each one packs an input with other entries. */
export const COMPOSITE_IDS: ReadonlySet<string> = new Set([...PORTFOLIO_ENTRIES, ...ASPECT_FIT_ENTRIES, ...SELECT_ENTRIES, ...RESTARTS_ENTRIES, ...BBOX_ENTRIES].map((e) => e.id));

/** This function tells if an entry id is a composite entry. */
export function isComposite(id: string): boolean {
  return COMPOSITE_IDS.has(id);
}

/** The strategies of the registry with no entry of their own. The variants of each rule replace them. */
const VARIANTS_ONLY: ReadonlySet<string> = new Set(["maxrects"]);

/** The entries of the benchmark: each strategy of the registry, then the variants, then the composite entries. */
export const ENTRIES: readonly BenchEntry[] = Object.freeze([
  ...strategies.filter((s) => !VARIANTS_ONLY.has(s.id)).map((s) => ({ id: s.id, strategy: s.id, options: {} })),
  ...SHELF_VARIANTS,
  ...MAXRECTS_VARIANTS,
  ...PORTFOLIO_ENTRIES,
  ...ASPECT_FIT_ENTRIES,
  ...SELECT_ENTRIES,
  ...RESTARTS_ENTRIES,
  ...BBOX_ENTRIES,
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
