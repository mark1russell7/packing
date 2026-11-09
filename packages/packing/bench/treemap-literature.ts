// The check of the treemaps of roadmap item k27 against Tables I to III of Bederson, Shneiderman, Wattenberg 2002.
// It repeats the Monte Carlo trials of section 2.3.2 of that paper on made-up data: a log-normal start and a log-normal
// random walk, in a square of side 100. The spiral of Tu and Shen 2007 (roadmap item k29) has no row in that paper, so the
// report compares it with strip on the same trials. The quantum strip treemap of section 3 of the paper gets the trials of
// figures 13 and 14: 100 groups with uniform counts. The output is a report, not a gate. The workflow `treemap-literature.yml` starts
// this file. The file reads no clock, so the same arguments give the same bytes.

import fs from "node:fs";
import path from "node:path";
import type { Rect } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { bootstrap, mean } from "@mark1russell7/rigor-statistics";
import { treemapPivotSplit, treemapSliceDice, treemapSpiral, treemapSquarified, treemapStrip, type TreemapCell, type TreemapLayout, type TreemapNode } from "../src/treemap.ts";
import { treemapQuantum, type QuantumLayout } from "../src/treemap-quantum.ts";

/** The three measures of the paper. */
export interface TreemapMeasures {
  readonly aspect: number;
  readonly change: number;
  readonly readability: number;
}

/** The methods with a published row. */
export type PublishedMethod = "slice-dice" | "squarified" | "strip" | "pivot-split";

/** One table of the paper: the fan-out of each level of the tree, and the published rows. */
export interface PublishedTable {
  readonly table: string;
  readonly levels: readonly number[];
  readonly rows: Readonly<Record<PublishedMethod, TreemapMeasures>>;
}

/** The values of the three log-normal tables of Bederson 2002, ACM Transactions on Graphics 21(4), page 843. */
export const PUBLISHED: readonly PublishedTable[] = [
  {
    table: "I (20x1)",
    levels: [20],
    rows: {
      "slice-dice": { aspect: 56.54, change: 0.52, readability: 1 },
      "pivot-split": { aspect: 2.8, change: 7.29, readability: 0.25 },
      strip: { aspect: 2.59, change: 4.98, readability: 0.6 },
      squarified: { aspect: 1.75, change: 10.1, readability: 0.12 },
    },
  },
  {
    table: "II (100x1)",
    levels: [100],
    rows: {
      "slice-dice": { aspect: 304, change: 0.25, readability: 1 },
      "pivot-split": { aspect: 2.91, change: 9.16, readability: 0.17 },
      strip: { aspect: 2.83, change: 7.01, readability: 0.77 },
      squarified: { aspect: 1.19, change: 14.82, readability: 0.03 },
    },
  },
  {
    table: "III (8x3)",
    levels: [8, 8, 8],
    rows: {
      "slice-dice": { aspect: 26.1, change: 0.46, readability: 1 },
      "pivot-split": { aspect: 3, change: 2.37, readability: 0.35 },
      strip: { aspect: 2.83, change: 1.09, readability: 0.51 },
      squarified: { aspect: 1.74, change: 8.27, readability: 0.26 },
    },
  },
];

/**
 * The arms of the bench. The paper does not tell if its strip row has the lookahead, so both arms read that row. The arm
 * `spiral` has no published row.
 */
export const ARMS: readonly { readonly id: string; readonly row?: PublishedMethod; readonly layout: TreemapLayout }[] = [
  { id: "slice-dice", row: "slice-dice", layout: treemapSliceDice },
  { id: "squarified", row: "squarified", layout: treemapSquarified },
  { id: "strip", row: "strip", layout: (nodes, frame) => treemapStrip(nodes, frame) },
  { id: "strip-no-lookahead", row: "strip", layout: (nodes, frame) => treemapStrip(nodes, frame, { lookahead: false }) },
  { id: "pivot-split", row: "pivot-split", layout: treemapPivotSplit },
  { id: "spiral", layout: treemapSpiral },
];

