import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { KNOWN_CORPUS, KNOWN_FILE, knownCorpusText, knownSpecs } from "./known.ts";
import { checkDeclared, parseCorpus, runBench, type BenchEnv } from "./run.ts";

// The corpus pack-known-v1 of roadmap item k45, and the measure pack.gapToOpt in the records of the runner. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

describe("the corpus pack-known-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(KNOWN_FILE, "utf8")).toBe(knownCorpusText());
  });

  it("has 288 inputs with a known best value: perfect cuts of fixed and free sizes, and consecutive squares", () => {
    const known = parseCorpus(readFileSync(KNOWN_FILE, "utf8"), KNOWN_CORPUS);
    expect(known.specs).toEqual(JSON.parse(JSON.stringify(knownSpecs())));
    expect(known.heldOut).toBe("all");
    const { manifest, inputs } = corpus(known.corpus, known.specs);
    expect(inputs).toHaveLength(288);
    expect(inputs.every((i) => i.known !== undefined && i.source.startsWith("known-best:"))).toBe(true);
    expect(checkDeclared(known)).toEqual({ order: 0, aspect: 0, "free-size": 216, shaped: 0 });
    expect(known.declared).toEqual({ minCount: 10, thin: ["order", "aspect", "shaped"], counts: { order: 0, aspect: 0, "free-size": 216, shaped: 0 } });
    const cells = manifest.inputs.map((i) => i.cell);
    expect(new Set(cells.map((c) => c.containerSize))).toEqual(new Set(["fixed", "freeHeight", "freeArea"]));
    expect(new Set(cells.map((c) => c.count))).toEqual(new Set(["10", "100"]));
    // An optimum for each perfect cut, and a bound for each set of consecutive squares
    for (const i of inputs) expect(i.known!.kind).toBe(i.generator!.name === "perfect-cut" ? "optimum" : "bound");
  });
});

describe("the measure pack.gapToOpt in the runner", () => {
  it("is in each measured record of an input with a known best value, and in no other record", () => {
    const specs = [
      { generator: "perfect-cut", params: { containerSize: "fixed", count: 10 }, seeds: [1] },
      { generator: "perfect-cut", params: { containerSize: "freeHeight", cut: "free", count: 10 }, seeds: [1] },
      { generator: "consecutive-squares", params: { containerSize: "freeHeight", count: 10 }, seeds: [1] },
      { generator: "rect-grid", params: { count: 10 }, seeds: [1] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "known-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["rows", "skyline"], clock: () => t++ });
    const measured = records.filter((r) => r.skipped === undefined);
    expect(measured).toHaveLength(8);
    for (const r of measured) {
      const gap = r.measures["pack.gapToOpt"];
      if (r.input.includes("rect-grid")) expect(gap, r.input).toBeUndefined();
      else expect(gap, `${r.strategy} ${r.input}`).toBeGreaterThanOrEqual(0);
    }
  });
});
