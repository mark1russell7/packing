// The adaptive grid layout of roadmap item k28 (Jacobs, Li, Schrier, Bargeron and Salesin 2003): pages of a strip, a
// template of grid cells for each page, and a dynamic program that chooses the templates. No strategy and no default uses it.

import { marginOf, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { byRank } from "./frame.ts";

/** A cell of a grid template: a rectangle of whole grid tracks. The first column and the first row have the index 0. */
export interface GridCell {
  readonly column: number;
  readonly row: number;
  /** The count of the columns of the cell. */
  readonly columns: number;
  /** The count of the rows of the cell. */
  readonly rows: number;
}

/**
 * A template of a page: a grid of `columns` by `rows` tracks, and the cells of the items, in the reading order.
 * The template takes exactly one item for each cell. The `cost` is the score variable of the paper: a cost of 0 or more
 * that `gridTemplateLayout` adds for each page of the template (0 by default).
 */
export interface GridTemplate {
  readonly id: string;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly GridCell[];
  readonly cost?: number;
}

/** The options of `gridTemplateLayout`. */
export interface GridTemplateOptions {
  /** The height of each page. The pages stack down the strip, with the gap of the input between them. */
  readonly pageHeight: number;
  /** The templates of the style. The default is `GRID_TEMPLATES`. */
  readonly templates?: readonly GridTemplate[];
  /** The cost of each page, for the page turns. The default is 1. */
  readonly pageCost?: number;
}

/** The page of a layout: the id of its template and the ids of its items, in the order of the cells. */
export interface GridPage {
  readonly template: string;
  readonly items: readonly string[];
}

/** The result of `gridTemplateLayout`. */
export interface GridTemplateResult {
  readonly output: PackOutput;
  readonly pages: readonly GridPage[];
  /** The sum of the costs of the pages: the value that the dynamic program makes as small as possible. */
  readonly cost: number;
}

const cell = (column: number, row: number, columns: number, rows: number): GridCell => Object.freeze({ column, row, columns, rows });

/**
 * The default style: 10 templates on a grid of 6 by 6 tracks, with 1, 2, 3, 4, 6 or 9 cells. The template `one` fills
 * the page, so each item that fits a page has a layout.
 */
export const GRID_TEMPLATES: readonly GridTemplate[] = Object.freeze(
  [
    { id: "one", cells: [cell(0, 0, 6, 6)] },
    { id: "two-columns", cells: [cell(0, 0, 3, 6), cell(3, 0, 3, 6)] },
    { id: "two-rows", cells: [cell(0, 0, 6, 3), cell(0, 3, 6, 3)] },
    { id: "three-columns", cells: [cell(0, 0, 2, 6), cell(2, 0, 2, 6), cell(4, 0, 2, 6)] },
    { id: "three-rows", cells: [cell(0, 0, 6, 2), cell(0, 2, 6, 2), cell(0, 4, 6, 2)] },
    { id: "large-left", cells: [cell(0, 0, 4, 6), cell(4, 0, 2, 3), cell(4, 3, 2, 3)] },
    { id: "large-top", cells: [cell(0, 0, 6, 4), cell(0, 4, 3, 2), cell(3, 4, 3, 2)] },
    { id: "four", cells: [cell(0, 0, 3, 3), cell(3, 0, 3, 3), cell(0, 3, 3, 3), cell(3, 3, 3, 3)] },
    { id: "six", cells: [0, 1].flatMap((row) => [0, 1, 2].map((column) => cell(2 * column, 3 * row, 2, 3))) },
    { id: "nine", cells: [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => cell(2 * column, 2 * row, 2, 2))) },
  ].map((template) => Object.freeze({ id: template.id, columns: 6, rows: 6, cells: Object.freeze(template.cells) })),
);

/** The rectangle of a cell on a page, relative to the top left corner of the page. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The checked settings of a call. */
interface Settings {
  readonly width: number;
  readonly pageHeight: number;
  readonly gap: number;
  readonly pageCost: number;
  readonly templates: readonly GridTemplate[];
}

const finiteAtLeast = (value: number, low: number): boolean => Number.isFinite(value) && value >= low;
const wholeAtLeast = (value: number, low: number): boolean => Number.isInteger(value) && value >= low;

