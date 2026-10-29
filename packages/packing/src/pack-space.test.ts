import { checkConfig, checkShapes, checkSpace, configId, PACK_HARD_RULES, ruleLevel, SHAPE_KIND_IDS, shapeLevel, shapeSupportProblems, spaceSize, type PackInput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  composites,
  MEASURE_SPECS,
  outputHash,
  PACK_SPACE_LEFT_OUT,
  PACK_SPACE_OPTIONS,
  packConfig,
  packSpace,
  packWith,
  PORTFOLIO_SETS,
  rectGrid,
  strategies,
  toPackInput,
  UnsupportedCell,
  UnsupportedShape,
  type StrategyConfig,
} from "./index.ts";
import { baseConfig } from "./pack-space.ts";

// The strategy space of k68. Made-up inputs of the generators only. `bench/pack-space.test.ts` compares the outputs of the named configs.

const named = packSpace.named!;
const input = toPackInput(rectGrid.generate(4, { containerSize: "freeAspect", containerShape: "circle", obstacles: "corridors", sizes: "uniform", count: 24 }));

describe("packSpace", () => {
  it("is a good space, and checkConfig accepts each named config", () => {
    expect(checkSpace(packSpace)).toEqual([]);
    for (const [name, config] of Object.entries(named)) expect(checkConfig(packSpace, config), name).toEqual([]);
  });

  it("has 5 stages and 2970 base configs with 3 levels", () => {
    expect(packSpace.stages.map((s) => s.name)).toEqual(["order", "size-search", "placement", "local-search", "combine"]);
    expect(spaceSize(packSpace, { levels: 3 }).base).toBe(2970n);
  });

  // Roadmap item L39 of the contract: cell-portfolio has a pool with one entry, the configs of PORTFOLIO_SETS.
  it("gives cell-portfolio one pool entry, and counts 3.69e19 meta configs with 3 levels", () => {
    const cell = packSpace.stages.find((s) => s.name === "combine")!.options.find((o) => o.id === "cell-portfolio")!;
    expect(cell.members!.pool).toHaveLength(1);
    const ids = (list: readonly StrategyConfig[]): string[] => list.map((c) => configId(packSpace, c)).sort();
    expect(ids(cell.members!.pool![0]!)).toEqual(ids(named["portfolio"]!.stages["combine"]!.members!));
    // The option portfolio gives nearly all of the count: 160 param points for each ordered list of 2 to 5 of the 2970 base configs. The count is more than the default `maxMeta` of 1e18
    expect(spaceSize(packSpace, { levels: 3 }).meta).toBe(null);
    expect(spaceSize(packSpace, { levels: 3, maxMeta: 10n ** 20n }).meta).toBe(36862574914409723310n);
    expect(spaceSize(packSpace, { levels: 1 }).meta).toBe(13266726236508522n);
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
    expect(() => packConfig(input, other)).toThrow(/pool/);
  });

  it("throws a RangeError for an option that the space does not have", () => {
    expect(() => baseConfig("push", { samples: 4 })).toThrow(RangeError);
    expect(() => baseConfig("portfolio")).toThrow(RangeError);
  });
});

