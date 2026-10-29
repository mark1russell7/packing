// The check of the survey as data (k108). It compares `docs/research/survey.json` with `SURVEY.md`, the queue of
// `docs/ROADMAP.md` and the bibliography of `CATALOG.md`, and it writes the counts by class and by status.
//
//   node packages/site/scripts/survey-check.ts --check
//
// With `--check`, the script exits with 1 when the files differ. Without it, it writes the counts only.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CLASSES, checkSurvey, countBy, parseRoadmap, parseSurvey, roundState, STATUSES, type SurveyInputs } from "../src/survey-model.ts";

const DOCS = new URL("../../../docs/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, DOCS), "utf8");

/** This function reads the four files of the check. */
export function readInputs(): SurveyInputs {
  return {
    survey: parseSurvey(read("research/survey.json")),
    surveyMd: read("research/SURVEY.md"),
    roadmapMd: read("ROADMAP.md"),
    catalogMd: read("research/CATALOG.md"),
  };
}

/** This function starts the script with its arguments, and gives the exit code. */
export function main(args: readonly string[]): number {
  const input = readInputs();
  const methods = input.survey.methods;
  const line = (pairs: [string, number][]): string => pairs.map(([k, n]) => `${k} ${n}`).join(", ");
  console.log(`${methods.length} ideas. By class: ${line(countBy(methods, "problemClass", CLASSES))}.`);
  console.log(`By status: ${line(countBy(methods, "status", STATUSES))}.`);
  const round = roundState(parseRoadmap(input.roadmapMd), input.survey.rule);
  console.log(`The queue has ${round.queued} rows for ${round.slots} build slots a week. ${round.due ? "The next round of the survey is due." : "No round is due."}`);
  if (!args.includes("--check")) return 0;
  const problems = checkSurvey(input);
  for (const p of problems) console.error(p);
  console.log(problems.length === 0 ? "The survey file agrees with SURVEY.md, the roadmap and the catalog." : `${problems.length} problems.`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
