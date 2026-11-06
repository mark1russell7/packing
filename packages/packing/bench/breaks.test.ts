// The read of roadmap item k29. Each test uses made-up inputs.
import { describe, expect, it } from "vitest";
import type { PackInput } from "@mark1russell7/packing";
import { breaksRead } from "./breaks.ts";

/** This function gives a strip with items of the sizes `[w, h]`. */
const strip = (W: number, sizes: readonly (readonly [number, number])[]): PackInput => ({
  container: { fixed: "width", w: W },
  items: sizes.map(([w, h], i) => ({ id: `i${i}`, w, h })),
});

describe("breaksRead", () => {
  it("counts the lower heights and the refusals, and gives the ratios", () => {
    const read = breaksRead("made-up", [
      strip(10, [[6, 1], [4, 5], [6, 5]]),
      strip(10, [[5, 2], [5, 2]]),
      strip(10, [[11, 1]]),
      { container: { fixed: "size", w: 10, h: 10 }, items: [{ id: "a", w: 1, h: 1 }] },
    ]);
    expect(read).toEqual({
      corpus: "made-up",
      inputs: 4,
      accepted: 2,
      refused: { "item <id> is wider than the strip": 1, "the container is not a strip of a fixed width": 1 },
      higher: 0,
      lower: 1,
      meanRatio: (6 / 10 + 1) / 2,
      minRatio: 0.6,
    });
  });

  it("gives the ratio 1 for a read with no accepted input", () => {
    expect(breaksRead("none", []).meanRatio).toBe(1);
  });
});
