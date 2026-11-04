// The bench of roadmap item k92: the density cost of the cell side, and a comparison with published values on shared instances.
// It is a separate program. The workflow `raster-nofit.yml` starts it in CI. The instance files stay out of this repository.
//
//   node bench/raster-nofit.ts --out <file.json> [--instances <dir>] [--seeds 30] [--trials 64] [--instance-trials 1024]
//
// The made-up family `raster-k92` measures the cost of the cell side. Each input has star shapes, boxes and circles.
// The published values are the expected densities of Table 2 of Gardeyn, Vanden Berghe and Wauters (2025, arXiv 2509.13329, CC BY 4.0).
// The values for ROMA (Sato 2019) are the values that this table copies. Mundim 2017 and Sato 2019 have no free full text, so this bench reads neither.
// The instance files of that table are the ESICUP sets (CC0). The workflow fetches their common JSON form from the repository of the table.

import fs from "node:fs";
import path from "node:path";
import { regionArea, stepRandom, turnBox, type LayoutContainer, type Region } from "@mark1russell7/layout-contract";
import { packRasterNofit, type Item, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { mean, quantile } from "@mark1russell7/rigor-statistics";

/** The cell sides of the family, as divisors of the mean box side. */
export const CELL_DIVISORS: readonly number[] = [8, 16, 32];

/** The cell sides of the instances, as divisors of the strip width. */
export const INSTANCE_DIVISORS: readonly number[] = [40, 80, 160];

/** One row of the table: an expected density in percent for each method. A missing method has no value in the table. */
export interface PublishedRow {
  readonly sparrow: number;
  readonly roma: number;
  readonly ps: number;
}

/** The expected densities of Table 2 of Gardeyn 2025. `sparrow` has 100 runs of 20 minutes, and `ps` has one run under the same limit. */
export const PUBLISHED: Readonly<Record<string, PublishedRow>> = Object.freeze({
  albano: { sparrow: 89.47, roma: 87.55, ps: 84.95 },
  dagli: { sparrow: 89.26, roma: 87.5, ps: 84.17 },
  fu: { sparrow: 92.24, roma: 91.95, ps: 90.39 },
  jakobs1: { sparrow: 89.09, roma: 89.09, ps: 81.67 },
  jakobs2: { sparrow: 84.77, roma: 83.56, ps: 80.42 },
  mao: { sparrow: 86.14, roma: 83.76, ps: 75.94 },
  marques: { sparrow: 90.93, roma: 89.97, ps: 85.48 },
  shapes0: { sparrow: 68.6, roma: 68.73, ps: 66.5 },
  shapes1: { sparrow: 75.69, roma: 75.86, ps: 72.55 },
  shirts: { sparrow: 89.66, roma: 87.62, ps: 85.99 },
  swim: { sparrow: 78.26, roma: 74.29, ps: 71.44 },
  trousers: { sparrow: 91.73, roma: 90.48, ps: 89.3 },
});

/** One instance, as a pack input. */
export interface Instance {
  readonly name: string;
  readonly input: PackInput;
  /** The turns of the file: `same` tells that this pack has each turn of the file. `fewer` tells that it has only a part of them. */
  readonly turns: "same" | "fewer";
}

/** The fields of an instance file that this bench reads. */
interface InstanceFile {
  readonly strip_height: number;
  readonly items: readonly {
    readonly demand: number;
    readonly orientation: { readonly rotation: { readonly angles: readonly number[] } };
    readonly shape: { readonly data: readonly (readonly [number, number])[] };
  }[];
}

/**
 * This function gives the pack input of one instance file. The strip of the file has a free length on the x axis.
 * This function swaps the two axes of all shapes, so the free length is on the y axis. It also moves each shape to the origin of its box.
 * A layout of the swapped shapes, swapped back, is a layout of the file.
 *
 * The pack has the turn of 90 degrees only. That turn is valid only when the file lists each multiple of 90 degrees.
 */
export function instanceInput(name: string, text: string): Instance {
  const file = JSON.parse(text) as InstanceFile;
  const items: Item[] = [];
  let turns: Instance["turns"] = "same";
  file.items.forEach((entry, type) => {
    const { angles } = entry.orientation.rotation;
    const turnable = angles.includes(90) && angles.includes(270);
    if (angles.length > 1) turns = "fewer";
    const ring = entry.shape.data.slice(0, -1);
    const x0 = Math.min(...ring.map((p) => p[1]));
    const y0 = Math.min(...ring.map((p) => p[0]));
    const points = ring.map(([x, y]): [number, number] => [y - x0, x - y0]);
    const shape: Region = { kind: "polygon", points };
    const w = Math.max(...points.map((p) => p[0]));
    const h = Math.max(...points.map((p) => p[1]));
    for (let i = 0; i < entry.demand; i++) items.push({ id: `t${type}.${i}`, w, h, shape, ...(turnable ? { turnable } : {}) });
  });
  const container: LayoutContainer = { w: file.strip_height, fixed: "width" };
  return { name, input: { container, items }, turns };
}

/** This function gives a closed star shape with 5 to 9 points. */
function starItem(id: string, r: () => number): Item {
  const n = 5 + Math.floor(r() * 5);
  const size = 2 + r() * 6;
  const points = Array.from({ length: n }, (_, i): [number, number] => {
    const angle = ((i + 0.2 + r() * 0.6) * 2 * Math.PI) / n;
    const radius = size * (i % 2 === 0 ? 1 : 0.5 + 0.4 * r());
    return [size + radius * Math.cos(angle), size + radius * Math.sin(angle)];
  });
  return { id, w: 2 * size, h: 2 * size, shape: { kind: "polygon", points } };
}

/**
 * This function gives one made-up input of the family `raster-k92`: stars, boxes and circles in a strip.
 * The same seed and count give the same input. The width is 1.3 times the root of the box area.
 */
export function rasterFamily(seed: number, count: number): PackInput {
  const r = stepRandom(seed, "raster-k92");
  const items = Array.from({ length: count }, (_, i): Item => {
    const id = `i${i}`;
    if (i % 3 === 0) return starItem(id, r);
    if (i % 3 === 1) return { id, w: 2 + r() * 10, h: 2 + r() * 10 };
    const radius = 1 + r() * 5;
    return { id, w: 2 * radius, h: 2 * radius, shape: { kind: "circle", cx: radius, cy: radius, r: radius } };
  });
  const area = items.reduce((sum, i) => sum + i.w * i.h, 0);
  return { container: { w: Math.ceil(Math.sqrt(area) * 1.3), fixed: "width" }, items };
}

/** This function gives the area of the shape of an item. */
function itemArea(item: Item): number {
  return item.shape === undefined ? item.w * item.h : regionArea(item.shape);
}

/** This function gives the density of a pack in percent: the area of the items over the area of the strip, as in Gardeyn 2025. */
export function densityOf(input: PackInput, output: PackOutput): number {
  const placed = new Set(output.placements.map((p) => p.id));
  const area = input.items.filter((i) => placed.has(i.id)).reduce((sum, i) => sum + itemArea(i), 0);
  return (100 * area) / (output.size.w * output.size.h);
}

/** This function gives the world points of a placed polygon. */
function placedRing(item: Item, p: PackOutput["placements"][number]): readonly (readonly [number, number])[] {
  const shape = (p.turn === 90 ? turnBox(item) : item).shape;
  return shape?.kind === "polygon" ? shape.points.map(([x, y]) => [x + p.x, y + p.y] as const) : [];
}

/** A world point of a placed ring. */
type Spot = readonly [number, number];

/** This audit counts a contact closer than this distance as a touch. It is far over the float error of the coordinates of the instances. */
const AUDIT_TOUCH = 1e-9;

/** This function gives the signed area of `a`, `b`, `v`, over the length of `a` to `b`. The value is a signed distance of `v` from the line. */
function offLine(a: Spot, b: Spot, v: Spot): number {
  return ((b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** This function tells if two segments cross at a point well inside each of them. */
function properCross(a: Spot, b: Spot, c: Spot, d: Spot): boolean {
  const [ca, da, ac, bc] = [offLine(a, b, c), offLine(a, b, d), offLine(c, d, a), offLine(c, d, b)];
  const apart = (p: number, q: number): boolean => (p > AUDIT_TOUCH && q < -AUDIT_TOUCH) || (p < -AUDIT_TOUCH && q > AUDIT_TOUCH);
  return apart(ca, da) && apart(ac, bc);
}

/** This function tells if a point is inside a ring and off its border. */
function wellInside(p: Spot, ring: readonly Spot[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    const clamped = Math.min(1, Math.max(0, t));
    if (Math.hypot(a[0] + clamped * (b[0] - a[0]) - p[0], a[1] + clamped * (b[1] - a[1]) - p[1]) <= AUDIT_TOUCH) return false;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) inside = !inside;
  }
  return inside;
}

/** This function gives points of a ring: its corners, the middle of each edge, and one point inside it on a line across its height. */
function probes(ring: readonly Spot[]): Spot[] {
  const y = (Math.min(...ring.map((p) => p[1])) + Math.max(...ring.map((p) => p[1]))) / 2 + AUDIT_TOUCH * 3;
  const xs = ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return a[1] > y !== b[1] > y ? [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])] : [];
  });
  xs.sort((p, q) => p - q);
  const middles = ring.map((a, i): Spot => [(a[0] + ring[(i + 1) % ring.length]![0]) / 2, (a[1] + ring[(i + 1) % ring.length]![1]) / 2]);
  return [...ring, ...middles, [(xs[0]! + xs[1]!) / 2, y]];
}

