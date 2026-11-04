# The neighbours of this library

Roadmap item `k5` asks a question about three other libraries. Each one has code with a name near a name of this library. The question: is it packing, and is a change to call this library a good change?

The answer is no for each of the three. The numbers come from a small local test of 2026-11-04, with made-up inputs and no timing. The test is not in the repository. It used `packRows` of commit `362481b` in input order.

| Code | Input | Output | Call this library? | Cost of the change |
| --- | --- | --- | --- | --- |
| `gridLayout` of `splay` | a count, a column count and a row height | equal cells, in order | No | 10207 gzip bytes and 2 new dependencies for a function of 13 lines |
| strategy `grid` of `ireko` | the sizes of the children | rows and columns that align | No | The columns stop aligning, and the Vex program goes away |
| rule `cut` of `highways` | the centers of the nodes and the edges | a tree of sections | No | No shared step exists to replace |

## `gridLayout` of `splay`

This function takes no item sizes. It calculates each cell from the index of the item, so it has no packing decision.

The test gave `rows` the cells of `gridLayout`, in 6864 cases. Each case has a width, a column count from 1 to 24 and 3 rows of cells.

| Result of `rows` | Cases |
| --- | --- |
| Each position is equal | 2770 |
| An item goes to another row | 2140 |
| The rows stay, and an `x` differs by a rounding error | 1954 |

The second row of the table is the main result. The sum of the widths of a row can go over the container by a rounding error, so `rows` breaks the row early. `gridLayout` calculates each position from the index, so it has no such error. The first such case has width 1 and 9 columns.

The change also adds cost. The subpath `@mark1russell7/packing/rows` is 10207 gzip bytes, from `bench/gates/size.json`. `splay` has no runtime dependency today, and this library has 2.

**Decision:** keep `gridLayout`.

## The strategy `grid` of `ireko`

This strategy has a different promise. Each column is as wide as its widest child, and each row is as tall as its tallest child. Thus the cells align, and a reader can follow a row or a column.

The test used 1000 inputs of 2 to 6 columns and 2 to 5 rows, with sizes from 10 to 99. It gave `rows` the width of the grid. In no input did each item keep the `x` of its column. The mean height of `rows` was 0.897 of the height of the grid.

So `rows` gives about 10 % less height, and it loses the alignment. These are two different results.

The strategy is also a Vex program, in `grid.generated.js`. Calculations over records use Vex in these projects. The change removes that program, and it adds 2 dependencies to a package that has none.

**Decision:** keep the strategy. If `ireko` wants a dense container, the correct change is a new strategy that calls this library. The strategy `grid` stays as it is. That choice is for the owner of `ireko`, and no one asks for it today.

## The rule `cut` of `highways`

This rule shares a word with this library, and no more. Our guillotine packer cuts free space to place boxes of known sizes. The rule `cut` of `highways` reads the center of each node and the edges of the graph. It puts each line where the line cuts few edges, for its balance. Its output is a tree of sections.

The rule uses no box size as a size, and it places nothing. This library has no measure of edges. So no step of one can replace a step of the other.

**Decision:** keep the rule. The test did not examine this code, because the two have no shared input.
