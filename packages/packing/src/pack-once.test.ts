import { describe, expect, it } from "vitest";
import { compareRects, mulberry32, pack, packRows, Rect, SORT_ORDERS, type SortOrder } from "./index.ts";
import { clearMoves, countMove, moveCount, MOVES } from "./moves.ts";
import type { Vector } from "./vector.ts";

// A copy of the row packing of 0.2.16: the reference for the row packing with one try and the early stop of a gap fill
let oldDepth = 0;

function oldPackInto<T>(byOrder: Rect<T>[], region: Rect<T>, offset: Vector, order: SortOrder): void {
  const unpacked = Rect.unpacked(byOrder);
  oldDepth++;
  try {
    oldPackSortedRows(unpacked, region, order);
  } finally {
    oldDepth--;
  }
  const placed = Rect.packed(unpacked);
  if (oldDepth === 0) countMove(MOVES.rows, placed.length);
  for (const r of placed) r.translateBy(offset);
}

function oldPackRow<T>(byOrder: Rect<T>[], outer: Rect<T>, order: SortOrder): boolean {
  const row: Rect<T>[] = [];
  const fillGaps = order !== "input";
  const rowRect = new Rect<T>();
  rowRect.size.set(outer.size.x, 0);
  for (const rect of byOrder) {
    if (rect.wasPacked) continue;
    if (rect.size.x > rowRect.size.x) {
      if (outer.fixedSize && rect.size.x > outer.size.x) continue;
      const outerLeft = new Rect<T>();
      outerLeft.position.setTo(rowRect.position);
      outerLeft.size.set(outer.size.x - rowRect.position.x, rowRect.size.y);
      outerLeft.fixedSize = true;
      if (fillGaps) oldPackInto(byOrder, outerLeft, outer.position, order);
      rowRect.position.set(0, rowRect.bottom());
      rowRect.size.set(outer.size.x, 0);
      row.length = 0;
    }
    if (rowRect.position.y + rect.size.y > outer.size.y) {
      if (outer.fixedSize) continue;
      outer.size.y += rect.size.y;
      if (!outer.fixedWidth && !outer.size.x) outer.size.x = rect.size.x;
      Rect.resetPacked(byOrder);
      return false;
    }
    row.push(rect);
    rect.position.setTo(rowRect.position.add(outer.position));
    rowRect.shrinkLeft(rect.size.x);
    rect.wasPacked = true;
    if (rect.size.y > rowRect.size.y) rowRect.size.y = rect.size.y;
    if (fillGaps && row.length > 1) {
      const rectInRow = row[row.length - 1]!;
      const outerLeft = new Rect<T>();
      outerLeft.position.set(rectInRow.position.x - outer.position.x, rectInRow.bottom() - outer.position.y);
      outerLeft.size.set(rectInRow.size.x, rowRect.size.y - rectInRow.size.y);
      outerLeft.fixedWidth = true;
      outerLeft.fixedSize = true;
      oldPackInto(byOrder, outerLeft, outer.position, order);
    }
  }
  return true;
}

function oldPackSortedRows<T>(byOrder: Rect<T>[], outer: Rect<T>, order: SortOrder): void {
  for (const r of byOrder) if (r.locked) r.wasPacked = true;
  while (!oldPackRow(byOrder, outer, order)) if (oldDepth === 0) clearMoves(MOVES.rows);
}

function oldPackRows<T>(rects: Rect<T>[], outer: Rect<T>, order: SortOrder): void {
  oldPackSortedRows(rects.toSorted(compareRects(order)), outer, order);
}

/** The kind of outer rectangle of a case */
type OuterKind = "free" | "freeWithWidth" | "fixedWidth" | "fixedSize";

interface Case {
  rects: Rect<number>[];
  outer: Rect<number>;
}

