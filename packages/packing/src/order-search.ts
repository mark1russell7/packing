// The strategies `anneal`, `genetic` and `tabu` of roadmap item k26 (`docs/PACKER.md`, "The searches over orders").
// Each one searches the order of the items, and the turns when the member turns items. A member decodes each order. Nothing default uses them.

import { selectBest, stepRandom, type SelectCandidate } from "@mark1russell7/layout-contract";
import { guillotine, maxrects, push, rows, shelf, skyline } from "./adapters.ts";
import { turnItem, type Item, type PackInput, type PackOutput } from "./contract.ts";
import { byRank } from "./frame.ts";
import { PORTFOLIO_LEVELS, type PortfolioEntry } from "./portfolio.ts";
import { packWith, strategy } from "./registry.ts";
import { memberOrder, rankSorted } from "./restarts.ts";
import type { SortOrder } from "./order.ts";
import { measureKey } from "./select-key.ts";
import { assertSupported, cellOf, type PackContext, type Strategy, type Supports } from "./strategy.ts";
import { checkBudgetWork, packWork, WORK_BUDGET, WORK_SPENT, WORK_STOPPED } from "./work.ts";

/** The id of the trace stage of `anneal`. */
export const ANNEAL_STAGE = "anneal";

/** The id of the trace stage of `genetic`. */
export const GENETIC_STAGE = "genetic";

/** The id of the trace stage of `tabu`. */
export const TABU_STAGE = "tabu";

/** The options of the strategy `anneal` */
export interface AnnealStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the packs of the member, the pack of the member order included. A whole number of 1 or more. The default is 64. */
  iterations?: number;
  /** The work limit in work units of `packWork`, a whole number of 0 or more. It has no default. The first pack always starts. */
  budgetWork?: number;
  /** The start temperature, in the units of the key levels: a share from 0 to 1. A number above 0 and to 1. The default is 0.01. */
  temperature?: number;
  /** The temperature of the last step as a share of the start temperature. A number above 0 and to 1. The default is 0.01. */
  cooling?: number;
}

/** The options of the strategy `genetic` */
export interface GeneticStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the packs of the member, the pack of the member order included. A whole number of 1 or more. The default is 64. */
  iterations?: number;
  /** The work limit in work units of `packWork`, a whole number of 0 or more. It has no default. The first pack always starts. */
  budgetWork?: number;
  /** The count of the orders in one generation. A whole number from 2 to 256. The default is 8. */
  population?: number;
  /** The chance that a child gets one random change, from 0 to 1. The default is 0.5. */
  mutation?: number;
}

/** The options of the strategy `tabu` */
export interface TabuStrategyOptions {
  /** The member: a strategy id, or a `PortfolioEntry` with options. The default is `maxrects` with the rule `bl`. */
  member?: string | PortfolioEntry;
  /** The count of the packs of the member, the pack of the member order included. A whole number of 1 or more. The default is 64. */
  iterations?: number;
  /** The work limit in work units of `packWork`, a whole number of 0 or more. It has no default. The first pack always starts. */
  budgetWork?: number;
  /** The count of the steps in which a swapped pair of items stays tabu. A whole number from 0 to 1024. The default is 7. */
  tenure?: number;
  /** The count of the random moves that one step tries. A whole number from 1 to 1024. The default is 8. */
  neighbors?: number;
}

/** The default member of the searches over orders: `maxrects` with the rule `bl` */
const DEFAULT_MEMBER: PortfolioEntry = Object.freeze({ id: "maxrects-bl", strategy: "maxrects", options: Object.freeze({ rule: "bl" }) });

/** The default count of the packs of each search over orders */
const DEFAULT_ITERATIONS = 64;

/** The chance that a random change turns an item, when the member turns items. Else the change swaps two items. */
const TURN_CHANCE = 0.2;

/** The largest count of the tries of one search, as a factor of `iterations`. A try that the cache answers costs no pack. */
const TRY_FACTOR = 4;

/**
 * This function gives the supports of the searches over orders: the union of the supports of the 6 single strategies.
 * A search changes the reading order, so the order is only `free` or `soft`.
 */
