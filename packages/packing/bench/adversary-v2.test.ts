import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHard, checkInput, DEFAULT_TOLERANCE, hashInput, packWith, strategy, toPackInput, type GeneratedInput } from "@mark1russell7/packing";
import { ADVERSARY_MAX_COUNT, ADVERSARY_PAIRS, BEST, ORIGINS, type Loss } from "./adversary.ts";
import {
  ADVERSARY_V2_CORPUS,
  ADVERSARY_V2_FILE,
  ADVERSARY_V2_SHA256,
  adversaryV2Text,
  CELL_BUDGET,
  foundLineV2,
  movedRowsV2,
  originOf,
  pairOptionsV2,
  pairWorst,
  POOL_OUT,
  POOL_V2,
  readAdversaryV2,
  searchCell,
  searchCells,
  searchPair,
  storedRowsFaultV2,
  type CellResult,
} from "./adversary-v2.ts";
import { ENTRIES, entry, isComposite } from "./entries.ts";
import { random } from "@mark1russell7/rigor-generators";

// Version 2 of the adversarial search (roadmap item k164) and its corpus pack-adversary-v2. The tests read no time.

/** The options of a short search of the pair with the index 2, for the tests that start a search. */
const short = { ...pairOptionsV2(ADVERSARY_PAIRS[2]!), budget: 12 };

/** This function packs an input with an entry, as the runner does. */
function packEntry(id: string, file: GeneratedInput) {
  const e = entry(id);
  const s = strategy(e.strategy);
  const given = Object.keys(e.options).length === 0 ? undefined : { ...(s.defaults as Record<string, unknown>), ...e.options };
  const input = toPackInput(file);
  return { input, output: packWith(e.strategy, input, given, file.seed) };
}

describe("the cells of version 2", () => {
  it("has one cell for each form of each generator, and one cell for a generator with no form", () => {
    const keys = searchCells().map((c) => c.key);
    expect(keys).toHaveLength(17);
    for (const name of ["tall-row", "skyline-gap", "bl-trap", "half-wide"]) expect(keys.filter((k) => k.startsWith(`${name}.`))).toEqual([`${name}.fixed`, `${name}.freeHeight`]);
    expect(keys).toContain("ladder");
    for (const name of ["berkey-wang", "martello-vigo"]) {
      expect(keys.filter((k) => k.startsWith(`${name}.`))).toEqual(["fixed", "freeHeight", "freeAspect", "freeArea"].map((f) => `${name}.${f}`));
    }
    expect(new Set(searchCells().map((c) => c.generator))).toEqual(new Set(ORIGINS));
  });

  it("gives each origin the form of its cell", () => {
    for (const cell of searchCells()) {
      const origin = originOf(cell, ADVERSARY_MAX_COUNT, random(`test:${cell.key}`));
      expect(origin.generator).toBe(cell.generator);
      if (cell.form !== undefined) expect(origin.params["containerSize"]).toBe(cell.form);
    }
  });

  it("keeps the rows of the other cells byte-equal when a cell is added, removed or moved", () => {
    const cells = searchCells();
    const some = [cells[0]!, cells[5]!, cells[11]!];
    const before = searchPair(short, some).map(foundLineV2);
    const added = searchPair(short, [cells[16]!, ...some, cells[9]!]).map(foundLineV2);
    expect(added.slice(1, 4)).toEqual(before);
    const reversed = searchPair(short, [...some].reverse()).map(foundLineV2);
    expect(reversed.reverse()).toEqual(before);
    expect(searchPair(short, [some[1]!]).map(foundLineV2)).toEqual([before[1]]);
  }, 60_000);

  it("gives each cell its own budget, and the same row twice", () => {
    const cell = searchCells()[3]!;
    const one = searchCell(short, cell);
    expect(one.evaluations).toBe(short.budget);
    expect(foundLineV2(searchCell(short, cell))).toBe(foundLineV2(one));
    expect(CELL_BUDGET).toBe(400);
  }, 60_000);

  it("refuses a budget or a count that is not a whole number of 1 or more", () => {
    const cell = searchCells()[0]!;
    expect(() => searchCell({ ...short, budget: 0 }, cell)).toThrow(RangeError);
    expect(() => searchCell({ ...short, maxCount: 1.5 }, cell)).toThrow(RangeError);
  });
});

describe("the pool of best", () => {
  it("has each entry that is not composite in the pool or in the list of the entries out, and in no other place", () => {
    const singles = ENTRIES.filter((e) => !isComposite(e.id)).map((e) => e.id);
    const out = Object.keys(POOL_OUT);
    const neither = singles.filter((id) => !POOL_V2.includes(id) && !out.includes(id));
    expect(neither, `Put each new entry in POOL_V2 or in POOL_OUT of bench/adversary-v2.ts: ${neither.join(", ")}`).toEqual([]);
    expect(POOL_V2.filter((id) => out.includes(id))).toEqual([]);
    expect([...POOL_V2, ...out].filter((id) => !singles.includes(id))).toEqual([]);
    expect(POOL_V2).toEqual(singles.filter((id) => POOL_V2.includes(id)));
    expect(new Set(POOL_V2).size).toBe(POOL_V2.length);
  });

  it("reads only the entries of the pool", () => {
    const cell = searchCells()[0]!;
    const res = searchCell({ ...pairOptionsV2(["rows", BEST]), budget: 6, pool: ["skyline"] }, cell);
    expect(res.worst?.score.winner).toBe("skyline");
  }, 60_000);
});

