// The item laws that the corpus really emits (roadmap item k146). The script generates each committed spec and reads the items alone.
// It gives each spec an area law, an aspect law and an assortment, and it counts the pairs of two laws that some spec covers.
// A label of a generator has no effect on the result.
//
//   node bench/law-cover.ts [--out <file>]
//
// `docs/BENCH.md` ("The law pairs") tells how to read the result.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generator, type GeneratedInput, type GeneratorParams } from "@mark1russell7/packing";
import { mean, median, quantile, sd } from "@mark1russell7/rigor-statistics";
import { CORPORA_DIR, readManifests } from "./corpus-cover.ts";

/** The schema of the output of `lawCover`. */
export const LAW_COVER_SCHEMA = "packing-law-cover/1";

/** The laws of the item areas. */
export const AREA_LAWS = ["identical", "narrow", "uniform", "normal", "exponential", "log-normal", "pareto", "bimodal", "multimodal"] as const;
/** The laws of the item aspects. */
export const ASPECT_LAWS = ["fixed", "narrow", "wide", "extreme-mixed", "discrete"] as const;
/** The assortments of the items. */
export const ASSORTMENTS = ["all-differ", "few-types", "cut-from-box"] as const;

export type AreaLaw = (typeof AREA_LAWS)[number];
export type AspectLaw = (typeof ASPECT_LAWS)[number];
export type Assortment = (typeof ASSORTMENTS)[number];

/** The number of pairs of two law dimensions: 45 + 27 + 15. */
export const LAW_PAIRS: number = AREA_LAWS.length * ASPECT_LAWS.length + AREA_LAWS.length * ASSORTMENTS.length + ASPECT_LAWS.length * ASSORTMENTS.length;

/** The floor of items. A spec with fewer pooled items does not give a law, and the result counts it as refused. */
export const MIN_POOLED_ITEMS = 200;

/** The fields of an input that the read uses. */
export interface LawInput {
  readonly boxes: readonly { readonly w: number; readonly h: number }[];
  readonly container?: { readonly w?: number | undefined; readonly h?: number | undefined } | undefined;
}

/** The three laws of a spec. */
export interface LawCell {
  readonly area: AreaLaw;
  readonly aspect: AspectLaw;
  readonly assortment: Assortment;
}

const SPREAD_IDENTICAL = 0.02;
const SPREAD_NARROW_AREA = Math.log(1.5);
const SPREAD_NARROW_ASPECT = Math.log(2);
const SCALE_RATIO = 3;
const MIN_MODE_SHARE = 0.1;
const KERNEL_FACTOR = 0.45;
const SPAN_FACTOR = 0.1;
const SPAN_QUANTILE = 0.25;
const TIGHT_RATIO = 0.1;
const HALF_LOG_2PI_E = 0.5 * Math.log(2 * Math.PI * Math.E);
const GRID = 96;
const SAME_VALUE = 1e-9;
const FEW_VALUES = GRID / 4;
const MIN_REPEATS = 4;
const MIN_BELL_VALUES = 4;
const FLAT_RATIO = 3;
const SHAPE_RATIO = 1.75;
const RARE_VALUE = 0.01;
const MIN_HUMP_VALUES = 3;
const COUNT_Z = 3;
const EXTREME_ASPECT = Math.log(3);
const CENTRAL_ASPECT = Math.log(2);
const CLUSTER_GAP = 0.03;
const CLUSTER_WIDTH = 0.08;
const MAX_RATIOS = 8;
const MAX_TYPES = 16;

/** One hump of a series: its highest point, the sum of its points and the count of its points. */
interface Hump {
  readonly top: number;
  readonly mass: number;
  readonly points: number;
}

const at = (values: readonly number[], q: number): number => quantile(values, q);
const spread = (values: readonly number[]): number => at(values, 0.95) - at(values, 0.05);
const share = (values: readonly number[], test: (x: number) => boolean): number => values.filter(test).length / values.length;

