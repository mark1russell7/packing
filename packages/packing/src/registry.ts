import { maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import { aspectFit } from "./aspect-fit.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { portfolioStrategy } from "./portfolio-strategy.ts";
import { createContext, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** Each single strategy of the package. The benchmark starts each one on each input of the corpus. */
export const strategies: readonly Strategy[] = Object.freeze([rows, skyline, shelf, push, maxrects] as Strategy[]);

/** The options of the strategy `aspect-fit` */
export interface AspectFitStrategyOptions {
  /** The id of the wrapped strategy of the registry. The option is necessary. */
  strategy?: string;
  /** The options of the wrapped strategy over its defaults */
  options?: unknown;
  /** The target aspect of `aspectFit`. The default is `aspect` of the container, else 1. */
  targetAspect?: number;
}

/** This function gives the union of the supports of some strategies. */
function unionOf(list: readonly Strategy[]): Supports {
  const out: Record<string, string[]> = {};
  for (const s of list) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const own = (out[dim] ??= []);
      for (const v of values) if (!own.includes(v)) own.push(v);
    }
  }
  return out as unknown as Supports;
}

/**
 * The strategy `aspect-fit`: `aspectFit` of roadmap item k62 around the strategy of the option `strategy`. Its supports are
 * the union of the supports of the single strategies. A cell that the wrapped strategy does not support throws its error.
 * The strategy throws a `RangeError` without the option `strategy`.
 */
export const aspectFitStrategy: Strategy<AspectFitStrategyOptions> = {
  id: "aspect-fit",
  family: "aspect-fit",
  catalog: [],
  supports: unionOf(strategies),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: AspectFitStrategyOptions, context: PackContext): PackOutput {
    if (options.strategy === undefined) throw new RangeError("The strategy aspect-fit needs the option strategy.");
    const inner = strategy(options.strategy);
    const merged: unknown = { ...(inner.defaults as object), ...(options.options as object | undefined) };
    return aspectFit(inner, options.targetAspect === undefined ? {} : { targetAspect: options.targetAspect }).pack(input, merged, context);
  },
};

/**
 * The composite strategies of the registry: each one packs an input with other strategies. They are not in `strategies`.
 * Since 0.2.7, the list has `portfolio` of roadmap item k20. Roadmap item k62 adds `aspect-fit`.
 */
export const composites: readonly Strategy[] = Object.freeze([portfolioStrategy, aspectFitStrategy] as Strategy[]);

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
