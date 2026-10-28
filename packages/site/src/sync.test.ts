// The sync test of roadmap item k72: the lists of the pages are the lists of the registry and of the benchmark entries.
// A new strategy, entry or option that a page does not offer fails this test.

import { readFileSync } from "node:fs";
import { composites, strategies, strategy } from "@mark1russell7/packing";
import { ENTRIES, isComposite } from "@mark1russell7/packing/bench/entries";
import { describe, expect, it } from "vitest";
import { navLinks } from "./chrome.ts";
import { COMPARE_ENTRIES, COMPARE_GENERATORS, paramControls } from "./compare-model.ts";
import { STRATEGIES } from "./model.ts";
import { DEMO_IDS, MEMBER_ENTRIES, optionControls, packOptions, startValues } from "./options.ts";

describe("the compare page", () => {
  it("offers each entry of ENTRIES, in its order, from the import", () => {
    expect(COMPARE_ENTRIES).toBe(ENTRIES);
    expect(COMPARE_ENTRIES.map((e) => e.id)).toEqual(ENTRIES.map((e) => e.id));
  });

  it("offers each generator of the package, with a control for each parameter", () => {
    expect(COMPARE_GENERATORS.length).toBeGreaterThan(0);
    for (const g of COMPARE_GENERATORS) expect(paramControls(g).map((c) => c.key)).toEqual(Object.keys(g.defaults));
  });

  it("is an input of the build and a link of the header", () => {
    // The config of the build is outside the root of the type check, so the test reads its text.
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toContain(`compare: page("./compare/index.html")`);
    expect(navLinks("/", "compare").find((l) => l.current)?.href).toBe("/compare/");
    expect(readFileSync(new URL("../compare/index.html", import.meta.url), "utf8")).toContain("/src/compare.ts");
  });
});

describe("the demo", () => {
  it("offers each strategy of the registry, also the composite strategies", () => {
    const registry = [...strategies, ...composites].map((s) => s.id);
    expect(DEMO_IDS).toEqual(registry);
    expect(STRATEGIES).toEqual(registry);
  });

  it("has a control of the fitting type for each option of the defaults of each strategy", () => {
    for (const id of DEMO_IDS) {
      const defaults = strategy(id).defaults as Record<string, unknown>;
      const controls = optionControls(id);
      for (const [key, value] of Object.entries(defaults)) {
        const c = controls.find((x) => x.key === key);
        expect(c, `${id}.${key}`).toBeDefined();
        const kind = typeof value === "boolean" ? "flag" : typeof value === "number" ? "number" : "select";
        expect(c!.kind, `${id}.${key}`).toBe(kind);
        if (c!.kind === "select") expect(c!.values).toContain(value);
      }
    }
  });

  it("packs with the defaults of each strategy when no control changes", () => {
    for (const id of DEMO_IDS) {
      const options = packOptions(id, startValues(id));
      const defaults = strategy(id).defaults as Record<string, unknown>;
      for (const [key, value] of Object.entries(defaults)) expect(options[key], `${id}.${key}`).toEqual(value);
    }
  });

  it("picks the members of portfolio, select and aspect-fit from the named entries", () => {
    expect(MEMBER_ENTRIES.map((e) => e.id)).toEqual(ENTRIES.filter((e) => !isComposite(e.id)).map((e) => e.id));
    const ids = ENTRIES.map((e) => e.id);
    for (const id of ["portfolio", "select", "aspect-fit"]) {
      const pickers = optionControls(id).filter((c) => c.kind === "entry" || c.kind === "members");
      expect(pickers.length, id).toBe(1);
      for (const c of pickers) if (c.kind === "entry" || c.kind === "members") for (const v of c.values) expect(ids).toContain(v);
    }
  });
});