/**
 * This function gives the width of the kernel. The width from the quartiles follows the distance between clusters, so it hides many
 * tight clusters. A low quantile of the spans of neighbouring values follows the width of a cluster. The function uses that tight
 * width only when it is far under the other width, so a smooth sample keeps its width. The tight width stays over the grid step, and
 * no width of a tight sample goes under the median gap of the distinct values, so the areas of whole-number sides keep the modes of
 * their shape at each size.
 */
function kernelWidth(values: readonly number[], low: number, high: number): number {
  const order = [...values].sort((a, b) => a - b);
  const scale = Math.min(at(values, 0.75) - at(values, 0.25), high - low) / 1.34;
  const wide = KERNEL_FACTOR * Math.max(scale, (high - low) / GRID) * values.length ** -0.2;
  const neighbours = Math.min(values.length - 1, Math.ceil(SPAN_FACTOR * values.length ** 0.8));
  const tight = at(order.slice(neighbours).map((x, i) => x - order[i]!), SPAN_QUANTILE);
  if (tight >= TIGHT_RATIO * wide) return wide;
  const distinct = order.filter((x, i) => i === 0 || x !== order[i - 1]);
  const resolution = at(distinct.slice(1).map((x, i) => x - distinct[i]!), 0.5);
  return Math.max(resolution, Math.min(wide, Math.max(tight, (high - low) / GRID)));
}

/** This function gives the count of each distinct value, in the order of the values. */
function valueCounts(values: readonly number[], low: number, high: number): number[] {
  const tie = SAME_VALUE * (high - low);
  const counts: number[] = [];
  let last = -Infinity;
  for (const x of [...values].sort((a, b) => a - b)) {
    if (x - last > tie) {
      counts.push(0);
      last = x;
    }
    counts[counts.length - 1]!++;
  }
  return counts;
}

/**
 * This function tells that the counts are flat. The highest third of the counts stays under `FLAT_RATIO` times the lowest third, so a
 * list of heavy and light values is not flat. The means of the first, the middle and the last third of the list stay under
 * `SHAPE_RATIO` of each other. The noise of a sample cancels in those means, and a bell does not.
 */
function flatCounts(counts: readonly number[]): boolean {
  const order = [...counts].sort((a, b) => a - b);
  const third = Math.ceil(order.length / 3);
  if (mean(order.slice(-third)) >= FLAT_RATIO * mean(order.slice(0, third))) return false;
  const parts = [counts.slice(0, third), counts.slice(third, -third), counts.slice(-third)].filter((part) => part.length > 0).map((part) => mean(part));
  return Math.max(...parts) < SHAPE_RATIO * Math.min(...parts);
}

/**
 * This function gives the humps of a series. It first gives each rise and fall one hump. Then it joins the two neighbours
 * with the closest valley, and again, until each valley has a closeness under the limit. The result has no direction,
 * because the order of the joins comes from the depth of the valleys and not from their position.
 */
function humpsOf(series: ArrayLike<number>, closeness: (lower: number, valley: number) => number, limit: number): Hump[] {
  const humps: Hump[] = [];
  const valleys: number[] = [];
  let index = 0;
  while (index < series.length) {
    let top = index;
    while (top + 1 < series.length && series[top + 1]! >= series[top]!) top++;
    let end = top;
    while (end + 1 < series.length && series[end + 1]! < series[end]!) end++;
    let mass = 0;
    for (let i = index; i <= end; i++) mass += series[i]!;
    humps.push({ top: series[top]!, mass, points: end + 1 - index });
    if (end + 1 < series.length) valleys.push(series[end]!);
    index = end + 1;
  }
  while (valleys.length > 0) {
    const scores = valleys.map((valley, i) => closeness(Math.min(humps[i]!.top, humps[i + 1]!.top), valley));
    const closest = scores.indexOf(Math.max(...scores));
    if (scores[closest]! < limit) break;
    const [left, right] = [humps[closest]!, humps[closest + 1]!];
    humps.splice(closest, 2, { top: Math.max(left.top, right.top), mass: left.mass + right.mass, points: left.points + right.points });
    valleys.splice(closest, 1);
  }
  return humps;
}

