import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { AREA_LAWS, areaLaw, ASPECT_LAWS, aspectLaw, assortmentOf, corpusPools, LAW_COVER_FILE, LAW_PAIRS, lawCover, lawJson, lawOf, MIN_POOLED_ITEMS, modeCount, type LawInput } from "./law-cover.ts";

// Roadmap item k146: the read gives each law back from made-up samples, at the floor of items.

type Draw = () => number;

/** This function gives a normal draw. */
const normal = (r: Draw): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** This function gives one draw of an area for each law. */
const AREA_DRAWS: Record<(typeof AREA_LAWS)[number], (r: Draw) => number> = {
  identical: () => 1,
  narrow: (r) => 1 + 0.08 * (2 * r() - 1),
  uniform: (r) => 0.2 + 1.6 * r(),
  normal: (r) => Math.max(0.05, 1 + 0.25 * normal(r)),
  exponential: (r) => 0.02 - Math.log(1 - r()),
  "log-normal": (r) => Math.exp(0.8 * normal(r)),
  pareto: (r) => (1 - r()) ** (-1 / 1.5),
  bimodal: (r) => (r() < 0.3 ? 8 : 1) * (0.9 + 0.2 * r()),
  multimodal: (r) => [1, 5, 25][Math.floor(3 * r())]! * (0.9 + 0.2 * r()),
};

/** This function gives one draw of a width over a height for each law. */
const ASPECT_DRAWS: Record<(typeof ASPECT_LAWS)[number], (r: Draw) => number> = {
  fixed: () => 1.3,
  narrow: (r) => 1.3 * (0.8 + 0.4 * r()),
  wide: (r) => Math.exp(1.6 * (2 * r() - 1)),
  "extreme-mixed": (r) => (r() < 0.5 ? 6 + 6 * r() : 1 / (6 + 6 * r())),
  discrete: (r) => [1, 4 / 3, 16 / 9, 3][Math.floor(4 * r())]!,
};

/** This function gives inputs with the laws. Sides have 3 decimals, as the generators give. */
function sample(seed: number, area: (r: Draw) => number, aspect: (r: Draw) => number, items = MIN_POOLED_ITEMS): LawInput[] {
  const r = mulberry32(seed);
  const inputs: LawInput[] = [];
  const size = 20;
  for (let i = 0; i < items / size; i++) {
    const boxes = [];
    for (let j = 0; j < size; j++) {
      const a = area(r);
      const ratio = aspect(r);
      boxes.push({ w: Math.round(1000 * 40 * Math.sqrt(a * ratio)) / 1000, h: Math.round(1000 * 40 * Math.sqrt(a / ratio)) / 1000 });
    }
    inputs.push({ boxes, container: { w: 1024 } });
  }
  return inputs;
}

const TRIALS = 100;
/** The thresholds came from the seeds 1 to 100. These tests use other seeds, so they hold out the tuning. */
const FIRST_SEED = 1001;
const SEEDS = Array.from({ length: TRIALS }, (_, i) => FIRST_SEED + i);

describe("the area law of a sample", () => {
  it.each(AREA_LAWS.map((law) => [law]))("gives %s back in at least 90 percent of the trials", (law) => {
    let hits = 0;
    for (const seed of SEEDS) if (areaLaw(sample(seed, AREA_DRAWS[law], ASPECT_DRAWS.narrow)) === law) hits++;
    expect(hits).toBeGreaterThanOrEqual(0.9 * TRIALS);
  });
});

