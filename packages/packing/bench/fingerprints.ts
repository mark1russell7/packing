// The output fingerprints of roadmap item k201: one hash of the outputs of each strategy on a fixed set of probe inputs.
// The probes come from each input family of the corpora, at three counts of items and at each container mode of the family,
// and from the made-up inputs of circles and polygons. A changed output of a strategy on a probe changes its fingerprint.
// Thus a joint bench starts again only the strategies whose fingerprint changed.
// With --write, the script writes the table src/strategy-fingerprint.ts. With --check, it reads again and fails when a row differs.
// The script does not read the clock, so the same commit and the same Node version give the same table.

import fs from "node:fs";
import path from "node:path";
import { createFamilyRegistry, fingerprintOf, packOutputForm, probeHash, RECT_SCATTERED, REFUSED_PROBE, type CorpusFamily, type LayoutInput } from "@mark1russell7/layout-contract";
import { allStrategies, corpusFamilies, createContext, strategy, toPackInput, UnsupportedCell, type PackInput, type PackOutput } from "@mark1russell7/packing";
import { FINGERPRINT_SOURCE, FINGERPRINT_VERSION, STRATEGY_FINGERPRINT } from "../src/strategy-fingerprint.ts";
import { circleInput } from "./circles.ts";
import { ENTRIES } from "./entries.ts";
import { shapeInput, type ShapeFamily } from "./shape-inputs.ts";

/** The counts of items of the probes: the size bands. A family takes each count in its range, else the nearest end of its range. */
export const PROBE_COUNTS: readonly number[] = [5, 20, 50];

/** The count of items of a probe at a container mode other than the default of its family. */
export const PROBE_MODE_COUNT = 20;

/** The kinds of the made-up shape inputs of the probes, at the counts 5 and 20, with a fixed width and with a fixed size. */
export const PROBE_SHAPES: readonly ShapeFamily[] = ["circle", "polygon", "mixed"];

/** The counts of the made-up shape inputs and of the circles in a circle. */
export const PROBE_SHAPE_COUNTS: readonly number[] = [5, 20];

/** The seed of the input of each probe, and of each pack. */
export const PROBE_SEED = 1;

/** The families of the probes: each corpus family of the package, and the shared family `rect-scattered` of `layout-contract`. */
export const PROBE_FAMILIES: readonly CorpusFamily<LayoutInput>[] = [RECT_SCATTERED, ...corpusFamilies];

/** The options of a strategy with no default member. The other strategies pack with their defaults. */
const PROBE_OPTION_ENTRY: Readonly<Record<string, string>> = { "aspect-fit": "aspect-fit-maxrects-bl", compact: "compact-maxrects-bl" };

/** One probe: an input of one family at one count. */
export interface Probe {
  /** The id: `<family>@<version>/<count>`, or `<family>@<version>` for a family with no count. */
  readonly id: string;
  readonly family: string;
  readonly input: PackInput;
}

/** This function gives the counts of the probes of a family, in its range of the dimension `count`. A family with no count gets `undefined`. */
export function familyCounts(family: CorpusFamily<LayoutInput>): readonly (number | undefined)[] {
  const dim = family.dimensions.find((d) => d.name === "count");
  if (dim === undefined) return [undefined];
  const min = typeof dim.min === "number" ? dim.min : 1;
  const max = typeof dim.max === "number" ? dim.max : Infinity;
  return [...new Set(PROBE_COUNTS.map((count) => Math.min(max, Math.max(min, count))))];
}

/** This function gives the container modes of a family other than its default: the supported values of its dimension `containerSize`. */
export function familyModes(family: CorpusFamily<LayoutInput>): readonly string[] {
  const dim = family.dimensions.find((d) => d.name === "containerSize");
  if (dim === undefined) return [];
  const supported = Array.isArray(dim.supported) ? (dim.supported as readonly unknown[]) : undefined;
  return (dim.values ?? []).map(String).filter((value) => value !== String(dim.default) && (supported === undefined || supported.includes(value)));
}

/**
 * This function gives each probe of the families, in the order of the families. A family gives a probe at each count of `familyCounts`,
 * then a probe at each mode of `familyModes` with `PROBE_MODE_COUNT` items. Each other dimension keeps its default.
 */