/** This function gives the closeness of a count to a valley: the negative of its height over the noise of a sample. */
const countCloseness = (lower: number, valley: number): number => -(lower - valley) / Math.sqrt(lower + valley);

/**
 * This function gives the distances of the values from one end of the sample, in order. It takes the end that gives the
 * smaller list, so `x` and `-x` give one list and one count.
 */
function fromOneEnd(values: readonly number[]): number[] {
  const order = [...values].sort((a, b) => a - b);
  const low = order[0]!;
  const high = order[order.length - 1]!;
  const rising = order.map((x) => x - low);
  const falling = order.map((x) => high - x).reverse();
  const first = rising.findIndex((x, i) => x !== falling[i]);
  return first >= 0 && falling[first]! < rising[first]! ? falling : rising;
}

/**
 * This function counts the modes of a sample with few distinct values, from the counts of those values. The result does not change
 * with the size of the sample. Flat counts are a discrete law with one mode for each value, so the noise of a sample does not take a
 * value out. Counts with one rise and one fall are a rounded smooth law with one mode.
 */
function fewValueModes(allCounts: readonly number[], total: number): number {
  const counts = allCounts.filter((count) => count / total >= RARE_VALUE);
  const each = counts.map((count) => count / total);
  const overLimit = (masses: readonly number[], limit: number): number => masses.filter((part) => part >= limit).length;
  if (counts.length < MIN_BELL_VALUES) return overLimit(each, Math.min(MIN_MODE_SHARE, Math.max(...each) / 2));
  if (flatCounts(counts)) return overLimit(each, Math.min(MIN_MODE_SHARE, at(each, 0.5) / FLAT_RATIO));
  const humps = humpsOf(counts, countCloseness, -COUNT_Z);
  const narrow = humps.filter((hump) => hump.points < MIN_HUMP_VALUES).length;
  const masses = 2 * narrow > humps.length ? each : humps.map((hump) => hump.mass / total);
  return overLimit(masses, Math.min(MIN_MODE_SHARE, Math.max(...masses) / 2));
}

/**
 * This function counts the modes of a sample. A mode counts when it holds 10 percent of the mass, or half of the mass of the largest
 * mode. The result is at least 1. A sample with 24 or fewer distinct values, and 4 or more copies of each value on average, gets a
 * direct read of the counts of those values, so the result does not change with the size of the sample. A kernel estimate on a grid
 * reads each other sample. The valley to the next mode is under half of the lower height, and the grid joins more than approximately
 * 24 evenly spaced clusters. A copy of this count is in rigor-statistics, and this one goes with the release of that package.
 */
export function modeCount(values: readonly number[]): number {
  const distances = fromOneEnd(values);
  const low = 0;
  const high = distances[distances.length - 1]!;
  if (high === low) return 1;
  const counts = valueCounts(distances, low, high);
  if (counts.length <= FEW_VALUES && values.length >= MIN_REPEATS * counts.length) return fewValueModes(counts, values.length);
  const h = kernelWidth(distances, low, high);
  const step = (high - low + 6 * h) / (GRID - 1);
  const density = new Float64Array(GRID);
  for (const x of distances) {
    const first = Math.max(0, Math.floor((x - 3 * h - (low - 3 * h)) / step));
    const last = Math.min(GRID - 1, Math.ceil((x + 3 * h - (low - 3 * h)) / step));
    for (let i = first; i <= last; i++) {
      const u = (low - 3 * h + i * step - x) / h;
      density[i]! += Math.exp(-0.5 * u * u);
    }
  }
  const total = density.reduce((sum, d) => sum + d, 0);
  const masses = humpsOf(density, (lower, valley) => valley / lower, 0.5).map((hump) => hump.mass / total);
  const limit = Math.min(MIN_MODE_SHARE, Math.max(...masses) / 2);
  return masses.filter((part) => part >= limit).length;
}

