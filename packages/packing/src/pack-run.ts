// The run of one pack from a start frame, with the frames of the run (roadmap item k220). The record of a frame is
// `layout-frame/1` of `@mark1russell7/layout-contract`. The run is not part of the options of a strategy, so the
// config ids and the records do not change.

import { frameOf, outputOf, type FrameSource, type LayoutFrame } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { createContext, type PackContext } from "./strategy.ts";

/**
 * This callback gets each frame of a run and the index of its step. The step 0 is the start frame, when the run has
 * one. The last frame is the output. With `"stop"`, the strategy ends its steps at the next step and gives a legal
 * output.
 */
export type FrameCallback = (frame: LayoutFrame, step: number) => void | "stop";

/** The run of one pack: the start frame and the callback of the frames. */
export interface PackRun {
  /** The start: a frame or a previous output. It fills `PackContext.previous`. An engine of the mode `incremental` starts from it. */
  readonly start?: LayoutFrame | PackOutput;
  /** The callback of the frames. */
  readonly onFrame?: FrameCallback;
}

/** This function tells if a start is a frame. */
const isFrame = (start: LayoutFrame | PackOutput): start is LayoutFrame => "schema" in start;

/** This function gives the frame of an output: each placed box with the size of its item, turned with the placement. */
export function frameOfOutput(input: PackInput, output: PackOutput): LayoutFrame {
  const items = new Map(input.items.map((i) => [i.id, i]));
  const boxes: FrameSource[] = [];
  for (const p of output.placements) {
    const item = items.get(p.id);
    if (item === undefined) continue;
    const [w, h] = p.turn === 90 ? [item.h, item.w] : [item.w, item.h];
    boxes.push(p.turn === undefined ? { id: p.id, x: p.x, y: p.y, w, h } : { id: p.id, x: p.x, y: p.y, w, h, turn: p.turn });
  }
  return frameOf(boxes);
}

/**
 * This function gives the previous output of a start. A frame gives the placements of its boxes that stay or enter.
 * The size of the output is the far corner of these boxes.
 */
export function startOutputOf(start: LayoutFrame | PackOutput): PackOutput {
  if (!isFrame(start)) return start;
  const placements = outputOf(start);
  const kept = new Set(placements.map((p) => p.id));
  let w = 0;
  let h = 0;
  for (const b of start.boxes) {
    if (!kept.has(b.id)) continue;
    w = Math.max(w, b.x + b.w);
    h = Math.max(h, b.y + b.h);
  }
  return { placements, overflow: [], size: { w, h }, moved: [] };
}

/**
 * This function packs one run with a pack function. The context gets the seed, the previous output of the start and
 * a callback of the outputs. The run gives the start frame first and the frame of the output last. After a `"stop"`,
 * the callback of the strategy gives `"stop"` and the run gives no more frames until the frame of the output.
 */
export function packRun(input: PackInput, seed: number, run: PackRun, pack: (context: PackContext) => PackOutput): PackOutput {
  const previous = run.start === undefined ? undefined : startOutputOf(run.start);
  const { onFrame } = run;
  if (onFrame === undefined) return pack(createContext(seed, previous === undefined ? {} : { previous }));
  let step = 0;
  let stopped = false;
  const give = (frame: LayoutFrame): void => {
    if (onFrame(frame, step++) === "stop") stopped = true;
  };
  if (run.start !== undefined) give(isFrame(run.start) ? run.start : frameOfOutput(input, run.start));
  const each = (output: PackOutput): void | "stop" => {
    if (!stopped) give(frameOfOutput(input, output));
    return stopped ? "stop" : undefined;
  };
  const output = pack(createContext(seed, previous === undefined ? { onFrame: each } : { previous, onFrame: each }));
  onFrame(frameOfOutput(input, output), step);
  return output;
}

/** This function gives the output of one run and each of its frames, in order. */
export function framesOfRun(input: PackInput, seed: number, run: Omit<PackRun, "onFrame">, pack: (context: PackContext) => PackOutput): { output: PackOutput; frames: LayoutFrame[] } {
  const frames: LayoutFrame[] = [];
  const output = packRun(input, seed, { ...run, onFrame: (frame) => void frames.push(frame) }, pack);
  return { output, frames };
}
