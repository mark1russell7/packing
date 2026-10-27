# The taxonomy of the packing problem

This document gives the dimensions of the packing problem and the values of each dimension. One value for each dimension is a **cell**. Each input of the corpus has a cell, and each strategy declares the cells that it supports.

- The field `cell` of the corpus manifest uses the names of this document. [`docs/FORMAT.md`](../FORMAT.md) has the format.
- The catalog [`CATALOG.md`](CATALOG.md) gives the methods. Its sections tell the cells of each method.
- The interface [`docs/PACKER.md`](../PACKER.md) uses the same names in the field `supports` of a strategy.

## Why a taxonomy

The packer of a user interface gets many kinds of input. Examples are a list in a fixed column, a gallery with a free width and a dashboard around a fixed panel. A method that is good in one cell can be bad or wrong in a different cell. The taxonomy makes three things possible:

1. The selector picks only from the strategies that support the cell of the input.
2. The corpus has inputs in each cell. Its coverage is a number: the cells and the pairs of values that it covers.
3. The catalog shows the cells that no method covers. New ideas go in these cells.

## The dimensions

Each dimension has a name in code font. The first value is the most frequent case. Each table gives what changes for the packer.

### 1. The size of the container: `containerSize`

| Value | The input | What the packer does |
|---|---|---|
| `fixed` | The width and the height are set. | The packer places as many items as it can. The others go in the overflow. |
| `freeHeight` | The width is set. | The packer places each item and makes the height as small as it can. This is strip packing. |
| `freeWidth` | The height is set. | The same as `freeHeight`, with the axes changed. Horizontal strips and timelines use it. |
| `freeAspect` | Neither is set. A target aspect is given. | The packer searches the size. The objective is the area times 1 plus the aspect error. `packFree` does this. |
| `freeArea` | Neither is set, and no aspect is given. | The packer finds the rectangle of least area. This is the minimum enclosing rectangle problem. |

`containerSize` is `freeAspect` when the input has `container.fixed` set to `none`. With an `aspectWeight` of 0, it is `freeArea`.

### 2. The shape of the container: `containerShape`

| Value | The input |
|---|---|
| `rect` | A rectangle. All the methods of the catalog support it. |
| `convex` | A convex polygon. |
| `polygon` | A polygon that is not convex. |
| `circle` | A circle. |
| `ellipse` | An ellipse. |
| `holes` | A region with holes: a polygon with inner rings. |

The container shape comes from `container.shape` (a region of `docs/FORMAT.md`). A hole of the container and an obstacle that does not move have the same effect on the packer. They are two values because a user sees them as two different things.

### 3. The obstacles: `obstacles`

The layout of the obstacles:

| Value | The layout |
|---|---|
| `none` | No obstacle. |
| `center` | One obstacle near the center. |
| `scattered` | Some obstacles at random places. Two obstacles can overlap. |
| `wall` | A long obstacle that cuts the container almost in two. |
| `corridors` | Obstacles that leave narrow paths. |
| `touching` | Obstacles that touch each other and make one larger shape. |
| `edge` | Obstacles that touch the border of the container. |

The movement of the obstacles, a separate dimension `obstacleMove`:

| Value | What the packer can do |
|---|---|
| `fixed` | Each obstacle stays. |
| `costly` | The packer can move an obstacle. Each move has the cost of the obstacle times the distance. |
| `free` | The packer can move each obstacle for no cost. Then the obstacle is an item with a start position. |

A locked box (`boxes[].locked`) is an obstacle with `obstacleMove` set to `fixed`.

### 4. The shape of the items: `itemShape`

| Value | The items |
|---|---|
| `rect` | Rectangles. All the methods of today. |
| `circle` | Circles. |
| `convex` | Convex polygons. |
| `polygon` | Any polygon. The name of this problem is nesting. |
| `mixed` | More than one of the shapes above. |

### 5. The rotation of the items: `rotation`

| Value | What the packer can do |
|---|---|
| `none` | Each item keeps its orientation. A user interface almost always uses this value. |
| `quarter` | The packer can turn an item by 90 degrees. |
| `any` | The packer can turn an item by any angle. Only nesting uses it. |

### 6. The sizes of the items: `sizes`

| Value | The sizes |
|---|---|
| `identical` | All the items have the same size. |
| `nearIdentical` | The sizes differ by a few percent. Small differences break the methods that expect a grid. |
| `uniform` | The sizes are uniform in a range. |
| `heavyTail` | Many small items and a few very large items. |
| `bimodal` | Two groups of sizes. |
| `extremeAspect` | Items that are very wide or very tall. |