describe("the worst row of a pair", () => {
  const made = (key: string, measure: Loss["measure"] | undefined, loss: number): CellResult => ({
    options: short,
    cell: { generator: key, key },
    evaluations: 1,
    valid: measure === undefined ? 0 : 1,
    starts: 1,
    worst: measure === undefined ? null : ({ score: { measure, loss } } as CellResult["worst"]),
    path: [],
  });

  it("keeps the largest loss of each measure, and the first cell of a tie", () => {
    const worst = pairWorst([made("a", "fill", 0.1), made("b", "gap", 0.3), made("c", "fill", 0.4), made("d", undefined, 0), made("e", "fill", 0.4), made("f", "gap", 0.2)]);
    expect(worst.fill?.cell.key).toBe("c");
    expect(worst.gap?.cell.key).toBe("b");
    expect(pairWorst([made("d", undefined, 0)])).toEqual({});
  });
});

describe("the corpus pack-adversary-v2", () => {
  const text = readFileSync(ADVERSARY_V2_FILE, "utf8");
  const file = readAdversaryV2(text);
  const cells = searchCells().map((c) => c.key);

  it("has one row for each cell of each pair, with the pool and the cells of the search", () => {
    expect(file.schema).toBe("layout-corpus/1");
    expect(file.corpus).toBe(ADVERSARY_V2_CORPUS);
    expect(file.search.cells).toEqual(cells);
    expect(file.search.pool).toEqual(POOL_V2);
    expect(file.search.budget).toBe(CELL_BUDGET);
    expect(file.found.map((f) => `${String(f["a"])}>${String(f["b"])}>${String(f["cell"])}`)).toEqual(ADVERSARY_PAIRS.flatMap(([a, b]) => cells.map((c) => `${a}>${b}>${c}`)));
  });

  it("has valid inputs with their hashes, and a winner with no break of a hard rule", () => {
    const rows = file.found.filter((f) => f["input"] !== null);
    expect(file.inputs).toHaveLength(rows.length);
    for (const [i, input] of file.inputs.entries()) {
      const found = rows[i]!;
      expect(checkInput(input)).toEqual([]);
      expect(input.boxes.length).toBeGreaterThanOrEqual(1);
      expect(input.boxes.length).toBeLessThanOrEqual(ADVERSARY_MAX_COUNT);
      expect(input.hash).toBe(hashInput(input));
      expect(input.generator?.version).toBe(2);
      expect(input.id).toBe(found["input"]);
      expect(input.hash).toBe(found["hash"]);
      expect(input.set).toBe(ADVERSARY_V2_CORPUS);
      expect(input.generator!.params).toMatchObject({ a: found["a"], b: found["b"], cell: found["cell"], seed: 1, budget: CELL_BUDGET });
      const { input: packed, output } = packEntry(found["winner"] as string, input);
      const breaks = Object.entries(checkHard(packed, output, DEFAULT_TOLERANCE)).filter(([, n]) => n > 0);
      expect(breaks, `${String(found["a"])} to ${String(found["b"])} in ${String(found["cell"])}: the winner breaks a hard rule`).toEqual([]);
    }
  });

  it("finds a loss above 0 of skyline to maxrects-bl in a free form that version 1 does not search", () => {
    const free = file.found.filter((f) => f["a"] === "skyline" && f["b"] === "maxrects-bl" && /\.(freeAspect|freeArea)$/.test(String(f["cell"])));
    expect(free.length).toBe(4);
    expect(Math.max(...free.map((f) => Number(f["loss"] ?? 0)))).toBeGreaterThan(0);
  });

  describe("the checks", () => {
    const run = (...args: readonly string[]) => spawnSync(process.execPath, ["--no-warnings", "bench/adversary-v2.ts", ...args], { encoding: "utf8" });
    const hash = file.found.find((f) => f["input"] !== null)!["hash"] as string;
    const other = text.replace(`"hash": "${hash}"`, `"hash": "${"0".repeat(hash.length)}"`);

    it("holds the stored rows: one changed value is a fault, and the search does not start", () => {
      expect(createHash("sha256").update(text).digest("hex")).toBe(ADVERSARY_V2_SHA256);
      expect(other).not.toBe(text);
      expect(storedRowsFaultV2(text)).toBeUndefined();
      expect(storedRowsFaultV2(other)).toContain(ADVERSARY_V2_CORPUS);
      const folder = mkdtempSync(join(tmpdir(), "adversary-v2-"));
      try {
        const changed = join(folder, "changed.json");
        writeFileSync(changed, other);
        expect(run("--rows").status).toBe(0);
        expect(run("--rows", "--file", changed).status).toBe(1);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }, 60_000);

    it("gives a line for a result that the text does not hold, and no line for one that it holds", () => {
      const result = searchCell(short, searchCells()[0]!);
      expect(movedRowsV2(adversaryV2Text([result]), [result])).toEqual([]);
      expect(movedRowsV2(`{"found": [], "inputs": []}`, [result])[0]).toContain("rows to maxrects-bl in tall-row.fixed: the search does not find the stored row.");
    }, 60_000);
  });
});
