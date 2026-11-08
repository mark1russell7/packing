// This file is generated. Do not edit it. `bench/whole-positions.ts --write` writes it, and the check of the same script compares it.
// Each row is a read of one option set on the family whole-positions/1 of whole-number rect inputs. The row states no promise beyond this read.

/** The inputs of one read with a fractional value of a property, and with a near-whole value and no fractional value. */
export interface GridCount {
  readonly fractional: number;
  readonly nearWhole: number;
}

/** The read of one option set of one strategy. */
export interface OutputRead {
  readonly optionSet: string;
  /** The inputs that the strategy packed. */
  readonly inputs: number;
  readonly position: GridCount;
  readonly size: GridCount;
}

/** The reads of each strategy. */
export type OutputTable = Readonly<Record<string, readonly OutputRead[]>>;

/** The name of the input family of the read. */
export const OUTPUT_SOURCE = "whole-positions/1";

/** The version of the package at the read that wrote this file. A version change alone does not change a row. */
export const OUTPUT_READ_VERSION = "0.14.0";

/** The rows of `strategyCatalog`, by strategy. */
export const STRATEGY_OUTPUT: OutputTable = {
  "anneal": [
    {"optionSet":"anneal-maxrects-bl-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"anneal-skyline-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "aspect-fit": [
    {"optionSet":"aspect-fit-maxrects-bl","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"aspect-fit-maxrects-bssf","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"aspect-fit-portfolio-k2","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "bbox": [
    {"optionSet":"bbox-maxrects-bl","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"bbox-skyline","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "beam": [
    {"optionSet":"default","inputs":6,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "best-fit": [
    {"optionSet":"best-fit-short","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"best-fit-tall","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "binary-height": [
    {"optionSet":"default","inputs":6,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "bottom-left": [
    {"optionSet":"bottom-left-liu-teng","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "circle-quasi-physical": [
    {"optionSet":"default","inputs":0,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "exact-strip": [
    {"optionSet":"default","inputs":2,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "force": [
    {"optionSet":"default","inputs":144,"position":{"fractional":144,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"force-maxrects-bl","inputs":144,"position":{"fractional":144,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"force-rows","inputs":144,"position":{"fractional":144,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"force-skyline-bl-waste","inputs":144,"position":{"fractional":144,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "genetic": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"genetic-maxrects-bl-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "guillotine": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"guillotine-baf-sas","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"guillotine-bssf-sas-merge","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "hole-degree": [
    {"optionSet":"default","inputs":0,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "masonry": [
    {"optionSet":"columns-linear-partition","inputs":96,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"default","inputs":96,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"masonry-lpt","inputs":96,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"masonry-shortest","inputs":96,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "maxrects": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"maxrects-baf","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"maxrects-bl","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"maxrects-blsf","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"maxrects-bssf","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"maxrects-cp","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "near-rects": [
    {"optionSet":"default","inputs":12,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "overlap-min": [
    {"optionSet":"default","inputs":96,"position":{"fractional":52,"nearWhole":0},"size":{"fractional":52,"nearWhole":0}},
    {"optionSet":"overlap-min-maxrects-bl-k8192","inputs":96,"position":{"fractional":52,"nearWhole":0},"size":{"fractional":52,"nearWhole":0}},
    {"optionSet":"overlap-min-skyline-k8192","inputs":96,"position":{"fractional":54,"nearWhole":0},"size":{"fractional":54,"nearWhole":0}},
  ],
  "portfolio": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"portfolio-area-rows-bl","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"portfolio-fill-rows-bl","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"portfolio-k2","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"portfolio-k3","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "push": [
    {"optionSet":"default","inputs":144,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "raster-nofit": [
    {"optionSet":"default","inputs":24,"position":{"fractional":4,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "relax": [
    {"optionSet":"default","inputs":144,"position":{"fractional":94,"nearWhole":34},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"relax-maxrects-bl","inputs":144,"position":{"fractional":94,"nearWhole":34},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"relax-rows","inputs":144,"position":{"fractional":108,"nearWhole":28},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"relax-skyline-bl-waste","inputs":144,"position":{"fractional":110,"nearWhole":22},"size":{"fractional":0,"nearWhole":0}},
  ],
  "restarts": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"restarts-maxrects-bl-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"restarts-maxrects-bl-shuffle-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"restarts-rows-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "rows": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "ruin-recreate": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"ruin-recreate-maxrects-bl-k64","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"ruin-recreate-skyline-k64","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "select": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "shelf": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"shelf-best","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"shelf-first","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"shelf-first-input","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"shelf-next","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "shelf-breaks": [
    {"optionSet":"default","inputs":6,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "shelf-online": [
    {"optionSet":"default","inputs":6,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "side-anchors": [
    {"optionSet":"default","inputs":144,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":25,"nearWhole":0}},
    {"optionSet":"side-anchors-first-left","inputs":72,"position":{"fractional":44,"nearWhole":0},"size":{"fractional":33,"nearWhole":0}},
  ],
  "skyline": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"skyline-bl-waste","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"skyline-mw","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"skyline-mw-waste","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "sleator": [
    {"optionSet":"default","inputs":6,"position":{"fractional":6,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "tabu": [
    {"optionSet":"default","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
    {"optionSet":"tabu-maxrects-bl-k16","inputs":240,"position":{"fractional":0,"nearWhole":0},"size":{"fractional":0,"nearWhole":0}},
  ],
  "treemap": [
    {"optionSet":"default","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":96,"nearWhole":0}},
    {"optionSet":"treemap-pivot-split","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":96,"nearWhole":0}},
    {"optionSet":"treemap-slice-dice","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":72,"nearWhole":4}},
    {"optionSet":"treemap-spiral","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":92,"nearWhole":0}},
    {"optionSet":"treemap-squarified","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":96,"nearWhole":0}},
    {"optionSet":"treemap-strip","inputs":96,"position":{"fractional":96,"nearWhole":0},"size":{"fractional":76,"nearWhole":0}},
  ],
};
