## Space coverage

How much of the space of strategies and inputs can we predict? A model learns each measure from the records of one CI run. Then it predicts the records that it did not see.

- The features are the options of the strategy and the dimensions of the input. The family, the container, the obstacles and the count are dimensions.
- The model is a regression tree. It learns on 4 parts of the specs and predicts the fifth part. Each part gets its turn.
- A part holds all the seeds of its specs. Thus the model sees no seed of a spec that it predicts. The small numbers "by input" come from a less strict test.
- The baseline predicts the median of the learned records for each record. A good model has a much smaller error than the baseline.
- The mean error shows the outliers. The median error shows a usual record.
- A cell is one strategy with one value of each dimension of a family. A cell is covered when its mean error is at the tolerance or below.
- The share is the covered cells over all the cells of the space. A cell without records is not covered.
- A new list of strategies changes the cells of the space. Thus a line of the trend reads only the strategies of its own list, with one corpus and one method. A later point with a new strategy continues the line over the common strategies, and the page states that count.
- The run 41949891960 and the run 40805165103 have the same output on each of the 14,500 pairs of the 29 earlier strategies. The later list has more strategies, and those 29 did not change.
- The number "bench grid" is that share. The number "whole space (sampled)" is the share of random pairs of a config and an input that the model predicts within the tolerance.
- Most random configs are portfolios with 5 members. Thus the pairs also go into strata: a strategy family with one count of members.
- The number "whole space (sampled)" comes from the last sample with a uniform draw.
- The number "equal weight over strata" is the mean of the shares of the strata. Each family and size has the same weight.
- The number "pooled over strata" is the share of all the pairs of the stratified sample. It is not a uniform share.
- A stratum without pairs shows "no pairs". It is not in the mean. No sampled input has circles, so `hole-degree` has no pairs.

The index of a feature is the part of the variance of the measure that the feature explains alone. A high index tells that the feature changes the measure much.
