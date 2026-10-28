// The calculations of the compare page: the input, one packing for each named entry, the best value of each measure and
// the sort. The list of the entries is `ENTRIES` of the benchmark. The sync test fails when the page list differs from it.

import {
  generators,
  measure,
  MEASURE_SPECS,
  packWith,
  toPackInput,
  type CorpusGenerator,
  type GeneratorParams,
  type MeasureId,
  type PackInput,
  type PackOutput,
  type Region,
} from "@mark1russell7/packing";
import { ENTRIES, type BenchEntry } from "@mark1russell7/packing/bench/entries";
import { MEASURE_LABELS } from "./data.ts";
import { errorText, inputOf, makeItems } from "./model.ts";

/** This constant lists each entry of the compare page: `ENTRIES` of the benchmark, in its order. */
export const COMPARE_ENTRIES: readonly BenchEntry[] = ENTRIES;

/** This constant lists each generator of the corpora that the compare page offers. */
export const COMPARE_GENERATORS: readonly CorpusGenerator[] = generators;

/** The largest count of boxes on the compare page. Each entry packs the input in this browser. */
export const MAX_COMPARE_COUNT = 1000;

/** This function gives the key of a generator: its name and its version. */
export const generatorKey = (g: Pick<CorpusGenerator, "name" | "version">): string => `${g.name}@${g.version}`;

/** This function gives the generator of a key. An unknown key gives the generator `rect-grid`, version 2. */
export function generatorOf(key: string): CorpusGenerator {
  return COMPARE_GENERATORS.find((g) => generatorKey(g) === key) ?? COMPARE_GENERATORS.find((g) => generatorKey(g) === "rect-grid@2") ?? COMPARE_GENERATORS[0]!;
}

/** The control of one parameter of a generator: a list of values, or a number. */
export type ParamControl =
  | { key: string; kind: "select"; values: readonly string[]; value: string }
  | { key: string; kind: "number"; value: number; min: number; max: number };

/** This function gives the control of each parameter of a generator, from its defaults and its lists of values. */
export function paramControls(g: CorpusGenerator): ParamControl[] {
  return Object.entries(g.defaults).map(([key, value]): ParamControl => {
    const values = (g.values as Record<string, readonly (string | number)[] | undefined>)[key];
    if (values !== undefined) return { key, kind: "select", values: values.map(String), value: String(value) };
    return { key, kind: "number", value: Number(value), min: 0, max: key === "count" ? MAX_COMPARE_COUNT : 100_000 };
  });
}

/** One input of the compare page: the packing input, its id and a short text of where it comes from. */
export interface CompareInput {
  input: PackInput;
  /** The id of the input. A board of a generator has the id `<set>/<family>/s<seed>` of its file. */
  id: string;
  /** The family of a board of a generator, or the preset of the demo items. */
  family: string;
}

/**
 * This function makes a board of a generator: the parameters over the defaults, and a seed. A count above
 * `MAX_COMPARE_COUNT` becomes `MAX_COMPARE_COUNT`. A bad parameter throws the `RangeError` of the generator.
 */
export function boardInput(key: string, params: GeneratorParams, seed: number): CompareInput {
  const g = generatorOf(key);
  const own = Object.fromEntries(Object.entries(params).filter(([k]) => k in g.defaults));
  if (typeof own["count"] === "number") own["count"] = Math.max(0, Math.min(MAX_COMPARE_COUNT, Math.round(own["count"])));
  const file = g.generate(seed, own);
  return { input: toPackInput(file), id: file.id, family: file.family };
}

/** This function makes the items of a preset of the demo in a container of a fixed width. */
export function presetInput(presetId: string, count: number, width: number, seed: number): CompareInput {
  return { input: inputOf(makeItems(presetId, count, seed), width, "fixed"), id: `demo/${presetId}.n${count}.w${width}/s${seed}`, family: presetId };
}

/** One measure of the compare page: its id, its name, its direction and the text of a value. */
export interface CompareMeasure {
  id: MeasureId;
  label: string;
  note: string;
  direction: "higher" | "lower";
  /** The value `true` for a share, shown as a percent. */
  share: boolean;
}

/** The measures of the compare page: the measures of the results page, then the ragged edge and the boxes not placed. */
export const COMPARE_MEASURES: readonly CompareMeasure[] = (
  ["pack.fill", "pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea", "pack.raggedness", "pack.overflow"] as const
).map((id) => ({ id, label: MEASURE_LABELS[id]!.label, note: MEASURE_LABELS[id]!.note, share: MEASURE_LABELS[id]!.share, direction: MEASURE_SPECS[id].direction }));

/** This function gives the text of the value of a measure. */
export function valueText(m: Pick<CompareMeasure, "share" | "id">, v: number): string {
  if (m.share) return `${(v * 100).toFixed(1)}%`;
  if (m.id === "pack.overflow") return String(Math.round(v));
  return v.toFixed(3);
}

/** The result of one entry on one input. */
export interface EntryResult {
  entry: BenchEntry;
  /** The place of the entry in `COMPARE_ENTRIES` */
  index: number;
  output?: PackOutput;
  /** The value of each measure of `COMPARE_MEASURES` */
  measures?: Partial<Record<MeasureId, number>>;
  /** The time of the call of `packWith`, in milliseconds */
  ms: number;
  error?: string;
  /** The value `true` when the error is `UnsupportedCell`: the entry does not support the input. */
  unsupported?: boolean;
}

/**
 * This function packs an input with one entry: `packWith` with the strategy and the options of the entry, and the seed.
 * An error does not throw. The result has its text.
 */
