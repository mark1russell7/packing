// The shared steps of the strategies of `pack` (`rows`, `skyline`, `shelf`, `maxrects` and `guillotine`). Each strategy has
// its own module and gives its own packer, so the module of one strategy does not import the other packers (roadmap item k132).

import type { PackInput, PackOutput } from "./contract.ts";
import { buildFrame, frameLinks, frameTurn, now, outerOf, readFrame, rectsOf, viaAxes, type Frame, type FrameTurns } from "./frame.ts";
import { packFreeWith } from "./free-width.ts";
import type { GuillotineChoice, GuillotineSplit } from "./guillotine.ts";
import type { MaxRectsRule } from "./maxrects.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";
import type { ItemLink, ItemOrder } from "./order.ts";
import { packSized, type PackLayoutOptions, type Placer } from "./pack-sized.ts";
import { Rect } from "./rect.ts";
import type { ShelfFit } from "./shelf.ts";
import type { SkylineRule } from "./skyline.ts";
import { spaceOf } from "./space.ts";
import { assertSupported, cellOf, UnsupportedCell, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The options of the strategies `rows`, `skyline` and `shelf`. */
export interface LayoutStrategyOptions {
  /**
   * The order of the items before the packing. The items are in the order of their rank first. A graph order
   * (`graph-bfs`) reads `input.links`.
   */
  sortOrder: ItemOrder;
  /** The number of widths that the first pass of the size search `log-sweep` tries. */
  samples: number;
  /**
   * The rule of `shelf` to choose a shelf: a value of `SHELF_FITS`. Only `shelf` reads it. Without it, `shelf` packs
   * as in 0.2.3. With it, the trace also counts `move.firstFit` and `move.bestFit`.
   */
  fit?: ShelfFit;
}

/** The options of the strategy `maxrects`. The strategy does not read `fit`. */
export interface MaxRectsStrategyOptions extends LayoutStrategyOptions {
  /** The rule to choose a free rectangle: `bssf` (the default), `blsf`, `baf`, `bl`, `cp` or `wire`. `MAXRECTS_RULES` tells each rule. */
  rule: MaxRectsRule;
  /** The value `true` lets each turnable item that is not locked turn by 90 degrees. The default is `false`. */
  rotate: boolean;
  /**
   * The largest height of a band of the approximation of a container that is not a plain rectangle. `MaxRectsOptions`
   * tells the default.
   */
  bandHeight?: number;
}

/** The id of a strategy of `pack`. */
export type LayoutId = "rows" | "skyline" | "shelf" | "maxrects" | "guillotine";

/** The options of a strategy of `pack`: the options of `maxrects` are optional for the other strategies. */
export type AnyLayoutOptions = LayoutStrategyOptions &
  Partial<Pick<MaxRectsStrategyOptions, "rotate" | "bandHeight">> &
  Partial<Pick<SkylineStrategyOptions, "wasteMap">> &
  Partial<Pick<GuillotineStrategyOptions, "choice" | "split" | "merge">> & { rule?: MaxRectsRule | SkylineRule };

/** The options of `pack` that a strategy adds to the sort order and the space. */
type PackExtras = Pick<PackLayoutOptions, "fit" | "rule" | "bandHeight" | "skylineRule" | "wasteMap" | "choice" | "split" | "merge" | "turnable" | "turned">;

/** The options of the strategy `skyline`. The strategy does not read `fit`. */
export interface SkylineStrategyOptions extends LayoutStrategyOptions {
  /** The rule to choose a place on the skyline: `bl` (the default) or `mw`. `SKYLINE_RULES` tells each rule. */
  rule: SkylineRule;
  /** The value `true` keeps the free areas below the skyline, and each item tries them first. The default is `false`. */
  wasteMap: boolean;
  /** The value `true` lets each turnable item that is not locked turn by 90 degrees. The default is `false`. */
  rotate: boolean;
}

/** The options of the strategy `guillotine`. The strategy does not read `fit`. */
export interface GuillotineStrategyOptions extends LayoutStrategyOptions {
  /** The rule to choose a free rectangle: `baf` (the default) or another rule of `GUILLOTINE_CHOICES`. */
  choice: GuillotineChoice;
  /** The rule to split a free rectangle: `sas` (the default) or another rule of `GUILLOTINE_SPLITS`. */
  split: GuillotineSplit;
  /** The value `true` lets each turnable item that is not locked turn by 90 degrees. The default is `false`. */
  rotate: boolean;
  /** The value `true` joins two free rectangles with a common full edge after each item. The default is `false`. */
  merge: boolean;
}

/**
 * The cells of `rows`, `skyline` and `shelf`, without the movement of the obstacles. The container layer of `src/space.ts`
 * gives them each container shape.
 */
const LAYOUT_CELLS = {
  containerSize: ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"],
  containerShape: ["rect", "convex", "polygon", "circle", "ellipse", "holes"],
  itemShape: ["rect"],
  rotation: ["none"],
  groups: ["none"],
  mode: ["offline"],
} as const satisfies Partial<Supports>;

/** This function makes the supports of a strategy, with copies of each list. */
export function supportsOf(cells: { [D in keyof Supports]: readonly Supports[D][number][] }): Supports {
  return {
    containerSize: [...cells.containerSize],
    containerShape: [...cells.containerShape],
    obstacleMove: [...cells.obstacleMove],
    itemShape: [...cells.itemShape],
    rotation: [...cells.rotation],
    order: [...cells.order],
    groups: [...cells.groups],
    mode: [...cells.mode],
  };
}

/**
 * This function gives the options of `pack` that a strategy adds: the fit of `shelf`, or the rule, the bands and the turns
 * of `maxrects`. A turnable item turns only with `rotate`, and a locked item does not turn.
 */
function extrasOf(id: LayoutId, options: AnyLayoutOptions, frame: Frame): PackExtras {
  if (id === "shelf") return options.fit !== undefined ? { fit: options.fit } : {};
  let out: PackExtras;
  if (id === "skyline") {
    out = {};
    if (options.rule !== undefined && options.rule !== "bl") out.skylineRule = options.rule as SkylineRule;
    if (options.wasteMap === true) out.wasteMap = true;
  } else if (id === "maxrects") {
    out = { rule: (options.rule as MaxRectsRule | undefined) ?? "bssf", ...(options.bandHeight === undefined ? {} : { bandHeight: options.bandHeight }) };
  } else if (id === "guillotine") {
    out = { choice: options.choice ?? "baf", split: options.split ?? "sas", ...(options.merge === true ? { merge: true } : {}) };
  } else return {};
  if (options.rotate !== true) return out;
  const turnable = new Set(frame.entries.filter((e) => e.item?.turnable === true && !e.rect.locked).map((e) => e.rect));
  return { ...out, turnable, turned: new Set() };
}

/**
 * This function gives the move counts of the trace of a strategy: its own move, and the moves of a shelf fit. The trace of
 * `maxrects` has the move of its rule and `move.split`. The rule `bl` has only `move.split`.
 */
function movesOf(id: LayoutId, extras: PackExtras): Record<string, number> {
  if (id === "maxrects") {
    const rule = extras.rule ?? "bssf";
    const out: Record<string, number> = rule === "bl" ? {} : { [MOVES[rule]]: moveCount(MOVES[rule]) };
    out[MOVES.split] = moveCount(MOVES.split);
    return out;
  }
  if (id === "skyline" && (extras.skylineRule !== undefined || extras.wasteMap === true)) {
    const out: Record<string, number> = extras.skylineRule === "mw" ? { [MOVES.minWaste]: moveCount(MOVES.minWaste) } : { [MOVES.skyline]: moveCount(MOVES.skyline) };
    if (extras.wasteMap === true) out[MOVES.wasteFill] = moveCount(MOVES.wasteFill);
    return out;
  }
  const out: Record<string, number> = { [MOVES[id]]: moveCount(MOVES[id]) };
  if (id === "guillotine" && extras.merge === true) out[MOVES.merge] = moveCount(MOVES.merge);
  if (extras.fit !== undefined) for (const move of [MOVES.firstFit, MOVES.bestFit]) out[move] = moveCount(move);
  return out;
}

/** This function gives the option `links` of `pack` for the links of an input, or no option for an input without links. */
function linksOf(input: PackInput, frame: Frame): { links?: ItemLink[] } {
  const links = frameLinks(input, frame);
  return links === undefined ? {} : { links };
}

/** This function gives the turns of a packing for `readFrame`, or `undefined` when no rectangle can turn. */
function turnsOf(extras: PackExtras, transposed: boolean): FrameTurns | undefined {
  return extras.turned === undefined ? undefined : { rects: extras.turned, turn: frameTurn(transposed) };
}

/** This function packs an input with a fixed size or a fixed width with one strategy of `pack` and its packer. */
function packFixedWidth(id: LayoutId, place: Placer, input: PackInput, options: AnyLayoutOptions, transposed = false): PackOutput {
  const start = now();
  const frame = buildFrame(input, false, (id === "maxrects" || id === "skyline" || id === "guillotine") && options.rotate === true);
  const rects = rectsOf(frame);
  const extras = extrasOf(id, options, frame);
  clearMoves();
  if (frame.w > 0) packSized(rects, outerOf(frame), { strategy: id, sortOrder: options.sortOrder, ...linksOf(input, frame), space: spaceOf(input, frame), ...extras }, place);
  const output = readFrame(input, frame, [], [], turnsOf(extras, transposed));
  return { ...output, trace: [{ id, ms: now() - start, measures: { "pack.overflow": output.overflow.length, ...movesOf(id, extras) } }] };
}

/** This function makes the strategy of one function of `pack`. The packer `place` is that function. */
export function layoutStrategy<O extends AnyLayoutOptions>(
  id: LayoutId,
  family: string,
  catalog: string[],
  cells: Pick<Supports, "obstacleMove" | "order"> & Partial<Pick<Supports, "rotation">>,
  defaults: O,
  place: Placer,
): Strategy<O> {
  const self: Strategy<O> = {
    id,
    family,
    catalog,
    supports: supportsOf({ ...LAYOUT_CELLS, ...cells }),
    defaults: { ...defaults },
    deterministic: true,
    pack(input, options, context) {
      assertSupported(self.supports, input);
      const o = { ...self.defaults, ...options };
      switch (input.container.fixed) {
        case "height":
          return viaAxes(input, context.previous, (turned) => packFixedWidth(id, place, turned, o, true));
        case "none":
          return sweepSearch(input, self, context, o, place);
        default:
          return packFixedWidth(id, place, input, o);
      }
    },
  };
  return self;
}

/** The defaults of `rows`, `skyline` and `shelf`. */
export const LAYOUT_DEFAULTS: LayoutStrategyOptions = { sortOrder: "height-desc", samples: 48 };

/**
 * This function is the search of `logSweep` with the packer `place`. `logSweep` tells the search. The strategy of `inner`
 * gives `place`, so the module of one strategy does not import the other packers.
 */
export function sweepSearch(input: PackInput, inner: Strategy, context: PackContext, options: unknown, place: Placer): PackOutput {
  if (input.container.fixed !== "none") return inner.pack(input, options ?? inner.defaults, context);
  const id = inner.id;
  if (id !== "rows" && id !== "skyline" && id !== "shelf" && id !== "maxrects" && id !== "guillotine") throw new UnsupportedCell("containerSize", cellOf(input).containerSize);
  const o = { ...(inner.defaults as AnyLayoutOptions), ...(options as Partial<AnyLayoutOptions> | undefined) };
  const start = now();
  const frame = buildFrame(input, false, (id === "maxrects" || id === "skyline" || id === "guillotine") && o.rotate === true);
  const extras = extrasOf(id, o, frame);
  const result = packFreeWith(rectsOf(frame), new Rect<number>(), {
    strategy: id,
    sortOrder: o.sortOrder,
    ...linksOf(input, frame),
    space: spaceOf(input, frame),
    samples: o.samples,
    aspect: input.container.aspect ?? 1,
    aspectWeight: input.container.aspectWeight ?? 1,
    ...extras,
  }, place);
  const ms = now() - start;
  const runs = result.tried.length + 1;
  const output = readFrame(input, frame, [], [], turnsOf(extras, false));
  return {
    ...output,
    trace: [
      { id: "log-sweep", ms, measures: { "pack.search.widths": result.tried.length, "pack.search.ms": ms } },
      { id, ms: ms / runs, measures: { "pack.overflow": output.overflow.length, ...movesOf(id, extras) } },
    ],
  };
}
