import { canonicalInput, documentHash, packHard, type LayoutInput, type PairGap } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { canonicalJson, checkHard, hashInput, outputHash, packWith, toPackInput, type Item, type PackInput, type PackOutput } from "./index.ts";
import { sha256Hex } from "./sha256.ts";

// Roadmap item k77: the pair gaps of the contract 0.2.14. Made-up inputs only.

/** The items: 16 rectangles of different sizes. Each third item has a margin of 1. */
const items: Item[] = Array.from({ length: 16 }, (_, i) => ({
  id: `b${String(i).padStart(2, "0")}`,
  w: 8 + ((i * 7) % 13),
  h: 6 + ((i * 5) % 11),
  ...(i % 3 === 0 ? { margin: 1 } : {}),
}));

const id = (i: number): string => items[i]!.id;

/** The pair gaps: each item and the next one, and some items and the item 5 places after them. Some pairs have `a` after `b`. */
const pairGaps: PairGap[] = [
  ...Array.from({ length: 15 }, (_, i): PairGap => (i % 2 === 0 ? { a: id(i), b: id(i + 1), gap: 9 + (i % 4) } : { a: id(i + 1), b: id(i), gap: 12 })),
  { a: id(10), b: id(4), gap: 14, lanes: 3 },
  { a: id(2), b: id(7), gap: 11 },
  { a: id(15), b: id(9), gap: 1 },
];

/** This function gives a list in a fixed shuffled order. */
const shuffled = <T,>(list: readonly T[]): T[] => list.map((x, i) => ({ x, k: (i * 11 + 5) % list.length })).sort((p, q) => p.k - q.k).map((p) => p.x);

/** This function gives the input file of a packer input, for `packHard` of the contract. */
const fileOf = (input: PackInput): LayoutInput => ({
  schema: "layout-input/1",
  id: "k77",
  container: input.container,
  boxes: input.items,
  ...(input.gap === undefined ? {} : { gap: input.gap }),
  ...(input.pairGaps === undefined ? {} : { pairGaps: input.pairGaps }),
});

describe("hashInput and pairGaps", () => {
  const file: LayoutInput = { schema: "layout-input/1", id: "k77-hash", source: "made-up", gap: 2, boxes: items, pairGaps };

  it("gives documentHash of the contract for each order of the pairs, and for pairs with a after b", () => {
    const want = documentHash(file);
    expect(hashInput(file)).toBe(want);
    expect(hashInput({ ...file, pairGaps: shuffled(pairGaps) })).toBe(want);
    expect(hashInput({ ...file, pairGaps: pairGaps.map((p) => ({ ...p, a: p.b, b: p.a })) })).toBe(want);
    expect(hashInput({ ...file, pairGaps: canonicalInput(file).pairGaps! })).toBe(want);
    expect(hashInput({ ...file, pairGaps: shuffled(pairGaps), hash: "0000000000000000" })).toBe(want);
  });

  it("gives another hash for another pair gap", () => {
    expect(hashInput({ ...file, pairGaps: [...pairGaps.slice(1), { ...pairGaps[0]!, gap: 10 }] })).not.toBe(hashInput(file));
  });

  it("keeps the hash of a file without pairGaps", () => {
    const { pairGaps: _p, ...plain } = file;
    const old = sha256Hex(canonicalJson(plain)).slice(0, 16);
    expect(hashInput(plain)).toBe(old);
    expect(documentHash(plain)).toBe(old);
  });

  it("keeps pairGaps in toPackInput", () => {
    expect(toPackInput(file).pairGaps).toBe(pairGaps);
    expect(toPackInput({ boxes: items })).not.toHaveProperty("pairGaps");
  });
});

/** The containers of the made-up inputs: free, a fixed width, a fixed height and a fixed size. */
const containers: PackInput["container"][] = [
  { fixed: "none" },
  { fixed: "width", w: 110 },
  { fixed: "height", h: 110 },
  { fixed: "size", w: 260, h: 260 },
];

/** The start positions of `push`: a grid with a step of 22, so that many pairs are nearer than their pair gap. */
const placed: Item[] = items.map((item, i) => ({ ...item, x: 4 + (i % 4) * 22, y: 4 + Math.floor(i / 4) * 22 }));

const cases: { name: string; strategy: string; options?: Record<string, unknown>; items: Item[]; containers: PackInput["container"][] }[] = [
  { name: "rows", strategy: "rows", items, containers },
  { name: "skyline", strategy: "skyline", items, containers },
  { name: "shelf", strategy: "shelf", items, containers },
  { name: "shelf first fit", strategy: "shelf", options: { fit: "first" }, items, containers },
  { name: "maxrects", strategy: "maxrects", items, containers },
  { name: "maxrects bl", strategy: "maxrects", options: { rule: "bl" }, items, containers },
  { name: "maxrects rotate", strategy: "maxrects", options: { rotate: true }, items: items.map((x, i) => (i % 2 === 0 ? { ...x, turnable: true } : x)), containers },
  { name: "push", strategy: "push", items: placed, containers: containers.slice(1) },
  // The composite strategies give the input with its pairGaps to the strategies above
  { name: "portfolio", strategy: "portfolio", items, containers },
  { name: "select", strategy: "select", items, containers },
  { name: "aspect-fit", strategy: "aspect-fit", options: { strategy: "maxrects" }, items, containers },
];

/** This function gives the verdict of the contract for an output, and checks that `checkHard` gives the same counts. */
function verdict(input: PackInput, output: PackOutput): ReturnType<typeof packHard> {
  const hard = packHard(fileOf(input), output);
  expect(checkHard(input, output)).toEqual(hard);
  return hard;
}

describe.each(cases)("the placement of $name keeps each pair gap", ({ strategy, options, items: given, containers: list }) => {
  it("passes the no-overlap rule of the contract with pairGaps", () => {
    let without = 0;
    for (const container of list) {
      const input: PackInput = { container, items: given, gap: 2, pairGaps: shuffled(pairGaps) };
      const output = packWith(strategy, input, options);
      const hard = verdict(input, output);
      expect(hard, container.fixed).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      expect(output.placements.length, container.fixed).toBeGreaterThan(0);
      // The same pairs in another order give the same output
      expect(outputHash(packWith(strategy, { ...input, pairGaps: pairGaps.map((p) => ({ ...p, a: p.b, b: p.a })) }, options))).toBe(outputHash(output));
      // The output of the input without pairGaps breaks some pair gaps. Thus the test has teeth.
      const { pairGaps: _p, ...plain } = input;
      without += verdict(input, packWith(strategy, plain, options))["no-overlap"];
    }
    expect(without).toBeGreaterThan(0);
  });

  it("gives the output of today for an empty list of pairGaps", () => {
    for (const container of list) {
      const plain: PackInput = { container, items: given, gap: 2 };
      expect(outputHash(packWith(strategy, { ...plain, pairGaps: [] }, options))).toBe(outputHash(packWith(strategy, plain, options)));
    }
  });
});

describe("a pair gap that is not more than the margins", () => {
  it("changes no output", () => {
    const small: PairGap[] = [{ a: id(0), b: id(1), gap: 3 }, { a: id(4), b: id(3), gap: 0 }];
    for (const strategy of ["rows", "skyline", "shelf", "maxrects"]) {
      const plain: PackInput = { container: { fixed: "none" }, items, gap: 2 };
      const output = packWith(strategy, { ...plain, pairGaps: small });
      expect(outputHash(output), strategy).toBe(outputHash(packWith(strategy, plain)));
      expect(verdict({ ...plain, pairGaps: small }, output)["no-overlap"], strategy).toBe(0);
    }
  });
});