/**
 * This function gives the log of each item area. It takes out the mean log of each input only when the means differ by more than
 * the count of items explains. With no difference of scale, that step smears the clusters of a mixture.
 */
function logAreas(inputs: readonly LawInput[]): number[] {
  const groups = inputs.map((input) => input.boxes.map((b) => Math.log(b.w * b.h))).filter((logs) => logs.length > 0);
  const means = groups.map((logs) => mean(logs));
  const within = mean(groups.map((logs, i) => mean(logs.map((x) => (x - means[i]!) ** 2))));
  const size = mean(groups.map((logs) => logs.length));
  const centre = mean(means);
  const between = mean(means.map((m) => (m - centre) ** 2));
  const scaled = between * size > SCALE_RATIO * within;
  return groups.flatMap((logs, i) => (scaled ? logs.map((x) => x - means[i]!) : logs));
}

/**
 * This function gives the smooth law with the highest likelihood. The value of each law is the exact mean log density at its best
 * fit, from the closed form of that law. The laws with a fitted end have a benefit at small sizes, and the floor of 200 items keeps
 * the read over the sizes where the result is poor.
 */
function smoothLaw(logs: readonly number[]): AreaLaw {
  const areas = logs.map(Math.exp);
  const low = at(areas, 0);
  const meanArea = mean(areas);
  const meanLog = mean(logs);
  const toExact = 0.5 * Math.log(logs.length / (logs.length - 1));
  const logNormal = -Math.log(sd(logs)) - HALF_LOG_2PI_E - meanLog + toExact;
  const alpha = 1 / (meanLog - Math.log(low));
  const scores: readonly (readonly [AreaLaw, number])[] = [
    ["uniform", -Math.log(at(areas, 1) - low)],
    ["normal", -Math.log(sd(areas)) - HALF_LOG_2PI_E + toExact],
    ["exponential", -Math.log(meanArea - low) - 1],
    ["log-normal", logNormal],
    ["pareto", Math.log(alpha) + alpha * Math.log(low) - (alpha + 1) * meanLog],
  ];
  return scores.reduce((best, score) => (score[1] > best[1] ? score : best))[0];
}

/** This function gives the area law of pooled inputs, from the item areas alone. */
export function areaLaw(inputs: readonly LawInput[]): AreaLaw {
  const logs = logAreas(inputs);
  const width = spread(logs);
  if (width <= SPREAD_IDENTICAL) return "identical";
  if (width <= SPREAD_NARROW_AREA) return "narrow";
  const modes = modeCount(logs);
  if (modes >= 3) return "multimodal";
  if (modes === 2) return "bimodal";
  return smoothLaw(logs);
}

/** This function counts the clusters of values and reports a cluster wider than the limit as 0. */
function ratioClusters(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  let clusters = 1;
  let start = sorted[0] ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    const x = sorted[i]!;
    if (x - sorted[i - 1]! > CLUSTER_GAP) {
      if (sorted[i - 1]! - start > CLUSTER_WIDTH) return 0;
      clusters++;
      start = x;
    }
  }
  return (sorted[sorted.length - 1] ?? 0) - start > CLUSTER_WIDTH ? 0 : clusters;
}

