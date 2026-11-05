// The flip tests of the gate checks of this package (`docs/BENCH.md`, "The flip tests").
// A gate that has not gone red on a known fault is not known to work. Each subcommand starts the real command of one gate
// in a child process, first on a clean copy of its input and then on a copy with an injected fault.
// The clean copy must give the exit code of a pass, and each fault must give the exit code of a fail.
//
// Start it with `node bench/gate-flip.ts <gate> ...`:
//
// - `size --gate <file> --out <folder>`, from `packages/packing`, after a build
// - `time --gate <file> --dir <folder of a paired run> --out <folder>`
// - `portfolio --records <folder> --run <id> --committed <file> --out <folder>`
// - `smoke --dir <folder of a merged run> --out <folder>`
// - `promotion --records <folder> --candidate <id> --default <id> --win <measure> --guards <set> --out <folder>`
// - `output --strategy <id> --out <folder>`, with a strategy that has whole rows
//
// The exit code is 0 when each row gives its stated code, and 1 when a row does not.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { aaId, type PairedReport } from "./paired-time.ts";
import type { BenchRecord, BenchRun, MeasuredRecord } from "./run.ts";
import { isMeasured } from "./run.ts";
import { parseRecords } from "./smoke-check.ts";
import { parseSizeGate, type SizeGate } from "./size-gate.ts";

const here = import.meta.dirname;
const MAIN = join(here, "main.ts");

/** One read of a flip test: a case, the exit code that it needs, and the exit code that it gave. */
export interface FlipRow {
  /** The name of the case, for example `clean` or `one bundle above its budget` */
  name: string;
  /** The value that the gate needs on this case: an exit code, or a count of bundles */
  expected: number;
  /** The value that the gate gave. The value `null` is a child that a signal stopped. */
  got: number | null;
  /** The text that the output of the gate needs, when a case states one */
  names?: string;
  /** The value `false` when the output does not have the text `names` */
  named?: boolean;
}

/** This function tells if a row gave its stated code and its stated text. */
export function rowHolds(row: FlipRow): boolean {
  return row.got === row.expected && row.named !== false;
}

/** This function gives the result of a flip test as Markdown, for the summary of a CI job. */
export function flipMarkdown(gate: string, rows: readonly FlipRow[]): string {
  const lines = [`## Flip test of the ${gate} gate`, "", "| Case | Needs | Gave | Result |", "|---|---:|---:|---|"];
  for (const r of rows) {
    const text = r.named === false ? `the output does not name "${r.names ?? ""}"` : rowHolds(r) ? "holds" : "does not hold";
    lines.push(`| ${r.name} | ${r.expected} | ${r.got ?? "signal"} | ${text} |`);
  }
  return `${lines.join("\n")}\n`;
}

/** This function gives the option `name` of the arguments, and throws when it is not present. */
function optionOf(argv: readonly string[], name: string): string {
  const at = argv.indexOf(name);
  const value = at < 0 ? undefined : argv[at + 1];
  if (value === undefined) throw new Error(`The flip test needs the option ${name}.`);
  return value;
}

/** This function starts a command in a child and gives its row. The output of the child goes to a file of the out folder. */
function runCase(name: string, expected: number, argv: readonly string[], out: string, names?: string, cwd?: string): FlipRow {
  const child = spawnSync(argv[0]!, argv.slice(1), { encoding: "utf8", maxBuffer: 1 << 30, ...(cwd === undefined ? {} : { cwd }) });
  const text = `${child.stdout ?? ""}${child.stderr ?? ""}${child.error === undefined ? "" : String(child.error)}`;
  writeFileSync(join(out, `${name.replaceAll(/[^a-z0-9]+/gi, "-")}.log`), text);
  const row: FlipRow = { name, expected, got: child.status, ...(names === undefined ? {} : { names, named: text.includes(names) }) };
  if (!rowHolds(row)) process.stderr.write(`${name}:\n${text.slice(-2000)}\n`);
  return row;
}

/** This function adds the code that makes a file bigger: a top-level statement with `bytes` random bytes. A bundler keeps a statement with an effect. */
export function growCode(code: string, bytes: number): string {
  return `${code}\nglobalThis.__flip = ${JSON.stringify(randomBytes(bytes).toString("base64"))};\n`;
}

