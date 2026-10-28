// The per-cell portfolio of roadmap item k20, part 2 (`docs/PACKER.md`, "The per-cell portfolio"). The cell of an input
// comes from the input itself. The table `PORTFOLIO_SETS` gives the members of each cell.

import type { PackInput } from "./contract.ts";
import { countCell, type CountScale } from "./layout-input.ts";
import { PORTFOLIO_SETS } from "./portfolio-sets.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { cellOf, type DimensionValue } from "./strategy.ts";

/** The band of the size spread of the items of an input. */
export type SpreadBand = "identical" | "uniform" | "heavyTail";

/** The cell of an input for the per-cell portfolio: the container shape, the band of the item count and the band of the size spread. */
export interface PortfolioCell {
  shape: DimensionValue<"containerShape">;
  /** The band of the item count, as `countCell` gives it: `1`, `10`, `100`, `1k` or `10k`. */
  count: CountScale;
  spread: SpreadBand;
}

/**
 * The thresholds of the spread bands. The statistic is the standard deviation of the natural log of the linear size
 * `sqrt(w * h)` of each item.
 *
 * - Below `identical`, the band is `identical`.
 * - Below `uniform`, the band is `uniform`.
 * - At `uniform` or above, the band is `heavyTail`.
 *
 * On the seeds 1 to 7 of the generators of `pack-screen-v1`, the uniform sizes give 0.258 at most. The heavy-tail sizes give 0.278 at least.
 */
export const SPREAD_THRESHOLDS: Readonly<{ identical: number; uniform: number }> = Object.freeze({ identical: 0.02, uniform: 0.27 });

/** A cell with fewer inputs than this count in the training records is thin. It uses the set of its container shape. */
export const THIN_INPUTS = 12;

/**
 * The frame budget of the default member count, in milliseconds. The default count of a cell is the largest prefix of its
 * set of 3 that fits this budget. The prefix fits when its median summed member time on the CI records is this value or less.
 * The count is 1 or more at all times.
 * The default output thus does not depend on the clock: a time limit is only the opt-in option `budgetMs`.
 */
export const PORTFOLIO_FRAME_MS = 50;

/** This function gives the key of a cell: `<shape>/<count>/<spread>`, for example `rect/100/uniform`. */
export function cellKey(cell: PortfolioCell): string {
  return `${cell.shape}/${cell.count}/${cell.spread}`;
}

/**
 * This function gives the spread statistic of an input: the standard deviation of the natural log of `sqrt(w * h)` of each item.
 * An item with no area does not count. Fewer than 2 items with an area give 0.
 */
export function spreadOf(input: PackInput): number {
  const logs: number[] = [];
  for (const item of input.items) {
    const area = item.w * item.h;
    if (area > 0 && Number.isFinite(area)) logs.push(Math.log(area) / 2);
  }
  if (logs.length < 2) return 0;
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  return Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length);
}

/** This function gives the band of a spread statistic by `SPREAD_THRESHOLDS`. */
export function spreadBand(spread: number): SpreadBand {
  if (spread < SPREAD_THRESHOLDS.identical) return "identical";
  return spread < SPREAD_THRESHOLDS.uniform ? "uniform" : "heavyTail";
}

/**
 * This function gives the cell of an input for the per-cell portfolio. The function reads only the input, not a corpus id.
 *
 * - `shape` is the `containerShape` of `cellOf`.
 * - `count` is `countCell` of the count of the items.
 * - `spread` is `spreadBand` of `spreadOf`.
 */
export function portfolioCell(input: PackInput): PortfolioCell {
  return { shape: cellOf(input).containerShape, count: countCell(input.items.length), spread: spreadBand(spreadOf(input)) };
}

/** The sizes of the sets of the table. */
export type PortfolioSize = 1 | 2 | 3;

/** The score of a set on its training records. The regrets are means against the oracle of the pool. */
export interface PortfolioTrainScore {
  inputs: number;
  /** The mean of the hard breaks of the winner of the set less those of the oracle */
  hardRegret: number;
  /** The mean of `pack.overflow.excessArea` of the winner of the set less that of the oracle */
  excessAreaRegret: number;
  /** The mean of `pack.fill` of the oracle less that of the winner of the set */
  fillRegret: number;
  /** The inputs where the winner of the set is in the last kept list of the oracle */
  wins: number;
  winShare: number;
  /** The mean of the summed times of the members on an input, in milliseconds */
  msMean: number;
}

