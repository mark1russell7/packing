import { packGuillotine } from "./guillotine.ts";
import { packMaxRects } from "./maxrects.ts";
import { packSized, type PackLayoutOptions } from "./pack-sized.ts";
import { Rect } from "./rect.ts";
import { packRows, type PackOptions } from "./rows.ts";
import { selectLeaf, type SelectFeatures } from "./select-table.ts";
import { packShelf } from "./shelf.ts";
import { packSkyline } from "./skyline.ts";
import type { FreeSpace } from "./space.ts";

export { packRows, type PackOptions } from "./rows.ts";
export { packSized, type PackLayoutOptions, type Placer } from "./pack-sized.ts";

/**
 * This function gives the features of `SELECT_TABLE` for rectangles in a container of fixed size. It counts the rectangles
 * that are not locked. The spread is the standard deviation of the natural log of `sqrt(w * h)`, as `spreadOf` gives it.
 */
export function rectFeatures<T>(rects: readonly Rect<T>[], space?: FreeSpace): SelectFeatures {
  const logs: number[] = [];
  for (const r of rects) {
    const area = r.size.x * r.size.y;
    if (!r.locked && area > 0 && Number.isFinite(area)) logs.push(Math.log(area) / 2);
  }
  const mean = logs.reduce((a, b) => a + b, 0) / Math.max(1, logs.length);
  const spread = logs.length < 2 ? 0 : Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length);
  return { count: rects.filter((r) => !r.locked).length, fixed: true, rect: space === undefined || space.plain, spread };
}

/**
 * This function gives the packing of `pack` without `options.strategy` (step A of roadmap item k58).
 *
 * - A container of fixed size gives the pick of `SELECT_TABLE` for `rectFeatures`: `rows`, or `maxrects` with the rule `bl`.
 * - A free size, a fixed width and a fixed height give `rows`, as before 0.3.0.
 */
export function defaultLayoutOf<T>(rects: readonly Rect<T>[], outer: Rect<T>, options: PackOptions = {}): Pick<PackLayoutOptions, "strategy" | "rule"> {
  if (!outer.fixedSize || selectLeaf(rectFeatures(rects, options.space)).pick === 0) return { strategy: "rows" };
  return { strategy: "maxrects", rule: "bl" };
}

/**
 * This function is the packer of `pack`: it starts the packer of `options.strategy` in an outer rectangle that has its size.
 * Without `options.strategy`, `defaultLayoutOf` chooses the packer.
 */
export function placeLayout<T>(rects: Rect<T>[], outer: Rect<T>, options: PackLayoutOptions): void {
  const layout: PackLayoutOptions = options.strategy === undefined ? { ...options, ...defaultLayoutOf(rects, outer, options) } : options;
  if (layout.strategy === "skyline") {
    const { rule, skylineRule, ...rest } = layout;
    packSkyline(rects, outer, skylineRule === undefined ? rest : { ...rest, rule: skylineRule });
  }
  else if (layout.strategy === "shelf") packShelf(rects, outer, layout);
  else if (layout.strategy === "maxrects") packMaxRects(rects, outer, layout);
  else if (layout.strategy === "guillotine") packGuillotine(rects, outer, layout);
  else packRows(rects, outer, layout);
}

/**
 * This function packs rectangles into an outer rectangle with a guillotine row packing. It sets the position
 * of each rectangle and the size of the outer rectangle, and it gives the outer rectangle.
 *
 * - Without fixed sizes, the outer rectangle starts with a width of 1.5 times the square root of the total area.
 *   This width is not less than the width of the widest rectangle. The height grows until all rectangles fit.
 * - With `fixedWidth`, the width stays. A rectangle wider than that width goes on its own row and overflows.
 * - With `fixedSize`, a rectangle that does not fit is not packed: its `wasPacked` stays `false`.
 * - `options.strategy` selects `packRows`, `packSkyline`, `packShelf`, `packMaxRects` or `packGuillotine` after the width is set.
 * - Without `options.strategy`, a fixed size uses the table `SELECT_TABLE`: `packRows`, or `packMaxRects` with the rule `bl`.
 *   Another container uses `packRows`. `defaultLayoutOf` gives the choice.
 */
export function pack<T>(rects: Rect<T>[], outer: Rect<T> = new Rect(), options: PackLayoutOptions = {}): Rect<T> {
  return packSized(rects, outer, options, placeLayout);
}