/**
 * This function counts the pairs of placed polygons that overlap. It is an audit that does not read a grid.
 * A pair overlaps with a proper edge crossing, or with a probe point of one ring well inside the other ring.
 * The exact test of `src/raster-nofit.test.ts` is the proof on made-up shapes, and this float count guards the published instances.
 */
export function crossingPairs(input: PackInput, output: PackOutput): number {
  const byId = new Map(input.items.map((i) => [i.id, i]));
  const rings = output.placements.map((p) => placedRing(byId.get(p.id)!, p)).filter((ring) => ring.length > 2);
  const points = rings.map(probes);
  let pairs = 0;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const a = rings[i]!;
      const b = rings[j]!;
      const crossed = a.some((p, k) => b.some((q, m) => properCross(p, a[(k + 1) % a.length]!, q, b[(m + 1) % b.length]!)));
      if (crossed || points[i]!.some((p) => wellInside(p, b)) || points[j]!.some((p) => wellInside(p, a))) pairs++;
    }
  }
  return pairs;
}

/** One measured pack. */
export interface RasterRow {
  name: string;
  divisor: number;
  cell: number;
  trials: number;
  density: number;
  coverShare: number;
  crossings: number;
  ms: number;
  overflow: number;
}

/** This function packs one input and measures it. */
export function measureRow(name: string, input: PackInput, wanted: number, divisor: number, trials: number, seed: number): RasterRow {
  const start = performance.now();
  const output = packRasterNofit(input, { cell: wanted, trials, seed });
  const ms = Math.round(performance.now() - start);
  const measures = output.trace?.[0]?.measures ?? {};
  return {
    name,
    divisor,
    cell: measures["raster.cell"] ?? wanted,
    trials: measures["raster.trials"] ?? trials,
    density: densityOf(input, output),
    coverShare: measures["raster.coverShare"] ?? 0,
    crossings: crossingPairs(input, output),
    ms,
    overflow: output.overflow.length,
  };
}

