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
| `strategies` | `all` | The strategies, with commas, for example `shelf,skyline`. The value `all` gives each strategy of the registry. |
| `prediction` | (none) | The id of the prediction. Each record writes it in `prediction`. The input is necessary. |
| `repeats` | `5` | The timed passes of each pair of a strategy and an input. The record keeps the median in `ms`. |
| `warmup` | `2` | The passes before the timed passes of each pair. They have no time. |

To start the workflow on a branch, add `--ref <branch>`. GitHub starts a workflow by hand only when the default branch has the file of the workflow.

Watch the run with `gh run watch <run id>`. Get the result with `gh run download <run id> -n bench-<corpus>`.

## The jobs

1. The job `plan` examines the inputs and makes a list of the strategies.
2. The matrix `run` has one job for each strategy. Each job packs each input of the corpus with its strategy.
3. The job `merge` joins the records of all jobs into one artifact.

A job of the matrix fails when a strategy throws an error on an input. The other jobs continue, and `merge` keeps their records.

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
5. It writes one `layout-record/1` line with the measures rounded by `roundMeasures`.

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
| `measure` | The id of a measure, or `ms` for the time. |
| `expected`, `op` | The expected value and the comparison. Without `op`, a measure where lower is better gets `<=`, and the others get `>=`. |
| `reason` | The reason for the prediction. |

Without `input`, the summary compares the median of the measure over the records with the expected value.

## The artifacts

Each job of the matrix keeps the artifact `bench-<corpus>-<strategy>`. The job `merge` keeps the artifact `bench-<corpus>`. Each artifact has these files:

| File | Content |
|---|---|
| `records.jsonl` | One `layout-record/1` line for each pair of the job: a measured record or a skipped record. The lines keep the order of the strategies, and then the order of the inputs. |
| `run.json` | The facts of the run: the corpus, the prediction, the commit, the counts of runs, the computer, the skipped pairs and the errors. |
| `corpus.json` | The manifest of the corpus, with the id, the hash and the cell of each input. |
| `summary.md` | The summary. The page of the run on GitHub also shows it. |

### The fields of a record

A record has each field of `layout-record/1` in `docs/FORMAT.md`. These values are specific to the packer:

- `stage` and `step` are `pack`.
- `options` holds the defaults of the strategy, because the runner gives no options.
- `nodes` counts the boxes and the obstacles of the input, as the twin document of `highways` does.
- `commit` holds the first 7 characters of the commit.
- `measures` holds the measures of `measure`. The value `pack.search.ms` is the median of the timed runs.

A record also has these optional fields of `docs/FORMAT.md`:

| Field | Content |
|---|---|
| `msRuns` | The time of each timed run, in milliseconds. Their median is `ms`. |
| `outputHash` | The first 16 hex characters of the SHA-256 of the placements, sorted by id. Two runs with the same hash have the same placements. |
| `env` | The computer: the version of Node.js, the operating system, the processor and the name of the runner. |
| `skipped` | The reason when the runner did not pack the pair, for example `unsupported mode: offline`. Only a skipped record has it. |

A skipped record is the record of a pair that the strategy does not support. It has `skipped`, and `measures` and `hard` are empty objects. Its `ms` is 0, and it has no `msRuns` and no `outputHash`. The medians, the tables and the predictions of the summary ignore the skipped records.

## Read the summary

The summary `summary.md` has these sections:

1. The head: the prediction, the commit, the computer, the counts of runs and the counts of the measured and the skipped records.
2. `Strategies`: one row for each strategy. The row has the counts of measured records, skipped records, errors, hard breaks and records that are not deterministic. Then it has the median of each guard measure, the median of `pack.fill` and `pack.whitespace`, and the times.
3. One section for each strategy, with one row for each family of inputs.
4. `Skipped cells`: each reason of the skipped records of a strategy, with the count of its records.
5. `Hard breaks and determinism`: each measured record with a hard break or with `deterministic` set to `false`. A good run has none.
6. `Stability`: the count of records with the stability measures.
7. `Predictions`: each prediction with the id of the run, the measured value and the result of the comparison.

The guard measures are the measures with a floor in `MEASURE_SPECS`: `pack.aspectError`, `pack.order.inversions`, `pack.overflow` and the 3 stability measures. Lower is better for each guard. The floor is 0.

The column `ms sum` is the sum of the medians. The time of a job is longer, because each pair also has the runs for determinism and the warm-up runs.
