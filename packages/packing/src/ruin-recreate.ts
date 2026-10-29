// The strategy `ruin-recreate` of roadmap item k79 (`docs/PACKER.md`, "The goal-driven ruin and recreate", idea R5 of the survey).
// It packs an input with one member, then removes a part of the layout and packs that part again around the rest. A goal
// keeps the search moving. Nothing default uses it.

import { selectBest, stepRandom, type SelectCandidate } from "@mark1russell7/layout-contract";
import { guillotine, maxrects, rows, shelf, skyline } from "./adapters.ts";
import { EPS, marginOf, turnItem, type Item, type Obstacle, type PackInput, type PackOutput, type Placement } from "./contract.ts";
import { byRank, containerBounds, extentOf, type Bounds } from "./frame.ts";
import { PORTFOLIO_LEVELS, type PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { measureKey } from "./select-key.ts";
import { assertSupported, type PackContext, type Strategy, type Supports } from "./strategy.ts";

/**
 * A ruin of `ruin-recreate`: the rule that chooses the items to remove from the layout.
 *
 * - `region`: the items nearest to a random point of the goal box.
 * - `random`: random items.
 * - `adjacent`: a chain of items. It starts at a random item, and each next item is the nearest item to the last one.
 * - `mixed`: one of the three rules at random for each iteration.
 */
export type RuinKind = "mixed" | "region" | "random" | "adjacent";

/** This constant lists each ruin of `ruin-recreate`. The first one is the default. */
export const RUIN_KINDS: readonly RuinKind[] = Object.freeze(["mixed", "region", "random", "adjacent"] as RuinKind[]);

/** The id of the trace stage of `ruin-recreate`. */
export const RUIN_RECREATE_STAGE = "ruin-recreate";

/** The options of the strategy `ruin-recreate` */
export interface RuinRecreateStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the ruin and recreate steps after the member layout. A whole number of 0 or more. The default is 64. */
  iterations?: number;
  /** The rule that chooses the items to remove. The default is `mixed`. */
  ruin?: RuinKind;
  /** The largest share of the placed items that one ruin removes, from 0 to 1. One item is the least. The default is 0.3. */
  strength?: number;
  /** The share by which a met goal shrinks the free side of the goal box, from 0.001 to 0.5. The default is 0.005. */
  shrink?: number;
}

/** The default member of `ruin-recreate`: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** The three ruins of `mixed`, in the order of the random choice */
const RUINS: readonly Exclude<RuinKind, "mixed">[] = ["region", "random", "adjacent"];

/**
 * This function gives the supports of `ruin-recreate`: the union of the supports of the strategies that pack around locked items.
 * The obstacles and the locked items stay fixed. A ruin changes the reading order, so the order is only `free` or `soft`.
 */
function ruinSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, maxrects, guillotine] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  out["obstacleMove"] = ["fixed"];
  out["order"] = ["free", "soft"];
  return out as unknown as Supports;
}

/** This function checks the options of `ruin-recreate`, and gives the member with its options. It throws a `RangeError` for a bad option. */
function checked(options: RuinRecreateStrategyOptions): PortfolioEntry {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  const defaults = strategy(member.strategy).defaults as Record<string, unknown>;
  if (!("sortOrder" in defaults)) throw new RangeError(`The member of ruin-recreate is a strategy with the option sortOrder, not "${member.strategy}".`);
  const { iterations, ruin, strength, shrink } = options;
  if (iterations !== undefined && !(Number.isInteger(iterations) && iterations >= 0)) throw new RangeError(`The option iterations of ruin-recreate is a whole number of 0 or more, not ${String(iterations)}.`);
  if (ruin !== undefined && !RUIN_KINDS.includes(ruin)) throw new RangeError(`The option ruin of ruin-recreate is one of ${RUIN_KINDS.join(", ")}, not ${String(ruin)}.`);
  if (strength !== undefined && !(strength >= 0 && strength <= 1)) throw new RangeError(`The option strength of ruin-recreate is a number from 0 to 1, not ${String(strength)}.`);
  if (shrink !== undefined && !(shrink >= 0.001 && shrink <= 0.5)) throw new RangeError(`The option shrink of ruin-recreate is a number from 0.001 to 0.5, not ${String(shrink)}.`);
  return member;
}

