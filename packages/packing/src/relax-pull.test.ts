import { configId } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkHard, configOfStrategy, measure, mulberry32, packConfig, packSpace, packWith, RELAX_PULL_MAX_BOXES, RELAX_STAGE, rectGrid, toPackInput, type PackInput, type PackOutput, type StrategyConfig } from "./index.ts";

// The option `pull` of `relax` (k137): the boxes move along their free space toward their linked boxes. Made-up inputs only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** The member `maxrects` with the rule `bl`. */
const BL = { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } };

/** This function adds to an input a seeded tree of links: each item links to one item before it. */
function withLinks(input: PackInput, seed: number): PackInput {
  const rng = mulberry32(seed);
  return { ...input, links: input.items.slice(1).map((_, i) => ({ a: i + 1, b: Math.floor(rng() * (i + 1)) })) };
}

/** This function gives the sum over the links of an output of the weight times the Manhattan distance between the centers. */
function wireOf(input: PackInput, output: PackOutput): number {
  const at = new Map(output.placements.map((p) => [p.id, p]));
  let sum = 0;
  for (const { a, b, weight = 1 } of input.links ?? []) {
    const p = at.get(input.items[a]!.id);
    const q = at.get(input.items[b]!.id);
    if (p === undefined || q === undefined) continue;
    const [i, j] = [input.items[a]!, input.items[b]!];
    sum += weight * (Math.abs(p.x + i.w / 2 - q.x - j.w / 2) + Math.abs(p.y + i.h / 2 - q.y - j.h / 2));
  }
  return sum;
}

/** This function gives the lowest edge of the boxes of an output. */
function heightOf(input: PackInput, output: PackOutput): number {
  const at = new Map(input.items.map((item) => [item.id, item]));
  return Math.max(...output.placements.map((p) => p.y + at.get(p.id)!.h));
}

/** This function gives the measures of the relax stage of an output. */
const stage = (output: PackOutput): Readonly<Record<string, number>> | undefined => output.trace?.find((t) => t.id === RELAX_STAGE)?.measures;

type Sizes = "uniform" | "heavyTail" | "bimodal";
type ContainerSize = "freeHeight" | "fixed";

/** This function gives a seeded input of the grid family with a tree of links. */
const linked = (seed: number, sizes: Sizes, containerSize: ContainerSize = "freeHeight", obstacles: "none" | "scattered" = "none", order = true): PackInput => {
  const input = toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize, obstacles, sizes, count: 40 }));
  return order ? withLinks(input, seed) : input;
};

describe("relax: the pull with no links", () => {
  it("gives the layout of the member, for each member, container and size family", () => {
    for (const sizes of ["uniform", "heavyTail", "bimodal"] as const) {
      for (const containerSize of ["freeHeight", "fixed"] as const) {
        for (const member of ["rows", BL]) {
          const input = linked(1, sizes, containerSize, "scattered", false);
          const base = typeof member === "string" ? packWith(member, input) : packWith(member.strategy, input, member.options);
          expect(packWith("relax", input, { member, strength: 0, pull: 1 }).placements).toEqual(base.placements);
          expect(packWith("relax", { ...input, links: [] }, { member, strength: 0, pull: 1 }).placements).toEqual(base.placements);
        }
      }
    }
  });

  it("gives the old relax output with the default pull and with no links", () => {
    const input = linked(2, "uniform", "fixed", "none", false);
    expect(packWith("relax", input, { pull: 1 }).placements).toEqual(packWith("relax", input).placements);
  });

  it("does not read the links without the option pull", () => {
    const input = linked(3, "bimodal", "fixed");
    const out = packWith("relax", input);
    expect(out.placements).toEqual(packWith("relax", { ...input, links: [] }).placements);
    expect(Object.keys(stage(out)!).toSorted()).toEqual(["move.relax", "relax.constraints", "relax.fallback", "relax.moved"]);
  });
});

