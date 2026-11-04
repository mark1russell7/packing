// The strategy `select` of roadmap item k66 with a lookup of its members (roadmap item k132). This module does not import
// the registry, so `packDefault` gets only `rows` and `maxrects`.

import type { PackInput, PackOutput } from "./contract.ts";
import { maxrects } from "./maxrects-strategy.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { round3 } from "./round.ts";
import { rows } from "./rows-strategy.ts";
import { checkSelectTable, selectLeaf, SELECT_TABLE, type SelectFeatures, type SelectNode } from "./select-table.ts";
import { spreadOf } from "./spread.ts";
import { cellOf, createContext, supportsCell, type PackContext, type Strategy, type Supports } from "./strategy.ts";

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

/** A lookup of a strategy by its id. It throws a `RangeError` for an id that it does not have. */
export type StrategyLookup = (id: string) => Strategy;

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
 * This function makes the strategy `select` with a lookup of its members. `selectStrategy` tells the strategy. The member
 * packs with its defaults, the options of the member over them, and a new context with the seed.
 */
export function createSelect(lookup: StrategyLookup): Strategy<SelectStrategyOptions> {
  /** This function gives the index of the first member from the pick that takes the input. With no such member, it gives the pick, and that member throws its error. */
  const memberFor = (members: readonly PortfolioEntry[], pick: number, input: PackInput): number => {
    const cell = cellOf(input);
    for (let step = 0; step < members.length; step++) {
      const at = (pick + step) % members.length;
      if (supportsCell(lookup(members[at]!.strategy).supports, cell)) return at;
    }
    return pick;
  };
  return {
    id: "select",
    family: "select",
    catalog: [],
    supports: unionSupports(),
    defaults: {},
    deterministic: true,
    pack(input: PackInput, options: SelectStrategyOptions, context: PackContext): PackOutput {
      const members = (options.members ?? SELECT_MEMBERS).map((m) => (typeof m === "string" ? { id: m, strategy: m } : m));
      const table = options.table ?? SELECT_TABLE;
      for (const m of members) lookup(m.strategy);
      if (options.table !== undefined || options.members !== undefined) checkSelectTable(table, members.length);
      const features = selectFeatures(input);
      const { leaf, pick: leafPick } = selectLeaf(features, table);
      const pick = memberFor(members, leafPick, input);
      const member = members[pick]!;
      const inner = lookup(member.strategy);
      const merged: unknown = { ...(inner.defaults as object), ...(member.options as object | undefined) };
      const out = inner.pack(input, merged, createContext(context.seed));
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
}
