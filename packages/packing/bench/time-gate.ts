// A time gate on a paired time test (`paired-time.ts`). The gate record gives its limits and their derivation.
//
// A limit comes from 5 CI runs of the same test or more. The gate refuses a report that is not of its test.
// The rule of the gate limits (STRATEGY.md, 2026-11-02): the limit is the worst value plus the spread (max - min) of the values, rounded up to 4 decimals.
// Schema 3 (strategist, 2026-11-03): the measures come from `@mark1russell7/rigor-bench`. Each round of an input is one record of a pair
// (base, arm), and the ratio of an input is the median of the log ratios of its rounds. So each round cancels the drift of the runner.
// The noise cap: a run with an A/A noise above 3 times the quiet noise of the derivation runs cannot decide.
// The A/A noise grows with the spread and with a shift of the A/A ratios, so the cap also replaces the rule of schema 2 that the A/A band contains 1.

import { aaBand, armOrder, caseRatios, timeVerdict, type Band, type PairedTime, type TimeOutcome } from "@mark1russell7/rigor-bench";
import { aaId, assertPairedOrder, quantileOf, warmInputs, type PairedInput, type PairedReport } from "./paired-time.ts";

/**
 * A measure of a paired time test over the inputs. The ratio of an input is the `caseRatios` ratio of its rounds.
 *
 * - `median` and `q95`: the median or the q95 over the inputs of the ratio arm / base.
 * - `sum-median` (k130): the median over the inputs of the ratio of the arm to the sum of the times of the `members` of the gate.
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
 * The noise cap of a gate. The A/A noise of a run is the half width on a log scale of its A/A band of kind `case` at `level`.
 *
 * - The level 0.8 holds 80 % of the A/A inputs, as the band p10 to p90 of schema 2.
 * - `quiet` is the median of the A/A noises of the derivation runs. `cap` is `factor` times `quiet`, rounded up to 4 decimals.
 */
export interface GateNoise {
  factor: number;
  level: number;
  quiet: number;
  cap: number;
}

/** The verdict of a gate. A run above the noise cap cannot decide: the gate starts one more run on a fresh runner. */
export type GateVerdict = "pass" | "fail" | "cannot-decide";

/**
 * A time gate of one candidate against its base on one corpus (schema `packing-time-gate/3`).
 *
 * Schema 2 had the ratio of the medians of each input and the A/A band p10 to p90. Schema 1 had a fixed A/A tolerance and the margin rule.
 */
export interface TimeGate {
  schema: "packing-time-gate/3";
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
  /** The A/A median ratio and the A/A noise of each run of the derivation */
  aa: { median: number[]; noise: number[] };
  noise: GateNoise;
}

/** A line of the result: a measure, its value, its limit (or `null` for a report) and its result. */
export interface GateLine {
  measure: GateMeasure | "aa.median" | "aa.noise" | "steady.inputs";
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
  /** The time verdict of rigor-bench for the first check: `faster`, `slower`, `same` or `cannot decide`. It is a report. */
  time: TimeOutcome | null;
  /** The reasons that the report is not of the test of the gate. A report with a reason does not pass. */
  refused: string[];
  lines: GateLine[];
}

/** This function gives the inputs of a measure. With `steady`, it gives only the inputs with each arm of `steady` warm. */
export function gateInputs(report: PairedReport, gate: Pick<TimeGate, "steady">): PairedInput[] {
  return gate.steady === undefined ? report.inputs : warmInputs(report, gate.steady);
}

/**
 * This function gives the records of rigor-bench of one pair: the base `a` against the arm `b`, one record for each input and round.
 *
 * With `members`, the time `a` of a round is the sum of the times of the members. The arm that started first comes from `armOrder`.
 */
export function pairRecords(report: PairedReport, inputs: readonly PairedInput[], arm: string, members: readonly string[] = [report.base]): PairedTime[] {
  assertPairedOrder(report);
  const at = (id: string, round: number): number => armOrder(report.arms, round).indexOf(id);
  const records: PairedTime[] = [];
  for (const input of inputs) {
    const rounds = input.ms[arm]?.length ?? 0;
    for (let round = 0; round < rounds; round++) {
      const a = members.reduce((sum, id) => sum + (input.ms[id]?.[round] ?? Number.NaN), 0);
      const first = Math.min(...members.map((id) => at(id, round))) < at(arm, round) ? "a" : "b";
      records.push({ case: input.id, round, first, a, b: input.ms[arm]![round]! });
    }
  }
  return records;
}

/** This function gives the records of a measure of the arm in a report. With `steady`, it uses only the steady inputs. */
export function gateRecords(report: PairedReport, arm: string, measure: GateMeasure, gate: Pick<TimeGate, "steady" | "members"> = {}): PairedTime[] {
  const members = measure === "sum-median" ? (gate.members ?? []) : [report.base];
  if (members.length === 0) return [];
  return pairRecords(report, gateInputs(report, gate), arm, members);
}

