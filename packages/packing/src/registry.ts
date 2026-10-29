import { guillotine, maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import { aspectFit } from "./aspect-fit.ts";
import { bboxStrategy } from "./bbox.ts";
import { holeDegree } from "./hole-degree.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { portfolioStrategy } from "./portfolio-strategy.ts";
import { overlapMinStrategy } from "./overlap-min.ts";
import { restartsStrategy } from "./restarts.ts";
import { ruinRecreateStrategy } from "./ruin-recreate.ts";
import { selectStrategy } from "./select.ts";
import { createContext, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** Each single strategy of the package. The benchmark starts each one on each input of the corpus. */
export const strategies: readonly Strategy[] = Object.freeze([rows, skyline, shelf, push, maxrects, guillotine] as Strategy[]);

/**
 * The single strategies of one shape kind that is not `rect`. Roadmap item k90 adds `hole-degree` for circles.
 * Each corpus of the benchmark has only `rect` items. Thus these strategies are not in `strategies`, and the benchmark does not start them.
 */
export const shapeStrategies: readonly Strategy[] = Object.freeze([holeDegree] as Strategy[]);

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
 * Since 0.2.7, the list has `portfolio` of roadmap item k20. Roadmap item k62 adds `aspect-fit`, and roadmap item k66 adds `select`.
 * Roadmap item k78 adds `restarts`, roadmap item k91 adds `bbox`, and roadmap item k79 adds `ruin-recreate`.
 * Roadmap item k80 adds `overlap-min`.
 */
export const composites: readonly Strategy[] = Object.freeze([portfolioStrategy, aspectFitStrategy, selectStrategy, restartsStrategy, bboxStrategy, ruinRecreateStrategy, overlapMinStrategy] as Strategy[]);

/**
 * This function gives the strategy with an id, also a strategy of `shapeStrategies` and a composite strategy.
 * It throws a `RangeError` for an id that the registry does not have.
 */
export function strategy(id: string): Strategy {
  const found = strategies.find((s) => s.id === id) ?? shapeStrategies.find((s) => s.id === id) ?? composites.find((s) => s.id === id);
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

/**
 * The id of the default strategy of an input: `select`. It passed two fresh-seed confirmations against `rows` (roadmap
 * item k66). `pack` does not read it.
 */
export const DEFAULT_STRATEGY = "select";

/** This function packs an input with `DEFAULT_STRATEGY` and its defaults. The default seed is 0. */
export function packDefault(input: PackInput, seed = 0): PackOutput {
  return packWith(DEFAULT_STRATEGY, input, undefined, seed);
}
