import { describe, expect, it } from "vitest";
import {
  checkHard,
  composites,
  generators,
  OVERLAP_MIN_STAGE,
  overlapMinStrategy,
  outputHash,
  packWith,
  rectGrid,
  strategy,
  toPackInput,
  UnsupportedCell,
  type GeneratorParams,
  type PackInput,
  type PackOutput,
} from "./index.ts";

// The strategy overlap-min of k80. Made-up inputs of the generators only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };
const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** This function gives the stage `overlap-min` of an output. */
const stageOf = (out: PackOutput): Record<string, number> => out.trace!.find((s) => s.id === OVERLAP_MIN_STAGE)!.measures!;

/** This function gives the comparable part of an output: the hash, the size and the overflow. */
const bare = (out: PackOutput): unknown => ({ hash: outputHash(out), placements: out.placements, size: out.size, overflow: [...out.overflow].sort() });

/** This function gives the length of the free side of an output. */
const lengthOf = (input: PackInput, out: PackOutput): number => (input.container.fixed === "height" ? out.size.w : out.size.h);

/** The frame boxes of an output: each item with its margin and half the gap, for the exact test of the gap. */
function boxes(input: PackInput, out: PackOutput): { l: number; t: number; r: number; b: number }[] {
  const items = new Map(input.items.map((i) => [i.id, i]));
  const half = (input.gap ?? 0) / 2;
  return out.placements.map((p) => {
    const item = items.get(p.id)!;
    const [w, h] = p.turn === 90 ? [item.h, item.w] : [item.w, item.h];
    const m = typeof item.margin === "number" ? item.margin : 0;
    return { l: p.x - m - half, t: p.y - m - half, r: p.x + w + m + half, b: p.y + h + m + half };
  });
}

/** This function checks one packing: no hard break, the gap kept, and the same output for the same seed. */
function check(input: PackInput, options: Record<string, unknown>, label: string, seed = 3): PackOutput {
  const output = packWith("overlap-min", input, options, seed);
  expect(checkHard(input, output), label).toEqual(CLEAN);
  const list = boxes(input, output);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      expect(ox > 1e-6 && oy > 1e-6, `${label}: ${output.placements[i]!.id} ${output.placements[j]!.id}`).toBe(false);
    }
  }
  expect(bare(packWith("overlap-min", input, options, seed)), label).toEqual(bare(output));
  return output;
}