/** The bands of the prediction `packing-k27-treemaps-first`: a share of the published value, or an absolute value for readability. */
export const BANDS = { aspect: 0.15, change: 0.25, readability: 0.1 } as const;

/**
 * The limit of the prediction `packing-k29-spiral-treemap` on the mean aspect of spiral against strip. The other two limits
 * are a change at most that of strip, and a readability at least that of strip.
 */
export const SPIRAL_LIMITS = { aspect: 1.25 } as const;

/**
 * The two readings of the walk of section 2.3.2. The text of the paper tells a variance of 0.05 for the log of each step.
 * The Change column of its tables is near a standard deviation of 0.05. Thus the report has a row for each reading.
 */
export const WALKS: readonly { readonly id: string; readonly sd: number }[] = [
  { id: "variance-0.05", sd: Math.sqrt(0.05) },
  { id: "sd-0.05", sd: 0.05 },
];

/** The square of the paper. */
const FRAME: Rect = { x: 0, y: 0, w: 100, h: 100 };

/** The angle in radians above which a turn of the scan path counts (section 2.3.1). */
const TURN_ANGLE = 0.1;

/** This function gives the unweighted mean aspect of the cells. */
export function meanAspectOf(cells: readonly Rect[]): number {
  return mean(cells.map((cell) => Math.max(cell.w / cell.h, cell.h / cell.w)));
}

/** This function gives the layout distance change: the mean Euclidean distance of the `(x, y, w, h)` of each pair of cells. */
export function layoutChange(before: readonly Rect[], after: readonly Rect[]): number {
  return mean(before.map((a, index) => {
    const b = after[index]!;
    return Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h);
  }));
}

/** This function gives the readability of one group of cells in the input order: 1 less the share of turns of the scan path. */
export function readabilityOf(cells: readonly Rect[]): number {
  const centers = cells.map((cell) => ({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }));
  let turns = 0;
  for (let i = 2; i < centers.length; i += 1) {
    const ax = centers[i - 1]!.x - centers[i - 2]!.x;
    const ay = centers[i - 1]!.y - centers[i - 2]!.y;
    const bx = centers[i]!.x - centers[i - 1]!.x;
    const by = centers[i]!.y - centers[i - 1]!.y;
    if (Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) > TURN_ANGLE) turns += 1;
  }
  return 1 - turns / cells.length;
}

/** This function gives the readability of a layout: the mean over the groups of leaves, each of `groupSize` cells. */
function layoutReadability(cells: readonly TreemapCell[], groupSize: number): number {
  const scores: number[] = [];
  for (let start = 0; start < cells.length; start += groupSize) scores.push(readabilityOf(cells.slice(start, start + groupSize)));
  return mean(scores);
}

/** This function gives the tree of a list of weights, for the fan-out of each level. */
export function treeOf(weights: readonly number[], levels: readonly number[]): TreemapNode[] {
  let next = 0;
  const level = (depth: number, prefix: string): TreemapNode[] => {
    const nodes: TreemapNode[] = [];
    for (let i = 0; i < levels[depth]!; i += 1) {
      const id = `${prefix}${i}`;
      if (depth === levels.length - 1) {
        nodes.push({ id, weight: weights[next]! });
        next += 1;
      } else {
        nodes.push({ id, children: level(depth + 1, `${id}.`) });
      }
    }
    return nodes;
  };
  return level(0, "");
}

/** One measured value against its published value. An arm with no published row has `null` in `published` and `inBand`. */
export interface Compared {
  readonly published: number | null;
  readonly measured: number;
  readonly low: number;
  readonly high: number;
  readonly inBand: boolean | null;
}

/** One row of the report. */
export interface LiteratureRow {
  readonly walk: string;
  readonly table: string;
  readonly arm: string;
  readonly aspect: Compared;
  readonly change: Compared;
  readonly readability: Compared;
}

/** This function gives the mean of the trials, with a 95 % bootstrap interval over the trials. */
function compared(trials: readonly number[], published: number | undefined, name: string, inBand: (measured: number, published: number) => boolean): Compared {
  const interval = bootstrap(trials, mean, { runs: 2000, seed: name });
  const verdict = published === undefined ? null : inBand(interval.estimate, published);
  return { published: published ?? null, measured: interval.estimate, low: interval.low, high: interval.high, inBand: verdict };
}

