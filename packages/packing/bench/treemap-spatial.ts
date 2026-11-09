// The check of the ordered and spatial treemaps of roadmap item k27 against Tables 1 to 3 of Wood and Dykes 2008.
// Table 1 has 100 nodes of one size. Table 2 has 100 log-normal sizes in the order of size. Table 3 has 100 log-normal
// sizes at Gaussian points. The paper does not give the frame of the tables. A square gives values in the bands of the
// three tables, and a frame of aspect 2, as in figure 5, does not. Thus the report uses a square. The output is a report, not a gate. The file `treemap-literature.ts` adds this report to its
// own. The file reads no clock, so the same arguments give the same bytes.

import type { Rect } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { leastSquares, mean } from "@mark1russell7/rigor-statistics";
import { treemapSliceDice, treemapSquarified, treemapStrip, type TreemapCell, type TreemapLayout } from "../src/treemap.ts";
import { treemapOrdered, treemapSpatial } from "../src/treemap-spatial.ts";
import { compared, meanAspectOf, readabilityOf, type Compared } from "./treemap-measures.ts";

/** The three measures of Tables 1 and 2 of the paper. */
export interface OrderMeasures {
  readonly aspect: number;
  readonly readability: number;
  readonly correlation: number;
}

/** The three measures of Table 3 of the paper. */
export interface PlaceMeasures {
  readonly aspect: number;
  readonly distance: number;
  readonly angle: number;
}

/** The methods with a published row in Tables 1 and 2. */
export type OrderMethod = "slice-dice" | "ordered" | "squarified" | "strip";

/** The values of Tables 1 and 2 of Wood and Dykes 2008, IEEE Transactions on Visualization and Computer Graphics 14(6). */
export const ORDER_TABLES: readonly { readonly table: string; readonly sizes: "equal" | "log-normal"; readonly rows: Readonly<Record<OrderMethod, OrderMeasures>> }[] = [
  {
    table: "1 (equal)",
    sizes: "equal",
    rows: {
      "slice-dice": { aspect: 99.02, readability: 1, correlation: 1 },
      ordered: { aspect: 1, readability: 0.02, correlation: 0.97 },
      squarified: { aspect: 1, readability: 0.66, correlation: 0.56 },
      strip: { aspect: 1, readability: 0.82, correlation: 0.57 },
    },
  },
  {
    table: "2 (log-normal)",
    sizes: "log-normal",
    rows: {
      "slice-dice": { aspect: 265.88, readability: 1, correlation: 0.86 },
      ordered: { aspect: 1.28, readability: 0.05, correlation: 0.86 },
      squarified: { aspect: 1.16, readability: 0.54, correlation: 0.81 },
      strip: { aspect: 1.27, readability: 0.84, correlation: 0.68 },
    },
  },
];

/** The row "Simulation, Spatial" of Table 3 of the paper. The paper has no row for the other arms of the report. */
export const PLACE_ROW: PlaceMeasures = { aspect: 2.66, distance: 0.21, angle: 24.3 };

/** The arms of Tables 1 and 2. The paper uses strip with the lookahead. */
export const ORDER_ARMS: readonly { readonly id: OrderMethod; readonly layout: TreemapLayout }[] = [
  { id: "slice-dice", layout: treemapSliceDice },
  { id: "ordered", layout: treemapOrdered },
  { id: "squarified", layout: treemapSquarified },
  { id: "strip", layout: (nodes, frame) => treemapStrip(nodes, frame) },
];

/** The bands of the report: a share of the published aspect, and absolute values for the readability and the correlation. */
export const ORDER_BANDS = { aspect: 0.15, readability: 0.1, correlation: 0.1 } as const;

/** The bands of Table 3: a share of the published aspect and distance, and degrees for the angle. */
export const PLACE_BANDS = { aspect: 0.15, distance: 0.25, angle: 5 } as const;

/** The square of the three tables. */
export const FRAME: Rect = { x: 0, y: 0, w: 100, h: 100 };

/** The count of the nodes in each trial, as in the paper. */
export const NODES = 100;

/**
 * This function gives the distance correlation of the paper. It is the `R^2` of a line fit. The y of the fit is the distance
 * of each center from the corner `(x, y)` of the frame. The x of the fit is the place of the cell in the list.
 */
