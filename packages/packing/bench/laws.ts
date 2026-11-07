// The builder of the corpus of the item laws, `pack-laws-v1` (roadmap item k190). The file in `bench/corpora` is its output.
// A test compares the file with the builder, and a test reads the laws of each spec back from its items.
//
//   node bench/laws.ts            writes the file
//   node bench/laws.ts --check    exits with the code 1 when the file is not the output of the builder

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, ITEM_AREA_LAWS, ITEM_ASPECT_LAWS, toPackInput, type CorpusSpec, type ItemAreaLaw, type ItemAspectLaw, type ItemAssortment } from "@mark1russell7/packing";
import type { DeclaredClaim } from "@mark1russell7/layout-contract";
import { declaredCounts } from "./claims.ts";
import type { LawCell } from "./law-cover.ts";

/** The name of the corpus of the item laws. */
export const LAWS_CORPUS = "pack-laws-v1";

/** The file of the corpus `pack-laws-v1`. */
export const LAWS_FILE: string = join(import.meta.dirname, "corpora", `${LAWS_CORPUS}.json`);

/** The seeds of a spec with the assortment `all-differ`. 4 seeds give 320 items, over the floor of 200 pooled items. */
export const LAWS_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4]);

/** The seeds of a spec with the assortment `few-types`. A pool of 24 inputs has 384 types, so the area law has enough distinct areas. */
export const FEW_TYPES_SEEDS: readonly number[] = Object.freeze(Array.from({ length: 24 }, (_, i) => i + 1));

/** This function gives the params of one spec of `item-law`. */
const lawSpec = (areaLaw: ItemAreaLaw, aspectLaw: ItemAspectLaw, assortment: ItemAssortment, seeds: readonly number[]): CorpusSpec => ({
  generator: "item-law",
  version: 1,
  params: { areaLaw, aspectLaw, assortment },
  seeds,
});

/**
 * This function gives the specs of `pack-laws-v1`. Each area law and each aspect law has a spec with the assortment `all-differ`: 45 specs.
 * Each area law also has a spec with the assortment `few-types`, with the aspect laws in turn: 9 specs. Thus each aspect law has a `few-types` spec.
 */
export function lawsSpecs(): CorpusSpec[] {
  const specs: CorpusSpec[] = [];
  for (const area of ITEM_AREA_LAWS) for (const aspect of ITEM_ASPECT_LAWS) specs.push(lawSpec(area, aspect, "all-differ", LAWS_SEEDS));
  ITEM_AREA_LAWS.forEach((area, i) => specs.push(lawSpec(area, ITEM_ASPECT_LAWS[i % ITEM_ASPECT_LAWS.length]!, "few-types", FEW_TYPES_SEEDS)));
  return specs;
}

/**
 * This function gives the cell that the items of a spec give to `bench/law-cover.ts`. The cell has the laws of the params.
 * Identical areas with the aspect law `fixed` or `discrete` give 1 to 5 types, so their assortment is `few-types`.
 */
export function namedCell(spec: CorpusSpec): LawCell {
  const p = spec.params as { areaLaw: ItemAreaLaw; aspectLaw: ItemAspectLaw; assortment: ItemAssortment };
  const fewSizes = p.areaLaw === "identical" && (p.aspectLaw === "fixed" || p.aspectLaw === "discrete");
  return { area: p.areaLaw, aspect: p.aspectLaw, assortment: fewSizes ? "few-types" : p.assortment };
}

/** This function gives the claim `declared` of the corpus. Each property with fewer inputs than `minCount` is in `thin`. */
export function lawsClaim(specs: readonly CorpusSpec[] = lawsSpecs()): DeclaredClaim {
  const counts = declaredCounts(corpus(LAWS_CORPUS, specs).inputs.map(toPackInput));
  const minCount = 10;
  return { minCount, thin: Object.keys(counts).filter((id) => counts[id]! < minCount), counts };
}

/** This function gives a JSON value on one line, with a space after each colon and each comma. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")}}`;
  return JSON.stringify(value);
}

/** This function gives the text of the file of `pack-laws-v1`, in the form of the other files of `bench/corpora`: one spec on each line. */
export function lawsCorpusText(): string {
  const specs = lawsSpecs();
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(LAWS_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "claims": ${inline({ declared: lawsClaim(specs) })},`,
    `  "specs": [`,
    specs.map((s) => `    ${inline(s)}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("laws.ts") === true) {
  const text = lawsCorpusText();
  if (process.argv.includes("--check")) {
    if (readFileSync(LAWS_FILE, "utf8") !== text) {
      console.error(`${LAWS_FILE} is not the output of the builder. Start node bench/laws.ts.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(LAWS_FILE, text);
    console.log(`${LAWS_FILE}: ${text.split("\n").length} lines`);
  }
}
