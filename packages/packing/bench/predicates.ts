// Roadmap item A13 of algebra: a dump of the near-degenerate inputs of the float predicates of the packer (`docs/BENCH.md`, "Predicate dump").
// The command `predicates` of `bench/main.ts` packs each input of a corpus one time with each entry, and then examines the output with `checkHard`.
// The probe of `src/probe.ts` sees each predicate in the pack and in the check. Only the near inputs get a line. The far inputs only count.

import { checkHard, DEFAULT_TOLERANCE } from "@mark1russell7/packing";
import { predicates, type PredicateName } from "../src/probe.ts";
import { pairedInputs, pairedPack, type BenchCorpus } from "./run.ts";

/** The relative distance to 0 of a near value. A value is near when its size is at most `NEAR` times the scale of its inputs. */
export const NEAR = 1e-9;

/** The predicates of the dump, in the order of the lines of a case. */
export const PREDICATE_NAMES: readonly PredicateName[] = ["overlap", "container", "edgeRange", "xAt", "samePlacements"];

/** A box of `checkHard`: the left, top, right and bottom edges, as the predicate reads them. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** This function gives the largest size of the finite values, or 0 when there is no finite value. */
function scaleOf(values: readonly number[]): number {
  let s = 0;
  for (const v of values) if (Number.isFinite(v)) s = Math.max(s, Math.abs(v));
  return s;
}

/** This function tells if a value is near 0 for a scale. A value of 0 is near for each scale. */
const isNear = (value: number, scale: number): boolean => Math.abs(value) <= NEAR * scale;

/** The suffix of a reason for a value that is exactly 0. Such an input only counts, because its float sign is exact. */
export const TOUCH = ":touch";

/** This function gives `<name>:touch` for a value of exactly 0, `<name>` for a near value and `undefined` for a far value. */
const zeroTag = (name: string, value: number, scale: number): string | undefined => (value === 0 ? `${name}${TOUCH}` : isNear(value, scale) ? name : undefined);

/** This function adds a reason to a list when it is not `undefined`. */
const push = (out: string[], reason: string | undefined): void => {
  if (reason !== undefined) out.push(reason);
};

/**
 * This function gives the near reasons of a pair of `overlap`, or an empty list for a far pair.
 *
 * - `x:zero` and `y:zero`: the margin `min(right) - max(left)` of the axis is near 0, but not 0. A margin of exactly 0 gives `x:zero:touch`.
 * - `x:tolerance` and `y:tolerance`: the margin minus the tolerance is near 0. The predicate compares the margin with the tolerance.
 */
export function overlapNear(args: { a: Box; b: Box; tolerance: number }): string[] {
  const { a, b, tolerance } = args;
  const s = scaleOf([a.l, a.t, a.r, a.b, b.l, b.t, b.r, b.b, tolerance]);
  const out: string[] = [];
  const margins: [string, number][] = [
    ["x", Math.min(a.r, b.r) - Math.max(a.l, b.l)],
    ["y", Math.min(a.b, b.b) - Math.max(a.t, b.t)],
  ];
  for (const [axis, m] of margins) {
    push(out, zeroTag(`${axis}:zero`, m, s));
    if (tolerance !== 0 && isNear(m - tolerance, s)) out.push(`${axis}:tolerance`);
  }
  return out;
}

/** The inputs of the container test of `checkHard` for one box. */
interface ContainerArgs {
  box: Box;
  x: number;
  y: number;
  w: number;
  h: number;
  inset: number;
  tolerance: number;
  fixedW: boolean;
  fixedH: boolean;
}

/**
 * This function gives the near reasons of the container test of a box, or an empty list.
 *
 * - Only a fixed side counts. The names are `left`, `right`, `top` and `bottom`.
 * - `<side>:zero`: the box edge is near the inner side, but not on it. An edge on the side gives `<side>:zero:touch`.
 * - `<side>:tolerance`: the box edge is near the side moved out by the tolerance.
 */
