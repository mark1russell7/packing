// The data of the strategy cards (roadmap item k74, part 1). Each card joins a strategy of the registry, its named entries
// of the benchmark, its rows of `docs/research/CATALOG.md` and its verdicts of the committed snapshots. The page builds
// the cards at build time, so a new strategy of the registry gets a card with no change to the site.

import {
  ASPECT_FIT_FACTORS,
  MAXRECTS_RULES,
  RESTART_PERTURBS,
  SHELF_FITS,
  SORT_ORDERS,
  type AspectFitStrategyOptions,
  type Dimension,
  type DimensionValue,
  type LayoutStrategyOptions,
  type MaxRectsStrategyOptions,
  type PortfolioStrategyOptions,
  type PushStrategyOptions,
  type RestartsStrategyOptions,
  type SelectStrategyOptions,
  type Strategy,
} from "@mark1russell7/packing";
import { CORPUS_LABELS, MEASURE_LABELS, type Label, type StrategySnapshot } from "./data.ts";

// ---- The stages ----

/** The 5 stages of the pipeline of a packing, in order */
export const STAGES = ["order", "size-search", "placement", "local-search", "combine"] as const;

/** A stage of the pipeline */
export type Stage = (typeof STAGES)[number];

/** The name and the note of each stage */
export const STAGE_LABELS: Readonly<Record<Stage, { label: string; note: string }>> = {
  order: { label: "Order", note: "The order of the boxes before the placement. The option `sortOrder` of each placement strategy sets this stage." },
  "size-search": { label: "Size search", note: "The search for the size of a free container. Each placement strategy has the size search `log-sweep`." },
  placement: { label: "Placement", note: "The rule that puts each box in the container." },
  "local-search": { label: "Local search", note: "The changes to the boxes after a first place, for example a push cascade." },
  combine: { label: "Combine", note: "The choice between the outputs of other strategies." },
};

/** The stage of a strategy, and the rule and the cost of a strategy with no catalog row */
export interface StageInfo {
  stage: Stage;
  /** The rule in one line. Only a strategy with no catalog row has it. */
  rule?: string;
  /** The time for `n` boxes. Only a strategy with no catalog row has it. */
  cost?: string;
}

/**
 * The stage of each strategy of the registry. The test `cards.test.ts` makes sure that each registry id has a stage.
 * A strategy with no catalog row also gets its rule and its cost here.
 */
export const STRATEGY_STAGES: Readonly<Record<string, StageInfo>> = {
  rows: { stage: "placement" },
  skyline: { stage: "placement" },
  shelf: { stage: "placement" },
  maxrects: { stage: "placement" },
  push: { stage: "local-search" },
  "aspect-fit": {
    stage: "size-search",
    rule: "Pack with the wrapped strategy at some widths near the target aspect. Keep the output with the smallest aspect error.",
    cost: `one pack, then ${ASPECT_FIT_FACTORS.length} packs of the wrapped strategy`,
  },
  portfolio: {
    stage: "combine",
    rule: "Pack with each member of the set of the cell of the input. Keep the output with the best key.",
    cost: "one pack for each member: 2 or 3 packs",
  },
  select: {
    stage: "combine",
    rule: "Measure the count, the spread and the shape of the input. A decision table picks one member, and that member packs.",
    cost: "`O(n)` for the features, then one pack of the member",
  },
  restarts: {
    stage: "order",
    rule: "Pack with the member in its own order, then in random changes of that order. Keep the output with the best key.",
    cost: "one pack of the member for each restart: 16 packs by default",
  },
};

// ---- The catalog ----

/** One row of a method table of `docs/research/CATALOG.md` */
export interface CatalogRow {
  id: string;
  name: string;
  rule: string;
  source: string;
  goal: string;
  cost: string;
  guarantee: string;
  status: string;
  item: string;
  /** The heading of the section of the table */
  section: string;
}

/** One entry of the bibliography of the catalog */
export interface BibEntry {
  /** The key of the tables, for example `Coffman 1980` */
  key: string;
  /** The full text of the entry, without its key */
  text: string;
  /** The first URL of the entry, or `undefined` for an entry with no URL */
  url: string | undefined;
}

