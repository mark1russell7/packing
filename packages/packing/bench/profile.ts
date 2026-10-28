// The CPU profile of roadmap item k64 (`docs/BENCH.md`, "A CPU profile"). The workflow `profile.yml` starts it in CI.
//
//   node bench/profile.ts --corpus <name> --strategy <id> (--inputs a,b | --slowest <n> --times <dir>) [--default rows]
//     [--repeats 3] [--warmup 1] [--interval-us 200] [--out dir]
//
// The script times the strategy and the default on each input, then packs each input with the strategy under the
// V8 CPU profiler. It writes `profile.cpuprofile`, `profile.md` and `profile.json`. The times of a local computer do not count.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpus, packWith, quantile, round3, strategy, toPackInput, unsupportedOf, type PackOutput } from "@mark1russell7/packing";
import { entry } from "./entries.ts";
import { TIME_FLOOR_MS, TIME_RATIO } from "./promote.ts";
import { parseCorpus } from "./run.ts";

/** The count of the rows of each table of the report. */
export const TOP = 25;

/** The names of the V8 pseudo-nodes. They have no source, and the self table keeps them. */
export const PSEUDO = Object.freeze(["(root)", "(program)", "(idle)", "(garbage collector)"]);

/** The fields of a record of the time records that this script reads. */
export interface TimeRecord {
  strategy: string;
  input: string;
  ms: number;
  skipped?: string;
}

/** The time ratio of one input from the time records. */
export interface SlowInput {
  input: string;
  /** The median time of the candidate, in milliseconds */
  candidate: number;
  /** The median time of the default, in milliseconds */
  current: number;
  /** The value `candidate / max(current, floorMs / timeRatio)` */
  ratio: number;
}

/** This function reads the text of a `records.jsonl` file. An empty line is not a record. */
export function parseTimeRecords(text: string): TimeRecord[] {
  const out: TimeRecord[] = [];
  for (const line of text.split("\n")) if (line.trim() !== "") out.push(JSON.parse(line) as TimeRecord);
  return out;
}

/**
 * This function gives the `n` inputs with the highest time ratio of the candidate to the default, highest first.
 * The ratio is `t / max(b, floorMs / timeRatio)`, as the time test of `bench/promote.ts` gives it. A skipped record has no time.
 */
export function slowestInputs(records: readonly TimeRecord[], candidate: string, current: string, n: number, floorMs = TIME_FLOOR_MS, timeRatio = TIME_RATIO): SlowInput[] {
  const least = floorMs / timeRatio;
  const times = (id: string): Map<string, number> => new Map(records.filter((r) => r.strategy === id && r.skipped === undefined).map((r) => [r.input, r.ms]));
  const a = times(candidate);
  const b = times(current);
  const out: SlowInput[] = [];
  for (const [input, t] of a) {
    const base = b.get(input);
    if (base === undefined) continue;
    out.push({ input, candidate: t, current: base, ratio: t / Math.max(base, least) });
  }
  out.sort((x, y) => y.ratio - x.ratio || (x.input < y.input ? -1 : x.input > y.input ? 1 : 0));
  return out.slice(0, n);
}

/** The call frame of a node of a V8 CPU profile. */
export interface CallFrame {
  functionName: string;
  url: string;
  /** The line of the function, from 0 */
  lineNumber: number;
  columnNumber: number;
}

/** A node of a V8 CPU profile. */
export interface ProfileNode {
  id: number;
  callFrame: CallFrame;
  hitCount?: number;
  children?: number[];
  /** The samples of each source line of the node. The lines start from 1. */
  positionTicks?: { line: number; ticks: number }[];
}

/** A V8 CPU profile: the format of a `.cpuprofile` file. */
export interface CpuProfile {
  nodes: ProfileNode[];
  /** The start and the end, in microseconds */
  startTime: number;
  endTime: number;
  /** The node id of each sample */
  samples: number[];
  /** The time before each sample, in microseconds */
  timeDeltas: number[];
}

