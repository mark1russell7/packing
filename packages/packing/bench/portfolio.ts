// The portfolio report of roadmap item k20 (`docs/BENCH.md`, "Portfolio"). It reads the records of a run. It does not
// start a packer again. `selectBest` of the contract is the one pick rule, with the levels `PORTFOLIO_LEVELS`.
// Part 2 adds the regrets, the keep rate, the win share at a time limit and the composite entries `portfolio-k2` and `portfolio-k3`.

import { selectBest, type SelectCandidate, type SelectLevel } from "@mark1russell7/layout-contract";
import {
  PORTFOLIO_FRAME_MS,
  PORTFOLIO_LEVELS,
  PORTFOLIO_SETS,
  portfolioDefaultMembers,
  portfolioMembers,
  round3,
  type PackInput,
  type PortfolioCellSets,
  type PortfolioSets,
} from "@mark1russell7/packing";
import { COMPOSITE_IDS, ENTRIES } from "./entries.ts";
import type { ScreenRecord } from "./screen.ts";

/** The default seed of the held-out inputs. The report chooses each set on the other seeds, and it scores each set on this seed. */
export const HELD_OUT_SEED = 3;

/**
 * The held-out split of a run: a seed, or `all`. With `all`, each input is held out. The report then chooses no set: it
 * scores the sets of `PORTFOLIO_SETS`, because they come from the records of another corpus.
 */
export type HeldOut = number | "all";

/** The sizes of the greedy sets after the best single entry */
export const SET_SIZES: readonly number[] = Object.freeze([2, 3]);

/** The key of the cell of all the container shapes */
export const ALL_CELL = "all";

/** The time limits of the column `win share at a limit`, in milliseconds */
export const BUDGETS_MS: readonly number[] = Object.freeze([50, 200, 1000]);

/**
 * The levels of the choice of a set, in order. Each level is a mean over the inputs of the cell.
 *
 * - `hard`, `excessArea` and `fill`: the regrets against the oracle, with the minimum effect of each measure. Lower is better.
 * - `winShare`: higher is better. It breaks a tie of the regrets.
 * - `msMean`: the mean time of the members. Lower is better. It breaks a tie of the win share.
 */
export const CHOICE_LEVELS: readonly SelectLevel[] = Object.freeze([
  { id: "hard", spec: { direction: "lower", minEffect: 0 } },
  { id: "excessArea", spec: { direction: "lower", minEffect: PORTFOLIO_LEVELS[1]!.spec.minEffect } },
  { id: "fill", spec: { direction: "lower", minEffect: PORTFOLIO_LEVELS[2]!.spec.minEffect } },
  { id: "winShare", spec: { direction: "higher", minEffect: 0 } },
  { id: "msMean", spec: { direction: "lower", minEffect: 0 } },
] as SelectLevel[]);

/** The score of a set of entries on some inputs. Each regret is a mean against the oracle. No input gives no regret. */
export interface SetScore {
  inputs: number;
  /** The inputs where the winner of the set is in the last kept list of the oracle */
  wins: number;
  /** The value `wins / inputs`, rounded to 3 decimals. No input gives 0. */
  winShare: number;
  /** The mean of the hard breaks of the winner less those of the oracle */
  hardRegret?: number;
  /** The mean of `pack.overflow.excessArea` of the winner less that of the oracle */
  excessAreaRegret?: number;
  /** The mean of the fill of the oracle less the fill of the winner of the set */
  fillRegret?: number;
  /** The sum of the times of the members on the inputs, in milliseconds */
  ms: number;
  /** The value `ms / inputs` */
  msMean?: number;
  /** The keep rate: `winShare / msMean`, the wins for each input for each millisecond. A mean time of 0 gives no value. */
  keepRate?: number;
  /**
   * The score at each limit: `default`, then each time limit of `BUDGETS_MS`. The limit `default` runs the first
   * `defaultMembers` members. A time limit uses the prefix rule of the contract. A missing member record gives no value.
   */
  limits?: Record<string, LimitScore>;
}

