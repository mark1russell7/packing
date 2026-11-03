/**
 * The size gate (k132): the gzip bytes of a small consumer of each published entry, against a budget.
 *
 * This module has no packing logic. The caller gives the entries, the published exports and a bundler.
 * Thus the module can move to the planned home of gates (rigor-gates) as it is.
 * A bundle is deterministic for one bundler version, so one measure is the record. No repeat runs are necessary.
 */
import { gzipSync } from "node:zlib";

/** The schema of a size gate record. */
export const SIZE_GATE_SCHEMA = "size-gate/1";

/** The default headroom of a budget over the measured gzip bytes. */
export const SIZE_HEADROOM = 0.05;

/** The default step of a budget, in bytes. A budget is a whole number of steps. */
export const SIZE_STEP = 1024;

/** One entry of the gate: a consumer imports `import` from `specifier`, and the bundler starts at `file`. */
export interface SizeEntry {
  /** The import specifier of a consumer, for example `pkg/sub` */
  specifier: string;
  /** The published file of the specifier, relative to the package folder */
  file: string;
  /** The one name that the consumer imports */
  import: string;
  /** The gzip bytes of the last derivation */
  measured: number;
  /** The most gzip bytes that the gate permits */
  budget: number;
}

/** The record of a size gate. */
export interface SizeGate {
  schema: typeof SIZE_GATE_SCHEMA;
  /** The rule of the budgets, as text */
  rule: string;
  /** The bundler and its settings, as text */
  bundler: string;
  /** The commit of the last derivation */
  commit: string;
  entries: SizeEntry[];
}

/** The measure of one entry. */
export interface SizeMeasure {
  specifier: string;
  raw: number;
  gzip: number;
}

/** The outcome of one entry. */
export interface SizeRow extends SizeMeasure {
  budget: number;
  /** The gzip bytes over the measured bytes of the record, minus 1 */
  change: number;
  /** The value `below` is a size more than the headroom under the measured bytes of the record. Then the budget must go down. */
  outcome: "within" | "above" | "below";
}

/** The result of a size gate. */
export interface SizeResult {
  schema: "size-gate-result/1";
  verdict: "pass" | "fail";
  rows: SizeRow[];
  reasons: string[];
}

/** A bundler gives the minified code of a consumer that imports `name` from `file`. */
export type SizeBundler = (file: string, name: string) => Promise<Uint8Array>;

/** This function gives the budget of a measure: the gzip bytes plus the headroom, rounded up to a whole step. */
export function sizeBudget(gzip: number, headroom: number = SIZE_HEADROOM, step: number = SIZE_STEP): number {
  return Math.ceil((gzip * (1 + headroom)) / step) * step;
}

/** This function reads a size gate record, and throws on a field of the wrong type. */
export function parseSizeGate(text: string): SizeGate {
  const g = JSON.parse(text) as SizeGate;
  if (g.schema !== SIZE_GATE_SCHEMA) throw new Error(`A size gate needs the schema ${SIZE_GATE_SCHEMA}, not ${String(g.schema)}.`);
  if (!Array.isArray(g.entries) || g.entries.length === 0) throw new Error("A size gate needs one entry or more.");
  for (const e of g.entries) {
    for (const k of ["specifier", "file", "import"] as const) if (typeof e[k] !== "string" || e[k] === "") throw new Error(`The entry ${JSON.stringify(e)} needs the text field ${k}.`);
    for (const k of ["measured", "budget"] as const) if (!Number.isInteger(e[k]) || e[k] <= 0) throw new Error(`The entry ${e.specifier} needs a whole number of bytes in ${k}.`);
  }
  return g;
}

/** The fields of a `package.json` that `publishedExports` reads. */
export interface PublishedPackage {
  name: string;
  exports?: Record<string, string | { default: string }>;
  publishConfig?: { exports?: Record<string, string | { default: string }> };
}

/**
 * This function gives the code exports of a package as it is published: specifier to file, relative to the package folder.
 * It reads `publishConfig.exports` when it is present, and `exports` when not. The export `./package.json` is not code.
 */