/** The cost summary of one cell divisor: medians over the seeds, and the paired density gain of the finest cell. */
export interface CellCost {
  divisor: number;
  medianDensity: number;
  medianCoverShare: number;
  meanMs: number;
  /** The median over the seeds of `density(finest) / density(this divisor) - 1`. */
  medianGainOfFinest: number;
}

/** This function gives the cost summary of each cell divisor over the seeds of the family. */
export function cellCosts(rows: readonly RasterRow[]): CellCost[] {
  const finest = Math.max(...rows.map((r) => r.divisor));
  const best = new Map(rows.filter((r) => r.divisor === finest).map((r) => [r.name, r.density]));
  return [...new Set(rows.map((r) => r.divisor))].map((divisor): CellCost => {
    const own = rows.filter((r) => r.divisor === divisor);
    return {
      divisor,
      medianDensity: quantile(own.map((r) => r.density), 0.5),
      medianCoverShare: quantile(own.map((r) => r.coverShare), 0.5),
      meanMs: mean(own.map((r) => r.ms)),
      medianGainOfFinest: quantile(own.map((r) => best.get(r.name)! / r.density - 1), 0.5),
    };
  });
}

/** This function gives the value of a flag of the command line. */
function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

/** This function gives the mean box side of an input. */
function meanSide(input: PackInput): number {
  return mean(input.items.flatMap((i) => [i.w, i.h]));
}

/** The program: it writes one JSON file, and prints one line for each row of the summary. */
function main(args: readonly string[]): void {
  const out = flag(args, "--out");
  if (out === undefined) throw new Error("Give --out <file>.");
  const seeds = Number(flag(args, "--seeds") ?? 30);
  const trials = Number(flag(args, "--trials") ?? 64);
  const instanceTrials = Number(flag(args, "--instance-trials") ?? 1024);
  const family: RasterRow[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const input = rasterFamily(seed, 30);
    for (const divisor of CELL_DIVISORS) family.push(measureRow(`s${seed}`, input, meanSide(input) / divisor, divisor, trials, seed));
  }
  const costs = cellCosts(family);
  for (const c of costs) console.log(JSON.stringify(c));
  const dir = flag(args, "--instances");
  const instances: (RasterRow & { turns: string; published?: PublishedRow })[] = [];
  for (const file of dir === undefined ? [] : fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const { name, input, turns } = instanceInput(path.basename(file, ".json"), fs.readFileSync(path.join(dir!, file), "utf8"));
    for (const divisor of INSTANCE_DIVISORS) {
      const row = measureRow(name, input, input.container.w! / divisor, divisor, instanceTrials, 1);
      const published = PUBLISHED[name];
      instances.push({ ...row, turns, ...(published === undefined ? {} : { published }) });
      console.log(JSON.stringify(instances.at(-1)));
    }
  }
  fs.writeFileSync(out, `${JSON.stringify({ seeds, trials, instanceTrials, costs, family, instances }, null, 1)}\n`);
}

if (process.argv[1]?.endsWith("raster-nofit.ts")) main(process.argv.slice(2));
