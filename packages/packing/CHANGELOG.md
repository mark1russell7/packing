# Changelog

## 0.10.3

The function `repackPinned` packs a changed input again, and moves as few boxes as it can (roadmap item k31).

This release raises the PATCH version. Before 1.0.0, a new feature raises PATCH.

### Added

- `repackPinned` pins each unchanged box. If an item overflows, it keeps only the prefix, and then it packs fresh.
- The types `Repacked` and `RepackMethod`.
- The read `bench/repack.ts` and its section in `docs/BENCH.md`.

### Not changed

- The outputs of each strategy do not change.
## 0.10.2

The strategy `shelf-online` packs a strip online. Each box takes a shelf of its class of height when it comes, and it does not move later.

This release raises the PATCH version. Before 1.0.0, a feature raises PATCH.

### Added

- The functions `shelfOnline` and `shelfOnlineRefusal`, and the types `ShelfOnlineFit`, `ShelfOnlineOptions` and `ShelfOnlineResult`. These are the shelf algorithms of Baker 1983 with the parameter `r`.
- The strategy `shelf-online` in `standaloneStrategies`, the option `shelf-online` of the stage `placement` of `packSpace` with the params `r` and `fit`, and the bench entry `shelf-online`.
- The entry `shelf-online` of `strategyCatalog`.

### Not changed

- The outputs of each other strategy do not change. Each old named config of `packSpace` keeps its `configId`.

## 0.10.1

The strategy `shelf-breaks` packs a strip into rows in the reading order, with the breaks of the least height.

This release raises the PATCH version. Before 1.0.0, a feature raises PATCH.

### Added

- The functions `shelfBreaks` and `shelfBreaksRefusal`, and the type `ShelfBreaksResult`. The height is at most the height of the greedy shelf in the same order.
- The strategy `shelf-breaks` in `standaloneStrategies`, the option `shelf-breaks` of the stage `placement` of `packSpace`, and the bench entry `shelf-breaks`.
- The entry `shelf-breaks` of `strategyCatalog`.

### Not changed

- The outputs of each other strategy do not change. Each old named config of `packSpace` keeps its `configId`.

## 0.10.0

The strategy catalog states a read of the output of each strategy: the positions and the sizes, on whole-number inputs.

This release raises the MINOR version. Before 1.0.0, a break raises MINOR, and an unclear break counts as a break.

### Breaking

- The file `strategy-catalog.json` has the schema `strategy-catalog/2`. A reader with `@mark1russell7/layout-contract` below `0.5.0` refuses this schema.

### Added

- Each entry of `strategyCatalog` has the field `output`. It has a row for `position-grid` and a row for `size-grid`, for each option set of the read.
- Each row states the class, the packed count, the option set and the input family. The contract gives the class from the counts.

### Not changed

- The outputs of each strategy do not change.
## 0.9.1

The class generators make 2 more container forms. Old params give the same bytes.

This release raises the PATCH version. Before 1.0.0, a feature raises PATCH.

### Added

- The generators `berkeyWang` and `martelloVigo` accept the values `freeAspect` and `freeArea` of `containerSize`. The type `ClassContainer` has these values.

### Not changed

- Each input of the values `fixed` and `freeHeight` has the same bytes. A test pins them.

## 0.9.0

`checkHard` takes the rules of version 2 of `@mark1russell7/layout-contract`, and the package uses the contract `^0.5.0`.

This release raises the MINOR version. Before 1.0.0, a break raises MINOR.

### Breaking

The meaning of two hard counts changes on circles and on shaped containers. A caller can read a different number for one placement. Each count on rectangles in a rectangle container stays the same.

- `no-overlap`: two circle items count by the distance of their centers. A pair whose boxes overlap and whose circles do not is not a break.
- `in-container`: a circle item in a circle container counts by distance, also with a free size.
- The default of `exactContainer` is `true`. A box of a shaped container with the size `fixed` must stay inside the shape. With `{ exactContainer: false }`, the old count stays.
- A bench record states the version of its rules in `hardRule`. A record without the field has version 1, so a page that compares across this change reads `hardRuleOf` of the contract.

