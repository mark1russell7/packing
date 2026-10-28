import { checkConfig, checkSpace, configId, spaceSize } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { outputHash, packConfig, packSpace, packWith, PORTFOLIO_SETS, rectGrid, toPackInput, type StrategyConfig } from "./index.ts";
import { baseConfig } from "./pack-space.ts";

// The strategy space of k68. Made-up inputs of the generators only. `bench/pack-space.test.ts` compares the outputs of the named configs.

const named = packSpace.named!;
const input = toPackInput(rectGrid.generate(4, { containerSize: "freeAspect", containerShape: "circle", obstacles: "corridors", sizes: "uniform", count: 24 }));

describe("packSpace", () => {
  it("is a good space, and checkConfig accepts each named config", () => {
    expect(checkSpace(packSpace)).toEqual([]);
    for (const [name, config] of Object.entries(named)) expect(checkConfig(packSpace, config), name).toEqual([]);
  });

  it("has 5 stages and 705 base configs with 3 levels", () => {
    expect(packSpace.stages.map((s) => s.name)).toEqual(["order", "size-search", "placement", "local-search", "combine"]);
    expect(spaceSize(packSpace, { levels: 3 }).base).toBe(705n);
  });

  it("gives the entries of PORTFOLIO_SETS as named configs, and as the members of cell-portfolio", () => {
    const members = named["portfolio"]!.stages["combine"]!.members!;
    expect(members).toHaveLength(Object.keys(PORTFOLIO_SETS.entries).length);
    for (const [id, e] of Object.entries(PORTFOLIO_SETS.entries)) {
      const config = baseConfig(e.strategy, (e.options ?? {}) as Record<string, unknown>);
      expect(configId(packSpace, config), id).toBe(configId(packSpace, named[id]!));
    }
  });

  it("packs a config that has no name", () => {
    const config: StrategyConfig = {
      space: "packing",
      stages: {
        order: { option: "area-desc" },
        "size-search": { option: "log-sweep", params: { samples: 12 } },
        placement: { option: "maxrects", params: { rule: "cp", fixedBands: true, bandHeight: 4 } },
        "local-search": { option: "none" },
      },
    };
    const want = packWith("maxrects", input, { sortOrder: "area-desc", samples: 12, rule: "cp", bandHeight: 4 }, 5);
    expect(outputHash(packConfig(input, config, 5))).toBe(outputHash(want));
  });

  it("throws a RangeError for a config with a break", () => {
    const push = named["push"]!;
    const bad = { ...push, stages: { ...push.stages, "size-search": { option: "log-sweep" } } };
    expect(() => packConfig(input, bad)).toThrow(/constraint/);
    expect(() => packConfig(input, { space: "packing", stages: {} })).toThrow(RangeError);
    const members = named["portfolio"]!.stages["combine"]!.members!;
    const other = { space: "packing", stages: { combine: { option: "cell-portfolio", members: [...members.slice(1), named["shelf-first-input"]!] } } };
    expect(() => packConfig(input, other)).toThrow(/PORTFOLIO_SETS/);
  });

  it("throws a RangeError for an option that the space does not have", () => {
    expect(() => baseConfig("push", { samples: 4 })).toThrow(RangeError);
    expect(() => baseConfig("portfolio")).toThrow(RangeError);
  });
});