/** This function gives the aspect law of pooled inputs, from the item sides alone. */
export function aspectLaw(inputs: readonly LawInput[]): AspectLaw {
  const raw: number[] = [];
  const centered: number[] = [];
  const sides: number[] = [];
  for (const input of inputs) {
    const logs = input.boxes.map((b) => Math.log(b.w / b.h));
    const middle = median(logs);
    for (const x of logs) {
      raw.push(x);
      centered.push(x - middle);
    }
    for (const b of input.boxes) sides.push(Math.min(b.w, b.h));
  }
  // A side of whole units has a rounding error of 1 unit, so a small side widens the aspect of a fixed law.
  const whole = inputs.every((input) => input.boxes.every((b) => Number.isInteger(b.w) && Number.isInteger(b.h)));
  const noise = whole ? 2 / Math.max(median(sides), 1) : 0;
  const width = spread(centered);
  if (width <= SPREAD_IDENTICAL + noise) return "fixed";
  const clusters = ratioClusters(raw);
  if (clusters >= 2 && clusters <= MAX_RATIOS) return "discrete";
  const wideEachWay = share(raw, (x) => x >= EXTREME_ASPECT) >= 0.15 && share(raw, (x) => x <= -EXTREME_ASPECT) >= 0.15;
  if (wideEachWay && share(raw, (x) => Math.abs(x) < CENTRAL_ASPECT) <= 0.15) return "extreme-mixed";
  return width <= SPREAD_NARROW_ASPECT ? "narrow" : "wide";
}

/** This function tells if the areas of the items of an input fill a box of the container with no rest. */
function cutFromBox(input: LawInput): boolean {
  const total = input.boxes.reduce((sum, b) => sum + b.w * b.h, 0);
  const w = input.container?.w;
  const h = input.container?.h;
  if (w === undefined) return false;
  if (h !== undefined) return Math.abs(total - w * h) <= 1e-6 * w * h;
  const whole = Number.isInteger(w) && input.boxes.every((b) => Number.isInteger(b.w) && Number.isInteger(b.h));
  return whole && total % w === 0;
}

/**
 * This function gives the assortment of pooled inputs. The test of a cut reads the sum of the areas, because a test of a real
 * tiling is a packing problem. A cut needs each input to pass, so an open strip passes by chance with a share of 1/w per input.
 */
export function assortmentOf(inputs: readonly LawInput[]): Assortment {
  if (inputs.length >= 2 && inputs.every(cutFromBox)) return "cut-from-box";
  const few = inputs.filter((input) => {
    const types = new Set(input.boxes.map((b) => `${b.w}x${b.h}`)).size;
    return types <= MAX_TYPES && types * 4 <= input.boxes.length;
  });
  return few.length * 2 > inputs.length ? "few-types" : "all-differ";
}

/** This function gives the three laws of pooled inputs, or `undefined` under the floor of items. */
export function lawOf(inputs: readonly LawInput[]): LawCell | undefined {
  const items = inputs.reduce((sum, input) => sum + input.boxes.length, 0);
  if (items < MIN_POOLED_ITEMS) return undefined;
  return { area: areaLaw(inputs), aspect: aspectLaw(inputs), assortment: assortmentOf(inputs) };
}

/** One group of specs with the same laws. */
export interface LawCellCount extends LawCell {
  readonly specs: number;
  readonly generators: readonly string[];
}

/** The result of the read of a corpus. */
export interface LawCover {
  readonly schema: typeof LAW_COVER_SCHEMA;
  /** The pairs that some spec covers. */
  readonly covered: number;
  /** All the pairs. */
  readonly pairs: number;
  /** The specs that gave laws. */
  readonly specs: number;
  /** The specs under the floor of items. */
  readonly refused: number;
  /** The floor of items for a spec. */
  readonly floor: number;
  readonly cells: readonly LawCellCount[];
  /** The pairs that no spec covers, as `<law>+<law>`. */
  readonly missing: readonly string[];
}

/** This function gives the pairs of a cell. Each name has the dimension of each law, so 2 narrow laws stay apart. */
function pairsOf(cell: LawCell): string[] {
  return [`area:${cell.area}+aspect:${cell.aspect}`, `area:${cell.area}+assortment:${cell.assortment}`, `aspect:${cell.aspect}+assortment:${cell.assortment}`];
}

