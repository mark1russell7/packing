import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpus, rectGrid, rectGridV2, toPackInput } from "@mark1russell7/packing";
import { assertClaim, claimProblems, declaredCounts, declares, DECLARED_IDS, parseClaim, type DeclaredClaim } from "./claims.ts";
import { checkDeclared, parseCorpus, runBench, summaryMarkdown, type BenchEnv } from "./run.ts";

// The declared properties of roadmap item k62, on made-up inputs and on the corpus files. The test reads no time.

const corpusFile = (name: string): string => readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8");
const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

describe("declares", () => {
  it("gives no property for a plain input, and each property in order for an input that declares all", () => {
    expect(declares(toPackInput(rectGrid.generate(1, { count: 5 })))).toEqual([]);
    const all = toPackInput(rectGridV2.generate(1, { count: 5, containerSize: "freeAspect", containerShape: "circle", order: "soft" }));
    expect(declares(all)).toEqual(["order", "aspect", "free-size", "shaped"]);
    // freeArea gives no aspect, and a free width is a free size
    expect(declares(toPackInput(rectGrid.generate(1, { count: 5, containerSize: "freeArea" })))).toEqual(["free-size"]);
    expect(declares(toPackInput(rectGrid.generate(1, { count: 5, containerSize: "freeWidth" })))).toEqual(["free-size"]);
  });

  it("counts each id, with 0 for an id with no input", () => {
    const inputs = [rectGrid.generate(1, { count: 5 }), rectGrid.generate(1, { count: 5, containerShape: "holes" })].map(toPackInput);
    expect(declaredCounts(inputs)).toEqual({ order: 0, aspect: 0, "free-size": 0, shaped: 1 });
    expect(Object.keys(declaredCounts([]))).toEqual(DECLARED_IDS);
  });
});

describe("the claim claims.declared", () => {
  const counts = { order: 0, aspect: 12, "free-size": 12, shaped: 3 };
  const claim: DeclaredClaim = { minCount: 10, thin: ["order", "shaped"], counts };

  it("reads a claim, and gives undefined for a manifest without one", () => {
    expect(parseClaim({ claims: { declared: claim } })).toEqual(claim);
    expect(parseClaim({})).toBeUndefined();
    expect(parseClaim({ claims: {} })).toBeUndefined();
    expect(() => parseClaim({ claims: 1 })).toThrow(/claims/);
    expect(() => parseClaim({ claims: { declared: [] } })).toThrow(/claims.declared/);
    expect(() => parseClaim({ claims: { declared: { ...claim, minCount: 1.5 } } })).toThrow(/minCount/);
    expect(() => parseClaim({ claims: { declared: { ...claim, thin: [1] } } })).toThrow(/thin/);
    expect(() => parseClaim({ claims: { declared: { ...claim, counts: { order: -1 } } } })).toThrow(/counts/);
  });

  it("is true when each count is the computed count and each thin property is in thin", () => {
    expect(claimProblems(claim, counts)).toEqual([]);
    expect(() => assertClaim("c", claim, counts)).not.toThrow();
    // A property in thin with a count of minCount or more is not a problem
    expect(claimProblems({ ...claim, thin: ["order", "shaped", "aspect"] }, counts)).toEqual([]);
  });

  it("gives each problem: a wrong count, a missing id, an unknown id and a thin property out of thin", () => {
    expect(claimProblems(claim, { ...counts, aspect: 11 })).toEqual(['the property "aspect" has the count 12, but the inputs give 11']);
    const { shaped: _shaped, ...rest } = counts;
    expect(claimProblems({ ...claim, counts: { ...rest, nope: 1 } }, counts)).toEqual(['the property "shaped" has no count', '"nope" is not a declared property']);
    expect(claimProblems({ ...claim, thin: ["order", "nope"] }, counts)).toEqual([
      'the property "shaped" has 3 inputs, below minCount 10, and it is not in thin',
      '"nope" of thin is not a declared property',
    ]);
    expect(() => assertClaim("c", claim, { ...counts, order: 1 })).toThrow(/The claims.declared of the corpus "c" is not true: the property "order"/);
  });
});

