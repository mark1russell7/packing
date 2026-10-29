import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readInputs } from "../scripts/survey-check.ts";
import { scoreHtml, sourcesHtml, surveyRowHtml } from "./survey-section.ts";
import { CLASSES, checkSurvey, countBy, filterMethods, parseRoadmap, parseSurvey, roundState, scoreText, STATUSES, type SurveyInputs, type SurveyMethod } from "./survey-model.ts";

const input = readInputs();
const methods = input.survey.methods;
const SCRIPT = fileURLToPath(new URL("../scripts/survey-check.ts", import.meta.url));

/** This function gives a copy of the inputs with a change to the methods. */
const withMethods = (change: (list: SurveyMethod[]) => SurveyMethod[]): SurveyInputs => ({
  ...input,
  survey: { ...input.survey, methods: change(structuredClone(methods)) },
});
const edit = (id: string, change: (m: SurveyMethod) => void): SurveyInputs =>
  withMethods((list) => {
    change(list.find((m) => m.id === id)!);
    return list;
  });

describe("the survey as data (k108)", () => {
  it("agrees with SURVEY.md, the queue of the roadmap and the bibliography", () => {
    expect(checkSurvey(input)).toEqual([]);
  });

  it("passes the check of the script", () => {
    const out = execFileSync(process.execPath, [SCRIPT, "--check"], { encoding: "utf8" });
    expect(out).toMatch(/agrees with SURVEY\.md/);
    expect(out).toMatch(/By class: strip \d+/);
  });

  it("has round 1 of k76 and at least 12 published methods of round 2, none queued", () => {
    const round1 = methods.filter((m) => m.round === 1);
    expect(round1.map((m) => m.id)).toEqual([...Array.from({ length: 20 }, (_, i) => `R${i + 1}`), ...Array.from({ length: 15 }, (_, i) => `S${i + 1}`)]);
    const round2 = methods.filter((m) => m.round === 2);
    expect(round2.filter((m) => m.published).length).toBeGreaterThanOrEqual(12);
    expect(round2.every((m) => m.status === "not queued" && m.queue === null && m.survey === null)).toBe(true);
    for (const m of round2.filter((x) => x.family === "hybrid" && !x.published)) expect(m.sources).toEqual([]);
    expect(countBy(round2, "problemClass", CLASSES).find(([c]) => c === "online")![1]).toBeGreaterThanOrEqual(3);
  });

  it("finds an idea that one side lacks", () => {
    expect(checkSurvey(withMethods((l) => l.filter((m) => m.id !== "R7")))).toContain("R7 is in SURVEY.md, but not in the survey file.");
    const extra = checkSurvey(withMethods((l) => [...l, { ...l[0]!, id: "R99" }]));
    expect(extra).toContain("R99 is in the survey file, but no table of SURVEY.md has it.");
    expect(checkSurvey(withMethods((l) => [...l, l[0]!]))).toContain("The id R1 is in the survey file more than once.");
  });

  it("finds a name, a description or a factor that differs from SURVEY.md", () => {
    expect(checkSurvey(edit("R5", (m) => (m.name = "Ruin")))).toContain(`R5: the name is "Goal-driven ruin and recreate" in SURVEY.md, not "Ruin".`);
    expect(checkSurvey(edit("R5", (m) => (m.description = "Other.")))).toContain("R5: the description of SURVEY.md differs.");
    expect(checkSurvey(edit("R5", (m) => (m.survey = { gain: 1, uncertainty: 1, cost: 1 })))).toContain("R5: the factors of SURVEY.md are 4, 4, 3, not 1, 1, 1.");
  });

  it("finds a queue factor that differs from the queue, and a status that the roadmap does not support", () => {
    expect(checkSurvey(edit("S1", (m) => (m.queue = { gain: 5, uncertainty: 3, cost: 2 })))).toContain("S1: the queue factors of k90 are 4, 3, 2, not 5, 3, 2.");
    expect(checkSurvey(edit("S1", (m) => (m.status = "built")))).toContain("S1 is built, but its item k90 is not done.");
    expect(checkSurvey(edit("S1", (m) => (m.status = "not queued")))).toContain("S1 is not queued, but the queue has a row for k90.");
    expect(checkSurvey(edit("R21", (m) => (m.status = "queued")))).toContain("R21 is queued, but the queue has no row for an item of it.");
    expect(checkSurvey(edit("R21", (m) => (m.status = "rejected")))).toContain("R21 is rejected, but it has no reason.");
  });

  it("finds an item that is not in the roadmap, a title that differs and an item of another idea", () => {
    expect(checkSurvey(edit("R6", (m) => (m.item = "k999")))).toContain("R6: the item k999 is not in ROADMAP.md.");
    expect(checkSurvey(edit("R6", (m) => (m.itemTitle = "Beam search")))).toContain(`R6: the title of k80 does not start with "Beam search".`);
    const moved = checkSurvey(edit("R6", (m) => ((m.item = "k85"), (m.itemTitle = "Beam search"), (m.queue = { gain: 3, uncertainty: 3, cost: 3 }))));
    expect(moved).toContain("R6: the item k85 holds the idea R14, not R6.");
    expect(moved).toContain("The item k80 holds the idea R6, but the survey file does not give k80 as its item.");
    expect(checkSurvey(edit("R6", (m) => (m.related = ["k999"])))).toContain("R6: the related item k999 is not in ROADMAP.md.");
  });

  it("finds a source that is not in the bibliography, or with other authors, year or title", () => {
    expect(checkSurvey(edit("R21", (m) => (m.sources[0]!.key = "Nobody 2020")))).toContain("R21: the bibliography of CATALOG.md has no entry Nobody 2020.");
    expect(checkSurvey(edit("R21", (m) => (m.sources[0]!.title = "Other")))).toContain(`R21: the title of Wei 2011 is "A skyline heuristic for the 2D rectangular packing and strip packing problems" in CATALOG.md, not "Other".`);
    expect(checkSurvey(edit("R21", (m) => (m.sources[0]!.authors = "A. Person")))).toHaveLength(1);
    expect(checkSurvey(edit("R21", (m) => (m.sources[0]!.year = 2012)))).toContain("R21: the year of Wei 2011 is not 2012.");
    expect(checkSurvey(edit("R21", (m) => (m.sources = [])))).toContain("R21 is published, but it has no source.");
    expect(checkSurvey(edit("R21", (m) => m.sources.push({ ...m.sources[0]!, key: "Burke 2004", authors: "E. K. Burke, G. Kendall, G. Whitwell", year: 2004, title: "A new placement heuristic for the orthogonal stock-cutting problem" })))).toContain(
      "R21: the row of SURVEY.md does not name the source Burke 2004.",
    );
  });

  it("refuses a file of another schema and a record with an invalid field", () => {
    expect(() => parseSurvey(JSON.stringify({ schema: "x" }))).toThrow(/packing-survey\/1/);
    const bad = structuredClone(input.survey) as unknown as { methods: Record<string, unknown>[] };
    bad.methods[0]!["problemClass"] = "cubes";
    bad.methods[1]!["queue"] = { gain: 6, uncertainty: 1, cost: 1 };
    expect(() => parseSurvey(JSON.stringify(bad))).toThrow(/R1 has no valid problemClass\.\nThe record R2 has no valid queue/);
  });
});

