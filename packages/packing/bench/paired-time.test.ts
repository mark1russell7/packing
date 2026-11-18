import { describe, expect, it } from "vitest";
import { armOrder } from "@mark1russell7/rigor-bench";
import type { StartChild } from "@mark1russell7/rigor-bench/fresh";
import { aaId, armPosition, assertPairedOrder, firstSide, measureIsolated, pairedMarkdown, quantileOf, warmRule, type PairedEnv } from "./paired-time.ts";
import { pairRecords as budgetPairs } from "./time-budget.ts";
import { pairRecords as gatePairs } from "./time-gate.ts";

const ENV: PairedEnv = { cpu: "Test CPU 9000", cores: 4, os: "test", arch: "x64", node: "v0.0.0" };

/** This function makes a made-up clock: each call of an arm adds the cost of the arm on the input to the time. */
function fakeClock() {
  let now = 0;
  return { clock: () => now, spend: (ms: number) => (now += ms) };
}

describe("assertPairedOrder", () => {
  it("accepts a report of schema 3 or 4, and refuses each older schema with its name", () => {
    expect(() => assertPairedOrder({ schema: "paired-time/3" })).not.toThrow();
    expect(() => assertPairedOrder({ schema: "paired-time/4" })).not.toThrow();
    for (const schema of ["paired-time/1", "paired-time/2"]) {
      expect(() => assertPairedOrder({ schema } as unknown as { schema: "paired-time/3" })).toThrow(new RegExp(`the schema ${schema}`));
    }
  });
});

