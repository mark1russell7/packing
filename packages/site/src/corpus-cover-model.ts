// The corpus coverage of roadmap item k50 on the results page: the tiles, the grid of the dimension pairs and the table of one pair.
// The file `data/corpus-cover.json` comes from `packages/packing/bench/corpus-cover.ts`. This module holds no state.

import { esc } from "./format.ts";

/** The schema of the coverage file */
export const CORPUS_COVER_SCHEMA = "packing-corpus-cover/1";

/** The fields of `data/law-cover.json` for the line of the law pairs. */
export interface LawCoverCount {
  readonly covered: number;
  readonly pairs: number;
  readonly specs: number;
  readonly refused: number;
  readonly floor: number;
}

/** This function gives the line of the law pairs. A spec under the floor adds no pair, so the count is a lower bound. */
export function lawLine(cover: LawCoverCount): string {
  const all = cover.specs + cover.refused;
  return `The corpus emits at least ${cover.covered} of the ${cover.pairs} pairs of two item laws, read from the generated items. This is a lower bound: ${cover.refused} of ${all} specs have fewer than ${cover.floor} items, so they add no pair.`;
}

/** The largest share of the accent in a square. Above it, the text of a square has low contrast in one of the themes. */
const COVER_FILL = 0.45;

/** One dimension of the taxonomy */
export interface CoverDimension {
  name: string;
  values: string[];
}

/** The coverage of one corpus, or of the union with the id `all` */
export interface CoverView {
  id: string;
  specs: number;
  inputs: number;
  cells: number;
  cellShare: number;
  pairs: number;
  pairShare: number;
  values: number;
  empty: string[];
  grid: number[][];
}

/** The coverage file */
export interface CorpusCoverDoc {
  schema: string;
  dimensions: CoverDimension[];
  fullCells: number;
  fullPairs: number;
  fullValues: number;
  skipped: string[];
  views: CoverView[];
}

/** One square of the grid: a pair of dimensions */
export interface CoverSquare {
  /** The index of the pair in `grid` */
  pair: number;
  /** The index of the row dimension */
  row: number;
  /** The index of the column dimension */
  column: number;
  /** The count of the pairs of values with an input */
  covered: number;
  /** The count of all the pairs of values */
  total: number;
}

/** This function reads the coverage file. It throws an `Error` for another schema, or for a file with no view. */
export function parseCorpusCover(text: string): CorpusCoverDoc {
  const doc = JSON.parse(text) as CorpusCoverDoc;
  if (doc.schema !== CORPUS_COVER_SCHEMA) throw new Error(`The coverage file has the schema "${doc.schema}".`);
  if (doc.views.length === 0) throw new Error("The coverage file has no view.");
  return doc;
}

/** This function gives a share as a percent, with more places for a small share. */
export function percent(share: number): string {
  const value = share * 100;
  if (value === 0) return "0%";
  if (value < 0.001) return "under 0.001%";
  return `${value < 1 ? value.toFixed(3) : value.toFixed(1)}%`;
}

/** This function gives the squares of a view, in the order of `grid`. */
export function coverSquares(doc: CorpusCoverDoc, view: CoverView): CoverSquare[] {
  const count = doc.dimensions.length;
  const out: CoverSquare[] = [];
  for (let row = 0; row < count; row++) {
    for (let column = row + 1; column < count; column++) {
      const list = view.grid[out.length]!;
      out.push({ pair: out.length, row, column, covered: list.filter((n) => n > 0).length, total: list.length });
    }
  }
  return out;
}

/** This function gives the tiles of a view. */
export function coverTiles(doc: CorpusCoverDoc, view: CoverView): string {
  const tile = (value: string, label: string, note: string, share: number | null): string =>
    `<div class="tile cover"><span>${esc(label)}</span><b>${esc(value)}</b>${share === null ? "" : `<span class="cmeter" aria-hidden="true"><i style="width:${(share * 100).toFixed(1)}%"></i></span>`}<small>${esc(note)}</small></div>`;
  return [
    tile(percent(view.pairShare), "Pairs of values", `${view.pairs} of ${doc.fullPairs} pairs have an input`, view.pairShare),
    tile(`${view.values} of ${doc.fullValues}`, "Values of the dimensions", `${view.empty.length} values have no input`, view.values / doc.fullValues),
    tile(percent(view.cellShare), "Cells of the taxonomy", `${view.cells.toLocaleString("en-US")} of ${doc.fullCells.toLocaleString("en-US")} cells`, null),
  ].join("");
}

/** This function gives the grid of the pairs of dimensions. Each square is a button with the percent of its pairs. */
export function coverGrid(doc: CorpusCoverDoc, view: CoverView, selected: number): string {
  const squares = coverSquares(doc, view);
  const count = doc.dimensions.length;
  const heads = doc.dimensions
    .slice(1)
    .map((d, i) => `<span class="cover-grid-head" title="${esc(d.name)}">${i + 2}</span>`)
    .join("");
  const rows = doc.dimensions.slice(0, -1).map((d, row) => {
    const cells = [];
    for (let column = 1; column < count; column++) {
      const square = squares.find((s) => s.row === row && s.column === column);
      if (square === undefined) {
        cells.push(`<span class="cover-grid-none"></span>`);
        continue;
      }
      const value = Math.round((square.covered / square.total) * 100);
      const name = `${d.name} by ${doc.dimensions[column]!.name}: ${square.covered} of ${square.total} pairs`;
      cells.push(
        `<button type="button" class="cover-grid-cell" data-pair="${square.pair}" aria-pressed="${square.pair === selected}" aria-label="${esc(name)}" title="${esc(name)}" style="--fill:${Math.round(value * COVER_FILL)}%">${value}</button>`,
      );
    }
    return `<span class="cover-grid-name" title="${esc(d.name)}"><small>${row + 1}</small> <code>${esc(d.name)}</code></span>${cells.join("")}`;
  });
  return `<span></span>${heads}${rows.join("")}`;
}

/** This function gives the table of the inputs of one pair of dimensions. */
export function coverPairTable(doc: CorpusCoverDoc, view: CoverView, pair: number): string {
  const square = coverSquares(doc, view)[pair];
  if (square === undefined) throw new RangeError(`The view has no pair ${pair}.`);
  const row = doc.dimensions[square.row]!;
  const column = doc.dimensions[square.column]!;
  const list = view.grid[pair]!;
  const head = column.values.map((v) => `<th scope="col"><code>${esc(v)}</code></th>`).join("");
  const body = row.values
    .map((value, r) => {
      const cells = column.values.map((_, c) => {
        const n = list[r * column.values.length + c]!;
        return n === 0 ? `<td class="cempty">none</td>` : `<td>${n}</td>`;
      });
      return `<tr><th scope="row"><code>${esc(value)}</code></th>${cells.join("")}</tr>`;
    })
    .join("");
  return `<caption>The inputs for each pair of <code>${esc(row.name)}</code> and <code>${esc(column.name)}</code></caption><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody>`;
}

/** This function gives the line of the values with no input. */
export function coverEmptyLine(view: CoverView): string {
  if (view.empty.length === 0) return "Each value has an input.";
  return `No input has these values: ${view.empty.map((v) => `<code>${esc(v)}</code>`).join(" ")}`;
}
