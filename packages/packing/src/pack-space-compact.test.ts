// The stage compact of packSpace and the strategy compact of roadmap item k213. Each test uses made-up inputs.
import { configId } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  checkHard,
  COMPACT_DIRECTIONS,
  COMPACT_STAGE,
  compactUp,
  compactWith,
  configOfStrategy,
  mulberry32,
  outputHash,
  packConfig,
  packSpace,
  packWith,
  UnsupportedCell,
  type Item,
  type PackInput,
  type StrategyConfig,
} from "./index.ts";

const named = packSpace.named!;

/** The count of each hard rule that a valid layout breaks. */
const ZERO = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** This function gives a made-up strip of width 200. */
function strip(seed: number, count: number): PackInput {
  const random = mulberry32(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) items.push({ id: `i${i}`, w: 1 + Math.floor(random() * 60), h: 1 + Math.floor(random() * 100) });
  return { container: { fixed: "width", w: 200 }, items };
}

/** This function gives the config with the option `direction` in its stage compact. */
const withCompact = (config: StrategyConfig, direction: string): StrategyConfig => ({ ...config, stages: { ...config.stages, compact: { option: direction } } });

const input = strip(7, 30);

describe("the stage compact of packSpace (k213)", () => {
  it("packs the named config compact as maxrects, then the compaction up", () => {
    const want = compactUp(input, packWith("maxrects", input, {}, 3));
    expect(outputHash(packConfig(input, named["compact"]!, 3))).toBe(outputHash(want));
    expect(outputHash(packWith("compact", input, { strategy: "maxrects" }, 3))).toBe(outputHash(want));
  });

  it("packs each direction as the compaction of the output of the other stages", () => {
    for (const direction of COMPACT_DIRECTIONS) {
      const want = compactWith(input, packWith("maxrects", input, { rule: "bl" }, 3), direction);
      const out = packConfig(input, withCompact(named["maxrects-bl"]!, direction), 3);
      expect(outputHash(out), direction).toBe(outputHash(want));
      expect(checkHard(input, out), direction).toEqual(ZERO);
    }
  });

  it("gives the trace stage compact with the count of the boxes that moved", () => {
    const inner = packWith("maxrects", input, { rule: "bl" }, 3);
    const at = new Map(inner.placements.map((p) => [p.id, p]));
    for (const direction of COMPACT_DIRECTIONS) {
      const out = compactWith(input, inner, direction);
      const moved = out.placements.filter((p) => at.get(p.id)!.x !== p.x || at.get(p.id)!.y !== p.y).length;
      expect(out.trace!.at(-1), direction).toEqual({ id: COMPACT_STAGE, measures: { "move.compact": moved } });
    }
    // Each box 7 lower: the compaction up moves each box, and a second compaction moves no box.
    const lower = { ...inner, placements: inner.placements.map((p) => ({ ...p, y: p.y + 7 })), size: { ...inner.size, h: inner.size.h + 7 } };
    const up = compactWith(input, lower, "up");
    expect(up.trace?.at(-1)?.measures?.["move.compact"]).toBe(input.items.length);
    expect(compactWith(input, up, "up").trace?.at(-1)?.measures?.["move.compact"]).toBe(0);
  });

  it("gives a member with the stage compact a run of the strategy compact", () => {
    const portfolio = named["portfolio-area-rows-bl"]!;
    const members = portfolio.stages["combine"]!.members!;
    const config = { ...portfolio, stages: { ...portfolio.stages, combine: { ...portfolio.stages["combine"]!, members: [members[0]!, withCompact(members[1]!, "left")] } } };
    const out = packConfig(input, config, 2);
    expect(checkHard(input, out)).toEqual(ZERO);
    expect(outputHash(packConfig(input, config, 2))).toBe(outputHash(out));
  });

  it("gives a search over orders its order on the member with the stage compact", () => {
    const restarts = named["restarts-maxrects-bl-k16"]!;
    const member = restarts.stages["combine"]!.members![0]!;
    for (const direction of COMPACT_DIRECTIONS) {
      const config = { ...restarts, stages: { ...restarts.stages, combine: { ...restarts.stages["combine"]!, members: [withCompact(member, direction)] } } };
      const out = packConfig(input, config, 4);
      expect(checkHard(input, out), direction).toEqual(ZERO);
      expect(outputHash(packConfig(input, config, 4)), direction).toBe(outputHash(out));
    }
  });
});

describe("configOfStrategy for compact (k213)", () => {
  it("gives the named config compact for the defaults", () => {
    for (const options of [{}, { direction: "up" }]) {
      const point = configOfStrategy("compact", options);
      if (!point.ok) throw new Error(point.reason);
      expect(configId(packSpace, point.config)).toBe(configId(packSpace, named["compact"]!));
    }
  });

  it("gives the point of the inner strategy with the direction in the stage compact", () => {
    for (const direction of COMPACT_DIRECTIONS) {
      const options = { strategy: "maxrects", options: { rule: "bl" }, direction, sortOrder: "height-desc" };
      const point = configOfStrategy("compact", options);
      if (!point.ok) throw new Error(point.reason);
      expect(point.config.stages["compact"]?.option, direction).toBe(direction);
      expect(outputHash(packConfig(input, point.config, 1)), direction).toBe(outputHash(packWith("compact", input, options, 1)));
    }
  });

  it("refuses options with no point", () => {
    const reasons = [
      { strategy: "maxrects", extra: 1 },
      { strategy: "maxrects", direction: "down" },
      { options: { rule: "bl" } },
      { strategy: 3 },
      { strategy: "masonry" },
      { strategy: "compact" },
    ].map((options) => configOfStrategy("compact", options));
    expect(reasons.map((point) => point.ok)).toEqual([false, false, false, false, false, false]);
  });
});

describe("compactStrategy (k213)", () => {
  it("refuses a call without the option strategy", () => {
    expect(() => packWith("compact", input, {})).toThrow(RangeError);
  });

  it("refuses a bad direction", () => {
    expect(() => packWith("compact", input, { strategy: "maxrects", direction: "down" })).toThrow(RangeError);
  });

  it("gives an UnsupportedCell for an input that the compaction does not take", () => {
    const out = packWith("maxrects", input, {}, 1);
    const child: PackInput = { ...input, items: input.items.map((item, i) => (i === 1 ? { ...item, parent: "i0" } : item)) };
    expect(() => compactWith(child, out, "left")).toThrow(UnsupportedCell);
    expect(() => compactWith(input, out, "down" as never)).toThrow(RangeError);
  });
});
