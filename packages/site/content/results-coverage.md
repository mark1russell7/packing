## Space coverage

How much of the space of strategies and inputs can we predict? A model learns each measure from the records of one CI run. Then it predicts the records that it did not see.

- The features are the options of the strategy and the dimensions of the input. The family, the container, the obstacles and the count are dimensions.
- The model is a regression tree. It learns on 4 parts of the inputs and predicts the fifth part. Each part gets its turn.
- The baseline predicts the median of the learned records for each record. A good model has a much smaller error than the baseline.
- A cell is one strategy with one value of each dimension of a family. A cell is covered when its mean error is at the tolerance or below.
- The share is the covered cells over all the cells of the space. A cell without records is not covered.

The index of a feature is the part of the variance of the measure that the feature explains alone. A high index tells that the feature changes the measure much.
