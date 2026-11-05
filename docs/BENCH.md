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
| `job-minutes` | `30` | The time limit of each job of the matrix, 1 to 350. A job that this limit stops uploads no records. |
| `budget` | `false` | The value `true` gives each pair a wall budget. The section "The budget of a pair" tells the rules. |

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
| `guillotine-baf-sas` | `guillotine` | `choice: "baf"`, `split: "sas"` | none |
| `guillotine-bssf-sas-merge` | `guillotine` | `choice: "bssf"`, `split: "sas"`, `merge: true` | none |
| `bottom-left` | the same | the defaults | none |
| `bottom-left-liu-teng` | `bottom-left` | `rule: "liu-teng"` | `bottom-left` |
| `best-fit` | the same | the defaults | none |
| `best-fit-tall` | `best-fit` | `side: "tall"` | `best-fit` |
| `best-fit-short` | `best-fit` | `side: "short"` | `best-fit` |
| `portfolio-k2` | `portfolio` | `k: 2` | `maxrects-bl` |
| `portfolio-k3` | `portfolio` | `k: 3` | `maxrects-bl` |
| `aspect-fit-maxrects-bl` | `aspect-fit` | `strategy: "maxrects"`, `options: { rule: "bl" }` | `maxrects-bl` |
| `aspect-fit-maxrects-bssf` | `aspect-fit` | `strategy: "maxrects"`, `options: { rule: "bssf" }` | `maxrects-bssf` |
| `aspect-fit-portfolio-k2` | `aspect-fit` | `strategy: "portfolio"`, `options: { k: 2 }` | `portfolio-k2` |
| `portfolio-area-rows-bl` | `portfolio` | `members: ["rows", maxrects-bl]`, `key: AREA_KEY` | `maxrects-bl` |
| `select-rows-bl` | `select` | the defaults: the members `rows` and `maxrects-bl`, `SELECT_TABLE` | `rows` |
| `portfolio-fill-rows-bl` | `portfolio` | `members: ["rows", maxrects-bl]`, `key: ["pack.fill"]` | `rows` |
| `restarts-maxrects-bl-k16` | `restarts` | `member: maxrects-bl`, `iterations: 16` | `maxrects-bl` |
| `restarts-rows-k16` | `restarts` | `member: "rows"`, `iterations: 16` | `rows` |
| `restarts-maxrects-bl-shuffle-k16` | `restarts` | `member: maxrects-bl`, `iterations: 16`, `perturb: "shuffle"` | `maxrects-bl` |
| `ruin-recreate-maxrects-bl-k64` | `ruin-recreate` | `member: maxrects-bl`, `iterations: 64` | `maxrects-bl` |
| `ruin-recreate-skyline-k64` | `ruin-recreate` | `member: "skyline"`, `iterations: 64` | `skyline` |
| `overlap-min-maxrects-bl-k8192` | `overlap-min` | `member: maxrects-bl`, `iterations: 8192` | `maxrects-bl` |
| `overlap-min-skyline-k8192` | `overlap-min` | `member: "skyline"`, `iterations: 8192` | `skyline` |
| `anneal-maxrects-bl-k16` | `anneal` | `member: maxrects-bl`, `iterations: 16` | `maxrects-bl` |
| `anneal-skyline-k16` | `anneal` | `member: "skyline"`, `iterations: 16` | `skyline` |
| `genetic-maxrects-bl-k16` | `genetic` | `member: maxrects-bl`, `iterations: 16`, `population: 4` | `maxrects-bl` |
| `tabu-maxrects-bl-k16` | `tabu` | `member: maxrects-bl`, `iterations: 16`, `neighbors: 4` | `maxrects-bl` |
| `relax-rows` | `relax` | `member: "rows"` | `rows` |
| `relax-maxrects-bl` | `relax` | `member: maxrects-bl` | `maxrects-bl` |
| `relax-skyline-bl-waste` | `relax` | `member: skyline-bl-waste` | `skyline-bl-waste` |
| `force-rows` | `force` | `member: "rows"` | `rows` |
| `force-maxrects-bl` | `force` | `member: maxrects-bl` | `maxrects-bl` |
| `force-skyline-bl-waste` | `force` | `member: skyline-bl-waste` | `skyline-bl-waste` |

- The 4 variants of roadmap item k21 are the shelf family. `docs/PACKER.md` tells the option `fit`.
- The 5 entries of roadmap item k24 are the MaxRects family, one for each `rule`. `docs/PACKER.md` tells the rules.
- The 3 entries of roadmap item k22 are the skyline family: the rule `mw` and the waste map. `docs/PACKER.md` ("The skyline family") tells them.
- The 2 entries of roadmap item k23 are the guillotine family. `docs/PACKER.md` ("The guillotine family") tells the rules. No corpus has turnable items, thus no entry turns.
- The 5 entries of roadmap item k25 are the slide and the best-fit families. `docs/research/CATALOG.md` tells the sources. These strategies do not turn an item.
- The strategy `guillotine` has no entry of its own, because its defaults are the entry `guillotine-baf-sas`. The two entries have no base.
- The strategy `maxrects` has no entry of its own, because its defaults are the entry `maxrects-bssf`.
- The base of a rule is `maxrects-bl`, because the move of each other rule is a place that `bl` does not choose.
- The base of a variant is the same strategy without the options of the variant. The activation compares the outputs of a variant and its base.
- An entry of the registry gets no options from the runner. A variant gets the defaults of its strategy, with its options over them.
- The 2 composite entries of roadmap item k20, part 2 pack each input with the set of 2 or 3 members of its cell. Their move is `move.pick`.
- A composite entry is not in the pool of the portfolio report: not in the oracle, the greedy sets, the sole wins and the losers. The ranking has it.
- The 4 composite entries of roadmap item k62 are `ASPECT_FIT_ENTRIES`. An entry `aspect-fit-<entry>` wraps that entry with `aspectFit`. `docs/PACKER.md` ("The aspect fit") tells it.
- On a container of fixed size, an entry `aspect-fit-<entry>` gives the output of its base. On a free size, its move is `move.aspectPick`.
- The entry `portfolio-area-rows-bl` has the 2 members `rows` and `maxrects-bl`. Its key `AREA_KEY` puts `pack.area` before `pack.overflow.excessArea` and `pack.fill`. Its move is `move.pick`.
- The entry `select-rows-bl` of roadmap item k66 is in `SELECT_ENTRIES`. It packs with one member, from the features of the input. Its move is `move.select`. `docs/PACKER.md` ("The feature select") tells it.
- The entry `portfolio-fill-rows-bl` of roadmap item k127 is in `SELECT_ENTRIES`. It is the fill oracle of the members of `select`. Its key computes the fill alone. Its move is `move.pick`.
- The 3 entries of roadmap item k78 are `RESTARTS_ENTRIES`. Each one packs 16 times with its member, in random orders, and keeps the best output. Its move is `move.restartPick`. `docs/PACKER.md` ("The random restarts") tells it.
- The 2 entries of roadmap item k79 are `RUIN_RECREATE_ENTRIES`. Each one removes some boxes 64 times, and packs them again with its member. Its move is `move.ruinRecreate`.
- `docs/PACKER.md` ("The goal-driven ruin and recreate") tells the entries of k79.
- The 2 entries of roadmap item k80 are `OVERLAP_MIN_ENTRIES`. Each one makes the strip of its member shorter with at most 8192 box moves. Its move is `move.overlapMin`.
- The entries of k80 pack only a container with a free height or a free width. They skip each other input as `UnsupportedCell`.
- `docs/PACKER.md` ("The overlap minimization") tells the entries of k80.
- The 4 entries of roadmap item k26 are `ORDER_SEARCH_ENTRIES`. Each one packs 16 orders with its member, and keeps the best output.
- Their moves are `move.anneal`, `move.genetic` and `move.tabu`. `docs/PACKER.md` ("The searches over orders") tells them.

## The controls of a measure

A control is a packer made to win one measure with a trick. It tests that measure, and no user gets its output.

- `bench/controls.ts` holds the controls. They are not in `ENTRIES`, the registry, the picker or the sites.
- The value `all` of `--strategies` does not include a control. Name its id to start it: `--strategies fill-trick`.
- A control uses the corpus and the seeds of the real entries, so a read can pair its records with their records.

| Control | Measure | The trick | Measures that see the trick |
| --- | --- | --- | --- |
| `fill-trick` | `pack.fill` | It packs with `maxrects-bl` and `skyline` at 12 widths and keeps the highest fill. It ignores the item order and the target aspect. | `pack.order.inversions`, `pack.aspectError` |
| `keep-shelf` | `pack.stability.moved` | It keeps each old position and puts each new or blocked box on rows below all the boxes. Only a chain corpus starts it. | `pack.fill` on the same steps |

The tricks obey the hard rules, and `fill-trick` drops no more items than its best member. Thus only the soft measures can catch them.

`main.ts control-read --as-of <date> [--out file] <run dir>...` reads the controls over the records of a run, with `checkMeasures` of `@mark1russell7/rigor-bench`. The folders hold the records of the real entries and of the controls of one corpus.

- The output has the pooled read and the read by the family of each input. A gate reads the pooled result. A stratum counts only where its keys reach the keys that a test needs.
- Each read shows the keys beside `needs`, and how many real entries the control beats.
- A measure with no control has a reason and a date. That list is the work plan of the controls.
- A pair that a budget stopped gives a censored row. A refused pair gives no row.
- The read only reports. No gate reads its result at this time.

`main.ts fill-widths --out <file> [--runs <corpus>=<run id>,...] <run dir>...` replays the width that `fill-trick` chose on each input. A record does not hold this width.

- The command packs the control again on each input of each run. It stops when `pack.area` or `outputHash` differs from the record.
- `bench/fixtures/fill-trick-widths.json` holds the replay of the runs 42074008497 (`pack-free-v1`) and 42074060697 (`pack-classes-v1`), at commit `aed4626`. All 1220 inputs agree with their records.
- On a fixed width, the output keeps the width of the container. Thus `pack.area` does not show the tried width, and only the file shows it.
- The test of the file packs each input again in CI. A different member, width or output fails it, so each change of the control shows.
- On `pack-free-v1`, the control kept a tried width on 56 of 720 inputs. On `pack-classes-v1`, it kept one on 155 of 500.

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

## The size gate

The job `size-gate` of each pull request and of each push to `main` (k132) bundles a small consumer of each published code export. The consumer imports one name.

- The job builds `packages/packing` and starts `node bench/main.ts size-gate --gate bench/gates/size.json --out <dir>` in `packages/packing`.
- The bundler is esbuild with minify, format `esm`, platform `neutral` and tree shaking. The measure is the gzip bytes at level 9.
- The gate fails when a bundle is above its budget. It also fails when an export of `publishConfig.exports` has no entry, or when an entry is not an export.
- The artifact `size-gate` has `size.json` and `size.md`, with the raw bytes, the gzip bytes, the budget and the change of each entry.
- The rule of a budget: the measured gzip bytes plus 5 %, rounded up to a whole KiB. One measure is the record, because a bundle is deterministic for one esbuild version.
- After a change in size on purpose, start the command with `--derive`. It writes the new measures, the budgets and the commit into the record.

The budgets are a committed record. Thus the size goes only down by default:

- The gate does not write `bench/gates/size.json` by itself. Only `--derive` in a pull request changes it.
- A pull request that raises a budget gives the reason and the bytes in its body.
- A bundle more than 5 % under its measured bytes fails the gate (outcome `below`). That pull request also lowers the budget with `--derive`.

- The module `bench/size-gate.ts` has no packing logic, so it can move to the planned home of gates (rigor-gates).

## The output rows

The catalog states if the positions and the sizes of each strategy are whole numbers. The file `src/strategy-output.ts` holds these rows. The script `bench/whole-positions.ts` writes it. Do not edit it.

- The family `whole-positions/1` has 240 rect inputs: 5 container modes, 3 item counts, 2 gaps, 2 margins, 2 insets and 2 seeds. Each number of an input is a whole number.
- An option set is the defaults of a strategy, or the options of one entry of the bench. A row states only its own option set.
- The contract gives the class. One fractional input gives `fractional` at any count. With no fraction, fewer than 30 packed inputs give `untested`, and the row keeps the count.
- The read has no clock, so one commit gives one result. The check compares the counts, and a changed count fails also when the class stays the same.

The job `rows` of `output-rows.yml` starts on each pull request and each push to `main`. `CI OK` needs it. No path list can miss a file, because the job does not read the changed files.

```sh
node --no-warnings bench/write-catalog.ts                 # After a change to the rows or the version
node --no-warnings bench/whole-positions.ts --write       # After a strategy changes its output on purpose
node --no-warnings bench/whole-positions.ts --check       # The check of the job
```

The job also uploads the table that it read as the artifact `output-rows`, so a pull request can take it.

## The tie moves

A tie decides a place. A very small change of one size can break the tie and move other boxes far (roadmap item k149).

`bench/tie-move.ts` reads each option set of each strategy on the family `tie-move/1`. The family has 90 inputs: 5 kinds, 3 container modes, the counts 8, 20 and 50, and 2 seeds. Each input has 2 changes: the width and the height of the middle item go up by 0.01.

| Arm | Inputs | What it tells |
| --- | --- | --- |
| `ties` | Equal heights, equal widths, or identical items | The move on an input with ties |
| `none` | No ties | The control: the same change with no tie to break |
| `edge` | Sizes at the edge of a bucket of the margin | The adversary of the margin |
| `marginTies` | The inputs of `ties` through the margin | The move with the margin |
| `marginEdge` | The inputs of `edge` through the margin | The move when a change crosses an edge |

The margin is a wrapper of the bench. Each size goes up to the top of its bucket of width 1, and a bucket has a whole number at its middle. A change inside a bucket gives the same input, so `marginTies` reads no move by construction. This is not a gain alone. Read it with `marginEdge` and with `fillLost`, the mean fill that the margin loses. The read does not tell about a margin inside the comparisons of a strategy.

Each arm of a row of `bench/gates/tie-move.json` gives its changes, the changes with a move above 1 and the changes with another set of items. It also gives the largest move and its input. The table states what the strategies do. It is not a promise of a limit.

The first read, on 2026-11-05, has these results:

- 79 option sets pack, and 76 of them have a larger move on ties than on the control. The other 3 are `binary-height`, `exact-strip` and the slice-and-dice treemap. `exact-strip` refuses each changed input, because it needs whole sizes, so it has no read of a move.
- Over all option sets, 3928 changes on ties move a box by more than 1. The control has 37 such changes, and the edge inputs have 1096.
- Through the margin, 0 changes on ties move a box, and 1464 changes on the edge inputs move a box. Thus the margin moves the problem to the edge of a bucket, and it does not remove the problem.
- The margin loses at most 0.038 of fill. The value of `fillLost` is below 0 on one treemap, where the margin gains fill.
- At 8 boxes, the default sets of 5 strategies move a box by 97 to 198. The largest moves come at 50 boxes in the free forms, where the size of the container also changes.

The control is not always quiet. A search or a score can also move far with no tie, as in `anneal`, `overlap-min` and `maxrects-cp`.

`--check` reads again and fails on each difference, also when a move falls, so a change to a strategy shows in the table. CI starts the check on each PR. After a change to a strategy, start `node bench/tie-move.ts --write` and read the difference. The strategies `circle-quasi-physical` and `hole-degree` pack no input of this rect family, so their rows have 0 inputs.

## The flip tests

A gate that has not gone red on a known fault is not known to work. `packages/packing/bench/gate-flip.ts` starts the real command of a gate in a child process. A clean copy of its input must pass, and each copy with an injected fault must fail. The job of the gate fails when a case gives another code.

| Gate | The faults |
|---|---|
| Size gate | Each file of `build/` grows above the largest budget, and each bundle must read `above`. One export loses its entry. |
| Time gate | The arm is 3 times slower. A noisy A/A arm gives the code 3 on a first run, and the code 1 on a retry. The test reads a copy of a run with a pass. |
| Portfolio sets | A copy of the records has no records of a chosen strategy, so the generated table differs from the committed table. |
| Smoke check | One copy for each kind of failure of `smokeCheck`. The output must name that kind. |
| `Promotion OK` | Fixed pairs on fixed records give their stated verdicts, by `--expect`. The records of that pair have 2 CPU models, so `maxrects-bl` over `rows` gives `no-read` at each floor, and `rows` over `maxrects-bl` gives a fail on its gain. |
| Output rows | Half a position in each output of a strategy with whole rows, and half a size. The output must name the property. The table does not change. |
| Tie moves | A move of 100 on each change of a strategy. The output must name the arm. The table does not change. |
| Time test of the win test | The records have one CPU model and the floor is the usual one. `maxrects-bl` over `maxrects-cp` gives a pass. A copy with a candidate 10 times slower gives a fail, and the only failed part is the time test. |

The verdict of a real candidate reports and does not fail. The records of the fixed pairs and of the portfolio sets are artifacts of a run, and they expire on 2027-01-26. Then the check fails closed, and a new run must give them.


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
   The measures of `measure` include `pack.shapeFill`, the shape area over the hull. Each corpus has only `rect` items, so it is equal to `pack.fill` there.
6. It writes one `layout-record/1` line with the measures rounded by `roundMeasures`.

The flag `--interleave` changes only the order of the timed passes. For each input, the runner does the warm-up passes of each strategy. Then, for each repeat, it does one timed pass of each strategy. The records, their order and their format do not change. `run.json` gets `"interleave": true`. The job `time` of the section "The win test" uses this flag.

The runner does not stop at an error of a strategy. It writes the error in `run.json` and in the summary, and it exits with the code 1.

A strategy of the mode `incremental` gets only skipped records on an offline corpus. Each generator of the package makes offline inputs, so the runner skips `push` on each input.

## The word of a skip

A strategy that refuses a cell leaves a skip record. A reader of the results needs the reason of that refusal. A limit of the code is coverage still owed, and the other reasons are not. The table `SKIP_ROWS` of `bench/skip-words.ts` gives each pair of an entry and a skip reason one word.

| Word | Meaning |
|---|---|
| `not done` | A limit of the code. A composition or small work lifts it, and the row names the item. |
| `other algorithm` | This form needs another algorithm. A person reads each row before it gets this word. |
| `no meaning` | The input has no meaning for the strategy, for example an offline input for `push`. |
| `not read` | Nobody has read the pair. A pair outside the table reads this word, and no pair gets another word by default. |

- A snapshot writes the word and its reason beside each skip reason, and the results page reads that field.
- A wall budget has no word, because the strategy did not refuse the input. The section below tells about it.
- A snapshot from before the table has no words, so the page reads each of its skips as `not read`.
- The file `kpi.json` gives `skips-owed` and `skips-not-read`. A skip does not count as a measured entry.
- A test fails on a row whose strategy takes the cell of the row. So a lift removes its row in the same change.

The table holds each skip of `pack-free-v1` in run 41975155011: 95 pairs, with 68 `not done`, 25 `other algorithm` and 2 `no meaning`. The same refusal has the same word on another corpus. A new pair on another corpus reads `not read` until a person reads it.

## The budget of a pair

The flag `--budget` holds each pair of an entry and an input to a wall budget. A run of `all` can then finish on the corpora with 1000 items. The input `budget` of the workflow sets the flag. Each pair runs in a child process of `superviseCases` from `@mark1russell7/rigor-bench/supervise`, so a stop works on code that does not return. Only an overrun costs a new child, so the times of the other pairs do not change.

