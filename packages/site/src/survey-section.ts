// The section of the survey on the page of the strategy cards (k108). It shows each idea of `docs/research/survey.json`
// as a row of a table, with filters by class and by status. The functions that give HTML have no access to the page.

import { escapeHtml as esc } from "./cards-model.ts";
import { CLASSES, countBy, filterMethods, scoreText, STATUSES, type ProblemClass, type SurveyFile, type SurveyMethod, type SurveyStatus } from "./survey-model.ts";

/** The address of the roadmap on GitHub */
export const ROADMAP_URL = "https://github.com/mark1russell7/packing/blob/main/docs/ROADMAP.md";

/** The address of the survey on GitHub */
export const SURVEY_URL = "https://github.com/mark1russell7/packing/blob/main/docs/research/SURVEY.md";

/** The look of each status: the class of its chip and its note */
export const STATUS_LOOK: Record<SurveyStatus, { cls: string; note: string }> = {
  built: { cls: "built", note: "The package has it, and its roadmap item is done." },
  queued: { cls: "queued", note: "A row of the queue of the roadmap holds it." },
  "not queued": { cls: "open", note: "No row of the queue holds it. The owner can add it." },
  rejected: { cls: "rejected", note: "The owner rejected it, for the reason in its note." },
};

/** This function gives the text of the sources of an idea: each key, with the authors, the year and the title as a tooltip. */
export function sourcesHtml(m: SurveyMethod): string {
  if (!m.published) return `<span class="sv-own">this repository</span>`;
  return m.sources
    .map((s) => {
      const tip = s.authors === null ? s.title : `${s.authors} (${s.year}). ${s.title}`;
      return `<abbr title="${esc(tip)}">${esc(s.key)}</abbr>`;
    })
    .join(", ");
}

/** This function gives the score cell: the score of the queue, else the score of the survey, else a dash. */
export function scoreHtml(m: SurveyMethod): string {
  if (m.queue !== null) return `<span class="num" title="The score of the queue">${scoreText(m.queue)}</span>`;
  if (m.survey !== null) return `<span class="num sv-old" title="The score of the survey. The queue has no row.">${scoreText(m.survey)}</span>`;
  return `<span class="sv-none" title="No factors yet">—</span>`;
}

/** This function gives the HTML of the text with each code span as a `code` element. It escapes all of the text. */
const codeHtml = (text: string): string => esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");

/** This function gives the HTML of one row of the table of the survey. */
export function surveyRowHtml(m: SurveyMethod): string {
  const item = m.item === null ? `<span class="sv-none">none</span>` : `<a href="${ROADMAP_URL}" title="${esc(m.itemTitle ?? "")}"><code>${esc(m.item)}</code></a>`;
  const related = m.related.length === 0 ? "" : `<br /><small class="sv-rel">also ${m.related.map((k) => `<code>${esc(k)}</code>`).join(" ")}</small>`;
  const tags = [m.round === 2 ? `<span class="sc-tag sv-new">round 2</span>` : "", m.published ? "" : `<span class="sc-tag">hybrid of this repository</span>`].join("");
  const note = m.note === null ? "" : `<br /><small class="sv-note">${codeHtml(m.note)}</small>`;
  return `<tr data-class="${esc(m.problemClass)}" data-status="${esc(m.status)}">
    <th scope="row"><code class="sv-id">${esc(m.id)}</code></th>
    <td><b>${esc(m.name)}</b> ${tags}<br /><small class="sv-desc">${codeHtml(m.description)}</small></td>
    <td>${esc(m.problemClass)}<br /><small class="sv-rel">${esc(m.shapes.join(", "))}</small></td>
    <td>${esc(m.family)}</td>
    <td class="sv-src">${sourcesHtml(m)}</td>
    <td>${item}${related}</td>
    <td><span class="sv-chip ${STATUS_LOOK[m.status].cls}" title="${esc(STATUS_LOOK[m.status].note)}">${esc(m.status)}</span>${note}</td>
    <td>${scoreHtml(m)}</td>
  </tr>`;
}

/** The elements of the section */
export interface SurveyElements {
  lead: HTMLElement;
  tiles: HTMLElement;
  classes: HTMLElement;
  statuses: HTMLElement;
  count: HTMLElement;
  rows: HTMLElement;
}

/** This function fills the section of the survey, and connects its filters. */
export function mountSurvey(survey: SurveyFile, el: SurveyElements): void {
  const methods = survey.methods;
  const published = methods.filter((m) => m.published).length;
  el.lead.innerHTML = `The <a href="${SURVEY_URL}">survey</a> has ${methods.length} ideas: ${published} published methods and ${methods.length - published} hybrids of this repository. The file <code>docs/research/survey.json</code> is the source, and a test checks it against the roadmap and the catalog.`;
  el.tiles.innerHTML = countBy(methods, "status", STATUSES)
    .map(([s, n]) => `<div class="tile sv-tile ${STATUS_LOOK[s].cls}"><b>${n}</b><span>${esc(s)}</span><small>${esc(STATUS_LOOK[s].note)}</small></div>`)
    .join("");
  let cls: ProblemClass | "all" = "all";
  let status: SurveyStatus | "all" = "all";
  const seg = (values: readonly string[], counts: [string, number][], key: string): string =>
    [`<button type="button" role="radio" data-${key}="all">All <small>${methods.length}</small></button>`, ...values.map((v, i) => `<button type="button" role="radio" data-${key}="${esc(v)}">${esc(v)} <small>${counts[i]![1]}</small></button>`)].join("");
  el.classes.innerHTML = seg(CLASSES, countBy(methods, "problemClass", CLASSES), "class");
  el.statuses.innerHTML = seg(STATUSES, countBy(methods, "status", STATUSES), "status");

  const apply = (): void => {
    const shown = filterMethods(methods, cls, status);
    el.rows.innerHTML = shown.length === 0 ? `<tr><td colspan="8" class="hint">No idea has this class and this status.</td></tr>` : shown.map(surveyRowHtml).join("");
    el.count.textContent = `${shown.length} of ${methods.length} ideas.`;
    for (const b of el.classes.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(b.dataset["class"] === cls));
    for (const b of el.statuses.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-checked", String(b.dataset["status"] === status));
  };
  el.classes.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (b === null) return;
    cls = (b.dataset["class"] ?? "all") as ProblemClass | "all";
    apply();
  });
  el.statuses.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (b === null) return;
    status = (b.dataset["status"] ?? "all") as SurveyStatus | "all";
    apply();
  });
  apply();
}
