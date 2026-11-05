// The overlay of the branch `site-data` on the data files of the site. `src/overlay.ts` has the rule.
// Start it with `node --no-warnings packages/site/scripts/overlay.ts <files of the branch> <data folder>`.
// It exits with 1 and the file name for a file with no readable time, and it then copies nothing.
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { overlayChoices } from "../src/overlay.ts";

const [branchFolder, dataFolder] = process.argv.slice(2);
if (branchFolder === undefined || dataFolder === undefined) throw new Error("The overlay needs <files of the branch> <data folder>.");
const names = readdirSync(branchFolder);
const read = (folder: string, name: string): [string, string] => [name, readFileSync(join(folder, name), "utf8")];
const branch = new Map(names.map((name) => read(branchFolder, name)));
const main = new Map(names.filter((name) => existsSync(join(dataFolder, name))).map((name) => read(dataFolder, name)));
const choices = overlayChoices(branch, main);
for (const line of choices.lines) console.log(line);
for (const fault of choices.faults) console.error(fault);
if (choices.faults.length > 0) process.exit(1);
for (const name of choices.take) copyFileSync(join(branchFolder, name), join(dataFolder, name));
