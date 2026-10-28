import { createHash } from "node:crypto";
import { selectBest } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hardBreaks,
  measure,
  outputHash,
  packPortfolio,
  packWith,
  PORTFOLIO_LEVELS,
  PORTFOLIO_STAGE,
  rectGrid,
  toPackInput,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The opt-in portfolio of k20, part 1. Made-up inputs of the generators only.

const MEMBERS = ["shelf", "skyline", { id: "maxrects-cp", strategy: "maxrects", options: { rule: "cp" } }, { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }] as const;

/** This function makes the inputs of the tests: each container size, with and without obstacles. */
function inputs(): PackInput[] {
  const out: PackInput[] = [];
  for (const containerSize of ["fixed", "freeHeight"] as const) {
    for (const obstacles of ["none", "scattered"] as const) {
      for (const seed of [1, 2]) out.push(toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize, obstacles, sizes: "heavyTail", count: 30 })));
    }
  }
  return out;
}

/** This function packs an input with one member of `MEMBERS`, as the portfolio does. */
function packMember(m: (typeof MEMBERS)[number], input: PackInput): PackOutput {
  return typeof m === "string" ? packWith(m, input) : packWith(m.strategy, input, m.options);
}

/** This function gives an output without the times of its trace stages, because the times change on each run. */
function bare(output: PackOutput): { placements: PackOutput["placements"]; overflow: PackOutput["overflow"]; size: PackOutput["size"]; trace: unknown[] } {
  return { placements: output.placements, overflow: output.overflow, size: output.size, trace: (output.trace ?? []).map(({ ms: _ms, ...stage }) => stage) };
}

describe("outputHash", () => {
  it("is the SHA-256 of the canonical form of the placements sorted by id, as the records of 0.2.5 have it", () => {
    const output = packWith("shelf", inputs()[0]!);
    const sorted = output.placements.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(outputHash(output)).toBe(createHash("sha256").update(canonicalJson(sorted)).digest("hex").slice(0, 16));
    expect(outputHash({ placements: output.placements.toReversed() })).toBe(outputHash(output));
    expect(outputHash(output)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("packPortfolio", () => {
  it("picks the member that selectBest picks on the hard breaks, the excess area and the fill", () => {
    const p = packPortfolio(MEMBERS);
    let picked = 0;
    for (const input of inputs()) {
      const outputs = MEMBERS.map((m) => packMember(m, input));
      const candidates = MEMBERS.map((m, i) => {
        const values = measure(input, outputs[i]!);
        return { id: typeof m === "string" ? m : m.id, values: { hard: hardBreaks(input, outputs[i]!), "pack.overflow.excessArea": values["pack.overflow.excessArea"], "pack.fill": values["pack.fill"] } };
      });
      const expected = selectBest(candidates, PORTFOLIO_LEVELS);
      const got = p.pick(input);
      expect(got.winner).toBe(expected.winner);
      expect(got.trace.kept).toEqual(expected.kept);
      // The output is the output of the winner, with one more trace stage
      const own = outputs[got.trace.winnerIndex]!;
      expect(got.output.placements).toEqual(own.placements);
      expect(got.output.overflow).toEqual(own.overflow);
      expect(bare(got.output).trace.slice(0, -1)).toEqual(bare(own).trace);
      expect(got.output.trace!.at(-1)).toEqual({ id: PORTFOLIO_STAGE, measures: { "move.pick": got.trace.picked ? 1 : 0 } });
      expect(got.trace.members.map((m) => m.outputHash)).toEqual(outputs.map(outputHash));
      expect(got.trace.deterministic).toBe(true);
      if (got.trace.picked) picked++;
    }
    // The inputs exercise the pick: member 0 does not win each one
    expect(picked).toBeGreaterThan(0);
  });

  it("gives move.pick 0 when member 0 wins, and run gives the output of pick", () => {
    const input = inputs()[0]!;
    const one = packPortfolio(["shelf"]);
    const got = one.pick(input);
    expect([got.winner, got.trace.picked, got.output.trace!.at(-1)]).toEqual(["shelf", false, { id: PORTFOLIO_STAGE, measures: { "move.pick": 0 } }]);
    expect(bare(one.run(input))).toEqual(bare(got.output));
    expect(one.id).toBe("portfolio");
    expect(packPortfolio(["shelf"], { id: "mine" }).id).toBe("mine");
  });

  it("cuts the members after maxMembers, and keeps the pick deterministic", () => {
    const got = packPortfolio(MEMBERS, { maxMembers: 2 }).pick(inputs()[0]!);
    expect(got.trace.members.map((m) => m.status)).toEqual(["ran", "ran", "cut", "cut"]);
    expect([got.trace.cut, got.trace.deterministic]).toEqual([2, true]);
  });

  it("does not change the output of a member", () => {
    const input = inputs()[1]!;
    const before = packWith("skyline", input);
    packPortfolio(["skyline", "shelf"], { seed: 0 }).pick(input);
    expect(bare(packWith("skyline", input))).toEqual(bare(before));
  });

  it("throws a RangeError for an unknown strategy, an empty list and two members with the same id", () => {
    expect(() => packPortfolio(["nope"])).toThrow(RangeError);
    expect(() => packPortfolio([])).toThrow(RangeError);
    expect(() => packPortfolio(["shelf", "shelf"])).toThrow(RangeError);
  });

  it("gives the levels in the order of the pick, with the specs of the measures", () => {
    expect(PORTFOLIO_LEVELS.map((l) => [l.id, l.spec.direction, l.spec.minEffect])).toEqual([
      ["hard", "lower", 0],
      ["pack.overflow.excessArea", "lower", 0.005],
      ["pack.fill", "higher", 0.005],
    ]);
  });
});
