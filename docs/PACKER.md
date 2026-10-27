# The Packer interface (draft)

This document is the draft of the interface of each strategy of `packing` (roadmap item k7). The interface is the intermediate form of the layout compiler. A view describes itself as a packing input. A strategy packs it. The router routes the edges of the output.

- The status is **draft**, and the code of 0.1.3 builds it. The layout-stack session, `highways` and `packing` settled its open questions on 2026-10-27. The section "The decisions" gives them.
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
  /** true when the placements depend only on the input, the options and the seed. The times in the trace are not part of this rule. */
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
- An obstacle that is not a rectangle has no dimension of its own. `cellOf` reports it as the container shape `holes`.
- The input format has no field for a hard order. Thus `cellOf` gives the order `free` or `soft`, and a caller asks for `hard` through the options of the strategy.

## The stages

A strategy is one function, or a pipeline of stages. Each stage is an interface, so the corpus can measure each choice of a stage with the other stages the same.

```ts
/** The size search: it gives a strategy of a fixed size the cells freeAspect and freeArea. */
interface SizeSearch {
  id: string; // "log-sweep" (packFree of 0.1.2), "breakpoints", "golden", ...
  search(input: PackInput, inner: Strategy, context: PackContext, options?: unknown): PackOutput;
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

The code of 0.1.3 builds these adapters. This document gives the contract, and the TSDoc of each strategy gives its details.

| Function of 0.1 | Strategy id | Its `supports` |
|---|---|---|
| `packRows` | `rows` | `fixed`, `freeHeight`. Obstacles: none. Its `obstacleMove` is an empty list, so an input with an obstacle or a locked item is outside its cells. |
| `packSkyline` | `skyline` | `fixed`, `freeHeight`. Obstacles: `fixed`. |
| `packShelf` | `shelf` | `fixed`, `freeHeight`. Obstacles: `fixed`. Order: `free`, `hard`. |
| `pushCascade` | `push` | `fixed`, `freeHeight`. Obstacles: `free`. Mode: `incremental`. |
| `packFree` | the size search `log-sweep` | It wraps `rows`, `skyline` and `shelf`. `push` moves the items from their start positions, so a size search does not fit it. |

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
- One pair of converters in the contract (`toPackInput` and `toLayoutRecord`) maps the two names. Neither engine has its own mapping.
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

## The type fit with `@mark1russell7/layout-contract`

The test `src/contract-fit.test.ts` compares the types and the functions of `packing` with the contract 0.2.0 at commit `710ec51` (roadmap item k57). The commit `710ec51` is the pull request 8 of `layout-contract`.

- The contract is a dev dependency. The release refuses a `github:` specifier only in `dependencies`, `peerDependencies` and `optionalDependencies`.
- `Placement`, `Tolerance` and the counts of the hard rules fit in both directions. `Port` of `packing` fits the contract.
- Each input type and output type of `packing` fits the contract type.
- `EPS`, `RECORD_EPS` and `DEFAULT_TOLERANCE` are the same. The turn of a point, a region, an item and each port is the same.
- `toPackInput` gives the same packer input. `packHard` and `checkHard` give the same counts on the packed outputs of the generators, with and without an inset.
- `packHard` and `checkHard` give the same counts for a rectangle obstacle, also after a move in `output.moved`.
- `Strategy` fits `StrategyInfo`, and each entry of `MEASURE_SPECS` fits `MeasureSpec`. `Direction` is the same.

The gaps are below. The test has a check for each gap from 1 to 14. When a gap closes, its check fails. Then change the check and this list. A closed gap keeps its line and its number, and its check shows the fit.

0. The install. `packing`: the specifier `github:mark1russell7/layout-contract#710ec51` installs the root of the repository. The contract: the package is in `packages/layout-contract`. Thus `packing` adds `&path:packages/layout-contract`. No decision applies. The npm release closes this gap.
1. The arrays. `packing`: mutable arrays, for example `Item[]`, `Port[]` and the rings of a polygon. The contract: readonly arrays and fields. The decisions favor the contract, because a packer does not change its input.
2. The trace. `packing`: `PackOutput.trace`, `StageTrace.ms` and `StageTrace.measures` are necessary. The contract: they are optional. No decision applies. The output of `packing` fits the contract.
3. The names. `packing`: `Margin` (the four sides), `Container`, `Edge`, `HardBreaks` and the class `Rect` of 0.1. The contract: `Sides`, `Margin` (a number or `Sides`), `LayoutContainer`, `LayoutEdge`, `PackHard` and a plain `Rect`. Decision 5 favors the contract. The class `Rect` of 0.1 needs a decision. `packing` closes gaps 1 and 3 in its 0.2.0, when it imports the contract.
4. The file. `packing`: `LayoutInput.change` is a string, and the file has `generator` and `step`. The contract: `change` is `add`, `remove`, `resize` or `reorder`, with no `generator` and no `step`. `docs/FORMAT.md` favors `packing`: it has `"change": "packed"`, `generator` and `step`.
   - **Closed in `layout-contract` 0.2.0:** `change` has `packed`. The file has `generator`, `step` and `cell`, and `GeneratorStamp` and `CorpusCell` fit them.
   - Open: `change` of `packing` is any string, thus `LayoutInput` of `packing` does not fit.
