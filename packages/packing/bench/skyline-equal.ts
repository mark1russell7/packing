// The equality check of roadmap item k170: the runs of `skyline` against its cell scan, and the outputs against a base commit.
// It is a separate program. An exit code of 1 tells that a case differs. `gate-flip.ts skyline` gives it each fault.
//
//   node bench/skyline-equal.ts [--cases 20000] [--fault <name>]
//   node bench/skyline-equal.ts --base <folder of a checkout> --out <file.json> [--corpora a,b] [--sample 12] [--minutes 30]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { outputHash, packWith, type PackInput, type PackOutput } from "../src/index.ts";
import { lowestWindow, scanWindows } from "../src/skyline.ts";
import { SkylineRuns, type RunWindow } from "../src/skyline-runs.ts";
import { pairedInputs, pairedPack, parseCorpus, packOptionsOf } from "./run.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** The result of one read: the count of the cases, the count that differ and the first that differs. */
export interface EqualRead {
  readonly name: string;
  readonly family: string;
  readonly cases: number;
  readonly differ: number;
  readonly first?: string;
}

/** The families of the heights of the generated skylines. */
export const HEIGHT_FAMILIES: Readonly<Record<string, (r: () => number) => number>> = Object.freeze({
  whole: (r) => Math.floor(r() * 41),
  few: (r) => Math.floor(r() * 4) * 10,
  fractional: (r) => r() * 40,
  thirds: (r) => Math.floor(r() * 61) / 3,
  scaled: (r) => Math.floor(r() * 41) * 64 + 0.25 * Math.floor(r() * 4),
});

/** This function gives the cells of a skyline, as runs with a random length. */
function runsOf(width: number, draw: () => number, maxRuns: number, r: () => number): Float64Array {
  const cells = new Float64Array(width);
  const size = Math.max(1, Math.round(width / (1 + Math.floor(r() * maxRuns))));
  for (let i = 0; i < width; ) {
    const length = 1 + Math.floor(r() * 2 * size);
    const y = draw();
    for (let j = 0; j < length && i < width; j++) cells[i++] = y;
  }
  return cells;
}

/** This function gives the skyline of the cells as runs. */
function runsFrom(cells: Float64Array): SkylineRuns {
  const skyline = new SkylineRuns(cells.length);
  for (let i = 0; i < cells.length; ) {
    let end = i + 1;
    while (end < cells.length && cells[end] === cells[i]) end++;
    skyline.raise(i, end, cells[i]!);
    i = end;
  }
  return skyline;
}

/** This function gives the cells where a list of heights changes, with the cell 0. */
export function breaksOf(cells: ArrayLike<number>): number[] {
  const out = [0];
  for (let i = 1; i < cells.length; i++) if (cells[i] !== cells[i - 1]) out.push(i);
  return out;
}

/** A search over the runs: the faults of the flip test replace `SkylineRuns.window` with this form. */
export type RunSearch = (skyline: SkylineRuns, rw: number, rh: number, cap: number) => RunWindow;

/** The rule that gives the x values that a window with a limit can start at. */
export type BreakRule = (skyline: ArrayLike<number>, limit: ArrayLike<number> | undefined) => readonly number[];

/** The search of the code. */
export const RUN_SEARCH: RunSearch = (skyline, rw, rh, cap) => skyline.window(rw, rh, cap);

/** The rule of the code: the cell 0, the breaks of the skyline and the breaks of the limit. */
export const BREAK_RULE: BreakRule = (skyline, limit) => [...new Set([...breaksOf(skyline), ...(limit === undefined ? [] : breaksOf(limit))])].toSorted((a, b) => a - b);

