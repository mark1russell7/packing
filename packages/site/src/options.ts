// The strategies of the demo and the controls of their options. The lists come from the registry and from the entries of
// the benchmark. The sync test `sync.test.ts` fails when a list on a page differs from them.

import { composites, MAXRECTS_RULES, RESTART_PERTURBS, SHELF_FITS, SORT_ORDERS, strategies, strategy, type Strategy } from "@mark1russell7/packing";
import { ENTRIES, isComposite, type BenchEntry } from "@mark1russell7/packing/bench/entries";

/** This constant lists each strategy of the registry: the single strategies, then the composite strategies. */
export const DEMO_STRATEGIES: readonly Strategy[] = [...strategies, ...composites];

/** This constant lists the id of each strategy of the demo. */
export const DEMO_IDS: readonly string[] = DEMO_STRATEGIES.map((s) => s.id);

/** This function tells if an id is a strategy of the registry. */
export const isDemoId = (id: string | undefined): id is string => id !== undefined && DEMO_IDS.includes(id);

/** This function tells if a strategy is a composite strategy of the registry. */
export const isCompositeId = (id: string): boolean => composites.some((s) => s.id === id);

/** The known values of each option with a string value, by the name of the option. */
export const KNOWN_SETS: Readonly<Record<string, readonly string[]>> = {
  sortOrder: SORT_ORDERS,
  rule: MAXRECTS_RULES,
  fit: SHELF_FITS,
  perturb: RESTART_PERTURBS,
};

/** The limits of each option with a number value, by the name of the option. */
export const NUMBER_LIMITS: Readonly<Record<string, { min: number; max: number; step: number }>> = {
  samples: { min: 4, max: 200, step: 1 },
  maxShovesPerItem: { min: 0, max: 64, step: 1 },
  targetAspect: { min: 0.1, max: 10, step: 0.01 },
  iterations: { min: 1, max: 256, step: 1 },
  strength: { min: 0, max: 1, step: 0.01 },
  budgetMs: { min: 0, max: 2000, step: 1 },
};

/** The entries that a composite strategy can take as a member: the entries that are not composite entries. */
export const MEMBER_ENTRIES: readonly BenchEntry[] = ENTRIES.filter((e) => !isComposite(e.id));

/**
 * The control of one option.
 *
 * - `number`: a number input. `value` is `undefined` when the option has no default.
 * - `select`: a list of values. With `none`, the first choice is the label `none` and gives no value.
 * - `flag`: a checkbox.
 * - `entry`: one named entry of `ENTRIES`. `members`: a set of named entries.
 */
export type OptionControl =
  | { key: string; kind: "number"; value: number | undefined; min: number; max: number; step: number; fromDefaults: boolean }
  | { key: string; kind: "select"; values: readonly string[]; value: string; none?: string; fromDefaults: boolean }
  | { key: string; kind: "flag"; value: boolean; fromDefaults: boolean }
  | { key: string; kind: "entry"; values: readonly string[]; value: string; fromDefaults: false }
  | { key: string; kind: "members"; values: readonly string[]; value: readonly string[]; count?: number; fromDefaults: false };

/** This function gives the control of one option of the defaults of a strategy, from the type of its default value. */
export function defaultControl(key: string, value: unknown): OptionControl {
  if (typeof value === "boolean") return { key, kind: "flag", value, fromDefaults: true };
  if (typeof value === "number") return { key, kind: "number", value, ...(NUMBER_LIMITS[key] ?? { min: 0, max: 1000, step: 1 }), fromDefaults: true };
  if (typeof value === "string") {
    const values = KNOWN_SETS[key];
    if (values === undefined || !values.includes(value)) throw new RangeError(`The demo has no list of values for the option "${key}".`);
    return { key, kind: "select", values, value, fromDefaults: true };
  }
  throw new RangeError(`The demo has no control for the option "${key}".`);
}

/**
 * The controls of the options that are not in the defaults of a strategy. The strategy reads them, but they have no
 * default value. A member of a composite strategy is a named entry.
 */
function extraControls(id: string): OptionControl[] {
  const members = MEMBER_ENTRIES.map((e) => e.id);
  switch (id) {
    case "shelf":
      return [{ key: "fit", kind: "select", values: SHELF_FITS, value: "", none: "none (0.2.3)", fromDefaults: false }];
    case "portfolio":
      return [
        { key: "k", kind: "select", values: ["2", "3"], value: "", none: "cell", fromDefaults: false },
        { key: "members", kind: "members", values: members, value: [], fromDefaults: false },
      ];
    case "aspect-fit":
      return [
        { key: "strategy", kind: "entry", values: ENTRIES.filter((e) => e.strategy !== "aspect-fit").map((e) => e.id), value: "maxrects-bl", fromDefaults: false },
        { key: "targetAspect", kind: "number", value: undefined, ...NUMBER_LIMITS["targetAspect"]!, fromDefaults: false },
      ];
    case "select":
      return [{ key: "members", kind: "members", values: members, value: ["rows", "maxrects-bl"], count: 2, fromDefaults: false }];
    case "restarts":
      return [
        { key: "member", kind: "entry", values: members, value: "maxrects-bl", fromDefaults: false },
        { key: "budgetMs", kind: "number", value: undefined, ...NUMBER_LIMITS["budgetMs"]!, fromDefaults: false },
      ];
    case "bbox":
      return [{ key: "member", kind: "entry", values: members, value: "maxrects-bl", fromDefaults: false }];
    default:
      return [];
  }
}

/** This function gives the control of each option of a strategy: each option of its defaults, then the other options. */
export function optionControls(id: string): OptionControl[] {
  const defaults = strategy(id).defaults as Record<string, unknown>;
  return [...Object.entries(defaults).map(([key, value]) => defaultControl(key, value)), ...extraControls(id)];
}

/** The value of each control of a strategy, as the page keeps it: a string, a number, a flag or a list of entry ids. */
export type OptionValues = Record<string, string | number | boolean | readonly string[] | undefined>;

/** This function gives the start values of the controls of a strategy. */
export function startValues(id: string): OptionValues {
  return Object.fromEntries(optionControls(id).map((c) => [c.key, c.value]));
}

/** This function gives the entry of an id of `ENTRIES`, as a member of a composite strategy. */
const memberOf = (id: string): { id: string; strategy: string; options: Readonly<Record<string, unknown>> } => {
  const e = ENTRIES.find((x) => x.id === id);
  if (e === undefined) throw new RangeError(`"${id}" is not a named entry.`);
  return { id: e.id, strategy: e.strategy, options: e.options };
};

/**
 * This function gives the options of `packWith` from the values of the controls. An empty value gives no option. A
 * portfolio with members takes no `k`. The strategy of `aspect-fit` is a named entry with its options.
 * The member of `restarts` and `bbox` is a named entry.
 */
export function packOptions(id: string, values: OptionValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of optionControls(id)) {
    const v = values[c.key] ?? c.value;
    if (v === undefined || v === "") continue;
    if (c.kind === "number") out[c.key] = Number(v);
    else if (c.kind === "flag") out[c.key] = v === true;
    else if (c.kind === "select") out[c.key] = c.key === "k" ? Number(v) : v;
    else if (c.kind === "entry") {
      const m = memberOf(String(v));
      if (c.key === "member") out["member"] = m;
      else {
        out["strategy"] = m.strategy;
        out["options"] = m.options;
      }
    } else if (Array.isArray(v) && v.length > 0) out[c.key] = v.map(memberOf);
  }
  if (out["members"] !== undefined) delete out["k"];
  return out;
}
