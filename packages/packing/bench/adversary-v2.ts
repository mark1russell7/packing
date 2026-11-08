// Version 2 of the adversarial search (roadmap item k164). Version 1 (`bench/adversary.ts`) takes each draw of a pair from
// one stream, and a draw reads the length of a list. Thus a new container form or a new class moves the later draws of the
// other origins. Version 2 splits each pair into cells: one generator with one container form. Each cell has its own stream
// from its name and its own budget. `docs/BENCH.md` ("The adversarial search, version 2") tells the search.
//
//   node bench/adversary-v2.ts                 writes the file
//   node bench/adversary-v2.ts --rows          exits with the code 1 when the stored rows changed. It starts no search.
//   node bench/adversary-v2.ts --check         exits with the code 1 when the file is not the output of the builder
//   node bench/adversary-v2.ts --report        tells the rows that a new search does not find, and exits with the code 0
//   node bench/adversary-v2.ts --check --pair 2  examines only the pair with the index 2
//   node bench/adversary-v2.ts --out <file>    writes the file to that path
//   node bench/adversary-v2.ts --rows --file <file>  reads that file in place of the stored file

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corpusFamilies, generator, hashInput, type GeneratedInput, type GeneratorParams } from "@mark1russell7/packing";
import { random, stablePick, type Random } from "@mark1russell7/rigor-generators";
import {
  ADVERSARY_MAX_COUNT,
  ADVERSARY_NAME,
  ADVERSARY_PAIRS,
  ADVERSARY_SEED,
  BEST,
  cellOf,
  familyOfPair,
  inline,
  lossOf,
  mutateSizes,
  ORIGINS,
  PARAM_SHARE,
  round6,
  startMove,
  stateOf,
  valueOf,
  type AdversaryStep,
  type Loss,
  type Origin,
  type State,
  type ValueRead,
} from "./adversary.ts";
import { entry } from "./entries.ts";

/** The name of the corpus of version 2. */
export const ADVERSARY_V2_CORPUS = "pack-adversary-v2";

/** The version of the search in the stamp of each input that it makes. */
export const ADVERSARY_V2_VERSION = 2;

/** The file of the corpus of version 2. */
export const ADVERSARY_V2_FILE: string = join(import.meta.dirname, "corpora", `${ADVERSARY_V2_CORPUS}.json`);

/** The budget of each cell, in evaluations. A new cell adds its own budget, and the budget of each other cell stays. */
export const CELL_BUDGET = 400;

/** The evaluations of a cell without a better input before the search of that cell starts again from a new origin. */
export const CELL_PATIENCE = 100;

/**
 * The entries of the benchmark that the pool of `best` of version 2 does not read, with the reason of each. The composite
 * entries are out by the rule `isComposite`, because each one packs with other entries. The costs come from one pack of
 * 60 items of `berkey-wang` class `III` on 2026-11-06.
 */
export const POOL_OUT: Readonly<Record<string, string>> = Object.freeze({
  push: "It packs only a change of an earlier layout, so it has no value on a new input.",
  beam: "One pack of 60 items took 63 ms on `freeHeight`, more than 50 ms.",
  "near-rects": "One pack of 60 items took 143 to 156 ms, more than 50 ms.",
  "raster-nofit": "One pack of 60 items took 146 to 2045 ms, more than 50 ms.",
  "exact-strip": "It is an exact search that refuses 60 items.",
  "shelf-breaks": "It came to the benchmark after the read of the stored rows. Item k189 adds it to the pool of the next version.",
  "shelf-online": "It came to the benchmark after the read of the stored rows. Item k189 adds it to the pool of the next version.",
  "treemap-spiral": "It came to the benchmark after the read of the stored rows. Item k189 adds it to the pool of the next version.",
  "treemap-pivot-middle": "It came to the benchmark after the read of the stored rows. Item k189 adds it to the pool of the next version.",
  "treemap-pivot-size": "It came to the benchmark after the read of the stored rows. Item k189 adds it to the pool of the next version.",
});

