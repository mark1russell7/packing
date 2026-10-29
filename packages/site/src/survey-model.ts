// The survey as data (roadmap item k108). The file `docs/research/survey.json` has one record for each idea of the
// survey: each published method, and each hybrid of this repository. `SURVEY.md`, the queue of `docs/ROADMAP.md` and
// the bibliography of `CATALOG.md` must agree with it. The function `checkSurvey` finds each difference. The script
// `scripts/survey-check.ts` and a test start it. This file imports nothing, so Node can start the script directly.

/** The schema of the survey file */
export const SURVEY_SCHEMA = "packing-survey/1";

/** The classes of problems of the survey */
export const CLASSES = ["strip", "bin", "knapsack", "free width", "placement", "nesting", "circle", "online"] as const;
export type ProblemClass = (typeof CLASSES)[number];

/** The shapes of the items */
export const SHAPES = ["rectangle", "circle", "polygon", "free form"] as const;
export type Shape = (typeof SHAPES)[number];

/** The families of methods */
export const FAMILIES = ["greedy", "local search", "metaheuristic", "exact", "hybrid", "learned", "analytical", "bound", "benchmark", "geometry"] as const;
export type Family = (typeof FAMILIES)[number];

/**
 * The status of an idea.
 *
 * - `built`: the package has it, and its roadmap item is done.
 * - `queued`: its roadmap item has a row in the queue.
 * - `not queued`: no row of the queue holds it.
 * - `rejected`: the owner rejected it. The record gives the reason.
 */
export const STATUSES = ["built", "queued", "not queued", "rejected"] as const;
export type SurveyStatus = (typeof STATUSES)[number];

/** The three factors of the queue, each from 1 to 5 */
export interface Factors {
  gain: number;
  uncertainty: number;
  cost: number;
}

/** One source of an idea. A software source or a data source has no authors and no year. */
export interface SurveySource {
  /** The key of the bibliography of `CATALOG.md`, for example `Wei 2011` */
  key: string;
  authors: string | null;
  year: number | null;
  title: string;
}

/** One idea of the survey */
export interface SurveyMethod {
  /** The id of the idea: `R` and a number for rectangles, `S` and a number for other shapes */
  id: string;
  name: string;
  description: string;
  /** The value `false` for an idea of this repository, for example a hybrid of two built strategies */
  published: boolean;
  sources: SurveySource[];
  problemClass: ProblemClass;
  shapes: Shape[];
  family: Family;
  /** The roadmap item that holds the idea, or `null` */
  item: string | null;
  /** The start of the title of the roadmap item, or `null` when the idea has no item */
  itemTitle: string | null;
  /** Other roadmap items that touch the idea */
  related: string[];
  status: SurveyStatus;
  /** The reason of a rejection, or a note on the status. `null` when there is no note. */
  note: string | null;
  /** The factors of the tables of `SURVEY.md`, or `null` when the survey gives none */
  survey: Factors | null;
  /** The factors of the queue of `docs/ROADMAP.md`, or `null` when the queue has no row for the item */
  queue: Factors | null;
  /** The round of the survey: 1 for k76, 2 for k108 */
  round: number;
}

/** The rule of the next round: a new round starts when the queue holds fewer items than this count of build slots */
export interface RoundRule {
  buildersPerDay: number;
  days: number;
}

