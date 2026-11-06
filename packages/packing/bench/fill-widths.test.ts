import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpus } from "@mark1russell7/packing";
import { FILL_TRICK, FILL_TRICK_MEMBERS } from "./controls.ts";
import { driftOf, fillWidthRows, fillWidthsJson, recordDifferences, type FillWidthRow, type FillWidths } from "./fill-widths.ts";
import type { BenchRecord } from "./run.ts";

// The replay of the widths of the fill trick (k154). The file came from `node bench/main.ts fill-widths` over two runs.
// It matched `pack.area` and `outputHash` of each record of those runs. Do not write it again for a change of the
// code: a drift is a change of the control, and the control read of those runs no longer applies to it.
// The free corpus takes approximately a minute. Thus the check of each input starts only in CI, where `CI` is set.

const FILE = join(import.meta.dirname, "fixtures", "fill-trick-widths.json");
const fixture = JSON.parse(readFileSync(FILE, "utf8")) as FillWidths;
const inCi = (process.env["CI"] ?? "") !== "";

const row = (over: Partial<FillWidthRow> = {}): FillWidthRow => ({ id: "c/a/s1", member: "skyline", width: 40, area: 1200, outputHash: "h1", ...over });
const record = (over: Partial<{ input: string; area: number; outputHash: string; strategy: string }> = {}): BenchRecord =>
  ({ strategy: over.strategy ?? FILL_TRICK, input: over.input ?? "c/a/s1", measures: { "pack.area": over.area ?? 1200 }, outputHash: over.outputHash ?? "h1" }) as unknown as BenchRecord;

describe("the file of the fill widths", () => {
  it("has the inputs of its sets, in the order of the sets, and one run of each corpus", () => {
    expect(fixture.inputs.map((r) => r.id)).toEqual(fixture.sets.flatMap((set) => corpus(set.corpus, set.specs).inputs.map((file) => file.id)));
    expect(fixture.runs.map((r) => r.corpus)).toEqual(fixture.sets.map((s) => s.corpus));
    expect(fixture.runs.every((r) => r.run !== null)).toBe(true);
  });

  it("names only members of the trick, and a width only on a container with no shape", () => {
    const members = new Set(FILL_TRICK_MEMBERS.map((m) => m.id));
    for (const r of fixture.inputs) {
      expect(members.has(r.member), r.id).toBe(true);
      if (r.width !== null) expect(Number.isInteger(r.width) && r.width > 0, r.id).toBe(true);
    }
  });

  it("is the text that the command writes", () => {
    expect(fillWidthsJson(fixture)).toBe(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n"));
  });

  it("keeps the first input of each set", () => {
    for (const set of fixture.sets) {
      const first = fillWidthRows({ corpus: set.corpus, specs: [{ ...set.specs[0]!, seeds: [set.specs[0]!.seeds[0]!] }] });
      const stored = fixture.inputs.filter((r) => r.id === first[0]!.id);
      expect(driftOf(stored, first)).toEqual([]);
    }
  });

  describe.runIf(inCi)("in CI", () => {
    it(`keeps the member, the width and the output of each input (${fixture.inputs.length} inputs)`, { timeout: 900_000 }, () => {
      expect(driftOf(fixture.inputs, fixture.sets.flatMap(fillWidthRows))).toEqual([]);
    });
  });
});

describe("the drift of the fill widths", () => {
  it("gives nothing for equal rows", () => {
    expect(driftOf([row()], [row()])).toEqual([]);
  });

  it.each([
    ["the width", { width: 41 }],
    ["the member", { member: "maxrects" }],
    ["the width of the input", { width: null }],
    ["the area", { area: 1201 }],
    ["the output", { outputHash: "h2" }],
  ])("names the input when %s changes", (_, over) => {
    expect(driftOf([row()], [row(over)])).toEqual([expect.stringContaining("c/a/s1")]);
  });

  it("names a missing input and a count that differs", () => {
    expect(driftOf([row(), row({ id: "c/a/s2" })], [row()])).toEqual(["2 stored rows, 1 inputs", "c/a/s2: no input"]);
  });
});

describe("the differences from the records", () => {
  it("gives nothing when pack.area and outputHash agree", () => {
    expect(recordDifferences([row()], [record(), record({ strategy: "maxrects-bl", area: 9 })])).toEqual([]);
  });

  it("names another pack.area, another outputHash and a missing record", () => {
    expect(recordDifferences([row()], [record({ area: 1300 })])).toEqual(["c/a/s1: pack.area 1200, record 1300"]);
    expect(recordDifferences([row()], [record({ outputHash: "h9" })])).toEqual(["c/a/s1: outputHash h1, record h9"]);
    expect(recordDifferences([row()], [])).toEqual([`c/a/s1: no measured record of ${FILL_TRICK}`, `0 measured records of ${FILL_TRICK}, 1 inputs`]);
  });
});
