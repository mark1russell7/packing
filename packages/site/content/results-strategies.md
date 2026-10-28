## Each strategy against `rows`

Each row compares one strategy with `rows` on the same inputs and seeds. The bar shows the change of the fill, with its 95% interval.

- Each number is the change in the good direction of its measure. Thus a plus sign is better on each measure.
- **Better** or **Worse** shows only when two tests agree. One test gives each family of boards the same weight. The other test gives each input the same weight.
- **No verdict** means that the difference is smaller than the tie size, or that the two tests do not agree.
- **Not measured** means that CI did not start the strategy on this corpus. The strategy `push` needs a live server, so the offline runs skip it.
- The time of each strategy comes from its own CI job. These times are not a paired test. The paired test is in the next section.

Click a row to see each measure, the families of boards and the groups.
