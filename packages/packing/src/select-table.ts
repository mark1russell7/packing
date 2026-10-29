// The decision table of the strategy `select` (roadmap item k66) and its walk. This file imports nothing, so `pack` reads
// the table without an import cycle (step A of roadmap item k58).

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
