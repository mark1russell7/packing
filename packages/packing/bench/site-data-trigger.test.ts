import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The condition of the job snapshot of site-data.yml (k185). A filter on the event of the weekly run lost the point of
// dispatch 41993720877: it measured for 8 hours, and site-data run 42065611011 skipped it. A point is a measure, whatever started it.

const workflow = (name: string): string => readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");
const siteData = workflow("site-data.yml");

/** This function gives the condition of the job snapshot, as one line. */
function snapshotCondition(text: string): string {
  const job = text.slice(text.indexOf("\n  snapshot:\n"));
  const m = /\n {4}if: >-\n((?: {6}.*\n)+)/.exec(job);
  if (m === null) throw new Error("The job snapshot of site-data.yml has no condition `if: >-`.");
  return m[1]!.split("\n").map((line) => line.trim()).filter((line) => line !== "").join(" ");
}

/** This function gives the names of the triggers of a workflow: the keys under `on:`. */
function triggersOf(text: string): string[] {
  const block = /\non:\n((?: {2}.*\n|\n)+)/.exec(text)?.[1] ?? "";
  return [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]!);
}

describe("the condition of the site data job", () => {
  const condition = snapshotCondition(siteData);

  it("takes a manual start, and each run of the weekly workflows on main that was not cancelled", () => {
    expect(condition).toBe(
      "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || " +
        "(github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.conclusion != 'cancelled'))",
    );
  });

  it("does not filter on the event of the weekly run, so a dispatch gives its point", () => {
    expect(condition).not.toMatch(/workflow_run\.event/);
  });

  it("reads the start of each run and gives it to the coverage point", () => {
    expect(siteData).toMatch(/gh run view "\$run" .*--json status,headBranch,createdAt,event /);
    expect(siteData).toMatch(/node bench\/snapshot\.ts coverage "\$folder" "\$\{origin\[@\]\}" --event "\$event" /);
  });

  it("gives the held-out sample of a coverage run to the coverage point", () => {
    // The point of dispatch 41993720877 lost its read of the whole space, because the step read only the grid artifact (k188).
    // A here-string, not a pipe: with pipefail, an early exit of grep -q can fail the pipe and hide the artifact.
    expect(siteData).toMatch(/artifacts="\$\(gh api --paginate "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$run\/artifacts" -q '\.artifacts\[\]\.name'\)"\n/);
    expect(siteData).toMatch(/grep -qxF nightly-held-out <<<"\$artifacts"; then\n {18}gh run download "\$run" -R "\$GITHUB_REPOSITORY" -n nightly-held-out -D "\$RUNNER_TEMP\/held-out\/\$corpus"\n {18}sample_args=\(--sample "\$RUNNER_TEMP\/held-out\/\$corpus"\)\n/);
    expect(siteData).toMatch(/node bench\/snapshot\.ts coverage .* "\$\{sample_args\[@\]\}"\n/);
  });

  it("starts from the two weekly workflows, which start only from the schedule or a dispatch", () => {
    expect(/workflows: \["Coverage nightly", "Site rerun"\]/.test(siteData)).toBe(true);
    for (const name of ["coverage-nightly.yml", "site-rerun.yml"]) expect(triggersOf(workflow(name)).sort(), name).toEqual(["schedule", "workflow_dispatch"]);
  });
});

describe("the reader of the condition", () => {
  it("finds the old filter on the event", () => {
    const old = [
      "jobs:",
      "  snapshot:",
      "    if: >-",
      "      github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' ||",
      "      (github.event.workflow_run.event == 'schedule' && github.event.workflow_run.conclusion != 'cancelled'))",
      "    runs-on: ubuntu-latest",
      "",
    ].join("\n");
    expect(snapshotCondition(old)).toMatch(/workflow_run\.event == 'schedule'/);
  });

  it("refuses a job with no condition", () => {
    expect(() => snapshotCondition("jobs:\n  snapshot:\n    runs-on: ubuntu-latest\n")).toThrow(/no condition/);
  });
});
