// The subpath `@mark1russell7/packing/guillotine` (roadmap item k132): the strategy `guillotine` and its packer `packGuillotine`. It does not import the other strategies.

export { GUILLOTINE_CHOICES, GUILLOTINE_SPLITS, packGuillotine, type GuillotineChoice, type GuillotineOptions, type GuillotineSplit } from "../guillotine.ts";
export { guillotine } from "../guillotine-strategy.ts";
export type { GuillotineStrategyOptions } from "../layout-strategy.ts";
export type { PackInput, PackOutput } from "../contract.ts";
export { Rect } from "../rect.ts";
export { createContext, type PackContext, type Strategy } from "../strategy.ts";
