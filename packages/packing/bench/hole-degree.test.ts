import { checkShapes, PACK_HARD_RULES, packHard, toPackInput, type LayoutInput, type PackOutput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { circleOverlaps, measure, outputHash, packConfig, packSpace, packWith } from "@mark1russell7/packing";
import { entry } from "./entries.ts";
import { shapeInput } from "./shape-inputs.ts";

// The strategy hole-degree of k90 against the bbox entries of k91, on the made-up circle family of `shape-inputs.ts`.
// The benchmark corpora have only rect items. Thus this test is the shape benchmark of hole-degree. The test reads no time.

const SEEDS = [1, 2, 3, 4, 5];
const IDS = ["hole-degree", "bbox-maxrects-bl", "bbox-skyline"] as const;

/**
 * The mean `pack.shapeFill` of each strategy over the seeds 1 to 5, with 3 decimals, on a container of free height and on a square.
 * On a square, hole-degree fills the 4 corners first. Thus its hull is the square, and the bbox members keep a lower hull.
 */
const SHAPE_FILLS: readonly string[] = [
  "width hole-degree shapeFill 0.816",
  "width bbox-maxrects-bl shapeFill 0.692",
  "width bbox-skyline shapeFill 0.631",
  "size hole-degree shapeFill 0.673",
  "size bbox-maxrects-bl shapeFill 0.692",
  "size bbox-skyline shapeFill 0.631",
];

/** This function packs a circle input with hole-degree or with a bench entry. */
function packId(id: (typeof IDS)[number], input: LayoutInput, seed: number): PackOutput {
  if (id === "hole-degree") return packWith("hole-degree", toPackInput(input), undefined, seed);
  const e = entry(id);
  return packWith(e.strategy, toPackInput(input), e.options, seed);
}

describe("hole-degree on the circle family of the shape inputs", () => {
  it("places each circle with no overlap of the circles, and with each bounding box in the container", () => {
    for (const seed of SEEDS)
      for (const fixedSize of [false, true]) {
        const input = shapeInput("circle", seed, { fixedSize });
        const out = packId("hole-degree", input, seed);
        const at = `${input.id} ${fixedSize}`;
        expect(circleOverlaps(toPackInput(input), out, 1e-6), at).toBe(0);
        // The contract counts the bounding boxes. Two circles that touch on a diagonal have boxes that overlap, so no-overlap is only safe.
        const hard = packHard(input, out);
        expect([hard["in-container"], hard["locked-kept"], hard.complete], at).toEqual([0, 0, 0]);
        expect(checkShapes(input, PACK_HARD_RULES, { level: "safe" }), at).toEqual([]);
        expect(out.overflow, at).toEqual([]);
      }
  });

  it("gives the output of packWith with its named config of packSpace", () => {
    const input = toPackInput(shapeInput("circle", 6));
    expect(outputHash(packConfig(input, packSpace.named!["hole-degree"]!, 2))).toBe(outputHash(packWith("hole-degree", input, undefined, 2)));
  });

  it("gives a higher pack.shapeFill than bbox-maxrects-bl and bbox-skyline on a container of free height", () => {
    const lines: string[] = [];
    const means: Record<string, number> = {};
    for (const fixedSize of [false, true])
      for (const id of IDS) {
        const got = SEEDS.map((s) => measure(toPackInput(shapeInput("circle", s, { fixedSize })), packId(id, shapeInput("circle", s, { fixedSize }), s))["pack.shapeFill"]);
        const mean = got.reduce((a, b) => a + b, 0) / got.length;
        means[`${fixedSize} ${id}`] = mean;
        lines.push(`${fixedSize ? "size" : "width"} ${id} shapeFill ${mean.toFixed(3)}`);
      }
    expect(lines).toEqual(SHAPE_FILLS);
    expect(means["false hole-degree"]).toBeGreaterThan(means["false bbox-maxrects-bl"]!);
    expect(means["false hole-degree"]).toBeGreaterThan(means["false bbox-skyline"]!);
  });
});
