# The Packer interface (draft)

This document is the draft of the interface of each strategy of `packing` (roadmap item k7). The interface is the intermediate form of the layout compiler. A view describes itself as a packing input. A strategy packs it. The router routes the edges of the output.

- The status is **draft**, and the code of 0.1.3 builds it. The layout-stack session, `highways` and `packing` settled its open questions on 2026-10-27. The section "The decisions" gives them.
- The shared types go to the package `@mark1russell7/layout-contract` of the repository `layout-stack`. The section "The contract and packing" tells which types.
- The field names are those of `layout-input/1` in [`docs/FORMAT.md`](FORMAT.md). A packing input is a `layout-input/1` file without `edges`.
- The cell names are those of [`docs/research/TAXONOMY.md`](research/TAXONOMY.md).
- The API of 0.1 (`Rect`, `pack`, `packShelf`, `packFree` and the others) stays. An adapter puts each function behind the interface.

## The goals

1. One interface for each strategy of the catalog, so the corpus measures each strategy in the same way.
2. A general container: a region (a polygon with holes, with a rectangle as the frequent case), obstacles as regions, and a free size as an option.
3. Each strategy declares the cells that it supports. The selector and the benchmark read this declaration.
4. Stages that a strategy can swap: the size search, the split of the free space, the assignment, the placement and the compaction.
5. The same result for the same input, options and seed.

## The data

Since 0.2.0, `packing` imports the data types from `@mark1russell7/layout-contract` and exports them with the same names. Each field and each array is `readonly`.

| Type | The contract name | The content |
|---|---|---|
| `Region` | `Region` | A rectangle, a polygon with optional holes, a circle or an ellipse. `docs/FORMAT.md` gives the rules. |
| `LayoutContainer` | `LayoutContainer` | `w`, `h`, `fixed` (`size`, `width`, `height` or `none`), `aspect`, `aspectWeight`, `shape` and `inset`. |
| `Obstacle` | `Obstacle` | An `id`, a `region` and an optional `move: { cost }`. |
| `Item` | `Item`, the same type as `LayoutBox` | `id`, `w`, `h`, and the optional `x`, `y`, `locked`, `rank`, `parent`, `group`, `shape`, `ports`, `margin`, `turnable` and `data`. |
| `Port` | `Port` | An `id`, an optional `side`, and an optional `x` and `y` on the border of the item. |
| `Sides` | `Sides` | One value for each side: `top`, `right`, `bottom` and `left`. |
| `Margin` | `Margin` | A number, or `Sides`. |
| `PackInput` | `PackInput` | A `container`, the `items`, and the optional `obstacles`, `gap` and `pairGaps`. |
| `PairGap` | `PairGap` | The ids `a` and `b` of two items, their `gap`, and an optional `lanes`. Decision 3 gives the rule. |
| `Placement` | `Placement` | An `id`, `x`, `y` and an optional `turn` of 0 or 90. |
| `PackOutput` | `PackOutput` | The `placements`, the `overflow`, the `size`, the `moved` obstacles and an optional `trace`. |
| `StageTrace` | `StageTrace` | An `id`, and an optional `ms` and `measures`. Each strategy of `packing` writes both. |
| `PackHard` | `PackHard` | The count of each hard rule: `no-overlap`, `in-container`, `locked-kept` and `complete`. |
| `LayoutInput`, `LayoutEdge` | `LayoutInput`, `LayoutEdge` | The file `layout-input/1` and its edges. |

`GeneratedInput` is a `LayoutInput` with each field that a generator of `packing` writes. The generators and `corpus` give it.

The output does not change the input. The functions of 0.1 change the `Rect` objects that they get. The adapter of the 0.1 API copies the output into those objects.

## The strategy

```ts
interface Strategy<O = unknown> {
  /** A stable name, for example "shelf" or "maxrects.bssf". The records use it. */
  id: string;
  /** The family of the catalog, for example "shelf" or "guillotine". */
  family: string;
  /** The ids of the catalog rows that this strategy builds. */
  catalog: string[];
  /** The cells that the strategy supports. */
  supports: Supports;
  /** The default options. A record writes the options in full. */
  defaults: O;
  /** true when the placements depend only on the input, the options and the seed. The times in the trace are not part of this rule. */
  deterministic: boolean;
  pack(input: PackInput, options: O, context: PackContext): PackOutput;
}

/** For each dimension of the taxonomy, the values that the strategy supports. */
type Supports = {
  containerSize: ("fixed" | "freeHeight" | "freeWidth" | "freeAspect" | "freeArea")[];
  containerShape: ("rect" | "convex" | "polygon" | "circle" | "ellipse" | "holes")[];
  obstacleMove: ("fixed" | "costly" | "free")[];
  itemShape: ("rect" | "polygon" | "circle" | "free" | "mixed")[];
  rotation: ("none" | "quarter" | "any")[];
  order: ("free" | "soft" | "hard")[];
  groups: ("none" | "flat" | "nested")[];
  mode: ("offline" | "online" | "incremental")[];
};

interface PackContext {
  /** The seed. A strategy gets each random number from rng, never from Math.random. */
  seed: number;
  rng: () => number;
  /** A limit for the strategies that search. The strategy returns its best result at the limit. */
  budget?: { ms?: number; steps?: number };
  /** The previous output, for the mode "incremental". */
  previous?: PackOutput;
}
```

- A strategy refuses an input outside its cells. It throws `UnsupportedCell`, with the dimension and the value. The benchmark records this result. It is not a failure of the strategy.
- The layout of the obstacles, the sizes and the count are not in `Supports`. Each strategy supports each of their values. The benchmark measures how well.
- An obstacle that is not a rectangle has no dimension of its own. `cellOf` reports it as the container shape `holes`.
- The input format has no field for a hard order. Thus `cellOf` gives the order `free` or `soft`, and a caller asks for `hard` through the options of the strategy.

## The stages

A strategy is one function, or a pipeline of stages. Each stage is an interface, so the corpus can measure each choice of a stage with the other stages the same.

```ts
/** The size search: it gives a strategy of a fixed size the cells freeAspect and freeArea. */
interface SizeSearch {
  id: string; // "log-sweep" (packFree of 0.1.2), "breakpoints", "golden", ...
  search(input: PackInput, inner: Strategy, context: PackContext, options?: unknown): PackOutput;
}

/** The split of the free space around the obstacles and the holes (k41, k42). */
interface Split {
  id: string; // "maximal-rects", "slabs", "obstacle-cuts", "cells", "one-region"
  split(container: LayoutContainer, obstacles: readonly Obstacle[], gap: number): Part[];
}
interface Part { id: string; region: Region; }

/** The assignment of the items to the parts (k43). */
interface Assign {
  id: string; // "reading-greedy", "bin-assignment", "order-flow"
  assign(items: Item[], parts: Part[], context: PackContext): Map<string, Item[]>;
}

/** A pass after the placement, for example a compaction (k54) or an overlap removal (k53). */
interface Pass {
  id: string;
  run(input: PackInput, output: PackOutput, context: PackContext): PackOutput;
}

/** A strategy made from stages. */
function pipeline(parts: {
  id: string;
  size?: SizeSearch;
  split?: Split;
  assign?: Assign;
  place: Strategy;
  passes?: Pass[];
}): Strategy;
```

- `pipeline` computes the `supports` of the result from its stages. A size search adds `freeAspect` and `freeArea`. A split adds the container shapes and the obstacles that it supports.
- The turn of the axes is a free stage: it gives each strategy of `freeHeight` the cell `freeWidth`.
- Each stage writes one `StageTrace`, with its id, its time and its own measures (for example `pack.search.widths`, `pack.part.fill`).

## The selector

```ts
/** The cell of an input: one value for each dimension of the taxonomy. */
function cellOf(input: PackInput): Cell;

interface Selector {
  id: string; // "rule", "features", "portfolio"
  select(input: PackInput, strategies: Strategy[]): Strategy;
}
```

The selector picks only from the strategies whose `supports` holds the cell of the input (roadmap item k20). The benchmark measures each selector against the best strategy of each input.

### The portfolio

Since 0.2.6, `packPortfolio(members, options?)` is the first selector of k20. It is opt-in. No default uses it.

```ts
const p = packPortfolio(["skyline", { id: "shelf-best", strategy: "shelf", options: { fit: "best" } }]);
const { output, winner, trace } = p.pick(input);
```

- The function packs the input with each member, in the given order. Then `selectBest` of the contract picks the winner.
- The levels are `PORTFOLIO_LEVELS`: the hard breaks with `exactContainer` (`hardBreaks`), then `pack.overflow.excessArea`, then `pack.fill`.
- The hash of each member output is `outputHash`. It is the hash of the bench records, not the grid hash of the contract.
- The output of the winner gets one more trace stage, `portfolio`. Its measure `move.pick` is 1 when the winner is not member 0.
- The options `budgetMs`, `maxMembers` and `now` are the limits of `portfolio` of the contract. The option `seed` goes to each member.
- The bench gives the portfolio report from the records (`docs/BENCH.md`, "Portfolio"). The report tells which sets to try.
- Since 0.2.7, `members` can also be a function `(input) => members`. The contract checks the list of each input.
- `packPortfolio` has no default `budgetMs`. A default that reads the clock gives two layouts for one input on two computers.
- Since roadmap item k117, the option `budgetWork` is a work limit. It cuts at the same member on each computer ("The work budget").

### The per-cell portfolio

Since 0.2.7, the strategy `portfolio` packs each input with the set of its cell. It is opt-in. No default uses it.

```ts
const output = packWith("portfolio", input); // the default member count of the cell
const three = packWith("portfolio", input, { k: 3 }); // each of the 3 members of the cell
```

The cell of an input is `portfolioCell(input)`. The function reads the input only.

| Part | Value |
|---|---|
| `shape` | The `containerShape` of `cellOf` |
| `count` | `countCell` of the item count: `1` (3 or fewer), `10` (31 or fewer), `100` (316 or fewer), `1k` (3162 or fewer) or `10k` |
| `spread` | The band of `spreadOf`: the standard deviation of the natural log of `sqrt(w * h)` of each item |

The bands of the spread are `SPREAD_THRESHOLDS`:

- `identical`: below 0.02. An input with fewer than 2 items with an area has the spread 0.
- `uniform`: from 0.02 to below 0.27.
- `heavyTail`: 0.27 or more.

On the seeds 1 to 7 of the generators of `pack-screen-v1`, the sizes `uniform` give 0.26 at most, and the sizes `heavyTail` give 0.28 at least.

- The tiles of `dashboard` (0.31 to 0.37) and the words of `word-cloud` (0.35 to 0.41) are in the band `heavyTail`.
- The cards of `cards` and the case `touchObstacles` are in the band `uniform`. The case `oversize` is in the band `heavyTail`.
- `gallery`, `empty`, `one` and `exactTiling` are in the band `identical`.

The table `PORTFOLIO_SETS` gives the sets. `bench/choose-sets.ts` writes it from the records of one run (`docs/BENCH.md`, "The per-cell portfolio").

- `portfolioMembers(input, k)` gives the set of `k` members of the cell of the input. A thin cell or an unknown cell uses the set of its shape.
- A shape with no sets uses the fixed default: the sets of all the inputs.
- `portfolioDefaultMembers(input)` gives the default member count of the cell: the largest prefix of the set of 3 with a median summed time of `PORTFOLIO_FRAME_MS` or less.
- The default count comes from the CI times of the records. The count is a constant of the table, so the default output is a function of the input only.

The options of the strategy `portfolio`:

| Option | Default | Effect |
|---|---|---|
| `k` | none | 2 or 3. With `k`, each of the `k` members of the cell runs. |
| `maxMembers` | `defaultMembers` of the cell | The largest count of the members that run. Without `k`, the members come from the set of 3. |
| `budgetMs` | none | An opt-in time limit of the contract. The first member always runs. A cut member makes the output depend on the clock. |
| `budgetWork` | none | An opt-in work limit in work units ("The work budget"). The first member always runs. A cut is the same on each computer. |
| `members` | none | A fixed list of members for each input, in place of the set of the cell. It refuses `k`. |
| `key` | `pack.overflow.excessArea`, `pack.fill` | The measure ids of the pick after the hard breaks, in order. Each id is in `MEASURE_SPECS`. |

The option `key` is also an option of `packPortfolio`. Without `key` and `members`, the output does not change.

### The aspect fit

Roadmap item k62 adds `aspectFit(strategy, { targetAspect })`. It wraps a strategy for a container of free size. It is opt-in. No default uses it.

```ts
const fit = aspectFit(strategy("maxrects"), { targetAspect: 16 / 9 });
const output = fit.pack(input, { rule: "bl" }, createContext(1));
const same = packWith("aspect-fit", input, { strategy: "maxrects", options: { rule: "bl" } });
```

- A container of fixed size gives the output of the wrapped strategy, with no change.
- The target is `targetAspect`, else `aspect` of the container, else 1.
- A free height (`fixed: "width"`) keeps its width. A free width uses the same search on the swapped axes.

For a free size, the function makes a portfolio of widths around the target. It packs with the wrapped strategy at each width.

1. Member 0 is the output of the wrapped strategy on the input. Thus its own search for the size is always a candidate.
2. The ideal width is `sqrt(A * target)`. `A` is the hull area of the member 0 output.
3. Each factor of `ASPECT_FIT_FACTORS` (0.86 to 1.16) gives a width: the factor times the ideal width, plus the inset on the 2 sides.
4. A width is never below the widest item with its margins. Equal widths become one member. Thus there are 8 members or fewer.
5. A member packs with `fixed: "width"` at its width. A shape that is not a rectangle becomes a strip at the same origin, with the same holes.
6. The output of a member gets the size of its content, as a free container has.

