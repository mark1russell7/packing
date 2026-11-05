// The shapes of the data files of the site. A shape reads a parsed JSON value and gives each fault with the path of its field.
// The TypeScript type of a file decides the keys of its shape, so a new field of the type does not compile without a shape.
// This module imports nothing, so a page and the Pages build read a file through the same code.

/** One fault of a data file: the path of the field and the text of the fault */
export interface DataFault {
  readonly field: string;
  readonly reason: string;
}

/** A reader of the values of the type `T`. It adds each fault to `out`. The field `type` only holds `T` for the compiler. */
export interface Shape<T> {
  (value: unknown, at: string, out: DataFault[]): void;
  readonly type?: T;
}

/** The shape of a field that a file can leave out */
export interface Optional<T> {
  readonly optional: Shape<T>;
}

type OptionalKey<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/** The shapes of the fields of `T`. A field with no `?` takes a `Shape`, and an optional field takes an `Optional`. */
export type FieldsOf<T> = { readonly [K in keyof T]-?: K extends OptionalKey<T> ? Optional<Exclude<T[K], undefined>> : Shape<T[K]> };

const FILE = "the file";

/** This function tells if a value is a plain object. */
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** This function gives the shape of one type of `typeof`. */
const primitive = <T>(name: "string" | "number" | "boolean"): Shape<T> => (value, at, out) => {
  if (typeof value !== name) out.push({ field: at || FILE, reason: `is not a ${name}` });
};

export const text: Shape<string> = primitive("string");
export const num: Shape<number> = primitive("number");
export const bool: Shape<boolean> = primitive("boolean");

/** This function gives the shape of a value from a closed list. */
export const oneOf = <const V extends string>(...values: readonly V[]): Shape<V> => (value, at, out) => {
  if (!values.includes(value as V)) out.push({ field: at || FILE, reason: `is not one of ${values.join(", ")}` });
};

/** This function gives the shape of a value or `null`. */
export const nullable = <T>(shape: Shape<T>): Shape<T | null> => (value, at, out) => {
  if (value !== null) shape(value, at, out);
};

/** This function gives the shape of a list. */
export const list = <T>(shape: Shape<T>): Shape<T[]> => (value, at, out) => {
  if (!Array.isArray(value)) {
    out.push({ field: at || FILE, reason: "is not a list" });
    return;
  }
  value.forEach((item, index) => shape(item, `${at}[${index}]`, out));
};

/** This function gives the shape of an object with free keys. */
export const recordOf = <T>(shape: Shape<T>): Shape<Record<string, T>> => (value, at, out) => {
  if (!isObject(value)) {
    out.push({ field: at || FILE, reason: "is not an object" });
    return;
  }
  for (const [key, item] of Object.entries(value)) shape(item, `${at}.${key}`, out);
};

/** This function gives the shape of a value of one of two forms. It keeps the faults of the nearer form. */
export const either = <A, B>(a: Shape<A>, b: Shape<B>): Shape<A | B> => (value, at, out) => {
  const first: DataFault[] = [];
  a(value, at, first);
  if (first.length === 0) return;
  const second: DataFault[] = [];
  b(value, at, second);
  if (second.length === 0) return;
  out.push(...(first.length <= second.length ? first : second));
};

/** This function marks a field that a file can leave out. */
export const optional = <T>(shape: Shape<T>): Optional<T> => ({ optional: shape });

/** This function gives the shape of an object with known keys. A key that the shape does not name stays free. */
export function fields<T extends object>(spec: FieldsOf<T>): Shape<T> {
  const entries = Object.entries(spec) as [string, Shape<unknown> | Optional<unknown>][];
  return (value, at, out) => {
    if (!isObject(value)) {
      out.push({ field: at || FILE, reason: "is not an object" });
      return;
    }
    for (const [key, shape] of entries) {
      const path = at === "" ? key : `${at}.${key}`;
      const item = value[key];
      if ("optional" in shape) {
        if (item !== undefined) shape.optional(item, path, out);
      } else if (item === undefined) out.push({ field: path, reason: "is missing" });
      else shape(item, path, out);
    }
  };
}

/** This function gives the faults of a parsed value. */
export function faultsOf(shape: Shape<unknown>, value: unknown): DataFault[] {
  const out: DataFault[] = [];
  shape(value, "", out);
  return out;
}

/** The error of a data file with faults. The message names the first fault. */
export class DataFileError extends Error {
  readonly faults: readonly DataFault[];

  constructor(faults: readonly DataFault[]) {
    const first = faults[0];
    super(first === undefined ? "The data file has a fault." : `The field ${first.field} ${first.reason}. The file has ${faults.length} faults.`);
    this.faults = faults;
  }
}

/** This function reads the text of a data file with a shape. It throws a `DataFileError` for a file with a fault. */
export function readShape<T>(text: string, shape: Shape<T>): T {
  const value: unknown = JSON.parse(text);
  const faults = faultsOf(shape as Shape<unknown>, value);
  if (faults.length > 0) throw new DataFileError(faults);
  return value as T;
}
