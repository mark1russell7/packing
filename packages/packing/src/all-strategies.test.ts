import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTRIES } from "../bench/entries.ts";
import { allStrategies, composites, shapeStrategies, strategies, strategy } from "./registry.ts";

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

describe("allStrategies", () => {
  it("has each strategy of the three lists once", () => {
    const ids = allStrategies.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...strategies, ...shapeStrategies, ...composites].map((s) => s.id).sort());
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

  it("lists the strategy of each bench entry", () => {
    const listed = new Set(allStrategies.map((s) => s.id));
    expect(ENTRIES.map((e) => e.strategy).filter((id) => !listed.has(id))).toEqual([]);
  });

  it("refuses an id that it does not have", () => {
    expect(() => strategy("no-such-strategy")).toThrow(RangeError);
  });
});
