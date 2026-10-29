// The counts of the characteristic move of each strategy (roadmap item k59, `docs/BENCH.md`, "Activation"). The
// packers count their move here, and the adapters write the count in `trace.measures`. The counts do not change a layout.
// The module is internal: the package root does not export it.

/** The id of the characteristic move of each strategy and of each shelf fit. The trace of each strategy has its id, also with the count 0. */
export const MOVES: Readonly<{
  rows: "move.gapFill";
  shelf: "move.stack";
  skyline: "move.lowerWindow";
  push: "move.cascade";
  firstFit: "move.firstFit";
  bestFit: "move.bestFit";
  bssf: "move.bssf";
  blsf: "move.blsf";
  baf: "move.baf";
  cp: "move.cp";
  split: "move.split";
  minWaste: "move.minWaste";
  wasteFill: "move.wasteFill";
  guillotine: "move.freeChoice";
  merge: "move.merge";
}> = Object.freeze({
  /** A rectangle that the gap fill of `packRow` places in a gap of a row: under a shorter neighbor, or at the row break. */
  rows: "move.gapFill",
  /**
   * A rectangle that `packShelf` puts on an open shelf with a taller rectangle. The strip above it stays empty. With a
   * `fit`, the move is a rectangle in the strip above a shorter rectangle of a shelf.
   */
  shelf: "move.stack",
  /** A rectangle that the skyline puts in a lower window, not in the leftmost window where it fits. */
  skyline: "move.lowerWindow",
  /** A rectangle that a push cascade moves. */
  push: "move.cascade",
  /** A rectangle that a shelf fit puts on a shelf that is not the open shelf. The open shelf is the last shelf that the packing opened. */
  firstFit: "move.firstFit",
  /** A rectangle that the fit `best` puts on a shelf that is not the first shelf where it fits. */
  bestFit: "move.bestFit",
  /** A rectangle that the rule `bssf` of `maxrects` puts in another place than the rule `bl` on the same free rectangles. */
  bssf: "move.bssf",
  /** A rectangle that the rule `blsf` of `maxrects` puts in another place than the rule `bl` on the same free rectangles. */
  blsf: "move.blsf",
  /** A rectangle that the rule `baf` of `maxrects` puts in another place than the rule `bl` on the same free rectangles. */
  baf: "move.baf",
  /** A rectangle that the rule `cp` of `maxrects` puts in another place than the rule `bl` on the same free rectangles. */
  cp: "move.cp",
  /** A rectangle of `maxrects` that cuts two free rectangles or more. A shelf or a skyline has no such step. */
  split: "move.split",
  /** A rectangle that the skyline rule `mw` puts in another place than the rule `bl` on the same skyline. */
  minWaste: "move.minWaste",
  /** A rectangle that the waste map of the skyline puts in a free rectangle below the skyline. */
  wasteFill: "move.wasteFill",
  /** A rectangle that the choice rule of `guillotine` puts in a free rectangle that is not the first free rectangle where it fits. */
  guillotine: "move.freeChoice",
  /** Two free rectangles of `guillotine` with a common full edge that the option `merge` joins into one. */
  merge: "move.merge",
});

const counts = new Map<string, number>();

/** This function adds `n` to the count of a move. */
export function countMove(id: string, n = 1): void {
  if (n > 0) counts.set(id, (counts.get(id) ?? 0) + n);
}

/** This function sets the count of a move to 0. Without an id, it sets each count to 0. */
export function clearMoves(id?: string): void {
  if (id === undefined) counts.clear();
  else counts.delete(id);
}

/** This function gives the count of a move since the last `clearMoves`. */
export function moveCount(id: string): number {
  return counts.get(id) ?? 0;
}
