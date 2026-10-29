// The builder of the corpus `pack-anchor-v1` of roadmap item k111: the inputs with locked items on the walls. The file
// `bench/corpora/pack-anchor-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/anchor.ts                                 writes the file
//   node bench/anchor.ts --check                         exits with the code 1 when the file is not the output of the builder
//   node bench/anchor.ts --report [--strategies a,b]     packs the corpus and writes the medians of pack.anchor.* for each strategy
//
// The report reads no time. Its numbers are the same on each computer.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, toPackInput, WALL_LOCKS_MAX, type CorpusSpec } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";
import { isMeasured, median, parseCorpus, runBench, type BenchEnv, type BenchRecord } from "./run.ts";

/** The name of the corpus. */
export const ANCHOR_CORPUS = "pack-anchor-v1";

/** The seeds of each spec. */
export const ANCHOR_SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/** The file of the corpus. */
export const ANCHOR_FILE: string = join(import.meta.dirname, "corpora", `${ANCHOR_CORPUS}.json`);

/** The strategies of the report: 6 entries of `bench/entries.ts`. */
export const ANCHOR_STRATEGIES: readonly string[] = Object.freeze(["rows", "skyline", "maxrects-bl", "shelf-best", "restarts-maxrects-bl-k16", "select-rows-bl"]);

/** The ids of the columns of the report. */
const COLUMNS = ["pack.anchor.mean", "pack.anchor.max", "pack.anchor.moved", "pack.anchor.gain"] as const;

/**
 * This function gives the specs of the corpus. `wall-locks` has each count of locks from 1 to 4, the containers `fixed`
 * and `freeHeight`, and the counts 20 and 40. The case `touchObstacles` of `edge-cases` adds its one locked item.
 */
export function anchorSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (let locks = 1; locks <= WALL_LOCKS_MAX; locks++) {
    for (const containerSize of ["fixed", "freeHeight"]) {
      for (const count of [20, 40]) specs.push({ generator: "wall-locks", version: 1, params: { locks, containerSize, count }, seeds: ANCHOR_SEEDS });
    }
  }
  specs.push({ generator: "edge-cases", version: 1, params: { case: "touchObstacles", count: 12 }, seeds: ANCHOR_SEEDS });
  return specs;
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function anchorClaim(specs: readonly CorpusSpec[] = anchorSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(ANCHOR_CORPUS, specs).inputs.map(toPackInput));
  const minCount = 10;
  return { minCount, thin: Object.keys(counts).filter((id) => counts[id]! < minCount), counts };
}

/** This function gives a JSON value on one line, with a space after each colon and each comma. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")}}`;
  return JSON.stringify(value);
}

/** This function gives the text of the corpus file, in the form of the other files of `bench/corpora`: one spec on each line. */
export function anchorCorpusText(): string {
  const specs = anchorSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(ANCHOR_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: anchorClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

/** One row of the report: the medians of the measures `pack.anchor.*` of one strategy, and the share of the inputs that settle. */
export interface AnchorRow {
  strategy: string;
  inputs: number;
  medians: Record<(typeof COLUMNS)[number], number>;
  settled: number;
}

/** This function gives the rows of the report from the records of a run with the option `anchor`. */
export function anchorRows(records: readonly BenchRecord[], strategies: readonly string[]): AnchorRow[] {
  return strategies.map((id) => {
    const mine = records.filter((r) => r.strategy === id && isMeasured(r) && r.measures["pack.anchor.mean"] !== undefined);
    const of = (m: string): number[] => mine.map((r) => r.measures[m]!);
    const medians = Object.fromEntries(COLUMNS.map((m) => [m, median(of(m))])) as AnchorRow["medians"];
    const settled = mine.length === 0 ? 0 : of("pack.anchor.settled").reduce((s, x) => s + x, 0) / mine.length;
    return { strategy: id, inputs: mine.length, medians, settled };
  });
}

/** This function gives the report as a Markdown table. The numbers have at most 3 decimals. */
export function anchorMarkdown(rows: readonly AnchorRow[]): string {
  const n = (x: number): string => String(Math.round(x * 1000) / 1000);
  const lines = [
    "| Strategy | Inputs | Median `mean` | Median `max` | Median `moved` | Median `gain` | Share settled |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| \`${r.strategy}\` | ${r.inputs} | ${COLUMNS.map((m) => n(r.medians[m])).join(" | ")} | ${n(r.settled)} |`),
  ];
  return `${lines.join("\n")}\n`;
}

/** The facts of the computer of a report. The report reads no time, so they do not count. */
const ENV: BenchEnv = { node: process.version, os: "local", arch: "local", runner: "local", cpu: "local", cpus: 1 };

if (process.argv[1]?.endsWith("anchor.ts") === true) {
  const text = anchorCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(ANCHOR_FILE, "utf8") !== text) {
      console.error(`${ANCHOR_FILE} is not the output of the builder. Start node bench/anchor.ts.`);
      process.exitCode = 1;
    }
  } else if (process.argv.includes("--report")) {
    const at = process.argv.indexOf("--strategies");
    const strategies = at === -1 ? ANCHOR_STRATEGIES : process.argv[at + 1]!.split(",");
    let t = 0;
    const { records } = runBench({
      corpus: parseCorpus(readFileSync(ANCHOR_FILE, "utf8"), ANCHOR_CORPUS),
      prediction: "k111-anchor-report",
      strategies,
      repeats: 1,
      warmup: 0,
      env: ENV,
      clock: () => t++,
      anchor: true,
    });
    process.stdout.write(anchorMarkdown(anchorRows(records, strategies)));
  } else {
    writeFileSync(ANCHOR_FILE, text);
    console.log(`${ANCHOR_FILE}: ${anchorSpecs().length} specs`);
  }
}
