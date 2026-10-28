// The fit of the types of packing to the types of `@mark1russell7/layout-contract` (roadmap item k57).
// `docs/PACKER.md`, "The type fit with `@mark1russell7/layout-contract`", gives each gap by its number.
// Since 0.2.0, packing imports each shared type from the contract. Thus each check below shows an identity or a full fit.
// A check with `.not` pins a known difference. Each one has its reason. It fails when the difference goes.
import { readFileSync } from "node:fs";
import * as C from "@mark1russell7/layout-contract";
import * as P from "@mark1russell7/packing";
import { describe, expect, expectTypeOf, it } from "vitest";
import type * as B from "../bench/run.ts";

/** The same fields as an object type, not an interface. An interface has no index signature. */
type Alias<T> = { [K in keyof T]: T[K] };

/** The keys of the fields that a type must have. */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

describe("the types of packing and of the contract", () => {
  it("are the same for each shared type", () => {
    expectTypeOf<P.Placement>().toEqualTypeOf<C.Placement>();
    expectTypeOf<P.Tolerance>().toEqualTypeOf<C.Tolerance>();
    expectTypeOf<P.Port>().toEqualTypeOf<C.Port>();
    expectTypeOf<P.Side>().toEqualTypeOf<C.Side>();
    expectTypeOf<P.Sides>().toEqualTypeOf<C.Sides>();
    expectTypeOf<P.Margin>().toEqualTypeOf<C.Margin>();
    expectTypeOf<P.Region>().toEqualTypeOf<C.Region>();
    expectTypeOf<P.LayoutContainer>().toEqualTypeOf<C.LayoutContainer>();
    expectTypeOf<P.Obstacle>().toEqualTypeOf<C.Obstacle>();
    expectTypeOf<P.Item>().toEqualTypeOf<C.Item>();
    expectTypeOf<P.Item>().toEqualTypeOf<C.LayoutBox>();
    expectTypeOf<P.PackInput>().toEqualTypeOf<C.PackInput>();
    expectTypeOf<P.StageTrace>().toEqualTypeOf<C.StageTrace>();
    expectTypeOf<P.PackOutput>().toEqualTypeOf<C.PackOutput>();
    expectTypeOf<P.LayoutEdge>().toEqualTypeOf<C.LayoutEdge>();
    expectTypeOf<P.LayoutInput>().toEqualTypeOf<C.LayoutInput>();
    expectTypeOf<P.PackHard>().toEqualTypeOf<C.PackHard>();
    expectTypeOf<P.Direction>().toEqualTypeOf<C.Direction>();
  });

  it("fit in both directions for the arguments and the results of the shared functions", () => {
    expectTypeOf<ReturnType<typeof P.checkHard>>().toEqualTypeOf<C.PackHard>();
    expectTypeOf<ReturnType<typeof P.toPackInput>>().toEqualTypeOf<C.PackInput>();
    expectTypeOf<C.LayoutInput>().toExtend<Parameters<typeof P.toPackInput>[0]>();
    expectTypeOf<ReturnType<typeof P.turnItem>>().toEqualTypeOf<ReturnType<typeof C.turnBox>>();
    expectTypeOf<Parameters<typeof P.turnItem>>().toEqualTypeOf<Parameters<typeof C.turnBox>>();
    expectTypeOf<ReturnType<typeof P.marginOf>>().toEqualTypeOf<C.Sides>();
    expect(P.checkInput).toBe(C.checkInput);
    expect(P.turnPoint).toBe(C.turnPoint);
    expect(P.turnPort).toBe(C.turnPort);
    expect(P.turnRegion).toBe(C.turnRegion);
    expect(P.EPS).toBe(C.EPS);
    expect(P.RECORD_EPS).toBe(C.RECORD_EPS);
    expect(P.DEFAULT_TOLERANCE).toBe(C.DEFAULT_TOLERANCE);
  });

  it("gap 0 is closed: packing depends on the npm release of the contract at run time", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@mark1russell7/layout-contract"]).toBe("^0.2.14");
    expect(pkg.devDependencies?.["@mark1russell7/layout-contract"]).toBeUndefined();
  });

  it("gap 1 is closed: the arrays and the fields of packing are readonly, as in the contract", () => {
    expectTypeOf<C.Region>().toExtend<P.Region>();
    expectTypeOf<C.LayoutBox>().toExtend<P.Item>();
    expectTypeOf<C.PackInput>().toExtend<P.PackInput>();
    expectTypeOf<C.PackOutput>().toExtend<P.PackOutput>();
    expectTypeOf<P.PackInput["items"]>().toEqualTypeOf<readonly C.LayoutBox[]>();
    expectTypeOf<P.PackOutput["placements"]>().toEqualTypeOf<readonly C.Placement[]>();
  });

  it("gap 2 is closed: the trace, its times and its measures are optional, and each strategy of packing writes them", () => {
    expectTypeOf<RequiredKeys<P.StageTrace>>().toEqualTypeOf<"id">();
    expectTypeOf<RequiredKeys<P.PackOutput>>().toEqualTypeOf<"placements" | "overflow" | "size" | "moved">();
    const input = P.toPackInput(P.rectGrid.generate(1, { count: 10 }));
    for (const s of P.strategies) {
      if (!P.supportsCell(s.supports, P.cellOf(input))) continue;
      const out = P.packWith(s.id, input);
      expect(out.trace, s.id).toBeDefined();
      for (const stage of out.trace!) expect([typeof stage.ms, typeof stage.measures], `${s.id} ${stage.id}`).toEqual(["number", "object"]);
    }
  });

  it("gap 3 is closed for the names: Sides, Margin, LayoutContainer, LayoutEdge and PackHard are those of the contract", () => {
    expectTypeOf<P.Sides>().toEqualTypeOf<C.Sides>();
    expectTypeOf<P.Margin>().toEqualTypeOf<number | C.Sides>();
    expectTypeOf<NonNullable<P.Item["margin"]>>().toEqualTypeOf<P.Margin>();
    expectTypeOf<P.LayoutContainer>().toEqualTypeOf<C.LayoutContainer>();
    expectTypeOf<P.LayoutEdge>().toEqualTypeOf<C.LayoutEdge>();
    expectTypeOf<P.PackHard>().toEqualTypeOf<C.PackHard>();
    // Pinned: the class Rect of 0.1 stays for the adapters of 0.1. A rename of it needs a decision of the owner.
    expectTypeOf<P.Rect<unknown>>().not.toExtend<C.Rect>();
  });

  it("gap 4 is closed: LayoutInput is the file of the contract, and a generated file is a LayoutInput with each field", () => {
    expectTypeOf<P.LayoutInput["change"]>().toEqualTypeOf<"add" | "remove" | "resize" | "reorder" | "packed" | undefined>();
    expectTypeOf<P.GeneratedInput>().toExtend<C.LayoutInput>();
    expectTypeOf<ReturnType<typeof P.rectGrid.generate>>().toEqualTypeOf<P.GeneratedInput>();
    expectTypeOf<P.Corpus["inputs"][number]>().toEqualTypeOf<P.GeneratedInput>();
    expectTypeOf<P.GeneratorStamp>().toExtend<C.LayoutGenerator>();
    // Pinned: since layout-contract 0.2.13, the cell itemShape of the contract is a ShapeKind or mixed. The taxonomy of
    // packing also has convex, and it has no free. Thus only the other dimensions fit (roadmap item k75).
    expectTypeOf<Omit<P.CorpusCell, "itemShape">>().toExtend<C.LayoutCell>();
    expectTypeOf<P.CorpusCell["itemShape"]>().not.toExtend<NonNullable<C.LayoutCell["itemShape"]>>();
    // Pinned: a generator writes each of these fields, thus a generated file has them. The contract keeps them optional.
    expectTypeOf<Exclude<RequiredKeys<P.GeneratedInput>, RequiredKeys<C.LayoutInput>>>().toEqualTypeOf<
      "set" | "family" | "seed" | "source" | "generator" | "container" | "edges" | "hash"
    >();
    expectTypeOf<C.LayoutInput>().not.toExtend<P.GeneratedInput>();
    // Pinned: the parameters of a generator are strings and numbers. The contract accepts each value.
    expectTypeOf<C.LayoutGenerator>().not.toExtend<P.GeneratorStamp>();
    // Pinned: a corpus cell has each dimension of the packer. The contract keeps each dimension optional.
    expectTypeOf<C.LayoutCell>().not.toExtend<P.CorpusCell>();
  });

  it("gap 5 is closed: an edge and an item of packing have the optional data of the contract", () => {
    expectTypeOf<P.LayoutEdge["data"]>().toEqualTypeOf<C.LayoutEdge["data"]>();
    expectTypeOf<P.Item["data"]>().toEqualTypeOf<C.LayoutBox["data"]>();
    // The turn and the converter keep the data of an item, as the contract does.
    const item: P.Item = { ...ITEM, data: { label: "made-up", weight: 2 } };
    expect(P.turnItem(item).data).toBe(item.data);
    expect(P.turnItem(item)).toEqual(C.turnBox(item));
    const file = P.rectGrid.generate(5, { count: 3 });
    const withData = { ...file, boxes: file.boxes.map((b) => ({ ...b, data: { tag: b.id } })) };
    expect(P.toPackInput(withData).items.map((i) => i.data)).toEqual(file.boxes.map((b) => ({ tag: b.id })));
  });

  it("gap 14 is closed: a port of packing has the optional side of the contract", () => {
    expectTypeOf<RequiredKeys<P.Port>>().toEqualTypeOf<"id">();
    const free: P.Port = { id: "p", x: 3 };
    expect(P.turnPort(free, 10)).toEqual({ id: "p", y: 3 });
    const turned = P.turnItem({ id: "a", w: 10, h: 4, ports: [free, { id: "q" }] });
    expect(turned.ports).toEqual([{ id: "p", y: 3 }, { id: "q" }]);
  });

  it("gap 6 is closed: Supports of packing is a type alias, and it fits the record of the contract", () => {
    expectTypeOf<P.Supports>().toExtend<C.Supports>();
    expectTypeOf<P.Strategy["supports"]>().toExtend<C.Supports>();
    expectTypeOf<Alias<P.Supports>>().toEqualTypeOf<P.Supports>();
  });

  it("a record of the benchmark runner, measured or skipped, fits the record of the contract with one difference of fields: shapes", () => {
    expectTypeOf<B.MeasuredRecord>().toExtend<C.LayoutRecord>();
    expectTypeOf<B.SkippedRecord>().toExtend<C.LayoutRecord>();
    expectTypeOf<B.BenchRecord>().toExtend<C.LayoutRecord>();
    // Open gap of L46: the record of the contract has the optional field `shapes`, and the runner does not write it yet.
    expectTypeOf<Exclude<keyof C.LayoutRecord, keyof B.MeasuredRecord>>().toEqualTypeOf<"shapes">();
    expectTypeOf<Exclude<keyof B.MeasuredRecord, keyof C.LayoutRecord>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof B.SkippedRecord, keyof C.LayoutRecord>>().toEqualTypeOf<never>();
    expectTypeOf<B.SkippedRecord["skipped"]>().toEqualTypeOf<NonNullable<C.LayoutRecord["skipped"]>>();
    expectTypeOf<B.BenchEnv>().toExtend<C.RunEnv>();
    expectTypeOf<C.RunEnv>().toExtend<B.BenchEnv>();
    expectTypeOf<RequiredKeys<C.RunEnv>>().toEqualTypeOf<keyof B.BenchEnv>();
  });

  it("gap 12 is closed: checkHard and packHard both read the input, the output, an optional tolerance and the container test", () => {
    expectTypeOf(P.checkHard).parameters.toHaveProperty("length").toEqualTypeOf<2 | 3 | 4>();
    expectTypeOf(P.checkHard).parameter(0).toEqualTypeOf<C.PackInput>();
    expectTypeOf(P.checkHard).parameter(1).toEqualTypeOf<C.PackOutput>();
    expectTypeOf(P.checkHard).parameter(2).toEqualTypeOf<Pick<C.Tolerance, "overlap"> | undefined>();
    expectTypeOf(P.checkHard).parameter(3).toEqualTypeOf<C.ContainerTest | undefined>();
    expectTypeOf(C.packHard).parameters.toHaveProperty("length").toEqualTypeOf<2 | 3 | 4>();
    expectTypeOf(C.packHard).parameter(0).toEqualTypeOf<C.LayoutInput>();
    expectTypeOf(C.packHard).parameter(1).toEqualTypeOf<C.PackOutput>();
    expectTypeOf(C.packHard).parameter(2).toEqualTypeOf<number | undefined>();
    expectTypeOf(C.packHard).parameter(3).toEqualTypeOf<C.ContainerTest | undefined>();
    expectTypeOf<P.ContainerTest>().toEqualTypeOf<C.ContainerTest>();
    expectTypeOf(C.packHard).returns.toEqualTypeOf<C.PackHard>();
    // Pinned: checkHard reads the packer input, and packHard reads a file. Both forms stay, as decided in gap 12.
    expectTypeOf<P.PackInput>().not.toExtend<C.LayoutInput>();
  });

  it("gap 13 is closed: the contract has the converter pair, the common fields of a strategy and the measure specs", () => {
    expect(typeof C.toPackInput).toBe("function");
    expect(typeof C.toLayoutRecord).toBe("function");
    expect(typeof C.applyPack).toBe("function");
    expect("fromLayoutInput" in C).toBe(false);
    expectTypeOf<P.Strategy>().toExtend<C.StrategyInfo<unknown, P.Supports>>();
    expectTypeOf<Exclude<keyof C.StrategyInfo, keyof P.Strategy>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof P.Strategy, keyof C.StrategyInfo>>().toEqualTypeOf<"pack">();
  });

  it("the measure specs of packing are MeasureSpec of the contract for a packer id, with a family", () => {
    expectTypeOf<P.MeasureSpec>().toExtend<C.MeasureSpec<P.MeasureId>>();
    expectTypeOf<Omit<P.MeasureSpec, "family">>().toEqualTypeOf<Omit<C.MeasureSpec<P.MeasureId>, "family">>();
    expectTypeOf<(typeof P.MEASURE_SPECS)[P.MeasureId]>().toExtend<C.MeasureSpec<P.MeasureId>>();
    expectTypeOf<Exclude<keyof P.MeasureSpec, keyof C.MeasureSpec>>().toEqualTypeOf<never>();
    // Pinned: each packer measure has a family of docs/MEASURES.md. The contract keeps the family optional.
    expectTypeOf<C.MeasureSpec<P.MeasureId>>().not.toExtend<P.MeasureSpec>();
    const specs: readonly C.MeasureSpec<P.MeasureId>[] = Object.values(P.MEASURE_SPECS);
    for (const spec of specs) expect(P.MEASURE_SPECS[spec.id], spec.id).toBe(spec);
    const joint = new Set<string>(C.JOINT_MEASURES.map((s) => s.id));
    for (const spec of specs) expect(joint.has(spec.id), spec.id).toBe(false);
  });
});