describe("quantileOf", () => {
  it("interpolates between the two nearest values", () => {
    expect(quantileOf([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantileOf([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(quantileOf([], 0.5)).toBeNaN();
  });

  it("gives the same bits as the local copy before the move to rigor, on made-up lists", () => {
    // The local copy of quantileOf before k219, as the oracle.
    const before = (values: readonly number[], q: number): number => {
      const sorted = values.toSorted((a, b) => a - b);
      const at = (sorted.length - 1) * q;
      const low = Math.floor(at);
      const high = Math.ceil(at);
      return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
    };
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let checked = 0;
    for (let list = 0; list < 400; list++) {
      const count = 1 + Math.floor(next() * 40);
      // Some lists repeat values, so that two nearest values can be equal.
      const values = Array.from({ length: count }, () => (next() < 0.3 ? Math.floor(next() * 4) : next() * 1000 - 200));
      for (const q of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1, next()]) {
        expect(Object.is(quantileOf(values, q), before(values, q)), `list ${list} q ${q}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(4000);
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
      { id: "base", run: (v: { base: number }) => spend(v.base) },
      { id: "b", run: (v: { b: number }) => spend(v.b) },
    ],
  });

  it("adds the A/A arm, and turns the arms of each input by its index (timeArmRounds of rigor-bench)", () => {
    expect(report.schema).toBe("paired-time/4");
    expect(report.arms).toEqual(["base", "b", aaId("base")]);
    // The input 0 starts with the base, and the input 1 with the arm b. Round 1 is the reverse of round 0
    expect(report.inputs[0]!.orders).toEqual([
      ["base", "b", "base~aa"],
      ["base~aa", "b", "base"],
    ]);
    expect(report.inputs[1]!.orders).toEqual([
      ["b", "base~aa", "base"],
      ["base", "base~aa", "b"],
    ]);
  });

  it("keeps the time of one call of each round, with the warm-up batches not timed", () => {
    // The base sets 8 calls for a batch on i2 (8 x 2 ms = 16 ms), so the time of a batch over its calls is the cost of one call
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
    expect(md).toContain("- Schema `paired-time/4`, mode `process`, context `local`, on 4 x Test CPU 9000");
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

/** This function makes the start of a child for a test: it keeps the argv of each child, and prints the line that `line` gives. */
function fakeStart(line: (argv: readonly string[], started: readonly string[]) => object): { started: string[]; start: StartChild } {
  const started: string[] = [];
  const start: StartChild = async (argv) => {
    started.push(argv.join(" "));
    return { stdout: `${JSON.stringify(line(argv, started))}\n`, stderr: "", code: 0 };
  };
  return { started, start };
}

/** This function gives the value of an option of the argv of a child. */
const argOf = (argv: readonly string[], name: string): string => argv[argv.indexOf(name) + 1]!;

describe("measureIsolated in mode fresh", () => {
  it("starts a child for each arm, input and round with freshRun of rigor-bench, and keeps the order and the highest peak", async () => {
    const { started, start } = fakeStart((argv, all) => {
      const arm = argv[2]!;
      const input = argOf(argv, "--input");
      const round = all.filter((s) => s.startsWith(`child --arm ${arm} `) && s.includes(`--input ${input} `)).length;
      return { ms: arm === "b" ? 4 : 2, peakRss: 1000 * round };
    });
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
      start,
    });
    // Round 0: x takes base, b and base (the A/A arm) in turn. The input y turns the arms by 1, so it starts with b
    expect(started.slice(0, 3)).toEqual(["child --arm base --input x --warmup 3", "child --arm b --input x --warmup 3", "child --arm base --input x --warmup 3"]);
    expect(started[3]).toBe("child --arm b --input y --warmup 3");
    // Round 1 is the reverse: the A/A arm, b and base
    expect(started.slice(6, 9)).toEqual(["child --arm base --input x --warmup 3", "child --arm b --input x --warmup 3", "child --arm base --input x --warmup 3"]);
    expect(started).toHaveLength(12);
    const x = report.inputs.find((i) => i.id === "x")!;
    expect(x.ratio).toEqual({ b: 2, "base~aa": 1 });
    expect(x.orders).toEqual([
      ["base", "b", "base~aa"],
      ["base~aa", "b", "base"],
    ]);
    expect(report.inputs.find((i) => i.id === "y")!.orders).toEqual([
      ["b", "base~aa", "base"],
      ["base", "base~aa", "b"],
    ]);
    // The A/A arm has the command of the base, so the base command packs 4 times on x
    expect(x.peakRss).toEqual({ base: 4000, b: 2000, "base~aa": 3000 });
    expect(report.mode).toBe("fresh");
    expect(report.ratios["b"]!.groups).toEqual({ all: 2 });
    expect(report.context).toBe("ci --flag");
    expect(report.schema).toBe("paired-time/4");
    expect([report.passes, report.warm, x.warm]).toEqual([1, undefined, undefined]);
    expect(() => warmRule(report)).toThrow("needs a report of mode fresh");
    expect(report.wallMs).toBeGreaterThanOrEqual(0);
  });

  it("gives the passes to each child, and the warm check of each arm and input (k130)", async () => {
    // The arm b on y does not reach a warm state: its last passes are faster than its first passes
    const { started, start } = fakeStart((argv) => ({ ms: 1, warm: argv[2] === "b" && argOf(argv, "--input") === "y" ? 0.5 : 1 }));
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
      start,
    });
    expect(started.every((x) => x.endsWith(" --warmup 50 --passes 4"))).toBe(true);
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

  it("sums the GC events and the deopts of the children of each arm, and keeps no events without the deopt counts (k130)", async () => {
    const { start } = fakeStart((argv) => ({ ms: 1, events: argv[2] === "b" ? { gc: [1, 2], gcMs: [0.5, 0.5], deopt: [0, 1] } : { gc: [1, 1] } }));
    const arms = [
      { id: "base", command: ["child", "--arm", "base"] },
      { id: "b", command: ["child", "--arm", "b"] },
    ];
    const report = await measureIsolated({ mode: "fresh", repeats: 2, env: ENV, inputs: [{ id: "x" }], arms, start });
    expect(report.inputs[0]!.events).toEqual({ b: { gc: [2, 4], deopt: [0, 2] } });
  });

  it("stops on a child that skips an input or prints no time", async () => {
    const arms = [
      { id: "base", command: ["child", "--arm", "base"] },
      { id: "b", command: ["child", "--arm", "b"] },
    ];
    const skip = fakeStart(() => ({ skipped: "no support" }));
    await expect(measureIsolated({ mode: "fresh", repeats: 1, env: ENV, inputs: [{ id: "x" }], arms, start: skip.start })).rejects.toThrow("skipped an input");
    const none = fakeStart(() => ({ peakRss: 10 }));
    await expect(measureIsolated({ mode: "fresh", repeats: 1, env: ENV, inputs: [{ id: "x" }], arms, start: none.start })).rejects.toThrow("printed no good JSON line");
  });
});

describe("the first arm of a pair (R13)", () => {
  // The bug: a reader that takes the first arm from armOrder(report.arms, round) skips the turn by the input of freshRun.
  // Each child prints a time 1 ms longer than the child before it, so the arm with the lower time started first.
  const arms = ["base", "b", "c"].map((id) => ({ id, command: ["child", "--arm", id] }));
  const inputs = ["x", "y", "z"].map((id) => ({ id }));
  const made = (async () => {
    const { start } = fakeStart((_argv, all) => ({ ms: all.length }));
    return measureIsolated({ mode: "fresh", repeats: 8, env: ENV, inputs, arms, start });
  })();

  it("gives the arm that started first in each record of the gate and of the time budget", async () => {
    const report = await made;
    let checked = 0;
    for (const arm of ["b", "c", aaId("base")]) {
      for (const r of [...gatePairs(report, report.inputs, arm), ...budgetPairs(report, "base", arm, 0)]) {
        expect(r.first, `${arm} on ${r.case}, round ${r.round}`).toBe(r.a < r.b ? "a" : "b");
        checked += 1;
      }
    }
    expect(checked).toBe(2 * 3 * 3 * 8);
  });

  it("differs from the first arm of armOrder without the turn, so the test finds the bug", async () => {
    const report = await made;
    const old = (round: number, arm: string): "a" | "b" => {
      const order = armOrder(report.arms, round);
      return order.indexOf("base") < order.indexOf(arm) ? "a" : "b";
    };
    const rounds = [0, 1, 2, 3, 4, 5, 6, 7];
    const wrong = report.inputs.flatMap((input) => rounds.filter((round) => old(round, "b") !== firstSide(report, input, round, ["base"], "b")));
    expect(wrong.length).toBeGreaterThan(0);
  });

  it("reads a stored report of schema 3 with armOrder, and refuses a report of schema 4 without the order of a round", () => {
    const three = { schema: "paired-time/3" as const, arms: ["base", "b", "base~aa"] };
    expect([0, 1, 2, 3].map((r) => armPosition(three, { id: "x" }, r, "b"))).toEqual([0, 1, 2, 3].map((r) => armOrder(three.arms, r).indexOf("b")));
    expect(() => armPosition({ schema: "paired-time/4", arms: three.arms }, { id: "x" }, 0, "b")).toThrow("The input x of the report has no order of the round 0.");
    expect(armPosition({ schema: "paired-time/4", arms: three.arms }, { id: "x", orders: [["b", "base"]] }, 0, "base~aa")).toBe(-1);
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