/** The survey file */
export interface SurveyFile {
  schema: typeof SURVEY_SCHEMA;
  rule: RoundRule;
  methods: SurveyMethod[];
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isFactor = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
const isFactors = (v: unknown): v is Factors => isObject(v) && isFactor(v["gain"]) && isFactor(v["uncertainty"]) && isFactor(v["cost"]);
const isItem = (v: unknown): v is string => typeof v === "string" && /^k\d+$/.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** This function tells if a value is a valid source. */
function isSource(v: unknown): v is SurveySource {
  return (
    isObject(v) &&
    typeof v["key"] === "string" &&
    (v["authors"] === null || typeof v["authors"] === "string") &&
    (v["year"] === null || Number.isInteger(v["year"])) &&
    typeof v["title"] === "string"
  );
}

/** This function gives the problems of one record of the survey file. An empty list tells that the record is valid. */
function recordProblems(v: unknown, at: number): string[] {
  if (!isObject(v)) return [`The record ${at} is not an object.`];
  const id = typeof v["id"] === "string" ? v["id"] : `at ${at}`;
  const p: string[] = [];
  const need = (ok: boolean, what: string): void => {
    if (!ok) p.push(`The record ${id} has no valid ${what}.`);
  };
  need(typeof v["id"] === "string" && /^[RS]\d+$/.test(v["id"]), "id");
  need(typeof v["name"] === "string" && v["name"] !== "", "name");
  need(typeof v["description"] === "string" && v["description"] !== "", "description");
  need(typeof v["published"] === "boolean", "published");
  need(Array.isArray(v["sources"]) && v["sources"].every(isSource), "sources");
  need(oneOf(CLASSES, v["problemClass"]), "problemClass");
  need(Array.isArray(v["shapes"]) && v["shapes"].length > 0 && v["shapes"].every((s) => oneOf(SHAPES, s)), "shapes");
  need(oneOf(FAMILIES, v["family"]), "family");
  need(v["item"] === null || isItem(v["item"]), "item");
  need(v["item"] === null ? v["itemTitle"] === null : typeof v["itemTitle"] === "string" && v["itemTitle"] !== "", "itemTitle");
  need(Array.isArray(v["related"]) && v["related"].every(isItem), "related");
  need(oneOf(STATUSES, v["status"]), "status");
  need(v["note"] === null || (typeof v["note"] === "string" && v["note"] !== ""), "note");
  need(v["survey"] === null || isFactors(v["survey"]), "survey");
  need(v["queue"] === null || isFactors(v["queue"]), "queue");
  need(Number.isInteger(v["round"]) && (v["round"] as number) >= 1, "round");
  return p;
}

/** This function parses the text of the survey file. It throws an `Error` that names each invalid field. */
export function parseSurvey(text: string): SurveyFile {
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value["schema"] !== SURVEY_SCHEMA) throw new Error(`The survey file has the schema ${SURVEY_SCHEMA}.`);
  const rule = value["rule"];
  if (!isObject(rule) || !Number.isInteger(rule["buildersPerDay"]) || !Number.isInteger(rule["days"])) throw new Error("The survey file has a rule with buildersPerDay and days.");
  const methods = value["methods"];
  if (!Array.isArray(methods) || methods.length === 0) throw new Error("The survey file has no methods.");
  const problems = methods.flatMap(recordProblems);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return value as unknown as SurveyFile;
}

// ---- The other files ----

/** This function splits a row of a Markdown table into its cells. */
const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** One item of the roadmap */
export interface RoadmapItem {
  id: string;
  title: string;
  status: string;
}

/** The items of the roadmap and the factors of each row of its queue */
export interface Roadmap {
  items: ReadonlyMap<string, RoadmapItem>;
  queue: ReadonlyMap<string, Factors>;
}

/** This function parses the item table and the queue table of `docs/ROADMAP.md`. */
export function parseRoadmap(markdown: string): Roadmap {
  const items = new Map<string, RoadmapItem>();
  const queue = new Map<string, Factors>();
  let inQueue = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) inQueue = line.trim() === "## The queue";
    if (!line.startsWith("|")) continue;
    const c = cellsOf(line);
    if (inQueue) {
      if (/^\d+$/.test(c[0]!) && isItem(c[1])) queue.set(c[1], { gain: Number(c[2]), uncertainty: Number(c[3]), cost: Number(c[4]) });
    } else if (isItem(c[0]) && c.length >= 5) {
      items.set(c[0], { id: c[0], title: c[1]!, status: c[3]! });
    }
  }
  return { items, queue };
}

/** One idea of a table of `SURVEY.md` */
export interface SurveyRow {
  id: string;
  name: string;
  description: string;
  sources: string;
  item: string;
  /** The factors, or `null` for a table without them */
  factors: Factors | null;
  /** The score of the table, or `null` */
  score: number | null;
}

/** This function parses each table of `SURVEY.md` with the columns `Rank` and `Idea`. */
export function parseSurveyTables(markdown: string): SurveyRow[] {
  const rows: SurveyRow[] = [];
  let head: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      head = null;
      continue;
    }
    const c = cellsOf(line);
    if (head === null) {
      head = c.includes("Rank") && c.includes("Idea") ? c : [];
      continue;
    }
    if (head.length === 0 || /^[-| :]+$/.test(line.trim())) continue;
    const cell = (name: string): string => (head!.includes(name) ? c[head!.indexOf(name)]! : "");
    const has = head.includes("Gain");
    rows.push({
      id: cell("Rank"),
      name: cell("Idea"),
      description: cell("Description"),
      sources: cell("Sources"),
      item: cell("Item"),
      factors: has ? { gain: Number(cell("Gain")), uncertainty: Number(cell("Uncertainty")), cost: Number(cell("Cost")) } : null,
      score: has ? Number(cell("Score")) : null,
    });
  }
  return rows;
}

