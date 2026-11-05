// The sync test of roadmap item k72: the lists of the pages are the lists of the registry and of the benchmark entries.
// A new strategy, entry or option that a page does not offer fails this test.

import { readFileSync } from "node:fs";
import { allStrategies, composites, corpusFamilies, GUILLOTINE_CHOICES, GUILLOTINE_SPLITS, shapeStrategies, sideAnchorsStrategy, STANDALONE_MAX_ITEMS, standaloneStrategies, strategies, strategy } from "@mark1russell7/packing";
import { ENTRIES, isComposite, STANDALONE_IDS } from "@mark1russell7/packing/bench/entries";
import { describe, expect, it } from "vitest";
import { optionsOf } from "./cards-model.ts";
import { navLinks } from "./chrome.ts";
import { COMPARE_ENTRIES, COMPARE_FAMILIES } from "./compare-model.ts";
import { dimensionControls, familyKey } from "./corpus-input.ts";
import { staleText } from "./kpi.ts";
import { STRATEGIES } from "./model.ts";
import { DEMO_IDS, MEMBER_ENTRIES, optionControls, packOptions, startValues } from "./options.ts";
import { reasonMeaning, REFUSE_ITEMS } from "./results-model.ts";

describe("the compare page", () => {
  it("offers each entry of ENTRIES, in its order, from the import", () => {
    expect(COMPARE_ENTRIES).toBe(ENTRIES);
    expect(COMPARE_ENTRIES.map((e) => e.id)).toEqual(ENTRIES.map((e) => e.id));
  });

  it("offers rect-scattered and each corpus family of the package, with a control for each dimension", () => {
    expect(COMPARE_FAMILIES.map((f) => f.name)).toEqual(["rect-scattered", ...corpusFamilies.map((f) => f.name)]);
    for (const f of COMPARE_FAMILIES) expect(dimensionControls(familyKey(f)).map((c) => c.name)).toEqual(f.dimensions.map((d) => d.name));
  });

  it("is an input of the build and a link of the header", () => {
    // The config of the build is outside the root of the type check, so the test reads its text.
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toContain(`compare: page("./compare/index.html")`);
    expect(navLinks("/", "compare").find((l) => l.current)?.href).toBe("/compare/");
    expect(readFileSync(new URL("../compare/index.html", import.meta.url), "utf8")).toContain("/src/compare.ts");
  });
});

