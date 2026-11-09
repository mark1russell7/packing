// The strategy `shelf` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/shelf`).

import { packShelf } from "./shelf.ts";
import { LAYOUT_DEFAULTS, layoutStrategy, type LayoutStrategyOptions } from "./layout-strategy.ts";
import type { Placer } from "./pack-sized.ts";
import type { Strategy } from "./strategy.ts";

/** This function is the packer of `shelf`. */
const place: Placer = (rects, outer, options) => {
  packShelf(rects, outer, options);
};

/**
 * The strategy `shelf` uses `packShelf`: rows filled left to right, around the locked items and the fixed obstacles.
 * With the sort order `input`, the rows keep the rank order. Turnable items, groups and item shapes throw `UnsupportedCell`.
 * The option `fit` selects a shelf rule of roadmap items k21 and k211: a value of `SHELF_FITS`. The default has no `fit`.
 */
export const shelf: Strategy<LayoutStrategyOptions> = /* @__PURE__ */ layoutStrategy("shelf", "shelf", ["shelf-nf", "shelf-nfdh"], {
  obstacleMove: ["fixed"],
  order: ["free", "soft", "hard"],
}, LAYOUT_DEFAULTS, place);
