// Roadmap item k10: the gap of each named entry to a proved optimum (`docs/BENCH.md`, "The gap to a proved optimum").
// The script solves small generated strips with `exactStrip`, and it packs each input with each entry. A gap counts only on a proved optimum.
// The script is not a command of `bench/main.ts`. The workflow `exact.yml` starts it, because it does not fit a time on a shared machine.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { mean, wilson } from "@mark1russell7/rigor-statistics";
import {
  beasleyGcut,
  berkeyWang,
  cellOf,
  checkHard,
  EXACT_STRIP_NODE_LIMIT,
  exactStrip,
  martelloVigo,
  objectiveBound,
  objectiveResult,
  packWith,
  perfectCut,
  strategy,
  supportsCell,
  toPackInput,
  type ExactStripResult,
  type PackInput,
  type PackOutput,
} from "../src/index.ts";
import { ENTRIES, type BenchEntry } from "./entries.ts";

/** A family of small strips, with made-up data. */
export interface ExactFamily {
  readonly name: string;
  /** This function gives the input of a seed and a count of items. */
  readonly make: (seed: number, n: number) => PackInput;
}

/** The families of the comparison: wide items, narrow items, one strong direction, large items, and two inputs with no free space. */
export const EXACT_FAMILIES: readonly ExactFamily[] = Object.freeze([
  ...(["I", "II", "III", "V"] as const).map((c) => ({ name: `berkey-wang.${c}`, make: (seed: number, count: number): PackInput => toPackInput(berkeyWang.generate(seed, { class: c, containerSize: "freeHeight", count }, "exact")) })),
  ...(["VII", "X"] as const).map((c) => ({ name: `martello-vigo.${c}`, make: (seed: number, count: number): PackInput => toPackInput(martelloVigo.generate(seed, { class: c, containerSize: "freeHeight", count }, "exact")) })),
  { name: "beasley-gcut.s250", make: (seed: number, count: number): PackInput => toPackInput(beasleyGcut.generate(seed, { side: 250, containerSize: "freeHeight", count }, "exact")) },
  ...(["guillotine", "free"] as const).map((cut) => ({ name: `perfect-cut.${cut}`, make: (seed: number, count: number): PackInput => toPackInput(perfectCut.generate(seed, { cut, containerSize: "freeHeight", count }, "exact")) })),
]);

/** The record of one exact search. */
export interface ExactCaseRecord {
  kind: "exact";
  family: string;
  n: number;
  seed: number;
  status: ExactStripResult["status"];
  proof: ExactStripResult["proof"];
  height: number;
  lowerBound: number;
  /** The k51 bound with no tolerance. */
  bound: number;
  nodes: number;
  /** The time of the search in milliseconds. It is a record only. No test reads it. */
  ms: number;
  /** The value `true` tells that a second search gave the same bytes. */
  sameBytes: boolean;
  /** The count of the breaks of the hard rules of the output, with no overlap tolerance. */
  breaks: number;
}

/** The record of one entry on one input. */
export interface ExactEntryRecord {
  kind: "entry";
  family: string;
  n: number;
  seed: number;
  entry: string;
  /** The height of the hull, or `null` when the entry leaves out an item. */
  height: number | null;
  /** The count of the breaks of the hard rules at the default tolerance. An entry with a break is not in the tables. */
  breaks: number;
  /** The count of the breaks with no overlap tolerance. Only a layout with none refutes a proof, because a tolerated overlap saves height. */
  strictBreaks: number;
  /** The share by which the height is above the proved optimum: 0 is the optimum. It is `null` with no proof or with no height. */
  gap: number | null;
}

/** One line of the table of the entries. */
export interface ExactEntryLine {
  entry: string;
  /** The count of the inputs with a proved optimum and a height of the entry. */
  cases: number;
  meanGap: number;
  worstGap: number;
  /** The count of the cases at the optimum. */
  atOptimum: number;
  /** The Wilson interval of the share at the optimum. */
  low: number;
  high: number;
}

/** One cell of the table of the proofs. */
export interface ExactProofLine {
  family: string;
  n: number;
  cases: number;
  proved: number;
}

/** One line of the table of the counts. */
export interface ExactCountLine {
  n: number;
  cases: number;
  proved: number;
  /** The entry with the lowest mean gap at this count, with its gap, or `null` with no proof. */
  bestEntry: string | null;
  bestGap: number | null;
}

/** A fact that breaks the comparison. Each one fails the job. */
export interface ExactBreak {
  family: string;
  n: number;
  seed: number;
  what: string;
}

/** This function gives the sum of the breaks of the hard rules. */
export const breakCount = (input: PackInput, output: PackOutput, tolerance?: { overlap: number }): number =>
  Object.values(checkHard(input, output, tolerance)).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

