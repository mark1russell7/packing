// The adversarial search of roadmap item k47. For an ordered pair of entries (A, B), it searches for the inputs where A
// loses most to B. `docs/BENCH.md` ("The adversarial search") tells the search, and `docs/MEASURES.md` ("The loss") tells
// the measure. The file `bench/corpora/pack-adversary-v1.json` is the output of the builder. A test compares a part of it.
//
//   node bench/adversary.ts                 writes the file
//   node bench/adversary.ts --check         exits with the code 1 when the file is not the output of the builder
//   node bench/adversary.ts --check --pair 2  examines only the pair with the index 2

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  boundMeasures,
  checkHard,
  corpusFamilies,
  countCell,
  DEFAULT_TOLERANCE,
  fnv1a32,
  generator,
  hashInput,
  measure,
  mulberry32,
  packWith,
  strategy,
  toPackInput,
  UnsupportedCell,
  unsupportedOf,
  type CorpusCell,
  type GeneratedInput,
  type GeneratorParams,
  type LayoutContainer,
  type PackInput,
} from "@mark1russell7/packing";
import { ENTRIES, entry, isComposite } from "./entries.ts";

/** The name of the corpus. */
export const ADVERSARY_CORPUS = "pack-adversary-v1";

/** The name of the search in the generator stamp of each input that it makes. */
export const ADVERSARY_NAME = "adversary";

/** The version of the search. A change of its output needs a new version. */
export const ADVERSARY_VERSION = 1;

/** The file of the corpus. */
export const ADVERSARY_FILE: string = join(import.meta.dirname, "corpora", `${ADVERSARY_CORPUS}.json`);

/** The value of B that tells the search to use the best single entry on each input. */
export const BEST = "best";

/** The generators where a search starts: the adversarial families, the ladder and the classes of the literature. */
export const ORIGINS: readonly string[] = Object.freeze(["tall-row", "skyline-gap", "bl-trap", "half-wide", "ladder", "berkey-wang", "martello-vigo"]);

/** The evaluations without a better input before the search starts again from a new origin. */
export const PATIENCE = 120;

/** The share of the moves that change the parameters or the seed of the origin. The other moves change one item. */
export const PARAM_SHARE = 0.2;

/** The pairs of the corpus: A and B. The value `best` of B is the best single entry on each input. */
export const ADVERSARY_PAIRS: readonly (readonly [string, string])[] = Object.freeze([
  ["skyline", "maxrects-bl"],
  ["shelf-best", "maxrects-bl"],
  ["rows", "maxrects-bl"],
  ["maxrects-bl", "skyline"],
  ["maxrects-bl", "restarts-maxrects-bl-k16"],
  ["select-rows-bl", BEST],
]);

/** The seed of each search of the corpus. */
export const ADVERSARY_SEED = 1;

/** The budget of each search of the corpus, in evaluations. */
export const ADVERSARY_BUDGET = 2000;

/** The largest count of items of an input of the corpus. */
export const ADVERSARY_MAX_COUNT = 60;

/** The options of one search. */
export interface AdversaryOptions {
  /** The entry that loses. */
  a: string;
  /** The entry that wins, or `best`. */
  b: string;
  /** The seed of the search. The same options give the same result. */
  seed: number;
  /** The count of evaluations. One evaluation packs one candidate with A and B. */
  budget: number;
  /** The largest count of items of a candidate. */
  maxCount: number;
  /** The generators where the search starts. The default is `ORIGINS`. */
  origins?: readonly string[];
}

/** The measure of the loss: the fill for a fixed container, the gap to the bound of k51 for the other containers. */
export type LossMeasure = "fill" | "gap";

/** The score of one candidate. */
export interface Loss {
  measure: LossMeasure;
  /** For `fill`, it is `fill(B) - fill(A)`. For `gap`, it is `gap(A) - gap(B)`. A value above 0 tells that A loses. */
  loss: number;
  /** The value of the measure for A. */
  valueA: number;
  /** The value of the measure for B. */
  valueB: number;
  /** The count of the breaks of the hard rules of A. B has no break. */
  hardA: number;
  /** The entry of B. With `best`, it is the best single entry on the candidate. */
  winner: string;
}

