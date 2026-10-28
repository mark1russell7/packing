# The measures of the packer

This document defines each measure of the packer. A measure is a function of one layout, or of two layouts for stability. The code is `src/measures.ts` of `@mark1russell7/packing`, and its tests pin the values.

The ids are the ids of [`docs/FORMAT.md`](FORMAT.md#the-measures-of-the-packer). The router `highways` uses the same ids. The table of FORMAT is the short list. This document is the definition.

## The words

- **The layout** is an input (`PackInput`) and its output (`PackOutput`).
- **A box** is a placed item with a width and a height above 0. A box has the size of its item after the turn. An item without a placement is not a box.
- **The hull** is the smallest rectangle around the boxes. Its width is `W` and its height is `H`. No box gives `W = H = 0`.
- **The area of the boxes** is `A = sum(w * h)` over the boxes. A shaped item counts as its bounding rectangle.
- **The rank** of an item is its field `rank`. Without it, the rank is the index of the item in the list.
- **The direction** tells which values are better: `lower` or `higher`.

The functions:

| Function | Gives |
|---|---|
| `measure(input, output, options?)` | The measures of one layout, by id. |
| `measureChange(baseInput, baseOutput, changeInput, changeOutput)` | The stability measures of a change pair. The items match by id. |
| `isDeterministic(first, second)` | The measure `pack.deterministic` of two runs. |
| `MEASURE_SPECS` | The family, the unit, the direction, the range and the minimum effect of each id. Each guard also has its `floor` and its `tol`. |

### The numbers

- The functions give numbers that are not rounded. The math uses the full values.
- A record rounds each number with `roundMeasures`: `Math.round(x * 1000) / 1000`, a half goes up, and `-0` becomes 0. This is the rounding of FORMAT.
- A comparison of a position uses `RECORD_EPS`, `1e-3`. Two values of a file that differ by `RECORD_EPS` or less are equal.
- The hard rule `no-overlap` uses `tolerance.overlap`, `0.001` by default. The ranges below are true for a layout with no break of the hard rules.

## Density and waste

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.area` | square units | lower | 0 or more |
| `pack.fill` | share | higher | 0 to 1 |
| `pack.whitespace` | share | lower | 0 to 1 |

**`pack.area`** is the area of the hull.

`area = W * H`

**`pack.fill`** is the area of the boxes divided by the area of the hull.

`fill = A / (W * H)`

**`pack.whitespace`** is the part of the hull that no box covers.

`whitespace = 1 - fill`

- No box: the area is 0, the fill is 0 and the whitespace is 1. An empty layout covers nothing.
- One box: the area is the area of the box, the fill is 1 and the whitespace is 0.
- Two boxes that overlap give a fill above 1. Then the rule `no-overlap` has a break.
- On one input with all items placed, `A` stays the same. Thus the ratio of the areas is the inverse of the ratio of the fills.

## Aspect

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.aspect` | ratio | lower | 1 or more |
| `pack.aspectError` | natural log | lower | 0 or more |

**`pack.aspect`** is the larger of the two aspects of the hull. It does not use the target.

`aspect = max(W / H, H / W)`

**`pack.aspectError`** is the distance on a log scale from the aspect of the hull to the target aspect `T`. `T` is `container.aspect`, and the default is 1.

`aspectError = |ln(W / H) - ln(T)|`

- No box: the aspect is 1 and the aspect error is 0.
- A target of 0 or less gives `Infinity`. The input is then not valid.
- The log scale makes the error the same for a hull 2 times too wide and a hull 2 times too high. Each one gives `ln 2`, approximately 0.693.
- The size search `log-sweep` uses the same function, `aspectError` of `src/free.ts`.

## Reading order

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.order.inversions` | share | lower | 0 to 1 |
| `pack.order.breaks` | count | lower | 0 to `n - 1` |

The reading order compares two boxes `a` and `b`:

- When their heights overlap by more than `RECORD_EPS`, they are on one line. The box with the smaller `x` comes first.
- When their heights do not overlap, the box with the smaller `y` comes first.

`a before b = (overlapY(a, b) > RECORD_EPS) ? (a.x + RECORD_EPS < b.x) : (a.y < b.y)`

The rule compares only two boxes. Thus it needs no row tolerance and no scale. A shelf layout reads by rows. A tall box next to a column of short boxes comes before each of them.

**`pack.order.inversions`** is the share of the pairs that the layout reads against the rank order. A pair counts only when its two ranks differ.

`inversions = #{(a, b) : rank(a) < rank(b) and b before a} / #{(a, b) : rank(a) != rank(b)}`

**`pack.order.breaks`** counts the steps of the rank order where the reading order goes back. The boxes are in the order of their rank. A step between two equal ranks does not count.

`breaks = #{k : rank(b[k]) < rank(b[k+1]) and b[k+1] before b[k]}`

- No box, one box, or no pair with different ranks: both measures are 0.
- The cost of `pack.order.inversions` is `n * (n - 1) / 2` comparisons.
- A locked item is a box. It counts in the reading order, as each other box.
- An input with `order` set to `hard` needs 0 for both measures.

## Raggedness

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.raggedness` | share | lower | 0 to 1 |

The rows: the boxes go in the order of their top. A box joins the last row when its top is within the row tolerance of the top of the first box of that row. The row tolerance is the option `rowTolerance`. The default is half the median height of the boxes.

**`pack.raggedness`** is the spread of the right ends of the rows, divided by the width of the hull.

`raggedness = (max(right of row) - min(right of row)) / W`

- No box or one row: the raggedness is 0.
- `packingMetrics` uses the same rows, with a row tolerance of 40 by default. Its `raggedness` is not divided by `W`.
- The last row counts. A short last row gives a high raggedness.

## Overflow

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.overflow` | count | lower | 0 to `n` |
| `pack.overflow.rate` | share | lower | 0 to 1 |
| `pack.overflow.area` | share | lower | 0 to 1 |
| `pack.overflow.forced` | count | lower | 0 to `n` |
| `pack.overflow.forcedArea` | share | lower | 0 to 1 |
| `pack.overflow.excess` | count | lower | 0 to `n` |
| `pack.overflow.forcedAreaMin` | share | lower | 0 to 1 |
| `pack.overflow.excessArea` | share | lower | 0 to 1 |

**`pack.overflow`** counts the items that the packer did not place: the distinct ids of `output.overflow`.

- The promotion rule names this measure "unplaced items". It is a guard only in the cells with a fixed size: `containerSize` set to `fixed`.
- An item with no position that is not in the overflow is a break of the hard rule `complete`. It is not part of `pack.overflow`.

**`pack.overflow.rate`** is the overflow divided by the count of the items, `n`. No item gives 0.

`rate = overflow / n`

**`pack.overflow.area`** is the area of the unplaced items divided by the area of all the items. The area of an item is `w * h`. No area gives 0.

**`pack.overflow.forced`** is a lower bound of the overflow. It counts the items that no packer can place. The function `overflowBound` of `src/overflow.ts` gives it.

**`pack.overflow.excess`** is the overflow that a better packer can perhaps place.

`excess = overflow - forced`

**`pack.overflow.forcedArea`** is the area of the forced overflow, divided by the area of all the items. It is a lower bound of `pack.overflow.area`. It is a diagnostic of 0.2.2. Since 0.2.3, use `pack.overflow.forcedAreaMin`.

**`pack.overflow.forcedAreaMin`** (since 0.2.3) is the tight lower bound of the overflow area. It uses the same free area `F` and the same rule for too-long items as `forced`.

`forcedAreaMin = (area of the too-long items + max(0, rest - F)) / total item area`

- `rest` is the area of the other candidates. The section "The forced overflow" gives `F` and the area of a candidate.
- A container with no fixed side gives 0. A container with only a fixed width or height gives the area of the too-long items.
- The value is equal to `pack.overflow.forcedArea`. The new id tells that the value is a bound of an area, not the area of the dropped items.

**`pack.overflow.excessArea`** (since 0.2.3) is the overflow area that a better packer can perhaps place.

`excessArea = overflow.area - forcedAreaMin`

- A difference from `-1e-9` to 0 is float noise, and it becomes 0. A value below `-1e-9` stays, because it shows a bug.
- The property test of each strategy shows `forcedAreaMin <= overflow.area + 1e-9` on generated inputs of each container shape, fixed and free.

**Judge a strategy by `excessArea`.** The count bound `forced` is weak on mixed sizes. The bound drops the largest items first, and a packer often leaves out many small items.

- Example: 1 box of 10000 and 10 boxes of 100 in a box of 100 by 100. `forced` is 1.
- A packer that leaves out the 10 small boxes has the overflow 10 and the excess 9. Its `excessArea` is approximately 0, because no packer can place more area.
- Thus `excess` counts overflow that no packer can avoid. `excessArea` does not.

Since 0.2.2 (roadmap item k59), the bench ranks the fill only on the records with no overflow. A strategy that leaves out items gets a high fill. The forced overflow tells which part of the overflow the input forces.

### The forced overflow

The candidates are the items that are not locked at a position. A locked item with `x` and `y` uses its rectangle of the container.

1. A fixed side forces each candidate that is longer than that side less 2 times the inset. A `turnable` item is forced only when both turns are too long.
2. When the container has a fixed size, the other candidates must fit in the free area `F`. The largest candidates go first, until the sum of the rest is `F` or less. Each candidate that goes is forced.
3. `forced` is the sum of the counts of step 1 and step 2. A container with no fixed side gives 0.

The free area `F` is an upper bound. Thus `forced` is a lower bound for each packer, and the property test of each strategy shows `forced <= overflow`.

| Container | `F` |
|---|---|
| A rectangle | The area of the container less the inset, less the exact union of the fixed rectangle obstacles and the locked items in it. |
| A circle or an ellipse | `pi * r^2` or `pi * rx * ry`, and not more than the rectangle less the inset. |
| A polygon | The shoelace area of the outer ring, less each hole whose box is in the ring and has no common point with the box of a hole before it. |
| Each shape, not a rectangle | It loses each fixed obstacle and each locked item that is fully in the shape, when their boxes have no common point. |

- An obstacle with `move` is not subtracted, because a packer can move it.
- A rectangle container also loses the exact area of each obstacle of another shape that is fully in it. Its box has no common point with the other boxes.
- The bound ignores the gap and the margins. They make the true free area smaller, thus the bound stays valid.
- The area of a candidate is `w * h`, or the area of its shape when that is smaller.
- A slack keeps the bound valid for the tolerance of the hard rules: `2 * tolerance.overlap` along the edges of each candidate and of the container.
- The area of `pack.overflow.forcedAreaMin` and `pack.overflow.forcedArea` is the area of the long items of step 1, plus the part of the area of the rest above `F`.
- The area bound does not use the items that step 2 drops. Their area is often more than the part above `F`.

## Coverage

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.coverage` | ratio | higher | 0 to 1 |

**`pack.coverage`** is the part of the inputs of a corpus that a strategy packed: the measured inputs divided by all the inputs.

- It is a measure of a benchmark, not of one layout. `measure` does not give it, and `MEASURE_SPECS` does not have it.
- The field `coverage` of `run.json` keeps it for each strategy, and for each container shape. `docs/BENCH.md` tells the fields.
- An input that the strategy skips, or that throws an error, is not a measured input.
- A prediction of `pack.coverage` uses `>=` by default. Its optional field `cell` names one container shape.

## Stability

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.stability.moved` | share | lower | 0 to 1 |
| `pack.stability.mean` | container widths | lower | 0 or more |
| `pack.stability.q95` | container widths | lower | 0 or more |

A change pair is the run on a base input and the run on its variant. The variant names the base in `base`, and its change in `change` (FORMAT). The items match by id.

- **An item stays** when both inputs have it and both outputs place it. The added and the removed items do not count.
- **An item moved** when its `x` or its `y` changed by more than `RECORD_EPS`, or when its turn changed.
- **The distance** of an item is the length of the move of its top-left corner: `d = sqrt(dx^2 + dy^2)`.
- **The unit** `U` is the larger width of the two output sizes. A `U` of 0 becomes 1.

**`pack.stability.moved`** is the share of the staying items that moved.

`moved = #{moved} / #{stay}`

**`pack.stability.mean`** is the mean distance of the staying items, in widths of the container.

`mean = sum(d) / (#{stay} * U)`

**`pack.stability.q95`** is the quantile 0.95 of the distances of the staying items, in widths of the container.

`q95 = quantile(d / U, 0.95)`

- No staying item: each measure is 0.
- A vertical move can be longer than the width. Thus `mean` and `q95` can be above 1.
- A distance at or below `RECORD_EPS` is not a move. It still counts in `mean` and `q95`.
- The quantile uses linear interpolation. The position in the sorted list is `(n - 1) * q`. `quantile` gives it.
- The unit is the larger width of the two runs. Thus the measures are the same when the two runs change places.

## Determinism

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.deterministic` | boolean | `true` is better | `true` or `false` |

**`pack.deterministic`** is `true` when two runs with the same input, the same options and the same seed give the same layout.

- The same layout has the same placements, the same overflow, the same size and the same moved obstacles.
- The placements match by id. Their order in the list does not count. The numbers must be equal, with no tolerance.
- The trace is not part of the rule, because its times change from run to run.
- The field `deterministic` of a record holds this value. The promotion rule needs `true` (its hard rule test).

## Speed and search

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.search.widths` | count | lower | 0 or more |
| `pack.search.ms` | milliseconds | lower | 0 or more |

**`pack.search.widths`** is the sum of `pack.search.widths` over the stages of the trace. It counts the widths that a size search tried.

**`pack.search.ms`** is the sum of `pack.search.ms` over the stages of the trace. It is the time of the size search.

- A run without a size search gives 0 for both measures. A fixed size and a fixed width have no size search.
- The field `ms` of a record is the time of the full run. The runner measures it.
- A time changes with the load of the computer. Thus only CI measures the times.

## How measures combine

PROMOTION is the shared promotion rule: `docs/PROMOTION.md` of `mark1russell7/highways`, from its pull request 77. It tells when a candidate becomes a default.

### The paired ratio of one input

A comparison of a candidate with the current default uses one ratio for each input and seed. The two values come from the same input and the same seed. The rule is the rule of [PROMOTION](https://github.com/mark1russell7/highways/blob/main/docs/PROMOTION.md#the-paired-ratio). This document does not copy it.

`ratio = candidate / current` for `lower`, and `ratio = current / candidate` for `higher`

- A ratio above 1 is worse in each direction. A fill of 0.6 against 0.5 gives `0.5 / 0.6`, approximately 0.83: better.
- When both values are 0, the ratio is 1.
- When only the divisor is 0, the ratio is `Infinity`: worse than each limit. For `lower`, the divisor is the current value. For `higher`, it is the candidate value.
- `pairedRatio(candidate, current, direction)` gives this ratio. `MEASURE_SPECS[id].direction` gives the direction.

### The median of the ratios over a corpus

The verdict over a corpus uses the median of the ratios, `medianRatio(ratios)`. It does not use the ratio of two medians.

- The median of the ratios compares each input with itself. Thus a large input and a small input have the same weight.
- The ratio of two medians compares two different inputs. It can tell the opposite of the inputs.
- An example. The current areas are 10, 100 and 1000. The candidate areas are 12, 90 and 1100.
- The ratios are 1.2, 0.9 and 1.1. Their median is 1.1: the candidate is worse on 2 of 3 inputs.
- The medians are 100 and 90. Their ratio is 0.9, and it tells that the candidate is better. That is wrong.

### Quantiles and tails

- `quantile(values, q)` gives a quantile with linear interpolation. The position in the sorted list is `(n - 1) * q`.
- `tailShare(ratios, limit)` gives the share of the ratios above a limit. The tail test of PROMOTION uses it.
- An `Infinity` ratio stays in the list. It moves the median and the tail, as the rule tells.
- The sign test and the bootstrap belong to the screen (roadmap items k11 and k58). This package does not give them.

### Weighted objectives

A strategy makes one objective small. The objective of the size search `log-sweep` uses `aspectWeight` (`w`, default 1):

`objective = area * (1 + w * aspectError)`

The log of this product is a sum of two terms. Each term has no unit:

`ln(objective / A) = -ln(fill) + ln(1 + w * aspectError)`

- The first term is the waste: 0 for a fill of 1. The second term is the aspect: 0 at the target aspect.
- With `w = 0`, only the area counts. This is the cell `freeArea`.
- A new objective adds more terms of the same kind: `sum(w_k * t_k)`. Each term `t_k` has no unit.
- A term has no unit when it is a share (`pack.fill`), a log (`pack.aspectError`), or a paired ratio against the default.
- A term with a unit, for example `pack.area`, first becomes a ratio. Otherwise the weights change with the scale of the input.

## The guards of a promotion

The promotion rule names the guard measures of the packer in words ([PROMOTION, the measures of each step](https://github.com/mark1russell7/highways/blob/main/docs/PROMOTION.md#the-measures-of-each-step)). These are their ids.

| PROMOTION | Id | Direction | Where |
|---|---|---|---|
| area | `pack.area` | lower | Each input |
| fill | `pack.fill` | higher | Each input |
| aspect error | `pack.aspectError` | lower | Each input |
| order inversions | `pack.order.inversions` | lower | Each input |
| unplaced items in fixed cells | `pack.overflow` | lower | The inputs with `containerSize` set to `fixed` |
| the median move of the items that stay | `pack.stability.mean` | lower | The change pairs |
| the q0.95 move of the items that stay | `pack.stability.q95` | lower | The change pairs |
| each stability measure | `pack.stability.moved` | lower | The change pairs |

- The median test and the tail test of PROMOTION apply to the paired ratios of each guard.
- The rule names "the median move". The median distance of one input is 0 when fewer than half of the items move. Its ratio is then 1, with no signal. Thus the guard uses the mean of each input, `pack.stability.mean`, and the median test of PROMOTION over the inputs.
- `pack.deterministic` and the hard rules of FORMAT are the hard rule test of PROMOTION. They are not ratios.
- `pack.search.ms` and the field `ms` of a record feed the time test. CI does this test.
- The joint selector of `layout-stack` uses `pack.area`, `pack.fill`, `pack.aspectError` and `pack.order.inversions` as its `pack.*` guards.

### The floors of the guards

The floor rule of PROMOTION ([the floor rule](https://github.com/mark1russell7/highways/blob/main/docs/PROMOTION.md#the-floor-rule)) applies to a guard when the default is at the floor. This document does not copy its tests.

`MEASURE_SPECS` is the source of the floor and the tolerance of each `pack.*` guard. The fields are `floor` and `tol`, as in `MeasureSpec` of `@mark1russell7/layout-contract`.

| Id | `floor` | `tol` | Reason |
|---|---|---|---|
| `pack.order.inversions` | 0 | 0 | Each new inversion is a loss. |
| `pack.overflow` | 0 | 0 | A count. Each new unplaced item in a fixed container is a loss. |
| `pack.aspectError` | 0 | 0.01 (natural log) | An exact tiling gives the default an error of 0. The tolerance is approximately 1% of the aspect. |
| `pack.stability.mean` | 0 | 0.005 container widths | The default often moves no item. |
| `pack.stability.q95` | 0 | 0.01 container widths | The default often moves no item. |
| `pack.stability.moved` | 0 | 0.02 | On a small change, the default often moves no item. The tolerance is 2% of the items that stay. |

- The other measures have no `floor` and no `tol`.
- The tolerances of `pack.aspectError` and `pack.stability` are first values. The records of the floor rule give the data to measure them later.
- A change of a value is a change of `MEASURE_SPECS`, its test and this table.

### The minimum effects

Since 0.2.2, each measure of `MEASURE_SPECS` has the field `minEffect` of `MeasureSpec` of `@mark1russell7/layout-contract` 0.2.3. It is the smallest change that counts as better or worse.

- `compareMeasure(candidate, baseline, spec)` of the contract gives `tie` for a change of `minEffectOf(spec, candidate, baseline)` or less.
- A number is an absolute change. `{ rel: 0.01 }` is 1% of the larger of the two values.
- The contract makes each minimum effect at least `RECORD_EPS`, the rounding of a record.

| Id | `minEffect` | Reason |
|---|---|---|
| `pack.area` | `{ rel: 0.01 }` | An area. The scale changes with the input, thus the effect is relative. |
| `pack.fill` | 0.005 | A share of an area from 0 to 1. |
| `pack.whitespace` | 0.005 | A share of an area from 0 to 1. |
| `pack.aspect` | `{ rel: 0.01 }` | A ratio of lengths, with no upper limit. |
| `pack.aspectError` | 0.01 | The tolerance of the guard. |
| `pack.order.inversions` | 0 | The tolerance of the guard. Each new inversion counts. |
| `pack.order.breaks` | 0 | A count. |
| `pack.raggedness` | 0.005 | A share of a length from 0 to 1. |
| `pack.overflow` | 0 | The tolerance of the guard. Each new unplaced item counts. |
| `pack.overflow.rate` | 0 | A share of a count. |
| `pack.overflow.area` | 0.005 | A share of an area from 0 to 1. |
| `pack.overflow.forced` | 0 | A count. |
| `pack.overflow.forcedArea` | 0.005 | A share of an area from 0 to 1. |
| `pack.overflow.excess` | 0 | A count. |
| `pack.overflow.forcedAreaMin` | 0.005 | A share of an area from 0 to 1. |
| `pack.overflow.excessArea` | 0.005 | A share of an area from 0 to 1. |
| `pack.stability.moved` | 0.02 | The tolerance of the guard. |
| `pack.stability.mean` | 0.005 | The tolerance of the guard. |
| `pack.stability.q95` | 0.01 | The tolerance of the guard. |
| `pack.deterministic` | 0 | A boolean as 0 or 1. |
| `pack.search.widths` | 0 | A count. |
| `pack.search.ms` | none | A time. The times of CI change from run to run, and the time test of PROMOTION has its own rule. |

- A measure with no `minEffect` uses `RECORD_EPS` in `compareMeasure`.
- The test `src/overflow.test.ts` pins this table, and it compares values with `compareMeasure` of the contract.