/**
 * The pool of `best` for version 2, in the order of `ENTRIES`. The first entry wins a tie. Each entry of the benchmark that
 * is not composite is in this list or in `POOL_OUT`. A test fails on an entry that is in neither list, so a new entry needs
 * a choice. A change of this list changes the stored rows.
 */
export const POOL_V2: readonly string[] = Object.freeze([
  "rows", "skyline", "shelf", "bottom-left", "best-fit", "shelf-next", "shelf-first", "shelf-best",
  "shelf-first-input", "maxrects-bssf", "maxrects-blsf", "maxrects-baf", "maxrects-bl", "maxrects-cp", "skyline-mw",
  "skyline-bl-waste", "skyline-mw-waste", "guillotine-baf-sas", "guillotine-bssf-sas-merge", "bottom-left-liu-teng",
  "best-fit-tall", "best-fit-short", "sleator", "binary-height", "masonry-shortest", "masonry-lpt",
  "columns-linear-partition", "treemap-squarified", "treemap-slice-dice", "treemap-strip", "treemap-pivot-split",
  "side-anchors-first-left",
]);

/** A cell of the search: one generator of `ORIGINS` with one container form. A generator with no form has one cell. */
export interface SearchCell {
  /** The generator of the origins of the cell. */
  readonly generator: string;
  /** The value of `containerSize` of each origin of the cell, or `undefined` for a generator with no such parameter. */
  readonly form?: string;
  /** The name of the cell: the generator, a dot and the form. The stream of the cell comes from this name. */
  readonly key: string;
}

/** This function gives the values of a dimension that the generator supports, or `undefined` for a range. */
function listOf(name: string, dimension: string): readonly (string | number)[] | undefined {
  const d = corpusFamilies.find((f) => f.name === name)?.dimensions.find((x) => x.name === dimension);
  if (d === undefined) return undefined;
  return Array.isArray(d.supported) ? (d.supported as readonly (string | number)[]) : d.values;
}

/** This function gives the cells of a list of generators: one cell for each form of `containerSize`, in the order of the list. */
export function searchCells(origins: readonly string[] = ORIGINS): SearchCell[] {
  return origins.flatMap((name): SearchCell[] => {
    const keys = Object.keys(generator(name).defaults);
    const forms = keys.includes("containerSize") ? listOf(name, "containerSize") : undefined;
    if (forms === undefined) return [{ generator: name, key: name }];
    return forms.map((form) => ({ generator: name, form: String(form), key: `${name}.${String(form)}` }));
  });
}

/** A parameter of an origin that the search changes, with its values or its range. The knobs and `containerSize` are not in it. */
interface ParamSpace {
  readonly name: string;
  readonly values?: readonly (string | number)[];
  readonly min?: number;
  readonly max?: number;
}

/** This function gives the parameters of a generator that a cell changes. The range of `count` ends at `maxCount`. */
function paramSpace(name: string, maxCount: number): ParamSpace[] {
  const family = corpusFamilies.find((f) => f.name === name);
  if (family === undefined) throw new RangeError(`The package has no family "${name}".`);
  const keys = Object.keys(generator(name).defaults);
  return family.dimensions
    .filter((d) => keys.includes(d.name) && d.name !== "containerSize")
    .map((d): ParamSpace => {
      const values = Array.isArray(d.supported) ? (d.supported as readonly (string | number)[]) : d.values;
      if (values !== undefined) return { name: d.name, values };
      if (d.name === "count") return { name: d.name, min: Math.max(1, d.min ?? 1), max: Math.min(maxCount, d.max ?? maxCount) };
      return { name: d.name, min: d.min ?? 0, max: d.max ?? 0 };
    });
}

/** This function gives a 32-bit seed for one `stablePick`. Each choice reads one number of the stream, for any length of the list. */
const pickSeed = (r: Random): number => r.int(0, 0xffff_ffff);

