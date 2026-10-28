## What is rectangle packing?

A layout has many boxes: cards, photos, labels or rows of a list. A packer gives each box a position in a container of a fixed width. The container then gets as tall as the boxes need.

There is no single best layout. A dense layout can mix up the order of the boxes. A layout in the order of the boxes can leave gaps. The measures at the side of each layout show this cost.

- **The strategy** is one of the 8 strategies of the registry. Each option of the strategy has a control under its name.
- **Rows** fills the container row by row, from left to right. It also fills the space under the short boxes of a row.
- **Skyline** puts each box at the lowest place where it fits.
- **Shelf** and **MaxRects** fill shelves or free rectangles. **Push** shoves each box that overlaps another box, until no box overlaps.
- **Portfolio**, **Aspect fit** and **Select** use other strategies. Pick their members from the named entries of the benchmark.
- **The compare page** packs one input with each named entry of the benchmark, side by side.
- **The sort order** sets the order in which the packer takes the boxes. With `input`, the packer takes them in the order of the list. The number on each box is its rank in that list.
- **A free width** lets `packFree` find the width. It packs the boxes at many widths and keeps the width with the lowest objective.
- **The objective** is the area of the box times (1 + weight × aspect error). The aspect error is the distance from the target aspect, on a log scale.
- **The chart of the search** shows the objective of each width that `packFree` tried. The large dot shows the width that it kept.

## What comes next

This site is the first version. It will grow with the package:

- Many strategies behind one interface: shelf, guillotine, maxrects, skyline and an exact search for small inputs.
- An algebra of measures: density and waste, aspect, reading order, stability and speed.
- Stability: how far the boxes move when one box changes.
- Benchmarks that run in CI, with a prediction before each run.

The source, the tests and the roadmap are in [the repository on GitHub](https://github.com/mark1russell7/packing). The package is [`@mark1russell7/packing` on npm](https://www.npmjs.com/package/@mark1russell7/packing). All of the data on this page is made up.