`portfolio` of the contract picks the best member by the levels of `ASPECT_FIT_LEVELS`:

| Level | Why |
|---|---|
| `hard` | A hard break is the worst failure. The pick uses `exactContainer`. |
| `pack.overflow.excessArea` | Overflow above its bound is the worst failure that is not hard. |
| `pack.aspectError` | The aim of the wrapper. It compares the hull with the target. Values within 0.01 are a tie. |
| `pack.area` | The least area among the ties of the aspect. Values within 1% are a tie. |

- The measures read the input with `aspect` set to the target. Thus `pack.aspectError` uses the target of the wrapper.
- The output gets the trace stage `aspect-fit` (`ASPECT_FIT_STAGE`). Its measure `move.aspectPick` is 1 when the pick is not member 0.
- The id of the result is `aspect-fit(<id>)`. It keeps the family, the supports, the defaults and `deterministic` of the wrapped strategy.
- The composite strategy `aspect-fit` of the registry takes the options `strategy`, `options` and `targetAspect`.

### The feature select

Roadmap item k66 (part 2) adds the composite strategy `select`. It reads 4 cheap features of the input, walks a small decision table and packs with exactly one member. It is opt-in. No default uses it.

```ts
const output = packWith("select", input); // the members rows and maxrects-bl, with SELECT_TABLE
const leaf = selectLeaf(selectFeatures(input)); // { leaf, pick }
```

`selectFeatures(input)` gives the features in one pass over the items and the obstacles:

| Feature | Value |
|---|---|
| `count` | The count of the items. |
| `fixed` | `true` when the container has `fixed: "size"`. |
| `rect` | `true` when the container is a rectangle with no obstacle of another shape. |
| `spread` | `spreadOf`: the standard deviation of `ln(sqrt(w * h))` over the items. |

`SELECT_TABLE` is data with comments. It has 3 levels and 7 leaves. Pick 0 is `rows`, and pick 1 is `maxrects` with the rule `bl`:

| Leaf | Path | Pick | Wins of `maxrects-bl` in the training records |
|---:|---|---|---:|
| 0 | fixed, count below 317, spread below 0.02 | `rows` | 0 of 15 |
| 1 | fixed, count below 317, spread 0.02 or more | `maxrects-bl` | 635 of 850 |
| 2 | fixed, count 317 or more, spread below 0.27 | `rows` | 10 of 210 |
| 3 | fixed, count 317 or more, spread 0.27 or more | `maxrects-bl` | 184 of 210 |
| 4 | free, spread below 0.27 | `rows` | 49 of 490 |
| 5 | free, spread 0.27 or more, a rectangle | `rows` | 7 of 50 |
| 6 | free, spread 0.27 or more, another shape | `maxrects-bl` | 172 of 200 |

- The fit used all seeds of `pack-screen-v1` and `pack-free-v1`. A win is a fill ratio of 1.05 or more with no added hard break.
- The fit tests the run-time features against the wins, not the generator labels of the inputs.
- Each threshold is in a plateau of the training accuracy. The table takes the value that other code uses: `SPREAD_THRESHOLDS` and the end of the band `100` of `countCell`.
- The option `members` replaces the members, and the option `table` replaces the table. `checkSelectTable` refuses a path of more than 3 tests, a bad pick and a threshold that is not a number.
- The output gets the trace stage `select` (`SELECT_STAGE`) as its last stage. Its measures are `move.select`, `select.member`, `select.pick.<id>`, `select.leaf` and the 4 feature values.
- The measure `move.select` is 1 when the pick is not member 0. A flag feature is 1 for `true`, and `select.spread` has 3 decimals.

### The random restarts

Roadmap item k78 adds the composite strategy `restarts` (catalog row `search-random-restart`, Yang 2013). It packs with one member in some random orders and keeps the best output. It is opt-in. No default uses it.

```ts
const output = packWith("restarts", input); // 16 restarts of maxrects-bl, the change swap
const rows = packWith("restarts", input, { member: "rows", iterations: 32, perturb: "shuffle-blocks" }, 7);
```

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. The strategy has the option `sortOrder`. |
| `iterations` | 16 | The count of the restarts, restart 0 included. A whole number of 1 or more. |
| `perturb` | `swap` | The change of the order: `swap`, `shuffle-blocks` or `shuffle` (`RESTART_PERTURBS`). |
| `strength` | 0.1 | The share of the positions that move, from 0 to 1. |
| `key` | the key of `PORTFOLIO_LEVELS` | The measure ids of the key after the hard breaks, as for `packPortfolio`. |
| `limitTime`, `budgetMs` | `false`, none | With `limitTime`, the time limit `budgetMs` cuts the later restarts. Restart 0 always starts. |
| `budgetWork` | none | The work limit in work units ("The work budget"). Restart 0 always starts. A cut is the same on each computer. |

- Restart 0 is the member with its options. Thus the result is not worse than the member on the key. A tie keeps the earlier restart.
- The order of the member is the rank order of the items, then a stable sort by its `sortOrder`. The sizes have the margins and the gap.
- Each later restart changes that order, and packs a copy of the input with the items in the new order and no rank. The member gets the sort order `input`. The ids stay.
- `swap` makes `ceil(strength * n / 2)` random swaps of two adjacent items, at least 1.
- `shuffle-blocks` shuffles each block of near-equal keys. The keys of a block differ from its first key by `strength` of that key or less.
- `shuffle` gives a full random order. It does not read `strength`.
- Restart `i` gets the random numbers `stepRandom(seed, "restarts:<i>")` of the contract. The same seed gives the same output and the same trace measures.
- The output gets the trace stage `restarts` (`RESTARTS_STAGE`). Its measures are `move.restartPick`, `restarts.run` (the index of the pick) and `restarts.runs`.
- The cost of one call is `iterations` packs of the member, and the key of each output.

### The work budget

Roadmap item k117 adds a work limit to `packPortfolio`, the strategy `portfolio` and the strategy `restarts`. It is opt-in. No default uses it.

```ts
const output = packWith("restarts", input, { budgetWork: 16000 }); // the same restarts on each computer
const pick = packPortfolio(["rows", "skyline"], { budgetWork: 5000 }).pick(input);
```

The time limit `budgetMs` reads the clock. Thus a cut by it can give a different output on a different computer. The work limit counts work units, not milliseconds. Thus the output is a function of the input, the config and the seed.

The work unit is one item in one pack of a single strategy. `packWork(input, output)` gives the work of one output:

- The work is the item count of the input, at least 1, times the count of the packs.
- The count of the packs is 1, plus the measure `pack.search.widths` of each trace stage. Thus the size search `log-sweep` counts each width that it tried.
- An output with the measure `work.spent` comes from a composite with a work limit. Then `packWork` gives that value.

Why this unit:

- Each member reports it with no new code: the item count is in the input, and `pack.search.widths` is in the trace of each output.
- It follows the cost. A pack of a free container tries some 60 widths, so it costs some 60 times more than a pack of a fixed container.
- A count of the placements that each strategy tried needs a new counter in each strategy. The item count of each pack is a good enough estimate for a limit.

The stop rule:

1. Member 0 (restart 0) always runs. A member that starts always finishes.
2. Before member `i` above 0 starts, the composite compares the work of the members that ran with `budgetWork`. When the work is equal to `budgetWork` or more, member `i` and each later member get the status `cut`.
3. A member that throws costs its item count, at least 1.
4. The pick uses only the members that ran, with the same key and the same tie rules as with the time limit. A tie keeps the earlier member.

- With `budgetMs` too, the limit that ends first cuts. When the work limit cuts first, the flag `deterministic` of the trace stays `true`.
- A large `budgetWork` gives the output of the run with no limit. A small `budgetWork` gives the same partial output on each call.
- With `budgetWork`, the trace stage `portfolio` or `restarts` also has `work.spent`, `work.budget` and `work.stopped`. The value of `work.stopped` is 1 when the limit cut a member.
- The option `budgetWork` is a whole number of 0 or more. Another value causes a `RangeError`.
- A composite member with no work limit counts only the packs of its winner. Only a member with `budgetWork` reports its full work.

In `packSpace`, the options `portfolio`, `cell-portfolio` and `restarts` have the switch param `limitWork` (default `false`) and the param `budgetWork`. The param `budgetWork` is an enum of the 4 values 4000, 16000, 64000 and 256000, with the default 16000. The option `budgetWork` of a strategy takes each whole number. Thus no default config has a work limit.

The counts of `spaceSize` changed with k117. Only the meta configs changed:

| `spaceSize` | Before k117 | Since k117 |
|---|---:|---:|
| `base`, 3 levels and 1 level | 2973 and 891 | 2973 and 891 |
| `meta`, 3 levels | 37049239404514333362 | 185246197022536252434 |
| `meta`, 1 level | 13341577899037878 | 66707889492003174 |
| `meta` for `rect`, 3 levels | 36862574914409402550 | 184312874572011669750 |
| `meta` for `rect`, 1 level | 13266726236504962 | 66333631179345730 |
| `meta` for `circle` or `polygon`, 3 levels and 1 level | 5940 and 1780 | 5940 and 1780 |

- The work limit gives 5 param points at each level count: no limit, then the 4 values of `budgetWork`. The options `bbox`, `select` and `aspect-fit` do not change.
- The meta count with 3 levels is more than `10n ** 20n`. Thus `spaceSize` gives it only with a `maxMeta` of `10n ** 21n` or more.

### Shapes by their bounding boxes

Roadmap item k91 adds the composite strategy `bbox` (catalog row `bbox-shapes`, idea S2 of the survey). It packs items of each shape kind: `rect`, `polygon`, `circle` and `free`. It is opt-in. No default uses it.

```ts
const output = packWith("bbox", input); // maxrects-bl on the bounding boxes
const lower = packWith("bbox", input, { member: "skyline", turn: true });
```

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. |
| `turn` | `false` | With `true`, `bbox` turns each turnable item that is not locked. Then the member gets no turnable item. |

- The member packs one rectangle for each item: the bounding box of its shape (`boundsOf` of the contract). The margin and the other fields stay.
- The placement of an item is the place of its box minus the offset of the bounding box. Thus each shape is inside its box.
- Thus no two shapes overlap when no two boxes overlap. `packHard` of the contract tests the bounding boxes, so its count is safe.
- `PACK_HARD_RULES` of the contract declares `no-overlap` and `in-container` with a safe count on `polygon`, `circle` and `free`. `ruleLevel` gives `safe` for them.
- `packConfig` checks a `bbox` config with `checkShapes` at the level `safe`. Each other config gets the strict check, so it refuses a shape.
- A locked item keeps its position. Its box is at the position plus the offset.
- With `turn`, a turn wins when its box area is smaller, then when its box is lower. A tie keeps the item unturned.
- A turn of 90 degrees does not change the area of a bounding box. Thus only the lower box decides a turn.
- Without `turn`, the member decides the turns. A turn of the member turns the shape.
- An input with no shape and without `turn` gives the output of the member, byte for byte.
- The measures of the box area stay `rect` only (roadmap item k75). The measure `pack.shapeFill` gives the shape area with `boxArea` of the contract.
- On a `free` shape, `pack.shapeFill` is an upper bound (contract 0.2.17). `checkShapes` accepts it there only at the level `bound`.
- `packConfig` does not check the measures of a `bbox` config. Thus the level `safe` of the hard rules stays, and a free shape packs.
- The measures read the box that `bbox` places for a shape item: the bounding box of the shape at its place, not `w` by `h` (roadmap item k113).
- Thus the hull, `pack.fill`, `pack.whitespace`, the overflow measures and `pack.shapeFill` use the same boxes. Each share stays from 0 to 1.
- In `packSpace`, the option `combine.bbox` supports each shape kind. Its members have `view: "bounds"`, so `checkConfig` checks them with the kind `rect`.
- Thus `spaceSize` with a shape kind counts the `bbox` configs: 5940 meta configs with 3 levels, and 1780 with 1 level.
- With `polygon` or `free` it counts 0 base configs. With `circle` it counts the base configs of `hole-degree` (roadmap item k90).

### Circles by the maximum hole degree

Roadmap item k90 adds the single strategy `hole-degree` (catalog row `circle-hole-degree`, idea S1 of the survey). It packs circle items directly, not their bounding boxes. It is opt-in. No default uses it.

```ts
const output = packWith("hole-degree", input); // 8 halving steps of the height
const strip = packWith("hole-degree", input, { steps: 0 }); // the open strip only
```

| Option | Default | Value |
|---|---|---|
| `steps` | 8 | The count of the halving steps of the height search, from 0 to 32. A container of fixed size does not read it. |

The rule is A1.0 of Huang, Li, Akeb and Li 2005 (`Huang 2005` in [`CATALOG.md`](research/CATALOG.md)):

1. A corner place of a circle touches two items: two placed circles, a placed circle and a side, or two sides. It overlaps no item.
2. The hole degree of a corner place is `1 - d / R`. `R` is the radius of the circle. `d` is the least distance to the other items and the sides.
3. The "other items" are each item but the two items of the corner. Thus a hole degree of 1 tells that a third item also touches the circle.
4. At each step, the strategy examines each corner place of each unplaced circle. The place with the largest hole degree wins.
5. The run stops when each circle has a place, or when no circle has a corner place. A circle with no place goes to the overflow.

The rest is a choice of this project:

