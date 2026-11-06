// The replay of the widths that `fill-trick` chose (k154). A record of a run does not hold the chosen width (k178 adds it).
//
//   node bench/main.ts fill-widths --out <file> [--runs <corpus>=<run id>,...] <run dir>...
//
// The command packs `fill-trick` again on each input of each run, and compares `pack.area` and `outputHash` with the record.
// A difference stops the command. The file holds the member and the width of each input, and its test fails on a drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, measure, roundMeasures, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import { FILL_TRICK, fillTrickChoice } from "./controls.ts";
import { isMeasured, outputHash, type BenchRecord } from "./run.ts";
import { parseRecords } from "./smoke-check.ts";

/** The choice of `fill-trick` on one input. */
export interface FillWidthRow {
  readonly id: string;
  /** The id of the member that gave the output. */
  readonly member: string;
  /** The width that the member packed at. `null` is the container of the input. */
  readonly width: number | null;
  /** The value `pack.area` of the output, with the rounding of a record. */
  readonly area: number;
  readonly outputHash: string;
}

/** A set of inputs: the corpus and its specs, as the corpus file of the run gives them. */
export interface FillWidthSet {
  readonly corpus: string;
  readonly specs: readonly CorpusSpec[];
}

/** The file of the replay. */
export interface FillWidths {
  readonly schema: "fill-trick-widths/1";
  /** The commit of the records that the replay matched. */
  readonly commit: string;
  /** The run of each corpus. `null` is a run with no id given. */
  readonly runs: readonly { readonly corpus: string; readonly run: number | null }[];
  readonly sets: readonly FillWidthSet[];
  readonly inputs: readonly FillWidthRow[];
}

/** This function packs `fill-trick` on each input of a set. It gives the member, the width, `pack.area` and `outputHash` of each input. */
export function fillWidthRows(set: FillWidthSet): FillWidthRow[] {
  return corpus(set.corpus, set.specs).inputs.map((file) => {
    const input = toPackInput(file);
    const choice = fillTrickChoice(input, file.seed);
    const area = roundMeasures({ "pack.area": measure(input, choice.output)["pack.area"] })["pack.area"]!;
    return { id: file.id, member: choice.member, width: choice.width, area, outputHash: outputHash(choice.output) };
  });
}

/** This function gives each difference from the records of `fill-trick`: a missing record, another `pack.area` or another `outputHash`. */
export function recordDifferences(rows: readonly FillWidthRow[], records: readonly BenchRecord[]): string[] {
  const own = new Map(records.filter((r) => r.strategy === FILL_TRICK && isMeasured(r)).map((r) => [r.input, r] as const));
  const out: string[] = [];
  for (const row of rows) {
    const r = own.get(row.id);
    if (r === undefined || !isMeasured(r)) {
      out.push(`${row.id}: no measured record of ${FILL_TRICK}`);
      continue;
    }
    const area = (r.measures as Record<string, number | undefined>)["pack.area"];
    if (area !== row.area) out.push(`${row.id}: pack.area ${row.area}, record ${area}`);
    if (r.outputHash !== row.outputHash) out.push(`${row.id}: outputHash ${row.outputHash}, record ${r.outputHash}`);
  }
  if (own.size !== rows.length) out.push(`${own.size} measured records of ${FILL_TRICK}, ${rows.length} inputs`);
  return out;
}

/** This function gives each input where the code at this time chooses another member or width, or gives another output. */
export function driftOf(stored: readonly FillWidthRow[], fresh: readonly FillWidthRow[]): string[] {
  const out: string[] = [];
  if (stored.length !== fresh.length) out.push(`${stored.length} stored rows, ${fresh.length} inputs`);
  const byId = new Map(fresh.map((row) => [row.id, row] as const));
  for (const row of stored) {
    const now = byId.get(row.id);
    if (now === undefined) out.push(`${row.id}: no input`);
    else if (now.member !== row.member || now.width !== row.width || now.area !== row.area || now.outputHash !== row.outputHash) {
      out.push(`${row.id}: ${row.member} at ${row.width} (${row.outputHash}), now ${now.member} at ${now.width} (${now.outputHash})`);
    }
  }
  return out;
}

/** This function reads the runs and replays each one. A run folder holds `corpus.json`, `records.jsonl` and `run.json`. */
export function fillWidthsOfRuns(dirs: readonly string[], runs: readonly string[]): { file: FillWidths; differences: string[] } {
  const ids = new Map(runs.map((pair) => {
    const [name, id] = pair.split("=");
    if (name === undefined || id === undefined || !/^\d+$/.test(id)) throw new Error(`Each run must be <corpus>=<run id>, not '${pair}'.`);
    return [name, Number(id)] as const;
  }));
  const commits = new Set<string>();
  const sets: FillWidthSet[] = [];
  const inputs: FillWidthRow[] = [];
  const differences: string[] = [];
  for (const dir of dirs) {
    const c = JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8")) as FillWidthSet;
    const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as { commit?: string };
    if (run.commit !== undefined) commits.add(run.commit);
    const set = { corpus: c.corpus, specs: c.specs };
    const rows = fillWidthRows(set);
    differences.push(...recordDifferences(rows, parseRecords(readFileSync(join(dir, "records.jsonl"), "utf8"))).map((d) => `${c.corpus} ${d}`));
    sets.push(set);
    inputs.push(...rows);
  }
  if (commits.size !== 1) differences.push(`The runs have ${commits.size} commits: ${[...commits].join(", ")}. A replay matches one commit.`);
  const file: FillWidths = {
    schema: "fill-trick-widths/1",
    commit: [...commits][0] ?? "",
    runs: sets.map((s) => ({ corpus: s.corpus, run: ids.get(s.corpus) ?? null })),
    sets,
    inputs,
  };
  return { file, differences };
}

/** This function gives the text of the file: one line for each input, so a diff shows each change. */
export function fillWidthsJson(file: FillWidths): string {
  const head = JSON.stringify({ schema: file.schema, commit: file.commit, runs: file.runs, sets: file.sets });
  return `${head.slice(0, -1)},"inputs":[\n${file.inputs.map((row) => JSON.stringify(row)).join(",\n")}\n]}\n`;
}

/** This function gives a summary of the file: for each corpus, the count of inputs by member and by a tried width or the input. */
export function fillWidthsText(file: FillWidths): string {
  const lines: string[] = [];
  for (const set of file.sets) {
    const rows = file.inputs.filter((row) => row.id.startsWith(`${set.corpus}/`));
    const count = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.member} ${row.width === null ? "on the input" : "at a tried width"}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    lines.push(`${set.corpus}: ${rows.length} inputs. ${[...count].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}
