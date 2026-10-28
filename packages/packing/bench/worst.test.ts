import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { WORST_CORPUS, WORST_FILE, worstCorpusText, worstSpecs } from "./worst.ts";
import { checkDeclared, parseCorpus, runBench, type BenchEnv } from "./run.ts";

// The corpus pack-worst-v1 of roadmap item k107: the adversarial families and the scaling ladder. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

describe("the corpus pack-worst-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(WORST_FILE, "utf8")).toBe(worstCorpusText());
  });

  it("has 342 inputs: 252 adversarial inputs and 90 rungs of the ladder", () => {
    const file = parseCorpus(readFileSync(WORST_FILE, "utf8"), WORST_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(worstSpecs())));
    expect(file.heldOut).toBe("all");
    const { manifest, inputs } = corpus(file.corpus, file.specs);
    expect(inputs).toHaveLength(342);
    const by = (name: string): number => inputs.filter((i) => i.generator!.name === name).length;
    expect([by("tall-row"), by("skyline-gap"), by("bl-trap"), by("half-wide"), by("ladder")]).toEqual([72, 72, 36, 72, 90]);
    expect(inputs.every((i) => i.source === "made-up" && i.known === undefined)).toBe(true);
    expect(new Set(manifest.inputs.map((i) => i.cell.containerSize))).toEqual(new Set(["fixed", "freeHeight"]));
    expect(Math.max(...inputs.map((i) => i.boxes.length))).toBe(2560);
    expect(checkDeclared(file)).toEqual({ order: 0, aspect: 0, "free-size": 216, shaped: 0 });
  });
});

describe("a smoke run of the worst-case inputs", () => {
  it("gives pack.bound on each measured record, and a gap of 0 or more", () => {
    const specs = [
      { generator: "tall-row", params: { ratio: 4, containerSize: "freeHeight", count: 30 }, seeds: [1] },
      { generator: "skyline-gap", params: { ratio: 8, containerSize: "fixed", count: 30 }, seeds: [1] },
      { generator: "bl-trap", params: { stages: 3, containerSize: "freeHeight", count: 30 }, seeds: [1] },
      { generator: "half-wide", params: { excess: 2, containerSize: "fixed", count: 30 }, seeds: [1] },
      { generator: "ladder", params: { axis: "ratio", rung: 4, count: 20 }, seeds: [1] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "worst-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["skyline", "maxrects-bl"], clock: () => t++ });
    const measured = records.filter((r) => r.skipped === undefined);
    expect(measured).toHaveLength(10);
    for (const r of measured) {
      expect(r.measures["pack.bound"], r.input).toBeGreaterThan(0);
      expect(r.measures["pack.gap"], r.input).toBeGreaterThanOrEqual(0);
    }
  });
});
