## Each strategy against `rows`

Each row compares one strategy with `rows` on the same inputs and seeds. The bar shows the change of the fill, with its 95% interval.

- Each number is the change in the good direction of its measure. Thus a plus sign is better on each measure.
- **Better** or **Worse** shows only when two tests agree. One test gives each family of boards the same weight. The other test gives each input the same weight.
- **No verdict** means that the difference is smaller than the tie size, or that the two tests do not agree.
- A fill win counts only when its partner measure is not worse. On a corpus with fixed widths, the partner is the right strip. A row that is worse on the partner shows what it gives up.
- The pair does not guard the order of the input. At this count of inputs, the order measure does not find a small rise of inversions.
- On a corpus with no partner, a higher fill shows as **Higher, no claim**. The page claims no fill win there.
- **Not measured** means that CI did not start the strategy on this corpus. The strategy `push` needs a live server, so the offline runs skip it.
- The time of each strategy comes from its own CI job. These times are not a paired test. The section on speed has the paired test.
- Each time is an in-order time: one process packs the inputs in order. It changes with the CPU and the state of the process.

Click a row to see each measure, the families of boards and the groups.
