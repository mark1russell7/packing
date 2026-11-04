// The family prior of the coverage (k116, k119, k122). The prior gives each generator family of the sampler a weight.
// The default prior `family-flat` gives each sampler family the same weight. The prior `union` counts the distinct inputs of each
// family over all the committed corpora of `bench/corpora`. The prior `tempered` takes those counts to a power.
// The prior `corpus` of k116 counts the inputs of the grid manifest only. `bench/coverage.ts` uses the weights.
//
// `docs/BENCH.md` ("The space coverage") tells how to read the prior.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusFamilies } from "@mark1russell7/packing";

/**
 * The kinds of the family prior.
 * - `union`: the inputs of each family in all the committed corpora (k119).
 * - `corpus`: the inputs of each family in the grid manifest only (k116).
 * - `family-flat`: the same weight for each sampler family (k122).
 * - `tempered`: the inputs of `union` to a power (k122).
 */
export const PRIOR_KINDS = Object.freeze(["union", "corpus", "family-flat", "tempered"] as const);

/** A kind of the family prior. `PRIOR_KINDS` gives each kind. */
export type PriorKind = (typeof PRIOR_KINDS)[number];

/** The default kind of the family prior: the headline of the coverage (k122). A realistic input means the families, not the count of the grids in the corpora. */
export const DEFAULT_PRIOR: PriorKind = "family-flat";

/** The kind of the prior that the coverage shows beside the headline. */
export const BESIDE_PRIOR: PriorKind = "union";

/** The default power of the prior `tempered`. The power 1 gives `union`, and the power 0 gives the same weight to each family with inputs. */
export const DEFAULT_TEMPER = 0.5;

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

/** The corpus families that are a stratum of their own. They give no weight, and the basis gives their inputs apart. An `adversary` input is a deliberate worst case. */
export const PRIOR_STRATA: readonly string[] = Object.freeze(["adversary@1"]);

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
  /** The families of `PRIOR_STRATA` in the corpora, with their inputs. A basis from before k122 does not have it. */
  readonly strata?: readonly { readonly family: string; readonly inputs: number }[];
  /** The power of the prior `tempered`. Another kind does not have it. */
  readonly power?: number;
}

/** This function gives the weight of a family before the scale: the count of its inputs, or the count to the power of the prior. */
function rawWeight(kind: PriorKind, inputs: number, power: number): number {
  if (kind === "family-flat") return 1;
  return kind === "tempered" ? inputs ** power : inputs;
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
 * 4. The prior `union` or `corpus` gives a sampler family its count of inputs over the inputs of all the sampler families.
 *    The prior `tempered` takes each count to `power` first. The prior `family-flat` gives each sampler family the same weight, also a family with no inputs.
 *
 * The order of the corpora does not change the result. A `power` outside 0 to 1 throws a `RangeError`.
 */
export function priorBasis(manifests: readonly PriorManifest[], kind: PriorKind = "union", sampler: readonly string[] = SAMPLER_FAMILIES, power: number = DEFAULT_TEMPER): PriorBasis {
  if (!(power >= 0 && power <= 1)) throw new RangeError(`The power of the prior is from 0 to 1, not ${power}.`);
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
  const named = kind === "family-flat" ? sampler : sampler.filter((f) => counts.has(f));
  const scale = named.reduce((sum, f) => sum + rawWeight(kind, counts.get(f) ?? 0, power), 0);
  const unmapped = [...other].sort(([a], [b]) => a.localeCompare(b)).map(([family, inputs]) => ({ family, inputs }));
  return {
    kind,
    corpora: [...new Set(manifests.map((m) => m.corpus))].sort(),
    inputs: total,
    families: named.map((f) => {
      const inputs = counts.get(f) ?? 0;
      return { family: f, inputs, weight: Math.round((rawWeight(kind, inputs, power) / scale) * 1e4) / 1e4 };
    }),
    absent: sampler.filter((f) => !named.includes(f)),
    unmapped,
    strata: unmapped.filter((f) => PRIOR_STRATA.includes(f.family)),
    ...(kind === "tempered" ? { power } : {}),
  };
}

/** This function gives the weights of a basis, from the counts of the inputs, without rounding. The weights add up to 1. */
export function priorWeights(basis: PriorBasis): FamilyPrior {
  const raw = basis.families.map((f) => rawWeight(basis.kind, f.inputs, basis.power ?? DEFAULT_TEMPER));
  const scale = raw.reduce((sum, w) => sum + w, 0);
  return new Map(basis.families.map((f, i) => [f.family, scale === 0 ? 0 : raw[i]! / scale]));
}

/** This function gives the corpora of a folder: each `.json` file, in the order of the file names. */
export function readCorpora(dir: string = CORPORA_DIR): PriorManifest[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as PriorManifest);
}

/** The bases over the committed corpora, by kind, power and folder. */
const basisMemo = new Map<string, PriorBasis>();

/** This function gives a basis over the committed corpora of a folder. The function reads the folder one time for each basis. */
export function corporaPrior(kind: PriorKind, dir: string = CORPORA_DIR, power: number = DEFAULT_TEMPER): PriorBasis {
  const key = `${kind}|${power}|${dir}`;
  let b = basisMemo.get(key);
  if (b === undefined) {
    b = priorBasis(readCorpora(dir), kind, SAMPLER_FAMILIES, power);
    basisMemo.set(key, b);
  }
  return b;
}

/** This function gives the basis of the union prior of the committed corpora of a folder. */
export function unionPrior(dir: string = CORPORA_DIR): PriorBasis {
  return corporaPrior("union", dir);
}

/** This function gives the text of a basis for the command line. The text has the corpora, the weights and the families without a weight. */
export function basisLines(b: PriorBasis): string[] {
  const over = `${b.corpora.length} corpora (${b.corpora.join(", ")})`;
  const names: Record<PriorKind, string> = {
    corpus: `the corpus ${b.corpora.join(", ")}`,
    union: `the union of ${over}`,
    tempered: `the union of ${over} to the power ${b.power}`,
    "family-flat": `the same weight for each family, over ${over}`,
  };
  const kind = names[b.kind];
  const out = [`The family prior: ${kind}, ${b.inputs} distinct inputs. Weights: ${b.families.map((f) => `${f.family} ${f.weight} (${f.inputs})`).join(", ")}.`];
  if (b.absent.length > 0) out.push(`Sampler families without inputs, with the weight 0: ${b.absent.join(", ")}.`);
  if (b.unmapped.length > 0) out.push(`Corpus families that the sampler does not draw, with no weight: ${b.unmapped.map((f) => `${f.family} (${f.inputs})`).join(", ")}.`);
  if ((b.strata ?? []).length > 0) out.push(`Strata of their own: ${b.strata!.map((f) => `${f.family} (${f.inputs})`).join(", ")}.`);
  return out;
}
