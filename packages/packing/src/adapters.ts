// The adapters of 0.1 (docs/PACKER.md): each function of 0.1 runs behind the Packer interface as a strategy.

import { EPS, type PackInput, type PackOutput } from "./contract.ts";
import { boundsOf, buildFrame, now, outerOf, readFrame, rectsOf, viaAxes, type Entry } from "./frame.ts";
import { packFree } from "./free.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";
import type { SortOrder } from "./order.ts";
import { pack } from "./pack.ts";
import { pushCascade } from "./push.ts";
import { Rect } from "./rect.ts";
import type { ShelfFit } from "./shelf.ts";
import { packSkyline } from "./skyline.ts";
import { spaceOf } from "./space.ts";
import { assertSupported, cellOf, UnsupportedCell, type PackContext, type SizeSearch, type Strategy, type Supports } from "./strategy.ts";

/** The options of the strategies `rows`, `skyline` and `shelf`. */
export interface LayoutStrategyOptions {
  /** The order of the items before the packing. The items are in the order of their rank first. */
  sortOrder: SortOrder;
  /** The number of widths that the first pass of the size search `log-sweep` tries. */
  samples: number;
  /**
   * The rule of `shelf` to choose a shelf: `next`, `first` or `best`. Only `shelf` reads it. Without it, `shelf` packs
   * as in 0.2.3. With it, the trace also counts `move.firstFit` and `move.bestFit`.
   */
  fit?: ShelfFit;
}