// Roadmap item k75: the shape kinds of the items. Each option of packSpace supports only rect, but bbox of k91.
describe("packSpace and the shape kinds", () => {
  const items = [
    { id: "a", w: 10, h: 10 },
    { id: "b", w: 20, h: 10 },
  ];
  const rect: PackInput = { container: { fixed: "none" }, items };
  const circle: PackInput = { container: { fixed: "none" }, items: [...items, { id: "c", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } }] };
  const polygon: PackInput = { container: { fixed: "none" }, items: [...items, { id: "p", w: 10, h: 10, shape: { kind: "polygon", points: [[0, 0], [10, 0], [5, 10]] } }] };

  it("declares the shape kind rect on each option of each stage, but bbox", () => {
    for (const s of packSpace.stages) for (const o of s.options) if (o.id !== "bbox") expect(o.supports, `${s.name}.${o.id}`).toEqual({ shape: ["rect"] });
    // Roadmap item k91: the option bbox supports each kind, and its members get the bounding boxes (view bounds of contract 0.2.16)
    const bbox = packSpace.stages.find((s) => s.name === "combine")!.options.find((o) => o.id === "bbox")!;
    expect(bbox.supports).toEqual({ shape: [...SHAPE_KIND_IDS] });
    expect(bbox.members).toEqual({ min: 1, max: 1, ordered: true, view: "bounds" });
  });

  it("counts only the bbox configs for a shape and the same configs for a rect", () => {
    // A bbox config has 1 base member and the param turn: 2 times the base configs of the rect space
    const base3 = spaceSize(packSpace, { levels: 3 }).base;
    const base1 = spaceSize(packSpace, { levels: 1 }).base;
    for (const kind of ["circle", "polygon", "free"] as const) {
      expect(spaceSize(packSpace, { levels: 3, shapes: [kind] }), kind).toEqual({ base: 0n, meta: 5940n });
      expect(spaceSize(packSpace, { levels: 1, shapes: [kind] }), kind).toEqual({ base: 0n, meta: 1780n });
    }
    expect([base3, base1]).toEqual([2970n, 890n]);
    expect(spaceSize(packSpace, { levels: 3, shapes: ["rect", "circle"] })).toEqual({ base: 0n, meta: 2n * base3 });
    expect(spaceSize(packSpace, { levels: 3, shapes: ["rect"] })).toEqual(spaceSize(packSpace, { levels: 3 }));
  });

  it("accepts each bbox config on a shape in checkConfig, and refuses a config without bbox", () => {
    for (const kind of ["circle", "polygon", "free"] as const) {
      for (const name of ["bbox", "bbox-maxrects-bl", "bbox-skyline"]) expect(checkConfig(packSpace, named[name]!, { shapes: [kind] }), `${name} ${kind}`).toEqual([]);
      for (const name of ["rows", "maxrects-bl", "portfolio", "restarts"]) {
        const breaks = checkConfig(packSpace, named[name]!, { shapes: [kind] });
        expect(breaks.length, `${name} ${kind}`).toBeGreaterThan(0);
        expect(breaks.every((b) => b.claim === "shape"), `${name} ${kind}`).toBe(true);
      }
    }
  });

  it("refuses a polygon item and a circle item with UnsupportedShape", () => {
    for (const input of [circle, polygon]) {
      for (const name of ["rows", "maxrects-bl", "portfolio", "aspect-fit"]) {
        let error: unknown;
        try {
          packConfig(input, named[name]!);
        } catch (e) {
          error = e;
        }
        expect(error, name).toBeInstanceOf(UnsupportedShape);
        expect(error, name).toBeInstanceOf(UnsupportedCell);
        const e = error as UnsupportedShape;
        expect(e.dimension).toBe("itemShape");
        expect(e.value).toBe("mixed");
        expect(e.breaks.length).toBeGreaterThan(0);
        expect(e.breaks.every((b) => b.claim === "shape")).toBe(true);
      }
    }
    const only: PackInput = { container: { fixed: "none" }, items: [{ id: "c", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } }] };
    expect(() => packConfig(only, named["rows"]!)).toThrow(/circle/);
  });

  it("gives a RangeError for a bad config before the shape check", () => {
    expect(() => packConfig(circle, { space: "packing", stages: {} })).toThrow(RangeError);
    expect(() => packConfig(circle, { space: "packing", stages: {} })).not.toThrow(UnsupportedShape);
  });

  it("packs a rect input as packWith does", () => {
    expect(outputHash(packConfig(rect, named["maxrects-bl"]!, 3))).toBe(outputHash(packWith("maxrects", rect, { rule: "bl" }, 3)));
  });

  it("declares each shape kind only on the measures of the bounding boxes, the positions, the counts and the times", () => {
    const any = Object.values(MEASURE_SPECS).filter((s) => s.shapes !== undefined).map((s) => s.id);
    expect(any).toEqual([
      "pack.area",
      "pack.shapeFill",
      "pack.aspect",
      "pack.aspectError",
      "pack.order.inversions",
      "pack.order.breaks",
      "pack.raggedness",
      "pack.overflow",
      "pack.overflow.rate",
      "pack.stability.moved",
      "pack.stability.mean",
      "pack.stability.q95",
      "pack.deterministic",
      "pack.search.widths",
      "pack.search.ms",
    ]);
    for (const s of Object.values(MEASURE_SPECS)) if (s.shapes !== undefined && s.id !== "pack.shapeFill") expect(s.shapes, s.id).toEqual(SHAPE_KIND_IDS);
    // Contract 0.2.17: pack.shapeFill is exact on rect, polygon and circle, and an upper bound on free
    expect(MEASURE_SPECS["pack.shapeFill"].shapes).toEqual(["rect", "polygon", "circle"]);
    expect(MEASURE_SPECS["pack.shapeFill"].bound).toEqual({ shapes: ["free"], side: "upper" });
    expect(shapeSupportProblems(Object.values(MEASURE_SPECS))).toEqual([]);
    const uses = [...Object.values(MEASURE_SPECS), ...PACK_HARD_RULES];
    expect(checkShapes({ id: "c", boxes: circle.items }, uses).map((b) => b.detail.split(" ")[0])).toEqual([
      "pack.fill",
      "pack.whitespace",
      "pack.overflow.area",
      "pack.overflow.forced",
      "pack.overflow.forcedArea",
      "pack.overflow.excess",
      "pack.overflow.forcedAreaMin",
      "pack.overflow.excessArea",
      "pack.gap",
      "pack.gapToOpt",
      "no-overlap",
      "in-container",
    ]);
    expect(checkShapes({ id: "r", boxes: rect.items }, uses)).toEqual([]);
  });

  // Contract 0.2.16: the hard rules no-overlap and in-container have a safe count on the other kinds
  it("accepts the safe counts of the hard rules on a shape only at the level safe", () => {
    for (const kind of ["polygon", "circle", "free"] as const)
      expect(PACK_HARD_RULES.map((r) => ruleLevel(r, kind)), kind).toEqual(["safe", "safe", "exact", "exact"]);
    expect(PACK_HARD_RULES.map((r) => ruleLevel(r, "rect"))).toEqual(["exact", "exact", "exact", "exact"]);
    for (const input of [circle, polygon]) {
      expect(checkShapes({ id: "s", boxes: input.items }, PACK_HARD_RULES).map((b) => b.detail.split(" ")[0])).toEqual(["no-overlap", "in-container"]);
      expect(checkShapes({ id: "s", boxes: input.items }, PACK_HARD_RULES, { level: "safe" })).toEqual([]);
    }
  });

  // Contract 0.2.17: pack.shapeFill on a free shape is an upper bound. Only the level bound accepts it.
  it("refuses pack.shapeFill on a free shape at the level safe, and accepts it at the level bound", () => {
    const shapeFill = MEASURE_SPECS["pack.shapeFill"];
    expect(SHAPE_KIND_IDS.map((kind) => shapeLevel(shapeFill, kind))).toEqual(["exact", "exact", "exact", "bound"]);
    const free = { id: "f", boxes: [...items, { id: "e", w: 12, h: 6, shape: { kind: "ellipse", cx: 6, cy: 3, rx: 6, ry: 3 } } as const] };
    for (const level of [undefined, "safe"] as const) {
      const breaks = checkShapes(free, [shapeFill], level === undefined ? {} : { level });
      expect(breaks.map((b) => b.detail.split(" ")[0]), level).toEqual(["pack.shapeFill"]);
      expect(breaks[0]!.detail, level).toMatch(/only an upper bound for free/);
    }
    expect(checkShapes(free, [shapeFill], { level: "bound" })).toEqual([]);
    for (const input of [circle, polygon]) expect(checkShapes({ id: "s", boxes: input.items }, [shapeFill])).toEqual([]);
    // A bbox config checks only the hard rules, so a free input still packs (BBOX_CHECK stays at the level safe)
    expect(() => packConfig({ container: { fixed: "none" }, items: free.boxes }, named["bbox"]!, 2)).not.toThrow();
  });

  it("packs a shape input with a bbox config after the safe check of the hard rules", () => {
    const free: PackInput = { container: { fixed: "none" }, items: [...items, { id: "e", w: 12, h: 6, shape: { kind: "ellipse", cx: 6, cy: 3, rx: 6, ry: 3 } }] };
    for (const input of [circle, polygon, free]) {
      const out = packConfig(input, named["bbox"]!, 2);
      expect(outputHash(out)).toBe(outputHash(packWith("bbox", input, { member: { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } } }, 2)));
      expect(out.overflow).toEqual([]);
    }
  });
});

