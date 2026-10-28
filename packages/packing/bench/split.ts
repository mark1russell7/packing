// The split files of roadmap item k66, part 2 (`docs/BENCH.md`, "The split files"). A split file sits beside a corpus, not
// in it, so the corpus file and its hash do not change. A split is a list of folds. Each fold has training and held-out seeds.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@mark1russell7/packing";

/** The schema of a split file */
export const SPLIT_SCHEMA = "corpus-split/1";

/** The folder of the split files */
export const SPLITS_DIR: string = join(import.meta.dirname, "splits");

/** One fold of a split: the seeds that fit a selector and the seeds that score it */
export interface SplitFold {
  train: number[];
  heldOut: number[];
}

/** A split file: `<corpus id>.<corpus hash>.json` in `bench/splits` */
export interface SplitFile {
  schema: typeof SPLIT_SCHEMA;
  corpus: string;
  /** The hash of the corpus: `corpusHashOf` of its manifest */
  corpusHash: string;
  /** The splits by name. Each split has one fold or more. */
  splits: Record<string, { folds: SplitFold[] }>;
}

/** The fields of a manifest that the split code reads */
export interface SplitManifest {
  corpus: string;
  specs: readonly { seeds: readonly number[] }[];
  inputs: readonly { id: string; hash: string }[];
}

/**
 * This function gives the hash of a corpus: the first 16 hex characters of a SHA-256. The text of the SHA-256 is `canonicalJson`
 * of the corpus id and the `[id, hash]` of each input, in the order of the manifest. A change of one input changes it.
 */
export function corpusHashOf(manifest: Pick<SplitManifest, "corpus" | "inputs">): string {
  const text = canonicalJson({ corpus: manifest.corpus, inputs: manifest.inputs.map((i) => [i.id, i.hash]) });
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** This function gives the name of the split file of a corpus. */
export const splitFileName = (corpus: string, hash: string): string => `${corpus}.${hash}.json`;

/** This function tells if a value is a list of whole numbers. */
const isSeeds = (value: unknown): value is number[] => Array.isArray(value) && value.every((s) => Number.isInteger(s));

/**
 * This function gives the problems of a split file against a manifest: empty when the file is good.
 *
 * - The schema is `corpus-split/1`, the corpus is the id of the manifest and `corpusHash` is `corpusHashOf` of the manifest.
 * - Each split has one fold or more. In each fold, `train` and `heldOut` are lists of seeds, not empty and with no common seed.
 * - Each seed is a seed of a spec of the manifest.
 */
export function splitProblems(file: unknown, manifest: SplitManifest): string[] {
  const out: string[] = [];
  const f = file as Partial<SplitFile> | null;
  if (f === null || typeof f !== "object") return ["the split file is not an object"];
  if (f.schema !== SPLIT_SCHEMA) out.push(`the schema is ${String(f.schema)}, not ${SPLIT_SCHEMA}`);
  if (f.corpus !== manifest.corpus) out.push(`the corpus is ${String(f.corpus)}, not ${manifest.corpus}`);
  const hash = corpusHashOf(manifest);
  if (f.corpusHash !== hash) out.push(`the corpusHash is ${String(f.corpusHash)}, but the corpus gives ${hash}`);
  const seeds = new Set(manifest.specs.flatMap((s) => s.seeds));
  if (f.splits === null || typeof f.splits !== "object") return [...out, "the field splits is not an object"];
  for (const [name, split] of Object.entries(f.splits)) {
    const folds = (split as { folds?: unknown } | null)?.folds;
    if (!Array.isArray(folds) || folds.length === 0) {
      out.push(`the split ${name} has no folds`);
      continue;
    }
    folds.forEach((fold: Partial<SplitFold> | null, k) => {
      const at = `the fold ${k} of the split ${name}`;
      const { train, heldOut } = fold ?? {};
      if (!isSeeds(train) || train.length === 0) out.push(`${at} has no train seeds`);
      if (!isSeeds(heldOut) || heldOut.length === 0) out.push(`${at} has no heldOut seeds`);
      if (!isSeeds(train) || !isSeeds(heldOut)) return;
      const common = train.filter((s) => heldOut.includes(s));
      if (common.length > 0) out.push(`${at} has the seeds ${common.join(", ")} in train and in heldOut`);
      const unknown = [...train, ...heldOut].filter((s) => !seeds.has(s));
      if (unknown.length > 0) out.push(`${at} has the seeds ${unknown.join(", ")}, which are not in the corpus`);
    });
  }
  return out;
}

/**
 * This function reads the split `name` of the corpus of a manifest from `dir`. The file is `<corpus>.<hash>.json`.
 * It throws an `Error` when no file has the hash of the corpus, for each problem of `splitProblems` and for an unknown split name.
 */
export function loadSplit(manifest: SplitManifest, name: string, dir: string = SPLITS_DIR): SplitFold[] {
  const hash = corpusHashOf(manifest);
  const path = join(dir, splitFileName(manifest.corpus, hash));
  if (!existsSync(path)) {
    const others = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${manifest.corpus}.`) && f.endsWith(".json")) : [];
    const known = others.length === 0 ? "No split file of the corpus exists." : `The split files of the corpus are ${others.join(", ")}, for other inputs.`;
    throw new Error(`The corpus ${manifest.corpus} has the hash ${hash}, and ${splitFileName(manifest.corpus, hash)} does not exist. ${known}`);
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as SplitFile;
  const problems = splitProblems(file, manifest);
  if (problems.length > 0) throw new Error(`The split file ${path} is not good: ${problems.join("; ")}.`);
  const split = file.splits[name];
  if (split === undefined) throw new Error(`The split file ${path} has no split ${name}. Its splits are ${Object.keys(file.splits).join(", ")}.`);
  return split.folds.map((f) => ({ train: [...f.train], heldOut: [...f.heldOut] }));
}
