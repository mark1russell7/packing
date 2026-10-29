import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boundMeasures, checkHard, checkInput, DEFAULT_TOLERANCE, generator, hashInput, measure, mulberry32, packWith, strategy, toPackInput, type GeneratedInput } from "@mark1russell7/packing";
import {
  ADVERSARY_CORPUS,
  ADVERSARY_FILE,
  ADVERSARY_MAX_COUNT,
  ADVERSARY_PAIRS,
  BEST,
  candidateFile,
  foundLine,
  inputLine,
  lossOf,
  mutateSizes,
  pairOptions,
  readAdversaryCorpus,
  searchAdversary,
  SINGLE_ENTRIES,
  type Loss,
} from "./adversary.ts";
import { entry } from "./entries.ts";

// The adversarial search of roadmap item k47 and its corpus pack-adversary-v1. The tests read no time.

/** This function packs an input with an entry, as the runner does. */
function packEntry(id: string, file: GeneratedInput) {
  const e = entry(id);
  const s = strategy(e.strategy);
  const given = Object.keys(e.options).length === 0 ? undefined : { ...(s.defaults as Record<string, unknown>), ...e.options };
  const input = toPackInput(file);
  return { input, output: packWith(e.strategy, input, given, file.seed) };
}

/** This function gives the sum of the breaks of the hard rules of an entry on an input. */
function hardOf(id: string, file: GeneratedInput): number {
  const { input, output } = packEntry(id, file);
  return Object.values(checkHard(input, output, DEFAULT_TOLERANCE)).reduce((a, b) => a + b, 0);
}

/** This function gives the value of the loss measure of an entry: the fill for a fixed size, else the gap. */
function valueOf(id: string, file: GeneratedInput): number {
  const { input, output } = packEntry(id, file);
  return file.container.fixed === "size" ? measure(input, output)["pack.fill"] : boundMeasures(input, output)["pack.gap"]!;
}

/** This function tells that a file is a valid `layout-input/1` input of the search, with its hash. */
function expectValid(file: GeneratedInput, maxCount: number): void {
  expect(file.schema).toBe("layout-input/1");
  expect(checkInput(file)).toEqual([]);
  expect(file.hash).toBe(hashInput(file));
  expect(file.source).toBe("made-up");
  expect(file.generator?.name).toBe("adversary");
  expect(file.generator?.version).toBe(1);
  expect(file.boxes.length).toBeGreaterThanOrEqual(1);
  expect(file.boxes.length).toBeLessThanOrEqual(maxCount);
  for (const b of file.boxes) {
    expect(Number.isInteger(b.w) && Number.isInteger(b.h) && b.w >= 1 && b.h >= 1).toBe(true);
    expect(b.w).toBeLessThanOrEqual(file.container.w!);
  }
}

describe("the loss", () => {
  const fixed = generator("tall-row").generate(1, { ratio: 2, containerSize: "fixed", count: 30 });
  const strip = generator("tall-row").generate(1, { ratio: 8, containerSize: "freeHeight", count: 30 });
  const cellOf = (file: GeneratedInput) => generator("tall-row").cell(file.generator!.params);

  it("is fill(B) - fill(A) for a fixed container", () => {
    const loss = lossOf("rows", "maxrects-bl", fixed, cellOf(fixed))!;
    expect(loss.measure).toBe("fill");
    expect(loss.winner).toBe("maxrects-bl");
    expect(loss.valueA).toBe(valueOf("rows", fixed));
    expect(loss.valueB).toBe(valueOf("maxrects-bl", fixed));
    expect(loss.loss).toBe(loss.valueB - loss.valueA);
  });

  it("is gap(A) - gap(B) with the bound of k51 for a free height", () => {
    const loss = lossOf("rows", "maxrects-bl", strip, cellOf(strip))!;
    expect(loss.measure).toBe("gap");
    expect(loss.valueA).toBe(valueOf("rows", strip));
    expect(loss.valueB).toBe(valueOf("maxrects-bl", strip));
    expect(loss.loss).toBe(loss.valueA - loss.valueB);
  });

  it("takes the best single entry with no break for best", () => {
    const loss = lossOf("select-rows-bl", BEST, strip, cellOf(strip))!;
    const gaps = SINGLE_ENTRIES.filter((id) => id !== "push" && hardOf(id, strip) === 0).map((id) => valueOf(id, strip));
    expect(loss.valueB).toBe(Math.min(...gaps));
    expect(valueOf(loss.winner, strip)).toBe(loss.valueB);
    expect(SINGLE_ENTRIES).not.toContain("select-rows-bl");
  });
});

