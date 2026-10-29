import { describe, expect, it } from "vitest";
import { canonicalConfig, stepRandom, type StrategyConfig } from "@mark1russell7/layout-contract";
import { packConfig, packSpace, packWith, strategy, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { ENTRIES, ORDER_SEARCH_ENTRIES, OVERLAP_MIN_ENTRIES } from "./entries.ts";
import { hasClockLimit } from "./run.ts";
import { capMoves, drawOf, drawPlan } from "./sample-space.ts";
import { result, SPACE_INPUTS } from "./space-inputs.ts";

// The shuffle test of roadmap item k121, as the test LD1 of graph. Each job packs each input 5 times, in a seeded shuffled order of all the calls of a group.
// A state that one pack leaves for the next pack changes an output, so one (job, input) gets two hashes. The test reads no time.

/** The count of the packs of each job on each input. */
const RUNS = 5;

/** The small inputs: a fixed size with obstacles, a free height, and a free area of identical boxes. */
const INPUTS: readonly PackInput[] = [SPACE_INPUTS[0]!, SPACE_INPUTS[1]!, SPACE_INPUTS[4]!];

/** The moves of overlap-min and the iterations of the searches over orders, as the screen test gives them. */
const FAST_MOVES = 256;
const FAST_ITERATIONS = 4;
const FAST: Readonly<Record<string, Record<string, unknown>>> = Object.fromEntries([
  ...OVERLAP_MIN_ENTRIES.map((e) => [e.id, { iterations: FAST_MOVES }]),
  ...ORDER_SEARCH_ENTRIES.map((e) => [e.id, { iterations: FAST_ITERATIONS }]),
]);

/** The combine options with a param `iterations` that the test makes fast. */
const FAST_COMBINE: Readonly<Record<string, number>> = { "overlap-min": FAST_MOVES, anneal: FAST_ITERATIONS, genetic: FAST_ITERATIONS, tabu: FAST_ITERATIONS };

/** One job: a bench entry or a sampled config, and its pack of an input with a seed. */
interface Job {
  readonly id: string;
  readonly pack: (input: PackInput, seed: number) => PackOutput;
}

/** This function gives the job of a bench entry. As in `runBench`, an entry with options packs them over the defaults of its strategy. */
function entryJob(e: (typeof ENTRIES)[number]): Job {
  const more = { ...e.options, ...FAST[e.id] };
  const options = Object.keys(more).length === 0 ? undefined : { ...(strategy(e.strategy).defaults as Record<string, unknown>), ...more };
  return { id: `entry:${e.id}`, pack: (input, seed) => packWith(e.strategy, input, options, seed) };
}

/** This function gives a sampled config with the fast params of `FAST_COMBINE`. */
function fastConfig(config: StrategyConfig): StrategyConfig {
  const capped = capMoves(config, FAST_MOVES);
  const combine = capped.stages["combine"];
  const fast = combine == null ? undefined : FAST_COMBINE[combine.option];
  if (combine == null || fast === undefined) return capped;
  return { ...capped, stages: { ...capped.stages, combine: { ...combine, params: { ...combine.params, iterations: fast } } } };
}

/** The 24 sampled configs: the default stratified draw of the seed 121, without clock limits. */
const SAMPLED: readonly StrategyConfig[] = (() => {
  const plan = drawPlan(packSpace, "stratified");
  return Array.from({ length: 24 }, (_, i) => fastConfig(canonicalConfig(packSpace, drawOf(stepRandom(121, `pair-${i}`), plan, plan.strata[i % plan.strata.length]))));
})();

const JOBS: readonly Job[] = [...ENTRIES.map(entryJob), ...SAMPLED.map((config, i): Job => ({ id: `sampled:${i}`, pack: (input, seed) => packConfig(input, config, seed) }))];

/** This function gives the items in a seeded shuffled order (Fisher and Yates). */
function shuffled<T>(items: readonly T[], seed: number, key: string): T[] {
  const r = stepRandom(seed, key);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * This function packs each job of a group on each input `RUNS` times, in a shuffled order.
 * It gives each (job, input) with more than one result, and the count of the (job, input) that give an output and not an error.
 */
function shuffleRun(group: readonly Job[], key: string): { unstable: string[]; packed: number } {
  const calls = group.flatMap((job) => INPUTS.flatMap((input, i) => Array.from({ length: RUNS }, () => ({ job, input, i }))));
  const seen = new Map<string, Set<string>>();
  for (const { job, input, i } of shuffled(calls, 121, key)) {
    const at = `${job.id} on input ${i}`;
    const set = seen.get(at) ?? new Set<string>();
    set.add(JSON.stringify(result(() => job.pack(input, i + 1))));
    seen.set(at, set);
  }
  const packed = [...seen.values()].filter((set) => !("error" in JSON.parse([...set][0]!))).length;
  return { unstable: [...seen].filter(([, set]) => set.size > 1).map(([at]) => at), packed };
}

/** The groups of jobs. Each group is one test, so each test stays short. */
const GROUPS: readonly (readonly Job[])[] = (() => {
  const out: Job[][] = [];
  const size = 16;
  for (let i = 0; i < JOBS.length; i += size) out.push(JOBS.slice(i, i + size));
  return out;
})();

describe("the shuffle test of k121", () => {
  it("has each bench entry and 24 sampled configs without a clock limit", () => {
    expect(JOBS).toHaveLength(ENTRIES.length + 24);
    for (const config of SAMPLED) expect(hasClockLimit(config)).toBe(false);
  });

  GROUPS.forEach((group, g) => {
    it(`gives one output for each job and input of group ${g + 1} of ${GROUPS.length} (${group[0]!.id} to ${group.at(-1)!.id})`, () => {
      const { unstable, packed } = shuffleRun(group, `group-${g}`);
      expect(unstable).toEqual([]);
      expect(packed).toBeGreaterThan(group.length);
    });
  });
});
