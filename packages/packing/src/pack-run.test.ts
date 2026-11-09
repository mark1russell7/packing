import { fixedPointMove, frameMove, outputOf, type LayoutFrame } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkHard } from "./check.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { frameOfOutput, packFrames, packWith, startOutputOf } from "./index.ts";
import { mulberry32 } from "./strategy.ts";

/** This function gives an input of `n` random boxes in a fixed container with slack. */
function scattered(seed: number, n: number): PackInput {
  const random = mulberry32(seed);
  const items = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: 4 + Math.floor(random() * 16), h: 4 + Math.floor(random() * 16) }));
  return { container: { w: 120, h: 120, fixed: "size" }, items, gap: 2 };
}

/** This function gives the sum of the hard breaks of an output. */
const hard = (input: PackInput, output: PackOutput): number => Object.values(checkHard(input, output)).reduce((a, b) => a + b, 0);

/** This function gives an output with no trace: a trace has times, so two packs differ there. */
const untimed = ({ trace: _trace, ...rest }: PackOutput): Omit<PackOutput, "trace"> => rest;

/** This function gives an output with each box moved by a random step of at most `reach` on each axis. */
function shaken(output: PackOutput, seed: number, reach: number): PackOutput {
  const random = mulberry32(seed);
  return { ...output, placements: output.placements.map((p) => ({ ...p, x: p.x + (random() - 0.5) * 2 * reach, y: p.y + (random() - 0.5) * 2 * reach })) };
}

describe("the run of a pack (k220)", () => {
  it("gives the move 0 from a start frame that is a fixed point of force", () => {
    for (let seed = 0; seed < 5; seed++) {
      const input = scattered(700 + seed, 20);
      const start = frameOfOutput(input, packWith("force", input));
      const run = (frame: LayoutFrame): LayoutFrame => frameOfOutput(input, packWith("force", input, undefined, 0, { start: frame }));
      expect(fixedPointMove(start, run), `seed ${seed}`).toBe(0);
    }
  });

  it("gives the frames from the start frame to the frame of the output", () => {
    const input = scattered(710, 20);
    const start = frameOfOutput(input, shaken(packWith("force", input), 1, 20));
    const { output, frames } = packFrames("force", input, undefined, 0, { start });
    expect(frames.length).toBeGreaterThan(2);
    expect(frames[0]).toEqual(start);
    expect(frames.at(-1)).toEqual(frameOfOutput(input, output));
    expect(hard(input, output)).toBe(0);
    // Each step moves the boxes less than a fresh pack moves them from the start.
    const fresh = frameOfOutput(input, packWith("force", input));
    expect(frameMove(start, frames.at(-1)!)).toBeLessThan(frameMove(start, fresh));
  });

  it("numbers the frames from 0, and a stop at step 1 gives a legal output with fewer frames", () => {
    const input = scattered(720, 20);
    const start = frameOfOutput(input, shaken(packWith("force", input), 2, 20));
    const all = packFrames("force", input, undefined, 0, { start }).frames;
    const steps: number[] = [];
    const output = packWith("force", input, undefined, 0, { start, onFrame: (_, step) => (steps.push(step), step === 1 ? "stop" : undefined) });
    expect(steps).toEqual([...steps.keys()]);
    expect(steps.length).toBeLessThan(all.length);
    expect(steps.length).toBe(3);
    expect(hard(input, output)).toBe(0);
  });

  it("gives the start frame and the output for an engine with no steps", () => {
    const input = scattered(730, 10);
    const start = frameOfOutput(input, packWith("maxrects", input));
    const { output, frames } = packFrames("shelf", input, undefined, 0, { start });
    expect(frames).toEqual([start, frameOfOutput(input, output)]);
    expect(untimed(output)).toEqual(untimed(packWith("shelf", input)));
  });

  it("gives the same output with no run and with a run that has no start and no callback", () => {
    const input = scattered(740, 15);
    for (const id of ["force", "shelf", "push"]) expect(untimed(packWith(id, input, undefined, 3, {}))).toEqual(untimed(packWith(id, input, undefined, 3)));
  });

  it("starts from the boxes of a frame that stay or enter, and from a previous output as it is", () => {
    const input = scattered(750, 6);
    const output = packWith("shelf", input);
    const frame = frameOfOutput(input, output);
    const leaving: LayoutFrame = { ...frame, boxes: frame.boxes.map((b, i) => (i === 0 ? { ...b, state: "leave", presence: 0.5 } : b)) };
    expect(startOutputOf(leaving).placements).toEqual(outputOf(leaving));
    expect(startOutputOf(leaving).placements.map((p) => p.id)).not.toContain(frame.boxes[0]!.id);
    expect(startOutputOf(output)).toBe(output);
  });
});
