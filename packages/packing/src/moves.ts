// The counts of the characteristic move of each strategy (roadmap item k59, `docs/BENCH.md`, "Activation"). The
// packers count their move here, and the adapters write the count in `trace.measures`. The counts do not change a layout.
// The module is internal: the package root does not export it.

/** The id of the characteristic move of each strategy. The trace of each strategy has its id, also with the count 0. */
export const MOVES: Readonly<{ rows: "move.gapFill"; shelf: "move.stack"; skyline: "move.lowerWindow"; push: "move.cascade" }> = Object.freeze({
  /** A rectangle that the gap fill of `packRow` places in a gap of a row: under a shorter neighbor, or at the row break. */
  rows: "move.gapFill",
  /** A rectangle that `packShelf` puts on an open shelf with a taller rectangle. The strip above it stays empty. */
  shelf: "move.stack",
  /** A rectangle that the skyline puts in a lower window, not in the leftmost window where it fits. */
  skyline: "move.lowerWindow",
  /** A rectangle that a push cascade moves. */
  push: "move.cascade",
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
