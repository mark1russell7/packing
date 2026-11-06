// The tests of the data gate: the old file of the data branch goes red with its field, a clean copy stays green,
// and a removed or a changed field of each real file gives a fault with its path.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { regionsOf } from "./atlas-model.ts";
import { CORPORA_OF_FILE, DATA_READERS, gateLines, NEW_FIELD_ORDER, readDataFiles, replaceLine } from "./data-gate.ts";
import { SNAPSHOT_SHAPES } from "./data-shapes.ts";
import { parseLawCover, parseSnapshot, parseSolvedRule, type GapSnapshot, type StrategySnapshot } from "./data.ts";
import { DataFileError, faultsOf, fields, either, list, nullable, num, oneOf, optional, recordOf, text, type Shape } from "./data-shape.ts";

const DATA = new URL("../data/", import.meta.url);
const OLD_KNOWN = readFileSync(new URL("./fixtures/gaps-pack-known-no-margin.json", import.meta.url), "utf8");
const main = (): Map<string, string> => new Map(readdirSync(DATA).map((name) => [name, readFileSync(new URL(name, DATA), "utf8")]));
const KNOWN = "gaps-pack-known-v1.json";

/** The keys that a real file holds and can leave out: optional fields, and keys of a free record. */
const FREE_KEYS = new Set(
  "byInput configs kinds means missed ms p pack.fill pack.gap pack.gapToOpt pack.overflow.excessArea placed.free pooled sampled sharesByInput signs strata strategies stratified strip.area uniform".split(" "),
);

/** The fields of `data/law-cover.json` that the page reads. The script of the file reads the other fields. */
const LAW_READ = ["covered", "pairs", "specs", "refused", "floor"];

type Json = Record<string, unknown> | unknown[];

/** This function gives the path of each key of a value, with no key of a free record. */
function pathsOf(value: unknown, path: readonly (string | number)[] = []): (readonly (string | number)[])[] {
  if (Array.isArray(value)) return value.slice(0, 2).flatMap((item, i) => pathsOf(item, [...path, i]));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [[...path, key], ...pathsOf(item, [...path, key])]);
}

/** This function gives the text of a path, in the form of a field of a fault. */
const fieldOf = (path: readonly (string | number)[]): string => path.reduce<string>((at, p) => (typeof p === "number" ? `${at}[${p}]` : at === "" ? p : `${at}.${p}`), "");

/** This function changes the value at a path with a function, on a copy. */
function changed(text: string, path: readonly (string | number)[], change: (parent: Json, key: string | number) => void): string {
  const value = JSON.parse(text) as Json;
  let at = value as Record<string | number, unknown>;
  for (const p of path.slice(0, -1)) at = at[p] as Record<string | number, unknown>;
  change(at as Json, path.at(-1)!);
  return JSON.stringify(value);
}

/** This function gives the fields of the faults of a text with a reader. */
function faultFields(read: (t: string) => unknown, text: string): string[] {
  try {
    read(text);
    return [];
  } catch (error) {
    return error instanceof DataFileError ? error.faults.map((f) => f.field) : ["the file"];
  }
}

