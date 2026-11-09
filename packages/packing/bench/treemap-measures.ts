// The measures that the two treemap benches share: the mean aspect and the readability of Bederson 2002, and a measured
// value against its published value with a bootstrap interval.

import type { Rect } from "@mark1russell7/layout-contract";
import { bootstrap, mean } from "@mark1russell7/rigor-statistics";

/** The angle in radians above which a turn of the scan path counts (section 2.3.1). */
const TURN_ANGLE = 0.1;

/** This function gives the unweighted mean aspect of the cells. */
export function meanAspectOf(cells: readonly Rect[]): number {
  return mean(cells.map((cell) => Math.max(cell.w / cell.h, cell.h / cell.w)));
}

/** This function gives the readability of one group of cells in the input order: 1 less the share of turns of the scan path. */
export function readabilityOf(cells: readonly Rect[]): number {
  const centers = cells.map((cell) => ({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }));
  let turns = 0;
  for (let i = 2; i < centers.length; i += 1) {
    const ax = centers[i - 1]!.x - centers[i - 2]!.x;
    const ay = centers[i - 1]!.y - centers[i - 2]!.y;
    const bx = centers[i]!.x - centers[i - 1]!.x;
    const by = centers[i]!.y - centers[i - 1]!.y;
    if (Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) > TURN_ANGLE) turns += 1;
  }
  return 1 - turns / cells.length;
}

/** One measured value against its published value. An arm with no published row has `null` in `published` and `inBand`. */
export interface Compared {
  readonly published: number | null;
  readonly measured: number;
  readonly low: number;
  readonly high: number;
  readonly inBand: boolean | null;
}

/** This function gives the mean of the trials, with a 95 % bootstrap interval over the trials. */
export function compared(trials: readonly number[], published: number | undefined, name: string, inBand: (measured: number, published: number) => boolean): Compared {
  const interval = bootstrap(trials, mean, { runs: 2000, seed: name });
  const verdict = published === undefined ? null : inBand(interval.estimate, published);
  return { published: published ?? null, measured: interval.estimate, low: interval.low, high: interval.high, inBand: verdict };
}