/** This function gives each JavaScript file below a folder. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(dir, f));
}

/** This function gives the gate record with no entry for its first export, so the coverage check of the gate must fail. */
export function gateWithoutEntry(gate: SizeGate): SizeGate {
  return { ...gate, entries: gate.entries.slice(1) };
}

/**
 * This function is the flip test of the size gate. It grows each file of `build/` by more than the largest budget, so each bundle goes above its budget.
 * It restores `build/` before the clean read that closes the test, and also when a case throws.
 */
function flipSize(argv: readonly string[]): FlipRow[] {
  const gateFile = resolve(optionOf(argv, "--gate"));
  const out = resolve(optionOf(argv, "--out"));
  mkdirSync(out, { recursive: true });
  const gate = parseSizeGate(readFileSync(gateFile, "utf8"));
  const sizeGate = (file: string, folder: string): string[] => [process.execPath, MAIN, "size-gate", "--gate", file, "--out", join(out, folder)];
  const rows = [runCase("clean", 0, sizeGate(gateFile, "clean"), out)];

  const noEntry = join(out, "no-entry.json");
  writeFileSync(noEntry, JSON.stringify(gateWithoutEntry(gate)));
  rows.push(runCase("one export with no entry", 1, sizeGate(noEntry, "no-entry"), out, "has no entry"));

  const build = resolve("build");
  const keep = join(out, "build-clean");
  cpSync(build, keep, { recursive: true });
  const bytes = Math.max(...gate.entries.map((e) => e.budget));
  try {
    for (const file of codeFiles(build)) writeFileSync(file, growCode(readFileSync(file, "utf8"), bytes));
    rows.push(runCase("each bundle above its budget", 1, sizeGate(gateFile, "grown"), out, "above its budget"));
    const grown = JSON.parse(readFileSync(join(out, "grown", "size.json"), "utf8")) as { rows: { outcome: string }[] };
    const above = grown.rows.filter((r) => r.outcome === "above").length;
    rows.push({ name: `${above} of ${gate.entries.length} bundles above their budget`, expected: gate.entries.length, got: above });
  } finally {
    rmSync(build, { recursive: true, force: true });
    cpSync(keep, build, { recursive: true });
  }
  rows.push(runCase("clean after the restore", 0, sizeGate(gateFile, "restored"), out));
  return rows;
}

/** This function gives a report with the times of the arm `arm` multiplied by `factor`. */
export function slowArm(report: PairedReport, arm: string, factor: number): PairedReport {
  return { ...report, inputs: report.inputs.map((i) => ({ ...i, ms: { ...i.ms, [arm]: (i.ms[arm] ?? []).map((t) => t * factor) } })) };
}

/** This function gives a report with an A/A arm far from its base. Each second input is `factor` times slower, and the others are `factor` times faster. */
export function noisyAa(report: PairedReport, factor: number): PairedReport {
  const aa = aaId(report.base);
  return {
    ...report,
    inputs: report.inputs.map((i, at) => ({ ...i, ms: { ...i.ms, [aa]: (i.ms[aa] ?? []).map((t) => (at % 2 === 0 ? t * factor : t / factor)) } })),
  };
}

/** This function writes a copy of a paired run with the report `report`, and gives its folder. */
function pairedCopy(dir: string, out: string, name: string, report: PairedReport): string {
  const copy = join(out, name);
  mkdirSync(copy, { recursive: true });
  cpSync(join(dir, "run.json"), join(copy, "run.json"));
  writeFileSync(join(copy, "paired-time.json"), JSON.stringify(report));
  return copy;
}

/** The factor of a fault on times. The gate of the time limit stands far under it, so the fault is not a near case. */
const TIME_FAULT = 3;

/** The factor of the time fault of the win test. The clean pair has a tail under its limit of 2, and this fault puts it far above the limit. */
const WIN_TIME_FAULT = 10;

/** The exit code of a time gate that cannot decide: the A/A noise of the run is above its cap. */
const CANNOT_DECIDE = 3;

/**
 * This function is the flip test of a time gate, on a copy of the files of a real run with a pass.
 * A slow arm fails. A noisy A/A arm cannot decide on the first run, and fails on the retry.
 */
