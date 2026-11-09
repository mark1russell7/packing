import { configId, selectBest } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  checkHard,
  composites,
  configOfStrategy,
  outputHash,
  packConfig,
  packOperators,
  packSpace,
  packWith,
  rectGrid,
  strategy,
  toPackInput,
  WALK_ACCEPTS,
  WALK_MOVES,
  WALK_STAGE,
  walkStrategy,
  WORK_STOPPED,
  type PackInput,
  type PackOutput,
  type StrategyConfig,
} from "./index.ts";
import { PORTFOLIO_LEVELS } from "./portfolio.ts";
import { measureKey } from "./select-key.ts";

// The walks of k212: one walk over the orders, with a move and an acceptance rule. Made-up inputs of the generators only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** This function gives the trace stage `walk` of an output. */
const stageOf = (out: PackOutput): Record<string, number> => out.trace!.find((s) => s.id === WALK_STAGE)!.measures!;

/** This function gives the comparable part of an output: the hash, the size and the overflow. */
const bare = (out: PackOutput): unknown => ({ hash: outputHash(out), size: out.size, overflow: [...out.overflow].sort() });

const key = measureKey(PORTFOLIO_LEVELS.slice(1));

/** This function gives the values of the pick key of `restarts` of an output. */
const valuesOf = (input: PackInput, output: PackOutput): Record<string, number> =>
  Object.fromEntries([["hard", key.hard(input, output)], ...key.levels.map((l) => [l.id, l.value(input, output)] as const)]);

/** The made-up inputs of the tests: 3 container sizes by 2 size families. */
const INPUTS: readonly { label: string; input: PackInput; seed: number }[] = [1, 2].flatMap((seed) =>
  (["fixed", "freeHeight", "freeArea"] as const).map((containerSize) => ({
    label: `${containerSize} ${seed}`,
    seed,
    input: toPackInput(rectGrid.generate(seed, { containerSize, sizes: seed === 1 ? "bimodal" : "uniform", count: 20 })),
  })),
);

describe("the strategy walk", () => {
  it("is a composite strategy of the registry, with its defaults and catalog rows", () => {
    expect(composites).toContain(walkStrategy);
    expect(strategy("walk")).toBe(walkStrategy);
    expect(walkStrategy.family).toBe("order-search");
    expect(walkStrategy.supports.order).toEqual(["free", "soft"]);
    expect(walkStrategy.defaults).toEqual({ iterations: 64, accept: "climb", move: "mixed", band: 0.01, history: 8 });
    expect(walkStrategy.catalog).toEqual(["search-naive-evolution", "search-threshold-order", "search-record-order", "search-late-order"]);
    expect([...WALK_ACCEPTS]).toEqual(["climb", "threshold", "record", "late"]);
    expect([...WALK_MOVES]).toEqual(["swap", "insert", "reverse", "mixed"]);
  });

  it("with 1 iteration, gives the output of the member", () => {
    const { input } = INPUTS[1]!;
    for (const accept of WALK_ACCEPTS) {
      const got = packWith("walk", input, { member: BL, iterations: 1, accept }, 3);
      expect(bare(got), accept).toEqual(bare(packWith("maxrects", input, { rule: "bl" }, 3)));
      expect(stageOf(got), accept).toMatchObject({ "move.walk": 0, "walk.packs": 1, "walk.bestAt": 0, "walk.accepted": 0, "walk.uphill": 0 });
    }
  });

  it("keeps the hard rules, is not worse than its member by the key, and gives the same output for the same seed", () => {
    const better: Record<string, number> = Object.fromEntries(WALK_ACCEPTS.map((a) => [a, 0]));
    for (const { label, input, seed } of INPUTS) {
      const member = packWith("maxrects", input, { rule: "bl" }, seed);
      for (const accept of WALK_ACCEPTS) {
        for (const move of WALK_MOVES) {
          const options = { iterations: 12, accept, move, band: 0.05, history: 3 };
          const at = `${accept} ${move} ${label}`;
          const got = packWith("walk", input, options, seed);
          expect(checkHard(input, got), at).toEqual(CLEAN);
          expect(checkHard(input, got, undefined, { exactContainer: true }), at).toEqual(CLEAN);
          expect(bare(packWith("walk", input, options, seed)), at).toEqual(bare(got));
          const pick = selectBest([{ id: "member", values: valuesOf(input, member) }, { id: "got", values: valuesOf(input, got) }], PORTFOLIO_LEVELS);
          expect(pick.kept.at(-1), at).toContain("got");
          const m = stageOf(got);
          expect(m["walk.packs"], at).toBeLessThanOrEqual(12);
          expect(m["walk.uphill"], at).toBeLessThanOrEqual(m["walk.accepted"]!);
          if (accept === "climb") expect(m["walk.uphill"], at).toBe(0);
          if (m["move.walk"]! > 0) {
            better[accept]!++;
            expect(m["walk.bestAt"], at).toBeGreaterThan(0);
          } else expect(bare(got), at).toEqual(bare(member));
        }
      }
    }
    for (const accept of WALK_ACCEPTS) expect(better[accept], accept).toBeGreaterThan(2);
  }, 60_000);

  it("gives the walk of climb with late and a history of 1", () => {
    // The history of 1 holds the current order of the step before, so late takes the same moves as climb.
    for (const { label, input, seed } of INPUTS) {
      for (const move of WALK_MOVES) {
        const climb = packWith("walk", input, { iterations: 12, accept: "climb", move }, seed);
        const late = packWith("walk", input, { iterations: 12, accept: "late", move, history: 1 }, seed);
        expect(bare(late), `${move} ${label}`).toEqual(bare(climb));
        expect(stageOf(late), `${move} ${label}`).toEqual(stageOf(climb));
      }
    }
  });

  it("takes worse orders only with a band or a history", () => {
    let uphill = 0;
    for (const { input, seed } of INPUTS) {
      for (const accept of ["threshold", "record", "late"] as const) uphill += stageOf(packWith("walk", input, { iterations: 24, accept, band: 0.2, history: 6 }, seed))["walk.uphill"]!;
    }
    expect(uphill).toBeGreaterThan(0);
  });

  it("stops at the work limit", () => {
    const { input } = INPUTS[1]!;
    for (const accept of WALK_ACCEPTS) {
      const none = stageOf(packWith("walk", input, { iterations: 16, accept, budgetWork: 0 }, 1));
      expect(none["walk.packs"], accept).toBe(1);
      expect(none[WORK_STOPPED], accept).toBe(1);
    }
  });

  it("refuses a bad option", () => {
    const { input } = INPUTS[0]!;
    expect(() => packWith("walk", input, { accept: "anneal" })).toThrow(/accept/);
    expect(() => packWith("walk", input, { move: "turn" })).toThrow(/move/);
    expect(() => packWith("walk", input, { band: 0 })).toThrow(/band/);
    expect(() => packWith("walk", input, { history: 0 })).toThrow(/history/);
    expect(() => packWith("walk", input, { iterations: 0 })).toThrow(/iterations/);
  });
});

