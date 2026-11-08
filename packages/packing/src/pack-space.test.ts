import { checkConfig, checkShapes, checkSpace, configId, PACK_HARD_RULES, ruleLevel, SHAPE_KIND_IDS, shapeLevel, shapeSupportProblems, spaceSize, type PackInput } from "@mark1russell7/layout-contract";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  allStrategies,
  checkSelectTable,
  composites,
  configOfStrategy,
  MEASURE_SPECS,
  outputHash,
  PACK_DEFAULT_TABLE,
  PACK_SPACE_LEFT_OUT,
  PACK_SPACE_OPTIONS,
  packConfig,
  packSpace,
  packWith,
  PORTFOLIO_SETS,
  rectGrid,
  SELECT_TABLE,
  shapeStrategies,
  sideAnchorsStrategy,
  standaloneStrategies,
  strategy,
  strategies,
  toPackInput,
  treemapPack,
  treemapPivotMiddle,
  treemapPivotSize,
  treemapPivotSplit,
  UnsupportedCell,
  UnsupportedShape,
  type PackOutput,
  type StrategyConfig,
  type StrategyPoint,
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

  // Roadmap item k90 adds 3 base configs with 3 levels: hole-degree with 3 levels of steps. Before k90 the count was 2970.
  // The order graph-bfs (layout-stack L34) adds 591 base configs with 3 levels and 177 with 1 level: each placement but push. Before L34 the counts were 2973 and 891.
  // The rule wire of k136 adds 144 base configs with 3 levels and 24 with 1 level. Before k136 the counts were 3564 and 1068.
  // Roadmap item k25 adds 90 base configs with 3 levels, and 30 with 1 level: 6 orders by 3 samples by 5 values of bottom-left and best-fit. Before k25 the counts were 3708 and 1092.
  // Roadmap item k94 adds 3 base configs with 3 levels and 1 with 1 level: circle-quasi-physical with its levels of iterations. Before k94 the counts were 3798 and 1122.
  // Roadmap item k29 adds 1 base config with each count of levels: shelf-breaks, with no param. Before k29 the counts were 3830 and 1138.
  // Roadmap item k30 adds shelf-online: 3 levels of r by 2 fits, and 1 level of r by 2 fits. Before k30 the counts were 3831 and 1139.
  // Roadmap item k29 adds treemap-spiral: 1 base config with each count of levels. Before treemap-spiral the counts were 3837 and 1141.
  // Roadmap item k27 adds the pivots middle and size of pivot-split: 2 base configs with each count of levels. Before them the counts were 3838 and 1142.
  it("has 5 stages and 3801 base configs with 3 levels", () => {
    expect(packSpace.stages.map((s) => s.name)).toEqual(["order", "size-search", "placement", "local-search", "combine"]);
    expect(spaceSize(packSpace, { levels: 3 }).base).toBe(3840n);
    expect(spaceSize(packSpace, { levels: 1 }).base).toBe(1144n);
  });

  // Roadmap item L39 of the contract: cell-portfolio has a pool with one entry, the configs of PORTFOLIO_SETS.
  // Roadmap item k137 adds relax-pull: 3 meta configs for each base config with 3 levels, and 1 with 1 level.
  it("gives cell-portfolio one pool entry, and counts 9.46e20 meta configs with 3 levels", () => {
    const cell = packSpace.stages.find((s) => s.name === "combine")!.options.find((o) => o.id === "cell-portfolio")!;
    expect(cell.members!.pool).toHaveLength(1);
    const ids = (list: readonly StrategyConfig[]): string[] => list.map((c) => configId(packSpace, c)).sort();
    expect(ids(cell.members!.pool![0]!)).toEqual(ids(named["portfolio"]!.stages["combine"]!.members!));
    // The option portfolio gives nearly all of the count: 800 param points for each ordered list of 2 to 5 of the 3708 base configs. The count is more than the default `maxMeta` of 1e18
    // Before k90 the counts were 36862574914409402550 and 13266726236504962. Before k117 they were 37049239404514333362 and 13341577899037878.
    // The work limit of k117 gives 5 param points: no limit, then 4 values of budgetWork. The rect counts before k117 were 36862574914409402550 and 13266726236504962.
    // The ruin and recreate of k79 gives 108 param points with 3 levels and 4 with 1 level, for each base config.
    // The overlap minimization of k80 gives 9 param points for each base config with 3 levels, and 1 with 1 level.
    // Before k80 the counts were 185246197022536573518, 66707889492006738, 184312874572011990510 and 66333631179349290.
    // Before k26 the counts were 185246197022536600275, 66707889492007629, 184312874572012017240 and 66333631179350180.
    // The searches over orders of k26 give 135 param points each with 3 levels and 5 each with 1 level, for each base config.
    // Before k124 the counts were 185246197022537804340, 66707889492020994, 184312874572013220090 and 66333631179363530.
    // The relax pass of k124 gives 3 param points for each base config with 3 levels, and 1 with 1 level.
    // Before k125 the counts were 185246197022537813259, 66707889492021885, 184312874572013229000 and 66333631179364420.
    // The force packer of k125 gives 9 param points for each base config with 3 levels, and 1 with 1 level.
    // Before k127 the counts were 185246197022537840016, 66707889492022776, 184312874572013255730 and 66333631179365310.
    // The key fill of the portfolio (k127) gives 3 values of the param key, not 2. Thus each meta count is 1.5 times the count before.
    // Before k135 the counts were 277869295533801539436, 100061834237626086, 276469311858014672730 and 99500446768640790.
    // The table pack of select (k135) gives 2 values of the param table, not 1. Thus each count grows by the select configs.
    // Before L34 the counts were 277869295533810375192, 100061834238419076, 276469311858023490660 and 99500446769432000.
    // The order graph-bfs of L34 gives more base configs, so each count of member lists grows.
    // The rule wire of k136 does the same. Before k136 the counts were 688291902860755874904, 248007594904236900, 685398465078246361680 and 246846729112282916.
    // Roadmap item k25 adds 2 placement options, so each count grows again. Before k25 the counts were 839122620777889305516, 277205931006818808, 835731956558436808155 and 275936906614691767.
    expect(spaceSize(packSpace, { levels: 3 }).meta).toBe(null);
    expect(spaceSize(packSpace, { levels: 3, maxMeta: 10n ** 20n }).meta).toBe(null);
    // Roadmap item k94 adds base configs to the members of the meta configs. Before k94 the counts were 946077247154414479086 and 317504231368154898.
    // Roadmap item k29 adds a base config to the members. Before k29 the counts were 986629892909639107990 and 340836128598216010.
    // Roadmap item k30 adds base configs to the members. Before k30 the counts were 987919200607642297485 and 342338667185079123.
    // Roadmap item k29 adds treemap-spiral to the members: one base config for each count of levels.
    // Before k29 the counts were 995683381705634116776, 345359641400040422, 987919200607642301316 and 342338667185080262.
    // Roadmap item k193 adds the side none to side-anchors: one config for each member. Before k193 the count was 995683381705634112939.
    // Roadmap item k27 adds the pivots middle and size of pivot-split to the members. Before them the counts were 996982144242458314300, 346878105010926668, 989209855826161117216 and 343846500125987340.
    expect(spaceSize(packSpace, { levels: 3, maxMeta: 10n ** 21n }).meta).toBe(999583735148177874960n);
    // Roadmap item k193 adds the side none to side-anchors. Before k193 the count with 1 level was 345359641400039281.
    expect(spaceSize(packSpace, { levels: 1 }).meta).toBe(349931055381002492n);
    // Roadmap item k193 adds the side none to side-anchors. Before k193 the rect counts were 987919200607642297485 and 342338667185079123.
    expect(spaceSize(packSpace, { levels: 3, shapes: ["rect"], maxMeta: 10n ** 21n })).toEqual({ base: 3834n, meta: 991795213049278581828n });
    expect(spaceSize(packSpace, { levels: 1, shapes: ["rect"] })).toEqual({ base: 1142n, meta: 346878105010926668n });
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

  it("declares the shape kind rect on each option of each stage, but bbox and the options of the shaped placements", () => {
    // Roadmap items k90 and k94: hole-degree and circle-quasi-physical support only circle.
    // Roadmap item k200: near-rects and raster-nofit support rect, polygon and circle. The order input and the options none support these 3 kinds.
    const outlines = ["placement.near-rects", "placement.raster-nofit", "order.input", "size-search.none", "local-search.none"];
    for (const s of packSpace.stages)
      for (const o of s.options) {
        const at = `${s.name}.${o.id}`;
        if (o.id === "bbox") continue;
        const want = at === "placement.hole-degree" || at === "placement.circle-quasi-physical" ? ["circle"] : outlines.includes(at) ? ["rect", "polygon", "circle"] : ["rect"];
        expect(o.supports, at).toEqual({ shape: want });
      }
    // Roadmap item k91: the option bbox supports each kind, and its members get the bounding boxes (view bounds of contract 0.2.16)
    const bbox = packSpace.stages.find((s) => s.name === "combine")!.options.find((o) => o.id === "bbox")!;
    expect(bbox.supports).toEqual({ shape: [...SHAPE_KIND_IDS] });
    expect(bbox.members).toEqual({ min: 1, max: 1, ordered: true, view: "bounds" });
  });

  it("counts the bbox configs for a shape, the hole-degree configs for a circle, and the rect configs for a rect", () => {
    // A bbox config has 1 base member and the param turn: 2 times the base configs of the rect space. Before L34 the meta counts were 5940 and 1780, and the rect counts 2970 and 890.
    const base3 = spaceSize(packSpace, { levels: 3, shapes: ["rect"] }).base;
    const base1 = spaceSize(packSpace, { levels: 1, shapes: ["rect"] }).base;
    // Roadmap item k200: a polygon input gets the base configs of near-rects and raster-nofit, 3 for each with 3 levels and 1 for each with 1 level.
    // Before k200 the polygon counts were 0 and 0.
    for (const [kind, three, one] of [["polygon", 6n, 2n], ["free", 0n, 0n]] as const) {
      expect(spaceSize(packSpace, { levels: 3, shapes: [kind] }), kind).toEqual({ base: three, meta: 7668n });
      expect(spaceSize(packSpace, { levels: 1, shapes: [kind] }), kind).toEqual({ base: one, meta: 2284n });
    }
    // Roadmap item k25 adds 75 rect configs with 3 levels and 25 with 1 level. Before k25 the rect counts were 2970 and 890, and the bbox counts were 5940 and 1780.
    // Roadmap item k29 adds 1 rect config with each count of levels. Before k29 the rect counts were 3824 and 1136, and the shape counts 7648 and 2272.
    // Roadmap item k30 adds 6 rect configs with 3 levels and 2 with 1 level. Before k30 the rect counts were 3825 and 1137, and the shape counts 7650 and 2274.
    // Roadmap item k29 adds treemap-spiral: 1 rect config with each count of levels. Before treemap-spiral the rect counts were 3831 and 1139, and the shape counts 7662 and 2278.
    // Roadmap items k90 and k94: a circle input also gets the base configs of hole-degree and circle-quasi-physical, 1 for each level. Before k94 the counts were 3 and 1.
    // Roadmap item k200 adds the 6 and 2 base configs of near-rects and raster-nofit. Before k200 the circle counts were 6 and 2.
    // Roadmap item k27 adds the pivots middle and size of pivot-split: 2 rect configs with each count of levels. Before them the rect counts were 3832 and 1140, and the shape counts 7664 and 2280.
    expect(spaceSize(packSpace, { levels: 3, shapes: ["circle"] })).toEqual({ base: 12n, meta: 7668n });
    expect(spaceSize(packSpace, { levels: 1, shapes: ["circle"] })).toEqual({ base: 4n, meta: 2284n });
    expect([base3, base1]).toEqual([3834n, 1142n]);
    // A mix of rect and circle items gets only the configs that support both kinds: near-rects and raster-nofit. Before k200 the base count was 0.
    expect(spaceSize(packSpace, { levels: 3, shapes: ["rect", "circle"] })).toEqual({ base: 6n, meta: 2n * base3 });
    expect(spaceSize(packSpace, { levels: 3 }).base).toBe(base3 + 6n);
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

  // Roadmap item k200: packConfig refused a circle item for near-rects and raster-nofit, but packWith packed it.
  it("packs each shape kind of the registry entries of near-rects and raster-nofit as packWith does", () => {
    const strip = (items: PackInput["items"]): PackInput => ({ container: { w: 24, fixed: "width" }, items });
    const disc = (id: string, r: number) => ({ id, w: 2 * r, h: 2 * r, shape: { kind: "circle" as const, cx: r, cy: r, r } });
    const wedge = (id: string) => ({ id, w: 8, h: 6, shape: { kind: "polygon" as const, points: [[0, 0], [8, 0], [0, 6]] as [number, number][] } });
    const inputs: Record<string, PackInput> = {
      rect: strip(items),
      circle: strip([disc("a", 3), disc("b", 2), disc("c", 4)]),
      polygon: strip([wedge("a"), wedge("b"), wedge("c")]),
      mixed: strip([wedge("a"), disc("b", 2), { id: "c", w: 6, h: 4 }]),
    };
    for (const id of ["near-rects", "raster-nofit"]) {
      // The option of packSpace takes the item shapes of the registry entry. The cell mixed is a mix of these kinds.
      const placement = packSpace.stages.find((s) => s.name === "placement")!.options.find((o) => o.id === id)!;
      const kinds = [...placement.supports!.shape!, "mixed"];
      expect([...strategy(id).supports.itemShape!].sort(), id).toEqual([...kinds].sort());
      const point = configOfStrategy(id);
      if (!point.ok) throw new Error(point.reason);
      for (const [kind, input] of Object.entries(inputs)) {
        expect(kinds, `${id} ${kind}`).toContain(kind);
        expect(outputHash(packConfig(input, point.config, 5)), `${id} ${kind}`).toBe(outputHash(packWith(id, input, {}, 5)));
      }
      // An ellipse has the shape kind free, and free is not a kind of the entry: packConfig refuses it, and packWith too.
      const free = strip([{ id: "f", w: 4, h: 2, shape: { kind: "ellipse", cx: 2, cy: 1, rx: 2, ry: 1 } }]);
      expect(() => packConfig(free, point.config), id).toThrow(UnsupportedShape);
      expect(() => packWith(id, free, {}, 5), id).toThrow();
    }
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
      "pack.balance.gapCv",
      "pack.balance.centroidOffset",
      "pack.balance.side.top",
      "pack.balance.side.right",
      "pack.balance.side.bottom",
      "pack.balance.side.left",
      "pack.balance.sideRange",
      "pack.stability.procrustes",
      "pack.stability.seed",
    ]);
    // The balance specs of the contract (k123) read the area of each box, so they declare only rect
    const rectOnly = (id: string): boolean => id.startsWith("pack.balance.");
    for (const s of Object.values(MEASURE_SPECS)) if (s.shapes !== undefined && s.id !== "pack.shapeFill") expect(s.shapes, s.id).toEqual(rectOnly(s.id) ? ["rect"] : SHAPE_KIND_IDS);
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
      "pack.balance.gapCv",
      "pack.balance.centroidOffset",
      "pack.balance.side.top",
      "pack.balance.side.right",
      "pack.balance.side.bottom",
      "pack.balance.side.left",
      "pack.balance.sideRange",
      // Contract 0.5.0: a circle beside a rect counts by its bounding box, so no-overlap is only safe for the 2 kinds of this input.
      "no-overlap",
      "no-overlap",
    ]);
    expect(checkShapes({ id: "r", boxes: rect.items }, uses)).toEqual([]);
  });

  // Contract 0.2.16: the hard rules no-overlap and in-container have a safe count on the other kinds. Contract 0.5.0: these rules are exact on a circle, with a limit.
  it("accepts the safe counts of the hard rules on a shape only at the level safe", () => {
    for (const kind of ["polygon", "free"] as const)
      expect(PACK_HARD_RULES.map((r) => ruleLevel(r, kind)), kind).toEqual(["safe", "safe", "exact", "exact"]);
    for (const kind of ["rect", "circle"] as const)
      expect(PACK_HARD_RULES.map((r) => ruleLevel(r, kind)), kind).toEqual(["exact", "exact", "exact", "exact"]);
    for (const [input, refused] of [[circle, ["no-overlap", "no-overlap"]], [polygon, ["no-overlap", "in-container"]]] as const) {
      expect(checkShapes({ id: "s", boxes: input.items }, PACK_HARD_RULES).map((b) => b.detail.split(" ")[0])).toEqual(refused);
      expect(checkShapes({ id: "s", boxes: input.items }, PACK_HARD_RULES, { level: "safe" })).toEqual([]);
    }
    // Only circles, with no neighbour of another kind: the strict level accepts them.
    const onlyCircles = [{ id: "c", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } }] as const;
    expect(checkShapes({ id: "s", boxes: onlyCircles }, PACK_HARD_RULES)).toEqual([]);
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
    for (const s of [...strategies, ...shapeStrategies, ...composites, ...standaloneStrategies, sideAnchorsStrategy]) {
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

  // Roadmap item k80: the overlap minimization
  it("gives the options of overlap-min with its params", () => {
    const strip = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", sizes: "uniform", count: 16 }));
    const overlap = (params: Record<string, string | number | boolean>, member = "maxrects-bl"): StrategyConfig => ({
      space: "packing",
      stages: { combine: { option: "overlap-min", params, members: [named[member]!] } },
    });
    // The default member of overlap-min is maxrects-bl
    const want = (options: Record<string, unknown>): string => outputHash(packWith("overlap-min", strip, options, 3));
    expect(outputHash(packConfig(strip, overlap({ iterations: 256 }), 3))).toBe(want({ iterations: 256 }));
    expect(outputHash(packConfig(strip, overlap({ iterations: 128, step: 0.05 }), 3))).toBe(want({ iterations: 128, step: 0.05 }));
    expect(outputHash(packConfig(strip, overlap({ iterations: 256 }, "skyline"), 3))).toBe(want({ iterations: 256, member: "skyline" }));
    expect(named["overlap-min-maxrects-bl-k8192"]).toEqual(overlap({ iterations: 8192 }));
    expect(named["overlap-min-skyline-k8192"]).toEqual(overlap({ iterations: 8192 }, "skyline"));
    expect(() => packConfig(strip, overlap({ step: 0 }), 3)).toThrow(/step/);
  });

  // Roadmap item k26: the searches over orders
  it("gives the options of anneal, genetic and tabu with their params, and budgetWork only with limitWork", () => {
    const search = (option: string, params: Record<string, string | number | boolean>, member = "maxrects-bl"): StrategyConfig => ({
      space: "packing",
      stages: { combine: { option, params, members: [named[member]!] } },
    });
    const want = (id: string, options: Record<string, unknown>, seed = 3): string => outputHash(packWith(id, input, options, seed));
    // The default member of each search is maxrects-bl. The test of the named configs in `bench/pack-space.test.ts` packs them.
    for (const id of ["anneal", "genetic", "tabu"]) expect(configId(packSpace, named[id]!), id).toBe(configId(packSpace, search(id, {})));
    expect(outputHash(packConfig(input, search("anneal", { iterations: 4, temperature: 0.1, cooling: 0.5 }), 3))).toBe(want("anneal", { iterations: 4, temperature: 0.1, cooling: 0.5 }));
    expect(outputHash(packConfig(input, search("genetic", { iterations: 4, population: 3, mutation: 1 }), 3))).toBe(want("genetic", { iterations: 4, population: 3, mutation: 1 }));
    expect(outputHash(packConfig(input, search("tabu", { iterations: 4, tenure: 2, neighbors: 3 }), 3))).toBe(want("tabu", { iterations: 4, tenure: 2, neighbors: 3 }));
    expect(configId(packSpace, named["anneal-skyline-k16"]!)).toBe(configId(packSpace, search("anneal", { iterations: 16 }, "skyline")));
    const work = packConfig(input, search("tabu", { iterations: 4, limitWork: true, budgetWork: 4000 }), 3);
    expect(outputHash(work)).toBe(want("tabu", { iterations: 4, budgetWork: 4000 }));
    expect(work.trace!.at(-1)!.measures).toMatchObject({ "work.budget": 4000 });
    expect(() => packConfig(input, search("genetic", { budgetWork: 4000 }), 3)).toThrow(/budgetWork/);
    expect(() => packConfig(input, search("anneal", { iterations: 0 }), 3)).toThrow(/iterations/);
  });

  // Roadmap item k117: the work limit has the switch param limitWork, as the time limit has limitTime.
  it("gives the option budgetWork with the param limitWork, for a portfolio and for restarts", () => {
    const combine = packSpace.stages.find((s) => s.name === "combine")!;
    for (const id of ["portfolio", "cell-portfolio", "restarts", "anneal", "genetic", "tabu"]) {
      const params = combine.options.find((o) => o.id === id)!.params;
      expect(params.find((p) => p.name === "limitWork"), id).toEqual({ name: "limitWork", kind: "bool", default: false });
      expect(params.find((p) => p.name === "budgetWork"), id).toEqual({ name: "budgetWork", kind: "enum", values: [4000, 16000, 64000, 256000], default: 16000, when: { param: "limitWork", in: [true] } });
    }
    const pool = named["portfolio"]!.stages["combine"]!.members!;
    const cell = (params: Record<string, string | number | boolean>): StrategyConfig => ({ space: "packing", stages: { combine: { option: "cell-portfolio", params, members: pool } } });
    expect(outputHash(packConfig(input, cell({ limitWork: true, budgetWork: 4000 }), 2))).toBe(outputHash(packWith("portfolio", input, { budgetWork: 4000 }, 2)));
    const list: StrategyConfig = { space: "packing", stages: { combine: { option: "portfolio", params: { limitWork: true, budgetWork: 4000 }, members: [named["rows"]!, named["maxrects"]!] } } };
    expect(outputHash(packConfig(input, list))).toBe(outputHash(packWith("portfolio", input, { members: ["rows", "maxrects"], budgetWork: 4000 })));
    const restarts = (params: Record<string, string | number | boolean>): StrategyConfig => ({ space: "packing", stages: { combine: { option: "restarts", params, members: [named["maxrects-bl"]!] } } });
    const work = packConfig(input, restarts({ limitWork: true, budgetWork: 4000 }), 3);
    expect(outputHash(work)).toBe(outputHash(packWith("restarts", input, { budgetWork: 4000 }, 3)));
    expect(work.trace!.at(-1)!.measures).toMatchObject({ "work.budget": 4000, "work.stopped": 1 });
    // With the two limits on, the config gives the two options
    expect(outputHash(packConfig(input, restarts({ limitWork: true, budgetWork: 16000, limitTime: true, budgetMs: 2000 }), 3))).toBe(
      outputHash(packWith("restarts", input, { budgetWork: 16000, limitTime: true, budgetMs: 2000 }, 3)),
    );
    // Without the switch param, the output does not change, and checkConfig refuses budgetWork
    expect(outputHash(packConfig(input, restarts({ limitWork: false }), 3))).toBe(outputHash(packWith("restarts", input, {}, 3)));
    expect(() => packConfig(input, restarts({ budgetWork: 4000 }), 3)).toThrow(/budgetWork/);
    // A value that is not in the list breaks the config, but the option of the strategy takes it
    expect(() => packConfig(input, restarts({ limitWork: true, budgetWork: 500 }), 3)).toThrow(/budgetWork/);
    expect(() => packConfig(input, restarts({ limitWork: true, budgetWork: 5000 }), 3)).toThrow(/budgetWork/);
  });
});