/** The score of a set at one limit. */
export interface LimitScore {
  winShare: number;
  excessAreaRegret: number;
  fillRegret: number;
}

/** A set of entries, in the order of the choice, with its score on the training inputs and on the held-out inputs. */
export interface PortfolioSet {
  members: string[];
  /** The default member count of the set: the largest prefix with a median summed time of `PORTFOLIO_FRAME_MS` or less */
  defaultMembers?: number;
  train: SetScore;
  heldOut: SetScore;
}

/** The oracle on some inputs: the best entry of each input by `selectBest` over all the entries. */
export interface OracleScore {
  inputs: number;
  /** The mean of the fill of the winner */
  fill?: number;
  /** The sum of the times of all the entries on the inputs, in milliseconds */
  ms: number;
}

/** The portfolio report of one cell: a container shape, or all the shapes. */
export interface CellPortfolio {
  /** The held-out split of the run */
  heldOut: HeldOut;
  /** The inputs of the cell with one candidate or more */
  inputs: number;
  trainInputs: number;
  heldOutInputs: number;
  /** The single entries of the cell, in the order of the run. This order breaks each tie of `selectBest`. A composite entry is not in the pool. */
  pool: string[];
  oracle: { train: OracleScore; heldOut: OracleScore };
  /** The origin of the sets: `greedy` on the training inputs, or `table` for the sets of `PORTFOLIO_SETS` */
  sets_from: "greedy" | "table";
  /** The best single entry. It is absent when the cell has no training input and no set of the table. */
  best?: PortfolioSet;
  /** The sets of `SET_SIZES` members. A set is absent when the pool is too small or no set is available. */
  sets: PortfolioSet[];
  /** The composite entries of the run against the oracle, by entry id */
  entries: Record<string, PortfolioSet>;
  /** For each entry, the inputs of all the seeds where the entry is the only one in the last kept list of the oracle */
  soleWins: Record<string, number>;
  /** The entries with no sole win. They stay in the pool. */
  losers: string[];
}

/** The portfolio report of a run, by cell: `all`, then each container shape. */
export type BenchPortfolio = Record<string, CellPortfolio>;

/** The members of a composite entry on one input: the member ids in order and the default member count. */
export interface InputMembers {
  members: readonly string[];
  defaultMembers: number;
}

/** The members of a composite entry on each input: entry id, then input id. */
export type CompositeMembers = ReadonlyMap<string, ReadonlyMap<string, InputMembers>>;

/** The options of the portfolio report. */
export interface PortfolioOptions {
  /** The held-out split. The default is the seed `HELD_OUT_SEED`. */
  heldOut?: HeldOut;
  /** The members of each composite entry on each input. Without it, the composite entries get no win share at a limit. */
  members?: CompositeMembers;
  /** The table of the sets for the split `all`. The default is `PORTFOLIO_SETS`. */
  table?: PortfolioSets;
}

/** One candidate of an input: the values of the levels, the fill and the time. */
export interface Candidate extends SelectCandidate {
  hard: number;
  excess: number;
  fill: number;
  ms: number;
}

/** The facts of one input: its seed, its candidates by entry and its oracle. */
export interface InputFacts {
  seed?: number;
  candidates: Map<string, Candidate>;
  /** The candidates in the order of the pool */
  ordered: Candidate[];
  /** The winner of the oracle */
  oracle: Candidate;
  /** The last kept list of the oracle */
  kept: readonly string[];
}

/** The internal score of a set: the sums before the rounding. */
export interface RawScore {
  inputs: number;
  wins: number;
  hard: number;
  excess: number;
  fill: number;
  ms: number;
  /** The sums at each limit of `LIMITS`, or `undefined` when a member record is missing */
  limits?: RawLimit[];
}

/** The sums of a set at one limit */
export interface RawLimit {
  wins: number;
  excess: number;
  fill: number;
}

