// The key of a pick over the outputs of one input: the hard breaks, then some measures of `MEASURE_SPECS`, then the hash.
// `packPortfolio` and `aspectFit` use it. The module is internal: the package root exports only `hardBreaks`.

import type { PortfolioKey, SelectLevel } from "@mark1russell7/layout-contract";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { outputHash } from "./layout-input.ts";
import { round3 } from "./layout-input.ts";
import { fillOf, MEASURE_SPECS, measure, roundMeasures, type LayoutMeasures } from "./measures.ts";

/** This function gives the count of the hard breaks of an output: the sum of `checkHard` with `exactContainer`. */
export function hardBreaks(input: PackInput, output: PackOutput): number {
  return Object.values(checkHard(input, output, undefined, { exactContainer: true })).reduce((sum, n) => sum + n, 0);
}

/** This function gives the level of a measure id with its spec of `MEASURE_SPECS`. It throws a `RangeError` for an unknown id. */
export function measureLevel(id: string): SelectLevel {
  const spec = (MEASURE_SPECS as Readonly<Record<string, SelectLevel["spec"] | undefined>>)[id];
  if (spec === undefined || id === "hard") throw new RangeError(`A level of a key is a measure of MEASURE_SPECS, not "${id}".`);
  return { id, spec };
}

/**
 * This function makes the key of a pick: `hardBreaks`, then the measures of `levels` in order, then `outputHash`.
 *
 * - The levels read the measures after `roundMeasures`, as a record keeps them. A replay of the records gives the same pick.
 * - The measures of one output are computed one time.
 * - A key of only `pack.fill` computes the fill alone with `fillOf` (k127). The value and the pick do not change.
 * - `view` gives the input of the measures. The default is the input. The hard breaks always read the input.
 */
export function measureKey(levels: readonly SelectLevel[], view: (input: PackInput) => PackInput = (input) => input): PortfolioKey<PackInput, PackOutput> {
  const cache = new WeakMap<PackOutput, LayoutMeasures>();
  const measured = (input: PackInput, output: PackOutput): LayoutMeasures => {
    let m = cache.get(output);
    if (m === undefined) {
      m = roundMeasures(measure(view(input), output));
      cache.set(output, m);
    }
    return m;
  };
  if (levels.length > 0 && levels.every((level) => level.id === "pack.fill")) {
    return {
      hard: hardBreaks,
      levels: levels.map((level) => ({ id: level.id, spec: level.spec, value: (input: PackInput, output: PackOutput): number => round3(fillOf(view(input), output)) })),
      hash: outputHash,
    };
  }
  return {
    hard: hardBreaks,
    levels: levels.map((level) => ({
      id: level.id,
      spec: level.spec,
      value: (input: PackInput, output: PackOutput): number => (measured(input, output) as unknown as Readonly<Record<string, number>>)[level.id]!,
    })),
    hash: outputHash,
  };
}
