// Roadmap item k48: the chains of the corpus `pack-change-v1`. The data is made up.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANGE_WALK_KINDS, CHANGE_WALK_STEPS, allStrategies, changeWalk, corpus, corpusFamilies, generator, measureChange, packWith, toPackInput, type GeneratedInput, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { CHANGE_CORPUS, CHANGE_FILE, CHANGE_STRATEGIES, changeCorpusText, changeMarkdown, changeRecords, changeRows, changeSpecs } from "./change.ts";

/** The hashes of the chains of seed 1, 20 boxes and step 3, in the order of the kinds. */
const PINNED: readonly string[] = ["50b49e31cb649661", "9506030a3a2fd2ae", "054a711e868616c4", "186dc10439ff20fe"];

type Box = GeneratedInput["boxes"][number];

const { inputs } = corpus(CHANGE_CORPUS, changeSpecs());
const byId = new Map(inputs.map((i) => [i.id, i]));

/** This function gives the boxes of an input by id. */
const boxMap = (input: GeneratedInput): Map<string, Box> => new Map(input.boxes.map((b) => [b.id, b]));

/** This function counts the boxes of `a` with no box of the same id and the same sides in `b`. */
function differ(a: GeneratedInput, b: GeneratedInput): number {
  const other = boxMap(b);
  return a.boxes.filter((x) => {
    const y = other.get(x.id);
    return y === undefined || y.w !== x.w || y.h !== x.h;
  }).length;
}

/** This function counts the places where the two lists have another id. */
const placesOff = (a: GeneratedInput, b: GeneratedInput): number => a.boxes.filter((x, i) => b.boxes[i]!.id !== x.id).length;

describe("the corpus pack-change-v1", () => {
  it("has 480 inputs, and 400 of them have a base", () => {
    expect(inputs).toHaveLength(480);
    expect(inputs.filter((i) => i.base !== undefined)).toHaveLength(400);
  });

  it("is the output of the builder", () => {
    expect(readFileSync(CHANGE_FILE, "utf8")).toBe(changeCorpusText());
  });

  it("gives each step after its base", () => {
    const seen = new Set<string>();
    for (const input of inputs) {
      if (input.base !== undefined) expect(seen.has(input.base), input.id).toBe(true);
      seen.add(input.id);
    }
  });

  it("has one edit of the named kind in each step", () => {
    for (const input of inputs) {
      if (input.base === undefined) continue;
      const base = byId.get(input.base)!;
      const edit = input.change;
      expect(input.family, input.id).toContain(`.${edit}.`);
      if (edit === "add") {
        expect([input.boxes.length - base.boxes.length, differ(input, base), differ(base, input)], input.id).toEqual([1, 1, 0]);
      } else if (edit === "remove") {
        expect([base.boxes.length - input.boxes.length, differ(input, base), differ(base, input)], input.id).toEqual([1, 0, 1]);
      } else if (edit === "resize") {
        expect([input.boxes.length, placesOff(input, base)], input.id).toEqual([base.boxes.length, 0]);
        expect(differ(input, base), input.id).toBeLessThanOrEqual(1);
      } else {
        expect(edit, input.id).toBe("reorder");
        expect([differ(input, base), placesOff(input, base)], input.id).toEqual([0, 2]);
      }
    }
  });
});

describe("changeWalk", () => {
  it("gives equal bytes for two calls", () => {
    expect(JSON.stringify(changeWalk.generate(3, { kind: "resize", step: 4, count: 20 }))).toBe(JSON.stringify(changeWalk.generate(3, { kind: "resize", step: 4, count: 20 })));
  });

  it("gives the same boxes at step 0 for each kind", () => {
    const boxes = CHANGE_WALK_KINDS.map((kind) => JSON.stringify(changeWalk.generate(2, { kind, step: 0, count: 20 }).boxes));
    expect(new Set(boxes).size).toBe(1);
  });

  it("gives no fields of a change at step 0", () => {
    const input = changeWalk.generate(2, { step: 0, count: 20 });
    expect(input.base).toBeUndefined();
    expect(input.change).toBeUndefined();
  });

  it("keeps a chain when a later step comes in", () => {
    const short = changeWalk.generate(5, { kind: "add", step: 2, count: 20 }).boxes;
    const long = changeWalk.generate(5, { kind: "add", step: 3, count: 20 }).boxes;
    expect(long.filter((b) => b.id !== "a3")).toEqual(short);
  });

  it("refuses a count that a chain can empty, and a step out of range", () => {
    expect(() => changeWalk.generate(1, { count: CHANGE_WALK_STEPS })).toThrow(RangeError);
    expect(() => changeWalk.generate(1, { step: CHANGE_WALK_STEPS + 1 })).toThrow(RangeError);
  });

  it("is a generator of the corpus, and the sampler does not draw it", () => {
    expect(generator("change-walk", 1)).toBe(changeWalk);
    expect(corpusFamilies.map((f) => f.name)).not.toContain("change-walk");
  });
});

describe("the pinned hashes", () => {
  it("keeps the bytes of one chain", () => {
    expect(CHANGE_WALK_KINDS.map((kind) => changeWalk.generate(1, { kind, step: 3, count: 20 }).hash)).toEqual(PINNED);
  });
});

describe("the report", () => {
  it("gives the stability measures to each record with a base", () => {
    const rows = changeRows(changeRecords(CHANGE_STRATEGIES.slice(0, 1)), CHANGE_STRATEGIES.slice(0, 1));
    expect(rows[0]!.records).toBe(400);
    expect(changeMarkdown(rows)).toContain("`rows`");
  });
});

/** The means of the stability measures of one arm over the steps of the corpus. */
interface Arm {
  moved: number;
  mean: number;
}

/**
 * This function packs each chain of the corpus with one strategy, and gives the means of the stability measures of
 * the steps. With `start`, each step starts from the output of its base, as the bench does. Without it, each step packs from nothing.
 */
function arm(id: string, start: boolean): Arm {
  const done = new Map<string, { input: PackInput; output: PackOutput }>();
  let moved = 0;
  let mean = 0;
  let count = 0;
  for (const file of inputs) {
    const input = toPackInput(file);
    const base = file.base === undefined ? undefined : done.get(file.base);
    const output = packWith(id, input, undefined, file.seed, start && base !== undefined ? { start: base.output } : undefined);
    done.set(file.id, { input, output });
    if (base === undefined) continue;
    const m = measureChange(base.input, base.output, input, output);
    moved += m["pack.stability.moved"];
    mean += m["pack.stability.mean"];
    count++;
  }
  return { moved: moved / count, mean: mean / count };
}

describe("a start frame (k220)", () => {
  // The gate of k220: for each engine that reads a start, a start does not make the stability measures worse. A
  // composite gets the mode `incremental` from the union of the modes of its members, so the gate of the member covers it.
  const engines = ["push", "force"];

  it("covers each single engine of the mode incremental, and force", () => {
    const single = allStrategies.filter((s) => s.kind === "single" && s.supports.mode.includes("incremental")).map((s) => s.id);
    expect(engines).toEqual(expect.arrayContaining([...single, "force"]));
  });

  it.each(engines)("gives %s no worse moved share and no worse mean move with a start than without", { timeout: 60_000 }, (id) => {
    const fresh = arm(id, false);
    const started = arm(id, true);
    expect(started.moved, `${JSON.stringify(started)} ${JSON.stringify(fresh)}`).toBeLessThanOrEqual(fresh.moved);
    expect(started.mean).toBeLessThanOrEqual(fresh.mean);
  });
});