/** A turnable made-up item with each part that turns. */
const ITEM: P.Item = {
  id: "a",
  w: 40,
  h: 10,
  x: 5,
  y: 7,
  turnable: true,
  margin: { top: 1, right: 2, bottom: 3, left: 4 },
  ports: [
    { id: "p1", side: "top", x: 10, y: 0 },
    { id: "p2", side: "right", x: 40, y: 4 },
    { id: "p3", side: "bottom" },
  ],
  shape: { kind: "rect", x: 2, y: 1, w: 30, h: 8 },
};

const REGIONS: P.Region[] = [
  { kind: "rect", x: 2, y: 1, w: 30, h: 8 },
  { kind: "circle", cx: 5, cy: 3, r: 2 },
  { kind: "ellipse", cx: 6, cy: 4, rx: 3, ry: 1 },
  {
    kind: "polygon",
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    holes: [
      [
        [2, 2],
        [4, 2],
        [4, 4],
      ],
    ],
  },
];

describe("the shared values and functions", () => {
  it("have the same tolerances", () => {
    expect(P.EPS).toBe(C.EPS);
    expect(P.RECORD_EPS).toBe(C.RECORD_EPS);
    expect(P.DEFAULT_TOLERANCE).toEqual(C.DEFAULT_TOLERANCE);
    expect(Object.isFrozen(P.DEFAULT_TOLERANCE)).toBe(true);
    expect(Object.isFrozen(C.DEFAULT_TOLERANCE)).toBe(true);
  });

  it("turn a point, each region, a port with x and y, a port with no point, and an item in the same way", () => {
    expect(P.turnPoint(3, 4, 10)).toEqual(C.turnPoint(3, 4, 10));
    for (const region of REGIONS) expect(P.turnRegion(region, 10), region.kind).toEqual(C.turnRegion(region, 10));
    for (const port of ITEM.ports!) expect(P.turnPort(port, ITEM.h), port.id).toEqual(C.turnPort(port, ITEM.h));
    expect(P.turnItem(ITEM)).toEqual(C.turnBox(ITEM));
    expect(P.turnItem({ ...ITEM, margin: 3 })).toEqual(C.turnBox({ ...ITEM, margin: 3 }));
    expect(P.turnItem(P.turnItem(P.turnItem(P.turnItem(ITEM))))).toEqual(ITEM);
    expect(P.marginOf(ITEM)).toEqual(C.marginSides(ITEM.margin));
    expect(P.marginOf({})).toEqual(C.marginSides(undefined));
    expect(P.marginOf({ margin: 2 })).toEqual(C.marginSides(2));
  });

  it("gap 7 is closed: turn a port with only x or only y in the same way", () => {
    const onlyX: P.Port = { id: "p", side: "top", x: 10 };
    const onlyY: P.Port = { id: "p", side: "left", y: 4 };
    expect(P.turnPort(onlyX, 10)).toEqual({ id: "p", side: "right", y: 10 });
    expect(C.turnPort(onlyX, 10)).toEqual(P.turnPort(onlyX, 10));
    expect(P.turnPort(onlyY, 10)).toEqual({ id: "p", side: "top", x: 6 });
    expect(C.turnPort(onlyY, 10)).toEqual(P.turnPort(onlyY, 10));
  });

  it("make the same packer input of a generated file", () => {
    for (const obstacles of ["none", "scattered", "wall"] as const) {
      const file = P.rectGrid.generate(3, { obstacles, count: 20 });
      const { change: _change, ...forContract } = file;
      const local = P.toPackInput(file);
      const shared = C.toPackInput(forContract);
      expect(shared, obstacles).toEqual(local);
      expect(shared.items).toBe(local.items);
    }
  });

  it("make the record of a run with toLayoutRecord from the facts of a generated file", () => {
    const { change: _change, ...file } = P.rectGrid.generate(4, { count: 12 });
    const run: C.RunFacts = {
      stage: "pack",
      step: "made-up",
      strategy: "shelf",
      options: {},
      corpus: "made-up",
      seed: 4,
      measures: {},
      hard: {},
      deterministic: true,
      ms: 0,
    };
    expect(C.toLayoutRecord(file, run)).toMatchObject({
      schema: "layout-record/1",
      input: file.id,
      inputHash: file.hash,
      set: file.set,
      nodes: 12,
      edges: file.edges.length,
    });
  });
});

