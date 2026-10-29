import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { STRIP_CORPUS, STRIP_FILE, stripCorpusText, stripSpecs } from "./strip.ts";
import { checkDeclared, parseCorpus, runBench, type BenchEnv } from "./run.ts";

// The corpus pack-strip-v1 of roadmap item k46: the published sets of strip packing, made by their rules. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

describe("the corpus pack-strip-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(STRIP_FILE, "utf8")).toBe(stripCorpusText());
  });

  it("has 528 inputs: 252 of hopper-turton, 156 of burke-kendall-whitwell and 120 of beasley-gcut", () => {
    const file = parseCorpus(readFileSync(STRIP_FILE, "utf8"), STRIP_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(stripSpecs())));
    expect(file.specs).toHaveLength(160);
    expect(file.heldOut).toBe("all");
    const { manifest, inputs } = corpus(file.corpus, file.specs);
    expect(inputs).toHaveLength(528);
    const by = (name: string): number => inputs.filter((i) => i.generator!.name === name).length;
    expect([by("hopper-turton"), by("burke-kendall-whitwell"), by("beasley-gcut")]).toEqual([252, 156, 120]);
    // The perfect strip sets have a known optimum. The problems gcut have none.
    for (const i of inputs) {
      const perfect = i.generator!.name !== "beasley-gcut";
      expect(i.source, i.id).toBe(perfect ? `known-best:${i.generator!.name}` : "made-up");
      expect(i.known?.kind, i.id).toBe(perfect ? "optimum" : undefined);
    }
    expect(new Set(manifest.inputs.map((i) => i.cell.containerSize))).toEqual(new Set(["fixed", "freeHeight"]));
    expect(Math.max(...inputs.map((i) => i.boxes.length))).toBe(3152);
    expect(checkDeclared(file)).toEqual({ order: 0, aspect: 0, "free-size": 264, shaped: 0 });
  });
});

describe("a smoke run of the strip inputs", () => {
  it("gives pack.bound on each measured record, and pack.gapToOpt on each input with a known optimum", () => {
    const specs = [
      { generator: "hopper-turton", params: { category: "C2", problem: 1, cut: "guillotine", containerSize: "freeHeight" }, seeds: [1] },
      { generator: "hopper-turton", params: { category: "C1", problem: 2, cut: "free", containerSize: "fixed" }, seeds: [1] },
      { generator: "burke-kendall-whitwell", params: { instance: "N2", cut: "guillotine", containerSize: "freeHeight" }, seeds: [1] },
      { generator: "beasley-gcut", params: { side: 250, containerSize: "freeHeight", count: 20 }, seeds: [1] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "strip-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["skyline", "maxrects-bl"], clock: () => t++ });
    const measured = records.filter((r) => r.skipped === undefined);
    expect(measured).toHaveLength(8);
    for (const r of measured) {
      expect(r.measures["pack.bound"], r.input).toBeGreaterThan(0);
      const gap = r.measures["pack.gapToOpt"];
      if (r.input.includes("beasley-gcut")) expect(gap, r.input).toBeUndefined();
      else expect(gap, `${r.strategy} ${r.input}`).toBeGreaterThanOrEqual(0);
    }
  });
});