describe("the section of the survey on the strategies page", () => {
  const byId = (id: string): SurveyMethod => methods.find((m) => m.id === id)!;

  it("gives a row with the status, the item, the sources and the score of the queue", () => {
    const html = surveyRowHtml(byId("S1"));
    expect(html).toContain(`data-class="circle" data-status="queued"`);
    expect(html).toContain(`<span class="sv-chip queued"`);
    expect(html).toContain("<code>k90</code>");
    expect(html).toMatch(/<abbr title="[^"]+ \(2006\)\. [^"]+">Huang 2006<\/abbr>, <abbr title="[^"]+">Kubach 2009<\/abbr>/);
    expect(scoreHtml(byId("S1"))).toContain(">6.0<");
  });

  it("marks a hybrid of this repository and a new idea, and gives a dash for an idea without factors", () => {
    const html = surveyRowHtml(byId("R37"));
    expect(html).toContain("hybrid of this repository");
    expect(html).toContain("round 2");
    expect(sourcesHtml(byId("R37"))).toBe(`<span class="sv-own">this repository</span>`);
    expect(scoreHtml(byId("R37"))).toContain("—");
    expect(scoreHtml(byId("R4"))).toContain("sv-old");
    expect(surveyRowHtml(byId("R4"))).toContain("<code>bl</code>");
  });

  it("escapes the text of a source", () => {
    const m = { ...byId("R21"), sources: [{ key: "A <b> 2020", authors: "X & Y", year: 2020, title: `"T"` }] };
    expect(sourcesHtml(m)).toBe(`<abbr title="X &amp; Y (2020). &quot;T&quot;">A &lt;b&gt; 2020</abbr>`);
  });
});

describe("the counts, the filters and the rule of the next round", () => {
  it("counts each class and each status, and the counts add up", () => {
    const byClass = countBy(methods, "problemClass", CLASSES);
    const byStatus = countBy(methods, "status", STATUSES);
    expect(byClass.reduce((s, [, n]) => s + n, 0)).toBe(methods.length);
    expect(byStatus.reduce((s, [, n]) => s + n, 0)).toBe(methods.length);
    expect(byClass.every(([, n]) => n > 0)).toBe(true);
  });

  it("filters by class and by status", () => {
    expect(filterMethods(methods, "all", "all")).toHaveLength(methods.length);
    expect(filterMethods(methods, "online", "all").every((m) => m.problemClass === "online")).toBe(true);
    expect(filterMethods(methods, "circle", "queued").map((m) => m.id)).toEqual(["S1", "S4", "S5", "S11", "S14"]);
  });

  it("gives the score with one decimal, and tells when the next round is due", () => {
    expect(scoreText({ gain: 4, uncertainty: 4, cost: 3 })).toBe("5.3");
    const rule = { buildersPerDay: 3, days: 7 };
    const queue = (n: number): string => `## The queue\n\n| Rank | Item |\n| --- | --- |\n${Array.from({ length: n }, (_, i) => `| ${i + 1} | k${i} | 1 | 1 | 1 | 1.0 |`).join("\n")}\n`;
    expect(roundState(parseRoadmap(queue(20)), rule)).toEqual({ queued: 20, slots: 21, due: true });
    expect(roundState(parseRoadmap(queue(21)), rule).due).toBe(false);
  });
});