export function runEntry(entry: BenchEntry, input: PackInput, seed = 0, now: () => number = () => performance.now()): EntryResult {
  const index = COMPARE_ENTRIES.indexOf(entry);
  const start = now();
  try {
    const output = packWith(entry.strategy, input, entry.options, seed);
    const ms = now() - start;
    const all = measure(input, output);
    const measures = Object.fromEntries(COMPARE_MEASURES.map((m) => [m.id, all[m.id as keyof typeof all]]));
    return { entry, index, output, measures, ms };
  } catch (e) {
    return { entry, index, ms: now() - start, ...errorText(e) };
  }
}

// Later, with roadmap item k68: `packSpace` gives the ranges of the options of each strategy. Then the hybrid pipelines
// join the list of the compare page here, after the named entries.

/** This function packs an input with each entry of `COMPARE_ENTRIES`. */
export function runAll(input: PackInput, seed = 0, now?: () => number): EntryResult[] {
  return COMPARE_ENTRIES.map((e) => runEntry(e, input, seed, now));
}

/** A key of the sort: the order of the entries, the time, or a measure of `COMPARE_MEASURES`. */
export type SortKey = "entry" | "ms" | MeasureId;

/** This function gives the value of a sort key of a result, with a sign so that a lower value is better. */
function scoreOf(r: EntryResult, key: SortKey): number | undefined {
  if (r.output === undefined) return undefined;
  if (key === "entry") return r.index;
  if (key === "ms") return r.ms;
  const v = r.measures?.[key];
  if (v === undefined || !Number.isFinite(v)) return undefined;
  return MEASURE_SPECS[key].direction === "higher" ? -v : v;
}

/**
 * This function sorts the results by a key, best first. A tie keeps the order of the entries. A result without a value
 * comes last, in the order of the entries.
 */
export function sortResults(results: readonly EntryResult[], key: SortKey): EntryResult[] {
  return results.toSorted((a, b) => {
    const x = scoreOf(a, key);
    const y = scoreOf(b, key);
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0) || a.index - b.index;
    return x - y || a.index - b.index;
  });
}

/** This function gives the ids of the entries with the best value of a key. Values within 1e-9 of the best tie. */
export function bestIds(results: readonly EntryResult[], key: Exclude<SortKey, "entry">): Set<string> {
  const scored = results.flatMap((r) => {
    const s = scoreOf(r, key);
    return s === undefined ? [] : [{ id: r.entry.id, s }];
  });
  if (scored.length < 2) return new Set();
  const best = Math.min(...scored.map((x) => x.s));
  return new Set(scored.filter((x) => Math.abs(x.s - best) <= 1e-9 * Math.max(1, Math.abs(best))).map((x) => x.id));
}

/** This function gives the bounding box of a region. */
export function regionBounds(r: Region): { x: number; y: number; w: number; h: number } {
  switch (r.kind) {
    case "rect":
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    case "circle":
      return { x: r.cx - r.r, y: r.cy - r.r, w: 2 * r.r, h: 2 * r.r };
    case "ellipse":
      return { x: r.cx - r.rx, y: r.cy - r.ry, w: 2 * r.rx, h: 2 * r.ry };
    case "polygon": {
      const xs = r.points.map((p) => p[0]);
      const ys = r.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  }
}

/** This function gives the SVG element of a region, with a class. */
export function regionSvg(r: Region, cls: string): string {
  switch (r.kind) {
    case "rect":
      return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />`;
    case "circle":
      return `<circle class="${cls}" cx="${r.cx}" cy="${r.cy}" r="${r.r}" />`;
    case "ellipse":
      return `<ellipse class="${cls}" cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}" />`;
    case "polygon": {
      const ring = (pts: readonly (readonly [number, number])[]): string => `M${pts.map((p) => `${p[0]},${p[1]}`).join("L")}Z`;
      return `<path class="${cls}" fill-rule="evenodd" d="${[r.points, ...(r.holes ?? [])].map(ring).join("")}" />`;
    }
  }
}

/**
 * This function gives a small SVG drawing of an output: the container, the obstacles and each placed box. The color of
 * a box goes from the first to the last box of the input.
 */
export function drawingSvg(input: PackInput, output: PackOutput, label: string): string {
  const shape = input.container.shape;
  const box = shape === undefined ? { x: 0, y: 0, w: output.size.w, h: output.size.h } : regionBounds(shape);
  const items = new Map(input.items.map((item, i) => [item.id, { item, i }]));
  const n = Math.max(1, input.items.length - 1);
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  const parts: string[] = [];
  for (const p of output.placements) {
    const found = items.get(p.id);
    if (found === undefined) continue;
    const turned = p.turn === 90;
    const w = turned ? found.item.h : found.item.w;
    const h = turned ? found.item.w : found.item.h;
    right = Math.max(right, p.x + w);
    bottom = Math.max(bottom, p.y + h);
    const t = Math.round((found.i / n) * 100);
    parts.push(`<rect class="box" x="${p.x}" y="${p.y}" width="${w}" height="${h}" style="fill:color-mix(in oklab, var(--early), var(--late) ${t}%)" />`);
  }
  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const obstacles = (input.obstacles ?? []).map((o) => {
    const at = moved.get(o.id);
    if (at === undefined) return regionSvg(o.region, "obstacle");
    const b = regionBounds(o.region);
    return `<g transform="translate(${at.x - b.x} ${at.y - b.y})">${regionSvg(o.region, "obstacle")}</g>`;
  });
  const vx = Math.min(0, box.x);
  const vy = Math.min(0, box.y);
  const vw = Math.max(1, right - vx);
  const vh = Math.max(1, bottom - vy);
  const outline = shape === undefined ? `<rect class="well" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" />` : regionSvg(shape, "well");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">${outline}${obstacles.join("")}${parts.join("")}</svg>`;
}