- A tie of the hole degree goes to the larger circle, then to the lower `y`, then to the lower `x`, then to the earlier item of the input.
- The first step has only the corner places of two sides. Thus the first circle goes into a corner of the container.
- For a container of free height, the first run has an open bottom. Its height is the high bound of a search.
- The low bound is the largest diameter, or the circle area over the width when that is more. Each step halves the range.
- A step that places each circle sets the high bound, else the low bound. The output is the lowest run that placed each circle.
- `R` is the radius plus the largest side of the margin plus half the gap. Thus two circles are `mA + gap + mB` apart, as in decision 3.
- A pair of `pairGaps` has its centers apart by the two radii and its gap, or by the two `R` when that is more.
- The sides of the container are the container less the inset, grown by half the gap. Thus a circle is apart from a side by its margin and the inset.
- The placement of an item is the center of the circle minus the center of the shape in the box. The output never turns an item.
- The strategy reads no random number and no clock. The trace has the time of the run and the count of the runs, `holeDegree.runs`.

The checks:

- `circleOverlaps(input, output)` counts the pairs of circles that overlap, by the distance of their centers. Its count is exact.
- `packHard` of the contract tests the bounding boxes. Two circles that touch on a diagonal have boxes that overlap. Thus its `no-overlap` count on circles is only safe.
- The count `in-container` of `packHard` is exact for a circle in a rectangle. Its bounding box touches the sides at the same points.
- `packConfig` checks a `hole-degree` config with `checkShapes` at the level `safe`, as a `bbox` config.

In `packSpace`, the option `placement.hole-degree` has the param `steps` and supports only `circle`. Constraints keep the order `input` and the size search `none` with it.
The order `input` and the options `none` support `rect` and `circle`. The count changes:

| Count | Before k90 | After k90 |
|---|---|---|
| Base configs, 3 levels | 2970 | 2973 |
| Base configs, 1 level | 890 | 891 |
| Meta configs, 3 levels | 36862574914409402550 | 37049239404514333362 |
| Meta configs, 1 level | 13266726236504962 | 13341577899037878 |
| Base and meta configs for `circle`, 3 levels | 0 and 5940 | 3 and 5940 |
| Base and meta configs for `rect`, 3 levels | 2970 and 36862574914409402550 | the same |

The meta counts with 3 levels are more than the default `maxMeta` of 1e18. Thus `spaceSize` gives them only with a larger `maxMeta`, for example `10n ** 20n`. Since k117, the count needs `10n ** 21n` ("The work budget").
The size search `none` goes only with `push` and `hole-degree`. Each other placement, `guillotine` too, needs `log-sweep`, as before k90.

The limits:

- It supports only circle items. An item with no shape is a rectangle. A rect, a polygon or a free shape throws `UnsupportedCell`.
- It supports only a rectangle container of fixed size or of fixed width. Obstacles and locked items throw `UnsupportedCell`.
- The margin of a circle is a ring with the largest side of its margin. A margin with different sides is larger than the item asks.
- It has no look-ahead step (A1.5 of the paper) and one start only. It does not try other first circles.
- The cost of one run grows with about the cube of the count of circles. The height search makes `steps + 1` runs.
- `strategies` does not have it, because each corpus of the benchmark has only rect items. `shapeStrategies` has it, and `strategy(id)` finds it.

The circle family of `bench/shape-inputs.ts` (seeds 1 to 5, 30 circles) gives this mean `pack.shapeFill` (`bench/hole-degree.test.ts`):

| Container | `hole-degree` | `bbox-maxrects-bl` | `bbox-skyline` |
|---|---|---|---|
| Free height | 0.816 | 0.692 | 0.631 |
| Square of fixed size | 0.673 | 0.692 | 0.631 |

On a square, `hole-degree` fills the 4 corners first. Thus its hull is the full square, and the hull of a `bbox` member is smaller.

### The goal-driven ruin and recreate

Roadmap item k79 adds the composite strategy `ruin-recreate` (catalog row `search-ruin-recreate`, idea R5 of the survey). It is opt-in. No default uses it.

```ts
const output = packWith("ruin-recreate", input); // 64 iterations around maxrects-bl
const chain = packWith("ruin-recreate", input, { member: "skyline", ruin: "adjacent", strength: 0.5 }, 7);
```

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. The strategy has the option `sortOrder`. |
| `iterations` | 64 | The count of the ruins. A whole number of 0 or more. With 0, the output is the output of the member. |
| `ruin` | `mixed` | The ruin: `region`, `random`, `adjacent`, or `mixed` for one of the three at random (`RUIN_KINDS`). |
| `strength` | 0.3 | The largest share of the placed items that one ruin removes, from 0 to 1. One ruin removes 1 item or more. |
| `shrink` | 0.005 | The share by which a met goal makes the free side of the goal box smaller, from 0.001 to 0.5. |

The search:

1. The member packs the input. Its layout is the first layout and the first best layout.
2. A ruin removes `k` placed items. `k` is a random whole number from 1 to `ceil(strength * placed count)`.
3. `region` removes the `k` items nearest to a random point of the goal box. `random` removes `k` random items.
4. `adjacent` starts at a random item. Each next item is the item nearest to the last one, by the distance between their boxes.
5. The recreate packs the removed items and the unplaced items with the member. The kept items are locked items of that input.
6. The recreate order is the rank order and the `sortOrder` of the member, or a random order with the sort order `input`. Each one has the chance 0.5.
7. The search accepts a candidate that is not worse than the current layout. A candidate that is better than the best layout becomes the best layout.

The compare of two layouts is the pick of `restarts`:

- The key is the hard breaks, then the levels of `PORTFOLIO_LEVELS`: `pack.overflow.excessArea`, then `pack.fill`. `selectBest` of the contract compares the two layouts.
- A tie on each level keeps the current layout or the best layout. Thus a tie is accepted, but it is not a new best layout.
- The key is the same for each container. A fixed container does not rank by the count of placed items first.

The goal:

- A container of fixed size has no goal box. The search stops early when each item is placed.
- On a free side, the goal is a box of fixed size. Its first size is the size of the member output, with the free side smaller by `shrink`.
- The recreate packs into the goal box. An item outside the box is unplaced, and the next ruins try to place it.
- When each item of the member layout is in the goal box, the goal is met. The search keeps the layout when the key finds it better.
- Then the free side of the goal box gets smaller by `shrink` again. The items outside the new box become unplaced.
- With `fixed: "none"`, the goal box shrinks its long side for the target aspect. The search stops when no free side can shrink.
- A free side does not shrink below the far edges of the locked items and the obstacles.

The rules of the output:

- Locked items and obstacles stay at their places. A ruin never removes them. A movable obstacle and a group give `UnsupportedCell`.
- The supports are the union of the supports of the 5 placement strategies, with the fixed obstacles and the free or soft order.
- A cell that the member does not support gives `UnsupportedCell` from the member.
- In a free container with a polygon shape, the goal box is a rectangle. The holes of the polygon become obstacles of the recreate.
- A free container keeps the overflow of the member. In each container, the output is not worse than the output of the member by the key.
- The output is the output of the member when no candidate is better. Else it is the best layout, with the placements in rank order.
- Iteration `i` gets the random numbers `stepRandom(seed, "ruin-recreate:<i>")` of the contract. The same seed gives the same output, byte for byte.
- The budget is the count `iterations`. The strategy reads no clock.
- `iterations` is already a budget of work with no clock. Thus `ruin-recreate` has no option `budgetWork`.
- The output gets the trace stage `ruin-recreate` (`RUIN_RECREATE_STAGE`). Its measures are in the table below.
- The cost of one call is at most `iterations` packs of the member. Each pack has only the removed items and the unplaced items.

| Measure | Value |
|---|---|
| `move.ruinRecreate` | The count of the new best layouts. 0 means that the output is the output of the member. |
| `ruin-recreate.iterations` | The count of the iterations that ran. The search stops before `iterations` when it has no goal. |
| `ruin-recreate.accepted` | The count of the accepted candidates. |
| `ruin-recreate.goalSteps` | The count of the met goals. In a fixed container, the count of the accepted candidates that placed more items than the best. |
| `ruin-recreate.bestAt` | The iteration of the best layout, or 0 for the member layout. |

The choices of this project that differ from the sources:

- This strategy follows only the general method of the two sources: a goal that becomes harder after each success, and a ruin and recreate search toward it.
- Gardeyn & Wauters (EJOR 2022) pack bins of some sizes with guillotine cuts. This strategy packs one container, with no bins and no guillotine rule.
- Wei, Oon, Zhu & Lim (EJOR 2013) set a goal for bins. This strategy sets a goal box for each free side of one container.
- The recreate uses the member of the strategy. It does not use a placement rule of the sources.
- The three ruins, the shrink factor and the random recreate order are the choices of this project.
- The acceptance rule is the pick key of `restarts`, not a rule of the sources.
- The budget is a count of iterations, not a time limit. Thus the output does not depend on the clock.

A local comparison (2026-10-28) used 180 inputs of the classes corpus: the counts 20, 40 and 60, with the seeds 1 to 3.
The inputs are 90 fixed containers and 90 `freeHeight` containers. The table gives the medians of `pack.fill` and `pack.gap`, and the mean of `pack.overflow.rate`.
The CI benchmark measures the entries on the full corpus.

| Entry | Fill, all | Gap, all | Fill, fixed | Gap, fixed | Overflow rate, fixed | Fill, free | Gap, free |
|---|---|---|---|---|---|---|---|
| `maxrects-bl` | 0.9025 | 0.0800 | 0.9525 | 0.0515 | 0.6529 | 0.8750 | 0.1110 |
| `restarts-maxrects-bl-k16` | 0.9230 | 0.0685 | 0.9585 | 0.0460 | 0.6529 | 0.8900 | 0.0895 |
| `ruin-recreate-maxrects-bl-k64` | 0.9130 | 0.0670 | 0.9595 | 0.0435 | 0.6299 | 0.8775 | 0.1030 |
| `skyline` | 0.8665 | 0.1375 | 0.9460 | 0.0585 | 0.6677 | 0.7790 | 0.2110 |
| `ruin-recreate-skyline-k64` | 0.8675 | 0.1300 | 0.9495 | 0.0565 | 0.6584 | 0.7815 | 0.2045 |

- In fixed containers, `ruin-recreate-maxrects-bl-k64` has the best fill, the smallest gap and the lowest overflow rate of the five entries.
- In `freeHeight` containers, `restarts-maxrects-bl-k16` is better. The goal box of `ruin-recreate` improves the member by a small step only.
- An earlier rule ranked a fixed container by the count of placed items first. It gave the fill 0.8780 and the gap 0.1415 for fixed containers.

The CI benchmark (run 40805929127, 2026-10-29) used the 500 inputs of `pack-classes-v1`. The table gives the median `pack.gap`.

| Entry | Gap, all | Gap, fixed | Gap, free |
|---|---|---|---|
| `maxrects-bl` | 0.0610 | 0.0350 | 0.0850 |
| `restarts-maxrects-bl-k16` | 0.0540 | 0.0310 | 0.0750 |
| `ruin-recreate-maxrects-bl-k64` | 0.0550 | 0.0310 | 0.0840 |
| `skyline` | 0.1240 | 0.0490 | 0.2030 |
| `ruin-recreate-skyline-k64` | 0.1150 | 0.0470 | 0.1990 |

- The run has 0 hard breaks and 0 results that are not deterministic.
- In fixed containers, `ruin-recreate-maxrects-bl-k64` is level with `restarts-maxrects-bl-k16`.
- In `freeHeight` containers, it gains only 0.001 on its member. The `restarts` entry gains 0.010.

The counts of `packSpace`:

- `combine` gets the option `ruin-recreate` with 1 member and the params `iterations`, `ruin`, `strength` and `shrink`.
- The named configs are `ruin-recreate`, `ruin-recreate-maxrects-bl-k64` and `ruin-recreate-skyline-k64`. The benchmark has the last two as entries.
- Each base config gives 108 new meta configs with 3 levels: 3 values of `iterations`, 4 of `ruin`, 3 of `strength` and 3 of `shrink`.
- With 1 level, each base config gives 4 new meta configs, one for each value of `ruin`. The table gives the counts before k79 and since k79.

| `spaceSize` | Before k79 | Since k79 |
|---|---|---|
| 3 levels, `maxMeta: 10n ** 21n` | 185246197022536252434 | 185246197022536573518 |
| 1 level | 66707889492003174 | 66707889492006738 |
| 3 levels, `shapes: ["rect"]` | 184312874572011669750 | 184312874572011990510 |
| 1 level, `shapes: ["rect"]` | 66333631179345730 | 66333631179349290 |

- The base configs stay 2973 and 891, and 2970 and 890 for `rect`. The counts for the other shape kinds do not change.
- `ENTRIES` of the benchmark: 30 before, 32 after. `composites`: 5 before, 6 after. The meta options of `spaceCounts`: 6 before, 7 after.
- The test of `rect-scattered` in `src/corpus.test.ts` counts only the single strategies. Its count stays 6.

### The overlap minimization

Roadmap item k80 adds the composite strategy `overlap-min` (catalog row `nest-gls-overlap`, idea R6 of the survey). It is opt-in. No default uses it.

```ts
const output = packWith("overlap-min", input); // 8192 moves around maxrects-bl
const strip = packWith("overlap-min", input, { member: "skyline", iterations: 2048, step: 0.02 }, 7);
```

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. The member packs the first layout. |
| `iterations` | 8192 | The largest count of the box moves. A whole number of 0 or more. With 0, the output is the output of the member. |
| `step` | 0.01 | The share by which each cut makes the strip shorter, from 0.001 to 0.5. |

The search:

1. The member packs the input. Its layout is the first layout. The length of the strip is the size of its free side.
2. A cut makes the strip shorter by `step` of its length. The boxes that stick out move back into the strip.
3. Each pass takes the boxes that overlap in a random order. Each one moves along the fixed axis, then along the free axis.
4. A move puts the box at the place of the least weighted overlap on that axis. The weight of a pair is `1 + penalty`.
5. An exact sweep over the breakpoints of the overlap finds that place, as in Egeblad 2007. A tie keeps the box at its place, then takes the lowest place.
6. A pass with no move is a local minimum. Then the pair with the largest `overlap / (1 + penalty)` gets a penalty 1 higher.
7. When no box overlaps, the cut is accepted, and the next cut starts. `checkHard` checks each accepted layout.
8. The search stops when a cut fails, when the moves reach `iterations`, or when the box area does not fit in a shorter strip.
9. The output is the last accepted layout, or the output of the member when no cut is accepted.

The rules of the output:

- Only a container with a free height or a free width is supported. A fixed size, `fixed: "none"` and a free area give `UnsupportedCell`.
- Locked items and obstacles stay at their places. They count in the overlap. A movable obstacle and a group give `UnsupportedCell`.
- Each box is the box of the frame: the margin, half the gap and the pad of `pairGaps` on each side. Thus the output keeps each gap.
- A box keeps the turn of the member. A box that does not move keeps the place of the member, byte for byte.
- A container shape with a free side uses its bounding box. The holes of a polygon become obstacles. Other obstacles use their bounding boxes.
- The supports are the union of the supports of the 5 placement strategies, with the fixed obstacles and the free or soft order.
- A free container keeps the overflow of the member. The output is never longer than the output of the member.
- Cut `t` gets the random numbers `stepRandom(seed, "overlap-min:<t>")` of the contract. The same seed gives the same output, byte for byte.
- The budget is the count `iterations`. The strategy reads no clock. Thus `overlap-min` has no option `budgetWork`.
- The output gets the trace stage `overlap-min` (`OVERLAP_MIN_STAGE`). Its measures are in the table below.

| Measure | Value |
|---|---|
| `move.overlapMin` | The count of the accepted cuts. 0 means that the output is the output of the member. |
| `overlap-min.iterations` | The count of the box moves. |
| `overlap-min.tries` | The count of the cuts that the search tried. |
| `overlap-min.cuts` | The count of the accepted cuts. |
| `overlap-min.raises` | The count of the penalty raises at the local minima. |
| `overlap-min.length` | The length of the output strip divided by the length of the member strip. |

The sources are Egeblad, Nielsen & Odgaard (EJOR 2007), Umetani et al. (EJOR 2009) and Imamichi, Yagiura & Nagamochi (Discrete Optimization 2009).
The choices of this project that differ from the sources:

- This strategy packs rectangles only. The overlap of two boxes is the product of the overlaps of their spans. The sources pack polygons.
- The objective is the sum of `(1 + penalty) * overlap` over the pairs, as the weights of Umetani 2009. Egeblad 2007 adds a separate penalty term.
- The penalties go back to 0 at each cut. Each local minimum raises one pair only.
- Only the boxes that overlap move. The order of a pass is random. The search has no swap moves and no turn moves.
- The search stops at the first failed cut. It does not make the strip longer, as the iterated local search of Imamichi 2009 does.
- The budget is a global count of moves, not a time limit. Thus the output does not depend on the clock.
- The area bound and the check by `checkHard` of each accepted layout are the choices of this project.

A local comparison (2026-10-28) used 180 inputs of the classes corpus: the counts 20, 40 and 60, with the seeds 1 to 3.
The inputs are 90 fixed containers and 90 `freeHeight` containers. `overlap-min` refuses the fixed containers.
The table gives the medians of `pack.fill` and `pack.gap`, and the median time of one pack of a free container. The run had 0 hard breaks.

| Entry | Fill, fixed | Gap, fixed | Fill, free | Gap, free | Time, free (ms) |
|---|---|---|---|---|---|
| `maxrects-bl` | 0.9526 | 0.0516 | 0.8751 | 0.1110 | 0.1 |
| `skyline` | 0.9460 | 0.0588 | 0.7791 | 0.2108 | 0.1 |
| `restarts-maxrects-bl-k16` | 0.9612 | 0.0443 | 0.8894 | 0.0897 | 2.4 |
| `ruin-recreate-maxrects-bl-k64` | 0.9580 | 0.0471 | 0.8805 | 0.1075 | 6.2 |
| `overlap-min-maxrects-bl-k8192` | refused | refused | 0.9038 | 0.0739 | 65 |
| `overlap-min-skyline-k8192` | refused | refused | 0.8923 | 0.0826 | 68 |

- In `freeHeight` containers, `overlap-min-maxrects-bl-k8192` has the best fill and the smallest gap of the six entries.
- `overlap-min-skyline-k8192` lifts the fill of `skyline` from 0.779 to 0.892, past `restarts-maxrects-bl-k16`.
- More moves give more fill: 2048 moves gave 0.8868, 4096 gave 0.8938, and 16384 gave 0.9117, for the member `maxrects-bl`.
- A `step` of 0.005 or 0.02 gave about the same fill as 0.01.
- The cost is about 30 times the cost of `restarts-maxrects-bl-k16`.

The CI record (2026-10-29, run 40810164430) used the 500 inputs of `pack-classes-v1`: 250 fixed and 250 `freeHeight` containers.
The table gives the medians. The run had 0 hard breaks, and each record was deterministic. Both entries of `overlap-min` refused the 250 fixed containers.

| Entry | Fill, fixed | Gap, fixed | Fill, free | Gap, free | Time, free (ms) |
|---|---|---|---|---|---|
| `maxrects-bl` | 0.9680 | 0.0350 | 0.8870 | 0.0850 | 0.1 |
| `skyline` | 0.9600 | 0.0490 | 0.7810 | 0.2030 | 0.1 |
| `restarts-maxrects-bl-k16` | 0.9730 | 0.0310 | 0.8960 | 0.0750 | 2.9 |
| `overlap-min-maxrects-bl-k8192` | refused | refused | 0.9070 | 0.0660 | 177 |
| `overlap-min-skyline-k8192` | refused | refused | 0.8920 | 0.0830 | 187 |

- In `freeHeight` containers, `overlap-min-maxrects-bl-k8192` has the smallest gap: 0.066, against 0.075 for `restarts-maxrects-bl-k16` and 0.085 for its member.
- `overlap-min-skyline-k8192` cuts the gap of `skyline` from 0.203 to 0.083.
- The cost in CI is about 60 times the cost of `restarts-maxrects-bl-k16`.

The counts of `packSpace`:

- `combine` gets the option `overlap-min` with 1 member and the params `iterations` (64 to 65536) and `step` (0.001 to 0.5).
- The named configs are `overlap-min`, `overlap-min-maxrects-bl-k8192` and `overlap-min-skyline-k8192`. The benchmark has the last two as entries.
- Each base config gives 9 new meta configs with 3 levels: 3 values of `iterations` and 3 of `step`.
- With 1 level, each base config gives 1 new meta config. The table gives the counts before k80 and since k80.

| `spaceSize` | Before k80 | Since k80 |
|---|---|---|
| 3 levels, `maxMeta: 10n ** 21n` | 185246197022536573518 | 185246197022536600275 |
| 1 level | 66707889492006738 | 66707889492007629 |
| 3 levels, `shapes: ["rect"]` | 184312874572011990510 | 184312874572012017240 |
| 1 level, `shapes: ["rect"]` | 66333631179349290 | 66333631179350180 |

- The base configs stay 2973 and 891, and 2970 and 890 for `rect`. The counts for the other shape kinds do not change.
- `ENTRIES` of the benchmark: 32 before, 34 after. `composites`: 6 before, 7 after. The meta options of `spaceCounts`: 7 before, 8 after.
- The test of `rect-scattered` in `src/corpus.test.ts` counts only the single strategies. Its count stays 6.
- The strata of k115 (`strataOf`): 19 before, 20 after. The new stratum is `overlap-min:1`.
- The tests that pack each entry on a fixed container now expect `UnsupportedCell` from the entries of `overlap-min`.

### The relax pass

Roadmap item k124 adds the composite strategy `relax` (catalog row `overlap-vpsc`, Dwyer 2006). It is opt-in. No default uses it. The code is `src/relax.ts`.

A packer of the bottom-left family puts the boxes in the top-left corner of a fixed container. The bottom strip stays empty (k123: the median `pack.balance.sideRange` on fixed containers is 0.66 to 0.91). The pass moves the boxes so that the slack is even, with no overlap and no change of the placed set.

```ts
const output = packWith("relax", input); // relax over maxrects-bl
const spread = packWith("relax", input, { member: "rows", strength: 0.5 });
```

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. The member packs the first layout. |
| `strength` | 1 | The share of the move to the target, from 0 to 1. With 0, the output is the output of the member. |

The pass:

1. The member packs the input. Its layout is the first layout.
2. The pass does one axis at a time: x, then y. A free side has no slack, so the pass does not move the boxes on that axis.
3. **The target.** A linear map takes the extent of the boxes onto the container less the margins. Each box keeps its share of the free play: the near box goes to the near wall, and the far box to the far wall. The target is blended with the first position by `strength`.
4. **The constraints.** For each pair of boxes that overlap on the other axis, the pass keeps their order: "a is before b by at least the sum of the half sizes and the gap". The walls of the container are bounds.
5. **The solve.** The satisfy step of VPSC visits the boxes in their order. It joins the boxes of a broken constraint into one block at the mean of their targets. An obstacle, a locked box and the walls are fixed.
6. **The guard.** `checkHard` examines the result. On a hard break, the output is the output of the member.

The rules:

- The first layout has no overlap, so the constraints have a solution: the first positions.
- The x pass keeps the y positions. A pair with no constraint on x stays apart on y. So the x pass makes no overlap. The y pass is the same.
- The pass does not add or remove a box. So the placed set, the unplaced count and the output size do not change.
- `pack.fill` reads the hull of the boxes. The spread hull is larger, so `pack.fill` falls on a fixed container.
- The pass reads no seed. So `pack.stability.seed` is 0.
- The scan for the constraints is O(n^2). Above `RELAX_MAX_CONSTRAINTS` (200000) on one axis, the output is the output of the member.
- The satisfy step does not split a block again. So the result keeps all the constraints, but it is not always the least-squares optimum.
- The trace stage `relax` has `move.relax` (the moved boxes), `relax.constraints` and `relax.fallback`.

The counts of `packSpace`:

- `combine` gets the option `relax` with 1 member, `RECT_ONLY` and the param `strength`. The named configs are `relax` and the 3 entries `RELAX_ENTRIES`.
- With 3 levels, each base config gives 3 new meta configs. With 1 level, it gives 1.

| `spaceSize` | Before k124 | Since k124 |
|---|---|---|
| 3 levels, `maxMeta: 10n ** 21n` | 185246197022537804340 | 185246197022537813259 |
| 1 level | 66707889492020994 | 66707889492021885 |
| 3 levels, `shapes: ["rect"]` | 184312874572013220090 | 184312874572013229000 |
| 1 level, `shapes: ["rect"]` | 66333631179363530 | 66333631179364420 |

The bench (prediction `packing-k124-relax`): rows, maxrects-bl and skyline-bl-waste, each alone and in `relax`, on `pack-screen-v1`. The measures are the balance measures, fill, the order inversions, the time and the hard breaks.

### The searches over orders

Roadmap item k26 adds three composite strategies that search the order of the items: `anneal`, `genetic` and `tabu`. They are opt-in. No default uses them.

```ts
const output = packWith("anneal", input); // 64 packs of maxrects-bl
const sky = packWith("genetic", input, { member: "skyline", iterations: 32, population: 4 }, 7);
const turns = packWith("tabu", input, { member: { id: "maxrects-rot", strategy: "maxrects", options: { rotate: true } } });
```

The three strategies have the same frame:

- A genome is the order of the movable items. When the member turns items, the genome also has a turn flag for each turnable item.
- The member decodes each genome: it packs the items in that order with the sort order `input`. A turned item is the turned box of `turnItem`.
- The first genome is the order of the member: the rank order, then a stable sort by its `sortOrder`. Its output is the output of the member.
- The compare of two outputs is the pick of `restarts`. The key is the hard breaks, then `pack.overflow.excessArea`, then `pack.fill`, with `selectBest`.
- The output is the best output of the search when the key finds it better than the member output. Else it is the member output.
- Thus the key does not find a search worse than its member at any time. The placements of the output are in the rank order of the input.
- Locked items with a place stay out of the genome. They go first in each decoded input, so they keep their places.

| Option | Default | Value |
|---|---|---|
| `member` | `maxrects` with the rule `bl` | A strategy id, or a `PortfolioEntry` with options. The strategy has the option `sortOrder`. |
| `iterations` | 64 | The count of the packs of the member, the pack of the member order included. A whole number of 1 or more. |
| `budgetWork` | none | The work limit in work units of `packWork`, as for `restarts`. The first pack always starts. |
| `temperature` | 0.01 | `anneal` only. The start temperature, in the units of the key levels. A number above 0 and to 1. |
| `cooling` | 0.01 | `anneal` only. The temperature of the last step as a share of the start temperature. A number above 0 and to 1. |
| `population` | 8 | `genetic` only. The count of the genomes in one generation. A whole number from 2 to 256. |
| `mutation` | 0.5 | `genetic` only. The chance that a child gets one more random change, from 0 to 1. |
| `tenure` | 7 | `tabu` only. The count of the steps in which a move stays tabu. A whole number from 0 to 1024. |
| `neighbors` | 8 | `tabu` only. The count of the random moves that one step tries. A whole number from 1 to 1024. |

The search `anneal` (catalog row `search-sa-order`):

