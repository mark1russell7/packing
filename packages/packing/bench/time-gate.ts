// A time gate on a paired time test (`paired-time.ts`). The gate record gives its limits and their derivation.
//
// A limit comes from 5 CI runs of the same test or more. The gate refuses a report that is not of its test.
// - The old rule (STRATEGY.md 1e10f489): the limit is the worst value times 1 plus the margin.
// - The rule of the gate limits: the limit is the worst value plus the spread (max - min) of the values, rounded down to 4 decimals.

import { aaId, quantileOf, warmInputs, type PairedInput, type PairedReport } from "./paired-time.ts";

/**
 * A measure of a paired time test over the inputs.
 *
 * - `median` and `q95`: the median or the q95 of the ratio arm / base.
 * - `sum-median` (k130): the median of the time of the arm over the sum of the times of the `members` of the gate.
 */
export type GateMeasure = "median" | "q95" | "sum-median";

/**
 * The derivation of a limit: the values of the runs and the worst value.
 *
 * - With `margin`, the limit is `worst * (1 + margin)`.
 * - With `spread`, the spread is max - min of the values, and the limit is `worst + spread`, rounded down to 4 decimals.
 */
export interface GateDerivation {
  runs: string[];
  cpus: string[];
  values: number[];
  worst: number;
  margin?: number;
  spread?: number;
}

/** A check of a time gate: the measure of the arm is at most `max`. */
export interface GateCheck {
  measure: GateMeasure;
  max: number;
  derivation: GateDerivation;
  /** When `true`, the measure uses only the steady inputs (the field `steady` of the gate). */
  steady?: boolean;
}

/** A measure that the gate only reports, with the reason that it does not gate. */
export interface GateReportOnly {
  measure: GateMeasure;
  values: number[];
  why: string;
  /** When `true`, the measure uses only the steady inputs (the field `steady` of the gate). */
  steady?: boolean;
}

/** A time gate of one candidate against its base on one corpus (schema `packing-time-gate/1`). */
export interface TimeGate {
  schema: "packing-time-gate/1";
  id: string;
  item: string;
  rule: string;
  corpus: string;
  mode: PairedReport["mode"];
  base: string;
  arm: string;
  /** The A/A median of a report is in `[1 - aaMedian, 1 + aaMedian]`, or the report does not gate. */
  aaMedian: number;
  /** When `true`, the A/A band p10 to p90 of a report contains 1, or the report does not gate. */
  aaBand?: boolean;
  /** The filter `--only` of the run. A gate without it takes only a run of all the inputs. */
  only?: string;
  /** The untimed passes of each child of mode `fresh`. A report with another count does not gate. */
  warmup?: number;
  /** The timed passes of each child of mode `fresh`. A report with another count does not gate. */
  passes?: number;
  /** The arms of the measure `sum-median` */
  members?: string[];
  /** The arms of the warm rule. The steady inputs have the warm value of each of these arms in the A/A band. */
  steady?: string[];
  checks: GateCheck[];
  reports: GateReportOnly[];
  /** The A/A spread of the 5 runs, for the record */
  aa: { median: number[]; p10: number[]; p90: number[] };
}

/** A line of the result: a measure, its value, its limit (or `null` for a report) and its result. */
export interface GateLine {
  measure: GateMeasure | "aa.median" | "steady.inputs";
  /** `true` for a measure on the steady inputs only */
  steady?: boolean;
  value: number;
  max: number | null;
  pass: boolean;
}

/** The result of a time gate on one report. */
export interface GateResult {
  gate: string;
  pass: boolean;
  /** The reasons that the report is not of the test of the gate. A report with a reason does not pass. */
  refused: string[];
  lines: GateLine[];
}

/** This function gives the inputs of a measure. With `steady`, it gives only the inputs with each arm of `steady` warm. */
export function gateInputs(report: PairedReport, gate: Pick<TimeGate, "steady">): PairedInput[] {
  return gate.steady === undefined ? report.inputs : warmInputs(report, gate.steady);
}

/** This function gives a measure of the arm in a report. With `steady`, it uses only the steady inputs. `members` are the arms of `sum-median`. */
export function gateValue(report: PairedReport, arm: string, measure: GateMeasure, gate: Pick<TimeGate, "steady" | "members"> = {}): number {
  if (measure === "median" && gate.steady === undefined) return report.ratios[arm]?.median ?? Number.NaN;
  const inputs = gateInputs(report, gate);
  if (measure === "sum-median") {
    const members = gate.members ?? [];
    const sums = inputs.map((i) => {
      const t = i.median[arm];
      const parts = members.map((id) => i.median[id]);
      if (t === undefined || members.length === 0 || parts.some((p) => p === undefined)) return Number.NaN;
      return t / parts.reduce<number>((s, p) => s + (p ?? 0), 0);
    });
    return sums.some(Number.isNaN) ? Number.NaN : quantileOf(sums, 0.5);
  }
  const ratios = inputs.map((i) => i.ratio[arm]).filter((x): x is number => x !== undefined);
  return quantileOf(ratios, measure === "median" ? 0.5 : 0.95);
}

/** This function gives the options of `gateValue` for one check or report of a gate. */
function entryOptions(gate: TimeGate, entry: { steady?: boolean }): Pick<TimeGate, "steady" | "members"> {
  return { ...(gate.members !== undefined ? { members: gate.members } : {}), ...(entry.steady === true && gate.steady !== undefined ? { steady: gate.steady } : {}) };
}

