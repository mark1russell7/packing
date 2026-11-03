import { describe, expect, it } from "vitest";
import type { PackInput } from "./contract.ts";
import { buildFrame, frameLinks } from "./frame.ts";
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
