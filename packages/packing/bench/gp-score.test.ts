import { stepRandom } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { packWith } from "../src/index.ts";
import {
  bestRule,
  compile,
  crossover,
  evolve,
  freshInputs,
  gainOf,
  heldOutSpecs,
  inputOf,
  MAX_NODES,
  mutation,
  nodeAt,
  packScored,
  randomTree,
  ratioOf,
  replaced,
  RULE_TREES,
  scoreOf,
  sizeOf,
  type Tree,
} from "./gp-score.ts";

/** A made-up tree: bw + (bh * 2). */
const SAMPLE: Tree = ["+", "bw", ["*", "bh", 2]];

describe("the score trees", () => {
  it("evaluates each operation", () => {
    const values = Float64Array.of(3, 4, 0, 0, 0, 0, 0);
    expect(compile(SAMPLE)(values)).toBe(11);
    expect(compile(["-", "bw", "bh"])(values)).toBe(-1);
    expect(compile(["/", "bh", 2])(values)).toBe(2);
    expect(compile(["min", "bw", "bh"])(values)).toBe(3);
    expect(compile(["max", "bw", "bh"])(values)).toBe(4);
  });

  it("gives 1 for a divisor near 0", () => {
    expect(compile(["/", 5, ["-", "bw", "bw"]])(Float64Array.of(3, 0, 0, 0, 0, 0, 0))).toBe(1);
  });

  it("reads each length as a share of the width, and gives the worst score to a value that is no number", () => {
    expect(scoreOf(["+", "bw", "top"])(5, 1, 1, 1, 1, 1, 15, 10)).toBe(2);
    expect(scoreOf(["-", ["*", 1e308, 1e308], ["*", 1e308, 1e308]])(1, 1, 1, 1, 1, 1, 1, 1)).toBe(Infinity);
  });

  it("counts, reads and replaces the nodes in one order", () => {
    expect(sizeOf(SAMPLE)).toBe(5);
    expect([0, 1, 2, 3, 4].map((at) => nodeAt(SAMPLE, at))).toEqual([SAMPLE, "bw", ["*", "bh", 2], "bh", 2]);
    expect(replaced(SAMPLE, 3, "x")).toEqual(["+", "bw", ["*", "x", 2]]);
    expect(replaced(SAMPLE, 0, 1)).toBe(1);
  });

  it("keeps each child in the node limit", () => {
    const r = stepRandom(1, "test");
    let tree: Tree = randomTree(r, 4, true);
    for (let i = 0; i < 400; i++) {
      tree = i % 2 === 0 ? crossover(tree, randomTree(r, 4, true), r) : mutation(tree, r);
      expect(sizeOf(tree)).toBeLessThanOrEqual(MAX_NODES);
    }
  });
});

describe("the search", () => {
  /** A fitness with a known best tree: the value of the tree at one point, as near to 0.3 as it can come. */
  const fitness = (tree: Tree): number => Math.abs(compile(tree)(Float64Array.of(0.2, 0.7, 0.1, 0.4, 0, 0, 0)) - 0.3);

  it("gives the same bytes for the same seed", () => {
    const a = evolve(fitness, { seed: 4, population: 24, generations: 8 });
    expect(JSON.stringify(evolve(fitness, { seed: 4, population: 24, generations: 8 }))).toBe(JSON.stringify(a));
  });

  it("does not lose its best tree", () => {
    const { history } = evolve(fitness, { seed: 2, population: 24, generations: 12 });
    expect(history).toHaveLength(12);
    history.slice(1).forEach((value, i) => expect(value).toBeLessThanOrEqual(history[i]!));
  });

  it("lowers the fitness of the first population", () => {
    const first = Math.min(...RULE_TREES.map(fitness));
    expect(evolve(fitness, { seed: 7, population: 48, generations: 20 }).fitness).toBeLessThan(first);
  });
});

describe("the bench of the place score", () => {
  const specs = heldOutSpecs();

  it("reads the 264 free-height inputs of the corpus", () => {
    expect(specs).toHaveLength(80);
    expect(specs.reduce((sum, spec) => sum + spec.seeds.length, 0)).toBe(264);
  });

  it("gives fresh inputs that respect the item limit", () => {
    const inputs = freshInputs(specs, 1000, 6, 100);
    expect(inputs).toHaveLength(6);
    for (const input of inputs) expect(input.items.length).toBeLessThanOrEqual(100);
    expect(inputs[0]).not.toEqual(inputOf(specs[0]!, specs[0]!.seeds[0]!));
    expect(() => freshInputs(specs, 1000, 3, 1)).toThrow(RangeError);
  });

  it("gives the heights of the rule bl with the tree of that rule", () => {
    const score = scoreOf(RULE_TREES[3]!);
    for (const input of freshInputs(specs, 3000, 4, 60)) {
      expect(ratioOf(input, packScored(input, score))).toBe(ratioOf(input, packWith("maxrects", input, { rule: "bl" })));
    }
  });

  it("chooses the lowest rule and gives its gain in percent", () => {
    expect(bestRule(new Map([["a", [2, 2]], ["b", [1, 2]]]))).toEqual({ method: "b", mean: 1.5 });
    expect(gainOf(1.5, 2)).toBe(25);
  });
});
