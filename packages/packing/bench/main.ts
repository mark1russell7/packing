// The command line of the benchmark runner (`docs/BENCH.md`). The workflows `bench.yml` and `bench-smoke.yml` start it in CI.
//
//   node bench/main.ts run --corpus <name> --prediction <id> [--strategies a,b|all] [--repeats 5] [--warmup 2] [--interleave] [--out dir] [--commit sha]
//   node bench/main.ts list [--strategies a,b|all]
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
  type BenchEnv,
  type BenchPrediction,
  type BenchRecord,
  type BenchRun,
} from "./run.ts";
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

function main(): number {
  switch (command) {
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
        // The flag --interleave alternates the timed runs of each input between the strategies
        interleave: rest.includes("--interleave"),
        env: env(),
        ...(sha !== undefined ? { commit: sha } : {}),
      });
      const out = resolve(opt("--out") ?? join("bench-out", name));
      write(out, result.run, result.records, result.manifest);
      const skips = result.records.filter((r) => !isMeasured(r)).length;
      process.stdout.write(`${result.records.length} records, ${skips} of them skipped, and ${result.run.errors.length} errors in ${out}\n`);
      return result.run.errors.length > 0 ? 1 : 0;
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
      const run = mergeRuns(runs, records, manifest);
      write(resolve(out), run, records, manifest);
      const skips = records.filter((r) => !isMeasured(r)).length;
      process.stdout.write(`${records.length} records of ${runs.length} jobs, ${skips} of them skipped, in ${resolve(out)}\n`);
      return run.errors.length > 0 ? 1 : 0;
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
      process.stderr.write("Usage: node bench/main.ts run|list|merge|check. docs/BENCH.md gives the options.\n");
      return 2;
  }
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