/** The origin of a candidate: the generator, its full parameters and its seed. */
export interface Origin {
  generator: string;
  version: number;
  params: GeneratorParams;
  seed: number;
}

/** One step of the path to the worst input: the evaluation, the move and the loss after the move. */
export interface AdversaryStep {
  evaluation: number;
  move: string;
  loss: number;
}

/** The result of one search. */
export interface AdversaryResult {
  options: AdversaryOptions;
  /** The count of evaluations: the budget. */
  evaluations: number;
  /** The count of candidates with a loss. A candidate has no loss when B breaks a hard rule or a measure has no value. */
  valid: number;
  /** The count of starts from an origin. */
  starts: number;
  /** The worst input that the search found, or `null` when no candidate has a loss. */
  worst: { input: GeneratedInput; score: Loss; origin: Origin; evaluation: number } | null;
  /** The moves from the origin of the worst input to the worst input. Each move makes the loss larger. */
  path: AdversaryStep[];
}

/** A whole number from lo to hi, both included. */
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** One size of an item. */
type Size = readonly [number, number];

/** The state of the search: the origin, the container, the cell of the origin and the sizes in the order of the input. */
interface State {
  origin: Origin;
  container: LayoutContainer;
  cell: CorpusCell;
  sizes: Size[];
}

/** This function gives the family of a pair. Each input of a pair has it. */
export const familyOfPair = (a: string, b: string): string => `${ADVERSARY_NAME}.${a}.${b}`;

/** This function gives the input file of a state. The file has the stamp of the search and its hash. */
export function candidateFile(options: AdversaryOptions, state: Pick<State, "origin" | "container" | "sizes">): GeneratedInput {
  const family = familyOfPair(options.a, options.b);
  const params: GeneratorParams = { a: options.a, b: options.b, seed: options.seed, budget: options.budget, maxCount: options.maxCount, origin: state.origin.generator };
  const file: Omit<GeneratedInput, "hash"> = {
    schema: "layout-input/1",
    id: `${ADVERSARY_CORPUS}/${family}/s${options.seed}`,
    set: ADVERSARY_CORPUS,
    family,
    seed: options.seed,
    source: "made-up",
    generator: { name: ADVERSARY_NAME, version: ADVERSARY_VERSION, params, seed: options.seed },
    container: state.container,
    obstacles: [],
    boxes: state.sizes.map(([w, h], i) => ({ id: `b${i}`, w, h })),
    edges: [],
  };
  return { ...file, hash: hashInput(file) };
}

/** This function gives the cell of a candidate: the cell of its origin with the count of its items. */
const cellOf = (state: State): CorpusCell => ({ ...state.cell, count: countCell(state.sizes.length) });

/** The value of an entry on an input, and the count of its breaks of the hard rules. */
interface EntryValue {
  value: number;
  hard: number;
}

/** This function packs an input with an entry. It gives `undefined` when the entry does not support the cell or the measure has no value. */
function valueOf(id: string, input: PackInput, cell: CorpusCell, seed: number, kind: LossMeasure): EntryValue | undefined {
  const e = entry(id);
  const s = strategy(e.strategy);
  if (unsupportedOf(s.supports, cell) !== undefined) return undefined;
  const given = Object.keys(e.options).length === 0 ? undefined : { ...(s.defaults as Record<string, unknown>), ...e.options };
  try {
    const output = packWith(e.strategy, input, given, seed);
    const hard = Object.values(checkHard(input, output, DEFAULT_TOLERANCE)).reduce((sum, n) => sum + n, 0);
    const value = kind === "fill" ? measure(input, output)["pack.fill"] : boundMeasures(input, output)["pack.gap"];
    return value === undefined || !Number.isFinite(value) ? undefined : { value, hard };
  } catch (error) {
    if (error instanceof UnsupportedCell) return undefined;
    throw error;
  }
}

