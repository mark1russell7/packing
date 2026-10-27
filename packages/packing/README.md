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

Both functions also work alone, in an outer rectangle with a width that you set. They do not change the width.

A `locked` rectangle keeps its position. `packSkyline` and `packShelf` put the other rectangles around it. `packRows` only keeps its position.

The sort orders are `height-desc` (the default), `height-asc`, `width-desc`, `area-desc` and `input`. `SORT_ORDERS` lists them, and `compareRects` gives the comparator of one.

The order `input` keeps the order of your array. Use it for a ranked list. `packRows` then fills no gaps, so the rows read in your order: left to right, and top to bottom. `packSkyline` places the rectangles in your order, but a later rectangle can go higher than an earlier one. For a ranked list with `locked` rectangles, use `packShelf`.

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

## More

- [The repository](https://github.com/mark1russell7/packing): the source, the tests and the roadmap.
- This package was `@mark1russell7/render-pack` before 0.1.0. `render-pack` re-exports this package for one more minor, and then it is deprecated.

The package is ESM, has TypeScript declarations, and works in Node.js 22.12 or later and in browsers. The license is MIT.
