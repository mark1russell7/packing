// The read of roadmap item k41: the mean fill of a placement alone and through the split `obstacle-cuts`.
// It is a separate program with no file output. `docs/BENCH.md` has its lines.
//
//   node bench/split-fill.ts [--seeds 10] [--count 60]

import { parseArgs } from "node:util";
import { mean } from "@mark1russell7/rigor-statistics";
import { cellOf, createContext, obstacleCuts, packParts, rectGrid, strategy, toPackInput, type ObstacleLayout, type PackInput } from "../src/index.ts";
import { fillOf } from "../src/measures.ts";

/** The obstacle layouts of the read. The layout `none` has no obstacle, so the split gives one band. */
const LAYOUTS: readonly ObstacleLayout[] = ["center", "scattered", "wall", "corridors", "touching", "edge"];

/** The placements of the read. */
const PLACES: readonly string[] = ["skyline", "maxrects", "rows", "shelf"];

/** This function gives the inputs of the read, with rectangle obstacles only. */
export function readInputs(seeds: number, count: number): PackInput[] {
  const out: PackInput[] = [];
  for (const containerSize of ["fixed", "freeHeight"] as const) for (const obstacles of LAYOUTS) for (let seed = 1; seed <= seeds; seed++) {
    const input = toPackInput(rectGrid.generate(seed, { containerShape: "rect", containerSize, obstacles, sizes: "uniform", count }));
    if (cellOf(input).containerShape === "rect") out.push(input);
  }
  return out;
}

/** This function gives one line for each placement: the mean fill alone, through the split, and the count of overflow items. */
export function readFill(inputs: readonly PackInput[]): string[] {
  return PLACES.map((id) => {
    const s = strategy(id);
    const alone: number[] = [];
    const cut: number[] = [];
    let overAlone = 0;
    let overCut = 0;
    for (const input of inputs) {
      const a = s.pack(input, s.defaults, createContext(7));
      const c = packParts(input, obstacleCuts, s, s.defaults, createContext(7));
      alone.push(fillOf(input, a));
      cut.push(fillOf(input, c));
      overAlone += a.overflow.length;
      overCut += c.overflow.length;
    }
    return `${id}: mean fill ${mean(alone).toFixed(4)} alone, ${mean(cut).toFixed(4)} through obstacle-cuts; overflow ${overAlone} alone, ${overCut} through obstacle-cuts; ${inputs.length} inputs`;
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { seeds: { type: "string", default: "10" }, count: { type: "string", default: "60" } } });
  for (const line of readFill(readInputs(Number(values.seeds), Number(values.count)))) console.log(line);
}
