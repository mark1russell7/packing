# The benchmarks

This document tells how to start a benchmark of the packer, and how to read its result. The workflow `Bench` (`.github/workflows/bench.yml`) runs each benchmark in CI.

## The rules

1. Write the prediction before the run. A commit adds it to `packages/packing/bench/predictions.jsonl` first.
2. Also write the prediction in the prediction log of the fleet.
3. Start the run only after the commit of the prediction is on GitHub.
4. Do not start a benchmark on a local computer. Only the times of CI count.

A local computer starts only the unit tests of the runner. They use the tiny corpus `smoke-v1` with one timed pass, and they read no time.

## Start a run

Start the workflow with the GitHub CLI:

```sh
gh workflow run bench.yml -f corpus=smoke-v1 -f prediction=<id>
```

The inputs of the workflow:

| Input | Default | What it sets |
|---|---|---|
| `corpus` | `smoke-v1` | The corpus: the name of a file in `packages/packing/bench/corpora`, without `.json`. |
| `strategies` | `all` | The entries, with commas, for example `shelf,shelf-best`. The value `all` gives each entry of the section "The entries". |
| `prediction` | (none) | The id of the prediction. Each record writes it in `prediction`. The input is necessary. |
| `repeats` | `5` | The timed passes of each pair of a strategy and an input. The record keeps the median in `ms`. |
| `warmup` | `2` | The passes before the timed passes of each pair. They have no time. |

To start the workflow on a branch, add `--ref <branch>`. GitHub starts a workflow by hand only when the default branch has the file of the workflow.

Watch the run with `gh run watch <run id>`. Get the result with `gh run download <run id> -n bench-<corpus>`.

## The entries

An entry is a strategy of the registry with some options. `packages/packing/bench/entries.ts` lists them. Each record names its entry in the field `strategy`.

| Entry | Strategy | Options | Base |
|---|---|---|---|
| `rows`, `skyline`, `shelf`, `push` | the same | the defaults | none |
| `shelf-next` | `shelf` | `fit: "next"`, `sortOrder: "height-desc"` | `shelf` |
| `shelf-first` | `shelf` | `fit: "first"`, `sortOrder: "height-desc"` | `shelf` |
| `shelf-best` | `shelf` | `fit: "best"`, `sortOrder: "height-desc"` | `shelf` |
| `shelf-first-input` | `shelf` | `fit: "first"`, `sortOrder: "input"` | `shelf` |
| `maxrects-bssf` | `maxrects` | `rule: "bssf"` | `maxrects-bl` |
| `maxrects-blsf` | `maxrects` | `rule: "blsf"` | `maxrects-bl` |
| `maxrects-baf` | `maxrects` | `rule: "baf"` | `maxrects-bl` |
| `maxrects-bl` | `maxrects` | `rule: "bl"` | none |
| `maxrects-cp` | `maxrects` | `rule: "cp"` | `maxrects-bl` |
| `skyline-mw` | `skyline` | `rule: "mw"` | `skyline` |
| `skyline-bl-waste` | `skyline` | `wasteMap: true` | `skyline` |
| `skyline-mw-waste` | `skyline` | `rule: "mw"`, `wasteMap: true` | `skyline` |
| `portfolio-k2` | `portfolio` | `k: 2` | `maxrects-bl` |
| `portfolio-k3` | `portfolio` | `k: 3` | `maxrects-bl` |
| `aspect-fit-maxrects-bl` | `aspect-fit` | `strategy: "maxrects"`, `options: { rule: "bl" }` | `maxrects-bl` |
| `aspect-fit-maxrects-bssf` | `aspect-fit` | `strategy: "maxrects"`, `options: { rule: "bssf" }` | `maxrects-bssf` |
| `aspect-fit-portfolio-k2` | `aspect-fit` | `strategy: "portfolio"`, `options: { k: 2 }` | `portfolio-k2` |
| `portfolio-area-rows-bl` | `portfolio` | `members: ["rows", maxrects-bl]`, `key: AREA_KEY` | `maxrects-bl` |
| `select-rows-bl` | `select` | the defaults: the members `rows` and `maxrects-bl`, `SELECT_TABLE` | `rows` |
| `restarts-maxrects-bl-k16` | `restarts` | `member: maxrects-bl`, `iterations: 16` | `maxrects-bl` |
| `restarts-rows-k16` | `restarts` | `member: "rows"`, `iterations: 16` | `rows` |
| `restarts-maxrects-bl-shuffle-k16` | `restarts` | `member: maxrects-bl`, `iterations: 16`, `perturb: "shuffle"` | `maxrects-bl` |

- The 4 variants of roadmap item k21 are the shelf family. `docs/PACKER.md` tells the option `fit`.
- The 5 entries of roadmap item k24 are the MaxRects family, one for each `rule`. `docs/PACKER.md` tells the rules.
- The 3 entries of roadmap item k22 are the skyline family: the rule `mw` and the waste map. `docs/PACKER.md` ("The skyline family") tells them.
- The strategy `maxrects` has no entry of its own, because its defaults are the entry `maxrects-bssf`.
- The base of a rule is `maxrects-bl`, because the move of each other rule is a place that `bl` does not choose.
- The base of a variant is the same strategy without the options of the variant. The activation compares the outputs of a variant and its base.
- An entry of the registry gets no options from the runner. A variant gets the defaults of its strategy, with its options over them.
- The 2 composite entries of roadmap item k20, part 2 pack each input with the set of 2 or 3 members of its cell. Their move is `move.pick`.
- A composite entry is not in the pool of the portfolio report: not in the oracle, the greedy sets, the sole wins and the losers. The ranking has it.
- The 4 composite entries of roadmap item k62 are `ASPECT_FIT_ENTRIES`. An entry `aspect-fit-<entry>` wraps that entry with `aspectFit`. `docs/PACKER.md` ("The aspect fit") tells it.
- On a container of fixed size, an entry `aspect-fit-<entry>` gives the output of its base. On a free size, its move is `move.aspectPick`.
- The entry `portfolio-area-rows-bl` has the 2 members `rows` and `maxrects-bl`. Its key `AREA_KEY` puts `pack.area` before `pack.overflow.excessArea` and `pack.fill`. Its move is `move.pick`.
- The entry `select-rows-bl` of roadmap item k66 is `SELECT_ENTRIES`. It packs with one member, from the features of the input. Its move is `move.select`. `docs/PACKER.md` ("The feature select") tells it.
- The 3 entries of roadmap item k78 are `RESTARTS_ENTRIES`. Each one packs 16 times with its member, in random orders, and keeps the best output. Its move is `move.restartPick`. `docs/PACKER.md` ("The random restarts") tells it.

## The jobs

1. The job `plan` examines the inputs and makes a list of the entries with `main.ts list`.
2. The matrix `run` has one job for each entry. Each job packs each input of the corpus with its entry.
3. The job `merge` joins the records of all jobs into one artifact.

