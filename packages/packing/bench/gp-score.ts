// The bench of roadmap item k83 (idea R12 of the survey, Burke 2010, Burke 2013): genetic programming of the place score of `maxrects`.
// It is a separate program. The workflow `gp-score.yml` starts it in CI.
//
//   node bench/gp-score.ts --out <file.json> [--population 400] [--generations 100] [--runs 10] [--train 40] [--validation 60] [--skip-held-out]
//
// The search reads generated strips with fresh seeds, and each run gives one tree. The validation seeds choose one tree.
// The program then reads the free-height inputs of `pack-strip-v1`, and no choice comes from them.
// A smoke test or a tuning step gives `--skip-held-out`, so only the single measured run reads these inputs.
// The score tree stays in this file, so no search code and no model goes into the package.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { randomInt, stepRandom } from "@mark1russell7/layout-contract";
import { mean, signTest } from "@mark1russell7/rigor-statistics";
import { LAYOUT_DEFAULTS, layoutStrategy } from "../src/layout-strategy.ts";
import {
  beasleyGcut,
  burkeKendallWhitwell,
  createContext,
  hopperTurton,
  MAXRECTS_RULES,
  objectiveBound,
  objectiveResult,
  packMaxRects,
  packWith,
  toPackInput,
  type MaxRectsRule,
  type MaxRectsScore,
  type PackInput,
  type PackOutput,
} from "../src/index.ts";

/** The id of the random stream of the search. */
export const GP_STAGE: string = "gp-score";

/** The names of the values of a tree. Each length is a share of the strip width. */
export const TERMINALS: readonly ["bw", "bh", "lw", "lh", "x", "y", "top"] = ["bw", "bh", "lw", "lh", "x", "y", "top"];

/** The name of a value of a tree. */
export type Terminal = (typeof TERMINALS)[number];

/** The operations of a tree. The division gives 1 for a divisor near 0. */
export const OPS: readonly ["+", "-", "*", "/", "min", "max"] = ["+", "-", "*", "/", "min", "max"];

/** The name of an operation of a tree. */
export type Op = (typeof OPS)[number];

/** A score as data: a number, a named value, or an operation on two trees. */
export type Tree = number | Terminal | readonly [Op, Tree, Tree];

/** The numbers that a new tree can hold. */
const CONSTANTS: readonly number[] = [-1, 0.5, 1, 2];

/** The most nodes of a tree of the search. */
export const MAX_NODES = 31;

/** The depth of the deepest new tree. */
const NEW_DEPTH = 4;

/** The depth of the deepest tree of a mutation. */
const MUTATION_DEPTH = 3;

/** The count of the trees in a tournament. */
const TOURNAMENT = 3;

/** The share of the children that come from a crossover. The rest come from a mutation. */
const CROSSOVER = 0.9;

/** The fixed rules as trees, in the first population. The rule `cp` has no tree, because it reads the edges of the placed boxes. */
export const RULE_TREES: readonly Tree[] = [
  ["min", "lw", "lh"],
  ["max", "lw", "lh"],
  ["-", ["*", ["+", "lw", "bw"], ["+", "lh", "bh"]], ["*", "bw", "bh"]],
  ["+", "y", "bh"],
];

/** The options of `evolve`. */
export interface EvolveOptions {
  readonly seed: number;
  readonly population: number;
  readonly generations: number;
}

/** The result of `evolve`. */
export interface Evolved {
  readonly tree: Tree;
  readonly fitness: number;
  /** The best fitness at the end of each generation. */
  readonly history: readonly number[];
  /** The count of the different trees that the fitness function read. */
  readonly evaluated: number;
}

/** A spec of a corpus file. */
export interface StripSpec {
  readonly generator: string;
  readonly params: object;
  readonly seeds: readonly number[];
}

/** The heights of one method on a set of inputs, as ratios to the objective bound. */
export interface MethodLine {
  readonly method: string;
  readonly mean: number;
}