/** This function gives a random value of a parameter. A value of a list comes from `stablePick`, so a new value moves only the draws that it wins. */
const randomValue = (p: ParamSpace, r: Random): string | number => (p.values !== undefined ? stablePick(pickSeed(r), p.values, String) : r.int(p.min!, p.max!));

/** This function gives a random origin of a cell: random parameters, the form of the cell and a random seed. */
export function originOf(cell: SearchCell, maxCount: number, r: Random): Origin {
  const gen = generator(cell.generator);
  const params: GeneratorParams = {};
  for (const p of paramSpace(cell.generator, maxCount)) params[p.name] = randomValue(p, r);
  if (cell.form !== undefined) params["containerSize"] = cell.form;
  return { generator: cell.generator, version: gen.version, params: gen.withDefaults(params), seed: r.int(1, 999_999) };
}

/** This function changes one parameter or the seed of an origin. The form of the cell does not change. */
function mutateOrigin(origin: Origin, maxCount: number, r: Random): { origin: Origin; move: string } {
  const space = paramSpace(origin.generator, maxCount);
  const name = stablePick(pickSeed(r), [...space.map((p) => p.name), "seed"]);
  const p = space.find((x) => x.name === name);
  if (p === undefined) {
    const seed = r.int(1, 999_999);
    return { origin: { ...origin, seed }, move: `seed ${origin.seed} to ${seed}` };
  }
  const old = origin.params[p.name]!;
  let value: string | number;
  if (p.values === undefined && typeof old === "number" && r.next() < 0.5) value = Math.min(p.max!, Math.max(p.min!, old + (r.next() < 0.5 ? -1 : 1)));
  else value = randomValue(p, r);
  return { origin: { ...origin, params: { ...origin.params, [p.name]: value } }, move: `${p.name} ${old} to ${value}` };
}

/** The options of the search of one pair. */
export interface PairOptions {
  /** The entry that loses. */
  readonly a: string;
  /** The entry that wins, or `best`. */
  readonly b: string;
  /** The seed of the search. The same options give the same rows. */
  readonly seed: number;
  /** The count of evaluations of each cell. */
  readonly budget: number;
  /** The largest count of items of a candidate. */
  readonly maxCount: number;
  /** The pool of `best`. The default is `POOL_V2`. */
  readonly pool?: readonly string[];
}

/** The result of the search of one cell. */
export interface CellResult {
  readonly options: PairOptions;
  readonly cell: SearchCell;
  /** The count of evaluations: the budget. */
  evaluations: number;
  /** The count of candidates with a loss. */
  valid: number;
  /** The count of starts from an origin. */
  starts: number;
  /** The worst input of the cell, or `null` when no candidate has a loss. */
  worst: { input: GeneratedInput; score: Loss; origin: Origin; evaluation: number } | null;
  /** The moves from the origin of the worst input to the worst input. */
  path: AdversaryStep[];
}

/** This function gives the input file of a state of a cell, with the stamp of version 2 and its hash. */
export function candidateFileV2(options: PairOptions, cell: SearchCell, state: Pick<State, "container" | "sizes">): GeneratedInput {
  const family = familyOfPair(options.a, options.b);
  const params: GeneratorParams = { a: options.a, b: options.b, seed: options.seed, budget: options.budget, maxCount: options.maxCount, cell: cell.key };
  const file: Omit<GeneratedInput, "hash"> = {
    schema: "layout-input/1",
    id: `${ADVERSARY_V2_CORPUS}/${family}/${cell.key}/s${options.seed}`,
    set: ADVERSARY_V2_CORPUS,
    family,
    seed: options.seed,
    source: "made-up",
    generator: { name: ADVERSARY_NAME, version: ADVERSARY_V2_VERSION, params, seed: options.seed },
    container: state.container,
    obstacles: [],
    boxes: state.sizes.map(([w, h], i) => ({ id: `b${i}`, w, h })),
    edges: [],
  };
  return { ...file, hash: hashInput(file) };
}

