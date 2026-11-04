// The coverage of the corpus as a number (roadmap item k50). The script reads the committed manifests in `bench/corpora/`.
// It gives the cells of the taxonomy that the specs cover, the pairs of dimension values that they cover, and the values that no spec has.
// It generates no input: the cell of a spec comes from `cell` of its generator.
//
//   node bench/corpus-cover.ts [--out <file>]
//
// The default output is `packages/site/data/corpus-cover.json`. `docs/BENCH.md` ("The corpus coverage") tells how to read the result.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generator, type CorpusCell, type GeneratorParams } from "@mark1russell7/packing";

/** The schema of the output of `corpusCover`. */
export const CORPUS_COVER_SCHEMA = "packing-corpus-cover/1";

/** The dimensions of a generated cell that have a value for each input. */
type CoverKey = "containerSize" | "containerShape" | "obstacles" | "itemShape" | "rotation" | "sizes" | "count" | "order" | "groups" | "mode";

/** One dimension of the coverage: its name and all its values. */
export interface CoverDimension {
  /** The name of a field of `CorpusCell`. */
  readonly name: CoverKey;
  /** All the values of the dimension, from `docs/research/TAXONOMY.md`. */
  readonly values: readonly string[];
}

/** This function gives a dimension, and the compiler examines each value against `CorpusCell`. */
const dimension = <K extends CoverKey>(name: K, values: readonly NonNullable<CorpusCell[K]>[]): CoverDimension => ({ name, values });

/**
 * The dimensions of the coverage. `obstacleMove` is not here, because only a cell with obstacles has it.
 * `objective` is not here, because a cell does not have it.
 */
export const COVER_DIMENSIONS: readonly CoverDimension[] = Object.freeze([
  dimension("containerSize", ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"]),
  dimension("containerShape", ["rect", "convex", "polygon", "circle", "ellipse", "holes"]),
  dimension("obstacles", ["none", "center", "scattered", "wall", "corridors", "touching", "edge"]),
  dimension("itemShape", ["rect", "polygon", "circle", "free", "mixed"]),
  dimension("rotation", ["none", "quarter", "any"]),
  dimension("sizes", ["identical", "nearIdentical", "uniform", "heavyTail", "bimodal", "extremeAspect"]),
  dimension("count", ["1", "10", "100", "1k", "10k"]),
  dimension("order", ["free", "soft", "hard"]),
  dimension("groups", ["none", "flat", "nested"]),
  dimension("mode", ["offline", "online", "incremental"]),
]);

/** One spec of a manifest, as `bench/corpora/` writes it. */
export interface CoverSpec {
  readonly generator: string;
  readonly version: number;
  readonly params?: GeneratorParams;
  readonly seeds: readonly number[];
}

/** The fields of a manifest that the coverage reads. A manifest without specs has `inputs` in full. */
export interface CoverManifest {
  readonly corpus: string;
  readonly specs?: readonly CoverSpec[];
}

/** The inputs of one spec, with the index of its value in each dimension. */
export interface CoverRow {
  readonly values: readonly number[];
  readonly inputs: number;
}

/** The coverage of a set of specs. */
export interface CoverView {
  /** The name of a corpus, or `all` for the union of the corpora. */
  readonly id: string;
  readonly specs: number;
  readonly inputs: number;
  /** The count of the distinct cells of the specs. */
  readonly cells: number;
  /** `cells` over the full product of the dimensions. */
  readonly cellShare: number;
  /** The count of the distinct pairs of values of two dimensions. */
  readonly pairs: number;
  /** `pairs` over all the pairs of values. */
  readonly pairShare: number;
  /** The count of the distinct values of the dimensions. */
  readonly values: number;
  /** Each value with no input, as `dimension=value`. */
  readonly empty: readonly string[];
  /** The count of the inputs of each pair of values: one list for each pair of `dimensionPairs`, row after row. */
  readonly grid: readonly (readonly number[])[];
}

/** The output of `corpusCover`. */
export interface CorpusCover {
  readonly schema: typeof CORPUS_COVER_SCHEMA;
  readonly dimensions: readonly CoverDimension[];
  /** The full product of the counts of the values of the dimensions. */
  readonly fullCells: number;
  /** The count of all the pairs of values of two dimensions. */
  readonly fullPairs: number;
  /** The count of all the values of the dimensions. */
  readonly fullValues: number;
  /** The corpora with no specs. The coverage does not read them. */
  readonly skipped: readonly string[];
  /** The view `all` first, then one view for each corpus, in the order of the names. */
  readonly views: readonly CoverView[];
}

/** This function gives each pair of indexes of dimensions, with the first index below the second. */
export function dimensionPairs(count: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) out.push([a, b]);
  return out;
}

/** This function gives the row of a cell. It throws a `RangeError` for a value outside `dimensions`, so a new value of the taxonomy stops the script. */
export function coverRow(cell: Readonly<Record<string, unknown>>, inputs: number, dimensions: readonly CoverDimension[] = COVER_DIMENSIONS): CoverRow {
  const values = dimensions.map((d) => {
    const at = d.values.indexOf(String(cell[d.name]));
    if (at < 0) throw new RangeError(`The dimension "${d.name}" has no value "${String(cell[d.name])}".`);
    return at;
  });
  return { values, inputs };
}