/** This function solves one input two times, and it gives its record. */
export function solveCase(family: string, n: number, seed: number, input: PackInput, nodeLimit: number, now: () => number): ExactCaseRecord {
  const start = now();
  const result = exactStrip(input, { nodeLimit });
  const ms = now() - start;
  const again = exactStrip(input, { nodeLimit });
  return {
    kind: "exact",
    family,
    n,
    seed,
    status: result.status,
    proof: result.proof,
    height: result.height,
    lowerBound: result.lowerBound,
    bound: objectiveBound(input, { tolerance: 0 })!.value,
    nodes: result.nodes,
    ms,
    sameBytes: JSON.stringify(result) === JSON.stringify(again),
    breaks: breakCount(input, result.output, { overlap: 0 }),
  };
}

/** This function packs one input with one entry, and it gives its record. The strategy seed is the seed of the input. */
export function packEntry(entry: BenchEntry, solved: ExactCaseRecord, input: PackInput): ExactEntryRecord {
  const output = packWith(entry.strategy, input, entry.options, solved.seed);
  const height = objectiveResult(input, output, objectiveBound(input, { tolerance: 0 })!) ?? null;
  const gap = height === null || solved.status !== "optimal" ? null : (height - solved.height) / solved.height;
  return { kind: "entry", family: solved.family, n: solved.n, seed: solved.seed, entry: entry.id, height, breaks: breakCount(input, output), strictBreaks: breakCount(input, output, { overlap: 0 }), gap };
}

/** This function gives the entries of an argument: `all`, or the ids with commas. It keeps the entries that support the strip cell. */
export function entriesOf(list: string, input: PackInput): BenchEntry[] {
  const chosen = list === "all" ? ENTRIES : list.split(",").map((id) => {
    const found = ENTRIES.find((e) => e.id === id);
    if (found === undefined) throw new RangeError(`No entry has the id "${id}".`);
    return found;
  });
  return chosen.filter((e) => supportsCell(strategy(e.strategy).supports, cellOf(input)));
}

/** This function gives the facts that break the comparison. A heuristic below a proved optimum is a wrong proof. A bound above it is a wrong bound. */
export function breaksOf(cases: readonly ExactCaseRecord[], entries: readonly ExactEntryRecord[]): ExactBreak[] {
  const out: ExactBreak[] = [];
  const add = (r: { family: string; n: number; seed: number }, what: string): void => {
    out.push({ family: r.family, n: r.n, seed: r.seed, what });
  };
  for (const c of cases) {
    if (!c.sameBytes) add(c, "two searches gave different bytes");
    if (c.breaks > 0) add(c, `the exact layout has ${c.breaks} hard breaks`);
    if (c.lowerBound < c.bound) add(c, "the lower bound fell below the k51 bound");
    if (c.status === "optimal" && c.bound > c.height) add(c, "the k51 bound is above a proved optimum");
  }
  for (const e of entries) if (e.strictBreaks === 0 && e.gap !== null && e.gap < 0) add(e, `the entry ${e.entry} is below the proved optimum`);
  return out;
}

/** This function gives the table of the entries, the lowest mean gap first. A tie goes to the entry id. */
export function entryLines(records: readonly ExactEntryRecord[]): ExactEntryLine[] {
  const byEntry = new Map<string, number[]>();
  for (const r of records) {
    if (r.gap === null || r.breaks > 0) continue;
    const gaps = byEntry.get(r.entry);
    if (gaps === undefined) byEntry.set(r.entry, [r.gap]);
    else gaps.push(r.gap);
  }
  const lines = [...byEntry].map(([entry, gaps]): ExactEntryLine => {
    const atOptimum = gaps.filter((g) => g === 0).length;
    const share = wilson(atOptimum, gaps.length);
    return { entry, cases: gaps.length, meanGap: mean(gaps), worstGap: Math.max(...gaps), atOptimum, low: share.low, high: share.high };
  });
  return lines.sort((a, b) => a.meanGap - b.meanGap || (a.entry < b.entry ? -1 : 1));
}

/** This function gives the proved share of each family and count of items. */
export function proofLines(cases: readonly ExactCaseRecord[]): ExactProofLine[] {
  const lines = new Map<string, ExactProofLine>();
  for (const c of cases) {
    const key = `${c.family}|${c.n}`;
    const line = lines.get(key) ?? { family: c.family, n: c.n, cases: 0, proved: 0 };
    line.cases += 1;
    if (c.status === "optimal") line.proved += 1;
    lines.set(key, line);
  }
  return [...lines.values()];
}

/** This function gives the table of the counts of items. */
export function countLines(cases: readonly ExactCaseRecord[], records: readonly ExactEntryRecord[]): ExactCountLine[] {
  const counts = [...new Set(cases.map((c) => c.n))].sort((a, b) => a - b);
  return counts.map((n) => {
    const here = cases.filter((c) => c.n === n);
    const best = entryLines(records.filter((r) => r.n === n))[0];
    return { n, cases: here.length, proved: here.filter((c) => c.status === "optimal").length, bestEntry: best?.entry ?? null, bestGap: best?.meanGap ?? null };
  });
}

