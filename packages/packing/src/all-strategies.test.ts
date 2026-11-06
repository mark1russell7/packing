import { readdirSync, readFileSync } from "node:fs";
import * as api from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { ENTRIES } from "../bench/entries.ts";
import { composites, shapeStrategies, strategies } from "./registry.ts";
import { allStrategies, strategy } from "./strategy-list.ts";
import { sideAnchorsStrategy, standaloneStrategies } from "./standalone-strategies.ts";

const isStrategy = (value: unknown): value is { id: string } => {
  const s = value as { id?: unknown; supports?: unknown; pack?: unknown } | null;
  return typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.supports === "object" && typeof s.pack === "function";
};

/** This function loads each source module and gives the id of each strategy that a module exports, alone or in a list. */
async function exportedIds(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))) {
    const module = (await import(`./${name}`)) as Record<string, unknown>;
    for (const value of Object.values(module)) {
      for (const item of Array.isArray(value) ? value : [value]) if (isStrategy(item)) found.set(item.id, name);
    }
  }
  return found;
}

/** Each exported function that a strategy of the registry wraps, with the id of that strategy. */
const WRAPPED: Readonly<Record<string, string>> = {
  beamStrip: "beam",
  columnsLinearPartition: "masonry",
  exactStrip: "exact-strip",
  masonryLpt: "masonry",
  masonryShortest: "masonry",
  packBinaryHeight: "binary-height",
  packGuillotine: "guillotine",
  packMaxRects: "maxrects",
  packNearRects: "near-rects",
  packPortfolio: "portfolio",
  packRasterNofit: "raster-nofit",
  packRows: "rows",
  packShelf: "shelf",
  packSideAnchors: "side-anchors",
  packSkyline: "skyline",
  sleatorStrip: "sleator",
  treemapPack: "treemap",
};

/** Each exported function that gives a layout and is not a strategy, with the reason. */
const NOT_STRATEGIES: Readonly<Record<string, string>> = {
  packConfig: "It packs a point of packSpace, so it reads each strategy.",
  packDefault: "It packs with the default strategy of the registry.",
  packFree: "It searches the width around the strategy of an option.",
  packParts: "It packs the parts of a split, each with a strategy of the caller.",
  packWith: "It packs with a strategy of the registry by id.",
  packWork: "It is a measure of an output, and it gives no layout.",
  sweepSearch: "It is a size search that a strategy uses.",
  viaAxes: "It turns the axes around a strategy.",
};

/** This function gives each exported function that gives a layout: a function of an input with an output, or a function with a `pack` name. */
function layoutFunctions(): string[] {
  const found = new Set(Object.entries(api).filter(([name, value]) => typeof value === "function" && /^pack[A-Z]/.test(name)).map(([name]) => name));
  const dir = new URL("./", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))) {
    const source = readFileSync(new URL(name, dir), "utf8");
    for (const match of source.matchAll(/^export function (\w+)(?:<[^>]*>)?\(input: PackInput.*\): (?:PackOutput|\w+Result)/gm)) found.add(match[1]!);
  }
  return [...found].sort();
}

describe("allStrategies", () => {
  it("has each strategy of the lists once", () => {
    const ids = allStrategies.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...strategies, ...standaloneStrategies, ...shapeStrategies, ...composites, sideAnchorsStrategy].map((s) => s.id).sort());
  });

  it("gives each list its kind", () => {
    const kinds = new Map(allStrategies.map((s) => [s.id, s.kind]));
    expect(strategies.every((s) => kinds.get(s.id) === "single")).toBe(true);
    expect(shapeStrategies.every((s) => kinds.get(s.id) === "shape")).toBe(true);
    expect(composites.every((s) => kinds.get(s.id) === "composite")).toBe(true);
  });

  it("gives the supports and the family of the strategy", () => {
    for (const listing of allStrategies) {
      const own = strategy(listing.id);
      expect(listing.supports).toBe(own.supports);
      expect(listing.family).toBe(own.family);
      expect(listing.deterministic).toBe(own.deterministic);
    }
  });

  it("lists each strategy that a source module exports", async () => {
    const listed = new Set(allStrategies.map((s) => s.id));
    const found = await exportedIds();
    expect([...found.keys()].filter((id) => !listed.has(id))).toEqual([]);
    expect(found.has("hole-degree")).toBe(true);
  });

  it("lists each function that gives a layout, or tells why the function is not a strategy", () => {
    const listed = new Set(allStrategies.map((s) => s.id));
    const unknown = layoutFunctions().filter((name) => WRAPPED[name] === undefined && NOT_STRATEGIES[name] === undefined);
    expect(unknown, "Add a strategy to the registry, or add the function to NOT_STRATEGIES with its reason.").toEqual([]);
    expect(Object.entries(WRAPPED).filter(([, id]) => !listed.has(id))).toEqual([]);
  });

  it("has a bench entry for each rectangle strategy", () => {
    const entered = new Set(ENTRIES.map((e) => e.strategy));
    const shapeOnly = new Set(shapeStrategies.map((s) => s.id));
    expect(allStrategies.filter((s) => !entered.has(s.id) && !shapeOnly.has(s.id)).map((s) => s.id)).toEqual([]);
  });

  it("lists the strategy of each bench entry", () => {
    const listed = new Set(allStrategies.map((s) => s.id));
    expect(ENTRIES.map((e) => e.strategy).filter((id) => !listed.has(id))).toEqual([]);
  });

  it("refuses an id that it does not have", () => {
    expect(() => strategy("no-such-strategy")).toThrow(RangeError);
  });
});
