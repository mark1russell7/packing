import { describe, expect, it } from "vitest";
import { MEASURE_SPECS } from "@mark1russell7/packing";
import { NOT_RUN_JOB, NOT_RUN_SIZE, OVER_BUDGET } from "./budget.ts";
import { controlRead, controlReadText, controlRows, controlRules, familyOf } from "./control-read.ts";
import { FILL_TRICK, KEEP_SHELF } from "./controls.ts";
import { NOT_RUN_BASE, type BenchRecord } from "./run.ts";

// The read of the controls on made-up records. The test reads no time.

const AS_OF = "2026-11-10";

/** The values of the measures that the read takes from a record. */
type Values = { fill: number; inversions: number; aspect: number };

/** This function gives a made-up measured record of an entry on one input. */
function measured(strategy: string, input: string, v: Values): BenchRecord {
  const measures = {
    "pack.fill": v.fill,
    "pack.order.inversions": v.inversions,
    "pack.aspectError": v.aspect,
    "pack.overflow.excessArea": 0,
    "pack.overflow": 0,
    "pack.balance.sideRange": 0.1,
    "pack.raggedness": 0.2,
  };
  return { strategy, input, measures } as unknown as BenchRecord;
}

/** This function gives a made-up skipped record of an entry on one input. */
function skipped(strategy: string, input: string, reason: string): BenchRecord {
  return { strategy, input, measures: {}, skipped: reason } as unknown as BenchRecord;
}

/** This function gives the id of one input of a made-up family. */
const inputId = (family: string, i: number): string => `made-up/${family}/s${i}`;

/** This function gives the records of a real entry and of a control that wins fill and loses order and aspect. */
function trickRecords(keys: number, family = "f"): BenchRecord[] {
  return Array.from({ length: keys }, (_, i) => [
    measured("real-a", inputId(family, i), { fill: 0.7 + i * 1e-3, inversions: 0.1 + i * 1e-4, aspect: 0.1 + i * 1e-4 }),
    measured("real-b", inputId(family, i), { fill: 0.75 + i * 1e-3, inversions: 0.2 + i * 1e-4, aspect: 0.2 + i * 1e-4 }),
    measured(FILL_TRICK, inputId(family, i), { fill: 0.95 + i * 1e-4, inversions: 0.6 + i * 1e-4, aspect: 2 + i * 1e-4 }),
  ]).flat();
}

/** This function gives records of a chain run: step 0 has no move value, and each later step has one. The control keeps each box and loses fill. */
function chainRecords(keys: number): BenchRecord[] {
  const row = (strategy: string, input: string, fill: number, moved?: number): BenchRecord => ({ strategy, input, measures: { "pack.fill": fill, ...(moved === undefined ? {} : { "pack.stability.moved": moved }) } }) as unknown as BenchRecord;
  return Array.from({ length: keys }, (_, i) => [
    row("push", inputId("root", i), 0.9),
    row(KEEP_SHELF, inputId("root", i), 0.9),
    row("push", inputId("step", i), 0.8 + i * 1e-3, 0.1 + i * 1e-3),
    row(KEEP_SHELF, inputId("step", i), 0.6 + i * 1e-3, i * 1e-4),
  ]).flat();
}

describe("the read of a chain run", () => {
  it("adds the rule of a step only when the records have a step", () => {
    expect(controlRules().map((r) => r.measure)).not.toContain("pack.stability.moved");
    expect(controlRules(trickRecords(3)).map((r) => r.measure)).not.toContain("pack.stability.moved");
    expect(controlRules(chainRecords(3)).find((r) => r.measure === "pack.stability.moved")).toMatchObject({ sense: "lower", controls: [KEEP_SHELF], partners: ["pack.fill"] });
  });

  it("keeps step 0 out of each measure, so that fill compares the same steps", () => {
    const rows = controlRows(chainRecords(3), false);
    expect(rows.filter((r) => r.key.includes("/root/"))).toEqual([]);
    expect(rows.filter((r) => r.measure === "pack.fill")).toHaveLength(6);
    expect(rows.filter((r) => r.measure === "pack.stability.moved")).toHaveLength(6);
  });

  it("reads the control as a win on the step measure, and the partner as lost", () => {
    const read = controlRead(chainRecords(12), AS_OF);
    const moved = read.pooled.reads.find((r) => r.measure === "pack.stability.moved" && r.control === KEEP_SHELF)!;
    expect(moved.status).toBe("wins");
    expect(read.pooled.findings.filter((f) => f.measure === "pack.stability.moved" && f.kind === "uncaught")).toEqual([]);
  });

  it("gives no finding of the control of a step to a run with no chain", () => {
    const read = controlRead(trickRecords(12), AS_OF);
    expect(read.pooled.findings.filter((f) => f.measure === "pack.stability.moved")).toEqual([]);
  });

  it("reads a lost base as a censored row", () => {
    const records = [...chainRecords(3), { strategy: "push", input: inputId("step", 5), measures: {}, skipped: NOT_RUN_BASE } as unknown as BenchRecord];
    expect(controlRows(records, false).filter((r) => r.censored === true)).toEqual([]);
    const withStep = [...records, { strategy: KEEP_SHELF, input: inputId("step", 5), measures: { "pack.stability.moved": 0, "pack.fill": 0.6 } } as unknown as BenchRecord];
    const censored = controlRows(withStep, false).filter((r) => r.censored === true);
    expect(censored.map((r) => r.measure).sort()).toEqual(controlRules(withStep).map((r) => r.measure).sort());
    expect(new Set(censored.map((r) => `${r.group}|${r.key}`))).toEqual(new Set([`push|${inputId("step", 5)}`]));
  });
});