/** The single entries of the benchmark: the pool of `best`. */
export const SINGLE_ENTRIES: readonly string[] = Object.freeze(ENTRIES.filter((e) => !isComposite(e.id)).map((e) => e.id));

/** This function gives the measure of the loss on a container: `fill` for a fixed size, else `gap`. */
export const lossMeasureOf = (container: LayoutContainer): LossMeasure => (container.fixed === "size" ? "fill" : "gap");

/**
 * This function gives the loss of A to B on one input. It gives `undefined` when B breaks a hard rule, when A or B does
 * not support the cell, or when a measure has no value. With `best`, B is the single entry with the best value and no
 * break. The first entry of `SINGLE_ENTRIES` wins a tie.
 */
export function lossOf(a: string, b: string, file: GeneratedInput, cell: CorpusCell): Loss | undefined {
  const input = toPackInput(file);
  const kind = lossMeasureOf(file.container);
  const valueA = valueOf(a, input, cell, file.seed, kind);
  if (valueA === undefined) return undefined;
  let winner: string | undefined;
  let valueB: number | undefined;
  for (const id of b === BEST ? SINGLE_ENTRIES.filter((x) => x !== a) : [b]) {
    const v = valueOf(id, input, cell, file.seed, kind);
    if (v === undefined || v.hard > 0) continue;
    if (valueB === undefined || (kind === "fill" ? v.value > valueB : v.value < valueB)) {
      winner = id;
      valueB = v.value;
    }
  }
  if (winner === undefined || valueB === undefined) return undefined;
  const loss = kind === "fill" ? valueB - valueA.value : valueA.value - valueB;
  return { measure: kind, loss, valueA: valueA.value, valueB, winner, hardA: valueA.hard };
}

/** The item moves of the search. */
export const ITEM_MOVES: readonly string[] = Object.freeze(["resize", "split", "merge", "swap", "add", "delete"]);

/**
 * This function changes one item of a list of sizes. The move is one of `ITEM_MOVES`. A move that does not apply gives
 * the next move of the list. Each width stays from 1 to `width`. With a fixed `height`, each height stays from 1 to it.
 * The count stays from 1 to `maxCount`.
 */
export function mutateSizes(
  sizes: readonly Size[],
  width: number,
  height: number | undefined,
  maxCount: number,
  r: () => number,
): { sizes: Size[]; move: string } {
  const n = sizes.length;
  const limit = (axis: 0 | 1): number => (axis === 0 ? width : (height ?? Number.MAX_SAFE_INTEGER));
  const first = int(r, 0, ITEM_MOVES.length - 1);
  for (let k = 0; k < ITEM_MOVES.length; k++) {
    const move = ITEM_MOVES[(first + k) % ITEM_MOVES.length]!;
    const out = [...sizes];
    const i = int(r, 0, n - 1);
    const axis: 0 | 1 = r() < 0.5 ? 0 : 1;
    switch (move) {
      case "resize": {
        const v = sizes[i]![axis];
        let nv = r() < 0.5 ? v + (r() < 0.5 ? -1 : 1) * int(r, 1, Math.max(1, Math.floor(v / 4))) : int(r, 1, 2 * v);
        nv = Math.min(limit(axis), Math.max(1, nv));
        if (nv === v) nv = v > 1 ? v - 1 : Math.min(limit(axis), v + 1);
        if (nv === v) continue;
        out[i] = axis === 0 ? [nv, sizes[i]![1]] : [sizes[i]![0], nv];
        return { sizes: out, move: `resize b${i} ${axis === 0 ? "w" : "h"} ${v} to ${nv}` };
      }
      case "split": {
        if (n >= maxCount) continue;
        const ax: 0 | 1 = sizes[i]![axis] >= 2 ? axis : axis === 0 ? 1 : 0;
        const v = sizes[i]![ax];
        if (v < 2) continue;
        const cut = int(r, 1, v - 1);
        const [w, h] = sizes[i]!;
        out.splice(i, 1, ...(ax === 0 ? [[cut, h], [w - cut, h]] : [[w, cut], [w, h - cut]]) as Size[]);
        return { sizes: out, move: `split b${i} ${ax === 0 ? "w" : "h"} at ${cut}` };
      }
      case "merge": {
        if (n < 2) continue;
        let j = int(r, 0, n - 2);
        if (j >= i) j++;
        const [wi, hi] = sizes[i]!;
        const [wj, hj] = sizes[j]!;
        let merged: Size;
        if (wi + wj <= width) merged = [wi + wj, Math.max(hi, hj)];
        else if (hi + hj <= limit(1)) merged = [Math.max(wi, wj), hi + hj];
        else continue;
        out[Math.min(i, j)] = merged;
        out.splice(Math.max(i, j), 1);
        return { sizes: out, move: `merge b${i} b${j}` };
      }
      case "swap": {
        if (n < 2) continue;
        let j = int(r, 0, n - 2);
        if (j >= i) j++;
        [out[i], out[j]] = [out[j]!, out[i]!];
        return { sizes: out, move: `swap b${i} b${j}` };
      }
      case "add": {
        if (n >= maxCount) continue;
        const at = int(r, 0, n);
        out.splice(at, 0, sizes[i]!);
        return { sizes: out, move: `add a copy of b${i} at ${at}` };
      }
      case "delete": {
        if (n < 2) continue;
        out.splice(i, 1);
        return { sizes: out, move: `delete b${i}` };
      }
    }
  }
  throw new RangeError(`No move applies to the ${n} items.`);
}

