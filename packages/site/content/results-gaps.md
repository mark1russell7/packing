## Distance to the best

How far is each result from the best possible layout? Two measures tell it. For both, 0 is the best and less is better.

- `pack.gapToOpt` compares a result with the known best value of its input. The corpus `pack-known-v1` has inputs with a known best value: perfect cuts and consecutive squares.
- `pack.gap` compares a result with a bound of its cell. No packer gets a result better than the bound. But the best result can be worse than the bound. Thus a gap above 0 is not always a loss of the packer.
- In a fixed container, both measures count the area of the boxes that the packer did not place. In a free size, they measure the height or the area of the layout above the best value.
- A value below 0 shows a bug of a bound or of a packer. The tile counts these values.

The chart gives the median of all inputs, with the band from the first to the third quartile. The table gives the median of each cell. A darker cell is farther from the best, and ▲ marks the lowest median of a row.
