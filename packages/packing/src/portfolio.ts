// The portfolio of roadmap item k20, part 1 (`docs/PACKER.md`, "The portfolio"). A portfolio packs an input with each
// member and keeps the best output by the one pick rule `selectBest` of the contract. Nothing default uses it.

import { pickMoves, portfolio, type Member, type Portfolio, type PortfolioKey, type PortfolioPick, type SelectLevel } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { samePlacements } from "./layout-input.ts";
import { MEASURE_SPECS } from "./measures.ts";
import { packWith, strategy } from "./registry.ts";
import { measureKey, measureLevel } from "./select-key.ts";
import { checkBudgetWork, meterMembers, workMeasures, workMeter, workTrace } from "./work.ts";

export { hardBreaks } from "./select-key.ts";

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
  /**
   * The work limit in work units of `packWork`, a whole number of 0 or more. Without it, each member runs.
   * A cut by the work limit is the same on each computer. With `budgetMs`, the limit that ends first cuts.
   */
  budgetWork?: number;
  /** The largest count of members that run */
  maxMembers?: number;
  /** The clock in milliseconds. The default is `performance.now`. */
  now?: () => number;
  /**
   * The measure ids of the key after the hard breaks, in order. Each id is a measure of `MEASURE_SPECS`. The default is
   * `pack.overflow.excessArea`, then `pack.fill`, as in `PORTFOLIO_LEVELS`.
   */
  key?: readonly string[];
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

/**
 * This function makes an opt-in portfolio of strategies of the registry with `portfolio` of the contract.
 * Its `pick(input)` packs the input with each member and gives the output of the winner, its id and the trace.
 *
 * - A member is a strategy id, or a `PortfolioEntry` with options. The members run in the given order.
 * - `members` is a list, or a function of the input that gives the list. The strategy `portfolio` uses the function form.
 * - The key is the hard breaks, then `pack.overflow.excessArea`, then `pack.fill`. `PORTFOLIO_LEVELS` gives the specs.
 *   The option `key` gives other measures after the hard breaks.
 * - The key reads the measures after `roundMeasures`, as a record keeps them. A replay of the records gives the same pick.
 * - The hash of the key is `outputHash`. `selectBest` of the contract picks the winner.
 * - The output of the winner gets the trace stage `portfolio` with `move.pick` of `pickMoves`.
 * - `pick` hashes the output of each member. `run` does not hash. It compares the base and the winner with `samePlacements` (k130).
 *   Thus `run` gives the output of `pick` at a lower cost.
 * - With `budgetWork`, the stage also has `work.spent`, `work.budget` and `work.stopped`. A member that the work limit cuts has the status `cut`.
 * - The function throws a `RangeError` for a `budgetWork` that is not a whole number of 0 or more.
 * - The function throws a `RangeError` for an unknown strategy, an empty list, two members with the same id and an unknown measure of `key`.
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
  const key = measureKey(options.key === undefined ? PORTFOLIO_LEVELS.slice(1) : options.key.map(measureLevel));
  const limits = {
    ...(options.budgetMs !== undefined ? { budgetMs: options.budgetMs } : {}),
    ...(options.maxMembers !== undefined ? { maxMembers: options.maxMembers } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
  const { budgetWork } = options;
  checkBudgetWork("packPortfolio", budgetWork);
  const id = options.id ?? PORTFOLIO_STAGE;
  // The hash of each member is most of the time of a portfolio (k130). `run` gives only the output, so its key does not hash.
  // With `hashes: "pick"`, the contract gives the key only the base and the winner, when the winner is not member 0.
  // The key keeps these two outputs, and `samePlacements` gives `move.pick` as `pickMoves` gives it from the hashes.
  let seen: PackOutput[] = [];
  const runKey: PortfolioKey<PackInput, PackOutput> = { ...key, hash: (output) => (seen.push(output), "") };
  const moved = (trace: PortfolioPick<PackOutput>["trace"], hashes: "all" | "pick"): number =>
    hashes === "all" ? pickMoves(trace).pick : trace.winnerIndex > 0 && (seen.length < 2 || !samePlacements(seen[0]!, seen[1]!)) ? 1 : 0;
  const keys = { all: key, pick: runKey } as const;
  const inners = { all: portfolio(id, list, key, limits), pick: portfolio(id, list, runKey, { ...limits, hashes: "pick" }) } as const;
  const choose = (input: PackInput, hashes: "all" | "pick"): PortfolioPick<PackOutput> => {
    seen = [];
    if (budgetWork === undefined) {
      const got = inners[hashes].pick(input);
      const stage = { id: PORTFOLIO_STAGE, measures: { "move.pick": moved(got.trace, hashes) } };
      return { ...got, output: { ...got.output, trace: [...(got.output.trace ?? []), stage] } };
    }
    // Each pick gets its own meter. The members of the meter are a function of the input, so the contract checks their ids.
    const meter = workMeter(budgetWork);
    const metered = portfolio(id, (x: PackInput) => meterMembers(typeof list === "function" ? list(x) : list, meter), keys[hashes], { ...limits, hashes });
    const got = metered.pick(input);
    const trace = workTrace(got.trace, meter);
    const stage = { id: PORTFOLIO_STAGE, measures: { "move.pick": moved(trace, hashes), ...workMeasures(meter) } };
    return { ...got, trace, output: { ...got.output, trace: [...(got.output.trace ?? []), stage] } };
  };
  return { id: inners.all.id, pick: (input: PackInput) => choose(input, "all"), run: (input: PackInput): PackOutput => choose(input, "pick").output };
}