/** This function gives a measure of the arm in a report: the median or the q95 over the inputs of their `caseRatios` ratios. */
export function gateValue(report: PairedReport, arm: string, measure: GateMeasure, gate: Pick<TimeGate, "steady" | "members"> = {}): number {
  const records = gateRecords(report, arm, measure, gate);
  if (records.length === 0) return Number.NaN;
  const ratios = caseRatios(records).map((c) => c.ratio);
  return quantileOf(ratios, measure === "q95" ? 0.95 : 0.5);
}

/** This function gives the A/A band of kind `case` of a report at `level`, or `null` without the A/A arm. */
export function aaNoise(report: PairedReport, level: number): Band | null {
  const aa = aaId(report.base);
  if (!report.arms.includes(aa)) return null;
  return aaBand(pairRecords(report, report.inputs, aa), { kind: "case", level });
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

/** This function gives the noise cap of the A/A noises of the derivation runs: `factor` times their median, rounded up to `digits` decimals. */
export function noiseCap(noises: readonly number[], factor = 3, level = 0.8, digits = 4): GateNoise {
  const quiet = roundTo(quantileOf(noises, 0.5), 6);
  const scale = 10 ** digits;
  return { factor, level, quiet, cap: Math.ceil(factor * quiet * scale - 1e-9) / scale };
}

/** This function rounds `x` to `digits` decimals. */
export function roundTo(x: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(x * scale) / scale;
}

/** This function gives the options of `gateValue` for one check or report of a gate. */
function entryOptions(gate: TimeGate, entry: { steady?: boolean }): Pick<TimeGate, "steady" | "members"> {
  return { ...(gate.members !== undefined ? { members: gate.members } : {}), ...(entry.steady === true && gate.steady !== undefined ? { steady: gate.steady } : {}) };
}

/**
 * This function gives the values of a new gate record from the reports of its derivation runs, one report for each run.
 *
 * It keeps the settings, the reasons and the rule of `gate`, and writes the checks, the reports, the A/A facts and the noise cap.
 * A record of an older schema has no noise cap: the derivation then uses the factor 3 and the level 0.8.
 */
export function deriveTimeGate(gate: TimeGate, reports: readonly PairedReport[], runs: readonly string[]): TimeGate {
  if (reports.length !== runs.length) throw new TypeError(`The derivation has ${reports.length} reports and ${runs.length} run ids.`);
  const factor = gate.noise?.factor ?? 3;
  const level = gate.noise?.level ?? 0.8;
  const bands = reports.map((r) => aaNoise(r, level));
  if (bands.some((b) => b === null)) throw new TypeError("Each report of the derivation needs the A/A arm.");
  const values = (e: { measure: GateMeasure; steady?: boolean }): number[] => reports.map((r) => roundTo(gateValue(r, gate.arm, e.measure, entryOptions(gate, e))));
  const cpus = reports.map((r) => r.env.cpu);
  const noise = bands.map((b) => roundTo(b!.noise));
  return {
    ...gate,
    schema: "packing-time-gate/3",
    checks: gate.checks.map((c) => {
      const v = values(c);
      const worst = Math.max(...v);
      return { ...c, max: spreadLimit(v), derivation: { runs: [...runs], cpus, values: v, worst, spread: roundTo(worst - Math.min(...v)) } };
    }),
    reports: gate.reports.map((r) => ({ ...r, values: values(r) })),
    aa: { median: bands.map((b) => roundTo(b!.median)), noise },
    noise: noiseCap(noise, factor, level),
  };
}

/** This function examines the shape of a gate record and throws a `TypeError` on a break. */
export function parseTimeGate(text: string): TimeGate {
  const gate = JSON.parse(text) as TimeGate;
  if (gate.schema !== "packing-time-gate/3") throw new TypeError(`A time gate has the schema packing-time-gate/3, not "${String(gate.schema)}".`);
  for (const c of gate.checks) {
    const d = c.derivation;
    if (d.values.length < 5) throw new TypeError(`The limit of ${c.measure} needs 5 runs or more, not ${d.values.length}.`);
    if (d.runs.length !== d.values.length || d.cpus.length !== d.values.length) throw new TypeError(`The derivation of ${c.measure} needs a run id and a CPU for each value.`);
    const worst = Math.max(...d.values);
    if (worst !== d.worst) throw new TypeError(`The worst value of ${c.measure} is ${worst}, not ${d.worst}.`);
    if (typeof d.spread !== "number") throw new TypeError(`The derivation of ${c.measure} has no spread.`);
    const spread = worst - Math.min(...d.values);
    if (Math.abs(spread - d.spread) > 1e-6) throw new TypeError(`The spread of ${c.measure} is ${spread}, not ${d.spread}.`);
    if (Math.abs(c.max - spreadLimit(d.values)) > 1e-9) throw new TypeError(`The limit of ${c.measure} is not its worst value plus its spread.`);
  }
  if (gate.noise === undefined || gate.aa?.noise === undefined) throw new TypeError("A time gate has a noise cap (the field noise) and the A/A noise of each run.");
  const noise = noiseCap(gate.aa.noise, gate.noise.factor, gate.noise.level);
  if (JSON.stringify(noise) !== JSON.stringify(gate.noise)) throw new TypeError(`The noise cap is not ${gate.noise.factor} times the median A/A noise of the runs: ${JSON.stringify(noise)}.`);
  for (const e of [...gate.checks, ...gate.reports]) {
    if (e.measure === "sum-median" && (gate.members ?? []).length === 0) throw new TypeError("The measure sum-median needs the members of the gate.");
    if (e.steady === true && gate.steady === undefined) throw new TypeError(`The steady measure ${e.measure} needs the arms of the warm rule (the field steady of the gate).`);
  }
  return gate;
}

/** This function gives the measure, or the error message of rigor-bench when the records of the report break its rules. */
function measured(fn: () => number): number | string {
  try {
    return fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * This function applies a time gate to a paired report, the corpus of its run, its filter `--only` and its warm-up. A refused report does not pass.
 *
 * A report with an A/A noise above the noise cap cannot decide. With `retry`, it is the second run, and a noisy report fails.
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
  let aa: Band | null = null;
  if (!report.arms.includes(aaId(gate.base)) || report.base !== gate.base) refused.push("the report has no A/A arm");
  else {
    try {
      aa = aaNoise(report, gate.noise.level);
    } catch (error) {
      refused.push(`the A/A records break a rule of rigor-bench: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (aa !== null) {
    lines.push({ measure: "aa.median", value: roundTo(aa.median), max: null, pass: true });
    const value = roundTo(aa.noise);
    noisy = value > gate.noise.cap;
    lines.push({ measure: "aa.noise", value, max: gate.noise.cap, pass: !noisy });
  }
  if (gate.steady !== undefined) lines.push({ measure: "steady.inputs", value: gateInputs(report, gate).length, max: null, pass: true });
  const tag = (e: { steady?: boolean }): { steady?: boolean } => (e.steady === true ? { steady: true } : {});
  const add = (e: { measure: GateMeasure; steady?: boolean }, max: number | null): void => {
    const value = measured(() => gateValue(report, gate.arm, e.measure, entryOptions(gate, e)));
    if (typeof value === "string") refused.push(`the records of ${e.measure} break a rule of rigor-bench: ${value}`);
    else lines.push({ measure: e.measure, ...tag(e), value, max, pass: max === null || value <= max });
  };
  for (const c of gate.checks) add(c, c.max);
  for (const r of gate.reports) add(r, null);
  const first = gate.checks[0];
  let time: TimeOutcome | null = null;
  if (first !== undefined && aa !== null && refused.length === 0) {
    const records = gateRecords(report, gate.arm, first.measure, entryOptions(gate, first));
    time = timeVerdict(records, pairRecords(report, report.inputs, aaId(gate.base))).outcome;
  }
  const pass = refused.length === 0 && lines.every((l) => l.pass);
  // A noisy run decides nothing: not a pass, and not a fail of a measure either. Only a second noisy run fails.
  const verdict: GateVerdict = pass ? "pass" : noisy && !retry && refused.length === 0 ? "cannot-decide" : "fail";
  return { gate: gate.id, pass, verdict, time, refused, lines };
}

/** This function writes the result of a time gate as Markdown. */
export function gateMarkdown(result: GateResult): string {
  const rows = result.lines.map((l) => `| ${l.measure}${l.steady === true ? " (steady)" : ""} | ${l.measure === "steady.inputs" ? String(l.value) : l.value.toFixed(4)} | ${l.max === null ? "report" : l.max.toFixed(4)} | ${l.max === null ? "-" : l.pass ? "pass" : "fail"} |`);
  const time = result.time === null ? [] : ["", `The time verdict of rigor-bench for the arm against the base: ${result.time}.`];
  const refused = result.refused.length === 0 ? [] : ["", `The gate refuses the report: ${result.refused.join(", ")}.`];
  const noisy = result.verdict === "cannot-decide" ? ["", "The A/A noise of the run is above the noise cap. The gate starts one more run on a fresh runner."] : [];
  return [`## The time gate ${result.gate}: ${result.verdict}`, "", "| Measure | Value | Limit | Result |", "| --- | --- | --- | --- |", ...rows, ...time, ...refused, ...noisy, ""].join("\n");
}
