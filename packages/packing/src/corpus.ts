// The manifest of a corpus: `layout-corpus/1` of `docs/FORMAT.md`.

import { generator } from "./generators.ts";
import type { CorpusCell, GeneratorParams, LayoutInput } from "./layout-input.ts";

/** One spec of a corpus: a generator, its parameters and its seeds. */
export interface CorpusSpec {
  /** The name of the generator. */
  generator: string;
  /** The version of the generator. Without it, the spec uses the version of the package. A different version is an error. */
  version?: number;
  /** The parameters over the defaults of the generator. */
  params?: GeneratorParams;
  seeds: readonly number[];
}

/** One input in the index of a manifest. */
export interface CorpusEntry {
  id: string;
  hash: string;
  cell: CorpusCell;
}

/** The manifest `corpus.json` of a corpus. */
export interface CorpusManifest {
  schema: "layout-corpus/1";
  /** The name of the corpus. Each input has it in `set`. */
  corpus: string;
  /** The specs, each with its version and its full parameters. */
  specs: { generator: string; version: number; params: GeneratorParams; seeds: number[] }[];
  inputs: CorpusEntry[];
}

/** A corpus: the manifest and the input files, in the order of the specs and the seeds. */
export interface Corpus {
  manifest: CorpusManifest;
  inputs: LayoutInput[];
}

/**
 * This function generates a corpus from specs. Each input gets the name of the corpus as its set. The function throws a
 * `RangeError` for an unknown generator, a different version or 2 inputs with the same id.
 */
export function corpus(name: string, specs: readonly CorpusSpec[]): Corpus {
  const manifest: CorpusManifest = { schema: "layout-corpus/1", corpus: name, specs: [], inputs: [] };
  const inputs: LayoutInput[] = [];
  const ids = new Set<string>();
  for (const spec of specs) {
    const gen = generator(spec.generator);
    if (spec.version !== undefined && spec.version !== gen.version) {
      throw new RangeError(`The generator "${gen.name}" has the version ${gen.version}, not ${spec.version}.`);
    }
    const params = gen.withDefaults(spec.params);
    const cell = gen.cell(params);
    manifest.specs.push({ generator: gen.name, version: gen.version, params, seeds: [...spec.seeds] });
    for (const seed of spec.seeds) {
      const file = gen.generate(seed, params, name);
      if (ids.has(file.id)) throw new RangeError(`The corpus has 2 inputs with the id "${file.id}".`);
      ids.add(file.id);
      inputs.push(file);
      manifest.inputs.push({ id: file.id, hash: file.hash, cell });
    }
  }
  return { manifest, inputs };
}
