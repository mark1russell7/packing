// The generated inputs of the site (roadmap item k73): the corpus families of packing and the shared family
// `rect-scattered`, in one family registry of layout-contract. The demo and the compare page take their inputs and their
// sliders from it: a family picker, a seed and one control for each dimension.

import {
  createFamilyRegistry,
  dimensionAt,
  dimensionUnit,
  familyKind,
  levelsOf,
  RECT_SCATTERED,
  type CorpusDimension,
  type CorpusFamily,
  type FamilyRegistry,
  type LayoutInput,
  type ParamValue,
} from "@mark1russell7/layout-contract";
import { corpusFamilies, toPackInput, type PackInput } from "@mark1russell7/packing";
import { esc } from "./format.ts";

/** The registry of the site: `RECT_SCATTERED` of the contract, then each corpus family of packing. */
export const SITE_REGISTRY: FamilyRegistry<LayoutInput> = createFamilyRegistry<LayoutInput>([RECT_SCATTERED, ...corpusFamilies]);

/** This constant lists each family of the registry of the site, in the order of registration. */
export const SITE_FAMILIES: readonly CorpusFamily<LayoutInput>[] = SITE_REGISTRY.families();

/** The largest count of boxes of a generated input on the site. Each page packs the input in this browser. */
export const MAX_SITE_COUNT = 1000;

/** The family of the site when the URL names no family or an unknown family. */
export const DEFAULT_FAMILY = "rect-grid@2";

/** The positions of a slider: a slider goes from 0 to this value. */
export const SLIDER_STEPS = 1000;

/** The values of the dimensions of an input that differ from their defaults, by the name of the dimension. */
export type DimensionValues = Record<string, ParamValue>;

/** This function gives the key of a family: its name and its version, for example `rect-grid@2`. */
export const familyKey = (f: Pick<CorpusFamily<unknown>, "name" | "version">): string => familyKind(f.name, f.version);

/** This function gives the family of a key. An unknown key gives the family `DEFAULT_FAMILY`. */
export function familyOf(key: string): CorpusFamily<LayoutInput> {
  return SITE_FAMILIES.find((f) => familyKey(f) === key) ?? SITE_FAMILIES.find((f) => familyKey(f) === DEFAULT_FAMILY) ?? SITE_FAMILIES[0]!;
}

/** This function gives a dimension with the range of the site. The dimension `count` stops at `MAX_SITE_COUNT`. */
export function siteDimension(d: CorpusDimension): CorpusDimension {
  if (d.name !== "count" || d.max === undefined || d.max <= MAX_SITE_COUNT) return d;
  const levels = d.levels?.filter((v) => typeof v === "number" && v <= MAX_SITE_COUNT);
  return { ...d, max: MAX_SITE_COUNT, ...(levels === undefined ? {} : { levels }) };
}

/** The names of the dimensions on the page. A dimension without a name shows its name in the registry. */
export const DIMENSION_LABELS: Readonly<Record<string, string>> = {
  containerSize: "Container size",
  containerShape: "Container shape",
  obstacles: "Obstacles",
  sizes: "Sizes",
  order: "Order",
  count: "Boxes",
  margin: "Margin",
  gap: "Gap",
  shape: "Item shape",
  case: "Case",
};

/**
 * The control of one dimension. Each control has the dimension with the range of the site, and `active`. The value
 * `false` of `active` tells that the family ignores the dimension for the other values.
 *
 * - `select`: an `enum`. A value that a sweep of the dimension does not give is not supported yet, and the page disables it.
 * - `range`: an `int` or a `real`, as a slider on the scale of the dimension. `ticks` are the positions of its levels.
 * - `flag`: a `bool`.
 */
export type DimensionControl =
  | { name: string; dim: CorpusDimension; active: boolean; kind: "select"; options: readonly { value: string; supported: boolean }[]; value: string }
  | { name: string; dim: CorpusDimension; active: boolean; kind: "range"; value: number; position: number; ticks: readonly number[] }
  | { name: string; dim: CorpusDimension; active: boolean; kind: "flag"; value: boolean };

