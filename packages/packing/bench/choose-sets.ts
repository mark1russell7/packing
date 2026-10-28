// The choice of the sets of the per-cell portfolio of roadmap item k20, part 2 (`docs/BENCH.md`, "The per-cell portfolio").
// It reads the records of one run and writes `src/portfolio-sets.ts`. It does not start a packer.
//
// Start it with `node bench/choose-sets.ts <folder> --run <id>`. The folder holds `records.jsonl`, `corpus.json` and `run.json`.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cellKey,
  corpus,
  PORTFOLIO_FRAME_MS,
  portfolioCell,
  round3,
  THIN_INPUTS,
  toPackInput,
  type CorpusManifest,
  type PortfolioCellSets,
  type PortfolioEntry,
  type PortfolioSets,
  type PortfolioSize,
  type PortfolioTrainScore,
} from "@mark1russell7/packing";
import { COMPOSITE_IDS, ENTRIES } from "./entries.ts";
import { chooseSets, defaultCountOf, factsOf, prefixMedianMs, scoreText, type InputFacts, type RawScore } from "./portfolio.ts";
import type { ScreenRecord } from "./screen.ts";

/** The largest set of the table */
export const LARGEST_SET = 3;

/** The facts of the inputs of a run for the choice: the facts of each input, its cell key and its container shape. */
export interface ChoiceInput {
  id: string;
  cell: string;
  shape: string;
  facts: InputFacts;
}

/** This function gives the training score of a raw score for the table. */
function trainOf(s: RawScore): PortfolioTrainScore {
  const t = scoreText(s);
  return {
    inputs: t.inputs,
    hardRegret: t.hardRegret ?? 0,
    excessAreaRegret: t.excessAreaRegret ?? 0,
    fillRegret: t.fillRegret ?? 0,
    wins: t.wins,
    winShare: t.winShare,
    msMean: t.msMean ?? 0,
  };
}

/** This function chooses the sets of one group of inputs. A group with fewer than `THIN_INPUTS` inputs is thin and gets no set. */
export function setsOf(pool: readonly string[], inputs: readonly InputFacts[], thinLimit = THIN_INPUTS, frameMs = PORTFOLIO_FRAME_MS): PortfolioCellSets {
  if (inputs.length < thinLimit) return { inputs: inputs.length, thin: true };
  const chosen = chooseSets(pool, inputs, LARGEST_SET);
  const sets: Record<string, string[]> = {};
  const train: Record<string, PortfolioTrainScore> = {};
  for (const c of chosen) {
    sets[String(c.members.length)] = c.members;
    train[String(c.members.length)] = trainOf(c.score);
  }
  // The greedy sets grow one member at a time, so the set of 3 holds each prefix
  const largest = chosen.at(-1)!.members;
  const medians = prefixMedianMs(largest, inputs);
  return {
    inputs: inputs.length,
    thin: false,
    sets: sets as PortfolioCellSets["sets"] & object,
    train: train as PortfolioCellSets["train"] & object,
    prefixMedianMs: Object.fromEntries(medians.map((ms, p) => [String(p + 1), round3(ms)])) as PortfolioCellSets["prefixMedianMs"] & object,
    defaultMembers: defaultCountOf(medians, frameMs) as PortfolioSize,
  };
}

/**
 * This function gives the table of the per-cell portfolio from the records of a run. It chooses the sets on all the inputs.
 *
 * - The pool is each single entry of `bench/entries.ts` with a record, in the order of the entries. A composite entry is not in the pool.
 * - Each cell, each container shape and the group `all` get sets of 1, 2 and 3 members by `chooseSets`.
 * - A thin cell gets no set. `portfolioMembers` then uses the set of its shape.
 */