/** The parameters of an origin that the search changes, with their values or their range. The knobs are not in the list. */
interface ParamSpace {
  name: string;
  values?: readonly (string | number)[];
  min?: number;
  max?: number;
}

/** This function gives the parameters of a generator that the search changes. The range of `count` ends at `maxCount`. */
function paramSpace(name: string, maxCount: number): ParamSpace[] {
  const family = corpusFamilies.find((f) => f.name === name);
  if (family === undefined) throw new RangeError(`The package has no family "${name}".`);
  const keys = Object.keys(generator(name).defaults);
  return family.dimensions
    .filter((d) => keys.includes(d.name))
    .map((d): ParamSpace => {
      const values = Array.isArray(d.supported) ? (d.supported as readonly (string | number)[]) : d.values;
      if (values !== undefined) return { name: d.name, values };
      if (d.name === "count") return { name: d.name, min: Math.max(1, d.min ?? 1), max: Math.min(maxCount, d.max ?? maxCount) };
      return { name: d.name, min: d.min ?? 0, max: d.max ?? 0 };
    });
}

/** This function gives a random value of a parameter. */
const randomValue = (p: ParamSpace, r: () => number): string | number => (p.values !== undefined ? p.values[int(r, 0, p.values.length - 1)]! : int(r, p.min!, p.max!));

/** This function gives the state of an origin. A list longer than `maxCount` keeps its first `maxCount` items. */
function stateOf(origin: Origin, maxCount: number): State {
  const gen = generator(origin.generator, origin.version);
  const file = gen.generate(origin.seed, origin.params);
  return {
    origin,
    container: file.container,
    cell: gen.cell(origin.params),
    sizes: file.boxes.slice(0, maxCount).map((b): Size => [b.w, b.h]),
  };
}

/** This function gives a random origin: a generator of the list, random parameters and a random seed. */
function randomOrigin(origins: readonly string[], maxCount: number, r: () => number): Origin {
  const name = origins[int(r, 0, origins.length - 1)]!;
  const gen = generator(name);
  const params: GeneratorParams = {};
  for (const p of paramSpace(name, maxCount)) params[p.name] = randomValue(p, r);
  return { generator: name, version: gen.version, params: gen.withDefaults(params), seed: int(r, 1, 999_999) };
}