/** One entry of the bibliography of `CATALOG.md` */
export interface BibRecord {
  key: string;
  /** The authors, or `null` for an entry without a title in quotes */
  authors: string | null;
  /** The title in quotes, or `null` */
  title: string | null;
}

/** This function parses the bibliography of `CATALOG.md`: the key, the authors and the title of each entry. */
export function parseBibliography(markdown: string): Map<string, BibRecord> {
  const out = new Map<string, BibRecord>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^- \*\*(.+?)\.\*\* (.*)$/.exec(line);
    if (m === null) continue;
    const t = /^(.*?)\. "([^"]+)"/.exec(m[2]!);
    out.set(m[1]!, { key: m[1]!, authors: t?.[1] ?? null, title: t?.[2] ?? null });
  }
  return out;
}

/** This function finds the entry of a key. A software or a data entry has the key with `, software` or `, data`. */
export function bibOf(bib: ReadonlyMap<string, BibRecord>, key: string): BibRecord | undefined {
  return bib.get(key) ?? bib.get(`${key}, software`) ?? bib.get(`${key}, data`);
}

// ---- The check ----

/** The files that the check reads */
export interface SurveyInputs {
  survey: SurveyFile;
  surveyMd: string;
  roadmapMd: string;
  catalogMd: string;
}

/** This function gives the score of the factors: the gain times the uncertainty, divided by the cost. */
export const scoreOf = (f: Factors): number => (f.gain * f.uncertainty) / f.cost;

/** This function gives the score with one decimal, as the tables show it. */
export const scoreText = (f: Factors): string => scoreOf(f).toFixed(1);

const sameFactors = (a: Factors | null, b: Factors | null): boolean =>
  a === null || b === null ? a === b : a.gain === b.gain && a.uncertainty === b.uncertainty && a.cost === b.cost;
const factorsText = (f: Factors | null): string => (f === null ? "none" : `${f.gain}, ${f.uncertainty}, ${f.cost}`);

/** This function gives the problems of the sources of one record against the bibliography and its row of `SURVEY.md`. */
function sourceProblems(m: SurveyMethod, row: SurveyRow | undefined, bib: ReadonlyMap<string, BibRecord>): string[] {
  const p: string[] = [];
  if (m.published && m.sources.length === 0) p.push(`${m.id} is published, but it has no source.`);
  for (const s of m.sources) {
    const b = bibOf(bib, s.key);
    if (b === undefined) {
      p.push(`${m.id}: the bibliography of CATALOG.md has no entry ${s.key}.`);
      continue;
    }
    if (row !== undefined && !row.sources.includes(s.key)) p.push(`${m.id}: the row of SURVEY.md does not name the source ${s.key}.`);
    const year = /(\d{4})[a-z]?$/.exec(s.key)?.[1];
    if (b.title === null) {
      if (s.authors !== null || s.year !== null) p.push(`${m.id}: the source ${s.key} is software or data, so it has no authors and no year.`);
      continue;
    }
    if (s.title !== b.title) p.push(`${m.id}: the title of ${s.key} is "${b.title}" in CATALOG.md, not "${s.title}".`);
    if (s.authors !== b.authors) p.push(`${m.id}: the authors of ${s.key} are "${b.authors}" in CATALOG.md, not "${s.authors}".`);
    if (year === undefined || s.year !== Number(year)) p.push(`${m.id}: the year of ${s.key} is not ${s.year}.`);
  }
  return p;
}

/**
 * This function checks the survey file against `SURVEY.md`, `docs/ROADMAP.md` and the bibliography of `CATALOG.md`.
 * It gives one text for each problem. An empty list tells that the files agree.
 */
