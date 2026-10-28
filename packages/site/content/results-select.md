## The table of `select`

The strategy `select` looks at four features of an input. They are a fixed or free size, the count of boxes, the spread of the sizes and the shape. Then it picks `rows` or `maxrects-bl` from a small table. CI fitted the table on the training runs.

- A win is a fill of `maxrects-bl` at least 5% above the fill of `rows`, with no new hard break.
- A leaf picks `maxrects-bl` when it wins on more than half of its inputs. Otherwise the leaf picks `rows`.
- The tests use fresh seeds that the fit did not see. A pick holds when the tests agree with the training.
- The line at the middle of each bar marks half of the inputs.