A job of the matrix fails when a strategy throws an error on an input. The other jobs continue, and `merge` keeps their records.

## The smoke check of each pull request

The workflow `Bench smoke` (`.github/workflows/bench-smoke.yml`) runs on each pull request and on each push to `main`. It has one job with these steps:

1. It installs the dependencies with `pnpm install --frozen-lockfile`.
2. It gets the entries with `main.ts list`. Then it packs the corpus `smoke-v1` once for each entry, with `--repeats 1` and `--warmup 0`.
3. It joins the folders of the entries with `main.ts merge`.
4. It examines the merged folder with `main.ts check`, and it writes the coverage table into the summary of the job.

The command of the check is:

```sh
node packages/packing/bench/main.ts check <folder>
```

The check reads `run.json` and `records.jsonl` of the folder. The code is in `packages/packing/bench/smoke-check.ts`. The check fails when one of these conditions is true:

- A strategy has an error on an input.
- The file `records.jsonl` has no records.
- A measured record has a hard count above 0, or `deterministic` is `false`.
- The coverage of a strategy in `run.json` does not agree with its records.
- The coverage of `rows`, `shelf`, `skyline` or a variant of the shelf family is below 1.
- A measured record has a `pack.overflow.forced` above its `pack.overflow`. The forced overflow is a lower bound, thus this is an error of the bound.
- A measured record has a `pack.overflow.forcedArea` above its `pack.overflow.area + 1e-9`. This is an error of the area bound, or of the packer.
- A measured record has a `pack.outsideExact` above 0: a box is out of the true outline of the container.
- A measured record has a `pack.gap` below 0: the bound of the cell is above the result, so the bound is wrong.

The strategy `push` has only the mode `incremental`, and each input of `smoke-v1` is offline. Thus its coverage is 0. The table shows it, and the check does not fail on it.

The check reads no time. The times of this job are not a gate. Only the runs of `Bench` give times that compare.

## The runner

The runner is `packages/packing/bench/main.ts`. Node.js starts it with no build step. The script `bench` of the package starts it:

```sh
pnpm --filter @mark1russell7/packing bench run --corpus smoke-v1 --prediction <id> --repeats 5 --out <folder>
```

For each strategy and each input of the corpus, the runner does these steps:

1. It examines the cell of the input in the manifest. It writes a skipped record when the strategy does not support a value of the cell.
2. It packs the input 2 times with the seed of the input. Thus it gets `deterministic` with `isDeterministic`.
3. It packs the input `warmup` times, and then `repeats` times with a clock. The median of the times is `ms`.
4. It examines the output of the first packing with `checkHard`, and it gets the measures with `measure`.
5. It adds the count of the move of the strategy from the trace, and `pack.outsideExact`. The section "The screen guards" tells these measures.
   It also adds `pack.bound`, `pack.bound.kind` and `pack.gap` of `boundMeasures`. `docs/MEASURES.md` tells them in the section "Bounds".
6. It writes one `layout-record/1` line with the measures rounded by `roundMeasures`.

The flag `--interleave` changes only the order of the timed passes. For each input, the runner does the warm-up passes of each strategy. Then, for each repeat, it does one timed pass of each strategy. The records, their order and their format do not change. `run.json` gets `"interleave": true`. The job `time` of the section "The win test" uses this flag.

The runner does not stop at an error of a strategy. It writes the error in `run.json` and in the summary, and it exits with the code 1.

A strategy of the mode `incremental` gets only skipped records on an offline corpus. Each generator of the package makes offline inputs, so the runner skips `push` on each input.

## The corpora

Each corpus is a `layout-corpus/1` manifest with its `specs` and no `inputs`. The runner makes the inputs from the specs with `corpus`.

| Corpus | Inputs | Use |
|---|---|---|
| `smoke-v1` | 13 | The unit tests of the runner, and a quick check of the workflow. It has at most 100 boxes in each input. |
| `pack-screen-v1` | 1305 | The first screen of the packer. Write its prediction before its first benchmark. |
| `pack-holdout-v1` | 522 | The test corpus of the per-cell portfolio: the specs of `pack-screen-v1` with the new seeds 6 and 7. Write its prediction first. |
| `pack-free-v1` | 720 | The corpus of free sizes of roadmap item k62: `freeAspect` and `freeArea` with each shape. Write its prediction first. |
| `pack-select-v1` | 2025 | The test corpus of the feature select of roadmap item k66: the specs of `pack-screen-v1` and `pack-free-v1` with fresh seeds. Write its prediction first. |
| `pack-select-v2` | 2025 | The second test corpus of the feature select: the specs of `pack-select-v1` with the fresh seeds 31 to 35. Write its prediction first. |
| `pack-known-v1` | 288 | The inputs with a known best value of roadmap item k45. Each record has `pack.gapToOpt`. Write its prediction first. |
| `pack-classes-v1` | 500 | The classes `I` to `X` of the literature of roadmap item k106, by their rules. Write its prediction first. |

A corpus file can have the field `heldOut`: a seed, or `all`. It sets the held-out split of the portfolio report. The default is the seed 3.

- `pack-holdout-v1` has `heldOut: "all"`. Each of its inputs is held out, and the report chooses no set.
- With `all`, the report scores the sets of `PORTFOLIO_SETS`, which come from the records of `pack-screen-v1`.
- `run.json` keeps the split in the field `heldOut`. A merge refuses runs with two different splits.

The corpus `pack-screen-v1` has these specs, each with the seeds 1 to 5:

- `rect-grid` with each `containerShape` and each layout of `obstacles`, the sizes `uniform` and `heavyTail`, and the counts 10, 100 and 1000.
- `gallery`, `dashboard`, `cards` and `word-cloud`, each with the count 100.
- `edge-cases` with each case: `empty`, `one`, `oversize`, `exactTiling` and `touchObstacles`.

The corpus `pack-free-v1` has the specs of `rect-grid` version 2, each with the seeds 11 to 15:

- the `containerSize` `freeAspect` and `freeArea`, with each `containerShape`: `rect`, `convex`, `polygon`, `circle`, `ellipse` and `holes`
- the sizes `identical`, `uniform` and `heavyTail`
- the `order` `free` and `soft`, and the counts 10 and 100.

The corpus `pack-select-v1` has the 261 specs of `pack-screen-v1` and the 144 specs of `pack-free-v1`, each with the fresh seeds 21 to 25.

- It has `heldOut: "all"`. The fit of `SELECT_TABLE` did not see these seeds.
- Its `claims.declared` counts are `order` 360, `aspect` 360, `free-size` 740 and `shaped` 1650, with no thin property.
- The corpus `pack-select-v2` has the same specs and claims with the fresh seeds 31 to 35. It is the second confirmation of `select` before a change of the default. The win test and its limits do not change between the two corpora.

