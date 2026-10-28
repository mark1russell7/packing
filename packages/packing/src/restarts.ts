// The strategy `restarts` of roadmap item k78 (`docs/PACKER.md`, "The random restarts"). It packs an input with one member
// in the order of the member, then in some random changes of that order, and it keeps the best output. Nothing default uses it.

import { pickMoves, portfolio, stepRandom, type Member } from "@mark1russell7/layout-contract";
import { maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import { marginOf, type Item, type PackInput, type PackOutput } from "./contract.ts";
import { byRank } from "./frame.ts";
import type { SortOrder } from "./order.ts";
import { PORTFOLIO_LEVELS, type PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { measureKey, measureLevel } from "./select-key.ts";
import type { PackContext, Strategy, Supports } from "./strategy.ts";

/**
 * A change of the order of `restarts`.
 *
 * - `swap`: some random swaps of two adjacent items. The count is `ceil(strength * n / 2)`, at least 1.
 * - `shuffle-blocks`: a random order in each block of near-equal keys. The keys of a block differ by `strength` of the first key or less.
 * - `shuffle`: a full random order. The strategy does not read `strength`.
 */
export type RestartPerturb = "swap" | "shuffle-blocks" | "shuffle";

/** This constant lists each change of the order of `restarts`. The first one is the default. */
export const RESTART_PERTURBS: readonly RestartPerturb[] = Object.freeze(["swap", "shuffle-blocks", "shuffle"] as RestartPerturb[]);

/** The id of the trace stage of `restarts`. Its measure `move.restartPick` is 1 when the pick is not restart 0 and has another hash. */
export const RESTARTS_STAGE = "restarts";

/** The options of the strategy `restarts` */
export interface RestartsStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the restarts, restart 0 included. A whole number of 1 or more. The default is 16. */
  iterations?: number;
  /** The change of the order of each restart after restart 0. The default is `swap`. */
  perturb?: RestartPerturb;
  /** The share of the positions that move, from 0 to 1. The default is 0.1. */
  strength?: number;
  /** The measure ids of the key after the hard breaks, as the option `key` of `packPortfolio`. The default is the key of `PORTFOLIO_LEVELS`. */
  key?: readonly string[];
  /** The value `true` sets the time limit `budgetMs`. The default is `false`, and then each restart starts. */
  limitTime?: boolean;
  /** The time limit in milliseconds, with `limitTime` only. Restart 0 always starts. A cut restart makes the result not deterministic. */
  budgetMs?: number;
}

/** The default member of `restarts`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** This function gives the union of the supports of the single strategies. */
function unionSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, push, maxrects] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  return out as unknown as Supports;
}

/** One item of the order of a member, with the compare key of its sort order */
interface Keyed {
  item: Item;
  key: number;
}

/**
 * This function gives the items in the order of the member: the rank order, then a stable sort by the sort order.
 * The sizes are the sizes of the frame: the margins and the gap are in them. A fixed height turns the axes.
 */
function memberOrder(input: PackInput, order: SortOrder): Keyed[] {
  const half = (input.gap ?? 0) / 2;
  const turned = input.container.fixed === "height";
  const keyed = byRank(input.items).map((item): Keyed => {
    const m = marginOf(item);
    const w = item.w + m.left + m.right + 2 * half;
    const h = item.h + m.top + m.bottom + 2 * half;
    const [x, y] = turned ? [h, w] : [w, h];
    const key = order === "height-desc" || order === "height-asc" ? y : order === "width-desc" ? x : order === "area-desc" ? x * y : 0;
    return { item, key };
  });
  const down = order === "height-asc" ? 1 : -1;
  return order === "input" ? keyed : keyed.toSorted((a, b) => down * (a.key - b.key));
}

