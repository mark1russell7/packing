// The declared properties of the inputs of a corpus (roadmap item k62, `docs/BENCH.md`, "The declared properties"). A
// manifest can claim the count of its inputs for each property in `claims.declared`. The load of the corpus checks the claim.
// The check is `checkDeclared` of `@mark1russell7/layout-contract`. This file gives the ids and the hook of packing.

import { checkDeclared, declaredCounts as countsOf, type DeclaredClaim } from "@mark1russell7/layout-contract";
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
  return countsOf(inputs, declares, DECLARED_IDS);
}

/** This function throws an `Error` with each break of a claim of the corpus `name`. A true claim gives nothing. */
export function assertClaim(name: string, claim: DeclaredClaim, inputs: Iterable<PackInput>): void {
  const breaks = checkDeclared(inputs, declares, claim, DECLARED_IDS);
  if (breaks.length > 0) throw new Error(`The claims.declared of the corpus "${name}" is not true: ${breaks.map((b) => b.detail).join("; ")}.`);
}
