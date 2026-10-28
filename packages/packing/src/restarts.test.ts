import { compareMeasure } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  composites,
  hardBreaks,
  MEASURE_SPECS,
  measure,
  outputHash,
  packWith,
  rectGrid,
  RESTART_PERTURBS,
  RESTARTS_STAGE,
  restartsStrategy,
  roundMeasures,
  strategy,
  toPackInput,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The strategy restarts of k78. Made-up inputs of the generators only.

const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** This function makes 20 made-up inputs: fixed and free sizes, some shapes, sizes and obstacles. */
function inputs(): PackInput[] {
  const out: PackInput[] = [];
  const sizes = ["uniform", "heavyTail", "bimodal", "extremeAspect", "identical"] as const;
  const kinds = [
    { containerSize: "fixed", containerShape: "rect", obstacles: "none" },
    { containerSize: "fixed", containerShape: "circle", obstacles: "scattered" },
    { containerSize: "freeHeight", containerShape: "rect", obstacles: "none" },
    { containerSize: "freeAspect", containerShape: "rect", obstacles: "center" },
  ] as const;
  for (const [i, s] of sizes.entries()) for (const [j, k] of kinds.entries()) out.push(toPackInput(rectGrid.generate(10 * i + j + 1, { ...k, sizes: s, count: 30 })));
  return out;
}

/** This function gives the comparable part of an output: the hash, the size and the overflow. */
const bare = (out: PackOutput): unknown => ({ hash: outputHash(out), size: out.size, overflow: [...out.overflow].sort() });

/** This function gives the stage `restarts` of an output. */
const stageOf = (out: PackOutput): Record<string, number> => out.trace!.find((s) => s.id === RESTARTS_STAGE)!.measures!;

describe("the strategy restarts", () => {
  it("is a composite strategy of the registry, with its defaults", () => {
    expect(composites).toContain(restartsStrategy);
    expect(strategy("restarts")).toBe(restartsStrategy);
    expect(restartsStrategy.defaults).toEqual({ iterations: 16, perturb: "swap", strength: 0.1, limitTime: false });
    expect(RESTART_PERTURBS).toEqual(["swap", "shuffle-blocks", "shuffle"]);
  });

  it("with 1 iteration, gives the output of the member: run 0", () => {
    for (const input of inputs().slice(0, 8)) {
      for (const [member, id, options] of [[BL, "maxrects", { rule: "bl" }], ["rows", "rows", undefined]] as const) {
        const got = packWith("restarts", input, { member, iterations: 1 }, 3);
        expect(bare(got)).toEqual(bare(packWith(id, input, options, 3)));
        expect(stageOf(got)).toEqual({ "move.restartPick": 0, "restarts.run": 0, "restarts.runs": 1 });
      }
    }
  });

  it("gives the member order to each run of shuffle-blocks with strength 0 when the keys differ", () => {
    // Each item has its own height, so each block has one item, and each run packs in the order of the member
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, w: 10 + ((i * 7) % 13), h: 5 + i, rank: (i * 3) % 20 }));
    const input: PackInput = { container: { fixed: "size", w: 80, h: 200 }, items };
    for (const id of ["rows", "skyline", "shelf", "maxrects"]) {
      const got = packWith("restarts", input, { member: id, perturb: "shuffle-blocks", strength: 0, iterations: 4 });
      expect(bare(got), id).toEqual(bare(packWith(id, input)));
      expect(stageOf(got)["move.restartPick"], id).toBe(0);
    }
  });

  it("is not worse than its member on the key, on 20 made-up inputs", () => {
    const fill = MEASURE_SPECS["pack.fill"];
    const excess = MEASURE_SPECS["pack.overflow.excessArea"];
    let better = 0;
    for (const [i, input] of inputs().entries()) {
      const member = packWith("maxrects", input, { rule: "bl" }, i);
      const got = packWith("restarts", input, { member: BL }, i);
      expect(hardBreaks(input, got), `${i}`).toBeLessThanOrEqual(hardBreaks(input, member));
      const a = roundMeasures(measure(input, got));
      const b = roundMeasures(measure(input, member));
      expect(compareMeasure(a["pack.overflow.excessArea"], b["pack.overflow.excessArea"], excess), `${i}`).not.toBe("worse");
      // A tie on the overflow lets the fill decide
      if (compareMeasure(a["pack.overflow.excessArea"], b["pack.overflow.excessArea"], excess) === "tie") expect(compareMeasure(a["pack.fill"], b["pack.fill"], fill), `${i}`).not.toBe("worse");
      if (stageOf(got)["move.restartPick"] === 1) better++;
    }
    expect(better).toBeGreaterThan(0);
  });

  it("gives the same output for the same seed, and other outputs for other seeds", () => {
    const input = inputs()[0]!;
    for (const perturb of RESTART_PERTURBS) {
      const once = packWith("restarts", input, { perturb }, 5);
      const again = packWith("restarts", input, { perturb }, 5);
      expect(bare(again), perturb).toEqual(bare(once));
      expect(stageOf(again), perturb).toEqual(stageOf(once));
    }
    // The member also gets the seed, so a change of the output comes from the runs after run 0
    const counts = inputs().map((x) => new Set(Array.from({ length: 4 }, (_, seed) => outputHash(packWith("restarts", x, { perturb: "shuffle" }, seed)))).size);
    expect(Math.max(...counts)).toBeGreaterThan(1);
  });

  it("runs each iteration, and only run 0 with a time limit of 0", () => {
    const input = inputs()[1]!;
    expect(stageOf(packWith("restarts", input, { iterations: 5 }))["restarts.runs"]).toBe(5);
    const cut = packWith("restarts", input, { limitTime: true, budgetMs: 0 });
    expect(stageOf(cut)["restarts.runs"]).toBe(1);
    expect(bare(cut)).toEqual(bare(packWith("maxrects", input, { rule: "bl" })));
    // Without limitTime, the strategy does not read budgetMs
    expect(stageOf(packWith("restarts", input, { iterations: 3, budgetMs: 0 }))["restarts.runs"]).toBe(3);
  });

  it("throws a RangeError for a bad option", () => {
    const input = inputs()[0]!;
    expect(() => packWith("restarts", input, { member: "nope" })).toThrow(RangeError);
    expect(() => packWith("restarts", input, { member: "select" })).toThrow(/sortOrder/);
    expect(() => packWith("restarts", input, { iterations: 0 })).toThrow(/iterations/);
    expect(() => packWith("restarts", input, { iterations: 2.5 })).toThrow(/iterations/);
    expect(() => packWith("restarts", input, { perturb: "spin" })).toThrow(/perturb/);
    expect(() => packWith("restarts", input, { strength: 1.5 })).toThrow(/strength/);
    expect(() => packWith("restarts", input, { limitTime: true })).toThrow(/budgetMs/);
    expect(() => packWith("restarts", input, { key: ["nope"] })).toThrow(RangeError);
  });
});
