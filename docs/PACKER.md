# The Packer interface (draft)

This document is the draft of the interface of each strategy of `packing` (roadmap item k7). The interface is the intermediate form of the layout compiler. A view describes itself as a packing input. A strategy packs it. The router routes the edges of the output.

- The status is **draft**. The layout-stack session, `highways` and `packing` settled its open questions on 2026-10-27. The section "The decisions" gives them.
- The shared types go to the package `@mark1russell7/layout-contract` of the repository `layout-stack`. The section "The contract and packing" tells which types.
- The field names are those of `layout-input/1` in [`docs/FORMAT.md`](FORMAT.md). A packing input is a `layout-input/1` file without `edges`.
- The cell names are those of [`docs/research/TAXONOMY.md`](research/TAXONOMY.md).
- The API of 0.1 (`Rect`, `pack`, `packShelf`, `packFree` and the others) stays. An adapter puts each function behind the interface.

## The goals

1. One interface for each strategy of the catalog, so the corpus measures each strategy in the same way.
2. A general container: a region (a polygon with holes, with a rectangle as the frequent case), obstacles as regions, and a free size as an option.
3. Each strategy declares the cells that it supports. The selector and the benchmark read this declaration.
4. Stages that a strategy can swap: the size search, the split of the free space, the assignment, the placement and the compaction.
5. The same result for the same input, options and seed.

## The data

```ts
/** A region. The forms and the rules are those of docs/FORMAT.md. */
type Region =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: [number, number][]; holes?: [number, number][][] }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

interface Container {
  /** The width. Without it, the packer searches the width. */
  w?: number;
  /** The height. Without it, the packer searches the height. */
  h?: number;
  /** "size": w and h stay. "width": w stays. "height": h stays. "none": the packer searches both. */
  fixed: "size" | "width" | "height" | "none";
  /** The target aspect (width divided by height) for fixed "none". The default is 1. */
  aspect?: number;
  /** The weight of the aspect error in the objective. 0 gives the least area. The default is 1. */
  aspectWeight?: number;
  /** The shape. Without it, the container is the rectangle from 0, 0 to w, h. */
  shape?: Region;
  /** The space between the border and the items with their margins. The default is 0. */
  inset?: number;
}

interface Obstacle {
  id: string;
  region: Region;
  /** Without it, the obstacle stays. With it, the packer can move the obstacle for cost times the distance. */
  move?: { cost: number };
}

interface Item {
  id: string;
  w: number;
  h: number;
  /** The reading order. Without it, the order of the array is the rank. */
  rank?: number;
  group?: string;
  parent?: string;
  /** A shape relative to the origin of the item. Without it, the item is the rectangle w by h. */
  shape?: Region;
  /** A locked item keeps x and y. The packer reads it as an obstacle. */
  locked?: boolean;
  x?: number;
  y?: number;
  /** true when the packer can turn the item by 90 degrees. The default is false. */
  turnable?: boolean;
  /** A ring around the item that no other item and no route enters. The default is 0. */
  margin?: number | { top: number; right: number; bottom: number; left: number };
  /** The ports. The packer keeps them, and turns them with the item. */
  ports?: Port[];
}

interface Port {
  id: string;
  side: "top" | "right" | "bottom" | "left";
  /** A point on the border of the item, relative to its top-left corner. Without it, the router chooses the point. */
  x?: number;
  y?: number;
}

interface PackInput {
  container: Container;
  items: Item[];
  obstacles?: Obstacle[];
  /** The free space between two items with their margins. Routes use this space. */
  gap?: number;
}

interface Placement {
  id: string;
  x: number;
  y: number;
  /** 0 or 90, only for an item with turnable set to true. */
  turn?: 0 | 90;
}

interface PackOutput {
  placements: Placement[];
  /** The ids of the items that the packer did not place. */
  overflow: string[];
  /** The size of the container after the pack. For a free size, the size that the search found. */
  size: { w: number; h: number };
  /** The new positions of the obstacles that moved. */
  moved: { id: string; x: number; y: number }[];
  /** The facts of each stage, for the site and the records. */
  trace: StageTrace[];
}
```

The output does not change the input. The functions of 0.1 change the `Rect` objects that they get. The adapter of the 0.1 API copies the output into those objects.

## The strategy

