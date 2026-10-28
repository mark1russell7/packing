import { createFamilyRegistry, familyKind } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import {
  cellOf,
  checkHard,
  corpusFamilies,
  rectScattered,
  edgeCases,
  gallery,
  generator,
  generators,
  packWith,
  rectGrid,
  rectGridV2,
  strategies,
  supportsCell,
  toPackInput,
  type CorpusGenerator,
  type GeneratorParams,
  type GeneratedInput,
  type ObstacleLayout,
  type SizeDistribution,
  type Region,
} from "@mark1russell7/packing";

// The seeded generators of the corpus. Each case is one value of one parameter over the defaults of a generator.

interface Case {
  gen: CorpusGenerator;
  params: GeneratorParams;
}

const COUNTS = [1, 10, 100, 1000, 10000];

/** For each generator, the defaults, each value of each parameter with a list, and each count scale */
const CASES: Case[] = (() => {
  const cases: Case[] = [];
  const seen = new Set<string>();
  const add = (gen: CorpusGenerator, params: GeneratorParams): void => {
    const key = `${gen.name}:${JSON.stringify(gen.withDefaults(params))}`;
    if (seen.has(key)) return;
    seen.add(key);
    cases.push({ gen, params });
  };
  for (const gen of generators) {
    if (gen === rectGridV2) continue;
    add(gen, {});
    for (const [key, values] of Object.entries(gen.values)) for (const value of values ?? []) add(gen, { [key]: value });
    if (gen.name === "rect-grid") for (const count of COUNTS) add(gen, { count });
  }
  // Version 2 of rect-grid: the defaults, the order soft, and the order soft in each free size and each shape
  add(rectGridV2, {});
  add(rectGridV2, { order: "soft" });
  for (const containerSize of ["freeAspect", "freeArea"]) add(rectGridV2, { containerSize, order: "soft", sizes: "identical", count: 10 });
  for (const containerShape of rectGridV2.values.containerShape!) add(rectGridV2, { containerShape, containerSize: "freeAspect", order: "soft", count: 10 });
  return cases;
})();

const label = (c: Case): string => `${c.gen.name} ${JSON.stringify(c.params)}`;

