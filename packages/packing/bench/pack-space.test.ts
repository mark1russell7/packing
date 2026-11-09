import { checkConfig, configId } from "@mark1russell7/layout-contract";
import { composites, configOfStrategy, PACK_DEFAULT_TABLE, packConfig, packSpace, packWith, rectGrid, shapeStrategies, standaloneStrategies, strategies, strategy, toPackInput, UnsupportedCell, type PackInput, type StrategyConfig } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { AREA_KEY, ENTRIES, STANDALONE_ENTRIES, STANDALONE_IDS } from "./entries.ts";
import { result, SPACE_INPUTS, type PackResult } from "./space-inputs.ts";

// The named configs of packSpace (k68) against the entries of the benchmark and the registry. Made-up inputs only.

const named = packSpace.named!;

/** This function gives the count of the inputs of SPACE_INPUTS with a good output for a strategy. The strategy best-fit does not accept obstacles, so only 1 input is good. */
const floorOf = (id: string): number => (id === "overlap-min" ? 2 : id === "best-fit" ? 1 : STANDALONE_ENTRIES.some((e) => e.strategy === id) ? 0 : 3);

/** The inputs that a standalone strategy of k141 accepts: a strip with no obstacle, then a free frame. `SPACE_INPUTS` has few of them. */
const STANDALONE_INPUTS: readonly PackInput[] = [
  ...[
    { containerSize: "freeHeight", containerShape: "rect", obstacles: "none", sizes: "uniform", count: 12 },
    { containerSize: "freeArea", containerShape: "rect", obstacles: "none", sizes: "uniform", count: 12 },
  ].map((params, i) => toPackInput(rectGrid.generate(i + 1, params as never))),
  // The strategy exact-strip takes few items of whole sizes.
  { container: { w: 10, fixed: "width" }, items: [{ id: "a", w: 6, h: 4 }, { id: "b", w: 4, h: 4 }, { id: "c", w: 5, h: 3 }, { id: "d", w: 5, h: 2 }] },
];

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

/** The entries with a point in `packSpace`: each entry, since roadmap item k142. */
const SPACE_ENTRIES = ENTRIES;

describe("packSpace and the entries of the benchmark", () => {
  it("has a named config for each entry and each id of the registry, and checkConfig accepts it", () => {
    // Roadmap item k25 adds 5 entries. Before k25 the count was 45.
    expect(STANDALONE_IDS.size).toBe(STANDALONE_ENTRIES.length);
    // Roadmap item k213 adds the entry compact-maxrects-bl. Before k213 the count was 50 and the standalone entries.
    expect(ENTRIES).toHaveLength(51 + STANDALONE_ENTRIES.length);
    // The strategies of shapeStrategies (k90) have a named config too. `src/hole-degree.test.ts` packs it on circles.
    // The named config `pack` of k135 is the choice of `pack` without a strategy. It is not an entry and not an id of the registry.
    // The named config `maxrects-wire` of k136 is the rule wire of `maxrects`. It is not an entry, because the screen has no links.
    // The named configs `relax-pull-rows` and `relax-pull-maxrects-bl` of k137 are not entries for the same reason.
    const ids = [...SPACE_ENTRIES.map((e) => e.id), ...[...strategies, ...shapeStrategies, ...composites, ...standaloneStrategies].map((s) => s.id), "pack", "maxrects-wire", "relax-pull-rows", "relax-pull-maxrects-bl"];
    for (const id of ids) {
      expect(named, id).toHaveProperty([id]);
      expect(checkConfig(packSpace, named[id]!), id).toEqual([]);
    }
    expect(Object.keys(named).toSorted()).toEqual([...new Set(ids)].toSorted());
  });

  // One test for each entry and each id: the searches over orders of k26 pack many times, and one test for all of them is slow on the CI runner.
  it.each(SPACE_ENTRIES.map((e) => [e.id, e] as const))("gives the output of the run of the entry %s", (id, e) => {
    // The runner gives the options of an entry over the defaults of its strategy
    const given = Object.keys(e.options).length === 0 ? undefined : { ...(strategy(e.strategy).defaults as object), ...e.options };
    expect(compare(id, (i) => result(() => packWith(e.strategy, SPACE_INPUTS[i]!, fastOptions(e.strategy, given), i))), id).toBeGreaterThanOrEqual(floorOf(e.strategy));
  });

  it.each(STANDALONE_ENTRIES.map((e) => [e.id, e] as const))("gives the output of the standalone entry %s on an input that it accepts (k142)", (id, e) => {
    const given = Object.keys(e.options).length === 0 ? undefined : { ...(strategy(e.strategy).defaults as object), ...e.options };
    let outputs = 0;
    for (const [i, input] of STANDALONE_INPUTS.entries()) {
      const want = result(() => packWith(e.strategy, input, given, i));
      expect(result(() => packConfig(input, named[id]!, i)), `${id} ${i}`).toEqual(want);
      if (!("error" in want)) outputs++;
    }
    expect(outputs, id).toBeGreaterThanOrEqual(1);
  });

  it("refuses a composite with a standalone member, so a draw goes back (k142)", () => {
    for (const id of ["restarts", "bbox", "side-anchors-first-left"]) {
      const combine = named[id]!.stages["combine"]!;
      const config = { ...named[id]!, stages: { ...named[id]!.stages, combine: { ...combine, members: [named["sleator"]!] } } };
      expect(checkConfig(packSpace, config), id).toEqual([]);
      expect(() => packConfig(STANDALONE_INPUTS[0]!, config), id).toThrow(UnsupportedCell);
    }
    const point = configOfStrategy("restarts", { member: "sleator" });
    expect(point.ok).toBe(false);
  });

  it("gives with the named config pack the output of select with the table PACK_DEFAULT_TABLE (k135)", () => {
    expect(compare("pack", (i) => result(() => packWith("select", SPACE_INPUTS[i]!, { table: PACK_DEFAULT_TABLE }, i)))).toBeGreaterThanOrEqual(3);
  });

  it("gives with configOfStrategy the named config of each entry (k135)", () => {
    for (const e of SPACE_ENTRIES) {
      const point = configOfStrategy(e.strategy, e.options);
      expect(point, e.id).toMatchObject({ ok: true });
      if (point.ok) expect(configId(packSpace, point.config), e.id).toBe(configId(packSpace, named[e.id]!));
    }
  });

  it.each([...strategies, ...composites].map((s) => s.id))("gives the output of packWith for the id %s of the registry", (id) => {
    // The strategies aspect-fit and compact (k213) need an inner strategy. Their named configs wrap maxrects.
    const options = id === "aspect-fit" || id === "compact" ? { strategy: "maxrects" } : undefined;
    expect(compare(id, (i) => result(() => packWith(id, SPACE_INPUTS[i]!, fastOptions(id, options), i))), id).toBeGreaterThanOrEqual(floorOf(id));
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
