import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHard, checkInput, DEFAULT_TOLERANCE, generator, hashInput, measure, mulberry32, packWith, strategy, toPackInput, type GeneratedInput } from "@mark1russell7/packing";
import {
  ADVERSARY_CORPUS,
  ADVERSARY_FILE,
  adversaryCorpusText,
  movedRows,
  storedRowsFault,
  ADVERSARY_MAX_COUNT,
  ADVERSARY_PAIRS,
  BEST,
  candidateFile,
  foundLine,
  lossOf,
  mutateSizes,
  pairOptions,
  ratioGap,
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

/** This function gives the text of a hard-rule failure of a stored row, or `undefined` when the row breaks no rule. */
function hardFault(a: unknown, b: unknown, winner: unknown, breaks: Readonly<Record<string, number>>): string | undefined {
  const rules = Object.entries(breaks).filter(([, count]) => count > 0);
  if (rules.length === 0) return undefined;
  const named = rules.map(([rule, count]) => `${rule} (${count})`).join(", ");
  return `Row ${String(a)} to ${String(b)}: the winner ${String(winner)} breaks ${named}. This is a strategy fault, not a corpus fault.`;
}

/** This function gives the value of the loss measure of an entry: the fill for a fixed size, else the gap. */
function valueOf(id: string, file: GeneratedInput): number {
  const { input, output } = packEntry(id, file);
  return file.container.fixed === "size" ? measure(input, output)["pack.fill"] : ratioGap(input, output)!;
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
      const { input: packed, output } = packEntry(found["winner"] as string, input);
      expect(hardFault(found["a"], found["b"], found["winner"], { ...checkHard(packed, output, DEFAULT_TOLERANCE) })).toBeUndefined();
      expect(found["loss"]).toBeGreaterThan(0);
    }
  });

  it("names the row and the rule in a hard-rule failure, and says that the strategy is at fault", () => {
    expect(hardFault("rows", "skyline", "skyline", { overlap: 0 })).toBeUndefined();
    const text = hardFault("rows", "skyline", "skyline", { overlap: 2, inside: 0 })!;
    expect(text).toContain("rows to skyline");
    expect(text).toContain("overlap (2)");
    expect(text).not.toContain("inside");
    expect(text).toContain("a strategy fault, not a corpus fault");
  });

  describe("the required hold", () => {
    const workflows = join(import.meta.dirname, "..", "..", "..", ".github", "workflows");
    const held = readFileSync(join(workflows, "adversary.yml"), "utf8");
    const ci = readFileSync(join(workflows, "ci.yml"), "utf8");
    const list = (name: string) => new RegExp(`^(?:${/'(.*)'/.exec(held.split("\n").find((line) => line.trim().startsWith(`${name}=`))!)![1]!})$`);
    const search = list("SEARCH");
    const report = list("REPORT");

    it("is a job of CI OK that cannot read as a skip", () => {
      expect(ci).toContain("uses: ./.github/workflows/adversary.yml");
      expect(ci).toMatch(/needs: \[[^\]]*\badversary\b[^\]]*\]/);
      expect(ci).not.toMatch(/ALLOW_SKIP:.*adversary/);
    });

    it("runs --check on each file of the search", () => {
      for (const path of [
        "packages/packing/bench/adversary.ts",
        "packages/packing/bench/corpora/pack-adversary-v1.json",
        "packages/packing/src/generators.ts",
        "packages/packing/src/layout-input.ts",
        "packages/packing/src/strategy.ts",
        "packages/packing/src/bounds.ts",
        "packages/packing/src/measures.ts",
        "packages/packing/src/check.ts",
        ".github/workflows/adversary.yml",
      ]) {
        expect(search.test(path), path).toBe(true);
      }
    });

    it("runs only --report on a file of a strategy, and nothing on the other files", () => {
      for (const path of ["packages/packing/src/skyline.ts", "packages/packing/src/maxrects.ts", "packages/packing/bench/entries.ts", "pnpm-lock.yaml"]) {
        expect(search.test(path), path).toBe(false);
        expect(report.test(path), path).toBe(true);
      }
      for (const path of ["docs/BENCH.md", "packages/packing/bench/run.ts", "packages/site/src/results.ts"]) {
        expect(search.test(path), path).toBe(false);
        expect(report.test(path), path).toBe(false);
      }
    });

    it("turns red on a change of the search alone", () => {
      const source = readFileSync(join(import.meta.dirname, "adversary.ts"), "utf8");
      expect(source).toContain("export const PARAM_SHARE = 0.2;");
      const changed = join(import.meta.dirname, `flip-${process.pid}-adversary.ts`);
      writeFileSync(changed, source.replace("export const PARAM_SHARE = 0.2;", "export const PARAM_SHARE = 0.25;"));
      try {
        const clean = spawnSync(process.execPath, ["--no-warnings", "bench/adversary.ts", "--check", "--pair", "2"], { encoding: "utf8" });
        const flipped = spawnSync(process.execPath, ["--no-warnings", changed, "--check", "--pair", "2"], { encoding: "utf8" });
        expect(clean.status).toBe(0);
        expect(flipped.status).toBe(1);
      } finally {
        rmSync(changed, { force: true });
      }
    }, 60_000);
  });

  describe("the two checks", () => {
    const run = (...args: readonly string[]) => spawnSync(process.execPath, ["--no-warnings", "bench/adversary.ts", ...args], { encoding: "utf8" });
    const hash = file.found[2]!["hash"] as string;
    const other = text.replace(`"hash": "${hash}"`, `"hash": "${"0".repeat(hash.length)}"`);

    it("holds the stored rows: one changed value is a fault, and the search does not start", () => {
      expect(other).not.toBe(text);
      expect(storedRowsFault(text)).toBeUndefined();
      expect(storedRowsFault(other)).toContain(ADVERSARY_CORPUS);
      const folder = mkdtempSync(join(tmpdir(), "adversary-check-"));
      try {
        const changed = join(folder, "changed.json");
        writeFileSync(changed, other);
        expect(run("--rows").status).toBe(0);
        expect(run("--rows", "--file", changed).status).toBe(1);
        expect(run("--check", "--pair", "2", "--file", changed).status).toBe(1);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }, 60_000);

    it("does not block a change of a strategy: the report names the row and exits 0, and the strict check exits 1", () => {
      const report = run("--report", "--pair", "2", "--fault");
      expect(report.status).toBe(0);
      expect(report.stdout).toContain("rows to maxrects-bl: the search does not find the stored row.");
      expect(report.stdout).toContain("1 of 1 rows moved.");
      expect(run("--rows").status).toBe(0);
      expect(run("--check", "--pair", "2", "--fault").status).toBe(1);
    }, 60_000);

    it("needs a read mode for a fault, so a fault cannot write the file", () => {
      const write = run("--fault", "--pair", "2");
      expect(write.status).not.toBe(0);
      expect(readFileSync(ADVERSARY_FILE, "utf8")).toBe(text);
    });
  });

  it("gives the same search of one pair twice, with no stored row in the test", () => {
    const options = pairOptions(ADVERSARY_PAIRS[2]!);
    expect(foundLine(searchAdversary(options))).toBe(foundLine(searchAdversary(options)));
  });

  it("gives a line for a result that the text does not hold, and no line for one that it holds", () => {
    const result = searchAdversary(pairOptions(ADVERSARY_PAIRS[2]!));
    expect(movedRows(adversaryCorpusText([result]), [result])).toEqual([]);
    expect(movedRows(`{"found": [], "inputs": []}`, [result])[0]).toContain("rows to maxrects-bl: the search does not find the stored row.");
  });
});
