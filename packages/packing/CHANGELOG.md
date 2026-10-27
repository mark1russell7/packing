# Changelog

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