/** The pinned hash of seed 1 of each case, by its id. A change of a pinned hash needs a new version of the generator. */
const HASHES: Record<string, string> = {
  "xcheck-v1/rect-scattered/s1": "f5f5c51d1560e41c",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.n100/s1": "c3febeb6de9da34f",
  "corpus-v1/rect-grid.freeHeight.rect.none.uniform.n100/s1": "69c303d7038b609f",
  "corpus-v1/rect-grid.freeWidth.rect.none.uniform.n100/s1": "9093137f4cdeaf9e",
  "corpus-v1/rect-grid.freeAspect.rect.none.uniform.n100/s1": "cfd884b1c281895c",
  "corpus-v1/rect-grid.freeArea.rect.none.uniform.n100/s1": "1ce3308d96122de8",
  "corpus-v1/rect-grid.fixed.convex.none.uniform.n100/s1": "e6665e204dcb37e5",
  "corpus-v1/rect-grid.fixed.polygon.none.uniform.n100/s1": "b15738408e392232",
  "corpus-v1/rect-grid.fixed.circle.none.uniform.n100/s1": "04f0fa4fc0a188e7",
  "corpus-v1/rect-grid.fixed.ellipse.none.uniform.n100/s1": "fcf14d439064c661",
  "corpus-v1/rect-grid.fixed.holes.none.uniform.n100/s1": "94d8ca77eea1e866",
  "corpus-v1/rect-grid.fixed.rect.center.uniform.n100/s1": "aa1296d66d645fa1",
  "corpus-v1/rect-grid.fixed.rect.scattered.uniform.n100/s1": "1ab57e6fabf5baad",
  "corpus-v1/rect-grid.fixed.rect.wall.uniform.n100/s1": "da18b9c3086f356e",
  "corpus-v1/rect-grid.fixed.rect.corridors.uniform.n100/s1": "e5649ddbc3ca12a1",
  "corpus-v1/rect-grid.fixed.rect.touching.uniform.n100/s1": "6b78bb39d4794c56",
  "corpus-v1/rect-grid.fixed.rect.edge.uniform.n100/s1": "fc535d0b2b99617a",
  "corpus-v1/rect-grid.fixed.rect.none.identical.n100/s1": "a7876e76fe4c0f3e",
  "corpus-v1/rect-grid.fixed.rect.none.nearIdentical.n100/s1": "228aa51b2124f246",
  "corpus-v1/rect-grid.fixed.rect.none.heavyTail.n100/s1": "e66c3f6cc4f5e587",
  "corpus-v1/rect-grid.fixed.rect.none.bimodal.n100/s1": "d62d37c1b133cc8b",
  "corpus-v1/rect-grid.fixed.rect.none.extremeAspect.n100/s1": "3fa4976ef8d4094a",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.n1/s1": "eb81c10ce6fea027",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.n10/s1": "05eaf2b42b3c4a55",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.n1000/s1": "35862804e41dcdfd",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.n10000/s1": "8476447ff09edd7b",
  "corpus-v1/gallery.freeHeight.n100/s1": "fe5fa1e3758e1de0",
  "corpus-v1/gallery.fixed.n100/s1": "8cb3a3246d4971c0",
  "corpus-v1/gallery.freeWidth.n100/s1": "8d3c26395647b914",
  "corpus-v1/gallery.freeAspect.n100/s1": "001d7a903fe3aff9",
  "corpus-v1/gallery.freeArea.n100/s1": "0dce12928f4f9530",
  "corpus-v1/dashboard.freeHeight.n10/s1": "8c2882942dc134c2",
  "corpus-v1/dashboard.fixed.n10/s1": "5c1b92af185e3291",
  "corpus-v1/dashboard.freeWidth.n10/s1": "716486bf5f548063",
  "corpus-v1/dashboard.freeAspect.n10/s1": "9ea03eb429ea6b84",
  "corpus-v1/dashboard.freeArea.n10/s1": "be4c0b7a034804cf",
  "corpus-v1/cards.freeHeight.n100/s1": "e349934793da7c5c",
  "corpus-v1/cards.fixed.n100/s1": "84fe81bb3b4cced0",
  "corpus-v1/cards.freeWidth.n100/s1": "430e5b39b388dacf",
  "corpus-v1/cards.freeAspect.n100/s1": "2556586b881f7af0",
  "corpus-v1/cards.freeArea.n100/s1": "47221db0dc5cf56a",
  "corpus-v1/word-cloud.freeHeight.n100/s1": "6137bea063381f5e",
  "corpus-v1/word-cloud.fixed.n100/s1": "61fc6d8975c72ce8",
  "corpus-v1/word-cloud.freeWidth.n100/s1": "f9930445aaa08527",
  "corpus-v1/word-cloud.freeAspect.n100/s1": "623093f7e232fceb",
  "corpus-v1/word-cloud.freeArea.n100/s1": "a0f6ccaf08951b74",
  "corpus-v1/edge-cases.oversize.n12/s1": "aa1c0c9e3ca3ac2b",
  "corpus-v1/edge-cases.empty/s1": "50c01abae6cf463f",
  "corpus-v1/edge-cases.one/s1": "b3844af7d6f07ed3",
  "corpus-v1/edge-cases.exactTiling.n12/s1": "4e46948ad0f96d4a",
  "corpus-v1/edge-cases.touchObstacles.n12/s1": "49f37977c6c61726",
  // rect-grid version 2
  "corpus-v1/rect-grid.fixed.rect.none.uniform.free.n100/s1": "4914dc1654c9f226",
  "corpus-v1/rect-grid.fixed.rect.none.uniform.soft.n100/s1": "d1b91a6e10fee29a",
  "corpus-v1/rect-grid.freeAspect.rect.none.identical.soft.n10/s1": "1d67684f2432f63e",
  "corpus-v1/rect-grid.freeArea.rect.none.identical.soft.n10/s1": "ca0200e408e210ef",
  "corpus-v1/rect-grid.freeAspect.rect.none.uniform.soft.n10/s1": "60987fc67c0635a6",
  "corpus-v1/rect-grid.freeAspect.convex.none.uniform.soft.n10/s1": "ad08c24aae038fc5",
  "corpus-v1/rect-grid.freeAspect.polygon.none.uniform.soft.n10/s1": "9b04073c247134a7",
  "corpus-v1/rect-grid.freeAspect.circle.none.uniform.soft.n10/s1": "eed2b98e0eb0ab59",
  "corpus-v1/rect-grid.freeAspect.ellipse.none.uniform.soft.n10/s1": "9bd7fb68895a202a",
  "corpus-v1/rect-grid.freeAspect.holes.none.uniform.soft.n10/s1": "81cd15b4065164b9",
  "known-v1/perfect-cut.guillotine.fixed.n30/s1": "50ea0e3fa3baa3ed",
  "known-v1/perfect-cut.free.fixed.n30/s1": "c15601dc91a6a5e9",
  "known-v1/perfect-cut.guillotine.freeHeight.n30/s1": "766e2be303a3d6cf",
  "known-v1/perfect-cut.guillotine.freeArea.n30/s1": "65ae42fea426e75a",
  "known-v1/consecutive-squares.freeHeight.n30/s1": "8167ebe5640cfeee",
  "known-v1/consecutive-squares.freeArea.n30/s1": "192d49ab7bceb945",
};

