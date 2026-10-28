import { maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { portfolioStrategy } from "./portfolio-strategy.ts";
import { createContext, type Strategy } from "./strategy.ts";

/** Each single strategy of the package. The benchmark starts each one on each input of the corpus. */
export const strategies: readonly Strategy[] = Object.freeze([rows, skyline, shelf, push, maxrects] as Strategy[]);

/**
 * The composite strategies of the registry: each one packs an input with other strategies. They are not in `strategies`.
 * Since 0.2.7, the list has `portfolio` of roadmap item k20.
 */
export const composites: readonly Strategy[] = Object.freeze([portfolioStrategy] as Strategy[]);

/** This function gives the strategy with an id, also a composite strategy. It throws a `RangeError` for an id that the registry does not have. */
export function strategy(id: string): Strategy {
  const found = strategies.find((s) => s.id === id) ?? composites.find((s) => s.id === id);
  if (found === undefined) throw new RangeError(`The registry has no strategy "${id}".`);
  return found;
}

/**
 * This function packs an input with the strategy of an id. The options go over the defaults of the strategy. The
 * context gets `mulberry32` with the seed. The default seed is 0.
 */
export function packWith(id: string, input: PackInput, options?: unknown, seed = 0): PackOutput {
  const s = strategy(id);
  const merged: unknown = { ...(s.defaults as object), ...(options as object | undefined) };
  return s.pack(input, merged, createContext(seed));
}
