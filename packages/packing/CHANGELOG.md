# Changelog

## 0.2.10

A fix of a hard-rule break of the strategy `skyline`, roadmap item k63. This release has no breaking changes. The default `pack()` and the outputs of rectangle containers do not change.

### Fixed

- In a container with a free size and a circle, ellipse or polygon shape, `skyline` put identical boxes on top of each other. `checkHard` found the breaks as `no-overlap`.
- The cause: `packFree` tries the width of the widest box. When that width is not a whole number, the box needs one cell more than the skyline has.
- The skyline of a shaped space put such a box at the left edge, but it did not move the skyline up. Thus the next such box went to the same place.
- Now the box goes to the first y where each cell is free over its height, and each cell starts after it. This is the same rule as the plain skyline.

### Changed outputs

- Only `skyline` changes its output, in a shaped container with a free height, and only for a box wider than the cells of the skyline.
- In a sweep of `rect-grid`, each changed input had the size `freeArea` or `freeAspect`, and a convex, polygon, circle, ellipse or holes shape.
- `rows`, `shelf`, `push`, `maxrects`, `portfolio` and the outputs of rectangle containers do not change.

## 0.2.9

A dependency update with one behavior change of the opt-in strategy `portfolio`. The default outputs do not change.

### Changed

- `@mark1russell7/layout-contract` is `^0.2.7`. Its `compareMeasure` compares two values on the grid of the records, in whole steps of `RECORD_EPS`.
- Thus `packPortfolio` and the strategy `portfolio` find a tie at the `minEffect` limit without float noise. A pick changes only on such an input.
- `PORTFOLIO_SETS` is generated again with the new compare, from the same run 40652567756. More inputs are ties, so the win shares go up. Some cells choose a different second or third member, so the strategy `portfolio` changes its output on these cells.

### Behavior change

- The new `PORTFOLIO_SETS` changes the output of the strategy `portfolio` on some cells. These cells choose other members, or the same members in another order. For example, `maxrects-cp` replaces `maxrects-bssf`, and `skyline` replaces `maxrects-bl`.
- Before 1.0, a change of an exported output that callers rely on is a break. Thus a later change of the set table is a MINOR release. This release stays a PATCH, because it is on npm.

## 0.2.8

A fix of the opt-in portfolio. This release has no breaking changes. The default outputs do not change.

### Fixed

- The key of `packPortfolio` reads the measures after `roundMeasures`, as a record keeps them. Before, the key read the exact values.
- On screen 6, the report replay of the records and the live pick did not agree on 3 of 522 inputs for `portfolio-k2`, and 7 for `portfolio-k3`. The two values of each of these inputs were near the `minEffect` limit.
- Now a replay of the records gives the pick of the strategy `portfolio`.

## 0.2.7

The per-cell portfolio of roadmap item k20, part 2. This release has no breaking changes.

### New

- The strategy `portfolio` packs an input with the set of its cell. It is opt-in. `composites` lists it, and `strategies` does not.
- `portfolioCell(input)` gives the cell: the container shape, the band of the item count and the band of the size spread.
- `spreadOf`, `spreadBand` and `SPREAD_THRESHOLDS` (0.02 and 0.27) give the band of the size spread. `cellKey` gives the key of a cell.
- `PORTFOLIO_SETS` is the table of the sets of 1, 2 and 3 members of each cell. The run 40652567756 of `pack-screen-v1` gave it.
- `portfolioMembers(input, k)` and `portfolioSetOf` look up the cell, then the shape, then the fixed default. A cell with fewer than 12 inputs is thin.
- `portfolioDefaultMembers` and `PORTFOLIO_FRAME_MS` (50 ms) give the default member count of a cell. The count is a constant of the table.
- Without options, the strategy `portfolio` runs the default count. The option `k` runs each member of the set of `k`.
- The options `maxMembers` and `budgetMs` go to the contract. `budgetMs` has no default, so the default output does not read the clock.
- `packPortfolio` also takes a function `(input) => members`.
- The bench has the composite entries `portfolio-k2` and `portfolio-k3`. They are not in the pool of the portfolio report.
- The portfolio report gives the mean regrets against the oracle, the keep rate, and the scores at `default`, 50 ms, 200 ms and 1000 ms.
- `bench/choose-sets.ts` writes `src/portfolio-sets.ts` from the records of a run.
- The corpus `pack-holdout-v1` has the specs of `pack-screen-v1` with the new seeds 6 and 7: 522 inputs.
- A corpus file can set the held-out split in the field `heldOut`. `pack-holdout-v1` has `all`.