describe("the item moves", () => {
  it("keep each size whole and in the container, and the count from 1 to the cap", () => {
    const r = mulberry32(7);
    let sizes: (readonly [number, number])[] = [
      [10, 4],
      [3, 9],
    ];
    const seen = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      const { sizes: next, move } = mutateSizes(sizes, 40, 30, 12, r);
      seen.add(move.split(" ")[0]!);
      expect(next.length).toBeGreaterThanOrEqual(1);
      expect(next.length).toBeLessThanOrEqual(12);
      for (const [w, h] of next) expect(Number.isInteger(w) && Number.isInteger(h) && w >= 1 && w <= 40 && h >= 1 && h <= 30, `${move}: ${w} x ${h}`).toBe(true);
      sizes = next;
    }
    expect([...seen].sort()).toEqual(["add", "delete", "merge", "resize", "split", "swap"]);
  });

  it("give a valid input with its hash", () => {
    const options = { a: "rows", b: "maxrects-bl", seed: 3, budget: 1, maxCount: 8 };
    const r = mulberry32(3);
    let sizes: (readonly [number, number])[] = [[5, 5]];
    for (let k = 0; k < 200; k++) {
      sizes = mutateSizes(sizes, 50, undefined, 8, r).sizes;
      const file = candidateFile(options, { origin: { generator: "ladder", version: 1, params: {}, seed: 1 }, container: { w: 50, fixed: "width" }, sizes });
      expectValid(file, 8);
    }
  });
});

describe("the search", () => {
  const options = { a: "skyline", b: "maxrects-bl", seed: 5, budget: 150, maxCount: 30 };

  it("gives the same result for one seed, and another result for another seed", () => {
    const one = searchAdversary(options);
    expect(searchAdversary(options)).toEqual(one);
    expect(one.evaluations).toBe(150);
    expect(searchAdversary({ ...options, seed: 6 }).worst?.input.hash).not.toBe(one.worst?.input.hash);
  });

  it("makes only valid candidates, and B breaks no hard rule on each candidate with a loss", () => {
    const seen: [GeneratedInput, Loss | undefined][] = [];
    const result = searchAdversary({ ...options, budget: 60 }, (file, score) => seen.push([file, score]));
    expect(seen).toHaveLength(60);
    expect(seen.filter(([, s]) => s !== undefined)).toHaveLength(result.valid);
    for (const [file, score] of seen.slice(0, 20)) {
      expectValid(file, 30);
      if (score === undefined) continue;
      expect(hardOf(score.winner, file)).toBe(0);
      const a = valueOf("skyline", file);
      const b = valueOf("maxrects-bl", file);
      expect(score.loss).toBe(file.container.fixed === "size" ? b - a : a - b);
    }
  });

  it("reports the worst candidate and a path of gains to it", () => {
    let top = -Infinity;
    const result = searchAdversary({ ...options, budget: 80 }, (_, s) => (top = Math.max(top, s?.loss ?? -Infinity)));
    expect(result.worst!.score.loss).toBe(top);
    expect(result.path[0]!.move.startsWith("start ")).toBe(true);
    expect(result.path.at(-1)!.loss).toBe(top);
    for (let i = 1; i < result.path.length; i++) expect(result.path[i]!.loss).toBeGreaterThan(result.path[i - 1]!.loss);
  });

  it("refuses a bad budget, a bad cap and an unknown entry", () => {
    expect(() => searchAdversary({ ...options, budget: 0 })).toThrow(RangeError);
    expect(() => searchAdversary({ ...options, maxCount: 0 })).toThrow(RangeError);
    expect(() => searchAdversary({ ...options, a: "nothing" })).toThrow(RangeError);
  });
});

describe("the corpus pack-adversary-v1", () => {
  const text = readFileSync(ADVERSARY_FILE, "utf8");
  const file = readAdversaryCorpus(text);

  it("has the worst input of each pair, with its hash and the stamp of the search", () => {
    expect(file.schema).toBe("layout-corpus/1");
    expect(file.corpus).toBe(ADVERSARY_CORPUS);
    expect(file.found.map((f) => [f["a"], f["b"]])).toEqual(ADVERSARY_PAIRS.map(([a, b]) => [a, b]));
    expect(file.inputs).toHaveLength(ADVERSARY_PAIRS.length);
    for (const [i, input] of file.inputs.entries()) {
      const found = file.found[i]!;
      expectValid(input, ADVERSARY_MAX_COUNT);
      expect(input.id).toBe(found["input"]);
      expect(input.hash).toBe(found["hash"]);
      expect(input.set).toBe(ADVERSARY_CORPUS);
      expect(input.generator!.params).toMatchObject({ a: found["a"], b: found["b"], seed: 1 });
      expect(hardOf(found["winner"] as string, input)).toBe(0);
      expect(found["loss"]).toBeGreaterThan(0);
    }
  });

  it("matches a rerun of the search of one pair, byte for byte", () => {
    const result = searchAdversary(pairOptions(ADVERSARY_PAIRS[2]!));
    expect(text).toContain(`    ${foundLine(result)}`);
    expect(text).toContain(`    ${inputLine(result)!}`);
  });
});
