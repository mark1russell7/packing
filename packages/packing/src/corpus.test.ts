import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  cellOf,
  checkHard,
  corpus,
  fnv1a32,
  packWith,
  rectScattered,
  strategies,
  supportsCell,
  toPackInput,
  UnsupportedCell,
  type LayoutInput,
} from "@mark1russell7/packing";

// The shared generator `rect-scattered` (version 1) of docs/FORMAT.md. The pinned values are those of the document.

const EXPECTED = [
  { seed: 1, w: 970, h: 705, obstacles: 4, first: { x: 690, y: 281, w: 111, h: 100 }, box: [70, 66], hash: "f5f5c51d1560e41c" },
  { seed: 2, w: 733, h: 437, obstacles: 7, first: { x: 292, y: 7, w: 138, h: 121 }, box: [114, 77], hash: "cfd6ef0ef232aaa3" },
  { seed: 3, w: 871, h: 554, obstacles: 8, first: { x: 551, y: 56, w: 59, h: 138 }, box: [78, 39], hash: "d1638f2406360b2e" },
];

/** The hash of a file with the SHA-256 of node:crypto, as a check of the SHA-256 of the package */
const nodeHash = (file: LayoutInput): string => {
  const { hash: _hash, ...rest } = file;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 16);
};

describe("the shared generator rect-scattered v1", () => {
  it("has the check value of fnv1a32", () => {
    expect(fnv1a32("1:container")).toBe(3139901265);
  });

  it.each(EXPECTED)("gives the expected file for seed $seed", (e) => {
    const file = rectScattered.generate(e.seed);
    expect(file.id).toBe(`xcheck-v1/rect-scattered/s${e.seed}`);
    expect(file.generator).toEqual({ name: "rect-scattered", version: 1, params: { count: 40 }, seed: e.seed });
    expect([file.container.w, file.container.h]).toEqual([e.w, e.h]);
    expect(file.obstacles!.length).toBe(e.obstacles);
    expect(file.obstacles![0]!.region).toEqual({ kind: "rect", ...e.first });
    expect([file.boxes[0]!.w, file.boxes[0]!.h]).toEqual(e.box);
    expect(file.hash).toBe(e.hash);
    expect(nodeHash(file)).toBe(e.hash);
  });

  it("keeps the field order of the document", () => {
    expect(Object.keys(rectScattered.generate(1))).toEqual([
      "schema",
      "id",
      "set",
      "family",
      "seed",
      "source",
      "generator",
      "container",
      "obstacles",
      "boxes",
      "edges",
      "hash",
    ]);
  });

  it.each(EXPECTED)("is packed with 0 hard breaks by each strategy that supports its cell (seed $seed)", (e) => {
    const input = toPackInput(rectScattered.generate(e.seed));
    const cell = cellOf(input);
    let packed = 0;
    for (const s of strategies) {
      if (!supportsCell(s.supports, cell)) {
        expect(() => packWith(s.id, input), s.id).toThrow(UnsupportedCell);
        continue;
      }
      const output = packWith(s.id, input, undefined, e.seed);
      expect(checkHard(input, output), s.id).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      expect(output.placements.length, s.id).toBeGreaterThan(0);
      packed++;
    }
    expect(packed).toBe(4);
  });
});

describe("corpus", () => {
  it("builds the manifest layout-corpus/1 of the document", () => {
    const { manifest, inputs } = corpus("xcheck-v1", [{ generator: "rect-scattered", version: 1, seeds: [1, 2, 3] }]);
    expect(manifest.schema).toBe("layout-corpus/1");
    expect(manifest.corpus).toBe("xcheck-v1");
    expect(manifest.specs).toEqual([{ generator: "rect-scattered", version: 1, params: { count: 40 }, seeds: [1, 2, 3] }]);
    expect(manifest.inputs.map((i) => i.hash)).toEqual(EXPECTED.map((e) => e.hash));
    expect(manifest.inputs[0]).toMatchObject({ id: "xcheck-v1/rect-scattered/s1", cell: { containerShape: "rect", obstacles: "scattered" } });
    expect(inputs.map((i) => i.hash)).toEqual(EXPECTED.map((e) => e.hash));
  });

  it("gives each input the name of the corpus as its set", () => {
    const { inputs } = corpus("screen-v1", [
      { generator: "rect-grid", params: { obstacles: "wall" }, seeds: [1] },
      { generator: "gallery", seeds: [1, 2] },
    ]);
    expect(inputs.map((i) => i.id)).toEqual([
      "screen-v1/rect-grid.fixed.rect.wall.uniform.n100/s1",
      "screen-v1/gallery.freeHeight.n100/s1",
      "screen-v1/gallery.freeHeight.n100/s2",
    ]);
    expect(inputs.every((i) => i.set === "screen-v1")).toBe(true);
  });

  it("refuses an unknown generator, a different version and a repeated id", () => {
    expect(() => corpus("c", [{ generator: "nope", seeds: [1] }])).toThrow(RangeError);
    expect(() => corpus("c", [{ generator: "rect-grid", version: 2, seeds: [1] }])).toThrow(RangeError);
    expect(() => corpus("c", [{ generator: "cards", seeds: [1, 1] }])).toThrow(RangeError);
  });
});
