// The gate of the data files: the Pages build reads each file through the reader of the page, after the data branch lands on the folder.
// A fault names the file and the field. The build also prints each field that holds a value while its state is `not read`,
// because a whole class of rows that falls to the safe state states nothing false and so fails no check.

import { parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { regionsOf, type SolvedRule } from "./atlas-model.ts";
import { parseCorpusCover } from "./corpus-cover-model.ts";
import { parseLawCover, parseSnapshot, parseSolvedRule, type CoverageSnapshot, type GapSnapshot, type StrategySnapshot } from "./data.ts";
import { DataFileError, type DataFault } from "./data-shape.ts";
import { onOldMeasure } from "./gap-definition.ts";
import { isBudgetReason, skipCounts } from "./kpi.ts";

/** The reader of each data file. It is the reader that the page uses. */
export const DATA_READERS: Readonly<Record<string, (text: string) => unknown>> = {
  "corpus-cover.json": parseCorpusCover,
  "coverage.json": (t) => parseSnapshot(t, "coverage"),
  "gaps-pack-known-v1.json": (t) => parseSnapshot(t, "gaps"),
  "gaps-pack-select-v2.json": (t) => parseSnapshot(t, "gaps"),
  "law-cover.json": parseLawCover,
  "paired-k67.json": (t) => parseSnapshot(t, "paired"),
  "releases.json": (t) => parseSnapshot(t, "releases"),
  "response-coverage.json": (t) => {
    const parsed = parseResponseRecord(JSON.parse(t));
    if (!parsed.ok) throw new DataFileError([{ field: "the record", reason: `does not read: ${JSON.stringify(parsed).slice(0, 300)}` }]);
    return parsed.record;
  },
  "select-table.json": (t) => parseSnapshot(t, "select"),
  "solved-rule.json": parseSolvedRule,
  "strategies-pack-free-v1.json": (t) => parseSnapshot(t, "strategies"),
  "strategies-pack-screen-v1.json": (t) => parseSnapshot(t, "strategies"),
  "strategies-pack-select-v1.json": (t) => parseSnapshot(t, "strategies"),
  "strategies-pack-select-v2.json": (t) => parseSnapshot(t, "strategies"),
};

/** One fault of the gate, with its file */
export interface FileFault extends DataFault {
  readonly file: string;
}

/** The fields of one class in one file that hold a value while their state is `not read` */
export interface NotReadCount {
  readonly file: string;
  readonly what: string;
  readonly fields: number;
}

/** The result of the gate over a folder of data files */
export interface DataRead {
  readonly files: number;
  readonly faults: readonly FileFault[];
  readonly notRead: readonly NotReadCount[];
}

/** This function gives the faults of a file with its reader. */
function faultsOfFile(file: string, text: string, read: (text: string) => unknown): FileFault[] {
  try {
    read(text);
    return [];
  } catch (error) {
    if (error instanceof DataFileError) return error.faults.map((f) => ({ file, ...f }));
    return [{ file, field: "the file", reason: `does not read: ${String(error)}` }];
  }
}

/** This function gives a fault for each row of a current measure that the atlas does not read. An old run of `pack.gap` has no such fault. */
function regionFaults(file: string, snap: GapSnapshot, rule: SolvedRule): FileFault[] {
  if (onOldMeasure(snap)) return [];
  const margin = rule.margins[snap.measure];
  if (margin === undefined) return [{ file: "solved-rule.json", field: `margins.${snap.measure}`, reason: `is missing, so ${file} does not read` }];
  const faults: FileFault[] = [];
  const cellsNotRead = new Set(regionsOf(snap, rule).filter((r) => r.state === "not-read").map((r) => r.cell));
  snap.strategies.forEach((s, i) =>
    s.cells.forEach((c, j) => {
      if (!cellsNotRead.has(c.cell) || c.n === 0) return;
      const limit = margin.cells[`${snap.corpus}/${c.cell}`]?.limit ?? margin.limit;
      if (c.atMargin?.limit !== limit) faults.push({ file, field: `strategies[${i}].cells[${j}].atMargin.limit`, reason: `is ${String(c.atMargin?.limit)}, and the rule has ${limit}` });
    }),
  );
  return faults;
}

/** This function counts the fields of a gap file with a value in a region that does not read. */
function notReadRegions(file: string, snap: GapSnapshot, rule: SolvedRule): NotReadCount[] {
  const regions = regionsOf(snap, rule).filter((r) => r.state === "not-read");
  const cells = new Set(regions.map((r) => r.cell));
  const fields = snap.strategies.flatMap((s) => s.cells).filter((c) => cells.has(c.cell) && c.n > 0).length;
  return fields === 0 ? [] : [{ file, what: `atlas cells with a median, in ${regions.length} regions`, fields }];
}

/** This function counts the skip reasons with a value and no word. A strategy with more skips than reasons adds one field. */
function notReadSkips(file: string, snap: StrategySnapshot): NotReadCount[] {
  const fields = snap.strategies.reduce((sum, s) => {
    const reasons = s.reasons ?? [];
    const listed = reasons.reduce((n, r) => n + r.count, 0);
    return sum + reasons.filter((r) => !isBudgetReason(r.reason) && (r.word === undefined || r.word === "not read")).length + (s.skipped > listed ? 1 : 0);
  }, 0);
  return fields === 0 ? [] : [{ file, what: `skip reasons with no word, over ${skipCounts(snap.strategies).notRead} records`, fields }];
}

/** This function counts the reasons of the coverage file with a value and no word. */
function notReadOthers(file: string, snap: CoverageSnapshot): NotReadCount[] {
  const reasons = (snap.latest.entries?.others ?? []).flatMap((e) => e.reasons).filter((r) => !isBudgetReason(r.because) && (r.word === undefined || r.word === "not read"));
  return reasons.length === 0 ? [] : [{ file, what: `reasons of entries with no word, over ${reasons.reduce((n, r) => n + r.records, 0)} records`, fields: reasons.length }];
}

/** This function reads a folder of data files: the text of each file by its name. */
export function readDataFiles(files: ReadonlyMap<string, string>): DataRead {
  const faults: FileFault[] = [];
  for (const name of Object.keys(DATA_READERS)) if (!files.has(name)) faults.push({ file: name, field: "the file", reason: "is missing" });
  for (const name of files.keys()) if (DATA_READERS[name] === undefined) faults.push({ file: name, field: "the file", reason: "has no reader, so no page reads it" });
  for (const [name, text] of files) {
    const read = DATA_READERS[name];
    if (read !== undefined) faults.push(...faultsOfFile(name, text, read));
  }
  const faulty = new Set(faults.map((f) => f.file));
  const notRead: NotReadCount[] = [];
  const ruleText = files.get("solved-rule.json");
  const rule = ruleText === undefined || faulty.has("solved-rule.json") ? undefined : parseSolvedRule(ruleText);
  for (const [name, text] of files) {
    if (DATA_READERS[name] === undefined || faulty.has(name) || name === "response-coverage.json") continue;
    const value = JSON.parse(text) as { kind?: string };
    if (value.kind === "gaps" && rule !== undefined) {
      faults.push(...regionFaults(name, value as GapSnapshot, rule));
      notRead.push(...notReadRegions(name, value as GapSnapshot, rule));
    }
    if (value.kind === "strategies") notRead.push(...notReadSkips(name, value as StrategySnapshot));
    if (value.kind === "coverage") notRead.push(...notReadOthers(name, value as CoverageSnapshot));
  }
  return { files: files.size, faults, notRead };
}

/** This function gives the lines of the build log. Faults of one form share a line with their count. */
export function gateLines(read: DataRead): string[] {
  const forms = new Map<string, { first: FileFault; count: number }>();
  for (const f of read.faults) {
    const key = `${f.file}: ${f.field.replace(/\[\d+\]/g, "[]")} ${f.reason}`;
    const form = forms.get(key);
    if (form === undefined) forms.set(key, { first: f, count: 1 });
    else form.count += 1;
  }
  const faults = [...forms.values()].map(({ first, count }) => `FAULT ${first.file}: ${first.field} ${first.reason}${count > 1 ? ` (${count} fields of this form)` : ""}`);
  const total = read.notRead.reduce((n, c) => n + c.fields, 0);
  return [
    ...faults,
    `Data gate: ${read.files} files read, ${read.faults.length} faults.`,
    `Fields with a value and the state not read: ${total}.`,
    ...read.notRead.map((c) => `  ${c.file}: ${c.fields} ${c.what}`),
  ];
}
