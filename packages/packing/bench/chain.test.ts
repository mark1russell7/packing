// Roadmap item k159: `push` on the chains of `pack-change-v1`, and the control of its stability. The data is made up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { corpus, toPackInput, type PackOutput } from "@mark1russell7/packing";
import { CHANGE_CORPUS, changeCorpusText, changeSpecs, stepMarkdown, stepRows } from "./change.ts";
import { benchEntry, benchPack, KEEP_SHELF } from "./controls.ts";
import { ENTRIES } from "./entries.ts";
import { isMeasured, NOT_RUN_BASE, outputHash, parseCorpus, runBench, type BenchEnv, type BenchRecord, type MeasuredRecord, type SkippedRecord } from "./run.ts";

// The test puts a fault into one input with no hook in the runner
const fault = vi.hoisted(() => ({ input: undefined as string | undefined }));
vi.mock("./controls.ts", async (actual) => {
  const real = await actual<typeof import("./controls.ts")>();
  return {
    ...real,
    benchPack: (...args: Parameters<typeof real.benchPack>) => {
      if (fault.input !== undefined && JSON.stringify(args[1]) === fault.input) throw new Error("injected fault");
      return real.benchPack(...args);
    },
  };
});

const ENV: BenchEnv = { node: "v0.0.0", os: "test", arch: "test", runner: "test", cpu: "test", cpus: 1 };
const CHAIN = "chain-v1";
// 4 kinds, 20 boxes and seed 1: 4 chains of 6 inputs
const specs = changeSpecs()
  .filter((s) => (s.params as { count: number }).count === 20)
  .map((s) => ({ ...s, seeds: [1] }));
const text = JSON.stringify({ schema: "layout-corpus/1", corpus: CHAIN, heldOut: "all", specs });
const { inputs } = corpus(CHAIN, specs);
const roots = inputs.filter((f) => f.base === undefined);

/** This function gives the inputs of the chain of a root, in the order of its steps. */
function chainOf(root: (typeof inputs)[number]): (typeof inputs)[number][] {
  const chain = [root];
  for (;;) {
    const next = inputs.find((f) => f.base === chain[chain.length - 1]!.id);
    if (next === undefined) return chain;
    chain.push(next);
  }
}

const run = (strategy: string): ReturnType<typeof runBench> => runBench({ corpus: parseCorpus(text, CHAIN), prediction: "p-test", strategies: [strategy], repeats: 1, warmup: 0, env: ENV, commit: "abcdef0" });
const recordOf = (records: readonly BenchRecord[], input: string): BenchRecord => records.find((r) => r.input === input)!;
const measuredOf = (records: readonly BenchRecord[], input: string): MeasuredRecord => recordOf(records, input) as MeasuredRecord;
const movedOf = (r: MeasuredRecord): number | undefined => (r.measures as Record<string, number | undefined>)["pack.stability.moved"];

beforeEach(() => {
  fault.input = undefined;
});

describe("a strategy of the mode incremental on a chain", () => {
  it("gets its own output at the base as previous", () => {
    const { records } = run("push");
    expect(records.filter(isMeasured)).toHaveLength(inputs.length);
    const options = benchEntry("push").options;
    let differs = 0;
    for (const root of roots) {
      let previous: PackOutput | undefined;
      for (const file of chainOf(root)) {
        const input = toPackInput(file);
        const output = benchPack("push", input, options, file.seed, previous);
        expect(measuredOf(records, file.id).outputHash).toBe(outputHash(output));
        if (outputHash(benchPack("push", input, options, file.seed)) !== outputHash(output)) differs += 1;
        previous = output;
      }
    }
    expect(differs).toBeGreaterThan(0);
  }, 60_000);

  it("reads a move value on each step with a base, and none on step 0", () => {
    const { records } = run("push");
    for (const file of inputs) expect(movedOf(measuredOf(records, file.id)) === undefined).toBe(file.base === undefined);
  }, 60_000);
});