export function distanceCorrelation(cells: readonly TreemapCell[], frame: Rect): number {
  const rows = cells.map((_, index) => [index]);
  const distances = cells.map((cell) => Math.hypot(cell.x + cell.w / 2 - frame.x, cell.y + cell.h / 2 - frame.y));
  return leastSquares(rows, distances).r2;
}

/** This function gives the points of a list scaled into a frame, as `treemapSpatial` maps them at the top level. */
function scaledPoints(points: readonly { readonly x: number; readonly y: number }[], frame: Rect): { x: number; y: number }[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return points.map((p) => ({
    x: maxX > minX ? frame.x + ((p.x - minX) / (maxX - minX)) * frame.w : frame.x + frame.w / 2,
    y: maxY > minY ? frame.y + ((p.y - minY) / (maxY - minY)) * frame.h : frame.y + frame.h / 2,
  }));
}

/**
 * This function gives `dispDIST` of equation 1 of the paper for a list with no levels. It is the mean distance from the
 * center of each cell to its scaled point. The function divides it by the square root of the area of the frame.
 */
export function distanceDisplacement(points: readonly { readonly x: number; readonly y: number }[], cells: readonly TreemapCell[], frame: Rect): number {
  const scaled = scaledPoints(points, frame);
  return mean(cells.map((cell, index) => Math.hypot(cell.x + cell.w / 2 - scaled[index]!.x, cell.y + cell.h / 2 - scaled[index]!.y))) / Math.sqrt(frame.w * frame.h);
}

/**
 * This function gives `dispANG` of equation 2 of the paper for a list with no levels, in degrees. Each pair gives the angle
 * between the vector of the two centers and the vector of the two points. The result is the sum of the angles over `n^2`.
 */
export function angularDisplacement(points: readonly { readonly x: number; readonly y: number }[], cells: readonly TreemapCell[]): number {
  const n = cells.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const a = cells[i]!;
      const b = cells[j]!;
      const ux = b.x + b.w / 2 - (a.x + a.w / 2);
      const uy = b.y + b.h / 2 - (a.y + a.h / 2);
      const vx = points[j]!.x - points[i]!.x;
      const vy = points[j]!.y - points[i]!.y;
      const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (lengths === 0) continue;
      sum += Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lengths)));
    }
  }
  return ((sum / (n * n)) * 180) / Math.PI;
}

/** One table and one arm of Tables 1 and 2. */
export interface OrderRow {
  readonly table: string;
  readonly arm: OrderMethod;
  readonly aspect: Compared;
  readonly readability: Compared;
  readonly correlation: Compared;
}

/** This function gives the rows of Tables 1 and 2 in a square. Table 1 has one trial, because its input does not change. */
export function orderRows(trials: number): OrderRow[] {
  const out: OrderRow[] = [];
  for (const table of ORDER_TABLES) {
    const count = table.sizes === "equal" ? 1 : trials;
    const scores = ORDER_ARMS.map(() => ({ aspect: [] as number[], readability: [] as number[], correlation: [] as number[] }));
    for (let trial = 0; trial < count; trial += 1) {
      const stream = random(`treemap-spatial:${table.table}:${trial}`);
      const weights = table.sizes === "equal" ? new Array<number>(NODES).fill(1) : Array.from({ length: NODES }, () => Math.exp(stream.normal(0, 1))).sort((a, b) => b - a);
      const nodes = weights.map((weight, index) => ({ id: `n${index}`, weight }));
      for (const [index, arm] of ORDER_ARMS.entries()) {
        const cells = arm.layout(nodes, FRAME);
        scores[index]!.aspect.push(meanAspectOf(cells));
        scores[index]!.readability.push(readabilityOf(cells));
        scores[index]!.correlation.push(distanceCorrelation(cells, FRAME));
      }
    }
    for (const [index, arm] of ORDER_ARMS.entries()) {
      const row = table.rows[arm.id];
      const score = scores[index]!;
      const key = `spatial:${table.table}:${arm.id}`;
      out.push({
        table: table.table,
        arm: arm.id,
        aspect: compared(score.aspect, row.aspect, `${key}:aspect`, (value, published) => Math.abs(value - published) <= ORDER_BANDS.aspect * published),
        readability: compared(score.readability, row.readability, `${key}:readability`, (value, published) => Math.abs(value - published) <= ORDER_BANDS.readability),
        correlation: compared(score.correlation, row.correlation, `${key}:correlation`, (value, published) => Math.abs(value - published) <= ORDER_BANDS.correlation),
      });
    }
  }
  return out;
}