/** This function gives the stream of a cell. It reads only the pair, the seed and the name of the cell. */
export const cellStream = (options: PairOptions, cell: SearchCell): Random => random(`${ADVERSARY_NAME}:${ADVERSARY_V2_VERSION}:${options.a}:${options.b}:${options.seed}`).fork(cell.key);

/**
 * This function searches one cell for the input where A loses most to B. It is the hill climb of version 1 in one cell.
 *
 * - The stream of the cell comes from `cellStream`, so no other cell changes its draws.
 * - A start takes a random origin of the cell. A move changes one parameter or the seed, or one item.
 * - The search keeps a move when its loss is not less than the loss before it. After `CELL_PATIENCE` evaluations with no gain, it starts again.
 * - The search stops after `budget` evaluations of the cell. It reads no clock.
 */
export function searchCell(options: PairOptions, cell: SearchCell, read: ValueRead = valueOf): CellResult {
  const { a, b, budget, maxCount } = options;
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError("The budget is a whole number of 1 or more.");
  if (!Number.isInteger(maxCount) || maxCount < 1) throw new RangeError("The largest count is a whole number of 1 or more.");
  entry(a);
  if (b !== BEST) entry(b);
  const pool = options.pool ?? POOL_V2;
  const r = cellStream(options, cell);
  const next = (): number => r.next();
  const result: CellResult = { options, cell, evaluations: 0, valid: 0, starts: 0, worst: null, path: [] };

  let current: { state: State; loss: number; path: AdversaryStep[] } | undefined;
  let stale = 0;
  const evaluate = (state: State): { file: GeneratedInput; score: Loss | undefined } => {
    const file = candidateFileV2(options, cell, state);
    const score = lossOf(a, b, file, cellOf(state), read, pool);
    result.evaluations++;
    if (score !== undefined) result.valid++;
    return { file, score };
  };
  const keepWorst = (state: State, file: GeneratedInput, score: Loss, path: AdversaryStep[]): void => {
    if (result.worst === null || score.loss > result.worst.score.loss) {
      result.worst = { input: file, score, origin: state.origin, evaluation: result.evaluations };
      result.path = path;
    }
  };

  while (result.evaluations < budget) {
    if (current === undefined || stale >= CELL_PATIENCE) {
      const origin = originOf(cell, maxCount, r);
      const state = stateOf(origin, maxCount);
      result.starts++;
      const { file, score } = evaluate(state);
      const path = [{ evaluation: result.evaluations, move: startMove(origin), loss: score?.loss ?? -Infinity }];
      current = { state, loss: score?.loss ?? -Infinity, path };
      stale = 0;
      if (score !== undefined) keepWorst(state, file, score, path);
      continue;
    }
    let state: State;
    let move: string;
    if (next() < PARAM_SHARE) {
      const changed = mutateOrigin(current.state.origin, maxCount, r);
      state = stateOf(changed.origin, maxCount);
      move = `${changed.move}, then ${startMove(changed.origin)}`;
    } else {
      const c = current.state.container;
      const changed = mutateSizes(current.state.sizes, c.w ?? Number.MAX_SAFE_INTEGER, c.fixed === "size" ? c.h : undefined, maxCount, next);
      state = { ...current.state, sizes: changed.sizes };
      move = changed.move;
    }
    const { file, score } = evaluate(state);
    if (score === undefined || score.loss < current.loss) {
      stale++;
      continue;
    }
    const gain = score.loss > current.loss;
    const path = gain ? [...current.path, { evaluation: result.evaluations, move, loss: score.loss }] : current.path;
    current = { state, loss: score.loss, path };
    stale = gain ? 0 : stale + 1;
    keepWorst(state, file, score, path);
  }
  return result;
}

/** This function gives the options of the search of a pair of the corpus. */
export const pairOptionsV2 = ([a, b]: readonly [string, string]): PairOptions => ({ a, b, seed: ADVERSARY_SEED, budget: CELL_BUDGET, maxCount: ADVERSARY_MAX_COUNT });