1. Each step changes the current genome. The change is a swap of two items or a move of one item to another place, with the chance 0.5 each.
2. When the member turns items, a step turns one random turnable item with the chance 0.2.
3. A candidate that is better or equal by the key replaces the current genome. A better candidate than the best genome becomes the best genome.
4. A worse candidate replaces the current genome with the chance `exp(-delta / T)`. `delta` is its loss on its first worse level of the key.
5. A candidate with more hard breaks does not replace the current genome at any time.
6. The temperature `T` falls geometrically from `temperature` to `temperature * cooling`, over the packs of the budget.

The search `genetic` (catalog row `search-ga-order`):

1. The first generation is the member genome, then `population - 1` changes of it. Child `i` of that generation has `i` random changes.
2. Each next generation keeps the best genome of the last generation (elitism with 1 genome).
3. Each other child has two parents. Each parent is the better genome of a tournament of 2 random genomes.
4. The child is the order crossover (OX) of its parents. It keeps a random slice of the first parent, and the other items come in the order of the second parent.
5. Each item of the child keeps the turn flag of the parent that gave its place.
6. With the chance `mutation`, the child gets one random change: a swap of two items. When the member turns items, the change is a turn with the chance 0.2.

The search `tabu` (catalog row `search-tabu`):

1. Each step tries `neighbors` random swaps of two items of the current genome. When the member turns items, a move turns one item with the chance 0.2.
2. A move is tabu when its attribute is in the tabu list. The attribute is the pair of the swapped items, or the turned item.
3. The aspiration rule: the search can take a tabu move when its output is better than the best genome.
4. The step goes to the best permitted move, also when that move is worse than the current genome. Then the move stays tabu for `tenure` steps.
5. A step with no permitted move does not move. The search continues with the next step.

The rules of the output:

- The budget is `iterations` packs of the member. A genome that the search already packed costs no pack, because a cache keeps its output.
- A search also stops after `4 * iterations` tries, cache answers included. Thus a search on a few items stops.
- With `budgetWork`, the search stops when the work of its packs reaches the limit. The work counts as in `restarts`.
- Step `t` gets the random numbers `stepRandom(seed, "<strategy>:<t>")` of the contract. The same seed gives the same output, byte for byte.
- The strategies read no clock. A cut by `budgetWork` is the same on each computer.
- The supports are the union of the supports of the 6 placement strategies, with the free or soft order. A movable obstacle and a group give `UnsupportedCell`.
- A cell that the member does not support gives `UnsupportedCell` from the member.
- The genome has turn flags only when the member has `rotate: true` and the input has turnable items. Else the genome is only the order.
- The output gets the trace stage of its strategy (`ANNEAL_STAGE`, `GENETIC_STAGE` or `TABU_STAGE`). Its measures are in the table below.

| Measure | Value |
|---|---|
| `move.anneal`, `move.genetic`, `move.tabu` | 1 when the output is not the member output, else 0. |
| `<strategy>.packs` | The count of the packs of the member, the member order included. |
| `<strategy>.bestAt` | The index of the pack that gave the output, or 0 for the member output. |
| `anneal.accepted`, `anneal.uphill` | The count of the accepted candidates, and of the accepted candidates that were worse. |
| `genetic.generations` | The count of the generations, the first generation included. |
| `tabu.steps`, `tabu.aspirations` | The count of the steps that moved, and of the tabu moves that the aspiration rule permitted. |
| `work.spent`, `work.budget`, `work.stopped` | With `budgetWork` only, as for `restarts`. |

The choices of this project that differ from the sources:

- The decoder is a member of the registry, `maxrects-bl` by default. Jakobs (1996) and Hopper & Turton (2001) decode with bottom-left or bottom-left fill.
- The objective is the key of `restarts`, not the height of the strip. The compare uses `selectBest`, so a difference below the `minEffect` of a level is a tie.
- The budget is a count of packs, not a time limit or a count of generations. The sources run many more evaluations than the default 64.
- A cache answers a genome that the search already packed. The sources pack each genome again.
- Each search starts from the order of its member, not from a random order. The sources start from random orders or from one sorted order.
- The output is not worse than the member, because a last compare keeps the member output. The sources do not have this guard.
- `anneal`: Kirkpatrick, Gelatt and Vecchi (1983) cool in steps, with many moves at each temperature. Here the temperature falls a little after each pack.
- `anneal`: the temperature is in the units of the key levels. `delta` is the loss on the first worse level only. The search does not accept a loss of hard breaks at any time.
- `genetic`: the population is small (8), because each child costs one pack. Hopper & Turton (2001) use larger populations.
- `genetic`: the crossover is OX of Davis (1985). The first generation is the member order with 0 to `population - 1` random swaps.
- `tabu`: Lodi, Martello & Vigo (1999) move items between bins. Iori, Martello & Monaci (2003) work on strip layouts. Here the move is a swap in the order.
- `tabu`: a step tries a random sample of `neighbors` swaps, not each swap. The tenure is fixed. The search has no long-term memory and no diversification.
- Turn flags are moves of the search only when the member has `rotate: true`. Else the member decides no turn, and the genome has no turn flags.

A local comparison (2026-10-29) used 180 inputs of `pack-classes-v1`: the counts 20, 40 and 60, with the seeds 1 to 3.
The inputs are 90 fixed containers and 90 `freeHeight` containers. The table gives the medians of `pack.fill`, `pack.gap` and the time of one call, and the mean of `pack.overflow.rate`.
The rows with `k64` are not entries. The time is from a shared computer, so it gives only an order of size. The CI benchmark measures the entries on the full corpus.

| Config | Fill, all | Gap, all | Fill, fixed | Gap, fixed | Overflow rate, fixed | Fill, free | Gap, free | ms |
|---|---|---|---|---|---|---|---|---|
| `maxrects-bl` | 0.9022 | 0.0799 | 0.9526 | 0.0516 | 0.6529 | 0.8751 | 0.1110 | 0.08 |
| `restarts-maxrects-bl-k16` | 0.9228 | 0.0687 | 0.9585 | 0.0461 | 0.6529 | 0.8899 | 0.0896 | 1.52 |
| `ruin-recreate-maxrects-bl-k64` | 0.9126 | 0.0674 | 0.9595 | 0.0438 | 0.6299 | 0.8774 | 0.1029 | 4.32 |
| `anneal-maxrects-bl-k16` | 0.9310 | 0.0620 | 0.9635 | 0.0442 | 0.6425 | 0.8945 | 0.0846 | 0.60 |
| `genetic-maxrects-bl-k16` | 0.9262 | 0.0661 | 0.9718 | 0.0350 | 0.6482 | 0.8972 | 0.0848 | 0.89 |
| `tabu-maxrects-bl-k16` | 0.9252 | 0.0654 | 0.9670 | 0.0425 | 0.6520 | 0.8937 | 0.0844 | 0.66 |
| `anneal-maxrects-bl-k64` | 0.9365 | 0.0560 | 0.9679 | 0.0396 | 0.6419 | 0.8984 | 0.0751 | 2.42 |
| `genetic-maxrects-bl-k64` | 0.9378 | 0.0597 | 0.9784 | 0.0383 | 0.6464 | 0.9010 | 0.0803 | 2.58 |
| `tabu-maxrects-bl-k64` | 0.9365 | 0.0498 | 0.9729 | 0.0359 | 0.6489 | 0.9126 | 0.0741 | 2.32 |
| `skyline` | 0.8662 | 0.1375 | 0.9460 | 0.0588 | 0.6677 | 0.7791 | 0.2108 | 0.13 |
| `anneal-skyline-k16` | 0.8939 | 0.1007 | 0.9599 | 0.0476 | 0.6543 | 0.8195 | 0.1605 | 0.98 |

- `restarts-maxrects-bl-k16` also has 16 packs. With that budget, each of the three searches has a smaller median gap than `restarts`, on fixed and on free containers.
- `anneal-maxrects-bl-k16` has the smallest gap of the three over all inputs. Thus the skyline entry is `anneal-skyline-k16`.
- `genetic-maxrects-bl-k16` has the best fill and the smallest gap in fixed containers.
- With 64 packs, `tabu` has the smallest gap. The k64 rows show that each search improves with more packs.
- No config had a hard break on the 180 inputs.

The CI record (2026-10-29, run 40813526076) used the 500 inputs of `pack-classes-v1`: 250 fixed and 250 `freeHeight` containers.
The table gives the medians of `pack.gap`, `pack.fill` and the time of one pack. The run had 0 hard breaks, and each record was deterministic.

| Entry | Gap, all | Gap, fixed | Fill, fixed | Time, fixed (ms) | Gap, free | Fill, free | Time, free (ms) |
|---|---|---|---|---|---|---|---|
| `maxrects-bl` | 0.061 | 0.035 | 0.968 | 0.1 | 0.085 | 0.887 | 0.1 |
| `restarts-maxrects-bl-k16` | 0.054 | 0.031 | 0.973 | 0.7 | 0.075 | 0.896 | 2.0 |
| `anneal-maxrects-bl-k16` | 0.051 | 0.033 | 0.973 | 1.2 | 0.075 | 0.900 | 2.6 |
| `genetic-maxrects-bl-k16` | 0.046 | 0.025 | 0.982 | 0.7 | 0.069 | 0.903 | 1.5 |
| `tabu-maxrects-bl-k16` | 0.048 | 0.030 | 0.976 | 1.2 | 0.070 | 0.903 | 2.7 |
| `skyline` | 0.124 | 0.049 | 0.960 | 0.1 | 0.203 | 0.781 | 0.1 |
| `anneal-skyline-k16` | 0.097 | 0.039 | 0.968 | 1.5 | 0.165 | 0.816 | 2.3 |

- Each of the three searches with 16 packs has a smaller gap over all inputs than `restarts-maxrects-bl-k16`: 0.051, 0.046 and 0.048, against 0.054.
- `genetic-maxrects-bl-k16` has the smallest gap in fixed containers (0.025) and in free containers (0.069).
- In CI, `anneal-maxrects-bl-k16` is not faster than `restarts-maxrects-bl-k16`. The local comparison gave the opposite result.
- `anneal-skyline-k16` cuts the gap of `skyline` from 0.124 to 0.097.

The counts of `packSpace`:

- `combine` gets the options `anneal`, `genetic` and `tabu`, each with 1 member and `RECT_ONLY`. Each one has `iterations`, its two params, and the work limit of k117.
- The named configs are `anneal`, `genetic`, `tabu` and the 4 entries. The benchmark has the 4 entries `ORDER_SEARCH_ENTRIES`.
- With 3 levels, each base config gives 135 new meta configs for each search. They are 3 values of each number param, then 5 values of the work limit.
- With 1 level, each base config gives 5 new meta configs for each search: the 5 values of the work limit.

| `spaceSize` | Before k26 | Since k26 |
|---|---|---|
| 3 levels, `maxMeta: 10n ** 21n` | 185246197022536600275 | 185246197022537804340 |
| 1 level | 66707889492007629 | 66707889492020994 |
| 3 levels, `shapes: ["rect"]` | 184312874572012017240 | 184312874572013220090 |
| 1 level, `shapes: ["rect"]` | 66333631179350180 | 66333631179363530 |

- The base configs stay 2973 and 891, and 2970 and 890 for `rect`.
- `ENTRIES` of the benchmark: 34 before, 38 after. `composites`: 7 before, 10 after. The meta options of `spaceCounts`: 8 before, 11 after.
- The strata of `strataOf`: 20 before, 23 after. The new strata are `anneal:1`, `genetic:1` and `tabu:1`.

## The registry

```ts
const strategies: Strategy[]; // each single strategy of the package
const shapeStrategies: Strategy[]; // each single strategy of a shape kind that is not rect: "hole-degree" since k90
const composites: Strategy[]; // each composite strategy: "portfolio" since 0.2.7, then "aspect-fit", "select", "restarts", "bbox", "ruin-recreate", "overlap-min", "anneal", "genetic" and "tabu"
function strategy(id: string): Strategy;
function packWith(id: string, input: PackInput, options?: unknown, seed?: number): PackOutput;
```

The benchmark starts each strategy of the registry on each input of the corpus. A new strategy goes in the registry, so it gets the same benchmark as the others. No result is removed.

A composite strategy packs an input with other strategies. It is not in `strategies`, but `strategy(id)` and `packWith` find it.

## The adapters of 0.1

The code of 0.1.3 builds these adapters. This document gives the contract, and the TSDoc of each strategy gives its details.

| Function of 0.1 | Strategy id | Its `supports` |
|---|---|---|
| `packRows` | `rows` | `fixed`, `freeHeight`. Obstacles: `fixed` since 0.2.1. Each container shape since 0.2.1. |
| `packSkyline` | `skyline` | `fixed`, `freeHeight`. Obstacles: `fixed`. Each container shape since 0.2.1. |
| `packShelf` | `shelf` | `fixed`, `freeHeight`. Obstacles: `fixed`. Order: `free`, `hard`. Each container shape since 0.2.1. The option `fit` since 0.2.4. |
| `pushCascade` | `push` | `fixed`, `freeHeight`. Obstacles: `free`. Mode: `incremental`. |
| `packMaxRects` | `maxrects` | Each container size and shape. Obstacles: `fixed`. Order: `free`, `soft`. Rotation: `none`, `quarter`. New in 0.2.5. |
| `packGuillotine` | `guillotine` | Each container size and shape. Obstacles: `fixed`. Order: `free`, `soft`. Rotation: `none`, `quarter`. New with roadmap item k23. |
| `packFree` | the size search `log-sweep` | It wraps `rows`, `skyline`, `shelf`, `maxrects` and `guillotine`. `push` moves the items from their start positions, so a size search does not fit it. |

`fromRects(rects, outer)` makes a `PackInput` from the `Rect` objects of 0.1, and `toRects(output, rects, outer)` writes the output back.