| Rule | Value | Where |
|---|---|---|
| The wall budget of a pair, with its 2 packs for determinism, its warm-up, its timed runs and its pack with the next seed | 15 s up to 30 items, 30 s above | `SMALL_PAIR_MS`, `PAIR_MS` |
| A first pack over this time gives the pair 1 timed run and no warm-up | 1 s | `SLOW_PACK_MS` |
| The overruns of an entry at one size, after which its other pairs at that size and above do not start | 2 | `DEFAULT_OVERRUNS` of `rigor-bench` |
| The time limit of the pairs of a job | 10 minutes less than `job-minutes` | the workflow |

The pairs of an entry run in rising order of their size, so the stop comes early. The cost of a stop is thus at most 2 budgets for each size.

A pair that did not finish keeps a record, and the reason is in the field `skipped`:

| Reason | Meaning | Other fields |
|---|---|---|
| `over budget` | The supervisor stopped the pair at its budget. | `budgetMs`, and `msAtLeast`, the lower limit of the time. The time is censored, so no mean reads it. |
| `not run: over budget at this size` | 2 pairs of the entry passed the budget at this size or below. | `budgetMs`, and `because`, the 2 pairs. |
| `not run: job budget` | The job reached its time limit before this pair ended. | `budgetMs` |

A record with `oneRun: true` has one time and no warm-up, because a measure of that pair chose it. The time test of the win test reads no time of such a record. It reads the mark of the record and not a list of entries.

The field `budget` of `run.json` states these rules, and has the control of each job. The section `Budget` of the summary shows, for each entry, the largest input that finished in its budget. Compare two entries only on the inputs that each one finished.

A wall budget is not one limit across computers, because the runners differ by load. So each job first packs the same inputs with the entry `skyline`: 20 packs of each of the 7 largest inputs. The field `budget.jobs` keeps these times. The merge gives them to `controlFactor` of `rigor-bench`, with one group for each job and one key for each input. It writes the load factor of each job in `budget.factors`. Read a censored result near a budget with the factor of its job.

The strategies `binary-height`, `near-rects` and `raster-nofit` refuse an input with over 256 items, so those pairs have the reason `unsupported containerSize: refused` at no cost. This limit is a real limit of the strategies, and it is not part of the budget.

A chain corpus goes with `--budget`. The rules for an input with a `base` are these:

- The steps of a chain stay together, in their order, so one child packs a step after its base.
- A strategy that reads `previous` gets the reason `not run: base has no output` at each later step when a child ends or a base fails. It does not pack that step from nothing, because that changes the measure.
- A strategy that does not read `previous` keeps its pack at such a step, and it has no stability value at that step.
- The job deadline ends a chain run as it ends each other run: the finished records stay, and each other pair has the reason `not run: job budget`.

`--interleave` and `--anchor` do not go with `--budget`.

The estimate of the first run comes from a power law over the times of workflows `41897623562` and `41942254149`. Each has at most 100 items, so the estimate is not a measurement:

| Corpus | Estimate of the job minutes |
|---|---:|
| `pack-classes-v1` | 125 |
| `pack-free-v1` | 160 |
| `pack-screen-v1` | 672 |
| `pack-select-v1` | 832 |
| `pack-select-v2` | 832 |
| `pack-known-v1` | 56 |

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
| `pack-classes-free-v1` | 600 | The same classes with free sizes of roadmap item k158, and small strips of k160. Write its prediction first. |
| `pack-worst-v1` | 342 | The adversarial families and the scaling ladder of roadmap item k107. Write its prediction first. |
| `pack-adversary-v1` | 6 | The worst input of each pair of the adversarial search of roadmap item k47. The file holds the inputs, not specs. Free forms not searched by version 1. |
| `pack-strip-v1` | 528 | The published sets of strip packing of roadmap item k46, by their rules. Write its prediction first. |
| `pack-anchor-v1` | 51 | The inputs with locked items on the walls of roadmap item k111. Use it with the option `--anchor`. |
| `pack-change-v1` | 480 | The chains of one edit of roadmap item k48. They give the stability measures. |

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

The corpus `pack-classes-free-v1` has 120 specs of the same classes, each with the seeds 1 to 5. It holds the 8 entries that refuse each input of `pack-classes-v1`.

- 500 inputs have `freeAspect` or `freeArea` at the counts 20, 40, 60, 80 and 100. The 7 entries of masonry, treemap and columns accept only these forms.
- 100 inputs have `freeHeight` at the counts 8 and 16. The entry `exact-strip` takes at most 16 items.
- The container takes no random numbers, so each form of a class, a count and a seed has the same items. A test pins the bytes of each input of `pack-classes-v1`.

A record of a refusal tells the reason in its field `skipped`, for example `refused: the input has more than 16 items`. Records before k160 have only `unsupported containerSize: refused`.

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

The corpus `pack-worst-v1` has 102 specs and 342 inputs. Each family of it makes inputs that break one rule of a strategy. All data is made up, and `stepRandom(seed, step)` gives each random number.

- The adversarial families have the containers `fixed` and `freeHeight`, and the seeds 1 to 3.
- `tall-row` and `skyline-gap` have the `ratio` 1, 2, 4, 8, 16 and 32, and the counts 100 and 400. Each has 72 inputs.
- `bl-trap` has the `stages` 2 and 3, and the counts 60, 120 and 240. It has 36 inputs.
- `half-wide` has the `excess` 1 to 4, and the counts 60, 120 and 240. It has 72 inputs.
- `ladder` has each rung 0 to 8 of the axes `count` and `ratio`, with the seeds 1 to 5. It has 90 inputs. The largest input has 2560 items.
- It has `heldOut: "all"`. Its `claims.declared` counts are `order` 0, `aspect` 0, `free-size` 216 and `shaped` 0.
- The builder `bench/worst.ts` writes the file. `node bench/worst.ts --check` and a test compare the file with the builder.

The rules of the adversarial families. The `fixed` container has the height of a witness: a packing that the generator knows.

| Family | Width | The items | The strategy that it breaks |
|---|---|---|---|
| `tall-row` | 100 | Bands of one tall item, 51 to 75 wide, and `ratio` levels of short items. The tall height is `ratio` times the short height. | `rows` and `shelf` |
| `skyline-gap` | 100 | Pairs of a pillar and a plate. The plate is 1 unit too wide to go next to the pillar, and 1 unit lower. | `skyline` |
| `bl-trap` | 126 | Items of one height. The widths are 19, 43 and 64, or 43 and 83, with the narrow items first. | the bottom-left place of `maxrects-bl` |
| `half-wide` | 200 | Items of one height. The widths are `100 + e`, `50 + 2e`, `50 + e` and `50 - 2e`, in the order of the area. | the greedy sort by area |

Why each family is hard:

- `tall-row`: the height sort puts each tall item in a row of its own. The short items have one height, so they keep the order of the input, from the narrowest. A short item does not fit above a narrower short item, so the space above the short items stays empty.
- `skyline-gap`: the plate has no place next to the pillar, so it goes on the top of the pillar. The space next to the pillar is under the skyline. A skyline packer does not fill a space under its skyline unless its waste map is on.
- `bl-trap`: the bottom-left rule puts each item in the lowest level with a place, as the first fit of bin packing. The narrow items fill levels of their own, and no wider item fits in the space that they leave. Each level of the witness has one item of each width.
- `half-wide`: this family is the bad case of first fit decreasing of Johnson 1973, as levels. Each item a bit over half the width takes a level, and the greedy fit puts the wrong quarter item next to it. The witness has 9 levels for each group of 30 items, and the greedy fit has 11.

The ladder is on the strip of the width 1024. Each side is a whole number, uniform in its range.

- The axis `count` has `10 * 2^rung` items, 10 to 2560, with the sides 64 to 256.
- The axis `ratio` has 100 items, with the sides `256 / 2^rung` to 256. The ratio of the largest side to the smallest side goes from 1 to 256.
- The ladder shows how the gap and the time of a strategy grow along one axis.

### The adversarial search

Roadmap item k47 adds a search for the inputs where one entry loses most to another. The file `bench/adversary.ts` has it.

- For an ordered pair of entries (A, B), the search finds the input with the largest loss of A to B.
- `docs/MEASURES.md` ("The loss of one entry to another") tells the loss: the fill for a fixed size, else the gap to the bound of k51.
- The value `best` of B is the best single entry on each input, with no break of a hard rule.

The search is a seeded hill climb with restarts:

- A start takes a random origin: a generator of `ORIGINS`, random parameters in the ranges of its family, and a random seed.
- `ORIGINS` has the 4 adversarial families, `ladder`, `berkey-wang` and `martello-vigo`.
- A move changes one parameter or the seed of the origin, or one item. The item moves are `resize`, `split`, `merge`, `swap`, `add` and `delete`.
- Each width stays in the container. With `fixed`, each height also stays in the container. The count stays from 1 to the cap.
- The search keeps a move when the loss does not become smaller. After 120 evaluations with no gain, it starts again from a new origin.
- One evaluation packs one candidate with A and B. The budget is a count of evaluations, not a time. Thus one seed gives one result on each computer.
- The search compares a loss of `fill` with a loss of `gap` as numbers. A move of `containerSize` changes the measure.

Each candidate is a `layout-input/1` file with its hash and `source: "made-up"`. Its generator stamp has the name `adversary` and the version 1. Its `params` have the pair, the seed, the budget, the cap and the origin generator.

The result has the worst input, its loss, and the path. The path is the list of the moves from the origin to the worst input. Each move of the path makes the loss larger.

The corpus `pack-adversary-v1` has the worst input of 6 pairs. Each search has the seed 1, the budget 2000 and the cap of 60 items. Version 1 of the search reads only the forms `fixed` and `freeHeight`. Thus the free forms of the class generators do not change its draws, and the search does not explore them. Roadmap item k164 is the next version. The pool of `best` also stays at the 16 single entries of 2026-10-28, because a new entry can change a stored row. From PR #360, the weekly held-out sample of `drawInput` moves, because a new form of a class generator changes its draws.

- The field `found` has one line for each pair: the loss, the values of A and B, the winner, the origin and the path.
- The field `inputs` has the input files, in the order of `found`.
- The file has no specs, so the runner does not read it. A test reads its inputs.
- `node bench/adversary.ts` writes the file. `node bench/adversary.ts --check` compares the file with a new search of each pair.
- `node bench/adversary.ts --check --pair 2` examines the pair with the index 2 only. A test examines the hash of each input.

Two checks hold the corpus:

| Check | Command | Starts on | A failure means |
|---|---|---|---|
| The stored rows are the same | `--rows`, in a test of `CI OK` | each change | The file changed. A change of the rows needs a new version of the corpus. |
| The search gives the stored rows | `--check`, in `adversary.yml`, a job of `CI OK` | a change of the search, of a file that it reads for draws, hashes or values, of `rigor-generators`, of the corpus or of the workflow | The search changed its draws. The merge is blocked, because version 1 is frozen. |

A change of the other package source, the entries or the lock file starts `--report` in `adversary.yml` in place of `--check`. The report names each row that a new search does not find, and it exits with the code 0. A moved row is not a fault of the corpus, because the stored inputs stay valid. A better strategy thus does not block a pull request.

The report exits with the code 0, so a moved row is not seen on the PR that moves it. Thus `adversary.yml` also runs `--check` on main each Tuesday at 03:50 UTC. A red scheduled run asks for a dated answer: a new version of the rows, or a stated reason that the row stays.

The test of `--check` has a limit. After a strategy moves a row, `--check` also fails on a later change of the search, and the failure names that row. Compare the report of `main` before you read that failure as a change of the draws. Version 1 of the search stays frozen, so this case is not normal.

One test of `CI OK` still reads a strategy on a stored input: the winner of each row must not break a hard rule. Its failure text names the row and the rule, and says that the strategy is at fault, not the corpus.

The losses of the corpus:

| A | B | Measure | Loss | Items | Origin | Winner |
|---|---|---|---|---|---|---|
| `skyline` | `maxrects-bl` | gap | 0.563 | 52 | `martello-vigo` VIII, `freeHeight` | `maxrects-bl` |
| `shelf-best` | `maxrects-bl` | gap | 0.403 | 9 | `ladder`, axis `count`, rung 0 | `maxrects-bl` |
| `rows` | `maxrects-bl` | gap | 0.480 | 37 | `tall-row`, ratio 25, `freeHeight` | `maxrects-bl` |
| `maxrects-bl` | `skyline` | fill | 0.054 | 52 | `berkey-wang` VI, `fixed` | `skyline` |
| `maxrects-bl` | `restarts-maxrects-bl-k16` | gap | 0.307 | 49 | `ladder`, axis `ratio`, rung 8 | `restarts-maxrects-bl-k16` |
| `select-rows-bl` | `best` | gap | 0.533 | 60 | `ladder`, axis `ratio`, rung 4 | `skyline` |

The corpus `pack-strip-v1` has 160 specs and 528 inputs. It has the published sets of strip packing of the literature. It has no published instance file. The generators make each input by the published rule of its set, with the random numbers of `stepRandom(seed, step)`.

- `hopper-turton` has each category C1 to C7, each problem 1 to 3, the cuts `guillotine` and `free`, and the seeds 1 to 3. It has 252 inputs.
- `burke-kendall-whitwell` has each problem N1 to N13, the cuts `guillotine` and `free`, and the seeds 1 to 3. It has 156 inputs. The problem N13 has 3152 items.
- `beasley-gcut` has the sides 250, 500 and 1000, the counts 10, 20, 30 and 50, and the seeds 1 to 5. It has 120 inputs.
- Each spec has the containers `fixed` (the object or the stock) and `freeHeight` (a strip of its width).
- It has `heldOut: "all"`. Its `claims.declared` counts are `order` 0, `aspect` 0, `free-size` 264 and `shaped` 0.
- The builder `bench/strip.ts` writes the file. `node bench/strip.ts --check` and a test compare the file with the builder.

### The categories of Hopper and Turton

Source: E. Hopper and B. C. H. Turton, 2001, "An empirical investigation of meta-heuristic and heuristic algorithms for a 2D packing problem".

The rule: each category has an object of the width `W` and the height `H`. A cut of the object gives the pieces of a problem, with no free space. The strip has the width `W`, so the best height is `H`.

| Category | Object `W` x `H` | Pieces of the problems 1, 2 and 3 |
|---|---|---|
| C1 | 20 x 20 | 16, 17 and 16 |
| C2 | 40 x 15 | 25 |
| C3 | 60 x 30 | 28, 29 and 28 |
| C4 | 60 x 60 | 49 |
| C5 | 60 x 90 | 73 |
| C6 | 80 x 120 | 97 |
| C7 | 160 x 240 | 196, 197 and 196 |

- The paper gives the objects, the counts and the guillotine cut. We chose the positions of the cuts: the cut of `perfect-cut`.
- The cut `free` starts with a pinwheel cut. Then the best height is not a guillotine layout. This cut is not in the paper.
- Why it matters: these categories are the most frequent test of strip packing. A known optimum gives `pack.gapToOpt` for each input.

### The problems of Burke, Kendall and Whitwell

Source: E. K. Burke, G. Kendall and G. Whitwell, 2004, "A new placement heuristic for the orthogonal stock-cutting problem".

The rule: each problem has an object and a count of pieces. A cut of the object gives the pieces, with no free space. The best height is the height of the object.

| Problem | Object `W` x `H` | Pieces |
|---|---|---|
| N1 | 40 x 40 | 10 |
| N2 | 30 x 50 | 20 |
| N3 | 30 x 50 | 30 |
| N4 | 80 x 80 | 40 |
| N5 | 100 x 100 | 50 |
| N6 | 50 x 100 | 60 |
| N7 | 80 x 100 | 70 |
| N8 | 100 x 80 | 80 |
| N9 | 50 x 150 | 100 |
| N10 | 70 x 150 | 200 |
| N11 | 70 x 150 | 300 |
| N12 | 100 x 300 | 500 |
| N13 | 640 x 960 | 3152 |

- The paper gives the objects and the counts. We chose the cut: the cut of `perfect-cut`, `guillotine` or `free`.
- Why it matters: the counts go from 10 to 3152 at a known optimum. Thus the gap and the time of a strategy show along the count.

### The problems gcut of Beasley

Source: J. E. Beasley, 1985, "Algorithms for unconstrained two-dimensional guillotine cutting" (Beasley 1985b).

The rule: the stock is a square of the side `S`. Each width and each height is a whole number, uniform from `ceil(S / 4)` to `floor(3S / 4)`.

- The problems gcut 1 to 12 have the sides 250, 500 and 1000, each with 10, 20, 30 and 50 pieces.
- With `fixed`, the container is the stock. Not all pieces fit, so the measure is the placed share. With `freeHeight`, the strip has the width `S`, as in the strip tests of Martello 2003.
- The problems have no known optimum. `pack.bound` gives the bound of the strip.
- Why it matters: the pieces are large against the width. Thus each row holds 1 to 3 pieces, and the order of the pieces changes the height much.
- The paper gives a value for each piece. The packer has no values, so the generator ignores them.

Nesting has no family in this corpus. The published nesting sets are fixed drawings, not rules. Thus a generator cannot make them without a copy of the published data.

Version 2 of `rect-grid` adds the parameter `order`. With `soft`, each item gets a `rank` from a permutation of the seed. Version 1 does not change.

The name `screen-v1` is the screen set of the router `highways`. Thus the packer uses the name `pack-screen-v1`, and a joint reader of the records sees no conflict.

The flag `--anchor` adds the measures `pack.anchor.*` of roadmap item k111. The section "Stability when an anchor moves" tells them. Without the flag, the records do not change.

The generator `change-walk` makes inputs with a `base` and a `change`. The runner adds the measures of `measureChange` against the run on the base input. The section "The change chains" tells the corpus.

## The change chains

The corpus `pack-change-v1` of roadmap item k48 gives the stability measures to a run for the first time. The prediction is `packing-k48-change-walk`.

```bash
node bench/change.ts                                 # writes the corpus file
node bench/change.ts --check                         # compares the file with the builder
node bench/change.ts --report [--strategies a,b]     # writes the table below
```

- The corpus has the 4 kinds `add`, `remove`, `resize` and `reorder`. It has the counts 20 and 60, the steps 0 to 5 and the seeds 1 to 10.
- All data is made up.
- It has 480 inputs, and 400 of them have a base. Each step is one edit of the step before it.
- The container is a strip with a free height. The width is 300 to 600. The items are 20 to 60 wide and 15 to 50 high.
- A `reorder` swaps two boxes of the input order. A `resize` keeps the id, so the box stays in the measure.
- The generator has no corpus family, so the sampler does not draw it. The prior gives it no weight, and the other weights do not change.
- The contract has no kind of change for a moved obstacle. Thus this corpus has 4 of the 5 kinds of the roadmap row.

The report reads no time, so any computer can start it. The columns of the kinds are the mean of `pack.stability.moved` over the 100 records of the kind. The last column is the mean of `pack.stability.mean` in widths of the container.

| Strategy | Records | `add` | `remove` | `resize` | `reorder` | All | Mean distance |
|---|---|---|---|---|---|---|---|
| `rows` | 400 | 0.404 | 0.451 | 0.561 | 0.031 | 0.362 | 0.054 |
| `shelf` | 400 | 0.391 | 0.443 | 0.536 | 0.037 | 0.352 | 0.049 |
| `skyline` | 400 | 0.394 | 0.450 | 0.599 | 0.065 | 0.377 | 0.074 |
| `maxrects-bl` | 400 | 0.383 | 0.442 | 0.579 | 0.058 | 0.366 | 0.070 |

- One `add`, `remove` or `resize` moves approximately half of the staying boxes of `maxrects-bl`.
- A `reorder` moves under 7 % of the boxes of each strategy, because each default sorts the items first.
- The share `moved` does not separate these 4 strategies: their means have a spread of 0.025. The prediction asked for 0.10. The mean distance has a larger spread, from 0.049 to 0.074.

The script `bench/pin.ts` makes its own pairs, so its values are not in these records.

