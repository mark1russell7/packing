// The measured points of a coverage run as a record `response-records/1` of `@mark1russell7/rigor-statistics` (roadmap item k143).
// `packing-coverage/1` keeps only pooled errors. This record keeps each measured point, a fitted surface and the error of each fold.
// The trees of `bench/coverage.ts` stay the coverage model: a tree is a fact of the bench, and a record holds measurements.
//
//   node bench/response.ts --records <file> --corpus <file> --out <file> [--run <id>] [--seeds <n>] [--folds 5] [--seed 1]
//   node bench/response.ts --site <response.json> --out <file>
//
// A corpus with fewer than 3 specs gives no file: a fit needs 3 groups. `docs/BENCH.md` tells the record.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MEASURE_SPECS, type MeasureId } from "@mark1russell7/packing";
import {
  fitResponse,
  parseResponseRecord,
  RESPONSE_RECORDS_SCHEMA,
  type ResponseData,
  type ResponseDimension,
  type ResponseFitOptions,
  type ResponseInputValue,
  type ResponseMeasure,
  type ResponsePoint,
  type ResponseRecord,
} from "@mark1russell7/rigor-statistics";
import { GAP_TO_BOUND } from "./gap-to-bound.ts";
import { COVERAGE_MEASURES, inputDims, LOG_FLOOR, rawValue, readRecords, type CoverageManifest, type CoverageMeasure, type CoverageRecord, type InputDims } from "./coverage.ts";
import { sig } from "./snapshot.ts";

/** The id of the dimension of the strategy. */
const STRATEGY = "strategy";

/** The id of the dimension of the family. */
const FAMILY = "family";

/** The id of the reason of a skipped record. */
const SKIPPED = "skipped";

/** The least count of groups of a fit. */
const MIN_GROUPS = 3;

/** The options of `coverageResponseData`. */
export interface ResponseDataOptions {
  /** The name of the record. The default is the name of the corpus. */
  readonly name?: string;
  /** The first seeds of each spec to keep. The default keeps each seed. */
  readonly seeds?: number;
}

/** This function gives the levels of each param over the inputs, sorted, with the families that have the param. */
function paramLevels(inputs: readonly InputDims[]): Map<string, { levels: Set<string>; families: Set<string> }> {
  const out = new Map<string, { levels: Set<string>; families: Set<string> }>();
  for (const d of inputs) {
    for (const name of d.params) {
      const entry = out.get(name) ?? { levels: new Set(), families: new Set() };
      entry.levels.add(d.dims[name]!);
      entry.families.add(d.family);
      out.set(name, entry);
    }
  }
  return out;
}

/** This function gives the value of a level: a number when the dimension has only numbers, and the text otherwise. */
const numeric = (levels: Iterable<string>): boolean => [...levels].every((t) => t !== "" && Number.isFinite(Number(t)));

/** This function gives the dimension of a param: ordinal when each level is a number, and categorical otherwise. */
function paramDimension(name: string, levels: ReadonlySet<string>): ResponseDimension {
  const base = { id: name, label: name, unit: "" };
  const texts = [...levels].sort();
  return numeric(texts) ? { ...base, kind: "ordinal", levels: texts.map(Number).sort((a, b) => a - b) } : { ...base, kind: "categorical", levels: texts };
}

/**
 * This function tells which params are dimensions and if the family is a dimension.
 * A param with one level is not a dimension. The family is a dimension when a param is only in some families, or when two families have the same params.
 */
function dimensionsOf(inputs: readonly InputDims[], strategies: readonly string[]): { dimensions: ResponseDimension[]; params: readonly string[]; family: boolean } {
  const all = paramLevels(inputs);
  const families = [...new Set(inputs.map((d) => d.family))].sort();
  const varying = [...all.keys()].filter((name) => all.get(name)!.levels.size > 1);
  for (const name of varying) if (name === STRATEGY || name === FAMILY) throw new Error(`The param ${name} of the corpus has the name of a dimension of the record.`);
  const key = (d: InputDims): string => JSON.stringify(varying.map((name) => (d.params.includes(name) ? d.dims[name]! : null)));
  const sameParams = new Set(inputs.map(key)).size < new Set(inputs.map((d) => `${d.family} ${key(d)}`)).size;
  const conditional = varying.some((name) => all.get(name)!.families.size < families.length);
  const family = families.length > 1 && (sameParams || conditional);
  const dimensions: ResponseDimension[] = [{ id: STRATEGY, label: STRATEGY, unit: "", kind: "categorical", levels: strategies }];
  if (family) dimensions.push({ id: FAMILY, label: FAMILY, unit: "", kind: "categorical", levels: families });
  for (const name of varying) {
    const entry = all.get(name)!;
    const dimension = paramDimension(name, entry.levels);
    dimensions.push(entry.families.size < families.length ? { ...dimension, when: { dimension: FAMILY, levels: [...entry.families].sort() } } : dimension);
  }
  return { dimensions, params: varying, family };
}

