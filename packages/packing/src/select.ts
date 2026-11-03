// The strategy `select` of roadmap item k66, part 2 (`docs/PACKER.md`, "The feature select"). It reads cheap features of
// the input, walks a small decision table and packs with exactly one member. `pack()` reads its table for a fixed size.
// Since roadmap item k132, `select-core.ts` holds the strategy, and this module gives it the lookup of the registry.

import { strategy } from "./registry.ts";
import { createSelect, type SelectStrategyOptions } from "./select-core.ts";
import type { Strategy } from "./strategy.ts";

export { checkSelectTable, selectLeaf, SELECT_MAX_DEPTH, SELECT_TABLE, type SelectFeatures, type SelectFlagFeature, type SelectNode, type SelectNumberFeature } from "./select-table.ts";
export { SELECT_MEMBERS, SELECT_STAGE, selectFeatures, type SelectStrategyOptions } from "./select-core.ts";

/**
 * The strategy `select`: it gives the features of the input to the table, and it packs with the one member of the leaf.
 *
 * - The seed of the context goes to the member. The output of the member does not change.
 * - The output gets the trace stage `select` (`SELECT_STAGE`) after the stages of the member.
 * - The stage has `move.select`, `select.member` (the index of the pick), `select.pick.<member id>` (1), `select.leaf` and each feature.
 * - Its supports are the union of the supports of `rows` and `maxrects`. A member that does not support the cell throws its error.
 * - The strategy throws a `RangeError` for an unknown strategy of a member and for a table that `checkSelectTable` refuses.
 */
export const selectStrategy: Strategy<SelectStrategyOptions> = /* @__PURE__ */ createSelect(strategy);
