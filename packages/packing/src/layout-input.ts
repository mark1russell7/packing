// The input file `layout-input/1` of `docs/FORMAT.md`: its types, its numbers, its canonical form and its hash.

import type { Container, Item, Obstacle, PackInput } from "./contract.ts";
import { sha256Hex, utf8 } from "./sha256.ts";
import type { Cell } from "./strategy.ts";

/** An edge between two boxes. The router reads it, and the packer ignores it. */
export interface Edge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

/** The parameters of a generator: a name and a string or a number for each parameter. */
export type GeneratorParams = Record<string, string | number>;

/** The stamp of a generated input: the generator, its version, the full parameters and the seed. */
export interface GeneratorStamp {
  name: string;
  version: number;
  params: GeneratorParams;
  seed: number;
}

/** One input file `layout-input/1`. `docs/FORMAT.md` gives each field. */
export interface LayoutInput {
  schema: "layout-input/1";
  id: string;
  set: string;
  family: string;
  seed: number;
  /** The origin: `made-up`, `published:<set>` or `known-best:<construction>`. */
  source: string;
  /** The generator of a generated input. A hand-made or published input has `null`. */
  generator: GeneratorStamp | null;
  container: Container;
  obstacles?: Obstacle[];
  gap?: number;
  boxes: Item[];
  edges: Edge[];
  base?: string;
  change?: string;
  step?: number;
  /** The first 16 hex characters of the SHA-256 of the canonical form of the other fields. */
  hash: string;
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

/** This function gives the hash of an input file: the first 16 hex characters of the SHA-256 of its canonical form without `hash`. */
export function hashInput(file: Omit<LayoutInput, "hash"> | LayoutInput): string {
  const rest: Partial<LayoutInput> = { ...file };
  delete rest.hash;
  return sha256Hex(canonicalJson(rest)).slice(0, 16);
}

/** This function gives the scale of a count: the nearest of 1, 10, 100, 1000 and 10000 on a log scale. The count 0 gives `1`. */
export function countCell(count: number): CountScale {
  if (count <= 3) return "1";
  if (count <= 31) return "10";
  if (count <= 316) return "100";
  if (count <= 3162) return "1k";
  return "10k";
}

/** This function gives the packing input of a file. The boxes become the items, and the edges go. */
export function toPackInput(file: Pick<LayoutInput, "container" | "boxes" | "obstacles" | "gap">): PackInput {
  const input: PackInput = { container: file.container, items: file.boxes };
  if (file.obstacles !== undefined) input.obstacles = file.obstacles;
  if (file.gap !== undefined) input.gap = file.gap;
  return input;
}
