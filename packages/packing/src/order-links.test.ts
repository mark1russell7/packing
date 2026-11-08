import { describe, expect, it } from "vitest";
import type { PackInput } from "./contract.ts";
import { buildFrame, frameLinks, transposeInput, transposeOutput } from "./frame.ts";
import { packWith } from "./registry.ts";

/** A made-up input of 4 items in a row container. The ranks put the item `b` first in the frame. */
const INPUT: PackInput = {
  container: { w: 100, fixed: "width" },
  items: [
    { id: "a", w: 10, h: 10, rank: 1 },
    { id: "b", w: 20, h: 20, rank: 0 },
    { id: "c", w: 30, h: 30, rank: 2 },
    { id: "d", w: 200, h: 5, rank: 3 },
  ],
};

/** This function gives the ids of the placements of an output, from left to right. */
function idsByX(input: PackInput, options: object): string[] {
  return packWith("rows", input, options).placements.toSorted((p, q) => p.x - q.x).map((p) => p.id);
}

describe("frameLinks", () => {
  it("maps the links of the input to the rectangles of the frame, and drops a link to an item that is too large", () => {
    const input: PackInput = { ...INPUT, links: [{ a: 0, b: 2, weight: 2 }, { a: 1, b: 3 }] };
    const frame = buildFrame(input);
    expect(frame.entries.map((e) => e.item?.id)).toEqual(["b", "a", "c"]);
    expect(frameLinks(input, frame)).toEqual([{ a: 1, b: 2, weight: 2 }]);
    expect(frameLinks(INPUT, buildFrame(INPUT))).toBeUndefined();
  });

  it("refuses a link with an index outside the items", () => {
    const input: PackInput = { ...INPUT, links: [{ a: 0, b: 4 }] };
    expect(() => frameLinks(input, buildFrame(input))).toThrow(RangeError);
  });
});

describe("the graph order of the layout strategies", () => {
  const items = INPUT.items.slice(0, 3);

  it("puts the hub of the links first, and gives area-desc without links", () => {
    const linked: PackInput = { ...INPUT, items, links: [{ a: 0, b: 1 }, { a: 0, b: 2 }] };
    expect(idsByX(linked, { sortOrder: "graph-bfs" })).toEqual(["a", "c", "b"]);
    expect(idsByX({ ...INPUT, items }, { sortOrder: "graph-bfs" })).toEqual(idsByX({ ...INPUT, items }, { sortOrder: "area-desc" }));
  });

  it("gives the same output for a sort order with and without links", () => {
    const linked: PackInput = { ...INPUT, items, links: [{ a: 0, b: 1 }] };
    const plain = packWith("rows", { ...INPUT, items });
    const withLinks = packWith("rows", linked);
    expect(withLinks.placements).toEqual(plain.placements);
  });
});

/** The keys of `PackInput`. The type check below fails when `PackInput` gets a key that this list does not have. */
const PACK_INPUT_KEYS = ["container", "items", "obstacles", "gap", "pairGaps", "links"] as const satisfies readonly (keyof PackInput)[];
const keysCovered: Exclude<keyof PackInput, (typeof PACK_INPUT_KEYS)[number]> extends never ? true : false = true;

describe("transposeInput", () => {
  it("keeps each key of PackInput", () => {
    expect(keysCovered).toBe(true);
    const full: PackInput = {
      container: { h: 100, fixed: "height" },
      items: [
        { id: "a", w: 10, h: 20 },
        { id: "b", w: 30, h: 40 },
      ],
      obstacles: [{ id: "o", region: { kind: "rect", x: 50, y: 0, w: 5, h: 5 } }],
      gap: 2,
      pairGaps: [{ a: "a", b: "b", gap: 4 }],
      links: [{ a: 0, b: 1, weight: 3 }],
    };
    const turned = transposeInput(full);
    expect(Object.keys(turned).toSorted()).toEqual([...PACK_INPUT_KEYS].toSorted());
    expect(turned.links).toEqual(full.links);
  });

  it("packs a fixed height with links as its fixed-width twin with links", () => {
    // Items 0 to 2 by link: item 0 is the hub. The order graph-bfs puts it first, and area-desc puts item 2 first.
    const tall: PackInput = {
      container: { h: 100, fixed: "height" },
      items: [
        { id: "a", w: 10, h: 10 },
        { id: "b", w: 20, h: 20 },
        { id: "c", w: 30, h: 30 },
      ],
      links: [{ a: 0, b: 1 }, { a: 0, b: 2 }],
    };
    const wide: PackInput = { ...transposeInput(tall), links: tall.links! };
    const options = { sortOrder: "graph-bfs" };
    const viaTwin = transposeOutput(packWith("rows", wide, options)).placements;
    expect(packWith("rows", tall, options).placements).toEqual(viaTwin);
    // The links change the order, so the test reads them.
    const { links: _links, ...plain } = tall;
    expect(packWith("rows", plain, options).placements).not.toEqual(viaTwin);
  });
});