/** This function gives all the pairs of the three dimensions. */
function allPairs(): string[] {
  const out: string[] = [];
  for (const area of AREA_LAWS) for (const aspect of ASPECT_LAWS) out.push(`area:${area}+aspect:${aspect}`);
  for (const area of AREA_LAWS) for (const assortment of ASSORTMENTS) out.push(`area:${area}+assortment:${assortment}`);
  for (const aspect of ASPECT_LAWS) for (const assortment of ASSORTMENTS) out.push(`aspect:${aspect}+assortment:${assortment}`);
  return out;
}

/** One pool of inputs: all the seeds of one generator with one set of params, over all the corpora. */
export interface LawPool {
  readonly generator: string;
  readonly inputs: () => readonly LawInput[];
}

/** This function counts the pairs of pools. A pool generates its inputs only while the function reads it. */
export function lawCover(pools: readonly LawPool[]): LawCover {
  const cells = new Map<string, { cell: LawCell; specs: number; generators: Set<string> }>();
  const covered = new Set<string>();
  let specs = 0;
  let refused = 0;
  for (const pool of pools) {
    const cell = lawOf(pool.inputs());
    if (cell === undefined) {
      refused++;
      continue;
    }
    specs++;
    for (const pair of pairsOf(cell)) covered.add(pair);
    const key = `${cell.area}|${cell.aspect}|${cell.assortment}`;
    const entry = cells.get(key) ?? { cell, specs: 0, generators: new Set<string>() };
    entry.specs++;
    entry.generators.add(pool.generator);
    cells.set(key, entry);
  }
  const sortedCells = [...cells.keys()].sort().map((key) => {
    const { cell, specs: count, generators } = cells.get(key)!;
    return { ...cell, specs: count, generators: [...generators].sort() };
  });
  const missing = allPairs().filter((pair) => !covered.has(pair));
  return { schema: LAW_COVER_SCHEMA, covered: covered.size, pairs: LAW_PAIRS, specs, refused, floor: MIN_POOLED_ITEMS, cells: sortedCells, missing };
}

/** This function gives the key of a spec. The keys of the params are in order, so 2 corpora with one spec share a pool. */
function poolKey(name: string, version: number, params: GeneratorParams | undefined): string {
  const entries = Object.entries(params ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${name}@${version} ${JSON.stringify(entries)}`;
}

/** This function gives the pools of the committed corpora, one pool for each spec. A manifest with no specs holds its inputs in full, and the read leaves it out. */
export function corpusPools(): LawPool[] {
  const specs = new Map<string, { name: string; version: number; params: GeneratorParams | undefined; seeds: Set<number> }>();
  for (const manifest of readManifests(CORPORA_DIR)) {
    for (const spec of manifest.specs ?? []) {
      const key = poolKey(spec.generator, spec.version, spec.params);
      const entry = specs.get(key) ?? { name: spec.generator, version: spec.version, params: spec.params, seeds: new Set<number>() };
      for (const seed of spec.seeds) entry.seeds.add(seed);
      specs.set(key, entry);
    }
  }
  return [...specs.values()].map((spec) => ({
    generator: spec.name,
    inputs: (): readonly GeneratedInput[] => {
      const gen = generator(spec.name, spec.version);
      const params = gen.withDefaults(spec.params);
      return [...spec.seeds].map((seed) => gen.generate(seed, params, "law-cover"));
    },
  }));
}

/** The result in the site. A test compares it with the read. */
export const LAW_COVER_FILE: URL = new URL("../../site/data/law-cover.json", import.meta.url);

/** This function gives the bytes of a result. */
export const lawJson = (cover: LawCover): string => `${JSON.stringify(cover, null, 2)}\n`;

/** This function writes the result to the file of the site, or to the file of `--out`. */
function main(): void {
  const index = process.argv.indexOf("--out");
  writeFileSync(index < 0 ? fileURLToPath(LAW_COVER_FILE) : process.argv[index + 1]!, lawJson(lawCover(corpusPools())));
}

if (process.argv[1]?.endsWith("law-cover.ts")) main();