function orderSupports(): Supports {
  const out: Record<string, string[]> = {};
  for (const s of [rows, skyline, shelf, push, maxrects, guillotine] as Strategy[]) {
    for (const [dim, values] of Object.entries(s.supports) as [string, string[]][]) {
      const list = (out[dim] ??= []);
      for (const v of values) if (!list.includes(v)) list.push(v);
    }
  }
  out["order"] = ["free", "soft"];
  return out as unknown as Supports;
}

/** The key of the searches: the hard breaks, then `PORTFOLIO_LEVELS`. It is the key of `restarts` with its default option `key`. */
const KEY = measureKey(PORTFOLIO_LEVELS.slice(1));

/** One genome of a search: the order of the movable items, and the ids of the items that turn. */
interface Genome {
  readonly order: readonly string[];
  readonly turned: ReadonlySet<string>;
}

/** One genome with its output and the values of the key */
interface Scored {
  readonly genome: Genome;
  readonly output: PackOutput;
  readonly values: Readonly<Record<string, number>>;
  /** The index of the pack that gave the output. The member output has the index 0. */
  readonly at: number;
}

/** The result of a compare of two scored genomes. `delta` is the loss of a worse candidate on its first worse level. */
interface Verdict {
  readonly verdict: "better" | "tie" | "worse";
  readonly level: string;
  readonly delta: number;
}

/** The checked common options of a search */
interface Common {
  member: PortfolioEntry;
  sortOrder: SortOrder;
  iterations: number;
  budgetWork: number | undefined;
}

/** This function checks the common options of a search, and gives them. It throws a `RangeError` for a bad option. */
function checkedCommon(owner: string, options: { member?: string | PortfolioEntry; iterations?: number; budgetWork?: number }): Common {
  const given = options.member ?? DEFAULT_MEMBER;
  const member = typeof given === "string" ? { id: given, strategy: given } : given;
  const defaults = strategy(member.strategy).defaults as Record<string, unknown>;
  if (!("sortOrder" in defaults)) throw new RangeError(`The member of ${owner} is a strategy with the option sortOrder, not "${member.strategy}".`);
  const { iterations } = options;
  if (iterations !== undefined && !(Number.isInteger(iterations) && iterations >= 1)) throw new RangeError(`The option iterations of ${owner} is a whole number of 1 or more, not ${String(iterations)}.`);
  checkBudgetWork(owner, options.budgetWork);
  const sortOrder = ({ ...defaults, ...(member.options as object | undefined) } as { sortOrder: SortOrder }).sortOrder;
  return { member, sortOrder, iterations: iterations ?? DEFAULT_ITERATIONS, budgetWork: options.budgetWork };
}

/** This function throws a `RangeError` when a value is not a number in a range. `low` is not in the range when `open` is true. */
function checkRange(owner: string, name: string, value: number | undefined, low: number, high: number, open: boolean): void {
  if (value === undefined) return;
  const ok = typeof value === "number" && (open ? value > low : value >= low) && value <= high;
  if (!ok) throw new RangeError(`The option ${name} of ${owner} is a number ${open ? "above" : "from"} ${low} ${open ? "and to" : "to"} ${high}, not ${String(value)}.`);
}

/** This function throws a `RangeError` when a value is not a whole number in a range. */
function checkWhole(owner: string, name: string, value: number | undefined, low: number, high: number): void {
  if (value === undefined) return;
  if (!(Number.isInteger(value) && value >= low && value <= high)) throw new RangeError(`The option ${name} of ${owner} is a whole number from ${low} to ${high}, not ${String(value)}.`);
}

/** This function removes the field `rank` of an item. The array order of a decoded input is its rank order. */
const unranked = (item: Item): Item => (item.rank === undefined ? item : (({ rank: _rank, ...rest }) => rest)(item));

/** This function removes the field `turnable` of an item. The genome then decides the turn. */
const fixedTurn = (item: Item): Item => (item.turnable === undefined ? item : (({ turnable: _t, ...rest }) => rest)(item));