/** This function gives the measure of the record, with the range of its spec when each value is in it. The gap to the bound has no spec of its own, and it has the form of `pack.gap`. */
function measureOf(m: CoverageMeasure, values: readonly number[]): ResponseMeasure {
  if (m.id === "ms") return { id: m.id, label: "time", unit: "ms", direction: "lower" };
  const spec = MEASURE_SPECS[m.id === GAP_TO_BOUND ? "pack.gap" : (m.id as MeasureId)];
  const base = { id: m.id, label: m.id, unit: spec.unit, direction: spec.direction as "higher" | "lower" };
  const inside = values.every((v) => v >= spec.min && v <= spec.max);
  return Number.isFinite(spec.max) && inside ? { ...base, range: [spec.min, spec.max] } : base;
}

/** This function gives the first `seeds` inputs of each spec. */
function keptInputs(dims: ReadonlyMap<string, InputDims>, seeds: number): Set<string> {
  const counts = new Map<string, number>();
  const kept = new Set<string>();
  for (const [id, d] of dims) {
    const count = counts.get(d.spec) ?? 0;
    if (count < seeds) kept.add(id);
    counts.set(d.spec, count + 1);
  }
  return kept;
}

/**
 * This function gives the data of a record from the records of a run and the manifest of the corpus. Each record of a
 * kept input is one point, and the points of one spec are one group. Thus a fold holds out a whole spec, as the coverage does with `--by spec`.
 * A skipped record is a point with the reason `skipped`. A record of an input that is not in the manifest is not a point. A measure with no value is not in the data.
 */
export function coverageResponseData(records: readonly CoverageRecord[], manifest: CoverageManifest, options: ResponseDataOptions = {}): ResponseData {
  const dims = inputDims(manifest);
  const kept = keptInputs(dims, options.seeds ?? Number.POSITIVE_INFINITY);
  const rows = records.filter((r) => kept.has(r.input));
  const { dimensions, params, family } = dimensionsOf([...dims.values()], [...new Set(rows.map((r) => r.strategy))].sort());
  const values = new Map(COVERAGE_MEASURES.map((m) => [m.id, rows.flatMap((r) => (r.skipped === undefined ? (rawValue(r, m) ?? []) : []))]));
  const measures = COVERAGE_MEASURES.filter((m) => values.get(m.id)!.length > 0);
  const numbers = new Set(params.filter((name) => dimensions.some((d) => d.id === name && d.kind === "ordinal")));
  const points = rows.map((r): ResponsePoint => {
    const d = dims.get(r.input)!;
    const point: Record<string, ResponseInputValue> = { [STRATEGY]: r.strategy };
    if (family) point[FAMILY] = d.family;
    for (const name of params) {
      if (!d.params.includes(name)) point[name] = null;
      else point[name] = numbers.has(name) ? Number(d.dims[name]) : d.dims[name]!;
    }
    const skipped = r.skipped !== undefined;
    return {
      id: `${r.strategy}|${r.input}`,
      values: point,
      measures: Object.fromEntries(
        measures.map((m) => {
          const v = skipped ? undefined : rawValue(r, m);
          return [m.id, v === undefined ? null : sig(v)];
        }),
      ),
      group: d.spec,
      ...(skipped ? { absent: Object.fromEntries(measures.map((m) => [m.id, SKIPPED])) } : {}),
    };
  });
  const anySkipped = rows.some((r) => r.skipped !== undefined);
  return {
    schema: RESPONSE_RECORDS_SCHEMA,
    name: options.name ?? manifest.corpus,
    dimensions,
    measures: measures.map((m) => measureOf(m, values.get(m.id)!)),
    ...(anySkipped ? { reasons: [{ id: SKIPPED, label: "The strategy skipped the input" }] } : {}),
    points,
  };
}