### Not changed

- The strategies and the generators read `checkHard` with `{ exactContainer: false }`, so the outputs of each strategy on rectangle items stay byte-equal.
- `circleOverlaps` and `circlesOutside` keep their signatures. They call the rules of the contract.

## 0.8.0

A catalog file lists each strategy, `packSpace` has points for the standalone strategies, and `select` gives an unsupported cell to its next member.

This release raises the MINOR version. Before 1.0.0, a break raises MINOR, and an unclear break counts as a break.

### Breaking

Two changes can break a consumer:

- `packSpace` has points for the standalone strategies, so pinned values of `spaceSize` change. With 3 levels, `base` goes from 3801 to 3830. With 1 level, `base` goes from 1123 to 1138. The `meta` counts also grow.
- A `select` strategy with a member that does not support the input cell now gives the input to the next member that supports it. Before this release, that member threw its error.

The API report of 0.7.0 and of this version shows 0 removed names, 2 added names in the root and 2 new subpaths. The `bench-smoke` records of 0.7.0 and of this version have equal outputs.

### Added

- The subpath `./strategy-catalog` with `strategyCatalog` and `STRATEGY_CATALOG_ENGINE`, and the file `./strategy-catalog.json`. They declare each strategy and each option in the format of `@mark1russell7/layout-contract` (roadmap item k144).
- `MASONRY_METHOD_IDS` and `TREEMAP_METHOD_IDS`, the method ids of the two standalone strategies (roadmap item k142).
- The points of the standalone strategies in `packSpace` (roadmap item k142).

### Changed

- The breadth-first order of the hubs comes from `@mark1russell7/collections`, a new dependency.
- The dependency `@mark1russell7/layout-contract` is now `^0.3.10`, and `@mark1russell7/rigor-statistics` is now `^0.1.9`.

### Fixed

- The strategies of `select` give an unsupported cell to the next member (roadmap item k142).

## 0.7.0

`allStrategies` lists all 31 strategies, with opt-in circle packing, the Sleator strip, beam search and methods that follow a change of the input.

This release raises the MINOR version. Before 1.0.0, a break raises MINOR, and an unclear break counts as a break.

### Breaking

Two changes can break a consumer:

- `packSpace` has the new strategy `circle-quasi-physical`, so pinned values of `spaceSize` change. With 3 levels, `base` goes from 3798 to 3801. With 1 level, `base` goes from 1122 to 1123. The `meta` counts also grow. The rect counts and the old named config ids do not change.
- `allStrategies` goes from 21 to 31 ids. A consumer that pins the count or lists each id sees new ids.

The API report of 0.6.1 and of this version shows 0 removed names, 37 added names in the root and 1 new subpath. No declaration of 0.6.1 changes. The default outputs do not change.

### Added

- `allStrategies` lists each standalone layout function: `sleator`, `beam`, `exact-strip`, `binary-height`, `near-rects`, `raster-nofit`, `masonry`, `treemap` and `side-anchors` (roadmap item k141). The new names are `standaloneStrategies`, `sideAnchorsStrategy`, `STANDALONE_MAX_ITEMS`, `EXACT_STRATEGY_NODE_LIMIT` and the types `MasonryMethod`, `MasonryStrategyOptions`, `SideAnchorStrategyOptions`, `TreemapMethod` and `TreemapStrategyOptions`.
- The opt-in strategy `circle-quasi-physical` for circles, with its own subpath `./circle-quasi-physical`, and the names `circleQuasiPhysical`, `circlesOutside`, `CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS`, `CIRCLE_QUASI_PHYSICAL_STAGE` and `CircleQuasiPhysicalOptions` (roadmap item k94).
- The Sleator strip as a baseline with a proved bound: `sleatorStrip`, `sleatorRefusal` and the type `SleatorResult` (roadmap item k52).
- The beam search on a strip: `beamStrip`, `BEAM_WIDTH` and the types `BeamOptions` and `BeamResult` (roadmap item k85, first slice).
- The generator `change-walk` and the corpus `pack-change-v1`: `changeWalk`, `changeGenerators`, `CHANGE_WALK_KINDS`, `CHANGE_WALK_STEPS` and the types `ChangeWalkKind` and `ChangeWalkParams` (roadmap item k48).
- Methods that follow a change of the input: `pinUnchanged` with the type `PinnedInput` and `keepOrthogonal` (roadmap item k29), `compactUp` and `keepPrefix` (roadmap item k30), `windowOrder` and `matchPlaces` (roadmap item k31).
- The row legalizer: `legalizeRows`, `placeRow` and the type `LegalizeOptions` (roadmap item k82).

