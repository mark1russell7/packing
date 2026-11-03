// The subpath `@mark1russell7/packing/maxrects` (roadmap item k132): the strategy `maxrects` and its packer `packMaxRects`. It does not import the other strategies.

export type { MaxRectsStrategyOptions } from "../layout-strategy.ts";
export { MAXRECTS_BANDS, MAXRECTS_RULES, packMaxRects, type MaxRectsOptions, type MaxRectsRule } from "../maxrects.ts";
export { maxrects } from "../maxrects-strategy.ts";
export type { PackInput, PackOutput } from "../contract.ts";
export { Rect } from "../rect.ts";
export { createContext, type PackContext, type Strategy } from "../strategy.ts";
