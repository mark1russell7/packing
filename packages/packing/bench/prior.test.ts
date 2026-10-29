import { describe, expect, it } from "vitest";
import { corpusFamilies } from "@mark1russell7/packing";
import { priorShare } from "./coverage.ts";
import { basisLines, DEFAULT_PRIOR, familyKey, PRIOR_ALIASES, priorBasis, priorWeights, readCorpora, SAMPLER_FAMILIES, samplerFamilyOf, unionPrior, type PriorManifest } from "./prior.ts";

/** Three small corpora. The corpora `b` and `c` share one input of `x@1`. The family `q@1` is not in the sampler. */
const A: PriorManifest = { corpus: "a", specs: [{ generator: "x", version: 1, params: { n: 1 }, seeds: [1, 2, 3] }] };
const B: PriorManifest = {
  corpus: "b",
  specs: [
    { generator: "x", version: 1, params: { n: 2 }, seeds: [1] },
    { generator: "y", version: 2, seeds: [1] },
  ],
};
const C: PriorManifest = {
  corpus: "c",
  specs: [
    { generator: "x", version: 1, params: { n: 2 }, seeds: [1] },
    { generator: "q", seeds: [1, 2] },
  ],
};
const SAMPLER = ["x@1", "y@2", "z@1"];

describe("the family prior of k119", () => {
  it("counts the distinct inputs of the union, and gives the weight 0 to a sampler family without inputs", () => {
    const b = priorBasis([A, B, C], "union", SAMPLER);
    expect(b).toEqual({
      kind: "union",
      corpora: ["a", "b", "c"],
      inputs: 5,
      families: [
        { family: "x@1", inputs: 4, weight: 0.8 },
        { family: "y@2", inputs: 1, weight: 0.2 },
      ],
      absent: ["z@1"],
      unmapped: [{ family: "q@1", inputs: 2 }],
    });
    const w = priorWeights(b);
    expect([...w.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(w.get("z@1") ?? 0).toBe(0);
  });

  it("gives the same union in any order of the corpora", () => {
    const one = priorBasis([A, B, C], "union", SAMPLER);
    for (const order of [
      [C, B, A],
      [B, A, C],
      [C, A, B],
    ])
      expect(priorBasis(order, "union", SAMPLER)).toEqual(one);
  });

  it("gives the effective count of Kish of a case by hand", () => {
    // The weights are 0.8 and 0.2. x@1 has 4 pairs with 2 hits, y@2 has 1 pair with 1 hit, z@1 has 1 pair with the weight 0.
    // Each pair of x@1 has the weight 0.2, the pair of y@2 has 0.2. nEff = 1² / (4 · 0.04 + 0.04) = 5.
    // The share is 0.8 · 0.5 + 0.2 · 1 = 0.6.
    const p = priorShare([true, true, false, false, true, true], ["x@1", "x@1", "x@1", "x@1", "y@2", "z@1"], priorWeights(priorBasis([A, B, C], "union", SAMPLER)), "union");
    expect(p).toMatchObject({ share: 0.6, nEff: 5, weighted: 5, zero: 1, covered: 1, kind: "union" });
    // Unequal weights: x@1 has 1 pair (weight 0.8), y@2 has 4 pairs (0.05 each). nEff = 1 / (0.64 + 4 · 0.0025) = 1 / 0.65.
    const q = priorShare([true, false, false, false, false], ["x@1", "y@2", "y@2", "y@2", "y@2"], priorWeights(priorBasis([A, B, C], "union", SAMPLER)));
    expect(q.nEff).toBe(Math.round((1 / 0.65) * 10) / 10);
    expect(q.share).toBe(0.8);
  });

  it("maps each family of the committed corpora to a sampler family, except the adversary inputs", () => {
    const families = new Set<string>();
    for (const m of readCorpora()) {
      for (const s of m.specs ?? []) families.add(familyKey(s.generator, s.version));
      for (const i of m.specs === undefined ? (m.inputs ?? []) : []) if (i.generator !== undefined) families.add(familyKey(i.generator.name, i.generator.version));
    }
    const mapping = Object.fromEntries([...families].sort().map((f) => [f, samplerFamilyOf(f)]));
    expect(mapping).toEqual({ ...Object.fromEntries(SAMPLER_FAMILIES.map((f) => [f, f])), "adversary@1": null });
    expect(PRIOR_ALIASES).toEqual({ "adversary@1": null });
    expect(SAMPLER_FAMILIES).toEqual(corpusFamilies.map((f) => `${f.name}@${f.version}`));
  });

  it("gives the union of the committed corpora as the default, with each sampler family", () => {
    expect(DEFAULT_PRIOR).toBe("union");
    const b = unionPrior();
    expect(b.corpora.length).toBe(readCorpora().length);
    expect(b.families.map((f) => f.family)).toEqual(SAMPLER_FAMILIES.filter((f) => !b.absent.includes(f)));
    expect(b.unmapped).toEqual([{ family: "adversary@1", inputs: 6 }]);
    expect([...priorWeights(b).values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(unionPrior()).toBe(b);
    expect(basisLines(b)[0]).toMatch(/^The family prior: the union of \d+ corpora/);
  });

  it("reads a spec without a version as version 1, and an input without specs from its generator", () => {
    const inputs: PriorManifest = { corpus: "d", inputs: [{ id: "d/x/s1", seed: 1, generator: { name: "x", version: 1, params: { n: 9 } } }, { id: "d/n" }] };
    expect(priorBasis([inputs], "corpus", SAMPLER)).toMatchObject({ kind: "corpus", inputs: 1, families: [{ family: "x@1", inputs: 1, weight: 1 }] });
    expect(priorBasis([], "union", SAMPLER)).toMatchObject({ inputs: 0, families: [], absent: SAMPLER });
  });
});
