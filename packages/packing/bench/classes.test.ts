import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { CLASSES_CORPUS, CLASSES_FILE, classesCorpusText, classesSpecs } from "./classes.ts";
import { checkDeclared, parseCorpus, runBench, type BenchEnv } from "./run.ts";

// The corpus pack-classes-v1 of roadmap item k106: the classes I to X of the literature. The test reads no time.

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };

describe("the corpus pack-classes-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(CLASSES_FILE, "utf8")).toBe(classesCorpusText());
  });

  it("has 500 inputs: 10 classes, 2 containers, 5 counts and 5 seeds", () => {
    const file = parseCorpus(readFileSync(CLASSES_FILE, "utf8"), CLASSES_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(classesSpecs())));
    expect(file.heldOut).toBe("all");
    const { manifest, inputs } = corpus(file.corpus, file.specs);
    expect(inputs).toHaveLength(500);
    expect(new Set(inputs.map((i) => i.generator!.name))).toEqual(new Set(["berkey-wang", "martello-vigo"]));
    expect(inputs.every((i) => i.source === "made-up" && i.known === undefined)).toBe(true);
    expect(new Set(manifest.inputs.map((i) => i.cell.containerSize))).toEqual(new Set(["fixed", "freeHeight"]));
    expect(checkDeclared(file)).toEqual({ order: 0, aspect: 0, "free-size": 250, shaped: 0 });
  });
});

describe("a smoke run of the class inputs", () => {
  it("gives pack.bound on each measured record", () => {
    const specs = [
      { generator: "berkey-wang", params: { class: "I", containerSize: "freeHeight", count: 20 }, seeds: [1, 2] },
      { generator: "berkey-wang", params: { class: "VI", containerSize: "fixed", count: 20 }, seeds: [1, 2] },
      { generator: "martello-vigo", params: { class: "VII", containerSize: "freeHeight", count: 20 }, seeds: [1, 2] },
      { generator: "martello-vigo", params: { class: "X", containerSize: "fixed", count: 20 }, seeds: [1, 2, 3, 4] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "classes-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["skyline"], clock: () => t++ });
    const measured = records.filter((r) => r.skipped === undefined);
    expect(measured).toHaveLength(10);
    for (const r of measured) expect(r.measures["pack.bound"], r.input).toBeGreaterThan(0);
  });
});
