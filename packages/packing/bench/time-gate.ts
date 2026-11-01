// A time gate on a paired time test (`paired-time.ts`). The gate record gives its limits and their derivation (STRATEGY.md 1e10f489).
//
// A limit is the worst value of 5 CI runs of the same test, times 1 plus the margin. The gate refuses a report that is not of its test.

import { aaId, quantileOf, type PairedReport } from "./paired-time.ts";

/** A measure of a paired time test: the median or the q95 of the ratio arm / base over the inputs. */
export type GateMeasure = "median" | "q95";

/** The derivation of a limit: the values of the 5 runs, the worst value and the margin. The limit is `worst * (1 + margin)`. */
export interface GateDerivation {
  runs: string[];
  cpus: string[];
  values: number[];
  worst: number;
  margin: number;
}

/** A check of a time gate: the measure of the arm is at most `max`. */
export interface GateCheck {
  measure: GateMeasure;
  max: number;
  derivation: GateDerivation;
}

/** A measure that the gate only reports, with the reason that it does not gate. */
export interface GateReportOnly {
  measure: GateMeasure;
  values: number[];
  why: string;
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
  checks: GateCheck[];
  reports: GateReportOnly[];
  /** The A/A spread of the 5 runs, for the record */
  aa: { median: number[]; p10: number[]; p90: number[] };
}

/** A line of the result: a measure, its value, its limit (or `null` for a report) and its result. */
export interface GateLine {
  measure: GateMeasure | "aa.median";
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

/** This function gives a measure of the arm in a report. */
export function gateValue(report: PairedReport, arm: string, measure: GateMeasure): number {
  if (measure === "median") return report.ratios[arm]?.median ?? Number.NaN;
  const ratios = report.inputs.map((i) => i.ratio[arm]).filter((x): x is number => x !== undefined);
  return quantileOf(ratios, 0.95);
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
    if (Math.abs(c.max - Math.round(d.worst * (1 + d.margin) * 1e4) / 1e4) > 1e-9) throw new TypeError(`The limit of ${c.measure} is not its worst value times ${1 + d.margin}.`);
  }
  return gate;
}

/** This function applies a time gate to a paired report and the corpus of its run. A refused report does not pass. */
export function checkTimeGate(gate: TimeGate, report: PairedReport, corpus: string): GateResult {
  const refused: string[] = [];
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
  }
  for (const c of gate.checks) {
    const value = gateValue(report, gate.arm, c.measure);
    lines.push({ measure: c.measure, value, max: c.max, pass: value <= c.max });
  }
  for (const r of gate.reports) lines.push({ measure: r.measure, value: gateValue(report, gate.arm, r.measure), max: null, pass: true });
  return { gate: gate.id, pass: refused.length === 0 && lines.every((l) => l.pass), refused, lines };
}

/** This function writes the result of a time gate as Markdown. */
export function gateMarkdown(result: GateResult): string {
  const rows = result.lines.map((l) => `| ${l.measure} | ${l.value.toFixed(4)} | ${l.max === null ? "report" : l.max.toFixed(4)} | ${l.max === null ? "-" : l.pass ? "pass" : "fail"} |`);
  const refused = result.refused.length === 0 ? [] : ["", `The gate refuses the report: ${result.refused.join(", ")}.`];
  return [`## The time gate ${result.gate}: ${result.pass ? "pass" : "fail"}`, "", "| Measure | Value | Limit | Result |", "| --- | --- | --- | --- |", ...rows, ...refused, ""].join("\n");
}