/** This function gives the rows of one table and one walk. Each arm reads the same trials, so the arms are paired. */
function tableRows(table: PublishedTable, walk: (typeof WALKS)[number], trials: number, steps: number): LiteratureRow[] {
  const count = table.levels.reduce((product, fan) => product * fan, 1);
  const groupSize = table.levels[table.levels.length - 1]!;
  const scores = ARMS.map(() => ({ aspect: [] as number[], change: [] as number[], readability: [] as number[] }));
  for (let trial = 0; trial < trials; trial += 1) {
    const stream = random(`treemap-literature:${walk.id}:${table.table}:${trial}`);
    const weights = Array.from({ length: count }, () => Math.exp(stream.normal(0, 1)));
    const last: (TreemapCell[] | undefined)[] = ARMS.map(() => undefined);
    const trialScores = ARMS.map(() => ({ aspect: [] as number[], change: [] as number[], readability: [] as number[] }));
    for (let step = 0; step < steps; step += 1) {
      const nodes = treeOf(weights, table.levels);
      for (const [index, arm] of ARMS.entries()) {
        const cells = arm.layout(nodes, FRAME);
        const score = trialScores[index]!;
        score.aspect.push(meanAspectOf(cells));
        score.readability.push(layoutReadability(cells, groupSize));
        const before = last[index];
        if (before !== undefined) score.change.push(layoutChange(before, cells));
        last[index] = cells;
      }
      for (let i = 0; i < count; i += 1) weights[i] = weights[i]! * Math.exp(stream.normal(0, walk.sd));
    }
    for (const [index, score] of trialScores.entries()) {
      const total = scores[index]!;
      total.aspect.push(mean(score.aspect));
      total.readability.push(mean(score.readability));
      if (score.change.length > 0) total.change.push(mean(score.change));
    }
  }
  return ARMS.map((arm, index) => {
    const row = arm.row === undefined ? undefined : table.rows[arm.row];
    const score = scores[index]!;
    const key = `${walk.id}:${table.table}:${arm.id}`;
    return {
      walk: walk.id,
      table: table.table,
      arm: arm.id,
      aspect: compared(score.aspect, row?.aspect, `${key}:aspect`, (value, published) => Math.abs(value - published) <= BANDS.aspect * published),
      change: compared(score.change, row?.change, `${key}:change`, (value, published) => Math.abs(value - published) <= BANDS.change * published),
      readability: compared(score.readability, row?.readability, `${key}:readability`, (value, published) => Math.abs(value - published) <= BANDS.readability),
    };
  });
}

/** This function gives the rows of the report. The paper has 100 trials of 100 steps. */
export function literatureRows(trials: number, steps: number): LiteratureRow[] {
  return WALKS.flatMap((walk) => PUBLISHED.flatMap((table) => tableRows(table, walk, trials, steps)));
}

/** This function gives one cell of the Markdown table: the measured value, its interval, the published value and the verdict. */
function cellOf(value: Compared): string {
  const f = (n: number): string => n.toFixed(2);
  const against = value.published === null ? "no row" : `${f(value.published)} ${value.inBand === true ? "in" : "OUT"}`;
  return `${f(value.measured)} [${f(value.low)}, ${f(value.high)}] / ${against}`;
}

/** One table and one walk of spiral against strip, with the verdict of each limit of `SPIRAL_LIMITS`. */
export interface SpiralRow {
  readonly walk: string;
  readonly table: string;
  readonly aspectRatio: number;
  readonly changeRatio: number;
  readonly readabilityGain: number;
  readonly aspectOk: boolean;
  readonly changeOk: boolean;
  readonly readabilityOk: boolean;
}

