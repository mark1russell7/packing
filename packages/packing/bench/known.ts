// The builder of the corpus `pack-known-v1` of roadmap item k45: inputs with a known best value. The file
// `bench/corpora/pack-known-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/known.ts            writes the file
//   node bench/known.ts --check    exits with the code 1 when the file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";

/** The name of the corpus. */
export const KNOWN_CORPUS = "pack-known-v1";

/** The counts of the boxes of each spec. */
export const KNOWN_COUNTS: readonly number[] = Object.freeze([10, 30, 100]);

/** The seeds of each spec. */
export const KNOWN_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

/** The file of the corpus. */
export const KNOWN_FILE: string = join(import.meta.dirname, "corpora", `${KNOWN_CORPUS}.json`);

/**
 * This function gives the specs of the corpus: `perfect-cut` with each cut, each size and each count, then
 * `consecutive-squares` with each size and each count. Each spec has the seeds of `KNOWN_SEEDS`.
 */
export function knownSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const cut of ["guillotine", "free"]) {
    for (const containerSize of ["fixed", "freeHeight", "freeArea"]) {
      for (const count of KNOWN_COUNTS) specs.push({ generator: "perfect-cut", version: 1, params: { cut, containerSize, count }, seeds: KNOWN_SEEDS });
    }
  }
  for (const containerSize of ["freeHeight", "freeArea"]) {
    for (const count of KNOWN_COUNTS) specs.push({ generator: "consecutive-squares", version: 1, params: { containerSize, count }, seeds: KNOWN_SEEDS });
  }
  return specs;
}

/**
 * This function gives the claim `declared` of the corpus. The counts come from the inputs. Each property with fewer
 * inputs than `minCount` is in `thin`.
 */
export function knownClaim(specs: readonly CorpusSpec[] = knownSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(KNOWN_CORPUS, specs).inputs.map(toPackInput));
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
export function knownCorpusText(): string {
  const specs = knownSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(KNOWN_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: knownClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("known.ts") === true) {
  const text = knownCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(KNOWN_FILE, "utf8") !== text) {
      console.error(`${KNOWN_FILE} is not the output of the builder. Start node bench/known.ts.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(KNOWN_FILE, text);
    console.log(`${KNOWN_FILE}: ${knownSpecs().length} specs`);
  }
}