describe("the rules of the read", () => {
  it("gives pack.fill its control and its partners", () => {
    const fill = controlRules().find((r) => r.measure === "pack.fill")!;
    expect(fill).toMatchObject({ sense: "higher", controls: [FILL_TRICK], resolution: MEASURE_SPECS["pack.fill"].minEffect });
    expect(fill.partners).toEqual(["pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea"]);
    expect(fill.noControl).toBeUndefined();
  });

  it("gives each other measure a reason and a date", () => {
    for (const rule of controlRules().filter((r) => r.controls.length === 0)) {
      expect(rule.noControl?.because).not.toBe("");
      expect(rule.noControl?.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has a rule for each partner that a rule names", () => {
    const rules = controlRules();
    const measures = new Set(rules.map((r) => r.measure));
    for (const rule of rules) for (const p of rule.partners) expect(measures.has(p)).toBe(true);
  });

  it("gives no resolution to a measure with a minimum effect of 0 or a relative one", () => {
    const by = new Map(controlRules().map((r) => [r.measure, r]));
    expect(by.get("pack.order.inversions")!.resolution).toBeUndefined();
    expect(by.get("pack.overflow")!.resolution).toBeUndefined();
  });

  it("takes the sense from the spec of each measure", () => {
    for (const rule of controlRules()) expect(rule.sense).toBe(MEASURE_SPECS[rule.measure as keyof typeof MEASURE_SPECS].direction);
  });
});

describe("the rows of the read", () => {
  it("reads the family from the middle of an input id", () => {
    expect(familyOf("pack-classes-v1/berkey-wang.I.fixed.n20/s1")).toBe("berkey-wang.I.fixed.n20");
    expect(familyOf("plain")).toBe("plain");
  });

  it("gives one row for each measure of a measured record, keyed by the input", () => {
    const rows = controlRows([measured("a", inputId("f", 1), { fill: 0.5, inversions: 0, aspect: 0 })], false);
    expect(rows.length).toBe(controlRules().length);
    expect(rows.every((r) => r.key === inputId("f", 1) && r.group === "a" && r.censored === undefined && r.stratum === undefined)).toBe(true);
  });

  it("puts the family on each row only with strata", () => {
    const record = measured("a", inputId("f", 1), { fill: 0.5, inversions: 0, aspect: 0 });
    expect(controlRows([record], true).every((r) => r.stratum === "f")).toBe(true);
  });

  it.each([OVER_BUDGET, NOT_RUN_SIZE, NOT_RUN_JOB, NOT_RUN_BASE])("gives censored rows for the reason %s", (reason) => {
    const rows = controlRows([skipped("a", inputId("f", 1), reason)], false);
    expect(rows.length).toBe(controlRules().length);
    expect(rows.every((r) => r.censored === true)).toBe(true);
  });

  it("gives no row for a refused pair", () => {
    expect(controlRows([skipped("a", inputId("f", 1), "unsupported containerSize: refused")], false)).toEqual([]);
  });

  it("leaves out a value that is not finite and a measure that is absent", () => {
    const record = { strategy: "a", input: inputId("f", 1), measures: { "pack.fill": Number.NaN, "pack.aspectError": 1 } } as unknown as BenchRecord;
    expect(controlRows([record], false).map((r) => r.measure)).toEqual(["pack.aspectError"]);
  });
});

describe("the read of the controls", () => {
  it("reads a caught trick in the pooled result", () => {
    const { pooled } = controlRead(trickRecords(40), AS_OF);
    const read = pooled.reads.find((r) => r.measure === "pack.fill")!;
    expect(read).toMatchObject({ control: FILL_TRICK, status: "wins", beatsEntries: 2, of: 2 });
    expect(pooled.findings.filter((f) => f.kind === "uncaught")).toEqual([]);
    const guard = pooled.measures.find((m) => m.measure === "pack.fill")!.guards[0]!;
    expect(guard.partners.find((p) => p.partner === "pack.aspectError")!.status).toBe("lost");
    expect(guard.partners.find((p) => p.partner === "pack.order.inversions")!.status).toBe("lost");
  });

  it("reads an uncaught trick when the control loses no partner", () => {
    const records = Array.from({ length: 40 }, (_, i) => [
      measured("real-a", inputId("f", i), { fill: 0.7 + i * 1e-3, inversions: 0.1 + i * 1e-4, aspect: 0.1 + i * 1e-4 }),
      measured(FILL_TRICK, inputId("f", i), { fill: 0.95 + i * 1e-4, inversions: 0.1 + i * 1e-4, aspect: 0.1 + i * 1e-4 }),
    ]).flat();
    expect(controlRead(records, AS_OF).pooled.findings.some((f) => f.kind === "uncaught" && f.measure === "pack.fill")).toBe(true);
  });

  it("keeps too-few in a small stratum beside a pooled read with power", () => {
    const records = [...trickRecords(5, "a"), ...trickRecords(5, "b"), ...trickRecords(5, "c"), ...trickRecords(5, "d")];
    const { pooled, stratified } = controlRead(records, AS_OF);
    expect(pooled.reads.find((r) => r.measure === "pack.fill")!.status).toBe("wins");
    const strata = stratified.reads.filter((r) => r.measure === "pack.fill");
    expect(strata.map((r) => r.stratum).sort()).toEqual(["a", "b", "c", "d"]);
    expect(strata.every((r) => r.status === "too-few")).toBe(true);
  });

  it("counts the censored keys of a stopped entry and compares on finished keys only", () => {
    const records = [...trickRecords(40), skipped(FILL_TRICK, inputId("big", 0), OVER_BUDGET), measured("real-a", inputId("big", 0), { fill: 0.99, inversions: 0, aspect: 0 })];
    const { pooled } = controlRead(records, AS_OF);
    const entries = pooled.measures.find((m) => m.measure === "pack.fill")!.entries;
    expect(entries.find((e) => e.group === FILL_TRICK)).toMatchObject({ finished: 40, censored: 1 });
    expect(pooled.reads.find((r) => r.measure === "pack.fill")!.against.every((c) => c.shared <= 41)).toBe(true);
  });

  it("gives a no-control read before the date and a late finding after it", () => {
    expect(controlRead(trickRecords(40), AS_OF).pooled.findings.filter((f) => f.kind === "control-late")).toEqual([]);
    const late = controlRead(trickRecords(40), "2027-01-01").pooled.findings.filter((f) => f.kind === "control-late");
    expect(late.length).toBe(controlRules().filter((r) => r.controls.length === 0).length);
  });

  it("gives no-rows when the records have no control", () => {
    const records = trickRecords(40).filter((r) => r.strategy !== FILL_TRICK);
    expect(controlRead(records, AS_OF).pooled.findings.some((f) => f.kind === "no-rows" && f.measure === "pack.fill")).toBe(true);
  });
});

describe("the text of the read", () => {
  const text = controlReadText(controlRead(trickRecords(40), AS_OF));

  it("states the date", () => {
    expect(text).toContain(`at ${AS_OF}`);
  });

  it("prints both results, with the count of entries that the control beats", () => {
    expect(text).toContain(`pooled pack.fill ${FILL_TRICK} all: wins, beats 2 of 2 real entries`);
    expect(text).toContain(`stratum pack.fill ${FILL_TRICK} f: wins, beats 2 of 2 real entries`);
  });

  it("prints the keys beside what a test needs", () => {
    expect(text).toMatch(/pooled pack\.fill fill-trick all: .* keys 40, needs \d+/);
  });

  it("prints the partners that the control loses", () => {
    expect(text).toMatch(/pooled pack\.fill fill-trick all partners: .*pack\.aspectError lost/);
  });

  it("prints each finding", () => {
    expect(controlReadText(controlRead(trickRecords(40), "2026-12-01"))).toContain("finding control-late");
  });
});