describe("configOfStrategy (k135)", () => {
  const idOf = (point: StrategyPoint): string => (point.ok ? configId(packSpace, point.config) : point.reason);
  const reason = (id: string, options: Record<string, unknown>): string => {
    const point = configOfStrategy(id, options);
    return point.ok ? "a point" : point.reason;
  };

  it("gives the named config of each id of the registry", () => {
    for (const s of [...strategies, ...shapeStrategies, ...composites]) expect(idOf(configOfStrategy(s.id)), s.id).toBe(configId(packSpace, named[s.id]!));
  });

  it("gives the named config pack for pack with no options, and for select with PACK_DEFAULT_TABLE or its name", () => {
    const want = configId(packSpace, named["pack"]!);
    expect(idOf(configOfStrategy("pack"))).toBe(want);
    expect(idOf(configOfStrategy("select", { table: PACK_DEFAULT_TABLE }))).toBe(want);
    expect(idOf(configOfStrategy("select", { table: "pack" }))).toBe(want);
    // A copy of the table is equal to the table, so it has the same name
    expect(idOf(configOfStrategy("select", { table: JSON.parse(JSON.stringify(PACK_DEFAULT_TABLE)) as unknown }))).toBe(want);
    expect(idOf(configOfStrategy("select", { table: SELECT_TABLE }))).toBe(configId(packSpace, named["select"]!));
    expect(want).not.toBe(configId(packSpace, named["select"]!));
    expect(() => checkSelectTable(PACK_DEFAULT_TABLE, 2)).not.toThrow();
  });

  it("gives each member its own point", () => {
    expect(idOf(configOfStrategy("restarts", { member: { strategy: "maxrects", options: { rule: "bl" } }, iterations: 16 }))).toBe(configId(packSpace, named["restarts-maxrects-bl-k16"]!));
    expect(idOf(configOfStrategy("aspect-fit", { strategy: "maxrects", options: { rule: "bssf" } }))).toBe(configId(packSpace, named["aspect-fit-maxrects-bssf"]!));
    const members = [{ strategy: "rows" }, { strategy: "maxrects", options: { rule: "bl" } }];
    expect(idOf(configOfStrategy("portfolio", { members, key: "area" }))).toBe(configId(packSpace, named["portfolio-area-rows-bl"]!));
  });

  it("gives a reason for a strategy, an option or a value that packSpace does not hold", () => {
    expect(reason("nothing", {})).toMatch(/no strategy nothing/);
    expect(reason("rows", { color: "red" })).toMatch(/no place for the option rows\.color/);
    expect(reason("rows", { fit: "first" })).toMatch(/does not hold the option rows\.fit/);
    expect(reason("select", { table: { leaf: 0, pick: 0 } })).toMatch(/a value of NAMED_VALUES/);
    expect(reason("pack", { strategy: "rows" })).toMatch(/without options/);
    expect(reason("maxrects", { rule: "nothing" })).toMatch(/not a point of packSpace/);
    expect(reason("restarts", { member: 3 })).toMatch(/not a strategy id/);
    expect(reason("restarts", { member: { strategy: "rows", options: { color: "red" } } })).toMatch(/The member rows .* no place/);
    expect(reason("portfolio", { k: 2, members: ["rows", "maxrects"] })).toMatch(/A config has one/);
    expect(reason("relax", { pull: 1 })).toMatch(/only with the strength 0/);
  });

  it("keeps the configId of each named config of main", () => {
    // The list of main before k135, with no named config pack and no named config of the rule wire of k136, of k137, of k25, of k94 or of k142. A change of a config or of canonicalConfig changes the hash.
    const standaloneNames = ["sleator", "shelf-breaks", "shelf-online", "beam", "exact-strip", "binary-height", "near-rects", "raster-nofit", "masonry", "masonry-shortest", "masonry-lpt", "columns-linear-partition", "treemap", "treemap-squarified", "treemap-slice-dice", "treemap-strip", "treemap-pivot-split", "treemap-pivot-middle", "treemap-pivot-size", "treemap-spiral", "side-anchors-first-left"];
    const added = ["pack", "maxrects-wire", "relax-pull-rows", "relax-pull-maxrects-bl", "bottom-left", "bottom-left-liu-teng", "best-fit", "best-fit-tall", "best-fit-short", "circle-quasi-physical", ...standaloneNames];
    const list = Object.entries(named).filter(([name]) => !added.includes(name)).map(([name, config]) => `${name}=${configId(packSpace, config)}`);
    expect(createHash("sha256").update(list.sort().join("\n")).digest("hex")).toBe("d83549fe8a13e3f8c5fe8af9fc08dc17ec13b0087dc55f81bc9f948316a67a46");
  });
});