/** This function gives a random whole number from 0 to `n - 1`. */
const pick = (r: () => number, n: number): number => Math.floor(r() * n);

/**
 * The state of one search over orders on one input. It decodes each genome with the member, and it keeps a cache of the outputs.
 * The class counts the packs and the work, and it compares two outputs by the key.
 */
class OrderSearch {
  readonly input: PackInput;
  readonly member: PortfolioEntry;
  readonly seed: number;
  readonly iterations: number;
  readonly budgetWork: number | undefined;
  /** The value `true` tells that the genome decides the turns: the member turns items, and the input has turnable items. */
  readonly turns: boolean;
  /** The ids of the movable items that can turn */
  readonly turnable: readonly string[];
  /** The start genome: the order of the member and the turns of the member output */
  readonly start: Scored;
  /** The count of the packs of the member, the member output included */
  packs = 1;
  /** The count of the tries, the tries that the cache answers included */
  tries = 0;
  /** The work of the packs in work units */
  spent: number;
  /** The value `true` tells that the work limit stopped the search */
  stopped = false;
  private readonly items: Map<string, Item>;
  private readonly fixed: readonly Item[];
  private readonly index: ReadonlyMap<string, number>;
  private readonly cache = new Map<string, Scored>();

  constructor(input: PackInput, common: Common, seed: number) {
    this.input = input;
    this.member = common.member;
    this.seed = seed;
    this.iterations = common.iterations;
    this.budgetWork = common.budgetWork;
    this.items = new Map(input.items.map((i) => [i.id, i]));
    this.index = new Map(byRank(input.items).map((item, i) => [item.id, i]));
    const order = memberOrder(input, common.sortOrder).map((k) => k.item);
    const isFixed = (i: Item): boolean => i.locked === true && i.x !== undefined && i.y !== undefined;
    this.fixed = order.filter(isFixed).map(unranked);
    const movable = order.filter((i) => !isFixed(i));
    const options = { ...(strategy(this.member.strategy).defaults as object), ...(this.member.options as object | undefined) } as { rotate?: boolean };
    const turnable = movable.filter((i) => i.turnable === true && i.locked !== true).map((i) => i.id);
    this.turns = options.rotate === true && turnable.length > 0 && cellOf(input).rotation === "quarter";
    this.turnable = this.turns ? turnable : [];
    const output = packWith(this.member.strategy, input, this.member.options, seed);
    this.spent = packWork(input, output);
    const turned = new Set(this.turns ? output.placements.filter((p) => p.turn === 90).map((p) => p.id) : []);
    const genome: Genome = { order: movable.map((i) => i.id), turned };
    this.start = { genome, output, values: this.valuesOf(output), at: 0 };
    this.cache.set(this.keyOf(genome), this.start);
  }

  /** This function gives the values of the key of an output. */
  private valuesOf(output: PackOutput): Record<string, number> {
    const values: Record<string, number> = { hard: KEY.hard(this.input, output) };
    for (const level of KEY.levels) values[level.id] = level.value(this.input, output);
    return values;
  }

  /** This function gives the cache key of a genome. */
  private keyOf(genome: Genome): string {
    return JSON.stringify(genome.order.map((id) => (genome.turned.has(id) ? [id, 1] : id)));
  }

  /** This function tells if one more try can start: the count of the tries is below its limit. */
  canTry(): boolean {
    return this.tries < TRY_FACTOR * this.iterations && !this.stopped && this.packs < this.iterations;
  }

  /** This function gives the input of a genome: the fixed items, then the movable items in the order of the genome. */
  private decodedInput(genome: Genome): PackInput {
    const item = (id: string): Item => {
      const base = unranked(this.items.get(id)!);
      if (!this.turns) return base;
      return fixedTurn(genome.turned.has(id) ? turnItem(base) : base);
    };
    return { ...this.input, items: [...this.fixed, ...genome.order.map(item)] };
  }

