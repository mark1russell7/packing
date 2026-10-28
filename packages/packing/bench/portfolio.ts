// The portfolio report of roadmap item k20, part 1 (`docs/BENCH.md`, "Portfolio"). It reads the records of a
// run. It does not start a packer again. `selectBest` of the contract is the one pick rule, with the levels `PORTFOLIO_LEVELS`.

import { selectBest, type SelectCandidate } from "@mark1russell7/layout-contract";
import { PORTFOLIO_LEVELS, round3 } from "@mark1russell7/packing";
import type { ScreenRecord } from "./screen.ts";

/** The seed of the held-out inputs. The report chooses each set on the other seeds, and it scores each set on this seed. */
export const HELD_OUT_SEED = 3;

/** The sizes of the greedy sets after the best single entry */
export const SET_SIZES: readonly number[] = Object.freeze([2, 3]);

/** The key of the cell of all the container shapes */
export const ALL_CELL = "all";

/** The score of a set of entries on some inputs. */
export interface SetScore {
  inputs: number;
  /** The inputs where the winner of the set is in the last kept list of the oracle */
  wins: number;
  /** The value `wins / inputs`, rounded to 3 decimals. No input gives 0. */
  winShare: number;
  /** The mean of the fill of the oracle less the fill of the winner of the set. No input gives no value. */
  fillRegret?: number;
  /** The sum of the times of the members on the inputs, in milliseconds */
  ms: number;
}

/** A set of entries, in the order of the choice, with its score on the training seeds and on the held-out seed. */
export interface PortfolioSet {
  members: string[];
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
  /** The inputs of the cell with one candidate or more */
  inputs: number;
  trainInputs: number;
  heldOutInputs: number;
  /** The entries of the cell, in the order of the run. This order breaks each tie of `selectBest`. */
  pool: string[];
  oracle: { train: OracleScore; heldOut: OracleScore };
  /** The best single entry, chosen on the training seeds. It is absent when the cell has no training input. */
  best?: PortfolioSet;
  /** The greedy sets of `SET_SIZES` members. A set is absent when the pool is too small or no training input exists. */
  sets: PortfolioSet[];
  /** For each entry, the inputs of all the seeds where the entry is the only one in the last kept list of the oracle */
  soleWins: Record<string, number>;
  /** The entries with no sole win. They stay in the pool. */
  losers: string[];
}

/** The portfolio report of a run, by cell: `all`, then each container shape. */
export type BenchPortfolio = Record<string, CellPortfolio>;

/** One candidate of an input: the values of the levels, the fill and the time. */
interface Candidate extends SelectCandidate {
  fill: number;
  ms: number;
}

/** The facts of one input: its seed, its candidates by entry and its oracle. */
interface InputFacts {
  seed?: number;
  candidates: Map<string, Candidate>;
  /** The fill of the winner of the oracle */
  oracleFill: number;
  /** The last kept list of the oracle */
  kept: readonly string[];
}

/** The internal score of a set, with the sum of the regret before the rounding. A tie of the choice reads the sum. */
interface RawScore {
  inputs: number;
  wins: number;
  regret: number;
  ms: number;
}

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
  return { id: r.strategy, values: { hard: hardOf(r), "pack.overflow.excessArea": excess, "pack.fill": fill }, fill, ms: r.ms ?? 0 };
}

/** This function scores a set of entries on some inputs. A set with no record on an input loses it, and its fill counts as 0. */
function scoreOf(members: readonly string[], inputs: readonly InputFacts[]): RawScore {
  let wins = 0;
  let regret = 0;
  let ms = 0;
  for (const f of inputs) {
    const cands = members.flatMap((m) => {
      const c = f.candidates.get(m);
      return c === undefined ? [] : [c];
    });
    if (cands.length === 0) {
      regret += f.oracleFill;
      continue;
    }
    const { winner } = selectBest(cands, PORTFOLIO_LEVELS);
    if (f.kept.includes(winner)) wins++;
    regret += f.oracleFill - cands.find((c) => c.id === winner)!.fill;
    for (const c of cands) ms += c.ms;
  }
  return { inputs: inputs.length, wins, regret, ms };
}

