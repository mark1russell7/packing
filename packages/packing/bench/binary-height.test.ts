import { describe, expect, it } from "vitest";
import { areaBound, exactLine, largeLine } from "./binary-height.ts";
import { EXACT_FAMILIES } from "./exact.ts";

const perfect = EXACT_FAMILIES.find((family) => family.name === "perfect-cut.guillotine")!;

describe("the bench of the binary search on the height", () => {
  it("gives the area bound of a strip", () => {
    expect(areaBound({ items: [{ id: "a", w: 4, h: 5 }, { id: "b", w: 2, h: 10 }], container: { fixed: "width", w: 10 } })).toBe(4);
  });

  it("counts the proved cases and finds none under the optimum", () => {
    const line = exactLine(perfect.name, perfect.make, 6, 4, 32, 1_000_000);
    expect(line.proved + line.limited).toBe(4);
    expect(line.under).toBe(0);
    expect(line.hits).toBeLessThanOrEqual(line.proved);
  });

  it("reads each family of the exact bench", () => {
    for (const family of EXACT_FAMILIES) expect(exactLine(family.name, family.make, 6, 1, 8, 200_000).under).toBe(0);
  });

  it("gives wins, losses and the sign test of a line", () => {
    const line = largeLine("f", 20, { method: "other", ratios: [2, 2, 2, 1], ms: [1, 3, 1, 3] }, [1, 1, 1, 2]);
    expect(line).toMatchObject({ cases: 4, wins: 3, losses: 1, meanMs: 2 });
    expect(line.meanRatio).toBe(1.75);
    expect(line.p).toBeCloseTo(0.625);
  });

  it("gives the p 1 to a line with no difference", () => {
    expect(largeLine("f", 20, { method: "same", ratios: [1, 1], ms: [0, 0] }, [1, 1]).p).toBe(1);
  });
});
