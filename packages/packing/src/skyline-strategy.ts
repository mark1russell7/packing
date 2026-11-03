// The strategy `skyline` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/skyline`).

import { packSkyline } from "./skyline.ts";
import { LAYOUT_DEFAULTS, layoutStrategy, type SkylineStrategyOptions } from "./layout-strategy.ts";
import type { Placer } from "./pack-sized.ts";
import type { Strategy } from "./strategy.ts";

/** This function is the packer of `skyline`. */
const place: Placer = (rects, outer, options) => {
  const { rule, skylineRule, ...rest } = options;
  packSkyline(rects, outer, skylineRule === undefined ? rest : { ...rest, rule: skylineRule });
};

/**
 * The strategy `skyline` uses `packSkyline`: the option `rule` chooses the place of each item on the skyline. The default
 * rule `bl` puts each item in the lowest place where it fits. Roadmap item k22 adds the rule `mw` and `wasteMap`.
 *
 * - It packs around the locked items and the fixed obstacles, in each container shape.
 * - With `rotate`, each turnable item that is not locked can turn by 90 degrees. Groups and item shapes throw `UnsupportedCell`.
 */
export const skyline: Strategy<SkylineStrategyOptions> = /* @__PURE__ */ layoutStrategy(
  "skyline",
  "skyline",
  ["skyline-bl", "skyline-min-waste", "skyline-bl-waste-map", "skyline-min-waste-map"],
  { obstacleMove: ["fixed"], order: ["free", "soft"], rotation: ["none", "quarter"] },
  { ...LAYOUT_DEFAULTS, rule: "bl", wasteMap: false, rotate: false },
  place,
);