function flipTime(argv: readonly string[]): FlipRow[] {
  const gateFile = resolve(optionOf(argv, "--gate"));
  const dir = resolve(optionOf(argv, "--dir"));
  const out = resolve(optionOf(argv, "--out"));
  mkdirSync(out, { recursive: true });
  const report = JSON.parse(readFileSync(join(dir, "paired-time.json"), "utf8")) as PairedReport;
  const gate = JSON.parse(readFileSync(gateFile, "utf8")) as { arm: string };
  const read = (folder: string, ...more: string[]): string[] => [process.execPath, MAIN, "paired-gate", "--gate", gateFile, "--dir", folder, ...more];
  const clean = pairedCopy(dir, out, "clean", report);
  const slow = pairedCopy(dir, out, "slow", slowArm(report, gate.arm, TIME_FAULT));
  const noisy = pairedCopy(dir, out, "noisy", noisyAa(report, TIME_FAULT));
  return [
    runCase("clean", 0, read(clean), out),
    runCase(`the arm ${TIME_FAULT} times slower`, 1, read(slow), out),
    runCase("a noisy A/A arm, first run", CANNOT_DECIDE, read(noisy), out),
    runCase("a noisy A/A arm, retry", 1, read(noisy, "--retry"), out),
  ];
}

/** This function gives the member of the first set of one member in a generated table. The table chose that strategy from the records. */
export function chosenStrategy(table: string): string {
  const found = /"1": \[\s*"([^"]+)"/.exec(table);
  if (found === null) throw new Error("The table has no set of one member.");
  return found[1]!;
}

/** This function gives the JSON Lines text with no record of `strategy`. */
export function withoutStrategy(text: string, strategy: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "" && (JSON.parse(line) as { strategy: string }).strategy !== strategy)
    .join("\n");
}

/**
 * This function is the flip test of the portfolio sets. It writes the table from a copy of the records, and compares it with the committed table by `diff`.
 * The clean copy gives no difference. A copy with no records of a chosen strategy gives a difference.
 */
function flipPortfolio(argv: readonly string[]): FlipRow[] {
  const records = resolve(optionOf(argv, "--records"));
  const run = optionOf(argv, "--run");
  const committed = resolve(optionOf(argv, "--committed"));
  const out = resolve(optionOf(argv, "--out"));
  mkdirSync(out, { recursive: true });
  const text = readFileSync(join(records, "records.jsonl"), "utf8");
  const table = readFileSync(committed, "utf8");
  const read = (name: string, expected: number, recordText: string): FlipRow[] => {
    const copy = join(out, name);
    mkdirSync(copy, { recursive: true });
    for (const file of ["corpus.json", "run.json"]) cpSync(join(records, file), join(copy, file));
    writeFileSync(join(copy, "records.jsonl"), recordText);
    const written = join(copy, "portfolio-sets.ts");
    const first = runCase(`${name}: write the table`, 0, [process.execPath, join(here, "choose-sets.ts"), copy, "--run", run, "--out", written], out);
    return [first, runCase(`${name}: compare the table`, expected, ["diff", "-q", committed, written], out)];
  };
  const strategy = chosenStrategy(table);
  return [...read("clean", 0, text), ...read(`no records of ${strategy}`, 1, withoutStrategy(text, strategy))];
}

/** The change of a run and its records for one fault of the smoke check. */
export interface SmokeFault {
  /** The name of the fault */
  name: string;
  /** The text that the check needs in its failures */
  names: string;
  /** This function gives the faulty copy. */
  apply: (run: BenchRun, records: readonly BenchRecord[]) => { run: BenchRun; records: readonly BenchRecord[] };
}

/** This function changes the first measured record of the records. */
function changeFirst(records: readonly BenchRecord[], change: (r: MeasuredRecord) => MeasuredRecord): BenchRecord[] {
  const at = records.findIndex((r) => isMeasured(r));
  if (at < 0) throw new Error("The run has no measured record.");
  return records.map((r, i) => (i === at ? change(r as MeasuredRecord) : r));
}

