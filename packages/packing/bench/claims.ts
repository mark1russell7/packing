// The declared properties of the inputs of a corpus (roadmap item k62, `docs/BENCH.md`, "The declared properties"). A
// manifest can claim the count of its inputs for each property in `claims.declared`. The load of the corpus checks the claim.

import { cellOf, type PackInput } from "@mark1russell7/packing";

/**
 * The ids of the declared properties, in order. `docs/PROMOTION.md`, "The parts of packing", gives each one.
 *
 * - `order`: an item has a rank, so the cell `order` is `soft`. The input format has no `hard` order.
 * - `aspect`: the container has `aspect`.
 * - `free-size`: the cell `containerSize` is not `fixed`.
 * - `shaped`: the container has a shape that is not a rectangle.
 */
export const DECLARED_IDS: readonly string[] = Object.freeze(["order", "aspect", "free-size", "shaped"]);

/** The claim of a manifest: the count of the inputs for each declared property. */
export interface DeclaredClaim {
  /** The count of inputs below which a property is thin */
  minCount: number;
  /** The ids of the properties with a count below `minCount` */
  thin: string[];
  /** The count of inputs for each id of `DECLARED_IDS` */
  counts: Record<string, number>;
}

/** This function gives the ids of the properties that one input declares, in the order of `DECLARED_IDS`. */
export function declares(input: PackInput): readonly string[] {
  const out: string[] = [];
  const cell = cellOf(input);
  if (cell.order !== "free") out.push("order");
  if (input.container.aspect !== undefined) out.push("aspect");
  if (cell.containerSize !== "fixed") out.push("free-size");
  if (input.container.shape !== undefined && input.container.shape.kind !== "rect") out.push("shaped");
  return out;
}

/** This function gives the count of the inputs for each id of `DECLARED_IDS`. An id with no input has the count 0. */
export function declaredCounts(inputs: Iterable<PackInput>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(DECLARED_IDS.map((id) => [id, 0]));
  for (const input of inputs) for (const id of declares(input)) out[id]!++;
  return out;
}

/** This function tells if a value is a plain object. */
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * This function reads the field `claims.declared` of a manifest. A manifest without it gives `undefined`. It throws an
 * `Error` for a claim without a whole `minCount`, a list `thin` of ids and a whole count for each id.
 */
export function parseClaim(manifest: Record<string, unknown>): DeclaredClaim | undefined {
  const claims = manifest["claims"];
  if (claims === undefined) return undefined;
  if (!isObject(claims)) throw new Error("The field claims of a corpus file is an object.");
  const declared = claims["declared"];
  if (declared === undefined) return undefined;
  if (!isObject(declared)) throw new Error("The field claims.declared of a corpus file is an object.");
  const { minCount, thin, counts } = declared;
  if (!Number.isInteger(minCount) || (minCount as number) < 0) throw new Error("The field claims.declared.minCount is a whole number of 0 or more.");
  if (!Array.isArray(thin) || !thin.every((id) => typeof id === "string")) throw new Error("The field claims.declared.thin is a list of property ids.");
  if (!isObject(counts) || !Object.values(counts).every((n) => Number.isInteger(n) && (n as number) >= 0)) {
    throw new Error("The field claims.declared.counts gives a whole count for each property id.");
  }
  return { minCount: minCount as number, thin: [...(thin as string[])], counts: { ...(counts as Record<string, number>) } };
}

/**
 * This function checks a claim against the counts of the generated inputs. It gives the list of the problems: empty
 * when the claim is true.
 *
 * - Each id of `DECLARED_IDS` is in `counts`, and `counts` has no other id.
 * - Each count of `counts` is the computed count.
 * - An id with a count below `minCount` is in `thin`. Each id of `thin` is an id of `DECLARED_IDS`.
 */
export function claimProblems(claim: DeclaredClaim, computed: Readonly<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const id of DECLARED_IDS) {
    if (!(id in claim.counts)) out.push(`the property "${id}" has no count`);
    else if (claim.counts[id] !== computed[id]) out.push(`the property "${id}" has the count ${claim.counts[id]}, but the inputs give ${computed[id]}`);
  }
  for (const id of Object.keys(claim.counts)) if (!DECLARED_IDS.includes(id)) out.push(`"${id}" is not a declared property`);
  for (const id of DECLARED_IDS) {
    const thin = (computed[id] ?? 0) < claim.minCount;
    if (thin && !claim.thin.includes(id)) out.push(`the property "${id}" has ${computed[id]} inputs, below minCount ${claim.minCount}, and it is not in thin`);
  }
  for (const id of claim.thin) if (!DECLARED_IDS.includes(id)) out.push(`"${id}" of thin is not a declared property`);
  return out;
}

/** This function throws an `Error` with each problem of a claim of the corpus `name`. A true claim gives nothing. */
export function assertClaim(name: string, claim: DeclaredClaim, computed: Readonly<Record<string, number>>): void {
  const problems = claimProblems(claim, computed);
  if (problems.length > 0) throw new Error(`The claims.declared of the corpus "${name}" is not true: ${problems.join("; ")}.`);
}
