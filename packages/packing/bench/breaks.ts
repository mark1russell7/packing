// The read of roadmap item k29: the shelf with the best breaks against the greedy shelf in the input order, on the strips of a corpus.
// The prediction packing-k29-optimal-breaks names this read. It packs each input two times and writes one JSON line.
//
//   node --no-warnings bench/breaks.ts                    reads the corpus pack-screen-v1
//   node --no-warnings bench/breaks.ts pack-strip-v1      reads another corpus of bench/corpora

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { corpus, packWith, shelfBreaks, shelfBreaksRefusal, toPackInput, type CorpusSpec, type PackInput } from "@mark1russell7/packing";

/** The read of one corpus. */
export interface BreaksRead {
  readonly corpus: string;
  /** The count of the inputs of the corpus. */
  readonly inputs: number;
  /** The count of the inputs that `shelfBreaksRefusal` accepts. Each other count is of these inputs. */
  readonly accepted: number;
  /** The counts of the refusals, by reason, with each item id replaced by `<id>`. */
  readonly refused: Readonly<Record<string, number>>;
  /** The count of the inputs where the best breaks give a larger height than the greedy shelf. The claim of k29 is 0. */
  readonly higher: number;
  /** The count of the inputs where the best breaks give a smaller height. */
  readonly lower: number;
  /** The mean of the height of the best breaks divided by the height of the greedy shelf. */
  readonly meanRatio: number;
  /** The smallest ratio. */
  readonly minRatio: number;
}

/** This function compares the two shelves on each input that `shelfBreaksRefusal` accepts. */
export function breaksRead(name: string, inputs: readonly PackInput[]): BreaksRead {
  const refused: Record<string, number> = {};
  let accepted = 0;
  let higher = 0;
  let lower = 0;
  let sum = 0;
  let minRatio = 1;
  for (const input of inputs) {
    const reason = shelfBreaksRefusal(input);
    if (reason !== null) {
      const key = reason.replace(/^item \S+/, "item <id>");
      refused[key] = (refused[key] ?? 0) + 1;
      continue;
    }
    accepted += 1;
    const best = shelfBreaks(input).height;
    const greedy = packWith("shelf", input, { sortOrder: "input" }).size.h;
    if (best > greedy) higher += 1;
    if (best < greedy) lower += 1;
    const ratio = greedy === 0 ? 1 : best / greedy;
    sum += ratio;
    minRatio = Math.min(minRatio, ratio);
  }
  return { corpus: name, inputs: inputs.length, accepted, refused, higher, lower, meanRatio: accepted === 0 ? 1 : sum / accepted, minRatio };
}

/** This function gives the inputs of a corpus file of `bench/corpora`. */
export function corpusInputs(name: string): PackInput[] {
  const file = JSON.parse(readFileSync(join(import.meta.dirname, "corpora", `${name}.json`), "utf8")) as { specs: CorpusSpec[] };
  return corpus(name, file.specs).inputs.map(toPackInput);
}

if (process.argv[1]?.endsWith("breaks.ts")) {
  const name = process.argv[2] ?? "pack-screen-v1";
  console.log(JSON.stringify(breaksRead(name, corpusInputs(name))));
}
