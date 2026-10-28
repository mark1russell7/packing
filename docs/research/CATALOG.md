# The catalog of packing methods

This catalog lists the published methods that put rectangles into a container, and the new ideas of this project. It is roadmap item k6.

Each entry is a strategy that a later item puts behind one `Packer` interface (k7). The benchmark corpus (k19) measures each strategy with the measures of [`docs/FORMAT.md`](../FORMAT.md). Thus each entry gives a rule that a person can write as code.

## How to read this catalog

Each family has a table. The columns are:

| Column | Content |
|---|---|
| `id` | The stable name of the strategy, in kebab case. A record of `layout-record/1` writes it in `strategy`. |
| Name | The name in the literature. |
| Rule | The rule in one line. |
| Source | The first author and the year. The [bibliography](#bibliography) gives all the authors, the title and a DOI or a URL. |
| Goal | What the method makes better: density, aspect, order, stability or speed. |
| Cost | The time for `n` boxes. `W` is the width of the container, `F` is the count of free rectangles. |
| Status | `implemented` when the package has it today. Else `planned`. |
| Item | The roadmap item. "new item" means that the roadmap has no item for it yet. |

A source with the word "unverified" is a source that we did not find in a library or on the page of its publisher. Do not use an unverified source as a fact.

The boxes of this project do not turn. A method from the literature with an option to turn a box by 90 degrees gets the option `rotate`, and the default is `false`.

## The families

| Family | Item | Methods |
|---|---|---|
| [Shelf and level](#shelf-and-level) | k21 | 17 |
| [Skyline](#skyline) | k22 | 7 |
| [Guillotine](#guillotine) | k23 | 37: 6 rules to choose times 6 rules to split, and a global form, with the option `merge` |
| [MaxRects and free spaces](#maxrects-and-free-spaces) | k24 | 10 |
| [Bottom-left, bottom-left fill and gap rules](#bottom-left-bottom-left-fill-and-gap-rules) | k25 | 12 |
| [Searches over orders and encodings](#searches-over-orders-and-encodings) | k26 | 19 |
| [Exact methods and constraint models](#exact-methods-and-constraint-models) | k10 | 16 |
| [Free width: the smallest enclosing rectangle](#free-width-the-smallest-enclosing-rectangle) | k33, k34 | 12 |
| [Approximation results](#approximation-results) | reference | 10 |
| [Lower bounds](#lower-bounds) | new item | 6 |
| [Treemaps](#treemaps) | k27 | 24 |
| [Masonry, columns and justified rows](#masonry-columns-and-justified-rows) | k28 | 13 |
| [Order and stability](#order-and-stability) | k29 | 9 |
| [Online and incremental packing](#online-and-incremental-packing) | k30 | 10 |
| [Graph layout: components, overlap removal and compaction](#graph-layout-components-overlap-removal-and-compaction) | new item | 13 |
| [Text and interface layout](#text-and-interface-layout) | k28, k29, new item | 8 |
| [New ideas](#new-ideas) | k31 | 13 |

Some rows of the tables of approximation results and of order point to a method of another family. Thus the sum of the counts is larger than the count of different strategies.

## The measures and the families

The measures of `docs/FORMAT.md` apply to each strategy. Some families aim at only some of the measures.

| Measure | What it tells about a family |
|---|---|
| `pack.area` | The area of the hull. Shelf, skyline, guillotine, MaxRects and bottom-left aim at it with a fixed width. The free-width family aims at it directly. |
| `pack.aspect` | The aspect of the hull. The free-width family and the treemaps aim at it. A strip packer with a fixed width gets the aspect that the width gives. |
| `pack.fill`, `pack.aspectError` | The fill and the distance from the target aspect. The free-width family aims at them. |
| `pack.search.widths`, `pack.search.ms` | The cost of a search over widths. Only the free-width family and the searches over orders have this cost. |
| `pack.whitespace` | The empty part of the hull. It is the density measure of the bin and strip literature. A treemap has no whitespace in its cells, but a box of fixed size in a cell leaves whitespace. |
| `pack.order.inversions` | The pairs out of rank order. Sorts by height make it large. The input order, the ordered treemaps and the rank rules aim at it. |
| `pack.order.breaks` | The places where the reading order goes back. A gap fill and a MaxRects free space make breaks. |
| `pack.raggedness` | The spread of the right ends of the rows. Justified rows and line breaking aim at it. |
| `pack.overflow` | The boxes that a fixed container cannot hold. The bin packing and knapsack methods aim at it. |
| `pack.stability.moved` | The part of the boxes that moved after a change. The stable treemaps and the incremental methods aim at it. |
| `pack.stability.mean` | The mean distance of a move after a change. The overlap removal methods aim at it. |

A treemap gives each box a cell with the area of the box, but not with its shape. To compare a treemap with a packer, each box goes to the center of its cell. The box keeps its size. If the box is larger than its cell on one axis, the strategy scales the cells up until each box fits. Thus the measures examine the real boxes.

## Shelf and level

A shelf packer puts the boxes into rows. Each row is as high as its highest box. The literature uses the names "level" and "shelf" for a row. Most methods sort by height first, from the highest box to the lowest box.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `shelf-nf` | Next Fit, input order | Put each box in the order of the array at the right end of the current row. When it does not fit, start a new row. | Coffman 1980 | order, speed | `O(n)` | implemented: `packShelf` with `sortOrder: "input"` | k21 |
| `shelf-nfdh` | Next Fit Decreasing Height (NFDH) | Sort by height, decreasing. Then do `shelf-nf`. | Coffman 1980 | density, speed | `O(n log n)` | implemented: `packShelf` with `sortOrder: "height-desc"`. `fit: "next"` (0.2.4) also stacks a box in the strip above a shorter box. | k21 |
| `shelf-ffdh` | First Fit Decreasing Height (FFDH) | Sort by height, decreasing. Put each box in the first row, from the top, where it fits. Else start a new row. | Coffman 1980 | density | `O(n log n)` with a tree of the free widths | implemented (0.2.4): `packShelf` with `fit: "first"`, in `O(n * rows)`. A box also stacks in the strip above a shorter box. | k21 |
| `shelf-bfdh` | Best Fit Decreasing Height (BFDH) | Sort by height, decreasing. Put each box in the row with the smallest free width that is not less than the width of the box. | Berkey 1987 | density | `O(n log n)` | planned | k21 |
| `shelf-wfdh` | Worst Fit Decreasing Height | Put each box in the row with the largest free width. | Jylänki 2010 | density | `O(n log n)` | planned | k21 |
| `shelf-bhf` | Best Height Fit | Put each box in the row where the height of the row minus the height of the box is the smallest. | Jylänki 2010 | density | `O(n * rows)` | implemented (0.2.4): `packShelf` with `fit: "best"`. A box also stacks in the strip above a shorter box. | k21 |
| `shelf-baf` | Best Area Fit | Put each box in the row where the free area after the box is the smallest. | Jylänki 2010 | density | `O(n * rows)` | planned | k21 |
| `shelf-waf` | Worst Area Fit | Put each box in the row where the free area after the box is the largest. | Jylänki 2010 | density | `O(n * rows)` | planned | k21 |
| `shelf-waste-map` | Shelf with a waste map | Keep the space above each box in a row as free rectangles. Put a later box there first, with a guillotine rule. | Jylänki 2010 | density | `O(n * F)` | planned | k21 |
| `shelf-split-fit` | Split-Fit (SF) | Sort by width. Pack the boxes wider than half the width first, with `shelf-ffdh`. Pack the narrow boxes into the space at the side of those rows, then above. | Coffman 1980 | density, bound 1.5 | `O(n log n)` | planned | k21 |
| `shelf-floor-ceiling` | Floor-Ceiling (FC) | Fill each row from the left on its floor. Then fill it from the right under its ceiling, under the highest box. | Lodi 1999 | density | `O(n^2)` | planned | k21 |
| `shelf-knapsack` | Knapsack shelf (KP) | The highest box left opens a row. A 0-1 knapsack picks the boxes that fill the width of the row with the largest area. | Lodi 1999 (the attribution of KP is unverified) | density | `O(n^2 W)` with dynamic programming | planned | k21 |
| `shelf-hff` | Hybrid First Fit (HFF) | Do `shelf-ffdh` in a strip. Then put the rows into bins with First Fit Decreasing on the row heights. | Chung 1982 | density in bins | `O(n log n)` | planned | k21 |
| `shelf-sas` | Size Alternating Stack (SAS) | Split the boxes into narrow and wide boxes. Each row alternates a stack of narrow boxes and a wide box. | Ntene 2009 | density | `O(n log n)` | planned | k21 |
| `shelf-level-improved` | The improved level methods | Fill the space above the lower boxes of a closed row with the next boxes, in a stack. The rule is unverified. | Ortmann 2010 | density | `O(n^2)` | planned | k21 |
| `rows-gap-fill` | Rows with a recursive gap fill | Do `shelf-nfdh`. Pack later boxes recursively into the space under each lower box and at the right end of each row. | this repository | density | `O(n^2)` | implemented: `packRows` | k21 |
| `rows-input` | Rows in the input order | Do `rows-gap-fill` with no gap fill, thus the rows keep the input order. | this repository | order | `O(n)` | implemented: `packRows` with `sortOrder: "input"` | k21 |

Notes:

- NFDH uses at most `2 OPT + h_max` of height, and FFDH uses at most `1.7 OPT + h_max`. Coffman 1980 proves these bounds.
- The sort orders of `SORT_ORDERS` (`height-desc`, `height-asc`, `width-desc`, `area-desc` and `input`) apply to each shelf rule. A strategy name with an order is `shelf-ffdh` with the option `sortOrder`.
- Split-Fit sorts by width, not by height. Its bound of 1.5 needs boxes with a height of 1 or less.
- `shelf-knapsack` uses a knapsack for each row. The `new-shelf-lookahead` idea adds the order to it.

## Skyline

A skyline packer keeps only the top edge of the packed boxes: a list of segments from the left to the right. A box goes on the skyline. The space under a box that is above a lower segment is lost, but a waste map keeps it.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `skyline-bl` | Skyline bottom-left | Put each box in the lowest place on the skyline where it fits. Between two equal places, take the left place. | Jylänki 2010 | density, speed | `O(n W)` with unit cells, `O(n^2)` with segments | implemented: `packSkyline` | k22 |
| `skyline-min-waste` | Skyline minimum waste | Put each box in the place where the area under the box and above the skyline is the smallest. Between equal places, take the lower place. | Jylänki 2010 | density | `O(n^2)` | planned | k22 |
| `skyline-bl-waste-map` | Skyline bottom-left with a waste map | Do `skyline-bl`. Keep the space under each box as free rectangles, and fill them with a guillotine rule. | Jylänki 2010 | density | `O(n^2 + n F)` | planned | k22 |
| `skyline-min-waste-map` | Skyline minimum waste with a waste map | Do `skyline-min-waste` with the waste map of `skyline-bl-waste-map`. | Jylänki 2010 | density | `O(n^2 + n F)` | planned | k22 |
| `skyline-score` | Skyline with a fit score | For each segment and each box left, give a score from 0 to 4: the count of sides of the box that touch the wall or the neighbors exactly. Put the box with the best score. | Wei 2011 | density | `O(n^2)` for each box | planned | k22 |
| `skyline-stb` | Skyline of `stb_rect_pack` | `skyline-bl` and a best-fit option that takes the place with the smallest waste. | Barrett, software | speed | `O(n^2)` | planned | k22 |
| `skyline-multi-start` | Skyline with each sort order | Do `skyline-bl` with each order of `SORT_ORDERS`, and keep the best result. | Jylänki 2010 | density | five runs | planned | k22 |

Notes:

- `packSkyline` keeps a height for each unit of the width. A version with segments is faster when the width is large.
- The skyline cannot go around a locked box from below. `packSkyline` puts the skyline at the bottom edge of a locked box, thus the space above it stays empty. `skyline-bl-waste-map` gets that space back.

## Guillotine

A guillotine packer keeps a list of free rectangles. Each free rectangle comes from one straight cut across a larger free rectangle. The packer puts a box in the corner of a free rectangle. Then it cuts the rest of that free rectangle into two new free rectangles.

Each guillotine strategy is a rule to choose and a rule to split. Its `id` is `guillotine-<choice>-<split>`, for example `guillotine-baf-slas`. All rules come from Jylänki 2010.

| Choice rule | Name | The free rectangle that wins |
|---|---|---|
| `baf` | Best Area Fit | The smallest area that holds the box. |
| `bssf` | Best Short Side Fit | The smallest leftover on the shorter side. |
| `blsf` | Best Long Side Fit | The smallest leftover on the longer side. |
| `waf` | Worst Area Fit | The largest area. |
| `wssf` | Worst Short Side Fit | The largest leftover on the shorter side. |
| `wlsf` | Worst Long Side Fit | The largest leftover on the longer side. |

| Split rule | Name | The cut |
|---|---|---|
| `sas` | Shorter Axis Split | Cut along the shorter side of the free rectangle. |
| `las` | Longer Axis Split | Cut along the longer side of the free rectangle. |
| `slas` | Shorter Leftover Axis Split | Cut along the axis with the shorter leftover. |
| `llas` | Longer Leftover Axis Split | Cut along the axis with the longer leftover. |
| `minas` | Min Area Split | Cut to make the two new areas as different as possible. |
| `maxas` | Max Area Split | Cut to make the two new areas as equal as possible. |

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `guillotine-<choice>-<split>` | Guillotine, 36 combinations | Choose a free rectangle with the choice rule. Put the box in its bottom-left corner. Cut the rest with the split rule. | Jylänki 2010 | density | `O(n F)`, `F` is `O(n)` | planned | k23 |
| option `merge` | Rectangle merge | After each box, join two free rectangles with a common full edge into one. | Jylänki 2010 | density | `O(F^2)` for each box | planned | k23 |
| `guillotine-global` | Global choice | For each step, test each box left with each free rectangle, and put the best pair. | Jylänki 2010 | density | `O(n^2 F)` | planned | k23 |

Notes:

- A guillotine layout is a tree of cuts. The layout of a strip packer with the rule `slas` and the rule `baf` is the best start in the tests of Jylänki 2010.
- The two-stage and three-stage guillotine layouts of the cutting literature are the exact form of the same model. The family [Exact methods and constraint models](#exact-methods-and-constraint-models) has them.

## MaxRects and free spaces

A MaxRects packer keeps all the maximal free rectangles. These rectangles can overlap. After a box goes in, each free rectangle that the box cuts gives up to four new free rectangles. Then the packer removes each free rectangle that is in another free rectangle.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `maxrects-bssf` | MaxRects Best Short Side Fit | Choose the free rectangle with the smallest leftover on the shorter side. | Jylänki 2010 | density | `O(n F)`, `F` up to `O(n^2)` | implemented (0.2.5): `packMaxRects` with `rule: "bssf"`, the default. | k24 |
| `maxrects-blsf` | MaxRects Best Long Side Fit | Choose the free rectangle with the smallest leftover on the longer side. | Jylänki 2010 | density | `O(n F)` | implemented (0.2.5): `packMaxRects` with `rule: "blsf"`. | k24 |
| `maxrects-baf` | MaxRects Best Area Fit | Choose the free rectangle with the smallest area that holds the box. | Jylänki 2010 | density | `O(n F)` | implemented (0.2.5): `packMaxRects` with `rule: "baf"`. | k24 |
| `maxrects-bl` | MaxRects Bottom-Left | Choose the place with the lowest top edge of the box. Between equal places, take the left place. | Jylänki 2010 | density, order | `O(n F)` | implemented (0.2.5): `packMaxRects` with `rule: "bl"`. | k24 |
| `maxrects-cp` | MaxRects Contact Point | Choose the place where the box touches the most length of the walls and of the other boxes. | Jylänki 2010 | density | `O(n^2 F)` | implemented (0.2.5): `packMaxRects` with `rule: "cp"`. The contact uses maps of the edges. | k24 |
| `maxrects-<rule>-global` | Global MaxRects | For each step, test each box left with each free rectangle and each rule, and put the best pair. | Jylänki 2010 | density | `O(n^2 F)` | planned | k24 |
| `maxrects-locked` | MaxRects around locked boxes | Start with the free rectangles that the locked boxes leave. Then do any MaxRects rule. | this repository | density with obstacles | `O(n F)` | implemented (0.2.5): each rule of `packMaxRects` starts from the free space less the locked boxes. | k24, k42 |
| `free-space-maximal` | Maximal free spaces with pretreatment | Keep the maximal free spaces. First remove the boxes that fit nowhere else, and join the boxes that fill a full width. | El Hayek 2008 | density | `O(n F)` | planned | k24 |
| `extreme-points` | Extreme points | Keep only the points where a box can touch two edges: the projections of the corners of each box. Put each box on the best point. | Crainic 2008 | density, speed | `O(n^2)` | planned | k24 |
| `potpack` | Free list of `potpack` | Sort by height. Keep a list of free spaces. Put each box at the top left of the first space where it fits. Split the rest to the right and below. | Agafonkin, software | speed | `O(n F)` | planned | k24 |

Notes:

- Crainic 2008 gives extreme points in three dimensions. This catalog uses the two-dimensional case.
- `potpack` also sets its own width. The [free-width family](#free-width-the-smallest-enclosing-rectangle) has that rule.

## Bottom-left, bottom-left fill and gap rules

These methods put each box in a corner of the boxes before it. Bottom-left moves a box down and left until it stops. Bottom-left fill can also put a box in a hole. The gap rules choose the box for a gap, not the gap for a box.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `bl-baker` | Bottom-Left (BL) | Start each box at the top right. Move it down as far as it goes, then left as far as it goes. Do it again until it stops. Sort by width, decreasing. | Baker 1980 | density | `O(n^2)` | planned | k25 |
| `bl-chazelle` | Bottom-left, fast form | Put each box in the lowest and then leftmost place where it fits, with a list of the free places. | Chazelle 1983 | density | `O(n^2)` | planned | k25 |
| `blf-hopper` | Bottom-Left Fill (BLF) | Put each box in the lowest, then leftmost place where it fits, holes included. | Hopper 2001 | density | `O(n^3)` | planned | k25 |
| `bl-jakobs` | Bottom-left of Jakobs | Start each box at the top right. Move it down to the lowest place, then left to the leftmost place. Do not move it again. | Jakobs 1996 | speed | `O(n^2)` | planned | k25 |
| `bl-liu-teng` | Improved bottom-left | Move each box down as far as it goes. Move it left only when it cannot move down. | Liu 1999 | density | `O(n^2)` | planned | k25 |
| `best-fit-bkw` | Best fit, lowest gap | Find the lowest gap on the skyline. Put in it the box left that fills the most of its width. If no box fits, raise the gap to its lower neighbor. | Burke 2004 | density | `O(n^2)` | planned | k25 |
| `best-fit-fast` | Best fit, fast form | Do `best-fit-bkw` with balanced trees. | Imahori 2010 | speed | `O(n log n)` | planned | k25 |
| `lowest-gap-fill` | Lowest Gap Fill (LGF) | Fill the lowest gap with the box that gives the best score of fit, then the next lowest gap. | unverified: we found no source with this name | density | `O(n^2)` | planned | k25 |
| `touching-perimeter` | Touching Perimeter (TP) | Put each box in the corner place where the part of its edge that touches walls and boxes is the largest. | Lodi 1999 | density | `O(n^3)` | planned | k25 |
| `corner-degree` | Corner-occupying action with a degree | Put each box only in a corner of two edges. Choose the corner with the highest degree, a measure of how close the box is to the other boxes. | Wu 2002 | density | `O(n^4)` | planned | k25 |
| `caving-degree` | Caving degree | Do `corner-degree` with the caving degree: the box that fits closest into a corner wins. | Huang 2007 | density | `O(n^4)` | planned | k25 |
| `two-level-search` | Two-level search | Do `caving-degree`, and look ahead one step to choose between the best few corners. | Chen 2007 | density | `O(n^5)` | planned | k25 |

Notes:

- `bl-baker` with a decreasing width order uses at most three times the best height. Baker 1980 proves this bound.
- The gap rules (`best-fit-bkw`, `lowest-gap-fill`) do not use a fixed order of the boxes. Thus they make many inversions of the rank.

## Searches over orders and encodings

A search changes the input of a fast packer, the "decoder", and keeps the best result. The input is an order of the boxes, or an encoding of the relative places of the boxes. Each search takes a seed, thus two runs with the same seed give the same result.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `search-ga-order` | Genetic algorithm over orders | Keep a population of orders. Cross two orders and change some places. Decode each order with `bl-jakobs` or `blf-hopper`. | Jakobs 1996, Hopper 2001 | density | generations x population x decoder | planned | k26 |
| `search-ga-layers` | Genetic algorithm over layers | Encode a layout as layers of boxes. Cross and change the layers. | Bortfeldt 2006 | density | generations x population | planned | k26 |
| `search-sa-order` | Simulated annealing over orders | Swap two boxes in the order. Keep a worse order with a probability that falls with the temperature. | Hopper 2001, Kirkpatrick 1983 | density | steps x decoder | planned | k26 |
| `search-sa-best-fit` | Annealing with best fit | Place the first boxes with an order that annealing finds. Place the rest with `best-fit-bkw`. | Burke 2009 | density | steps x decoder | planned | k26 |
| `search-tabu` | Tabu search | Move a box from the worst bin or level to another place. Forbid the reverse move for some steps. | Lodi 1999, Iori 2003 | density | steps x decoder | planned | k26 |
| `search-naive-evolution` | Naive evolution | Change the order at random and keep the better order. | Hopper 2001 | density | steps x decoder | planned | k26 |
| `search-grasp` | Reactive GRASP | Build an order with a random greedy rule. Improve it with a local search. Learn the best amount of randomness from the results. | Alvarez-Valdes 2008 | density | starts x decoder | planned | k26 |
| `search-ils` | Local search in three stages | Build an order with a greedy rule. Improve it with a local search that has no randomness. Then do a local search with random changes. | Wei 2016 | density | steps x decoder | planned | k26 |
| `search-beam` | Filtered beam search | Keep the best `k` partial layouts. Grow each with each box left, remove the weak children with a fast filter, and keep the best `k` again. | Chen 2025 | density | `O(n^2 k)` x decoder | planned | k26 |
| `search-random-restart` | Randomized search | Do a greedy packer with random changes of the order, many times. Keep the best result. | Yang 2013 | density | restarts x decoder | planned | k26 |
| `search-two-stage` | Two-stage intelligent search | Do a greedy search with a fit score. Then improve the order with annealing. | Leung 2011 | density | steps x decoder | planned | k26 |
| `enc-sequence-pair` | Sequence pair | Encode the layout as two orders of the boxes. The two orders give each pair "left of" or "below". A longest path gives the places. | Murata 1996 | density | `O(n^2)` for each decode | planned | k26 |
| `enc-sequence-pair-cost` | Sequence pair with general costs | Do a local search over sequence pairs with a cost for each box and place. | Imahori 2003 | density, other costs | `O(n log n)` for each decode | planned | k26 |
| `enc-bsg` | Bounded slicing grid (BSG) | Put each box in a cell of a grid of crossing walls. The grid gives the relative places. | Nakatake 1996 | density | `O(n^2)` for each decode | planned | k26 |
| `enc-slicing-tree` | Slicing tree, Polish expression | Encode the layout as a tree of horizontal and vertical cuts in postfix form. Anneal over the expression. | Wong 1986 | density, aspect | `O(n)` for each decode | planned | k26 |
| `enc-o-tree` | O-tree | Encode the layout as an ordered tree. A walk of the tree puts each box against its parent. | Guo 1999 | density | `O(n)` for each decode | planned | k26 |
| `enc-b-star-tree` | B*-tree | Encode the layout as a binary tree. A left child is to the right of its parent, a right child is above its parent. | Chang 2000 | density | `O(n)` with a contour | planned | k26 |
| `enc-corner-block-list` | Corner block list (CBL) | Encode the layout by the order in which the box in the top-right corner goes away. | Hong 2000 | density | `O(n)` for each decode | planned | k26 |
| `enc-tcg` | Transitive closure graph (TCG) | Encode the layout as two graphs, "left of" and "below". | Lin 2001 | density | `O(n^2)` for each decode | planned | k26 |

Notes:

- The floorplan encodings (`enc-*`) come from the layout of chips. They can also make each box touch its neighbors, and they can keep a cost of wire length. The joint stage of `highways` can use that cost.
- A search with a time limit is not deterministic across machines. Thus each search has a limit on steps, not on time.

## Exact methods and constraint models

An exact method finds the best layout or proves that no layout fits. Its time grows very fast with the count of boxes. The benchmark uses it on small inputs, to get the best value for the "distance to best".

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `exact-bb-bins` | Branch and bound for bins | Put the boxes into bins one at a time, in the corner places. Cut a branch when a lower bound is not less than the best count of bins. | Martello 1998 | density | exponential | planned | k10 |
| `exact-bb-strip` | Branch and bound for a strip | Search the height of the strip from a lower bound up. For each height, do a branch and bound on the corner places. | Martello 2003 | density | exponential | planned | k10 |
| `exact-bb-strip-avpt` | Branch and bound with better bounds | Do `exact-bb-strip` with new lower bounds and rules that remove equal layouts. | Alvarez-Valdes 2009 | density | exponential | planned | k10 |
| `exact-strip-boschetti` | Exact strip with a relaxation | Solve a relaxation first, then search the places of the boxes. | Boschetti 2010 | density | exponential | planned | k10 |
| `exact-strip-kenmochi` | Exact strip with a staircase | Branch on the places of a staircase of boxes. | Kenmochi 2009 | density | exponential | planned | k10 |
| `exact-benders` | Combinatorial Benders cuts | A master problem cuts the boxes into vertical slices. A check of the order of the slices adds cuts. | Côté 2014 | density | exponential | planned | k10 |
| `exact-benders-logic` | Logic-based Benders | Do `exact-benders` with a logic check. | Delorme 2017 | density | exponential | planned | k10 |
| `exact-opp-graphs` | Packing classes | Search the interval graphs of the two axes, not the places. | Fekete 2004 | density | exponential | planned | k10 |
| `exact-opp-clautiaux` | Two-step orthogonal packing | Branch on the places on the x axis first, then check the y axis. | Clautiaux 2007 | density | exponential | planned | k10 |
| `exact-tree-beasley` | Tree search on grid points | Search over the places on a grid of the possible coordinates. | Beasley 1985a | density | exponential | planned | k10 |
| `milp-relative` | Mixed integer program with relative places | For each pair of boxes, a set of binary variables chooses left, right, above or below. "Big M" rules keep the pair apart. | Chen 1995 | density | exponential | planned | k10 |
| `cp-diffn` | Constraint model with `diffn` and `cumulative` | The global constraint `diffn` keeps the boxes apart. A `cumulative` on each axis cuts the search. | Beldiceanu 1994 | density | exponential | planned | k10 |
| `cp-sweep` | Sweep for non-overlap | Do `cp-diffn` with a sweep over each axis that removes the places that cannot be correct. | Beldiceanu 2001 | density | exponential | planned | k10 |
| `cp-search-strategies` | Search strategies for packing | Do `cp-diffn`, choose all the x places first, then the y places, with interval splits. | Simonis 2008 | density | exponential | planned | k10 |
| `sat-order` | SAT with the order encoding | Encode each coordinate with Boolean variables "x is at most c". Encode each pair with four variables of relative place. Search the height with the solver. | Soh 2010 | density | exponential | planned | k10 |
| `dp-guillotine` | Dynamic programming for guillotine cuts | For each size `(w, h)` on a grid, the best value is the best of each box that fits and of each cut into two parts. | Gilmore 1965, Christofides 1977, Beasley 1985b | density | `O(W H (W + H))` | planned | k10 |

Notes:

- The three-dimensional branch and bound of Martello 2000 uses corner places. The exact strip method of Martello 2003 uses the same idea. The brief of k6 named a "Martello, Pisinger and Vigo" strip method. We found only the three-dimensional paper by these authors, and the strip method by Martello, Monaci and Vigo.
- `dp-guillotine` is exact only for guillotine layouts. It gives a lower bound on the waste of other layouts only with a relaxation.
- A solver for `cp-diffn` or `milp-relative` is a new dependency. The item k10 decides which solver to use.

## Free width: the smallest enclosing rectangle

Most inputs of this project have no fixed width (`container.fixed` is `none`). Then the packer chooses the width. The problem of the smallest enclosing rectangle asks for the rectangle of the smallest area that holds all the boxes. A variant asks for a target aspect.

The general method is a search over widths: pack at each width, and keep the width with the best value. The value is the area, the aspect error or a mix. The exact methods of Korf and of Huang test the candidate rectangles in order of area.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `width-sqrt-area` | Width from the square root of the area | Set the width to 1.5 times the square root of the total area, and not less than the widest box. Then pack. | this repository | speed, aspect | one pack | implemented: `pack` | k33 |
| `width-potpack` | Width of `potpack` | Set the width to the square root of the total area divided by 0.95, and not less than the widest box. Then pack with `potpack`. | Agafonkin, software | speed, aspect | one pack | planned | k33 |
| `width-sweep` | Sweep over widths | Pack at widths on a log scale, from the widest box to the width of one row. Then try the widths between the neighbors of the best width. Keep the lowest area times `1 + weight * aspectError`. | this repository, after Korf 2003 | area, aspect | samples x pack | implemented: `packFree` | k33 |
| `width-breakpoints` | Sweep over breakpoints | Take as candidates only the widths where a row break of the packer changes: the sums of the widths of neighbor boxes. | Korf 2004 | area | candidates x pack | planned | k33 |
| `width-aspect-bisect` | Bisection to a target aspect | The aspect of a strip pack grows with the width. Halve the interval of widths until the aspect is near the target. | this repository | aspect | `O(log W)` x pack | planned | k33 |
| `exact-korf-2003` | Optimal rectangle packing | Test each candidate enclosing rectangle in order of area, with a branch and bound that fills the empty space. Stop at the first that holds all the boxes. The order of the search is unverified. | Korf 2003 | area | exponential | planned | k33 |
| `exact-korf-2004` | Optimal rectangle packing, new results | Do `exact-korf-2003` with better cuts of the search. | Korf 2004 | area | exponential | planned | k33 |
| `exact-meta-csp` | Meta-CSP | Do the search over the relative places of each pair, not over the coordinates. | Moffitt 2006 (unverified), Korf 2010 | area | exponential | planned | k33 |
| `exact-huang-korf` | Absolute placement | Choose all the x coordinates first, then the y coordinates. Add empty boxes to make a perfect packing. Use only the sums of widths as coordinates. | Huang 2009, Huang 2013 | area | exponential | planned | k33 |
| `exact-huang-korf-precision` | High-precision rectangles | Do the search over relative places when the sizes are not small integers. | Huang 2011 | area | exponential | planned | k33 |
| `cp-min-area` | Constraint model for the enclosing rectangle | Do `cp-search-strategies` for each candidate rectangle in order of area. | Simonis 2008, Simonis 2011 | area | exponential | planned | k33 |
| `rpamp-reduction` | Reduction to strip and knapsack problems | Reduce the area problem to strip packing with candidate widths, and to knapsack problems. | Bortfeldt 2013 | area | candidates x strip heuristic | planned | k33 |

Notes:

- The site of item k34 shows the area and the aspect of each candidate width on a chart, and the width that wins.
- The area of a strip pack is not a smooth function of the width. A small change of the width can move a box to the next row. Thus `width-sweep` and `width-aspect-bisect` can miss the best width, and `width-breakpoints` does not.
- Korf 2010 also finds the smallest square for the squares `1x1` to `NxN`. Huang 2010 extends the benchmark to rectangles that are not squares. These consecutive squares are inputs with a known best answer for k45.
- The squarified treemap and the treemaps with a bounded aspect give the aspect of each cell, not of the container. The idea `new-treemap-width` uses them to choose a width.
- The measures `pack.fill`, `pack.aspectError`, `pack.search.widths` and `pack.search.ms` of `docs/FORMAT.md` are for this family.

## Approximation results

These results give a bound on the height of a strip packer against the best height `OPT`. Most of them are theory. The benchmark uses them to explain a result, and code for some of them is short.

| `id` | Name | Bound | Source | Code | Item |
|---|---|---|---|---|---|
| `shelf-nfdh` | NFDH | `2 OPT + h_max` | Coffman 1980 | yes | k21 |
| `shelf-ffdh` | FFDH | `1.7 OPT + h_max` | Coffman 1980 | yes | k21 |
| `shelf-split-fit` | Split-Fit | `1.5 OPT + 2` with heights of 1 or less | Coffman 1980 | yes | k21 |
| `bl-baker` | BL by decreasing width | `3 OPT` | Baker 1980 | yes | k25 |
| `approx-sleator` | Sleator | `2 OPT + h_max / 2`: pack the wide boxes, then two halves side by side | Sleator 1980 | yes | new item |
| `approx-reverse-fit` | Reverse-Fit | `2 OPT`: pack the wide boxes, then pack the rest from the top down in the reverse direction | Schiermeyer 1994 | yes | new item |
| `approx-steinberg` | Steinberg | `2 OPT`: a recursive split with a case for each shape of the input | Steinberg 1997 | hard | new item |
| `approx-kenyon-remila` | APTAS of Kenyon and Rémila | `(1 + e) OPT + O(1 / e^2) h_max`: round the widths, solve a linear program over the configurations | Kenyon 2000 | theory only | none |
| `approx-harren` | `5/3 + e` | `(5/3 + e) OPT`: a structure theorem and a set of cases | Harren 2014 | theory only | none |
| `shelf-online-harmonic` | Online shelf | an online bound: refer to [Online and incremental packing](#online-and-incremental-packing) | Csirik 1997 | yes | k30 |

Notes:

- `approx-sleator` and `approx-reverse-fit` are short, with a known bound. They are good baselines for the benchmark.
- The APTAS and the `5/3 + e` method have very large constants. We do not plan to write them as code.

## Lower bounds

A lower bound gives a height or an area that no layout can beat. The benchmark divides each result by the best lower bound and gets the "distance to best". An exact method gives the best value only on small inputs, but a lower bound is fast on all inputs. These bounds need a new item.

| `id` | Name | Rule | Source | Cost | Item |
|---|---|---|---|---|---|
| `lb-area` | Continuous bound | The total area of the boxes divided by the width. | Martello 2003 | `O(n)` | new item |
| `lb-tallest` | Tallest box | The height of the tallest box. | Martello 2003 | `O(n)` | new item |
| `lb-wide-stack` | Stack of wide boxes | The sum of the heights of the boxes wider than half the width. These boxes cannot be side by side. | Martello 2003 | `O(n)` | new item |
| `lb-l2` | Martello and Vigo L2 | For each threshold `p`, add the heights of the wide boxes and a part of the area of the narrow boxes that cannot go next to them. Take the largest value. | Martello 1998, Martello 2003 | `O(n log n)` | new item |
| `lb-dff` | Dual feasible functions | Change each width with a dual feasible function, then take the continuous bound. Take the best over a family of functions. | Fekete 2001 | `O(n k)` for `k` functions | new item |
| `lb-free-width` | Bound for the free width | The largest of the total area, the area of the tallest box times the widest box, and the bound of Korf 2003 on the wasted space. That bound is unverified. | Korf 2003 | `O(n log n)` | k33 |

Notes:

- With gaps, add the gap to the size of each box and to the width of the container. Then each bound stays correct.
- The "distance to best" of a strategy is its height divided by the best lower bound, minus 1. Exact methods on small inputs show how tight each bound is.

## Treemaps

A treemap cuts a rectangle into cells. The area of each cell is the weight of its item. A box of this project has a fixed size, thus the weight is `w * h`, and the box goes to the center of its cell. The section [The measures and the families](#the-measures-and-the-families) tells how to measure it.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `treemap-slice-dice` | Slice and dice | Cut the rectangle into strips in the input order. Each level of the tree turns the direction of the cut. | Johnson 1991, Shneiderman 1992 | order, speed | `O(n)` | planned | k27 |
| `treemap-squarified` | Squarified | Sort by weight. Add items to a row along the shorter side while the worst aspect in the row gets better. Then start a new row. | Bruls 2000 | aspect | `O(n log n)` | planned | k27 |
| `treemap-strip` | Strip | Do `treemap-squarified` in the input order, always in horizontal strips. | Bederson 2002 | order, aspect | `O(n^2)` | planned | k27 |
| `treemap-pivot-middle` | Pivot by middle | Take the item in the middle of the order as pivot. Put the items before it in one region, and divide the items after it into two regions near the pivot. Recurse. | Shneiderman 2001 | order | `O(n log n)` | planned | k27 |
| `treemap-pivot-size` | Pivot by size | Do `treemap-pivot-middle` with the largest item as pivot. | Shneiderman 2001 | order, aspect | `O(n log n)` | planned | k27 |
| `treemap-pivot-split` | Pivot by split size | Do `treemap-pivot-middle` with the pivot that splits the weight most equally. | Bederson 2002 | order, aspect | `O(n log n)` | planned | k27 |
| `treemap-split` | Split | Split the ordered list into two parts of near equal weight. Cut the rectangle along its longer side. Recurse. | Engdahl 2005 (unverified) | order, aspect | `O(n log n)` | planned | k27 |
| `treemap-spiral` | Spiral | Lay the strips of `treemap-strip` along a spiral from the outside in. | Tu 2007 | order, stability | `O(n^2)` | planned | k27 |
| `treemap-hilbert` | Hilbert | Put the items in order along a Hilbert curve, with cells that follow the curve. | Tak 2013 | order, stability | `O(n log n)` | planned | k27 |
| `treemap-moore` | Moore | Do `treemap-hilbert` with a Moore curve, a closed form of the curve. | Tak 2013 | order, stability | `O(n log n)` | planned | k27 |
| `treemap-jigsaw` | Jigsaw map | Put the items in order along a space-filling curve on a grid of unit cells. | Wattenberg 2005 | order, stability | `O(n)` | planned | k27 |
| `treemap-quantum` | Quantum | Do an ordered treemap with cells that are whole multiples of a unit size, for grids of pictures. | Bederson 2002 | order, aspect | `O(n log n)` | planned | k27 |
| `treemap-voronoi` | Voronoi | Move weighted sites until the area of each Voronoi cell is its weight. The cells are polygons. | Balzer 2005 | aspect | iterations x `O(n log n)` | planned | k27 |
| `treemap-voronoi-fast` | Fast Voronoi | Do `treemap-voronoi` with power diagrams and no raster. | Nocaj 2012 | aspect, speed | iterations x `O(n log n)` | planned | k27 |
| `circle-pack-front-chain` | Circle packing | Put each circle against the front chain of the circles before it. | Wang 2006 (the co-authors are unverified) | aspect | `O(n^2)` | planned | k27 |
| `treemap-spatial` | Spatially ordered | Put each item near a given point, with a split that keeps the order of the two axes. | Wood 2008 | order | `O(n log n)` | planned | k27 |
| `treemap-nmap` | Nmap | Split the items by their given points, and keep the neighbors near. | Duarte 2014 | order, neighbors | `O(n log n)` | planned | k27 |
| `treemap-bounded-aspect` | Bounded aspect | Use convex cells with an aspect of `O(depth)`, or orthoconvex cells with a constant aspect. | de Berg 2011 | aspect | `O(n log n)` | planned | k27 |
| `treemap-local-moves` | Stable by local moves | After a change, do the local move of the layout that gives the best mix of aspect and stability. | Sondag 2018 | stability, aspect | moves x `O(n)` | planned | k27 |
| `treemap-git` | Greedy insertion treemap | Keep the old layout. Remove the old items, and add each new item into the cell that changes the least. | Vernier 2018 | stability | `O(n log n)` | planned | k27 |
| `treemap-evocells` | EvoCells | Map the changes of the tree onto the old layout. Grow and shrink the cells in place. | Scheibel 2018 | stability | `O(n log n)` | planned | k27 |
| `treemap-sizepairs` | SizePairs | Pair the items by their change of size and by their size. Choose the direction of each split and the flips for stability and aspect. | Han 2022 | stability, aspect | `O(n log n)` | planned | k27 |
| `treemap-voronoi-stable` | Stable Voronoi | Start the sites of a new Voronoi treemap at the sites of the old one. | Hahn 2014 | stability | iterations x `O(n log n)` | planned | k27 |
| `treemap-shelf-hybrid` | Treemap rows with boxes | refer to `new-treemap-shelf` | this repository | aspect, density | `O(n log n)` | planned | k31 |

Notes:

- Shneiderman 2001 measures the stability as the mean change of distance of the corners of the cells. Bederson 2002 adds a measure of how easy the order is to read. Tu 2007 adds a measure of continuity.
- Vernier 2020 compares many time-dependent treemaps on the same data. It measures the change with corner travel and relative position change, and it removes the change that the data needs. These measures go into [Measures to add](#measures-to-add).
- The cells of the Voronoi and bounded-aspect treemaps are polygons. A box in such a cell needs the largest rectangle in the polygon.

## Masonry, columns and justified rows

These are the layouts of pages with many cards or pictures. A masonry layout keeps columns of the same width. A justified layout keeps rows of the same width and scales the pictures of each row.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `masonry-shortest` | Shortest column | Put each box, in the input order, at the bottom of the shortest column. | DeSandro, software (the rule is unverified), Graham 1969 | order, speed | `O(n log c)` for `c` columns | planned | k28 |
| `masonry-lpt` | Longest processing time first | Sort by height, decreasing. Then do `masonry-shortest`. | Graham 1969 | density | `O(n log n)` | planned | k28 |
| `masonry-differencing` | Balanced columns by differencing | Balance the column heights with the differencing method of Karmarkar and Karp. | Karmarkar 1982 (the report number is unverified) | density | `O(n log n)` | planned | k28 |
| `columns-linear-partition` | Ordered columns | Cut the input order into `c` parts of near equal height with dynamic programming. Each part is a column. | Skiena 2008, Treitz 2013 (unverified) | order, density | `O(n^2 c)` | planned | k28 |
| `columns-css-balance` | CSS multi-column balance | Fill the columns in order and balance their heights, as `column-fill: balance` does. | W3C multi-column | order | `O(n log n)` | planned | k28 |
| `masonry-multi-span` | Masonry with wide items | An item spans `k` columns. Put it at the place where the highest of its `k` columns is the lowest. | DeSandro, software (the rule is unverified) | density | `O(n c)` | planned | k28 |
| `css-grid-sparse` | CSS grid flow | Put each item in the next free area of the grid, in order. Do not go back. | W3C grid | order | `O(n c)` | planned | k28 |
| `css-grid-dense` | CSS grid dense flow | Put each item in the first free area of the grid from the start, as `grid-auto-flow: dense` does. | W3C grid | density | `O(n^2 c)` | planned | k28 |
| `css-grid-lanes` | CSS grid lanes | Do `masonry-shortest` in a grid, with `display: grid-lanes` of the 2026 draft. The earlier drafts called it `masonry`. | W3C grid level 3 draft | order | `O(n log c)` | planned | k28 |
| `justified-greedy` | Justified rows, greedy | Add pictures to a row at a target height. When a picture makes the row too wide, keep it only if the row gets nearer to the target. Scale the row to the width. | Flickr, software | order, raggedness | `O(n)` | planned | k28 |
| `justified-linear-partition` | Justified rows, linear partition | Cut the order into `k` rows of near equal width with dynamic programming. | Treitz 2013 (unverified), Skiena 2008 | order, raggedness | `O(n^2 k)` | planned | k28 |
| `justified-line-break` | Justified rows, line breaking | Choose all the row breaks at once with the method of Knuth and Plass. The cost of a row is the change of its scale from the target. | Knuth 1981, Harasymiv 2016 (unverified) | order, raggedness | `O(n w)` for `w` items in a row | planned | k28 |
| `grid-template-layout` | Adaptive grid layout | Choose a template of grid cells for each page with a search over a cost. Fit the items to the cells. | Jacobs 2003 | aspect | template count x `n` | planned | k28 |

Notes:

- A box of this project does not scale. Thus `justified-*` gives the row breaks, and the boxes keep their size. Then the result has raggedness, and `pack.raggedness` measures it.
- `masonry-shortest` is the list scheduling of Graham 1969 on parallel machines. `masonry-lpt` uses at most `4/3` of the best height of the highest column.

## Order and stability

These methods keep the reading order of the input, or keep the layout when the input changes. The measures are `pack.order.*` and `pack.stability.*`.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `order-shelf-input` | Shelf in the input order | `shelf-nf` around locked boxes. | this repository | order | `O(n)` | implemented: `packShelf` with `sortOrder: "input"` | k29 |
| `order-ordered-treemaps` | Ordered treemaps | `treemap-pivot-*`, `treemap-strip`, `treemap-split`, `treemap-spiral` and the curves keep the order. | Shneiderman 2001, Bederson 2002 | order | refer to [Treemaps](#treemaps) | planned | k29 |
| `order-orthogonal` | Keep the orthogonal order | Move the boxes, but keep each pair "left of" or "above" as it was. | Misue 1995, Hayashi 1998 | stability | `O(n log n)` | planned | k29 |
| `order-mental-map` | Keep the mental map | Keep the orthogonal order, the near neighbors and the topology of a layout when it changes. | Misue 1995, Eades 1991 | stability | depends on the method | planned | k29 |
| `stable-pin-unchanged` | Pin the boxes that do not change | Lock each box that did not change. Pack only the new or changed boxes around them. | Vernier 2018 | stability | one pack | planned | k29 |
| `stable-local-moves` | Local moves | `treemap-local-moves` for packers: search the moves of a layout for the best mix of a measure and the movement. | Sondag 2018 | stability | moves x measure | planned | k29 |
| `stable-voronoi` | Old sites as the start | `treemap-voronoi-stable`. | Hahn 2014 | stability | refer to [Treemaps](#treemaps) | planned | k29 |
| `stable-animated` | Animated change | Move each box from the old place to the new place in steps. This changes no measure, but it helps a person follow the change. | Heer 2007 | perceived stability | `O(n)` for each frame | planned | k29 |
| `order-spatial` | Near the given place | `treemap-spatial` and `treemap-nmap` for boxes with a given place. | Wood 2008, Duarte 2014 | order | `O(n log n)` | planned | k29 |

Notes:

- A sort by height breaks the reading order. The input order keeps it. The idea `new-rank-window` gives the steps between the two.
- A stable method needs the run on the base input. The variants of the corpus (`base`, `change`) give it.

## Online and incremental packing

An online packer puts each box when it comes, and does not move it later. An incremental packer changes a layout after a change of the input.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `online-nfs-r` | Next Fit Shelf with parameter `r` | Round each height up to a power of `r`. Keep one open shelf for each class of height. | Baker 1983 | density, online | `O(n)` | planned | k30 |
| `online-ffs-r` | First Fit Shelf with parameter `r` | Do `online-nfs-r`, but put a box in the first shelf of its class where it fits. | Baker 1983 | density, online | `O(n log n)` | planned | k30 |
| `shelf-online-harmonic` | Harmonic shelf | Do `online-ffs-r` with classes of width too, as the harmonic bin packing does. | Csirik 1997 | density, online | `O(n log n)` | planned | k30 |
| `online-bl` | Online bottom-left | Do `bl-chazelle` in the order of arrival. Its bound is a lower bound for all online packers. | Brown 1982 | online | `O(n^2)` | planned | k30 |
| `online-dynamic-bins` | Dynamic bin packing | Boxes come and go. Put each new box with First Fit, and do not move the boxes left. | Coffman 1983 | stability | `O(n log n)` | planned | k30 |
| `incremental-push` | Push cascade | Put a box where the user drops it. Push each box that it overlaps away on the axis of the smaller overlap, and push on in turn. | this repository | stability | `O(n^2)` | implemented: `pushCascade` | k30 |
| `incremental-vertical-compact` | Vertical compaction | After a move, move each box up as far as it goes, in order from the top. | react-grid-layout, software | stability, density | `O(n^2)` | planned | k30 |
| `incremental-float` | Float grid | Do `incremental-push`, but do not compact. A box stays where the user puts it. | gridstack.js, software | stability | `O(n^2)` | planned | k30 |
| `incremental-suffix` | Pack the suffix again | Keep each box before the first change in the order. Pack only the boxes from the change to the end. | this repository | stability, order | one pack of the suffix | planned | k30 |
| `incremental-git` | Greedy insertion | `treemap-git` for packers: remove the old boxes, and put each new box in the free space that changes the least. | Vernier 2018 | stability | `O(n F)` | planned | k30 |

Notes:

- The online bounds of Baker 1983 and Csirik 1997 are for the online case. The benchmark can feed the boxes one at a time to measure the online strategies.
- `incremental-suffix` is a baseline for `pack.stability.moved`: it moves no box before the first change.

## Graph layout: components, overlap removal and compaction

These methods come from graph drawing and from the layout of chips. They are near to packing. A component packer packs groups of nodes. An overlap removal moves boxes apart with little movement. A compaction moves boxes together and keeps their order. These methods need a new item.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `components-polyomino` | Polyomino packing | Cover each component with grid cells (a polyomino). Put the polyominoes, from the largest, on the free cells nearest to the center. | Freivalds 2002 | density, aspect | `O(n c^2)` for `c` cells | planned | new item |
| `components-placing` | Placing components | Put each component as a box with a rule for the aspect and the order of the components. The rule is unverified. | Goehlsdorf 2007 | aspect | `O(n log n)` | planned | new item |
| `overlap-prism` | PRISM | Build a proximity graph of the boxes. Grow the edges between overlapping boxes, and do a stress layout. Repeat until no overlap is left. | Gansner 2010 | stability | iterations x `O(n log n)` | planned | new item |
| `overlap-vpsc` | VPSC | For each axis, write "a is left of b by at least the gap" as constraints. Solve the quadratic problem of the smallest movement. | Dwyer 2006 | stability | `O(n log n)` for each axis | planned | new item |
| `overlap-force-scan` | Force-scan | Scan the boxes along each axis. Push each box that overlaps the box before it, along the line between the two centers. | Misue 1995 | stability | `O(n^2)` | planned | new item |
| `overlap-qp` | Constrained optimization | Write the overlap removal as a quadratic program with a choice of "left", "right", "above" or "below" for each pair. | Marriott 2003 | stability | exponential | planned | new item |
| `overlap-gtree` | GTree | Build a minimum spanning tree of the overlap graph. Grow the tree edges, and move the boxes along the tree. | Nachmanson 2016 | stability | iterations x `O(n log n)` | planned | new item |
| `overlap-spring` | Spring removal (DNLS) | Add a spring force between overlapping boxes, and do a force layout. | Li 2005 | stability | iterations x `O(n^2)` | planned | new item |
| `overlap-odnls` | ODNLS | The second spring method of Li 2005. The brief called it ODNC. Its full name and rule are unverified. | Li 2005 | stability | iterations x `O(n^2)` | planned | new item |
| `overlap-orthogonal` | Orthogonal order | Remove the overlap and keep the orthogonal order of each pair. | Hayashi 1998 | stability, order | `O(n log n)` | planned | new item |
| `compact-1d` | One-dimensional compaction | Build a graph of the constraints "a is left of b by at least the gap" with a scan line. Give each box its longest path from the left wall. Do the same for y. | Lengauer 1990, Liao 1983 | density, order | `O(n log n)` | planned | new item |
| `compact-mixed` | Compaction with mixed constraints | Do `compact-1d` with upper bounds on some distances too. | Liao 1983 | density | `O(n E)` for `E` constraints | planned | new item |
| `compact-optimal` | Optimal compaction | Compact both axes at once with an integer program. | Klau 1999 | density | exponential | planned | new item |

Notes:

- `compact-1d` after a shelf or a skyline pack removes the gaps that the rows leave. It keeps the order of each pair on each axis, thus it does not add inversions.
- The overlap removal methods need a start layout. A force layout or a user layout gives it. Then `pack.stability.mean` measures the movement against the start.
- The item k38 (obstacles that move at a cost) is near to overlap removal. An overlap removal method can be a strategy of k38.

## Text and interface layout

These methods come from the layout of text and of user interfaces. They are packers with an order.

| `id` | Name | Rule | Source | Goal | Cost | Status | Item |
|---|---|---|---|---|---|---|---|
| `flex-wrap` | Flexbox wrap | `shelf-nf` in the input order, with a rule for the space that is left in each row (start, center, end or between). | W3C flexbox | order | `O(n)` | planned | k28 |
| `flex-wrap-grow` | Flexbox wrap with grow | Do `flex-wrap`, then give the space left in each row to the boxes that can grow. | W3C flexbox | order, raggedness | `O(n)` | planned | k28 |
| `line-break-knuth-plass` | Line breaking of boxes | Choose all the row breaks of the input order at once. The cost of a row is the square of its free width. The last row has no cost. | Knuth 1981 | order, raggedness | `O(n w)` | planned | k29 |
| `label-greedy` | Greedy label placement | For each point, choose one of four places for its label. Take the place with the fewest overlaps. | Christensen 1995 | overlap | `O(n log n)` | planned | new item |
| `label-annealing` | Label placement by annealing | Do `label-greedy`, then anneal over the choices. | Christensen 1995 | overlap | steps x `O(log n)` | planned | new item |
| `label-four-place` | Four-place labels | Choose one of four corners of each point for its square label. Make the labels as large as possible with no overlap. | Formann 1991 | overlap | `O(n log n)` | planned | new item |
| `word-cloud-spiral` | Spiral placement | Put each box, from the largest, at the first place without overlap along a spiral from the center. The rule is unverified. | Viégas 2009 | density, aspect | `O(n^2)` | planned | new item |
| `ui-grid-ip` | Grid layout by integer program | Write the layout of interface elements on a grid as an integer program, with goals of alignment and balance. | Dayama 2020 | order, aspect | exponential | planned | new item |

Notes:

- `line-break-knuth-plass` with boxes of fixed size gives rows with the least raggedness for the input order. It is a strong baseline for `pack.raggedness` and `pack.order.inversions` at the same time.
- `word-cloud-spiral` puts the large boxes in the center. It does not keep an order. It aims at a round outline.

## New ideas

These ideas are new for this project. Some of them join two published methods. Each idea gives a reason and a prediction. A prediction goes into the file of predictions before the benchmark measures the idea.

| `id` | Name | Rule | Why it is new | Prediction | Item |
|---|---|---|---|---|---|
| `new-rank-maxrects` | MaxRects with a rank penalty | Do `maxrects-bl`, but add to the score of each place a penalty for each box of lower rank that is after it in the reading order. | MaxRects aims at density only. This idea puts the order into the same score. | It gets near the density of `maxrects-bl` with half its `pack.order.inversions` on inputs with many sizes. | k31 |
| `new-shelf-lookahead` | Shelf with a look-ahead | For each row, take the next `k` boxes in the input order. Dynamic programming chooses which of them go into the row, with a cost for each box that it moves back. | `shelf-knapsack` has no order. This idea has a knob from the input order (`k = 1`) to `shelf-knapsack` (`k = n`). | With `k = 4`, it beats `shelf-nf` on `pack.whitespace` by 10 percent or more, with few inversions. | k31 |
| `new-rank-window` | Rank window | Any packer that takes the best box only from the next `k` boxes of the input order. | It gives a curve between "sort for density" and "keep the order". The curve is a result of its own. | The curve of whitespace against inversions has a knee at a small `k`, near 3 to 6. | k31 |
| `new-pin-repack` | Pin and pack in the holes | After a change, lock each box that did not change. Pack the changed boxes into the free spaces with `maxrects-locked`. If a box does not fit, do `incremental-suffix`. | `stable-pin-unchanged` exists for treemaps. This idea joins it with a fallback for the case that does not fit. | `pack.stability.moved` near 0 for the changes `add` and `resize` with small boxes, at a small cost of `pack.whitespace`. | k31 |
| `new-move-matching` | Repack and match | Do a fresh pack of the changed input. Then give each old box the new place of the same size that is nearest to its old place, with a matching. | A fresh pack gives density, and the matching gives stability. No source does the two steps. | Less `pack.stability.mean` than a fresh pack, with the same `pack.area`. | k31 |
| `new-feature-selector` | Selector by input features | Measure the input: count, spread of heights, spread of aspects, part of locked boxes. Choose a strategy with a model that the benchmark trains. | The selector item (k20) measures the choice. This idea is the first selector to measure. | It is within 3 percent of the best strategy on each input, at the cost of one strategy. | k20, k31 |
| `new-portfolio` | Portfolio | Use a set of fast strategies, and keep the best result for a weighted score. | It is easy to write, and it gives an upper line for each single strategy. | It wins on the score on each family of the corpus, at five to ten times the time. | k31 |
| `new-treemap-shelf` | Treemap rows with boxes | Do `treemap-squarified` on the weights `w * h` to choose the rows. Then pack the boxes of each row with `shelf-nf`. | Treemaps choose good rows, but they change the shape of a box. This idea keeps the shape. | Less `pack.aspect` than `shelf-nfdh` with the same `pack.whitespace` on inputs with a free width. | k31 |
| `new-treemap-width` | Width from a treemap | Do a squarified treemap of the weights in a rectangle with the target aspect. Take the width of that rectangle and the widest box, then pack. | It uses a treemap to choose a width, not to place boxes. | Less `pack.aspectError` than `width-sqrt-area` in one pack. | k33 |
| `new-width-pareto` | Width sweep with a front | Do `width-breakpoints`. Keep the front of the widths where no other width is better on area and on aspect error. | Each width gives a different trade. The front shows the trade, and a user can choose. | The front has fewer than 8 widths on most inputs of the corpus. | k33, k34 |
| `new-kp-rows-fill` | Line breaking and gap fill | Do `line-break-knuth-plass` for the row breaks. Then fill the space under the lower boxes of each row with the next boxes of the same row only. | The gap fill of `packRows` takes boxes from later rows and breaks the order. This fill stays in the row. | Less `pack.raggedness` than `rows-gap-fill` and no more `pack.order.breaks` than `rows-input`. | k31 |
| `new-group-recursive` | Pack the groups recursively | Pack the children of each parent first. Then pack each parent as one box. Choose the strategy of each level by its count. | Component packing does one level. This idea uses the nesting of `layout-input/1`. | Less `pack.area` than a flat pack on the inputs with groups, because the groups stay together. | k31 |
| `new-port-aware` | Pack for short edges | Add to the score of each place the length of the edges from the box to the boxes that are already placed. | The joint stage packs and then routes. This idea lets the packer see the edges. | Less `joint` edge length than `maxrects-bl`, at a small cost of `pack.whitespace`. | k31 |

## Measures to add

The literature uses these measures, but `docs/FORMAT.md` does not have them. Each has a lowercase name with the stage first.

| Name | Unit | Better | What it measures | Source |
|---|---|---|---|---|
| `pack.height` | units | lower | The height of the hull for a fixed width: the value of strip packing. | Martello 2003 |
| `pack.gap` | ratio | lower | The height divided by the best lower bound, minus 1: the "distance to best". | Martello 2003 |
| `pack.cell.aspect` | ratio | lower | The mean aspect of the cells of a treemap, or of the boxes in their cells. | Bruls 2000 |
| `pack.order.readability` | 0 to 1 | higher | The part of the steps of the reading order that do not change direction. | Bederson 2002 |
| `pack.order.continuity` | 0 to 1 | higher | The part of the pairs of next items in the order that touch. | Tu 2007 |
| `pack.stability.cornerTravel` | 0 to 1 | lower | The L1 distance that the four corners of a box move, divided by 4 times the diagonal of the container. | Vernier 2020 |
| `pack.stability.relativePosition` | 0 to 1 | lower | The mean change of the relative position of each pair of boxes. | Sondag 2018, Vernier 2020 |
| `pack.stability.relativeDirection` | 0 to 1 | lower | The mean change of the angle between the centers of each pair of boxes. A rotation of the layout does not change it. | Hahn 2017 |
| `pack.stability.drift` | units | lower | The mean distance of each box from its mean place over a series of changes. | Tak 2013 |
| `pack.stability.baseline` | 0 to 1 | lower | The movement minus the smallest movement that the change of the input needs. | Vernier 2020 |
| `pack.stability.orthogonalOrder` | 0 to 1 | lower | The part of the pairs where "left of" or "above" changed. | Misue 1995 |
| `pack.neighbors` | 0 to 1 | higher | The part of the near neighbors of each box in the input that stay near neighbors. | Duarte 2014 |
| `pack.balance` | 0 to 1 | lower | The spread of the bottom ends of the columns, divided by the height. The column form of `pack.raggedness`. | Graham 1969 |
| `pack.trapped` | 0 to 1 | lower | The part of the empty area that no box of the input can use: holes smaller than the smallest box. | Jylänki 2010 |
| `pack.displacement` | units | lower | The mean movement of a box from a start layout, for overlap removal. | Gansner 2010 |

## Bibliography

Each entry gives the key of the tables, the authors, the title, the place of publication and a DOI or a URL. The note "unverified" marks the part that we did not find in a library record or on the page of the publisher.

### Papers and books

- **Alvarez-Valdes 2008.** R. Alvarez-Valdes, F. Parreño, J. M. Tamarit. "Reactive GRASP for the strip-packing problem". Computers and Operations Research 35(4):1065-1083. <https://doi.org/10.1016/j.cor.2006.07.004>
- **Alvarez-Valdes 2009.** R. Alvarez-Valdes, F. Parreño, J. M. Tamarit. "A branch and bound algorithm for the strip packing problem". OR Spectrum 31(2):431-459. <https://doi.org/10.1007/s00291-008-0128-5>
- **Baker 1980.** Brenda S. Baker, E. G. Coffman Jr., Ronald L. Rivest. "Orthogonal packings in two dimensions". "SIAM Journal on Computing" 9(4):846-855. <https://doi.org/10.1137/0209064>
- **Baker 1983.** Brenda S. Baker, Jerald S. Schwarz. "Shelf algorithms for two-dimensional packing problems". "SIAM Journal on Computing" 12(3):508-525. <https://doi.org/10.1137/0212033>
- **Balzer 2005.** Michael Balzer, Oliver Deussen. "Voronoi treemaps". IEEE Symposium on Information Visualization (InfoVis 2005), pages 49-56. The DOI is unverified: two records give different values.
- **Beasley 1985a.** J. E. Beasley. "An exact two-dimensional non-guillotine cutting tree search procedure". Operations Research 33(1):49-64. <https://doi.org/10.1287/opre.33.1.49>
- **Beasley 1985b.** J. E. Beasley. "Algorithms for unconstrained two-dimensional guillotine cutting". Journal of the Operational Research Society 36(4):297-306. <https://doi.org/10.1057/jors.1985.51>
- **Bederson 2002.** Benjamin B. Bederson, Ben Shneiderman, Martin Wattenberg. "Ordered and quantum treemaps: making effective use of 2D space to display hierarchies". ACM Transactions on Graphics 21(4):833-854. <https://doi.org/10.1145/571647.571649>
- **Beldiceanu 1994.** N. Beldiceanu, E. Contejean. "Introducing global constraints in CHIP". "Mathematical and Computer Modelling" 20(12):97-123. <https://doi.org/10.1016/0895-7177(94)90127-9>
- **Beldiceanu 2001.** Nicolas Beldiceanu, Mats Carlsson. "Sweep as a generic pruning technique applied to the non-overlapping rectangles constraint". CP 2001, LNCS 2239, pages 377-391. <https://doi.org/10.1007/3-540-45578-7_26>
- **Berkey 1987.** J. O. Berkey, P. Y. Wang. "Two-dimensional finite bin-packing algorithms". Journal of the Operational Research Society 38(5):423-429. <https://doi.org/10.1057/jors.1987.70>
- **Bortfeldt 2006.** Andreas Bortfeldt. "A genetic algorithm for the two-dimensional strip packing problem with rectangular pieces". European Journal of Operational Research 172(3):814-837. <https://doi.org/10.1016/j.ejor.2004.11.016>
- **Bortfeldt 2013.** Andreas Bortfeldt. "A reduction approach for solving the rectangle packing area minimization problem". European Journal of Operational Research 224(3):486-496. <https://doi.org/10.1016/j.ejor.2012.08.006>
- **Boschetti 2010.** Marco Antonio Boschetti, Lorenza Montaletti. "An exact algorithm for the two-dimensional strip-packing problem". Operations Research 58(6):1774-1791. <https://doi.org/10.1287/opre.1100.0833>
- **Brown 1982.** Donna J. Brown, Brenda S. Baker, Howard P. Katseff. "Lower bounds for on-line two-dimensional packing algorithms". Acta Informatica 18(2):207-225. <https://doi.org/10.1007/BF00264439> The pages are unverified.
- **Bruls 2000.** Mark Bruls, Kees Huizing, Jarke J. van Wijk. "Squarified treemaps". Data Visualization 2000 (VisSym 2000), Springer, pages 33-42. <https://doi.org/10.2312/VisSym/VisSym00/033-042>
- **Burke 2004.** E. K. Burke, G. Kendall, G. Whitwell. "A new placement heuristic for the orthogonal stock-cutting problem". Operations Research 52(4):655-671. <https://doi.org/10.1287/opre.1040.0109>
- **Burke 2009.** Edmund K. Burke, Graham Kendall, Glenn Whitwell. "A simulated annealing enhancement of the best-fit heuristic for the orthogonal stock-cutting problem". "INFORMS Journal on Computing" 21(3):505-516. <https://doi.org/10.1287/ijoc.1080.0306>
- **Chang 2000.** Yun-Chih Chang, Yao-Wen Chang, Guang-Ming Wu, Shu-Wei Wu. "B*-trees: a new representation for non-slicing floorplans". DAC 2000, pages 458-463. <https://doi.org/10.1145/337292.337541>
- **Chazelle 1983.** Bernard Chazelle. "The bottom-left bin-packing heuristic: an efficient implementation". IEEE Transactions on Computers C-32(8):697-707. <https://doi.org/10.1109/TC.1983.1676307>
- **Chen 1995.** C. S. Chen, S. M. Lee, Q. S. Shen. "An analytical model for the container loading problem". European Journal of Operational Research 80(1):68-76. <https://doi.org/10.1016/0377-2217(94)00002-T>
- **Chen 2007.** Mao Chen, Wenqi Huang. "A two-level search algorithm for 2D rectangular packing problem". "Computers and Industrial Engineering" 53(1):123-136. <https://doi.org/10.1016/j.cie.2007.04.007>
- **Chen 2025.** Mao Chen, Xicheng Peng, Xiangyang Tang. "Filtered beam search algorithm for the two-dimensional rectangular packing problem". International Transactions in Operational Research 32(6):3729-3755. <https://doi.org/10.1111/itor.70010>
- **Christensen 1995.** Jon Christensen, Joe Marks, Stuart Shieber. "An empirical study of algorithms for point-feature label placement". ACM Transactions on Graphics 14(3):203-232. <https://doi.org/10.1145/212332.212334>
- **Christofides 1977.** Nicos Christofides, Charles Whitlock. "An algorithm for two-dimensional cutting problems". Operations Research 25(1):30-44. <https://doi.org/10.1287/opre.25.1.30>
- **Chung 1982.** F. R. K. Chung, M. R. Garey, D. S. Johnson. "On packing two-dimensional bins". SIAM Journal on Algebraic and Discrete Methods 3(1):66-76. The report of 1981: <https://minds.wisconsin.edu/handle/1793/58236>
- **Clautiaux 2007.** François Clautiaux, Jacques Carlier, Aziz Moukrim. "A new exact method for the two-dimensional orthogonal packing problem". European Journal of Operational Research 183(3):1196-1211. <https://doi.org/10.1016/j.ejor.2005.12.048>
- **Coffman 1980.** E. G. Coffman Jr., M. R. Garey, D. S. Johnson, R. E. Tarjan. "Performance bounds for level-oriented two-dimensional packing algorithms". "SIAM Journal on Computing" 9(4):808-826. <https://doi.org/10.1137/0209062>
- **Coffman 1983.** E. G. Coffman Jr., M. R. Garey, D. S. Johnson. "Dynamic bin packing". "SIAM Journal on Computing" 12(2):227-258. <https://doi.org/10.1137/0212014>
- **Crainic 2008.** Teodor Gabriel Crainic, Guido Perboli, Roberto Tadei. "Extreme point-based heuristics for three-dimensional bin packing". "INFORMS Journal on Computing" 20(3):368-384. <https://doi.org/10.1287/ijoc.1070.0250>
- **Csirik 1997.** János Csirik, Gerhard J. Woeginger. "Shelf algorithms for on-line strip packing". Information Processing Letters 63(4):171-175. <https://doi.org/10.1016/S0020-0190(97)00120-8>
- **Dayama 2020.** Niraj Dayama, Kashyap Todi, Taru Saarelainen, Antti Oulasvirta. "GRIDS: interactive layout design with integer programming". CHI 2020. <https://doi.org/10.1145/3313831.3376553>
- **de Berg 2011.** Mark de Berg, Bettina Speckmann, Vincent van der Weele. "Treemaps with bounded aspect ratio". ISAAC 2011, LNCS. <https://doi.org/10.1007/978-3-642-25591-5_28> A journal version of 2014 is unverified.
- **Delorme 2017.** Maxence Delorme, Manuel Iori, Silvano Martello. "Logic based Benders' decomposition for orthogonal stock cutting problems". Computers and Operations Research 78:290-298. <https://doi.org/10.1016/j.cor.2016.09.009>
- **Duarte 2014.** Felipe S. L. G. Duarte, Fabio Sikansi, Francisco M. Fatore, Samuel G. Fadel, Fernando V. Paulovich. "Nmap: a novel neighborhood preservation space-filling algorithm". IEEE TVCG 20(12):2063-2071. <https://doi.org/10.1109/TVCG.2014.2346276>
- **Dwyer 2006.** Tim Dwyer, Kim Marriott, Peter J. Stuckey. "Fast node overlap removal". "Graph Drawing" 2005, LNCS 3843, pages 153-164. <https://doi.org/10.1007/11618058_15>
- **Eades 1991.** Peter Eades, Wei Lai, Kazuo Misue, Kozo Sugiyama. "Preserving the mental map of a diagram". Compugraphics 1991, pages 24-33. The record is unverified: <https://www.bibsonomy.org/bibtex/5b39c1a8aa05b91465ad0ba256d6579f>
- **El Hayek 2008.** Joseph El Hayek, Aziz Moukrim, Stéphane Negre. "New resolution algorithm and pretreatments for the two-dimensional bin-packing problem". Computers and Operations Research 35(10):3184-3201. <https://doi.org/10.1016/j.cor.2007.02.013>
- **Engdahl 2005.** Björn Engdahl. "Ordered and unordered treemap algorithms and their applications on handheld devices". Master thesis, KTH, Stockholm. Unverified: only citations name it.
- **Fekete 2001.** Sándor P. Fekete, Jörg Schepers. "New classes of fast lower bounds for bin packing problems". "Mathematical Programming" 91(1):11-31. <https://doi.org/10.1007/s101070100243>
- **Fekete 2004.** Sándor P. Fekete, Jörg Schepers. "A combinatorial characterization of higher-dimensional orthogonal packing". Mathematics of Operations Research 29(2):353-368. <https://doi.org/10.1287/moor.1030.0079>
- **Formann 1991.** M. Formann, F. Wagner. "A packing problem with applications to lettering of maps". SoCG 1991, pages 281-288. The DOI is unverified.
- **Freivalds 2002.** Karlis Freivalds, Ugur Dogrusoz, Paulis Kikusts. "Disconnected graph layout and the polyomino packing approach". "Graph Drawing" 2001, LNCS 2265, pages 378-391. <https://doi.org/10.1007/3-540-45848-4_30>
- **Gansner 2010.** Emden R. Gansner, Yifan Hu. "Efficient, proximity-preserving node overlap removal". Journal of Graph Algorithms and Applications 14(1):53-74. <https://doi.org/10.7155/jgaa.00198>
- **Gilmore 1965.** P. C. Gilmore, R. E. Gomory. "Multistage cutting stock problems of two and more dimensions". Operations Research 13(1):94-120. <https://doi.org/10.1287/opre.13.1.94>
- **Goehlsdorf 2007.** Dennis Goehlsdorf, Michael Kaufmann, Martin Siebenhaller. "Placing connected components of disconnected graphs". APVIS 2007, pages 101-108. <https://dblp.org/rec/conf/apvis/GoehlsdorfKS07.html>
- **Graham 1969.** R. L. Graham. "Bounds on multiprocessing timing anomalies". SIAM Journal on Applied Mathematics 17(2):416-429. <https://doi.org/10.1137/0117039>
- **Guo 1999.** Pei-Ning Guo, Chung-Kuan Cheng, Takeshi Yoshimura. "An O-tree representation of non-slicing floorplan and its applications". DAC 1999, pages 268-273. <https://doi.org/10.1145/309847.309928>
- **Hahn 2014.** Sebastian Hahn, Jonas Trümper, Dominik Moritz, Jürgen Döllner. "Visualization of varying hierarchies by stable layout of Voronoi treemaps". IVAPP 2014, pages 50-58. <https://doi.org/10.5220/0004686200500058>
- **Hahn 2017.** Sebastian Hahn, Joseph Bethge, Jürgen Döllner. "Relative direction change: a topology-based metric for layout stability in treemaps". IVAPP 2017. <https://www.scitepress.org/Papers/2017/61175/>
- **Han 2022.** Chang Han, Anyi Li, Jaemin Jo, Bongshin Lee, Oliver Deussen, Yunhai Wang. "SizePairs: achieving stable and balanced temporal treemaps using hierarchical size-based pairing". IEEE VIS 2022. <https://virtual.ieeevis.org/year/2022/paper_v-full-1163.html>
- **Harasymiv 2016.** Antin Harasymiv. "Building the Google Photos web UI". Medium. Unverified: we could not read the page. <https://medium.com/google-design/google-photos-45b714dfbed1>
- **Harren 2014.** Rolf Harren, Klaus Jansen, Lars Prädel, Rob van Stee. "A (5/3 + ε)-approximation for strip packing". Computational Geometry 47(2):248-267. <https://doi.org/10.1016/j.comgeo.2013.08.008>
- **Hayashi 1998.** K. Hayashi, M. Inoue, T. Masuzawa, H. Fujiwara. "A layout adjustment problem for disjoint rectangles preserving orthogonal order". "Graph Drawing" 1998, LNCS 1547, pages 183-197. The first names are unverified.
- **Heer 2007.** Jeffrey Heer, George G. Robertson. "Animated transitions in statistical data graphics". IEEE TVCG 13(6):1240-1247. <https://doi.org/10.1109/TVCG.2007.70539>
- **Hong 2000.** Xianlong Hong, Gang Huang, Yici Cai, Jiangchun Gu, Sheqin Dong, Chung-Kuan Cheng, Jun Gu. "Corner block list: an effective and efficient topological representation of non-slicing floorplan". ICCAD 2000, pages 8-12. <https://doi.org/10.1109/ICCAD.2000.896442>
- **Hopper 2001.** E. Hopper, B. C. H. Turton. "An empirical investigation of meta-heuristic and heuristic algorithms for a 2D packing problem". European Journal of Operational Research 128(1):34-57. <https://doi.org/10.1016/S0377-2217(99)00357-4>
- **Huang 2007.** Wenqi Huang, Duanbing Chen, Ruchu Xu. "A new heuristic algorithm for rectangle packing". Computers and Operations Research 34(11):3270-3280. <https://doi.org/10.1016/j.cor.2005.12.005>
- **Huang 2009.** Eric Huang, Richard E. Korf. "New improvements in optimal rectangle packing". IJCAI 2009, pages 511-516. <https://ijcai.org/Abstract/09/092>
- **Huang 2010.** Eric Huang, Richard E. Korf. "Optimal rectangle packing on non-square benchmarks". AAAI 2010, pages 83-88. <https://ojs.aaai.org/index.php/AAAI/article/view/7538>
- **Huang 2011.** Eric Huang, Richard E. Korf. "Optimal packing of high-precision rectangles". AAAI 2011, pages 42-47. <https://doi.org/10.1609/aaai.v25i1.7814>
- **Huang 2013.** Eric Huang, Richard E. Korf. "Optimal rectangle packing: an absolute placement approach". Journal of Artificial Intelligence Research 46:47-87. <https://doi.org/10.1613/jair.3735>
- **Imahori 2003.** S. Imahori, M. Yagiura, T. Ibaraki. "Local search algorithms for the rectangle packing problem with general spatial costs". "Mathematical Programming" 97(3):543-569. <https://doi.org/10.1007/s10107-003-0427-1>
- **Imahori 2010.** Shinji Imahori, Mutsunori Yagiura. "The best-fit heuristic for the rectangular strip packing problem: an efficient implementation and the worst-case approximation ratio". Computers and Operations Research 37(2):325-333. <https://doi.org/10.1016/j.cor.2009.05.008>
- **Iori 2003.** Manuel Iori, Silvano Martello, Michele Monaci. "Metaheuristic algorithms for the strip packing problem". In "Optimization and Industry: New Frontiers", Kluwer, pages 159-179. <https://doi.org/10.1007/978-1-4613-0233-9_7>
- **Jacobs 2003.** Charles Jacobs, Wilmot Li, Evan Schrier, David Bargeron, David Salesin. "Adaptive grid-based document layout". ACM Transactions on Graphics 22(3):838-847. <https://research.adobe.com/publication/adaptive-grid-based-document-layout>
- **Jakobs 1996.** Stefan Jakobs. "On genetic algorithms for the packing of polygons". European Journal of Operational Research 88(1):165-181. <https://doi.org/10.1016/0377-2217(94)00166-9>
- **Johnson 1991.** Brian Johnson, Ben Shneiderman. "Tree-maps: a space-filling approach to the visualization of hierarchical information structures". IEEE Visualization 1991. <https://www.cs.umd.edu/~ben/papers/Johnson1991Tree.pdf>
- **Jylänki 2010.** Jukka Jylänki. "A thousand ways to pack the bin: a practical approach to two-dimensional rectangle bin packing". A report with code, and the year is unverified. The code has each rule of this catalog with the key Jylänki 2010. <https://github.com/juj/RectangleBinPack>
- **Karmarkar 1982.** Narendra Karmarkar, Richard M. Karp. "The differencing method of set partitioning". University of California, Berkeley, report UCB/CSD 82/113. The number and the year are unverified. <https://www2.eecs.berkeley.edu/Pubs/TechRpts/1983/6353.html>
- **Kenmochi 2009.** Mitsutoshi Kenmochi, Takashi Imamichi, Koji Nonobe, Mutsunori Yagiura, Hiroshi Nagamochi. "Exact algorithms for the two-dimensional strip packing problem with and without rotations". European Journal of Operational Research 198(1):73-83. <https://doi.org/10.1016/j.ejor.2008.08.020>
- **Kenyon 2000.** Claire Kenyon, Eric Rémila. "A near-optimal solution to a two-dimensional cutting stock problem". Mathematics of Operations Research 25(4):645-656. <https://doi.org/10.1287/moor.25.4.645.12118>
- **Kirkpatrick 1983.** Scott Kirkpatrick, C. Daniel Gelatt Jr., Mario P. Vecchi. "Optimization by simulated annealing". Science 220(4598):671-680. <https://doi.org/10.1126/science.220.4598.671>
- **Klau 1999.** Gunnar W. Klau, Petra Mutzel. "Optimal compaction of orthogonal grid drawings". IPCO 1999, LNCS 1610. <https://doi.org/10.1007/3-540-48777-8_23>
- **Knuth 1981.** Donald E. Knuth, Michael F. Plass. "Breaking paragraphs into lines". Software: Practice and Experience 11(11):1119-1184. <https://doi.org/10.1002/spe.4380111102>
- **Korf 2003.** Richard E. Korf. "Optimal rectangle packing: initial results". ICAPS 2003, pages 287-295. We found no DOI and no stable URL.
- **Korf 2004.** Richard E. Korf. "Optimal rectangle packing: new results". ICAPS 2004. <https://icaps04.icaps-conference.org/icapspapers/ICAPS04KorfR.pdf>
- **Korf 2010.** Richard E. Korf, Michael D. Moffitt, Martha E. Pollack. "Optimal rectangle packing". Annals of Operations Research 179(1):261-295. <https://doi.org/10.1007/s10479-008-0463-6>
- **Lengauer 1990.** Thomas Lengauer. "Combinatorial algorithms for integrated circuit layout". Wiley and Teubner, a book. <https://doi.org/10.1007/978-3-322-92106-2>
- **Leung 2011.** Stephen C. H. Leung, Defu Zhang, Kwang Mong Sim. "A two-stage intelligent search algorithm for the two-dimensional strip packing problem". European Journal of Operational Research 215(1):57-69. <https://doi.org/10.1016/j.ejor.2011.06.002>
- **Li 2005.** Wanchun Li, Peter Eades, Nikola S. Nikolov. "Using spring algorithms to remove node overlapping". APVIS 2005, CRPIT 45, pages 131-140. <https://dblp.org/rec/conf/apvis/LiEN05.html>
- **Liao 1983.** Yuh-Zen Liao, C. K. Wong. "An algorithm to compact a VLSI symbolic layout with mixed constraints". IEEE Transactions on CAD 2(2):62-69. <https://doi.org/10.1109/TCAD.1983.1270022>
- **Lin 2001.** Jai-Ming Lin, Yao-Wen Chang. "TCG: a transitive closure graph-based representation for non-slicing floorplans". DAC 2001, pages 764-769. <https://doi.org/10.1109/DAC.2001.935608>
- **Liu 1999.** Dequan Liu, Hongfei Teng. "An improved BL-algorithm for genetic algorithm of the orthogonal packing of rectangles". European Journal of Operational Research 112(2):413-420. <https://doi.org/10.1016/S0377-2217(97)00437-2>
- **Lodi 1999.** Andrea Lodi, Silvano Martello, Daniele Vigo. "Heuristic and metaheuristic approaches for a class of two-dimensional bin packing problems". "INFORMS Journal on Computing" 11(4):345-357. <https://doi.org/10.1287/ijoc.11.4.345>
- **Marriott 2003.** Kim Marriott, Peter Stuckey, Vincent Tam, `Weiqing He`. "Removing node overlapping in graph layout using constrained optimization". Constraints 8(2):143-171. <https://doi.org/10.1023/A:1022371615202>
- **Martello 1998.** Silvano Martello, Daniele Vigo. "Exact solution of the two-dimensional finite bin packing problem". Management Science 44(3):388-399. <https://doi.org/10.1287/mnsc.44.3.388>
- **Martello 2000.** Silvano Martello, David Pisinger, Daniele Vigo. "The three-dimensional bin packing problem". Operations Research 48(2):256-267. <https://doi.org/10.1287/opre.48.2.256.12386>
- **Martello 2003.** Silvano Martello, Michele Monaci, Daniele Vigo. "An exact approach to the strip-packing problem". "INFORMS Journal on Computing" 15(3):310-319. <https://doi.org/10.1287/ijoc.15.3.310.16082>
- **Misue 1995.** Kazuo Misue, Peter Eades, Wei Lai, Kozo Sugiyama. "Layout adjustment and the mental map". Journal of Visual Languages and Computing 6(2):183-210. The DOI is unverified.
- **Moffitt 2006.** Michael D. Moffitt, Martha E. Pollack. "Optimal rectangle packing: a meta-CSP approach". ICAPS 2006. Unverified: only reference lists name it.
- **Murata 1996.** H. Murata, K. Fujiyoshi, S. Nakatake, Y. Kajitani. "VLSI module placement based on rectangle-packing by the sequence-pair". IEEE Transactions on CAD 15(12):1518-1524. <https://doi.org/10.1109/43.552084>
- **Nachmanson 2016.** Lev Nachmanson, Arlind Nocaj, Sergey Bereg, Leishi Zhang, Alexander Holroyd. "Node overlap removal by growing a tree". "Graph Drawing" 2016, LNCS 9801, pages 33-43. <https://doi.org/10.1007/978-3-319-50106-2_3>
- **Nakatake 1996.** S. Nakatake, K. Fujiyoshi, H. Murata, Y. Kajitani. "Module placement on BSG-structure and IC layout applications". ICCAD 1996, pages 484-491. <https://doi.org/10.1109/ICCAD.1996.569870>
- **Nocaj 2012.** Arlind Nocaj, Ulrik Brandes. "Computing Voronoi treemaps: faster, simpler, and resolution-independent". Computer Graphics Forum 31(3):855-864. <https://doi.org/10.1111/j.1467-8659.2012.03078.x>
- **Ntene 2009.** N. Ntene, J. H. van Vuuren. "A survey and comparison of guillotine heuristics for the 2D oriented offline strip packing problem". Discrete Optimization 6(2):174-188. <https://doi.org/10.1016/j.disopt.2008.11.002>
- **Ortmann 2010.** Frank G. Ortmann, Nthabiseng Ntene, Jan H. van Vuuren. "New and improved level heuristics for the rectangular strip packing and variable-sized bin packing problems". European Journal of Operational Research 203(2):306-315. <https://doi.org/10.1016/j.ejor.2009.07.024>
- **Scheibel 2018.** Willy Scheibel, Christopher Weyand, Jürgen Döllner. "EvoCells: a treemap layout algorithm for evolving tree data". IVAPP 2018, pages 273-280. <https://doi.org/10.5220/0006617102730280>
- **Schiermeyer 1994.** Ingo Schiermeyer. "Reverse-Fit: a 2-optimal algorithm for packing rectangles". ESA 1994, LNCS 855, pages 290-299. <https://doi.org/10.1007/BFb0049416>
- **Shneiderman 1992.** Ben Shneiderman. "Tree visualization with tree-maps: 2-d space-filling approach". ACM Transactions on Graphics 11(1):92-99. <https://doi.org/10.1145/102377.115768>
- **Shneiderman 2001.** Ben Shneiderman, Martin Wattenberg. "Ordered treemap layouts". IEEE InfoVis 2001. <https://doi.org/10.1109/INFVIS.2001.963283>
- **Simonis 2008.** Helmut Simonis, Barry O'Sullivan. "Search strategies for rectangle packing". CP 2008, LNCS 5202, pages 52-66. <https://doi.org/10.1007/978-3-540-85958-1_4>
- **Simonis 2011.** Helmut Simonis, Barry O'Sullivan. "Almost square packing". CPAIOR 2011, LNCS 6697. <https://doi.org/10.1007/978-3-642-21311-3_19>
- **Skiena 2008.** Steven S. Skiena. "The algorithm design manual", second edition, Springer, a book with a section on the linear partition problem. The section number is unverified. <https://doi.org/10.1007/978-1-84800-070-4>
- **Sleator 1980.** Daniel D. K. D. B. Sleator. "A 2.5 times optimal algorithm for packing in two dimensions". Information Processing Letters 10(1):37-40. <https://doi.org/10.1016/0020-0190(80)90121-0>
- **Soh 2010.** Takehide Soh, Katsumi Inoue, Naoyuki Tamura, Mutsunori Banbara, Hidetomo Nabeshima. "A SAT-based method for solving the two-dimensional strip packing problem". Fundamenta Informaticae 102(3-4):467-487. <https://doi.org/10.3233/FI-2010-314>
- **Sondag 2018.** Max Sondag, Bettina Speckmann, Kevin Verbeek. "Stable treemaps via local moves". IEEE TVCG 24(1):729-738. <https://doi.org/10.1109/TVCG.2017.2745140>
- **Steinberg 1997.** A. Steinberg. "A strip-packing algorithm with absolute performance bound 2". "SIAM Journal on Computing" 26(2):401-409. <https://doi.org/10.1137/S0097539793255801>
- **Tak 2013.** Susanne Tak, Andy Cockburn. "Enhanced spatial stability with Hilbert and Moore treemaps". IEEE TVCG 19(1):141-148. <https://doi.org/10.1109/TVCG.2012.108>
- **Treitz 2013.** Johannes Treitz. "The algorithm for a perfectly balanced photo gallery". A blog post. Unverified: the page is gone, and only other projects cite it.
- **Tu 2007.** Ying Tu, Han-Wei Shen. "Visualizing changes of hierarchical data using treemaps". IEEE TVCG 13(6):1286-1293. The DOI is unverified.
- **Vernier 2018.** Eduardo Faccin Vernier, João Luiz Dihl Comba, Alexandru C. Telea. "A stable greedy insertion treemap algorithm for software evolution visualization". SIBGRAPI 2018, pages 158-165. <https://webspace.science.uu.nl/~telea001/uploads/PAPERS/SIBGRAPI18/paper3.pdf>
- **Vernier 2020.** Eduardo Faccin Vernier, Max Sondag, João Luiz Dihl Comba, Bettina Speckmann, Alexandru Telea, Kevin Verbeek. "Quantitative comparison of time-dependent treemaps". Computer Graphics Forum 39(3):393-404. <https://doi.org/10.1111/cgf.13989>
- **Viégas 2009.** Fernanda B. Viégas, Martin Wattenberg, Jonathan Feinberg. "Participatory visualization with Wordle". IEEE TVCG 15(6):1137-1144. <https://doi.org/10.1109/TVCG.2009.171>
- **Wang 2006.** Weixin Wang and others. "Visualization of large hierarchical data by circle packing". CHI 2006, pages 517-520. The co-authors and the DOI are unverified.
- **Wattenberg 2005.** Martin Wattenberg. "A note on space-filling visualizations and space-filling curves". IEEE InfoVis 2005. The DOI is unverified.
- **Wei 2011.** Lijun Wei, Wee-Chong Oon, Wenbin Zhu, Andrew Lim. "A skyline heuristic for the 2D rectangular packing and strip packing problems". European Journal of Operational Research 215(2):337-346. <https://doi.org/10.1016/j.ejor.2011.06.022>
- **Wei 2016.** Lijun Wei, Hu Qin, Brenda Cheang, Xianhao Xu. "An efficient intelligent search algorithm for the two-dimensional rectangular strip packing problem". International Transactions in Operational Research 23(1-2):65-92. <https://doi.org/10.1111/itor.12138>
- **Wong 1986.** D. F. Wong, C. L. Liu. "A new algorithm for floorplan design". DAC 1986, pages 101-107. <https://doi.org/10.1145/318013.318030>
- **Wood 2008.** Jo Wood, Jason Dykes. "Spatially ordered treemaps". IEEE TVCG 14(6):1348-1355. <https://doi.org/10.1109/TVCG.2008.165>
- **Wu 2002.** Yu-Liang Wu, Wenqi Huang, Siu-chung Lau, C. K. Wong, Gilbert H. Young. "An effective quasi-human based heuristic for solving the rectangle packing problem". European Journal of Operational Research 141(2):341-358. <https://doi.org/10.1016/S0377-2217(02)00129-7>
- **Yang 2013.** Shuangyuan Yang, Shuihua Han, Weiguo Ye. "A simple randomized algorithm for two-dimensional strip packing". Computers and Operations Research 40(1):1-8. <https://doi.org/10.1016/j.cor.2012.05.001>

### Software and standards

- **Agafonkin, software.** `potpack`, by Mapbox. Its start width is the square root of the total area divided by 0.95, and not less than the widest box. <https://github.com/mapbox/potpack>
- **Barrett, software.** `stb_rect_pack.h`, a skyline bottom-left packer. <https://github.com/nothings/stb/blob/master/stb_rect_pack.h>
- **DeSandro, software.** Masonry, a library for grid layouts in columns. <https://masonry.desandro.com/>
- **Flickr, software.** `justified-layout`, a greedy packer of justified rows. <https://github.com/flickr/justified-layout>
- **react-grid-layout, software.** A grid of draggable boxes with vertical compaction. <https://github.com/react-grid-layout/react-grid-layout>
- **gridstack.js, software.** A grid of draggable boxes for dashboards. <https://github.com/gridstack/gridstack.js>
- **W3C flexbox.** "CSS Flexible Box Layout Module Level 1". <https://www.w3.org/TR/css-flexbox-1/>
- **W3C grid.** "CSS Grid Layout Module Level 1". <https://www.w3.org/TR/css-grid-1/>
- **W3C grid level 3 draft.** "CSS Grid Layout Module Level 3", a working draft of 2026. <https://www.w3.org/TR/css-grid-3/>
- **W3C multi-column.** "CSS Multi-column Layout Module Level 1". <https://www.w3.org/TR/css-multicol-1/>
