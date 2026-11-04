// This script writes the file `strategy-catalog.json` from the constant `strategyCatalog` and the version of `package.json` (roadmap item k144).
// A version pull request starts it, because a test of the package compares the file with the writer output.
// Start it from packages/packing: node --no-warnings bench/write-catalog.ts

import { readFileSync, writeFileSync } from "node:fs";
import { writeStrategyCatalog } from "@mark1russell7/layout-contract";
import { strategyCatalog } from "../src/strategy-catalog.ts";

/** The file of the catalog, in the package folder. */
const FILE = new URL("../strategy-catalog.json", import.meta.url);

/** This function writes the file with the version of the package. */
function main(): void {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  writeFileSync(FILE, writeStrategyCatalog(strategyCatalog, version));
}

if (process.argv[1]?.endsWith("write-catalog.ts")) main();