/** This function rounds a raw score for the report. */
function scoreText(s: RawScore): SetScore {
  const out: SetScore = { inputs: s.inputs, wins: s.wins, winShare: s.inputs === 0 ? 0 : round3(s.wins / s.inputs), ms: round3(s.ms) };
  if (s.inputs > 0) out.fillRegret = round3(s.regret / s.inputs);
  return out;
}

/** This function tells if the score `a` is better than the score `b`: more wins, then a lower sum of the regret. */
const better = (a: RawScore, b: RawScore): boolean => a.wins > b.wins || (a.wins === b.wins && a.regret < b.regret);

/** This function gives the oracle score of some inputs. */
function oracleOf(inputs: readonly InputFacts[]): OracleScore {
  const ms = inputs.reduce((sum, f) => sum + [...f.candidates.values()].reduce((a, c) => a + c.ms, 0), 0);
  const out: OracleScore = { inputs: inputs.length, ms: round3(ms) };
  if (inputs.length > 0) out.fill = round3(inputs.reduce((sum, f) => sum + f.oracleFill, 0) / inputs.length);
  return out;
}

/**
 * This function gives the portfolio report of one cell. `records` holds the measured records of the cell. `pool` gives the
 * order of the entries.
 *
 * - The oracle of an input is `selectBest` over each entry with a record, on the levels `PORTFOLIO_LEVELS`.
 * - A set wins an input when its own `selectBest` winner is in the last kept list of the oracle.
 * - The greedy choice adds one entry at a time on the training seeds: the most wins, then the lowest mean fill regret.
 * - A tie of the choice goes to the first entry of the pool.
 * - A sole win is an input where the last kept list of the oracle has exactly one entry.
 */
