// The strategy `maxrects` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/maxrects`).

import { packMaxRects } from "./maxrects.ts";
import { LAYOUT_DEFAULTS, layoutStrategy, type MaxRectsStrategyOptions } from "./layout-strategy.ts";
import type { Placer } from "./pack-sized.ts";
import type { Strategy } from "./strategy.ts";

/** This function is the packer of `maxrects`. */
const place: Placer = (rects, outer, options) => {
  packMaxRects(rects, outer, options);
};

/**
 * The strategy `maxrects` uses `packMaxRects`: the MaxRects packer of roadmap item k24. It keeps the list of the maximal
 * free rectangles, and the option `rule` chooses the free rectangle for each item. The default rule is `bssf`.
 *
 * - The free rectangles go around the locked items and the fixed obstacles. A plain rectangle container gives exact free
 *   rectangles. Another shape gives an inner approximation with horizontal bands.
 * - With `rotate`, each turnable item that is not locked can turn by 90 degrees. Groups and item shapes throw `UnsupportedCell`.
 */
export const maxrects: Strategy<MaxRectsStrategyOptions> = /* @__PURE__ */ layoutStrategy(
  "maxrects",
  "maxrects",
  ["maxrects-bssf", "maxrects-blsf", "maxrects-baf", "maxrects-bl", "maxrects-cp", "maxrects-wire", "maxrects-locked"],
  { obstacleMove: ["fixed"], order: ["free", "soft"], rotation: ["none", "quarter"] },
  { ...LAYOUT_DEFAULTS, rule: "bssf", rotate: false },
  place,
);