/** One row of a function table. */
export interface FunctionRow {
  name: string;
  /** The place of the function: the file and the line from 1. A pseudo-node has no place. */
  where: string;
  ms: number;
  /** The percent of the time of all the samples */
  percent: number;
}

/** One row of the table of the source lines. */
export interface LineRow {
  name: string;
  /** The file and the line, from 1 */
  where: string;
  ticks: number;
  /** The percent of all the samples */
  percent: number;
  /** The text of the line, when the script can read the file */
  text?: string;
}

/** The tables of a profile. */
export interface ProfileTable {
  /** The time of all the samples, in milliseconds */
  totalMs: number;
  samples: number;
  /** The percent of the time in `(garbage collector)` */
  gcPercent: number;
  self: FunctionRow[];
  total: FunctionRow[];
  /** The self time of each file */
  files: FunctionRow[];
  lines: LineRow[];
}

/** This function gives a short place: the path after `packages/packing/`, or the path after the last `node_modules/`. */
export function shortUrl(url: string): string {
  const path = url.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/");
  const own = path.lastIndexOf("packages/packing/");
  if (own !== -1) return path.slice(own + "packages/packing/".length);
  const dep = path.lastIndexOf("node_modules/");
  return dep !== -1 ? path.slice(dep + "node_modules/".length) : path;
}

/** This function gives the key of the function of a call frame. */
const keyOf = (f: CallFrame): string => `${f.functionName}|${f.url}|${f.lineNumber}|${f.columnNumber}`;

/** This function gives the name of a function. A function without a name gets `(anonymous)`. */
const nameOf = (f: CallFrame): string => (f.functionName === "" ? "(anonymous)" : f.functionName);

/** This function gives the place of a function. A frame without a URL gives an empty text. */
const whereOf = (f: CallFrame): string => (f.url === "" ? "" : `${shortUrl(f.url)}:${f.lineNumber + 1}`);

/**
 * This function gives the tables of a CPU profile.
 *
 * - The time of a sample is the gap to the next sample. The last sample gets the mean gap.
 * - The total time of a function counts each sample once, also when the function is on the stack more than once.
 * - The total table has no pseudo-nodes. The self table keeps them.
 * - `source` gives the lines of a file for the line table. The default reads no file.
 */
