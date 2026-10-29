import { describe, expect, it } from "vitest";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { measure } from "./measures.ts";
import { packWith } from "./registry.ts";
import { RELAX_STAGE } from "./relax.ts";
import { mulberry32 } from "./strategy.ts";

/** This function gives an input of `n` random boxes in a fixed container with slack. */
function scattered(seed: number, n: number, fixed: PackInput["container"]["fixed"] = "size", extra: Partial<PackInput> = {}): PackInput {
  const random = mulberry32(seed);
  const items = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: 4 + Math.floor(random() * 16), h: 4 + Math.floor(random() * 16) }));
  return { container: { w: 120, h: 120, fixed }, items, gap: 2, ...extra };
}

/** This function gives the sum of the hard breaks of an output. */
const hard = (input: PackInput, output: PackOutput): number => Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);

/** This function gives the measures of the relax stage of an output. */
const stage = (output: PackOutput): Readonly<Record<string, number>> | undefined => output.trace?.find((t) => t.id === RELAX_STAGE)?.measures;

describe("relax", () => {
  it("spreads a corner pack over a fixed container, with the same placed set and a hull that fills the container", () => {
    const input = scattered(1, 30);
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("relax", input);
    expect(hard(input, out)).toBe(0);
    expect(out.placements.map((p) => p.id).toSorted()).toEqual(base.placements.map((p) => p.id).toSorted());
    expect(out.overflow).toEqual(base.overflow);
    expect(out.size).toEqual(base.size);
    const before = measure(input, base);
    const after = measure(input, out);
    // The fill reads the hull of the boxes. The spread hull is the container, so the fill falls.
    expect(after["pack.fill"]).toBeLessThan(before["pack.fill"]);
    expect(after["pack.balance.sideRange"]).toBeLessThan(before["pack.balance.sideRange"] - 0.2);
    expect(stage(out)?.["relax.fallback"]).toBe(0);
    expect(stage(out)?.["relax.moved"]).toBeGreaterThan(0);
  });

  it("gives no hard break and keeps the placed set on 40 random inputs and 3 members", () => {
    for (let seed = 0; seed < 40; seed++) {
      const input = scattered(100 + seed, 10 + (seed % 5) * 10);
      for (const member of ["rows", "skyline", "maxrects"]) {
        const base = packWith(member, input);
        const out = packWith("relax", input, { member });
        expect(hard(input, out), `${member} ${seed}`).toBe(0);
        expect(out.placements.length).toBe(base.placements.length);
        expect(out.overflow).toEqual(base.overflow);
        // The guard does not fall back, so the test reads the relaxed layout.
        expect(stage(out)?.["relax.fallback"], `${member} ${seed}`).toBe(0);
      }
    }
  });

  it("gives the member output with the strength 0", () => {
    const input = scattered(2, 20);
    const base = packWith("maxrects", input, { rule: "bl" });
    expect(packWith("relax", input, { strength: 0 }).placements).toEqual(base.placements);
  });

  it("does not move the boxes on a free side", () => {
    const input = scattered(3, 25, "width");
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("relax", input);
    expect(hard(input, out)).toBe(0);
    expect(out.size).toEqual(base.size);
    const ys = new Map(base.placements.map((p) => [p.id, p.y]));
    for (const p of out.placements) expect(p.y).toBeCloseTo(ys.get(p.id)!, 9);
  });

  it("keeps the obstacles fixed and places no box on them", () => {
    const obstacles = [{ id: "o1", region: { kind: "rect" as const, x: 50, y: 50, w: 20, h: 20 } }];
    const input = scattered(4, 30, "size", { obstacles });
    const out = packWith("relax", input);
    expect(hard(input, out)).toBe(0);
    expect(stage(out)?.["relax.fallback"]).toBe(0);
  });

  it("is deterministic and does not read the seed", () => {
    const input = scattered(5, 40);
    expect(packWith("relax", input, undefined, 1).placements).toEqual(packWith("relax", input, undefined, 2).placements);
  });

  it("throws a RangeError for a strength out of 0 to 1", () => {
    expect(() => packWith("relax", scattered(6, 5), { strength: 1.5 })).toThrow(RangeError);
  });
});
