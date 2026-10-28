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

- The 4 variants of roadmap item k21 are the shelf family. `docs/PACKER.md` tells the option `fit`.
- The base of a variant is the same strategy without the options of the variant. The activation compares the outputs of a variant and its base.
- An entry of the registry gets no options from the runner. A variant gets the defaults of its strategy, with its options over them.

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
6. It writes one `layout-record/1` line with the measures rounded by `roundMeasures`.

The runner does not stop at an error of a strategy. It writes the error in `run.json` and in the summary, and it exits with the code 1.

A strategy of the mode `incremental` gets only skipped records on an offline corpus. Each generator of the package makes offline inputs, so the runner skips `push` on each input.

## The corpora

Each corpus is a `layout-corpus/1` manifest with its `specs` and no `inputs`. The runner makes the inputs from the specs with `corpus`.

| Corpus | Inputs | Use |
|---|---|---|
| `smoke-v1` | 13 | The unit tests of the runner, and a quick check of the workflow. It has at most 100 boxes in each input. |
| `pack-screen-v1` | 1305 | The first screen of the packer. Write its prediction before its first benchmark. |

The corpus `pack-screen-v1` has these specs, each with the seeds 1 to 5:

- `rect-grid` with each `containerShape` and each layout of `obstacles`, the sizes `uniform` and `heavyTail`, and the counts 10, 100 and 1000.
- `gallery`, `dashboard`, `cards` and `word-cloud`, each with the count 100.
- `edge-cases` with each case: `empty`, `one`, `oversize`, `exactTiling` and `touchObstacles`.

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

A record also has these optional fields of `docs/FORMAT.md`:

| Field | Content |
|---|---|
| `msRuns` | The time of each timed run, in milliseconds. Their median is `ms`. |
| `outputHash` | The first 16 hex characters of the SHA-256 of the placements, sorted by id and rounded to 3 decimals. The value -0 becomes 0. Thus the same hash tells the same placements to 3 decimals, not exactly the same placements. |
| `env` | The computer: the version of Node.js, the operating system, the processor and the name of the runner. |
| `skipped` | The reason when the runner did not pack the pair, for example `unsupported mode: offline`. Only a skipped record has it. |

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

The container shape of an input comes from its cell in `corpus.json`. An input that is not in the manifest gets the shape `unknown`.

### Ranking

The ranking compares the strategies in each container shape in two steps. A strategy with no measured record in the shape is not ranked there.

1. Step 1 orders the entries by the median `pack.overflow.excessArea` of their measured records. Lower is better.
2. The entries within the minimum effect of the best entry make tie group 1. The minimum effect is 0.005, from `MEASURE_SPECS` and `compareMeasure` of the contract.
3. The other entries make tie groups 2, 3 and more, by the same rule. Each group starts at its best remaining entry.
4. Step 2 orders each tie group by the median `pack.fill` on the common clean inputs. Higher is better.

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

A strategy is `exercised` when its count is above 0 on 1 input or more. Else it is `not-exercised`, and `reason` tells why. The activation also has one cell for each container shape.

A variant also gets `base` and `differs` when the run has the records of its base. `differs` counts the common inputs where the `outputHash` of the variant is not the hash of the base. A variant is `exercised` when its count is above 0, or when `differs` is above 0. This is the rule of PROMOTION. A job of the matrix has only its own entry, thus only the merged run gives `differs`.

A variant that is equal to another entry on each common input is in one output group with it. Such a group is valid. It tells that the option has no effect on those inputs.

The strategies `rows` and `shelf` pack a container that is not a rectangle with the same packer. That packer does not make their moves. Thus they are `not-exercised` on such a shape, and their outputs on it are often in one cell group.

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
10. `Skipped cells`: each reason of the skipped records of a strategy, with the count of its records.
11. `Hard breaks and determinism`: each measured record with a hard break or with `deterministic` set to `false`. A good run has none.
12. `Stability`: the count of records with the stability measures.
13. `Predictions`: each prediction with the id of the run, the measured value and the result of the comparison.

A `run.json` from before k59 has no screen guards. Sections 6 to 9 then show one line that tells it. A `run.json` from before k60 has no ranking, and section 5 shows one line.

The guard measures are the measures with a floor in `MEASURE_SPECS`: `pack.aspectError`, `pack.order.inversions`, `pack.overflow` and the 3 stability measures. Lower is better for each guard. The floor is 0.

The column `ms sum` is the sum of the medians. The time of a job is longer, because each pair also has the runs for determinism and the warm-up runs.
