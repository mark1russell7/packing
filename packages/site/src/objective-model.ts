// The objectives of the compare page (roadmap item k216). An objective is data: tiers of terms, in the order of their
// priority. This model is a local adapter of the objective spec of layout-contract. It goes when that spec releases.
import { MEASURE_SPECS, type MeasureId } from "@mark1russell7/packing";
import { keepsPartner, type EntryResult } from "./compare-model.ts";

/** The key of a term: a measure, the spacing of `spacingOf`, or the partner of the fill (0 keeps the right strip, 1 gives it up). */
export type ObjectiveKey = MeasureId | "spacing" | "partner";

/** One term of a tier: a key, its weight in the tier, and an optional target value. A term without a target has the direction of its key. */
export interface ObjectiveTerm {
  key: ObjectiveKey;
  weight?: number;
  target?: number;
}

/**
 * One tier of an objective: its terms and its tolerance. Two scores of a tier that are in one band of the tolerance tie,
 * and the next tier decides. A tolerance of 0 compares the exact scores.
 */
export interface ObjectiveTier {
  terms: readonly ObjectiveTerm[];
  tolerance: number;
}

/** An objective: an id, a name, a note for the page and its tiers, the first tier first. */
export interface Objective {
  id: string;
  label: string;
  note: string;
  tiers: readonly ObjectiveTier[];
}

/** The ids of the objectives of the compare page. */
export const OBJECTIVE_IDS = ["densest", "balanced", "spacing"] as const;

/** An id of an objective of the compare page. */
export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

/** The spacing target of the objective `spacing`, in px, when the page gives none. */
export const DEFAULT_SPACING = 8;

/**
 * This function gives an objective of the compare page. The objective `spacing` takes its target from `spacing`, in px.
 * Each objective puts no overflow first.
 */
export function objectiveOf(id: ObjectiveId, spacing = DEFAULT_SPACING): Objective {
  const tier = (tolerance: number, ...terms: ObjectiveTerm[]): ObjectiveTier => ({ terms, tolerance });
  switch (id) {
    case "densest":
      return {
        id,
        label: "Densest",
        note: "No overflow first, then keep the right strip, then the most fill, then the smallest raggedness.",
        tiers: [tier(0, { key: "pack.overflow" }), tier(0, { key: "partner" }), tier(0, { key: "pack.fill" }), tier(0, { key: "pack.raggedness" })],
      };
    case "balanced":
      return {
        id,
        label: "Balanced",
        note: "No overflow first, then a mix: the fill counts two times, and the side skew and the gap spread count one time each.",
        tiers: [tier(0, { key: "pack.overflow" }), tier(0, { key: "pack.fill", weight: 2 }, { key: "pack.balance.sideRange", weight: 1 }, { key: "pack.balance.gapCv", weight: 1 })],
      };
    case "spacing":
      return {
        id,
        label: `Spacing ${spacing} px`,
        note: `No overflow first, then a mean gap near ${spacing} px to the nearest box, then the most fill. Gaps within 5 % of the worst miss tie.`,
        tiers: [tier(0, { key: "pack.overflow" }), tier(0.05, { key: "spacing", target: spacing }), tier(0, { key: "pack.fill" })],
      };
  }
}

/** This function tells if a text is an id of an objective of the compare page. */
export function isObjectiveId(id: string | null): id is ObjectiveId {
  return OBJECTIVE_IDS.some((x) => x === id);
}

/** One result of `rankByObjective`: the result, its rank from 1, and the score of each tier (0 is best, 1 is worst). */
export interface RankedResult {
  result: EntryResult;
  /** The rank from 1. A result without an output has no rank. */
  rank?: number;
  scores: number[];
}

/** This function gives the value of a key of a result. A result without the value gives `undefined`. */
function valueOf(r: EntryResult, key: ObjectiveKey, reference: number | undefined): number | undefined {
  if (key === "partner") return r.measures === undefined ? undefined : keepsPartner(r, reference) ? 0 : 1;
  const v = key === "spacing" ? r.spacing : r.measures?.[key];
  return v !== undefined && Number.isFinite(v) ? v : undefined;
}

/**
 * This function gives the badness of a term at each result, from 0 (best) to 1 (worst). With a target, the badness is the
 * distance to the target over the largest distance. Without a target, it is the distance to the best value over the
 * range of the values. A result without the value has the badness 1.
 */
function badness(results: readonly EntryResult[], term: ObjectiveTerm, reference: number | undefined): number[] {
  const values = results.map((r) => valueOf(r, term.key, reference));
  const known = values.filter((v): v is number => v !== undefined);
  if (term.target !== undefined) {
    const t = term.target;
    const far = Math.max(0, ...known.map((v) => Math.abs(v - t)));
    return values.map((v) => (v === undefined ? 1 : far > 0 ? Math.abs(v - t) / far : 0));
  }
  const higher = term.key !== "partner" && term.key !== "spacing" ? MEASURE_SPECS[term.key].direction === "higher" : term.key === "spacing";
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  return values.map((v) => (v === undefined ? 1 : hi > lo ? (higher ? hi - v : v - lo) / (hi - lo) : 0));
}

/**
 * This function ranks the results by an objective, best first. The tiers compare in their order: the band of the score
 * of a tier, `floor((score - best) / tolerance)`, decides first, and a tie goes to the next tier. A tie of each tier keeps
 * the order of the entries. A result without an output comes last, in the order of the entries, with no rank.
 * The reference is the `partnerReference` of the fill.
 */
export function rankByObjective(results: readonly EntryResult[], objective: Objective, reference?: number): RankedResult[] {
  const packed = results.filter((r) => r.output !== undefined);
  const tierScores = objective.tiers.map((tier) => {
    const total = tier.terms.reduce((a, t) => a + (t.weight ?? 1), 0);
    const parts = tier.terms.map((t) => badness(packed, t, reference).map((b) => (b * (t.weight ?? 1)) / (total > 0 ? total : 1)));
    return packed.map((_, i) => parts.reduce((a, p) => a + p[i]!, 0));
  });
  const bands = objective.tiers.map((tier, k) => {
    const best = Math.min(...tierScores[k]!);
    return tierScores[k]!.map((s) => (tier.tolerance > 0 ? Math.floor((s - best) / tier.tolerance + 1e-9) : s));
  });
  const order = packed
    .map((result, i) => ({ result, i }))
    .toSorted((a, b) => {
      for (const band of bands) {
        const d = band[a.i]! - band[b.i]!;
        if (d !== 0) return d;
      }
      return a.result.index - b.result.index;
    });
  const ranked = order.map(({ result, i }, n) => ({ result, rank: n + 1, scores: tierScores.map((s) => s[i]!) }));
  const failed = results.filter((r) => r.output === undefined).toSorted((a, b) => a.index - b.index);
  return [...ranked, ...failed.map((result) => ({ result, scores: [] }))];
}