describe("the pivot of the treemap (k27)", () => {
  const input: PackInput = { container: { fixed: "none" }, items: [3, 9, 4, 12, 5, 7, 2, 8].map((side, index) => ({ id: `b${index}`, w: side * 3, h: side * 2 })) };

  it("gives each pivot rule the output of its function, and the default rule is split", () => {
    expect(outputHash(packConfig(input, named["treemap-pivot-middle"]!))).toBe(outputHash(treemapPack(input, treemapPivotMiddle)));
    expect(outputHash(packConfig(input, named["treemap-pivot-size"]!))).toBe(outputHash(treemapPack(input, treemapPivotSize)));
    expect(outputHash(packConfig(input, named["treemap-pivot-split"]!))).toBe(outputHash(treemapPack(input, treemapPivotSplit)));
    expect(outputHash(packConfig(input, named["treemap-pivot-middle"]!))).not.toBe(outputHash(packConfig(input, named["treemap-pivot-size"]!)));
  });

  it("gives the param pivot only to the method pivot-split", () => {
    expect(checkConfig(packSpace, named["treemap-pivot-size"]!)).toEqual([]);
    const strip = named["treemap-strip"]!;
    expect(strip.stages["placement"]).toEqual({ option: "treemap", params: { method: "strip" } });
    const withPivot: StrategyConfig = { ...strip, stages: { ...strip.stages, placement: { option: "treemap", params: { method: "strip", pivot: "size" } } } };
    expect(checkConfig(packSpace, withPivot).length).toBeGreaterThan(0);
  });
});

