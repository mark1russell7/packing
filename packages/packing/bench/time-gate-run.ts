// The paired time test of one gate of bench/gates, and the gate on its report (time-gate.yml).
//
// The environment gives GATE (the id of the gate record), REPEATS, OUT (the out folder), GITHUB_SHA and RETRY (1 on the second run).
// The exit code is 0 on a pass, 1 on a fail and 3 when the A/A spread of the run is above the noise cap.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTimeGate } from "./time-gate.ts";

const here = import.meta.dirname;

/** This function gives the value of an environment variable, and throws when it is not set. */
function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`The time gate run needs the environment variable ${name}.`);
  return value;
}

/** This function gives the argv of the paired run of a gate: its arms, corpus, mode, filter and passes. */
export function pairedArgs(text: string, repeats: string, out: string, commit: string): string[] {
  const gate = parseTimeGate(text);
  const arms = [...new Set([gate.base, ...(gate.members ?? []), gate.arm])].join(",");
  return [
    "paired",
    ...["--corpus", gate.corpus, "--arms", arms, "--prediction", `gate-${gate.id}`, "--mode", gate.mode],
    ...["--repeats", repeats, "--warmup", String(gate.warmup ?? 1)],
    ...(gate.only === undefined ? [] : ["--only", gate.only]),
    ...(gate.passes === undefined ? [] : ["--passes", String(gate.passes)]),
    ...["--commit", commit, "--out", out],
  ];
}

/** This function adds the Markdown file `name` of the out folder to the job summary, when both exist. */
function summary(out: string, name: string): void {
  const file = join(out, name);
  const target = process.env["GITHUB_STEP_SUMMARY"];
  if (target !== undefined && existsSync(file)) appendFileSync(target, readFileSync(file, "utf8"));
}

/** This function starts `bench/main.ts` with the arguments, and gives its exit code. */
function main(args: string[]): number {
  const result = spawnSync(process.execPath, [join(here, "main.ts"), ...args], { stdio: "inherit" });
  return result.status ?? 1;
}

if (import.meta.main) {
  const gate = env("GATE");
  const out = env("OUT");
  const file = join(here, "gates", `${gate}.json`);
  let status = main(pairedArgs(readFileSync(file, "utf8"), env("REPEATS"), out, env("GITHUB_SHA")));
  summary(out, "paired-time.md");
  if (status === 0) {
    status = main(["paired-gate", "--gate", file, "--dir", out, ...(process.env["RETRY"] === "1" ? ["--retry"] : [])]);
    summary(out, "gate.md");
  }
  process.exitCode = status;
}
