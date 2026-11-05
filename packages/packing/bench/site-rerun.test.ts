import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string): string => readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8");
const rerun = workflow("site-rerun.yml");
const siteData = workflow("site-data.yml");
const predictions = readFileSync(new URL("./predictions.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as { id: string; set: string });

/** A job of the rerun, as its name and the lines of its block. */
interface RerunJob {
  readonly name: string;
  readonly text: string;
}

function rerunJobs(): RerunJob[] {
  const body = rerun.slice(rerun.indexOf("\njobs:\n"));
  return [...body.matchAll(/^ {2}([a-z0-9-]+):\n((?: {4}.*\n|\n)+)/gm)].map((m) => ({ name: m[1]!, text: m[2]! }));
}

const value = (job: RerunJob, key: string): string | undefined => new RegExp(`^ +${key}: (.+)$`, "m").exec(job.text)?.[1];

describe("the weekly rerun of the corpora of the site", () => {
  const jobs = rerunJobs();

  it("has five jobs, each with a corpus", () => {
    expect(jobs.length).toBe(5);
    for (const job of jobs) expect(value(job, "corpus")).toMatch(/^pack-[a-z0-9-]+$/);
  });

  it("packs the same corpora as the files of site-data.yml, with the weekly coverage run as the sixth and the corpus of steps as a row only", () => {
    const body = siteData.slice(siteData.indexOf('case "$corpus" in'), siteData.indexOf("esac"));
    const cases = [...body.matchAll(/^ +((?:pack-[a-z0-9-]+)(?: \| pack-[a-z0-9-]+)*)\)$/gm)].flatMap((m) => m[1]!.split(" | "));
    expect(cases.sort()).toEqual([...jobs.map((job) => value(job, "corpus")!), "pack-classes-v1", "pack-change-v1"].sort());
    const listed = /^ +SITE_CORPORA: (.+)$/m.exec(siteData)?.[1]?.split(" ");
    expect(listed?.sort()).toEqual([...cases].sort());
  });

  it("packs one corpus at a time, and a failed corpus does not stop the next one", () => {
    expect(value(jobs[0]!, "needs")).toBeUndefined();
    for (let i = 1; i < jobs.length; i++) {
      expect(value(jobs[i]!, "needs")).toBe(jobs[i - 1]!.name);
      expect(value(jobs[i]!, "if")).toBe("${{ !cancelled() }}");
    }
  });

  it("gives each pair a wall budget, no sample, and a job limit under the limit of a runner", () => {
    for (const job of jobs) {
      expect(value(job, "budget")).toBe("true");
      expect(value(job, "sample")).toBe('"0"');
      expect(Number(value(job, "job-minutes")?.replaceAll('"', ""))).toBeLessThanOrEqual(350);
    }
  });

  it("names a prediction of the same corpus in each job", () => {
    for (const job of jobs) {
      const row = predictions.find((p) => p.id === value(job, "prediction"));
      expect(row?.set).toBe(value(job, "corpus"));
    }
  });

  it("starts the writer of the files, and only a scheduled run gives data", () => {
    expect(rerun).toMatch(/^name: Site rerun$/m);
    expect(siteData).toContain('workflows: ["Coverage nightly", "Site rerun"]');
    expect(siteData).toContain("github.event.workflow_run.event == 'schedule'");
  });

  it("does not run on a push or a pull request, because the run takes about 15 hours", () => {
    const on = rerun.slice(rerun.indexOf("\non:\n"), rerun.indexOf("\npermissions:"));
    expect(on).toMatch(/schedule:/);
    expect(on).not.toMatch(/\bpush:|\bpull_request:/);
  });
});