/** This function gives a share as a percent with 2 digits. */
const percent = (v: number): string => `${(v * 100).toFixed(2)} %`;

/** The facts of one job that are not in the records. */
export interface ExactCosts {
  nodes: number;
  ms: number;
  /** The largest resident memory of the process in bytes. */
  peakRss: number;
}

/** This function gives the Markdown of the summary. */
export function summaryOf(cases: readonly ExactCaseRecord[], records: readonly ExactEntryRecord[], broken: readonly ExactBreak[], costs: ExactCosts): string {
  const out = ["# The gap to a proved optimum", "", "| n | Inputs | Proved | Best entry | Its mean gap |", "|---|---|---|---|---|"];
  for (const l of countLines(cases, records)) out.push(`| ${l.n} | ${l.cases} | ${l.proved} | ${l.bestEntry ?? "none"} | ${l.bestGap === null ? "none" : percent(l.bestGap)} |`);
  out.push("", `Costs: ${costs.nodes} nodes in ${Math.round(costs.ms)} ms, ${Math.round(costs.ms === 0 ? 0 : (costs.nodes / costs.ms) * 1000)} nodes each second, peak memory ${Math.round(costs.peakRss / 2 ** 20)} MiB.`);
  const below = records.filter((r) => r.strictBreaks === 0 && r.gap !== null && r.gap < 0).length;
  out.push("", `Breaks: ${broken.length}. Entries below a proved optimum: ${below}. Entry layouts with a hard break, not in the tables: ${records.filter((r) => r.breaks > 0).length}.`);
  for (const b of broken.slice(0, 20)) out.push(`- ${b.family} n ${b.n} seed ${b.seed}: ${b.what}`);
  out.push("", "| Family | n | Inputs | Proved |", "|---|---|---|---|");
  for (const l of proofLines(cases)) out.push(`| ${l.family} | ${l.n} | ${l.cases} | ${l.proved} |`);
  out.push("", "| Entry | Inputs | Mean gap | Worst gap | At the optimum | Share interval |", "|---|---|---|---|---|---|");
  for (const l of entryLines(records)) out.push(`| ${l.entry} | ${l.cases} | ${percent(l.meanGap)} | ${percent(l.worstGap)} | ${l.atOptimum} | ${percent(l.low)} to ${percent(l.high)} |`);
  return `${out.join("\n")}\n`;
}

/** This function gives the whole numbers of a list with commas. It throws a `RangeError` for another value. */
export function sizesOf(text: string): number[] {
  if (!/^\d+(,\d+)*$/.test(text)) throw new RangeError(`--sizes needs whole numbers with commas, not "${text}".`);
  return text.split(",").map(Number);
}

/** This function solves each case and packs it with each entry. It gives the records of all cases. */
export function compare(families: readonly ExactFamily[], sizes: readonly number[], seeds: number, nodeLimit: number, list: string, now: () => number): { cases: ExactCaseRecord[]; records: ExactEntryRecord[] } {
  const cases: ExactCaseRecord[] = [];
  const records: ExactEntryRecord[] = [];
  for (const n of sizes) {
    for (const family of families) {
      for (let seed = 1; seed <= seeds; seed++) {
        const input = family.make(seed, n);
        const solved = solveCase(family.name, n, seed, input, nodeLimit, now);
        cases.push(solved);
        for (const entry of entriesOf(list, input)) records.push(packEntry(entry, solved, input));
      }
    }
  }
  return { cases, records };
}

/** This function is the command. It gives the exit code: 1 when a break exists. */
function main(): number {
  const { values } = parseArgs({
    options: {
      sizes: { type: "string", default: "6,8,10,12" },
      seeds: { type: "string", default: "5" },
      nodes: { type: "string", default: String(EXACT_STRIP_NODE_LIMIT) },
      entries: { type: "string", default: "all" },
      out: { type: "string", default: "bench-out/exact" },
    },
  });
  const { cases, records } = compare(EXACT_FAMILIES, sizesOf(values.sizes), Number(values.seeds), Number(values.nodes), values.entries, () => performance.now());
  const broken = breaksOf(cases, records);
  const costs: ExactCosts = {
    nodes: cases.reduce((sum, c) => sum + c.nodes, 0),
    ms: cases.reduce((sum, c) => sum + c.ms, 0),
    // The value of `maxRSS` is in kibibytes
    peakRss: process.resourceUsage().maxRSS * 1024,
  };
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, "records.jsonl"), [...cases, ...records].map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(values.out, "summary.md"), summaryOf(cases, records, broken, costs));
  writeFileSync(join(values.out, "summary.json"), `${JSON.stringify({ counts: countLines(cases, records), proofs: proofLines(cases), entries: entryLines(records), costs, breaks: broken }, null, 2)}\n`);
  return broken.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("exact.ts")) process.exitCode = main();
