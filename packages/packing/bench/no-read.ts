// The no-read lines of the gates (k203). A gate that cannot read a case does not show it as a pass.
// The check of the gate gets a warning annotation with the count, the cases and the CPU models, also on a report-only read.
//
//   node bench/no-read.ts promotion <promotion.json>
//   node bench/no-read.ts gate <gate.json>        (it also reads paired-time.json in the same folder)
//   node bench/no-read.ts budget <budget.json>
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

/** This function gives the no-read lines of a win test. A win test with the status `no read` gives one line. */
export function promotionNoRead(v: Pick<PromotionVerdict, "candidate" | "current" | "inputs" | "status" | "reason">): string[] {
  if (v.status !== "no read") return [];
  return [`The win test of ${v.candidate} against ${v.current} gives no read over ${v.inputs} inputs (${v.reason ?? "no reason"}). It is not a pass.`];
}

/**
 * This function gives the no-read lines of a time gate.
 *
 * - A run above the noise cap gives the verdict `cannot-decide`. Its line has the noise, the cap, the cases and the CPU.
 * - The time verdict of rigor-bench is a report. When it is `cannot decide`, it also gives a line.
 */
export function gateNoRead(result: Pick<GateResult, "gate" | "verdict" | "time" | "lines">, report: ReportHead | null): string[] {
  const cases = report === null ? "an unknown count of" : String(report.inputs.length);
  const cpu = report === null ? "an unknown CPU" : `the CPU ${report.env.cpu}`;
  const out: string[] = [];
  if (result.verdict === "cannot-decide") {
    const noise = result.lines.find((l) => l.measure === "aa.noise");
    const level = noise === undefined ? "" : `: the A/A noise ${noise.value.toFixed(4)} is above the cap ${noise.max === null ? "of the gate" : noise.max.toFixed(4)}`;
    out.push(`The time gate ${result.gate} gives no read${level}, over ${cases} cases on ${cpu}. The job retry decides. It is not a pass.`);
  }
  if (result.time === "cannot decide") out.push(`The time verdict of the gate ${result.gate} gives no read over ${cases} cases on ${cpu}. It is a report, and it is not a pass.`);
  return out;
}

/**
 * This function gives the no-read lines of a time budget.
 *
 * - The verdict `cannot decide` gives a line with the job count, the reasons and the CPU models. The count comes from the models, because the result has no jobs then.
 * - Jobs on more than one CPU model give a line, because the budget does not test the models.
 */
export function budgetNoRead(b: Pick<BudgetResult, "arm" | "verdict" | "reasons" | "models">): string[] {
  const jobs = (n: number): string => `${n} ${n === 1 ? "job" : "jobs"}`;
  const models = b.models.models.length === 0 ? "no CPU model" : b.models.models.map((m) => `${m.model} (${jobs(m.jobs)})`).join(", ");
  const count = b.models.models.reduce((sum, m) => sum + m.jobs, 0);
  const out: string[] = [];
  if (b.verdict === "cannot decide") {
    const reasons = b.reasons.length === 0 ? "none" : b.reasons.join(", ");
    out.push(`The time budget of ${b.arm} gives no read over ${jobs(count)}. The reasons: ${reasons}. The CPU models: ${models}. It is not a pass.`);
  }
  if (b.models.line !== null) out.push(`The time budget of ${b.arm} has jobs on ${b.models.models.length} CPU models: ${models}. ${b.models.line}.`);
  return out;
}

/** This function encodes a text for a workflow command of GitHub Actions. With `property`, it also encodes the colon and the comma. */
export function commandText(text: string, property = false): string {
  const data = text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? data.replaceAll(":", "%3A").replaceAll(",", "%2C") : data;
}

/** This function gives the warning annotation of one no-read line. */
export function warningLine(title: string, line: string): string {
  return `::warning title=${commandText(title, true)}::${commandText(line)}`;
}

/** This function gives the no-read lines of a verdict file of one kind. */
export function noReadLines(kind: NoReadKind, file: string): string[] {
  const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
  switch (kind) {
    case "promotion":
      return promotionNoRead(json(file) as PromotionVerdict);
    case "gate": {
      const beside = join(dirname(file), "paired-time.json");
      return gateNoRead(json(file) as GateResult, existsSync(beside) ? (json(beside) as ReportHead) : null);
    }
    case "budget":
      return budgetNoRead(json(file) as BudgetResult);
  }
}

/** This function starts the script and gives its exit code. A missing verdict file gives a warning: the step of the gate failed. */
export function main(argv: readonly string[]): number {
  const [kind, file] = argv;
  if (!NO_READ_KINDS.includes(kind as NoReadKind) || file === undefined) throw new RangeError(`Use: no-read.ts ${NO_READ_KINDS.join("|")} <verdict file>`);
  const title = `no read (${kind})`;
  if (!existsSync(file)) {
    console.log(warningLine(title, `The verdict file ${file} is missing, so the gate has no read.`));
    return 0;
  }
  const lines = noReadLines(kind as NoReadKind, file);
  for (const line of lines) console.log(warningLine(title, line));
  if (lines.length === 0) console.log(`The ${kind} verdict has no no-read line.`);
  return 0;
}

if (process.argv[1]?.endsWith("no-read.ts") === true) process.exitCode = main(process.argv.slice(2));
