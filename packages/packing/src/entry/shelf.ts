// The subpath `@mark1russell7/packing/shelf` (roadmap item k132): the strategy `shelf` and its packer `packShelf`. It does not import the other strategies.

export type { LayoutStrategyOptions } from "../layout-strategy.ts";
export { packShelf, SHELF_FITS, type ShelfFit, type ShelfOptions } from "../shelf.ts";
export { shelf } from "../shelf-strategy.ts";
export type { PackInput, PackOutput } from "../contract.ts";
export { Rect } from "../rect.ts";
export { createContext, type PackContext, type Strategy } from "../strategy.ts";
