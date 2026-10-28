# The corpus format and the run records

This document gives the input format and the record format of the benchmarks of `packing`. The router `highways` uses the same formats. Its twin document is [`docs/LAYOUT-RECORDS.md`](https://github.com/mark1russell7/highways/blob/main/docs/LAYOUT-RECORDS.md) in `mark1russell7/highways`. Change both documents together.

One input file feeds the two stages. A joint run packs an input, and then routes the edges of the same input.

## The input: `layout-input/1`

The corpus is a folder of input files and an index. Each input is one JSON file.

```json
{
  "schema": "layout-input/1",
  "id": "screen-v1/dense-groups/s3",
  "set": "screen-v1",
  "family": "dense-groups",
  "seed": 3,
  "source": "made-up",
  "hash": "3f9a0c1d2e4b5a67",
  "container": { "w": 800, "fixed": "width" },
  "gap": 4,
  "boxes": [
    { "id": "a", "w": 120, "h": 40, "rank": 0 },
    { "id": "pin", "w": 60, "h": 60, "x": 200, "y": 0, "locked": true },
    { "id": "b", "w": 80, "h": 30, "parent": "g1", "ports": [{ "id": "out", "side": "right" }] }
  ],
  "edges": [{ "id": "e1", "source": "a", "target": "b", "targetPort": "out" }]
}
```

| Field | Use |
|---|---|
| `id`, `set`, `family`, `seed` | The name of the input. The `set` is the corpus version, for example `screen-v1`. |
| `source` | The origin of the input: `made-up`, `published:<set>` or `known-best:<construction>`. A generated input has `made-up`. The repository is public, so no input comes from a real product. |
| `hash` | The first 16 hex characters of the SHA-256 of the canonical file: sorted keys, no whitespace, without the field `hash`. |
| `container` | The outer rectangle. `fixed` is `none`, `width`, `height` or `size`. The router ignores it. |
| `container.aspect` | The target aspect: the width divided by the height. The default is 1. With `fixed` set to `none`, the packer searches the size for this aspect. |
| `container.shape` | A region. Without it, the container is the rectangle `w` by `h`. |
| `obstacles` | A list of `{ "id", "region", "move"? }`. Without `move`, an obstacle stays. With `move: { "cost" }`, the packer can move it for the cost times the distance. The router reads each obstacle as an area to avoid. |
| `gap` | The free space between two boxes with their margins. Routes use it. Optional. |
| `boxes[].w`, `boxes[].h` | The size of a box. The packer reads them. |
| `boxes[].x`, `boxes[].y` | The position. The packer writes them. The router reads them. |
| `boxes[].locked` | The box is an obstacle: its `x` and `y` stay. |
| `boxes[].rank` | The reading order that the caller wants. Without it, the order of the array is the rank. |
| `boxes[].parent`, `boxes[].group` | The nesting and the grouping. |
| `boxes[].shape` | A region relative to the origin of the box, for items of other shapes. Without it, the box is the rectangle `w` by `h`. |
| `boxes[].ports` | The ports of a box, each with a `side`: `top`, `right`, `bottom` or `left`. An optional `x` and `y` put the port on the border of the box. An edge names a port in `sourcePort` or `targetPort`. |
| `boxes[].margin` | A ring around the box: a number, or `top`, `right`, `bottom` and `left`. No other box and no route enters it. The default is 0. A route from a port of the box crosses its ring at a right angle. |
| `boxes[].turnable` | The packer can turn the box by 90 degrees. The record has the turned box and ports. |
| `boxes[].data`, `edges[].data` | The free data of a box or an edge: an object. The packer does not read it. Optional. |
| `container.inset` | The space between the border and the boxes with their margins. |
| `base`, `change` | A variant names its base input and its change: `add`, `remove`, `resize` or `reorder`. The stability measures compare the run on the variant with the run on its base. |

### Regions

A region is one of these forms:

```json
{ "kind": "rect", "x": 0, "y": 0, "w": 400, "h": 300 }
{ "kind": "polygon", "points": [[0, 0], [400, 0], [400, 300], [0, 300]], "holes": [[[100, 100], [200, 100], [200, 200]]] }
{ "kind": "circle", "cx": 200, "cy": 200, "r": 150 }
{ "kind": "ellipse", "cx": 200, "cy": 150, "rx": 200, "ry": 150 }
```

- The coordinates are those of the input. The y axis points down.
- A ring of a polygon closes without a copy of its first point at its end.
- The outer ring can have any winding. The tools make the winding the same.
- Each hole is fully in the outer ring, and a hole does not touch the outer ring.
- Until the router supports true shapes, it uses the bounding box of each region. That area is larger, thus it is safe.

## The generators: `layout-corpus/1`

The corpus comes from seeded generators. The same generator, version, parameters and seed give the same file, byte for byte, in `packing` and in `highways`.

- Each generated input has `"generator": { "name", "version", "params", "seed" }`. A hand-made or published input has `"generator": null`, and its `source` tells its origin: `made-up`, `published:<set>` or `known-best:<construction>`.
- A generator is a pipeline of steps: the container shape, then the obstacles, then the sizes and the count of the items. Thus a packing input and a routing input with the same seed have the same obstacles.
- The random numbers come from `mulberry32`. Each step has its own seed: `fnv1a32("<input seed>:<step name>")`, of the UTF-8 bytes of the string.
- Each number in a file is a JSON number, rounded to 3 decimals with `Math.round(x * 1000) / 1000`. A half goes up, to positive infinity. The file writes `-0` as `0`. Thus the output stays the same on each runtime.
- The canonical form for `hash` has sorted keys and no whitespace. The numbers have the form of `JSON.stringify`.
- A routing input needs positions. It is either generated with positions, or it names a packing input in `base` with `"change": "packed"`: it routes the packed output of that input.
- In a change sequence, `step` gives the place of an input in the sequence.

The manifest of a corpus is `corpus.json`:

```json
{
  "schema": "layout-corpus/1",
  "corpus": "screen-v1",
  "specs": [{ "generator": "rect-scattered", "version": 1, "params": { "count": 40 }, "seeds": [1, 2, 3] }],
  "inputs": [{ "id": "screen-v1/rect-scattered/s1", "hash": "3f9a0c1d2e4b5a67", "cell": { "containerShape": "rect", "obstacles": "scattered" } }]
}
```

### The cells

`cell` names the cell of an input in the taxonomy, with one value for each dimension. The coverage of a corpus (the cells and the pairs of values that it covers) comes from these cells.

| Dimension | Values |
|---|---|
| `containerSize` | `fixed`, `freeHeight`, `freeWidth`, `freeAspect`, `freeArea` |
| `containerShape` | `rect`, `convex`, `polygon`, `circle`, `ellipse`, `holes` |
| `obstacles` | `none`, `center`, `scattered`, `wall`, `corridors`, `touching`, `edge` |
| `sizes` | `identical`, `uniform`, `heavyTail`, `bimodal`, `extremeAspect`, `nearIdentical` |
| `count` | `1`, `10`, `100`, `1k`, `10k` |
| `mode` | `offline`, `online`, `incremental` |
| `edgeDensity` (routing) | `sparse`, `medium`, `dense`: approximately 0.5, 1.5 and 4 edges for each box |
| `edgeShape` (routing) | `random`, `clustered`, `hubChain`, `longRange`, `tree`, `bundled` |
| `groups` (routing) | `none`, `flat`, `nested` |
| `ports` (routing) | `free`, `sides`, `fixed` |

### The shared generator `rect-scattered` (version 1)

A test in each repository generates the seeds 1, 2 and 3 of this generator with `{ "count": 40 }`, and compares the hashes with the values below.

The functions:

```js
// mulberry32: one generator of random numbers in [0, 1)
const mulberry32 = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// fnv1a32 of the UTF-8 bytes of a string
const fnv1a32 = (str) => {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
};
// A whole number from lo to hi, both included
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
```

The steps, in this order. Each step starts its own generator: `r = mulberry32(fnv1a32(seed + ":" + step))`, with the seed in decimal.

1. Step `container`: `w = int(r, 600, 1000)`, then `h = int(r, 400, 800)`. The container is `{ "w": w, "h": h, "fixed": "size" }`.
2. Step `obstacles`: `n = int(r, 3, 8)`. For each `i` from 0 to `n - 1`, in this order: `ow = int(r, 40, 160)`, `oh = int(r, 40, 160)`, `x = int(r, 0, w - ow)`, `y = int(r, 0, h - oh)`. The obstacle is `{ "id": "o<i>", "region": { "kind": "rect", "x": x, "y": y, "w": ow, "h": oh } }`. Two obstacles can overlap.
3. Step `boxes`: for each `i` from 0 to `count - 1`: `bw = int(r, 20, 120)`, then `bh = int(r, 20, 80)`. The box is `{ "id": "b<i>", "w": bw, "h": bh }`.

The file has these fields: `schema` `"layout-input/1"`, `id` `"xcheck-v1/rect-scattered/s<seed>"`, `set` `"xcheck-v1"`, `family` `"rect-scattered"`, `seed`, `source` `"made-up"`, `generator` `{ "name": "rect-scattered", "version": 1, "params": { "count": 40 }, "seed": <seed> }`, `container`, `obstacles`, `boxes` and `edges` `[]`. The `hash` is the first 16 hex characters of the SHA-256 of the canonical form of the other fields.

| Seed | `w` | `h` | Obstacles | First obstacle | First box | `hash` |
|---|---|---|---|---|---|---|
| 1 | 970 | 705 | 4 | `x 690, y 281, w 111, h 100` | `70 by 66` | `f5f5c51d1560e41c` |
| 2 | 733 | 437 | 7 | `x 292, y 7, w 138, h 121` | `114 by 77` | `cfd6ef0ef232aaa3` |
| 3 | 871 | 554 | 8 | `x 551, y 56, w 59, h 138` | `78 by 39` | `d1638f2406360b2e` |

A check value: `fnv1a32("1:container")` is `3139901265`.

### The generators of `packing`

The package exports each generator below, with `generators`, `generator(name)` and `corpus(name, specs)`. Each generator is at version 1. A test pins the hash of seed 1 for each value of each parameter.

- The `id` of an input is `<set>/<family>/s<seed>`. The family has the generator name and the values of the parameters, for example `rect-grid.fixed.rect.wall.uniform.n100`.
- The default set is `corpus-v1`, and `xcheck-v1` for `rect-scattered`. The function `corpus` gives each input the name of the corpus as its set.
- The steps are `container`, `obstacles` and `boxes`. The obstacles of a seed do not change with the sizes, the count or the container size.
- The cell of an input comes from the parameters, not from the seed. The manifest writes it in `inputs[].cell`. The input file does not have it, thus the hash of `rect-scattered` stays the same.
- The cell has the values of `cellOf`, and `obstacles`, `sizes`, `count` and `mode`. The mode is always `offline`.
- The count scale is the nearest of 1, 10, 100, 1000 and 10000 on a log scale. The counts 0 to 3 give `1`.

| Generator | Parameters and defaults | The cells that it covers |
|---|---|---|
| `rect-scattered` | `count` 40 | `fixed`, `rect`, `scattered`, `uniform` |
| `rect-grid` | `containerSize` `fixed`, `containerShape` `rect`, `obstacles` `none`, `sizes` `uniform`, `count` 100 | Each value of the 4 dimensions, and each count from 0 to 100000 |
| `gallery` | `containerSize` `freeHeight`, `count` 100 | `identical`: thumbnails with one size and one aspect |
| `dashboard` | `containerSize` `freeHeight`, `count` 10 | `bimodal`: tiles in 6 standard sizes of a grid unit |
| `cards` | `containerSize` `freeHeight`, `count` 100 | `uniform`: one width, a different height for each card |
| `word-cloud` | `containerSize` `freeHeight`, `count` 100 | `heavyTail`: the height from 6 font sizes, the width from the count of letters |
| `edge-cases` | `case` `oversize`, `count` 12 | The cases `empty`, `one`, `oversize`, `exactTiling` and `touchObstacles` |

The parameter `containerSize` of `rect-grid` and of the families of a user interface has the values `fixed`, `freeHeight`, `freeWidth`, `freeAspect` and `freeArea`.

The parts of `rect-grid`:

- The container is a nominal rectangle of 600 to 1000 by 400 to 800. The obstacles and the boxes go in a frame: a rectangle in the shape.
- The shapes: `convex` cuts the 4 corners, `polygon` is an L shape, and `holes` has 1 or 2 rectangle holes. A `circle` or `ellipse` touches the sides of the rectangle.
- The obstacle layouts: `center` has one obstacle. `scattered` has 3 to 8. A `wall` crosses 70 to 85 percent of the frame. `corridors` is a grid of blocks with narrow paths. `touching` is a chain of 2 to 4 obstacles. `edge` puts 2 to 5 obstacles against the sides of the frame.
- The boxes have a mean area of 40 percent of the frame divided by the count. No box is wider or higher than the frame.

The cases of `edge-cases` have a fixed rectangle container:

- `empty` has no box, and `one` has one box. These 2 cases ignore `count`.
- `oversize` has one box that is wider than the container.
- `exactTiling` has identical boxes that fill the container with no free space.
- `touchObstacles` has a locked box on an obstacle, and boxes as wide as the path between 2 obstacles. Its cell has the obstacles `corridors`.

## The record: `layout-record/1`

Each run writes one line of JSON Lines: one line for each strategy, input and seed.

```json
{
  "schema": "layout-record/1",
  "stage": "pack",
  "step": "pack",
  "strategy": "shelf",
  "options": { "sortOrder": "input" },
  "corpus": "screen-v1",
  "input": "screen-v1/dense-groups/s3",
  "inputHash": "3f9a0c1d2e4b5a67",
  "set": "screen-v1",
  "seed": 3,
  "nodes": 40,
  "edges": 52,
  "measures": { "pack.area": 182400, "pack.whitespace": 0.21 },
  "hard": { "no-overlap": 0, "in-container": 0, "locked-kept": 0, "complete": 0 },
  "tolerance": { "overlap": 0.001 },
  "deterministic": true,
  "prediction": "p-2026-10-27-shelf-order",
  "ms": 1.8,
  "commit": "c9841b5"
}
```

- `stage` is `pack`, `route` or `joint`.
- `inputHash` is the `hash` of the input file.
- `hard` counts the breaks of each hard rule. A good run has 0 for each rule.
- `tolerance` gives the tolerance of each hard rule of the run. The defaults are `overlap` 0.001 and `through` 0.5. `docs/PACKER.md` tells why. `hard` holds only the counts.
- `deterministic` is `true` when two runs with the same seed give the same positions.
- `ms` is the time of the run. Time runs go in CI only.

A record can also have these optional fields:

- `msRuns` gives the time of each timed repeat, in milliseconds. `ms` is their median.
- `outputHash` gives the first 16 hex characters of the SHA-256 of the canonical output of the stage. The packer hashes its placements, sorted by id.
- `env` gives the computer of the run: `node`, `os`, `arch`, `runner`, `cpu` and `cpus`.
- `skipped` gives the reason when the strategy did not start, for example a cell that the strategy does not support.

A skipped record has no measures and no hard counts: `measures` and `hard` are empty objects. Its `ms` is 0, and it has no `msRuns` and no `outputHash`. A reader of the measures and the times ignores a skipped record.

## The predictions

Each prediction is written before its run. The predictions are a JSON Lines file, and a commit adds it before the run starts. A prediction has an `id`, the keys `strategy`, `input` and `set`, the measure, the expected value and the reason. A record names its prediction in `prediction`.

## The measures of the packer

The names are lowercase, with a dot after the stage. This table is the short list. [`docs/MEASURES.md`](MEASURES.md) defines each measure, with its edge cases and its range.

| Name | Unit | Better | What it measures |
|---|---|---|---|
| `pack.area` | square units | lower | The area of the hull of the boxes. |
| `pack.aspect` | ratio | lower | The aspect of the hull: the larger of `w / h` and `h / w`. |
| `pack.whitespace` | 0 to 1 | lower | 1 minus the area of the boxes divided by the area of the hull. |
| `pack.order.inversions` | 0 to 1 | lower | The pairs of boxes out of rank order in the reading order, divided by the pairs with different ranks. |
| `pack.order.breaks` | count | lower | The places where the reading order goes back. |
| `pack.raggedness` | 0 to 1 | lower | The spread of the right ends of the rows, divided by the width. |
| `pack.fill` | 0 to 1 | higher | The area of the boxes divided by the area of the bounding box. |
| `pack.aspectError` | 0 or more | lower | The absolute value of `log(w / h) - log(target)`, for the bounding box and the target aspect. |
| `pack.search.widths` | count | lower | The widths that a search of the size tried. |
| `pack.search.ms` | milliseconds | lower | The time of the search of the size. |
| `pack.overflow` | count | lower | The boxes that the packer did not place. |
| `pack.stability.moved` | 0 to 1 | lower | The part of the boxes that moved, against the run on the base input. |
| `pack.stability.mean` | 0 or more | lower | The mean movement of a box against the base run, divided by the width of the container. |
| `pack.stability.q95` | 0 or more | lower | The quantile 0.95 of the movement of a box against the base run, divided by the width of the container. |

Each measure moves when the placement changes. The router measures (`route.*`) and the joint measures (`joint.*`) are in the twin document.

## The hard rules of the packer

| Rule | Break |
|---|---|
| `no-overlap` | The insides of two boxes with their margins overlap by more than `tolerance.overlap`. Two boxes with a common edge do not overlap. |
| `in-container` | A box goes out of a fixed container. |
| `locked-kept` | A locked box moved, or it has no position. A locked box with no position stays at its input position for the other rules. |
| `complete` | A box that is not locked has no position and is not in `pack.overflow`. |
