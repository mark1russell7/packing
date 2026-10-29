import { describe, expect, it } from "vitest";
import {
  composites,
  packPortfolio,
  packWith,
  portfolioDefaultMembers,
  portfolioMembers,
  portfolioStrategy,
  rectGrid,
  strategies,
  strategy,
  toPackInput,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The strategy `portfolio` of k20, part 2. Made-up inputs of the generators only.

/** This function makes the inputs of the tests: two counts and two size kinds, with and without obstacles. */
function inputs(): PackInput[] {
  const out: PackInput[] = [];
  for (const count of [10, 100] as const) {
    for (const sizes of ["uniform", "heavyTail"] as const) {
      for (const obstacles of ["none", "scattered"] as const) out.push(toPackInput(rectGrid.generate(1, { containerShape: "rect", containerSize: "fixed", obstacles, sizes, count })));
    }
  }
  return out;
}

/** This function gives an output without the times of its trace stages, because the times change on each run. */
function bare(output: PackOutput): unknown {
  return { placements: output.placements, overflow: output.overflow, size: output.size, trace: (output.trace ?? []).map(({ ms: _ms, ...stage }) => stage) };
}

/** This function makes a clock that moves `step` milliseconds on each read. */
function clock(step: number): () => number {
  let t = 0;
  return () => (t += step);
}

describe("the strategy portfolio", () => {
  it("is a composite strategy of the registry, not a single strategy", () => {
    expect(composites.map((s) => s.id)).toEqual(["portfolio", "aspect-fit", "select", "restarts", "bbox", "ruin-recreate"]);
    expect(strategies.map((s) => s.id)).not.toContain("portfolio");
    expect(strategy("portfolio")).toBe(portfolioStrategy);
    expect(portfolioStrategy.defaults).toEqual({});
  });

  it("with k, gives the output of packPortfolio with the k members of the cell", () => {
    for (const input of inputs()) {
      for (const k of [2, 3] as const) {
        const want = packPortfolio((x) => portfolioMembers(x, k), { id: `portfolio-k${k}`, seed: 4 }).run(input);
        expect(bare(packWith("portfolio", input, { k }, 4))).toEqual(bare(want));
      }
    }
  });

  it("without options, runs the defaultMembers first members of the set of 3 of the cell", () => {
    for (const input of inputs()) {
      const count = portfolioDefaultMembers(input);
      const want = packPortfolio((x) => portfolioMembers(x, 3), { id: "portfolio", maxMembers: count }).run(input);
      expect(bare(packWith("portfolio", input))).toEqual(bare(want));
      const trace = packPortfolio((x) => portfolioMembers(x, 3), { maxMembers: count }).pick(input).trace;
      expect(trace.members.filter((m) => m.status === "ran" || m.status === "error")).toHaveLength(count);
    }
  });

  it("gives one output for two clocks when budgetMs is not set", () => {
    for (const input of inputs()) {
      const count = portfolioDefaultMembers(input);
      const slow = packPortfolio((x) => portfolioMembers(x, 3), { maxMembers: count, now: clock(1000) }).run(input);
      const fast = packPortfolio((x) => portfolioMembers(x, 3), { maxMembers: count, now: clock(0.001) }).run(input);
      expect(bare(slow)).toEqual(bare(fast));
      expect(bare(packWith("portfolio", input))).toEqual(bare(slow));
    }
  });

  it("passes budgetMs to the contract: a limit of 0 runs only the first member", () => {
    const input = inputs()[0]!;
    const first = portfolioMembers(input, 3)[0]!;
    const out = packWith("portfolio", input, { k: 3, budgetMs: 0 });
    expect(bare({ ...out, trace: out.trace!.slice(0, -1) })).toEqual(bare(packWith(first.strategy, input, first.options)));
  });

  it("throws a RangeError for a k other than 2 or 3, and for k with members", () => {
    expect(() => packWith("portfolio", inputs()[0]!, { k: 4 })).toThrow(RangeError);
    expect(() => packWith("portfolio", inputs()[0]!, { k: 2, members: ["rows"] })).toThrow(RangeError);
  });

  it("with members and key, gives the output of packPortfolio with these members and this key", () => {
    const members = ["rows", { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }];
    const key = ["pack.area", "pack.overflow.excessArea", "pack.fill"];
    for (const input of inputs()) {
      const want = packPortfolio(members, { id: "portfolio", seed: 2, key }).run(input);
      expect(bare(packWith("portfolio", input, { members, key }, 2))).toEqual(bare(want));
    }
  });
});
