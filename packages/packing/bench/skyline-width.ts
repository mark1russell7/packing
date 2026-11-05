// The read of roadmap items k167 and k170: the time of `skyline` against the width of the input in units, at a fixed count of items.
// It is a separate program. It scales each input by a factor. The arms `maxrects-bl` and `rows` have no cells, and `coarse-cells` is
// the control of the measure: it gets a flat time from a worse pack. With `--base`, it times the same entry of that checkout at scale 1.
//
//   node bench/skyline-width.ts --out <file.json> [--scales 1,4,16,64] [--counts 10,100,1000] [--seeds 11,12,13,14,15] [--base <folder>]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { corpus, packWith, toPackInput, type PackInput, type PackOutput } from "../src/index.ts";
import { fillOf } from "../src/measures.ts";
import { interleavedOrder, pairedPack, timeRuns, traceSum } from "./run.ts";

/** One arm of the read: its name in the rows and the entry that it packs. The arm `rows-aa` gives the noise of the run. */
export interface WidthArm {
  readonly name: string;
  readonly entry: string;
  /** This field replaces the pack of the entry. The control and the base arm use it. */
  readonly pack?: (input: PackInput, seed: number) => PackOutput;
  /** With this field, the arm packs only at scale 1. */
  readonly scaleOne?: true;
}

/** The count of cells on one side of a square with the area of all the boxes, for the control `coarse-cells`. */
export const COARSE_SIDE = 32;

/** This function gives the length of one coarse cell of an input. */
export function coarseUnit(input: PackInput): number {
  let area = 0;
  for (const item of input.items) area += item.w * item.h;
  return Math.sqrt(area) / COARSE_SIDE;
}

/**
 * This function is the control of the measure. It packs in a fixed count of cells, with each box width rounded up to a whole cell.
 * So its time has no share of the width from any path of the code, and each rounded width costs fill.
 */
export function coarsePack(input: PackInput, seed: number): PackOutput {
  const unit = coarseUnit(input);
  const c = input.container;
  const small: PackInput = {
    ...input,
    container: { ...c, ...(c.w === undefined ? {} : { w: c.w / unit }), ...(c.h === undefined ? {} : { h: c.h / unit }) },
    items: input.items.map((item) => ({ ...item, w: Math.ceil(item.w / unit), h: item.h / unit })),
  };
  const output = packWith("skyline", small, undefined, seed);
  return {
    ...output,
    placements: output.placements.map((p) => ({ ...p, x: p.x * unit, y: p.y * unit })),
    size: { w: output.size.w * unit, h: output.size.h * unit },
  };
}

/**
 * The arms of the read. The arm `skyline` is the test. The arm `skyline-mw` keeps a cell for each unit of the width, because its
 * tolerance can pick a window away from a break. The arms `maxrects-bl` and `rows` have no cells.
 */
export const WIDTH_ARMS: readonly WidthArm[] = [
  { name: "skyline", entry: "skyline" },
  { name: "skyline-mw", entry: "skyline-mw" },
  { name: "coarse-cells", entry: "skyline", pack: coarsePack },
  { name: "maxrects-bl", entry: "maxrects-bl" },
  { name: "rows", entry: "rows" },
  { name: "rows-aa", entry: "rows" },
];

/** The container forms of the read: `freeHeight` is one pass at one width, and `freeArea` is the search over 48 widths. */
export const WIDTH_FORMS: readonly string[] = ["freeHeight", "freeArea"];

/** The size families of the read. */
export const WIDTH_SIZES: readonly string[] = ["uniform", "heavyTail"];

/** A pass over this time gets 1 timed pass and no warm-up in the next pairs of the same scale, as the bench budget does. */
const ONE_RUN_MS = 1000;

/** One timed pair of one arm. */
export interface WidthRow {
  readonly form: string;
  readonly sizes: string;
  readonly count: number;
  readonly scale: number;
  readonly seed: number;
  readonly arm: string;
  /** The median time of the timed passes of the pair, in milliseconds. */
  readonly ms: number;
  /** The count of timed passes. */
  readonly runs: number;
  /** The measure `pack.fill` of the output. */
  readonly fill: number;
  /** The count of widths that a search over the width tried. Without a search, it is 0. */
  readonly widths: number;
}