The corpus `pack-known-v1` has 24 specs, each with the seeds 1 to 12:

- `perfect-cut` with the cuts `guillotine` and `free`, the sizes `fixed`, `freeHeight` and `freeArea`, and the counts 10, 30 and 100. Each input has a known optimum.
- `consecutive-squares` with the sizes `freeHeight` and `freeArea`, and the counts 10, 30 and 100. Each input has a known lower bound.
- It has `heldOut: "all"`. Its `claims.declared` counts are `order` 0, `aspect` 0, `free-size` 216 and `shaped` 0. The thin properties are `order`, `aspect` and `shaped`.
- The builder `bench/known.ts` writes the file. `node bench/known.ts --check` and a test compare the file with the builder.

The corpus `pack-classes-v1` has 100 specs, each with the seeds 1 to 5. It has no published instance file. The generators make each input by the rules of its class.

- `berkey-wang` makes the classes `I` to `VI` of Berkey 1987. `martello-vigo` makes the classes VII to X of Martello 1998. Lodi, Martello and Vigo (1999 and 2002) give the 10 classes.
- Each class has the containers `fixed` (one bin of the class) and `freeHeight` (a strip of the width of the bin), and the counts 20, 40, 60, 80 and 100.
- It has `heldOut: "all"`. Its `claims.declared` counts are `order` 0, `aspect` 0, `free-size` 250 and `shaped` 0.
- The builder `bench/classes.ts` writes the file. `node bench/classes.ts --check` and a test compare the file with the builder.

The rules of the classes. Each side is a whole number, uniform in its range, with both ends included.

| Class | Bin `W` x `H` | Item width | Item height |
|---|---|---|---|
| `I` | 10 x 10 | 1 to 10 | 1 to 10 |
| II | 30 x 30 | 1 to 10 | 1 to 10 |
| III | 40 x 40 | 1 to 35 | 1 to 35 |
| IV | 100 x 100 | 1 to 35 | 1 to 35 |
| V | 100 x 100 | 1 to 100 | 1 to 100 |
| VI | 300 x 300 | 1 to 100 | 1 to 100 |
| VII to X | 100 x 100 | the item type | the item type |

The 4 item types of the classes VII to X. Each class has one main type with the probability 0.7. Each other type has the probability 0.1.

| Type | Width | Height | Main type of |
|---|---|---|---|
| 1, wide | 67 to 100 | 1 to 50 | VII |
| 2, high | 1 to 50 | 67 to 100 | VIII |
| 3, large | 50 to 100 | 50 to 100 | IX |
| 4, small | 1 to 50 | 1 to 50 | X |

The bounds of the classes come from `pack.bound` of k51, with no new kind:

- A strip gets `strip.area`, the item area divided by `W`, and the stronger `strip.mmv` and `strip.tallest`.
- One fixed bin gets `placed.free`. The placed share is at most `W * H` over the item area: the bin count bound L1 in a form for one bin.
- `binCountBound` gives L1 as a count of bins: the item area divided by `W * H`, rounded up.

Version 2 of `rect-grid` adds the parameter `order`. With `soft`, each item gets a `rank` from a permutation of the seed. Version 1 does not change.

The name `screen-v1` is the screen set of the router `highways`. Thus the packer uses the name `pack-screen-v1`, and a joint reader of the records sees no conflict.

No generator of the package makes an input with a `base` and a `change` yet. Thus no record has the stability measures. When the corpus has change pairs, the runner adds the measures of `measureChange` against the run on the base input.

## The predictions

The file `packages/packing/bench/predictions.jsonl` keeps the predictions of this repository. It starts with no lines. Each line is one JSON object:

```json
{ "schema": "layout-prediction/1", "id": "p-2026-10-28-shelf-fill", "strategy": "shelf", "set": "pack-screen-v1", "measure": "pack.fill", "expected": 0.7, "op": ">=", "reason": "The shelf fills the rows of the uniform sizes well." }
```

| Field | Use |
|---|---|
| `id` | The id of the prediction. The input `prediction` of the workflow names it. Necessary. |
| `strategy`, `set`, `input` | The records of the prediction. Without a field, the prediction is about each value of that field. |
| `measure` | The id of a measure, `ms` for the time, or `pack.coverage` for the coverage of the run. |
| `cell` | Only for `pack.coverage`: `{ "containerShape": "circle" }` uses the coverage of one container shape. |
| `expected`, `op` | The expected value and the comparison. Without `op`, a measure where lower is better gets `<=`, and the others get `>=`. |
| `reason` | The reason for the prediction. |

Without `input`, the summary compares the median of the measure over the records with the expected value.

The measure `pack.coverage` does not come from the records. It comes from the field `coverage` of `run.json`. Its default `op` is `>=`. Without `strategy`, the prediction adds the counts of all the strategies.

```json
{ "schema": "layout-prediction/1", "id": "p-2026-10-28-circle", "strategy": "skyline", "measure": "pack.coverage", "cell": { "containerShape": "circle" }, "expected": 1, "reason": "The container layer packs each circle container." }
```

## The artifacts

Each job of the matrix keeps the artifact `bench-<corpus>-<strategy>`. The job `merge` keeps the artifact `bench-<corpus>`. Each artifact has these files:

| File | Content |
|---|---|
| `records.jsonl` | One `layout-record/1` line for each pair of the job: a measured record or a skipped record. The lines keep the order of the strategies, and then the order of the inputs. |
| `run.json` | The facts of the run: the corpus, the prediction, the commit, the counts of runs, the computer, the skipped pairs, the errors, the coverage and the screen guards. |
| `corpus.json` | The manifest of the corpus, with the id, the hash and the cell of each input. |
| `summary.md` | The summary. The page of the run on GitHub also shows it. |

### The fields of a record

A record has each field of `layout-record/1` in `docs/FORMAT.md`. These values are specific to the packer:

- `stage` and `step` are `pack`.
- `options` holds the defaults of the strategy, with the options of the entry over them. An entry of the registry has only the defaults.
- `nodes` counts the boxes and the obstacles of the input, as the twin document of `highways` does.
- `commit` holds the first 7 characters of the commit.
- `measures` holds the measures of `measure`. The value `pack.search.ms` is the median of the timed runs.
- `measures` also holds the move count of the strategy, for example `move.stack`, and `pack.outsideExact`.
- `measures` also holds the bound measures `pack.bound`, `pack.bound.kind` and `pack.gap`, when the cell has a bound.

A record also has these optional fields of `docs/FORMAT.md`:

| Field | Content |
|---|---|
| `msRuns` | The time of each timed run, in milliseconds. Their median is `ms`. |
| `outputHash` | The first 16 hex characters of the SHA-256 of the placements, sorted by id and rounded to 3 decimals. The value -0 becomes 0. Thus the same hash tells the same placements to 3 decimals, not exactly the same placements. |
| `env` | The computer: the version of Node.js, the operating system, the processor and the name of the runner. |
| `skipped` | The reason when the runner did not pack the pair, for example `unsupported mode: offline`. Only a skipped record has it. |