describe("the point of side-anchors (k193)", () => {
  // Made-up inputs: each container size, with no obstacle, with rectangle obstacles and with a holed container.
  const CASES = (["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"] as const).flatMap((containerSize) =>
    (
      [
        ["rect", "none"],
        ["rect", "scattered"],
        ["rect", "corridors"],
        ["holes", "corridors"],
      ] as const
    ).map(([containerShape, obstacles]) => ({ containerSize, containerShape, obstacles, sizes: "uniform" as const, count: 10 })),
  );

  /** This function gives the hash of an output, or the name of the error class of a refusal. */
  const result = (pack: () => PackOutput): string => {
    try {
      return outputHash(pack());
    } catch (error) {
      return `refused ${(error as Error).constructor.name}`;
    }
  };

  it.each([{}, { first: { side: "left", at: 0.5 } }, { first: { side: "top", at: 0.25 } }])("packs as packWith with the same options: %j", (options) => {
    const point = configOfStrategy("side-anchors", options);
    expect(point.ok).toBe(true);
    if (!point.ok) return;
    const results = CASES.map((params) => {
      const input = toPackInput(rectGrid.generate(1, params));
      const viaWith = result(() => packWith("side-anchors", input, options, 3));
      const viaConfig = result(() => packConfig(input, point.config, 3));
      expect(viaConfig, JSON.stringify(params)).toBe(viaWith);
      return viaWith;
    });
    // Each case packs or refuses in both paths. Some cases of each kind exist.
    expect(results.some((r) => r.startsWith("refused"))).toBe(true);
    expect(results.some((r) => !r.startsWith("refused"))).toBe(true);
  });

  /**
   * The strategies whose point is not the strategy with no options, with the reason.
   * `aspect-fit` needs an inner strategy, so `packWith` refuses it, and its point wraps `maxrects`.
   */
  const POINT_DIFFERS: Readonly<Record<string, string>> = { "aspect-fit": "wraps maxrects" };

  // The limit of each case. A search strategy (`anneal`, `genetic`, `tabu`) packs the 20 inputs two times. On a runner, `anneal` took
  // 3539 ms and 3743 ms on two green runs, and 5322 ms on a red run, over the 5000 ms default. 30 s is approximately 5 times the slowest.
  it.each(allStrategies.map((s) => s.id).filter((id) => !(id in POINT_DIFFERS)))("packs the point of %s as packWith packs it with no options", (id) => {
    const point = configOfStrategy(id, {});
    expect(point.ok, id).toBe(true);
    if (!point.ok) return;
    // A refusal matches a refusal. The two paths can throw different error classes.
    const kind = (r: string): string => (r.startsWith("refused") ? "refused" : r);
    const differ: string[] = [];
    for (const params of CASES) {
      const input = toPackInput(rectGrid.generate(1, params));
      const viaWith = kind(result(() => packWith(id, input, {}, 3)));
      const viaConfig = kind(result(() => packConfig(input, point.config, 3)));
      if (viaWith !== viaConfig) differ.push(`${JSON.stringify(params)}: ${viaWith} against ${viaConfig}`);
    }
    expect(differ).toEqual([]);
  }, 30_000);

  it("names only strategies of the list in POINT_DIFFERS, and each of them differs", () => {
    const params = CASES[0];
    expect(params).toBeDefined();
    if (params === undefined) return;
    const input = toPackInput(rectGrid.generate(1, params));
    for (const id of Object.keys(POINT_DIFFERS)) {
      expect(allStrategies.some((s) => s.id === id), id).toBe(true);
      const point = configOfStrategy(id, {});
      expect(point.ok, id).toBe(true);
      if (!point.ok) continue;
      expect(result(() => packWith(id, input, {}, 3)), id).not.toBe(result(() => packConfig(input, point.config, 3)));
    }
  });

  it("gives the side none with no anchor, and not the config of the member", () => {
    const point = configOfStrategy("side-anchors", {});
    const member = configOfStrategy("maxrects", { rule: "bl" });
    expect(point.ok && member.ok).toBe(true);
    if (!point.ok || !member.ok) return;
    expect(point.config.stages["combine"]?.option).toBe("side-anchors");
    expect(point.config.stages["combine"]?.params).toEqual({ side: "none" });
    expect(configId(packSpace, point.config)).not.toBe(configId(packSpace, member.config));
  });
});
