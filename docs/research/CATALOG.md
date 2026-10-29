# The catalog of packing methods

This catalog lists the published methods that put rectangles, polygons or circles into a container, and the new ideas of this project. It is roadmap item k6. The survey of k76 ([`SURVEY.md`](SURVEY.md)) added rows and families.

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
| Guarantee | The proved bound of the result against the best result `OPT`, and its source. `—` tells that we know no bound. |
| Status | `implemented` when the package has it today. Else `planned`. |
| Item | The roadmap item. "new item" means that the roadmap has no item for it yet. |

A source with the word "unverified" is a source that we did not find in a library or on the page of its publisher. Do not use an unverified source as a fact.

A guarantee is a bound that a source proves for its method. For a strip packer, it is a bound on the height at a fixed width. `h_max` is the height of the highest box. A guarantee holds only for a plain rectangle container with no obstacles. A guarantee with the word "unverified" is a bound that we did not check in its source.

The boxes of this project do not turn. A method from the literature with an option to turn a box by 90 degrees gets the option `rotate`, and the default is `false`.

## The families

| Family | Item | Methods |
|---|---|---|
| [Shelf and level](#shelf-and-level) | k21 | 17 |
| [Skyline](#skyline) | k22 | 8 |
| [Guillotine](#guillotine) | k23 | 39: 6 rules to choose times 6 rules to split, and a global form, with the option `merge`, and 2 rules for bins |
| [MaxRects and free spaces](#maxrects-and-free-spaces) | k24 | 10 |
| [Bottom-left, bottom-left fill and gap rules](#bottom-left-bottom-left-fill-and-gap-rules) | k25 | 18 |
| [Searches over orders and encodings](#searches-over-orders-and-encodings) | k26 | 27 |
| [Exact methods and constraint models](#exact-methods-and-constraint-models) | k10 | 24 |
| [Free width: the smallest enclosing rectangle](#free-width-the-smallest-enclosing-rectangle) | k33, k34 | 13 |
| [Approximation results](#approximation-results) | reference | 10 |
| [Lower bounds](#lower-bounds) | new item | 7 |
| [Treemaps](#treemaps) | k27 | 24 |
| [Masonry, columns and justified rows](#masonry-columns-and-justified-rows) | k28 | 13 |
| [Order and stability](#order-and-stability) | k29 | 9 |
| [Online and incremental packing](#online-and-incremental-packing) | k30 | 10 |
| [Graph layout: components, overlap removal and compaction](#graph-layout-components-overlap-removal-and-compaction) | new item | 13 |
| [Text and interface layout](#text-and-interface-layout) | k28, k29, new item | 8 |
| [Knapsack and identical boxes](#knapsack-and-identical-boxes) | new item | 3 |
| [Analytical placement and legalization](#analytical-placement-and-legalization) | new item | 4 |
| [Irregular shapes: nesting](#irregular-shapes-nesting) | k39, new item | 22 |
| [Circles](#circles) | k39, new item | 14 |
| [Learned and hybrid methods](#learned-and-hybrid-methods) | new item | 12 |
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

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `shelf-nf` | Next Fit, input order | Put each box in the order of the array at the right end of the current row. When it does not fit, start a new row. | Coffman 1980 | order, speed | `O(n)` | — | implemented: `packShelf` with `sortOrder: "input"` | k21 |
| `shelf-nfdh` | Next Fit Decreasing Height (NFDH) | Sort by height, decreasing. Then do `shelf-nf`. | Coffman 1980 | density, speed | `O(n log n)` | `2·OPT + h_max` (Coffman 1980) | implemented: `packShelf` with `sortOrder: "height-desc"`. `fit: "next"` (0.2.4) also stacks a box in the strip above a shorter box. | k21 |
| `shelf-ffdh` | First Fit Decreasing Height (FFDH) | Sort by height, decreasing. Put each box in the first row, from the top, where it fits. Else start a new row. | Coffman 1980 | density | `O(n log n)` with a tree of the free widths | `1.7·OPT + h_max` (Coffman 1980) | implemented (0.2.4): `packShelf` with `fit: "first"`, in `O(n * rows)`. A box also stacks in the strip above a shorter box. | k21 |
| `shelf-bfdh` | Best Fit Decreasing Height (BFDH) | Sort by height, decreasing. Put each box in the row with the smallest free width that is not less than the width of the box. | Berkey 1987 | density | `O(n log n)` | — | planned | k21 |
| `shelf-wfdh` | Worst Fit Decreasing Height | Put each box in the row with the largest free width. | Jylänki 2010 | density | `O(n log n)` | — | planned | k21 |
| `shelf-bhf` | Best Height Fit | Put each box in the row where the height of the row minus the height of the box is the smallest. | Jylänki 2010 | density | `O(n * rows)` | — | implemented (0.2.4): `packShelf` with `fit: "best"`. A box also stacks in the strip above a shorter box. | k21 |
| `shelf-baf` | Best Area Fit | Put each box in the row where the free area after the box is the smallest. | Jylänki 2010 | density | `O(n * rows)` | — | planned | k21 |
| `shelf-waf` | Worst Area Fit | Put each box in the row where the free area after the box is the largest. | Jylänki 2010 | density | `O(n * rows)` | — | planned | k21 |
| `shelf-waste-map` | Shelf with a waste map | Keep the space above each box in a row as free rectangles. Put a later box there first, with a guillotine rule. | Jylänki 2010 | density | `O(n * F)` | — | planned | k21 |
| `shelf-split-fit` | Split-Fit (SF) | Sort by width. Pack the boxes wider than half the width first, with `shelf-ffdh`. Pack the narrow boxes into the space at the side of those rows, then above. | Coffman 1980 | density, bound 1.5 | `O(n log n)` | `1.5·OPT + 2` with heights of 1 or less (Coffman 1980) | planned | k21 |
| `shelf-floor-ceiling` | Floor-Ceiling (FC) | Fill each row from the left on its floor. Then fill it from the right under its ceiling, under the highest box. | Lodi 1999 | density | `O(n^2)` | — | planned | k21 |
| `shelf-knapsack` | Knapsack shelf (KP) | The highest box left opens a row. A 0-1 knapsack picks the boxes that fill the width of the row with the largest area. | Lodi 1999 (the attribution of KP is unverified) | density | `O(n^2 W)` with dynamic programming | — | planned | k21 |
| `shelf-hff` | Hybrid First Fit (HFF) | Do `shelf-ffdh` in a strip. Then put the rows into bins with First Fit Decreasing on the row heights. | Chung 1982 | density in bins | `O(n log n)` | asymptotic `17/8·OPT` bins (Chung 1982, unverified) | planned | k21 |
| `shelf-sas` | Size Alternating Stack (SAS) | Split the boxes into narrow and wide boxes. Each row alternates a stack of narrow boxes and a wide box. | Ntene 2009 | density | `O(n log n)` | — | planned | k21 |
| `shelf-level-improved` | The improved level methods | Fill the space above the lower boxes of a closed row with the next boxes, in a stack. The rule is unverified. | Ortmann 2010 | density | `O(n^2)` | — | planned | k21 |
| `rows-gap-fill` | Rows with a recursive gap fill | Do `shelf-nfdh`. Pack later boxes recursively into the space under each lower box and at the right end of each row. | this repository | density | `O(n^2)` | — | implemented: `packRows` | k21 |
| `rows-input` | Rows in the input order | Do `rows-gap-fill` with no gap fill, thus the rows keep the input order. | this repository | order | `O(n)` | — | implemented: `packRows` with `sortOrder: "input"` | k21 |

Notes:

- NFDH uses at most `2 OPT + h_max` of height, and FFDH uses at most `1.7 OPT + h_max`. Coffman 1980 proves these bounds.
- The sort orders of `SORT_ORDERS` (`height-desc`, `height-asc`, `width-desc`, `area-desc` and `input`) apply to each shelf rule. A strategy name with an order is `shelf-ffdh` with the option `sortOrder`.
- Split-Fit sorts by width, not by height. Its bound of 1.5 needs boxes with a height of 1 or less.
- `shelf-knapsack` uses a knapsack for each row. The `new-shelf-lookahead` idea adds the order to it.

## Skyline

A skyline packer keeps only the top edge of the packed boxes: a list of segments from the left to the right. A box goes on the skyline. The space under a box that is above a lower segment is lost, but a waste map keeps it.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `skyline-bl` | Skyline bottom-left | Put each box in the lowest place on the skyline where it fits. Between two equal places, take the left place. | Jylänki 2010 | density, speed | `O(n W)` with unit cells, `O(n^2)` with segments | — | implemented: `packSkyline`, the default `rule: "bl"` | k22 |
| `skyline-min-waste` | Skyline minimum waste | Put each box in the place where the area under the box and above the skyline is the smallest. Between equal places, take the lower place. | Jylänki 2010 | density | `O(n^2)` | — | implemented: `skyline` with `rule: "mw"`, entry `skyline-mw` | k22 |
| `skyline-bl-waste-map` | Skyline bottom-left with a waste map | Do `skyline-bl`. Keep the space under each box as free rectangles, and fill them with a guillotine rule. | Jylänki 2010 | density | `O(n^2 + n F)` | — | implemented: `skyline` with `wasteMap: true`, entry `skyline-bl-waste` | k22 |
| `skyline-min-waste-map` | Skyline minimum waste with a waste map | Do `skyline-min-waste` with the waste map of `skyline-bl-waste-map`. | Jylänki 2010 | density | `O(n^2 + n F)` | — | implemented: `skyline` with `rule: "mw"` and `wasteMap: true`, entry `skyline-mw-waste` | k22 |
| `skyline-score` | Skyline with a fit score | For each segment and each box left, give a score from 0 to 4: the count of sides of the box that touch the wall or the neighbors exactly. Put the box with the best score. | Wei 2011 | density | `O(n^2)` for each box | — | planned | k22 |
| `skyline-stb` | Skyline of `stb_rect_pack` | `skyline-bl` and a best-fit option that takes the place with the smallest waste. | Barrett, software | speed | `O(n^2)` | — | planned | k22 |
| `skyline-multi-start` | Skyline with each sort order | Do `skyline-bl` with each order of `SORT_ORDERS`, and keep the best result. | Jylänki 2010 | density | five runs | — | planned | k22 |
| `skyline-best-fit-ls` | Improved skyline best fit with a local search | At the lowest segment, score each box left by how well it fits the segment and its neighbors. Put the best box. Improve the order with a random local search that has no parameters. | Wei 2017 | density | `O(n^2)` for each pass | — | planned | new item |

Notes:

- `packSkyline` keeps a height for each unit of the width. A version with segments is faster when the width is large.
- The skyline cannot go around a locked box from below. `packSkyline` puts the skyline at the bottom edge of a locked box, thus the space above it stays empty. `skyline-bl-waste-map` gets that space back.

## Guillotine

A guillotine packer keeps a list of free rectangles. Each free rectangle comes from one straight cut across a larger free rectangle. The packer puts a box in the corner of a free rectangle. Then it cuts the rest of that free rectangle into two new free rectangles.

Each guillotine strategy is a rule to choose and a rule to split. Its `id` is `guillotine-<choice>-<split>`, for example `guillotine-baf-sas`. All rules come from Jylänki 2010.

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
| `sas` | Shorter Leftover Axis Split | Cut along the axis with the shorter leftover. |
| `las` | Longer Leftover Axis Split | Cut along the axis with the longer leftover. |
| `sa` | Shorter Axis Split | Cut along the shorter side of the free rectangle. |
| `la` | Longer Axis Split | Cut along the longer side of the free rectangle. |
| `minas` | Min Area Split | Cut to make the two new areas as different as possible. |
| `maxas` | Max Area Split | Cut to make the two new areas as equal as possible. |

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `guillotine-<choice>-<split>` | Guillotine, 36 combinations | Choose a free rectangle with the choice rule. Put the box in its top-left corner (y grows down). Cut the rest with the split rule. | Jylänki 2010 | density | `O(n F)`, `F` is `O(n)` | — | implemented: `guillotine` with `choice` and `split`, entry `guillotine-baf-sas` | k23 |
| option `merge` | Rectangle merge | After each box, join two free rectangles with a common full edge into one. | Jylänki 2010 | density | `O(F^2)` for each box | — | implemented: `guillotine` with `merge: true`, entry `guillotine-bssf-sas-merge` | k23 |
| `guillotine-global` | Global choice | For each step, test each box left with each free rectangle, and put the best pair. | Jylänki 2010 | density | `O(n^2 F)` | — | planned | k23 |
| `guillotine-bin-oriented` | Constructive bin-oriented heuristic | Fill one bin at a time. Choose the boxes for the bin with the rule of average-area sufficiency. Pack them with guillotine cuts. | Charalambous 2011 | density in bins | `O(n^2)` for each bin | — | planned | new item |
| `guillotine-insertion` | Insertion heuristics with justification | Insert each box into the guillotine tree of a bin. Then move the boxes to one side (justify) and pack again to empty a bin. | Fleszar 2013 | density in bins | `O(n^2)` for each pass | — | planned | new item |

Notes:

- A guillotine layout is a tree of cuts. The layout of a strip packer with the rule `sas` (shorter leftover axis) and the rule `baf` is the best start in the tests of Jylänki 2010.
- The two-stage and three-stage guillotine layouts of the cutting literature are the exact form of the same model. The family [Exact methods and constraint models](#exact-methods-and-constraint-models) has them.

## MaxRects and free spaces

A MaxRects packer keeps all the maximal free rectangles. These rectangles can overlap. After a box goes in, each free rectangle that the box cuts gives up to four new free rectangles. Then the packer removes each free rectangle that is in another free rectangle.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `maxrects-bssf` | MaxRects Best Short Side Fit | Choose the free rectangle with the smallest leftover on the shorter side. | Jylänki 2010 | density | `O(n F)`, `F` up to `O(n^2)` | — | implemented (0.2.5): `packMaxRects` with `rule: "bssf"`, the default. | k24 |
| `maxrects-blsf` | MaxRects Best Long Side Fit | Choose the free rectangle with the smallest leftover on the longer side. | Jylänki 2010 | density | `O(n F)` | — | implemented (0.2.5): `packMaxRects` with `rule: "blsf"`. | k24 |
| `maxrects-baf` | MaxRects Best Area Fit | Choose the free rectangle with the smallest area that holds the box. | Jylänki 2010 | density | `O(n F)` | — | implemented (0.2.5): `packMaxRects` with `rule: "baf"`. | k24 |
| `maxrects-bl` | MaxRects Bottom-Left | Choose the place with the lowest top edge of the box. Between equal places, take the left place. | Jylänki 2010 | density, order | `O(n F)` | — | implemented (0.2.5): `packMaxRects` with `rule: "bl"`. | k24 |
| `maxrects-cp` | MaxRects Contact Point | Choose the place where the box touches the most length of the walls and of the other boxes. | Jylänki 2010 | density | `O(n^2 F)` | — | implemented (0.2.5): `packMaxRects` with `rule: "cp"`. The contact uses maps of the edges. | k24 |
| `maxrects-<rule>-global` | Global MaxRects | For each step, test each box left with each free rectangle and each rule, and put the best pair. | Jylänki 2010 | density | `O(n^2 F)` | — | planned | k24 |
| `maxrects-locked` | MaxRects around locked boxes | Start with the free rectangles that the locked boxes leave. Then do any MaxRects rule. | this repository | density with obstacles | `O(n F)` | — | implemented (0.2.5): each rule of `packMaxRects` starts from the free space less the locked boxes. | k24, k42 |
| `free-space-maximal` | Maximal free spaces with pretreatment | Keep the maximal free spaces. First remove the boxes that fit nowhere else, and join the boxes that fill a full width. | El Hayek 2008 | density | `O(n F)` | — | planned | k24 |
| `extreme-points` | Extreme points | Keep only the points where a box can touch two edges: the projections of the corners of each box. Put each box on the best point. | Crainic 2008 | density, speed | `O(n^2)` | — | planned | k24 |
| `potpack` | Free list of `potpack` | Sort by height. Keep a list of free spaces. Put each box at the top left of the first space where it fits. Split the rest to the right and below. | Agafonkin, software | speed | `O(n F)` | — | planned | k24 |

Notes:

- Crainic 2008 gives extreme points in three dimensions. This catalog uses the two-dimensional case.
- `potpack` also sets its own width. The [free-width family](#free-width-the-smallest-enclosing-rectangle) has that rule.

## Bottom-left, bottom-left fill and gap rules

These methods put each box in a corner of the boxes before it. Bottom-left moves a box down and left until it stops. Bottom-left fill can also put a box in a hole. The gap rules choose the box for a gap, not the gap for a box.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `bl-baker` | Bottom-Left (BL) | Start each box at the top right. Move it down as far as it goes, then left as far as it goes. Do it again until it stops. Sort by width, decreasing. | Baker 1980 | density | `O(n^2)` | `3·OPT` with the decreasing width order (Baker 1980) | planned | k25 |
| `bl-chazelle` | Bottom-left, fast form | Put each box in the lowest and then leftmost place where it fits, with a list of the free places. | Chazelle 1983 | density | `O(n^2)` | — | planned | k25 |
| `blf-hopper` | Bottom-Left Fill (BLF) | Put each box in the lowest, then leftmost place where it fits, holes included. | Hopper 2001 | density | `O(n^3)` | — | planned | k25 |
| `bl-jakobs` | Bottom-left of Jakobs | Start each box at the top right. Move it down to the lowest place, then left to the leftmost place. Do not move it again. | Jakobs 1996 | speed | `O(n^2)` | — | planned | k25 |
| `bl-liu-teng` | Improved bottom-left | Move each box down as far as it goes. Move it left only when it cannot move down. | Liu 1999 | density | `O(n^2)` | — | planned | k25 |
| `best-fit-bkw` | Best fit, lowest gap | Find the lowest gap on the skyline. Put in it the box left that fills the most of its width. If no box fits, raise the gap to its lower neighbor. | Burke 2004 | density | `O(n^2)` | — | planned | k25 |
| `best-fit-fast` | Best fit, fast form | Do `best-fit-bkw` with balanced trees. | Imahori 2010 | speed | `O(n log n)` | — | planned | k25 |
| `lowest-gap-fill` | Lowest Gap Fill (LGF) | Fill the lowest gap with the box that gives the best score of fit, then the next lowest gap. | unverified: we found no source with this name | density | `O(n^2)` | — | planned | k25 |
| `touching-perimeter` | Touching Perimeter (TP) | Put each box in the corner place where the part of its edge that touches walls and boxes is the largest. | Lodi 1999 | density | `O(n^3)` | — | planned | k25 |
| `corner-degree` | Corner-occupying action with a degree | Put each box only in a corner of two edges. Choose the corner with the highest degree, a measure of how close the box is to the other boxes. | Wu 2002 | density | `O(n^4)` | — | planned | k25 |
| `caving-degree` | Caving degree | Do `corner-degree` with the caving degree: the box that fits closest into a corner wins. | Huang 2007 | density | `O(n^4)` | — | planned | k25 |
| `two-level-search` | Two-level search | Do `caving-degree`, and look ahead one step to choose between the best few corners. | Chen 2007 | density | `O(n^5)` | — | planned | k25 |
| `best-fit-bidirectional` | Bidirectional best fit (BBF) | Do `best-fit-bkw` on the lowest horizontal gap and on the vertical gaps too. Put the box and the gap with the best fit. | Aşık 2009 | density | `O(n^2)` | — | planned | new item |
| `best-fit-compound` | BBF with compound placement | Do `best-fit-bidirectional`, and also test pairs of boxes that fill a gap together. | Özcan 2013 | density | `O(n^3)` | — | planned | new item |
| `best-fit-three-way` | Three-way best fit | Do `best-fit-bkw` with more orders of the boxes and more rules for the place in the gap. Keep the best result. A form in `O(n log n)` exists. | Verstichel 2013 | density | `O(n log n)` | — | planned | new item |
| `least-waste-first` | Least wasted first (LWF) | For each corner place and each box left, measure the waste that the box makes. Put the pair with the least waste. Improve the order with a random local search. | Wei 2009 | density, overflow | `O(n^3)` for each pass | — | planned | new item |
| `heuristic-recursive` | Heuristic recursive (HR) | Put a box at the bottom left of a free rectangle. Cut the rest into an upper part and a right part, and fill each part recursively. | Zhang 2006 | density | `O(n^3)` | — | planned | new item |
| `bottom-left-right` | Bottom-Left-Right (BLR) | A bottom-left rule that can also put a box against the right side. The rule in detail is unverified. | Belov 2008 | density | `O(n^2)` | — | planned | new item |

Notes:

- `bl-baker` with a decreasing width order uses at most three times the best height. Baker 1980 proves this bound.
- The gap rules (`best-fit-bkw`, `lowest-gap-fill`) do not use a fixed order of the boxes. Thus they make many inversions of the rank.

## Searches over orders and encodings

A search changes the input of a fast packer, the "decoder", and keeps the best result. The input is an order of the boxes, or an encoding of the relative places of the boxes. Each search takes a seed, thus two runs with the same seed give the same result.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `search-ga-order` | Genetic algorithm over orders | Keep a population of orders. Cross two orders and change some places. Decode each order with `bl-jakobs` or `blf-hopper`. | Jakobs 1996, Hopper 2001 | density | generations x population x decoder | — | planned | k26 |
| `search-ga-layers` | Genetic algorithm over layers | Encode a layout as layers of boxes. Cross and change the layers. | Bortfeldt 2006 | density | generations x population | — | planned | k26 |
| `search-sa-order` | Simulated annealing over orders | Swap two boxes in the order. Keep a worse order with a probability that falls with the temperature. | Hopper 2001, Kirkpatrick 1983 | density | steps x decoder | — | planned | k26 |
| `search-sa-best-fit` | Annealing with best fit | Place the first boxes with an order that annealing finds. Place the rest with `best-fit-bkw`. | Burke 2009 | density | steps x decoder | — | planned | k26 |
| `search-tabu` | Tabu search | Move a box from the worst bin or level to another place. Forbid the reverse move for some steps. | Lodi 1999, Iori 2003 | density | steps x decoder | — | planned | k26 |
| `search-naive-evolution` | Naive evolution | Change the order at random and keep the better order. | Hopper 2001 | density | steps x decoder | — | planned | k26 |
| `search-grasp` | Reactive GRASP | Build an order with a random greedy rule. Improve it with a local search. Learn the best amount of randomness from the results. | Alvarez-Valdes 2008 | density | starts x decoder | — | planned | k26 |
| `search-ils` | Local search in three stages | Build an order with a greedy rule. Improve it with a local search that has no randomness. Then do a local search with random changes. | Wei 2016 | density | steps x decoder | — | planned | k26 |
| `search-beam` | Filtered beam search | Keep the best `k` partial layouts. Grow each with each box left, remove the weak children with a fast filter, and keep the best `k` again. | Chen 2025 | density | `O(n^2 k)` x decoder | — | planned | k26 |
| `search-random-restart` | Randomized search | Do a greedy packer with random changes of the order, many times. Keep the best result. | Yang 2013 | density | restarts x decoder | — | implemented | k78 |
| `search-two-stage` | Two-stage intelligent search | Do a greedy search with a fit score. Then improve the order with annealing. | Leung 2011 | density | steps x decoder | — | planned | k26 |
| `enc-sequence-pair` | Sequence pair | Encode the layout as two orders of the boxes. The two orders give each pair "left of" or "below". A longest path gives the places. | Murata 1996 | density | `O(n^2)` for each decode | — | planned | k26 |
| `enc-sequence-pair-cost` | Sequence pair with general costs | Do a local search over sequence pairs with a cost for each box and place. | Imahori 2003 | density, other costs | `O(n log n)` for each decode | — | planned | k26 |
| `enc-bsg` | Bounded slicing grid (BSG) | Put each box in a cell of a grid of crossing walls. The grid gives the relative places. | Nakatake 1996 | density | `O(n^2)` for each decode | — | planned | k26 |
| `enc-slicing-tree` | Slicing tree, Polish expression | Encode the layout as a tree of horizontal and vertical cuts in postfix form. Anneal over the expression. | Wong 1986 | density, aspect | `O(n)` for each decode | — | planned | k26 |
| `enc-o-tree` | O-tree | Encode the layout as an ordered tree. A walk of the tree puts each box against its parent. | Guo 1999 | density | `O(n)` for each decode | — | planned | k26 |
| `enc-b-star-tree` | B*-tree | Encode the layout as a binary tree. A left child is to the right of its parent, a right child is above its parent. | Chang 2000 | density | `O(n)` with a contour | — | planned | k26 |
| `enc-corner-block-list` | Corner block list (CBL) | Encode the layout by the order in which the box in the top-right corner goes away. | Hong 2000 | density | `O(n)` for each decode | — | planned | k26 |
| `enc-tcg` | Transitive closure graph (TCG) | Encode the layout as two graphs, "left of" and "below". | Lin 2001 | density | `O(n^2)` for each decode | — | planned | k26 |
| `search-svc` | Sequential value correction, SVC(SubKP) | Build each layout from the bottom with a one-dimensional knapsack of the widths and a price for each box. After each layout, raise the price of the boxes that made waste. | Belov 2008 | density | iterations x `O(n W)` | — | planned | new item |
| `search-binary-height` | Binary search on the height | Fix a height. Test with fast decoders (least waste first, minimal inflexion first) and a random local search over orders if all boxes fit. Halve the interval of heights. | Zhang 2013 | density | `O(log H)` x steps x decoder | — | planned | new item |
| `search-sa-layout` | Annealing on layouts | Anneal over complete layouts, not only over orders. A second form anneals over the input of a constructive heuristic. | Rakotonirainy 2020 | density | steps x decoder | — | planned | new item |
| `search-beam-parallel` | Parallel beam search (BSPA) | Do a beam search over partial layouts on many threads at once. The authors give the code and the data. | Wen 2025 | density, speed | `O(n^2 k)` on `t` threads | — | planned | new item |
| `search-goal-driven` | Goal-driven search for bins | Split the search space of the bins into ordered sets, and search them in order toward a goal of total area. The rule in detail is unverified. | Wei 2013 | density in bins | steps x decoder | — | planned | new item |
| `search-grasp-vnd` | GRASP with variable neighborhood descent | Build each bin with a maximal-space rule and random choices. Improve the bins with several moves in a variable neighborhood descent. | Parreño 2010 | density in bins | starts x moves | — | planned | new item |
| `search-ruin-recreate` | Goal-driven ruin and recreate | Remove a part of the layout and pack it again. A goal cost decides which layouts the search keeps. | Gardeyn 2022 | density in bins | steps x decoder | — | implemented: `ruin-recreate`, entries `ruin-recreate-maxrects-bl-k64` and `ruin-recreate-skyline-k64` | k79 |
| `search-set-cover` | Set covering of good bins | Make many single bins with fast heuristics. Choose the fewest bins that hold each box, with a Lagrangian heuristic for set covering. | Monaci 2006 | density in bins | columns x Lagrangian steps | — | planned | new item |

Notes:

- The floorplan encodings (`enc-*`) come from the layout of chips. They can also make each box touch its neighbors, and they can keep a cost of wire length. The joint stage of `highways` can use that cost.
- A search with a time limit is not deterministic across machines. Thus each search has a limit on steps, not on time.

## Exact methods and constraint models

An exact method finds the best layout or proves that no layout fits. Its time grows very fast with the count of boxes. The benchmark uses it on small inputs, to get the best value for the "distance to best".

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `exact-bb-bins` | Branch and bound for bins | Put the boxes into bins one at a time, in the corner places. Cut a branch when a lower bound is not less than the best count of bins. | Martello 1998 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-bb-strip` | Branch and bound for a strip | Search the height of the strip from a lower bound up. For each height, do a branch and bound on the corner places. | Martello 2003 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-bb-strip-avpt` | Branch and bound with better bounds | Do `exact-bb-strip` with new lower bounds and rules that remove equal layouts. | Alvarez-Valdes 2009 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-strip-boschetti` | Exact strip with a relaxation | Solve a relaxation first, then search the places of the boxes. | Boschetti 2010 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-strip-kenmochi` | Exact strip with a staircase | Branch on the places of a staircase of boxes. | Kenmochi 2009 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-benders` | Combinatorial Benders cuts | A master problem cuts the boxes into vertical slices. A check of the order of the slices adds cuts. | Côté 2014 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-benders-logic` | Logic-based Benders | Do `exact-benders` with a logic check. | Delorme 2017 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-opp-graphs` | Packing classes | Search the interval graphs of the two axes, not the places. | Fekete 2004 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-opp-clautiaux` | Two-step orthogonal packing | Branch on the places on the x axis first, then check the y axis. | Clautiaux 2007 | density | exponential | exact: `OPT` | planned | k10 |
| `exact-tree-beasley` | Tree search on grid points | Search over the places on a grid of the possible coordinates. | Beasley 1985a | density | exponential | exact: `OPT` | planned | k10 |
| `milp-relative` | Mixed integer program with relative places | For each pair of boxes, a set of binary variables chooses left, right, above or below. "Big M" rules keep the pair apart. | Chen 1995 | density | exponential | exact: `OPT` | planned | k10 |
| `cp-diffn` | Constraint model with `diffn` and `cumulative` | The global constraint `diffn` keeps the boxes apart. A `cumulative` on each axis cuts the search. | Beldiceanu 1994 | density | exponential | exact: `OPT` | planned | k10 |
| `cp-sweep` | Sweep for non-overlap | Do `cp-diffn` with a sweep over each axis that removes the places that cannot be correct. | Beldiceanu 2001 | density | exponential | exact: `OPT` | planned | k10 |
| `cp-search-strategies` | Search strategies for packing | Do `cp-diffn`, choose all the x places first, then the y places, with interval splits. | Simonis 2008 | density | exponential | exact: `OPT` | planned | k10 |
| `sat-order` | SAT with the order encoding | Encode each coordinate with Boolean variables "x is at most c". Encode each pair with four variables of relative place. Search the height with the solver. | Soh 2010 | density | exponential | exact: `OPT` | planned | k10 |
| `dp-guillotine` | Dynamic programming for guillotine cuts | For each size `(w, h)` on a grid, the best value is the best of each box that fits and of each cut into two parts. | Gilmore 1965, Christofides 1977, Beasley 1985b | density | `O(W H (W + H))` | exact: `OPT` of the guillotine layouts | planned | k10 |
| `exact-branch-price` | Branch and price with a constraint subproblem | A master linear program chooses bins (Dantzig-Wolfe). A constraint program tests if a set of boxes fits in one bin. | Pisinger 2007 | density in bins | exponential | exact: `OPT` | planned | new item |
| `exact-benders-bins` | Combinatorial Benders for bins | A master problem puts the areas of the boxes into bins. A check of each bin adds a no-good cut when its boxes do not fit. | Côté 2021 | density in bins | exponential | exact: `OPT` | planned | new item |
| `exact-canonical-strip` | Staircase branch and bound with canonical forms | Branch on staircase places of the boxes. Remove equal layouts with canonical forms, and cut with lower bounds. | Arahori 2012 | density | exponential | exact: `OPT` | planned | new item |
| `exact-positions-covering` | Positions and covering | List each valid position of each box on the grid. A set covering model chooses one position for each box, with each cell covered at most once. | Cid-Garcia 2020, Cid-Garcia 2021 | density | pseudo-polynomial model, exponential solve | exact: `OPT` on the grid | planned | new item |
| `exact-arc-flow` | Arc flow for two-stage guillotine cuts | A flow in a graph of the widths models the strips and their cuts. An integer program solves the flow. | Macedo 2010 | density | pseudo-polynomial model, exponential solve | exact: `OPT` of the two-stage layouts | planned | new item |
| `exact-2staged-ilp` | Integer models for two-stage knapsack | Two integer models of the levels and of the boxes in each level, with cuts that remove equal layouts. | Lodi 2003 | overflow | exponential | exact: `OPT` of the two-stage layouts | planned | new item |
| `exact-knapsack-relax` | Knapsack with a one-dimensional relaxation | Solve a one-dimensional knapsack with the areas as weights. Then test if the chosen boxes fit, and branch when they do not. | Caprara 2004 | overflow | exponential | exact: `OPT` | planned | new item |
| `cp-sat-no-overlap-2d` | CP-SAT with `NoOverlap2D` | Model each box as an interval on each axis. The constraint `NoOverlap2D` of CP-SAT keeps the boxes apart. The solver searches the height. | OR-Tools, software | density | exponential | exact: `OPT` | planned | new item |

Notes:

- The three-dimensional branch and bound of Martello 2000 uses corner places. The exact strip method of Martello 2003 uses the same idea. The brief of k6 named a "Martello, Pisinger and Vigo" strip method. We found only the three-dimensional paper by these authors, and the strip method by Martello, Monaci and Vigo.
- `dp-guillotine` is exact only for guillotine layouts. It gives a lower bound on the waste of other layouts only with a relaxation.
- A solver for `cp-diffn` or `milp-relative` is a new dependency. The item k10 decides which solver to use.

## Free width: the smallest enclosing rectangle

Most inputs of this project have no fixed width (`container.fixed` is `none`). Then the packer chooses the width. The problem of the smallest enclosing rectangle asks for the rectangle of the smallest area that holds all the boxes. A variant asks for a target aspect.

The general method is a search over widths: pack at each width, and keep the width with the best value. The value is the area, the aspect error or a mix. The exact methods of Korf and of Huang test the candidate rectangles in order of area.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `width-sqrt-area` | Width from the square root of the area | Set the width to 1.5 times the square root of the total area, and not less than the widest box. Then pack. | this repository | speed, aspect | one pack | — | implemented: `pack` | k33 |
| `width-potpack` | Width of `potpack` | Set the width to the square root of the total area divided by 0.95, and not less than the widest box. Then pack with `potpack`. | Agafonkin, software | speed, aspect | one pack | — | planned | k33 |
| `width-sweep` | Sweep over widths | Pack at widths on a log scale, from the widest box to the width of one row. Then try the widths between the neighbors of the best width. Keep the lowest area times `1 + weight * aspectError`. | this repository, after Korf 2003 | area, aspect | samples x pack | — | implemented: `packFree` | k33 |
| `width-breakpoints` | Sweep over breakpoints | Take as candidates only the widths where a row break of the packer changes: the sums of the widths of neighbor boxes. | Korf 2004 | area | candidates x pack | — | planned | k33 |
| `width-aspect-bisect` | Bisection to a target aspect | The aspect of a strip pack grows with the width. Halve the interval of widths until the aspect is near the target. | this repository | aspect | `O(log W)` x pack | — | planned | k33 |
| `exact-korf-2003` | Optimal rectangle packing | Test each candidate enclosing rectangle in order of area, with a branch and bound that fills the empty space. Stop at the first that holds all the boxes. The order of the search is unverified. | Korf 2003 | area | exponential | exact: `OPT` | planned | k33 |
| `exact-korf-2004` | Optimal rectangle packing, new results | Do `exact-korf-2003` with better cuts of the search. | Korf 2004 | area | exponential | exact: `OPT` | planned | k33 |
| `exact-meta-csp` | Meta-CSP | Do the search over the relative places of each pair, not over the coordinates. | Moffitt 2006 (unverified), Korf 2010 | area | exponential | exact: `OPT` | planned | k33 |
| `exact-huang-korf` | Absolute placement | Choose all the x coordinates first, then the y coordinates. Add empty boxes to make a perfect packing. Use only the sums of widths as coordinates. | Huang 2009, Huang 2013 | area | exponential | exact: `OPT` | planned | k33 |
| `exact-huang-korf-precision` | High-precision rectangles | Do the search over relative places when the sizes are not small integers. | Huang 2011 | area | exponential | exact: `OPT` | planned | k33 |
| `cp-min-area` | Constraint model for the enclosing rectangle | Do `cp-search-strategies` for each candidate rectangle in order of area. | Simonis 2008, Simonis 2011 | area | exponential | exact: `OPT` | planned | k33 |
| `rpamp-reduction` | Reduction to strip and knapsack problems | Reduce the area problem to strip packing with candidate widths, and to knapsack problems. | Bortfeldt 2013 | area | candidates x strip heuristic | — | planned | k33 |
| `width-dynamic-reduction` | Dynamic reduction | Change the area problem into a series of fixed containers. Choose each next container from the result of the last one. Pack each with the rule "least injury first". | He 2015 | area | containers x pack | — | planned | new item |

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
| `lb-reduction` | Reduction procedures and bounds | Remove or join the boxes that no other box can go next to. Then apply dual feasible functions to the rest. | Carlier 2007 | `O(n^2)` | new item |
| `lb-free-width` | Bound for the free width | The largest of the total area, the area of the tallest box times the widest box, and the bound of Korf 2003 on the wasted space. That bound is unverified. | Korf 2003 | `O(n log n)` | k33 |

Notes:

- With gaps, add the gap to the size of each box and to the width of the container. Then each bound stays correct.
- The "distance to best" of a strategy is its height divided by the best lower bound, minus 1. Exact methods on small inputs show how tight each bound is.

## Treemaps

A treemap cuts a rectangle into cells. The area of each cell is the weight of its item. A box of this project has a fixed size, thus the weight is `w * h`, and the box goes to the center of its cell. The section [The measures and the families](#the-measures-and-the-families) tells how to measure it.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `treemap-slice-dice` | Slice and dice | Cut the rectangle into strips in the input order. Each level of the tree turns the direction of the cut. | Johnson 1991, Shneiderman 1992 | order, speed | `O(n)` | — | planned | k27 |
| `treemap-squarified` | Squarified | Sort by weight. Add items to a row along the shorter side while the worst aspect in the row gets better. Then start a new row. | Bruls 2000 | aspect | `O(n log n)` | — | planned | k27 |
| `treemap-strip` | Strip | Do `treemap-squarified` in the input order, always in horizontal strips. | Bederson 2002 | order, aspect | `O(n^2)` | — | planned | k27 |
| `treemap-pivot-middle` | Pivot by middle | Take the item in the middle of the order as pivot. Put the items before it in one region, and divide the items after it into two regions near the pivot. Recurse. | Shneiderman 2001 | order | `O(n log n)` | — | planned | k27 |
| `treemap-pivot-size` | Pivot by size | Do `treemap-pivot-middle` with the largest item as pivot. | Shneiderman 2001 | order, aspect | `O(n log n)` | — | planned | k27 |
| `treemap-pivot-split` | Pivot by split size | Do `treemap-pivot-middle` with the pivot that splits the weight most equally. | Bederson 2002 | order, aspect | `O(n log n)` | — | planned | k27 |
| `treemap-split` | Split | Split the ordered list into two parts of near equal weight. Cut the rectangle along its longer side. Recurse. | Engdahl 2005 (unverified) | order, aspect | `O(n log n)` | — | planned | k27 |
| `treemap-spiral` | Spiral | Lay the strips of `treemap-strip` along a spiral from the outside in. | Tu 2007 | order, stability | `O(n^2)` | — | planned | k27 |
| `treemap-hilbert` | Hilbert | Put the items in order along a Hilbert curve, with cells that follow the curve. | Tak 2013 | order, stability | `O(n log n)` | — | planned | k27 |
| `treemap-moore` | Moore | Do `treemap-hilbert` with a Moore curve, a closed form of the curve. | Tak 2013 | order, stability | `O(n log n)` | — | planned | k27 |
| `treemap-jigsaw` | Jigsaw map | Put the items in order along a space-filling curve on a grid of unit cells. | Wattenberg 2005 | order, stability | `O(n)` | — | planned | k27 |
| `treemap-quantum` | Quantum | Do an ordered treemap with cells that are whole multiples of a unit size, for grids of pictures. | Bederson 2002 | order, aspect | `O(n log n)` | — | planned | k27 |
| `treemap-voronoi` | Voronoi | Move weighted sites until the area of each Voronoi cell is its weight. The cells are polygons. | Balzer 2005 | aspect | iterations x `O(n log n)` | — | planned | k27 |
| `treemap-voronoi-fast` | Fast Voronoi | Do `treemap-voronoi` with power diagrams and no raster. | Nocaj 2012 | aspect, speed | iterations x `O(n log n)` | — | planned | k27 |
| `circle-pack-front-chain` | Circle packing | Put each circle against the front chain of the circles before it. | Wang 2006 | aspect | `O(n^2)` | — | planned | k27 |
| `treemap-spatial` | Spatially ordered | Put each item near a given point, with a split that keeps the order of the two axes. | Wood 2008 | order | `O(n log n)` | — | planned | k27 |
| `treemap-nmap` | Nmap | Split the items by their given points, and keep the neighbors near. | Duarte 2014 | order, neighbors | `O(n log n)` | — | planned | k27 |
| `treemap-bounded-aspect` | Bounded aspect | Use convex cells with an aspect of `O(depth)`, or orthoconvex cells with a constant aspect. | de Berg 2011 | aspect | `O(n log n)` | cell aspect `O(depth)` (de Berg 2011) | planned | k27 |
| `treemap-local-moves` | Stable by local moves | After a change, do the local move of the layout that gives the best mix of aspect and stability. | Sondag 2018 | stability, aspect | moves x `O(n)` | — | planned | k27 |
| `treemap-git` | Greedy insertion treemap | Keep the old layout. Remove the old items, and add each new item into the cell that changes the least. | Vernier 2018 | stability | `O(n log n)` | — | planned | k27 |
| `treemap-evocells` | EvoCells | Map the changes of the tree onto the old layout. Grow and shrink the cells in place. | Scheibel 2018 | stability | `O(n log n)` | — | planned | k27 |
| `treemap-sizepairs` | SizePairs | Pair the items by their change of size and by their size. Choose the direction of each split and the flips for stability and aspect. | Han 2022 | stability, aspect | `O(n log n)` | — | planned | k27 |
| `treemap-voronoi-stable` | Stable Voronoi | Start the sites of a new Voronoi treemap at the sites of the old one. | Hahn 2014 | stability | iterations x `O(n log n)` | — | planned | k27 |
| `treemap-shelf-hybrid` | Treemap rows with boxes | refer to `new-treemap-shelf` | this repository | aspect, density | `O(n log n)` | — | planned | k31 |

Notes:

- Shneiderman 2001 measures the stability as the mean change of distance of the corners of the cells. Bederson 2002 adds a measure of how easy the order is to read. Tu 2007 adds a measure of continuity.
- Vernier 2020 compares many time-dependent treemaps on the same data. It measures the change with corner travel and relative position change, and it removes the change that the data needs. These measures go into [Measures to add](#measures-to-add).
- The cells of the Voronoi and bounded-aspect treemaps are polygons. A box in such a cell needs the largest rectangle in the polygon.

## Masonry, columns and justified rows

These are the layouts of pages with many cards or pictures. A masonry layout keeps columns of the same width. A justified layout keeps rows of the same width and scales the pictures of each row.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `masonry-shortest` | Shortest column | Put each box, in the input order, at the bottom of the shortest column. | DeSandro, software (the rule is unverified), Graham 1969 | order, speed | `O(n log c)` for `c` columns | `(2 - 1/c)·OPT` for the highest column (Graham 1969, unverified) | planned | k28 |
| `masonry-lpt` | Longest processing time first | Sort by height, decreasing. Then do `masonry-shortest`. | Graham 1969 | density | `O(n log n)` | `(4/3 - 1/(3c))·OPT` for the highest column (Graham 1969) | planned | k28 |
| `masonry-differencing` | Balanced columns by differencing | Balance the column heights with the differencing method of Karmarkar and Karp. | Karmarkar 1982 (the report number is unverified) | density | `O(n log n)` | — | planned | k28 |
| `columns-linear-partition` | Ordered columns | Cut the input order into `c` parts of near equal height with dynamic programming. Each part is a column. | Skiena 2008, Treitz 2013 (unverified) | order, density | `O(n^2 c)` | the best cuts for its cost (Skiena 2008) | planned | k28 |
| `columns-css-balance` | CSS multi-column balance | Fill the columns in order and balance their heights, as `column-fill: balance` does. | W3C multi-column | order | `O(n log n)` | — | planned | k28 |
| `masonry-multi-span` | Masonry with wide items | An item spans `k` columns. Put it at the place where the highest of its `k` columns is the lowest. | DeSandro, software (the rule is unverified) | density | `O(n c)` | — | planned | k28 |
| `css-grid-sparse` | CSS grid flow | Put each item in the next free area of the grid, in order. Do not go back. | W3C grid | order | `O(n c)` | — | planned | k28 |
| `css-grid-dense` | CSS grid dense flow | Put each item in the first free area of the grid from the start, as `grid-auto-flow: dense` does. | W3C grid | density | `O(n^2 c)` | — | planned | k28 |
| `css-grid-lanes` | CSS grid lanes | Do `masonry-shortest` in a grid, with `display: grid-lanes` of the 2026 draft. The earlier drafts called it `masonry`. | W3C grid level 3 draft | order | `O(n log c)` | — | planned | k28 |
| `justified-greedy` | Justified rows, greedy | Add pictures to a row at a target height. When a picture makes the row too wide, keep it only if the row gets nearer to the target. Scale the row to the width. | Flickr, software | order, raggedness | `O(n)` | — | planned | k28 |
| `justified-linear-partition` | Justified rows, linear partition | Cut the order into `k` rows of near equal width with dynamic programming. | Treitz 2013 (unverified), Skiena 2008 | order, raggedness | `O(n^2 k)` | the best cuts for its cost (Skiena 2008) | planned | k28 |
| `justified-line-break` | Justified rows, line breaking | Choose all the row breaks at once with the method of Knuth and Plass. The cost of a row is the change of its scale from the target. | Knuth 1981, Harasymiv 2016 (unverified) | order, raggedness | `O(n w)` for `w` items in a row | the best breaks for its cost (Knuth 1981) | planned | k28 |
| `grid-template-layout` | Adaptive grid layout | Choose a template of grid cells for each page with a search over a cost. Fit the items to the cells. | Jacobs 2003 | aspect | template count x `n` | — | planned | k28 |

Notes:

- A box of this project does not scale. Thus `justified-*` gives the row breaks, and the boxes keep their size. Then the result has raggedness, and `pack.raggedness` measures it.
- `masonry-shortest` is the list scheduling of Graham 1969 on parallel machines. `masonry-lpt` uses at most `4/3` of the best height of the highest column.

## Order and stability

These methods keep the reading order of the input, or keep the layout when the input changes. The measures are `pack.order.*` and `pack.stability.*`.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `order-shelf-input` | Shelf in the input order | `shelf-nf` around locked boxes. | this repository | order | `O(n)` | — | implemented: `packShelf` with `sortOrder: "input"` | k29 |
| `order-ordered-treemaps` | Ordered treemaps | `treemap-pivot-*`, `treemap-strip`, `treemap-split`, `treemap-spiral` and the curves keep the order. | Shneiderman 2001, Bederson 2002 | order | refer to [Treemaps](#treemaps) | — | planned | k29 |
| `order-orthogonal` | Keep the orthogonal order | Move the boxes, but keep each pair "left of" or "above" as it was. | Misue 1995, Hayashi 1998 | stability | `O(n log n)` | — | planned | k29 |
| `order-mental-map` | Keep the mental map | Keep the orthogonal order, the near neighbors and the topology of a layout when it changes. | Misue 1995, Eades 1991 | stability | depends on the method | — | planned | k29 |
| `stable-pin-unchanged` | Pin the boxes that do not change | Lock each box that did not change. Pack only the new or changed boxes around them. | Vernier 2018 | stability | one pack | — | planned | k29 |
| `stable-local-moves` | Local moves | `treemap-local-moves` for packers: search the moves of a layout for the best mix of a measure and the movement. | Sondag 2018 | stability | moves x measure | — | planned | k29 |
| `stable-voronoi` | Old sites as the start | `treemap-voronoi-stable`. | Hahn 2014 | stability | refer to [Treemaps](#treemaps) | — | planned | k29 |
| `stable-animated` | Animated change | Move each box from the old place to the new place in steps. This changes no measure, but it helps a person follow the change. | Heer 2007 | perceived stability | `O(n)` for each frame | — | planned | k29 |
| `order-spatial` | Near the given place | `treemap-spatial` and `treemap-nmap` for boxes with a given place. | Wood 2008, Duarte 2014 | order | `O(n log n)` | — | planned | k29 |

Notes:

- A sort by height breaks the reading order. The input order keeps it. The idea `new-rank-window` gives the steps between the two.
- A stable method needs the run on the base input. The variants of the corpus (`base`, `change`) give it.

## Online and incremental packing

An online packer puts each box when it comes, and does not move it later. An incremental packer changes a layout after a change of the input.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `online-nfs-r` | Next Fit Shelf with parameter `r` | Round each height up to a power of `r`. Keep one open shelf for each class of height. | Baker 1983 | density, online | `O(n)` | asymptotic `2/r·OPT` (Baker 1983, unverified) | planned | k30 |
| `online-ffs-r` | First Fit Shelf with parameter `r` | Do `online-nfs-r`, but put a box in the first shelf of its class where it fits. | Baker 1983 | density, online | `O(n log n)` | asymptotic `1.7/r·OPT` (Baker 1983, unverified) | planned | k30 |
| `shelf-online-harmonic` | Harmonic shelf | Do `online-ffs-r` with classes of width too, as the harmonic bin packing does. | Csirik 1997 | density, online | `O(n log n)` | asymptotic `1.69·OPT` (Csirik 1997, unverified) | planned | k30 |
| `online-bl` | Online bottom-left | Do `bl-chazelle` in the order of arrival. Its bound is a lower bound for all online packers. | Brown 1982 | online | `O(n^2)` | — | planned | k30 |
| `online-dynamic-bins` | Dynamic bin packing | Boxes come and go. Put each new box with First Fit, and do not move the boxes left. | Coffman 1983 | stability | `O(n log n)` | — | planned | k30 |
| `incremental-push` | Push cascade | Put a box where the user drops it. Push each box that it overlaps away on the axis of the smaller overlap, and push on in turn. | this repository | stability | `O(n^2)` | — | implemented: `pushCascade` | k30 |
| `incremental-vertical-compact` | Vertical compaction | After a move, move each box up as far as it goes, in order from the top. | react-grid-layout, software | stability, density | `O(n^2)` | — | planned | k30 |
| `incremental-float` | Float grid | Do `incremental-push`, but do not compact. A box stays where the user puts it. | gridstack.js, software | stability | `O(n^2)` | — | planned | k30 |
| `incremental-suffix` | Pack the suffix again | Keep each box before the first change in the order. Pack only the boxes from the change to the end. | this repository | stability, order | one pack of the suffix | — | planned | k30 |
| `incremental-git` | Greedy insertion | `treemap-git` for packers: remove the old boxes, and put each new box in the free space that changes the least. | Vernier 2018 | stability | `O(n F)` | — | planned | k30 |

Notes:

- The online bounds of Baker 1983 and Csirik 1997 are for the online case. The benchmark can feed the boxes one at a time to measure the online strategies.
- `incremental-suffix` is a baseline for `pack.stability.moved`: it moves no box before the first change.

## Graph layout: components, overlap removal and compaction

These methods come from graph drawing and from the layout of chips. They are near to packing. A component packer packs groups of nodes. An overlap removal moves boxes apart with little movement. A compaction moves boxes together and keeps their order. These methods need a new item.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `components-polyomino` | Polyomino packing | Cover each component with grid cells (a polyomino). Put the polyominoes, from the largest, on the free cells nearest to the center. | Freivalds 2002 | density, aspect | `O(n c^2)` for `c` cells | — | planned | new item |
| `components-placing` | Placing components | Put each component as a box with a rule for the aspect and the order of the components. The rule is unverified. | Goehlsdorf 2007 | aspect | `O(n log n)` | — | planned | new item |
| `overlap-prism` | PRISM | Build a proximity graph of the boxes. Grow the edges between overlapping boxes, and do a stress layout. Repeat until no overlap is left. | Gansner 2010 | stability | iterations x `O(n log n)` | — | planned | new item |
| `overlap-vpsc` | VPSC | For each axis, write "a is left of b by at least the gap" as constraints. Solve the quadratic problem of the smallest movement. | Dwyer 2006 | stability | `O(n log n)` for each axis | — | planned | new item |
| `overlap-force-scan` | Force-scan | Scan the boxes along each axis. Push each box that overlaps the box before it, along the line between the two centers. | Misue 1995 | stability | `O(n^2)` | — | planned | new item |
| `overlap-qp` | Constrained optimization | Write the overlap removal as a quadratic program with a choice of "left", "right", "above" or "below" for each pair. | Marriott 2003 | stability | exponential | — | planned | new item |
| `overlap-gtree` | GTree | Build a minimum spanning tree of the overlap graph. Grow the tree edges, and move the boxes along the tree. | Nachmanson 2016 | stability | iterations x `O(n log n)` | — | planned | new item |
| `overlap-spring` | Spring removal (DNLS) | Add a spring force between overlapping boxes, and do a force layout. | Li 2005 | stability | iterations x `O(n^2)` | — | planned | new item |
| `overlap-odnls` | ODNLS | The second spring method of Li 2005. The brief called it ODNC. Its full name and rule are unverified. | Li 2005 | stability | iterations x `O(n^2)` | — | planned | new item |
| `overlap-orthogonal` | Orthogonal order | Remove the overlap and keep the orthogonal order of each pair. | Hayashi 1998 | stability, order | `O(n log n)` | — | planned | new item |
| `compact-1d` | One-dimensional compaction | Build a graph of the constraints "a is left of b by at least the gap" with a scan line. Give each box its longest path from the left wall. Do the same for y. | Lengauer 1990, Liao 1983 | density, order | `O(n log n)` | — | planned | new item |
| `compact-mixed` | Compaction with mixed constraints | Do `compact-1d` with upper bounds on some distances too. | Liao 1983 | density | `O(n E)` for `E` constraints | — | planned | new item |
| `compact-optimal` | Optimal compaction | Compact both axes at once with an integer program. | Klau 1999 | density | exponential | exact: `OPT` | planned | new item |

Notes:

- `compact-1d` after a shelf or a skyline pack removes the gaps that the rows leave. It keeps the order of each pair on each axis, thus it does not add inversions.
- The overlap removal methods need a start layout. A force layout or a user layout gives it. Then `pack.stability.mean` measures the movement against the start.
- The item k38 (obstacles that move at a cost) is near to overlap removal. An overlap removal method can be a strategy of k38.

## Text and interface layout

These methods come from the layout of text and of user interfaces. They are packers with an order.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `flex-wrap` | Flexbox wrap | `shelf-nf` in the input order, with a rule for the space that is left in each row (start, center, end or between). | W3C flexbox | order | `O(n)` | — | planned | k28 |
| `flex-wrap-grow` | Flexbox wrap with grow | Do `flex-wrap`, then give the space left in each row to the boxes that can grow. | W3C flexbox | order, raggedness | `O(n)` | — | planned | k28 |
| `line-break-knuth-plass` | Line breaking of boxes | Choose all the row breaks of the input order at once. The cost of a row is the square of its free width. The last row has no cost. | Knuth 1981 | order, raggedness | `O(n w)` | the best breaks for its cost (Knuth 1981) | planned | k29 |
| `label-greedy` | Greedy label placement | For each point, choose one of four places for its label. Take the place with the fewest overlaps. | Christensen 1995 | overlap | `O(n log n)` | — | planned | new item |
| `label-annealing` | Label placement by annealing | Do `label-greedy`, then anneal over the choices. | Christensen 1995 | overlap | steps x `O(log n)` | — | planned | new item |
| `label-four-place` | Four-place labels | Choose one of four corners of each point for its square label. Make the labels as large as possible with no overlap. | Formann 1991 | overlap | `O(n log n)` | labels of `1/2` of the best size (Formann 1991, unverified) | planned | new item |
| `word-cloud-spiral` | Spiral placement | Put each box, from the largest, at the first place without overlap along a spiral from the center. The rule is unverified. | Viégas 2009 | density, aspect | `O(n^2)` | — | planned | new item |
| `ui-grid-ip` | Grid layout by integer program | Write the layout of interface elements on a grid as an integer program, with goals of alignment and balance. | Dayama 2020 | order, aspect | exponential | — | planned | new item |

Notes:

- `line-break-knuth-plass` with boxes of fixed size gives rows with the least raggedness for the input order. It is a strong baseline for `pack.raggedness` and `pack.order.inversions` at the same time.
- `word-cloud-spiral` puts the large boxes in the center. It does not keep an order. It aims at a round outline.

## Knapsack and identical boxes

These methods fill a fixed container. A knapsack method chooses which boxes go in, and the rest go to the overflow. A method for identical boxes puts the most copies of one box in a container. The survey of k76 added this family.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `knapsack-tabu` | Tabu search for the non-guillotine knapsack | Build a layout with a constructive rule. Then move boxes into and out of the layout, with a tabu memory of the last moves. | Alvarez-Valdes 2007 | overflow | steps x `O(n F)` | — | planned | new item |
| `knapsack-bidirectional` | Bidirectional building for the guillotine knapsack | Build guillotine blocks of boxes from two directions, and keep the best layout. The rule in detail is unverified. | Wei 2015 | overflow | blocks x `O(n)` | — | planned | new item |
| `identical-five-block` | Recursive five-block and L-approach | Cut the container into five blocks or into L shapes, recursively. Fill each block with a grid of the box, in the two orientations. | Birgin 2010 | density | pseudo-polynomial | — | planned | new item |

Notes:

- `least-waste-first` and `exact-knapsack-relax` also aim at `pack.overflow`.
- Without the option `rotate`, a grid is the best layout for identical boxes. `identical-five-block` helps only with `rotate` set to `true`.

## Analytical placement and legalization

These methods come from the placement of cells on chips. A global placer spreads many boxes with a smooth density penalty and lets them overlap a little. A legalizer then removes each overlap with little movement. The survey of k76 added this family.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `place-electrostatic` | Electrostatic global placement (ePlace) | Each box is a charge. The density penalty is the energy of the field, solved with a fast Fourier transform. Nesterov's method moves the boxes. | Lu 2015 | density, edges | iterations x `O(n log n)` | — | planned | new item |
| `place-gpu` | Analytical placement as training (DREAMPlace) | Do `place-electrostatic` as the training of a neural network, with kernels for a graphics processor. | Lin 2019, Lin 2021 | speed, edges | iterations x `O(n log n)` | — | planned | new item |
| `legalize-greedy` | Greedy legalization | Sort the boxes by their x place. Put each box, in that order, in the free place nearest to its target. | Hill 2002 (the name "Tetris" for it is unverified) | stability | `O(n log n + n F)` | — | planned | new item |
| `legalize-abacus` | Abacus | Take the boxes in order of x. Test each row: put the box at its end and move the clusters of the row to the least squared movement. Keep the best row. | Spindler 2008 | stability, order | `O(n r)` for `r` rows | — | planned | new item |

Notes:

- A legalizer is a packer with a target place for each box. Thus `legalize-abacus` is a shelf packer with a cost of movement, and a strategy of k38 and k53.
- A global placer with a legalizer handles `10k` boxes and more. It also reads the edges, thus it suits the objective `edges` of the taxonomy.

## Irregular shapes: nesting

Nesting packs polygons. Most methods use the no-fit polygon (NFP): the region where the reference point of one piece makes it overlap a fixed piece. The best methods of today minimize overlap in a strip that shrinks. Roadmap item k39 names this cell. The survey of k76 added this family. Here `m` and `k` are the counts of edges of two pieces.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `bbox-shapes` | Shapes by their bounding boxes | Pack the bounding box of each polygon or circle with a rectangle strategy, then put each shape in its box. It is the baseline of each shape. | this project, near Yang 2023 | density | the cost of the member | no overlap, because each shape is in its box | implemented | k91 |
| `nfp-orbit` | No-fit polygon by orbiting | Slide piece B around piece A along the edges that touch. The path of the reference point of B is the NFP. More start points cover holes and concave parts. | Burke 2007 | geometry | polynomial in `m k` | — | planned | new item |
| `nfp-minkowski` | No-fit polygon by Minkowski sums | Make the NFP as the Minkowski sum of A and the reflection of B, from the edges sorted by slope. Handle holes and degenerate cases. | Bennell 2008b | geometry | `O(m k log(m k))` for convex parts | — | planned | new item |
| `nfp-decompose` | No-fit polygon by convex parts | Cut each polygon into convex parts. Take the Minkowski sum of each pair of parts, then the union of the sums. | Agarwal 2002 | geometry | parts squared x union | — | planned | new item |
| `nest-topos` | TOPOS | Grow a partial layout one piece at a time. Choose the piece and its place by the waste, the overlap and the distance that the NFPs give. | Oliveira 2000 | density | `O(n^2)` NFP tests | — | planned | new item |
| `nest-blf` | Bottom-left fill for polygons | Put each piece at its lowest, then leftmost place, with an orbit and translation test for overlap. Search the order with hill climbing or tabu search. | Burke 2006 | density | steps x `O(n^2)` | — | planned | new item |
| `nest-saha` | Annealing with linear programs (SAHA) | Anneal over the order of the pieces. Compact and separate the layout with linear programs that keep the NFP regions fixed. | Gomes 2006 | density | steps x linear program | — | planned | new item |
| `nest-gls-overlap` | Guided local search on the overlap area | Shrink the strip. Move one piece at a time to its best horizontal or vertical place, which an exact sweep finds. Penalties guide the search out of local minima. | Egeblad 2007 | density | `O(n log n)` for each move | — | planned | new item |
| `nest-ils-qn` | Iterated local search with a nonlinear separation (ILSQN) | Minimize a penalty of penetration depth with a quasi-Newton step, and swap pieces. Shrink the strip after each layout without overlap. | Imamichi 2009 | density | steps x quasi-Newton | — | planned | new item |
| `nest-gls-depth` | Guided local search on penetration depth | Do `nest-gls-overlap` with the directional penetration depth from the NFPs as the measure of overlap. | Umetani 2009 | density | `O(n)` NFP tests for each move | — | planned | new item |
| `nest-els` | Extended local search (ELS) | Do `nest-ils-qn` with a tabu search and a compaction step. | Leung 2012 | density | steps x quasi-Newton | — | planned | new item |
| `nest-cuckoo` | Guided cuckoo search with pairwise clusters | Join pairs of pieces that fit well into clusters first. Then do a cuckoo search with an overlap minimization by guided local search. | Elkeran 2013 | density | steps x moves | — | planned | new item |
| `nest-labour-division` | Flexible labour division | Split the strip into regions and give pieces to each region. Then separate and compact the pieces. | Wang 2017 | density | steps x moves | — | planned | new item |
| `nest-raster-brkga` | No-fit raster with a genetic algorithm | Change the NFPs into a grid of free cells. A biased random-key genetic algorithm searches the order and the rotation, with a bottom-left decoder on the grid. | Mundim 2017 | density | generations x population x grid | — | planned | new item |
| `nest-raster-penetration` | Raster penetration map | Minimize the overlap with a map of the penetration depth on a raster grid. | Sato 2019 | density | steps x grid | — | planned | new item |
| `nest-sparrow` | Sparrow | Solve the strip as a chain of feasibility problems. Shrink the strip, then remove the collisions one piece at a time, with guided weights and sampled moves. | Gardeyn 2025 | density | minutes for each instance | — | planned | new item |
| `nest-collision-engine` | Collision engine (jagua-rs) | Keep the geometry apart from the optimizer. Answer each overlap query with a broad phase, a narrow phase, a fast surrogate and simplified polygons. | Gardeyn 2026 | speed | millions of queries each second | — | planned | new item |
| `nest-phi` | Phi-functions | A closed-form function is 0 or more exactly when two pieces do not overlap. Solve the packing as a nonlinear program from many starts. | Chernov 2010, Stoyan 2015, Stoyan 2016 | density, any rotation | starts x nonlinear program | — | planned | new item |
| `nest-milp-nfp` | Mixed integer program on the NFP | Cut the outside of each NFP into convex regions. A binary variable chooses one region for each pair of pieces. | Fischetti 2009, Alvarez-Valdes 2013, Lastra-Díaz 2024 | density | exponential | exact: `OPT` | planned | new item |
| `nest-dotted-board` | Dotted-board model | Put the reference point of each piece on a grid of dots, with one binary for each piece and dot. The NFPs give the conflicts, and cliques make the model tight. | Toledo 2013, Rodrigues 2017 | density | exponential | exact: `OPT` on the grid of dots | planned | new item |
| `nest-milp-trig` | Robust integer models without the NFP | Cut the pieces into convex parts, and write each overlap constraint with direct trigonometry. | Cherri 2016 | density | exponential | exact: `OPT` | planned | new item |
| `nest-svgnest` | SVGnest | Make the NFPs by orbiting. Do a genetic algorithm over the order and the rotation, from first fit decreasing. | SVGnest, software | density | generations x population x NFP | — | planned | new item |
| `nest-tree-search` | PackingSolver | A tree search with no randomness over the trapezoids of the pieces. The rule comes from the report of Gardeyn 2025 and is unverified. | PackingSolver, software | density | one run | — | planned | new item |

Notes:

- The best published densities on the ESICUP strip sets come from `nest-sparrow`. [`SURVEY.md`](SURVEY.md#irregular-shapes-nesting) gives the table.
- A rectangle is a polygon. Thus each `nest-*` method can also pack the rectangles of today, and the benchmark can compare them.
- Deepnest, a fork of SVGnest, has parts under GPLv3. Do not copy its code. SVGnest is under MIT.

## Circles

These methods pack circles of equal or of different radii into a circle, a square, a rectangle or a strip. Most of them change a layout with overlap until the overlap is zero, and then make the container smaller. Roadmap item k39 names this cell. The survey of k76 added this family.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `circle-quasi-human` | Quasi-human strategies | When the search stops in a local minimum, take the circle with the most overlap and put it in a new place. | Huang 1999 | density | steps x `O(n^2)` | — | planned | new item |
| `circle-quasi-physical` | Quasi-physical energy | Treat each overlap as an elastic energy. Lower the energy with gradient steps, and jump out of each local minimum with a quasi-human move. | Wang 2002, Huang 2011b | density | steps x `O(n^2)` | — | planned | new item |
| `circle-hole-degree` | Maximum hole degree | Put each circle in the corner place, where it touches two placed items, with the largest hole degree. Look one step ahead. | Huang 2006, Kubach 2009 | density, speed | `O(n^3)` to `O(n^4)` | — | planned | new item |
| `circle-mbh` | Monotonic basin hopping | Change the layout at random, then do a local nonlinear solve. Keep the result only when it is better. | Addis 2008a, Addis 2008b | density | steps x local solve | — | planned | new item |
| `circle-pbh` | Population basin hopping | Keep a population of `circle-mbh` runs, with a measure of how different two layouts are. | Grosso 2010 | density | population x steps x local solve | — | planned | new item |
| `circle-fss` | Formulation space search | Change between the Cartesian form and the polar form of the same nonlinear program, to leave a local optimum of one form. | López 2011, López 2013 | density | steps x local solve | — | planned | new item |
| `circle-its-strip` | Iterated tabu search for circles in a strip | Solve the strip as a series of fixed lengths. Solve each length with a tabu search, perturbations and a rule of acceptance. | Fu 2013 | density | lengths x steps | — | planned | new item |
| `circle-its-vnd` | Tabu search and variable neighborhood descent in a circle | Do an iterated tabu search, with a variable neighborhood descent that improves each layout. | Zeng 2016 | density | steps x moves | — | planned | new item |
| `circle-threshold` | Iterated dynamic thresholding search | Do two phases of local optimization with a threshold of acceptance. Change the size of the container between the phases. Perturbations at many scales help on convex containers. | Lai 2022, Lai 2025 | density | steps x local solve | — | planned | new item |
| `circle-solution-hashing` | Solution-hashing search | Hash each layout as a graph, and skip each layout that the search saw before. Find the empty places with a Voronoi diagram. | Zhou 2025 | density | steps x `O(n log n)` | — | planned | new item |
| `circle-strip-nlp` | Nonlinear model for circles in a strip | Write the non-overlap constraints as a nonlinear program. Move from one local optimum to the next with a reduced-gradient method. | Stoyan 2004 | density | starts x local solve | — | planned | new item |
| `circle-batch-gradient` | Geometric batch optimization | Lower the overlap of very many equal circles with batches of gradient steps. The paper is a preprint without peer review. | Zhou 2023 | density, speed | iterations x `O(n)` | — | planned | new item |
| `circle-enclose` | Smallest enclosing circle | Add the circles in a random order. When a circle is outside the current circle, make a new circle through it. The expected time is linear. | Welzl 1991, Matoušek 1996 | aspect | expected `O(n)` | exact: the smallest enclosing circle | planned | new item |
| `circle-llm-evolve` | Programs that a language model evolves | A language model changes a program that outputs the packing. An evaluator scores each program, and the best programs stay. | Novikov 2025, Lange 2025 | density | thousands of model calls | — | planned | new item |

Notes:

- `circle-pack-front-chain` of the [treemaps](#treemaps) puts the circles of a group in order. `circle-enclose` gives the circle of the parent. `d3-hierarchy` uses the two, under the ISC license.
- The circle packing of Collins 2003 is a different problem: it computes the radii for a given graph of contacts. It does not fill a container.
- Packomania gives the best known packings of equal and unequal circles. It states no license. Fetch its data in CI, and do not ship it in the package.
- The records of Novikov 2025 maximize the sum of the radii in a square or a rectangle. That objective is not the classic objective of the largest equal radius.

## Learned and hybrid methods

These methods learn a part of a packer from data: the order, the place, the choice of a heuristic or the code of a rule. Most of them keep a classic decoder, `maxrects` or bottom-left, for the geometry. The survey of k76 added this family.

| `id` | Name | Rule | Source | Goal | Cost | Guarantee | Status | Item |
|---|---|---|---|---|---|---|---|---|
| `learn-order-pointer` | Learned order with a pointer network | A pointer network, trained with reinforcement learning, gives the order of the boxes. A bottom-left decoder on `maxrects` places them and gives the reward. | Vinyals 2015, Bello 2016, Hu 2017, Fang 2023 | density | training, then `O(n^2)` | — | planned | new item |
| `learn-place-transformer` | Learned place among free rectangles | A transformer, trained with PPO, chooses the free rectangle of `maxrects` for each box that arrives. | Kaleta 2025, Kaleta 2026 | density, online | training, then `O(n^2)` | — | planned | new item |
| `learn-config-tree` | Packing configuration tree | Keep a tree of the placed boxes and of the candidate places. A graph attention policy chooses a leaf, which is the place. | Zhao 2021, Zhao 2022 | density, online | training, then `O(n)` leaves for each box | — | planned | new item |
| `learn-super-patch` | Learned groups as near rectangles | A learned policy joins irregular pieces into groups that are almost rectangles. Pack the groups as rectangles, then improve the layout. | Yang 2023 | density | training, then near `O(n)` | — | planned | new item |
| `learn-gradient-field` | Learned gradient fields | A score model, trained on good layouts, moves each polygon from coarse to fine. Translations only. | Xue 2023 | density | training, then steps x `O(n^2)` | — | planned | new item |
| `learn-nest-rl` | Reinforcement learning for nesting | A transformer over the polygons, trained with reinforcement learning, places each piece with free rotation. | Lehuger 2026 | density | training, then `O(n^2)` | — | planned | new item |
| `learn-surrogate` | Learned efficiency estimate | A graph neural network predicts the density of a nesting without the nesting. Use it to rank inputs or orders cheaply. | Lallier 2024 | speed | training, then `O(n)` | — | planned | new item |
| `hh-select-rules` | Hyper-heuristic that selects rules | A genetic algorithm learns rules that map the features of the current state to a pair of heuristics: which piece, and which place. | Terashima-Marín 2010, López-Camacho 2014 | density | training, then `O(n^2)` | — | planned | new item |
| `hh-gp-score` | Genetic programming of the score | Genetic programming evolves the score function that chooses the next box and its place. | Burke 2010, Burke 2013 | density | training, then `O(n^2)` | — | planned | new item |
| `llm-evolve-priority` | Priority functions that a language model evolves | A language model changes the code of a priority function, and an evaluator scores it on a set of inputs. The best programs stay. | Romera-Paredes 2024, Liu 2024a, Ye 2024, Huq 2025 | density | thousands of model calls, then `O(n^2)` | — | planned | new item |
| `select-strip-ml` | Learned choice of a strip heuristic | A classifier reads the features of an input and chooses one of the strip heuristics. | Neuenfeldt 2023 | density, speed | training, then one heuristic | — | planned | new item |
| `select-instance-space` | Instance space analysis | Map each input to a plane by its features. Find the region where each method is strong, its "footprint". | Smith-Miles 2023, Liu 2024b, Rakotonirainy 2022 | selection | one fit | — | planned | new item |

Notes:

- The `select` strategy of today is a hand fit of a table on cheap features (k66, k70). `select-strip-ml` and `select-instance-space` are learned forms of the same idea.
- The gains of the evolved priority functions are on one-dimensional bins. Herrmann 2025 finds that simple rules by hand are as good, and Sim 2025 tests the claims again. Huq 2025 is the only report on two-dimensional bins, with 50 inputs.
- Each method of this family needs training data and a model at run time, thus a new dependency.

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

- **Addis 2008a.** Bernardetta Addis, Marco Locatelli, Fabio Schoen. "Efficiently packing unequal disks in a circle". Operations Research Letters 36(1):37-42. <https://doi.org/10.1016/j.orl.2007.03.001>
- **Addis 2008b.** B. Addis, M. Locatelli, F. Schoen. "Disk Packing in a Square: A New Global Optimization Approach". INFORMS Journal on Computing 20(4):516-524. <https://doi.org/10.1287/ijoc.1080.0263>
- **Agarwal 2002.** Pankaj K. Agarwal, Eyal Flato, Dan Halperin. "Polygon decomposition for efficient construction of Minkowski sums". Computational Geometry 21(1-2):39-61. <https://doi.org/10.1016/S0925-7721(01)00041-4>
- **Albano 1980.** Antonio Albano, Giuseppe Sapuppo. "Optimal Allocation of Two-Dimensional Irregular Shapes Using Heuristic Search Methods". IEEE Transactions on Systems, Man, and Cybernetics 10(5):242-248. <https://doi.org/10.1109/TSMC.1980.4308483>
- **Alvarez-Valdes 2007.** R. Alvarez-Valdes, F. Parreño, J.M. Tamarit. "A tabu search algorithm for a two-dimensional non-guillotine cutting problem". European Journal of Operational Research 183(3):1167-1182. <https://doi.org/10.1016/j.ejor.2005.11.068>
- **Alvarez-Valdes 2008.** R. Alvarez-Valdes, F. Parreño, J. M. Tamarit. "Reactive GRASP for the strip-packing problem". Computers and Operations Research 35(4):1065-1083. <https://doi.org/10.1016/j.cor.2006.07.004>
- **Alvarez-Valdes 2009.** R. Alvarez-Valdes, F. Parreño, J. M. Tamarit. "A branch and bound algorithm for the strip packing problem". OR Spectrum 31(2):431-459. <https://doi.org/10.1007/s00291-008-0128-5>
- **Alvarez-Valdes 2013.** R. Alvarez-Valdes, A. Martinez, J.M. Tamarit. "A branch and bound algorithm for cutting and packing irregularly shaped pieces". International Journal of Production Economics 145(2):463-477. <https://doi.org/10.1016/j.ijpe.2013.04.007>
- **Arahori 2012.** Yohei Arahori, Takashi Imamichi, Hiroshi Nagamochi. "An exact strip packing algorithm based on canonical forms". Computers and Operations Research 39(12):2991-3011. <https://doi.org/10.1016/j.cor.2012.03.003>
- **Aşık 2009.** Önder Barış Aşık, Ender Özcan. "Bidirectional best-fit heuristic for orthogonal rectangular strip packing". Annals of Operations Research 172(1):405-427. <https://doi.org/10.1007/s10479-009-0642-0>
- **Baker 1980.** Brenda S. Baker, E. G. Coffman Jr., Ronald L. Rivest. "Orthogonal packings in two dimensions". "SIAM Journal on Computing" 9(4):846-855. <https://doi.org/10.1137/0209064>
- **Baker 1983.** Brenda S. Baker, Jerald S. Schwarz. "Shelf algorithms for two-dimensional packing problems". "SIAM Journal on Computing" 12(3):508-525. <https://doi.org/10.1137/0212033>
- **Balzer 2005.** Michael Balzer, Oliver Deussen. "Voronoi treemaps". IEEE Symposium on Information Visualization (InfoVis 2005), pages 49-56. The DOI is unverified: two records give different values.
- **Beasley 1985a.** J. E. Beasley. "An exact two-dimensional non-guillotine cutting tree search procedure". Operations Research 33(1):49-64. <https://doi.org/10.1287/opre.33.1.49>
- **Beasley 1985b.** J. E. Beasley. "Algorithms for unconstrained two-dimensional guillotine cutting". Journal of the Operational Research Society 36(4):297-306. <https://doi.org/10.1057/jors.1985.51>
- **Beasley 1990.** J. E. Beasley. "OR-Library: Distributing Test Problems by Electronic Mail". Journal of the Operational Research Society 41(11):1069-1072. <https://doi.org/10.1057/jors.1990.166>
- **Beasley 2004.** J.E. Beasley. "A population heuristic for constrained two-dimensional non-guillotine cutting". European Journal of Operational Research 156(3):601-627. <https://doi.org/10.1016/S0377-2217(03)00139-5>
- **Bederson 2002.** Benjamin B. Bederson, Ben Shneiderman, Martin Wattenberg. "Ordered and quantum treemaps: making effective use of 2D space to display hierarchies". ACM Transactions on Graphics 21(4):833-854. <https://doi.org/10.1145/571647.571649>
- **Beldiceanu 1994.** N. Beldiceanu, E. Contejean. "Introducing global constraints in CHIP". "Mathematical and Computer Modelling" 20(12):97-123. <https://doi.org/10.1016/0895-7177(94)90127-9>
- **Beldiceanu 2001.** Nicolas Beldiceanu, Mats Carlsson. "Sweep as a generic pruning technique applied to the non-overlapping rectangles constraint". CP 2001, LNCS 2239, pages 377-391. <https://doi.org/10.1007/3-540-45578-7_26>
- **Bello 2016.** Irwan Bello, Hieu Pham, Quoc V. Le, Mohammad Norouzi, Samy Bengio. "Neural Combinatorial Optimization with Reinforcement Learning". arXiv:1611.09940. <https://arxiv.org/abs/1611.09940> The venue is unverified.
- **Belov 2008.** G Belov, G Scheithauer, E A Mukhacheva. "One-dimensional heuristics adapted for two-dimensional rectangular strip packing". Journal of the Operational Research Society 59(6):823-832. <https://doi.org/10.1057/palgrave.jors.2602393> The rule of `bottom-left-right` is unverified.
- **Bennell 2008.** Julia A. Bennell, Jose F. Oliveira. "The geometry of nesting problems: A tutorial". European Journal of Operational Research 184(2):397-415. <https://doi.org/10.1016/j.ejor.2006.11.038>
- **Bennell 2008b.** Julia A Bennell, Xiang Song. "A comprehensive and robust procedure for obtaining the nofit polygon using Minkowski sums". Computers and Operations Research 35(1):267-281. <https://doi.org/10.1016/j.cor.2006.02.026>
- **Bennell 2009.** J A Bennell, J F Oliveira. "A tutorial in irregular shape packing problems". Journal of the Operational Research Society 60(sup1):S93-S105. <https://doi.org/10.1057/jors.2008.169>
- **Berkey 1987.** J. O. Berkey, P. Y. Wang. "Two-dimensional finite bin-packing algorithms". Journal of the Operational Research Society 38(5):423-429. <https://doi.org/10.1057/jors.1987.70>
- **Birgin 2010.** E G Birgin, R D Lobato, R Morabito. "An effective recursive partitioning approach for the packing of identical rectangles in a rectangle". Journal of the Operational Research Society 61(2):306-320. <https://doi.org/10.1057/jors.2008.141>
- **Bortfeldt 2006.** Andreas Bortfeldt. "A genetic algorithm for the two-dimensional strip packing problem with rectangular pieces". European Journal of Operational Research 172(3):814-837. <https://doi.org/10.1016/j.ejor.2004.11.016>
- **Bortfeldt 2006b.** A. Bortfeldt, H. Gehring. "New Large Benchmark Instances for the Two-Dimensional Strip Packing Problem with Rectangular Pieces". Proceedings of the 39th Annual Hawaii International Conference on System Sciences (HICSS'06), pages 30b-30b. <https://doi.org/10.1109/hicss.2006.360>
- **Bortfeldt 2013.** Andreas Bortfeldt. "A reduction approach for solving the rectangle packing area minimization problem". European Journal of Operational Research 224(3):486-496. <https://doi.org/10.1016/j.ejor.2012.08.006>
- **Boschetti 2010.** Marco Antonio Boschetti, Lorenza Montaletti. "An exact algorithm for the two-dimensional strip-packing problem". Operations Research 58(6):1774-1791. <https://doi.org/10.1287/opre.1100.0833>
- **Brown 1982.** Donna J. Brown, Brenda S. Baker, Howard P. Katseff. "Lower bounds for on-line two-dimensional packing algorithms". Acta Informatica 18(2):207-225. <https://doi.org/10.1007/BF00264439> The pages are unverified.
- **Bruls 2000.** Mark Bruls, Kees Huizing, Jarke J. van Wijk. "Squarified treemaps". Data Visualization 2000 (VisSym 2000), Springer, pages 33-42. <https://doi.org/10.2312/VisSym/VisSym00/033-042>
- **Burke 2004.** E. K. Burke, G. Kendall, G. Whitwell. "A new placement heuristic for the orthogonal stock-cutting problem". Operations Research 52(4):655-671. <https://doi.org/10.1287/opre.1040.0109>
- **Burke 2006.** Edmund Burke, Robert Hellier, Graham Kendall, Glenn Whitwell. "A New Bottom-Left-Fill Heuristic Algorithm for the Two-Dimensional Irregular Packing Problem". Operations Research 54(3):587-601. <https://doi.org/10.1287/opre.1060.0293>
- **Burke 2007.** E.K. Burke, R.S.R. Hellier, G. Kendall, G. Whitwell. "Complete and robust no-fit polygon generation for the irregular stock cutting problem". European Journal of Operational Research 179(1):27-49. <https://doi.org/10.1016/j.ejor.2006.03.011>
- **Burke 2009.** Edmund K. Burke, Graham Kendall, Glenn Whitwell. "A simulated annealing enhancement of the best-fit heuristic for the orthogonal stock-cutting problem". "INFORMS Journal on Computing" 21(3):505-516. <https://doi.org/10.1287/ijoc.1080.0306>
- **Burke 2010.** Edmund K. Burke, Matthew Hyde, Graham Kendall, John Woodward. "A Genetic Programming Hyper-Heuristic Approach for Evolving 2-D Strip Packing Heuristics". IEEE Transactions on Evolutionary Computation 14(6):942-958. <https://doi.org/10.1109/tevc.2010.2041061>
- **Burke 2013.** Edmund K Burke, Michel Gendreau, Matthew Hyde, Graham Kendall, Gabriela Ochoa, Ender Özcan, Rong Qu. "Hyper-heuristics: a survey of the state of the art". Journal of the Operational Research Society 64(12):1695-1724. <https://doi.org/10.1057/jors.2013.71>
- **Caprara 2004.** Alberto Caprara, Michele Monaci. "On the two-dimensional Knapsack Problem". Operations Research Letters 32(1):5-14. <https://doi.org/10.1016/S0167-6377(03)00057-9>
- **Carlier 2007.** Jacques Carlier, François Clautiaux, Aziz Moukrim. "New reduction procedures and lower bounds for the two-dimensional bin packing problem with fixed orientation". Computers and Operations Research 34(8):2223-2250. <https://doi.org/10.1016/j.cor.2005.08.012>
- **Castillo 2008.** Ignacio Castillo, Frank J. Kampas, János D. Pintér. "Solving circle packing problems by global optimization: Numerical results and industrial applications". European Journal of Operational Research 191(3):786-802. <https://doi.org/10.1016/j.ejor.2007.01.054>
- **Chang 2000.** Yun-Chih Chang, Yao-Wen Chang, Guang-Ming Wu, Shu-Wei Wu. "B*-trees: a new representation for non-slicing floorplans". DAC 2000, pages 458-463. <https://doi.org/10.1145/337292.337541>
- **Charalambous 2011.** Christoforos Charalambous, Krzysztof Fleszar. "A constructive bin-oriented heuristic for the two-dimensional bin packing problem with guillotine cuts". Computers and Operations Research 38(10):1443-1451. <https://doi.org/10.1016/j.cor.2010.12.013>
- **Chazelle 1983.** Bernard Chazelle. "The bottom-left bin-packing heuristic: an efficient implementation". IEEE Transactions on Computers C-32(8):697-707. <https://doi.org/10.1109/TC.1983.1676307>
- **Chen 1995.** C. S. Chen, S. M. Lee, Q. S. Shen. "An analytical model for the container loading problem". European Journal of Operational Research 80(1):68-76. <https://doi.org/10.1016/0377-2217(94)00002-T>
- **Chen 2007.** Mao Chen, Wenqi Huang. "A two-level search algorithm for 2D rectangular packing problem". "Computers and Industrial Engineering" 53(1):123-136. <https://doi.org/10.1016/j.cie.2007.04.007>
- **Chen 2025.** Mao Chen, Xicheng Peng, Xiangyang Tang. "Filtered beam search algorithm for the two-dimensional rectangular packing problem". International Transactions in Operational Research 32(6):3729-3755. <https://doi.org/10.1111/itor.70010>
- **Chernov 2010.** N. Chernov, Yu. Stoyan, T. Romanova. "Mathematical model and efficient algorithms for object packing problem". Computational Geometry 43(5):535-553. <https://doi.org/10.1016/j.comgeo.2009.12.003>
- **Cherri 2016.** Luiz H. Cherri, Leandro R. Mundim, Marina Andretta, Franklina M.B. Toledo, José F. Oliveira, Maria Antónia Carravilla. "Robust mixed-integer linear programming models for the irregular strip packing problem". European Journal of Operational Research 253(3):570-583. <https://doi.org/10.1016/j.ejor.2016.03.009>
- **Christensen 1995.** Jon Christensen, Joe Marks, Stuart Shieber. "An empirical study of algorithms for point-feature label placement". ACM Transactions on Graphics 14(3):203-232. <https://doi.org/10.1145/212332.212334>
- **Christofides 1977.** Nicos Christofides, Charles Whitlock. "An algorithm for two-dimensional cutting problems". Operations Research 25(1):30-44. <https://doi.org/10.1287/opre.25.1.30>
- **Chung 1982.** F. R. K. Chung, M. R. Garey, D. S. Johnson. "On packing two-dimensional bins". SIAM Journal on Algebraic and Discrete Methods 3(1):66-76. The report of 1981: <https://minds.wisconsin.edu/handle/1793/58236>
- **Cid-Garcia 2020.** Nestor M. Cid-Garcia, Yasmin A. Rios-Solis. "Positions and covering: A two-stage methodology to obtain optimal solutions for the 2d-bin packing problem". PLOS ONE 15(4):e0229358. <https://doi.org/10.1371/journal.pone.0229358>
- **Cid-Garcia 2021.** Nestor M. Cid-Garcia, Yasmin A. Rios-Solis. "Exact solutions for the 2d-strip packing problem using the positions-and-covering methodology". PLOS ONE 16(1):e0245267. <https://doi.org/10.1371/journal.pone.0245267>
- **Clautiaux 2007.** François Clautiaux, Jacques Carlier, Aziz Moukrim. "A new exact method for the two-dimensional orthogonal packing problem". European Journal of Operational Research 183(3):1196-1211. <https://doi.org/10.1016/j.ejor.2005.12.048>
- **Clautiaux 2008.** François Clautiaux, Antoine Jouglet, Jacques Carlier, Aziz Moukrim. "A new constraint programming approach for the orthogonal packing problem". Computers and Operations Research 35(3):944-959. <https://doi.org/10.1016/j.cor.2006.05.012>
- **Coffman 1980.** E. G. Coffman Jr., M. R. Garey, D. S. Johnson, R. E. Tarjan. "Performance bounds for level-oriented two-dimensional packing algorithms". "SIAM Journal on Computing" 9(4):808-826. <https://doi.org/10.1137/0209062>
- **Coffman 1983.** E. G. Coffman Jr., M. R. Garey, D. S. Johnson. "Dynamic bin packing". "SIAM Journal on Computing" 12(2):227-258. <https://doi.org/10.1137/0212014>
- **Collins 2003.** Charles R. Collins, Kenneth Stephenson. "A circle packing algorithm". Computational Geometry 25(3):233-256. <https://doi.org/10.1016/S0925-7721(02)00099-8>
- **Côté 2014.** Jean-François Côté, Mauro Dell'Amico, Manuel Iori. "Combinatorial Benders' Cuts for the Strip Packing Problem". Operations Research 62(3):643-661. <https://doi.org/10.1287/opre.2013.1248>
- **Côté 2021.** Jean-François Côté, Mohamed Haouari, Manuel Iori. "Combinatorial Benders Decomposition for the Two-Dimensional Bin Packing Problem". INFORMS Journal on Computing 33(3):963-978. <https://doi.org/10.1287/ijoc.2020.1014>
- **Crainic 2008.** Teodor Gabriel Crainic, Guido Perboli, Roberto Tadei. "Extreme point-based heuristics for three-dimensional bin packing". "INFORMS Journal on Computing" 20(3):368-384. <https://doi.org/10.1287/ijoc.1070.0250>
- **Csirik 1997.** János Csirik, Gerhard J. Woeginger. "Shelf algorithms for on-line strip packing". Information Processing Letters 63(4):171-175. <https://doi.org/10.1016/S0020-0190(97)00120-8>
- **Dayama 2020.** Niraj Dayama, Kashyap Todi, Taru Saarelainen, Antti Oulasvirta. "GRIDS: interactive layout design with integer programming". CHI 2020. <https://doi.org/10.1145/3313831.3376553>
- **de Berg 2011.** Mark de Berg, Bettina Speckmann, Vincent van der Weele. "Treemaps with bounded aspect ratio". ISAAC 2011, LNCS. <https://doi.org/10.1007/978-3-642-25591-5_28> A journal version of 2014 is unverified.
- **Delorme 2017.** Maxence Delorme, Manuel Iori, Silvano Martello. "Logic based Benders' decomposition for orthogonal stock cutting problems". Computers and Operations Research 78:290-298. <https://doi.org/10.1016/j.cor.2016.09.009>
- **Duarte 2014.** Felipe S. L. G. Duarte, Fabio Sikansi, Francisco M. Fatore, Samuel G. Fadel, Fernando V. Paulovich. "Nmap: a novel neighborhood preservation space-filling algorithm". IEEE TVCG 20(12):2063-2071. <https://doi.org/10.1109/TVCG.2014.2346276>
- **Dwyer 2006.** Tim Dwyer, Kim Marriott, Peter J. Stuckey. "Fast node overlap removal". "Graph Drawing" 2005, LNCS 3843, pages 153-164. <https://doi.org/10.1007/11618058_15>
- **Eades 1991.** Peter Eades, Wei Lai, Kazuo Misue, Kozo Sugiyama. "Preserving the mental map of a diagram". Compugraphics 1991, pages 24-33. The record is unverified: <https://www.bibsonomy.org/bibtex/5b39c1a8aa05b91465ad0ba256d6579f>
- **Egeblad 2007.** Jens Egeblad, Benny K. Nielsen, Allan Odgaard. "Fast neighborhood search for two- and three-dimensional nesting problems". European Journal of Operational Research 183(3):1249-1266. <https://doi.org/10.1016/j.ejor.2005.11.063>
- **El Hayek 2008.** Joseph El Hayek, Aziz Moukrim, Stéphane Negre. "New resolution algorithm and pretreatments for the two-dimensional bin-packing problem". Computers and Operations Research 35(10):3184-3201. <https://doi.org/10.1016/j.cor.2007.02.013>
- **Elkeran 2013.** Ahmed Elkeran. "A new approach for sheet nesting problem using guided cuckoo search and pairwise clustering". European Journal of Operational Research 231(3):757-769. <https://doi.org/10.1016/j.ejor.2013.06.020>
- **Engdahl 2005.** Björn Engdahl. "Ordered and unordered treemap algorithms and their applications on handheld devices". Master thesis, KTH, Stockholm. Unverified: only citations name it.
- **Fang 2023.** Jie Fang, Yunqing Rao, Mingliang Shi. "A deep reinforcement learning algorithm for the rectangular strip packing problem". PLOS ONE 18(3):e0282598. <https://doi.org/10.1371/journal.pone.0282598>
- **Fekete 2001.** Sándor P. Fekete, Jörg Schepers. "New classes of fast lower bounds for bin packing problems". "Mathematical Programming" 91(1):11-31. <https://doi.org/10.1007/s101070100243>
- **Fekete 2004.** Sándor P. Fekete, Jörg Schepers. "A combinatorial characterization of higher-dimensional orthogonal packing". Mathematics of Operations Research 29(2):353-368. <https://doi.org/10.1287/moor.1030.0079>
- **Fischetti 2009.** Matteo Fischetti, Ivan Luzzi. "Mixed-integer programming models for nesting problems". Journal of Heuristics 15(3):201-226. <https://doi.org/10.1007/s10732-008-9088-9> Crossref gives the year 2008 of the online version.
- **Fleszar 2013.** Krzysztof Fleszar. "Three insertion heuristics and a justification improvement heuristic for two-dimensional bin packing with guillotine cuts". Computers and Operations Research 40(1):463-474. <https://doi.org/10.1016/j.cor.2012.07.016>
- **Formann 1991.** M. Formann, F. Wagner. "A packing problem with applications to lettering of maps". SoCG 1991, pages 281-288. The DOI is unverified.
- **Freivalds 2002.** Karlis Freivalds, Ugur Dogrusoz, Paulis Kikusts. "Disconnected graph layout and the polyomino packing approach". "Graph Drawing" 2001, LNCS 2265, pages 378-391. <https://doi.org/10.1007/3-540-45848-4_30>
- **Fu 2013.** Zhanghua Fu, Wenqi Huang, Zhipeng Lü. "Iterated tabu search for the circular open dimension problem". European Journal of Operational Research 225(2):236-243. <https://doi.org/10.1016/j.ejor.2012.10.022>
- **Gansner 2010.** Emden R. Gansner, Yifan Hu. "Efficient, proximity-preserving node overlap removal". Journal of Graph Algorithms and Applications 14(1):53-74. <https://doi.org/10.7155/jgaa.00198>
- **Gardeyn 2022.** Jeroen Gardeyn, Tony Wauters. "A goal-driven ruin and recreate heuristic for the 2D variable-sized bin packing problem with guillotine constraints". European Journal of Operational Research 301(2):432-444. <https://doi.org/10.1016/j.ejor.2021.11.031>
- **Gardeyn 2025.** Jeroen Gardeyn, Greet Vanden Berghe, Tony Wauters. "An open-source heuristic to reboot 2D nesting research". arXiv:2509.13329, version 4 of 6 October 2026. <https://doi.org/10.48550/arXiv.2509.13329> The publication in a journal is unverified.
- **Gardeyn 2026.** Jeroen Gardeyn, Greet Vanden Berghe, Tony Wauters. "Decoupling Geometry from Optimization in 2D Irregular Cutting and Packing Problems: An Open-Source Collision Detection Engine". INFORMS Journal on Computing 38(5):1761-1775. <https://doi.org/10.1287/ijoc.2024.1025> The preprint is arXiv 2508.08341.
- **Gilmore 1965.** P. C. Gilmore, R. E. Gomory. "Multistage cutting stock problems of two and more dimensions". Operations Research 13(1):94-120. <https://doi.org/10.1287/opre.13.1.94>
- **Goehlsdorf 2007.** Dennis Goehlsdorf, Michael Kaufmann, Martin Siebenhaller. "Placing connected components of disconnected graphs". APVIS 2007, pages 101-108. <https://dblp.org/rec/conf/apvis/GoehlsdorfKS07.html>
- **Gomes 2006.** A. Miguel Gomes, José F. Oliveira. "Solving Irregular Strip Packing problems by hybridising simulated annealing and linear programming". European Journal of Operational Research 171(3):811-829. <https://doi.org/10.1016/j.ejor.2004.09.008>
- **Graham 1969.** R. L. Graham. "Bounds on multiprocessing timing anomalies". SIAM Journal on Applied Mathematics 17(2):416-429. <https://doi.org/10.1137/0117039>
- **Grosso 2010.** A. Grosso, A. R. M. J. U. Jamali, M. Locatelli, F. Schoen. "Solving the problem of packing equal and unequal circles in a circular container". Journal of Global Optimization 47(1):63-81. <https://doi.org/10.1007/s10898-009-9458-3> Crossref gives the year 2009 of the online version.
- **Guo 1999.** Pei-Ning Guo, Chung-Kuan Cheng, Takeshi Yoshimura. "An O-tree representation of non-slicing floorplan and its applications". DAC 1999, pages 268-273. <https://doi.org/10.1145/309847.309928>
- **Hahn 2014.** Sebastian Hahn, Jonas Trümper, Dominik Moritz, Jürgen Döllner. "Visualization of varying hierarchies by stable layout of Voronoi treemaps". IVAPP 2014, pages 50-58. <https://doi.org/10.5220/0004686200500058>
- **Hahn 2017.** Sebastian Hahn, Joseph Bethge, Jürgen Döllner. "Relative direction change: a topology-based metric for layout stability in treemaps". IVAPP 2017. <https://www.scitepress.org/Papers/2017/61175/>
- **Han 2022.** Chang Han, Anyi Li, Jaemin Jo, Bongshin Lee, Oliver Deussen, Yunhai Wang. "SizePairs: achieving stable and balanced temporal treemaps using hierarchical size-based pairing". IEEE VIS 2022. <https://virtual.ieeevis.org/year/2022/paper_v-full-1163.html>
- **Harasymiv 2016.** Antin Harasymiv. "Building the Google Photos web UI". Medium. Unverified: we could not read the page. <https://medium.com/google-design/google-photos-45b714dfbed1>
- **Harren 2014.** Rolf Harren, Klaus Jansen, Lars Prädel, Rob van Stee. "A (5/3 + ε)-approximation for strip packing". Computational Geometry 47(2):248-267. <https://doi.org/10.1016/j.comgeo.2013.08.008>
- **Hayashi 1998.** K. Hayashi, M. Inoue, T. Masuzawa, H. Fujiwara. "A layout adjustment problem for disjoint rectangles preserving orthogonal order". "Graph Drawing" 1998, LNCS 1547, pages 183-197. The first names are unverified.
- **He 2015.** Kun He, Pengli Ji, Chumin Li. "Dynamic reduction heuristics for the rectangle packing area minimization problem". European Journal of Operational Research 241(3):674-685. <https://doi.org/10.1016/j.ejor.2014.09.042>
- **Heer 2007.** Jeffrey Heer, George G. Robertson. "Animated transitions in statistical data graphics". IEEE TVCG 13(6):1240-1247. <https://doi.org/10.1109/TVCG.2007.70539>
- **Herrmann 2025.** Julien Herrmann, Guillaume Pallez. "An In-depth Study of LLM Contributions to the Bin Packing Problem". ACM Transactions on Evolutionary Learning and Optimization, pages 3821574. <https://doi.org/10.1145/3821574> The preprint is arXiv 2510.27353.
- **Hifi 2001.** Mhand Hifi. "Exact Algorithms for Large-Scale Unconstrained Two and Three Staged Cutting Problems". Computational Optimization and Applications 18(1):63-88. <https://doi.org/10.1023/A:1008743711658>
- **Hifi 2009.** Mhand Hifi, Rym M'Hallah. "A Literature Review on Circle and Sphere Packing Problems: Models and Methodologies". Advances in Operations Research 2009:1-22. <https://doi.org/10.1155/2009/150624>
- **Hill 2002.** Dwight Hill. "Method and system for high speed detailed placement of cells within an integrated circuit design". US patent 6,370,673 B1. <https://patents.google.com/patent/US6370673> The name "Tetris" for this method is unverified.
- **Hong 2000.** Xianlong Hong, Gang Huang, Yici Cai, Jiangchun Gu, Sheqin Dong, Chung-Kuan Cheng, Jun Gu. "Corner block list: an effective and efficient topological representation of non-slicing floorplan". ICCAD 2000, pages 8-12. <https://doi.org/10.1109/ICCAD.2000.896442>
- **Hopper 2001.** E. Hopper, B. C. H. Turton. "An empirical investigation of meta-heuristic and heuristic algorithms for a 2D packing problem". European Journal of Operational Research 128(1):34-57. <https://doi.org/10.1016/S0377-2217(99)00357-4>
- **Hopper 2002.** E. Hopper, B. C. H. Turton. "Problem Generators for Rectangular Packing Problems". Studia Informatica Universalis 2(1):123-136. The record is unverified, and we found no DOI.
- **Hu 2017.** Haoyuan Hu, Xiaodong Zhang, Xiaowei Yan, Longfei Wang, Yinghui Xu. "Solving a New 3D Bin Packing Problem with Deep Reinforcement Learning Method". arXiv:1708.05930. <https://arxiv.org/abs/1708.05930>
- **Huang 1999.** Wenqi Huang, Ruchu Xu. "Two personification strategies for solving circles packing problem". Science in China Series E: Technological Sciences 42(6):595-602. <https://doi.org/10.1007/BF02916995>
- **Huang 2006.** Wen Qi Huang, Yu Li, Chu Min Li, Ru Chu Xu. "New heuristics for packing unequal circles into a circular container". Computers and Operations Research 33(8):2125-2142. <https://doi.org/10.1016/j.cor.2005.01.003>
- **Huang 2007.** Wenqi Huang, Duanbing Chen, Ruchu Xu. "A new heuristic algorithm for rectangle packing". Computers and Operations Research 34(11):3270-3280. <https://doi.org/10.1016/j.cor.2005.12.005>
- **Huang 2009.** Eric Huang, Richard E. Korf. "New improvements in optimal rectangle packing". IJCAI 2009, pages 511-516. <https://ijcai.org/Abstract/09/092>
- **Huang 2010.** Eric Huang, Richard E. Korf. "Optimal rectangle packing on non-square benchmarks". AAAI 2010, pages 83-88. <https://ojs.aaai.org/index.php/AAAI/article/view/7538>
- **Huang 2011.** Eric Huang, Richard E. Korf. "Optimal packing of high-precision rectangles". AAAI 2011, pages 42-47. <https://doi.org/10.1609/aaai.v25i1.7814>
- **Huang 2011b.** WenQi Huang, Tao Ye. "Quasi-physical global optimization method for solving the equal circle packing problem". Science China Information Sciences 54(7):1333-1339. <https://doi.org/10.1007/s11432-011-4270-3>
- **Huang 2013.** Eric Huang, Richard E. Korf. "Optimal rectangle packing: an absolute placement approach". Journal of Artificial Intelligence Research 46:47-87. <https://doi.org/10.1613/jair.3735>
- **Huq 2025.** Syed Mahbubul Huq, Daniel Brito, Daniel Sikar, Chris Child, Tillman Weyde, Rajesh Mojumder. "Evaluating LLMs for Combinatorial Optimization: One-Phase and Two-Phase Heuristics for 2D Bin-Packing". arXiv:2509.22255. <https://arxiv.org/abs/2509.22255>
- **Imahori 2003.** S. Imahori, M. Yagiura, T. Ibaraki. "Local search algorithms for the rectangle packing problem with general spatial costs". "Mathematical Programming" 97(3):543-569. <https://doi.org/10.1007/s10107-003-0427-1>
- **Imahori 2010.** Shinji Imahori, Mutsunori Yagiura. "The best-fit heuristic for the rectangular strip packing problem: an efficient implementation and the worst-case approximation ratio". Computers and Operations Research 37(2):325-333. <https://doi.org/10.1016/j.cor.2009.05.008>
- **Imamichi 2009.** Takashi Imamichi, Mutsunori Yagiura, Hiroshi Nagamochi. "An iterated local search algorithm based on nonlinear programming for the irregular strip packing problem". Discrete Optimization 6(4):345-361. <https://doi.org/10.1016/j.disopt.2009.04.002>
- **Iori 2003.** Manuel Iori, Silvano Martello, Michele Monaci. "Metaheuristic algorithms for the strip packing problem". In "Optimization and Industry: New Frontiers", Kluwer, pages 159-179. <https://doi.org/10.1007/978-1-4613-0233-9_7>
- **Iori 2021.** Manuel Iori, Vinícius L. de Lima, Silvano Martello, Flávio K. Miyazawa, Michele Monaci. "Exact solution techniques for two-dimensional cutting and packing". European Journal of Operational Research 289(2):399-415. <https://doi.org/10.1016/j.ejor.2020.06.050>
- **Iori 2022.** Manuel Iori, Vinícius Loti de Lima, Silvano Martello, Michele Monaci. "2DPackLib: a two-dimensional cutting and packing library". Optimization Letters 16(2):471-480. <https://doi.org/10.1007/s11590-021-01808-y>
- **Jacobs 2003.** Charles Jacobs, Wilmot Li, Evan Schrier, David Bargeron, David Salesin. "Adaptive grid-based document layout". ACM Transactions on Graphics 22(3):838-847. <https://research.adobe.com/publication/adaptive-grid-based-document-layout>
- **Jakobs 1996.** Stefan Jakobs. "On genetic algorithms for the packing of polygons". European Journal of Operational Research 88(1):165-181. <https://doi.org/10.1016/0377-2217(94)00166-9>
- **Johnson 1991.** Brian Johnson, Ben Shneiderman. "Tree-maps: a space-filling approach to the visualization of hierarchical information structures". IEEE Visualization 1991. <https://www.cs.umd.edu/~ben/papers/Johnson1991Tree.pdf>
- **Jylänki 2010.** Jukka Jylänki. "A thousand ways to pack the bin: a practical approach to two-dimensional rectangle bin packing". A report with code, and the year is unverified. The code has each rule of this catalog with the key Jylänki 2010. <https://github.com/juj/RectangleBinPack>
- **Kaleta 2025.** Mariusz Kaleta, Waldemar Kołodziejczyk, Izabela Zoltowska. "Transformer-based placement heuristic for online 2D strip packing problem". Computers and Industrial Engineering 210:111464. <https://doi.org/10.1016/j.cie.2025.111464>
- **Kaleta 2026.** Mariusz Kaleta, Tomasz Śliwiński. "Improving neural-based heuristics for 2D strip packing through local search in heuristic space". Neural Computing and Applications 38(9):337. <https://doi.org/10.1007/s00521-026-12013-2> The rule of the table comes from a summary, not from the paper, and is unverified.
- **Karmarkar 1982.** Narendra Karmarkar, Richard M. Karp. "The differencing method of set partitioning". University of California, Berkeley, report UCB/CSD 82/113. The number and the year are unverified. <https://www2.eecs.berkeley.edu/Pubs/TechRpts/1983/6353.html>
- **Kenmochi 2009.** Mitsutoshi Kenmochi, Takashi Imamichi, Koji Nonobe, Mutsunori Yagiura, Hiroshi Nagamochi. "Exact algorithms for the two-dimensional strip packing problem with and without rotations". European Journal of Operational Research 198(1):73-83. <https://doi.org/10.1016/j.ejor.2008.08.020>
- **Kenyon 2000.** Claire Kenyon, Eric Rémila. "A near-optimal solution to a two-dimensional cutting stock problem". Mathematics of Operations Research 25(4):645-656. <https://doi.org/10.1287/moor.25.4.645.12118>
- **Kirkpatrick 1983.** Scott Kirkpatrick, C. Daniel Gelatt Jr., Mario P. Vecchi. "Optimization by simulated annealing". Science 220(4598):671-680. <https://doi.org/10.1126/science.220.4598.671>
- **Klau 1999.** Gunnar W. Klau, Petra Mutzel. "Optimal compaction of orthogonal grid drawings". IPCO 1999, LNCS 1610. <https://doi.org/10.1007/3-540-48777-8_23>
- **Knuth 1981.** Donald E. Knuth, Michael F. Plass. "Breaking paragraphs into lines". Software: Practice and Experience 11(11):1119-1184. <https://doi.org/10.1002/spe.4380111102>
- **Kool 2019.** Wouter Kool, Herke van Hoof, Max Welling. "Attention, Learn to Solve Routing Problems!". ICLR 2019. <https://arxiv.org/abs/1803.08475>
- **Korf 2003.** Richard E. Korf. "Optimal rectangle packing: initial results". ICAPS 2003, pages 287-295. We found no DOI and no stable URL.
- **Korf 2004.** Richard E. Korf. "Optimal rectangle packing: new results". ICAPS 2004. <https://icaps04.icaps-conference.org/icapspapers/ICAPS04KorfR.pdf>
- **Korf 2010.** Richard E. Korf, Michael D. Moffitt, Martha E. Pollack. "Optimal rectangle packing". Annals of Operations Research 179(1):261-295. <https://doi.org/10.1007/s10479-008-0463-6>
- **Kubach 2009.** T. Kubach, A. Bortfeldt, H. Gehring. "Parallel greedy algorithms for packing unequal circles into a strip or a rectangle". Central European Journal of Operations Research 17(4):461-477. <https://doi.org/10.1007/s10100-009-0103-5>
- **Kumar 2026.** Yogesh Kumar, Kusum Deep. "A systematic review of the circle and sphere packing problems: Models, methods, and applications". Computer Science Review 62:101042. <https://doi.org/10.1016/j.cosrev.2026.101042>
- **Lai 2022.** Xiangjing Lai, Jin-Kao Hao, Dong Yue, Zhipeng Lü, Zhang-Hua Fu. "Iterated dynamic thresholding search for packing equal circles into a circular container". European Journal of Operational Research 299(1):137-153. <https://doi.org/10.1016/j.ejor.2021.08.044>
- **Lai 2025.** Xiangjing Lai, Jin-Kao Hao, Dong Yue, Yangming Zhou. "A heuristic algorithm with multi-scale perturbations for point arrangement and equal circle packing in a convex container". Computers and Operations Research 181:107099. <https://doi.org/10.1016/j.cor.2025.107099>
- **Lallier 2024.** Corentin Lallier, Guillaume Blin, Bruno Pinaud, Laurent Vézard. "Graph neural network comparison for 2D nesting efficiency estimation". Journal of Intelligent Manufacturing 35(2):859-873. <https://doi.org/10.1007/s10845-023-02084-6>
- **Lange 2025.** Robert Tjarko Lange, Yuki Imajuku, Edoardo Cetin. "ShinkaEvolve: Towards Open-Ended And Sample-Efficient Program Evolution". arXiv:2509.19349. <https://arxiv.org/abs/2509.19349> The size and the value of its circle packing are unverified.
- **Lastra-Díaz 2024.** Juan J. Lastra-Díaz, M. Teresa Ortuño. "Mixed-integer programming models for irregular strip packing based on vertical slices and feasibility cuts". European Journal of Operational Research 313(1):69-91. <https://doi.org/10.1016/j.ejor.2023.08.009>
- **Leao 2020.** Aline A.S. Leao, Franklina M.B. Toledo, José Fernando Oliveira, Maria Antónia Carravilla, Ramón Alvarez-Valdés. "Irregular packing problems: A review of mathematical models". European Journal of Operational Research 282(3):803-822. <https://doi.org/10.1016/j.ejor.2019.04.045>
- **Lehuger 2026.** Auguste Lehuger, Guillaume Henon-Just. "Geometry-Aware Reinforcement Learning for 2D Irregular Nesting". arXiv:2606.10611. <https://arxiv.org/abs/2606.10611>
- **Lengauer 1990.** Thomas Lengauer. "Combinatorial algorithms for integrated circuit layout". Wiley and Teubner, a book. <https://doi.org/10.1007/978-3-322-92106-2>
- **Leung 2011.** Stephen C. H. Leung, Defu Zhang, Kwang Mong Sim. "A two-stage intelligent search algorithm for the two-dimensional strip packing problem". European Journal of Operational Research 215(1):57-69. <https://doi.org/10.1016/j.ejor.2011.06.002>
- **Leung 2011b.** Stephen C.H. Leung, Defu Zhang. "A fast layer-based heuristic for non-guillotine strip packing". Expert Systems with Applications 38(10):13032-13042. <https://doi.org/10.1016/j.eswa.2011.04.105>
- **Leung 2012.** Stephen C.H. Leung, Yangbin Lin, Defu Zhang. "Extended local search algorithm based on nonlinear programming for two-dimensional irregular strip packing problem". Computers and Operations Research 39(3):678-686. <https://doi.org/10.1016/j.cor.2011.05.025>
- **Li 2005.** Wanchun Li, Peter Eades, Nikola S. Nikolov. "Using spring algorithms to remove node overlapping". APVIS 2005, CRPIT 45, pages 131-140. <https://dblp.org/rec/conf/apvis/LiEN05.html>
- **Liao 1983.** Yuh-Zen Liao, C. K. Wong. "An algorithm to compact a VLSI symbolic layout with mixed constraints". IEEE Transactions on CAD 2(2):62-69. <https://doi.org/10.1109/TCAD.1983.1270022>
- **Lin 2001.** Jai-Ming Lin, Yao-Wen Chang. "TCG: a transitive closure graph-based representation for non-slicing floorplans". DAC 2001, pages 764-769. <https://doi.org/10.1109/DAC.2001.935608>
- **Lin 2019.** Yibo Lin, Shounak Dhar, Wuxi Li, Haoxing Ren, Brucek Khailany, David Z. Pan. "DREAMPlace". Proceedings of the 56th Annual Design Automation Conference 2019, pages 1-6. <https://doi.org/10.1145/3316781.3317803>
- **Lin 2021.** Yibo Lin, Zixuan Jiang, Jiaqi Gu, Wuxi Li, Shounak Dhar, Haoxing Ren, Brucek Khailany, David Z. Pan. "DREAMPlace: Deep Learning Toolkit-Enabled GPU Acceleration for Modern VLSI Placement". IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems 40(4):748-761. <https://doi.org/10.1109/tcad.2020.3003843>
- **Liu 1999.** Dequan Liu, Hongfei Teng. "An improved BL-algorithm for genetic algorithm of the orthogonal packing of rectangles". European Journal of Operational Research 112(2):413-420. <https://doi.org/10.1016/S0377-2217(97)00437-2>
- **Liu 2024a.** Fei Liu, Xialiang Tong, Mingxuan Yuan, Xi Lin, Fu Luo, Zhenkun Wang, Zhichao Lu, Qingfu Zhang. "Evolution of Heuristics: Towards Efficient Automatic Algorithm Design Using Large Language Model". ICML 2024, PMLR 235:32201-32223. <https://proceedings.mlr.press/v235/liu24bs.html>
- **Liu 2024b.** Chang Liu, Kate Smith-Miles, Tony Wauters, Alysson M. Costa. "Instance space analysis for 2D bin packing mathematical models". European Journal of Operational Research 315(2):484-498. <https://doi.org/10.1016/j.ejor.2023.12.008>
- **Lodi 1999.** Andrea Lodi, Silvano Martello, Daniele Vigo. "Heuristic and metaheuristic approaches for a class of two-dimensional bin packing problems". "INFORMS Journal on Computing" 11(4):345-357. <https://doi.org/10.1287/ijoc.11.4.345>
- **Lodi 2002.** Andrea Lodi, Silvano Martello, Michele Monaci. "Two-dimensional packing problems: A survey". European Journal of Operational Research 141(2):241-252. <https://doi.org/10.1016/S0377-2217(02)00123-6>
- **Lodi 2003.** Andrea Lodi, Michele Monaci. "Integer linear programming models for 2-staged two-dimensional Knapsack problems". Mathematical Programming 94(2-3):257-278. <https://doi.org/10.1007/s10107-002-0319-9>
- **López 2011.** C.O. López, J.E. Beasley. "A heuristic for the circle packing problem with a variety of containers". European Journal of Operational Research 214(3):512-525. <https://doi.org/10.1016/j.ejor.2011.04.024>
- **López 2013.** C.O. López, J.E. Beasley. "Packing unequal circles using formulation space search". Computers and Operations Research 40(5):1276-1288. <https://doi.org/10.1016/j.cor.2012.11.022>
- **López-Camacho 2014.** Eunice López-Camacho, Hugo Terashima-Marin, Peter Ross, Gabriela Ochoa. "A unified hyper-heuristic framework for solving bin packing problems". Expert Systems with Applications 41(15):6876-6889. <https://doi.org/10.1016/j.eswa.2014.04.043>
- **Lu 2015.** Jingwei Lu, Pengwen Chen, Chin-Chih Chang, Lu Sha, Dennis Jen-Hsin Huang, Chin-Chi Teng, Chung-Kuan Cheng. "ePlace". ACM Transactions on Design Automation of Electronic Systems 20(2):1-34. <https://doi.org/10.1145/2699873>
- **Macedo 2010.** Rita Macedo, Cláudio Alves, J.M. Valério de Carvalho. "Arc-flow model for the two-dimensional guillotine cutting stock problem". Computers and Operations Research 37(6):991-1001. <https://doi.org/10.1016/j.cor.2009.08.005>
- **Marriott 2003.** Kim Marriott, Peter Stuckey, Vincent Tam, `Weiqing He`. "Removing node overlapping in graph layout using constrained optimization". Constraints 8(2):143-171. <https://doi.org/10.1023/A:1022371615202>
- **Martello 1998.** Silvano Martello, Daniele Vigo. "Exact solution of the two-dimensional finite bin packing problem". Management Science 44(3):388-399. <https://doi.org/10.1287/mnsc.44.3.388>
- **Martello 2000.** Silvano Martello, David Pisinger, Daniele Vigo. "The three-dimensional bin packing problem". Operations Research 48(2):256-267. <https://doi.org/10.1287/opre.48.2.256.12386>
- **Martello 2003.** Silvano Martello, Michele Monaci, Daniele Vigo. "An exact approach to the strip-packing problem". "INFORMS Journal on Computing" 15(3):310-319. <https://doi.org/10.1287/ijoc.15.3.310.16082>
- **Matoušek 1996.** J. Matousek, M. Sharir, E. Welzl. "A Subexponential Bound for Linear Programming". Algorithmica 16(4-5):498-516. <https://doi.org/10.1007/s004539900062>
- **Misue 1995.** Kazuo Misue, Peter Eades, Wei Lai, Kozo Sugiyama. "Layout adjustment and the mental map". Journal of Visual Languages and Computing 6(2):183-210. The DOI is unverified.
- **Moffitt 2006.** Michael D. Moffitt, Martha E. Pollack. "Optimal rectangle packing: a meta-CSP approach". ICAPS 2006. Unverified: only reference lists name it.
- **Monaci 2006.** Michele Monaci, Paolo Toth. "A Set-Covering-Based Heuristic Approach for Bin-Packing Problems". INFORMS Journal on Computing 18(1):71-85. <https://doi.org/10.1287/ijoc.1040.0089>
- **Mundim 2017.** Leandro R. Mundim, Marina Andretta, Thiago Alves de Queiroz. "A biased random key genetic algorithm for open dimension nesting problems using no-fit raster". Expert Systems with Applications 81:358-371. <https://doi.org/10.1016/j.eswa.2017.03.059>
- **Murata 1996.** H. Murata, K. Fujiyoshi, S. Nakatake, Y. Kajitani. "VLSI module placement based on rectangle-packing by the sequence-pair". IEEE Transactions on CAD 15(12):1518-1524. <https://doi.org/10.1109/43.552084>
- **Nachmanson 2016.** Lev Nachmanson, Arlind Nocaj, Sergey Bereg, Leishi Zhang, Alexander Holroyd. "Node overlap removal by growing a tree". "Graph Drawing" 2016, LNCS 9801, pages 33-43. <https://doi.org/10.1007/978-3-319-50106-2_3>
- **Nakatake 1996.** S. Nakatake, K. Fujiyoshi, H. Murata, Y. Kajitani. "Module placement on BSG-structure and IC layout applications". ICCAD 1996, pages 484-491. <https://doi.org/10.1109/ICCAD.1996.569870>
- **Neuenfeldt 2023.** Alvaro Neuenfeldt Júnior, Julio Siluk, Matheus Francescatto, Gabriel Stieler, David Disconzi. "A framework to select heuristics for the rectangular two-dimensional strip packing problem". Expert Systems with Applications 213:119202. <https://doi.org/10.1016/j.eswa.2022.119202>
- **Nocaj 2012.** Arlind Nocaj, Ulrik Brandes. "Computing Voronoi treemaps: faster, simpler, and resolution-independent". Computer Graphics Forum 31(3):855-864. <https://doi.org/10.1111/j.1467-8659.2012.03078.x>
- **Novikov 2025.** Alexander Novikov, Ngân Vũ, Marvin Eisenberger and 15 others. "AlphaEvolve: A coding agent for scientific and algorithmic discovery". arXiv:2506.13131. <https://doi.org/10.48550/arXiv.2506.13131>
- **Ntene 2009.** N. Ntene, J. H. van Vuuren. "A survey and comparison of guillotine heuristics for the 2D oriented offline strip packing problem". Discrete Optimization 6(2):174-188. <https://doi.org/10.1016/j.disopt.2008.11.002>
- **Oliveira 2000.** José F. Oliveira, A. Miguel Gomes, J. Soeiro Ferreira. "TOPOS – A new constructive algorithm for nesting problems". OR Spektrum 22(2):263. <https://doi.org/10.1007/s002910050105>
- **Oliveira 2016.** José Fernando Oliveira, Alvaro Neuenfeldt Júnior, Elsa Silva, Maria Antónia Carravilla. "A SURVEY ON HEURISTICS FOR THE TWO-DIMENSIONAL RECTANGULAR STRIP PACKING PROBLEM". Pesquisa Operacional 36(2):197-226. <https://doi.org/10.1590/0101-7438.2016.036.02.0197>
- **Ortmann 2010.** Frank G. Ortmann, Nthabiseng Ntene, Jan H. van Vuuren. "New and improved level heuristics for the rectangular strip packing and variable-sized bin packing problems". European Journal of Operational Research 203(2):306-315. <https://doi.org/10.1016/j.ejor.2009.07.024>
- **Özcan 2013.** Ender Özcan, Zhang Kai, John H. Drake. "Bidirectional best-fit heuristic considering compound placement for two dimensional orthogonal rectangular strip packing". Expert Systems with Applications 40(10):4035-4043. <https://doi.org/10.1016/j.eswa.2013.01.005>
- **Parreño 2010.** F. Parreño, R. Alvarez-Valdes, J. F. Oliveira, J. M. Tamarit. "A hybrid GRASP/VND algorithm for two- and three-dimensional bin packing". Annals of Operations Research 179(1):203-220. <https://doi.org/10.1007/s10479-008-0449-4> Crossref gives the year 2008 of the online version.
- **Pisinger 2007.** David Pisinger, Mikkel Sigurd. "Using Decomposition Techniques and Constraint Programming for Solving the Two-Dimensional Bin-Packing Problem". INFORMS Journal on Computing 19(1):36-51. <https://doi.org/10.1287/ijoc.1060.0181>
- **Rakotonirainy 2020.** Rosephine G. Rakotonirainy, Jan H. van Vuuren. "Improved metaheuristics for the two-dimensional strip packing problem". Applied Soft Computing 92:106268. <https://doi.org/10.1016/j.asoc.2020.106268>
- **Rakotonirainy 2022.** Rosephine Georgina Rakotonirainy. "Towards a framework for predicting packing algorithm performance across instance space". ORiON 38(2). <https://orion.journals.ac.za/pub/article/view/741> The pages and the DOI are unverified.
- **Rodrigues 2017.** Marcos Okamura Rodrigues, Franklina M.B. Toledo. "A clique covering MIP model for the irregular strip packing problem". Computers and Operations Research 87:221-234. <https://doi.org/10.1016/j.cor.2016.11.006>
- **Romera-Paredes 2024.** Bernardino Romera-Paredes, Mohammadamin Barekatain, Alexander Novikov, Matej Balog, M. Pawan Kumar, Emilien Dupont, Francisco J. R. Ruiz, Jordan S. Ellenberg, Pengming Wang, Omar Fawzi, Pushmeet Kohli, Alhussein Fawzi. "Mathematical discoveries from program search with large language models". Nature 625(7995):468-475. <https://doi.org/10.1038/s41586-023-06924-6>
- **Sato 2019.** André Kubagawa Sato, Thiago Castro Martins, Antonio Miguel Gomes, Marcos Sales Guerra Tsuzuki. "Raster penetration map applied to the irregular packing problem". European Journal of Operational Research 279(2):657-671. <https://doi.org/10.1016/j.ejor.2019.06.008>
- **Scheibel 2018.** Willy Scheibel, Christopher Weyand, Jürgen Döllner. "EvoCells: a treemap layout algorithm for evolving tree data". IVAPP 2018, pages 273-280. <https://doi.org/10.5220/0006617102730280>
- **Schiermeyer 1994.** Ingo Schiermeyer. "Reverse-Fit: a 2-optimal algorithm for packing rectangles". ESA 1994, LNCS 855, pages 290-299. <https://doi.org/10.1007/BFb0049416>
- **Shneiderman 1992.** Ben Shneiderman. "Tree visualization with tree-maps: 2-d space-filling approach". ACM Transactions on Graphics 11(1):92-99. <https://doi.org/10.1145/102377.115768>
- **Shneiderman 2001.** Ben Shneiderman, Martin Wattenberg. "Ordered treemap layouts". IEEE InfoVis 2001. <https://doi.org/10.1109/INFVIS.2001.963283>
- **Sim 2025.** Kevin Sim, Quentin Renau, Emma Hart. "Beyond the Hype: Benchmarking LLM-Evolved Heuristics for Bin Packing". Lecture Notes in Computer Science, pages 386-402. <https://doi.org/10.1007/978-3-031-90065-5_24> The volume of the series is unverified.
- **Simonis 2008.** Helmut Simonis, Barry O'Sullivan. "Search strategies for rectangle packing". CP 2008, LNCS 5202, pages 52-66. <https://doi.org/10.1007/978-3-540-85958-1_4>
- **Simonis 2011.** Helmut Simonis, Barry O'Sullivan. "Almost square packing". CPAIOR 2011, LNCS 6697. <https://doi.org/10.1007/978-3-642-21311-3_19>
- **Skiena 2008.** Steven S. Skiena. "The algorithm design manual", second edition, Springer, a book with a section on the linear partition problem. The section number is unverified. <https://doi.org/10.1007/978-1-84800-070-4>
- **Sleator 1980.** Daniel D. K. D. B. Sleator. "A 2.5 times optimal algorithm for packing in two dimensions". Information Processing Letters 10(1):37-40. <https://doi.org/10.1016/0020-0190(80)90121-0>
- **Smith-Miles 2023.** Kate Smith-Miles, Mario Andrés Muñoz. "Instance Space Analysis for Algorithm Testing: Methodology and Software Tools". ACM Computing Surveys 55(12):1-31. <https://doi.org/10.1145/3572895>
- **Soh 2010.** Takehide Soh, Katsumi Inoue, Naoyuki Tamura, Mutsunori Banbara, Hidetomo Nabeshima. "A SAT-based method for solving the two-dimensional strip packing problem". Fundamenta Informaticae 102(3-4):467-487. <https://doi.org/10.3233/FI-2010-314>
- **Sondag 2018.** Max Sondag, Bettina Speckmann, Kevin Verbeek. "Stable treemaps via local moves". IEEE TVCG 24(1):729-738. <https://doi.org/10.1109/TVCG.2017.2745140>
- **Spindler 2008.** Peter Spindler, Ulf Schlichtmann, Frank M. Johannes. "Abacus". Proceedings of the 2008 international symposium on Physical design, pages 47-53. <https://doi.org/10.1145/1353629.1353640>
- **Steinberg 1997.** A. Steinberg. "A strip-packing algorithm with absolute performance bound 2". "SIAM Journal on Computing" 26(2):401-409. <https://doi.org/10.1137/S0097539793255801>
- **Stoyan 2004.** Yu.G Stoyan, G Yas'kov. "A mathematical model and a solution method for the problem of placing various-sized circles into a strip". European Journal of Operational Research 156(3):590-600. <https://doi.org/10.1016/S0377-2217(03)00137-1>
- **Stoyan 2015.** Yuriy Stoyan, Tatiana Romanova, Alexander Pankratov, Andrey Chugay. "Optimized Object Packings Using Quasi-Phi-Functions". Springer Optimization and Its Applications, pages 265-293. <https://doi.org/10.1007/978-3-319-18899-7_13> The volume of the series is unverified.
- **Stoyan 2016.** Yuriy Stoyan, Alexander Pankratov, Tatiana Romanova. "Cutting and packing problems for irregular objects with continuous rotations: mathematical modelling and non-linear optimization". Journal of the Operational Research Society 67(5):786-800. <https://doi.org/10.1057/jors.2015.94>
- **Tak 2013.** Susanne Tak, Andy Cockburn. "Enhanced spatial stability with Hilbert and Moore treemaps". IEEE TVCG 19(1):141-148. <https://doi.org/10.1109/TVCG.2012.108>
- **Terashima-Marín 2010.** H. Terashima-Marín, P. Ross, C. J. Farías-Zárate, E. López-Camacho, M. Valenzuela-Rendón. "Generalized hyper-heuristics for solving 2D Regular and Irregular Packing Problems". Annals of Operations Research 179(1):369-392. <https://doi.org/10.1007/s10479-008-0475-2>
- **Toledo 2013.** Franklina M.B. Toledo, Maria Antónia Carravilla, Cristina Ribeiro, José F. Oliveira, A. Miguel Gomes. "The Dotted-Board Model: A new MIP model for nesting irregular shapes". International Journal of Production Economics 145(2):478-487. <https://doi.org/10.1016/j.ijpe.2013.04.009>
- **Treitz 2013.** Johannes Treitz. "The algorithm for a perfectly balanced photo gallery". A blog post. Unverified: the page is gone, and only other projects cite it.
- **Tu 2007.** Ying Tu, Han-Wei Shen. "Visualizing changes of hierarchical data using treemaps". IEEE TVCG 13(6):1286-1293. The DOI is unverified.
- **Umetani 2009.** Shunji Umetani, Mutsunori Yagiura, Shinji Imahori, Takashi Imamichi, Koji Nonobe, Toshihide Ibaraki. "Solving the irregular strip packing problem via guided local search for overlap minimization". International Transactions in Operational Research 16(6):661-683. <https://doi.org/10.1111/j.1475-3995.2009.00707.x>
- **Vernier 2018.** Eduardo Faccin Vernier, João Luiz Dihl Comba, Alexandru C. Telea. "A stable greedy insertion treemap algorithm for software evolution visualization". SIBGRAPI 2018, pages 158-165. <https://webspace.science.uu.nl/~telea001/uploads/PAPERS/SIBGRAPI18/paper3.pdf>
- **Vernier 2020.** Eduardo Faccin Vernier, Max Sondag, João Luiz Dihl Comba, Bettina Speckmann, Alexandru Telea, Kevin Verbeek. "Quantitative comparison of time-dependent treemaps". Computer Graphics Forum 39(3):393-404. <https://doi.org/10.1111/cgf.13989>
- **Verstichel 2013.** Jannes Verstichel, Patrick De Causmaecker, Greet Vanden Berghe. "An improved best‐fit heuristic for the orthogonal strip packing problem". International Transactions in Operational Research 20(5):711-730. <https://doi.org/10.1111/itor.12030>
- **Viégas 2009.** Fernanda B. Viégas, Martin Wattenberg, Jonathan Feinberg. "Participatory visualization with Wordle". IEEE TVCG 15(6):1137-1144. <https://doi.org/10.1109/TVCG.2009.171>
- **Vinyals 2015.** Oriol Vinyals, Meire Fortunato, Navdeep Jaitly. "Pointer Networks". NeurIPS 2015, pages 2692-2700. <https://mlanthology.org/neurips/2015/vinyals2015neurips-pointer/>
- **Wang 2001.** Pearl Y. Wang, Christine L. Valenzela. "Data set generation for rectangular placement problems". European Journal of Operational Research 134(2):378-391. <https://doi.org/10.1016/S0377-2217(00)00263-0> Crossref gives the name of the second author as "Valenzela".
- **Wang 2002.** Huaiqing Wang, Wenqi Huang, Quan Zhang, Dongming Xu. "An improved algorithm for the packing of unequal circles within a larger containing circle". European Journal of Operational Research 141(2):440-453. <https://doi.org/10.1016/S0377-2217(01)00241-7>
- **Wang 2006.** Weixin Wang, Hui Wang, Guozhong Dai, Hongan Wang. "Visualization of large hierarchical data by circle packing". Proceedings of the SIGCHI Conference on Human Factors in Computing Systems, pages 517-520. <https://doi.org/10.1145/1124772.1124851>
- **Wang 2017.** Yingcong Wang, Renbin Xiao, Huimin Wang. "A flexible labour division approach to the polygon packing problem based on space allocation". International Journal of Production Research 55(11):3025-3045. <https://doi.org/10.1080/00207543.2016.1229070> Crossref gives the year 2016 of the online version.
- **Wäscher 2007.** Gerhard Wäscher, Heike Haußner, Holger Schumann. "An improved typology of cutting and packing problems". European Journal of Operational Research 183(3):1109-1130. <https://doi.org/10.1016/j.ejor.2005.12.047>
- **Wattenberg 2005.** Martin Wattenberg. "A note on space-filling visualizations and space-filling curves". IEEE InfoVis 2005. The DOI is unverified.
- **Wei 2009.** Lijun Wei, Defu Zhang, Qingshan Chen. "A least wasted first heuristic algorithm for the rectangular packing problem". Computers and Operations Research 36(5):1608-1614. <https://doi.org/10.1016/j.cor.2008.03.004>
- **Wei 2011.** Lijun Wei, Wee-Chong Oon, Wenbin Zhu, Andrew Lim. "A skyline heuristic for the 2D rectangular packing and strip packing problems". European Journal of Operational Research 215(2):337-346. <https://doi.org/10.1016/j.ejor.2011.06.022>
- **Wei 2013.** Lijun Wei, Wee-Chong Oon, Wenbin Zhu, Andrew Lim. "A goal-driven approach to the 2D bin packing and variable-sized bin packing problems". European Journal of Operational Research 224(1):110-121. <https://doi.org/10.1016/j.ejor.2012.08.005> The rule detail of the table is unverified.
- **Wei 2015.** Lijun Wei, Andrew Lim. "A bidirectional building approach for the 2D constrained guillotine knapsack packing problem". European Journal of Operational Research 242(1):63-71. <https://doi.org/10.1016/j.ejor.2014.10.004> The rule of `knapsack-bidirectional` is unverified.
- **Wei 2016.** Lijun Wei, Hu Qin, Brenda Cheang, Xianhao Xu. "An efficient intelligent search algorithm for the two-dimensional rectangular strip packing problem". International Transactions in Operational Research 23(1-2):65-92. <https://doi.org/10.1111/itor.12138>
- **Wei 2017.** Lijun Wei, Qian Hu, Stephen C.H. Leung, Ning Zhang. "An improved skyline based heuristic for the 2D strip packing problem and its efficient implementation". Computers and Operations Research 80:113-127. <https://doi.org/10.1016/j.cor.2016.11.024>
- **Welzl 1991.** Emo Welzl. "Smallest enclosing disks (balls and ellipsoids)". Lecture Notes in Computer Science, pages 359-370. <https://doi.org/10.1007/BFb0038202> The year and the volume 555 come from other records.
- **Wen 2025.** Yajie Wen, Defu Zhang. "A Beam Search Based Parallel Algorithm for the Two-Dimensional Strip Packing Problem". arXiv:2503.08711. <https://arxiv.org/abs/2503.08711> The address of its code is unverified.
- **Wong 1986.** D. F. Wong, C. L. Liu. "A new algorithm for floorplan design". DAC 1986, pages 101-107. <https://doi.org/10.1145/318013.318030>
- **Wood 2008.** Jo Wood, Jason Dykes. "Spatially ordered treemaps". IEEE TVCG 14(6):1348-1355. <https://doi.org/10.1109/TVCG.2008.165>
- **Wu 2002.** Yu-Liang Wu, Wenqi Huang, Siu-chung Lau, C. K. Wong, Gilbert H. Young. "An effective quasi-human based heuristic for solving the rectangle packing problem". European Journal of Operational Research 141(2):341-358. <https://doi.org/10.1016/S0377-2217(02)00129-7>
- **Xue 2023.** Tianyang Xue, Mingdong Wu, Lin Lu, Haoxuan Wang, Hao Dong, Baoquan Chen. "Learning Gradient Fields for Scalable and Generalizable Irregular Packing". arXiv:2310.19814. <https://arxiv.org/abs/2310.19814>
- **Yang 2013.** Shuangyuan Yang, Shuihua Han, Weiguo Ye. "A simple randomized algorithm for two-dimensional strip packing". Computers and Operations Research 40(1):1-8. <https://doi.org/10.1016/j.cor.2012.05.001>
- **Yang 2023.** Zeshi Yang, Zherong Pan, Manyi Li, Kui Wu, Xifeng Gao. "Learning Based 2D Irregular Shape Packing". ACM Transactions on Graphics 42(6):1-16. <https://doi.org/10.1145/3618348>
- **Ye 2024.** Haoran Ye, Jiarui Wang, Zhiguang Cao, Federico Berto, Chuanbo Hua, Haeyeon Kim, Jinkyoo Park, Guojie Song. "ReEvo: Large Language Models as Hyper-Heuristics with Reflective Evolution". Advances in Neural Information Processing Systems 37, pages 43571-43608. <https://doi.org/10.52202/079017-1381>
- **Zeng 2016.** Zhizhong Zeng, Xinguo Yu, Kun He, Wenqi Huang, Zhanghua Fu. "Iterated Tabu Search and Variable Neighborhood Descent for packing unequal circles into a circular container". European Journal of Operational Research 250(2):615-627. <https://doi.org/10.1016/j.ejor.2015.09.001>
- **Zhang 2006.** Defu Zhang, Yan Kang, Ansheng Deng. "A new heuristic recursive algorithm for the strip rectangular packing problem". Computers and Operations Research 33(8):2209-2217. <https://doi.org/10.1016/j.cor.2005.01.009>
- **Zhang 2013.** Defu Zhang, Lijun Wei, Stephen C. H. Leung, Qingshan Chen. "A Binary Search Heuristic Algorithm Based on Randomized Local Search for the Rectangular Strip-Packing Problem". INFORMS Journal on Computing 25(2):332-345. <https://doi.org/10.1287/ijoc.1120.0505>
- **Zhao 2021.** Hang Zhao, Qijin She, Chenyang Zhu, Yin Yang, Kai Xu. "Online 3D Bin Packing with Constrained Deep Reinforcement Learning". Proceedings of the AAAI Conference on Artificial Intelligence 35(1):741-749. <https://doi.org/10.1609/aaai.v35i1.16155>
- **Zhao 2022.** Hang Zhao, Yang Yu, Kai Xu. "Learning Efficient Online 3D Bin Packing on Packing Configuration Trees". ICLR 2022. <https://mlanthology.org/iclr/2022/zhao2022iclr-learning/>
- **Zhou 2023.** Jianrong Zhou, Kun He, Jiongzhi Zheng, Chu-Min Li. "Geometric Batch Optimization for the Packing Equal Circles in a Circle Problem on Large Scale". arXiv:2303.02650. <https://arxiv.org/abs/2303.02650>
- **Zhou 2025.** Jianrong Zhou, Jiyao He, Kun He. "Solution-hashing search based on layout-graph transformation for unequal circle packing". European Journal of Operational Research 327(1):58-83. <https://doi.org/10.1016/j.ejor.2025.05.003>

### Software and standards

- **Agafonkin, software.** `potpack`, by Mapbox. Its start width is the square root of the total area divided by 0.95, and not less than the widest box. <https://github.com/mapbox/potpack>
- **Barrett, software.** `stb_rect_pack.h`, a skyline bottom-left packer. <https://github.com/nothings/stb/blob/master/stb_rect_pack.h>
- **DeSandro, software.** Masonry, a library for grid layouts in columns. <https://masonry.desandro.com/>
- **Flickr, software.** `justified-layout`, a greedy packer of justified rows. <https://github.com/flickr/justified-layout>
- **react-grid-layout, software.** A grid of draggable boxes with vertical compaction. <https://github.com/react-grid-layout/react-grid-layout>
- **gridstack.js, software.** A grid of draggable boxes for dashboards. <https://github.com/gridstack/gridstack.js>
- **OR-Tools, software.** Google OR-Tools. Its solver CP-SAT has the constraint `NoOverlap2D` for rectangles. The license is Apache-2.0. <https://github.com/google/or-tools>
- **d3-hierarchy, software.** Mike Bostock. `packSiblings` uses the front chain of Wang 2006, and `packEnclose` uses Matoušek 1996. The license is ISC. <https://github.com/d3/d3-hierarchy>
- **SVGnest, software.** A nesting tool in the browser: no-fit polygons by orbiting and a genetic algorithm over the order and the rotation. The license is MIT. <https://github.com/Jack000/SVGnest>
- **Deepnest, software.** A fork of SVGnest. The file `deepnest.js` has a GPLv3 header, and the repository has no license file at the top. Treat it as GPLv3. <https://github.com/Jack000/Deepnest>
- **jagua-rs, software.** Jeroen Gardeyn. The collision engine of Gardeyn 2026, in Rust. The license is MPL-2.0. <https://github.com/JeroenGar/jagua-rs>
- **Sparrow, software.** Jeroen Gardeyn. The nesting heuristic of Gardeyn 2025, in Rust, with the instances in JSON. The license is MIT. <https://github.com/JeroenGar/sparrow>
- **PackingSolver, software.** Florian Fontan. A solver for many packing problems, with a tree search. The license is MIT. <https://github.com/fontanf/packingsolver>
- **ESICUP datasets, data.** The data sets of the EURO working group on cutting and packing, rectangles and irregular shapes. The license is CC0-1.0, and each set asks for a citation of its paper. <https://github.com/ESICUP/datasets>
- **2DPackLib, data.** More than 3000 rectangle instances in 25 sets, in one text format. The page states no license, and it asks for a citation of Iori 2022. <https://site.unibo.it/operations-research/en/research/2dpacklib>
- **OR-Library, data.** J. E. Beasley. Test problems with the sets `ngcut`, `gcut`, `cgcut` and `strip1` (Hopper 2001). The page states that the MIT license applies. <http://people.brunel.ac.uk/~mastjjb/jeb/orlib/>
- **OR-Datasets, data.** Óscar Oliveira. Converted copies of many sets, with generators. The repository has the MIT label, and its folders state no other license. <https://github.com/Oscar-Oliveira/OR-Datasets>
- **Nottingham strip packing page, data.** A list of strip packing sets with their best heights. It has no download and states no license. <https://people.cs.nott.ac.uk/pszeo/research/SPP/>
- **Packomania, data.** Eckard Specht. The best known packings of circles in many containers, with the coordinates. The site states no license. <http://www.packomania.com/>
- **W3C flexbox.** "CSS Flexible Box Layout Module Level 1". <https://www.w3.org/TR/css-flexbox-1/>
- **W3C grid.** "CSS Grid Layout Module Level 1". <https://www.w3.org/TR/css-grid-1/>
- **W3C grid level 3 draft.** "CSS Grid Layout Module Level 3", a working draft of 2026. <https://www.w3.org/TR/css-grid-3/>
- **W3C multi-column.** "CSS Multi-column Layout Module Level 1". <https://www.w3.org/TR/css-multicol-1/>
