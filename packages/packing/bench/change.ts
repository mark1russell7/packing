// The builder of the corpus `pack-change-v1` of roadmap item k48: chains of inputs, where each step names the step before
// it as its base. The file `bench/corpora/pack-change-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/change.ts                                 writes the file
//   node bench/change.ts --check                         exits with the code 1 when the file is not the output of the builder
//   node bench/change.ts --report [--strategies a,b]     packs the corpus and writes the mean of pack.stability.moved for each kind
//
// The report reads no time. Its numbers are the same on each computer.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mean, median } from "@mark1russell7/rigor-statistics";
import { CHANGE_WALK_KINDS, CHANGE_WALK_STEPS, corpus, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import { CORPUS_MANIFEST_SCHEMA, corpusManifestText, type DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";
import { STOPPED } from "./control-read.ts";
import { benchEntry, benchStrategy } from "./controls.ts";
import { isMeasured, parseCorpus, runBench, type BenchEnv, type BenchRecord } from "./run.ts";
import { parseRecords } from "./smoke-check.ts";

/** The name of the corpus. */
export const CHANGE_CORPUS = "pack-change-v1";

/** The seeds of each spec. */
export const CHANGE_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

/** The counts of the boxes of a chain. */
export const CHANGE_COUNTS: readonly number[] = Object.freeze([20, 60]);

/** The file of the corpus. */
export const CHANGE_FILE: string = join(import.meta.dirname, "corpora", `${CHANGE_CORPUS}.json`);

/** The strategies of the report: 4 entries of `bench/entries.ts`. */
export const CHANGE_STRATEGIES: readonly string[] = Object.freeze(["rows", "shelf", "skyline", "maxrects-bl"]);

/** This function gives the specs of the corpus. The steps of a chain come in order, because the runner needs each base first. */
export function changeSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const kind of CHANGE_WALK_KINDS) {
    for (const count of CHANGE_COUNTS) {
      for (let step = 0; step <= CHANGE_WALK_STEPS; step++) specs.push({ generator: "change-walk", version: 1, params: { kind, step, count }, seeds: CHANGE_SEEDS });
    }
  }
  return specs;
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function changeClaim(specs: readonly CorpusSpec[] = changeSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(CHANGE_CORPUS, specs).inputs.map(toPackInput));
  const minCount = 10;
  return { minCount, thin: Object.keys(counts).filter((id) => counts[id]! < minCount), counts };
}

/** This function gives the text of the corpus file, in the form of the other files of `bench/corpora`: one spec on each line. */
export function changeCorpusText(): string {
  const specs = changeSpecs();
  return corpusManifestText({ schema: CORPUS_MANIFEST_SCHEMA, corpus: CHANGE_CORPUS, heldOut: "all", claims: { declared: changeClaim(specs) }, specs });
}

/** One row of the report: the mean of `pack.stability.moved` of one strategy for each kind of edit. */
export interface ChangeRow {
  strategy: string;
  /** The count of the records with the measure. */
  records: number;
  moved: Record<string, number>;
  /** The mean over the records of all kinds. */
  all: number;
  /** The mean of `pack.stability.mean` over the records of all kinds, in widths of the container. */
  distance: number;
}

/** This function gives the kind of a record from its input id. */
const kindOf = (input: string): string => /change-walk\.([a-z]+)\./.exec(input)![1]!;

/** This function gives the rows of the report from the records of a run. A record without a base has no stability measure. */
export function changeRows(records: readonly BenchRecord[], strategies: readonly string[]): ChangeRow[] {
  return strategies.map((strategy) => {
    const mine = records.filter((r) => r.strategy === strategy && isMeasured(r) && r.measures["pack.stability.moved"] !== undefined);
    const of = (r: BenchRecord, id: string): number => (r.measures as Record<string, number>)[id]!;
    const value = (r: BenchRecord): number => of(r, "pack.stability.moved");
    const moved = Object.fromEntries(CHANGE_WALK_KINDS.map((kind) => [kind, mean(mine.filter((r) => kindOf(r.input) === kind).map(value))]));
    return { strategy, records: mine.length, moved, all: mean(mine.map(value)), distance: mean(mine.map((r) => of(r, "pack.stability.mean"))) };
  });
}

/** This function gives the report as a Markdown table. The numbers have at most 3 decimals. */
export function changeMarkdown(rows: readonly ChangeRow[]): string {
  const n = (x: number): string => String(Math.round(x * 1000) / 1000);
  const lines = [
    `| Strategy | Records | ${CHANGE_WALK_KINDS.map((k) => `\`${k}\``).join(" | ")} | All | Mean distance |`,
    `|---|---|${CHANGE_WALK_KINDS.map(() => "---").join("|")}|---|---|`,
    ...rows.map((r) => `| \`${r.strategy}\` | ${r.records} | ${CHANGE_WALK_KINDS.map((k) => n(r.moved[k]!)).join(" | ")} | ${n(r.all)} | ${n(r.distance)} |`),
  ];
  return `${lines.join("\n")}\n`;
}