  /**
   * This function gives a genome with its output and its values. The cache answers a known genome with no pack.
   * It gives `undefined` when the count of the packs or the work limit stops the search.
   */
  score(genome: Genome): Scored | undefined {
    this.tries++;
    const key = this.keyOf(genome);
    const known = this.cache.get(key);
    if (known !== undefined) return known;
    if (this.packs >= this.iterations) return undefined;
    if (this.budgetWork !== undefined && this.spent >= this.budgetWork) {
      this.stopped = true;
      return undefined;
    }
    const x = this.decodedInput(genome);
    const out = packWith(this.member.strategy, x, { ...(this.member.options as object | undefined), sortOrder: "input" }, this.seed);
    this.spent += packWork(x, out);
    const placements = this.turns ? out.placements.map((p) => (genome.turned.has(p.id) ? { ...p, turn: 90 as const } : p)) : out.placements;
    const output = rankSorted({ ...out, placements }, this.index);
    const scored: Scored = { genome, output, values: this.valuesOf(output), at: this.packs };
    this.packs++;
    this.cache.set(key, scored);
    return scored;
  }

  /** This function compares a candidate with a baseline by the key, with `selectBest`. A tie keeps the baseline. */
  compare(candidate: Scored, baseline: Scored): Verdict {
    const cands: SelectCandidate[] = [
      { id: "baseline", values: baseline.values },
      { id: "candidate", values: candidate.values },
    ];
    const sel = selectBest(cands, PORTFOLIO_LEVELS);
    if (sel.winner === "candidate") return { verdict: "better", level: "", delta: 0 };
    const out = sel.kept.findIndex((ids) => !ids.includes("candidate"));
    if (out === -1) return { verdict: "tie", level: "", delta: 0 };
    const level = PORTFOLIO_LEVELS[out]!.id;
    return { verdict: "worse", level, delta: Math.abs(candidate.values[level]! - baseline.values[level]!) };
  }

  /** This function gives the index of the best of some scored genomes by the key, with `selectBest`. A tie keeps the earlier one. */
  bestOf(list: readonly Scored[]): number {
    const sel = selectBest(list.map((s, i) => ({ id: String(i), values: s.values })), PORTFOLIO_LEVELS);
    return Number(sel.winner);
  }

  /** This function gives a genome with two items swapped. `i` and `j` are positions of the order. */
  swapped(genome: Genome, i: number, j: number): Genome {
    const order = [...genome.order];
    [order[i], order[j]] = [order[j]!, order[i]!];
    return { order, turned: genome.turned };
  }

  /** This function gives a genome with the item at position `i` moved to position `j`. */
  inserted(genome: Genome, i: number, j: number): Genome {
    const order = [...genome.order];
    const [id] = order.splice(i, 1);
    order.splice(j, 0, id!);
    return { order, turned: genome.turned };
  }

  /** This function gives a genome with the turn of one item changed. */
  flipped(genome: Genome, id: string): Genome {
    const turned = new Set(genome.turned);
    if (turned.has(id)) turned.delete(id);
    else turned.add(id);
    return { order: genome.order, turned };
  }

  /** This function gives a genome after one random change: a turn of a turnable item, else a swap of two random items. */
  mutated(genome: Genome, r: () => number): Genome {
    const n = genome.order.length;
    if (this.turns && (n < 2 || r() < TURN_CHANCE)) return this.flipped(genome, this.turnable[pick(r, this.turnable.length)]!);
    if (n < 2) return genome;
    const i = pick(r, n);
    const j = (i + 1 + pick(r, n - 1)) % n;
    return this.swapped(genome, i, j);
  }

  /** This function tells if a random change can change a genome: two movable items or one item that turns. */
  canMove(): boolean {
    return this.start.genome.order.length >= 2 || this.turns;
  }

  /** This function gives the trace measures of the work limit, or no measure without `budgetWork`. */
  workMeasures(): Record<string, number> {
    if (this.budgetWork === undefined) return {};
    return { [WORK_SPENT]: this.spent, [WORK_BUDGET]: this.budgetWork, [WORK_STOPPED]: this.stopped ? 1 : 0 };
  }