/** The sets of one cell of the table, by size, with their training scores. */
export interface PortfolioCellSets {
  /** The inputs of the cell in the training records */
  inputs: number;
  /** The value `true` when `inputs` is less than `THIN_INPUTS`. A thin cell has no sets. It uses the sets of its shape. */
  thin: boolean;
  /** The ids of the members of each set, in the order of the pick. A thin cell has none. */
  sets?: Readonly<Record<`${PortfolioSize}`, readonly string[]>>;
  /** The training score of each set */
  train?: Readonly<Record<`${PortfolioSize}`, PortfolioTrainScore>>;
  /** The median over the inputs of the summed member times of each prefix of the set of 3, in milliseconds. A missing record counts 0. */
  prefixMedianMs?: Readonly<Record<`${PortfolioSize}`, number>>;
  /** The default member count: the largest prefix of the set of 3 with `prefixMedianMs` of `PORTFOLIO_FRAME_MS` or less, and 1 at least */
  defaultMembers?: PortfolioSize;
}

/** The table of the per-cell portfolio. `bench/choose-sets.ts` generates it from the records of one run. */
export interface PortfolioSets {
  /** The run of the records: the corpus, the commit of the code and the id of the run of `bench.yml`. It also has the frame budget of the default counts. */
  source: Readonly<{ corpus: string; run: string; commit: string; inputs: number; frameMs: number }>;
  /** The member of each id: a strategy of the registry with some options */
  entries: Readonly<Record<string, PortfolioEntry>>;
  /** The sets of all the inputs. They are the fixed default of an input of an unknown shape. */
  all: PortfolioCellSets;
  /** The sets of each container shape. They are the fallback of a thin cell and of an unknown cell. */
  shapes: Readonly<Record<string, PortfolioCellSets>>;
  /** The sets of each cell, by `cellKey` */
  cells: Readonly<Record<string, PortfolioCellSets>>;
}

/** The source of the members of an input in the table. */
export type PortfolioSetSource = "cell" | "shape" | "default";

/** This function gives the sets of an input from a table: the sets of its cell, or of its shape, or of all the inputs. */
export function portfolioSetOf(input: PackInput, table: PortfolioSets = PORTFOLIO_SETS): { key: string; source: PortfolioSetSource; sets: PortfolioCellSets } {
  const cell = portfolioCell(input);
  const key = cellKey(cell);
  const own = table.cells[key];
  if (own?.sets !== undefined) return { key, source: "cell", sets: own };
  const shape = table.shapes[cell.shape];
  if (shape?.sets !== undefined) return { key, source: "shape", sets: shape };
  return { key, source: "default", sets: table.all };
}

/**
 * This function gives the `k` members of an input for `packPortfolio`. The members are the set of the cell of the input.
 * A thin cell or an unknown cell takes the set of its shape, or the set of all the inputs. The function throws a `RangeError` for a `k` other than 1, 2 or 3.
 */
export function portfolioMembers(input: PackInput, k: number, table: PortfolioSets = PORTFOLIO_SETS): PortfolioEntry[] {
  if (k !== 1 && k !== 2 && k !== 3) throw new RangeError(`The size of a portfolio set is 1, 2 or 3, not ${k}.`);
  const ids = portfolioSetOf(input, table).sets.sets![`${k}`];
  return ids.map((id) => {
    const e = table.entries[id];
    if (e === undefined) throw new RangeError(`The table of the portfolio sets has no entry "${id}".`);
    return { ...e };
  });
}

/**
 * This function gives the default member count of an input: `defaultMembers` of the sets of its cell, its shape or all the inputs.
 * With a `k`, the count is not more than `k`. A table without the count gives `k`, or 3 without a `k`.
 */
export function portfolioDefaultMembers(input: PackInput, k?: number, table: PortfolioSets = PORTFOLIO_SETS): number {
  const count = portfolioSetOf(input, table).sets.defaultMembers ?? 3;
  return k === undefined ? count : Math.min(count, k);
}