### The outputs

- The placements of each existing strategy and entry do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.

## 0.2.6

The portfolio report and `packPortfolio` of roadmap item k20, part 1. This release has no breaking changes.

### New

- `packPortfolio(members, options?)` packs an input with each member and keeps the best output. It is opt-in.
- The pick is `selectBest` of the contract on `PORTFOLIO_LEVELS`: the hard breaks, `pack.overflow.excessArea` and `pack.fill`.
- `hardBreaks` gives the sum of `checkHard` with `exactContainer`. It is the level `hard` of the pick.
- The output of the winner gets the trace stage `portfolio` (`PORTFOLIO_STAGE`) with the measure `move.pick` of `pickMoves`.
- `outputHash` is now in the package. Its bytes do not change: each hash of the records of 0.2.5 stays the same.
- The package exports the types `Portfolio`, `PortfolioPick`, `PortfolioTrace`, `MemberTrace` and `SelectLevel` of the contract.
- The bench has a portfolio report in `run.json` and a section `Portfolio` in `summary.md`. It reads the records only.
- The report gives the oracle, the best single entry, the greedy sets of 2 and 3 entries, the sole wins and the losers.
- The report chooses each set on the seeds other than 3. It scores each set on the held-out seed 3.

### Changed

- The dependency `@mark1russell7/layout-contract` is now `^0.2.6`.

### The outputs

- The placements of each strategy do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.
- The bench has no new entry.

## 0.2.5

The MaxRects family of roadmap item k24. This release has no breaking changes.

### New

- The strategy `maxrects` and the function `packMaxRects` pack with a list of maximal free rectangles. `pack` takes `strategy: "maxrects"`.
- The option `rule` is `bssf` (the default), `blsf`, `baf`, `bl` or `cp`. `MAXRECTS_RULES` and the type `MaxRectsRule` list them.
- Each rule has its move: `move.bssf`, `move.blsf`, `move.baf` and `move.cp` count a place that the rule `bl` does not choose.
- The move of `bl` is `move.split`: a box that cuts 2 free rectangles or more. Each rule also counts it.
- A plain rectangle gets exact free rectangles. Another container shape gets an inner approximation with bands.
- The option `bandHeight` sets the largest height of a band. The default is the height divided by `MAXRECTS_BANDS` (128).
- The locked items and the obstacles are walls. With a fixed size, a box with no place goes to the overflow.
- The option `rotate` of the strategy `maxrects` turns a box with `turnable` a quarter turn when the turn gives a better score.
- The bench has the entries `maxrects-bssf`, `maxrects-blsf`, `maxrects-baf`, `maxrects-bl` and `maxrects-cp`. Their base is `maxrects-bl`.
- The smoke check needs the coverage 1 for each of these entries.
- The ranking of the bench gives a fill tie group to the neighbour entries with a fill within 0.005. The summary marks each tie.

### The outputs

- The placements of each other strategy do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.

## 0.2.4

The shelf family of roadmap item k21, and one name for the area bound. This release has no breaking changes.

### New

- `packShelf`, `pack` and the strategy `shelf` have the optional option `fit`: `next`, `first` or `best`. `SHELF_FITS` and the type `ShelfFit` list them.
- `fit: "next"` uses only the open shelf. `fit: "first"` uses the first shelf where the box fits. `fit: "best"` uses the shelf with the least height left over.
- With a `fit`, `shelf` opens its own shelves in the free spans of each container shape. A box can also stack in the strip above a shorter box.
- The trace of `shelf` with a `fit` counts `move.stack`, `move.firstFit` and `move.bestFit`. `docs/PACKER.md` tells the rules.
- The bench has entries: each strategy of the registry, and the variants `shelf-next`, `shelf-first`, `shelf-best` and `shelf-first-input`. Each record has the options of its entry.
- The activation of a variant also counts the inputs where its output is not the output of its base, `shelf`.
- The smoke check needs the coverage 1 for each variant.
- The bench gives the two-step ranking of roadmap item k60 for each container shape. `docs/BENCH.md` tells it.
- Step 1 ranks by the median `pack.overflow.excessArea`. Step 2 ranks each tie group by the median `pack.fill` on the common clean inputs.
- The table `Overflow` gives the means of `pack.overflow.forcedArea` and `pack.overflow.excessArea`, and their medians.
- The smoke check fails when `pack.overflow.forcedArea` is above `pack.overflow.area + 1e-9` on a record.

### Deprecated