/** The parsed catalog: the rows of each method table by id, and the bibliography */
export interface Catalog {
  rows: ReadonlyMap<string, CatalogRow>;
  bibliography: readonly BibEntry[];
}

/** The columns of a method table. A table of another form does not have the column `Guarantee`. */
const COLUMNS = ["id", "name", "rule", "source", "goal", "cost", "guarantee", "status", "item"] as const;

/** This function splits a row of a Markdown table into its cells. */
const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/**
 * This function parses the text of `docs/research/CATALOG.md`. It reads each table with the column `Guarantee` and the
 * bibliography. It throws an `Error` for a row with the wrong count of cells.
 */
export function parseCatalog(markdown: string): Catalog {
  const rows = new Map<string, CatalogRow>();
  const bibliography: BibEntry[] = [];
  let section = "";
  let columns: number[] | null = null;
  let inTable = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    const bib = /^- \*\*(.+?)\.\*\* (.*)$/.exec(line);
    if (bib !== null) bibliography.push({ key: bib[1]!, text: bib[2]!, url: /<(https?:\/\/[^>]+)>/.exec(bib[2]!)?.[1] });
    if (!line.startsWith("|")) {
      inTable = false;
      columns = null;
      continue;
    }
    const cells = cellsOf(line);
    if (!inTable) {
      inTable = true;
      const names = cells.map((c) => c.replace(/`/g, "").toLowerCase());
      columns = names.includes("guarantee") ? COLUMNS.map((c) => names.indexOf(c)) : null;
      continue;
    }
    if (columns === null || /^\|[-| :]+\|$/.test(line.trim())) continue;
    if (columns.includes(-1)) throw new Error(`A method table of the section "${section}" has no column ${COLUMNS[columns.indexOf(-1)]}.`);
    if (cells.length !== columns.length) throw new Error(`The row "${cells[0]}" of the section "${section}" has ${cells.length} cells, not ${columns.length}.`);
    const value = (c: (typeof COLUMNS)[number]): string => cells[columns![COLUMNS.indexOf(c)]!]!;
    const id = value("id").replace(/^`([^`]+)`$/, "$1");
    if (!rows.has(id)) {
      rows.set(id, {
        id,
        name: value("name"),
        rule: value("rule"),
        source: value("source"),
        goal: value("goal"),
        cost: value("cost"),
        guarantee: value("guarantee"),
        status: value("status"),
        item: value("item"),
        section,
      });
    }
  }
  return { rows, bibliography };
}

/** This function gives the entries of the bibliography that a source cell names, in the order of the cell. */
export function sourcesOf(source: string, bibliography: readonly BibEntry[]): BibEntry[] {
  return bibliography
    .filter((b) => source.includes(b.key))
    .sort((a, b) => source.indexOf(a.key) - source.indexOf(b.key));
}

/** This function gives the text of an entry of the bibliography with no autolink. The page shows it as plain text. */
export function bibText(b: BibEntry): string {
  return (b.url === undefined ? b.text : b.text.split(`<${b.url}>`).join("")).trim();
}

/** This function gives the URL of a link of the catalog. It gives `undefined` for a link that the page does not open. */
export function catalogHref(href: string, catalogUrl: string): string | undefined {
  if (href.startsWith("#")) return `${catalogUrl}${href}`;
  if (/^https?:\/\//.test(href)) return href;
  const docs = /^\.\.\/([\w./-]+\.md)$/.exec(href);
  return docs === null ? undefined : new URL(`../${docs[1]}`, catalogUrl).href;
}

/** This function escapes text for HTML: it replaces each of the characters `&`, `<`, `>`, `"` and `'`. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * This function gives the HTML of a cell of the catalog. It escapes all of the text. It makes each code span a `code`
 * element and each Markdown link a link. It makes no other element.
 */
export function cellHtml(text: string, catalogUrl: string): string {
  const code = (t: string): string =>
    t
      .split("`")
      .map((part, i) => (i % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part)))
      .join("");
  let html = "";
  let at = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^()\s]+)\)/g)) {
    html += code(text.slice(at, m.index));
    const href = catalogHref(m[2]!, catalogUrl);
    html += href === undefined ? code(m[1]!) : `<a href="${escapeHtml(href)}">${code(m[1]!)}</a>`;
    at = m.index + m[0].length;
  }
  return html + code(text.slice(at));
}