### The read by step

`node bench/change.ts --steps <run dir>...` prints the read by step of a run of this corpus. Roadmap item k159 added it for `push`, the one strategy of the mode `incremental`.

- **Method:** a strategy of the mode `incremental` gets its own output at the base as `previous`. Each other strategy packs each step with no `previous`, so its row compares two packs from nothing. Step 0 has no base, so it is in the count of step 0 and in no other figure.
- **Counts:** the corpus has 80 inputs at step 0 and 400 steps with a base. Time and stability read only the 400.
- **Comparison:** each row names its comparison, `previous` or `no previous`. An offline row does not get `previous`, so its row is not a test of the same task as the row of `push`.
- **Lost base:** a step whose base failed or is censored has a skipped record with the reason, for a strategy that reads `previous`.

A strategy can buy stability, so a partner measure reads beside it:

- The control `keep-shelf` moves almost no box, so `pack.stability.moved` alone does not call a strategy stable.
- `main.ts control-read` reads `pack.stability.moved` with `pack.fill` as its partner, on the same steps. A run with no step has no such rule.
- No page calls `push` stable on the stability measure alone. The page names the partner and shows both figures.
- If `push` does not beat the control on `pack.fill` after correction, the page says so.

## Stability when an anchor moves

The measures `pack.anchor.*` of `docs/MEASURES.md` need `k + 1` packs for each locked item. Thus the runner computes them only when a run asks for them.

```sh
node bench/main.ts run --corpus pack-anchor-v1 --prediction <id> --anchor
node bench/anchor.ts --report --strategies rows,skyline,maxrects-bl
```

- The flag `--anchor` of `run`, or the option `anchor` of `runBench`, adds the measures to each input with a locked item that has a position.
- The other inputs get no new measure. Without the flag, each record is the same, byte for byte. A test pins this.
- The runner moves each locked item, one at a time, with the step of `anchorStep`. Each pack has the seed of the input.
- The record keeps the mean of `mean` and `moved` over the locked items, the largest `max` and `gain`, and the smallest `settled`.
- `bench/anchor.ts --report` packs `pack-anchor-v1` with the option and writes the medians for each strategy. It reads no time.
- The workflow `bench.yml` has no input for the option yet. Start the report on a local computer with a small corpus.

The step of the bench, `anchorStep(input, output, id)`:

- An anchor on the top or the bottom wall, or on no wall, moves in `x`. An anchor on only a side wall moves in `y`.
- The length is 1% of the container width, rounded, and 1 or more. The default loop has 4 steps.
- The step goes to the right or down. It goes to the left or up when 4 steps go out of a fixed side.

The corpus `pack-anchor-v1` has 17 specs and 51 inputs. All data is made up.

- `wall-locks` version 1 has the `locks` 1 to 4, the containers `fixed` and `freeHeight`, the counts 20 and 40, and the seeds 1 to 3. It has 48 inputs.
- The case `touchObstacles` of `edge-cases`, with the count 12 and the seeds 1 to 3, adds 3 inputs. Each one has one locked item on an obstacle.
- The corpus has 123 locked items. Its `claims.declared` counts are `order` 0, `aspect` 0, `free-size` 24 and `shaped` 0.
- The builder `bench/anchor.ts` writes the file. `node bench/anchor.ts --check` and a test compare the file with the builder.

The rules of `wall-locks`:

| Part | Rule |
|---|---|
| The container | The width is 300 to 600. The reference height is the item area over 55% of the width, and 240 or more. A `fixed` box has this height. |
| The free items | `count` items, 20 to 60 wide and 15 to 50 high, with the ids `b0` and on. |
| The locks | 24 to 40 wide and 16 to 32 high, with the ids `l0` to `l3`. Each one has a free length of 8 units or more along its wall. |
| The walls | `fixed`: top, right, left, bottom. `freeHeight` has no bottom wall, so its fourth lock is on the top wall. |

A local small run of 2026-10-28 on `pack-anchor-v1`, all 51 inputs. The numbers read no time, but a local run is not the record of CI.

| Strategy | Median `mean` | Median `max` | Median `moved` | Median `gain` | Share settled |
|---|---|---|---|---|---|
| `rows` | 0.002 | 0.01 | 0.2 | 80.599 | 0.176 |
| `skyline` | 0.054 | 0.657 | 0.365 | 75.56 | 0.039 |
| `maxrects-bl` | 0.049 | 0.537 | 0.341 | 82.2 | 0.039 |
| `shelf-best` | 0.015 | 0.711 | 0.214 | 88.56 | 0.118 |
| `restarts-maxrects-bl-k16` | 0.049 | 0.573 | 0.429 | 80.909 | 0.039 |
| `select-rows-bl` | 0.021 | 0.536 | 0.238 | 82.2 | 0.118 |

- Each strategy has a median gain near 80. A step of 1% of the width sends an item to another row or another free rectangle.
- `rows` has the smallest medians of `mean` and `max` on the first step. Its loop also jumps, in a later step.
- An input settles only when each of its locked items settles. At the gain limit 1, few inputs settle.

