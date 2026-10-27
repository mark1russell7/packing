# Roadmap

The status of each item of `@mark1russell7/packing`. A live tracker mirrors this file. Change both together.

Status: done, done, waiting, next, done.

| ID | Item | Area | Status | Needs |
|---|---|---|---|---|
| k0 | The repo from the template, with the history of `render-pack` | move | done | |
| k1 | The first publish of `@mark1russell7/packing` 0.1.0 | move | done | k0 |
| k2 | `render-pack` re-exports `@mark1russell7/packing` | move | active | k1 |
| k3 | The downstream app moves its imports to the new name | move | done | k1 |
| k4 | `npm deprecate` of `render-pack` | move | later | k2, k3 |
| k5 | Check the grid helpers of `splay`, the grid strategy of `ireko` and the guillotine cut of `highways` | audit | next | |
| k6 | The catalog: each published packing method and each new idea, with a source and a status | theory | done |  |
| k7 | One Packer interface for every strategy | core | active | k0, k18, k35 |
| k8 | An algebra of measures | theory | later | k6, k7 |
| k9 | The strategy zoo: each family of the catalog behind the interface | strategies | later | k21, k22, k23, k24, k25, k26, k27, k28, k29, k30, k31, k10 |
| k10 | An exact baseline for small inputs: branch and bound, and a constraint solver | strategies | later | k7 |
| k11 | Benchmarks in CI, with a prediction before each run | measure | later | k8, k9 |
| k12 | Stability: the movement when one item changes | measure | later | k8 |
| k13 | Speed and its scaling | measure | later | k11 |
| k14 | A live site with interactive examples (v1: a demo of the current strategies) | site | active | k1 |
| k15 | The s38 checks: `conventions` and `api-report` in CI | move | done | k0 |
| k16 | The sort order `input` | strategies | done | |
| k17 | `packShelf`: rows in the input order around obstacles | strategies | done | k1 |
| k18 | The shared corpus and record format with highways (`layout-input/1`, `layout-record/1`) | measure | active |  |
| k19 | The corpus from first principles: a seeded generator for each dimension of the taxonomy | measure | later | k18, k35 |
| k20 | A selector: measure the choice of a strategy for each input | measure | later | k9, k11 |
| k21 | Shelf family: next fit, first fit and best fit by decreasing height, and the input order | strategies | later | k6, k7 |
| k22 | Skyline variants: bottom-left, minimum waste, with a waste map | strategies | later | k6, k7 |
| k23 | Guillotine: each rule to choose a free rectangle and to split it | strategies | later | k6, k7 |
| k24 | MaxRects: best short side, best long side, best area, bottom-left, contact point | strategies | later | k6, k7 |
| k25 | Bottom-left fill: Baker, Chazelle and the lowest-gap variants | strategies | later | k6, k7 |
| k26 | A search over orders: genetic, annealing and tabu search, with a seed | strategies | later | k6, k7 |
| k27 | Treemaps: squarified, slice and dice, strip, pivot, ordered and Voronoi | strategies | later | k6, k7 |
| k28 | Masonry and columns: shortest column, balanced columns and the CSS grid flow | strategies | later | k6, k7 |
| k29 | Methods that keep the reading order or the layout under change | strategies | later | k6, k7 |
| k30 | Online and incremental packing | strategies | later | k6, k7 |
| k31 | New ideas of our own | strategies | later | k6, k7 |
| k32 | Every result on the site, the losers too | site | later | k11, k14 |
| k33 | Free width: `packFree` searches the width for a target aspect | core | done |  |
| k34 | The site: a fixed or free width, a target aspect and the chart of the search | site | done | k33 |
| k35 | The problem taxonomy: the dimensions of the problem and their values | theory | active |  |
| k36 | The catalog for each cell: nesting, circles, polygons, obstacles and holes | theory | later | k35, k6 |
| k37 | Containers of each shape: a convex polygon, any polygon, a circle or an ellipse, a region with holes | strategies | later | k7, k35 |
| k38 | Obstacles that move at a cost | strategies | later | k7, k35 |
| k39 | Items of other shapes: circles and polygons (nesting) | strategies | later | k7, k36 |
| k40 | The site: a picker for the container shape and the obstacles | site | later | k34, k37 |
| k41 | Pack-around: the split of the free space as a stage of its own | core | later | k7, k35 |
| k42 | The ways to split the free space: maximal empty rectangles, slabs, cuts at obstacle edges, cells, or one region with holes | strategies | later | k41, k36 |
| k43 | The ways to give items to the parts: greedy in reading order, assignment, and a flow that keeps the reading order | strategies | later | k41 |
| k44 | The measures of pack-around: fill of each part, slivers, order breaks across parts, stability when an obstacle moves | measure | later | k8, k41 |
| k45 | Inputs with a known best answer: perfect cuts that are shuffled, and the consecutive squares | measure | later | k19 |
| k46 | The published benchmark sets for strip packing and nesting | measure | later | k19 |
| k47 | Hard inputs: the known worst cases of each heuristic, and a search for inputs where one strategy loses most to another | measure | later | k19, k9 |
| k48 | Change sequences for stability: insert, delete, resize, reorder, move an obstacle | measure | later | k19 |
| k49 | Property fuzzing with shrinking: no overlap, inside the container, obstacles kept, deterministic | measure | later | k7 |
| k50 | The coverage of the corpus as a number: cells covered and pairwise coverage of the dimensions | measure | later | k19, k35 |
| k51 | Lower bounds, so each result shows its distance to the best | measure | later | k6 |
| k52 | Baselines with a known guarantee: Sleator, Reverse-Fit and Steinberg | strategies | later | k6, k7 |
| k53 | Overlap removal: PRISM, VPSC, force-scan and the orthogonal order | strategies | later | k6, k7 |
| k54 | Compaction: a constraint graph in one direction, mixed constraints and the exact form | strategies | later | k6, k7 |
| k55 | Component packing: polyominoes and the placement of the parts of a graph | strategies | later | k6, k7 |
| k56 | Labels and word clouds: greedy, annealing, four places, and the spiral | strategies | later | k6, k7 |

## Rules

- The repository is public. Use made-up data only.
- Benchmarks and timing runs go in CI, not on a local computer.
- Write each prediction before its benchmark run.
- The strategy interface stays pure: items and sizes in, rectangles out, the same result for the same seed.
- Each benchmark run writes one JSON record: the strategy, the input set, the seed, each measure and the time.
