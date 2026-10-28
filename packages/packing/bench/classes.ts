// The builder of the corpus `pack-classes-v1` of roadmap item k106: the classes I to X of the literature. The file
// `bench/corpora/pack-classes-v1.json` is its output. A test compares the file with the builder.
//
//   node bench/classes.ts            writes the file
//   node bench/classes.ts --check    exits with the code 1 when the file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLASS_COUNTS, corpus, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";

/** The name of the corpus. */
export const CLASSES_CORPUS = "pack-classes-v1";

/** The seeds of each spec. */
export const CLASSES_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);

/** The file of the corpus. */
export const CLASSES_FILE: string = join(import.meta.dirname, "corpora", `${CLASSES_CORPUS}.json`);

/** The classes of each generator. */
const CLASSES: readonly (readonly [string, readonly string[]])[] = [
  ["berkey-wang", ["I", "II", "III", "IV", "V", "VI"]],
  ["martello-vigo", ["VII", "VIII", "IX", "X"]],
];

/**
 * This function gives the specs of the corpus: each class, the containers `fixed` and `freeHeight`, and the counts 20,
 * 40, 60, 80 and 100. Each spec has the seeds of `CLASSES_SEEDS`.
 */
export function classesSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const [generator, classes] of CLASSES) {
    for (const cls of classes) {
      for (const containerSize of ["fixed", "freeHeight"]) {
        for (const count of CLASS_COUNTS) specs.push({ generator, version: 1, params: { class: cls, containerSize, count }, seeds: CLASSES_SEEDS });
      }
    }
  }
  return specs;
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function classesClaim(specs: readonly CorpusSpec[] = classesSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(CLASSES_CORPUS, specs).inputs.map(toPackInput));
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
export function classesCorpusText(): string {
  const specs = classesSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(CLASSES_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: classesClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("classes.ts") === true) {
  const text = classesCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(CLASSES_FILE, "utf8") !== text) {
      console.error(`${CLASSES_FILE} is not the output of the builder. Start node bench/classes.ts.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(CLASSES_FILE, text);
    console.log(`${CLASSES_FILE}: ${classesSpecs().length} specs`);
  }
}