  /**
   * This function gives the output of a search: the best genome when it is better than the member output by the key, else the member output.
   * The output gets the trace stage of the search with its measures.
   */
  finish(stage: string, move: string, best: Scored, measures: Record<string, number>): PackOutput {
    const won = best !== this.start && this.compare(best, this.start).verdict === "better" ? best : this.start;
    const all = { [move]: won === this.start ? 0 : 1, [`${stage}.packs`]: this.packs, [`${stage}.bestAt`]: won.at, ...measures, ...this.workMeasures() };
    return { ...won.output, trace: [...(won.output.trace ?? []), { id: stage, measures: all }] };
  }
}

/**
 * The strategy `anneal`: simulated annealing over the order of the items (catalog row `search-sa-order`, Kirkpatrick 1983, Hopper 2001).
 * `docs/PACKER.md` tells the method and the choices of this project.
 *
 * - The start is the member output. Each step changes the current genome: a swap or an insert, or a turn when the member turns items.
 * - The member packs the new order with the sort order `input`. The compare is the key of `restarts`, with `selectBest`.
 * - A better candidate or a tie replaces the current genome. A worse candidate replaces it with the chance `exp(-delta / T)`.
 * - `delta` is the loss on the first worse level of the key. A candidate with more hard breaks never replaces the current genome.
 * - The temperature `T` falls geometrically from `temperature` to `temperature * cooling` over the packs.
 * - Step `t` gets the random numbers `stepRandom(seed, "anneal:<t>")` of the contract. The strategy reads no clock.
 * - The output gets the trace stage `anneal` with `move.anneal`, `anneal.packs`, `anneal.bestAt`, `anneal.accepted` and `anneal.uphill`.
 */
export const annealStrategy: Strategy<AnnealStrategyOptions> = {
  id: "anneal",
  family: "order-search",
  catalog: ["search-sa-order"],
  supports: orderSupports(),
  defaults: { iterations: DEFAULT_ITERATIONS, temperature: 0.01, cooling: 0.01 },
  deterministic: true,
  pack(input: PackInput, options: AnnealStrategyOptions, context: PackContext): PackOutput {
    assertSupported(annealStrategy.supports, input);
    const common = checkedCommon("anneal", options);
    checkRange("anneal", "temperature", options.temperature, 0, 1, true);
    checkRange("anneal", "cooling", options.cooling, 0, 1, true);
    const t0 = options.temperature ?? 0.01;
    const cooling = options.cooling ?? 0.01;
    const search = new OrderSearch(input, common, context.seed);
    let current = search.start;
    let best = current;
    let accepted = 0;
    let uphill = 0;
    const span = Math.max(1, search.iterations - 2);
    for (let t = 1; search.canMove() && search.canTry(); t++) {
      const r = stepRandom(context.seed, `anneal:${t}`);
      const n = current.genome.order.length;
      let genome: Genome;
      if (search.turns && (n < 2 || r() < TURN_CHANCE)) genome = search.flipped(current.genome, search.turnable[pick(r, search.turnable.length)]!);
      else {
        const i = pick(r, n);
        const j = (i + 1 + pick(r, n - 1)) % n;
        genome = r() < 0.5 ? search.swapped(current.genome, i, j) : search.inserted(current.genome, i, j);
      }
      const temperature = t0 * cooling ** Math.min(1, (search.packs - 1) / span);
      const cand = search.score(genome);
      if (cand === undefined) break;
      const v = search.compare(cand, current);
      if (v.verdict === "worse" && (v.level === "hard" || !(r() < Math.exp(-v.delta / temperature)))) continue;
      if (v.verdict === "worse") uphill++;
      if (cand !== current) accepted++;
      current = cand;
      if (search.compare(current, best).verdict === "better") best = current;
    }
    return search.finish(ANNEAL_STAGE, "move.anneal", best, { "anneal.accepted": accepted, "anneal.uphill": uphill });
  },
};

