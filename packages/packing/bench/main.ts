// The command line of the benchmark runner (`docs/BENCH.md`). The workflows `bench.yml` and `bench-smoke.yml` start it in CI.
//
//   node bench/main.ts run --corpus <name> --prediction <id> [--strategies a,b|all] [--repeats 5] [--warmup 2] [--interleave] [--anchor] [--out dir] [--commit sha]
//   node bench/main.ts list [--strategies a,b|all]
//   node bench/main.ts paired --corpus <name> --prediction <id> --arms base,a,b [--mode fresh|process] [--repeats 5] [--warmup 1] [--no-aa] [--out dir]
//   node bench/main.ts paired-child --corpus <name> --arm <id> --input <id> --warmup <n>
//   node bench/main.ts merge --out <dir> <job dir>...
//   node bench/main.ts check <dir>
//
// The times of a run on a local computer do not count. Only the times of CI compare.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, arch, platform } from "node:os";
import { join, resolve } from "node:path";
import {
  isMeasured,
  mergeRuns,
  parseCorpus,
  parsePredictions,
  recordLines,
  runBench,
  strategyIds,
  summaryMarkdown,
  DEFAULT_REPEATS,
  DEFAULT_WARMUP,
  determinismOf,
  gateLines,
  type BenchEnv,
  type BenchPrediction,
  type BenchRecord,
  type BenchRun,
  pairedInputs,
  pairedPack,
} from "./run.ts";
import { measureIsolated, pairedMarkdown, timeChild, type Arm, type PairedReport } from "./paired-time.ts";
import { parseRecords, smokeCheck, smokeMarkdown } from "./smoke-check.ts";

const here = import.meta.dirname;
const [command, ...rest] = process.argv.slice(2);

/** The value of an option `--name value`, or `undefined`. */
function opt(name: string): string | undefined {
  const at = rest.indexOf(name);
  if (at === -1) return undefined;
  const value = rest[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`The option ${name} needs a value.`);
  return value;
}

/** A whole number option. */
function count(name: string, fallback: number): number {
  const text = opt(name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`The option ${name} is a whole number, not "${text}".`);
  return Number(text);
}

/** The facts of this computer. */
function env(): BenchEnv {
  const list = cpus();
  return {
    node: process.version,
    os: process.env["RUNNER_OS"] ?? platform(),
    arch: arch(),
    runner: process.env["RUNNER_NAME"] ?? "local",
    cpu: list[0]?.model.trim() ?? "unknown",
    cpus: list.length,
  };
}