## 0.6.1

`allStrategies` gives one list of each strategy, with near-rectangle packing and side anchors as new functions.

This release raises the PATCH version: it adds exports and changes no default output. The API report of 0.6.0 and of this version shows 0 removed names and 12 added names.

### Added

- `allStrategies`, the one list of every strategy, with the types `StrategyKind` and `StrategyListing` (roadmap item k140). A listing gives the id, family, kind, supports and deterministic flag of a strategy. A test fails on an exported strategy outside the list.
- `packNearRects`, with `NEAR_RECTS_STAGE` and the type `NearRectsOptions`, which joins shapes into groups and packs one box for each group (roadmap item k97, first slice).
- `packSideAnchors` and `checkSideAnchors`, with the types `AnchorSide`, `SideAnchor`, `SideAnchorOptions` and `SideAnchorResult`, which keep an item at a side of the container (roadmap item k110, first slice).

## 0.6.0

The strategies `bottom-left` and `best-fit`, treemaps, masonry, a raster no-fit and an exact strip baseline.

This release raises the MINOR version. Before 1.0.0, a break raises MINOR, and an unclear break counts as a break.

### Breaking

Two changes can break a consumer:

- `MAXRECTS_RULES` gains `wire`, so the type `MaxRectsRule` gains a value. A consumer with an exhaustive `Record<MaxRectsRule, T>` gets a type error.
- `packSpace` has more options, so a pinned value of `spaceSize` changes.

The API report of 0.5.0 and of this version shows 0 removed names and 50 added names. `MaxRectsOptions` and `RelaxStrategyOptions` each gain one optional field.

### Added

- The strategies `bottom-left` and `best-fit`, with `bottomLeft`, `bestFit`, `BOTTOM_LEFT_RULES`, `BEST_FIT_SIDES` and their option types (roadmap item k25).
- The treemaps `treemapSliceDice`, `treemapSquarified`, `treemapStrip`, `treemapPivotSplit` and `treemapPack`, with their types (roadmap item k27).
- Masonry and ordered columns: `masonryShortest`, `masonryLpt`, `columnsLinearPartition`, `columnBalance` and `columnReading`, with their types (roadmap item k28).
- The raster no-fit for free forms: `packRasterNofit`, `rasterCell`, `rasterCover`, `RASTER_NOFIT_MAX_CELLS` and `RASTER_NOFIT_STAGE`, with their types (roadmap item k92, first slice).
- The exact strip baseline: `exactStrip`, `exactStripRefusal` and the limits `EXACT_STRIP_MAX_ITEMS`, `EXACT_STRIP_MAX_SIDE` and `EXACT_STRIP_NODE_LIMIT`, with their types (roadmap item k10, first slice).
- The binary search on the strip height: `packBinaryHeight`, `BINARY_HEIGHT_STAGE`, `BinaryHeightOptions` and `BinaryHeightResult` (roadmap item k81, first slice).
- The rule `wire` of `maxrects` places a box near its linked boxes (roadmap item k136). The named config is `maxrects-wire`.
- The option `pull` of `relax` moves boxes toward their links (roadmap item k137). The constant is `RELAX_PULL_MAX_BOXES`, and `packSpace` has the meta option `relax-pull`.
- The option `score` of `MaxRectsOptions`, with the type `MaxRectsScore` (roadmap item k83, first slice).
- `configOfStrategy`, the type `StrategyPoint` and the named config `pack` of `packSpace`, with `PACK_DEFAULT_TABLE` (roadmap item k135).
- The order `graph-bfs` in `packSpace`, which reads `input.links`.
- A subpath export for each of `default`, `guillotine`, `hole-degree`, `maxrects`, `push`, `rows`, `shelf` and `skyline` (roadmap item k132).

