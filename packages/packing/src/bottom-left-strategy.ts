// The strategies `bottom-left` and `best-fit` of roadmap item k25. Each one reads its own options, so its packer does not go
// through the options of `pack`. They ship off: they are not in `pack`, in a default or in `SELECT_TABLE`.

import { runBestFit, type BestFitSide } from "./best-fit.ts";
import { runBottomLeft, type BottomLeftRule } from "./bottom-left.ts";
import type { PackInput, PackOutput } from "./contract.ts";
import { buildFrame, frameLinks, now, outerOf, readFrame, rectsOf, viaAxes, type Frame } from "./frame.ts";
import { packFreeWith } from "./free-width.ts";
import { LAYOUT_DEFAULTS, supportsOf, type LayoutStrategyOptions } from "./layout-strategy.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";
import type { ItemLink } from "./order.ts";
import { packSized, type Placer } from "./pack-sized.ts";
import { Rect } from "./rect.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/** The options of a strategy of this module. `sortOrder` and `samples` are the options of each layout strategy. */
type OwnOptions = Omit<LayoutStrategyOptions, "fit">;

/** The options of the strategy `bottom-left`. */
export interface BottomLeftStrategyOptions extends Omit<LayoutStrategyOptions, "fit"> {
  /** The rule to slide a box: `baker` (the default) or `liu-teng`. `BOTTOM_LEFT_RULES` tells each rule. */
  rule: BottomLeftRule;
}

/** The options of the strategy `best-fit`. */
export interface BestFitStrategyOptions extends Omit<LayoutStrategyOptions, "fit"> {
  /** The side of a gap for a box: `left` (the default), `tall` or `short`. `BEST_FIT_SIDES` tells each side. */
  side: BestFitSide;
}

/** One strategy of this module: its id, its packer and the reader of its move counts. */
interface Own {
  id: string;
  place: Placer;
  moves: () => Record<string, number>;
}

/** This function gives the option `links` of a packer for the links of an input, or no option. */
function linksOf(input: PackInput, frame: Frame): { links?: ItemLink[] } {
  const links = frameLinks(input, frame);
  return links === undefined ? {} : { links };
}

/** This function packs an input with a fixed size or a fixed width. */
function packFixed(own: Own, input: PackInput, options: OwnOptions): PackOutput {
  const start = now();
  const frame = buildFrame(input);
  clearMoves();
  if (frame.w > 0) packSized(rectsOf(frame), outerOf(frame), { sortOrder: options.sortOrder, ...linksOf(input, frame) }, own.place);
  const output = readFrame(input, frame, [], []);
  return { ...output, trace: [{ id: own.id, ms: now() - start, measures: { "pack.overflow": output.overflow.length, ...own.moves() } }] };
}

/** This function packs an input with a free width and height: the search of `packFreeWith` with the packer of the strategy. */
function packFree(own: Own, input: PackInput, options: OwnOptions): PackOutput {
  const start = now();
  const frame = buildFrame(input);
  const search = { sortOrder: options.sortOrder, ...linksOf(input, frame), samples: options.samples, aspect: input.container.aspect ?? 1, aspectWeight: input.container.aspectWeight ?? 1 };
  const result = packFreeWith(rectsOf(frame), new Rect<number>(), search, own.place);
  const ms = now() - start;
  const output = readFrame(input, frame, [], []);
  return {
    ...output,
    trace: [
      { id: "log-sweep", ms, measures: { "pack.search.widths": result.tried.length, "pack.search.ms": ms } },
      { id: own.id, ms: ms / (result.tried.length + 1), measures: { "pack.overflow": output.overflow.length, ...own.moves() } },
    ],
  };
}

/** This function makes a strategy of this module. `placer` gives the packer of the options, and `moves` reads the move counts of a pack. */
function ownStrategy<O extends OwnOptions>(id: string, catalog: string[], cells: Pick<Supports, "obstacleMove" | "order">, defaults: O, placer: (options: O) => Placer, moves: () => Record<string, number>): Strategy<O> {
  const self: Strategy<O> = {
    id,
    family: id,
    catalog,
    supports: supportsOf({
      containerSize: ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"],
      containerShape: ["rect"],
      itemShape: ["rect"],
      rotation: ["none"],
      groups: ["none"],
      mode: ["offline"],
      ...cells,
    }),
    defaults: { ...defaults },
    deterministic: true,
    pack(input: PackInput, options: O, _context: PackContext): PackOutput {
      assertSupported(self.supports, input);
      const o = { ...self.defaults, ...options };
      const own: Own = { id, place: placer(o), moves };
      if (input.container.fixed === "height") return viaAxes(input, undefined, (turned) => packFixed(own, turned, o));
      return input.container.fixed === "none" ? packFree(own, input, o) : packFixed(own, input, o);
    },
  };
  return self;
}

/**
 * The strategy `bottom-left` uses `runBottomLeft`: each box slides down and left, so it does not jump into a closed hole.
 *
 * - The rule `baker` is the method of Baker 1980, and the rule `liu-teng` is the method of Liu 1999.
 * - A rectangle container with fixed obstacles and locked items is the only shape. Another shape throws `UnsupportedCell`.
 * - A turnable item and groups throw `UnsupportedCell`.
 * - The rule "lowest, then leftmost, holes included" is `maxrects` with the rule `bl`. This strategy does not repeat it.
 */
export const bottomLeft: Strategy<BottomLeftStrategyOptions> = /* @__PURE__ */ ownStrategy<BottomLeftStrategyOptions>(
  "bottom-left",
  ["bl-baker", "bl-liu-teng"],
  { obstacleMove: ["fixed"], order: ["free", "soft"] },
  { ...LAYOUT_DEFAULTS, sortOrder: "width-desc", rule: "baker" },
  (o) => (rects, outer, options) => {
    runBottomLeft(rects, outer, { ...options, rule: o.rule });
  },
  () => ({ [MOVES.slide]: moveCount(MOVES.slide) }),
);

/**
 * The strategy `best-fit` uses `runBestFit`: the widest box that fits goes in the lowest gap (Burke 2004).
 *
 * - The option `sortOrder` only breaks a tie between boxes of equal width. Thus a rank has no effect, and the cell `soft` throws `UnsupportedCell`.
 * - A rectangle container with no obstacle and no locked item is the only shape. Another input throws `UnsupportedCell`.
 * - A turnable item and groups throw `UnsupportedCell`. The strategy has no turn and no last step for towers.
 */
export const bestFit: Strategy<BestFitStrategyOptions> = /* @__PURE__ */ ownStrategy<BestFitStrategyOptions>(
  "best-fit",
  ["best-fit-bkw"],
  { obstacleMove: [], order: ["free"] },
  { ...LAYOUT_DEFAULTS, side: "left" },
  (o) => (rects, outer, options) => {
    runBestFit(rects, outer, { ...options, side: o.side });
  },
  () => ({ [MOVES.gapPick]: moveCount(MOVES.gapPick), [MOVES.gapRaise]: moveCount(MOVES.gapRaise) }),
);