## The container layer

Since 0.2.1 (roadmap item k37), one layer gives the free space of each container shape. The module is `src/space.ts`. `rows`, `shelf` and `skyline` use it, so they pack a circle, an ellipse, a polygon and a polygon with holes.

`freeSpace(input)` gives a `FreeSpace` in the coordinates of the frame. A rectangle of the frame is an item with its margin and half the gap on each side.

| Member | Gives |
|---|---|
| `w`, `h` | The size of the frame. Without a fixed size, a free side is `Infinity`. |
| `plain` | `true` for a rectangle container with only rectangle obstacles. The strategies then use the code of 0.1. |
| `band(y0, y1)` | The free spans of x for a rectangle from `y0` to `y1`, sorted, with no overlap. |
| `column(x0, x1, from?)` | The first free span of y from `from` for a rectangle from `x0` to `x1`, or `undefined`. |
| `fits(rect)` | `true` when a `SpaceRect` is in the outline and crosses no hole, obstacle or locked item. |
| `fitX(x, w, y0, y1)` | The first x from `x` where a rectangle of width `w` fits in the band, or `Infinity`. |
| `nextY(y0, y1, w)` | The next top edge after `y0` where the free spans of a band of that height can change, or `Infinity`. |

The rules of the layer:

- A circle and an ellipse use a closed form. A band gets the shortest chord of the outline, made smaller by `EPS` (`1e-6`). `nextY` solves the first band with a chord of width `w`.
- A polygon clips its edges to the band, and merges the x ranges. A gap between two ranges is free when `regionHitsRect` of the polygon is true. This test uses the even-odd rule, so the holes of the polygon stay out.
- The inset makes the outline smaller. The query box is the frame rectangle, grown by the inset minus half the gap.
- A rectangle obstacle and a locked item are exact holes, with the floats of the frame. Another obstacle blocks the x range of its region in the band, grown by half the gap and by `EPS`.
- With a free side, the layer uses the bounding box of the shape, and it keeps the holes of the polygon.

The strategies with a space that is not plain:

- `shelf` and `rows` use `packRowsInSpace`. A rectangle goes to the first x from the cursor where `fitX` and the locked rectangles agree. An empty row steps down to `nextY`. When no step finds a place, the rectangle stays in the overflow, and the row keeps its top edge.
- `shelf` with a `fit` uses its own path in each shape. The section "The shelf family" tells it.
- In this path, `rows` does not fill the gaps of a row again.
- `skyline` gets the start and the limit of each cell from `column`. `lowestWindow` with a limit finds the lowest window where the rectangle fits under the limit of each cell.
- `push` supports only the rectangle container.

## The shelf family

Since 0.2.4 (roadmap item k21), `shelf` has the optional option `fit`. Without `fit`, `shelf` packs as in 0.2.3, and its output does not change.

| `fit` | The shelf of a box | Move | Catalog |
|---|---|---|---|
| `next` | Only the open shelf: the last shelf that the packing opened. | `move.stack` | `shelf-nfdh` with strips |
| `first` | The first shelf from the top where the box fits. | `move.firstFit` | `shelf-ffdh` |
| `best` | The place with the least height left over above the box, over all the shelves. | `move.bestFit` | `shelf-bhf` |

With a `fit`, `packShelf` uses `packShelvesInSpace` in each container shape, also in a rectangle. It does not call `packRowsInSpace`.

1. A new shelf opens at the bottom edge of the last shelf. The first box goes to the first x where `band`, `fitX` and the locked rectangles agree.
2. When no x fits, the shelf steps down to `nextY` of the space, or to the next edge of a locked rectangle. Thus a shelf opens only in a free span of the shape.
3. The first box of a shelf sets its height. A later box goes on the floor at the cursor, or into the strip above a shorter box of the shelf.
4. A strip is the free space from the top edge of a box to the top edge of the shelf, as wide as the box. A box in a strip is the move `move.stack`.
5. In a shelf, the box takes the place with the least height left over. A tie goes to a strip, from left to right.
6. When no shelf has a place, the last shelf grows for a taller box on its floor, if it fits. Else a new shelf opens.
7. A box that goes on a shelf that is not the open shelf is the move `move.firstFit`. The fit `best` also counts `move.bestFit` when its shelf is not the first shelf where the box fits.

- Each place is in the free space of the band, and crosses no hole, obstacle or locked rectangle. The test `checkHard` with `exactContainer` is clean on generated inputs of each shape.
- A box wider than a fixed width overflows. Without a fixed size, it goes on a closed shelf of its own at the left edge.
- The sort order stays an option. The default is `height-desc`. With `input`, the boxes keep the order of the array.
- The trace of `shelf` with a `fit` also has `move.firstFit` and `move.bestFit`. The trace of the default has only `move.stack`.

The hard rules and the outline:

- By default, `checkHard` of `packing` and `packHard` of the contract test the container as its bounding box. They test the obstacles exactly with `regionHitsRect`.
- Since `packing` 0.2.2 and the contract 0.2.4, both take the option `{ exactContainer: true }` (the type `ContainerTest`). Then a shaped container with the size `fixed` also uses its true outline and its holes.
- With this option, a box counts in `in-container` when `rectInRegion` of the contract tells that it is not in the shape. The box grows by the inset and becomes smaller by the tolerance.
- The default is `false`, so the counts of 0.2.1 stay. The contract changes the default to `true` at its next breaking version.
- The tests of the layer (`src/space.test.ts`) test each box with `rectInRegion`, and with `checkHard` and the option.

## The skyline family

Roadmap item k22 adds the skyline rules of Jylänki 2010 to the strategy `skyline`. The module is `src/skyline.ts`.

1. The boxes go in the order `sortOrder`. The default is `height-desc`.
2. The skyline has a height for each whole unit of the width. A window is a run of cells as wide as the box.
3. The rule examines each window where the box fits. The box goes on the highest cell of the window with the best score.
4. The cells of the window get the bottom edge of the box.

The option `rule` chooses the window. The default is `bl`, the rule of `skyline` before k22.

| `rule` | The score | Move | Catalog |
|---|---|---|---|
| `bl` | The top edge of the box, then its left edge | `move.lowerWindow` | `skyline-bl` |
| `mw` | The area below the box and above the skyline, then the top edge, then the left edge | `move.minWaste` | `skyline-min-waste` |

The rule `mw` builds towers, and thus it gives a lower `pack.fill` than `bl` on the made-up inputs.

- A box takes a window with no waste over a lower window with waste. Thus a box goes on the top of a high stack when the stack is as wide as the box.
- The test "least waste" of `src/skyline-variants.test.ts` shows it. Box `d` goes on the top 5 with the waste 0, not on the top 3 with the waste 3. The height becomes 9, not 7.
- The score counts only the area below the box. It does not count the height that the box adds to the layout. Jylänki 2010 counts bins of a fixed size, so this height has less effect there.
- On 30 made-up inputs, the median `pack.fill` of `mw` is 0.55. The median of `bl` is 0.78.

The option `wasteMap` keeps the free areas below the skyline. The default is `false`.

- A free area comes from the cells of a window that are lower than the window. For each level, the widest run of cells at or below it gives a free rectangle.
- Without a space that is not plain, the area above each locked item is also a free area.
- Each box tries the free rectangles first, with the best short side fit. A box in a free rectangle cuts the list as `maxrects` does.
- The move `move.wasteFill` counts each box that goes in a free rectangle.

The option `rotate` lets each turnable item that is not locked turn by 90 degrees, as in `maxrects`. The default is `false`.

- The rule compares the places of the two turns. A tie keeps the box without a turn.
- An item that is too wide for the container fits when its turn fits.

The default options give the outputs of `skyline` before k22. The hash tests `bench/rect-fixture.test.ts` and `bench/maxrects-fixture.test.ts` did not change.

- The locked items, the obstacles and the holes of each container shape stay as in `skyline`. The pair gaps of the frame stay too.
- The bench entries are `skyline-mw`, `skyline-bl-waste` and `skyline-mw-waste`. Their base is `skyline`.
- The cost for `n` boxes is `O(n W)` for a width of `W` cells. The waste map adds `O(F)` for each box, with `F` free rectangles.

## The MaxRects family

Since 0.2.5 (roadmap item k24), the strategy `maxrects` packs with a list of maximal free rectangles (Jylänki 2010). The module is `src/maxrects.ts`.

1. The boxes go in the order `sortOrder`. The default is `height-desc`.
2. The rule examines each free rectangle where the box fits. The box goes to the top-left corner of the rectangle with the best score.
3. The box cuts each free rectangle that it hits into at most four parts. The parts are the free space on the four sides of the box.
4. The list loses each part that is in another free rectangle. Thus each free rectangle stays maximal.
5. The list also loses each part that is too small for the smallest box.

Since roadmap item k64, step 4 compares a part only with the parts and the free rectangles on the same side of the box. The outputs did not change: the test `bench/maxrects-fixture.test.ts` compares them with the hashes of the code before k64.

- A part stays when no other part of its side holds more than it, and no equal part comes before it.
- This set does not depend on an order. Thus step 4 does not sort the parts.
- Each new part goes at once when a part that stays holds it. Else it removes each part that it holds.
- Only a part that stays gets an object. The new list has the parts that stay in the order of their creation.

The option `rule` chooses the free rectangle. The default is `bssf`. A lower score is better. A tie goes to the higher place, then to the left place.

| `rule` | The score | Move | Catalog |
|---|---|---|---|
| `bssf` | The smaller leftover side, then the larger leftover side | `move.bssf` | `maxrects-bssf` |
| `blsf` | The larger leftover side, then the smaller leftover side | `move.blsf` | `maxrects-blsf` |
| `baf` | The leftover area, then the smaller leftover side | `move.baf` | `maxrects-baf` |
| `bl` | The bottom edge of the box, then its left edge | `move.split` | `maxrects-bl` |
| `cp` | The most contact length with the frame, the boxes and the obstacles | `move.cp` | `maxrects-cp` |

The moves:

- The rule `bl` gives the base place. The move of each other rule counts a box when the rule chooses a place that is not the place of `bl`.
- Thus the move of a rule counts only the choices of that rule. The other steps are the same for each rule, so they do not count.
- The rule `bl` has no base. Its move `move.split` counts a box that cuts 2 free rectangles or more. This cut is the step that `rows`, `skyline` and `shelf` do not have.
- The trace of `maxrects` has `move.split` for each rule. The trace of a rule other than `bl` also has the move of the rule.

The free space of each container shape:

- A plain space (a rectangle container with only rectangle obstacles) gets exact free rectangles: the frame less the locked rectangles.
- Another space gets an inner approximation. The rectangle holes of the layer stay exact. The rest of the shape gets bands.
- The bands cut the height into equal bands. In each band, the space between the free spans of the shape is a wall.
- Equal walls of neighbour bands merge into one wall. Thus a straight edge of a polygon gives few walls.
- The option `bandHeight` sets the largest height of a band. The default is the height to cut divided by `MAXRECTS_BANDS` (128).
- A fixed height cuts the full height. A free height cuts to the lowest edge of the outline and the obstacles.
- In a space that is not plain, each place also gets the test `fits` of the space. A place that fails the test is not used again.
- The locked items and the obstacles are walls, so no box crosses them.

The size of the frame:

- With a fixed size, a box that fits in no free rectangle goes to the overflow.
- With a free height, the frame is as high as the sum of the box heights. A box with no place goes below all the others.
- The output height is the lowest bottom edge of a box, as in `skyline`.
- A free width uses the size search `log-sweep`, as for `rows`, `skyline` and `shelf`.

The option `rotate` (default `false`) lets the packer turn a box with `turnable` a quarter turn. The packer examines the two orientations of the box, and the unturned orientation wins a tie.

The tests (`src/maxrects.test.ts`) examine each rule on each container shape, with a fixed size and a free size:

- `checkHard` with `exactContainer` gives 0 breaks, and each output is deterministic.
- Each free rectangle at the end is in the outline, and it crosses no box.
- On a plain rectangle, no box in the overflow fits in a free rectangle at the end.
- A hand case of each rule shows a place that is not the place of `bl`.

The fill of the rules, from the smoke run of 0.2.5:

- `pack.fill` is the area of the boxes divided by the area of their hull. It measures how compact a layout is, not how full a bin is.
- On the 10 clean `rect` inputs of `smoke-v1`, the median fill is 0.816 for `bl`, 0.669 for `blsf` and 0.48 for `cp`.
- Of these 10 inputs, 7 have a fixed size, 2 have a free height and 1 has a free aspect. No input has overflow.
- The rule `cp` counts the contact with the frame. A box on the left edge gets its full height of contact.
- Thus `cp` puts 4 of 10 boxes on the left edge, and `bl` puts 1 of 10. The hull becomes an L shape.
- On `rect-grid.fixed.rect.none.uniform.n10/s1`, the hull is 902 by 617 for `cp` and 943 by 326 for `bl`.
- The rule `blsf` takes the free rectangle with the smallest larger leftover side. This rectangle is frequently in the middle of the frame.
- With a free height, the bottom of the frame is far below the boxes. The larger leftover side of `blsf` is then always the height.
- Thus `blsf` puts each box under the last box. The result is one column with the fill 1 and a large aspect error.
- On `gallery.freeHeight.n10/s1`, the column of `blsf` is 212 by 1413. The hull of `bl` is 1272 by 283.
- The literature measures a rule by the boxes that fit in one bin. Only `rect-grid.fixed.rect.none.heavyTail.n100/s1` has overflow.
- On it, the overflow is 45 boxes for `bl`, 51 for `cp`, 55 for `bssf`, 57 for `blsf` and 60 for `baf`.
- Thus `cp` is second on the measure of the literature. The low fill of `cp` and `blsf` is not a defect of the code.