describe("relax: the pull on a hand case", () => {
  const box = (id: string, w: number, h: number): PackInput["items"][number] => ({ id, w, h });

  it("moves a box along its free space to its link, and stops at the other box", () => {
    // The two boxes pack at the left wall of a wide row. The locked box at x 90 pulls the last box.
    const input: PackInput = {
      container: { w: 100, h: 10, fixed: "size" },
      items: [box("a", 10, 10), box("b", 10, 10), { id: "lock", w: 10, h: 10, x: 90, y: 0, locked: true }],
      links: [{ a: 1, b: 2 }],
    };
    const out = packWith("relax", input, { member: "rows", strength: 0, pull: 1 });
    expect(checkHard(input, out)).toEqual(CLEAN);
    const at = new Map(out.placements.map((p) => [p.id, p]));
    expect(at.get("b")!.x).toBeCloseTo(80, 6);
    expect(at.get("lock")!.x).toBe(90);
  });

  it("ignores a link of an item to itself, a link of weight 0, and a link to an item that does not fit", () => {
    const input: PackInput = {
      container: { w: 100, h: 20, fixed: "size" },
      items: [box("a", 10, 10), box("b", 10, 10), box("big", 200, 10)],
      links: [{ a: 0, b: 0 }, { a: 0, b: 1, weight: 0 }, { a: 0, b: 2 }],
    };
    const out = packWith("relax", input, { member: "rows", strength: 0, pull: 1 });
    expect(out.placements).toEqual(packWith("rows", input).placements);
    expect(out.overflow).toEqual(["big"]);
  });

  it("does not make a new height on a free side, and keeps the output size", () => {
    const input = linked(4, "uniform");
    const base = packWith("rows", input, { sortOrder: "graph-bfs" });
    const out = packWith("relax", input, { member: { id: "rows", strategy: "rows", options: { sortOrder: "graph-bfs" } }, strength: 0, pull: 1 });
    expect(out.size).toEqual(base.size);
    expect(heightOf(input, out)).toBeLessThanOrEqual(heightOf(input, base) + 1e-6);
  });

  it("does not pull above RELAX_PULL_MAX_BOXES boxes", () => {
    const items = Array.from({ length: RELAX_PULL_MAX_BOXES + 1 }, (_, i) => box(`b${i}`, 2, 2));
    const input: PackInput = { container: { w: 200, fixed: "width" }, items, links: [{ a: 0, b: items.length - 1 }] };
    const out = packWith("relax", input, { member: "rows", strength: 0, pull: 1 });
    expect(out.placements).toEqual(packWith("rows", input).placements);
    expect(stage(out)?.["relax.pull.rounds"]).toBe(0);
  });

  it("throws a RangeError for a pull out of 0 to 1", () => {
    expect(() => packWith("relax", linked(5, "uniform"), { pull: 1.5 })).toThrow(RangeError);
    expect(() => packWith("relax", linked(5, "uniform"), { pull: -0.5 })).toThrow(RangeError);
  });

  it("is deterministic and does not read the seed", () => {
    const input = linked(6, "heavyTail");
    expect(packWith("relax", input, { strength: 0, pull: 1 }, 1).placements).toEqual(packWith("relax", input, { strength: 0, pull: 1 }, 2).placements);
  });
});

describe("relax: the hard rules of the pull", () => {
  it("keeps each hard rule, the placed set and the overflow, with gaps, margins and obstacles", () => {
    for (let seed = 201; seed < 221; seed++) {
      for (const containerSize of ["freeHeight", "fixed"] as const) {
        for (const obstacles of ["none", "scattered"] as const) {
          const plain = linked(seed, seed % 2 === 0 ? "uniform" : "bimodal", containerSize, obstacles);
          const input: PackInput = { ...plain, gap: seed % 3, items: plain.items.map((item, i) => (i % 4 === 0 ? { ...item, margin: 1 } : item)) };
          for (const member of ["rows", BL]) {
            const base = typeof member === "string" ? packWith(member, input) : packWith(member.strategy, input, member.options);
            const out = packWith("relax", input, { member, strength: 0, pull: 1 });
            const label = `${seed} ${containerSize} ${obstacles}`;
            expect(checkHard(input, out), label).toEqual(checkHard(input, base));
            expect(out.overflow, label).toEqual(base.overflow);
            expect(out.size, label).toEqual(base.size);
            expect(out.placements.map((p) => p.id).toSorted(), label).toEqual(base.placements.map((p) => p.id).toSorted());
            expect(stage(out)?.["relax.fallback"], label).toBe(0);
            expect(wireOf(input, out), label).toBeLessThanOrEqual(wireOf(input, base) + 1e-6);
          }
        }
      }
    }
  }, 120_000);

  it("gives a clean output on the corpus inputs without margins", () => {
    for (let seed = 221; seed < 231; seed++) {
      const input = linked(seed, "heavyTail", "fixed", "scattered");
      expect(checkHard(input, packWith("relax", input, { strength: 0, pull: 1 })), String(seed)).toEqual(checkHard(input, packWith("maxrects", input, { rule: "bl" })));
    }
  });

  it("does not move a locked box, and pulls the boxes toward it", () => {
    for (let seed = 231; seed < 241; seed++) {
      const plain = linked(seed, "uniform");
      const items = plain.items.map((item, i) => (i === 0 ? { ...item, x: 0, y: 0, locked: true } : item));
      const input: PackInput = { ...plain, items };
      const out = packWith("relax", input, { strength: 0, pull: 1 });
      const locked = out.placements.find((p) => p.id === items[0]!.id)!;
      expect([locked.x, locked.y]).toEqual([0, 0]);
      expect(checkHard(input, out)).toEqual(CLEAN);
    }
  });
});

