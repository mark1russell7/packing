// The paired time test of two versions of the packer (`docs/BENCH.md`, "A paired time test"). The workflow `paired.yml` starts it in CI.
//
//   node bench/paired.ts --corpus <name> --strategy <id> --arm-a <dir> --arm-b <dir> --prediction <id> [--repeats 5] [--warmup 2] [--out dir]
//
// An arm is a checkout of the repository with its dependencies. The script loads both arms in one process. For each input,
// it does the warm-up passes of each arm, then the timed passes in the order ABBA. Thus a drift of the runner cancels in the ratio.
// The times of a local computer do not count.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { corpus, outputHash, round3, toPackInput, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { median, parseCorpus } from "./run.ts";

/** The function `packWith` of one arm. */
export type PackFn = (id: string, input: PackInput, options?: unknown, seed?: number) => PackOutput;

/** One record of a paired run: the median times and the placement hashes of the two arms on one input. */
export interface PairedRecord {
  input: string;
  set: string;
  /** The median time of the arm A, in milliseconds */
  msA: number;
  /** The median time of the arm B, in milliseconds */
  msB: number;
  /** The value `msB / msA` */
  ratio: number;
  hashA: string;
  hashB: string;
  /** The error of an arm on this input. A record with an error has no times. */
  error?: string;
}

/** The summary of one group of paired records. */
export interface PairedGroup {
  inputs: number;
  /** The median of the ratios of the group */
  medianRatio: number;
  /** The median time of the arm A, in milliseconds */
  medianMsA: number;
  /** The median time of the arm B, in milliseconds */
  medianMsB: number;
}

/** The summary of a paired run. */
export interface PairedSummary {
  inputs: number;
  errors: number;
  hashesEqual: number;
  /** The free-size rect inputs with 100 items */
  slow: PairedGroup;
  /** The other inputs */
  other: PairedGroup;
  /** The other inputs by their class: the family of the set and the count of the items */
  classes: Record<string, PairedGroup>;
}

/** The pattern of the free-size rect inputs with 100 items: the slow set of roadmap item k67. */
export const SLOW_SET = /free(Area|Aspect)\.rect\.none\.[A-Za-z]+\.(free|soft)\.n100\//;

/** This function gives the order of the timed passes of one input: the arm 0 or 1 for each pass, in ABBA order. */
export function abbaOrder(repeats: number): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (let r = 0; r < repeats; r++) out.push(...(r % 2 === 0 ? ([0, 1] as const) : ([1, 0] as const)));
  return out;
}

/** This function gives the class of an input id: the first two parts of its set and the count of the items, or `n?`. */
export function classOf(input: string): string {
  const set = input.split("/")[1] ?? input;
  const n = /\.n(\d+)\//.exec(input)?.[1];
  return `${set.split(".").slice(0, 2).join(".")} n${n ?? "?"}`;
}

/** This function gives the summary of a group of records without an error. */
function groupOf(records: readonly PairedRecord[]): PairedGroup {
  return {
    inputs: records.length,
    medianRatio: records.length === 0 ? Number.NaN : round3(median(records.map((r) => r.ratio))),
    medianMsA: records.length === 0 ? Number.NaN : round3(median(records.map((r) => r.msA))),
    medianMsB: records.length === 0 ? Number.NaN : round3(median(records.map((r) => r.msB))),
  };
}

/** This function gives the summary of the records of a paired run. */
export function pairedSummary(records: readonly PairedRecord[]): PairedSummary {
  const ok = records.filter((r) => r.error === undefined);
  const other = ok.filter((r) => !SLOW_SET.test(r.input));
  const byClass = new Map<string, PairedRecord[]>();
  for (const r of other) byClass.set(classOf(r.input), [...(byClass.get(classOf(r.input)) ?? []), r]);
  const classes: Record<string, PairedGroup> = {};
  for (const key of [...byClass.keys()].sort()) classes[key] = groupOf(byClass.get(key)!);
  return {
    inputs: records.length,
    errors: records.length - ok.length,
    hashesEqual: ok.filter((r) => r.hashA === r.hashB).length,
    slow: groupOf(ok.filter((r) => SLOW_SET.test(r.input))),
    other: groupOf(other),
    classes,
  };
}

