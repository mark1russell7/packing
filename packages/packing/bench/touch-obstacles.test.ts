import { createFamilyRegistry, packHard, type PackHard } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkHard, corpusFamilies, DEFAULT_TOLERANCE, packWith, strategies, toPackInput, type GeneratedInput } from "@mark1russell7/packing";
import { ENTRIES } from "./entries.ts";

// Roadmap item k114: the case `touchObstacles` of `edge-cases` with the knobs. Its locked box touches an obstacle.
// Before k114, the knob `margin` also went on the locked box. Then its margin went into the obstacle, and each strategy
// broke `no-overlap`, because the packer does not move a locked box.

const registry = createFamilyRegistry(corpusFamilies);
const CLEAN: PackHard = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** Each named entry of the bench, then each strategy of the registry with its defaults. */
const RUNS = [
  ...ENTRIES.map((e) => ({ id: e.id, strategy: e.strategy, options: e.options as unknown })),
  ...strategies.map((s) => ({ id: `registry:${s.id}`, strategy: s.id, options: undefined as unknown })),
];

const touch = (seed: number, count: number, margin: number, gap: number): GeneratedInput =>
  registry.generate("edge-cases", seed, { case: "touchObstacles", count, margin, gap }, { set: "sample-space" });

/** This function gives the breaks of each run that is not clean, by the id of the run. */
function breaksOf(file: GeneratedInput): Record<string, PackHard> {
  const input = toPackInput(file);
  const out: Record<string, PackHard> = {};
  for (const run of RUNS) {
    const hard = packHard(file, packWith(run.strategy, input, run.options, file.seed), DEFAULT_TOLERANCE.overlap);
    if (Object.values(hard).some((v) => v > 0)) out[run.id] = hard;
  }
  return out;
}

describe("touchObstacles with the knobs (k114)", () => {
  it("keep the locked box on its obstacle: the input of the sampler touches", () => {
    const file = touch(1, 103, 29.924, 1.49);
    const locked = file.boxes[0]!;
    const region = file.obstacles![0]!.region;
    expect(locked.locked).toBe(true);
    expect(region.kind).toBe("rect");
    if (region.kind !== "rect") return;
    expect(locked.y! + locked.h).toBe(region.y);
    expect(locked.x).toBe(region.x);
  });

  it("give no margin to a locked box whose margin goes into an obstacle, and the margin to each other box", () => {
    for (const seed of [1, 2, 3])
      for (const margin of [0.002, 1, 29.924, 32]) {
        const file = touch(seed, 5, margin, 1.49);
        expect(file.boxes[0]!.margin, `s${seed} m${margin}`).toBeUndefined();
        for (const b of file.boxes.slice(1)) expect(b.margin).toBe(margin);
        // With the margin on the locked box, the input breaks no-overlap before a packer moves a box
        const over = { ...file, boxes: file.boxes.map((b, i) => (i === 0 ? { ...b, margin } : b)) };
        const at = { placements: [{ id: "b0", x: file.boxes[0]!.x!, y: file.boxes[0]!.y! }], overflow: [], size: { w: 0, h: 0 }, moved: [] };
        expect(packHard(over, at, DEFAULT_TOLERANCE.overlap)["no-overlap"], `s${seed} m${margin}`).toBe(1);
      }
  });

  it("keep the margin of a locked box when the margin stays in the tolerance", () => {
    // A margin of 0.001 goes into the obstacle by the tolerance only. Thus the input and its hash do not change.
    const file = touch(1, 5, 0.001, 0);
    expect(file.boxes[0]!.margin).toBe(0.001);
    expect(file.boxes.every((b) => b.margin === 0.001)).toBe(true);
  });

  it("pack the input of the sampler with no break for each entry and each strategy", () => {
    for (const seed of [1, 2, 3]) expect(breaksOf(touch(seed, 103, 29.924, 1.49)), `s${seed}`).toEqual({});
  });

  it("pack the smallest case and its neighbours with no break: 1 or 2 boxes, margins and gaps in a grid", () => {
    for (const count of [1, 2])
      for (const margin of [0.001, 0.002, 1, 15, 29.924, 32])
        for (const gap of [0, 1.49, 32])
          for (const seed of [1, 2, 3]) expect(breaksOf(touch(seed, count, margin, gap)), `n${count} m${margin} g${gap} s${seed}`).toEqual({});
  });

  it("keep each rule clean in the form of checkHard too", () => {
    const file = touch(2, 1, 29.924, 0);
    const input = toPackInput(file);
    for (const run of RUNS) expect(checkHard(input, packWith(run.strategy, input, run.options, file.seed)), run.id).toEqual(CLEAN);
  });
});
