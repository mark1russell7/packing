/**
 * The budget of a run: each pair of a strategy and an input has a wall budget. A run of all the entries then finishes.
 *
 * A pair runs in a child process, because a hard stop must work on code that does not return. A pair over its budget gets a record with
 * a lower limit on its time. After 2 such pairs of an entry at one size, the other pairs of the entry at that size and above do not start.
 * The pairs of an entry run in rising order of their size, so the stop comes early. `docs/BENCH.md` ("The budget of a pair") tells the rules.
 */
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { corpus, packWith, strategy, toPackInput, unsupportedOf } from "@mark1russell7/packing";
import { caseProgress, DEFAULT_OVERRUNS, startSupervisedProcess, superviseCases, type SupervisedCase, type SupervisedChild, type SupervisedEnd } from "@mark1russell7/rigor-bench/supervise";
import { entry } from "./entries.ts";
import { budgetSkips, checkDeclared, parseCorpus, runOfPairs, runPairs, type BenchEnv, type BenchOptions, type BenchPair, type BenchResult, type BudgetControl, type PairResults } from "./run.ts";

/** The count of items up to which a pair has the smaller budget. */
export const SMALL_ITEMS = 30;
/** The wall budget of a pair with up to `SMALL_ITEMS` items, in milliseconds. */
export const SMALL_PAIR_MS = 15_000;
/** The wall budget of a pair with more items, in milliseconds. */
export const PAIR_MS = 30_000;
/** A first pack over this time, in milliseconds, gives the pair 1 timed run and no warm-up. */
export const SLOW_PACK_MS = 1000;
/** The reason of a pair that passed its budget. */
export const OVER_BUDGET = "over budget";
/** The reason of a pair that did not start, after 2 overruns of its entry at its size or below. */
export const NOT_RUN_SIZE = "not run: over budget at this size";
/** The reason of a pair that did not start before the time limit of the job. */
export const NOT_RUN_JOB = "not run: job budget";
/** The entry of the control. A change of an entry under test does not touch it in the same run, and each job does the same work with it. */
export const CONTROL_ENTRY = "skyline";
/** The count of the keys of the control: the largest inputs of the corpus. */
export const CONTROL_INPUTS = 7;
/** The packs of each key of the control. Many packs keep a time over the resolution of the clock. */
export const CONTROL_PACKS = 20;

/** This function gives the wall budget of a pair from the count of its items, in milliseconds. */
export const pairBudgetMs = (items: number): number => (items <= SMALL_ITEMS ? SMALL_PAIR_MS : PAIR_MS);

/** The input of a pair, with its size. */
export interface SizedInput {
  id: string;
  nodes: number;
}

const caseId = (strategyId: string, input: string): string => `${strategyId}|${input}`;

/**
 * This function gives the cases of a run: for each entry, its inputs in rising order of their size.
 *
 * The group of a case is its entry and its rank is its count of items. So 2 overruns at one size stop the entry at that size and above.
 */
export function budgetCases(strategies: readonly string[], inputs: readonly SizedInput[]): SupervisedCase[] {
  const rising = [...inputs].sort((a, b) => a.nodes - b.nodes);
  return strategies.flatMap((id) => rising.map((input) => ({ id: caseId(id, input.id), budgetMs: pairBudgetMs(input.nodes), groups: { "": id }, rank: input.nodes })));
}

/** This function gives the reason, the facts and the pair of the end of a case. */
export function endFacts(end: SupervisedEnd): { reason: string; facts: { budgetMs: number; msAtLeast?: number; because?: string[] } } {
  if (end.kind === "over-budget") return { reason: OVER_BUDGET, facts: { budgetMs: end.budgetMs, msAtLeast: end.budgetMs } };
  return { reason: NOT_RUN_SIZE, facts: { budgetMs: end.budgetMs, because: [...end.because] } };
}