/** The read of one arm in one cell, over the scales with a row for each seed. */
export interface WidthLine {
  readonly form: string;
  readonly sizes: string;
  readonly count: number;
  readonly arm: string;
  /** The median time at each scale. */
  readonly ms: Readonly<Record<string, number>>;
  /** The largest scale with a row for each seed. */
  readonly largest: number;
  /** The slope of log time against log scale, per seed, from scale 1 to `largest`: the median, the lowest and the highest. */
  readonly slope: { readonly median: number; readonly low: number; readonly high: number };
  /** The share of the time at scale 1 that a line through scale 1 and `largest` gives to the width. */
  readonly widthShare: number;
  /** The median of `pack.fill` at each scale. */
  readonly fill: Readonly<Record<string, number>>;
  /** The median count of the tried widths at each scale. */
  readonly widths: Readonly<Record<string, number>>;
}

/** The time of one arm over the time of the base arm at scale 1, in one form, one size family and one count. */
export interface BaseLine {
  readonly form: string;
  readonly sizes: string;
  readonly count: number;
  readonly ratio: number;
}

/**
 * This function gives an input with each length times `scale`. An input with parts that it does not scale throws a `RangeError`.
 *
 * - The function scales the sizes of the items and of the container.
 * - The target aspect does not change, because it has no unit.
 */
export function scaleInput(input: PackInput, scale: number): PackInput {
  const c = input.container;
  if (c.shape !== undefined || c.inset !== undefined || (input.obstacles?.length ?? 0) > 0 || input.gap !== undefined || input.pairGaps !== undefined) {
    throw new RangeError("The read of the width scales only the sizes of items and of a plain container.");
  }
  return {
    ...input,
    container: {
      ...c,
      ...(c.w === undefined ? {} : { w: c.w * scale }),
      ...(c.h === undefined ? {} : { h: c.h * scale }),
    },
    items: input.items.map((item) => {
      if (item.margin !== undefined) throw new RangeError("The read of the width does not scale a margin.");
      return { ...item, w: item.w * scale, h: item.h * scale };
    }),
  };
}

/** This function gives the slope of log time against log scale between 2 points. */
export function logSlope(msLow: number, msHigh: number, scaleLow: number, scaleHigh: number): number {
  return Math.log(msHigh / msLow) / Math.log(scaleHigh / scaleLow);
}

/** This function gives the share of `msLow` that a line through the 2 points gives to the scale, from 0 to 1. */
export function widthShare(msLow: number, msHigh: number, scaleLow: number, scaleHigh: number): number {
  const perUnit = (msHigh - msLow) / (scaleHigh - scaleLow);
  return Math.min(1, Math.max(0, (perUnit * scaleLow) / msLow));
}

