// The subpath `@mark1russell7/packing/default` (roadmap item k132): `packDefault`: the strategy `select` with its default members `rows` and `maxrects`. It does not import the other strategies.

export { DEFAULT_STRATEGY, packDefault } from "../default.ts";
export type { PackInput, PackOutput } from "../contract.ts";
export { createContext, type PackContext, type Strategy } from "../strategy.ts";