describe("the strategy overlap-min", () => {
  it("is a composite strategy of the registry, with its defaults", () => {
    expect(composites).toContain(overlapMinStrategy);
    expect(strategy("overlap-min")).toBe(overlapMinStrategy);
    expect(overlapMinStrategy.defaults).toEqual({ iterations: 8192, step: 0.01 });
    expect(overlapMinStrategy.catalog).toEqual(["nest-gls-overlap"]);
  });

  it("with 0 iterations, gives the output of the member", () => {
    for (const containerSize of ["freeHeight", "freeWidth"] as const) {
      const input = toPackInput(rectGrid.generate(4, { containerSize, sizes: "heavyTail", count: 30 }));
      for (const [member, id, options] of [[BL, "maxrects", { rule: "bl" }], ["skyline", "skyline", undefined]] as const) {
        const got = packWith("overlap-min", input, { member, iterations: 0 }, 3);
        expect(bare(got)).toEqual(bare(packWith(id, input, options, 3)));
        expect(stageOf(got)).toEqual({ "move.overlapMin": 0, "overlap-min.iterations": 0, "overlap-min.tries": 0, "overlap-min.cuts": 0, "overlap-min.raises": 0, "overlap-min.length": 1 });
      }
    }
  });

  it("makes the strip shorter than the strip of its member, and keeps the overflow", () => {
    let shorter = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const containerSize of ["freeHeight", "freeWidth"] as const) {
        const input = toPackInput(rectGrid.generate(seed, { containerSize, sizes: seed % 2 === 0 ? "uniform" : "bimodal", count: 24 }));
        const member = packWith("skyline", input, undefined, seed);
        const got = check(input, { member: "skyline", iterations: 1024 }, `${containerSize} ${seed}`, seed);
        const s = stageOf(got);
        expect(got.overflow).toEqual(member.overflow);
        expect(lengthOf(input, got)).toBeLessThanOrEqual(lengthOf(input, member) + 1e-9);
        expect(s["overlap-min.iterations"]).toBeLessThanOrEqual(1024);
        expect(s["overlap-min.cuts"]).toBeLessThanOrEqual(s["overlap-min.tries"]!);
        expect(s["move.overlapMin"]).toBe(s["overlap-min.cuts"]);
        if (s["overlap-min.cuts"]! > 0) {
          shorter++;
          expect(lengthOf(input, got)).toBeLessThan(lengthOf(input, member));
          expect(s["overlap-min.length"]).toBeLessThan(1);
        } else expect(bare(got)).toEqual(bare(member));
      }
    }
    expect(shorter).toBeGreaterThan(6);
  });

  it("gives the same output for the same seed, and other outputs for other seeds", () => {
    const input = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", sizes: "uniform", count: 24 }));
    const once = packWith("overlap-min", input, { iterations: 512 }, 5);
    const again = packWith("overlap-min", input, { iterations: 512 }, 5);
    expect(bare(again)).toEqual(bare(once));
    expect(stageOf(again)).toEqual(stageOf(once));
    const hashes = new Set(Array.from({ length: 4 }, (_, seed) => outputHash(packWith("overlap-min", input, { iterations: 512 }, seed))));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("keeps the locked items and the obstacles, and counts them in the overlap", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", obstacles: "scattered", sizes: "uniform", count: 20 }));
    const items = [...input.items, { id: "lock-a", w: 30, h: 12, x: 5, y: 40, locked: true }, { id: "lock-b", w: 10, h: 10, x: 60, y: 5, locked: true }];
    const output = check({ ...input, items }, { iterations: 512 }, "locks");
    expect(output.placements.find((p) => p.id === "lock-a")).toEqual({ id: "lock-a", x: 5, y: 40 });
    expect(output.placements.find((p) => p.id === "lock-b")).toEqual({ id: "lock-b", x: 60, y: 5 });
  });

  it("packs each container shape with a free height, around the obstacles", () => {
    for (const containerShape of ["rect", "holes", "circle", "polygon"] as const) {
      for (const obstacles of ["none", "scattered", "touching"] as const) {
        const input = toPackInput(rectGrid.generate(2, { containerShape, containerSize: "freeHeight", obstacles, sizes: "heavyTail", count: 14 }));
        const items = input.items.map((item, i) => (i % 3 === 0 ? { ...item, turnable: true } : item));
        for (const options of [{ iterations: 256 }, { iterations: 256, member: { id: "maxrects-bssf-rot", strategy: "maxrects", options: { rotate: true } } }]) {
          check({ ...input, items }, options, `${containerShape} ${obstacles} ${JSON.stringify(options)}`);
        }
      }
    }
  });

  it("packs random sets with margins, a gap, pair gaps and turns with no hard break, with each member", () => {
    let seed = 7;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const members = [
      { id: "rows", strategy: "rows" },
      { id: "skyline-rotate", strategy: "skyline", options: { rotate: true } },
      { id: "shelf", strategy: "shelf" },
      { id: "maxrects-rotate", strategy: "maxrects", options: { rotate: true } },
      { id: "guillotine-rotate", strategy: "guillotine", options: { rotate: true } },
      BL,
    ];
    let shorter = 0;
    for (let n = 0; n < 24; n++) {
      const member = members[n % members.length]!;
      const turns = ["skyline", "maxrects", "guillotine"].includes(member.strategy);
      const items = Array.from({ length: 2 + Math.floor(rand() * 18) }, (_, i) => ({
        id: `r${i}`,
        w: 1 + Math.floor(rand() * 40),
        h: 1 + Math.floor(rand() * 40),
        ...(turns && rand() < 0.3 ? { turnable: true } : {}),
        ...(rand() < 0.3 ? { margin: Math.floor(rand() * 3) } : {}),
      }));
      const container = n % 2 === 0 ? ({ w: 80, fixed: "width" } as const) : ({ h: 80, fixed: "height" } as const);
      const pairGaps = n % 3 === 0 && items.length > 2 ? [{ a: "r0", b: "r1", gap: 6 }] : undefined;
      const input: PackInput = { container, gap: n % 3, items, ...(pairGaps === undefined ? {} : { pairGaps }) };
      const output = check(input, { member, iterations: 256, step: 0.02 }, `random ${n} ${member.id}`);
      const base = packWith(member.strategy, input, member.options);
      expect(output.overflow, `random ${n}`).toEqual(base.overflow);
      if (lengthOf(input, output) < lengthOf(input, base) - 1e-9) shorter++;
      if (pairGaps !== undefined) {
        const [a, b] = boxes(input, output);
        const dx = Math.max(a!.l - b!.r, b!.l - a!.r);
        const dy = Math.max(a!.t - b!.b, b!.t - a!.b);
        expect(Math.max(dx, dy) + (input.gap ?? 0), `pair gap ${n}`).toBeGreaterThanOrEqual(6 - 1e-6);
      }
    }
    expect(shorter).toBeGreaterThan(4);
  });

  it("packs an input of each generator with no hard break, or refuses its cell", () => {
    let packed = 0;
    for (const gen of generators) {
      // A small count keeps the test fast. A generator that refuses the count gets its defaults.
      let params: Partial<GeneratorParams> = "count" in gen.defaults ? { count: 12 } : {};
      try {
        gen.withDefaults(params);
      } catch {
        params = {};
      }
      for (const containerSize of [undefined, "freeHeight"] as const) {
        let input: PackInput;
        try {
          input = toPackInput(gen.generate(1, containerSize === undefined ? params : { ...params, containerSize }));
        } catch {
          continue;
        }
        try {
          check(input, { iterations: 256 }, `${gen.name} ${String(containerSize)}`);
          packed++;
        } catch (error) {
          // A cell that the member or the strategy does not support is not a failure
          if (!(error instanceof UnsupportedCell)) throw error;
        }
      }
    }
    expect(packed).toBeGreaterThan(3);
  });

  it("refuses a fixed size, a free aspect, movable obstacles and groups with UnsupportedCell", () => {
    const item = { id: "a", w: 5, h: 5 };
    expect(() => packWith("overlap-min", { container: { w: 50, h: 50, fixed: "size" }, items: [item] })).toThrow(UnsupportedCell);
    expect(() => packWith("overlap-min", { container: { fixed: "none" }, items: [item] })).toThrow(UnsupportedCell);
    const base: PackInput = { container: { w: 50, fixed: "width" }, items: [item] };
    expect(() => packWith("overlap-min", { ...base, obstacles: [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 }, move: { cost: 0 } }] })).toThrow(UnsupportedCell);
    expect(() => packWith("overlap-min", { ...base, items: [{ ...item, group: "g" }] })).toThrow(UnsupportedCell);
  });

  it("throws a RangeError for a bad option", () => {
    const input: PackInput = { container: { w: 50, fixed: "width" }, items: [{ id: "a", w: 5, h: 5 }] };
    expect(() => packWith("overlap-min", input, { member: "nope" })).toThrow(RangeError);
    expect(() => packWith("overlap-min", input, { iterations: -1 })).toThrow(/iterations/);
    expect(() => packWith("overlap-min", input, { iterations: 2.5 })).toThrow(/iterations/);
    expect(() => packWith("overlap-min", input, { step: 0 })).toThrow(/step/);
    expect(() => packWith("overlap-min", input, { step: 0.6 })).toThrow(/step/);
  });
});
