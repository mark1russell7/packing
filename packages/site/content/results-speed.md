## A paired speed test: the release 0.2.17

The strategy `rows` of 0.2.17 packs each width of the size search one time. Before, it started again up to 17 times for each width.

- A paired test timed 0.2.16 and 0.2.17 in one CI process, input by input, in the order ABBA. Thus a drift of the machine cancels.
- The ratio is the time of arm B divided by the time of arm A. A ratio below 1 is faster.
- The slow set is the 60 free-size inputs with rectangles and 100 boxes. They were the slowest inputs of `rows`.
- Each output of the two arms has the same hash. Thus the change of speed did not change a layout.
