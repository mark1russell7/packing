# A survey of packing methods, as ideas

This survey is roadmap item k76. It reads the published work on packing, from the classic papers to the papers of 2026. It compares that work with the strategies of `@mark1russell7/packing`, and it gives a ranked list of ideas.

- The method rows and the full sources are in the [catalog](CATALOG.md). This file gives each source by its key, for example "Wei 2017". The [bibliography of the catalog](CATALOG.md#bibliography) has the authors, the title and a DOI or a URL.
- The names of the problems come from the [taxonomy](TAXONOMY.md).
- The scores use the scale of the queue in [`docs/ROADMAP.md`](../ROADMAP.md#the-queue).

## The survey as data

Roadmap item k108 keeps the survey as data. The file [`survey.json`](survey.json) is the source. It has the schema `packing-survey/1` and one record for each idea of this file.

Each record has these fields:

| Field | Content |
|---|---|
| `id`, `name`, `description` | The id, the name and the description of the tables of this file. `R` is for rectangles, and `S` is for other shapes. |
| `published`, `sources` | The value `false` marks an idea of this repository. Each source has the key, the authors, the year and the title of the bibliography of the catalog. |
| `problemClass`, `shapes`, `family` | The class of the problem, the shapes of the items and the family of the method. |
| `item`, `itemTitle`, `related` | The roadmap item that holds the idea, the start of its title, and the other items that touch it. |
| `status`, `note` | `built`, `queued`, `not queued` or `rejected`. A rejected idea gives its reason in `note`. |
| `survey`, `queue` | The factors of this file, and the factors of the queue of the roadmap. Each is `null` when its table gives none. |
| `round` | 1 for the ideas of k76, 2 for the ideas of k108. |

The check `node packages/site/scripts/survey-check.ts --check` compares the data with this file, the roadmap and the catalog. A test of the site starts it, so CI fails on a difference. The check finds these problems:

- An idea of this file that is not in the data, or a record of the data that is not in this file.
- A name, a description, a factor or a score that differs from its table.
- A source that is not in the bibliography, or a source with other authors, another year or another title.
- An item that is not in the roadmap, or an item with a title that does not start with `itemTitle`.
- Queue factors that differ from the queue table. An idea is `queued` only when its item has a row of the queue.
- An idea that is `built`, but its item is not done.

To add a method:

1. Add its source to the bibliography of the catalog, with the authors, the year, the title and a DOI.
2. Add a row to a table of this file, with a new id.
3. Add a record to `survey.json` with the status `not queued`. Do not write factors that the queue does not give.
4. Start the check, and correct each problem.

When you change the queue or the status of an item of the survey, change `survey.json` in the same pull request.

### The rule of the next round

Up to 3 build subagents run each day. Thus a week has 21 build slots. When the queue holds fewer than 21 rows, the next round of the survey starts. It adds published methods and hybrids of the strategies that the package has. Each round adds methods from the classes with the fewest ideas first. The field `rule` of `survey.json` keeps the 3 builders and the 7 days, and the check shows the state of the queue.

## What packing has today

The package has these strategies on rectangles: `rows`, `shelf` with 3 fits, `skyline` (bottom-left), `push` and `maxrects` with 5 rules. The composites are `portfolio`, `aspectFit` and `select`. The containers can have other shapes (k37), but the items are rectangles only.

Each strategy of today is a constructive rule: one pass, with no search. The package has no lower bound, no exact method, no search over orders and no strategy for other shapes of items.

## How to read the scores

Each idea has three factors, each on a scale of 1 to 5:

| Factor | 1 | 5 |
|---|---|---|
| Gain | A small change of one measure in a few cells. | A large change of the efficacy maps in many cells. |
| Uncertainty | We know the result before the run. | We cannot predict the result. A run teaches the most. |
| Cost | Less than a day of work, no new dependency. | Weeks of work, or a new dependency, or a hard proof. |

The score is the gain times the uncertainty, divided by the cost. The queue of the roadmap uses the same formula.

## The families and the state of the art

Each part below names the best methods of one family and the best published results. A number comes from the paper of the method. We did not test these methods.

### Strip packing of rectangles

The strip has a fixed width, and the goal is the lowest height. This is the main problem of the package.

- The best heuristics are searches around a fast constructive rule. The rule is a skyline or a best fit, and the search changes the order or the score.
- Wei 2017 gives a skyline best fit with a local search, at `O(n log n)` for each layout. Wei 2016 adds a search in three stages. Zhang 2013 does a binary search on the height.
- Chen 2025 and Wen 2025 give beam searches. Wen 2025 also gives a parallel form.
- The constructive rules of best fit are Burke 2004, Aşık 2009, Verstichel 2013 and Özcan 2013. Wei 2009 gives the least waste rule.
- The exact methods use Benders cuts (Côté 2014), canonical forms (Arahori 2012) or positions and covering (Cid-Garcia 2021). Iori 2021 surveys them.
- The sets C, N, T and BKW have a known optimum: each is a perfect packing. Thus their gap is the height divided by the optimum, minus 1.

We did not open the tables of results of Wei 2016, Wei 2017 and Chen 2025. Thus this survey gives no published gap for each method and set. The Nottingham page lists the best heights of many sets.

### Bins of rectangles

The bins have a fixed size, and the goal is the lowest count of bins.

- Monaci 2006 covers the boxes with a set of good bins. Parreño 2010 does a GRASP with a variable neighborhood descent.
- Wei 2013 drives the search with a goal. Gardeyn 2022 removes a part of the layout and packs it again, with guillotine cuts and bins of many sizes.
- Charalambous 2011 fills one bin at a time with guillotine cuts. Fleszar 2013 gives three insertion rules for the same problem.
- The exact methods use branch and price (Pisinger 2007), Benders cuts (Côté 2021), positions and covering (Cid-Garcia 2020) and arc flows (Macedo 2010).
- The lower bounds of Martello 1998 and the reductions of Carlier 2007 give the distance to the best. Liu 2024b compares the integer models by instance space analysis.

### Knapsack of rectangles

The container is fixed, and the goal is the largest value of the boxes that fit.

- Alvarez-Valdes 2007 does a tabu search. Wei 2015 builds the layout from two sides with guillotine cuts.
- Caprara 2004 gives relaxations, and Lodi 2003 gives integer models for two stages.
- Birgin 2010 packs identical boxes with five blocks. With turns, it fits more boxes than a plain grid on many inputs.
- The sets `ngcut`, `gcut` and `cgcut` of OR-Library have optimal values in their papers.

### Free width and the smallest rectangle

The width is free, and the goal is the smallest area or a target aspect.

<!-- ste-disable-next gendered-pronoun -- "He 2015" is the key of a source -->
- He 2015 reduces the width step by step with a search. Bortfeldt 2013 reduces the problem to strip packing.
- Huang 2013 finds the smallest rectangle for the squares `1x1` to `NxN` up to `N = 32`. These inputs have a known answer.

### Analytical placement

Chip placement puts millions of boxes with an objective on the edges between them.

- The global placers treat the boxes as charges and lower an energy (Lu 2015). DREAMPlace does it on a GPU (Lin 2019, Lin 2021).
- A legalizer then removes the last overlap with little movement. Spindler 2008 (Abacus) moves the boxes of each row the least. Hill 2002 puts the boxes in the order of `x`.
- A legalizer is also a method for stability: after a change, it moves the fewest boxes.

### Learned and hybrid methods

These methods learn the order, the place, the choice of a rule or the code of a rule.

- Fang 2023 learns the order for strip packing with a pointer network and a bottom-left decoder. It reports 3 better and 5 equal results against classic rules.
- Kaleta 2025 learns the place among the free rectangles of `maxrects` for online strip packing.
- Zhao 2022 learns the place in a tree of the candidate places, for online bins in three dimensions.
- Romera-Paredes 2024 (FunSearch) evolves the code of a priority function with a language model. On online bins in one dimension, the excess bins fall from 3.79% to 0.03% (Weibull, 100k items).
- Liu 2024a (EoH) gets results near those of FunSearch with 2,000 calls of the model. FunSearch used near one million calls.
- Huq 2025 is the only report on two-dimensional bins. On 50 inputs of squares, the mean count of bins falls from 16 to 15.
- Herrmann 2025 finds that rules by hand are as good as the evolved rules, on inputs that are easy.
- The older hyper-heuristics learn the same choices without a language model (Terashima-Marín 2010, Burke 2010).
- Neuenfeldt 2023 trains a classifier that chooses a strip heuristic for each input, on 15,666 inputs.

We found no learned method with a published result on the standard strip sets that beats the best searches.

### Irregular shapes: nesting

The pieces are polygons, and the goal is the shortest strip.

- The no-fit polygon gives the places where two pieces touch (Bennell 2008). Burke 2007 makes it by orbiting, and Bennell 2008b makes it with Minkowski sums.
- The best methods minimize the overlap in a strip that shrinks (Egeblad 2007, Umetani 2009, Imamichi 2009, Elkeran 2013).
- Gardeyn 2025 (Sparrow) gives the best results of today. Its collision engine (Gardeyn 2026) answers each overlap query without the no-fit polygon.
- The exact models use the no-fit polygon (Fischetti 2009), a grid of dots (Toledo 2013) or vertical slices (Lastra-Díaz 2024). They solve small sets only.

The best densities on the ESICUP strip sets, from the tables of Gardeyn 2025, version 4. The source of each best before Sparrow is a key of the bibliography.

| Set | Best before Sparrow (%) | Source | Sparrow best (%) | Sparrow mean (%) |
|---|---|---|---|---|
| albano | 89.58 | Elkeran 2013 | 89.82 | 89.47 |
| dagli | 89.51 | Elkeran 2013 | 90.17 | 89.26 |
| fu | 92.41 | Elkeran 2013 | 92.41 | 92.24 |
| jakobs1 | 89.09 | Leung 2012, Elkeran 2013, Wang 2017, Sato 2019 | 89.26 | 89.09 |
| jakobs2 | 87.73 | Elkeran 2013, Sato 2019 | 87.73 | 84.77 |
| mao | 86.05 | Sato 2019 | 86.87 | 86.14 |
| marques | 91.02 | Sato 2019 | 92.02 | 90.93 |
| shapes0 | 68.79 | Elkeran 2013, Wang 2017, Sato 2019 | 69.98 | 68.60 |
| shapes1 | 76.73 | Elkeran 2013, Sato 2019 | 76.73 | 75.69 |
| shapes2 (blaz) | 84.84 | Elkeran 2013 | 86.23 | 84.68 |
| shirts | 88.96 | Elkeran 2013, Wang 2017 | 90.92 | 89.66 |
| swim | 75.94 | Elkeran 2013 | 79.83 | 78.26 |
| trousers | 91.06 | Sato 2019 | 92.62 | 91.73 |

Sparrow had 20 minutes and 3 threads for each set. The sets `dighe1` and `dighe2` are jigsaws with a density of 100% by construction.

### Circles

The items are circles, in a circle, a square, a rectangle or a strip.

- The quasi-physical methods treat each overlap as an energy (Wang 2002, Huang 2011b). Basin hopping changes the layout and solves it again (Addis 2008a, Grosso 2010).
- The greedy methods put each circle in the corner place with the largest hole degree (Huang 2006, Kubach 2009).
- Lai 2022 improves 136 best known packings of equal circles in a circle, up to 320 circles, and equals 175.
- Lai 2025 improves 69 of the 96 hardest of these inputs. Zhou 2025 improves 116 of 239 inputs of unequal circles, and equals the rest.
- Fu 2013 improves 13 of 18 best results for circles in a strip.
- Novikov 2025 (AlphaEvolve) evolves programs with a language model. For 26 circles in a unit square, it raises the best sum of the radii from 2.634 to 2.635.
- For a layout on a screen, the front chain of Wang 2006 and the smallest enclosing circle of Welzl 1991 are fast. `d3-hierarchy` uses them.

Packomania keeps the best known packings, for equal circles in a circle up to 2600 circles.

## What packing has and what it lacks

| Area | Packing has | Packing lacks | Ideas below |
|---|---|---|---|
| Constructive rules | Rows, shelves, a skyline, a push, and `maxrects` with 5 rules | Best fit by the gap, least waste, guillotine rules for bins | R4, R7, R8, R9 |
| Search | A portfolio that tries some strategies and widths | A search over the order or the layout, with a seed and a budget | R1, R5, R6, R10, R14 |
| Distance to the best | No measure | Lower bounds, and inputs with a known optimum | R2, R3 |
| Exact methods | None | An exact answer for small inputs | R18 |
| Stability | `push` and the order `input` | A legalizer that moves the fewest boxes after a change | R11 |
| Selection | `select`, a table fit by hand on cheap features | A learned selector, and a map of the region where each strategy is strong | R12, R13, R15 |
| Large inputs | The constructive strategies of today | A global placer for `10k` boxes and more, that also reads the edges between boxes | R16 |
| Item shapes | Rectangles only | Circles, polygons and free forms | S1 to S15 |
| Public benchmarks | The corpus generator of k19 | The published sets, with their licenses | R3, S9, S14 |

The ideas for other shapes of items need k75 first: the shape of an item as a dimension of `packSpace` and of the contracts.

## The ideas, ranked

Each idea is one step that a later item can do. The factors and the score use the scale of the queue. A higher score comes first. The column "Item" names an item of the roadmap that holds the idea, or "new item".

### Rectangles

<!-- ste-disable gendered-pronoun -- "He 2015" is the key of a source -->

| Rank | Idea | Description | Families | Gain | Uncertainty | Cost | Score | Sources | Item |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Random restarts around each strategy | Change the order of a constructive strategy at random, with a seed and a budget of time. Keep the best layout. | searches, all constructive | 4 | 3 | 1 | 12.0 | Yang 2013 | k26 |
| R2 | Lower bounds as the distance to the best | Compute `lb-l2` with the reductions of `lb-reduction`. Each record shows its gap to the bound. | lower bounds, measures | 5 | 3 | 2 | 7.5 | Martello 1998, Carlier 2007 | k51 |
| R3 | The published sets with a known optimum | Import the sets C, N, T and BKW from ESICUP (CC0) and 2DPackLib. Their gap to the optimum is exact. | benchmarks, strip | 4 | 3 | 2 | 6.0 | Hopper 2001, Burke 2004, Iori 2022 | k45, k46 |
| R4 | Skyline best fit with a local search | Score each place on the skyline by the fit of its gap. Swap boxes in the order with a local search. | skyline, bottom-left, searches | 4 | 3 | 2 | 6.0 | Wei 2017, Burke 2004 | k22 |
| R5 | Goal-driven ruin and recreate | Remove a part of the layout and pack it again. A goal cost keeps the search moving. | searches, bins, guillotine | 4 | 4 | 3 | 5.3 | Gardeyn 2022, Wei 2013 | k26 |
| R6 | Overlap minimization for rectangles | Shrink the strip. Move one box at a time to its place of least overlap, with guided penalties. | searches, nesting | 4 | 4 | 3 | 5.3 | Egeblad 2007, Umetani 2009, Imamichi 2009 | new item |
| R7 | Best fit from two or three sides | Do `best-fit-bkw`, and also fill each gap from the right and from the middle. Keep the best fit. | bottom-left | 3 | 3 | 2 | 4.5 | Aşık 2009, Verstichel 2013, Özcan 2013 | k25 |
| R8 | Least waste first | Put next the box and the place that leave the least wasted area. | bottom-left | 3 | 3 | 2 | 4.5 | Wei 2009 | k25 |
| R9 | Guillotine rules for bins | Fill one bin at a time with guillotine cuts. Add the three insertion rules of Fleszar 2013. | guillotine | 3 | 3 | 2 | 4.5 | Charalambous 2011, Fleszar 2013 | k23 |
| R10 | Binary search on the height | Search the height of the strip by halves. For each height, do a random local search for a feasible layout. | searches, strip | 4 | 3 | 3 | 4.0 | Zhang 2013 | k26 |
| R11 | Legalization for stability | After a change, remove the overlap row by row with the least movement. | analytical placement, stability | 3 | 4 | 3 | 4.0 | Spindler 2008, Hill 2002 | k12, k29 |
| R12 | Genetic programming of the score | Evolve the score function of `maxrects` or of the skyline on the corpus. No model at run time. | learned, MaxRects | 3 | 4 | 3 | 4.0 | Burke 2010, Burke 2013 | new item |
| R13 | Priority code that a language model evolves | Evolve the score function with a language model, and keep the code that wins on the corpus. | learned | 3 | 5 | 4 | 3.8 | Romera-Paredes 2024, Liu 2024a, Herrmann 2025 | new item |
| R14 | Beam search | Keep the best `k` partial layouts. Grow each with each box left, and cut the weak children. | searches | 3 | 3 | 3 | 3.0 | Chen 2025, Wen 2025 | k26 |
| R15 | A learned selector with footprints | Map each input of the corpus by its features. Fit a classifier for `select`, and show the region where each strategy wins. | selection | 3 | 3 | 3 | 3.0 | Neuenfeldt 2023, Smith-Miles 2023 | k66, k70 |
| R16 | Global placement for large inputs | Spread `10k` boxes with an energy method, then legalize them. | analytical placement | 3 | 5 | 5 | 3.0 | Lu 2015, Lin 2021 | new item |
| R17 | Dynamic reduction of the width | For a free width, reduce the width step by step and pack again with a search. | free width | 3 | 3 | 3 | 3.0 | He 2015 | k33 |
| R18 | Exact answers for small inputs | A branch and bound on the corner places, with the lower bounds. A solver of constraints is an option. | exact | 3 | 3 | 4 | 2.3 | Martello 2003, Clautiaux 2007, OR-Tools | k10 |
| R19 | Identical boxes in five blocks | For many boxes of one size, with turns, use the five-block layout. | knapsack | 2 | 2 | 2 | 2.0 | Birgin 2010 | new item |
| R20 | A learned order | A pointer network gives the order for a bottom-left decoder. It needs training and a model at run time. | learned | 2 | 4 | 5 | 1.6 | Fang 2023, Vinyals 2015 | new item |

<!-- ste-enable gendered-pronoun -->

### Other shapes

| Rank | Idea | Description | Families | Gain | Uncertainty | Cost | Score | Sources | Item |
|---|---|---|---|---|---|---|---|---|---|
| S1 | Circles by the maximum hole degree | Put each circle in the corner place, where it touches two items, with the largest hole degree. | circles | 4 | 3 | 2 | 6.0 | Huang 2006, Kubach 2009 | k39 |
| S2 | Shapes by their bounding boxes | Pack the bounding rectangle of each polygon or circle with the strategies of today. This is the baseline of each shape. | nesting, circles | 3 | 2 | 1 | 6.0 | an idea of this project, near Yang 2023 | k39 |
| S3 | A raster no-fit for free forms | Put each shape on a grid of cells. Place it bottom-left on the free cells, and search the order. | nesting | 3 | 3 | 2 | 4.5 | Mundim 2017, Sato 2019 | k39 |
| S4 | Front chain and enclosing circle | Pack the circles of a group against the front chain. The smallest enclosing circle gives the parent. | circles, treemaps | 4 | 2 | 2 | 4.0 | Wang 2006, Welzl 1991, d3-hierarchy | k27, k39 |
| S5 | Basin hopping for circles | Change a layout of circles at random, then lower its overlap energy. Keep it when it is better. | circles | 4 | 3 | 3 | 4.0 | Wang 2002, Addis 2008a, Grosso 2010 | k39 |
| S6 | Bottom-left fill for polygons | Put each polygon at its lowest, then leftmost place without overlap. Search the order. | nesting | 4 | 3 | 3 | 4.0 | Burke 2006, SVGnest | k39 |
| S7 | Overlap minimization for polygons | Shrink the strip, then remove the collisions one piece at a time with guided weights. | nesting | 5 | 4 | 5 | 4.0 | Gardeyn 2025, Egeblad 2007 | k39 |
| S8 | Groups of pieces as near rectangles | Join pieces that fit well into groups that are almost rectangles. Pack the groups with the rectangle strategies. | nesting, learned | 3 | 4 | 3 | 4.0 | Yang 2023, Elkeran 2013 | k39 |
| S9 | The ESICUP nesting sets | Import the polygon sets (CC0), with the table of Sparrow as the reference. | benchmarks, nesting | 3 | 2 | 2 | 3.0 | Albano 1980, Gardeyn 2025 | k46 |
| S10 | Phi-functions | Write the non-overlap of each pair as a function, and solve a nonlinear program from many starts. | nesting, circles | 3 | 4 | 5 | 2.4 | Chernov 2010, Stoyan 2016 | k39 |
| S11 | The best search for circles | Do a threshold search with layouts that the search hashes to skip repeats. | circles | 3 | 3 | 4 | 2.3 | Lai 2022, Zhou 2025 | k39 |
| S12 | A collision engine | A tree of cells for the broad phase, and polygons with fewer edges for a fast test. Each nesting method uses it. | nesting | 4 | 2 | 4 | 2.0 | Gardeyn 2026 | k39 |
| S13 | No-fit polygons by Minkowski sums | Cut each polygon into convex parts. Sum the parts pair by pair, and take the union. | nesting | 3 | 2 | 3 | 2.0 | Bennell 2008b, Agarwal 2002 | k39 |
| S14 | Packomania as a reference | Compare each circle result with the best known packing. Fetch the data in CI, because the site states no license. | benchmarks, circles | 2 | 2 | 2 | 2.0 | Packomania, Hifi 2009 | k46 |
| S15 | Exact models for few polygons | Put each piece on a grid of dots, and solve the integer model. | nesting, exact | 2 | 3 | 5 | 1.2 | Toledo 2013, Rodrigues 2017 | k10, k39 |

### Round 2: methods and hybrids that the queue does not hold

Roadmap item k108 adds these ideas. Round 1 had no idea for online packing, and few ideas for bins, the knapsack, the free width and circles. Thus this round adds those classes first.

Each method below has a row in the catalog, and a source in its bibliography. No row of the queue holds these ideas, so they have no factors. The column "Item" names the items that touch each idea.

The hybrids join two strategies that the package has. They are ideas of this repository, not published methods.

| Rank | Idea | Description | Class | Sources | Item |
|---|---|---|---|---|---|
| R21 | Skyline with a fit score | For each segment of the skyline, score each box by the count of its sides that touch exactly. Put the box with the best score. | strip | Wei 2011 | k22 |
| R22 | Best fit, fast form | Find the lowest gap of the skyline, and put in it the box that fills the most of its width. Balanced trees make each step fast. | strip | Burke 2004, Imahori 2010 | k25 |
| R23 | Bottom-left fill with a genetic order | Keep a population of orders. Cross and change them, and decode each order with bottom-left fill, holes included. | strip | Hopper 2001, Jakobs 1996 | k25, k26 |
| R24 | Reactive GRASP | Build an order with a random greedy rule, and improve it with a local search. Learn the best amount of randomness from the results. | strip | Alvarez-Valdes 2008 | k26 |
| R25 | Annealing with best fit | Anneal the order of the first boxes. Place the other boxes with the best-fit rule. | strip | Burke 2009 | k26 |
| R26 | Branch and bound with better bounds | Search the strip height exactly, with new lower bounds and rules that remove equal layouts. | strip | Alvarez-Valdes 2009 | k10 |
| R27 | Constraint search for the smallest rectangle | Use a constraint model of non-overlap with a sweep. Choose all the `x` places first, then the `y` places, with interval splits. | free width | Simonis 2008, Beldiceanu 2001 | k10, k33 |
| R28 | Optimal rectangle packing | Test each candidate enclosing rectangle in order of area, with a branch and bound. The first rectangle that holds all the boxes is the answer. | free width | Korf 2003 | k33 |
| R29 | Tabu search for bins | Move a box from the worst bin to another bin. Forbid the reverse move for some steps. | bin | Lodi 1999 | k26 |
| R30 | Set covering of good bins | Make many single bins with fast rules. Choose the fewest bins that hold each box, with a Lagrangian heuristic. | bin | Monaci 2006 | none |
| R31 | Tabu search for the knapsack | Build a layout with a constructive rule. Move boxes into and out of it, with a memory of the last moves. | knapsack | Alvarez-Valdes 2007 | none |
| R32 | Tree search on grid points | Search exactly over the places on a grid of the possible coordinates, in a container of fixed size. | knapsack | Beasley 1985a | k10 |
| R33 | Dynamic programming for guillotine cuts | For each size on a grid, the best value is the best box that fits or the best cut into two parts. | knapsack | Gilmore 1965, Christofides 1977, Beasley 1985b | k10, k23 |
| R34 | Online shelves with a parameter | Round each height up to a power of `r`. Keep open shelves for each class of height, with next fit or first fit. | online | Baker 1983 | k30 |
| R35 | Harmonic shelves | Do the online shelves with classes of width too, as harmonic bin packing does. | online | Csirik 1997 | k30 |
| R36 | Online bottom-left | Put each box at its lowest, then leftmost place, in the order of arrival. Its paper gives lower bounds for each online packer. | online | Brown 1982 | k30, k25 |
| R37 | Restarts that stop at the bound | Run `restarts`, and stop when a layout reaches the bound of k51. No other order can do better. | strip | an idea of this repository | k78, k51 |
| R38 | Shelves, then MaxRects in the waste | Pack with `shelf`. Then put the boxes of the top shelf into the free rectangles of the lower shelves, with `maxrects-bl`. | strip | an idea of this repository | k21, k24 |
| R39 | Restarts in the cells of MaxRects | Where `select` picks `maxrects-bl`, wrap the pick in `restarts`. The other cells keep the time of `rows`. | strip | an idea of this repository | k66, k78 |
| S16 | TOPOS | Grow a partial layout one piece at a time. The waste, the overlap and the distances of the no-fit polygons choose the piece and its place. | nesting | Oliveira 2000 | k39 |
| S17 | Annealing with linear programs | Anneal the order of the pieces. Linear programs compact and separate the layout in the regions of the no-fit polygons. | nesting | Gomes 2006 | k39 |
| S18 | Quasi-human moves for circles | When the search stops in a local minimum, take the circle with the most overlap and put it in a new place. | circle | Huang 1999 | k39 |
| S19 | Formulation space search | Change between the Cartesian form and the polar form of one nonlinear program, to leave a local optimum of one form. | circle | López 2011 | k39 |
| S20 | Iterated tabu search for circles in a strip | Solve the strip as a series of fixed lengths. A tabu search with changes and a rule of acceptance solves each length. | circle | Fu 2013 | k39 |
| S21 | Restarts around bounding boxes | Run `restarts` with the member `bbox`, so circles and polygons get a search over the order. | nesting | an idea of this repository | k78, k91 |

## The benchmark sets

The table gives each set that packing can import, with its source, its place and its license. "None stated" means that the page gives no license. For such a set, fetch the data in CI, and do not commit it.

| Set | Problem | Instances | Known optimum | Source | Where | License |
|---|---|---|---|---|---|---|
| C1 to C7 | strip | 21 | yes, perfect packings | Hopper 2001 | ESICUP `c`, 2DPackLib, OR-Library `strip1` | CC0 (ESICUP), MIT (OR-Library) |
| N1 to N7, T1 to T7 | strip | 70, unverified | yes, perfect packings | Hopper 2002 | ESICUP `t_n`, 2DPackLib | CC0 (ESICUP) |
| BKW N1 to N13 | strip | 13, unverified | yes, no waste | Burke 2004 | 2DPackLib, OR-Datasets | none stated (2DPackLib), MIT label (OR-Datasets) |
| ZDF | strip | 16 | best known | Leung 2011b | ESICUP `zdf`, 2DPackLib | CC0 (ESICUP) |
| CLASS 1 to 10 | bins, strip | 500, unverified | lower bounds | Berkey 1987, Martello 1998, Lodi 1999 | 2DPackLib, OR-Datasets | none stated, MIT label |
| `ngcut`, `gcut`, `cgcut` | knapsack | 12 (unverified), 13, 3 | yes, in the papers | Beasley 1985a, Beasley 1985b, Christofides 1977 | OR-Library | MIT |
| `ngcutfs` | knapsack | 630 | no | Beasley 2004 | OR-Library | MIT |
| WV | strip | a generator | no | Wang 2001 | OR-Datasets | MIT label |
| Bortfeldt and Gehring | strip | 360, 1000 boxes each | no | Bortfeldt 2006b | OR-Datasets `AH` | MIT label |
| LU, LW, LX | staged cutting | many | yes, in the papers | Hifi 2001 | ESICUP `rss_cor_2014`, 2DPackLib | CC0 (ESICUP) |
| CJCM | feasibility | many | yes | Clautiaux 2008 | 2DPackLib | none stated |
| Imahori and Yagiura | strip, large | many | no | Imahori 2010 | the page of the author | none stated |
| Consecutive squares | smallest rectangle | one for each `N` | yes, to `N = 32` | Korf 2010, Huang 2013 | made from `N` | no data to license |
| Nesting sets | nesting | 13 strip sets and more | jigsaws only | Albano 1980 and others | ESICUP `2d_irregular`, Sparrow (JSON) | CC0 (ESICUP), MIT (Sparrow) |
| Packomania | circles | thousands | best known | Packomania | the site | none stated |

- We did not count the files of the sets marked "many".
- Each ESICUP set asks for a citation of its paper. The license of ESICUP covers the files, not the papers.
- The Nottingham page lists the best heights of the strip sets, and it has no download.
- k45 makes inputs with a known optimum from perfect cuts. The sets C, N and T are inputs of the same kind, from the literature.

## The sources of this survey

The bibliography of the catalog has each source. Each source has a DOI, an arXiv number or a URL, and we checked each DOI against its Crossref record. The note "unverified" marks the parts that we did not find there. These parts are:

- The rule of `bottom-left-right` (Belov 2008), the detail of the rule of `search-goal-driven` (Wei 2013) and the rule of `knapsack-bidirectional` (Wei 2015).
- The name "Tetris" for Hill 2002, and the address of the code of Wen 2025.
- The publication of Gardeyn 2025 in a journal, and the volume of the series of Stoyan 2015 and of Sim 2025.
- The rule of Kaleta 2026, which comes from a summary.
- The counts of the sets N, T, BKW, CLASS and `ngcut`, and the record of Hopper 2002.
