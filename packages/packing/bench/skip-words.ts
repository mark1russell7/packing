// The word of each skip (`docs/BENCH.md`, "The word of a skip"). A strategy refuses a cell for one of four reasons, and a
// reader of the results needs that reason. A limit of the entry itself is coverage still owed. A named composition, another algorithm
// and no meaning are not owed by the entry (roadmap item k198).
// A person reads each row from the source of the strategy. So a pair outside this table reads `not read`, and no pair gets a word by default.

import { unsupportedOf, type Dimension, type Supports } from "@mark1russell7/packing";

/**
 * The word of a skip. The word `not done` is a limit that the entry itself can lift. The word `composition` is a limit that a named
 * composition of the entry lifts, so the entry keeps its refusal. The word `not read` tells that nobody has read the pair of entry and reason.
 */
export type SkipWord = "not done" | "composition" | "other algorithm" | "no meaning" | "not read";

/** The read of one pair of entry and reason. */
export interface SkipRead {
  readonly word: SkipWord;
  /** The reason of the word. The word `not read` has none. */
  readonly why?: string;
}

/** One row of the table: the pairs of each entry with each reason, with one word. */
export interface SkipRow {
  readonly entries: readonly string[];
  readonly reasons: readonly string[];
  readonly word: Exclude<SkipWord, "not read">;
  readonly why: string;
}

const FREE_FORMS: readonly string[] = ["unsupported containerSize: freeArea", "unsupported containerSize: freeAspect"];
const SHAPES: readonly string[] = ["circle", "convex", "ellipse", "holes", "polygon"].map((shape) => `unsupported containerShape: ${shape}`);

/** The table of the words. It holds each skip of `pack-free-v1` in run 41975155011. The same refusal has the same word on another corpus. */
export const SKIP_ROWS: readonly SkipRow[] = [
  {
    entries: [
      "beam",
      "binary-height",
      "exact-strip",
      "force-maxrects-bl",
      "force-rows",
      "force-skyline-bl-waste",
      "near-rects",
      "overlap-min-maxrects-bl-k8192",
      "overlap-min-skyline-k8192",
      "raster-nofit",
      "relax-maxrects-bl",
      "relax-rows",
      "relax-skyline-bl-waste",
      "shelf-breaks",
      "shelf-floor-ceiling",
      "shelf-knapsack",
      "shelf-online",
      "shelf-split-fit",
      "side-anchors-first-left",
      "sleator",
    ],
    reasons: FREE_FORMS,
    word: "composition",
    why: "A width search over the strategy gives each free form. The function `aspectFit` is that composition, and item k166 adds it as a named entry.",
  },
  {
    entries: ["push"],
    reasons: FREE_FORMS,
    word: "no meaning",
    why: "The strategy `push` changes an earlier layout. An offline input has no earlier layout. Item k159 reads it on a chain of changes.",
  },
  {
    entries: ["treemap-pivot-middle", "treemap-pivot-size", "treemap-pivot-split", "treemap-slice-dice", "treemap-spiral", "treemap-squarified", "treemap-strip"],
    reasons: SHAPES,
    word: "other algorithm",
    why: "A treemap cuts a rectangle into cells. This shape needs another partition, for example a Voronoi treemap or a circle treemap.",
  },
  {
    entries: ["columns-linear-partition"],
    reasons: SHAPES,
    word: "other algorithm",
    why: "The cut reads the height of a column as a sum of boxes. A column with a gap in the shape has no such sum, so it needs another cut.",
  },
  {
    entries: ["bottom-left", "bottom-left-liu-teng"],
    reasons: SHAPES,
    word: "not done",
    why: "Each box slides through free space, and `FreeSpace` knows each shape. Item k169 lifts it.",
  },
  {
    entries: ["best-fit", "best-fit-short", "best-fit-tall"],
    reasons: SHAPES,
    word: "not done",
    why: "The search for a gap reads one skyline, and the strategy `skyline` reads `FreeSpace` for each shape. Item k169 lifts it.",
  },
  {
    entries: ["masonry-lpt", "masonry-shortest"],
    reasons: SHAPES,
    word: "not done",
    why: "Each box goes to the lowest free place of a column, and `FreeSpace` gives the free spans of a column. The bound of Graham then does not hold. Item k169 lifts it.",
  },
  {
    entries: ["best-fit", "best-fit-short", "best-fit-tall"],
    reasons: ["unsupported order: soft"],
    word: "not done",
    why: "The search picks the box that fits a gap, so a rank can break the ties. Item k166 reads this form with the free forms.",
  },
];

/**
 * The words that leave a refused record out of the measured share of an entry (roadmap item k197). The entry has no defined result there:
 * another algorithm gives it, or the form has no meaning for the entry. The words `not done` and `not read` stay in the share.
 */
export const LEFT_OUT_WORDS = ["other algorithm", "no meaning"] as const;

/** A word of `LEFT_OUT_WORDS`. */
export type LeftOutWord = (typeof LEFT_OUT_WORDS)[number];

/** This function gives the word of a pair of entry and reason when the word leaves the record out of the share, or `undefined`. */
export function leftOutWord(entry: string, reason: string, rows: readonly SkipRow[] = SKIP_ROWS): LeftOutWord | undefined {
  const word = skipRead(entry, reason, rows).word;
  return (LEFT_OUT_WORDS as readonly string[]).includes(word) ? (word as LeftOutWord) : undefined;
}

/** This function gives the word of a pair of entry and reason. A pair outside `rows` reads `not read`. */
export function skipRead(entry: string, reason: string, rows: readonly SkipRow[] = SKIP_ROWS): SkipRead {
  const row = rows.find((r) => r.entries.includes(entry) && r.reasons.includes(reason));
  return row === undefined ? { word: "not read" } : { word: row.word, why: row.why };
}

/** This function reads the cell of a reason of `skipReason` of the runner. Another reason gives `undefined`. */
export function cellOfReason(reason: string): { dimension: Dimension; value: string } | undefined {
  const m = /^unsupported (\w+): (.+)$/.exec(reason);
  return m === null ? undefined : { dimension: m[1] as Dimension, value: m[2]! };
}

/**
 * This function gives the pairs of `rows` that no longer hold. A strategy that takes the cell of its row has no skip to explain.
 * A reason that does not name a cell is a fault too, because no reader can then test its row.
 */
export function staleRows(rows: readonly SkipRow[], supportsOf: (entry: string) => Supports): string[] {
  return rows.flatMap((row) =>
    row.entries.flatMap((entry) =>
      row.reasons.flatMap((reason) => {
        const cell = cellOfReason(reason);
        if (cell === undefined) return [`${entry}: the reason "${reason}" names no cell`];
        return unsupportedOf(supportsOf(entry), { [cell.dimension]: cell.value }) === undefined ? [`${entry}: the strategy takes ${cell.dimension} ${cell.value}`] : [];
      }),
    ),
  );
}
