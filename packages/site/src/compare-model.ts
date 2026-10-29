// The calculations of the compare page: the input, one packing for each named entry, the best value of each measure and
// the sort. The list of the entries is `ENTRIES` of the benchmark. The sync test fails when the page list differs from it.

import type { CorpusFamily, LayoutInput } from "@mark1russell7/layout-contract";
import { cellOf, measure, MEASURE_SPECS, packWith, shapeStrategies, type MeasureId, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { ENTRIES, type BenchEntry } from "@mark1russell7/packing/bench/entries";
import { generateInput, MAX_SITE_COUNT, SITE_FAMILIES, type DimensionValues } from "./corpus-input.ts";
import { COMPARE_LABELS } from "./data.ts";
import { errorText, inputOf, makeItems } from "./model.ts";
import { regionBounds, regionSvg } from "./region.ts";

export { regionBounds, regionSvg } from "./region.ts";

/** This constant lists each entry of the compare page: `ENTRIES` of the benchmark, in its order. */
export const COMPARE_ENTRIES: readonly BenchEntry[] = ENTRIES;

/**
 * This constant lists the strategies of one shape kind, as entries with no options. They are not in `ENTRIES`. The page
 * adds them after `COMPARE_ENTRIES` when they support the shape of the input.
 */
export const SHAPE_ENTRIES: readonly BenchEntry[] = shapeStrategies.map((s) => ({ id: s.id, strategy: s.id, options: {} }));

/** This constant lists each entry that the page can show: `COMPARE_ENTRIES`, then `SHAPE_ENTRIES`. */
const ALL_ENTRIES: readonly BenchEntry[] = [...COMPARE_ENTRIES, ...SHAPE_ENTRIES];

/** This function gives the entries of an input: each entry of `COMPARE_ENTRIES`, then each shape entry that supports its item shape. */
export function entriesFor(input: PackInput): readonly BenchEntry[] {
  const kind = cellOf(input).itemShape;
  const shaped = SHAPE_ENTRIES.filter((e) => shapeStrategies.some((s) => s.id === e.strategy && s.supports.itemShape.includes(kind)));
  return shaped.length === 0 ? COMPARE_ENTRIES : [...COMPARE_ENTRIES, ...shaped];
}

/** This constant lists each corpus family that the compare page offers: the families of the registry of the site. */
export const COMPARE_FAMILIES: readonly CorpusFamily<LayoutInput>[] = SITE_FAMILIES;

/** The largest count of boxes on the compare page. Each entry packs the input in this browser. */
export const MAX_COMPARE_COUNT = MAX_SITE_COUNT;

/** One input of the compare page: the packing input, its id and a short text of where it comes from. */
export interface CompareInput {
  input: PackInput;
  /** The id of the input. A board of a family has the id `<set>/<family>/s<seed>` of its file. */
  id: string;
  /** The family of a board of a corpus family, or the preset of the demo items. */
  family: string;
}

/**
 * This function makes a board of a corpus family with `generate` of the registry of the site: the values of the
 * dimensions and a seed. A count above `MAX_COMPARE_COUNT` becomes `MAX_COMPARE_COUNT`. A bad value throws a `RangeError`.
 */
export function boardInput(key: string, dims: DimensionValues, seed: number): CompareInput {
  const { file, input } = generateInput(key, dims, seed);
  return { input, id: file.id, family: file.family ?? key };
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

/** The measures of the compare page: the measures of the results page, the ragged edge, the boxes not placed and the side skew. */
export const COMPARE_MEASURES: readonly CompareMeasure[] = (
  ["pack.fill", "pack.order.inversions", "pack.aspectError", "pack.overflow.excessArea", "pack.raggedness", "pack.overflow", "pack.balance.sideRange"] as const
).map((id) => ({ id, label: COMPARE_LABELS[id]!.label, note: COMPARE_LABELS[id]!.note, share: COMPARE_LABELS[id]!.share, direction: MEASURE_SPECS[id].direction }));

/** This function gives the text of the value of a measure. */
export function valueText(m: Pick<CompareMeasure, "share" | "id">, v: number): string {
  if (m.share) return `${(v * 100).toFixed(1)}%`;
  if (m.id === "pack.overflow") return String(Math.round(v));
  return v.toFixed(3);
}

/** The result of one entry on one input. */
export interface EntryResult {
  entry: BenchEntry;
  /** The place of the entry in `COMPARE_ENTRIES`, then `SHAPE_ENTRIES` */
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
  const index = ALL_ENTRIES.indexOf(entry);
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

/** This function packs an input with each entry of `entriesFor` of the input. */
export function runAll(input: PackInput, seed = 0, now?: () => number): EntryResult[] {
  return entriesFor(input).map((e) => runEntry(e, input, seed, now));
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

/** One point of the front of compact against spread (roadmap item k123): an entry, its fill and its side skew. */
export interface FrontPoint {
  id: string;
  fill: number;
  skew: number;
  /** The value `true` when no other point beats this point. To beat it, a point has more fill and no more skew, or less skew and no less fill. */
  front: boolean;
}

/** This function gives the points of the front of compact against spread. A result without both values has no point. */
export function frontPoints(results: readonly EntryResult[]): FrontPoint[] {
  const points = results.flatMap((r) => {
    const fill = r.measures?.["pack.fill"];
    const skew = r.measures?.["pack.balance.sideRange"];
    return fill === undefined || skew === undefined || !Number.isFinite(fill) || !Number.isFinite(skew) ? [] : [{ id: r.entry.id, fill, skew }];
  });
  const beats = (a: { fill: number; skew: number }, b: { fill: number; skew: number }): boolean => a.fill >= b.fill && a.skew <= b.skew && (a.fill > b.fill || a.skew < b.skew);
  return points.map((p) => ({ ...p, front: !points.some((q) => beats(q, p)) }));
}

/**
 * This function gives an SVG chart of the front: the side skew on the x axis, the fill on the y axis. The front points
 * have a line and their names. A point that is not on the front is small and gray.
 */
export function frontSvg(points: readonly FrontPoint[]): string {
  const W = 320;
  const H = 200;
  const pad = { l: 40, r: 12, t: 12, b: 32 };
  const maxSkew = Math.max(0.05, ...points.map((p) => p.skew));
  const minFill = Math.min(0.5, ...points.map((p) => p.fill));
  const x = (v: number): number => pad.l + (v / maxSkew) * (W - pad.l - pad.r);
  const y = (v: number): number => pad.t + ((1 - v) / Math.max(1e-9, 1 - minFill)) * (H - pad.t - pad.b);
  const front = points.filter((p) => p.front).toSorted((a, b) => a.skew - b.skew || b.fill - a.fill);
  const line = front.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.skew).toFixed(1)} ${y(p.fill).toFixed(1)}`).join(" ");
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const axes = [
    `<line class="faxis" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" />`,
    `<line class="faxis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" />`,
    `<text class="ftick" x="${pad.l}" y="${H - pad.b + 14}" text-anchor="middle">0%</text>`,
    `<text class="ftick" x="${W - pad.r}" y="${H - pad.b + 14}" text-anchor="end">${pct(maxSkew)}</text>`,
    `<text class="ftick" x="${pad.l - 4}" y="${pad.t + 4}" text-anchor="end">100%</text>`,
    `<text class="ftick" x="${pad.l - 4}" y="${H - pad.b}" text-anchor="end">${pct(minFill)}</text>`,
    `<text class="flabel" x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">Side skew, less is better</text>`,
    `<text class="flabel" x="10" y="${(pad.t + H - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 10 ${(pad.t + H - pad.b) / 2})">Fill</text>`,
  ];
  const dots = points
    .toSorted((a, b) => Number(a.front) - Number(b.front))
    .map((p) => {
      const title = `<title>${p.id}: fill ${(p.fill * 100).toFixed(1)}%, side skew ${(p.skew * 100).toFixed(1)}%</title>`;
      const name = p.front ? `<text class="fname" x="${(x(p.skew) + 6).toFixed(1)}" y="${(y(p.fill) - 6).toFixed(1)}">${p.id}</text>` : "";
      return `<g class="${p.front ? "fpoint on" : "fpoint"}"><circle cx="${x(p.skew).toFixed(1)}" cy="${y(p.fill).toFixed(1)}" r="${p.front ? 4.5 : 3}">${title}</circle>${name}</g>`;
    });
  const path = front.length > 1 ? `<path class="fline" d="${line}" />` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The fill against the side skew of each strategy. ${front.length} strategies are on the front.">${axes.join("")}${path}${dots.join("")}</svg>`;
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
    const fill = `style="fill:color-mix(in oklab, var(--early), var(--late) ${t}%)"`;
    const c = found.item.shape?.kind === "circle" ? found.item.shape : undefined;
    // A circle item shows its circle, not its box
    parts.push(c === undefined ? `<rect class="box" x="${p.x}" y="${p.y}" width="${w}" height="${h}" ${fill} />` : `<circle class="box" cx="${p.x + c.cx}" cy="${p.y + c.cy}" r="${c.r}" ${fill} />`);
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