describe("the walks of packSpace", () => {
  const named = packSpace.named!;
  const walk = (option: string, params: Record<string, string | number | boolean>, member = "maxrects-bl"): StrategyConfig => ({
    space: "packing",
    stages: { combine: { option, params, members: [named[member]!] } },
  });

  it("are 4 options of the stage combine, each one an operator", () => {
    const combine = packSpace.stages.find((s) => s.name === "combine")!;
    for (const accept of WALK_ACCEPTS) {
      const o = combine.options.find((x) => x.id === accept)!;
      expect(o.members, accept).toEqual({ min: 1, max: 1, ordered: true });
      expect(packOperators.operators.filter((x) => x.stage === "combine" && x.id === accept), accept).toHaveLength(1);
    }
    const params = (id: string): string[] => combine.options.find((x) => x.id === id)!.params.map((p) => p.name);
    expect(params("climb")).toEqual(["iterations", "move", "limitWork", "budgetWork"]);
    expect(params("threshold")).toEqual(["iterations", "move", "band", "limitWork", "budgetWork"]);
    expect(params("record")).toEqual(["iterations", "move", "band", "limitWork", "budgetWork"]);
    expect(params("late")).toEqual(["iterations", "move", "history", "limitWork", "budgetWork"]);
    expect(configId(packSpace, named["walk"]!)).toBe(configId(packSpace, walk("climb", {})));
  });

  it("pack with the strategy walk and the option accept of the stage", () => {
    const { input } = INPUTS[2]!;
    const cases: [string, Record<string, string | number | boolean>, Record<string, unknown>][] = [
      ["climb", { iterations: 6, move: "reverse" }, { iterations: 6, move: "reverse" }],
      ["threshold", { iterations: 6, move: "swap", band: 0.1 }, { iterations: 6, move: "swap", band: 0.1 }],
      ["record", { iterations: 6, band: 0.1 }, { iterations: 6, band: 0.1 }],
      ["late", { iterations: 6, move: "insert", history: 4, limitWork: true, budgetWork: 4000 }, { iterations: 6, move: "insert", history: 4, budgetWork: 4000 }],
    ];
    for (const [accept, params, options] of cases) {
      const want = packWith("walk", input, { member: BL, accept, ...options }, 3);
      expect(bare(packConfig(input, walk(accept, params), 3)), accept).toEqual(bare(want));
      const point = configOfStrategy("walk", { member: BL, accept, ...options });
      expect(point.ok, accept).toBe(true);
      if (point.ok) expect(configId(packSpace, point.config), accept).toBe(configId(packSpace, walk(accept, params)));
    }
    expect(() => packConfig(input, walk("late", { band: 0.1 }), 3)).toThrow(/band/);
  });

  it("give one point for options that the rule does not read", () => {
    const climb = configOfStrategy("walk", { accept: "climb", band: 0.3, history: 5 });
    const plain = configOfStrategy("walk", {});
    expect(climb.ok && plain.ok).toBe(true);
    if (climb.ok && plain.ok) expect(configId(packSpace, climb.config)).toBe(configId(packSpace, plain.config));
    expect(configOfStrategy("walk", { accept: "anneal" })).toMatchObject({ ok: false });
    expect(configOfStrategy("walk", { member: "masonry" })).toMatchObject({ ok: false });
  });
});
