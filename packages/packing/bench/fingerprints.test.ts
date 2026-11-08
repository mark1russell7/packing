import { REFUSED_PROBE } from "@mark1russell7/layout-contract";
import { allStrategies, UnsupportedCell, type PackOutput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { STRATEGY_FINGERPRINT } from "../src/strategy-fingerprint.ts";
import { blindFindings, compareReads, familyCounts, familyModes, packProbe, PROBE_COUNTS, PROBE_FAMILIES, probes, readStrategy, widerFirst, type ProbePack } from "./fingerprints.ts";

const LIST = probes();

const plain: ProbePack = packProbe;

describe("probes", () => {
  it("has a probe for each family at each count in its range, with unique ids", () => {
    const ids = LIST.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const family of PROBE_FAMILIES) {
      const base = `${family.name}@${family.version}`;
      const own = LIST.filter((p) => p.id === base || p.id.startsWith(`${base}/`));
      expect(own.length, family.name).toBe(familyCounts(family).length + familyModes(family).length);
      expect(own.length, family.name).toBeGreaterThan(0);
    }
  });

  it("keeps each count in the range of its family", () => {
    for (const family of PROBE_FAMILIES) {
      const dim = family.dimensions.find((d) => d.name === "count");
      for (const count of familyCounts(family)) {
        if (dim === undefined) expect(count).toBeUndefined();
        else expect(count, family.name).toBeGreaterThanOrEqual(typeof dim.min === "number" ? dim.min : 1);
      }
    }
    expect(PROBE_COUNTS).toEqual([5, 20, 50]);
  });

  it("gives the same inputs on a second build", () => {
    expect(JSON.stringify(probes())).toBe(JSON.stringify(LIST));
  });
});

describe("readStrategy", () => {
  it("moves the probe hash of each family when one box of its input changes", () => {
    for (const family of PROBE_FAMILIES) {
      const base = `${family.name}@${family.version}`;
      const first = LIST.find((p) => p.id === base || p.id.startsWith(`${base}/`))!;
      const changed = { ...first, id: `${first.id}+1` };
      const moved = allStrategies.some(({ id }) => {
        const a = readStrategy(id, [first], plain).hashes[first.id]!;
        if (a === REFUSED_PROBE) return false;
        const b = readStrategy(id, [{ ...changed, input: widerFirst(first.input) }], plain).hashes[changed.id]!;
        return b !== a && b !== REFUSED_PROBE;
      });
      expect(moved, family.name).toBe(true);
    }
  });

  it("moves the fingerprint on a change of one position by 1e-9", () => {
    const some = LIST.slice(0, 4);
    const shift: ProbePack = (strategy, input, seed) => {
      const out: PackOutput = plain(strategy, input, seed);
      const [first, ...rest] = out.placements;
      return first === undefined ? out : { ...out, placements: [{ ...first, x: first.x + 1e-9 }, ...rest] };
    };
    expect(readStrategy("maxrects", some, shift).fingerprint).not.toBe(readStrategy("maxrects", some, plain).fingerprint);
  });

  it("keeps the fingerprint when the placements come in another order", () => {
    const some = LIST.slice(0, 4);
    const reverse: ProbePack = (strategy, input, seed) => {
      const out = plain(strategy, input, seed);
      return { ...out, placements: [...out.placements].reverse() };
    };
    expect(readStrategy("maxrects", some, reverse).fingerprint).toBe(readStrategy("maxrects", some, plain).fingerprint);
  });

  it("gives one hash to each refusal, with no reason text", () => {
    const refuse = (value: string): ProbePack => () => {
      throw new UnsupportedCell("containerSize", value);
    };
    const a = readStrategy("maxrects", LIST.slice(0, 2), refuse("freeHeight"));
    const b = readStrategy("maxrects", LIST.slice(0, 2), refuse("freeWidth"));
    expect(a.refused).toBe(2);
    expect(Object.values(a.hashes)).toEqual([REFUSED_PROBE, REFUSED_PROBE]);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("stops on an error that is not a refusal, with the id of the probe", () => {
    const fail: ProbePack = () => {
      throw new Error("a fault");
    };
    expect(() => readStrategy("maxrects", LIST.slice(0, 1), fail)).toThrow(`maxrects on the probe ${LIST[0]!.id}: a fault`);
  });
});

describe("the coverage of the probes", () => {
  it("names each strategy that refuses each probe, and no other strategy", () => {
    const some = LIST.slice(0, 3);
    const refuseAll: ProbePack = () => {
      throw new UnsupportedCell("containerSize", "fixed");
    };
    const reads = [readStrategy("maxrects", some, refuseAll), readStrategy("rows", some, plain)];
    expect(blindFindings(reads, some.length)).toEqual(["maxrects: the strategy refuses each of the 3 probes, so its fingerprint does not show a change of its output."]);
  });

  it("has probes of circles, polygons and circles in a circle", () => {
    for (const family of ["shapes-k91", "circles"]) expect(LIST.some((p) => p.family === family), family).toBe(true);
  });
});

describe("the table", () => {
  it("has a 16-hex fingerprint for each strategy of the engine", () => {
    expect(Object.keys(STRATEGY_FINGERPRINT).sort()).toEqual(allStrategies.map((s) => s.id).sort());
    for (const value of Object.values(STRATEGY_FINGERPRINT)) expect(value).toMatch(/^[0-9a-f]{16}$/);
  });

  it("names each changed, new and old strategy in the comparison", () => {
    const read = (strategy: string, fingerprint: string) => ({ strategy, hashes: {}, refused: 0, fingerprint });
    expect(compareReads({ a: "1", c: "3" }, [read("a", "2"), read("b", "4")])).toEqual([
      "a: the fingerprint changed from 1 to 2.",
      "b: the table has no fingerprint. The read gives 4.",
      "c: the table has a fingerprint, and the engine has no strategy.",
    ]);
    expect(compareReads({ a: "1", c: "3" }, [read("a", "1")], false)).toEqual([]);
  });
});
