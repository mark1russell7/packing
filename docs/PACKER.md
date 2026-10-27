# The Packer interface (draft)

This document is the draft of the interface of each strategy of `packing` (roadmap item k7). The interface is the intermediate form of the layout compiler. A view describes itself as a packing input. A strategy packs it. The router routes the edges of the output.

- The status is **draft**. The code comes after the review of the layout-stack session, `highways` and the owner.
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
}

interface PackInput {
  container: Container;
  items: Item[];
  obstacles?: Obstacle[];
  /** The space between two items, and between an item and an obstacle. */
  gap?: number;
}

interface Placement {
  id: string;
  x: number;
  y: number;
  /** 0 or 90, for a strategy that supports rotation "quarter". */
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

## The open questions

1. **Rotation.** A user interface turns an item only in rare cases. Do we keep `turn` in the first version, or add it with the first strategy that uses it?
2. **The tolerance.** Two items with a common edge do not overlap. The draft uses a tolerance of `1e-6` for the comparisons. Do `packing` and `highways` use the same value?
3. **Margins.** The draft has one `gap`. Later options of `Item` and `Container` can add a margin of each item and a gap at the border.
4. **The ports.** The router reads `boxes[].ports`. The packer ignores them in this draft. The idea `new-port-aware` of the catalog reads them.
5. **The name `Item` against `boxes`.** The file format uses `boxes`. The draft uses `items` in the code, because an item can be a circle or a polygon. The converter maps the two names.