export function containerNear(args: ContainerArgs): string[] {
  const { box, x, y, w, h, inset, tolerance: tol } = args;
  const s = scaleOf([box.l, box.t, box.r, box.b, x, y, w, h, inset, tol]);
  const sides: [string, boolean, number, number][] = [
    ["left", args.fixedW, box.l, x + inset],
    ["right", args.fixedW, box.r, x + w - inset],
    ["top", args.fixedH, box.t, y + inset],
    ["bottom", args.fixedH, box.b, y + h - inset],
  ];
  const out: string[] = [];
  for (const [side, fixed, edge, wall] of sides) {
    if (!fixed) continue;
    push(out, zeroTag(`${side}:zero`, edge - wall, s));
    const moved = side === "left" || side === "top" ? wall - tol : wall + tol;
    if (tol !== 0 && isNear(edge - moved, s)) out.push(`${side}:tolerance`);
  }
  return out;
}

/**
 * This function gives the near reasons of a segment and a strip of `edgeRange`, or an empty list.
 *
 * - `low`: the high end of the segment is near the low side `y0` of the strip. `high`: the low end is near `y1`. An equal value adds `:touch`.
 * - `flat`: the two ends have different but near `y`. Then the segment is almost horizontal.
 */
export function edgeRangeNear(args: { ax: number; ay: number; bx: number; by: number; y0: number; y1: number }): string[] {
  const { ax, ay, bx, by, y0, y1 } = args;
  const s = scaleOf([ax, ay, bx, by, y0, y1]);
  const lo = Math.min(ay, by);
  const hi = Math.max(ay, by);
  const out: string[] = [];
  push(out, zeroTag("low", hi - y0, s));
  push(out, zeroTag("high", lo - y1, s));
  if (ay !== by && isNear(ay - by, s)) out.push("flat");
  return out;
}

/** This function gives `["end"]` when `xAt` interpolates at a `y` near an end but not at it, or an empty list. */
export function xAtNear(args: { ax: number; ay: number; bx: number; by: number; y: number }): string[] {
  const { ax, ay, bx, by, y } = args;
  const s = scaleOf([ax, ay, bx, by, y]);
  return (y !== ay && isNear(y - ay, s)) || (y !== by && isNear(y - by, s)) ? ["end"] : [];
}

/** A placement as `samePlacements` compares it. */
type PlacementLike = Readonly<Record<string, unknown>> & { id: string };

/**
 * This function gives the first pair of placements that are different but near, when `samePlacements` says `false`.
 *
 * - The two lists have the same ids and the same fields at each index. Each number field is near the other, and one or more are different.
 * - A far pair, an equal pair and a list of other ids give `undefined`.
 */
export function samePlacementsNear(args: { a: readonly PlacementLike[]; b: readonly PlacementLike[] }, answer: boolean): { a: PlacementLike; b: PlacementLike } | undefined {
  if (answer || args.a.length !== args.b.length) return undefined;
  let first: { a: PlacementLike; b: PlacementLike } | undefined;
  for (const [i, p] of args.a.entries()) {
    const q = args.b[i]!;
    const keys = Object.keys(p);
    if (p.id !== q.id || keys.length !== Object.keys(q).length) return undefined;
    let differs = false;
    for (const key of keys) {
      const u = p[key];
      const v = q[key];
      if (u === v) continue;
      if (typeof u !== "number" || typeof v !== "number" || !isNear(u - v, scaleOf([u, v]))) return undefined;
      differs = true;
    }
    if (differs && first === undefined) first = { a: p, b: q };
  }
  return first;
}