/** This function gives the slider position of a value of a numeric dimension, from 0 to `SLIDER_STEPS`. */
export const sliderPosition = (dim: CorpusDimension, value: number): number => Math.round(dimensionUnit(siteDimension(dim), value) * SLIDER_STEPS);

/** This function gives the value at a slider position. A real value gets 2 decimals at most. */
export function sliderValue(dim: CorpusDimension, position: number): number {
  const d = siteDimension(dim);
  const v = dimensionAt(d, position / SLIDER_STEPS);
  return d.kind === "int" ? v : Math.min(d.max ?? v, Math.max(d.min ?? v, Math.round(v * 100) / 100));
}

/** This function gives the text of a value of a dimension. */
export const dimensionText = (v: ParamValue): string => (typeof v === "number" && !Number.isInteger(v) ? String(Number(v.toFixed(2))) : String(v));

/** This function gives the values that a sweep of a dimension gives, as text. The page supports only these values. */
const supportedOf = (d: CorpusDimension): string[] => levelsOf(d).map(String);

/** This function gives the control of each dimension of a family, with the values of an input. */
export function dimensionControls(key: string, dims: DimensionValues = {}): DimensionControl[] {
  const f = familyOf(key);
  const full = SITE_REGISTRY.resolve(f.name, dims, f.version);
  const cell = SITE_REGISTRY.cellOf(f.name, dims, f.version);
  return f.dimensions.map((raw): DimensionControl => {
    const dim = siteDimension(raw);
    const value = full[dim.name]!;
    const base = { name: dim.name, dim, active: Object.hasOwn(cell, dim.name) };
    if (dim.kind === "enum") {
      const supported = supportedOf(dim);
      const options = (dim.values ?? []).map((v) => ({ value: String(v), supported: supported.includes(String(v)) }));
      return { ...base, kind: "select", options, value: String(value) };
    }
    if (dim.kind === "bool") return { ...base, kind: "flag", value: value === true };
    const n = Math.min(Number(value), dim.max ?? Number(value));
    const levels = levelsOf(dim, 5).filter((v): v is number => typeof v === "number");
    return { ...base, kind: "range", value: n, position: sliderPosition(dim, n), ticks: [...new Set(levels.map((v) => sliderPosition(dim, v)))] };
  });
}

/**
 * This function gives the value of a dimension from text: the text of the URL or of a control. It gives `undefined`
 * for a bad value, and for a value that the page does not support yet.
 */
export function parseDimension(dim: CorpusDimension, raw: string): ParamValue | undefined {
  const d = siteDimension(dim);
  if (d.kind === "enum") {
    const v = (d.values ?? []).find((x) => String(x) === raw);
    return v !== undefined && supportedOf(d).includes(raw) ? v : undefined;
  }
  if (d.kind === "bool") return raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : undefined;
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v)) return undefined;
  const clamped = Math.min(d.max ?? v, Math.max(d.min ?? v, v));
  return d.kind === "int" ? Math.round(clamped) : clamped;
}

/** This function gives the values of a family from the URL: the key `p.<name>` of each dimension. A default value goes. */
export function readDimensions(key: string, get: (name: string) => string | null): DimensionValues {
  let out: DimensionValues = {};
  for (const d of familyOf(key).dimensions) {
    const raw = get(`p.${d.name}`);
    if (raw === null) continue;
    const v = parseDimension(d, raw);
    if (v !== undefined) out = withDimension(key, out, d.name, v);
  }
  return out;
}

/** This function writes the values of the dimensions into the URL, as `p.<name>`. */
export function writeDimensions(params: URLSearchParams, dims: DimensionValues): void {
  for (const [k, v] of Object.entries(dims)) params.set(`p.${k}`, String(v));
}

/** This function gives the values with a new value of one dimension. A value equal to the default goes, so the URL stays short. */
export function withDimension(key: string, dims: DimensionValues, name: string, value: ParamValue): DimensionValues {
  const d = familyOf(key).dimensions.find((x) => x.name === name);
  if (d === undefined) return dims;
  const { [name]: _old, ...rest } = dims;
  return value === d.default ? rest : { ...rest, [name]: value };
}