## The guillotine family

Roadmap item k23 adds the strategy `guillotine`. It packs with the guillotine rules of Jylänki (2010), "A thousand ways to pack the bin: a practical approach to two-dimensional rectangle bin packing". The module is `src/guillotine.ts`.

1. The boxes go in the order `sortOrder`. The default is `height-desc`.
2. The packer keeps a list of free rectangles. No two free rectangles overlap.
3. The rule `choice` examines each free rectangle where the box fits. The box goes to the top-left corner of the free rectangle with the best score.
4. The free rectangle leaves the list. One straight cut of the rule `split` divides the rest of it into two parts.
5. The two parts go to the end of the list: first the part below the box, then the part on the right.

A free rectangle is `W` by `H`, and the box is `w` by `h`. The leftovers are `W - w` and `H - h`.

The option `choice` chooses the free rectangle. The default is `baf`. A lower score is better.

| `choice` | The score | Catalog |
|---|---|---|
| `baf` | The leftover area: `W * H - w * h` | `guillotine-<choice>-<split>` |
| `bssf` | The smaller leftover side | `guillotine-<choice>-<split>` |
| `blsf` | The larger leftover side | `guillotine-<choice>-<split>` |
| `waf` | The score of `baf` times -1 | `guillotine-<choice>-<split>` |
| `wssf` | The score of `bssf` times -1 | `guillotine-<choice>-<split>` |
| `wlsf` | The score of `blsf` times -1 | `guillotine-<choice>-<split>` |

- A free rectangle of the exact size of the box wins at once, also with a worst rule. The reference code of the source does the same.
- A tie goes to the first free rectangle of the list. For one free rectangle, the box without a turn wins a tie.

The option `split` chooses the cut. The default is `sas`.

- A horizontal cut continues the bottom edge of the box. The part below gets the full width `W`, and the part on the right is as high as the box.
- A vertical cut continues the right edge of the box. The part on the right gets the full height `H`, and the part below is as wide as the box.

| `split` | The name in the source | The cut is horizontal when |
|---|---|---|
| `sas` | shorter leftover axis | `W - w <= H - h` |
| `las` | longer leftover axis | `W - w > H - h` |
| `sa` | shorter axis | `W <= H` |
| `la` | longer axis | `W > H` |
| `minas` | min area | `w * (H - h) > (W - w) * h` |
| `maxas` | max area | `w * (H - h) <= (W - w) * h` |

The option `merge` (default `false`) gives the rectangle merge of the source.

- After each box, one pass compares each pair of free rectangles. Two rectangles with the same left and right edges join when one is on the top of the other.
- Two rectangles with the same top and bottom edges join when one is next to the other. The first rectangle grows, and the second rectangle leaves the list.
- The pass compares the edges exactly. Thus it joins only a common full edge. It does not join three rectangles that only together have a full edge.
- Without `merge`, a part with less room than the smallest box leaves the list, because a free rectangle never grows. With `merge`, each part stays.

The option `rotate` (default `false`) lets each turnable item that is not locked turn by 90 degrees, as in `maxrects`.

The moves:

- `move.freeChoice` counts a box that goes in a free rectangle that is not the first free rectangle where the box fits.
- `move.merge` counts each join of the option `merge`. The trace has it only with `merge`.

The containers, the obstacles and the locked items are as in `maxrects`. The function `wallsOf` of `src/maxrects.ts` gives the walls for the two packers.

- The locked items, the obstacles and the bands of a space that is not plain are walls. Each wall cuts the start rectangle into parts that do not overlap.
- The parts are the full-height parts on the left and on the right of the wall, then the parts above and below it. With `merge`, a merge pass follows.
- In a space that is not plain, each place also gets the test `fits` of the space. A place that fails the test is not used again for that box.
- With a fixed size, a box that fits in no free rectangle goes to the overflow.
- With a free height, the frame is as high as the sum of the box heights. A box with no place goes below all the others, at the left edge.
- A free width uses the size search `log-sweep`. The margin is part of the item, and the frame gives the gap (decision 3).
- The packer reads no clock and no random number. Thus the output depends only on the input and the options.

The default `pack()` and `SELECT_TABLE` do not use `guillotine`. The hash tests did not change.

The tests (`src/guillotine.test.ts`):

- A hand case of each rule of `choice` and `split` gives a known place or a known list of free rectangles. Each rule gives another result.
- A hand case of `merge` makes room for a full-width box. Without `merge`, the box goes to the overflow.
- `checkHard` with `exactContainer` gives 0 breaks on random sets, on `rect-grid` in 4 shapes and on an input of each generator. Each output is deterministic.

A local small run (not a CI run) packed 80 inputs of `pack-classes-v1`: the counts 20 and 60 of each class, with the seeds 1 and 2.

| Entry | Median `pack.fill` | Median `pack.gap` |
|---|---|---|
| `guillotine-baf-sas` | 0.895 | 0.086 |
| `guillotine-bssf-sas-merge` | 0.907 | 0.081 |
| `maxrects-bl` | 0.898 | 0.077 |
| `maxrects-baf` | 0.905 | 0.080 |
| `skyline` | 0.864 | 0.140 |
| `shelf-best` | 0.879 | 0.109 |

