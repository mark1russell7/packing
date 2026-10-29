import { selectBest } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  ANNEAL_STAGE,
  annealStrategy,
  checkHard,
  composites,
  GENETIC_STAGE,
  geneticStrategy,
  outputHash,
  packWith,
  rectGrid,
  strategy,
  TABU_STAGE,
  tabuStrategy,
  toPackInput,
  UnsupportedCell,
  WORK_BUDGET,
  WORK_SPENT,
  WORK_STOPPED,
  type PackInput,
  type PackOutput,
} from "./index.ts";
import { PORTFOLIO_LEVELS } from "./portfolio.ts";
import { measureKey } from "./select-key.ts";

// The searches over orders of k26: anneal, genetic and tabu. Made-up inputs of the generators only. Each run is small, so the tests are fast.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };
const SEARCHES = [
  { id: "anneal", stage: ANNEAL_STAGE, move: "move.anneal" },
  { id: "genetic", stage: GENETIC_STAGE, move: "move.genetic" },
  { id: "tabu", stage: TABU_STAGE, move: "move.tabu" },
] as const;

/** This function gives the trace stage of a search of an output. */
const stageOf = (out: PackOutput, stage: string): Record<string, number> => out.trace!.find((s) => s.id === stage)!.measures!;

/** This function gives the comparable part of an output: the hash, the size and the overflow. */
const bare = (out: PackOutput): unknown => ({ hash: outputHash(out), size: out.size, overflow: [...out.overflow].sort() });

/** This function checks one packing: no hard break on the bounding box and on the true outline, and the same output for the same seed. */
function check(id: string, input: PackInput, options: Record<string, unknown>, label: string, seed = 3): PackOutput {
  const output = packWith(id, input, options, seed);
  expect(checkHard(input, output), label).toEqual(CLEAN);
  expect(checkHard(input, output, undefined, { exactContainer: true }), label).toEqual(CLEAN);
  expect(bare(packWith(id, input, options, seed)), label).toEqual(bare(output));
  return output;
}

