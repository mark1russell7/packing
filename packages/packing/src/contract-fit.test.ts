// The fit of the local types of packing to the types of `@mark1russell7/layout-contract` (roadmap item k57).
// `docs/PACKER.md`, "The type fit with `@mark1russell7/layout-contract`", gives each gap by its number.
// A check with `.not` pins a known gap: it fails when the contract or packing closes the gap. Then change the check and the list.
import * as C from "@mark1russell7/layout-contract";
import * as P from "@mark1russell7/packing";
import { describe, expect, expectTypeOf, it } from "vitest";

/** The type with no `readonly` at each level: the arrays, the tuples and the fields. */
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

/** The same fields as an object type, not an interface. An interface has no index signature. */
type Alias<T> = { [K in keyof T]: T[K] };

/** The keys of the fields that a type must have. */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

describe("the types of packing and of the contract", () => {
  it("fit for Placement, Tolerance, Port and the hard rules, in both directions", () => {
    expectTypeOf<P.Placement>().toExtend<C.Placement>();
    expectTypeOf<C.Placement>().toExtend<P.Placement>();
    expectTypeOf<P.Tolerance>().toExtend<C.Tolerance>();
    expectTypeOf<C.Tolerance>().toExtend<P.Tolerance>();
    expectTypeOf<P.Port>().toExtend<C.Port>();
    expectTypeOf<C.Port>().toExtend<P.Port>();
    expectTypeOf<P.Port["side"]>().toEqualTypeOf<C.Side>();
    expectTypeOf<P.HardBreaks>().toExtend<C.PackHard>();
    expectTypeOf<C.PackHard>().toExtend<P.HardBreaks>();
    expectTypeOf<keyof P.HardBreaks>().toEqualTypeOf<keyof C.PackHard>();
  });

  it("fit from packing to the contract for each input and output type", () => {
    expectTypeOf<P.Region>().toExtend<C.Region>();
    expectTypeOf<P.Container>().toExtend<C.LayoutContainer>();
    expectTypeOf<P.Obstacle>().toExtend<C.Obstacle>();
    expectTypeOf<P.Item>().toExtend<C.LayoutBox>();
    expectTypeOf<P.Item>().toExtend<C.Item>();
    expectTypeOf<P.PackInput>().toExtend<C.PackInput>();
    expectTypeOf<P.StageTrace>().toExtend<C.StageTrace>();
    expectTypeOf<P.PackOutput>().toExtend<C.PackOutput>();
    expectTypeOf<P.Edge>().toExtend<C.LayoutEdge>();
    expectTypeOf<ReturnType<typeof P.toPackInput>>().toExtend<C.PackInput>();
    expectTypeOf<ReturnType<typeof P.checkHard>>().toExtend<C.PackHard>();
  });

  it("have the same fields for each input type", () => {
    expectTypeOf<keyof P.Container>().toEqualTypeOf<keyof C.LayoutContainer>();
    expectTypeOf<keyof P.Obstacle>().toEqualTypeOf<keyof C.Obstacle>();
    expectTypeOf<keyof P.Item>().toEqualTypeOf<keyof C.LayoutBox>();
    expectTypeOf<keyof P.PackInput>().toEqualTypeOf<keyof C.PackInput>();
    expectTypeOf<keyof P.PackOutput>().toEqualTypeOf<keyof C.PackOutput>();
    expectTypeOf<RequiredKeys<P.Item>>().toEqualTypeOf<RequiredKeys<C.LayoutBox>>();
    expectTypeOf<RequiredKeys<P.Container>>().toEqualTypeOf<RequiredKeys<C.LayoutContainer>>();
  });

  it("gap 1: the contract has readonly arrays, packing has mutable arrays", () => {
    expectTypeOf<C.Region>().not.toExtend<P.Region>();
    expectTypeOf<C.LayoutContainer>().not.toExtend<P.Container>();
    expectTypeOf<C.Obstacle>().not.toExtend<P.Obstacle>();
    expectTypeOf<C.LayoutBox>().not.toExtend<P.Item>();
    expectTypeOf<C.PackInput>().not.toExtend<P.PackInput>();
    expectTypeOf<C.LayoutInput>().not.toExtend<Parameters<typeof P.toPackInput>[0]>();
    // Without readonly, each of these types fits packing.
    expectTypeOf<Mutable<C.Region>>().toExtend<P.Region>();
    expectTypeOf<Mutable<C.LayoutContainer>>().toExtend<P.Container>();
    expectTypeOf<Mutable<C.Obstacle>>().toExtend<P.Obstacle>();
    expectTypeOf<Mutable<C.LayoutBox>>().toExtend<P.Item>();
    expectTypeOf<Mutable<C.PackInput>>().toExtend<P.PackInput>();
  });

  it("gap 2: the contract has an optional trace, ms and measures, packing has them required", () => {
    expectTypeOf<Mutable<C.StageTrace>>().not.toExtend<P.StageTrace>();
    expectTypeOf<Mutable<C.PackOutput>>().not.toExtend<P.PackOutput>();
    expectTypeOf<Required<Mutable<C.StageTrace>>>().toExtend<P.StageTrace>();
    expectTypeOf<RequiredKeys<P.StageTrace>>().toEqualTypeOf<"id" | "ms" | "measures">();
    expectTypeOf<RequiredKeys<C.StageTrace>>().toEqualTypeOf<"id">();
    expectTypeOf<RequiredKeys<P.PackOutput>>().toEqualTypeOf<"placements" | "overflow" | "size" | "moved" | "trace">();
    expectTypeOf<RequiredKeys<C.PackOutput>>().toEqualTypeOf<"placements" | "overflow" | "size" | "moved">();
  });

  it("gap 3: the names Margin, Container, Edge, HardBreaks and Rect are different", () => {
    // The Margin of packing is the Sides of the contract. The Margin of the contract is the field Item.margin.
    expectTypeOf<P.Margin>().toExtend<C.Sides>();
    expectTypeOf<C.Sides>().toExtend<P.Margin>();
    expectTypeOf<NonNullable<P.Item["margin"]>>().toExtend<C.Margin>();
    expectTypeOf<C.Margin>().toExtend<NonNullable<P.Item["margin"]>>();
    expectTypeOf<C.Margin>().not.toExtend<P.Margin>();
    // Rect of packing is the class of 0.1. Rect of the contract is a plain rectangle.
    expectTypeOf<P.Rect<unknown>>().not.toExtend<C.Rect>();
  });

  it("gap 4: the file LayoutInput of packing has a change of any string, and two fields more", () => {
    expectTypeOf<P.LayoutInput>().not.toExtend<C.LayoutInput>();
    expectTypeOf<Omit<P.LayoutInput, "change">>().toExtend<C.LayoutInput>();
    expectTypeOf<P.LayoutInput["change"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<C.LayoutInput["change"]>().toEqualTypeOf<"add" | "remove" | "resize" | "reorder" | undefined>();
    expectTypeOf<Exclude<keyof P.LayoutInput, keyof C.LayoutInput>>().toEqualTypeOf<"generator" | "step">();
    expectTypeOf<Exclude<keyof C.LayoutInput, keyof P.LayoutInput>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<RequiredKeys<P.LayoutInput>, RequiredKeys<C.LayoutInput>>>().toEqualTypeOf<
      "set" | "family" | "seed" | "source" | "generator" | "edges" | "hash"
    >();
  });

  it("gap 5: an edge of the contract has data, an edge of packing has no data", () => {
    expectTypeOf<C.LayoutEdge>().toExtend<P.Edge>();
    expectTypeOf<Exclude<keyof C.LayoutEdge, keyof P.Edge>>().toEqualTypeOf<"data">();
  });

  it("gap 6 is closed: Supports of packing is a type alias, and it fits the record of the contract", () => {
    expectTypeOf<P.Supports>().toExtend<C.Supports>();
    expectTypeOf<P.Strategy["supports"]>().toExtend<C.Supports>();
    expectTypeOf<Alias<P.Supports>>().toEqualTypeOf<P.Supports>();
  });

  it("gap 12: checkHard reads the packer input and output, packHard reads two files and the overflow", () => {
    expectTypeOf(P.checkHard).parameters.toHaveProperty("length").toEqualTypeOf<2 | 3>();
    expectTypeOf(P.checkHard).parameter(0).toEqualTypeOf<P.PackInput>();
    expectTypeOf(P.checkHard).parameter(1).toEqualTypeOf<P.PackOutput>();
    expectTypeOf(P.checkHard).parameter(2).toEqualTypeOf<Pick<P.Tolerance, "overlap"> | undefined>();
    expectTypeOf(C.packHard).parameters.toHaveProperty("length").toEqualTypeOf<3 | 4>();
    expectTypeOf(C.packHard).parameter(0).toEqualTypeOf<C.LayoutInput>();
    expectTypeOf(C.packHard).parameter(1).toEqualTypeOf<C.LayoutInput>();
    expectTypeOf(C.packHard).parameter(2).toEqualTypeOf<readonly string[]>();
    expectTypeOf(C.packHard).parameter(3).toEqualTypeOf<number | undefined>();
  });

  it("gap 13: the contract has toPackInput and applyPack, not the converter pair of decision 5", () => {
    expect(typeof C.toPackInput).toBe("function");
    expect(typeof C.applyPack).toBe("function");
    for (const name of ["fromLayoutInput", "toLayoutRecord"]) expect(name in C, name).toBe(false);
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

  it("gap 7: turn a port with only x or only y in different ways", () => {
    const onlyX: P.Port = { id: "p", side: "top", x: 10 };
    const onlyY: P.Port = { id: "p", side: "left", y: 4 };
    expect(P.turnPort(onlyX, 10)).toEqual({ id: "p", side: "right", y: 10 });
    expect(C.turnPort(onlyX, 10)).toEqual({ id: "p", side: "right", x: 10 });
    expect(P.turnPort(onlyY, 10)).toEqual({ id: "p", side: "top", x: 6 });
    expect(C.turnPort(onlyY, 10)).toEqual({ id: "p", side: "top", y: 4 });
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
});

/** The packer input as a contract file, for `packHard`. */
const fileOf = (input: P.PackInput): C.LayoutInput => ({ schema: "layout-input/1", id: "made-up", ...input, boxes: input.items });

/** The hard rules of the contract for a packer input and its output. */
const contractHard = (input: P.PackInput, output: P.PackOutput): C.PackHard => {
  const before = fileOf(input);
  return C.packHard(before, C.applyPack(before, output), output.overflow);
};

const output = (placements: P.Placement[], overflow: string[] = []): P.PackOutput => ({
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

  it("gap 8: only packing counts an item on an obstacle", () => {
    const withObstacle: P.PackInput = { ...input, obstacles: [{ id: "o", region: { kind: "rect", x: 80, y: 80, w: 20, h: 20 } }] };
    const out = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 85, y: 85 }, { id: "pin", x: 50, y: 50 }, { id: "t", x: 0, y: 60 }]);
    expect(P.checkHard(withObstacle, out)["no-overlap"]).toBe(1);
    expect(contractHard(withObstacle, out)["no-overlap"]).toBe(0);
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

  it("gap 11: only packing counts an item with no placement that keeps the position of the input", () => {
    const out = output([{ id: "a", x: 2, y: 2 }, { id: "b", x: 20, y: 0 }, { id: "t", x: 0, y: 60 }]);
    expect(P.checkHard(input, out)).toMatchObject({ "locked-kept": 1, complete: 1 });
    expect(contractHard(input, out)).toMatchObject({ "locked-kept": 0, complete: 0 });
  });
});
