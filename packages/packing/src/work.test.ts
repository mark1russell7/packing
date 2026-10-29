import { describe, expect, it } from "vitest";
import {
  outputHash,
  packPortfolio,
  packWith,
  packWork,
  PORTFOLIO_STAGE,
  rectGrid,
  RESTARTS_STAGE,
  toPackInput,
  WORK_BUDGET,
  WORK_SPENT,
  WORK_STOPPED,
  type PackOutput,
} from "./index.ts";

// The work budget of k117. Made-up inputs of the generators only.

/** A fixed container: each pack of a single strategy is one pack, so a member costs the item count. */
const fixed = toPackInput(rectGrid.generate(3, { containerSize: "fixed", containerShape: "rect", obstacles: "none", sizes: "heavyTail", count: 30 }));
/** A free container: the size search packs many widths. */
const free = toPackInput(rectGrid.generate(4, { containerSize: "freeAspect", containerShape: "circle", obstacles: "corridors", sizes: "uniform", count: 24 }));

const MEMBERS = ["rows", "skyline", "shelf", { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } }] as const;

/** This function gives the measures of a trace stage of an output. */
const stage = (out: PackOutput, id: string): Record<string, number> => ({ ...out.trace!.find((s) => s.id === id)!.measures });

/** This function gives an output with no times in its trace: each `ms` is 0, and the measure `pack.search.ms` is not there. */
const noTimes = (out: PackOutput): PackOutput => ({
  ...out,
  trace: out.trace!.map((s) => {
    const { "pack.search.ms": _ms, ...rest } = s.measures ?? {};
    return { ...s, ms: 0, measures: rest };
  }),
});

/** This function gives an output with no times and no work measures, to compare it with an output of a run with no work budget. */
const withoutWork = (out: PackOutput): PackOutput => {
  const plain = noTimes(out);
  return {
    ...plain,
    trace: plain.trace!.map((s) => {
      const { [WORK_SPENT]: _s, [WORK_BUDGET]: _b, [WORK_STOPPED]: _t, ...rest } = s.measures ?? {};
      return { ...s, measures: rest };
    }),
  };
};

describe("packWork", () => {
  it("gives the item count for a pack of a fixed container, and the item count times the packs of the size search", () => {
    expect(packWork(fixed, packWith("rows", fixed))).toBe(30);
    const out = packWith("maxrects", free);
    const widths = out.trace!.find((s) => s.id === "log-sweep")!.measures!["pack.search.widths"]!;
    expect(widths).toBeGreaterThan(1);
    expect(packWork(free, out)).toBe(24 * (1 + widths));
  });

  it("gives the measure work.spent of a composite with a work budget, and 1 for an input with no items", () => {
    const out = packWith("restarts", fixed, { iterations: 4, budgetWork: 1000 });
    expect(packWork(fixed, out)).toBe(4 * 30);
    const empty = { ...fixed, items: [] };
    expect(packWork(empty, packWith("rows", empty))).toBe(1);
  });
});

describe("the work budget of restarts", () => {
  it("gives the same output and the same trace measures on each call", () => {
    for (const input of [fixed, free]) {
      for (const budgetWork of [0, 100, 2000, 20000]) {
        const runs = Array.from({ length: 3 }, () => noTimes(packWith("restarts", input, { budgetWork, perturb: "shuffle" }, 5)));
        expect(runs[1], `${budgetWork}`).toEqual(runs[0]);
        expect(runs[2], `${budgetWork}`).toEqual(runs[0]);
      }
    }
  });

  it("stops at the first restart after the work reaches the budget", () => {
    // Each restart costs 30 units. With 70 units, restarts 0, 1 and 2 run: after them the work is 90.
    const cut = stage(packWith("restarts", fixed, { budgetWork: 70 }, 2), RESTARTS_STAGE);
    expect(cut).toMatchObject({ "restarts.runs": 3, [WORK_SPENT]: 90, [WORK_BUDGET]: 70, [WORK_STOPPED]: 1 });
    // The budget 0 runs only restart 0: the output of the member
    const zero = packWith("restarts", fixed, { budgetWork: 0 }, 2);
    expect(stage(zero, RESTARTS_STAGE)).toMatchObject({ "restarts.runs": 1, [WORK_SPENT]: 30, [WORK_STOPPED]: 1 });
    expect(outputHash(zero)).toBe(outputHash(packWith("maxrects", fixed, { rule: "bl" }, 2)));
    // The same partial result as 3 iterations with no budget
    expect(outputHash(packWith("restarts", fixed, { budgetWork: 70 }, 2))).toBe(outputHash(packWith("restarts", fixed, { iterations: 3 }, 2)));
  });

  it("gives the output of the run with no budget when the budget does not run out", () => {
    for (const input of [fixed, free]) {
      const big = packWith("restarts", input, { budgetWork: 10_000_000 }, 4);
      expect(stage(big, RESTARTS_STAGE)).toMatchObject({ "restarts.runs": 16, [WORK_STOPPED]: 0 });
      expect(withoutWork(big)).toEqual(withoutWork(packWith("restarts", input, {}, 4)));
    }
  });

  it("has no work measures without budgetWork", () => {
    expect(Object.keys(stage(packWith("restarts", fixed), RESTARTS_STAGE))).toEqual(["move.restartPick", "restarts.run", "restarts.runs"]);
  });

  it("throws a RangeError for a budgetWork that is not a whole number of 0 or more", () => {
    for (const budgetWork of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => packWith("restarts", fixed, { budgetWork }), `${budgetWork}`).toThrow(/budgetWork/);
  });
});