// ---- The options ----

/** The union of the options of each strategy of the registry */
type AnyOptions = LayoutStrategyOptions &
  MaxRectsStrategyOptions &
  PushStrategyOptions &
  PortfolioStrategyOptions &
  AspectFitStrategyOptions &
  SelectStrategyOptions &
  RestartsStrategyOptions;

/** The type and the note of an option */
export interface OptionInfo {
  type: string;
  note: string;
}

/** This function gives the type text of a list of string values. */
const oneOf = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(" | ");

/** The type and the note of each option of each strategy. The type `AnyOptions` makes the list complete. */
export const OPTION_INFO: Readonly<Record<keyof AnyOptions, OptionInfo>> = {
  sortOrder: { type: oneOf(SORT_ORDERS), note: "The order of the boxes before the placement." },
  samples: { type: "number", note: "The count of widths of the first pass of the size search `log-sweep`." },
  fit: { type: oneOf(SHELF_FITS), note: "The rule to choose a shelf. Only `shelf` reads it." },
  rule: { type: oneOf(MAXRECTS_RULES), note: "The rule to choose a free rectangle." },
  rotate: { type: "boolean", note: "The value `true` lets each turnable box turn by 90 degrees." },
  bandHeight: { type: "number", note: "The largest band height of the approximation of a container that is not a rectangle." },
  maxShovesPerItem: { type: "number", note: "The most shoves for each box. The cascade stops at this limit." },
  k: { type: "2 | 3", note: "The size of the set of the cell." },
  maxMembers: { type: "number", note: "The largest count of the members that the strategy starts." },
  budgetMs: { type: "number", note: "A time limit in milliseconds. A cut member makes the result depend on the clock." },
  members: { type: "(string | PortfolioEntry)[]", note: "The members for each input, in place of the default members." },
  key: { type: "string[]", note: "The measure ids of the key after the hard breaks." },
  strategy: { type: "string", note: "The id of the wrapped strategy of the registry. The option is necessary." },
  options: { type: "object", note: "The options of the wrapped strategy over its defaults." },
  targetAspect: { type: "number", note: "The target aspect. The default is the aspect of the container, else 1." },
  table: { type: "SelectNode", note: "The decision table. Each pick is an index of `members`." },
  member: { type: "string | PortfolioEntry", note: "The member of the restarts: a strategy with the option `sortOrder`. The default is `maxrects-bl`." },
  iterations: { type: "number", note: "The count of the restarts, restart 0 included. Restart 0 is the member in its own order." },
  perturb: { type: oneOf(RESTART_PERTURBS), note: "The change of the order of each run after run 0." },
  strength: { type: "number", note: "The share of the positions that move, from 0 to 1." },
  limitTime: { type: "boolean", note: "The value `true` sets the time limit `budgetMs`." },
};

/** The options of each strategy that have no default. The types of the package make sure that each name is an option of the strategy. */
export const OPTIONAL_OPTIONS: Readonly<Record<string, readonly (keyof AnyOptions)[]>> = {
  shelf: ["fit"] satisfies (keyof LayoutStrategyOptions)[],
  maxrects: ["bandHeight"] satisfies (keyof MaxRectsStrategyOptions)[],
  portfolio: ["k", "maxMembers", "budgetMs", "members", "key"] satisfies (keyof PortfolioStrategyOptions)[],
  "aspect-fit": ["strategy", "options", "targetAspect"] satisfies (keyof AspectFitStrategyOptions)[],
  select: ["members", "table"] satisfies (keyof SelectStrategyOptions)[],
  restarts: ["member", "budgetMs", "key"] satisfies (keyof RestartsStrategyOptions)[],
};

/** One option of a card */
export interface CardOption {
  name: string;
  type: string;
  /** The default as JSON, or `null` for an option with no default */
  value: string | null;
  note: string;
}

