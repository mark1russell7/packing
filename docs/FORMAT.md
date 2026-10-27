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
| `source` | Always `made-up`. The repository is public. |
| `hash` | The first 16 hex characters of the SHA-256 of the canonical file: sorted keys, no whitespace, without the field `hash`. |
| `container` | The outer rectangle. `fixed` is `none`, `width` or `size`. The router ignores it. |
| `container.aspect` | The target aspect: the width divided by the height. The default is 1. With `fixed` set to `none`, the packer searches the size for this aspect. |
| `container.shape` | A region. Without it, the container is the rectangle `w` by `h`. |
| `obstacles` | A list of `{ "id", "region", "move"? }`. Without `move`, an obstacle stays. With `move: { "cost" }`, the packer can move it for the cost times the distance. The router reads each obstacle as an area to avoid. |
| `gap` | The space between two boxes. Optional. The router ignores it. |
| `boxes[].w`, `boxes[].h` | The size of a box. The packer reads them. |
| `boxes[].x`, `boxes[].y` | The position. The packer writes them. The router reads them. |
| `boxes[].locked` | The box is an obstacle: its `x` and `y` stay. |
| `boxes[].rank` | The reading order that the caller wants. Without it, the order of the array is the rank. |
| `boxes[].parent`, `boxes[].group` | The nesting and the grouping. |
| `boxes[].shape` | A region relative to the origin of the box, for items of other shapes. Without it, the box is the rectangle `w` by `h`. |
| `boxes[].ports` | The ports of a box, each with a `side`: `top`, `right`, `bottom` or `left`. An edge names a port in `sourcePort` or `targetPort`. |
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
  "deterministic": true,
  "prediction": "p-2026-10-27-shelf-order",
  "ms": 1.8,
  "commit": "c9841b5"
}
```

- `stage` is `pack`, `route` or `joint`.
- `inputHash` is the `hash` of the input file.
- `hard` counts the breaks of each hard rule. A good run has 0 for each rule.
- `deterministic` is `true` when two runs with the same seed give the same positions.
- `ms` is the time of the run. Time runs go in CI only.

## The predictions

Each prediction is written before its run. The predictions are a JSON Lines file, and a commit adds it before the run starts. A prediction has an `id`, the keys `strategy`, `input` and `set`, the measure, the expected value and the reason. A record names its prediction in `prediction`.

## The measures of the packer

The names are lowercase, with a dot after the stage.

| Name | Unit | Better | What it measures |
|---|---|---|---|
| `pack.area` | square units | lower | The area of the hull of the boxes. |
| `pack.aspect` | ratio | lower | The aspect of the hull: the larger of `w / h` and `h / w`. |
| `pack.whitespace` | 0 to 1 | lower | 1 minus the area of the boxes divided by the area of the hull. |
| `pack.order.inversions` | 0 to 1 | lower | The pairs of boxes out of rank order in the reading order, divided by all pairs. |
| `pack.order.breaks` | count | lower | The places where the reading order goes back. |
| `pack.raggedness` | 0 to 1 | lower | The spread of the right ends of the rows, divided by the width. |
| `pack.fill` | 0 to 1 | higher | The area of the boxes divided by the area of the bounding box. |
| `pack.aspectError` | 0 or more | lower | The absolute value of `log(w / h) - log(target)`, for the bounding box and the target aspect. |
| `pack.search.widths` | count | lower | The widths that a search of the size tried. |
| `pack.search.ms` | milliseconds | lower | The time of the search of the size. |
| `pack.overflow` | count | lower | The boxes that the packer did not place. |
| `pack.stability.moved` | 0 to 1 | lower | The part of the boxes that moved, against the run on the base input. |
| `pack.stability.mean` | 0 to 1 | lower | The mean movement of a box against the base run, divided by the width of the container. |

Each measure moves when the placement changes. The router measures (`route.*`) and the joint measures (`joint.*`) are in the twin document.

## The hard rules of the packer

| Rule | Break |
|---|---|
| `no-overlap` | Two boxes overlap. Two boxes with a common edge do not overlap. |
| `in-container` | A box goes out of a fixed container. |
| `locked-kept` | A locked box moved. |
| `complete` | A box has no position and is not in `pack.overflow`. |
