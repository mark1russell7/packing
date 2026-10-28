// The made-up inputs of the tests of `packSpace` (roadmap item k68), and the comparable part of a pack.

import { outputHash, rectGrid, toPackInput, type PackInput, type PackOutput } from "@mark1russell7/packing";

/** The made-up inputs: fixed sizes and free sizes, rectangles and other shapes, with obstacles and without obstacles. */
export const SPACE_INPUTS: readonly PackInput[] = [
  { containerSize: "fixed", containerShape: "rect", obstacles: "scattered", sizes: "uniform", count: 24 },
  { containerSize: "freeHeight", containerShape: "rect", obstacles: "center", sizes: "heavyTail", count: 20 },
  { containerSize: "freeAspect", containerShape: "circle", obstacles: "corridors", sizes: "uniform", count: 24 },
  { containerSize: "fixed", containerShape: "polygon", obstacles: "none", sizes: "bimodal", count: 16 },
  { containerSize: "freeArea", containerShape: "rect", obstacles: "none", sizes: "identical", count: 12 },
  { containerSize: "freeWidth", containerShape: "rect", obstacles: "wall", sizes: "uniform", count: 16 },
].map((params, i) => toPackInput(rectGrid.generate(i + 1, params as never)));

/** The comparable part of a pack: the hash, the size, the overflow and the moved obstacles, or the error message. */
export type PackResult = { hash: string; size: PackOutput["size"]; overflow: PackOutput["overflow"]; moved: PackOutput["moved"] } | { error: string };

/** This function packs once and gives the comparable part of the output, or the message of the error. */
export function result(pack: () => PackOutput): PackResult {
  try {
    const out = pack();
    return { hash: outputHash(out), size: out.size, overflow: out.overflow, moved: out.moved };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
