# Changelog

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