/**
 * This function fits the data with a ridge fit, and it keeps the prediction of each held-out point. A measure of the log
 * scale of the coverage has that scale here too. When the products of two dimensions pass the limit of terms, the fit
 * has no products. A fault of the data throws in both fits.
 */
export function fitCoverageResponse(data: ResponseData, options: { readonly folds?: number; readonly seed?: number } = {}): ResponseRecord {
  const ids = new Set(data.measures.map((m) => m.id));
  const fit = (interactions: "seen" | false): ResponseRecord => {
    const log = COVERAGE_MEASURES.filter((m) => m.scale === "log" && ids.has(m.id)).map((m) => m.id);
    const choice: ResponseFitOptions = { model: "ridge", degree: 2, interactions, log, logFloor: LOG_FLOOR, outOfFold: true, folds: options.folds ?? 5, seed: options.seed ?? 1 };
    return fitResponse(data, choice);
  };
  try {
    return fit("seen");
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return fit(false);
  }
}

/** This function gives the value of an option of the command line. */
const optionOf = (argv: readonly string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

/** This function gives a whole number option of 1 or more, or the default. It throws an `Error` for another value. */
function countOption(argv: readonly string[], name: string, otherwise?: number): number | undefined {
  const text = optionOf(argv, name);
  if (text === undefined) return otherwise;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) throw new Error(`The option ${name} is a whole number of 1 or more.`);
  return value;
}

/**
 * This function gives the record of the site: each measured point, each model and the error of each fold. It leaves out the stored predictions,
 * because they are 60 % of the gzip size and the page does not read them. Thus `heldOutErrorAt` needs the record of the artifact.
 */
export function siteRecord(record: ResponseRecord): ResponseRecord {
  return { ...record, folds: record.folds.map((fold) => ({ heldOut: fold.heldOut, errors: fold.errors })) };
}

/** This function writes the record of the site from a record of a run, and it gives the record. It throws for a bad record. */
function writeSiteRecord(file: string, out: string | undefined): ResponseRecord {
  if (out === undefined) throw new Error("Start the export of the site with: node bench/response.ts --site <file> --out <file>");
  const parsed = parseResponseRecord(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.ok) throw new Error(`The record ${file} has faults: ${parsed.faults.map((f) => `${f.path}: ${f.message}`).join(" ")}`);
  const record = siteRecord(parsed.record);
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record)}
`);
  return record;
}

/** This function writes the record of a run, and it gives the record. It gives `undefined`, and it writes no file, for a corpus with fewer than 3 specs. */
export function responseMain(argv: readonly string[]): ResponseRecord | undefined {
  const site = optionOf(argv, "--site");
  if (site !== undefined) return writeSiteRecord(site, optionOf(argv, "--out"));
  const records = optionOf(argv, "--records");
  const corpusFile = optionOf(argv, "--corpus");
  const out = optionOf(argv, "--out");
  if (records === undefined || corpusFile === undefined || out === undefined) throw new Error("Start the export with: node bench/response.ts --records <file> --corpus <file> --out <file>");
  const manifest = JSON.parse(readFileSync(corpusFile, "utf8")) as CoverageManifest;
  const run = optionOf(argv, "--run");
  const seeds = countOption(argv, "--seeds");
  const dataOptions: ResponseDataOptions = { ...(run === undefined ? {} : { name: `${manifest.corpus}, run ${run}` }), ...(seeds === undefined ? {} : { seeds }) };
  const data = coverageResponseData(readRecords(readFileSync(records, "utf8")), manifest, dataOptions);
  const groups = new Set(data.points.map((p) => p.group)).size;
  if (groups < MIN_GROUPS) {
    console.log(`The run has ${groups} specs, fewer than ${MIN_GROUPS}. No response record.`);
    return undefined;
  }
  const start = performance.now();
  const record = fitCoverageResponse(data, { folds: countOption(argv, "--folds", 5)!, seed: countOption(argv, "--seed", 1)! });
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record)}\n`);
  console.log(`The record has ${data.points.length} points, ${record.models.length} models and ${record.folds.length} folds. The fit took ${Math.round(performance.now() - start)} ms.`);
  return record;
}

if (process.argv[1]?.endsWith("response.ts") === true) responseMain(process.argv.slice(2));