/** The bounds of the nominal container of a file: the bounding box of its shape, or the rectangle w by h */
function bounds(file: GeneratedInput): { x: number; y: number; w: number; h: number } {
  const s = file.container.shape;
  if (s === undefined) return { x: 0, y: 0, w: file.container.w ?? Infinity, h: file.container.h ?? Infinity };
  switch (s.kind) {
    case "rect":
      return s;
    case "circle":
      return { x: s.cx - s.r, y: s.cy - s.r, w: 2 * s.r, h: 2 * s.r };
    case "ellipse":
      return { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry };
    case "polygon": {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
  }
}

/** This function tells if a point is in a region (the outer ring of a polygon). */
function inRegion(region: Region, x: number, y: number): boolean {
  switch (region.kind) {
    case "rect":
      return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
    case "circle":
      return (x - region.cx) ** 2 + (y - region.cy) ** 2 <= region.r ** 2;
    case "ellipse":
      return ((x - region.cx) / region.rx) ** 2 + ((y - region.cy) / region.ry) ** 2 <= 1;
    case "polygon": {
      let inside = false;
      const ps = region.points;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
        const [xi, yi] = ps[i]!;
        const [xj, yj] = ps[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
  }
}

type R = { x: number; y: number; w: number; h: number };
const rectOf = (region: Region): R => {
  if (region.kind !== "rect") throw new Error("not a rectangle");
  return region;
};
const overlaps = (a: R, b: R): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
/** The length of the common part of a side of a and a side of b, when they touch and do not overlap */
const contact = (a: R, b: R): number => {
  if (overlaps(a, b)) return 0;
  const xs = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ys = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (a.x + a.w === b.x || b.x + b.w === a.x) return Math.max(ys, 0);
  if (a.y + a.h === b.y || b.y + b.h === a.y) return Math.max(xs, 0);
  return 0;
};

/** The obstacles of a file with a fixed container that are not fully in the shape, or that have no area */
function outside(file: GeneratedInput): string[] {
  const shape: Region = file.container.shape ?? { kind: "rect", ...bounds(file) };
  const bad: string[] = [];
  for (const o of file.obstacles ?? []) {
    const r = rectOf(o.region);
    if (!(r.w > 0 && r.h > 0)) bad.push(`${o.id} has no area`);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] as const) {
      // A corner moved a little to the center: on the border of the shape it is in the shape
      if (!inRegion(shape, x + (cx - x) * 1e-6, y + (cy - y) * 1e-6)) bad.push(`${o.id} at ${x}, ${y}`);
    }
  }
  return bad;
}

describe("the generators", () => {
  it("are found by name", () => {
    for (const gen of generators) expect(generator(gen.name, gen.version)).toBe(gen);
    // Without a version, the name gives the first version
    for (const gen of generators.filter((g) => g !== rectGridV2)) expect(generator(gen.name)).toBe(gen);
    expect(generator("rect-grid")).toBe(rectGrid);
    expect(() => generator("nope")).toThrow(RangeError);
    expect(() => generator("rect-grid", 3)).toThrow(RangeError);
  });

  it("give rect-grid version 2 the ranks of a permutation for the order soft, and no rank for the order free", () => {
    for (const seed of [1, 2, 3]) {
      const soft = rectGridV2.generate(seed, { order: "soft", count: 40 });
      expect(soft.boxes.map((b) => b.rank).toSorted((a, b) => a! - b!)).toEqual(soft.boxes.map((_, i) => i));
      // The ranks are not the order of the boxes
      expect(soft.boxes.some((b, i) => b.rank !== i)).toBe(true);
      const free = rectGridV2.generate(seed, { count: 40 });
      expect(free.boxes.every((b) => b.rank === undefined)).toBe(true);
      // Without ranks, the boxes, the container and the obstacles are those of version 1
      const v1 = rectGrid.generate(seed, { count: 40 });
      expect([free.boxes, free.container, free.obstacles]).toEqual([v1.boxes, v1.container, v1.obstacles]);
      expect(soft.boxes.map(({ rank: _rank, ...b }) => b)).toEqual(v1.boxes);
    }
  });

  it.each(CASES.map((c) => [label(c), c] as const))("give the same bytes for the same seed: %s", (_, c) => {
    const a = c.gen.generate(1, c.params);
    const b = c.gen.generate(1, c.params);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (c.params["case"] !== "empty") expect(c.gen.generate(2, c.params).hash).not.toBe(a.hash);
  });

  it.each(CASES.map((c) => [label(c), c] as const))("give the pinned hash for seed 1: %s", (_, c) => {
    const file = c.gen.generate(1, c.params);
    expect(file.hash, file.id).toBe(HASHES[file.id]);
  });

  it.each(CASES.map((c) => [label(c), c] as const))("give a cell that agrees with cellOf: %s", (_, c) => {
    const file = c.gen.generate(1, c.params);
    const cell = c.gen.cell(c.params);
    expect(cell).toMatchObject(cellOf(toPackInput(file)));
    expect(Object.hasOwn(cell, "obstacleMove")).toBe(Object.hasOwn(cellOf(toPackInput(file)), "obstacleMove"));
  });

  it.each(CASES.map((c) => [label(c), c] as const))("give a sound file: %s", (_, c) => {
    const file = c.gen.generate(1, c.params);
    const params = c.gen.withDefaults(c.params);
    expect(file.schema).toBe("layout-input/1");
    // Only an input with a known best value has the source known-best
    expect(file.source).toBe(file.known === undefined ? "made-up" : `known-best:${c.gen.name}`);
    expect(file.generator).toEqual({ name: c.gen.name, version: c.gen.version, params, seed: 1 });
    expect(file.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(file.edges).toEqual([]);

    // The count is exact, and each box has a positive size and its own id
    const expected = params["case"] === "empty" ? 0 : params["case"] === "one" ? 1 : params["count"];
    expect(file.boxes.length).toBe(expected);
    expect(new Set(file.boxes.map((b) => b.id)).size).toBe(file.boxes.length);
    for (const b of file.boxes) expect(b.w > 0 && b.h > 0, b.id).toBe(true);

    // Each number has 3 decimals or fewer
    for (const b of file.boxes) for (const v of [b.w, b.h]) expect(Math.round(v * 1000) / 1000).toBe(v);

    // Each obstacle is in the container. A free container has the obstacles of its fixed twin.
    const hasFixed = (c.gen.values as Record<string, readonly unknown[] | undefined>)["containerSize"]?.includes("fixed") === true;
    const fixed = "containerSize" in params && hasFixed ? c.gen.generate(1, { ...c.params, containerSize: "fixed" }) : file;
    expect(file.obstacles).toEqual(fixed.obstacles);
    const box = bounds(fixed);
    expect(outside(fixed)).toEqual([]);

    // A box that is not oversize fits in the container
    if (params["case"] !== "oversize" && file.container.fixed === "size") {
      for (const b of file.boxes) expect(b.w <= box.w && b.h <= box.h, b.id).toBe(true);
    }
  });
});

describe("rect-grid", () => {
  const obstaclesOf = (layout: ObstacleLayout, seed: number): R[] => (rectGrid.generate(seed, { obstacles: layout }).obstacles ?? []).map((o) => rectOf(o.region));

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("makes touching obstacles that touch the obstacle before them (seed %i)", (seed) => {
    const rects = obstaclesOf("touching", seed);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rects.length; i++) expect(contact(rects[i - 1]!, rects[i]!), `o${i}`).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("makes edge obstacles that touch the border (seed %i)", (seed) => {
    const file = rectGrid.generate(seed, { obstacles: "edge" });
    const { w, h } = file.container as { w: number; h: number };
    for (const r of obstaclesOf("edge", seed)) expect(r.x === 0 || r.y === 0 || r.x + r.w === w || r.y + r.h === h).toBe(true);
  });

  it.each([1, 2, 3])("makes the obstacles of corridors with no overlap, and one obstacle for center and wall (seed %i)", (seed) => {
    const rects = obstaclesOf("corridors", seed);
    expect(rects.length).toBeGreaterThanOrEqual(4);
    for (const [i, a] of rects.entries()) for (const b of rects.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    expect(obstaclesOf("center", seed)).toHaveLength(1);
    expect(obstaclesOf("wall", seed)).toHaveLength(1);
    expect(obstaclesOf("none", seed)).toHaveLength(0);
  });

  it.each(["rect", "convex", "polygon", "circle", "ellipse", "holes"] as const)("keeps each obstacle layout in the shape for 30 seeds (%s)", (containerShape) => {
    for (const obstacles of rectGrid.values.obstacles!) {
      for (let seed = 1; seed <= 30; seed++) {
        const file = rectGrid.generate(seed, { containerShape, obstacles, count: 1 });
        expect(outside(file), `${obstacles} s${seed}`).toEqual([]);
      }
    }
  });

  it("gives the same obstacles for each size distribution and count of a seed", () => {
    const base = rectGrid.generate(4, { obstacles: "scattered" }).obstacles;
    expect(rectGrid.generate(4, { obstacles: "scattered", sizes: "heavyTail", count: 10 }).obstacles).toEqual(base);
  });

  it("makes the size distributions of the taxonomy", () => {
    const sizes = (s: SizeDistribution) => rectGrid.generate(1, { sizes: s }).boxes;
    const identical = sizes("identical");
    expect(new Set(identical.map((b) => `${b.w}x${b.h}`)).size).toBe(1);
    const near = sizes("nearIdentical");
    const w0 = near[0]!.w;
    expect(new Set(near.map((b) => b.w)).size).toBeGreaterThan(1);
    for (const b of near) expect(Math.abs(b.w / w0 - 1)).toBeLessThan(0.07);
    for (const b of sizes("extremeAspect")) expect(Math.max(b.w / b.h, b.h / b.w)).toBeGreaterThan(5);
    const areas = sizes("heavyTail")
      .map((b) => b.w * b.h)
      .sort((a, b) => a - b);
    expect(areas.at(-1)! / areas[areas.length >> 1]!).toBeGreaterThan(10);
    const bimodal = sizes("bimodal").map((b) => Math.sqrt(b.w * b.h));
    const mid = (Math.min(...bimodal) + Math.max(...bimodal)) / 2;
    expect(bimodal.filter((s) => s < mid).length).toBeGreaterThan(50);
    expect(bimodal.filter((s) => s > mid).length).toBeGreaterThan(5);
  });

  it.each(["identical", "nearIdentical", "uniform", "heavyTail", "bimodal", "extremeAspect"] as const)("makes 10 000 boxes fast (%s)", (sizes) => {
    const start = performance.now();
    const file = rectGrid.generate(1, { sizes, count: 10_000, obstacles: "scattered" });
    expect(performance.now() - start).toBeLessThan(500);
    expect(file.boxes).toHaveLength(10_000);
  });

  it.each(["none", "center", "scattered", "wall", "corridors", "touching", "edge"] as const)(
    "is packed with 0 hard breaks by each strategy that supports its cell (obstacles %s)",
    (obstacles) => {
      const input = toPackInput(rectGrid.generate(1, { obstacles, count: 40 }));
      for (const s of strategies) {
        if (!supportsCell(s.supports, cellOf(input))) continue;
        const output = packWith(s.id, input, undefined, 1);
        expect(checkHard(input, output), s.id).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
      }
    },
  );

  it("refuses a bad parameter and a bad seed", () => {
    expect(() => rectGrid.generate(1, { sizes: "round" } as never)).toThrow(RangeError);
    expect(() => rectGrid.generate(1, { colour: "red" } as never)).toThrow(RangeError);
    expect(() => rectGrid.generate(1, { count: 1.5 })).toThrow(RangeError);
    expect(() => rectGrid.generate(1, { count: -1 })).toThrow(RangeError);
    expect(() => rectGrid.generate(-1)).toThrow(RangeError);
  });
});

describe("the families of a user interface", () => {
  it("makes thumbnails of a gallery with one size", () => {
    const boxes = gallery.generate(1).boxes;
    expect(new Set(boxes.map((b) => `${b.w}x${b.h}`)).size).toBe(1);
  });

  it("makes dashboard tiles in a few standard sizes", () => {
    const boxes = generator("dashboard").generate(1, { count: 100 }).boxes;
    expect(new Set(boxes.map((b) => `${b.w}x${b.h}`)).size).toBeLessThanOrEqual(6);
    expect(new Set(boxes.map((b) => `${b.w}x${b.h}`)).size).toBeGreaterThan(2);
  });

  it("makes cards with one width and many heights", () => {
    const boxes = generator("cards").generate(1).boxes;
    expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
    expect(new Set(boxes.map((b) => b.h)).size).toBeGreaterThan(20);
  });

  it("makes words with a few heights", () => {
    const boxes = generator("word-cloud").generate(1).boxes;
    expect(new Set(boxes.map((b) => b.h)).size).toBeLessThanOrEqual(6);
    expect(boxes.filter((b) => b.h <= 20).length).toBeGreaterThan(boxes.filter((b) => b.h >= 35).length);
  });

  it.each(["gallery", "dashboard", "cards", "word-cloud"])("makes 10 000 boxes fast (%s)", (name) => {
    const start = performance.now();
    expect(generator(name).generate(1, { count: 10_000 }).boxes).toHaveLength(10_000);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("edge-cases", () => {
  it("makes one box that is wider than the container", () => {
    const file = edgeCases.generate(1, { case: "oversize" });
    expect(file.boxes.filter((b) => b.w > file.container.w!)).toHaveLength(1);
  });

  it.each([1, 7, 12, 64])("makes identical boxes that tile the container exactly (count %i)", (count) => {
    const file = edgeCases.generate(1, { case: "exactTiling", count });
    const [b] = file.boxes;
    expect(file.boxes.every((x) => x.w === b!.w && x.h === b!.h)).toBe(true);
    expect(count * b!.w * b!.h).toBe(file.container.w! * file.container.h!);
    expect(file.container.w! % b!.w).toBe(0);
    expect(file.container.h! % b!.h).toBe(0);
  });

  it.each([1, 2, 3])("makes a locked box that touches an obstacle, and boxes as wide as the path (seed %i)", (seed) => {
    const file = edgeCases.generate(seed, { case: "touchObstacles" });
    const [o0, o1] = (file.obstacles ?? []).map((o) => rectOf(o.region));
    const locked = file.boxes[0]!;
    expect(locked.locked).toBe(true);
    expect(contact(o0!, { x: locked.x!, y: locked.y!, w: locked.w, h: locked.h })).toBeGreaterThan(0);
    const path = o1!.x - (o0!.x + o0!.w);
    for (const b of file.boxes.slice(1)) expect(b.w).toBe(path);
    const input = toPackInput(file);
    expect(checkHard(input, { placements: [{ id: "b0", x: locked.x!, y: locked.y! }], overflow: file.boxes.slice(1).map((b) => b.id), size: { w: 0, h: 0 }, moved: [], trace: [] })).toEqual({
      "no-overlap": 0,
      "in-container": 0,
      "locked-kept": 0,
      complete: 0,
    });
  });

  it("refuses a case with boxes and a count of 0", () => {
    expect(() => edgeCases.generate(1, { case: "exactTiling", count: 0 })).toThrow(RangeError);
    expect(edgeCases.generate(1, { case: "empty", count: 0 }).boxes).toEqual([]);
  });
});

describe("the coverage of the generators", () => {
  it("reaches each value of each dimension of the taxonomy that the corpus covers", () => {
    const seen: Record<string, Set<string>> = {};
    for (const c of CASES) for (const [k, v] of Object.entries(c.gen.cell(c.params))) (seen[k] ??= new Set()).add(String(v));
    expect([...seen["sizes"]!].sort()).toEqual(["bimodal", "extremeAspect", "heavyTail", "identical", "nearIdentical", "uniform"]);
    expect([...seen["count"]!].sort()).toEqual(["1", "10", "100", "10k", "1k"]);
    expect([...seen["obstacles"]!].sort()).toEqual(["center", "corridors", "edge", "none", "scattered", "touching", "wall"]);
    expect([...seen["containerShape"]!].sort()).toEqual(["circle", "convex", "ellipse", "holes", "polygon", "rect"]);
    expect([...seen["containerSize"]!].sort()).toEqual(["fixed", "freeArea", "freeAspect", "freeHeight", "freeWidth"]);
    expect([...seen["order"]!].sort()).toEqual(["free", "soft"]);
  });
});

// Roadmap item k73: each family of `corpusFamilies` through the registry of layout-contract gives the corpus-v1 hashes of today.
describe("the corpus families through the registry", () => {
  const registry = createFamilyRegistry<GeneratedInput>(corpusFamilies);
  const cases = CASES.filter((c) => c.gen !== rectScattered);

  it("has one family for each generator other than rect-scattered, in the order of the generators", () => {
    const kinds = (list: readonly { name: string; version: number }[]): string[] => list.map((x) => familyKind(x.name, x.version));
    expect(kinds(corpusFamilies)).toEqual(kinds(generators.filter((g) => g !== rectScattered)));
    expect(registry.families()).toEqual(corpusFamilies);
  });

  // The set of a generator of known-best inputs is known-v1. The set of each other generator is corpus-v1.
  const setOf = (c: Case): string => c.gen.generate(1, c.params).set;

  it.each(cases.map((c) => [label(c), c] as const))("gives the pinned hash of its set and the same bytes as the generator: %s", (_, c) => {
    const file = registry.generate(c.gen.name, 1, c.params, { version: c.gen.version, set: setOf(c) });
    expect(file.hash, file.id).toBe(HASHES[file.id]);
    expect(JSON.stringify(file)).toBe(JSON.stringify(c.gen.generate(1, c.params)));
    expect(registry.generate(c.gen.name, 1, c.params, { version: c.gen.version }).hash).toBe(file.hash);
  });

  it("covers each pinned corpus-v1 and known-v1 hash", () => {
    const ids = cases.map((c) => registry.generate(c.gen.name, 1, c.params, { version: c.gen.version, set: setOf(c) }).id);
    expect(ids.toSorted()).toEqual(Object.keys(HASHES).filter((id) => id.startsWith("corpus-v1/") || id.startsWith("known-v1/")).toSorted());
  });
});

// Print the hashes for a new pin: PRINT_HASHES=1
if (process.env["PRINT_HASHES"]) {
  const out: Record<string, string> = {};
  for (const c of CASES) {
    const f = c.gen.generate(1, c.params);
    out[f.id] = f.hash;
  }
  console.log(JSON.stringify(out, null, 2));
}