/** The options of the strategy `push`. */
export interface PushStrategyOptions {
  /** The order of the items that the cascade does not place. */
  sortOrder: SortOrder;
  /** The most shoves for each item. The cascade stops at this limit. */
  maxShovesPerItem: number;
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
function supportsOf(cells: { [D in keyof Supports]: readonly Supports[D][number][] }): Supports {
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

/** This function gives the fit of the options of a strategy: only `shelf` reads it. */
function fitOf(id: "rows" | "skyline" | "shelf", options: Partial<LayoutStrategyOptions>): { fit?: ShelfFit } {
  return id === "shelf" && options.fit !== undefined ? { fit: options.fit } : {};
}

/** This function gives the move counts of the trace of a strategy: its own move, and the moves of a shelf fit. */
function movesOf(id: "rows" | "skyline" | "shelf", fit: { fit?: ShelfFit }): Record<string, number> {
  const out: Record<string, number> = { [MOVES[id]]: moveCount(MOVES[id]) };
  if (fit.fit !== undefined) for (const move of [MOVES.firstFit, MOVES.bestFit]) out[move] = moveCount(move);
  return out;
}

/** This function packs an input with a fixed size or a fixed width with one strategy of `pack`. */
function packFixedWidth(id: "rows" | "skyline" | "shelf", input: PackInput, options: LayoutStrategyOptions): PackOutput {
  const start = now();
  const frame = buildFrame(input);
  const rects = rectsOf(frame);
  const fit = fitOf(id, options);
  clearMoves();
  if (frame.w > 0) pack(rects, outerOf(frame), { strategy: id, sortOrder: options.sortOrder, space: spaceOf(input, frame), ...fit });
  const output = readFrame(input, frame, []);
  return { ...output, trace: [{ id, ms: now() - start, measures: { "pack.overflow": output.overflow.length, ...movesOf(id, fit) } }] };
}

/** This function makes the strategy of one function of `pack`. */
function layoutStrategy(
  id: "rows" | "skyline" | "shelf",
  family: string,
  catalog: string[],
  cells: Pick<Supports, "obstacleMove" | "order">,
): Strategy<LayoutStrategyOptions> {
  const self: Strategy<LayoutStrategyOptions> = {
    id,
    family,
    catalog,
    supports: supportsOf({ ...LAYOUT_CELLS, ...cells }),
    defaults: { sortOrder: "height-desc", samples: 48 },
    deterministic: true,
    pack(input, options, context) {
      assertSupported(self.supports, input);
      const o = { ...self.defaults, ...options };
      switch (input.container.fixed) {
        case "height":
          return viaAxes(input, context.previous, (turned) => packFixedWidth(id, turned, o));
        case "none":
          return logSweep.search(input, self, context, o);
        default:
          return packFixedWidth(id, input, o);
      }
    },
  };
  return self;
}

/**
 * The strategy `rows` uses `packRows`: a guillotine row packing with a recursive gap fill. With obstacles, locked items or a
 * container shape, the rows go around the holes of the free space and lose the gap fill. Turnable items, groups and item
 * shapes throw `UnsupportedCell`.
 */
export const rows: Strategy<LayoutStrategyOptions> = layoutStrategy("rows", "shelf", ["rows-gap-fill", "rows-input"], {
  obstacleMove: ["fixed"],
  order: ["free", "soft", "hard"],
});

/**
 * The strategy `skyline` uses `packSkyline`: each item goes to the lowest place where it fits. It packs around the
 * locked items and the fixed obstacles, in each container shape. Turnable items, groups and item shapes throw `UnsupportedCell`.
 */
export const skyline: Strategy<LayoutStrategyOptions> = layoutStrategy("skyline", "skyline", ["skyline-bl"], {
  obstacleMove: ["fixed"],
  order: ["free", "soft"],
});

/**
 * The strategy `shelf` uses `packShelf`: rows filled left to right, around the locked items and the fixed obstacles.
 * With the sort order `input`, the rows keep the rank order. Turnable items, groups and item shapes throw `UnsupportedCell`.
 * The option `fit` selects a shelf rule of roadmap item k21: `next`, `first` or `best`. The default has no `fit`.
 */
export const shelf: Strategy<LayoutStrategyOptions> = layoutStrategy("shelf", "shelf", ["shelf-nf", "shelf-nfdh"], {
  obstacleMove: ["fixed"],
  order: ["free", "soft", "hard"],
});

/**
 * The size search `log-sweep` uses `packFree` of 0.1.2: widths on a log scale, then the widths near the best width. It
 * wraps `rows`, `skyline` and `shelf`. The objective is the area of the frame times `1 + aspectWeight * aspectError`.
 */
export const logSweep: SizeSearch = {
  id: "log-sweep",
  search(input: PackInput, inner: Strategy, context: PackContext, options?: unknown): PackOutput {
    if (input.container.fixed !== "none") return inner.pack(input, options ?? inner.defaults, context);
    const id = inner.id;
    if (id !== "rows" && id !== "skyline" && id !== "shelf") throw new UnsupportedCell("containerSize", cellOf(input).containerSize);
    const o = { ...(inner.defaults as LayoutStrategyOptions), ...(options as Partial<LayoutStrategyOptions> | undefined) };
    const start = now();
    const frame = buildFrame(input);
    const fit = fitOf(id, o);
    const result = packFree(rectsOf(frame), new Rect<number>(), {
      strategy: id,
      sortOrder: o.sortOrder,
      space: spaceOf(input, frame),
      samples: o.samples,
      aspect: input.container.aspect ?? 1,
      aspectWeight: input.container.aspectWeight ?? 1,
      ...fit,
    });
    const ms = now() - start;
    const runs = result.tried.length + 1;
    const output = readFrame(input, frame, []);
    return {
      ...output,
      trace: [
        { id: "log-sweep", ms, measures: { "pack.search.widths": result.tried.length, "pack.search.ms": ms } },
        { id, ms: ms / runs, measures: { "pack.overflow": output.overflow.length, ...movesOf(id, fit) } },
      ],
    };
  },
};

/** This function tells if the insides of two rectangles overlap by more than `EPS`. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.min(a.right(), b.right()) - Math.max(a.position.x, b.position.x) > EPS &&
    Math.min(a.bottom(), b.bottom()) - Math.max(a.position.y, b.position.y) > EPS
  );
}

/** This function packs an input with a fixed size or a fixed width with a push cascade. */
function pushFixedWidth(input: PackInput, options: PushStrategyOptions, previous: PackOutput | undefined): PackOutput {
  const start = now();
  const frame = buildFrame(input, true);
  const before = new Map(previous?.placements.map((p) => [p.id, p]));
  const positioned: Entry[] = [];
  const pending: Entry[] = [];
  const obstacles = frame.entries.filter((e) => e.obstacle !== undefined);
  const starts = new Map(obstacles.map((e) => [e, { x: e.rect.position.x, y: e.rect.position.y }]));
  const lockedItems = frame.entries.filter((e) => e.item !== undefined && e.rect.locked);

  for (const e of frame.entries) {
    const item = e.item;
    if (item === undefined || e.rect.locked) continue;
    const x = item.x ?? before.get(item.id)?.x;
    const y = item.y ?? before.get(item.id)?.y;
    if (x === undefined || y === undefined) {
      pending.push(e);
      continue;
    }
    e.rect.position.set(x - e.dx - frame.ox, y - e.dy - frame.oy);
    positioned.push(e);
  }

  // The cascade: each item in the order of its rank pushes the others, and then it stays
  const inPlay = frame.entries.filter((e) => !pending.includes(e)).map((e) => e.rect);
  const maxShoves = options.maxShovesPerItem * Math.max(1, inPlay.length);
  let cascaded = 0;
  for (const e of positioned) {
    cascaded += pushCascade(e.rect, inPlay, { gap: 0, maxShoves }).length;
    e.rect.locked = true;
  }

  // An obstacle that the cascade pushed out of the container or onto a locked item goes back to its start
  const { bounds } = frame;
  const moved: { id: string; x: number; y: number }[] = [];
  for (const e of obstacles) {
    const startAt = starts.get(e)!;
    const x = e.rect.position.x + e.dx + frame.ox;
    const y = e.rect.position.y + e.dy + frame.oy;
    const b = boundsOf(e.obstacle!.region);
    const out = x < bounds.x - EPS || y < bounds.y - EPS || x + b.w > bounds.x + bounds.w + EPS || y + b.h > bounds.y + bounds.h + EPS;
    if (out || lockedItems.some((l) => overlaps(l.rect, e.rect))) e.rect.position.set(startAt.x, startAt.y);
    else if (Math.abs(e.rect.position.x - startAt.x) > EPS || Math.abs(e.rect.position.y - startAt.y) > EPS) moved.push({ id: e.obstacle!.id, x, y });
  }
  const pushMs = now() - start;

  // Each item that is out of the area or overlaps a kept rectangle goes to the skyline, around the kept rectangles
  const kept = [...obstacles, ...lockedItems].map((e) => e.rect);
  for (const e of positioned) {
    const r = e.rect;
    const inside = r.position.x >= -EPS && r.position.y >= -EPS && r.right() <= frame.w + EPS && r.bottom() <= frame.h + EPS;
    if (inside && !kept.some((k) => overlaps(k, r))) kept.push(r);
    else pending.push(e);
  }
  const skylineStart = now();
  for (const r of kept) {
    r.locked = true;
    r.wasPacked = true;
  }
  if (pending.length > 0 && frame.w > 0) {
    for (const e of pending) {
      e.rect.locked = false;
      e.rect.wasPacked = false;
    }
    packSkyline([...pending.map((e) => e.rect), ...kept], outerOf(frame), { sortOrder: options.sortOrder });
  }
  const output = readFrame(input, frame, [], moved);
  return {
    ...output,
    trace: [
      { id: "push", ms: pushMs, measures: { "pack.push.moved": moved.length, [MOVES.push]: cascaded } },
      { id: "skyline", ms: now() - skylineStart, measures: { "pack.push.replaced": pending.length, "pack.overflow": output.overflow.length } },
    ],
  };
}

/**
 * The strategy `push` uses `pushCascade`. Each item starts at its `x` and `y`, or at its place in `context.previous`.
 * Each item in rank order pushes the items and the movable obstacles that it overlaps. Then `packSkyline` places the
 * items with no start, and the items that still overlap. The output tells each obstacle that moved.
 */
export const push: Strategy<PushStrategyOptions> = {
  id: "push",
  family: "incremental",
  catalog: ["incremental-push"],
  supports: supportsOf({
    containerSize: ["fixed", "freeHeight", "freeWidth"],
    containerShape: ["rect"],
    obstacleMove: ["fixed", "free"],
    itemShape: ["rect"],
    rotation: ["none"],
    order: ["free", "soft"],
    groups: ["none"],
    mode: ["incremental"],
  }),
  defaults: { sortOrder: "height-desc", maxShovesPerItem: 8 },
  deterministic: true,
  pack(input, options, context) {
    assertSupported(push.supports, input);
    const o = { ...push.defaults, ...options };
    if (input.container.fixed === "height") return viaAxes(input, context.previous, (turned, previous) => pushFixedWidth(turned, o, previous));
    return pushFixedWidth(input, o, context.previous);
  },
};
