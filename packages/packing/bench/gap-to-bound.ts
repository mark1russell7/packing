// The measure `pack.gapToBound` of roadmap item k116: the fill of a layout against the best fill that its placed items permit.
// The value is from 0 to 1 in each region of the inputs. Thus "covered" means the same for a strip, a free container and a full container.
// The function is pure. It does not change `pack()` or the other measures.

import { objectiveBound, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** The name of the measure in a record. */
export const GAP_TO_BOUND = "pack.gapToBound";

/**
 * This function gives an upper bound of the fill of a layout, from the hull bound of k51 of its placed items, or `undefined` when no item is placed.
 *
 * 1. The placed items go into a free container, so the bound is the lower bound of the hull area (`hull.area`, `hull.extent` or `hull.margin`).
 * 2. The upper bound of the fill is the area of the placed boxes over that hull area, at most 1.
 * 3. A hull bound of 0, or no bound (a margin below 0), gives the upper bound 1. Each fill is at most 1.
 *
 * The bound of the hull does not count the gap between the items, as the bounds of k51 do not.
 */
export function fillUpperBound(input: PackInput, output: PackOutput, boxArea: number): number | undefined {
  const placed = new Set(output.placements.map((p) => p.id));
  const items = input.items.filter((i) => placed.has(i.id));
  if (items.length === 0 || !(boxArea > 0)) return undefined;
  const { obstacles: _obstacles, ...rest } = input;
  const bound = objectiveBound({ ...rest, items, container: { ...input.container, fixed: "none" } });
  if (bound === null || !(bound.value > 0)) return 1;
  return Math.min(1, boxArea / bound.value);
}

/**
 * This function gives the measure `pack.gapToBound` of a layout: `1 - fill / fillUpperBound`, from 0 to 1, or `undefined` when no item is placed.
 *
 * - `fill` and `area` are the measures `pack.fill` and `pack.area`, so the area of the placed boxes is `fill × area`.
 * - The value 0 tells that the fill reaches its bound. The value 1 tells a fill of 0.
 * - With the bound `hull.area`, the value is `1 - bound / area`: the share of the hull that the bound does not explain.
 */
export function gapToBound(input: PackInput, output: PackOutput, fill: number, area: number): number | undefined {
  const upper = fillUpperBound(input, output, fill * area);
  if (upper === undefined) return undefined;
  return Math.min(1, Math.max(0, 1 - fill / upper));
}