describe("the data gate on a folder", () => {
  it("reads each file of main with no fault", () => {
    const read = readDataFiles(main());
    expect(read.files).toBe(Object.keys(DATA_READERS).length);
    expect(read.faults).toEqual([]);
  });

  it("goes red on the old file of the data branch, and names the file and the field", () => {
    const read = readDataFiles(new Map([...main(), [KNOWN, OLD_KNOWN]]));
    expect(read.faults).toHaveLength(48);
    expect(read.faults[0]).toMatchObject({ file: KNOWN, field: "strategies[0].cells[0].atMargin" });
    const lines = gateLines(read);
    expect(lines[0]).toBe(
      `FAULT ${KNOWN}: strategies[0].cells[0].atMargin is missing: a measured cell of a current measure needs its read at the margin (48 fields of this form)`,
    );
    expect(lines[1]).toBe("Data gate: 14 files read, 48 faults.");
  });

  it("stays green on a clean copy of that file", () => {
    const files = main();
    expect(readDataFiles(new Map([...files, [KNOWN, `${files.get(KNOWN)!}\n`]])).faults).toEqual([]);
  });

  it("names a missing file, a file with no reader and a text that is not JSON", () => {
    const files = main();
    files.delete(KNOWN);
    expect(readDataFiles(files).faults).toContainEqual({ file: KNOWN, field: "the file", reason: "is missing" });
    expect(readDataFiles(new Map([...main(), ["new.json", "{}"]])).faults).toContainEqual({ file: "new.json", field: "the file", reason: "has no reader, so no page reads it" });
    expect(readDataFiles(new Map([...main(), [KNOWN, "{"]])).faults[0]).toMatchObject({ file: KNOWN, field: "the file" });
  });

  it("goes red on a margin that is not the margin of the rule, and on a measure with no margin", () => {
    const snap = JSON.parse(main().get(KNOWN)!) as GapSnapshot;
    snap.strategies[0]!.cells[0]!.atMargin = { limit: 1, n: 0 };
    const read = readDataFiles(new Map([...main(), [KNOWN, JSON.stringify(snap)]]));
    expect(read.faults).toHaveLength(1);
    expect(read.faults[0]).toMatchObject({ file: KNOWN, field: "strategies[0].cells[0].atMargin.limit" });
    const rule = JSON.parse(main().get("solved-rule.json")!) as { margins: Record<string, unknown> };
    delete rule.margins["pack.gapToOpt"];
    expect(readDataFiles(new Map([...main(), ["solved-rule.json", JSON.stringify(rule)]])).faults).toContainEqual({
      file: "solved-rule.json",
      field: "margins.pack.gapToOpt",
      reason: `is missing, so ${KNOWN} does not read`,
    });
  });
});

describe("the order of a new field", () => {
  const old = JSON.parse(OLD_KNOWN) as GapSnapshot;

  it("first accepts a missing field as not read, so a pull request can merge before the data branch has the field", () => {
    expect(faultsOf(SNAPSHOT_SHAPES.gaps as Shape<unknown>, old)).toEqual([]);
    const regions = regionsOf(old, parseSolvedRule(main().get("solved-rule.json")!));
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((r) => r.state === "not-read")).toBe(true);
  });

  it("then requires the field: a file with the field passes, and a file with no field names the order", () => {
    expect(readDataFiles(main()).faults).toEqual([]);
    const lines = gateLines(readDataFiles(new Map([...main(), [KNOWN, OLD_KNOWN]])));
    expect(lines).toContain(NEW_FIELD_ORDER);
    expect(lines).toContain('REPLACE gaps-pack-known-v1.json: gh workflow run site-data.yml -R mark1russell7/packing --ref main -f runs="pack-known-v1=<id of a finished bench run on main>"');
    expect(NEW_FIELD_ORDER).toMatch(/accepts a missing field as `not read`\. Merge, start the workflow `Site data`, and then make the reader require the field/);
  });

  it("does not print the order with no fault", () => {
    expect(gateLines(readDataFiles(main()))).not.toContain(NEW_FIELD_ORDER);
  });
});

describe("the files that start the read of the data branch on a pull request", () => {
  const SITE = new URL("../", import.meta.url);
  const workflow = readFileSync(new URL("../../../.github/workflows/site-check.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("id: reader");
  const listed = workflow.slice(start, workflow.indexOf("- name:", start)).split("\n").map((line) => line.trim()).filter((line) => line.startsWith("packages/"));

  /** This function gives each file of the site that the gate reads, from the local imports of the gate and of the overlay. */
  function closure(...from: string[]): Set<string> {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const [, path] of readFileSync(new URL(file, SITE), "utf8").matchAll(/from "(\.[^"]+\.ts)"/g)) {
        walk(new URL(path!, new URL(file, "file:///")).pathname.slice(1));
      }
    };
    for (const file of from) walk(file);
    return seen;
  }

  it("lists each file that the gate imports, so a change of the reader cannot skip the read", () => {
    const files = [...closure("scripts/data-gate.ts", "scripts/overlay.ts")];
    expect(files).toContain("src/data-shapes.ts");
    expect(files).toContain("src/overlay.ts");
    expect(files.filter((file) => !listed.includes(`packages/site/${file}`))).toEqual([]);
  });

  it("lists no file outside the gate, so a change of a page does not wait for a queued run of the data", () => {
    const files = closure("scripts/data-gate.ts", "scripts/overlay.ts");
    expect(listed.filter((path) => path.startsWith("packages/site/src/") || path.startsWith("packages/site/scripts/")).filter((path) => !files.has(path.slice("packages/site/".length)))).toEqual([]);
  });
});