/** The method of the read by step. One wording: a page that shows the read quotes this line. */
export const CHANGE_METHOD =
  "A strategy of the mode `incremental` gets its own output at the base as `previous`. Each other strategy packs each step with no `previous`, so its row compares two packs from nothing. Step 0 has no base, so it is in the count of step 0 and in no other figure.";

/** One row of the read by step. A figure with no value is `undefined`. */
export interface StepRow {
  strategy: string;
  comparison: "previous" | "no previous";
  /** The measured records of step 0. They pack from nothing, so no figure reads them. */
  stepZero: number;
  /** The measured records of the steps with a base. */
  steps: number;
  /** The records of the steps with a base that a budget or a lost base stopped. */
  censored: number;
  /** The measured records of the steps that have a value of `pack.stability.moved`. */
  withMoved: number;
  moved: number | undefined;
  fill: number | undefined;
  stepMs: number | undefined;
}

/** This function gives the read by step of each strategy. The set `roots` holds the inputs of step 0. */
export function stepRows(records: readonly BenchRecord[], strategies: readonly string[], roots: ReadonlySet<string>): StepRow[] {
  const average = (values: readonly number[]): number | undefined => (values.length === 0 ? undefined : mean(values));
  return strategies.map((strategy) => {
    const mine = records.filter((r) => r.strategy === strategy);
    const measured = mine.filter(isMeasured);
    const steps = measured.filter((r) => !roots.has(r.input));
    const values = (id: string): number[] => steps.flatMap((r) => ((r.measures as Record<string, number | undefined>)[id] === undefined ? [] : [(r.measures as Record<string, number>)[id]!]));
    const moved = values("pack.stability.moved");
    return {
      strategy,
      comparison: benchStrategy(benchEntry(strategy).strategy).supports.mode.includes("incremental") ? "previous" : "no previous",
      stepZero: measured.length - steps.length,
      steps: steps.length,
      censored: mine.filter((r) => !isMeasured(r) && !roots.has(r.input) && STOPPED.has(r.skipped)).length,
      withMoved: moved.length,
      moved: average(moved),
      fill: average(values("pack.fill")),
      stepMs: steps.length === 0 ? undefined : median(steps.map((r) => r.ms)),
    };
  });
}

/** This function gives the read by step as the method line and a Markdown table. */
export function stepMarkdown(rows: readonly StepRow[]): string {
  const n = (x: number | undefined): string => (x === undefined ? "-" : String(Math.round(x * 1000) / 1000));
  return [
    CHANGE_METHOD,
    "",
    "| Strategy | Comparison | Step 0 | Steps | Censored | Steps with a move value | Mean moved | Mean fill | Median step ms |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| \`${r.strategy}\` | ${r.comparison} | ${r.stepZero} | ${r.steps} | ${r.censored} | ${r.withMoved} | ${n(r.moved)} | ${n(r.fill)} | ${n(r.stepMs)} |`),
    "",
  ].join("\n");
}

/** The facts of the computer of a report. The report reads no time, so they do not count. */
const ENV: BenchEnv = { node: process.version, os: "local", arch: "local", runner: "local", cpu: "local", cpus: 1 };

/** This function gives the records of the report of some strategies. */
export function changeRecords(strategies: readonly string[], text: string = changeCorpusText()): readonly BenchRecord[] {
  let t = 0;
  const { records } = runBench({
    corpus: parseCorpus(text, CHANGE_CORPUS),
    prediction: "k48-change-report",
    strategies,
    repeats: 1,
    warmup: 0,
    env: ENV,
    clock: () => t++,
  });
  return records;
}

/** This function starts the builder. */
function main(): void {
  const text = changeCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(CHANGE_FILE, "utf8") !== text) {
      console.error(`${CHANGE_FILE} is not the output of the builder. Start node bench/change.ts.`);
      process.exitCode = 1;
    }
  } else if (process.argv.includes("--steps")) {
    // The read by step of the folders of a run: node bench/change.ts --steps <run dir>...
    const records = process.argv.slice(process.argv.indexOf("--steps") + 1).flatMap((dir) => parseRecords(readFileSync(join(dir, "records.jsonl"), "utf8")));
    const roots = new Set(corpus(CHANGE_CORPUS, changeSpecs()).inputs.flatMap((file) => (file.base === undefined ? [file.id] : [])));
    process.stdout.write(stepMarkdown(stepRows(records, [...new Set(records.map((r) => r.strategy))], roots)));
  } else if (process.argv.includes("--report")) {
    const at = process.argv.indexOf("--strategies");
    const strategies = at === -1 ? CHANGE_STRATEGIES : process.argv[at + 1]!.split(",");
    process.stdout.write(changeMarkdown(changeRows(changeRecords(strategies), strategies)));
  } else {
    writeFileSync(CHANGE_FILE, text);
    console.log(`${CHANGE_FILE}: ${changeSpecs().length} specs`);
  }
}

if (process.argv[1]?.endsWith("change.ts")) main();
