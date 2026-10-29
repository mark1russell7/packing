import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalConfig, createFamilyRegistry, type StrategyConfig } from "@mark1russell7/layout-contract";
import { corpusFamilies, outputHash, packConfig, packSpace, toPackInput, type GeneratedInput } from "@mark1russell7/packing";
import { determinismMarkdown, determinismOf, gateLines, hasClockLimit, isClockRecord, isMeasured, parseCorpus, runBench, summaryMarkdown, type BenchRecord } from "./run.ts";

// The determinism gate of roadmap item k121, and the pair 16 of the k118 sample, which was not deterministic.

describe("hasClockLimit", () => {
  it("finds limitTime true or a budgetMs at each depth, the members included", () => {
    expect(hasClockLimit({ limitTime: true })).toBe(true);
    expect(hasClockLimit({ budgetMs: 2 })).toBe(true);
    expect(hasClockLimit({ stages: { combine: { option: "portfolio", members: [{ stages: { combine: { params: { limitTime: true, budgetMs: 1 } } } }] } } })).toBe(true);
    expect(hasClockLimit([{ a: 1 }, { b: { budgetMs: 5 } }])).toBe(true);
  });

  it("gives false without a clock limit: limitTime false, a work limit, no budgetMs", () => {
    expect(hasClockLimit({ limitTime: false, limitWork: true, budgetWork: 64000 })).toBe(false);
    expect(hasClockLimit({ budgetMs: null })).toBe(false);
    expect(hasClockLimit(undefined)).toBe(false);
    expect(hasClockLimit("limitTime")).toBe(false);
    expect(hasClockLimit(packSpace.named!["rows"])).toBe(false);
  });
});

describe("the determinism gate", () => {
  const records = [
    { strategy: "a", input: "x", deterministic: true },
    { strategy: "b", input: "x", deterministic: false, options: { limitTime: true, budgetMs: 2 } },
    { strategy: "c", input: "y", deterministic: false, clock: true },
    { strategy: "d", input: "y", deterministic: false, pair: 16 },
    { strategy: "e", input: "z", deterministic: false, skipped: "no fit" },
    { strategy: "f", input: "z" },
  ];

  it("counts the records with a clock limit apart, and fails only on the others", () => {
    expect(determinismOf(records)).toEqual({ nondeterministic: 3, nondeterministicClock: 2, failures: [{ strategy: "d", input: "y", pair: 16 }] });
    expect(isClockRecord({ clock: false, options: { limitTime: true } })).toBe(false);
    expect(isClockRecord({ config: { budgetMs: 3 } })).toBe(true);
  });

  it("gives the lines of a failure, and no lines when the gate passes", () => {
    expect(gateLines(determinismOf(records), "pairs")).toEqual(["The determinism gate (k121) failed: 1 pairs without a clock limit are not deterministic.", "pair 16: d on y"]);
    expect(gateLines(determinismOf(records.slice(0, 3)), "pairs")).toEqual([]);
    expect(determinismMarkdown(determinismOf(records)).at(-1)).toBe("- The determinism gate (k121): failed.");
  });

  it("shows both counts in summary.md", () => {
    const smoke = parseCorpus(readFileSync(join(import.meta.dirname, "corpora", "smoke-v1.json"), "utf8"), "smoke-v1");
    const env = { node: "v0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
    const { run, records: got } = runBench({ corpus: smoke, prediction: "p-test", strategies: ["shelf"], repeats: 1, warmup: 0, env });
    const ok = summaryMarkdown(run, got);
    expect(ok).toContain("- Not deterministic without a clock limit (`nondeterministic` less `nondeterministicClock`): 0. Each one fails the run.");
    expect(ok).toContain("- The determinism gate (k121): passed.");
    const at = got.findIndex(isMeasured);
    const broken: BenchRecord[] = got.map((r, i) => (i === at ? ({ ...r, deterministic: false } as BenchRecord) : r));
    const md = summaryMarkdown(run, broken);
    expect(md).toContain("- The determinism gate (k121): failed.");
    expect(md).toContain("| strategy | input | hard | deterministic | clock limit |");
  });
});

/** The input of the pair 16 of the k118 sample (run 40815224148): `ladder@1` with the seed 1019521697 and its knobs. */
function k118Input(): GeneratedInput {
  const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
  return registry.generate("ladder", 1019521697, { axis: "ratio", rung: 8, count: 99, margin: 0, gap: 3.121 }, { version: 1, set: "sample-space" });
}

/** The config of the pair 16 of k118 with `limitTime` false. The work limit stays. */
function k118Config(): StrategyConfig {
  const member = {
    space: "packing",
    stages: {
      order: { option: "input" },
      "size-search": { option: "log-sweep", params: { samples: 113 } },
      placement: { option: "guillotine", params: { choice: "wssf", split: "las", rotate: true, merge: false } },
      "local-search": { option: "none" },
    },
  };
  const params = { key: "levels", iterations: 234, perturb: "shuffle-blocks", strength: 0.892194, limitTime: false, limitWork: true, budgetWork: 64000 };
  return canonicalConfig(packSpace, { space: "packing", stages: { combine: { option: "restarts", params, members: [member] } } } as never);
}

describe("the pair 16 of the k118 sample without a clock limit", () => {
  // With limitTime true and budgetMs 2.61016, the count of the restarts depends on the speed of the computer, and the output changes with it.
  // Without the clock limit, the work limit alone stops the restarts. Thus 10 packs give one hash, in 2 tests of 5 packs.
  const file = k118Input();
  const config = k118Config();
  const HASH = "3af3bd1b0133134b";

  it("generates the input of the k118 record, and the config has no clock limit", () => {
    expect(file.hash).toBe("a6476186166b0221");
    expect(hasClockLimit(config)).toBe(false);
  });

  for (const part of [1, 2]) {
    it(`gives the same output hash in 5 packs (part ${part} of 2)`, () => {
      const input = toPackInput(file);
      const hashes = new Set<string>();
      for (let i = 0; i < 5; i++) hashes.add(outputHash(packConfig(input, config, file.seed)));
      expect([...hashes]).toEqual([HASH]);
    });
  }
});