/** The near reasons of one predicate input. An empty list is a far input. */
function nearOf(fn: PredicateName, args: Readonly<Record<string, unknown>>, answer: unknown): { near: string[]; line: Record<string, unknown> } {
  switch (fn) {
    case "overlap":
      return { near: overlapNear(args as Parameters<typeof overlapNear>[0]), line: { ...args } };
    case "container":
      return { near: containerNear(args as unknown as ContainerArgs), line: { ...args } };
    case "edgeRange":
      return { near: edgeRangeNear(args as Parameters<typeof edgeRangeNear>[0]), line: { ...args } };
    case "xAt":
      return { near: xAtNear(args as Parameters<typeof xAtNear>[0]), line: { ...args } };
    case "samePlacements": {
      const pair = samePlacementsNear(args as Parameters<typeof samePlacementsNear>[0], answer === true);
      return pair === undefined ? { near: [], line: {} } : { near: ["placement"], line: pair };
    }
  }
}

/** The last line of a case: the count of each predicate, of its near inputs, of its touch inputs and of the near lines. */
export interface PredicateCaseLine {
  case: string;
  /** The count of the box pairs of `overlap`. */
  totalPairs: number;
  totals: Record<PredicateName, number>;
  /** The count of the near inputs of each predicate, with one line or more. */
  near: Record<PredicateName, number>;
  /** The count of the inputs of each predicate whose only near values are exactly 0. They get no line. */
  touch: Record<PredicateName, number>;
  lines: number;
}

const zeros = (): Record<PredicateName, number> => ({ overlap: 0, container: 0, edgeRange: 0, xAt: 0, samePlacements: 0 });

/**
 * This function starts `work` with the probe on, and gives the lines of the case.
 * The lines are one line for each different near input, then the case line.
 *
 * - A near line is `{"case","fn",...the inputs,"near","floatAnswer","times"}`. `times` counts the same input in the case.
 * - An input whose only near values are exactly 0 gets no line. The case line counts it in `touch`.
 * - The function sets the probe back to its old value at the end, also after an error.
 */
export function collectCase(id: string, work: () => void): { lines: Record<string, unknown>[]; summary: PredicateCaseLine } {
  const totals = zeros();
  const near = zeros();
  const touch = zeros();
  const seen = new Map<string, Record<string, unknown>>();
  const before = predicates.probe;
  predicates.probe = (fn, args, answer) => {
    totals[fn] += 1;
    const n = nearOf(fn, args, answer);
    if (n.near.length === 0) return;
    if (n.near.every((r) => r.endsWith(TOUCH))) {
      touch[fn] += 1;
      return;
    }
    near[fn] += 1;
    const line = { case: id, fn, ...n.line, near: n.near, floatAnswer: answer };
    const key = JSON.stringify(line);
    const old = seen.get(key);
    if (old === undefined) seen.set(key, { ...line, times: 1 });
    else old["times"] = (old["times"] as number) + 1;
  };
  try {
    work();
  } finally {
    predicates.probe = before;
  }
  const lines = [...seen.values()];
  return { lines, summary: { case: id, totalPairs: totals.overlap, totals, near, touch, lines: lines.length } };
}

/**
 * This function packs each input of a corpus with each entry one time, with the probe on, and then checks the output with `checkHard`.
 *
 * - The case id is `<entry>/<input id>`. An entry that does not support the cell of an input skips it.
 * - `inputs` is the count of inputs of the corpus. An entry that supports no input gives 0 cases from 1 input or more.
 * - `emit` gets the lines of each case in order: the near lines, then the case line.
 */
export function dumpPredicates(c: BenchCorpus, ids: readonly string[], emit: (line: string) => void): { inputs: number; cases: number; near: Record<PredicateName, number> } {
  const near = zeros();
  let cases = 0;
  const inputs = pairedInputs(c);
  for (const at of inputs) {
    for (const id of ids) {
      const pack = pairedPack(id, at);
      if (pack === undefined) continue;
      const { lines, summary } = collectCase(`${id}/${at.id}`, () => {
        checkHard(at.input, pack(), DEFAULT_TOLERANCE);
      });
      for (const line of lines) emit(JSON.stringify(line));
      emit(JSON.stringify(summary));
      for (const fn of PREDICATE_NAMES) near[fn] += summary.near[fn];
      cases += 1;
    }
  }
  return { inputs: inputs.length, cases, near };
}