/** This function makes a case from a seed: sizes, zero sizes, locked rectangles and rectangles that are placed already. */
function makeCase(seed: number, kind: OuterKind): Case {
  const random = mulberry32(seed);
  const n = Math.floor(random() * 40);
  const whole = random() < 0.5;
  const size = (max: number): number => (whole ? 1 + Math.floor(random() * max) : 0.5 + random() * max);
  const rects: Rect<number>[] = [];
  let widest = 0;
  for (let i = 0; i < n; i++) {
    const r = new Rect<number>();
    r.id = i;
    const shape = random();
    r.size.set(shape < 0.05 ? 0 : size(30), shape > 0.95 ? 0 : size(30));
    if (random() < 0.3 && i > 0) r.size.setTo(rects[i - 1]!.size);
    if (random() < 0.08) {
      r.locked = true;
      r.position.set(Math.floor(random() * 50), Math.floor(random() * 50));
    } else if (random() < 0.04) r.wasPacked = true;
    widest = Math.max(widest, r.size.x);
    rects.push(r);
  }
  const outer = new Rect<number>();
  outer.position.set(Math.floor(random() * 5), Math.floor(random() * 5));
  const width = widest + Math.floor(random() * 120);
  if (kind === "freeWithWidth") outer.size.set(width, 0);
  if (kind === "fixedWidth") {
    outer.size.set(width, random() * 40);
    outer.fixedWidth = true;
  }
  if (kind === "fixedSize") {
    outer.size.set(width, 10 + random() * 150);
    outer.fixedSize = true;
  }
  return { rects, outer };
}

function copyCase(c: Case): Case {
  const rects = c.rects.map((r) => {
    const copy = new Rect<number>();
    copy.id = r.id;
    copy.size.setTo(r.size);
    copy.position.setTo(r.position);
    copy.locked = r.locked;
    copy.wasPacked = r.wasPacked;
    return copy;
  });
  const outer = new Rect<number>();
  outer.position.setTo(c.outer.position);
  outer.size.setTo(c.outer.size);
  outer.fixedWidth = c.outer.fixedWidth;
  outer.fixedSize = c.outer.fixedSize;
  return { rects, outer };
}

/** This function gives the state of a case after a packing: each rectangle, the outer size and the move count. */
function stateOf(c: Case): unknown {
  return {
    rects: c.rects.map((r) => [r.id, r.position.x, r.position.y, r.size.x, r.size.y, r.wasPacked]),
    outer: [c.outer.size.x, c.outer.size.y],
    moves: moveCount(MOVES.rows),
  };
}

const KINDS: OuterKind[] = ["free", "freeWithWidth", "fixedWidth", "fixedSize"];

describe("the row packing with one try and the early stop of a gap fill", () => {
  it("gives the state of the row packing of 0.2.16 for each kind of outer rectangle and each sort order", () => {
    let cases = 0;
    for (const kind of KINDS) {
      for (const order of SORT_ORDERS) {
        for (let seed = 1; seed <= 60; seed++) {
          const base = makeCase(seed * 7919 + KINDS.indexOf(kind), kind);
          // A count before the call checks that a new try clears it, as before
          const old = copyCase(base);
          clearMoves();
          countMove(MOVES.rows, 3);
          oldPackRows(old.rects, old.outer, order);
          const want = stateOf(old);
          const now = copyCase(base);
          clearMoves();
          countMove(MOVES.rows, 3);
          packRows(now.rects, now.outer, { sortOrder: order });
          expect(stateOf(now), `${kind} ${order} ${seed}`).toEqual(want);
          cases++;
        }
      }
    }
    expect(cases).toBe(KINDS.length * SORT_ORDERS.length * 60);
  });

  it("gives the same layout through pack with a fixed width, as each width of packFree", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const base = makeCase(seed * 104729, "fixedWidth");
      const old = copyCase(base);
      clearMoves();
      // pack sets the height of a fixed width to the larger of the width and the lowest height, then packs the rows
      const minY = old.rects.length > 0 ? Math.min(...old.rects.map((r) => r.size.y)) : 0;
      old.outer.size.y = Math.max(old.outer.size.x, minY);
      oldPackRows(old.rects, old.outer, "height-desc");
      old.outer.size.y = Rect.maxBottom(old.rects);
      const want = stateOf(old);
      const now = copyCase(base);
      clearMoves();
      pack(now.rects, now.outer);
      expect(stateOf(now), `seed ${seed}`).toEqual(want);
    }
  });

  it("gives the old state when a size is less than 0 or not a number", () => {
    for (const bad of [-3, Number.NaN]) {
      for (let seed = 1; seed <= 20; seed++) {
        const base = makeCase(seed * 31, "fixedSize");
        if (base.rects.length > 0) base.rects[0]!.size.y = bad;
        const old = copyCase(base);
        clearMoves();
        oldPackRows(old.rects, old.outer, "height-desc");
        const want = stateOf(old);
        const now = copyCase(base);
        clearMoves();
        packRows(now.rects, now.outer);
        expect(stateOf(now), `${bad} ${seed}`).toEqual(want);
      }
    }
  });
});