/** The faults of the smoke check: one for each kind of failure in `smokeCheck`. */
export const SMOKE_FAULTS: readonly SmokeFault[] = [
  {
    name: "an error in the run",
    names: "has an error on",
    apply: (run, records) => ({ run: { ...run, errors: [...run.errors, { strategy: run.strategies[0]!, input: "flip", message: "flip" }] }, records }),
  },
  { name: "no records", names: "has no records", apply: (run) => ({ run, records: [] }) },
  {
    name: "a hard break",
    names: "has hard breaks",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, hard: { ...r.hard, "no-overlap": 1 } })) }),
  },
  {
    name: "not deterministic",
    names: "is not deterministic",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, deterministic: false })) }),
  },
  {
    name: "a forced overflow above its overflow",
    names: "has a forced overflow of",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, measures: { ...r.measures, "pack.overflow.forced": 2, "pack.overflow": 1 } })) }),
  },
  {
    name: "a forced overflow area above its area",
    names: "has a forced overflow area of",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, measures: { ...r.measures, "pack.overflow.forcedArea": 2, "pack.overflow.area": 1 } })) }),
  },
  {
    name: "a box out of the true outline",
    names: "out of the true outline",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, measures: { ...r.measures, "pack.outsideExact": 1 } })) }),
  },
  {
    name: "a gap below 0",
    names: "below 0",
    apply: (run, records) => ({ run, records: changeFirst(records, (r) => ({ ...r, measures: { ...r.measures, "pack.gap": -0.5 } })) }),
  },
  {
    name: "no coverage for a strategy",
    names: "has no coverage for",
    apply: (run, records) => {
      const coverage = Object.fromEntries(Object.entries(run.coverage ?? {}).filter(([id]) => id !== run.strategies[0]));
      return { run: { ...run, coverage }, records };
    },
  },
  {
    name: "a coverage that does not agree with its records",
    names: "but the records give",
    apply: (run, records) => {
      const first = records.find((r) => r.strategy === run.strategies[0]);
      return { run, records: records.filter((r) => r !== first) };
    },
  },
  {
    name: "a strategy of the full list not in the run",
    names: "does not have the strategy",
    apply: (run, records) => {
      const strategies = run.strategies.filter((s) => s !== "rows");
      return { run: { ...run, strategies }, records: records.filter((r) => r.strategy !== "rows") };
    },
  },
];

/** This function gives the JSON Lines text with each time of `strategy` multiplied by `factor`. Each other field and each other record stay the same. */
export function slowStrategy(text: string, strategy: string, factor: number): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const r = JSON.parse(line) as { strategy: string; ms?: number; msRuns?: number[] };
      if (r.strategy !== strategy) return line;
      return JSON.stringify({
        ...r,
        ...(r.ms === undefined ? {} : { ms: r.ms * factor }),
        ...(r.msRuns === undefined ? {} : { msRuns: r.msRuns.map((t) => t * factor) }),
      });
    })
    .join("\n");
}

/**
 * This function is the flip test of the time test of the win test, on records with one CPU model and at the usual floor.
 * The clean pair must pass with no failed part. A copy with a slow candidate must fail, and the only failed part must be the time test.
 * A row also reads that the time records of the pair have one CPU model, so a time ratio of them is a fair read.
 */
function flipPromotion(argv: readonly string[]): FlipRow[] {
  const records = resolve(optionOf(argv, "--records"));
  const candidate = optionOf(argv, "--candidate");
  const out = resolve(optionOf(argv, "--out"));
  mkdirSync(out, { recursive: true });
  const slow = join(out, "slow-records");
  cpSync(records, slow, { recursive: true });
  writeFileSync(join(slow, "records.jsonl"), slowStrategy(readFileSync(join(records, "records.jsonl"), "utf8"), candidate, WIN_TIME_FAULT));
  const read = (folder: string, verdict: string): string[] => [
    process.execPath,
    join(here, "promote.ts"),
    folder,
    "--candidate",
    candidate,
    "--default",
    optionOf(argv, "--default"),
    "--win",
    optionOf(argv, "--win"),
    "--guards",
    optionOf(argv, "--guards"),
    "--expect",
    "pass",
    "--out",
    join(out, verdict),
  ];
  const rows = [
    runCase("clean, the usual floor", 0, read(records, "clean"), out, "The failed parts: none."),
    runCase(`the candidate ${WIN_TIME_FAULT} times slower, the usual floor`, 1, read(slow, "slow"), out, "The failed parts: time."),
  ];
  const clean = JSON.parse(readFileSync(join(out, "clean", "promotion.json"), "utf8")) as { timeSource: { sameCpu: boolean } };
  rows.push({ name: "the time records of the clean pair have one CPU model", expected: 1, got: clean.timeSource.sameCpu ? 1 : 0 });
  return rows;
}