/** The limits of the report: `default`, then each time limit of `BUDGETS_MS` */
export const LIMITS: readonly string[] = Object.freeze(["default", ...BUDGETS_MS.map(String)]);

/** This function gives empty sums for each limit of `LIMITS`. */
const emptyLimits = (): RawLimit[] => LIMITS.map(() => ({ wins: 0, excess: 0, fill: 0 }));

/** This function gives the seed of a record: the field `seed`, or the end `/s<seed>` of the input id. */
export function seedOf(record: Pick<ScreenRecord, "input" | "seed">): number | undefined {
  if (record.seed !== undefined) return record.seed;
  const match = /\/s(\d+)$/.exec(record.input);
  return match === null ? undefined : Number(match[1]);
}

/**
 * This function gives the hard breaks of a record with `exactContainer`. The record keeps `in-container` of the bounding
 * box in `hard`, and the count of the true outline in `pack.outsideExact`. The second count replaces the first.
 */
export function hardOf(record: Pick<ScreenRecord, "hard" | "measures">): number {
  const hard = record.hard ?? {};
  const sum = Object.values(hard).reduce((a, b) => a + b, 0);
  const exact = record.measures["pack.outsideExact"];
  return exact === undefined ? sum : sum - (hard["in-container"] ?? 0) + exact;
}

/** This function gives the candidate of a measured record, or `undefined` when the record has no value of a level. */
function candidateOf(r: ScreenRecord): Candidate | undefined {
  const excess = r.measures["pack.overflow.excessArea"];
  const fill = r.measures["pack.fill"];
  if (excess === undefined || fill === undefined) return undefined;
  const hard = hardOf(r);
  return { id: r.strategy, values: { hard, "pack.overflow.excessArea": excess, "pack.fill": fill }, hard, excess, fill, ms: r.ms ?? 0 };
}

/**
 * This function gives the facts of each input of some records: the candidates of the entries of `order`, and the oracle.
 * The oracle of an input is `selectBest` over the candidates in the order of `order`, on the levels `PORTFOLIO_LEVELS`.
 */
