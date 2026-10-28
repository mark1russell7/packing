import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { corpus, type CorpusSpec } from "@mark1russell7/packing";
import { corpusHashOf, loadSplit, splitFileName, splitProblems, SPLITS_DIR, type SplitFile } from "./split.ts";

// The split files of k66 part 2. The made-up manifests have no real inputs. The last test reads the split files of the repository.

const manifest = { corpus: "t", specs: [{ seeds: [1, 2, 3] }], inputs: [{ id: "t/a/s1", hash: "h1" }, { id: "t/a/s2", hash: "h2" }, { id: "t/a/s3", hash: "h3" }] };

const fileOf = (splits: SplitFile["splits"], extra: Partial<SplitFile> = {}): SplitFile => ({ schema: "corpus-split/1", corpus: "t", corpusHash: corpusHashOf(manifest), splits, ...extra });

const good = fileOf({ default: { folds: [{ train: [1, 2], heldOut: [3] }] } });

describe("the corpus hash", () => {
  it("has 16 hex characters and changes with the id, the hash or the order of an input", () => {
    const h = corpusHashOf(manifest);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(corpusHashOf({ ...manifest, corpus: "u" })).not.toBe(h);
    expect(corpusHashOf({ ...manifest, inputs: [{ id: "t/a/s1", hash: "hX" }, ...manifest.inputs.slice(1)] })).not.toBe(h);
    expect(corpusHashOf({ ...manifest, inputs: manifest.inputs.toReversed() })).not.toBe(h);
    expect(splitFileName("t", h)).toBe(`t.${h}.json`);
  });
});

describe("the problems of a split file", () => {
  it("finds no problem in a good file", () => {
    expect(splitProblems(good, manifest)).toEqual([]);
  });

  it("refuses a bad schema, corpus or corpus hash", () => {
    expect(splitProblems(fileOf(good.splits, { schema: "x" as "corpus-split/1" }), manifest)).toEqual(["the schema is x, not corpus-split/1"]);
    expect(splitProblems(fileOf(good.splits, { corpus: "u" }), manifest)).toEqual(["the corpus is u, not t"]);
    expect(splitProblems(fileOf(good.splits, { corpusHash: "0" }), manifest)[0]).toMatch(/^the corpusHash is 0, but the corpus gives/);
    expect(splitProblems(null, manifest)).toEqual(["the split file is not an object"]);
  });

  it("refuses a split with no fold, an empty list, a common seed and an unknown seed", () => {
    const bad = fileOf({
      none: { folds: [] },
      empty: { folds: [{ train: [], heldOut: [3] }, { train: [1], heldOut: [] }] },
      common: { folds: [{ train: [1, 2], heldOut: [2, 3] }] },
      unknown: { folds: [{ train: [1, 9], heldOut: [3] }] },
    });
    expect(splitProblems(bad, manifest)).toEqual([
      "the split none has no folds",
      "the fold 0 of the split empty has no train seeds",
      "the fold 1 of the split empty has no heldOut seeds",
      "the fold 0 of the split common has the seeds 2 in train and in heldOut",
      "the fold 0 of the split unknown has the seeds 9, which are not in the corpus",
    ]);
  });
});

describe("the load of a split", () => {
  const dir = mkdtempSync(join(tmpdir(), "split-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the folds of a split from the file of the corpus hash", () => {
    writeFileSync(join(dir, splitFileName("t", corpusHashOf(manifest))), JSON.stringify(good));
    expect(loadSplit(manifest, "default", dir)).toEqual([{ train: [1, 2], heldOut: [3] }]);
    expect(() => loadSplit(manifest, "loso", dir)).toThrow(/has no split loso. Its splits are default/);
  });

  it("refuses a corpus with other inputs, and names the split files of the corpus", () => {
    const other = { ...manifest, inputs: manifest.inputs.slice(0, 2) };
    expect(() => loadSplit(other, "default", dir)).toThrow(new RegExp(`does not exist. The split files of the corpus are t.${corpusHashOf(manifest)}.json`));
    expect(() => loadSplit({ ...manifest, corpus: "u" }, "default", dir)).toThrow(/No split file of the corpus exists/);
  });

  it("refuses a file with a problem", () => {
    const bad = join(dir, "bad");
    mkdirSync(bad);
    writeFileSync(join(bad, splitFileName("t", corpusHashOf(manifest))), JSON.stringify(fileOf({ default: { folds: [{ train: [1, 3], heldOut: [3] }] } })));
    expect(() => loadSplit(manifest, "default", bad)).toThrow(/is not good: the fold 0 of the split default has the seeds 3 in train and in heldOut/);
  });
});

describe("the split files of the repository", () => {
  it("match the hash of their corpus, and each split loads", () => {
    const files = readdirSync(SPLITS_DIR).filter((f) => f.endsWith(".json"));
    expect(files.toSorted()).toEqual(["pack-free-v1.af6c6985300e1fd1.json", "pack-screen-v1.cf53d6cf7e907de7.json"]);
    for (const f of files) {
      const file = JSON.parse(readFileSync(join(SPLITS_DIR, f), "utf8")) as SplitFile;
      const c = JSON.parse(readFileSync(join(import.meta.dirname, "corpora", `${file.corpus}.json`), "utf8")) as { corpus: string; specs: CorpusSpec[] };
      const { manifest: m } = corpus(c.corpus, c.specs);
      expect(f).toBe(splitFileName(file.corpus, corpusHashOf(m)));
      for (const name of Object.keys(file.splits)) expect(loadSplit(m, name).length).toBeGreaterThan(0);
      // The split loso holds out each seed of the corpus once.
      expect(loadSplit(m, "loso").flatMap((fold) => fold.heldOut).toSorted((a, b) => a - b)).toEqual([...new Set(c.specs.flatMap((s) => s.seeds))].toSorted((a, b) => a - b));
    }
  }, 120_000);
});