/** This function changes the parameters or the seed of an origin. Each change of one value is one move. */
function mutateOrigin(origin: Origin, maxCount: number, r: () => number): { origin: Origin; move: string } {
  const space = paramSpace(origin.generator, maxCount);
  const at = int(r, 0, space.length);
  if (at === space.length) {
    const seed = int(r, 1, 999_999);
    return { origin: { ...origin, seed }, move: `seed ${origin.seed} to ${seed}` };
  }
  const p = space[at]!;
  const old = origin.params[p.name]!;
  let value: string | number;
  if (p.values === undefined && typeof old === "number" && r() < 0.5) value = Math.min(p.max!, Math.max(p.min!, old + (r() < 0.5 ? -1 : 1)));
  else value = randomValue(p, r);
  return { origin: { ...origin, params: { ...origin.params, [p.name]: value } }, move: `${p.name} ${old} to ${value}` };
}

/** This function tells the origin of a state in a move of the path. */
const startMove = (o: Origin): string => `start ${o.generator} ${Object.entries(o.params).map(([k, v]) => `${k}=${v}`).join(" ")} seed=${o.seed}`;

/**
 * This function searches for the input where A loses most to B. It is a seeded hill climb with restarts.
 *
 * - A start takes a random origin: a generator of `origins`, random parameters in the ranges of its family, and a random seed.
 * - A move changes one parameter or the seed of the origin, or one item: `resize`, `split`, `merge`, `swap`, `add` or `delete`.
 * - The search keeps a move when its loss is not less than the loss before it. After `PATIENCE` evaluations with no gain, it starts again.
 * - Each start and each move costs one evaluation. The search stops after `budget` evaluations. It reads no clock.
 * - The search compares a loss of `fill` and a loss of `gap` as numbers. A move of `containerSize` changes the measure.
 * - The function `observe` gets each candidate and its loss, in the order of the evaluations.
 */