/** The file of a job: the options of a child. */
interface JobFile {
  corpusFile: string;
  corpusName: string;
  prediction: string;
  repeats?: number;
  warmup?: number;
  env: BenchEnv;
  commit?: string;
  slowPackMs: number;
  entryOptions?: BenchOptions["entryOptions"];
  progress: string;
  results: string;
}

/** The options of a child, or of the supervisor, from the file of the corpus. */
function benchOptions(job: Omit<JobFile, "progress" | "results">, strategies?: readonly string[]): BenchOptions {
  return {
    corpus: parseCorpus(readFileSync(job.corpusFile, "utf8"), job.corpusName),
    prediction: job.prediction,
    env: job.env,
    slowPackMs: job.slowPackMs,
    ...(job.repeats === undefined ? {} : { repeats: job.repeats }),
    ...(job.warmup === undefined ? {} : { warmup: job.warmup }),
    ...(job.commit === undefined ? {} : { commit: job.commit }),
    ...(job.entryOptions === undefined ? {} : { entryOptions: job.entryOptions }),
    ...(strategies === undefined ? {} : { strategies }),
  };
}

/** One line of the results of a child. */
interface PairLine extends PairResults {
  id: string;
}

/**
 * This function is the child of a run with a budget. It packs the pairs of a file in their order. It writes the results of each pair to the disk
 * before it tells the end of the pair. Thus the supervisor can stop it at each moment and keep each finished pair.
 */
export function runCases(jobFile: string, pairsFile: string): void {
  const job = JSON.parse(readFileSync(jobFile, "utf8")) as JobFile;
  const pairs = JSON.parse(readFileSync(pairsFile, "utf8")) as BenchPair[];
  const progress = caseProgress(job.progress);
  runPairs(
    benchOptions(job),
    pairs,
    (pair) => progress.start(caseId(pair.strategy, pair.input), ""),
    (pair, results) => {
      const id = caseId(pair.strategy, pair.input);
      const line: PairLine = { id, ...results };
      appendFileSync(job.results, `${JSON.stringify(line)}\n`);
      progress.end(id);
    },
  );
}

/** This function reads the lines of a file that are whole. A stop can leave the last line without its end. */
function readWholeLines<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  return text
    .slice(0, text.lastIndexOf("\n") + 1)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as T);
}

/**
 * This function times the control in this process, before the first pair: the same packs of the largest inputs for each job.
 * The times go to `controlFactor` of `@mark1russell7/rigor-bench` in the merge, with one group for each job and one key for each input.
 */
