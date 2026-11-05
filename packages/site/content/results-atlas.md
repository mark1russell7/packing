## Solved regions

Where does a strategy reach the best result on all or nearly all inputs? A region is one cell of one corpus, with one measure. Each word in this table is about this corpus, its count of inputs and the budget of its run. A word is not about the problem.

- The test reads the share of inputs at or under the margin. The 95 % Wilson lower bound of this share must be 0.90 or more.
- The bound of all inputs at the margin decides the smallest count. Thus 35 inputs can pass, and a cell with fewer inputs reads `too few inputs`, with the count.
- A cell of 1,260 inputs needs 1,155 inputs at the margin, a share of 91.7 %.
- A cell that passes reads `holds, no search read` until the search for hard inputs has read it. Then it reads `solved` if the search finds nothing past the margin.
- A search hit makes the region `open` and shows the input. A cell under the bound also reads `open`, with its distance.
- `pack.gapToOpt` compares with a known best value, so its margin stays 0 plus a numeric tolerance.
- `pack.gap` has a margin of 0 until the exact runs measure the slack of the bound. Then a cell takes a high quantile of this slack, with its run.
- A margin of 0 reads `optimal on N inputs`. A measured slack reads `within the bound's slack on N inputs`.
- A row of `pack.gap` from a run before the change of that measure reads `not read on the current measure`. It shows no distance.
- The best strategy of a row is a pick after the fact: the same inputs choose it and score it. The selector column shows the figure that a user gets.
- The Wilson bound counts the inputs as independent. This page does not prove that they are independent.
- A strategy can also lead a weekly corpus. The count of weeks led needs 4 weekly points.
