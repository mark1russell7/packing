// The family prior of the coverage (k116, k119). The prior gives each generator family of the sampler a weight.
// The default prior `union` counts the distinct inputs of each family over all the committed corpora of `bench/corpora`.
// The prior `corpus` of k116 counts the inputs of the grid manifest only. `bench/coverage.ts` uses the weights.
//
// `docs/BENCH.md` ("The space coverage") tells how to read the prior.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusFamilies } from "@mark1russell7/packing";

/** The kinds of the family prior: `union` of all the committed corpora (k119), or `corpus` of the grid manifest only (k116). */
export const PRIOR_KINDS = Object.freeze(["union", "corpus"] as const);

/** A kind of the family prior. `PRIOR_KINDS` gives each kind. */
export type PriorKind = (typeof PRIOR_KINDS)[number];

/** The default kind of the family prior. */
export const DEFAULT_PRIOR: PriorKind = "union";

/** The folder of the committed corpora. */
export const CORPORA_DIR: string = join(import.meta.dirname, "corpora");

/** The weight of each generator family, by its key `<name>@<version>`. The weights add up to 1. */
export type FamilyPrior = ReadonlyMap<string, number>;

/** The parts of a corpus file that the prior reads: the specs with their seeds, or the inputs with their generators. */
export interface PriorManifest {
  readonly corpus: string;
  readonly specs?: readonly { readonly generator: string; readonly version?: number; readonly params?: Readonly<Record<string, unknown>>; readonly seeds: readonly number[] }[];
  readonly inputs?: readonly { readonly id: string; readonly seed?: number; readonly generator?: { readonly name: string; readonly version?: number; readonly params?: Readonly<Record<string, unknown>>; readonly seed?: number } }[];
}

/** This function gives the key of a generator family: `<name>@<version>`. The sampler counts its pairs by this key. */
export const familyKey = (name: string, version = 1): string => `${name}@${version}`;

/** The families that the sampler of `bench/sample-space.ts` draws, by key, in the order of `corpusFamilies`. */
export const SAMPLER_FAMILIES: readonly string[] = Object.freeze(corpusFamilies.map((f) => familyKey(f.name, f.version)));

/**
 * The corpus families that do not map to a sampler family of the same key. The value is the sampler family, or `null` for no family.
 * An `adversary` input is a searched worst case, not a draw of its origin family. Thus it gives no weight.
 */
export const PRIOR_ALIASES: Readonly<Record<string, string | null>> = Object.freeze({ "adversary@1": null });

/**
 * This function gives the sampler family of a corpus family, or `null` when the sampler does not draw it.
 * An alias of `PRIOR_ALIASES` wins. Then a corpus family maps to the sampler family with the same key.
 */
export function samplerFamilyOf(family: string, sampler: readonly string[] = SAMPLER_FAMILIES): string | null {
  if (Object.hasOwn(PRIOR_ALIASES, family)) return PRIOR_ALIASES[family]!;
  return sampler.includes(family) ? family : null;
}

/** One family of the prior: its key, its count of distinct inputs in the corpora and its weight, rounded to 4 decimals. */
export interface PriorFamily {
  readonly family: string;
  readonly inputs: number;
  readonly weight: number;
}

/** The basis of a family prior: its kind, its corpora and the weight of each family. `coverage.json` keeps it in the field `prior`. */
export interface PriorBasis {
  readonly kind: PriorKind;
  /** The ids of the corpora of the weights, sorted. */
  readonly corpora: readonly string[];
  /** The count of the distinct inputs of the corpora in a sampler family. */
  readonly inputs: number;
  /** Each sampler family with inputs, in the order of the sampler, with its weight. */
  readonly families: readonly PriorFamily[];
  /** The sampler families without an input in the corpora. Their weight is 0. */
  readonly absent: readonly string[];
  /** The corpus families that the sampler does not draw, with their inputs. They give no weight. */
  readonly unmapped: readonly { readonly family: string; readonly inputs: number }[];
}

/** This function gives the JSON text of a value with sorted keys. Thus two equal params give the same text. */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : typeof v === "object" && v !== null
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

