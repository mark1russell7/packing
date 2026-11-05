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
| k5 | Check the grid helpers of `splay`, the grid strategy of `ireko` and the guillotine cut of `highways`: none calls this library, see [`NEIGHBOURS.md`](research/NEIGHBOURS.md) | audit | done | |
| k6 | The catalog: each published packing method and each new idea, with a source and a status | theory | done |  |
| k7 | One Packer interface for every strategy | core | done | k0, k18, k35 |
| k8 | An algebra of measures | theory | done | k6, k7 |
| k9 | The strategy zoo: each family of the catalog behind the interface | strategies | active | k21, k22, k23, k24, k25, k26, k27, k28, k29, k30, k31, k10 |
| k10 | An exact baseline for small inputs: branch and bound, and a constraint solver | strategies | later | k7 |
| k11 | Benchmarks in CI, with a prediction before each run | measure | done | k8, k9 |
| k12 | Stability: the movement when one item changes | measure | later | k8 |
| k13 | Speed and its scaling: the time against n for each entry on `ladder.count`, with the fitted exponent and its interval. `bench/scaling.ts` reads the records of a CI run. Memory waits for a paired run of the ladder. | measure | active | k11 |
| k14 | A live site with interactive examples (v1: a demo of the current strategies). The site rebuilds in CI on each merge to `main`, from the source and the committed results. Each page shows the release and the date of its data, and a list of the changes with dates. | site | done | k1 |
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
| k26 | A search over orders: genetic, annealing and tabu search, with a seed | strategies | done | k6, k7 |
| k27 | Treemaps: squarified, slice and dice, strip, pivot, ordered and Voronoi | strategies | later | k6, k7 |
| k28 | Masonry and columns: shortest column, balanced columns and the CSS grid flow | strategies | later | k6, k7 |
| k29 | Methods that keep the reading order or the layout under change | strategies | active | k6, k7 |
| k30 | Online and incremental packing | strategies | active | k6, k7 |
| k31 | New ideas of our own | strategies | active | k6, k7 |
| k32 | Every result on the site, the losers too. Each item that ships a strategy, a result or a bench change commits a summary of its records, and the site shows it. Part 1 (#92): the pages `results/` and `whats-new/`, from the snapshots in `packages/site/data/`. | site | active | k11, k14 |
| k33 | Free width: `packFree` searches the width for a target aspect | core | done |  |
| k34 | The site: a fixed or free width, a target aspect and the chart of the search | site | done | k33 |
| k35 | The problem taxonomy: the dimensions of the problem and their values | theory | done |  |
| k36 | The catalog for each cell: nesting, circles, polygons, obstacles and holes | theory | later | k35, k6 |
| k37 | Containers of each shape: a convex polygon, any polygon, a circle or an ellipse, a region with holes | strategies | done | k7, k35 |
| k38 | Obstacles that move at a cost | strategies | later | k7, k35 |
| k39 | Items of other shapes: circles and polygons (nesting) | strategies | later | k7, k36 |
| k40 | The site: a picker for the container shape and the obstacles | site | done | k34, k37 |
| k41 | Pack-around: the split of the free space as a stage of its own | core | later | k7, k35 |
| k42 | The ways to split the free space: maximal empty rectangles, slabs, cuts at obstacle edges, cells, or one region with holes | strategies | later | k41, k36 |
| k43 | The ways to give items to the parts: greedy in reading order, assignment, and a flow that keeps the reading order | strategies | later | k41 |
| k44 | The measures of pack-around: fill of each part, slivers, order breaks across parts, stability when an obstacle moves | measure | later | k8, k41 |
| k45 | Inputs with a known best answer: perfect cuts that are shuffled, and the consecutive squares | measure | done | k19 |
| k46 | The published benchmark sets for strip packing and nesting | measure | done | k19 |
| k47 | Hard inputs: the known worst cases of each heuristic, and a search for inputs where one strategy loses most to another | measure | done | k19, k9 |
| k48 | Change sequences for stability: insert, delete, resize, reorder, move an obstacle | measure | active | k19 |
| k49 | Property fuzzing with shrinking: no overlap, inside the container, obstacles kept, deterministic | measure | later | k7 |
| k50 | The coverage of the corpus as a number: cells covered and pairwise coverage of the dimensions, shown on the site | measure | done | k19, k35 |
| k51 | Lower bounds, so each result shows its distance to the best | measure | done | k6 |
| k52 | Baselines with a known guarantee: Sleator, Reverse-Fit and Steinberg | strategies | active | k6, k7 |
| k53 | Overlap removal: PRISM, VPSC, force-scan and the orthogonal order | strategies | later | k6, k7 |
| k54 | Compaction: a constraint graph in one direction, mixed constraints and the exact form | strategies | later | k6, k7 |
| k55 | Component packing: polyominoes and the placement of the parts of a graph | strategies | later | k6, k7 |
| k56 | Labels and word clouds: greedy, annealing, four places, and the spiral | strategies | later | k6, k7 |
| k57 | The types of packing fit `@mark1russell7/layout-contract`, then packing uses them | core | done | k7 |
| k58 | Promotion: a winner of the catalog becomes the default or a rule of the selector, by the shared promotion rule. The first part is the win test of `docs/PROMOTION.md` on the records of two entries. | measure | done | k11, k20 |
| k59 | Screen guards: overflow measures with a forced bound, an exact container test, fill ranked without overflow, distinct strategies, activation | measure | done | k11, k37 |
| k60 | Overflow excess by area, and fill ranked on shared clean records | measure | done | k59 |
| k61 | DEFAULT-CANDIDATE: `portfolio-k2` and `maxrects-bl` against the default `rows`, each by the promotion rule. Screen 7 (run 40675490363): both fail. Both gain 12% fill and pass the median time, but fail the tails of area, aspect and order, and the time tail. `rows` stays the default. | measure | done | k58, k20 |
| k62 | `aspectFit(strategy, { targetAspect })`: for a free-size container, a portfolio of widths around the target aspect, kept by a key with the aspect in it. It wraps any strategy. In 0.2.12, opt-in. Screen on the new corpus `pack-free-v1` (run 40685309195): the 3 wraps lower the median aspect error, but fill 1.3% to 4.3% less than `rows` and fail the aspect tail and the time tail. `portfolio-area-rows-bl` has no input with a larger area than `rows`, but gains no fill. `rows` stays the default. | strategies | done | k20, k61 |
| k63 | `skyline` overlap in free curved and polygon containers: in a shaped space, a box wider than the cells of the skyline did not move the skyline up, thus the next such box went to the same place. Fixed in 0.2.10. | strategies | done | k37 |
| k64 | The time tail of `maxrects`: in a curved container, the check of each new part against all parts and free rectangles was most of the work. It now compares only parts on the same side of the box, without a sort, with the same outputs. | strategies | active | k58, k61 |
| k65 | A corpus with a margin and a gap axis. The screen corpora have no margin and no gap, but callers use them. Its manifest declares its properties. | measure | later | k62 |
| k66 | Where maxrects beats rows: a selector by cheap features (count, shape, spread) that runs maxrects only in its cells, so the other cells keep the time of rows. Part 2 is in: the opt-in strategy `select` with a table of 7 leaves, the split files and the test corpus `pack-select-v1`. It passed on `pack-select-v1` with the gain median at the limit, and it passed again on `pack-select-v2` (seeds 31 to 35). Since 0.2.15, `DEFAULT_STRATEGY` is `select`. Since 0.3.0, `pack()` with no strategy uses `select` for fixed sizes (step A, #167). | strategies | done | k61, k62 |
| k67 | The size search `log-sweep` is slow: a free size with 100 items takes about 390 ms with `rows` and with `select`. Profile it first, then make it faster with the same outputs. Step 2 shipped in 0.2.16: `rows` sorts once (#82), and the slow inputs take about 0.11 of their time. The slowest takes 58 ms. Step 3 shipped in 0.2.17: `rows` packs each width one time (#84). The slowest takes 3.7 ms. These are in-order times of one CI process (`docs/BENCH.md`, "Absolute times"). | core | done | k33 |
| k68 | The strategy space as data: export `packSpace` (strategy-space/1 of `layout-contract`, 5 stages) and `packConfig`. Each strategy of today is a named point with the same outputs. | strategies | done | k66 |
| k69 | A baseline arm in the same job of `bench.yml`, so each time ratio is paired and a drift of the runner cancels. `paired.yml` (#85) does it for two refs. | measure | later | k33 |
| k70 | Fit `SELECT_TABLE` again on two measures, the fill and the joint floor of `layout-contract`, with `verdict()`. The fit decides leaf 6: free size, a heavy tail and a shape that is not a rectangle. | strategies | done | k66 |
| k71 | A render check of the site in CI: headless Chromium opens each page at a phone width and a desktop width. It fails on a console error, a failed request or an empty `main`, and keeps the screenshots. Shipped in #94: 12 of 12 views pass. | site | done | k32 |
| k72 | A compare page: one input, each named strategy side by side, with its output and its measures. The demo offers each strategy of the registry and its options. A test fails when a list of the site differs from the code. | site | done | k32 |
| k73 | The inputs of the site come from the corpus generator: each family, with sliders for the seed, the count, the size spread, the aspect, the container and the obstacles. Compare and the demo take each generated input. | site | done | k72 |
| k74 | An analysis card for each strategy: its source, its complexity, its guarantee, its measured scaling exponent, and its response to each dimension and parameter (sweeps and Sobol indices). Part 1 (the cards from the code and the catalog) is active. Part 2 (the sweeps) waits for `packSpace`. | measure | active | k13, k68 |
| k75 | The shape of the items and of the container as a dimension of `packSpace` and of the contracts: rectangle, polygon, circle or free form. Only rectangles have strategies today. | core | done | k68 |
| k76 | A survey of each published method of packing, as ideas. Each method gets a row of the queue with its gain, its uncertainty and its cost. | theory | done | |
| k77 | A space between two given items, or one channel, set once. The input names the pair and its gap, and the placement keeps that gap. Today the gap comes from the margins of both boxes, so it doubles. The routing bench of `layout-contract` (L13) asks for it. | core | done | k65 |
| k78 | Random restarts around each strategy (idea R1 of the survey) | strategies | done | k6, k7 |
| k79 | Goal-driven ruin and recreate (idea R5 of the survey) | strategies | done | k6, k7 |
| k80 | Overlap minimization for rectangles (idea R6 of the survey) | strategies | done | k6, k7 |
| k81 | Binary search on the height (idea R10 of the survey) | strategies | later | k6, k7 |
| k82 | Legalization for stability (idea R11 of the survey) | strategies | active | k12 |
| k83 | Genetic programming of the score (idea R12 of the survey) | strategies | later | k6, k7 |
| k84 | Priority code that a language model evolves (idea R13 of the survey) | strategies | later | k6, k7 |
| k85 | Beam search (idea R14 of the survey) | strategies | active | k6, k7 |
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
| k97 | Groups of pieces as near rectangles (idea S8 of the survey): `packNearRects`, first slice, with no learned model | strategies | active | k75 |
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
| k109 | Solved regions: an atlas of the regions of the space where a strategy is within a measured bound of a lower bound, or leads for 4 weeks. The results page reads each region by the rule of `docs/BENCH.md`. | site | done | k51, k105 |
| k110 | Side anchors: an item fixed to a side of the container at a fraction or an offset, kept when the free size grows, with the hard rule anchor-kept. The first slice is `packSideAnchors`. The field and the rule of the contract are open. | core | active | k6, k7 |
| k111 | Stability when an anchor moves: how far the other items move when one anchor or locked item moves (split from k44) | measure | done | k6, k7 |
| k112 | Whole-space coverage: configs drawn at random from `packSpace` and inputs from the ranges of the generators, a held-out share within tolerance with a Wilson interval, next to the bench grid | measure | done | k68, k105 |
| k113 | A hull for `bbox`: `pack.fill` goes above 1 on polygon outputs, because the measure reads the item boxes and `bbox` places the tight boxes of the shapes | measure | done | k91 |
| k114 | A hard break with obstacles and large knobs: no-overlap fails on `edge-cases` with case `touchObstacles`, margin near 30 and a gap, for a portfolio and a select config | core | done | k112 |
| k115 | Coverage by stratum: the sampled share for each strategy family and each portfolio size, with equal weight, next to the uniform number | measure | done | k112 |
| k116 | Coverage that rises by design: active sampling where the held-out error is largest, and a model on input features, not family ids | measure | done | k112, k115 |
| k117 | A work budget for composites: count placements, not milliseconds, so each result is a pure function of the input and the config. Wall-clock stays an opt-in | core | done | k112 |
| k118 | Bounds that count margins and gaps, knobs relative to the item size, and a `pack.gap` of 1 or less on each sampled pair | measure | done | k51, k116 |
| k119 | A prior over all families: the family weights come from the union of the committed corpora, with the effective count next to each prior share | measure | done | k116 |
| k120 | A paired control for the active draw: each round also draws a uniform sample of the same size and time, scored on the same held-out pairs, with a paired test of the rise. The held-out sample runs in shards so all its pairs finish. Each share comes from 5 fold seeds as a mean and an SD, and a claim inside 2 SD is not a result | measure | done | k116, k119 |
| k121 | Determinism as a gate: the bench fails on a pair that is not deterministic and has no clock limit, a repeat test runs each entry in a shuffled order, and the source of the 2 bad pairs is found | measure | done | k116, k118 |
| k122 | The prior as a parameter: union, family-flat or tempered (union weights to a power in the space). The headline is family-flat, with union beside it and the effective count of each. The adversary family is its own stratum. The trend splits at each change of the strategy list. The first point on the new list comes 11-09 and the second 11-16 | measure | active | k119 |
| k123 | Balance and stability on each record: the gap spread, the offset of the slack centroid, the empty share per side, and the move under an input change and a seed change. Compare shows compact against spread as a front | measure | done | k118 |
| k124 | A relax pass after any packer: it spreads the slack evenly with no overlap, by constrained stress or by separation constraints. Since #175, the opt-in composite `relax` does it with the satisfy step of VPSC. | strategies | done | k123 |
| k125 | Packers by forces: boxes push each other and the container walls, with an overlap removal pass at the end | strategies | done | k123, k124 |
| k126 | The oracle gap of `select`: run both members and keep the best on the 250 fixed-size inputs of `pack-classes-v1`. It reports the gap, the share of the 29 fill losses against `rows` that it removes, and the times. Then it decides: a better chooser, the oracle within a time budget, or stop. Done 10-30 (run 41001611131): the gap is 0.0029 of fill (fold SD 0.0005), the oracle removes all 29 losses, and the 2-member `portfolio` costs 5.1 times `select`. By the rule set before the bench, the next step is a better chooser | measure | done | k66 |
| k127 | The fill oracle within a time budget: the 2 members of `select` with a key of `pack.fill` alone (`fillOf`), as the entry `portfolio-fill-rows-bl`, on the 250 fixed-size inputs of `pack-classes-v1`. It passes on 3 tests set before the bench: the time is at most 2.5 times `select` with the fold SD, the pick is the pick of the full measure, and the mean fill is within 1 fold SD of the strict oracle. Not shipped: test 1 failed. The time is 4.524 ± 0.107 times `select` over 5 fold seeds, and the limit is 2.5. A better chooser is a new item | measure | done | k126 |
| k128 | The shared time test of `docs/PROMOTION.md` on the paired ratio. The floor `timeFloorMs` 5 turns the ratio of each candidate under 5 ms into an absolute time, as in k66. The new test is the paired median ratio with a limit from 5 CI runs. The floor is only a noise check on the base. It comes before k127 promotes a strategy. | measure | done | k66 |
| k129 | A feature chooser for `select`: a decision table of depth 1 or 2 on 10 cheap features of the input, fit on 4 fold seeds and scored on the fifth. Done 11-02, not shipped. Out of the fold, the fill gain over `select` is -0.0002 to -0.0016, and the oracle gap is 0.0029 ± 0.0004. The result is only for these 10 features and these depths: count, spread, demand, the largest item share, the aspect SD, the container aspect, the largest width and height shares, and the width and height SD | strategies | done | k126 |
| k130 | The portfolio costs about the sum of its members. A profile finds the cost of the wrapper, and the fix goes in `portfolio` itself. A CI gate `k130-time` in CI OK: the portfolio takes at most 1.4624 times the sum of its members (worst of 5 CI runs plus the spread). It took 1.31 to 1.37 times in 4 runs. The packs do not change. The tests 1 to 3 of k127 apply to `portfolio-fill-rows-bl`. The default stays `select`, except when the bench puts the portfolio on the front of fill and time | strategies | done | k127 |
| k131 | A graph order of the items, for layout-stack L47. The option `links` of `pack` is a weighted list of the links between the items. The order `graph-bfs` goes breadth-first from the hub of each component. The input `links` of the contract (layout-contract 0.3.1) and the bench entries follow. Without links, the layouts do not change | strategies | active | k9 |
| k132 | A package that a bundler can shake: `"sideEffects": false`, one subpath export for each strategy (for example `@mark1russell7/packing/maxrects`), and no registry that the module builds at load. A small consumer then pays only for the strategy that it imports. With `layout-contract` 0.3.3, the `maxrects` subpath is 11176 bytes gzip (17981 with 0.3.2). The CI job `size-gate` measures each export against `bench/gates/size.json` (`node bench/main.ts size-gate`) | core | done | |
| k133 | The time row of the win test on rigor-bench. `bench/time-budget.ts` takes the pooled verdict and the time tail of `@mark1russell7/rigor-bench`, and keeps no verdict logic of its own. The settings table gets `timeMargin`, `noiseCap` and the counts of the jobs, cases and rounds. | bench | done | |
| k134 | No import cycles of `registry.ts` with `bbox.ts`, `select.ts` and `portfolio.ts`. The npm build of the root import then splits by module, so a bundler drops the strategies that a consumer does not import. Today the root import with only `maxrects` is 72 kB gzip | core | later | k132 |
| k135 | The point of each strategy in `packSpace`, for layout-stack L34. `configOfStrategy(id, options)` gives the canonical config of a strategy of the registry with its options, or the reason that it has none. The param `table` of `select` gains the value `pack`, and the named config `pack` is the choice of `pack` without a strategy (`PACK_DEFAULT_TABLE`). | core | done | k68 |
| k136 | The rule `wire` of `maxrects`, for layout-stack L12. The rule places a box near its placed linked boxes, with a cost for height. | strategies | done | k131 |
| k137 | A link pull after a pack. The option `pull` of `relax` moves each linked box along its free space toward its balance point. The boxes make no new overlap and stay in the container. The option `relax-pull` of `combine` holds it in `packSpace`. | core | done | k124, k131 |
| k138 | The fallback of `force` and `relax` to their member is a typed field of the output. A host can then tell its user which strategy gave the layout. Today the fallback is only the trace measures `force.fallback` and `relax.fallback`. | core | later | |
| k139 | `overflow` tells why each item has no place: too large for the container, or no free place. `pack()` with only `fixedWidth` also tells of a rectangle wider than that width. Today a too-large item is in `overflow`, with no reason. | core | later | |
| k140 | One list of every strategy: `allStrategies` gives the kind and the supports of each strategy, so a consumer cannot miss a list of the registry | core | done | |
| k141 | Each standalone layout function is a strategy: `sleator`, `beam`, `exact-strip`, `binary-height`, `near-rects`, `raster-nofit`, `masonry`, `treemap` and `side-anchors` are in `allStrategies`, the bench and the sites. A test fails on a new layout function that is not on the list | core | done | |
| k142 | Points in `packSpace` for the standalone strategies of k141, and their chips in the demo of the site. This changes the pinned counts of the space | core | active | |
| k143 | An export of the measured points of the coverage run, with the error of each fold, in `response-records/1` of `@mark1russell7/rigor-statistics`, for the response explorer. The tree stays in this package. The page `explorer/` of the site shows the points | measure | done | k50 |
| k144 | Each option of each strategy, composite and wrapper has a declaration in the catalog format of `@mark1russell7/layout-contract`, so a consumer reads the options from one source. It starts when that format is agreed | core | done | k141 |
| k145 | The site writes `kpi.json` at each deploy, in the format `kpi/1`. Each number comes from the registry or from a file of the site, so a reader copies no number from a page | site | done | k72 |
| k146 | The count of the pairs of two item laws that the corpus emits, read from the generated items and not from the labels of the generators. The target is 87 pairs. The reading is 31, an estimate that the second read holds | bench | done | k50 |
| k147 | The fit of a law and the count of the modes move from the bench of this package to `@mark1russell7/rigor-statistics`, so one home holds them. The law count stays the same | bench | done | k146 |
| k148 | The results of the site on the current release. The snapshots date from 2026-10-28, on releases 0.2.10 to 0.2.17, and npm has 0.8.0. A rerun through CI refreshes each snapshot by 2026-11-07. A scheduled job keeps them within the limit of the data-age gate by 2026-11-08: `site-rerun.yml` reruns the five corpora each Wednesday. Each snapshot keeps `run`, `date` and `release` in `origin`, and no measured page has `run: null` | bench | active | k122 |
| k149 | The stability of each strategy: the largest move of a box for a small change of one size, over a family of inputs with ties. A report gave a move of 350 to 440 px for a change of 0.01 px in 5 strategies. The measure also tells if a tie margin reduces the move, and a gate holds the result. The date is 2026-11-14 | bench | later | k148 |
| k155 | The news page follows each release: the Pages build starts at each push and after the workflow Release, and writes `releases.json` from the changelog and the tags. `stale-text` counts each version of the changelog and the package that the news does not show, less a version in flight for under 1 day. A live read gave 0.2.17 beside 0.8.0 on npm | site | done | k14 |
| k156 | Each release row of the news page states what changed, and each breaking release has a mark. A read on 11-05 found 5 rows with only the version kind, and 3 breaking releases with no mark: the tile read 4, and the changelog shows 7. A check beside the changelog parser of `site-pages` then holds this | site | active | k155 |
| k150 | Whole-number positions: a measure over each strategy tells if whole-number sizes give whole-number positions, and the contract of each strategy states the result. The date is 2026-11-12 | bench | done | k144 |
| k151 | A wall budget for each pair of the bench: 15 s up to 30 items, 30 s above. A pair over budget keeps a censored record. After 2 overruns of an entry at one size, its other pairs at that size and above do not start. A job records its control time, so a censored result near the budget can be read. | bench | active | k148 |
| k152 | An ordered group in `superviseCases` of `rigor-bench`: a stop at one size also stops the larger sizes. `budgetCases` gives each case the entry as its group and its size as its `rank` (`rigor-bench` 0.2.13), so the stage keys that never run are gone | bench | done | k151 |
| k153 | The page of each measured result shows the budget, the largest input that each strategy finished in budget and the reason of each refusal, and it compares strategies only on inputs that each one finished. The date is 2026-11-08 | site | active | k151 |
| k154 | Adversary controls. Each measure that a verdict or a page reads gets a control built to win that measure and nothing else. A measure that its control wins names a partner measure and does not call a win alone. The read also reports each measure with no spread on the real corpus. The date is 2026-11-10 | bench | later | k148 |
| k157 | Each gate check gets a flip test in CI: an injected fault turns the check red, and a clean copy stays green in the same job. The checks are the size gate, the time gates, the portfolio sets, the bench smoke and `Promotion OK`. `Promotion OK` gets a fixed run with one pair that wins and one pair that loses, each with a stated verdict. Date: 11-10 | bench | done | k154 |
| k158 | The 7 entries of masonry, treemap and columns accept only `freeAspect` and `freeArea`, and `pack-classes-v1` refuses them on each input. The class generators grow these 2 forms, and a new corpus `pack-classes-free-v1` holds them, with its own trend line. `layout-contract` already has the 5 forms. Corpus PR: 11-12. First run: 11-16 | measure | active | k122 |
| k159 | `push` accepts only the mode `incremental`, and each input of `pack-change-v1` has the mode `offline`. The bench takes a chain as both, and gives `push` its own output at the base as `previous`. The budget keeps a chain whole. The control `keep-shelf` tests the stability measure, with `pack.fill` as its partner. Run: 11-14. The count of the measured entries is a union over the corpora, with the corpus and the run of each entry | measure | active | k122 |
| k160 | `exact-strip` takes `freeHeight` only, up to 16 items, and `pack-classes-v1` starts at 20 items. `pack-classes-free-v1` adds `freeHeight` cells of 8 and 16 items, 100 inputs. The record of a refusal states the limit. It comes with k158. First run: 11-16 | measure | active | k158 |
| k161 | `raster-nofit` has no row in run 41949891960, because its job reached the limit of 120 minutes. The weekly run of 11-09 has the budget, so it keeps each finished row and states the largest input in budget. Date: 11-09 | measure | active | k151 |
| k162 | A time compare across 2 CPU models reads "no read" with both model names, in the win test and in `bench/time-budget.ts`. `pass` stays false on no read, and a status field carries the difference. The model test comes from the bench home. Date: 11-12 | bench | active | k157 |
| k163 | `force`, `relax`, `overlap-min`, `side-anchors` and the locked items of the generators read `checkHard` with the bounding test, so their outputs did not change in 0.9.0. Read `pack.outsideExact` of these strategies on the shaped cells of the next rerun. Each one that leaves the true outline reads the true outline, with a version and a stated output change. Date: 11-23 | measure | later | k148 |
| k164 | Version 2 of the adversarial search gives each cell (generator and container form) its own stream, with a seed from its name, and its own budget. A new cell then moves no stored row of another cell, and a test holds this. It searches the free forms and writes a corpus `pack-adversary-v2`. Version 1 does not search the free forms. A new entry of the pool of `best` takes only the draws that it wins, approximately 1 in n, and a test reads that share. The date is 2026-11-20 | bench | later | k158 |
| k166 | 15 entries have no row on `pack-free-v1`, because they declare no free form: `beam`, `binary-height`, `exact-strip`, `force`, `near-rects`, `overlap-min`, `raster-nofit`, `relax`, `side-anchors` and `sleator`. `aspectFit` over a strategy lifts this limit of the code. Each composition is its own named entry. The name shows the wrapper, and its figures do not merge with the figures of the base. A prediction first names each refusal, with its reason, per strategy. `unsupported order` of the `best-fit` entries gets the same form if an order wrapper is equally small. | bench | later | k148 |
| k167 | `lowestWindow` keeps one cell for each unit of the width, and its search is O(width) for one rectangle. On `pack-free-v1`, `skyline` reads 132 ms at 100 items and `maxrects-bl` reads 12 ms. A read on one CI job gives the time against the width at a fixed count of items. If the time grows with the width, a form with segments can remove that cost, with a byte-equal test. | packer | active |  |
| k168 | Each entry and cell with a skip gets one word: `not done` (a limit of the code, and small work lifts it), `other algorithm` (read one by one) or `no meaning`. A row that nobody has read says `not read`, and it does not default to `no meaning`. The page text reads this field. A skip that we can lift is coverage still owed, so the coverage measure counts it apart from a measured row. | site | active | k148 |
| k169 | 7 entries refuse each container shape other than the rectangle, although `FreeSpace` knows each shape: `bottom-left`, `bottom-left-liu-teng`, `best-fit`, `best-fit-short`, `best-fit-tall`, `masonry-lpt` and `masonry-shortest`. The table of words marks them `not done`. Lift them through `FreeSpace`, and predict first which ones refuse. A measured bound of a masonry method does not hold in a shape, so the page states that. Due: 11-30 | strategies | later | k148, k168 |

## The queue

The score of an item is its gain times its uncertainty, divided by its cost. Each factor is on a scale of 1 to 5. The gain is the expected change of the efficacy maps. The work takes the items in the order of the score. After its bench, an item records its measured gain next to its expected gain. Each month, the scores get a calibration from these pairs, and the rank comes from the calibrated score. Up to 3 build subagents run at one time, one family each, each with its prediction. The ideas of the survey (k76, `docs/research/SURVEY.md`) are the items k78 to k104, or a part of an older item.

| Rank | Item | Gain | Uncertainty | Cost | Score | Calibrated |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | k25 | 3 | 3 | 2 | 4.5 | 3.8 |
| 2 | k13 | 3 | 3 | 2 | 4.5 | 3.8 |
| 3 | k92 | 3 | 3 | 2 | 4.5 | 3.8 |
| 4 | k10 | 4 | 4 | 4 | 4.0 | 3.3 |
| 5 | k81 | 4 | 3 | 3 | 4.0 | 3.3 |
| 6 | k82 | 3 | 4 | 3 | 4.0 | 3.3 |
| 7 | k83 | 3 | 4 | 3 | 4.0 | 3.3 |
| 8 | k93 | 4 | 2 | 2 | 4.0 | 3.3 |
| 9 | k94 | 4 | 3 | 3 | 4.0 | 3.3 |
| 10 | k95 | 4 | 3 | 3 | 4.0 | 3.3 |
| 11 | k97 | 3 | 4 | 3 | 4.0 | 3.3 |
| 12 | k110 | 4 | 2 | 2 | 4.0 | 3.3 |
| 13 | k84 | 3 | 5 | 4 | 3.8 | 3.1 |
| 14 | k96 | 5 | 4 | 5 | 4.0 | 2.6 |
| 15 | k74 | 4 | 3 | 4 | 3.0 | 2.5 |
| 16 | k52 | 3 | 2 | 2 | 3.0 | 2.5 |
| 17 | k85 | 3 | 3 | 3 | 3.0 | 2.5 |
| 18 | k86 | 3 | 5 | 5 | 3.0 | 2.5 |
| 19 | k87 | 3 | 3 | 3 | 3.0 | 2.5 |
| 20 | k98 | 3 | 2 | 2 | 3.0 | 2.5 |
| 21 | k122 | 2 | 3 | 2 | 3.0 | 2.4 |
| 22 | k109 | 4 | 2 | 3 | 2.7 | 2.2 |
| 23 | k99 | 3 | 4 | 5 | 2.4 | 2.0 |
| 24 | k100 | 3 | 3 | 4 | 2.3 | 1.9 |
| 25 | k101 | 4 | 2 | 4 | 2.0 | 1.7 |
| 26 | k102 | 3 | 2 | 3 | 2.0 | 1.7 |
| 27 | k88 | 2 | 2 | 2 | 2.0 | 1.6 |
| 28 | k103 | 2 | 2 | 2 | 2.0 | 1.6 |
| 29 | k89 | 2 | 4 | 5 | 1.6 | 1.3 |
| 30 | k104 | 2 | 3 | 5 | 1.2 | 1.0 |

The order of 2026-11-04 makes k50 next, ahead of this table, so it has no score here.

### The calibration of 2026-11-03

The first calibration has 21 pairs of an expected gain and a measured gain, from the items with a row in the queue and a measured gain. An item that did not ship counts as the measured gain 1.

| Expected gain | Pairs | Mean measured gain | Calibrated gain |
| --- | --- | --- | --- |
| 2 | 0 | no pairs | 1.6 |
| 3 | 4 | 2.5 | 2.5 |
| 4 | 14 | 3.3 | 3.3 |
| 5 | 3 | 3.3 | 3.3 |

- The mean expected gain is 3.95, and the mean measured gain is 3.14. Thus the expected gains are too high by 0.81.
- The factor is 0.80 for all pairs. The gain 2 has no pairs, so it takes this factor.
- The expected gains 4 and 5 give the same measured gain, so the gain 5 tells nothing more than the gain 4.
- The item k127 did not ship. Without it, the expected gain 3 has the mean 3.0.
- The column "Calibrated" is the calibrated gain times the uncertainty, divided by the cost. The rank comes from this column. The columns of the factors keep the first estimate.
- The item k130 has a result in words, and the items k128 and k129 have no row in the queue. They give no pair.
- The next calibration comes after the items of November. It has more pairs for the gains 2 and 5.

The items of the site (k71, k72, k73) are P1 work outside the queue.

## Rules

- The repository is public. Use made-up data only.
- Benchmarks and timing runs go in CI, not on a local computer.
- Write each prediction before its benchmark run.
- One item of a strategy family is always active, next to each item of speed or of the default.
- A time ratio between two commits comes from one job: `paired.yml`, not two bench runs.
- The site follows the work. Each item that ships a strategy, a result or a bench change also changes the site.
- The strategy interface stays pure: items and their shapes in, placements out, the same result for the same seed. The design accepts shapes other than rectangles.
- Each benchmark run writes one JSON record: the strategy, the input set, the seed, each measure and the time.
