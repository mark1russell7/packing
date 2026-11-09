import { describe, expect, it } from "vitest";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { measure } from "./measures.ts";
import { packWith, strategy } from "./registry.ts";
import { createContext, mulberry32 } from "./strategy.ts";

/** This function gives an input of `n` random boxes in a fixed container with slack. */
function scattered(seed: number, n: number, extra: Partial<PackInput> = {}): PackInput {
  const random = mulberry32(seed);
  const items = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: 4 + Math.floor(random() * 16), h: 4 + Math.floor(random() * 16) }));
  return { container: { w: 120, h: 120, fixed: "size" }, items, gap: 2, ...extra };
}

/** This function gives the sum of the hard breaks of an output. */
const hard = (input: PackInput, output: PackOutput): number => Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);

/** The id of the trace stage of `force`. The test does not import `force.ts` before the registry, so that the import order stays. */
const FORCE_STAGE = "force";

/** This function gives the measures of the force stage of an output. */
const stage = (output: PackOutput): Readonly<Record<string, number>> | undefined => output.trace?.find((t) => t.id === FORCE_STAGE)?.measures;

describe("force", () => {
  it("spreads a corner pack over a fixed container, with the same placed set and less skew", () => {
    const input = scattered(1, 30);
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("force", input);
    expect(hard(input, out)).toBe(0);
    expect(out.placements.map((p) => p.id).toSorted()).toEqual(base.placements.map((p) => p.id).toSorted());
    expect(out.overflow).toEqual(base.overflow);
    expect(out.size).toEqual(base.size);
    const before = measure(input, base);
    const after = measure(input, out);
    expect(after["pack.balance.sideRange"]).toBeLessThan(before["pack.balance.sideRange"] - 0.2);
    expect(stage(out)?.["force.fallback"]).toBe(0);
    expect(stage(out)?.["force.gap"]).toBeGreaterThan(0);
    expect(stage(out)?.["move.force"]).toBeGreaterThan(0);
  });

  it("gives no hard break and keeps the placed set on 40 random inputs and 3 members", () => {
    let fallbacks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const input = scattered(100 + seed, 10 + (seed % 5) * 10);
      for (const member of ["rows", "skyline", "maxrects"]) {
        const base = packWith(member, input);
        const out = packWith("force", input, { member });
        expect(hard(input, out), `${member} ${seed}`).toBe(0);
        expect(out.placements.length).toBe(base.placements.length);
        expect(out.overflow).toEqual(base.overflow);
        fallbacks += stage(out)?.["force.fallback"] ?? 0;
      }
    }
    // The guard falls back rarely, so the test reads the force layout.
    expect(fallbacks).toBeLessThanOrEqual(6);
  });

  it("gives the member output with 0 iterations", () => {
    const input = scattered(2, 20);
    const base = packWith("maxrects", input, { rule: "bl" });
    expect(packWith("force", input, { iterations: 0 }).placements).toEqual(base.placements);
  });

  it("keeps the obstacles fixed and places no box on them", () => {
    const obstacles = [{ id: "o1", region: { kind: "rect" as const, x: 50, y: 50, w: 20, h: 20 } }];
    const input = scattered(4, 30, { obstacles });
    const out = packWith("force", input);
    expect(hard(input, out)).toBe(0);
    expect(stage(out)?.["force.fallback"]).toBe(0);
    expect(stage(out)?.["force.capped"]).toBe(0);
  });

  it("does not count the obstacles in the cap of the moving boxes, and marks a capped result", () => {
    const random = mulberry32(9);
    const items = Array.from({ length: 1001 }, (_, i) => ({ id: `b${i}`, w: 2 + Math.floor(random() * 4), h: 2 + Math.floor(random() * 4) }));
    const obstacles = [{ id: "o1", region: { kind: "rect" as const, x: 0, y: 0, w: 10, h: 10 } }];
    const input: PackInput = { container: { w: 300, h: 300, fixed: "size" }, items, obstacles };
    expect(stage(packWith("force", input, { member: "rows", iterations: 1, rounds: 0 }))?.["force.capped"]).toBe(1);
    const under: PackInput = { ...input, items: items.slice(0, 1000) };
    const out = packWith("force", under, { member: "rows", iterations: 1, rounds: 0 });
    expect(stage(out)?.["force.capped"]).toBe(0);
    expect(hard(under, out)).toBe(0);
  });

  it("keeps the member output and marks the result when the fixed boxes pass the cap", () => {
    const obstacles = Array.from({ length: 1001 }, (_, i) => ({ id: `o${i}`, region: { kind: "rect" as const, x: (i % 40) * 10, y: 200 + Math.floor(i / 40) * 10, w: 1, h: 1 } }));
    const input: PackInput = { container: { w: 400, h: 500, fixed: "size" }, items: scattered(7, 10).items, obstacles };
    const base = packWith("rows", input);
    const out = packWith("force", input, { member: "rows" });
    expect(out.placements).toEqual(base.placements);
    expect(stage(out)?.["force.capped"]).toBe(1);
  });

  it("is deterministic and does not read the seed", () => {
    const input = scattered(5, 40);
    expect(packWith("force", input, undefined, 1).placements).toEqual(packWith("force", input, undefined, 2).placements);
  });

  it("keeps the output size on a free side, with no hard break", () => {
    const input: PackInput = { ...scattered(3, 25), container: { w: 120, fixed: "width" } };
    const base = packWith("maxrects", input, { rule: "bl" });
    const out = packWith("force", input);
    expect(out.size).toEqual(base.size);
    expect(hard(input, out)).toBe(0);
    expect(stage(out)?.["force.fallback"]).toBe(0);
  });

  it("throws a RangeError for a bad count", () => {
    expect(() => packWith("force", scattered(6, 5), { iterations: 1.5 })).toThrow(RangeError);
    expect(() => packWith("force", scattered(6, 5), { rounds: -1 })).toThrow(RangeError);
  });
});

