import { describe, expect, it } from "vitest";
import { measure, outputHash, packWith, strategy, type PackInput } from "@mark1russell7/packing";
import { hardBreaks } from "../src/select-key.ts";
import { benchEntry, benchPack, benchStrategy, CONTROL_ENTRIES, FILL_TRICK, KEEP_SHELF, FILL_TRICK_MEMBERS, FILL_TRICK_WIDTHS, fillTrick, fillTrickWidths, isControl } from "./controls.ts";
import { ENTRIES, entry } from "./entries.ts";
import { strategyIds } from "./run.ts";

// The control of `pack.fill` on made-up inputs. The test reads no time.

/** This function gives made-up items: the sizes come from a small fixed sequence, so the input has no seed. */
function items(count: number): PackInput["items"] {
  return Array.from({ length: count }, (_, i) => ({ id: `n${i}`, w: 10 + ((i * 7) % 31), h: 8 + ((i * 13) % 23) }));
}

const FREE: PackInput = { container: { fixed: "none" }, items: items(40) };
const WIDTH: PackInput = { container: { fixed: "width", w: 300 }, items: items(40) };
const HEIGHT: PackInput = { container: { fixed: "height", h: 300 }, items: items(40) };
const SIZE: PackInput = { container: { fixed: "size", w: 400, h: 400 }, items: items(40) };
const TIGHT: PackInput = { container: { fixed: "size", w: 120, h: 120 }, items: items(40) };
const INPUTS: readonly (readonly [string, PackInput])[] = [
  ["a free size", FREE],
  ["a fixed width", WIDTH],
  ["a fixed height", HEIGHT],
  ["a fixed size", SIZE],
  ["a fixed size that is too small", TIGHT],
];

/** This function gives the highest fill of the members on an input, with no tried width. */
function memberFill(input: PackInput, seed = 0): number {
  return Math.max(...FILL_TRICK_MEMBERS.map((m) => measure(input, packWith(m.id, input, m.options, seed))["pack.fill"]));
}

describe("the bench controls", () => {
  it("stays out of the entries, the registry and the value all", () => {
    expect(ENTRIES.map((e) => e.id)).not.toContain(FILL_TRICK);
    expect(() => entry(FILL_TRICK)).toThrow(RangeError);
    expect(() => strategy(FILL_TRICK)).toThrow(RangeError);
    expect(strategyIds("all")).not.toContain(FILL_TRICK);
    expect(strategyIds("")).not.toContain(FILL_TRICK);
  });

  it("is a choice of a run by its id, beside real entries", () => {
    expect(strategyIds(`${FILL_TRICK},skyline`)).toEqual([FILL_TRICK, "skyline"]);
    expect(() => strategyIds("no-such-control")).toThrow(RangeError);
  });

  it("gives a real entry and a real strategy with no change", () => {
    expect(benchEntry("skyline")).toBe(entry("skyline"));
    expect(benchStrategy("skyline")).toBe(strategy("skyline"));
    expect(outputHash(benchPack("skyline", FREE, undefined, 3))).toBe(outputHash(packWith("skyline", FREE, undefined, 3)));
  });

  it("tells a control from an entry", () => {
    expect(CONTROL_ENTRIES.map((e) => e.id)).toEqual([FILL_TRICK, KEEP_SHELF]);
    expect(isControl(FILL_TRICK)).toBe(true);
    expect(isControl("skyline")).toBe(false);
    expect(benchStrategy(FILL_TRICK)).toBe(fillTrick);
    expect(benchEntry(FILL_TRICK).strategy).toBe(FILL_TRICK);
  });

  it("supports only the cells that each member supports", () => {
    for (const [dimension, values] of Object.entries(fillTrick.supports)) {
      for (const m of FILL_TRICK_MEMBERS) expect(strategy(m.id).supports[dimension as keyof typeof fillTrick.supports]).toEqual(expect.arrayContaining(values));
    }
    expect(fillTrick.supports.containerSize).toContain("fixed");
  });
});

