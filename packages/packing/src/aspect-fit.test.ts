import { describe, expect, it } from "vitest";
import {
  ASPECT_FIT_FACTORS,
  ASPECT_FIT_LEVELS,
  ASPECT_FIT_STAGE,
  aspectFit,
  aspectFitStrategy,
  checkHard,
  maxrects,
  measure,
  outputHash,
  packWith,
  rectGrid,
  shelf,
  strategy,
  toPackInput,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The wrapper aspectFit of k62. Made-up inputs of the generators only.

/** This function gives an output without the times of its trace stages and of the search, because the times change on each run. */
function bare(output: PackOutput): unknown {
  return { placements: output.placements, overflow: output.overflow, size: output.size, moved: output.moved, trace: (output.trace ?? []).map(({ ms: _ms, measures, ...stage }) => {
      const { "pack.search.ms": _search, ...rest } = measures ?? {};
      return { ...stage, measures: rest };
    }),
  };
}

/** This function makes an input of `rect-grid` version 1. */
function grid(seed: number, params: Record<string, unknown>): PackInput {
  return toPackInput(rectGrid.generate(seed, params as never));
}

const BL = { rule: "bl" } as const;
const fitBl = aspectFit(maxrects);

describe("aspectFit", () => {
  it("gives the output of the wrapped strategy for a container with the size fixed", () => {
    for (const containerShape of ["rect", "circle", "polygon"] as const) {
      for (const seed of [1, 2]) {
        const input = grid(seed, { containerSize: "fixed", containerShape, sizes: "uniform", count: 40 });
        const want = packWith("maxrects", input, BL);
        expect(bare(packWith("aspect-fit", input, { strategy: "maxrects", options: BL }))).toEqual(bare(want));
        expect(bare(fitBl.pack(input, { ...maxrects.defaults, ...BL }, { seed: 0, rng: () => 0 }))).toEqual(bare(want));
      }
    }
  });

  it("packs identical boxes in a free-aspect circle and polygon with no overlap and no hard break", () => {
    for (const containerShape of ["circle", "polygon"] as const) {
      for (const seed of [1, 2, 3]) {
        for (const id of ["maxrects", "shelf", "portfolio"]) {
          const input = grid(seed, { containerSize: "freeAspect", containerShape, sizes: "identical", count: 30 });
          const out = packWith("aspect-fit", input, { strategy: id, ...(id === "maxrects" ? { options: BL } : {}) });
          const hard = checkHard(input, out, undefined, { exactContainer: true });
          expect(hard["no-overlap"], `${containerShape} ${seed} ${id}`).toBe(0);
          expect(Object.values(hard).reduce((a, b) => a + b, 0), `${containerShape} ${seed} ${id}`).toBe(0);
          expect(out.overflow).toEqual([]);
        }
      }
    }
  });

  it("keeps the aspect error at or below the error of the wrapped strategy, and gives the stage aspect-fit", () => {
    let picked = 0;
    for (const containerSize of ["freeAspect", "freeArea", "freeHeight"] as const) {
      for (const containerShape of ["rect", "ellipse", "holes"] as const) {
        for (const seed of [1, 2]) {
          const input = grid(seed, { containerSize, containerShape, sizes: "heavyTail", count: 40 });
          const own = packWith("maxrects", input, BL);
          const out = packWith("aspect-fit", input, { strategy: "maxrects", options: BL });
          const a = measure(input, own);
          const b = measure(input, out);
          const key = `${containerSize} ${containerShape} ${seed}`;
          expect(b["pack.overflow.excessArea"], key).toBeLessThanOrEqual(a["pack.overflow.excessArea"]);
          if (b["pack.overflow.excessArea"] === a["pack.overflow.excessArea"]) expect(b["pack.aspectError"], key).toBeLessThanOrEqual(a["pack.aspectError"] + 0.01);
          const stage = out.trace!.at(-1)!;
          expect(stage.id).toBe(ASPECT_FIT_STAGE);
          picked += stage.measures!["move.aspectPick"]!;
          // A fixed width keeps its size, and a free width goes to the far edge of the content
          if (containerSize === "freeHeight") expect(out.size.w, key).toBe(own.size.w);
          else expect(Number.isFinite(out.size.w) && out.size.w > 0, key).toBe(true);
        }
      }
    }
    // The inputs exercise the pick: the output of the wrapped strategy does not win each one
    expect(picked).toBeGreaterThan(0);
  });

  it("reads the target from targetAspect, then the aspect of the container, then 1", () => {
    const input = grid(3, { containerSize: "freeAspect", containerShape: "rect", sizes: "uniform", count: 60 });
    const errorAt = (out: PackOutput, aspect: number): number => measure({ ...input, container: { ...input.container, aspect } }, out)["pack.aspectError"];
    const own = shelf.pack(input, shelf.defaults, { seed: 0, rng: () => 0 });
    for (const target of [0.5, 2]) {
      const out = aspectFit(shelf, { targetAspect: target }).pack(input, shelf.defaults, { seed: 0, rng: () => 0 });
      expect(errorAt(out, target)).toBeLessThanOrEqual(errorAt(own, target) + 0.01);
    }
    expect(bare(aspectFit(shelf).pack(input, shelf.defaults, { seed: 0, rng: () => 0 }))).toEqual(bare(aspectFit(shelf, { targetAspect: input.container.aspect! }).pack(input, shelf.defaults, { seed: 0, rng: () => 0 })));
    const square = { ...input, container: { fixed: "none" as const } };
    expect(bare(aspectFit(shelf).pack(square, shelf.defaults, { seed: 0, rng: () => 0 }))).toEqual(bare(aspectFit(shelf, { targetAspect: 1 }).pack(square, shelf.defaults, { seed: 0, rng: () => 0 })));
  });

  it("packs a free width through the turn of the axes", () => {
    const input = grid(2, { containerSize: "freeWidth", containerShape: "rect", sizes: "uniform", count: 40 });
    const own = packWith("maxrects", input, BL);
    const out = packWith("aspect-fit", input, { strategy: "maxrects", options: BL });
    expect(out.size.h).toBe(own.size.h);
    expect(Object.values(checkHard(input, out)).reduce((a, b) => a + b, 0)).toBe(0);
    expect(measure(input, out)["pack.aspectError"]).toBeLessThanOrEqual(measure(input, own)["pack.aspectError"] + 0.01);
  });

  it("is deterministic and keeps the id, the supports and the defaults of the wrapped strategy", () => {
    const input = grid(4, { containerSize: "freeAspect", containerShape: "convex", sizes: "bimodal", count: 50 });
    const run = (): string => outputHash(packWith("aspect-fit", input, { strategy: "portfolio", options: { k: 2 } }, 3));
    expect(run()).toEqual(run());
    expect([fitBl.id, fitBl.supports, fitBl.defaults, fitBl.deterministic]).toEqual(["aspect-fit(maxrects)", maxrects.supports, maxrects.defaults, true]);
    expect(strategy("aspect-fit")).toBe(aspectFitStrategy);
    expect(ASPECT_FIT_LEVELS.map((l) => [l.id, l.spec.direction, l.spec.minEffect])).toEqual([
      ["hard", "lower", 0],
      ["pack.overflow.excessArea", "lower", 0.005],
      ["pack.aspectError", "lower", 0.01],
      ["pack.area", "lower", { rel: 0.01 }],
    ]);
    expect(ASPECT_FIT_FACTORS).toEqual([0.86, 0.9, 0.95, 1, 1.05, 1.1, 1.16]);
  });

  it("throws a RangeError for a target that is not above 0, and aspect-fit without a strategy", () => {
    expect(() => aspectFit(shelf, { targetAspect: 0 })).toThrow(RangeError);
    expect(() => aspectFit(shelf, { targetAspect: Number.NaN })).toThrow(RangeError);
    expect(() => packWith("aspect-fit", grid(1, { count: 5 }))).toThrow(RangeError);
  });
});