- `pack.overflow.forcedAreaMin` is now a deprecated alias of `pack.overflow.forcedArea`. It has the same value. It stays until the next minor version.
- Use `pack.overflow.forcedArea`. `pack.overflow.excessArea` is `pack.overflow.area` less `pack.overflow.forcedArea`.
- A test shows that the two values are equal on generated inputs of each container shape, fixed and free.

### The outputs

- Without `fit`, the placements of each strategy do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.

## 0.2.3

New overflow measures by area (roadmap item k60), and the move counts and screen guards of k59. This release has no breaking changes.

### New

- `measure` gives 2 new measures: `pack.overflow.forcedAreaMin` and `pack.overflow.excessArea`. `docs/MEASURES.md` defines them.
- `pack.overflow.forcedAreaMin` is the tight lower bound of the overflow area: the area of the too-long items, plus the area of the rest above `F`.
- `pack.overflow.excessArea` is `pack.overflow.area` less `pack.overflow.forcedAreaMin`. A difference from `-1e-9` to 0 becomes 0.
- The count bound `pack.overflow.forced` is weak on mixed sizes. Judge a strategy by `pack.overflow.excessArea`.
- `MeasureId` and `LayoutMeasures` have the 2 new ids. `MEASURE_SPECS` has 22 specs. The new specs are in the family `overflow`, with `minEffect` 0.005.
- `pack.overflow.forced`, `pack.overflow.forcedArea` and `pack.overflow.excess` stay. `pack.overflow.forcedArea` is a diagnostic with the value of `forcedAreaMin`.
- A property test shows `forcedAreaMin <= overflow.area + 1e-9` for each strategy on generated inputs of each container shape, fixed and free.
- The trace of each strategy counts its characteristic move: `move.gapFill` (rows), `move.stack` (shelf), `move.lowerWindow` (skyline) and `move.cascade` (push). The counts do not change a layout.
- The bench gives the screen guards of roadmap item k59: the fill without overflow, the overflow, the output groups, the cell groups, the activation and `pack.outsideExact`. `docs/BENCH.md` tells them.

### The outputs

- The placements of each strategy do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.
- Each record of the bench has the 2 new measures.

## 0.2.2

New overflow measures with a forced bound, a minimum effect for each measure and an exact container test (roadmap item k59). This release has no breaking changes.

### New

- `measure` gives 5 new measures: `pack.overflow.rate`, `pack.overflow.area`, `pack.overflow.forced`, `pack.overflow.forcedArea` and `pack.overflow.excess`.
- `pack.overflow.forced` is a lower bound of the overflow of a fixed container. `docs/MEASURES.md` defines it, with the free area of each container shape.
- `MeasureId` and `LayoutMeasures` have the 5 new ids. `MEASURE_SPECS` has 20 specs, in the family `overflow` for the new ids.
- Each spec of `MEASURE_SPECS` has `minEffect`, except `pack.search.ms`. `docs/MEASURES.md` has the table "The minimum effects".
- `checkHard` takes an optional fourth parameter `options` of the type `ContainerTest`. With `{ exactContainer: true }`, `in-container` also tests the true outline of a shaped container with the size `fixed`.
- That test uses `rectInRegion` of the contract, as `packHard` does. The default `false` keeps the counts of 0.2.1.
- New export: the type `ContainerTest` of the contract.
- The dependency `@mark1russell7/layout-contract` is `^0.2.4`, for `minEffect`, `compareMeasure`, `rectInRegion` and `ContainerTest`.

### The outputs

- The placements of each strategy do not change. The fixture `bench/fixtures/rect-hashes.json` still pins them.
- Each record of the bench has the 5 new measures.

## 0.2.1

One container layer gives the free space of each container shape (roadmap item k37). `rows`, `shelf` and `skyline` now pack a circle, an ellipse, a convex polygon, a polygon and a polygon with holes. This release has no breaking changes.

### New

- `freeSpace(input)` gives a `FreeSpace`: `band`, `column`, `fits`, `fitX`, `nextY`, `w`, `h` and `plain`. `docs/PACKER.md` describes it.
- New exports: `freeSpace`, `FreeSpace`, `FreeSpan`, `SpaceRect` and `SkylineOptions`.
- `pack`, `packRows`, `packShelf` and `packSkyline` take an optional `space`. Without it, or with a plain space, the output does not change.
- `lowestWindow` takes an optional `limit` for each cell and the height `rh` of the rectangle.
- The strategies `rows`, `shelf` and `skyline` declare each `containerShape`. `rows` also supports `obstacleMove` `fixed`: it goes around the obstacles and the locked items.
- The bench writes `coverage` in `run.json` for each strategy and each container shape. `summary.md` has a Coverage table. A prediction can use the measure `pack.coverage`.

