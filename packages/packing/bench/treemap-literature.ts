// The check of the treemaps of roadmap item k27 against Tables I to III of Bederson, Shneiderman, Wattenberg 2002.
// It repeats the Monte Carlo trials of section 2.3.2 of that paper on made-up data: a log-normal start and a log-normal
// random walk, in a square of side 100. The spiral of Tu and Shen 2007 (roadmap item k29) has no row in that paper, so the
// report compares it with strip on the same trials. The report also has the section of `treemap-spatial.ts`: the ordered and
// spatial treemaps against Wood and Dykes 2008. The output is a report, not a gate. The workflow `treemap-literature.yml` starts
// this file. The file reads no clock, so the same arguments give the same bytes.

import fs from "node:fs";
import path from "node:path";
import type { Rect } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { mean } from "@mark1russell7/rigor-statistics";
import { treemapPivotSplit, treemapSliceDice, treemapSpiral, treemapSquarified, treemapStrip, type TreemapCell, type TreemapLayout, type TreemapNode } from "../src/treemap.ts";
import { compared, meanAspectOf, readabilityOf, type Compared } from "./treemap-measures.ts";
import { orderRows, placeRows, spatialReportOf } from "./treemap-spatial.ts";

export { compared, meanAspectOf, readabilityOf, type Compared } from "./treemap-measures.ts";

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

/** This function gives the layout distance change: the mean Euclidean distance of the `(x, y, w, h)` of each pair of cells. */
export function layoutChange(before: readonly Rect[], after: readonly Rect[]): number {
  return mean(before.map((a, index) => {
    const b = after[index]!;
    return Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h);
  }));
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

/** One row of the report. */
export interface LiteratureRow {
  readonly walk: string;
  readonly table: string;
  readonly arm: string;
  readonly aspect: Compared;
  readonly change: Compared;
  readonly readability: Compared;
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

/** This function gives the Markdown report of the rows. */
export function reportOf(rows: readonly LiteratureRow[], trials: number, steps: number): string {
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
  // Wood and Dykes 2008 take the mean of 1,000 trials, thus the spatial section has its own count.
  const spatialTrials = countOf(args, "--spatial-trials", 1000);
  const order = orderRows(spatialTrials);
  const place = placeRows(spatialTrials);
  const report = `${reportOf(rows, trials, steps)}\n${spatialReportOf(order, place, spatialTrials)}`;
  const at = args.indexOf("--out");
  if (at !== -1) {
    const out = args[at + 1]!;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "treemap-literature.json"), `${JSON.stringify({ trials, steps, rows, spiral: spiralRows(rows), spatialTrials, order, place }, null, 2)}\n`);
    fs.writeFileSync(path.join(out, "treemap-literature.md"), report);
  }
  process.stdout.write(report);
}