describe("the scale of an input", () => {
  it("has no effect on the area law", () => {
    let hits = 0;
    for (const seed of SEEDS) {
      const scaled = sample(seed, AREA_DRAWS["log-normal"], ASPECT_DRAWS.narrow).map((input, i) => ({ ...input, boxes: input.boxes.map((b) => ({ w: b.w * (i + 1) ** 2, h: b.h * (i + 1) ** 2 })) }));
      if (areaLaw(scaled) === "log-normal") hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(0.9 * TRIALS);
  });
});

describe("the aspect law of a sample", () => {
  it.each(ASPECT_LAWS.map((law) => [law]))("gives %s back in at least 90 percent of the trials", (law) => {
    let hits = 0;
    for (const seed of SEEDS) if (aspectLaw(sample(seed, AREA_DRAWS.uniform, ASPECT_DRAWS[law])) === law) hits++;
    expect(hits).toBeGreaterThanOrEqual(0.9 * TRIALS);
  });

  it("reads one aspect for each input as a fixed law", () => {
    const inputs = [1, 2, 3].map((seed) => ({ boxes: Array.from({ length: 80 }, () => ({ w: 30 * seed, h: 20 })), container: { w: 500 } }));
    expect(aspectLaw(inputs)).toBe("fixed");
  });
});

describe("the assortment of a sample", () => {
  const box = (w: number, h: number): { w: number; h: number } => ({ w, h });

  it("reads items that fill the container as a cut", () => {
    const inputs = [1, 2].map(() => ({ boxes: [box(6, 10), box(4, 5), box(4, 5)], container: { w: 10, h: 10 } }));
    expect(assortmentOf(inputs)).toBe("cut-from-box");
  });

  it("reads a whole strip with a sum of whole rows as a cut, and decimal sides as no cut", () => {
    const whole = [1, 2].map(() => ({ boxes: [box(6, 10), box(4, 10)], container: { w: 10 } }));
    expect(assortmentOf(whole)).toBe("cut-from-box");
    const decimal = [1, 2].map(() => ({ boxes: [box(6.5, 10), box(3.5, 10), box(1.5, 2), box(2.5, 3)], container: { w: 10 } }));
    expect(assortmentOf(decimal)).toBe("all-differ");
  });

  it("reads few types of box, and tells them from a sample with a type for each item", () => {
    const few = sample(1, () => 1, () => 1).map((input) => ({ ...input, boxes: input.boxes.map((_, i) => box(10 + (i % 3), 20)) }));
    expect(assortmentOf(few)).toBe("few-types");
    expect(assortmentOf(sample(1, AREA_DRAWS.uniform, ASPECT_DRAWS.wide))).toBe("all-differ");
  });
});

describe("the modes of a sample", () => {
  it("counts one mode of a smooth law and two of two clusters", () => {
    const r = mulberry32(5);
    expect(modeCount(Array.from({ length: 400 }, () => normal(r)))).toBe(1);
    expect(modeCount(Array.from({ length: 400 }, (_, i) => (i % 3 === 0 ? 4 : 0) + 0.3 * normal(r)))).toBe(2);
  });

  it.each([6, 9, 12, 20])("counts %i tight clusters at 50 and at 1,000 values each", (count) => {
    for (const size of [50, 1000]) {
      const r = mulberry32(count * size);
      expect(modeCount(Array.from({ length: count * size }, (_, i) => 100 * (i % count) + 0.5 * normal(r)))).toBe(count);
    }
  });

  it("gives one result for few discrete sizes at each size of a sample", () => {
    for (const sizes of [2, 4, 6, 12, 24]) {
      for (const each of [10, 50, 200, 1000]) expect(modeCount(Array.from({ length: sizes * each }, (_, i) => i % sizes))).toBe(sizes);
    }
    expect(modeCount(Array.from({ length: 2500 }, (_, i) => i % 25))).toBe(1);
  });

  it("keeps one mode for a rounded bell at each size from 300 to 3,000", () => {
    const r = mulberry32(21);
    const normal = (): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    for (const n of [300, 1000, 3000]) {
      for (let i = 0; i < 20; i++) expect(modeCount(Array.from({ length: n }, () => Math.round(2 * normal())))).toBe(1);
    }
  });

  it("gives one count for x and -x", () => {
    const r = mulberry32(22);
    for (let t = 0; t < 200; t++) {
      const sizes = 2 + Math.floor(r() * 23);
      const weights = Array.from({ length: sizes }, () => r() ** 2);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const discrete = Array.from({ length: 500 }, () => {
        let left = r() * total;
        return weights.findIndex((weight) => (left -= weight) <= 0);
      });
      expect(modeCount(discrete.map((x) => -x))).toBe(modeCount(discrete));
    }
  });

  it("keeps one mode for the log areas of whole-number sides", () => {
    const r = mulberry32(20);
    for (let i = 0; i < 100; i++) {
      expect(modeCount(Array.from({ length: 900 }, () => Math.log((1 + Math.floor(r() * 20)) * (1 + Math.floor(r() * 20)))))).toBe(1);
    }
  });

  it("joins clusters past the limit of the grid, and gives at least 1", () => {
    const r = mulberry32(30);
    expect(modeCount(Array.from({ length: 1500 }, (_, i) => 100 * (i % 30) + 0.5 * normal(r)))).toBe(1);
  });
});

describe("the count of the pairs", () => {
  it("gives the same bytes each time, and the site has them", () => {
    const text = lawJson(lawCover(corpusPools()));
    expect(lawJson(lawCover(corpusPools()))).toBe(text);
    expect(readFileSync(LAW_COVER_FILE, "utf8")).toBe(text);
  }, 120_000);

  it("has 87 pairs", () => {
    expect(LAW_PAIRS).toBe(87);
  });

  it("refuses a spec under the floor of items and counts it beside the number", () => {
    expect(lawOf(sample(1, AREA_DRAWS.uniform, ASPECT_DRAWS.wide, 20))).toBeUndefined();
    const result = lawCover([
      { generator: "made-up", inputs: () => sample(1, AREA_DRAWS.uniform, ASPECT_DRAWS.wide, 20) },
      { generator: "made-up", inputs: () => sample(2, AREA_DRAWS.uniform, ASPECT_DRAWS.wide) },
    ]);
    expect(result).toMatchObject({ refused: 1, specs: 1, covered: 3 });
    expect(result.missing).toHaveLength(84);
  });
});