The CI run [40801208821](https://github.com/mark1russell7/packing/actions/runs/40801208821) of 2026-10-29 packed all 500 inputs of `pack-classes-v1`. It is the record.

| Entry | Median `pack.fill` | Median `pack.gap` |
|---|---|---|
| `guillotine-baf-sas` | 0.9250 | 0.0650 |
| `guillotine-bssf-sas-merge` | 0.9245 | 0.0640 |
| `maxrects-bl` | 0.9270 | 0.0610 |
| `maxrects-baf` | 0.9220 | 0.0645 |
| `skyline` | 0.8680 | 0.1240 |
| `shelf-best` | 0.9040 | 0.0820 |

- The 3000 records have 0 hard breaks, and each one is deterministic.
- The guillotine entries are level with maxrects. `maxrects-bl` keeps the smallest gap.
- `merge` gives no gain at the median.

## The decisions

The layout-stack session, `highways` and `packing` settled these questions on 2026-10-27. The placement and the routing read each of them in the same way.

### 1. The rotation

- `Item.turnable` (default `false`) lets a strategy turn the item. `Placement.turn` is `0` or `90`.
- A turn of 90 is clockwise, with the y axis down. The turned item has `w` and `h` changed. Its top-left corner is at `x`, `y`.
- A port at `px`, `py` goes to `h - py`, `px`. Its side turns from `top` to `right`, `right` to `bottom`, `bottom` to `left` and `left` to `top`.
- The output and the record for the router have the turned items and ports. Thus the router does not read `turn`.
- The rotation is in the first version. A later addition changes the `supports` of each strategy.

### 2. The tolerances

| Name | Value | Use |
|---|---|---|
| `EPS` | `1e-6` | The comparison of two numbers in an engine. |
| `RECORD_EPS` | `1e-3` | The comparison of two numbers of a file. The files round to 3 decimals, so two values can differ by `0.0005` each. |
| `tolerance.overlap` | `0.001` | The rule `no-overlap`. The packer is exact, so a small tolerance finds each real overlap. |
| `tolerance.through` | `0.5` | The router rule that a route does not go through a box. A route is a curve on the line of the margin. |

- The boxes are closed. Two boxes overlap only when their insides overlap. A common edge is not an overlap.
- Each record writes the tolerances of its rules in the field `tolerance`, next to `hard`. The table gives the defaults. `hard` holds only the count of each rule.
- A route in the margin of an item, outside the item, is a soft measure, not a break of a hard rule.

### 3. The margins and the gap

- `Item.margin` is a ring around the item. It is a part of the item. The packer packs the item with its margin. The router keeps each route out of the ring.
- A port stub crosses the ring at a right angle. This crossing is not a break.
- `gap` is the free space between two items with their margins. Routes use it.
- `LayoutContainer.inset` is the space between the border and the items with their margins.
- Thus two items are `mA + gap + mB` apart.
- A gap with `k` routes at a spacing `s` needs `gap >= (k - 1) * s` when the margins give the clearance.
- The joint corpus keeps the inputs with a gap of 0 and no margin as a labelled stress cell. On these inputs, the router rule `through` is expected to fail. Each other joint input has a margin and a gap larger than 0.

#### The pair gaps (roadmap item k77)

`PackInput.pairGaps` sets one distance for some pairs of items. It comes from `layout-contract` 0.2.14.

- An entry `{ a, b, gap, lanes? }` names two items. The order of `a` and `b` has no meaning. `lanes` is information only.
- For a listed pair, the pair gap replaces the two margins and the global `gap`. The other pairs do not change.
- The rule `no-overlap` of `packHard` grows one item of the pair by the pair gap. The pair breaks the rule only when it is nearer than the pair gap. `checkHard` uses the same rule.
- `hashInput` puts the file through `canonicalInput` of the contract. That function puts `a` before `b`, and sorts the list by `a` and then by `b`. Thus the hash is equal to `documentHash` of the contract. The order of the list does not change the hash.
- A file without `pairGaps` keeps its hash. An input without `pairGaps`, or with an empty list, keeps its output.

Each strategy keeps the pair gaps through the frame of the adapters of 0.1 (`buildFrame`):

- Two rectangles of the frame do not overlap. Thus two items are apart by their smallest margins, the global gap and their two pads.
- Each item of a listed pair gets a pad on each side. The pad is half of the part of the pair gap that is more than that distance.
- An item of more than one pair gets the largest pad. A pair gap that is not more than that distance gives no pad.
- `rows`, `skyline`, `shelf`, `maxrects` and `push` use this frame. Thus each strategy keeps each pair gap. The composite strategies give the input with its `pairGaps` to their members.

The rule is safe, but it is not tight:

- A pair gap that is smaller than the margins does not let the two items come nearer. The packer keeps the margins.
- A pad also keeps the other neighbours of the item farther away, and it can make an item too large for a fixed container. Then the item goes to the overflow.

#### The bounds with the margins and the gap (roadmap item k118)

The bounds of `src/bounds.ts` and `src/overflow.ts` count the margins and the gap. This section gives the proof that each bound stays sound.

- `M_j` is the box of item `j` grown by its margins. `I` is the container less the inset. `g` is the global `gap`.
- The hard rules keep each `M_j` in `I`, out of each other `M_k`, out of each fixed obstacle and out of the boxes of the locked items.
- Decision 3 keeps two items `mA + g + mB` apart. Thus the boxes `R_j`, each `M_j` grown by `g / 2` on each side, do not overlap.
- Each `R_j` stays in `I` grown by `g / 2` on each side. An `R_j` can go over an obstacle by `g / 2`, so a bound with the gap does not subtract the obstacles.

Only a rectangle item that is not in `pairGaps` grows. The other items count as their bare boxes:

- A pair gap replaces the margins and the gap of its pair. Thus the two items of a pair can be nearer than their margins and the gap.
- The hard rules test a shape as its bounding box, and `hole-degree` keeps the discs apart, not their boxes. Thus a shape stays bare.
- A bare box is in its `M_j`. Thus each bound stays sound with the bare items, but it is weaker.

The bounds:

1. `placed.free` with the margins: the placed items need the area of their `M_j` in the free area `F`. `F` loses the margined box of each locked item that grows.
2. `placed.free` with the gap: the placed items need the area of their `R_j` in the area of `I` grown by `g`.
3. The forced count drops the candidates with the largest need first, until the rest fits. No packer places more items, so the count is a lower bound of the overflow.
4. The forced area is the fractional knapsack: the candidates with the least item area for each unit of need go first. No set of items with that need has less item area.
5. `strip.margin`: the pieces `R_j` do not overlap in a strip of the width of `I` plus `g`. Their hull is at most `H + top + bottom + g` high. `top` and `bottom` are the largest margins.
6. `hull.margin`: the pieces `R_j` do not overlap in the hull grown by the largest margins and by `g`. `areaFloor` gives the least hull for that.
7. Each bound with the gap is the larger value of the bound with `g` and the bound with `0`. Each of the two values is sound, so the larger value is sound too.

- The tolerance makes each piece smaller by `t / 2` on each side, as before. The slack of the free area is `2 * t` along each edge.
- With no margin and no gap, the bounds and the measures are the same as before k118. A test of `src/bounds.test.ts` checks each bound against an exhaustive optimum with a margin, a gap and both.
- A strategy that does not keep the gap can get a result better than a bound with the gap. Then `pack.gap` is below 0, and the smoke check fails.
- The test of `bench/sample-space.test.ts` checks `0 <= pack.gap <= 1` on sampled pairs of `packSpace`. Thus it also finds a strategy of the space that ignores the gap.
- `overlap-min` of k80 grows each item by its margin and by half the gap, as the frame does. Thus it keeps the gap too.

The CI record of k118: the run 40815224148 of `bench.yml` on `pack-classes-v1`, with `maxrects-bl`, `restarts-maxrects-bl-k16` and `skyline`.
The sample has 400 stratified pairs with the relative knobs.

The corpus has 1500 records of 500 inputs. Its `pack.gap` is from 0 to 0.304. The table gives the medians.

| Container | Strategy | `pack.gap` | `pack.fill` | Time (ms) |
|---|---|---|---|---|
| fixed | `maxrects-bl` | 0.034 | 0.968 | 0.1 |
| fixed | `restarts-maxrects-bl-k16` | 0.031 | 0.973 | 1.5 |
| fixed | `skyline` | 0.046 | 0.960 | 0.1 |
| free height | `maxrects-bl` | 0.079 | 0.887 | 0.1 |
| free height | `restarts-maxrects-bl-k16` | 0.069 | 0.896 | 4.4 |
| free height | `skyline` | 0.168 | 0.781 | 0.1 |

The sample:

- The sampler measured 380 of the 400 pairs. 372 pairs have a `pack.gap`.
- `pack.gap` is from 0 to 0.966, with the median 0.178. No pair is above 1.
- No pair has a hard break. 1 pair is not deterministic.
- The share of the coverage of `pack.gapToBound` is 0.090 with the uniform weights: 33 of 366, Wilson interval 0.065 to 0.124.
- With the family prior, the share is 0.147 (`nEff` 30.6).

The results:

- The bounds are sound on each record. No `pack.gap` is below 0 or above 1.
- The order of the corpus is `restarts-maxrects-bl-k16`, then `maxrects-bl`, then `skyline`. It is the same on the 2 kinds of container.
- The stratum `hole-degree:1` (33 configs) got 0 of its 20 pairs. A later item examines it.

A later item: the bound of a fixed size with the gap is loose. It counts only the area.

- Four squares of 4 with the margin 1 and the gap 2 in a box of 12: each square needs 8 by 8 of a box of 14 by 14.
- The area 196 holds 3 squares of 64, so the bound is 0.766. Only 1 square fits, so the optimum is 0.25.
- A bound of the count of the wide pieces on each axis, as `strip.mmv` does for a strip, is a candidate for that item.

### 4. The ports

- The ports are a part of the item, with the form of `boxes[].ports` of `layout-input/1`. A port has an `id`, an optional `side`, and an optional `x` and `y` on the border of the item.
- A port without a side is a port of the routing cell `ports` set to `free`. The router picks its side.
- The packer keeps the ports, and turns them with the item (decision 1).
- The strategies of the first version ignore the ports. A port-aware strategy (`new-port-aware` of the catalog) reads them.

### 5. The items and the boxes

- The file format keeps the name `boxes`. The packer API uses `Item`, because an item can be a circle or a polygon.
- One pair of converters in the contract (`toPackInput` and `toLayoutRecord`) maps the two names. Neither engine has its own mapping.
- A router that knows only rectangles routes around the bounding box of an item. It declares this in its own `supports`.
- The obstacles of the packer go to the router as obstacles, not as boxes. A shaped item goes to the router as its shape, or as its bounding box when the router does not support the shape.

## The contract and packing

The package `@mark1russell7/layout-contract` holds what the packer, the router and the consumer share. Neither engine depends on the other.

| In the contract | In `packing` |
|---|---|
| `Region`, `Item` with `Port` and `margin`, `LayoutContainer`, `Obstacle` | The packer part of `Strategy`: `pack` and `PackContext` |
| `PackInput`, `PackOutput`, `Placement` | The stages: `SizeSearch`, `Split`, `Assign`, `Pass`, `pipeline` |
| The turn helper, `EPS`, `RECORD_EPS` | The selector and `cellOf` |
| The converters and the validators | The registry and the adapters of 0.1 |
| The common fields of a strategy, with `supports` as a record of each dimension and its values | The dimensions of the packer, with their names in `docs/FORMAT.md` |
| The registry of the measure names | |

- Since 0.2.0, `packing` has the contract from npm as a dependency, and it imports the types. Since 0.2.2, the range is `^0.2.4`.
- A test of `packing` makes sure that its types are the types of the contract.
- The adapters of 0.1 stay until the contract is final.

## The type fit with `@mark1russell7/layout-contract`

The test `src/contract-fit.test.ts` compares the types and the functions of `packing` with the contract from npm (roadmap item k57). Since `packing` 0.2.2, the contract is 0.2.4.

- Since 0.2.0, the contract is a dependency of `packing` at run time: `"@mark1russell7/layout-contract": "^0.2.4"` since 0.2.2. The minimum effects of 0.2.2 need `minEffect` and `compareMeasure` of the contract 0.2.3. The option `exactContainer` needs `rectInRegion` and `ContainerTest` of 0.2.4.
- `packing` imports each shared type from the contract. Thus each shared type is the same type in both packages.
- `EPS`, `RECORD_EPS`, `DEFAULT_TOLERANCE`, `checkInput`, `turnPoint`, `turnPort` and `turnRegion` are the values of the contract. `turnItem` is `turnBox` of the contract.
- `toPackInput` gives the same packer input. `packHard` and `checkHard` give the same counts on the packed outputs of the generators, with and without an inset.
- `packHard` and `checkHard` give the same counts for each form of obstacle, also after a move in `output.moved`.
- `packHard` and `checkHard` give the same counts with `{ exactContainer: true }` on the packed outputs of each container shape.
- `Strategy` fits `StrategyInfo`, and `MeasureSpec` of `packing` is `MeasureSpec` of the contract with a family.
- A record of the benchmark runner fits `LayoutRecord`, with and without `skipped`. The two types have the same fields. `BenchEnv` and `RunEnv` fit in both directions.

The gaps are below. Each gap from 0 to 14 is closed. A closed gap keeps its line and its number, and the test has a check that shows the fit.

The test pins each difference that stays, with its reason:

- The class `Rect` of 0.1 is not the plain `Rect` of the contract. The adapters of 0.1 use the class. A rename needs a decision of the owner.
- `GeneratedInput`, `GeneratorStamp` and `CorpusCell` are narrower than `LayoutInput`, `LayoutGenerator` and `LayoutCell`. A generator writes each of these fields. Each one fits the contract type.
- `MeasureSpec` of `packing` has a necessary `family`. Each measure of the packer has a family of `docs/MEASURES.md`.
- `checkHard` reads a packer input, and `packHard` reads a file (gap 12).

0. The install. `packing`: the specifier `github:mark1russell7/layout-contract#d15b240` installs the root of the repository. The contract: the package is in `packages/layout-contract`. Thus `packing` adds `&path:packages/layout-contract`. No decision applies. The npm release closes this gap.
   - **Closed in `packing` 0.2.0:** the dependency is `^0.2.1` from npm, at run time.
1. The arrays. `packing`: mutable arrays, for example `Item[]`, `Port[]` and the rings of a polygon. The contract: readonly arrays and fields. The decisions favor the contract, because a packer does not change its input.
   - **Closed in `packing` 0.2.0:** each array and each field of the shared types is `readonly`.
2. The trace. `packing`: `PackOutput.trace`, `StageTrace.ms` and `StageTrace.measures` are necessary. The contract: they are optional. No decision applies. The output of `packing` fits the contract.
   - **Closed in `packing` 0.2.0:** the three fields are optional. Each strategy of `packing` still writes them.
3. The names. `packing`: `Margin` (the four sides), `Container`, `Edge`, `HardBreaks` and the class `Rect` of 0.1. The contract: `Sides`, `Margin` (a number or `Sides`), `LayoutContainer`, `LayoutEdge`, `PackHard` and a plain `Rect`. Decision 5 favors the contract. The class `Rect` of 0.1 needs a decision. `packing` closes gaps 1 and 3 in its 0.2.0, when it imports the contract.
   - **Closed in `packing` 0.2.0:** `packing` exports `Sides`, `Margin`, `LayoutContainer`, `LayoutEdge` and `PackHard` of the contract. `Container`, `Edge` and `HardBreaks` are not in the API.
   - Pinned: the class `Rect` of 0.1 stays. A rename needs a decision of the owner.
4. The file. `packing`: `LayoutInput.change` is a string, and the file has `generator` and `step`. The contract: `change` is `add`, `remove`, `resize` or `reorder`, with no `generator` and no `step`. `docs/FORMAT.md` favors `packing`: it has `"change": "packed"`, `generator` and `step`.
   - **Closed in `layout-contract` 0.2.0:** `change` has `packed`. The file has `generator`, `step` and `cell`, and `GeneratorStamp` and `CorpusCell` fit them.
   - Open: `change` of `packing` is any string, thus `LayoutInput` of `packing` does not fit.
   - **Closed in `packing` 0.2.0:** `LayoutInput` is the type of the contract. `change` is `add`, `remove`, `resize`, `reorder` or `packed`. A generator gives a `GeneratedInput`.
5. The edge data. `packing`: `Edge` has no `data`. The contract: `LayoutEdge.data` is an optional record. No decision applies. The router reads the edges, thus its twin document in `highways` decides.
   - In 0.2.0, `LayoutBox.data` is also an optional record. `Item` of `packing` has no `data`. Each contract box fits `Item` without `readonly`, when each port has a side.
   - **Closed in `packing` 0.1.7:** `Item` and `Edge` have the optional `data` of the contract, with the same type. The turn and `toPackInput` keep it.
6. The supports. `packing`: `Supports` is an interface with one field for each dimension. The contract: `Supports` is a record. An interface has no index signature, thus it does not fit. The table above favors the contract. **Closed in `packing` 0.1.6:** `Supports` is a type alias with the same fields, and it fits the record.
7. The turn of a port with only `x` or only `y`. `packing`: the value turns, thus `x` becomes the new `y`, and `h - y` becomes the new `x`. The contract: the side turns, but the value stays on the old axis. Decision 1 favors `packing`.
   - **Closed in `layout-contract` 0.2.0:** `turnPort` turns the value as `packing` does.
8. The obstacles in `no-overlap`. `packing`: `checkHard` counts each item that overlaps an obstacle. The contract: `packHard` counts only the pairs of boxes. The decisions favor `packing`: in both packages, no item enters an obstacle.
   - **Closed in `layout-contract` 0.2.0:** `packHard` counts each placed box with its margin over an obstacle, at the place of `output.moved`.
   - Open: `checkHard` reads an obstacle as its bounding box. `packHard` reads a circle, an ellipse and a polygon with holes exactly. `packing` adopts the exact test in its 0.2.0.
   - **Closed in `packing` 0.2.0:** `checkHard` uses `regionHitsRect` of the contract. An item in the bounding box of a circle, but out of the circle, is not an overlap.
9. The inset in `in-container`. `packing`: `checkHard` does not read `container.inset`. The contract: `packHard` makes the container smaller by the inset. Decision 3 favors the contract. **Closed in `packing` 0.1.6:** `checkHard` also makes each fixed side smaller by the inset.
10. A shaped item. `packing`: `checkHard` reads an item as `w` by `h`. The contract: `packHard` reads the bounding box of `shape`. Decision 5 favors the contract, because an item can be a circle or a polygon. **Closed in `packing` 0.1.6:** `checkHard` also reads the bounding box of `shape`, after the turn.
11. An item with no placement. `packing`: a locked item with no placement breaks `locked-kept`, and an item that is not in the overflow breaks `complete`. The contract: `applyPack` keeps the position of the input, thus neither rule counts the item. `docs/FORMAT.md` favors `packing` for `complete`. No decision covers `locked-kept`.
    - **Closed in `layout-contract` 0.2.0:** a locked box with no placement breaks `locked-kept`. Another box with no placement that is not in the overflow breaks `complete`.
    - Open, and new in 0.2.0 at commit `69933a6`: the items below.
    - A locked item with no placement, not in the overflow: `checkHard` also counts it in `complete`. `packHard` does not.
    - A locked item with no placement: `packHard` keeps it at its input position for `no-overlap` and `in-container`. `checkHard` ignores it.
    - A locked item that moved: `checkHard` compares the move with `RECORD_EPS`. `packHard` compares it with its tolerance argument. The default values are the same.
    - A locked item with no `x` or no `y` in the input: `checkHard` does not count it. `packHard` reads the missing value as 0.
    - **Closed in `packing` 0.1.7:** a locked item with no placement breaks only `locked-kept`. It stays at its input position for `no-overlap` and `in-container`.
    - **Closed in `layout-contract` 0.2.0:** `packHard` compares the move of a locked box with `RECORD_EPS`. The tolerance argument does not change it.
    - **Closed in `layout-contract` 0.2.0:** `packHard` does not count a locked box with no position. `checkInput` gives the problem "a locked box has no position".
    - Open, on a bad input only: a locked item with no position and no placement. `checkHard` reads it as not locked and counts it in `complete`. `packHard` skips it.
    - **Closed in `packing` 0.2.0:** `checkHard` skips a locked item with no position, as `packHard` does. `checkInput` of the contract finds it, and `packing` exports `checkInput`.
12. The arguments of the hard rules. `packing`: `checkHard(input, output, { overlap })` reads the packer input and the output. The contract: `packHard(before, after, overflow, overlap)` reads two files, with `after` from `applyPack`. No decision applies.
    - **Closed in `layout-contract` 0.2.0:** `packHard(input, output, tolerance)` applies the output itself. The contract removed the old form. The input of `packHard` is a file, and its tolerance is a number.
13. The parts that are not in the contract. The table above puts these parts in the contract: the converters `toPackInput` and `toLayoutRecord`, the common fields of a strategy and the measure names. The contract 0.1.0 has `toPackInput` and `applyPack`, but not the other parts. Decision 5 and the table favor the plan.
    - **Closed in `layout-contract` 0.2.0:** the contract has `toLayoutRecord`, `StrategyInfo`, `MeasureSpec`, `Direction` and `JOINT_MEASURES`. `applyPack` goes from an output back to a file. The `pack.*` specs stay in `packing` as the source, with the type `MeasureSpec`.
14. The side of a port, new in 0.2.0. `packing`: `Port.side` is necessary. The contract: `Port.side` is optional, and the router picks the side. Thus a contract port without a side does not fit `packing`. `packing` closes this gap in its 0.2.0, when it imports the contract.
    - A port without a side is a port of the routing cell `ports` set to `free`. The router picks its side. Thus `packing` makes `side` optional in its 0.2.0.
    - **Closed in `packing` 0.2.0:** `Port` is the type of the contract, with an optional `side`.