/** This function gives a function that evaluates a tree. The array holds the values of `TERMINALS`. */
export function compile(tree: Tree): (values: Float64Array) => number {
  if (typeof tree === "number") return () => tree;
  if (typeof tree === "string") {
    const at = TERMINALS.indexOf(tree);
    return (values) => values[at]!;
  }
  const a = compile(tree[1]);
  const b = compile(tree[2]);
  switch (tree[0]) {
    case "+":
      return (v) => a(v) + b(v);
    case "-":
      return (v) => a(v) - b(v);
    case "*":
      return (v) => a(v) * b(v);
    case "/":
      return (v) => {
        const d = b(v);
        return Math.abs(d) < 1e-9 ? 1 : a(v) / d;
      };
    case "min":
      return (v) => Math.min(a(v), b(v));
    case "max":
      return (v) => Math.max(a(v), b(v));
  }
}

/** This function gives the score of a tree. A value that is not a number is the worst score. */
export function scoreOf(tree: Tree): MaxRectsScore {
  const run = compile(tree);
  const values = new Float64Array(TERMINALS.length);
  return (bw, bh, lw, lh, x, y, top, width) => {
    values[0] = bw / width;
    values[1] = bh / width;
    values[2] = lw / width;
    values[3] = lh / width;
    values[4] = x / width;
    values[5] = y / width;
    values[6] = top / width;
    const score = run(values);
    return Number.isNaN(score) ? Infinity : score;
  };
}

/** This function gives the count of the nodes of a tree. */
export function sizeOf(tree: Tree): number {
  return typeof tree === "object" ? 1 + sizeOf(tree[1]) + sizeOf(tree[2]) : 1;
}

/** This function gives the node at a place in the order that reads a node before its children. */
export function nodeAt(tree: Tree, at: number): Tree {
  if (at === 0 || typeof tree !== "object") return tree;
  const left = sizeOf(tree[1]);
  return at <= left ? nodeAt(tree[1], at - 1) : nodeAt(tree[2], at - 1 - left);
}

/** This function gives a tree with the node at a place replaced. */
export function replaced(tree: Tree, at: number, node: Tree): Tree {
  if (at === 0 || typeof tree !== "object") return node;
  const left = sizeOf(tree[1]);
  return at <= left ? [tree[0], replaced(tree[1], at - 1, node), tree[2]] : [tree[0], tree[1], replaced(tree[2], at - 1 - left, node)];
}

/** This function gives one random leaf. */
function leaf(r: () => number): Tree {
  return r() < 0.75 ? TERMINALS[randomInt(r, 0, TERMINALS.length - 1)]! : CONSTANTS[randomInt(r, 0, CONSTANTS.length - 1)]!;
}

/** This function gives a random tree. With `full`, each leaf is at the depth `depth`. Without it, a leaf can come sooner. */
export function randomTree(r: () => number, depth: number, full: boolean): Tree {
  if (depth === 0 || (!full && r() < 0.3)) return leaf(r);
  return [OPS[randomInt(r, 0, OPS.length - 1)]!, randomTree(r, depth - 1, full), randomTree(r, depth - 1, full)];
}

/** This function gives a child of two trees: a subtree of `b` in the place of a subtree of `a`. A child above `MAX_NODES` nodes is `a`. */
export function crossover(a: Tree, b: Tree, r: () => number): Tree {
  const child = replaced(a, randomInt(r, 0, sizeOf(a) - 1), nodeAt(b, randomInt(r, 0, sizeOf(b) - 1)));
  return sizeOf(child) > MAX_NODES ? a : child;
}

/** This function gives a child of one tree: a random tree in the place of a subtree. A child above `MAX_NODES` nodes is `a`. */
export function mutation(a: Tree, r: () => number): Tree {
  const child = replaced(a, randomInt(r, 0, sizeOf(a) - 1), randomTree(r, randomInt(r, 0, MUTATION_DEPTH), false));
  return sizeOf(child) > MAX_NODES ? a : child;
}

/**
 * This function searches for a tree with a low fitness: a tournament chooses the parents, and the best tree goes on to the next generation.
 * The first population has the fixed rules and new trees of each depth, half of them full. The same seed gives the same bytes.
 */
