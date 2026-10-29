| k117 | A work budget for composites: count placements, not milliseconds, so each result is a pure function of the input and the config. Wall-clock stays an opt-in | core | done | k112 |
| k116 | Coverage that rises by design: active sampling where the held-out error is largest, and a model on input features, not family ids | measure | next | k112, k115 |
| k115 | Coverage by stratum: the sampled share for each strategy family and each portfolio size, with equal weight, next to the uniform number | measure | next | k112 |
# Roadmap

The status of each item of `@mark1russell7/packing`. A live tracker mirrors this file. Change both together.

Status: done, done, waiting, next, done.

| ID | Item | Area | Status | Needs |
|---|---|---|---|---|
| k0 | The repo from the template, with the history of `render-pack` | move | done | |
| k1 | The first publish of `@mark1russell7/packing` 0.1.0 | move | done | k0 |
| k2 | `render-pack` re-exports `@mark1russell7/packing` | move | done | k1 |
| k3 | The downstream app moves its imports to the new name | move | done | k1 |
| k4 | `npm deprecate` of `render-pack` | move | done | k2, k3 |
| k5 | Check the grid helpers of `splay`, the grid strategy of `ireko` and the guillotine cut of `highways` | audit | next | |
| k6 | The catalog: each published packing method and each new idea, with a source and a status | theory | done |  |
| k7 | One Packer interface for every strategy | core | done | k0, k18, k35 |
| k8 | An algebra of measures | theory | done | k6, k7 |
| k9 | The strategy zoo: each family of the catalog behind the interface | strategies | active | k21, k22, k23, k24, k25, k26, k27, k28, k29, k30, k31, k10 |
| k10 | An exact baseline for small inputs: branch and bound, and a constraint solver | strategies | later | k7 |
| k11 | Benchmarks in CI, with a prediction before each run | measure | done | k8, k9 |
| k12 | Stability: the movement when one item changes | measure | later | k8 |
| k13 | Speed and its scaling | measure | later | k11 |
| k14 | A live site with interactive examples (v1: a demo of the current strategies). The site rebuilds in CI on each merge to `main`, from the source and the committed results. Each page shows the release and the date of its data, and a list of the changes with dates. | site | active | k1 |
| k15 | The s38 checks: `conventions` and `api-report` in CI | move | done | k0 |
| k16 | The sort order `input` | strategies | done | |
| k17 | `packShelf`: rows in the input order around obstacles | strategies | done | k1 |
| k18 | The shared corpus and record format with highways (`layout-input/1`, `layout-record/1`) | measure | done |  |
| k19 | The corpus from first principles: a seeded generator for each dimension of the taxonomy | measure | done | k18, k35 |
| k20 | A selector: measure the choice of a strategy for each input. Part 1 is the portfolio report and `packPortfolio` ([#52](https://github.com/mark1russell7/packing/pull/52)). Part 2 is the per-cell portfolio and `pack-holdout-v1` ([#55](https://github.com/mark1russell7/packing/pull/55)). On new seeds, `portfolio-k2` has a fill regret of 0.009, against 0.021 for the best single strategy. | measure | done | k9, k11 |
| k21 | Shelf family: next fit, first fit and best fit by decreasing height, and the input order | strategies | done | k6, k7 |
| k22 | Skyline variants: bottom-left, minimum waste, with a waste map | strategies | done | k6, k7 |
| k23 | Guillotine: each rule to choose a free rectangle and to split it | strategies | done | k6, k7 |
| k24 | MaxRects: best short side, best long side, best area, bottom-left, contact point | strategies | done | k6, k7 |
| k25 | Bottom-left fill: Baker, Chazelle and the lowest-gap variants | strategies | later | k6, k7 |
| k26 | A search over orders: genetic, annealing and tabu search, with a seed | strategies | later | k6, k7 |
| k27 | Treemaps: squarified, slice and dice, strip, pivot, ordered and Voronoi | strategies | later | k6, k7 |
| k28 | Masonry and columns: shortest column, balanced columns and the CSS grid flow | strategies | later | k6, k7 |
| k29 | Methods that keep the reading order or the layout under change | strategies | later | k6, k7 |
| k30 | Online and incremental packing | strategies | later | k6, k7 |
| k31 | New ideas of our own | strategies | later | k6, k7 |
| k32 | Every result on the site, the losers too. Each item that ships a strategy, a result or a bench change commits a summary of its records, and the site shows it. Part 1 (#92): the pages `results/` and `whats-new/`, from the snapshots in `packages/site/data/`. | site | active | k11, k14 |
| k33 | Free width: `packFree` searches the width for a target aspect | core | done |  |
| k34 | The site: a fixed or free width, a target aspect and the chart of the search | site | done | k33 |
| k35 | The problem taxonomy: the dimensions of the problem and their values | theory | done |  |
| k36 | The catalog for each cell: nesting, circles, polygons, obstacles and holes | theory | later | k35, k6 |
| k37 | Containers of each shape: a convex polygon, any polygon, a circle or an ellipse, a region with holes | strategies | done | k7, k35 |
| k38 | Obstacles that move at a cost | strategies | later | k7, k35 |
| k39 | Items of other shapes: circles and polygons (nesting) | strategies | later | k7, k36 |
| k40 | The site: a picker for the container shape and the obstacles | site | later | k34, k37 |
| k41 | Pack-around: the split of the free space as a stage of its own | core | later | k7, k35 |
| k42 | The ways to split the free space: maximal empty rectangles, slabs, cuts at obstacle edges, cells, or one region with holes | strategies | later | k41, k36 |
| k43 | The ways to give items to the parts: greedy in reading order, assignment, and a flow that keeps the reading order | strategies | later | k41 |
| k44 | The measures of pack-around: fill of each part, slivers, order breaks across parts, stability when an obstacle moves | measure | later | k8, k41 |
| k45 | Inputs with a known best answer: perfect cuts that are shuffled, and the consecutive squares | measure | done | k19 |
| k46 | The published benchmark sets for strip packing and nesting | measure | done | k19 |
| k47 | Hard inputs: the known worst cases of each heuristic, and a search for inputs where one strategy loses most to another | measure | done | k19, k9 |
| k48 | Change sequences for stability: insert, delete, resize, reorder, move an obstacle | measure | later | k19 |
| k49 | Property fuzzing with shrinking: no overlap, inside the container, obstacles kept, deterministic | measure | later | k7 |
| k50 | The coverage of the corpus as a number: cells covered and pairwise coverage of the dimensions | measure | later | k19, k35 |
| k51 | Lower bounds, so each result shows its distance to the best | measure | done | k6 |
| k52 | Baselines with a known guarantee: Sleator, Reverse-Fit and Steinberg | strategies | later | k6, k7 |
| k53 | Overlap removal: PRISM, VPSC, force-scan and the orthogonal order | strategies | later | k6, k7 |
| k54 | Compaction: a constraint graph in one direction, mixed constraints and the exact form | strategies | later | k6, k7 |
| k55 | Component packing: polyominoes and the placement of the parts of a graph | strategies | later | k6, k7 |
| k56 | Labels and word clouds: greedy, annealing, four places, and the spiral | strategies | later | k6, k7 |
| k57 | The types of packing fit `@mark1russell7/layout-contract`, then packing uses them | core | done | k7 |
| k58 | Promotion: a winner of the catalog becomes the default or a rule of the selector, by the shared promotion rule. The first part is the win test of `docs/PROMOTION.md` on the records of two entries. | measure | active | k11, k20 |
| k59 | Screen guards: overflow measures with a forced bound, an exact container test, fill ranked without overflow, distinct strategies, activation | measure | done | k11, k37 |
| k60 | Overflow excess by area, and fill ranked on shared clean records | measure | done | k59 |
| k61 | DEFAULT-CANDIDATE: `portfolio-k2` and `maxrects-bl` against the default `rows`, each by the promotion rule. Screen 7 (run 40675490363): both fail. Both gain 12% fill and pass the median time, but fail the tails of area, aspect and order, and the time tail. `rows` stays the default. | measure | done | k58, k20 |
| k62 | `aspectFit(strategy, { targetAspect })`: for a free-size container, a portfolio of widths around the target aspect, kept by a key with the aspect in it. It wraps any strategy. In 0.2.12, opt-in. Screen on the new corpus `pack-free-v1` (run 40685309195): the 3 wraps lower the median aspect error, but fill 1.3% to 4.3% less than `rows` and fail the aspect tail and the time tail. `portfolio-area-rows-bl` has no input with a larger area than `rows`, but gains no fill. `rows` stays the default. | strategies | done | k20, k61 |
| k63 | `skyline` overlap in free curved and polygon containers: in a shaped space, a box wider than the cells of the skyline did not move the skyline up, thus the next such box went to the same place. Fixed in 0.2.10. | strategies | done | k37 |
| k64 | The time tail of `maxrects`: in a curved container, the check of each new part against all parts and free rectangles was most of the work. It now compares only parts on the same side of the box, without a sort, with the same outputs. | strategies | active | k58, k61 |
| k65 | A corpus with a margin and a gap axis. The screen corpora have no margin and no gap, but callers use them. Its manifest declares its properties. | measure | later | k62 |
| k66 | Where maxrects beats rows: a selector by cheap features (count, shape, spread) that runs maxrects only in its cells, so the other cells keep the time of rows. Part 2 is in: the opt-in strategy `select` with a table of 7 leaves, the split files and the test corpus `pack-select-v1`. It passed on `pack-select-v1` with the gain median at the limit, and it passed again on `pack-select-v2` (seeds 31 to 35). Since 0.2.15, `DEFAULT_STRATEGY` is `select`. Next: `pack()` with no strategy uses `select` for fixed sizes (0.3.0). | strategies | active | k61, k62 |
| k67 | The size search `log-sweep` is slow: a free size with 100 items takes about 390 ms with `rows` and with `select`. Profile it first, then make it faster with the same outputs. Step 2 shipped in 0.2.16: `rows` sorts once (#82), and the slow inputs take about 0.11 of their time. The slowest takes 58 ms. Step 3 shipped in 0.2.17: `rows` packs each width one time (#84). The slowest takes 3.7 ms. | core | done | k33 |
| k68 | The strategy space as data: export `packSpace` (strategy-space/1 of `layout-contract`, 5 stages) and `packConfig`. Each strategy of today is a named point with the same outputs. | strategies | done | k66 |
| k69 | A baseline arm in the same job of `bench.yml`, so each time ratio is paired and a drift of the runner cancels. `paired.yml` (#85) does it for two refs. | measure | later | k33 |
| k70 | Fit `SELECT_TABLE` again on two measures, the fill and the joint floor of `layout-contract`, with `verdict()`. The fit decides leaf 6: free size, a heavy tail and a shape that is not a rectangle. | strategies | next | k66 |
| k71 | A render check of the site in CI: headless Chromium opens each page at a phone width and a desktop width. It fails on a console error, a failed request or an empty `main`, and keeps the screenshots. Shipped in #94: 12 of 12 views pass. | site | done | k32 |
| k72 | A compare page: one input, each named strategy side by side, with its output and its measures. The demo offers each strategy of the registry and its options. A test fails when a list of the site differs from the code. | site | done | k32 |
| k73 | The inputs of the site come from the corpus generator: each family, with sliders for the seed, the count, the size spread, the aspect, the container and the obstacles. Compare and the demo take each generated input. | site | done | k72 |
| k74 | An analysis card for each strategy: its source, its complexity, its guarantee, its measured scaling exponent, and its response to each dimension and parameter (sweeps and Sobol indices). Part 1 (the cards from the code and the catalog) is active. Part 2 (the sweeps) waits for `packSpace`. | measure | active | k13, k68 |
| k75 | The shape of the items and of the container as a dimension of `packSpace` and of the contracts: rectangle, polygon, circle or free form. Only rectangles have strategies today. | core | done | k68 |
| k76 | A survey of each published method of packing, as ideas. Each method gets a row of the queue with its gain, its uncertainty and its cost. | theory | done | |
| k77 | A space between two given items, or one channel, set once. The input names the pair and its gap, and the placement keeps that gap. Today the gap comes from the margins of both boxes, so it doubles. The routing bench of `layout-contract` (L13) asks for it. | core | done | k65 |
| k78 | Random restarts around each strategy (idea R1 of the survey) | strategies | done | k6, k7 |
| k79 | Goal-driven ruin and recreate (idea R5 of the survey) | strategies | later | k6, k7 |
| k80 | Overlap minimization for rectangles (idea R6 of the survey) | strategies | later | k6, k7 |
| k81 | Binary search on the height (idea R10 of the survey) | strategies | later | k6, k7 |
| k82 | Legalization for stability (idea R11 of the survey) | strategies | later | k12 |
| k83 | Genetic programming of the score (idea R12 of the survey) | strategies | later | k6, k7 |
| k84 | Priority code that a language model evolves (idea R13 of the survey) | strategies | later | k6, k7 |
| k85 | Beam search (idea R14 of the survey) | strategies | later | k6, k7 |
| k86 | Global placement for large inputs (idea R16 of the survey) | strategies | later | k6, k7 |
| k87 | Dynamic reduction of the width (idea R17 of the survey) | strategies | later | k33 |
| k88 | Identical boxes in five blocks (idea R19 of the survey) | strategies | later | k6, k7 |
| k89 | A learned order (idea R20 of the survey) | strategies | later | k6, k7 |
| k90 | Circles by the maximum hole degree (idea S1 of the survey) | strategies | done | k75 |
| k91 | Shapes by their bounding boxes (idea S2 of the survey) | strategies | done | k75 |
| k92 | A raster no-fit for free forms (idea S3 of the survey) | strategies | later | k75 |
| k93 | Front chain and enclosing circle (idea S4 of the survey) | strategies | later | k75, k27 |
| k94 | Basin hopping for circles (idea S5 of the survey) | strategies | later | k75 |
| k95 | Bottom-left fill for polygons (idea S6 of the survey) | strategies | later | k75, k101 |
| k96 | Overlap minimization for polygons (idea S7 of the survey) | strategies | later | k75, k101 |
| k97 | Groups of pieces as near rectangles (idea S8 of the survey) | strategies | later | k75 |
| k98 | The ESICUP nesting sets (idea S9 of the survey) | measure | later | k75 |
| k99 | Phi-functions (idea S10 of the survey) | strategies | later | k75 |
| k100 | The best search for circles (idea S11 of the survey) | strategies | later | k75 |
| k101 | A collision engine (idea S12 of the survey) | core | later | k75 |
| k102 | No-fit polygons by Minkowski sums (idea S13 of the survey) | core | later | k75 |
| k103 | Packomania as a reference (idea S14 of the survey) | measure | later | k75 |
| k104 | Exact models for few polygons (idea S15 of the survey) | strategies | later | k75, k10 |
| k105 | Space coverage: the share of the space of strategies, options and input dimensions with a fitted model per measure and a held-out error | measure | done | k68, k75 |
| k106 | Input families from the literature: the 2D strip packing and bin packing benchmark sets, each with dimensions and ranges | corpus | done | k73 |
| k107 | Input families for the worst case: adversarial inputs and scaling ladders | corpus | done | k73 |
| k108 | The survey as data: every published method is a queue idea, with a new survey and hybrids when the queue holds less than a week of build slots | audit | done | k76 |
| k109 | Solved regions: an atlas of the regions of the space where a strategy is within a measured bound of a lower bound, or leads for 4 weeks | site | later | k51, k105 |
| k110 | Side anchors: an item fixed to a side of the container at a fraction or an offset, kept when the free size grows, with the hard rule anchor-kept | core | later | k6, k7 |
| k111 | Stability when an anchor moves: how far the other items move when one anchor or locked item moves (split from k44) | measure | done | k6, k7 |
| k112 | Whole-space coverage: configs drawn at random from `packSpace` and inputs from the ranges of the generators, a held-out share within tolerance with a Wilson interval, next to the bench grid | measure | done | k68, k105 |
| k113 | A hull for `bbox`: `pack.fill` goes above 1 on polygon outputs, because the measure reads the item boxes and `bbox` places the tight boxes of the shapes | measure | done | k91 |
| k114 | A hard break with obstacles and large knobs: no-overlap fails on `edge-cases` with case `touchObstacles`, margin near 30 and a gap, for a portfolio and a select config | core | done | k112 |

## The queue

The score of an item is its gain times its uncertainty, divided by its cost. Each factor is on a scale of 1 to 5. The gain is the expected change of the efficacy maps. The work takes the items in the order of the score. After its bench, an item records its measured gain next to its expected gain. Each month, the scores get a calibration from these pairs. Up to 3 build subagents run at one time, one family each, each with its prediction. The ideas of the survey (k76, `docs/research/SURVEY.md`) are the items k78 to k104, or a part of an older item.

| Rank | Item | Gain | Uncertainty | Cost | Score |
| --- | --- | --- | --- | --- | --- |
| 1 | k115 | 4 | 2 | 1 | 8.0 |
| 2 | k116 | 5 | 4 | 3 | 6.7 |
| 3 | k79 | 4 | 4 | 3 | 5.3 |
| 4 | k80 | 4 | 4 | 3 | 5.3 |
| 5 | k26 | 5 | 4 | 4 | 5.0 |
| 6 | k25 | 3 | 3 | 2 | 4.5 |
| 7 | k70 | 3 | 3 | 2 | 4.5 |
| 8 | k13 | 3 | 3 | 2 | 4.5 |
| 9 | k92 | 3 | 3 | 2 | 4.5 |
| 10 | k10 | 4 | 4 | 4 | 4.0 |
| 11 | k81 | 4 | 3 | 3 | 4.0 |
| 12 | k82 | 3 | 4 | 3 | 4.0 |
| 13 | k83 | 3 | 4 | 3 | 4.0 |
| 14 | k93 | 4 | 2 | 2 | 4.0 |
| 15 | k94 | 4 | 3 | 3 | 4.0 |
| 16 | k95 | 4 | 3 | 3 | 4.0 |
| 17 | k96 | 5 | 4 | 5 | 4.0 |
| 18 | k97 | 3 | 4 | 3 | 4.0 |
| 19 | k110 | 4 | 2 | 2 | 4.0 |
| 20 | k84 | 3 | 5 | 4 | 3.8 |
| 21 | k74 | 4 | 3 | 4 | 3.0 |
| 22 | k52 | 3 | 2 | 2 | 3.0 |
| 23 | k85 | 3 | 3 | 3 | 3.0 |
| 24 | k86 | 3 | 5 | 5 | 3.0 |
| 25 | k87 | 3 | 3 | 3 | 3.0 |
| 26 | k98 | 3 | 2 | 2 | 3.0 |
| 27 | k109 | 4 | 2 | 3 | 2.7 |
| 28 | k99 | 3 | 4 | 5 | 2.4 |
| 29 | k100 | 3 | 3 | 4 | 2.3 |
| 30 | k88 | 2 | 2 | 2 | 2.0 |
| 31 | k101 | 4 | 2 | 4 | 2.0 |
| 32 | k102 | 3 | 2 | 3 | 2.0 |
| 33 | k103 | 2 | 2 | 2 | 2.0 |
| 34 | k89 | 2 | 4 | 5 | 1.6 |
| 35 | k104 | 2 | 3 | 5 | 1.2 |

The items of the site (k71, k72, k73) and step A of k58 are P1 work outside the queue.

## Rules

- The repository is public. Use made-up data only.
- Benchmarks and timing runs go in CI, not on a local computer.
- Write each prediction before its benchmark run.
- One item of a strategy family is always active, next to each item of speed or of the default.
- A time ratio between two commits comes from one job: `paired.yml`, not two bench runs.
- The site follows the work. Each item that ships a strategy, a result or a bench change also changes the site.
- The strategy interface stays pure: items and their shapes in, placements out, the same result for the same seed. The design accepts shapes other than rectangles.
- Each benchmark run writes one JSON record: the strategy, the input set, the seed, each measure and the time.
