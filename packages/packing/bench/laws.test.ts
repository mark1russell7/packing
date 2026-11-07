import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpus, generator } from "@mark1russell7/packing";
import { FEW_TYPES_SEEDS, LAWS_CORPUS, LAWS_FILE, LAWS_SEEDS, lawsCorpusText, lawsSpecs, namedCell } from "./laws.ts";
import { lawOf } from "./law-cover.ts";
import { parseCorpus } from "./run.ts";

// The corpus of the item laws, pack-laws-v1 of roadmap item k190. The test reads no time.

describe("the corpus pack-laws-v1", () => {
  it("is the output of its builder, byte for byte", () => {
    expect(readFileSync(LAWS_FILE, "utf8")).toBe(lawsCorpusText());
  });

  it("has 54 specs and 396 inputs: 45 specs of 4 seeds and 9 specs of 24 seeds", () => {
    const file = parseCorpus(readFileSync(LAWS_FILE, "utf8"), LAWS_CORPUS);
    expect(file.specs).toEqual(JSON.parse(JSON.stringify(lawsSpecs())));
    expect(file.heldOut).toBe("all");
    const { inputs } = corpus(file.corpus, file.specs);
    expect(file.specs).toHaveLength(54);
    expect(inputs).toHaveLength(45 * LAWS_SEEDS.length + 9 * FEW_TYPES_SEEDS.length);
    expect(inputs.every((i) => i.generator!.name === "item-law" && i.source === "made-up")).toBe(true);
  });

  it("gives each pair of an area law and an aspect law, and each law with each assortment of the generator", () => {
    const cells = lawsSpecs().map(namedCell);
    expect(new Set(cells.map((c) => `${c.area}|${c.aspect}`)).size).toBe(45);
    expect(new Set(cells.map((c) => `${c.area}|${c.assortment}`)).size).toBe(18);
    expect(new Set(cells.map((c) => `${c.aspect}|${c.assortment}`)).size).toBe(10);
  });
});

describe("the gate of the item laws", () => {
  // A spec that gives a cell other than its name fails here, before it reaches the count of the law pairs.
  it.each(lawsSpecs().map((spec) => [Object.values(spec.params!).join(" "), spec] as const))(
    "reads the laws of the spec %s back from its items",
    (_, spec) => {
      const gen = generator(spec.generator, spec.version);
      const params = gen.withDefaults(spec.params);
      const inputs = spec.seeds.map((seed) => gen.generate(seed, params, "law-gate"));
      expect(lawOf(inputs)).toEqual(namedCell(spec));
    },
  );
});
