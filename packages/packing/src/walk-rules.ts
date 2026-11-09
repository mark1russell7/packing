// The acceptance rules and the moves of the strategy `walk` (roadmap item k212). This module imports nothing, so each module can read the lists.

/**
 * The acceptance rules of `walk`. Each rule tells when a worse candidate replaces the current genome.
 *
 * - `climb`: no worse candidate replaces it. A tie replaces it, so the walk can cross a flat part of the key.
 * - `threshold`: a worse candidate replaces it when its loss is at most the band, and the band falls to 0 over the packs.
 * - `record`: a candidate replaces it when its loss to the best genome is at most the band.
 * - `late`: a candidate replaces it when it is not worse than the genome of `history` steps before.
 */
export const WALK_ACCEPTS: readonly WalkAccept[] = Object.freeze(["climb", "threshold", "record", "late"] as WalkAccept[]);

/** One acceptance rule of `walk`. */
export type WalkAccept = "climb" | "threshold" | "record" | "late";

/**
 * The moves of `walk`. Each move changes the order of the movable items.
 *
 * - `swap`: two items change places.
 * - `insert`: one item goes to another place, and the items between move by one place.
 * - `reverse`: the items of one block go in the reverse order.
 * - `mixed`: a swap or an insert, each with the chance one half, as in `anneal`.
 */
export const WALK_MOVES: readonly WalkMove[] = Object.freeze(["swap", "insert", "reverse", "mixed"] as WalkMove[]);

/** One move of `walk`. */
export type WalkMove = "swap" | "insert" | "reverse" | "mixed";
