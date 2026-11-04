import { readFileSync } from "node:fs";
import {
  catalogChoices,
  catalogDefaults,
  checkCatalog,
  decodeOptionValue,
  parseStrategyCatalog,
  writeStrategyCatalog,
  type AnyOption,
  type CatalogEntry,
  type RegistryEntry,
  type SupportProbe,
} from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { strategyCatalog } from "./strategy-catalog.ts";
import { packSpace } from "./pack-space.ts";
import type { Item, PackInput, PackOutput } from "./contract.ts";
import { outputHash } from "./layout-input.ts";
import { STANDALONE_MAX_ITEMS } from "./standalone-strategies.ts";
import { EXACT_STRIP_MAX_ITEMS, EXACT_STRIP_MAX_SIDE } from "./exact-strip.ts";
import { allStrategies as registered } from "./registry.ts";
import { SELECT_MEMBERS } from "./select-core.ts";
import { allStrategies, packWith, strategy } from "./strategy-list.ts";
import { UnsupportedCell } from "./strategy.ts";

const entries: ReadonlyMap<string, CatalogEntry> = new Map(strategyCatalog.strategies.map((e) => [e.key, e]));

const RECTS: readonly Item[] = [
  { id: "a", w: 6, h: 4 },
  { id: "b", w: 4, h: 4 },
  { id: "c", w: 5, h: 3 },
  { id: "d", w: 5, h: 2 },
];

/** This function gives a circle item of radius `r` in a box of side `2r`. */
const disc = (id: string, r: number): Item => ({ id, w: 2 * r, h: 2 * r, shape: { kind: "circle", cx: r, cy: r, r } });

const DISCS: readonly Item[] = [disc("a", 3), disc("b", 2), disc("c", 2), disc("d", 1)];

/** The strategies that pack only circles, and the strategies that a free container gives their size. */
const CIRCLES: readonly string[] = ["hole-degree", "circle-quasi-physical"];
const FREE: readonly string[] = ["masonry", "treemap"];

/** The options that keep a search short, or that a strategy needs for a call. */
const RUN_OPTIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "aspect-fit": { strategy: "rows" },
  "overlap-min": { iterations: 256 },
};

/** This function gives the items of the fixture of a strategy. */
const itemsOf = (key: string): readonly Item[] => (CIRCLES.includes(key) ? DISCS : RECTS);

/** This function gives the container of the fixture of a strategy. */
function containerOf(key: string): PackInput["container"] {
  if (key === "circle-quasi-physical") return { fixed: "none", shape: { kind: "circle", cx: 0, cy: 0, r: 1 } };
  return FREE.includes(key) ? { fixed: "none" } : { w: 10, fixed: "width" };
}

/** This function gives the fixture of a strategy: a small input that it takes. */
const fixture = (key: string): PackInput => ({ container: containerOf(key), items: [...itemsOf(key)] });

/** This function gives a container with the shape of the fixture of a strategy, because a strategy of one container shape refuses each other shape. */
function keepShape(key: string, wanted: PackInput["container"]): PackInput["container"] {
  const { shape } = containerOf(key);
  return shape === undefined ? wanted : { ...wanted, shape };
}

/** This function gives the fixture in a container of a fixed size when the strategy takes one, so a refusal is of the probe and not of the size. */
function fixedFixture(key: string): PackInput {
  const input = fixture(key);
  return (strategy(key).supports.containerSize as readonly string[]).includes("fixed") ? { ...input, container: keepShape(key, { w: 40, h: 40, fixed: "size" }) } : input;
}

/** This function gives the part of an output that a run compares. The trace of an output holds times, and the hash leaves them out. */
const bare = (output: PackOutput): unknown => ({ hash: outputHash(output), placements: output.placements, size: output.size, overflow: output.overflow });

/** This function gives the output of a strategy as text, with the options of `RUN_OPTIONS` under the options of the call. */
function run(key: string, input: PackInput, options: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify(bare(packWith(key, input, { ...RUN_OPTIONS[key], ...options }, 1)));
}

