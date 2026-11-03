// A time gate on a paired time test (`paired-time.ts`). The gate record gives its limits and their derivation.
//
// A limit comes from 5 CI runs of the same test or more. The gate refuses a report that is not of its test.
// The rule of the gate limits (STRATEGY.md, 2026-11-02): the limit is the worst value plus the spread (max - min) of the values, rounded up to 4 decimals.
// A run is valid only when its A/A band p10 to p90 contains 1. No limit uses a fixed factor or a fixed A/A tolerance.

import { aaId, quantileOf, warmInputs, type PairedInput, type PairedReport } from "./paired-time.ts";

/**
 * A measure of a paired time test over the inputs.
 *
 * - `median` and `q95`: the median or the q95 of the ratio arm / base.
 * - `sum-median` (k130): the median of the time of the arm over the sum of the times of the `members` of the gate.
 */
export type GateMeasure = "median" | "q95" | "sum-median";

/** The derivation of a limit: the values of the runs, the worst value and the spread (max - min). The limit is `spreadLimit(values)`. */
export interface GateDerivation {
  runs: string[];
  cpus: string[];
  values: number[];
  worst: number;
  spread: number;
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

/**
 * A time gate of one candidate against its base on one corpus (schema `packing-time-gate/2`).
 *
 * The A/A band p10 to p90 of a report contains 1, or the report does not gate. Schema 1 had a fixed A/A tolerance `aaMedian` and the margin rule.
 */
export interface TimeGate {
  schema: "packing-time-gate/2";
  id: string;
  item: string;
  rule: string;
  corpus: string;
  mode: PairedReport["mode"];
  base: string;
  arm: string;
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
  /** The A/A band of each run of the derivation */
  aa: { median: number[]; p10: number[]; p90: number[] };
  /** The noise cap. A run with an A/A spread above the cap cannot decide. */
  noise: GateNoise;
}

/**
 * The noise cap of a gate (strategist 2026-11-03). The A/A spread of a run is its A/A p90 minus its A/A p10.
 *
 * `quiet` is the median of the A/A spreads of the derivation runs. `cap` is `factor` times `quiet`, rounded up to 4 decimals.
 */
export interface GateNoise {
  factor: number;
  spreads: number[];
  quiet: number;
  cap: number;
}

/** The verdict of a gate. A run above the noise cap cannot decide: the gate starts one more run on a fresh runner. */
export type GateVerdict = "pass" | "fail" | "cannot-decide";

/** A line of the result: a measure, its value, its limit (or `null` for a report) and its result. */
export interface GateLine {
  measure: GateMeasure | "aa.median" | "aa.spread" | "steady.inputs";
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
  verdict: GateVerdict;
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

/**
 * This function gives the limit of the rule of the gate limits: the worst value plus the spread (max - min), rounded up to `digits` decimals.
 *
 * The rounding goes away from the data. A limit rounded down can fail a value of its own record.
 */
export function spreadLimit(values: readonly number[], digits = 4): number {
  const worst = Math.max(...values);
  const scale = 10 ** digits;
  return Math.ceil((2 * worst - Math.min(...values)) * scale - 1e-9) / scale;
}

/** This function gives the noise cap of the A/A bands of the derivation runs: `factor` times the median A/A spread, rounded up to `digits` decimals. */
export function noiseCap(aa: TimeGate["aa"], factor = 3, digits = 4): GateNoise {
  const spreads = aa.p90.map((hi, i) => roundTo(hi - (aa.p10[i] ?? Number.NaN), 6));
  const quiet = roundTo(quantileOf(spreads, 0.5), 6);
  const scale = 10 ** digits;
  return { factor, spreads, quiet, cap: Math.ceil(factor * quiet * scale - 1e-9) / scale };
}

/** This function rounds `x` to `digits` decimals. */
function roundTo(x: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(x * scale) / scale;
}

/** This function gives the options of `gateValue` for one check or report of a gate. */
function entryOptions(gate: TimeGate, entry: { steady?: boolean }): Pick<TimeGate, "steady" | "members"> {
  return { ...(gate.members !== undefined ? { members: gate.members } : {}), ...(entry.steady === true && gate.steady !== undefined ? { steady: gate.steady } : {}) };
}

/** This function examines the shape of a gate record and throws a `TypeError` on a break. */
export function parseTimeGate(text: string): TimeGate {
  const gate = JSON.parse(text) as TimeGate;
  if (gate.schema !== "packing-time-gate/2") throw new TypeError(`A time gate has the schema packing-time-gate/2, not "${String(gate.schema)}".`);
  for (const c of gate.checks) {
    const d = c.derivation;
    if (d.values.length < 5) throw new TypeError(`The limit of ${c.measure} needs 5 runs or more, not ${d.values.length}.`);
    const worst = Math.max(...d.values);
    if (worst !== d.worst) throw new TypeError(`The worst value of ${c.measure} is ${worst}, not ${d.worst}.`);
    if (typeof d.spread !== "number") throw new TypeError(`The derivation of ${c.measure} has no spread.`);
    const spread = worst - Math.min(...d.values);
    if (Math.abs(spread - d.spread) > 1e-9) throw new TypeError(`The spread of ${c.measure} is ${spread}, not ${d.spread}.`);
    if (Math.abs(c.max - spreadLimit(d.values)) > 1e-9) throw new TypeError(`The limit of ${c.measure} is not its worst value plus its spread.`);
  }
  if (gate.noise === undefined) throw new TypeError("A time gate has a noise cap (the field noise).");
  const noise = noiseCap(gate.aa, gate.noise.factor);
  if (JSON.stringify(noise) !== JSON.stringify(gate.noise)) throw new TypeError(`The noise cap is not ${gate.noise.factor} times the median A/A spread of the runs: ${JSON.stringify(noise)}.`);
  for (const e of [...gate.checks, ...gate.reports]) {
    if (e.measure === "sum-median" && (gate.members ?? []).length === 0) throw new TypeError("The measure sum-median needs the members of the gate.");
    if (e.steady === true && gate.steady === undefined) throw new TypeError(`The steady measure ${e.measure} needs the arms of the warm rule (the field steady of the gate).`);
  }
  return gate;
}

/**
 * This function applies a time gate to a paired report, the corpus of its run, its filter `--only` and its warm-up. A refused report does not pass.
 *
 * A report with an A/A spread above the noise cap cannot decide. With `retry`, it is the second run, and a noisy report fails.
 */
export function checkTimeGate(gate: TimeGate, report: PairedReport, corpus: string, only?: string, warmup?: number, retry = false): GateResult {
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
  let noisy = false;
  if (report.noiseFloor === null || !report.arms.includes(aaId(gate.base))) refused.push("the report has no A/A arm");
  else {
    const { median, p10, p90 } = report.noiseFloor;
    lines.push({ measure: "aa.median", value: median, max: null, pass: true });
    const spread = roundTo(p90 - p10, 6);
    noisy = spread > gate.noise.cap;
    lines.push({ measure: "aa.spread", value: spread, max: gate.noise.cap, pass: !noisy });
    if (!(p10 <= 1 && p90 >= 1)) refused.push(`the A/A band ${p10} to ${p90} does not contain 1`);
  }
  if (gate.steady !== undefined) lines.push({ measure: "steady.inputs", value: gateInputs(report, gate).length, max: null, pass: true });
  const tag = (e: { steady?: boolean }): { steady?: boolean } => (e.steady === true ? { steady: true } : {});
  for (const c of gate.checks) {
    const value = gateValue(report, gate.arm, c.measure, entryOptions(gate, c));
    lines.push({ measure: c.measure, ...tag(c), value, max: c.max, pass: value <= c.max });
  }
  for (const r of gate.reports) lines.push({ measure: r.measure, ...tag(r), value: gateValue(report, gate.arm, r.measure, entryOptions(gate, r)), max: null, pass: true });
  const pass = refused.length === 0 && lines.every((l) => l.pass);
  const verdict: GateVerdict = pass ? "pass" : noisy && !retry && refused.length === 0 ? "cannot-decide" : "fail";
  return { gate: gate.id, pass, verdict, refused, lines };
}

/** This function writes the result of a time gate as Markdown. */
export function gateMarkdown(result: GateResult): string {
  const rows = result.lines.map((l) => `| ${l.measure}${l.steady === true ? " (steady)" : ""} | ${l.measure === "steady.inputs" ? String(l.value) : l.value.toFixed(4)} | ${l.max === null ? "report" : l.max.toFixed(4)} | ${l.max === null ? "-" : l.pass ? "pass" : "fail"} |`);
  const refused = result.refused.length === 0 ? [] : ["", `The gate refuses the report: ${result.refused.join(", ")}.`];
  const noisy = result.verdict === "cannot-decide" ? ["", "The A/A spread of the run is above the noise cap. The gate starts one more run on a fresh runner."] : [];
  return [`## The time gate ${result.gate}: ${result.verdict}`,"", "| Measure | Value | Limit | Result |", "| --- | --- | --- | --- |", ...rows, ...refused, ...noisy, ""].join("\n");
}
