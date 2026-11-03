// The strategy `guillotine` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/guillotine`).

import { packGuillotine } from "./guillotine.ts";
import { LAYOUT_DEFAULTS, layoutStrategy, type GuillotineStrategyOptions } from "./layout-strategy.ts";
import type { Placer } from "./pack-sized.ts";
import type { Strategy } from "./strategy.ts";

/** This function is the packer of `guillotine`. */
const place: Placer = (rects, outer, options) => {
  packGuillotine(rects, outer, options);
};

/**
 * The strategy `guillotine` uses `packGuillotine`: the guillotine packer of roadmap item k23. It keeps a list of free
 * rectangles that do not overlap. The option `choice` chooses the free rectangle, and the option `split` cuts the rest.
 *
 * - The free rectangles go around the locked items and the fixed obstacles, with the walls of `maxrects`.
 * - With `rotate`, each turnable item that is not locked can turn by 90 degrees. Groups and item shapes throw `UnsupportedCell`.
 */
export const guillotine: Strategy<GuillotineStrategyOptions> = /* @__PURE__ */ layoutStrategy(
  "guillotine",
  "guillotine",
  ["guillotine-<choice>-<split>"],
  { obstacleMove: ["fixed"], order: ["free", "soft"], rotation: ["none", "quarter"] },
  { ...LAYOUT_DEFAULTS, choice: "baf", split: "sas", rotate: false, merge: false },
  place,
);
