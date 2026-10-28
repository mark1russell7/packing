// The portfolio of roadmap item k20, part 1 (`docs/PACKER.md`, "The portfolio"). A portfolio packs an input with each
// member and keeps the best output by the one pick rule `selectBest` of the contract. Nothing default uses it.

import { pickMoves, portfolio, type Member, type Portfolio, type PortfolioKey, type PortfolioPick, type SelectLevel } from "@mark1russell7/layout-contract";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { outputHash } from "./layout-input.ts";
import { MEASURE_SPECS, measure, roundMeasures, type LayoutMeasures } from "./measures.ts";
import { packWith, strategy } from "./registry.ts";

/** A member of `packPortfolio`: a strategy of the registry with some options. The id names the member in the trace. */
export interface PortfolioEntry {
  id: string;
  /** The id of a strategy of the registry */
  strategy: string;
  /** The options of the member over the defaults of the strategy */
  options?: unknown;
}

/** The options of `packPortfolio`. The time limit and the member limit are those of `portfolio` of the contract. */
export interface PackPortfolioOptions {
  /** The id of the portfolio. The default is `portfolio`. */
  id?: string;
  /** The seed of each member. The default is 0, as for `packWith`. */
  seed?: number;
  /** The time limit in milliseconds. Without it, each member runs. A cut member makes the pick not deterministic. */
  budgetMs?: number;
  /** The largest count of members that run */
  maxMembers?: number;
  /** The clock in milliseconds. The default is `performance.now`. */
  now?: () => number;
}

/** The id of the trace stage of `packPortfolio`. Its measure `move.pick` is 1 when the pick is not member 0. */
export const PORTFOLIO_STAGE = "portfolio";

/**
 * The levels of the pick of `packPortfolio` and of the portfolio report of the benchmark, in order. Level 0 is `hard`.
 *
 * - `hard`: the count of hard breaks of `checkHard` with `exactContainer`. Lower is better, with the minimum effect 0.
 * - `pack.overflow.excessArea`: the overflow area above its bound. Lower is better.
 * - `pack.fill`: the fill of the hull. Higher is better.
 */
export const PORTFOLIO_LEVELS: readonly SelectLevel[] = Object.freeze([
  { id: "hard", spec: { direction: "lower", minEffect: 0 } },
  { id: "pack.overflow.excessArea", spec: MEASURE_SPECS["pack.overflow.excessArea"] },
  { id: "pack.fill", spec: MEASURE_SPECS["pack.fill"] },
] as SelectLevel[]);

/** This function gives the count of the hard breaks of an output: the sum of `checkHard` with `exactContainer`. */
export function hardBreaks(input: PackInput, output: PackOutput): number {
  return Object.values(checkHard(input, output, undefined, { exactContainer: true })).reduce((sum, n) => sum + n, 0);
}

/**
 * This function makes an opt-in portfolio of strategies of the registry with `portfolio` of the contract.
 * Its `pick(input)` packs the input with each member and gives the output of the winner, its id and the trace.
 *
 * - A member is a strategy id, or a `PortfolioEntry` with options. The members run in the given order.
 * - `members` is a list, or a function of the input that gives the list. The strategy `portfolio` uses the function form.
 * - The key is the hard breaks, then `pack.overflow.excessArea`, then `pack.fill`. `PORTFOLIO_LEVELS` gives the specs.
 * - The key reads the measures after `roundMeasures`, as a record keeps them. A replay of the records gives the same pick.
 * - The hash of the key is `outputHash`. `selectBest` of the contract picks the winner.
 * - The output of the winner gets the trace stage `portfolio` with `move.pick` of `pickMoves`.
 * - The function throws a `RangeError` for an unknown strategy, an empty list and two members with the same id.
 *   With the function form, `pick` throws this error for the list of an input.
 */
export function packPortfolio(
  members: readonly (string | PortfolioEntry)[] | ((input: PackInput) => readonly (string | PortfolioEntry)[]),
  options: PackPortfolioOptions = {},
): Portfolio<PackInput, PackOutput> {
  const seed = options.seed ?? 0;
  const toMembers = (given: readonly (string | PortfolioEntry)[]): Member<PackInput, PackOutput>[] =>
    given.map((m) => {
      const e = typeof m === "string" ? { id: m, strategy: m } : m;
      strategy(e.strategy);
      return { id: e.id, run: (input: PackInput): PackOutput => packWith(e.strategy, input, e.options, seed) };
    });
  const list = typeof members === "function" ? (input: PackInput): Member<PackInput, PackOutput>[] => toMembers(members(input)) : toMembers(members);
  // Each level reads the measures of one output, so the measures of an output are computed one time
  const cache = new WeakMap<PackOutput, LayoutMeasures>();
  const measured = (input: PackInput, output: PackOutput): LayoutMeasures => {
    let m = cache.get(output);
    if (m === undefined) {
      // The key reads the measures as a record keeps them, so a replay of the records gives the same pick
      m = roundMeasures(measure(input, output));
      cache.set(output, m);
    }
    return m;
  };
  const key: PortfolioKey<PackInput, PackOutput> = {
    hard: hardBreaks,
    levels: PORTFOLIO_LEVELS.slice(1).map((level) => ({
      id: level.id,
      spec: level.spec,
      value: (input: PackInput, output: PackOutput): number => measured(input, output)[level.id as "pack.fill" | "pack.overflow.excessArea"],
    })),
    hash: outputHash,
  };
  const limits = {
    ...(options.budgetMs !== undefined ? { budgetMs: options.budgetMs } : {}),
    ...(options.maxMembers !== undefined ? { maxMembers: options.maxMembers } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
  const inner = portfolio(options.id ?? PORTFOLIO_STAGE, list, key, limits);
  const pick = (input: PackInput): PortfolioPick<PackOutput> => {
    const got = inner.pick(input);
    const stage = { id: PORTFOLIO_STAGE, measures: { "move.pick": pickMoves(got.trace).pick } };
    return { ...got, output: { ...got.output, trace: [...(got.output.trace ?? []), stage] } };
  };
  return { id: inner.id, pick, run: (input: PackInput): PackOutput => pick(input).output };
}