export function evolve(fitness: (tree: Tree) => number, options: EvolveOptions): Evolved {
  const r = stepRandom(options.seed, GP_STAGE);
  const known = new Map<string, number>();
  const score = (tree: Tree): number => {
    const key = JSON.stringify(tree);
    const value = known.get(key) ?? fitness(tree);
    known.set(key, value);
    return value;
  };
  let population: Tree[] = [...RULE_TREES];
  while (population.length < options.population) {
    const at = population.length;
    population.push(randomTree(r, 1 + (at % NEW_DEPTH), at % 2 === 0));
  }
  const history: number[] = [];
  const bestOf = (trees: readonly Tree[]): Tree =>
    trees.reduce((a, b) => {
      const gap = score(b) - score(a);
      return gap < 0 || (gap === 0 && sizeOf(b) < sizeOf(a)) ? b : a;
    });
  let best = bestOf(population);
  const pick = (): Tree => bestOf(Array.from({ length: TOURNAMENT }, () => population[randomInt(r, 0, population.length - 1)]!));
  for (let g = 0; g < options.generations; g++) {
    const next: Tree[] = [best];
    while (next.length < options.population) next.push(r() < CROSSOVER ? crossover(pick(), pick(), r) : mutation(pick(), r));
    population = next;
    best = bestOf(population);
    history.push(score(best));
  }
  return { tree: best, fitness: score(best), history, evaluated: known.size };
}

/** This function gives the layout of a score. The sort order is the default of the rules. */
export function packScored(input: PackInput, score: MaxRectsScore): PackOutput {
  const strategy = layoutStrategy(
    "maxrects",
    "maxrects",
    [],
    { obstacleMove: ["fixed"], order: ["free", "soft"], rotation: ["none", "quarter"] },
    { ...LAYOUT_DEFAULTS, rule: "bl", rotate: false },
    (rects, outer, options) => {
      packMaxRects(rects, outer, { ...options, score });
    },
  );
  return strategy.pack(input, strategy.defaults, createContext(0));
}

/** This function gives the ratio of an output to the objective bound of its input. */
export function ratioOf(input: PackInput, output: PackOutput): number {
  const bound = objectiveBound(input, { tolerance: 0 })!;
  const height = objectiveResult(input, output, bound);
  if (height === undefined) throw new RangeError(`The output of the input ${input.items.length} leaves out an item.`);
  return height / bound.value;
}

/** This function gives one input of a spec, with a seed that the spec does not hold. */
export function inputOf(spec: StripSpec, seed: number): PackInput {
  switch (spec.generator) {
    case "hopper-turton":
      return toPackInput(hopperTurton.generate(seed, spec.params));
    case "burke-kendall-whitwell":
      return toPackInput(burkeKendallWhitwell.generate(seed, spec.params));
    case "beasley-gcut":
      return toPackInput(beasleyGcut.generate(seed, spec.params));
    default:
      throw new RangeError(`The bench does not know the generator ${spec.generator}.`);
  }
}

/** This function gives `count` inputs of the specs with new seeds from `base`, each with at most `maxItems` items. */
export function freshInputs(specs: readonly StripSpec[], base: number, count: number, maxItems: number): PackInput[] {
  const out: PackInput[] = [];
  for (let i = 0; out.length < count && i < count * specs.length; i++) {
    const input = inputOf(specs[(i * 7) % specs.length]!, base + i);
    if (input.items.length <= maxItems) out.push(input);
  }
  if (out.length < count) throw new RangeError(`The specs give ${out.length} inputs of ${maxItems} items or fewer, not ${count}.`);
  return out;
}

/** This function gives the free-height specs of the corpus file. */
export function heldOutSpecs(): StripSpec[] {
  const text = readFileSync(join(import.meta.dirname, "corpora", "pack-strip-v1.json"), "utf8");
  const { specs } = JSON.parse(text) as { specs: (StripSpec & { params: { containerSize?: string } })[] };
  return specs.filter((spec) => spec.params.containerSize === "freeHeight");
}

/** This function gives the ratios of each fixed rule on a set of inputs. */
function ruleRatios(inputs: readonly PackInput[]): Map<MaxRectsRule, number[]> {
  const rules = MAXRECTS_RULES.filter((rule) => rule !== "wire");
  return new Map(rules.map((rule) => [rule, inputs.map((input) => ratioOf(input, packWith("maxrects", input, { rule })))]));
}

