// The strategy `push` (roadmap item k132 gives it its own module and the subpath `@mark1russell7/packing/push`).

import { EPS, type PackInput, type PackOutput } from "./contract.ts";
import { boundsOf, buildFrame, now, outerOf, readFrame, viaAxes, type Entry } from "./frame.ts";
import { supportsOf } from "./layout-strategy.ts";
import { MOVES } from "./moves.ts";
import type { SortOrder } from "./order.ts";
import { pushCascade } from "./push.ts";
import type { Rect } from "./rect.ts";
import { packSkyline } from "./skyline.ts";
import { assertSupported, type Strategy } from "./strategy.ts";

/** The options of the strategy `push`. */
export interface PushStrategyOptions {
  /** The order of the items that the cascade does not place. */
  sortOrder: SortOrder;
  /** The most shoves for each item. The cascade stops at this limit. */
  maxShovesPerItem: number;
}

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