/** This function gives spiral against strip for each walk and table of the rows. The two arms read the same trials. */
export function spiralRows(rows: readonly LiteratureRow[]): SpiralRow[] {
  const out: SpiralRow[] = [];
  for (const spiral of rows.filter((row) => row.arm === "spiral")) {
    const strip = rows.find((row) => row.arm === "strip" && row.walk === spiral.walk && row.table === spiral.table);
    if (strip === undefined) continue;
    const aspectRatio = spiral.aspect.measured / strip.aspect.measured;
    const changeRatio = spiral.change.measured / strip.change.measured;
    const readabilityGain = spiral.readability.measured - strip.readability.measured;
    out.push({
      walk: spiral.walk,
      table: spiral.table,
      aspectRatio,
      changeRatio,
      readabilityGain,
      aspectOk: aspectRatio <= SPIRAL_LIMITS.aspect,
      changeOk: changeRatio <= 1,
      readabilityOk: readabilityGain >= 0,
    });
  }
  return out;
}

/** The ranges of the counts for the quantum trials. Each count is a whole number from 1 up to the range, with a uniform draw. */
export const QUANTUM_RANGES: readonly number[] = [10, 25, 100, 400, 1000];

/** The count of the groups in each quantum trial, as in figures 13 and 14 of the paper. */
export const QUANTUM_GROUPS = 100;

/** One range of counts of the quantum trials. The two arms read the same counts. */
export interface QuantumRow {
  readonly range: number;
  /** The mean aspect of the cells of `treemapQuantum`, in elements. */
  readonly quantumAspect: Compared;
  /** The mean aspect of the cells of `treemapStrip` with no lookahead, on the same counts. */
  readonly stripAspect: Compared;
  /** The empty elements of the cells of `treemapQuantum`, as a part of all the elements of the cells. */
  readonly wasted: Compared;
  /** The mean count in each trial of the groups that are alone in a strip of one row. */
  readonly lone: number;
  /** The mean aspect of the cells of the other groups. */
  readonly otherAspect: number;
}

/** This function gives the aspect of a quantum cell, the count of the lone groups of one row, and the aspect of the other cells. */
export function quantumAspects(layout: QuantumLayout): { readonly aspect: number; readonly lone: number; readonly otherAspect: number } {
  const inRow = new Map<number, number>();
  for (const cell of layout.cells) inRow.set(cell.y, (inRow.get(cell.y) ?? 0) + 1);
  const all: number[] = [];
  const others: number[] = [];
  for (const cell of layout.cells) {
    const aspect = Math.max(cell.cols / cell.rows, cell.rows / cell.cols);
    all.push(aspect);
    if (!(cell.rows === 1 && inRow.get(cell.y) === 1)) others.push(aspect);
  }
  return { aspect: mean(all), lone: all.length - others.length, otherAspect: others.length === 0 ? Number.NaN : mean(others) };
}

/** This function gives one row of the quantum trials for each range of `QUANTUM_RANGES`. */
export function quantumRows(trials: number): QuantumRow[] {
  return QUANTUM_RANGES.map((range) => {
    const quantum: number[] = [];
    const strip: number[] = [];
    const wasted: number[] = [];
    const lone: number[] = [];
    const others: number[] = [];
    for (let trial = 0; trial < trials; trial += 1) {
      const stream = random(`treemap-literature:quantum:${range}:${trial}`);
      const items = Array.from({ length: QUANTUM_GROUPS }, (_, i) => ({ id: `g${i}`, count: 1 + Math.floor(stream.next() * range) }));
      const layout = treemapQuantum(items, FRAME);
      const read = quantumAspects(layout);
      quantum.push(read.aspect);
      lone.push(read.lone);
      if (!Number.isNaN(read.otherAspect)) others.push(read.otherAspect);
      const total = items.reduce((sum, item) => sum + item.count, 0);
      const elements = layout.cells.reduce((sum, cell) => sum + cell.cols * cell.rows, 0);
      wasted.push((elements - total) / elements);
      strip.push(meanAspectOf(treemapStrip(items.map((item) => ({ id: item.id, weight: item.count })), FRAME, { lookahead: false })));
    }
    const key = `quantum:${range}`;
    const none = (): boolean => false;
    return {
      range,
      quantumAspect: compared(quantum, undefined, `${key}:aspect`, none),
      stripAspect: compared(strip, undefined, `${key}:strip`, none),
      wasted: compared(wasted, undefined, `${key}:wasted`, none),
      lone: mean(lone),
      otherAspect: others.length === 0 ? Number.NaN : mean(others),
    };
  });
}