export function familyProbes(families: readonly CorpusFamily<LayoutInput>[] = PROBE_FAMILIES): Probe[] {
  const registry = createFamilyRegistry<LayoutInput>(families);
  const list: Probe[] = [];
  for (const family of registry.families()) {
    const base = `${family.name}@${family.version}`;
    const add = (id: string, dims: Readonly<Record<string, string | number>>): void => {
      list.push({ id, family: family.name, input: toPackInput(registry.generate(family.name, PROBE_SEED, dims, { version: family.version })) });
    };
    const counts = familyCounts(family);
    for (const count of counts) add(count === undefined ? base : `${base}/${count}`, count === undefined ? {} : { count });
    const modeCount = counts.includes(undefined) ? undefined : (counts.find((c) => c !== undefined && c >= PROBE_MODE_COUNT) ?? counts[counts.length - 1]);
    for (const mode of familyModes(family)) add(modeCount === undefined ? `${base}/${mode}` : `${base}/${mode}/${modeCount}`, modeCount === undefined ? { containerSize: mode } : { containerSize: mode, count: modeCount });
  }
  return list;
}

/** This function gives the probes of the made-up shapes: circles, polygons and both, then equal circles in a circle. */
export function shapeProbes(): Probe[] {
  const list: Probe[] = [];
  for (const kind of PROBE_SHAPES) {
    for (const count of PROBE_SHAPE_COUNTS) {
      for (const fixedSize of [false, true]) {
        const input = toPackInput(shapeInput(kind, PROBE_SEED, { count, fixedSize }));
        list.push({ id: `shapes-k91/${kind}/${count}/${fixedSize ? "fixed" : "freeHeight"}`, family: "shapes-k91", input });
      }
    }
  }
  for (const count of PROBE_SHAPE_COUNTS) list.push({ id: `circles/equal/${count}`, family: "circles", input: circleInput("equal", count) });
  return list;
}

/** This function gives each probe: the probes of the families, then the probes of the made-up shapes. */
export function probes(families: readonly CorpusFamily<LayoutInput>[] = PROBE_FAMILIES): Probe[] {
  return [...familyProbes(families), ...shapeProbes()];
}

/** This function gives the input with the first item one unit wider: the change of the second pack of an incremental strategy. */
export function widerFirst(input: PackInput): PackInput {
  const [first, ...rest] = input.items;
  if (first === undefined) return input;
  return { ...input, items: [{ ...first, w: first.w + 1 }, ...rest] };
}

/** The function that packs one probe with one strategy. The tests give a function with a fault. */
export type ProbePack = (strategy: string, input: PackInput, seed: number) => PackOutput;

/** This function gives the probe options of a strategy: the options of its entry in `PROBE_OPTION_ENTRY`, else `undefined` for the defaults. */
export function probeOptions(strategy: string): unknown {
  const id = PROBE_OPTION_ENTRY[strategy];
  if (id === undefined) return undefined;
  const entry = ENTRIES.find((e) => e.id === id);
  if (entry === undefined) throw new RangeError(`The bench has no entry "${id}" for the probes of "${strategy}".`);
  return entry.options;
}

/**
 * This function packs one probe. A strategy of the mode `incremental` packs the probe, then packs `widerFirst` of the probe with
 * that output as `previous`, as in the corpus `pack-change-v1`. The hash reads the second output.
 */
export const packProbe: ProbePack = (id, input, seed) => {
  const s = strategy(id);
  const options: unknown = { ...(s.defaults as object), ...(probeOptions(id) as object | undefined) };
  const base = s.pack(input, options, createContext(seed));
  if (!s.supports.mode.includes("incremental")) return base;
  return s.pack(widerFirst(input), options, createContext(seed, { previous: base }));
};

/** This function tells if an error is a refusal of a probe: `UnsupportedCell`. Each other error is a fault of the packer. */
export const isRefusal = (error: unknown): boolean => error instanceof UnsupportedCell;

/** The read of one strategy: the hash of each probe and the fingerprint. */
export interface StrategyRead {
  readonly strategy: string;
  readonly hashes: Readonly<Record<string, string>>;
  /** The count of the probes that the strategy refused. */
  readonly refused: number;
  readonly fingerprint: string;
}

