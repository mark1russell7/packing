# Changelog

## Unreleased

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
