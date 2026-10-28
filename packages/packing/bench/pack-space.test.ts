import { checkConfig } from "@mark1russell7/layout-contract";
import { composites, packConfig, packSpace, packWith, strategies, strategy } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { AREA_KEY, ENTRIES } from "./entries.ts";
import { result, SPACE_INPUTS, type PackResult } from "./space-inputs.ts";

// The named configs of packSpace (k68) against the entries of the benchmark and the registry. Made-up inputs only.

const named = packSpace.named!;

/** This function compares packConfig of a named config with a reference pack on each input. It gives the count of outputs. */
function compare(name: string, reference: (i: number) => PackResult): number {
  let outputs = 0;
  for (const [i, input] of SPACE_INPUTS.entries()) {
    const want = reference(i);
    expect(result(() => packConfig(input, named[name]!, i)), `${name} ${i}`).toEqual(want);
    if (!("error" in want)) outputs++;
  }
  return outputs;
}

describe("packSpace and the entries of the benchmark", () => {
  it("has a named config for each entry and each id of the registry, and checkConfig accepts it", () => {
    expect(ENTRIES).toHaveLength(25);
    const ids = [...ENTRIES.map((e) => e.id), ...[...strategies, ...composites].map((s) => s.id)];
    for (const id of ids) {
      expect(named, id).toHaveProperty([id]);
      expect(checkConfig(packSpace, named[id]!), id).toEqual([]);
    }
    expect(Object.keys(named).toSorted()).toEqual([...new Set(ids)].toSorted());
  });

  it("gives the output of the run of each entry", () => {
    for (const e of ENTRIES) {
      // The runner gives the options of an entry over the defaults of its strategy
      const given = Object.keys(e.options).length === 0 ? undefined : { ...(strategy(e.strategy).defaults as object), ...e.options };
      expect(compare(e.id, (i) => result(() => packWith(e.strategy, SPACE_INPUTS[i]!, given, i))), e.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the output of packWith for each id of the registry", () => {
    for (const s of [...strategies, ...composites]) {
      // The strategy aspect-fit needs an inner strategy. Its named config wraps maxrects.
      const options = s.id === "aspect-fit" ? { strategy: "maxrects" } : undefined;
      expect(compare(s.id, (i) => result(() => packWith(s.id, SPACE_INPUTS[i]!, options, i))), s.id).toBeGreaterThanOrEqual(3);
    }
    expect(() => packWith("aspect-fit", SPACE_INPUTS[0]!)).toThrow(RangeError);
  });

  it("uses the key AREA_KEY for the param key area", () => {
    const config = { space: "packing", stages: { combine: { option: "portfolio", params: { key: "area" }, members: [named["rows"]!, named["maxrects"]!] } } };
    const want = result(() => packWith("portfolio", SPACE_INPUTS[0]!, { members: ["rows", "maxrects"], key: AREA_KEY }));
    expect(result(() => packConfig(SPACE_INPUTS[0]!, config))).toEqual(want);
  });
});
