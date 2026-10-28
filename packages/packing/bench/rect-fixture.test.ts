import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpus, packWith, toPackInput, type CorpusSpec } from "@mark1russell7/packing";
import { outputHash } from "./run.ts";

// The rect fixture of roadmap item k37. It holds the `outputHash` of `rows`, `shelf` and `skyline` on each input with a
// rectangle container, from the code before the container layer. Do not write this file again: a change of a hash is a
// change of the rectangle results.

interface RectFixture {
  sets: { corpus: string; specs: CorpusSpec[] }[];
  hashes: Record<string, Record<string, string>>;
}

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "rect-hashes.json"), "utf8")) as RectFixture;
const files = new Map(fixture.sets.flatMap((set) => corpus(set.corpus, set.specs).inputs.map((file) => [file.id, file] as const)));

describe("the rect fixture", () => {
  it("has each input of its hashes, and each input has a rectangle container", () => {
    for (const own of Object.values(fixture.hashes)) for (const id of Object.keys(own)) expect(files.has(id), id).toBe(true);
    for (const set of fixture.sets) for (const e of corpus(set.corpus, set.specs).manifest.inputs) expect(e.cell.containerShape, e.id).toBe("rect");
  });

  for (const [strategy, own] of Object.entries(fixture.hashes)) {
    it(`keeps each output of ${strategy} (${Object.keys(own).length} inputs)`, () => {
      const changed: string[] = [];
      for (const [id, hash] of Object.entries(own)) {
        const file = files.get(id)!;
        if (outputHash(packWith(strategy, toPackInput(file), undefined, file.seed)) !== hash) changed.push(id);
      }
      expect(changed).toEqual([]);
    });
  }
});
