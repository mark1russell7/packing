// The smoke check of each pull request (`docs/BENCH.md`). The workflow `bench-smoke.yml` starts it with `main.ts check`.
// It reads `run.json` and `records.jsonl` of a run on `smoke-v1`. It reads no time, because the times of CI are not a gate.

import { round3 } from "@mark1russell7/packing";
import { isMeasured, type BenchRecord, type BenchRun } from "./run.ts";

/** The strategies that pack each input of `smoke-v1`. The check needs the coverage 1 for each of them. */
export const FULL_COVERAGE: readonly string[] = ["rows", "shelf", "skyline"];

/** One row of the coverage table: the coverage of one strategy in `run.json`. */
export interface SmokeRow {
  strategy: string;
  measured: number;
  inputs: number;
  coverage: number;
  /** The value `true` when the check needs the coverage 1 for this strategy. */
  full: boolean;
}

/** The result of the smoke check. A result with no failures is a pass. */
export interface SmokeResult {
  failures: string[];
  rows: SmokeRow[];
}

/** This function reads a JSON Lines file of records. An empty line is not a record. */
export function parseRecords(text: string): BenchRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as BenchRecord);
}

/**
 * This function checks a run of the smoke corpus. It gives one failure for each of these conditions:
 *
 * - The run has an error, or it has no records.
 * - A measured record has a hard break, or it is not deterministic.
 * - A strategy has no coverage in the run, or its coverage does not agree with its records.
 * - A strategy of `full` has a coverage below 1, or the run does not have that strategy.
 */
export function smokeCheck(run: BenchRun, records: readonly BenchRecord[], full: readonly string[] = FULL_COVERAGE): SmokeResult {
  const failures: string[] = [];
  if (records.length === 0) failures.push("The file records.jsonl has no records.");
  for (const e of run.errors) failures.push(`The strategy ${e.strategy} has an error on ${e.input}: ${e.message}`);
  for (const r of records.filter(isMeasured)) {
    const breaks = Object.entries(r.hard).filter(([, n]) => n > 0);
    if (breaks.length > 0) failures.push(`The record of ${r.strategy} on ${r.input} has hard breaks: ${JSON.stringify(Object.fromEntries(breaks))}.`);
    if (!r.deterministic) failures.push(`The record of ${r.strategy} on ${r.input} is not deterministic.`);
  }

  const rows: SmokeRow[] = [];
  for (const id of run.strategies) {
    const c = run.coverage?.[id];
    if (c === undefined) {
      failures.push(`The file run.json has no coverage for ${id}.`);
      continue;
    }
    // The records and the errors of the strategy count the inputs. Only the measured records count as packed.
    const own = records.filter((r) => r.strategy === id);
    const measured = new Set(own.filter(isMeasured).map((r) => r.input)).size;
    const inputs = new Set([...own.map((r) => r.input), ...run.errors.filter((e) => e.strategy === id).map((e) => e.input)]).size;
    const coverage = inputs === 0 ? 0 : round3(measured / inputs);
    if (c.measured !== measured || c.inputs !== inputs || c.coverage !== coverage) {
      failures.push(`The coverage of ${id} in run.json is ${c.measured}/${c.inputs} (${c.coverage}), but the records give ${measured}/${inputs} (${coverage}).`);
    }
    const needsFull = full.includes(id);
    if (needsFull && c.coverage < 1) failures.push(`The coverage of ${id} is ${c.coverage}, not 1.`);
    rows.push({ strategy: id, measured: c.measured, inputs: c.inputs, coverage: c.coverage, full: needsFull });
  }
  for (const id of full) if (!run.strategies.includes(id)) failures.push(`The run does not have the strategy ${id}.`);
  return { failures, rows };
}

/** This function writes a result as Markdown: the coverage table, and then the failures or one line for a pass. */
export function smokeMarkdown(result: SmokeResult): string {
  const lines = ["## The smoke check", "", "| strategy | measured | inputs | coverage | gate |", "|---|---:|---:|---:|---|"];
  for (const r of result.rows) lines.push(`| ${r.strategy} | ${r.measured} | ${r.inputs} | ${r.coverage} | ${r.full ? "1" : "none"} |`);
  lines.push("");
  if (result.failures.length === 0) {
    lines.push("The check passed. The run has no errors and no hard breaks, each record is deterministic, and the coverage agrees with the records.");
  } else {
    lines.push(`The check found ${result.failures.length} failures:`, "", ...result.failures.map((f) => `- ${f.replaceAll("|", "\\|")}`));
  }
  return `${lines.join("\n")}\n`;
}