/** The registry facts of the check, from the live strategies. */
const live: readonly RegistryEntry[] = allStrategies.map(({ id }) => ({
  key: id,
  defaults: strategy(id).defaults as Readonly<Record<string, unknown>>,
  optIn: !registered.some((s) => s.id === id),
  ...(entries.get(id)?.limits === undefined ? {} : { limits: Object.fromEntries(Object.entries(entries.get(id)!.limits).map(([name, { max }]) => [name, { max: max! }])) }),
  run: () => run(id, fixture(id)),
}));

/** One change of an input for one value of a dimension of `supports`. */
interface ProbeInput {
  readonly field: string;
  readonly value: string;
  /** This function changes the fixture of a strategy. */
  readonly make: (key: string) => PackInput;
}

/** This function gives a probe that changes the container. */
const container = (value: string, c: PackInput["container"]): ProbeInput => ({ field: "containerSize", value, make: (key) => ({ ...fixture(key), container: keepShape(key, c) }) });

/** This function gives a probe that changes the shape of the container. */
function shaped(value: string, shape: NonNullable<PackInput["container"]["shape"]>): ProbeInput {
  const make = (key: string): PackInput => {
    const input = fixedFixture(key);
    return { ...input, container: { ...input.container, shape } };
  };
  return { field: "containerShape", value, make };
}

/** This function gives the fixture of a strategy in a container with no shape: a rectangle. */
function plainContainer(key: string): PackInput {
  const input = fixture(key);
  const { shape: _shape, ...plain } = input.container;
  return { ...input, container: plain };
}

/** This function gives a probe that adds one obstacle, for a container of a fixed size. */
const obstacle = (value: string, move?: { cost: number }): ProbeInput => ({
  field: "obstacleMove",
  value,
  make: (key) => ({ ...fixedFixture(key), obstacles: [{ id: "o", region: { kind: "rect", x: 30, y: 30, w: 4, h: 4 }, ...(move === undefined ? {} : { move }) }] }),
});

/** This function gives a probe that changes each item. */
function items(field: string, value: string, change: (item: Item, i: number) => Item): ProbeInput {
  const make = (key: string): PackInput => {
    const input = fixture(key);
    return { ...input, items: input.items.map(change) };
  };
  return { field, value, make };
}

/** The inputs of the probes. The mode has no probe, because the input does not tell it. A hard order has none, for the same reason. */
const PROBE_INPUTS: readonly ProbeInput[] = [
  container("fixed", { w: 40, h: 40, fixed: "size" }),
  container("freeHeight", { w: 10, fixed: "width" }),
  container("freeWidth", { h: 10, fixed: "height" }),
  container("freeAspect", { fixed: "none" }),
  container("freeArea", { fixed: "none", aspectWeight: 0 }),
  { field: "containerShape", value: "rect", make: plainContainer },
  shaped("convex", { kind: "polygon", points: [[0, 0], [60, 0], [0, 60]] }),
  shaped("polygon", { kind: "polygon", points: [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]] }),
  shaped("circle", { kind: "circle", cx: 30, cy: 30, r: 30 }),
  shaped("ellipse", { kind: "ellipse", cx: 30, cy: 30, rx: 30, ry: 20 }),
  obstacle("fixed"),
  obstacle("free", { cost: 0 }),
  obstacle("costly", { cost: 1 }),
  items("itemShape", "rect", ({ shape: _shape, ...item }) => item),
  items("itemShape", "polygon", (item) => ({ ...item, shape: { kind: "polygon", points: [[0, 0], [item.w, 0], [0, item.h]] } })),
  items("itemShape", "circle", (item, i) => disc(item.id, 1 + i)),
  items("itemShape", "free", (item) => ({ ...item, shape: { kind: "ellipse", cx: item.w / 2, cy: item.h / 2, rx: item.w / 2, ry: item.h / 2 } })),
  items("itemShape", "mixed", ({ shape: _shape, ...item }, i) => (i === 0 ? disc(item.id, 2) : item)),
  items("rotation", "none", (item) => item),
  items("rotation", "quarter", (item) => ({ ...item, turnable: true })),
  items("order", "free", (item) => item),
  items("order", "soft", (item, i) => ({ ...item, rank: i })),
  items("groups", "none", (item) => item),
  items("groups", "flat", (item, i) => ({ ...item, group: i < 2 ? "g" : "h" })),
  items("groups", "nested", (item, i) => (i === 0 ? item : { ...item, parent: "a" })),
];

