# @mark1russell7/packing

[![npm](https://img.shields.io/npm/v/@mark1russell7/packing?color=2346c4)](https://www.npmjs.com/package/@mark1russell7/packing) [![CI](https://github.com/mark1russell7/packing/actions/workflows/ci.yml/badge.svg)](https://github.com/mark1russell7/packing/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-2346c4)](https://github.com/mark1russell7/packing/blob/main/packages/packing/LICENSE)

Rectangle packing for layouts: a guillotine row packer and a skyline packer that place rectangles in an outer rectangle.

```sh
npm i @mark1russell7/packing
```

```ts
import { pack, Rect } from "@mark1russell7/packing";

const rects = [[30, 10], [20, 20], [10, 5]].map(([w, h]) => {
  const r = new Rect<string>();
  r.size.set(w, h);
  return r;
});
const outer = pack(rects);
outer.size; // the size of the layout
rects[0].position; // the place of the first rectangle
```

Without fixed sizes, the outer rectangle grows until all rectangles fit. With `fixedWidth`, the width stays. With `fixedSize`, a rectangle that does not fit stays unpacked.

## Strategies

`pack` sets the width of the outer rectangle, and then packs with a strategy:

```ts
pack(rects, outer, { strategy: "skyline", sortOrder: "area-desc" });
```

- `packRows` (the default): a guillotine row packing. It fills the space under the short rectangles of each row.
- `packSkyline`: each rectangle goes to the lowest place where it fits. It packs around a `locked` rectangle.
- `packShelf`: it fills rows left to right in the sort order, and goes around each `locked` rectangle. With the sort order `input`, the rows read in your order.

Since 0.2.4, `packShelf` and the strategy `shelf` have the option `fit`. `SHELF_FITS` lists its values. Without `fit`, the shelf packing does not change.

```ts
pack(rects, outer, { strategy: "shelf", fit: "best" });
```

- `fit: "next"`: each rectangle uses only the open shelf. A short rectangle can also stack above a shorter rectangle.
- `fit: "first"`: each rectangle goes on the first shelf from the top where it fits.
- `fit: "best"`: each rectangle goes on the shelf with the least height left over above it.
- With a `fit`, the shelves open only in the free spans of each container shape. `docs/PACKER.md` tells the rules.

Since 0.2.5, `packMaxRects` and the strategy `maxrects` pack with a list of maximal free rectangles. `MAXRECTS_RULES` lists the rules of the option `rule`.

```ts
pack(rects, outer, { strategy: "maxrects", rule: "cp" });
```

- `rule: "bssf"` (the default): the free rectangle with the smallest leftover short side. Its move is `move.bssf`.
- `rule: "blsf"`: the free rectangle with the smallest leftover long side. Its move is `move.blsf`.
- `rule: "baf"`: the free rectangle with the smallest leftover area. Its move is `move.baf`.
- `rule: "bl"`: the highest place, then the leftmost place. Its move is `move.split`, a box that cuts 2 free rectangles or more.
- `rule: "cp"`: the place that touches the most length of edges. Its move is `move.cp`.
- The move of each rule other than `bl` counts a box when the rule chooses a place that `bl` does not choose.
- A shape that is not a rectangle gets bands. The option `bandHeight` sets their largest height. The default is the height divided by `MAXRECTS_BANDS`.

Since 0.2.6, `packPortfolio` packs an input with each member and keeps the best output. It is opt-in, and no default uses it.

```ts
const { output, winner } = packPortfolio(["skyline", "shelf"]).pick(input);
```

- The pick is `selectBest` of `@mark1russell7/layout-contract` on `PORTFOLIO_LEVELS`: the hard breaks, then `pack.overflow.excessArea`, then `pack.fill`.
- The trace of the output gets the stage `portfolio` with the measure `move.pick`.
- `outputHash` gives the hash of the placements of an output, as the bench records have it.

Since 0.2.7, the strategy `portfolio` packs an input with the set of its cell. It is opt-in, and no default uses it.

```ts
const output = packWith("portfolio", input); // the default member count of the cell
const cell = portfolioCell(input); // { shape: "rect", count: "100", spread: "uniform" }
```

- `portfolioCell` gives the container shape, the band of the item count and the band of the size spread.
- `PORTFOLIO_SETS` gives the sets of 1, 2 and 3 members of each cell. The bench records of one run gave them.
- Without options, the default member count of the cell runs. The output is a function of the input only.
- The option `k` (2 or 3) runs each member of the set of `k`. The option `budgetMs` is an opt-in time limit.
- The option `members` sets a fixed list of members. The option `key` sets the measures of the pick after the hard breaks.

The function `aspectFit` wraps a strategy for a container of free size. It is opt-in, and no default uses it.

```ts
const fit = aspectFit(strategy("maxrects"), { targetAspect: 16 / 9 });
const output = packWith("aspect-fit", input, { strategy: "maxrects", options: { rule: "bl" } });
```

- A container of fixed size gives the output of the wrapped strategy, with no change.
- For a free size, it packs at the widths of `ASPECT_FIT_FACTORS` around the target aspect, and at the size of the wrapped strategy.
- The pick uses `ASPECT_FIT_LEVELS`: the hard breaks, then `pack.overflow.excessArea`, then `pack.aspectError`, then `pack.area`.
- The target is `targetAspect`, else `aspect` of the container, else 1. `docs/PACKER.md` tells the widths.

Both functions also work alone, in an outer rectangle with a width that you set. They do not change the width.

A `locked` rectangle keeps its position. `packSkyline` and `packShelf` put the other rectangles around it. `packRows` only keeps its position.

The sort orders are `height-desc` (the default), `height-asc`, `width-desc`, `area-desc` and `input`. `SORT_ORDERS` lists them, and `compareRects` gives the comparator of one.

The order `input` keeps the order of your array. Use it for a ranked list. `packRows` then fills no gaps, so the rows read in your order: left to right, and top to bottom. `packSkyline` places the rectangles in your order, but a later rectangle can go higher than an earlier one. For a ranked list with `locked` rectangles, use `packShelf`.

## Free width

`packFree` searches the width. It tries many widths with one strategy of `pack`, and keeps the width with the lowest objective: the area of the bounding box times `1 + aspectWeight * aspectError`.

```ts
import { packFree } from "@mark1russell7/packing";

const result = packFree(rects, undefined, { strategy: "skyline", aspect: 16 / 9 });
result.outer.size; // the chosen size
result.fill; // the area of the rectangles divided by the area of the box
result.aspectError; // the distance from the target aspect, on a log scale
result.tried; // each width that the search tried, with its objective
```

- `aspect` is the target: the width divided by the height. The default is 1, a square.
- `aspectWeight` sets the weight of the aspect. With 0, only the area counts.
- The search is deterministic. The same input gives the same result.

## Pushes and measurements

`pushCascade` moves the rectangles that a placed rectangle overlaps, and the rectangles that those overlap in turn:

```ts
const moved = pushCascade(dropped, cards, { gap: 8 });
```

- Each shove takes the axis of the smaller overlap, away from the pusher. The cascade goes outward, and a rectangle does not go past 0.
- The placed rectangle and each `locked` rectangle stay. `maxShoves` limits the work.

`packingMetrics` measures a packing: the hull and its aspect, the rows and the raggedness of the right side. It also gives the part of the hull that the rectangles cover (`utilization`), and the widest rectangle against the median.

```ts
const { utilization, raggedness, rows } = packingMetrics(Rect.packed(rects));
```

## The Packer interface

Each strategy has one interface: `pack(input, options, context)`. The input is a `PackInput`: a container, items, obstacles and a gap. The output is a `PackOutput`. The output does not change the input.

```ts
import { checkHard, packWith, type PackInput } from "@mark1russell7/packing";

const input: PackInput = {
  container: { w: 400, fixed: "width", inset: 8 },
  gap: 4,
  items: [
    { id: "a", w: 120, h: 40, margin: 2 },
    { id: "pin", w: 60, h: 60, x: 200, y: 8, locked: true },
    { id: "b", w: 80, h: 30 },
  ],
  obstacles: [{ id: "logo", region: { kind: "rect", x: 300, y: 0, w: 100, h: 50 } }],
};
const output = packWith("shelf", input, { sortOrder: "input" });
output.placements; // the position of each item
output.size; // the size of the container
checkHard(input, output); // { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 }
```

- The registry `strategies` has `rows`, `skyline`, `shelf`, `push` and `maxrects`. `strategy(id)` gives one, and `packWith(id, input, options, seed)` packs with it.
- `packDefault(input, seed)` packs with `DEFAULT_STRATEGY`, the composite strategy `select`. It passed the win test against `rows` on two fresh-seed corpora.
- `fixed` is `size`, `width`, `height` or `none`. A fixed height turns the axes. The value `none` uses the size search `logSweep`, which wraps `packFree`.
- Each strategy declares its cells in `supports`. `cellOf(input)` gives the cell of an input. A strategy throws `UnsupportedCell` for an input outside its cells.
- Only `maxrects` accepts a turnable item, and it turns items only with `rotate: true`. The other strategies give `UnsupportedCell` for a turnable item.
- No strategy reads groups or packs shapes. A group or a shape gives `UnsupportedCell`.
- `checkHard` counts the breaks of the hard rules: `no-overlap`, `in-container`, `locked-kept` and `complete`. It reads the true shape of each obstacle, as `packHard` of `@mark1russell7/layout-contract` does.
- `fromRects` and `toRects` connect the interface to the `Rect` objects.

`docs/PACKER.md` in the repository gives the interface in full.

## More

- [The repository](https://github.com/mark1russell7/packing): the source, the tests and the roadmap.
- This package was `@mark1russell7/render-pack` before 0.1.0. `render-pack` re-exports this package for one more minor, and then it is deprecated.

The package is ESM, has TypeScript declarations, and works in Node.js 22.12 or later and in browsers. The license is MIT.
