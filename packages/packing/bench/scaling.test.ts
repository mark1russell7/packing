import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import type { PairedReport } from "./paired-time.ts";
import { countOf, fitScaling, growthExponents, MIN_RUNGS, pairedMemoryRows, pairedTimeRows, readingOf, recordRows, reportsOf, scalingMarkdown, scalingReport, type ScalingRow } from "./scaling.ts";

const LADDER = [10, 20, 40, 80, 160, 320, 640, 1280, 2560];
const RUNS = 400;

/** This function makes the made-up rows of one arm: 5 seeds on each rung, with a log noise of `sd` around `f(n)`. */
function rows(f: (n: number) => number, sd = 0.03, seed = "rows", ns: readonly number[] = LADDER): ScalingRow[] {
  const r = random(seed);
  return ns.flatMap((n) => Array.from({ length: 5 }, () => ({ arm: "a", n, value: f(n) * Math.exp(r.normal(0, sd)) })));
}

describe("countOf", () => {
  it("gives the box count of each rung of ladder.count", () => {
    expect(countOf("pack-worst-v1/ladder.count.r0/s1")).toBe(10);
    expect(countOf("pack-worst-v1/ladder.count.r8/s5")).toBe(2560);
  });

  it("leaves out the other inputs", () => {
    expect(countOf("pack-worst-v1/ladder.ratio.r2.n100/s1")).toBeUndefined();
    expect(countOf("pack-worst-v1/tall-row.r1.fixed.n100/s1")).toBeUndefined();
  });
});

describe("recordRows", () => {
  it("reads the measured records of the ladder", () => {
    const lines = [
      { strategy: "rows", input: "c/ladder.count.r1/s1", ms: 2 },
      { strategy: "push", input: "c/ladder.count.r1/s1", skipped: "unsupported" },
      { strategy: "rows", input: "c/ladder.ratio.r1.n100/s1", ms: 3 },
    ];
    expect(recordRows(`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`)).toEqual([{ arm: "rows", n: 20, value: 2 }]);
  });
});

describe("fitScaling", () => {
  it.each([
    [1, "n"],
    [1.5, "n^1.5"],
    [2, "n^2"],
    [3, "n^3"],
  ])("finds the known exponent %d", (exponent, growth) => {
    const fit = fitScaling("a", rows((n) => 0.01 * n ** exponent, 0.03, `known ${exponent}`), RUNS);
    expect(fit.exponent!.estimate).toBeCloseTo(exponent, 1);
    expect(fit.exponent!.low).toBeLessThanOrEqual(exponent);
    expect(fit.exponent!.high).toBeGreaterThanOrEqual(exponent);
    expect(fit.reading).toEqual({ verdict: "one", growths: [growth] });
  });

  it("gives the same report for the same rows", () => {
    const data = rows((n) => n);
    expect(fitScaling("a", data, RUNS)).toEqual(fitScaling("a", data, RUNS));
  });

  it("holds the true exponent in most intervals, with noise on the rungs", () => {
    let held = 0;
    const sets = 100;
    for (let s = 0; s < sets; s++) {
      const r = random(`coverage ${s}`);
      const data = LADDER.flatMap((n) => {
        const rung = r.normal(0, 0.1);
        return Array.from({ length: 5 }, () => ({ arm: "a", n, value: n ** 1.5 * Math.exp(rung + r.normal(0, 0.05)) }));
      });
      const { exponent } = fitScaling("a", data, 200);
      if (exponent!.low <= 1.5 && exponent!.high >= 1.5) held++;
    }
    expect(held / sets).toBeGreaterThanOrEqual(0.8);
  }, 60_000);

  it("drops a value that a log cannot take, and counts it", () => {
    const data = [...rows((n) => n), { arm: "a", n: 10, value: 0 }];
    const fit = fitScaling("a", data, RUNS);
    expect(fit.dropped).toBe(1);
    expect(fit.rows).toBe(45);
  });

  it("gives no exponent with too few rungs", () => {
    const fit = fitScaling("a", rows((n) => n, 0.03, "few", LADDER.slice(0, MIN_RUNGS - 1)), RUNS);
    expect(fit.exponent).toBeNull();
    expect(fit.reading).toEqual({ verdict: "too-few-rungs", growths: [] });
    expect(fit.nMax).toBe(80);
  });

  it("names no growth from a range of n that is too narrow", () => {
    const fit = fitScaling("a", rows((n) => n ** 2, 0.1, "narrow", [100, 110, 120, 130, 140, 150, 160]), RUNS);
    expect(fit.reading.verdict).toBe("several");
  });

  it("names no growth when the noise is large for the range", () => {
    const fit = fitScaling("a", rows((n) => n, 1.5, "noisy", LADDER.slice(2, 7)), RUNS);
    expect(fit.reading.verdict).not.toBe("one");
  });

  it("calls a sum of two growths curved, and reads the upper half", () => {
    const fit = fitScaling("a", rows((n) => 1000 * n + n ** 2, 0.02, "sum"), RUNS);
    expect(fit.reading.verdict).toBe("curved");
    expect(fit.reading.growths).toContain("n^1.5");
    expect(fit.curve!.low).toBeGreaterThan(0);
    expect(fit.low!).toBeLessThan(fit.high!.estimate);
  });

  it("reads a power law as one growth, even with a tiny noise", () => {
    const fit = fitScaling("a", rows((n) => n, 0.002, "tiny"), RUNS);
    expect(fit.reading).toEqual({ verdict: "one", growths: ["n"] });
  });

  it("separates n log n from n on the full ladder, and does not call it curved", () => {
    const fit = fitScaling("a", rows((n) => n * Math.log(n), 0.01, "sort"), RUNS);
    expect(fit.reading).toEqual({ verdict: "one", growths: ["n log n"] });
  });
});