/** The value `true` for a refusal of the value of the probe. The value `undefined` for a refusal of something else. */
function refusal(field: string, attempt: () => unknown): boolean | undefined {
  try {
    attempt();
    return false;
  } catch (error) {
    if (error instanceof UnsupportedCell) return error.dimension === field && error.value !== "refused" ? true : undefined;
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/** This function gives the value of a strategy option with one choice. A list has two members with their own ids. */
function choiceValue(declaration: AnyOption, choice: string): unknown {
  return declaration.type === "list" ? [{ id: "one", strategy: choice }, { id: "two", strategy: choice }] : choice;
}

/**
 * This function gives the option records of a composite: one for each member that the declarations offer. The supports of a composite are the union over them.
 * The supports of `portfolio` and `select` are the union over their default members. The table of `select` picks one, so the reverse order tries the other one.
 */
function memberTries(entry: CatalogEntry): readonly Readonly<Record<string, unknown>>[] {
  const out: Readonly<Record<string, unknown>>[] = [{}];
  if (entry.key === "portfolio") return out;
  if (entry.key === "select") return [...out, { members: [...SELECT_MEMBERS].reverse() }];
  for (const [key, declaration] of Object.entries(entry.options)) {
    for (const choice of catalogChoices(strategyCatalog.strategies, declaration)) out.push({ [key]: choiceValue(declaration, choice.key) });
  }
  return out;
}

/** The support probes of the check. A composite refuses a value only when each member refuses it. */
const probes: readonly SupportProbe[] = PROBE_INPUTS.map(({ field, value, make }) => ({
  field,
  value,
  refuses(key: string): boolean | undefined {
    const input = make(key);
    const answers = memberTries(entries.get(key)!).map((options) => refusal(field, () => run(key, input, options)));
    if (answers.includes(false)) return false;
    return answers.includes(true) ? true : undefined;
  },
}));

/** This function runs one choice of a strategy option. */
function refusesChoice(owner: string, option: string, choice: string): boolean | undefined {
  try {
    run(owner, fixture(owner), { [option]: choiceValue(entries.get(owner)!.options[option]!, choice) });
    return false;
  } catch (error) {
    if (error instanceof UnsupportedCell || error instanceof RangeError) return true;
    throw error;
  }
}

/**
 * The faults that the format of the catalog cannot state today. Each one goes away with a change of the format, and a new fault fails the test.
 *
 * - A param of the space has the name of an option, and it holds another form of the value: a name for a list, a table or a key. The rule of the format has no mapped param.
 * - `ruin-recreate` packs around locked items, and `best-fit` has no `obstacleMove`. A choice filter of the format reads no `supports`.
 */
const FORMAT_FAULTS: readonly string[] = [
  'portfolio: the space packing is outside the declaration. The option "key" takes a list.',
  'restarts: the space packing is outside the declaration. The option "key" takes a list.',
  'ruin-recreate: the option "member" with best-fit: the option offers this strategy, and the engine refuses it.',
  'select: the space packing is outside the declaration. The option "table" takes an object.',
  'shelf: the space packing is outside the declaration. The option "fit" takes next, first, best, not none.',
];

/**
 * The params of the space that are not options of the engine. Each one is a value of an order, a step that a stage turns off, or a flag of the space that turns on other params.
 * A new param with no option fails the test.
 */
const SPACE_ONLY: readonly string[] = [
  "combine/anneal.limitWork",
  "combine/aspect-fit.fixedTarget",
  "combine/cell-portfolio",
  "combine/genetic.limitWork",
  "combine/portfolio.aspectFit",
  "combine/portfolio.fixedTarget",
  "combine/portfolio.limitMembers",
  "combine/portfolio.limitTime",
  "combine/portfolio.limitWork",
  "combine/portfolio.targetAspect",
  "combine/relax-pull",
  "combine/restarts.limitWork",
  "combine/side-anchors.at",
  "combine/side-anchors.side",
  "combine/tabu.limitWork",
  "local-search/none",
  "order/area-desc",
  "order/graph-bfs",
  "order/height-asc",
  "order/height-desc",
  "order/input",
  "order/width-desc",
  "placement/maxrects.fixedBands",
  "size-search/log-sweep",
  "size-search/none",
];

/** The result of the whole check, one time for all the tests of this file. */
const check = checkCatalog(strategyCatalog, live, { spaces: [packSpace], probes, refusesChoice });

describe("the strategy catalog (k144)", () => {
  it("has each strategy of the engine, with a line and the live fields", () => {
    expect(strategyCatalog.strategies.map((e) => e.id).sort()).toEqual(allStrategies.map((s) => s.id).sort());
    expect(strategyCatalog.strategies).toHaveLength(31);
    for (const s of allStrategies) {
      const entry = entries.get(s.id)!;
      expect({ family: entry.family, kind: entry.kind, supports: entry.supports, deterministic: entry.deterministic }, s.id).toEqual({ family: s.family, kind: s.kind, supports: s.supports, deterministic: s.deterministic });
      expect(entry.describe, s.id).not.toBe("");
    }
  });

  it("gives the same output with the defaults of the catalog as with no options", () => {
    for (const entry of strategyCatalog.strategies) {
      const defaults = Object.fromEntries(Object.entries(catalogDefaults(entry)).map(([key, value]) => [key, decodeOptionValue(value, entry.options[key] as AnyOption)]));
      expect(run(entry.key, fixture(entry.key), defaults), entry.key).toBe(run(entry.key, fixture(entry.key)));
    }
  });

  it("takes each limit that it states, and refuses past it", () => {
    const many = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, w: 1, h: 1 }));
    const strip = (list: Item[]): PackInput => ({ container: { w: 8, fixed: "width" }, items: list });
    for (const key of ["binary-height", "near-rects", "raster-nofit"]) {
      expect(() => packWith(key, strip(many(STANDALONE_MAX_ITEMS + 1))), key).toThrow(UnsupportedCell);
    }
    expect(() => packWith("exact-strip", strip(many(EXACT_STRIP_MAX_ITEMS + 1)))).toThrow(UnsupportedCell);
    expect(() => packWith("exact-strip", { container: { w: EXACT_STRIP_MAX_SIDE * 2, fixed: "width" }, items: [{ id: "a", w: EXACT_STRIP_MAX_SIDE + 1, h: 1 }] })).toThrow(UnsupportedCell);
  });

  it("passes the check of the contract, with only the faults of the format", () => {
    expect([...new Set(check.faults)].sort()).toEqual(FORMAT_FAULTS);
  });

  it("refuses best-fit in ruin-recreate for the locked items of a recreate", () => {
    expect(() => packWith("ruin-recreate", fixture("ruin-recreate"), { member: "best-fit" }, 1)).toThrow(UnsupportedCell);
  });

  it("runs each probe of each strategy", () => {
    expect(check.notRun).toEqual([]);
  });

  it("states each param of the space with no option", () => {
    expect([...check.notMatched].sort()).toEqual(SPACE_ONLY);
  });
});

describe("the file strategy-catalog.json (k144)", () => {
  const text = readFileSync(new URL("../strategy-catalog.json", import.meta.url), "utf8");

  it("equals the output of the writer, with the version of the package", () => {
    expect(text.replace(/\r\n/gu, "\n")).toBe(writeStrategyCatalog(strategyCatalog, pkg.version));
  });

  it("parses, so a reader needs no engine code", () => {
    const parsed = parseStrategyCatalog(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.catalog.version).toBe(pkg.version);
  });
});