/** This function gives a share, rounded to 6 places. */
const share = (part: number, whole: number): number => Math.round((part / whole) * 1e6) / 1e6;

/** This function gives the coverage of the rows of one view. */
export function coverView(id: string, specs: number, rows: readonly CoverRow[], dimensions: readonly CoverDimension[] = COVER_DIMENSIONS): CoverView {
  const dimPairs = dimensionPairs(dimensions.length);
  const grid = dimPairs.map(([a, b]) => new Array<number>(dimensions[a]!.values.length * dimensions[b]!.values.length).fill(0));
  const single = dimensions.map((d) => new Array<number>(d.values.length).fill(0));
  const cells = new Set<string>();
  let inputs = 0;
  for (const row of rows) {
    inputs += row.inputs;
    cells.add(row.values.join(","));
    row.values.forEach((value, d) => {
      single[d]![value]! += row.inputs;
    });
    dimPairs.forEach(([a, b], p) => {
      grid[p]![row.values[a]! * dimensions[b]!.values.length + row.values[b]!]! += row.inputs;
    });
  }
  const pairs = grid.reduce((sum, list) => sum + list.filter((n) => n > 0).length, 0);
  const totals = fullCounts(dimensions);
  const empty = dimensions.flatMap((d, i) => d.values.filter((_, v) => single[i]![v] === 0).map((value) => `${d.name}=${value}`));
  return {
    id,
    specs,
    inputs,
    cells: cells.size,
    cellShare: share(cells.size, totals.cells),
    pairs,
    pairShare: share(pairs, totals.pairs),
    values: totals.values - empty.length,
    empty,
    grid,
  };
}

/** This function gives the full counts of the dimensions. */
function fullCounts(dimensions: readonly CoverDimension[]): { cells: number; pairs: number; values: number } {
  const sizes = dimensions.map((d) => d.values.length);
  const pairs = dimensionPairs(sizes.length).reduce((sum, [a, b]) => sum + sizes[a]! * sizes[b]!, 0);
  return { cells: sizes.reduce((p, n) => p * n, 1), pairs, values: sizes.reduce((s, n) => s + n, 0) };
}

/** This function gives the coverage of manifests. `cellOfSpec` gives the cell of a spec. */
export function corpusCover(
  manifests: readonly CoverManifest[],
  cellOfSpec: (spec: CoverSpec) => Readonly<Record<string, unknown>>,
  dimensions: readonly CoverDimension[] = COVER_DIMENSIONS,
): CorpusCover {
  const sorted = [...manifests].sort((a, b) => (a.corpus < b.corpus ? -1 : a.corpus > b.corpus ? 1 : 0));
  const read = sorted.filter((m) => m.specs !== undefined);
  const rows = read.map((m) => m.specs!.map((spec) => coverRow(cellOfSpec(spec), spec.seeds.length, dimensions)));
  const all = coverView("all", rows.reduce((sum, r) => sum + r.length, 0), rows.flat(), dimensions);
  const totals = fullCounts(dimensions);
  return {
    schema: CORPUS_COVER_SCHEMA,
    dimensions,
    fullCells: totals.cells,
    fullPairs: totals.pairs,
    fullValues: totals.values,
    skipped: sorted.filter((m) => m.specs === undefined).map((m) => m.corpus),
    views: [all, ...read.map((m, i) => coverView(m.corpus, rows[i]!.length, rows[i]!, dimensions))],
  };
}

/** This function gives the bytes of a coverage: one line for each view, so a change of a corpus is one line of the diff. */
export function coverJson(cover: CorpusCover): string {
  const { views, ...head } = cover;
  const lines = views.map((view) => JSON.stringify(view));
  return `${JSON.stringify(head).slice(0, -1)},"views":[\n${lines.join(",\n")}\n]}\n`;
}

/** This function gives the cell of a spec from its generator. */
export const cellOfSpec = (spec: CoverSpec): Readonly<Record<string, unknown>> => {
  const made = generator(spec.generator, spec.version);
  return { ...made.cell(made.withDefaults(spec.params)) };
};

/** This function reads the manifests of a directory. */
export function readManifests(dir: URL): CoverManifest[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as CoverManifest);
}

/** The directory of the committed manifests. */
export const CORPORA_DIR: URL = new URL("./corpora/", import.meta.url);

/** The file of the site. */
export const COVER_FILE: URL = new URL("../../site/data/corpus-cover.json", import.meta.url);

function main(): void {
  const at = process.argv.indexOf("--out");
  const out = at < 0 ? fileURLToPath(COVER_FILE) : process.argv[at + 1];
  if (out === undefined) throw new RangeError("The option --out needs a file.");
  const cover = corpusCover(readManifests(CORPORA_DIR), cellOfSpec);
  writeFileSync(out, coverJson(cover));
  const all = cover.views[0]!;
  process.stdout.write(`${all.cells} of ${cover.fullCells} cells, ${all.pairs} of ${cover.fullPairs} pairs, ${all.values} of ${cover.fullValues} values\n`);
}

if (process.argv[1]?.endsWith("corpus-cover.ts")) main();
