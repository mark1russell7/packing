// The input file `layout-input/1` of `docs/FORMAT.md`: its types, its numbers, its canonical form and its hash.

import { canonicalInput, type LayoutContainer, type LayoutEdge, type LayoutGenerator, type LayoutInput } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";
import { sha256Hex, utf8 } from "./sha256.ts";
import type { Cell } from "./strategy.ts";

export type { LayoutEdge, LayoutInput } from "@mark1russell7/layout-contract";

/** The parameters of a generator: a name and a string or a number for each parameter. */
export type GeneratorParams = Record<string, string | number>;

/**
 * The stamp of a generated input: the generator, its version, the full parameters and the seed.
 * It is `LayoutGenerator` of the contract with a string or a number for each parameter.
 */
export interface GeneratorStamp extends LayoutGenerator {
  readonly params: Readonly<GeneratorParams>;
}

/**
 * A generated input file `layout-input/1`. It is a `LayoutInput` with each field that a generator writes.
 * `docs/FORMAT.md` gives each field.
 */
export interface GeneratedInput extends LayoutInput {
  readonly set: string;
  readonly family: string;
  readonly seed: number;
  /** The origin: `made-up`, `published:<set>` or `known-best:<construction>`. */
  readonly source: string;
  /** The generator of a generated input. A hand-made or published input has `null`. */
  readonly generator: GeneratorStamp | null;
  readonly container: LayoutContainer;
  readonly edges: readonly LayoutEdge[];
  /** The first 16 hex characters of the SHA-256 of the canonical form of the other fields. */
  readonly hash: string;
  /** The known best value of an input of `known-best:<construction>`. The other inputs do not have this field. */
  readonly known?: KnownBest;
}

/**
 * The known best value of an input (roadmap item k45). The measure `pack.gapToOpt` compares a layout with it.
 *
 * - With `kind` set to `optimum`, a layout reaches the value. With `bound`, no layout is better, but the best layout can be worse.
 * - `area` is the best area of the hull. For a fixed container, it is the area of the container.
 * - `height` is the best height for the fixed width of a container with a free height.
 */
export interface KnownBest {
  readonly kind: "optimum" | "bound";
  readonly area: number;
  readonly height?: number;
  /** The source of the value: the construction of the generator, or a source of `docs/research/CATALOG.md`. */
  readonly source: string;
}

/** The layout of the obstacles (`docs/research/TAXONOMY.md`, dimension 3). */
export type ObstacleLayout = "none" | "center" | "scattered" | "wall" | "corridors" | "touching" | "edge";

/** The distribution of the sizes of the items (`docs/research/TAXONOMY.md`, dimension 6). */
export type SizeDistribution = "identical" | "nearIdentical" | "uniform" | "heavyTail" | "bimodal" | "extremeAspect";

/** The scale of the count of the items (`docs/research/TAXONOMY.md`, dimension 7). */
export type CountScale = "1" | "10" | "100" | "1k" | "10k";

/**
 * The cell of a generated input: one value for each dimension of the packer. The cell of `cellOf` has the dimensions
 * that the input tells. The generator adds the layout of the obstacles, the sizes, the count and the mode.
 */
export interface CorpusCell extends Cell {
  obstacles: ObstacleLayout;
  sizes: SizeDistribution;
  count: CountScale;
  mode: "offline" | "online" | "incremental";
}

/** This function gives the `fnv1a32` hash of the UTF-8 bytes of a string, as `docs/FORMAT.md` gives it. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of utf8(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

/** This function rounds the numbers of a file to 3 decimals. A half goes up, and the value `-0` becomes 0. */
export function round3(x: number): number {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
}

/**
 * This function gives the canonical form of a value: sorted keys, no whitespace and the numbers of `JSON.stringify`
 * after `round3`. A key with the value `undefined` is not in the form.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(typeof value === "number" ? round3(value) : value);
}

/**
 * This function gives the hash of an input file: the first 16 hex characters of the SHA-256 of its canonical form without `hash`.
 * The file goes through `canonicalInput` of the contract first. Thus the order of `pairGaps` does not change the hash.
 * A file without `pairGaps` keeps its hash. The value is equal to `documentHash` of the contract.
 */
export function hashInput(file: LayoutInput): string {
  const { hash: _hash, ...rest } = canonicalInput(file);
  return sha256Hex(canonicalJson(rest)).slice(0, 16);
}

/**
 * This function gives the `outputHash` of an output. It is the first 16 hex characters of the SHA-256 of the canonical form of
 * its placements, sorted by id. The canonical form rounds each number with `round3`. Thus the order of the list does not count.
 * The records of the benchmark and the key of `packPortfolio` use it. It is not `outputHash` of the contract, which uses a grid.
 */
export function outputHash(output: Pick<PackOutput, "placements">): string {
  const sorted = output.placements.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256Hex(canonicalJson(sorted)).slice(0, 16);
}

/** This function gives the scale of a count: the nearest of 1, 10, 100, 1000 and 10000 on a log scale. The count 0 gives `1`. */
export function countCell(count: number): CountScale {
  if (count <= 3) return "1";
  if (count <= 31) return "10";
  if (count <= 316) return "100";
  if (count <= 3162) return "1k";
  return "10k";
}

/**
 * This function gives the packing input of a file. The boxes become the items, and the edges go.
 * A file without a container gets `{ fixed: "none" }`, so the packer picks the size. It is `toPackInput` of the contract.
 */
export function toPackInput(file: Pick<LayoutInput, "container" | "boxes" | "obstacles" | "gap" | "pairGaps">): PackInput {
  return {
    container: file.container ?? { fixed: "none" },
    items: file.boxes,
    ...(file.obstacles === undefined ? {} : { obstacles: file.obstacles }),
    ...(file.gap === undefined ? {} : { gap: file.gap }),
    ...(file.pairGaps === undefined ? {} : { pairGaps: file.pairGaps }),
  };
}
