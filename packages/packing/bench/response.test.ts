import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { heldOutError, heldOutErrorAt, parseResponseRecord, type ResponseData } from "@mark1russell7/rigor-statistics";
import { afterAll, describe, expect, it } from "vitest";
import type { CoverageManifest, CoverageRecord } from "./coverage.ts";
import { coverageResponseData, fitCoverageResponse, responseMain } from "./response.ts";

// The export of roadmap item k143, on made-up records. The test reads no time of a run.

const STRATEGIES = ["rows", "maxrects-bl"];

/** A made-up corpus of two families. Each spec has `seeds` seeds. The params come from `params`. */
function madeUp(specs: readonly { generator: string; params: Record<string, unknown> }[], seeds: readonly number[] = [1, 2, 3]): { manifest: CoverageManifest; records: CoverageRecord[] } {
  const inputs: { id: string; cell: Record<string, string> }[] = [];
  const records: CoverageRecord[] = [];
  specs.forEach((spec, at) => {
    for (const s of seeds) {
      const id = `toy-v1/${spec.generator}.${at}/s${s}`;
      inputs.push({ id, cell: { mode: "offline" } });
      for (const strategy of STRATEGIES) {
        const count = Number(spec.params["count"] ?? 10);
        const fill = (strategy === "rows" ? 0.5 : 0.7) + count * 0.001 + s * 0.00001;
        records.push({ strategy, input: id, measures: { "pack.fill": fill, "pack.gap": 1 - fill }, ms: count * (strategy === "rows" ? 0.01 : 0.1) });
      }
    }
  });
  return { manifest: { corpus: "toy-v1", specs: specs.map((s) => ({ ...s, version: 1, seeds })), inputs }, records };
}

/** The specs of a grid of two classes and three counts in one family for each class. */
const grid = (): { generator: string; params: Record<string, unknown> }[] =>
  ["a", "b"].flatMap((name) => [10, 100, 200].map((count) => ({ generator: name === "a" ? "first" : "second", params: { class: name, count, mode: "fixed" } })));

const dimension = (data: ResponseData, id: string): ResponseData["dimensions"][number] | undefined => data.dimensions.find((d) => d.id === id);

describe("the dimensions", () => {
  it("has the strategy and each param with two levels or more, and a number param is ordinal", () => {
    const { manifest, records } = madeUp(grid());
    const data = coverageResponseData(records, manifest);
    expect(data.dimensions.map((d) => d.id)).toEqual(["strategy", "class", "count"]);
    expect(dimension(data, "strategy")).toMatchObject({ kind: "categorical", levels: ["maxrects-bl", "rows"] });
    expect(dimension(data, "class")).toMatchObject({ kind: "categorical", levels: ["a", "b"] });
    expect(dimension(data, "count")).toMatchObject({ kind: "ordinal", levels: [10, 100, 200] });
  });

  it("leaves out the family when the params tell it", () => {
    const { manifest, records } = madeUp(grid());
    expect(dimension(coverageResponseData(records, manifest), "family")).toBeUndefined();
  });

  it("has the family when two families have the same params", () => {
    const { manifest, records } = madeUp([10, 20, 30].flatMap((count) => ["first", "second"].map((generator) => ({ generator, params: { count } }))));
    const data = coverageResponseData(records, manifest);
    expect(dimension(data, "family")).toMatchObject({ kind: "categorical", levels: ["first@1", "second@1"] });
    expect(data.points[0]!.values["family"]).toBe("first@1");
  });

  it("gives a param of some families a condition on the family", () => {
    const { manifest, records } = madeUp([
      { generator: "first", params: { count: 10, tall: 1 } },
      { generator: "first", params: { count: 20, tall: 2 } },
      { generator: "second", params: { count: 10 } },
      { generator: "second", params: { count: 20 } },
    ]);
    const data = coverageResponseData(records, manifest);
    expect(dimension(data, "tall")).toMatchObject({ kind: "ordinal", when: { dimension: "family", levels: ["first@1"] } });
    const second = data.points.find((p) => p.values["family"] === "second@1")!;
    expect(second.values["tall"]).toBeNull();
  });

  it("refuses a param with the name of a dimension of the record", () => {
    const { manifest, records } = madeUp([{ generator: "first", params: { strategy: "x" } }, { generator: "first", params: { strategy: "y" } }]);
    expect(() => coverageResponseData(records, manifest)).toThrow("The param strategy");
  });
});

describe("the points", () => {
  it("has one point for each record, in one group for each spec, with 4 significant digits", () => {
    const { manifest, records } = madeUp(grid());
    const data = coverageResponseData(records, manifest);
    expect(data.points).toHaveLength(records.length);
    expect(new Set(data.points.map((p) => p.group)).size).toBe(6);
    expect(data.points[0]).toMatchObject({ id: "rows|toy-v1/first.0/s1", group: "toy-v1/first.0", values: { strategy: "rows", class: "a", count: 10 }, measures: { "pack.fill": 0.51, ms: 0.1 } });
  });

  it("keeps the first seeds of each spec", () => {
    const { manifest, records } = madeUp(grid());
    const data = coverageResponseData(records, manifest, { seeds: 2 });
    expect(data.points).toHaveLength((records.length / 3) * 2);
    expect(data.points.some((p) => p.id.endsWith("/s3"))).toBe(false);
  });

  it("gives a skipped record a reason, and leaves out a record of another input", () => {
    const { manifest, records } = madeUp(grid());
    const input = manifest.inputs![0]!.id;
    const data = coverageResponseData([...records, { strategy: "push", input, skipped: "unsupported mode: offline" }, { strategy: "rows", input: "other/x/s1", ms: 1 }], manifest);
    expect(data.points).toHaveLength(records.length + 1);
    expect(data.reasons).toEqual([{ id: "skipped", label: "The strategy skipped the input" }]);
    const skipped = data.points.at(-1)!;
    expect(skipped.measures["pack.fill"]).toBeNull();
    expect(skipped.absent?.["pack.fill"]).toBe("skipped");
  });

  it("has no reasons with no skipped record", () => {
    const { manifest, records } = madeUp(grid());
    expect(coverageResponseData(records, manifest).reasons).toBeUndefined();
  });
});