/** The size of the goal box: the free sides of the container get a finite size. */
interface Goal {
  w: number;
  h: number;
}

/** One layout of the search: the placement of each placed item that is not fixed, and the ids of the other items. */
interface Layout {
  at: Map<string, Placement>;
  unplaced: string[];
  count: number;
}

/**
 * The key of the pick of `restarts` with its default option `key`: the hard breaks, then the levels of `PORTFOLIO_LEVELS`.
 * `selectBest` of the contract compares two layouts with it, as `restarts` compares its runs.
 */
const KEY = measureKey(PORTFOLIO_LEVELS.slice(1));

/** This function puts the items from `from` to the end in a random order: the Fisher-Yates shuffle. */
function shuffle<T>(list: T[], r: () => number, from = 0): void {
  for (let i = list.length - 1; i > from; i--) {
    const j = from + Math.floor(r() * (i - from + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}

/** This function removes the field `rank` of an item. The array order of the recreate input is its rank order. */
const unranked = (item: Item): Item => (item.rank === undefined ? item : (({ rank: _rank, ...rest }) => rest)(item));

/**
 * The strategy `ruin-recreate`: a goal-driven ruin and recreate around one member (catalog row `search-ruin-recreate`,
 * Gardeyn 2022 and Wei 2013). `docs/PACKER.md` tells the method and the choices of this project.
 *
 * - The start is the layout of the member. Each iteration removes some items, and packs them and the unplaced items again with the member.
 * - The member packs around the kept items: they are locked items of the input of the recreate. A ruin does not remove a locked item or an obstacle.
 * - A free container gets a goal box that is smaller than the best layout. The items out of the goal box are unplaced.
 * - The compare of two layouts is the pick of `restarts`: the hard breaks, then `PORTFOLIO_LEVELS`, with `selectBest` of the contract.
 * - A recreate that is not worse than the current layout replaces it. A better layout replaces the best layout.
 * - In a fixed container, the search stops when each item has a place.
 * - In a free container, the goal is met when each item is in the goal box. Then the goal box shrinks by `shrink`.
 * - Iteration `i` gets the random numbers `stepRandom(seed, "ruin-recreate:<i>")` of the contract. The budget is a count of iterations, not a time.
 * - The output gets the trace stage `ruin-recreate` with `move.ruinRecreate`, `ruin-recreate.iterations`, `.accepted`, `.goalSteps` and `.bestAt`.
 * - The strategy throws a `RangeError` for a member without the option `sortOrder` and for a bad option.
 */
export const ruinRecreateStrategy: Strategy<RuinRecreateStrategyOptions> = {
  id: "ruin-recreate",
  family: "ruin-recreate",
  catalog: ["search-ruin-recreate"],
  supports: ruinSupports(),
  defaults: { iterations: 64, ruin: "mixed", strength: 0.3, shrink: 0.005 },
  deterministic: true,
  pack(input: PackInput, options: RuinRecreateStrategyOptions, context: PackContext): PackOutput {
    assertSupported(ruinRecreateStrategy.supports, input);
    const member = checked(options);
    const iterations = options.iterations ?? 64;
    const ruin = options.ruin ?? "mixed";
    const strength = options.strength ?? 0.3;
    const shrink = options.shrink ?? 0.005;
    const seed = context.seed;
    const base = packWith(member.strategy, input, member.options, seed);
    const search = new Search(input, member, seed, base);
    const result = search.run(iterations, ruin, strength, shrink);
    const measures = {
      "move.ruinRecreate": result.improved,
      "ruin-recreate.iterations": result.ran,
      "ruin-recreate.accepted": result.accepted,
      "ruin-recreate.goalSteps": result.goalSteps,
      "ruin-recreate.bestAt": result.bestAt,
    };
    const stage = { id: RUIN_RECREATE_STAGE, measures };
    if (result.output === undefined) return { ...base, trace: [...(base.trace ?? []), stage] };
    return { ...result.output, trace: [stage] };
  },
};

/** The result of a search: the best output when it is not the member output, and the counts of the trace. */
interface SearchResult {
  output?: PackOutput;
  improved: number;
  ran: number;
  accepted: number;
  goalSteps: number;
  bestAt: number;
}

/** The state of one search of `ruin-recreate` on one input. */
class Search {
  private readonly input: PackInput;
  private readonly member: PortfolioEntry;
  private readonly seed: number;
  private readonly base: PackOutput;
  private readonly bounds: Bounds;
  private readonly inset: number;
  private readonly free: boolean;
  /** The items by id */
  private readonly items: Map<string, Item>;
  /** The locked items with a position. They are in each recreate, at their positions. */
  private readonly fixed: Item[];
  /** The rank of each item that is not fixed */
  private readonly rank: Map<string, number>;
  /** The holes of a polygon container of free size, as obstacles of the recreate. The goal box is a rectangle. */
  private readonly holes: Obstacle[];
  /** The least far edges of a free container: the fixed items and the obstacles */
  private readonly floor: { right: number; bottom: number };
  /** The output of each layout that a compare read. */
  private readonly outputs = new WeakMap<Layout, PackOutput>();

  constructor(input: PackInput, member: PortfolioEntry, seed: number, base: PackOutput) {
    this.input = input;
    this.member = member;
    this.seed = seed;
    this.base = base;
    this.bounds = containerBounds(input);
    this.inset = input.container.inset ?? 0;
    this.free = input.container.fixed !== "size";
    this.items = new Map(input.items.map((i) => [i.id, i]));
    const ranked = byRank(input.items);
    this.fixed = ranked.filter((i) => i.locked === true && i.x !== undefined && i.y !== undefined);
    const fixedIds = new Set(this.fixed.map((i) => i.id));
    this.rank = new Map(ranked.filter((i) => !fixedIds.has(i.id)).map((item, i) => [item.id, i]));
    const shape = input.container.shape;
    this.holes = this.free && shape?.kind === "polygon" ? (shape.holes ?? []).map((ring, i) => ({ id: `ruin-recreate:hole:${i}`, region: { kind: "polygon", points: ring } })) : [];
    this.floor = extentOf(input, this.fixed.map((i) => ({ id: i.id, x: i.x!, y: i.y! })), [], this.bounds, this.inset, turnItem);
  }

  /** This function gives the item of a placement after its turn. */
  private placed(p: Placement): Item {
    const item = this.items.get(p.id)!;
    return p.turn === 90 ? turnItem(item) : item;
  }

  /** This function gives the layout of some placements. Each item that is not fixed and has no placement is unplaced, in rank order. */
  private layoutOf(placements: readonly Placement[]): Layout {
    const at = new Map<string, Placement>();
    for (const p of placements) if (this.rank.has(p.id) && !at.has(p.id)) at.set(p.id, p);
    return { at, unplaced: [...this.rank.keys()].filter((id) => !at.has(id)), count: at.size };
  }

  /** This function sorts ids by their rank. */
  private sorted(ids: string[]): string[] {
    return ids.toSorted((a, b) => this.rank.get(a)! - this.rank.get(b)!);
  }

  /** This function gives the far edges of a layout with the fixed items and the obstacles. */
  private extent(layout: Layout): { right: number; bottom: number } {
    const placements = [...this.fixed.map((i) => ({ id: i.id, x: i.x!, y: i.y! })), ...layout.at.values()];
    return extentOf(this.input, placements, [], this.bounds, this.inset, turnItem);
  }

  /** This function gives the size of the container of a layout. A fixed side keeps its size, and a free side goes to the far edge. */
  private sizeOf(layout: Layout): { w: number; h: number } {
    const { right, bottom } = this.extent(layout);
    return { w: Number.isFinite(this.bounds.w) ? this.bounds.w : right, h: Number.isFinite(this.bounds.h) ? this.bounds.h : bottom };
  }

  /** This function gives a layout as a candidate of `selectBest`: the value of each level of `KEY` on the output of the layout. */
  private candidateOf(id: string, layout: Layout): SelectCandidate {
    let output = this.outputs.get(layout);
    if (output === undefined) {
      output = this.outputOf(layout);
      this.outputs.set(layout, output);
    }
    const values: Record<string, number> = { hard: KEY.hard(this.input, output) };
    for (const level of KEY.levels) values[level.id] = level.value(this.input, output);
    return { id, values };
  }

  /** This function compares a candidate layout with a baseline layout by the pick rule of `restarts`. A tie keeps the baseline. */
  private verdict(candidate: Layout, baseline: Layout): "better" | "tie" | "worse" {
    const pick = selectBest([this.candidateOf("baseline", baseline), this.candidateOf("candidate", candidate)], PORTFOLIO_LEVELS);
    if (pick.winner === "candidate") return "better";
    return pick.kept.at(-1)!.includes("candidate") ? "tie" : "worse";
  }

  /**
   * This function gives the next goal box from a size, or `undefined` when no free side can shrink more. A free aspect or area
   * shrinks the side that is long for the target aspect. A side does not go below the fixed items and the obstacles.
   */
  private nextGoal(size: { w: number; h: number }, shrink: number): Goal | undefined {
    const c = this.input.container;
    const w = size.w * (1 - shrink);
    const h = size.h * (1 - shrink);
    const okW = w > EPS && w >= this.floor.right - EPS;
    const okH = h > EPS && h >= this.floor.bottom - EPS;
    if (c.fixed === "width") return okH ? { w: size.w, h } : undefined;
    if (c.fixed === "height") return okW ? { w, h: size.h } : undefined;
    const wide = size.w / Math.max(size.h, EPS) > (c.aspect ?? 1);
    if (wide ? okW : okH) return wide ? { w, h: size.h } : { w: size.w, h };
    if (wide ? okH : okW) return wide ? { w: size.w, h } : { w, h: size.h };
    return undefined;
  }

  /** This function tells if a placement is in the goal box, with the margin and the inset. */
  private inGoal(p: Placement, goal: Goal): boolean {
    const item = this.placed(p);
    const m = marginOf(item);
    const b = this.bounds;
    return p.x + item.w + m.right + this.inset - b.x <= goal.w + EPS && p.y + item.h + m.bottom + this.inset - b.y <= goal.h + EPS;
  }

  /** This function gives a layout with only the items in the goal box. The other items become unplaced. */
  private clip(layout: Layout, goal: Goal): Layout {
    return this.layoutOf([...layout.at.values()].filter((p) => this.inGoal(p, goal)));
  }

  /** This function gives the input of a recreate: the goal box, the fixed items, the kept items as locked items, then the items to insert. */
  private recreateInput(goal: Goal | undefined, kept: readonly Placement[], insert: readonly string[]): PackInput {
    const c = this.input.container;
    const b = this.bounds;
    const container: PackInput["container"] =
      goal === undefined
        ? c
        : {
            fixed: "size",
            w: goal.w,
            h: goal.h,
            ...(c.inset === undefined ? {} : { inset: c.inset }),
            ...(c.shape === undefined ? {} : { shape: { kind: "rect", x: b.x, y: b.y, w: goal.w, h: goal.h } }),
          };
    const locked = kept.map((p): Item => ({ ...unranked(this.placed(p)), x: p.x, y: p.y, locked: true }));
    const items = [...this.fixed.map(unranked), ...locked, ...insert.map((id) => unranked(this.items.get(id)!))];
    const obstacles = [...(this.input.obstacles ?? []), ...this.holes];
    return {
      container,
      items,
      ...(obstacles.length === 0 ? {} : { obstacles }),
      ...(this.input.gap === undefined ? {} : { gap: this.input.gap }),
      ...(this.input.pairGaps === undefined ? {} : { pairGaps: this.input.pairGaps }),
    };
  }

  /** This function gives the center of a placed item. */
  private center(p: Placement): [number, number] {
    const item = this.placed(p);
    return [p.x + item.w / 2, p.y + item.h / 2];
  }

  /** This function gives the distance between the boxes of two placed items: 0 when they touch or overlap. */
  private distance(a: Placement, b: Placement): number {
    const ia = this.placed(a);
    const ib = this.placed(b);
    const dx = Math.max(0, a.x - (b.x + ib.w), b.x - (a.x + ia.w));
    const dy = Math.max(0, a.y - (b.y + ib.h), b.y - (a.y + ia.h));
    return Math.hypot(dx, dy);
  }

  /** This function gives the ids that one ruin removes from a layout. `area` is the box of the region ruin. */
  private ruinOf(kind: Exclude<RuinKind, "mixed">, layout: Layout, k: number, area: Goal, r: () => number): string[] {
    const placed = this.sorted([...layout.at.keys()]).map((id) => layout.at.get(id)!);
    if (placed.length === 0) return [];
    if (kind === "random") {
      shuffle(placed, r);
      return placed.slice(0, k).map((p) => p.id);
    }
    if (kind === "region") {
      const x = this.bounds.x + r() * area.w;
      const y = this.bounds.y + r() * area.h;
      const d = (p: Placement): number => {
        const [cx, cy] = this.center(p);
        return Math.hypot(cx - x, cy - y);
      };
      return placed
        .map((p, i) => ({ id: p.id, d: d(p), i }))
        .toSorted((a, b) => a.d - b.d || a.i - b.i)
        .slice(0, k)
        .map((e) => e.id);
    }
    // adjacent: a chain from a random item, each next item the nearest to the last one
    const left = [...placed];
    const first = left.splice(Math.floor(r() * left.length), 1)[0]!;
    const chain = [first];
    while (chain.length < k && left.length > 0) {
      const last = chain[chain.length - 1]!;
      let best = 0;
      for (let i = 1; i < left.length; i++) if (this.distance(last, left[i]!) < this.distance(last, left[best]!)) best = i;
      chain.push(left.splice(best, 1)[0]!);
    }
    return chain.map((p) => p.id);
  }

  /** This function gives the output of a layout: the placements in rank order, the overflow and the size. */
  private outputOf(layout: Layout): PackOutput {
    const fixed = this.fixed.map((i): Placement => ({ id: i.id, x: i.x!, y: i.y! }));
    const order = new Map(byRank(this.input.items).map((item, i) => [item.id, i]));
    const placements = [...fixed, ...layout.at.values()].toSorted((a, b) => order.get(a.id)! - order.get(b.id)!);
    return { placements, overflow: [...layout.unplaced], size: this.sizeOf(layout), moved: [] };
  }

  /** This function does the search, and gives its result. */
  run(iterations: number, ruin: RuinKind, strength: number, shrink: number): SearchResult {
    const result: SearchResult = { improved: 0, ran: 0, accepted: 0, goalSteps: 0, bestAt: 0 };
    let current = this.layoutOf(this.base.placements);
    let best = current;
    const target = current.count;
    let goal: Goal | undefined;
    if (this.free) {
      goal = this.nextGoal(this.base.size, shrink);
      if (goal !== undefined) current = this.clip(current, goal);
    }
    for (let i = 1; i <= iterations; i++) {
      if (this.free ? goal === undefined : current.unplaced.length === 0) break;
      const r = stepRandom(this.seed, `ruin-recreate:${i}`);
      const kind = ruin === "mixed" ? RUINS[Math.floor(r() * RUINS.length)]! : ruin;
      const k = 1 + Math.floor(r() * Math.max(1, Math.ceil(strength * current.count)));
      const area = goal ?? { w: this.bounds.w, h: this.bounds.h };
      const removed = new Set(this.ruinOf(kind, current, k, area, r));
      const kept = [...current.at.values()].filter((p) => !removed.has(p.id));
      const insert = this.sorted([...removed, ...current.unplaced]);
      const shuffled = r() < 0.5;
      if (shuffled) shuffle(insert, r);
      const options = { ...(this.member.options as object | undefined), ...(shuffled ? { sortOrder: "input" } : {}) };
      const out = packWith(this.member.strategy, this.recreateInput(goal, kept, insert), options, this.seed);
      const inserted = new Set(insert);
      const candidate = this.layoutOf([...kept, ...out.placements.filter((p) => inserted.has(p.id))]);
      result.ran++;
      if (this.verdict(candidate, current) === "worse") continue;
      current = candidate;
      result.accepted++;
      // In a free container, the goal is met when each item is in the goal box
      if (this.free && current.count < target) continue;
      if (this.free || current.count > best.count) result.goalSteps++;
      if (this.verdict(current, best) === "better") {
        best = current;
        result.bestAt = i;
        result.improved++;
      }
      if (!this.free) continue;
      goal = this.nextGoal(this.sizeOf(current), shrink);
      if (goal !== undefined) current = this.clip(current, goal);
    }
    return result.improved === 0 ? result : { ...result, output: this.outputOf(best) };
  }
}