export function controlTimes(options: BenchOptions, clock: () => number = () => performance.now()): BudgetControl[] {
  const { manifest, inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  const control = entry(CONTROL_ENTRY);
  const s = strategy(control.strategy);
  const largest = inputs
    .map((file, index) => ({ file, index }))
    .filter(({ index }) => unsupportedOf(s.supports, manifest.inputs[index]!.cell) === undefined)
    .sort((a, b) => b.file.boxes.length - a.file.boxes.length)
    .slice(0, CONTROL_INPUTS);
  return largest.map(({ file }) => {
    const input = toPackInput(file);
    const at = clock();
    for (let i = 0; i < CONTROL_PACKS; i++) packWith(control.strategy, input, undefined, file.seed);
    return { key: `${CONTROL_ENTRY}|${file.id}`, ms: Math.round((clock() - at) * 1000) / 1000 };
  });
}

/** The options of `runBudgeted`. */
export interface BudgetedOptions {
  /** The file of the corpus, and its name. */
  corpusFile: string;
  corpusName: string;
  prediction: string;
  strategies: readonly string[];
  repeats?: number;
  warmup?: number;
  env: BenchEnv;
  commit?: string;
  /** The time limit of the pairs of the job, in minutes. The pairs that did not start get the reason `NOT_RUN_JOB`. */
  deadlineMinutes?: number;
  /** The options over the options of an entry. A test uses it. */
  entryOptions?: BenchOptions["entryOptions"];
  /** This function starts a child. The default is a process of `main.ts`. A test gives its own. */
  start?: (jobFile: string, pairsFile: string) => SupervisedChild;
  /** The clock of the supervisor. A test gives its own. */
  now?: () => number;
  /** The time between two reads of the progress of a child, in milliseconds. A test gives its own. */
  pollMs?: number;
}

/** This function starts a child process of this bench. */
function startChild(jobFile: string, pairsFile: string): SupervisedChild {
  return startSupervisedProcess([process.execPath, "--no-warnings", fileURLToPath(new URL("./main.ts", import.meta.url)), "run-cases", jobFile, pairsFile]);
}

/**
 * This function runs a corpus with a budget for each pair. The records have the order of `runBench`.
 *
 * - A pair over its budget gets a skipped record with `OVER_BUDGET` and `msAtLeast`.
 * - After 2 overruns of an entry at one size, its other pairs at that size and above get `NOT_RUN_SIZE`.
 * - At the time limit, the supervisor stops the child, and the pairs that did not finish get `NOT_RUN_JOB`.
 * - A child that ends early gives an error for its pair, and a new child goes on with the next pair. A child with no pair throws an `Error`.
 * - A corpus with `base` inputs throws a `RangeError`, because the order of the inputs and a child each lose the base.
 */
export async function runBudgeted(o: BudgetedOptions): Promise<BenchResult> {
  const shared = {
    corpusFile: o.corpusFile,
    corpusName: o.corpusName,
    prediction: o.prediction,
    env: o.env,
    slowPackMs: SLOW_PACK_MS,
    ...(o.repeats === undefined ? {} : { repeats: o.repeats }),
    ...(o.warmup === undefined ? {} : { warmup: o.warmup }),
    ...(o.commit === undefined ? {} : { commit: o.commit }),
    ...(o.entryOptions === undefined ? {} : { entryOptions: o.entryOptions }),
  };
  const options = benchOptions(shared, o.strategies);
  const { inputs } = corpus(options.corpus.corpus, options.corpus.specs);
  if (inputs.some((file) => file.base !== undefined)) throw new RangeError(`The corpus ${o.corpusName} has inputs with a base, and a run with a budget does not support them.`);
  // A false claim stops the run before the first packing
  checkDeclared(options.corpus, inputs.map(toPackInput));

  const sized = inputs.map((file) => ({ id: file.id, nodes: file.boxes.length + (file.obstacles?.length ?? 0) }));
  const cases = budgetCases(o.strategies, sized);
  const pairOf = new Map(o.strategies.flatMap((strategyId) => inputs.map((file) => [caseId(strategyId, file.id), { strategy: strategyId, input: file.id }] as const)));
  const control = controlTimes(options);

  const dir = mkdtempSync(join(tmpdir(), "packing-budget-"));
  const jobFile = join(dir, "job.json");
  const progressFile = join(dir, "progress.jsonl");
  const resultsFile = join(dir, "results.jsonl");
  writeFileSync(jobFile, JSON.stringify({ ...shared, progress: progressFile, results: resultsFile } satisfies JobFile));

  const start = o.start ?? startChild;
  let children = 0;
  let current: SupervisedChild | undefined;
  let expired = false;
  const atDeadline = (): void => {
    expired = true;
    current?.stop();
  };
  const deadline = o.deadlineMinutes === undefined ? undefined : setTimeout(atDeadline, o.deadlineMinutes * 60_000);

  const ends: SupervisedEnd[] = [];
  const crashes: { id: string; code: number | null }[] = [];
  let left: readonly string[] = [];
  try {
    for (;;) {
      const results = readWholeLines<PairLine>(resultsFile);
      const done = new Set([...results.map((line) => line.id), ...crashes.map((crash) => crash.id)]);
      const before = results.length;
      const result = await superviseCases({
        cases,
        done,
        earlier: ends,
        progressFile,
        overruns: DEFAULT_OVERRUNS,
        ...(o.pollMs === undefined ? {} : { pollMs: o.pollMs }),
        ...(o.now === undefined ? {} : { now: o.now }),
        onEnd: () => undefined,
        start: (ids) => {
          // A stop at the time limit and an overrun can come together: then no new child starts
          if (expired) return { stop: () => undefined, exited: Promise.resolve(null) };
          children += 1;
          const pairsFile = join(dir, `pairs-${children}.json`);
          writeFileSync(pairsFile, JSON.stringify(ids.map((id) => pairOf.get(id))));
          current = start(jobFile, pairsFile);
          return current;
        },
      });
      ends.push(...result.ends);
      left = result.left;
      if (left.length === 0 || expired) break;
      // A child ended early. Its pair is the first that has no result. A child with no new pair and no started pair ends the run.
      const started = readWholeLines<{ event: string; id: string }>(progressFile).filter((event) => event.event === "start");
      const finished = new Set(readWholeLines<PairLine>(resultsFile).map((line) => line.id));
      const crashed = started.at(-1)?.id;
      if (crashed === undefined || finished.has(crashed)) {
        if (readWholeLines<PairLine>(resultsFile).length > before) continue;
        throw new Error(`A child of the budget ended with the code ${result.code} before its first pair.`);
      }
      crashes.push({ id: crashed, code: result.code });
    }

    const lines = readWholeLines<PairLine>(resultsFile);
    const finished = new Set(lines.map((line) => line.id));
    const merged: PairResults = { records: lines.flatMap((line) => line.records), skipped: lines.flatMap((line) => line.skipped), errors: lines.flatMap((line) => line.errors) };
    const budgetOf = new Map(cases.map((c) => [c.id, c.budgetMs]));
    const skipOf = budgetSkips(options);
    const stop = (id: string, reason: string, facts: { budgetMs: number; msAtLeast?: number; because?: string[] }): void => {
      if (finished.has(id)) return;
      finished.add(id);
      const { skip, record } = skipOf(pairOf.get(id)!, reason, facts);
      merged.skipped.push(skip);
      merged.records.push(record);
    };
    for (const end of ends) {
      const { reason, facts } = endFacts(end);
      stop(end.id, reason, facts);
    }
    for (const crash of crashes) {
      const pair = pairOf.get(crash.id)!;
      merged.errors.push({ strategy: pair.strategy, input: pair.input, message: `The child process of the pair ended with the code ${crash.code}.` });
    }
    for (const id of left) stop(id, NOT_RUN_JOB, { budgetMs: budgetOf.get(id)! });

    // The records go back to the order of a run with no budget
    const orderOfStrategy = new Map(o.strategies.map((id, index) => [id, index]));
    const orderOfInput = new Map(inputs.map((file, index) => [file.id, index]));
    const order = (a: { strategy: string; input: string }, b: { strategy: string; input: string }): number => orderOfStrategy.get(a.strategy)! - orderOfStrategy.get(b.strategy)! || orderOfInput.get(a.input)! - orderOfInput.get(b.input)!;
    merged.records.sort(order);
    merged.skipped.sort(order);
    merged.errors.sort(order);

    const result = runOfPairs(options, merged);
    result.run.budget = {
      smallPairMs: SMALL_PAIR_MS,
      smallItems: SMALL_ITEMS,
      pairMs: PAIR_MS,
      slowPackMs: SLOW_PACK_MS,
      overruns: DEFAULT_OVERRUNS,
      ...(o.deadlineMinutes === undefined ? {} : { deadlineMinutes: o.deadlineMinutes }),
      control: { entry: CONTROL_ENTRY, packs: CONTROL_PACKS, source: "pack" },
      jobs: [{ job: o.strategies.join("+"), control, children }],
    };
    return result;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    rmSync(dir, { recursive: true, force: true });
  }
}
