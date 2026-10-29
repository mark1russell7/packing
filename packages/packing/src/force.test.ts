import { describe, expect, it } from "vitest";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { measure } from "./measures.ts";
import { packWith } from "./registry.ts";
import { mulberry32 } from "./strategy.ts";

/** This function gives an input of `n` random boxes in a fixed container with slack. */
function scattered(seed: number, n: number, extra: Partial<PackInput> = {}): PackInput {
  const random = mulberry32(seed);
  const items = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: 4 + Math.floor(random() * 16), h: 4 + Math.floor(random() * 16) }));
  return { container: { w: 120, h: 120, fixed: "size" }, items, gap: 2, ...extra };
}

/** This function gives the sum of the hard breaks of an output. */
const hard = (input: PackInput, output: PackOutput): number => Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);

/** The id of the trace stage of `force`. The test does not import `force.ts` before the registry, so that the import order stays. */
const FORCE_STAGE = "force";

/** This function gives the measures of the force stage of an output. */
const stage = (output: PackOutput): Readonly<Record<string, number>> | undefined => output.trace?.find((t) => t.id === FORCE_STAGE)?.measures;

describe("force", () => {
  it("spreads a corner pack over a fixed container, with the same placed set and less skew", () => {
    const input = scattered(1, 30);
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("force", input);
    expect(hard(input, out)).toBe(0);
    expect(out.placements.map((p) => p.id).toSorted()).toEqual(base.placements.map((p) => p.id).toSorted());
    expect(out.overflow).toEqual(base.overflow);
    expect(out.size).toEqual(base.size);
    const before = measure(input, base);
    const after = measure(input, out);
    expect(after["pack.balance.sideRange"]).toBeLessThan(before["pack.balance.sideRange"] - 0.2);
    expect(stage(out)?.["force.fallback"]).toBe(0);
    expect(stage(out)?.["force.gap"]).toBeGreaterThan(0);
    expect(stage(out)?.["move.force"]).toBeGreaterThan(0);
  });

  it("gives no hard break and keeps the placed set on 40 random inputs and 3 members", () => {
    let fallbacks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const input = scattered(100 + seed, 10 + (seed % 5) * 10);
      for (const member of ["rows", "skyline", "maxrects"]) {
        const base = packWith(member, input);
        const out = packWith("force", input, { member });
        expect(hard(input, out), `${member} ${seed}`).toBe(0);
        expect(out.placements.length).toBe(base.placements.length);
        expect(out.overflow).toEqual(base.overflow);
        fallbacks += stage(out)?.["force.fallback"] ?? 0;
      }
    }
    // The guard falls back rarely, so the test reads the force layout.
    expect(fallbacks).toBeLessThanOrEqual(6);
  });

  it("gives the member output with 0 iterations", () => {
    const input = scattered(2, 20);
    const base = packWith("maxrects", input, { rule: "bl" });
    expect(packWith("force", input, { iterations: 0 }).placements).toEqual(base.placements);
  });

  it("keeps the obstacles fixed and places no box on them", () => {
    const obstacles = [{ id: "o1", region: { kind: "rect" as const, x: 50, y: 50, w: 20, h: 20 } }];
    const input = scattered(4, 30, { obstacles });
    const out = packWith("force", input);
    expect(hard(input, out)).toBe(0);
    expect(stage(out)?.["force.fallback"]).toBe(0);
  });

  it("is deterministic and does not read the seed", () => {
    const input = scattered(5, 40);
    expect(packWith("force", input, undefined, 1).placements).toEqual(packWith("force", input, undefined, 2).placements);
  });

  it("keeps the output size on a free side, with no hard break", () => {
    const input: PackInput = { ...scattered(3, 25), container: { w: 120, fixed: "width" } };
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("force", input);
    expect(out.size).toEqual(base.size);
    expect(hard(input, out)).toBe(0);
    expect(stage(out)?.["force.fallback"]).toBe(0);
  });

  it("throws a RangeError for a bad count", () => {
    expect(() => packWith("force", scattered(6, 5), { iterations: 1.5 })).toThrow(RangeError);
    expect(() => packWith("force", scattered(6, 5), { rounds: -1 })).toThrow(RangeError);
  });
});