describe("the corpus files", () => {
  it("makes the claim of pack-screen-v1 true, with no change of its inputs", () => {
    const screen = parseCorpus(corpusFile("pack-screen-v1"), "pack-screen-v1");
    expect(screen.declared).toEqual({ minCount: 10, thin: ["order", "aspect"], counts: { order: 0, aspect: 0, "free-size": 20, shaped: 1050 } });
    expect(checkDeclared(screen)).toEqual(screen.declared!.counts);
  });

  it("makes the claim of pack-free-v1 true: 720 inputs of free size, each shape, sizes identical and an order soft", () => {
    const free = parseCorpus(corpusFile("pack-free-v1"), "pack-free-v1");
    const { manifest } = corpus(free.corpus, free.specs);
    expect(manifest.inputs).toHaveLength(720);
    expect(checkDeclared(free)).toEqual({ order: 360, aspect: 360, "free-size": 720, shaped: 600 });
    expect(free.declared!.thin).toEqual([]);
    const cells = manifest.inputs.map((i) => i.cell);
    expect(new Set(cells.map((c) => c.containerSize))).toEqual(new Set(["freeAspect", "freeArea"]));
    expect(new Set(cells.map((c) => c.containerShape))).toEqual(new Set(["rect", "convex", "polygon", "circle", "ellipse", "holes"]));
    expect(new Set(cells.map((c) => c.order))).toEqual(new Set(["free", "soft"]));
    expect(manifest.inputs.some((i) => i.id.includes(".identical."))).toBe(true);
  });

  it("makes the claim of pack-select-v1 true: the specs of pack-screen-v1 and pack-free-v1 with the fresh seeds 21 to 25", () => {
    const select = parseCorpus(corpusFile("pack-select-v1"), "pack-select-v1");
    const screen = parseCorpus(corpusFile("pack-screen-v1"), "pack-screen-v1");
    const free = parseCorpus(corpusFile("pack-free-v1"), "pack-free-v1");
    const fresh = [21, 22, 23, 24, 25];
    expect(select.specs).toEqual([...screen.specs, ...free.specs].map((s) => ({ ...s, seeds: fresh })));
    expect(select.heldOut).toBe("all");
    const { manifest } = corpus(select.corpus, select.specs);
    expect(manifest.inputs).toHaveLength(2025);
    expect(checkDeclared(select)).toEqual({ order: 360, aspect: 360, "free-size": 740, shaped: 1650 });
    expect(select.declared!.thin).toEqual([]);
  }, 120_000);

  it("stops a run before the first packing when the claim is not true, and prints the counts of a true claim", () => {
    const specs = [{ generator: "rect-grid", version: 1, params: { count: 5, containerShape: "circle" }, seeds: [1, 2] }];
    const wrong = { schema: "layout-corpus/1" as const, corpus: "claim-v1", specs, declared: { minCount: 1, thin: [], counts: { order: 0, aspect: 0, "free-size": 0, shaped: 1 } } };
    expect(() => runBench({ corpus: wrong, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["rows"] })).toThrow(/"shaped" has the count 1, but the inputs give 2/);
    const right = { ...wrong, declared: { minCount: 1, thin: ["order", "aspect", "free-size"], counts: { order: 0, aspect: 0, "free-size": 0, shaped: 2 } } };
    const { run } = runBench({ corpus: right, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["rows"] });
    expect(run.declared).toEqual(right.declared.counts);
    expect(summaryMarkdown(run, [])).toContain("## Declared properties\n\n| property | inputs |\n|---|---:|\n| order | 0 |\n| aspect | 0 |\n| free-size | 0 |\n| shaped | 2 |");
  });
});