/** This function gives the reason that a template is not valid, or `null`. */
function templateRefusal(template: GridTemplate): string | null {
  const { id, columns, rows, cells } = template;
  if (!wholeAtLeast(columns, 1) || !wholeAtLeast(rows, 1)) return `template ${id} needs a whole count of columns and rows of 1 or more`;
  if (cells.length === 0) return `template ${id} has no cell`;
  if (!finiteAtLeast(template.cost ?? 0, 0)) return `template ${id} needs a finite cost of 0 or more`;
  const used = new Uint8Array(columns * rows);
  for (const [index, c] of cells.entries()) {
    const whole = wholeAtLeast(c.column, 0) && wholeAtLeast(c.row, 0) && wholeAtLeast(c.columns, 1) && wholeAtLeast(c.rows, 1);
    if (!whole || c.column + c.columns > columns || c.row + c.rows > rows) return `cell ${index} of template ${id} is not in its grid`;
    for (let row = c.row; row < c.row + c.rows; row++) {
      for (let column = c.column; column < c.column + c.columns; column++) {
        if (used[row * columns + column] === 1) return `cell ${index} of template ${id} overlaps another cell`;
        used[row * columns + column] = 1;
      }
    }
  }
  return null;
}

/** This function gives the reason that `gridTemplateLayout` refuses the options, or `null`. */
function optionsRefusal(options: GridTemplateOptions): string | null {
  if (!finiteAtLeast(options.pageHeight, 0) || options.pageHeight === 0) return "the page height needs a positive finite value";
  if (!finiteAtLeast(options.pageCost ?? 1, 0)) return "the page cost needs a finite value of 0 or more";
  const templates = options.templates ?? GRID_TEMPLATES;
  if (templates.length === 0) return "the style has no template";
  const ids = new Set<string>();
  for (const template of templates) {
    if (ids.has(template.id)) return `two templates have the id ${template.id}`;
    ids.add(template.id);
    const reason = templateRefusal(template);
    if (reason !== null) return reason;
  }
  return null;
}

/**
 * This function gives the reason that `gridTemplateLayout` refuses an input and its options, or `null` when it accepts them.
 *
 * The container is a strip of a fixed width, with no shape, no inset and no obstacle. The gap of the input is a number:
 * it is the space between the grid tracks and between the pages. The items are rectangles with no lock and no margin.
 * Each item fits the width of the strip and the height of a page, with no turn.
 */
export function gridTemplateRefusal(input: PackInput, options: GridTemplateOptions): string | null {
  const { container, items } = input;
  if (container.fixed !== "width") return "the container is not a strip of a fixed width";
  const width = container.w;
  if (width === undefined || !(width > 0) || !Number.isFinite(width)) return "the strip needs a positive finite width";
  if (container.shape !== undefined) return "the strip has a shape";
  if ((container.inset ?? 0) !== 0) return "the strip has an inset";
  if ((input.obstacles?.length ?? 0) > 0) return "the input has obstacles";
  if (!finiteAtLeast(input.gap ?? 0, 0)) return "the gap needs a finite number of 0 or more";
  if ((input.pairGaps?.length ?? 0) > 0) return "the input has gaps between pairs of items";
  const reason = optionsRefusal(options);
  if (reason !== null) return reason;
  for (const item of items) {
    if (!(item.w > 0) || !(item.h > 0) || !Number.isFinite(item.w) || !Number.isFinite(item.h)) return `item ${item.id} needs positive finite sizes`;
    if (item.shape !== undefined) return `item ${item.id} has a shape`;
    if (item.locked === true) return `item ${item.id} is locked`;
    const m = marginOf(item);
    if (m.top !== 0 || m.right !== 0 || m.bottom !== 0 || m.left !== 0) return `item ${item.id} has a margin`;
    if (item.w > width || item.h > options.pageHeight) return `item ${item.id} does not fit a page`;
  }
  return null;
}

/**
 * This function gives the rectangles of the cells of a template on a page of `width` by `height`.
 * A track of a grid of `count` tracks has the length `(length - (count - 1) gap) / count`, with the gap between two tracks.
 */
function cellBoxes(template: GridTemplate, width: number, height: number, gap: number): Box[] {
  const stepX = (width + gap) / template.columns;
  const stepY = (height + gap) / template.rows;
  return template.cells.map((c) => ({
    x: c.column * stepX,
    y: c.row * stepY,
    w: c.columns * stepX - gap,
    h: c.rows * stepY - gap,
  }));
}