export function checkSurvey(input: SurveyInputs): string[] {
  const p: string[] = [];
  const { items, queue } = parseRoadmap(input.roadmapMd);
  const rows = new Map(parseSurveyTables(input.surveyMd).map((r) => [r.id, r]));
  const bib = parseBibliography(input.catalogMd);
  const ids = new Set<string>();
  for (const m of input.survey.methods) {
    if (ids.has(m.id)) p.push(`The id ${m.id} is in the survey file more than once.`);
    ids.add(m.id);
    const row = rows.get(m.id);
    if (row === undefined) p.push(`${m.id} is in the survey file, but no table of SURVEY.md has it.`);
    else {
      if (row.name !== m.name) p.push(`${m.id}: the name is "${row.name}" in SURVEY.md, not "${m.name}".`);
      if (row.description !== m.description) p.push(`${m.id}: the description of SURVEY.md differs.`);
      if (!sameFactors(row.factors, m.survey)) p.push(`${m.id}: the factors of SURVEY.md are ${factorsText(row.factors)}, not ${factorsText(m.survey)}.`);
      if (row.factors !== null && row.score !== Number(scoreText(row.factors))) p.push(`${m.id}: the score of SURVEY.md is not ${scoreText(row.factors)}.`);
    }
    p.push(...sourceProblems(m, row, bib));
    for (const k of m.related) if (!items.has(k)) p.push(`${m.id}: the related item ${k} is not in ROADMAP.md.`);
    const item = m.item === null ? undefined : items.get(m.item);
    if (m.item !== null && item === undefined) p.push(`${m.id}: the item ${m.item} is not in ROADMAP.md.`);
    if (item !== undefined) {
      if (!item.title.startsWith(m.itemTitle ?? "")) p.push(`${m.id}: the title of ${item.id} does not start with "${m.itemTitle}".`);
      const named = /\(idea ([RS]\d+) of the survey\)/.exec(item.title)?.[1];
      if (named !== undefined && named !== m.id) p.push(`${m.id}: the item ${item.id} holds the idea ${named}, not ${m.id}.`);
    }
    const row2 = m.item === null ? undefined : queue.get(m.item);
    if (!sameFactors(row2 ?? null, m.queue)) p.push(`${m.id}: the queue factors of ${m.item} are ${factorsText(row2 ?? null)}, not ${factorsText(m.queue)}.`);
    if (m.status === "built" && item?.status !== "done") p.push(`${m.id} is built, but its item ${m.item} is not done.`);
    if (m.status === "queued" && row2 === undefined) p.push(`${m.id} is queued, but the queue has no row for ${m.item ?? "an item of it"}.`);
    if (m.status === "not queued" && row2 !== undefined) p.push(`${m.id} is not queued, but the queue has a row for ${m.item}.`);
    if (m.status === "rejected" && m.note === null) p.push(`${m.id} is rejected, but it has no reason.`);
  }
  for (const id of rows.keys()) if (!ids.has(id)) p.push(`${id} is in SURVEY.md, but not in the survey file.`);
  for (const it of items.values()) {
    const named = /\(idea ([RS]\d+) of the survey\)/.exec(it.title)?.[1];
    if (named === undefined) continue;
    const m = input.survey.methods.find((x) => x.id === named);
    if (m === undefined || m.item !== it.id) p.push(`The item ${it.id} holds the idea ${named}, but the survey file does not give ${it.id} as its item.`);
  }
  return p;
}

// ---- The counts and the rule of the next round ----

/** This function counts the methods by a field, with each value of the list, in the order of the list. */
export function countBy<K extends "problemClass" | "status">(methods: readonly SurveyMethod[], key: K, values: readonly SurveyMethod[K][]): [SurveyMethod[K], number][] {
  return values.map((v) => [v, methods.filter((m) => m[key] === v).length]);
}

/** The state of the queue against the rule of the next round */
export interface RoundState {
  /** The count of the rows of the queue */
  queued: number;
  /** The build slots of the rule: builders each day, times the days */
  slots: number;
  /** The value `true` when the queue holds fewer rows than the slots, so the next round of the survey is due */
  due: boolean;
}

/** This function compares the count of the rows of the queue with the build slots of the rule. */
export function roundState(roadmap: Roadmap, rule: RoundRule): RoundState {
  const slots = rule.buildersPerDay * rule.days;
  return { queued: roadmap.queue.size, slots, due: roadmap.queue.size < slots };
}

/** This function gives the methods with a class and a status. The value `all` takes each class or each status. */
export function filterMethods(methods: readonly SurveyMethod[], cls: ProblemClass | "all", status: SurveyStatus | "all"): SurveyMethod[] {
  return methods.filter((m) => (cls === "all" || m.problemClass === cls) && (status === "all" || m.status === status));
}