export function chooseTable(records: readonly ScreenRecord[], manifest: CorpusManifest, source: { run: string; commit: string }): PortfolioSets {
  const { inputs } = corpus(manifest.corpus, manifest.specs);
  const used = new Set(records.map((r) => r.strategy));
  const pool = ENTRIES.filter((e) => !COMPOSITE_IDS.has(e.id) && used.has(e.id)).map((e) => e.id);
  const facts = factsOf(pool, records);
  const rows: ChoiceInput[] = [];
  for (const [index, file] of inputs.entries()) {
    const f = facts.get(file.id);
    if (f === undefined) continue;
    rows.push({ id: file.id, cell: cellKey(portfolioCell(toPackInput(file))), shape: manifest.inputs[index]!.cell.containerShape, facts: f });
  }
  const group = (keyOf: (r: ChoiceInput) => string): Map<string, InputFacts[]> => {
    const out = new Map<string, InputFacts[]>();
    for (const r of rows) {
      const list = out.get(keyOf(r)) ?? [];
      list.push(r.facts);
      out.set(keyOf(r), list);
    }
    return new Map([...out.entries()].toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  };
  const cells = Object.fromEntries([...group((r) => r.cell)].map(([k, list]) => [k, setsOf(pool, list)]));
  const shapes = Object.fromEntries([...group((r) => r.shape)].map(([k, list]) => [k, setsOf(pool, list)]));
  const all = setsOf(
    pool,
    rows.map((r) => r.facts),
  );
  const ids = new Set<string>();
  for (const g of [all, ...Object.values(shapes), ...Object.values(cells)]) for (const list of Object.values(g.sets ?? {})) for (const id of list) ids.add(id);
  const entries: Record<string, PortfolioEntry> = {};
  for (const e of ENTRIES) {
    if (!ids.has(e.id)) continue;
    entries[e.id] = Object.keys(e.options).length === 0 ? { id: e.id, strategy: e.strategy } : { id: e.id, strategy: e.strategy, options: { ...e.options } };
  }
  return { source: { corpus: manifest.corpus, run: source.run, commit: source.commit, inputs: rows.length, frameMs: PORTFOLIO_FRAME_MS }, entries, all, shapes, cells };
}

/** This function writes the text of `src/portfolio-sets.ts` for a table. */
export function tableSource(table: PortfolioSets): string {
  return [
    "// This file is generated. Do not edit it. `bench/choose-sets.ts` writes it from the records of one run of `bench.yml`:",
    `// the corpus \`${table.source.corpus}\`, the run ${table.source.run} and the commit ${table.source.commit}.`,
    `// The sets of each cell come from all the ${table.source.inputs} inputs. A cell with fewer than ${THIN_INPUTS} inputs is thin.`,
    `// The default member count of a cell is the largest prefix with a median summed time of ${table.source.frameMs} ms or less on these CI records.`,
    "",
    'import type { PortfolioSets } from "./portfolio-cell.ts";',
    "",
    `/** The table of the per-cell portfolio: the sets of 1, 2 and 3 members of each cell, with their training scores. The run ${table.source.run} gives it. */`,
    `export const PORTFOLIO_SETS: PortfolioSets = ${JSON.stringify(table, null, 2)};`,
    "",
  ].join("\n");
}

/** This function reads JSON Lines records. */
export function readRecords(text: string): ScreenRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ScreenRecord);
}

/** This function starts the choice from the arguments of the command line. */
function main(argv: readonly string[]): void {
  const folder = argv[0];
  const runAt = argv.indexOf("--run");
  const outAt = argv.indexOf("--out");
  if (folder === undefined || runAt < 0 || argv[runAt + 1] === undefined) {
    throw new Error("Start the choice with: node bench/choose-sets.ts <folder> --run <id> [--out <file>]");
  }
  const records = readRecords(readFileSync(join(folder, "records.jsonl"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(folder, "corpus.json"), "utf8")) as CorpusManifest;
  const run = JSON.parse(readFileSync(join(folder, "run.json"), "utf8")) as { commit?: string };
  const table = chooseTable(records, manifest, { run: argv[runAt + 1]!, commit: run.commit ?? "unknown" });
  const out = outAt >= 0 && argv[outAt + 1] !== undefined ? argv[outAt + 1]! : new URL("../src/portfolio-sets.ts", import.meta.url);
  writeFileSync(out, tableSource(table));
  console.log(`The table has ${Object.keys(table.cells).length} cells, ${Object.values(table.cells).filter((c) => c.thin).length} of them thin.`);
}

if (process.argv[1]?.endsWith("choose-sets.ts") === true) main(process.argv.slice(2));
