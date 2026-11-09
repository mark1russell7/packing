import { configId } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { configOfStrategy, graphOrder, outputHash, packConfig, packSpace, packWith, type StrategyConfig } from "./index.ts";
import type { Item, PackInput } from "./contract.ts";
import { buildFrame, frameLinks, rectsOf } from "./frame.ts";
import { memberOrder } from "./restarts.ts";
import { linksOfItems } from "./ruin-recreate.ts";

// The order graph-bfs in `packSpace` (layout-stack L34). All inputs are made up.

/** The entries of the joint benchmark with a graph order: the strategy and the options of each. */
const ENTRIES = [
  { id: "rows-graph-bfs", strategy: "rows", options: { sortOrder: "graph-bfs" } },
  { id: "maxrects-bl-graph-bfs", strategy: "maxrects", options: { rule: "bl", sortOrder: "graph-bfs" } },
] as const;

/** This function gives 16 made-up items of two sizes, with some ranks. */
function items(): Item[] {
  return Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, w: 8 + ((i * 7) % 13), h: 6 + ((i * 5) % 11), ...(i % 5 === 0 ? { rank: 16 - i } : {}) }));
}

/** The made-up links: one hub, a chain, and a second component. */
const LINKS = [
  { a: 3, b: 0, weight: 2 },
  { a: 3, b: 1 },
  { a: 3, b: 2 },
  { a: 3, b: 4 },
  { a: 4, b: 5 },
  { a: 5, b: 6, weight: 3 },
  { a: 9, b: 10 },
  { a: 10, b: 11 },
];

/** This function gives a made-up input with links for each kind of container. */
function inputs(): PackInput[] {
  const base = { items: items(), links: LINKS, gap: 1 };
  return [
    { ...base, container: { w: 64, fixed: "width" } },
    { ...base, container: { h: 64, fixed: "height" } },
    { ...base, container: { w: 80, h: 80, fixed: "size" } },
    { ...base, container: { fixed: "none" } },
    { ...base, container: { w: 80, h: 80, fixed: "size" }, obstacles: [{ id: "o", region: { kind: "rect", x: 20, y: 20, w: 16, h: 16 } }] },
  ] as PackInput[];
}

/** This function gives the config of a strategy with its options, or fails the test. */
function pointOf(strategy: string, options: Readonly<Record<string, unknown>>): StrategyConfig {
  const point = configOfStrategy(strategy, options);
  if (!point.ok) throw new Error(point.reason);
  return point.config;
}

describe("the order graph-bfs of packSpace", () => {
  it("is the last option of the stage order, for rect items", () => {
    const order = packSpace.stages.find((s) => s.name === "order")!;
    expect(order.options.map((o) => o.id)).toEqual(["height-desc", "height-asc", "width-desc", "area-desc", "perimeter-desc", "long-side-desc", "short-side-desc", "side-diff-desc", "ratio-desc", "diagonal-desc", "input", "graph-bfs"]);
    expect(order.options.at(-1)!.supports).toEqual({ shape: ["rect"] });
  });

  for (const entry of ENTRIES) {
    it(`gives ${entry.id} a point with the output hash of packWith`, () => {
      const config = pointOf(entry.strategy, entry.options);
      expect(config.stages["order"]!.option).toBe("graph-bfs");
      for (const input of inputs()) {
        const want = outputHash(packWith(entry.strategy, input, entry.options, 3));
        expect(outputHash(packConfig(input, config, 3)), input.container.fixed).toBe(want);
      }
    });
  }

  it("gives each point another id than the same config with area-desc", () => {
    for (const entry of ENTRIES) {
      const id = configId(packSpace, pointOf(entry.strategy, entry.options));
      expect(id).not.toBe(configId(packSpace, pointOf(entry.strategy, { ...entry.options, sortOrder: "area-desc" })));
    }
  });

  it("reads the links: the output with links differs from the output without links, and without links the order is area-desc", () => {
    const [input] = inputs() as [PackInput];
    const { links: _links, ...plain } = input;
    for (const entry of ENTRIES) {
      const config = pointOf(entry.strategy, entry.options);
      expect(outputHash(packConfig(input, config))).not.toBe(outputHash(packConfig(plain, config)));
      expect(outputHash(packConfig(plain, config))).toBe(outputHash(packWith(entry.strategy, plain, { ...entry.options, sortOrder: "area-desc" })));
    }
  });

  it("has no point for push, because push does not read the links", () => {
    const point = configOfStrategy("push", { sortOrder: "graph-bfs" });
    expect(point.ok).toBe(false);
    expect(point.ok ? "" : point.reason).toContain("not a point of packSpace");
  });

  it("has a point for each other strategy with an order", () => {
    for (const strategy of ["skyline", "shelf", "guillotine"]) expect(configOfStrategy(strategy, { sortOrder: "graph-bfs" }).ok, strategy).toBe(true);
    expect(configOfStrategy("hole-degree", { sortOrder: "graph-bfs" }).ok).toBe(false);
  });
});

describe("a member with the order graph-bfs in a meta strategy", () => {
  const input: PackInput = { items: items(), links: LINKS, container: { w: 64, fixed: "width" } };
  const member = { id: "rows-graph-bfs", strategy: "rows", options: { sortOrder: "graph-bfs" } };

  it("memberOrder gives the graph order of the frame, in the rank order of the items", () => {
    const frame = buildFrame(input);
    const want = graphOrder(rectsOf(frame), frameLinks(input, frame)).map((i) => frame.entries[i]!.item!.id);
    expect(memberOrder(input, "graph-bfs").map((k) => k.item.id)).toEqual(want);
  });

  it("memberOrder without links gives the order area-desc", () => {
    const { links: _links, ...plain } = input;
    expect(memberOrder(plain, "graph-bfs").map((k) => k.item.id)).toEqual(memberOrder(plain, "area-desc").map((k) => k.item.id));
  });

  it("memberOrder refuses a link with a bad index", () => {
    expect(() => memberOrder({ ...input, links: [{ a: 0, b: 99 }] }, "graph-bfs")).toThrow(RangeError);
  });

  it("gives restarts and ruin-recreate the same output for the same seed, with the links in the output", () => {
    const { links: _links, ...plain } = input;
    for (const strategy of ["restarts", "ruin-recreate"]) {
      const run = (x: PackInput): string => outputHash(packWith(strategy, x, { member, iterations: 8 }, 3));
      expect(run(input), strategy).toBe(run(input));
      expect(run(input), strategy).not.toBe(run(plain));
    }
  });

  it("linksOfItems moves the links to the new indexes of the items, and keeps the weights", () => {
    const list = input.items.toReversed();
    expect(linksOfItems(input, list)!.slice(0, 2)).toEqual([{ a: 12, b: 15, weight: 2 }, { a: 12, b: 14 }]);
    const { links: _links, ...plain } = input;
    expect(linksOfItems(plain, list)).toBeUndefined();
  });

  it("gives ruin-recreate the same output with and without links for a member with a sort order", () => {
    const areaMember = { ...member, id: "rows-area", options: { sortOrder: "area-desc" } };
    const { links: _links, ...plain } = input;
    const run = (x: PackInput): string => outputHash(packWith("ruin-recreate", x, { member: areaMember, iterations: 8 }, 3));
    expect(run(input)).toBe(run(plain));
  });
});