/** This function gives a window of the rule `bl` over a list of x values. It reads each cell of a window. */
export function windowAtBreaks(skyline: ArrayLike<number>, limit: ArrayLike<number> | undefined, xs: readonly number[], rw: number, rh: number, cap: number): RunWindow {
  const out: RunWindow = { x: 0, y: Infinity, first: -1 };
  for (const x of xs) {
    if (x + rw > skyline.length) break;
    let max = -Infinity;
    let room = cap;
    for (let i = x; i < x + rw; i++) {
      if (skyline[i]! > max) max = skyline[i]!;
      if (limit !== undefined && limit[i]! < room) room = limit[i]!;
    }
    if (max + rh > room) continue;
    if (out.first < 0) out.first = x;
    if (max < out.y) {
      out.y = max;
      out.x = x;
    }
  }
  return out;
}

/** The faults of the flip test: each one is a wrong rule or a wrong search that the check must find. */
export const FAULTS: Readonly<Record<string, { readonly search?: RunSearch; readonly rule?: BreakRule }>> = Object.freeze({
  "no limit breaks": { rule: (skyline) => breaksOf(skyline) },
  "no falling breaks": {
    rule: (skyline, limit) => BREAK_RULE(skyline, limit).filter((x) => x === 0 || skyline[x]! > skyline[x - 1]!),
  },
  "last of equal windows": {
    search: (skyline, rw, rh, cap) => {
      const found = skyline.window(rw, rh, cap);
      let x = found.x;
      for (const start of skyline.xs) {
        if (start > found.x && start + rw <= skyline.width && maxOver(skyline, start, rw) === found.y) x = start;
      }
      return { ...found, x };
    },
  },
});

/** This function gives the largest height over a window of the runs. */
function maxOver(skyline: SkylineRuns, x: number, rw: number): number {
  let max = -Infinity;
  for (let k = 0; k < skyline.xs.length; k++) {
    if (skyline.xs[k]! >= x + rw) break;
    if (skyline.endOf(k) > x && skyline.ys[k]! > max) max = skyline.ys[k]!;
  }
  return max;
}

/** This function tallies the cases of one family into one read. */
function reader(name: string, family: string): { tally: (ok: boolean, note: () => string) => void; read: () => EqualRead } {
  let cases = 0;
  let differ = 0;
  let first: string | undefined;
  return {
    tally(ok, note) {
      cases++;
      if (!ok) {
        differ++;
        first ??= note();
      }
    },
    read: () => ({ name, family, cases, differ, ...(first === undefined ? {} : { first }) }),
  };
}

const sameWindow = (a: RunWindow, b: RunWindow): boolean => a.x === b.x && a.y === b.y && a.first === b.first;