/**
 * This function lays out the items of a strip on pages, with a template of grid cells for each page. It follows the
 * adaptive grid layout of Jacobs 2003. A style is a set of page templates, and a dynamic program over the pages
 * chooses the template of each page. It throws a `RangeError` for an input that `gridTemplateRefusal` refuses.
 *
 * 1. The items take the reading order of `byRank`, the order of the frame of each strategy.
 * 2. A template takes the next items of the order, one item for each cell. It accepts them only when each item fits its cell.
 * 3. A page costs `pageCost`, plus the cost of its template, plus the empty area of its cells as a share of the page.
 * 4. A dynamic program finds the least sum of the costs of the pages. It takes `O(n c)` time for the `n` items and
 *    the sum `c` of the counts of the cells of the templates.
 * 5. On a tie of cost, the function takes fewer pages. On a tie of both, it takes the template that comes first in the style.
 * 6. Each item goes to the top left corner of its cell. Page `p` starts at the height `p (pageHeight + gap)`.
 *
 * The paper does not give the terms of its cost or a set of templates. Thus the cost of step 3 and the templates of
 * `GRID_TEMPLATES` come from this package. The paper also counts widows and orphans of text, which a box does not have.
 * It throws a `RangeError` when no sequence of templates takes the items.
 *
 * @example
 * ```ts
 * const { output, pages } = gridTemplateLayout({ container: { fixed: "width", w: 600 }, gap: 8, items }, { pageHeight: 800 });
 * ```
 */
export function gridTemplateLayout(input: PackInput, options: GridTemplateOptions): GridTemplateResult {
  const reason = gridTemplateRefusal(input, options);
  if (reason !== null) throw new RangeError(`gridTemplateLayout: ${reason}`);
  const settings: Settings = {
    width: input.container.w!,
    pageHeight: options.pageHeight,
    gap: input.gap ?? 0,
    pageCost: options.pageCost ?? 1,
    templates: options.templates ?? GRID_TEMPLATES,
  };
  const order = byRank(input.items);
  const n = order.length;
  const pageArea = settings.width * settings.pageHeight;
  const boxes = settings.templates.map((template) => cellBoxes(template, settings.width, settings.pageHeight, settings.gap));
  // A small part of the width and the height covers the last bit of the sums of the tracks.
  const slackX = 1e-9 * settings.width;
  const slackY = 1e-9 * settings.pageHeight;

  // best[i] is the least cost of the items from i to the end, pages[i] its count of pages, and choice[i] the template of its first page.
  const best = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const pages = new Array<number>(n + 1).fill(0);
  const choice = new Array<number>(n + 1).fill(-1);
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (const [t, template] of settings.templates.entries()) {
      const cells = boxes[t]!;
      const end = i + cells.length;
      if (end > n || best[end] === Number.POSITIVE_INFINITY) continue;
      let empty = 0;
      let fits = true;
      for (const [k, box] of cells.entries()) {
        const item = order[i + k]!;
        if (item.w > box.w + slackX || item.h > box.h + slackY) {
          fits = false;
          break;
        }
        empty += Math.max(0, box.w * box.h - item.w * item.h);
      }
      if (!fits) continue;
      const cost = settings.pageCost + (template.cost ?? 0) + empty / pageArea + best[end]!;
      const count = pages[end]! + 1;
      if (cost < best[i]! || (cost === best[i]! && count < pages[i]!)) {
        best[i] = cost;
        pages[i] = count;
        choice[i] = t;
      }
    }
  }
  if (best[0] === Number.POSITIVE_INFINITY) throw new RangeError("gridTemplateLayout: no sequence of templates takes the items");

  const places = new Map<string, Placement>();
  const layout: GridPage[] = [];
  for (let i = 0, page = 0; i < n; page++) {
    const t = choice[i]!;
    const cells = boxes[t]!;
    const top = page * (settings.pageHeight + settings.gap);
    const ids: string[] = [];
    for (const [k, box] of cells.entries()) {
      const item = order[i + k]!;
      // The slack of a cell can put the far side of an item past the strip by the last bit. The clamp keeps it in the strip.
      places.set(item.id, { id: item.id, x: Math.min(box.x, settings.width - item.w), y: top + Math.min(box.y, settings.pageHeight - item.h) });
      ids.push(item.id);
    }
    layout.push({ template: settings.templates[t]!.id, items: ids });
    i += cells.length;
  }
  const height = layout.length === 0 ? 0 : layout.length * settings.pageHeight + (layout.length - 1) * settings.gap;
  const output: PackOutput = { placements: input.items.map((item) => places.get(item.id)!), overflow: [], size: { w: settings.width, h: height }, moved: [] };
  return { output, pages: layout, cost: best[0]! };
}
