// The no-read lines of the gates (k203, k205). A gate that cannot read a case does not show it as a pass.
// The check of the gate gets a warning annotation and a line of the step summary, also on a report-only read.
// The lines come from `gateLine` and `writeGateLine` of rigor-bench. This module only reads the verdict files of packing.
//
//   node bench/no-read.ts promotion <promotion.json>
//   node bench/no-read.ts gate <gate.json>        (it also reads paired-time.json in the same folder)
//   node bench/no-read.ts budget <budget.json>
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gateLine, isNoRead, writeGateLine, type CaseRead, type GateLine, type GateLineOutputs, type JobModel } from "@mark1russell7/rigor-bench";
import type { PromotionVerdict } from "./promote.ts";
import type { GateResult } from "./time-gate.ts";
import type { BudgetResult } from "./time-budget.ts";

/** The kinds of verdict files that the script reads. */
export const NO_READ_KINDS = ["promotion", "gate", "budget"] as const;

/** The kind of a verdict file. */
export type NoReadKind = (typeof NO_READ_KINDS)[number];

/** The fields of a paired report that a gate line reads: the CPU of the runner and the inputs. */
export interface ReportHead {
  env: { cpu: string };
  inputs: readonly unknown[];
}

/** The case of the CPU models of a time budget. The budget does not test the models, so jobs on more than one model are a no-read of this case. */
export const MODELS_CASE = "the CPU models";

/** This function gives the line of a win test. Only the status `no read` gives a line. A fail decides the check of the job. */
export function promotionNoRead(v: Pick<PromotionVerdict, "candidate" | "current" | "inputs" | "status" | "reason">): GateLine | undefined {
  const reads: CaseRead[] = [{ case: `${v.candidate} against ${v.current}`, outcome: v.status === "no read" ? "no read" : "pass" }];
  return gateLine(reads, { title: `The win test over ${v.inputs} inputs`, reason: v.reason ?? "no reason" });
}

/**
 * This function gives the lines of a time gate. The job of the gate is on one runner, so the models are one job on its CPU.
 *
 * - A run above the noise cap gives the verdict `cannot-decide`. Its line has the noise, the cap and the count of the cases.
 * - The time verdict of rigor-bench is a report. Only its no-read gives a line: its `slower` does not decide the gate.
 */
export function gateNoRead(result: Pick<GateResult, "gate" | "verdict" | "time" | "lines">, report: ReportHead | null): GateLine[] {
  const cases = report === null ? "an unknown count of cases" : `${report.inputs.length} cases`;
  const models: readonly JobModel[] | undefined = report === null ? undefined : [{ model: report.env.cpu, jobs: 1 }];
  const out: GateLine[] = [];
  if (result.verdict === "cannot-decide") {
    const noise = result.lines.find((l) => l.measure === "aa.noise");
    const cap = noise?.max == null ? "the cap of the gate" : `the cap ${noise.max.toFixed(4)}`;
    const level = noise === undefined ? "The gate cannot decide" : `The A/A noise ${noise.value.toFixed(4)} is above ${cap}`;
    const line = gateLine([{ case: result.gate, outcome: "cannot decide" }], { title: `The time gate ${result.gate}`, reason: `${level}, over ${cases}. The job retry decides`, ...(models === undefined ? {} : { models }) });
    if (line !== undefined) out.push(line);
  }
  if (result.time !== null && isNoRead(result.time)) {
    const line = gateLine([{ case: result.gate, outcome: result.time }], { title: `The time verdict of the gate ${result.gate}`, reason: `A report over ${cases}`, ...(models === undefined ? {} : { models }) });
    if (line !== undefined) out.push(line);
  }
  return out;
}

/**
 * This function gives the line of a time budget, with the jobs on each CPU model.
 *
 * - The verdict `cannot decide` is a no-read of the arm, with the reasons of the budget.
 * - Jobs on more than one CPU model are a no-read of the case `MODELS_CASE`, also on a decided verdict. The budget does not test the models.
 */
export function budgetNoRead(b: Pick<BudgetResult, "arm" | "verdict" | "reasons" | "models">): GateLine | undefined {
  const reads: CaseRead[] = [{ case: b.arm, outcome: b.verdict }];
  if (b.models.line !== null) reads.push({ case: MODELS_CASE, outcome: "cannot decide" });
  const reasons = [...b.reasons, ...(b.models.line === null ? [] : [b.models.line])];
  return gateLine(reads, { title: `The time budget of ${b.arm}`, ...(reasons.length === 0 ? {} : { reason: reasons.join(", ") }), models: b.models.models });
}

/** This function gives the lines of a verdict file of one kind. A missing file gives a no-read with no cases: the step of the gate failed. */
export function noReadLines(kind: NoReadKind, file: string): GateLine[] {
  if (!existsSync(file)) {
    const line = gateLine([], { title: `The ${kind} verdict`, reason: `The verdict file ${file} is missing` });
    return line === undefined ? [] : [line];
  }
  const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
  const one = (line: GateLine | undefined): GateLine[] => (line === undefined ? [] : [line]);
  switch (kind) {
    case "promotion":
      return one(promotionNoRead(json(file) as PromotionVerdict));
    case "gate": {
      const beside = join(dirname(file), "paired-time.json");
      return gateNoRead(json(file) as GateResult, existsSync(beside) ? (json(beside) as ReportHead) : null);
    }
    case "budget":
      return one(budgetNoRead(json(file) as BudgetResult));
  }
}

/** This function starts the script and gives its exit code. Each line goes to the log as a warning and to the step summary. */
export function main(argv: readonly string[], outputs?: GateLineOutputs): number {
  const [kind, file] = argv;
  if (!NO_READ_KINDS.includes(kind as NoReadKind) || file === undefined) throw new RangeError(`Use: no-read.ts ${NO_READ_KINDS.join("|")} <verdict file>`);
  const lines = noReadLines(kind as NoReadKind, file);
  for (const line of lines) writeGateLine(line, outputs);
  if (lines.length === 0) (outputs?.log ?? console.log)(`The ${kind} verdict has no no-read line.`);
  return 0;
}

if (process.argv[1]?.endsWith("no-read.ts") === true) process.exitCode = main(process.argv.slice(2));