/** This function reads one strategy over the probes. An error that is not a refusal stops the read, with the id of the probe. */
export function readStrategy(strategy: string, list: readonly Probe[], pack: ProbePack = packProbe): StrategyRead {
  const hashes: Record<string, string> = {};
  let refused = 0;
  for (const probe of list) {
    let hash: string;
    try {
      hash = probeHash(() => packOutputForm(pack(strategy, probe.input, PROBE_SEED)), isRefusal);
    } catch (error) {
      throw new Error(`${strategy} on the probe ${probe.id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (hash === REFUSED_PROBE) refused += 1;
    hashes[probe.id] = hash;
  }
  return { strategy, hashes, refused, fingerprint: fingerprintOf(hashes) };
}

/** The text of the source of the probes, for the table. */
export const probeSource = (list: readonly Probe[]): string =>
  `${PROBE_FAMILIES.length} input families at the counts ${PROBE_COUNTS.join(", ")} and at each container mode, ${PROBE_SHAPES.length} made-up shape kinds and circles in a circle, seed ${PROBE_SEED}: ${list.length} probes`;

/** This function gives the text of the file `src/strategy-fingerprint.ts`. The strategies are in the order of their ids. */
export function tableText(reads: readonly StrategyRead[], source: string, version: string): string {
  const rows = [...reads].sort((a, b) => (a.strategy < b.strategy ? -1 : a.strategy > b.strategy ? 1 : 0)).map((r) => `  ${JSON.stringify(r.strategy)}: ${JSON.stringify(r.fingerprint)},\n`);
  return `// This file is generated. Do not edit it. \`bench/fingerprints.ts --write\` writes it, and the check of the same script compares it.
// Each value is \`fingerprintOf\` of \`layout-contract\` over the probe hashes of one strategy, with its default options.

/** The probes of the table. */
export const FINGERPRINT_SOURCE = ${JSON.stringify(source)};

/** The version of the package at the read of the table. */
export const FINGERPRINT_VERSION = ${JSON.stringify(version)};

/** The fingerprint of the outputs of each strategy on the probes. */
export const STRATEGY_FINGERPRINT: Readonly<Record<string, string>> = {
${rows.join("")}};
`;
}

/** This function compares the table with some reads. Each finding names a strategy. With `all`, a strategy of the table with no read is a finding. */
export function compareReads(stated: Readonly<Record<string, string>>, reads: readonly StrategyRead[], all = true): string[] {
  const findings: string[] = [];
  const read = new Set<string>();
  for (const r of reads) {
    read.add(r.strategy);
    const was = stated[r.strategy];
    if (was === undefined) findings.push(`${r.strategy}: the table has no fingerprint. The read gives ${r.fingerprint}.`);
    else if (was !== r.fingerprint) findings.push(`${r.strategy}: the fingerprint changed from ${was} to ${r.fingerprint}.`);
  }
  if (all) for (const strategy of Object.keys(stated)) if (!read.has(strategy)) findings.push(`${strategy}: the table has a fingerprint, and the engine has no strategy.`);
  return findings;
}

/** This function gives a finding for each strategy that refuses each probe: its fingerprint does not change on a change of its output. */
export function blindFindings(reads: readonly StrategyRead[], probeCount: number): string[] {
  return reads.filter((r) => r.refused === probeCount).map((r) => `${r.strategy}: the strategy refuses each of the ${probeCount} probes, so its fingerprint does not show a change of its output.`);
}

/** This function starts the script and gives its exit code. */
function main(args: readonly string[]): number {
  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const only = option("--strategies")?.split(",");
  const list = probes();
  const reads = allStrategies.map((s) => s.id).filter((id) => only === undefined || only.includes(id)).map((id) => readStrategy(id, list));
  const source = probeSource(list);
  const write = args.includes("--write");
  const version = write ? (JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version : FINGERPRINT_VERSION;
  const text = tableText(reads, source, version);
  const out = option("--out");
  if (out !== undefined) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "strategy-fingerprint.ts"), text);
    fs.writeFileSync(path.join(out, "probe-hashes.json"), `${JSON.stringify(Object.fromEntries(reads.map((r) => [r.strategy, r.hashes])), null, 2)}\n`);
  }
  const blind = blindFindings(reads, list.length);
  if (write) {
    if (only !== undefined) throw new RangeError("The option --write needs all strategies.");
    if (blind.length > 0) throw new RangeError(blind.join(" "));
    fs.writeFileSync(new URL("../src/strategy-fingerprint.ts", import.meta.url), text);
    return 0;
  }
  const findings = [...compareReads(STRATEGY_FINGERPRINT, reads, only === undefined), ...blind];
  if (source !== FINGERPRINT_SOURCE) findings.push(`The probes changed from "${FINGERPRINT_SOURCE}" to "${source}".`);
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  const refused = reads.reduce((sum, r) => sum + r.refused, 0);
  process.stdout.write(`${findings.length} findings over ${reads.length} strategies and ${list.length} probes, ${refused} refused probes.\n`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("fingerprints.ts") === true) process.exitCode = main(process.argv.slice(2));