describe("the count of the fields with a value and the state not read", () => {
  it("counts the cells of the regions of an old run of the measure", () => {
    const lines = gateLines(readDataFiles(main()));
    expect(lines).toContain("  gaps-pack-select-v2.json: 66 atlas cells with a median, in 12 regions");
  });

  it("counts one more field for a reason that loses its word, and states the total", () => {
    const name = "strategies-pack-free-v1.json";
    const snap = JSON.parse(main().get(name)!) as StrategySnapshot;
    const entry = snap.strategies.find((s) => s.skipped > 0)!;
    const fieldsWith = (word?: "other algorithm" | "not read"): number => {
      entry.reasons = [{ reason: "refused: a reason of this test", count: entry.skipped, ...(word === undefined ? {} : { word }) }];
      return readDataFiles(new Map([...main(), [name, JSON.stringify(snap)]])).notRead.find((c) => c.file === name)?.fields ?? 0;
    };
    const before = fieldsWith("other algorithm");
    expect(fieldsWith()).toBe(before + 1);
    expect(fieldsWith("not read")).toBe(before + 1);
    const read = readDataFiles(new Map([...main(), [name, JSON.stringify(snap)]]));
    const total = read.notRead.reduce((n, c) => n + c.fields, 0);
    expect(gateLines(read)).toContain(`Fields with a value and the state not read: ${total}.`);
  });

  it("is zero for no count, and the line stays", () => {
    expect(gateLines({ files: 1, faults: [], notRead: [] })).toEqual(["Data gate: 1 files read, 0 faults.", "Fields with a value and the state not read: 0."]);
  });
});

describe("each field of each real file", () => {
  const files = main();
  // The record of the explorer has its own deep reader in the package of statistics.
  const names = Object.keys(DATA_READERS).filter((n) => n !== "response-coverage.json");
  /** This function tells if the fault names the path. A fault of the head of a file has its own text, with no path. */
  const named = (faults: readonly string[], path: readonly (string | number)[]): boolean => faults.includes(fieldOf(path)) || path.length === 1 || path[0] === "origin";
  /** This function gives the paths that the reader of a file reads. */
  const pathsOfFile = (name: string, text: string): (readonly (string | number)[])[] =>
    pathsOf(JSON.parse(text)).filter((path) => name !== "law-cover.json" || LAW_READ.includes(String(path[0])));

  for (const name of names) {
    it(`${name}: a removed field gives a fault with its path, or it is a free key`, () => {
      const text = files.get(name)!;
      const required = pathsOfFile(name, text).filter((path) => {
        const faults = faultFields(DATA_READERS[name]!, changed(text, path, (parent, key) => void delete (parent as Record<string | number, unknown>)[key]));
        if (faults.length === 0) expect(FREE_KEYS, `${name}: ${fieldOf(path)}`).toContain(String(path.at(-1)));
        else expect(named(faults, path), `${name}: ${fieldOf(path)}`).toBe(true);
        return faults.length > 0;
      });
      expect(required.length).toBeGreaterThan(0);
    });

    it(`${name}: a number or a text that turns into a list gives a fault with its path`, () => {
      const text = files.get(name)!;
      const value = JSON.parse(text) as unknown;
      const leaves = pathsOfFile(name, text).filter((path) => {
        const item = path.reduce<unknown>((at, p) => (at as Record<string | number, unknown>)[p], value);
        return typeof item === "number" || typeof item === "string";
      });
      expect(leaves.length).toBeGreaterThan(0);
      for (const path of leaves) {
        const faults = faultFields(DATA_READERS[name]!, changed(text, path, (parent, key) => void ((parent as Record<string | number, unknown>)[key] = [])));
        expect(named(faults, path) && faults.length > 0, `${name}: ${fieldOf(path)}`).toBe(true);
      }
    });
  }
});