export function publishedExports(pkg: PublishedPackage): Record<string, string> {
  const map = pkg.publishConfig?.exports ?? pkg.exports ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key === "./package.json") continue;
    const target = typeof value === "string" ? value : value.default;
    out[key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`] = target.replace(/^\.\//, "");
  }
  return out;
}

/**
 * This function compares the entries with the published exports (specifier to file).
 * Each export needs one entry with the same file, and each entry needs an export. A gap is a reason, so the gate fails closed.
 */
export function sizeCoverage(entries: readonly SizeEntry[], exports: Readonly<Record<string, string>>): string[] {
  const reasons: string[] = [];
  for (const [specifier, file] of Object.entries(exports)) {
    const e = entries.find((x) => x.specifier === specifier);
    if (e === undefined) reasons.push(`The export ${specifier} has no entry in the size gate.`);
    else if (e.file !== file) reasons.push(`The entry ${specifier} names the file ${e.file}, but the export is ${file}.`);
  }
  for (const e of entries) if (!(e.specifier in exports)) reasons.push(`The entry ${e.specifier} is not a published export.`);
  return reasons;
}

/** This function bundles each entry and gives its raw and gzip bytes (gzip level 9). */
export async function measureSizes(entries: readonly SizeEntry[], bundle: SizeBundler): Promise<SizeMeasure[]> {
  const out: SizeMeasure[] = [];
  for (const e of entries) {
    const code = await bundle(e.file, e.import);
    out.push({ specifier: e.specifier, raw: code.length, gzip: gzipSync(code, { level: 9 }).length });
  }
  return out;
}

/**
 * This function applies the budgets. The verdict is `fail` when an entry is above its budget, or when a reason is present.
 * An entry more than `drop` under its measured bytes also fails. Then the same change lowers the budget, so the size goes only down.
 */
export function sizeVerdict(entries: readonly SizeEntry[], measures: readonly SizeMeasure[], reasons: readonly string[] = [], drop: number = SIZE_HEADROOM): SizeResult {
  const all = [...reasons];
  const rows: SizeRow[] = [];
  for (const e of entries) {
    const m = measures.find((x) => x.specifier === e.specifier);
    if (m === undefined) {
      all.push(`The entry ${e.specifier} has no measure.`);
      continue;
    }
    const outcome = m.gzip > e.budget ? "above" : m.gzip < e.measured * (1 - drop) ? "below" : "within";
    if (outcome === "above") all.push(`${e.specifier} is ${m.gzip} bytes gzip, above its budget of ${e.budget}.`);
    if (outcome === "below") {
      all.push(`${e.specifier} is ${m.gzip} bytes gzip, more than ${drop * 100} % under its record of ${e.measured}. Lower its budget in this change: node bench/main.ts size-gate --derive.`);
    }
    rows.push({ ...m, budget: e.budget, change: Math.round((m.gzip / e.measured - 1) * 10000) / 10000, outcome });
  }
  return { schema: "size-gate-result/1", verdict: all.length === 0 ? "pass" : "fail", rows, reasons: all };
}

/** This function gives the record with the new measures, and a budget from `sizeBudget` for each entry. */
export function deriveSizeGate(gate: SizeGate, measures: readonly SizeMeasure[], commit: string): SizeGate {
  return {
    ...gate,
    commit,
    entries: gate.entries.map((e) => {
      const m = measures.find((x) => x.specifier === e.specifier);
      if (m === undefined) throw new Error(`The entry ${e.specifier} has no measure.`);
      return { ...e, measured: m.gzip, budget: sizeBudget(m.gzip) };
    }),
  };
}

/** This function gives the result as a Markdown table, for the summary of a CI job. */
export function sizeMarkdown(r: SizeResult): string {
  const lines = [`## Size gate: ${r.verdict}`, "", "| Entry | Raw bytes | Gzip bytes | Budget | Change | Outcome |", "|---|---|---|---|---|---|"];
  for (const x of r.rows) lines.push(`| \`${x.specifier}\` | ${x.raw} | ${x.gzip} | ${x.budget} | ${(x.change * 100).toFixed(2)} % | ${x.outcome} |`);
  if (r.reasons.length > 0) lines.push("", ...r.reasons.map((s) => `- ${s}`));
  return `${lines.join("\n")}\n`;
}