/** This function gives the options of a strategy: each option of its defaults, then each option of `OPTIONAL_OPTIONS`. */
export function optionsOf(s: Strategy): CardOption[] {
  const defaults = (s.defaults ?? {}) as Record<string, unknown>;
  const info = (name: string): OptionInfo | undefined => (OPTION_INFO as Record<string, OptionInfo>)[name];
  const out: CardOption[] = Object.entries(defaults).map(([name, v]) => ({
    name,
    type: info(name)?.type ?? typeof v,
    value: JSON.stringify(v),
    note: info(name)?.note ?? "",
  }));
  for (const name of OPTIONAL_OPTIONS[s.id] ?? []) {
    if (name in defaults) continue;
    out.push({ name, type: info(name)?.type ?? "unknown", value: null, note: info(name)?.note ?? "" });
  }
  return out;
}

// ---- The cells ----

/** Each value of each dimension of the taxonomy. The type makes the list complete. */
const DIMENSION_VALUES = {
  containerSize: { fixed: 1, freeHeight: 1, freeWidth: 1, freeAspect: 1, freeArea: 1 },
  containerShape: { rect: 1, convex: 1, polygon: 1, circle: 1, ellipse: 1, holes: 1 },
  obstacleMove: { fixed: 1, costly: 1, free: 1 },
  itemShape: { rect: 1, circle: 1, convex: 1, polygon: 1, mixed: 1 },
  rotation: { none: 1, quarter: 1, any: 1 },
  order: { free: 1, soft: 1, hard: 1 },
  groups: { none: 1, flat: 1, nested: 1 },
  mode: { offline: 1, online: 1, incremental: 1 },
} as const satisfies { [D in Dimension]: Record<DimensionValue<D>, 1> };

/** The name of each dimension of the taxonomy */
export const DIMENSION_LABELS: Readonly<Record<Dimension, string>> = {
  containerSize: "Container size",
  containerShape: "Container shape",
  obstacleMove: "Obstacles",
  itemShape: "Box shape",
  rotation: "Rotation",
  order: "Order",
  groups: "Groups",
  mode: "Mode",
};

/** The supported values of one dimension of a card */
export interface CardCells {
  dimension: Dimension;
  label: string;
  values: { value: string; on: boolean }[];
}

/** This function gives each dimension of a strategy with each value, and tells which values the strategy supports. */
export function cellsOfStrategy(s: Strategy): CardCells[] {
  return (Object.keys(DIMENSION_VALUES) as Dimension[]).map((dimension) => {
    const own = (s.supports[dimension] ?? []) as readonly string[];
    return { dimension, label: DIMENSION_LABELS[dimension], values: Object.keys(DIMENSION_VALUES[dimension]).map((value) => ({ value, on: own.includes(value) })) };
  });
}

// ---- The verdicts ----

/** The state of one verdict of a strip: a label of the snapshot, or `baseline` for the baseline of the corpus */
export type StripLabel = Label | "baseline";

/** The verdicts of one entry on one corpus */
export interface CorpusStrip {
  corpus: string;
  label: string;
  cells: { measure: string; label: StripLabel; summary: string }[];
}

/** The measures of a verdict strip, in order: fill, order, aspect, overflow */
export const STRIP_MEASURES: readonly string[] = Object.keys(MEASURE_LABELS);

/** This function gives the verdict strip of an entry: one row for each snapshot, one cell for each measure of `STRIP_MEASURES`. */
export function stripOf(entry: string, snapshots: readonly StrategySnapshot[]): CorpusStrip[] {
  return snapshots.map((snap) => {
    const label = CORPUS_LABELS[snap.corpus]?.label ?? snap.corpus;
    const s = snap.strategies.find((x) => x.strategy === entry);
    const cells = STRIP_MEASURES.map((measure) => {
      if (entry === snap.baseline) return { measure, label: "baseline" as const, summary: `The baseline of the verdicts of ${label}.` };
      const v = s?.verdicts.find((x) => x.measure === measure);
      if (v === undefined) return { measure, label: "not measured" as const, summary: `The snapshot of ${label} has no verdict of this entry.` };
      return { measure, label: v.label, summary: v.summary };
    });
    return { corpus: snap.corpus, label, cells };
  });
}