describe("another strategy on a chain", () => {
  it("packs each input with no previous", () => {
    const { records } = run("rows");
    const options = benchEntry("rows").options;
    for (const file of inputs) expect(measuredOf(records, file.id).outputHash).toBe(outputHash(benchPack("rows", toPackInput(file), options, file.seed)));
  });
});

describe("a chain with a fault at a middle step", () => {
  const chain = chainOf(roots[0]!);
  const inject = (): void => {
    fault.input = JSON.stringify(toPackInput(chain[3]!));
  };

  it("reads censored at each later step of push, and the clean copy reads measured", () => {
    expect(run("push").records.filter(isMeasured)).toHaveLength(inputs.length);
    inject();
    const { records, run: stamp } = run("push");
    expect(stamp.errors.map((e) => e.input)).toEqual([chain[3]!.id]);
    for (const step of [4, 5]) {
      const skipped = recordOf(records, chain[step]!.id) as SkippedRecord;
      expect(skipped.skipped).toBe(NOT_RUN_BASE);
      expect(skipped.because).toEqual([chain[step]!.base]);
    }
    for (const step of [0, 1, 2]) expect(isMeasured(recordOf(records, chain[step]!.id))).toBe(true);
    for (const other of roots.slice(1).flatMap(chainOf)) expect(isMeasured(recordOf(records, other.id))).toBe(true);
  }, 60_000);

  it("keeps the pack of a strategy that does not read previous, with no move value at the next step", () => {
    inject();
    const { records } = run("rows");
    expect(movedOf(measuredOf(records, chain[4]!.id))).toBeUndefined();
    expect(movedOf(measuredOf(records, chain[5]!.id))).toBeDefined();
  });
});

describe("the control keep-shelf", () => {
  it("stays out of the entries", () => {
    expect(ENTRIES.some((e) => e.id === KEEP_SHELF)).toBe(false);
  });

  it("buys stability on the whole corpus with no break of a hard rule", () => {
    const { records } = runBench({ corpus: parseCorpus(changeCorpusText(), CHANGE_CORPUS), prediction: "p-test", strategies: [KEEP_SHELF], repeats: 1, warmup: 0, env: ENV, commit: "abcdef0" });
    const measured = records.filter(isMeasured);
    expect(measured).toHaveLength(480);
    for (const r of measured) expect(Object.values(r.hard).every((v) => v === 0)).toBe(true);
    const moved = measured.flatMap((r) => movedOf(r) ?? []);
    expect(moved).toHaveLength(400);
    expect(moved.reduce((sum, v) => sum + v, 0) / moved.length).toBeLessThan(0.05);
  }, 60_000);
});

describe("the read by step", () => {
  it("keeps step 0 out of the figures, and names the comparison of each row", () => {
    const records = [...run("push").records, ...run("rows").records];
    const rootIds = new Set(roots.map((f) => f.id));
    const [push, rows] = stepRows(records, ["push", "rows"], rootIds);
    expect(push).toMatchObject({ comparison: "previous", stepZero: roots.length, steps: inputs.length - roots.length, censored: 0, withMoved: inputs.length - roots.length });
    expect(rows).toMatchObject({ comparison: "no previous", stepZero: roots.length, steps: inputs.length - roots.length });
    const fillOf = (id: string): number => (measuredOf(records.filter((r) => r.strategy === "rows"), id).measures as Record<string, number>)["pack.fill"]!;
    const stepIds = inputs.filter((f) => f.base !== undefined).map((f) => f.id);
    expect(rows!.fill).toBeCloseTo(stepIds.reduce((sum, id) => sum + fillOf(id), 0) / stepIds.length, 10);
    expect(stepMarkdown([push!, rows!])).toContain("| `push` | previous |");
  }, 60_000);

  it("counts a step that a lost base stopped as censored", () => {
    fault.input = JSON.stringify(toPackInput(chainOf(roots[0]!)[3]!));
    const [push] = stepRows(run("push").records, ["push"], new Set(roots.map((f) => f.id)));
    expect(push!.censored).toBe(2);
    expect(push!.steps).toBe(inputs.length - roots.length - 3);
  }, 60_000);
});
