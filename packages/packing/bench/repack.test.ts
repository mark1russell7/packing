// The read of roadmap item k31. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import { lineOf, measure, type RepackCase } from "./repack.ts";

describe("bench/repack.ts", () => {
  it("measures a chain with no miss and no break, and one pack for each step", () => {
    const one = measure("maxrects-bl", 1, 40, 0.1, 4, 1.1);
    expect([one.methods.length, one.freshMoved.length, one.repackMoved.length, one.misses, one.breaks]).toEqual([4, 4, 4, 0, 0]);
  });

  it("gives the shares of the packs and the ratio of the moved shares", () => {
    const base = { seed: 1, freshDistance: [0.2, 0.2], repackDistance: [0.1, 0.1], freshOverflows: 1, misses: 0, breaks: 0 };
    const cases: RepackCase[] = [
      { ...base, arm: "a", freshMoved: [0.8, 0.8], repackMoved: [0, 0.4], methods: ["pin", "prefix"] },
      { ...base, arm: "a", seed: 2, freshMoved: [0.8, 0.8], repackMoved: [0.4, 0.8], methods: ["pin", "fresh"] },
      { ...base, arm: "b", freshMoved: [1], repackMoved: [1], methods: ["fresh"] },
    ];
    expect(lineOf("a", cases)).toEqual({
      arm: "a",
      freshMoved: 0.8,
      repackMoved: 0.4,
      movedRatio: 0.5,
      freshDistance: 0.2,
      repackDistance: 0.1,
      methods: { pin: 0.5, prefix: 0.25, fresh: 0.25 },
      freshOverflows: 2,
      misses: 0,
      breaks: 0,
    });
  });
});