### The declared properties

A corpus file can have the claim `claims.declared`: the count of its inputs for each declared property. `bench/claims.ts` gives the ids. `checkDeclared` of `layout-contract` checks the claim.

| Id | The input declares it when |
|---|---|
| `order` | the cell `order` is `soft` or `hard`. An item has a `rank`. |
| `aspect` | the container has `aspect` |
| `free-size` | the cell `containerSize` is not `fixed` |
| `shaped` | the container has a shape that is not a rectangle |

- The claim has `minCount`, the list `thin` and `counts`. Each id is in `counts`, with the count of the generated inputs.
- An id with a count below `minCount` is in `thin`. Thus a thin property is a known fact of the corpus, not a surprise.
- A run makes the inputs and then examines the claim. A false claim stops the run before the first packing, with an error that names each problem.
- `run.json` keeps the counts in the field `declared`, and `summary.md` gives them in the table "Declared properties".
- The counts are facts of the corpus, not measures. `pack-screen-v1` has the thin properties `order` and `aspect`.

### The coverage

The field `coverage` of `run.json` tells which part of the corpus each strategy packed. A record has no field for it.

- For each strategy, `measured` counts the inputs with a measured record, and `inputs` counts all the inputs.
- The value `coverage` is `measured / inputs`, with 3 decimals.
- The field `shapes` has the same 3 values for each `containerShape` of the cells of `corpus.json`.
- The job `merge` adds the counts of the jobs. A `run.json` from before 0.2.1 has no coverage.

A skipped record is the record of a pair that the strategy does not support. It has `skipped`, and `measures` and `hard` are empty objects. Its `ms` is 0, and it has no `msRuns` and no `outputHash`. The medians, the tables and the predictions of the summary ignore the skipped records.

## The screen guards

Roadmap item k59 adds these guards to each run. Roadmap item k60 adds the ranking. The code is in `packages/packing/bench/screen.ts`. The guards come from the records, so the job `merge` makes them again from the records of all the jobs. A merge without records has no guards.

### The fields of the screen in `run.json`

| Field | Content |
|---|---|
| `fill` | For each strategy: `all` and `clean`, each with `records` and the `median` of `pack.fill`. The field `shapes` has the same values for each container shape. |
| `overflow` | For each strategy: `records`, `overflowing`, `share`, the `means` and the `medians` of the overflow measures and the sum `outsideExact`. The field `shapes` has the same values for each container shape. |
| `ranking` | For each container shape: `inputs`, `commonClean` with `inputs` and `share`, the flag `thin`, and the `entries` in the order of the ranking. |
| `outputGroups` | The output groups. Each group has its `strategies` and the count of its common `inputs`. |
| `cellGroups` | For each container shape: its `groups`, and its `pairs`, each with `a`, `b`, `inputs`, `equal` and `share`. |
| `activation` | For each strategy: `move`, `records`, `fired`, `count`, `label` and `reason`. The field `shapes` has the same values for each container shape. |
| `portfolio` | For `all` and each container shape: the split `heldOut`, the input counts, the `pool`, the `oracle`, `sets_from`, the `best` single entry, the `sets`, the composite `entries`, the `soleWins` and the `losers`. |

The container shape of an input comes from its cell in `corpus.json`. An input that is not in the manifest gets the shape `unknown`.

### Ranking

The ranking compares the strategies in each container shape in two steps. A strategy with no measured record in the shape is not ranked there.

1. Step 1 orders the entries by the median `pack.overflow.excessArea` of their measured records. Lower is better.
2. The entries within the minimum effect of the best entry make tie group 1. The minimum effect is 0.005, from `MEASURE_SPECS` and `compareMeasure` of the contract.
3. The other entries make tie groups 2, 3 and more, by the same rule. Each group starts at its best remaining entry.
4. Step 2 orders each tie group by the median `pack.fill` on the common clean inputs. Higher is better.
5. Neighbour entries of one tie group share a fill tie group when their fills are within the minimum effect of `pack.fill`.

The minimum effect of `pack.fill` is 0.005, from `MEASURE_SPECS` and `compareMeasure` of the contract. A fill tie group is a chain:

- Each entry of the chain is within 0.005 of the next entry. Thus the first and the last entry can be more than 0.005 apart.
- The order in a fill tie group is a tie. The fill does not separate these entries.
- An entry with no fill tie has no field `fillTie`. The summary shows `-` for it, and `tie <n>` for an entry of group `n`.

A common clean input of a shape has a measured record with `pack.overflow` 0 for each measured strategy of the shape. Thus the fill of step 2 is a paired comparison.

- `commonClean` gives the count of these inputs and their share of the inputs of the shape.
- A shape with a share below 0.3 is `thin`. Its fill rank uses few inputs, so it is weak.
- The members of a cell group have equal outputs. They are one entry, with the name of the group, for example `rows = shelf`. The first member gives the values.

Each entry has these fields:

| Field | Content |
|---|---|
| `name` | The strategy, or the members of the cell group with ` = ` between them. |
| `strategies` | The strategies of the entry. |
| `rank` | The rank in the shape, from 1. |
| `records` | The measured records of the entry in the shape. |
| `excessArea` | Step 1: the median `pack.overflow.excessArea`. |
| `tieGroup` | The tie group of step 1, from 1. |
| `fill` | Step 2: the median `pack.fill` on the common clean inputs. |
| `fillTie` | The fill tie group of step 2, from 1. Only an entry with a fill tie has it. |
| `diagnosticCleanFill` | A diagnostic: the median `pack.fill` of the records of the entry with no overflow. It is not paired. |

### Fill without overflow

A layout that leaves items out gets a high fill. Thus the field `clean` uses only the records with `pack.overflow` 0. The field `all` keeps the median of all the measured records, and the summary shows the two values with their counts. The summary ranks the strategies by `clean`.

Since k60, this rank is a diagnostic. Each strategy has its own clean records, thus two strategies do not compare on the same inputs. The section `Ranking` gives the paired rank.

### Overflow and the true outline

The table `Overflow` gives the mean of `pack.overflow`, `pack.overflow.rate`, `pack.overflow.area`, `pack.overflow.forced`, `pack.overflow.excess`, `pack.overflow.forcedArea` and `pack.overflow.excessArea`. It also gives the median of the last two. `docs/MEASURES.md` tells each one.

The count bound `pack.overflow.forced` is weak on mixed sizes. Thus judge a strategy by `pack.overflow.excessArea`, the overflow area above its bound.

The measure `pack.outsideExact` counts the boxes out of the true outline of the container. It is `in-container` of `checkHard` with `exactContainer` set to `true`. For a circle, an ellipse or a polygon, this test uses the shape, not only its bounding box. Lower is better, and the floor is 0. The smoke check fails when it is above 0.

