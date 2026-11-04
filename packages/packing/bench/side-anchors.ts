// The bench of roadmap item k110: the height cost of side anchors, against the same items with no anchors and against a plain band.
// It is a separate program. A height is not a time, so any computer can start it.
//
//   node bench/side-anchors.ts --out <file.json> [--seeds 30] [--count 40] [--anchors 4]

import fs from "node:fs";
import { stepRandom } from "@mark1russell7/layout-contract";
import { checkHard, checkSideAnchors, packSideAnchors, packWith, type Item, type PackInput, type SideAnchor } from "@mark1russell7/packing";
import { mean, median } from "@mark1russell7/rigor-statistics";

/** The strip width of the made-up family. */
const WIDTH = 200;

/** The height of the strip that tests a set of anchors. It is much taller than a layout of the bench. */
const TALL = 10000;

/** One input of the bench. */
export interface AnchorCase {
  readonly input: PackInput;
  readonly anchors: readonly SideAnchor[];
}

/** One seed of the bench. */
export interface AnchorRow {
  readonly seed: number;
  readonly plain: number;
  /** The least whole height from `plain` at which the anchors alone have no overlap. The input forces this height. */
  readonly forced: number;
  readonly anchored: number;
  readonly band: number;
  readonly bandBreaks: number;
  readonly packs: number;
  readonly breaks: number;
}

/** This function gives a made-up strip input with its anchors. Half of the anchors have a fraction, and half have an offset. */
export function anchorCase(seed: number, count: number, anchorCount: number): AnchorCase {
  const r = stepRandom(seed, "side-anchors-k110");
  const items = Array.from({ length: count }, (_, i): Item => ({ id: `i${i}`, w: 8 + Math.floor(r() * 40), h: 8 + Math.floor(r() * 40) }));
  const sides = ["top", "bottom", "left", "right"] as const;
  const draw = (): SideAnchor[] =>
    Array.from({ length: anchorCount }, (_, i): SideAnchor => {
      const side = sides[Math.floor(r() * sides.length)]!;
      const id = `i${i}`;
      const across = side === "top" || side === "bottom";
      return i % 2 === 0 ? { id, side, at: r() } : { id, side, offset: Math.floor(r() * (across ? WIDTH / 2 : 40)) };
    });
  // Two anchors with one place at each height have no layout. The stream draws again until a tall strip separates the anchors.
  const tall: PackInput = { container: { w: WIDTH, h: TALL, fixed: "size" }, items: items.slice(0, anchorCount) };
  let anchors = draw();
  while (!packSideAnchors(tall, anchors).good) anchors = draw();
  return { input: { container: { w: WIDTH, fixed: "width" }, items }, anchors };
}

/** This function gives the height of the plain band. The other items pack in the inner rectangle. Each side keeps a band for its anchors. */
export function bandHeight(testCase: AnchorCase): { height: number; breaks: number } {
  const { input, anchors } = testCase;
  const band = (side: SideAnchor["side"], read: (item: Item) => number): number =>
    Math.max(0, ...anchors.filter((a) => a.side === side).map((a) => read(input.items.find((i) => i.id === a.id)!)));
  const [left, right, top, bottom] = [band("left", (i) => i.w), band("right", (i) => i.w), band("top", (i) => i.h), band("bottom", (i) => i.h)];
  const ids = new Set(anchors.map((a) => a.id));
  const rest: PackInput = { container: { w: input.container.w! - left - right, fixed: "width" }, items: input.items.filter((i) => !ids.has(i.id)) };
  const output = packWith("maxrects", rest, { rule: "bl" }, 0);
  const height = top + output.size.h + bottom;
  const atHeight = packSideAnchors({ ...input, items: input.items.filter((i) => ids.has(i.id)), container: { w: input.container.w!, h: height, fixed: "size" } }, anchors);
  return { height, breaks: atHeight.good ? 0 : 1 };
}

/** This function gives the least whole height from `from` at which the anchors alone have no overlap. */
export function forcedHeight(testCase: AnchorCase, from: number): number {
  const { input, anchors } = testCase;
  const ids = new Set(anchors.map((a) => a.id));
  const items = input.items.filter((i) => ids.has(i.id));
  let h = Math.ceil(from);
  while (h < TALL && !packSideAnchors({ ...input, items, container: { w: input.container.w!, h, fixed: "size" } }, anchors).good) h += 1;
  return h;
}

/** This function gives the row of one seed. */
export function anchorRow(seed: number, count: number, anchorCount: number): AnchorRow {
  const testCase = anchorCase(seed, count, anchorCount);
  const { input, anchors } = testCase;
  const plain = packWith("maxrects", input, { rule: "bl" }, 0).size.h;
  const result = packSideAnchors(input, anchors);
  const band = bandHeight(testCase);
  const hard = Object.values(checkHard(input, result.output)).reduce((sum, value) => sum + value, 0);
  return {
    seed,
    plain,
    forced: forcedHeight(testCase, plain),
    anchored: result.output.size.h,
    band: band.height,
    bandBreaks: band.breaks,
    packs: result.packs,
    breaks: hard + checkSideAnchors(input, result.output, anchors) + (result.good ? 0 : 1),
  };
}

/** This function gives the value of a flag. */
function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function main(args: readonly string[]): void {
  const out = flag(args, "--out");
  if (out === undefined) throw new Error("Give --out <file>.");
  const seeds = Number(flag(args, "--seeds") ?? 30);
  const count = Number(flag(args, "--count") ?? 40);
  const anchorCount = Number(flag(args, "--anchors") ?? 4);
  const rows = Array.from({ length: seeds }, (_, i) => anchorRow(i + 1, count, anchorCount));
  const report = {
    seeds,
    count,
    anchors: anchorCount,
    meanCost: mean(rows.map((r) => r.anchored / r.plain)),
    worstCost: Math.max(...rows.map((r) => r.anchored / r.plain)),
    medianCost: median(rows.map((r) => r.anchored / r.plain)),
    forced: rows.filter((r) => r.forced > r.plain).length,
    meanCostOverForced: mean(rows.map((r) => r.anchored / Math.max(r.plain, r.forced))),
    worstCostOverForced: Math.max(...rows.map((r) => r.anchored / Math.max(r.plain, r.forced))),
    beatsBand: rows.filter((r) => r.anchored < r.band).length / seeds,
    bandBreaks: rows.reduce((sum, r) => sum + r.bandBreaks, 0),
    medianPacks: median(rows.map((r) => r.packs)),
    maxPacks: Math.max(...rows.map((r) => r.packs)),
    breaks: rows.reduce((sum, r) => sum + r.breaks, 0),
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ ...report, rows: undefined }));
}

if (process.argv[1]?.endsWith("side-anchors.ts")) main(process.argv.slice(2));