// ---- The cards ----

/** An entry of the benchmark: the form of `ENTRIES` of `packages/packing/bench/entries.ts` */
export interface EntryLike {
  id: string;
  strategy: string;
  options: Readonly<Record<string, unknown>>;
  base?: string;
}

/** One named entry of a card */
export interface CardEntry {
  id: string;
  /** The options of the entry over the defaults, as JSON */
  options: string;
  base: string | undefined;
  /** The catalog row with the id of the entry, or `undefined` */
  row: CatalogRow | undefined;
  strip: CorpusStrip[];
}

/** The card of one strategy of the registry */
export interface StrategyCard {
  id: string;
  family: string;
  /** The stage of `STRATEGY_STAGES`, or `undefined` for a strategy that it does not have */
  stage: Stage | undefined;
  composite: boolean;
  deterministic: boolean;
  /** The catalog rows that the strategy builds */
  rows: CatalogRow[];
  /** The catalog ids of the strategy that the catalog does not have */
  missing: string[];
  /** The name in the literature: the name of the first catalog row, else the id */
  name: string;
  /** The rule and the cost of `STRATEGY_STAGES` for a strategy with no catalog row */
  rule: string | undefined;
  cost: string | undefined;
  options: CardOption[];
  cells: CardCells[];
  entries: CardEntry[];
  // Part 2 of roadmap item k74 adds the response curve and the Sobol indices of each option here. They need `packSpace`
  // of roadmap item k68.
}

/** The inputs of `buildCards` */
export interface CardInputs {
  strategies: readonly Strategy[];
  composites: readonly Strategy[];
  entries: readonly EntryLike[];
  catalog: Catalog;
  snapshots: readonly StrategySnapshot[];
}

/**
 * This function builds one card for each strategy of the registry, in the order of the registry. It throws a
 * `RangeError` for an entry with a strategy that the registry does not have.
 */
export function buildCards(input: CardInputs): StrategyCard[] {
  const all = [...input.strategies.map((s) => ({ s, composite: false })), ...input.composites.map((s) => ({ s, composite: true }))];
  for (const e of input.entries) {
    if (!all.some((x) => x.s.id === e.strategy)) throw new RangeError(`The entry "${e.id}" uses the strategy "${e.strategy}", but the registry does not have it.`);
  }
  return all.map(({ s, composite }) => {
    const rows = s.catalog.flatMap((id) => input.catalog.rows.get(id) ?? []);
    const info = STRATEGY_STAGES[s.id];
    return {
      id: s.id,
      family: s.family,
      stage: info?.stage,
      composite,
      deterministic: s.deterministic,
      rows,
      missing: s.catalog.filter((id) => !input.catalog.rows.has(id)),
      name: rows[0]?.name ?? s.id,
      rule: rows.length === 0 ? info?.rule : undefined,
      cost: rows.length === 0 ? info?.cost : undefined,
      options: optionsOf(s),
      cells: cellsOfStrategy(s),
      entries: input.entries
        .filter((e) => e.strategy === s.id)
        .map((e) => ({ id: e.id, options: JSON.stringify(e.options), base: e.base, row: input.catalog.rows.get(e.id), strip: stripOf(e.id, input.snapshots) })),
    };
  });
}

/** This function groups the cards by family, in the order of the first card of each family. */
export function byFamily(cards: readonly StrategyCard[]): [string, StrategyCard[]][] {
  const groups = new Map<string, StrategyCard[]>();
  for (const c of cards) {
    const list = groups.get(c.family);
    if (list === undefined) groups.set(c.family, [c]);
    else list.push(c);
  }
  return [...groups];
}

/** This function tells if a card passes the filters. The value `all` passes each card. */
export function passes(card: StrategyCard, family: string, stage: Stage | "all"): boolean {
  return (family === "all" || card.family === family) && (stage === "all" || card.stage === stage);
}