/** The packer input as a contract file, for `packHard`. */
const fileOf = (input: P.PackInput): C.LayoutInput => ({ schema: "layout-input/1", id: "made-up", ...input, boxes: input.items });

/** The hard rules of the contract for a packer input and its output. */
const contractHard = (input: P.PackInput, output: P.PackOutput, tolerance?: number, options?: C.ContainerTest): C.PackHard =>
  C.packHard(fileOf(input), output, tolerance, options);

const output = (placements: readonly P.Placement[], overflow: readonly string[] = []): P.PackOutput => ({
  placements,
  overflow,
  size: { w: 100, h: 100 },
  moved: [],
  trace: [],
});

describe("the hard rules of packing and of the contract", () => {
  it("agree on the packed outputs of the generators", () => {
    const files = [
      P.rectGrid.generate(1, { count: 30 }),
      P.rectGrid.generate(2, { containerSize: "freeHeight", sizes: "heavyTail", count: 30 }),
      P.rectGrid.generate(3, { containerSize: "freeWidth", obstacles: "scattered", count: 30 }),
      P.gallery.generate(1, { count: 20 }),
      P.dashboard.generate(2, { count: 10 }),
      P.cards.generate(3, { count: 20 }),
      P.edgeCases.generate(1, { case: "oversize", count: 12 }),
      P.edgeCases.generate(1, { case: "touchObstacles", count: 6 }),
    ];
    // The generators give no inset. The first 4 files also go in with an inset, so the agreement covers the inset too.
    const inputs = files.map((file) => ({ label: file.id, input: P.toPackInput(file) }));
    for (const [i, file] of files.slice(0, 4).entries()) {
      const input = P.toPackInput(file);
      inputs.push({ label: `${file.id} inset`, input: { ...input, container: { ...input.container, inset: 3 + i } } });
    }
    let compared = 0;
    let withInset = 0;
    for (const { label, input } of inputs) {
      const cell = P.cellOf(input);
      for (const s of P.strategies) {
        if (!P.supportsCell(s.supports, cell)) continue;
        const out = P.packWith(s.id, input);
        const hard = P.checkHard(input, out);
        expect(contractHard(input, out), `${label} ${s.id}`).toEqual(hard);
        if (input.container.inset !== undefined) {
          expect(hard["in-container"], `${label} ${s.id}`).toBe(0);
          withInset += 1;
        }
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(10);
    expect(withInset).toBeGreaterThan(4);
  });

  it("agree with exactContainer on the packed outputs of each container shape", () => {
    const exact = { exactContainer: true } as const;
    let compared = 0;
    let shaped = 0;
    for (const containerShape of ["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const) {
      for (const obstacles of ["none", "scattered"] as const) {
        const file = P.toPackInput(P.rectGrid.generate(2, { containerShape, obstacles, count: 40 }));
        for (const input of [file, { ...file, container: { ...file.container, inset: 4 } }]) {
          const cell = P.cellOf(input);
          for (const s of P.strategies) {
            if (!P.supportsCell(s.supports, cell)) continue;
            const out = P.packWith(s.id, input);
            const hard = P.checkHard(input, out, undefined, exact);
            expect(contractHard(input, out, undefined, exact), `${containerShape} ${obstacles} ${s.id}`).toEqual(hard);
            // The layer packs into the true outline, thus no box is out of the shape
            expect(hard["in-container"], `${containerShape} ${obstacles} ${s.id}`).toBe(0);
            if (input.container.shape !== undefined) shaped += 1;
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(30);
    expect(shaped).toBeGreaterThan(20);
  });

  it("agree with exactContainer on a box in the bounding box of a shape, but out of the shape", () => {
    const circle: P.PackInput = {
      container: { fixed: "size", shape: { kind: "circle", cx: 50, cy: 50, r: 50 } },
      items: [{ id: "corner", w: 10, h: 10 }, { id: "center", w: 10, h: 10 }],
    };
    const holes: P.PackInput = {
      container: {
        fixed: "size",
        shape: { kind: "polygon", points: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[40, 40], [60, 40], [60, 60], [40, 60]]] },
        inset: 2,
      },
      items: [{ id: "corner", w: 10, h: 10 }, { id: "center", w: 10, h: 10 }],
    };
    const out = output([{ id: "corner", x: 1, y: 1 }, { id: "center", x: 45, y: 45 }]);
    for (const input of [circle, holes]) {
      expect(P.checkHard(input, out)["in-container"]).toBe(input === holes ? 1 : 0);
      expect(contractHard(input, out)).toEqual(P.checkHard(input, out));
      const hard = P.checkHard(input, out, undefined, { exactContainer: true });
      expect(contractHard(input, out, undefined, { exactContainer: true })).toEqual(hard);
      // The circle: the corner box is out of the circle. The holes: the inset puts the corner out, and the center box is on the hole.
      expect(hard["in-container"]).toBe(input === holes ? 2 : 1);
    }
    // A free side keeps the test of the bounding box
    const free: P.PackInput = { ...circle, container: { ...circle.container, fixed: "width" } };
    expect(P.checkHard(free, out, undefined, { exactContainer: true })["in-container"]).toBe(0);
  });

  const input: P.PackInput = {
    container: { w: 100, h: 100, fixed: "size" },
    items: [
      { id: "a", w: 10, h: 10, margin: 2 },
      { id: "b", w: 10, h: 10 },
      { id: "pin", w: 10, h: 10, locked: true, x: 50, y: 50 },
      { id: "t", w: 30, h: 10, turnable: true },
    ],
  };

  it("agree on an overlap through a margin, a common edge, a box out of the container, a moved lock and a turn", () => {
    const cases: P.Placement[][] = [
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 13, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 14, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 1, y: 2 }, { id: "b", x: 95, y: 0 }, { id: "pin", x: 51, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 45, y: 25, turn: 90 }],
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 95, y: 0, turn: 90 }],
    ];
    for (const [i, placements] of cases.entries()) {
      const out = output(placements);
      expect(contractHard(input, out), `case ${i}`).toEqual(P.checkHard(input, out));
    }
    expect(P.checkHard(input, output(cases[0]!))["no-overlap"]).toBe(1);
    expect(P.checkHard(input, output(cases[2]!))).toMatchObject({ "in-container": 2, "locked-kept": 1 });
    expect(P.checkHard(input, output(cases[3]!))["no-overlap"]).toBe(1);
    expect(P.checkHard(input, output(cases[4]!))["in-container"]).toBe(1);
  });

  it("gap 8 is closed: both count an item on a rectangle obstacle", () => {
    const withObstacle: P.PackInput = { ...input, obstacles: [{ id: "o", region: { kind: "rect", x: 80, y: 80, w: 20, h: 20 } }] };
    const cases: P.Placement[][] = [
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 85, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 70, y: 70 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 69, y: 69 }, { id: "b", x: 70, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
    ];
    for (const [i, placements] of cases.entries()) {
      const out = output(placements);
      expect(contractHard(withObstacle, out), `case ${i}`).toEqual(P.checkHard(withObstacle, out));
    }
    expect(P.checkHard(withObstacle, output(cases[0]!))["no-overlap"]).toBe(1);
    expect(P.checkHard(withObstacle, output(cases[1]!))["no-overlap"]).toBe(0);
    // The margin of a goes over the obstacle. The item b only touches it.
    expect(P.checkHard(withObstacle, output(cases[2]!))["no-overlap"]).toBe(1);
  });

  it("agree on an obstacle that moved: both count the item at the new place of the obstacle", () => {
    const movable: P.PackInput = {
      ...input,
      obstacles: [{ id: "o", region: { kind: "rect", x: 80, y: 80, w: 20, h: 20 }, move: { cost: 1 } }],
    };
    const cases: P.Placement[][] = [
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 5, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 85, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }],
    ];
    const moved = [{ id: "o", x: 0, y: 80 }];
    const counts = cases.map((placements) => {
      const out: P.PackOutput = { ...output(placements), moved };
      const hard = P.checkHard(movable, out);
      expect(contractHard(movable, out)).toEqual(hard);
      return hard["no-overlap"];
    });
    expect(counts).toEqual([1, 0]);
    expect(P.checkHard(movable, output(cases[1]!))["no-overlap"]).toBe(1);
  });

  it("gap 8 is closed: both read a circle, an ellipse, a polygon and a hole of an obstacle exactly", () => {
    const small: P.PackInput = { container: { w: 100, h: 100, fixed: "size" }, items: [{ id: "s", w: 4, h: 4 }] };
    const ring: P.Region = {
      kind: "polygon",
      points: [[20, 20], [40, 20], [40, 40], [20, 40]],
      holes: [[[25, 25], [35, 25], [35, 35], [25, 35]]],
    };
    const ell: P.Region = { kind: "polygon", points: [[60, 60], [90, 60], [90, 70], [70, 70], [70, 90], [60, 90]] };
    const regions: Record<string, P.Region> = {
      circle: { kind: "circle", cx: 50, cy: 50, r: 10 },
      ellipse: { kind: "ellipse", cx: 50, cy: 35, rx: 20, ry: 15 },
      ring,
      ell,
    };
    // Each case: the obstacle, the place of the item, the margin of the item and the count of both.
    const cases: [string, number, number, number, number][] = [
      ["circle", 38, 38, 0, 0],
      ["circle", 48, 48, 0, 1],
      ["circle", 38, 38, 2, 1],
      ["ellipse", 30, 20, 0, 0],
      ["ellipse", 48, 33, 0, 1],
      ["ring", 28, 28, 0, 0],
      ["ring", 21, 21, 0, 1],
      ["ring", 28, 28, 4, 1],
      ["ell", 80, 80, 0, 0],
      ["ell", 62, 62, 0, 1],
    ];
    for (const [name, x, y, margin, count] of cases) {
      const inp: P.PackInput = { ...small, items: [{ id: "s", w: 4, h: 4, margin }], obstacles: [{ id: "o", region: regions[name]! }] };
      const out = output([{ id: "s", x, y }]);
      const label = `${name} at ${x}, ${y} with margin ${margin}`;
      expect(P.checkHard(inp, out)["no-overlap"], label).toBe(count);
      expect(contractHard(inp, out), label).toEqual(P.checkHard(inp, out));
    }
    // A moved circle: both test the item at the new place of the circle.
    const moving: P.PackInput = { ...small, obstacles: [{ id: "o", region: regions["circle"]!, move: { cost: 1 } }] };
    const moved: P.PackOutput = { ...output([{ id: "s", x: 8, y: 8 }]), moved: [{ id: "o", x: 2, y: 2 }] };
    expect(P.checkHard(moving, moved)["no-overlap"]).toBe(1);
    expect(contractHard(moving, moved)).toEqual(P.checkHard(moving, moved));
    const corner: P.PackOutput = { ...output([{ id: "s", x: 0, y: 0 }]), moved: [{ id: "o", x: 2, y: 2 }] };
    expect(P.checkHard(moving, corner)["no-overlap"]).toBe(0);
    expect(contractHard(moving, corner)).toEqual(P.checkHard(moving, corner));
  });

  it("gap 9 is closed: both read the inset of the container", () => {
    const withInset: P.PackInput = { ...input, container: { ...input.container, inset: 5 } };
    const cases: P.Placement[][] = [
      [{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 20 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 20, y: 60 }],
      [{ id: "a", x: 7, y: 7 }, { id: "b", x: 85, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 20, y: 60 }],
      [{ id: "a", x: 7, y: 7 }, { id: "b", x: 86, y: 20 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 86, y: 60, turn: 90 }],
    ];
    for (const [i, placements] of cases.entries()) {
      const out = output(placements);
      expect(P.checkHard(withInset, out), `case ${i}`).toEqual(contractHard(withInset, out));
    }
    expect(P.checkHard(withInset, output(cases[0]!))["in-container"]).toBe(1);
    expect(P.checkHard(withInset, output(cases[1]!))["in-container"]).toBe(0);
    expect(P.checkHard(withInset, output(cases[2]!))["in-container"]).toBe(2);
  });

  it("gap 10 is closed: both read a shaped item as the bounding box of its shape", () => {
    const shaped: P.PackInput = {
      container: { w: 100, h: 100, fixed: "size" },
      items: [
        { id: "s", w: 20, h: 20, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } },
        { id: "e", w: 20, h: 10, turnable: true, shape: { kind: "ellipse", cx: 10, cy: 5, rx: 10, ry: 3 }, margin: 1 },
        { id: "p", w: 30, h: 30, shape: { kind: "polygon", points: [[10, 10], [20, 10], [15, 20]] } },
        { id: "b", w: 10, h: 10 },
      ],
    };
    const cases: P.Placement[][] = [
      [{ id: "s", x: 0, y: 0 }, { id: "e", x: 40, y: 0 }, { id: "p", x: 60, y: 60 }, { id: "b", x: 12, y: 12 }],
      [{ id: "s", x: 0, y: 0 }, { id: "e", x: 40, y: 0, turn: 90 }, { id: "p", x: 60, y: 60 }, { id: "b", x: 9, y: 9 }],
      [{ id: "s", x: 0, y: 0 }, { id: "e", x: 40, y: 0 }, { id: "p", x: 75, y: 75 }, { id: "b", x: 70, y: 70 }],
    ];
    for (const [i, placements] of cases.entries()) {
      const out = output(placements);
      expect(P.checkHard(shaped, out), `case ${i}`).toEqual(contractHard(shaped, out));
    }
    expect(P.checkHard(shaped, output(cases[0]!))["no-overlap"]).toBe(0);
    // The turned ellipse with its margin goes 1 above the top of the container.
    expect(P.checkHard(shaped, output(cases[1]!))).toMatchObject({ "no-overlap": 1, "in-container": 1 });
    expect(P.checkHard(shaped, output(cases[2]!))).toMatchObject({ "no-overlap": 0, "in-container": 0 });
  });

  it("gap 11 is closed: both count an item with no placement, and a locked item with no placement, in the same way", () => {
    // An item with no placement that is not in the overflow breaks complete in both.
    const noB = output([{ id: "a", x: 2, y: 2 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }]);
    expect(contractHard(input, noB)).toEqual(P.checkHard(input, noB));
    expect(P.checkHard(input, noB)).toMatchObject({ "locked-kept": 0, complete: 1 });
    const overB = output(noB.placements, ["b"]);
    expect(contractHard(input, overB)).toEqual(P.checkHard(input, overB));
    expect(P.checkHard(input, overB).complete).toBe(0);
    // A locked item with no placement breaks only locked-kept in both, also when it is in the overflow.
    const noPin = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "t", x: 0, y: 60 }]);
    expect(contractHard(input, noPin)).toEqual(P.checkHard(input, noPin));
    expect(P.checkHard(input, noPin)).toMatchObject({ "locked-kept": 1, complete: 0 });
    const overPin = output(noPin.placements, ["pin"]);
    expect(contractHard(input, overPin)).toEqual(P.checkHard(input, overPin));
    // Both keep a locked item with no placement at its input position for no-overlap and in-container.
    const onPin = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 52, y: 52 }, { id: "t", x: 0, y: 60 }]);
    expect(contractHard(input, onPin)).toEqual(P.checkHard(input, onPin));
    expect(P.checkHard(input, onPin)).toMatchObject({ "no-overlap": 1, "locked-kept": 1, complete: 0 });
    const edge: P.PackInput = { ...input, items: [{ id: "pin", w: 10, h: 10, locked: true, x: 95, y: 0 }] };
    expect(contractHard(edge, output([]))).toEqual(P.checkHard(edge, output([])));
    expect(P.checkHard(edge, output([]))).toMatchObject({ "in-container": 1, "locked-kept": 1 });
  });

  it("a locked item: both read RECORD_EPS for the move, and the tolerance argument does not change it", () => {
    const near = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 50.01, y: 50 }, { id: "t", x: 0, y: 60 }]);
    expect(P.checkHard(input, near, { overlap: 0.1 })["locked-kept"]).toBe(1);
    expect(contractHard(input, near, 0.1)).toEqual(P.checkHard(input, near, { overlap: 0.1 }));
    expect(contractHard(input, near)).toEqual(P.checkHard(input, near));
  });

  it("gap 11 is closed for a bad input: both skip a locked item with no position, and checkInput finds it", () => {
    const noPosition: P.PackInput = {
      ...input,
      items: input.items.map((i) => (i.id === "pin" ? { id: "pin", w: 10, h: 10, locked: true } : i)),
    };
    const placed = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }]);
    expect(contractHard(noPosition, placed)).toEqual(P.checkHard(noPosition, placed));
    expect(P.checkHard(noPosition, placed)["locked-kept"]).toBe(0);
    expect(P.checkInput(fileOf(noPosition))).toEqual(["box pin: a locked box has no position"]);
    expect(P.checkInput(fileOf(input))).toEqual([]);
    // With no placement, both skip the item: it breaks no rule.
    const unplaced = output(placed.placements.filter((p) => p.id !== "pin"));
    expect(P.checkHard(noPosition, unplaced)).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
    expect(contractHard(noPosition, unplaced)).toEqual(P.checkHard(noPosition, unplaced));
    // With a placement over another item, both skip the item: it gives no overlap.
    const over = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "pin", x: 20, y: 0 }, { id: "t", x: 0, y: 60 }]);
    expect(P.checkHard(noPosition, over)["no-overlap"]).toBe(0);
    expect(contractHard(noPosition, over)).toEqual(P.checkHard(noPosition, over));
  });
});