/** This function gives the Markdown table of a summary. */
export function pairedMarkdown(s: PairedSummary, prediction: string): string {
  const row = (name: string, g: PairedGroup): string => `| ${name} | ${g.inputs} | ${g.medianMsA} | ${g.medianMsB} | ${g.medianRatio} |`;
  const out = [
    "# A paired time test",
    "",
    `- Prediction: \`${prediction}\``,
    `- Inputs: ${s.inputs}, errors: ${s.errors}, equal hashes: ${s.hashesEqual}`,
    "",
    "| Group | Inputs | Median ms A | Median ms B | Median ratio B / A |",
    "|---|---|---|---|---|",
    row("slow set", s.slow),
    row("other", s.other),
    ...Object.entries(s.classes).map(([k, g]) => row(k, g)),
    "",
  ];
  return out.join("\n");
}

/** This function times one input with the two arms. Each arm gets its own copy of the input. */
export function pairInput(packs: readonly [() => PackOutput, () => PackOutput], repeats: number, warmup: number, clock: () => number): { ms: [number, number]; outputs: [PackOutput, PackOutput] } {
  const outputs = [packs[0](), packs[1]()] as [PackOutput, PackOutput];
  for (let w = 0; w < warmup; w++) for (const pack of packs) pack();
  const times: [number[], number[]] = [[], []];
  for (const arm of abbaOrder(repeats)) {
    const start = clock();
    packs[arm]();
    times[arm].push(clock() - start);
  }
  return { ms: [median(times[0]), median(times[1])], outputs };
}

/** The value of an option `--name value`, or `undefined`. */
function opt(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`The option ${name} needs a value.`);
  return value;
}

/** A whole number option of `least` or more. */
function count(argv: readonly string[], name: string, fallback: number, least = 1): number {
  const text = opt(argv, name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text) || Number(text) < least) throw new Error(`The option ${name} is a whole number of ${least} or more, not "${text}".`);
  return Number(text);
}

/** This function loads the function `packWith` of the arm in a checkout of the repository. */
async function loadArm(dir: string): Promise<PackFn> {
  const mod = (await import(pathToFileURL(join(resolve(dir), "packages", "packing", "src", "index.ts")).href)) as { packWith: PackFn };
  if (typeof mod.packWith !== "function") throw new Error(`The arm ${dir} has no function packWith.`);
  return mod.packWith;
}

/** This function starts the paired test from the arguments of the command line, and writes the files of the report. */
export async function pairedMain(argv: readonly string[]): Promise<PairedSummary> {
  const name = opt(argv, "--corpus");
  const id = opt(argv, "--strategy");
  const dirA = opt(argv, "--arm-a");
  const dirB = opt(argv, "--arm-b");
  const prediction = opt(argv, "--prediction");
  if (name === undefined || id === undefined || dirA === undefined || dirB === undefined || prediction === undefined)
    throw new Error("The options --corpus, --strategy, --arm-a, --arm-b and --prediction are necessary.");
  const repeats = count(argv, "--repeats", 5);
  const warmup = count(argv, "--warmup", 2, 0);
  const out = resolve(opt(argv, "--out") ?? "paired");
  const [packA, packB] = [await loadArm(dirA), await loadArm(dirB)];
  const { inputs } = corpus(name, parseCorpus(readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8"), name).specs);
  const records: PairedRecord[] = [];
  for (const file of inputs) {
    const head = { input: file.id, set: file.set };
    try {
      const packs = [() => packA(id, toPackInput(file), undefined, file.seed), () => packB(id, toPackInput(file), undefined, file.seed)] as const;
      const { ms, outputs } = pairInput(packs, repeats, warmup, () => performance.now());
      records.push({ ...head, msA: round3(ms[0]), msB: round3(ms[1]), ratio: ms[0] > 0 ? ms[1] / ms[0] : 1, hashA: outputHash(outputs[0]), hashB: outputHash(outputs[1]) });
    } catch (error) {
      records.push({ ...head, msA: 0, msB: 0, ratio: 1, hashA: "", hashB: "", error: error instanceof Error ? error.message : String(error) });
    }
  }
  const summary = pairedSummary(records);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(out, "summary.json"), `${JSON.stringify({ corpus: name, strategy: id, prediction, repeats, warmup, summary }, null, 2)}\n`);
  writeFileSync(join(out, "summary.md"), pairedMarkdown(summary, prediction));
  process.stdout.write(`The paired test of ${id} on ${records.length} inputs of ${name} is in ${out}.\n`);
  return summary;
}

if (process.argv[1]?.endsWith("paired.ts") === true) {
  pairedMain(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
