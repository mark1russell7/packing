// The spread statistic of an input. The strategy `select` reads it without the table `PORTFOLIO_SETS` (roadmap item k132).

import type { PackInput } from "./contract.ts";

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
