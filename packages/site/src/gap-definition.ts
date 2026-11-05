// The definition of `pack.gap` changed with roadmap item k118. Each page that shows an older value says so, and the note goes with the last older run.

/** The last bench run of the site data with the definition of `pack.gap` before k118. A later run has the new definition. */
export const LAST_RUN_OLD_GAP = 40805165103;

/** This function gives the HTML of the note for data with the older `pack.gap`, or an empty text when each run has the new definition. */
export function oldGapNote(runs: readonly (number | null)[]): string {
  if (!runs.some((run) => run !== null && run <= LAST_RUN_OLD_GAP)) return "";
  return "This data has the <code>pack.gap</code> from before k118: <code>result / bound - 1</code>, 0 or more. A later run has <code>1 - bound / result</code>, from 0 to 1. Do not compare a value of one definition with a value of the other.";
}
