// The strategy `select` of roadmap item k66, part 2 (`docs/PACKER.md`, "The feature select"). It reads cheap features of
// the input, walks a small decision table and packs with exactly one member. Nothing default uses it.

import { maxrects, rows } from "./adapters.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { round3 } from "./layout-input.ts";
import { spreadOf } from "./portfolio-cell.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import type { PackContext, Strategy, Supports } from "./strategy.ts";

/** The cheap features of an input for `select`. One pass over the items and the obstacles gives them. */
export interface SelectFeatures {
  /** The count of the items */
  count: number;
  /** The value `true` when the container has the size `fixed`. A free width, a free height or a free size gives `false`. */
  fixed: boolean;
  /** The value `true` when the container is a rectangle with no obstacle of another shape: the `containerShape` `rect` of `cellOf` */
  rect: boolean;
  /** The size spread: `spreadOf`, the standard deviation of the natural log of `sqrt(w * h)` of each item */
  spread: number;
}

/** A feature of `SelectFeatures` with a number value. A node of this feature compares the value with `below`. */
export type SelectNumberFeature = "count" | "spread";

/** A feature of `SelectFeatures` with a flag value. */
export type SelectFlagFeature = "fixed" | "rect";

/**
 * A node of the decision table of `select`.
 *
 * - A leaf has `leaf`, its number for the trace, and `pick`, the index of its member in the option `members`.
 * - A number node goes to `yes` when the feature value is below `below`, else to `no`.
 * - A flag node goes to `yes` when the feature value is `true`, else to `no`.
 */
export type SelectNode =
  | { readonly leaf: number; readonly pick: number }
  | { readonly feature: SelectNumberFeature; readonly below: number; readonly yes: SelectNode; readonly no: SelectNode }
  | { readonly feature: SelectFlagFeature; readonly yes: SelectNode; readonly no: SelectNode };

/** The largest count of the tests on a path of a table of `select` */
export const SELECT_MAX_DEPTH = 3;

/**
 * The default table of `select`, for the default members `rows` (0) and `maxrects-bl` (1). Roadmap item k66 fitted it on
 * the records of `pack-screen-v1` (CI job 40675490363) and `pack-free-v1` (CI job 40685309195). A win is a fill ratio of 1.05 or
 * more with no more hard breaks. The leaf picks the member with the most wins.
 *
 * - Each threshold is in a plateau of the training accuracy. The table takes a value in the plateau that other code uses.
 * - The spread thresholds are `SPREAD_THRESHOLDS`: 0.02 and 0.27. The spread plateaus are 0 to 0.11 and 0.24 to 0.35.
 * - The count threshold 317 is the end of the band `100` of `countCell`. Any value from 101 to 1000 gives the same split.
 */
export const SELECT_TABLE: SelectNode = Object.freeze({
  feature: "fixed",
  // A container of fixed size
  yes: {
    feature: "count",
    below: 317,
    // 316 items or fewer. Identical sizes: rows (0 wins of 15). Other sizes: maxrects-bl (635 wins of 850).
    yes: { feature: "spread", below: 0.02, yes: { leaf: 0, pick: 0 }, no: { leaf: 1, pick: 1 } },
    // 317 items or more. A uniform spread: rows (10 wins of 210). A heavy tail: maxrects-bl (184 wins of 210).
    no: { feature: "spread", below: 0.27, yes: { leaf: 2, pick: 0 }, no: { leaf: 3, pick: 1 } },
  },
  // A container of free size
  no: {
    feature: "spread",
    below: 0.27,
    // Identical or uniform sizes: rows (49 wins of 490)
    yes: { leaf: 4, pick: 0 },
    // A heavy tail. A rectangle: rows (7 wins of 50). Another shape: maxrects-bl (172 wins of 200).
    no: { feature: "rect", yes: { leaf: 5, pick: 0 }, no: { leaf: 6, pick: 1 } },
  },
} satisfies SelectNode) as SelectNode;

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

/** This function gives the leaf of the features in a table. */
export function selectLeaf(features: SelectFeatures, table: SelectNode = SELECT_TABLE): { leaf: number; pick: number } {
  let node = table;
  while (!("leaf" in node)) {
    const go = "below" in node ? features[node.feature] < node.below : features[node.feature];
    node = go ? node.yes : node.no;
  }
  return { leaf: node.leaf, pick: node.pick };
}

/**
 * This function checks a table against a count of members. A path has at most `SELECT_MAX_DEPTH` tests, thus the table has 8 leaves or fewer.
 * It throws a `RangeError` for a longer path, a pick that is not a member index and a threshold that is not a number.
 */
export function checkSelectTable(table: SelectNode, members: number): void {
  const walk = (node: SelectNode, depth: number): void => {
    if ("leaf" in node) {
      if (!Number.isInteger(node.pick) || node.pick < 0 || node.pick >= members) throw new RangeError(`The leaf ${node.leaf} of the table of select picks ${node.pick}, but the members are 0 to ${members - 1}.`);
      return;
    }
    if (depth >= SELECT_MAX_DEPTH) throw new RangeError(`The table of select has a path with more than ${SELECT_MAX_DEPTH} tests.`);
    if ((node.feature === "count" || node.feature === "spread") && !Number.isFinite(node.below)) throw new RangeError(`The test of ${node.feature} of the table of select needs a number below.`);
    walk(node.yes, depth + 1);
    walk(node.no, depth + 1);
  };
  walk(table, 0);
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
