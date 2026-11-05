// The gate of the data files of the site. The Pages build starts it after the data branch lands on `data/`.
// Start it with `pnpm run check:data`, or give another folder: `node --no-warnings scripts/data-gate.ts <folder>`.
// It exits with 1 on a fault, and it prints the count of the fields with a value and the state `not read`.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateLines, readDataFiles } from "../src/data-gate.ts";

const folder = process.argv[2] ?? fileURLToPath(new URL("../data/", import.meta.url));
const files = new Map(readdirSync(folder).map((name) => [name, readFileSync(join(folder, name), "utf8")]));
const read = readDataFiles(files);
const lines = gateLines(read);
for (const line of lines) console.log(line);
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary !== undefined && summary !== "") appendFileSync(summary, `\n### Data gate\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
if (read.faults.length > 0) process.exit(1);