### Changed

- `packSpace` has more options, so `spaceSize` is larger. The ids of the 60 named configs of 0.5.0 do not change, and 9 named configs are new.
- The dependency `@mark1russell7/layout-contract` is `^0.3.3`.
- The new dependency `@mark1russell7/rigor-generators` is `^0.1.1`. `mulberry32`, `fnv1a32` and `boxesOverlap` use their homes.

## 0.5.0

The graph order `graph-bfs` and the option `links` make `pack` read the links between boxes.

This release raises the MINOR version. Before 1.0.0, a breaking change raises MINOR, and the two breaks below are breaking changes. The release train publishes it.

### Added

- The graph order `graph-bfs` (roadmap item k131). It starts at the item with the largest sum of link weights and goes breadth-first. Each next component starts at its own hub. Without links, it gives `area-desc`.
- The option `links` of `pack`, `packRows`, `packMaxRects`, `packSkyline`, `packShelf` and `packGuillotine`: a list of `ItemLink` (`a`, `b`, `weight`), as indexes into the array of the rectangles.
- `graphOrder`, `orderRects`, `isGraphOrder`, `GRAPH_ORDERS` and the types `ItemLink`, `GraphOrder` and `ItemOrder`. `ItemLink` is the `PackLink` of `@mark1russell7/layout-contract`.
- The strategies `rows`, `skyline`, `shelf`, `maxrects` and `guillotine` of the registry read `input.links` of `@mark1russell7/layout-contract` 0.3.1. With `sortOrder: "graph-bfs"`, `packWith` packs the items in the graph order of the links.

### Changed

- The option `sortOrder` of these functions and of `LayoutStrategyOptions` has the type `ItemOrder`, a sort order or a graph order. Each sort order gives the same layout as before, also for an input with links.
- The dependency `@mark1russell7/layout-contract` is `^0.3.2`. The release train sets the range.

### Breaking

- `LayoutStrategyOptions.sortOrder` is an `ItemOrder`, not a `SortOrder`. Fix: a caller that passes the option on to a `SortOrder` checks `isGraphOrder(order)` first.
- The types of `@mark1russell7/layout-contract` 0.3 replace the types of 0.2. For example, `deterministic` of a record is `boolean | null`. Fix: read the CHANGELOG of layout-contract 0.3.0, and treat `null` as "no claim".

## 0.4.1

### Added

- The composite strategy `relax` (roadmap item k124, catalog row `overlap-vpsc`). It packs with a member, then spreads the slack of each fixed side evenly. The satisfy step of VPSC keeps the order and removes each overlap. The options are `member` and `strength`. Nothing default uses it.
- `RELAX_STAGE`, `RELAX_MAX_CONSTRAINTS` and `RelaxStrategyOptions`.
- The bench entries `relax-rows`, `relax-maxrects-bl` and `relax-skyline-bl-waste`, with the move `move.relax`.
- `packSpace` has the meta option `relax` with the param `strength`.
- The composite strategy `force` (roadmap item k125, catalog rows `overlap-spring` and `overlap-prism`). It packs with a member, then pushes the boxes apart toward one target gap. The rounds of PRISM and the separation of VPSC remove each overlap. The options are `member`, `iterations` and `rounds`. Nothing default uses it.
- `FORCE_STAGE`, `FORCE_MAX_BOXES`, `FORCE_MAX_FIXED` and `ForceStrategyOptions`. `FORCE_MAX_BOXES` counts only the moving boxes. When a cap stops the pass, the trace measure `force.capped` is 1.
- The bench entries `force-rows`, `force-maxrects-bl` and `force-skyline-bl-waste`, with the move `move.force`.
- `packSpace` has the meta option `force` with the params `iterations` and `rounds`.

## 0.4.0

