import { describe, expect, it } from "vitest";
import {
  checkHard,
  composites,
  generators,
  outputHash,
  packWith,
  rectGrid,
  RUIN_KINDS,
  RUIN_RECREATE_STAGE,
  ruinRecreateStrategy,
  strategy,
  toPackInput,
  UnsupportedCell,
  type GeneratorParams,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The strategy ruin-recreate of k79. Made-up inputs of the generators only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** This function gives the stage `ruin-recreate` of an output. */
const stageOf = (out: PackOutput): Record<string, number> => out.trace!.find((s) => s.id === RUIN_RECREATE_STAGE)!.measures!;

/** This function gives the comparable part of an output: the hash, the size and the overflow. */
const bare = (out: PackOutput): unknown => ({ hash: outputHash(out), size: out.size, overflow: [...out.overflow].sort() });

/** This function checks one packing: no hard break on the bounding box and on the true outline, and the same output for the same seed. */
function check(input: PackInput, options: Record<string, unknown>, label: string, seed = 3): PackOutput {
  const output = packWith("ruin-recreate", input, options, seed);
  expect(checkHard(input, output), label).toEqual(CLEAN);
  expect(checkHard(input, output, undefined, { exactContainer: true }), label).toEqual(CLEAN);
  expect(bare(packWith("ruin-recreate", input, options, seed)), label).toEqual(bare(output));
  return output;
}

/** This function gives the area of the placed items of an output. */
function placedArea(input: PackInput, output: PackOutput): number {
  const at = new Set(output.placements.map((p) => p.id));
  return input.items.filter((i) => at.has(i.id)).reduce((sum, i) => sum + i.w * i.h, 0);
}

describe("the strategy ruin-recreate", () => {
  it("is a composite strategy of the registry, with its defaults", () => {
    expect(composites).toContain(ruinRecreateStrategy);
    expect(strategy("ruin-recreate")).toBe(ruinRecreateStrategy);
    expect(ruinRecreateStrategy.defaults).toEqual({ iterations: 64, ruin: "mixed", strength: 0.3, shrink: 0.005 });
    expect(RUIN_KINDS).toEqual(["mixed", "region", "random", "adjacent"]);
  });

  it("with 0 iterations, gives the output of the member", () => {
    for (const containerSize of ["fixed", "freeHeight", "freeAspect"] as const) {
      const input = toPackInput(rectGrid.generate(4, { containerSize, sizes: "heavyTail", count: 30 }));
      for (const [member, id, options] of [[BL, "maxrects", { rule: "bl" }], ["skyline", "skyline", undefined]] as const) {
        const got = packWith("ruin-recreate", input, { member, iterations: 0 }, 3);
        expect(bare(got)).toEqual(bare(packWith(id, input, options, 3)));
        expect(stageOf(got)).toEqual({ "move.ruinRecreate": 0, "ruin-recreate.iterations": 0, "ruin-recreate.accepted": 0, "ruin-recreate.goalSteps": 0, "ruin-recreate.bestAt": 0 });
      }
    }
  });

  it("is not worse than its member: more placed items in a fixed container, a smaller size in a free one", () => {
    let better = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const containerSize of ["fixed", "freeHeight", "freeWidth", "freeArea"] as const) {
        const input = toPackInput(rectGrid.generate(seed, { containerSize, sizes: seed % 2 === 0 ? "uniform" : "bimodal", count: 30 }));
        const member = packWith("maxrects", input, { rule: "bl" }, seed);
        const got = check(input, {}, `${containerSize} ${seed}`, seed);
        const s = stageOf(got);
        if (containerSize === "fixed") {
          expect(got.placements.length, `${seed}`).toBeGreaterThanOrEqual(member.placements.length);
          if (got.placements.length === member.placements.length) expect(placedArea(input, got)).toBeGreaterThanOrEqual(placedArea(input, member) - 1e-9);
        } else {
          expect(got.overflow).toEqual(member.overflow);
          if (containerSize === "freeHeight") expect(got.size.h).toBeLessThanOrEqual(member.size.h);
          if (containerSize === "freeWidth") expect(got.size.w).toBeLessThanOrEqual(member.size.w);
          if (containerSize === "freeArea") expect(got.size.w * got.size.h).toBeLessThanOrEqual(member.size.w * member.size.h + 1e-9);
        }
        if (s["move.ruinRecreate"]! > 0) {
          better++;
          expect(s["ruin-recreate.bestAt"]).toBeGreaterThan(0);
          expect(outputHash(got)).not.toBe(outputHash(member));
        } else expect(bare(got)).toEqual(bare(member));
        expect(s["ruin-recreate.accepted"]).toBeLessThanOrEqual(s["ruin-recreate.iterations"]!);
        expect(s["ruin-recreate.iterations"]).toBeLessThanOrEqual(64);
      }
    }
    expect(better).toBeGreaterThan(4);
  }, 60_000);

  it("gives the same output for the same seed, and other outputs for other seeds", () => {
    const input = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", sizes: "uniform", count: 30 }));
    for (const ruin of RUIN_KINDS) {
      const once = packWith("ruin-recreate", input, { ruin }, 5);
      const again = packWith("ruin-recreate", input, { ruin }, 5);
      expect(bare(again), ruin).toEqual(bare(once));
      expect(stageOf(again), ruin).toEqual(stageOf(once));
    }
    const hashes = new Set(Array.from({ length: 4 }, (_, seed) => outputHash(packWith("ruin-recreate", input, {}, seed))));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("keeps the locked items and the obstacles, and never removes them", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", obstacles: "scattered", sizes: "uniform", count: 24 }));
    const items = [...input.items, { id: "lock-a", w: 30, h: 12, x: 5, y: 40, locked: true }, { id: "lock-b", w: 10, h: 10, x: 60, y: 5, locked: true }];
    for (const ruin of RUIN_KINDS) {
      const output = check({ ...input, items }, { ruin, iterations: 32 }, ruin);
      expect(output.placements.find((p) => p.id === "lock-a")).toEqual({ id: "lock-a", x: 5, y: 40 });
      expect(output.placements.find((p) => p.id === "lock-b")).toEqual({ id: "lock-b", x: 60, y: 5 });
    }
  });

  it("packs each container shape with a fixed size and a free height, around the locked items and the obstacles", () => {
    for (const containerShape of ["rect", "holes", "circle", "polygon"] as const) {
      for (const containerSize of ["fixed", "freeHeight"] as const) {
        for (const obstacles of ["none", "scattered", "touching"] as const) {
          const input = toPackInput(rectGrid.generate(2, { containerShape, containerSize, obstacles, sizes: "heavyTail", count: 16 }));
          const items = input.items.map((item, i) => (i % 3 === 0 ? { ...item, turnable: true } : item));
          for (const options of [{ iterations: 16 }, { iterations: 16, member: { id: "maxrects-bssf-rot", strategy: "maxrects", options: { rotate: true } } }]) {
            check({ ...input, items }, options, `${containerShape} ${containerSize} ${obstacles} ${JSON.stringify(options)}`);
          }
        }
      }
    }
  }, 60_000);

  it("packs random sets with margins, a gap and turns with no hard break, with each member", () => {
    let seed = 7;
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
    for (let n = 0; n < 28; n++) {
      const member = members[n % members.length]!;
      const turns = ["skyline", "maxrects", "guillotine"].includes(member.strategy);
      const items = Array.from({ length: 2 + Math.floor(rand() * 20) }, (_, i) => ({
        id: `r${i}`,
        w: 1 + Math.floor(rand() * 40),
        h: 1 + Math.floor(rand() * 40),
        ...(turns && rand() < 0.3 ? { turnable: true } : {}),
        ...(rand() < 0.3 ? { margin: Math.floor(rand() * 3) } : {}),
      }));
      const kinds = [{ w: 80, h: 80, fixed: "size" }, { w: 80, fixed: "width" }, { h: 80, fixed: "height" }, { fixed: "none" }] as const;
      const container = kinds[n % 4]!;
      if (member.strategy === "push" && container.fixed === "none") continue;
      const input: PackInput = { container, gap: n % 3, items };
      const output = check(input, { member, iterations: 24, ruin: RUIN_KINDS[n % 4] }, `random ${n} ${member.id}`);
      if (container.fixed !== "size") expect(output.overflow, `random ${n}`).toEqual(packWith(member.strategy, input, member.options).overflow);
    }
  }, 60_000);

  it("packs an input of each generator with no hard break", () => {
    for (const gen of generators) {
      // A small count keeps the test fast. A generator that refuses the count gets its defaults.
      let params: Partial<GeneratorParams> = "count" in gen.defaults ? { count: 12 } : {};
      try {
        gen.withDefaults(params);
      } catch {
        params = {};
      }
      const input = toPackInput(gen.generate(1, params));
      for (const options of [{ iterations: 16 }, { iterations: 16, ruin: "adjacent", strength: 0.5 }]) {
        try {
          check(input, options, `${gen.name} ${JSON.stringify(options)}`);
        } catch (error) {
          // A cell that the member or the strategy does not support is not a failure
          if (!(error instanceof UnsupportedCell)) throw error;
        }
      }
    }
  }, 60_000);

  it("refuses movable obstacles and groups with UnsupportedCell", () => {
    const base: PackInput = { container: { w: 50, h: 50, fixed: "size" }, items: [{ id: "a", w: 5, h: 5 }] };
    expect(() => packWith("ruin-recreate", { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }] })).toThrow(UnsupportedCell);
    expect(() => packWith("ruin-recreate", { ...base, items: [{ id: "a", w: 5, h: 5, group: "g" }] })).toThrow(UnsupportedCell);
  });

  it("throws a RangeError for a bad option", () => {
    const input: PackInput = { container: { w: 50, fixed: "width" }, items: [{ id: "a", w: 5, h: 5 }] };
    expect(() => packWith("ruin-recreate", input, { member: "nope" })).toThrow(RangeError);
    expect(() => packWith("ruin-recreate", input, { member: "select" })).toThrow(/sortOrder/);
    expect(() => packWith("ruin-recreate", input, { iterations: -1 })).toThrow(/iterations/);
    expect(() => packWith("ruin-recreate", input, { iterations: 2.5 })).toThrow(/iterations/);
    expect(() => packWith("ruin-recreate", input, { ruin: "fire" })).toThrow(/ruin/);
    expect(() => packWith("ruin-recreate", input, { strength: 1.5 })).toThrow(/strength/);
    expect(() => packWith("ruin-recreate", input, { shrink: 0 })).toThrow(/shrink/);
  });
});
