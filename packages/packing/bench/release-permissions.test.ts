import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The job verify of release.yml uses ci.yml with only the permission `contents: read`. A workflow that another workflow uses
// cannot get more than its caller gives. So a job of ci.yml, or of a local workflow that it uses, that asks for more stops each
// release before it starts: the release run of e1e5d91 ended with `startup_failure` on `pull-requests: read`.

const workflow = (name: string): string => readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");

/** One permission of a block, with the job or the workflow that asks for it. */
interface Ask {
  readonly where: string;
  readonly scope: string;
  readonly level: string;
}

/** This function gives each pair of scope and level of each block `permissions:` of a text, with the name of its job. An empty map `{}` gives no pair. */
function permissionsOf(text: string, name: string): Ask[] {
  const lines = text.split("\n");
  const asks: Ask[] = [];
  let job = "the workflow";
  for (let i = 0; i < lines.length; i++) {
    const jobLine = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]!);
    if (jobLine !== null && lines.slice(0, i).some((line) => line === "jobs:")) job = jobLine[1]!;
    const block = /^(\s*)permissions:\s*$/.exec(lines[i]!);
    if (block === null) continue;
    const indent = block[1]!.length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      const pair = /^(\s*)([a-z-]+):\s*([a-z]+)/.exec(line);
      if (pair === null || pair[1]!.length <= indent) break;
      asks.push({ where: `${name} ${job}`, scope: pair[2]!, level: pair[3]! });
    }
  }
  return asks;
}

/** This function gives the local workflows that a text uses, for example `site-check.yml` for `uses: ./.github/workflows/site-check.yml`. */
function localUses(text: string): string[] {
  return [...text.matchAll(/uses: \.\/\.github\/workflows\/([A-Za-z0-9_.-]+\.yml)/g)].map((m) => m[1]!);
}

/** This function tells if a permission of a caller covers an ask. The level `write` covers `read`. */
const covers = (given: readonly Ask[], ask: Ask): boolean =>
  ask.level === "none" || given.some((g) => g.scope === ask.scope && (g.level === ask.level || (g.level === "write" && ask.level === "read")));

/** This function gives the asks of a workflow and of each local workflow that it uses, at each depth. */
function asksBelow(name: string, seen = new Set<string>()): Ask[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const text = workflow(name);
  return [...permissionsOf(text, name), ...localUses(text).flatMap((used) => asksBelow(used, seen))];
}

describe("the permissions of the gates that a release uses", () => {
  const release = workflow("release.yml");
  const verify = release.slice(release.indexOf("\n  verify:\n"), release.indexOf("\n  build:\n"));
  const given = permissionsOf(verify, "release.yml");

  it("reads the job verify of release.yml, and the job uses ci.yml", () => {
    expect(verify).toContain("uses: ./.github/workflows/ci.yml");
    expect(given.map((g) => `${g.scope}: ${g.level}`)).toEqual(["contents: read"]);
  });

  it("finds the asks of a block, and stops at the next key of the job", () => {
    const text = ["jobs:", "  a:", "    permissions:", "      contents: read", "      # a note", "      pull-requests: read", "    steps: []", "  b:", "    permissions: {}"].join("\n");
    expect(permissionsOf(text, "x.yml")).toEqual([
      { where: "x.yml a", scope: "contents", level: "read" },
      { where: "x.yml a", scope: "pull-requests", level: "read" },
    ]);
  });

  it("gives no job of ci.yml, or of a workflow that it uses, more than the job verify gives", () => {
    const asks = asksBelow("ci.yml");
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.filter((ask) => !covers(given, ask))).toEqual([]);
  });

  it("finds the ask of the fault, so the test fails on it", () => {
    const fault = permissionsOf(["jobs:", "  site-check:", "    permissions:", "      contents: read", "      pull-requests: read"].join("\n"), "ci.yml");
    expect(fault.filter((ask) => !covers(given, ask))).toEqual([{ where: "ci.yml site-check", scope: "pull-requests", level: "read" }]);
  });
});