The balance and the stability by alignment, roadmap item k123. The contract `@mark1russell7/layout-contract` 0.2.19 computes them, so the joint records get the same values.

### Breaking changes

- `MeasureId` and `LayoutMeasures` have the 7 balance ids. A `Record<MeasureId, ...>` of a caller needs the new keys. `ChangeMeasures` has `pack.stability.procrustes`.

### Added

- Each record has `pack.balance.gapCv`, `pack.balance.centroidOffset`, the four `pack.balance.side.*` values and `pack.balance.sideRange`. The specs of these ids declare only `rect`.
- A change pair has `pack.stability.procrustes`: the aligned move of the box centers, in `W`, divided by the change share.
- Each bench record has `pack.stability.seed`: the aligned move between the outputs of the seed and the seed plus 1.
- The new functions `balanceContainerOf`, `stabilityUnitOf` and `measureSeed`, and the type `PackBalanceId`.
- The compare page of the site shows the fill against the side skew, with the front of the strategies that no other strategy beats.

### Changed

- The dependency `@mark1russell7/layout-contract` is `^0.2.19`.

## 0.3.0

The default `pack()` reads the table of `select` for a fixed size (step A of roadmap item k58), with the strategies, measures and input families since 0.2.17. This release has three breaking changes.

### Breaking changes

- `pack()` without `options.strategy`: a container of fixed size now uses the pick of `SELECT_TABLE`, `packRows` or `packMaxRects` with the rule `bl`. A free size, a fixed width and a fixed height keep `packRows`, byte for byte. A caller that needs the old output passes `strategy: "rows"`. An explicit `strategy` does not change. `select` passed the win test against `rows` on two fresh-seed corpora (roadmap item k66).
- The cell `itemShape` is `itemShapeOf` of the contract: `rect`, `polygon`, `circle`, `free` or `mixed`. The value `convex` becomes `polygon`, and an ellipse item is `free` (roadmap item k91).
- The measure `pack.gap` is a share from 0 to 1 since roadmap item k118: `1 - bound / result`. Before, it was a ratio with no upper limit. Its bounds count the margins and the gap.

### Added

- `defaultLayoutOf(rects, outer, options)` gives the choice of `pack()` without a strategy. `rectFeatures(rects, space)` gives the features of `SELECT_TABLE` for rectangles.
- New strategies: `guillotine` with each rule to choose and to split (k23), the `skyline` rules `bl` and `mw` with a waste map and rotation (k22), and `hole-degree` for circles (k90).
- New composite strategies: `restarts` (k78), `bbox` for shapes by their bounding boxes (k91), `ruin-recreate` (k79), `overlap-min` (k80), and the order searches `anneal`, `genetic` and `tabu` (k26).
- A work budget for the composite strategies (k117), and stability when an anchor moves (k111).
- `packSpace` and `packConfig`: the strategy space of packing as data, with shape kinds and each option as a parameter (k68, k75).
- Lower bounds and `pack.gap` for each cell (k51, k118), inputs with a known best value and `pack.gapToOpt` (k45).
- Input families: the classes I to X of the literature (k106), the published strip packing and nesting sets, generated by their rules (k46), and adversarial families with a scaling ladder (k107).

### Fixed

- No overlap with touching obstacles and large knobs (k114).
- The measures of a `bbox` output use the placed boxes (k113).

### Changed

- Dependencies: `@mark1russell7/layout-contract` 0.2.9 to 0.2.17, for the bbox space, the safe hard-rule check, `pack.shapeFill`, `portPoint` and the pair gaps.

## 0.2.17

A faster row packing, the end of roadmap item k67. This release has no breaking changes. Each output stays the same, byte for byte.

### Changed

- The row packing (`rows`) packs each width of the size search one time. Before, it started again each time a row went past the height limit, up to 17 times for each width.
- A gap fill reads the sorted list itself, skips the locked loop, and stops when no item that is left fits.
- A free size with 100 items now takes about 2 to 4 ms in the size search, against about 40 ms in 0.2.16. The widths that the search tries do not change.

## 0.2.16

A faster row packing, roadmap item k67. This release has no breaking changes. Each output stays the same, byte for byte.