describe("growthExponents and readingOf", () => {
  it("gives each growth its own exponent over the counts", () => {
    const at = new Map(growthExponents(LADDER).map((g) => [g.growth, g.exponent]));
    expect(at.get("1")).toBeCloseTo(0, 9);
    expect(at.get("n")).toBeCloseTo(1, 9);
    expect(at.get("n^2")).toBeCloseTo(2, 9);
    expect(at.get("n log n")).toBeGreaterThan(1.15);
    expect(at.get("n log n")).toBeLessThan(1.3);
  });

  it("reads an interval by the growths that it holds", () => {
    expect(readingOf({ low: 0.9, high: 1.1 }, LADDER)).toEqual({ verdict: "one", growths: ["n"] });
    expect(readingOf({ low: 0.9, high: 1.6 }, LADDER)).toEqual({ verdict: "several", growths: ["n", "n log n", "n^1.5"] });
    expect(readingOf({ low: 1.6, high: 1.7 }, LADDER)).toEqual({ verdict: "none", growths: [] });
  });
});

describe("the paired reports", () => {
  const id = (rung: number, seed: number): string => `pack-worst-v1/ladder.count.r${rung}/s${seed}`;
  const MB = 1_000_000;
  /** This function makes a report with one arm: rows of the inputs, each with its time and its peak in MB. */
  const report = (inputs: readonly (readonly [string, number, number])[]): PairedReport =>
    ({ inputs: inputs.map(([input, ms, peak]) => ({ id: input, ms: { a: [ms] }, median: { a: ms }, ratio: { a: 1 }, peakRss: { a: peak * MB } })) }) as unknown as PairedReport;

  it("reads the median times of the ladder", () => {
    const data = report([
      [id(0, 1), 1, 100],
      ["pack-worst-v1/tall-row.r1.fixed.n100/s1", 9, 100],
    ]);
    expect(pairedTimeRows(data)).toEqual([{ arm: "a", n: 10, value: 1 }]);
  });

  it("takes the excess over the smallest rung, and drops a rung inside its spread", () => {
    const data = report([
      [id(0, 1), 1, 108],
      [id(0, 2), 1, 110],
      [id(1, 1), 1, 110],
      [id(1, 2), 1, 111],
      [id(2, 1), 1, 112],
      [id(2, 2), 1, 114],
    ]);
    // The floor is 109 MB and its spread is 2 MB. Rung 1 has the median excess 1.5 MB, so only rung 2 stays.
    expect(pairedMemoryRows(data)).toEqual([
      { arm: "a", n: 40, value: 3 * MB },
      { arm: "a", n: 40, value: 5 * MB },
    ]);
  });

  it("gives no memory rows without peaks", () => {
    const data = { inputs: [{ id: id(0, 1), median: { a: 1 } }] } as unknown as PairedReport;
    expect(pairedMemoryRows(data)).toEqual([]);
  });
});

describe("the report", () => {
  it("has one fit for each arm, in order", () => {
    const data = [...rows((n) => n).map((r) => ({ ...r, arm: "b" })), ...rows((n) => n ** 2)];
    const report = scalingReport("123", "Time", data, RUNS);
    expect(report.fits.map((f) => f.arm)).toEqual(["a", "b"]);
    expect(report.run).toBe("123");
  });

  it("writes each kind of reading in its table", () => {
    const data = [
      ...rows((n) => n).map((r) => ({ ...r, arm: "one" })),
      ...rows((n) => 1000 * n + n ** 2, 0.02).map((r) => ({ ...r, arm: "curved" })),
      ...rows((n) => n, 0.03, "few", LADDER.slice(0, 2)).map((r) => ({ ...r, arm: "few" })),
      ...rows((n) => n ** 2, 0.1, "narrow", [100, 110, 120, 130, 140, 150, 160]).map((r) => ({ ...r, arm: "narrow" })),
      ...rows((n) => n ** 1.7, 0.002).map((r) => ({ ...r, arm: "between" })),
    ];
    const text = scalingMarkdown(scalingReport("123", "Time", data, RUNS));
    expect(text).toContain("### Time, run 123");
    expect(text).toMatch(/`one`.*\| `n` \|/);
    expect(text).toMatch(/`curved`.*curved, upper half:/);
    expect(text).toMatch(/`few`.*too few rungs/);
    expect(text).toMatch(/`narrow`.*cannot tell:/);
    expect(text).toMatch(/`between`.*between the growths/);
  });
});

describe("reportsOf", () => {
  it("needs a run and a source", () => {
    expect(() => reportsOf(["--records", "x"])).toThrow("--run");
    expect(() => reportsOf(["--run", "1"])).toThrow("--records");
  });

  it("reads each source from its file", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaling-"));
    try {
      const records = join(dir, "records.jsonl");
      const paired = join(dir, "paired-time.json");
      writeFileSync(records, `${JSON.stringify({ strategy: "rows", input: "c/ladder.count.r1/s1", ms: 2 })}\n`);
      writeFileSync(paired, JSON.stringify({ inputs: [{ id: "c/ladder.count.r1/s1", median: { a: 1 }, peakRss: { a: 9 } }] }));
      expect(reportsOf(["--run", "1", "--records", records]).map((r) => r.measure)).toEqual(["Time in ms, in order"]);
      expect(reportsOf(["--run", "2", "--paired", paired]).map((r) => r.measure)).toEqual(["Time in ms, paired", "Peak memory over the smallest rung, in bytes"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
