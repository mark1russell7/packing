// The read of roadmap item k30: the online shelf against its bound and against the greedy shelf in the input order, on the strips of a corpus.
// The prediction packing-k30-online-shelf names this read. It packs each input three times and writes one JSON line.
//
//   node --no-warnings bench/online.ts                    reads the corpus pack-strip-v1
//   node --no-warnings bench/online.ts pack-screen-v1     reads another corpus of bench/corpora

import { packWith, shelfOnline, shelfOnlineRefusal, type PackInput, type ShelfOnlineFit } from "@mark1russell7/packing";
import { corpusInputs } from "./breaks.ts";

/** The read of one fit on one corpus. */
export interface OnlineFitRead {
  /** The count of the inputs with a height at or over the bound of Baker 1983. The claim of k30 is 0. */
  readonly over: number;
  /** The mean of the height of the online shelf divided by the height of the greedy shelf. */
  readonly meanRatio: number;
  /** The largest ratio. */
  readonly maxRatio: number;
  /** The largest height divided by its bound. It is less than 1 when no input is over the bound. */
  readonly maxOfBound: number;
}

/** The read of one corpus. */
export interface OnlineRead {
  readonly corpus: string;
  /** The ratio `r` of the classes of height. */
  readonly r: number;
  /** The count of the inputs of the corpus. */
  readonly inputs: number;
  /** The count of the inputs that `shelfOnlineRefusal` accepts. Each other count is of these inputs. */
  readonly accepted: number;
  /** The counts of the refusals, by reason, with each item id replaced by `<id>`. */
  readonly refused: Readonly<Record<string, number>>;
  /** The read of each fit. */
  readonly fits: Readonly<Record<ShelfOnlineFit, OnlineFitRead>>;
}

/** This function gives the bound of Baker 1983 for an input: `2 / r` times the area over the width, plus `hmax / (r (1 - r))`. */
export function onlineBound(input: PackInput, r: number): number {
  const width = input.container.w!;
  const area = input.items.reduce((sum, item) => sum + item.w * item.h, 0);
  const tallest = input.items.reduce((most, item) => Math.max(most, item.h), 0);
  return ((2 / r) * area) / width + tallest / (r * (1 - r));
}

/** This function compares the online shelf with its bound and with the greedy shelf, on each input that `shelfOnlineRefusal` accepts. */
export function onlineRead(name: string, inputs: readonly PackInput[], r = 0.5): OnlineRead {
  const refused: Record<string, number> = {};
  const sums = { next: { over: 0, sum: 0, max: 0, bound: 0 }, first: { over: 0, sum: 0, max: 0, bound: 0 } };
  let accepted = 0;
  for (const input of inputs) {
    const reason = shelfOnlineRefusal(input);
    if (reason !== null) {
      const key = reason.replace(/^item \S+/, "item <id>");
      refused[key] = (refused[key] ?? 0) + 1;
      continue;
    }
    accepted += 1;
    const greedy = packWith("shelf", input, { sortOrder: "input" }).size.h;
    const bound = onlineBound(input, r);
    for (const fit of ["next", "first"] as const) {
      const height = shelfOnline(input, { r, fit }).height;
      const s = sums[fit];
      if (input.items.length > 0 && height >= bound) s.over += 1;
      const ratio = greedy === 0 ? 1 : height / greedy;
      s.sum += ratio;
      s.max = Math.max(s.max, ratio);
      if (bound > 0) s.bound = Math.max(s.bound, height / bound);
    }
  }
  const fitRead = (fit: ShelfOnlineFit): OnlineFitRead => {
    const s = sums[fit];
    return { over: s.over, meanRatio: accepted === 0 ? 1 : s.sum / accepted, maxRatio: s.max, maxOfBound: s.bound };
  };
  return { corpus: name, r, inputs: inputs.length, accepted, refused, fits: { next: fitRead("next"), first: fitRead("first") } };
}

if (process.argv[1]?.endsWith("online.ts")) {
  const name = process.argv[2] ?? "pack-strip-v1";
  console.log(JSON.stringify(onlineRead(name, corpusInputs(name))));
}
