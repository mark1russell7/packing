import { describe, expect, it } from "vitest";
import { aaId, armOrder, childResult, measureIsolated, pairedMarkdown, quantileOf, timeChild, type PairedEnv } from "./paired-time.ts";

const ENV: PairedEnv = { cpu: "Test CPU 9000", cores: 4, os: "test", arch: "x64", node: "v0.0.0" };

/** This function makes a made-up clock: each run of an arm adds the cost of the arm on the input to the time. */
function fakeClock() {
  let now = 0;
  return { clock: () => now, spend: (ms: number) => (now += ms) };
}

describe("armOrder", () => {
  it("reverses the order in odd rounds of mode process", () => {
    expect([0, 1, 2, 3].map((round) => armOrder(3, round, "process"))).toEqual([
      [0, 1, 2],
      [2, 1, 0],
      [0, 1, 2],
      [2, 1, 0],
    ]);
  });

  it("rotates the order each round of mode fresh", () => {
    expect([0, 1, 2, 3].map((round) => armOrder(3, round, "fresh"))).toEqual([
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
      [0, 1, 2],
    ]);
  });
});

describe("quantileOf", () => {
  it("interpolates between the two nearest values", () => {
    expect(quantileOf([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantileOf([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(quantileOf([], 0.5)).toBeNaN();
  });
});

describe("measureIsolated in mode process", () => {
  // 2 inputs of the group 1 and 2 inputs of the group 2. The value of an input gives the cost of each arm
  const inputs = [
    { id: "i1", group: "1", value: { base: 1, b: 2 } },
    { id: "i2", group: "1", value: { base: 2, b: 4 } },
    { id: "i3", group: "2", value: { base: 1, b: 3 } },
    { id: "i4", group: "2", value: { base: 1, b: 3 } },
  ];
  const calls: string[] = [];
  const { clock, spend } = fakeClock();
  const report = measureIsolated({
    mode: "process",
    inputs,
    repeats: 2,
    warmup: 1,
    clock,
    env: ENV,
    context: "local",
    arms: [
      { id: "base", run: (v: { base: number }) => (calls.push("base"), spend(v.base)) },
      { id: "b", run: (v: { b: number }) => (calls.push("b"), spend(v.b)) },
    ],
  });

  it("adds the A/A arm, and gives the arms in turn with the warm-up runs not timed", () => {
    expect(report.schema).toBe("paired-time/1");
    expect(report.arms).toEqual(["base", "b", aaId("base")]);
    // Round 0 on i1: each arm warms up once and then packs once
    expect(calls.slice(0, 6)).toEqual(["base", "base", "b", "b", "base", "base"]);
    expect(calls).toHaveLength(2 * 4 * 3 * 2);
  });

  it("keeps the raw times, the medians and the ratios of each input", () => {
    const i2 = report.inputs.find((i) => i.id === "i2")!;
    expect(i2.ms).toEqual({ base: [2, 2], b: [4, 4], "base~aa": [2, 2] });
    expect(i2.ratio).toEqual({ b: 2, "base~aa": 1 });
    expect(i2.group).toBe("1");
    expect(i2.peakRss).toBeUndefined();
  });

  it("gives the median, the groups, the group SD, the noise floor and the moved share", () => {
    expect(report.ratios["b"]).toMatchObject({ inputs: 4, median: 2.5, groups: { "1": 2, "2": 3 }, groupMean: 2.5, moved: 1 });
    expect(report.ratios["b"]!.groupSD).toBeCloseTo(Math.SQRT1_2);
    expect(report.noiseFloor).toEqual({ median: 1, p10: 1, p90: 1 });
    expect(report.ratios[aaId("base")]!.moved).toBe(0);
    expect(report.env).toEqual(ENV);
  });

  it("writes a table with the arms and the noise floor", () => {
    const md = pairedMarkdown(report);
    expect(md).toContain("mode `process`, context `local`, on 4 x Test CPU 9000");
    expect(md).toContain("Noise floor (the A/A arm): median 1.000, p10 1.000, p90 1.000.");
    expect(md).toContain("| `b` | 4 | 2.500 | 2.000 | 3.000 | 1.000 | 2.000 | 3.000 | 2.500 | 0.707 |");
  });

  it("gives no A/A arm and no moved share with aa false", () => {
    const { clock: c2, spend: s2 } = fakeClock();
    const plain = measureIsolated({ mode: "process", inputs, repeats: 1, clock: c2, env: ENV, aa: false, arms: [{ id: "base", run: (v: { base: number }) => s2(v.base) }, { id: "b", run: (v: { b: number }) => s2(v.b) }] });
    expect(plain.arms).toEqual(["base", "b"]);
    expect(plain.noiseFloor).toBeNull();
    expect(plain.ratios["b"]!.moved).toBeNull();
    expect(plain.ratios["b"]!.groups).toMatchObject({ "1": 2 });
  });
});

describe("measureIsolated in mode fresh", () => {
  it("starts a child for each arm, input and round, in the rotated order, and keeps the highest peak", async () => {
    const started: string[] = [];
    const report = await measureIsolated({
      mode: "fresh",
      repeats: 2,
      warmup: 3,
      env: ENV,
      context: "ci --flag",
      inputs: [{ id: "x" }, { id: "y" }],
      arms: [
        { id: "base", command: ["child", "--arm", "base"] },
        { id: "b", command: ["child", "--arm", "b"] },
      ],
      startChild: async (command, input, warmup) => {
        started.push(`${command.join(" ")} --input ${input} --warmup ${warmup}`);
        const arm = command[2];
        const round = started.filter((s) => s.startsWith(`child --arm ${arm} `) && s.includes(`--input ${input}`)).length;
        return { ms: arm === "b" ? 4 : 2, peakRss: 1000 * round };
      },
    });
    // Round 0: x takes base, b and base (the A/A arm) in turn, then y. Round 1 starts with b
    expect(started.slice(0, 3)).toEqual(["child --arm base --input x --warmup 3", "child --arm b --input x --warmup 3", "child --arm base --input x --warmup 3"]);
    expect(started[3]).toBe("child --arm base --input y --warmup 3");
    expect(started[6]).toBe("child --arm b --input x --warmup 3");
    expect(started).toHaveLength(12);
    const x = report.inputs.find((i) => i.id === "x")!;
    expect(x.ratio).toEqual({ b: 2, "base~aa": 1 });
    // The A/A arm has the command of the base, so the base command packs 4 times on x
    expect(x.peakRss).toEqual({ base: 4000, b: 2000, "base~aa": 3000 });
    expect(report.mode).toBe("fresh");
    expect(report.ratios["b"]!.groups).toEqual({ all: 2 });
    expect(report.context).toBe("ci --flag");
  });
});

describe("the child protocol", () => {
  it("reads the last line of the stdout of a child", () => {
    expect(childResult('log\n{"ms": 1.5}\n')).toEqual({ ms: 1.5 });
    expect(childResult('{"ms": 2, "peakRss": 10}')).toEqual({ ms: 2, peakRss: 10 });
    expect(() => childResult('{"peakRss": 10}')).toThrow("no time");
  });

  it("times one run after the warm-up runs", () => {
    let runs = 0;
    let now = 0;
    const result = timeChild(() => ((runs += 1), (now += runs)), 2, () => now);
    expect(runs).toBe(3);
    expect(result.ms).toBe(3);
    expect(result.peakRss).toBeGreaterThan(0);
  });
});

describe("the options", () => {
  it("throws a RangeError for a bad option", () => {
    const arms = [{ id: "a", run: () => 0 }];
    expect(() => measureIsolated({ mode: "process", inputs: [], repeats: 0, arms })).toThrow(RangeError);
    expect(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms: [] })).toThrow(RangeError);
    expect(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms, aa: false })).toThrow(RangeError);
    expect(() => measureIsolated({ mode: "fresh", inputs: [], repeats: 1, arms })).toThrow("no command");
    expect(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }, { id: "i" }], repeats: 1, arms })).toThrow("inputs are not unique");
  });
});
