// The rule of the overlay of the branch `site-data`. A file of the branch replaces the file of `main` only if its own record is later.
// The data gate (`data-gate.ts`) stays necessary, because a later file of the branch can still lack a new field.

/** The time of a record: the start date of its latest run, and the run id for two runs of one day. */
export interface RecordTime {
  readonly date: string;
  readonly run: number;
}

/** The files that the overlay takes from the branch, one line for each file of the branch, and the faults. */
export interface OverlayChoices {
  readonly take: readonly string[];
  readonly lines: readonly string[];
  readonly faults: readonly string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** This function tells if `a` comes after `b`. Equal times do not. */
export function isLater(a: RecordTime, b: RecordTime): boolean {
  return a.date === b.date ? a.run > b.run : a.date > b.date;
}

/**
 * This function gives the time of the latest run in the field `origin` of a data file. A run with no id has the id 0.
 * The result is `undefined` for a file with no origin, with a date that does not read, or with text that is not JSON.
 */
export function timeOfRecord(text: string): RecordTime | undefined {
  const origin = (parsed(text) as { origin?: unknown } | null | undefined)?.origin;
  if (!Array.isArray(origin) || origin.length === 0) return undefined;
  let latest: RecordTime | undefined;
  for (const entry of origin as ({ date?: unknown; run?: unknown } | null)[]) {
    const date = entry?.date;
    const run = entry?.run;
    if (typeof date !== "string" || !DAY.test(date) || Number.isNaN(Date.parse(date))) return undefined;
    if (run !== null && typeof run !== "number") return undefined;
    const time = { date, run: run ?? 0 };
    if (latest === undefined || isLater(time, latest)) latest = time;
  }
  return latest;
}

const words = (time: RecordTime): string => `run ${time.run} of ${time.date}`;

/** This function applies the rule to the files of the branch and the files of `main`. A tie goes to `main`. */
export function overlayChoices(branch: ReadonlyMap<string, string>, main: ReadonlyMap<string, string>): OverlayChoices {
  const take: string[] = [];
  const lines: string[] = [];
  const faults: string[] = [];
  for (const [file, text] of [...branch].sort(([a], [b]) => a.localeCompare(b))) {
    const time = timeOfRecord(text);
    if (time === undefined) {
      faults.push(`${file}: the file of the branch has no readable time in its origin.`);
      continue;
    }
    const own = main.get(file);
    if (own === undefined) {
      take.push(file);
      lines.push(`${file}: from the branch, ${words(time)}. The file is not on main.`);
      continue;
    }
    const mainTime = timeOfRecord(own);
    if (mainTime === undefined) {
      faults.push(`${file}: the file of main has no readable time in its origin.`);
    } else if (isLater(time, mainTime)) {
      take.push(file);
      lines.push(`${file}: from the branch, ${words(time)} is later than ${words(mainTime)} on main.`);
    } else {
      lines.push(`${file}: from main, ${words(mainTime)}. The branch has ${words(time)}.`);
    }
  }
  return { take, lines, faults };
}