/** This function gives each input of a manifest as its family key and its identity: the family, the params and the seed. */
function inputsOf(m: PriorManifest): { family: string; id: string }[] {
  const out: { family: string; id: string }[] = [];
  if (m.specs !== undefined && m.specs.length > 0) {
    for (const s of m.specs) {
      const family = familyKey(s.generator, s.version);
      for (const seed of s.seeds) out.push({ family, id: `${family}|${canonical(s.params ?? {})}|${seed}` });
    }
    return out;
  }
  for (const i of m.inputs ?? []) {
    const g = i.generator;
    if (g === undefined) continue;
    const family = familyKey(g.name, g.version);
    out.push({ family, id: `${family}|${canonical(g.params ?? {})}|${i.seed ?? g.seed ?? i.id}` });
  }
  return out;
}

/**
 * This function gives the basis of a family prior from some corpora.
 *
 * 1. Each corpus gives its inputs: a spec with each seed, or an input with its generator.
 * 2. The union keeps each distinct input one time. Two inputs are the same when their family, params and seed are the same.
 * 3. `samplerFamilyOf` maps the family of each input to a sampler family.
 * 4. The weight of a sampler family is its count of inputs over the inputs of all the sampler families.
 *
 * The order of the corpora does not change the result.
 */
export function priorBasis(manifests: readonly PriorManifest[], kind: PriorKind = DEFAULT_PRIOR, sampler: readonly string[] = SAMPLER_FAMILIES): PriorBasis {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const other = new Map<string, number>();
  for (const m of manifests) {
    for (const { family, id } of inputsOf(m)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const to = samplerFamilyOf(family, sampler);
      if (to === null) other.set(family, (other.get(family) ?? 0) + 1);
      else counts.set(to, (counts.get(to) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, c) => sum + c, 0);
  return {
    kind,
    corpora: [...new Set(manifests.map((m) => m.corpus))].sort(),
    inputs: total,
    families: sampler.filter((f) => counts.has(f)).map((f) => ({ family: f, inputs: counts.get(f)!, weight: Math.round((counts.get(f)! / total) * 1e4) / 1e4 })),
    absent: sampler.filter((f) => !counts.has(f)),
    unmapped: [...other].sort(([a], [b]) => a.localeCompare(b)).map(([family, inputs]) => ({ family, inputs })),
  };
}

/** This function gives the weights of a basis, from the counts of the inputs, without rounding. The weights add up to 1. */
export function priorWeights(basis: PriorBasis): FamilyPrior {
  return new Map(basis.families.map((f) => [f.family, basis.inputs === 0 ? 0 : f.inputs / basis.inputs]));
}

/** This function gives the corpora of a folder: each `.json` file, in the order of the file names. */
export function readCorpora(dir: string = CORPORA_DIR): PriorManifest[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as PriorManifest);
}

/** The basis of the union prior of each folder, read one time. */
const unionMemo = new Map<string, PriorBasis>();

/** This function gives the basis of the union prior of the committed corpora of a folder. The function reads the folder one time. */
export function unionPrior(dir: string = CORPORA_DIR): PriorBasis {
  let b = unionMemo.get(dir);
  if (b === undefined) {
    b = priorBasis(readCorpora(dir), "union");
    unionMemo.set(dir, b);
  }
  return b;
}

/** This function gives the text of a basis for the command line. The text has the corpora, the weights and the families without a weight. */
export function basisLines(b: PriorBasis): string[] {
  const kind = b.kind === "union" ? `the union of ${b.corpora.length} corpora (${b.corpora.join(", ")})` : `the corpus ${b.corpora.join(", ")}`;
  const out = [`The family prior: ${kind}, ${b.inputs} distinct inputs. Weights: ${b.families.map((f) => `${f.family} ${f.weight} (${f.inputs})`).join(", ")}.`];
  if (b.absent.length > 0) out.push(`Sampler families without inputs, with the weight 0: ${b.absent.join(", ")}.`);
  if (b.unmapped.length > 0) out.push(`Corpus families that the sampler does not draw, with no weight: ${b.unmapped.map((f) => `${f.family} (${f.inputs})`).join(", ")}.`);
  return out;
}
