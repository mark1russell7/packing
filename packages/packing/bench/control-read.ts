// The read of the controls of the bench. `docs/BENCH.md` ("The controls of a measure") tells the read.
//
//   node bench/main.ts control-read --as-of <YYYY-MM-DD> [--out file] <run dir>...
//
// The folders hold the records of the real entries and of the controls of one corpus. The output has the pooled read
// and the read by stratum. A bench reads the pooled result for a gate, and it reads a stratum only where the keys suffice.

import { checkMeasures, type ControlRead, type MeasureChecks, type MeasureRow, type MeasureRule } from "@mark1russell7/rigor-bench";
import { MEASURE_SPECS, type MeasureId } from "@mark1russell7/packing";
import { NOT_RUN_JOB, NOT_RUN_SIZE, OVER_BUDGET } from "./budget.ts";
import { CONTROL_ENTRIES, FILL_TRICK, KEEP_SHELF } from "./controls.ts";
import { isMeasured, NOT_RUN_BASE, type BenchRecord } from "./run.ts";

/** The date of the next control of a measure with no control at this time. */
const NEXT_CONTROLS = "2026-11-25";

/** The reason of a measure with no control at this time. */
const NO_CONTROL_YET = "The read of the first control comes first, and it tells how strong a control has to be.";

/** The measure of a step of a chain. Only a run of a chain corpus has it. */
const STEP_MEASURE: MeasureId = "pack.stability.moved";

/** The measures that a verdict, a gate or a page reads, with their controls. A measure with no control has an open date. */
const READ_MEASURES: readonly { readonly measure: MeasureId; readonly controls: readonly string[]; readonly partners: readonly MeasureId[] }[] = Object.freeze([
  { measure: "pack.fill", controls: [FILL_TRICK], partners: ["pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea"] },
  { measure: "pack.order.inversions", controls: [], partners: [] },
  { measure: "pack.aspectError", controls: [], partners: [] },
  { measure: "pack.overflow.excessArea", controls: [], partners: [] },
  { measure: "pack.overflow", controls: [], partners: [] },
  { measure: "pack.balance.sideRange", controls: [], partners: [] },
  { measure: "pack.raggedness", controls: [], partners: [] },
  { measure: STEP_MEASURE, controls: [KEEP_SHELF], partners: ["pack.fill"] },
]);

/** This function gives the inputs of the records that have the measure of a step. So step 0 of a chain, with no base, is not one of them. */
function stepInputs(records: readonly BenchRecord[]): Set<string> {
  return new Set(records.filter((r) => isMeasured(r) && (r.measures as Record<string, number | undefined>)[STEP_MEASURE] !== undefined).map((r) => r.input));
}

/** This function gives the measures of a read. A run with no chain has no rule for a step, because a rule with no rows is a finding. */
const readMeasures = (steps: ReadonlySet<string>): typeof READ_MEASURES => (steps.size > 0 ? READ_MEASURES : READ_MEASURES.filter((m) => m.measure !== STEP_MEASURE));

/**
 * The rules of `checkMeasures` for the measures of the bench. The resolution is the minimum effect of the spec when that effect is a number above 0.
 * The rule of a step comes only when the records have a step.
 */
export function controlRules(records: readonly BenchRecord[] = []): MeasureRule[] {
  return readMeasures(stepInputs(records)).map(({ measure, controls, partners }) => {
    const spec = MEASURE_SPECS[measure];
    const effect = spec.minEffect;
    return {
      measure,
      sense: spec.direction === "higher" ? "higher" : "lower",
      controls,
      partners,
      ...(typeof effect === "number" && effect > 0 ? { resolution: effect } : {}),
      ...(controls.length === 0 ? { noControl: { because: NO_CONTROL_YET, until: NEXT_CONTROLS } } : {}),
    };
  });
}

/** The reasons of a skipped record that a budget stopped. Such a pair is censored. Each other skip is not work that the entry began. */
export const STOPPED: ReadonlySet<string> = new Set([OVER_BUDGET, NOT_RUN_SIZE, NOT_RUN_JOB, NOT_RUN_BASE]);

/** This function gives the family of an input from its id `<corpus>/<family>/<seed>`. An id of another form is its own family. */
export function familyOf(input: string): string {
  return input.split("/")[1] ?? input;
}

/**
 * This function gives the rows of `checkMeasures` from the records of a run.
 *
 * - The key is the input id, and it has the seed in it.
 * - A pair that a budget stopped gives a censored row of each measure. A refused or unsupported pair gives no row.
 * - The option `strata` puts the family of the input on each row.
 * - A run of a chain corpus reads only the steps with a base. So each measure compares the same steps, and step 0 stays out.
 */
export function controlRows(records: readonly BenchRecord[], strata: boolean): MeasureRow[] {
  const steps = stepInputs(records);
  const measures = readMeasures(steps).map((m) => m.measure);
  return records.flatMap((r) => {
    if (steps.size > 0 && !steps.has(r.input)) return [];
    const stratum = strata ? { stratum: familyOf(r.input) } : {};
    if (!isMeasured(r)) return STOPPED.has(r.skipped) ? measures.map((measure) => ({ measure, group: r.strategy, key: r.input, value: 0, censored: true, ...stratum })) : [];
    return measures.flatMap((measure) => {
      const value = (r.measures as Record<string, number | undefined>)[measure];
      return value !== undefined && Number.isFinite(value) ? [{ measure, group: r.strategy, key: r.input, value, ...stratum }] : [];
    });
  });
}

/** The result of `controlRead`: the two reads of one set of records. */
export interface ControlReadResult {
  readonly asOf: string;
  readonly pooled: MeasureChecks;
  readonly stratified: MeasureChecks;
}

/** This function reads the controls over the records of a run: once over all inputs, and once by the family of each input. */
export function controlRead(records: readonly BenchRecord[], asOf: string): ControlReadResult {
  const options = { rules: controlRules(records), controls: CONTROL_ENTRIES.map((e) => e.id), asOf };
  return { asOf, pooled: checkMeasures(controlRows(records, false), options), stratified: checkMeasures(controlRows(records, true), options) };
}

/** This function gives the line of one read: the status, the count that the control beats, the keys and the keys that a test needs. */
function readLine(scope: string, read: ControlRead): string {
  const tests = [...read.comparisons, ...read.against];
  const keys = tests.reduce((most, c) => Math.max(most, c.shared), 0);
  const needs = tests.reduce((most, c) => Math.max(most, c.needs), 0);
  return `${scope} ${read.measure} ${read.control} ${read.stratum ?? "all"}: ${read.status}, beats ${read.beatsEntries} of ${read.of} real entries, keys ${keys}, needs ${needs}`;
}

/** This function gives the lines of one check: the reads of the controls, the partners that a control loses, then the findings. */
function checkLines(scope: string, check: MeasureChecks): string[] {
  const reads = check.reads.map((r) => readLine(scope, r));
  const guards = check.measures.flatMap((m) =>
    m.guards.map((g) => `${scope} ${m.measure} ${g.control} ${g.stratum ?? "all"} partners: ${g.partners.map((p) => `${p.partner} ${p.status}`).join(", ") || "none"}`),
  );
  const findings = check.findings.map((f) => `${scope} finding ${f.kind}: ${f.text}`);
  return [...reads, ...guards, ...findings];
}

/** This function gives the text of a read. It shows the pooled result and the result by stratum, with the keys beside what a test needs. */
export function controlReadText(result: ControlReadResult): string {
  return [`The read of the controls at ${result.asOf}.`, ...checkLines("pooled", result.pooled), ...checkLines("stratum", result.stratified), ""].join("\n");
}