/** This function gives the Markdown report of the rows, and of the quantum rows when there are some. */
export function reportOf(rows: readonly LiteratureRow[], trials: number, steps: number, quantum: readonly QuantumRow[] = []): string {
  const lines = [
    `# Treemaps against Bederson 2002, Tables I to III (${trials} trials of ${steps} steps)`,
    "",
    `Each cell: measured [95 % interval over the trials] / published. Bands: aspect ${BANDS.aspect * 100} %, change ${BANDS.change * 100} %, readability ${BANDS.readability} absolute.`,
    "",
    "| Walk | Table | Arm | Aspect | Change | Readability |",
    "|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.walk} | ${row.table} | ${row.arm} | ${cellOf(row.aspect)} | ${cellOf(row.change)} | ${cellOf(row.readability)} |`),
  ];
  const spiral = spiralRows(rows);
  if (spiral.length > 0) {
    const verdict = (ok: boolean): string => (ok ? "ok" : "OVER");
    lines.push(
      "",
      "## Spiral against strip",
      "",
      `Limits: aspect at most ${SPIRAL_LIMITS.aspect} times strip, change at most strip, readability at least strip.`,
      "",
      "| Walk | Table | Aspect / strip | Change / strip | Readability - strip |",
      "|---|---|---|---|---|",
      ...spiral.map((row) => `| ${row.walk} | ${row.table} | ${row.aspectRatio.toFixed(3)} ${verdict(row.aspectOk)} | ${row.changeRatio.toFixed(3)} ${verdict(row.changeOk)} | ${row.readabilityGain.toFixed(3)} ${verdict(row.readabilityOk)} |`),
    );
  }
  if (quantum.length > 0) {
    const f = (value: Compared): string => `${value.measured.toFixed(2)} [${value.low.toFixed(2)}, ${value.high.toFixed(2)}]`;
    lines.push(
      "",
      "## Quantum strip against strip (figures 13 and 14)",
      "",
      `Each trial has ${QUANTUM_GROUPS} groups, with uniform counts from 1 up to the range. The strip arm has no lookahead. The empty elements are a part of all the elements of the cells.`,
      "A lone group is alone in a strip of one row. Step 6 of the paper gives it the width of the widest strip.",
      "",
      "| Counts | Quantum aspect | Strip aspect | Empty elements | Lone groups per trial | Aspect of the other groups |",
      "|---|---|---|---|---|---|",
      ...quantum.map((row) => `| 1 to ${row.range} | ${f(row.quantumAspect)} | ${f(row.stripAspect)} | ${f(row.wasted)} | ${row.lone.toFixed(2)} | ${row.otherAspect.toFixed(2)} |`),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** This function gives the whole number that follows a flag, or the default. */
function countOf(args: readonly string[], flag: string, fallback: number): number {
  const at = args.indexOf(flag);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < 2) throw new RangeError(`${flag} needs a whole number of 2 or more.`);
  return value;
}

if (process.argv[1]?.endsWith("treemap-literature.ts") === true) {
  const args = process.argv.slice(2);
  const trials = countOf(args, "--trials", 100);
  const steps = countOf(args, "--steps", 100);
  const rows = literatureRows(trials, steps);
  const quantum = quantumRows(trials);
  const report = reportOf(rows, trials, steps, quantum);
  const at = args.indexOf("--out");
  if (at !== -1) {
    const out = args[at + 1]!;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "treemap-literature.json"), `${JSON.stringify({ trials, steps, rows, spiral: spiralRows(rows), quantum }, null, 2)}\n`);
    fs.writeFileSync(path.join(out, "treemap-literature.md"), report);
  }
  process.stdout.write(report);
}
