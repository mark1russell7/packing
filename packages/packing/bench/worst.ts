// The builder of the corpus `pack-worst-v1` of roadmap item k107: the adversarial families and the scaling ladder. The
// file `bench/corpora/pack-worst-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/worst.ts            writes the file
//   node bench/worst.ts --check    exits with the code 1 when the file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, LADDER_RUNGS, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";

/** The name of the corpus. */
export const WORST_CORPUS = "pack-worst-v1";

/** The seeds of each spec of an adversarial family. */
export const WORST_SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/** The seeds of each spec of the ladder. */
export const LADDER_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);

/** The file of the corpus. */
export const WORST_FILE: string = join(import.meta.dirname, "corpora", `${WORST_CORPUS}.json`);

/** The containers of each adversarial family. */
const CONTAINERS = ["fixed", "freeHeight"];

/** The adversarial families: the generator, its dimension, the values of the dimension and the counts. */
const ADVERSARIAL: readonly (readonly [string, string, readonly number[], readonly number[]])[] = [
  ["tall-row", "ratio", [1, 2, 4, 8, 16, 32], [100, 400]],
  ["skyline-gap", "ratio", [1, 2, 4, 8, 16, 32], [100, 400]],
  ["bl-trap", "stages", [2, 3], [60, 120, 240]],
  ["half-wide", "excess", [1, 2, 3, 4], [60, 120, 240]],
];

/**
 * This function gives the specs of the corpus. Each adversarial family has each value of its dimension, the containers
 * `fixed` and `freeHeight`, and its counts, with the seeds of `WORST_SEEDS`. The ladder has each rung of the axes
 * `count` and `ratio`, with the seeds of `LADDER_SEEDS`.
 */
export function worstSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const [generator, dimension, values, counts] of ADVERSARIAL) {
    for (const value of values) {
      for (const containerSize of CONTAINERS) {
        for (const count of counts) specs.push({ generator, version: 1, params: { [dimension]: value, containerSize, count }, seeds: WORST_SEEDS });
      }
    }
  }
  for (const axis of ["count", "ratio"]) {
    for (let rung = 0; rung <= LADDER_RUNGS; rung++) specs.push({ generator: "ladder", version: 1, params: { axis, rung, count: 100 }, seeds: LADDER_SEEDS });
  }
  return specs;
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function worstClaim(specs: readonly CorpusSpec[] = worstSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(WORST_CORPUS, specs).inputs.map(toPackInput));
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
export function worstCorpusText(): string {
  const specs = worstSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(WORST_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: worstClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("worst.ts") === true) {
  const text = worstCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(WORST_FILE, "utf8") !== text) {
      console.error(`${WORST_FILE} is not the output of the builder. Start node bench/worst.ts.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(WORST_FILE, text);
    console.log(`${WORST_FILE}: ${worstSpecs().length} specs`);
  }
}