/** This function puts the items from `from` to `to` (not included) in a random order: the Fisher-Yates shuffle. */
function shuffleRange<T>(list: T[], from: number, to: number, r: () => number): void {
  for (let i = to - 1; i > from; i--) {
    const j = from + Math.floor(r() * (i - from + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}

/** This function gives a changed copy of an order. `strength` is the share of the positions that move. */
function perturbOrder(order: readonly Keyed[], perturb: RestartPerturb, strength: number, r: () => number): Keyed[] {
  const out = [...order];
  const n = out.length;
  if (n < 2) return out;
  if (perturb === "shuffle") shuffleRange(out, 0, n, r);
  else if (perturb === "swap") {
    const count = Math.max(1, Math.ceil((strength * n) / 2));
    for (let c = 0; c < count; c++) {
      const i = Math.floor(r() * (n - 1));
      [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
    }
  } else {
    let start = 0;
    for (let i = 1; i <= n; i++) {
      const first = out[start]!.key;
      if (i < n && Math.abs(out[i]!.key - first) <= strength * Math.abs(first)) continue;
      shuffleRange(out, start, i, r);
      start = i;
    }
  }
  return out;
}

/** This function gives an input with the items in a given order and with no rank. The ids and the other fields stay. */
function inOrder(input: PackInput, order: readonly Keyed[]): PackInput {
  return { ...input, items: order.map(({ item }) => (item.rank === undefined ? item : (({ rank: _rank, ...rest }) => rest)(item))) };
}

/** This function puts the placements and the overflow of an output in the rank order of the input. */
function rankSorted(output: PackOutput, index: ReadonlyMap<string, number>): PackOutput {
  const at = (id: string): number => index.get(id) ?? Number.MAX_SAFE_INTEGER;
  return { ...output, placements: output.placements.toSorted((a, b) => at(a.id) - at(b.id)), overflow: output.overflow.toSorted((a, b) => at(a) - at(b)) };
}

/** This function checks the options of `restarts`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function checked(options: RestartsStrategyOptions): { member: PortfolioEntry; sortOrder: SortOrder } {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  const defaults = strategy(member.strategy).defaults as Record<string, unknown>;
  if (!("sortOrder" in defaults)) throw new RangeError(`The member of restarts is a strategy with the option sortOrder, not "${member.strategy}".`);
  const { iterations, perturb, strength, limitTime, budgetMs } = options;
  if (iterations !== undefined && !(Number.isInteger(iterations) && iterations >= 1)) throw new RangeError(`The option iterations of restarts is a whole number of 1 or more, not ${String(iterations)}.`);
  if (perturb !== undefined && !RESTART_PERTURBS.includes(perturb)) throw new RangeError(`The option perturb of restarts is one of ${RESTART_PERTURBS.join(", ")}, not ${String(perturb)}.`);
  if (strength !== undefined && !(strength >= 0 && strength <= 1)) throw new RangeError(`The option strength of restarts is a number from 0 to 1, not ${String(strength)}.`);
  if (limitTime === true && budgetMs === undefined) throw new RangeError("The option limitTime of restarts needs the option budgetMs.");
  const sortOrder = ({ ...defaults, ...(member.options as object | undefined) } as { sortOrder: SortOrder }).sortOrder;
  return { member, sortOrder };
}

/**
 * The strategy `restarts`: random restarts around one member (catalog row `search-random-restart`, Yang 2013).
 *
 * - Restart 0 is the member with its options. Each later restart packs the items in a changed order of the member, with the sort order `input`.
 * - The order of the member is the rank order, then a stable sort by its `sortOrder`. The changed copy of the input has no rank.
 * - Restart `i` gets the random numbers `stepRandom(seed, "restarts:<i>")` of the contract. The seed of the context goes to each restart.
 * - The key is the hard breaks, then `PORTFOLIO_LEVELS` or the option `key`, then `outputHash`. A tie keeps the earlier restart.
 * - The output gets the trace stage `restarts` with `move.restartPick`, `restarts.run` (the index of the pick) and `restarts.runs`.
 * - The strategy throws a `RangeError` for a member without the option `sortOrder` and for a bad option.
 */
export const restartsStrategy: Strategy<RestartsStrategyOptions> = {
  id: "restarts",
  family: "restarts",
  catalog: ["search-random-restart"],
  supports: unionSupports(),
  defaults: { iterations: 16, perturb: "swap", strength: 0.1, limitTime: false },
  deterministic: true,
  pack(input: PackInput, options: RestartsStrategyOptions, context: PackContext): PackOutput {
    const { member, sortOrder } = checked(options);
    const iterations = options.iterations ?? 16;
    const perturb = options.perturb ?? "swap";
    const strength = options.strength ?? 0.1;
    const seed = context.seed;
    const base = memberOrder(input, sortOrder);
    const index = new Map(byRank(input.items).map((item, i) => [item.id, i]));
    const runOf = (i: number): Member<PackInput, PackOutput> => ({
      id: i === 0 ? member.id : `${member.id}#${i}`,
      run: (x: PackInput): PackOutput => {
        if (i === 0) return packWith(member.strategy, x, member.options, seed);
        const order = perturbOrder(base, perturb, strength, stepRandom(seed, `restarts:${i}`));
        return rankSorted(packWith(member.strategy, inOrder(x, order), { ...(member.options as object | undefined), sortOrder: "input" }, seed), index);
      },
    });
    const members = Array.from({ length: iterations }, (_, i) => runOf(i));
    const key = measureKey(options.key === undefined ? PORTFOLIO_LEVELS.slice(1) : options.key.map(measureLevel));
    const limits = options.limitTime === true && options.budgetMs !== undefined ? { budgetMs: options.budgetMs } : {};
    const got = portfolio(RESTARTS_STAGE, members, key, limits).pick(input);
    const runs = got.trace.members.filter((m) => m.status !== "cut").length;
    const measures = { "move.restartPick": pickMoves(got.trace).pick, "restarts.run": got.trace.winnerIndex, "restarts.runs": runs };
    return { ...got.output, trace: [...(got.output.trace ?? []), { id: RESTARTS_STAGE, measures }] };
  },
};
