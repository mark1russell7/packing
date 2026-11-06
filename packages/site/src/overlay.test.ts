import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isLater, overlayChoices, timeOfRecord } from "./overlay.ts";

const KNOWN = "gaps-pack-known-v1.json";
const known = readFileSync(new URL(`../data/${KNOWN}`, import.meta.url), "utf8");

/** This function gives the known file of `main` with no field `atMargin` and the same origin: the old file of the branch. */
function oldKnown(): string {
  const value = JSON.parse(known) as { strategies: { cells: { atMargin?: unknown }[] }[] };
  for (const s of value.strategies) for (const c of s.cells) delete c.atMargin;
  return JSON.stringify(value);
}

const record = (...origin: unknown[]): string => JSON.stringify({ origin });
const at = (date: string, run: number | null): { date: string; run: number | null } => ({ date, run });

describe("the time of a record", () => {
  it("reads the latest run of the origin", () => {
    expect(timeOfRecord(record(at("2026-10-28", 5), at("2026-10-28", 9), at("2026-10-27", 12)))).toEqual({ date: "2026-10-28", run: 9 });
    expect(timeOfRecord(record(at("2026-10-28", null)))).toEqual({ date: "2026-10-28", run: 0 });
  });

  it.each([
    ["no origin", "{}"],
    ["an empty origin", record()],
    ["an origin that is not a list", '{"origin":"2026-10-28"}'],
    ["no date", record({ run: 1 })],
    ["a date that does not read", record(at("2026-13-45", 1))],
    ["a time in place of a day", record(at("2026-10-28T10:00:00Z", 1))],
    ["a run that is text", record({ date: "2026-10-28", run: "1" })],
    ["a null entry", record(null)],
    ["JSON that is null", "null"],
    ["text that is not JSON", "{"],
  ])("does not read %s", (_name, text) => {
    expect(timeOfRecord(text)).toBeUndefined();
  });

  it("orders by the date, then by the run, and equal times are not later", () => {
    expect(isLater({ date: "2026-11-05", run: 1 }, { date: "2026-10-28", run: 9 })).toBe(true);
    expect(isLater({ date: "2026-10-28", run: 9 }, { date: "2026-10-28", run: 5 })).toBe(true);
    expect(isLater({ date: "2026-10-28", run: 5 }, { date: "2026-10-28", run: 5 })).toBe(false);
    expect(isLater({ date: "2026-10-27", run: 9 }, { date: "2026-10-28", run: 5 })).toBe(false);
  });
});

describe("the choice of each file", () => {
  const one = (branch: string, main?: string): ReturnType<typeof overlayChoices> =>
    overlayChoices(new Map([["a.json", branch]]), new Map(main === undefined ? [] : [["a.json", main]]));

  it("serves the file of main on a tie: the old known file has the same run and no margin", () => {
    expect(oldKnown()).not.toContain("atMargin");
    expect(timeOfRecord(oldKnown())).toEqual(timeOfRecord(known));
    const choices = overlayChoices(new Map([[KNOWN, oldKnown()]]), new Map([[KNOWN, known]]));
    expect(choices.take).toEqual([]);
    expect(choices.faults).toEqual([]);
    expect(choices.lines[0]).toContain(`${KNOWN}: from main`);
  });

  it("takes a later file of the branch, by the date and by the run of one day", () => {
    expect(one(record(at("2026-11-05", 1)), record(at("2026-10-28", 9))).take).toEqual(["a.json"]);
    expect(one(record(at("2026-10-28", 9)), record(at("2026-10-28", 5))).take).toEqual(["a.json"]);
  });

  it("keeps a file of main that is later", () => {
    expect(one(record(at("2026-10-28", 5)), record(at("2026-11-05", 1))).take).toEqual([]);
  });

  it("takes a file of the branch that is not on main", () => {
    expect(one(record(at("2026-10-28", 5))).take).toEqual(["a.json"]);
  });

  it("names the file and its side when a time does not read, and takes nothing of it", () => {
    const good = record(at("2026-10-28", 5));
    expect(one("{", good)).toMatchObject({ take: [], faults: ["a.json: the file of the branch has no readable time in its origin."] });
    expect(one(good, "{}")).toMatchObject({ take: [], faults: ["a.json: the file of main has no readable time in its origin."] });
  });

  it("does not read a later file as a pass of the data gate: a later file can lack a field", () => {
    const later = JSON.parse(oldKnown()) as { origin: { run: number; date: string }[] };
    later.origin[0]!.date = "2027-01-01";
    const choices = overlayChoices(new Map([[KNOWN, JSON.stringify(later)]]), new Map([[KNOWN, known]]));
    expect(choices.take).toEqual([KNOWN]);
  });

  it("gives one line for each file of the branch, in name order", () => {
    const good = record(at("2026-10-28", 5));
    const choices = overlayChoices(new Map([["b.json", good], ["a.json", good]]), new Map([["b.json", good]]));
    expect(choices.lines.map((l) => l.split(":")[0])).toEqual(["a.json", "b.json"]);
  });
});

describe("the command", () => {
  const script = fileURLToPath(new URL("../scripts/overlay.ts", import.meta.url));
  const folders: string[] = [];
  const folder = (files: Readonly<Record<string, string>>): string => {
    const path = mkdtempSync(join(tmpdir(), "overlay-"));
    folders.push(path);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(path, name), text);
    return path;
  };
  afterEach(() => {
    for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it("copies only the later files, and prints a line for each file", () => {
    const old = record(at("2026-10-28", 5));
    const late = record(at("2026-11-05", 7));
    const data = folder({ "a.json": old, "b.json": late, "own.json": "not read" });
    const out = execFileSync(process.execPath, ["--no-warnings", script, folder({ "a.json": late, "b.json": old, "c.json": late }), data], { encoding: "utf8" });
    expect(readFileSync(join(data, "a.json"), "utf8")).toBe(late);
    expect(readFileSync(join(data, "b.json"), "utf8")).toBe(late);
    expect(readFileSync(join(data, "c.json"), "utf8")).toBe(late);
    expect(readFileSync(join(data, "own.json"), "utf8")).toBe("not read");
    expect(out.trim().split("\n")).toHaveLength(3);
  });

  it("exits with 1, names the file and copies nothing when a time does not read", () => {
    const good = record(at("2026-11-05", 7));
    const data = folder({ "a.json": record(at("2026-10-28", 5)) });
    const done = spawnSync(process.execPath, ["--no-warnings", script, folder({ "a.json": good, "bad.json": "{}" }), data], { encoding: "utf8" });
    expect(done.status).toBe(1);
    expect(done.stderr).toContain("bad.json");
    expect(readFileSync(join(data, "a.json"), "utf8")).not.toBe(good);
    expect(existsSync(join(data, "bad.json"))).toBe(false);
  });
});

describe("each build that reads the branch", () => {
  const workflow = (name: string): string => readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");

  it.each(["pages.yml", "site-data.yml"])("uses the overlay in %s, and no direct copy over the data", (name) => {
    const text = workflow(name);
    expect(text).toContain("packages/site/scripts/overlay.ts");
    expect(text).not.toMatch(/tar -x -C (?:packages\/site\/data|"\$data")/);
  });
});
