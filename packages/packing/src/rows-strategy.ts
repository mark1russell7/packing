// The strategy `rows` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/rows`).

import { packRows } from "./rows.ts";
import { LAYOUT_DEFAULTS, layoutStrategy, type LayoutStrategyOptions } from "./layout-strategy.ts";
import type { Placer } from "./pack-sized.ts";
import type { Strategy } from "./strategy.ts";

/** This function is the packer of `rows`. */
const place: Placer = (rects, outer, options) => {
  packRows(rects, outer, options);
};

/**
 * The strategy `rows` uses `packRows`: a guillotine row packing with a recursive gap fill. With obstacles, locked items or a
 * container shape, the rows go around the holes of the free space and lose the gap fill. Turnable items, groups and item
 * shapes throw `UnsupportedCell`.
 */
export const rows: Strategy<LayoutStrategyOptions> = /* @__PURE__ */ layoutStrategy("rows", "shelf", ["rows-gap-fill", "rows-input"], {
  obstacleMove: ["fixed"],
  order: ["free", "soft", "hard"],
}, LAYOUT_DEFAULTS, place);