### 7. The count of the items: `count`

The values are `1`, `10`, `100`, `1k` and `10k`. Each value names a scale, not an exact number. A method that is exact at `10` can be too slow at `100`.

### 8. The order: `order`

| Value | The constraint |
|---|---|
| `free` | The packer can put the items in any order. |
| `soft` | The items have a rank. A break of the reading order costs, through `pack.order.*`. |
| `hard` | The reading order must follow the rank. |

### 9. The groups: `groups`

| Value | The structure |
|---|---|
| `none` | A flat list. |
| `flat` | Each item has a group. The items of a group stay near each other. |
| `nested` | Groups in groups. The packer packs the children of each parent, then the parents. |

### 10. The objective: `objective`

The objective tells which measure the packer makes small. A strategy can support more than one objective.

| Value | The measure |
|---|---|
| `area` | `pack.area` or `pack.whitespace`. |
| `aspect` | `pack.aspectError`, with the area. |
| `count` | `pack.overflow`: place the most items in a fixed container. |
| `order` | `pack.order.*`, with the area. |
| `stability` | `pack.stability.*`: move the fewest items after a change. |
| `edges` | The length of the edges between the placed items, for the router. |

### 11. The mode: `mode`

| Value | The input arrives |
|---|---|
| `offline` | All at once. |
| `online` | One item at a time. The packer does not move an item after it places it. |
| `incremental` | As a change to a packed layout: add, remove, resize, reorder, move an obstacle. The packer can move items, but each move costs. |

### The dimensions of the router

The corpus also has dimensions that only the router reads: `edgeDensity`, `edgeShape`, `ports`. Their values are in `docs/FORMAT.md`. The objective `edges` connects the two stages.

## The cell of an input

The function `cellOf(input)` of the corpus gives the cell of an input from its fields. It reads `container.fixed`, `container.aspect`, `container.shape`, `obstacles`, `boxes[].shape`, `boxes[].rank`, `boxes[].group`, `boxes[].parent` and the sizes. The layout of the obstacles and the size distribution come from the generator: `cellOf` reads them from the generator name when the input has one.

## The cells of the strategies of today

| Strategy | `containerSize` | `containerShape` | `obstacles` | `itemShape` | `rotation` | `order` | `mode` |
|---|---|---|---|---|---|---|---|
| `packRows` | `fixed`, `freeHeight` | `rect` | `none` | `rect` | `none` | `free`, `hard` | `offline` |
| `packSkyline` | `fixed`, `freeHeight` | `rect` | each layout, `fixed` | `rect` | `none` | `free`, `soft` | `offline` |
| `packShelf` | `fixed`, `freeHeight` | `rect` | each layout, `fixed` | `rect` | `none` | `free`, `hard` | `offline` |
| `pushCascade` | `fixed`, `freeHeight` | `rect` | each layout, `free` | `rect` | `none` | `free` | `incremental` |
| `packFree` | `freeAspect`, `freeArea` | `rect` | as its inner strategy | `rect` | `none` | as its inner strategy | `offline` |

Each strategy of today supports only the cell `rect` for `containerShape` and `itemShape`. The items k37, k38 and k39 of the roadmap add the other cells.

## The cells with no method of today

| Cell | The roadmap item |
|---|---|
| Containers of each shape other than `rect` | k37 |
| `obstacleMove` set to `costly` | k38 |
| Items of each shape other than `rect` | k39 |
| `freeWidth` (a fixed height) | k7: the interface turns the axes, so each strategy gets it |
| `mode` set to `online` | k30 |
| `groups` set to `nested` | `new-group-recursive` of the catalog |
| `objective` set to `edges` | `new-port-aware` of the catalog |

## The published typologies

The taxonomy is close to the typology of cutting and packing of Wäscher, Haußner and Schumann (2007), which improves the typology of Dyckhoff (1990). That typology sorts the problems by the kind of assignment (the output is as small as possible, or the input is as large as possible), the variety of the items and the variety of the containers. In its words:

- `containerSize` `freeHeight` is the open dimension problem with one open dimension, and `freeAspect` and `freeArea` are the problem with two open dimensions.
- `containerSize` `fixed` with `objective` `count` is the placement problem or the knapsack problem.
- `itemShape` other than `rect` is the irregular problem: nesting.

That typology does not have the dimensions `order`, `groups`, `mode` and `obstacleMove`. A user interface needs them, so this taxonomy adds them.