```ts
interface Strategy<O = unknown> {
  /** A stable name, for example "shelf" or "maxrects.bssf". The records use it. */
  id: string;
  /** The family of the catalog, for example "shelf" or "guillotine". */
  family: string;
  /** The ids of the catalog rows that this strategy builds. */
  catalog: string[];
  /** The cells that the strategy supports. */
  supports: Supports;
  /** The default options. A record writes the options in full. */
  defaults: O;
  /** true when the result depends only on the input, the options and the seed. */
  deterministic: boolean;
  pack(input: PackInput, options: O, context: PackContext): PackOutput;
}

/** For each dimension of the taxonomy, the values that the strategy supports. */
type Supports = {
  containerSize: ("fixed" | "freeHeight" | "freeWidth" | "freeAspect" | "freeArea")[];
  containerShape: ("rect" | "convex" | "polygon" | "circle" | "ellipse" | "holes")[];
  obstacleMove: ("fixed" | "costly" | "free")[];
  itemShape: ("rect" | "circle" | "convex" | "polygon" | "mixed")[];
  rotation: ("none" | "quarter" | "any")[];
  order: ("free" | "soft" | "hard")[];
  groups: ("none" | "flat" | "nested")[];
  mode: ("offline" | "online" | "incremental")[];
};

interface PackContext {
  /** The seed. A strategy gets each random number from rng, never from Math.random. */
  seed: number;
  rng: () => number;
  /** A limit for the strategies that search. The strategy returns its best result at the limit. */
  budget?: { ms?: number; steps?: number };
  /** The previous output, for the mode "incremental". */
  previous?: PackOutput;
}
```

- A strategy refuses an input outside its cells. It throws `UnsupportedCell`, with the dimension and the value. The benchmark records this result. It is not a failure of the strategy.
- The layout of the obstacles, the sizes and the count are not in `Supports`. Each strategy supports each of their values. The benchmark measures how well.

## The stages

A strategy is one function, or a pipeline of stages. Each stage is an interface, so the corpus can measure each choice of a stage with the other stages the same.

```ts
/** The size search: it gives a strategy of a fixed size the cells freeAspect and freeArea. */
interface SizeSearch {
  id: string; // "log-sweep" (packFree of 0.1.2), "breakpoints", "golden", ...
  search(input: PackInput, inner: Strategy, context: PackContext): PackOutput;
}

/** The split of the free space around the obstacles and the holes (k41, k42). */
interface Split {
  id: string; // "maximal-rects", "slabs", "obstacle-cuts", "cells", "one-region"
  split(container: Container, obstacles: Obstacle[], gap: number): Part[];
}
interface Part { id: string; region: Region; }

/** The assignment of the items to the parts (k43). */
interface Assign {
  id: string; // "reading-greedy", "bin-assignment", "order-flow"
  assign(items: Item[], parts: Part[], context: PackContext): Map<string, Item[]>;
}

/** A pass after the placement, for example a compaction (k54) or an overlap removal (k53). */
interface Pass {
  id: string;
  run(input: PackInput, output: PackOutput, context: PackContext): PackOutput;
}

/** A strategy made from stages. */
function pipeline(parts: {
  id: string;
  size?: SizeSearch;
  split?: Split;
  assign?: Assign;
  place: Strategy;
  passes?: Pass[];
}): Strategy;
```

- `pipeline` computes the `supports` of the result from its stages. A size search adds `freeAspect` and `freeArea`. A split adds the container shapes and the obstacles that it supports.
- The turn of the axes is a free stage: it gives each strategy of `freeHeight` the cell `freeWidth`.
- Each stage writes one `StageTrace`, with its id, its time and its own measures (for example `pack.search.widths`, `pack.part.fill`).

## The selector

```ts
/** The cell of an input: one value for each dimension of the taxonomy. */
function cellOf(input: PackInput): Cell;

interface Selector {
  id: string; // "rule", "features", "portfolio"
  select(input: PackInput, strategies: Strategy[]): Strategy;
}
```

The selector picks only from the strategies whose `supports` holds the cell of the input (roadmap item k20). The benchmark measures each selector against the best strategy of each input.

## The registry

```ts
const strategies: Strategy[]; // each strategy of the package
function strategy(id: string): Strategy;
function packWith(id: string, input: PackInput, options?: unknown, seed?: number): PackOutput;
```

The benchmark starts each strategy of the registry on each input of the corpus. A new strategy goes in the registry, so it gets the same benchmark as the others. No result is removed.

## The adapters of 0.1

| Function of 0.1 | Strategy id | Its `supports` |
|---|---|---|
| `packRows` | `rows` | `fixed`, `freeHeight`. Obstacles: none. |
| `packSkyline` | `skyline` | `fixed`, `freeHeight`. Obstacles: `fixed`. |
| `packShelf` | `shelf` | `fixed`, `freeHeight`. Obstacles: `fixed`. Order: `free`, `hard`. |
| `pushCascade` | `push` | `fixed`, `freeHeight`. Obstacles: `free`. Mode: `incremental`. |
| `packFree` | the size search `log-sweep` | It wraps any strategy above. |