### The outputs

- The output of each strategy on a rectangle container with rectangle obstacles does not change. The fixture `bench/fixtures/rect-hashes.json` pins the `outputHash` of 294 inputs.
- A circle and an ellipse use a closed form, made smaller by `EPS` (`1e-6`). A polygon uses its edges and the even-odd rule, so its holes stay empty.
- `checkHard` and `packHard` still test the container as its bounding box. The tests of the layer test the true outline.

## 0.2.0

`packing` imports its data types from `@mark1russell7/layout-contract` `^0.2.1`. Each gap of the type fit in `docs/PACKER.md` is closed (roadmap item k57). This release has breaking changes.

### The renames

| The old name | The new name |
|---|---|
| `Container` | `LayoutContainer` |
| `Edge` | `LayoutEdge` |
| `HardBreaks` | `PackHard` |
| `Margin` (the four sides) | `Sides` |

- `Margin` is now `number | Sides`, the type of the contract. Change each `Margin` that has four sides to `Sides`.
- `marginOf` returns `Sides`. The value does not change.

### The other breaking changes

| The change | The change that a caller makes |
|---|---|
| Each field and each array of the shared types is `readonly`. | Make a new object with a spread. Do not change an input or an output. |
| `PackOutput.trace`, `StageTrace.ms` and `StageTrace.measures` are optional. | Read them with `?? []` or `?.`. |
| `Port.side` is optional. | Read a port with no side as a port that the router puts on a side. |
| `LayoutInput` is the type of the contract. Each field is optional, except `schema`, `id` and `boxes`. | Use `GeneratedInput` for the output of a generator. |
| `change` is `add`, `remove`, `resize`, `reorder` or `packed`, not any string. | Use one of these five values. |
| The generators and `corpus().inputs` give `GeneratedInput`. | Change the type `LayoutInput` to `GeneratedInput` where the code reads a field of a generator. |
| `GeneratorStamp.params` and the fields of `MeasureSpec` are `readonly`. | Make a copy before a change. |
| `hashInput` reads a `LayoutInput` of the contract. | No change, except for a type that is not a `LayoutInput`. |
| `checkHard` reads a circle, an ellipse and a polygon with holes exactly, as `packHard` does. An item in the bounding box of a circle, but out of the circle, is not an overlap. | Expect lower `no-overlap` counts with these obstacles. Update the stored counts. |
| `checkHard` skips a locked item with no position. It gives no break for it. | Use `checkInput` to find this bad input. |
| `@mark1russell7/layout-contract` is a dependency at run time. | No change. The package manager installs it. |

### New

- New exports: `checkInput`, `Side`, `Sides`, `GeneratedInput`, `LayoutContainer`, `LayoutEdge` and `PackHard`.
- `toPackInput` reads a file with no container as `{ fixed: "none" }`.
- The test `src/contract-fit.test.ts` shows that each shared type is the type of the contract. It pins each difference that stays, with its reason.

## 0.1.7

- New: the optional fields `floor` and `tol` of `MeasureSpec`. `MEASURE_SPECS` is the source of the floor and the tolerance of each guard of the floor rule.
- New: the optional field `data` of `Item` and `Edge`, with the type of the contract. The turn and `toPackInput` keep it.
- Fix: `checkHard` counts a locked item with no placement only in `locked-kept`, not in `complete`.
- Fix: `checkHard` keeps a locked item with no placement at its input position for `no-overlap` and `in-container`.
- The test of the type fit uses `@mark1russell7/layout-contract` at commit `710ec51`. It shows that gaps 5 and 11 are closed (roadmap item k57).

## 0.1.6

- Fix: in the rule `in-container`, `checkHard` makes each fixed side smaller by `container.inset` (decision 3).
- Fix: for a shaped item, `checkHard` uses the bounding box of its turned `shape`, not `w` by `h` (decision 5).
- Change: `Supports` is a type alias, not an interface. It has the same fields, and it fits the record `Supports` of the contract.
- The test of the type fit with `@mark1russell7/layout-contract` shows that gaps 6, 9 and 10 are closed (roadmap item k57).

## 0.1.5