export function profileTable(profile: CpuProfile, top = TOP, source: (url: string) => string[] | undefined = () => undefined): ProfileTable {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const count = profile.samples.length;
  const span = profile.endTime - profile.startTime;
  const mean = count === 0 ? 0 : span / count;
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  const frames = new Map<string, CallFrame>();
  let all = 0;
  for (let i = 0; i < count; i++) {
    const us = i + 1 < count ? (profile.timeDeltas[i + 1] ?? 0) : mean;
    all += us;
    const leaf = byId.get(profile.samples[i]!);
    if (leaf === undefined) continue;
    const k = keyOf(leaf.callFrame);
    frames.set(k, leaf.callFrame);
    self.set(k, (self.get(k) ?? 0) + us);
    const seen = new Set<string>();
    for (let id: number | undefined = leaf.id; id !== undefined; id = parent.get(id)) {
      const f = byId.get(id)!.callFrame;
      const key = keyOf(f);
      if (seen.has(key)) continue;
      seen.add(key);
      frames.set(key, f);
      total.set(key, (total.get(key) ?? 0) + us);
    }
  }
  const pct = (us: number): number => (all === 0 ? 0 : round3((100 * us) / all));
  const rows = (map: Map<string, number>, keep: (f: CallFrame) => boolean): FunctionRow[] =>
    [...map]
      .filter(([k]) => keep(frames.get(k)!))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, top)
      .map(([k, us]) => {
        const f = frames.get(k)!;
        return { name: nameOf(f), where: whereOf(f), ms: round3(us / 1000), percent: pct(us) };
      });

  const fileSelf = new Map<string, number>();
  for (const [k, us] of self) {
    const f = frames.get(k)!;
    const file = f.url === "" ? f.functionName : shortUrl(f.url);
    fileSelf.set(file, (fileSelf.get(file) ?? 0) + us);
  }
  const files = [...fileSelf]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([file, us]) => ({ name: file, where: "", ms: round3(us / 1000), percent: pct(us) }));

  const lineTicks = new Map<string, { f: CallFrame; line: number; ticks: number }>();
  for (const n of profile.nodes) {
    for (const p of n.positionTicks ?? []) {
      const k = `${keyOf(n.callFrame)}|${p.line}`;
      const row = lineTicks.get(k) ?? { f: n.callFrame, line: p.line, ticks: 0 };
      row.ticks += p.ticks;
      lineTicks.set(k, row);
    }
  }
  const lines = [...lineTicks.values()]
    .sort((a, b) => b.ticks - a.ticks || (keyOf(a.f) < keyOf(b.f) ? -1 : 1) || a.line - b.line)
    .slice(0, top)
    .map(({ f, line, ticks }) => {
      const row: LineRow = { name: nameOf(f), where: f.url === "" ? `line ${line}` : `${shortUrl(f.url)}:${line}`, ticks, percent: count === 0 ? 0 : round3((100 * ticks) / count) };
      const text = source(f.url)?.[line - 1]?.trim();
      if (text !== undefined && text !== "") row.text = text.length > 100 ? `${text.slice(0, 97)}...` : text;
      return row;
    });

  const gc = [...self].filter(([k]) => frames.get(k)!.functionName === "(garbage collector)").reduce((s, [, us]) => s + us, 0);
  return {
    totalMs: round3(all / 1000),
    samples: count,
    gcPercent: pct(gc),
    self: rows(self, () => true),
    total: rows(total, (f) => !PSEUDO.includes(f.functionName)),
    files,
    lines,
  };
}

/** The times of one input on this computer, with no profiler. */
export interface InputTimes {
  input: string;
  items: number;
  /** The median time of the candidate, in milliseconds */
  candidate: number;
  /** The median time of the default, in milliseconds */
  current: number;
  /** The value `candidate / max(current, floorMs / timeRatio)` */
  ratio: number;
  /** The ratio of the time records, when the script picked the input from them */
  recordRatio?: number;
}

/** The facts of a profile run. */
export interface ProfileReport {
  corpus: string;
  strategy: string;
  current: string;
  repeats: number;
  warmup: number;
  intervalUs: number;
  times: InputTimes[];
  table: ProfileTable;
}

