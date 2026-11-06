// The read of roadmap item k30. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import type { PackInput } from "@mark1russell7/packing";
import { onlineBound, onlineRead } from "./online.ts";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

describe("onlineRead", () => {
  it("compares each fit with the greedy shelf and with the bound, and counts the refusals", () => {
    // The greedy shelf packs [6 3] [6 3] [4 3] [4 3] to the height 9. Next fit gives 12, and first fit gives 8.
    const read = onlineRead("made-up", [
      strip(10, [[6, 3], [6, 3], [4, 3], [4, 3]]),
      strip(10, [[11, 1]]),
      { container: { fixed: "size", w: 10, h: 10 }, items: [{ id: "a", w: 1, h: 1 }] },
    ]);
    expect(read).toEqual({
      corpus: "made-up",
      r: 0.5,
      inputs: 3,
      accepted: 1,
      refused: { "item <id> is wider than the strip": 1, "the container is not a strip of a fixed width": 1 },
      fits: {
        next: { over: 0, meanRatio: 12 / 9, maxRatio: 12 / 9, maxOfBound: 12 / 36 },
        first: { over: 0, meanRatio: 8 / 9, maxRatio: 8 / 9, maxOfBound: 8 / 36 },
      },
    });
  });

  it("gives the bound of Baker 1983", () => {
    // The area is 60 and the width 10, so the bound is 4 * 6 + 3 / 0.25 = 36.
    expect(onlineBound(strip(10, [[6, 3], [6, 3], [4, 3], [4, 3]]), 0.5)).toBe(36);
  });

  it("gives the ratio 1 for a read with no accepted input", () => {
    expect(onlineRead("none", []).fits.first.meanRatio).toBe(1);
  });
});