- New: `docs/MEASURES.md` defines each measure of the packer, with its range, unit, direction and edge cases (roadmap item k8).
- New: `measure(input, output)` gives the measures of one layout by id. `measureChange` gives the stability measures of a change pair.
- New: the measure `pack.stability.q95`: the quantile 0.95 of the moves of the items that stay, in widths of the container.
- New: `isDeterministic(first, second)` gives the measure `pack.deterministic`. The trace is not part of the rule.
- New: `MEASURE_SPECS` gives the family, the unit, the direction and the range of each measure id.
- New: `roundMeasures` rounds a record of measures as `docs/FORMAT.md` tells. The measure functions do not round.
- New: the ratio helpers `pairedRatio`, `quantile`, `medianRatio` and `tailShare` for the promotion screen.
- `packingMetrics` uses the hull and the rows of `measure`. Its output stays the same.

## 0.1.4

- New: the seeded generators of the corpus (roadmap item k19). Each generator writes `layout-input/1` files, as `docs/FORMAT.md` tells.
- New: `rectScattered` is the shared generator `rect-scattered` version 1. Its 3 pinned hashes stay the same.
- New: `rectGrid` covers each value of `containerSize`, `containerShape`, `obstacles` and `sizes`, with counts from 0 to 100000.
- New: `gallery`, `dashboard`, `cards` and `wordCloud` make the families of a user interface. `edgeCases` makes the inputs at the limits.
- New: `corpus(name, specs)` gives the manifest `layout-corpus/1` and the input files. `generators` and `generator(name)` give the generators.
- New: `fnv1a32`, `round3`, `canonicalJson`, `hashInput`, `countCell` and `toPackInput`, with the types `LayoutInput` and `CorpusCell`.
- The hash uses a SHA-256 in plain TypeScript. Thus the generators also operate in a browser.

## 0.1.3

- New: the Packer interface of `docs/PACKER.md` (roadmap item k7). The data types `PackInput`, `Item`, `Container`, `Obstacle`, `Region`, `Port`, `PackOutput`, `Placement` and `StageTrace` are plain data.
- New: `Strategy`, `Supports`, `PackContext`, `SizeSearch`, `cellOf`, `supportsCell` and `UnsupportedCell`. Each strategy declares its cells, and refuses an input outside them.
- New: the strategies `rows`, `skyline`, `shelf` and `push` put the functions of 0.1 behind the interface. The size search `logSweep` wraps `packFree`.
- New: the adapters pack each item with its margin, keep the gap and the inset, go around locked items and rectangle obstacles, and turn the axes for a fixed height.
- New: the registry `strategies`, `strategy(id)` and `packWith(id, input, options, seed)`.
- New: `checkHard` counts the breaks of the 4 hard rules of the packer. The result has no tolerance in it.
- New: the turn helper `turnItem` (with `turnPoint`, `turnPort` and `turnRegion`), `marginOf`, `EPS`, `RECORD_EPS` and `DEFAULT_TOLERANCE`.
- New: `fromRects` and `toRects` connect the interface to the `Rect` objects of 0.1. `mulberry32` and `createContext` give the seeded context.
- Fix: `packRows` put a rectangle of a gap fill in a gap fill at a double offset, out of the width. Now it stays in its region.

## 0.1.2

- New: `packFree` packs with a free width. It tries many widths with a strategy of `pack`, and keeps the width with the lowest objective: the area of the bounding box times `1 + aspectWeight * aspectError`. The target aspect is 1 by default. The result gives the size, the fill, the aspect error and each width that the search tried.
- New: `aspectError` gives the distance between an aspect and a target aspect on a log scale.

## 0.1.1

- New: `packShelf` packs into shelves, left to right in the sort order, and goes around each `locked` rectangle. With the sort order `input`, the rows read in the order of the array, also around locked rectangles. With the default `height-desc`, it is Next-Fit Decreasing Height.
- New: the strategy `shelf` of `pack`.

## 0.1.0

- The first release as `@mark1russell7/packing`. The code and its history come from `@mark1russell7/render-pack` 0.1.1, with no change of the API. The versions under this one are the versions of `render-pack`.
- New: the sort order `input` keeps the order of the array of the caller. `packRows` then fills no gaps, so its rows read in that order. The default stays `height-desc`. (`render-pack` 0.1.2 has it too.)

## render-pack 0.1.1

- New: `pushCascade` moves the rectangles that a placed rectangle overlaps, and the rectangles that those overlap in turn. The placed rectangle and each locked rectangle stay. (#8)
- New: `packingMetrics` measures a packing: the hull and its aspect, the rows, the raggedness, the utilization of the hull and the widest rectangle against the median. (#8)

## render-pack 0.1.0

- The first release: `pack`, `packRows`, `packSkyline`, the sort orders, `Rect` with `locked`, and `Vector`. (#7)