export function factsOf(order: readonly string[], records: readonly ScreenRecord[]): Map<string, InputFacts> {
  const rank = new Map(order.map((id, i) => [id, i]));
  const found = new Map<string, { seed?: number; candidates: Map<string, Candidate> }>();
  for (const r of records) {
    if (r.skipped !== undefined || !rank.has(r.strategy)) continue;
    const c = candidateOf(r);
    if (c === undefined) continue;
    let f = found.get(r.input);
    if (f === undefined) {
      f = { candidates: new Map() };
      const seed = seedOf(r);
      if (seed !== undefined) f.seed = seed;
      found.set(r.input, f);
    }
    if (!f.candidates.has(r.strategy)) f.candidates.set(r.strategy, c);
  }
  const out = new Map<string, InputFacts>();
  for (const [input, f] of found) {
    // The candidates in the order of the pool, so each tie goes to the first entry
    const ordered = [...f.candidates.values()].toSorted((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const { winner, kept } = selectBest(ordered, PORTFOLIO_LEVELS);
    const facts: InputFacts = { candidates: f.candidates, ordered, oracle: f.candidates.get(winner)!, kept: kept.at(-1) ?? [winner] };
    if (f.seed !== undefined) facts.seed = f.seed;
    out.set(input, facts);
  }
  return out;
}

/** This function adds the regrets of one winner against the oracle of an input to some sums. A missing winner counts the fill 0 and the excess area 1. */
function addRegret(s: { hard?: number; excess: number; fill: number }, f: InputFacts, w: Candidate | undefined): void {
  if (w === undefined) {
    s.fill += f.oracle.fill;
    s.excess += 1 - f.oracle.excess;
    return;
  }
  if (s.hard !== undefined) s.hard += w.hard - f.oracle.hard;
  s.excess += w.excess - f.oracle.excess;
  s.fill += f.oracle.fill - w.fill;
}

/** This function gives the `selectBest` winner of some candidates, or `undefined` for no candidate. */
function bestOf(cands: readonly Candidate[]): Candidate | undefined {
  if (cands.length === 0) return undefined;
  const { winner } = selectBest(cands, PORTFOLIO_LEVELS);
  return cands.find((c) => c.id === winner);
}

/**
 * This function gives the winner of the members of a set on an input at a time limit, by the prefix rule of the contract.
 * The first member always runs. A later member runs only while the summed times of the members before it are under the limit.
 */
export function prefixWinner(members: readonly (Candidate | undefined)[], budgetMs: number): Candidate | undefined {
  const ran: Candidate[] = [];
  let elapsed = 0;
  for (const [i, c] of members.entries()) {
    if (i > 0 && elapsed >= budgetMs) break;
    if (c === undefined) continue;
    ran.push(c);
    elapsed += c.ms;
  }
  return bestOf(ran);
}

/** This function gives the median of some numbers. No number gives 0. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = values.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** This function gives the median over the inputs of the summed member times of each prefix of a set. A missing record counts 0 ms. */
export function prefixMedianMs(members: readonly string[], inputs: readonly InputFacts[]): number[] {
  return members.map((_, p) => medianOf(inputs.map((f) => members.slice(0, p + 1).reduce((sum, m) => sum + (f.candidates.get(m)?.ms ?? 0), 0))));
}

/** This function gives the default member count of a set: the largest prefix with a median of `frameMs` or less, and 1 at least. */
export function defaultCountOf(medians: readonly number[], frameMs = PORTFOLIO_FRAME_MS): number {
  let count = 1;
  for (const [p, ms] of medians.entries()) if (ms <= frameMs) count = p + 1;
  return count;
}

/** This function adds the winners of one input at each limit of `LIMITS` to the sums. */
function addLimits(limits: RawLimit[], f: InputFacts, own: readonly (Candidate | undefined)[], defaultCount: number): void {
  const winners = [bestOf(own.slice(0, defaultCount).filter((c): c is Candidate => c !== undefined)), ...BUDGETS_MS.map((b) => prefixWinner(own, b))];
  for (const [i, w] of winners.entries()) {
    const l = limits[i]!;
    if (w !== undefined && f.kept.includes(w.id)) l.wins++;
    addRegret(l, f, w);
  }
}

/** This function scores a set of entries on some inputs. A set with no record on an input loses it. `defaultCount` gives the limit `default`. */
export function scoreOf(members: readonly string[], inputs: readonly InputFacts[], defaultCount = members.length): RawScore {
  const s: RawScore = { inputs: inputs.length, wins: 0, hard: 0, excess: 0, fill: 0, ms: 0, limits: emptyLimits() };
  for (const f of inputs) {
    const own = members.map((m) => f.candidates.get(m));
    const cands = own.filter((c): c is Candidate => c !== undefined);
    const w = bestOf(cands);
    if (w !== undefined && f.kept.includes(w.id)) s.wins++;
    addRegret(s, f, w);
    for (const c of cands) s.ms += c.ms;
    addLimits(s.limits!, f, own, defaultCount);
  }
  return s;
}

/**
 * This function scores a composite entry on some inputs from its own records. It wins an input when it stays in the last
 * kept list of `selectBest` over the candidates of the pool and itself. The members of each input give the scores at a limit.
 */
function compositeScoreOf(id: string, own: ReadonlyMap<string, ScreenRecord>, inputs: readonly [string, InputFacts][], members?: ReadonlyMap<string, InputMembers>): RawScore {
  const s: RawScore = { inputs: inputs.length, wins: 0, hard: 0, excess: 0, fill: 0, ms: 0, ...(members === undefined ? {} : { limits: emptyLimits() }) };
  for (const [input, f] of inputs) {
    const r = own.get(input);
    const c = r === undefined || r.skipped !== undefined ? undefined : candidateOf(r);
    if (c === undefined) addRegret(s, f, undefined);
    else {
      const me = { ...c, id };
      const { kept } = selectBest([...f.ordered, me], PORTFOLIO_LEVELS);
      if ((kept.at(-1) ?? []).includes(id)) s.wins++;
      addRegret(s, f, me);
      s.ms += c.ms;
    }
    const list = members?.get(input);
    if (s.limits === undefined) continue;
    if (list === undefined) {
      delete s.limits;
      continue;
    }
    addLimits(
      s.limits,
      f,
      list.members.map((m) => f.candidates.get(m)),
      list.defaultMembers,
    );
  }
  return s;
}

/** This function gives the mean values of a raw score for `CHOICE_LEVELS`. */
const choiceValues = (s: RawScore): Record<string, number> => {
  const n = Math.max(s.inputs, 1);
  return { hard: s.hard / n, excessArea: s.excess / n, fill: s.fill / n, winShare: s.wins / n, msMean: s.ms / n };
};

/**
 * This function chooses greedy sets on some inputs: it adds one entry of the pool at a time, up to `largest` entries.
 * At each step, `selectBest` on `CHOICE_LEVELS` picks the set. A tie goes to the first entry of the pool. No input gives no set.
 */
export function chooseSets(pool: readonly string[], inputs: readonly InputFacts[], largest: number): { members: string[]; score: RawScore }[] {
  const out: { members: string[]; score: RawScore }[] = [];
  const chosen: string[] = [];
  while (inputs.length > 0 && chosen.length < Math.min(largest, pool.length)) {
    const tries = pool.filter((id) => !chosen.includes(id)).map((id) => ({ id, score: scoreOf([...chosen, id], inputs) }));
    const { winner } = selectBest(
      tries.map((t) => ({ id: t.id, values: choiceValues(t.score) })),
      CHOICE_LEVELS,
    );
    chosen.push(winner);
    out.push({ members: [...chosen], score: tries.find((t) => t.id === winner)!.score });
  }
  return out;
}

/** This function rounds a raw score for the report. */
export function scoreText(s: RawScore): SetScore {
  const out: SetScore = { inputs: s.inputs, wins: s.wins, winShare: s.inputs === 0 ? 0 : round3(s.wins / s.inputs), ms: round3(s.ms) };
  if (s.inputs === 0) return out;
  out.hardRegret = round3(s.hard / s.inputs);
  out.excessAreaRegret = round3(s.excess / s.inputs);
  out.fillRegret = round3(s.fill / s.inputs);
  const mean = s.ms / s.inputs;
  out.msMean = round3(mean);
  if (mean > 0) out.keepRate = round3(s.wins / s.inputs / mean);
  if (s.limits !== undefined) {
    const n = s.inputs;
    out.limits = Object.fromEntries(
      LIMITS.map((id, i) => {
        const l = s.limits![i]!;
        return [id, { winShare: round3(l.wins / n), excessAreaRegret: round3(l.excess / n), fillRegret: round3(l.fill / n) }];
      }),
    );
  }
  return out;
}

/** This function gives the oracle score of some inputs. */
function oracleOf(inputs: readonly InputFacts[]): OracleScore {
  const ms = inputs.reduce((sum, f) => sum + [...f.candidates.values()].reduce((a, c) => a + c.ms, 0), 0);
  const out: OracleScore = { inputs: inputs.length, ms: round3(ms) };
  if (inputs.length > 0) out.fill = round3(inputs.reduce((sum, f) => sum + f.oracle.fill, 0) / inputs.length);
  return out;
}

/** The options of the report of one cell. */
export interface CellOptions extends PortfolioOptions {
  /** The ids of the composite entries in the records */
  composites?: readonly string[];
  /** The sets of the table of the cell, for the split `all` */
  tableSets?: PortfolioCellSets;
}

/**
 * This function gives the portfolio report of one cell. `records` holds the measured records of the cell. `order` gives the
 * order of the single entries.
 *
 * - The oracle of an input is `selectBest` over each single entry with a record, on the levels `PORTFOLIO_LEVELS`.
 * - A set wins an input when its own `selectBest` winner is in the last kept list of the oracle.
 * - With a held-out seed, `chooseSets` chooses the sets on the training inputs. With the split `all`, the sets come from `tableSets`.
 * - A sole win is an input where the last kept list of the oracle has exactly one entry.
 * - Each composite entry gets the same scores from its own records.
 */
export function cellPortfolioOf(order: readonly string[], records: readonly ScreenRecord[], options: CellOptions = {}): CellPortfolio {
  const heldOutSplit = options.heldOut ?? HELD_OUT_SEED;
  const composites = options.composites ?? [];
  const singles = order.filter((id) => !composites.includes(id));
  const byInput = factsOf(singles, records);
  const pool = singles.filter((id) => [...byInput.values()].some((f) => f.candidates.has(id)));
  const soleWins: Record<string, number> = Object.fromEntries(pool.map((id) => [id, 0]));
  for (const f of byInput.values()) if (f.kept.length === 1) soleWins[f.kept[0]!]!++;
  const isHeldOut = (f: InputFacts): boolean => heldOutSplit === "all" || f.seed === heldOutSplit;
  const entriesAll = [...byInput.entries()];
  const train = entriesAll.filter(([, f]) => !isHeldOut(f));
  const heldOut = entriesAll.filter(([, f]) => isHeldOut(f));
  const trainFacts = train.map(([, f]) => f);
  const heldOutFacts = heldOut.map(([, f]) => f);

  const sets: PortfolioSet[] = [];
  let best: PortfolioSet | undefined;
  // The default count of a set: from the table for the split `all`, or from the training inputs
  const add = (members: string[], defaultCount: number): void => {
    const set: PortfolioSet = {
      members,
      defaultMembers: defaultCount,
      train: scoreText(scoreOf(members, trainFacts, defaultCount)),
      heldOut: scoreText(scoreOf(members, heldOutFacts, defaultCount)),
    };
    if (members.length === 1) best = set;
    if (SET_SIZES.includes(members.length)) sets.push(set);
  };
  if (heldOutSplit === "all") {
    for (const k of ["1", "2", "3"] as const) {
      const members = options.tableSets?.sets?.[k];
      if (members !== undefined && byInput.size > 0) add([...members], Math.min(members.length, options.tableSets?.defaultMembers ?? members.length));
    }
  } else {
    for (const c of chooseSets(pool, trainFacts, Math.max(1, ...SET_SIZES))) add(c.members, defaultCountOf(prefixMedianMs(c.members, trainFacts)));
  }

  const entries: Record<string, PortfolioSet> = {};
  for (const id of composites) {
    const own = new Map<string, ScreenRecord>();
    for (const r of records) if (r.strategy === id && !own.has(r.input)) own.set(r.input, r);
    if (own.size === 0) continue;
    const members = options.members?.get(id);
    entries[id] = { members: [id], train: scoreText(compositeScoreOf(id, own, train, members)), heldOut: scoreText(compositeScoreOf(id, own, heldOut, members)) };
  }

  const out: CellPortfolio = {
    heldOut: heldOutSplit,
    inputs: byInput.size,
    trainInputs: train.length,
    heldOutInputs: heldOut.length,
    pool,
    oracle: { train: oracleOf(trainFacts), heldOut: oracleOf(heldOutFacts) },
    sets_from: heldOutSplit === "all" ? "table" : "greedy",
    sets,
    entries,
    soleWins,
    losers: pool.filter((id) => soleWins[id] === 0),
  };
  if (best !== undefined) out.best = best;
  return out;
}

/**
 * This function gives the portfolio report of a run: the cell `all`, then each container shape with a measured record.
 * The composite entries of `bench/entries.ts` in `order` are scored, and they are not in the pool.
 */
export function portfolioOf(order: readonly string[], records: readonly ScreenRecord[], shapeOf: (input: string) => string, shapes: readonly string[], options: PortfolioOptions = {}): BenchPortfolio {
  const out: BenchPortfolio = {};
  const table = options.table ?? PORTFOLIO_SETS;
  const composites = order.filter((id) => COMPOSITE_IDS.has(id));
  const measured = records.filter((r) => r.skipped === undefined);
  out[ALL_CELL] = cellPortfolioOf(order, measured, { ...options, composites, tableSets: table.all });
  for (const k of shapes) {
    const own = measured.filter((r) => shapeOf(r.input) === k);
    if (own.length > 0) out[k] = cellPortfolioOf(order, own, { ...options, composites, ...(table.shapes[k] === undefined ? {} : { tableSets: table.shapes[k] }) });
  }
  return out;
}

/**
 * This function gives the members of each composite entry of `ids` on each input, by `portfolioMembers` with the `k` of the entry.
 * An id that is not a composite entry gets no map.
 */
export function compositeMembersOf(ids: readonly string[], inputs: readonly { id: string; input: PackInput }[]): Map<string, Map<string, InputMembers>> {
  const out = new Map<string, Map<string, InputMembers>>();
  for (const id of ids) {
    const e = ENTRIES.find((x) => x.id === id);
    if (e === undefined || !COMPOSITE_IDS.has(id)) continue;
    const k = Number(e.options["k"] ?? 3);
    out.set(id, new Map(inputs.map((x) => [x.id, { members: portfolioMembers(x.input, k).map((m) => m.id), defaultMembers: portfolioDefaultMembers(x.input, k) }])));
  }
  return out;
}

/** This function writes a number for a table, or `-`. */
const num = (v: number | undefined): string => (v === undefined ? "-" : String(round3(v)));

/** This function writes the main columns of a score: the regrets, the wins, the share, the time and the keep rate. */
const scoreCells = (s: SetScore): string => {
  if (s.inputs === 0) return "0 | - | - | - | - | - | - | -";
  return `${s.inputs} | ${num(s.excessAreaRegret)} | ${num(s.fillRegret)} | ${num(s.hardRegret)} | ${s.wins} | ${s.winShare} | ${num(s.msMean)} | ${num(s.keepRate)}`;
};

/** This function writes the columns of a score at each limit of `LIMITS`: the win share, the excess area regret and the fill regret. */
const limitCells = (s: SetScore): string =>
  LIMITS.map((id) => {
    const l = s.limits?.[id];
    return l === undefined ? "-" : `${l.winShare} / ${l.excessAreaRegret} / ${l.fillRegret}`;
  }).join(" | ");

/** This function writes the training columns of a score. */
const trainCells = (s: SetScore): string => (s.inputs === 0 ? "0 | - | - | - | -" : `${s.inputs} | ${num(s.excessAreaRegret)} | ${num(s.fillRegret)} | ${s.winShare} | ${num(s.msMean)}`);

/** This function gives the rows of the sets of a cell: the best single entry, the sets, then the composite entries. */
const rowsOf = (c: CellPortfolio): [string, PortfolioSet | undefined][] => [
  ["best single", c.best],
  ...c.sets.map((s) => [`k = ${s.members.length}`, s] as [string, PortfolioSet]),
  ...Object.entries(c.entries).map(([id, s]) => [`entry ${id}`, s] as [string, PortfolioSet]),
];

/** This function writes the members of a row. */
const membersText = (name: string, s: PortfolioSet): string => (name.startsWith("entry ") ? "the set of each cell" : s.members.map((m) => `\`${m}\``).join(", "));

/** This function writes the section `Portfolio` of `summary.md`. A run without the report gets one line. */
export function portfolioMarkdown(report: BenchPortfolio | undefined): string[] {
  const lines: string[] = ["## Portfolio", ""];
  if (report === undefined) {
    lines.push("The run has no portfolio report. A `run.json` before k20 does not have it.");
    return lines;
  }
  const split = Object.values(report)[0]?.heldOut ?? HELD_OUT_SEED;
  lines.push(
    "The report reads the records. It does not start a packer again. `selectBest` of the contract picks on the levels `hard`, `pack.overflow.excessArea` and `pack.fill`.",
    "The oracle is the best single entry of each input. A set wins an input when its winner is in the last kept list of the oracle.",
    split === "all"
      ? "The held-out split is `all`: each input is held out. The sets come from `PORTFOLIO_SETS`, which another corpus gave."
      : `The report chooses each set on the seeds other than ${split}, by the mean regrets, then the win share. It scores each set on the held-out seed ${split}.`,
    "The main measure is the mean regret against the oracle: the excess area of the winner less that of the oracle, then the fill of the oracle less that of the winner.",
    "The keep rate is the win share divided by the mean time of an input, in milliseconds.",
    "The composite entries `portfolio-k2` and `portfolio-k3` are not in the pool. Their rows use their own records.",
    "",
    "| cell | set | members | held-out inputs | excessArea regret | fill regret | hard regret | wins | win share | ms (mean) | keep rate |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const [cell, c] of Object.entries(report)) {
    const o = c.oracle.heldOut;
    const zero = o.inputs === 0 ? "-" : "0";
    lines.push(`| ${cell} | oracle | all ${c.pool.length} | ${o.inputs} | ${zero} | ${zero} | ${zero} | ${o.inputs} | ${o.inputs === 0 ? "-" : 1} | ${o.inputs === 0 ? "-" : num(o.ms / o.inputs)} | - |`);
    for (const [name, s] of rowsOf(c)) {
      lines.push(s === undefined ? `| ${cell} | ${name} | - | ${c.heldOutInputs} | - | - | - | - | - | - | - |` : `| ${cell} | ${name} | ${membersText(name, s)} | ${scoreCells(s.heldOut)} |`);
    }
  }
  lines.push(
    "",
    `Each value at a limit is the win share, the excessArea regret and the fill regret on the held-out inputs. The limit \`default\` runs the first \`defaultMembers\` members.`,
    `The default count is the largest prefix with a median summed time of ${PORTFOLIO_FRAME_MS} ms or less. A time limit uses the prefix rule of the contract.`,
    "",
    `| cell | set | default members | ${LIMITS.map((id) => (id === "default" ? "default" : `${id} ms`)).join(" | ")} |`,
    `|---|---|---:|${LIMITS.map(() => "---:").join("|")}|`,
  );
  for (const [cell, c] of Object.entries(report)) {
    for (const [name, s] of rowsOf(c)) {
      if (s === undefined) continue;
      lines.push(`| ${cell} | ${name} | ${name.startsWith("entry ") ? "the count of each cell" : num(s.defaultMembers)} | ${limitCells(s.heldOut)} |`);
    }
  }
  lines.push(
    "",
    "The training inputs give the scores of the choice. With the split `all`, no input is a training input.",
    "",
    "| cell | set | training inputs | excessArea regret | fill regret | win share | ms (mean) |",
    "|---|---|---:|---:|---:|---:|---:|",
  );
  for (const [cell, c] of Object.entries(report)) {
    for (const [name, s] of rowsOf(c)) lines.push(`| ${cell} | ${name} | ${s === undefined ? `${c.trainInputs} | - | - | - | -` : trainCells(s.train)} |`);
  }
  lines.push(
    "",
    "A sole win is an input of any seed where exactly one entry is in the last kept list of the oracle. A loser has no sole win. It stays in the pool.",
    "",
    "| cell | inputs | sole wins | losers |",
    "|---|---:|---|---|",
  );
  for (const [cell, c] of Object.entries(report)) {
    const wins = Object.entries(c.soleWins)
      .filter(([, n]) => n > 0)
      .toSorted((a, b) => b[1] - a[1])
      .map(([id, n]) => `\`${id}\` ${n}`);
    lines.push(`| ${cell} | ${c.inputs} | ${wins.length === 0 ? "none" : wins.join(", ")} | ${c.losers.length === 0 ? "none" : c.losers.map((id) => `\`${id}\``).join(", ")} |`);
  }
  return lines;
}
