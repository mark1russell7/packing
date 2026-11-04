import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveSizeGate,
  measureSizes,
  parseSizeGate,
  publishedExports,
  sizeBudget,
  sizeCoverage,
  sizeMarkdown,
  sizeVerdict,
  type PublishedPackage,
  type SizeEntry,
  type SizeGate,
} from "./size-gate.ts";

const entry = (specifier: string, measured: number, budget: number): SizeEntry => ({ specifier, file: `out/${specifier}.js`, import: "f", measured, budget });
const gate = (entries: SizeEntry[]): SizeGate => ({ schema: "size-gate/1", rule: "r", bundler: "b", commit: "c", entries });

describe("size gate", () => {
  it("gives a budget of the gzip bytes plus 5 %, rounded up to a whole KiB", () => {
    expect(sizeBudget(11176)).toBe(12288);
    expect(sizeBudget(1024)).toBe(2048);
    expect(sizeBudget(975)).toBe(1024);
    expect(sizeBudget(100, 0, 100)).toBe(100);
  });

  it("passes when each entry is within its budget, and fails when one is above", () => {
    const entries = [entry("a", 1000, 2048), entry("b", 1000, 2048)];
    const pass = sizeVerdict(entries, [{ specifier: "a", raw: 3000, gzip: 1100 }, { specifier: "b", raw: 3000, gzip: 2048 }]);
    expect(pass.verdict).toBe("pass");
    expect(pass.rows.map((r) => [r.outcome, r.change])).toEqual([["within", 0.1], ["within", 1.048]]);
    const fail = sizeVerdict(entries, [{ specifier: "a", raw: 3000, gzip: 1100 }, { specifier: "b", raw: 3000, gzip: 2049 }]);
    expect(fail.verdict).toBe("fail");
    expect(fail.reasons).toEqual(["b is 2049 bytes gzip, above its budget of 2048."]);
  });

  it("fails a size more than 5 % under its record, so the same change lowers the budget", () => {
    const entries = [entry("a", 1000, 2048)];
    expect(sizeVerdict(entries, [{ specifier: "a", raw: 3000, gzip: 950 }]).verdict).toBe("pass");
    const low = sizeVerdict(entries, [{ specifier: "a", raw: 3000, gzip: 949 }]);
    expect(low.rows[0]!.outcome).toBe("below");
    expect(low.reasons).toEqual(["a is 949 bytes gzip, more than 5 % under its record of 1000. Lower its budget in this change: node bench/main.ts size-gate --derive."]);
    expect(sizeVerdict(entries, [{ specifier: "a", raw: 3000, gzip: 949 }], [], 0.1).verdict).toBe("pass");
  });

  it("fails closed on a missing measure or a coverage reason", () => {
    expect(sizeVerdict([entry("a", 1, 2)], []).reasons).toEqual(["The entry a has no measure."]);
    expect(sizeVerdict([entry("a", 1, 2)], [{ specifier: "a", raw: 1, gzip: 1 }], ["gap"]).verdict).toBe("fail");
  });

  it("needs one entry for each export, with the file of the export", () => {
    const entries = [entry("a", 1, 2), entry("c", 1, 2)];
    expect(sizeCoverage(entries, { a: "out/a.js", b: "out/b.js", c: "other.js" })).toEqual([
      "The export b has no entry in the size gate.",
      "The entry c names the file out/c.js, but the export is other.js.",
    ]);
    expect(sizeCoverage([entry("a", 1, 2), entry("z", 1, 2)], { a: "out/a.js" })).toEqual(["The entry z is not a published export."]);
  });

  it("measures the raw and the gzip bytes of each bundle", async () => {
    const code = new TextEncoder().encode("x".repeat(500));
    const m = await measureSizes([entry("a", 1, 2)], async (file, name) => {
      expect([file, name]).toEqual(["out/a.js", "f"]);
      return code;
    });
    expect(m).toHaveLength(1);
    expect(m[0]!.raw).toBe(500);
    expect(m[0]!.gzip).toBeGreaterThan(0);
    expect(m[0]!.gzip).toBeLessThan(500);
  });

  it("derives the measures and the budgets, and keeps the other fields", () => {
    const next = deriveSizeGate(gate([entry("a", 1, 2)]), [{ specifier: "a", raw: 5000, gzip: 3000 }], "abc");
    expect(next.commit).toBe("abc");
    expect(next.entries[0]).toEqual({ ...entry("a", 1, 2), measured: 3000, budget: 4096 });
    expect(() => deriveSizeGate(gate([entry("a", 1, 2)]), [], "abc")).toThrow("has no measure");
  });

  it("refuses a record of the wrong schema or with a bad entry", () => {
    expect(() => parseSizeGate(JSON.stringify({ ...gate([entry("a", 1, 2)]), schema: "x" }))).toThrow("schema");
    expect(() => parseSizeGate(JSON.stringify(gate([])))).toThrow("one entry");
    expect(() => parseSizeGate(JSON.stringify(gate([{ ...entry("a", 1, 2), import: "" }])))).toThrow("import");
    expect(() => parseSizeGate(JSON.stringify(gate([entry("a", 1, 2.5)])))).toThrow("budget");
  });

  it("reads the published code exports, with publishConfig before exports", () => {
    const exports = { ".": "./src/index.ts", "./a": { default: "./src/a.ts" } };
    expect(publishedExports({ name: "p", exports })).toEqual({ p: "src/index.ts", "p/a": "src/a.ts" });
    expect(publishedExports({ name: "p", exports: { ...exports, "./data.json": "./data.json" } })).toEqual({ p: "src/index.ts", "p/a": "src/a.ts" });
    expect(publishedExports({ name: "p", exports, publishConfig: { exports: { ".": { default: "./build/index.js" }, "./package.json": "./package.json" } } })).toEqual({ p: "build/index.js" });
  });

  it("writes a Markdown table with the reasons", () => {
    const md = sizeMarkdown(sizeVerdict([entry("a", 1000, 1024)], [{ specifier: "a", raw: 2000, gzip: 1100 }]));
    expect(md).toContain("## Size gate: fail");
    expect(md).toContain("| `a` | 2000 | 1100 | 1024 | 10.00 % | above |");
    expect(md).toContain("- a is 1100 bytes gzip, above its budget of 1024.");
  });
});

describe("the size gate record of packing (bench/gates/size.json)", () => {
  const record = parseSizeGate(readFileSync(new URL("gates/size.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PublishedPackage;

  it("has one entry for each published code export", () => {
    expect(sizeCoverage(record.entries, publishedExports(pkg))).toEqual([]);
  });

  it("has each budget from the rule of the record", () => {
    for (const e of record.entries) expect([e.specifier, e.budget]).toEqual([e.specifier, sizeBudget(e.measured)]);
  });
});