/** This function gives the lines of the rows, one for each form, size family, count and arm. */
export function widthLines(rows: readonly WidthRow[], seeds: readonly number[]): WidthLine[] {
  const groups = new Map<string, WidthRow[]>();
  for (const row of rows) {
    const key = [row.form, row.sizes, row.count, row.arm].join("/");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const lines: WidthLine[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const atScale = new Map<number, WidthRow[]>();
    for (const row of group) atScale.set(row.scale, [...(atScale.get(row.scale) ?? []), row]);
    const scales = [...atScale.keys()].sort((a, b) => a - b);
    const full = scales.filter((scale) => atScale.get(scale)!.length === seeds.length);
    const low = full[0];
    const largest = full[full.length - 1];
    if (low === undefined || largest === undefined || low === largest) continue;
    const ms = Object.fromEntries(scales.map((scale) => [String(scale), median(atScale.get(scale)!.map((row) => row.ms))]));
    const slopes = seeds.map((seed) => {
      const a = atScale.get(low)!.find((row) => row.seed === seed)!;
      const b = atScale.get(largest)!.find((row) => row.seed === seed)!;
      return logSlope(a.ms, b.ms, low, largest);
    });
    lines.push({
      form: first.form,
      sizes: first.sizes,
      count: first.count,
      arm: first.arm,
      ms,
      largest,
      slope: { median: median(slopes), low: Math.min(...slopes), high: Math.max(...slopes) },
      widthShare: widthShare(ms[String(low)]!, ms[String(largest)]!, low, largest),
      fill: Object.fromEntries(scales.map((scale) => [String(scale), median(atScale.get(scale)!.map((row) => row.fill))])),
      widths: Object.fromEntries(scales.map((scale) => [String(scale), median(atScale.get(scale)!.map((row) => row.widths))])),
    });
  }
  return lines;
}

/** This function gives the median per seed of the time of `arm` over the time of `base`, at scale 1. Each cell needs both arms. */
export function baseLines(rows: readonly WidthRow[], arm: string, base: string): BaseLine[] {
  const ones = rows.filter((row) => row.scale === 1);
  const lines: BaseLine[] = [];
  for (const row of ones) {
    if (row.arm !== base) continue;
    if (lines.some((l) => l.form === row.form && l.sizes === row.sizes && l.count === row.count)) continue;
    const cell = ones.filter((o) => o.form === row.form && o.sizes === row.sizes && o.count === row.count);
    const ratios = cell.filter((o) => o.arm === base).flatMap((b) => cell.filter((o) => o.arm === arm && o.seed === b.seed).map((o) => o.ms / b.ms));
    if (ratios.length > 0) lines.push({ form: row.form, sizes: row.sizes, count: row.count, ratio: median(ratios) });
  }
  return lines;
}

/** This function gives the table of the lines in Markdown. */
export function widthMarkdown(lines: readonly WidthLine[], scales: readonly number[], facts: string): string {
  const head = `| Form | Sizes | Items | Arm | ${scales.map((s) => `${s}x ms`).join(" | ")} | Slope (low to high) | Share of the width | Fill at ${scales[0]}x | Widths tried, ${scales[0]}x to ${scales[scales.length - 1]}x |`;
  const rule = `| ${[...Array(8 + scales.length).keys()].map(() => "---").join(" | ")} |`;
  const body = lines.map((l) => {
    const ms = scales.map((s) => {
      const value = l.ms[String(s)];
      return value === undefined ? "not run" : value.toFixed(2);
    });
    return `| ${l.form} | ${l.sizes} | ${l.count} | ${l.arm} | ${ms.join(" | ")} | ${l.slope.median.toFixed(2)} (${l.slope.low.toFixed(2)} to ${l.slope.high.toFixed(2)}) | ${l.widthShare.toFixed(2)} | ${(l.fill[String(scales[0])] ?? 0).toFixed(4)} | ${l.widths[String(scales[0])] ?? 0} to ${l.widths[String(scales[scales.length - 1])] ?? "not run"} |`;
  });
  return [`## The time of skyline against the width`, "", facts, "", head, rule, ...body, ""].join("\n");
}

/** This function parses a list of whole numbers. */
function numbers(text: string): number[] {
  return text.split(",").map((part) => Number(part));
}

/** This function packs the read and writes its record and its table. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      summary: { type: "string" },
      scales: { type: "string", default: "1,4,16,64" },
      counts: { type: "string", default: "10,100,1000" },
      seeds: { type: "string", default: "11,12,13,14,15" },
      repeats: { type: "string", default: "5" },
      "budget-ms": { type: "string", default: "20000" },
      "deadline-minutes": { type: "string", default: "30" },
      base: { type: "string" },
    },
  });
  if (values.out === undefined) throw new RangeError("The option --out is necessary.");
  const scales = numbers(values.scales);
  const counts = numbers(values.counts);
  const seeds = numbers(values.seeds);
  const repeats = Number(values.repeats);
  const budgetMs = Number(values["budget-ms"]);
  const deadline = performance.now() + Number(values["deadline-minutes"]) * 60_000;

  const arms = [...WIDTH_ARMS];
  if (values.base !== undefined) {
    const file = pathToFileURL(join(values.base, "packages", "packing", "src", "index.ts")).href;
    const base = (await import(file)) as { packWith: (id: string, input: PackInput, options: undefined, seed: number) => PackOutput };
    arms.push({ name: "skyline-base", entry: "skyline", scaleOne: true, pack: (input, seed) => base.packWith("skyline", input, undefined, seed) });
  }

  const rows: WidthRow[] = [];
  const stopped = new Map<string, number>();
  const clock = (): number => performance.now();
  let notRun = 0;
  for (const form of WIDTH_FORMS) {
    for (const sizes of WIDTH_SIZES) {
      for (const count of counts) {
        const made = corpus("pack-width-read", [{ generator: "rect-grid", version: 2, params: { containerSize: form, containerShape: "rect", sizes, order: "free", count }, seeds }]);
        for (const scale of scales) {
          for (const [index, file] of made.inputs.entries()) {
            const input = scaleInput(toPackInput(file), scale);
            const at = { id: file.id, spec: 0, seed: file.seed, input, cell: made.manifest.inputs[index]!.cell };
            const ready = arms.flatMap((arm) => {
              const key = [form, sizes, count, arm.name].join("/");
              const over = stopped.get(key);
              if ((over !== undefined && scale > over) || (arm.scaleOne === true && scale !== 1)) return [];
              const entryPack = pairedPack(arm.entry, at);
              if (entryPack === undefined) return [];
              const own = arm.pack;
              const pack = own === undefined ? entryPack : (): PackOutput => own(input, file.seed);
              return [{ arm, key, pack, ms: [] as number[], one: false, output: undefined as PackOutput | undefined }];
            });
            if (performance.now() > deadline) {
              notRun += ready.length;
              continue;
            }
            for (const own of ready) {
              const start = clock();
              own.output = own.pack();
              own.one = clock() - start > ONE_RUN_MS;
            }
            for (const run of interleavedOrder(ready.length, repeats)) {
              const own = ready[run.entry]!;
              if (own.one && own.ms.length > 0) continue;
              const pass = timeRuns(own.pack, 1, clock).msRuns[0]!;
              own.ms.push(pass);
              own.one = own.one || pass > ONE_RUN_MS;
              if (pass > budgetMs) stopped.set(own.key, scale);
            }
            for (const own of ready) {
              const output = own.output!;
              rows.push({ form, sizes, count, scale, seed: file.seed, arm: own.arm.name, ms: median(own.ms), runs: own.ms.length, fill: fillOf(input, output), widths: traceSum(output, "pack.search.widths") });
            }
          }
        }
      }
    }
  }

  const lines = widthLines(rows, seeds);
  const facts = `Commit ${process.env["GITHUB_SHA"] ?? "local"}, Node ${process.version}. ${rows.length} pairs measured and ${notRun} not run: job budget. A pass over ${budgetMs} ms stops the larger scales of its arm in its cell. A pass over ${ONE_RUN_MS} ms gets 1 timed pass.`;
  const base = values.base === undefined ? [] : baseLines(rows, "skyline", "skyline-base");
  const baseText = base.map((l) => `| ${l.form} | ${l.sizes} | ${l.count} | ${l.ratio.toFixed(3)} |`);
  const baseTable = base.length === 0 ? "" : ["", "## The time of skyline at scale 1 over the base commit", "", "| Form | Sizes | Items | Time over base |", "| --- | --- | --- | --- |", ...baseText, ""].join("\n");
  const markdown = `${widthMarkdown(lines, scales, facts)}${baseTable}`;
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify({ schema: "skyline-width/2", scales, counts, seeds, repeats, budgetMs, notRun, stopped: Object.fromEntries(stopped), lines, base, rows }, null, 1)}\n`);
  if (values.summary !== undefined) writeFileSync(values.summary, markdown, { flag: "a" });
  process.stdout.write(markdown);
}

if (process.argv[1]?.endsWith("skyline-width.ts")) await main();
