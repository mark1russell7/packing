// The strategy `portfolio` of roadmap item k20, part 2 (`docs/PACKER.md`, "The per-cell portfolio"). It is a composite
// strategy: it packs an input with the members of the set of its cell, and it keeps the best output. Nothing default uses it.

import { maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { portfolioDefaultMembers, portfolioMembers } from "./portfolio-cell.ts";
import { PORTFOLIO_SETS } from "./portfolio-sets.ts";
import { packPortfolio } from "./portfolio.ts";
import type { PackContext, Strategy, Supports } from "./strategy.ts";

/** The options of the strategy `portfolio`. Without options, the output is a function of the input only. */
export interface PortfolioStrategyOptions {
  /** The size of the set of the cell: 2 or 3. With `k`, each of the `k` members runs. Without `k`, the strategy uses the set of 3. */
  k?: 2 | 3;
  /** The largest count of the members that run. Without `k` and `maxMembers`, the count is `defaultMembers` of the cell. */
  maxMembers?: number;
  /** The opt-in time limit of `portfolio` of the contract, in milliseconds. It has no default. A cut member makes the result not deterministic. */
  budgetMs?: number;
}

/** The single strategies that the members of the table use */
const SINGLES: readonly Strategy[] = [rows, skyline, shelf, push, maxrects] as Strategy[];

/** This function gives the union of the supports of the strategies of the members of the table. */
function unionSupports(): Supports {
  const used = new Set(Object.values(PORTFOLIO_SETS.entries).map((e) => e.strategy));
  const out: Record<string, string[]> = {};
  for (const s of SINGLES.filter((x) => used.has(x.id))) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  return out as unknown as Supports;
}

/**
 * The strategy `portfolio`: `packPortfolio` with the function form `(input) => portfolioMembers(input, k)`. The seed of the context
 * goes to each member. Its supports are the union of the supports of the members.
 *
 * - Without `k` and `maxMembers`, the members are the set of 3 of the cell, and `maxMembers` is `defaultMembers` of the cell.
 *   The default output thus does not depend on the clock.
 * - A member that does not support the cell of an input throws, and it does not win. When each member throws, the strategy throws the first error.
 * - The option `budgetMs` goes to `portfolio` of the contract. The first member always runs.
 * - The strategy throws a `RangeError` for a `k` other than 2 or 3.
 */
export const portfolioStrategy: Strategy<PortfolioStrategyOptions> = {
  id: "portfolio",
  family: "portfolio",
  catalog: [],
  supports: unionSupports(),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: PortfolioStrategyOptions, context: PackContext): PackOutput {
    const { k, maxMembers, budgetMs } = options;
    if (k !== undefined && k !== 2 && k !== 3) throw new RangeError(`The option k of the strategy portfolio is 2 or 3, not ${String(k)}.`);
    const size = k ?? 3;
    const count = maxMembers ?? (k === undefined ? portfolioDefaultMembers(input) : undefined);
    const limits = { ...(count === undefined ? {} : { maxMembers: count }), ...(budgetMs === undefined ? {} : { budgetMs }) };
    return packPortfolio((x: PackInput) => portfolioMembers(x, size), { id: k === undefined ? "portfolio" : `portfolio-k${k}`, seed: context.seed, ...limits }).run(input);
  },
};
