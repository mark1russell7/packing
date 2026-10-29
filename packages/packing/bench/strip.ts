// The builder of the corpus `pack-strip-v1` of roadmap item k46: the published sets of strip packing, made by their
// rules. The file `bench/corpora/pack-strip-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/strip.ts            writes the file
//   node bench/strip.ts --check    exits with the code 1 when the file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BEASLEY_GCUT_COUNTS, BEASLEY_GCUT_SIDES, BURKE_KENDALL_WHITWELL_RULES, corpus, HOPPER_TURTON_RULES, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";

/** The name of the corpus. */
export const STRIP_CORPUS = "pack-strip-v1";

/** The seeds of each spec of `hopper-turton` and `burke-kendall-whitwell`. */
export const PERFECT_STRIP_SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/** The seeds of each spec of `beasley-gcut`. */
export const GCUT_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);

/** The file of the corpus. */
export const STRIP_FILE: string = join(import.meta.dirname, "corpora", `${STRIP_CORPUS}.json`);

/** The containers and the cuts of each spec. */
const CONTAINERS = ["fixed", "freeHeight"];
const CUTS = ["guillotine", "free"];

/**
 * This function gives the specs of the corpus:
 *
 * - `hopper-turton` with each category, each problem, each cut and each container, with the seeds of `PERFECT_STRIP_SEEDS`.
 * - `burke-kendall-whitwell` with each problem, each cut and each container, with the seeds of `PERFECT_STRIP_SEEDS`.
 * - `beasley-gcut` with each side and each count of the problems gcut 1 to 12, and each container, with the seeds of `GCUT_SEEDS`.
 */
export function stripSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const category of Object.keys(HOPPER_TURTON_RULES)) {
    for (const problem of [1, 2, 3]) {
      for (const cut of CUTS) {
        for (const containerSize of CONTAINERS) specs.push({ generator: "hopper-turton", version: 1, params: { category, problem, cut, containerSize }, seeds: PERFECT_STRIP_SEEDS });
      }
    }
  }
  for (const instance of Object.keys(BURKE_KENDALL_WHITWELL_RULES)) {
    for (const cut of CUTS) {
      for (const containerSize of CONTAINERS) specs.push({ generator: "burke-kendall-whitwell", version: 1, params: { instance, cut, containerSize }, seeds: PERFECT_STRIP_SEEDS });
    }
  }
  for (const side of BEASLEY_GCUT_SIDES) {
    for (const containerSize of CONTAINERS) {
      for (const count of BEASLEY_GCUT_COUNTS) specs.push({ generator: "beasley-gcut", version: 1, params: { side, containerSize, count }, seeds: GCUT_SEEDS });
    }
  }
  return specs;
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function stripClaim(specs: readonly CorpusSpec[] = stripSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(STRIP_CORPUS, specs).inputs.map(toPackInput));
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
export function stripCorpusText(): string {
  const specs = stripSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(STRIP_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: stripClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("strip.ts") === true) {
  const text = stripCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(STRIP_FILE, "utf8") !== text) {
      console.error(`${STRIP_FILE} is not the output of the builder. Start node bench/strip.ts.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(STRIP_FILE, text);
    console.log(`${STRIP_FILE}: ${stripSpecs().length} specs`);
  }
}