export function cellPortfolioOf(order: readonly string[], records: readonly ScreenRecord[]): CellPortfolio {
  const byInput = new Map<string, InputFacts>();
  const rank = new Map(order.map((id, i) => [id, i]));
  for (const r of records) {
    if (r.skipped !== undefined || !rank.has(r.strategy)) continue;
    const c = candidateOf(r);
    if (c === undefined) continue;
    let f = byInput.get(r.input);
    if (f === undefined) {
      f = { candidates: new Map(), oracleFill: 0, kept: [] };
      const seed = seedOf(r);
      if (seed !== undefined) f.seed = seed;
      byInput.set(r.input, f);
    }
    if (!f.candidates.has(r.strategy)) f.candidates.set(r.strategy, c);
  }
  const pool = order.filter((id) => [...byInput.values()].some((f) => f.candidates.has(id)));
  const soleWins: Record<string, number> = Object.fromEntries(pool.map((id) => [id, 0]));
  for (const f of byInput.values()) {
    // The candidates in the order of the pool, so each tie goes to the first entry
    const cands = [...f.candidates.values()].toSorted((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const { winner, kept } = selectBest(cands, PORTFOLIO_LEVELS);
    f.oracleFill = f.candidates.get(winner)!.fill;
    f.kept = kept.at(-1) ?? [winner];
    if (f.kept.length === 1) soleWins[f.kept[0]!]!++;
  }
  const all = [...byInput.values()];
  const train = all.filter((f) => f.seed !== HELD_OUT_SEED);
  const heldOut = all.filter((f) => f.seed === HELD_OUT_SEED);

  // The greedy choice on the training seeds
  const chosen: string[] = [];
  const sets: PortfolioSet[] = [];
  let best: PortfolioSet | undefined;
  const largest = Math.max(1, ...SET_SIZES);
  while (train.length > 0 && chosen.length < Math.min(largest, pool.length)) {
    let pick: { id: string; score: RawScore } | undefined;
    for (const id of pool) {
      if (chosen.includes(id)) continue;
      const score = scoreOf([...chosen, id], train);
      if (pick === undefined || better(score, pick.score)) pick = { id, score };
    }
    chosen.push(pick!.id);
    const set: PortfolioSet = { members: [...chosen], train: scoreText(pick!.score), heldOut: scoreText(scoreOf(chosen, heldOut)) };
    if (chosen.length === 1) best = set;
    if (SET_SIZES.includes(chosen.length)) sets.push(set);
  }

  const out: CellPortfolio = {
    inputs: all.length,
    trainInputs: train.length,
    heldOutInputs: heldOut.length,
    pool,
    oracle: { train: oracleOf(train), heldOut: oracleOf(heldOut) },
    sets,
    soleWins,
    losers: pool.filter((id) => soleWins[id] === 0),
  };
  if (best !== undefined) out.best = best;
  return out;
}

/** This function gives the portfolio report of a run: the cell `all`, then each container shape with a measured record. */
export function portfolioOf(order: readonly string[], records: readonly ScreenRecord[], shapeOf: (input: string) => string, shapes: readonly string[]): BenchPortfolio {
  const out: BenchPortfolio = {};
  const measured = records.filter((r) => r.skipped === undefined);
  out[ALL_CELL] = cellPortfolioOf(order, measured);
  for (const k of shapes) {
    const own = measured.filter((r) => shapeOf(r.input) === k);
    if (own.length > 0) out[k] = cellPortfolioOf(order, own);
  }
  return out;
}

/** This function writes a number for a table, or `-`. */
const num = (v: number | undefined): string => (v === undefined ? "-" : String(round3(v)));

/** This function writes the score of a set: the wins, the share, the regret and the time. A score with no input gives `-`. */
const scoreCells = (s: SetScore): string => (s.inputs === 0 ? "0 | - | - | - | -" : `${s.inputs} | ${s.wins} | ${s.winShare} | ${num(s.fillRegret)} | ${num(s.ms)}`);

/** This function writes the section `Portfolio` of `summary.md`. A run without the report gets one line. */
export function portfolioMarkdown(report: BenchPortfolio | undefined): string[] {
  const lines: string[] = ["## Portfolio", ""];
  if (report === undefined) {
    lines.push("The run has no portfolio report. A `run.json` before k20 does not have it.");
    return lines;
  }
  lines.push(
    "The report reads the records. It does not start a packer again. `selectBest` of the contract picks on the levels `hard`, `pack.overflow.excessArea` and `pack.fill`.",
    "The oracle is the best entry of each input. A set wins an input when its winner is in the last kept list of the oracle.",
    `The report chooses each set on the seeds other than ${HELD_OUT_SEED}. It scores each set on the held-out seed ${HELD_OUT_SEED}.`,
    "The fill regret is the fill of the oracle less the fill of the winner of the set. The time is the sum of the members.",
    "",
    "| cell | set | members | held-out inputs | wins | win share | fill regret (mean) | ms (sum) | training inputs | training wins | training win share | training fill regret | training ms |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const [cell, c] of Object.entries(report)) {
    const o = c.oracle;
    lines.push(
      `| ${cell} | oracle | all ${c.pool.length} | ${o.heldOut.inputs} | ${o.heldOut.inputs} | ${o.heldOut.inputs === 0 ? "-" : 1} | ${o.heldOut.inputs === 0 ? "-" : 0} | ${num(o.heldOut.ms)} | ${o.train.inputs} | ${o.train.inputs} | ${o.train.inputs === 0 ? "-" : 1} | ${o.train.inputs === 0 ? "-" : 0} | ${num(o.train.ms)} |`,
    );
    const rows: [string, PortfolioSet | undefined][] = [["best single", c.best], ...c.sets.map((s) => [`k = ${s.members.length}`, s] as [string, PortfolioSet])];
    for (const [name, s] of rows) {
      if (s === undefined) {
        lines.push(`| ${cell} | ${name} | - | ${c.heldOutInputs} | - | - | - | - | ${c.trainInputs} | - | - | - | - |`);
        continue;
      }
      lines.push(`| ${cell} | ${name} | ${s.members.map((m) => `\`${m}\``).join(", ")} | ${scoreCells(s.heldOut)} | ${scoreCells(s.train)} |`);
    }
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