describe("the readers of the page", () => {
  it("throws for a deep field, with its path in the message", () => {
    const snap = JSON.parse(readFileSync(new URL("strategies-pack-free-v1.json", DATA), "utf8")) as StrategySnapshot;
    delete (snap.strategies[1] as Partial<StrategySnapshot["strategies"][number]>).records;
    expect(() => parseSnapshot(JSON.stringify(snap), "strategies")).toThrow(/strategies\[1\]\.records is missing/);
  });

  it("reads the rule and the law count with a shape", () => {
    expect(() => parseSolvedRule("{}")).toThrow(/schema is missing/);
    expect(() => parseLawCover("{}")).toThrow(/covered is missing/);
  });
});

describe("the shapes", () => {
  const shape: Shape<unknown> = fields<{ a: string; b?: number; c: number | null; d: "x"; e: string[]; f: Record<string, number>; g: number | string }>({
    a: text,
    b: optional(num),
    c: nullable(num),
    d: oneOf("x"),
    e: list(text),
    f: recordOf(num),
    g: either(num, text),
  }) as Shape<unknown>;
  const good = { a: "a", c: null, d: "x", e: ["e"], f: { k: 1 }, g: 1 };

  it("passes a good value, with a free key beside it", () => {
    expect(faultsOf(shape, good)).toEqual([]);
    expect(faultsOf(shape, { ...good, b: 2, free: true })).toEqual([]);
  });

  it.each([
    [{ ...good, a: 1 }, "a", "is not a string"],
    [{ ...good, b: "b" }, "b", "is not a number"],
    [{ ...good, c: "c" }, "c", "is not a number"],
    [{ ...good, d: "y" }, "d", "is not one of x"],
    [{ ...good, e: "e" }, "e", "is not a list"],
    [{ ...good, e: [1] }, "e[0]", "is not a string"],
    [{ ...good, f: [] }, "f", "is not an object"],
    [{ ...good, f: { k: "v" } }, "f.k", "is not a number"],
    [{ ...good, g: true }, "g", "is not a number"],
    [[], "the file", "is not an object"],
  ])("gives the field and the reason of %j", (value, field, reason) => {
    expect(faultsOf(shape, value)).toEqual([{ field, reason }]);
  });

  it("does not compile with a field of the type that has no shape", () => {
    // @ts-expect-error A field with no `?` needs a shape.
    expect(fields<{ a: string }>({})).toBeTypeOf("function");
  });

  it("names a missing field", () => {
    const { a: _a, ...rest } = good;
    expect(faultsOf(shape, rest)).toEqual([{ field: "a", reason: "is missing" }]);
  });
});

describe("the line that replaces a file with a fault", () => {
  const workflow = readFileSync(new URL("../../../.github/workflows/site-data.yml", import.meta.url), "utf8");

  it("names only corpora that the workflow reads, and only files with a reader", () => {
    for (const [file, corpora] of Object.entries(CORPORA_OF_FILE)) {
      expect(DATA_READERS[file]).toBeDefined();
      for (const corpus of corpora) expect(workflow).toMatch(new RegExp(`(^|[\\s|])${corpus}( \\||\\))`, "m"));
    }
  });

  it("gives each run of the table of the selector", () => {
    expect(replaceLine("select-table.json")).toContain("pack-screen-v1=<id of a finished bench run on main> pack-free-v1=<id of a finished bench run on main> pack-select-v1=<id of a finished bench run on main> pack-select-v2=<id of a finished bench run on main>");
  });

  it("sends a file of main to a pull request, and gives no line for a file with no reader", () => {
    expect(replaceLine("solved-rule.json")).toBe("REPLACE solved-rule.json: this file lands from main, so a pull request replaces it.");
    expect(replaceLine("new.json")).toBeUndefined();
  });

  it("gives each file one line, also with many faults, and no line with no fault", () => {
    const lines = gateLines(readDataFiles(new Map([...main(), [KNOWN, OLD_KNOWN]])));
    expect(lines.filter((l) => l.startsWith(`REPLACE ${KNOWN}:`))).toHaveLength(1);
    expect(gateLines(readDataFiles(main())).filter((l) => l.startsWith("REPLACE"))).toEqual([]);
  });
});
