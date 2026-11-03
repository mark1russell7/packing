// The size step of `pack`: it sets the size of the outer rectangle, starts one packer and fits the outer rectangle to the
// content. Each strategy gives its own packer, so the module of one strategy does not import the other packers.

import type { GuillotineChoice, GuillotineSplit } from "./guillotine.ts";
import type { MaxRectsRule } from "./maxrects.ts";
import { Rect } from "./rect.ts";
import type { PackOptions } from "./rows.ts";
import type { ShelfFit } from "./shelf.ts";
import type { SkylineRule } from "./skyline.ts";
import { Vector } from "./vector.ts";

/** The options of `pack` */
export interface PackLayoutOptions extends PackOptions {
  /**
   * The packing: `rows` (the default), `skyline`, `shelf`, `maxrects` or `guillotine`. Each one but `rows` packs around
   * locked rectangles. Use `shelf` with the sort order `input` to keep the order of the array around locked rectangles.
   */
  strategy?: "rows" | "skyline" | "shelf" | "maxrects" | "guillotine";
  /** The rule of `shelf` to choose a shelf. Only `shelf` reads it. `ShelfOptions` tells it. Without it, `shelf` packs as in 0.2.3. */
  fit?: ShelfFit;
  /** The rule of `maxrects` to choose a free rectangle. Only `maxrects` reads it. The default is `bssf`. */
  rule?: MaxRectsRule;
  /** The largest height of a band of `maxrects` in a space that is not plain. Only `maxrects` reads it. `MaxRectsOptions` tells it. */
  bandHeight?: number;
  /** The rule of `skyline` to choose a place on the skyline. Only `skyline` reads it. The default is `bl`. */
  skylineRule?: SkylineRule;
  /** The value `true` gives `skyline` a waste map. Only `skyline` reads it. `SkylineOptions` tells it. */
  wasteMap?: boolean;
  /** The rule of `guillotine` to choose a free rectangle. Only `guillotine` reads it. The default is `baf`. */
  choice?: GuillotineChoice;
  /** The rule of `guillotine` to split a free rectangle. Only `guillotine` reads it. The default is `sas`. */
  split?: GuillotineSplit;
  /** The value `true` gives `guillotine` the rectangle merge. Only `guillotine` reads it. `GuillotineOptions` tells it. */
  merge?: boolean;
  /** The rectangles that `maxrects`, `skyline` and `guillotine` can turn by 90 degrees. */
  turnable?: ReadonlySet<unknown>;
  /** The rectangles that `maxrects`, `skyline` and `guillotine` turned. `MaxRectsOptions` tells it. */
  turned?: Set<unknown>;
}

/** A packer of `packSized`: it places the rectangles in an outer rectangle that has its size. */
export type Placer = <T>(rects: Rect<T>[], outer: Rect<T>, options: PackLayoutOptions) => void;

/**
 * This function does the steps of `pack` with one packer. It sets the size of the outer rectangle, starts `place`, and
 * then fits the outer rectangle to the content. `pack` tells the rules of the size.
 */
export function packSized<T>(rects: Rect<T>[], outer: Rect<T>, options: PackLayoutOptions, place: Placer): Rect<T> {
  let totalArea = 0;
  let widest = 0;
  let minX = rects.length > 0 ? Infinity : 0;
  let minY = rects.length > 0 ? Infinity : 0;
  for (const r of rects) {
    totalArea += r.area();
    widest = Math.max(widest, r.size.x);
    minX = Math.min(minX, r.size.x);
    minY = Math.min(minY, r.size.y);
  }

  const idealWidth = outer.fixedWidth
    ? outer.size.x
    : Math.max(widest, Math.min(1.5 * Math.sqrt(totalArea), outer.size.x || Infinity));

  const ideal = Vector.of(idealWidth).clamp(new Vector(minX, minY), Vector.Infinity);

  // A fixed width stays, also when a rectangle is wider: that rectangle overflows
  if (!outer.fixedSize) outer.size.setTo(outer.fixedWidth ? new Vector(outer.size.x, ideal.y) : ideal);
  place(rects, outer, options);

  if (!outer.fixedSize) {
    const contentRight = Rect.maxRight(rects);
    if (!outer.size.x) outer.size.x = contentRight;
    else if (!outer.fixedWidth) outer.size.x = Math.min(contentRight, outer.size.x);
    outer.size.y = Rect.maxBottom(rects);
  }

  return outer;
}