describe("the text of the home page", () => {
  it("states no count of strategies that differs from the package", () => {
    const pages = ["../index.html", "../content/about.md"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    expect(staleText(pages, allStrategies.length)).toBe(0);
  });
});

describe("the demo", () => {
  it("offers each strategy of the registry, also the strategies of one shape kind and the composite strategies", () => {
    const registry = [...strategies, ...shapeStrategies, ...standaloneStrategies, ...composites, sideAnchorsStrategy].map((s) => s.id);
    expect(DEMO_IDS).toEqual(registry);
    expect([...DEMO_IDS].sort()).toEqual(allStrategies.map((s) => s.id).sort());
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

  it("gives side-anchors its member, and the first anchor only when a side is set", () => {
    const entry = ENTRIES.find((e) => e.id === "maxrects-bl")!;
    const start = packOptions("side-anchors", startValues("side-anchors"));
    expect(start).toEqual({ strategy: entry.strategy, strategyOptions: entry.options });
    expect(packOptions("side-anchors", { ...startValues("side-anchors"), firstSide: "top", firstAt: 0.25 })).toEqual({ ...start, first: { side: "top", at: 0.25 } });
  });

  it("packs with the defaults of each strategy when no control changes", () => {
    for (const id of DEMO_IDS) {
      const options = packOptions(id, startValues(id));
      const defaults = strategy(id).defaults as Record<string, unknown>;
      for (const [key, value] of Object.entries(defaults)) expect(options[key], `${id}.${key}`).toEqual(value);
    }
  });

  it("picks the members of portfolio, select, aspect-fit, restarts, bbox, ruin-recreate, overlap-min, anneal, genetic and tabu from the named entries", () => {
    expect(MEMBER_ENTRIES.map((e) => e.id)).toEqual(ENTRIES.filter((e) => !isComposite(e.id) && !STANDALONE_IDS.has(e.id)).map((e) => e.id));
    const ids = ENTRIES.map((e) => e.id);
    for (const id of ["portfolio", "select", "aspect-fit", "restarts", "bbox", "ruin-recreate", "overlap-min", "anneal", "genetic", "tabu"]) {
      const pickers = optionControls(id).filter((c) => c.kind === "entry" || c.kind === "members");
      expect(pickers.length, id).toBe(1);
      for (const c of pickers) if (c.kind === "entry" || c.kind === "members") for (const v of c.values) expect(ids).toContain(v);
    }
  });

  it("offers guillotine with each rule to choose and to split, the turn and the merge", () => {
    expect(DEMO_IDS).toContain("guillotine");
    expect(COMPARE_ENTRIES.map((e) => e.id)).toEqual(expect.arrayContaining(["guillotine-baf-sas", "guillotine-bssf-sas-merge"]));
    const controls = Object.fromEntries(optionControls("guillotine").map((c) => [c.key, c]));
    expect(controls["choice"]).toMatchObject({ kind: "select", values: [...GUILLOTINE_CHOICES], value: "baf" });
    expect(controls["split"]).toMatchObject({ kind: "select", values: [...GUILLOTINE_SPLITS], value: "sas" });
    expect(controls["rotate"]).toMatchObject({ kind: "flag", value: false });
    expect(controls["merge"]).toMatchObject({ kind: "flag", value: false });
    const options = packOptions("guillotine", { ...startValues("guillotine"), choice: "wlsf", split: "maxas", merge: true });
    expect(options).toMatchObject({ choice: "wlsf", split: "maxas", rotate: false, merge: true });
  });

  it("gives restarts its member as a named entry with its options", () => {
    const options = packOptions("restarts", { ...startValues("restarts"), member: "rows", budgetMs: 50 });
    expect(options).toEqual({ iterations: 16, perturb: "swap", strength: 0.1, limitTime: false, member: { id: "rows", strategy: "rows", options: {} }, budgetMs: 50 });
  });

  // Roadmap item k117: the work limit of portfolio and restarts
  it("offers the work limit of portfolio and restarts, with no value at the start", () => {
    for (const id of ["portfolio", "restarts"]) {
      const c = optionControls(id).find((x) => x.key === "budgetWork");
      expect(c, id).toEqual({ key: "budgetWork", kind: "number", value: undefined, min: 0, max: 1_000_000, step: 1, fromDefaults: false });
      expect(packOptions(id, startValues(id)), id).not.toHaveProperty("budgetWork");
      expect(packOptions(id, { ...startValues(id), budgetWork: "3000" }), id).toMatchObject({ budgetWork: 3000 });
      const card = optionsOf(strategy(id)).find((o) => o.name === "budgetWork");
      expect(card, id).toMatchObject({ type: "number", value: null });
      expect(card!.note, id).toContain("same on each computer");
    }
  });
});

describe("the results page", () => {
  it("states the limit of the standalone strategies", () => {
    expect(REFUSE_ITEMS).toBe(STANDALONE_MAX_ITEMS);
  });

  it("gives a meaning to each reason of the budget of the bench", () => {
    const files = ["budget.ts", "run.ts"].map((name) => readFileSync(new URL(`../../packing/bench/${name}`, import.meta.url), "utf8"));
    const reasons = files.flatMap((text) => [...text.matchAll(/^export const (?:OVER_BUDGET|NOT_RUN_\w+) = "([^"]+)";$/gm)].map((m) => m[1]!));
    expect(reasons).toHaveLength(4);
    for (const reason of reasons) expect(reasonMeaning(reason), reason).toBeDefined();
  });
});