`fromRects(rects, outer)` makes a `PackInput` from the `Rect` objects of 0.1, and `toRects(output, rects, outer)` writes the output back.

## The decisions

The layout-stack session, `highways` and `packing` settled these questions on 2026-10-27. The placement and the routing read each of them in the same way.

### 1. The rotation

- `Item.turnable` (default `false`) lets a strategy turn the item. `Placement.turn` is `0` or `90`.
- A turn of 90 is clockwise, with the y axis down. The turned item has `w` and `h` changed. Its top-left corner is at `x`, `y`.
- A port at `px`, `py` goes to `h - py`, `px`. Its side turns from `top` to `right`, `right` to `bottom`, `bottom` to `left` and `left` to `top`.
- The output and the record for the router have the turned items and ports. Thus the router does not read `turn`.
- The rotation is in the first version. A later addition changes the `supports` of each strategy.

### 2. The tolerances

| Name | Value | Use |
|---|---|---|
| `EPS` | `1e-6` | The comparison of two numbers in an engine. |
| `RECORD_EPS` | `1e-3` | The comparison of two numbers of a file. The files round to 3 decimals, so two values can differ by `0.0005` each. |
| `tolerance.overlap` | `0.001` | The rule `no-overlap`. The packer is exact, so a small tolerance finds each real overlap. |
| `tolerance.through` | `0.5` | The router rule that a route does not go through a box. A route is a curve on the line of the margin. |

- The boxes are closed. Two boxes overlap only when their insides overlap. A common edge is not an overlap.
- Each record writes the tolerances of its rules in the field `tolerance`, next to `hard`. The table gives the defaults. `hard` holds only the count of each rule.
- A route in the margin of an item, outside the item, is a soft measure, not a break of a hard rule.

### 3. The margins and the gap

- `Item.margin` is a ring around the item. It is a part of the item. The packer packs the item with its margin. The router keeps each route out of the ring.
- A port stub crosses the ring at a right angle. This crossing is not a break.
- `gap` is the free space between two items with their margins. Routes use it.
- `Container.inset` is the space between the border and the items with their margins.
- Thus two items are `mA + gap + mB` apart.
- A gap with `k` routes at a spacing `s` needs `gap >= (k - 1) * s` when the margins give the clearance.
- The joint corpus keeps the inputs with a gap of 0 and no margin as a labelled stress cell. On these inputs, the router rule `through` is expected to fail. Each other joint input has a margin and a gap larger than 0.

### 4. The ports

- The ports are a part of the item, with the form of `boxes[].ports` of `layout-input/1`. A port has an `id`, a `side`, and an optional `x` and `y` on the border of the item.
- The packer keeps the ports, and turns them with the item (decision 1).
- The strategies of the first version ignore the ports. A port-aware strategy (`new-port-aware` of the catalog) reads them.

### 5. The items and the boxes

- The file format keeps the name `boxes`. The packer API uses `Item`, because an item can be a circle or a polygon.
- One pair of converters in the contract (`fromLayoutInput` and `toLayoutRecord`) maps the two names. Neither engine has its own mapping.
- A router that knows only rectangles routes around the bounding box of an item. It declares this in its own `supports`.
- The obstacles of the packer go to the router as obstacles, not as boxes. A shaped item goes to the router as its shape, or as its bounding box when the router does not support the shape.

## The contract and packing

The package `@mark1russell7/layout-contract` holds what the packer, the router and the consumer share. Neither engine depends on the other.

| In the contract | In `packing` |
|---|---|
| `Region`, `Item` with `Port` and `margin`, `Container`, `Obstacle` | The packer part of `Strategy`: `pack` and `PackContext` |
| `PackInput`, `PackOutput`, `Placement` | The stages: `SizeSearch`, `Split`, `Assign`, `Pass`, `pipeline` |
| The turn helper, `EPS`, `RECORD_EPS` | The selector and `cellOf` |
| The converters and the validators | The registry and the adapters of 0.1 |
| The common fields of a strategy, with `supports` as a record of each dimension and its values | The dimensions of the packer, with their names in `docs/FORMAT.md` |
| The registry of the measure names | |

- The release of `packing` refuses a `github:` dependency. Thus `packing` keeps its own copy of the types until the contract is on npm.
- A test of `packing` makes sure that its types fit the types of the contract.
- The adapters of 0.1 stay until the contract is final.
