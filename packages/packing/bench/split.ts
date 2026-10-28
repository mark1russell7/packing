// The split files of roadmap item k66, part 2 (`docs/BENCH.md`, "The split files"). A split file sits beside a corpus, not
// in it, so the corpus file and its hash do not change. A split is a list of folds. Each fold has training and held-out seeds.
// The checks of a split file are `checkSplit` and `splitFolds` of `@mark1russell7/layout-contract`. This file reads the files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusHashOf, splitFileName, splitFolds, type SplitCorpus, type SplitFold } from "@mark1russell7/layout-contract";

/** The folder of the split files */
export const SPLITS_DIR: string = join(import.meta.dirname, "splits");

/**
 * This function reads the split `name` of the corpus of a manifest from `dir`. The file is `<corpus>.<hash>.json`.
 * It throws an `Error` when no file has the hash of the corpus. `splitFolds` throws for a bad file and an unknown split name.
 */
export function loadSplit(manifest: SplitCorpus, name: string, dir: string = SPLITS_DIR): SplitFold[] {
  const hash = corpusHashOf(manifest.corpus, manifest.inputs);
  const path = join(dir, splitFileName(manifest.corpus, hash));
  if (!existsSync(path)) {
    const others = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${manifest.corpus}.`) && f.endsWith(".json")) : [];
    const known = others.length === 0 ? "No split file of the corpus exists." : `The split files of the corpus are ${others.join(", ")}, for other inputs.`;
    throw new Error(`The corpus ${manifest.corpus} has the hash ${hash}, and ${splitFileName(manifest.corpus, hash)} does not exist. ${known}`);
  }
  return splitFolds(JSON.parse(readFileSync(path, "utf8")) as unknown, manifest, name, `The split file ${path}`);
}