/** This function searches each cell of a pair, in the order of the cells. */
export const searchPair = (options: PairOptions, cells: readonly SearchCell[] = searchCells(), read: ValueRead = valueOf): CellResult[] => cells.map((cell) => searchCell(options, cell, read));

/**
 * This function gives the worst row of a pair for each measure. A loss of `fill` and a loss of `gap` are not on one
 * scale. Thus the pair has one worst row for each measure of its cells.
 */
export function pairWorst(results: readonly CellResult[]): Partial<Record<Loss["measure"], CellResult>> {
  const out: Partial<Record<Loss["measure"], CellResult>> = {};
  for (const res of results) {
    if (res.worst === null) continue;
    const kept = out[res.worst.score.measure];
    if (kept === undefined || res.worst.score.loss > kept.worst!.score.loss) out[res.worst.score.measure] = res;
  }
  return out;
}

/** This function gives the line of a cell in the field `found`: the pair, the cell, the loss, the origin and the path. */
export function foundLineV2(result: CellResult): string {
  const { a, b, seed, budget, maxCount } = result.options;
  const w = result.worst;
  const head = { a, b, cell: result.cell.key, seed, budget, maxCount };
  if (w === null) return inline({ ...head, input: null, evaluations: result.evaluations, valid: result.valid, starts: result.starts });
  return inline({
    ...head,
    input: w.input.id,
    hash: w.input.hash,
    count: w.input.boxes.length,
    measure: w.score.measure,
    loss: round6(w.score.loss),
    valueA: round6(w.score.valueA),
    valueB: round6(w.score.valueB),
    winner: w.score.winner,
    hardA: w.score.hardA,
    origin: w.origin,
    evaluation: w.evaluation,
    evaluations: result.evaluations,
    valid: result.valid,
    starts: result.starts,
    path: result.path.map((s) => [s.evaluation, s.move, round6(s.loss)]),
  });
}

/** This function gives the line of the worst input of a cell in the field `inputs` of the file, or `undefined` with no input. */
export const inputLineV2 = (result: CellResult): string | undefined => (result.worst === null ? undefined : JSON.stringify(result.worst.input));

