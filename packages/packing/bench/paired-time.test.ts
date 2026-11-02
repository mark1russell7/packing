import { describe, expect, it } from "vitest";
import { aaId, armOrder, childResult, eventProbe, measureIsolated, pairedMarkdown, quantileOf, timeChild, warmRule, type PairedEnv } from "./paired-time.ts";

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
    expect(report.schema).toBe("paired-time/2");
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
    expect(report.schema).toBe("paired-time/2");
    expect([report.passes, report.warm, x.warm]).toEqual([1, undefined, undefined]);
    expect(() => warmRule(report)).toThrow("needs a report of mode fresh");
    expect(report.wallMs).toBeGreaterThanOrEqual(0);
  });

  it("gives the passes to each child, and the warm check of each arm and input (k130)", async () => {
    const started: string[] = [];
    const report = await measureIsolated({
      mode: "fresh",
      repeats: 3,
      warmup: 50,
      passes: 4,
      env: ENV,
      inputs: [{ id: "x" }, { id: "y" }],
      arms: [
        { id: "base", command: ["child", "--arm", "base"] },
        { id: "b", command: ["child", "--arm", "b"] },
      ],
      startChild: async (command, input, warmup, passes) => {
        started.push(`${command[2]} ${input} ${warmup} ${passes}`);
        // The arm b on y does not reach a warm state: its last passes are faster than its first passes
        return { ms: 1, warm: command[2] === "b" && input === "y" ? 0.5 : 1 };
      },
    });
    expect(started.every((x) => x.endsWith(" 50 4"))).toBe(true);
    expect(report.passes).toBe(4);
    const y = report.inputs.find((i) => i.id === "y")!;
    expect(y.warm!["b"]).toBe(0.5);
    expect(Object.keys(y.warm!)).toEqual(["base", "b", "base~aa"]);
    expect(report.warm!["b"]!.inputs).toBe(2);
    // The A/A band is [1, 1], so the warm value 0.5 of b on y is outside it, and the warm values of 1 are not
    expect(report.warm!["b"]!.outside).toBe(0.5);
    expect(report.warm!["base"]!.outside).toBe(0);
    const md = pairedMarkdown(report);
    expect(md).toContain("Each child times 4 passes after its warm-up.");
    expect(md).toContain("| Arm | Inputs | Median | p10 | p90 | Outside |");
    expect(md).toContain("| `b` | 2 |");
    // The warm rule: b has outside 0.5, more than the outside 0 of the A/A arm plus 0.1
    const verdict = warmRule(report);
    expect([verdict.ok, verdict.aaOutside, verdict.inputsWarm]).toEqual([false, 0, 1]);
    expect(verdict.arms["base"]).toEqual({ median: 1, outside: 0, ok: true });
    expect(verdict.arms["b"]!.ok).toBe(false);
    expect(warmRule(report, { arms: ["base"] }).ok).toBe(true);
    expect(warmRule(report, { slack: 0.5, median: [0.7, 1.03] }).ok).toBe(true);
    expect(() => warmRule(report, { arms: ["nope"] })).toThrow("no warm check");
  });
});

describe("the child protocol", () => {
  it("reads the last line of the stdout of a child", () => {
    expect(childResult('log\n{"ms": 1.5}\n')).toEqual({ ms: 1.5 });
    expect(childResult('{"ms": 2, "peakRss": 10}')).toEqual({ ms: 2, peakRss: 10 });
    expect(childResult('{"ms": 2, "warm": 0.98}')).toEqual({ ms: 2, warm: 0.98 });
    expect(childResult('{"ms": 2, "warm": null}')).toEqual({ ms: 2 });
    expect(() => childResult('{"peakRss": 10}')).toThrow("no time");
  });

  it("reads the event counts, and skips the trace lines after the result (k130)", () => {
    expect(childResult('{"ms": 2, "events": {"gc": [1, 3], "deopt": [0, 2]}}\n) (opt id 5) for deoptimization, reason: x]\n')).toEqual({ ms: 2, events: { gc: [1, 3], deopt: [0, 2] } });
    expect(childResult('{"ms": 2, "events": {"gc": [1], "deopt": [0, 2]}}')).toEqual({ ms: 2 });
  });

  it("marks the bounds of the halves outside the timed passes (k130)", () => {
    const at: number[] = [];
    let runs = 0;
    timeChild(() => (runs += 1), 1, undefined, 5, (pass) => at.push(pass, runs));
    // Pass p starts after 1 + p runs. The halves are the passes 0 to 1 and 3 to 4
    expect(at).toEqual([0, 1, 2, 3, 3, 4, 5, 6]);
  });

  it("counts the deopts and the GC events of each half of the passes (k130)", async () => {
    const probe = eventProbe();
    const f = (o: { x: unknown }): unknown => o.x;
    let i = 0;
    const result = timeChild(() => (i++ < 4000 ? f({ x: i }) : f({ x: String(i) })), 4000, undefined, 6, probe.mark);
    const events = await probe.events(6);
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(events.gc.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    expect(events.deopt.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("times one run after the warm-up runs", () => {
    let runs = 0;
    let now = 0;
    const result = timeChild(() => ((runs += 1), (now += runs)), 2, () => now);
    expect(runs).toBe(3);
    expect(result.ms).toBe(3);
    expect(result.peakRss).toBeGreaterThan(0);
    expect(result.warm).toBeUndefined();
  });

  it("times each pass, and gives the median and the warm check (k130)", () => {
    // The passes take 8, 6, 4, 4 and 4 ms after the warm-up: the time goes down in the first half
    const steps = [1, 8, 6, 4, 4, 4];
    let at = 0;
    let now = 0;
    const result = timeChild(() => (now += steps[at++]!), 1, () => now, 5);
    expect(at).toBe(6);
    expect(result.ms).toBe(4);
    // The first 2 passes have the median 7, the last 2 have 4
    expect(result.warm).toBeCloseTo(4 / 7, 12);
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
    expect(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms })).toThrow("1 input or more");
    expect(() => measureIsolated({ mode: "other" as "process", inputs: [{ id: "i" }], repeats: 1, arms })).toThrow("not \"other\"");
    expect(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }], repeats: 1, arms, passes: 2 })).toThrow("option passes is for mode fresh");
    expect(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }], repeats: 1, arms, passes: 0 })).toThrow("passes are a whole number");
  });

  it("refuses a peakRss that an arm gives in mode process", () => {
    const arms = [{ id: "a", run: () => ({ peakRss: 1 }) }];
    expect(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }], repeats: 1, arms, env: ENV })).toThrow("peakRss in mode process");
  });
});
