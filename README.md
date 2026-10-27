# packing

Rectangle packing for layouts, with measures of the result.

This repository holds [`@mark1russell7/packing`](packages/packing/README.md). The package places rectangles in an outer rectangle or a strip. It has a guillotine row packer, a skyline packer, sort orders, a push cascade and the measures of a packing.

The plan goes further:

- Many strategies behind one interface: shelf, guillotine, maxrects, skyline and an exact search for small inputs.
- An algebra of measures: density and waste, aspect, reading order, stability, determinism and speed.
- Benchmarks in CI, with a prediction before each run.
- A live site with interactive examples.

`docs/ROADMAP.md` has the plan and the status of each item.

The package was `@mark1russell7/render-pack` before 0.1.0. Its history is in `packages/packing`.

The license is MIT.
