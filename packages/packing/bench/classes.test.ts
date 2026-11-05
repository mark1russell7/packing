import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { CLASS_STRIP_COUNTS, CLASSES_CORPUS, CLASSES_FILE, CLASSES_FREE_CORPUS, CLASSES_FREE_FILE, classesCorpusText, classesFreeCorpusText, classesFreeSpecs, classesSpecs } from "./classes.ts";
import { checkDeclared, parseCorpus, runBench, type BenchEnv } from "./run.ts";

// The corpora of the classes I to X of the literature: pack-classes-v1 of roadmap item k106, and pack-classes-free-v1 of k158 and k160. The test reads no time.

/** The entries that accept only `freeAspect` and `freeArea` (roadmap item k158). */
const FREE_ENTRIES = ["masonry-shortest", "masonry-lpt", "columns-linear-partition", "treemap-squarified", "treemap-slice-dice", "treemap-strip", "treemap-pivot-split"];

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

describe("the old params of the class generators", () => {
  // The hash comes from the commit before the 2 free forms. A new form must not change one byte of the old inputs.
  it("give the bytes of each input of pack-classes-v1 from before the free forms", () => {
    const { inputs } = corpus(CLASSES_CORPUS, classesSpecs());
    expect(createHash("sha256").update(JSON.stringify(inputs)).digest("hex")).toBe("68a37c9f7efbe80ef82eb3c6e232c2c9ade5fbacefd5d552732de912ec0e68cc");
  });
});

describe("the corpus pack-classes-free-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(CLASSES_FREE_FILE, "utf8")).toBe(classesFreeCorpusText());
  });

  it("has 600 inputs: 500 of the 2 free forms and 100 small strips", () => {
    const file = parseCorpus(readFileSync(CLASSES_FREE_FILE, "utf8"), CLASSES_FREE_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(classesFreeSpecs())));
    expect(file.heldOut).toBe("all");
    const { manifest, inputs } = corpus(file.corpus, file.specs);
    expect(inputs).toHaveLength(600);
    const sizes = manifest.inputs.map((i) => i.cell.containerSize);
    for (const [size, count] of [["freeAspect", 250], ["freeArea", 250], ["freeHeight", 100]] as const) expect(sizes.filter((s) => s === size), size).toHaveLength(count);
    const strips = inputs.filter((_, index) => sizes[index] === "freeHeight");
    expect(new Set(strips.map((i) => i.boxes.length))).toEqual(new Set(CLASS_STRIP_COUNTS));
    expect(checkDeclared(file)).toEqual({ order: 0, aspect: 250, "free-size": 600, shaped: 0 });
  });

  it("gives each of the 7 free entries a measured record on each free form", () => {
    const specs = [
      { generator: "berkey-wang", params: { class: "I", containerSize: "freeAspect", count: 20 }, seeds: [1] },
      { generator: "berkey-wang", params: { class: "VI", containerSize: "freeArea", count: 20 }, seeds: [1] },
      { generator: "martello-vigo", params: { class: "VII", containerSize: "freeAspect", count: 20 }, seeds: [1] },
      { generator: "martello-vigo", params: { class: "X", containerSize: "freeArea", count: 20 }, seeds: [1] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "free-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: FREE_ENTRIES, clock: () => t++ });
    expect(records.filter((r) => r.skipped !== undefined)).toEqual([]);
    expect(records).toHaveLength(FREE_ENTRIES.length * specs.length);
  });

  // Roadmap item k160: the record tells why, so the next read does not depend on the code.
  it("gives exact-strip a measured record to 16 items, and the record above 16 items states the reason", () => {
    const specs = [
      { generator: "berkey-wang", params: { class: "I", containerSize: "freeHeight", count: 8 }, seeds: [1] },
      { generator: "berkey-wang", params: { class: "I", containerSize: "freeHeight", count: 20 }, seeds: [1] },
      { generator: "berkey-wang", params: { class: "I", containerSize: "freeAspect", count: 8 }, seeds: [1] },
    ];
    let t = 0;
    const { records } = runBench({ corpus: { schema: "layout-corpus/1", corpus: "strip-test", specs }, prediction: "p-test", repeats: 1, warmup: 0, env: ENV, strategies: ["exact-strip"], clock: () => t++ });
    expect(records.map((r) => r.skipped)).toEqual([undefined, "refused: the input has more than 16 items", "unsupported containerSize: freeAspect"]);
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
