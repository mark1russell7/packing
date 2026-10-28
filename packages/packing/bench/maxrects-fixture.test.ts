import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpus, packWith, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import { outputHash } from "./run.ts";

// The maxrects fixture of roadmap item k64. It holds the `outputHash` of each rule of `maxrects` and of `portfolio` on each
// input of `smoke-v1`, `pack-holdout-v1` and `pack-screen-v1`, from the code before the speedup (commit f496743).
// Do not write this file again: a change of a hash is a change of the results of `maxrects`.
// The test packs 1840 inputs 8 times. Thus its checks of the hashes start only in CI, where the variable `CI` is set.

interface MaxRectsFixture {
  commit: string;
  sets: { corpus: string; specs: CorpusSpec[] }[];
  entries: Record<string, { strategy: string; options: Record<string, unknown> }>;
  inputs: string[];
  hashes: Record<string, string[]>;
}

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "maxrects-hashes.json"), "utf8")) as MaxRectsFixture;
const inCi = (process.env["CI"] ?? "") !== "";

describe("the maxrects fixture", () => {
  it("has one hash for each input and each entry", () => {
    expect(Object.keys(fixture.hashes)).toEqual(Object.keys(fixture.entries));
    for (const own of Object.values(fixture.hashes)) expect(own.length).toBe(fixture.inputs.length);
  });

  describe.runIf(inCi)("in CI", () => {
    const files = fixture.sets.flatMap((set) => corpus(set.corpus, set.specs).inputs);

    it("has each input of the three corpora, in the order of the corpora", () => {
      expect(files.map((file) => file.id)).toEqual(fixture.inputs);
    });

    for (const [id, e] of Object.entries(fixture.entries)) {
      it(`keeps each output of ${id} (${fixture.inputs.length} inputs)`, { timeout: 900_000 }, () => {
        const own = fixture.hashes[id]!;
        const changed: string[] = [];
        files.forEach((file, i) => {
          let hash: string;
          try {
            hash = outputHash(packWith(e.strategy, toPackInput(file), e.options, file.seed));
          } catch (error) {
            hash = `throws ${(error as Error).name}`;
          }
          if (hash !== own[i]) changed.push(file.id);
        });
        expect(changed).toEqual([]);
      });
    }
  });
});