/** One arm of Table 3. Only the arm `spatial` has a published row. */
export interface PlaceRow {
  readonly arm: string;
  readonly aspect: Compared;
  readonly distance: Compared;
  readonly angle: Compared;
}

/** This function gives the rows of Table 3: 100 log-normal sizes at Gaussian points in a square. Squarified is the control. */
export function placeRows(trials: number): PlaceRow[] {
  const frame = FRAME;
  const arms = ["spatial", "squarified"] as const;
  const scores = arms.map(() => ({ aspect: [] as number[], distance: [] as number[], angle: [] as number[] }));
  for (let trial = 0; trial < trials; trial += 1) {
    const stream = random(`treemap-spatial:3:${trial}`);
    const nodes = Array.from({ length: NODES }, (_, index) => ({ id: `n${index}`, weight: Math.exp(stream.normal(0, 1)), x: stream.normal(0, 1), y: stream.normal(0, 1) }));
    for (const [index, arm] of arms.entries()) {
      const cells = arm === "spatial" ? treemapSpatial(nodes, frame) : treemapSquarified(nodes, frame);
      scores[index]!.aspect.push(meanAspectOf(cells));
      scores[index]!.distance.push(distanceDisplacement(nodes, cells, frame));
      scores[index]!.angle.push(angularDisplacement(nodes, cells));
    }
  }
  return arms.map((arm, index) => {
    const row = arm === "spatial" ? PLACE_ROW : undefined;
    const score = scores[index]!;
    const key = `spatial:3:${arm}`;
    return {
      arm,
      aspect: compared(score.aspect, row?.aspect, `${key}:aspect`, (value, published) => Math.abs(value - published) <= PLACE_BANDS.aspect * published),
      distance: compared(score.distance, row?.distance, `${key}:distance`, (value, published) => Math.abs(value - published) <= PLACE_BANDS.distance * published),
      angle: compared(score.angle, row?.angle, `${key}:angle`, (value, published) => Math.abs(value - published) <= PLACE_BANDS.angle),
    };
  });
}

/** This function gives one cell of a Markdown table: the measured value, its interval, the published value and the verdict. */
function cellOf(value: Compared): string {
  const f = (n: number): string => n.toFixed(2);
  const against = value.published === null ? "no row" : `${f(value.published)} ${value.inBand === true ? "in" : "OUT"}`;
  return `${f(value.measured)} [${f(value.low)}, ${f(value.high)}] / ${against}`;
}

/** This function gives the Markdown report of the rows of the three tables. */
export function spatialReportOf(order: readonly OrderRow[], place: readonly PlaceRow[], trials: number): string {
  const lines = [
    `## Ordered and spatial treemaps against Wood and Dykes 2008 (${trials} trials)`,
    "",
    `Each cell: measured [95 % interval over the trials] / published. Bands: aspect ${ORDER_BANDS.aspect * 100} %, readability ${ORDER_BANDS.readability} and correlation ${ORDER_BANDS.correlation} absolute.`,
    "Table 1 has one trial, because its input does not change. Its interval has no width.",
    "",
    "| Table | Arm | Aspect | Readability | Distance correlation |",
    "|---|---|---|---|---|",
    ...order.map((row) => `| ${row.table} | ${row.arm} | ${cellOf(row.aspect)} | ${cellOf(row.readability)} | ${cellOf(row.correlation)} |`),
    "",
    `Table 3: ${NODES} log-normal sizes at Gaussian points in a square. Bands: aspect ${PLACE_BANDS.aspect * 100} %, distance ${PLACE_BANDS.distance * 100} %, angle ${PLACE_BANDS.angle} degrees.`,
    "",
    "| Arm | Aspect | dispDIST | dispANG (degrees) |",
    "|---|---|---|---|",
    ...place.map((row) => `| ${row.arm} | ${cellOf(row.aspect)} | ${cellOf(row.distance)} | ${cellOf(row.angle)} |`),
  ];
  return `${lines.join("\n")}\n`;
}