### Changed

- The row packing (`rows`, the default of `pack()`) sorts the rectangles once for each call. Before, it sorted them again for each try of the height and for each gap fill.
- A free size with 100 items now takes about 40 ms in the size search, against about 390 ms before. The other inputs take about 0.7 of their time before.
- Bench: the merge job of `bench.yml` also reads a run with one strategy.

## 0.2.15

A default strategy for an input, roadmap item k66. This release has no breaking changes. `pack()` and every existing output do not change.

### Added

- `DEFAULT_STRATEGY` (`"select"`) and `packDefault(input, seed)`: they pack an input with `select`. `select` passed the v2 win test against `rows` on two fresh-seed corpora, `pack-select-v1` and `pack-select-v2`.
- Bench: the second test corpus `pack-select-v2` (2025 inputs, fresh seeds 31 to 35).

## 0.2.14

A new opt-in strategy, `select`, roadmap item k66. This release has no breaking changes. The default `pack()` and every existing output do not change.

### Added

- The composite strategy `select`: it reads the cheap features `count`, `fixed`, `rect` and `spread`, walks the decision table `SELECT_TABLE` (3 levels, 7 leaves) and packs with one member, `rows` or `maxrects` with the rule `bl`. Its trace stage `select` names the member and the feature values. New exports: `selectStrategy`, `selectFeatures`, `selectLeaf`, `checkSelectTable`, `SELECT_TABLE`, `SELECT_MEMBERS`, `SELECT_STAGE`, `SELECT_MAX_DEPTH` and their types.
- Bench: the entry `select-rows-bl`, the split files `bench/splits/<corpus>.<corpus hash>.json` with `cells.ts --split <name>`, and the test corpus `pack-select-v1` (2025 inputs, fresh seeds 21 to 25).

## 0.2.13

A speedup of the strategies `maxrects-*` and `portfolio`, roadmap item k64. This release has no breaking changes. Each output stays byte-equal.

### Changed

- `maxrects`: the cut of the free rectangles keeps the same parts without a sort. A new part goes when a part that stays on its side holds it, else it removes each part that it holds. The fixture `bench/fixtures/maxrects-hashes.json` does not change. In a CPU profile of the 20 slowest inputs of `pack-screen-v1` (1000 items in curved containers), the sort was 35% of the time.

## 0.2.12

A new opt-in strategy wrapper, `aspectFit`, roadmap item k62. This release has no breaking changes. The default `pack()` and every existing output do not change.

### Added

- `aspectFit(strategy, { targetAspect })` and the composite strategy `aspect-fit`: for a container of free size, a portfolio of widths around the target aspect (`ASPECT_FIT_FACTORS`), picked by `ASPECT_FIT_LEVELS` (hard, `pack.overflow.excessArea`, `pack.aspectError`, `pack.area`). A container of fixed size gives the output of the wrapped strategy. The trace stage is `aspect-fit` (`ASPECT_FIT_STAGE`) with `move.aspectPick`.
- `packPortfolio` and the strategy `portfolio`: the option `key` (the measure ids after the hard breaks). The strategy `portfolio`: the option `members`.
- The generator `rect-grid` version 2 (`rectGridV2`) with the parameter `order` (`free`, `soft`). Version 1 does not change. `generator(name, version?)`.
- Bench: the corpus `pack-free-v1`, the claim `claims.declared` of a corpus file, the 4 entries of `ASPECT_FIT_ENTRIES`, and the view `orderNotRequired` of `--compare-guards`.

## 0.2.11

A speedup of the strategies `maxrects-*` and `portfolio`, roadmap item k64. This release has no breaking changes. Each output stays byte-equal.

### Changed

- `maxrects`: the cut of the free rectangles compares a new part only with the parts and the free rectangles on the same side of the box, from the largest part to the smallest. The outputs do not change. In curved containers with 1000 items, the containment checks go down by 25 times.
- A new test fixture, `bench/fixtures/maxrects-hashes.json`, pins the output hashes of each maxrects strategy and portfolio on 1840 inputs.

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