/** A generated input of the site: the file of the registry and its packing input. */
export interface GeneratedSiteInput {
  file: LayoutInput;
  input: PackInput;
}

/**
 * This function makes the input of a family with `generate` of the registry of the site. A count above `MAX_SITE_COUNT`
 * becomes `MAX_SITE_COUNT`. A bad value throws the `RangeError` of the registry or of the family.
 */
export function generateInput(key: string, dims: DimensionValues, seed: number): GeneratedSiteInput {
  const f = familyOf(key);
  const own = Object.fromEntries(Object.entries(dims).filter(([k]) => f.dimensions.some((d) => d.name === k)));
  if (typeof own["count"] === "number") own["count"] = Math.max(0, Math.min(MAX_SITE_COUNT, Math.round(own["count"])));
  const file = SITE_REGISTRY.generate(f.name, seed, own, { version: f.version });
  return { file, input: toPackInput(file) };
}

/** This function gives the label of a family in a picker. */
export const familyLabel = (f: CorpusFamily<unknown>): string => `${f.name}, version ${f.version}`;

/** This function gives the HTML of the options of a family picker. */
export const familyOptionsHtml = (selected: string): string =>
  SITE_FAMILIES.map((f) => `<option value="${esc(familyKey(f))}"${familyKey(f) === selected ? " selected" : ""}>${esc(familyLabel(f))}</option>`).join("");

/**
 * This function gives the HTML of the controls of the dimensions. Each control has the attribute `data-dim`. An
 * inactive control is disabled. A value that is not supported yet is a disabled choice with a note.
 */
export function controlsHtml(controls: readonly DimensionControl[], prefix: string): string {
  return controls
    .map((c) => {
      const label = esc(DIMENSION_LABELS[c.name] ?? c.name);
      const tip = `title="${esc(c.dim.meaning)}"`;
      const off = c.active ? "" : " disabled";
      const idle = c.active ? "" : `<small class="hint">This input does not use it.</small>`;
      switch (c.kind) {
        case "select": {
          const opts = c.options
            .map((o) => `<option value="${esc(o.value)}"${o.value === c.value ? " selected" : ""}${o.supported ? "" : " disabled"}>${esc(o.value)}${o.supported ? "" : " (not supported yet)"}</option>`)
            .join("");
          const later = c.options.some((o) => !o.supported) ? `<small class="hint">The other kinds are not supported yet.</small>` : "";
          return `<label class="opt dim" ${tip}>${label}<select data-dim="${esc(c.name)}"${off}>${opts}</select>${later}${idle}</label>`;
        }
        case "flag":
          return `<label class="opt check dim" ${tip}><input type="checkbox" data-dim="${esc(c.name)}"${c.value ? " checked" : ""}${off} />${label}${idle}</label>`;
        case "range": {
          const list = `${prefix}-${c.name}-ticks`;
          const ticks = c.ticks.map((t) => `<option value="${t}"></option>`).join("");
          const scale = c.dim.scale === "log" ? " (log scale)" : "";
          return `<label class="opt dim range" ${tip}><span class="dim-head">${label}<output data-out="${esc(c.name)}">${esc(dimensionText(c.value))}</output></span><input type="range" data-dim="${esc(c.name)}" min="0" max="${SLIDER_STEPS}" step="1" value="${c.position}" list="${esc(list)}" aria-label="${label}${scale}"${off} /><datalist id="${esc(list)}">${ticks}</datalist>${idle}</label>`;
        }
      }
    })
    .join("");
}

/** This function gives the value of a control of the page: the slider position, the choice or the checkbox. */
export function controlValue(key: string, el: HTMLInputElement | HTMLSelectElement): { name: string; value: ParamValue } | undefined {
  const name = el.dataset["dim"];
  const d = familyOf(key).dimensions.find((x) => x.name === name);
  if (name === undefined || d === undefined) return undefined;
  if (d.kind === "bool") return { name, value: (el as HTMLInputElement).checked };
  if (d.kind === "enum") {
    const v = parseDimension(d, el.value);
    return v === undefined ? undefined : { name, value: v };
  }
  return { name, value: sliderValue(d, Number(el.value)) };
}