The CI run [40799160871](https://github.com/mark1russell7/packing/actions/runs/40799160871) of 2026-10-29 packed all 28 entries with `--anchor`. It is the record.

- The 6 entries of the local run give the same medians in CI.
- The 1377 measured records have 0 hard breaks, and each one is deterministic.
- `rows`, `shelf`, `shelf-next` and `restarts-rows-k16` have the smallest median `mean`, 0.002.
- The median gain of each entry is 55 to 100. `aspect-fit-maxrects-bl` and `aspect-fit-portfolio-k2` have the smallest gain, 55.9.
- A composite entry does not make the jumps smaller. Each portfolio has a median gain of 79 to 83.
- The largest share settled is 0.196, for `shelf-next`. `maxrects-baf` has no input that settles.

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

### The response record

The file `response.json` of the merged artifact is a record `response-records/1` of `@mark1russell7/rigor-statistics` (k143). The summary `packing-coverage/1` keeps only pooled errors. This record keeps each measured point, so the response explorer of a site can show the points, a fitted surface and its held-out error.

```bash
node bench/response.ts --records <file> --corpus <file> --out <file> [--run <id>] [--seeds <n>] [--folds 5] [--seed 1]
```

- Each record of a run is one point. `--seeds` keeps the first seeds of each spec. `bench.yml` keeps 2.
- The dimensions are the strategy and each param of the corpus with two levels or more. A number param is ordinal, and another param is categorical.
- The family is a dimension when a param is only in some families, or when two families have the same params. A param of some families has a condition on the family.
- A skipped record is a point with the reason `skipped`.
- The points of one spec are one group. Thus a fold holds out a whole spec, as the coverage does with `--by spec`.
- The fit is a ridge fit of degree 2 with the products of two dimensions. The time has a log scale, as in the coverage. Above the limit of terms, the fit has no products.
- Each fold keeps the prediction of each held-out point, so `heldOutErrorAt` gives the error of one strategy or one cell.

The page `explorer/` of the site reads `packages/site/data/response-coverage.json`. This command writes that file from `response.json`:

```bash
node bench/response.ts --site <response.json> --out packages/site/data/response-coverage.json
```

The file keeps each point, each model and the error of each fold. It leaves out the predictions of the folds, because they are 60 % of the gzip size and the page does not read them.
- A measure has the range of `MEASURE_SPECS` only when each value is in it. A record from before k118 can have a `pack.gap` above 1.
- A corpus with fewer than 3 specs gives no file.

The regression tree of `bench/coverage.ts` stays the coverage model. The surface of this record is for a view, and the coverage share does not read it.

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
| `guillotine-baf-sas` | `move.freeChoice` | The choice rule puts a box in a free rectangle that is not the first free rectangle where it fits. |
| `guillotine-bssf-sas-merge` | `move.merge` | The merge joins two free rectangles with a common full edge into one. |

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

## A predicate dump

The command `predicates` writes the near-degenerate inputs of the float predicates of the packer as JSON lines. Item A13 of the role `algebra` uses them to rank exact predicates.

```sh
node bench/main.ts predicates --corpus smoke-v1 --strategies all --out bench-out/predicates
```

The workflow `Predicates` (`.github/workflows/predicates.yml`) dumps a full corpus in CI, with one job for each entry. Its default corpus is `pack-select-v2`. The artifact `predicates-<corpus>` has `predicates.jsonl` and `summary.json`.

A slow entry needs shards. `ruin-recreate-skyline-k64` on `pack-select-v2` needs more than the 240 minutes of one job.

- The option `--shard <index>/<count>` packs one contiguous block of the inputs, from index 0. The file `run.json` records the shard.
- The input `shards` of the workflow (1 to 32, default 1) gives each entry that count of jobs.
- The job `merge` joins the parts in the order of a dump without shards. Thus the joined file is byte-equal to one dump.
- The job `merge` fails when a part is missing, and it keeps the artifact.

The command packs each input one time with each entry, and then examines the output with `checkHard`. The probe of `src/probe.ts` sees these predicates in the pack and in the check:

| `fn` | Where | The inputs of a line |
|---|---|---|
| `overlap` | `checkHard`, each pair of boxes | `a`, `b` as `{l,t,r,b}`, `tolerance`, and `gap` for a pair of `pairGaps` |
| `container` | `checkHard`, each box | `box`, `x`, `y`, `w`, `h`, `inset`, `tolerance`, `fixedW`, `fixedH` |
| `edgeRange` | `src/space.ts`, each edge of a polygon and each strip | `ax`, `ay`, `bx`, `by`, `y0`, `y1` |
| `xAt` | `src/space.ts`, in `edgeRange` | `ax`, `ay`, `bx`, `by`, `y` |
| `samePlacements` | `src/layout-input.ts`, the portfolio of k130 | `a`, `b`: the first pair of placements that are different but near |

A box has its edges as the predicate reads them. A width `w = r - l` is a rounded value, so the line does not give it.

A value is near when its size is at most `1e-9` times the largest size of the inputs of the predicate. These values count:

- `overlap`: the margin `min(right) - max(left)` of each axis (`x:zero`, `y:zero`), and the margin minus the tolerance (`x:tolerance`, `y:tolerance`).
- `container`: the box edge minus the inner side (`<side>:zero`), and the box edge minus the side moved out by the tolerance (`<side>:tolerance`). Only a fixed side counts.
- `edgeRange`: the ends of the segment against the sides of the strip (`low`, `high`), and two near but different ends (`flat`).
- `xAt`: a `y` near an end but not at it (`end`).

A value of exactly 0 gets the suffix `:touch`. Its float sign is exact, so an input with only touch values gets no line. The case line counts it in `touch`.

Each near line is `{"case","fn",...the inputs,"near","floatAnswer","times"}`. The case is `<entry>/<input id>`. `times` counts the same line in the case. After the near lines of a case, one case line gives `{"case","totalPairs","totals","near","touch","lines"}`. `totalPairs` is the count of the pairs of `overlap`.

`JSON.stringify` writes each number exactly, but it writes `-0` as `0` and an infinite size as `null`. The probe does not change an answer, and the other commands do not set it. Thus their outputs stay byte-equal.

## The raster no-fit

The workflow `Raster no-fit` (`.github/workflows/raster-nofit.yml`) measures `packRasterNofit` (roadmap item k92). It has `workflow_dispatch` only. Its artifact `raster-nofit` has `raster-nofit.json` and `summary.jsonl`.

```sh
node bench/raster-nofit.ts --out out.json --instances <dir> --seeds 30 --trials 64 --instance-trials 1024
```

- The family `raster-k92` is made up: 30 items of stars, boxes and circles for each seed. Its cells are 1/8, 1/16 and 1/32 of the mean box side.
- `medianGainOfFinest` is the median over the seeds of `density(finest) / density(cell) - 1`. It is the density cost of that cell, with the same trials.
- The job fetches 12 instance files at a pinned commit of `JeroenGar/sparrow` (MIT). Their origin is `ESICUP/datasets` (CC0). This repository does not hold them.
- `--instances` reads each `.json` file of the folder, so keep `--out` in a different folder.
- Each instance has cells of 1/40, 1/80 and 1/160 of the strip width.
- Each row has its `published` values and the label `turns`. Only a row with `same` compares the same problem. `docs/PACKER.md` tells the limits.
- `crossings` is a float audit that does not read a grid. Each row must have 0. It looks for an edge crossing or a probe point inside the other shape.
- The density does not depend on the machine. `ms` does, so read it only from a CI run.

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

## A paired time test of strategies

The workflow `Bench` packs each strategy in its own job, often on a different CPU. Thus a time ratio of two strategies from `Bench` compares runners. A claim from such a ratio is void (k127).

The workflow `Paired time` (`.github/workflows/paired-time.yml`) times two or more strategies in one job. Start it with the GitHub CLI:

```sh
gh workflow run paired-time.yml -f arms=select-rows-bl,portfolio-fill-rows-bl -f corpus=pack-classes-v1 -f prediction=<id>
```

| Input | Default | What it sets |
|---|---|---|
| `arms` | | The ids of the strategies, with commas. The first one is the base. |
| `corpus` | `pack-classes-v1` | The corpus. |
| `prediction` | | The id of the prediction of the run. |
| `mode` | `fresh` | `fresh`: a new process for each arm, each input and each round. `process`: one process. |
| `repeats` | `5` | The timed rounds of each arm on each input. |
| `warmup` | `2` | The untimed passes of each arm before each timed pass. |
| `passes` | `1` | Mode `fresh` only: the timed passes of each child. The time of the child is their median. |
| `events` | `false` | Mode `fresh` with 2 passes or more: each child counts its GC events and its deopts (k130). |
| `aa` | `true` | The A/A arm: a second copy of the base, for the noise floor. |
| `only` | empty | The test uses only the inputs with this text in their id, for example `.fixed.`. |
| `gate` | empty | The name of a time gate in `bench/gates/`, for example `k66-time`. The job fails when the gate fails. |
| `budget` | empty | The id of a candidate arm for the time budget of a promotion (k128). It needs `runs` 5 and mode `fresh`. |
| `runs` | `1` | The count of the same test, from 1 to 9. Each run is a job, at most 3 at one time. |

The job starts `node bench/main.ts paired`. The helper `bench/paired-time.ts` writes the report of the shared interface `paired-time/3`. The two modes are:

- Mode `fresh` starts a child `paired-child` for each arm, each input and each round. The child does the warm-up runs, times `passes` runs, and writes their median time and its memory peak.
- Mode `process` packs each input with the arms in turn in one process.

In both modes, the order of the arms in a round comes from `armOrder` of `@mark1russell7/rigor-bench`. Each odd round is the reverse of the round before it, and each even round turns the arms by one more place. After any count of rounds, the two orders of a pair differ by 1 or less.

The test uses only the inputs that each arm supports. The ratio of an input is the median time of the arm over the median time of the base. A group is a seed of the corpus.

The artifact `paired-time-<corpus>-<mode>-run<n>` of each run has `run.json`, `paired-time.json` and `paired-time.md`. For each arm, the report gives the median, p10 and p90 of the ratios. It also gives the median of each group, and the mean and SD of the groups. The noise floor is the median, p10 and p90 of the A/A ratios. The value `moved` of an arm is the share of its inputs with a ratio outside [p10, p90] of the A/A arm.

A claim gives the median, p10, p90 and `moved` of each arm, and the noise floor. A difference inside the noise floor is not a result.

Schema `paired-time/3` is `paired-time/2` in this order (k165). A pair reader refuses a report of an older schema, because it cannot read which arm of a pair started first. Schema `paired-time/2` is `paired-time/1` with three more fields (k130).

- `wallMs` is the time of all the rounds of the job.
- `passes` is the count of timed passes of each child of mode `fresh`.
- With 2 passes or more, each child also gives `warm`. It is the median of the last half of its passes over the median of the first half.
- The report gives `warm` for each arm and input. For each arm, it also gives the median, p10, p90 and `outside`. The value `outside` is the share of inputs with a warm value outside [p10, p90] of the A/A arm.
- A warm value outside the A/A band tells that the child did not reach a warm state. That input is not a result.
- `warmRule` gives the verdict of a report. An arm is warm when two conditions are true. Its `outside` is at most the `outside` of the A/A arm plus 0.1. Its warm median is in [0.97, 1.03].

The event count (`events`, k130) finds the cause of a warm value outside the A/A band.

- A `PerformanceObserver` records the start of each GC event of the child. The V8 flag `--trace-deopt` writes each deopt to a file of the child.
- The child counts the events of the first half and of the last half of its timed passes. The reads of the file are outside the timed passes.
- The report gives `events` for each input and arm: `{"gc": [first, last], "deopt": [first, last]}`, the sums over the rounds.
- The observer and the trace add some work to the child. Thus a run with `events` is a diagnosis, not a time gate.

The warm rule is relative, because a fixed limit failed. The prediction of the first fresh run of k130 had the limit `outside` 0.2 or less. By construction, 20 % of the A/A ratios are outside their own p10 to p90. The warm value of a child has its own noise. Thus the A/A arm itself had 0.18 to 0.32, and the limit was below the noise floor.

An arm `wrap-<entry>` is the portfolio wrapper of `packPortfolio` around one entry, with a key that has no hard breaks, no levels and no hash. The ratio of `wrap-rows` over `rows` is the cost of the wrapper alone (k130).

### Absolute times

An absolute time of this repository is an in-order time, if no paired test is named with it. The records of `bench.yml`, the roadmap and the site have such times.

- One CI process packs the inputs in order, after a small warm-up. The time is the median of the timed runs of each input.
- An in-order time depends on the CPU and on the state of the process. Thus it is not a result for a comparison.
- A warm child of mode `fresh` (5000 untimed passes) gave 0.94 to 0.97 of the in-order time for `rows` and `maxrects-bl`, and 0.91 for the portfolio (EPYC 7763, run 41470082104).
- At 1000 untimed passes (run 41455264185), the same ratio was 1.11 to 1.24. Thus the warm-up changes the level, and only a paired ratio compares two strategies.

### A time gate

A time gate (`bench/time-gate.ts`, schema `packing-time-gate/3`) is a record in `bench/gates/`. It gives a limit on the paired ratio of one arm against its base, on one corpus and in one mode.

- Schema 3 (strategist, 2026-11-03) takes its measures from `@mark1russell7/rigor-bench`. Each round of an input is one record of the pair (base, arm), with the arm that ran first.
- The ratio of an input is the `caseRatios` ratio: the median of the log ratios of its rounds. Each round cancels the drift of the runner. Schema 2 divided the median times.
- `sum-median` is the median over the inputs of the ratio of the arm to the sum of the times of the `members` in each round.
- A limit comes from 5 CI jobs of the same paired test or more. The record keeps the values, the jobs, the CPUs and the A/A facts of each job.
- The rule of the gate limits (STRATEGY.md, 2026-11-02): the limit is the worst value plus the spread (max - min). It is rounded up to 4 decimals, away from the data. A limit rounded down can fail a value of its own record.
- No limit uses a fixed factor. Schema 1 had the old rule, the worst value times 1.1, and a fixed A/A tolerance.
- A measure that the item does not gate is a report, with the reason in the record.
- `node bench/main.ts paired-gate --gate <file> --dir <out>` applies the gate to a run. It writes `gate.json` and `gate.md`.
- `node bench/main.ts paired-gate-derive --gate <file> --dirs <out dirs> --runs <run ids>` writes the values of a record from its runs.
- `time-gate.yml` makes one job of the paired test of each gate in its list, with the settings of the gate record. `ci.yml` uses it, so CI OK needs it.
- A pull request starts these jobs only when a file of the gates changed. The workflow names the files. A push or a release does not start them again.
- The gate refuses a report of another corpus, mode or base, and a report without the A/A arm. It also refuses records that break a rule of rigor-bench.
- The result has the time verdict of rigor-bench for the first check: `faster`, `slower`, `same` or `cannot decide`. It is a report.

The noise cap (strategist, 2026-11-03) stops a pass on a noisy run.

- The A/A noise of a run is the half width on a log scale of its A/A band of kind `case` at the level 0.8. The level 0.8 holds 80 % of the A/A inputs, as the band p10 to p90 of schema 2.
- The field `noise` of the gate has the median A/A noise of the derivation runs, the quiet noise. The cap is 3 times the quiet noise, rounded up.
- The A/A noise grows with the spread and with a shift of the A/A ratios. Thus the cap also replaces the rule of schema 2 that the A/A band contains 1.
- The line `aa.noise` gives the noise of the run and the cap. A run above the cap gets the verdict `cannot-decide`, with the exit code 3.
- On `cannot-decide`, the job `retry` of `time-gate.yml` runs the gate one more time on a fresh runner. A second noisy run fails.
- The limit comes from the runs of the derivation, not from the run that the gate examines. A noisy run cannot make the limit wider.

The other rules of a gate:

- The gate refuses a run with another filter `only` than the gate. A gate without `only` takes only a run of all the inputs.
- With `warmup` or `passes`, the gate refuses a run of mode `fresh` with another count of passes.
- The field `steady` of the gate gives the arms of the warm rule. A check or a report with `steady: true` uses only the inputs with each of these arms warm. The line `steady.inputs` gives their count.
- The measure `sum-median` is the median of the time of the arm over the sum of the times of the `members` of the gate.

The gate `k66-time` replaces the time test of k66 for `select-rows-bl` on `pack-select-v2`. That time test divided by `max(b, 3.33 ms)`. The in-order time `b` of `rows` is 0.12 to 0.21 ms, so the ratio was an absolute time, and it passed or failed by the CPU. The new gate is the paired median of `select-rows-bl` / `rows` in mode `fresh`.

- Jobs 1, 3 and 5 of run 41547217059 and jobs 1 and 2 of run 41646832894 give 1.7905, 1.8192, 1.8277, 1.7531 and 1.7536. The limit is 1.827744 + 0.074615, rounded up to 1.9024.
- Jobs 2 and 4 of run 41547217059 stopped at the old job limit of 120 minutes, with no report. The second run replaced them.
- The A/A noise of the 5 jobs is 0.080 to 0.105. The quiet noise is 0.0898, so the cap is 0.2694.
- The q95 (11.3 to 13.0) is a report.
- One job of `k66-time` takes 91 to 105 minutes. That is more than the 60 minutes of `time-gate.yml`, so `k66-time` is not in its list. A dispatch of `paired-time.yml` with the input `gate` applies it.

The gate `k130-time` is the cost of the portfolio `portfolio-fill-rows-bl` against the sum of its members `rows` and `maxrects-bl`. It uses mode `fresh` on the `.fixed.` inputs of `pack-classes-v1`, with 5000 untimed passes and 200 timed passes.

- The gate measures all 250 inputs. The slow tail of the portfolio is what a user pays, so a change that makes the tail worse fails the gate.
- The 5 jobs of run 41470082104 give 1.3132, 1.3765, 1.3709, 1.3813 and 1.3080. The limit is 1.381275 + 0.073245, rounded up to 1.4546. The limit of schema 2 was 1.4624.
- The A/A noise of the 5 jobs is 0.027 to 0.062. The quiet noise is 0.0308, so the cap is 0.0924.
- The portfolio arm fails the warm rule at 5000 untimed passes (`outside` 0.30 to 0.46). The steady inputs (101 to 151 of 250 per job) give a second number, a report.
- On the steady inputs, the 5 jobs give 1.2914 to 1.3777. The band that picks these inputs comes from the data of each run, so this number does not gate.
- On all the inputs, the portfolio costs 1.35 times the sum of its members (the mean of the 5 jobs).

### The time budget of a promotion

The time budget (`bench/time-budget.ts`, schema `packing-time-budget/3`, roadmap items k128 and k133) is the time test of a new strategy. It applies the time test of the linked win test in `docs/PROMOTION.md`.

- The verdict comes from `@mark1russell7/rigor-bench`: `pooledVerdict` with the options `margin` and `noiseCap`, `balanceOrders` and `limitVerdict`. packing keeps no verdict logic.
- The settings are in `BUDGET_POLICY`, and the settings table of `docs/PROMOTION.md` gives them.
- Each CI job of mode `fresh` with the A/A arm gives one job of the pooled verdict. The candidate pair is (default, candidate), and the A/A pair is (default, `<default>~aa`).
- Each input and each round of a report give one record of each pair. The two pairs share the time of the default of the round.
- The first arm of a record comes from the order of `armOrder`. That order rotates the arms of the report by the round.
- Each time gate prints the counts per order of its pair, and the order size from `orderSize` of `@mark1russell7/rigor-bench`. The size is a guide: it holds for a mean, and the verdict reads a median. If a future margin of a limit falls under approximately 3 times the size, even counts come back.
- The job `j` uses the rounds from `j` times the rounds of a job. Thus the merged records have one record of each case and round.
- With 3 arms, the rotation does not turn each pair in each round. In 5 rounds, the candidate pair starts with the default 3 times, and the A/A pair 2 times.
- The balance of the orders then removes 4 records of each case in each pair from 5 jobs. The record keeps this count.
- The balance removes the records with the highest rounds first. Thus most removed records are records of the last job.
- The verdict is `promoted` for a pooled outcome `same` or `faster` and a time tail `within`. An empty tail set does not stop a promotion.
- The verdict is `not promoted` for a pooled outcome `slower` or a time tail `beyond`. Each other outcome gives `cannot decide`.
- The option `share` of `limitVerdict` is `timeTailQ` (0.95). With 24 tail cases, 1 case can be `beyond` or `cannot decide`. The record keeps `share` and `allowed`.
- The record keeps the pooled interval, the A/A median ratio, the A/A spread, the noise cap, the margin and the count of removed records.
- The record also keeps the verdict and the CPU of each job, the outcome of each tail case and the URL of the CI run.

The proposal of `noiseCap` comes from the A/A arms of 3 k66 jobs of `pack-select-v2` (2025 cases, 5 rounds). The spread is the 0.9 quantile of `abs(log(ratio))` from `aaSpread`:

| Job | CPU | A/A spread | A/A median ratio |
| --- | --- | --- | --- |
| k66 job 1 | AMD EPYC 9V74 | 0.1347 | 0.998 |
| k66 job 3 | AMD EPYC 9V74 | 0.1379 | 1.0012 |
| k66 job 5 | Intel Xeon 6973P-C | 0.1196 | 1.0005 |
| The merged records of the 3 jobs | | 0.0752 | 0.9997 |

The proposal 0.156 is the worst job plus the spread of the jobs (0.1379 + 0.0183). With it, a quiet job votes in the guard of the jobs. The merged records are under it.

- After a promotion, the strategy gets a time gate in `bench/gates/` (the worst value plus the spread of 5 runs).

The input `budget` of `paired-time.yml` names the candidate arm. With `runs` 5, the job `budget` writes `budget.json` and `budget.md`. The record prints each CPU model with its job count. With 2 models, it states "models not tested at 5 jobs" and the floor of the model test as the reason. At a split of 3 and 2 jobs, the smallest p is 0.2. The verdict reads the ratios inside each job, and it does not say that the models agree. A page that quotes a budget result carries the same line. Locally, `node bench/main.ts paired-budget --dir <folder of runs> --arm <id>` gives the same record.

### The speed claims

The workflow `claims-time.yml` measures the speed claims of k124 (`relax`), k125 (`force`) and k80 (`overlap-min`) again as paired time tests.

- One dispatch starts a matrix of 30 jobs: 3 claims, 2 corpora and 5 jobs for each pair. Each job uses mode `fresh` with the A/A arm.
- The first corpus is the corpus of the old bench record: `pack-screen-v1` for k124 and k125, `pack-classes-v1` for k80.
- The second corpus is `pack-select-v2`. For k80 it is `pack-strip-v1`, because `overlap-min` packs only free-height strips and `pack-select-v2` has none.
- The ratio of a claim is the median over the inputs of the time of the arm over the time of its member. The value of a claim is the median of the 5 jobs.
- A job counts only when its A/A band p10 to p90 contains 1.

## The scaling of each strategy

The scaling report (`packages/packing/bench/scaling.ts`, roadmap item k13) fits the growth of the time with the box count. It reads the records of a finished CI run. It has no timing loop, so it is safe on a local computer.

```sh
node bench/scaling.ts --records <records.jsonl> --run <id> --out <dir>
node bench/scaling.ts --paired <paired-time.json> --run <id> --out <dir>
```

The first form reads the artifact `bench-pack-worst-v1` of `bench.yml`. The second form reads a report of `paired-time.yml` in mode `fresh`, and also fits the memory. The script writes `scaling.json` and `scaling.md`.

### The inputs and the fit

The inputs are the rungs of `ladder.count` in `pack-worst-v1`. Only the count moves there: 10 to 2560 boxes in 9 rungs, with 5 seeds on each rung. Other corpora move other axes at the same time.

- The strip has the width 1024, and the sides go from 64 to 256. Thus each result is about this strip. It is not a bound for other containers.
- The exponent is the least-squares slope of log time on log n, from `leastSquares` of `rigor-statistics`.
- The interval is a 95 % bootstrap of whole rungs (`bootstrapClusters`). The rows of one rung share a place in the process, so a bootstrap of single rows is too narrow.
- A growth is a name from `1`, `log n`, `n`, `n log n`, `n^1.5`, `n^2`, `n^2 log n` and `n^3`. The exponent of a growth is its own slope over the same counts. Thus a narrow range cannot separate two growths. On the ladder, `n log n` has the exponent 1.22.

### Read a result

| Reading | Meaning |
|---|---|
| one growth | The interval holds only this growth. |
| `cannot tell` | The interval holds two or more growths. The data do not separate them. |
| `between the growths` | The interval holds no growth of the list. It is not a claim. |
| `curved` | The slope changes over the range, and the names come from the upper half of the rungs. |
| `too few rungs` | The fit has fewer than 5 rungs, so it gives no exponent. |

A fit is `curved` when two conditions are true. The interval of the coefficient of the square of log n does not hold 0. The two halves also differ by more than 0.25, because a smaller difference changes no growth. A curve that goes up gives a local growth, and the true growth at larger n is that growth or more.

The interval is a little narrow. On 300 made-up sets at each of 4 noise levels, it holds the true exponent in 91 % to 93 % of the sets. A power law gets the reading `curved` in at most 1 % of the sets.

### The first result

The records of run 40789873220 (`bench-pack-worst-v1`, commit `dce931a`, EPYC 7763) give this table. The times are in milliseconds.

| Entry | Exponent | 95 % interval | Lower half | Upper half | Time at 2560 | Reading |
|---|---|---|---|---|---|---|
| `aspect-fit-maxrects-bl` | 0.66 | 0.07 to 1.23 | -0.28 | 1.25 to 1.84 | 48.23 | curved, upper half: `n^1.5` |
| `aspect-fit-maxrects-bssf` | 0.75 | 0.22 to 1.51 | -0.27 | 1.34 to 1.83 | 29.99 | curved, upper half: `n^1.5` |
| `aspect-fit-portfolio-k2` | 0.99 | 0.41 to 1.53 | -0.01 | 1.71 to 2.15 | 719.52 | curved, upper half: `n^2` |
| `bbox-maxrects-bl` | 0.91 | 0.82 to 0.99 | 0.91 | 0.84 to 1.08 | 2.65 | between the growths |
| `bbox-skyline` | 0.90 | 0.80 to 0.98 | 0.85 | 0.81 to 0.96 | 21.49 | between the growths |
| `maxrects-baf` | 0.98 | 0.93 to 1.07 | 0.89 | 0.77 to 1.07 | 2.99 | `n` |
| `maxrects-bl` | 0.92 | 0.80 to 1.01 | 1.15 | 0.33 to 1.01 | 2.56 | `n` |
| `maxrects-blsf` | 1.06 | 1.00 to 1.13 | 0.97 | 1.01 to 1.12 | 4.55 | between the growths |
| `maxrects-bssf` | 1.01 | 0.94 to 1.09 | 0.85 | 0.98 to 1.22 | 3.23 | `n` |
| `maxrects-cp` | 1.84 | 1.72 to 1.98 | 1.68 | 1.95 to 2.12 | 439.27 | curved, upper half: `n^2` |
| `portfolio-area-rows-bl` | 1.41 | 1.22 to 1.60 | 1.13 | 1.50 to 1.89 | 126.50 | curved, upper half: `n^1.5` |
| `portfolio-k2` | 1.42 | 1.11 to 1.72 | 0.89 | 1.78 to 2.16 | 658.67 | curved, upper half: `n^2` |
| `portfolio-k3` | 1.36 | 1.04 to 1.67 | 0.87 | 1.55 to 2.16 | 666.32 | curved, upper half: `n^2`, `n^2 log n` |
| `restarts-maxrects-bl-k16` | 1.38 | 1.20 to 1.55 | 1.11 | 1.47 to 1.83 | 1324.39 | curved, upper half: `n^1.5` |
| `restarts-maxrects-bl-shuffle-k16` | 1.38 | 1.18 to 1.57 | 1.07 | 1.52 to 1.82 | 1276.55 | curved, upper half: between the growths |
| `restarts-rows-k16` | 1.38 | 1.19 to 1.58 | 1.05 | 1.54 to 1.84 | 1102.94 | curved, upper half: between the growths |
| `rows` | 0.94 | 0.75 to 1.13 | 0.56 | 1.05 to 1.52 | 4.17 | curved, upper half: `n log n`, `n^1.5` |
| `select-rows-bl` | 1.07 | 0.84 to 1.29 | 0.72 | 1.18 to 1.56 | 4.12 | curved, upper half: `n^1.5` |
| `shelf` | 0.94 | 0.80 to 1.07 | 0.73 | 1.02 to 1.25 | 1.06 | curved, upper half: `n log n` |
| `shelf-best` | 1.77 | 1.59 to 1.93 | 1.50 | 1.87 to 2.07 | 158.16 | curved, upper half: `n^2` |
| `shelf-first` | 1.68 | 1.46 to 1.92 | 1.28 | 1.88 to 1.98 | 86.61 | curved, upper half: between the growths |
| `shelf-first-input` | 1.62 | 1.40 to 1.85 | 1.25 | 1.77 to 1.94 | 44.90 | curved, upper half: between the growths |
| `shelf-next` | 0.98 | 0.92 to 1.10 | 0.91 | 0.63 to 1.34 | 1.43 | `n` |
| `skyline` | 0.83 | 0.74 to 0.94 | 0.69 | 0.78 to 1.07 | 12.25 | between the growths |
| `skyline-bl-waste` | 0.96 | 0.87 to 1.00 | 1.06 | 0.81 to 1.08 | 49.32 | between the growths |
| `skyline-mw` | 0.99 | 0.91 to 1.04 | 1.05 | 0.93 to 1.14 | 54.55 | `n` |
| `skyline-mw-waste` | 0.96 | 0.87 to 1.00 | 1.02 | 0.99 to 1.06 | 28.44 | between the growths |

Read the table with these limits:

- The run has 1 timed pass, in order, so it has no check of the noise of a rung. A later dispatch with 5 repeats replaces this table.
- The run is older than the current code. It has 27 entries, and `push` is skipped. It has none of the later entries.
- Each entry has its own job, so compare the exponents and not the times (k127). Each of the 243 cells of an entry and a rung has 5 rows. The records have 0 overflow and 0 hard breaks.
- The exponent of the top 5 rungs differs from the exponent of all rungs by more than 0.3 for 9 of the 27 entries. The cost of the order in the process is thus not small on some entries. `aspect-fit-maxrects-bl` takes 0.92 ms on rung 0 and 0.39 ms on rung 3. A paired run of mode `fresh` measures this cost.

The main results:

- The entries `maxrects-bl`, `maxrects-baf`, `maxrects-bssf`, `maxrects-blsf`, `skyline-mw` and `shelf-next` have an exponent near 1 on this strip.
- A likely cause for `maxrects` is the fixed width, which keeps the list of free rectangles short. This is not measured yet.
- `maxrects-cp`, `shelf-best`, `shelf-first` and `shelf-first-input` have an upper half near 2.
- The wrappers cost much more than their members at large n. `restarts-maxrects-bl-k16` takes 1324 ms at n = 2560, and 16 times its member is 41 ms. The cause of this gap is not measured yet.
- `rows` has the upper half 1.05 to 1.52, so the data do not separate `n log n` from `n^1.5`.

### The memory

The records of `bench.yml` have no memory field. A report of mode `fresh` has `peakRss`, the highest memory peak of a child.

- A peak holds the memory of Node.js. In run 41716853739 (`pack-select-v2`, arm `rows`), the median peak is 110.4 MB at n = 10 and 118.5 MB at n = 1000.
- Thus the fit takes the excess over the median peak of the smallest rung. A rung stays only when its median excess is above the spread of the smallest rung.
- No paired run has the ladder yet, so this document has no memory table. Give `paired-time.yml` the inputs `corpus=pack-worst-v1` and `only=ladder.count.` to make one.

A peak of a process is a coarse measure of a small heap. A better measure is the heap of one pass in each record. That needs a change to `bench/run.ts`, which is the next part of k13.

## The gap to a proved optimum

The workflow `Exact` (`.github/workflows/exact.yml`) compares each named entry with the proved optimum of `exactStrip` (roadmap item k10, `docs/PACKER.md`, "The exact strip"). It uses small made-up strips from 9 families. The script is `packages/packing/bench/exact.ts`, and it is not a command of `bench/main.ts`.

Start it with the GitHub CLI:

```
gh workflow run exact.yml -f sizes=6,8,10,12 -f seeds=5 -f nodes=5000000 -f entries=all
```

These values are the defaults. The artifact `exact-<sha>` has `records.jsonl`, `summary.json` and `summary.md`. The job summary shows `summary.md`:

- For each count of items: the proved inputs, the best entry and its mean gap.
- The costs: the nodes, the nodes in each second and the peak memory.
- For each family and count of items: the proved inputs.
- For each entry: the mean gap, the worst gap, the inputs at the optimum and the Wilson interval of that share.

A gap is `height / optimum - 1`, with the height of the hull. Only an input with a proved optimum has a gap. An input that the node limit stopped keeps its `height` and `lowerBound` in the records, and it is not in the table of the entries. An entry layout with a hard break is not in that table too.

The job fails only on a break of a proof:

- Two searches of one input give different bytes.
- An exact layout breaks a hard rule.
- The lower bound is under the k51 bound, or the k51 bound is above a proved optimum.
- A layout with no overlap is below a proved optimum.

The times in the records are only for the cost line. No gate reads them.

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
12. `Hard breaks and determinism`: each measured record with a hard break or with `deterministic` set to `false`. A good run has none. The section starts with the two counts of the determinism gate (k121).
13. `Stability`: the count of records with the stability measures.
14. `Bounds`: for each strategy and objective, the median and the quantile 0.95 of `pack.gap`, and the count of each bound that wins.
15. `Predictions`: each prediction with the id of the run, the measured value and the result of the comparison.

A `run.json` from before k59 has no screen guards. Sections 6 to 9 then show one line that tells it. A `run.json` from before k60 has no ranking, and section 5 shows one line. A `run.json` from before k20 has no portfolio report, and section 10 shows one line.

The guard measures are the measures with a floor in `MEASURE_SPECS`: `pack.aspectError`, `pack.order.inversions`, `pack.overflow` and the 3 stability measures. Lower is better for each guard. The floor is 0.

The column `ms sum` is the sum of the medians. The time of a job is longer, because each pair also has the runs for determinism and the warm-up runs.

## Treemaps against the literature

The file `bench/treemap-literature.ts` compares the treemaps of `src/treemap.ts` with the three log-normal tables of Bederson 2002. The workflow `treemap-literature.yml` starts it. Only `workflow_dispatch` starts this workflow, because the output is a report and not a gate.

- The data is made up, in the form of section 2.3.2 of the paper. It has a log-normal start and a log-normal walk, in a square of side 100.
- The measures are those of section 2.3.1: the unweighted mean aspect, the mean distance of `(x, y, w, h)` and the readability.
- The tables do not tell if the strip row has the lookahead of section 2.2.1. Thus the arms `strip` and `strip-no-lookahead` read the same row.
- The text of the paper gives a variance of 0.05 for the log of each step. The Change column is near a standard deviation of 0.05. Thus the report has a row for each reading of the walk.
- Shneiderman 2001 has the pivot by middle and the pivot by size, but not the pivot by split size. Bruls 2000 has no table of means. Its worked example is a unit test in `src/treemap.test.ts`. Shneiderman 1992 has no measured value.

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
| `releases.json` | `node bench/snapshot.ts releases` | The releases of `CHANGELOG.md`, with the date, the commit and the pull request of each tag. The Pages build writes this file again, so its copy on `main` is not the source. |
| `gaps-pack-select-v2.json` | `node bench/snapshot.ts gaps <folder of 40766464710> --run 40766464710 --measure pack.gap --release 0.2.17` | `pack.gap` of 6 strategies on `pack-select-v2`, by cell, with the kinds of the bounds (k51). |
| `gaps-pack-known-v1.json` | `node bench/snapshot.ts gaps <folder of 40768140939> --run 40768140939 --measure pack.gapToOpt --release 0.2.17` | `pack.gapToOpt` of 6 strategies on `pack-known-v1`, by cell (k45). |
| `coverage.json` | `node bench/snapshot.ts coverage <folder of 40783923164> --run 40783923164 --date 2026-10-28 --release 0.2.17` | The space coverage of 5 strategies on `pack-select-v2` (k105). Each new run adds a point to the trend. The folder `sample` of a run adds the whole space (k112). |

The workflow `site-data.yml` starts these commands in CI from finished runs on `main`. Its input `runs` has the form `pack-free-v1=<id> pack-classes-v1=<id>`.
A completed run of `coverage-nightly.yml` on `main` also starts this workflow, with its grid as the run of `pack-classes-v1`. So each Monday gives a point of the coverage trend with no dispatch.

A run that a person starts gives a point too, because a point is a measure, but a cancelled run gives no point.
Each point records the start of its run: `schedule`, `dispatch` or `push`. The trend shows it with the link of the run. The start does not change the line of a point.
`bench/site-data-trigger.test.ts` holds the condition of the job. Before this change, a filter on the event lost the point of run 41993720877, which measured for 8 hours.

The workflow `site-rerun.yml` reruns the other five corpora of the site each Wednesday, one corpus after another, with the wall budget of each pair. A completed run on `main` also starts `site-data.yml`, which writes the files of each corpus with merged records in that run. A corpus that failed keeps its earlier file. `bench/site-rerun.test.ts` compares the corpora of the two workflows.

- A point of the coverage trend has its corpus, its list of strategies and its method. The method is the timed runs, the warm-up runs and the wall budget. A line of the trend joins only points with one corpus and one method.
- A newly measured entry does not restart a line. The snapshot also fits the records of the run over each earlier list with the same method. That share continues the line of the list. The page states the count, for example `54 common of 55`, and the new entry starts its own line.
- An entry that loses its row ends the line of each list that has it. Dropping a hard entry can raise a share, so it does not join. The point has `lost`: each entry with its reason, for example over budget, refused or an error. A censored reason keeps its lower bound on the time. The snapshot step gives a warning for each one.
- A slow pair can lose its row while its entry keeps a row. That line continues, each point has its count of measured records, and the page states a change of that count.
- A step between two points of one line reads the pairs measured in both points, by strategy and input. `site-data.yml` gets the records of the earlier run from its artifact, and both points get a new fit over these pairs. The page shows that figure beside the plain share, with the count, for example 90 common of 100 pairs.
- A dropped hard pair can raise a plain share, but it cannot raise the figure over the common pairs. Thus the page calls a step a gain only when both figures gain.
- The artifact of a run expires after 90 days. With no records of the earlier run, the step reads "no read" and has no figure. A change of the method and a lost entry end a line, so they have no step.
- An entry that loses its row breaks the line of a list that has it. The earlier run has no share without that entry in the file.
- The job `snapshot` writes the files, starts the tests of the site on them and builds the site. It has no write permission.
- The job `publish` pushes the files to the branch `site-data`, and it starts `pages.yml`. It does not push to `main`.
- A run writes only the files that it changes. The job `snapshot` compares each file with the copy that it made after the overlay, with `snapshot.ts written`. The job `publish` removes nothing from the branch.
- A file on the branch stays until a run for its corpus writes it, and the files of the branch replace the files of `main`.
- The build in `pages.yml` puts the files of the branch over the files of `main`. So the files of the branch are the current data. A build without the branch uses the files of `main`.
- The table of the gaps has one column for each strategy, so the job keeps 6 strategies with `--strategies`.
- `--date` gives the start date of the run. The age of the data counts from that date, and not from the date of the commit.

- A strategy snapshot gives the result of `verdict()` of `@mark1russell7/layout-contract` for each measure, by family, at the level 0.05. The tie of each measure is its `minEffect`.
- The command `select` stops with an error when the training wins differ from `SELECT_LEAF_WINS`. Thus a change of the table also changes the pinned counts and their test.
- A gap snapshot gives the count, the quartiles and the values below 0 of the measure. It gives them for all inputs and for each cell.
- The cell of a gap snapshot is the family up to its container size, for example `perfect-cut.guillotine.fixed`. A record without a finite value counts as missing.
- The commits of the two gap runs come after the tag `v0.2.17`. Thus `--release 0.2.17` gives the release of their packers.
- The Pages build starts the command `releases`. A build starts at each push to main, and again when the workflow Release ends. A tag made with the Actions token starts no workflow. So the news shows a new release after one build. The daily build is the backstop.
- The news and the footer show the last release that has a tag. A version with no tag is not shown as a release.
- The measure `stale-text` adds each version of `CHANGELOG.md`, and the version of the package, that the news does not show. So an old list and a list with a missing release both count.
- A package version with no tag and a version commit under 1 day old is in flight, and it does not count. The measure `release-in-flight` reads 1 and names the version in its unit. Over 1 day, the version counts in `stale-text`, so a failed Release shows.
- After a new bench run, start the command of its corpus again.
- The command `coverage` keeps the earlier points of `coverage.json`. A point of the same run replaces the earlier point. Without a run, a point with the same date and corpus replaces it.
- The section `uniform` of `coverage.json` keeps the last sample with a uniform draw, with its run and its date. A later uniform sample replaces it. A stratified sample keeps it.

## The solved regions

The results page reads each cell of a gap snapshot as a region (roadmap item k109). `packages/site/data/solved-rule.json` holds the floor, the margins, the words and the search reads as data. This file is a rule and not a result, so a person edits it and `bench/snapshot.ts` only reads it. The page and this section tell the rule in one wording, and a test compares them.

- The test reads the share of inputs at or under the margin. The 95 % Wilson lower bound of this share must be 0.90 or more.
- The bound of all inputs at the margin decides the smallest count. Thus 35 inputs can pass, and a cell with fewer inputs reads `too few inputs`, with the count.
- A cell of 1,260 inputs needs 1,155 inputs at the margin, a share of 91.7 %.
- A cell that passes reads `holds, no search read` until the search for hard inputs has read it. Then it reads `solved` if the search finds nothing past the margin.
- A search hit makes the region `open` and shows the input. A cell under the bound also reads `open`, with its distance.
- `pack.gapToOpt` compares with a known best value, so its margin stays 0 plus a numeric tolerance.
- `pack.gap` has a margin of 0 until the exact runs measure the slack of the bound. Then a cell takes a high quantile of this slack, with its run.
- A margin of 0 reads `optimal on N inputs`. A measured slack reads `within the bound's slack on N inputs`.
- A row of `pack.gap` from a run before the change of that measure reads `not read on the current measure`. A row of any measure with no read at the margin reads the same. These rows show no distance.
- The best strategy of a row is a pick after the fact: the same inputs choose it and score it. The selector column shows the figure that a user gets.
- The Wilson bound counts the inputs as independent. This page does not prove that they are independent.
- A strategy can also lead a weekly corpus. The count of weeks led needs 4 weekly points.

A snapshot writes `atMargin`, the count at the margin of the rule, in each cell. Regenerate the snapshot after a change of a margin: a file with another margin reads `not read on the current measure`.

## The corpus coverage

The script `bench/corpus-cover.ts` gives the coverage of the taxonomy as numbers (k50). It reads the manifests in `bench/corpora/`, and it generates no input. The cell of a spec comes from `cell` of its generator.

```sh
node bench/corpus-cover.ts [--out <file>]
```

The default output is `packages/site/data/corpus-cover.json`. A test compares that file with the output of the script, so a new corpus needs a new file. The results page shows the numbers, a grid of the dimension pairs and the inputs of each pair.

The output has three counts, for the union of the corpora and for each corpus:

| Count | Meaning |
| --- | --- |
| `cells` | The distinct cells of the specs, against the product of the 10 dimensions |
| `pairs` | The distinct pairs of values of two dimensions, against all the pairs |
| `values` | The values with an input. `empty` lists the other values |

Read these limits:

- The product counts cells that no input can be. So `cellShare` is a lower limit, not a target.
- The dimensions are `containerSize`, `containerShape`, `obstacles`, `itemShape`, `rotation`, `sizes`, `count`, `order`, `groups` and `mode`. `obstacleMove` is not a dimension here, because only a cell with obstacles has it. A cell has no `objective`.
- A cell is the statement of the generator. The script does not compare it with the generated input.
- `pack-adversary-v1` has no specs, so the script lists it in `skipped`.
- A value outside `COVER_DIMENSIONS` stops the script with a `RangeError`.

## The space coverage

The script `bench/coverage.ts` tells how much of the space of strategies and inputs a regression tree can predict (k105). It reads the records and the manifest of one run.

```sh
node bench/coverage.ts --records <folder>/records.jsonl --corpus <folder>/corpus.json --out coverage.json --run <id> --date YYYY-MM-DD
```

The options `--folds` (5), `--seed` (1) and `--by input|spec` (`input`) change the held-out test. The script prints one line for each measure.

With `--min-records <n>`, a run with fewer measured records gives a note in the output file. The script then stops without an error.

The job `merge` of `bench.yml` starts the script after the merge, with `--by spec` and `--min-records 50`. It writes `coverage.json` into the artifact `bench-<corpus>`.
Its lines also go into the summary of the job. A merged folder without records gives a note, and the step stops without an error.

With `--sample <dir>`, the script adds the section `sampled`: the held-out test on the whole space. [The whole space (sampled)](#the-whole-space-sampled) tells more.

### The features

- The strategy features come from the named config of `packSpace`. Each stage gives its option, and each param of the option gives one feature.
- A meta option gives `stage.combine`, its params, and the stages of its one member. A meta option with more members gives `combine.members`.
- The input features are the cell of the input, its family (`generator@version`) and each param of its spec.
- A feature with more than 8 numeric levels goes into 4 bins. Each bin holds the same count of levels. The bins make the cells.

### The model

- The model of each measure is a regression tree. It splits a numeric feature at a threshold and another feature at one value.
- Each split gives the largest drop of the squared error. Each leaf gives the median of its records. The depth is 12 or less, and each leaf has 3 records or more.
- The baseline gives the median of the training records to each record.
- The test is k-fold. A seeded shuffle puts each input into one of 5 parts. The tree learns on 4 parts and predicts the fifth part.
- With `--by spec`, each spec goes into one part with all its seeds. This test is stricter, because the model sees no seed of the spec.
- The same records and the same seed give the same summary.

### The tolerances

These are the current values. A change of a tolerance changes the shares of all later points of the trend.

| Measure | Scale | Tolerance |
|---|---|---|
| `pack.fill` | linear | 0.02 |
| `pack.gap` | linear | 0.02 |
| `pack.overflow.excessArea` | linear | 0.02 |
| `ms` | `log10`, from 0.001 ms | 0.15, a factor of 1.41 |

A skipped record and a value that is not finite count as missing.

### The summary

- `model` and `baseline` give the mean absolute error, the median absolute error and the share of records within the tolerance. The values are raw, with no transform.
- `skill` is 1 minus the model error over the baseline error. A skill of 0.7 tells that the model removes 70% of the error.
- `indices` give the first-order index of each feature: the variance of the means of its levels over the full variance.
- `explained` gives the same index for the strategy, the input spec and the two together. `noise` is 1 minus the joint index. The seeds cause it.
- A cell is one strategy with one bin of each dimension of a family. The space is the sum, over the families, of the products of their bin counts, times the strategy count.
- A cell is covered when it has records and the mean held-out error of its records is at the tolerance or below.
- `share` is the covered cells over the space. `shareOfMeasured` is the covered cells over the cells with records.

### Read it

- A high share tells that the records predict the measure on most of the space. A new run in a covered cell tells little new.
- A low share tells where to measure next. Look at the features with high indices first.
- A high `noise` tells that the seed changes the measure much. More seeds help, but a better model does not.
- An outlier changes the mean error and the indices much. Compare `medianAe` and `mae` before you trust a low index.
- `pack.gap` has a long tail. Its median error is much lower than its mean error.

### The whole space (sampled)

The share of the cells is a share of the bench grid: the named entries of `bench/entries.ts` on the inputs of one corpus. That grid is a very small part of the space (k112).
The script `bench/sample-space.ts` draws random pairs of a config of `packSpace` and an input. Then `coverage.ts --sample` tests the grid model on these pairs.

```sh
node bench/sample-space.ts --out <folder>/sample --n 400 --seed 1
node bench/coverage.ts --records <folder>/records.jsonl --corpus <folder>/corpus.json --out coverage.json --by spec --sample <folder>/sample
```

The draw of a pair:

1. The family is uniform over `corpusFamilies`. Each active dimension is uniform over its supported values or its range, on the scale of the dimension.
2. The knobs `margin` and `gap` are relative to the median side of the items (k118). The option `--knobs absolute` gives the draw of k112: uniform from 0 to 32. The option `--no-knobs` keeps them at 0.
3. An input with more boxes than `--max-count` (1000) goes back. An input that its generator refuses also goes back.
4. The config is uniform over all configs of `packSpace`. The script counts the configs of each option exactly, with big integers, and picks in proportion.
5. Each value of a discrete param counts as one config. A real param counts as one config, and its value is uniform on its scale.
6. A config goes back when `checkConfig` refuses it for the shapes of the input, or when the packer refuses its cell. The script then draws a new config.

- Step 6 is rejection sampling. Thus the draw is uniform over the configs that the input accepts.
- After 20 configs that go back, the script draws a new input. `sample.json` gives the rejection rates and their reasons.
- With `--draw option`, each top option (the base configs and each meta option) gets the same chance. The draw in each option stays uniform.

The relative knobs of roadmap item k118 (`--knobs relative`, the default):

1. Each knob takes one random number `u`. A value `u` below 1/3 gives the ratio 0. Each other value gives a ratio `r` from 0.01 to 0.5 on a log scale (`knobRatio`).
2. `resolveDraw` generates the input with the knobs at 0, and takes the median of the widths and the heights of its items (`medianSide`).
3. The knob is `r` times that median side, with 3 decimals, in the supported range of the dimension (0 to 32).

- An absolute knob also takes one random number. Thus a pair has the same family, params, seed and config with each scale. Only the knobs change.
- A record has the absolute values in `knobs`, so `bench/coverage.ts` generates the input again. A relative draw also adds `knobRatios`.
- `sample.json` gives the scale in `knobScale`. The pinned configs of the tests use `knobs: false`, so they do not change.
- The cause: an absolute margin of 30 on items of side 4 leaves no room for the items. Then the sample measures mostly overflow.
- Most configs of `packSpace` are portfolios with 5 members. Thus a uniform draw gives almost only portfolios. The option `option` gives the other meta options a chance.
- Pair `i` reads its own random stream of the seed. Thus the same seed gives the same pairs, and a larger `--n` keeps the first pairs.

The script packs each pair two times, to check that the output does not change, then times it with `--repeats` (1). It measures the pair like `bench run`.
Since k121, each warm-up pass and each timed pass also counts for `deterministic`.
It writes `records.jsonl` (`layout-record/1`, with the config and the input of each pair) and `sample.json` (the counts, the rejections and the hard breaks).

The pairs that are not deterministic (the count `nondeterministic` of `sample.json`):

- Only a config with the param `limitTime` set to `true` can give two different outputs. The clock of the time limit cuts a different member on each run.
- The k112 sample found one such pair. Since k121, the default draw gives no config with a clock limit ("The determinism gate").
- Since roadmap item k117, the param `limitWork` gives the work limit `budgetWork` (`docs/PACKER.md`, "The work budget"). It cuts at the same member on each run.
- The script draws `limitWork` and `budgetWork` like each other param. Each of the 4 values of `budgetWork` counts as one config.
- Thus 4 of 5 configs of a portfolio or of `restarts` have the work limit, and 1 of 2 configs have the time limit.
- The small list of `budgetWork` keeps the trend of the k112 coverage comparable. A list of 256 values gave the work limit to 256 of 257 configs.

The held-out test:

- The tree of each measure learns on all the records of the grid. The baseline is the median of the grid.
- The features of a sampled pair come from its config and its input, the same as the features of the grid. The grid has no knobs. Thus the tree ignores them.
- A new value of a numeric feature falls between the levels of the grid. Another new value goes to the side "no" of each split.
- A pair is a hit when its error is at the tolerance or below. `share` is the hits over the pairs with a finite value.

The Wilson interval:

- `wilson` gives the Wilson score 95% interval of the share, with `k` hits of `n` pairs and `z` 1.96.
- The interval stays from 0 to 1. It is correct for a share near 0 or near 1, and for a small `n`. A normal interval is not.
- 400 pairs give a half width of approximately 0.05 or less. No pair gives the interval from 0 to 1.

Why the two numbers differ:

- The grid number tests new specs of the corpus, but only with the named entries. The whole space tests new configs, new families and new param values.
- The grid number is a share of cells. The whole-space number is a share of pairs, and each pair has the same weight.
- Thus a high grid number with a low whole-space number tells that the records cover the bench, but not the space.

The job `merge` of `bench.yml` starts the sampler with the input `sample` (400). The value 0 turns it off. The sampler stops after 25 minutes with the pairs that it has.

The shards of a sample (k120):

```sh
node bench/sample-space.ts --out <folder>/s0 --n 400 --seed 1 --shard 0/4
node bench/sample-space.ts merge --out <folder>/sample <folder>/s0 <folder>/s1 <folder>/s2 <folder>/s3
```

- The option `--shard j/S` measures one contiguous block of the pairs 0 to `n - 1`. It does not go with `--pairs`.
- The blocks come from `shardInputs` of `bench/shard.ts`, the same blocks as the shards of a predicate dump.
- Each pair reads its own random stream. Thus the joined shards of a uniform draw are equal to the sample without shards.
- A stratified draw closes a stratum after its misses, so its shards can differ from one sample.
- The command `merge` fails on a missing shard, a shard that is present two times, a shard that the time limit stopped, or other options.
- Thus a merged sample has all its pairs. The 12-minute limit of one job cut a held-out sample at 125 of 400 pairs.

### The determinism gate (k121)

A pair that is not deterministic without a clock limit is a bug. Thus it fails the run.

- `hasClockLimit` of `bench/run.ts` tells if a config has a clock limit: `limitTime` `true` or a `budgetMs`, in the members too.
- A sampled record has the field `clock` with this value.
- `bench/main.ts run`, `bench/main.ts merge`, `sample-space.ts`, `active.ts` and `coverage.ts` write their files first.
- Then each one exits with the code 1 when a record without a clock limit is not deterministic. It shows the pairs that fail.
- `summary.md`, `sample.json` and `coverage.json` give two counts. `nondeterministic` counts all the pairs that are not deterministic.
- `nondeterministicClock` counts the pairs of `nondeterministic` with a clock limit. They do not fail the run.
- `coverage.json` has the section `determinism`: the counts of the grid, of the sample and of the active sample, and `passed`.

Why the clock limits are outside the coverage:

- A clock limit stops a search after a time. The output then depends on the speed and on the load of the computer.
- Thus a result with a clock limit measures the computer, not the algorithm. No model of the config and the input can predict it.
- The default sample draws from `clockFree` of `packSpace`: the param `limitTime` is always `false`.
- The stratified, uniform, option and active draws thus give 0 pairs with a clock limit. The 29 strata stay the same.
- `packSpace` keeps the clock limits. The option `--timing` of `sample-space.ts` draws them only on request.

The option `--timing`:

- `off` (the default) draws no clock limits.
- `stratum` adds the timing stratum `clock:1` after the 29 strata. It draws the configs of `portfolio`, `cell-portfolio` and `restarts` with `limitTime` `true`.
- `stratum` goes only with `--draw stratified`. The coverage does not read the pairs of `clock:1`, and `sampled.clockPairs` counts them.
- `mixed` draws from the whole space, as before k121. Pair `i` of a sample with `mixed` is pair `i` of the samples of k112 to k118.

The option `--pairs 16,20` measures only those pairs of the sample. Each pair reads its own random stream, so pair 16 is the pair 16 of the full sample.

The pair 16 of the k118 sample (run 40815224148) was not deterministic:

- Its config is `restarts` with `limitTime` `true`, `budgetMs` 2.61 and a work limit of 64000. The input is `ladder@1` with the seed 1019521697.
- With `limitTime` `false`, 10 packs give one hash. The test `bench/determinism.test.ts` pins it.
- With a clock limit of 1 to 6 ms, a local computer gave from 1 to 16 restarts, and two hashes in 40 packs. The CI computer is slower. These local counts show the cause only. They are not a time result.
- The portfolio of the k116 run with `budgetMs` 2.04 has the same cause.

The test `bench/shuffle.test.ts` packs each bench entry and 24 sampled configs on 3 inputs, 5 times each, in a shuffled order. Each pair gives one hash.

### The strata

A uniform draw gives almost only portfolios with 5 members. Thus its share tells little about the other families (k115).
A stratum is a strategy family with one size. `strataOf` and `stratumOf` of `bench/sample-space.ts` make the strata from the config.

- A base config has the family of its option of the stage `placement`, and the size 1. The 10 base families are `rows`, `skyline`, `shelf`, `maxrects`, `guillotine`, `push`, `bottom-left`, `best-fit`, `hole-degree` and `circle-quasi-physical`.
- A meta option of the stage `combine` is its own family. Its size is its count of members.
- `portfolio` has 2 to 5 members. Each count is one stratum, from `portfolio:2` to `portfolio:5`.
- `cell-portfolio` has a pool. Each value of its param `k` is one stratum: `cell-portfolio:cell`, `cell-portfolio:2` and `cell-portfolio:3`.
- `select` has 2 members. `aspect-fit`, `restarts`, `bbox`, `ruin-recreate`, `overlap-min`, `anneal`, `genetic`, `tabu`, `relax` and `force` have 1 member.
- Each one is one stratum. The family of their member does not count.
- Thus `packSpace` has 29 strata. The id of a stratum is `<family>:<size>`, for example `portfolio:3`.
- A new option of `placement` or `combine` gives new strata.

```sh
node bench/sample-space.ts --out <folder>/sample --n 400 --seed 1 --stratify
```

The stratified draw:

1. Pair `i` takes the stratum `i` modulo the count of the strata. Thus the counts of the strata differ by 1 or less, also after the time limit.
2. The config is uniform over the configs of its stratum. The draw of the input and the rejections stay as in the uniform draw.
3. A rejected config goes back, and the script draws a new config of the same stratum.
4. The same seed gives the same pairs. `--draw stratified` is the same as `--stratify`. The default draw stays `uniform`.
5. A pair tries 200 inputs and 20 configs for each input. A pair that finds no input and config is a miss of its stratum, not an error.
6. One miss closes the stratum (`MAX_STRATUM_MISSES` is 1). The later pairs of a closed stratum draw nothing and count as missed.

The cap keeps the cost of a stratum that no sampled input accepts to 200 inputs and 4000 configs.
For example, `hole-degree` and `circle-quasi-physical` pack only circles, and no corpus family gives circles. Thus `hole-degree:1` and `circle-quasi-physical:1` get no pairs.
A stratum that some inputs accept gets a miss only when 200 inputs in a sequence refuse it.

`sample.json` of a stratified sample has `draw: "stratified"` and the field `strata`.
Each stratum has the exact count of the configs (`configs`), the measured pairs (`pairs`) and the missed pairs (`missed`).

The script `coverage.ts --sample` adds the section `strata` next to the section `sampled`. The section `sampled` does not change.

- `stratumOf` gives the stratum of each pair from its config. Thus a uniform sample also gets strata, but most of them have few pairs.
- Each stratum gets its hits, its share and its Wilson 95% interval, with the errors of the section `sampled`.
- A stratum without pairs has the share `null` and the interval `null`, not 0. It is not in the mean.
- With the strata of `sample.json`, each stratum of the section also has its `configs` and its `missed` pairs.
- With the strata of `sample.json`, the section has only those strata. A stratum that the code added after the run gets no row.
- For example, the CI run `40805165103` came before `ruin-recreate:1` of k79. Thus its section has 18 strata.
- `equal` is the mean of the shares of the strata with pairs. Each stratum has the weight `1/k`.

The interval of the mean:

- For the variance, each stratum gets the adjusted share `p = (hits + z²/2) / (n + z²)` of Agresti and Coull, with `z` 1.96.
- The variance of the mean is the sum of `p (1 - p) / (n + z²)` over the strata, divided by `k²`. The standard error `se` is its square root.
- The interval is the mean of the shares (`equal.share`), plus and minus `z` standard errors, from 0 to 1. Thus `low <= share <= high` always.
- The adjustment gives a variance above 0 to a share of 0 or 1. It does not move the center of the interval.
- Before the fix of k115, the center was the mean of the adjusted shares. Each stratum added approximately `1.92 / (n + 3.84)` to it.
- Thus with 22 pairs for each stratum, the old interval of a small share started above the share.
- 400 pairs give 21 or 22 pairs for each stratum. The half width of the mean is then approximately 0.05 or less.

Why the two numbers differ:

- The uniform number weights each config the same. Thus it is approximately the share of `portfolio:5`.
- The mean over the strata weights each family and size the same. A low mean with a high uniform number tells that the grid misses the small families.

The input `stratify` of `bench.yml` (default `false`) adds `--stratify` to the sampler.

### The input features and the active draw (k116)

The first stratified run of k115 found that the sampled inputs are far from the corpus.
The median `pack.fill` of the 378 sampled pairs is 0.303. The median of the corpus records is 0.912.

Many sampled inputs have a fixed container that is too small for their items. Most of their items are then forced out.
Thus the share of `pack.fill` was 0.136 or less in each stratum. The cause is the inputs, not the configs.

#### The headline measure `pack.gapToBound`

Before k118, `pack.gap` was not a share. It was `result/bound − 1`, so it had no upper end. The section "The values of `pack.gap`" below gives the cause. Since k118 it is a share from 0 to 1.
The record measure `pack.gapToBound` of `bench/gap-to-bound.ts` is the headline measure of the coverage. It is from 0 to 1 in each region.

1. The placed items go into a free container without obstacles. `objectiveBound` of k51 gives the lower bound of their hull area.
2. The upper bound of the fill is the area of the placed boxes over that hull bound, at most 1.
3. The value is `1 − pack.fill / upper`, clipped to 0 and 1.

- A hull bound of 0, or no bound, gives the upper bound 1. Then the value is `1 − pack.fill`.
- A layout without a placed item has no value. The record does not have the measure.
- The bound counts the margins of the items and, since k118, the gap between the items (`hull.margin`).
- `pack()` and the other measures do not change. `pack.fill` stays a measure of the coverage.

#### The input features

The option `--features input` of `coverage.ts` gives the model features of each input, in place of the family and its params.
The default stays `--features family`. The pure function `inputFeatures` of `bench/input-features.ts` computes them.

| Feature | The value |
|---|---|
| `in.count` | The count of items |
| `in.locked` | The count of locked items |
| `in.fill` | The sum of the item areas over the container area, with 2 digits. A free container gives `-1`. |
| `in.side.max` | The largest item side over the fixed container side |
| `in.margin`, `in.gap` | The margin and the gap over the mean item side |
| `in.aspect.mean`, `in.aspect.spread`, `in.aspect.max` | The aspect ratios of the items |
| `in.area.cv` | The coefficient of variation of the item areas |
| `in.fixed`, `in.container` | The fixed sides and the shape of the container |
| `in.obstacles`, `in.items`, `in.turnable` | The obstacles, the shapes of the items and the turnable items |

- `in.fill`, `in.side.max`, `in.margin` and `in.gap` tell the forced overflow before a pack.
- The script regenerates each sampled input from its generator, its params, its seed and its knobs. It then checks the input hash.
- Each value is a text with 2 digits, so the tree splits on it as on the other features.

#### The forced-overflow split

`coverage.ts --sample` splits the share of each measure in two parts.
A pair is forced-overflow heavy when its `pack.overflow.forcedArea` is 0.5 or more (`FORCED_HEAVY`).
The field `forced` of the section `sampled` gives `heavy` and `rest`, each with its pairs, its hits, its share and its Wilson interval.
Each measure has the split, `pack.gapToBound` too.

#### The family prior

The section `sampled` gives two shares of each measure. The field `share` gives each pair the same weight, as the sampler draws them.
The field `prior` gives each generator family a weight. `bench/prior.ts` computes the weights.

- The weight of family `f` is `prior(f)`. Its pairs share it, so each pair has the weight `prior(f) / n(f)`.
- The share is `Σ prior(f) · share(f)`, divided by the weight of the families with pairs (`covered`).
- A sampler family without a weight gets the weight 0. The field `zero` gives the count of its pairs.
- The interval is the Wilson interval with the effective count of Kish, `(Σw)² / Σw²` (`nEff`).
- No pair of a family with a weight gives the share `null`.
- The field `families` gives each family with a weight: its weight, its pairs and its hits.
- The rounds of the active draw and the evaluation sample after each round also give the share with the prior.
- Their field `priorCount` gives `nEff`, `weighted` and `zero` of that share.

The effective count `nEff` tells the precision of the share. A share with the prior and `nEff` 30 is approximately as precise as a uniform share of 30 pairs.
The sampler draws each family with the same chance. A family with a large weight and few pairs thus makes `nEff` small.

##### The kinds of the prior (k122)

The prior is a parameter. The option `--prior` gives the kind, and `--prior-power` gives the power of `tempered`.

| Kind | The weight of a family |
|---|---|
| `family-flat` | The same weight for each sampler family, also a family with no inputs in the corpora. This is the default. |
| `union` | Its share of the distinct inputs of all the committed corpora. |
| `tempered` | Its count of `union` to a power from 0 to 1, then scaled. The default power is 0.5. The power 1 gives `union`. |
| `corpus` | Its share of the inputs of the grid manifest only. |

- The headline is `family-flat`. A realistic input means the families, not the count of the grids in the corpora.
- With another headline than `union`, each measure of `sampled` also has `priorBeside`: the share with `union` and its effective count.
- The field `strata` of the basis gives the `adversary` family apart. It has no weight, and the sampler does not draw it, so it has no share.
- `bench/paired-arms.ts` does not read the prior. Thus the fold verdict of the nightly control does not change.
- The headline changes the published prior share of the coverage. The uniform share and the grid numbers do not change.

##### The union of the corpora (k119)

The prior `union` uses all the committed corpora of `bench/corpora`.

1. Each corpus gives its inputs: each spec with each seed, or each input with its generator.
2. The union keeps each distinct input one time. Two inputs are the same when their family, params and seed are the same.
3. The key of a family is `<name>@<version>`, as the sampler counts its pairs. Thus `rect-grid@1` and `rect-grid@2` are 2 families.
4. `samplerFamilyOf` maps each corpus family to the sampler family with the same key. `PRIOR_ALIASES` gives the exceptions.
5. The weight of a family is its count of inputs over the inputs of all the sampler families.

- The order of the corpora does not change the weights.
- A sampler family without inputs in the corpora gets the weight 0. The field `absent` of the basis lists it.
- A corpus family that the sampler does not draw gives no weight. The field `unmapped` of the basis lists it.
- The inputs of `pack-adversary-v1` are searched worst cases, not draws of their origin family. Thus `adversary@1` is unmapped.

The field `prior` of `coverage.json` keeps the basis: its kind, its corpora, its inputs and the weight of each family. The job summary shows it too.

On 2026-10-29, the union has 12 corpora: `pack-adversary-v1`, `pack-anchor-v1`, `pack-classes-v1`, `pack-free-v1`, `pack-holdout-v1`, `pack-known-v1`, `pack-screen-v1`, `pack-select-v1`, `pack-select-v2`, `pack-strip-v1`, `pack-worst-v1` and `smoke-v1`.
They give 8316 distinct inputs. Each of the 20 sampler families has inputs, so no family has the weight 0.

| Family | Inputs | Weight |
|---|---|---|
| `rect-grid@1` | 4290 | 0.5159 |
| `rect-grid@2` | 2160 | 0.2597 |
| `berkey-wang@1` | 300 | 0.0361 |
| `hopper-turton@1` | 252 | 0.0303 |
| `perfect-cut@1` | 216 | 0.026 |
| `martello-vigo@1` | 200 | 0.0241 |
| `burke-kendall-whitwell@1` | 156 | 0.0188 |
| `beasley-gcut@1` | 120 | 0.0144 |
| The other 12 families | 622 | 0.0748 |

The grid families have 78% of the weight. Thus the pairs of `rect-grid` decide the share with the prior, and `nEff` stays small.

#### The active draw

The script `bench/active.ts` draws the pairs where the model knows least. It measures them in rounds.

```sh
node bench/active.ts --out <folder>/active --records <folder>/records.jsonl --corpus <folder>/corpus.json --n 400 --seed 1 --features input
```

1. The script draws a pool of `20 × n` candidate pairs (`--pool 20`). Candidate `c` is in the stratum `c mod S`, with the `S` strata of `strataOf`. Thus the strata of the pool are equal, as in k115.
2. The script checks each candidate with `checkConfig` and does not pack it. `maxOverlapMoves` of k80 also caps the moves of `overlap-min` in the pool.
3. Each round fits 5 trees of the folds by spec for each measure. The rows are the grid and the measured active pairs.
4. The score of a candidate is the mean over the measures of its scaled fold spread (`--score spread-iqr`, the default).
5. The round packs the candidates from the highest score down, with the diversity rule below. A tie goes to the lower candidate index.
6. Each round has `floor(n·k/R) − floor(n·(k−1)/R)` pairs, with `R` rounds (`--rounds 4`).
7. After a round, its measured pairs join the rows. The next round then fits the trees again.

The score `spread-iqr` of one measure is the standard deviation of the 5 predictions over the scale of the measure, at most 3 (`SCORE_CAP`).

- The scale is the interquartile range of the values of the measure in the rows, or the tolerance when the range is smaller.
- Thus a measure with a wide range, as `pack.gap`, does not decide the score alone.
- The cap stops one measure with very large values. Thus the other measures also count.
- `--score fold-spread` gives the score of the first version: the spread over the tolerance, without a cap.

The diversity rule of a round:

- A stratum gets at most `ceil(quota / S)` pairs in one round. Since k80, `packSpace` has 20 strata.
- A candidate with the stratum and the generator of an earlier pick of the round waits.
- When only these candidates are left, the rules give way. Thus each round gets its quota.

Why the fold spread:

- The trees of the folds disagree where the rows do not decide the value. There, the held-out error is large.
- The spread needs no measured value of the candidate. Thus the script scores 8000 candidates without a pack.
- The score uses `pack.gapToBound`, `pack.fill`, `pack.gap` and `pack.overflow.excessArea`. It does not use `ms`, because a time is different at each measurement.

The same seed, the same grid and the same pool give the same pairs. Each candidate has its own random stream `candidate-<c>`.

The control arm (k120, `--arm control`):

- The control arm draws the same pool, with the same quotas, the same caps and the same `nextPick`.
- Each round takes the candidates in a seeded random order (`controlOrder`) in place of the score order. Thus the arm tells what the score adds.
- The order is a Fisher and Yates shuffle with the stream `control-round-<k>` of the seed, from `random` of `@mark1russell7/rigor-generators`.
- The trees of the control arm learn only on the grid and on the pairs of the control arm. The records keep the score of this model.
- `sample.json` has `active.arm` with the value `control`. The active arm has no field, so its files stay the same as before k120.

The fold seeds (k120, `--fold-seed <r>`):

- The fold seed sets the folds of the score and the stream of the control order. The pool reads only `--seed`.
- Thus the fold seeds of one `--seed` give repeats of one draw with other models. The pool and the evaluation sample stay the same.
- Without `--fold-seed`, the score uses the seed of the coverage (1), and the control order uses `--seed`. The files stay the same as before.
- `sample.json` has `active.foldSeed` only when the option is present.

The paired test of the two arms (k120, `coverage.ts --active <dir> --control <dir> --sample <dir>`):

- Each arm gives one model: the grid and all the pairs of the arm. Both models predict the pairs of `--sample`.
- For each pair, d is the hit of the active model minus the hit of the control model.
- The test of a measure is the exact McNemar test: the two-sided `signTest` of the pairs where only one model hits.
- `holm` corrects the p of the measures at the level 0.05. A measure with `reject` has a change.
- The section `paired` also gives mean(d) with a 95% bootstrap interval (10 000 samples, the seed `k120-paired-<measure>`).
- The module `bench/paired-arms.ts` uses only `@mark1russell7/rigor-statistics`. It has no verdict logic of its own.

The result over the fold seeds (k120, `node bench/paired-arms.ts --out <file> <coverage.json> ...`):

- The command reads the section `paired` of the coverage summary of each fold seed. It needs 5 summaries or more.
- For each measure, `noiseVerdict` of rigor-statistics gives `floor`: the larger of 2 sample SD of the mean(d) and `PAIRED_MARGIN`.
- The margin is 0.05: 1 more prediction in 20 within the tolerance. A smaller gain does not pay for the per-round model fits of the active arm.
- The outcome is `gain` or `loss` only when the mean of the mean(d) is more than `floor` from 0. Otherwise it is `noise`.
- When each seed gives the same mean(d), the outcome is `no-spread`: the seeds pick the same pairs, so the seeds test nothing.
- `rejects` gives the count of the seeds where the Holm correction finds a change.

The nightly control (k120, `coverage-nightly.yml`):

The first valid result of the control (k120):

Run [41769257557](https://github.com/mark1russell7/packing/actions/runs/41769257557) has 5 of 5 valid cells, and each held-out sample has 400 of 400 pairs. A push of commit `92d441a` started it, not the Monday schedule. A positive value tells that the active arm is better than the control.

| Measure | mean(d) over the seeds | Floor | Seeds with a Holm change | Outcome |
| --- | --- | --- | --- | --- |
| `pack.gap` | 0.0506 | 0.05 | 1 of 5 | `gain` |
| `pack.gapToBound` | -0.0297 | 0.05 | 0 of 5 | `noise` |
| `pack.fill` | -0.014 | 0.05 | 0 of 5 | `noise` |
| `pack.overflow.excessArea` | -0.0225 | 0.0704 | 1 of 5 | `noise` |
| `ms` | -0.0525 | 0.2056 | 3 of 5 | `noise` |

- The active draw beats the control on 1 measure of 5, by 0.0006 over the floor.
- All 5 seeds of `pack.gap` are positive, but only 1 seed has a Holm change.
- Do not read this as a general gain of the active draw. The 4 other measures show no gain.
- The Monday run repeats the test with the same seeds and new code.

- A push does not start the workflow. The grid takes approximately 3 hours, and a start from a merge does not pass the check of the free CI slots.
- Thus a change of `src`, or of a file of the draw or the verdict, shows in the next Monday run, not at once. To read it earlier, start the workflow by hand.
- A cancelled run writes no `cells.json`, so the records show only the runs that finished. A weekly run and a manual run have different groups, so one does not hold the other.
- A person can also start the workflow, with other inputs.
- It also starts each Monday at 02:52 UTC as the control. The same seeds and the same code give the same result.
- Each arm has a work budget of 4 rounds of 100 pairs, the same for both arms. Thus a cell is the same on each runner.
- The 40 minutes of `--max-minutes` are only a timeout. An arm that the timeout stops, or an arm with no summary, voids its cell.
- The first timeout was 12 minutes. In run [41735018676](https://github.com/mark1russell7/packing/actions/runs/41735018676), it stopped 4 of the 5 control arms, at 382, 219, 195 and 196 of 400 pairs. Only 1 of 5 cells stayed, so the run has no verdict.
- The new timeout comes from that run. The slowest arm gives 12 x 400 / 195 = 24.6 minutes, and the arm that finished took approximately 10 minutes. The limit is 24.6 + 14.6 = 39.2, so 40. This is an estimate from arms that the timeout stopped, because the run has no finished slow arm. A later run replaces it.
- `bench/nightly-plan.ts cells` writes the record `cells.json`: the commit, the event, each cell and the seeds of the cells that are not void.
- The job `grid` packs the corpus `pack-classes-v1` with `bench.yml` (by `workflow_call`) and no sample.
- The grid has the wall budget of each pair and a job limit of 130 minutes, so the pairs stop at 120 minutes. A slow entry keeps the rows that it finished. In run [41949891960](https://github.com/mark1russell7/packing/actions/runs/41949891960), the limit of 120 minutes cut `raster-nofit` with no row, and `near-rects` took 42 minutes. Both are over the earlier limit of 30 minutes, and a cut job fails the grid, so the arms do not start.
- The jobs `sample` pack the held-out sample of 400 pairs in 4 shards, with no time limit. The job `held-out` joins them.
- The merge fails on a missing pair. Thus each arm is tested on all the pairs of the sample.
- Each job `arm` draws one arm (active or control) with one fold seed (1 to 5) on the same grid and pool.
- The job `verdict` gives the paired test of each cell that is not void, then the result over the fold seeds, in the artifact `nightly-verdict`.
- The predictions `packing-k120-nightly` and `packing-k161-weekly-budget` tell the expected outcomes. A change of the inputs needs a new prediction first.

`coverage.ts --active <dir>` adds the section `active`. It has the features, the score, the pool and one entry for each round.

- The round 1 pairs are tested against the grid model. A later round is tested against the grid and the earlier rounds.
- Each round gives its pairs, the hits, the share with its Wilson interval and the MAE.
- With `--sample`, each round also gives the share of the sample after the round. The start gives the share of the grid only.
- The pairs of a round are not a uniform sample. Thus the share of a round is not the coverage of the whole space.

#### The values of `pack.gap`

In the 378 pairs of the first stratified run, 335 pairs have a `pack.gap`. 177 of them are above 1, and the largest is 4100.
In the corpus records, the largest `pack.gap` is 2.9.

| Bound kind | Pairs | Above 1 | Median | Largest |
|---|---|---|---|---|
| `placed.free` | 112 | 87 | 5.1 | 4100 |
| `strip.margin` | 135 | 62 | 0.78 | 30 |
| `hull.margin` | 64 | 21 | 0.55 | 31 |
| `strip.tallest` | 21 | 7 | - | 12 |

The values are correct for the bounds, but the bounds are loose. They are not a defect of the measure.

- `placed.free` is `1 − forcedArea / total`. `overflowBound` of `src/overflow.ts` does not count the margins and the gap.
- With a large margin, few items go in, so the bound over a small placed share gives a very large gap.
- All 87 pairs have a footprint with the margins and the gap larger than the container. Only 22 have an item area larger than the container.
- `strip.margin` and `hull.margin` count the margins but not the gap.
- The sampler draws the margin and the gap up to approximately 32, for each item size. Thus the gap is large next to small items.

A tighter `overflowBound` with the margins and the gap is a change of k51. This item does not change the bound. Roadmap item k118 makes that change.

##### The change of k118

- `overflowBound`, `freeAreaBound`, `strip.margin` and `hull.margin` count the margins and the gap. `docs/PACKER.md` (decision 3) gives the proofs.
- `pack.gap` is the share `boundShare`: `1 - bound / result`, or `1 - result / bound` for an upper bound. It is at most 1 by its definition, and 0 or more when the bound is sound.
- The sampler draws the knobs relative to the median side of the items. `--knobs absolute` keeps the draw of k112.

A local run of 57 stratified pairs (seed 1, 60 pairs asked) gives these values. The first table is the ratio of before k118, with the absolute knobs.

| Bound kind | Pairs | Ratio above 1 | Ratio median | Ratio largest |
|---|---|---|---|---|
| `placed.free` | 19 | 15 | 3.43 | 827 |
| `strip.margin` | 25 | 10 | 0.55 | 30 |
| `hull.margin` | 6 | 2 | 0.64 | 18 |
| `strip.tallest` | 2 | 1 | 1.57 | 3.1 |
| `hull.extent` | 1 | 0 | 0 | 0 |

The same pairs after k118, with the absolute knobs. Each share is from 0 to 1. The ratio is `s / (1 - s)` of the new, tighter bound.

| Bound kind | Pairs | Share above 1 | Share median | Share largest | Ratio above 1 |
|---|---|---|---|---|---|
| `placed.free` | 22 | 0 | 0.49 | 1 | 11 |
| `strip.margin` | 25 | 0 | 0.13 | 0.97 | 5 |
| `hull.margin` | 6 | 0 | 0.33 | 0.95 | 1 |
| `strip.tallest` | 2 | 0 | 0.38 | 0.76 | 1 |
| `hull.extent` | 1 | 0 | 0 | 0 | 0 |

The same pairs with the relative knobs:

| Bound kind | Pairs | Share above 1 | Share median | Share largest | Ratio above 1 |
|---|---|---|---|---|---|
| `placed.free` | 22 | 0 | 0.27 | 0.95 | 5 |
| `strip.margin` | 23 | 0 | 0.21 | 0.97 | 7 |
| `hull.margin` | 6 | 0 | 0.27 | 0.95 | 1 |
| `strip.tallest` | 2 | 0 | 0.62 | 0.72 | 2 |
| `strip.area` | 2 | 0 | 0.55 | 0.59 | 2 |
| `hull.extent` | 1 | 0 | 0 | 0 | 0 |

- No pair has a share below 0. Thus no bound is above its result.
- 3 pairs of `placed.free` had no ratio before k118: the layout placed no item area, and the ratio was `Infinity`. Their share is 1.
- The bound is tighter on 49 of the 53 pairs with a value before and after. The ratios above 1 go from 28 to 17 of these 53 pairs.
- The large ratios that stay come from loose bounds, not from the measure.
- The times of a local run do not count. The run of `bench.yml` with 400 pairs gives the values of record.

#### The inputs of `bench.yml`

- The input `draw` is `uniform` (the default), `option`, `stratified` or `active`.
- `stratify` true with `draw` `uniform` gives `stratified`, as in k115. `stratify` true with `draw` `option` fails.
- With `draw` `active`, the sampler measures the sample first, uniform or stratified, for 12 minutes. Then `active.ts` measures the rounds for 12 minutes.
- The input `features` is `family` (the default) or `input`. It goes to `coverage.ts` and `active.ts`.
- The input `timing` (k121) is `off` (the default), `stratum` or `mixed`. It goes to `sample-space.ts`. The draw `active` takes only `off`.
- The input `pairs` (k121) is a list of pair indexes, for example `16` or `16,20`. The sampler then measures only those pairs, each one `repeats` times.
- To measure pair 16 of the k118 sample again, use `draw` `stratified`, `timing` `mixed`, `pairs` `16` and `repeats` `10`.

#### The weekly trend (a hypothesis)

The hypothesis: with `draw` `active`, the share of the sample after the last round rises from week to week.

- Each week adds the measured active pairs of the region where the model fails. The grid of the corpus does not change.
- The test: the share "sample after" of the last round is above the share of the grid only, and the gap does not shrink over 4 weeks.
- A share after the rounds that stays at the start tells that the model features do not separate the region. Then the features change, not the draw.

#### The first CI run

The run 40810883047 (2026-10-29) used `pack-classes-v1`, `sample` 400, `draw` `active` and `features` `input`.

- The uniform sample measured 125 of the 400 requested pairs in its 12 minutes. These pairs are the evaluation set.
- The active rounds measured 400 pairs: 4 rounds of 100, from a pool of 7611 candidates. Each round used 14 to 16 generators.
- The active pairs had 0 hard breaks, and each was deterministic. The uniform sample had 1 pair that was not deterministic.

The table gives the share of the evaluation pairs within tolerance, with uniform weights, after each round.

| Measure | Grid only | Round 1 | Round 2 | Round 3 | Round 4 |
|---|---|---|---|---|---|
| `pack.gapToBound` (118 pairs) | 0.068 | 0.119 | 0.110 | 0.119 | 0.153 |
| `pack.fill` (125 pairs) | 0.016 | 0.088 | 0.112 | 0.136 | 0.184 |

- The share of `pack.gapToBound` goes from 0.068 to 0.153. The rise is not the same in each round.
- The family prior is thin: 9 of the 118 pairs have a weight, and the effective count is 2.6. k119 widens the prior.
- The run has no uniform draw of the same size. Thus it does not tell if the active draw is better than a uniform draw.

### The site

The section `#coverage` of the results page reads `packages/site/data/coverage.json`. The command `snapshot.ts coverage` computes the coverage two times.

- The large numbers come from the folds by spec, the stricter test.
- The small numbers "by input" come from the folds by input.
- Each tile shows the number "bench grid" and the number "whole space (sampled)" with its 95% interval.
- Under the number of the whole space, the tile shows the number "family prior", with its effective pairs and its pairs of the weight 0.
- The note under the tiles gives the corpora of the prior and the weight of each family (k119).
- The command `snapshot.ts coverage` reads the folder `sample` of the run, or `--sample <dir>`. Without a sample, the tile shows "not measured yet".
- The number "whole space (sampled)" always comes from the last uniform sample. The note under the tiles gives its run and its date.
- With strata, each tile also shows the number "equal weight over strata" with its 95% interval, under the uniform number.
- A stratified sample also gives the number "pooled over strata": the share of all its pairs. It is not a uniform share.
- The chart "The whole space by stratum" shows the share of each stratum of the selected measure, with its interval and the mean.
- A stratum without pairs shows "no pairs" and its count of configs, and no share. It is not in the mean.
- An old snapshot without strata stays readable. The chart then shows a note.
- The line under the strata gives the forced-overflow split of the selected measure (k116).
- The table "The active rounds" shows, for each round, the share of the new pairs and the share of the sample after the round. The first row is the grid only.
- The command `snapshot.ts coverage` reads the folder `active` of the run, or `--active <dir>`. Without it, the table shows a note.
- The error bars show the mean error and the median error of the model against the baseline.

## The row legalizer

`bench/legalize.ts` compares three arms on the chains of `change-walk` (roadmap item k82). The counts are 20 and 60, the steps are 1 to 5, and the seeds are 1 to 10. Each arm starts from `rows` on step 0.

- `fresh` packs each step again with `rows`.
- `legalizeRows` starts each step from the layout of the step before it.
- `Tetris` is the same code with `placeRow: false`.

A value of this table is the mean of the 100 chains of a kind. `moved` and `distance` come from `pack.stability.*`. The height is the height at step 5.

| Arm | Edit | `moved` | `distance` | Height |
| --- | --- | --- | --- | --- |
| `fresh` | add | 0.404 | 0.0641 | 137.7 |
| `fresh` | remove | 0.451 | 0.0694 | 112.6 |
| `fresh` | resize | 0.561 | 0.0804 | 125.5 |
| `fresh` | reorder | 0.031 | 0.0029 | 126.7 |
| `legalizeRows` | add | 0.249 | 0.0137 | 170.7 |
| `legalizeRows` | remove | 0 | 0 | 125.6 |
| `legalizeRows` | resize | 0.129 | 0.0030 | 150.5 |
| `legalizeRows` | reorder | 0 | 0 | 126.7 |
| `Tetris` | add | 0.242 | 0.0142 | 232.6 |
| `Tetris` | remove | 0 | 0 | 125.6 |
| `Tetris` | resize | 0.104 | 0.0031 | 159.2 |
| `Tetris` | reorder | 0 | 0 | 126.7 |

- Over add, remove and resize, `legalizeRows` moves 0.267 of the share of `fresh`.
- All 400 steps have 0 breaks and no overflow.
- `placeRow` gives 0.963 of the distance of `Tetris`. The paper reports 0.68 on circuits, and that claim does not transfer here. The main gain of `placeRow` here is the height after add: 170.7 against 232.6.
- The mean height over the four edits is 1.142 times the height of `fresh`. Add is the largest cost: 1.240 times `fresh`.

These values are from one bench on made-up chains, and they have no interval. `pack.time.ms` is not a part of this bench.

## The Sleator strip

`bench/sleator.ts` measures `sleatorStrip` of roadmap item k52. A height is not a time, so any computer can start it. The prediction is `packing-k52-sleator`.

```bash
node bench/sleator.ts --out <file.json> [--seeds 30] [--counts 20,100,500]
```

The strip has a width of 200. Each family has made-up items with a height from 1 to 100. The widths of `narrow` go from 1 to 50, of `mixed` from 1 to 200, and of `wide` from 67 to 200.

| Family | Items | Mean height over the larger of area / width and the tallest item | Mean height over `maxrects-bl` | Share where `maxrects-bl` is lower or equal |
| --- | --- | --- | --- | --- |
| narrow | 20 | 1.301 | 1.097 | 93.3 % |
| narrow | 100 | 1.200 | 1.123 | 100 % |
| narrow | 500 | 1.192 | 1.162 | 100 % |
| mixed | 20 | 1.353 | 1.112 | 96.7 % |
| mixed | 100 | 1.349 | 1.190 | 100 % |
| mixed | 500 | 1.329 | 1.231 | 100 % |
| wide | 20 | 1.350 | 1.064 | 100 % |
| wide | 100 | 1.322 | 1.088 | 100 % |
| wide | 500 | 1.312 | 1.116 | 100 % |

Over the 270 inputs, the mean height over the larger bound is 1.301, and `maxrects-bl` is lower or equal on 98.9 %. The hard rules have 0 breaks. The first column uses a lower bound, not the optimum, so it is above the true ratio.

## Side anchors

`bench/side-anchors.ts` measures `packSideAnchors` of roadmap item `k110`. A height is not a time, so any computer can start it. The prediction is `packing-k110-side-anchors`.

```bash
node bench/side-anchors.ts --out <file.json> [--seeds 30] [--count 40] [--anchors 4]
```

The family has 40 made-up rectangles on a strip of width 200, with 4 anchors on random sides. The member is `maxrects` with the rule `bl`. The stream draws again when two anchors overlap at each height.

| Measure, 30 seeds | Value |
| --- | --- |
| Mean height over the height with no anchors | 2.01 |
| Median of that ratio | 1.09 |
| Worst of that ratio | 9.55 |
| Seeds where the anchors alone force more height | 15 |
| Mean height over the larger of the plain and the forced height | 1.02 |
| Worst of that ratio | 1.09 |
| Median packs for one call | 11 |
| Most packs for one call | 17 |
| Breaks of the hard rules and of `anchor-kept` | 0 |

The mean is high because of the input, not the search. A fraction and an offset on one side overlap over a range of heights, and the layout must go past that range.

The plain band is shorter on 12 seeds, but each of those 12 layouts has an overlap of its anchors. The search is shorter on all 18 other seeds. This family has random anchors, so it says little about a designed layout.

## Groups as near rectangles

The workflow `Near rects` measures `packNearRects` of roadmap item `k97`. It has the inputs `seeds` (default 30) and `count` (default 40). The artifact `near-rects` has `near-rects.json`.

- The made-up family is `raster-k92`. Each input has stars, boxes and circles. The arms are `bbox`, `near-rects` and `raster-nofit` at 64 trials.
- The public instances are the 12 sets of the workflow `Raster no-fit`. The arms are `bbox` and `near-rects`.
- The cell is the finest cell of the bench of `k92`: the mean box side over 32, and the strip width over 160.
- The density is `densityOf`, and `crossingPairs` audits each output with no grid.
- The time of the pair search is the median over 5 inputs of 100 items, in one CI process.

The file holds a paired comparison for each pair of arms, with a two-sided sign test. The prediction is `packing-k97-near-rects`.

## The evolved place score

The workflow `GP score` (`.github/workflows/gp-score.yml`, roadmap item k83) searches for a place score of `maxrects` with genetic programming. It has no gate.

- A score is a tree of `+`, `-`, `*`, a protected `/`, `min` and `max`. Its leaves are the box, the leftovers, the place and the top of the layout, as shares of the width.
- The first population has the fixed rules as trees. The rule `cp` has no tree.
- The search reads generated strips from the specs of `pack-strip-v1`, with seeds that the corpus does not hold. The search reads inputs of 200 items or fewer.
- Each search has its own seed. Seeds that the search did not read choose one tree.
- The program then reads the 264 free-height inputs of `pack-strip-v1`. No choice comes from them, and `--skip-held-out` keeps them out of a smoke test.

The report gives the mean height over the objective bound, the gain over the best fixed rule, and a two-sided sign test. The numbers are in the artifact `gp-score`.

The score tree stays in `bench/gp-score.ts`, and `packMaxRects` reads only a function. No strategy gives the option `score`, and no default uses it.

## The binary search on the height

The workflow `Binary height` (`.github/workflows/binary-height.yml`, roadmap item k81) has the input families of the exact bench. It has no gate.

- At 6, 8 and 10 items, it counts the cases where `packBinaryHeight` meets a height that `exactStrip` proves. A case at the node limit does not count.
- At 20, 50 and 100 items, it gives each height as a ratio to the area bound, for each family and over all families.
- Each line has the wins and the losses of the search against that method, with a two-sided sign test.
- The line `first-layout` shows the height before the search.

The inputs are `seeds` and `trials`. The numbers are in the artifact `binary-height`.

## Circles in a circle against the literature

Roadmap item k94 compares the strategy `circle-quasi-physical` with the best-known packings. The comparison has its own script and its own workflow, because the corpora of the benchmark have only rectangles.

```sh
gh workflow run circles.yml -R mark1russell7/packing --ref main -f sizes=10,20,30,50,100 -f seeds=5 -f iterations=2000
```

The workflow `circles.yml` does these steps:

1. It fetches the two tables of Packomania. The repository and the package do not keep them, because the site states no license.
2. It starts `bench/circles.ts`, which packs each case with seeds 1 to `seeds`, two times for each seed.
3. It writes the table of the gaps and the hash of each table to the job summary.
4. It keeps `records.json` and `summary.md` as the artifact `circles-<sha>`.

| Family | Radii | Table |
|---|---|---|
| `equal` | `r_i = 1` | <https://www.packomania.com/cci/txt/ratio.txt> |
| `unit` | `r_i = i` | <https://www.packomania.com/ccin/txt/ratio.txt> |

A record has the radius, the gap to the table in percent, the density, the time, the counts of the moves and the exact checks. The checks read the geometry of the input at the tolerance `1e-9`.
The job fails only on an exact break: an overlap, a circle outside or two different outputs of one seed. A gap does not fail the job.

The values of the tables on 2026-11-03, for the default cases, are:

| `n` | `equal` | `unit` |
|---|---|---|
| 10 | 3.8130256313981 | 22.0001930127 |
| 20 | 5.1223207369915 | 58.4005674790 |
| 30 | 6.1977410708792 | 104.5403637652 |
| 50 | 7.9475152747835 | 220.5654002624 |
| 100 | 11.0821497243104 | 615.8160668874 |

- The tables change when a better packing arrives. Thus the job reads the current table, and the hash in the summary tells which one it was.
- The table of Grosso 2010 is not here. The paper is behind a paywall, so its values are not verified. The table of Packomania has the later records.
- The baseline is `hole-degree` in its smallest square, from a search by halving. Its container is a square and the other one is a circle, so only the density compares them.
- The front chain of Wang 2006 (roadmap item k93) is not built. Thus the comparison has no row for it.
- The constants of the moves came from short local packs of the same two families, seeds 1 to 3. Thus a gap of these families is not a held-out measure.
- The time of a move is a CI measure. A local time is not a record.

## The standalone strategies

Roadmap item k141 adds 14 entries to `ENTRIES`: `STANDALONE_ENTRIES` of `bench/entries.ts`. `docs/PACKER.md` tells the strategies.

- Each entry supports fewer cells than the older entries. A run records a skip for each other cell. On `smoke-v1`, `exact-strip` has no measured input: 11 inputs are outside its cells, and it refuses 2. The other entries have 1 to 11 measured inputs of 13.
- The entries are in `packSpace` since roadmap item k142. Each entry has a named config. `bench/pack-space.test.ts` compares its output with the entry on inputs that it accepts.
- Roadmap item k142 adds 9 strata to the sampler, 38 in all. The strata `exact-strip:1` and `treemap:1` accept few inputs, so a short sample misses them.
- The entries are not members of the adversary or of the portfolio tools, because they do not support each cell.

## The rank window

`bench/window.ts` measures the curve of the idea `new-rank-window` of roadmap item k31. A height and an order are not a time, so any computer can start it. The prediction is `packing-k31-rank-window`.

```bash
node bench/window.ts --out <file.json> [--seeds 30] [--count 100] [--windows 1,2,3,4,6,8,12,16,32,100]
```

The inputs are made-up strips of width 200 with 100 items and 30 seeds. The rank of an item is its input place. The pack is `maxrects` with the rule `bl` and the option `sortOrder: "input"`. The gain is the share of the height gain from window 1 to window 100.

| Window | Mean height | Gain | `pack.order.inversions` |
| --- | --- | --- | --- |
| 1 | 888.9 | 0.00 | 0.177 |
| 2 | 887.1 | 0.02 | 0.177 |
| 3 | 885.7 | 0.04 | 0.181 |
| 4 | 884.5 | 0.06 | 0.183 |
| 6 | 881.9 | 0.09 | 0.192 |
| 8 | 877.3 | 0.15 | 0.197 |
| 12 | 874.3 | 0.19 | 0.230 |
| 16 | 860.3 | 0.38 | 0.251 |
| 32 | 831.1 | 0.76 | 0.360 |
| 100 | 813.3 | 1.00 | 0.503 |

- The curve has no knee at a small window. Half of the gain comes only between window 16 and window 32.
- The mean height falls at each listed window. The hard rules have 0 breaks.
- Window 1 has inversions of 0.177, because `maxrects` can put a box above an earlier box.
- The count of 100 items sets the scale of the windows. This run does not measure a window as a share of the count.

## Repack and match

`bench/match.ts` compares `matchPlaces` of roadmap item k31 with a fresh pack, and with `pinUnchanged` and `compactUp`, on the chains of `bench/pin.ts`. A height and a movement are not a time, so any computer can start it. The prediction is `packing-k31-move-matching`.

```bash
node bench/match.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]
```

The family `cards` rounds each size up to steps of 20 and 25, so it has 12 sizes. The family `free` has no step. The hard rules have 0 breaks, and each item has a place.

| Family | Entry | Method | Moved | Distance | Cost, step 10 |
| --- | --- | --- | --- | --- | --- |
| `cards` | `maxrects-bl` | fresh | 0.712 | 0.323 | 1 |
| `cards` | `maxrects-bl` | match | 0.591 | 0.250 | 1 |
| `cards` | `maxrects-bl` | pin and compaction | 0.067 | 0.033 | 1.119 |
| `cards` | `skyline` | fresh | 0.715 | 0.300 | 1 |
| `cards` | `skyline` | match | 0.598 | 0.227 | 1 |
| `cards` | `skyline` | pin and compaction | 0.136 | 0.065 | 1.213 |
| `cards` | `rows` | fresh | 0.679 | 0.325 | 1 |
| `cards` | `rows` | match | 0.554 | 0.261 | 1 |
| `cards` | `rows` | pin and compaction | 0.072 | 0.038 | 1.149 |
| `free` | `maxrects-bl` | fresh | 0.757 | 0.355 | 1 |
| `free` | `maxrects-bl` | match | 0.756 | 0.354 | 1 |
| `free` | `skyline` | fresh | 0.808 | 0.333 | 1 |
| `free` | `skyline` | match | 0.808 | 0.333 | 1 |
| `free` | `rows` | fresh | 0.751 | 0.297 | 1 |
| `free` | `rows` | match | 0.750 | 0.296 | 1 |

- The match has the height of a fresh pack at each step, on each entry and family.
- On `cards`, the match moves 16 to 18 % fewer boxes and gives 20 to 24 % less distance. The prediction asked for 20 % fewer boxes and half the distance, so both claims failed.
- On `free`, the match gives no gain. Almost each size has one box.
- Pin and compaction moves far fewer boxes, and it costs 12 to 21 % of height at step 10. The match is the choice when the height cannot rise.
- The 100 items share 12 sizes, so a class has approximately 8 boxes. This run does not measure other class sizes.

## The kept prefix

`bench/prefix.ts` compares `keepPrefix` of roadmap item k30 with a fresh pack, and with `pinUnchanged` and `compactUp`, on the chains of `bench/pin.ts`. A height and a movement are not a time, so any computer can start it. The prediction is `packing-k30-keep-prefix`.

```bash
node bench/prefix.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]
```

The column Pinned is the share of the items that `keepPrefix` pins. The hard rules have 0 breaks, and each item has a place.

| Entry | Method | Moved | Distance | Cost, step 1 | Cost, step 10 | Worst cost | Pinned |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `maxrects-bl` | fresh | 0.757 | 0.355 | 1 | 1 | 1 | |
| `maxrects-bl` | pin and compaction | 0.146 | 0.028 | 1.071 | 1.192 | 1.290 | |
| `maxrects-bl` | prefix | 0.571 | 0.331 | 1.033 | 1.040 | 1.172 | 0.252 |
| `skyline` | fresh | 0.808 | 0.333 | 1 | 1 | 1 | |
| `skyline` | pin and compaction | 0.221 | 0.052 | 1.080 | 1.229 | 1.383 | |
| `skyline` | prefix | 0.727 | 1.872 | 1.529 | 2.020 | 4.195 | 0.252 |
| `rows` | fresh | 0.751 | 0.297 | 1 | 1 | 1 | |
| `rows` | pin and compaction | 0.223 | 0.032 | 1.053 | 1.219 | 1.329 | |
| `rows` | prefix | 0.651 | 0.594 | 1.304 | 1.281 | 1.876 | 0.252 |

- The prediction asked for at most 0.8 of the fresh movement and a lower cost at step 10 than pin and compaction, on each entry. Only `maxrects-bl` holds both. `skyline` and `rows` fail both.
- On `maxrects-bl`, the prefix costs 4 % of height at step 10, and pin and compaction costs 19 %. The prefix moves 3.9 times as many boxes.
- `skyline` starts at the bottom edge of each locked box, across its width. Thus a low box of the prefix pushes the suffix below it. Its distance of 1.872 widths is more than 5 times the fresh distance.
- The first change comes after approximately a quarter of the list, because 5 edits take random places. A change near the end of the list keeps more boxes, and this run does not measure that case.

## The orthogonal order

`bench/orthogonal.ts` compares `keepOrthogonal` of roadmap item k29 with a fresh pack, and with `pinUnchanged` and `compactUp`, on the chains of `bench/pin.ts`. A height and a movement are not a time, so any computer can start it. The prediction is `packing-k29-orthogonal`.

```bash
node bench/orthogonal.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]
```

The column Flips is the share of the ordered pairs of staying boxes that change their strict order on `x` or `y`, over each step. The column Pinned is the share of the staying boxes that `keepOrthogonal` pins. The hard rules have 0 breaks.

| Entry | Method | Moved | Distance | Flips | Cost, step 1 | Cost, step 10 | Worst cost | Pinned |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `maxrects-bl` | fresh | 0.757 | 0.355 | 0.190 | 1 | 1 | 1 | |
| `maxrects-bl` | pin and compaction | 0.146 | 0.028 | 0.008 | 1.071 | 1.192 | 1.290 | |
| `maxrects-bl` | orthogonal | 0.437 | 0.070 | 0.016 | 1.074 | 1.278 | 1.422 | 0.966 |
| `skyline` | fresh | 0.808 | 0.333 | 0.178 | 1 | 1 | 1 | |
| `skyline` | pin and compaction | 0.221 | 0.052 | 0.011 | 1.080 | 1.229 | 1.383 | |
| `skyline` | orthogonal | 0.540 | 0.115 | 0.020 | 1.110 | 1.398 | 1.607 | 0.972 |

- `keepOrthogonal` loses to pin and compaction on each column. The prediction asked for fewer flips, a lower cost at step 10 and a movement of at most half of a fresh pack. Each of these 3 claims failed on both entries.
- The flips of `keepOrthogonal` come from the boxes that it leaves free. The test of 200 made-up inputs has 0 flips of pinned boxes.
- The cause is the weak order. A pushed box moves each box with an old `x` between its old and its new `x`, also a box in another row. Thus one wider box moves many boxes, and some of them go past the right side.

Two other forms were measured after the first read of this table, and neither stays in the code. They are not a new prediction.

- A second pass pulled the boxes back from the right side. The cost at step 10 rose to 1.330 for `maxrects-bl` and 1.496 for `skyline`, and the share of pinned boxes fell to 0.960 for `maxrects-bl`.
- With both that pass and a hold of each `y` until a push, the moved share fell to 0.292 and 0.278. The cost at step 10 rose to 1.371 and 1.638.

## The pin of unchanged boxes

`bench/pin.ts` measures `pinUnchanged` of roadmap item k29. A height and a movement are not a time, so any computer can start it. The prediction is `packing-k29-pin-unchanged`.

```bash
node bench/pin.ts --out <file.json> [--seeds 30] [--count 100] [--share 0.05] [--steps 10]
```

The inputs are made-up strips of width 200 with 100 items. Each seed is a chain of 10 change steps. One step has 5 edits: 2 removed items, 2 added items and 1 resized item. The cost is the pinned height over the fresh height of the same step.

| Entry | Moved, fresh | Moved, pinned | Cost, step 1 | Cost, step 10 | Worst cost |
| --- | --- | --- | --- | --- | --- |
| `maxrects-bl` | 0.757 | 0.010 | 1.072 | 1.215 | 1.328 |
| `skyline` | 0.808 | 0.010 | 1.082 | 1.318 | 1.462 |

- The moved column is the mean `pack.stability.moved`. A resized box stays in that measure, and it moves. That is the 0.010 of the pinned arm.
- The hard rules have 0 breaks, and each item has a place.
- These are the first values of `pack.stability.*`. They come from this script, not from a corpus.

## The beam search

`bench/beam.ts` measures `beamStrip` of roadmap item k85. A height is not a time, so any computer can start it. The prediction is `packing-k85-beam`.

```bash
node bench/beam.ts --out <file.json> [--seeds 10] [--count 100] [--widths 1,4,16]
```

The family is the 10 classes of `berkeyWang` and `martelloVigo`, with 100 items and 10 seeds. The gap is `(height / (area / width) - 1) * 100`, the form of Wen 2025. Lower is better.

| Class | `maxrects-bl` | Width 1 | Width 4 | Width 16 |
| --- | --- | --- | --- | --- |
| Berkey and Wang I | 7.19 | 6.97 | 4.21 | 3.79 |
| Berkey and Wang II | 2.37 | 3.80 | 1.19 | 0.88 |
| Berkey and Wang III | 13.92 | 15.53 | 9.52 | 8.82 |
| Berkey and Wang IV | 7.09 | 7.65 | 3.61 | 2.81 |
| Berkey and Wang V | 13.20 | 15.54 | 10.02 | 9.91 |
| Berkey and Wang VI | 8.12 | 8.83 | 4.76 | 4.00 |
| Martello and Vigo VII | 19.71 | 18.85 | 16.06 | 15.70 |
| Martello and Vigo VIII | 11.63 | 10.92 | 6.56 | 5.36 |
| Martello and Vigo IX | 25.42 | 24.56 | 24.12 | 23.89 |
| Martello and Vigo X | 9.63 | 11.84 | 6.73 | 6.16 |
| Mean | 11.83 | 12.45 | 8.68 | 8.13 |

- Width 16 is lower than or equal to `maxrects-bl` on 100 of 100 inputs.
- The hard rules have 0 breaks. The three widths together have a mean of 18084 greedy completions for one input.
- Wen 2025 gives a gap of 7.56 for the set BWMV with no turns at 60 seconds. Those instances are not these inputs, and that method has blocks. The value is only a scale, and this table makes no parity claim.
- The gap uses a lower bound, not the optimum. In class IX, large items make that bound weak.
The third arm pins, packs and then applies `compactUp` (roadmap item k30). The prediction is `packing-k30-compact-up`.

| Entry | Moved | Distance, fresh | Distance, compacted | Cost, step 1 | Cost, step 10 | Worst cost |
| --- | --- | --- | --- | --- | --- | --- |
| `maxrects-bl` | 0.146 | 0.355 | 0.028 | 1.071 | 1.192 | 1.290 |
| `skyline` | 0.221 | 0.333 | 0.052 | 1.080 | 1.229 | 1.383 |

- The distance is the mean `pack.stability.mean`. Its unit is the width of the strip.
- The compaction takes back only a small part of the height cost: 1.215 goes to 1.192 for `maxrects-bl`. It moves few boxes, and each move is short.

## The law pairs

`bench/law-cover.ts` (roadmap item k146) counts the item laws that the corpus really emits. It generates each committed spec and examines the boxes. The label of a generator has no effect on the result, so one generator with law params gets each pair that it emits.

Each spec gets three laws. A pair of two laws is covered when some spec has both.

| Dimension | Levels | Count |
| --- | --- | --- |
| Area law | identical, narrow, uniform, normal, exponential, log-normal, Pareto, bimodal, multimodal | 9 |
| Aspect law | fixed, narrow, wide, extreme mixed, discrete | 5 |
| Assortment | all differ, few types, cut from a box | 3 |

There are 87 pairs: 45 of area and aspect, 27 of area and assortment, 15 of aspect and assortment. The full cross of the three dimensions has 135 cells, and it is a later rung.

### The rules of the read

- The read pools the items of each spec over its seeds. It takes out the mean log area of each input only when the means differ by more than the count of items explains.
- A spread of the log area of at most 0.02 is identical, and at most `ln 1.5` is narrow.
- A mode needs 10 percent of the items and a valley under half of its height. Two modes are bimodal, and three or more are multimodal.
- The other areas get the smooth law with the highest likelihood. Each candidate has 2 fitted numbers, so the values compare directly.
- An aspect is discrete with 2 to 8 clusters. It is extreme mixed with 15 percent of the items past `ln 3` each way and at most 15 percent within `ln 2`.
- An assortment is a cut when the areas of each input fill the container exactly. For an open strip, the sides are whole and the sum of the areas is a multiple of the width. It is few types when most inputs have at most 16 types and 4 items for each type.

### The floor of items

A spec with fewer than 200 pooled items gives no law, and the result counts it as refused. The floor comes from the recovery of 100 made-up samples for each level, on the seeds of the tuning.

| Items | The worst level | Its recovery |
| --- | --- | --- |
| 100 | log-normal | 59 of 100 |
| 150 | log-normal | 80 of 100 |
| 200 | log-normal | 92 of 100 |
| 400 | each level | 100 of 100 |

The test `bench/law-cover.test.ts` holds each of the 14 levels at 90 of 100 or more at the floor. Its seeds are not the seeds of the tuning.

### The first reading

The corpus covers 31 of the 87 pairs. The read gives laws for 544 specs and refuses 321. Of the refused specs, 156 are `rect-grid` specs with 150 or 170 items. `packages/site/data/law-cover.json` holds the cells and the missing pairs, and a test compares it with the read. The manifest `pack-adversary-v1` holds its inputs with no specs, so the read leaves it out.

Two gaps are real. No spec over the floor gives a narrow area law or an extreme mixed aspect law. The generator `rect-grid` has `nearIdentical` and `extremeAspect` sizes, and no committed spec uses them. A spec with those sizes adds pairs.

A refused spec adds no pair, and a misread spec can add a false pair, so the number is not a bound in either direction.

### The second reading

The first count of modes joined many tight clusters, and with 12 clusters it could give 0. The fixed count gives 2 to 20 clusters at each tested size, and it keeps 1 for the areas of whole-number sides. The normal and log-normal scores are exact likelihoods.

The review of that count found one more fault: groups of equal values gave a count that changed with the size of the sample. Of the 544 specs, 51 have 24 or fewer distinct areas, and 24 of them reach the count of modes. So the count reads few distinct values from their counts, and the result does not change with the size. No spec moved in that read.

A third review found that the count changed under a flip of the axis. So neighbouring humps join in the order of the depth of their valleys. The read also looks at a list of 4 values for its shape. No spec moved in that read. Two constants of the direct read are choices. `SHAPE_RATIO` at 1.3125 moves 16 specs of `half-wide` and gives 33 pairs. `FEW_VALUES` at 30 moves 2 specs of `consecutive-squares` and gives 33 pairs. The other values, at 25 percent up and down, move no spec.

The number stays 31 of 87, and the 56 missing pairs do not change. Of the 544 specs, 4 change their area law. 2 `bl-trap` specs go from bimodal to multimodal, and 2 `burke-kendall-whitwell` specs go from uniform to normal. One cell of 16 goes, and its pairs have other cells.

Each of the 31 pairs has a spec with 300 items or more, or a spec with an area law that is not smooth. Under 300 items the choice of a smooth law is weak. 8 pairs have only one generator. At half and at three times its size, each spec with few distinct areas keeps its class of 1, 2 or more modes. 14 specs with 40 or more distinct areas change that class, because a kernel reads them. No pair of an area law rests only on their generators. The number stays an estimate: at 300 items the read gives the normal law for 85 percent of normal samples, and at 1,000 items for 97 percent.