/** This function gives the text of the corpus file from the results of the cells, pair by pair and cell by cell. */
export function adversaryV2Text(results: readonly CellResult[], cells: readonly SearchCell[] = searchCells(), pool: readonly string[] = POOL_V2): string {
  const inputs = results.flatMap((res) => {
    const line = inputLineV2(res);
    return line === undefined ? [] : [line];
  });
  const search = { name: ADVERSARY_NAME, version: ADVERSARY_V2_VERSION, seed: ADVERSARY_SEED, budget: CELL_BUDGET, patience: CELL_PATIENCE, maxCount: ADVERSARY_MAX_COUNT, cells: cells.map((c) => c.key), pool };
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(ADVERSARY_V2_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "search": ${inline(search)},`,
    `  "found": [`,
    results.map((res) => `    ${foundLineV2(res)}`).join(",\n"),
    "  ],",
    `  "inputs": [`,
    inputs.map((line) => `    ${line}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

/** The parts of the corpus file of version 2 that a test reads. */
export interface AdversaryV2File {
  schema: "layout-corpus/1";
  corpus: string;
  search: { cells: string[]; pool: string[]; budget: number };
  found: Record<string, unknown>[];
  inputs: GeneratedInput[];
}

/** This function reads the corpus file of version 2. */
export const readAdversaryV2 = (text: string = readFileSync(ADVERSARY_V2_FILE, "utf8")): AdversaryV2File => JSON.parse(text) as AdversaryV2File;

/** This constant gives the SHA-256 hash of the file of version 2. A change of the rows needs a new version of the corpus. */
export const ADVERSARY_V2_SHA256 = "82428bfe066d2843c3d8eeaeb79bbb9c6e92ace75a0db3cd110114aebf71547d";

/** This function tells what is wrong when the text is not the stored corpus. It starts no search, so a change of a strategy cannot fail it. */
export function storedRowsFaultV2(text: string): string | undefined {
  const hash = createHash("sha256").update(text).digest("hex");
  return hash === ADVERSARY_V2_SHA256 ? undefined : `The stored rows of ${ADVERSARY_V2_CORPUS} changed: the hash is ${hash}, not ${ADVERSARY_V2_SHA256}.`;
}

/** This function gives a line for each cell result that the text does not hold, with the stored loss and the loss of the search. */
export function movedRowsV2(text: string, results: readonly CellResult[]): string[] {
  const found = readAdversaryV2(text).found;
  return results
    .filter((res) => !text.includes(foundLineV2(res)) || (inputLineV2(res) !== undefined && !text.includes(inputLineV2(res)!)))
    .map((res) => {
      const { a, b } = res.options;
      const stored = found.find((row) => row["a"] === a && row["b"] === b && row["cell"] === res.cell.key)?.["loss"];
      return `${a} to ${b} in ${res.cell.key}: the search does not find the stored row. Stored loss ${String(stored)}, loss of the search ${res.worst === null ? "none" : round6(res.worst.score.loss)}.`;
    });
}

/** This function gives the line of a pair for the console: the worst row of each measure. */
function pairLine([a, b]: readonly [string, string], results: readonly CellResult[]): string {
  const worst = pairWorst(results);
  const parts = (["fill", "gap"] as const).flatMap((m) => {
    const res = worst[m];
    return res === undefined ? [] : [`${m} loss ${round6(res.worst!.score.loss)} in ${res.cell.key} (${res.worst!.input.boxes.length} items, winner ${res.worst!.score.winner})`];
  });
  const empty = results.filter((res) => res.worst === null).map((res) => res.cell.key);
  return `${a} to ${b}: ${parts.length === 0 ? "no input" : parts.join(", ")}${empty.length === 0 ? "" : `. No valid candidate in ${empty.join(", ")}`}`;
}

function main(): void {
  const optionOf = (name: string): string | undefined => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
  };
  const stored = optionOf("--file") ?? ADVERSARY_V2_FILE;
  if (process.argv.includes("--rows")) {
    const fault = storedRowsFaultV2(readFileSync(stored, "utf8"));
    console.log(fault ?? `${stored}: the stored rows did not change.`);
    if (fault !== undefined) process.exitCode = 1;
    return;
  }
  const pairAt = optionOf("--pair");
  const only = pairAt === undefined ? undefined : Number(pairAt);
  if (only !== undefined && !(Number.isInteger(only) && only >= 0 && only < ADVERSARY_PAIRS.length)) throw new RangeError(`--pair is a whole number from 0 to ${ADVERSARY_PAIRS.length - 1}.`);
  const pairs = only === undefined ? ADVERSARY_PAIRS : [ADVERSARY_PAIRS[only]!];
  const cells = searchCells();
  const results = pairs.flatMap((pair) => {
    const res = searchPair(pairOptionsV2(pair), cells);
    console.log(pairLine(pair, res));
    return res;
  });
  if (process.argv.includes("--report") || process.argv.includes("--check")) {
    const text = readFileSync(stored, "utf8");
    const moved = movedRowsV2(text, results);
    for (const line of moved) console.log(line);
    if (process.argv.includes("--report")) {
      console.log(`${moved.length} of ${results.length} rows moved. A moved row is not a fault of the corpus, because the stored inputs stay valid.`);
    } else if (moved.length > 0 || (only === undefined && text !== adversaryV2Text(results, cells))) {
      console.error(`${stored} is not the output of the builder. Start node bench/adversary-v2.ts.`);
      process.exitCode = 1;
    }
  } else if (only === undefined) {
    const out = optionOf("--out") ?? ADVERSARY_V2_FILE;
    const text = adversaryV2Text(results, cells);
    writeFileSync(out, text);
    console.log(`${out}: ${results.length} rows of ${pairs.length} pairs, SHA-256 ${createHash("sha256").update(text).digest("hex")}`);
  }
}

if (process.argv[1]?.endsWith("adversary-v2.ts") === true) main();