describe("the work budget of packPortfolio", () => {
  it("cuts the members after the work reaches the budget, with the status cut, and keeps the pick deterministic", () => {
    const pick = (budgetWork: number) => packPortfolio(MEMBERS, { budgetWork }).pick(fixed);
    const got = pick(31);
    expect(got.trace.members.map((m) => m.status)).toEqual(["ran", "ran", "cut", "cut"]);
    expect(got.trace.cut).toBe(2);
    expect(got.trace.deterministic).toBe(true);
    expect(stage(got.output, PORTFOLIO_STAGE)).toMatchObject({ [WORK_SPENT]: 60, [WORK_BUDGET]: 31, [WORK_STOPPED]: 1 });
    // The same partial pick on each call, and the pick of the first 2 members
    expect(noTimes(pick(31).output)).toEqual(noTimes(got.output));
    expect(outputHash(got.output)).toBe(outputHash(packPortfolio(MEMBERS.slice(0, 2)).run(fixed)));
  });

  it("gives the pick of the run with no budget when the budget does not run out", () => {
    for (const input of [fixed, free]) {
      const big = packPortfolio(MEMBERS, { budgetWork: 10_000_000 }).pick(input);
      expect(big.trace.cut).toBe(0);
      expect(stage(big.output, PORTFOLIO_STAGE)[WORK_STOPPED]).toBe(0);
      expect(withoutWork(big.output)).toEqual(withoutWork(packPortfolio(MEMBERS).run(input)));
    }
  });

  it("with a time limit too, cuts at the first limit that runs out", () => {
    // A clock that moves 1 ms on each read
    const clock = (): (() => number) => {
      let t = 0;
      return () => t++;
    };
    const byWork = packPortfolio(MEMBERS, { budgetWork: 31, budgetMs: 1e9, now: clock() }).pick(fixed);
    expect(byWork.trace.deterministic).toBe(true);
    expect(stage(byWork.output, PORTFOLIO_STAGE)[WORK_STOPPED]).toBe(1);
    const byTime = packPortfolio(MEMBERS, { budgetWork: 1e9, budgetMs: 0, now: clock() }).pick(fixed);
    expect(byTime.trace.members.map((m) => m.status)).toEqual(["ran", "cut", "cut", "cut"]);
    expect(byTime.trace.deterministic).toBe(false);
    expect(stage(byTime.output, PORTFOLIO_STAGE)).toMatchObject({ [WORK_SPENT]: 30, [WORK_STOPPED]: 0 });
  });

  it("goes from the strategy portfolio to packPortfolio, and throws a RangeError for a bad budgetWork", () => {
    const out = packWith("portfolio", free, { members: [...MEMBERS], budgetWork: 0 });
    expect(stage(out, PORTFOLIO_STAGE)).toMatchObject({ "move.pick": 0, [WORK_STOPPED]: 1 });
    expect(outputHash(out)).toBe(outputHash(packWith("rows", free)));
    for (const budgetWork of [-1, 0.5, Number.NaN]) {
      expect(() => packPortfolio(MEMBERS, { budgetWork }), `${budgetWork}`).toThrow(/budgetWork/);
      expect(() => packWith("portfolio", fixed, { budgetWork }), `${budgetWork}`).toThrow(/budgetWork/);
    }
  });
});
