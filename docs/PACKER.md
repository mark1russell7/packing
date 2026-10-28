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
| `PackInput` | `PackInput` | A `container`, the `items`, and the optional `obstacles` and `gap`. |
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
  itemShape: ("rect" | "circle" | "convex" | "polygon" | "mixed")[];
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

## The registry

```ts
const strategies: Strategy[]; // each single strategy of the package
const composites: Strategy[]; // each composite strategy: "portfolio" since 0.2.7, then "aspect-fit" and "select"
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
| `packFree` | the size search `log-sweep` | It wraps `rows`, `skyline`, `shelf` and `maxrects`. `push` moves the items from their start positions, so a size search does not fit it. |

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