export function searchAdversary(options: AdversaryOptions, observe?: (file: GeneratedInput, score: Loss | undefined) => void): AdversaryResult {
  const { a, b, seed, budget, maxCount } = options;
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError("The budget is a whole number of 1 or more.");
  if (!Number.isInteger(maxCount) || maxCount < 1) throw new RangeError("The largest count is a whole number of 1 or more.");
  entry(a);
  if (b !== BEST) entry(b);
  const origins = options.origins ?? ORIGINS;
  const r = mulberry32(fnv1a32(`${ADVERSARY_NAME}:${a}:${b}:${seed}`));
  const result: AdversaryResult = { options: { ...options, origins: [...origins] }, evaluations: 0, valid: 0, starts: 0, worst: null, path: [] };

  let current: { state: State; loss: number; path: AdversaryStep[] } | undefined;
  let stale = 0;
  const evaluate = (state: State): { file: GeneratedInput; score: Loss | undefined } => {
    const file = candidateFile(options, state);
    const score = lossOf(a, b, file, cellOf(state));
    result.evaluations++;
    if (score !== undefined) result.valid++;
    observe?.(file, score);
    return { file, score };
  };
  const keepWorst = (state: State, file: GeneratedInput, score: Loss, path: AdversaryStep[]): void => {
    if (result.worst === null || score.loss > result.worst.score.loss) {
      result.worst = { input: file, score, origin: state.origin, evaluation: result.evaluations };
      result.path = path;
    }
  };

  while (result.evaluations < budget) {
    if (current === undefined || stale >= PATIENCE) {
      const origin = randomOrigin(origins, maxCount, r);
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
    if (r() < PARAM_SHARE) {
      const changed = mutateOrigin(current.state.origin, maxCount, r);
      state = stateOf(changed.origin, maxCount);
      move = `${changed.move}, then ${startMove(changed.origin)}`;
    } else {
      const c = current.state.container;
      const changed = mutateSizes(current.state.sizes, c.w ?? Number.MAX_SAFE_INTEGER, c.fixed === "size" ? c.h : undefined, maxCount, r);
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

/** This function rounds a number to 6 decimals, for the file of the corpus. */
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6 + 0;

/** This function gives the options of the search of a pair of the corpus. */
export const pairOptions = ([a, b]: readonly [string, string]): AdversaryOptions => ({ a, b, seed: ADVERSARY_SEED, budget: ADVERSARY_BUDGET, maxCount: ADVERSARY_MAX_COUNT });

/** This function gives a JSON value on one line, with a space after each colon and each comma. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")}}`;
  return JSON.stringify(value);
}

/** This function gives the line of a result in the field `found` of the file: the pair, the loss, the origin and the path. */
export function foundLine(result: AdversaryResult): string {
  const { a, b, seed, budget, maxCount } = result.options;
  const w = result.worst;
  if (w === null) return inline({ a, b, seed, budget, maxCount, input: null, evaluations: result.evaluations, valid: result.valid, starts: result.starts });
  return inline({
    a,
    b,
    seed,
    budget,
    maxCount,
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

/** This function gives the line of the worst input of a result in the field `inputs` of the file, or `undefined` with no input. */
export const inputLine = (result: AdversaryResult): string | undefined => (result.worst === null ? undefined : JSON.stringify(result.worst.input));

/** This function gives the text of the corpus file from the results of the pairs, in their order. */
export function adversaryCorpusText(results: readonly AdversaryResult[]): string {
  const inputs = results.flatMap((res) => {
    const line = inputLine(res);
    return line === undefined ? [] : [line];
  });
  const lines = [
    "{",
    `  "schema": "layout-corpus/1",`,
    `  "corpus": ${JSON.stringify(ADVERSARY_CORPUS)},`,
    `  "heldOut": "all",`,
    `  "search": ${inline({ name: ADVERSARY_NAME, version: ADVERSARY_VERSION, seed: ADVERSARY_SEED, budget: ADVERSARY_BUDGET, maxCount: ADVERSARY_MAX_COUNT, origins: ORIGINS })},`,
    `  "found": [`,
    results.map((res) => `    ${foundLine(res)}`).join(",\n"),
    "  ],",
    `  "inputs": [`,
    inputs.map((line) => `    ${line}`).join(",\n"),
    "  ]",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

/** The parts of the corpus file that a test reads. */
export interface AdversaryCorpusFile {
  schema: "layout-corpus/1";
  corpus: string;
  found: Record<string, unknown>[];
  inputs: GeneratedInput[];
}

/** This function reads the corpus file. */
export const readAdversaryCorpus = (text: string = readFileSync(ADVERSARY_FILE, "utf8")): AdversaryCorpusFile => JSON.parse(text) as AdversaryCorpusFile;

if (process.argv[1]?.endsWith("adversary.ts") === true) {
  const at = process.argv.indexOf("--pair");
  const only = at === -1 ? undefined : Number(process.argv[at + 1]);
  if (only !== undefined && !(Number.isInteger(only) && only >= 0 && only < ADVERSARY_PAIRS.length)) throw new RangeError(`--pair is a whole number from 0 to ${ADVERSARY_PAIRS.length - 1}.`);
  const pairs = only === undefined ? ADVERSARY_PAIRS : [ADVERSARY_PAIRS[only]!];
  const results = pairs.map((pair) => {
    const res = searchAdversary(pairOptions(pair));
    const w = res.worst;
    console.log(`${pair[0]} to ${pair[1]}: ${w === null ? "no input" : `loss ${round6(w.score.loss)} (${w.score.measure}), ${w.input.boxes.length} items, from ${w.origin.generator}, winner ${w.score.winner}`}`);
    return res;
  });
  if (process.argv.includes("--check")) {
    const text = readFileSync(ADVERSARY_FILE, "utf8");
    const same = only === undefined ? text === adversaryCorpusText(results) : results.every((res) => text.includes(foundLine(res)) && (inputLine(res) === undefined || text.includes(inputLine(res)!)));
    if (!same) {
      console.error(`${ADVERSARY_FILE} is not the output of the builder. Start node bench/adversary.ts.`);
      process.exitCode = 1;
    }
  } else if (only === undefined) {
    writeFileSync(ADVERSARY_FILE, adversaryCorpusText(results));
    console.log(`${ADVERSARY_FILE}: ${results.length} pairs`);
  }
}
