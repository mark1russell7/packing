// The entries of the benchmark (`docs/BENCH.md`, "The entries"). An entry is a strategy of the registry with some options.
// Each strategy of the registry is an entry with its defaults. Roadmap item k21 adds the variants of the shelf family.

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

/** The entries of the benchmark: each strategy of the registry, then the variants. */
export const ENTRIES: readonly BenchEntry[] = Object.freeze([
  ...strategies.map((s) => ({ id: s.id, strategy: s.id, options: {} })),
  ...SHELF_VARIANTS,
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