describe("the searches over orders", () => {
  it("are composite strategies of the registry, with their defaults", () => {
    for (const s of [annealStrategy, geneticStrategy, tabuStrategy]) {
      expect(composites).toContain(s);
      expect(strategy(s.id)).toBe(s);
      expect(s.family).toBe("order-search");
      expect(s.supports.order).toEqual(["free", "soft"]);
    }
    expect(annealStrategy.defaults).toEqual({ iterations: 64, temperature: 0.01, cooling: 0.01 });
    expect(geneticStrategy.defaults).toEqual({ iterations: 64, population: 8, mutation: 0.5 });
    expect(tabuStrategy.defaults).toEqual({ iterations: 64, tenure: 7, neighbors: 8 });
    expect([annealStrategy.catalog, geneticStrategy.catalog, tabuStrategy.catalog]).toEqual([["search-sa-order"], ["search-ga-order"], ["search-tabu"]]);
  });

  it("with 1 iteration, give the output of the member", () => {
    for (const containerSize of ["fixed", "freeHeight"] as const) {
      const input = toPackInput(rectGrid.generate(4, { containerSize, sizes: "heavyTail", count: 20 }));
      for (const [member, id, options] of [[BL, "maxrects", { rule: "bl" }], ["skyline", "skyline", undefined]] as const) {
        for (const s of SEARCHES) {
          const got = packWith(s.id, input, { member, iterations: 1 }, 3);
          expect(bare(got), `${s.id} ${containerSize}`).toEqual(bare(packWith(id, input, options, 3)));
          expect(stageOf(got, s.stage)).toMatchObject({ [s.move]: 0, [`${s.stage}.packs`]: 1, [`${s.stage}.bestAt`]: 0 });
        }
      }
    }
  });

  it("are not worse than their member by the pick key of restarts, and often better", () => {
    const key = measureKey(PORTFOLIO_LEVELS.slice(1));
    const valuesOf = (input: PackInput, output: PackOutput): Record<string, number> =>
      Object.fromEntries([["hard", key.hard(input, output)], ...key.levels.map((l) => [l.id, l.value(input, output)] as const)]);
    const better: Record<string, number> = { anneal: 0, genetic: 0, tabu: 0 };
    for (let seed = 1; seed <= 3; seed++) {
      for (const containerSize of ["fixed", "freeHeight", "freeArea"] as const) {
        const input = toPackInput(rectGrid.generate(seed, { containerSize, sizes: seed % 2 === 0 ? "uniform" : "bimodal", count: 24 }));
        const member = packWith("maxrects", input, { rule: "bl" }, seed);
        for (const s of SEARCHES) {
          const label = `${s.id} ${containerSize} ${seed}`;
          const got = check(s.id, input, { iterations: 16 }, label, seed);
          const m = stageOf(got, s.stage);
          const pick = selectBest([{ id: "member", values: valuesOf(input, member) }, { id: "got", values: valuesOf(input, got) }], PORTFOLIO_LEVELS);
          expect(pick.kept.at(-1), label).toContain("got");
          expect(m[`${s.stage}.packs`], label).toBeLessThanOrEqual(16);
          if (m[s.move]! > 0) {
            better[s.id]!++;
            expect(m[`${s.stage}.bestAt`], label).toBeGreaterThan(0);
          } else expect(bare(got), label).toEqual(bare(member));
        }
      }
    }
    for (const s of SEARCHES) expect(better[s.id], s.id).toBeGreaterThan(2);
  }, 30_000);

  it("give the same output for the same seed, and other outputs for other seeds", () => {
    const input = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", sizes: "uniform", count: 24 }));
    for (const s of SEARCHES) {
      const once = packWith(s.id, input, { iterations: 16 }, 5);
      const again = packWith(s.id, input, { iterations: 16 }, 5);
      expect(bare(again), s.id).toEqual(bare(once));
      expect(stageOf(again, s.stage), s.id).toEqual(stageOf(once, s.stage));
      const hashes = new Set(Array.from({ length: 4 }, (_, seed) => outputHash(packWith(s.id, input, { iterations: 16 }, seed))));
      expect(hashes.size, s.id).toBeGreaterThan(1);
    }
  });

  it("give the work measures with budgetWork, and stop at the work limit", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", sizes: "uniform", count: 20 }));
    for (const s of SEARCHES) {
      const free = stageOf(packWith(s.id, input, { iterations: 16 }, 1), s.stage);
      expect(free[WORK_SPENT], s.id).toBeUndefined();
      const none = stageOf(packWith(s.id, input, { iterations: 16, budgetWork: 0 }, 1), s.stage);
      expect(none[`${s.stage}.packs`], s.id).toBe(1);
      expect(none[WORK_BUDGET], s.id).toBe(0);
      expect(none[WORK_STOPPED], s.id).toBe(1);
      const wide = stageOf(packWith(s.id, input, { iterations: 16, budgetWork: 10 ** 9 }, 1), s.stage);
      expect(wide[WORK_STOPPED], s.id).toBe(0);
      expect(wide[WORK_SPENT], s.id).toBeGreaterThan(0);
      const some = stageOf(packWith(s.id, input, { iterations: 16, budgetWork: Math.floor(wide[WORK_SPENT]! / 3) }, 1), s.stage);
      expect(some[`${s.stage}.packs`], s.id).toBeLessThan(wide[`${s.stage}.packs`]!);
    }
  });

  it("keep the locked items and the obstacles", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", obstacles: "scattered", sizes: "uniform", count: 16 }));
    const items = [...input.items, { id: "lock-a", w: 30, h: 12, x: 5, y: 40, locked: true }, { id: "lock-b", w: 10, h: 10, x: 60, y: 5, locked: true }];
    for (const s of SEARCHES) {
      const output = check(s.id, { ...input, items }, { iterations: 12 }, s.id);
      expect(output.placements.find((p) => p.id === "lock-a")).toEqual({ id: "lock-a", x: 5, y: 40 });
      expect(output.placements.find((p) => p.id === "lock-b")).toEqual({ id: "lock-b", x: 60, y: 5 });
    }
  });

  it("turn only turnable items, when the member turns items", () => {
    const input = toPackInput(rectGrid.generate(5, { containerSize: "fixed", sizes: "bimodal", count: 20 }));
    const items = input.items.map((item, i) => (i % 2 === 0 ? { ...item, turnable: true } : item));
    const turnable = new Set(items.filter((i) => i.turnable === true).map((i) => i.id));
    const member = { id: "maxrects-rot", strategy: "maxrects", options: { rotate: true } };
    let turned = 0;
    for (const s of SEARCHES) {
      for (let seed = 1; seed <= 3; seed++) {
        const output = check(s.id, { ...input, items }, { member, iterations: 16 }, `${s.id} ${seed}`, seed);
        for (const p of output.placements.filter((q) => q.turn === 90)) {
          expect(turnable.has(p.id), `${s.id} ${p.id}`).toBe(true);
          turned++;
        }
      }
      // Without rotate, the member turns no item, and the search turns none.
      const plain = check(s.id, { ...input, items }, { iterations: 16 }, `${s.id} plain`);
      expect(plain.placements.filter((p) => p.turn === 90), s.id).toEqual([]);
    }
    expect(turned).toBeGreaterThan(0);
  });

  it("pack random sets with margins, a gap, ranks and turns with no hard break, with each member", () => {
    let seed = 11;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const members = [
      { id: "rows", strategy: "rows" },
      { id: "skyline-rotate", strategy: "skyline", options: { rotate: true } },
      { id: "shelf", strategy: "shelf" },
      { id: "maxrects-rotate", strategy: "maxrects", options: { rotate: true } },
      { id: "guillotine-rotate", strategy: "guillotine", options: { rotate: true } },
      { id: "push", strategy: "push" },
      BL,
    ];
    for (let n = 0; n < 21; n++) {
      const member = members[n % members.length]!;
      const turns = ["skyline", "maxrects", "guillotine"].includes(member.strategy);
      const items = Array.from({ length: 1 + Math.floor(rand() * 14) }, (_, i) => ({
        id: `r${i}`,
        w: 1 + Math.floor(rand() * 40),
        h: 1 + Math.floor(rand() * 40),
        ...(turns && rand() < 0.4 ? { turnable: true } : {}),
        ...(rand() < 0.3 ? { margin: Math.floor(rand() * 3) } : {}),
        ...(rand() < 0.3 ? { rank: Math.floor(rand() * 5) } : {}),
      }));
      const kinds = [{ w: 80, h: 80, fixed: "size" }, { w: 80, fixed: "width" }, { h: 80, fixed: "height" }, { fixed: "none" }] as const;
      const container = kinds[n % 4]!;
      if (member.strategy === "push" && container.fixed === "none") continue;
      const input: PackInput = { container, gap: n % 3, items };
      const s = SEARCHES[n % 3]!;
      const output = check(s.id, input, { member, iterations: 8 }, `random ${n} ${s.id} ${member.id}`);
      if (container.fixed !== "size") expect(output.overflow, `random ${n}`).toEqual([]);
    }
  });

  it("refuse movable obstacles and groups with UnsupportedCell", () => {
    const base: PackInput = { container: { w: 50, h: 50, fixed: "size" }, items: [{ id: "a", w: 5, h: 5 }] };
    for (const s of SEARCHES) {
      expect(() => packWith(s.id, { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }] })).toThrow(UnsupportedCell);
      expect(() => packWith(s.id, { ...base, items: [{ id: "a", w: 5, h: 5, group: "g" }] })).toThrow(UnsupportedCell);
    }
  });

  it("throw a RangeError for a bad option", () => {
    const input: PackInput = { container: { w: 50, fixed: "width" }, items: [{ id: "a", w: 5, h: 5 }] };
    for (const s of SEARCHES) {
      expect(() => packWith(s.id, input, { member: "nope" })).toThrow(RangeError);
      expect(() => packWith(s.id, input, { member: "select" })).toThrow(/sortOrder/);
      expect(() => packWith(s.id, input, { iterations: 0 })).toThrow(/iterations/);
      expect(() => packWith(s.id, input, { iterations: 2.5 })).toThrow(/iterations/);
      expect(() => packWith(s.id, input, { budgetWork: -1 })).toThrow(/budgetWork/);
    }
    expect(() => packWith("anneal", input, { temperature: 0 })).toThrow(/temperature/);
    expect(() => packWith("anneal", input, { cooling: 1.5 })).toThrow(/cooling/);
    expect(() => packWith("genetic", input, { population: 1 })).toThrow(/population/);
    expect(() => packWith("genetic", input, { mutation: -0.1 })).toThrow(/mutation/);
    expect(() => packWith("tabu", input, { tenure: -1 })).toThrow(/tenure/);
    expect(() => packWith("tabu", input, { neighbors: 0 })).toThrow(/neighbors/);
  });
});
