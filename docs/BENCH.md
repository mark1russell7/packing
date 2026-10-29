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
| `guillotine-baf-sas` | `guillotine` | `choice: "baf"`, `split: "sas"` | none |
| `guillotine-bssf-sas-merge` | `guillotine` | `choice: "bssf"`, `split: "sas"`, `merge: true` | none |
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
| `ruin-recreate-maxrects-bl-k64` | `ruin-recreate` | `member: maxrects-bl`, `iterations: 64` | `maxrects-bl` |
| `ruin-recreate-skyline-k64` | `ruin-recreate` | `member: "skyline"`, `iterations: 64` | `skyline` |

- The 4 variants of roadmap item k21 are the shelf family. `docs/PACKER.md` tells the option `fit`.
- The 5 entries of roadmap item k24 are the MaxRects family, one for each `rule`. `docs/PACKER.md` tells the rules.
- The 3 entries of roadmap item k22 are the skyline family: the rule `mw` and the waste map. `docs/PACKER.md` ("The skyline family") tells them.
- The 2 entries of roadmap item k23 are the guillotine family. `docs/PACKER.md` ("The guillotine family") tells the rules. No corpus has turnable items, thus no entry turns.
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
- The entry `select-rows-bl` of roadmap item k66 is `SELECT_ENTRIES`. It packs with one member, from the features of the input. Its move is `move.select`. `docs/PACKER.md` ("The feature select") tells it.
- The 3 entries of roadmap item k78 are `RESTARTS_ENTRIES`. Each one packs 16 times with its member, in random orders, and keeps the best output. Its move is `move.restartPick`. `docs/PACKER.md` ("The random restarts") tells it.
- The 2 entries of roadmap item k79 are `RUIN_RECREATE_ENTRIES`. Each one removes some boxes 64 times, and packs them again with its member. Its move is `move.ruinRecreate`.
- `docs/PACKER.md` ("The goal-driven ruin and recreate") tells the entries of k79.

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
   The measures of `measure` include `pack.shapeFill`, the shape area over the hull. Each corpus has only `rect` items, so it is equal to `pack.fill` there.
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
| `pack-worst-v1` | 342 | The adversarial families and the scaling ladder of roadmap item k107. Write its prediction first. |
| `pack-adversary-v1` | 6 | The worst input of each pair of the adversarial search of roadmap item k47. The file holds the inputs, not specs. |
| `pack-strip-v1` | 528 | The published sets of strip packing of roadmap item k46, by their rules. Write its prediction first. |
| `pack-anchor-v1` | 51 | The inputs with locked items on the walls of roadmap item k111. Use it with the option `--anchor`. |

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

The corpus `pack-adversary-v1` has the worst input of 6 pairs. Each search has the seed 1, the budget 2000 and the cap of 60 items.

- The field `found` has one line for each pair: the loss, the values of A and B, the winner, the origin and the path.
- The field `inputs` has the input files, in the order of `found`.
- The file has no specs, so the runner does not read it. A test reads its inputs.
- `node bench/adversary.ts` writes the file. `node bench/adversary.ts --check` compares the file with a new search of each pair.
- `node bench/adversary.ts --check --pair 2` examines the pair with the index 2 only. A test examines that pair and the hash of each input.

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

No generator of the package makes an input with a `base` and a `change` yet. Thus no record has the stability measures. When the corpus has change pairs, the runner adds the measures of `measureChange` against the run on the base input.

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
| `coverage.json` | `node bench/snapshot.ts coverage <folder of 40783923164> --run 40783923164 --date 2026-10-28 --release 0.2.17` | The space coverage of 5 strategies on `pack-select-v2` (k105). Each new run adds a point to the trend. The folder `sample` of a run adds the whole space (k112). |