describe("the widths of the fill trick", () => {
  it("rises from the widest item to the sum of the widths on a free size", () => {
    const widths = fillTrickWidths(FREE);
    const each = FREE.items.map((i) => i.w);
    expect(widths.length).toBeLessThanOrEqual(FILL_TRICK_WIDTHS);
    expect(widths[0]).toBe(Math.max(...each));
    expect(widths.at(-1)).toBe(each.reduce((a, b) => a + b, 0));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
  });

  it("stops at the width of a fixed width or a fixed size", () => {
    expect(fillTrickWidths(WIDTH).at(-1)).toBe(300);
    expect(fillTrickWidths(SIZE).at(-1)).toBe(400);
  });

  it("counts the margins, the gap and the inset in the widest item", () => {
    const input: PackInput = { container: { fixed: "none", inset: 5 }, gap: 2, items: [{ id: "a", w: 20, h: 5, margin: 3 }, { id: "b", w: 10, h: 5 }] };
    expect(fillTrickWidths(input)[0]).toBe(20 + 6 + 2 + 10);
  });

  it("gives no width when the range is empty", () => {
    expect(fillTrickWidths({ container: { fixed: "none" }, items: [] })).toEqual([]);
    expect(fillTrickWidths({ container: { fixed: "width", w: 5 }, items: [{ id: "a", w: 50, h: 5 }] })).toEqual([]);
  });
});

describe("the fill trick", () => {
  it.each(INPUTS)("has no hard break on %s when a member has none", (_, input) => {
    const out = benchPack(FILL_TRICK, input, undefined, 1);
    const clean = FILL_TRICK_MEMBERS.some((m) => hardBreaks(input, packWith(m.id, input, m.options, 1)) === 0);
    if (clean) expect(hardBreaks(input, out)).toBe(0);
  });

  it.each(INPUTS)("has a fill at or above each clean member on %s", (_, input) => {
    const out = benchPack(FILL_TRICK, input, undefined, 1);
    const clean = FILL_TRICK_MEMBERS.map((m) => packWith(m.id, input, m.options, 1)).filter((o) => hardBreaks(input, o) === 0 && o.overflow.length <= out.overflow.length);
    for (const o of clean) expect(measure(input, out)["pack.fill"]).toBeGreaterThanOrEqual(measure(input, o)["pack.fill"]);
  });

  it.each(INPUTS)("drops no more items than the best member on %s", (_, input) => {
    const out = benchPack(FILL_TRICK, input, undefined, 1);
    const least = Math.min(...FILL_TRICK_MEMBERS.map((m) => packWith(m.id, input, m.options, 1).overflow.length));
    expect(out.overflow.length).toBeLessThanOrEqual(least);
    expect(out.placements.length + out.overflow.length).toBe(input.items.length);
  });

  it.each(INPUTS)("gives the same bytes for the same seed on %s", (_, input) => {
    expect(outputHash(benchPack(FILL_TRICK, input, undefined, 1))).toBe(outputHash(benchPack(FILL_TRICK, input, undefined, 1)));
  });

  it("buys fill on a free size, so the trick works", () => {
    expect(measure(FREE, benchPack(FILL_TRICK, FREE))["pack.fill"]).toBeGreaterThan(memberFill(FREE));
  });

  it("pays for the fill in aspect on a free size", () => {
    const out = benchPack(FILL_TRICK, FREE);
    const best = FILL_TRICK_MEMBERS.map((m) => packWith(m.id, FREE, m.options)).sort((a, b) => measure(FREE, b)["pack.fill"] - measure(FREE, a)["pack.fill"])[0]!;
    expect(measure(FREE, out)["pack.aspectError"]).toBeGreaterThan(measure(FREE, best)["pack.aspectError"]);
  });

  it("keeps a fixed size and a fixed width in the output", () => {
    expect(benchPack(FILL_TRICK, SIZE).size).toEqual({ w: 400, h: 400 });
    expect(benchPack(FILL_TRICK, WIDTH).size.w).toBe(300);
    expect(benchPack(FILL_TRICK, HEIGHT).size.h).toBe(300);
  });

  it("reports a free width from the far edge of the content", () => {
    const out = benchPack(FILL_TRICK, FREE);
    const far = Math.max(...out.placements.map((p) => p.x + FREE.items.find((i) => i.id === p.id)!.w));
    expect(out.size.w).toBe(far);
  });

  it("tries no width in a container with a shape", () => {
    const shape: PackInput = { container: { fixed: "size", w: 200, h: 200, shape: { kind: "rect", x: 0, y: 0, w: 200, h: 200 } }, items: items(10) };
    const out = benchPack(FILL_TRICK, shape);
    expect(measure(shape, out)["pack.fill"]).toBe(memberFill(shape));
  });

  it("gives the first member when each output has a hard break", () => {
    const wide: PackInput = { container: { fixed: "size", w: 10, h: 10 }, items: [{ id: "a", w: 50, h: 50 }] };
    const out = benchPack(FILL_TRICK, wide);
    const first = packWith(FILL_TRICK_MEMBERS[0]!.id, wide, FILL_TRICK_MEMBERS[0]!.options);
    expect(outputHash(out)).toBe(outputHash(first));
  });
});
