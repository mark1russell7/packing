import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cellOf, checkHard, mulberry32, packWith, strategies, supportsCell, UnsupportedCell, type PackInput } from "@mark1russell7/packing";

// The shared generator `rect-scattered` (version 1) of docs/FORMAT.md, written as that document gives it.

/** fnv1a32 of the UTF-8 bytes of a string */
const fnv1a32 = (str: string): number => {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
};

/** A whole number from lo to hi, both included */
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** A number of a file: rounded to 3 decimals, a half up, and -0 as 0 */
const round3 = (x: number): number => {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};

/** The canonical form: sorted keys, no whitespace, the numbers of JSON.stringify */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(typeof value === "number" ? round3(value) : value);
};

interface Box {
  id: string;
  w: number;
  h: number;
}

/** The file of the generator rect-scattered v1 for a seed, with its hash */
function rectScattered(seed: number, count = 40): Record<string, unknown> & { hash: string; container: { w: number; h: number; fixed: "size" }; obstacles: { id: string; region: { kind: "rect"; x: number; y: number; w: number; h: number } }[]; boxes: Box[] } {
  const step = (name: string) => mulberry32(fnv1a32(`${seed}:${name}`));

  let r = step("container");
  const w = int(r, 600, 1000);
  const h = int(r, 400, 800);
  const container = { w, h, fixed: "size" as const };

  r = step("obstacles");
  const n = int(r, 3, 8);
  const obstacles = [];
  for (let i = 0; i < n; i++) {
    const ow = int(r, 40, 160);
    const oh = int(r, 40, 160);
    const x = int(r, 0, w - ow);
    const y = int(r, 0, h - oh);
    obstacles.push({ id: `o${i}`, region: { kind: "rect" as const, x, y, w: ow, h: oh } });
  }

  r = step("boxes");
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const bw = int(r, 20, 120);
    const bh = int(r, 20, 80);
    boxes.push({ id: `b${i}`, w: bw, h: bh });
  }

  const file = {
    schema: "layout-input/1",
    id: `xcheck-v1/rect-scattered/s${seed}`,
    set: "xcheck-v1",
    family: "rect-scattered",
    seed,
    source: "made-up",
    generator: { name: "rect-scattered", version: 1, params: { count }, seed },
    container,
    obstacles,
    boxes,
    edges: [],
  };
  const hash = createHash("sha256").update(canonical(file)).digest("hex").slice(0, 16);
  return { ...file, hash };
}

/** The packing input of a file: the boxes are the items, and the edges go. */
const toInput = (file: ReturnType<typeof rectScattered>): PackInput => ({ container: file.container, items: file.boxes, obstacles: file.obstacles });

const EXPECTED = [
  { seed: 1, w: 970, h: 705, obstacles: 4, first: { x: 690, y: 281, w: 111, h: 100 }, box: [70, 66], hash: "f5f5c51d1560e41c" },
  { seed: 2, w: 733, h: 437, obstacles: 7, first: { x: 292, y: 7, w: 138, h: 121 }, box: [114, 77], hash: "cfd6ef0ef232aaa3" },
  { seed: 3, w: 871, h: 554, obstacles: 8, first: { x: 551, y: 56, w: 59, h: 138 }, box: [78, 39], hash: "d1638f2406360b2e" },
];

describe("the shared generator rect-scattered v1", () => {
  it("has the check value of fnv1a32", () => {
    expect(fnv1a32("1:container")).toBe(3139901265);
  });

  it.each(EXPECTED)("gives the expected file for seed $seed", (e) => {
    const file = rectScattered(e.seed);
    expect([file.container.w, file.container.h]).toEqual([e.w, e.h]);
    expect(file.obstacles.length).toBe(e.obstacles);
    expect(file.obstacles[0]!.region).toEqual({ kind: "rect", ...e.first });
    expect([file.boxes[0]!.w, file.boxes[0]!.h]).toEqual(e.box);
    expect(file.hash).toBe(e.hash);
  });

  it.each(EXPECTED)("is packed with 0 hard breaks by each strategy that supports its cell (seed $seed)", (e) => {
    const input = toInput(rectScattered(e.seed));
    const cell = cellOf(input);
    let packed = 0;
    for (const s of strategies) {
      if (!supportsCell(s.supports, cell)) {
        expect(() => packWith(s.id, input), s.id).toThrow(UnsupportedCell);
        continue;
      }
      const output = packWith(s.id, input, undefined, e.seed);
      expect(checkHard(input, output), s.id).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      expect(output.placements.length, s.id).toBeGreaterThan(0);
      packed++;
    }
    expect(packed).toBe(3);
  });
});