/** The free rectangles of the gap between the cells and the height `y`, in the form of the cell path. */
function gapsOfCells(cells: ArrayLike<number>, x0: number, x1: number, y: number, minW: number, minH: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = x0; i < x1; i++) {
    const level = cells[i]!;
    if (!(level < y) || (i > x0 && cells[i - 1]! === level)) continue;
    let l = i;
    let r = i + 1;
    while (l > x0 && cells[l - 1]! <= level) l--;
    while (r < x1 && cells[r]! <= level) r++;
    const key = `${l},${r},${level}`;
    if (seen.has(key) || r - l < minW || y - level < minH) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** The free rectangles under the cells, with each height kept at `end`, in the form of the cell path. */
function underOfCells(cells: ArrayLike<number>, end: number, minW: number, minH: number): string[] {
  const top = Array.from(cells, (s) => Math.min(s, end));
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < top.length; i++) {
    const level = top[i]!;
    if (!(level > 0) || (i > 0 && top[i - 1]! === level)) continue;
    let l = i;
    let r = i + 1;
    while (l > 0 && top[l - 1]! >= level) l--;
    while (r < top.length && top[r]! >= level) r++;
    const key = `${l},${r},${level}`;
    if (seen.has(key) || r - l < minW || level < minH) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** This function reads the search and the other parts of the runs against the cell form, over `cases` generated skylines of each family. */
export function readRuns(cases: number, seed: number, search: RunSearch = RUN_SEARCH): EqualRead[] {
  return Object.entries(HEIGHT_FAMILIES).flatMap(([family, height]) => {
    const r = mulberry32(seed);
    const draw = (): number => height(r);
    const windows = reader("window", family);
    const parts = reader("gaps and fill", family);
    for (let c = 0; c < cases; c++) {
      const width = 1 + Math.floor(r() * 160);
      const cells = runsOf(width, draw, 12, r);
      const runs = runsFrom(cells);
      const rw = 1 + Math.floor(r() * width);
      const rh = r() * 8;
      const cap = r() < 0.5 ? Infinity : 20 + r() * 40;
      const scan = scanWindows(cells, width, rw, rh, cap);
      const found = search(runs, rw, rh, cap);
      windows.tally(sameWindow(found, scan), () => JSON.stringify({ width, rw, rh, cap, found, scan: { x: scan.x, y: scan.y, first: scan.first } }));
      const plain = lowestWindow(cells, width, rw);
      const open = search(runs, rw, 0, Infinity);
      windows.tally(open.x === plain.x && open.y === plain.y, () => JSON.stringify({ width, rw, open, plain }));

      const x0 = Math.floor(r() * width);
      const x1 = x0 + 1 + Math.floor(r() * (width - x0));
      const y = r() * 60;
      const minW = 1 + Math.floor(r() * 6);
      const minH = r() * 6;
      const gaps: string[] = [];
      runs.gaps(x0, x1, y, minW, minH, (a, b, level) => gaps.push(`${a},${b},${level}`));
      const under: string[] = [];
      runs.under(30, minW, minH, (a, b, level) => under.push(`${a},${b},${level}`));
      const filled = new Float64Array(width);
      runs.fill(filled);
      const ok =
        JSON.stringify(gaps) === JSON.stringify(gapsOfCells(cells, x0, x1, y, minW, minH)) &&
        JSON.stringify(under) === JSON.stringify(underOfCells(cells, 30, minW, minH)) &&
        filled.every((v, i) => v === cells[i]);
      parts.tally(ok, () => JSON.stringify({ width, x0, x1, y, minW, minH }));
    }
    return [windows.read(), parts.read()];
  });
}

/** This function reads the break rule against the cell scan: limits that have their own breaks, with and without a cap. */
export function readBreakRule(cases: number, seed: number, rule: BreakRule = BREAK_RULE): EqualRead[] {
  return Object.entries(HEIGHT_FAMILIES).map(([family, height]) => {
    const r = mulberry32(seed);
    const draw = (): number => height(r);
    const tally = reader("limit", family);
    for (let c = 0; c < cases; c++) {
      const width = 1 + Math.floor(r() * 160);
      const cells = runsOf(width, draw, 12, r);
      const limit = runsOf(width, () => 20 + draw(), 8, r);
      const rw = 1 + Math.floor(r() * width);
      const rh = r() * 8;
      const cap = r() < 0.5 ? Infinity : 20 + r() * 40;
      const scan = scanWindows(cells, width, rw, rh, cap, limit);
      const found = windowAtBreaks(cells, limit, rule(cells, limit), rw, rh, cap);
      tally.tally(sameWindow(found, scan), () => JSON.stringify({ width, rw, rh, cap, found, scan: { x: scan.x, y: scan.y, first: scan.first } }));
    }
    return tally.read();
  });
}

/** This function gives the window of the rule `mw` over some x values. These are the cell 0, each break, each break less the box and the right edge. */
function minWasteAtBreaks(cells: Float64Array, rw: number): number {
  const xs = new Set([0, cells.length - rw]);
  for (const b of breaksOf(cells)) {
    xs.add(b);
    if (b >= rw) xs.add(b - rw);
  }
  let best = 0;
  let bestWaste = Infinity;
  let bestY = Infinity;
  for (const x of [...xs].toSorted((a, b) => a - b)) {
    let max = -Infinity;
    let sum = 0;
    for (let i = x; i < x + rw; i++) {
      sum += cells[i]!;
      if (cells[i]! > max) max = cells[i]!;
    }
    const waste = rw * max - sum;
    const tol = 1e-9 * Math.max(1, Math.abs(waste));
    if (waste < bestWaste - tol || (Math.abs(waste - bestWaste) <= tol && max < bestY)) {
      bestWaste = Math.min(waste, bestWaste);
      bestY = max;
      best = x;
    }
  }
  return best;
}

/** This function reads why the rule `mw` keeps the cells. On near ties under its tolerance, the x values at breaks do not always give its window. */
export function readMinWaste(cases: number, seed: number): EqualRead[] {
  const families: Readonly<Record<string, (r: () => number) => () => number>> = {
    "near ties": (r) => {
      const base = 1e6 * (1 + Math.floor(r() * 5));
      return () => base + Math.floor(r() * 41) * 1e-5;
    },
    whole: (r) => () => Math.floor(r() * 41),
  };
  return Object.entries(families).map(([family, make]) => {
    const r = mulberry32(seed);
    const tally = reader("rule mw at breaks", family);
    for (let c = 0; c < cases; c++) {
      const width = 40 + Math.floor(r() * 121);
      const cells = runsOf(width, make(r), 12, r);
      const rw = 2 + Math.floor(r() * (width >> 1));
      const scan = scanWindows(cells, width, rw, 0, Infinity);
      const x = minWasteAtBreaks(cells, rw);
      tally.tally(x === scan.wx, () => JSON.stringify({ width, rw, wx: scan.wx, x }));
    }
    return tally.read();
  });
}

/** One entry of the read against a base commit: its pairs, its skips, the pairs that the deadline cut and the pairs that differ. */
export interface EntryEqual {
  readonly entry: string;
  readonly pairs: number;
  readonly skipped: number;
  readonly notRun: number;
  readonly differ: number;
  readonly first?: string;
}

/** The entries that reach the engine of `skyline`. The 2 sets of `portfolio-k2` and `portfolio-k3` hold it in some of their cells. */
export const ENGINE_ENTRIES: readonly string[] = [
  "skyline",
  "skyline-mw",
  "skyline-bl-waste",
  "skyline-mw-waste",
  "bbox-skyline",
  "ruin-recreate-skyline-k64",
  "overlap-min-skyline-k8192",
  "anneal-skyline-k16",
  "relax-skyline-bl-waste",
  "force-skyline-bl-waste",
  "portfolio-k2",
  "portfolio-k3",
  "aspect-fit-portfolio-k2",
  "push",
];

/** This function gives the hash of a pack, or the text of its error. So a pack that fails on both commits with one text reads equal. */
function hashOf(pack: () => PackOutput): string {
  try {
    return outputHash(pack());
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

/**
 * This function gives the pack of an entry. The runner refuses `push` on an offline input, and `push` starts `packSkyline` for each item
 * with no place. So this read gives `push` each input by `packWith`, with no earlier output.
 */
function entryPack(id: string, at: Parameters<typeof pairedPack>[1]): (() => PackOutput) | undefined {
  return pairedPack(id, at) ?? (id === "push" ? (): PackOutput => packWith("push", at.input, undefined, at.seed) : undefined);
}

/** The pack of a base commit: `packWith` of its package root. */
type BasePack = (id: string, input: PackInput, options: unknown, seed: number) => PackOutput;

/** This function reads the output hash of each entry against a base commit, on a sample of each corpus. The time of each entry is limited, and the read counts what it cut. */
export function readAgainstBase(base: BasePack, corpora: readonly string[], sample: number, minutes: number): { entries: EntryEqual[]; corpora: readonly string[]; sample: number; minutes: number } {
  const perEntry = (minutes * 60_000) / ENGINE_ENTRIES.length;
  const inputs = corpora.flatMap((name) => {
    const all = pairedInputs(parseCorpus(readFileSync(join(here, "corpora", `${name}.json`), "utf8"), name));
    const step = Math.max(1, Math.floor(all.length / sample));
    return all.filter((_, index) => index % step === 0).slice(0, sample);
  });
  const entries = ENGINE_ENTRIES.map((id): EntryEqual => {
    const end = performance.now() + perEntry;
    let pairs = 0;
    let skipped = 0;
    let notRun = 0;
    let differ = 0;
    let first: string | undefined;
    for (const at of inputs) {
      const pack = entryPack(id, at);
      if (pack === undefined) {
        skipped++;
        continue;
      }
      if (performance.now() > end) {
        notRun++;
        continue;
      }
      pairs++;
      const { strategy, options } = packOptionsOf(id);
      const own = hashOf(pack);
      const other = hashOf(() => base(strategy, at.input, options, at.seed));
      if (own !== other) {
        differ++;
        first ??= `${at.id}: ${own} against ${other}`;
      }
    }
    return { entry: id, pairs, skipped, notRun, differ, ...(first === undefined ? {} : { first }) };
  });
  return { entries, corpora, sample, minutes };
}

/** This function gives the table of the reads in Markdown. */
export function equalMarkdown(reads: readonly EqualRead[]): string {
  const rows = reads.map((r) => `| ${r.name} | ${r.family} | ${r.cases} | ${r.differ} |`);
  return ["| Read | Family | Cases | Differ |", "| --- | --- | --- | --- |", ...rows, ""].join("\n");
}

/** This function starts the check and gives its exit code. */
export async function equalMain(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      cases: { type: "string", default: "20000" },
      seed: { type: "string", default: "170" },
      fault: { type: "string" },
      base: { type: "string" },
      out: { type: "string" },
      corpora: { type: "string", default: "pack-free-v1,pack-screen-v1,pack-change-v1" },
      sample: { type: "string", default: "12" },
      minutes: { type: "string", default: "30" },
    },
  });
  if (values.base !== undefined) {
    const file = pathToFileURL(join(values.base, "packages", "packing", "src", "index.ts")).href;
    const module = (await import(file)) as { packWith: BasePack };
    const read = readAgainstBase(module.packWith, (values.corpora ?? "").split(","), Number(values.sample), Number(values.minutes));
    if (values.out !== undefined) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, `${JSON.stringify({ schema: "skyline-equal/1", ...read }, null, 1)}\n`);
    }
    const rows = read.entries.map((e) => `| ${e.entry} | ${e.pairs} | ${e.skipped} | ${e.notRun} | ${e.differ} |`);
    process.stdout.write(["| Entry | Pairs | Skipped | Not run: deadline | Differ |", "| --- | --- | --- | --- | --- |", ...rows, ""].join("\n"));
    return read.entries.some((e) => e.differ > 0) ? 1 : 0;
  }
  const fault = values.fault === undefined ? undefined : FAULTS[values.fault];
  if (values.fault !== undefined && fault === undefined) throw new RangeError(`The fault is one of ${Object.keys(FAULTS).join(", ")}.`);
  const cases = Math.ceil(Number(values.cases) / Object.keys(HEIGHT_FAMILIES).length);
  const seed = Number(values.seed);
  const reads = [...readRuns(cases, seed, fault?.search), ...readBreakRule(cases, seed, fault?.rule)];
  process.stdout.write(equalMarkdown([...reads, ...readMinWaste(Math.min(cases, 1000), seed)]));
  for (const read of reads) if (read.first !== undefined) process.stdout.write(`${read.name}/${read.family}: ${read.first}\n`);
  return reads.some((r) => r.differ > 0) ? 1 : 0;
}

if (process.argv[1]?.endsWith("skyline-equal.ts") === true) process.exitCode = await equalMain(process.argv.slice(2));