// The options of each strategy as params of packSpace. The joint playground of layout-stack builds its controls from them.
describe("packSpace and the options of the strategies", () => {
  /** This function tells if a place names a stage, a param or the members of an option of packSpace. */
  const resolves = (place: string): boolean => {
    const [stage, option, field, ...rest] = place.split(".");
    const s = packSpace.stages.find((x) => x.name === stage);
    if (s === undefined || rest.length > 0) return false;
    if (option === undefined) return field === undefined;
    const o = s.options.find((x) => x.id === option);
    if (o === undefined || field === undefined) return false;
    return field === "members" ? o.members !== undefined : o.params.some((p) => p.name === field);
  };

  it("gives each option of each strategy a place in the space, or a reason in PACK_SPACE_LEFT_OUT", () => {
    const leftOut: string[] = [];
    for (const [id, places] of Object.entries(PACK_SPACE_OPTIONS)) {
      for (const [key, place] of Object.entries(places)) {
        if (place === null) leftOut.push(`${id}.${key}`);
        else expect(resolves(place), `${id}.${key} at ${place}`).toBe(true);
      }
    }
    expect(leftOut.toSorted()).toEqual(Object.keys(PACK_SPACE_LEFT_OUT).toSorted());
    for (const reason of Object.values(PACK_SPACE_LEFT_OUT)) expect(reason.split(" ").length).toBeLessThanOrEqual(25);
  });

  it("has a record for each strategy of the registry, with each key of its defaults", () => {
    for (const s of [...strategies, ...composites]) {
      expect(PACK_SPACE_OPTIONS, s.id).toHaveProperty([s.id]);
      for (const key of Object.keys(s.defaults as object)) expect(PACK_SPACE_OPTIONS[s.id], `${s.id}.${key}`).toHaveProperty([key]);
    }
  });

  it("gives the options maxMembers and budgetMs with the params limitMembers and limitTime", () => {
    const pool = named["portfolio"]!.stages["combine"]!.members!;
    const cell = (params: Record<string, string | number | boolean>): StrategyConfig => ({ space: "packing", stages: { combine: { option: "cell-portfolio", params, members: pool } } });
    expect(outputHash(packConfig(input, cell({ limitMembers: true, maxMembers: 1 }), 2))).toBe(outputHash(packWith("portfolio", input, { maxMembers: 1 }, 2)));
    expect(outputHash(packConfig(input, cell({ k: 2, limitMembers: true, maxMembers: 1 }), 2))).toBe(outputHash(packWith("portfolio", input, { k: 2, maxMembers: 1 }, 2)));
    const list: StrategyConfig = { space: "packing", stages: { combine: { option: "portfolio", params: { limitTime: true, budgetMs: 2000 }, members: [named["rows"]!, named["maxrects"]!] } } };
    expect(outputHash(packConfig(input, list))).toBe(outputHash(packWith("portfolio", input, { members: ["rows", "maxrects"], budgetMs: 2000 })));
    // Without the switch params, the outputs do not change
    expect(outputHash(packConfig(input, cell({})))).toBe(outputHash(packWith("portfolio", input)));
  });

  it("gives the options of restarts with its params, and budgetMs only with limitTime", () => {
    const bl = named["maxrects-bl"]!;
    const restarts = (params: Record<string, string | number | boolean>): StrategyConfig => ({ space: "packing", stages: { combine: { option: "restarts", params, members: [bl] } } });
    // The default member of restarts is maxrects-bl
    const want = (options: Record<string, unknown>): string => outputHash(packWith("restarts", input, options, 3));
    expect(outputHash(packConfig(input, named["restarts"]!, 3))).toBe(want({}));
    expect(outputHash(packConfig(input, restarts({ iterations: 4, perturb: "shuffle", strength: 0.5, key: "area" }), 3))).toBe(
      want({ iterations: 4, perturb: "shuffle", strength: 0.5, key: ["pack.area", "pack.overflow.excessArea", "pack.fill"] }),
    );
    expect(outputHash(packConfig(input, restarts({ limitTime: true, budgetMs: 2000 }), 3))).toBe(want({ limitTime: true, budgetMs: 2000 }));
    // Without the switch param, the config has no budgetMs, and checkConfig refuses it
    expect(outputHash(packConfig(input, restarts({ limitTime: false }), 3))).toBe(want({}));
    expect(() => packConfig(input, restarts({ budgetMs: 1 }), 3)).toThrow(/budgetMs/);
  });

  // Roadmap item k79: the goal-driven ruin and recreate
  it("gives the options of ruin-recreate with its params", () => {
    const ruin = (params: Record<string, string | number | boolean>, member = "maxrects-bl"): StrategyConfig => ({
      space: "packing",
      stages: { combine: { option: "ruin-recreate", params, members: [named[member]!] } },
    });
    // The default member of ruin-recreate is maxrects-bl
    const want = (options: Record<string, unknown>): string => outputHash(packWith("ruin-recreate", input, options, 3));
    expect(outputHash(packConfig(input, named["ruin-recreate"]!, 3))).toBe(want({}));
    expect(outputHash(packConfig(input, named["ruin-recreate-maxrects-bl-k64"]!, 3))).toBe(want({ iterations: 64 }));
    expect(outputHash(packConfig(input, ruin({ iterations: 8, ruin: "adjacent", strength: 0.5, shrink: 0.05 }), 3))).toBe(
      want({ iterations: 8, ruin: "adjacent", strength: 0.5, shrink: 0.05 }),
    );
    expect(outputHash(packConfig(input, named["ruin-recreate-skyline-k64"]!, 3))).toBe(outputHash(packConfig(input, ruin({ iterations: 64 }, "skyline"), 3)));
    expect(() => packConfig(input, ruin({ iterations: 0 }), 3)).toThrow(/iterations/);
  });
});