/** This function examines the shape of a gate record and throws a `TypeError` on a break. */
export function parseTimeGate(text: string): TimeGate {
  const gate = JSON.parse(text) as TimeGate;
  if (gate.schema !== "packing-time-gate/1") throw new TypeError(`A time gate has the schema packing-time-gate/1, not "${String(gate.schema)}".`);
  for (const c of gate.checks) {
    const d = c.derivation;
    if (d.values.length < 5) throw new TypeError(`The limit of ${c.measure} needs 5 runs or more, not ${d.values.length}.`);
    const worst = Math.max(...d.values);
    if (worst !== d.worst) throw new TypeError(`The worst value of ${c.measure} is ${worst}, not ${d.worst}.`);
    if ((d.margin === undefined) === (d.spread === undefined)) throw new TypeError(`The derivation of ${c.measure} has a margin or a spread, not both or none.`);
    if (d.margin !== undefined) {
      if (Math.abs(c.max - Math.round(d.worst * (1 + d.margin) * 1e4) / 1e4) > 1e-9) throw new TypeError(`The limit of ${c.measure} is not its worst value times ${1 + d.margin}.`);
    } else {
      const spread = worst - Math.min(...d.values);
      if (Math.abs(spread - d.spread!) > 1e-9) throw new TypeError(`The spread of ${c.measure} is ${spread}, not ${d.spread}.`);
      if (Math.abs(c.max - Math.floor((worst + spread) * 1e4 + 1e-9) / 1e4) > 1e-9) throw new TypeError(`The limit of ${c.measure} is not its worst value plus its spread.`);
    }
  }
  for (const e of [...gate.checks, ...gate.reports]) {
    if (e.measure === "sum-median" && (gate.members ?? []).length === 0) throw new TypeError("The measure sum-median needs the members of the gate.");
    if (e.steady === true && gate.steady === undefined) throw new TypeError(`The steady measure ${e.measure} needs the arms of the warm rule (the field steady of the gate).`);
  }
  return gate;
}

/** This function applies a time gate to a paired report, the corpus of its run, its filter `--only` and its warm-up. A refused report does not pass. */
export function checkTimeGate(gate: TimeGate, report: PairedReport, corpus: string, only?: string, warmup?: number): GateResult {
  const refused: string[] = [];
  if (only !== gate.only) refused.push(only === undefined ? `the run uses all the inputs, not only the inputs with ${gate.only} in their id` : `the run uses only the inputs with ${only} in their id`);
  if (gate.warmup !== undefined && warmup !== gate.warmup) refused.push(`the warm-up is ${String(warmup)}, not ${gate.warmup}`);
  if (gate.passes !== undefined && report.passes !== gate.passes) refused.push(`the timed passes are ${String(report.passes)}, not ${gate.passes}`);
  if (gate.steady !== undefined && report.warm === undefined) refused.push("the report has no warm check");
  if (corpus !== gate.corpus) refused.push(`the corpus is ${corpus}, not ${gate.corpus}`);
  if (report.mode !== gate.mode) refused.push(`the mode is ${report.mode}, not ${gate.mode}`);
  if (report.base !== gate.base) refused.push(`the base is ${report.base}, not ${gate.base}`);
  if (!report.arms.includes(gate.arm)) refused.push(`the report has no arm ${gate.arm}`);
  const lines: GateLine[] = [];
  if (report.noiseFloor === null || !report.arms.includes(aaId(gate.base))) refused.push("the report has no A/A arm");
  else {
    const value = report.noiseFloor.median;
    const pass = Math.abs(value - 1) <= gate.aaMedian;
    lines.push({ measure: "aa.median", value, max: 1 + gate.aaMedian, pass });
    if (!pass) refused.push(`the A/A median ${value} is outside 1 ± ${gate.aaMedian}`);
    const { p10, p90 } = report.noiseFloor;
    if (gate.aaBand === true && !(p10 <= 1 && p90 >= 1)) refused.push(`the A/A band ${p10} to ${p90} does not contain 1`);
  }
  if (gate.steady !== undefined) lines.push({ measure: "steady.inputs", value: gateInputs(report, gate).length, max: null, pass: true });
  const tag = (e: { steady?: boolean }): { steady?: boolean } => (e.steady === true ? { steady: true } : {});
  for (const c of gate.checks) {
    const value = gateValue(report, gate.arm, c.measure, entryOptions(gate, c));
    lines.push({ measure: c.measure, ...tag(c), value, max: c.max, pass: value <= c.max });
  }
  for (const r of gate.reports) lines.push({ measure: r.measure, ...tag(r), value: gateValue(report, gate.arm, r.measure, entryOptions(gate, r)), max: null, pass: true });
  return { gate: gate.id, pass: refused.length === 0 && lines.every((l) => l.pass), refused, lines };
}

/** This function writes the result of a time gate as Markdown. */
export function gateMarkdown(result: GateResult): string {
  const rows = result.lines.map((l) => `| ${l.measure}${l.steady === true ? " (steady)" : ""} | ${l.measure === "steady.inputs" ? String(l.value) : l.value.toFixed(4)} | ${l.max === null ? "report" : l.max.toFixed(4)} | ${l.max === null ? "-" : l.pass ? "pass" : "fail"} |`);
  const refused = result.refused.length === 0 ? [] : ["", `The gate refuses the report: ${result.refused.join(", ")}.`];
  return [`## The time gate ${result.gate}: ${result.pass ? "pass" : "fail"}`, "", "| Measure | Value | Limit | Result |", "| --- | --- | --- | --- |", ...rows, ...refused, ""].join("\n");
}