- A strategy snapshot gives the result of `verdict()` of `@mark1russell7/layout-contract` for each measure, by family, at the level 0.05. The tie of each measure is its `minEffect`.
- The command `select` stops with an error when the training wins differ from `SELECT_LEAF_WINS`. Thus a change of the table also changes the pinned counts and their test.
- A gap snapshot gives the count, the quartiles and the values below 0 of the measure. It gives them for all inputs and for each cell.
- The cell of a gap snapshot is the family up to its container size, for example `perfect-cut.guillotine.fixed`. A record without a finite value counts as missing.
- The commits of the two gap runs come after the tag `v0.2.17`. Thus `--release 0.2.17` gives the release of their packers.
- After a new release, start the command `releases` again. After a new bench run, start the command of its corpus again.
- The command `coverage` keeps the earlier points of `coverage.json`. A point of the same run replaces the earlier point. Without a run, a point with the same date and corpus replaces it.
- The section `uniform` of `coverage.json` keeps the last sample with a uniform draw, with its run and its date. A later uniform sample replaces it. A stratified sample keeps it.

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
2. The knobs `margin` and `gap` are uniform from 0 to 32. The option `--no-knobs` keeps them at 0.
3. An input with more boxes than `--max-count` (1000) goes back. An input that its generator refuses also goes back.
4. The config is uniform over all configs of `packSpace`. The script counts the configs of each option exactly, with big integers, and picks in proportion.
5. Each value of a discrete param counts as one config. A real param counts as one config, and its value is uniform on its scale.
6. A config goes back when `checkConfig` refuses it for the shapes of the input, or when the packer refuses its cell. The script then draws a new config.

- Step 6 is rejection sampling. Thus the draw is uniform over the configs that the input accepts.
- After 20 configs that go back, the script draws a new input. `sample.json` gives the rejection rates and their reasons.
- With `--draw option`, each top option (the base configs and each meta option) gets the same chance. The draw in each option stays uniform.
- Most configs of `packSpace` are portfolios with 5 members. Thus a uniform draw gives almost only portfolios. The option `option` gives the other meta options a chance.
- Pair `i` reads its own random stream of the seed. Thus the same seed gives the same pairs, and a larger `--n` keeps the first pairs.

The script packs each pair two times, to check that the output does not change, then times it with `--repeats` (1). It measures the pair like `bench run`.
It writes `records.jsonl` (`layout-record/1`, with the config and the input of each pair) and `sample.json` (the counts, the rejections and the hard breaks).

The pairs that are not deterministic (the count `nondeterministic` of `sample.json`):

- Only a config with the param `limitTime` set to `true` can give two different outputs. The clock of the time limit cuts a different member on each run.
- The k112 sample found one such pair. The draw keeps `limitTime`, because the time limit is an opt-in of the space.
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

### The strata

A uniform draw gives almost only portfolios with 5 members. Thus its share tells little about the other families (k115).
A stratum is a strategy family with one size. `strataOf` and `stratumOf` of `bench/sample-space.ts` make the strata from the config.

- A base config has the family of its option of the stage `placement`, and the size 1. The 7 base families are `rows`, `skyline`, `shelf`, `maxrects`, `guillotine`, `push` and `hole-degree`.
- A meta option of the stage `combine` is its own family. Its size is its count of members.
- `portfolio` has 2 to 5 members. Each count is one stratum, from `portfolio:2` to `portfolio:5`.
- `cell-portfolio` has a pool. Each value of its param `k` is one stratum: `cell-portfolio:cell`, `cell-portfolio:2` and `cell-portfolio:3`.
- `select` has 2 members. `aspect-fit`, `restarts` and `bbox` have 1 member. Each one is one stratum. The family of their member does not count.
- Thus `packSpace` has 18 strata. The id of a stratum is `<family>:<size>`, for example `portfolio:3`.
- A new option of `placement` or `combine` gives new strata.

```sh
node bench/sample-space.ts --out <folder>/sample --n 400 --seed 1 --stratify
```

The stratified draw:

1. Pair `i` takes the stratum `i` modulo 18. Thus the counts of the strata differ by 1 or less, also after the time limit.
2. The config is uniform over the configs of its stratum. The draw of the input and the rejections stay as in the uniform draw.
3. A rejected config goes back, and the script draws a new config of the same stratum.
4. The same seed gives the same pairs. `--draw stratified` is the same as `--stratify`. The default draw stays `uniform`.
5. A pair tries 200 inputs and 20 configs for each input. A pair that finds no input and config is a miss of its stratum, not an error.
6. One miss closes the stratum (`MAX_STRATUM_MISSES` is 1). The later pairs of a closed stratum draw nothing and count as missed.

The cap keeps the cost of a stratum that no sampled input accepts to 200 inputs and 4000 configs.
For example, `hole-degree` packs only circles, and no corpus family gives circles. Thus `hole-degree:1` gets no pairs.
A stratum that some inputs accept gets a miss only when 200 inputs in a sequence refuse it.

`sample.json` of a stratified sample has `draw: "stratified"` and the field `strata`.
Each stratum has the exact count of the configs (`configs`), the measured pairs (`pairs`) and the missed pairs (`missed`).

The script `coverage.ts --sample` adds the section `strata` next to the section `sampled`. The section `sampled` does not change.

- `stratumOf` gives the stratum of each pair from its config. Thus a uniform sample also gets strata, but most of them have few pairs.
- Each stratum gets its hits, its share and its Wilson 95% interval, with the errors of the section `sampled`.
- A stratum without pairs has the share `null` and the interval `null`, not 0. It is not in the mean.
- With the strata of `sample.json`, each stratum of the section also has its `configs` and its `missed` pairs.
- `equal` is the mean of the shares of the strata with pairs. Each stratum has the weight `1/k`.

The interval of the mean:

- For the variance, each stratum gets the adjusted share `p = (hits + z²/2) / (n + z²)` of Agresti and Coull, with `z` 1.96.
- The variance of the mean is the sum of `p (1 - p) / (n + z²)` over the strata, divided by `k²`. The standard error `se` is its square root.
- The interval is the mean of the shares (`equal.share`), plus and minus `z` standard errors, from 0 to 1. Thus `low <= share <= high` always.
- The adjustment gives a variance above 0 to a share of 0 or 1. It does not move the center of the interval.
- Before the fix of k115, the center was the mean of the adjusted shares. Each stratum added approximately `1.92 / (n + 3.84)` to it.
- Thus with 22 pairs for each stratum, the old interval of a small share started above the share.
- 400 pairs give 22 or 23 pairs for each stratum. The half width of the mean is then approximately 0.05 or less.

Why the two numbers differ:

- The uniform number weights each config the same. Thus it is approximately the share of `portfolio:5`.
- The mean over the strata weights each family and size the same. A low mean with a high uniform number tells that the grid misses the small families.

The input `stratify` of `bench.yml` (default `false`) adds `--stratify` to the sampler.

### The site

The section `#coverage` of the results page reads `packages/site/data/coverage.json`. The command `snapshot.ts coverage` computes the coverage two times.

- The large numbers come from the folds by spec, the stricter test.
- The small numbers "by input" come from the folds by input.
- Each tile shows the number "bench grid" and the number "whole space (sampled)" with its 95% interval.
- The command `snapshot.ts coverage` reads the folder `sample` of the run, or `--sample <dir>`. Without a sample, the tile shows "not measured yet".
- The number "whole space (sampled)" always comes from the last uniform sample. The note under the tiles gives its run and its date.
- With strata, each tile also shows the number "equal weight over strata" with its 95% interval, under the uniform number.
- A stratified sample also gives the number "pooled over strata": the share of all its pairs. It is not a uniform share.
- The chart "The whole space by stratum" shows the share of each stratum of the selected measure, with its interval and the mean.
- A stratum without pairs shows "no pairs" and its count of configs, and no share. It is not in the mean.
- An old snapshot without strata stays readable. The chart then shows a note.
- The error bars show the mean error and the median error of the model against the baseline.