/** This function gives the lowest rule of a table of ratios. */
export function bestRule(ratios: ReadonlyMap<string, readonly number[]>): MethodLine {
  return [...ratios].map(([method, line]) => ({ method, mean: mean(line) })).reduce((a, b) => (b.mean < a.mean ? b : a));
}

/** This function gives the gain of a mean over the mean of a rule, in percent of the rule. */
export function gainOf(chosen: number, rule: number): number {
  return (100 * (rule - chosen)) / rule;
}

/** This function gives the report of a tree on the held-out inputs, against the fixed rules on the same inputs. */
function heldOutReport(specs: readonly StripSpec[], tree: Tree): object {
  const inputs = specs.flatMap((spec) => spec.seeds.map((seed) => inputOf(spec, seed)));
  const rules = ruleRatios(inputs);
  const rule = bestRule(rules);
  const score = scoreOf(tree);
  const chosen = inputs.map((input) => ratioOf(input, packScored(input, score)));
  const rivals = rules.get(rule.method as MaxRectsRule)!;
  const wins = chosen.filter((r, i) => r < rivals[i]!).length;
  const losses = chosen.filter((r, i) => r > rivals[i]!).length;
  return {
    inputs: inputs.length,
    chosen: mean(chosen),
    rule,
    rules: [...rules].map(([method, line]) => ({ method, mean: mean(line) })),
    gain: gainOf(mean(chosen), rule.mean),
    wins,
    losses,
    p: wins + losses === 0 ? 1 : signTest(wins, losses, 2),
  };
}

/** This function starts the bench and writes its report. It gives the exit code. */
function main(): number {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      population: { type: "string", default: "400" },
      generations: { type: "string", default: "100" },
      runs: { type: "string", default: "10" },
      train: { type: "string", default: "40" },
      validation: { type: "string", default: "60" },
      "max-items": { type: "string", default: "200" },
      "skip-held-out": { type: "boolean", default: false },
    },
  });
  if (values.out === undefined) throw new RangeError("The bench needs --out.");
  const maxItems = Number(values["max-items"]);
  const specs = heldOutSpecs();
  const train = freshInputs(specs, 1000, Number(values.train), maxItems);
  const validation = freshInputs(specs, 2000, Number(values.validation), maxItems);
  const meanOn = (inputs: readonly PackInput[], tree: Tree): number[] => {
    const score = scoreOf(tree);
    return inputs.map((input) => ratioOf(input, packScored(input, score)));
  };
  const runs = Array.from({ length: Number(values.runs) }, (_, seed) => {
    const start = performance.now();
    const evolved = evolve((tree) => mean(meanOn(train, tree)), { seed, population: Number(values.population), generations: Number(values.generations) });
    return { seed, ...evolved, nodes: sizeOf(evolved.tree), validation: mean(meanOn(validation, evolved.tree)), ms: performance.now() - start };
  });
  const chosen = runs.reduce((a, b) => (b.validation < a.validation ? b : a));
  const validationRules = bestRule(ruleRatios(validation));
  const report = {
    inputs: { train: train.length, validation: validation.length },
    runs,
    chosen: { seed: chosen.seed, tree: chosen.tree, nodes: chosen.nodes },
    validation: { chosen: chosen.validation, rule: validationRules, gain: gainOf(chosen.validation, validationRules.mean) },
    heldOut: values["skip-held-out"] ? null : heldOutReport(specs, chosen.tree),
  };
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(report, null, 2)}
`);
  console.log(`chosen seed ${chosen.seed}, ${chosen.nodes} nodes: ${JSON.stringify(chosen.tree)}`);
  console.log(`validation: ${report.validation.chosen.toFixed(4)} against ${validationRules.method} ${validationRules.mean.toFixed(4)}, gain ${report.validation.gain.toFixed(2)} %`);
  console.log(`held out: ${JSON.stringify(report.heldOut)}`);
  return 0;
}

if (process.argv[1]?.endsWith("gp-score.ts")) process.exitCode = main();
