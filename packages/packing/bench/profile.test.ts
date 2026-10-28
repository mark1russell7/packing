import { describe, expect, it } from "vitest";
import { parseTimeRecords, profileMarkdown, profileTable, shortUrl, slowestInputs, type CpuProfile, type TimeRecord } from "./profile.ts";

const rec = (strategy: string, input: string, ms: number, skipped?: string): TimeRecord => ({ strategy, input, ms, ...(skipped === undefined ? {} : { skipped }) });

describe("slowestInputs", () => {
  const records = [
    rec("cand", "a", 40, undefined),
    rec("rows", "a", 10),
    rec("cand", "b", 30),
    rec("rows", "b", 1),
    rec("cand", "c", 6),
    rec("rows", "c", 2),
    rec("cand", "d", 9, "unsupported containerShape: circle"),
    rec("rows", "d", 1),
    rec("cand", "e", 5),
  ];

  it("orders the inputs by the ratio with the floor of the time test, highest first", () => {
    // b: 30 / max(1, 5 / 1.5) = 9, a: 40 / 10 = 4, c: 6 / (5 / 1.5) = 1.8
    const out = slowestInputs(records, "cand", "rows", 10);
    expect(out.map((s) => s.input)).toEqual(["b", "a", "c"]);
    expect(out[0]!.ratio).toBeCloseTo(9, 9);
    expect(out[1]).toEqual({ input: "a", candidate: 40, current: 10, ratio: 4 });
  });

  it("keeps only n inputs, and leaves out skipped records and inputs without a default time", () => {
    expect(slowestInputs(records, "cand", "rows", 1).map((s) => s.input)).toEqual(["b"]);
    expect(slowestInputs(records, "cand", "rows", 10).some((s) => s.input === "d" || s.input === "e")).toBe(false);
  });

  it("uses no floor when the floor is 0, and orders a tie by the input id", () => {
    const tie = [rec("x", "q", 4), rec("y", "q", 2), rec("x", "p", 2), rec("y", "p", 1)];
    expect(slowestInputs(tie, "x", "y", 5, 0).map((s) => [s.input, s.ratio])).toEqual([
      ["p", 2],
      ["q", 2],
    ]);
  });

  it("reads the lines of a records file", () => {
    expect(parseTimeRecords(`${JSON.stringify(rec("x", "p", 2))}\n\n${JSON.stringify(rec("y", "p", 1))}\n`)).toHaveLength(2);
  });
});

const frame = (functionName: string, url = "", lineNumber = -1) => ({ functionName, url, lineNumber, columnNumber: 0, scriptId: "0" });

// A made-up profile: root > main > (score, cut), cut > cut (recursion), root > (garbage collector), root > (program)
const profile: CpuProfile = {
  nodes: [
    { id: 1, callFrame: frame("(root)"), children: [2, 6, 7] },
    { id: 2, callFrame: frame("main", "file:///w/packages/packing/src/maxrects.ts", 231), children: [3, 4] },
    { id: 3, callFrame: frame("score", "file:///w/packages/packing/src/maxrects.ts", 305), positionTicks: [{ line: 310, ticks: 3 }] },
    { id: 4, callFrame: frame("cut", "file:///w/packages/packing/src/maxrects.ts", 89), children: [5], positionTicks: [{ line: 118, ticks: 1 }] },
    { id: 5, callFrame: frame("cut", "file:///w/packages/packing/src/maxrects.ts", 89), positionTicks: [{ line: 118, ticks: 1 }] },
    { id: 6, callFrame: frame("(garbage collector)") },
    { id: 7, callFrame: frame("(program)") },
  ],
  startTime: 0,
  endTime: 8000,
  // Each sample has 1000 us
  samples: [3, 3, 3, 4, 5, 6, 6, 7],
  timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
};

describe("profileTable", () => {
  const t = profileTable(profile, 25, (url) => (url.endsWith("maxrects.ts") ? Array.from({ length: 400 }, (_, i) => `  line ${i + 1}  `) : undefined));

  it("gives the self time of each function and keeps the pseudo-nodes", () => {
    expect(t.totalMs).toBe(8);
    expect(t.samples).toBe(8);
    expect(t.gcPercent).toBe(25);
    expect(t.self.map((r) => [r.name, r.ms, r.percent])).toEqual([
      ["score", 3, 37.5],
      ["(garbage collector)", 2, 25],
      ["cut", 2, 25],
      ["(program)", 1, 12.5],
    ]);
    expect(t.self[0]!.where).toBe("src/maxrects.ts:306");
    expect(t.self[1]!.where).toBe("");
  });

  it("counts a recursive function once in its total time, and leaves the pseudo-nodes out of the total table", () => {
    expect(t.total.map((r) => [r.name, r.ms])).toEqual([
      ["main", 5],
      ["score", 3],
      ["cut", 2],
    ]);
  });

  it("gives the self time of each file and the samples of each source line with its text", () => {
    expect(t.files.map((r) => [r.name, r.ms])).toEqual([
      ["src/maxrects.ts", 5],
      ["(garbage collector)", 2],
      ["(program)", 1],
    ]);
    expect(t.lines.map((r) => [r.name, r.where, r.ticks, r.percent, r.text])).toEqual([
      ["score", "src/maxrects.ts:310", 3, 37.5, "line 310"],
      ["cut", "src/maxrects.ts:118", 2, 25, "line 118"],
    ]);
  });

  it("keeps only the top rows", () => {
    expect(profileTable(profile, 1).self).toHaveLength(1);
  });

  it("gives an empty table for a profile without samples", () => {
    const empty = profileTable({ ...profile, samples: [], timeDeltas: [] });
    expect([empty.totalMs, empty.gcPercent, empty.self.length]).toEqual([0, 0, 0]);
  });
});

describe("shortUrl", () => {
  it("gives the path in the package, or in node_modules", () => {
    expect(shortUrl("file:///D:/w/packages/packing/src/space.ts")).toBe("src/space.ts");
    expect(shortUrl("file:///w/node_modules/@mark1russell7/layout-contract/src/a.ts")).toBe("@mark1russell7/layout-contract/src/a.ts");
    expect(shortUrl("node:internal/main")).toBe("node:internal/main");
  });
});

describe("profileMarkdown", () => {
  it("writes the times, the GC share and the tables", () => {
    const md = profileMarkdown({
      corpus: "c",
      strategy: "cand",
      current: "rows",
      repeats: 3,
      warmup: 1,
      intervalUs: 200,
      flags: ["--no-turbo-inlining"],
      times: [
        { input: "a|b\\c", items: 10, candidate: 1, current: 1, ratio: 0.3 },
        { input: "a", items: 1000, candidate: 40, current: 10, ratio: 4, recordRatio: 5 },
        { input: "b", items: 1000, candidate: 20, current: 2, ratio: 6 },
      ],
      table: profileTable(profile),
    });
    expect(md).toContain("The garbage collector has **25%** of the time.");
    expect(md).toContain("| median of the inputs | 20 | 2 | 4 |");
    expect(md).toContain("| median at 1000 items (2 inputs) | 30 | 6 | 5 |");
    expect(md).toContain("| a | 1000 | 40 | 10 | 4 | 5 |");
    expect(md).toContain("| a\\|b\\\\c | 10 | 1 | 1 | 0.3 |  |");
    expect(md).toContain("| 1 | score | src/maxrects.ts:306 | 3 | 37.5 |");
    expect(md).toContain("The top 3 functions by total time");
    expect(md).toContain("The flags of Node.js: `--no-turbo-inlining`.");
  });
});
