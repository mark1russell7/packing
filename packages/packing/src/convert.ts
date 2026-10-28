import type { Item, PackInput, PackOutput } from "./contract.ts";
import type { Rect } from "./rect.ts";

/**
 * This function makes a `PackInput` from the `Rect` objects of 0.1. The id of each item is the index of its rectangle.
 *
 * - `fixedSize` gives `fixed` set to `size`, `fixedWidth` gives `width`, and an outer rectangle without them gives `none`.
 * - A locked rectangle gives a locked item at its position.
 * - An outer rectangle at a position other than 0, 0 gives a rectangle shape at that position.
 */
export function fromRects<T>(rects: readonly Rect<T>[], outer: Rect<T>): PackInput {
  const fixed = outer.fixedSize ? "size" : outer.fixedWidth ? "width" : "none";
  const container: PackInput["container"] = {
    fixed,
    ...(fixed === "none" ? {} : { w: outer.size.x }),
    ...(fixed === "size" ? { h: outer.size.y } : {}),
    ...(outer.position.x !== 0 || outer.position.y !== 0
      ? { shape: { kind: "rect", x: outer.position.x, y: outer.position.y, w: outer.size.x, h: outer.size.y } as const }
      : {}),
  };
  const items = rects.map(
    (r, i): Item => ({ id: String(i), w: r.size.x, h: r.size.y, ...(r.locked ? { locked: true, x: r.position.x, y: r.position.y } : {}) }),
  );
  return { container, items };
}

/**
 * This function writes an output back into the `Rect` objects of `fromRects`. It sets the position and `wasPacked` of
 * each rectangle, and the free sides of the outer rectangle. It gives the outer rectangle.
 */
export function toRects<T>(output: PackOutput, rects: Rect<T>[], outer: Rect<T>): Rect<T> {
  const placements = new Map(output.placements.map((p) => [p.id, p]));
  for (const [i, r] of rects.entries()) {
    const p = placements.get(String(i));
    if (p === undefined) {
      r.wasPacked = r.locked;
      continue;
    }
    r.position.set(p.x, p.y);
    r.wasPacked = true;
  }
  if (!outer.fixedSize) {
    if (!outer.fixedWidth) outer.size.x = output.size.w;
    outer.size.y = output.size.h;
  }
  return outer;
}
