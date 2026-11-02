// Roadmap item A13 of algebra: a hook that sees the inputs of the float predicates of the packer.
// The package root does not export it. Only the bench command `predicates` sets it.

/** The names of the predicates that report to the probe. */
export type PredicateName = "overlap" | "container" | "edgeRange" | "xAt" | "samePlacements";

/** A function that gets the name, the inputs and the float answer of one predicate. */
export type PredicateProbe = (fn: PredicateName, args: Readonly<Record<string, unknown>>, answer: unknown) => void;

/**
 * This object holds the probe of the predicates. The default is `undefined`, and then no predicate reports.
 *
 * - A predicate uses the probe with an optional call. Thus with no probe, it makes no object for the inputs.
 * - The probe does not change an answer. The outputs stay byte-equal with a probe and without one.
 */
export const predicates: { probe: PredicateProbe | undefined } = { probe: undefined };