5. The edge data. `packing`: `Edge` has no `data`. The contract: `LayoutEdge.data` is an optional record. No decision applies. The router reads the edges, thus its twin document in `highways` decides.
   - In 0.2.0, `LayoutBox.data` is also an optional record. `Item` of `packing` has no `data`. Each contract box fits `Item` without `readonly`, when each port has a side.
   - **Closed in `packing` 0.1.7:** `Item` and `Edge` have the optional `data` of the contract, with the same type. The turn and `toPackInput` keep it.
6. The supports. `packing`: `Supports` is an interface with one field for each dimension. The contract: `Supports` is a record. An interface has no index signature, thus it does not fit. The table above favors the contract. **Closed in `packing` 0.1.6:** `Supports` is a type alias with the same fields, and it fits the record.
7. The turn of a port with only `x` or only `y`. `packing`: the value turns, thus `x` becomes the new `y`, and `h - y` becomes the new `x`. The contract: the side turns, but the value stays on the old axis. Decision 1 favors `packing`.
   - **Closed in `layout-contract` 0.2.0:** `turnPort` turns the value as `packing` does.
8. The obstacles in `no-overlap`. `packing`: `checkHard` counts each item that overlaps an obstacle. The contract: `packHard` counts only the pairs of boxes. The decisions favor `packing`: in both packages, no item enters an obstacle.
   - **Closed in `layout-contract` 0.2.0:** `packHard` counts each placed box with its margin over an obstacle, at the place of `output.moved`.
   - Open: `checkHard` reads an obstacle as its bounding box. `packHard` reads a circle, an ellipse and a polygon with holes exactly. `packing` adopts the exact test in its 0.2.0.
9. The inset in `in-container`. `packing`: `checkHard` does not read `container.inset`. The contract: `packHard` makes the container smaller by the inset. Decision 3 favors the contract. **Closed in `packing` 0.1.6:** `checkHard` also makes each fixed side smaller by the inset.
10. A shaped item. `packing`: `checkHard` reads an item as `w` by `h`. The contract: `packHard` reads the bounding box of `shape`. Decision 5 favors the contract, because an item can be a circle or a polygon. **Closed in `packing` 0.1.6:** `checkHard` also reads the bounding box of `shape`, after the turn.
11. An item with no placement. `packing`: a locked item with no placement breaks `locked-kept`, and an item that is not in the overflow breaks `complete`. The contract: `applyPack` keeps the position of the input, thus neither rule counts the item. `docs/FORMAT.md` favors `packing` for `complete`. No decision covers `locked-kept`.
    - **Closed in `layout-contract` 0.2.0:** a locked box with no placement breaks `locked-kept`. Another box with no placement that is not in the overflow breaks `complete`.
    - Open, and new in 0.2.0 at commit `69933a6`: the items below.
    - A locked item with no placement, not in the overflow: `checkHard` also counts it in `complete`. `packHard` does not.
    - A locked item with no placement: `packHard` keeps it at its input position for `no-overlap` and `in-container`. `checkHard` ignores it.
    - A locked item that moved: `checkHard` compares the move with `RECORD_EPS`. `packHard` compares it with its tolerance argument. The default values are the same.
    - A locked item with no `x` or no `y` in the input: `checkHard` does not count it. `packHard` reads the missing value as 0.
    - **Closed in `packing` 0.1.7:** a locked item with no placement breaks only `locked-kept`. It stays at its input position for `no-overlap` and `in-container`.
    - **Closed in `layout-contract` 0.2.0:** `packHard` compares the move of a locked box with `RECORD_EPS`. The tolerance argument does not change it.
    - **Closed in `layout-contract` 0.2.0:** `packHard` does not count a locked box with no position. `checkInput` gives the problem "a locked box has no position".
    - Open, on a bad input only: a locked item with no position and no placement. `checkHard` reads it as not locked and counts it in `complete`. `packHard` skips it.
12. The arguments of the hard rules. `packing`: `checkHard(input, output, { overlap })` reads the packer input and the output. The contract: `packHard(before, after, overflow, overlap)` reads two files, with `after` from `applyPack`. No decision applies.
    - **Closed in `layout-contract` 0.2.0:** `packHard(input, output, tolerance)` applies the output itself. The contract removed the old form. The input of `packHard` is a file, and its tolerance is a number.
13. The parts that are not in the contract. The table above puts these parts in the contract: the converters `toPackInput` and `toLayoutRecord`, the common fields of a strategy and the measure names. The contract 0.1.0 has `toPackInput` and `applyPack`, but not the other parts. Decision 5 and the table favor the plan.
    - **Closed in `layout-contract` 0.2.0:** the contract has `toLayoutRecord`, `StrategyInfo`, `MeasureSpec`, `Direction` and `JOINT_MEASURES`. `applyPack` goes from an output back to a file. The `pack.*` specs stay in `packing` as the source, with the type `MeasureSpec`.
14. The side of a port, new in 0.2.0. `packing`: `Port.side` is necessary. The contract: `Port.side` is optional, and the router picks the side. Thus a contract port without a side does not fit `packing`. `packing` closes this gap in its 0.2.0, when it imports the contract.
    - A port without a side is a port of the routing cell `ports` set to `free`. The router picks its side. Thus `packing` makes `side` optional in its 0.2.0.
