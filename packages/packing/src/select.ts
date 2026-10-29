// The strategy `select` of roadmap item k66, part 2 (`docs/PACKER.md`, "The feature select"). It reads cheap features of
// the input, walks a small decision table and packs with exactly one member. `pack()` reads its table for a fixed size.

import { maxrects, rows } from "./adapters.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { round3 } from "./layout-input.ts";
import { spreadOf } from "./portfolio-cell.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { checkSelectTable, selectLeaf, SELECT_TABLE, type SelectFeatures, type SelectNode } from "./select-table.ts";
import type { PackContext, Strategy, Supports } from "./strategy.ts";

export { checkSelectTable, selectLeaf, SELECT_MAX_DEPTH, SELECT_TABLE, type SelectFeatures, type SelectFlagFeature, type SelectNode, type SelectNumberFeature } from "./select-table.ts";

/** The default members of `select`: `rows`, then `maxrects` with the rule `bl` */
export const SELECT_MEMBERS: readonly PortfolioEntry[] = Object.freeze([
  { id: "rows", strategy: "rows" },
  { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } },
]);

/** The id of the trace stage of `select`. Its measure `move.select` is 1 when the pick is not member 0. */
export const SELECT_STAGE = "select";

/** This function gives the cheap features of an input. The spread is `spreadOf`. */
export function selectFeatures(input: PackInput): SelectFeatures {
  const c = input.container;
  const rect = (c.shape === undefined || c.shape.kind === "rect") && !(input.obstacles ?? []).some((o) => o.region.kind !== "rect");
  return { count: input.items.length, fixed: c.fixed === "size", rect, spread: spreadOf(input) };
}

/** The options of the strategy `select` */
export interface SelectStrategyOptions {
  /** The members. The default is `SELECT_MEMBERS`. A member is a strategy id, or a `PortfolioEntry` with options. */
  members?: readonly (string | PortfolioEntry)[];
  /** The decision table. The default is `SELECT_TABLE`. Each pick is an index of `members`. */
  table?: SelectNode;
}

/** This function gives the union of the supports of the default members. */
function unionSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, maxrects] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  return out as unknown as Supports;
}

/**
 * The strategy `select`: it gives the features of the input to the table, and it packs with the one member of the leaf.
 *
 * - The seed of the context goes to the member. The output of the member does not change.
 * - The output gets the trace stage `select` (`SELECT_STAGE`) after the stages of the member.
 * - The stage has `move.select`, `select.member` (the index of the pick), `select.pick.<member id>` (1), `select.leaf` and each feature.
 * - Its supports are the union of the supports of `rows` and `maxrects`. A member that does not support the cell throws its error.
 * - The strategy throws a `RangeError` for an unknown strategy of a member and for a table that `checkSelectTable` refuses.
 */
export const selectStrategy: Strategy<SelectStrategyOptions> = {
  id: "select",
  family: "select",
  catalog: [],
  supports: unionSupports(),
  defaults: {},
  deterministic: true,
  pack(input: PackInput, options: SelectStrategyOptions, context: PackContext): PackOutput {
    const members = (options.members ?? SELECT_MEMBERS).map((m) => (typeof m === "string" ? { id: m, strategy: m } : m));
    const table = options.table ?? SELECT_TABLE;
    for (const m of members) strategy(m.strategy);
    if (options.table !== undefined || options.members !== undefined) checkSelectTable(table, members.length);
    const features = selectFeatures(input);
    const { leaf, pick } = selectLeaf(features, table);
    const member = members[pick]!;
    const out = packWith(member.strategy, input, member.options, context.seed);
    const measures: Record<string, number> = {
      "move.select": pick === 0 ? 0 : 1,
      "select.member": pick,
      [`select.pick.${member.id}`]: 1,
      "select.leaf": leaf,
      "select.count": features.count,
      "select.fixed": features.fixed ? 1 : 0,
      "select.rect": features.rect ? 1 : 0,
      "select.spread": round3(features.spread),
    };
    return { ...out, trace: [...(out.trace ?? []), { id: SELECT_STAGE, measures }] };
  },
};