/** This function gives the child of two parents by the order crossover (OX): a slice of `a`, then the other items in the order of `b`. */
function orderCrossover(a: Genome, b: Genome, r: () => number): Genome {
  const n = a.order.length;
  const i = pick(r, n);
  const j = pick(r, n);
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  const slice = a.order.slice(lo, hi + 1);
  const inSlice = new Set(slice);
  const rest: string[] = [];
  // The rest starts after the slice in `b`, and goes round to the start, as in Davis 1985
  for (let k = 1; k <= n; k++) {
    const id = b.order[(hi + k) % n]!;
    if (!inSlice.has(id)) rest.push(id);
  }
  const order: string[] = new Array<string>(n);
  for (let k = 0; k < slice.length; k++) order[lo + k] = slice[k]!;
  for (let k = 0; k < rest.length; k++) order[(hi + 1 + k) % n] = rest[k]!;
  // Each item keeps the turn of the parent that gave its place
  const turned = new Set<string>();
  for (const id of order) if (inSlice.has(id) ? a.turned.has(id) : b.turned.has(id)) turned.add(id);
  return { order, turned };
}

/**
 * The strategy `genetic`: a genetic algorithm over the order of the items (catalog row `search-ga-order`, Jakobs 1996, Hopper 2001).
 * `docs/PACKER.md` tells the method and the choices of this project.
 *
 * - The first generation is the member output and `population - 1` random changes of the member order. Child `i` has `i` changes.
 * - Each next generation keeps the best genome (elitism). Each other child comes from two parents of two tournaments of 2.
 * - A child is the order crossover (OX) of its parents. With the chance `mutation`, it gets one more random change: a swap or a turn.
 * - The compare is the key of `restarts`, with `selectBest`. A tie of a tournament keeps the first genome.
 * - Child `t` gets the random numbers `stepRandom(seed, "genetic:<t>")` of the contract. The strategy reads no clock.
 * - The output gets the trace stage `genetic` with `move.genetic`, `genetic.packs`, `genetic.bestAt` and `genetic.generations`.
 */
export const geneticStrategy: Strategy<GeneticStrategyOptions> = {
  id: "genetic",
  family: "order-search",
  catalog: ["search-ga-order"],
  supports: orderSupports(),
  defaults: { iterations: DEFAULT_ITERATIONS, population: 8, mutation: 0.5 },
  deterministic: true,
  pack(input: PackInput, options: GeneticStrategyOptions, context: PackContext): PackOutput {
    assertSupported(geneticStrategy.supports, input);
    const common = checkedCommon("genetic", options);
    checkWhole("genetic", "population", options.population, 2, 256);
    checkRange("genetic", "mutation", options.mutation, 0, 1, false);
    const size = options.population ?? 8;
    const mutation = options.mutation ?? 0.5;
    const search = new OrderSearch(input, common, context.seed);
    let best = search.start;
    let generations = 0;
    let t = 0;
    const track = (s: Scored): void => {
      if (search.compare(s, best).verdict === "better") best = s;
    };
    // The first generation: the member output, then the member order with 1, 2, ... random changes
    let population: Scored[] = [search.start];
    while (search.canMove() && population.length < size && search.canTry()) {
      t++;
      const r = stepRandom(context.seed, `genetic:${t}`);
      let genome = search.start.genome;
      for (let c = 0; c < population.length; c++) genome = search.mutated(genome, r);
      const s = search.score(genome);
      if (s === undefined) break;
      population.push(s);
      track(s);
    }
    generations = 1;
    const tournament = (r: () => number): Scored => {
      const a = population[pick(r, population.length)]!;
      const b = population[pick(r, population.length)]!;
      return search.compare(b, a).verdict === "better" ? b : a;
    };
    while (search.canMove() && population.length >= 2 && search.canTry()) {
      const next: Scored[] = [population[search.bestOf(population)]!];
      while (next.length < size && search.canTry()) {
        t++;
        const r = stepRandom(context.seed, `genetic:${t}`);
        const pa = tournament(r);
        const pb = tournament(r);
        let genome = orderCrossover(pa.genome, pb.genome, r);
        if (r() < mutation) genome = search.mutated(genome, r);
        const s = search.score(genome);
        if (s === undefined) break;
        next.push(s);
        track(s);
      }
      if (next.length < 2) break;
      population = next;
      generations++;
    }
    return search.finish(GENETIC_STAGE, "move.genetic", best, { "genetic.generations": generations });
  },
};