### Distinct outputs

The runner compares the strategies by `outputHash`. The hash uses the placements rounded to 3 decimals, thus two equal hashes tell the same placements to 3 decimals.

- Two strategies are equal on a set of inputs when they have 1 common measured input or more, and the same hash on each one.
- An output group is a set of 2 strategies or more that are equal on each common input of the run.
- A cell group is the same, but only on the inputs of one container shape.
- A pair gives `inputs`, the common inputs of the 2 strategies, and `equal`, the inputs with the same hash. The value `share` is `equal / inputs`.

Each strategy goes into the first group where it is equal to each member. A strategy that is equal to no other strategy is in no group.

### Activation

Each strategy counts its characteristic move, and its trace holds the count. The count does not change a placement.

| Strategy | Move | The move |
|---|---|---|
| `rows` | `move.gapFill` | The gap fill of a row places a box: under a shorter neighbor, or at the break of the row. |
| `shelf` | `move.stack` | A box goes on an open shelf that a taller box made. |
| `shelf-next` | `move.stack` | A box goes into the strip above a shorter box of a shelf. |
| `shelf-first`, `shelf-first-input` | `move.firstFit` | A box goes on a shelf that is not the open shelf: the last shelf that the packing opened. |
| `shelf-best` | `move.bestFit` | A box goes on a shelf that is not the first shelf where it fits, because that shelf has less height left over. |
| `skyline` | `move.lowerWindow` | The skyline puts a box in a lower window, not in the leftmost window where it fits. |
| `push` | `move.cascade` | A push cascade moves a box. |
| `maxrects-bssf` | `move.bssf` | The rule `bssf` puts a box in a place that the rule `bl` does not choose. |
| `maxrects-blsf` | `move.blsf` | The rule `blsf` puts a box in a place that the rule `bl` does not choose. |
| `maxrects-baf` | `move.baf` | The rule `baf` puts a box in a place that the rule `bl` does not choose. |
| `maxrects-bl` | `move.split` | A box cuts 2 free rectangles or more. |
| `maxrects-cp` | `move.cp` | The rule `cp` puts a box in a place that the rule `bl` does not choose. |
| `skyline-mw` | `move.minWaste` | The rule `mw` puts a box in a place that the rule `bl` does not choose. |
| `skyline-bl-waste` | `move.wasteFill` | The waste map puts a box in a free rectangle below the skyline. |
| `skyline-mw-waste` | `move.wasteFill` | The waste map puts a box in a free rectangle below the skyline. |

The trace of each `maxrects` entry also has `move.split`. The activation reads only the move of the entry.

A strategy is `exercised` when its count is above 0 on 1 input or more. Else it is `not-exercised`, and `reason` tells why. The activation also has one cell for each container shape.

A variant also gets `base` and `differs` when the run has the records of its base. `differs` counts the common inputs where the `outputHash` of the variant is not the hash of the base. A variant is `exercised` when its count is above 0, or when `differs` is above 0. This is the rule of PROMOTION. A job of the matrix has only its own entry, thus only the merged run gives `differs`.

A variant that is equal to another entry on each common input is in one output group with it. Such a group is valid. It tells that the option has no effect on those inputs.

The strategies `rows` and `shelf` pack a container that is not a rectangle with the same packer. That packer does not make their moves. Thus they are `not-exercised` on such a shape, and their outputs on it are often in one cell group.

### Portfolio

Roadmap item k20 adds the portfolio report. The code is in `packages/packing/bench/portfolio.ts`. The report reads the records. It does not start a packer again.

The pick rule is `selectBest` of the contract, with the levels `PORTFOLIO_LEVELS` of the package. `packPortfolio` uses the same levels.

| Level | Value | Better | Minimum effect |
|---|---|---|---|
| `hard` | The hard breaks with `exactContainer`: the sum of `hard`, with `pack.outsideExact` in place of `in-container` | lower | 0 |
| `pack.overflow.excessArea` | The overflow area above its bound | lower | 0.005 |
| `pack.fill` | The fill of the hull | higher | 0.005 |

At each level, `selectBest` keeps each candidate that ties the best value. Then the first candidate that is left wins. A tie is not a chain: with the values 0, 0.004 and 0.008 and the minimum effect 0.005, the filter keeps 0 and 0.004 only.

The report has one cell for all the shapes (`all`) and one cell for each container shape. Each cell has these parts:

- The oracle: the best single entry of each input by `selectBest` over all the single entries. Each tie goes to the first entry of the run.
- A set wins an input when its own winner is in the last kept list of the oracle.
- The main measure is the mean regret against the oracle. The excess area regret is the `pack.overflow.excessArea` of the winner less that of the oracle.
- The fill regret is the fill of the oracle less the fill of the winner. A set with no record on an input counts the fill 0 and the excess area 1.
- The time of a set is the sum of the `ms` of its members. The keep rate is the win share divided by the mean time of an input.
- The report chooses each set on the seeds other than the held-out seed (3 by default). It scores each set on the held-out seed.
- The choice adds one entry at a time. At each step, `selectBest` on `CHOICE_LEVELS` picks the set, with a tie to the first entry of the run.
- `CHOICE_LEVELS` are the mean hard regret, the mean excess area regret and the mean fill regret, each with the minimum effect of its measure. Then the win share, then the mean time.
- A sole win is an input of any seed where exactly one entry is in the last kept list of the oracle.
- A loser is an entry with no sole win. The report gives the losers, and they stay in the pool.

Each set also has a score at each limit: `default`, 50 ms, 200 ms and 1000 ms. A limit score is the win share, the excess area regret and the fill regret.

- The limit `default` runs the first `defaultMembers` members. The default count is the largest prefix with a median summed time of `PORTFOLIO_FRAME_MS` (50 ms) or less.
- A time limit uses the prefix rule of the contract: the first member always runs. A later member runs only while the summed time is under the limit.
- The limit scores read the `ms` of the member records. They do not start a packer again.

The composite entries `portfolio-k2` and `portfolio-k3` get rows of their own. Each row reads the records of the entry.

- A composite entry wins an input when it stays in the last kept list of `selectBest` over the single entries and itself.
- Its regrets are against the oracle of the single entries. Thus a regret below 0 is possible.
- Its limit scores use the members of each input, from `portfolioMembers`, and the member records.

The corpus `smoke-v1` has the seeds 1 and 2 only. Thus its sets have no held-out score, and the summary shows `-`.

### The per-cell portfolio

`packages/packing/bench/choose-sets.ts` writes the table `src/portfolio-sets.ts` from the records of one run. It does not start a packer.

```sh
node bench/choose-sets.ts <folder> --run <id>
```

