// The adapters of 0.1 (docs/PACKER.md): each function of 0.1 runs behind the Packer interface as a strategy.
// Since roadmap item k132, each strategy has its own module. This module gathers them and the size search `log-sweep`.

import type { PackInput, PackOutput } from "./contract.ts";
import { sweepSearch } from "./layout-strategy.ts";
import { placeLayout } from "./pack.ts";
import type { PackContext, SizeSearch, Strategy } from "./strategy.ts";

export { guillotine } from "./guillotine-strategy.ts";
export type { GuillotineStrategyOptions, LayoutStrategyOptions, MaxRectsStrategyOptions, SkylineStrategyOptions } from "./layout-strategy.ts";
export { maxrects } from "./maxrects-strategy.ts";
export { push, type PushStrategyOptions } from "./push-strategy.ts";
export { rows } from "./rows-strategy.ts";
export { shelf } from "./shelf-strategy.ts";
export { skyline } from "./skyline-strategy.ts";

/**
 * The size search `log-sweep` uses `packFree` of 0.1.2: widths on a log scale, then the widths near the best width. It
 * wraps `rows`, `skyline`, `shelf`, `maxrects` and `guillotine`. The objective is the area of the frame times `1 + aspectWeight * aspectError`.
 */
export const logSweep: SizeSearch = {
  id: "log-sweep",
  search(input: PackInput, inner: Strategy, context: PackContext, options?: unknown): PackOutput {
    return sweepSearch(input, inner, context, options, placeLayout);
  },
};