/** This function is the flip test of the smoke check: a clean copy of the merged run, and one copy for each fault. */
function flipSmoke(argv: readonly string[]): FlipRow[] {
  const dir = resolve(optionOf(argv, "--dir"));
  const out = resolve(optionOf(argv, "--out"));
  mkdirSync(out, { recursive: true });
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as BenchRun;
  const records = parseRecords(readFileSync(join(dir, "records.jsonl"), "utf8"));
  const read = (name: string, expected: number, r: BenchRun, list: readonly BenchRecord[], names?: string): FlipRow => {
    const copy = join(out, name.replaceAll(/[^a-z0-9]+/gi, "-"));
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, "run.json"), JSON.stringify(r));
    writeFileSync(join(copy, "records.jsonl"), list.map((x) => JSON.stringify(x)).join("\n"));
    return runCase(name, expected, [process.execPath, MAIN, "check", copy], out, names);
  };
  const rows = [read("clean", 0, run, records)];
  for (const fault of SMOKE_FAULTS) {
    const faulty = fault.apply(run, records);
    rows.push(read(fault.name, 1, faulty.run, faulty.records, fault.names));
  }
  return rows;
}

/** This function gives the rows of the flip test of the output rows. The fault is on the function that packs, and the table stays the same. */
function flipOutput(argv: readonly string[]): FlipRow[] {
  const out = optionOf(argv, "--out");
  mkdirSync(out, { recursive: true });
  const read = (...more: readonly string[]): string[] => [process.execPath, "--no-warnings", join(here, "whole-positions.ts"), "--check", "--strategies", optionOf(argv, "--strategy"), ...more];
  return [
    runCase("clean", 0, read(), out, "0 findings"),
    runCase("half a position in each output", 1, read("--fault", "half-position"), out, "position-grid: the table says whole"),
    runCase("half a size in each output", 1, read("--fault", "half-size"), out, "size-grid: the table says whole"),
  ];
}

/**
 * This function gives the rows of the flip test of the data gate of the site. A clean copy of the files passes. The old
 * file of the data branch fails with its file and its field, and a file with no reader fails with its name.
 */
function flipData(argv: readonly string[]): FlipRow[] {
  const out = optionOf(argv, "--out");
  const site = optionOf(argv, "--site");
  mkdirSync(out, { recursive: true });
  const copy = (name: string): string => {
    const dir = join(out, name);
    cpSync(join(site, "data"), dir, { recursive: true });
    return dir;
  };
  const gate = (dir: string): string[] => [process.execPath, "--no-warnings", join(site, "scripts", "data-gate.ts"), dir];
  const clean = copy("clean");
  const old = copy("old-file");
  cpSync(join(site, "src", "fixtures", "gaps-pack-known-no-margin.json"), join(old, "gaps-pack-known-v1.json"));
  const extra = copy("no-reader");
  writeFileSync(join(extra, "new.json"), "{}");
  return [
    runCase("clean", 0, gate(clean), out, " 0 faults"),
    runCase("the old file of the data branch", 1, gate(old), out, "gaps-pack-known-v1.json: strategies[0].cells[0].atMargin is missing"),
    runCase("the order of a new field", 1, gate(old), out, "start the workflow `Site data`"),
    runCase("the command that replaces the file", 1, gate(old), out, "gh workflow run site-data.yml -R mark1russell7/packing --ref main -f runs=\"pack-known-v1="),
    runCase("a file with no reader", 1, gate(extra), out, "new.json: the file has no reader"),
  ];
}

/** This function starts the flip test of one gate, writes its table and gives its exit code. */
export function flipMain(argv: readonly string[]): number {
  const gate = argv[0];
  const rest = argv.slice(1);
  const rows =
    gate === "size" ? flipSize(rest) : gate === "time" ? flipTime(rest) : gate === "portfolio" ? flipPortfolio(rest) : gate === "smoke" ? flipSmoke(rest) : gate === "promotion" ? flipPromotion(rest) : gate === "output" ? flipOutput(rest) : gate === "data" ? flipData(rest) : undefined;
  if (rows === undefined) throw new Error("A flip test needs the gate size, time, portfolio, smoke, promotion, output or data.");
  const text = flipMarkdown(gate!, rows);
  process.stdout.write(text);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined && existsSync(dirname(summary))) appendFileSync(summary, text);
  return rows.every(rowHolds) ? 0 : 1;
}

if (process.argv[1]?.endsWith("gate-flip.ts") === true) process.exitCode = flipMain(process.argv.slice(2));