describe("relax: the config of the pull", () => {
  const named = packSpace.named!;

  it("gives the output of packWith for the named configs", () => {
    const input = linked(7, "uniform");
    const run = (name: string): PackOutput => packConfig(input, named[name]!);
    expect(run("relax-pull-rows").placements).toEqual(packWith("relax", input, { member: "rows", strength: 0, pull: 1 }).placements);
    expect(run("relax-pull-maxrects-bl").placements).toEqual(packWith("relax", input, { member: BL, strength: 0, pull: 1 }).placements);
  });

  it("gives the member output with the param pull 0", () => {
    const input = linked(8, "uniform");
    const off: StrategyConfig = { space: "packing", stages: { combine: { option: "relax-pull", params: { pull: 0 }, members: [named["rows"]!] } } };
    expect(packConfig(input, off).placements).toEqual(packWith("rows", input).placements);
  });

  it("gives the point of the pull with configOfStrategy", () => {
    const point = configOfStrategy("relax", { strength: 0, pull: 1 });
    expect(point.ok).toBe(true);
    if (point.ok) expect(configId(packSpace, point.config)).toBe(configId(packSpace, named["relax-pull-maxrects-bl"]!));
    const rows = configOfStrategy("relax", { member: "rows", strength: 0, pull: 1 });
    expect(rows.ok).toBe(true);
    if (rows.ok) expect(configId(packSpace, rows.config)).toBe(configId(packSpace, named["relax-pull-rows"]!));
    const none = configOfStrategy("relax", { pull: 0 });
    expect(none.ok).toBe(true);
    if (none.ok) expect(configId(packSpace, none.config)).toBe(configId(packSpace, named["relax"]!));
  });

  it("gives a reason for a pull with a spread, which no config holds", () => {
    expect(configOfStrategy("relax", { strength: 1, pull: 1 }).ok).toBe(false);
    expect(configOfStrategy("relax", { member: "rows", pull: 1 }).ok).toBe(false);
  });
});

describe("relax: the pull on linked inputs", () => {
  /** This function gives 20 linked inputs of one size family. The trial of `docs/PACKER.md` used the seeds 1 to 20, so this test does not. */
  const inputs = (sizes: Sizes): PackInput[] => Array.from({ length: 20 }, (_, i) => linked(i + 101, sizes));

  // The limits are under the measured values of `docs/PACKER.md`. Each row has the member, the size family and the largest wire share.
  const rows: readonly (readonly [string, Record<string, unknown>, Sizes, number])[] = [
    ["rows", {}, "uniform", 0.95],
    ["rows", {}, "heavyTail", 0.95],
    ["rows", {}, "bimodal", 0.95],
    ["maxrects", { rule: "bl" }, "uniform", 0.995],
    ["maxrects", { rule: "bl" }, "heavyTail", 0.995],
    ["maxrects", { rule: "bl" }, "bimodal", 0.995],
  ];

  for (const [strategy, options, sizes, limit] of rows) {
    it(`gives a shorter wire length than ${strategy} on ${sizes} inputs, and keeps the height and the fill`, () => {
      const member = { id: strategy, strategy, options: { ...options, sortOrder: "graph-bfs" } };
      let wins = 0;
      let wire = [0, 0];
      let height = [0, 0];
      let fill = [0, 0];
      for (const input of inputs(sizes)) {
        const base = packWith(strategy, input, member.options);
        const out = packWith("relax", input, { member, strength: 0, pull: 1 });
        expect(checkHard(input, out)).toEqual(CLEAN);
        const [a, b] = [wireOf(input, out), wireOf(input, base)];
        if (a < b) wins++;
        wire = [wire[0]! + a, wire[1]! + b];
        height = [height[0]! + heightOf(input, out), height[1]! + heightOf(input, base)];
        fill = [fill[0]! + measure(input, out)["pack.fill"], fill[1]! + measure(input, base)["pack.fill"]];
      }
      expect(wins).toBe(20);
      expect(wire[0]! / wire[1]!).toBeLessThan(limit);
      expect(height[0]! / height[1]!).toBeLessThanOrEqual(1);
      expect(fill[0]! / fill[1]!).toBeGreaterThan(0.99);
    }, 30_000);
  }
});
