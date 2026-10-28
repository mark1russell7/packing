import { describe, expect, it } from "vitest";
import { abbaOrder, classOf, pairedSummary, pairInput, SLOW_SET, type PairedRecord } from "./paired.ts";
import type { PackOutput } from "@mark1russell7/packing";

const rec = (input: string, msA: number, msB: number, hashB = "h"): PairedRecord => ({ input, set: "s", msA, msB, ratio: msB / msA, hashA: "h", hashB });

describe("paired", () => {
  it("gives the timed passes in ABBA order", () => {
    expect(abbaOrder(3)).toEqual([0, 1, 1, 0, 0, 1]);
  });

  it("gives the class of an input", () => {
    expect(classOf("c/rect-grid.fixed.rect.none.uniform.fixed.n100/s31")).toBe("rect-grid.fixed n100");
    expect(classOf("c/edge-cases.empty/s31")).toBe("edge-cases.empty n?");
  });

  it("splits the slow set from the other inputs", () => {
    const slow = "c/rect-grid.freeArea.rect.none.uniform.free.n100/s31";
    expect(SLOW_SET.test(slow)).toBe(true);
    const s = pairedSummary([rec(slow, 10, 1), rec("c/rect-grid.fixed.rect.none.uniform.fixed.n10/s31", 1, 2), rec("c/rect-grid.fixed.rect.none.uniform.fixed.n10/s32", 1, 1, "x")]);
    expect(s.slow).toMatchObject({ inputs: 1, medianRatio: 0.1 });
    expect(s.other.inputs).toBe(2);
    expect(s.hashesEqual).toBe(2);
    expect(Object.keys(s.classes)).toEqual(["rect-grid.fixed n10"]);
  });

  it("times each arm with its own passes", () => {
    let t = 0;
    const calls: number[] = [];
    const pack = (arm: number, cost: number) => (): PackOutput => {
      calls.push(arm);
      t += cost;
      return { placements: [] } as unknown as PackOutput;
    };
    const { ms } = pairInput([pack(0, 1), pack(1, 3)], 2, 1, () => t);
    expect(ms).toEqual([1, 3]);
    expect(calls).toEqual([0, 1, 0, 1, 0, 1, 1, 0]);
  });
});
