// The strategy `bbox` of roadmap item k91 (`docs/PACKER.md`, "Shapes by their bounding boxes", idea S2 of the survey). It packs
// the bounding box of the shape of each item with one member, then puts each shape in its box. Nothing default uses it.

import { boundsOf, EPS, type Rect, type ShapeKind } from "@mark1russell7/layout-contract";
import { maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import { marginOf, turnItem, type Item, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import type { PortfolioEntry } from "./portfolio.ts";
import { packWith } from "./registry.ts";
import type { PackContext, Strategy, Supports } from "./strategy.ts";

/** The options of the strategy `bbox` */
export interface BboxStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /**
   * The value `true` lets `bbox` turn each turnable item that is not locked. The default is `false`, and then the member decides the turns.
   * The turn with the smaller box area wins, then the turn with the lower box. A tie keeps the item unturned.
   */
  turn?: boolean;
}

/** The shape kinds of `bbox`: each declared kind of the contract. Each kind has its bounding box in the contract. */
export const BBOX_SHAPES: readonly ShapeKind[] = Object.freeze(["rect", "polygon", "circle", "free"] as ShapeKind[]);

/** The default member of `bbox`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** This function gives the union of the supports of the single strategies, with each shape kind for `itemShape`. */
function bboxSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, push, maxrects] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  out["itemShape"] = [...BBOX_SHAPES, "mixed"];
  return out as unknown as Supports;
}

/** This function gives the bounding box of the shape of an item, relative to the origin of the item. */
function shapeBounds(item: Item): Rect {
  return item.shape === undefined ? { x: 0, y: 0, w: item.w, h: item.h } : boundsOf(item.shape);
}

/** This function gives the area of the bounding box of an item with its margin. */
function boxArea(item: Item, b: Rect): number {
  const m = marginOf(item);
  return (b.w + m.left + m.right) * (b.h + m.top + m.bottom);
}

/** The plan of one item: the turn of `bbox` and the bounding box of the shape after that turn. */
interface Plan {
  turned: boolean;
  bounds: Rect;
}

/** This function tells if `bbox` turns an item: a smaller box area wins, then a lower box. A tie keeps the item unturned. */
function turnWins(item: Item, b: Rect, turned: Item, tb: Rect): boolean {
  const a = boxArea(item, b);
  const ta = boxArea(turned, tb);
  if (Math.abs(ta - a) > EPS) return ta < a;
  return tb.h < b.h - EPS;
}

/** This function gives the box item of the member: a rectangle with the size of the bounding box. A locked item moves by the offset. */
function boxItem(item: Item, b: Rect, keepTurnable: boolean): Item {
  const { shape: _shape, shapeKind: _kind, turnable, ...rest } = item;
  const box: Item = { ...rest, w: b.w, h: b.h, ...(keepTurnable && turnable !== undefined ? { turnable } : {}) };
  if (item.x === undefined || item.y === undefined) return box;
  return { ...box, x: item.x + b.x, y: item.y + b.y };
}

/** This function checks the options of `bbox`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function memberOf(options: BboxStrategyOptions): PortfolioEntry {
  if (options.turn !== undefined && typeof options.turn !== "boolean") throw new RangeError(`The option turn of bbox is true or false, not ${String(options.turn)}.`);
  const given = options.member ?? DEFAULT_MEMBER;
  return typeof given === "string" ? { id: given, strategy: given } : given;
}

/**
 * The strategy `bbox`: each shape by its bounding box (idea S2 of the survey, catalog row `bbox-shapes`).
 *
 * - The member packs one rectangle for each item: the bounding box of its shape, with the margin of the item. The other fields stay.
 * - The placement of an item is the place of its box minus the offset of the bounding box. Thus the shape is inside its box.
 * - A locked item keeps its position. Its box is at the position plus the offset.
 * - With `turn`, `bbox` turns each turnable item that is not locked, by the rule of the option. The member then gets no turnable item.
 * - Without `turn`, a turn of the member turns the shape. The placement then uses the bounding box of the turned shape.
 * - An input with no shape and without `turn` gives the output of the member.
 */
export const bboxStrategy: Strategy<BboxStrategyOptions> = {
  id: "bbox",
  family: "bbox",
  catalog: ["bbox-shapes"],
  supports: bboxSupports(),
  defaults: { turn: false },
  deterministic: true,
  pack(input: PackInput, options: BboxStrategyOptions, context: PackContext): PackOutput {
    const member = memberOf(options);
    const turn = options.turn === true;
    const run = (x: PackInput): PackOutput => packWith(member.strategy, x, member.options, context.seed);
    if (!turn && input.items.every((i) => i.shape === undefined)) return run(input);
    const plans = new Map<string, Plan>();
    const items = input.items.map((item): Item => {
      const b = shapeBounds(item);
      if (turn && item.turnable === true && item.locked !== true) {
        const turned = turnItem(item);
        const tb = shapeBounds(turned);
        if (turnWins(item, b, turned, tb)) {
          plans.set(item.id, { turned: true, bounds: tb });
          return boxItem(turned, tb, false);
        }
      }
      plans.set(item.id, { turned: false, bounds: b });
      return boxItem(item, b, !turn);
    });
    const byId = new Map(input.items.map((i) => [i.id, i]));
    const out = run({ ...input, items });
    const placements = out.placements.map((p): Placement => {
      const plan = plans.get(p.id);
      const item = byId.get(p.id);
      if (plan === undefined || item === undefined) return p;
      if (plan.turned) return { id: p.id, x: p.x - plan.bounds.x, y: p.y - plan.bounds.y, turn: 90 };
      const b = p.turn === 90 ? shapeBounds(turnItem(item)) : plan.bounds;
      return { ...p, x: p.x - b.x, y: p.y - b.y };
    });
    return { ...out, placements };
  },
};
