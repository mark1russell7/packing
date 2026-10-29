# The measures of the packer

This document defines each measure of the packer. A measure is a function of one layout, or of two layouts for stability. The code is `src/measures.ts` of `@mark1russell7/packing`, and its tests pin the values.

The ids are the ids of [`docs/FORMAT.md`](FORMAT.md#the-measures-of-the-packer). The router `highways` uses the same ids. The table of FORMAT is the short list. This document is the definition.

## The words

- **The layout** is an input (`PackInput`) and its output (`PackOutput`).
- **A box** is a placed item with a width and a height above 0. A box has the size of its item after the turn. An item without a placement is not a box.
- **The hull** is the smallest rectangle around the boxes. Its width is `W` and its height is `H`. No box gives `W = H = 0`.
- **The box of a shape item** is the bounding box of its shape at its place (`placedRect` of the contract), not `w` by `h` (roadmap item k113).
  `bbox` packs that box. Thus the boxes of a `bbox` output do not overlap, and `fill` stays from 0 to 1.
- **The area of the boxes** is `A = sum(w * h)` over the boxes. A shape item counts as the bounding box of its shape.
- The hull, the fill, the whitespace, the overflow measures and `pack.gapToOpt` read the same boxes. An input with no shape gives its item boxes.
- **The rank** of an item is its field `rank`. Without it, the rank is the index of the item in the list.
- **The direction** tells which values are better: `lower` or `higher`.

The functions:

| Function | Gives |
|---|---|
| `measure(input, output, options?)` | The measures of one layout, by id. |
| `measureChange(baseInput, baseOutput, changeInput, changeOutput)` | The stability measures of a change pair. The items match by id. |
| `isDeterministic(first, second)` | The measure `pack.deterministic` of two runs. |
| `gapToOpt(input, output, known)` | The measure `pack.gapToOpt`: the distance from the known best value of the input. |
| `anchorStability(input, strategy, id, step, options?)` | The measures `pack.anchor.*`: how far the other items move when one anchor moves. |
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
| `pack.shapeFill` | share | higher | 0 to 1 |
| `pack.whitespace` | share | lower | 0 to 1 |

**`pack.area`** is the area of the hull.

`area = W * H`

**`pack.fill`** is the area of the boxes divided by the area of the hull.

`fill = A / (W * H)`

**`pack.shapeFill`** is the area of the shapes of the boxes divided by the area of the hull (roadmap item k91).

`shapeFill = S / (W * H)`

- `S` is the sum of `boxArea` of the contract over the placed boxes. A circle, a polygon and a `rect` give their exact area.
- A box of the kind `free`, for example an ellipse, has no exact area in the contract. It counts with the area of its box.
- A shape is inside its box. Thus with a `free` box, `shapeFill` is the true share or more: an upper bound.
- The spec declares this (contract 0.2.17). It has the exact kinds `rect`, `polygon` and `circle`, and `bound: { shapes: ["free"], side: "upper" }`.
- `checkShapes` refuses `shapeFill` on a `free` box at the levels `exact` and `safe`. Only the level `bound` accepts it.
- Use the level `bound` only for a claim that an upper bound proves, for example "the shapes cover at most this share".
- The hull of `shapeFill` is the hull of `fill`: the hull of the bounding boxes of the shapes. Before k113, it was the hull of the item boxes.
- A layout of `rect` boxes without a shape gives `shapeFill` equal to `fill`. A shape is inside its box, thus `shapeFill` is not above `fill`.

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
| `pack.overflow.forcedAreaMin` | share | lower | 0 to 1 (a deprecated alias of `pack.overflow.forcedArea`) |
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

**`pack.overflow.forcedArea`** is the tight lower bound of the overflow area. It uses the same free area `F` and the same rule for too-long items as `forced`.

`forcedArea = (area of the too-long items + max(0, rest - F)) / total item area`

- `rest` is the area of the other candidates. The section "The forced overflow" gives `F` and the area of a candidate.
- A container with no fixed side gives 0. A container with only a fixed width or height gives the area of the too-long items.

**`pack.overflow.forcedAreaMin`** (since 0.2.3, deprecated since 0.2.4) is an alias of `pack.overflow.forcedArea`. It has the same value and the same spec, except the id.

- 0.2.3 added it as a second id of the same value. Since 0.2.4, `forcedArea` is the one name.
- The alias stays until the next minor version. Use `pack.overflow.forcedArea`.
- A test of `src/measures.test.ts` shows that the two values are equal on generated inputs of each container shape, fixed and free.

**`pack.overflow.excessArea`** (since 0.2.3) is the overflow area that a better packer can perhaps place.

`excessArea = overflow.area - forcedArea`

- A difference from `-1e-9` to 0 is float noise, and it becomes 0. A value below `-1e-9` stays, because it shows a bug.
- The property test of each strategy shows `forcedArea <= overflow.area + 1e-9` on generated inputs of each container shape, fixed and free.

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
- Since roadmap item k118, the bound counts the margins and the gap of each rectangle item that is not in `pairGaps`. `docs/PACKER.md` (decision 3) gives the proof.
- Rule A: each candidate needs the area of its box with its margins in `F`. Rule B, with a gap above 0: each candidate needs its box grown by its margins and by the gap, in the container less the inset grown by the gap. Rule B does not subtract the obstacles.
- `forced` is the larger count of the two rules. The area is the larger area of the two rules.
- A candidate of the area bound counts in units of the area that it needs. Thus the area bound drops the candidates with the least item area for each unit first, and it can drop a part of a candidate.
- A shape item and an item of `pairGaps` count with no margin and no gap. The measures of an input without margins and without a gap do not change.
- The area of a candidate is `w * h`, or the area of its shape when that is smaller.
- A slack keeps the bound valid for the tolerance of the hard rules: `2 * tolerance.overlap` along the edges of each candidate and of the container.
- The area of `pack.overflow.forcedArea` and of its alias `pack.overflow.forcedAreaMin` is the area of the long items of step 1, plus the part of the area of the rest above `F`.
- The area bound does not use the items that step 2 drops. Their area is often more than the part above `F`.

## Bounds

Since roadmap item k51, the bench records the bound of the objective of each cell, and the distance of the result to it. `boundMeasures` of `src/bounds.ts` gives these measures. The function `measure` does not give them, so the default records and `outputHash` stay the same.

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.bound` | the unit of the objective | none | 0 or more |
| `pack.bound.kind` | a code | none | 0 to 7 |
| `pack.gap` | share | lower | 0 to 1 |

**`pack.bound`** is a fact of the input, not of the packer. No packer gets a better result. Its unit is the unit of the objective of the cell:

| Cell | Objective | Sense of the bound |
|---|---|---|
| `freeHeight` | the height of the hull | lower |
| `freeWidth` | the width of the hull | lower |
| `freeArea` and `freeAspect` | the area `w * h` of the hull | lower |
| `fixed` | the placed share of the item area, from 0 to 1 | upper |

**`pack.bound.kind`** is the index of the strongest bound in `BOUND_KINDS`. A record holds only numbers, thus the kind is a code and not a string.

| Code | Kind | Cell | Proof |
|---|---|---|---|
| 0 | `strip.area` | a strip | The pieces do not overlap and stay in the strip. Thus `H >= sum(w * h) / W`. |
| 1 | `strip.tallest` | a strip | The hull holds each item. Thus `H` is at least the tallest item in its lowest turn. |
| 2 | `strip.mmv` | a strip | Two pieces wider than `W / 2` stack. The bound L2 of Martello, Monaci and Vigo adds the narrow area that the wide pieces cannot hold. |
| 3 | `strip.margin` | a strip | The pieces with their margins, and with the gap since k118, do not overlap. They go out of the hull by at most the largest top and bottom margins and the gap. |
| 4 | `hull.area` | no fixed side | The pieces do not overlap in the hull. Thus its area is at least the sum of their areas. |
| 5 | `hull.extent` | no fixed side | The hull holds the widest and the tallest item. A `turnable` item puts its long side on one axis. |
| 6 | `hull.margin` | no fixed side | The pieces with their margins, and with the gap since k118, stay in the hull grown by the largest margins and the gap. |
| 7 | `placed.free` | a fixed size | The placed area is at most the free area `F` of the forced overflow. |

**`pack.gap`** is the share of the better value that the result misses. The value 0 tells that the result is the best possible. `boundShare` gives it since roadmap item k118.

- For a lower bound, `pack.gap` is `1 - bound / result`. For the upper bound of a fixed size, it is `1 - result / bound`.
- The bound and the result are 0 or more. Thus the quotient is 0 or more, and `pack.gap` is at most 1 for each result and each bound.
- `pack.gap` is 0 or more only when the bound is sound: the result is not better than the bound.
- When both values are 0, `pack.gap` is 0. A divisor of 0 with a numerator above 0 gives -1: the bound is wrong.
- A strip and a free container give no `pack.gap` when the output leaves out an item of the bound. Then the result does not compare.
- The smoke check fails on a `pack.gap` below 0, because then the bound is wrong. A test of `bench/sample-space.test.ts` checks `0 <= pack.gap <= 1` on sampled pairs.

Before k118, `pack.gap` was the ratio `result / bound - 1` (`bound / result - 1` for the upper bound). `boundGap` gives that ratio.

- A ratio `g` gives the share `g / (1 + g)`, and a share `s` gives the ratio `s / (1 - s)`. The two forms give the same order of the results.
- The ratio has no upper end, even with a sound bound: a result of 3 times its lower bound gives 2. Thus a clip of the ratio to 1 hides results. The share does not.
- The ratio of a fixed size with no placed item area is `Infinity`, and the record had no value. The share of that layout is 1.

The rules of the bounds:

- A piece is the rectangle of an item, cut to the box of its shape. The hard rules use that box too.
- The tolerance: each piece becomes smaller by `tolerance.overlap / 2` on each side. Then the pieces have no common point, and the hull loses `tolerance.overlap`.
- The bounds round up only with no tolerance and whole sizes. The bench uses a tolerance, so its strip bounds do not round.
- `strip.mmv` does not use an item with 2 turns that fit. Fewer items do not need more height.
- An item that is wider than a fixed width, in each turn, is not in the strip bounds. It counts as overflow.
- The bounds count the margins and the gap of each rectangle item that is not in `pairGaps` (k118). Each strategy keeps the gap (decision 3 of `docs/PACKER.md`).
- A bound with the gap is the larger of the bound with the margins only and the bound with the margins and the gap.
- The bounds ignore the obstacles of a free container. Fewer limits do not make the optimum worse.
- A shaped container counts as its bounding box, as in the hard rules. A margin below 0 gives no bound.
- The aspect term of `freeAspect` is 0 or more. Thus the bound of the area holds, but it is weaker than for `freeArea`.

### The loss of one entry to another

The adversarial search of roadmap item k47 (`bench/adversary.ts`) finds the inputs where an entry A loses most to an entry B. The loss is not a field of a record. The search and the corpus `pack-adversary-v1` write it.

| Container | Measure | Loss |
|---|---|---|
| `fixed` (a fixed size) | `pack.fill` | `fill(B) - fill(A)` |
| each other container | the ratio `boundGap` of k51 | `gap(A) - gap(B)` |

- A value above 0 tells that A loses to B. The value 0 tells that A and B have the same result.
- The loss uses the ratio, the form of `pack.gap` before k118. Thus the corpus `pack-adversary-v1` stays the same. Its inputs have no margins and no gap, so their bounds do not change.
- On a strip, the bound is a fact of the input. Thus `gap(A) - gap(B)` is `(H(A) - H(B)) / bound`: the extra height of A in units of the bound.
- A loss needs a value of each measure, and no break of a hard rule by B. A candidate without them has no loss.
- A can break a hard rule. The field `hardA` of the corpus gives the count of its breaks.
- With `best` as B, B is the single entry with the best value and no break. The first entry of the list wins a tie.

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

## Balance

Roadmap item k123. A compact pack can put all its boxes in one corner. These measures show that skew. The contract `@mark1russell7/layout-contract` computes them with `balanceOf`, so the joint bench gets the same values. Its `docs/BALANCE.md` gives the definitions.

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.balance.gapCv` | ratio | lower | 0 or more |
| `pack.balance.centroidOffset` | half diagonals | lower | 0 to 1 |
| `pack.balance.side.top`, `.right`, `.bottom`, `.left` | share | lower | 0 to 1 |
| `pack.balance.sideRange` | share | lower | 0 to 1 |

- **The boxes** are the boxes of `boxesOf`: the bounding box of each placed item.
- **The container** starts at 0, 0. A fixed side keeps its length. A free side has the length of the output size (`balanceContainerOf`).
- **The free area** is the container less the boxes.

**`pack.balance.gapCv`** is the standard deviation of the gaps over their mean. The gap of a box is the distance to the nearest other box.

**`pack.balance.centroidOffset`** is the distance from the centroid of the free area to the center of the container, over half of the diagonal.

**`pack.balance.side.<side>`** is the empty share of the strip at that side. The strip has the depth `BALANCE_SIDE_DEPTH`, 0.25 of the container.

**`pack.balance.sideRange`** is the largest side value less the smallest side value. It is the skew measure of the front of compact against spread.

- The balance measures read the area of each box, so their specs declare only `rect`.
- With a low fill, the centroid offset gets small. Read `pack.balance.sideRange` then.

## Stability by alignment

Roadmap item k123. `procrustesOf` of the contract aligns the box centers of two layouts with the best move and rotation. It gives the root mean square of the distances that stay.

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.stability.procrustes` | `W` for each change share | lower | 0 or more |
| `pack.stability.seed` | `W` | lower | 0 or more |

- **The unit** `W` is the width of the container for a fixed size or a fixed width. Else, it is the width of the placed boxes with their margins (`stabilityUnitOf`).
- **The change share** is the count of the changed items over the count of the base items, and at least 1 item. A changed item is a dropped, resized or new item.

**`pack.stability.procrustes`** is the aligned move of a change pair, divided by the change share. Only a record with a base has it.

**`pack.stability.seed`** is the aligned move between the outputs of the seed and the seed plus 1 of one input. A strategy that does not read the seed gives 0.

## Stability when an anchor moves

Roadmap item k111 measures how far the other items move when one anchor moves. The function `anchorStability` of `src/anchor.ts` gives the measures. `measure` does not give them, because they need more packs.

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.anchor.mean` | container diagonals | lower | 0 or more |
| `pack.anchor.max` | container diagonals | lower | 0 or more |
| `pack.anchor.moved` | share | lower | 0 to 1 |
| `pack.anchor.gain` | step lengths | lower | 0 or more |
| `pack.anchor.settled` | boolean as 0 or 1 | higher | 0 or 1 |

The words:

- **The anchor** is a locked item with a position, or a fixed rectangle obstacle. `isAnchor` tells if an id is an anchor. The side anchors of roadmap item k110 are not in the package yet.
- **The step** is `(dx, dy)`, a small move of the anchor. Its length is `L = sqrt(dx^2 + dy^2)`, and `L` is above 0.
- **The other items** are the items of the input other than the anchor. An item that only one of two outputs places does not count.
- **The loop** is `k` steps of the same move. Pack `j` has the anchor at its position plus `j` times the step, for `j` from 0 to `k`.
- Each pack uses the same strategy, the same options and the same seed. The default `k` is `ANCHOR_STEPS`, 4.

The first three measures compare pack 0 and pack 1. The distance `d` of an other item is the length of the move of its top-left corner.

**`pack.anchor.mean`** is the mean distance of the other items, in diagonals of the container.

`mean = sum(d) / (#{other} * D)`

**`pack.anchor.max`** is the largest distance of an other item, in diagonals of the container.

`max = max(d) / D`

**`pack.anchor.moved`** is the share of the other items that moved. It is `pack.stability.moved` of `measureChange`, on the inputs without the anchor.

**`pack.anchor.gain`** is the largest gain of a step of the loop. The gain of step `j` is the largest distance of an other item from pack `j - 1` to pack `j`, divided by `L`.

`gain = max over j of (max(d_j) / L)`

**`pack.anchor.settled`** is 1 when the gain of each step is at most the limit, and 0 otherwise. The option `gainLimit` is the limit. The default is `ANCHOR_GAIN_LIMIT`, 1.

The normalisation:

- `D` is the diagonal of the larger width and the larger height of the sizes of pack 0 and pack 1. A `D` of 0 becomes 1.
- The diagonal counts a move in `x` and a move in `y` the same. The width of `pack.stability` makes a vertical move in a tall strip larger than 1.
- A top-left corner in the container moves at most `D`. Thus `mean` and `max` are from 0 to 1 when the items stay in the container.
- The diagonal does not use the anchor. Thus two anchors of one input compare. An item size is not the unit, because a small anchor gives large values.
- The gain has the step length as its unit. Thus the gain does not change with the length of the step when the packer moves the items with the anchor.

The settle rule:

- A loop of an anchor and a container size settles when each change of one side moves the other side less. A gain of 1 or less is that bound for the packer.
- With the gain limit 1, the other items move no farther than the anchor in each step of the loop. Then the displacement of each step stays bounded.
- A gain above 1 shows a jump: a small move of the anchor sends an item to another row or another free rectangle.
- A gain at the limit plus `RECORD_EPS / L` counts as at the limit. This tolerance is the rounding of a record.
- `gains` of the result gives the gain of each step in its order. Use it to see if the jumps are in one step or in each step.

The rules:

- No other item, or no other item that moves: each distance measure and the gain are 0, and `settled` is 1.
- The function does not check the moved input. Choose a step that keeps the anchor in the container and away from the other anchors.
- `anchorStep` gives the step of the bench: 1% of the container width along the wall of the anchor. The section "Stability when an anchor moves" of `docs/BENCH.md` tells it.
- The cost is `k + 1` packs for each anchor. A composite strategy multiplies it with the packs of its members.

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

## Distance from the best value

| Id | Unit | Direction | Range |
|---|---|---|---|
| `pack.gapToOpt` | ratio | lower | 0 or more |

**`pack.gapToOpt`** is the distance of a layout from the known best value of its input (roadmap item k45). The function `gapToOpt(input, output, known)` gives it. `known` is the field `known` of the input. `docs/FORMAT.md` tells that field.

- A fixed container: the area of the unplaced items divided by `known.area`. The best value is 0.
- A fixed width with a `known.height`: `height / known.height - 1`. The height is the bottom of the lowest box.
- The other free sizes: `W * H / known.area - 1`, with the hull `W` by `H`.
- A free size with an unplaced item gives `Infinity`. The record does not keep the value.
- With `known.kind` set to `bound`, the value is an upper bound of the distance from the optimum.
- A value from `-1e-9` to 0 becomes 0. A lower value shows a bug of the bound or of the packer.
- The runner adds the measure only to the inputs with the field `known`. Thus the records of the other corpora do not change.
- The measure has no `floor`, thus it is not a guard of a promotion.

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
| `pack.shapeFill` | 0.005 | A share of an area from 0 to 1. |
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
| `pack.overflow.forcedAreaMin` | 0.005 | The deprecated alias of `pack.overflow.forcedArea`, with its spec. |
| `pack.overflow.excessArea` | 0.005 | A share of an area from 0 to 1. |
| `pack.stability.moved` | 0.02 | The tolerance of the guard. |
| `pack.stability.mean` | 0.005 | The tolerance of the guard. |
| `pack.stability.q95` | 0.01 | The tolerance of the guard. |
| `pack.deterministic` | 0 | A boolean as 0 or 1. |
| `pack.search.widths` | 0 | A count. |
| `pack.search.ms` | none | A time. The times of CI change from run to run, and the time test of PROMOTION has its own rule. |
| `pack.gap` | 0.005 | A share of a bound. A change of 0.005 counts. |
| `pack.gapToOpt` | 0.005 | Half of 1 percent of the known best value. |

- A measure with no `minEffect` uses `RECORD_EPS` in `compareMeasure`.
- The test `src/overflow.test.ts` pins this table, and it compares values with `compareMeasure` of the contract.