describe("the measures", () => {
  it("leaves out a measure with no value, and it gives the direction and the unit", () => {
    const { manifest, records } = madeUp(grid());
    const data = coverageResponseData(records, manifest);
    expect(data.measures.map((m) => m.id)).toEqual(["pack.fill", "pack.gap", "ms"]);
    expect(data.measures[0]).toMatchObject({ direction: "higher", unit: "share", range: [0, 1] });
    expect(data.measures[2]).toEqual({ id: "ms", label: "time", unit: "ms", direction: "lower" });
  });

  it("leaves out the range when a value is outside it", () => {
    const { manifest, records } = madeUp(grid());
    const old = records.map((r, i) => (i === 0 ? { ...r, measures: { ...r.measures, "pack.gap": 2.5 } } : r));
    const gap = coverageResponseData(old, manifest).measures.find((m) => m.id === "pack.gap")!;
    expect(gap.range).toBeUndefined();
  });
});

describe("the record", () => {
  const { manifest, records } = madeUp(grid());
  const data = coverageResponseData(records, manifest);
  const record = fitCoverageResponse(data);

  it("passes the validator of the format", () => {
    const parsed = parseResponseRecord(JSON.parse(JSON.stringify(record)));
    expect(parsed.ok).toBe(true);
  });

  it("has a model for each measure, with the time on a log scale", () => {
    expect(record.models.map((m) => m.measure)).toEqual(["pack.fill", "pack.gap", "ms"]);
    expect(record.models.find((m) => m.measure === "ms")?.scale).toBe("log");
    expect(record.models.find((m) => m.measure === "pack.fill")?.scale).toBe("linear");
  });

  it("holds out a whole spec in each fold, and it gives the error of each fold and of a chosen set", () => {
    const groups = new Map(data.points.map((p) => [p.id, p.group]));
    const inFolds = record.folds.map((f) => new Set(f.heldOut.map((id) => groups.get(id))));
    expect(new Set(inFolds.flatMap((s) => [...s])).size).toBe(6);
    expect(inFolds.flatMap((s) => [...s])).toHaveLength(6);
    expect(heldOutError(record, "pack.fill").n).toBe(data.points.length);
    const rows = data.points.filter((p) => p.values["strategy"] === "rows").map((p) => p.id);
    expect(heldOutErrorAt(record, "pack.fill", rows).n).toBe(rows.length);
  });

  it("gives the same bytes from the same data", () => {
    expect(JSON.stringify(fitCoverageResponse(data))).toBe(JSON.stringify(record));
  });

  it("drops the products when they pass the limit of terms", () => {
    const wide = Array.from({ length: 600 }, (_, i) => `s${i}`);
    const many = grid().flatMap((s) => [1, 2, 3].map((part) => ({ ...s, params: { ...s.params, part } })));
    const { manifest: m, records: r } = madeUp(many, [1]);
    const widened = r.map((x, i) => ({ ...x, strategy: wide[i % wide.length]! }));
    const fitted = fitCoverageResponse(coverageResponseData(widened, m), { folds: 3 });
    expect(fitted.models.length).toBe(3);
  });
});

describe("the command", () => {
  const dir = mkdtempSync(join(tmpdir(), "response-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (specs: ReturnType<typeof grid>): { records: string; corpus: string } => {
    const { manifest, records } = madeUp(specs);
    const files = { records: join(dir, "records.jsonl"), corpus: join(dir, "corpus.json") };
    writeFileSync(files.records, records.map((r) => JSON.stringify(r)).join("\n"));
    writeFileSync(files.corpus, JSON.stringify(manifest));
    return files;
  };

  it("writes the record, with the run in its name", () => {
    const files = write(grid());
    const out = join(dir, "out", "response.json");
    const record = responseMain(["--records", files.records, "--corpus", files.corpus, "--out", out, "--run", "7", "--seeds", "2", "--folds", "3"]);
    expect(record?.name).toBe("toy-v1, run 7");
    expect(record?.folds).toHaveLength(3);
    expect(parseResponseRecord(JSON.parse(readFileSync(out, "utf8"))).ok).toBe(true);
  });

  it("writes no file with fewer than 3 specs", () => {
    const files = write(grid().slice(0, 2));
    const out = join(dir, "none.json");
    expect(responseMain(["--records", files.records, "--corpus", files.corpus, "--out", out])).toBeUndefined();
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a missing file option and a bad count", () => {
    expect(() => responseMain(["--records", "x"])).toThrow("Start the export");
    const files = write(grid());
    expect(() => responseMain(["--records", files.records, "--corpus", files.corpus, "--out", join(dir, "x.json"), "--seeds", "0"])).toThrow("--seeds");
  });
});