/**
 * The strategy `tabu`: a tabu search over swaps of two items in the order (catalog row `search-tabu`, Glover 1986, Iori 2003).
 * `docs/PACKER.md` tells the method and the choices of this project.
 *
 * - The start is the member output. Each step tries `neighbors` random swaps of the current genome, or turns when the member turns items.
 * - The step moves to the best move that is not tabu, also when it is worse than the current genome.
 * - A swapped pair of items, or a turned item, stays tabu for `tenure` steps.
 * - The aspiration rule: a tabu move is allowed when it is better than the best genome.
 * - The compare is the key of `restarts`, with `selectBest`. A tie keeps the earlier move.
 * - Step `t` gets the random numbers `stepRandom(seed, "tabu:<t>")` of the contract. The strategy reads no clock.
 * - The output gets the trace stage `tabu` with `move.tabu`, `tabu.packs`, `tabu.bestAt`, `tabu.steps` and `tabu.aspirations`.
 */
export const tabuStrategy: Strategy<TabuStrategyOptions> = {
  id: "tabu",
  family: "order-search",
  catalog: ["search-tabu"],
  supports: orderSupports(),
  defaults: { iterations: DEFAULT_ITERATIONS, tenure: 7, neighbors: 8 },
  deterministic: true,
  pack(input: PackInput, options: TabuStrategyOptions, context: PackContext): PackOutput {
    assertSupported(tabuStrategy.supports, input);
    const common = checkedCommon("tabu", options);
    checkWhole("tabu", "tenure", options.tenure, 0, 1024);
    checkWhole("tabu", "neighbors", options.neighbors, 1, 1024);
    const tenure = options.tenure ?? 7;
    const neighbors = options.neighbors ?? 8;
    const search = new OrderSearch(input, common, context.seed);
    let current = search.start;
    let best = current;
    let steps = 0;
    let aspirations = 0;
    /** The step up to which each move attribute stays tabu */
    const tabu = new Map<string, number>();
    for (let t = 1; search.canMove() && search.canTry(); t++) {
      const r = stepRandom(context.seed, `tabu:${t}`);
      const n = current.genome.order.length;
      const tried: { scored: Scored; attribute: string }[] = [];
      const seen = new Set<string>();
      for (let k = 0; k < neighbors && search.canTry(); k++) {
        let genome: Genome;
        let attribute: string;
        if (search.turns && (n < 2 || r() < TURN_CHANCE)) {
          const id = search.turnable[pick(r, search.turnable.length)]!;
          genome = search.flipped(current.genome, id);
          attribute = JSON.stringify(["turn", id]);
        } else {
          const i = pick(r, n);
          const j = (i + 1 + pick(r, n - 1)) % n;
          genome = search.swapped(current.genome, i, j);
          attribute = JSON.stringify([current.genome.order[i]!, current.genome.order[j]!].sort());
        }
        if (seen.has(attribute)) continue;
        seen.add(attribute);
        const scored = search.score(genome);
        if (scored === undefined) break;
        tried.push({ scored, attribute });
      }
      if (tried.length === 0) break;
      const admissible = tried.filter((m) => (tabu.get(m.attribute) ?? 0) < t || search.compare(m.scored, best).verdict === "better");
      if (admissible.length === 0) continue;
      const chosen = admissible[search.bestOf(admissible.map((m) => m.scored))]!;
      if ((tabu.get(chosen.attribute) ?? 0) >= t) aspirations++;
      tabu.set(chosen.attribute, t + tenure);
      current = chosen.scored;
      steps++;
      if (search.compare(current, best).verdict === "better") best = current;
    }
    return search.finish(TABU_STAGE, "move.tabu", best, { "tabu.steps": steps, "tabu.aspirations": aspirations });
  },
};
