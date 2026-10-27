# Roadmap

The status of each item of `@mark1russell7/packing`. A live tracker mirrors this file. Change both together.

Status: done, done, waiting, next, done.

| ID | Item | Area | Status | Needs |
|---|---|---|---|---|
| k0 | The repo from the template, with the history of `render-pack` | move | done | |
| k1 | The first publish of `@mark1russell7/packing` 0.1.0 | move | done | k0 |
| k2 | `render-pack` re-exports `@mark1russell7/packing` | move | later | k1 |
| k3 | The downstream app moves its imports to the new name | move | waiting | k1 |
| k4 | `npm deprecate` of `render-pack` | move | later | k2, k3 |
| k5 | Check the grid helpers of `splay`, the grid strategy of `ireko` and the guillotine cut of `highways` | audit | next | |
| k6 | A literature survey: shelf, guillotine, maxrects, skyline, exact search, online and offline | theory | next | |
| k7 | One `Packer` interface for each strategy | core | later | k0 |
| k8 | An algebra of measures | theory | later | k6, k7 |
| k9 | The strategy zoo | strategies | later | k6, k7 |
| k10 | An exact baseline for small inputs | strategies | later | k7 |
| k11 | Benchmarks in CI, with a prediction before each run | measure | later | k8, k9 |
| k12 | Stability: the movement when one item changes | measure | later | k8 |
| k13 | Speed and its scaling | measure | later | k11 |
| k14 | A live site with interactive examples (v1: a demo of the current strategies) | site | active | k1 |
| k15 | The s38 checks: `conventions` and `api-report` in CI | move | done | k0 |
| k16 | The sort order `input` | strategies | done | |
| k17 | `packShelf`: rows in the input order around obstacles | strategies | active | k1 |

## Rules

- The repository is public. Use made-up data only.
- Benchmarks and timing runs go in CI, not on a local computer.
- Write each prediction before its benchmark run.
- The strategy interface stays pure: items and sizes in, rectangles out, the same result for the same seed.
- Each benchmark run writes one JSON record: the strategy, the input set, the seed, each measure and the time.
