// The read of roadmap item k167: the time of `skyline` against the width of the input in units, at a fixed count of items.
// It is a separate program. It scales each input by a factor, and the arms `maxrects-bl` and `rows` are the controls.
//
//   node bench/skyline-width.ts --out <file.json> [--scales 1,4,16,64] [--counts 10,100,1000] [--seeds 11,12,13,14,15]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { corpus, toPackInput, type PackInput } from "../src/index.ts";
import { interleavedOrder, pairedPack, timeRuns } from "./run.ts";

/** One arm of the read: its name in the rows and the entry that it packs. The arm `rows-aa` gives the noise of the run. */
export interface WidthArm {
  readonly name: string;
  readonly entry: string;
}

/** The arms of the read. The arm `skyline` is the test. The other arms do not keep a cell for each unit of the width. */
export const WIDTH_ARMS: readonly WidthArm[] = [
  { name: "skyline", entry: "skyline" },
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
    });
  }
  return lines;
}

/** This function gives the table of the lines in Markdown. */
export function widthMarkdown(lines: readonly WidthLine[], scales: readonly number[], facts: string): string {
  const head = `| Form | Sizes | Items | Arm | ${scales.map((s) => `${s}x ms`).join(" | ")} | Slope (low to high) | Share of the width |`;
  const rule = `| ${[...Array(6 + scales.length).keys()].map(() => "---").join(" | ")} |`;
  const body = lines.map((l) => {
    const ms = scales.map((s) => {
      const value = l.ms[String(s)];
      return value === undefined ? "not run" : value.toFixed(2);
    });
    return `| ${l.form} | ${l.sizes} | ${l.count} | ${l.arm} | ${ms.join(" | ")} | ${l.slope.median.toFixed(2)} (${l.slope.low.toFixed(2)} to ${l.slope.high.toFixed(2)}) | ${l.widthShare.toFixed(2)} |`;
  });
  return [`## The time of skyline against the width`, "", facts, "", head, rule, ...body, ""].join("\n");
}

/** This function parses a list of whole numbers. */
function numbers(text: string): number[] {
  return text.split(",").map((part) => Number(part));
}

/** This function packs the read and writes its record and its table. */
function main(): void {
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
    },
  });
  if (values.out === undefined) throw new RangeError("The option --out is necessary.");
  const scales = numbers(values.scales);
  const counts = numbers(values.counts);
  const seeds = numbers(values.seeds);
  const repeats = Number(values.repeats);
  const budgetMs = Number(values["budget-ms"]);
  const deadline = performance.now() + Number(values["deadline-minutes"]) * 60_000;

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
            const ready = WIDTH_ARMS.flatMap((arm) => {
              const key = [form, sizes, count, arm.name].join("/");
              const over = stopped.get(key);
              if (over !== undefined && scale > over) return [];
              const pack = pairedPack(arm.entry, at);
              return pack === undefined ? [] : [{ arm, key, pack, ms: [] as number[], one: false }];
            });
            if (performance.now() > deadline) {
              notRun += ready.length;
              continue;
            }
            for (const own of ready) {
              const start = clock();
              own.pack();
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
              rows.push({ form, sizes, count, scale, seed: file.seed, arm: own.arm.name, ms: median(own.ms), runs: own.ms.length });
            }
          }
        }
      }
    }
  }

  const lines = widthLines(rows, seeds);
  const facts = `Commit ${process.env["GITHUB_SHA"] ?? "local"}, Node ${process.version}. ${rows.length} pairs measured and ${notRun} not run: job budget. A pass over ${budgetMs} ms stops the larger scales of its arm in its cell. A pass over ${ONE_RUN_MS} ms gets 1 timed pass.`;
  const markdown = widthMarkdown(lines, scales, facts);
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify({ schema: "skyline-width/1", scales, counts, seeds, repeats, budgetMs, notRun, stopped: Object.fromEntries(stopped), lines, rows }, null, 1)}\n`);
  if (values.summary !== undefined) writeFileSync(values.summary, markdown, { flag: "a" });
  process.stdout.write(markdown);
}

if (process.argv[1]?.endsWith("skyline-width.ts")) main();