- The folder holds `records.jsonl`, `corpus.json` and `run.json` of the run. `gh run download <id> -n bench-<corpus>` gives them.
- The table of 0.2.7 comes from the run 40652567756 of `pack-screen-v1`, commit `f6a489b`. The choice uses all its 1305 inputs.
- The cell of an input is `portfolioCell`: the container shape, the band of the count and the band of the size spread. `docs/PACKER.md` tells the bands.
- Each cell, each container shape and the group `all` get greedy sets of 1, 2 and 3 members, with the rule of the report.
- A cell with fewer than 12 inputs (`THIN_INPUTS`) is thin. It has no sets, and it uses the sets of its shape.
- Each group also gets the median summed time of each prefix of its set of 3, and its `defaultMembers`.
- The corpus `pack-holdout-v1` tests the table on new seeds. Its split is `all`.

## The win test

`packages/packing/bench/promote.ts` applies the win test of the promotion rule (`docs/PROMOTION.md`) to the records of one run. It compares a candidate with the current default on the same inputs. It does not start a packer.

```sh
node bench/promote.ts <folder> --candidate maxrects-bl --default rows --win pack.fill --times <folder> --out <folder>
```

- The first folder holds `records.jsonl` and `corpus.json` of a run. `gh run download <id> -n bench-<corpus>` gives them.
- `--win` names the win measures, with commas. The default is `pack.fill`.
- `--times <folder>` gives the time source: a folder of records with the same strategy ids. The time test then reads only the `ms` of these records.
- `--time-floor-ms <n>` sets the time floor. The default is `TIME_FLOOR_MS`, 5 ms: `timeFloorMs` of the shared rule. `--time-floor-ms 0` gives the rule without a floor.
- `--guards v1|v2` sets the guard set. The default is `v2`. [The guard sets](#the-guard-sets) tells the two sets.
- `--compare-guards` adds the verdict of each guard set on the same records. `promotion.md` then shows the `v1` and `v2` verdicts side by side.
- The tool writes `promotion.json` and `promotion.md` in the `--out` folder. A verdict `fail` is not an error of the process.

The shared rule says: CI times the candidate and the default on the same machine, in alternation. The jobs of `bench.yml` cannot do this, because each strategy has its own runner.

The workflow `Promotion` (`.github/workflows/promotion.yml`) has two jobs:

1. The job `time` packs the corpus with the candidate and the default on one runner, with `--interleave`, `--repeats 5` and `--warmup 1`. It keeps the artifact `promotion-time-<candidate>`.
2. The job `promotion` downloads the records of a bench run and the time records. It starts the tool with `--times`, `--guards` and `--compare-guards`.

```sh
gh workflow run promotion.yml -f run=<id> -f corpus=pack-holdout-v1 -f candidate=maxrects-bl -f repeats=5
```

- The input `guards` sets the guard set of the verdict. The default is `v2`.
- The input `times_run` is the run id of an earlier run of `promotion.yml`. Then the job `time` does not pack. The job `promotion` downloads the artifact `promotion-time-<candidate>` of that run, and it uses these time records.
- To score the records again with new guards and the same times, give `times_run`. The candidate must be the candidate of that run.

```sh
gh workflow run promotion.yml -f run=<id> -f corpus=pack-holdout-v1 -f candidate=maxrects-bl -f times_run=<promotion run id>
```

The workflow keeps the artifact `promotion-<candidate>`, and the page of its run shows `promotion.md`. A pull request starts the job `time` on the small corpus `smoke-v1`, and the guards on the records of run 40662373078.

### The guard sets

A guard of a property applies only to the inputs that declare the property. `GUARD_DECLARATIONS` of `bench/promote.ts` names, for each guard, the input field that declares its property. `docs/PROMOTION.md` ("The parts of packing") gives the table.

| Guard | `v1` | `v2` |
|---|---|---|
| `pack.fill` | each input | each input |
| `pack.area` | each input | each input with a free size. In a fixed cell, only the inputs where both records have the same `pack.overflow`. |
| `pack.aspectError` | each input | the inputs with the cell `containerSize` `freeAspect`, the only cell where the container has `aspect` |
| `pack.order.inversions` | each input | the inputs with the cell `order` `soft` or `hard` |
| `pack.overflow` | the fixed cells | the fixed cells |
| `pack.stability.*` | the change pairs | the change pairs |

- The records and `corpus.json` do not hold the container of an input. Thus the tool reads the cell of each input in `corpus.json`.
- A guard without a declaration fails when no input has its measure. A guard with a declaration is left out when no input declares its property.
- The hard rules, the gain test and the time test apply to each input in both sets.
- `v1` gives the verdict of the tool before the declared guards. A test keeps this verdict on the fixture `bench/fixtures/promote-guards-v1.json`.
- `promotion.json` and `promotion.md` name the guard set (`guardSet`). For each guard, they give the covered inputs and the left-out inputs with the reason (`coverage`).
- With `--compare-guards`, `promotion.json` has the verdict of each set in `compare`. A rescore reports the `v1` and `v2` verdicts together.
- With `--compare-guards`, `promotion.json` also has the view `views.orderNotRequired`: the verdict of `v2` without `pack.order.inversions` on each input.
- The view is exploratory, and it decides nothing. Its field `decides` is `false`, and `promotion.md` labels it. It is a report, not a caller profile of `docs/PROMOTION.md`.

### Read the verdict

The first table of `promotion.md` has one row for each test, with its value, its limit and its result. A ratio above 1 is worse.

| Test | Rule |
|---|---|
| hard rules | No input has a hard count of the candidate above that of the default. Each record of the candidate is deterministic. |
| median | For each guard, the median of the paired ratios is at most 1.02. |
| tail share | For each guard, at most 10% of the inputs have a ratio above 1.1. |
| gain median | The median ratio of a win measure is at most 0.95. |
| gain sign test p | The one-sided sign test of the better and the worse inputs gives a p-value below 0.05. The ties do not count. |
| gain bootstrap high | The upper end of the 95% interval of the bootstrap of the median ratio is below 1. |
| time median | The median time ratio is at most 1.5. |
| time quantile 0.95 | The quantile 0.95 of the time ratios is at most 2. |

- The guards are `pack.area`, `pack.fill`, `pack.aspectError` and `pack.order.inversions`. `pack.overflow` is a guard on the inputs with a fixed container. [The guard sets](#the-guard-sets) tells the inputs of each guard.
- The table "The guard coverage" gives the covered inputs of each guard, and the left-out inputs with the reason.
- The stability measures are guards only when the records have change pairs.
- The floor rule applies when the default is at the floor of a measure. The table "The floor rule" counts these inputs. `promotion.json` names them.
- The classification uses `compareMeasure` of the contract. A change of the minimum effect or less is a tie.
- The time of an input is the field `ms` of the record: the median time of the timed passes of the whole pack. `pack.search.ms` counts only the width search, and it is 0 for most entries.
- With `--times`, the time test uses the inputs of the time records with a measured record of each strategy. The other tests use the first folder.
- The time ratio of an input is `t / max(b, timeFloorMs / timeRatio)`, with the candidate time `t` and the default time `b`. The floor is 5 ms, so the least denominator is 3.33 ms.
- The tool leaves out each input without a measured record of each strategy, and it counts these inputs.
- The confirmation count compares the inputs with `confirmInputs`, 200. It does not change the verdict.

The table of the container shapes gives the same tests for each shape. It is information for a rule of the selector, and it does not change the verdict.

`promotion.md` and `promotion.json` (`timeSource`) name the time source and the CPU models of its records, from the field `env` of each record. When the candidate and the default have different CPU models, `promotion.md` shows a warning. The records of `bench.yml` alone give this warning, because each strategy has its own runner.

## A CPU profile

The workflow `Profile` (`.github/workflows/profile.yml`) finds the functions that use the time of a strategy on its slowest inputs. Start it with the GitHub CLI:

```sh
gh workflow run profile.yml -f corpus=pack-screen-v1 -f strategy=maxrects-bl -f times_run=40683546461 -f slowest=20
```

| Input | Default | What it sets |
|---|---|---|
| `corpus` | `pack-screen-v1` | The corpus of the time records. The job packs its inputs again. |
| `strategy` | `maxrects-bl` | The entry to profile. |
| `times_run` | `40683546461` | The id of a `promotion.yml` run. Its artifact `promotion-time-<strategy>` gives the time records. |
| `slowest` | `20` | The count of the inputs with the highest time ratio against `rows`. |
| `rank` | `ratio` | The order of the slowest inputs: `ratio` against `rows`, or `ms`, the time of the strategy. Use `ms` when `rows` is as slow as the strategy. |

The job starts `bench/profile.ts`:

1. It picks the inputs with the highest time ratio `t / max(b, 5 / 1.5)` from the time records.
2. It times the strategy and `rows` on each input without the profiler, in alternation.
3. It packs each input 3 times with the strategy under the V8 CPU profiler.
4. It does steps 2 and 3 again with the flags `--no-turbo-inlining` and `--no-maglev-inlining` of V8.

V8 gives the samples of an inlined function to its caller. The second profile keeps the samples of each function apart, but its times are longer.

The artifact `profile-<strategy>` has `profile.cpuprofile`, `profile.md` and `profile.json`, and the folder `no-inlining` has the files of the second profile. Open `profile.cpuprofile` in the Performance panel of Chrome DevTools. `profile.md` is also in the job summary. It has these tables:

- The times of the strategy and `rows` on each input, with their medians. A small time of `rows` gives a high ratio.
- The top 25 functions by self time. The rows `(garbage collector)`, `(program)` and `(idle)` stay in this table. The head gives the share of the garbage collector.
- The top 25 functions by total time, the self time of each file, and the top 25 source lines by samples.

A run on a local computer gives no valid times. Use it only to examine the script on a small corpus:

```sh
node bench/profile.ts --corpus smoke-v1 --strategy maxrects-bl --inputs <id>,<id> --out bench-out/profile
```

## A paired time test

Two bench runs often go on two runners with different CPUs, and their times do not compare. The workflow `Paired` (`.github/workflows/paired.yml`) times two refs of the repository in one job. Start it with the GitHub CLI:

```sh
gh workflow run paired.yml -f arm_a=v0.2.16 -f arm_b=<branch> -f corpus=pack-select-v2 -f strategy=rows -f prediction=<id>
```

| Input | Default | What it sets |
|---|---|---|
| `arm_a` | | The ref of the arm A, the base: a tag, a branch or a commit. |
| `arm_b` | | The ref of the arm B, the change. |
| `corpus` | `pack-select-v2` | The corpus. The tool of the default branch makes its inputs. |
| `strategy` | `rows` | The strategy that both arms pack with. |
| `prediction` | | The id of the prediction of the run. |
| `repeats` | `5` | The timed passes of each arm on each input. |

The job starts `bench/paired.ts`. The script loads `packWith` of both arms in one process. For each input, it packs once with each arm and does 2 warm-up passes of each arm. Then it does the timed passes in the order ABBA. The ratio is the median time of B divided by the median time of A.

The artifact `paired-<corpus>-<strategy>` has `records.jsonl`, `summary.json` and `summary.md`. Each record has the two times, the ratio and the placement hash of each arm. The summary gives the median ratio of the free-size rect inputs with 100 items and of the other inputs. It also gives the median ratio of each class of the other inputs.

## The cells of a candidate

`packages/packing/bench/cells.ts` finds the cells where a candidate fills more than the default (roadmap item k66). It reads the records of one run. It does not start a packer.

```sh
node bench/cells.ts <folder> --candidate maxrects-bl --default rows --times <folder> --out <folder>
```

- Each fill ratio is `fill(candidate) / fill(default)`, in the field `candidateOverDefault`. Above 1, the candidate fills more. `bench/promote.ts` uses the opposite direction.
- A win: the ratio is 1.05 (`WIN_RATIO`) or more, and the candidate has no hard count above that of the default. `hardTest` of `bench/promote.ts` gives the hard counts.
- A cell is the input id without its seed. The held-out seed is `heldOut` of `corpus.json`, or 3. The option `--held-out <seed>` changes it.
- The cell selector picks the candidate in a cell when the median ratio of the training seeds is 1.05 or more. The tool scores it on the held-out seed only.
- The oracle picks the strategy with fewer hard breaks on each input, then the strategy with more fill.
- `--times <folder>` gives the time records. The time ratio is the time of the pick divided by `max(b, 5 / 1.5)` ms, from `timeTest` of `bench/promote.ts`.
- The tool also adds a cost bound of the features: `nodes` of the record times `--ns-per-item`, 50 ns by default. The size spread needs one pass over the items.
- The cheap features are the count, the shape, the size spread, the container size and the order.
- The tables give the inputs by each cheap feature with two values or more.
- The decision tables use 1, 2 and 3 of these features. Each leaf picks with the rule of the selector. The best table of each size has the highest training accuracy.

The tool writes `cells.json` and `cells.md` in the `--out` folder. The corpus `pack-free-v1` has the seeds 11 to 15 and no `heldOut`. Thus it has no held-out input, and `--held-out 13` gives a split.

- `--split <name>` reads the split of that name from the split file of the corpus. It replaces `--held-out`, and the tool refuses the two together.
- Each fold fits its own picks on its training seeds. The held-out rows pool the held-out inputs of all the folds.
- Thus `--split loso` scores each input once, with the picks of the 4 other seeds. The tables of cells and leaves show the first fold.
- `--splits <folder>` reads the split files from another folder. The default is `packages/packing/bench/splits`.

### The split files

A split file gives the training and held-out seeds of a corpus. It is beside the corpus, not in it. Thus a split does not change the corpus or its hash.

```json
{ "schema": "corpus-split/1", "corpus": "pack-free-v1", "corpusHash": "af6c6985300e1fd1",
  "splits": { "default": { "folds": [{ "train": [11, 12, 14, 15], "heldOut": [13] }] } } }
```

- The file is `bench/splits/<corpus id>.<corpus hash>.json`. `corpusHashOf` of `@mark1russell7/layout-contract` gives the hash.
- The hash is the first 16 hex characters of the SHA-256 of `canonicalJson` of the corpus id and the `[id, hash]` of each input.
- A change of one input changes the hash. Then the tool finds no split file, and it names the split files of the corpus.
- `loadSplit` of `bench/split.ts` reads the file. `splitFolds` of `layout-contract` refuses a file with a bad schema, corpus or `corpusHash`, a split with no fold, or an unknown split name.
- In each fold, `train` and `heldOut` are not empty and have no common seed. Each seed is a seed of the corpus.

| File | Splits |
|---|---|
| `pack-screen-v1.cf53d6cf7e907de7.json` | `default`: train 1, 2, 4 and 5, held out 3. `loso`: 5 folds, each seed held out once. |
| `pack-free-v1.af6c6985300e1fd1.json` | `default`: train 11, 12, 14 and 15, held out 13. `loso`: 5 folds, each seed held out once. |

## Read the summary

The summary `summary.md` has these sections:

1. The head: the prediction, the commit, the computer, the counts of runs and the counts of the measured and the skipped records.
2. `Strategies`: one row for each strategy. The row has the counts of measured records, skipped records, errors, hard breaks and records that are not deterministic. Then it has the median of each guard measure, the median of `pack.fill` and `pack.whitespace`, and the times.
3. One section for each strategy, with one row for each family of inputs.
4. `Coverage`: one row for each strategy, with the measured inputs of all the inputs and of each container shape.
5. `Ranking`: for each container shape, the common clean inputs, the flag `thin` and the entries of the two-step ranking.
6. `Fill without overflow`: a diagnostic rank of the strategies by the median `pack.fill` of their own records with no overflow. Then the same rank for each container shape.
7. `Overflow`: for each strategy and container shape, the records with overflow and the sum of `pack.outsideExact`. It also gives the means and the medians of the overflow measures.
8. `Distinct outputs`: the output groups, and the cell groups and the pairs of each container shape.
9. `Activation`: for each strategy and container shape, the count of its move and its label.
10. `Portfolio`: for `all` and each container shape, the held-out scores of the oracle, the best single entry, the sets and the composite entries. Then the scores at each limit, the training scores, the sole wins and the losers.
11. `Skipped cells`: each reason of the skipped records of a strategy, with the count of its records.
12. `Hard breaks and determinism`: each measured record with a hard break or with `deterministic` set to `false`. A good run has none.
13. `Stability`: the count of records with the stability measures.
14. `Bounds`: for each strategy and objective, the median and the quantile 0.95 of `pack.gap`, and the count of each bound that wins.
15. `Predictions`: each prediction with the id of the run, the measured value and the result of the comparison.

A `run.json` from before k59 has no screen guards. Sections 6 to 9 then show one line that tells it. A `run.json` from before k60 has no ranking, and section 5 shows one line. A `run.json` from before k20 has no portfolio report, and section 10 shows one line.

The guard measures are the measures with a floor in `MEASURE_SPECS`: `pack.aspectError`, `pack.order.inversions`, `pack.overflow` and the 3 stability measures. Lower is better for each guard. The floor is 0.

The column `ms sum` is the sum of the medians. The time of a job is longer, because each pair also has the runs for determinism and the warm-up runs.

## The snapshots of the site

The page `results/` of the site shows measured results. It reads only the snapshot files of `packages/site/data/`. Each file is small JSON with the release, the commit, the date and the CI run of its data. The raw records stay out of git.

The script `bench/snapshot.ts` writes the files. Do not edit a file by hand. A run folder holds the files of one artifact: `records.jsonl`, `run.json` and `corpus.json`. Download it with `gh run download <id>` into a folder outside git.

| File | Command, from `packages/packing` | The data |
|---|---|---|
| `strategies-pack-screen-v1.json` | `node bench/snapshot.ts strategies <folder of 40675490363> --run 40675490363` | Each strategy against `rows`, by family, on `pack-screen-v1`. |
| `strategies-pack-free-v1.json` | `node bench/snapshot.ts strategies <folder of 40685309195> --run 40685309195` | The same on `pack-free-v1`. |
| `strategies-pack-select-v1.json` | `node bench/snapshot.ts strategies <folder of 40699801165> --run 40699801165` | The same on `pack-select-v1`. |
| `strategies-pack-select-v2.json` | `node bench/snapshot.ts strategies <folder of 40708970161> --run 40708970161` | The same on `pack-select-v2`. |
| `paired-k67.json` | `node bench/snapshot.ts paired <folder of 40741632077> --run 40741632077 --commit dd0eead --release 0.2.17 --arm-a v0.2.16 --arm-b k67-prune` | The paired time test of k67. |
| `select-table.json` | `node bench/snapshot.ts select --train <folder of 40675490363>=40675490363 --train <folder of 40685309195>=40685309195 --test <folder of 40699801165>=40699801165 --test <folder of 40708970161>=40708970161` | The leaves of `SELECT_TABLE`, with the wins of each training and test run. |
| `releases.json` | `node bench/snapshot.ts releases` | The releases of `CHANGELOG.md`, with the date, the commit and the pull request of each tag. |
| `gaps-pack-select-v2.json` | `node bench/snapshot.ts gaps <folder of 40766464710> --run 40766464710 --measure pack.gap --release 0.2.17` | `pack.gap` of 6 strategies on `pack-select-v2`, by cell, with the kinds of the bounds (k51). |
| `gaps-pack-known-v1.json` | `node bench/snapshot.ts gaps <folder of 40768140939> --run 40768140939 --measure pack.gapToOpt --release 0.2.17` | `pack.gapToOpt` of 6 strategies on `pack-known-v1`, by cell (k45). |

- A strategy snapshot gives the result of `verdict()` of `@mark1russell7/layout-contract` for each measure, by family, at the level 0.05. The tie of each measure is its `minEffect`.
- The command `select` stops with an error when the training wins differ from `SELECT_LEAF_WINS`. Thus a change of the table also changes the pinned counts and their test.
- A gap snapshot gives the count, the quartiles and the values below 0 of the measure. It gives them for all inputs and for each cell.
- The cell of a gap snapshot is the family up to its container size, for example `perfect-cut.guillotine.fixed`. A record without a finite value counts as missing.
- The commits of the two gap runs come after the tag `v0.2.17`. Thus `--release 0.2.17` gives the release of their packers.
- After a new release, start the command `releases` again. After a new bench run, start the command of its corpus again.