/** The first 7 characters of the commit: `--commit`, then `GITHUB_SHA`, then `git rev-parse`. */
function commit(): string | undefined {
  const given = opt("--commit") ?? process.env["GITHUB_SHA"];
  if (given) return given.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

/** The predictions of `bench/predictions.jsonl`, or none when the file is absent. */
function predictions(): BenchPrediction[] {
  const file = opt("--predictions") ?? join(here, "predictions.jsonl");
  return existsSync(file) ? parsePredictions(readFileSync(file, "utf8")) : [];
}

/** This function writes the files of a run into a folder. */
function write(out: string, run: BenchRun, records: readonly BenchRecord[], manifest?: unknown): void {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "records.jsonl"), recordLines(records));
  writeFileSync(join(out, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(join(out, "summary.md"), summaryMarkdown(run, records, predictions()));
  if (manifest !== undefined) writeFileSync(join(out, "corpus.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** This function shows the failures of the determinism gate (k121), and tells if the gate passed. The caller writes the files before it. */
function gate(records: readonly BenchRecord[]): boolean {
  const lines = gateLines(determinismOf(records), "records");
  for (const line of lines) process.stderr.write(`${line}\n`);
  return lines.length === 0;
}

/** This function writes the message of an empty input and gives the code 1. A gate fails on no input. */
function empty(what: string): number {
  process.stderr.write(`The gate found no records in ${what}. It needs one record or more.
`);
  return 1;
}

/** This function gives the corpus of the option `--corpus`. */
function corpusOpt(): { name: string; corpus: ReturnType<typeof parseCorpus> } {
  const name = opt("--corpus");
  if (name === undefined) throw new Error("The command needs a corpus: --corpus <name>.");
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error(`The corpus name "${name}" has other characters than a-z, 0-9, dot and hyphen.`);
  return { name, corpus: parseCorpus(readFileSync(join(here, "corpora", `${name}.json`), "utf8"), name) };
}

/**
 * This function packs the paired time test of k127: the strategies of `--arms` in one job, with the helper of `paired-time.ts`.
 *
 * - The first arm is the base. The A/A arm is on, except with `--no-aa`.
 * - The test uses only the inputs that each arm supports.
 * - Mode `fresh` (the default) starts a child `paired-child` for each arm, each input and each round.
 */
async function paired(): Promise<number> {
  const { name, corpus } = corpusOpt();
  const prediction = opt("--prediction");
  if (prediction === undefined || prediction.trim() === "") throw new Error("Each run names its prediction: --prediction <id>.");
  const ids = (opt("--arms") ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
  if (ids.length === 0) throw new Error("A paired time test needs its arms: --arms base,a,b.");
  const mode = opt("--mode") ?? "fresh";
  if (mode !== "fresh" && mode !== "process") throw new Error(`The mode is fresh or process, not "${mode}".`);
  const all = pairedInputs(corpus);
  const packs = new Map(ids.map((id) => [id, new Map(all.map((at) => [at.id, pairedPack(id, at)]))]));
  const inputs = all.filter((at) => ids.every((id) => packs.get(id)!.get(at.id) !== undefined)).map((at) => ({ id: at.id, group: String(at.seed), value: at }));
  if (inputs.length === 0) return empty(`the corpus ${name} for the arms ${ids.join(", ")}`);
  // A child packs one arm on one input. The helper adds --input and --warmup
  const child = [process.execPath, ...process.execArgv, join(here, "main.ts"), "paired-child", "--corpus", name];
  const arms: Arm<(typeof inputs)[number]["value"]>[] = ids.map((id) => ({ id, run: (at) => packs.get(id)!.get(at.id)!(), command: [...child, "--arm", id] }));
  const repeats = count("--repeats", DEFAULT_REPEATS);
  const warmup = count("--warmup", 1);
  const options = { arms, inputs, repeats, warmup, aa: !rest.includes("--no-aa") };
  const report: PairedReport = mode === "process" ? measureIsolated({ ...options, mode }) : await measureIsolated({ ...options, mode });
  const out = resolve(opt("--out") ?? join("bench-out", `${name}-paired`));
  mkdirSync(out, { recursive: true });
  const sha = commit();
  const run = { schema: "packing-paired-run/1", corpus: name, prediction, ...(sha !== undefined ? { commit: sha } : {}), mode, repeats, warmup, arms: ids, inputs: inputs.length, skipped: all.length - inputs.length };
  writeFileSync(join(out, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(join(out, "paired-time.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, "paired-time.md"), pairedMarkdown(report, `A paired time test of ${ids.join(", ")} on ${name}`));
  process.stdout.write(`${inputs.length} inputs, ${all.length - inputs.length} skipped, ${report.arms.length} arms in mode ${mode} in ${out}\n`);
  return 0;
}

/** This function packs one arm on one input in a fresh process, by the child protocol of `paired-time.ts`. It writes `{"ms": n, "peakRss": bytes}`. */
function pairedChild(): number {
  const { corpus } = corpusOpt();
  const id = opt("--arm");
  const input = opt("--input");
  if (id === undefined || input === undefined) throw new Error("A child needs --arm <id> and --input <id>.");
  const at = pairedInputs(corpus).find((x) => x.id === input);
  if (at === undefined) throw new Error(`The corpus has no input "${input}".`);
  const pack = pairedPack(id, at);
  if (pack === undefined) throw new Error(`The arm ${id} does not support the input ${input}.`);
  process.stdout.write(`${JSON.stringify(timeChild(pack, count("--warmup", 1)))}\n`);
  return 0;
}

function main(): number | Promise<number> {
  switch (command) {
    case "paired":
      return paired();
    case "paired-child":
      return pairedChild();
    case "list":
      process.stdout.write(`${JSON.stringify(strategyIds(opt("--strategies")))}\n`);
      return 0;
    case "run": {
      const name = opt("--corpus") ?? "smoke-v1";
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error(`The corpus name "${name}" has other characters than a-z, 0-9, dot and hyphen.`);
      const prediction = opt("--prediction");
      if (prediction === undefined || prediction.trim() === "") throw new Error("Each run names its prediction: --prediction <id>.");
      const file = join(here, "corpora", `${name}.json`);
      const sha = commit();
      const result = runBench({
        corpus: parseCorpus(readFileSync(file, "utf8"), name),
        prediction,
        strategies: strategyIds(opt("--strategies")),
        repeats: count("--repeats", DEFAULT_REPEATS),
        warmup: count("--warmup", DEFAULT_WARMUP),
        // The flag --interleave alternates the timed passes of each input between the strategies
        interleave: rest.includes("--interleave"),
        // The flag --anchor adds the measures pack.anchor.* of roadmap item k111 to each input with a locked item
        ...(rest.includes("--anchor") ? { anchor: true } : {}),
        env: env(),
        ...(sha !== undefined ? { commit: sha } : {}),
      });
      // A gate fails closed: a run with no records is a failure, not a pass
      if (result.records.length === 0) return empty(`the run of the corpus ${name}`);
      const out = resolve(opt("--out") ?? join("bench-out", name));
      write(out, result.run, result.records, result.manifest);
      const skips = result.records.filter((r) => !isMeasured(r)).length;
      process.stdout.write(`${result.records.length} records, ${skips} of them skipped, and ${result.run.errors.length} errors in ${out}\n`);
      const passed = gate(result.records);
      return result.run.errors.length > 0 || !passed ? 1 : 0;
    }
    case "merge": {
      const out = opt("--out");
      if (out === undefined) throw new Error("A merge needs --out <dir>.");
      const dirs = rest.filter((arg, i) => !arg.startsWith("--") && rest[i - 1] !== "--out" && rest[i - 1] !== "--predictions");
      if (dirs.length === 0) throw new Error("A merge needs one folder of a job or more.");
      const runs: BenchRun[] = [];
      const records: BenchRecord[] = [];
      let manifest: unknown;
      for (const dir of dirs) {
        runs.push(JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as BenchRun);
        for (const line of readFileSync(join(dir, "records.jsonl"), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line) as BenchRecord);
        if (manifest === undefined && existsSync(join(dir, "corpus.json"))) manifest = JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));
      }
      if (records.length === 0) return empty(`the files records.jsonl of ${dirs.join(", ")}`);
      const run = mergeRuns(runs, records, manifest);
      write(resolve(out), run, records, manifest);
      const skips = records.filter((r) => !isMeasured(r)).length;
      process.stdout.write(`${records.length} records of ${runs.length} jobs, ${skips} of them skipped, in ${resolve(out)}\n`);
      const passed = gate(records);
      return run.errors.length > 0 || !passed ? 1 : 0;
    }
    case "check": {
      // The smoke check of the folder of a run. It writes the coverage table, and it exits with the code 1 on a failure.
      const dir = rest.find((arg) => !arg.startsWith("--"));
      if (dir === undefined) throw new Error("A check needs the folder of a run.");
      const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as BenchRun;
      const result = smokeCheck(run, parseRecords(readFileSync(join(dir, "records.jsonl"), "utf8")));
      process.stdout.write(smokeMarkdown(result));
      return result.failures.length > 0 ? 1 : 0;
    }
    default:
      process.stderr.write("Usage: node bench/main.ts run|list|merge|check|paired. docs/BENCH.md gives the options.\n");
      return 2;
  }
}

/** This function writes the message of an error and gives the code 2. */
function failed(error: unknown): number {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  return 2;
}

try {
  const code = main();
  if (typeof code === "number") process.exitCode = code;
  else code.then((value) => (process.exitCode = value), (error: unknown) => (process.exitCode = failed(error)));
} catch (error) {
  process.exitCode = failed(error);
}
