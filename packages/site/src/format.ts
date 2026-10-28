// The text helpers of the pages of results and news.

import type { Label, Origin } from "./data.ts";

/** This function escapes text for HTML. */
export const esc = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]!);

/** This function escapes text for HTML and shows each span in backticks as code. */
export const inline = (text: string): string => esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");

/** The address of the source on GitHub */
const REPO = "https://github.com/mark1russell7/packing";

/** This function gives the HTML of the origin of a snapshot: the release, the commit, the date and the CI run. */
export function originHtml(origin: readonly Origin[]): string {
  const one = (o: Origin): string => {
    const run = o.run === null ? "" : ` · run <a href="${REPO}/actions/runs/${o.run}">${o.run}</a>`;
    return `<li><span class="rel">${esc(o.release)}</span> commit <a href="${REPO}/commit/${esc(o.commit)}"><code>${esc(o.commit)}</code></a> · ${esc(o.date)}${run}<span class="src"> · ${inline(o.source)}</span></li>`;
  };
  return `<ul class="origin" aria-label="The origin of the data">${origin.map(one).join("")}</ul>`;
}

/** The look of each label: a mark, a word and a class for the color */
export const LABEL_LOOK: Record<Label, { mark: string; word: string; cls: string }> = {
  better: { mark: "▲", word: "Better", cls: "better" },
  worse: { mark: "▼", word: "Worse", cls: "worse" },
  "depends on the mix": { mark: "◆", word: "Mixed", cls: "mixed" },
  "no verdict": { mark: "•", word: "No verdict", cls: "none" },
  "not measured": { mark: "○", word: "Not measured", cls: "unmeasured" },
};

/**
 * This function gives the text of a difference in the direction of a measure. A positive value is better.
 * A share shows in percentage points, other measures as numbers.
 */
export function diffText(value: number, share: boolean): string {
  const v = share ? value * 100 : value;
  const abs = Math.abs(v);
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  const text = abs.toFixed(digits);
  if (Number(text) === 0) return share ? "0 pts" : "0";
  return `${v > 0 ? "+" : "−"}${text}${share ? " pts" : ""}`;
}

/** This function gives the text of a time in milliseconds. */
export function msText(ms: number): string {
  if (ms >= 100) return `${ms.toFixed(0)} ms`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(3)} ms`;
}
