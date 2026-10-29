import { describe, expect, it } from "vitest";
import { choiceScore, cutsAcross, mergeFree, runGuillotine } from "./guillotine.ts";
import {
  checkHard,
  generators,
  GUILLOTINE_CHOICES,
  GUILLOTINE_SPLITS,
  outputHash,
  packGuillotine,
  packWith,
  Rect,
  rectGrid,
  toPackInput,
  type GuillotineChoice,
  type GuillotineSplit,
  type PackInput,
  type PackOutput,
} from "./index.ts";
import { clearMoves, moveCount, MOVES } from "./moves.ts";

// The guillotine family of roadmap item k23: each rule to choose a free rectangle and to split it. Made-up inputs only.

const CLEAN = { "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 };

/** This function makes a box of a size. */
const box = (w: number, h: number, id = 0): Rect<number> => {
  const r = new Rect<number>();
  r.size.set(w, h);
  r.id = id;
  return r;
};

/** This function makes a locked rectangle at the top-left corner. */
const lockedAt = (w: number, h: number): Rect<number> => {
  const r = box(w, h, -1);
  r.locked = true;
  return r;
};

/** This function makes an outer rectangle with a fixed size. */
const fixedOuter = (w: number, h: number): Rect<number> => {
  const outer = new Rect<number>();
  outer.size.set(w, h);
  outer.fixedWidth = true;
  outer.fixedSize = true;
  return outer;
};

/** This function packs one box next to a locked corner rectangle, and gives its place and the count of `move.freeChoice`. */
function one(choice: GuillotineChoice, outer: [number, number], lock: [number, number], size: [number, number]): { x: number; y: number; moves: number } {
  const r = box(...size, 1);
  clearMoves();
  packGuillotine([lockedAt(...lock), r], fixedOuter(...outer), { choice, sortOrder: "input" });
  expect(r.wasPacked, choice).toBe(true);
  return { x: r.position.x, y: r.position.y, moves: moveCount(MOVES.guillotine) };
}

describe("guillotine: each choice rule on a hand case", () => {
  // The locked corner leaves two free rectangles: F1 on the right at full height, then F2 under the corner.
  // Case 1: outer 100 by 100, lock 60 by 40, box 35 by 30. F1 is 40 by 100, F2 is 60 by 60.
  // Case 2: outer 100 by 100, lock 60 by 20, box 35 by 30. F1 is 40 by 100, F2 is 60 by 80.
  // Case 3: outer 85 by 100, lock 35 by 20, box 30 by 70. F1 is 50 by 100, F2 is 35 by 80.
  const F1 = (x: number) => ({ x, y: 0 });
  const CASES = [
    { outer: [100, 100], lock: [60, 40], size: [35, 30], f1: F1(60), f2: { x: 0, y: 40 } },
    { outer: [100, 100], lock: [60, 20], size: [35, 30], f1: F1(60), f2: { x: 0, y: 20 } },
    { outer: [85, 100], lock: [35, 20], size: [30, 70], f1: F1(35), f2: { x: 0, y: 20 } },
  ] as const;
  // The free rectangle that each rule takes in the cases 1, 2 and 3. Each rule has another list.
  const WANT: Record<GuillotineChoice, readonly (1 | 2)[]> = {
    baf: [2, 1, 2],
    bssf: [1, 1, 2],
    blsf: [2, 2, 2],
    waf: [1, 2, 1],
    wssf: [2, 2, 1],
    wlsf: [1, 1, 1],
  };

  for (const choice of GUILLOTINE_CHOICES) {
    it(`${choice} takes the free rectangle of its score, and counts move.freeChoice when it is not the first`, () => {
      CASES.forEach((c, i) => {
        const got = one(choice, [...c.outer], [...c.lock], [...c.size]);
        const want = WANT[choice][i] === 1 ? c.f1 : c.f2;
        expect({ x: got.x, y: got.y }, `${choice} case ${i + 1}`).toEqual(want);
        expect(got.moves, `${choice} case ${i + 1}`).toBe(WANT[choice][i] === 1 ? 0 : 1);
      });
    });
  }

  it("gives each rule a different list of choices", () => {
    expect(new Set(Object.values(WANT).map((w) => w.join())).size).toBe(GUILLOTINE_CHOICES.length);
  });

  it("gives the scores of the source", () => {
    const f = { x0: 0, y0: 0, x1: 40, y1: 100 };
    expect(GUILLOTINE_CHOICES.map((c) => choiceScore(c, f, 35, 30))).toEqual([2950, 5, 70, -2950, -5, -70]);
  });

  it("takes a free rectangle of the exact size at once, also with a worst rule", () => {
    // Outer 80 by 100, lock 40 by 50: F1 is 40 by 100 on the right, F2 is 40 by 50 under the lock. The box is 40 by 50.
    for (const choice of GUILLOTINE_CHOICES) expect(one(choice, [80, 100], [40, 50], [40, 50]), choice).toMatchObject({ x: 0, y: 50 });
  });
});

describe("guillotine: each split rule on a hand case", () => {
  // One box goes in the corner of an empty outer rectangle. A horizontal cut (H) gives the part below the full width. A
  // vertical cut (V) gives the part on the right the full height.
  const CASES = [
    { outer: [100, 60], size: [40, 20] },
    { outer: [60, 100], size: [20, 50] },
    { outer: [100, 60], size: [90, 20] },
    { outer: [100, 60], size: [20, 50] },
  ] as const;
  const WANT: Record<GuillotineSplit, string> = { sas: "VHHV", las: "HVVH", sa: "VHVV", la: "HVHH", minas: "HVHV", maxas: "VHVH" };

  /** This function gives the free rectangles of a horizontal or a vertical cut after a box of `w` by `h` in an outer of `W` by `H`. */
  const cutOf = (across: boolean, W: number, H: number, w: number, h: number) => [
    { x: 0, y: h, w: across ? W : w, h: H - h },
    { x: w, y: 0, w: W - w, h: across ? h : H },
  ];

  for (const split of GUILLOTINE_SPLITS) {
    it(`${split} cuts as the source tells`, () => {
      CASES.forEach((c, i) => {
        const across = WANT[split][i] === "H";
        expect(cutsAcross(split, { x0: 0, y0: 0, x1: c.outer[0], y1: c.outer[1] }, c.size[0], c.size[1]), `${split} case ${i + 1}`).toBe(across);
        // The option merge keeps each part. After one cut, the two parts have no common full edge, thus no merge occurs.
        const { free } = runGuillotine([box(...c.size)], fixedOuter(...c.outer), { split, merge: true });
        expect(free, `${split} case ${i + 1}`).toEqual(cutOf(across, ...c.outer, ...c.size));
      });
    });
  }

  it("gives each rule a different list of cuts", () => {
    expect(new Set(Object.values(WANT)).size).toBe(GUILLOTINE_SPLITS.length);
  });

  it("puts a full-width box under the first box only after a horizontal cut", () => {
    for (const split of ["las", "sas"] as const) {
      const wide = box(100, 40, 2);
      runGuillotine([box(40, 20, 1), wide], fixedOuter(100, 60), { split, sortOrder: "input" });
      expect(wide.wasPacked, split).toBe(split === "las");
    }
  });
});

describe("guillotine: the merge of free rectangles", () => {
  it("joins two free rectangles with a common full edge, and keeps the others", () => {
    const free = [
      { x0: 0, y0: 20, x1: 50, y1: 40 },
      { x0: 50, y0: 20, x1: 100, y1: 40 },
      { x0: 90, y0: 0, x1: 100, y1: 20 },
      { x0: 0, y0: 40, x1: 50, y1: 60 },
    ];
    expect(mergeFree(free)).toBe(1);
    expect(free).toEqual([
      { x0: 0, y0: 20, x1: 100, y1: 40 },
      { x0: 90, y0: 0, x1: 100, y1: 20 },
      { x0: 0, y0: 40, x1: 50, y1: 60 },
    ]);
  });

  it("does not join two rectangles with a common part of an edge", () => {
    const free = [
      { x0: 0, y0: 0, x1: 50, y1: 20 },
      { x0: 50, y0: 0, x1: 100, y1: 30 },
    ];
    expect(mergeFree(free)).toBe(0);
    expect(free).toHaveLength(2);
  });

  it("makes room for a full-width box after the merge, and counts move.merge", () => {
    // Outer 100 by 40 and a lock of 50 by 20 at the corner. The box b (40 by 20) goes to the right with wssf. Its cut
    // leaves a free 50 by 20 at (50, 20). The merge joins it with the free 50 by 20 under the lock, and c fits there.
    const run = (merge: boolean) => {
      const b = box(40, 20, 1);
      const c = box(100, 20, 2);
      clearMoves();
      runGuillotine([lockedAt(50, 20), b, c], fixedOuter(100, 40), { choice: "wssf", sortOrder: "input", merge });
      return { b: { x: b.position.x, y: b.position.y }, c: c.wasPacked ? { x: c.position.x, y: c.position.y } : null, merges: moveCount(MOVES.merge) };
    };
    expect(run(true)).toEqual({ b: { x: 50, y: 0 }, c: { x: 0, y: 20 }, merges: 1 });
    expect(run(false)).toEqual({ b: { x: 50, y: 0 }, c: null, merges: 0 });
  });

  it("counts move.merge in the trace only with merge", () => {
    const input = toPackInput(rectGrid.generate(3, { containerSize: "freeHeight", containerShape: "rect", obstacles: "none", sizes: "bimodal", count: 40 }));
    const measures = (options: Record<string, unknown>): Readonly<Record<string, number>> => packWith("guillotine", input, options).trace!.at(-1)!.measures!;
    expect(Object.keys(measures({}))).toEqual(["pack.overflow", "move.freeChoice"]);
    expect(Object.keys(measures({ merge: true }))).toEqual(["pack.overflow", "move.freeChoice", "move.merge"]);
  });
});

describe("guillotine: the turn of an item", () => {
  /** This function makes an input with tall turnable items in a wide container. */
  const wide = (fixed: "size" | "height"): PackInput => ({
    container: { w: 100, h: 30, fixed },
    gap: 2,
    items: Array.from({ length: 2 }, (_, i) => ({ id: `t${i}`, w: 10, h: 40, turnable: true, margin: { top: 1, right: 2, bottom: 3, left: 4 } })),
  });

  for (const fixed of ["size", "height"] as const) {
    it(`turns tall items that do not fit upright, with a fixed ${fixed}`, () => {
      const input = wide(fixed);
      expect(packWith("guillotine", input).overflow).toHaveLength(2);
      const output = packWith("guillotine", input, { rotate: true });
      expect(output.overflow).toEqual([]);
      expect(output.placements.every((p) => p.turn === 90)).toBe(true);
      expect(checkHard(input, output, undefined, { exactContainer: true })).toEqual(CLEAN);
    });
  }

  it("does not turn an item that is not turnable", () => {
    const input: PackInput = { container: { w: 100, h: 30, fixed: "size" }, items: [{ id: "a", w: 10, h: 40 }] };
    expect(packWith("guillotine", input, { rotate: true }).overflow).toEqual(["a"]);
  });
});

describe("guillotine: the hard rules", () => {
  const SHAPES = ["rect", "holes", "circle", "polygon"] as const;
  const LAYOUTS = ["none", "scattered", "corridors", "touching"] as const;
  const VARIANTS: readonly Record<string, unknown>[] = [
    ...GUILLOTINE_CHOICES.map((choice) => ({ choice })),
    ...GUILLOTINE_SPLITS.map((split) => ({ split })),
    { choice: "bssf", merge: true },
    { choice: "wlsf", split: "maxas", merge: true, rotate: true },
  ];

  /** This function checks one packing: the hard rules on the bounding box and on the true outline, and the determinism. */
  function check(input: PackInput, options: Record<string, unknown>, label: string): PackOutput {
    const output = packWith("guillotine", input, options, 3);
    expect(checkHard(input, output), label).toEqual(CLEAN);
    expect(checkHard(input, output, undefined, { exactContainer: true }), label).toEqual(CLEAN);
    const again = packWith("guillotine", input, options, 3);
    expect(outputHash(again), label).toBe(outputHash(output));
    return output;
  }

  it("packs each variant into each shape with a fixed size and a free height, around the locked items and the obstacles", () => {
    for (const containerShape of SHAPES) {
      for (const containerSize of ["fixed", "freeHeight"] as const) {
        for (const obstacles of LAYOUTS) {
          const input = toPackInput(rectGrid.generate(2, { containerShape, containerSize, obstacles, sizes: "heavyTail", count: 16 }));
          const items = input.items.map((item, i) => (i % 3 === 0 ? { ...item, turnable: true } : item));
          if (containerShape === "rect" && obstacles === "none" && containerSize === "freeHeight") items.push({ id: "lock-a", w: 30, h: 12, x: 5, y: 40, locked: true });
          for (const options of VARIANTS) {
            const label = `${containerShape} ${containerSize} ${obstacles} ${JSON.stringify(options)}`;
            const output = check({ ...input, items }, options, label);
            if (containerSize === "freeHeight") expect(output.overflow, label).toEqual([]);
          }
        }
      }
    }
  }, 60_000);

  it("packs each variant with a free width, aspect and area", () => {
    for (const containerSize of ["freeWidth", "freeAspect", "freeArea"] as const) {
      const input = toPackInput(rectGrid.generate(4, { containerShape: "rect", containerSize, obstacles: "scattered", sizes: "uniform", count: 16 }));
      for (const options of VARIANTS) check(input, options, `${containerSize} ${JSON.stringify(options)}`);
    }
  }, 30_000);

  it("packs random sets with no hard break", () => {
    let seed = 11;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let n = 0; n < 30; n++) {
      const items = Array.from({ length: 2 + Math.floor(rand() * 20) }, (_, i) => ({ id: `r${i}`, w: 1 + Math.floor(rand() * 40), h: 1 + Math.floor(rand() * 40), turnable: rand() < 0.3 }));
      const fixed = rand() < 0.5;
      const input: PackInput = { container: fixed ? { w: 80, h: 80, fixed: "size" } : { w: 80, fixed: "width" }, gap: n % 3, items };
      const options = { choice: GUILLOTINE_CHOICES[n % 6], split: GUILLOTINE_SPLITS[(n * 5) % 6], merge: n % 2 === 0, rotate: n % 4 < 2 };
      const output = check(input, options, `random ${n} ${JSON.stringify(options)}`);
      if (!fixed) expect(output.overflow, `random ${n}`).toEqual([]);
    }
  }, 30_000);

  it("packs an input of each generator with no hard break", () => {
    for (const gen of generators) {
      let params: Record<string, unknown> = "count" in gen.defaults ? { count: 12 } : {};
      try {
        gen.withDefaults(params);
      } catch {
        params = {};
      }
      const input = toPackInput(gen.generate(1, params));
      for (const options of [{}, { choice: "bssf", merge: true }]) check(input, options, `${gen.name} ${JSON.stringify(options)}`);
    }
  }, 30_000);

  it("gives the output of the defaults with the default values of the options", () => {
    const input = toPackInput(rectGrid.generate(2, { containerSize: "freeHeight", containerShape: "holes", obstacles: "scattered", sizes: "uniform", count: 24 }));
    expect(outputHash(packWith("guillotine", input, { choice: "baf", split: "sas", merge: false, rotate: false }))).toBe(outputHash(packWith("guillotine", input)));
  });

  it("throws a RangeError for an unknown choice or split", () => {
    const input: PackInput = { container: { w: 20, fixed: "width" }, items: [{ id: "a", w: 5, h: 5 }] };
    expect(() => packWith("guillotine", input, { choice: "bl" })).toThrow(RangeError);
    expect(() => packWith("guillotine", input, { split: "half" })).toThrow(RangeError);
  });
});