/** This function escapes the text of a cell of a Markdown table. */
const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/`/g, "'");

/** This function gives the median of a list. An empty list gives 0. */
const median = (values: readonly number[]): number => (values.length === 0 ? 0 : quantile(values, 0.5));

/** This function gives the report of a profile run as Markdown. */
export function profileMarkdown(r: ProfileReport): string {
  const t = r.table;
  const out: string[] = [];
  out.push(`## The CPU profile of \`${r.strategy}\` on \`${r.corpus}\``, "");
  out.push(
    `The profile has ${t.samples} samples over ${t.totalMs} ms, with a sample each ${r.intervalUs} us. It packs each of ${r.times.length} inputs ${r.repeats} times.`,
    `The garbage collector has **${t.gcPercent}%** of the time.`,
    "",
  );
  out.push(`### The times of \`${r.strategy}\` and \`${r.current}\` without the profiler`, "");
  out.push(`The median of ${r.repeats} timed runs of each input, after ${r.warmup} warm-up runs. The ratio has the floor of the time test.`, "");
  const mid = (pick: (x: InputTimes) => number): number => round3(median(r.times.map(pick)));
  out.push(
    `| | \`${r.strategy}\` ms | \`${r.current}\` ms | ratio |`,
    "|---|---:|---:|---:|",
    `| median of the inputs | ${mid((x) => x.candidate)} | ${mid((x) => x.current)} | ${mid((x) => x.ratio)} |`,
  );
  for (const items of [...new Set(r.times.map((x) => x.items))].sort((a, b) => a - b)) {
    const group = r.times.filter((x) => x.items === items);
    const at = (pick: (x: InputTimes) => number): number => round3(median(group.map(pick)));
    out.push(`| median at ${items} items (${group.length} inputs) | ${at((x) => x.candidate)} | ${at((x) => x.current)} | ${at((x) => x.ratio)} |`);
  }
  out.push("");
  out.push(`| input | items | \`${r.strategy}\` ms | \`${r.current}\` ms | ratio | ratio of the records |`, "|---|---:|---:|---:|---:|---:|");
  for (const x of r.times) out.push(`| ${cell(x.input)} | ${x.items} | ${x.candidate} | ${x.current} | ${x.ratio} | ${x.recordRatio ?? ""} |`);
  out.push("");
  const fnTable = (title: string, rows: readonly FunctionRow[]): void => {
    out.push(`### ${title}`, "", "| # | function | place | ms | % |", "|---:|---|---|---:|---:|");
    for (const [i, row] of rows.entries()) out.push(`| ${i + 1} | ${cell(row.name)} | ${cell(row.where)} | ${row.ms} | ${row.percent} |`);
    out.push("");
  };
  fnTable(`The top ${t.self.length} functions by self time (GC ${t.gcPercent}%)`, t.self);
  fnTable(`The top ${t.total.length} functions by total time`, t.total);
  out.push(`### The self time of each file`, "", "| file | ms | % |", "|---|---:|---:|");
  for (const row of t.files) out.push(`| ${cell(row.name)} | ${row.ms} | ${row.percent} |`);
  out.push("");
  out.push(`### The top ${t.lines.length} source lines by samples`, "");
  if (t.lines.length === 0) out.push("The profile has no samples of the lines.");
  else {
    out.push("| # | function | place | samples | % | line |", "|---:|---|---|---:|---:|---|");
    for (const [i, row] of t.lines.entries()) out.push(`| ${i + 1} | ${cell(row.name)} | ${cell(row.where)} | ${row.ticks} | ${row.percent} | ${row.text === undefined ? "" : `\`${cell(row.text)}\``} |`);
  }
  out.push("");
  return out.join("\n");
}

/** The value of an option `--name value`, or `undefined`. */
function opt(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`The option ${name} needs a value.`);
  return value;
}

/** A whole number option of 1 or more. */
function count(argv: readonly string[], name: string, fallback: number, least = 1): number {
  const text = opt(argv, name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text) || Number(text) < least) throw new Error(`The option ${name} is a whole number of ${least} or more, not "${text}".`);
  return Number(text);
}

/** This function gives the lines of a source file of a profile URL, or `undefined` for a URL that is not a file. */
function readSource(): (url: string) => string[] | undefined {
  const cache = new Map<string, string[] | undefined>();
  return (url) => {
    if (!cache.has(url)) {
      let lines: string[] | undefined;
      try {
        lines = url.startsWith("file:") ? readFileSync(fileURLToPath(url), "utf8").split(/\r?\n/) : undefined;
      } catch {
        lines = undefined;
      }
      cache.set(url, lines);
    }
    return cache.get(url);
  };
}

/** This function starts the profile from the arguments of the command line, and writes the files of the report. */
export async function profileMain(argv: readonly string[]): Promise<ProfileReport> {
  const name = opt(argv, "--corpus");
  const id = opt(argv, "--strategy");
  if (name === undefined || id === undefined) throw new Error("Start the profile with: node bench/profile.ts --corpus <name> --strategy <id> (--inputs a,b | --slowest <n> --times <dir>).");
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error(`The corpus name "${name}" has other characters than a-z, 0-9, dot and hyphen.`);
  const current = opt(argv, "--default") ?? "rows";
  const repeats = count(argv, "--repeats", 3);
  const warmup = count(argv, "--warmup", 1, 0);
  const intervalUs = count(argv, "--interval-us", 200);
  const out = resolve(opt(argv, "--out") ?? join("bench-out", `profile-${id}`));

  let picked: { input: string; recordRatio?: number }[];
  const list = opt(argv, "--inputs");
  if (list !== undefined) picked = list.split(",").map((s) => ({ input: s.trim() })).filter((p) => p.input !== "");
  else {
    const dir = opt(argv, "--times");
    if (dir === undefined) throw new Error("The profile needs --inputs a,b or --slowest <n> --times <dir>.");
    const slow = slowestInputs(parseTimeRecords(readFileSync(join(dir, "records.jsonl"), "utf8")), id, current, count(argv, "--slowest", 20));
    picked = slow.map((s) => ({ input: s.input, recordRatio: round3(s.ratio) }));
  }
  if (picked.length === 0) throw new Error("The profile has no inputs.");

  const { manifest, inputs } = corpus(name, parseCorpus(readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8"), name).specs);
  const packers = (eid: string): ((index: number) => PackOutput) => {
    const e = entry(eid);
    const s = strategy(e.strategy);
    const given = Object.keys(e.options).length === 0 ? undefined : { ...(s.defaults as Record<string, unknown>), ...e.options };
    return (index) => {
      const file = inputs[index]!;
      const miss = unsupportedOf(s.supports, manifest.inputs[index]!.cell);
      if (miss !== undefined) throw new Error(`The entry ${eid} does not support ${miss.dimension} ${miss.value} of ${file.id}.`);
      return packWith(e.strategy, toPackInput(file), given, file.seed);
    };
  };
  const candidate = packers(id);
  const base = packers(current);
  const chosen = picked.map((p) => {
    const index = inputs.findIndex((f) => f.id === p.input);
    if (index === -1) throw new Error(`The corpus ${name} has no input ${p.input}.`);
    return { ...p, index };
  });

  // The times without the profiler: the warm-up runs, then the timed runs of the two entries in alternation
  const times: InputTimes[] = [];
  for (const p of chosen) {
    for (let w = 0; w < warmup; w++) {
      candidate(p.index);
      base(p.index);
    }
    const a: number[] = [];
    const b: number[] = [];
    for (let r = 0; r < repeats; r++) {
      let start = performance.now();
      candidate(p.index);
      a.push(performance.now() - start);
      start = performance.now();
      base(p.index);
      b.push(performance.now() - start);
    }
    const t = median(a);
    const d = median(b);
    const row: InputTimes = { input: p.input, items: inputs[p.index]!.boxes.length, candidate: round3(t), current: round3(d), ratio: round3(t / Math.max(d, TIME_FLOOR_MS / TIME_RATIO)) };
    if (p.recordRatio !== undefined) row.recordRatio = p.recordRatio;
    times.push(row);
  }

  // The profile: only the runs of the candidate
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: intervalUs });
  await session.post("Profiler.start");
  for (const p of chosen) for (let r = 0; r < repeats; r++) candidate(p.index);
  const { profile } = (await session.post("Profiler.stop")) as unknown as { profile: CpuProfile };
  session.disconnect();

  const report: ProfileReport = { corpus: name, strategy: id, current, repeats, warmup, intervalUs, times, table: profileTable(profile, TOP, readSource()) };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "profile.cpuprofile"), JSON.stringify(profile));
  writeFileSync(join(out, "profile.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, "profile.md"), profileMarkdown(report));
  process.stdout.write(`The profile of ${id} on ${times.length} inputs of ${name} is in ${out}.\n`);
  return report;
}

if (process.argv[1]?.endsWith("profile.ts") === true) {
  profileMain(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
