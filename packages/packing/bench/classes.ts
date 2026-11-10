// The builder of the corpora of the classes I to X of the literature. The corpus `pack-classes-v1` is roadmap item k106.
// The corpus `pack-classes-free-v1` is roadmap items k158 and k160. The files in `bench/corpora` are its output. A test compares each file with the builder.
//
//   node bench/classes.ts            writes the files
//   node bench/classes.ts --check    exits with the code 1 when a file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLASS_COUNTS, corpus, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import { CORPUS_MANIFEST_SCHEMA, corpusManifestText, type DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";

/** The name of the corpus of the bins and the strips. */
export const CLASSES_CORPUS = "pack-classes-v1";

/** The name of the corpus of the free forms and the small strips. */
export const CLASSES_FREE_CORPUS = "pack-classes-free-v1";

/** The counts of the small strips of `pack-classes-free-v1`. The strategy `exact-strip` takes at most 16 items. */
export const CLASS_STRIP_COUNTS: readonly number[] = Object.freeze([8, 16]);

/** The seeds of each spec. */
export const CLASSES_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);

/** The file of the corpus `pack-classes-v1`. */
export const CLASSES_FILE: string = join(import.meta.dirname, "corpora", `${CLASSES_CORPUS}.json`);

/** The file of the corpus `pack-classes-free-v1`. */
export const CLASSES_FREE_FILE: string = join(import.meta.dirname, "corpora", `${CLASSES_FREE_CORPUS}.json`);

/** The classes of each generator. */
const CLASSES: readonly (readonly [string, readonly string[]])[] = [
  ["berkey-wang", ["I", "II", "III", "IV", "V", "VI"]],
  ["martello-vigo", ["VII", "VIII", "IX", "X"]],
];

/** This function gives a spec for each class, each container and each count. Each spec has the seeds of `CLASSES_SEEDS`. */
function specsOf(containers: readonly string[], counts: readonly number[]): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const [generator, classes] of CLASSES) {
    for (const cls of classes) {
      for (const containerSize of containers) {
        for (const count of counts) specs.push({ generator, version: 1, params: { class: cls, containerSize, count }, seeds: CLASSES_SEEDS });
      }
    }
  }
  return specs;
}

/** This function gives the specs of `pack-classes-v1`: each class, the containers `fixed` and `freeHeight`, and the counts 20, 40, 60, 80 and 100. */
export function classesSpecs(): CorpusSpec[] {
  return specsOf(["fixed", "freeHeight"], CLASS_COUNTS);
}

/**
 * This function gives the specs of `pack-classes-free-v1`: each class with `freeAspect` and `freeArea` at the counts 20, 40, 60, 80 and 100.
 * Each class also has `freeHeight` at the counts of `CLASS_STRIP_COUNTS`.
 */
export function classesFreeSpecs(): CorpusSpec[] {
  return [...specsOf(["freeAspect", "freeArea"], CLASS_COUNTS), ...specsOf(["freeHeight"], CLASS_STRIP_COUNTS)];
}

/** This function gives the claim `declared` of a corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function classesClaim(specs: readonly CorpusSpec[] = classesSpecs(), name: string = CLASSES_CORPUS): DeclaredClaim {
  const counts = declaredCounts(corpus(name, specs).inputs.map(toPackInput));
  const minCount = 10;
  return { minCount, thin: Object.keys(counts).filter((id) => counts[id]! < minCount), counts };
}

/** This function gives the text of a corpus file, in the form of the other files of `bench/corpora`: one spec on each line. */
function corpusText(name: string, specs: readonly CorpusSpec[]): string {
  return corpusManifestText({ schema: CORPUS_MANIFEST_SCHEMA, corpus: name, heldOut: "all", claims: { declared: classesClaim(specs, name) }, specs });
}

/** This function gives the text of the file of `pack-classes-v1`. */
export function classesCorpusText(): string {
  return corpusText(CLASSES_CORPUS, classesSpecs());
}

/** This function gives the text of the file of `pack-classes-free-v1`. */
export function classesFreeCorpusText(): string {
  return corpusText(CLASSES_FREE_CORPUS, classesFreeSpecs());
}

if (process.argv[1]?.endsWith("classes.ts") === true) {
  for (const [file, text] of [[CLASSES_FILE, classesCorpusText()], [CLASSES_FREE_FILE, classesFreeCorpusText()]] as const) {
    if (process.argv.includes("--check")) {
      if (readFileSync(file, "utf8") !== text) {
        console.error(`${file} is not the output of the builder. Start node bench/classes.ts.`);
        process.exitCode = 1;
      }
    } else {
      writeFileSync(file, text);
      console.log(`${file}: ${text.split("\n").length} lines`);
    }
  }
}
