import { checkConfig } from "@mark1russell7/layout-contract";
import { composites, packConfig, packSpace, packWith, shapeStrategies, strategies, strategy, type StrategyConfig } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { AREA_KEY, ENTRIES } from "./entries.ts";
import { result, SPACE_INPUTS, type PackResult } from "./space-inputs.ts";

// The named configs of packSpace (k68) against the entries of the benchmark and the registry. Made-up inputs only.

const named = packSpace.named!;

// The configs of overlap-min (k80) make 8192 moves on each strip. This test gives them 256 moves on both sides, so it stays fast.
const FAST_MOVES = 256;

/** This function gives the named config of a name. A config of overlap-min gets the param iterations FAST_MOVES. */
function fastConfig(name: string): StrategyConfig {
  const config = named[name]!;
  const combine = config.stages["combine"];
  if (combine?.option !== "overlap-min") return config;
  return { ...config, stages: { ...config.stages, combine: { ...combine, params: { ...combine.params, iterations: FAST_MOVES } } } };
}

/** This function gives the options of packWith. The strategy overlap-min gets the option iterations FAST_MOVES. */
const fastOptions = (id: string, options: Record<string, unknown> | undefined): Record<string, unknown> | undefined =>
  id === "overlap-min" ? { ...options, iterations: FAST_MOVES } : options;

/** This function compares packConfig of a named config with a reference pack on each input. It gives the count of outputs. */
function compare(name: string, reference: (i: number) => PackResult): number {
  // The strategy overlap-min of k80 packs only the 2 inputs with a free height or a free width. It refuses the others.
  let outputs = 0;
  const config = fastConfig(name);
  for (const [i, input] of SPACE_INPUTS.entries()) {
    const want = reference(i);
    expect(result(() => packConfig(input, config, i)), `${name} ${i}`).toEqual(want);
    if (!("error" in want)) outputs++;
  }
  return outputs;
}

describe("packSpace and the entries of the benchmark", () => {
  it("has a named config for each entry and each id of the registry, and checkConfig accepts it", () => {
    expect(ENTRIES).toHaveLength(38);
    // The strategies of shapeStrategies (k90) have a named config too. `src/hole-degree.test.ts` packs it on circles.
    const ids = [...ENTRIES.map((e) => e.id), ...[...strategies, ...shapeStrategies, ...composites].map((s) => s.id)];
    for (const id of ids) {
      expect(named, id).toHaveProperty([id]);
      expect(checkConfig(packSpace, named[id]!), id).toEqual([]);
    }
    expect(Object.keys(named).toSorted()).toEqual([...new Set(ids)].toSorted());
  });

  // One test for each entry and each id: the searches over orders of k26 pack many times, and one test for all of them is slow on the CI runner.
  it.each(ENTRIES.map((e) => [e.id, e] as const))("gives the output of the run of the entry %s", (id, e) => {
    // The runner gives the options of an entry over the defaults of its strategy
    const given = Object.keys(e.options).length === 0 ? undefined : { ...(strategy(e.strategy).defaults as object), ...e.options };
    expect(compare(id, (i) => result(() => packWith(e.strategy, SPACE_INPUTS[i]!, fastOptions(e.strategy, given), i))), id).toBeGreaterThanOrEqual(e.strategy === "overlap-min" ? 2 : 3);
  });

  it.each([...strategies, ...composites].map((s) => s.id))("gives the output of packWith for the id %s of the registry", (id) => {
    // The strategy aspect-fit needs an inner strategy. Its named config wraps maxrects.
    const options = id === "aspect-fit" ? { strategy: "maxrects" } : undefined;
    expect(compare(id, (i) => result(() => packWith(id, SPACE_INPUTS[i]!, fastOptions(id, options), i))), id).toBeGreaterThanOrEqual(id === "overlap-min" ? 2 : 3);
  });

  it("refuses aspect-fit with no inner strategy", () => {
    expect(() => packWith("aspect-fit", SPACE_INPUTS[0]!)).toThrow(RangeError);
  });

  it("uses the key AREA_KEY for the param key area", () => {
    const config = { space: "packing", stages: { combine: { option: "portfolio", params: { key: "area" }, members: [named["rows"]!, named["maxrects"]!] } } };
    const want = result(() => packWith("portfolio", SPACE_INPUTS[0]!, { members: ["rows", "maxrects"], key: AREA_KEY }));
    expect(result(() => packConfig(SPACE_INPUTS[0]!, config))).toEqual(want);
  });
});