/** This function packs an input with `force` from a start output (roadmap item k220). */
function fromStart(input: PackInput, previous: PackOutput, options: object = {}): PackOutput {
  const s = strategy("force");
  return s.pack(input, { ...(s.defaults as object), ...options }, createContext(0, { previous }));
}

/** This function gives the sum of the center moves of the boxes of two outputs, over the ids of both. */
function moveSum(a: PackOutput, b: PackOutput): number {
  const at = new Map(a.placements.map((p) => [p.id, p]));
  return b.placements.reduce((sum, p) => {
    const q = at.get(p.id);
    return q === undefined ? sum : sum + Math.hypot(p.x - q.x, p.y - q.y);
  }, 0);
}

describe("force from a start frame (k220)", () => {
  it("has the mode incremental", () => {
    expect(strategy("force").supports.mode).toContain("incremental");
  });

  it("gives the same placements for a clean start: a fixed point with 0 steps and 0 moves", () => {
    for (let seed = 0; seed < 10; seed++) {
      const input = scattered(300 + seed, 20);
      const first = packWith("force", input);
      const again = fromStart(input, first);
      expect(again.placements, `seed ${seed}`).toEqual(first.placements);
      expect(moveSum(first, again)).toBe(0);
      expect(stage(again)?.["force.start"]).toBe(1);
      expect(stage(again)?.["force.steps"]).toBe(0);
      expect(stage(again)?.["move.force"]).toBe(0);
    }
  });

  it("moves less than a fresh pass when a box comes in, with no hard break", () => {
    let fewer = 0;
    for (let seed = 0; seed < 10; seed++) {
      const input = scattered(400 + seed, 20);
      const before = packWith("force", input);
      const grown: PackInput = { ...input, items: [...input.items, { id: "new", w: 12, h: 12 }] };
      const started = fromStart(grown, before);
      const fresh = packWith("force", grown);
      expect(hard(grown, started), `seed ${seed}`).toBe(0);
      expect(started.placements.map((p) => p.id).toSorted()).toEqual(fresh.placements.map((p) => p.id).toSorted());
      if (moveSum(before, started) < moveSum(before, fresh)) fewer++;
    }
    expect(fewer).toBe(10);
  });

  it("is a fixed point after one settle: a second pass from its output moves nothing", () => {
    for (let seed = 0; seed < 10; seed++) {
      const input = scattered(500 + seed, 20);
      const random = mulberry32(seed);
      const base = packWith("force", input);
      const shaken: PackOutput = { ...base, placements: base.placements.map((p) => ({ ...p, x: p.x + (random() - 0.5) * 10, y: p.y + (random() - 0.5) * 10 })) };
      const once = fromStart(input, shaken);
      const twice = fromStart(input, once);
      expect(hard(input, once), `seed ${seed}`).toBe(0);
      expect(twice.placements).toEqual(once.placements);
    }
  });

  it("gives no hard break from 30 random starts, and starts from the member output when a start has no room", () => {
    for (let seed = 0; seed < 30; seed++) {
      const input = scattered(600 + seed, 10 + (seed % 3) * 10);
      const random = mulberry32(seed);
      const base = packWith("force", input);
      const start: PackOutput = { ...base, placements: base.placements.map((p) => ({ ...p, x: random() * 100, y: random() * 100 })) };
      const out = fromStart(input, start);
      expect(hard(input, out), `seed ${seed}`).toBe(0);
      expect(out.placements.length).toBe(base.placements.length);
    }
  });
});
