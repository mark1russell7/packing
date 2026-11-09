// The whole list of the strategies (roadmap item k141): the registry, then the standalone strategies.
// The registry stays the list that `pack` and the composites reach, so an import of `pack` does not pay for a standalone strategy.

import { allStrategies as registered, strategy as registeredStrategy, type StrategyKind, type StrategyListing } from "./registry.ts";
import { sideAnchorsStrategy, standaloneStrategies } from "./standalone-strategies.ts";
import { createContext, type Strategy } from "./strategy.ts";
import type { LayoutFrame } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { framesOfRun, packRun, type PackRun } from "./pack-run.ts";

/** The standalone strategies, each with its kind. */
const STANDALONE_LISTS: readonly (readonly [StrategyKind, readonly Strategy[]])[] = [
  ["single", standaloneStrategies],
  ["composite", [sideAnchorsStrategy]],
];

/** This function builds `allStrategies`. The call has the pure mark, so a bundle of `pack` drops the standalone strategies. */
function listing(): readonly StrategyListing[] {
  const standalone = STANDALONE_LISTS.flatMap(([kind, list]) => list.map(({ id, family, supports, deterministic }): StrategyListing => ({ id, family, kind, supports, deterministic })));
  return Object.freeze([...registered, ...standalone]);
}

/**
 * Each strategy of the package, with its kind and its supports (roadmap item k140). Use this list to find the strategies.
 * The lists `strategies`, `shapeStrategies` and `composites` stay for their own uses, and each one holds only one kind.
 */
export const allStrategies: readonly StrategyListing[] = /* @__PURE__ */ listing();

/**
 * This function gives the strategy with an id, from the registry or the standalone strategies.
 * It throws a `RangeError` for an id that neither has. A composite finds only a member of the registry.
 */
export function strategy(id: string): Strategy {
  return STANDALONE_LISTS.flatMap(([, list]) => list).find((s) => s.id === id) ?? registeredStrategy(id);
}

/**
 * This function packs an input with the strategy of an id. The options go over the defaults of the strategy. The
 * context gets `mulberry32` with the seed. The default seed is 0. The run gives a start frame and a callback of the
 * frames (roadmap item k220). The run is not part of the options, so the config id does not change.
 */
export function packWith(id: string, input: PackInput, options?: unknown, seed = 0, run?: PackRun): PackOutput {
  const s = strategy(id);
  const merged: unknown = { ...(s.defaults as object), ...(options as object | undefined) };
  if (run === undefined) return s.pack(input, merged, createContext(seed));
  return packRun(input, seed, run, (context) => s.pack(input, merged, context));
}

/** This function packs an input with the strategy of an id, as `packWith` does, and gives the output and each frame of the run. */
export function packFrames(id: string, input: PackInput, options?: unknown, seed = 0, run: Omit<PackRun, "onFrame"> = {}): { output: PackOutput; frames: LayoutFrame[] } {
  const s = strategy(id);
  const merged: unknown = { ...(s.defaults as object), ...(options as object | undefined) };
  return framesOfRun(input, seed, run, (context) => s.pack(input, merged, context));
}
