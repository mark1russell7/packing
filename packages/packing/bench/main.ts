// The command line of the benchmark runner (`docs/BENCH.md`). The workflows `bench.yml` and `bench-smoke.yml` start it in CI.
//
//   node bench/main.ts run --corpus <name> --prediction <id> [--strategies a,b|all] [--repeats 5] [--warmup 2] [--interleave] [--anchor] [--out dir] [--commit sha]
//   node bench/main.ts list [--strategies a,b|all]
//   node bench/main.ts paired --corpus <name> --prediction <id> --arms base,a,b [--mode fresh|process] [--repeats 5] [--warmup 1] [--passes 1] [--events] [--no-aa] [--only text] [--out dir]
//   node bench/main.ts paired-child --corpus <name> --index <file> --arm <id> --input <id> --warmup <n> [--passes <n>] [--events]
//   node bench/main.ts paired-gate --gate <file> --dir <paired out dir>
//   node bench/main.ts paired-budget --dir <folder of paired runs> --arm <id>
//   node bench/main.ts predicates --corpus <name> [--strategies a,b|all] [--out dir]
//   node bench/main.ts merge --out <dir> <job dir>...
//   node bench/main.ts check <dir>
//
// The times of a run on a local computer do not count. Only the times of CI compare.

import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
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
  type BenchResult,
  type BenchRun,
  pairedInputs,
  pairedPack,
} from "./run.ts";
import { runBudgeted, runCases } from "./budget.ts";
import { eventProbe, measureIsolated, pairedMarkdown, timeChild, type Arm, type PairedReport } from "./paired-time.ts";
import { dumpPredicates, NEAR, parseShard } from "./predicates.ts";
import { deriveSizeGate, measureSizes, parseSizeGate, publishedExports, sizeCoverage, sizeMarkdown, sizeVerdict, type PublishedPackage, type SizeBundler } from "./size-gate.ts";
import { parseRecords, smokeCheck, smokeMarkdown } from "./smoke-check.ts";
import { BUDGET_POLICY, budgetMarkdown, timeBudget, type BudgetInput } from "./time-budget.ts";
import { checkTimeGate, deriveTimeGate, gateMarkdown, parseTimeGate, type TimeGate } from "./time-gate.ts";

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
 * - The test uses only the inputs that each arm supports. With `--only <text>`, it uses only the inputs with that text in their id.
 * - Mode `fresh` (the default) starts a child `paired-child` for each arm, each input and each round.
 * - With `--passes <n>`, each child times n passes and gives their median and the warm check (k130).
 * - With `--events`, each child counts its GC events and its deopts in each half of its passes (k130). It needs mode `fresh` and 2 passes or more.
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
  const only = opt("--only");
  const inputs = all.filter((at) => (only === undefined || at.id.includes(only)) && ids.every((id) => packs.get(id)!.get(at.id) !== undefined)).map((at) => ({ id: at.id, group: String(at.seed), value: at }));
  if (inputs.length === 0) return empty(`the corpus ${name} for the arms ${ids.join(", ")}`);
  const out = resolve(opt("--out") ?? join("bench-out", `${name}-paired`));
  mkdirSync(out, { recursive: true });
  // A child packs one arm on one input. The helper adds --input and --warmup. The index gives the spec and the seed of each input
  const index = join(out, "paired-index.json");
  writeFileSync(index, `${JSON.stringify(Object.fromEntries(inputs.map((x) => [x.id, [x.value.spec, x.value.seed]])))}\n`);
  const repeats = count("--repeats", DEFAULT_REPEATS);
  const warmup = count("--warmup", 1);
  const passes = count("--passes", 1);
  const events = rest.includes("--events");
  if (events && (mode !== "fresh" || passes < 2)) throw new Error("The event count needs mode fresh and 2 passes or more.");
  const child = [process.execPath, ...process.execArgv, join(here, "main.ts"), "paired-child", "--corpus", name, "--index", index, ...(events ? ["--events"] : [])];
  const arms: Arm<(typeof inputs)[number]["value"]>[] = ids.map((id) => ({ id, run: (at) => packs.get(id)!.get(at.id)!(), command: [...child, "--arm", id] }));
  const options = { arms, inputs, repeats, warmup, ...(mode === "fresh" ? { passes } : {}), aa: !rest.includes("--no-aa") };
  const report: PairedReport = mode === "process" ? measureIsolated({ ...options, mode }) : await measureIsolated({ ...options, mode });
  const sha = commit();
  const run = { schema: "packing-paired-run/1", corpus: name, prediction, ...(sha !== undefined ? { commit: sha } : {}), mode, repeats, warmup, ...(mode === "fresh" ? { passes } : {}), ...(events ? { events } : {}), arms: ids, ...(only !== undefined ? { only } : {}), inputs: inputs.length, skipped: all.length - inputs.length };
  writeFileSync(join(out, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(join(out, "paired-time.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, "paired-time.md"), pairedMarkdown(report, `A paired time test of ${ids.join(", ")} on ${name}`));
  process.stdout.write(`${inputs.length} inputs, ${all.length - inputs.length} skipped, ${report.arms.length} arms in mode ${mode} in ${out}\n`);
  return 0;
}

/** This function packs one arm on one input in a fresh process, by the child protocol of `paired-time.ts`. It writes `{"ms": n, "peakRss": bytes, "warm"?: n, "events"?: counts}`. */
async function pairedChild(): Promise<number> {
  const { corpus } = corpusOpt();
  const id = opt("--arm");
  const input = opt("--input");
  const file = opt("--index");
  if (id === undefined || input === undefined || file === undefined) throw new Error("A child needs --arm <id>, --input <id> and --index <file>.");
  const where = (JSON.parse(readFileSync(file, "utf8")) as Record<string, [number, number]>)[input];
  if (where === undefined) throw new Error(`The index has no input "${input}".`);
  const at = pairedInputs(corpus, { spec: where[0], seed: where[1] }).find((x) => x.id === input);
  if (at === undefined) throw new Error(`The corpus has no input "${input}".`);
  const pack = pairedPack(id, at);
  if (pack === undefined) throw new Error(`The arm ${id} does not support the input ${input}.`);
  const passes = count("--passes", 1);
  const probe = rest.includes("--events") ? eventProbe() : undefined;
  const result = timeChild(pack, count("--warmup", 1), undefined, passes, probe?.mark);
  if (probe !== undefined) result.events = await probe.events(passes);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

/** This function applies a time gate (`bench/gates/`) to the report of a paired run. It writes `gate.json` and `gate.md`, and fails on a fail. */
function pairedGate(): number {
  const file = opt("--gate");
  const dir = opt("--dir");
  if (file === undefined || dir === undefined) throw new Error("A time gate needs --gate <file> and --dir <paired out dir>.");
  const gate = parseTimeGate(readFileSync(file, "utf8"));
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as { corpus: string; only?: string; warmup?: number };
  const result = checkTimeGate(gate, JSON.parse(readFileSync(join(dir, "paired-time.json"), "utf8")) as PairedReport, run.corpus, run.only, run.warmup, rest.includes("--retry"));
  writeFileSync(join(dir, "gate.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(dir, "gate.md"), gateMarkdown(result));
  process.stdout.write(gateMarkdown(result));
  return result.verdict === "pass" ? 0 : result.verdict === "cannot-decide" ? 3 : 1;
}

/**
 * This function writes the values of a gate record from its derivation runs. `--dirs` has the paired out folders. `--runs` has the run id of each folder.
 *
 * It keeps the settings and the reasons of the record, and writes the checks, the reports, the A/A facts and the noise cap.
 */
function pairedGateDerive(): number {
  const file = opt("--gate");
  const dirs = opt("--dirs")?.split(",");
  const runs = opt("--runs")?.split(",");
  if (file === undefined || dirs === undefined || runs === undefined) throw new Error("A derivation needs --gate <file>, --dirs <out dirs> and --runs <run ids>.");
  const reports = dirs.map((d) => JSON.parse(readFileSync(join(d, "paired-time.json"), "utf8")) as PairedReport);
  // The old record can have an older schema: the derivation writes each value of schema 3, and the parse examines the new record.
  const gate = deriveTimeGate(JSON.parse(readFileSync(file, "utf8")) as TimeGate, reports, runs);
  const text = `${JSON.stringify(gate, null, 2)}
`;
  parseTimeGate(text);
  writeFileSync(file, text);
  process.stdout.write(`${JSON.stringify({ checks: gate.checks.map((c) => [c.measure, c.max, c.derivation.values]), noise: gate.noise })}
`);
  return 0;
}

/**
 * This function gives the time test of an arm (k128, k133) over the paired jobs in the folders of `--dir`. It writes `budget.json` and `budget.md`.
 * In GitHub Actions, the record keeps the URL of the CI run.
 */
function pairedBudget(): number {
  const dir = opt("--dir");
  const arm = opt("--arm");
  if (dir === undefined || arm === undefined) throw new Error("A time budget needs --dir <folder of paired runs> and --arm <id>.");
  const inputs: BudgetInput[] = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "paired-time.json")))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const run = JSON.parse(readFileSync(join(dir, name, "run.json"), "utf8")) as { corpus: string; only?: string };
      const report = JSON.parse(readFileSync(join(dir, name, "paired-time.json"), "utf8")) as PairedReport;
      return { run: name, report, corpus: run.corpus, ...(run.only !== undefined ? { only: run.only } : {}) };
    });
  const env = process.env;
  const ci = env["GITHUB_RUN_ID"] ? `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${env["GITHUB_REPOSITORY"] ?? ""}/actions/runs/${env["GITHUB_RUN_ID"]}` : undefined;
  const result = timeBudget(inputs, arm, BUDGET_POLICY, ci);
  writeFileSync(join(dir, "budget.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(dir, "budget.md"), budgetMarkdown(result));
  process.stdout.write(budgetMarkdown(result));
  return 0;
}

/**
 * This function writes the near inputs of the float predicates of a corpus (A13 of algebra) into `predicates.jsonl`.
 * It does not time, and it writes no records. Thus the outputs of the other commands stay byte-equal.
 */
function predicateDump(): number {
  const name = opt("--corpus") ?? "smoke-v1";
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error(`The corpus name "${name}" has other characters than a-z, 0-9, dot and hyphen.`);
  const out = resolve(opt("--out") ?? join("bench-out", `predicates-${name}`));
  mkdirSync(out, { recursive: true });
  const shardText = opt("--shard");
  const shard = shardText === undefined ? undefined : parseShard(shardText);
  const fd = openSync(join(out, "predicates.jsonl"), "w");
  let result: ReturnType<typeof dumpPredicates>;
  try {
    result = dumpPredicates(parseCorpus(readFileSync(join(here, "corpora", `${name}.json`), "utf8"), name), strategyIds(opt("--strategies")), (line) => writeSync(fd, `${line}\n`), shard);
  } finally {
    closeSync(fd);
  }
  const sha = commit();
  const record = { corpus: name, near: NEAR, inputs: result.inputs, cases: result.cases, nearInputs: result.near, ...(shard !== undefined ? { shard } : {}), env: env(), ...(sha !== undefined ? { commit: sha } : {}) };
  writeFileSync(join(out, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${result.cases} cases, near inputs ${JSON.stringify(result.near)}, in ${out}
`);
  // A corpus without inputs fails. An entry that supports no input of the corpus has 0 cases, and that is a result.
  return result.inputs === 0 ? empty(`the corpus ${name}`) : 0;
}

/**
 * This function applies the size gate (k132) to the build in `build/`. `--gate` names the record, and `--out` names a folder for `size.json` and `size.md`.
 * With `--derive`, the function writes the new measures and budgets into the record.
 */
async function sizeGate(): Promise<number> {
  const file = opt("--gate");
  const out = opt("--out");
  if (file === undefined || out === undefined) throw new Error("A size gate needs --gate <file> and --out <dir>.");
  const exports = publishedExports(JSON.parse(readFileSync("package.json", "utf8")) as PublishedPackage);
  const gate = parseSizeGate(readFileSync(file, "utf8"));
  const esbuild = await import("esbuild");
  const root = resolve(".");
  const bundle: SizeBundler = async (entry, name) => {
    const r = await esbuild.build({
      stdin: { contents: `import { ${name} } from ${JSON.stringify(join(root, entry).replaceAll("\\", "/"))};\nglobalThis.keep = ${name};\n`, resolveDir: root, loader: "js" },
      bundle: true,
      minify: true,
      format: "esm",
      platform: "neutral",
      treeShaking: true,
      write: false,
      mainFields: ["module", "main"],
      logLevel: "silent",
    });
    const code = r.outputFiles[0];
    if (code === undefined) throw new Error(`esbuild gives no output for ${entry}.`);
    return code.contents;
  };
  const measures = await measureSizes(gate.entries, bundle);
  mkdirSync(out, { recursive: true });
  if (rest.includes("--derive")) {
    const commit = process.env["GITHUB_SHA"] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const next = deriveSizeGate(gate, measures, commit);
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(next.entries.map((e) => [e.specifier, e.measured, e.budget]))}\n`);
    return 0;
  }
  const result = sizeVerdict(gate.entries, measures, sizeCoverage(gate.entries, exports));
  writeFileSync(join(out, "size.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(out, "size.md"), sizeMarkdown(result));
  process.stdout.write(sizeMarkdown(result));
  return result.verdict === "pass" ? 0 : 1;
}

function main(): number | Promise<number> {
  switch (command) {
    case "paired":
      return paired();
    case "paired-child":
      return pairedChild();
    case "paired-gate":
      return pairedGate();
    case "paired-gate-derive":
      return pairedGateDerive();
    case "paired-budget":
      return pairedBudget();
    case "size-gate":
      return sizeGate();
    case "predicates":
      return predicateDump();
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
      const report = (result: BenchResult): number => {
        // A gate fails closed: a run with no records is a failure, not a pass
        if (result.records.length === 0) return empty(`the run of the corpus ${name}`);
        const out = resolve(opt("--out") ?? join("bench-out", name));
        write(out, result.run, result.records, result.manifest);
        const skips = result.records.filter((r) => !isMeasured(r)).length;
        process.stdout.write(`${result.records.length} records, ${skips} of them skipped, and ${result.run.errors.length} errors in ${out}\n`);
        const passed = gate(result.records);
        return result.run.errors.length > 0 || !passed ? 1 : 0;
      };
      if (rest.includes("--budget")) {
        if (rest.includes("--interleave") || rest.includes("--anchor")) throw new Error("A run with --budget has no --interleave and no --anchor.");
        const deadline = opt("--deadline-minutes");
        return runBudgeted({
          corpusFile: file,
          corpusName: name,
          prediction,
          strategies: strategyIds(opt("--strategies")),
          repeats: count("--repeats", DEFAULT_REPEATS),
          warmup: count("--warmup", DEFAULT_WARMUP),
          env: env(),
          ...(sha !== undefined ? { commit: sha } : {}),
          ...(deadline !== undefined ? { deadlineMinutes: count("--deadline-minutes", 0) } : {}),
        }).then(report);
      }
      return report(runBench({
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
      }));
    }
    case "run-cases": {
      // The child of a run with --budget: the supervisor gives the file of the job and the file of the pairs
      const [jobFile, pairsFile] = rest.filter((arg) => !arg.startsWith("--"));
      if (jobFile === undefined || pairsFile === undefined) throw new Error("A child of a run needs the file of the job and the file of the pairs.");
      runCases(jobFile, pairsFile);
      return 0;
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
      process.stderr.write("Usage: node bench/main.ts run|list|merge|check|paired|predicates. docs/BENCH.md gives the options.\n");
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
